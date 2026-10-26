import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runTool } from "../src/guide/tools.js";
import { validateLink } from "../src/media/links.js";
import { claimedStars } from "../src/services/claimed.js";
import { harness, signup } from "./helpers.js";

test("travel time: a speed so small the duration overflows is 400 (REST) and a tool error, never 500 or null", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "tiny-speed");
  for (const speed of ["5e-324", "1e-300"]) {
    const res = await h.server.app.inject({ url: `/api/stars/32263/travel-time?speed_km_s=${speed}`, headers: a.auth });
    assert.equal(res.statusCode, 400, `${speed}: ${res.body}`);
    assert.equal(res.json().error.code, "validation_failed");
  }
  assert.throws(() => runTool(h.server.ctx, null, "calculate_travel_time", { hyg_id: 32263, speed_km_s: 5e-324 }), /speed_km_s/);
  const ok = await h.server.app.inject({ url: "/api/stars/32263/travel-time?speed_km_s=1e308", headers: a.auth });
  assert.equal(ok.statusCode, 200);
  assert.ok(Number.isFinite(ok.json().travel_years));
});

test("link validation also rejects IPv4-translated (::ffff:0:a.b.c.d) private addresses and site-local fec0::/10", () => {
  for (const u of ["http://[::ffff:0:10.0.0.1]/", "http://[::ffff:0:127.0.0.1]/", "http://[fec0::1]/", "http://[feff::1]/"]) {
    assert.throws(() => validateLink(u), /private or loopback/, u);
  }
  assert.equal(validateLink("http://[::ffff:0:8.8.8.8]/"), "http://[::ffff:0:808:808]/");
  assert.equal(validateLink("http://[2606:4700::1111]/"), "http://[2606:4700::1111]/");
});

test("public claimed scales linearly: 8,000 claims with posts build in well under a second", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const db = h.server.ctx.db;
  const ids = [...Array(120_000).keys()].filter((i) => h.server.ctx.catalog.has(i)).slice(0, 8000);
  db.transaction(() => {
    const now = h.clock.t;
    const iu = db.prepare("INSERT INTO users (id,email,display_name,password_hash,created_at) VALUES (?,?,?,?,?)");
    const ic = db.prepare("INSERT INTO star_claims (id,hyg_id,user_id,claimed_at,request_key,request_fingerprint) VALUES (?,?,?,?,?,?)");
    const it = db.prepare(`INSERT INTO tags (id,claim_id,hyg_id,user_id,note,moderation_status,created_at,request_key,request_fingerprint)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    ids.forEach((hyg, i) => {
      const u = randomUUID(), c = randomUUID();
      iu.run(u, `scale${i}@example.com`, `Scale ${i}`, "x", now);
      ic.run(c, hyg, u, now + i, randomUUID(), "f");
      it.run(randomUUID(), c, hyg, u, "approved note", "approved", now + i, randomUUID(), "f");
      it.run(randomUUID(), c, hyg, u, "pending note", "pending", now + i + 1, randomUUID(), "f");
    });
  })();
  assert.equal(ids.length, 8000);
  const started = performance.now();
  const { stars } = claimedStars(h.server.ctx);
  const ms = performance.now() - started;
  assert.equal(stars.length, 8000);
  assert.deepEqual(stars[0].preview, { type: "text", thumb_url: null, title: null, excerpt: "approved note", approved_count: 1 });
  assert.ok(ms < 750, `claimedStars took ${Math.round(ms)} ms for 8,000 claims`);
});
