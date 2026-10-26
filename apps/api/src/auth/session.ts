import type { FastifyReply, FastifyRequest } from "fastify";
import { LIMITS } from "@stargaze/shared";
import { AppError, unauthorized } from "../lib/errors.js";
import type { Ctx } from "../context.js";

export const COOKIE = "st_session";
export const ISSUER = "stargaze-api";
export const AUDIENCE = "stargaze";

export type Viewer = { kind: "public" } | { kind: "user"; id: string; displayName: string; email: string; createdAt: number };
export const PUBLIC: Viewer = { kind: "public" };
/** SQL parameter for "the caller's own content": "" never matches a UUID, so public/guide sees approved only. */
export const viewerId = (v: Viewer) => (v.kind === "user" ? v.id : "");

declare module "fastify" {
  interface FastifyRequest { viewer: Viewer }
}

export function issueToken(ctx: Ctx, userId: string) {
  const expiresAt = ctx.now() + LIMITS.jwtTtlSeconds * 1000;
  // exp/iat come from the app clock (injectable in tests) rather than the signer's wall clock.
  const token = ctx.app.jwt.sign(
    { sub: userId, iat: Math.floor(ctx.now() / 1000), exp: Math.floor(expiresAt / 1000) },
    { iss: ISSUER, aud: AUDIENCE } as never,
  );
  return { token, expiresAt };
}

export function setSessionCookie(ctx: Ctx, reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", secure: ctx.config.cookieSecure, maxAge: LIMITS.jwtTtlSeconds,
  });
}

export function clearSessionCookie(ctx: Ctx, reply: FastifyReply) {
  reply.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", path: "/", secure: ctx.config.cookieSecure });
}

/** Browser Origin check: if present it must be an allowed app origin; "null" is rejected. */
export function checkOrigin(ctx: Ctx, req: FastifyRequest, required: boolean) {
  const origin = req.headers.origin;
  if (origin === undefined && !required) return;
  if (!origin || origin === "null" || !ctx.config.appOrigins.includes(origin)) {
    throw new AppError(403, "bad_origin", "Request origin is not allowed.");
  }
}

function verify(ctx: Ctx, token: string): string {
  try {
    const p = ctx.app.jwt.verify<{ sub?: string; exp?: number }>(token, {
      allowedIss: ISSUER, allowedAud: AUDIENCE, algorithms: ["HS256"], requiredClaims: ["iss", "aud", "sub", "exp"],
    } as never);
    if (typeof p.sub !== "string") throw new Error("no sub");
    if (typeof p.exp !== "number" || p.exp * 1000 <= ctx.now()) throw new Error("expired");
    return p.sub;
  } catch {
    throw unauthorized("Your session is invalid or expired. Sign in again.");
  }
}

/**
 * Resolve the caller. Authorization header wins and never falls back to the cookie; a cookie naming a
 * different user is a conflict. Cookie-authenticated writes require a matching Origin.
 */
export function authenticate(ctx: Ctx, req: FastifyRequest): Viewer {
  const header = req.headers.authorization;
  const cookie = req.cookies[COOKIE];
  let userId: string;
  if (header !== undefined) {
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    if (!m) throw unauthorized("Malformed Authorization header.");
    userId = verify(ctx, m[1]);
    if (cookie) {
      let cookieUser: string | undefined;
      try { cookieUser = verify(ctx, cookie); } catch { /* stale cookie alongside a valid bearer is ignored */ }
      if (cookieUser && cookieUser !== userId) throw unauthorized("Conflicting credentials.");
    }
  } else if (cookie) {
    userId = verify(ctx, cookie);
    if (req.method !== "GET" && req.method !== "HEAD") checkOrigin(ctx, req, true);
  } else {
    throw unauthorized();
  }
  const u = ctx.q.userById.get(userId) as { id: string; email: string; display_name: string; created_at: number } | undefined;
  if (!u) throw unauthorized("Your session is invalid or expired. Sign in again.");
  return { kind: "user", id: u.id, email: u.email, displayName: u.display_name, createdAt: u.created_at };
}

export function requireUser(v: Viewer) {
  if (v.kind !== "user") throw unauthorized();
  return v;
}
