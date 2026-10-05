"use server";
/** Curriculum editor actions. Permission + school scope + audit are enforced inside the services. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import {
  addLesson, addPrerequisite, linkSkillToLesson, linkStandard, removePrerequisite, unlinkSkillFromLesson, unlinkStandard, updateSkill, updateUnit, ValidationError,
} from "@/server/curriculum-admin";

type Result = { error?: string; ok?: boolean };
const id = z.string().min(1).max(191);

async function run(path: string, fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    revalidatePath(path);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

export async function renameUnitAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const unitId = id.parse(f.get("unitId"));
  return run(`/admin/curriculum/unit/${unitId}`, () => updateUnit(repo, actor, unitId, { title: String(f.get("title") ?? ""), description: String(f.get("description") ?? "") }));
}

export async function addLessonAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const unitId = id.parse(f.get("unitId"));
  return run(`/admin/curriculum/unit/${unitId}`, () => addLesson(repo, actor, unitId, { title: String(f.get("title") ?? ""), genre: String(f.get("genre") ?? "") || null }));
}

export async function linkSkillAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const unitId = id.parse(f.get("unitId"));
  const role = z.enum(["COMPREHENSION_SKILL", "STRATEGY_AND_FEATURE", "VOCABULARY_STRATEGY", "AUTHORS_CRAFT", "GRAMMAR", "SPELLING", "WRITING"]).parse(f.get("role"));
  return run(`/admin/curriculum/unit/${unitId}`, () => linkSkillToLesson(repo, actor, id.parse(f.get("lessonId")), id.parse(f.get("skillId")), role));
}

export async function unlinkSkillAction(f: FormData): Promise<void> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const unitId = id.parse(f.get("unitId"));
  await run(`/admin/curriculum/unit/${unitId}`, () => unlinkSkillFromLesson(repo, actor, id.parse(f.get("lessonId")), id.parse(f.get("skillId"))));
}

export async function updateSkillAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const skillId = id.parse(f.get("skillId"));
  return run(`/admin/curriculum/skill/${skillId}`, () => updateSkill(repo, actor, skillId, { name: String(f.get("name") ?? ""), description: String(f.get("description") ?? "") }));
}

export async function addPrerequisiteAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const skillId = id.parse(f.get("skillId"));
  const weight = z.coerce.number().min(0.05).max(1).parse(f.get("weight") ?? 0.5);
  const minimum = z.coerce.number().int().min(0).max(100).parse(f.get("minimumMastery") ?? 60);
  return run(`/admin/curriculum/skill/${skillId}`, () => addPrerequisite(repo, actor, skillId, id.parse(f.get("prerequisiteId")), weight, minimum));
}

export async function removePrerequisiteAction(f: FormData): Promise<void> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const skillId = id.parse(f.get("skillId"));
  await run(`/admin/curriculum/skill/${skillId}`, () => removePrerequisite(repo, actor, skillId, id.parse(f.get("prerequisiteId"))));
}

export async function linkStandardAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const skillId = id.parse(f.get("skillId"));
  const code = z.string().trim().min(3).max(64).parse(f.get("code"));
  const full = code.startsWith("CCSS.") ? code : `CCSS.ELA-LITERACY.${code}`;
  return run(`/admin/curriculum/skill/${skillId}`, () => linkStandard(repo, actor, skillId, full));
}

export async function unlinkStandardAction(f: FormData): Promise<void> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const skillId = id.parse(f.get("skillId"));
  await run(`/admin/curriculum/skill/${skillId}`, () => unlinkStandard(repo, actor, skillId, String(f.get("code"))));
}
