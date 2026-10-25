import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Single-instance guard: one API process (and so one moderation loop) per data directory. */
export function acquireProcessLock(dbPath: string): () => void {
  const lock = join(dirname(dbPath), "api.pid");
  mkdirSync(dirname(lock), { recursive: true });
  try {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        throw new Error(`Another Star Tagger API (pid ${pid}) is already using ${dirname(dbPath)}`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; // stale lock from a crashed process
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  writeFileSync(lock, String(process.pid));
  return () => rmSync(lock, { force: true });
}
