import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

export function saveSpeechScript(
  db: Database.Database,
  args: { userId: string; hygId?: number; script: string; now: number },
): string {
  const id = randomUUID();
  const textHash = createHash('sha256').update(args.script).digest('hex');
  db.prepare(`
    INSERT INTO speech_scripts (id, user_id, hyg_id, text, text_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, args.userId, args.hygId ?? null, args.script, textHash, args.now);
  return id;
}
