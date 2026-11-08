/**
 * 🚨 Needs Attention (Teacher Home): the teacher's own students who need them now, in plain words.
 *   - no practice in NO_PRACTICE_DAYS days or more (or never practised)
 *   - stuck on a skill: ⭐ stars only (owner, 1 Nov 2026) — the skill's star is ◐ In progress with STUCK_QUESTIONS+
 *     practice answers and a star score still under STUCK_SCORE; one row per skill KEY, never a skill with ⭐
 *     (and 🔄 is already in the star list). "Last practised" = the last answer of any source (practiceStats).
 * Plus the home's three small numbers: my students, work sent this week, needs attention.
 * Bounded: the teacher's classes, their students' last 30 days of answers (25 at a time), the week's assignments.
 * Own classes only.
 */
import type { Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { accessibleClasses } from "./assign";
import { practiceStats, studentNames } from "../insights/student-data";
import { isHiddenSkill } from "../skills/master";
import { starAttention, type StarAttention } from "../skills/status-extras";
import { starBook, starLearning } from "../skills/star-read";
import type { StarView } from "../skills/status";
import { safeIfBehind } from "../db/schema-errors";
import { cancelIndex, liveAssignmentWhere } from "../student/cancelled-work";

export const NO_PRACTICE_DAYS = 7;
export const STUCK_QUESTIONS = 15;
export const STUCK_SCORE = 50;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const time = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : String(v)).getTime() : 0);

export interface AttentionStudent {
  studentId: string; name: string; classId: string; className: string;
  /** "NO_PRACTICE" (with the days, null = never) and/or the skills the student is stuck on */
  idleDays: number | null; neverPractised: boolean; stuck: { skillId: string; skill: string; questions: number; score: number }[];
  /** ⭐ skill stars: stuck at ◐ 7+ days, 50 questions without mastery, a new 🔄 (skills/status-extras.ts) */
  stars?: StarAttention[];
}
export interface TeacherHomeSummary { students: number; workThisWeek: number; needsAttention: number; list: AttentionStudent[] }

export async function teacherHomeSummary(repo: Repo, actor: Actor, now = new Date(), opts: { classId?: string } = {}): Promise<TeacherHomeSummary> {
  // 🩹 platform audit (8 Nov 2026, live): the Class snapshot of ONE class read the whole school for an admin (60 s+) —
  // a class can be given, and then only that class is read
  const classes = (await accessibleClasses(repo, actor)).filter((c) => !opts.classId || s(c.id) === opts.classId);
  if (!classes.length) return { students: 0, workThisWeek: 0, needsAttention: 0, list: [] };
  const classIds = classes.map((c) => s(c.id));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  // r78: "work this week" counts only live work (not cancelled on Assigned) — a bounded read, then the cancels
  const [members, weekRows, ix] = await Promise.all([
    repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId"] }),
    repo.findMany("Assignment", liveAssignmentWhere({ classId: { in: classIds }, createdAt: { gte: weekAgo } }), { select: ["id", "testId", "curriculumPlanId"], take: 2000 }),
    cancelIndex(repo, actor.schoolId ?? s(classes[0]?.schoolId)),
  ]);
  const week = weekRows.filter((a) => ix.live(a)).length;
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return { students: 0, workThisWeek: week, needsAttention: 0, list: [] };
  // 📏 round 4: last active = the last answer of ANY source (bank answers incl. tests, NAFS, ReadRise), as practiceStats
  // gives it (the last 30 days read 25 students at a time; older: the last practised date) — not every engine row
  const [practice, names, starList, book] = await Promise.all([
    practiceStats(repo, ids, now, { recentOnly: true }),
    studentNames(repo, ids),
    safeIfBehind("home.stars", () => starAttention(repo, s(actor.schoolId ?? classes[0]?.schoolId), ids, now), [] as StarAttention[]),
    starBook(repo, ids, s(actor.schoolId ?? classes[0]?.schoolId)),
  ]);
  const starsOf = new Map<string, StarAttention[]>();
  for (const x of starList) starsOf.set(x.studentId, [...(starsOf.get(x.studentId) ?? []), x]);
  const last = new Map<string, number>();
  const stuckRows = new Map<string, { skillId: string; v: StarView }[]>();
  for (const id of ids) { const t = time(practice.get(id)?.lastActive); if (t) last.set(id, t); }
  // ⭐ stuck = ◐ with STUCK_QUESTIONS+ answers and a star score under STUCK_SCORE (one per key; never ⭐)
  for (const id of ids) for (const v of (book.byKey.get(id) ?? new Map<string, StarView>()).values()) {
    if (!starLearning(v) || v.answered < STUCK_QUESTIONS || v.score >= STUCK_SCORE) continue;
    const skillId = v.skillId ?? book.ix.skillsOf.get(v.key)?.[0];
    if (skillId) stuckRows.set(id, [...(stuckRows.get(id) ?? []), { skillId, v }]);
  }
  const stuckSkillIds = [...new Set([...stuckRows.values()].flat().map((m) => m.skillId))];
  const skills = stuckSkillIds.length ? await repo.findMany("Skill", { id: { in: stuckSkillIds } }, { select: ["id", "name", "code"] }) : [];
  // the holding skill for unsorted Curriculum Map questions is never shown as a skill
  const skillName = new Map(skills.filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)]));
  for (const [id, list] of stuckRows) stuckRows.set(id, list.filter((m) => skillName.has(m.skillId)));
  const classOf = new Map<string, Row>();
  for (const m of members) if (!classOf.has(s(m.studentId))) classOf.set(s(m.studentId), classes.find((c) => s(c.id) === s(m.classId))!);
  const limit = now.getTime() - NO_PRACTICE_DAYS * 86_400_000;
  const list: AttentionStudent[] = [];
  for (const id of ids) {
    const t = last.get(id) ?? 0;
    const idle = t === 0 || t <= limit;
    const stuck = (stuckRows.get(id) ?? []).map((m) => ({ skillId: m.skillId, skill: book.ix.nameOf.get(m.v.key) ?? skillName.get(m.skillId) ?? "Skill", questions: m.v.answered, score: m.v.score }))
      .sort((a, b) => a.score - b.score).slice(0, 3);
    const stars = starsOf.get(id) ?? [];
    if (!idle && !stuck.length && !stars.length) continue;
    const k = classOf.get(id);
    list.push({ studentId: id, name: names.get(id)?.name ?? "Student", classId: s(k?.id), className: s(k?.name), idleDays: t ? Math.floor((now.getTime() - t) / 86_400_000) : null, neverPractised: t === 0, stuck: idle && !stuck.length ? [] : stuck, ...(stars.length ? { stars } : {}) });
  }
  // stuck first (they are trying and need help), then the longest without practice
  list.sort((a, b) => Number(Boolean(b.stars?.length)) - Number(Boolean(a.stars?.length)) || Number(b.stuck.length > 0) - Number(a.stuck.length > 0) || (b.idleDays ?? 9999) - (a.idleDays ?? 9999) || a.name.localeCompare(b.name));
  return { students: ids.length, workThisWeek: week, needsAttention: list.length, list };
}
