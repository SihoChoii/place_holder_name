import assert from 'node:assert/strict';
import test from 'node:test';
import { FifoLimiter, QueueFullError, runLimited } from '../src/agent/model/queue.js';

test('canceling a waiting ticket removes it without leaking a slot', async () => {
  const limiter = new FifoLimiter(1, 2);
  const active = limiter.reserve();
  const waiting = limiter.reserve();
  assert.ok(active && waiting);
  await active.acquire(new AbortController().signal);

  const aborted = new AbortController();
  const wait = waiting.acquire(aborted.signal);
  aborted.abort(new DOMException('client closed', 'AbortError'));
  await assert.rejects(wait, { name: 'AbortError' });
  assert.equal(limiter.queued, 0);

  active.release();
  assert.equal(limiter.active, 0);
  const next = limiter.reserve();
  assert.ok(next);
  await next.acquire(new AbortController().signal);
  assert.equal(limiter.active, 1);
  next.release();
  assert.equal(limiter.active, 0);
});

test('release hands the permit directly to FIFO waiter without oversubscription', async () => {
  const limiter = new FifoLimiter(1, 2);
  const first = limiter.reserve();
  const second = limiter.reserve();
  const third = limiter.reserve();
  assert.ok(first && second && third);
  await first.acquire(new AbortController().signal);
  const secondWait = second.acquire(new AbortController().signal);
  const thirdWait = third.acquire(new AbortController().signal);

  first.release();
  await secondWait;
  assert.equal(limiter.active, 1);
  assert.equal(limiter.queued, 1);
  second.release();
  await thirdWait;
  assert.equal(limiter.active, 1);
  third.release();
  assert.equal(limiter.active, 0);
});

test('runLimited rejects a full limiter before running work', async () => {
  const limiter = new FifoLimiter(1, 0);
  const ticket = limiter.reserve();
  assert.ok(ticket);
  await ticket.acquire(new AbortController().signal);
  await assert.rejects(runLimited(limiter, new AbortController().signal, async () => 'no'), QueueFullError);
  ticket.release();
});
