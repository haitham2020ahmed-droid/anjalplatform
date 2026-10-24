/**
 * 👪 "For my family" — this week (Update 57): one simple page per student for the family, in English or Arabic.
 *
 *   what the student worked on this school week (Sunday → today): tasks finished, minutes, ReadRise articles,
 *   lessons, tests with their score (teacher tests once finished — the student sees that score too; NAFS tests only
 *   after the teacher released the results), 2–3 things to practise at home in simple words with ONE simple home
 *   activity each, and the teacher's note (FamilyWeekNote, optional, one per student per week).
 *
 * Simple words only: never a level, tier or RTI word (titles go through hideLevels); practise-at-home items are
 * plain-language topics (src/server/reports/family-week-words.ts), not skill codes. Everything shown is an interface
 * string (translated by t()) or the student's own data, so the page and the PDF read the same in both languages.
 *
 * Who: the student (their own week, /student/reports?view=family), their linked parent (their own child only,
 * the per-student PDF at /api/family-week?studentId=…), and the class's teacher and the school admin
 * (assertClassAccess) — the teacher previews each student in the student's format and downloads one PDF or a
 * class PDF (a page per student) to send by WhatsApp.
 * Bounded: one class (≤ 60 students) per call, this week's rows only, batched `in` reads.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { isHiddenSkill } from "../skills/master";
import { cancelIndexForStudents, liveAssignmentWhere } from "../student/cancelled-work";
import { weekStart } from "../student/weekly";
import { hideLevels } from "../../lib/hide-levels";
import { homeTopicFor, type HomeTopic } from "./family-week-words";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
export const FAMILY_WEEK_MAX = 60;
export const NOTE_MAX = 600;

export interface FamilyWeekTest { title: string; pct: number; kind: "TEST" | "NAFS" }
export interface FamilyWeek {
  studentId: string; name: string; className: string; grade: number;
  /** the school week: Sunday → today ("YYYY-MM-DD") */
  week: string; from: string; to: string;
  tasks: string[]; minutes: number; days: number;
  articles: string[]; lessons: string[]; tests: FamilyWeekTest[];
  /** 2–3 things to practise at home (plain-language topics with one home activity each) */
  practise: HomeTopic[];
  note: string | null;
}
export interface FamilyWeekBatch { classId: string; className: string; grade: number; week: string; items: FamilyWeek[] }

const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
// 🐛 fix: weekStart() (student/weekly.ts, r85 audit) returns Sunday 00:00 Riyadh time as a UTC instant — e.g.
// 2026-10-10T21:00:00Z for the Riyadh calendar date 2026-10-11. A raw toISOString().slice(0,10) on that instant
// prints the UTC calendar date (one day early), so the Riyadh offset is added back before formatting for display.
const RIYADH = 3 * 3_600_000;
const iso = (d: Date) => new Date(d.getTime() + RIYADH).toISOString().slice(0, 10);

/** The current class of a student that this person may open (the student: their own; a parent: their own child). */
async function classOfStudent(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const ms = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  // 🐛 L11 fix: a PARENT calling familyWeek() for their own child always fell through to "Student not found" below —
  // this branch only recognized STUDENT (self); the other branch (assertClassAccess) only ever allows staff
  // (SUPER_ADMIN/SCHOOL_ADMIN/TEACHER) and explicitly rejects PARENT. The route (/api/family-week) and PDF export
  // already anticipated a parent caller (see family-week-pdf.ts's `actor.role !== "PARENT"` check) — only this
  // authorization check was missing.
  if (actor.role === "STUDENT" || actor.role === "PARENT") {
    const allowed = actor.role === "STUDENT" ? actor.studentId === studentId : (actor.parentChildIds?.has(studentId) ?? false);
    if (!allowed) throw new ForbiddenError("Student not found.");
    const k = ms.length ? await repo.findUnique("Class", { id: ms[0].classId }) : null;
    return k ?? { id: "", name: "", gradeId: st.gradeId, schoolId: st.schoolId };
  }
  for (const m of ms) { try { return await assertClassAccess(repo, actor, s(m.classId)); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  throw new ForbiddenError("Student not found.");
}

/** One student's week (the student themself, their teacher or the admin). */
export async function familyWeek(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<FamilyWeek> {
  const klass = await classOfStudent(repo, actor, s(studentId));
  const grade = Number((klass.gradeId ? await repo.findUnique("Grade", { id: klass.gradeId }) : null)?.level ?? 0);
  return (await buildWeeks(repo, [s(studentId)], { className: s(klass.name), classId: s(klass.id), grade }, now))[0];
}

/** Every student of one class, a page each (the class's teacher or the admin). */
export async function familyWeeks(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<FamilyWeekBatch> {
  if (actor.role !== "TEACHER" && !isAdmin(actor)) throw new ForbiddenError("Only the class teacher or the admin can open this.");
  const klass = await assertClassAccess(repo, actor, s(classId));
  const ids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)).slice(0, FAMILY_WEEK_MAX);
  const grade = Number((klass.gradeId ? await repo.findUnique("Grade", { id: klass.gradeId }) : null)?.level ?? 0);
  const items = ids.length ? await buildWeeks(repo, ids, { className: s(klass.name), classId: s(klass.id), grade }, now) : [];
  return { classId: s(klass.id), className: s(klass.name), grade, week: iso(weekStart(now)), items: items.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** The teacher's note for this week (empty text removes it). The class's teacher or the admin. */
export async function saveFamilyWeekNote(repo: Repo, actor: Actor, input: { studentId: string; note: string }, now = new Date()): Promise<void> {
  if (actor.role !== "TEACHER" && !isAdmin(actor)) throw new ForbiddenError("Only the class teacher or the admin can write the note.");
  const studentId = s(input?.studentId);
  await classOfStudent(repo, actor, studentId);
  const note = s(input?.note).replace(/\r\n/g, "\n").trim();
  if (note.length > NOTE_MAX) throw new ValidationError(`The note can have at most ${NOTE_MAX} characters.`);
  const week = iso(weekStart(now));
  if (!note) { await repo.deleteMany("FamilyWeekNote", { studentId, week }); return; }
  await repo.upsert("FamilyWeekNote", { studentId, week }, { note, authorId: actor.userId, createdAt: now, updatedAt: now }, { note, authorId: actor.userId, updatedAt: now });
}

async function buildWeeks(repo: Repo, ids: string[], klass: { className: string; classId: string; grade: number }, now: Date): Promise<FamilyWeek[]> {
  const since = weekStart(now);
  const inWeek = (v: unknown) => { const t = time(v); return t >= since.getTime() && t <= now.getTime(); };
  const [students, done, sessions, runs, lessonRuns, attempts, mastery, nafs, notes] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("AssignmentStudent", { studentId: { in: ids }, status: "COMPLETED", completedAt: { gte: since } }, { select: ["studentId", "assignmentId", "completedAt"] }),
    repo.findMany("PracticeSession", { studentId: { in: ids }, startedAt: { gte: since } }, { select: ["studentId", "activeMs", "startedAt", "assignmentId", "mode", "correctCount"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: { gte: since } }, { select: ["studentId", "articleId", "readSeconds", "completedAt"] }),
    repo.findMany("LessonRun", { studentId: { in: ids }, finishedAt: { gte: since } }, { select: ["studentId", "skillId", "finishedAt"] }),
    // "unreliable" (r85 audit) is selected and filtered below for the same reason every other reader of
    // QuestionAttempt excludes it: a session with too many guesses backfills unreliable:true onto its rows even
    // when one particular answer wasn't itself flagged rapidGuess — without it, that noise could pick the wrong
    // "practise at home" topic for the family.
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "skillId", "isCorrect", "rapidGuess", "unreliable", "createdAt"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, isMastered: false }, { select: ["studentId", "skillId", "score"], orderBy: [{ field: "score", dir: "asc" }], take: ids.length * 8 }),
    repo.findMany("NafsResult", { studentId: { in: ids }, submittedAt: { gte: since } }, { select: ["studentId", "testId", "classId", "points", "maxPoints", "submittedAt"] }).catch(() => [] as Row[]),
    repo.findMany("FamilyWeekNote", { studentId: { in: ids }, week: iso(since) }, { select: ["studentId", "note"] }).catch(() => [] as Row[]), // a database without the table yet: no notes
  ]);
  const doneAll = done.filter((r) => inWeek(r.completedAt));
  const aIds = [...new Set(doneAll.map((r) => s(r.assignmentId)))];
  // r78: a task cancelled on Assigned is not one of the family's "tasks" (the answers stay; the task is not listed)
  const [assignments, ix] = await Promise.all([
    aIds.length ? repo.findMany("Assignment", liveAssignmentWhere({ id: { in: aIds } }), { select: ["id", "title", "testId", "assessmentId", "curriculumPlanId"] }) : Promise.resolve([] as Row[]),
    cancelIndexForStudents(repo, ids),
  ]);
  const liveById = new Map(assignments.map((a) => [s(a.id), a]));
  const doneNow = doneAll.filter((r) => liveById.has(s(r.assignmentId)) && ix.live(liveById.get(s(r.assignmentId))!, s(r.studentId)));
  const tests = assignments.filter((a) => a.testId);
  const skillIds = [...new Set([...lessonRuns.map((r) => s(r.skillId)), ...attempts.map((a) => s(a.skillId)), ...mastery.map((m) => s(m.skillId))].filter(Boolean))];
  const articleIds = [...new Set(runs.map((r) => s(r.articleId)))];
  const nafsLive = nafs.filter((r) => inWeek(r.submittedAt));
  const [users, skills, articles, testRows, aqs, released, nafsTests] = await Promise.all([
    students.length ? repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : Promise.resolve([] as Row[]),
    skillIds.length ? repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "code"] }) : Promise.resolve([] as Row[]),
    articleIds.length ? repo.findMany("RRArticle", { id: { in: articleIds } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
    tests.length ? repo.findMany("TeacherTest", { id: { in: [...new Set(tests.map((a) => s(a.testId)))] } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
    tests.length ? repo.findMany("AssessmentQuestion", { assessmentId: { in: [...new Set(tests.map((a) => s(a.assessmentId)).filter(Boolean))] } }, { select: ["assessmentId"] }) : Promise.resolve([] as Row[]),
    nafsLive.length ? repo.findMany("NafsTestClass", { testId: { in: [...new Set(nafsLive.map((r) => s(r.testId)))] } }, { select: ["testId", "classId", "releasedAt"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    nafsLive.length ? repo.findMany("NafsTest", { id: { in: [...new Set(nafsLive.map((r) => s(r.testId)))] } }, { select: ["id", "title"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
  ]);
  const userName = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const nameOf = new Map(students.map((x) => [s(x.id), userName.get(s(x.userId)) || "Student"]));
  const visible = skills.filter((k) => !isHiddenSkill(k.code));
  const skillName = new Map(visible.map((k) => [s(k.id), s(k.name)]));
  const articleTitle = new Map(articles.map((a) => [s(a.id), s(a.title)]));
  const testTitle = new Map(testRows.map((t) => [s(t.id), s(t.title)]));
  const size = new Map<string, number>();
  for (const q of aqs) size.set(s(q.assessmentId), (size.get(s(q.assessmentId)) ?? 0) + 1);
  const isReleased = new Set(released.filter((r) => r.releasedAt).map((r) => `${s(r.testId)}|${s(r.classId)}`));
  const nafsTitle = new Map(nafsTests.map((t) => [s(t.id), s(t.title)]));
  const aById = new Map(assignments.map((a) => [s(a.id), a]));
  const noteOf = new Map(notes.map((n) => [s(n.studentId), s(n.note)]));
  const uniq = (xs: string[], n: number) => [...new Set(xs.map((x) => hideLevels(x)).filter(Boolean))].slice(0, n);

  return ids.map((id) => {
    const mineDone = doneNow.filter((r) => s(r.studentId) === id);
    const mineSessions = sessions.filter((x) => s(x.studentId) === id && inWeek(x.startedAt));
    const mineRuns = runs.filter((r) => s(r.studentId) === id && inWeek(r.completedAt));
    const mineAttempts = attempts.filter((a) => s(a.studentId) === id && inWeek(a.createdAt));
    const tasks = uniq(mineDone.map((r) => aById.get(s(r.assignmentId))).filter((a): a is Row => Boolean(a && !a.testId)).map((a) => s(a.title)), 8);
    const testsDone: FamilyWeekTest[] = mineDone.map((r) => aById.get(s(r.assignmentId))).filter((a): a is Row => Boolean(a?.testId)).map((a) => {
      const n = size.get(s(a.assessmentId)) ?? 0;
      const correct = Number(mineSessions.find((x) => s(x.assignmentId) === s(a.id) && x.mode === "TEACHER_QUIZ")?.correctCount ?? sessions.find((x) => s(x.studentId) === id && s(x.assignmentId) === s(a.id))?.correctCount ?? 0);
      return { title: hideLevels(testTitle.get(s(a.testId)) || s(a.title)), pct: n ? Math.round((100 * correct) / n) : 0, kind: "TEST" as const };
    }).filter((x) => x.title);
    for (const r of nafsLive.filter((x) => s(x.studentId) === id && isReleased.has(`${s(x.testId)}|${s(x.classId)}`))) {
      const max = Number(r.maxPoints) || 0;
      testsDone.push({ title: hideLevels(nafsTitle.get(s(r.testId)) || "NAFS"), pct: max ? Math.round((100 * Number(r.points)) / max) : 0, kind: "NAFS" });
    }
    const minutes = Math.round((mineSessions.reduce((t, x) => t + Math.min(Number(x.activeMs ?? 0), 3 * 3_600_000), 0) + mineRuns.reduce((t, r) => t + Math.min(Number(r.readSeconds ?? 0), 3600) * 1000, 0)) / 60_000);
    const days = new Set([...mineSessions.filter((x) => Number(x.activeMs) > 0).map((x) => iso(new Date(time(x.startedAt)))), ...mineAttempts.map((a) => iso(new Date(time(a.createdAt)))), ...mineRuns.map((r) => iso(new Date(time(r.completedAt))))]).size;
    // things to practise: this week's hardest skills (3+ careful answers, under 70 %), then the skills not mastered yet
    const per = new Map<string, { n: number; ok: number }>();
    for (const a of mineAttempts) { if (a.rapidGuess || a.unreliable || !skillName.has(s(a.skillId))) continue; const o = per.get(s(a.skillId)) ?? { n: 0, ok: 0 }; o.n++; if (a.isCorrect) o.ok++; per.set(s(a.skillId), o); }
    const hard = [...per].filter(([, o]) => o.n >= 3 && o.ok / o.n < 0.7).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([k]) => k);
    const open = mastery.filter((m) => s(m.studentId) === id && skillName.has(s(m.skillId))).map((m) => s(m.skillId));
    const practise: HomeTopic[] = [];
    for (const skillId of [...hard, ...open]) {
      const t = homeTopicFor(skillName.get(skillId)!);
      // r79: the skill behind the topic — the printed page links it to the student's practice
      if (!practise.some((p) => p.key === t.key)) practise.push({ ...t, skillId });
      if (practise.length >= 3) break;
    }
    if (practise.length < 2) for (const key of ["reading", "words"] as const) { const t = homeTopicFor(key); if (!practise.some((p) => p.key === t.key) && practise.length < 2) practise.push(t); }
    return {
      studentId: id, name: nameOf.get(id) ?? "Student", className: klass.className, grade: klass.grade,
      week: iso(since), from: iso(since), to: iso(now),
      tasks, minutes, days, articles: uniq(mineRuns.map((r) => articleTitle.get(s(r.articleId)) ?? ""), 8),
      lessons: uniq(lessonRuns.filter((r) => s(r.studentId) === id && inWeek(r.finishedAt)).map((r) => skillName.get(s(r.skillId)) ?? ""), 6),
      tests: testsDone.slice(0, 6), practise, note: noteOf.get(id) || null,
    };
  });
}
