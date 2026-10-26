import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { schemas } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import { AppError, badRequest } from "../lib/errors.js";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password.js";
import { checkOrigin, clearSessionCookie, issueToken, requireUser, setSessionCookie } from "../auth/session.js";
import { nextClaimAt } from "../services/claims.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type UserRow = { id: string; email: string; display_name: string; created_at: number; password_hash: string };
const privateUser = (u: Omit<UserRow, "password_hash">) => ({ id: u.id, email: u.email, display_name: u.display_name, created_at: u.created_at });

export default async function authRoutes(app: FastifyInstance, { ctx }: { ctx: Ctx }) {
  const byEmail = ctx.db.prepare("SELECT * FROM users WHERE email = ?");

  app.post<{ Body: { email: string; password: string; display_name: string } }>("/auth/signup", {
    schema: { tags: ["auth"], body: schemas.SignupBody, response: { 201: schemas.AuthResponse } },
  }, async (req, reply) => {
    checkOrigin(ctx, req, false);
    ctx.limiter.hit(`signup:${req.ip}`, ctx.config.rate.signupPerHour, 3600_000); // before hashing
    const email = req.body.email.trim().toLowerCase();
    const displayName = req.body.display_name.trim();
    if (!EMAIL.test(email)) throw badRequest("Enter a valid email address.", "validation_failed");
    if (!displayName) throw badRequest("Display name is required.", "validation_failed");
    if (byEmail.get(email)) throw new AppError(409, "email_taken", "An account with this email already exists.");
    const hash = await hashPassword(req.body.password);
    const user = { id: randomUUID(), email, display_name: displayName, created_at: ctx.now() };
    try {
      ctx.db.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(user.id, user.email, user.display_name, hash, user.created_at);
    } catch (e) {
      if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new AppError(409, "email_taken", "An account with this email already exists.");
      throw e;
    }
    const { token, expiresAt } = issueToken(ctx, user.id);
    setSessionCookie(ctx, reply, token);
    return reply.code(201).send({ token, expires_at: expiresAt, user: privateUser(user) });
  });

  app.post<{ Body: { email: string; password: string } }>("/auth/login", {
    schema: { tags: ["auth"], body: schemas.LoginBody, response: { 200: schemas.AuthResponse } },
  }, async (req, reply) => {
    checkOrigin(ctx, req, false);
    ctx.limiter.hit(`login:${req.ip}`, ctx.config.rate.loginPerMin, 60_000); // before hashing
    const u = byEmail.get(req.body.email.trim().toLowerCase()) as UserRow | undefined;
    const ok = u ? await verifyPassword(req.body.password, u.password_hash) : (await verifyPassword(req.body.password, await dummyHash()), false);
    if (!u || !ok) throw new AppError(401, "invalid_credentials", "Email or password is incorrect.");
    const { token, expiresAt } = issueToken(ctx, u.id);
    setSessionCookie(ctx, reply, token);
    return { token, expires_at: expiresAt, user: privateUser(u) };
  });

  app.post("/auth/logout", { schema: { tags: ["auth"], response: { 204: { type: "null" } } } }, async (req, reply) => {
    checkOrigin(ctx, req, false);
    clearSessionCookie(ctx, reply);
    return reply.code(204).send();
  });

  app.get("/me", { schema: { tags: ["auth"], response: { 200: schemas.MeResponse } }, preHandler: app.auth }, async (req) => {
    const v = requireUser(req.viewer);
    return {
      user: { id: v.id, email: v.email, display_name: v.displayName, created_at: v.createdAt },
      server_time: ctx.now(),
      next_claim_at: nextClaimAt(ctx, v.id),
      claim_cooldown_seconds: ctx.config.claimCooldownSeconds,
    };
  });
}
