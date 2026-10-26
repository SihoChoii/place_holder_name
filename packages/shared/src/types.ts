import type { ModerationStatus, ProcessingState } from "./constants.js";

export interface ApiError {
  error: { code: string; message: string; retry_after_seconds?: number; details?: unknown };
}
export interface PublicUser { id: string; display_name: string }
export interface PrivateUser extends PublicUser { email: string; created_at: number }
export interface AuthResponse { token: string; expires_at: number; user: PrivateUser }
export interface MeResponse { user: PrivateUser; server_time: number; next_claim_at: number | null; claim_cooldown_seconds: number }
export interface ClaimInfo { id: string; hyg_id: number; owner: PublicUser; claimed_at: number }
export interface ClaimResponse { claim: ClaimInfo; next_claim_at: number }
export interface Star {
  hyg_id: number;
  hip_id: number | null;
  name: string | null;
  bayer_flamsteed: string | null;
  constellation: string | null;
  ra_hours: number;
  dec_degrees: number;
  epoch: "J2000";
  magnitude: number;
  distance_ly: number | null;
  distance_unknown_reason: string | null;
  spectral_type: string | null;
  exoplanet_count: number;
  wiki_title: string | null;
  catalog_version: string;
  claim: ClaimInfo | null;
}
export interface TravelTime {
  hyg_id: number;
  speed_km_s: number;
  distance_ly: number | null;
  travel_seconds: number | null;
  travel_years: number | null;
  reason: string | null;
  model: string;
}
export interface MediaItem { id: string; kind: "image" | "link"; url: string; width?: number; height?: number; mime?: string }
export interface Comment {
  id: string;
  tag_id: string;
  author: PublicUser;
  body: string;
  media_id: string | null;
  moderation_status: ModerationStatus;
  processing_state?: ProcessingState;
  created_at: number;
}
export interface Tag {
  id: string;
  hyg_id: number;
  star_name: string | null;
  author: PublicUser;
  note: string | null;
  media: MediaItem[];
  moderation_status: ModerationStatus;
  processing_state?: ProcessingState;
  created_at: number;
  reaction_counts: Record<string, number>;
  my_reactions?: string[];
  comment_count: number;
  recent_comments?: Comment[];
}
export interface Page<T> { items: T[]; next_cursor: string | null }
export interface StarOverlay { hyg_id: number; claim: ClaimInfo | null; tags: Tag[]; tag_count: number; has_more: boolean }
export interface ViewContentResponse { stars: StarOverlay[]; server_time: number }
export interface SearchResponse { stars: Star[]; tags: Tag[]; next_cursor: string | null }
export interface PublicStarResponse { star: Star; tag_count: number; recent_tags: Tag[] }
export interface ClaimedPreview {
  type: "image" | "link" | "text"; thumb_url: string | null; title: string | null; excerpt: string | null; approved_count: number;
}
export interface ClaimedStar { hyg_id: number; owner: PublicUser; claimed_at: number; preview: ClaimedPreview | null }
export interface ClaimedStarsResponse { stars: ClaimedStar[]; version: string; server_time: number }
export interface ReactionResponse { tag_id: string; reaction_counts: Record<string, number>; my_reactions: string[] }
export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface SummaryRequest { hyg_id: number; audio?: boolean }
export interface SummaryResponse {
  hyg_id: number; title: string; blurb: string; source: { title: string; url: string };
  audio: { mime_type: "audio/mpeg"; base64: string } | null;
}
export interface ChatRequest { messages: ChatMessage[]; mode: "local" | "explore"; scope_hyg_ids?: number[]; selected_hyg_id?: number | null }
export type ChatEvent =
  | { event: "start"; data: { request_id: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { request_id: string } }
  | { event: "error"; data: { code: string; message: string } };
