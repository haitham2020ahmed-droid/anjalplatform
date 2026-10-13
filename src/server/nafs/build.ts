/**
 * 🇸🇦 Building a NAFS test from the NAFS bank (Tests tab):
 *   - "NAFS simulation" (default): N questions (20), 2–3 passages (at least one literary and one informational when
 *     the bank has them), 5–8 questions per passage, the PIRLS mix 20/30/30/20 and vocabulary items placed with the
 *     passages, no repeats, questions the class has not seen first. Every number is the teacher's to change.
 *   - Automatic: chosen NAFS skills (or PIRLS processes) and the number of questions (total, or per skill), balanced
 *     over the skills; passage questions are kept together with their passage.
 *   - Replace: another question of the same skill (same passage first) that is not in the test.
 * The teacher then replaces / removes / reorders / adds questions in the builder before saving.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertNafs } from "../teacher/nafs-access";
import { seededShuffle } from "../practice/items";
import { DIFFICULTIES, DIFFICULTY_NAME, GUIDE_BOOKLET_SIZE, isMoeCode, isNafsCode, MAX_NAFS_MINUTES, MAX_NAFS_QUESTIONS, MOE_BY_CODE, MOE_CODES, MOE_STANDARDS, PROCESS_TARGET, PROCESSES, SIMULATION_DEFAULT, SKILL_BY_CODE, textTypeOf, type Difficulty, type DifficultyMix, type NafsProcess, type SimulationSettings } from "./framework";
import { loadNafsQuestions, matchesTarget, nafsIndex, usable, type NafsEntry, type NafsKind } from "./bank";
import { saveNafsTest, type SaveTestInput } from "./tests";
import { createNafsPractice, type PracticeInput } from "./practice";
import { BALANCED_MIX, cleanFullCounts, FULL_DEFAULT, FULL_MAX_QUESTIONS, FULL_MIN_QUESTIONS, fullDistribution, fullMinutes } from "./coverage";

const s = (v: unknown) => String(v ?? "");
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export interface BuiltTest { questionIds: string[]; notes: string[] }

/** Largest remainder: `total` shared by percents (always adds up to total). */
export function shareOut<K extends string>(total: number, pct: Record<K, number>): Record<K, number> {
  const keys = Object.keys(pct) as K[];
  const sum = keys.reduce((a, k) => a + Math.max(0, pct[k]), 0) || 1;
  const raw = keys.map((k) => ({ k, v: (total * Math.max(0, pct[k])) / sum }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.v)])) as Record<K, number>;
  let left = total - raw.reduce((a, r) => a + Math.floor(r.v), 0);
  for (const r of [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) { if (left <= 0) break; out[r.k]++; left--; }
  return out;
}

// ------------------------------------------------------------------ difficulty (Easy / Medium / Hard / Mixed)

/**
 * The teacher's difficulty: null = any; one level at 100 = only that level (strict); a mix = the percentages, shared
 * out over the number of questions (largest remainder) and filled as far as the center allows (a note says when not).
 */
export function cleanDifficultyMix(v: unknown): DifficultyMix | null {
  if (v === null || v === undefined || v === "" || v === "ANY") return null;
  if (v === 1 || v === 2 || v === 3 || v === "1" || v === "2" || v === "3") { const k = Number(v) as Difficulty; return { 1: 0, 2: 0, 3: 0, [k]: 100 } as DifficultyMix; }
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mix = { 1: clamp(o[1] ?? o["1"], 0, 100, 0), 2: clamp(o[2] ?? o["2"], 0, 100, 0), 3: clamp(o[3] ?? o["3"], 0, 100, 0) } as DifficultyMix;
  return mix[1] + mix[2] + mix[3] > 0 ? mix : null;
}
/** The one level of a single-level mix (else null). */
export const singleLevel = (mix: DifficultyMix | null): Difficulty | null => { if (!mix) return null; const on = DIFFICULTIES.filter((k) => mix[k] > 0); return on.length === 1 ? on[0] : null; };
/** How many questions of each difficulty for `total` questions (always adds up to total). */
export function difficultyQuota(total: number, mix: DifficultyMix): Record<Difficulty, number> {
  const q = shareOut(total, { E: mix[1], M: mix[2], H: mix[3] });
  return { 1: q.E, 2: q.M, 3: q.H };
}
/** The pool for a mix: a single level keeps only that level; a mix keeps everything (the quota steers the picking). */
export const poolForMix = (pool: NafsEntry[], mix: DifficultyMix | null): NafsEntry[] => { const one = singleLevel(mix); return one ? pool.filter((e) => e.difficulty === one) : pool; };
function difficultyNote(picked: NafsEntry[], mix: DifficultyMix | null): string | null {
  if (!mix || !picked.length) return null;
  const want = difficultyQuota(picked.length, mix);
  const got: Record<Difficulty, number> = { 1: 0, 2: 0, 3: 0 };
  for (const e of picked) got[e.difficulty]++;
  if (DIFFICULTIES.every((k) => got[k] === want[k])) return null;
  return `The center could not match the difficulty mix exactly (${DIFFICULTIES.map((k) => `${DIFFICULTY_NAME[k]}: ${got[k]}/${want[k]}`).join(" · ")}).`;
}

export function cleanSimulation(input: Partial<SimulationSettings> | null | undefined): SimulationSettings {
  const d = SIMULATION_DEFAULT, i = input ?? {};
  const questions = clamp(i.questions, 1, MAX_NAFS_QUESTIONS, d.questions);
  const perPassageMin = clamp(i.perPassageMin, 1, 20, d.perPassageMin);
  const perPassageMax = Math.max(perPassageMin, clamp(i.perPassageMax, 1, 20, d.perPassageMax));
  const p = (i.process ?? {}) as Partial<Record<NafsProcess, number>>;
  const process = Object.fromEntries(PROCESSES.map((k) => [k, clamp(p[k], 0, 100, d.process[k])])) as Record<NafsProcess, number>;
  if (!PROCESSES.some((k) => process[k] > 0)) throw new ValidationError("Give at least one reading process a share.");
  return { questions, minutes: clamp(i.minutes, 1, MAX_NAFS_MINUTES, d.minutes), passages: clamp(i.passages, 0, 8, d.passages), perPassageMin, perPassageMax, vocabularyPct: clamp(i.vocabularyPct, 0, 100, d.vocabularyPct), process };
}

/** The questions this class already met in NAFS tests (bounded: the class's last 30 tests). */
async function seenByClass(repo: Repo, schoolId: string, classId: string | null | undefined): Promise<Set<string>> {
  if (!classId) return new Set();
  const results = await repo.findMany("NafsResult", { classId }, { select: ["testId"], orderBy: [{ field: "updatedAt", dir: "desc" }], take: 2000 });
  const assigned = await repo.findMany("NafsTestClass", { classId }, { select: ["testId"] });
  const testIds = [...new Set([...results, ...assigned].map((r) => s(r.testId)))].slice(0, 30);
  if (!testIds.length) return new Set();
  const tests = await repo.findMany("NafsTest", { id: { in: testIds }, schoolId }, { select: ["questionIds"] });
  return new Set(tests.flatMap((t) => (Array.isArray(t.questionIds) ? t.questionIds : typeof t.questionIds === "string" ? JSON.parse(t.questionIds) : []).map(s)));
}

/** Literary / informational per passage: its genre, else its questions' skill families. */
async function passageTypes(repo: Repo, pool: NafsEntry[]): Promise<Map<string, "LIT" | "INFO" | null>> {
  const ids = [...new Set(pool.map((e) => e.passageId).filter(Boolean) as string[])];
  const rows = ids.length ? await repo.findMany("ReadingPassage", { id: { in: ids.slice(0, 2000) } }, { select: ["id", "genre"] }) : [];
  const out = new Map<string, "LIT" | "INFO" | null>();
  for (const id of ids) {
    const g = textTypeOf(rows.find((r) => s(r.id) === id)?.genre);
    if (g) { out.set(id, g); continue; }
    const cats = pool.filter((e) => e.passageId === id).map((e) => e.cat);
    const lit = cats.filter((c) => c === "LIT").length, info = cats.filter((c) => c === "INFO").length;
    out.set(id, lit > info ? "LIT" : info > lit ? "INFO" : null);
  }
  return out;
}

const isVocab = (e: NafsEntry) => e.domain === "V";

/** Builds the NAFS simulation from the bank (pure apart from the reads above). */
export function buildSimulation(poolIn: NafsEntry[], types: Map<string, "LIT" | "INFO" | null>, seen: Set<string>, st: SimulationSettings, seed: string, mix: DifficultyMix | null = null): BuiltTest {
  const notes: string[] = [];
  const pool = poolForMix(poolIn, mix);
  const total = st.questions;
  const procLeft = shareOut(total, st.process);
  let vocabLeft = Math.round((total * st.vocabularyPct) / 100);
  const diffLeft = mix ? difficultyQuota(total, mix) : null;
  const taken = new Set<string>();
  // the difficulty quota first (the teacher's mix), then the PIRLS mix, vocabulary and unseen questions
  const score = (e: NafsEntry) => (diffLeft ? (diffLeft[e.difficulty] > 0 ? 100 : -100) : 0) + procLeft[e.process] * 2 + (isVocab(e) && vocabLeft > 0 ? 1.5 : 0) + (seen.has(e.id) ? 0 : 1);
  const take = (e: NafsEntry) => { taken.add(e.id); procLeft[e.process]--; if (isVocab(e)) vocabLeft--; if (diffLeft) diffLeft[e.difficulty]--; };
  const pickFrom = (list: NafsEntry[], n: number): NafsEntry[] => {
    const got: NafsEntry[] = [];
    let rest = seededShuffle(list.filter((e) => !taken.has(e.id)), `${seed}:pick:${list[0]?.passageId ?? "solo"}`);
    while (got.length < n && rest.length) {
      rest.sort((a, b) => score(b) - score(a));
      const e = rest.shift()!;
      take(e); got.push(e);
    }
    return got;
  };
  // the passages: groups of questions, ranked (enough questions, not seen, then a fair shuffle)
  const groups = new Map<string, NafsEntry[]>();
  for (const e of pool) if (e.passageId) { const l = groups.get(e.passageId) ?? []; l.push(e); groups.set(e.passageId, l); }
  const ranked = seededShuffle([...groups.entries()], `${seed}:passages`).sort((a, b) =>
    Number(b[1].length >= st.perPassageMin) - Number(a[1].length >= st.perPassageMin) || b[1].filter((e) => !seen.has(e.id)).length - a[1].filter((e) => !seen.has(e.id)).length);
  const chosen: [string, NafsEntry[]][] = [];
  const want = st.passages > 0 ? Math.min(st.passages, ranked.length, Math.max(1, Math.floor(total / st.perPassageMin))) : 0;
  for (const kind of ["LIT", "INFO"] as const) {
    if (chosen.length >= want) break;
    const g = ranked.find(([id]) => types.get(id) === kind && !chosen.some(([c]) => c === id));
    if (g) chosen.push(g);
  }
  for (const g of ranked) { if (chosen.length >= want) break; if (!chosen.some(([c]) => c === g[0])) chosen.push(g); }
  if (st.passages > 0 && chosen.length < st.passages) notes.push(`The bank has ${chosen.length} passage(s) with questions for this test (you asked for ${st.passages}).`);
  if (chosen.length >= 2 && !(chosen.some(([id]) => types.get(id) === "LIT") && chosen.some(([id]) => types.get(id) === "INFO"))) notes.push("The bank has no literary and informational passage pair: the passages are of one kind.");
  // literary first, like the booklet
  chosen.sort((a, b) => Number(types.get(b[0]) === "LIT") - Number(types.get(a[0]) === "LIT"));
  // questions per passage: shared out, between the minimum and the maximum, never more than the passage has
  const quota = chosen.map(([, l]) => Math.min(l.length, st.perPassageMax));
  let sum = quota.reduce((a, b) => a + b, 0);
  while (sum > total) {
    // the largest share above its minimum gives one back (else the largest)
    const above = quota.map((q, k) => (q > Math.min(st.perPassageMin, chosen[k][1].length) ? q : -1));
    const i = Math.max(...above) > 0 ? above.indexOf(Math.max(...above)) : quota.indexOf(Math.max(...quota));
    quota[i]--; sum--;
  }
  const out: NafsEntry[][] = chosen.map(([, l], i) => pickFrom(l, quota[i]).sort((a, b) => a.process.localeCompare(b.process)));
  const short = chosen.filter(([, l]) => l.length < st.perPassageMin).length;
  if (short) notes.push(`${short} passage(s) have fewer than ${st.perPassageMin} questions in the bank.`);
  // the rest: questions without a passage (vocabulary first), then any other question
  let missing = total - out.reduce((a, l) => a + l.length, 0);
  if (missing > 0) { const solo = pickFrom(pool.filter((e) => !e.passageId), missing); out.push(solo); missing -= solo.length; }
  if (missing > 0) { const any = pickFrom(pool, missing); missing -= any.length; out.push(any); }
  if (missing > 0) notes.push(`The NAFS bank has only ${total - missing} question(s) for this test (you asked for ${total}). Add questions in the Question bank, or generate drafts with AI.`);
  const ids = groupByPassage(out.flat());
  const got = shareCount(pool.filter((e) => ids.includes(e.id)));
  const target = shareOut(total, st.process);
  const off = PROCESSES.filter((p) => Math.abs((got[p] ?? 0) - target[p]) > 1);
  if (off.length && !missing) notes.push(`The bank could not match the reading-process mix exactly (${PROCESSES.map((p) => `${p}: ${got[p] ?? 0}/${target[p]}`).join(" · ")}).`);
  const dn = difficultyNote(pool.filter((e) => ids.includes(e.id)), mix);
  if (dn) notes.push(dn);
  return { questionIds: ids, notes };
}
const shareCount = (l: NafsEntry[]) => { const m: Partial<Record<NafsProcess, number>> = {}; for (const e of l) m[e.process] = (m[e.process] ?? 0) + 1; return m; };

/** Passage questions sit together (the passage where its first question was), the others keep their order. */
export function groupByPassage(list: NafsEntry[]): string[] {
  const out: NafsEntry[] = [];
  const done = new Set<string>();
  for (const e of list) {
    if (done.has(e.id)) continue;
    if (!e.passageId) { out.push(e); done.add(e.id); continue; }
    for (const x of list) if (x.passageId === e.passageId && !done.has(x.id)) { out.push(x); done.add(x.id); }
  }
  return out.map((e) => e.id);
}

export interface AutoInput { codes: string[]; total?: number | null; perSkill?: Record<string, number> | null; classId?: string | null; seed?: string; difficulty?: unknown }

const targetName = (c: string) => SKILL_BY_CODE.get(c)?.name ?? MOE_BY_CODE.get(c)?.short ?? c;

/**
 * Automatic: balanced over the chosen NAFS skills / Ministry standards (round robin), the teacher's difficulty mix
 * first, then unseen questions and the passages already chosen; no repeats.
 */
export function buildAutomatic(poolIn: NafsEntry[], seen: Set<string>, input: { codes: string[]; counts: Record<string, number>; mix?: DifficultyMix | null }, seed: string): BuiltTest {
  const notes: string[] = [];
  const mix = input.mix ?? null;
  const pool = poolForMix(poolIn, mix);
  const total = input.codes.reduce((a, c) => a + (input.counts[c] ?? 0), 0);
  const diffLeft = mix ? difficultyQuota(total, mix) : null;
  const taken = new Set<string>();
  const passages = new Set<string>();
  const queue = new Map(input.codes.map((c) => [c, seededShuffle(pool.filter((e) => matchesTarget(e, c)), `${seed}:${c}`)]));
  const left = new Map(input.codes.map((c) => [c, input.counts[c] ?? 0]));
  const picked: NafsEntry[] = [];
  const quotaOk = (e: NafsEntry) => (diffLeft && diffLeft[e.difficulty] > 0 ? 1 : 0);
  let progress = true;
  while (progress) {
    progress = false;
    for (const c of input.codes) {
      if ((left.get(c) ?? 0) <= 0) continue;
      const q = (queue.get(c) ?? []).filter((e) => !taken.has(e.id));
      if (!q.length) continue;
      q.sort((a, b) => quotaOk(b) - quotaOk(a) || Number(seen.has(a.id)) - Number(seen.has(b.id)) || Number(Boolean(b.passageId && passages.has(b.passageId))) - Number(Boolean(a.passageId && passages.has(a.passageId))));
      const e = q[0];
      taken.add(e.id); picked.push(e); if (e.passageId) passages.add(e.passageId);
      if (diffLeft) diffLeft[e.difficulty]--;
      left.set(c, (left.get(c) ?? 0) - 1);
      progress = true;
    }
  }
  for (const c of input.codes) if ((left.get(c) ?? 0) > 0) notes.push(`${targetName(c)}: only ${(input.counts[c] ?? 0) - (left.get(c) ?? 0)} question(s) in the NAFS bank.`);
  const dn = difficultyNote(picked, mix);
  if (dn) notes.push(dn);
  return { questionIds: groupByPassage(picked), notes };
}

/** Counts per skill: the teacher's numbers, or the total shared out evenly (the first skills take the remainder). */
export function countsFor(codes: string[], total: number | null | undefined, perSkill: Record<string, number> | null | undefined): Record<string, number> {
  if (perSkill && Object.keys(perSkill).length) return Object.fromEntries(codes.map((c) => [c, clamp(perSkill[c], 0, MAX_NAFS_QUESTIONS, 0)]));
  const t = clamp(total, 1, MAX_NAFS_QUESTIONS, 20);
  const each = Math.floor(t / codes.length), extra = t - each * codes.length;
  return Object.fromEntries(codes.map((c, i) => [c, each + (i < extra ? 1 : 0)]));
}

// ------------------------------------------------------------------ the Ministry booklet model

/**
 * "Ministry booklet model" (Ministry of Education — NAFS target skills guide): questions grouped and ordered by the 13
 * standards, in the guide's proportions (3 per standard; S11 and S12 one each = 35), scaled to the teacher's number;
 * or a whole model booklet as it is. Short written answers are optional.
 */
export interface MinistrySettings { questions: number; minutes: number; booklet: string | null; written: boolean }
export const MINISTRY_DEFAULT: MinistrySettings = { questions: 35, minutes: 45, booklet: null, written: true };

/**
 * How many questions of each standard for `total` questions (always adds up to `total`):
 *   ≥ 13 questions: every standard one, the rest shared over the eleven standards with three in the guide (S11 and S12
 *                   keep their one) — 35 gives exactly the guide (3 … 3, 1, 1, 3);
 *   < 13 questions: the guide's weights shared out (largest remainder, ties in the guide's order).
 */
export function ministryDistribution(total: number): Record<string, number> {
  const n = Math.max(0, Math.round(Number(total) || 0));
  if (n >= MOE_STANDARDS.length) {
    const extra = shareOut(n - MOE_STANDARDS.length, Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, x.perBooklet - 1])) as Record<string, number>);
    return Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, 1 + (extra[x.code] ?? 0)]));
  }
  return shareOut(n, Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, x.perBooklet])) as Record<string, number>);
}

export function cleanMinistry(input: Partial<MinistrySettings> | null | undefined): MinistrySettings {
  const d = MINISTRY_DEFAULT, i = input ?? {};
  const code = s(i.booklet).trim();
  return { questions: clamp(i.questions, 1, MAX_NAFS_QUESTIONS, d.questions), minutes: clamp(i.minutes, 1, MAX_NAFS_MINUTES, d.minutes), booklet: /^NB-[A-Za-z0-9-]{1,12}$/.test(code) ? code : null, written: i.written === undefined ? d.written : Boolean(i.written) };
}

const stdOrder = (e: NafsEntry) => MOE_BY_CODE.get(e.standard ?? "")?.n ?? 99;
/** Passage by passage (in the order they were first used), each passage's questions by standard (then booklet number). */
export function orderByStandard(list: NafsEntry[]): string[] {
  const groups: NafsEntry[][] = [];
  const at = new Map<string, number>();
  const solo: NafsEntry[] = [];
  for (const e of list) {
    if (!e.passageId) { solo.push(e); continue; }
    if (!at.has(e.passageId)) { at.set(e.passageId, groups.length); groups.push([]); }
    groups[at.get(e.passageId)!].push(e);
  }
  const sort = (l: NafsEntry[]) => [...l].sort((a, b) => stdOrder(a) - stdOrder(b) || (a.bookletN ?? 999) - (b.bookletN ?? 999));
  return [...groups.map(sort).flat(), ...sort(solo)].map((e) => e.id);
}

/** Builds the Ministry booklet model from the bank (pure). */
export function buildMinistry(poolIn: NafsEntry[], seen: Set<string>, st: MinistrySettings, seed: string, mix: DifficultyMix | null = null): BuiltTest {
  const notes: string[] = [];
  let pool = poolIn.filter((e) => e.standard && (st.written || e.kind === "MCQ"));
  // (a whole model booklet stays as it is; otherwise the teacher's difficulty applies)
  if (!st.booklet) pool = poolForMix(pool, mix);
  const diffLeft = mix && !st.booklet ? difficultyQuota(st.questions, mix) : null;
  if (st.booklet) {
    pool = pool.filter((e) => e.booklet === st.booklet).sort((a, b) => (a.bookletN ?? 0) - (b.bookletN ?? 0));
    if (!pool.length) return { questionIds: [], notes: [`The model booklet ${st.booklet} is not in the NAFS bank.`] };
    // the whole booklet as it is (in its own order) when the teacher's number covers it
    if (st.questions >= pool.length) {
      if (st.questions > pool.length) notes.push(`The model booklet has ${pool.length} question(s) (you asked for ${st.questions}).`);
      return { questionIds: pool.map((e) => e.id), notes };
    }
  }
  const want = ministryDistribution(st.questions);
  const taken = new Set<string>(), passages = new Set<string>();
  const picked: NafsEntry[] = [];
  for (const x of MOE_STANDARDS) {
    let need = want[x.code] ?? 0;
    if (!need) continue;
    const cands = seededShuffle(pool.filter((e) => e.standard === x.code), `${seed}:${x.code}`);
    const rank = (e: NafsEntry) => (diffLeft ? (diffLeft[e.difficulty] > 0 ? 100 : -100) : 0) + (e.passageId && passages.has(e.passageId) ? 4 : 0) + (seen.has(e.id) ? 0 : 2) + (e.booklet ? 1 : 0) - (e.bookletN ?? 0) / 1000;
    // the guide's written answer (S03 "use the word in a sentence", S13 "a different ending") when written answers are on
    if (st.written && (x.code === "MOE.S03" || x.code === "MOE.S13")) {
      const w = cands.filter((e) => e.kind === "WRITTEN" && !taken.has(e.id)).sort((a, b) => rank(b) - rank(a))[0];
      if (w) { taken.add(w.id); picked.push(w); if (w.passageId) passages.add(w.passageId); if (diffLeft) diffLeft[w.difficulty]--; need--; }
    }
    while (need > 0) {
      const left = cands.filter((e) => !taken.has(e.id) && (st.written ? !(e.kind === "WRITTEN" && picked.some((p) => p.standard === x.code && p.kind === "WRITTEN")) : true));
      if (!left.length) break;
      left.sort((a, b) => rank(b) - rank(a));
      const e = left[0];
      taken.add(e.id); picked.push(e); if (e.passageId) passages.add(e.passageId); if (diffLeft) diffLeft[e.difficulty]--; need--;
    }
    if (need > 0) notes.push(`${x.short}: only ${(want[x.code] ?? 0) - need} question(s) in the NAFS bank (you need ${want[x.code]}).`);
  }
  const missing = st.questions - picked.length;
  if (missing > 0) notes.push(`The NAFS bank has only ${picked.length} question(s) with a Ministry standard for this test (you asked for ${st.questions}). Load the NAFS model booklets, set the standard of more questions, or add questions.`);
  const dn = difficultyNote(picked, diffLeft ? mix : null);
  if (dn) notes.push(dn);
  return { questionIds: orderByStandard(picked), notes };
}

// ------------------------------------------------------------------ actions (access-checked)

async function poolFor(repo: Repo, actor: Actor): Promise<NafsEntry[]> {
  await assertNafs(repo, actor);
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  return (await nafsIndex(repo, actor.schoolId)).filter(usable);
}

export async function buildNafsSimulation(repo: Repo, actor: Actor, input: { settings?: Partial<SimulationSettings> | null; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<BuiltTest & { settings: SimulationSettings }> {
  const pool = await poolFor(repo, actor);
  const st = cleanSimulation(input.settings);
  const mcq = pool.filter((e) => e.kind === "MCQ"); // the NAFS simulation is multiple choice only, like the paper booklet
  const [types, seen] = await Promise.all([passageTypes(repo, mcq), seenByClass(repo, actor.schoolId!, input.classId)]);
  return { ...buildSimulation(mcq, types, seen, st, s(input.seed) || "nafs", cleanDifficultyMix(input.difficulty)), settings: st };
}

export async function buildNafsMinistry(repo: Repo, actor: Actor, input: { settings?: Partial<MinistrySettings> | null; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<BuiltTest & { settings: MinistrySettings }> {
  const pool = await poolFor(repo, actor);
  const st = cleanMinistry(input.settings);
  const seen = await seenByClass(repo, actor.schoolId!, input.classId);
  return { ...buildMinistry(pool, seen, st, s(input.seed) || "nafs", cleanDifficultyMix(input.difficulty)), settings: st };
}

/** The model booklets in the school's NAFS bank (code, title, kind, number of usable questions). */
export async function bookletChoices(repo: Repo, actor: Actor): Promise<{ code: string; title: string; questions: number; written: number }[]> {
  const pool = (await poolFor(repo, actor)).filter((e) => e.booklet);
  const codes = [...new Set(pool.map((e) => e.booklet!))].sort();
  if (!codes.length) return [];
  const pids = [...new Set(pool.map((e) => e.passageId).filter(Boolean) as string[])];
  const passages = pids.length ? await repo.findMany("ReadingPassage", { id: { in: pids } }, { select: ["id", "title"] }) : [];
  return codes.map((code) => {
    const mine = pool.filter((e) => e.booklet === code);
    const title = s(passages.find((p) => p.id === mine.find((e) => e.passageId)?.passageId)?.title);
    return { code, title, questions: mine.length, written: mine.filter((e) => e.kind === "WRITTEN").length };
  });
}

export async function buildNafsAutomatic(repo: Repo, actor: Actor, input: AutoInput): Promise<BuiltTest> {
  const codes = [...new Set((input.codes ?? []).map(s).filter((c) => isNafsCode(c) || isMoeCode(c)))];
  if (!codes.length) throw new ValidationError("Choose at least one NAFS skill.");
  if (Number(input.total) > MAX_NAFS_QUESTIONS) throw new ValidationError(`A NAFS test has at most ${MAX_NAFS_QUESTIONS} questions (a bubble sheet holds ${MAX_NAFS_QUESTIONS}).`);
  const counts = countsFor(codes, input.total, input.perSkill);
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!n) throw new ValidationError("Choose how many questions.");
  if (n > MAX_NAFS_QUESTIONS) throw new ValidationError(`A NAFS test has at most ${MAX_NAFS_QUESTIONS} questions (a bubble sheet holds ${MAX_NAFS_QUESTIONS}).`);
  const pool = await poolFor(repo, actor);
  const seen = await seenByClass(repo, actor.schoolId!, input.classId);
  return buildAutomatic(pool, seen, { codes, counts, mix: cleanDifficultyMix(input.difficulty) }, s(input.seed) || "nafs");
}

/** Another question of the same NAFS skill, not in the test (the same passage first, then unseen, then same process). */
export async function replaceNafsQuestion(repo: Repo, actor: Actor, input: { questionId: string; current: string[]; classId?: string | null; seed?: string; sameStandard?: boolean }): Promise<string> {
  const pool = await poolFor(repo, actor);
  const was = pool.find((e) => e.id === input.questionId) ?? (await nafsIndex(repo, actor.schoolId!)).find((e) => e.id === input.questionId);
  if (!was) throw new ForbiddenError("This question is not in the NAFS bank.");
  const inTest = new Set((input.current ?? []).map(s));
  const seen = await seenByClass(repo, actor.schoolId!, input.classId);
  // the complete NAFS test: another question of the SAME Ministry standard (any skill), so the standard stays covered
  const same = input.sameStandard && isMoeCode(was.standard) ? (e: NafsEntry) => e.standard === was.standard : (e: NafsEntry) => e.nafsCode === was.nafsCode;
  if (input.sameStandard && !isMoeCode(was.standard)) throw new ValidationError("This question has no Ministry standard: remove it, or add a question of the standard you need.");
  const options = seededShuffle(pool.filter((e) => same(e) && e.kind === was.kind && !inTest.has(e.id) && e.id !== was.id), s(input.seed) || "replace")
    .sort((a, b) => Number(Boolean(was.standard) && b.standard === was.standard) - Number(Boolean(was.standard) && a.standard === was.standard) || Number(b.passageId === was.passageId && Boolean(was.passageId)) - Number(a.passageId === was.passageId && Boolean(was.passageId)) || Number(seen.has(a.id)) - Number(seen.has(b.id)) || Number(b.process === was.process) - Number(a.process === was.process));
  if (!options.length) throw new ValidationError(input.sameStandard ? "No other question of this standard in the NAFS bank." : "No other question of this skill in the NAFS bank.");
  return options[0].id;
}

// ------------------------------------------------------------------ rows for the builder

export interface BuilderRow { id: string; n: number; stem: string; options: string[]; correct: number; nafsCode: string; skill: string; process: NafsProcess; passageId: string | null; passageTitle: string | null; own: boolean; standard: string | null; kind: NafsKind; booklet: string | null; difficulty: Difficulty; textType?: "LIT" | "INFO" | null }
export async function builderRows(repo: Repo, actor: Actor, ids: string[]): Promise<BuilderRow[]> {
  await assertNafs(repo, actor);
  const idx = new Map((await nafsIndex(repo, actor.schoolId!)).map((e) => [e.id, e]));
  const list = [...new Set(ids.map(s))].filter((id) => idx.has(id)).slice(0, MAX_NAFS_QUESTIONS * 2);
  const [qs, types] = await Promise.all([loadNafsQuestions(repo, list), passageTypes(repo, list.map((id) => idx.get(id)!))]);
  return list.flatMap((id, i) => {
    const e = idx.get(id)!, q = qs.find((x) => x.id === id);
    return q ? [{ id, n: i + 1, stem: q.stem, options: q.options, correct: q.correct, nafsCode: e.nafsCode, skill: SKILL_BY_CODE.get(e.nafsCode)?.name ?? "", process: e.process, passageId: e.passageId, passageTitle: q.passage ? q.passage.title || q.passage.text.slice(0, 50) : null, own: e.own, standard: e.standard, kind: e.kind, booklet: e.booklet, difficulty: e.difficulty, textType: e.passageId ? types.get(e.passageId) ?? null : null }] : [];
  });
}

// ------------------------------------------------------------------ "Complete NAFS test (all standards)"

/**
 * The complete NAFS test: EVERY one of the 13 Ministry standards (under the three content areas), in the guide's
 * proportions (35 per text: 3 per standard, 1 for S11 and S12) scaled to the teacher's number — never below one per
 * standard, so at least 13 questions (fullDistribution) — or the teacher's own count per standard (each ≥ 1).
 *   - only questions WITH a Ministry standard cover a standard (a question without one is never used here);
 *   - at least one informational and one literary text (the texts whose questions cover the most standards, unseen
 *     first; two of each kind above 35 questions);
 *   - balanced difficulty (the teacher's mix; default 30 / 40 / 30) spread inside each standard too, and the PIRLS
 *     processes represented (20 / 30 / 30 / 20 targets, each standard's processes varied);
 *   - questions this class has not seen first; no duplicates; the written items (S03 and S13) only when asked;
 *   - the order of the guide's booklet: text by text, each text's questions by standard (passage questions together).
 * When the bank lacks questions for a standard the result says how many are missing (`shortage`).
 */
export interface FullSettings { questions: number; minutes: number; written: boolean; counts: Record<string, number> }
export interface FullBuilt extends BuiltTest { counts: Record<string, number>; available: Record<string, number>; shortage: Record<string, number>; texts: { id: string; type: "LIT" | "INFO" | null }[] }

export function cleanFull(input: { questions?: unknown; minutes?: unknown; written?: unknown; counts?: unknown } | null | undefined, max = FULL_MAX_QUESTIONS): FullSettings {
  const i = input ?? {};
  const asked = clamp(i.questions, FULL_MIN_QUESTIONS, FULL_MAX_QUESTIONS, FULL_DEFAULT.questions);
  const counts = i.counts && typeof i.counts === "object" && Object.keys(i.counts as object).length ? cleanFullCounts(i.counts, asked) : fullDistribution(asked);
  const questions = Object.values(counts).reduce((a, b) => a + b, 0);
  if (questions > max) throw new ValidationError(`A complete NAFS test here has at most ${max} questions (a bubble sheet holds ${max}).`);
  return { questions, minutes: clamp(i.minutes, 1, MAX_NAFS_MINUTES, fullMinutes(questions)), written: i.written === undefined ? FULL_DEFAULT.written : Boolean(i.written), counts };
}

/** The questions a complete test may use: usable, WITH a Ministry standard, multiple choice (+ written when asked). */
export const fullEligible = (pool: NafsEntry[], written: boolean) => pool.filter((e) => usable(e) && isMoeCode(e.standard) && (e.kind === "MCQ" || (written && e.kind === "WRITTEN")));

/** Usable questions per standard in the bank (for the "the bank lacks…" warnings). */
export function availableByStandard(pool: NafsEntry[], written: boolean): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, 0]));
  for (const e of fullEligible(pool, written)) out[e.standard!]++;
  return out;
}

interface RankCtx { seen: Set<string>; chosen: Set<string>; used: Set<string>; diffLeft: Record<Difficulty, number>; procLeft: Record<NafsProcess, number>; inStd: NafsEntry[] }
/** The ranking of one candidate for a standard (higher first). */
function fullRank(e: NafsEntry, c: RankCtx): number {
  return (c.seen.has(e.id) ? 0 : 40)
    + (c.diffLeft[e.difficulty] > 0 ? 8 : 0)
    + (e.passageId && c.chosen.has(e.passageId) ? 6 : e.passageId && c.used.has(e.passageId) ? 3 : 0)
    + (c.inStd.some((x) => x.difficulty === e.difficulty) ? 0 : 4)
    + (c.procLeft[e.process] > 0 ? 3 : 0) + (c.inStd.some((x) => x.process === e.process) ? 0 : 2);
}

/** Builds the complete NAFS test from the bank (pure). `keep`: questions already chosen that stay. */
export function buildFull(poolIn: NafsEntry[], types: Map<string, "LIT" | "INFO" | null>, seen: Set<string>, st: FullSettings, seed: string, mixIn: DifficultyMix | null = null, keep: string[] = []): FullBuilt {
  const notes: string[] = [];
  const mix = mixIn ?? { ...BALANCED_MIX };
  const pool = fullEligible(poolIn, st.written);
  const available = availableByStandard(poolIn, st.written);
  const total = MOE_STANDARDS.reduce((a, x) => a + Math.max(1, st.counts[x.code] ?? 1), 0);
  const diffLeft = difficultyQuota(total, mix);
  const procLeft = shareOut(total, PROCESS_TARGET);
  const taken = new Set<string>(), used = new Set<string>();
  const picked: NafsEntry[] = [];
  const take = (e: NafsEntry) => { taken.add(e.id); picked.push(e); if (e.passageId) used.add(e.passageId); diffLeft[e.difficulty]--; procLeft[e.process]--; };
  const byId = new Map(pool.map((e) => [e.id, e]));
  for (const id of keep) { const e = byId.get(id); if (e && !taken.has(e.id)) take(e); }
  // the texts: informational and literary — those whose questions cover the most standards (unseen first)
  const groups = new Map<string, NafsEntry[]>();
  for (const e of pool) if (e.passageId) { const l = groups.get(e.passageId) ?? []; l.push(e); groups.set(e.passageId, l); }
  const ranked = seededShuffle([...groups.entries()], `${seed}:texts`).sort((a, b) =>
    new Set(b[1].map((e) => e.standard)).size - new Set(a[1].map((e) => e.standard)).size
    || b[1].filter((e) => !seen.has(e.id)).length - a[1].filter((e) => !seen.has(e.id)).length);
  const chosen = new Set<string>(used);
  const perKind = total > GUIDE_BOOKLET_SIZE ? 2 : 1;
  for (const kind of ["INFO", "LIT"] as const) {
    let have = [...chosen].filter((id) => types.get(id) === kind).length;
    for (const [id] of ranked) { if (have >= perKind) break; if (types.get(id) === kind && !chosen.has(id)) { chosen.add(id); have++; } }
    if (!have) notes.push(kind === "INFO" ? "The bank has no informational text with Ministry-standard questions: the test has no informational text." : "The bank has no literary text with Ministry-standard questions: the test has no literary text.");
  }
  // every standard in the guide's order: the written item first (S03, S13) when asked, then the best ranked
  const shortage: Record<string, number> = {};
  for (const x of MOE_STANDARDS) {
    const want = Math.max(1, st.counts[x.code] ?? 1);
    const inStd = () => picked.filter((e) => e.standard === x.code);
    let need = want - inStd().length;
    const cands = seededShuffle(pool.filter((e) => e.standard === x.code), `${seed}:${x.code}`);
    const ctx = (): RankCtx => ({ seen, chosen, used, diffLeft, procLeft, inStd: inStd() });
    if (need > 0 && st.written && (x.code === "MOE.S03" || x.code === "MOE.S13") && !inStd().some((e) => e.kind === "WRITTEN")) {
      const c = ctx();
      const w = cands.filter((e) => e.kind === "WRITTEN" && !taken.has(e.id)).sort((a, b) => fullRank(b, c) - fullRank(a, c))[0];
      if (w) { take(w); need--; }
    }
    while (need > 0) {
      const hasWritten = inStd().some((e) => e.kind === "WRITTEN");
      const left = cands.filter((e) => !taken.has(e.id) && !(e.kind === "WRITTEN" && hasWritten));
      if (!left.length) break;
      const c = ctx();
      left.sort((a, b) => fullRank(b, c) - fullRank(a, c));
      take(left[0]); need--;
    }
    if (need > 0) {
      shortage[x.code] = need;
      notes.push(`${x.short}: the bank has ${want - need} question(s) for this standard — ${need} missing (you asked for ${want}).`);
    }
  }
  const uncovered = MOE_STANDARDS.filter((x) => !picked.some((e) => e.standard === x.code));
  if (uncovered.length) notes.push(`Not covered: ${uncovered.map((x) => x.short).join(", ")} — the bank has no usable question for ${uncovered.length === 1 ? "this standard" : "these standards"}.`);
  const missingP = PROCESSES.filter((p) => !picked.some((e) => e.process === p));
  if (missingP.length && picked.length >= PROCESSES.length) notes.push(`Reading process(es) not represented: ${missingP.join(", ")}.`);
  const dn = difficultyNote(picked, mix);
  if (dn) notes.push(dn);
  return { questionIds: orderFull(picked, types), notes, counts: Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, Math.max(1, st.counts[x.code] ?? 1)])), available, shortage, texts: [...used].map((id) => ({ id, type: types.get(id) ?? null })) };
}

/** The booklet's order: informational texts, literary texts, other texts, then questions without a text — each by standard. */
export function orderFull(list: NafsEntry[], types: Map<string, "LIT" | "INFO" | null>): string[] {
  const rankText = (id: string) => (types.get(id) === "INFO" ? 0 : types.get(id) === "LIT" ? 1 : 2);
  const firstAt = new Map<string, number>();
  list.forEach((e, i) => { if (e.passageId && !firstAt.has(e.passageId)) firstAt.set(e.passageId, i); });
  const key = (e: NafsEntry): [number, number, number, number] => e.passageId ? [0, rankText(e.passageId), firstAt.get(e.passageId)!, stdOrder(e)] : [1, 0, 0, stdOrder(e)];
  return [...list].sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return (a.bookletN ?? 999) - (b.bookletN ?? 999); }).map((e) => e.id);
}

export async function buildNafsFull(repo: Repo, actor: Actor, input: { settings?: { questions?: unknown; minutes?: unknown; written?: unknown; counts?: unknown } | null; classId?: string | null; seed?: string; difficulty?: unknown; practice?: boolean }): Promise<FullBuilt & { settings: FullSettings }> {
  const pool = await poolFor(repo, actor);
  // a practice is multiple choice only; a saved test holds at most a bubble sheet's questions
  const st = cleanFull({ ...(input.settings ?? {}), written: input.practice ? false : input.settings?.written }, MAX_NAFS_QUESTIONS);
  const [types, seen] = await Promise.all([passageTypes(repo, fullEligible(pool, st.written)), seenByClass(repo, actor.schoolId!, input.classId)]);
  return { ...buildFull(pool, types, seen, st, s(input.seed) || "nafs-full", cleanDifficultyMix(input.difficulty)), settings: st };
}

/**
 * More questions for ONE standard of a complete test (the teacher raised its count): `n` questions of that standard
 * not in the test, ranked like the builder (unseen first, the difficulty and process balance, the test's texts).
 */
export async function moreForStandard(repo: Repo, actor: Actor, input: { standard: string; n: number; current: string[]; classId?: string | null; written?: boolean; seed?: string }): Promise<string[]> {
  if (!isMoeCode(input.standard)) throw new ValidationError("Choose a Ministry standard.");
  const pool = await poolFor(repo, actor);
  const n = clamp(input.n, 1, MAX_NAFS_QUESTIONS, 1);
  const inTest = new Set((input.current ?? []).map(s));
  const eligible = fullEligible(pool, Boolean(input.written));
  const mine = eligible.filter((e) => inTest.has(e.id));
  const seen = await seenByClass(repo, actor.schoolId!, input.classId);
  const used = new Set(mine.map((e) => e.passageId).filter(Boolean) as string[]);
  const total = mine.length + n;
  const diffLeft = difficultyQuota(total, BALANCED_MIX);
  const procLeft = shareOut(total, PROCESS_TARGET);
  for (const e of mine) { diffLeft[e.difficulty]--; procLeft[e.process]--; }
  const out: NafsEntry[] = [];
  const cands = seededShuffle(eligible.filter((e) => e.standard === input.standard && !inTest.has(e.id)), s(input.seed) || "more");
  while (out.length < n) {
    const inStd = [...mine.filter((e) => e.standard === input.standard), ...out];
    const hasWritten = inStd.some((e) => e.kind === "WRITTEN");
    const left = cands.filter((e) => !out.includes(e) && !(e.kind === "WRITTEN" && hasWritten));
    if (!left.length) break;
    const c: RankCtx = { seen, chosen: used, used, diffLeft, procLeft, inStd };
    left.sort((a, b) => fullRank(b, c) - fullRank(a, c));
    const e = left[0]; out.push(e); diffLeft[e.difficulty]--; procLeft[e.process]--;
  }
  return out.map((e) => e.id);
}

/** The standards a list of questions leaves uncovered (only usable questions with a Ministry standard count). */
export async function fullUncovered(repo: Repo, actor: Actor, ids: string[]): Promise<string[]> {
  const pool = await poolFor(repo, actor);
  const byId = new Map(pool.map((e) => [e.id, e]));
  const list = ids.map((id) => byId.get(s(id))).filter(Boolean) as NafsEntry[];
  return MOE_STANDARDS.filter((x) => !list.some((e) => isMoeCode(e.standard) && e.standard === x.code)).map((x) => x.code);
}

const uncoveredError = (codes: string[]) => new ValidationError(`Not every standard is covered (${codes.map((c) => MOE_BY_CODE.get(c)?.short ?? c).join(", ")}). Confirm to save anyway, or add questions for ${codes.length === 1 ? "it" : "them"}.`);

/** Saves a complete NAFS test (purpose "Test"): refused while a standard is uncovered unless the teacher confirmed. */
export async function saveFullNafsTest(repo: Repo, actor: Actor, input: Omit<SaveTestInput, "mode"> & { confirmUncovered?: boolean }, now = new Date()): Promise<string> {
  const uncovered = await fullUncovered(repo, actor, input.questionIds ?? []);
  if (uncovered.length && !input.confirmUncovered) throw uncoveredError(uncovered);
  return saveNafsTest(repo, actor, { ...input, mode: "FULL", settings: { ...(input.settings && typeof input.settings === "object" ? input.settings : {}), kind: "FULL", uncovered } }, now);
}

/**
 * Gives a complete NAFS test as adaptive practice (purpose "Practice"): the targets are exactly the 13 Ministry
 * standards; the questions are the teacher's list (only these), or — `wholeBank` — every multiple-choice question
 * WITH a Ministry standard. Refused while a standard has no question unless the teacher confirmed.
 */
export async function createFullNafsPractice(repo: Repo, actor: Actor, input: Omit<PracticeInput, "targets"> & { wholeBank?: boolean; confirmUncovered?: boolean }, now = new Date()): Promise<{ id: string; students: number }> {
  const questionIds = input.wholeBank ? null : [...new Set((input.questionIds ?? []).map(s).filter(Boolean))];
  if (questionIds && !questionIds.length) throw new ValidationError("The practice has no questions.");
  const pool = await poolFor(repo, actor);
  const mcq = fullEligible(pool, false);
  if (questionIds) {
    const ok = new Set(mcq.map((e) => e.id));
    if (questionIds.some((id) => !ok.has(id))) throw new ValidationError("Every practice question needs a Ministry standard and must be multiple choice: remove the others.");
  }
  const list = questionIds ? mcq.filter((e) => questionIds.includes(e.id)) : mcq;
  const uncovered = MOE_STANDARDS.filter((x) => !list.some((e) => e.standard === x.code)).map((x) => x.code);
  if (uncovered.length && !input.confirmUncovered) throw uncoveredError(uncovered);
  return createNafsPractice(repo, actor, { ...input, targets: [...MOE_CODES], questionIds }, now);
}
