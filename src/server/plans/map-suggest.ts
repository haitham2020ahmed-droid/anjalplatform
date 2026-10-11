/**
 * MAP plan suggestion: for each chosen student, their LOWEST MAP sub-areas (goal-area RITs of the latest term of
 * the subject) and, inside each, the grade's skills with questions where the student's mastery is lowest.
 * The teacher then removes / adds skills, previews and sends (send.ts). Changes nothing.
 *
 * A student whose MAP file had no goal areas gets the areas by lowest mastery instead (every area, weakest first);
 * a student with no score for the subject is listed apart. Access: the teacher's own class (assertClassAccess).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { gradeAreaSkills } from "../map/recommend";
import type { PlanSkill } from "./send";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export type MapSubject = "READING" | "LANGUAGE";
const isSubject = (subject: MapSubject, v: unknown) => (subject === "READING" ? /read/i.test(s(v)) : /lang/i.test(s(v)));

export interface GoalRow { areaId: string | null; name: string; rit: number }

/** The lowest `n` sub-areas of one test (lowest RIT first; ties by name). */
export function lowestAreas(goals: GoalRow[], n = 2): GoalRow[] {
  const seen = new Set<string>();
  return [...goals].sort((a, b) => a.rit - b.rit || a.name.localeCompare(b.name)).filter((g) => {
    const k = g.areaId ?? g.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, n);
}

export interface MapSuggestion {
  classId: string; className: string; grade: number; subject: MapSubject;
  students: { id: string; name: string }[];
  /** per student: overall RIT and their lowest sub-areas */
  rows: { studentId: string; name: string; rit: number | null; areas: { name: string; rit: number | null }[] }[];
  skills: PlanSkill[];
  noScores: string[];
}

/** Suggests a MAP plan for a class, a group or one student (empty studentIds = the whole class). */
export async function suggestMapPlan(repo: Repo, actor: Actor, input: { classId: string; studentIds?: string[]; subject?: MapSubject; areasPerStudent?: number; skillsPerArea?: number }): Promise<MapSuggestion> {
  assertCan(actor, "assignments:create");
  if (!input.classId) throw new ValidationError("Choose a class.");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const subject: MapSubject = input.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const chosen = [...new Set((input.studentIds ?? []).filter(Boolean))];
  for (const id of chosen) if (!members.includes(id)) throw new ForbiddenError("You can only send work to students in this class.");
  const recipients = chosen.length ? chosen : members;
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const stRows = recipients.length ? await repo.findMany("Student", { id: { in: recipients } }, { select: ["id", "userId"] }) : [];
  const users = stRows.length ? await repo.findMany("User", { id: { in: stRows.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(stRows.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  const [results, mastery, areaSkills, areaRows] = await Promise.all([
    recipients.length ? repo.findMany("MapResult", { studentId: { in: recipients } }, { select: ["studentId", "subject", "goalName", "goalAreaId", "rit", "termName", "testDate"] }) : Promise.resolve([] as Row[]),
    recipients.length ? repo.findMany("StudentSkillMastery", { studentId: { in: recipients } }, { select: ["studentId", "skillId", "score"] }) : Promise.resolve([] as Row[]),
    gradeAreaSkills(repo, s(klass.schoolId), grade),
    repo.findMany("MapGoalArea", {}, { select: ["id", "subject"] }),
  ]);
  const areaSubject = new Map(areaRows.map((a) => [s(a.id), s(a.subject)]));
  // only this subject's areas (READING vs LANGUAGE_USAGE)
  const subjectAreas = areaSkills.filter((a) => isSubject(subject, areaSubject.get(a.areaId) ?? ""));
  const perArea = Math.max(1, Math.min(5, Math.round(input.skillsPerArea ?? 2)));
  const nAreas = Math.max(1, Math.min(4, Math.round(input.areasPerStudent ?? 2)));
  const wanted = new Map<string, PlanSkill>();
  const rows: MapSuggestion["rows"] = [];
  const noScores: string[] = [];
  for (const id of recipients) {
    const mine = results.filter((r) => s(r.studentId) === id && isSubject(subject, r.subject)).sort((a, b) => time(b.testDate) - time(a.testDate));
    if (!mine.length) { noScores.push(nameOf.get(id) ?? "Student"); continue; }
    const overall = mine.find((r) => !r.goalName);
    const term = s(overall?.termName ?? mine[0].termName) || null;
    const goals: GoalRow[] = mine.filter((r) => r.goalName && (!term || s(r.termName) === term)).map((r) => ({ areaId: r.goalAreaId ? s(r.goalAreaId) : null, name: s(r.goalName), rit: Number(r.rit) }));
    const m = new Map(mastery.filter((x) => s(x.studentId) === id).map((x) => [s(x.skillId), Number(x.score)]));
    // the lowest sub-areas → the platform's areas (by id, else by name)
    // matched by the goal-area id; a goal without one by its name (whole name first, then a long prefix)
    const match = (g: GoalRow) => g.areaId ? subjectAreas.find((a) => a.areaId === g.areaId)
      : subjectAreas.find((a) => a.area.toLowerCase() === g.name.toLowerCase()) ?? subjectAreas.find((a) => a.area.toLowerCase().slice(0, 30) === g.name.toLowerCase().slice(0, 30));
    const picked: { area: (typeof subjectAreas)[number]; rit: number | null }[] = goals.length
      ? lowestAreas(goals.filter((g) => match(g)), nAreas).map((g) => ({ area: match(g)!, rit: g.rit }))
      : [...subjectAreas].map((a) => ({ area: a, rit: null as number | null, avg: a.skills.reduce((t, k) => t + (m.get(k.id) ?? 0), 0) / Math.max(1, a.skills.length) }))
        .sort((x, y) => x.avg - y.avg || x.area.area.localeCompare(y.area.area)).slice(0, nAreas);
    rows.push({ studentId: id, name: nameOf.get(id) ?? "Student", rit: overall ? Number(overall.rit) : null, areas: picked.map((p) => ({ name: p.area.area, rit: p.rit })) });
    for (const p of picked) {
      const skills = [...p.area.skills].sort((x, y) => (m.get(x.id) ?? -1) - (m.get(y.id) ?? -1) || x.name.localeCompare(y.name)).slice(0, perArea);
      for (const k of skills) {
        const w = wanted.get(k.id) ?? { id: k.id, name: k.name, reason: `MAP: ${p.area.area}`, studentIds: [], grade };
        if (!w.studentIds.includes(id)) w.studentIds.push(id);
        wanted.set(k.id, w);
      }
    }
  }
  return {
    classId: s(klass.id), className: s(klass.name), grade, subject,
    students: recipients.map((id) => ({ id, name: nameOf.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
    rows: rows.sort((a, b) => (a.rit ?? 999) - (b.rit ?? 999) || a.name.localeCompare(b.name)),
    skills: [...wanted.values()].map((w) => ({ ...w, studentIds: w.studentIds.sort() })),
    noScores,
  };
}
