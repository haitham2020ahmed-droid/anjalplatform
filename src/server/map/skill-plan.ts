/**
 * 🧭 MAP Skill Plan — like the skill plans published for NWEA MAP Growth: for each grade and goal area, six
 * RIT ranges around the grade's norm (e.g. Grade 6 Reading: < 198 · 198–204 · 205–210 · 211–214 · 215–218 · 219+),
 * and in each range the platform's own skills, grouped by NWEA instructional area and by topic, easiest first.
 * A skill belongs to a range when it has questions of that RIT (estimated from difficulty or calibrated).
 * With a class chosen, every range shows the students whose RIT (goal area, else overall) falls in it, and
 * the teacher assigns the ticked skills to them as one adaptive set at that RIT.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { assignQuestions } from "../teacher/assign";
import { classMembers, studentNames } from "../insights/student-data";
import { ensureNationalNorms, nationalNorm } from "./rit";
import { groupOf, groupPools, GROUPS, mapProfiles, type GroupKey, type Subject } from "./map-plan";

const s = (v: unknown) => String(v ?? "");
/** Cut points as fractions of a standard deviation around the grade's Fall mean (Grade 6: 209 ± 17 → 198 · 205 · 211 · 215 · 219). */
const CUTS = [-0.65, -0.24, 0.12, 0.35, 0.59];

export interface SkillRange { index: number; low: number; high: number; label: string }

/** The six RIT ranges of a grade (Fall norm; Language uses the Reading spread). */
export async function skillRanges(repo: Repo, grade: number): Promise<SkillRange[]> {
  await ensureNationalNorms(repo);
  const n = (await nationalNorm(repo, grade, "FALL")) ?? { mean: 200, sd: 17 };
  const cut = CUTS.map((k) => Math.round(n.mean + k * n.sd));
  const out: SkillRange[] = [];
  for (let i = 0; i <= cut.length; i++) {
    const low = i === 0 ? 100 : cut[i - 1], high = i === cut.length ? 350 : cut[i] - 1;
    out.push({ index: i, low, high, label: i === 0 ? `Less than ${cut[0]}` : i === cut.length ? `${low}+` : `${low}–${high}` });
  }
  return out;
}

export interface PlanSkill { id: string; name: string; questions: number; rit: number }
export interface PlanTopic { name: string; skills: PlanSkill[] }
export interface PlanArea { code: string; name: string; topics: PlanTopic[] }
export interface PlanRange extends SkillRange { areas: PlanArea[]; skills: number; students: { id: string; name: string; rit: number }[]; /** no questions of this RIT yet: the skills of the nearest range are shown (and assigned) */ nearest: string | null }
export interface SkillPlanView {
  grade: number; subject: Subject; group: GroupKey; groups: { key: GroupKey; name: string; icon: string }[];
  ranges: PlanRange[]; classId: string | null; className: string | null; canAssign: boolean; noScores: number;
}

/** The range whose questions are used: this one, or the nearest one that has questions (lower first). */
function usedRange<T extends SkillRange>(ranges: T[], i: number, has: (r: T) => boolean): T | null {
  if (has(ranges[i])) return ranges[i];
  for (let d = 1; d < ranges.length; d++) for (const j of [i - d, i + d]) if (ranges[j] && has(ranges[j])) return ranges[j];
  return null;
}
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; };

/** The six ranges of one goal area with the platform's skills in each (no students). */
export async function buildRanges(repo: Repo, schoolId: string, grade: number, group: GroupKey): Promise<PlanRange[]> {
  const g = groupOf(group);
  const [ranges, pk] = await Promise.all([skillRanges(repo, grade), groupPools(repo, schoolId, grade)]);
  const pool = pk.pools.get(g.key) ?? [];
  // the skill's instructional area (finer MAP goal area) and topic (its family)
  const skillIds = [...new Set(pool.map((q) => q.skillId))];
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "familyId", "sequence"] }) : [];
  const fams = skills.length ? await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "name", "mapGoalAreaId"] }) : [];
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "code", "name"] });
  const famOf = new Map(fams.map((f) => [s(f.id), f]));
  const has = (r: SkillRange) => pool.some((q) => q.rit >= r.low && q.rit <= r.high);
  const out: PlanRange[] = ranges.map((r0) => {
    const r = usedRange(ranges, r0.index, has) ?? r0;
    const inRange = pool.filter((q) => q.rit >= r.low && q.rit <= r.high);
    const bySkill = new Map<string, number[]>();
    for (const q of inRange) bySkill.set(q.skillId, [...(bySkill.get(q.skillId) ?? []), q.rit]);
    const areaMap = new Map<string, PlanArea>();
    for (const [id, rits] of bySkill) {
      const k = skills.find((x) => s(x.id) === id); if (!k) continue;
      const f = famOf.get(s(k.familyId));
      const a = areas.find((x) => x.id === f?.mapGoalAreaId);
      const code = s(a?.code) || g.key, areaName = s(a?.name).replace(/^[^:]+:\s*/, "") || g.name;
      const area = areaMap.get(code) ?? { code, name: areaName, topics: [] };
      const topicName = s(f?.name) || "Other";
      let topic = area.topics.find((t) => t.name === topicName);
      if (!topic) { topic = { name: topicName, skills: [] }; area.topics.push(topic); }
      topic.skills.push({ id, name: s(k.name), questions: rits.length, rit: median(rits) });
      areaMap.set(code, area);
    }
    const list = [...areaMap.values()].sort((a, b) => g.codes.indexOf(a.code) - g.codes.indexOf(b.code));
    for (const a of list) {
      for (const t of a.topics) t.skills.sort((x, y) => x.rit - y.rit || x.name.localeCompare(y.name));
      a.topics.sort((x, y) => (x.skills[0]?.rit ?? 0) - (y.skills[0]?.rit ?? 0) || x.name.localeCompare(y.name));
    }
    return { ...r0, areas: list, skills: bySkill.size, students: [], nearest: r === r0 || !bySkill.size ? null : r.label };
  });
  return out;
}

export async function skillPlan(repo: Repo, actor: Actor, input: { grade: number; group: GroupKey; classId?: string | null }): Promise<SkillPlanView> {
  assertCan(actor, "reports:read");
  const g = groupOf(input.group);
  if (!g) throw new ValidationError("Choose a goal area.");
  let grade = input.grade, className: string | null = null, canAssign = false, ids: string[] = [];
  if (input.classId) {
    const klass = await assertClassRead(repo, actor, input.classId);
    grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? grade);
    className = s(klass.name);
    try { await assertClassAccess(repo, actor, input.classId); canAssign = true; } catch { canAssign = false; }
    ids = await classMembers(repo, input.classId);
  }
  const out = await buildRanges(repo, actor.schoolId!, grade, g.key);
  let noScores = 0;
  if (ids.length) {
    const [profiles, names] = await Promise.all([mapProfiles(repo, actor.schoolId!, ids, g.subject), studentNames(repo, ids)]);
    for (const id of ids) {
      const p = profiles.get(id);
      const rit = p?.areas.find((a) => a.group === g.key)?.rit ?? p?.overall?.rit ?? null;
      if (rit === null) { noScores++; continue; }
      const r = out.find((x) => rit >= x.low && rit <= x.high);
      r?.students.push({ id, name: names.get(id)?.name ?? "Student", rit });
    }
    for (const r of out) r.students.sort((a, b) => a.rit - b.rit || a.name.localeCompare(b.name));
  }
  return { grade, subject: g.subject, group: g.key, groups: GROUPS.map((x) => ({ key: x.key, name: x.name, icon: x.icon })), ranges: out, classId: input.classId ?? null, className, canAssign, noScores };
}

/** Assigns the ticked skills of one range to the ticked students: one adaptive set of that range's questions. */
export async function assignRange(repo: Repo, actor: Actor, input: { classId: string; group: GroupKey; range: number; skillIds: string[]; studentIds: string[]; count?: number; dueAt?: Date | null }, now = new Date()): Promise<{ assignmentId: string; questions: number; students: number }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ranges = await skillRanges(repo, grade);
  if (!ranges[input.range]) throw new ValidationError("Choose a RIT range.");
  if (!input.skillIds.length) throw new ValidationError("Tick at least one skill.");
  if (!input.studentIds.length) throw new ValidationError("Tick at least one student.");
  const members = new Set(await classMembers(repo, input.classId));
  const studentIds = input.studentIds.filter((x) => members.has(x));
  const pool = (await groupPools(repo, actor.schoolId!, grade)).pools.get(input.group) ?? [];
  const r = usedRange(ranges, input.range, (x) => pool.some((q) => q.rit >= x.low && q.rit <= x.high)) ?? ranges[input.range];
  const want = new Set(input.skillIds);
  // the range's questions; too few for a good adaptive set → the next ranges, nearest first (lower first)
  const order = [...ranges].sort((a, b) => Math.abs(a.index - r.index) - Math.abs(b.index - r.index) || a.index - b.index);
  const qs: string[] = [];
  for (const x of order) {
    if (qs.length >= 8) break;
    qs.push(...pool.filter((q) => want.has(q.skillId) && q.rit >= x.low && q.rit <= x.high).map((q) => q.id));
  }
  if (qs.length < 3) throw new ValidationError("Not enough questions for these skills yet (3 or more needed): tick more skills or add questions.");
  const g = groupOf(input.group);
  const a = await assignQuestions(repo, actor, { classId: input.classId, studentIds, questionIds: qs, title: `MAP skills · ${g.name} · RIT ${ranges[input.range].label}`, exactTitle: true, track: "MAP", adaptive: { maxQuestions: Math.max(5, Math.min(input.count ?? 15, qs.length)) }, dueAt: input.dueAt ?? null }, now);
  return { assignmentId: a.assignmentId, questions: qs.length, students: studentIds.length };
}

/** 🧭 For the student (My MAP): in each goal area, their RIT range and the skills to practise there. */
export async function mySkillPlan(repo: Repo, actor: Actor): Promise<{ group: GroupKey; name: string; icon: string; subject: Subject; rit: number; range: string; skills: { id: string; name: string }[] }[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) return [];
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  if (!grade || !st) return [];
  const out: Awaited<ReturnType<typeof mySkillPlan>> = [];
  for (const subject of ["READING", "LANGUAGE"] as const) {
    const p = (await mapProfiles(repo, s(st.schoolId), [actor.studentId], subject)).get(actor.studentId);
    if (!p?.overall) continue;
    for (const g of GROUPS.filter((x) => x.subject === subject)) {
      const rit = p.areas.find((a) => a.group === g.key)?.rit ?? p.overall.rit;
      const r = (await buildRanges(repo, s(st.schoolId), grade, g.key)).find((x) => rit >= x.low && rit <= x.high);
      if (!r) continue;
      const skills = r.areas.flatMap((a) => a.topics.flatMap((t) => t.skills)).sort((a, b) => a.rit - b.rit).slice(0, 8).map((k) => ({ id: k.id, name: k.name }));
      if (skills.length) out.push({ group: g.key, name: g.name, icon: g.icon, subject, rit, range: r.label, skills });
    }
  }
  return out;
}
