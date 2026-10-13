"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { getT } from "@/i18n/server";
import { assignTest, deleteTemplate, personalizeNafsFromTest, reteach, saveTemplate, type AssignTestInput, type LevelMode, type TemplateSpec, type TestPreview, type Versions } from "@/server/tests/assessments";
import { composeTest, type ComposeInput } from "@/server/tests/compose";
import { assertNoDuplicateQuestions, mapSectionQuestions, mapSourceTree, type MapSectionPage, type MapSourceTree } from "@/server/tests/map-source";
import { assertPreviewedAsStudent, saveStudentPreview } from "@/server/tests/student-preview";
import { generateTest, replaceQuestion, type GeneratedTest, type GenerateInput } from "@/server/tests/generate";
import type { MapSourceQuestion } from "@/server/tests/map-source";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "assignments:create" as const };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
/** A date box value (YYYY-MM-DD): the open date starts that morning, the due date ends that evening. */
const dateOf = (v: unknown, endOfDay = false): Date | null => { let t = String(v ?? "").trim(); if (!t) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += endOfDay ? "T23:59:59" : "T00:00:00"; const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d; };

/**
 * Preview: the platform picks `count` questions for each skill; a skill with the teacher's own questions
 * ("I'll pick the questions") uses exactly those, in every version; Curriculum Map picks come first, in the
 * teacher's order. Repeated questions (same question, or same text and answer) are refused.
 */
export async function previewTestAction(input: ComposeInput): Promise<{ preview?: TestPreview; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { preview: await composeTest(repo, actor, { skills: Array.isArray(input?.skills) ? input.skills : [], levelMode: input?.levelMode, seed: String(input?.seed ?? ""), mapQuestionIds: Array.isArray(input?.mapQuestionIds) ? input.mapQuestionIds.map(String) : [] }) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 📚 Curriculum Map questions: one grade's units, text sets / selections and sections (with counts). */
export async function mapTreeAction(grade?: number | null): Promise<{ tree?: MapSourceTree; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { tree: await mapSourceTree(repo, actor, grade === null || grade === undefined ? null : Number(grade)) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 📚 One section's questions (a page at a time; `all` for "Select all in section"). */
export async function mapSectionAction(input: { code: string; page?: number; type?: string | null; level?: string | null; all?: boolean }): Promise<{ page?: MapSectionPage; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { page: await mapSectionQuestions(repo, actor, { code: String(input?.code ?? ""), page: Number(input?.page) || 1, type: input?.type ? String(input.type) : null, level: input?.level ? String(input.level) : null, all: Boolean(input?.all) }) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** ⚡ Make the test for me: a balanced test from the chosen lessons and skills (fills the builder's selected list). */
export async function generateTestAction(input: GenerateInput): Promise<{ test?: GeneratedTest; error?: string }> {
  const actor = await requireActor(STAFF);
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  try {
    return { test: await generateTest(repo, actor, {
      lessons: Array.isArray(input?.lessons) ? input.lessons.map(String) : [], skillIds: Array.isArray(input?.skillIds) ? input.skillIds.map(String) : [],
      count: Number(input?.count), level: String(input?.level ?? ""), classId: input?.classId ? String(input.classId) : null,
      types: input?.types && typeof input.types === "object" ? input.types : null, passageShare: num(input?.passageShare), totalMarks: num(input?.totalMarks), seed: String(input?.seed ?? ""),
    }) };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 🔁 Replace one question with a similar one (same skill and level, not already in the test). */
export async function replaceQuestionAction(input: { questionId: string; exclude: string[]; classId?: string | null }): Promise<{ row?: MapSourceQuestion; error?: string }> {
  const actor = await requireActor(STAFF);
  try { return { row: await replaceQuestion(repo, actor, { questionId: String(input?.questionId ?? ""), exclude: Array.isArray(input?.exclude) ? input.exclude.map(String) : [], classId: input?.classId ? String(input.classId) : null, seed: String(Date.now()) }) }; }
  catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

/** 👀 Saves the test for "Preview as student"and returns the preview page address. */
export async function studentPreviewAction(input: { title: string; levelMode: LevelMode; questions: Versions }): Promise<{ href?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  try {
    const id = await saveStudentPreview(repo, actor, { title: String(input?.title ?? ""), levelMode: input?.levelMode === "LEVEL" ? "LEVEL" : "SAME", questions: input?.questions ?? {} });
    return { href: `/teacher/preview?test=${encodeURIComponent(id)}` };
  } catch (e) { if (known(e)) return { error: (e as Error).message }; throw e; }
}

export async function assignTestAction(input: Omit<AssignTestInput, "openAt" | "dueAt"> & { openAt?: string; dueAt?: string }): Promise<{ testId?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  try {
    // no repeated questions, and "Preview as student" first (exactly these questions)
    const levelMode: LevelMode = input?.levelMode === "LEVEL" ? "LEVEL" : "SAME";
    const qs: Versions = input?.questions ?? {};
    for (const key of levelMode === "LEVEL" ? (["BELOW", "ON", "ABOVE"] as const) : (["SAME"] as const)) await assertNoDuplicateQuestions(repo, (qs[key] ?? []).map(String));
    await assertPreviewedAsStudent(repo, actor, { levelMode, questions: qs });
    const r = await assignTest(repo, actor, {
      classId: String(input?.classId ?? ""), type: String(input?.type ?? ""), title: String(input?.title ?? ""), levelMode: input?.levelMode,
      studentIds: Array.isArray(input?.studentIds) ? input.studentIds.map(String) : [], openAt: dateOf(input?.openAt), dueAt: dateOf(input?.dueAt, true),
      timeLimitMin: input?.timeLimitMin ?? null, shuffle: Boolean(input?.shuffle), questions: input?.questions ?? {}, templateId: input?.templateId ? String(input.templateId) : null,
      marks: input?.marks && typeof input.marks === "object" ? input.marks : null,
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
