/**
 * 📋 Personalized Plan (the school's own format, generated from MAP data): per class and subject, students in
 * three groups by NWEA achievement percentile (Below < 41st · On 41st–60th · Above > 60th — one rule for every
 * class, no overlapping or missing ranges); each group's Academic Goals = its 3 weakest goal areas with the
 * class grade's skills and CCSS standards; Areas of Strength = its 2 strongest areas; resources and progress
 * monitoring use the platform's adaptive tools.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { ritView } from "./rit";
import { gradeAreaSkills } from "./recommend";
import { contModels, continuumFor, continuumIndex, groupOfGoal, hasContinuum, type ContinuumIndex } from "./continuum";
import { mapCache, MAP_KEEP_MS } from "./map-cache";

const s = (v: unknown) => String(v ?? "");
export type Band = "BELOW" | "ON" | "ABOVE";
export const BAND_RULE: Record<Band, string> = { BELOW: "below the 41st percentile", ON: "41st–60th percentile", ABOVE: "above the 60th percentile" };
// 🐛 fix (audit finding, Oct 2026 — same incident as the Grade 11 national-norms gap): when neither a percentile
// nor a diff-from-national is available (no national norm at all for that grade/season — e.g. a grade national-
// norms.ts doesn't cover yet, or one an admin hasn't filled in on the MAP RIT page), this used to default EVERY
// such student to "ON" — a silent, uniform, wrong answer for the whole class. Now falls back to the class's own
// vsClass (ritView's RitRow.vsClass, already computed from RIT vs. class average, ±CLASS_BAND_RIT) — the same
// "no national norm" fallback planLevelOf() (map-reports.ts) already uses — so students actually spread out by
// how they compare to their own classmates instead of being bucketed together by a constant.
export function bandOf(percentile: number | null, diffFromNational: number | null, vsClass: "ABOVE" | "AT" | "BELOW" | null = null): Band {
  if (percentile !== null) return percentile < 41 ? "BELOW" : percentile <= 60 ? "ON" : "ABOVE";
  if (diffFromNational !== null) return diffFromNational < -5 ? "BELOW" : diffFromNational <= 5 ? "ON" : "ABOVE";
  if (vsClass !== null) return vsClass === "ABOVE" ? "ABOVE" : vsClass === "BELOW" ? "BELOW" : "ON";
  return "ON";
}

/** What happened since the decision: the group's answers on this goal's standards (last 28 days). */
export interface GoalResult { practiced: number; students: number; answers: number; accuracy: number | null; trend: number | null }
/** One statement of the MAP Growth Learning Continuum, shown as-is (no platform skill behind it — just the RIT-band text). */
export interface ContinuumFocusItem { text: string; standards: string[] }
export interface PlanGoal {
  area: string; areaId: string; meanRit: number | null; skills: { id: string; name: string; standards: string[] }[]; result?: GoalResult;
  /** What the Learning Continuum itself lists at this band (its own words): never capped to the platform's own skill count, so a goal
   *  area with only a few platform skills still shows everything the continuum says is relevant at this RIT. Empty with no continuum, or
   *  nothing imported for this goal area yet. */
  continuumFocus: ContinuumFocusItem[];
}

/**
 * Within a goal area's candidate skills, the ones the MAP Growth Learning Continuum lists as active (Reinforce
 * or Develop) at this RIT come first — so "the same goal area" differentiates by band instead of always handing
 * out the same first few skills. No continuum, no matching goal-area group, no RIT, or nothing active at that
 * RIT: the original (unordered) list, unchanged — never fewer skills than before.
 */
export function continuumOrder<T extends { id: string }>(ix: ContinuumIndex | null, areaName: string, rit: number | null, sk: T[]): T[] {
  const group = groupOfGoal(areaName);
  const s2 = (v: unknown) => String(v ?? "");
  if (!ix || !group || rit === null || !ix.rows.some((r) => groupOfGoal(s2(r.goalArea)) === group)) return sk;
  const v = continuumFor(ix, group, rit);
  const active = new Set<string>();
  for (const stage of [v.reinforce, v.develop]) for (const stmt of stage?.statements ?? []) for (const k of stmt.skills) active.add(k.id);
  if (!active.size) return sk;
  return [...sk.filter((k) => active.has(k.id)), ...sk.filter((k) => !active.has(k.id))];
}

/**
 * What the Learning Continuum itself says at this exact RIT, for a goal area — its own statements (Develop, the
 * band the RIT falls in; Reinforce, the band below), in the continuum's own words with their CCSS codes. This is
 * never limited by how many skills the school happens to already have on the platform for this goal area: a goal
 * area with only 3–4 platform skills still shows everything the continuum lists at this RIT, so two bands that
 * are genuinely different always read as different, even when the platform's own skill set is thin. No continuum,
 * no matching group, no RIT, or nothing listed at this RIT: an empty list (nothing invented).
 */
export function continuumFocusFor(ix: ContinuumIndex | null, areaName: string, rit: number | null, max = 6): ContinuumFocusItem[] {
  const group = groupOfGoal(areaName);
  if (!ix || !group || rit === null) return [];
  const v = continuumFor(ix, group, rit);
  const out: ContinuumFocusItem[] = [];
  for (const stage of [v.develop, v.reinforce]) for (const stmt of stage?.statements ?? []) {
    if (out.some((x) => x.text.toLowerCase() === stmt.text.toLowerCase())) continue;
    out.push({ text: stmt.text, standards: stmt.standards });
    if (out.length >= max) return out;
  }
  return out;
}

/** A MAP goal area ↔ the CCSS standards that measure it (questions are linked to areas by their standard). */
export function areaMatchesStandard(area: string, code: string): boolean {
  const c = code.replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase();
  if (/literary/i.test(area)) return /^RL\./.test(c) && !/^RL\.\d+\.4$/.test(c);
  if (/informational/i.test(area)) return /^RI\./.test(c) && !/^RI\.\d+\.4$/.test(c);
  if (/vocabulary/i.test(area)) return /^L\.\d+\.[456]/.test(c) || /^R[LI]\.\d+\.4$/.test(c);
  if (/grammar|usage/i.test(area)) return /^L\.\d+\.1/.test(c);
  if (/mechanic/i.test(area)) return /^L\.\d+\.2/.test(c);
  if (/writ/i.test(area)) return /^W\./.test(c) || /^L\.\d+\.3/.test(c);
  return false;
}
export interface PlanBand {
  band: Band; ritRange: string | null;
  /** level moves of the group's students in their adaptive sets (last 28 days) */
  moves: { up: number; down: number };
  students: { studentId: string; name: string; rit: number; projection: number | null; percentile: number | null; rapidGuess: number | null }[];
  goals: PlanGoal[]; strengths: PlanGoal[]; resources: string[]; monitoring: string[];
}
/** One MAP instructional (goal) area's class-wide average, across every student with a score — not limited to a band's 3 weakest. */
export interface AreaBreakdownRow { area: string; meanRit: number | null; students: number }
/** NWEA's own five national-percentile bands (not the school's 3 BELOW/ON/ABOVE bands), for the whole-class chart. */
export type PercentileRange = ">80" | "61-80" | "41-60" | "21-40" | "<21";
export interface PercentileRangeRow { range: PercentileRange; count: number }
export interface PersonalPlan {
  classId: string; className: string; grade: number; teacher: string; subject: "READING" | "LANGUAGE"; term: string | null; bands: PlanBand[]; notTested: string[];
  classAverageRit: number | null;
  /** NWEA's published national average RIT for this grade, season and subject (same source as each student's own national comparison) — one overall number; NWEA does not publish a national average per instructional area, so this isn't repeated per area. */
  nationalAverageRit: number | null;
  /** Every instructional area (not just the 3 weakest per band) with the whole class's average RIT, weakest first. */
  areaBreakdown: AreaBreakdownRow[];
  /** The same, per individual student (studentId → every instructional area's own RIT for that one student), for
   *  the one-student Personalized Plan view. Only students with at least one MAP score for this subject/term. */
  studentAreaBreakdown: Record<string, AreaBreakdownRow[]>;
  /** How many of this class's scored students fall in each NWEA national-percentile range (>80 / 61–80 / 41–60 /
   *  21–40 / <21), fixed order, for the whole-class "percentile distribution" chart. Recomputed from the live
   *  roster and latest MAP scores every time this plan is generated, so it tracks students/data as they change.
   *  Students with no national percentile (no national norm for this grade/term) aren't counted in any range. */
  percentileDistribution: PercentileRangeRow[];
}

const PERCENTILE_RANGES: PercentileRange[] = [">80", "61-80", "41-60", "21-40", "<21"];
function percentileRangeOf(p: number): PercentileRange {
  return p > 80 ? ">80" : p >= 61 ? "61-80" : p >= 41 ? "41-60" : p >= 21 ? "21-40" : "<21";
}
/** Buckets a set of national percentiles into NWEA's five standard ranges, in fixed display order. */
function percentileDistributionOf(percentiles: number[]): PercentileRangeRow[] {
  const counts = new Map<PercentileRange, number>(PERCENTILE_RANGES.map((r) => [r, 0]));
  for (const p of percentiles) counts.set(percentileRangeOf(p), (counts.get(percentileRangeOf(p)) ?? 0) + 1);
  return PERCENTILE_RANGES.map((range) => ({ range, count: counts.get(range) ?? 0 }));
}

const RESOURCES: Record<Band, string[]> = {
  BELOW: ["🔁 Adaptive practice starting at Approaching, with the 🛟 support path (same skill, grade below)", "⭐ ReadMaster Approaching versions at the student's Lexile, with 🔊 Listen", "Small-group re-teaching of the goal skills; personalized worksheets"],
  ON: ["🔁 Adaptive practice Meeting → Exceeding", "⭐ ReadMaster Meeting versions; 🎮 Live games for review", "Quizzes and personalized worksheets on the goal skills"],
  ABOVE: ["🔁 Adaptive practice at Exceeding with the 🚀 challenge path (same skill, grade above)", "⭐ ReadMaster Exceeding versions; extension texts", "Peer leaders in 🎮 Live games; independent projects"],
};
const MONITORING = ["Platform: mastery and the adaptive path of each assignment (reports)", "Quizzes and personalized worksheets", "MAP Winter results against the Spring projection"];

// ⚡ Oct 2026 (server-stability audit, r79): a whole-class computation (every member's MAP + 28-day practice +
// level-change log), but called PER STUDENT — a Final Report pulls it twice (Reading + Language) just to read one
// student's row, and a teacher opening Personalized Plan for each student of a class in turn reruns the entire
// class's numbers from scratch every time, with nothing shared between those calls. The result only depends on
// classId/subject/term (access is already checked above, every call, before the cache is even consulted), so it's
// identical for every student of the same class and every actor permitted to see it.
const personalPlanCache = mapCache<PersonalPlan>("map.personal-plan.personalPlan", MAP_KEEP_MS, 60);
// same bug found in studyPlan's own cache (map-reports.ts), fixed the same way: personalPlan() also consults
// hasContinuum()/continuumIndex() (whether the school's Learning Continuum covers this grade/subject), which reads
// LearningStatement — missing from the first model list here too. contModels() (continuum.ts) covers it (plus
// SkillStandard/Standard/the skill bank, already listed by hand below — kept for the models contModels doesn't cover).
// Built lazily (on first use, not at module load) — see the matching note in map-reports.ts's studyPlanModels():
// calling contModels() while map-plan.ts/continuum.ts are still initializing each other can hit a TDZ error.
let personalPlanModelsCache: string[] | null = null;
const personalPlanModels = (): string[] => (personalPlanModelsCache ??= ["MapResult", "ClassMembership", "QuestionAttempt", "AuditLog", "MapGoalArea", "Class", "ClassTeacher", "Teacher", "User", "Student", "SchoolSetting", ...contModels()]);

export async function personalPlan(repo: Repo, actor: Actor, classId: string, subject: "READING" | "LANGUAGE", term?: string): Promise<PersonalPlan> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const key = `${classId}|${subject}|${term ?? ""}`;
  return structuredClone(await personalPlanCache.get(repo, key, personalPlanModels(), () => personalPlanNow(repo, actor, classId, subject, term)));
}

async function personalPlanNow(repo: Repo, actor: Actor, classId: string, subject: "READING" | "LANGUAGE", term?: string): Promise<PersonalPlan> {
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
  // 📈 results since the decisions: answers of the last 28 days, each linked to its standard
  const now = new Date(), d28 = new Date(now.getTime() - 28 * 86_400_000), d14 = now.getTime() - 14 * 86_400_000;
  const atts = ids.length ? await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: d28 } }, { select: ["studentId", "questionId", "isCorrect", "createdAt"] }) : [];
  const aq = atts.length ? await repo.findMany("Question", { id: { in: [...new Set(atts.map((a) => s(a.questionId)))] } }, { select: ["id", "standardId"] }) : [];
  const astd = aq.length ? await repo.findMany("Standard", { id: { in: [...new Set(aq.map((q) => s(q.standardId)).filter(Boolean))] } }, { select: ["id", "code"] }) : [];
  const codeOfQ = new Map(aq.map((q) => [s(q.id), s(astd.find((x) => x.id === q.standardId)?.code)]));
  const tms = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const resultOf = (area: string, members: Set<string>): GoalResult => {
    const mine = atts.filter((a) => members.has(s(a.studentId)) && areaMatchesStandard(area, codeOfQ.get(s(a.questionId)) ?? ""));
    const acc = (xs: typeof mine) => (xs.length ? Math.round((100 * xs.filter((a) => a.isCorrect).length) / xs.length) : null);
    const recent = mine.filter((a) => tms(a.createdAt) >= d14), older = mine.filter((a) => tms(a.createdAt) < d14);
    const a1 = acc(recent), a0 = acc(older);
    return { practiced: new Set(mine.map((a) => s(a.studentId))).size, students: members.size, answers: mine.length, accuracy: acc(mine), trend: a1 !== null && a0 !== null && recent.length >= 5 && older.length >= 5 ? a1 - a0 : null };
  };
  const logs = ids.length ? (await repo.findMany("AuditLog", { entityType: "Student", action: "level.change", createdAt: { gte: d28 } })).filter((l) => ids.includes(s(l.entityId)) && (l.after as Record<string, unknown>)?.outcome === "CHANGED") : [];
  // the continuum (if the school imported NWEA's), to pick each band's skills by RIT rather than always the same ones
  const contIx = (await hasContinuum(repo, subject)) ? await continuumIndex(repo, actor.schoolId!, grade, subject) : null;
  const RANK: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
  const bands: PlanBand[] = (["BELOW", "ON", "ABOVE"] as Band[]).map((band) => {
    const rows = v.rows.filter((r) => bandOf(r.national?.percentile ?? null, r.national?.diff ?? null, r.vsClass) === band);
    const mine = new Set(rows.map((r) => r.studentId));
    const bandRits = rows.map((r) => r.rit);
    const midRit = bandRits.length ? Math.round((Math.min(...bandRits) + Math.max(...bandRits)) / 2) : null;
    const scored = areas.map((a) => {
      const vals = goalRows.filter((g) => mine.has(s(g.studentId)) && s(g.goalAreaId) === s(a.id)).map((g) => Number(g.rit));
      const sk = areaSkills.find((x) => x.areaId === s(a.id))?.skills ?? [];
      const meanRit = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
      const ordered = continuumOrder(contIx, s(a.name), meanRit ?? midRit, sk);
      const continuumFocus = continuumFocusFor(contIx, s(a.name), meanRit ?? midRit);
      return { area: s(a.name), areaId: s(a.id), meanRit, skills: ordered.slice(0, 4).map((k) => ({ ...k, standards: stdOf(k.id) })), continuumFocus };
    });
    // NWEA's 2–5 / 6+ tests report one “Literary Text” (or “Informational Text”, “Writing”) score that was spread
    // over the platform's finer areas: areas of one family with the very same scores become ONE goal
    const valuesOf = (areaId: string) => goalRows.filter((g) => mine.has(s(g.studentId)) && s(g.goalAreaId) === areaId).map((g) => `${s(g.studentId)}:${g.rit}`).sort().join("|");
    const merged: PlanGoal[] = [];
    for (const x of scored) {
      const fam = x.area.split(":")[0];
      const twin = merged.find((m) => m.area.split(":")[0] === fam && m.meanRit === x.meanRit && valuesOf(m.areaId.split("+")[0]) === valuesOf(x.areaId) && x.meanRit !== null);
      if (twin) {
        twin.area = `${fam}: ${twin.area.slice(fam.length + 2)} · ${x.area.slice(fam.length + 2)}`; twin.areaId += `+${x.areaId}`; twin.skills = [...twin.skills, ...x.skills].slice(0, 4);
        for (const f of x.continuumFocus) if (!twin.continuumFocus.some((y) => y.text.toLowerCase() === f.text.toLowerCase())) twin.continuumFocus.push(f);
      } else merged.push({ ...x, skills: [...x.skills], continuumFocus: [...x.continuumFocus] });
    }
    const withData = merged.filter((x) => x.meanRit !== null).sort((a, b) => a.meanRit! - b.meanRit!);
    // no goal-area data yet: every area of the subject is a goal (weakest first is unknown)
    const goals = withData.length ? withData.slice(0, 3) : merged.slice(0, 3);
    const strengths = withData.length > 3 ? withData.slice(-2).reverse() : [];
    const rits = bandRits;
    for (const g of [...goals, ...strengths]) g.result = resultOf(g.area, mine);
    let up = 0, down = 0;
    for (const l of logs) if (mine.has(s(l.entityId))) {
      const from = RANK[s(((l.before ?? {}) as Record<string, unknown>).level)], to = RANK[s(((l.after ?? {}) as Record<string, unknown>).level)];
      if (from !== undefined && to !== undefined) { if (to > from) up++; else if (to < from) down++; }
    }
    return {
      band, ritRange: rits.length ? `${Math.min(...rits)}–${Math.max(...rits)}` : null, moves: { up, down },
      students: rows.map((r) => ({ studentId: r.studentId, name: r.name, rit: r.rit, projection: r.projection, percentile: r.national?.percentile ?? null, rapidGuess: r.rapidGuess })).sort((a, b) => a.rit - b.rit),
      goals, strengths, resources: RESOURCES[band], monitoring: MONITORING,
    };
  });
  // class members with no score for this subject and term (to test)
  const scored = new Set(ids);
  const members = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)).filter((x) => !scored.has(x));
  const mstudents = members.length ? await repo.findMany("Student", { id: { in: members } }, { select: ["id", "userId"] }) : [];
  const musers = mstudents.length ? await repo.findMany("User", { id: { in: mstudents.map((x) => x.userId) } }, { select: ["displayName"] }) : [];
  const classAverageRit = v.rows.length ? Math.round(v.rows.reduce((n, r) => n + r.rit, 0) / v.rows.length) : null;
  const nationalAverageRit = v.norm ? Math.round(v.norm.mean) : null;
  // every instructional area (not just each band's 3 weakest) for a set of students — same family-merge the per-band
  // goals use, so NWEA's one combined "Literary Text" / "Informational Text" / "Writing" score isn't shown twice
  // under two platform sub-areas. `members: null` = every student with a score (the whole-class breakdown).
  const areaBreakdown = areaBreakdownOf(areas, goalRows, null);
  // the SAME breakdown, per individual student (owner: "Instructional Areas" in the one-student Personalized Plan
  // too, not just the whole-class view) — every goal area's own RIT for that one student, "students" always 0 or 1.
  const studentAreaBreakdown: Record<string, AreaBreakdownRow[]> = {};
  for (const id of ids) studentAreaBreakdown[id] = areaBreakdownOf(areas, goalRows, new Set([id]));
  const percentileDistribution = percentileDistributionOf(v.rows.map((r) => r.national?.percentile ?? null).filter((x): x is number => x !== null));
  return { classId, className: s(klass.name), grade, teacher: s(tu?.displayName ?? ""), subject, term: v.term, bands, notTested: musers.map((u) => s(u.displayName)).sort(), classAverageRit, nationalAverageRit, areaBreakdown, studentAreaBreakdown, percentileDistribution };
}

/** The whole-class (members: null) or one student's/group's (members: a set of studentIds) RIT per instructional
 *  (goal) area, weakest first — areas NWEA reports as one combined score across the platform's finer sub-areas are
 *  merged back into one row (same signature: same students, same RIT). */
function areaBreakdownOf(areas: Row[], goalRows: Row[], members: Set<string> | null): AreaBreakdownRow[] {
  const inScope = (g: Row) => !members || members.has(s(g.studentId));
  const sigOf = (areaId: string) => goalRows.filter((g) => inScope(g) && s(g.goalAreaId) === areaId).map((g) => `${s(g.studentId)}:${g.rit}`).sort().join("|");
  const raw = areas.map((a) => {
    const vals = goalRows.filter((g) => inScope(g) && s(g.goalAreaId) === s(a.id)).map((g) => Number(g.rit));
    return { area: s(a.name), areaId: s(a.id), meanRit: vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null, students: vals.length };
  });
  // 🐛 fix (audit finding, Oct 2026): each `out` row now carries its own `sig`, computed once from its ORIGINAL
  // (pre-merge) areaId. The old code re-derived a twin's signature by looking its already-merged display name back
  // up in `raw` (`raw.find(r => r.area === m.area)!.areaId`) — that lookup assumed `m.area` still matched an
  // unmerged raw name. True for the first merge, but a THIRD area merging into an already-merged pair never matches
  // (the display name was rewritten to "Fam: A · B" on the first merge), so `raw.find(...)` returned undefined and
  // `.areaId` crashed the whole report ("Cannot read properties of undefined (reading 'areaId')") — reproducible
  // whenever 3+ sub-areas of one family share the same mean RIT and the same set of students (rare for Reading's
  // richer goal-area set, common for Language Usage's few areas on a small roster, e.g. a Personalized Plan for a
  // student with sparse MAP Language data). Storing each entry's own signature up front removes the lookup.
  const out: (AreaBreakdownRow & { sig: string })[] = [];
  for (const x of raw) {
    const fam = x.area.split(":")[0];
    const xSig = sigOf(x.areaId);
    const twin = out.find((m) => m.area.split(":")[0] === fam && m.meanRit === x.meanRit && x.meanRit !== null && m.sig === xSig);
    if (twin) twin.area = `${fam}: ${twin.area.slice(fam.length + 2)} · ${x.area.slice(fam.length + 2)}`;
    else out.push({ area: x.area, meanRit: x.meanRit, students: x.students, sig: xSig });
  }
  out.sort((a, b) => (a.meanRit ?? Infinity) - (b.meanRit ?? Infinity) || a.area.localeCompare(b.area));
  return out.map(({ area, meanRit, students }) => ({ area, meanRit, students }));
}
