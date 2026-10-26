import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { acquireProcessLock } from "../src/lib/lock.js";
import { REPO_ROOT } from "../src/lib/paths.js";
import { boundedToolResults, buildMessages, fitMessages, MODEL_INPUT_BUDGET } from "../src/guide/service.js";
import { TOOL_SCHEMAS } from "../src/guide/tools.js";
import { validateLink } from "../src/media/links.js";
import { ModerationWorker } from "../src/moderation/worker.js";
import { form, harness, key, signup } from "./helpers.js";

test("process mutex: simultaneous startup has one owner; crash releases it; losers cannot unlink it", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-lock-"));
  const db = join(dir, "db.sqlite");
  const children = Array.from({ length: 8 }, () => fork(new URL("./fixtures/lock-child.ts", import.meta.url), [db], {
    cwd: join(REPO_ROOT, "apps/api"), execArgv: ["--import", "tsx"], silent: true,
  }));
  try {
    await Promise.all(children.map((c) => once(c, "message")));
    const replies = children.map((c) => once(c, "message"));
    children.forEach((c) => c.send("acquire"));
    const results = (await Promise.all(replies)).map(([r]) => r as { acquired: boolean; pid?: number });
    assert.equal(results.filter((r) => r.acquired).length, 1);
    const winner = children[results.findIndex((r) => r.acquired)];
    await Promise.all(children.filter((c) => c !== winner).map(async (c) => { const exit = once(c, "exit"); c.send("exit"); await exit; }));
    assert.equal(readFileSync(join(dir, "api.pid"), "utf8"), String(winner.pid));
    assert.throws(() => acquireProcessLock(db), /Another Star Tagger API/);
    const exited = once(winner, "exit");
    winner.kill("SIGKILL");
    await exited;
    const release = acquireProcessLock(db);
    release();
    // A repeated old cleanup must not remove a newer owner's diagnostic PID.
    const newer = acquireProcessLock(db);
    release();
    assert.ok(existsSync(join(dir, "api.pid")));
    newer();
  } finally {
    await Promise.all(children.filter((c) => c.exitCode === null && c.signalCode === null).map(async (c) => { const exited = once(c, "exit"); c.kill("SIGKILL"); await exited; }));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("guide budgets include final tool messages, JSON overhead, and Unicode bytes", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "budget");
  const results = boundedToolResults(Array.from({ length: 3 }, () => ({ note: '🌌✨"\\'.repeat(140) })));
  assert.ok(results.reduce((n, r) => n + Buffer.byteLength(r), 0) <= 1000);
  for (const result of results) assert.doesNotThrow(() => JSON.parse(result));
  const base = [{ role: "system" as const, content: "selected facts" },
    { role: "user" as const, content: "old".repeat(400) }, { role: "assistant" as const, content: "old".repeat(200) },
    { role: "user" as const, content: "current" }];
  const suffix = [{ role: "tool" as const, content: "x".repeat(1000) }];
  const fitted = fitMessages(base, suffix);
  assert.ok(Buffer.byteLength(JSON.stringify(fitted)) <= MODEL_INPUT_BUDGET);
  assert.equal(fitted[0].content, "selected facts");
  assert.equal(fitted.at(-2)!.content, "current");
  assert.deepEqual(fitted.at(-1), suffix[0]);

  let longest = { mode: "explore" as const, messages: [{ role: "user" as const, content: "x" }] };
  for (let n = 1; n <= 2000; n++) {
    const body = { ...longest, messages: [{ role: "user" as const, content: "x".repeat(n) }] };
    try { buildMessages(h.server.ctx, body, null, null); longest = body; } catch { break; }
  }
  let streams = 0, plans = 0, finalBytes = 0, final: { role: string; content: string }[] = [];
  h.server.ctx.gemma.chat = async (o) => {
    plans++;
    assert.ok(Buffer.byteLength(JSON.stringify(o.messages)) + Buffer.byteLength(JSON.stringify(TOOL_SCHEMAS)) <= MODEL_INPUT_BUDGET);
    // A worst-case planner turn: long free text, three tool calls, oversized/unknown arguments.
    return { role: "assistant", content: "thinking ".repeat(300), tool_calls: [
      { function: { name: "get_star_content", arguments: { hyg_id: 32263, junk: "j".repeat(2000) } } },
      { function: { name: "calculate_travel_time", arguments: JSON.stringify({ hyg_id: 32263, speed_km_s: 17 }) } },
      { function: { name: "n".repeat(500), arguments: { hyg_id: 32263 } } },
    ] };
  };
  h.server.ctx.gemma.stream = async function* (o) {
    streams++;
    finalBytes = Buffer.byteLength(JSON.stringify(o.messages));
    final = o.messages;
    yield "OK";
  };
  // The longest message that passes the precheck always produces a final request within budget.
  const response = await h.server.app.inject({ method: "POST", url: "/api/agent/chat", headers: a.auth, payload: longest });
  assert.equal(response.statusCode, 200, response.body);
  assert.match(response.body, /event: done/);
  assert.equal(streams, 1);
  assert.deepEqual(final.map((m) => m.role), ["system", "user", "assistant", "tool", "tool", "tool"]);
  assert.equal(final[1].content, longest.messages[0].content); // the current question is never trimmed
  assert.ok(finalBytes > 0 && finalBytes <= MODEL_INPUT_BUDGET, String(finalBytes));
  // One byte more is rejected before any model call.
  const tooLong = { ...longest, messages: [{ role: "user" as const, content: longest.messages[0].content + "x" }] };
  const rejected = await h.server.app.inject({ method: "POST", url: "/api/agent/chat", headers: a.auth, payload: tooLong });
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.json().error.code, "context_too_large");
  assert.equal(plans, 1);
  assert.equal(streams, 1);
  const valid = await h.server.app.inject({ method: "POST", url: "/api/agent/chat", headers: a.auth,
    payload: { mode: "explore", messages: [{ role: "user", content: "Tell me about Sirius" }] } });
  assert.equal(valid.statusCode, 200);
  assert.match(valid.body, /event: done/);
});

test("private API JSON and error responses never permit caching with cookie or bearer auth", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "private");
  for (const headers of [a.auth, { cookie: `st_session=${a.token}` }]) {
    for (const url of ["/api/me", "/api/me/tags", "/api/explore/feed", "/api/tags/not-a-uuid"]) {
      const response = await h.server.app.inject({ url, headers });
      assert.equal(response.headers["cache-control"], "private, no-store", url);
    }
  }
  const denied = await h.server.app.inject({ url: "/api/me" });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.headers["cache-control"], "private, no-store");
});

test("model readiness detects version/digest/tag drift and requires a successful preflight lock", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-identity-"));
  const lockPath = join(dir, "lock.json");
  const h = await harness({ GUIDE_MODEL: "fake", CLEF_MODEL: "fake", MODEL_LOCK_PATH: lockPath });
  t.after(async () => { await h.close(); rmSync(dir, { recursive: true, force: true }); });
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.guide.status, "unverified");
  const identity = { ollama_version: "0.0.0-fake", model: "fake", digest: "sha256:fake" };
  const writeLock = (guide = identity, moderation = identity) => writeFileSync(lockPath, JSON.stringify({ guide, moderation }));
  writeLock();
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.report().status, "ok");
  for (const changed of [{ ...identity, digest: "sha256:changed" }, { ...identity, ollama_version: "changed" }, { ...identity, model: "changed" }]) {
    writeLock(changed);
    await h.server.readiness.probe();
    assert.equal(h.server.readiness.guide.status, "drift");
    assert.equal(h.server.readiness.moderation.status, "ok");
    const response = await h.server.app.inject({ url: "/api/health/ready" });
    assert.equal(response.statusCode, 200); // core remains available
    assert.equal(response.json().status, "degraded");
    assert.ok(!response.body.includes(h.fake.url));
    assert.ok(!response.body.includes("sha256:"));
  }
  writeLock();
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.guide.status, "ok");
  h.fake.mode = "error";
  await h.server.readiness.probe();
  assert.equal(h.server.readiness.guide.status, "unavailable");
});

test("link validation rejects normalized IPv4-mapped private addresses but accepts public IPs", () => {
  for (const address of ["127.0.0.1", "192.168.1.2", "169.254.169.254", "10.0.0.1", "172.16.0.1", "0.0.0.1", "7f00:1", "c0a8:102"]) {
    assert.throws(() => validateLink(`http://[::ffff:${address}]/`), /private or loopback/);
  }
  assert.equal(validateLink("https://[::ffff:8.8.8.8]/"), "https://[::ffff:808:808]/");
  assert.equal(validateLink("https://[2606:4700:4700::1111]/"), "https://[2606:4700:4700::1111]/");
});

test("orphan cleanup removes old normalization outputs while preserving recent uploads", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const old = [join(h.server.store.dir, `${randomUUID()}.webp.part`), join(h.server.store.tmpDir, `${randomUUID()}.webp.part`)];
  const recent = join(h.server.store.tmpDir, `${randomUUID()}.webp.part`);
  const now = Date.now();
  for (const path of [...old, recent]) writeFileSync(path, "interrupted output");
  for (const path of old) utimesSync(path, new Date(now - 7200_000), new Date(now - 7200_000));
  assert.equal(h.server.store.cleanupOrphans(h.server.ctx.db, now), 2);
  for (const path of old) assert.equal(existsSync(path), false);
  assert.equal(existsSync(recent), true);
  const a = await signup(h, "cleanup");
  await h.server.app.inject({ method: "POST", url: "/api/stars/32263/claim", headers: { ...a.auth, "idempotency-key": key() } });
  const response = await h.server.app.inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": key() },
    payload: form({ hyg_id: "32263" }, [Buffer.from("broken image")]) });
  assert.equal(response.statusCode, 400);
  assert.equal(existsSync(recent), true);
});

test("session tokens must carry iss, aud, sub and exp even when signed with the server secret", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "claims");
  const me = (token: string) => h.server.app.inject({ url: "/api/me", headers: { authorization: `Bearer ${token}` } });
  assert.equal((await me(a.token)).statusCode, 200);
  const jwt = h.server.app.jwt;
  const exp = Math.floor(h.clock.t / 1000) + 7 * 86400; // valid on both the test clock and the wall clock
  // Control: the same secret and exp with every required claim is accepted.
  assert.equal((await me(jwt.sign({ sub: a.id, exp }, { iss: "stargaze-api", aud: "stargaze" } as never))).statusCode, 200);
  const forged = [
    jwt.sign({ sub: a.id, exp }),
    jwt.sign({ sub: a.id, exp }, { iss: "stargaze-api" } as never),
    jwt.sign({ sub: a.id, exp }, { aud: "stargaze" } as never),
    jwt.sign({ exp }, { iss: "stargaze-api", aud: "stargaze" } as never),
  ];
  for (const token of forged) {
    const res = await me(token);
    assert.equal(res.statusCode, 401, token);
    assert.equal(res.json().error.code, "unauthorized");
  }
  const cookie = await h.server.app.inject({ url: "/api/me", headers: { cookie: `st_session=${forged[0]}` } });
  assert.equal(cookie.statusCode, 401);
});

test("moderation loop survives thrown DB/adapter errors, logs them, and keeps processing", { timeout: 10_000 }, async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "loop");
  await h.server.app.inject({ method: "POST", url: "/api/stars/32263/claim", headers: { ...a.auth, "idempotency-key": key() } });
  const post = await h.server.app.inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": key() },
    payload: form({ hyg_id: "32263", note: "clear skies" }) });
  assert.equal(post.statusCode, 201);
  const logs: string[] = [];
  const worker = new ModerationWorker(h.server.ctx, h.server.store, (_o, msg) => logs.push(msg));
  worker.idleMs = 20;
  const jobs = h.server.ctx.jobs;
  const nextDue = jobs.nextDue.bind(jobs), recordFailure = jobs.recordFailure.bind(jobs);
  let dbFailures = 2;
  jobs.nextDue = (now) => { if (dbFailures-- > 0) throw new Error("SQLITE_BUSY: database is locked"); return nextDue(now); };
  jobs.recordFailure = () => { throw new Error("SQLITE_IOERR"); }; // an error inside the job error path too
  const clef = h.server.ctx.clef, decide = clef.decide.bind(clef);
  let adapterFailures = 1;
  clef.decide = (...args) => (adapterFailures-- > 0 ? Promise.reject(new Error("adapter exploded")) : decide(...args));
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  t.after(() => { process.off("unhandledRejection", onUnhandled); jobs.recordFailure = recordFailure; });
  worker.start();
  try {
    const id = post.json().tag.id;
    for (let i = 0; i < 200; i++) {
      const tag = h.server.ctx.db.prepare("SELECT moderation_status FROM tags WHERE id = ?").get(id) as { moderation_status: string };
      if (tag.moderation_status === "approved") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const tag = h.server.ctx.db.prepare("SELECT moderation_status FROM tags WHERE id = ?").get(id) as { moderation_status: string };
    assert.equal(tag.moderation_status, "approved");
    assert.ok(logs.filter((m) => m === "moderation loop error").length >= 3, logs.join(","));
    assert.deepEqual(unhandled, []);
  } finally { await worker.stop(); }
});
