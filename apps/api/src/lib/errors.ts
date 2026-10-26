import type { ErrorCode } from "@stargaze/shared";

/** An expected API error rendered as {error:{code,message,retry_after_seconds?}}. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code: ErrorCode = "bad_request", details?: unknown) =>
  new AppError(400, code, message, undefined, details);
export const unauthorized = (message = "Sign in required.") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "You cannot modify this resource.") => new AppError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new AppError(404, "not_found", message);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);
export const tooMany = (code: ErrorCode, message: string, retryAfterSeconds: number) =>
  new AppError(429, code, message, Math.max(1, Math.ceil(retryAfterSeconds)));
