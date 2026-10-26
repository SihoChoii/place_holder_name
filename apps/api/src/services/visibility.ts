/**
 * The one visibility policy (spec §10). Every read path and guide tool builds its SQL from these
 * fragments with an @viewer parameter: the caller's user id, or "" for anonymous/guide (never matches).
 *
 * - tag:     not deleted AND (approved OR authored by viewer)
 * - media:   parent tag visible AND (approved OR parent authored by viewer)
 * - comment: not deleted AND (approved OR authored by viewer) AND parent tag approved and not deleted
 * - counts:  approved, non-deleted content only (see content.ts)
 */
export const tagVisible = (t = "t") =>
  `(${t}.deleted_at IS NULL AND (${t}.moderation_status = 'approved' OR ${t}.user_id = @viewer))`;

export const mediaVisible = (m = "m", t = "t") =>
  `(${tagVisible(t)} AND (${m}.moderation_status = 'approved' OR ${t}.user_id = @viewer))`;

export const commentVisible = (c = "c", t = "t") =>
  `(${c}.deleted_at IS NULL AND (${c}.moderation_status = 'approved' OR ${c}.user_id = @viewer)
    AND ${t}.deleted_at IS NULL AND ${t}.moderation_status = 'approved')`;

/** Parent eligibility for new comments and reactions: approved and not deleted. */
export const tagInteractive = (t = "t") => `(${t}.deleted_at IS NULL AND ${t}.moderation_status = 'approved')`;
