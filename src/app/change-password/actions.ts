"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, sessionCookie } from "@/server/auth/http";
import { getActor, getAuthConfig, HOME_BY_ROLE, isProd, repo } from "@/server/auth/next";
import { changePassword } from "@/server/auth/passwords-admin";
import { createSession } from "@/server/auth/sessions";

const Schema = z
  .object({ current: z.string().min(1).max(128), next: z.string().min(1).max(128), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The new passwords do not match.", path: ["confirm"] });

export async function changePasswordAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const s = await getActor();
  if (!s) redirect("/login");
  const parsed = Schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const r = await changePassword(repo, s.actor.userId, parsed.data.current, parsed.data.next, { ip: clientIp(h) });
  if (!r.ok) return { error: r.message };
  // all sessions were revoked; issue a fresh one for this device
  const fresh = (await repo.findUnique("User", { id: s.actor.userId }))!;
  const { token, expiresAt } = await createSession(repo, fresh, getAuthConfig(), { ip: clientIp(h), userAgent: h.get("user-agent") });
  const c = sessionCookie(token, expiresAt, isProd);
  (await cookies()).set(c.name, c.value, c);
  redirect(HOME_BY_ROLE[s.actor.role]);
}
