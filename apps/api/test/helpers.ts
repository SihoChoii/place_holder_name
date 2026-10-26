import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { loadConfig } from "../src/config.js";
import { buildApp, type BuildOptions, type Server } from "../src/app.js";
import { startFakeOllama, type FakeOllama } from "./fixtures/fake-ollama.js";

export const ORIGIN = "http://stargaze.test:3000";

export interface Harness {
  server: Server; fake: FakeOllama; dir: string; clock: { t: number };
  reopen(): Promise<Server>;
  close(): Promise<void>;
}

/** A server on a temporary database/media directory, pointed at the fake model server. Never touches ./data. */
export async function harness(extraEnv: Record<string, string> = {}, opts: Pick<BuildOptions, "summaryFetch"> = {}): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-test-"));
  const fake = await startFakeOllama();
  const clock = { t: Date.UTC(2026, 9, 25, 22, 0, 0) };
  const env = {
    JWT_SECRET: "test-secret-test-secret-test-secret-0123456789",
    APP_ORIGIN: ORIGIN, DB_PATH: join(dir, "db.sqlite"), MEDIA_DIR: join(dir, "media"),
    GUIDE_BASE_URL: fake.url, CLEF_BASE_URL: fake.url, CLEF_CALL_TIMEOUT_MS: "2000", GUIDE_TIMEOUT_MS: "5000",
    ...extraEnv,
  };
  const config = loadConfig(env, { dotenv: false });
  const make = () => buildApp(config, { now: () => clock.t, logger: process.env.TEST_LOG ? { level: "error" } : false, webDist: null, ...opts });
  const h: Harness = {
    server: await make(), fake, dir, clock,
    async reopen() { await h.server.close(); h.server = await make(); return h.server; },
    async close() { await h.server.close(); await fake.close(); rmSync(dir, { recursive: true, force: true }); },
  };
  return h;
}

export const key = () => randomUUID();

export async function signup(h: Harness, name: string) {
  const res = await h.server.app.inject({ method: "POST", url: "/api/auth/signup", headers: { origin: ORIGIN },
    payload: { email: `${name}@example.com`, password: "correct horse battery", display_name: name } });
  if (res.statusCode !== 201) throw new Error(`signup failed ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { token: body.token as string, id: body.user.id as string, auth: { authorization: `Bearer ${body.token}` } };
}

export const png = (w = 64, h = 48) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 80 } } }).png().toBuffer();

export function form(fields: Record<string, string>, images: Buffer[] = [], type = "image/png") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  images.forEach((b, i) => fd.append("images", new Blob([new Uint8Array(b)], { type }), `img${i}.png`));
  return fd;
}
