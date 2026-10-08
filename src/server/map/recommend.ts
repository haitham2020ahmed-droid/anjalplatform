/**
 * MAP recommendations from the scores: for each student, the weakest MAP goal areas (their goal RITs from the
 * MAP file when present; otherwise every area) and, inside them, the skills of their grade where their mastery
 * is lowest. Teachers choose and assign; a student with no MAP work sees their own recommendations.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assignSkill } from "../teacher/assign";

const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export interface Recommendation { studentId: string; name: string; rit: number | null; areas: { name: string; rit: number | null }[]; skills: { id: string; name: string; area: string; mastery: number | null }[] }

/** Skills of a grade grouped by MAP goal area (skills with questions to practise). */
async function gradeAreaSkills(repo: Repo, schoolId: string, grade: number): Promise<{ areaId: string; area: string; skills: { id: string; name: string }[] }[]> {
  const gs = await repo.findMany("Grade", { schoolId, level: grade }, { select: ["id"] });
  const curs = gs.length ? await repo.findMany("Curriculum", { gradeId: { in: gs.map((g) => g.id) } }, { select: ["id"] }) : [];
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, isActive: true, deletedAt: null }, { select: ["id", "name", "familyId"] }) : [];
  if (!skills.length) return [];
  const fams = await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "mapGoalAreaId"] });
  const areas = await repo.findMany("MapGoalArea", { id: { in: [...new Set(fams.map((f) => s(f.mapGoalAreaId)).filter(Boolean))] } }, { select: ["id", "name"] });
  const withQ = new Set((await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["skillId"] })).map((q) => s(q.skillId)));
  const areaOf = new Map(fams.map((f) => [s(f.id), s(f.mapGoalAreaId)]));
  return areas.map((a) => ({ areaId: s(a.id), area: s(a.name), skills: skills.filter((k) => areaOf.get(s(k.familyId)) === a.id && withQ.has(s(k.id))).map((k) => ({ id: s(k.id), name: s(k.name) })) })).filter((a) => a.skills.length);
}

async function recommendFor(repo: Repo, studentIds: string[], areaSkills: Awaited<ReturnType<typeof gradeAreaSkills>>, names: Map<string, string>): Promise<Recommendation[]> {
  if (!studentIds.length) return [];
  const [results, mastery, open] = await Promise.all([
    repo.findMany("MapResult", { studentId: { in: studentIds } }),
    repo.findMany("StudentSkillMastery", { studentId: { in: studentIds } }, { select: ["studentId", "skillId", "score"] }),
    repo.findMany("AssignmentStudent", { studentId: { in: studentIds } }, { select: ["studentId", "assignmentId", "status"] }),
  ]);
  const openA = open.filter((o) => o.status !== "COMPLETED");
  const aRows = openA.length ? await repo.findMany("Assignment", { id: { in: [...new Set(openA.map((o) => o.assignmentId))] }, deletedAt: null }, { select: ["id", "skillId", "track"] }) : [];
  return studentIds.map((sid) => {
    const mine = results.filter((r) => s(r.studentId) === sid && /read/i.test(s(r.subject))).sort((a, b) => t(b.testDate) - t(a.testDate));
    const overall = mine.find((r) => !r.goalName);
    const term = overall ? s(overall.termName) : null;
    const goals = mine.filter((r) => r.goalName && (!term || s(r.termName) === term));
    // weakest areas: by goal RIT when the MAP file had goals; otherwise every area (lowest mastery first)
    const rankedAreas = goals.length
      ? areaSkills.map((a) => ({ a, rit: goals.find((g) => s(g.goalAreaId) === a.areaId || s(g.goalName).toLowerCase().startsWith(a.area.toLowerCase().slice(0, 12)))?.rit ?? null })).filter((x) => x.rit !== null).sort((x, y) => Number(x.rit) - Number(y.rit))
      : areaSkills.map((a) => ({ a, rit: null as number | null }));
    const m = new Map(mastery.filter((x) => s(x.studentId) === sid).map((x) => [s(x.skillId), Math.round(Number(x.score))]));
    const assigned = new Set(aRows.filter((a) => openA.some((o) => s(o.studentId) === sid && o.assignmentId === a.id)).map((a) => s(a.skillId)));
    const picks: Recommendation["skills"] = [];
    const areasOut: Recommendation["areas"] = [];
    for (const { a, rit } of (goals.length ? rankedAreas.slice(0, 2) : rankedAreas)) {
      const cand = a.skills.filter((k) => !assigned.has(k.id)).sort((x, y) => (m.get(x.id) ?? -1) - (m.get(y.id) ?? -1) || x.name.localeCompare(y.name)).slice(0, 2);
      if (!cand.length) continue;
      areasOut.push({ name: a.area, rit: rit === null ? null : Number(rit) });
      for (const k of cand) picks.push({ id: k.id, name: k.name, area: a.area, mastery: m.get(k.id) ?? null });
      if (picks.length >= 4) break;
    }
    return { studentId: sid, name: names.get(sid) ?? "Student", rit: overall ? Number(overall.rit) : null, areas: areasOut, skills: picks.slice(0, 4) };
  });
}

/** Recommendations for every student of a class who has a MAP score. */
export async function classRecommendations(repo: Repo, actor: Actor, classId: string): Promise<{ className: string; grade: number; rows: Recommendation[]; withoutScore: number }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const members = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const scored = new Set((members.length ? await repo.findMany("MapResult", { studentId: { in: members } }, { select: ["studentId", "subject"] }) : []).filter((r) => /read/i.test(s(r.subject))).map((r) => s(r.studentId)));
  const ids = members.filter((m) => scored.has(m));
  const st = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const names = new Map(st.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  const rows = (await recommendFor(repo, ids, await gradeAreaSkills(repo, actor.schoolId!, grade), names)).sort((a, b) => (a.rit ?? 999) - (b.rit ?? 999));
  return { className: s(klass.name), grade, rows, withoutScore: members.length - ids.length };
}

/** Assigns the chosen (student, skill) pairs as MAP practice. */
export async function assignRecommendations(repo: Repo, actor: Actor, classId: string, picks: { studentId: string; skillId: string }[], dueAt: Date | null = null): Promise<{ assignments: number; students: number }> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  if (!picks.length) throw new ValidationError("Tick at least one recommended skill.");
  const bySkill = new Map<string, string[]>();
  for (const p of picks) bySkill.set(p.skillId, [...(bySkill.get(p.skillId) ?? []), p.studentId]);
  let n = 0;
  for (const [skillId, studentIds] of bySkill) { await assignSkill(repo, actor, { classId, skillId, studentIds: [...new Set(studentIds)], track: "MAP", dueAt, note: "Recommended from your MAP score" }); n++; }
  return { assignments: n, students: new Set(picks.map((p) => p.studentId)).size };
}

/** A student's own recommendations (shown when their MAP area is empty). */
export async function myRecommendations(repo: Repo, actor: Actor): Promise<Recommendation | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  if (!st || !g) return null;
  const r = (await recommendFor(repo, [actor.studentId], await gradeAreaSkills(repo, s(st.schoolId), Number(g.level)), new Map()))[0];
  return r && r.skills.length ? r : null;
}
