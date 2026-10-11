"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { buyItem, equipAvatar } from "@/server/motivation/shop";
import { setFavoriteBadge } from "@/server/motivation/badges";
import type { AvatarConfig } from "@/lib/avatar";

type R = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): R => { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; };

/** 🛍️ Buy one avatar item at its fixed price (the student's own coins; checked on the server). */
export async function buyItemAction(code: string): Promise<R> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { await buyItem(repo, actor, String(code)); revalidatePath("/student/avatar"); return { ok: true }; } catch (e) { return fail(e); }
}

/** Wear an avatar made of owned items. */
export async function equipAvatarAction(cfg: AvatarConfig): Promise<R> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { await equipAvatar(repo, actor, cfg); revalidatePath("/student/avatar"); return { ok: true }; } catch (e) { return fail(e); }
}

/** 🏅 Pick the favorite badge (form on /student/badges). */
export async function setFavoriteBadgeAction(form: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const code = String(form.get("code") ?? "");
  try { await setFavoriteBadge(repo, actor, code === "none" ? null : code); } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; }
  revalidatePath("/student/badges");
}
