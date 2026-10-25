import { isIP } from "node:net";
import { LIMITS } from "@stargaze/shared";
import { badRequest } from "../lib/errors.js";

/**
 * Validate a user link without fetching it (spec §8): http(s), ≤ 2048 chars, no credentials,
 * no localhost/.local names, no literal private/loopback/link-local addresses. No DNS lookups.
 */
export function validateLink(raw: unknown): string {
  const bad = (why: string) => badRequest(`Invalid link: ${why}.`, "invalid_link");
  if (typeof raw !== "string") throw bad("must be a string");
  const s = raw.trim();
  if (!s || s.length > LIMITS.linkMaxChars) throw bad("length must be 1-2048 characters");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw bad("not a URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw bad("only http and https are allowed");
  if (u.username || u.password) throw bad("credentials are not allowed");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || !host.includes(".") && !isIP(host)) {
    throw bad("local host names are not allowed");
  }
  if (isIP(host) && isPrivateIp(host)) throw bad("private or loopback addresses are not allowed");
  return u.toString();
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIp(mapped[1]);
  return /^(fc|fd|fe[89ab]|ff)/.test(v);
}
