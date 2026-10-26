import assert from 'node:assert/strict';
import test from 'node:test';
import { ERROR_STREAM_FIXTURE, SUCCESS_STREAM_FIXTURE } from '../harness/evals/fixtures.js';
import { parseSse } from '../harness/evals/run.js';
import { startStandin } from '../harness/evals/standin.js';

function streamOf(source: string, cuts: number[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(source);
  return new ReadableStream({
    start(controller) {
      let position = 0;
      for (const cut of cuts) { controller.enqueue(bytes.slice(position, cut)); position = cut; }
      controller.enqueue(bytes.slice(position));
      controller.close();
    },
  });
}

test('parseSse handles chunk boundaries, CRLF, and multiline data', async () => {
  const parsed = await parseSse(streamOf(SUCCESS_STREAM_FIXTURE, [1, 29, 68, 103]));
  assert.equal(parsed.requestId, 'fixture-request');
  assert.equal(parsed.text, 'Sirius is bright.');
  assert.equal(parsed.error, undefined);
});

test('parseSse accepts a terminal error but rejects events after it', async () => {
  const parsed = await parseSse(streamOf(ERROR_STREAM_FIXTURE, [9, 52]));
  assert.equal(parsed.error, 'guide_unavailable');
  await assert.rejects(() => parseSse(streamOf(`${ERROR_STREAM_FIXTURE}event: done\ndata: {"request_id":"fixture-request"}\n\n`, [])), /follows terminal/);
});

test('parseSse rejects incomplete and mismatched terminal streams', async () => {
  await assert.rejects(() => parseSse(streamOf('event: start\ndata: {"request_id":"a"}\n\n', [])), /without done/);
  await assert.rejects(() => parseSse(streamOf('event: start\ndata: {"request_id":"a"}\n\nevent: done\ndata: {"request_id":"b"}\n\n', [])), /does not match/);
});

test('standin selects markers from user history rather than a final tool message', async () => {
  const standin = await startStandin({ port: 0 });
  try {
    const response = await fetch(`${standin.url}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '[g2]' }, { role: 'assistant', content: 'Ready.' }, { role: 'user', content: 'How long to get there?' }, { role: 'tool', content: '[g1] unrelated result' }], tools: [{ function: { name: 'calculate_travel_time' } }], stream: false }),
    });
    const reply = await response.json() as { message: { content: string } };
    assert.match(reply.message.content, /17 km\/s/);
    assert.deepEqual(standin.evidence(2).offeredTools, ['calculate_travel_time']);
  } finally {
    await standin.close();
  }
});

test('standin can deterministically simulate the g10 planner outage', async () => {
  const standin = await startStandin({ port: 0, g10Mode: '503' });
  try {
    const response = await fetch(`${standin.url}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '[g10]' }, { role: 'user', content: 'What is this?' }], stream: false }),
    });
    assert.equal(response.status, 503);
  } finally {
    await standin.close();
  }
});

test('planner suggestions are not counted as executed tools and evidence can be reset', async () => {
  const standin = await startStandin({ port: 0 });
  try {
    await fetch(`${standin.url}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '[g2]' }], stream: false }),
    });
    assert.deepEqual(standin.evidence(2).calls, []);
    assert.equal(standin.evidence(2).toolResults, 0);
    assert.equal(standin.evidence(2).requests, 1);
    await fetch(`${standin.url}/__evidence?scenario=2`, { method: 'DELETE' });
    assert.equal(standin.evidence(2).requests, 0);
  } finally {
    await standin.close();
  }
});

test('malformed scenario stays malformed on corrective retry and streams facts afterward', async () => {
  const standin = await startStandin({ port: 0 });
  try {
    const messages = [{ role: 'user', content: '[g6]' }, { role: 'user', content: 'Your tool call was malformed. Call one tool with valid JSON arguments, or answer in plain text.' }];
    const planner = await fetch(`${standin.url}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, stream: false }),
    });
    const malformed = await planner.json() as { message: { content: string } };
    assert.equal(malformed.message.content, '<|tool_call>call:get_star{hyg_id:<tool_call|>');
    const answer = await fetch(`${standin.url}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, stream: true }),
    });
    const chunks = (await answer.text()).trim().split('\n').map((line) => JSON.parse(line) as { message: { content: string }; done: boolean });
    assert.equal(chunks.map((chunk) => chunk.message.content).join(''), 'Sirius is the brightest star in the night sky.');
    assert.equal(chunks.at(-1)?.done, true);
  } finally {
    await standin.close();
  }
});

test('repaired calls require successful Sirius facts rather than a named tool error', async () => {
  const standin = await startStandin({ port: 0 });
  try {
    for (const content of ['{"error":"invalid arguments","hyg_id":32263}', '{"hyg_id":32263,"name":"Sirius"}']) {
      await fetch(`${standin.url}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '[g5]' }, { role: 'tool', tool_name: 'get_star', content }], stream: true }),
      }).then((response) => response.text());
      assert.equal(standin.evidence(5).successfulStarResults, content.includes('"error"') ? 0 : 1);
    }
  } finally {
    await standin.close();
  }
});
