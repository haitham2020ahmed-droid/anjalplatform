/**
 * ⚡ "Make the test for me" (Assessments → New test): the teacher chooses lessons (Curriculum Map selections or
 * sections) and / or skills, the number of questions (5–60), the level (Below / On / Above / mixed, or "fit my class"
 * from the class's recent accuracy), an optional answer-type mix and passage share, and the total marks.
 *
 * The platform builds a balanced test:
 *   - spread evenly across the chosen lessons and skills (each one is a "bucket" with its share of the questions);
 *   - never the same content twice (same id, or a copy: same text and answer — questions/fresh.ts);
 *   - questions on one passage are kept together (at most MAX_PER_PASSAGE of one passage);
 *   - questions the class saw recently (answered, or in a set of the class) are used only when nothing else is left;
 *   - ordered easy → hard (passage groups stay together);
 *   - marks = total / number (editable per question afterwards).
 * The result fills the builder's selected list; the teacher can view, 🔁 Replace (a similar question: same skill and
 * level), remove and reorder, then Preview → Preview as student → Assign as usual.
 *
 * Bounded reads: at most MAX_BUCKETS lessons and skills, CANDIDATES_PER_BUCKET candidates per bucket, the class's
 * attempts of the last RECENT_DAYS days (capped), chunked `in` queries. The adaptive engine is not touched.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { loadQuestionItems } from "../practice/items";
import { contentKeysForIds } from "../questions/fresh";
import { questionsOfSkill, type QLevel } from "./question-source";
import { allowedNodes, describePicks, usableLinks, type MapSourceQuestion } from "./map-source";
import { MAX_TEST_QUESTIONS, spreadMarks } from "./assessments";

const s = (v: unknown) => String(v ?? "");

export const MIN_GENERATED = 5;
export const MAX_GENERATED = MAX_TEST_QUESTIONS; // 60
export const MAX_BUCKETS = 20;
export const CANDIDATES_PER_BUCKET = 150;
export const MAX_PER_PASSAGE = 4;
export const RECENT_DAYS = 60;
const ACCURACY_DAYS = 30;
const MAX_RECENT_ROWS = 20_000;
const LEVEL_RANK: Record<QLevel, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
const LEVELS: QLevel[] = ["BELOW", "ON", "ABOVE"];

export type LevelChoice = QLevel | "MIXED" | "FIT";
/** The answer types the teacher can ask for (the mix is optional). */
export const GEN_TYPES = ["MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK", "TWO_PART", "GRID", "HOT_TEXT", "MATCHING", "SENTENCE_ORDER", "ERROR_CORRECTION"] as const;

export interface GenerateInput {
  /** Curriculum Map codes: a selection / text set (e.g. G4.U1.TS1, all its sections) or one section (G4.U1.TS1.CV) */
  lessons?: string[];
  skillIds?: string[];
  count: number;
  level: LevelChoice | string;
  /** needed for "fit my class" and for leaving out what the class saw recently */
  classId?: string | null;
  /** optional answer-type mix: type code → share (percent; normalized) */
  types?: Record<string, number> | null;
  /** optional share of questions with a reading passage (0–100) */
  passageShare?: number | null;
  /** total marks (default: 1 per question) */
  totalMarks?: number | null;
  seed?: string;
}

export interface GeneratedTest {
  questions: (MapSourceQuestion & { marks: number })[];
  marks: Record<string, number>;
  /** the level used ("fit my class": the class's level) */
  level: LevelChoice;
  /** the class's recent accuracy (percent) when "fit my class" was chosen */
  accuracy: number | null;
  notes: string[];
}

// ------------------------------------------------------------------ the pure planner

export interface GenCandidate { id: string; bucket: string; level: QLevel; type: string; passage: string | null; keys: string[]; seen: boolean; difficulty: number }
export interface GenPlan { count: number; levels: Partial<Record<QLevel, number>>; types?: Record<string, number> | null; passageShare?: number | null; seed?: string }

/** A small, stable hash (FNV-1a) — a seeded order without heavy maths. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const seededOrder = <T,>(list: T[], key: (t: T) => string, seed: string): T[] => list.map((t) => ({ t, h: hash(`${seed}:${key(t)}`) })).sort((a, b) => a.h - b.h).map((x) => x.t);

/** How many questions of each level: one level → all of it; mixed → about 30% Below, 40% On, 30% Above. */
export function levelTargets(level: LevelChoice, count: number): Partial<Record<QLevel, number>> {
  if (level === "MIXED") { const below = Math.round(count * 0.3), above = Math.round(count * 0.3); return { BELOW: below, ON: count - below - above, ABOVE: above }; }
  return { [level === "FIT" ? "ON" : level]: count };
}

/** Whole-number targets that add up to `count`, from shares (largest remainders). */
function shareTargets(shares: Record<string, number>, count: number): Record<string, number> {
  const entries = Object.entries(shares).filter(([, v]) => Number(v) > 0);
  const sum = entries.reduce((a, [, v]) => a + Number(v), 0);
  if (!sum) return {};
  const raw = entries.map(([k, v]) => ({ k, x: (count * Number(v)) / sum }));
  const out: Record<string, number> = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.x)]));
  let left = count - Object.values(out).reduce((a, v) => a + v, 0);
  for (const r of [...raw].sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)))) { if (left <= 0) break; out[r.k]++; left--; }
  return out;
}

/**
 * Picks `count` questions from the candidates: balanced across buckets, at the wanted levels / types / passage share,
 * unseen first, no copies, passage questions kept together, ordered easy → hard. Rules are loosened step by step
 * only when the strict choice runs out (each loosening adds a note).
 */
export function planTest(cands: GenCandidate[], buckets: string[], plan: GenPlan): { ids: string[]; notes: string[] } {
  const count = Math.max(0, Math.round(plan.count));
  const seed = s(plan.seed);
  const notes: string[] = [];
  const levelLeft: Record<QLevel, number> = { BELOW: plan.levels.BELOW ?? 0, ON: plan.levels.ON ?? 0, ABOVE: plan.levels.ABOVE ?? 0 };
  const typeLeft: Record<string, number> | null = plan.types && Object.keys(plan.types).length ? shareTargets(plan.types, count) : null;
  const share = plan.passageShare === null || plan.passageShare === undefined || s(plan.passageShare) === "" ? null : Math.max(0, Math.min(100, Number(plan.passageShare)));
  let passageLeft = share === null ? Infinity : Math.round((count * share) / 100);
  let plainLeft = share === null ? Infinity : count - passageLeft;
  // each bucket's share of the questions
  const bs = buckets.filter((b) => cands.some((c) => c.bucket === b));
  const quota = new Map(bs.map((b, i) => [b, Math.floor(count / Math.max(1, bs.length)) + (i < count % Math.max(1, bs.length) ? 1 : 0)]));
  const taken = new Map(bs.map((b) => [b, 0]));
  // candidates per bucket: unseen first, then a seeded order
  const queue = new Map(bs.map((b) => [b, seededOrder(cands.filter((c) => c.bucket === b), (c) => c.id, seed).sort((x, y) => Number(x.seen) - Number(y.seen))]));
  const chosen: GenCandidate[] = [];
  const usedIds = new Set<string>(), usedKeys = new Set<string>();
  const perPassage = new Map<string, number>();
  const isCopy = (c: GenCandidate) => usedIds.has(c.id) || c.keys.some((k) => usedKeys.has(k));

  type Rules = { seen: boolean; type: boolean; passage: boolean; quota: boolean; level: boolean };
  const fits = (c: GenCandidate, r: Rules) =>
    !isCopy(c)
    && (!c.passage || (perPassage.get(c.passage) ?? 0) < MAX_PER_PASSAGE)
    && (!r.seen || !c.seen)
    && (!r.level || levelLeft[c.level] > 0)
    && (!r.type || !typeLeft || (typeLeft[c.type] ?? 0) > 0)
    && (!r.passage || (c.passage ? passageLeft > 0 : plainLeft > 0));
  const take = (c: GenCandidate) => {
    chosen.push(c); usedIds.add(c.id); for (const k of c.keys) usedKeys.add(k);
    taken.set(c.bucket, (taken.get(c.bucket) ?? 0) + 1);
    if (c.passage) { perPassage.set(c.passage, (perPassage.get(c.passage) ?? 0) + 1); passageLeft--; } else plainLeft--;
    if (levelLeft[c.level] > 0) levelLeft[c.level]--;
    if (typeLeft && (typeLeft[c.type] ?? 0) > 0) typeLeft[c.type]--;
  };
  /** one pick for this bucket: a question, plus (for a passage) more questions of the same passage that also fit */
  const pickFrom = (b: string, r: Rules): boolean => {
    const room = () => Math.min(count - chosen.length, r.quota ? (quota.get(b) ?? 0) - (taken.get(b) ?? 0) : Infinity);
    if (room() <= 0) return false;
    const list = queue.get(b) ?? [];
    // a passage already in the test first (keeps its questions together), then the queue's order
    // otherwise the most-needed level and answer type first (ties: the queue's order)
    const need = (c: GenCandidate) => levelLeft[c.level] + (typeLeft ? typeLeft[c.type] ?? 0 : 0);
    let best: GenCandidate | undefined;
    for (const c of list) if (fits(c, r) && (!best || need(c) > need(best))) best = c;
    const first = list.find((c) => c.passage && perPassage.has(c.passage) && fits(c, r)) ?? best;
    if (!first) return false;
    take(first);
    if (first.passage) for (const c of list) { if (room() <= 0 || (perPassage.get(first.passage) ?? 0) >= Math.min(MAX_PER_PASSAGE, 3)) break; if (c.passage === first.passage && fits(c, r)) take(c); }
    return true;
  };
  const steps: [Rules, string | null][] = [
    [{ seen: true, type: true, passage: true, quota: true, level: true }, null],
    [{ seen: true, type: false, passage: true, quota: true, level: true }, "The answer-type mix could not be followed exactly: not enough questions of some types."],
    [{ seen: true, type: false, passage: false, quota: true, level: true }, "The passage share could not be followed exactly."],
    [{ seen: false, type: false, passage: false, quota: true, level: true }, "Some questions your class saw recently were used: there were not enough new ones."],
    [{ seen: false, type: false, passage: false, quota: false, level: true }, "Some lessons or skills had too few questions: others gave more."],
    [{ seen: false, type: false, passage: false, quota: false, level: false }, "Not enough questions at the chosen level: topped up from other levels."],
  ];
  for (const [rules, note] of steps) {
    if (chosen.length >= count) break;
    const before = chosen.length;
    let progress = true;
    while (progress && chosen.length < count) { progress = false; for (const b of bs) if (chosen.length < count && pickFrom(b, rules)) progress = true; }
    if (note && chosen.length > before) notes.push(note);
  }
  if (chosen.length < count) notes.push(`Only ${chosen.length} question(s) are available for these choices.`);
  return { ids: easyToHard(chosen).map((c) => c.id), notes };
}

/** Easy → hard (level, then difficulty); questions of one passage stay together, placed by their average. */
export function easyToHard<T extends { id: string; level: QLevel; difficulty: number; passage: string | null }>(list: T[]): T[] {
  const rank = (c: T) => LEVEL_RANK[c.level] * 10 + c.difficulty;
  const groups = new Map<string, T[]>();
  for (const c of list) { const k = c.passage ? `p:${c.passage}` : `q:${c.id}`; groups.set(k, [...(groups.get(k) ?? []), c]); }
  const units = [...groups.values()].map((g) => ({ g: [...g].sort((a, b) => rank(a) - rank(b)), r: g.reduce((a, c) => a + rank(c), 0) / g.length }));
  return units.sort((a, b) => a.r - b.r).flatMap((u) => u.g);
}

// ------------------------------------------------------------------ data: candidates, the class, generate, replace

function staff(actor: Actor): void {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can build tests.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  assertCan(actor, "questions:read");
}

async function inChunks(ids: string[], size: number, fn: (c: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

/** What the class saw recently (answered, or in one of its sets) and its recent accuracy (percent, null without data). */
export async function classHistory(repo: Repo, actor: Actor, classId: string | null | undefined, now = new Date()): Promise<{ seen: Set<string>; accuracy: number | null; answers: number }> {
  if (!classId) return { seen: new Set(), accuracy: null, answers: 0 };
  const klass = await assertClassAccess(repo, actor, classId); // a teacher: own classes only
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const recent = new Date(now.getTime() - ACCURACY_DAYS * 86_400_000);
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const attempts = members.length ? await repo.findMany("QuestionAttempt", { studentId: { in: members }, createdAt: { gte: since } }, { select: ["questionId", "isCorrect", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_RECENT_ROWS }) : [];
  const sets = await repo.findMany("Assignment", { classId: klass.id, deletedAt: null, createdAt: { gte: since } }, { select: ["assessmentId"], take: 300 });
  const aIds = [...new Set(sets.map((a) => s(a.assessmentId)).filter(Boolean))];
  const inSets = aIds.length ? await inChunks(aIds, 200, (c) => repo.findMany("AssessmentQuestion", { assessmentId: { in: c } }, { select: ["questionId"] })) : [];
  const seen = new Set([...attempts.map((a) => s(a.questionId)), ...inSets.map((x) => s(x.questionId))]);
  const lately = attempts.filter((a) => new Date(String(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt)) >= recent);
  const accuracy = lately.length ? Math.round((100 * lately.filter((a) => a.isCorrect === true || a.isCorrect === 1).length) / lately.length) : null;
  return { seen, accuracy, answers: lately.length };
}

/** "Fit my class": 80%+ recent accuracy → Above, 60–79% → On, under 60% → Below; no recent answers → On. */
export const levelFromAccuracy = (pct: number | null): QLevel => (pct === null ? "ON" : pct >= 80 ? "ABOVE" : pct >= 60 ? "ON" : "BELOW");

type Raw = { id: string; bucket: string; level: QLevel };

/** The candidates of the chosen lessons and skills (bounded per bucket), with type, passage, difficulty and copy keys. */
async function candidates(repo: Repo, actor: Actor, lessons: string[], skillIds: string[], seen: Set<string>, seed: string): Promise<{ list: GenCandidate[]; buckets: string[]; notes: string[] }> {
  const notes: string[] = [];
  const raw: Raw[] = [];
  const buckets: string[] = [];
  if (lessons.length) {
    const nodes = await allowedNodes(repo, actor);
    for (const code of lessons) {
      const c = code.toUpperCase();
      const mine = nodes.filter((n) => n.code.toUpperCase() === c || n.code.toUpperCase().startsWith(`${c}.`));
      if (!mine.length) throw new ForbiddenError("A chosen lesson is not on the Curriculum Map of your classes' grades.");
      const levelOf = new Map(mine.map((n) => [n.id, n.level]));
      const links = await usableLinks(repo, mine.map((n) => n.id));
      const b = `L:${c}`;
      buckets.push(b);
      const rows = links.map((l) => ({ id: s(l.q.id), bucket: b, level: (levelOf.get(l.nodeId) ?? fromDifficulty(Number(l.q.difficultyLevel ?? 4))) as QLevel }));
      if (!rows.length) notes.push(`${code} has no questions yet.`);
      raw.push(...limit(rows, seen, seed));
    }
  }
  for (const id of skillIds) {
    const pool = await questionsOfSkill(repo, actor.schoolId!, id);
    const b = `S:${id}`;
    buckets.push(b);
    if (!pool.length) notes.push("A chosen skill has no questions yet.");
    raw.push(...limit(pool.map((q) => ({ id: q.id, bucket: b, level: q.level })), seen, seed));
  }
  // one question in two buckets: it belongs to the first
  const firstOf = new Map<string, Raw>();
  for (const r of raw) if (!firstOf.has(r.id)) firstOf.set(r.id, r);
  const ids = [...firstOf.keys()];
  const qs = await inChunks(ids, 500, (c) => repo.findMany("Question", { id: { in: c }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId", "passageId", "difficultyLevel"] }));
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(types.map((t) => [s(t.id), s(t.code)]));
  const keys = await contentKeysForIds(repo, qs.map((q) => s(q.id)));
  const list = qs.map((q) => {
    const r = firstOf.get(s(q.id))!;
    return { id: r.id, bucket: r.bucket, level: r.level, type: codeOf.get(s(q.typeId)) ?? "", passage: q.passageId ? s(q.passageId) : null, keys: keys.get(s(q.id)) ?? [], seen: seen.has(r.id), difficulty: Number(q.difficultyLevel ?? 4) };
  });
  return { list, buckets, notes };
}

/** At most CANDIDATES_PER_BUCKET of a bucket: unseen first, then a seeded order (so each press gives a new test). */
function limit(rows: Raw[], seen: Set<string>, seed: string): Raw[] {
  return seededOrder(rows, (r) => r.id, seed).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id))).slice(0, CANDIDATES_PER_BUCKET);
}

const cleanList = (l: unknown, max: number): string[] => [...new Set((Array.isArray(l) ? l : []).map(s).map((x) => x.trim()).filter(Boolean))].slice(0, max);

export async function generateTest(repo: Repo, actor: Actor, input: GenerateInput, now = new Date()): Promise<GeneratedTest> {
  staff(actor);
  assertCan(actor, "assignments:create");
  const lessons = cleanList(input?.lessons, MAX_BUCKETS);
  const skillIds = cleanList(input?.skillIds, MAX_BUCKETS);
  if (!lessons.length && !skillIds.length) throw new ValidationError("Choose at least one lesson or skill.");
  if (lessons.length + skillIds.length > MAX_BUCKETS) throw new ValidationError(`Choose at most ${MAX_BUCKETS} lessons and skills.`);
  const count = Math.round(Number(input?.count));
  if (!Number.isFinite(count) || count < MIN_GENERATED || count > MAX_GENERATED) throw new ValidationError(`The number of questions must be ${MIN_GENERATED} to ${MAX_GENERATED}.`);
  const choice = (["BELOW", "ON", "ABOVE", "MIXED", "FIT"].includes(s(input?.level)) ? s(input.level) : "MIXED") as LevelChoice;
  if (choice === "FIT" && !input?.classId) throw new ValidationError("Choose a class for “Fit my class”.");
  const history = await classHistory(repo, actor, input?.classId ? s(input.classId) : null, now);
  const level: LevelChoice = choice === "FIT" ? levelFromAccuracy(history.accuracy) : choice;
  const types = input?.types && typeof input.types === "object" ? Object.fromEntries(Object.entries(input.types).filter(([k, v]) => (GEN_TYPES as readonly string[]).includes(k) && Number(v) > 0).map(([k, v]) => [k, Number(v)])) : null;
  const seed = s(input?.seed) || String(now.getTime());
  const { list, buckets, notes } = await candidates(repo, actor, lessons, skillIds, history.seen, seed);
  if (!list.length) throw new ValidationError("The chosen lessons and skills have no questions yet.");
  // a question the test cannot show (e.g. it needs a passage it does not have) is left out and the plan made again
  let pool = list;
  let plan = planTest(pool, buckets, { count, levels: levelTargets(level, count), types, passageShare: input?.passageShare ?? null, seed });
  for (let round = 0; round < 3; round++) {
    const ok = new Set((await loadQuestionItems(repo, plan.ids)).map((it) => it.questionId));
    const bad = plan.ids.filter((id) => !ok.has(id));
    if (!bad.length) break;
    pool = pool.filter((c) => !bad.includes(c.id));
    plan = planTest(pool, buckets, { count, levels: levelTargets(level, count), types, passageShare: input?.passageShare ?? null, seed });
  }
  const rows = await describePicks(repo, actor, plan.ids);
  const total = input?.totalMarks === null || input?.totalMarks === undefined || s(input.totalMarks) === "" ? rows.length : Number(input.totalMarks);
  if (!Number.isFinite(total) || total <= 0) throw new ValidationError("Total marks must be more than 0.");
  const marks = spreadMarks(rows.map((r) => r.id), total);
  const extra = choice === "FIT" ? [history.accuracy === null ? "Fit my class: no recent answers yet, so On Level was used." : `Fit my class: recent accuracy ${history.accuracy}%, so the questions are ${level === "ABOVE" ? "Above" : level === "BELOW" ? "Below" : "On"} Level.`] : [];
  return { questions: rows.map((r) => ({ ...r, marks: marks[r.id] })), marks, level, accuracy: history.accuracy, notes: [...new Set([...extra, ...notes, ...plan.notes])] };
}

/**
 * 🔁 Replace: a similar question — the same skill (any grade's copy of it) and the same level, not in the test and
 * not a copy of a question in it, new to the class first. Questions of the same Curriculum Map section come first.
 */
export async function replaceQuestion(repo: Repo, actor: Actor, input: { questionId: string; exclude?: string[]; classId?: string | null; seed?: string }, now = new Date()): Promise<MapSourceQuestion> {
  staff(actor);
  const id = s(input?.questionId);
  const q = await repo.findUnique("Question", { id });
  if (!q || q.deletedAt) throw new ValidationError("That question was not found.");
  const [current] = await describePicks(repo, actor, [id]);
  const level: QLevel = current?.level ?? fromDifficulty(Number(q.difficultyLevel ?? 4));
  const exclude = [...new Set([id, ...cleanList(input?.exclude, MAX_TEST_QUESTIONS + 1)])];
  const history = await classHistory(repo, actor, input?.classId ? s(input.classId) : null, now);
  // the same map section(s), same skill and level
  const links = await repo.findMany("QuestionMapLink", { questionId: id }, { select: ["nodeId"] });
  const siblings = links.length ? (await usableLinks(repo, links.map((l) => s(l.nodeId)))).map((l) => s(l.q.id)) : [];
  const sibRows = siblings.length ? await inChunks([...new Set(siblings)], 500, (c) => repo.findMany("Question", { id: { in: c } }, { select: ["id", "skillId"] })) : [];
  const sameSkillSiblings = sibRows.filter((r) => s(r.skillId) === s(q.skillId)).map((r) => s(r.id));
  let skillPool: string[] = [];
  try { skillPool = (await questionsOfSkill(repo, actor.schoolId!, s(q.skillId), { level })).map((x) => x.id); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; throw new ForbiddenError("That question was not found."); }
  const seed = s(input?.seed) || String(now.getTime());
  const order = (l: string[]) => seededOrder(l, (x) => x, seed).sort((a, b) => Number(history.seen.has(a)) - Number(history.seen.has(b)));
  // and the skill's own questions placed on the Curriculum Map (the bank pool above leaves them out)
  const own = (await repo.findMany("Question", { skillId: s(q.skillId), status: "PUBLISHED", deletedAt: null }, { select: ["id", "difficultyLevel"], take: 500 }))
    .filter((x) => fromDifficulty(Number(x.difficultyLevel ?? 4)) === level).map((x) => s(x.id));
  let ranked = [...new Set([...order(sameSkillSiblings), ...order(skillPool), ...order(own)])].filter((x) => !exclude.includes(x));
  if (!ranked.length) throw new ValidationError("No similar question is left for this skill and level.");
  ranked = ranked.slice(0, 200);
  const keys = await contentKeysForIds(repo, [...exclude, ...ranked]);
  const used = new Set(exclude.flatMap((x) => keys.get(x) ?? []));
  // ⚡ described a few at a time (was one round of queries per candidate), first match in the same order
  const fresh = ranked.filter((cand) => !(keys.get(cand) ?? []).some((k) => used.has(k)));
  for (let i = 0; i < fresh.length; i += 25) {
    const rows = new Map((await describePicks(repo, actor, fresh.slice(i, i + 25))).map((r) => [r.id, r]));
    for (const cand of fresh.slice(i, i + 25)) {
      const row = rows.get(cand);
      if (!row) continue;
      // the section's level for map questions; the skill pool is already at this level
      if (row.level !== level) continue;
      return row;
    }
  }
  throw new ValidationError("No similar question is left for this skill and level.");
}
