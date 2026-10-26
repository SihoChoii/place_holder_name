import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "@stargaze/db";
import { loadConfig } from "../config.js";

/**
 * pnpm db:backup — SQLite online backup (consistent with WAL) plus a copy of the media directory and a
 * manifest of file hashes. Usage: pnpm db:backup [destination-dir]
 */
const config = loadConfig(process.env, { partial: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = process.argv[2] ?? join(config.backupDir, stamp);
mkdirSync(dest, { recursive: true });
const db = openDatabase(config.dbPath);
await db.backup(join(dest, "stargaze.sqlite"));
db.close();
const mediaDest = join(dest, "media");
mkdirSync(mediaDest, { recursive: true });
const files = existsSync(config.mediaDir) ? readdirSync(config.mediaDir).filter((f) => f.endsWith(".webp")) : [];
const manifest = files.map((f) => {
  cpSync(join(config.mediaDir, f), join(mediaDest, f));
  return { file: f, bytes: statSync(join(mediaDest, f)).size, sha256: createHash("sha256").update(readFileSync(join(mediaDest, f))).digest("hex") };
});
writeFileSync(join(dest, "manifest.json"), JSON.stringify({ created_at: Date.now(), db: "stargaze.sqlite", media: manifest }, null, 2));
console.log(JSON.stringify({ backup: dest, media_files: manifest.length }));
