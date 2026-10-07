"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { createAssignment } from "@/server/teacher/assignments";
import { assignQuestions, assignSkill } from "@/server/teacher/assign";
import { resolveAlert } from "@/server/teacher/interventions";
import { ValidationError } from "@/server/curriculum-admin";

const id = z.string().min(1).max(191);

export async function resolveAlertAction(f: FormData) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await resolveAlert(repo, actor, id.parse(f.get("alertId")));
  revalidatePath(`/teacher/classes/${id.parse(f.get("classId"))}`);
}

export async function createAssignmentAction(_: { error?: string }, f: FormData): Promise<{ error?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = id.parse(f.get("classId"));
  const target = z.enum(["SKILL", "UNIT"]).parse(f.get("target"));
  const due = String(f.get("dueAt") ?? "");
  try {
    await createAssignment(repo, actor, {
      classId, title: String(f.get("title") ?? ""), target,
      skillIds: target === "SKILL" ? f.getAll("skillIds").map(String) : undefined,
      unitId: target === "UNIT" ? String(f.get("unitId") ?? "") : undefined,
      dueAt: due ? new Date(`${due}T23:59:00`) : null,
      targetMastery: z.coerce.number().int().min(40).max(100).parse(f.get("targetMastery") ?? 75),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  redirect(`/teacher/classes/${classId}`);
}

// ------------------------------------------------------------------ ⭐ Assign a skill


/** Dates from <input type="date"> are school days in Saudi time: start of day / end of day. */
const day = (v: FormDataEntryValue | null, end: boolean): Date | null => {
  const t = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return new Date(`${t}T${end ? "23:59:59" : "00:00:00"}+03:00`);
};

export async function assignSkillAction(_: { error?: string; message?: string }, f: FormData): Promise<{ error?: string; message?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const mode = String(f.get("mode") ?? "class");
    const picked = f.getAll("studentIds").map(String).filter(Boolean);
    if (mode !== "class" && picked.length === 0) return { error: "Choose at least one student." };
    if (mode === "one" && picked.length !== 1) return { error: "Choose exactly one student." };
    const r = await assignSkill(repo, actor, {
      classId: String(f.get("classId") ?? ""), skillId: String(f.get("skillId") ?? ""), studentIds: mode === "class" ? [] : picked,
      startAt: day(f.get("startAt"), false), dueAt: day(f.get("dueAt"), true), note: String(f.get("note") ?? ""),
    });
    revalidatePath("/teacher/curriculum");
    revalidatePath("/teacher/assignments");
    return { message: `Assigned to ${r.students} student${r.students === 1 ? "" : "s"}. They have been notified.` };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

// ------------------------------------------------------------------ ⭐ assign chosen questions

export async function assignQuestionsAction(_: { error?: string; message?: string }, f: FormData): Promise<{ error?: string; message?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const mode = String(f.get("mode") ?? "class");
    const picked = f.getAll("studentIds").map(String).filter(Boolean);
    if (mode !== "class" && picked.length === 0) return { error: "Choose at least one student." };
    if (mode === "one" && picked.length !== 1) return { error: "Choose exactly one student." };
    const r = await assignQuestions(repo, actor, {
      classId: String(f.get("classId") ?? ""), questionIds: f.getAll("questionIds").map(String), studentIds: mode === "class" ? [] : picked,
      title: String(f.get("title") ?? ""), startAt: day(f.get("startAt"), false), dueAt: day(f.get("dueAt"), true), note: String(f.get("note") ?? ""),
    });
    revalidatePath("/teacher/assignments");
    return { message: `${r.questions} question${r.questions === 1 ? "" : "s"} assigned to ${r.students} student${r.students === 1 ? "" : "s"}. They have been notified.` };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}
