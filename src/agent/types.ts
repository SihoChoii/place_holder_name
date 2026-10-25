import type Database from 'better-sqlite3';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';

export type Mode = 'local' | 'explore';
export type Client = 'ios' | 'web';
export type Access = 'read' | 'draft' | 'internal';
export type ClaimState = 'claimed' | 'claimable' | 'on_cooldown';
export type Visibility = 'approved' | 'pending' | 'rejected';

export interface StarSummary {
  hyg_id: number;
  name: string;
  mag: number;
}

/** Static catalog entry. Optional fields are omitted when the catalog has no value. */
export interface CatalogStar extends StarSummary {
  ra_deg: number;
  dec_deg: number;
  distance_ly: number | null;
  spectral_type?: string;
  luminosity_solar?: number;
  exoplanets?: readonly string[];
}

export interface Travel {
  speed_c: number;
  earth_years: number;
  ship_years: number;
  years_lost: number;
}

export interface FactCard {
  hyg_id: number;
  name: string;
  mag: number;
  distance_ly: number | null;
  travel?: Travel;
  claim_state: ClaimState;
  owner?: { display_name: string };
  claimed_at?: number;
  next_claim_at?: number | null;
  source: 'live' | 'cache' | 'template';
}

/** Backend star facts for one caller. `owner_user_id` never leaves the harness. */
export interface StarFacts extends Omit<FactCard, 'source' | 'travel'> {
  owner_user_id?: string;
  spectral_type?: string;
  facts?: Record<string, string | number | boolean | null>;
}

export interface Comment {
  id: string;
  tag_id: string;
  author_id: string;
  display_name: string;
  body: string;
  status: Visibility;
  created_at: number;
}

export interface CommunityItem {
  tag_id: string;
  hyg_id: number;
  display_name: string;
  note: string;
  created_at: number;
  status: 'approved';
}

export interface StarTag {
  id: string;
  author_id: string;
  display_name: string;
  note: string;
  status: Visibility;
}

export interface StarContent {
  hyg_id: number;
  tags: StarTag[];
}

export interface StarDetail {
  facts: StarFacts;
  content: StarContent;
}

/**
 * Read-only backend helpers supplied by the host. Every method receives the
 * request's abort signal last. Visibility rules (approved + caller's own
 * pending) are the host's responsibility; the harness filters again.
 */
export interface BackendReads {
  starFacts(hygId: number, userId: string, signal: AbortSignal): Promise<StarFacts | null>;
  travelTime(hygId: number, speedC: number, userId: string, signal: AbortSignal): Promise<Travel | null>;
  viewContent(hygIds: readonly number[], userId: string, signal: AbortSignal): Promise<StarContent[]>;
  exploreSearch(q: string, limit: number, userId: string, signal: AbortSignal): Promise<StarSummary[]>;
  starDetail(hygId: number, userId: string, signal: AbortSignal): Promise<StarDetail | null>;
  nextClaimAt(userId: string, signal: AbortSignal): Promise<number | null>;
  listComments(tagId: string, userId: string, limit: number, signal: AbortSignal): Promise<Comment[]>;
  communityFeed(limit: number, signal: AbortSignal): Promise<CommunityItem[]>;
  tagTarget(tagId: string, userId: string, signal: AbortSignal): Promise<{ hyg_id: number } | null>;
  catalog(signal: AbortSignal): Promise<readonly CatalogStar[]>;
  claimedStars(userId: string, limit: number, signal: AbortSignal): Promise<StarSummary[]>;
}

export interface AgentConfig {
  /** OpenAI-compatible root ending in /v1, e.g. http://100.64.0.11:11434/v1 */
  guideBaseUrl: string;
  guideModel: string;
  /** Ollama origin without path, e.g. http://100.64.0.12:11434. Unset = moderation pending, rule routing only. */
  clefBaseUrl?: string;
  clefModel?: string;
  maxTokens?: number;
  timeoutMs?: number;
  queueDepth?: number;
  toolTimeoutMs?: number;
}

export interface AgentOptions {
  db: Database.Database;
  backend: BackendReads;
  authenticate: preHandlerHookHandler;
  getUserId(request: FastifyRequest): string;
  config: AgentConfig;
  fetch?: typeof globalThis.fetch;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}

export interface RequestCtx {
  requestId: string;
  userId: string;
  mode: Mode;
  client: Client;
  inView: Set<number>;
  selected?: number;
  tsMs?: number;
  demo: boolean;
  signal: AbortSignal;
}

export interface DraftCard {
  kind: 'draft';
  action: 'claim' | 'tag' | 'comment';
  hyg_id: number;
  tag_id?: string;
  note?: string;
  body?: string;
  state?: ClaimState;
  retry_after_seconds?: number;
  verdict?: Visibility;
  requires_confirmation: true;
}

export type ErrorCode = 'model_unavailable' | 'timeout' | 'rate_limited' | 'in_flight' | 'queue_full' | 'bad_context';

export type SseEvent =
  | { event: 'start'; data: { request_id: string } }
  | { event: 'meta'; data: { request_id: string; mode: Mode; client: Client; skill: string; queued_position: number } }
  | { event: 'tool'; data: { name: string; status: 'start' | 'end' | 'blocked' } }
  | { event: 'card'; data: FactCard | DraftCard }
  | { event: 'delta'; data: { text: string } }
  | { event: 'speech'; data: { speech_id: string; script: string; voice: string; audio_url: null } }
  | { event: 'error'; data: { code: ErrorCode; message: string; retry_after_seconds?: number } }
  | { event: 'done'; data: { reason: 'complete' | 'fallback' } };
