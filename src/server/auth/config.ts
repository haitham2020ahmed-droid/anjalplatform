/**
 * Authentication settings. Values come from validated env (src/lib/env.ts) in the app;
 * tests pass their own. Defaults follow OWASP session-management guidance for a
 * school setting (shared devices → short idle timeout).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface AuthConfig {
  /** Absolute session lifetime. */
  sessionTtlMinutes: number;
  /** Session ends after this much inactivity (shared classroom devices). */
  idleMinutes: number;
  /** Only write lastSeenAt when it is older than this (avoids a DB write per request). */
  touchEveryMinutes: number;
  /** Failed logins before the account is locked. */
  maxFailedLogins: number;
  lockoutMinutes: number;
  /** Login attempts allowed per window, per username+IP and (higher) per IP. */
  rateLimitPerAccount: number;
  rateLimitPerIp: number;
  rateLimitWindowMinutes: number;
}

export const DEFAULT_AUTH: AuthConfig = {
  sessionTtlMinutes: 12 * 60,
  idleMinutes: 60,
  touchEveryMinutes: 5,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
  rateLimitPerAccount: 8,
  rateLimitPerIp: 60,
  rateLimitWindowMinutes: 15,
};

/** 256-bit random session token, URL-safe. Only its hash is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** HMAC-signed value (used for CSRF tokens on route handlers). */
export function sign(value: string, secret: string): string {
  return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
}

export function verifySigned(signed: string, secret: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value, secret));
  const got = Buffer.from(signed);
  return expected.length === got.length && timingSafeEqual(expected, got) ? value : null;
}
