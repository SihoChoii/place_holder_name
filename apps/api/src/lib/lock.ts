import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { openDatabase, type DB } from "@stargaze/db";

/** Another API already owns the data directory; callers print the message and exit without a stack trace. */
export class ProcessLockError extends Error {}

const MARKER = "stargaze-api";

/**
 * OS-backed mutex on a dedicated SQLite file, never the application database. Crash releases it.
 * api.pid is diagnostic JSON ({app, pid, started_at, db}); the mutex alone decides ownership.
 */
export function acquireProcessLock(dbPath: string): () => void {
  const dir = dirname(dbPath);
  const pidFile = join(dir, "api.pid");
  const held = (who = "") => new ProcessLockError(`Another Star Tagger API${who} is already using ${dir}; stop it first.`);
  let mutex: DB | undefined;
  try {
    mutex = openDatabase(join(dir, "api.lock.sqlite"), { busyTimeoutMs: 0 });
    mutex.exec("BEGIN IMMEDIATE");
  } catch (e) {
    mutex?.close();
    if ((e as { code?: string }).code?.startsWith("SQLITE_BUSY")) throw held();
    throw e;
  }
  const marker = JSON.stringify({ app: MARKER, pid: process.pid, started_at: new Date().toISOString(), db: resolve(dbPath) });
  try {
    const legacy = legacyOwner(pidFile);
    if (legacy) throw held(` (pid ${legacy})`);
    writeFileSync(pidFile, marker);
  } catch (e) {
    mutex.close();
    throw e;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (readFileSync(pidFile, "utf8") === marker) rmSync(pidFile, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    } finally { mutex!.close(); }
  };
}

/**
 * Compatibility with older APIs that wrote a bare PID and no mutex. A JSON marker is never an owner (a live
 * owner would hold the mutex). A bare PID blocks only if that process is alive AND is a Node API process,
 * so a stale PID reused by an unrelated program cannot block startup.
 */
function legacyOwner(pidFile: string): number | null {
  let text: string;
  try { text = readFileSync(pidFile, "utf8").trim(); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  if (!/^\d+$/.test(text)) return null;
  const pid = Number(text);
  if (!pid || pid === process.pid) return null;
  try { process.kill(pid, 0); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") return null; }
  let command = "";
  try { command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 }); }
  catch { return null; }
  return /\bnode\b/.test(command) && /apps\/api\/(dist|src)\/index\.[jt]s/.test(command) ? pid : null;
}
