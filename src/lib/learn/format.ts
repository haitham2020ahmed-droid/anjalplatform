/**
 * 📘 Learn — the lesson and word file formats and their checks (client-safe: no server imports).
 *
 *   data/learn/lessons/LN-XXX.json   one topic, 4 levels (format: the content writers' FORMAT.md)
 *   data/learn/words/G4.json, G5.json  the Curriculum Map vocabulary explained (WORDS-FORMAT.md)
 *
 * checkLesson is the same rule set as the content writers' check.py (scripts/learn/check.mts prints it per file);
 * the loader (src/server/learn/files.ts) skips a file with any problem. Students never see a level number or word:
 * LEVEL_WORDS is checked in every student-facing text.
 */

export type Subject = "READING" | "LANGUAGE";
export const GOAL_AREAS = ["Informational Text", "Literary Text", "Vocabulary", "Writing", "Grammar and Usage", "Mechanics"] as const;
export type GoalArea = (typeof GOAL_AREAS)[number];
export const LEVELS = ["1", "2", "3", "4"] as const;
export type LevelKey = (typeof LEVELS)[number];
export type Role = "main" | "detail" | "key" | "other";

export interface LSlide { title: string; text: string }
export interface LMcq { passage: string; stem: string; options: string[]; answer: number }
export interface LLevel {
  slides: LSlide[];
  proof: { title: string; text: string };
  example: { sentences: { t: string; role: Role }[]; explain: string };
  together: LMcq & { hint: string; good: string };
  evidence: { sentences: string[]; proof: number[]; need: number; stem: string; wrong: string };
  checks: (LMcq & { why: string })[];
  again: { title: string; text: string; example: string };
}
export interface LessonFile {
  code: string; title: string; subject: Subject; goalArea: GoalArea; subtopic: string;
  standards: string[]; families: string[]; skillNames: string[]; statements: string[];
  levels: Record<LevelKey, LLevel>;
}

/** Words a student must never see (same list as check.py). */
export const LEVEL_WORDS = /\b(Below|On level|Above level|Approaching|Meeting|Exceeding|Mastered|Developing|Needs support|Tier|Level [1-4]|RTI|Lexile)\b/;
/** "together" passage word ranges per level. */
export const PASSAGE_WORDS: Record<LevelKey, [number, number]> = { "1": [12, 90], "2": [30, 160], "3": [45, 220], "4": [60, 300] };

/** MAP RIT → lesson level: ≤190 → 1, 191–210 → 2, 211–225 → 3, ≥226 → 4. */
export function levelFromRit(rit: number): 1 | 2 | 3 | 4 {
  if (rit <= 190) return 1;
  if (rit <= 210) return 2;
  if (rit <= 225) return 3;
  return 4;
}
/** The platform's mastery band of a skill → lesson level (lowest → 1 … highest → 4). */
export function levelFromBand(band: string | null | undefined): 1 | 2 | 3 | 4 | null {
  switch (String(band ?? "").toUpperCase()) {
    case "BEGINNING": return 1;
    case "DEVELOPING": case "APPROACHING": return 2;
    case "PROFICIENT": return 3;
    case "MASTERED": return 4;
    default: return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const wordCount = (s: unknown) => str(s).split(/\s+/).filter(Boolean).length;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Every string inside a value (depth first, in order). */
export function* textsOf(x: unknown): Generator<string> {
  if (typeof x === "string") yield x;
  else if (Array.isArray(x)) for (const v of x) yield* textsOf(v);
  else if (isObj(x)) for (const v of Object.values(x)) yield* textsOf(v);
}

function mcq(q: Record<string, unknown>, where: string, p: string[], needWhy = false): number | null {
  const o = arr(q.options);
  if (o.length !== 4 || new Set(o.map(str)).size !== 4 || o.some((x) => !str(x).trim())) p.push(`${where}: 4 different options`);
  const a = q.answer;
  if (!isInt(a) || a < 0 || a > 3) { p.push(`${where}: answer must be 0-3`); return null; }
  if (!q.stem) p.push(`${where}: stem`);
  if (needWhy && !q.why) p.push(`${where}: why`);
  return a;
}

/**
 * One level's structure (shared by the file check and the teacher's editor). `strict` adds the content writers' word
 * ranges; the cross-level rules (passage length order, answer balance) are in checkLesson.
 */
export function checkLevel(raw: unknown, n: LevelKey, p: string[], opts: { strict?: boolean; answers?: number[]; longest?: { n: number } } = {}): number {
  const v = isObj(raw) ? raw : {};
  const w = `L${n}`;
  const sl = arr(v.slides);
  if (sl.length < 3 || sl.length > 4) p.push(`${w}: 3-4 slides`);
  sl.forEach((s, i) => { const x = isObj(s) ? s : {}; if (!x.title || !x.text) p.push(`${w} slide ${i + 1}: title/text`); });
  const pr = isObj(v.proof) ? v.proof : {};
  if (!pr.title || !pr.text) p.push(`${w}: proof`);
  const ex = isObj(v.example) ? v.example : {};
  const ss = arr(ex.sentences).map((x) => (isObj(x) ? x : {}));
  if (ss.length < 2 || !ex.explain) p.push(`${w}: example sentences/explain`);
  if (ss.some((s) => !["main", "detail", "key", "other"].includes(str(s.role)) || !s.t)) p.push(`${w}: example roles`);
  if (!ss.some((s) => s.role === "main" || s.role === "key")) p.push(`${w}: example needs a main/key sentence`);
  const t = isObj(v.together) ? v.together : {};
  const a = mcq(t, `${w} together`, p);
  if (a !== null) opts.answers?.push(a);
  if (!t.passage || !t.hint || !t.good) p.push(`${w} together: passage/hint/good`);
  const nW = wordCount(t.passage);
  if (opts.strict) { const [lo, hi] = PASSAGE_WORDS[n]; if (nW < lo || nW > hi) p.push(`${w} together passage ${nW} words (want ${lo}-${hi})`); }
  const e = isObj(v.evidence) ? v.evidence : {};
  const es = arr(e.sentences), pf = arr(e.proof), need = e.need;
  if (es.length < 2 || !e.stem || !e.wrong) p.push(`${w} evidence: sentences/stem/wrong`);
  if (!pf.length || pf.some((i) => !isInt(i) || i < 0 || i >= es.length)) p.push(`${w} evidence: proof indexes`);
  if (!isInt(need) || need < 1 || need > pf.length) p.push(`${w} evidence: need`);
  if (pf.length >= es.length) p.push(`${w} evidence: some sentences must NOT be proof`);
  const ch = arr(v.checks);
  if (ch.length !== 3) p.push(`${w}: exactly 3 checks`);
  ch.forEach((q0, i) => {
    const q = isObj(q0) ? q0 : {};
    const k = mcq(q, `${w} check ${i + 1}`, p, true);
    if (k === null) return;
    opts.answers?.push(k);
    const o = arr(q.options).map(str);
    const others = o.filter((_, j) => j !== k).map((x) => x.length);
    if (opts.longest && others.length && (o[k] ?? "").length > Math.max(...others) + 12) opts.longest.n++;
    if (!q.passage) p.push(`${w} check ${i + 1}: passage`);
  });
  const ag = isObj(v.again) ? v.again : {};
  if (!ag.title || !ag.text || !ag.example) p.push(`${w}: again`);
  for (const s of textsOf(v)) { const m = LEVEL_WORDS.exec(s); if (m) { p.push(`level word '${m[0]}' in student text`); break; } }
  return nW;
}

/** All problems of one lesson file (empty = OK). The same rules as the content writers' check.py. */
export function checkLesson(raw: unknown): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ["invalid JSON: not an object"];
  const d = raw;
  for (const k of ["code", "title", "subject", "goalArea", "levels"]) if (!d[k]) p.push(`missing ${k}`);
  if (d.subject !== "READING" && d.subject !== "LANGUAGE") p.push("subject");
  if (!(GOAL_AREAS as readonly string[]).includes(str(d.goalArea))) p.push("goalArea");
  const L = isObj(d.levels) ? d.levels : {};
  if (Object.keys(L).sort().join(",") !== "1,2,3,4") { p.push("levels must be exactly 1,2,3,4"); return p; }
  const answers: number[] = [], longest = { n: 0 };
  const bad: string[] = [];
  let prev = 0;
  for (const n of LEVELS) {
    const lp: string[] = [];
    const nW = checkLevel(L[n], n, lp, { strict: true, answers, longest });
    // the level-word message once per file (check.py stops at the first one)
    for (const x of lp) (x.startsWith("level word") ? bad : p).push(x);
    if (n !== "1" && nW < prev * 0.9) p.push(`L${n}: passage shorter than the level below`);
    prev = nW;
  }
  const counts = new Map<number, number>();
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
  if (answers.length && Math.max(...counts.values()) > 8) p.push(`answers unbalanced {${[...counts].map(([k, v]) => `${k}: ${v}`).join(", ")}}`);
  if (longest.n > 4) p.push(`correct option clearly longest in ${longest.n} questions`);
  if (bad.length) p.push(bad[0]);
  return p;
}

/** A checked file as the platform uses it (missing optional lists become []). */
export function asLesson(raw: Record<string, unknown>): LessonFile {
  const list = (v: unknown) => arr(v).map(str).map((x) => x.trim()).filter(Boolean);
  return {
    code: str(raw.code).trim(), title: str(raw.title).trim(), subject: raw.subject as Subject, goalArea: raw.goalArea as GoalArea, subtopic: str(raw.subtopic).trim(),
    standards: list(raw.standards), families: list(raw.families), skillNames: list(raw.skillNames), statements: list(raw.statements),
    levels: raw.levels as Record<LevelKey, LLevel>,
  };
}

// ------------------------------------------------------------------ words

export interface WordCheck { stem: string; options: string[]; answer: number }
export interface WordCard { word: string; pos: string; meaning: string; example: string; arabic: string; synonyms: string[]; antonyms: string[]; family: string[]; check: WordCheck }
export interface WordSelection { unit: number; number: number; selection: string; words: WordCard[] }
export interface WordsFile { grade: number; selections: WordSelection[] }
/** The selections a grade must explain: (unit, number, name, words) from data/curriculum-map/lesson-details.json. */
export interface ExpectedSelection { unit: number; number: number; name: string; vocabulary: string[] }

const ARABIC = /[؀-ۿ]/;
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Does the sentence use the word or one of its forms (the family, or a simple ending)? */
export function sentenceUses(sentence: string, word: string, family: string[] = []): boolean {
  const s = sentence.toLowerCase();
  const w = word.toLowerCase().trim();
  const forms = [w, ...family.map((f) => f.toLowerCase().trim())].filter(Boolean);
  if (forms.some((f) => new RegExp(`(^|[^a-z])${esc(f)}`, "i").test(s))) return true;
  const stem = w.length > 4 ? w.replace(/(e|y|ed|es|s|ing)$/, "") : w;
  return new RegExp(`(^|[^a-z])${esc(stem)}[a-z]*`, "i").test(s);
}

/** The problems of one word card (empty = OK). */
export function checkWordCard(raw: unknown, where: string): string[] {
  const p: string[] = [];
  const w = isObj(raw) ? raw : {};
  const word = str(w.word).trim();
  if (!word) p.push(`${where}: word`);
  if (!str(w.pos).trim()) p.push(`${where}: pos`);
  const meaning = str(w.meaning).trim();
  if (!meaning) p.push(`${where}: meaning`);
  else {
    if (wordCount(meaning) > 14) p.push(`${where}: meaning longer than 14 words`);
    if (word && new RegExp(`(^|[^a-z])${esc(word.toLowerCase())}([^a-z]|$)`, "i").test(meaning)) p.push(`${where}: meaning uses the word itself`);
  }
  const example = str(w.example).trim();
  const family = arr(w.family).map(str);
  if (!example) p.push(`${where}: example`);
  else if (word && !sentenceUses(example, word, family)) p.push(`${where}: example does not use the word`);
  if (!ARABIC.test(str(w.arabic))) p.push(`${where}: arabic`);
  for (const k of ["synonyms", "antonyms"] as const) {
    if (!Array.isArray(w[k]) || arr(w[k]).length > 3 || arr(w[k]).some((x) => !str(x).trim())) p.push(`${where}: ${k} (0-3)`);
  }
  if (!Array.isArray(w.family)) p.push(`${where}: family`);
  const c = isObj(w.check) ? w.check : {};
  const o = arr(c.options).map(str);
  if (!str(c.stem).trim()) p.push(`${where}: check stem`);
  if (o.length !== 4 || new Set(o.map((x) => x.trim().toLowerCase())).size !== 4 || o.some((x) => !x.trim())) p.push(`${where}: check needs 4 different options`);
  if (!isInt(c.answer) || c.answer < 0 || c.answer > 3) p.push(`${where}: check answer must be 0-3`);
  for (const s of textsOf({ ...w, arabic: "" })) { const m = LEVEL_WORDS.exec(s); if (m) { p.push(`${where}: level word '${m[0]}'`); break; } }
  return p;
}

/** All problems of one words file against the grade's selections (every word present, same order, fields). */
export function checkWordsFile(raw: unknown, expected: ExpectedSelection[]): string[] {
  const p: string[] = [];
  if (!isObj(raw)) return ["invalid JSON: not an object"];
  if (!isInt(raw.grade)) p.push("grade");
  const sels = arr(raw.selections).map((x) => (isObj(x) ? x : {}));
  for (const e of expected) {
    if (!e.vocabulary.length) continue;
    const at = `Unit ${e.unit} · ${e.name}`;
    const sel = sels.find((x) => Number(x.unit) === e.unit && Number(x.number) === e.number);
    if (!sel) { p.push(`${at}: selection missing`); continue; }
    if (str(sel.selection) !== e.name) p.push(`${at}: selection name must be "${e.name}"`);
    const words = arr(sel.words);
    const names = words.map((w) => str(isObj(w) ? w.word : "").trim());
    const missing = e.vocabulary.filter((v) => !names.includes(v));
    if (missing.length) p.push(`${at}: missing ${missing.join(", ")}`);
    const extra = names.filter((n) => !e.vocabulary.includes(n));
    if (extra.length) p.push(`${at}: not in the selection's list: ${extra.join(", ")}`);
    if (!missing.length && !extra.length && names.join("|") !== e.vocabulary.join("|")) p.push(`${at}: words not in the file's order`);
    words.forEach((w, i) => p.push(...checkWordCard(w, `${at} · ${names[i] || `#${i + 1}`}`)));
  }
  for (const x of sels) if (!expected.some((e) => e.unit === Number(x.unit) && e.number === Number(x.number))) p.push(`Unit ${str(x.unit)} #${str(x.number)}: not a selection of this grade`);
  return p;
}

// ------------------------------------------------------------------ editing (every text of a level) + word diff

/** Every editable leaf of a value: [path, value] ("slides.0.title", "checks.2.answer" …). */
export function leaves(x: unknown, base = ""): [string, string | number][] {
  if (typeof x === "string" || typeof x === "number") return [[base, x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => leaves(v, base ? `${base}.${i}` : String(i)));
  if (isObj(x)) return Object.entries(x).flatMap(([k, v]) => leaves(v, base ? `${base}.${k}` : k));
  return [];
}
/** A copy of `x` with the leaf at `path` set (only an existing leaf; numbers stay numbers). */
export function setLeaf<T>(x: T, path: string, value: string): T {
  const out = structuredClone(x) as unknown;
  const keys = path.split(".");
  let cur = out as Record<string, unknown> | unknown[];
  for (const k of keys.slice(0, -1)) { const next = (cur as Record<string, unknown>)[k]; if (!next || typeof next !== "object") return x; cur = next as Record<string, unknown>; }
  const last = keys[keys.length - 1];
  const had = (cur as Record<string, unknown>)[last];
  if (typeof had === "number") { const n = Number(value); if (Number.isFinite(n)) (cur as Record<string, unknown>)[last] = Math.trunc(n); }
  else if (typeof had === "string") (cur as Record<string, unknown>)[last] = value.replace(/\r\n/g, "\n");
  return out as T;
}

export type DiffPart = { t: string; op: "same" | "add" | "del" };
/** A word-level diff (old → new) for the admin's proposal list. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const x = a.split(/(\s+)/).filter((t) => t !== ""), y = b.split(/(\s+)/).filter((t) => t !== "");
  if (x.length * y.length > 250_000) return [{ t: a, op: "del" }, { t: b, op: "add" }];
  const m = x.length, n = y.length;
  const L: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (t: string, op: DiffPart["op"]) => { const last = out[out.length - 1]; if (last && last.op === op) last.t += t; else out.push({ t, op }); };
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) { push(x[i], "same"); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push(x[i++], "del");
    else push(y[j++], "add");
  }
  while (i < m) push(x[i++], "del");
  while (j < n) push(y[j++], "add");
  return out;
}
/** The changed leaves of two versions (path, old, new) — what the admin reviews. */
export function changedLeaves(a: unknown, b: unknown): { path: string; old: string; now: string }[] {
  const old = new Map(leaves(a).map(([k, v]) => [k, String(v)]));
  const out: { path: string; old: string; now: string }[] = [];
  for (const [k, v] of leaves(b)) if (old.get(k) !== String(v)) out.push({ path: k, old: old.get(k) ?? "", now: String(v) });
  for (const [k, v] of old) if (!out.some((o) => o.path === k) && !leaves(b).some(([p]) => p === k)) out.push({ path: k, old: v, now: "" });
  return out;
}
