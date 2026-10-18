/**
 * 🗺️ MAP plans that follow NWEA's own reports:
 *   - the six goal-area groups of the reports — Reading: Literary Text, Informational Text, Vocabulary;
 *     Language Usage: Grammar & Usage, Mechanics, Writing (the platform's 10 finer areas map onto them);
 *   - RIT bands of 10 points (the NWEA export's “RIT Score 10 Point Range”: 181–190, 191–200 …), editable;
 *   - descriptors by percentile for the student's grade and season (2025 norms): Lo < 21, LoAvg 21–40,
 *     Avg 41–60, HiAvg 61–80, Hi > 80;
 *   - status per area: FOCUS (Lo / LoAvg, or 3+ RIT under the student's overall), EXTEND (HiAvg / Hi and 3+ over),
 *     MAINTAIN otherwise.
 * A plan practises each chosen area with questions of the student's band and the band above (estimated RIT of
 * every question, recalibrated from real answers). Plans are DRAFT until the teacher reviews, edits and sends.
 */
import { scoringParams } from "../practice/scoring-params";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { requireSource } from "../assign/source";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { assignQuestions } from "../teacher/assign";
import { audit } from "../audit";
import { bandOf as descriptorOf, ensureNationalNorms, nationalNorm, seasonOf, type Season } from "./rit";
import { ritFromDifficulty } from "../questions/tag-review";
import { classMembers, studentNames } from "../insights/student-data";
import { masterSkills } from "../skills/master";
import { mapLinkedQuestionIds } from "../questions/bank-scope";
import { mapCache, MAP_KEEP_MS } from "./map-cache";
import { heavyBuild } from "../monitoring/memory";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export type Subject = "READING" | "LANGUAGE";
export type GroupKey = "LIT" | "INFO" | "VOCAB" | "GRAMMAR" | "MECH" | "WRITING";
export const GROUPS: { key: GroupKey; subject: Subject; name: string; icon: string; codes: string[] }[] = [
  { key: "LIT", subject: "READING", name: "Literary Text", icon: "📚", codes: ["LIT_STRUCTURE", "LIT_THEME"] },
  { key: "INFO", subject: "READING", name: "Informational Text", icon: "📰", codes: ["INFO_STRUCTURE", "INFO_CENTRAL_IDEA"] },
  { key: "VOCAB", subject: "READING", name: "Vocabulary", icon: "🔤", codes: ["VOCAB"] },
  { key: "GRAMMAR", subject: "LANGUAGE", name: "Grammar & Usage", icon: "✏️", codes: ["LANG_GRAMMAR"] },
  { key: "MECH", subject: "LANGUAGE", name: "Mechanics", icon: "🔠", codes: ["LANG_MECHANICS"] },
  { key: "WRITING", subject: "LANGUAGE", name: "Writing", icon: "📝", codes: ["WRITING_STYLE", "WRITING_ORG", "WRITING_SUPPORT"] },
];
export const groupOf = (k: string) => GROUPS.find((g) => g.key === k)!;
export type AreaStatus = "FOCUS" | "MAINTAIN" | "EXTEND";
export type Descriptor = "Low" | "LoAvg" | "Avg" | "HiAvg" | "High";

// ------------------------------------------------------------------ bands (settings)

export interface BandSettings { size: number; min: number; max: number }
export const DEFAULT_BANDS: BandSettings = { size: 10, min: 150, max: 250 };
const BKEY = "map.bands";
export async function bandSettings(repo: Repo, schoolId: string | null): Promise<BandSettings> {
  if (!schoolId) return DEFAULT_BANDS;
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: BKEY }))[0];
  let v: unknown = row?.value ?? null; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (k: string, d: number) => (Number.isInteger(Number(o[k])) ? Number(o[k]) : d);
  const out = { size: n("size", 10), min: n("min", 150), max: n("max", 250) };
  return out.size >= 5 && out.size <= 20 && out.min >= 100 && out.max <= 350 && out.min < out.max ? out : DEFAULT_BANDS;
}
export async function setBandSettings(repo: Repo, actor: Actor, v: BandSettings, now = new Date()): Promise<void> {
  assertCan(actor, "settings:school");
  if (!(Number.isInteger(v.size) && v.size >= 5 && v.size <= 20)) throw new ValidationError("Band size: 5 to 20 RIT.");
  if (!(Number.isInteger(v.min) && Number.isInteger(v.max) && v.min >= 100 && v.max <= 350 && v.min + v.size < v.max)) throw new ValidationError("Lowest and highest RIT: from 100 to 350, lowest first.");
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: BKEY }, { value: v, updatedBy: actor.userId, updatedAt: now }, { value: v, updatedBy: actor.userId, updatedAt: now });
}

/** 185 → 181–190 (size 10). Under the lowest band: “≤ 160”; over the highest: “241+”. */
export function ritBand(rit: number, b: BandSettings = DEFAULT_BANDS): { low: number; high: number; label: string } {
  if (rit <= b.min + b.size) return { low: 100, high: b.min + b.size, label: `${b.min + b.size} or below` };
  if (rit > b.max - b.size) return { low: b.max - b.size + 1, high: 350, label: `${b.max - b.size + 1} and above` };
  const low = Math.floor((rit - b.min - 1) / b.size) * b.size + b.min + 1;
  return { low, high: low + b.size - 1, label: `${low}–${low + b.size - 1}` };
}

// ------------------------------------------------------------------ profiles (from MAP results)

export interface AreaProfile { group: GroupKey; name: string; icon: string; rit: number | null; band: string | null; low: number | null; high: number | null; percentile: number | null; descriptor: Descriptor | null; status: AreaStatus | null }
export interface MapProfile {
  studentId: string; subject: Subject; term: string | null; season: Season | null; grade: number;
  overall: { rit: number; percentile: number | null; descriptor: Descriptor | null; band: string; lexile: number | null; rapidGuessPct: number | null } | null;
  fall: { rit: number; term: string; projection: number | null; growth: number | null } | null;
  history: { term: string; season: Season; rit: number }[];
  areas: AreaProfile[]; hasGoals: boolean;
}

const pctFromNorm = (rit: number, n: { mean: number; sd: number } | null) => {
  if (!n) return null;
  const z = (rit - n.mean) / n.sd;
  return Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-1.702 * z)))));
};

/**
 * MAP profile of these students for one subject (latest term with scores; goal areas grouped as in NWEA reports).
 * ⚡ r79: Results, Reports, the plans, the Year plan and the MAP Test all read the same class's profiles: kept until a
 * MAP score, a student, the bands or the norms change (write counters; at most 10 min); callers get their own copy.
 */
const PROFILE_MODELS = ["MapResult", "Student", "Grade", "SchoolSetting", "BenchmarkReference", "MapGoalArea"];
export const MAP_PROFILE_MODELS: readonly string[] = PROFILE_MODELS;
const profileCache = mapCache<Map<string, MapProfile>>("map.map-plan.profiles", MAP_KEEP_MS, 24);
export async function mapProfiles(repo: Repo, schoolId: string, studentIds: string[], subject: Subject): Promise<Map<string, MapProfile>> {
  if (!studentIds.length) return new Map();
  const ids = [...new Set(studentIds)];
  const kept = await profileCache.get(repo, `${schoolId}|${subject}|${[...ids].sort().join(",")}`, PROFILE_MODELS, () => mapProfilesNow(repo, schoolId, ids, subject));
  return new Map(ids.filter((id) => kept.has(id)).map((id) => [id, structuredClone(kept.get(id) as MapProfile)]));
}

async function mapProfilesNow(repo: Repo, schoolId: string, studentIds: string[], subject: Subject): Promise<Map<string, MapProfile>> {
  const out = new Map<string, MapProfile>();
  if (!studentIds.length) return out;
  await ensureNationalNorms(repo);
  const bands = await bandSettings(repo, schoolId);
  const [results, areas, students] = await Promise.all([
    repo.findMany("MapResult", { studentId: { in: studentIds } }),
    repo.findMany("MapGoalArea", {}, { select: ["id", "code"] }),
    repo.findMany("Student", { id: { in: studentIds } }, { select: ["id", "gradeId"] }),
  ]);
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(students.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] });
  const codeOf = new Map(areas.map((a) => [s(a.id), s(a.code)]));
  const normCache = new Map<string, { mean: number; sd: number } | null>();
  const norm = async (g: number, se: Season) => { const k = `${g}${se}`; if (!normCache.has(k)) normCache.set(k, await nationalNorm(repo, g, se)); return normCache.get(k)!; };
  const isSubj = (v: unknown) => (subject === "READING" ? /read/i : /language/i).test(s(v));
  for (const id of studentIds) {
    const st = students.find((x) => x.id === id);
    const grade = Number(grades.find((g) => g.id === st?.gradeId)?.level ?? 0);
    const mine = results.filter((r) => s(r.studentId) === id && isSubj(r.subject)).sort((a, b) => time(a.testDate) - time(b.testDate));
    let overallRows = mine.filter((r) => !r.goalName);
    if (!overallRows.length) {
      // only sub-area (goal) scores were imported: the latest test's overall RIT = the mean of its goal RITs
      const goals = mine.filter((r) => r.goalName && Number.isFinite(Number(r.rit)));
      const lastTerm = goals.length ? s(goals[goals.length - 1].termName) : "";
      const same = goals.filter((r) => s(r.termName) === lastTerm);
      if (same.length) {
        const last = same[same.length - 1];
        overallRows = [{ ...last, goalName: null, goalAreaId: null, rit: Math.round(same.reduce((t, r) => t + Number(r.rit), 0) / same.length), achievementPercentile: null, projectedGrowth: null, lexile: last.lexile ?? null }];
      }
    }
    const latest = overallRows[overallRows.length - 1];
    const term = latest ? s(latest.termName) || null : null;
    const season = latest ? seasonOf(latest.termName, latest.testDate) : null;
    const goalRows = mine.filter((r) => r.goalName && s(r.termName) === s(term));
    const n = season ? await norm(grade, season) : null;
    const overallPct = latest ? (latest.achievementPercentile !== null && latest.achievementPercentile !== undefined ? Number(latest.achievementPercentile) : pctFromNorm(Number(latest.rit), n)) : null;
    const fallRow = [...overallRows].reverse().find((r) => seasonOf(r.termName, r.testDate) === "FALL");
    const myGroups = GROUPS.filter((g) => g.subject === subject);
    const areaRows: AreaProfile[] = myGroups.map((g) => {
      const rits = goalRows.filter((r) => g.codes.includes(codeOf.get(s(r.goalAreaId)) ?? "")).map((r) => Number(r.rit));
      if (!rits.length) return { group: g.key, name: g.name, icon: g.icon, rit: null, band: null, low: null, high: null, percentile: null, descriptor: null, status: null };
      const rit = Math.round(rits.reduce((t, x) => t + x, 0) / rits.length);
      const b = ritBand(rit, bands), pct = pctFromNorm(rit, n), d = pct === null ? null : (descriptorOf(pct) as Descriptor);
      const overall = latest ? Number(latest.rit) : rit;
      const status: AreaStatus = d === "Low" || d === "LoAvg" || rit <= overall - 3 ? "FOCUS" : (d === "HiAvg" || d === "High") && rit >= overall + 3 ? "EXTEND" : "MAINTAIN";
      return { group: g.key, name: g.name, icon: g.icon, rit, band: b.label, low: b.low, high: b.high, percentile: pct, descriptor: d, status };
    });
    out.set(id, {
      studentId: id, subject, term, season, grade,
      overall: latest ? { rit: Number(latest.rit), percentile: overallPct, descriptor: overallPct === null ? null : (descriptorOf(overallPct) as Descriptor), band: ritBand(Number(latest.rit), bands).label, lexile: latest.lexile !== null && latest.lexile !== undefined ? Number(latest.lexile) : null, rapidGuessPct: latest.rapidGuessPct !== null && latest.rapidGuessPct !== undefined ? Number(latest.rapidGuessPct) : null } : null,
      fall: fallRow ? { rit: Number(fallRow.rit), term: s(fallRow.termName), projection: fallRow.projectedGrowth !== null && fallRow.projectedGrowth !== undefined ? Number(fallRow.rit) + Number(fallRow.projectedGrowth) : null, growth: fallRow.projectedGrowth !== null && fallRow.projectedGrowth !== undefined ? Number(fallRow.projectedGrowth) : null } : null,
      history: overallRows.map((r) => ({ term: s(r.termName), season: seasonOf(r.termName, r.testDate), rit: Number(r.rit) })),
      areas: areaRows, hasGoals: areaRows.some((a) => a.rit !== null),
    });
  }
  return out;
}

/** Areas ordered for practice: by MAP goal RIT once the student has goal scores (weakest first; equal → weaker
 *  platform accuracy first); before that, by platform accuracy alone. */
export function orderAreas(p: MapProfile, accuracy: Map<GroupKey, number | null>): AreaProfile[] {
  const acc = (g: GroupKey) => accuracy.get(g) ?? 101;
  return [...p.areas].sort((a, b) => (p.hasGoals ? (a.rit ?? 999) - (b.rit ?? 999) : 0) || acc(a.group) - acc(b.group) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ question pools by group and band

export interface PoolQ { id: string; skillId: string; rit: number }
/** Published, auto-marked questions of the grade's skills in this group, each with its (estimated or calibrated) RIT. */
export type Pools = { pools: Map<GroupKey, PoolQ[]>; skills: Map<string, { id: string; name: string; group: GroupKey }> };
/** Kept in memory per school and grade (speed: My MAP, the matrix, the plans, the Year plan and the MAP Test all need
 *  it) until a question, skill or goal-area link changes in this process, and at most 10 minutes (other processes).
 *  ⚡ r79: was 60 s, so nearly every click in the MAP center read the grade's whole bank again (~25 reads); a few
 *  grades at most (swept by cache/idle). */
const POOL_MODELS = ["QuestionMapLink", "Question", "Skill", "SkillFamily", "MapGoalArea", "QuestionType", "Curriculum", "Grade", "SkillStandard", "Standard", "CurriculumMapNode"];
const poolCache = mapCache<Pools>("map.map-plan.poolCache", MAP_KEEP_MS, 8);
export function groupPools(repo: Repo, schoolId: string, grade: number): Promise<Pools> {
  // r84: a big build — one at a time with the other big builds of this process (monitoring/memory.ts heavyBuild)
  return poolCache.get(repo, `${schoolId}|${grade}`, POOL_MODELS, () => heavyBuild(() => loadPools(repo, schoolId, grade)));
}
/** The tables the pools are built from (other MAP caches built on the pools use them too). */
export const MAP_POOL_MODELS: readonly string[] = POOL_MODELS;
async function loadPools(repo: Repo, schoolId: string, grade: number): Promise<Pools> {
  const skills = await masterSkills(repo, schoolId, { grade });
  const fams = skills.length ? await repo.findMany("Skill", { id: { in: skills.map((k) => k.id) } }, { select: ["id", "familyId"] }) : [];
  const famRows = fams.length ? await repo.findMany("SkillFamily", { id: { in: [...new Set(fams.map((f) => s(f.familyId)))] } }, { select: ["id", "mapGoalAreaId"] }) : [];
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "code"] });
  const groupOfSkill = new Map<string, GroupKey>();
  for (const f of fams) { const code = s(areas.find((a) => a.id === famRows.find((x) => x.id === f.familyId)?.mapGoalAreaId)?.code); const g = GROUPS.find((x) => x.codes.includes(code)); if (g) groupOfSkill.set(s(f.id), g.key); }
  const ids = [...groupOfSkill.keys()];
  // the bank only: Curriculum Map questions stay with their lesson (Update 54)
  const onMap = await mapLinkedQuestionIds(repo);
  const qs = (ids.length ? await repo.findMany("Question", { skillId: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "difficultyLevel", "tags", "typeId"] }) : []).filter((q) => !onMap.has(s(q.id)));
  const manual = new Set((await repo.findMany("QuestionType", {}, { select: ["id", "code", "isAutoScored"] })).filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false).map((t) => s(t.id)));
  await ensureNationalNorms(repo);
  const norm = await nationalNorm(repo, grade, "FALL");
  const pools = new Map<GroupKey, PoolQ[]>(GROUPS.map((g) => [g.key, []]));
  // 🧠 r84 memory: the pools are light (id, skill, RIT) and every question of a skill shares ONE copy of its skill id
  const skillIdOf = new Map(skills.map((k) => [k.id, k.id] as const));
  for (const q of qs) {
    if (manual.has(s(q.typeId))) continue;
    let t: unknown = q.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
    const cal = (t as { rit?: { value?: number } } | null)?.rit?.value;
    const rit = Number.isFinite(Number(cal)) && cal ? Number(cal) : ritFromDifficulty(Number(q.difficultyLevel ?? 4), norm) ?? 200;
    pools.get(groupOfSkill.get(s(q.skillId))!)!.push({ id: s(q.id), skillId: skillIdOf.get(s(q.skillId)) ?? s(q.skillId), rit });
  }
  const skillMap = new Map(skills.filter((k) => groupOfSkill.has(k.id)).map((k) => [k.id, { id: k.id, name: k.name, group: groupOfSkill.get(k.id)! }]));
  await linkByStandard(repo, schoolId, grade, pools, skillMap, norm);
  await byQuestionArea(repo, skills, pools, skillMap, manual, norm);
  return { pools, skills: skillMap };
}

/**
 * 🧭 The question's own NWEA instructional area decides last (map_instructional_area, set by the MAP
 * classification, the import file or an admin): a question of the grade with an area joins that area's pool,
 * wherever its skill family or standard put it before. So a student weak in one area of MAP practises questions
 * of exactly that area, at their RIT (Below / On / Above).
 */
async function byQuestionArea(repo: Repo, skills: { id: string; name: string }[], pools: Map<GroupKey, PoolQ[]>, skillMap: Pools["skills"], manual: Set<string>, norm: Awaited<ReturnType<typeof nationalNorm>>): Promise<void> {
  const inPools = [...pools.values()].flat().map((q) => q.id);
  const sel = { select: ["id", "skillId", "difficultyLevel", "tags", "typeId", "mapInstructionalArea"] };
  const [bySkill, byId] = await Promise.all([
    skills.length ? repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null, mapInstructionalArea: { not: null } }, sel) : Promise.resolve([] as Row[]),
    inPools.length ? repo.findMany("Question", { id: { in: inPools }, mapInstructionalArea: { not: null } }, sel) : Promise.resolve([] as Row[]),
  ]);
  const all = new Map<string, Row>(); for (const q of [...bySkill, ...byId]) all.set(s(q.id), q);
  if (!all.size) return;
  const { areaFromName } = await import("./nwea-area");
  // ⚡ lookups by id and ONE removal pass per pool at the end (the same pools, in the same order, as removing each
  // moved question at once — a pool of thousands was copied once per moved question)
  const where = new Map<string, GroupKey>(), first = new Map<string, PoolQ>();
  for (const [g, list] of pools) for (const q of list) { where.set(q.id, g); const k = `${g}|${q.id}`; if (!first.has(k)) first.set(k, q); }
  const skillOf = new Map(skills.map((k) => [k.id, k] as const));
  const drop = new Map<GroupKey, Set<string>>();
  for (const q of all.values()) {
    if (manual.has(s(q.typeId))) continue;
    const g = areaFromName(s(q.mapInstructionalArea)) as GroupKey | null;
    if (!g || !pools.has(g)) continue;
    const before = where.get(s(q.id));
    if (before === g) continue;
    let rit: number;
    if (before) { rit = first.get(`${before}|${s(q.id)}`)!.rit; let d = drop.get(before); if (!d) drop.set(before, (d = new Set())); d.add(s(q.id)); }
    else {
      let t: unknown = q.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
      const cal = (t as { rit?: { value?: number } } | null)?.rit?.value;
      rit = Number.isFinite(Number(cal)) && cal ? Number(cal) : ritFromDifficulty(Number(q.difficultyLevel ?? 4), norm) ?? 200;
    }
    pools.get(g)!.push({ id: s(q.id), skillId: s(q.skillId), rit });
    const sk = skillOf.get(q.skillId as string);
    if (sk && !skillMap.has(sk.id)) skillMap.set(sk.id, { id: sk.id, name: sk.name, group: g });
  }
  for (const [g, d] of drop) pools.set(g, pools.get(g)!.filter((x) => !d.has(x.id)));
}

/**
 * Every question of the grade joins a MAP goal area by its own standard (RL.4.2 → Literary Text, L.4.1 → Grammar …):
 * the question's standard first, else its skill's standards, else its skill category or Curriculum Map place
 * (the same reading the Diagnostic uses). So the Question Bank, the curriculum plan and ReadMaster questions all
 * count for MAP, not only the skills whose family an admin linked by hand. A question with its own standard moves
 * to that standard's area; the others keep their family's area.
 */
async function linkByStandard(repo: Repo, schoolId: string, grade: number, pools: Map<GroupKey, PoolQ[]>, skillMap: Pools["skills"], norm: Awaited<ReturnType<typeof nationalNorm>>): Promise<void> {
  const { diagnosticPool } = await import("../diagnostic/test");
  const { areaForStandard } = await import("./map-more");
  let pool: Awaited<ReturnType<typeof diagnosticPool>>;
  try { pool = await diagnosticPool(repo, schoolId, grade); } catch { return; }
  if (!pool.length) return;
  const where = new Map<string, GroupKey>();
  for (const [g, list] of pools) for (const q of list) where.set(q.id, g);
  const groupOfCode = (code: string): GroupKey | null => { const a = areaForStandard(code); return a ? GROUPS.find((g) => g.codes.includes(a))?.key ?? null : null; };
  // ⚡ only the questions that may move or join are read (the others are skipped below without their row): the same
  // pools, without re-reading every question of the grade by id
  const ids = [...new Set(pool.filter((q) => { const g = groupOfCode(q.area.code); return g && g !== "WRITING" && where.get(q.id) !== g; }).map((q) => q.id))];
  const rows = ids.length ? await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId", "standardId", "difficultyLevel", "tags"] }) : [];
  const byId = new Map(rows.map((r) => [s(r.id), r]));
  const ownStd = new Set(rows.filter((r) => r.standardId).map((r) => s(r.id)));
  const votes = new Map<string, Map<GroupKey, number>>();
  // ⚡ one removal pass per pool at the end (same result and order as removing each moved question at once)
  const drop = new Map<GroupKey, Set<string>>();
  for (const q of pool) {
    const g = groupOfCode(q.area.code);
    if (!g || g === "WRITING") continue;
    const before = where.get(q.id);
    // the family's area stays for questions without a standard of their own
    if (before && (before === g || !ownStd.has(q.id))) continue;
    const r = byId.get(q.id);
    if (!r) continue;
    if (before) { let d = drop.get(before); if (!d) drop.set(before, (d = new Set())); d.add(q.id); }
    let t: unknown = r.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
    const cal = (t as { rit?: { value?: number } } | null)?.rit?.value;
    const rit = Number.isFinite(Number(cal)) && cal ? Number(cal) : ritFromDifficulty(Number(r.difficultyLevel ?? 4), norm) ?? 200;
    const skillId = s(r.skillId);
    pools.get(g)!.push({ id: q.id, skillId, rit });
    if (skillId && !skillMap.has(skillId)) { const v = votes.get(skillId) ?? new Map(); v.set(g, (v.get(g) ?? 0) + 1); votes.set(skillId, v); }
  }
  for (const [g, d] of drop) pools.set(g, (pools.get(g) ?? []).filter((x) => !d.has(x.id)));
  // skills that only now have MAP questions: listed under the area most of their questions belong to
  if (votes.size) {
    const names = await repo.findMany("Skill", { id: { in: [...votes.keys()] }, deletedAt: null }, { select: ["id", "name"] });
    for (const k of names) { const v = [...votes.get(s(k.id))!.entries()].sort((a, b) => b[1] - a[1])[0]; skillMap.set(s(k.id), { id: s(k.id), name: s(k.name), group: v[0] }); }
  }
}

/** Questions of the band and the band above; widened a band at a time (max 3) when there are too few. */
export function pickBand(pool: PoolQ[], low: number, high: number, size: number, skillIds: string[] | null, min = 8): { ids: string[]; from: number; to: number } {
  const ok = (q: PoolQ) => !skillIds?.length || skillIds.includes(q.skillId);
  let from = low, to = high + size, list: PoolQ[] = [];
  for (let i = 0; i < 4; i++) { list = pool.filter((q) => ok(q) && q.rit >= from && q.rit <= to); if (list.length >= min) break; from -= size; to += size; }
  return { ids: list.sort((a, b) => a.rit - b.rit).map((q) => q.id), from, to };
}

// ------------------------------------------------------------------ plans

export interface PlanItem { group: GroupKey; status: AreaStatus | null; rit: number | null; low: number; high: number; skillIds: string[]; count: number }
export interface PlanView { id: string; studentId: string; name: string; subject: Subject; term: string; status: "DRAFT" | "SENT"; items: (PlanItem & { name: string; icon: string; band: string; questions: number; skills: { id: string; name: string }[]; allSkills: { id: string; name: string }[] })[]; note: string | null; dueAt: string | null; sentAt: string | null; profile: MapProfile }

/** The automatic plan for one profile: up to 2 FOCUS areas, weakest first (no FOCUS → the weakest area).
 *  Without goal-area scores (only the overall RIT, e.g. a school list): every area of the subject at the
 *  overall band — status from the overall descriptor (Low/LoAvg → focus, HiAvg/High → extend). */
export function autoItems(p: MapProfile, skillsByGroup: Map<GroupKey, string[]>, bands: BandSettings, count = 15): PlanItem[] {
  const withRit = p.areas.filter((a) => a.rit !== null);
  const overall = p.overall?.rit ?? null;
  if (!withRit.length) {
    if (overall === null) return [];
    const d = p.overall?.descriptor ?? null;
    const status: AreaStatus = d === "Low" || d === "LoAvg" ? "FOCUS" : d === "HiAvg" || d === "High" ? "EXTEND" : "MAINTAIN";
    const b = ritBand(overall, bands);
    return p.areas.map((a) => ({ group: a.group, status, rit: overall, low: b.low, high: b.high, skillIds: (skillsByGroup.get(a.group) ?? []).slice(0, 3), count: Math.max(8, Math.round(count * 2 / 3)) }));
  }
  const ordered = [...withRit].sort((a, b) => Number(a.status !== "FOCUS") - Number(b.status !== "FOCUS") || (a.rit ?? 0) - (b.rit ?? 0));
  const chosen = ordered.filter((a) => a.status === "FOCUS").slice(0, 2);
  if (!chosen.length && ordered.length) chosen.push(ordered[0]);
  return chosen.map((a) => ({ group: a.group, status: a.status, rit: a.rit, low: a.low!, high: a.high!, skillIds: (skillsByGroup.get(a.group) ?? []).slice(0, 3), count }));
}

async function planRows(repo: Repo, classId: string, subject: Subject): Promise<Row[]> {
  return repo.findMany("MapPlan", { classId, subject });
}

/** Makes (or refreshes) the DRAFT plan of every student of the class who has MAP scores for this subject. Sent plans are kept. */
export async function ensureDrafts(repo: Repo, actor: Actor, classId: string, subject: Subject, now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const profiles = await mapProfiles(repo, actor.schoolId!, ids, subject);
  const bands = await bandSettings(repo, actor.schoolId);
  const { pools } = await groupPools(repo, actor.schoolId!, grade);
  const mastery = ids.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score"] }) : [];
  const existing = await planRows(repo, classId, subject);
  let n = 0;
  for (const id of ids) {
    const p = profiles.get(id)!;
    if (!p.term) continue;
    if (existing.some((x) => x.studentId === id && x.term === p.term)) continue;   // this term's plan exists (draft or sent)
    // skills of each group: weakest mastery first (not started first)
    const m = new Map(mastery.filter((x) => x.studentId === id).map((x) => [s(x.skillId), Number(x.score)]));
    // no answers yet in an area → no skill chosen = all the skills of the area (at the student's band)
    const skillsByGroup = new Map<GroupKey, string[]>(GROUPS.map((g) => { const ids = [...new Set((pools.get(g.key) ?? []).map((q) => q.skillId))]; return [g.key, ids.some((k) => m.has(k)) ? ids.sort((a, b) => (m.get(a) ?? -1) - (m.get(b) ?? -1)) : []]; }));
    const items = autoItems(p, skillsByGroup, bands);
    if (!items.length) continue;
    await repo.create("MapPlan", { schoolId: actor.schoolId!, classId, studentId: id, subject, term: p.term, status: "DRAFT", items, note: null, dueAt: null, assignmentIds: null, createdById: actor.userId, createdAt: now, updatedAt: now, sentAt: null });
    n++;
  }
  return n;
}

export async function classPlans(repo: Repo, actor: Actor, classId: string, subject: Subject): Promise<{ className: string; grade: number; plans: PlanView[]; noScores: { id: string; name: string }[]; canEdit: boolean }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  let canEdit = true; try { await assertClassAccess(repo, actor, classId); } catch { canEdit = false; }
  if (canEdit) await ensureDrafts(repo, actor, classId, subject);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const [names, profiles, rows, pk] = await Promise.all([studentNames(repo, ids), mapProfiles(repo, actor.schoolId!, ids, subject), planRows(repo, classId, subject), groupPools(repo, actor.schoolId!, grade)]);
  const bands = await bandSettings(repo, actor.schoolId);
  const latest = new Map<string, Row>();
  for (const r of rows.filter((x) => x.status !== "DISMISSED").sort((a, b) => time(a.createdAt) - time(b.createdAt))) latest.set(s(r.studentId), r);
  const plans = [...latest.values()].filter((r) => ids.includes(s(r.studentId))).map((r) => viewOf(r, names.get(s(r.studentId))?.name ?? "Student", profiles.get(s(r.studentId))!, pk, bands)).sort((a, b) => a.name.localeCompare(b.name));
  return { className: s(klass.name), grade, plans, noScores: ids.filter((id) => !profiles.get(id)?.term).map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)), canEdit };
}

function viewOf(r: Row, name: string, profile: MapProfile, pk: Awaited<ReturnType<typeof groupPools>>, bands: BandSettings): PlanView {
  const items = ((r.items ?? []) as PlanItem[]).map((it) => {
    const g = groupOf(it.group);
    const pick = pickBand(pk.pools.get(it.group) ?? [], it.low, it.high, bands.size, it.skillIds);
    const all = [...pk.skills.values()].filter((k) => k.group === it.group).map((k) => ({ id: k.id, name: k.name })).sort((a, b) => a.name.localeCompare(b.name));
    return { ...it, name: g.name, icon: g.icon, band: ritBand(it.rit ?? it.low, bands).label, questions: pick.ids.length, skills: all.filter((k) => it.skillIds.includes(k.id)), allSkills: all };
  });
  return { id: s(r.id), studentId: s(r.studentId), name, subject: s(r.subject) as Subject, term: s(r.term), status: s(r.status) as "DRAFT" | "SENT", items, note: r.note ? s(r.note) : null, dueAt: r.dueAt ? new Date(time(r.dueAt)).toISOString() : null, sentAt: r.sentAt ? new Date(time(r.sentAt)).toISOString() : null, profile };
}

async function ownPlan(repo: Repo, actor: Actor, planId: string): Promise<Row> {
  const r = await repo.findUnique("MapPlan", { id: planId });
  if (!r || s(r.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Plan not found.");
  await assertClassAccess(repo, actor, s(r.classId));
  return r;
}

/** Teacher edits a draft: which areas, which skills, how many questions, due date, note. */
export async function updatePlan(repo: Repo, actor: Actor, planId: string, input: { items: { group: GroupKey; skillIds: string[]; count: number; keep: boolean }[]; addGroup?: GroupKey | null; note?: string | null; dueAt?: Date | null }, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const r = await ownPlan(repo, actor, planId);
  const items = ((r.items ?? []) as PlanItem[]);
  const next: PlanItem[] = [];
  for (const it of items) {
    const e = input.items.find((x) => x.group === it.group);
    if (e && !e.keep) continue;
    next.push({ ...it, skillIds: e ? e.skillIds : it.skillIds, count: e ? Math.max(5, Math.min(40, Math.round(e.count) || it.count)) : it.count });
  }
  if (input.addGroup && !next.some((x) => x.group === input.addGroup)) {
    const p = (await mapProfiles(repo, actor.schoolId!, [s(r.studentId)], s(r.subject) as Subject)).get(s(r.studentId))!;
    const a = p.areas.find((x) => x.group === input.addGroup);
    const bands = await bandSettings(repo, actor.schoolId);
    const rit = a?.rit ?? p.overall?.rit ?? 200, b = ritBand(rit, bands);
    next.push({ group: input.addGroup, status: a?.status ?? null, rit, low: b.low, high: b.high, skillIds: [], count: 15 });
  }
  if (!next.length) throw new ValidationError("Keep at least one area in the plan.");
  await repo.updateMany("MapPlan", { id: planId }, { items: next, note: s(input.note).slice(0, 1000) || null, dueAt: input.dueAt ?? null, updatedAt: now, editedAt: now });
}

/** Sends plans: each area becomes one adaptive set of the student's band (track MAP); the student is notified. */
export async function sendPlans(repo: Repo, actor: Actor, planIds: string[], now = new Date(), /** r74: REQUIRED source (teacher: the window's choice; automatic drafts: MAP) */ sourceIn?: string | null): Promise<{ sent: number; sets: number; skipped: string[] }> {
  assertCan(actor, "assignments:create");
  const source = requireSource(sourceIn);
  const bands = await bandSettings(repo, actor.schoolId);
  let sent = 0, sets = 0; const skipped: string[] = [];
  const poolCache = new Map<number, Awaited<ReturnType<typeof groupPools>>>();
  // ⚡ r79 ("Send all"): the plans, their classes (one access check each), grades and students in a few reads — not
  // four or five reads per plan
  const ids = [...new Set(planIds.map(s).filter(Boolean))].slice(0, 1000);
  const rows = ids.length ? await repo.findMany("MapPlan", { id: { in: ids } }) : [];
  const planOf = new Map(rows.map((r) => [s(r.id), r]));
  const classOf = new Map<string, Row>(), gradeOf = new Map<string, number>();
  for (const id of ids) {
    const r = planOf.get(id);
    if (!r || s(r.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Plan not found.");
    if (!classOf.has(s(r.classId))) classOf.set(s(r.classId), await assertClassAccess(repo, actor, s(r.classId)));
  }
  const gIds = [...new Set([...classOf.values()].map((c) => s(c.gradeId)))];
  for (const g of gIds.length ? await repo.findMany("Grade", { id: { in: gIds } }, { select: ["id", "level"] }) : []) gradeOf.set(s(g.id), Number(g.level ?? 0));
  const drafts = ids.map((id) => planOf.get(id)!).filter((r) => r.status === "DRAFT");
  const stRows = drafts.length ? await repo.findMany("Student", { id: { in: [...new Set(drafts.map((r) => s(r.studentId)))] } }, { select: ["id", "userId"] }) : [];
  const userOf = new Map(stRows.map((x) => [s(x.id), x.userId]));
  for (const r of drafts) { // sent, or dismissed by the teacher: skipped
    const planId = s(r.id);
    const grade = gradeOf.get(s(classOf.get(s(r.classId))?.gradeId)) ?? 0;
    if (!poolCache.has(grade)) poolCache.set(grade, await groupPools(repo, actor.schoolId!, grade));
    const pk = poolCache.get(grade)!;
    const assignmentIds: string[] = [];
    for (const it of (r.items ?? []) as PlanItem[]) {
      const pick = pickBand(pk.pools.get(it.group) ?? [], it.low, it.high, bands.size, it.skillIds);
      if (pick.ids.length < 3) { skipped.push(`${groupOf(it.group).name}: not enough questions yet`); continue; }
      const a = await assignQuestions(repo, actor, { classId: s(r.classId), studentIds: [s(r.studentId)], questionIds: pick.ids, title: `MAP plan · ${groupOf(it.group).name}`, exactTitle: true, track: "MAP", adaptive: { maxQuestions: Math.min(it.count, pick.ids.length) }, dueAt: r.dueAt ? new Date(time(r.dueAt)) : null, note: r.note ? s(r.note) : null, source }, now);
      assignmentIds.push(a.assignmentId); sets++;
    }
    if (!assignmentIds.length) continue;
    await repo.updateMany("MapPlan", { id: planId }, { status: "SENT", sentAt: now, assignmentIds, updatedAt: now });
    const userId = userOf.get(s(r.studentId));
    if (userId) await repo.create("Notification", { userId, type: "NEW_ASSIGNMENT", title: "🗺️ Your MAP plan is ready", body: "Open My MAP to see your plan and start practising.", link: "/student/map", readAt: null, createdAt: now });
    await audit(repo, { actorId: actor.userId, action: "map.plan.send", entityType: "MapPlan", entityId: planId, after: { sets: assignmentIds.length }, at: now });
    sent++;
  }
  return { sent, sets, skipped };
}

/** After new scores (e.g. Winter): drafts for the new term are made the next time the page opens; this starts over now. */
export async function rebuildDraft(repo: Repo, actor: Actor, planId: string): Promise<void> {
  const r = await ownPlan(repo, actor, planId);
  if (r.status === "SENT") throw new ValidationError("This plan was already sent. New MAP scores make a new plan.");
  await repo.deleteMany("MapPlan", { id: planId });
  await ensureDrafts(repo, actor, s(r.classId), s(r.subject) as Subject);
}

// ------------------------------------------------------------------ small groups

export interface SmallGroup { key: string; group: GroupKey; name: string; icon: string; band: string; low: number; high: number; students: { id: string; name: string; rit: number }[] }

/** Students of the class who need the same area (FOCUS) and are in the same RIT band: teach them together. */
export async function smallGroups(repo: Repo, actor: Actor, classId: string, subject: Subject): Promise<SmallGroup[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const [names, profiles, bands] = await Promise.all([studentNames(repo, ids), mapProfiles(repo, actor.schoolId!, ids, subject), bandSettings(repo, actor.schoolId)]);
  const map = new Map<string, SmallGroup>();
  for (const id of ids) for (const a of profiles.get(id)?.areas ?? []) {
    if (a.status !== "FOCUS" || a.rit === null) continue;
    const b = ritBand(a.rit, bands), key = `${a.group}|${b.label}`;
    const g = map.get(key) ?? { key, group: a.group, name: a.name, icon: a.icon, band: b.label, low: b.low, high: b.high, students: [] };
    g.students.push({ id, name: names.get(id)?.name ?? "Student", rit: a.rit });
    map.set(key, g);
  }
  return [...map.values()].filter((g) => g.students.length >= 2).sort((a, b) => b.students.length - a.students.length || a.low - b.low);
}

/** One adaptive set for a small group (their area and band). */
export async function sendToGroup(repo: Repo, actor: Actor, classId: string, input: { group: GroupKey; low: number; high: number; studentIds: string[]; count?: number; dueAt?: Date | null; /** r74: REQUIRED */ source?: string | null }, now = new Date()): Promise<{ assignmentId: string; questions: number }> {
  assertCan(actor, "assignments:create");
  const source = requireSource(input.source);
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const bands = await bandSettings(repo, actor.schoolId);
  const pick = pickBand((await groupPools(repo, actor.schoolId!, grade)).pools.get(input.group) ?? [], input.low, input.high, bands.size, null);
  if (pick.ids.length < 3) throw new ValidationError("Not enough questions for this area and band yet.");
  const r = await assignQuestions(repo, actor, { classId, studentIds: input.studentIds, questionIds: pick.ids, title: `MAP group · ${groupOf(input.group).name}`, exactTitle: true, track: "MAP", adaptive: { maxQuestions: Math.min(input.count ?? 15, pick.ids.length) }, dueAt: input.dueAt ?? null, source }, now);
  return { assignmentId: r.assignmentId, questions: pick.ids.length };
}

/** Question ids for a printable small-group worksheet (the group's band, mixed skills). */
export async function groupWorksheetIds(repo: Repo, actor: Actor, classId: string, group: GroupKey, low: number, high: number, n = 12): Promise<string[]> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const bands = await bandSettings(repo, actor.schoolId);
  const pick = pickBand((await groupPools(repo, actor.schoolId!, grade)).pools.get(group) ?? [], low, high, bands.size, null);
  const step = Math.max(1, Math.floor(pick.ids.length / n));
  return pick.ids.filter((_, i) => i % step === 0).slice(0, n);
}

// ------------------------------------------------------------------ RIT estimate from platform answers (goal counter)

/** Rasch estimate of the student's current RIT from careful answers of the last 45 days (needs 15+ answers),
 *  pulled toward the student's latest MAP RIT (or the grade norm): see estimateRits. */
export async function estimateRit(repo: Repo, schoolId: string, studentId: string, subject: Subject, now = new Date()): Promise<{ rit: number; answers: number } | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  if (!grade) return null;
  return (await estimateRits(repo, await groupPools(repo, schoolId, grade), [studentId], subject, now, { grade })).get(studentId) ?? null;
}

/** SD (RIT) of the prior around the student's latest MAP score: a 15-answer check moves it, but never to 120 or 300. */
export const RIT_PRIOR_SD = 10;

/**
 * Bayesian (MAP / posterior-mode) RIT from Rasch answers: likelihood of the answers × a normal prior N(prior, sd²).
 * All-correct or all-wrong answers stay finite and close to the prior instead of running to the scale's ends. Pure.
 */
export function ritPosterior(b: number[], x: number[], prior: number, sd = RIT_PRIOR_SD, c: number[] = []): number {
  let r = prior;
  for (let i = 0; i < 40; i++) {   // Fisher scoring on the RIT scale (10 RIT = 1 logit)
    let f = -(r - prior) / (sd * sd), d = 1 / (sd * sd);
    for (let k = 0; k < b.length; k++) {
      // Update 39B: the item format's guessing floor (3PL with fixed c): a lucky multiple-choice guess no longer
      // reads as ability — RIT 217 for an average new Grade 6 student came from c = 0
      const g = Math.min(0.5, Math.max(0, c[k] ?? 0));
      const q = 1 / (1 + Math.exp(-(r - b[k]) / 10)), p = g + (1 - g) * q, dp = ((1 - g) * q * (1 - q)) / 10;
      f += ((x[k] - p) / Math.max(1e-9, p * (1 - p))) * dp; d += (dp * dp) / Math.max(1e-9, p * (1 - p));
    }
    const step = f / d;
    r = Math.max(100, Math.min(350, r + step));
    if (Math.abs(step) < 0.01) break;
  }
  return r;
}

/** The same for many students of one grade at once (one query for all their answers, one for their MAP scores).
 *  The prior is the student's latest MAP RIT in the subject, else the grade's national norm (opts.grade), else the
 *  middle of the answered items. */
export async function estimateRits(repo: Repo, pk: Pools, studentIds: string[], subject: Subject, now = new Date(), opts: { grade?: number } = {}): Promise<Map<string, { rit: number; answers: number }>> {
  const out = new Map<string, { rit: number; answers: number }>();
  if (!studentIds.length) return out;
  const ritOf = new Map<string, number>();
  for (const g of GROUPS.filter((x) => x.subject === subject)) for (const q of pk.pools.get(g.key) ?? []) ritOf.set(q.id, q.rit);
  const since = new Date(now.getTime() - 45 * 86_400_000);
  // r79: bounded (the newest answers first)
  const all = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: since } }, { select: ["studentId", "questionId", "isCorrect", "rapidGuess"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 30_000 });
  const by = new Map<string, Row[]>();
  for (const a of all) if (!a.rapidGuess && ritOf.has(s(a.questionId))) { const k = s(a.studentId); const l = by.get(k); if (l) l.push(a); else by.set(k, [a]); }
  const ready = [...by].filter(([, list]) => list.length >= 15).map(([id]) => id);
  if (!ready.length) return out;
  // the prior: latest MAP RIT (overall score) in this subject, not after now
  const isSubj = subject === "READING" ? /read/i : /language/i;
  const maps = await repo.findMany("MapResult", { studentId: { in: ready }, goalName: null, testDate: { lte: now } }, { select: ["studentId", "subject", "rit", "testDate"] });
  const latestMap = new Map<string, { rit: number; at: number }>();
  for (const m of maps) {
    if (!isSubj.test(s(m.subject))) continue;
    const at = time(m.testDate), cur = latestMap.get(s(m.studentId));
    if (!cur || at > cur.at) latestMap.set(s(m.studentId), { rit: Number(m.rit), at });
  }
  const guess = await scoringParams(repo, ready.flatMap((id) => by.get(id)!.map((a) => s(a.questionId))));
  let gradeNorm: number | null | undefined;
  for (const id of ready) {
    const attempts = by.get(id)!;
    const b = attempts.map((a) => ritOf.get(s(a.questionId))!), x = attempts.map((a) => (a.isCorrect ? 1 : 0)), c = attempts.map((a) => guess.get(s(a.questionId))?.c ?? 0);
    let prior = latestMap.get(id)?.rit ?? null;
    if (prior === null && opts.grade) {
      if (gradeNorm === undefined) { await ensureNationalNorms(repo).catch(() => null); gradeNorm = (await nationalNorm(repo, opts.grade, seasonOf(null, now)))?.mean ?? null; }
      prior = gradeNorm;
    }
    if (prior === null) prior = b.reduce((t, v) => t + v, 0) / b.length;
    out.set(id, { rit: Math.round(ritPosterior(b, x, prior, RIT_PRIOR_SD, c)), answers: attempts.length });
  }
  return out;
}
