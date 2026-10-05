"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, sessionCookie } from "@/server/auth/http";
import { login } from "@/server/auth/login";
import { getAuthConfig, HOME_BY_ROLE, isProd, repo } from "@/server/auth/next";
import type { Role } from "@/server/auth/rbac";

const LoginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(100),
  password: z.string().min(1, "Enter your password.").max(128),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ username: form.get("username"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const r = await login(repo, { ...parsed.data, ip: clientIp(h), userAgent: h.get("user-agent") }, getAuthConfig());
  if (!r.ok) return { error: r.message };
  const c = sessionCookie(r.token, r.expiresAt, isProd);
  (await cookies()).set(c.name, c.value, c);
  redirect(r.mustChangePassword ? "/change-password" : HOME_BY_ROLE[String(r.user.role) as Role]);
}
