import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ORIGIN, form, harness, key, png, signup } from "./helpers.js";

const SIRIUS = 32263, CANOPUS = 30365, VEGA = 90979;

test("first journey: sign in, claim, post, real moderation path, second user sees it", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const app = () => h.server.app;
  const a = await signup(h, "ada");
  const b = await signup(h, "grace");

  // /me before claiming: eligible now
  let me = (await app().inject({ url: "/api/me", headers: a.auth })).json();
  assert.equal(me.next_claim_at, null);
  assert.equal(me.claim_cooldown_seconds, 3600);

  // claim + replay + conflicts
  const k1 = key();
  const c1 = await app().inject({ method: "POST", url: `/api/stars/${SIRIUS}/claim`, headers: { ...a.auth, "idempotency-key": k1 } });
  assert.equal(c1.statusCode, 201, c1.body);
  const replay = await app().inject({ method: "POST", url: `/api/stars/${SIRIUS}/claim`, headers: { ...a.auth, "idempotency-key": k1 } });
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.json().claim.id, c1.json().claim.id);
  const changed = await app().inject({ method: "POST", url: `/api/stars/${CANOPUS}/claim`, headers: { ...a.auth, "idempotency-key": k1 } });
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.json().error.code, "idempotency_conflict");
  const taken = await app().inject({ method: "POST", url: `/api/stars/${SIRIUS}/claim`, headers: { ...b.auth, "idempotency-key": key() } });
  assert.equal(taken.json().error.code, "already_claimed");
  const cool = await app().inject({ method: "POST", url: `/api/stars/${CANOPUS}/claim`, headers: { ...a.auth, "idempotency-key": key() } });
  assert.equal(cool.statusCode, 429);
  assert.equal(cool.json().error.code, "on_cooldown");
  assert.equal(cool.headers["retry-after"], "3600");
  const unknown = await app().inject({ method: "POST", url: `/api/stars/999999999/claim`, headers: { ...a.auth, "idempotency-key": key() } });
  assert.equal(unknown.json().error.code, "unknown_star");
  me = (await app().inject({ url: "/api/me", headers: a.auth })).json();
  assert.equal(me.next_claim_at, h.clock.t + 3600_000);
  // cooldown boundary with the injected clock
  h.clock.t += 3600_000 - 1;
  assert.equal((await app().inject({ method: "POST", url: `/api/stars/${CANOPUS}/claim`, headers: { ...a.auth, "idempotency-key": key() } })).statusCode, 429);
  h.clock.t += 1;
  assert.equal((await app().inject({ method: "POST", url: `/api/stars/${CANOPUS}/claim`, headers: { ...a.auth, "idempotency-key": key() } })).statusCode, 201);

  // post: note + photo + link
  const img = await png(3000, 1000);
  const pk = key();
  const fields = { hyg_id: String(SIRIUS), note: "First light ✨", links: JSON.stringify(["https://en.wikipedia.org/wiki/Sirius"]) };
  const post = await app().inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": pk }, payload: form(fields, [img]) });
  assert.equal(post.statusCode, 201, post.body);
  const tag = post.json().tag;
  assert.equal(tag.moderation_status, "pending");
  assert.equal(tag.processing_state, "queued");
  assert.equal(tag.media.length, 2);
  assert.equal(tag.media[0].width, 2048); // resized, no upscale
  assert.equal(tag.media[0].mime, "image/webp");
  // replay with same bytes → same tag, no second file set
  const filesBefore = readdirSync(h.server.store.dir).filter((f) => f.endsWith(".webp")).length;
  const again = await app().inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": pk }, payload: form(fields, [img]) });
  assert.equal(again.json().tag.id, tag.id);
  assert.equal(readdirSync(h.server.store.dir).filter((f) => f.endsWith(".webp")).length, filesBefore);
  // changed bytes with the same key → 409
  const diff = await app().inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": pk }, payload: form(fields, [await png(10, 10)]) });
  assert.equal(diff.statusCode, 409);

  // pending is private
  const imgUrl = tag.media[0].url as string;
  assert.equal((await app().inject({ url: imgUrl, headers: a.auth })).statusCode, 200);
  assert.equal((await app().inject({ url: imgUrl, headers: b.auth })).statusCode, 404);
  assert.equal((await app().inject({ url: `/api/public/media/${tag.media[0].id}` })).statusCode, 404);
  assert.equal((await app().inject({ url: `/api/tags/${tag.id}`, headers: b.auth })).statusCode, 404);
  let ov = (await app().inject({ method: "POST", url: "/api/view/content", headers: b.auth, payload: { hyg_ids: [SIRIUS, VEGA] } })).json();
  assert.equal(ov.stars[0].tag_count, 0);
  assert.equal(ov.stars[0].claim.owner.display_name, "ada");
  assert.equal(ov.stars[1].claim, null);
  const mine = (await app().inject({ url: "/api/me/tags", headers: a.auth })).json();
  assert.equal(mine.items[0].processing_state, "queued");

  // moderation through the production Clef adapter (fake host): text, link and image components
  await h.server.worker.runOnce();
  const sysCalls = h.fake.calls.filter((c) => c.path === "/v1/systemone");
  assert.equal(sysCalls.length, 3);
  assert.equal(sysCalls.filter((c) => c.body.images?.length === 1).length, 1);
  const row = h.server.ctx.db.prepare("SELECT moderation_status, moderation_result FROM tags WHERE id = ?").get(tag.id) as any;
  assert.equal(row.moderation_status, "approved");
  assert.match(JSON.parse(row.moderation_result).policy_version, /policy-v1/);

  // second user and anonymous see it through normal read paths
  ov = (await app().inject({ method: "POST", url: "/api/view/content", headers: b.auth, payload: { hyg_ids: [SIRIUS] } })).json();
  assert.equal(ov.stars[0].tags[0].id, tag.id);
  assert.equal(ov.stars[0].tags[0].processing_state, undefined);
  assert.equal((await app().inject({ url: imgUrl, headers: b.auth })).statusCode, 200);
  const pub = await app().inject({ url: `/api/public/media/${tag.media[0].id}` });
  assert.equal(pub.statusCode, 200);
  assert.equal(pub.headers["content-type"], "image/webp");
  const feed = (await app().inject({ url: "/api/public/feed" })).json();
  assert.equal(feed.items[0].id, tag.id);
  assert.equal(feed.items[0].media[0].url, `/api/public/media/${tag.media[0].id}`);
  assert.equal(JSON.stringify(feed).includes("@example.com"), false);
  const star = (await app().inject({ url: `/api/public/stars/${SIRIUS}` })).json();
  assert.equal(star.tag_count, 1);
  assert.equal(star.star.claim.owner.display_name, "ada");
  const search = (await app().inject({ url: "/api/public/search?q=first%20light" })).json();
  assert.equal(search.tags.length, 1);
  assert.equal((await app().inject({ url: "/api/public/search?q=sirius" })).json().stars[0].hyg_id, SIRIUS);
  assert.equal((await app().inject({ url: "/api/public/search?q=%25" })).json().tags.length, 0); // literal %

  // comments, reactions
  const ck = key();
  const cm = await app().inject({ method: "POST", url: `/api/tags/${tag.id}/comments`, headers: { ...b.auth, "idempotency-key": ck }, payload: { body: "Lovely" } });
  assert.equal(cm.statusCode, 201, cm.body);
  assert.equal(cm.json().comment.processing_state, "queued");
  assert.equal((await app().inject({ url: `/api/public/tags/${tag.id}/comments` })).json().items.length, 0);
  assert.equal((await app().inject({ url: `/api/tags/${tag.id}/comments`, headers: b.auth })).json().items.length, 1);
  await h.server.worker.runOnce();
  assert.equal((await app().inject({ url: `/api/public/tags/${tag.id}/comments` })).json().items.length, 1);
  const bad = await app().inject({ method: "POST", url: `/api/tags/${tag.id}/comments`, headers: { ...b.auth, "idempotency-key": key() }, payload: { body: "REJECT_ME" } });
  await h.server.worker.runOnce();
  assert.equal((await app().inject({ url: `/api/tags/${tag.id}/comments`, headers: a.auth })).json().items.length, 1);
  assert.equal((await app().inject({ url: `/api/tags/${tag.id}/comments`, headers: b.auth })).json().items.find((c: any) => c.id === bad.json().comment.id).processing_state, "rejected");
  const heart = encodeURIComponent("❤️");
  let r = await app().inject({ method: "PUT", url: `/api/tags/${tag.id}/reactions/${heart}`, headers: b.auth });
  r = await app().inject({ method: "PUT", url: `/api/tags/${tag.id}/reactions/${heart}`, headers: b.auth });
  assert.deepEqual(r.json().reaction_counts, { "❤️": 1 });
  assert.equal((await app().inject({ method: "PUT", url: `/api/tags/${tag.id}/reactions/x`, headers: b.auth })).statusCode, 400);
  const detail = (await app().inject({ url: `/api/tags/${tag.id}`, headers: b.auth })).json();
  assert.equal(detail.comment_count, 1);
  assert.deepEqual(detail.my_reactions, ["❤️"]);

  // deletion: only the author; hides everything immediately
  assert.equal((await app().inject({ method: "DELETE", url: `/api/tags/${tag.id}`, headers: b.auth })).statusCode, 403);
  assert.equal((await app().inject({ method: "DELETE", url: `/api/tags/${tag.id}`, headers: a.auth })).statusCode, 204);
  assert.equal((await app().inject({ url: `/api/public/media/${tag.media[0].id}` })).statusCode, 404);
  assert.equal((await app().inject({ url: `/api/public/tags/${tag.id}/comments` })).statusCode, 404);
  assert.equal((await app().inject({ url: "/api/public/feed" })).json().items.length, 0);
  const replayDeleted = await app().inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": pk }, payload: form(fields, [img]) });
  assert.equal(replayDeleted.statusCode, 404);
});

test("post validation: empty, oversized note, too many attachments, fake image, bad links, not owner", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const a = await signup(h, "ada");
  const b = await signup(h, "bob");
  await h.server.app.inject({ method: "POST", url: `/api/stars/${SIRIUS}/claim`, headers: { ...a.auth, "idempotency-key": key() } });
  const post = (auth: object, fields: Record<string, string>, imgs: Buffer[] = [], type?: string) =>
    h.server.app.inject({ method: "POST", url: "/api/tags", headers: { ...auth, "idempotency-key": key() }, payload: form(fields, imgs, type) });
  const code = async (p: Promise<any>) => { const r = await p; return `${r.statusCode} ${r.json().error?.code}`; };
  assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS), note: "   " })), "400 empty_post");
  assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS), note: "✨".repeat(141) })), "400 validation_failed");
  assert.equal((await post(a.auth, { hyg_id: String(SIRIUS), note: "✨".repeat(140) })).statusCode, 201);
  assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS), links: JSON.stringify(["https://a.com", "https://b.com", "https://c.com"]) }, [await png(), await png()])), "400 validation_failed");
  assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS) }, [Buffer.from("not an image at all")], "image/png")), "400 invalid_image");
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS) }, [gif], "image/png")), "415 unsupported_media_type");
  for (const link of ["ftp://x.com", "http://user:pw@x.com", "http://localhost/x", "http://printer.local", "http://192.168.1.2/", "http://[::1]/", "http://10.0.0.1"]) {
    assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS), links: JSON.stringify([link]) })), "400 invalid_link", link);
  }
  assert.equal(await code(post(b.auth, { hyg_id: String(SIRIUS), note: "mine?" })), "403 not_star_owner");
  assert.equal(await code(h.server.app.inject({ method: "POST", url: "/api/tags", headers: a.auth, payload: form({ hyg_id: String(SIRIUS), note: "x" }) })), "400 validation_failed");
  assert.equal((await post({}, { hyg_id: String(SIRIUS), note: "x" })).statusCode, 401);
  const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1);
  assert.equal(await code(post(a.auth, { hyg_id: String(SIRIUS) }, [big])), "413 payload_too_large");
  assert.deepEqual(readdirSync(join(h.server.store.dir, "tmp")), []); // failed attempts leave no temp files
});

test("moderation failures retry with backoff, become review_failed, can be retried, and survive restart", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const a = await signup(h, "ada");
  await h.server.app.inject({ method: "POST", url: `/api/stars/${SIRIUS}/claim`, headers: { ...a.auth, "idempotency-key": key() } });
  const mk = async (note: string) => (await h.server.app.inject({ method: "POST", url: "/api/tags", headers: { ...a.auth, "idempotency-key": key() }, payload: form({ hyg_id: String(SIRIUS), note }) })).json().tag.id as string;
  const first = await mk("one");
  h.fake.mode = "malformed";
  await h.server.worker.runOnce();
  let job = h.server.ctx.jobs.forTarget("tag", first)!;
  assert.equal(job.attempts, 1);
  assert.equal(job.next_attempt_at, h.clock.t + 5000);
  assert.equal((await h.server.app.inject({ url: `/api/tags/${first}`, headers: a.auth })).json().processing_state, "delayed");
  const second = await mk("two"); // a failing job must not block later jobs
  h.fake.mode = "ok";
  await h.server.worker.runOnce();
  assert.equal((await h.server.app.inject({ url: `/api/tags/${second}`, headers: a.auth })).json().moderation_status, "approved");
  h.fake.mode = "error";
  for (const step of [5000, 15000, 30000, 60000]) { h.clock.t += step; await h.server.worker.runOnce(); }
  job = h.server.ctx.jobs.forTarget("tag", first)!;
  assert.ok(job.failed_at);
  assert.equal((await h.server.app.inject({ url: `/api/tags/${first}`, headers: a.auth })).json().processing_state, "review_failed");
  // restart with the job still persisted, then retry explicitly after the host recovers
  await h.reopen();
  assert.ok(h.server.ctx.jobs.retry(job.id, h.clock.t));
  h.fake.mode = "ok";
  await h.server.worker.runOnce();
  assert.equal((await h.server.app.inject({ url: `/api/tags/${first}`, headers: a.auth })).json().moderation_status, "approved");
  // rejection is not a failure
  const rej = await mk("REJECT_ME please");
  await h.server.worker.runOnce();
  const t2 = (await h.server.app.inject({ url: `/api/tags/${rej}`, headers: a.auth })).json();
  assert.equal(t2.processing_state, "rejected");
  assert.equal((await h.server.app.inject({ url: `/api/public/feed` })).json().items.length, 2);
  // deletion while pending cancels the job; nothing can resurrect it
  const del = await mk("delete me");
  await h.server.app.inject({ method: "DELETE", url: `/api/tags/${del}`, headers: a.auth });
  assert.equal(h.server.ctx.jobs.forTarget("tag", del), undefined);
  assert.equal(existsSync(h.dir), true);
});

test("auth: cookie session, origin checks, bearer precedence, logout, expiry", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const app = h.server.app;
  const s = await app.inject({ method: "POST", url: "/api/auth/signup", headers: { origin: ORIGIN },
    payload: { email: "  Ada@Example.com ", password: "correct horse battery", display_name: "Ada" } });
  assert.equal(s.statusCode, 201);
  assert.equal(s.json().user.email, "ada@example.com");
  const setCookie = String(s.headers["set-cookie"]);
  assert.match(setCookie, /st_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
  assert.doesNotMatch(setCookie, /Secure/);
  const cookie = setCookie.split(";")[0];
  assert.equal((await app.inject({ url: "/api/me", headers: { cookie } })).statusCode, 200);
  // cookie writes need the right Origin
  const claim = (headers: Record<string, string>) => app.inject({ method: "POST", url: `/api/stars/${SIRIUS}/claim`, headers: { cookie, "idempotency-key": key(), ...headers } });
  assert.equal((await claim({})).json().error.code, "bad_origin");
  assert.equal((await claim({ origin: "null" })).json().error.code, "bad_origin");
  assert.equal((await claim({ origin: "http://evil.test" })).json().error.code, "bad_origin");
  assert.equal((await claim({ origin: ORIGIN })).statusCode, 201);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "http://evil.test" }, payload: { email: "ada@example.com", password: "correct horse battery" } })).statusCode, 403);
  // invalid bearer never falls back to a valid cookie
  assert.equal((await app.inject({ url: "/api/me", headers: { cookie, authorization: "Bearer nope" } })).statusCode, 401);
  const other = await signup(h, "eve");
  assert.equal((await app.inject({ url: "/api/me", headers: { cookie, ...other.auth } })).statusCode, 401);
  // generic login errors
  const wrong = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ada@example.com", password: "wrong password!!" } });
  const nobody = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "no@example.com", password: "wrong password!!" } });
  assert.deepEqual([wrong.statusCode, wrong.json()], [nobody.statusCode, nobody.json()]);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: "x@example.com", password: "short", display_name: "x" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: "ada@example.com", password: "correct horse battery", display_name: "x" } })).json().error.code, "email_taken");
  // logout is idempotent
  for (const headers of [{ cookie }, {}]) {
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
    assert.equal(out.statusCode, 204);
    assert.match(String(out.headers["set-cookie"]), /st_session=;/);
  }
  // expiry after 7 days
  h.clock.t += 7 * 24 * 3600_000 + 1000;
  assert.equal((await app.inject({ url: "/api/me", headers: { cookie } })).statusCode, 401);
});
