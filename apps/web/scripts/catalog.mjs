import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const meta = JSON.parse(
  readFileSync(resolve(root, "catalog/VERSION.json"), "utf8"),
);
const bytes = readFileSync(resolve(root, "catalog", meta.file));
if (createHash("sha256").update(bytes).digest("hex") !== meta.sha256)
  throw new Error("Pinned catalog checksum mismatch");
const stars = JSON.parse(bytes);
if (
  stars.length !== 8920 ||
  new Set(stars.map((s) => s.hyg_id)).size !== 8920 ||
  stars.some(
    (s) =>
      s.hyg_id === 0 ||
      s.mag > 6.5 ||
      !Number.isFinite(s.ra_deg) ||
      !Number.isFinite(s.dec_deg),
  )
)
  throw new Error("Unexpected HYG catalog");
const geometry = JSON.parse(
  readFileSync(resolve(root, "catalog/constellations.json"), "utf8"),
);
const ids = new Set(stars.map((s) => s.hyg_id));
for (const c of geometry.constellations)
  for (const line of c.lines_hyg)
    for (const id of line) {
      if (!ids.has(id) && !geometry.line_stars[id])
        throw new Error(`Missing constellation endpoint ${id}`);
    }
const fields = [
  "hyg_id",
  "hip_id",
  "name",
  "bf",
  "con",
  "ra_deg",
  "dec_deg",
  "mag",
  "dist_ly",
  "ci_bv",
  "spectral_type",
  "luminosity_lsun",
  "mass_msun",
  "radius_rsun",
  "teff_k",
  "mass_radius_estimated",
  "surface_gravity_ms2",
  "est_surface_gravity_ms2",
  "exoplanet_count",
  "exoplanet_names",
  "wiki_title",
];
const asset = {
  schema: 1,
  version: meta.catalog_version,
  source_sha256: meta.sha256,
  count: stars.length,
  units: "ra_deg/dec_deg: degrees J2000; dist_ly: light years",
  attribution: meta.attribution,
  fields,
  constellations: geometry.constellations.map((c) => ({
    abbr: c.abbr,
    name: c.name,
  })),
  rows: stars.map((s) => fields.map((f) => s[f] ?? null)),
};
const out = resolve(root, "apps/web/public/catalog");
mkdirSync(out, { recursive: true });
const json = JSON.stringify(asset);
writeFileSync(resolve(out, `${meta.catalog_version}.json`), json);
console.log(
  `Catalog: ${stars.length} stars, ${stars.filter((s) => s.dist_ly === null).length} unknown distances, ${Buffer.byteLength(json)} bytes`,
);
