import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { DB } from "@stargaze/db";

/**
 * Private media layout: <MEDIA_DIR>/<uuid>.webp (immutable), <MEDIA_DIR>/thumbs/<uuid>.webp (derived, lazily
 * created, same name as the original) and <MEDIA_DIR>/tmp/ for in-flight uploads and thumbnails.
 */
export class MediaStore {
  readonly tmpDir: string;
  readonly thumbsDir: string;
  constructor(readonly dir: string) {
    this.tmpDir = join(dir, "tmp");
    this.thumbsDir = join(dir, "thumbs");
    mkdirSync(this.tmpDir, { recursive: true });
    mkdirSync(this.thumbsDir, { recursive: true });
  }
  path(fileName: string) {
    if (!/^[0-9a-f-]{36}\.webp$/.test(fileName)) throw new Error("invalid media file name");
    return join(this.dir, fileName);
  }
  thumbPath(fileName: string) {
    this.path(fileName); // same name validation
    return join(this.thumbsDir, fileName);
  }
  async removeAll(paths: string[]) {
    await Promise.all(paths.map((p) => rm(p, { force: true })));
  }
  /** Remove unreferenced files older than maxAgeMs (crash leftovers); never touches recent in-flight files. */
  cleanupOrphans(db: DB, now: number, maxAgeMs = 60 * 60 * 1000) {
    const referenced = new Set((db.prepare("SELECT file_name FROM media WHERE file_name IS NOT NULL").all() as { file_name: string }[]).map((r) => r.file_name));
    let removed = 0;
    for (const [dir, isTmp] of [[this.dir, false], [this.tmpDir, true]] as const) {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        const st = statSync(p);
        if (!st.isFile() || now - st.mtimeMs < maxAgeMs) continue;
        if (isTmp || f.endsWith(".webp.part") || (f.endsWith(".webp") && !referenced.has(f))) {
          rmSync(p, { force: true });
          removed++;
        }
      }
    }
    // Thumbnails are derived: drop old ones whose original is gone or no longer referenced.
    for (const f of readdirSync(this.thumbsDir)) {
      const p = join(this.thumbsDir, f);
      const st = statSync(p);
      if (!st.isFile() || now - st.mtimeMs < maxAgeMs) continue;
      if (!referenced.has(f) || !existsSync(join(this.dir, f))) {
        rmSync(p, { force: true });
        removed++;
      }
    }
    return removed;
  }
}
