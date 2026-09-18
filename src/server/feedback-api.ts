import type { IncomingMessage, ServerResponse } from "node:http";
import { isLocale } from "@/i18n/config";
import { resolveClientAddress, shouldTrustProxy } from "./client-address";
import type { FeedbackStore } from "./feedback-store";
import { FixedWindowRateLimiter } from "./rate-limit";
import { feedbackStore as globalFeedbackStore } from "./room-store";

export class PayloadTooLargeError extends Error {
  constructor(message = "Payload too large") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

export type FeedbackRequestBody = {
  email?: null | string;
  locale?: string;
  message?: string;
};

export type FeedbackApiHandlerOptions = {
  feedbackStore?: FeedbackStore;
  limiter?: FixedWindowRateLimiter;
  trustProxy?: boolean;
};

export const defaultFeedbackLimiter = new FixedWindowRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000
});

export const MAX_FEEDBACK_BODY_BYTES = 64 * 1024;

export function readFeedbackJsonBody<T>(
  request: IncomingMessage,
  maxBytes = MAX_FEEDBACK_BODY_BYTES
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytesRead = 0;
    let isExceeded = false;

    request.on("data", (chunk: Buffer | string) => {
      const chunkBytes = Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk, "utf8");
      bytesRead += chunkBytes;

      if (bytesRead > maxBytes) {
        if (!isExceeded) {
          isExceeded = true;
          request.pause();
          reject(new PayloadTooLargeError("Request body exceeds maximum allowed size"));
        }
        return;
      }

      body += chunk.toString();
    });

    request.on("end", () => {
      if (isExceeded) return;
      if (!body.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(body) as T);
      } catch (err) {
        reject(err);
      }
    });

    request.on("error", (err) => {
      if (!isExceeded) {
        reject(err);
      }
    });
  });
}

export function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    ...headers,
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

export async function processFeedbackApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: FeedbackApiHandlerOptions = {}
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "Method not allowed" }, { allow: "POST" });
    return;
  }

  const store = options.feedbackStore ?? globalFeedbackStore;
  const limiter = options.limiter ?? defaultFeedbackLimiter;
  const trustProxy = options.trustProxy ?? shouldTrustProxy();

  const clientKey = resolveClientAddress({
    forwardedFor: request.headers["x-forwarded-for"],
    remoteAddress: request.socket?.remoteAddress ?? "unknown",
    trustProxy
  });

  const rateLimit = limiter.consume(clientKey);

  if (!rateLimit.allowed) {
    writeJson(
      response,
      429,
      { error: "Too many feedback submissions. Please try again later." },
      { "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) }
    );
    return;
  }

  let body: FeedbackRequestBody | null;

  try {
    body = await readFeedbackJsonBody<FeedbackRequestBody>(request, MAX_FEEDBACK_BODY_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      response.once("finish", () => {
        request.destroy();
      });
      writeJson(response, 413, { error: "Payload too large" }, { connection: "close" });
      request.resume();
      return;
    }

    writeJson(response, 400, { error: "Invalid JSON request body" });
    return;
  }

  if (!body || typeof body !== "object") {
    writeJson(response, 400, { error: "Invalid JSON request body" });
    return;
  }

  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";

  if (!rawMessage) {
    writeJson(response, 400, { error: "Feedback message cannot be empty." });
    return;
  }

  if (rawMessage.length > 5000) {
    writeJson(response, 400, { error: "Feedback message cannot exceed 5000 characters." });
    return;
  }

  let email: null | string = null;

  if (body.email && typeof body.email === "string") {
    const trimmedEmail = body.email.trim();

    if (trimmedEmail) {
      if (trimmedEmail.length > 254 || !trimmedEmail.includes("@")) {
        writeJson(response, 400, { error: "Invalid email format." });
        return;
      }

      email = trimmedEmail;
    }
  }

  const rawLocale = typeof body.locale === "string" ? body.locale.trim() : undefined;
  const locale = rawLocale && isLocale(rawLocale) ? rawLocale : "unknown";

  try {
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? "unknown";
    const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined;

    const saved = store.saveFeedback({
      appVersion,
      clientAddress: clientKey,
      email,
      locale,
      message: rawMessage,
      userAgent
    });

    writeJson(response, 201, {
      feedbackId: saved.feedbackId,
      ok: true,
      receivedAt: saved.receivedAt
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to save feedback";
    writeJson(response, 400, { error: errorMessage });
  }
}

export function handleFeedbackApi(
  request: IncomingMessage,
  response: ServerResponse,
  options: FeedbackApiHandlerOptions = {}
): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/feedback") {
    return false;
  }

  void processFeedbackApiRequest(request, response, options).catch(() => {
    writeJson(response, 500, { error: "Failed to process feedback" });
  });

  return true;
}
