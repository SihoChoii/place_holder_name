import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface CatalogStar {
  hyg_id: number;
  hip_id: number | null;
  name: string | null;
  bayer_flamsteed: string | null;
  constellation: string | null;
  ra_hours: number;
  dec_degrees: number;
  magnitude: number;
  distance_ly: number | null;
  spectral_type: string | null;
  exoplanet_count: number;
  wiki_title: string | null;
}

interface RawStar {
  hyg_id: number;
  hip_id: number | null;
  name: string | null;
  bf: string | null;
  con: string | null;
  ra_deg: number;
  dec_deg: number;
  mag: number;
  dist_ly: number | null;
  spectral_type: string | null;
  exoplanet_count: number | null;
  wiki_title: string | null;
}

export interface Catalog {
  version: string;
  attribution: string[];
  size: number;
  get(hygId: number): CatalogStar | undefined;
  has(hygId: number): boolean;
  search(q: string, limit: number): CatalogStar[];
}

/** Distances at or beyond HYG's 100000 pc sentinel (≈326,156 ly) are unknown. */
const SENTINEL_LY = 300_000;

/** Load the pinned catalog handoff (catalog/stars.json + VERSION.json) and verify its checksum. */
export function loadCatalog(dir: string): Catalog {
  const meta = JSON.parse(readFileSync(join(dir, "VERSION.json"), "utf8")) as {
    catalog_version: string; file: string; sha256: string; attribution: string[];
  };
  const bytes = readFileSync(join(dir, meta.file));
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== meta.sha256) throw new Error(`Catalog checksum mismatch for ${meta.file}: expected pinned ${meta.catalog_version}`);
  const raw = JSON.parse(bytes.toString("utf8")) as RawStar[];
  const byId = new Map<number, CatalogStar>();
  for (const r of raw) {
    const d = r.dist_ly;
    byId.set(r.hyg_id, {
      hyg_id: r.hyg_id,
      hip_id: r.hip_id ?? null,
      name: r.name ?? null,
      bayer_flamsteed: r.bf ?? null,
      constellation: r.con ?? null,
      ra_hours: round(r.ra_deg / 15, 6),
      dec_degrees: r.dec_deg,
      magnitude: r.mag,
      distance_ly: d != null && Number.isFinite(d) && d > 0 && d < SENTINEL_LY ? d : null,
      spectral_type: r.spectral_type ?? null,
      exoplanet_count: r.exoplanet_count ?? 0,
      wiki_title: r.wiki_title ?? null,
    });
  }
  // Brightest first, so search results favour well-known stars.
  const list = [...byId.values()].sort((a, b) => a.magnitude - b.magnitude);
  const haystack = list.map((s) => [s.name, s.bayer_flamsteed, s.wiki_title].filter(Boolean).join(" ").toLowerCase());
  return {
    version: meta.catalog_version,
    attribution: meta.attribution,
    size: byId.size,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    search(q, limit) {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      const out: CatalogStar[] = [];
      const num = /^(hyg|hip)?\s*(\d+)$/.exec(needle);
      if (num) {
        const n = Number(num[2]);
        const hit = num[1] === "hip" ? list.find((s) => s.hip_id === n) : byId.get(n) ?? (num[1] ? undefined : list.find((s) => s.hip_id === n));
        if (hit) out.push(hit);
      }
      for (let i = 0; i < list.length && out.length < limit; i++) {
        if (haystack[i].includes(needle) && !out.includes(list[i])) out.push(list[i]);
      }
      return out.slice(0, limit);
    },
  };
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

export const LIGHT_YEAR_KM = 9_460_730_472_580.8;
export const TRAVEL_MODEL = "distance / speed; constant speed, no acceleration or relativistic corrections";

/** Deterministic travel time. Returns nulls with a reason when the distance is unknown. */
export function travelTime(star: CatalogStar, speedKmS: number) {
  if (!Number.isFinite(speedKmS) || speedKmS <= 0) throw new RangeError("speed_km_s must be a finite positive number");
  if (star.distance_ly == null) {
    return { hyg_id: star.hyg_id, speed_km_s: speedKmS, distance_ly: null, travel_seconds: null, travel_years: null,
      reason: "distance_unknown", model: TRAVEL_MODEL };
  }
  const seconds = (star.distance_ly * LIGHT_YEAR_KM) / speedKmS;
  return { hyg_id: star.hyg_id, speed_km_s: speedKmS, distance_ly: star.distance_ly, travel_seconds: seconds,
    travel_years: seconds / (365.25 * 86400), reason: null, model: TRAVEL_MODEL };
}
