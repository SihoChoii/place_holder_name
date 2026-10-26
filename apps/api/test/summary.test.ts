import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, signup, ORIGIN } from "./helpers.js";

/** Fake Wikipedia + xAI: intercepts only those fixed hosts; everything else (the fake Ollama) goes to the network. */
function fakeUpstreams(state: { wiki: "ok" | "missing" | "down"; calls: string[] }): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "en.wikipedia.org") {
      state.calls.push(url.href);
      if (state.wiki === "down") throw new TypeError("fetch failed");
      if (state.wiki === "missing") return new Response('{"type":"not_found"}', { status: 404 });
      return Response.json({ type: "standard", title: "Sirius", extract: "Sirius is the brightest star in the night sky.",
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Sirius" } } });
    }
    if (url.hostname === "api.x.ai") {
      state.calls.push(url.href);
      return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { headers: { "content-type": "audio/mpeg" } });
    }
    return fetch(input, init);
  };
}

async function setup(env: Record<string, string> = {}) {
  const state = { wiki: "ok" as "ok" | "missing" | "down", calls: [] as string[] };
  const h = await harness(env, { summaryFetch: fakeUpstreams(state) });
  const a = await signup(h, "sumuser");
  const post = (payload: unknown, auth = true) => h.server.app.inject({
    method: "POST", url: "/api/agent/summary", payload: payload as object,
    headers: { origin: ORIGIN, ...(auth ? a.auth : {}) },
  });
  return { h, state, post };
}

test("summary: text-only success, auth, validation, unknown star, no-store", async () => {
  const { h, state, post } = await setup({ XAI_API_KEY: "" });
  try {
    const ok = await post({ hyg_id: 32263 });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.deepEqual(ok.json(), { hyg_id: 32263, title: "Sirius", blurb: "OK",
      source: { title: "Sirius", url: "https://en.wikipedia.org/wiki/Sirius" }, audio: null });
    assert.match(String(ok.headers["cache-control"]), /no-store/);
    assert.equal((await post({ hyg_id: 32263 }, false)).statusCode, 401);
    for (const bad of [{}, { hyg_id: "x" }, { hyg_id: 32263, extra: 1 }, { hyg_id: 32263, audio: "yes" }]) {
      const r = await post(bad);
      assert.equal(r.statusCode, 400, JSON.stringify(bad));
      assert.ok(r.json().error.code);
    }
    assert.equal((await post({ hyg_id: 999999999 })).statusCode, 404);
    assert.equal((await post({ hyg_id: 118360 })).statusCode, 404, "unnamed star has no article");
    // audio requested but no key: clean degraded text response, no xAI call
    const noKey = await post({ hyg_id: 32263, audio: true });
    assert.equal(noKey.statusCode, 200);
    assert.equal(noKey.json().audio, null);
    assert.ok(!state.calls.some((u) => u.includes("x.ai")));
  } finally { await h.close(); }
});

test("summary: audio with a key, upstream failures map to 404/503/504", async () => {
  const { h, state, post } = await setup({ XAI_API_KEY: "test-key-not-real" });
  try {
    const withAudio = await post({ hyg_id: 32263, audio: true });
    assert.equal(withAudio.statusCode, 200, withAudio.body);
    assert.deepEqual(withAudio.json().audio, { mime_type: "audio/mpeg", base64: "//uQAA==" });
    assert.ok(!withAudio.body.includes("test-key-not-real"));
    assert.equal((await post({ hyg_id: 32263 })).json().audio, null, "text-only by default");

    state.wiki = "missing";
    assert.equal((await post({ hyg_id: 32263 })).statusCode, 404);
    state.wiki = "down";
    const down = await post({ hyg_id: 32263 });
    assert.equal(down.statusCode, 503);
    assert.equal(down.json().error.code, "guide_unavailable");
    state.wiki = "ok";
    h.fake.mode = "error";
    assert.equal((await post({ hyg_id: 32263 })).statusCode, 503);
    h.fake.mode = "hang";
    const slow = await post({ hyg_id: 32263 });
    assert.equal(slow.statusCode, 504);
    assert.equal(slow.json().error.code, "guide_timeout");
  } finally { await h.close(); }
});

test("summary: per-user rate limit returns 429 with Retry-After", async () => {
  const { h, post } = await setup({ RATE_SUMMARY_PER_HOUR: "1" });
  try {
    assert.equal((await post({ hyg_id: 32263 })).statusCode, 200);
    const limited = await post({ hyg_id: 32263 });
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);
  } finally { await h.close(); }
});

test("chat: get_wikipedia_summary tool resolves the authorized star and stays in scope", async () => {
  const { h, state } = await setup();
  try {
    const a = await signup(h, "chatwiki");
    const chat = (payload: object) => h.server.app.inject({ method: "POST", url: "/api/agent/chat", headers: { origin: ORIGIN, ...a.auth }, payload });
    const ok = await chat({ mode: "explore", messages: [{ role: "user", content: "wikipedia tool:get_wikipedia_summary:32263" }] });
    assert.equal(ok.statusCode, 200);
    assert.match(ok.body, /event: done/);
    const final = h.fake.calls.filter((c) => c.path === "/api/chat").at(-1)!.body as { messages: { role: string; content: string }[] };
    assert.match(JSON.stringify(final.messages), /brightest star/);
    assert.match(final.messages[0].content, /read-only star guide/);
    state.calls.length = 0;
    await chat({ mode: "local", scope_hyg_ids: [118360], messages: [{ role: "user", content: "tool:get_wikipedia_summary:32263" }] });
    assert.equal(state.calls.length, 0, "out-of-scope star is never looked up");
  } finally { await h.close(); }
});
