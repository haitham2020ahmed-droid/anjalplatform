"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { challengeSkills, deleteChallengeTemplate, reteachChallenge, saveChallengeTemplate, startChallenge, type ChallengeSkill, type ChallengeSpec, type SkillFilter } from "@/server/game/live-challenge";

/** 🏁 Live Challenge server actions (teacher). Every action checks the session, the role and own-class access. */
const friendly = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };
const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN")[], permission: "assignments:create" as const };

export async function searchChallengeSkillsAction(input: { q?: string; filter?: SkillFilter; grade?: number; mode?: string }): Promise<{ skills?: ChallengeSkill[]; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { skills: await challengeSkills(repo, actor, input) }; } catch (e) { return { error: friendly(e) }; }
}

export async function startChallengeAction(input: Partial<ChallengeSpec> & { classId: string; title?: string }): Promise<{ id?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { id: (await startChallenge(repo, actor, input)).id }; } catch (e) { return { error: friendly(e) }; }
}

export async function saveChallengeTemplateAction(input: { id?: string | null; title: string; spec: Partial<ChallengeSpec> }): Promise<{ id?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { id: await saveChallengeTemplate(repo, actor, input) }; } catch (e) { return { error: friendly(e) }; }
}

export async function deleteChallengeTemplateAction(id: string): Promise<{ error?: string }> {
  const actor = await requireActor(STAFF);
  try { await deleteChallengeTemplate(repo, actor, id); return {}; } catch (e) { return { error: friendly(e) }; }
}

export async function reteachChallengeAction(id: string): Promise<{ assigned?: number; students?: number; skipped?: string[]; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return await reteachChallenge(repo, actor, id); } catch (e) { return { error: friendly(e) }; }
}
