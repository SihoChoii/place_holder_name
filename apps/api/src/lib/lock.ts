import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDatabase, type DB } from "@stargaze/db";

/** OS-backed mutex on a dedicated SQLite file, never the application database. Crash releases it. */
export function acquireProcessLock(dbPath: string): () => void {
  const dir = dirname(dbPath);
  const pidFile = join(dir, "api.pid");
  let mutex: DB | undefined;
  try {
    mutex = openDatabase(join(dir, "api.lock.sqlite"), { busyTimeoutMs: 0 });
    mutex.exec("BEGIN IMMEDIATE");
  } catch (e) {
    mutex?.close();
    if ((e as { code?: string }).code?.startsWith("SQLITE_BUSY")) {
      throw new Error(`Another Star Tagger API is already using ${dir}`);
    }
    throw e;
  }
  try {
    // Compatibility: refuse to overlap an older API that only used api.pid.
    try {
      const pid = Number(readFileSync(pidFile, "utf8"));
      if (pid && pid !== process.pid) {
        let alive = true;
        try { process.kill(pid, 0); }
        catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false; else throw e; }
        if (alive) throw new Error(`Another Star Tagger API (pid ${pid}) is already using ${dir}`);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    writeFileSync(pidFile, String(process.pid));
  } catch (e) {
    mutex.close();
    throw e;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (readFileSync(pidFile, "utf8") === String(process.pid)) rmSync(pidFile, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    } finally { mutex!.close(); }
  };
}
