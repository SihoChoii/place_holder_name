import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { form, harness, key, png, signup, type Harness } from "./helpers.js";

const SIRIUS = 32263, VEGA = 90979, CANOPUS = 30365;

const claimed = (h: Harness, headers: Record<string, string> = {}) => h.server.app.inject({ url: "/api/public/claimed", headers });
const claim = (h: Harness, auth: Record<string, string>, star: number) =>
  h.server.app.inject({ method: "POST", url: `/api/stars/${star}/claim`, headers: { ...auth, "idempotency-key": key() } });
async function post(h: Harness, auth: Record<string, string>, fields: Record<string, string>, images: Buffer[] = []) {
  const res = await h.server.app.inject({ method: "POST", url: "/api/tags", headers: { ...auth, "idempotency-key": key() }, payload: form(fields, images) });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().tag as { id: string; media: { id: string; kind: string }[] };
}

test("public claimed: empty, claimed without content, approved-only previews and counts, anonymous for every caller", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const empty = await claimed(h);
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.json().stars, []);
  assert.equal(empty.headers["cache-control"], "public, max-age=0, must-revalidate");
  assert.equal(empty.headers.etag, `"${empty.json().version}"`);
  assert.equal(typeof empty.json().server_time, "number");

  const a = await signup(h, "owner-a"), b = await signup(h, "owner-b");
  assert.equal((await claim(h, a.auth, SIRIUS)).statusCode, 201);
  assert.equal((await claim(h, b.auth, VEGA)).statusCode, 201);
  let body = (await claimed(h)).json();
  assert.deepEqual(body.stars.map((s: { hyg_id: number }) => s.hyg_id), [SIRIUS, VEGA]);
  assert.deepEqual(body.stars[0].owner, { id: a.id, display_name: "owner-a" });
  assert.equal(body.stars[0].preview, null);

  // Sirius: approved photo post, then a rejected post, then a newer pending post.
  const approved = await post(h, a.auth, { hyg_id: String(SIRIUS), note: "Sirius over the bay", links: JSON.stringify(["https://www.example.org/sirius"]) }, [await png(800, 600)]);
  await h.server.worker.runOnce();
  await post(h, a.auth, { hyg_id: String(SIRIUS), note: "REJECT_ME please" });
  await h.server.worker.runOnce();
  // Vega: approved link-only post, and a text-only one approved later (newest wins).
  await post(h, b.auth, { hyg_id: String(VEGA), links: JSON.stringify(["https://vega.example.net/a"]) });
  await h.server.worker.runOnce();
  const pending = await post(h, a.auth, { hyg_id: String(SIRIUS), note: "pending newest", links: JSON.stringify(["https://pending.example.com/"]) }, [await png()]);

  body = (await claimed(h)).json();
  const sirius = body.stars.find((s: { hyg_id: number }) => s.hyg_id === SIRIUS);
  const image = approved.media.find((m) => m.kind === "image")!;
  assert.deepEqual(sirius.preview, {
    type: "image", thumb_url: `/api/public/media/${image.id}?size=thumb`, title: "example.org", excerpt: "Sirius over the bay", approved_count: 1,
  });
  const vega = body.stars.find((s: { hyg_id: number }) => s.hyg_id === VEGA);
  assert.deepEqual(vega.preview, { type: "link", thumb_url: null, title: "vega.example.net", excerpt: null, approved_count: 1 });
  assert.doesNotMatch(JSON.stringify(body), /pending newest|REJECT_ME|pending\.example/);
  assert.ok(pending.id);

  // Credentials never personalize this route: owners see the anonymous list; private routes stay no-store.
  for (const headers of [a.auth, { cookie: `st_session=${a.token}` }]) {
    const res = await claimed(h, headers);
    assert.deepEqual(res.json().stars, body.stars);
    assert.equal(res.headers["cache-control"], "public, max-age=0, must-revalidate");
    assert.equal((await h.server.app.inject({ url: "/api/me", headers })).headers["cache-control"], "private, no-store");
  }

  h.clock.t += 60_000; // newer post (posts at the same millisecond tie-break by id)
  await post(h, b.auth, { hyg_id: String(VEGA), note: "Vega straight up" });
  await h.server.worker.runOnce();
  const vega2 = (await claimed(h)).json().stars.find((s: { hyg_id: number }) => s.hyg_id === VEGA);
  assert.deepEqual(vega2.preview, { type: "text", thumb_url: null, title: null, excerpt: "Vega straight up", approved_count: 2 });
});

test("public claimed: strong ETag with 304, unchanged by pending posts, changed by claims and approvals", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "etag-a"), b = await signup(h, "etag-b");
  await claim(h, a.auth, SIRIUS);
  const first = await claimed(h);
  const etag = first.headers.etag as string;
  assert.match(etag, /^"[\w-]{22}"$/);
  const notModified = await claimed(h, { "if-none-match": etag });
  assert.equal(notModified.statusCode, 304);
  assert.equal(notModified.body, "");
  assert.equal(notModified.headers.etag, etag);
  assert.equal((await claimed(h, { "if-none-match": `"other", W/${etag}` })).statusCode, 304);
  assert.equal((await claimed(h, { "if-none-match": '"stale"' })).statusCode, 200);

  await post(h, a.auth, { hyg_id: String(SIRIUS), note: "first light" });
  assert.equal((await claimed(h, { "if-none-match": etag })).statusCode, 304, "pending content is invisible");
  await h.server.worker.runOnce();
  const approved = await claimed(h, { "if-none-match": etag });
  assert.equal(approved.statusCode, 200, "approval changes the version");
  const etag2 = approved.headers.etag as string;
  assert.notEqual(etag2, etag);
  assert.equal(approved.json().version, etag2.slice(1, -1));

  await claim(h, b.auth, CANOPUS);
  const claimedAgain = await claimed(h, { "if-none-match": etag2 });
  assert.equal(claimedAgain.statusCode, 200, "a new claim changes the version");
  assert.notEqual(claimedAgain.headers.etag, etag2);
});

test("public media thumbnails: 320 px WebP cached on disk, same visibility as the full image, size validated", async (t) => {
  const h = await harness(); t.after(() => h.close());
  const a = await signup(h, "thumbs");
  await claim(h, a.auth, SIRIUS);
  const tag = await post(h, a.auth, { hyg_id: String(SIRIUS), note: "big" }, [await png(800, 600), await png(100, 50)]);
  const [big, small] = tag.media;
  const media = (id: string, q = "", headers: Record<string, string> = {}) => h.server.app.inject({ url: `/api/public/media/${id}${q}`, headers });

  // Pending: hidden from everyone on the public route, including the author's credentials.
  assert.equal((await media(big.id, "?size=thumb")).statusCode, 404);
  assert.equal((await media(big.id, "?size=thumb", a.auth)).statusCode, 404);
  assert.equal((await media(big.id)).statusCode, 404);
  await h.server.worker.runOnce();

  const thumb = await media(big.id, "?size=thumb");
  assert.equal(thumb.statusCode, 200);
  assert.equal(thumb.headers["content-type"], "image/webp");
  const meta = await sharp(thumb.rawPayload).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 320, 240]);
  const full = await sharp((await media(big.id)).rawPayload).metadata();
  assert.equal(full.width, 800);
  assert.equal((await sharp((await media(big.id, "?size=full")).rawPayload).metadata()).width, 800);
  assert.equal((await sharp((await media(small.id, "?size=thumb")).rawPayload).metadata()).width, 100); // never enlarged

  const store = h.server.store;
  assert.equal(readdirSync(store.thumbsDir).length, 2);
  assert.deepEqual(readdirSync(store.tmpDir).filter((f) => f.endsWith(".part")), []);
  assert.equal((await media(big.id, "?size=thumb")).statusCode, 200); // served from the cache

  for (const bad of ["?size=huge", "?size=", "?size=thumb&x=1"]) assert.equal((await media(big.id, bad)).statusCode, 400, bad);

  // Deleted posts: the thumbnail is hidden at once and an orphaned cached thumbnail is cleaned up later.
  assert.equal((await h.server.app.inject({ method: "DELETE", url: `/api/tags/${tag.id}`, headers: a.auth })).statusCode, 204);
  assert.equal((await media(big.id, "?size=thumb")).statusCode, 404);
  const orphan = join(store.thumbsDir, `${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}.webp`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(orphan, "x");
  const old = new Date(Date.now() - 7200_000);
  utimesSync(orphan, old, old);
  for (const f of readdirSync(store.thumbsDir)) utimesSync(join(store.thumbsDir, f), old, old);
  store.cleanupOrphans(h.server.ctx.db, Date.now());
  assert.equal(existsSync(orphan), false);
  assert.equal(readdirSync(store.thumbsDir).length, 2, "thumbnails of still-referenced originals are kept");
});
