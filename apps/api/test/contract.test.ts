import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { schemas } from "@stargaze/shared";
import { loadConfig } from "../src/config.js";
import { buildApp } from "../src/app.js";
import { REPO_ROOT } from "../src/lib/paths.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv").default as typeof import("ajv").default;
const addFormats = require("ajv-formats").default as typeof import("ajv-formats").default;

const FIXTURES: Record<string, object> = {
  "auth.signup.201.json": schemas.AuthResponse, "auth.login.200.json": schemas.AuthResponse,
  "me.200.json": schemas.MeResponse, "me.eligible.200.json": schemas.MeResponse,
  "star.200.json": schemas.Star, "star.unknown-distance.200.json": schemas.Star,
  "travel-time.200.json": schemas.TravelTimeResponse, "travel-time.unknown.200.json": schemas.TravelTimeResponse,
  "claim.201.json": schemas.ClaimResponse, "tag.create.201.json": schemas.CreateTagResponse,
  "tag.approved.200.json": schemas.Tag, "tag.pending.200.json": schemas.Tag, "tag.rejected.200.json": schemas.Tag,
  "tag.review-failed.200.json": schemas.Tag, "tags.page.200.json": schemas.TagPage, "me-tags.page.200.json": schemas.TagPage,
  "feed.page.200.json": schemas.TagPage, "comments.page.200.json": schemas.CommentPage,
  "comment.create.201.json": schemas.CreateCommentResponse, "reaction.200.json": schemas.ReactionResponse,
  "view-content.200.json": schemas.ViewContentResponse, "search.200.json": schemas.SearchResponse,
  "public-star.200.json": schemas.PublicStarResponse, "health-ready.200.json": schemas.HealthReady,
  "chat.request.json": schemas.ChatBody,
};

test("every shared fixture validates against its schema", () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const dir = join(REPO_ROOT, "packages/shared/fixtures");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const schema = f.startsWith("error.") ? schemas.ErrorBody : FIXTURES[f];
    assert.ok(schema, `no schema mapped for fixture ${f}`);
    const ok = ajv.validate({ ...schema, $id: undefined }, data);
    assert.ok(ok, `${f}: ${ajv.errorsText()}`);
  }
});

test("built SPA is served on the same origin with index.html fallback; /api 404s stay JSON", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-web-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Star Tagger</title>");
  writeFileSync(join(dir, "app.js"), "console.log(1)");
  const config = loadConfig({ JWT_SECRET: "x".repeat(40), GUIDE_BASE_URL: "http://127.0.0.1:9", CLEF_BASE_URL: "http://127.0.0.1:9",
    DB_PATH: join(dir, "db.sqlite"), MEDIA_DIR: join(dir, "media") }, { dotenv: false });
  const server = await buildApp(config, { logger: false, webDist: dir });
  t.after(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });
  const app = server.app;
  assert.match((await app.inject({ url: "/" })).body, /Star Tagger/);
  assert.match((await app.inject({ url: "/stars/32263" })).body, /Star Tagger/);
  assert.equal((await app.inject({ url: "/app.js" })).body, "console.log(1)");
  const api404 = await app.inject({ url: "/api/nope" });
  assert.equal(api404.statusCode, 404);
  assert.equal(api404.json().error.code, "not_found");
  assert.equal((await app.inject({ url: "/api/health/live" })).json().status, "ok");
});
