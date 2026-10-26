import { tooMany } from "./errors.js";

/**
 * Fixed-window in-memory counters. Sufficient for the single-process LAN release (spec §12);
 * the claim cooldown is enforced separately from persisted claims.
 */
export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  constructor(private now: () => number = Date.now) {}

  /** Count one hit; throws 429 rate_limited (with Retry-After) when the limit is exceeded. */
  hit(key: string, limit: number, windowMs: number): void {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= t) {
      w = { count: 0, resetAt: t + windowMs };
      this.windows.set(key, w);
    }
    if (w.count >= limit) throw tooMany("rate_limited", "Too many requests. Try again later.", (w.resetAt - t) / 1000);
    w.count++;
    if (this.windows.size > 10_000) this.sweep(t);
  }

  /** Give back one hit in the current window (work that was counted but never admitted). */
  refund(key: string): void {
    const w = this.windows.get(key);
    if (w && w.resetAt > this.now() && w.count > 0) w.count--;
  }

  private sweep(t: number) {
    for (const [k, w] of this.windows) if (w.resetAt <= t) this.windows.delete(k);
  }
}

/** Small counting semaphore used to bound CPU-heavy work (password hashing, image decoding). */
export class Semaphore {
  private queue: (() => void)[] = [];
  constructor(private available: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.available > 0) this.available--;
    else await new Promise<void>((r) => this.queue.push(r));
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.available++;
    }
  }
}
