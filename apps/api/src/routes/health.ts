import { accessSync, constants } from "node:fs";
import type { FastifyInstance } from "fastify";
import { schemas } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import type { MediaStore } from "../media/store.js";
import { questionsFor } from "../moderation/policy.js";

export type ComponentState = { status: "ok" | "unavailable" | "disabled" | "unknown"; checked_at: number | null; detail?: string };

/**
 * Readiness probes. Database and disk are checked per request (cheap). Model capability is probed in the
 * background (a real 1-token chat and a real System One decision) and cached, so health polls never queue inference.
 */
export class Readiness {
  guide: ComponentState = { status: "unknown", checked_at: null };
  moderation: ComponentState = { status: "unknown", checked_at: null };
  private timer: NodeJS.Timeout | undefined;
  constructor(private ctx: Ctx, private store: MediaStore, private intervalMs = 60_000) {}

  start() {
    void this.probe();
    this.timer = setInterval(() => void this.probe(), this.intervalMs);
    this.timer.unref();
  }
  stop() { clearInterval(this.timer); }

  async probe() {
    const now = this.ctx.now;
    const signal = AbortSignal.timeout(20_000);
    await Promise.all([
      this.ctx.gemma.chat({ messages: [{ role: "user", content: "Reply with OK." }], numPredict: 1, signal, timeoutMs: 20_000 })
        .then(() => (this.guide = { status: "ok", checked_at: now() }))
        .catch((e: Error) => (this.guide = { status: "unavailable", checked_at: now(), detail: (e as { kind?: string }).kind ?? "error" })),
      !this.ctx.config.moderationEnabled
        ? (this.moderation = { status: "disabled", checked_at: now() })
        : this.ctx.clef.decide("Readiness probe: a photo of the night sky.", { sexual: questionsFor("text").sexual }, { signal })
            .then(() => (this.moderation = { status: "ok", checked_at: now() }))
            .catch((e: Error) => (this.moderation = { status: "unavailable", checked_at: now(), detail: (e as { kind?: string }).kind ?? "error" })),
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
