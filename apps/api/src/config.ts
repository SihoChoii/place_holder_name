import { config as loadDotenv } from "dotenv";
import { summaryOptionsFromEnv, type SummaryToolsOptions } from "./guide/astral/summaries.js";
import { LIMITS } from "@stargaze/shared";
import type { ApiStyle } from "./models/http.js";
import { fromRoot, REPO_ROOT } from "./lib/paths.js";

export interface Config {
  host: string;
  port: number;
  /** Allowed browser origins (APP_ORIGIN, comma-separated; first is canonical). */
  appOrigins: string[];
  trustProxy: string | boolean;
  logLevel: string;
  dbPath: string;
  mediaDir: string;
  backupDir: string;
  catalogDir: string;
  modelLockPath: string;
  jwtSecret: string;
  cookieSecure: boolean;
  /** apiKey is sent as a Bearer token only; never logged or reported. */
  guide: { baseUrl: string; model: string; timeoutMs: number; think: boolean; apiStyle: ApiStyle; apiKey: string };
  clef: { baseUrl: string; model: string; callTimeoutMs: number; jobTimeoutMs: number; apiStyle: ApiStyle; apiKey: string };
  moderationEnabled: boolean;
  claimCooldownSeconds: number;
  rate: { loginPerMin: number; signupPerHour: number; writesPerMin: number; chatPerHour: number; summaryPerHour: number };
  /** Astral Harness Wikipedia/xAI summary options (server-only; XAI_API_KEY never leaves the server). */
  summary: SummaryToolsOptions;
}

type Env = Record<string, string | undefined>;

const pick = (env: Env, ...names: string[]) => {
  for (const n of names) {
    const v = env[n]?.trim();
    if (v) return v;
  }
  return undefined;
};

function int(env: Env, name: string, dflt: number, min = 0): number {
  const raw = pick(env, name);
  if (raw === undefined) return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer >= ${min}`);
  return n;
}

function bool(env: Env, name: string, dflt: boolean): boolean {
  const raw = pick(env, name);
  if (raw === undefined) return dflt;
  if (/^(1|true|yes)$/i.test(raw)) return true;
  if (/^(0|false|no)$/i.test(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

function apiStyle(env: Env, name: string): ApiStyle {
  const raw = (pick(env, name) ?? "ollama").toLowerCase();
  if (raw !== "ollama" && raw !== "openai") throw new Error(`${name} must be ollama or openai`);
  return raw;
}

function httpUrl(name: string, raw: string | undefined): string {
  if (!raw) throw new Error(`${name} is required`);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`${name} must be http(s)`);
  return u.origin + u.pathname.replace(/\/+$/, "");
}

/**
 * Load and validate configuration. Reads <repo>/.env (never overrides real env vars).
 * Relative paths resolve against the repository root so every working directory sees the same data.
 */
export function loadConfig(env: Env = process.env, { dotenv = true, partial = false } = {}): Config {
  if (dotenv) loadDotenv({ path: fromRoot(".env"), quiet: true } as never);
  // partial: storage-only tools (migrate, backup, moderation CLI) don't need secrets or model hosts.
  const jwtSecret = pick(env, "JWT_SECRET") ?? (partial ? "-".repeat(32) : "");
  if (jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters (run pnpm run setup)");
  const origins = (pick(env, "APP_ORIGIN", "CORS_ORIGIN") ?? "http://localhost:3000")
    .split(",").map((o) => o.trim()).filter(Boolean).map((o) => new URL(o).origin);
  const trust = pick(env, "TRUST_PROXY");
  return {
    host: pick(env, "HOST", "API_HOST") ?? "0.0.0.0",
    port: int(env, pick(env, "PORT") ? "PORT" : "API_PORT", 4000, 1),
    appOrigins: origins,
    trustProxy: trust === undefined ? false : trust === "true" ? true : trust === "false" ? false : trust,
    logLevel: pick(env, "LOG_LEVEL") ?? "info",
    dbPath: fromRoot(pick(env, "DB_PATH") ?? "./data/stargaze.sqlite"),
    mediaDir: fromRoot(pick(env, "MEDIA_DIR") ?? "./data/media"),
    backupDir: fromRoot(pick(env, "BACKUP_DIR") ?? "./data/backups"),
    catalogDir: fromRoot(pick(env, "CATALOG_DIR") ?? "./catalog"),
    modelLockPath: fromRoot(pick(env, "MODEL_LOCK_PATH") ?? "./docs/model-lock.json"),
    jwtSecret,
    cookieSecure: bool(env, "COOKIE_SECURE", false),
    guide: {
      baseUrl: httpUrl("GUIDE_BASE_URL", pick(env, "GUIDE_BASE_URL", "GEMMA_BASE_URL") ?? (partial ? "http://unset.invalid" : undefined)),
      model: pick(env, "GUIDE_MODEL", "GEMMA_MODEL") ?? "gemma4:e4b-it-q4_K_M",
      timeoutMs: int(env, "GUIDE_TIMEOUT_MS", LIMITS.guideDeadlineMs, 1000),
      think: bool(env, "GUIDE_THINK", false),
      apiStyle: apiStyle(env, "GUIDE_API_STYLE"),
      apiKey: pick(env, "GUIDE_API_KEY") ?? "",
    },
    clef: {
      baseUrl: httpUrl("CLEF_BASE_URL", pick(env, "CLEF_BASE_URL") ?? (partial ? "http://unset.invalid" : undefined)),
      model: pick(env, "CLEF_MODEL") ?? "clef-flash:9b-q8_0",
      callTimeoutMs: int(env, "CLEF_CALL_TIMEOUT_MS", 30_000, 1000),
      jobTimeoutMs: int(env, "CLEF_JOB_TIMEOUT_MS", 120_000, 1000),
      apiStyle: apiStyle(env, "CLEF_API_STYLE"),
      apiKey: pick(env, "CLEF_API_KEY") ?? "",
    },
    moderationEnabled: bool(env, "MODERATION_ENABLED", true),
    claimCooldownSeconds: int(env, "CLAIM_COOLDOWN_SECONDS", LIMITS.claimCooldownSeconds, 0),
    rate: {
      loginPerMin: int(env, "RATE_LOGIN_PER_MIN", 10, 1),
      signupPerHour: int(env, "RATE_SIGNUP_PER_HOUR", 5, 1),
      writesPerMin: int(env, "RATE_WRITES_PER_MIN", 20, 1),
      chatPerHour: int(env, "RATE_CHAT_PER_HOUR", 30, 1),
      summaryPerHour: int(env, "RATE_SUMMARY_PER_HOUR", 30, 1),
    },
    summary: summaryOptionsFromEnv(env),
  };
}

export { REPO_ROOT };
