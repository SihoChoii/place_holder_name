import type { FastifyInstance } from "fastify";
import { LIMITS, schemas, type ChatRequest } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import { requireUser } from "../auth/session.js";
import { handleChat, type GuideQueue } from "../guide/service.js";

/** POST /agent/chat: bounded guide with the fixed start/delta/done/error SSE protocol. */
export default async function agentRoutes(app: FastifyInstance, { ctx, queue }: { ctx: Ctx; queue: GuideQueue }) {
  app.post<{ Body: ChatRequest }>("/agent/chat", {
    bodyLimit: LIMITS.chatBodyMaxBytes,
    preHandler: app.auth,
    schema: { tags: ["guide"], body: schemas.ChatBody, produces: ["text/event-stream"] },
  }, async (req, reply) => {
    await handleChat(ctx, queue, req, reply, requireUser(req.viewer), req.body);
    return reply;
  });
}
