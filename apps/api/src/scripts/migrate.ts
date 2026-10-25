import { migrate, openDatabase } from "@stargaze/db";
import { loadConfig } from "../config.js";

/** pnpm db:migrate — apply unapplied SQLite migrations to DB_PATH (resolved from the repo root). */
const config = loadConfig(process.env, { partial: true });
const db = openDatabase(config.dbPath);
const r = migrate(db);
db.close();
console.log(JSON.stringify({ db: config.dbPath, applied: r.applied, already_applied: r.alreadyApplied }));
