/**
 * 🇸🇦 NAFS tests (Tests tab): save (simulation / automatic / manual), list, open, give a Grade 6 class online
 * (simulation mode), release the results to the students, and the grading of answers with the key and the marks —
 * the same for online answers, bubble sheets and typed answers (one NafsResult per student and test).
 * A test's questions cannot change once it has results (make a copy instead). Never deleted for good (deletedAt).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { accessibleClasses } from "../teacher/assign";
import { assertClassAccess } from "../teacher/assignments";
import { assertNafs, NAFS_GRADE } from "../teacher/nafs-access";
import { MAX_NAFS_MINUTES, MAX_NAFS_QUESTIONS } from "./framework";
import { loadNafsQuestions, nafsIndex } from "./bank";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const iso = (v: unknown) => d(v)?.toISOString() ?? null;
export const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
const round2 = (n: number) => Math.round(n * 100) / 100;

export type NafsMode = "FULL" | "SIMULATION" | "MINISTRY" | "AUTO" | "MANUAL";
export const MODES: NafsMode[] = ["FULL", "SIMULATION", "MINISTRY", "AUTO", "MANUAL"];
export const MODE_NAME: Record<NafsMode, string> = { FULL: "Complete NAFS test (all standards)", SIMULATION: "NAFS simulation", MINISTRY: "Ministry booklet model", AUTO: "Automatic", MANUAL: "Manual" };
export type Answer = 0 | 1 | 2 | 3 | null;

function schoolOf(actor: Actor): string { if (!actor.schoolId) throw new ForbiddenError("No school."); return actor.schoolId; }
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/** Marks per question: only the test's questions, 0–100 (two decimals); null when every question has 1 mark. */
export function cleanNafsMarks(marks: unknown, ids: string[]): Record<string, number> | null {
  if (!marks || typeof marks !== "object" || Array.isArray(marks)) return null;
  const raw = marks as Record<string, unknown>, out: Record<string, number> = {};
  for (const id of ids) {
    if (raw[id] === undefined || raw[id] === null || raw[id] === "") continue;
    const n = Number(raw[id]);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError("Marks must be 0 to 100 for each question.");
    out[id] = round2(n);
  }
  return Object.values(out).some((v) => v !== 1) ? out : null;
}
export const markOf = (marks: Record<string, number> | null | undefined, id: string) => (marks && typeof marks[id] === "number" ? marks[id] : 1);

// ------------------------------------------------------------------ grading (pure)

export interface Graded {
  correct: number; points: number; maxPoints: number; right: boolean[];
  /** per question: 1 / 0 (MCQ), the rubric score / 2 (a marked written answer), null (a written answer not marked yet) */
  credit: (number | null)[];
  /** written answers waiting for the teacher's marking */
  pending: number;
}
/** The rubric of a short written answer: 0, 1 or 2 (scored by the teacher only). */
export const WRITTEN_MAX = 2;
export type WrittenScores = Record<string, number>;
/**
 * Answers (0–3 = A–D, null = blank) against the key, with the marks of each question. A key of −1 is a short written
 * answer: it is NEVER scored here — only the teacher's rubric score (`scores[index]`, 0–2) counts (score / 2 × marks);
 * without one it is pending.
 */
export function gradeAnswers(key: number[], marks: number[], answers: Answer[], scores?: WrittenScores | null): Graded {
  const credit = key.map((k, i): number | null => {
    if (k < 0) { const sc = scores?.[String(i)]; return typeof sc === "number" && sc >= 0 && sc <= WRITTEN_MAX ? sc / WRITTEN_MAX : null; }
    return answers[i] !== null && answers[i] !== undefined && answers[i] === k ? 1 : 0;
  });
  const right = credit.map((c) => c === 1);
  return {
    right, credit, correct: right.filter(Boolean).length, pending: credit.filter((c, i) => c === null && key[i] < 0).length,
    points: round2(credit.reduce<number>((a, c, i) => a + (c ?? 0) * (marks[i] ?? 1), 0)),
    maxPoints: round2(key.reduce((a, _k, i) => a + (marks[i] ?? 1), 0)),
  };
}
/** Written scores as stored: only indexes of written questions, whole numbers 0–2. */
export function cleanScores(v: unknown, key: number[]): WrittenScores {
  const o = json<Record<string, unknown>>(v, {});
  const out: WrittenScores = {};
  for (const [k, x] of Object.entries(o ?? {})) { const i = Number(k), n = Number(x); if (Number.isInteger(i) && key[i] !== undefined && key[i] < 0 && Number.isInteger(n) && n >= 0 && n <= WRITTEN_MAX) out[String(i)] = n; }
  return out;
}
/** Typed written answers: only the written questions' indexes, at most 2,000 characters each. */
export function cleanTexts(v: unknown, key: number[]): Record<string, string> {
  const o = json<Record<string, unknown>>(v, {});
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(o ?? {})) { const i = Number(k); const t = String(x ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000); if (Number.isInteger(i) && key[i] !== undefined && key[i] < 0 && t) out[String(i)] = t; }
  return out;
}
/** Answers as stored: exactly n entries, each 0–3 or null (anything else is refused). */
export function cleanAnswers(v: unknown, n: number): Answer[] {
  if (!Array.isArray(v) || v.length !== n) throw new ValidationError(`Expected ${n} answers.`);
  return v.map((a) => {
    if (a === null || a === undefined || a === "") return null;
    const x = Number(a);
    if (!Number.isInteger(x) || x < 0 || x > 3) throw new ValidationError("Each answer must be A, B, C, D or blank.");
    return x as Answer;
  });
}

// ------------------------------------------------------------------ save / list / open

export interface SaveTestInput { id?: string | null; title: string; mode: NafsMode | string; questionIds: string[]; marks?: Record<string, number> | null; timeLimitMin?: number | null; settings?: unknown }

async function ownTest(repo: Repo, actor: Actor, id: string, edit = false): Promise<Row> {
  await assertNafs(repo, actor);
  const t = await repo.findUnique("NafsTest", { id });
  if (!t || t.deletedAt || s(t.schoolId) !== schoolOf(actor)) throw new ForbiddenError("Test not found.");
  if (edit && !isAdmin(actor) && s(t.createdById) !== actor.userId) throw new ForbiddenError("Only the teacher who made this test (or an admin) can change it.");
  return t;
}

export async function hasResults(repo: Repo, testId: string): Promise<boolean> {
  return (await repo.count("NafsResult", { testId, submittedAt: { not: null } })) > 0;
}

export async function saveNafsTest(repo: Repo, actor: Actor, input: SaveTestInput, now = new Date()): Promise<string> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  const title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 150);
  if (!title) throw new ValidationError("Give the test a name.");
  const mode = (MODES as string[]).includes(s(input.mode)) ? (s(input.mode) as NafsMode) : "MANUAL";
  const ids = [...new Set((Array.isArray(input.questionIds) ? input.questionIds : []).map(s).filter(Boolean))];
  if (!ids.length) throw new ValidationError("The test has no questions.");
  if (ids.length > MAX_NAFS_QUESTIONS) throw new ValidationError(`A NAFS test has at most ${MAX_NAFS_QUESTIONS} questions (a bubble sheet holds ${MAX_NAFS_QUESTIONS}).`);
  // only usable questions of THIS school's NAFS bank (drafts must be approved first)
  const idx = new Map((await nafsIndex(repo, schoolId)).map((e) => [e.id, e]));
  for (const id of ids) {
    const e = idx.get(id);
    if (!e) throw new ValidationError("A question is not in the NAFS bank.");
    if (e.draft) throw new ValidationError("A draft question is in the test: approve it in the Question bank first.");
  }
  const qs = await loadNafsQuestions(repo, ids);
  if (qs.some((q) => q.kind === "MCQ" && (q.options.length < 2 || q.options.length > 4))) throw new ValidationError("Every NAFS question needs options A–D.");
  const marks = cleanNafsMarks(input.marks, ids);
  // the time is required in every mode (the teacher sets it; each assignment can change it)
  const lim = input.timeLimitMin === null || input.timeLimitMin === undefined || s(input.timeLimitMin) === "" ? null : Math.round(Number(input.timeLimitMin));
  if (lim === null) throw new ValidationError("Set the time of the test (minutes).");
  if (!Number.isFinite(lim) || lim < 1 || lim > MAX_NAFS_MINUTES) throw new ValidationError(`The time must be 1 to ${MAX_NAFS_MINUTES} minutes.`);
  const settings = input.settings && typeof input.settings === "object" ? JSON.parse(JSON.stringify(input.settings).slice(0, 4000)) : null;
  if (input.id) {
    const t = await ownTest(repo, actor, s(input.id), true);
    const before = json<string[]>(t.questionIds, []);
    const same = before.length === ids.length && before.every((x, i) => x === ids[i]);
    if (!same && (await hasResults(repo, s(t.id)))) throw new ValidationError("This test already has results, so its questions cannot change. Make a copy instead.");
    await repo.updateMany("NafsTest", { id: t.id }, { title, mode, questionIds: ids, marks, timeLimitMin: lim, settings, updatedAt: now });
    await audit(repo, { actorId: actor.userId, action: "nafs.test.update", entityType: "NafsTest", entityId: s(t.id), after: { questions: ids.length, mode }, at: now });
    return s(t.id);
  }
  const t = await repo.create("NafsTest", { schoolId, createdById: actor.userId, title, mode, questionIds: ids, marks, timeLimitMin: lim, settings, createdAt: now, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "nafs.test.create", entityType: "NafsTest", entityId: s(t.id), after: { questions: ids.length, mode }, at: now });
  return s(t.id);
}

export async function deleteNafsTest(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const t = await ownTest(repo, actor, id, true);
  await repo.updateMany("NafsTest", { id: t.id }, { deletedAt: now });
  await audit(repo, { actorId: actor.userId, action: "nafs.test.delete", entityType: "NafsTest", entityId: id, at: now });
}

export interface NafsTestRow { id: string; title: string; mode: NafsMode; questions: number; minutes: number | null; createdAt: string; author: string; mine: boolean; classes: number; results: number }
/** The school's NAFS tests, newest first (at most 100); results counted for the actor's own classes. */
export async function listNafsTests(repo: Repo, actor: Actor): Promise<NafsTestRow[]> {
  await assertNafs(repo, actor);
  const tests = await repo.findMany("NafsTest", { schoolId: schoolOf(actor), deletedAt: null }, { select: ["id", "title", "mode", "questionIds", "timeLimitMin", "createdAt", "createdById"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 });
  if (!tests.length) return [];
  const mine = (await accessibleClasses(repo, actor)).map((c) => s(c.id));
  const ids = tests.map((t) => s(t.id));
  const [given, results, users] = await Promise.all([
    mine.length ? repo.findMany("NafsTestClass", { testId: { in: ids }, classId: { in: mine } }, { select: ["testId"] }) : Promise.resolve([] as Row[]),
    mine.length ? repo.findMany("NafsResult", { testId: { in: ids }, classId: { in: mine }, submittedAt: { not: null } }, { select: ["testId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("User", { id: { in: [...new Set(tests.map((t) => s(t.createdById)))] } }, { select: ["id", "displayName"] }),
  ]);
  return tests.map((t) => ({
    id: s(t.id), title: s(t.title), mode: (MODES as string[]).includes(s(t.mode)) ? (s(t.mode) as NafsMode) : "MANUAL", questions: json<string[]>(t.questionIds, []).length,
    minutes: t.timeLimitMin ? Number(t.timeLimitMin) : null, createdAt: iso(t.createdAt) ?? "", author: s(users.find((u) => u.id === t.createdById)?.displayName), mine: s(t.createdById) === actor.userId,
    classes: given.filter((g) => g.testId === t.id).length, results: results.filter((r) => r.testId === t.id).length,
  }));
}

export interface NafsTestFull { id: string; title: string; mode: NafsMode; questionIds: string[]; marks: Record<string, number> | null; timeLimitMin: number | null; settings: unknown; createdAt: string; canEdit: boolean; locked: boolean }
export async function getNafsTest(repo: Repo, actor: Actor, id: string): Promise<NafsTestFull> {
  const t = await ownTest(repo, actor, id);
  return {
    id: s(t.id), title: s(t.title), mode: (MODES as string[]).includes(s(t.mode)) ? (s(t.mode) as NafsMode) : "MANUAL", questionIds: json<string[]>(t.questionIds, []), marks: json<Record<string, number> | null>(t.marks, null),
    timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null, settings: json<unknown>(t.settings, null), createdAt: iso(t.createdAt) ?? "",
    canEdit: isAdmin(actor) || s(t.createdById) === actor.userId, locked: await hasResults(repo, s(t.id)),
  };
}

/** The key (A–D index; −1 = a short written answer) and marks of a test, in its order. */
export async function testKey(repo: Repo, t: { questionIds: string[]; marks: Record<string, number> | null }): Promise<{ key: number[]; marks: number[] }> {
  const qs = await loadNafsQuestions(repo, t.questionIds);
  return { key: t.questionIds.map((id) => qs.find((q) => q.id === id)?.correct ?? -1), marks: t.questionIds.map((id) => markOf(t.marks, id)) };
}

// ------------------------------------------------------------------ classes (Grade 6 only)

export interface NafsClass { id: string; name: string; students: { id: string; name: string }[] }
/** The actor's Grade 6 classes (teacher: own; admin: the school's) with their students, A–Z. */
export async function nafsClasses(repo: Repo, actor: Actor): Promise<NafsClass[]> {
  await assertNafs(repo, actor);
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return [];
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] }, level: NAFS_GRADE }, { select: ["id"] });
  const g6 = classes.filter((c) => grades.some((g) => g.id === c.gradeId)).slice(0, 60);
  if (!g6.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: g6.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] });
  const students = members.length ? await repo.findMany("Student", { id: { in: [...new Set(members.map((m) => s(m.studentId)))] } }, { select: ["id", "userId"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName) || "Student"]));
  return g6.map((c) => ({ id: s(c.id), name: s(c.name), students: members.filter((m) => m.classId === c.id).map((m) => ({ id: s(m.studentId), name: nameOf.get(s(m.studentId)) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function grade6Class(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  const klass = await assertClassAccess(repo, actor, classId);
  if (s(klass.schoolId) !== schoolOf(actor)) throw new ForbiddenError("Class not found.");
  const g = await repo.findUnique("Grade", { id: klass.gradeId });
  if (Number(g?.level) !== NAFS_GRADE) throw new ValidationError("NAFS tests are for Grade 6 classes.");
  return klass;
}

// ------------------------------------------------------------------ online: assign to a Grade 6 class or chosen students

const minutesOf = (v: unknown): number | null => {
  if (v === null || v === undefined || s(v) === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > MAX_NAFS_MINUTES) throw new ValidationError(`The time must be 1 to ${MAX_NAFS_MINUTES} minutes.`);
  return n;
};
/** The students an assignment is for (null = the whole class). */
export const assignedTo = (row: Row | null | undefined): string[] | null => { const v = json<unknown>(row?.studentIds, null); return Array.isArray(v) && v.length ? v.map(s) : null; };

export interface AssignInput { testId: string; classId: string; openAt?: Date | null; dueAt?: Date | null; timeLimitMin?: number | null; studentIds?: string[] | null }
/**
 * "Assign to students (online)": the test goes to a Grade 6 class, or to chosen students of it; they find it in their
 * NAFS icon (My tests; the home NAFS card counts it). The time (minutes) and the open / due dates are this assignment's own. MCQs are graded on
 * hand-in; written answers wait in the marking queue.
 */
export async function assignNafsOnline(repo: Repo, actor: Actor, input: AssignInput, now = new Date()): Promise<{ students: number }> {
  const t = await ownTest(repo, actor, s(input.testId));
  const klass = await grade6Class(repo, actor, s(input.classId));
  const openAt = d(input.openAt), dueAt = d(input.dueAt);
  if (openAt && dueAt && dueAt <= openAt) throw new ValidationError("The due date must be after the start date.");
  const timeLimitMin = minutesOf(input.timeLimitMin) ?? (t.timeLimitMin ? Number(t.timeLimitMin) : null);
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const chosen = Array.isArray(input.studentIds) && input.studentIds.length ? [...new Set(input.studentIds.map(s))] : null;
  if (chosen && chosen.some((x) => !members.includes(x))) throw new ValidationError("Choose students of this class.");
  const who = chosen ?? members;
  await repo.upsert("NafsTestClass", { testId: t.id, classId: klass.id }, { openAt, dueAt, timeLimitMin, studentIds: chosen, releasedAt: null, createdById: actor.userId, createdAt: now }, { openAt, dueAt, timeLimitMin, studentIds: chosen });
  const st = who.length ? await repo.findMany("Student", { id: { in: who } }, { select: ["userId"] }) : [];
  // (students find NAFS tests in their NAFS icon → My tests)
  if (st.length) await repo.createMany("Notification", st.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "New NAFS test", body: `${s(t.title)} (NAFS).${dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : ""}`, link: "/student/nafs?part=tests", createdAt: now })));
  await audit(repo, { actorId: actor.userId, action: "nafs.test.assign", entityType: "NafsTest", entityId: s(t.id), after: { classId: klass.id, students: who.length, chosen: Boolean(chosen), timeLimitMin }, at: now });
  return { students: who.length };
}

/** Change one assignment's time and open / due dates (who it is for stays). */
export async function updateNafsAssignment(repo: Repo, actor: Actor, input: { testId: string; classId: string; openAt?: Date | null; dueAt?: Date | null; timeLimitMin?: number | null }, now = new Date()): Promise<void> {
  await ownTest(repo, actor, s(input.testId));
  await grade6Class(repo, actor, s(input.classId));
  const row = await repo.findUnique("NafsTestClass", { testId: s(input.testId), classId: s(input.classId) });
  if (!row) throw new ValidationError("Give the test online to this class first.");
  const openAt = d(input.openAt), dueAt = d(input.dueAt);
  if (openAt && dueAt && dueAt <= openAt) throw new ValidationError("The due date must be after the start date.");
  const timeLimitMin = minutesOf(input.timeLimitMin);
  if (timeLimitMin === null) throw new ValidationError("Set the time of the test (minutes).");
  await repo.updateMany("NafsTestClass", { id: row.id }, { openAt, dueAt, timeLimitMin });
  await audit(repo, { actorId: actor.userId, action: "nafs.test.assign.update", entityType: "NafsTest", entityId: s(input.testId), after: { classId: s(input.classId), timeLimitMin, openAt: openAt?.toISOString() ?? null, dueAt: dueAt?.toISOString() ?? null }, at: now });
}

/** The teacher releases (or holds back) the results: students then see their score and the skills to practise. */
export async function releaseNafsResults(repo: Repo, actor: Actor, input: { testId: string; classId: string; release: boolean }, now = new Date()): Promise<void> {
  await ownTest(repo, actor, s(input.testId));
  await grade6Class(repo, actor, s(input.classId));
  const row = await repo.findUnique("NafsTestClass", { testId: s(input.testId), classId: s(input.classId) });
  // (a test only on paper is not listed to the students: release is for tests given online)
  if (!row) throw new ValidationError("Give the test online to this class first.");
  await repo.updateMany("NafsTestClass", { id: row.id }, { releasedAt: input.release ? now : null });
}

export interface GivenClass { classId: string; className: string; openAt: string | null; dueAt: string | null; releasedAt: string | null; minutes: number | null; chosen: string[] | null; done: number; students: number }
export async function givenClasses(repo: Repo, actor: Actor, testId: string): Promise<GivenClass[]> {
  const t = await ownTest(repo, actor, testId);
  const mine = await nafsClasses(repo, actor);
  if (!mine.length) return [];
  const [rows, results] = await Promise.all([
    repo.findMany("NafsTestClass", { testId, classId: { in: mine.map((c) => c.id) } }),
    repo.findMany("NafsResult", { testId, classId: { in: mine.map((c) => c.id) }, submittedAt: { not: null } }, { select: ["classId"] }),
  ]);
  return rows.map((r) => {
    const c = mine.find((x) => x.id === r.classId)!;
    const chosen = assignedTo(r);
    return { classId: c.id, className: c.name, openAt: iso(r.openAt), dueAt: iso(r.dueAt), releasedAt: iso(r.releasedAt), minutes: r.timeLimitMin ? Number(r.timeLimitMin) : t.timeLimitMin ? Number(t.timeLimitMin) : null, chosen: chosen ? chosen.map((id) => c.students.find((x) => x.id === id)?.name ?? "Student") : null, done: results.filter((x) => x.classId === c.id).length, students: chosen ? chosen.length : c.students.length };
  });
}

// ------------------------------------------------------------------ answers from bubble sheets / typed (never images)

/**
 * Saves one student's answers read from a bubble sheet (in the browser) or typed by the teacher: the actor must see
 * NAFS, the test must be the school's and the student must be in one of the actor's Grade 6 classes. Graded with the
 * key and the marks at once (written answers keep the teacher's rubric scores, or wait in the marking queue).
 * Receives answers only — never an image.
 */
export async function saveNafsAnswers(repo: Repo, actor: Actor, input: { testId: string; studentId: string; answers: unknown; source?: "SHEET" | "TYPED" }, now = new Date()): Promise<Graded> {
  const t = await getNafsTest(repo, actor, s(input.testId));
  const studentId = s(input.studentId);
  const classes = await nafsClasses(repo, actor);
  const klass = classes.find((c) => c.students.some((x) => x.id === studentId));
  if (!klass) throw new ForbiddenError("This student is not in one of your Grade 6 classes.");
  const { key, marks } = await testKey(repo, t);
  const answers = cleanAnswers(input.answers, t.questionIds.length).map((a, i) => (key[i] < 0 ? null : a));
  const before = await repo.findUnique("NafsResult", { testId: t.id, studentId });
  const scores = cleanScores(before?.writtenScores, key);
  const g = gradeAnswers(key, marks, answers, scores);
  const source = input.source === "TYPED" ? "TYPED" : "SHEET";
  const data = { classId: klass.id, source, answers, correct: g.correct, points: g.points, maxPoints: g.maxPoints, submittedAt: now, gradedById: actor.userId, updatedAt: now };
  await repo.upsert("NafsResult", { testId: t.id, studentId }, { ...data, writtenScores: scores, startedAt: null }, data);
  await audit(repo, { actorId: actor.userId, action: "nafs.answers.save", entityType: "NafsTest", entityId: t.id, after: { studentId, source, correct: g.correct }, at: now });
  return g;
}

/** For the grading screens: the class's students and the answers already saved. */
export async function answerGrid(repo: Repo, actor: Actor, testId: string, classId: string): Promise<{ students: { id: string; name: string; answers: Answer[] | null; source: string | null }[] }> {
  const t = await getNafsTest(repo, actor, testId);
  const klass = (await nafsClasses(repo, actor)).find((c) => c.id === classId);
  if (!klass) throw new ForbiddenError("Class not found.");
  const results = await repo.findMany("NafsResult", { testId: t.id, classId: klass.id }, { select: ["studentId", "answers", "source", "submittedAt"] });
  return { students: klass.students.map((x) => { const r = results.find((y) => y.studentId === x.id && y.submittedAt); return { ...x, answers: r ? json<Answer[]>(r.answers, []) : null, source: r ? s(r.source) : null }; }) };
}

// ------------------------------------------------------------------ the marking queue (short written answers)

export interface MarkItem { resultId: string; testId: string; testTitle: string; index: number; n: number; studentId: string; studentName: string; className: string; source: string; stem: string; rubric: string[]; model: string; text: string | null; score: number | null }
/**
 * Short written answers handed in (online, on paper or typed) in the actor's Grade 6 classes: the teacher scores each
 * with the item's rubric (0 / 1 / 2). Waiting ones first; `all` adds the marked ones (to change a score). Bounded.
 */
export async function markingQueue(repo: Repo, actor: Actor, opts: { testId?: string | null; all?: boolean } = {}): Promise<{ items: MarkItem[]; waiting: number }> {
  await assertNafs(repo, actor);
  const classes = await nafsClasses(repo, actor);
  if (!classes.length) return { items: [], waiting: 0 };
  const where: Record<string, unknown> = { classId: { in: classes.map((c) => c.id) }, submittedAt: { not: null } };
  if (opts.testId) where.testId = s(opts.testId);
  const results = await repo.findMany("NafsResult", where, { select: ["id", "testId", "classId", "studentId", "source", "texts", "writtenScores", "submittedAt"], orderBy: [{ field: "submittedAt", dir: "asc" }], take: 3000 });
  if (!results.length) return { items: [], waiting: 0 };
  const tests = await repo.findMany("NafsTest", { id: { in: [...new Set(results.map((r) => s(r.testId)))] }, schoolId: schoolOf(actor), deletedAt: null }, { select: ["id", "title", "questionIds"] });
  const qs = await loadNafsQuestions(repo, [...new Set(tests.flatMap((t) => json<string[]>(t.questionIds, [])))]);
  const written = new Map(qs.filter((q) => q.kind === "WRITTEN").map((q) => [q.id, q]));
  if (!written.size) return { items: [], waiting: 0 };
  const nameOf = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, x.name] as const)));
  const classOf = new Map(classes.map((c) => [c.id, c.name]));
  const out: MarkItem[] = [];
  for (const r of results) {
    const t = tests.find((x) => x.id === r.testId);
    if (!t) continue;
    const ids = json<string[]>(t.questionIds, []);
    const texts = json<Record<string, string>>(r.texts, {}) ?? {};
    const scores = json<Record<string, number>>(r.writtenScores, {}) ?? {};
    ids.forEach((id, i) => {
      const q = written.get(id);
      if (!q) return;
      const sc = typeof scores[String(i)] === "number" ? Number(scores[String(i)]) : null;
      out.push({ resultId: s(r.id), testId: s(t.id), testTitle: s(t.title), index: i, n: i + 1, studentId: s(r.studentId), studentName: nameOf.get(s(r.studentId)) ?? "Student", className: classOf.get(s(r.classId)) ?? "", source: s(r.source), stem: q.stem, rubric: q.rubric, model: q.model, text: texts[String(i)] ?? null, score: sc });
    });
  }
  const waiting = out.filter((x) => x.score === null).length;
  return { items: (opts.all ? out : out.filter((x) => x.score === null)).slice(0, 300), waiting };
}

/** The teacher's rubric score (0, 1 or 2) for one written answer; the result is graded again. */
export async function markWrittenAnswer(repo: Repo, actor: Actor, input: { resultId: string; index: number; score: number }, now = new Date()): Promise<Graded> {
  await assertNafs(repo, actor);
  const r = await repo.findUnique("NafsResult", { id: s(input.resultId) });
  if (!r || !r.submittedAt) throw new ForbiddenError("Result not found.");
  if (!(await nafsClasses(repo, actor)).some((c) => c.id === s(r.classId))) throw new ForbiddenError("Result not found.");
  const t = await getNafsTest(repo, actor, s(r.testId));
  const { key, marks } = await testKey(repo, t);
  const i = Math.floor(Number(input.index)), score = Number(input.score);
  if (!(key[i] !== undefined && key[i] < 0)) throw new ValidationError("This is not a written question.");
  if (!Number.isInteger(score) || score < 0 || score > WRITTEN_MAX) throw new ValidationError("Score the answer 0, 1 or 2.");
  const scores = { ...cleanScores(r.writtenScores, key), [String(i)]: score };
  const g = gradeAnswers(key, marks, json<Answer[]>(r.answers, []), scores);
  await repo.updateMany("NafsResult", { id: r.id }, { writtenScores: scores, correct: g.correct, points: g.points, maxPoints: g.maxPoints, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "nafs.written.mark", entityType: "NafsResult", entityId: s(r.id), after: { index: i, score }, at: now });
  return g;
}
