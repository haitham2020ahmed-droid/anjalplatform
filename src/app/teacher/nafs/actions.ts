"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { getT } from "@/i18n/server";
import { builderRows, buildNafsAutomatic, buildNafsFull, buildNafsMinistry, buildNafsSimulation, cleanDifficultyMix, createFullNafsPractice, moreForStandard, replaceNafsQuestion, saveFullNafsTest, type BuilderRow, type FullSettings, type MinistrySettings } from "@/server/nafs/build";
import { createNafsPractice, deleteNafsPractice } from "@/server/nafs/practice";
import { nafsBankPage, retagNafsQuestion, reviewNafsDraft, saveNafsQuestion, setNafsFamilyLink, setNafsHidden, type BankPage, type BankSource, type NafsQuestionInput } from "@/server/nafs/bank";
import { assignNafsOnline, deleteNafsTest, markWrittenAnswer, releaseNafsResults, saveNafsAnswers, saveNafsTest, updateNafsAssignment, type SaveTestInput } from "@/server/nafs/tests";
import { generateNafsDrafts, type AiNafsInput } from "@/server/nafs/ai";
import type { SimulationSettings } from "@/server/nafs/framework";

/**
 * 🇸🇦 The NAFS section's actions. Every one asks the server again: the actor (teacher or admin), NAFS access (Grade 6
 * teachers and admins: assertNafs inside each server function), the school, and for classes / students the actor's
 * own Grade 6 classes. Bubble-sheet answers arrive as answers only — never an image.
 */
const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[] };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
const str = (v: FormDataEntryValue | null) => String(v ?? "");
const dateOf = (v: unknown, end = false): Date | null => { let t = String(v ?? "").trim(); if (!t) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += end ? "T23:59:59" : "T00:00:00"; const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d; };
async function wrap<T>(fn: () => Promise<T>): Promise<{ ok?: T; error?: string }> {
  try { return { ok: await fn() }; } catch (e) { if (known(e)) { const { t } = await getT(); return { error: t((e as Error).message) }; } throw e; }
}
const back = (href: string, msg: string) => redirect(`${href}${href.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);

// ------------------------------------------------------------------ bank

export async function saveQuestionAction(input: NafsQuestionInput): Promise<{ ok?: { id: string; copied: boolean }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => saveNafsQuestion(repo, actor, {
    id: input?.id ? String(input.id) : null, nafsCode: String(input?.nafsCode ?? ""), process: input?.process ? String(input.process) : null,
    standard: input?.standard ? String(input.standard) : null, kind: input?.kind === "WRITTEN" ? "WRITTEN" : "MCQ",
    model: input?.model ? String(input.model) : null, rubric: Array.isArray(input?.rubric) ? input.rubric.map(String).slice(0, 3) : null,
    stem: String(input?.stem ?? ""), options: Array.isArray(input?.options) ? input.options.map(String) : [], correct: Number(input?.correct),
    explanation: input?.explanation ? String(input.explanation) : null, passageTitle: input?.passageTitle ? String(input.passageTitle) : null,
    passageText: input?.passageText ? String(input.passageText) : null, textType: input?.textType === "LIT" || input?.textType === "INFO" ? input.textType : null,
    difficulty: input?.difficulty ? Number(input.difficulty) : null,
  }));
}

export async function hideQuestionAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const hidden = str(form.get("hidden")) === "1";
  const ret = str(form.get("back")) || "/teacher/nafs?tab=bank";
  const { t } = await getT();
  try { await setNafsHidden(repo, actor, str(form.get("id")), hidden); } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
  revalidatePath("/teacher/nafs");
  back(ret, t(hidden ? "Hidden from the NAFS bank (not deleted)." : "Shown in the NAFS bank again."));
}

export async function retagAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const ret = str(form.get("back")) || "/teacher/nafs?tab=bank";
  const { t } = await getT();
  try { await retagNafsQuestion(repo, actor, str(form.get("id")), str(form.get("code")), str(form.get("process")) || null, new Date(), form.has("standard") ? str(form.get("standard")) || null : undefined); } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
  back(ret, t("Saved."));
}

export async function reviewDraftAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const ret = str(form.get("back")) || "/teacher/nafs?tab=bank&src=DRAFT";
  const approve = str(form.get("approve")) === "1";
  const { t } = await getT();
  try { await reviewNafsDraft(repo, actor, str(form.get("id")), approve); } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
  back(ret, t(approve ? "Approved: the question can now be used in NAFS tests." : "Rejected: the draft is hidden (not deleted)."));
}

/** Admin: link / unlink a NAFS skill and a platform skill. */
export async function linkFamilyAction(form: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { t } = await getT();
  const ret = "/teacher/nafs?tab=skills";
  try { await setNafsFamilyLink(repo, actor, { code: str(form.get("code")), familyId: str(form.get("familyId")), linked: str(form.get("linked")) === "1" }); } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
  back(ret, t("Saved."));
}

/** The builder's "Add from the bank" list (a page at a time). */
export async function bankSearchAction(input: { code?: string | null; q?: string | null; page?: number; source?: BankSource; standard?: string | null; difficulty?: number | null }): Promise<{ ok?: BankPage; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => nafsBankPage(repo, actor, { code: input?.code ? String(input.code) : null, q: input?.q ? String(input.q) : null, page: Number(input?.page) || 1, source: input?.source === "OWN" || input?.source === "PLATFORM" ? input.source : "ALL", standard: input?.standard ? String(input.standard) : null, difficulty: input?.difficulty ? Number(input.difficulty) : null }));
}

// ------------------------------------------------------------------ tests: build, change, save

export async function simulationAction(input: { settings?: Partial<SimulationSettings>; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<{ ok?: { rows: BuilderRow[]; notes: string[]; settings: SimulationSettings }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsSimulation(repo, actor, { settings: input?.settings ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes, settings: b.settings };
  });
}

export async function ministryAction(input: { settings?: Partial<MinistrySettings>; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<{ ok?: { rows: BuilderRow[]; notes: string[]; settings: MinistrySettings }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsMinistry(repo, actor, { settings: input?.settings ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes, settings: b.settings };
  });
}

export async function automaticAction(input: { codes: string[]; total?: number | null; perSkill?: Record<string, number> | null; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<{ ok?: { rows: BuilderRow[]; notes: string[] }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsAutomatic(repo, actor, { codes: Array.isArray(input?.codes) ? input.codes.map(String) : [], total: input?.total ?? null, perSkill: input?.perSkill ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes };
  });
}

// ------------------------------------------------------------------ adaptive practice (Tool 1)

/** "Give adaptive practice": the targets (or the questions chosen in the bank), the class / students, the limits. */
export async function createPracticeAction(form: FormData): Promise<void> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  const ret = "/teacher/nafs?tab=practice";
  const { t } = await getT();
  let id = "";
  try {
    const r = await createNafsPractice(repo, actor, {
      title: str(form.get("title")), targets: form.getAll("target").map(String), questionIds: form.getAll("pick").map(String).filter(Boolean),
      classId: str(form.get("classId")), studentIds: form.getAll("sid").map(String).filter(Boolean),
      maxQuestions: str(form.get("max")) ? Number(form.get("max")) : null, timeLimitMin: str(form.get("minutes")) ? Number(form.get("minutes")) : null, dueAt: dateOf(form.get("dueAt"), true),
    });
    id = r.id;
    revalidatePath("/teacher/nafs");
    back(`${ret}&open=${encodeURIComponent(id)}`, t("Given to {n} student(s). They find it in their NAFS icon.", { n: r.students }));
  } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
}

export async function deletePracticeAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const { t } = await getT();
  try { await deleteNafsPractice(repo, actor, str(form.get("id"))); } catch (e) { if (known(e)) back("/teacher/nafs?tab=practice", t((e as Error).message)); throw e; }
  back("/teacher/nafs?tab=practice", t("Practice removed."));
}

// ------------------------------------------------------------------ "Complete NAFS test (all standards)"

export interface FullBuildResult { rows: BuilderRow[]; notes: string[]; counts: Record<string, number>; available: Record<string, number>; shortage: Record<string, number>; settings: FullSettings }
/** Builds the complete NAFS test (every Ministry standard) for the teacher to audit before saving. */
export async function fullBuildAction(input: { settings?: { questions?: number; minutes?: number; written?: boolean; counts?: Record<string, number> | null }; classId?: string | null; seed?: string; difficulty?: unknown; practice?: boolean }): Promise<{ ok?: FullBuildResult; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsFull(repo, actor, { settings: input?.settings ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty), practice: Boolean(input?.practice) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes, counts: b.counts, available: b.available, shortage: b.shortage, settings: b.settings };
  });
}

/** n more questions of one standard (the teacher raised its count). */
export async function fullMoreAction(input: { standard: string; n: number; current: string[]; classId?: string | null; written?: boolean }): Promise<{ ok?: BuilderRow[]; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const ids = await moreForStandard(repo, actor, { standard: String(input?.standard ?? ""), n: Number(input?.n), current: Array.isArray(input?.current) ? input.current.map(String) : [], classId: input?.classId ? String(input.classId) : null, written: Boolean(input?.written), seed: String(Date.now()) });
    return builderRows(repo, actor, ids);
  });
}

export async function saveFullTestAction(input: Omit<SaveTestInput, "mode"> & { confirmUncovered?: boolean }): Promise<{ ok?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => saveFullNafsTest(repo, actor, {
    id: input?.id ? String(input.id) : null, title: String(input?.title ?? ""), questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : [],
    marks: input?.marks ?? null, timeLimitMin: input?.timeLimitMin ?? null, settings: input?.settings ?? null, confirmUncovered: Boolean(input?.confirmUncovered),
  }));
}

export async function fullPracticeAction(input: { title: string; classId: string; studentIds?: string[] | null; questionIds?: string[] | null; wholeBank?: boolean; maxQuestions?: number | null; timeLimitMin?: number | null; dueAt?: string | null; confirmUncovered?: boolean }): Promise<{ ok?: { id: string; students: number }; error?: string }> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  return wrap(async () => {
    const r = await createFullNafsPractice(repo, actor, {
      title: String(input?.title ?? ""), classId: String(input?.classId ?? ""), studentIds: Array.isArray(input?.studentIds) ? input.studentIds.map(String).filter(Boolean) : null,
      questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : null, wholeBank: Boolean(input?.wholeBank),
      maxQuestions: input?.maxQuestions ? Number(input.maxQuestions) : null, timeLimitMin: input?.timeLimitMin ? Number(input.timeLimitMin) : null, dueAt: dateOf(input?.dueAt, true),
      confirmUncovered: Boolean(input?.confirmUncovered),
    });
    revalidatePath("/teacher/nafs");
    return r;
  });
}

export async function replaceAction(input: { questionId: string; current: string[]; classId?: string | null; sameStandard?: boolean }): Promise<{ ok?: BuilderRow; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const id = await replaceNafsQuestion(repo, actor, { questionId: String(input?.questionId ?? ""), current: Array.isArray(input?.current) ? input.current.map(String) : [], classId: input?.classId ? String(input.classId) : null, seed: String(Date.now()), sameStandard: Boolean(input?.sameStandard) });
    return (await builderRows(repo, actor, [id]))[0];
  });
}

export async function rowsAction(ids: string[]): Promise<{ ok?: BuilderRow[]; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => builderRows(repo, actor, Array.isArray(ids) ? ids.map(String) : []));
}

export async function saveTestAction(input: SaveTestInput): Promise<{ ok?: string; error?: string }> {
  // a complete NAFS test is always saved with its coverage check
  if (String(input?.mode ?? "") === "FULL") return saveFullTestAction({ ...input, confirmUncovered: false });
  const actor = await requireActor(STAFF);
  return wrap(() => saveNafsTest(repo, actor, {
    id: input?.id ? String(input.id) : null, title: String(input?.title ?? ""), mode: String(input?.mode ?? "MANUAL"),
    questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : [], marks: input?.marks ?? null, timeLimitMin: input?.timeLimitMin ?? null, settings: input?.settings ?? null,
  }));
}

export async function aiDraftsAction(input: AiNafsInput): Promise<{ ok?: { ids: string[]; error?: string }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => generateNafsDrafts(repo, actor, {
    codes: Array.isArray(input?.codes) ? input.codes.map(String) : [], count: Number(input?.count), topic: input?.topic ? String(input.topic) : null,
    withPassage: Boolean(input?.withPassage), textType: input?.textType === "LIT" || input?.textType === "INFO" ? input.textType : null,
    standard: input?.standard ? String(input.standard) : null,
  }, { env: aiEnv() }));
}

export async function deleteTestAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const { t } = await getT();
  try { await deleteNafsTest(repo, actor, str(form.get("id"))); } catch (e) { if (known(e)) back("/teacher/nafs?tab=tests", t((e as Error).message)); throw e; }
  back("/teacher/nafs?tab=tests", t("Test removed."));
}

// ------------------------------------------------------------------ online, results

export async function assignOnlineAction(form: FormData): Promise<void> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  const testId = str(form.get("testId"));
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  const { t } = await getT();
  const who = str(form.get("who")) === "some" ? form.getAll("sid").map(String).filter(Boolean) : null;
  if (who && !who.length) back(ret, t("Choose at least one student."));
  try {
    const r = await assignNafsOnline(repo, actor, { testId, classId: str(form.get("classId")), openAt: dateOf(form.get("openAt")), dueAt: dateOf(form.get("dueAt"), true), timeLimitMin: str(form.get("minutes")) ? Number(form.get("minutes")) : null, studentIds: who });
    back(ret, t("Given online to {n} student(s). They find it in their NAFS icon.", { n: r.students }));
  } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
}

/** One assignment's time and open / due dates. */
export async function updateAssignmentAction(form: FormData): Promise<void> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  const testId = str(form.get("testId"));
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  const { t } = await getT();
  try { await updateNafsAssignment(repo, actor, { testId, classId: str(form.get("classId")), openAt: dateOf(form.get("openAt")), dueAt: dateOf(form.get("dueAt"), true), timeLimitMin: str(form.get("minutes")) ? Number(form.get("minutes")) : null }); }
  catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
  back(ret, t("Saved."));
}

/** The marking queue: the teacher's rubric score (0 / 1 / 2) for one short written answer. */
export async function markWrittenAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const ret = str(form.get("back")) || "/teacher/nafs?tab=marking";
  const { t } = await getT();
  try { await markWrittenAnswer(repo, actor, { resultId: str(form.get("resultId")), index: Number(form.get("index")), score: Number(form.get("score")) }); }
  catch (e) { if (known(e)) back(ret.startsWith("/teacher/nafs") ? ret : "/teacher/nafs?tab=marking", t((e as Error).message)); throw e; }
  revalidatePath("/teacher/nafs");
  redirect(ret.startsWith("/teacher/nafs") ? ret : "/teacher/nafs?tab=marking");
}

export async function releaseAction(form: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const testId = str(form.get("testId"));
  const release = str(form.get("release")) === "1";
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  const { t } = await getT();
  try { await releaseNafsResults(repo, actor, { testId, classId: str(form.get("classId")), release }); } catch (e) { if (known(e)) back(ret, t((e as Error).message)); throw e; }
  back(ret, t(release ? "Results released: students see their score and the skills to practise." : "Results hidden from the students."));
}

/**
 * Saves one student's answers from a bubble sheet (read in the browser) or the "type answers" grid:
 * { testId, studentId, answers[] } — answers only (0–3 or null), never an image. Graded at once.
 */
export async function saveAnswersAction(input: { testId: string; studentId: string; answers: (number | null)[]; source: "SHEET" | "TYPED" }): Promise<{ ok?: { correct: number; points: number; maxPoints: number }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const g = await saveNafsAnswers(repo, actor, { testId: String(input?.testId ?? ""), studentId: String(input?.studentId ?? ""), answers: input?.answers, source: input?.source === "TYPED" ? "TYPED" : "SHEET" });
    return { correct: g.correct, points: g.points, maxPoints: g.maxPoints };
  });
}
