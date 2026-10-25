import { Hono } from "hono";
import { prisma } from "@stargaze/db";
import { starQuerySchema } from "@stargaze/shared";
import type { AppVariables } from "../auth.js";

export const starRoutes = new Hono<{ Variables: AppVariables }>();

starRoutes.get("/", async (c) => {
  const parsed = starQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "Invalid query", details: parsed.error.flatten() }, 400);
  }

  const { q, limit } = parsed.data;
  const stars = await prisma.star.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { constellation: { contains: q, mode: "insensitive" } },
            { catalogId: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    take: limit,
    orderBy: [{ magnitude: "asc" }, { name: "asc" }],
  });

  return c.json({ stars });
});

starRoutes.get("/:id", async (c) => {
  const star = await prisma.star.findUnique({ where: { id: c.req.param("id") } });
  if (!star) {
    return c.json({ error: "Star not found" }, 404);
  }
  return c.json({ star });
});

starRoutes.get("/:id/media", async (c) => {
  const star = await prisma.star.findUnique({ where: { id: c.req.param("id") } });
  if (!star) {
    return c.json({ error: "Star not found" }, 404);
  }

  const media = await prisma.media.findMany({
    where: { starId: star.id },
    include: {
      author: {
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
      _count: { select: { reactions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    media: media.map((m) => ({
      id: m.id,
      starId: m.starId,
      authorId: m.authorId,
      type: m.type,
      body: m.body,
      mediaUrl: m.mediaUrl,
      latitude: m.latitude,
      longitude: m.longitude,
      createdAt: m.createdAt.toISOString(),
      author: {
        ...m.author,
        createdAt: m.author.createdAt.toISOString(),
      },
      reactionCount: m._count.reactions,
    })),
  });
});
