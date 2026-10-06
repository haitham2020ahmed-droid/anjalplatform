/**
 * Next.js glue: reads the session cookie, validates it, resolves the Actor.
 * Every page, Server Action and route handler that touches data starts with
 * `requireActor()` (+ `assertCan` / `assertStudentAccess` for the specific record).
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PrismaRepo } from "@/server/db/prisma-repo";
import { resolveActor } from "./actor";
import { DEFAULT_AUTH, type AuthConfig } from "./config";
import { sessionCookieName } from "./http";
import { assertCan, type Actor, type Permission, type Role } from "./rbac";
import { validateSession } from "./sessions";

export const repo = new PrismaRepo(db);
// NODE_ENV is set by Next.js itself; reading it needs no validation (see src/lib/env.ts)
export const isProd = process.env.NODE_ENV === "production";

/** Session and login settings from the validated environment (read per use, never at import). */
export function getAuthConfig(): AuthConfig {
  return {
    ...DEFAULT_AUTH,
    sessionTtlMinutes: env.SESSION_TTL_MINUTES,
    idleMinutes: env.SESSION_IDLE_MINUTES,
    rateLimitPerAccount: env.LOGIN_RATE_LIMIT,
    maxFailedLogins: env.LOGIN_LOCKOUT_ATTEMPTS,
    lockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
  };
}

export const HOME_BY_ROLE: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  SCHOOL_ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  PARENT: "/parent",
};

/** Validated session + actor for this request (memoised per request). */
export const getActor = cache(async (): Promise<{ actor: Actor; user: Record<string, unknown> } | null> => {
  const token = (await cookies()).get(sessionCookieName(isProd))?.value;
  const v = await validateSession(repo, token, getAuthConfig());
  if (!v.ok) return null;
  return { actor: await resolveActor(repo, v.user), user: v.user };
});

/** Redirects to /login when signed out; enforces forced password change; checks role/permission. */
export async function requireActor(opts: { roles?: Role[]; permission?: Permission } = {}): Promise<Actor> {
  const s = await getActor();
  if (!s) redirect("/login");
  if (s.user.mustChangePassword) redirect("/change-password");
  if (opts.roles && !opts.roles.includes(s.actor.role)) redirect(HOME_BY_ROLE[s.actor.role]);
  if (opts.permission) assertCan(s.actor, opts.permission);
  return s.actor;
}

/** For route handlers (no redirects): the validated actor, or null. */
export async function apiActor(): Promise<Actor | null> {
  const s = await getActor();
  return s && !s.user.mustChangePassword ? s.actor : null;
}
