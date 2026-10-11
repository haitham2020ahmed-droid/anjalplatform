"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { getT } from "@/i18n/server";
import { assignTest, deleteTemplate, personalizeNafsFromTest, previewTest, reteach, saveTemplate, type AssignTestInput, type LevelMode, type PickedSkill, type TemplateSpec, type TestPreview } from "@/server/tests/assessments";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "assignments:create" as const };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
/** A date box value (YYYY-MM-DD): the open date starts that morning, the due date ends that evening. */
const dateOf = (v: unknown, endOfDay = false): Date | null => { let t = String(v ?? "").trim(); if (!t) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += endOfDay ? "T23:59:59" : "T00:00:00"; const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d; };

export async function previewTestAction(input: { skills: PickedSkill[]; levelMode: LevelMode; seed?: string }): Promise<{ preview?: TestPreview; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { preview: await previewTest(repo, actor, { skills: Array.isArray(input?.skills) ? input.skills : [], levelMode: input?.levelMode === "LEVEL" ? "LEVEL" : "SAME", seed: String(input?.seed ?? "") }) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

export async function assignTestAction(input: Omit<AssignTestInput, "openAt" | "dueAt"> & { openAt?: string; dueAt?: string }): Promise<{ testId?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  try {
    const r = await assignTest(repo, actor, {
      classId: String(input?.classId ?? ""), type: String(input?.type ?? ""), title: String(input?.title ?? ""), levelMode: input?.levelMode,
      studentIds: Array.isArray(input?.studentIds) ? input.studentIds.map(String) : [], openAt: dateOf(input?.openAt), dueAt: dateOf(input?.dueAt, true),
      timeLimitMin: input?.timeLimitMin ?? null, shuffle: Boolean(input?.shuffle), questions: input?.questions ?? {}, templateId: input?.templateId ? String(input.templateId) : null,
    });
    return { testId: r.testId };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

export async function saveTemplateAction(input: { id?: string | null; title: string; type: string; spec: TemplateSpec }): Promise<{ id?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { id: await saveTemplate(repo, actor, { id: input?.id ? String(input.id) : null, title: String(input?.title ?? ""), type: String(input?.type ?? ""), spec: input?.spec }) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

export async function deleteTemplateAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const { t } = await getT();
  let msg = t("Template deleted.");
  try { await deleteTemplate(repo, actor, String(f.get("id") ?? "")); } catch (e) { if (known(e)) msg = t((e as Error).message); else throw e; }
  redirect(`/teacher/assessments?msg=${encodeURIComponent(msg)}`);
}

export async function reteachAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const { t } = await getT();
  const id = String(f.get("testId") ?? "");
  let msg: string;
  try {
    const r = await reteach(repo, actor, id);
    msg = r.assigned ? t("✓ Reteach: {skills} skill(s) added to the My Work of {students} student(s).", { skills: r.assigned, students: r.students }) : t("Nothing to reteach: no new skill under 70%.");
    if (r.skipped.length) msg += ` ${t("Left the class (not added): {names}", { names: r.skipped.join(", ") })}`;
  } catch (e) { if (known(e)) msg = t((e as Error).message); else throw e; }
  redirect(`/teacher/assessments/${encodeURIComponent(id)}?msg=${encodeURIComponent(msg)}`);
}

/** 🇸🇦 NAFS test → each student's personal NAFS plan (the skills they scored under 70% on). */
export async function personalizeNafsAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const { t } = await getT();
  const id = String(f.get("testId") ?? "");
  let msg: string;
  try {
    const r = await personalizeNafsFromTest(repo, actor, id);
    msg = r.already ? t("The NAFS plan of this test is already personalized.") : r.students ? t("✓ NAFS plan personalized: {students} student(s) got the skills they missed ({skills} skill(s)) in My Plans and My Work.", { students: r.students, skills: r.skills }) : t("Everyone scored 70% or more: no personal NAFS plan needed.");
  } catch (e) { if (known(e)) msg = t((e as Error).message); else throw e; }
  redirect(`/teacher/assessments/${encodeURIComponent(id)}?msg=${encodeURIComponent(msg)}`);
}
