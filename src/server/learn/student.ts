/**
 * 🎓 Learn for the student: "Lessons for you" (what the teacher assigned first, then lessons for the student's weakest
 * skills), browse by area, and the lesson player's server side (open, the 3 checks marked here, never in the browser).
 *
 * The level is chosen automatically and never shown: the teacher's choice in the assignment → the latest MAP RIT of the
 * lesson's subject (≤190 → 1, 191–210 → 2, 211–225 → 3, ≥226 → 4) → the platform level (mastery band) of the skills
 * the lesson explains (lowest → 1 … highest → 4) → 2. Every read is bounded; new tables go through safeIfBehind.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { safeIfBehind } from "../db/schema-errors";
import { isHiddenSkill } from "../skills/master";
import { levelFromBand, levelFromRit, type LevelKey, type LLevel } from "../../lib/learn/format";
import { lessonCatalog, lessonFile, type LessonMeta } from "./files";
import { classTeacherIds, hiddenCodes, lessonLevelFor } from "./edits";
import { learnSkills, matchSkills, type LearnSkill } from "./match";
import { RAPID_GUESS_MS } from "../practice/guessing";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v === null || v === undefined || v === "" ? null : new Date(v instanceof Date ? v.getTime() : s(v)).toISOString());
/** suggested lessons shown under "Lessons for you" (besides the assigned ones) */
export const SUGGESTED = 6;

function studentOf(actor: Actor): { sid: string; schoolId: string } {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students only.");
  return { sid: actor.studentId, schoolId: actor.schoolId };
}

/** The lessons a school shows (valid files, not hidden). */
async function visibleCatalog(repo: Repo, schoolId: string): Promise<LessonMeta[]> {
  const hidden = await safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>());
  return lessonCatalog().filter((l) => l.ready && !hidden.has(l.code));
}

/** The level for one student and lesson (see the file comment). Bounded: at most two reads. */
export async function chooseLevel(repo: Repo, studentId: string, subject: "READING" | "LANGUAGE", skillIds: readonly string[], override: number | null = null): Promise<1 | 2 | 3 | 4> {
  if (override && override >= 1 && override <= 4) return override as 1 | 2 | 3 | 4;
  const map = (await repo.findMany("MapResult", { studentId, subject: subject === "LANGUAGE" ? "LANGUAGE_USAGE" : "READING", goalName: null }, { select: ["rit", "testDate"], orderBy: [{ field: "testDate", dir: "desc" }], take: 1 }))[0];
  if (map && Number(map.rit) > 0) return levelFromRit(Number(map.rit));
  if (skillIds.length) {
    const rows = await repo.findMany("StudentSkillMastery", { studentId, skillId: { in: [...skillIds] } }, { select: ["band", "attempts"] });
    const levels = rows.filter((r) => Number(r.attempts ?? 0) > 0).map((r) => levelFromBand(s(r.band))).filter((x): x is 1 | 2 | 3 | 4 => x !== null);
    if (levels.length) return Math.min(...levels) as 1 | 2 | 3 | 4;
  }
  return 2;
}

/** The skills of the student's grade a lesson explains (best rule first): for the level and "Practise in My Work". */
function gradeSkillsOf(code: string, skills: LearnSkill[], grade: number | null): LearnSkill[] {
  const mine = skills.filter((k) => grade === null || k.grade === grade);
  const m = matchSkills(mine, lessonCatalog());
  const order = ["NAME", "FAMILY", "STANDARD", "PARENT", "ANCHOR"];
  return mine.filter((k) => m.get(k.id)?.codes.includes(code)).sort((a, b) => order.indexOf(m.get(a.id)!.rule) - order.indexOf(m.get(b.id)!.rule) || b.questions - a.questions);
}

async function gradeOf(repo: Repo, sid: string): Promise<number | null> {
  const st = await repo.findUnique("Student", { id: sid });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  return g ? Number(g.level) : null;
}

// ------------------------------------------------------------------ Learn home

export interface ForYou { code: string; title: string; goalArea: string; assigned: boolean; dueAt: string | null; done: boolean; started: boolean }
export interface StudentLearnHome { forYou: ForYou[]; areas: { subject: "READING" | "LANGUAGE"; goalArea: string; lessons: { code: string; title: string; done: boolean }[] }[] }

export async function studentLearnHome(repo: Repo, actor: Actor): Promise<StudentLearnHome> {
  const { sid, schoolId } = studentOf(actor);
  const none = [] as Row[];
  const [catalog, assigned, progress, weak] = await Promise.all([
    visibleCatalog(repo, schoolId),
    safeIfBehind("learn.assigned", () => repo.findMany("LearnAssignee", { studentId: sid, kind: "LESSON" }, { select: ["ref", "dueAt", "status", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 }), none),
    safeIfBehind("learn.progress", () => repo.findMany("LearnProgress", { studentId: sid, kind: "LESSON" }, { select: ["ref", "finishedAt", "openedAt"], take: 500 }), none),
    repo.findMany("StudentSkillMastery", { studentId: sid, attempts: { gte: 3 } }, { select: ["skillId", "score"], orderBy: [{ field: "score", dir: "asc" }], take: 40 }),
  ]);
  const byCode = new Map(catalog.map((l) => [l.code, l]));
  const done = new Set(progress.filter((p) => p.finishedAt).map((p) => s(p.ref)));
  const started = new Set(progress.map((p) => s(p.ref)));
  const forYou: ForYou[] = [];
  const seen = new Set<string>();
  for (const a of assigned) {
    const l = byCode.get(s(a.ref));
    if (!l || seen.has(l.code)) continue;
    seen.add(l.code);
    forYou.push({ code: l.code, title: l.title, goalArea: l.goalArea, assigned: true, dueAt: iso(a.dueAt), done: s(a.status) === "DONE" || done.has(l.code), started: started.has(l.code) });
  }
  // suggested: lessons for the weakest skills (lesson ↔ skill by name, family, standards)
  if (weak.length && catalog.length) {
    const skills = await learnSkills(repo, schoolId);
    const weakSkills = weak.map((w) => skills.find((k) => k.id === s(w.skillId))).filter((k): k is LearnSkill => Boolean(k) && !isHiddenSkill(k!.code));
    const m = matchSkills(weakSkills, catalog);
    let added = 0;
    for (const k of weakSkills) {
      const code = m.get(k.id)?.codes.find((c) => !seen.has(c) && !done.has(c));
      if (!code) continue;
      const l = byCode.get(code)!;
      seen.add(code);
      forYou.push({ code, title: l.title, goalArea: l.goalArea, assigned: false, dueAt: null, done: false, started: started.has(code) });
      if (++added >= SUGGESTED) break;
    }
  }
  const areas: StudentLearnHome["areas"] = [];
  for (const l of catalog) {
    let a = areas.find((x) => x.subject === l.subject && x.goalArea === l.goalArea);
    if (!a) areas.push((a = { subject: l.subject, goalArea: l.goalArea, lessons: [] }));
    a.lessons.push({ code: l.code, title: l.title, done: done.has(l.code) });
  }
  areas.sort((a, b) => a.subject.localeCompare(b.subject) * -1 || a.goalArea.localeCompare(b.goalArea));
  return { forYou: forYou.sort((a, b) => Number(a.done) - Number(b.done)), areas };
}

// ------------------------------------------------------------------ the lesson

/** `level` is for the server only (progress, teacher results): pages never pass it to the student's screen. */
export interface StudentLesson { code: string; title: string; goalArea: string; content: LLevel; practiceHref: string; done: boolean; level: number }

/** One lesson as this student gets it (the level is chosen here and never sent as a number or a word). */
export async function studentLesson(repo: Repo, actor: Actor, code: string): Promise<StudentLesson | null> {
  const { sid, schoolId } = studentOf(actor);
  const file = lessonFile(code);
  if (!file) return null;
  const [hidden, assign, prog, grade, skills, teachers] = await Promise.all([
    safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>()),
    safeIfBehind("learn.assigned", () => repo.findMany("LearnAssignee", { studentId: sid, kind: "LESSON", ref: code }, { select: ["level", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 1 }), [] as Row[]),
    safeIfBehind("learn.progress", () => repo.findMany("LearnProgress", { studentId: sid, kind: "LESSON", ref: code }, { select: ["finishedAt"], take: 1 }), [] as Row[]),
    gradeOf(repo, sid),
    learnSkills(repo, schoolId),
    classTeacherIds(repo, sid),
  ]);
  if (hidden.has(code)) return null;
  const linked = gradeSkillsOf(code, skills, grade);
  const level = await chooseLevel(repo, sid, file.subject, linked.map((k) => k.id), assign[0]?.level === null || assign[0]?.level === undefined ? null : Number(assign[0].level));
  const v = await lessonLevelFor(repo, schoolId, code, String(level) as LevelKey, teachers);
  if (!v) return null;
  const practice = linked.find((k) => k.questions > 0);
  return { code, title: file.title, goalArea: file.goalArea, content: v.level, practiceHref: practice ? `/practice/${practice.id}` : "/student/work", done: Boolean(prog[0]?.finishedAt), level };
}

/** The student opens a lesson: their progress row (and an assigned lesson turns "In progress"). */
export async function openLesson(repo: Repo, actor: Actor, code: string, now = new Date()): Promise<void> {
  const { sid, schoolId } = studentOf(actor);
  if (!lessonFile(code)) throw new ValidationError("This lesson is not on the platform.");
  const had = await repo.findMany("LearnProgress", { studentId: sid, kind: "LESSON", ref: code }, { select: ["id"], take: 1 });
  if (!had.length) {
    try { await repo.create("LearnProgress", { schoolId, studentId: sid, kind: "LESSON", ref: code, level: 2, openedAt: now, attempts: 0, seconds: 0, neededAgain: false, updatedAt: now }); }
    catch { /* opened twice at once */ }
  }
  await repo.updateMany("LearnAssignee", { studentId: sid, kind: "LESSON", ref: code, status: "NOT_STARTED" }, { status: "IN_PROGRESS", updatedAt: now });
}

export interface CheckResult { score: number; passed: boolean; answers: number[]; why: string[]; /** r67: answered too fast to have read them (counted for nothing) */ rapid?: boolean }
/**
 * The 3 checks, marked on the server against the version the student was shown. ≥ 2 correct = done (an assigned lesson
 * is Done in My Work); fewer = the "again" explanation, then the checks again (needed "again" is noted for the teacher).
 */
export async function submitLessonChecks(repo: Repo, actor: Actor, code: string, picked: unknown[], opts: { again?: boolean; seconds?: number } = {}, now = new Date()): Promise<CheckResult> {
  const { sid, schoolId } = studentOf(actor);
  const view = await studentLesson(repo, actor, code);
  if (!view) throw new ValidationError("This lesson is not on the platform.");
  const checks = view.content.checks;
  if (!Array.isArray(picked) || picked.length !== checks.length) throw new ValidationError("Answer the 3 questions first.");
  const score = checks.reduce((n, q, i) => n + (Number(picked[i]) === q.answer ? 1 : 0), 0);
  const passed = score >= 2;
  const secs = Math.max(0, Math.min(3600, Math.round(Number(opts.seconds) || 0)));
  const row = (await repo.findMany("LearnProgress", { studentId: sid, kind: "LESSON", ref: code }, { select: ["id", "best", "attempts", "seconds", "finishedAt", "neededAgain"], take: 1 }))[0];
  // 🎲 r67: the checks answered faster than 3 s each (timed from the lesson opening) are rapid guesses — they count for
  // nothing (no score, not Done); only the try and its time are kept
  if (secs > 0 && secs * 1000 < checks.length * RAPID_GUESS_MS) {
    const tried = { attempts: Number(row?.attempts ?? 0) + 1, seconds: Number(row?.seconds ?? 0) + secs, updatedAt: now };
    if (row) await repo.updateMany("LearnProgress", { id: row.id }, tried);
    else await repo.create("LearnProgress", { schoolId, studentId: sid, kind: "LESSON", ref: code, openedAt: now, level: view.level, score: 0, best: 0, neededAgain: false, finishedAt: null, ...tried });
    return { score: 0, passed: false, answers: checks.map((q) => q.answer), why: checks.map((q) => q.why), rapid: true };
  }
  const data = { level: view.level, score, best: Math.max(score, Number(row?.best ?? 0)), attempts: Number(row?.attempts ?? 0) + 1, seconds: Number(row?.seconds ?? 0) + secs, neededAgain: Boolean(row?.neededAgain) || Boolean(opts.again) || !passed, finishedAt: row?.finishedAt ?? (passed ? now : null), updatedAt: now };
  if (row) await repo.updateMany("LearnProgress", { id: row.id }, data);
  else await repo.create("LearnProgress", { schoolId, studentId: sid, kind: "LESSON", ref: code, openedAt: now, ...data });
  if (passed) await repo.updateMany("LearnAssignee", { studentId: sid, kind: "LESSON", ref: code }, { status: "DONE", updatedAt: now });
  return { score, passed, answers: checks.map((q) => q.answer), why: checks.map((q) => q.why) };
}
