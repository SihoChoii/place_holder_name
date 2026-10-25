import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = Database.Database;

/** Open the SQLite database with the pragmas the spec requires (WAL, FKs, 5 s busy timeout). */
export function openDatabase(path: string, opts: { readonly?: boolean; busyTimeoutMs?: number } = {}): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const timeout = opts.busyTimeoutMs ?? 5000;
  const db = new Database(path, { readonly: opts.readonly ?? false, timeout });
  try {
    if (!opts.readonly) db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma(`busy_timeout = ${timeout}`);
    db.pragma("synchronous = NORMAL");
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/**
 * Run fn inside a synchronous IMMEDIATE transaction. fn must not await: better-sqlite3 throws if a
 * transaction function returns a promise, which enforces "no filesystem/HTTP work in a transaction".
 */
export function immediate<T>(db: DB, fn: () => T): T {
  return db.transaction(fn).immediate();
}
