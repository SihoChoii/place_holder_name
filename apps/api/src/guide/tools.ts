import { LIMITS } from "@stargaze/shared";
import { PUBLIC } from "../auth/session.js";
import type { Ctx } from "../context.js";
import { claimInfo, type ClaimRow } from "../services/claims.js";
import { starTags } from "../services/content.js";
import { travelTime } from "../catalog/index.js";

/** Star scope for one guide request: null = whole catalog (explore mode). */
export type Scope = Set<number> | null;

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_star",
      description: "Catalog facts and owner for a star",
      parameters: { type: "object", properties: { hyg_id: { type: "integer" } }, required: ["hyg_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_travel_time",
      description: "Travel time to a star at a constant speed in km/s",
      parameters: { type: "object", properties: { hyg_id: { type: "integer" }, speed_km_s: { type: "number" } }, required: ["hyg_id", "speed_km_s"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_star_content",
      description: "Recent approved community posts on a star",
      parameters: { type: "object", properties: { hyg_id: { type: "integer" } }, required: ["hyg_id"] },
    },
  },
] as const;

export class ToolError extends Error {}

function starId(ctx: Ctx, scope: Scope, args: Record<string, unknown>) {
  const id = args.hyg_id;
  if (typeof id !== "number" || !Number.isInteger(id)) throw new ToolError("hyg_id must be an integer");
  if (!ctx.catalog.has(id)) throw new ToolError("unknown star");
  if (scope && !scope.has(id)) throw new ToolError("star is outside the current view");
  return id;
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Compact, factual star summary shared by preloading and the get_star tool. */
export function starFacts(ctx: Ctx, hygId: number) {
  const s = ctx.catalog.get(hygId)!;
  const claim = claimInfo(ctx.q.claimByStar.get(hygId) as ClaimRow | undefined);
  return {
    hyg_id: s.hyg_id, name: s.name ?? s.bayer_flamsteed ?? `HYG ${s.hyg_id}`, constellation: s.constellation, magnitude: s.magnitude,
    distance_ly: s.distance_ly, spectral_type: s.spectral_type, exoplanets: s.exoplanet_count,
    owner: claim?.owner.display_name ?? null,
  };
}

/**
 * Execute one validated read-only tool call. Uses the same catalog/calculation/content functions as REST,
 * always with the anonymous viewer, so only approved content is ever returned.
 */
export function runTool(ctx: Ctx, scope: Scope, name: string, rawArgs: unknown): object {
  const args = (typeof rawArgs === "string" ? safeJson(rawArgs) : rawArgs) as Record<string, unknown> | null;
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new ToolError("arguments must be an object");
  const allowed: Record<string, string[]> = { get_star: ["hyg_id"], calculate_travel_time: ["hyg_id", "speed_km_s"], get_star_content: ["hyg_id"] };
  if (!allowed[name]) throw new ToolError(`unknown tool ${name}`);
  if (Object.keys(args).some((k) => !allowed[name].includes(k))) throw new ToolError("unexpected argument");
  const id = starId(ctx, scope, args);
  switch (name) {
    case "get_star":
      return starFacts(ctx, id);
    case "calculate_travel_time": {
      const speed = args.speed_km_s;
      if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) throw new ToolError("speed_km_s must be positive");
      let t: ReturnType<typeof travelTime>;
      try { t = travelTime(ctx.catalog.get(id)!, speed); }
      catch (e) { throw e instanceof RangeError ? new ToolError(e.message) : e; }
      return { hyg_id: id, speed_km_s: speed, distance_ly: t.distance_ly, travel_years: t.travel_years == null ? null : Math.round(t.travel_years), note: "constant speed, no relativity" };
    }
    default: {
      const page = starTags(ctx, PUBLIC, id, { limit: 2 });
      return { hyg_id: id, posts: page.items.map((t) => ({ by: t.author.display_name, note: t.note ? trunc(t.note, 140) : null, photos: t.media.filter((m) => m.kind === "image").length })) };
    }
  }
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

export const MAX_TOOL_CALLS = 3;
export const TOOL_RESULT_BUDGET = 1000;
export { LIMITS };
