/**
 * JSON Schemas for every request/response body. Fastify validates requests with them and
 * @fastify/swagger turns them into docs/openapi.json. Clients use the matching types in types.ts
 * and the fixtures in packages/shared/fixtures.
 */
import { LIMITS, REACTION_EMOJIS, PROCESSING_STATES, MODERATION_STATUSES } from "./constants.js";

const uuid = { type: "string", format: "uuid" } as const;
const ms = { type: "integer", description: "UTC Unix milliseconds" } as const;
const hygId = { type: "integer", minimum: 0 } as const;
const nullable = <T extends object>(s: T) => ({ anyOf: [s, { type: "null" }] }) as const;

export const ErrorBody = {
  $id: "ErrorBody",
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        retry_after_seconds: { type: "integer" },
        details: {},
      },
    },
  },
} as const;

export const PublicUser = {
  type: "object",
  required: ["id", "display_name"],
  properties: { id: uuid, display_name: { type: "string" } },
} as const;

export const PrivateUser = {
  type: "object",
  required: ["id", "email", "display_name", "created_at"],
  properties: { id: uuid, email: { type: "string" }, display_name: { type: "string" }, created_at: ms },
} as const;

export const SignupBody = {
  type: "object",
  required: ["email", "password", "display_name"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 3, maxLength: LIMITS.emailMax },
    password: { type: "string", minLength: LIMITS.passwordMin, maxLength: LIMITS.passwordMax },
    display_name: { type: "string", minLength: 1, maxLength: LIMITS.displayNameMax },
  },
} as const;

export const LoginBody = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", maxLength: LIMITS.emailMax },
    password: { type: "string", maxLength: LIMITS.passwordMax },
  },
} as const;

export const AuthResponse = {
  type: "object",
  required: ["token", "expires_at", "user"],
  properties: { token: { type: "string" }, expires_at: ms, user: PrivateUser },
} as const;

export const MeResponse = {
  type: "object",
  required: ["user", "server_time", "next_claim_at", "claim_cooldown_seconds"],
  properties: {
    user: PrivateUser,
    server_time: ms,
    next_claim_at: nullable(ms),
    claim_cooldown_seconds: { type: "integer" },
  },
} as const;

export const ClaimInfo = {
  type: "object",
  required: ["id", "hyg_id", "owner", "claimed_at"],
  properties: { id: uuid, hyg_id: hygId, owner: PublicUser, claimed_at: ms },
} as const;

export const Star = {
  type: "object",
  required: ["hyg_id", "name", "ra_hours", "dec_degrees", "epoch", "magnitude", "distance_ly", "catalog_version", "claim"],
  properties: {
    hyg_id: hygId,
    hip_id: nullable({ type: "integer" }),
    name: nullable({ type: "string" }),
    bayer_flamsteed: nullable({ type: "string" }),
    constellation: nullable({ type: "string" }),
    ra_hours: { type: "number" },
    dec_degrees: { type: "number" },
    epoch: { type: "string", enum: ["J2000"] },
    magnitude: { type: "number" },
    distance_ly: nullable({ type: "number" }),
    distance_unknown_reason: nullable({ type: "string" }),
    spectral_type: nullable({ type: "string" }),
    exoplanet_count: { type: "integer" },
    wiki_title: nullable({ type: "string" }),
    catalog_version: { type: "string" },
    claim: nullable(ClaimInfo),
  },
} as const;

export const TravelTimeQuery = {
  type: "object",
  required: ["speed_km_s"],
  properties: { speed_km_s: { type: "number", exclusiveMinimum: 0 } }, // any finite positive speed (Infinity rejected in the route)
} as const;

export const TravelTimeResponse = {
  type: "object",
  required: ["hyg_id", "speed_km_s", "distance_ly", "travel_seconds", "travel_years", "reason", "model"],
  properties: {
    hyg_id: hygId,
    speed_km_s: { type: "number" },
    distance_ly: nullable({ type: "number" }),
    travel_seconds: nullable({ type: "number" }),
    travel_years: nullable({ type: "number" }),
    reason: nullable({ type: "string" }),
    model: { type: "string" },
  },
} as const;

export const ClaimResponse = {
  type: "object",
  required: ["claim", "next_claim_at"],
  properties: { claim: ClaimInfo, next_claim_at: ms },
} as const;

export const MediaItem = {
  type: "object",
  required: ["id", "kind", "url"],
  properties: {
    id: uuid,
    kind: { type: "string", enum: ["image", "link"] },
    url: { type: "string", description: "image: API-relative byte URL; link: the external URL" },
    width: { type: "integer" },
    height: { type: "integer" },
    mime: { type: "string" },
  },
} as const;

export const ReactionCounts = {
  type: "object",
  description: "Approved-content reaction counts keyed by emoji",
  additionalProperties: { type: "integer" },
} as const;

export const Comment = {
  type: "object",
  required: ["id", "tag_id", "author", "body", "media_id", "moderation_status", "created_at"],
  properties: {
    id: uuid,
    tag_id: uuid,
    author: PublicUser,
    body: { type: "string" },
    media_id: nullable(uuid),
    moderation_status: { type: "string", enum: [...MODERATION_STATUSES] },
    processing_state: { type: "string", enum: [...PROCESSING_STATES] },
    created_at: ms,
  },
} as const;

export const Tag = {
  type: "object",
  required: ["id", "hyg_id", "star_name", "author", "note", "media", "moderation_status", "created_at", "reaction_counts", "comment_count"],
  properties: {
    id: uuid,
    hyg_id: hygId,
    star_name: nullable({ type: "string" }),
    author: PublicUser,
    note: nullable({ type: "string" }),
    media: { type: "array", items: MediaItem },
    moderation_status: { type: "string", enum: [...MODERATION_STATUSES] },
    processing_state: { type: "string", enum: [...PROCESSING_STATES], description: "Author only" },
    created_at: ms,
    reaction_counts: ReactionCounts,
    my_reactions: { type: "array", items: { type: "string" } },
    comment_count: { type: "integer" },
    recent_comments: { type: "array", items: Comment },
  },
} as const;

export const TagPage = {
  type: "object",
  required: ["items", "next_cursor"],
  properties: { items: { type: "array", items: Tag }, next_cursor: nullable({ type: "string" }) },
} as const;

export const CommentPage = {
  type: "object",
  required: ["items", "next_cursor"],
  properties: { items: { type: "array", items: Comment }, next_cursor: nullable({ type: "string" }) },
} as const;

export const PageQuery = {
  type: "object",
  properties: {
    cursor: { type: "string", maxLength: 200 },
    limit: { type: "integer", minimum: 1, maximum: LIMITS.pageMax, default: LIMITS.pageDefault },
  },
} as const;

export const CreateCommentResponse = {
  type: "object",
  required: ["comment"],
  properties: { comment: Comment },
} as const;

export const CreateTagResponse = {
  type: "object",
  required: ["tag"],
  properties: { tag: Tag },
} as const;

export const CreateCommentBody = {
  type: "object",
  required: ["body"],
  additionalProperties: false,
  properties: {
    body: { type: "string", minLength: 1, maxLength: LIMITS.commentMaxCodePoints },
    media_id: nullable(uuid),
  },
} as const;

export const ReactionResponse = {
  type: "object",
  required: ["tag_id", "reaction_counts", "my_reactions"],
  properties: { tag_id: uuid, reaction_counts: ReactionCounts, my_reactions: { type: "array", items: { type: "string" } } },
} as const;

export const ViewContentBody = {
  type: "object",
  required: ["hyg_ids"],
  additionalProperties: false,
  properties: {
    hyg_ids: { type: "array", minItems: 1, maxItems: LIMITS.viewContentMaxStars, uniqueItems: true, items: hygId },
  },
} as const;

export const StarOverlay = {
  type: "object",
  required: ["hyg_id", "claim", "tags", "tag_count", "has_more"],
  properties: {
    hyg_id: hygId,
    claim: nullable(ClaimInfo),
    tags: { type: "array", items: Tag },
    tag_count: { type: "integer", description: "Visible tags for this viewer" },
    has_more: { type: "boolean" },
  },
} as const;

export const ViewContentResponse = {
  type: "object",
  required: ["stars", "server_time"],
  properties: { stars: { type: "array", items: StarOverlay }, server_time: ms },
} as const;

export const SearchQuery = {
  type: "object",
  required: ["q"],
  properties: {
    q: { type: "string", minLength: 1, maxLength: LIMITS.searchQueryMax },
    cursor: { type: "string", maxLength: 200 },
    limit: { type: "integer", minimum: 1, maximum: LIMITS.pageMax, default: LIMITS.pageDefault },
  },
} as const;

export const SearchResponse = {
  type: "object",
  required: ["stars", "tags", "next_cursor"],
  properties: {
    stars: { type: "array", items: Star, description: "First page only; catalog matches (max 20)" },
    tags: { type: "array", items: Tag },
    next_cursor: nullable({ type: "string" }),
  },
} as const;

export const PublicStarResponse = {
  type: "object",
  required: ["star", "tag_count", "recent_tags"],
  properties: { star: Star, tag_count: { type: "integer" }, recent_tags: { type: "array", items: Tag } },
} as const;

export const ChatMessage = {
  type: "object",
  required: ["role", "content"],
  additionalProperties: false,
  properties: {
    role: { type: "string", enum: ["user", "assistant"] },
    content: { type: "string", minLength: 1, maxLength: LIMITS.chatMessageMaxChars },
  },
} as const;

export const ChatBody = {
  type: "object",
  required: ["messages", "mode"],
  additionalProperties: false,
  properties: {
    messages: { type: "array", minItems: 1, maxItems: LIMITS.chatMaxHistory, items: ChatMessage },
    mode: { type: "string", enum: ["local", "explore"] },
    scope_hyg_ids: { type: "array", maxItems: LIMITS.chatScopeMaxStars, uniqueItems: true, items: hygId },
    selected_hyg_id: nullable(hygId),
  },
} as const;

export const HealthReady = {
  type: "object",
  required: ["status", "components"],
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    components: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: { status: { type: "string" }, checked_at: nullable(ms), detail: { type: "string" } },
      },
    },
  },
} as const;

export const reactionEmojiSchema = { type: "string", enum: [...REACTION_EMOJIS] } as const;
