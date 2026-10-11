/**
 * 🕳 Question-bank gaps: per grade and MAP goal area, the published questions available (on the area's skills)
 * against the students whose weakest area it is (latest term). Shows where to write questions first.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { gradeAreaSkills } from "./recommend";

const s = (v: unknown) => String(v ?? "");
export interface GapRow { grade: number; area: string; subject: string; questions: number; skills: number; studentsWeakest: number; perStudent: number | null; status: "GAP" | "LOW" | "OK" }

export async function bankGaps(repo: Repo, actor: Actor): Promise<GapRow[]> {
  assertCan(actor, "questions:read");
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] })).map((g) => Number(g.level)).filter((g) => g > 0).sort();
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "name", "subject"] });
  const students = await repo.findMany("Student", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "gradeId"] });
  const gradeRows = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] });
  const levelOf = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const goals = students.length ? (await repo.findMany("MapResult", { studentId: { in: students.map((x) => x.id) } })).filter((r) => r.goalName && r.goalAreaId) : [];
  // each student's weakest area per subject (latest term of that student)
  const weakest = new Map<string, number>(); // `${grade}|${areaId}` → students
  for (const st of students) {
    const mine = goals.filter((g) => g.studentId === st.id);
    if (!mine.length) continue;
    const latest = mine.reduce((x, g) => (s(g.termName) > x ? s(g.termName) : x), "");
    for (const subj of ["READING", "LANGUAGE_USAGE"]) {
      const ofSubj = mine.filter((g) => s(g.termName) === latest && areas.find((a) => a.id === g.goalAreaId)?.subject === subj);
      if (!ofSubj.length) continue;
      const w = ofSubj.reduce((x, g) => (Number(g.rit) < Number(x.rit) ? g : x));
      const key = `${levelOf.get(s(st.gradeId))}|${s(w.goalAreaId)}`;
      weakest.set(key, (weakest.get(key) ?? 0) + 1);
    }
  }
  const rows: GapRow[] = [];
  for (const g of grades) {
    const as = await gradeAreaSkills(repo, actor.schoolId!, g, true);
    for (const a of areas) {
      const sk = as.find((x) => x.areaId === s(a.id))?.skills ?? [];
      const questions = sk.length ? await repo.count("Question", { skillId: { in: sk.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }) : 0;
      const need = weakest.get(`${g}|${s(a.id)}`) ?? 0;
      const perStudent = need ? Math.round((questions / need) * 10) / 10 : null;
      rows.push({ grade: g, area: s(a.name), subject: s(a.subject) === "READING" ? "Reading" : "Language Usage", questions, skills: sk.length, studentsWeakest: need, perStudent, status: questions === 0 ? "GAP" : need && questions < need * 5 ? "LOW" : "OK" });
    }
  }
  return rows.sort((a, b) => a.grade - b.grade || ({ GAP: 0, LOW: 1, OK: 2 }[a.status] - { GAP: 0, LOW: 1, OK: 2 }[b.status]) || b.studentsWeakest - a.studentsWeakest);
}

export interface PracticeGap { skillId: string; skill: string; times: number; students: number; lowestAbility: number | null }

/**
 * 🕳 Practice gaps (readiness I-22): skills where the adaptive selector found no question within reach of a student
 * (last 30 days; AdaptiveDecisionLog reason NO_ITEM_IN_RANGE). These are the skills that need easier questions.
 */
export async function practiceGaps(repo: Repo, actor: Actor, now = new Date()): Promise<PracticeGap[]> {
  assertCan(actor, "questions:read");
  const students = await repo.findMany("Student", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id"] });
  if (!students.length) return [];
  const logs: Record<string, unknown>[] = [];
  for (let i = 0; i < students.length; i += 500) {
    logs.push(...await repo.findMany("AdaptiveDecisionLog", { studentId: { in: students.slice(i, i + 500).map((x) => x.id) }, reasonCode: "NO_ITEM_IN_RANGE", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, { select: ["studentId", "skillId", "previousTheta"] }));
  }
  const by = new Map<string, { times: number; who: Set<string>; low: number | null }>();
  for (const l of logs) {
    const k = s(l.skillId); if (!k) continue;
    const v = by.get(k) ?? { times: 0, who: new Set<string>(), low: null };
    v.times++; v.who.add(s(l.studentId));
    const th = Number(l.previousTheta); if (Number.isFinite(th)) v.low = v.low === null ? th : Math.min(v.low, th);
    by.set(k, v);
  }
  if (!by.size) return [];
  const skills = await repo.findMany("Skill", { id: { in: [...by.keys()] } }, { select: ["id", "name"] });
  return [...by].map(([id, v]) => ({ skillId: id, skill: s(skills.find((k) => k.id === id)?.name) || "Skill", times: v.times, students: v.who.size, lowestAbility: v.low === null ? null : Math.round(v.low * 100) / 100 }))
    .sort((a, b) => b.students - a.students || b.times - a.times).slice(0, 30);
}

export interface LevelGap { grade: number; skillId: string; skill: string; below: number; on: number; above: number; total: number; missing: ("Below" | "On" | "Above")[] }
/** published questions a skill needs at each level for adaptive practice to stay within reach (Update 39C) */
export const MIN_PER_LEVEL = 3;
/** the authoring difficulty (1–7, 4 = grade level) read as the student's level: 1–3 Below, 4 On, 5–7 Above */
export const levelOfDifficulty = (d: number): "Below" | "On" | "Above" => (d <= 3 ? "Below" : d >= 5 ? "Above" : "On");

/**
 * 🕳 Levels lacking items (Update 39C, readiness E10 / samples A05): per grade and skill, published questions at
 * Below / On / Above difficulty; a skill is listed when a level has fewer than MIN_PER_LEVEL. Hidden and writing skills
 * (no auto-scored items) are left out. One query for the questions.
 */
export async function levelGaps(repo: Repo, actor: Actor): Promise<LevelGap[]> {
  assertCan(actor, "questions:read");
  const grades = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) }, isActive: true }, { select: ["id", "gradeId"] }) : [];
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const skills = curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "code", "category", "isActive", "curriculumId"] }))
    .filter((k) => k.isActive !== false && !s(k.code).endsWith(".curriculum-map-unclassified") && s(k.category) !== "WRITING") : [];
  if (!skills.length) return [];
  const qs: Record<string, unknown>[] = [];
  for (let i = 0; i < skills.length; i += 500) qs.push(...await repo.findMany("Question", { skillId: { in: skills.slice(i, i + 500).map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "difficultyLevel"] }));
  const count = new Map<string, { Below: number; On: number; Above: number }>();
  for (const q of qs) { const c = count.get(s(q.skillId)) ?? { Below: 0, On: 0, Above: 0 }; c[levelOfDifficulty(Number(q.difficultyLevel) || 4)]++; count.set(s(q.skillId), c); }
  return skills.map((k) => {
    const c = count.get(s(k.id)) ?? { Below: 0, On: 0, Above: 0 };
    const missing = (["Below", "On", "Above"] as const).filter((l) => c[l] < MIN_PER_LEVEL);
    return { grade: gradeOfCur.get(s(k.curriculumId)) ?? 0, skillId: s(k.id), skill: s(k.name), below: c.Below, on: c.On, above: c.Above, total: c.Below + c.On + c.Above, missing: [...missing] };
  }).filter((r) => r.missing.length).sort((a, b) => a.grade - b.grade || b.missing.length - a.missing.length || a.total - b.total || a.skill.localeCompare(b.skill));
}
