import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import type { Env } from "./env.js";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
};

export type AppVariables = {
  user: AuthUser;
  env: Env;
};

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signToken(user: AuthUser, secret: string): Promise<string> {
  return new SignJWT({ email: user.email, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey(secret));
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(c: Context<{ Variables: AppVariables }>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = header.slice("Bearer ".length);
  const user = await verifyToken(token, c.get("env").JWT_SECRET);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
}
