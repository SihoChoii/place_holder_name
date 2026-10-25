export class TimeoutError extends Error {
  constructor(message = 'timeout') {
    super(message);
  }
}

/** Child signal aborted by the parent or after `ms`. Call `dispose` to clear the timer. */
export function deadlineSignal(parent: AbortSignal, ms: number): { signal: AbortSignal; dispose(): void; timedOut(): boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(parent.reason);
  if (parent.aborted) controller.abort(parent.reason);
  else parent.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new TimeoutError());
  }, Math.max(0, ms));
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent.removeEventListener('abort', onAbort);
    },
    timedOut: () => timedOut,
  };
}

/**
 * Runs `fn` with a child signal; rejects with TimeoutError after `ms` even if
 * `fn` ignores the signal. Late results are discarded.
 */
export async function withDeadline<T>(parent: AbortSignal, ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const d = deadlineSignal(parent, ms);
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const onAbort = () => reject(d.timedOut() ? new TimeoutError() : abortError(parent));
  if (d.signal.aborted) onAbort();
  else {
    d.signal.addEventListener('abort', onAbort, { once: true });
    fn(d.signal).then(resolve, reject);
  }
  try {
    return await promise;
  } finally {
    d.signal.removeEventListener('abort', onAbort);
    d.dispose();
  }
}

export function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException('aborted', 'AbortError');
}

/** Approximate token count for budgeting only (UTF-8 bytes / 3, rounded up). Not a tokenizer. */
export function estimatedTokens(s: string): number {
  return Math.ceil(Buffer.byteLength(s, 'utf8') / 3);
}

/** Deterministic JSON with sorted object keys, used for call dedupe keys. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]));
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

/** Splits text into chunks of about `size` code points, breaking after spaces when possible. */
export function chunk(text: string, size = 40): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    let end = Math.min(chars.length, i + size);
    if (end < chars.length) {
      const space = chars.lastIndexOf(' ', end);
      if (space > i + size / 2) end = space + 1;
    }
    out.push(chars.slice(i, end).join(''));
    i = end;
  }
  return out;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
