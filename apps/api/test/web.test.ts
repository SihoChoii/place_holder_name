import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { buildApp } from "../src/app.js";

test("actual Next.js export loads with its assets and cookie API on the same HTTP origin", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-web-export-"));
  const server = await buildApp(loadConfig({ JWT_SECRET: "export-test-secret-".repeat(4), GUIDE_BASE_URL: "http://127.0.0.1:9", CLEF_BASE_URL: "http://127.0.0.1:9",
    DB_PATH: join(dir, "db.sqlite"), MEDIA_DIR: join(dir, "media") }, { dotenv: false }), { logger: false });
  t.after(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });
  const origin = await server.app.listen({ port: 0, host: "127.0.0.1" });
  server.ctx.config.appOrigins = [origin];
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>Stargaze<\/title>/);
  const scripts = [...html.matchAll(/src="([^\"]+\.js[^\"]*)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const path of scripts) {
    const asset = await fetch(new URL(path, origin));
    assert.equal(asset.status, 200, path);
    assert.match(asset.headers.get("content-type")!, /javascript/);
    await asset.arrayBuffer();
  }
  const signup = await fetch(`${origin}/api/auth/signup`, { method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "web-export@example.com", display_name: "Web Export", password: "correct horse battery" }) });
  assert.equal(signup.status, 201);
  assert.equal(signup.headers.get("cache-control"), "private, no-store");
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  await signup.arrayBuffer();
  const me = await fetch(`${origin}/api/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json() as { user: { email: string } }).user.email, "web-export@example.com");
  const unknown = await fetch(`${origin}/api/not-a-route`);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get("content-type")!, /application\/json/);
  await unknown.arrayBuffer();
});
