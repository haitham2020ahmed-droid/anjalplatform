/**
 * 🗓️ The Diagnostic window: WHEN the students of a grade may take the school year's Diagnostic Test.
 *
 * - Only the school admin opens and closes it (/admin/diagnostic) — never a student, never a teacher.
 * - One row per school, grade and school year (Aug 1 → Jul 31, `schoolYear()`): MANUAL (open while `isOpen`) or
 *   AUTO (open from `opensAt` to `closesAt`, by itself). No row = closed. A MANUAL row of another year is closed.
 * - Once per school year: a student with a result of this year's test (same period) cannot open it again. Next year's
 *   test is a new test with its own window (closed until the admin opens it); each year's results stay separate.
 * - Closing mid-way keeps the student's answers; they continue when it opens again.
 *
 * Every check is server-side: the student's home, the placement page and the quiz itself (`assertDiagnosticAccess`,
 * called on every start and every answer of a Diagnostic assignment).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { asPeriod, openDiagnostic, PERIODS, schoolYear } from "./test";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);

export type WindowMode = "MANUAL" | "AUTO";
export type WindowStatus = "OPEN" | "CLOSED" | "SCHEDULED";
export type WindowLike = { [k: string]: unknown };

/** Effective open = MANUAL ? isOpen (this school year only) : now between opensAt and closesAt. */
export function windowIsOpen(w: WindowLike | null | undefined, now = new Date()): boolean {
  if (!w) return false;
  if (s(w.mode) === "AUTO") {
    const from = d(w.opensAt), to = d(w.closesAt);
    if (!from && !to) return false;
    return (!from || now.getTime() >= from.getTime()) && (!to || now.getTime() <= to.getTime());
  }
  return Boolean(w.isOpen) && (!w.schoolYear || s(w.schoolYear) === schoolYear(now));
}

/** The chip: Open · Scheduled (AUTO, opens later) · Closed. */
export function windowStatus(w: WindowLike | null | undefined, now = new Date()): WindowStatus {
  if (windowIsOpen(w, now)) return "OPEN";
  const from = d(w?.opensAt);
  if (w && s(w.mode) === "AUTO" && from && from.getTime() > now.getTime()) return "SCHEDULED";
  return "CLOSED";
}

export async function getWindow(repo: Repo, schoolId: string, grade: number, year: string): Promise<Row | null> {
  return (await repo.findMany("DiagnosticWindow", { schoolId, grade, schoolYear: year }))[0] ?? null;
}

function assertWindowAdmin(actor: Actor) {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the school admin opens and closes the Diagnostic Test.");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
}

/** Writes the window (one row per school, grade, year). Internal: callers check the admin first. */
export async function writeWindow(repo: Repo, schoolId: string, grade: number, year: string, data: { mode: WindowMode; isOpen: boolean; opensAt: Date | null; closesAt: Date | null }, userId: string | null, now = new Date()): Promise<Row> {
  const row = { ...data, updatedAt: now, updatedById: userId };
  return repo.upsert("DiagnosticWindow", { schoolId, grade, schoolYear: year }, { schoolId, grade, schoolYear: year, ...row }, row);
}

/** The test the window of this grade and year controls: the latest period's test (an OPEN one first). */
export async function windowTest(repo: Repo, schoolId: string, grade: number, year: string): Promise<Row | null> {
  const tests = await repo.findMany("DiagnosticTest", { schoolId, grade, year });
  const rank = (t: Row) => (s(t.status) === "OPEN" ? 10 : 0) + PERIODS.indexOf(asPeriod(t.period));
  return tests.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

const studentsOfGrade = async (repo: Repo, schoolId: string, grade: number): Promise<string[]> => {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) return [];
  const classes = await repo.findMany("Class", { schoolId, gradeId: g.id, deletedAt: null }, { select: ["id"] });
  if (!classes.length) return [];
  const m = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId"] });
  return [...new Set(m.map((x) => s(x.studentId)))];
};

export interface WindowRow { grade: number; year: string; status: WindowStatus; mode: WindowMode; opensAt: string | null; closesAt: string | null; testId: string | null; testTitle: string | null; draft: boolean; students: number; finished: number }

/** /admin/diagnostic: one row per grade that has a Diagnostic form, for this school year. */
export async function diagnosticWindows(repo: Repo, actor: Actor, now = new Date()): Promise<WindowRow[]> {
  assertWindowAdmin(actor);
  const schoolId = s(actor.schoolId);
  const year = schoolYear(now);
  const grades = [...new Set((await repo.findMany("DiagnosticTest", { schoolId }, { select: ["grade"] })).map((t) => Number(t.grade)))].sort((a, b) => a - b);
  const out: WindowRow[] = [];
  for (const grade of grades) {
    const [w, t, ids] = await Promise.all([getWindow(repo, schoolId, grade, year), windowTest(repo, schoolId, grade, year), studentsOfGrade(repo, schoolId, grade)]);
    const done = t && ids.length ? new Set((await repo.findMany("DiagnosticScore", { diagnosticId: t.id }, { select: ["studentId"] })).map((x) => s(x.studentId))) : new Set<string>();
    out.push({
      grade, year, status: t ? windowStatus(w, now) : "CLOSED", mode: s(w?.mode) === "AUTO" ? "AUTO" : "MANUAL",
      opensAt: d(w?.opensAt)?.toISOString() ?? null, closesAt: d(w?.closesAt)?.toISOString() ?? null,
      testId: t ? s(t.id) : null, testTitle: t ? s(t.title) : null, draft: s(t?.status) === "DRAFT",
      students: ids.length, finished: ids.filter((id) => done.has(id)).length,
    });
  }
  return out;
}

/**
 * The admin opens / closes / schedules the grade's Diagnostic for this school year. Opening publishes the year's test
 * to the grade's classes when it is still a draft (or opens a closed one again). Only the school admin.
 */
export async function setDiagnosticWindow(repo: Repo, actor: Actor, input: { grade: number; mode: WindowMode | string; isOpen?: boolean; opensAt?: Date | null; closesAt?: Date | null }, now = new Date()): Promise<{ status: WindowStatus }> {
  assertWindowAdmin(actor);
  const schoolId = s(actor.schoolId);
  const grade = Number(input.grade);
  if (!Number.isInteger(grade)) throw new ValidationError("Choose a grade.");
  const year = schoolYear(now);
  const mode: WindowMode = input.mode === "AUTO" ? "AUTO" : "MANUAL";
  const opensAt = mode === "AUTO" ? input.opensAt ?? null : null, closesAt = mode === "AUTO" ? input.closesAt ?? null : null;
  if (mode === "AUTO") {
    if (!opensAt || !closesAt) throw new ValidationError("Choose an open date and a close date.");
    if (closesAt.getTime() <= opensAt.getTime()) throw new ValidationError("The close date must be after the open date.");
  }
  const isOpen = mode === "MANUAL" && Boolean(input.isOpen);
  const t = await windowTest(repo, schoolId, grade, year);
  if (!t && (isOpen || mode === "AUTO")) throw new ValidationError(`Grade ${grade} has no Diagnostic Test for ${year} yet. Build it first.`);
  const before = await getWindow(repo, schoolId, grade, year);
  // opening (now or by dates): the test reaches every class of the grade
  if (t && (isOpen || mode === "AUTO")) {
    if (s(t.status) === "DRAFT") await openDiagnostic(repo, actor, s(t.id), {}, now);
    else if (s(t.status) === "CLOSED") await repo.updateMany("DiagnosticTest", { id: t.id }, { status: "OPEN" });
  }
  const w = await writeWindow(repo, schoolId, grade, year, { mode, isOpen, opensAt, closesAt }, actor.userId ?? null, now);
  await audit(repo, { actorId: actor.userId ?? null, action: "diagnostic.window", entityType: "DiagnosticWindow", entityId: s(w.id), before: before ? { mode: before.mode, isOpen: before.isOpen, opensAt: before.opensAt, closesAt: before.closesAt } : null, after: { grade, year, mode, isOpen, opensAt, closesAt }, at: now });
  return { status: windowStatus(w, now) };
}

export type DiagnosticAccess = "OPEN" | "CLOSED" | "PAUSED" | "DONE";

/** Did the student finish this year's Diagnostic (any grade's test of the same school year and period)? */
export async function finishedThisYear(repo: Repo, studentId: string, t: Row): Promise<boolean> {
  const same = (await repo.findMany("DiagnosticTest", { schoolId: t.schoolId, year: t.year }, { select: ["id", "period"] })).filter((x) => asPeriod(x.period) === asPeriod(t.period));
  if (!same.length) return false;
  return (await repo.count("DiagnosticScore", { studentId, diagnosticId: { in: same.map((x) => x.id) } })) > 0;
}

/** May this student work on this Diagnostic now? DONE (finished this year) · OPEN · PAUSED (started, now closed) · CLOSED. */
export async function diagnosticAccess(repo: Repo, studentId: string, t: Row, now = new Date(), started?: boolean): Promise<DiagnosticAccess> {
  if (await finishedThisYear(repo, studentId, t)) return "DONE";
  const open = s(t.status) === "OPEN" && s(t.year) === schoolYear(now) && windowIsOpen(await getWindow(repo, s(t.schoolId), Number(t.grade), s(t.year)), now);
  if (open) return "OPEN";
  const was = started ?? (await repo.count("PracticeSession", { studentId, assessmentId: t.assessmentId, mode: "TEACHER_QUIZ" })) > 0;
  return was ? "PAUSED" : "CLOSED";
}

export const DIAGNOSTIC_MESSAGES: Record<Exclude<DiagnosticAccess, "OPEN">, string> = {
  DONE: "You finished this year's diagnostic test 🎉",
  PAUSED: "Your teacher will reopen it soon. Your answers are saved.",
  CLOSED: "The Diagnostic Test is not open right now.",
};

/**
 * The quiz's server check (start and every answer, so a direct URL or action cannot get around it): a Diagnostic
 * assignment works only while the admin has it open for the grade and the student has not finished it this year.
 */
export async function assertDiagnosticAccess(repo: Repo, actor: Actor, assessmentId: string, now = new Date()): Promise<void> {
  if (!assessmentId) return;
  const t = (await repo.findMany("DiagnosticTest", { assessmentId }))[0];
  if (!t) return;
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take the Diagnostic Test.");
  const access = await diagnosticAccess(repo, actor.studentId, t, now);
  if (access !== "OPEN") throw new ValidationError(DIAGNOSTIC_MESSAGES[access]);
}

/** The student's Diagnostic state for the placement page (no level, no score: students never see Below/On/Above). */
export async function myDiagnosticState(repo: Repo, actor: Actor, now = new Date()): Promise<{ state: DiagnosticAccess | "NONE"; href: string | null }> {
  if (actor.role !== "STUDENT" || !actor.studentId) return { state: "NONE", href: null };
  const { myDiagnostic } = await import("./test");
  const mine = await myDiagnostic(repo, actor, now);
  if (mine) return mine.status === "DONE" ? { state: "DONE", href: null } : { state: "OPEN", href: mine.href };
  // not open: finished this year, paused mid-way, or closed
  const m = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const g = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  if (!klass || !g) return { state: "NONE", href: null };
  const year = schoolYear(now);
  const t = await windowTest(repo, s(klass.schoolId), Number(g.level), year);
  if (!t) {
    const any = (await repo.findMany("DiagnosticTest", { schoolId: klass.schoolId, year }, { select: ["id"] }));
    const done = any.length ? await repo.count("DiagnosticScore", { studentId: actor.studentId, diagnosticId: { in: any.map((x) => x.id) } }) : 0;
    return { state: done ? "DONE" : "NONE", href: null };
  }
  const access = await diagnosticAccess(repo, actor.studentId, t, now);
  return { state: access === "OPEN" ? "CLOSED" : access, href: null };
}

/** My Work: the student's assignments without the Diagnostic ones that are not open for them now (closed, paused or done). */
export async function visibleDiagnostics(repo: Repo, studentId: string, assignments: Row[], now = new Date()): Promise<Row[]> {
  const ids = [...new Set(assignments.filter((a) => a.assessmentId).map((a) => s(a.assessmentId)))];
  if (!ids.length) return assignments;
  const tests = await repo.findMany("DiagnosticTest", { assessmentId: { in: ids } });
  if (!tests.length) return assignments;
  const hide = new Set<string>();
  for (const t of tests) if ((await diagnosticAccess(repo, studentId, t, now)) !== "OPEN") hide.add(s(t.assessmentId));
  return hide.size ? assignments.filter((a) => !hide.has(s(a.assessmentId))) : assignments;
}
