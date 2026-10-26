import { accessSync, constants, readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { schemas } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import type { MediaStore } from "../media/store.js";
import { questionsFor } from "../moderation/policy.js";
import { listModels, ollamaVersion } from "../models/http.js";

export type ComponentState = { status: "ok" | "unavailable" | "disabled" | "unknown" | "unverified" | "drift"; checked_at: number | null; detail?: string };
interface ModelIdentity { ollama_version: string; model: string; digest: string }

/**
 * Readiness probes. Database and disk are checked per request (cheap). Model capability is probed in the
 * background (a real 1-token chat and a real System One decision) and cached, so health polls never queue inference.
 */
export class Readiness {
  guide: ComponentState = { status: "unknown", checked_at: null };
  moderation: ComponentState = { status: "unknown", checked_at: null };
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private controller = new AbortController();
  constructor(private ctx: Ctx, private store: MediaStore, private intervalMs = 60_000) {}

  start() {
    void this.probe();
    this.timer = setInterval(() => void this.probe(), this.intervalMs);
    this.timer.unref();
  }
  async stop() { clearInterval(this.timer); this.controller.abort(); await this.running; }

  probe(): Promise<void> {
    return this.running ??= this.runProbe().finally(() => { this.running = undefined; });
  }

  private async modelState(role: "guide" | "moderation", capability: () => Promise<unknown>): Promise<ComponentState> {
    try {
      await capability();
      const config = role === "guide" ? this.ctx.config.guide : this.ctx.config.clef;
      const [version, tags] = await Promise.all([ollamaVersion(config.baseUrl), listModels(config.baseUrl)]);
      let expected: ModelIdentity | undefined;
      try {
        const lock = JSON.parse(readFileSync(this.ctx.config.modelLockPath, "utf8")) as Record<string, ModelIdentity>;
        expected = lock[role];
        if (!expected?.ollama_version || !expected.model || !expected.digest) throw new Error("invalid lock");
      } catch {
        return { status: "unverified", checked_at: this.ctx.now(), detail: "preflight_required" };
      }
      const actual = tags.find((m) => m.name === config.model || m.model === config.model);
      if (expected.model !== config.model || expected.ollama_version !== version || expected.digest !== actual?.digest) {
        return { status: "drift", checked_at: this.ctx.now(), detail: "model_identity_changed" };
      }
      return { status: "ok", checked_at: this.ctx.now() };
    } catch (e) {
      return { status: "unavailable", checked_at: this.ctx.now(), detail: (e as { kind?: string }).kind ?? "error" };
    }
  }

  private async runProbe() {
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(20_000)]);
    await Promise.all([
      this.modelState("guide", () => this.ctx.gemma.chat({ messages: [{ role: "user", content: "Reply with OK." }], numPredict: 1, signal, timeoutMs: 20_000 }))
        .then((state) => { this.guide = state; }),
      !this.ctx.config.moderationEnabled
        ? (this.moderation = { status: "disabled", checked_at: this.ctx.now() })
        : this.modelState("moderation", () => this.ctx.clef.decide("Readiness probe: a photo of the night sky.", { sexual: questionsFor("text").sexual }, { signal }))
            .then((state) => { this.moderation = state; }),
    ]);
  }

  report() {
    const now = this.ctx.now();
    let database: ComponentState;
    try {
      this.ctx.db.prepare("SELECT 1").get();
      database = { status: "ok", checked_at: now };
    } catch {
      database = { status: "unavailable", checked_at: now };
    }
    let media: ComponentState;
    try {
      accessSync(this.store.dir, constants.W_OK);
      media = { status: "ok", checked_at: now };
    } catch {
      media = { status: "unavailable", checked_at: now };
    }
    const components = { database, media, guide: this.guide, moderation: this.moderation };
    const ok = Object.values(components).every((c) => c.status === "ok" || c.status === "disabled");
    return { status: ok ? "ok" : "degraded", components };
  }
}

export default async function healthRoutes(app: FastifyInstance, { readiness }: { readiness: Readiness }) {
  app.get("/health/live", { schema: { tags: ["health"] } }, async () => ({ status: "ok" }));
  app.get("/health/ready", { schema: { tags: ["health"], response: { 200: schemas.HealthReady, 503: schemas.HealthReady } } }, async (_req, reply) => {
    const r = readiness.report();
    const core = r.components.database.status === "ok" && r.components.media.status === "ok";
    return reply.code(core ? 200 : 503).header("cache-control", "no-store").send(r);
  });
}
