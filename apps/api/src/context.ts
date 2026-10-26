import type { FastifyInstance } from "fastify";
import type { Statement } from "better-sqlite3";
import { jobQueries, type DB, type JobQueries } from "@stargaze/db";
import type { Catalog } from "./catalog/index.js";
import type { Config } from "./config.js";
import { RateLimiter } from "./lib/limiter.js";
import type { ClefClient } from "./models/clef.js";
import type { GemmaClient } from "./models/gemma.js";
import type { createSummaryTools } from "./guide/astral/summaries.js";

/** Prepared statements shared by several modules. */
function commonQueries(db: DB): Record<"userById" | "claimByStar" | "latestClaimAt", Statement> {
  return {
    userById: db.prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?"),
    claimByStar: db.prepare(
      `SELECT c.id, c.hyg_id, c.user_id, c.claimed_at, u.display_name FROM star_claims c JOIN users u ON u.id = c.user_id WHERE c.hyg_id = ?`,
    ),
    latestClaimAt: db.prepare("SELECT MAX(claimed_at) AS t FROM star_claims WHERE user_id = ?"),
  };
}

export interface Ctx {
  config: Config;
  db: DB;
  app: FastifyInstance;
  catalog: Catalog;
  now: () => number;
  q: ReturnType<typeof commonQueries>;
  jobs: JobQueries;
  limiter: RateLimiter;
  clef: ClefClient;
  gemma: GemmaClient;
  /** Astral Harness Wikipedia lookup, Gemma rewrite and optional xAI speech. */
  summary: ReturnType<typeof createSummaryTools>;
  /** Wakes the moderation loop after new jobs are inserted. */
  notifyModeration: () => void;
}

export function buildCtx(parts: Omit<Ctx, "q" | "jobs" | "limiter" | "notifyModeration">): Ctx {
  return {
    ...parts,
    q: commonQueries(parts.db),
    jobs: jobQueries(parts.db),
    limiter: new RateLimiter(parts.now),
    notifyModeration: () => {},
  };
}
