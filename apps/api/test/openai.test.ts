import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config.js";
import { GemmaClient } from "../src/models/gemma.js";
import { ClefClient } from "../src/models/clef.js";
import { modelIdentity, sameIdentity } from "../src/models/http.js";
import { startFakeOllama } from "./fixtures/fake-ollama.js";
import { harness, ORIGIN, signup } from "./helpers.js";

const SIRIUS = 32263;
const KEY = "sk-test-not-a-real-key-123";
const OPENAI = { GUIDE_API_STYLE: "openai", GUIDE_API_KEY: KEY, CLEF_API_STYLE: "openai", CLEF_API_KEY: KEY, GUIDE_MODEL: "fake", CLEF_MODEL: "fake" };
const sse = (body: string) => body.trim().split("\n\n").map((b) => ({ event: /^event: (.+)$/m.exec(b)![1], data: JSON.parse(/^data: (.+)$/m.exec(b)![1]) }));
const text = (evs: ReturnType<typeof sse>) => evs.filter((e) => e.event === "delta").map((e) => e.data.text).join("");

test("config: API style and keys are validated and default to ollama without a key", () => {
  const base = { JWT_SECRET: "x".repeat(32), GUIDE_BASE_URL: "http://g.test", CLEF_BASE_URL: "http://c.test" };
  const c = loadConfig(base, { dotenv: false });
  assert.deepEqual([c.guide.apiStyle, c.guide.apiKey, c.clef.apiStyle, c.clef.apiKey], ["ollama", "", "ollama", ""]);
  const o = loadConfig({ ...base, GUIDE_API_STYLE: "OpenAI", GUIDE_API_KEY: KEY }, { dotenv: false });
  assert.equal(o.guide.apiStyle, "openai");
  assert.throws(() => loadConfig({ ...base, CLEF_API_STYLE: "grpc" }, { dotenv: false }), /CLEF_API_STYLE must be ollama or openai/);
});

test("openai client: Bearer key, enable_thinking off, max_tokens, reasoning ignored, SSE parsed", async (t) => {
  const fake = await startFakeOllama();
  t.after(() => fake.close());
  fake.apiKey = KEY;
  const g = new GemmaClient(fake.url, "fake", 5000, false, { style: "openai", apiKey: KEY });
  const m = await g.chat({ messages: [{ role: "user", content: "hi" }], numPredict: 8 });
  assert.equal(m.content, "OK");
  assert.ok(!("reasoning_content" in m));
  const call = fake.calls[0];
  assert.equal(call.path, "/v1/chat/completions");
  assert.equal(call.auth, `Bearer ${KEY}`);
  assert.equal(call.body.max_tokens, 8);
  assert.deepEqual(call.body.chat_template_kwargs, { enable_thinking: false });
  for (const k of ["options", "think", "keep_alive"]) assert.ok(!(k in call.body), k);
  let out = "";
  for await (const d of g.stream({ messages: [{ role: "user", content: "hi" }], numPredict: 16 })) out += d;
  assert.equal(out, "Sirius ✨ is bright.");

  // tool call: string arguments parsed, id kept; malformed arguments become {} (tool error), not a crash
  const tc = await g.chat({ messages: [{ role: "user", content: "tool:get_star:32263" }], tools: [{}], numPredict: 8 });
  assert.deepEqual(tc.tool_calls, [{ id: "call_fake_1", function: { name: "get_star", arguments: { hyg_id: 32263 } } }]);
  const bad = await g.chat({ messages: [{ role: "user", content: "tool:get_star:1 badargs" }], tools: [{}], numPredict: 8 });
  assert.deepEqual(bad.tool_calls?.[0].function.arguments, {});

  // wrong key: HTTP error without the key in the message
  const wrong = new GemmaClient(fake.url, "fake", 5000, false, { style: "openai", apiKey: "sk-wrong" });
  await assert.rejects(wrong.chat({ messages: [{ role: "user", content: "hi" }], numPredict: 1 }), (e: Error) => /HTTP 401/.test(e.message) && !e.message.includes(KEY));
  fake.mode = "malformed";
  await assert.rejects(async () => { for await (const _ of g.stream({ messages: [{ role: "user", content: "x" }], numPredict: 4 })); }, /malformed/);

  // Clef sends the key too
  fake.mode = "ok";
  const clef = new ClefClient(fake.url, "fake", 5000, KEY);
  const p = await clef.decide("hello", { sexual: { type: "noul", instructions: "x" } });
  assert.equal(p.sexual, 0.02);
  assert.equal(fake.calls.at(-1)!.auth, `Bearer ${KEY}`);
});

test("openai style end to end: chat with a tool round, summary, 401 maps to guide_unavailable", async (t) => {
  const h = await harness(OPENAI, {
    summaryFetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== "en.wikipedia.org") return fetch(input, init);
      return Response.json({ type: "standard", title: "Sirius", extract: "Sirius is the brightest star in the night sky.",
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Sirius" } } });
    },
  });
  t.after(() => h.close());
  h.fake.apiKey = KEY;
  const a = await signup(h, "oai");
  const chat = (content: string) => h.server.app.inject({ method: "POST", url: "/api/agent/chat", headers: a.auth,
    payload: { messages: [{ role: "user", content }], mode: "local", scope_hyg_ids: [SIRIUS] } });

  const evs = sse((await chat(`tool:get_star:${SIRIUS}`)).body);
  assert.deepEqual([evs[0].event, evs.at(-1)!.event], ["start", "done"]);
  assert.match(text(evs), /Tool said .*"hyg_id":32263/);
  const [planner, final] = h.fake.calls.filter((c) => c.path === "/v1/chat/completions").map((c) => c.body);
  assert.equal(planner.max_tokens, 256);
  assert.ok(planner.tools.length > 0);
  const echo = final.messages.find((m: any) => m.role === "assistant" && m.tool_calls);
  const result = final.messages.find((m: any) => m.role === "tool");
  assert.equal(typeof echo.tool_calls[0].function.arguments, "string");
  assert.deepEqual(JSON.parse(echo.tool_calls[0].function.arguments), { hyg_id: SIRIUS });
  assert.equal(echo.tool_calls[0].type, "function");
  assert.equal(result.tool_call_id, echo.tool_calls[0].id);
  assert.ok(!("tool_name" in result));
  assert.ok(Buffer.byteLength(JSON.stringify(final.messages)) <= 2800);
  assert.ok(h.fake.calls.every((c) => c.auth === `Bearer ${KEY}`));

  const sum = await h.server.app.inject({ method: "POST", url: "/api/agent/summary", headers: { origin: ORIGIN, ...a.auth }, payload: { hyg_id: SIRIUS } });
  assert.equal(sum.statusCode, 200, sum.body);
  assert.equal(sum.json().blurb, "OK");
  const rewrite = h.fake.calls.at(-1)!;
  assert.equal(rewrite.path, "/v1/chat/completions");
  assert.equal(rewrite.body.max_tokens, 160);

  h.fake.apiKey = "rotated-key";
  const denied = await chat("hello");
  assert.equal(denied.statusCode, 503);
  assert.equal(denied.json().error.code, "guide_unavailable");
  assert.ok(!denied.body.includes(KEY));
  const sumDenied = await h.server.app.inject({ method: "POST", url: "/api/agent/summary", headers: { origin: ORIGIN, ...a.auth }, payload: { hyg_id: SIRIUS } });
  assert.equal(sumDenied.statusCode, 503);
  assert.ok(!sumDenied.body.includes(KEY));
});

test("openai style readiness: /v1/models identity, loaded flag, no false drift, key never reported", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-oai-lock-"));
  const lockPath = join(dir, "model-lock.json");
  const h = await harness({ ...OPENAI, MODEL_LOCK_PATH: lockPath });
  t.after(async () => { await h.close(); rmSync(dir, { recursive: true, force: true }); });
  h.fake.apiKey = KEY;
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.guide.status, "unverified");
  const id = await modelIdentity("openai", h.fake.url, "fake", KEY);
  assert.deepEqual(id, { api_style: "openai", model: "fake" });
  writeFileSync(lockPath, JSON.stringify({ guide: id, moderation: id }));
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.report().status, "ok");
  assert.ok(!h.fake.calls.some((c) => c.path.startsWith("/api/")), "no Ollama-only endpoints in openai style");

  h.fake.openaiModels = [{ id: "fake", loaded: false }];
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.guide.status, "unavailable");
  await assert.rejects(modelIdentity("openai", h.fake.url, "fake", KEY), /not loaded/);
  h.fake.openaiModels = [{ id: "other" }];
  await assert.rejects(modelIdentity("openai", h.fake.url, "fake", KEY), /not listed/);
  const res = await h.server.app.inject({ url: "/api/health/ready" });
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes(KEY));

  assert.ok(sameIdentity("openai", { api_style: "openai", model: "m" }, { api_style: "openai", model: "m", digest: "d" }));
  assert.ok(!sameIdentity("openai", { api_style: "openai", model: "m" }, { api_style: "openai", model: "n" }));
  assert.ok(!sameIdentity("openai", { ollama_version: "1", model: "m", digest: "d" }, { api_style: "openai", model: "m" }));
});
