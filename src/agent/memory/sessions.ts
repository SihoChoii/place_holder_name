import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { Mode, RequestCtx } from '../types.js';

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export type Scope = 'web' | 'local' | 'explore' | `star:${number}`;

export interface Turn {
  user: string;
  assistant: string;
}

interface SessionRow {
  id: string;
  summary: string | null;
  summary_hyg_ids: string | null;
  turns: number;
}

interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
  referenced_hyg_ids: string | null;
}

function knownRefsInView(serializedRefs: string | null, inView: ReadonlySet<number>): boolean {
  if (serializedRefs === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedRefs);
  } catch {
    return false;
  }
  return Array.isArray(parsed) && parsed.every((id) => Number.isInteger(id) && id >= 0 && inView.has(id));
}

function refsJson(refs: readonly number[]): string {
  return JSON.stringify([...new Set(refs.filter((id) => Number.isSafeInteger(id) && id >= 0))]);
}

/** Derives the one persisted conversation scope for a validated request. */
export function scopeFor(ctx: Pick<RequestCtx, 'client' | 'mode' | 'selected'>): Scope {
  if (ctx.client === 'web') return 'web';
  if (ctx.selected !== undefined) return `star:${ctx.selected}`;
  if (ctx.mode === 'local') return 'local';
  return 'explore';
}

export class SessionStore {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => number,
  ) {}

  load(
    userId: string,
    scope: Scope,
    view: { mode: Mode; inView: ReadonlySet<number> },
  ): { turns: Turn[]; summary: string | null } {
    const session = this.db.prepare(`
      SELECT id, summary, summary_hyg_ids, turns
      FROM agent_sessions
      WHERE user_id = ? AND scope = ?
    `).get(userId, scope) as SessionRow | undefined;
    if (session === undefined) return { turns: [], summary: null };

    const messages = this.db.prepare(`
      SELECT role, content, referenced_hyg_ids
      FROM agent_messages
      WHERE session_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(session.id) as MessageRow[];
    const local = view.mode === 'local';
    const eligible: Turn[] = [];
    let pendingUser: MessageRow | null = null;

    for (const message of messages) {
      if (message.role === 'user') {
        pendingUser = message;
        continue;
      }
      if (pendingUser === null) continue;
      if (
        !local
        || (
          knownRefsInView(pendingUser.referenced_hyg_ids, view.inView)
          && knownRefsInView(message.referenced_hyg_ids, view.inView)
        )
      ) {
        eligible.push({ user: pendingUser.content, assistant: message.content });
      }
      pendingUser = null;
    }

    const summary = session.summary === null || (
      local && !knownRefsInView(session.summary_hyg_ids, view.inView)
    ) ? null : session.summary;
    return { turns: eligible.slice(-4), summary };
  }

  save(
    userId: string,
    scope: Scope,
    turn: {
      user: string;
      assistant: string;
      refs: readonly number[];
      topic: string;
      starName?: string;
      speedC: number;
    },
  ): void {
    const savedAt = this.now();
    const references = refsJson(turn.refs);
    this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT id, summary, summary_hyg_ids, turns
        FROM agent_sessions
        WHERE user_id = ? AND scope = ?
      `).get(userId, scope) as SessionRow | undefined;
      const sessionId = existing?.id ?? randomUUID();
      const turns = (existing?.turns ?? 0) + 1;

      if (existing === undefined) {
        this.db.prepare(`
          INSERT INTO agent_sessions (id, user_id, scope, summary, turns, updated_at, summary_hyg_ids)
          VALUES (?, ?, ?, NULL, ?, ?, NULL)
        `).run(sessionId, userId, scope, turns, savedAt);
      } else {
        this.db.prepare('UPDATE agent_sessions SET turns = ?, updated_at = ? WHERE id = ?')
          .run(turns, savedAt, sessionId);
      }

      const insertMessage = this.db.prepare(`
        INSERT INTO agent_messages (id, session_id, role, content, created_at, referenced_hyg_ids)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertMessage.run(randomUUID(), sessionId, 'user', turn.user, savedAt, references);
      insertMessage.run(randomUUID(), sessionId, 'assistant', turn.assistant, savedAt, references);

      if (turns % 8 === 0) {
        const summary = `Recent topic: ${turn.topic}. Star: ${turn.starName ?? 'none'}. Preferred speed: ${turn.speedC}c.`;
        this.db.prepare(`
          UPDATE agent_sessions
          SET summary = ?, summary_hyg_ids = ?
          WHERE id = ?
        `).run(summary, references, sessionId);
      }

      this.db.prepare(`
        DELETE FROM agent_messages
        WHERE session_id = ?
          AND rowid NOT IN (
            SELECT rowid FROM agent_messages
            WHERE session_id = ?
            ORDER BY created_at DESC, rowid DESC
            LIMIT 50
          )
      `).run(sessionId, sessionId);
    })();
  }

  recordRecentStar(userId: string, hygId: number): void {
    const viewedAt = this.now();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO user_recent_stars (user_id, hyg_id, viewed_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, hyg_id) DO UPDATE SET viewed_at = excluded.viewed_at
      `).run(userId, hygId, viewedAt);
      this.db.prepare(`
        DELETE FROM user_recent_stars
        WHERE user_id = ?
          AND hyg_id NOT IN (
            SELECT hyg_id FROM user_recent_stars
            WHERE user_id = ?
            ORDER BY viewed_at DESC, hyg_id DESC
            LIMIT 20
          )
      `).run(userId, userId);
    })();
  }

  recentStars(userId: string, limit: number): number[] {
    const cappedLimit = Math.max(0, Math.min(20, Math.floor(limit)));
    if (cappedLimit === 0) return [];
    const rows = this.db.prepare(`
      SELECT hyg_id
      FROM user_recent_stars
      WHERE user_id = ?
      ORDER BY viewed_at DESC, hyg_id DESC
      LIMIT ?
    `).all(userId, cappedLimit) as Array<{ hyg_id: number }>;
    return rows.map((row) => row.hyg_id);
  }

  purgeExpired(): void {
    const cutoff = this.now() - SESSION_RETENTION_MS;
    this.db.transaction(() => {
      this.db.prepare(`
        DELETE FROM agent_messages
        WHERE session_id IN (SELECT id FROM agent_sessions WHERE updated_at < ?)
      `).run(cutoff);
      this.db.prepare('DELETE FROM agent_sessions WHERE updated_at < ?').run(cutoff);
      this.db.prepare('DELETE FROM speech_scripts WHERE created_at < ?').run(cutoff);
    })();
  }
}
