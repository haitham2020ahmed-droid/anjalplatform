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
import { DIFFICULTIES, DIFFICULTY_NAME, isMoeCode, isNafsCode, MAX_NAFS_MINUTES, MAX_NAFS_QUESTIONS, MOE_BY_CODE, MOE_STANDARDS, PROCESSES, SIMULATION_DEFAULT, SKILL_BY_CODE, textTypeOf, type Difficulty, type DifficultyMix, type NafsProcess, type SimulationSettings } from "./framework";
import { loadNafsQuestions, matchesTarget, nafsIndex, usable, type NafsEntry, type NafsKind } from "./bank";

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
export async function replaceNafsQuestion(repo: Repo, actor: Actor, input: { questionId: string; current: string[]; classId?: string | null; seed?: string }): Promise<string> {
  const pool = await poolFor(repo, actor);
  const was = pool.find((e) => e.id === input.questionId) ?? (await nafsIndex(repo, actor.schoolId!)).find((e) => e.id === input.questionId);
  if (!was) throw new ForbiddenError("This question is not in the NAFS bank.");
  const inTest = new Set((input.current ?? []).map(s));
  const seen = await seenByClass(repo, actor.schoolId!, input.classId);
  const options = seededShuffle(pool.filter((e) => e.nafsCode === was.nafsCode && e.kind === was.kind && !inTest.has(e.id) && e.id !== was.id), s(input.seed) || "replace")
    .sort((a, b) => Number(Boolean(was.standard) && b.standard === was.standard) - Number(Boolean(was.standard) && a.standard === was.standard) || Number(b.passageId === was.passageId && Boolean(was.passageId)) - Number(a.passageId === was.passageId && Boolean(was.passageId)) || Number(seen.has(a.id)) - Number(seen.has(b.id)) || Number(b.process === was.process) - Number(a.process === was.process));
  if (!options.length) throw new ValidationError("No other question of this skill in the NAFS bank.");
  return options[0].id;
}

// ------------------------------------------------------------------ rows for the builder

export interface BuilderRow { id: string; n: number; stem: string; options: string[]; correct: number; nafsCode: string; skill: string; process: NafsProcess; passageId: string | null; passageTitle: string | null; own: boolean; standard: string | null; kind: NafsKind; booklet: string | null; difficulty: Difficulty }
export async function builderRows(repo: Repo, actor: Actor, ids: string[]): Promise<BuilderRow[]> {
  await assertNafs(repo, actor);
  const idx = new Map((await nafsIndex(repo, actor.schoolId!)).map((e) => [e.id, e]));
  const list = ids.map(s).filter((id) => idx.has(id)).slice(0, MAX_NAFS_QUESTIONS * 2);
  const qs = await loadNafsQuestions(repo, list);
  return list.flatMap((id, i) => {
    const e = idx.get(id)!, q = qs.find((x) => x.id === id);
    return q ? [{ id, n: i + 1, stem: q.stem, options: q.options, correct: q.correct, nafsCode: e.nafsCode, skill: SKILL_BY_CODE.get(e.nafsCode)?.name ?? "", process: e.process, passageId: e.passageId, passageTitle: q.passage ? q.passage.title || q.passage.text.slice(0, 50) : null, own: e.own, standard: e.standard, kind: e.kind, booklet: e.booklet, difficulty: e.difficulty }] : [];
  });
}
