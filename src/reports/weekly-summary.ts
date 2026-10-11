/**
 * 👪 The weekly family summary (one printable page per student): what the student practised in the last 7 days,
 * minutes, skills practised and completed, a reading snapshot (ReadRise, ReadMaster, fluency), badges earned this
 * week and one tip for home. Plain words only: a snapshot is "Strong", "On track" or "Growing" (never level names).
 *
 * Read only and bounded: only this week's rows of these students are read (answers, sessions, readings, badges),
 * plus the latest fluency check. Nothing is written (badges are read as already awarded, not re-evaluated).
 *
 * Access (checked here, on the server): the class's own teacher or the school admin (assertClassAccess). A student
 * is opened only through one of their current classes; any other student looks "not found".
 */
import type { Repo, Row } from "../server/seeding/repo";
import { ForbiddenError, type Actor } from "../server/auth/rbac";
import { ValidationError } from "../server/curriculum-admin";
import { assertClassAccess } from "../server/teacher/assignments";
import { isHiddenSkill } from "../server/skills/master";
import { BADGES } from "../lib/badge-catalog";
import { classTeacherNames } from "./class-teachers";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const time = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(s(v)).getTime());
const DAY = 86_400_000;
/** One class at a time on paper. */
export const WEEKLY_MAX_STUDENTS = 60;

/** A plain-language snapshot word (English source string; translated when shown). */
export type Snapshot = "Strong" | "On track" | "Growing" | "Not this week";
/**
 * % → snapshot: 80+ strong, 60–79 on track, under 60 growing (the same cut points as the report pages).
 * Reading aloud uses word accuracy, where 95+ is strong and 90–94 on track.
 */
export function snapshotOf(pct: number | null | undefined, cut: [number, number] = [80, 60]): Snapshot {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "Not this week";
  return pct >= cut[0] ? "Strong" : pct >= cut[1] ? "On track" : "Growing";
}
const FLUENCY_CUT: [number, number] = [95, 90];

export interface WeeklySummary {
  studentId: string; name: string; className: string; grade: number;
  from: string; to: string;
  minutes: number; answers: number; accuracy: number | null; activeDays: number;
  /** skills practised this week (most answers first, at most 6) */
  skills: string[];
  /** skills completed (mastered) this week */
  completed: string[];
  readrise: { done: number; avg: number | null; word: Snapshot };
  readmaster: { done: number; avg: number | null; word: Snapshot };
  fluency: { wcpm: number | null; readings: number; word: Snapshot; date: string | null };
  badges: { icon: string; name: string }[];
  /** the tip for home: an English source string + its values (translated when shown) */
  tip: { text: string; vars?: Record<string, string> };
}
export interface WeeklyBatch { classId: string; className: string; grade: number; teacher: string; schoolName: string; items: WeeklySummary[] }

/** The one tip for home, from this week's picture (simple, kind, doable). */
export function tipFor(w: Pick<WeeklySummary, "minutes" | "fluency" | "readrise" | "readmaster">, weakest: string | null): WeeklySummary["tip"] {
  if (w.minutes < 20) return { text: "Choose a short practice time together: 15 minutes, three days a week, at the same time each day." };
  if (weakest) return { text: "Ask your child to teach you one thing they practised this week: {skill}.", vars: { skill: weakest } };
  if (!w.fluency.readings) return { text: "Read aloud together for 10 minutes. Take turns reading a page." };
  if (!w.readrise.done && !w.readmaster.done) return { text: "Ask your child to read one article on the platform and tell you what it was about." };
  return { text: "Ask your child about what they read this week: what was it about, and what did they learn?" };
}

/** Which class(es) this person may open for this student (the student's current classes they teach / administer). */
async function studentClass(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const ms = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  for (const m of ms) { try { return await assertClassAccess(repo, actor, s(m.classId)); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  throw new ForbiddenError("Student not found.");
}

function staffOnly(actor: Actor) {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the class teacher or the admin can print this.");
}

/**
 * The weekly summaries of one student (`studentId`) or of a whole class (`classId`, one page per student).
 * The class teacher or the school admin only.
 */
export async function weeklySummaries(repo: Repo, actor: Actor, input: { studentId?: string | null; classId?: string | null }, now = new Date()): Promise<WeeklyBatch> {
  staffOnly(actor);
  let klass: Row;
  let ids: string[];
  if (input.studentId) {
    klass = await studentClass(repo, actor, s(input.studentId));
    ids = [s(input.studentId)];
  } else if (input.classId) {
    klass = await assertClassAccess(repo, actor, s(input.classId));
    ids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)).slice(0, WEEKLY_MAX_STUDENTS);
  } else throw new ValidationError("Choose a class or a student.");
  const classId = s(klass.id);
  const [grade, school, teachers] = await Promise.all([
    klass.gradeId ? repo.findUnique("Grade", { id: klass.gradeId }) : Promise.resolve(null),
    repo.findUnique("School", { id: klass.schoolId }),
    classTeacherNames(repo, [classId]),
  ]);
  const base = { classId, className: s(klass.name), grade: Number(grade?.level ?? 0), teacher: teachers.get(classId) ?? "", schoolName: s(school?.name) };
  if (!ids.length) return { ...base, items: [] };

  const since = new Date(now.getTime() - 7 * DAY);
  const [students, attempts, sessions, mastered, runs, rm, practice, checks, held] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "skillId", "isCorrect", "rapidGuess", "createdAt"] }),
    repo.findMany("PracticeSession", { studentId: { in: ids }, startedAt: { gte: since } }, { select: ["studentId", "activeMs", "startedAt"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, masteredAt: { gte: since } }, { select: ["studentId", "skillId", "isMastered"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: { gte: since } }, { select: ["studentId", "score", "completedAt"] }),
    repo.findMany("ReadMasterAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "correct", "total"] }),
    repo.findMany("FluencyPractice", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "wcpm", "accuracy", "createdAt"] }),
    repo.findMany("FluencyCheck", { studentId: { in: ids } }, { select: ["studentId", "wcpm", "accuracy", "checkedAt"], orderBy: [{ field: "checkedAt", dir: "desc" }], take: ids.length * 6 }),
    repo.findMany("StudentBadge", { studentId: { in: ids }, awardedAt: { gte: since } }, { select: ["studentId", "badgeId"] }),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => s(u.id) === s(x.userId))?.displayName) || "Student"]));
  const skillIds = [...new Set([...attempts.map((a) => s(a.skillId)), ...mastered.map((m) => s(m.skillId))].filter(Boolean))];
  const skills = skillIds.length ? (await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "code"] })).filter((k) => !isHiddenSkill(k.code)) : [];
  const skillName = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  const badgeRows = held.length ? await repo.findMany("Badge", { id: { in: [...new Set(held.map((b) => s(b.badgeId)))] } }, { select: ["id", "code", "name"] }) : [];
  const badgeOf = new Map(badgeRows.map((b) => { const def = BADGES.find((d) => d.code === s(b.code)); return [s(b.id), { icon: def?.icon ?? "🏅", name: def?.name ?? s(b.name) }]; }));

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const items: WeeklySummary[] = ids.map((id) => {
    const mine = attempts.filter((a) => s(a.studentId) === id);
    const perSkill = new Map<string, { n: number; c: number }>();
    for (const a of mine) { const k = s(a.skillId); if (!skillName.has(k)) continue; const o = perSkill.get(k) ?? { n: 0, c: 0 }; o.n++; if (a.isCorrect) o.c++; perSkill.set(k, o); }
    const counted = mine.filter((a) => !a.rapidGuess);
    const days = new Set([...mine.map((a) => new Date(time(a.createdAt)).toISOString().slice(0, 10)), ...sessions.filter((x) => s(x.studentId) === id && Number(x.activeMs) > 0).map((x) => new Date(time(x.startedAt)).toISOString().slice(0, 10))]);
    const rr = runs.filter((r) => s(r.studentId) === id && r.score !== null && r.score !== undefined).map((r) => Number(r.score));
    const rmPct = rm.filter((r) => s(r.studentId) === id && Number(r.total) > 0).map((r) => (100 * Number(r.correct)) / Number(r.total));
    const fl = practice.filter((p) => s(p.studentId) === id);
    const lastCheck = checks.find((c) => s(c.studentId) === id);
    const flAcc = avg(fl.map((p) => Number(p.accuracy)).filter((x) => Number.isFinite(x)));
    const weakest = [...perSkill].filter(([, o]) => o.n >= 4 && o.c / o.n < 0.6).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)[0];
    const w = {
      studentId: id, name: nameOf.get(id) ?? "Student", className: base.className, grade: base.grade,
      from: since.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10),
      minutes: Math.round(sessions.filter((x) => s(x.studentId) === id).reduce((t, x) => t + Number(x.activeMs ?? 0), 0) / 60_000),
      answers: mine.length, accuracy: counted.length ? Math.round((100 * counted.filter((a) => a.isCorrect).length) / counted.length) : null, activeDays: days.size,
      skills: [...perSkill].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k]) => skillName.get(k)!),
      completed: [...new Set(mastered.filter((m) => s(m.studentId) === id && Boolean(m.isMastered) && skillName.has(s(m.skillId))).map((m) => skillName.get(s(m.skillId))!))].slice(0, 6),
      readrise: { done: rr.length, avg: avg(rr), word: snapshotOf(avg(rr)) },
      readmaster: { done: rmPct.length, avg: avg(rmPct), word: snapshotOf(avg(rmPct)) },
      fluency: { wcpm: fl.length ? Math.max(...fl.map((p) => Number(p.wcpm))) : lastCheck ? Number(lastCheck.wcpm) : null, readings: fl.length, word: snapshotOf(fl.length ? flAcc : lastCheck?.accuracy !== null && lastCheck?.accuracy !== undefined ? Number(lastCheck.accuracy) : null, FLUENCY_CUT), date: fl.length ? null : lastCheck ? new Date(time(lastCheck.checkedAt)).toISOString().slice(0, 10) : null },
      badges: held.filter((b) => s(b.studentId) === id).map((b) => badgeOf.get(s(b.badgeId))).filter((b): b is { icon: string; name: string } => Boolean(b)),
    };
    return { ...w, tip: tipFor(w, weakest ? skillName.get(weakest[0]) ?? null : null) };
  });
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { ...base, items };
}
