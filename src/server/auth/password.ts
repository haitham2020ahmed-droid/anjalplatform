/**
 * Password hashing with Node's built-in scrypt (memory-hard, OWASP-recommended).
 * No native dependency (bcrypt/argon2 bindings) → simpler, portable deploys.
 * Format: scrypt$N$r$p$<salt b64>$<hash b64>  (parameters stored for future upgrades)
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

const N = 2 ** 15;
const r = 8;
const p = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_POLICY = { minLength: 10, maxLength: 128 };

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < PASSWORD_POLICY.minLength) return `Use at least ${PASSWORD_POLICY.minLength} characters.`;
  if (pw.length > PASSWORD_POLICY.maxLength) return `Use at most ${PASSWORD_POLICY.maxLength} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use letters and at least one number.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(rr), p: Number(pp), maxmem: MAXMEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** True when a stored hash uses weaker parameters than current policy (re-hash on next login). */
export function needsRehash(stored: string): boolean {
  const [, n] = stored.split("$");
  return Number(n) < N;
}
