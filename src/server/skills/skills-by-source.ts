/**
 * ⭐ Skills "by source": which program produced the skill a student practised — the grade's
 * book Curriculum, MAP Growth goal areas, Grammar, RTI/Intervention, or ReadMaster (the
 * school's NAFS-style reading-comprehension articles) — each with a star/mastery rating,
 * a progress-direction arrow per skill (↑/→/↓, the exact PAIRED skill growth figure the
 * student/class growth reports already use — see analytics/growth.ts), and a cross-source
 * summary. No new numbers: every value is StudentSkillMastery or SkillGrowth already stored.
 *
 * A skill is placed in exactly one source, by priority (most specific first): Grammar
 * (Skill.domain) → ReadMaster (the skill is a ReadMasterArticle's target skill) → RTI (an
 * InterventionAlert was raised on it for this student) → MAP (it belongs to one of the
 * grade's MAP Growth goal areas) → Curriculum (the grade's book units, the default).
 */
import type { Period } from "../../analytics/periods";
import { studentGrowth } from "../analytics/growth";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { gradeAreaSkills } from "../map/recommend";
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);

export type SkillSource = "CURRICULUM" | "MAP" | "GRAMMAR" | "READMASTER" | "RTI";
export const SOURCE_LABEL: Record<SkillSource, string> = {
  CURRICULUM: "Curriculum",
  MAP: "MAP Growth",
  GRAMMAR: "Grammar",
  READMASTER: "ReadMaster (NAFS-style)",
  RTI: "RTI / Intervention",
};
export const SOURCE_ORDER: SkillSource[] = ["CURRICULUM", "MAP", "GRAMMAR", "READMASTER", "RTI"];

export type Trend = "UP" | "DOWN" | "FLAT";
export interface SourceSkillRow {
  skillId: string; name: string; score: number; stars: number; band: string; attempts: number; accuracyPct: number;
  trend: Trend | null; trendValue: number | null;
}
export interface SourceGroup {
  source: SkillSource; label: string; skills: SourceSkillRow[]; avgMastery: number | null; stars: number;
  mastered: number; developing: number; needsSupport: number;
}
export interface BySourceReport {
  studentId: string;
  groups: SourceGroup[];
  summary: { totalSkills: number; avgMastery: number | null; mastered: number; developing: number; needsSupport: number; up: number; down: number; flat: number };
}

/** 1-5 stars from a 0-100 mastery score (20 points per star, same bands the skill tables use). */
export const starsFor = (score: number): number => Math.max(1, Math.min(5, Math.ceil(score / 20)));

/** One source per skill, by priority. `skillIds` are the skills to classify (usually: the ones the student has mastery rows for). */
export async function classifySkillSources(repo: Repo, schoolId: string, grade: number, studentId: string, skillIds: string[]): Promise<Map<string, SkillSource>> {
  const out = new Map<string, SkillSource>();
  if (!skillIds.length) return out;
  const [skills, mapAreas, rti, nafs] = await Promise.all([
    repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "domain"] }),
    gradeAreaSkills(repo, schoolId, grade, true),
    repo.findMany("InterventionAlert", { studentId, skillId: { in: skillIds } }, { select: ["skillId"] }),
    repo.findMany("ReadMasterArticle", { skillId: { in: skillIds } }, { select: ["skillId"] }),
  ]);
  const mapSet = new Set(mapAreas.flatMap((a) => a.skills.map((k) => k.id)));
  const rtiSet = new Set(rti.map((r) => s(r.skillId)));
  const nafsSet = new Set(nafs.map((r) => s(r.skillId)));
  for (const k of skills) {
    const id = s(k.id);
    if (s(k.domain) === "GRAMMAR") out.set(id, "GRAMMAR");
    else if (nafsSet.has(id)) out.set(id, "READMASTER");
    else if (rtiSet.has(id)) out.set(id, "RTI");
    else if (mapSet.has(id)) out.set(id, "MAP");
    else out.set(id, "CURRICULUM");
  }
  return out;
}

const BAND_OF = (score: number): string => (score >= 80 ? "Mastered" : score >= 60 ? "Proficient" : score >= 40 ? "Approaching" : "Developing");

export async function bySourceReport(repo: Repo, actor: Actor, studentId: string, period: Period): Promise<BySourceReport> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const grade = Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0);
  const mastery = (await repo.findMany("StudentSkillMastery", { studentId })).filter((m) => num(m.attempts) > 0);
  const skillIds = mastery.map((m) => s(m.skillId));
  const [skillRows, sourceOf, growth] = await Promise.all([
    skillIds.length ? repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] }) : Promise.resolve([] as Row[]),
    classifySkillSources(repo, s(st.schoolId), grade, studentId, skillIds),
    studentGrowth(repo, studentId, period),
  ]);
  const nameOf = new Map(skillRows.map((k) => [s(k.id), s(k.name)]));
  const growthOf = new Map(growth.skills.map((g) => [g.skillId, g]));
  const groups: SourceGroup[] = SOURCE_ORDER.map((source) => {
    const rows: SourceSkillRow[] = mastery
      .filter((m) => sourceOf.get(s(m.skillId)) === source)
      .map((m) => {
        const score = Math.round(num(m.score));
        const g = growthOf.get(s(m.skillId)) ?? null;
        const trend: Trend | null = g ? (g.growth > 1 ? "UP" : g.growth < -1 ? "DOWN" : "FLAT") : null;
        return {
          skillId: s(m.skillId), name: nameOf.get(s(m.skillId)) ?? "", score, stars: starsFor(score), band: BAND_OF(score),
          attempts: num(m.attempts), accuracyPct: num(m.attempts) ? Math.round((100 * num(m.correct)) / num(m.attempts)) : 0,
          trend, trendValue: g ? g.growth : null,
        };
      })
      .sort((a, b) => a.score - b.score);
    const avgMastery = rows.length ? Math.round(rows.reduce((t, r) => t + r.score, 0) / rows.length) : null;
    return {
      source, label: SOURCE_LABEL[source], skills: rows, avgMastery, stars: avgMastery !== null ? starsFor(avgMastery) : 0,
      mastered: rows.filter((r) => r.score >= 80).length, developing: rows.filter((r) => r.score >= 40 && r.score < 80).length, needsSupport: rows.filter((r) => r.score < 40).length,
    };
  }).filter((g) => g.skills.length > 0);
  const all = groups.flatMap((g) => g.skills);
  return {
    studentId,
    groups,
    summary: {
      totalSkills: all.length, avgMastery: all.length ? Math.round(all.reduce((t, r) => t + r.score, 0) / all.length) : null,
      mastered: all.filter((r) => r.score >= 80).length, developing: all.filter((r) => r.score >= 40 && r.score < 80).length, needsSupport: all.filter((r) => r.score < 40).length,
      up: all.filter((r) => r.trend === "UP").length, down: all.filter((r) => r.trend === "DOWN").length, flat: all.filter((r) => r.trend === "FLAT").length,
    },
  };
}
