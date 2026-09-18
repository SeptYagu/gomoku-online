import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeedbackStore,
  formatUtcTimestamp,
  MAX_FEEDBACK_MESSAGE_LENGTH
} from "./feedback-store";

describe("FeedbackStore", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "gomoku-feedback-test-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { force: true, recursive: true });
    }
  });

  describe("formatUtcTimestamp", () => {
    it("formats epoch ms to YYYYMMDD-HHmmss in UTC", () => {
      // 2026-09-18T07:05:30.000Z
      const date = new Date(Date.UTC(2026, 8, 18, 7, 5, 30));
      expect(formatUtcTimestamp(date.getTime())).toBe("20260918-070530");
    });
  });

  describe("saveFeedback", () => {
    it("saves feedback into a single flat file named ${timestamp}-${feedbackId}.json without subdirectories", () => {
      const fixedTime = Date.UTC(2026, 8, 18, 12, 30, 45);
      const store = new FeedbackStore({
        dirPath: testDir,
        generateId: () => "fb_test123",
        now: () => fixedTime
      });

      const result = store.saveFeedback({
        appVersion: "v1.0.0",
        clientAddress: "127.0.0.1",
        email: "player@example.com",
        locale: "zh",
        message: "测试反馈内容：落子流畅！",
        userAgent: "TestAgent/1.0"
      });

      expect(result.feedbackId).toBe("fb_test123");
      expect(result.receivedAt).toBe(new Date(fixedTime).toISOString());
      expect(result.message).toBe("测试反馈内容：落子流畅！");
      expect(result.email).toBe("player@example.com");

      // Verify files in testDir
      const files = readdirSync(testDir);
      expect(files).toEqual(["20260918-123045-fb_test123.json"]);

      // Verify content
      const savedContent = JSON.parse(readFileSync(join(testDir, files[0]), "utf8"));
      expect(savedContent).toEqual({
        appVersion: "v1.0.0",
        clientAddress: "127.0.0.1",
        email: "player@example.com",
        feedbackId: "fb_test123",
        locale: "zh",
        message: "测试反馈内容：落子流畅！",
        receivedAt: "2026-09-18T12:30:45.000Z",
        timestamp: fixedTime,
        userAgent: "TestAgent/1.0"
      });
    });

    it("saves feedback without email as null", () => {
      const store = new FeedbackStore({ dirPath: testDir });
      const result = store.saveFeedback({
        message: "匿名纯文本反馈"
      });

      expect(result.email).toBeNull();

      const files = readdirSync(testDir);
      expect(files.length).toBe(1);
      const saved = JSON.parse(readFileSync(join(testDir, files[0]), "utf8"));
      expect(saved.email).toBeNull();
      expect(saved.message).toBe("匿名纯文本反馈");
    });

    it("leaves no leftover .tmp- files after successful save", () => {
      const store = new FeedbackStore({ dirPath: testDir });
      store.saveFeedback({ message: "Atomic write test" });

      const files = readdirSync(testDir);
      const tempFiles = files.filter((file) => file.startsWith(".tmp-"));
      expect(tempFiles).toHaveLength(0);
      expect(files.filter((file) => file.endsWith(".json"))).toHaveLength(1);
    });

    it("rejects empty or whitespace-only messages", () => {
      const store = new FeedbackStore({ dirPath: testDir });

      expect(() => store.saveFeedback({ message: "" })).toThrow("Feedback message cannot be empty.");
      expect(() => store.saveFeedback({ message: "   \n  \t  " })).toThrow("Feedback message cannot be empty.");
    });

    it("rejects messages exceeding MAX_FEEDBACK_MESSAGE_LENGTH", () => {
      const store = new FeedbackStore({ dirPath: testDir });
      const oversized = "a".repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 1);

      expect(() => store.saveFeedback({ message: oversized })).toThrow(
        `Feedback message cannot exceed ${MAX_FEEDBACK_MESSAGE_LENGTH} characters.`
      );
    });

    it("rejects invalid email formats", () => {
      const store = new FeedbackStore({ dirPath: testDir });

      expect(() => store.saveFeedback({ email: "invalid-email-without-at", message: "Hello" })).toThrow(
        "Invalid email format."
      );
      expect(() => store.saveFeedback({ email: "a".repeat(255) + "@test.com", message: "Hello" })).toThrow(
        "Invalid email format."
      );
    });
  });

  describe("listFeedbacks", () => {
    it("lists stored feedbacks sorted in chronological filename order and safely skips corrupt files", () => {
      const store = new FeedbackStore({ dirPath: testDir });

      // Write three valid files with different timestamps
      writeFileSync(
        join(testDir, "20260918-100000-fb_1.json"),
        JSON.stringify({ feedbackId: "fb_1", message: "First message" })
      );
      writeFileSync(
        join(testDir, "20260918-120000-fb_2.json"),
        JSON.stringify({ feedbackId: "fb_2", message: "Second message" })
      );
      writeFileSync(
        join(testDir, "20260918-140000-fb_3.json"),
        JSON.stringify({ feedbackId: "fb_3", message: "Third message" })
      );

      // Write a corrupt file and a temporary file
      writeFileSync(join(testDir, "20260918-110000-fb_bad.json"), "{ invalid json");
      writeFileSync(join(testDir, ".tmp-20260918-130000-fb_tmp.json"), "{}");

      const feedbacks = store.listFeedbacks();
      expect(feedbacks).toHaveLength(3);
      expect(feedbacks.map((item) => item.feedbackId)).toEqual(["fb_1", "fb_2", "fb_3"]);
      expect(feedbacks.map((item) => item.message)).toEqual([
        "First message",
        "Second message",
        "Third message"
      ]);
    });
  });
});
