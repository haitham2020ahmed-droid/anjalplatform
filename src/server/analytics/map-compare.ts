/**
 * MAP Growth vs platform, side by side (never converted into each other).
 * For the student's latest imported test per subject: overall RIT, then each goal's RIT
 * with the platform mastery of the skills mapped to that goal area.
 * "Relative weakness" = the goal RIT is below the student's overall RIT by more than the
 * goal's standard error (or 3 RIT when no error is given) — a within-student comparison,
 * no national norms involved.
 */
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";

export interface MapGoalComparison {
  goalName: string;
  areaName: string | null;
  goalRit: number;
  overallRit: number;
  relativeWeakness: boolean;
  platformMastery: number | null;
  platformSkills: { skillId: string; name: string; mastery: number }[];
  recommendation: "Additional practice recommended" | "On track" | "Not enough platform data";
}

export interface MapComparison {
  subject: string;
  testDate: string;
  termName: string | null;
  overallRit: number;
  percentile: number | null;
  goals: MapGoalComparison[];
}

const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

/** Latest-test goal areas (codes) where MAP shows a relative weakness — feeds recommendations. */
export async function weakMapGoalAreas(repo: Repo, studentId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const c of await compareRaw(repo, studentId)) for (const g of c.goals) if (g.relativeWeakness && g.areaCode) out.add(g.areaCode);
  return out;
}

async function compareRaw(repo: Repo, studentId: string) {
  const results = await repo.findMany("MapResult", { studentId });
  if (!results.length) return [];
  const areas = await repo.findMany("MapGoalArea");
  const st = (await repo.findUnique("Student", { id: studentId }))!;
  const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
  const skills = cur ? await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }) : [];
  const families = skills.length ? await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((s) => s.familyId))] } }) : [];
  const mastery = await repo.findMany("StudentSkillMastery", { studentId });
  const out = [];
  for (const subject of [...new Set(results.map((r) => String(r.subject)))]) {
    const ofSubject = results.filter((r) => r.subject === subject);
    const latest = Math.max(...ofSubject.map((r) => d(r.testDate).getTime()));
    const test = ofSubject.filter((r) => d(r.testDate).getTime() === latest);
    const overall = test.find((r) => !r.goalName);
    if (!overall) continue;
    const goals = test.filter((r) => r.goalName).map((g) => {
      const area = areas.find((a) => a.id === g.goalAreaId);
      const famIds = new Set(families.filter((f) => area && f.mapGoalAreaId === area.id).map((f) => String(f.id)));
      const inArea = skills.filter((s) => famIds.has(String(s.familyId)));
      const practised = inArea.map((s) => ({ s, m: mastery.find((m) => m.skillId === s.id && Number(m.attempts) > 0) })).filter((x) => x.m);
      const platformMastery = practised.length ? Math.round(practised.reduce((t, x) => t + Number(x.m!.score), 0) / practised.length) : null;
      const margin = g.ritSE !== null && g.ritSE !== undefined ? Number(g.ritSE) : 3;
      const relativeWeakness = Number(g.rit) < Number(overall.rit) - margin;
      const recommendation: MapGoalComparison["recommendation"] =
        relativeWeakness || (platformMastery !== null && platformMastery < 60) ? "Additional practice recommended" : platformMastery === null ? "Not enough platform data" : "On track";
      return {
        goalName: String(g.goalName), areaName: area ? String(area.name) : null, areaCode: area ? String(area.code) : null,
        goalRit: Number(g.rit), overallRit: Number(overall.rit), relativeWeakness, platformMastery,
        platformSkills: practised.map((x) => ({ skillId: String(x.s.id), name: String(x.s.name), mastery: Math.round(Number(x.m!.score)) })),
        recommendation,
      };
    });
    out.push({ subject, testDate: d(overall.testDate).toISOString().slice(0, 10), termName: overall.termName ? String(overall.termName) : null, overallRit: Number(overall.rit), percentile: overall.achievementPercentile === null || overall.achievementPercentile === undefined ? null : Number(overall.achievementPercentile), goals });
  }
  return out;
}

export async function mapComparison(repo: Repo, actor: Actor, studentId: string): Promise<MapComparison[]> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: String(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  return (await compareRaw(repo, studentId)).map((c) => ({ ...c, goals: c.goals.map(({ areaCode: _a, ...g }) => g) }));
}
