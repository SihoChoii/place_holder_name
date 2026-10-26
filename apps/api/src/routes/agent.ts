import type { FastifyInstance } from "fastify";
import { LIMITS, schemas, type ChatRequest, type SummaryRequest } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import { requireUser } from "../auth/session.js";
import { handleChat, type GuideQueue } from "../guide/service.js";
import { handleSummary } from "../guide/summary.js";

/** POST /agent/chat: bounded guide with the fixed start/delta/done/error SSE protocol. */
export default async function agentRoutes(app: FastifyInstance, { ctx, queue }: { ctx: Ctx; queue: GuideQueue }) {
  app.post<{ Body: ChatRequest }>("/agent/chat", {
    bodyLimit: LIMITS.chatBodyMaxBytes,
    preHandler: app.auth,
    schema: {
      tags: ["guide"], body: schemas.ChatBody, produces: ["text/event-stream"],
      response: {
        200: { description: "text/event-stream: start, delta…, then done or error {code: guide_unavailable|guide_timeout|internal_error}", type: "string" },
        400: schemas.ErrorBody, 401: schemas.ErrorBody, 429: schemas.ErrorBody,
        503: { ...schemas.ErrorBody, description: "guide_busy or guide_unavailable" },
        504: { ...schemas.ErrorBody, description: "guide_timeout: the 60 s guide deadline expired before streaming started" },
      },
    },
  }, async (req, reply) => {
    await handleChat(ctx, queue, req, reply, requireUser(req.viewer), req.body);
    return reply;
  });

  app.post<{ Body: SummaryRequest }>("/agent/summary", {
    bodyLimit: 1024,
    preHandler: app.auth,
    schema: {
      tags: ["guide"], body: schemas.SummaryBody,
      response: {
        200: schemas.SummaryResponse,
        400: schemas.ErrorBody, 401: schemas.ErrorBody,
        404: { ...schemas.ErrorBody, description: "not_found: unknown star, or no Wikipedia article for it" },
        429: schemas.ErrorBody,
        503: { ...schemas.ErrorBody, description: "guide_busy or guide_unavailable (Gemma or Wikipedia down)" },
        504: { ...schemas.ErrorBody, description: "guide_timeout" },
      },
    },
  }, async (req, reply) => handleSummary(ctx, queue, req, reply, requireUser(req.viewer), req.body));
}
