import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, signup } from "./helpers.js";
import { GuideQueue } from "../src/guide/service.js";

const SIRIUS = 32263, CANOPUS = 30365;

function parseSse(body: string) {
  return body.trim().split("\n\n").map((block) => {
    const ev = /^event: (.+)$/m.exec(block)![1];
    return { event: ev, data: JSON.parse(/^data: (.+)$/m.exec(block)![1]) };
  });
}

test("guide chat: SSE protocol, tools, scope, validation, failures", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const a = await signup(h, "ada");
  const chat = (payload: object, headers: Record<string, string> = a.auth) => h.server.app.inject({ method: "POST", url: "/api/agent/chat", headers, payload });

  const ok = await chat({ messages: [{ role: "user", content: "What is this?" }], mode: "local", scope_hyg_ids: [SIRIUS], selected_hyg_id: SIRIUS });
  assert.equal(ok.statusCode, 200);
  assert.match(String(ok.headers["content-type"]), /text\/event-stream/);
  const evs = parseSse(ok.body);
  assert.equal(evs[0].event, "start");
  assert.equal(evs.at(-1)!.event, "done");
  assert.equal(evs.at(-1)!.data.request_id, evs[0].data.request_id);
  assert.equal(evs.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), "Sirius ✨ is bright.");
  const planner = h.fake.calls.filter((c) => c.path === "/api/chat")[0].body;
  assert.equal(planner.options.num_ctx, 4096);
  assert.equal(planner.options.num_predict, 256);
  assert.equal(planner.think, false);
  assert.match(planner.messages[0].content, /Selected star facts/);
  const final = h.fake.calls.filter((c) => c.path === "/api/chat")[1].body;
  assert.equal(final.tools, undefined);
  assert.equal(final.options.num_predict, 512);

  // tool call inside scope → tool result fed to the final call
  h.fake.calls.length = 0;
  const tool = parseSse((await chat({ messages: [{ role: "user", content: "tool:get_star:32263" }], mode: "local", scope_hyg_ids: [SIRIUS] })).body);
  assert.match(tool.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), /Sirius/);
  const toolMsg = h.fake.calls[1].body.messages.find((m: any) => m.role === "tool");
  assert.match(toolMsg.content, /"hyg_id":32263/);
  // tool call outside local scope → error result, never the data
  h.fake.calls.length = 0;
  await chat({ messages: [{ role: "user", content: `tool:get_star:${CANOPUS}` }], mode: "local", scope_hyg_ids: [SIRIUS] });
  assert.match(h.fake.calls[1].body.messages.find((m: any) => m.role === "tool").content, /outside the current view/);

  // validation before streaming
  const code = async (p: Promise<any>) => { const r = await p; return `${r.statusCode} ${r.json().error.code}`; };
  assert.equal(await code(chat({ messages: [{ role: "system", content: "x" }], mode: "explore" })), "400 validation_failed");
  assert.equal(await code(chat({ messages: [{ role: "user", content: "x" }], mode: "local", scope_hyg_ids: [SIRIUS], selected_hyg_id: CANOPUS })), "400 validation_failed");
  assert.equal(await code(chat({ messages: [{ role: "user", content: "x" }], mode: "explore", model: "other" })), "400 validation_failed");
  assert.equal(await code(chat({ messages: [{ role: "user", content: "x" }], mode: "explore" }, {})), "401 unauthorized");
  const long = Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "é".repeat(1500) }));
  assert.equal(await code(chat({ messages: long, mode: "explore" })), "400 context_too_large");
  const trimmed = Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "word ".repeat(100) }));
  h.fake.calls.length = 0;
  assert.equal((await chat({ messages: trimmed, mode: "explore" })).statusCode, 200);
  assert.ok(h.fake.calls[0].body.messages.length < 6); // oldest history trimmed to fit the budget

  // model down before streaming → 503; malformed stream after start → error event
  h.fake.mode = "error";
  assert.equal(await code(chat({ messages: [{ role: "user", content: "hi" }], mode: "explore" })), "503 guide_unavailable");
  h.fake.mode = "malformed";
  const broken = parseSse((await chat({ messages: [{ role: "user", content: "hi" }], mode: "explore" })).body);
  assert.deepEqual(broken.map((e) => e.event), ["start", "error"]);
});

test("guide queue: 1 active + 2 waiting, extra rejected, cancelled waiters release", async () => {
  const q = new GuideQueue(1, 2);
  const ctl = new AbortController();
  const r1 = await q.acquire(ctl.signal);
  const w1 = q.acquire(ctl.signal);
  const abortable = new AbortController();
  const w2 = q.acquire(abortable.signal);
  await assert.rejects(q.acquire(ctl.signal), (e: any) => e.code === "guide_busy");
  abortable.abort();
  await assert.rejects(w2);
  assert.deepEqual(q.depth, { active: 1, waiting: 1 });
  r1();
  const r2 = await w1;
  r2();
  assert.deepEqual(q.depth, { active: 0, waiting: 0 });
});
