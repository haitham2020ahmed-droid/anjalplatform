/**
 * ⭐ Skill stars — the pieces around the status (owner r67 §5, §6, §8, §9):
 *   attention      Teacher Home "Needs attention": stuck at ◐ 7+ days, 50 questions without mastery, a new 🔄
 *   exclude        "5 students already mastered this skill — exclude them?" (every place a skill is assigned)
 *   learn          a student stuck at ◐ (7+ days or 25+ answers without progress) gets the skill's Learn lesson first
 *   goal           a small weekly goal ("master 2 skills"), set by the student or the teacher (WeeklyGoal, scope SKILLS)
 *   self-check     "Do you feel you understood it?" 😊😐😟 after a skill; the teacher sees mismatches
 *   celebration    a new ⭐ is celebrated once (lightly) on the student's pages
 *   migration      every student's status from the practice data already there (idempotent, batched, counts kept)
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ForbiddenError } from "../auth/rbac";
import type { JobDef } from "../jobs/runner";
import { ValidationError } from "../curriculum-admin";
import {
  currentRows, decideStatus, emptyCounts, historyOf, LEVEL_ROW, levelStart, ms, REVIEW_AFTER_DAYS, skillKeyIndex, skillKeysFor, skillStatusesFor, STAR_MAX_ANSWERS,
  STUCK_ANSWERS, STUCK_DAYS, studentSchool, type SkillKeyIndex, type StarStatus, type StarView, type StatusCounts,
} from "./status";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const DAY = 86_400_000;

// ------------------------------------------------------------------ Needs attention (teacher home)

export interface StarAttention { studentId: string; kind: "STUCK" | "NO_MASTERY" | "REVIEW"; key: string; skill: string; skillId: string | null; days: number; answered: number }
/** The star reasons a student needs the teacher (one batched read for all the students). */
export async function starAttention(repo: Repo, schoolId: string, studentIds: readonly string[], now = new Date()): Promise<StarAttention[]> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return [];
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 400) rows.push(...(await repo.findMany("SkillStatus", { studentId: { in: ids.slice(i, i + 400) }, status: { in: ["IN_PROGRESS", "NEEDS_REVIEW"] } }, { select: ["studentId", "skillKey", "level", "status", "skillId", "answered", "progressAt", "needsSupportAt", "updatedAt", "history"] })));
  if (!rows.length) return [];
  const ix = await skillKeyIndex(repo, schoolId);
  const out: StarAttention[] = [];
  const days = (t: number) => Math.floor((now.getTime() - t) / DAY);
  for (const r of rows) {
    const base = { studentId: s(r.studentId), key: s(r.skillKey), skill: ix.nameOf.get(s(r.skillKey)) ?? "Skill", skillId: r.skillId ? s(r.skillId) : null, answered: Number(r.answered ?? 0) };
    if (s(r.status) === "NEEDS_REVIEW") {
      const at = Math.max(ms(r.updatedAt), ...historyOf(r.history).filter((h) => s(h.status) === "NEEDS_REVIEW").map((h) => ms(h.at)));
      if (now.getTime() - at <= 14 * DAY) out.push({ ...base, kind: "REVIEW", days: days(at) });
    } else if (r.needsSupportAt) out.push({ ...base, kind: "NO_MASTERY", days: days(ms(r.needsSupportAt)) });
    else if (ms(r.progressAt) && now.getTime() - ms(r.progressAt) >= STUCK_DAYS * DAY) out.push({ ...base, kind: "STUCK", days: days(ms(r.progressAt)) });
  }
  const rank = { NO_MASTERY: 0, REVIEW: 1, STUCK: 2 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.days - a.days);
}

/**
 * The RTI Program's "Needs support" pairs: 50 answers without mastery (still ◐), one per student + skill (the skill
 * the student practised; the RTI plan suggests it — the existing RTI flow, no second list).
 */
export async function needsSupportPairs(repo: Repo, studentIds: readonly string[]): Promise<{ studentId: string; skillId: string; key: string }[]> {
  if (!studentIds.length) return [];
  const rows = await repo.findMany("SkillStatus", { studentId: { in: [...studentIds].slice(0, 400) }, status: "IN_PROGRESS" }, { select: ["studentId", "skillKey", "skillId", "needsSupportAt"] });
  const seen = new Set<string>();
  return rows.filter((r) => r.needsSupportAt && r.skillId && !seen.has(`${s(r.studentId)}|${s(r.skillKey)}`) && seen.add(`${s(r.studentId)}|${s(r.skillKey)}`)).map((r) => ({ studentId: s(r.studentId), skillId: s(r.skillId), key: s(r.skillKey) }));
}

// ------------------------------------------------------------------ exclude students who mastered

/** The students (of these) who have ⭐ on this skill (any copy of it). One read. */
export async function masteredAmong(repo: Repo, schoolId: string, studentIds: readonly string[], skillId: string): Promise<string[]> {
  if (!studentIds.length || !skillId) return [];
  const key = (await skillKeysFor(repo, schoolId, [skillId])).get(skillId)!;
  const by = await skillStatusesFor(repo, studentIds, [key]);
  return [...by].filter(([, m]) => m.get(key)?.status === "MASTERED").map(([id]) => id);
}

/** For several skills at once: skill id → students with ⭐ (plans). */
export async function masteredBySkill(repo: Repo, schoolId: string, studentIds: readonly string[], skillIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!studentIds.length || !skillIds.length) return out;
  const keys = await skillKeysFor(repo, schoolId, skillIds);
  const by = await skillStatusesFor(repo, studentIds, [...new Set(keys.values())]);
  for (const id of skillIds) out.set(id, [...by].filter(([, m]) => m.get(keys.get(id)!)?.status === "MASTERED").map(([sid]) => sid));
  return out;
}

/**
 * The Assign window (one or several classes): the students it would reach (the picked ones, else every member) and
 * which of them already mastered the skill. Class access is checked by the caller's assign function.
 */
export async function masteredInClasses(repo: Repo, schoolId: string, classIds: readonly string[], skillId: string, picked: readonly string[] = []): Promise<{ reach: string[]; mastered: string[] }> {
  if (!classIds.length || !skillId) return { reach: [], mastered: [] };
  const members = [...new Set((await repo.findMany("ClassMembership", { classId: { in: [...classIds] }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  const reach = picked.length ? members.filter((id) => picked.includes(id)) : members;
  return { reach, mastered: await masteredAmong(repo, schoolId, reach, skillId) };
}

/** The prompt's sentence (teacher wording). */
export const excludePrompt = (n: number): string => `${n} student${n === 1 ? "" : "s"} already mastered this skill — exclude ${n === 1 ? "them" : "them"}?`;

// ------------------------------------------------------------------ Learn suggestion when stuck

export interface LearnTip { code: string; title: string; href: string; skill: string }
/** Is this status "stuck" (pure)? In progress and no progress for 7+ days or 25+ answers. */
export function isStuck(r: Row, now = new Date()): boolean {
  if (s(r.status) !== "IN_PROGRESS") return false;
  const since = ms(r.progressAt);
  return (Boolean(since) && now.getTime() - since >= STUCK_DAYS * DAY) || Number(r.answered ?? 0) - Number(r.progressAnswered ?? 0) >= STUCK_ANSWERS;
}

/** The skill's Learn lesson for a stuck student (once; skipping hides it for a week). Null otherwise. */
export async function learnSuggestion(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<LearnTip | null> {
  const schoolId = await studentSchool(repo, studentId);
  if (!schoolId) return null;
  const key = (await skillKeysFor(repo, schoolId, [skillId])).get(skillId)!;
  const row = currentRows(await repo.findMany("SkillStatus", { studentId, skillKey: key })).get(key);
  if (!row || !isStuck(row, now)) return null;
  if (ms(row.learnSkippedAt) && now.getTime() - ms(row.learnSkippedAt) < STUCK_DAYS * DAY) return null;
  const [{ learnSkills, matchSkills }, { lessonCatalog }] = await Promise.all([import("../learn/match"), import("../learn/files")]);
  const skills = await learnSkills(repo, schoolId);
  const ix = await skillKeyIndex(repo, schoolId);
  const mine = skills.filter((k) => ix.keyOf.get(k.id) === key);
  if (!mine.length) return null;
  const ready = lessonCatalog().filter((l) => l.ready);
  const m = matchSkills(mine, ready);
  const code = [...m.values()].find((x) => x?.codes.length)?.codes[0];
  if (!code) return null;
  const lesson = ready.find((l) => l.code === code)!;
  return { code, title: lesson.title, href: `/student/learn/${encodeURIComponent(code)}`, skill: ix.nameOf.get(key) ?? mine[0].name };
}
/** "Skip, keep practising": the suggestion is not shown again for a week. */
export async function skipLearnSuggestion(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<void> {
  const schoolId = await studentSchool(repo, studentId);
  const key = (await skillKeysFor(repo, schoolId, [skillId])).get(skillId)!;
  await repo.updateMany("SkillStatus", { studentId, skillKey: key }, { learnSkippedAt: now });
}

// ------------------------------------------------------------------ weekly goal ("master 2 skills")

const RIYADH = 3 * 3_600_000;
/** Sunday 00:00 Riyadh of this school week (UTC Date). */
export function goalWeekStart(now: Date): Date {
  const local = now.getTime() + RIYADH;
  const dow = new Date(local).getUTCDay();
  return new Date(local - (local % DAY) - dow * DAY - RIYADH);
}
export const GOAL_SCOPE = "SKILLS";
export interface SkillGoal { target: number; mastered: number; done: boolean; setBy: "STUDENT" | "TEACHER" }

async function assertTeachesStudent(repo: Repo, actor: Actor, studentId: string): Promise<void> {
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return;
  const t = await repo.findUnique("Teacher", { userId: actor.userId });
  const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  const ok = t && m.length ? await repo.count("ClassTeacher", { teacherId: t.id, classId: { in: m.map((x) => x.classId) } }) : 0;
  if (!ok) throw new ForbiddenError("This student is not in your classes.");
}

/** Sets this week's goal: the student for themself, or the teacher for a student of their class (1–5 skills). */
export async function setSkillGoal(repo: Repo, actor: Actor, input: { studentId?: string; target: number }, now = new Date()): Promise<void> {
  const target = Math.round(Number(input.target));
  if (!Number.isInteger(target) || target < 1 || target > 5) throw new ValidationError("Choose a goal from 1 to 5 skills.");
  const sid = actor.role === "STUDENT" ? actor.studentId! : s(input.studentId);
  if (!sid) throw new ValidationError("Choose a student.");
  if (actor.role !== "STUDENT") await assertTeachesStudent(repo, actor, sid);
  const ws = goalWeekStart(now);
  const data = { kind: "SKILLS", target, title: actor.role === "STUDENT" ? "STUDENT" : "TEACHER", createdById: actor.userId };
  await repo.upsert("WeeklyGoal", { scope: GOAL_SCOPE, ownerId: sid, weekStart: ws }, { schoolId: actor.schoolId!, scope: GOAL_SCOPE, ownerId: sid, weekStart: ws, createdAt: now, ...data }, data);
}

/** Stars earned this week (⭐ rows whose masteredAt is in this school week). */
const starsThisWeek = (rows: Row[], ws: Date) => [...currentRows(rows).values()].filter((r) => s(r.status) === "MASTERED" && ms(r.masteredAt) >= ws.getTime()).length;

/** The student's goal this week with its progress (null: no goal). */
export async function skillGoalOf(repo: Repo, studentId: string, now = new Date()): Promise<SkillGoal | null> {
  const ws = goalWeekStart(now);
  const g = (await repo.findMany("WeeklyGoal", { scope: GOAL_SCOPE, ownerId: studentId, weekStart: ws }, { select: ["target", "title"] }))[0];
  if (!g) return null;
  const rows = await repo.findMany("SkillStatus", { studentId, status: "MASTERED", masteredAt: { gte: ws } }, { select: ["skillKey", "level", "status", "masteredAt"] });
  const mastered = starsThisWeek(rows, ws);
  return { target: Number(g.target), mastered, done: mastered >= Number(g.target), setBy: s(g.title) === "TEACHER" ? "TEACHER" : "STUDENT" };
}

/** Teacher: every student's goal of the class this week (two reads). */
export async function classSkillGoals(repo: Repo, studentIds: readonly string[], now = new Date()): Promise<Map<string, SkillGoal>> {
  const ws = goalWeekStart(now);
  const out = new Map<string, SkillGoal>();
  if (!studentIds.length) return out;
  const goals = await repo.findMany("WeeklyGoal", { scope: GOAL_SCOPE, ownerId: { in: [...studentIds] }, weekStart: ws }, { select: ["ownerId", "target", "title"] });
  if (!goals.length) return out;
  const rows = await repo.findMany("SkillStatus", { studentId: { in: goals.map((g) => s(g.ownerId)) }, status: "MASTERED", masteredAt: { gte: ws } }, { select: ["studentId", "skillKey", "level", "status", "masteredAt"] });
  for (const g of goals) {
    const mastered = starsThisWeek(rows.filter((r) => s(r.studentId) === s(g.ownerId)), ws);
    out.set(s(g.ownerId), { target: Number(g.target), mastered, done: mastered >= Number(g.target), setBy: s(g.title) === "TEACHER" ? "TEACHER" : "STUDENT" });
  }
  return out;
}

// ------------------------------------------------------------------ self-check and celebration

export type SelfCheck = "HAPPY" | "OK" | "UNSURE";
export const SELF_CHECKS: readonly SelfCheck[] = ["HAPPY", "OK", "UNSURE"];
export const SELF_ICON: Record<SelfCheck, string> = { HAPPY: "😊", OK: "😐", UNSURE: "😟" };

/** The skill the student just finished (⭐, or 50 answers done) and has not answered the self-check for (last 14 days). */
export async function pendingSelfCheck(repo: Repo, studentId: string, now = new Date()): Promise<{ key: string; skill: string } | null> {
  const rows = await repo.findMany("SkillStatus", { studentId, selfCheck: null, updatedAt: { gte: new Date(now.getTime() - 14 * DAY) } }, { select: ["skillKey", "level", "status", "masteredAt", "needsSupportAt", "updatedAt"] });
  const done = [...currentRows(rows).values()].filter((r) => (s(r.status) === "MASTERED" && ms(r.masteredAt) >= now.getTime() - 14 * DAY) || r.needsSupportAt)
    .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))[0];
  if (!done) return null;
  const ix = await skillKeyIndex(repo, await studentSchool(repo, studentId));
  return { key: s(done.skillKey), skill: ix.nameOf.get(s(done.skillKey)) ?? "this skill" };
}
/** The student's answer to "Do you feel you understood it?". */
export async function saveSelfCheck(repo: Repo, actor: Actor, key: string, value: string): Promise<void> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  if (!(SELF_CHECKS as readonly string[]).includes(value)) throw new ValidationError("Choose one of the faces.");
  await repo.updateMany("SkillStatus", { studentId: actor.studentId, skillKey: s(key) }, { selfCheck: value });
}
/** Teacher: confident but weak / unsure but strong (pure). */
export function selfCheckMismatch(v: Pick<StarView, "status" | "score" | "needsSupport" | "selfCheck">): "CONFIDENT_WEAK" | "UNSURE_STRONG" | null {
  if (v.selfCheck === "HAPPY" && (v.needsSupport || (v.status !== "MASTERED" && v.score < 60))) return "CONFIDENT_WEAK";
  if (v.selfCheck === "UNSURE" && v.status === "MASTERED") return "UNSURE_STRONG";
  return null;
}
export const MISMATCH_TEXT = { CONFIDENT_WEAK: "Confident but weak", UNSURE_STRONG: "Unsure but strong" } as const;

/** New stars not celebrated yet (names), and marks them celebrated. */
export async function takeCelebrations(repo: Repo, studentId: string, now = new Date()): Promise<string[]> {
  const rows = await repo.findMany("SkillStatus", { studentId, status: "MASTERED", celebratedAt: null }, { select: ["id", "skillKey", "masteredAt"] });
  const fresh = rows.filter((r) => ms(r.masteredAt) >= now.getTime() - 14 * DAY);
  if (!rows.length) return [];
  await repo.updateMany("SkillStatus", { id: { in: rows.map((r) => r.id) } }, { celebratedAt: now });
  if (!fresh.length) return [];
  const ix = await skillKeyIndex(repo, await studentSchool(repo, studentId));
  return fresh.map((r) => ix.nameOf.get(s(r.skillKey)) ?? "a skill");
}

/** "8 of 20 skills mastered" for a set of keys (pure). */
export function masteredOf(views: Iterable<StarView>): { mastered: number; total: number } {
  let mastered = 0, total = 0;
  for (const v of views) { total++; if (v.status === "MASTERED") mastered++; }
  return { mastered, total };
}

// ------------------------------------------------------------------ migration (first start + admin button)

export const MIGRATION_KEY = "skills.status.migration";
export interface MigrationReport { at: string; students: number; written: number; counts: StatusCounts; universe: number }

/**
 * Computes the statuses of a batch of students from the data already there, in memory (a few reads per batch, not per
 * skill): ⭐ only when the 30-answer + mastery rule is truly met, ◐ when started, ☆ otherwise (no row). Idempotent:
 * a row that would not change is not written. Quiet: no coins and no alerts for the past. Returns the rows written.
 */
export async function recomputeStudents(repo: Repo, schoolId: string, studentIds: readonly string[], now = new Date(), opts: { index?: SkillKeyIndex } = {}): Promise<number> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return 0;
  const ix = opts.index ?? (await skillKeyIndex(repo, schoolId));
  const [attempts, mastery, existing] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, rapidGuess: false }, { select: ["studentId", "sessionId", "skillId", "isCorrect", "source", "createdAt", "unreliable"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score", "isMastered"] }),
    repo.findMany("SkillStatus", { studentId: { in: ids } }),
  ]);
  // r68 accuracy: an Unreliable session's answers (> 20 % rapid guesses) never count, as in countedAnswers
  const mine = attempts.filter((a) => !s(a.source) && !a.unreliable);
  const sids = [...new Set(mine.map((a) => s(a.sessionId)))];
  const sessions: Row[] = [];
  for (let i = 0; i < sids.length; i += 500) sessions.push(...(await repo.findMany("PracticeSession", { id: { in: sids.slice(i, i + 500) } }, { select: ["id", "mode", "assignmentId"] })));
  const aids = [...new Set(sessions.map((x) => s(x.assignmentId)).filter(Boolean))];
  const as: Row[] = [], checks: Row[] = [];
  for (let i = 0; i < aids.length; i += 500) {
    const part = aids.slice(i, i + 500);
    as.push(...(await repo.findMany("Assignment", { id: { in: part } }, { select: ["id", "testId", "curriculumPlanId", "title"] })));
    checks.push(...(await repo.findMany("SkillReviewCheck", { assignmentId: { in: part } }, { select: ["assignmentId"] })));
  }
  const bad = new Set([...as.filter((a) => a.testId || ["TEST", "WEEKLY_CHECK"].includes(s(a.curriculumPlanId)) || s(a.title).startsWith("Re-check: ")).map((a) => s(a.id)), ...checks.map((c) => s(c.assignmentId))]);
  const ok = new Set(sessions.filter((x) => (s(x.mode) === "ADAPTIVE_PRACTICE" || s(x.mode) === "TEACHER_QUIZ") && !bad.has(s(x.assignmentId))).map((x) => s(x.id)));
  // student|key → counted answers (with times), engine mastery
  const cnt = new Map<string, { answered: number; correct: number; at: number[]; skillId: string }>();
  for (const a of mine) {
    if (!ok.has(s(a.sessionId))) continue;
    const key = ix.keyOf.get(s(a.skillId)); if (!key) continue;
    const k = `${s(a.studentId)}|${key}`, c = cnt.get(k) ?? { answered: 0, correct: 0, at: [], skillId: s(a.skillId) };
    c.answered++; if (a.isCorrect) c.correct++; c.at.push(ms(a.createdAt)); cnt.set(k, c);
  }
  const eng = new Map<string, { score: number; mastered: boolean; skillId: string }>();
  for (const m of mastery) {
    const key = ix.keyOf.get(s(m.skillId)); if (!key) continue;
    const k = `${s(m.studentId)}|${key}`, e = eng.get(k) ?? { score: 0, mastered: false, skillId: s(m.skillId) };
    e.score = Math.max(e.score, Number(m.score ?? 0)); e.mastered ||= Boolean(m.isMastered); eng.set(k, e);
  }
  const byStudent = new Map<string, Row[]>();
  for (const r of existing) byStudent.set(s(r.studentId), [...(byStudent.get(s(r.studentId)) ?? []), r]);
  let written = 0;
  for (const sid of ids) {
    const rows = byStudent.get(sid) ?? [];
    const cur = currentRows(rows);
    const levelRow = rows.find((r) => s(r.skillKey) === LEVEL_ROW);
    const keys = new Set([...[...cnt.keys()].filter((k) => k.startsWith(`${sid}|`)).map((k) => k.slice(sid.length + 1)), ...cur.keys()]);
    for (const key of keys) {
      const prev = cur.get(key) ?? null;
      const since = levelStart(rows, prev);
      const c = cnt.get(`${sid}|${key}`), e = eng.get(`${sid}|${key}`);
      const at = (c?.at ?? []).filter((t) => t > since);
      const correct = since ? Math.round((c?.correct ?? 0) * (at.length / Math.max(1, c?.answered ?? 1))) : c?.correct ?? 0;
      const prevStatus = prev ? (s(prev.status) as StarStatus) : null;
      const failAt = prevStatus === "NEEDS_REVIEW" ? Math.max(0, ...historyOf(prev?.history).filter((h) => s(h.status) === "NEEDS_REVIEW").map((h) => ms(h.at))) : 0;
      const d = decideStatus(prevStatus, at.length, Boolean(e?.mastered), { sinceFail: failAt ? at.filter((t) => t > failAt).length : 0, needsSupport: Boolean(prev?.needsSupportAt) });
      if (!prev && d.status === "NOT_STARTED") continue;
      const lastAt = at.length ? new Date(at[at.length - 1]) : now;
      const data: Row = {
        status: d.status, skillId: c?.skillId ?? e?.skillId ?? prev?.skillId ?? null, answered: at.length, correct, score: e?.score ?? 0,
        ...(d.justMastered ? { masteredAt: lastAt, reviewDueAt: new Date(lastAt.getTime() + REVIEW_AFTER_DAYS * DAY), celebratedAt: now } : {}),
        ...(d.justNeedsSupport || (d.status === "IN_PROGRESS" && at.length >= STAR_MAX_ANSWERS && !prev?.needsSupportAt) ? { needsSupportAt: lastAt } : {}),
      };
      const same = prev && s(prev.status) === d.status && Number(prev.answered) === at.length && Number(prev.correct) === correct && Math.abs(Number(prev.score) - Number(data.score)) < 0.01 && !d.justMastered && !(data.needsSupportAt && !prev.needsSupportAt);
      if (same) continue;
      const history = [...historyOf(prev?.history), ...(!prev || s(prev.status) !== d.status ? [{ at: now.toISOString(), status: d.status, why: "computed from earlier practice" }] : [])].slice(-40);
      if (prev) await repo.updateMany("SkillStatus", { id: prev.id }, { ...data, history, updatedAt: now });
      else await repo.create("SkillStatus", { studentId: sid, skillKey: key, level: levelRow ? Number(levelRow.level ?? 1) : 1, createdAt: now, updatedAt: now, startedAt: at.length ? new Date(at[0]) : now, progressAt: lastAt, progressAnswered: at.length, history, ...data });
      written++;
    }
  }
  return written;
}

/** The school's skill universe (keys with questions): ☆ = this × students − started. */
export async function skillUniverse(repo: Repo, schoolId: string): Promise<number> {
  const { masterSkills } = await import("./master");
  const ix = await skillKeyIndex(repo, schoolId);
  const list = await masterSkills(repo, schoolId, { withQuestionsOnly: true });
  return new Set(list.map((k) => ix.keyOf.get(k.id)).filter(Boolean)).size;
}

/** Migrates one school (students in batches of 50) and keeps the counts per status for the System check page. */
export async function migrateSchool(repo: Repo, schoolId: string, now = new Date(), batch = 50): Promise<MigrationReport> {
  const students = (await repo.findMany("Student", { schoolId, deletedAt: null }, { select: ["id"] })).map((x) => s(x.id));
  const ix = await skillKeyIndex(repo, schoolId);
  let written = 0;
  for (let i = 0; i < students.length; i += batch) written += await recomputeStudents(repo, schoolId, students.slice(i, i + batch), now, { index: ix });
  const universe = await skillUniverse(repo, schoolId).catch(() => 0);
  const counts = students.length ? await statusCountsOf(repo, students, universe) : emptyCounts();
  const report: MigrationReport = { at: now.toISOString(), students: students.length, written, counts, universe };
  await repo.upsert("SchoolSetting", { schoolId, key: MIGRATION_KEY }, { schoolId, key: MIGRATION_KEY, value: report }, { value: report });
  return report;
}
async function statusCountsOf(repo: Repo, students: string[], universe: number): Promise<StatusCounts> {
  const { statusCounts } = await import("./status");
  const c = emptyCounts();
  for (let i = 0; i < students.length; i += 400) { const part = await statusCounts(repo, students.slice(i, i + 400)); for (const k of Object.keys(c) as StarStatus[]) c[k] += part[k]; }
  const started = c.IN_PROGRESS + c.MASTERED + c.NEXT_LEVEL + c.NEEDS_REVIEW;
  c.NOT_STARTED = Math.max(0, universe * students.length - started);
  return c;
}

/** The last migration report of a school (null: never run). */
export async function migrationReport(repo: Repo, schoolId: string): Promise<MigrationReport | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: MIGRATION_KEY }, { select: ["value"] }))[0];
  const v = row?.value;
  const x = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  return x && typeof x === "object" ? (x as MigrationReport) : null;
}

/** Students per batch of the background job (r68: 25, each batch reads only these students' answers). */
export const STARS_BATCH = 25;

/**
 * ⭐ The same migration as a light background job (src/server/jobs/runner.ts): students in batches of 25 by id (the
 * cursor is the last student id, saved after every batch, so a restart resumes), then the report of migrateSchool.
 * Same result as migrateSchool. A school migrated before (it has a report) is skipped, as before.
 */
export const STARS_JOB: JobDef<string> = {
  name: "skill-stars",
  version: "r67",
  async skip(repo, schoolId) { return Boolean(await migrationReport(repo, schoolId)); },
  async step(repo, schoolId, after, _state, now) {
    const ids = (await repo.findMany("Student", { schoolId, deletedAt: null, ...(after ? { id: { gt: after } } : {}) }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: STARS_BATCH })).map((x) => s(x.id));
    if (!ids.length) return { cursor: after, done: true };
    const written = await recomputeStudents(repo, schoolId, ids, now);
    return { cursor: ids[ids.length - 1], done: ids.length < STARS_BATCH, progress: { students: ids.length, written } };
  },
  async finish(repo, schoolId, state, now) {
    const universe = await skillUniverse(repo, schoolId).catch(() => 0);
    const counts = emptyCounts();
    let after: string | null = null, students = 0;
    // the counts, 400 students at a time (never every student's rows at once)
    for (let guard = 0; guard < 10_000; guard++) {
      const ids: string[] = (await repo.findMany("Student", { schoolId, deletedAt: null, ...(after ? { id: { gt: after } } : {}) }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: 400 })).map((x) => s(x.id));
      if (!ids.length) break;
      students += ids.length;
      const { statusCounts } = await import("./status");
      const part = await statusCounts(repo, ids);
      for (const k of Object.keys(counts) as StarStatus[]) counts[k] += part[k];
      after = ids[ids.length - 1];
      if (ids.length < 400) break;
    }
    const started = counts.IN_PROGRESS + counts.MASTERED + counts.NEXT_LEVEL + counts.NEEDS_REVIEW;
    counts.NOT_STARTED = Math.max(0, universe * students - started);
    const report: MigrationReport = { at: now.toISOString(), students, written: Number(state.progress.written ?? 0), counts, universe };
    await repo.upsert("SchoolSetting", { schoolId, key: MIGRATION_KEY }, { schoolId, key: MIGRATION_KEY, value: report }, { value: report });
    return { students, written: report.written };
  },
};

/** First start: every school that has never been migrated, through the job runner (one batch at a time). Never throws. */
export async function migrateOnce(repo: Repo): Promise<number> {
  try {
    const { runJobEverywhere } = await import("../jobs/runner");
    return (await runJobEverywhere(repo, STARS_JOB)).filter((o) => o.ran).length;
  } catch { return 0; }
}

/** Admin "Run again" (System check). */
export async function runMigration(repo: Repo, actor: Actor, now = new Date()): Promise<MigrationReport> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins only.");
  return migrateSchool(repo, actor.schoolId!, now);
}

/** Admin "Compute skill stars again" (r68): queued as the background job (returns at once; System check shows it). */
export async function queueMigration(repo: Repo, actor: Actor): Promise<void> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins only.");
  const { enqueueJob } = await import("../jobs/runner");
  enqueueJob(repo, STARS_JOB, actor.schoolId!, { force: true });
}

/** The counts line of the System check page: "☆ x · ◐ y · ⭐ z · ☆⬆ 0 · 🔄 0". */
export const countsLine = (c: StatusCounts): string => `☆ ${c.NOT_STARTED} · ◐ ${c.IN_PROGRESS} · ⭐ ${c.MASTERED} · ☆⬆ ${c.NEXT_LEVEL} · 🔄 ${c.NEEDS_REVIEW}`;
