/**
 * 🚨 Needs Attention (Teacher Home): the teacher's own students who need them now, in plain words.
 *   - no practice in NO_PRACTICE_DAYS days or more (or never practised)
 *   - stuck on a skill: STUCK_QUESTIONS+ questions answered on it and its score still under STUCK_SCORE (not mastered)
 * Plus the home's three small numbers: my students, work sent this week, needs attention.
 * Bounded: the teacher's classes, their students' mastery rows, the week's assignments. Own classes only.
 */
import type { Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { accessibleClasses } from "./assign";
import { studentNames } from "../insights/student-data";
import { isHiddenSkill } from "../skills/master";

export const NO_PRACTICE_DAYS = 7;
export const STUCK_QUESTIONS = 15;
export const STUCK_SCORE = 50;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const time = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : String(v)).getTime() : 0);
const CHUNK = 400;
async function inChunks<T>(ids: string[], f: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await f(ids.slice(i, i + CHUNK))));
  return out;
}

export interface AttentionStudent {
  studentId: string; name: string; classId: string; className: string;
  /** "NO_PRACTICE" (with the days, null = never) and/or the skills the student is stuck on */
  idleDays: number | null; neverPractised: boolean; stuck: { skillId: string; skill: string; questions: number; score: number }[];
}
export interface TeacherHomeSummary { students: number; workThisWeek: number; needsAttention: number; list: AttentionStudent[] }

export async function teacherHomeSummary(repo: Repo, actor: Actor, now = new Date()): Promise<TeacherHomeSummary> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return { students: 0, workThisWeek: 0, needsAttention: 0, list: [] };
  const classIds = classes.map((c) => s(c.id));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [members, week] = await Promise.all([
    repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId"] }),
    repo.count("Assignment", { classId: { in: classIds }, deletedAt: null, createdAt: { gte: weekAgo } }),
  ]);
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return { students: 0, workThisWeek: week, needsAttention: 0, list: [] };
  const [mastery, names] = await Promise.all([
    inChunks(ids, (part) => repo.findMany("StudentSkillMastery", { studentId: { in: part } }, { select: ["studentId", "skillId", "score", "attempts", "isMastered", "lastPracticedAt"] })),
    studentNames(repo, ids),
  ]);
  const last = new Map<string, number>();
  const stuckRows = new Map<string, Row[]>();
  for (const m of mastery) {
    const id = s(m.studentId);
    const t = time(m.lastPracticedAt);
    if (t > (last.get(id) ?? 0)) last.set(id, t);
    if (Number(m.attempts ?? 0) >= STUCK_QUESTIONS && Number(m.score ?? 0) < STUCK_SCORE && !m.isMastered) stuckRows.set(id, [...(stuckRows.get(id) ?? []), m]);
  }
  const stuckSkillIds = [...new Set([...stuckRows.values()].flat().map((m) => s(m.skillId)))];
  const skills = stuckSkillIds.length ? await repo.findMany("Skill", { id: { in: stuckSkillIds } }, { select: ["id", "name", "code"] }) : [];
  // the holding skill for unsorted Curriculum Map questions is never shown as a skill
  const skillName = new Map(skills.filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)]));
  for (const [id, list] of stuckRows) stuckRows.set(id, list.filter((m) => skillName.has(s(m.skillId))));
  const classOf = new Map<string, Row>();
  for (const m of members) if (!classOf.has(s(m.studentId))) classOf.set(s(m.studentId), classes.find((c) => s(c.id) === s(m.classId))!);
  const limit = now.getTime() - NO_PRACTICE_DAYS * 86_400_000;
  const list: AttentionStudent[] = [];
  for (const id of ids) {
    const t = last.get(id) ?? 0;
    const idle = t === 0 || t <= limit;
    const stuck = (stuckRows.get(id) ?? []).map((m) => ({ skillId: s(m.skillId), skill: skillName.get(s(m.skillId)) ?? "Skill", questions: Number(m.attempts), score: Math.round(Number(m.score)) }))
      .sort((a, b) => a.score - b.score).slice(0, 3);
    if (!idle && !stuck.length) continue;
    const k = classOf.get(id);
    list.push({ studentId: id, name: names.get(id)?.name ?? "Student", classId: s(k?.id), className: s(k?.name), idleDays: t ? Math.floor((now.getTime() - t) / 86_400_000) : null, neverPractised: t === 0, stuck: idle && !stuck.length ? [] : stuck });
  }
  // stuck first (they are trying and need help), then the longest without practice
  list.sort((a, b) => Number(b.stuck.length > 0) - Number(a.stuck.length > 0) || (b.idleDays ?? 9999) - (a.idleDays ?? 9999) || a.name.localeCompare(b.name));
  return { students: ids.length, workThisWeek: week, needsAttention: list.length, list };
}
