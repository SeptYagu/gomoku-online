import { createServer, type Server } from "node:http";
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
