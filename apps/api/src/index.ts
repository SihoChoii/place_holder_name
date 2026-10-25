import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppVariables } from "./auth.js";
import { loadEnv } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { mediaRoutes } from "./routes/media.js";
import { starRoutes } from "./routes/stars.js";

// Load monorepo root .env
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const env = loadEnv();

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use("*", async (c, next) => {
  c.set("env", env);
  await next();
});

app.get("/health", (c) => c.json({ ok: true, service: "stargaze-api" }));

app.route("/auth", authRoutes);
app.route("/stars", starRoutes);
app.route("/media", mediaRoutes);

console.log(`API listening on http://${env.API_HOST}:${env.API_PORT}`);
serve({
  fetch: app.fetch,
  hostname: env.API_HOST,
  port: env.API_PORT,
});
