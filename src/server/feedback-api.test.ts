import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleFeedbackApi, MAX_FEEDBACK_BODY_BYTES } from "./feedback-api";
import { FeedbackStore } from "./feedback-store";
import { FixedWindowRateLimiter } from "./rate-limit";

describe("feedback-api", () => {
  let testDir: string;
  let testStore: FeedbackStore;
  let server: Server;
  let serverUrl: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "gomoku-feedback-api-test-"));
    testStore = new FeedbackStore({ dirPath: testDir });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { force: true, recursive: true });
    }
  });

  function startServer(limiter?: FixedWindowRateLimiter): Promise<string> {
    const activeLimiter = limiter ?? new FixedWindowRateLimiter({ limit: 100, windowMs: 60 * 1000 });
    return new Promise((resolve) => {
      server = createServer((req, res) => {
        const handled = handleFeedbackApi(req, res, {
          feedbackStore: testStore,
          limiter: activeLimiter,
          trustProxy: false
        });

        if (!handled) {
          res.writeHead(404);
          res.end("Not found");
        }
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverUrl = `http://127.0.0.1:${addr.port}`;
          resolve(serverUrl);
        }
      });
    });
  }

  it("returns 201 on valid submission and persists to store", async () => {
    const url = await startServer();

    const response = await fetch(`${url}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Great game experience!",
        email: "player@example.com",
        locale: "zh"
      })
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.feedbackId).toMatch(/^fb_/);
    expect(data.receivedAt).toBeDefined();

    const stored = testStore.listFeedbacks();
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe("Great game experience!");
    expect(stored[0].email).toBe("player@example.com");
    expect(stored[0].locale).toBe("zh");
  });

  it("ignores non-matching paths and returns false", async () => {
    const url = await startServer();

    const response = await fetch(`${url}/api/rooms`, {
      method: "GET"
    });

    expect(response.status).toBe(404);
  });

  it("returns 405 on non-POST requests", async () => {
    const url = await startServer();

    const response = await fetch(`${url}/api/feedback`, {
      method: "GET"
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  describe("P1-1: Rate limiting enforcement", () => {
    it("returns 429 with retry-after header once limit is exhausted (verifying !rateLimit.allowed)", async () => {
      const limiter = new FixedWindowRateLimiter({
        limit: 3,
        windowMs: 60 * 1000
      });
      const url = await startServer(limiter);

      // First 3 requests must succeed with 201
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${url}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Message ${i + 1}` })
        });
        expect(res.status).toBe(201);
      }

      // 4th request must be rate limited with 429
      const res4 = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Message 4" })
      });

      expect(res4.status).toBe(429);
      const data4 = await res4.json();
      expect(data4.error).toBe("Too many feedback submissions. Please try again later.");
      expect(res4.headers.get("retry-after")).toBeDefined();
      expect(Number(res4.headers.get("retry-after"))).toBeGreaterThan(0);

      // 5th request also 429
      const res5 = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Message 5" })
      });
      expect(res5.status).toBe(429);

      // Only the first 3 files were saved to disk
      const stored = testStore.listFeedbacks();
      expect(stored).toHaveLength(3);
    });
  });

  describe("P2-1 & P3-3: 64 KiB Body limit enforcement and byte measurement", () => {
    it("returns 413 Payload Too Large when ASCII body exceeds 64 KiB", async () => {
      const url = await startServer();

      // Create an oversized body (> 64 KiB = 65536 bytes)
      const oversized = "a".repeat(MAX_FEEDBACK_BODY_BYTES + 100);
      const body = JSON.stringify({ message: oversized });

      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      expect(response.status).toBe(413);
      const data = await response.json();
      expect(data.error).toBe("Payload too large");
    });

    it("returns 413 Payload Too Large when multi-byte UTF-8 body exceeds 64 KiB in bytes (even if UTF-16 code units < 64K)", async () => {
      const url = await startServer();

      // 22000 CJK characters = 22000 UTF-16 code units, but 66000 UTF-8 bytes (> 64 KiB)
      const cjkChars = "测".repeat(22000);
      const body = JSON.stringify({ message: cjkChars });

      expect(body.length).toBeLessThan(MAX_FEEDBACK_BODY_BYTES); // code units < 65536
      expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(MAX_FEEDBACK_BODY_BYTES); // bytes > 65536

      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      expect(response.status).toBe(413);
      const data = await response.json();
      expect(data.error).toBe("Payload too large");
    });

    it("distinguishes exact 64 KiB boundary: 65536 bytes goes to field validation, 65537 returns 413", async () => {
      const url = await startServer();

      // prefix '{"message":"' is 12 bytes, suffix '"}' is 2 bytes => 14 bytes overhead
      // For exactly 65536 bytes: pad with 65536 - 14 = 65522 ASCII characters
      const exact64kBody = `{"message":"${"a".repeat(65522)}"}`;
      expect(Buffer.byteLength(exact64kBody, "utf8")).toBe(65536);

      const res64k = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: exact64kBody
      });
      // 65536 bytes passes body size limit, but triggers field validation (message > 5000 chars) -> 400
      expect(res64k.status).toBe(400);
      const data64k = await res64k.json();
      expect(data64k.error).toBe("Feedback message cannot exceed 5000 characters.");

      // For 65537 bytes: pad with 65523 characters
      const over64kBody = `{"message":"${"a".repeat(65523)}"}`;
      expect(Buffer.byteLength(over64kBody, "utf8")).toBe(65537);

      const resOver = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: over64kBody
      });
      expect(resOver.status).toBe(413);
      const dataOver = await resOver.json();
      expect(dataOver.error).toBe("Payload too large");
    });

    it("returns 413 Payload Too Large when body is 1 MiB without connection reset", async () => {
      const url = await startServer();

      const body = JSON.stringify({ message: "a".repeat(1024 * 1024 + 100) });
      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      expect(response.status).toBe(413);
      const data = await response.json();
      expect(data.error).toBe("Payload too large");
    });

    it("returns 413 Payload Too Large when body is 10 MiB without connection reset", async () => {
      const url = await startServer();

      const body = JSON.stringify({ message: "a".repeat(10 * 1024 * 1024) });
      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      expect(response.status).toBe(413);
      const data = await response.json();
      expect(data.error).toBe("Payload too large");
    });

    it("returns 413 on continuous raw socket stream of 1 MiB in 256 KiB chunks", async () => {
      const url = await startServer();
      const port = Number(new URL(url).port);

      const chunkSize = 256 * 1024;
      const totalChunks = 4; // 1 MiB total
      const chunk = Buffer.alloc(chunkSize, "x");

      const bodyPrefix = '{"message":"';
      const bodySuffix = '"}';
      const bodyLength = Buffer.byteLength(bodyPrefix) + chunkSize * totalChunks + Buffer.byteLength(bodySuffix);

      const responseText = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => {
          const header = `POST /api/feedback HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${bodyLength}\r\nConnection: close\r\n\r\n`;
          socket.write(header);
          socket.write(bodyPrefix);
          for (let i = 0; i < totalChunks; i++) {
            socket.write(chunk);
          }
          socket.write(bodySuffix);
          socket.end();
        });

        let data = "";
        socket.on("data", (d) => {
          data += d.toString("utf8");
        });
        socket.on("end", () => resolve(data));
        socket.on("error", reject);
      });

      expect(responseText).toMatch(/^HTTP\/1\.1 413/);
      expect(responseText).toContain("Payload too large");
    });
  });

  describe("P2-2: Multi-byte UTF-8 chunk boundary handling", () => {
    it("preserves multibyte UTF-8 characters split across TCP chunks without U+FFFD corruption", async () => {
      const url = await startServer();
      const port = Number(new URL(url).port);

      // Character "测" is encoded in UTF-8 as 3 bytes: 0xE6, 0xB5, 0x8B
      const repeatedCjk = "测".repeat(100);
      const jsonPrefix = Buffer.from('{"message":"' + "测".repeat(10));
      const splitCharByte1 = Buffer.from([0xe6]);
      const splitCharBytes23 = Buffer.from([0xb5, 0x8b]);
      const jsonSuffix = Buffer.from("测".repeat(89) + '"}');

      const totalBody = Buffer.concat([jsonPrefix, splitCharByte1, splitCharBytes23, jsonSuffix]);
      const totalLength = totalBody.length;

      const responseText = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => {
          const header = `POST /api/feedback HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${totalLength}\r\nConnection: close\r\n\r\n`;
          socket.write(header);
          // Chunk 1 ends right after the first byte of the 11th "测"
          socket.write(Buffer.concat([jsonPrefix, splitCharByte1]));

          // Brief delay to ensure TCP chunk boundary arrives separately
          setTimeout(() => {
            // Chunk 2 starts with remaining 2 bytes of the 11th "测"
            socket.write(Buffer.concat([splitCharBytes23, jsonSuffix]));
            socket.end();
          }, 50);
        });

        let data = "";
        socket.on("data", (d) => {
          data += d.toString("utf8");
        });
        socket.on("end", () => resolve(data));
        socket.on("error", reject);
      });

      expect(responseText).toMatch(/^HTTP\/1\.1 201/);

      const stored = testStore.listFeedbacks();
      expect(stored).toHaveLength(1);
      expect(stored[0].message).toBe(repeatedCjk);
      expect(stored[0].message.length).toBe(100);
      expect(stored[0].message).not.toContain("\uFFFD");
    });
  });

  describe("P3-4: Locale validation and whitelist normalization", () => {
    it("normalizes unsupported or malicious locale to 'unknown'", async () => {
      const url = await startServer();

      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Valid feedback message",
          locale: "X".repeat(3000) + "<script>alert(1)</script>"
        })
      });

      expect(response.status).toBe(201);
      const stored = testStore.listFeedbacks();
      expect(stored).toHaveLength(1);
      expect(stored[0].locale).toBe("unknown");
    });

    it("preserves valid locales", async () => {
      const url = await startServer();

      for (const loc of ["en", "zh", "fr", "es", "ru", "ar"]) {
        const response = await fetch(`${url}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Feedback for ${loc}`,
            locale: loc
          })
        });
        expect(response.status).toBe(201);
      }

      const stored = testStore.listFeedbacks();
      expect(stored.map((s) => s.locale).sort()).toEqual(["ar", "en", "es", "fr", "ru", "zh"]);
    });
  });

  describe("Input validation", () => {
    it("rejects empty message with 400", async () => {
      const url = await startServer();

      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "   \n  " })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Feedback message cannot be empty.");
    });

    it("rejects invalid email format with 400", async () => {
      const url = await startServer();

      const response = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Valid message",
          email: "not-an-email"
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid email format.");
    });
  });
});
