import { createHash } from "node:crypto";

/**
 * Normalized request fingerprint for idempotency: SHA-256 over canonical JSON (sorted object keys,
 * arrays kept in order so link/image order matters). Include target ids, text and image hashes.
 */
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}
