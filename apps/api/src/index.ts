import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: corsOrigin.split(",").map((s) => s.trim()),
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "stargaze-api" }));

// Add routes here.

console.log(`API listening on http://${host}:${port}`);
serve({ fetch: app.fetch, hostname: host, port });
