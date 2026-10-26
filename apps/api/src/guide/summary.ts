import type { FastifyReply, FastifyRequest } from "fastify";
import type { SummaryRequest, SummaryResponse } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import type { Viewer } from "../auth/session.js";
import { AppError, notFound } from "../lib/errors.js";
import { SummaryToolError } from "./astral/summaries.js";
import { ModelError } from "../models/http.js";
import type { GemmaClient } from "../models/gemma.js";
import type { GuideQueue } from "./service.js";
import { wikipediaName } from "./tools.js";

/** Blurb rewrite through the shared guide client (either API style), with model errors mapped to summary errors. */
export async function rewriteWithGuide(gemma: GemmaClient, messages: { role: "system" | "user"; content: string }[], signal?: AbortSignal) {
  try {
    return (await gemma.chat({ messages, numPredict: 160, temperature: 0.3, signal })).content;
  } catch (e) {
    if (e instanceof ModelError && e.kind === "aborted") throw e;
    throw e instanceof ModelError && e.kind === "timeout"
      ? new SummaryToolError("timeout", "Gemma timed out")
      : new SummaryToolError("upstream_error", "Gemma is unavailable");
  }
}

const noSummary = () => notFound("No Wikipedia summary is available for this star.");
const timedOut = () => new AppError(504, "guide_timeout", "The summary took too long.");

function summaryErr(e: unknown, signal: AbortSignal): unknown {
  if (e instanceof AppError) return e;
  if (e instanceof SummaryToolError) {
    if (e.code === "not_found" || e.code === "ambiguous") return noSummary();
    if (e.code === "timeout") return timedOut();
    return new AppError(503, "guide_unavailable", "The summary service is unavailable right now.");
  }
  return signal.aborted ? timedOut() : e;
}

/**
 * POST /agent/summary: Wikipedia extract -> Gemma blurb, plus optional xAI speech (only when asked and
 * XAI_API_KEY is configured). Shares the guide's single model lane and has its own per-user hourly allowance.
 */
export async function handleSummary(ctx: Ctx, queue: GuideQueue, req: FastifyRequest, reply: FastifyReply,
  viewer: Extract<Viewer, { kind: "user" }>, body: SummaryRequest): Promise<SummaryResponse> {
  if (!ctx.catalog.has(body.hyg_id)) throw notFound("Unknown star.");
  const title = wikipediaName(ctx, body.hyg_id);
  if (!title) throw noSummary();
  const rateKey = `summary:${viewer.id}`;
  ctx.limiter.hit(rateKey, ctx.config.rate.summaryPerHour, 3600_000);

  const disconnect = new AbortController();
  const onClose = () => { if (!reply.raw.writableEnded) disconnect.abort(new Error("client disconnected")); };
  reply.raw.on("close", onClose);
  const signal = AbortSignal.any([disconnect.signal, AbortSignal.timeout(ctx.config.guide.timeoutMs)]);
  let release: (() => void) | undefined;
  try {
    try {
      release = await queue.acquire(signal);
    } catch (e) {
      ctx.limiter.refund(rateKey); // turned-away requests do not use up the allowance
      throw e instanceof AppError ? e : timedOut();
    }
    const audio = body.audio === true && Boolean(ctx.config.summary.xaiApiKey);
    const r = await ctx.summary.summarize_star(title, { audio, signal }).catch((e) => { throw summaryErr(e, signal); });
    if (r.speechError) req.log.warn({ speech_error: r.speechError.code }, "summary speech failed; returning text only");
    return {
      hyg_id: body.hyg_id, title: r.source.title, blurb: r.blurb,
      source: { title: r.source.title, url: r.source.url },
      audio: r.audio ? { mime_type: "audio/mpeg", base64: Buffer.from(r.audio.bytes).toString("base64") } : null,
    };
  } finally {
    release?.();
    reply.raw.off("close", onClose);
  }
}
