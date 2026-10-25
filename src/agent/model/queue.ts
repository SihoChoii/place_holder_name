import { abortError } from '../util.js';

export class QueueFullError extends Error {
  constructor() {
    super('model queue is full');
    this.name = 'QueueFullError';
  }
}

export interface Ticket {
  readonly position: number;
  acquire(signal: AbortSignal): Promise<void>;
  release(): void;
}

type TicketState = 'waiting' | 'active' | 'released';

interface Waiter {
  ticket: LimiterTicket;
}

class LimiterTicket implements Ticket {
  private state: TicketState;
  private acquirePromise: Promise<void> | null = null;
  private resolveAcquire: (() => void) | null = null;
  private rejectAcquire: ((reason: Error) => void) | null = null;
  private signal: AbortSignal | null = null;
  private onAbort: (() => void) | null = null;

  constructor(
    private readonly limiter: FifoLimiter,
    readonly position: number,
    granted: boolean,
  ) {
    this.state = granted ? 'active' : 'waiting';
  }

  acquire(signal: AbortSignal): Promise<void> {
    if (this.acquirePromise) return this.acquirePromise;
    if (this.state === 'active') {
      return signal.aborted ? Promise.reject(abortError(signal)) : Promise.resolve();
    }
    if (this.state === 'released') return Promise.reject(new DOMException('released', 'AbortError'));

    const deferred = Promise.withResolvers<void>();
    this.acquirePromise = deferred.promise;
    this.resolveAcquire = deferred.resolve;
    this.rejectAcquire = deferred.reject;
    this.signal = signal;
    this.onAbort = () => this.cancel(abortError(signal));
    if (signal.aborted) this.onAbort();
    else signal.addEventListener('abort', this.onAbort, { once: true });
    return this.acquirePromise;
  }

  release(): void {
    if (this.state === 'released') return;
    if (this.state === 'waiting') {
      this.cancel(new DOMException('released', 'AbortError'));
      return;
    }
    this.state = 'released';
    this.limiter.releaseActive();
  }

  grant(): void {
    if (this.state !== 'waiting') return;
    this.state = 'active';
    this.removeAbortListener();
    this.resolveAcquire?.();
  }

  private cancel(reason: Error): void {
    if (this.state !== 'waiting') return;
    this.state = 'released';
    this.limiter.removeWaiter(this);
    this.removeAbortListener();
    this.rejectAcquire?.(reason);
  }

  private removeAbortListener(): void {
    if (this.signal && this.onAbort) this.signal.removeEventListener('abort', this.onAbort);
    this.signal = null;
    this.onAbort = null;
  }
}

export class FifoLimiter {
  private activeCount = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
    if (!(maxQueue === Infinity || (Number.isInteger(maxQueue) && maxQueue >= 0))) {
      throw new RangeError('maxQueue must be a non-negative integer or Infinity');
    }
  }

  get active(): number {
    return this.activeCount;
  }

  get queued(): number {
    return this.waiters.length;
  }

  reserve(): Ticket | null {
    if (this.activeCount < this.max && this.waiters.length === 0) {
      this.activeCount++;
      return new LimiterTicket(this, 0, true);
    }
    if (this.waiters.length >= this.maxQueue) return null;
    // 1-based place in line; 0 is reserved for an immediately granted slot.
    const ticket = new LimiterTicket(this, this.waiters.length + 1, false);
    this.waiters.push({ ticket });
    return ticket;
  }

  removeWaiter(ticket: LimiterTicket): void {
    const index = this.waiters.findIndex((waiter) => waiter.ticket === ticket);
    if (index !== -1) this.waiters.splice(index, 1);
  }

  releaseActive(): void {
    if (this.activeCount === 0) return;
    this.activeCount--;
    const next = this.waiters.shift();
    if (!next) return;
    this.activeCount++;
    next.ticket.grant();
  }
}

export async function runLimited<T>(limiter: FifoLimiter, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const ticket = limiter.reserve();
  if (!ticket) throw new QueueFullError();
  try {
    await ticket.acquire(signal);
    return await fn();
  } finally {
    ticket.release();
  }
}
