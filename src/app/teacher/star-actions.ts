"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { cancelStar, masteredInClass, starAssign, type StarKind } from "@/server/assign/star";
import type { Track } from "@/server/teacher/assign";

const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
const kindOf = (v: unknown): StarKind => (v === "LESSON" ? "LESSON" : "SKILL");
const TRACKS = new Set(["CURRICULUM", "MAP", "NAFS", "GRAMMAR"]);

/** ☆ → ★ quick assign (src/server/assign/star.ts). */
export async function starAssignAction(input: { kind: string; ref: string; classId: string; dueAt?: string | null; startAt?: string | null; track?: string | null; excludeMastered?: boolean }): Promise<{ ok: true; id: string; already: boolean } | { ok: false; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const r = await starAssign(repo, actor, { kind: kindOf(input?.kind), ref: String(input?.ref ?? ""), classId: String(input?.classId ?? ""), dueAt: input?.dueAt ?? null, startAt: input?.startAt ?? null, track: TRACKS.has(String(input?.track)) ? (String(input.track) as Track) : null, excludeMastered: input?.excludeMastered === true });
    return { ok: true, id: r.id, already: r.already };
  } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}

/** ⭐ How many students of the class already mastered the skill (the "exclude them?" prompt). */
export async function starMasteredAction(input: { classId: string; skillId: string }): Promise<{ count: number; total: number }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try { const r = await masteredInClass(repo, actor, String(input?.classId ?? ""), String(input?.skillId ?? "")); return { count: r.count, total: r.total }; }
  catch (e) { if (known(e)) return { count: 0, total: 0 }; throw e; }
}

/** ★ → ☆ soft cancel. */
export async function starCancelAction(input: { kind: string; id: string }): Promise<{ ok: boolean; message?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try { await cancelStar(repo, actor, { kind: kindOf(input?.kind), id: String(input?.id ?? "") }); return { ok: true }; }
  catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
