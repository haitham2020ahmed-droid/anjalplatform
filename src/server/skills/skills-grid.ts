/**
 * ⭐ Reports → Student Skills (skills grid): students × skills with the five star icons, for one class. A cell opens its
 * detail (dates, questions, accuracy, reviews, the student's self-check and a mismatch). Until the school's star
 * migration has run, cells with no status row are computed from the raw practice (grid-fallback.ts).
 * r72: columns grouped by strand (Literature · Informational · Vocabulary · Grammar · Writing), sorted by code inside a
 * group, with a short label (code + ≤ 4 words); each row counts its skills, each column "% mastered".
 * r74 (owner): ONLY the skills the teacher ASSIGNED (assigned-skills.ts) — an assigned skill nobody practised yet is a
 * column of ☆; a skill practised but never assigned is on no tab and in no number. Each column carries its source
 * badges (MAP · NAFS · Curriculum · Grammar · RTI); the Source filter shows one source's assignments only. A cell of a
 * student the skill was not assigned to is "—" and is left out of every count (each column counts its assigned
 * students). One star per student × skill everywhere (the same star in every source).
 * r78 (owner): "assigned" = EXACTLY the live rows of the teacher's Assigned page (assigned-skills.ts → teacher/assigned.ts
 * assignedWorkOfClasses): cancelled there = gone from every tab, number and report here.
 * r82 (owner: "STILL all skills"): a teacher of the class sees only what THEY assigned (their own Assigned page;
 * admin / coordinator: every teacher's), each assignment by the skill(s) the teacher CHOSE (chosen-skills.ts — never every
 * skill of a set's questions); NAFS adaptive practice adds one column per target standard in a "NAFS" area (nafs-skills.ts).
 * r84 (owner: "too crowded"): PLANS no longer add columns — the grid shows only the column pairs (single-skill assigns,
 * Curriculum Map section assigns, a NAFS practice on ONE standard); a plan's skills are on the Plans tab
 * (skills-plans.ts). By source and the Class report keep EVERY assigned pair (gridOf `all`), each student × skill once.
 * Light: members, names, the class's assignments (bounded, assigned-skills.ts) and the star rows of the assigned keys.
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { assertCan, ForbiddenError } from "../auth/rbac";
import { readableClasses, assertClassRead } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { currentRows, historyOf, ms, NOT_STARTED_VIEW, skillKeyIndex, viewOf, type StarStatus, type StarView } from "./status";
import { MISMATCH_TEXT, selfCheckMismatch } from "./status-extras";
import { countAnswers, countedSessions, engineOf, engineRows, fallbackFrom, readAnswers, starsMigrated, type Counted } from "./grid-fallback";
import { isGuessing, rangeBounds, STAR_RANK, starFromAnswers, starFromHistory, TREND_BACK_DAYS, trendOf, type DateRange, type GuessCount, type StudentTrend, type Trend } from "./skills-trend";
import { STRAND_LABEL, STRANDS, strandOf, type Strand } from "./my-skills";
import { classAssignedSkills, type PlanType } from "./assigned-skills";
import { viewerCreators } from "../teacher/assigned";
import { isNafsKey, nafsAnswers, nafsCells, nafsColumn, targetOfKey, type NafsCell } from "./nafs-skills";
import { schoolSkillIndex } from "../questions/skill-questions";
import { shortStandard } from "../../lib/report-columns";
import { ASSIGN_SOURCES, isAssignSource, type AssignSource } from "../../lib/assign-source";
import taxonomy from "../../../data/curriculum/taxonomy.json";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const DAY = 86_400_000;

export type GridPlan = "ALL" | AssignSource;
/** the source filter (owner r74): All sources · MAP · NAFS · Curriculum · Grammar · RTI */
export const GRID_PLANS: { key: GridPlan; label: string }[] = [
  { key: "ALL", label: "All sources" }, { key: "MAP", label: "MAP" }, { key: "NAFS", label: "NAFS" }, { key: "CURRICULUM", label: "Curriculum" }, { key: "GRAMMAR", label: "Grammar" }, { key: "RTI", label: "RTI" },
];
/** students per grid page (the grid is paginated: light on a big class) */
export const GRID_PAGE = 40;
export const isStrand = (v: unknown): v is Strand => (STRANDS as readonly string[]).includes(String(v));
/** a filter value of the page (older links: Year plan / Custom plans → All sources) */
export const isGridPlan = (v: unknown): v is GridPlan => v === "ALL" || (isAssignSource(v) && String(v) === String(v).toUpperCase());
/** "most of the class hasn't mastered": fewer than half of the students have ⭐ */
export const isWeakForClass = (mastered: number, total: number): boolean => total > 0 && mastered * 2 < total;

/** at most this many skill columns (the most assigned first), then grouped */
export const GRID_MAX_SKILLS = 60;

/** Did the student practise the skill (r72)? A star status other than ☆, or counted answers (rapid guesses never count). */
export const isPractised = (v: Pick<StarView, "status" | "answered"> | null | undefined): boolean => Boolean(v) && (v!.status !== "NOT_STARTED" || Number(v!.answered) > 0);
/** r74: a mastered star on the existing scale: ⭐ Mastered, or ☆⬆ Next level (mastered at the previous level) */
export const isMasteredStar = (v: Pick<StarView, "status"> | null | undefined): boolean => v?.status === "MASTERED" || v?.status === "NEXT_LEVEL";
/** r74: a star that calls for support on the existing scale: ◐ flagged "Needs support", or 🔄 Needs review */
export const isSupportStar = (v: { status: StarView["status"]; needsSupport?: boolean } | null | undefined): boolean => Boolean(v) && (Boolean(v!.needsSupport) || v!.status === "NEEDS_REVIEW");

const FAM_STEMS = new Map((taxonomy as { families: { code: string; ccssStems?: string[] }[] }).families.map((f) => [f.code, f.ccssStems ?? []]));
const STD = /^(RL|RI|RF|L|W|SL)\.\d+(\.\d+[a-z]?)?$/i;
/**
 * A skill's short code (pure): a taxonomy family → its first standard at the grade ("RL.4.2"; "RL.2" when the grade is
 * unknown); another skill → its own code when it is a standard code; else "" (the name alone).
 */
export function skillCode(key: string, rowCode: string | null | undefined, grade: number | null | undefined): string {
  const stem = key.startsWith("fam:") ? FAM_STEMS.get(key.slice(4))?.[0] : undefined;
  if (stem) return grade && grade > 0 ? stem.replace("{g}", String(grade)) : stem.replace(".{g}", "");
  const c = s(rowCode).replace(/^CCSS\.ELA-LITERACY\./i, "").trim();
  return STD.test(c) ? c.toUpperCase() : "";
}
/** "RL.4.2" < "RL.4.10" < "RI.4.1"; no code last; then the name (pure). */
export function byCode(a: { code: string; name: string }, b: { code: string; name: string }): number {
  if (!a.code !== !b.code) return a.code ? -1 : 1;
  return a.code.localeCompare(b.code, "en", { numeric: true }) || a.name.localeCompare(b.name);
}
/** % of the class with ⭐ (rounded; 0 for an empty class). */
export const masteredPct = (mastered: number, total: number): number => (total > 0 ? Math.round((100 * mastered) / total) : 0);

/**
 * mastered / started / support / review count the students the skill is ASSIGNED to (every page), each student once;
 * total = how many students it is assigned to (r74).
 */
export interface GridSkill {
  key: string; name: string; skillId: string | null; mastered: number; started: number; total: number; strand?: Strand; support?: number; review?: number;
  /** r72: the short code ("RL.4.2" or ""), the short name (≤ 4 words) and % of the class mastered */
  code?: string; short?: string; pct?: number;
  /** r74: the sources it was assigned from (badges), answered / correct (its assigned students), not started */
  sources?: AssignSource[]; answered?: number; correct?: number; notStarted?: number;
}
/** r72: per student, among the skills shown: how many they practised, how many ⭐; r74: how many are assigned to them */
export interface GridStudent {
  id: string; name: string; practised?: number; mastered?: number; assigned?: number;
  /** r75: ⬆️ ➖ ⬇️ against 2 weeks before (null: nothing assigned) and ⚡ answering too fast */
  trend?: Trend | null; guessing?: boolean;
}
/** r72: the strand groups of the columns, in order (`count` columns each) */
export interface GridGroup { strand: Strand; label: string; count: number }
export interface SkillsGrid {
  classes: { id: string; name: string }[]; classId: string | null; className: string; plan: GridPlan; weakOnly: boolean;
  students: GridStudent[]; skills: GridSkill[]; cells: Record<string, Record<string, StarView>>;
  /** r68: the strand filter, and the page of students shown (GRID_PAGE a page) */
  strand?: Strand | null; page?: number; pages?: number; totalStudents?: number;
  /** r70: false = the school's star migration has not run yet (cells with no row were computed from the practice) */
  migrated?: boolean;
  /** r70: how many cells came from the raw practice (fallback) */
  estimated?: number;
  /** r72: the column groups (strand) in order; the skills are in the same order */
  groups?: GridGroup[];
  /** r72: students of the class with at least one practised skill among the skills shown (whole class) */
  practisingStudents?: number;
  /** r74: student (this page) → key → the sources it was assigned from; a missing key = not assigned to them ("—") */
  assigned?: Record<string, Record<string, AssignSource[]>>;
  /** r75 (whole class): students ⬆️ ➖ ⬇️ in the last 2 weeks, how many answer too fast ⚡, stars won of all stars */
  trendCounts?: { up: number; same: number; down: number }; guessingCount?: number; starsWon?: number; starsAll?: number;
}

/**
 * r74: everything of one class for the three tabs (Skills grid · By source · Class report): EVERY student, every
 * assigned skill (with its sources), the star of each assigned pair and the sources of each pair. Read once.
 */
export interface ClassSkills {
  classes: { id: string; name: string }[]; classId: string | null; className: string; migrated: boolean; estimated: number;
  students: { id: string; name: string }[];
  /** every assigned skill (meta only; the counts are computed per view) */
  skills: { key: string; name: string; skillId: string | null; strand: Strand; code: string; short: string; sources: AssignSource[] }[];
  /** student → key → star, for the ASSIGNED pairs only */
  stars: Record<string, Record<string, StarView>>;
  /** student → key → the sources of that pair */
  pairs: Record<string, Record<string, AssignSource[]>>;
  /** r75: student → key → the star 2 weeks before (now, or the "To" date) — the trend ⬆️ ➖ ⬇️ */
  before?: Record<string, Record<string, StarStatus>>;
  /** r75: student → key → answers / rapid guesses in the last 2 weeks (or the chosen dates) — the ⚡ flag */
  guesses?: Record<string, Record<string, GuessCount>>;
  /** r75: the date filter (empty = the whole year) and the day the trend compares with */
  range?: DateRange; trendSince?: string;
  /** r84: student → key → its column sources, for the pairs that are Skills Grid COLUMNS (absent = every pair is a column) */
  cols?: Record<string, Record<string, AssignSource[]>>;
  /** r84: the class's live plans (their pairs are in stars / pairs too) */
  plans?: ClassPlan[];
}

/** r84: one live plan of the class: student → the plan's keys for them; `closed` = the teacher pressed "Close plan" */
export interface ClassPlan { id: string; title: string; type: PlanType; sentAt: string; createdById: string; students: Record<string, string[]>; closed: boolean }

const STATUS_READ = ["studentId", "skillKey", "level", "status", "skillId", "answered", "correct", "score", "startedAt", "masteredAt", "reviewDueAt", "needsSupportAt", "selfCheck", "updatedAt", "history"];
/** at most this many star rows are read for one class (assigned pairs × levels) */
export const STATUS_TAKE = 30000;

/**
 * Reads one class's assigned skills, stars and sources (see the header). r75: also the star 2 weeks before (trend),
 * the rapid guesses (⚡) and the date filter. Bounded: the star rows of the assigned keys WITH their history (one read
 * a 400 students), ONE read of the class's answers (newest FALLBACK_TAKE: the last 2 weeks / the chosen dates — or,
 * only when a star must be recomputed, every answer up to the end date), their sessions in batches of 500 and, only
 * then, one read of the engine's mastery.
 */
export async function classSkills(repo: Repo, actor: Actor, opts: { classId?: string | null; range?: DateRange | null } = {}, nowIn = new Date()): Promise<ClassSkills> {
  assertCan(actor, "reports:read");
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name) }));
  const classId = opts.classId && classes.some((c) => c.id === opts.classId) ? opts.classId : classes[0]?.id ?? null;
  const range: DateRange = opts.range ?? { from: null, to: null };
  const b = rangeBounds(range, nowIn);
  const cut = b.end - TREND_BACK_DAYS * DAY;
  const empty: ClassSkills = { classes, classId, className: "", migrated: true, estimated: 0, students: [], skills: [], stars: {}, pairs: {}, before: {}, guesses: {}, range, trendSince: new Date(cut).toISOString().slice(0, 10) };
  if (!classId) return empty;
  const klass = await assertClassRead(repo, actor, classId);
  const schoolId = s(klass.schoolId);
  const ids = [...new Set(await classMembers(repo, classId))]; // r70 audit: each student once (a doubled membership row)
  if (!ids.length) return { ...empty, className: s(klass.name) };
  // r82: a teacher of the class sees what THEY assigned (their Assigned page); the admin / a coordinator: every teacher's
  const [ix, creators] = await Promise.all([skillKeyIndex(repo, schoolId), viewerCreators(repo, actor, [classId])]);
  // r75: with dates, only the assignments made inside them
  const [names, assigned, migrated, sidx] = await Promise.all([studentNames(repo, ids), classAssignedSkills(repo, classId, ids, ix, b.on ? { since: b.start, until: b.end } : undefined, creators), starsMigrated(repo, schoolId), schoolSkillIndex(repo, schoolId)]);
  const allKeys = [...assigned.sourcesOf.keys()];
  // r82: the NAFS practice columns get their stars from the NAFS practice answers (nafs-skills.ts), never SkillStatus
  const keys = allKeys.filter((k) => !isNafsKey(k));
  const nafs = assigned.nafsPractices?.length && allKeys.some(isNafsKey)
    ? nafsCells(await nafsAnswers(repo, assigned.nafsPractices, ids, b.end).catch(() => [] as Row[]), { end: b.end, cut, start: b.start, on: b.on })
    : new Map<string, NafsCell>();
  // the star rows of the assigned keys, with their history (the trend reads it: no second query)
  const rows: Row[] = [];
  if (keys.length) for (let i = 0; i < ids.length && rows.length < STATUS_TAKE; i += 400) rows.push(...(await repo.findMany("SkillStatus", { studentId: { in: ids.slice(i, i + 400) }, ...(keys.length <= 400 ? { skillKey: { in: keys } } : {}) }, { select: STATUS_READ, take: STATUS_TAKE - rows.length })));
  const keySet = new Set(keys);
  const rowsOf = new Map<string, Row[]>();
  for (const r of rows) { if (!keySet.has(s(r.skillKey))) continue; const k = `${s(r.studentId)}|${s(r.skillKey)}`; (rowsOf.get(k) ?? rowsOf.set(k, []).get(k)!).push(r); }
  const pairList = ids.flatMap((id) => [...(assigned.byStudent.get(id)?.keys() ?? [])].filter((k) => !isNafsKey(k)).map((k) => [id, k] as const));
  // a star must be recomputed from the answers when its rows have no usable history (or, before the migration, no row)
  const recompute = (id: string, k: string, at: number) => { const pr = rowsOf.get(`${id}|${k}`); return pr?.length ? starFromHistory(pr, at) === null : !migrated; };
  const needAll = pairList.some(([id, k]) => recompute(id, k, cut) || (b.past && recompute(id, k, b.end)));
  const since = b.on ? b.start : b.end - TREND_BACK_DAYS * DAY;
  let answers: Row[] = [], ok = new Set<string>(), mastery: Row[] = [];
  if (keys.length) {
    try {
      answers = await readAnswers(repo, ids, needAll ? { until: b.end } : { since, until: b.end });
      ok = answers.length ? await countedSessions(repo, answers) : ok;
      if (needAll && answers.length) mastery = await engineRows(repo, ids, [...new Set(answers.map((a) => s(a.skillId)))].filter((x) => ix.keyOf.has(x)).slice(0, 2000));
    } catch { answers = []; }
  }
  const at = (a: Row) => ms(a.createdAt);
  const upTo = new Map<number, { counts: Map<string, Counted>; eng: Map<string, { score: number; mastered: boolean }> }>();
  const stateAt = (t: number) => upTo.get(t) ?? upTo.set(t, { counts: countAnswers(answers.filter((a) => at(a) <= t), ok, ix.keyOf), eng: engineOf(mastery, ix.keyOf, t) }).get(t)!;
  const starAt = (id: string, k: string, t: number): StarStatus => {
    const pr = rowsOf.get(`${id}|${k}`);
    const h = pr?.length ? starFromHistory(pr, t) : migrated ? "NOT_STARTED" : null;
    if (h) return h;
    const x = stateAt(t);
    return starFromAnswers(x.counts.get(`${id}|${k}`)?.answered ?? 0, Boolean(x.eng.get(`${id}|${k}`)?.mastered));
  };
  // r70: not migrated yet → the assigned pairs with no row come from the raw practice (as of the end date)
  const est = !migrated && keys.length ? fallbackFrom(stateAt(b.end).counts, engineOf(mastery, ix.keyOf, b.past ? b.end : null)) : new Map<string, Map<string, StarView>>();
  // the dates: only the answers given inside them count (careful practice answers, the star's own rule)
  const inRange = b.on ? countAnswers(answers.filter((a) => at(a) <= b.end && (b.start === null || at(a) >= b.start)), ok, ix.keyOf) : null;
  // ⚡: every answer on an assigned skill in the last 2 weeks (or the dates), rapid guesses included
  const guess = new Map<string, GuessCount>();
  for (const a of answers) {
    if (at(a) > b.end || at(a) < (since ?? 0)) continue;
    const key = ix.keyOf.get(s(a.skillId)); if (!key) continue;
    const k = `${s(a.studentId)}|${key}`, c = guess.get(k) ?? { answers: 0, rapid: 0 };
    c.answers++; if (a.rapidGuess === true || a.rapidGuess === 1) c.rapid++;
    guess.set(k, c);
  }
  const stars: ClassSkills["stars"] = {}, pairs: ClassSkills["pairs"] = {}, before: NonNullable<ClassSkills["before"]> = {}, guesses: NonNullable<ClassSkills["guesses"]> = {};
  let estimated = 0;
  for (const id of ids) {
    stars[id] = {}; pairs[id] = {}; before[id] = {}; guesses[id] = {};
    for (const [k, src] of assigned.byStudent.get(id) ?? []) {
      if (isNafsKey(k)) {
        // r82: a NAFS practice target — its star from the student's NAFS practice answers (nafs-skills.ts)
        const c = nafs.get(`${id}|${k}`);
        const v = c?.now ?? NOT_STARTED_VIEW(k);
        stars[id][k] = c?.inRange ? { ...v, answered: c.inRange.answered, correct: c.inRange.correct } : b.on ? { ...v, answered: 0, correct: 0 } : v;
        pairs[id][k] = ASSIGN_SOURCES.filter((x) => src.has(x));
        before[id][k] = c?.before ?? "NOT_STARTED";
        continue;
      }
      const cur =currentRows(rowsOf.get(`${id}|${k}`) ?? []).get(k);
      const row = cur ? viewOf(cur) : undefined;
      const real = row && (row.status !== "NOT_STARTED" || row.answered > 0 || row.updatedAt) ? row : undefined;
      let v = real ?? est.get(id)?.get(k);
      if (!real && v) estimated++;
      v ??= NOT_STARTED_VIEW(k);
      // a "To" date in the past: the star as it was that day
      if (b.past) { const st = starAt(id, k, b.end); if (st !== v.status) v = { ...v, status: st, needsSupport: false, masteredAt: STAR_RANK[st] === 2 ? v.masteredAt : null }; }
      if (inRange) { const c = inRange.get(`${id}|${k}`); v = { ...v, answered: c?.answered ?? 0, correct: c?.correct ?? 0 }; }
      stars[id][k] = v;
      pairs[id][k] = ASSIGN_SOURCES.filter((x) => src.has(x));
      before[id][k] = starAt(id, k, cut);
      const gc = guess.get(`${id}|${k}`); if (gc) guesses[id][k] = gc;
    }
  }
  const skills = allKeys.map((key) => {
    if (isNafsKey(key)) { const c = nafsColumn(key); return { key, name: c.name, skillId: null, strand: "NAFS" as Strand, code: c.code, short: c.short, sources: assigned.sourcesOf.get(key) ?? [] }; }
    const sid = assigned.skillIdOf.get(key) ?? ix.skillsOf.get(key)?.[0] ?? null;
    const row = sid ? sidx.skillOf.get(sid) ?? null : null;
    const name = ix.nameOf.get(key) ?? row?.name ?? key;
    const code = skillCode(key, row?.code, sid ? ix.gradeOf.get(sid) ?? row?.grade : null);
    return { key, name, skillId: sid, strand: strandOf(key, row), code, short: shortStandard(code, name, 4).short, sources: assigned.sourcesOf.get(key) ?? [] };
  });
  const students = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  // r84: which pairs are Skills Grid columns, and the plans (with the teacher's "Close plan" flags: one row)
  const cols: NonNullable<ClassSkills["cols"]> = {};
  for (const id of ids) cols[id] = Object.fromEntries([...(assigned.cols?.get(id) ?? [])].filter(([k]) => stars[id]?.[k]).map(([k, src]) => [k, ASSIGN_SOURCES.filter((x) => src.has(x))]));
  const closed = assigned.plans?.length ? await closedPlans(repo, schoolId, classId) : {};
  const plans: ClassPlan[] = (assigned.plans ?? []).map((p) => ({
    id: p.id, title: p.title, type: p.type, sentAt: new Date(p.sentAt || 0).toISOString(), createdById: p.createdById, closed: Boolean(closed[p.id]),
    students: Object.fromEntries([...p.byStudent].map(([st, ks]) => [st, [...ks].filter((k) => stars[st]?.[k])] as const).filter(([, ks]) => ks.length)),
  })).filter((p) => Object.keys(p.students).length);
  return { classes, classId, className: s(klass.name), migrated, estimated, students, skills, stars, pairs, before, guesses, range, trendSince: empty.trendSince, cols, plans };
}

/** r84: the SchoolSetting row that keeps a class's closed plans (the teacher's "Close plan"): plan id → when */
export const closedPlansKey = (classId: string) => `plans.closed:${classId}`;
export async function closedPlans(repo: Repo, schoolId: string, classId: string): Promise<Record<string, string>> {
  try {
    const row = (await repo.findMany("SchoolSetting", { schoolId, key: closedPlansKey(classId) }, { take: 1 }))[0];
    let v: unknown = row?.value;
    if (typeof v === "string") v = JSON.parse(v);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, string> : {};
  } catch { return {}; }
}

/** Pure (r84): only the Skills Grid COLUMN pairs (plans' skills leave the grid); a view without `cols` is unchanged. */
export function columnsOnly(d: ClassSkills): ClassSkills {
  if (!d.cols) return d;
  const stars: ClassSkills["stars"] = {}, pairs: ClassSkills["pairs"] = {};
  for (const st of d.students) {
    stars[st.id] = {}; pairs[st.id] = {};
    for (const k of Object.keys(d.cols[st.id] ?? {})) if (d.stars[st.id]?.[k]) { stars[st.id][k] = d.stars[st.id][k]; pairs[st.id][k] = d.cols[st.id][k]; }
  }
  const skills = d.skills.filter((k) => d.students.some((st) => pairs[st.id][k.key])).map((k) => ({ ...k, sources: ASSIGN_SOURCES.filter((x) => d.students.some((st) => pairs[st.id][k.key]?.includes(x))) }));
  return { ...d, skills, stars, pairs };
}

/** Pure (r75): a student's trend over their assigned pairs in this view (null: nothing assigned / no trend data). */
export function studentTrend(d: ClassSkills, id: string): StudentTrend | null {
  const mine = Object.entries(d.stars[id] ?? {});
  if (!mine.length || !d.before) return null;
  return trendOf(mine.map(([k, v]) => ({ then: d.before![id]?.[k] ?? "NOT_STARTED", now: v.status })));
}
/** Pure (r75): a student's answers / rapid guesses on their assigned pairs in this view. */
export function studentGuess(d: ClassSkills, id: string): GuessCount {
  const out = { answers: 0, rapid: 0 };
  for (const k of Object.keys(d.stars[id] ?? {})) { const c = d.guesses?.[id]?.[k]; if (c) { out.answers += c.answers; out.rapid += c.rapid; } }
  return out;
}

/** Pure: only one source's assigned pairs (the per-source grid and card); "ALL" = unchanged. */
export function onlySource(d: ClassSkills, src: GridPlan): ClassSkills {
  if (src === "ALL") return d;
  const stars: ClassSkills["stars"] = {}, pairs: ClassSkills["pairs"] = {};
  for (const st of d.students) {
    stars[st.id] = {}; pairs[st.id] = {};
    for (const [k, list] of Object.entries(d.pairs[st.id] ?? {})) if (list.includes(src)) { stars[st.id][k] = d.stars[st.id][k]; pairs[st.id][k] = [src]; }
  }
  const skills = d.skills.filter((k) => d.students.some((st) => pairs[st.id][k.key])).map((k) => ({ ...k, sources: [src] }));
  return { ...d, skills, stars, pairs };
}

/** Pure: a skill's counts over the students it is assigned to. */
export function skillCounts(d: ClassSkills, key: string): Pick<GridSkill, "mastered" | "started" | "total" | "support" | "review" | "pct" | "answered" | "correct" | "notStarted"> {
  const vs = d.students.map((st) => d.stars[st.id]?.[key]).filter((v): v is StarView => Boolean(v));
  const mastered = vs.filter(isMasteredStar).length, started = vs.filter(isPractised).length;
  return {
    mastered, started, total: vs.length, support: vs.filter((v) => v.needsSupport).length, review: vs.filter((v) => v.status === "NEEDS_REVIEW").length, pct: masteredPct(mastered, vs.length),
    answered: vs.reduce((n, v) => n + Number(v.answered || 0), 0), correct: vs.reduce((n, v) => n + Number(v.correct || 0), 0), notStarted: vs.length - started,
  };
}

/**
 * Pure: the grid view of the class data (filters, column order, groups, row counts, page). r84: the Skills Grid shows the
 * COLUMN pairs only; `all` = every assigned pair, plans' skills included (By source's star grid, the Class report).
 */
export function gridOf(d: ClassSkills, opts: { plan?: GridPlan; weakOnly?: boolean; strand?: Strand | null; page?: number; all?: boolean } = {}): SkillsGrid {
  const plan: GridPlan = opts.plan ?? "ALL";
  const v = onlySource(opts.all ? d : columnsOnly(d), plan);
  let skills: GridSkill[] = v.skills.map((k) => ({ key: k.key, name: k.name, skillId: k.skillId, strand: k.strand, code: k.code, short: k.short, sources: k.sources, ...skillCounts(v, k.key) }));
  if (opts.strand) skills = skills.filter((k) => k.strand === opts.strand);
  if (opts.weakOnly) skills = skills.filter((k) => isWeakForClass(k.mastered, k.total));
  // bounded: the most assigned GRID_MAX_SKILLS, then grouped by strand (the strand order) and sorted by code
  skills = skills.sort((a, b) => b.total - a.total || b.started - a.started || a.name.localeCompare(b.name)).slice(0, GRID_MAX_SKILLS);
  const rank = (st: Strand | undefined) => STRANDS.indexOf(st ?? "LITERATURE");
  skills.sort((a, b) => rank(a.strand) - rank(b.strand) || byCode({ code: a.code ?? "", name: a.name }, { code: b.code ?? "", name: b.name }));
  const groups: GridGroup[] = [];
  for (const k of skills) { const st = k.strand ?? "LITERATURE", last = groups[groups.length - 1]; if (last?.strand === st) last.count++; else groups.push({ strand: st, label: STRAND_LABEL[st], count: 1 }); }
  const shownKeys = skills.map((k) => k.key);
  const mine = (id: string) => shownKeys.filter((k) => v.stars[id]?.[k]);
  const practisingStudents = v.students.filter((st) => mine(st.id).some((k) => isPractised(v.stars[st.id][k]))).length;
  const everyone: GridStudent[] = v.students.map((st) => ({
    id: st.id, name: st.name, assigned: mine(st.id).length, practised: mine(st.id).filter((k) => isPractised(v.stars[st.id][k])).length, mastered: mine(st.id).filter((k) => isMasteredStar(v.stars[st.id][k])).length,
    trend: studentTrend(v, st.id)?.trend ?? null, guessing: isGuessing(studentGuess(v, st.id)),
  }));
  // r68: paginated (GRID_PAGE students a page); the column counts stay for the whole class
  const pages = Math.max(1, Math.ceil(everyone.length / GRID_PAGE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(opts.page) || 1)));
  const students = everyone.slice((page - 1) * GRID_PAGE, page * GRID_PAGE);
  const cells: SkillsGrid["cells"] = {}, assigned: NonNullable<SkillsGrid["assigned"]> = {};
  for (const st of students) {
    cells[st.id] = Object.fromEntries(shownKeys.map((k) => [k, v.stars[st.id]?.[k] ?? NOT_STARTED_VIEW(k)]));
    assigned[st.id] = Object.fromEntries(shownKeys.filter((k) => v.pairs[st.id]?.[k]).map((k) => [k, v.pairs[st.id][k]]));
  }
  const trendCounts = { up: 0, same: 0, down: 0 };
  for (const st of everyone) if (st.trend) trendCounts[st.trend === "UP" ? "up" : st.trend === "DOWN" ? "down" : "same"]++;
  return {
    classes: d.classes, classId: d.classId, className: d.className, plan, weakOnly: Boolean(opts.weakOnly), students, skills, cells, strand: opts.strand ?? null, page, pages, totalStudents: everyone.length, migrated: d.migrated, estimated: d.estimated, groups, practisingStudents, assigned,
    trendCounts, guessingCount: everyone.filter((x) => x.guessing).length, starsWon: skills.reduce((a, k) => a + k.mastered, 0), starsAll: skills.reduce((a, k) => a + k.total, 0),
  };
}

export async function skillsGrid(repo: Repo, actor: Actor, opts: { classId?: string | null; plan?: GridPlan; weakOnly?: boolean; strand?: Strand | null; page?: number; range?: DateRange | null; all?: boolean } = {}, now = new Date()): Promise<SkillsGrid> {
  return gridOf(await classSkills(repo, actor, { classId: opts.classId, range: opts.range }, now), opts);
}

export interface CellDetail {
  student: string; skill: string; key: string; view: StarView; accuracy: number | null; progressAt: string | null;
  reviews: { at: string; outcome: string; right?: number; of?: number }[]; history: { at: string; status: string; why: string }[];
  mismatch: string | null;
}
/** One cell's detail (the teacher clicked it): one read of the student's rows of that skill. */
export async function cellDetail(repo: Repo, actor: Actor, studentId: string, key: string): Promise<CellDetail | null> {
  assertCan(actor, "reports:read");
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  if (actor.role === "TEACHER") {
    const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
    const mine = new Set((await readableClasses(repo, actor)).map((c) => s(c.id)));
    if (!m.some((x) => mine.has(s(x.classId)))) throw new ForbiddenError("This student is not in your classes.");
  }
  if (isNafsKey(key)) {
    // r82: a NAFS practice column — the student's NAFS practice answers of that target (one bounded read)
    const ans = await repo.findMany("NafsPracticeAnswer", { studentId, target: targetOfKey(key) }, { select: ["practiceId", "studentId", "target", "difficulty", "correct", "at"], orderBy: [{ field: "at", dir: "desc" }], take: 500 }).catch(() => [] as Row[]);
    const v = nafsCells(ans, { end: Number.MAX_SAFE_INTEGER, cut: Number.MAX_SAFE_INTEGER }).get(`${studentId}|${key}`)?.now ?? NOT_STARTED_VIEW(key);
    const name = (await studentNames(repo, [studentId])).get(studentId)?.name ?? "Student";
    const c = nafsColumn(key);
    return { student: name, skill: [c.code, c.name].filter(Boolean).join(" "), key, view: v, accuracy: v.answered ? Math.round((100 * v.correct) / v.answered) : null, progressAt: v.updatedAt, reviews: [], history: [], mismatch: null };
  }
  const rows = await repo.findMany("SkillStatus", { studentId, skillKey: key });
  const r = currentRows(rows).get(key);
  const ix = await skillKeyIndex(repo, s(st.schoolId));
  const name = (await studentNames(repo, [studentId])).get(studentId)?.name ?? "Student";
  if (!r) return { student: name, skill: ix.nameOf.get(key) ?? key, key, view: NOT_STARTED_VIEW(key), accuracy: null, progressAt: null, reviews: [], history: [], mismatch: null };
  const v = viewOf(r);
  const h = rows.flatMap((x) => historyOf(x.history)).sort((a, b) => ms(a.at) - ms(b.at));
  const mm = selfCheckMismatch(v);
  return {
    student: name, skill: ix.nameOf.get(key) ?? key, key, view: v, accuracy: v.answered ? Math.round((100 * v.correct) / v.answered) : null,
    progressAt: r.progressAt ? new Date(ms(r.progressAt)).toISOString() : null,
    reviews: h.filter((x) => x.review || x.mixedFail).map((x) => ({ at: s(x.at), outcome: x.review ? s(x.review) : "MIXED_MISS", right: x.right === undefined ? undefined : Number(x.right), of: x.of === undefined ? undefined : Number(x.of) })),
    history: h.filter((x) => x.status).map((x) => ({ at: s(x.at), status: s(x.status), why: s(x.why) })),
    mismatch: mm ? MISMATCH_TEXT[mm] : null,
  };
}
