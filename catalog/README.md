# Star Tagger data bundle (built 2026-10-25, local only)
Rebuild: `python3 build.py` (reads /workspace/hyg44.csv, ps.csv, iau.txt, hip_enwiki.csv, stel_modern.json; ~2 s).

## Files
- `stars.json` — array of 8,920 HYG stars with mag <= 6.5 (Sun excluded), sorted by mag (brightest first). Compact JSON, UTF-8.
- `stars_lite.json` — same stars, only `hyg_id, hip_id, name, ra_deg, dec_deg, mag` (fast rendering).
- `stars.csv` — same columns as stars.json; empty = null; `exoplanet_names` joined with `|`.
- `stars.bin` — little-endian. Header: 4 bytes magic `STG1`, uint32 count. Then `count` records of 28 bytes:
  `uint32 hyg_id, int32 hip_id (-1 none), float32 ra_deg, float32 dec_deg, float32 mag, float32 dist_ly (-1 unknown), int16 exoplanet_count, int16 has_name (0/1)`. Same order as stars.json (index i = stars.json[i]).
- `constellations.json` — `{constellations:[88], line_stars:{hyg_id:{...}}, unmapped_hip:[]}`.
- `build.py` — the builder.

## stars.json fields
| field | unit / meaning |
|---|---|
| hyg_id | HYG v4.4 `id` (primary key) |
| hip_id, hd_id, hr_id | Hipparcos / Henry Draper / Bright Star catalog numbers, null if none |
| name | HYG proper name, else IAU-CSN name (by HIP, then HD), else null |
| iau_name | IAU-CSN name by HIP (null if none) |
| bf, con | HYG Bayer/Flamsteed string (e.g. `9Alp CMa`), IAU constellation abbr |
| ra_deg, dec_deg | degrees, J2000 equinox, epoch ~J2000 (HYG `ra` hours × 15). 5 dp |
| mag, abs_mag | apparent / absolute V magnitude, 2 dp |
| ci_bv | B−V color index |
| dist_ly | light years = HYG dist pc × 3.26156; **null when unknown** (HYG uses 100000 pc sentinel) |
| spectral_type | HYG `spect` string, raw |
| luminosity_lsun | HYG `lum`, solar luminosities (visual-band derived, not bolometric) |
| mass_msun, radius_rsun, teff_k | Measured from NASA Exoplanet Archive (pscomppars) for planet hosts; otherwise **estimates** (see below) |
| mass_radius_estimated | true = radius_rsun/teff_k (and mass_msun if present) are estimates |
| surface_gravity_ms2 | m/s², from archive mass+radius (hosts only) |
| est_surface_gravity_ms2 | m/s², ESTIMATED, only for luminosity class V dwarfs |
| wiki_title | English Wikipedia title via Wikidata HIP map (null if none) |
| wikidata_qid | Wikidata item for that HIP |
| exoplanet_host, exoplanet_count, exoplanet_names | archive hostname, count and sorted planet names; matched via HIP then HD |

Estimates: Teff from B−V (Ballesteros 2012), radius R = sqrt(L)·(5772/T)²; mass only for class V stars via L ≈ M⁴ (M = L^0.25); g = GM/R². Rough (±30–50%); giants/supergiants get radius but no mass/gravity. Label as "estimated" in UI.

## constellations.json
Each constellation: `abbr` (e.g. `Ori`), `name` (Latin), `english`, `lines_hyg` (polylines as hyg_id arrays), `lines_hip` (same as HIP arrays, original Stellarium), `segments_hip` (HIP pairs). 88 constellations, 695 segments, 0 unmapped HIP. Line endpoints not in stars.json (fainter than 6.5: 2 stars) are in `line_stars` keyed by hyg_id (string) with hyg_id, hip_id, name, ra_deg, dec_deg, mag. Overlay lookup: stars.json by hyg_id, fallback line_stars.

## Counts
8,920 stars; 8,870 with HIP; 441 named; 3,301 with wiki_title; 171 exoplanet hosts / 249 planets; 169 with measured mass+radius; 8,700 with estimated radius; 2,664 with estimated gravity; 205 with unknown distance.

## Sources & licenses (attribute in app)
- HYG Database v4.4, astronexus (codeberg.org/astronexus/hyg) — CC BY-SA 4.0
- Stellarium "modern" sky culture constellation lines — CC BY-SA 4.0
- IAU Catalog of Star Names (IAU-CSN, WGSN) — CC BY
- NASA Exoplanet Archive, Planetary Systems Composite Parameters — public / free (acknowledge NExScI)
- Wikidata (CC0) for HIP→enwiki titles; Wikipedia text itself is CC BY-SA.
Note: CC BY-SA means a redistributed derived dataset should stay CC BY-SA.

## Gotchas
- RA in HYG is hours; here already converted to degrees. Coordinates are J2000; ignore precession/proper motion for a prototype (≲0.4° drift since 2000 is mostly precession — apply precession if matching against plate solves).
- Sirius → Wikidata/Wikipedia "Sirius A" (component item), not "Sirius" system page; similar for other multiples. 55 Cnc has no wiki_title (map gap) — fallback: search Wikipedia by `exoplanet_host`/name.
- HYG `proper` names win over IAU (e.g. 55 Cnc = "Copernicus" from IAU, since HYG has none).
- Exoplanet archive logg vs computed g can disagree slightly; we compute g from st_mass/st_rad.
- `lum` is HYG's visual luminosity, underestimates hot/cool stars' bolometric L.
