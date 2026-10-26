import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { claimedStars } from "../src/services/claimed.js";
import { harness, signup } from "./helpers.js";

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
