"use server";
import { revalidatePath } from "next/cache";
import { requireActor, repo } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import {
  createGrade, createSkill, createStandard, createUnit, deleteGrade, deleteSkill, deleteStandard, deleteUnit, moveSkillInUnit, moveUnit,
  placeSkillInUnit, setSkillActive, setUnitActive, updateGrade, updateStandard,
} from "@/server/curriculum-manage";
import type { Result } from "../actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const yes = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "1" || f.get(k) === "true";

/** Every curriculum action: server-side permission check, then the change, then a refresh of the pages that show it. */
type Actor = Awaited<ReturnType<typeof requireActor>>;
async function act(actor: Actor, fn: (actor: Actor) => Promise<unknown>, message: string): Promise<Result> {
  try {
    await fn(actor);
    for (const p of ["/admin/curriculum", "/admin/curriculum/standards", "/admin/questions", "/admin/question-bank", "/admin/questions/import"]) revalidatePath(p);
    return { ok: true, message };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

export async function createGradeAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  return act(actor, (a) => createGrade(repo, a, { level: Number(str(f, "level")), name: str(f, "name") || undefined }), "Grade created.");
}
export async function updateGradeAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  return act(actor, (a) => updateGrade(repo, a, str(f, "gradeId"), { ...(f.has("name") ? { name: str(f, "name") } : {}), ...(f.has("isActive") ? { isActive: str(f, "isActive") === "1" } : {}) }), "Saved.");
}
export async function deleteGradeAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  return act(actor, (a) => deleteGrade(repo, a, str(f, "gradeId")), "Grade deleted.");
}
export async function createUnitAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  return act(actor, (a) => createUnit(repo, a, { gradeId: str(f, "gradeId"), title: str(f, "title"), description: str(f, "description"), confirmDuplicate: yes(f, "confirmDuplicate") }), "Unit created.");
}
export async function unitStateAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const op = str(f, "op"), unitId = str(f, "unitId");
  return act(actor, (a) => (op === "up" || op === "down" ? moveUnit(repo, a, unitId, op) : op === "delete" ? deleteUnit(repo, a, unitId) : setUnitActive(repo, a, unitId, op === "activate")), "Saved.");
}
export async function createSkillAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  return act(actor, (a) => createSkill(repo, a, {
    gradeId: str(f, "gradeId"), unitId: str(f, "unitId") || null, name: str(f, "name"), description: str(f, "description"),
    domain: str(f, "domain"), category: str(f, "category"), standardCodes: str(f, "standards").split(/[,\s]+/).filter(Boolean), confirmDuplicate: yes(f, "confirmDuplicate"),
  }), "Skill created.");
}
export async function skillStateAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const op = str(f, "op"), skillId = str(f, "skillId"), unitId = str(f, "unitId");
  return act(actor, (a) => (op === "up" || op === "down" ? moveSkillInUnit(repo, a, unitId, skillId, op) : op === "place" ? placeSkillInUnit(repo, a, skillId, unitId) : op === "delete" ? deleteSkill(repo, a, skillId) : setSkillActive(repo, a, skillId, op === "activate")), "Saved.");
}
export async function createStandardAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  return act(actor, (a) => createStandard(repo, a, { framework: str(f, "framework"), code: str(f, "code"), description: str(f, "description"), gradeLevel: str(f, "gradeLevel") === "" ? null : Number(str(f, "gradeLevel")), confirmDuplicate: yes(f, "confirmDuplicate") }), "Standard created.");
}
export async function standardStateAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "curriculum:edit" });
  const op = str(f, "op"), standardId = str(f, "standardId");
  return act(actor, (a) => (op === "delete" ? deleteStandard(repo, a, standardId)
    : op === "save" ? updateStandard(repo, a, standardId, { description: str(f, "description"), gradeLevel: str(f, "gradeLevel") === "" ? null : Number(str(f, "gradeLevel")) })
    : updateStandard(repo, a, standardId, { isActive: op === "activate" })), "Saved.");
}
