export class SlidingWindowLimiter {
  private readonly accepted = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  check(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const entries = (this.accepted.get(key) ?? []).filter((at) => at > cutoff);
    if (entries.length === 0) this.accepted.delete(key);
    else this.accepted.set(key, entries);
    if (entries.length < this.limit) return { ok: true };
    const earliest = entries[0] as number;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((earliest + this.windowMs - now) / 1_000)) };
  }

  record(key: string): void {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const entries = (this.accepted.get(key) ?? []).filter((at) => at > cutoff);
    entries.push(now);
    this.accepted.set(key, entries);
  }
}
