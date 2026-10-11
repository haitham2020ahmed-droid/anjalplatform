/**
 * 🎯 The adaptive Diagnostic engine (pure functions, no database).
 *
 * One blueprint for every grade: 50 skill slots (the same CCSS anchors — Theme, Main Idea, Context Clues, Grammar …)
 * in the same order. Inside each slot the question's difficulty follows the student: a right answer brings a harder
 * question, a wrong one an easier one, across grades (a strong Grade 4 student meets Grade 5–6 questions of the same
 * skill; a student who needs support meets Grade 3 ones). Questions of one passage are served together.
 *
 * Ability and difficulty share one scale in grade units: 5.0 = what a Grade 5 student can do early in the year.
 * A question of Grade g at level L (1–7) sits at g + (L − 4) / 3; a calibrated RIT moves it to its RIT's place.
 * The estimate is the posterior mean (EAP) of a 3-parameter logistic model with a prior centred on the student's
 * starting point (MAP, then the platform's level, else their grade).
 */
import type { Strand } from "./standards";

/** one question of the frozen pool: id, anchor (RL.2), strand, difficulty (grade units), passage, source grade */
export interface DesignItem { id: string; a: string; st: Strand; d: number; p: string | null; g: number }
/** form: "full" (every slot) or "focus" (MOY / EOY: each student re-tests the strands still Below or borderline) */
export interface Design { blueprint: string[]; items: DesignItem[]; form?: "full" | "focus" }
export interface Answer { id: string; correct: boolean }

export const SLOPE = 1.7;
export const GUESS = 0.15;
export const PASSAGE_MAX = 4;
const PRIOR_SD = 1.0;

/**
 * The 50 core slots (anchors), the same for Grades 4, 5 and 6: Literature 15, Informational 15, Vocabulary 10,
 * Grammar & Conventions 10. Inside a strand the anchors take turns, so an unfinished test still covers every skill.
 * Foundational Skills (RF.3: multisyllable decoding, prefixes & suffixes, spelling patterns) adds up to 4 optional
 * slots — only when every grade's pool has word-study questions; with none, the test stays at 50.
 */
export const BLUEPRINT_PLAN: { strand: Strand; anchors: [string, number][]; optional?: boolean }[] = [
  { strand: "LIT", anchors: [["RL.1", 3], ["RL.2", 3], ["RL.3", 3], ["RL.5", 2], ["RL.6", 2], ["RL.9", 2]] },
  { strand: "INFO", anchors: [["RI.1", 3], ["RI.2", 3], ["RI.3", 3], ["RI.5", 2], ["RI.6", 2], ["RI.8", 2]] },
  { strand: "VOCAB", anchors: [["L.4", 4], ["L.5", 3], ["RL.4", 2], ["RI.4", 1]] },
  { strand: "LANG", anchors: [["L.1", 6], ["L.2", 4]] },
  { strand: "FOUND", anchors: [["RF.3", 4]], optional: true },
];
/** the core slots every test has (the optional Foundational slots come on top when the bank has them) */
export const BLUEPRINT_SIZE = BLUEPRINT_PLAN.filter((s) => !s.optional).reduce((t, s) => t + s.anchors.reduce((u, [, n]) => u + n, 0), 0);
export const FOUND_SLOTS = BLUEPRINT_PLAN.filter((s) => s.optional).reduce((t, s) => t + s.anchors.reduce((u, [, n]) => u + n, 0), 0);
export const strandOfAnchor = (a: string): Strand => BLUEPRINT_PLAN.find((s) => s.anchors.some(([x]) => x === a))?.strand ?? (/^RF/.test(a) ? "FOUND" : /^RL/.test(a) ? "LIT" : /^RI/.test(a) ? "INFO" : a === "L.1" || a === "L.2" || a === "L.3" ? "LANG" : "VOCAB");

/**
 * The blueprint for this school: every planned slot keeps its anchor when every grade's pool has enough questions
 * of it; otherwise the slot goes to the anchor of the same strand that every grade has most of (so all grades
 * still answer the same skills).
 */
export function effectiveBlueprint(poolsByGrade: { a: string; st: Strand }[][]): string[] {
  const count = (pool: { a: string }[], a: string) => pool.filter((q) => q.a === a).length;
  const minCount = (a: string) => Math.min(...poolsByGrade.map((p) => count(p, a)));
  const out: string[] = [];
  for (const { strand, anchors, optional } of BLUEPRINT_PLAN) {
    if (optional) {
      // Foundational slots: as many as every grade can fill (up to the plan), else none — never a filler slot
      if (!poolsByGrade.length) continue;
      const strandMin = Math.min(...poolsByGrade.map((p) => p.filter((q) => q.st === strand).length));
      let room = Math.min(strandMin, anchors.reduce((t, [, n]) => t + n, 0));
      for (let i = 0; room > 0; i++, room--) out.push(anchors[i % anchors.length][0]);
      continue;
    }
    const want = new Map<string, number>();
    let spare = 0;
    for (const [a, n] of anchors) { const ok = Math.min(n, minCount(a)); want.set(a, ok); spare += n - ok; }
    // the strand's anchors that every grade has (planned or not), most questions first
    const all = [...new Set(poolsByGrade.flat().filter((q) => q.st === strand).map((q) => q.a))];
    const room = (a: string) => minCount(a) - (want.get(a) ?? 0);
    while (spare > 0) {
      const best = all.filter((a) => room(a) > 0).sort((x, y) => room(y) - room(x) || x.localeCompare(y))[0];
      if (!best) break;
      want.set(best, (want.get(best) ?? 0) + 1); spare--;
    }
    // anchors take turns: RL.1, RL.2, RL.3, RL.5 …, then again
    const left = new Map(want);
    const order = [...anchors.map(([a]) => a), ...[...want.keys()].filter((a) => !anchors.some(([x]) => x === a)).sort()];
    let guard = 0;
    while ([...left.values()].some((n) => n > 0) && guard++ < 100) for (const a of order) { const n = left.get(a) ?? 0; if (n > 0) { out.push(a); left.set(a, n - 1); } }
    // still short (a grade lacks the strand): the slots stay, any question of the strand fills them
    for (let i = 0; i < spare; i++) out.push(anchors[i % anchors.length][0]);
  }
  return out;
}

/** Difficulty in grade units: Grade g, level L (1–7) → g + (L − 4) / 3. */
export const difficultyOf = (grade: number, level: number) => Math.round((grade + (Math.max(1, Math.min(7, level)) - 4) / 3) * 100) / 100;

const prob = (theta: number, d: number) => GUESS + (1 - GUESS) / (1 + Math.exp(-SLOPE * (theta - d)));

/** Posterior mean and standard deviation of ability (grade units) from these answers, around a prior. */
export function estimate(answers: { d: number; correct: boolean }[], prior: number, priorSd = PRIOR_SD): { theta: number; se: number } {
  let w = 0, m = 0, m2 = 0;
  for (let x = prior - 4; x <= prior + 4 + 1e-9; x += 0.02) {
    let lw = -((x - prior) ** 2) / (2 * priorSd * priorSd);
    for (const a of answers) { const p = prob(x, a.d); lw += Math.log(a.correct ? p : 1 - p); }
    const v = Math.exp(lw);
    w += v; m += v * x; m2 += v * x * x;
  }
  const theta = m / w;
  return { theta: Math.round(theta * 100) / 100, se: Math.round(Math.sqrt(Math.max(0, m2 / w - theta * theta)) * 100) / 100 };
}

const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Which slot each answer filled (replayed in order): its own anchor's first open slot, else the strand's. */
export function replay(design: Design, answers: Answer[]): { open: number[]; slotOf: Map<string, number> } {
  const open = design.blueprint.map((_, i) => i);
  const byId = new Map(design.items.map((q) => [q.id, q]));
  const slotOf = new Map<string, number>();
  for (const a of answers) {
    const q = byId.get(a.id);
    if (!q || slotOf.has(a.id)) continue;
    let k = open.find((i) => design.blueprint[i] === q.a);
    if (k === undefined) k = open.find((i) => strandOfAnchor(design.blueprint[i]) === q.st);
    if (k === undefined) k = open[0];
    if (k === undefined) break;
    slotOf.set(a.id, k); open.splice(open.indexOf(k), 1);
  }
  return { open, slotOf };
}

/**
 * The next question: the rest of the passage being read (while its strand still has open slots), else the first
 * open slot's skill at the difficulty nearest the current estimate. Null when every slot is answered.
 */
export function nextItem(design: Design, answers: Answer[], prior: number, seed = ""): string | null {
  const { open } = replay(design, answers);
  if (!open.length) return null;
  const byId = new Map(design.items.map((q) => [q.id, q]));
  const used = new Set(answers.map((a) => a.id));
  const est = estimate(answers.map((a) => ({ d: byId.get(a.id)?.d ?? prior, correct: a.correct })), prior).theta;
  const free = design.items.filter((q) => !used.has(q.id));
  const nearest = (list: DesignItem[]) => [...list].sort((x, y) => Math.abs(x.d - est) - Math.abs(y.d - est) || hash(seed + x.id) - hash(seed + y.id))[0] ?? null;
  // 📖 a passage stays together (up to 4 questions), inside its strand
  const last = answers.length ? byId.get(answers[answers.length - 1].id) : undefined;
  if (last?.p) {
    const served = answers.filter((a) => byId.get(a.id)?.p === last.p).length;
    const openStrands = new Set(open.map((i) => strandOfAnchor(design.blueprint[i])));
    const openAnchors = new Set(open.map((i) => design.blueprint[i]));
    // only questions of a skill still to be answered, so every student keeps the same skills
    const rest = free.filter((q) => q.p === last.p && openStrands.has(q.st) && openAnchors.has(q.a));
    if (served < PASSAGE_MAX && rest.length) return nearest(rest)!.id;
  }
  const slot = design.blueprint[open[0]];
  const pick = nearest(free.filter((q) => q.a === slot)) ?? nearest(free.filter((q) => q.st === strandOfAnchor(slot))) ?? nearest(free);
  return pick?.id ?? null;
}

/** Score 0–100 against the student's own grade: On grade level = 60–84, Above = 85+, Below = under 60. */
export const scoreOf = (theta: number, grade: number) => Math.max(0, Math.min(100, Math.round((72.5 + 25 * (theta - grade)) * 10) / 10));
/** “Grade 5.3” · under Grade 2 and over Grade 9 are shown as such. */
export const gradeLabel = (theta: number) => (theta < 2 ? "Below Grade 2" : theta > 9 ? "Above Grade 9" : `Grade ${theta.toFixed(1)}`);

// ------------------------------------------------------------------ the focus form (MOY / EOY)

export const FOCUS_SIZE = 30;
/** a strand or standard counts as weak below the On cut + this margin (Below, or On but borderline) */
export const BORDERLINE_MARGIN = 10;
/**
 * score: the reported result (adaptive score or % correct); raw: % correct when the result is adaptive — an adaptive
 * strand score leans on the overall estimate, so a strand the student mostly missed (raw under 40%) counts as weak too.
 */
export interface FocusInput { strands: { strand: Strand; score: number; raw?: number }[]; anchors: { anchor: string; score: number; raw?: number }[]; on: number; margin?: number }
export const RAW_WEAK_BELOW = 40;

/** splits n slots over weights (largest remainder; ties keep the list order), each capped at cap[i] */
function apportion(n: number, weights: number[], cap: number[]): number[] {
  const out = weights.map(() => 0);
  let left = n;
  while (left > 0) {
    const live = weights.map((w, i) => (out[i] < cap[i] && w > 0 ? i : -1)).filter((i) => i >= 0);
    if (!live.length) break;
    const W = live.reduce((t, i) => t + weights[i], 0);
    const share = live.map((i) => ({ i, x: (left * weights[i]) / W }));
    let given = 0;
    for (const { i, x } of share) { const k = Math.min(Math.floor(x), cap[i] - out[i]); out[i] += k; given += k; }
    if (!given) { const best = [...share].sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || weights[b.i] - weights[a.i] || a.i - b.i)[0]; out[best.i]++; given = 1; }
    left -= given;
  }
  return out;
}

/**
 * The student's focus blueprint (MOY / EOY), from their earlier result: only the strands still Below or borderline
 * (score under On + 10) are re-tested; a Below strand weighs twice a borderline one, and inside a strand a weak
 * standard weighs twice the others. Each strand takes at most twice its full-test slots (and no more than the pool
 * has). Nothing weak → a short check of every skill once. Deterministic: the same result gives the same blueprint.
 */
export function focusBlueprint(base: string[], items: { a: string; st: Strand }[], f: FocusInput, size = FOCUS_SIZE): { blueprint: string[]; weakStrands: Strand[]; weakAnchors: string[] } {
  const cut = f.on + (f.margin ?? BORDERLINE_MARGIN);
  const order = [...new Set(base.map(strandOfAnchor))];
  const low = (x: { score: number; raw?: number }) => x.score < cut || (typeof x.raw === "number" && x.raw < RAW_WEAK_BELOW);
  const rank = (x: { score: number; raw?: number }) => Math.min(x.score, x.raw ?? x.score);
  const weakAnchors = f.anchors.filter(low).sort((a, b) => rank(a) - rank(b) || a.anchor.localeCompare(b.anchor)).map((x) => x.anchor);
  const weight = new Map<Strand, number>();
  for (const x of f.strands) if (low(x)) weight.set(x.strand, rank(x) < f.on ? 2 : 1);
  for (const a of weakAnchors) { const st = strandOfAnchor(a); if (!weight.has(st)) weight.set(st, 1); }
  const strands = order.filter((st) => weight.has(st));
  if (!strands.length) return { blueprint: [...new Set(base)], weakStrands: [], weakAnchors: [] };
  const cap = strands.map((st) => Math.min(2 * base.filter((a) => strandOfAnchor(a) === st).length, items.filter((q) => q.st === st).length));
  const total = Math.min(size, cap.reduce((t, n) => t + n, 0));
  const per = apportion(total, strands.map((st) => weight.get(st)!), cap);
  const weakSet = new Set(weakAnchors);
  const out: string[] = [];
  strands.forEach((st, k) => {
    const mine = [...new Set([...base.filter((a) => strandOfAnchor(a) === st), ...weakAnchors.filter((a) => strandOfAnchor(a) === st && items.some((q) => q.a === a))])];
    // weak standards first (weakest first), then the others in the blueprint's order
    const ranked = [...mine.filter((a) => weakSet.has(a)).sort((a, b) => weakAnchors.indexOf(a) - weakAnchors.indexOf(b)), ...mine.filter((a) => !weakSet.has(a))];
    const n = apportion(per[k], ranked.map((a) => (weakSet.has(a) ? 2 : 1)), ranked.map(() => Number.MAX_SAFE_INTEGER));
    const left = new Map(ranked.map((a, i) => [a, n[i]]));
    let guard = 0;
    while ([...left.values()].some((x) => x > 0) && guard++ < 200) for (const a of ranked) { const x = left.get(a)!; if (x > 0) { out.push(a); left.set(a, x - 1); } }
  });
  return { blueprint: out, weakStrands: strands, weakAnchors };
}
