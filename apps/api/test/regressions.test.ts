import { test } from "node:test";
import assert from "node:assert/strict";
import { fork, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { acquireProcessLock, ProcessLockError } from "../src/lib/lock.js";
import { REPO_ROOT } from "../src/lib/paths.js";
import { boundedToolResults, buildMessages, fitMessages, MODEL_INPUT_BUDGET } from "../src/guide/service.js";
import { runTool, TOOL_SCHEMAS } from "../src/guide/tools.js";
import { validateLink } from "../src/media/links.js";
import { ModerationWorker } from "../src/moderation/worker.js";
import { form, harness, key, ORIGIN, signup } from "./helpers.js";

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
    assert.equal(JSON.parse(readFileSync(join(dir, "api.pid"), "utf8")).pid, winner.pid);
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

test("process lock: a stale api.pid reused by an unrelated live process does not block; a duplicate start exits with one line", { timeout: 20_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-pid-"));
  const db = join(dir, "db.sqlite");
  const keep = "setTimeout(() => {}, 30000)";
  const unrelated = spawn(process.execPath, ["-e", keep]);
  const legacyApi = spawn(process.execPath, ["-e", keep, "--", "/srv/stargaze/apps/api/dist/index.js"]);
  t.after(() => { unrelated.kill("SIGKILL"); legacyApi.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); });
  await new Promise((r) => setTimeout(r, 200));
  const pidFile = join(dir, "api.pid");
  for (const stale of [String(unrelated.pid), JSON.stringify({ app: "stargaze-api", pid: unrelated.pid, started_at: "2026-01-01T00:00:00Z", db })]) {
    writeFileSync(pidFile, stale);
    const release = acquireProcessLock(db);
    assert.equal(JSON.parse(readFileSync(pidFile, "utf8")).pid, process.pid);
    release();
  }
  writeFileSync(pidFile, String(legacyApi.pid)); // a live pre-mutex API still blocks
  assert.throws(() => acquireProcessLock(db), (e) => e instanceof ProcessLockError && e.message.includes(`pid ${legacyApi.pid}`));
  rmSync(pidFile);

  const release = acquireProcessLock(db);
  t.after(release);
  const second = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(REPO_ROOT, "apps/api"), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, DB_PATH: db, MEDIA_DIR: join(dir, "media"), JWT_SECRET: "test-secret-test-secret-test-secret-0123456789",
      APP_ORIGIN: "http://localhost:3000", GUIDE_BASE_URL: "http://127.0.0.1:9", CLEF_BASE_URL: "http://127.0.0.1:9", PORT: "4999" },
  });
  assert.equal(second.status, 1);
  assert.equal(second.stderr.trim().split("\n").length, 1, second.stderr);
  assert.match(second.stderr, /^Another Star Tagger API is already using .+; stop it first\.\n$/);
});

test("link validation runs IPv4 embedded in IPv4-compatible, NAT64 and 6to4 IPv6 through the private checks", () => {
  const rejected = [
    "http://[::127.0.0.1]/", "http://[::7f00:1]/", "http://[::a00:1]/", "http://[::c0a8:101]/", "http://[::a9fe:a9fe]/",
    "http://[64:ff9b::127.0.0.1]/", "http://[64:ff9b::7f00:1]/", "http://[64:ff9b::a9fe:a9fe]/", "http://[64:ff9b:0:0:0:0:c0a8:101]/",
    "http://[64:ff9b:1::808:808]/", "http://[2002:7f00:1::]/", "http://[2002:c0a8:101::1]/",
    "http://[::]/", "http://[::1]/", "http://[0:0:0:0:0:0:0:1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[ff02::1]/",
  ];
  for (const url of rejected) assert.throws(() => validateLink(url), /private or loopback/, url);
  for (const url of ["https://[::ffff:8.8.8.8]/", "https://[64:ff9b::8.8.8.8]/", "https://[::8.8.8.8]/", "https://[2002:808:808::1]/"]) {
    assert.doesNotThrow(() => validateLink(url), url);
  }
  assert.equal(validateLink("https://[64:ff9b::8.8.8.8]/"), "https://[64:ff9b::808:808]/");
});

test("travel time accepts any finite positive speed (no light-speed cap) in REST and the guide tool", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "speed");
  for (const speed of ["17", "299792.458", "299792.459", "1e9", "1.5e300"]) {
    const res = await h.server.app.inject({ url: `/api/stars/32263/travel-time?speed_km_s=${speed}`, headers: a.auth });
    assert.equal(res.statusCode, 200, `${speed} ${res.body}`);
    assert.equal(res.json().speed_km_s, Number(speed));
  }
  for (const speed of ["0", "-1", "Infinity", "1e400", "NaN", "abc"]) {
    const res = await h.server.app.inject({ url: `/api/stars/32263/travel-time?speed_km_s=${speed}`, headers: a.auth });
    assert.equal(res.statusCode, 400, `${speed} ${res.body}`);
  }
  const tool = runTool(h.server.ctx, null, "calculate_travel_time", { hyg_id: 32263, speed_km_s: 1e6 }) as { speed_km_s: number };
  assert.equal(tool.speed_km_s, 1e6);
  assert.throws(() => runTool(h.server.ctx, null, "calculate_travel_time", { hyg_id: 32263, speed_km_s: 0 }), /positive/);
});

test("seed never uses a committed password: SEED_PASSWORD or a random one printed once", { timeout: 30_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-seed-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (db: string, extra: Record<string, string> = {}) => {
    const env: Record<string, string | undefined> = { ...process.env, DB_PATH: db, MEDIA_DIR: join(dir, "media"), ...extra };
    if (!("SEED_PASSWORD" in extra)) delete env.SEED_PASSWORD;
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/scripts/seed.ts"], { cwd: join(REPO_ROOT, "apps/api"), env, encoding: "utf8" });
    return { status: r.status, out: r.status === 0 ? JSON.parse(r.stdout) : null, stderr: r.stderr };
  };
  assert.doesNotMatch(readFileSync(join(REPO_ROOT, "apps/api/src/scripts/seed.ts"), "utf8"), /stargaze-demo-1/);
  const generatedDb = join(dir, "generated.sqlite");
  const first = run(generatedDb);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.out.generated_password, /^[\w-]{20}$/);
  const again = run(generatedDb); // existing users keep their password; nothing new to print
  assert.equal(again.out.generated_password, undefined);
  const h = await harness({ DB_PATH: generatedDb }); t.after(() => h.close());
  const login = (password: string) => h.server.app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: ORIGIN },
    payload: { email: "demo.ada@example.com", password } });
  assert.equal((await login(first.out.generated_password)).statusCode, 200);
  assert.equal((await login("stargaze-demo-1")).statusCode, 401);
  const fixed = run(join(dir, "fixed.sqlite"), { SEED_PASSWORD: "a-long-demo-password" });
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.equal(fixed.out.generated_password, undefined);
  assert.equal(run(join(dir, "short.sqlite"), { SEED_PASSWORD: "short" }).status, 1);
});
