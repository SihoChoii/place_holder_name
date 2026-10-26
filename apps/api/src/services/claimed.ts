import { createHash } from "node:crypto";
import { LIMITS, type ClaimedStar } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import { mediaVisible, tagVisible } from "./visibility.js";

/**
 * Every claimed star with a one-item preview for the website sky (anonymous viewer only, so approved,
 * non-deleted content). One statement; every per-claim lookup is an indexed correlated subquery (tags_claim,
 * media_tag), so it stays linear in the number of claims. (A window-function CTE joined back to the claims
 * was scanned once per claim: ~1.7 s at 8,000 claims.)
 */
const SQL = `
  WITH picked AS (
    SELECT c.hyg_id, c.claimed_at, c.user_id,
      (SELECT t.id FROM tags t WHERE t.claim_id = c.id AND ${tagVisible("t")}
        ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS tag_id,
      (SELECT COUNT(*) FROM tags t WHERE t.claim_id = c.id AND ${tagVisible("t")}) AS n
    FROM star_claims c
  )
  SELECT p.hyg_id, p.claimed_at, u.id AS owner_id, u.display_name, v.note, CASE WHEN v.id IS NULL THEN NULL ELSE p.n END AS n,
    (SELECT m.id FROM media m JOIN tags t ON t.id = m.tag_id
      WHERE m.tag_id = v.id AND m.kind = 'image' AND ${mediaVisible("m", "t")} ORDER BY m.position LIMIT 1) AS image_id,
    (SELECT m.url FROM media m JOIN tags t ON t.id = m.tag_id
      WHERE m.tag_id = v.id AND m.kind = 'link' AND ${mediaVisible("m", "t")} ORDER BY m.position LIMIT 1) AS link_url
  FROM picked p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN tags v ON v.id = p.tag_id
  ORDER BY p.claimed_at, p.hyg_id`;

interface Row {
  hyg_id: number; claimed_at: number; owner_id: string; display_name: string;
  note: string | null; n: number | null; image_id: string | null; link_url: string | null;
}

const excerpt = (s: string | null) => (s == null ? null : [...s].slice(0, LIMITS.noteMaxCodePoints).join(""));
const linkTitle = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } };

export function claimedStars(ctx: Ctx): { stars: ClaimedStar[]; version: string } {
  const rows = ctx.db.prepare(SQL).all({ viewer: "" }) as Row[]; // "" = anonymous: approved content only
  const stars = rows.map((r): ClaimedStar => ({
    hyg_id: r.hyg_id,
    owner: { id: r.owner_id, display_name: r.display_name },
    claimed_at: r.claimed_at,
    preview: r.n == null ? null : {
      type: r.image_id ? "image" : r.link_url ? "link" : "text",
      thumb_url: r.image_id ? `/api/public/media/${r.image_id}?size=thumb` : null,
      title: r.link_url ? linkTitle(r.link_url) : null,
      excerpt: excerpt(r.note),
      approved_count: r.n,
    },
  }));
  // The version is a digest of exactly what anonymous clients see, so it changes on any claim, approval,
  // deletion or rename that affects this list, and never on pending/rejected activity.
  const version = createHash("sha256").update(JSON.stringify(stars)).digest("base64url").slice(0, 22);
  return { stars, version };
}

/** RFC 9110 If-None-Match (weak comparison): "*" or any listed tag equal to ours. */
export function etagMatches(header: string | undefined, etag: string) {
  if (!header) return false;
  return header.split(",").some((t) => { const v = t.trim(); return v === "*" || v.replace(/^W\//, "") === etag; });
}
