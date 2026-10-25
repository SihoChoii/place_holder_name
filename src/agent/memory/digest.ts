import type Database from 'better-sqlite3';

import type { BackendReads, CommunityItem } from '../types.js';

interface DigestRow {
  json: string;
}

function isCommunityItem(value: unknown): value is CommunityItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.tag_id === 'string'
    && Number.isInteger(item.hyg_id)
    && typeof item.display_name === 'string'
    && typeof item.note === 'string'
    && Number.isFinite(item.created_at)
    && item.status === 'approved';
}

export class Digest {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Database.Database,
    private readonly backend: BackendReads,
    private readonly now: () => number,
  ) {}

  start(): void {
    if (this.timer !== undefined) return;
    void this.refresh(new AbortController().signal);
    this.timer = setInterval(() => {
      void this.refresh(new AbortController().signal);
    }, 5 * 60 * 1_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async refresh(signal: AbortSignal): Promise<void> {
    try {
      const items = await this.backend.communityFeed(10, signal);
      const approved = items.filter((item) => item.status === 'approved');
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM community_digest WHERE id = ?').run('latest');
        this.db.prepare(`
          INSERT INTO community_digest (id, json, computed_at)
          VALUES (?, ?, ?)
        `).run('latest', JSON.stringify(approved), this.now());
      })();
    } catch {
      // Keep the last successfully computed digest when the backend read fails.
    }
  }

  read(limit: number): CommunityItem[] {
    const row = this.db.prepare('SELECT json FROM community_digest WHERE id = ?').get('latest') as DigestRow | undefined;
    if (row === undefined) return [];
    try {
      const parsed: unknown = JSON.parse(row.json);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isCommunityItem).slice(0, Math.max(0, Math.floor(limit)));
    } catch {
      return [];
    }
  }
}
