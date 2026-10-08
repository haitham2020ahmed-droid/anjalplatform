/**
 * 📋 Personalized Plan (the school's own format, generated from MAP data): per class and subject, students in
 * three groups by NWEA achievement percentile (Below < 41st · On 41st–60th · Above > 60th — one rule for every
 * class, no overlapping or missing ranges); each group's Academic Goals = its 3 weakest goal areas with the
 * class grade's skills and CCSS standards; Areas of Strength = its 2 strongest areas; resources and progress
 * monitoring use the platform's adaptive tools.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { ritView } from "./rit";
import { gradeAreaSkills } from "./recommend";

const s = (v: unknown) => String(v ?? "");
export type Band = "BELOW" | "ON" | "ABOVE";
export const BAND_RULE: Record<Band, string> = { BELOW: "below the 41st percentile", ON: "41st–60th percentile", ABOVE: "above the 60th percentile" };
export function bandOf(percentile: number | null, diffFromNational: number | null): Band {
  if (percentile !== null) return percentile < 41 ? "BELOW" : percentile <= 60 ? "ON" : "ABOVE";
  if (diffFromNational !== null) return diffFromNational < -5 ? "BELOW" : diffFromNational <= 5 ? "ON" : "ABOVE";
  return "ON";
}

export interface PlanGoal { area: string; areaId: string; meanRit: number | null; skills: { id: string; name: string; standards: string[] }[] }
export interface PlanBand {
  band: Band; ritRange: string | null;
  students: { studentId: string; name: string; rit: number; projection: number | null; percentile: number | null; rapidGuess: number | null }[];
  goals: PlanGoal[]; strengths: PlanGoal[]; resources: string[]; monitoring: string[];
}
export interface PersonalPlan { classId: string; className: string; grade: number; teacher: string; subject: "READING" | "LANGUAGE"; term: string | null; bands: PlanBand[]; notTested: string[] }

const RESOURCES: Record<Band, string[]> = {
  BELOW: ["🔁 Adaptive practice starting at Below Level, with the 🛟 support path (same skill, grade below)", "⭐ ReadMaster Below versions at the student's Lexile, with 🔊 Listen", "Small-group re-teaching of the goal skills; personalized worksheets"],
  ON: ["🔁 Adaptive practice On → Above Level", "⭐ ReadMaster On-level versions; 🎮 Live games for review", "Quizzes and personalized worksheets on the goal skills"],
  ABOVE: ["🔁 Adaptive practice Above Level with the 🚀 challenge path (same skill, grade above)", "⭐ ReadMaster Above versions; extension texts", "Peer leaders in 🎮 Live games; independent projects"],
};
const MONITORING = ["Platform: mastery and the adaptive path of each assignment (reports)", "Quizzes and personalized worksheets", "MAP Winter results against the Spring projection"];

export async function personalPlan(repo: Repo, actor: Actor, classId: string, subject: "READING" | "LANGUAGE", term?: string): Promise<PersonalPlan> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const klass = (await repo.findUnique("Class", { id: classId }))!;
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ct = (await repo.findMany("ClassTeacher", { classId }))[0];
  const tu = ct ? await repo.findUnique("User", { id: (await repo.findUnique("Teacher", { id: ct.teacherId }))?.userId }) : null;
  const v = await ritView(repo, actor, { classId, term, subject });
  // goal-area RITs of the term for these students (this subject only)
  const ids = v.rows.map((r) => r.studentId);
  const subjRe = subject === "READING" ? /read/i : /language/i;
  const goalRows = ids.length ? (await repo.findMany("MapResult", { studentId: { in: ids } })).filter((g) => g.goalName && subjRe.test(s(g.subject)) && (!v.term || s(g.termName) === v.term)) : [];
  const areaSkills = await gradeAreaSkills(repo, actor.schoolId!, grade);
  const allSkillIds = areaSkills.flatMap((a) => a.skills.map((k) => k.id));
  const links = allSkillIds.length ? await repo.findMany("SkillStandard", { skillId: { in: allSkillIds } }) : [];
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : [];
  const stdOf = (skillId: string) => [...new Set(links.filter((l) => s(l.skillId) === skillId).map((l) => s(stds.find((x) => x.id === l.standardId)?.code).replace(/^CCSS\.ELA-LITERACY\./, "")).filter(Boolean))];
  const areas = await repo.findMany("MapGoalArea", { subject: subject === "READING" ? "READING" : "LANGUAGE_USAGE" }, { select: ["id", "name"] });
  const bands: PlanBand[] = (["BELOW", "ON", "ABOVE"] as Band[]).map((band) => {
    const rows = v.rows.filter((r) => bandOf(r.national?.percentile ?? null, r.national?.diff ?? null) === band);
    const mine = new Set(rows.map((r) => r.studentId));
    const scored = areas.map((a) => {
      const vals = goalRows.filter((g) => mine.has(s(g.studentId)) && s(g.goalAreaId) === s(a.id)).map((g) => Number(g.rit));
      const sk = areaSkills.find((x) => x.areaId === s(a.id))?.skills ?? [];
      return { area: s(a.name), areaId: s(a.id), meanRit: vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null, skills: sk.slice(0, 4).map((k) => ({ ...k, standards: stdOf(k.id) })) };
    });
    // NWEA's 2–5 / 6+ tests report one “Literary Text” (or “Informational Text”, “Writing”) score that was spread
    // over the platform's finer areas: areas of one family with the very same scores become ONE goal
    const valuesOf = (areaId: string) => goalRows.filter((g) => mine.has(s(g.studentId)) && s(g.goalAreaId) === areaId).map((g) => `${s(g.studentId)}:${g.rit}`).sort().join("|");
    const merged: PlanGoal[] = [];
    for (const x of scored) {
      const fam = x.area.split(":")[0];
      const twin = merged.find((m) => m.area.split(":")[0] === fam && m.meanRit === x.meanRit && valuesOf(m.areaId.split("+")[0]) === valuesOf(x.areaId) && x.meanRit !== null);
      if (twin) { twin.area = `${fam}: ${twin.area.slice(fam.length + 2)} · ${x.area.slice(fam.length + 2)}`; twin.areaId += `+${x.areaId}`; twin.skills = [...twin.skills, ...x.skills].slice(0, 4); }
      else merged.push({ ...x, skills: [...x.skills] });
    }
    const withData = merged.filter((x) => x.meanRit !== null).sort((a, b) => a.meanRit! - b.meanRit!);
    // no goal-area data yet: every area of the subject is a goal (weakest first is unknown)
    const goals = withData.length ? withData.slice(0, 3) : merged.slice(0, 3);
    const strengths = withData.length > 3 ? withData.slice(-2).reverse() : [];
    const rits = rows.map((r) => r.rit);
    return {
      band, ritRange: rits.length ? `${Math.min(...rits)}–${Math.max(...rits)}` : null,
      students: rows.map((r) => ({ studentId: r.studentId, name: r.name, rit: r.rit, projection: r.projection, percentile: r.national?.percentile ?? null, rapidGuess: r.rapidGuess })).sort((a, b) => a.rit - b.rit),
      goals, strengths, resources: RESOURCES[band], monitoring: MONITORING,
    };
  });
  // class members with no score for this subject and term (to test)
  const scored = new Set(ids);
  const members = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)).filter((x) => !scored.has(x));
  const mstudents = members.length ? await repo.findMany("Student", { id: { in: members } }, { select: ["id", "userId"] }) : [];
  const musers = mstudents.length ? await repo.findMany("User", { id: { in: mstudents.map((x) => x.userId) } }, { select: ["displayName"] }) : [];
  return { classId, className: s(klass.name), grade, teacher: s(tu?.displayName ?? ""), subject, term: v.term, bands, notTested: musers.map((u) => s(u.displayName)).sort() };
}
