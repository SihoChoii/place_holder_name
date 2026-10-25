import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { Semaphore } from "../lib/limiter.js";

/** Spec §5: scrypt N=131072, r=8, p=1, 64-byte key, 16-byte salt, maxmem 256 MiB. */
export const SCRYPT = { N: 131072, r: 8, p: 1, keylen: 64, maxmem: 256 * 1024 * 1024 } as const;

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, keylen, opts, (e, k) => (e ? rej(e) : res(k))));

// Each hash uses ~128 MiB; two at a time bounds memory and CPU.
const gate = new Semaphore(2);

/** Encoded as scrypt$N$r$p$saltB64$hashB64 so parameters travel with the hash. */
export function hashPassword(password: string, params = SCRYPT): Promise<string> {
  return gate.run(async () => {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem });
    return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")].join("$");
  });
}

export function verifyPassword(password: string, encoded: string): Promise<boolean> {
  return gate.run(async () => {
    const [alg, n, r, p, saltB64, hashB64] = encoded.split("$");
    if (alg !== "scrypt" || !hashB64) return false;
    const expected = Buffer.from(hashB64, "base64");
    const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  });
}

/** A fixed dummy hash so unknown-email logins cost the same as wrong-password logins. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("not-a-real-password-placeholder"));
