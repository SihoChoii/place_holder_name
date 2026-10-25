import { Hono } from "hono";
import { prisma } from "@stargaze/db";
import { createMediaSchema, createReactionSchema } from "@stargaze/shared";
import type { AppVariables } from "../auth.js";
import { requireAuth } from "../auth.js";

export const mediaRoutes = new Hono<{ Variables: AppVariables }>();

mediaRoutes.post("/", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createMediaSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const star = await prisma.star.findUnique({ where: { id: parsed.data.starId } });
  if (!star) {
    return c.json({ error: "Star not found" }, 404);
  }

  if (parsed.data.type !== "TEXT" && !parsed.data.mediaUrl) {
    return c.json({ error: "mediaUrl is required for IMAGE/VIDEO" }, 400);
  }

  const user = c.get("user");
  const media = await prisma.media.create({
    data: {
      starId: parsed.data.starId,
      authorId: user.id,
      type: parsed.data.type,
      body: parsed.data.body,
      mediaUrl: parsed.data.mediaUrl,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    },
  });

  return c.json(
    {
      media: {
        ...media,
        createdAt: media.createdAt.toISOString(),
        updatedAt: media.updatedAt.toISOString(),
      },
    },
    201,
  );
});

mediaRoutes.post("/:id/reactions", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createReactionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const media = await prisma.media.findUnique({ where: { id: c.req.param("id") } });
  if (!media) {
    return c.json({ error: "Media not found" }, 404);
  }

  const user = c.get("user");
  const reaction = await prisma.reaction.upsert({
    where: {
      mediaId_userId_emoji: {
        mediaId: media.id,
        userId: user.id,
        emoji: parsed.data.emoji,
      },
    },
    create: {
      mediaId: media.id,
      userId: user.id,
      emoji: parsed.data.emoji,
    },
    update: {},
  });

  return c.json({ reaction }, 201);
});

mediaRoutes.delete("/:id/reactions/:emoji", requireAuth, async (c) => {
  const user = c.get("user");
  const mediaId = c.req.param("id");
  const emoji = decodeURIComponent(c.req.param("emoji"));

  await prisma.reaction.deleteMany({
    where: { mediaId, userId: user.id, emoji },
  });

  return c.json({ ok: true });
});
