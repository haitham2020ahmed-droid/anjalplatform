/**
 * 📊 Practice analytics (IXL-style): for a class (or one student) and any date range —
 *   - usage: questions answered, time spent, active students, accuracy, skills practised / proficient / mastered;
 *   - by day: questions and minutes, at school (Sunday–Thursday 07:00–14:00 Riyadh time) or at home;
 *   - by skill: where the time went (questions, students, accuracy) for the donut and the table;
 *   - per student: the same, plus each skill practised with its questions, time, accuracy, the change from the
 *     first to the last answers in the range, and today's mastery;
 *   - trouble spots: the questions most students missed.
 * Times: each answer counts at most 5 minutes (a student who left the page is not “working” for an hour).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const MAX_MS = 5 * 60_000;
const RIYADH = 3 * 3_600_000;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const mins = (ms: number) => Math.round(ms / 60_000);

/** School time: Sunday–Thursday, 07:00–14:00 in Riyadh. */
export function atSchool(at: Date | string | number): boolean {
  const d = new Date(new Date(at).getTime() + RIYADH);
  const day = d.getUTCDay(), h = d.getUTCHours();
  return day >= 0 && day <= 4 && h >= 7 && h < 14;
}
export const riyadhDay = (at: Date | string | number) => new Date(new Date(at).getTime() + RIYADH).toISOString().slice(0, 10);

export interface SkillUse { skillId: string; name: string; questions: number; correct: number; accuracy: number | null; minutes: number; students: number }
export interface StudentSkill { skillId: string; name: string; questions: number; minutes: number; accuracy: number | null; change: number | null; mastery: number | null; band: string | null; mastered: boolean }
export interface StudentUse { id: string; name: string; questions: number; minutes: number; accuracy: number | null; skills: number; proficient: number; mastered: number; schoolPct: number | null; lastActive: string | null; detail: StudentSkill[] }
export interface DayUse { day: string; questions: number; school: number; home: number; minutes: number }
export interface PracticeAnalytics {
  scope: { classId: string; className: string; studentId: string | null }; from: string; to: string;
  totals: { questions: number; correct: number; accuracy: number | null; minutes: number; activeStudents: number; students: number; skills: number; proficient: number; mastered: number; schoolQuestions: number; homeQuestions: number; avgPerStudent: number | null };
  days: DayUse[]; skills: SkillUse[]; students: StudentUse[];
  trouble: { questionId: string; stem: string; skill: string; missedBy: number; tried: number }[];
}

export async function practiceAnalytics(repo: Repo, actor: Actor, input: { classId: string; from: Date; to: Date; studentId?: string | null }): Promise<PracticeAnalytics> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => c.id === input.classId);
  if (!klass) throw new ForbiddenError("Class not found.");
  let ids = await classMembers(repo, input.classId);
  if (input.studentId) { if (!ids.includes(input.studentId)) throw new ForbiddenError("This student is not in the class."); ids = [input.studentId]; }
  const from = input.from.getTime(), to = input.to.getTime();
  const [names, attempts, mastery] = await Promise.all([
    studentNames(repo, ids),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: input.from, lte: input.to } }, { select: ["studentId", "questionId", "skillId", "isCorrect", "responseMs", "createdAt"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score", "band", "isMastered", "masteredAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const rows = attempts.filter((a) => { const x = t(a.createdAt); return x >= from && x <= to; }).sort((a, b) => t(a.createdAt) - t(b.createdAt));
  const skillIds = [...new Set(rows.map((r) => s(r.skillId)))];
  const skillRows = skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] }) : [];
  const skillName = new Map(skillRows.map((k) => [s(k.id), s(k.name)]));
  const ms = (r: Row) => Math.min(MAX_MS, Math.max(0, Number(r.responseMs) || 0));
  const masteryOf = new Map(mastery.map((m) => [`${s(m.studentId)}|${s(m.skillId)}`, m]));

  // by day
  const dayMap = new Map<string, DayUse>();
  for (const r of rows) {
    const k = riyadhDay(t(r.createdAt));
    const d = dayMap.get(k) ?? { day: k, questions: 0, school: 0, home: 0, minutes: 0 };
    d.questions++; if (atSchool(t(r.createdAt))) d.school++; else d.home++; d.minutes += ms(r) / 60_000;
    dayMap.set(k, d);
  }
  const days = [...dayMap.values()].map((d) => ({ ...d, minutes: Math.round(d.minutes) })).sort((a, b) => a.day.localeCompare(b.day));

  // by skill
  const skills: SkillUse[] = skillIds.map((id) => {
    const mine = rows.filter((r) => s(r.skillId) === id), c = mine.filter((r) => r.isCorrect).length;
    return { skillId: id, name: skillName.get(id) ?? "Skill", questions: mine.length, correct: c, accuracy: pct(c, mine.length), minutes: mins(mine.reduce((x, r) => x + ms(r), 0)), students: new Set(mine.map((r) => s(r.studentId))).size };
  }).sort((a, b) => b.questions - a.questions);

  // per student (and each skill they practised)
  const inRange = (v: unknown) => v && t(v) >= from && t(v) <= to;
  const students: StudentUse[] = ids.map((id) => {
    const mine = rows.filter((r) => s(r.studentId) === id), c = mine.filter((r) => r.isCorrect).length;
    const sk = [...new Set(mine.map((r) => s(r.skillId)))];
    const detail: StudentSkill[] = sk.map((k) => {
      const a = mine.filter((r) => s(r.skillId) === k), m = masteryOf.get(`${id}|${k}`);
      const first = a.slice(0, 5), last = a.slice(-5);
      const change = a.length >= 6 ? (pct(last.filter((r) => r.isCorrect).length, last.length)! - pct(first.filter((r) => r.isCorrect).length, first.length)!) : null;
      return { skillId: k, name: skillName.get(k) ?? "Skill", questions: a.length, minutes: mins(a.reduce((x, r) => x + ms(r), 0)), accuracy: pct(a.filter((r) => r.isCorrect).length, a.length), change, mastery: m ? Math.round(Number(m.score)) : null, band: m ? s(m.band) : null, mastered: Boolean(m?.isMastered) };
    }).sort((a, b) => b.questions - a.questions);
    const last = mine.length ? riyadhDay(t(mine[mine.length - 1].createdAt)) : null;
    return {
      id, name: names.get(id)?.name ?? "Student", questions: mine.length, minutes: mins(mine.reduce((x, r) => x + ms(r), 0)), accuracy: pct(c, mine.length), skills: sk.length,
      proficient: detail.filter((d) => d.band === "PROFICIENT").length, mastered: mastery.filter((m) => s(m.studentId) === id && m.isMastered && inRange(m.masteredAt)).length,
      schoolPct: pct(mine.filter((r) => atSchool(t(r.createdAt))).length, mine.length), lastActive: last, detail,
    };
  }).sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));

  // trouble spots: questions missed by the most students (2+)
  const byQ = new Map<string, { wrong: Set<string>; tried: Set<string>; skillId: string }>();
  for (const r of rows) {
    const q = byQ.get(s(r.questionId)) ?? { wrong: new Set<string>(), tried: new Set<string>(), skillId: s(r.skillId) };
    q.tried.add(s(r.studentId)); if (!r.isCorrect) q.wrong.add(s(r.studentId)); byQ.set(s(r.questionId), q);
  }
  const hard = [...byQ].filter(([, q]) => q.wrong.size >= 2).sort((a, b) => b[1].wrong.size - a[1].wrong.size || b[1].tried.size - a[1].tried.size).slice(0, 8);
  const stems = hard.length ? await repo.findMany("Question", { id: { in: hard.map(([id]) => id) } }, { select: ["id", "stem"] }) : [];
  const trouble = hard.map(([id, q]) => ({ questionId: id, stem: s(stems.find((x) => x.id === id)?.stem).replace(/\s+/g, " ").slice(0, 160), skill: skillName.get(q.skillId) ?? "", missedBy: q.wrong.size, tried: q.tried.size }));

  const correct = rows.filter((r) => r.isCorrect).length, school = rows.filter((r) => atSchool(t(r.createdAt))).length;
  const active = students.filter((x) => x.questions > 0).length;
  return {
    scope: { classId: input.classId, className: s(klass.name), studentId: input.studentId ?? null }, from: input.from.toISOString().slice(0, 10), to: input.to.toISOString().slice(0, 10),
    totals: {
      questions: rows.length, correct, accuracy: pct(correct, rows.length), minutes: mins(rows.reduce((x, r) => x + ms(r), 0)), activeStudents: active, students: ids.length, skills: skillIds.length,
      proficient: students.reduce((x, st) => x + st.proficient, 0), mastered: students.reduce((x, st) => x + st.mastered, 0), schoolQuestions: school, homeQuestions: rows.length - school, avgPerStudent: active ? Math.round(rows.length / active) : null,
    },
    days, skills, students, trouble,
  };
}
