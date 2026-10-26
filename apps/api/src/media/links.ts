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
  const g = ipv6Groups(ip);
  const v4 = (hi: number, lo: number) => isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // Forms embedding an IPv4 address go through the IPv4 rules: IPv4-compatible ::a.b.c.d (also :: and ::1),
  // IPv4-mapped ::ffff:a.b.c.d, NAT64 64:ff9b::a.b.c.d, and 6to4 2002:aabb:ccdd::.
  if (zero(0, 5) && (g[5] === 0 || g[5] === 0xffff)) return v4(g[6], g[7]);
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return v4(g[6], g[7]); // IPv4-translated ::ffff:0:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || (zero(2, 6) ? v4(g[6], g[7]) : true); // 64:ff9b:1::/48 is local-use
  if (g[0] === 0x2002) return v4(g[1], g[2]);
  // ULA, link-local, deprecated site-local, multicast
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
}

/** Expand a valid IPv6 literal (optionally with a dotted IPv4 tail) into eight 16-bit groups. */
function ipv6Groups(ip: string): number[] {
  let s = ip.toLowerCase();
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    s = `${s.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.includes("::") ? s.split("::") : [s, undefined];
  const parse = (part: string | undefined) => (part ? part.split(":").map((h) => parseInt(h, 16)) : []);
  const left = parse(head), right = parse(tail);
  return tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}
