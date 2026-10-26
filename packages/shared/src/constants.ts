/** Numeric limits and conventions from docs/backend-implementation-plan.md. Single source of truth. */
export const API_PREFIX = "/api";

export const LIMITS = {
  passwordMin: 12,
  passwordMax: 128,
  displayNameMax: 50,
  emailMax: 254,
  jwtTtlSeconds: 7 * 24 * 3600,
  claimCooldownSeconds: 3600,
  noteMaxCodePoints: 140,
  commentMaxCodePoints: 280,
  maxAttachments: 4,
  maxImageBytes: 5 * 1024 * 1024,
  maxImagePixels: 20_000_000,
  maxMultipartBytes: 22 * 1024 * 1024,
  normalizedLongEdge: 2048,
  thumbWidth: 320,
  moderationLongEdge: 1024,
  linkMaxChars: 2048,
  viewContentMaxStars: 200,
  viewContentTagsPerStar: 3,
  viewContentCommentsPerTag: 2,
  pageDefault: 20,
  pageMax: 50,
  searchQueryMax: 100,
  searchStarResults: 20,
  chatBodyMaxBytes: 32 * 1024,
  chatMaxHistory: 6,
  chatMessageMaxChars: 2000,
  chatScopeMaxStars: 200,
  guideActive: 1,
  guideWaiting: 2,
  guideDeadlineMs: 60_000,
  pollIntervalMs: 5000,
} as const;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const REACTION_EMOJIS = ["❤️", "✨", "🚀", "🤩", "👍"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const MODERATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

/** Author-facing processing state (derived; never stored). */
export const PROCESSING_STATES = ["queued", "delayed", "review_failed", "approved", "rejected"] as const;
export type ProcessingState = (typeof PROCESSING_STATES)[number];

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "bad_origin",
  "not_found",
  "unknown_star",
  "already_claimed",
  "not_star_owner",
  "idempotency_conflict",
  "email_taken",
  "invalid_credentials",
  "payload_too_large",
  "unsupported_media_type",
  "invalid_image",
  "invalid_link",
  "empty_post",
  "on_cooldown",
  "rate_limited",
  "context_too_large",
  "guide_busy",
  "guide_unavailable",
  "guide_timeout",
  "internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const SSE_EVENTS = ["start", "delta", "done", "error"] as const;

/** Count user-visible characters as Unicode code points (same rule on every client). */
export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
