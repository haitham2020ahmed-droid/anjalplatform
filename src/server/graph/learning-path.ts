/**
 * 🧭 The personal learning path: a different journey for every student, decided from
 *   ability (θ) and mastery on every skill · recent mistakes and misconceptions · learning history (answers, speed of
 *   progress: mastery gained per answer in the last 14 days) · the knowledge graph (what each skill stands on) ·
 *   the MAP weakest instructional area · the teacher's assignments · the current unit.
 *
 * Decisions:
 *   SKIP        strong skills (mastery 75+, or ability well above grade with evidence): no basic practice
 *   FOUNDATION  a weak prerequisite of a target skill is practised FIRST (the knowledge graph says it is underneath)
 *   TARGET      the skills with the largest expected gain: need × importance × readiness
 *   REVIEW      a mastered skill whose spaced review is due
 *   STRETCH     a strong student also gets one harder, ready skill ahead of the class
 * Each step has a target difficulty (level 1–7 from the student's ability) and its reasons.
 *
 * `genericPath` is the old behaviour (first unmastered skill in curriculum order), kept for comparison and tests.
 */
import { DEFAULT_MASTERY } from "../../config/engine";
import { thetaToLevel } from "../../recommendations/recommend";
import { misconceptionLabel } from "../../insights/misconceptions";
import type { Repo, Row } from "../seeding/repo";
import { cancelIndex } from "../student/cancelled-work";
import { ancestors, loadGraph, skillStates, tested, weak, type Graph, type SkillState } from "./knowledge-graph";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

export type StepAction = "FOUNDATION" | "TARGET" | "REVIEW" | "STRETCH";
export interface PathStep { skillId: string; name: string; action: StepAction; level: number; score: number; why: string[]; forSkill?: { skillId: string; name: string } }
export interface LearningPath { studentId: string; steps: PathStep[]; skipped: { skillId: string; name: string; why: string }[]; stuck: { skillId: string; name: string }[]; growthPerWeek: number | null }

export interface PathContext {
  graph: Graph;
  states: Map<string, SkillState>;
  /** skills with published questions */
  practicable: Set<string>;
  weakArea: Set<string>;          // skills of the student's weakest MAP area
  assigned: Set<string>;          // skills the teacher assigned (not done)
  currentUnit: Set<string>;       // skills of the current unit
  unitOf: Map<string, number>;    // skill → unit number
  currentUnitNo: number;
  velocity: Map<string, { answers: number; gain: number }>; // last 14 days
  reviewDue: Set<string>;
  /** learned from the school's outcomes (src/server/insights/learning-weights.ts); 1 = neutral */
  weights?: Partial<Record<StepAction, number>>;
}

const strong = (st: SkillState) => st.mastery >= 75 || (st.theta !== null && st.theta >= 1 && st.attempts >= 8);
const stuckOn = (v: { answers: number; gain: number } | undefined, st: SkillState) => !!v && v.answers >= 10 && v.gain < 3 && !st.isMastered;

/** Pure: plans the next `len` steps from the context. */
export function planFromContext(c: PathContext, len = 5): Omit<LearningPath, "studentId" | "growthPerWeek"> {
  const { graph: g, states } = c;
  const st = (id: string) => states.get(id) ?? { mastery: 0, attempts: 0, theta: null, recentErrors: 0, recentAnswers: 0, misconception: null, isMastered: false };
  const skipped: LearningPath["skipped"] = [];
  const stuck: LearningPath["stuck"] = [];
  const cands: { id: string; score: number; why: string[] }[] = [];
  const allTheta = [...states.values()].filter((x) => x.theta !== null && x.attempts >= 5).map((x) => x.theta!);
  const overall = allTheta.length ? allTheta.reduce((a, b) => a + b, 0) / allTheta.length : 0;
  for (const n of g.nodes.values()) {
    if (!c.practicable.has(n.id)) continue;
    const x = st(n.id);
    if (x.isMastered) continue;
    if (strong(x) && !c.assigned.has(n.id)) { skipped.push({ skillId: n.id, name: n.name, why: x.mastery >= 75 ? `Already strong (mastery ${Math.round(x.mastery)})` : "Works well above grade level here" }); continue; }
    const why: string[] = [];
    const need = 1 - x.mastery / 100;
    let importance = 1;
    if (c.weakArea.has(n.id)) { importance += 0.6; why.push("In the weakest MAP area"); }
    if (c.assigned.has(n.id)) { importance += 0.8; why.push("Assigned by the teacher"); }
    if (c.currentUnit.has(n.id)) { importance += 0.4; why.push("This unit"); }
    else if ((c.unitOf.get(n.id) ?? 99) > c.currentUnitNo && !c.assigned.has(n.id)) importance -= 0.5; // later units wait
    if (x.misconception) { importance += 0.4; why.push(`Recent mistakes: ${misconceptionLabel(x.misconception).toLowerCase()}`); }
    if (x.recentErrors >= 3) { importance += 0.2; why.push(`${x.recentErrors} of the last ${x.recentAnswers} answers wrong`); }
    const deps = (g.dependents.get(n.id) ?? []).length;
    if (deps) { importance += Math.min(0.5, 0.15 * deps); why.push(`Unlocks ${deps} later skill${deps > 1 ? "s" : ""}`); }
    const pre = g.prereqs.get(n.id) ?? [];
    const readiness = pre.length ? pre.reduce((a, e) => { const p = st(e.prerequisiteSkillId); return a + (weak(p, e.minimumMastery) ? 0 : tested(p) ? 1 : 0.6); }, 0) / pre.length : 1;
    // a skill whose foundations are weak will be reached through a FOUNDATION step: that kind's learned weight applies
    const kind: StepAction = readiness < 1 ? "FOUNDATION" : "TARGET";
    let score = need * Math.max(0.2, importance) * (0.4 + 0.6 * readiness) * (c.weights?.[kind] ?? 1);
    if (stuckOn(c.velocity.get(n.id), x)) { score *= 0.6; stuck.push({ skillId: n.id, name: n.name }); why.push("Little progress lately: foundations first"); }
    cands.push({ id: n.id, score, why });
  }
  cands.sort((a, b) => b.score - a.score);
  const steps: PathStep[] = [];
  const has = (id: string) => steps.some((x) => x.skillId === id);
  const levelFor = (id: string, shift = 0) => thetaToLevel((st(id).theta ?? overall) + shift);
  // one due review first (keeps mastered skills strong)
  const review = [...c.reviewDue].find((id) => c.practicable.has(id));
  if (review) steps.push({ skillId: review, name: g.nodes.get(review)?.name ?? "", action: "REVIEW", level: levelFor(review), score: 0, why: ["Mastered: a spaced review is due"] });
  for (const cand of cands) {
    if (steps.length >= len) break;
    // the knowledge graph: weak prerequisites underneath come first
    for (const a of ancestors(g, cand.id, 2).reverse()) {
      if (steps.length >= len - 1) break;
      const p = st(a.id);
      if (!c.practicable.has(a.id) || has(a.id) || p.isMastered || !weak(p)) continue;
      steps.push({ skillId: a.id, name: g.nodes.get(a.id)!.name, action: "FOUNDATION", level: levelFor(a.id, -0.4), score: cand.score, why: [`Needed for ${g.nodes.get(cand.id)!.name}`, `Mastery ${Math.round(p.mastery)}`], forSkill: { skillId: cand.id, name: g.nodes.get(cand.id)!.name } });
    }
    if (steps.length < len && !has(cand.id)) steps.push({ skillId: cand.id, name: g.nodes.get(cand.id)!.name, action: "TARGET", level: levelFor(cand.id), score: Math.round(cand.score * 100) / 100, why: cand.why.length ? cand.why : ["Next in your learning path"] });
  }
  // a strong student also stretches: a ready skill from a later unit, at a higher level
  if (overall >= 0.75 && steps.length >= 2) {
    const ahead = [...g.nodes.values()].filter((n) => c.practicable.has(n.id) && !has(n.id) && !st(n.id).isMastered && (c.unitOf.get(n.id) ?? 0) > c.currentUnitNo && (g.prereqs.get(n.id) ?? []).every((e) => !weak(st(e.prerequisiteSkillId), e.minimumMastery))).sort((a, b) => a.sequence - b.sequence)[0];
    if (ahead) steps.splice(Math.min(steps.length, len - 1), steps.length >= len ? 1 : 0, { skillId: ahead.id, name: ahead.name, action: "STRETCH", level: Math.min(7, levelFor(ahead.id, 0.75)), score: 0, why: ["You are ready for a challenge from a later unit"] });
  }
  return { steps: steps.slice(0, len), skipped: skipped.slice(0, 12), stuck };
}

/** The old way: the first unmastered skills in curriculum order (for comparison). */
export function genericPath(c: PathContext, len = 5): PathStep[] {
  return [...c.graph.nodes.values()].filter((n) => c.practicable.has(n.id) && !(c.states.get(n.id)?.isMastered)).sort((a, b) => (c.unitOf.get(a.id) ?? 99) - (c.unitOf.get(b.id) ?? 99) || a.sequence - b.sequence)
    .slice(0, len).map((n) => ({ skillId: n.id, name: n.name, action: "TARGET" as const, level: 4, score: 0, why: ["Curriculum order"] }));
}

/** "Current unit" rule shared with the student's curriculum page (src/server/queries/student-curriculum.ts pickCurrent). */
const CURRENT_UNIT_PROGRESS_PCT = 70;

/**
 * Everything the planner needs for one student (a fixed number of queries).
 * `cache` (optional): pass the same Map for every student of a run (the daily job) — the per-grade and per-school
 * loads (curriculum, knowledge graph, units, published questions, learned action weights) are then read once and
 * shared; the student's own data is always read fresh. The result is identical with or without it.
 */
export async function pathContext(repo: Repo, studentId: string, now = new Date(), cache?: Map<string, unknown>): Promise<PathContext | null> {
  const memo = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    if (!cache) return load();
    const k = `learning-path:${key}`;
    if (!cache.has(k)) cache.set(k, load());
    return cache.get(k) as Promise<T>;
  };
  const student = await repo.findUnique("Student", { id: studentId });
  const cur = student ? await memo(`curriculum:${s(student.gradeId)}`, async () => (await repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true }))[0] ?? null) : null;
  if (!cur) return null;
  const curId = s(cur.id);
  const graph = await memo(`graph:${curId}`, () => loadGraph(repo, curId));
  const ids = [...graph.nodes.keys()];
  const [states, questions, units, logs, mastery, assignedRows] = await Promise.all([
    skillStates(repo, studentId, ids),
    memo(`questions:${curId}`, () => ids.length ? repo.findMany("Question", { skillId: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "mapInstructionalArea"] }) : Promise.resolve([] as Row[])),
    memo(`units:${curId}`, () => repo.findMany("Unit", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "number"] })),
    repo.findMany("AdaptiveDecisionLog", { studentId, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } }, { select: ["skillId", "masteryBefore", "masteryAfter"] }),
    repo.findMany("StudentSkillMastery", { studentId, isMastered: true, nextReviewAt: { lte: now } }, { select: ["skillId"] }),
    repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId", "status"] }),
  ]);
  const practicable = new Set(questions.map((q) => s(q.skillId)));
  // the weakest MAP area → its skills (the area most of a skill's questions belong to)
  const { weakestArea } = await import("../student/weekly-check");
  const { areaFromName } = await import("../map/nwea-area");
  const w = await weakestArea(repo, studentId);
  const areaVotes = new Map<string, Map<string, number>>();
  for (const q of questions) { const k = q.mapInstructionalArea ? areaFromName(s(q.mapInstructionalArea)) : null; if (!k) continue; const m = areaVotes.get(s(q.skillId)) ?? new Map(); m.set(k, (m.get(k) ?? 0) + 1); areaVotes.set(s(q.skillId), m); }
  const weakArea = new Set(w ? [...areaVotes.entries()].filter(([, m]) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] === w.key).map(([id]) => id) : []);
  const unitLinks = await memo(`unitLinks:${curId}`, () => units.length ? repo.findMany("UnitSkill", { unitId: { in: units.map((u) => u.id) } }, { select: ["unitId", "skillId"] }) : Promise.resolve([] as Row[]));
  const unitNo = new Map(units.map((u) => [s(u.id), Number(u.number)]));
  const unitOf = new Map<string, number>();
  for (const l of unitLinks) { const n = unitNo.get(s(l.unitId)) ?? 99; if (n < (unitOf.get(s(l.skillId)) ?? 99)) unitOf.set(s(l.skillId), n); }
  // current unit: the first one not mostly proficient — the same thresholds as the student's curriculum page
  // (proficient = the mastery band, "mostly" = under 70% of the unit's skills, rounded like its progress %)
  const proficient = DEFAULT_MASTERY.bands.proficient;
  const nums = [...new Set(units.map((u) => Number(u.number)))].sort((a, b) => a - b);
  let currentUnitNo = nums[nums.length - 1] ?? 1;
  for (const n of nums) { const sk = [...unitOf.entries()].filter(([, u]) => u === n).map(([id]) => id); const prof = sk.filter((id) => (states.get(id)?.mastery ?? 0) >= proficient).length; if (!sk.length || Math.round((100 * prof) / sk.length) < CURRENT_UNIT_PROGRESS_PCT) { currentUnitNo = n; break; } }
  const currentUnit = new Set([...unitOf.entries()].filter(([, u]) => u === currentUnitNo).map(([id]) => id));
  const velocity = new Map<string, { answers: number; gain: number }>();
  for (const l of logs) { if (l.masteryBefore === null || l.masteryAfter === null || l.masteryBefore === undefined) continue; const v = velocity.get(s(l.skillId)) ?? { answers: 0, gain: 0 }; v.answers++; v.gain += Number(l.masteryAfter) - Number(l.masteryBefore); velocity.set(s(l.skillId), v); }
  const open = assignedRows.filter((r) => r.status !== "COMPLETED").map((r) => s(r.assignmentId));
  // r78: cancelled on Assigned (for everyone or this student) = not assigned
  const [asg, ix] = await Promise.all([open.length ? repo.findMany("Assignment", { id: { in: open } }, { select: ["id", "skillId", "deletedAt", "testId", "curriculumPlanId"] }) : Promise.resolve([] as Row[]), cancelIndex(repo, s(student!.schoolId))]);
  const assigned = new Set(asg.filter((a) => a.skillId && ix.live(a, studentId)).map((a) => s(a.skillId)));
  const { actionWeights } = await import("../insights/learning-weights");
  const weights = await memo(`weights:${s(student!.schoolId)}`, () => actionWeights(repo, s(student!.schoolId)));
  return { graph, states, practicable, weakArea, assigned, currentUnit, unitOf, currentUnitNo, velocity, reviewDue: new Set(mastery.map((m) => s(m.skillId))), weights };
}

/** The student's path (and how fast they are progressing: mastery points per week, last 14 days). */
export async function planPath(repo: Repo, studentId: string, now = new Date(), len = 5, cache?: Map<string, unknown>): Promise<LearningPath> {
  const c = await pathContext(repo, studentId, now, cache);
  if (!c) return { studentId, steps: [], skipped: [], stuck: [], growthPerWeek: null };
  const p = planFromContext(c, len);
  const gain = [...c.velocity.values()].reduce((a, v) => a + v.gain, 0);
  return { studentId, ...p, growthPerWeek: c.velocity.size ? Math.round((gain / 2) * 10) / 10 : null };
}
