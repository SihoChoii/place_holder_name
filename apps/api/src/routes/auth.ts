import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { prisma } from "@stargaze/db";
import { loginSchema, registerSchema } from "@stargaze/shared";
import type { AppVariables } from "../auth.js";
import { signToken } from "../auth.js";

function toPublicUser(user: {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

export const authRoutes = new Hono<{ Variables: AppVariables }>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const { email, username, password, displayName } = parsed.data;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return c.json({ error: "Email or username already in use" }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName: displayName ?? username,
      passwordHash,
    },
  });

  const token = await signToken(
    { id: user.id, email: user.email, username: user.username },
    c.get("env").JWT_SECRET,
  );

  return c.json({ token, user: toPublicUser(user) }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await signToken(
    { id: user.id, email: user.email, username: user.username },
    c.get("env").JWT_SECRET,
  );

  return c.json({ token, user: toPublicUser(user) });
});

authRoutes.get("/me", async (c) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { verifyToken } = await import("../auth.js");
  const authUser = await verifyToken(header.slice(7), c.get("env").JWT_SECRET);
  if (!authUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ user: toPublicUser(user) });
});
