import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isLocale } from "@/i18n/config";

export const MAX_FEEDBACK_MESSAGE_LENGTH = 5000;
export const MAX_FEEDBACK_EMAIL_LENGTH = 254;

export type FeedbackSubmission = {
  appVersion?: string;
  clientAddress?: string;
  email?: null | string;
  locale?: string;
  message: string;
  userAgent?: string;
};

export type StoredFeedback = {
  appVersion: string;
  clientAddress?: string;
  email: null | string;
  feedbackId: string;
  locale: string;
  message: string;
  receivedAt: string;
  timestamp: number;
  userAgent?: string;
};

export type FeedbackStoreOptions = {
  dirPath?: string;
  generateId?: () => string;
  now?: () => number;
};

export class FeedbackStore {
  readonly dirPath: string;
  private readonly now: () => number;
  private readonly generateId: () => string;

  constructor(options: FeedbackStoreOptions = {}) {
    this.dirPath = options.dirPath ?? process.env.GOMOKU_FEEDBACK_DIR ?? "data/feedback";
    this.now = options.now ?? (() => Date.now());
    this.generateId = options.generateId ?? (() => `fb_${randomBytes(6).toString("base64url")}`);

    this.ensureDirectory();
  }

  saveFeedback(input: FeedbackSubmission): StoredFeedback {
    const trimmedMessage = input.message?.trim() ?? "";

    if (!trimmedMessage) {
      throw new Error("Feedback message cannot be empty.");
    }

    if (trimmedMessage.length > MAX_FEEDBACK_MESSAGE_LENGTH) {
      throw new Error(`Feedback message cannot exceed ${MAX_FEEDBACK_MESSAGE_LENGTH} characters.`);
    }

    let normalizedEmail: null | string = null;

    if (input.email) {
      const trimmedEmail = input.email.trim();

      if (trimmedEmail) {
        if (trimmedEmail.length > MAX_FEEDBACK_EMAIL_LENGTH || !trimmedEmail.includes("@")) {
          throw new Error("Invalid email format.");
        }

        normalizedEmail = trimmedEmail;
      }
    }

    this.ensureDirectory();

    const timestamp = this.now();
    const feedbackId = this.generateId();
    const timePrefix = formatUtcTimestamp(timestamp);
    const fileName = `${timePrefix}-${feedbackId}.json`;
    const tempFileName = `.tmp-${fileName}`;

    const record: StoredFeedback = {
      appVersion: input.appVersion?.trim() || "unknown",
      clientAddress: input.clientAddress,
      email: normalizedEmail,
      feedbackId,
      locale: input.locale && isLocale(input.locale.trim()) ? input.locale.trim() : "unknown",
      message: trimmedMessage,
      receivedAt: new Date(timestamp).toISOString(),
      timestamp,
      userAgent: input.userAgent
    };

    const tempPath = join(this.dirPath, tempFileName);
    const targetPath = join(this.dirPath, fileName);

    const jsonContent = JSON.stringify(record, null, 2);

    writeFileSync(tempPath, jsonContent, "utf8");
    renameSync(tempPath, targetPath);

    return record;
  }

  listFeedbacks(): StoredFeedback[] {
    if (!existsSync(this.dirPath)) {
      return [];
    }

    const files = readdirSync(this.dirPath)
      .filter((file) => file.endsWith(".json") && !file.startsWith(".tmp-"))
      .sort();

    const results: StoredFeedback[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(this.dirPath, file), "utf8");
        const parsed = JSON.parse(content) as StoredFeedback;

        if (parsed && typeof parsed === "object" && parsed.feedbackId && parsed.message) {
          results.push(parsed);
        }
      } catch {
        // Skip corrupt or unreadable files defensively
      }
    }

    return results;
  }

  private ensureDirectory(): void {
    if (!existsSync(this.dirPath)) {
      mkdirSync(this.dirPath, { recursive: true });
    }
  }
}

export function formatUtcTimestamp(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}
