/**
 * ⭐ Skill stars (owner r67): ONE status per student per skill (per level), shown the same way everywhere — My MAP
 * plan, the Curriculum Map plan and its lessons, My Work, the Year plan, plans, Learn, Reports and the family report.
 *
 * 1. WHICH skill ("skillKey"). The same skill is stored many times: one row per grade ("Character Traits &
 *    Development" of Grade 4 and of Grade 5), under a teacher's or an import's own name ("Character" on the
 *    Curriculum Map lesson "The Talent Show"), or as a MAP statement's linked skill ("Character Traits"). They are ONE
 *    skill. skillKeyIndex() gives every skill row of a school its key, in this order of trust:
 *      a. grade-bound skills (Concept Vocabulary of one grade's texts, the hidden Curriculum Map holder) stay alone:
 *         "solo:<skillId>";
 *      b. the skill's family is a taxonomy family (data/curriculum/taxonomy.json) → "fam:<family code>";
 *      c. its NAME names a taxonomy family (the family's own name and short forms, the Curriculum Map phrase table
 *         PLACE_ALIASES, a few extra aliases) → "fam:<code>";
 *      d. its STANDARDS: the Common Core anchors (RL.x.3 …) of its standard links point at exactly one taxonomy family
 *         (or one that also shares a word with the name) → "fam:<code>";
 *      e. otherwise the one-bank name family (kind + canonical name, familyKeyOf) → "name:<kind:name>".
 *    Finally the skills of one name family (familyKeyOf) share the key a member found in b–d, so a copy without a
 *    family or standards still joins its siblings.
 * 2. ONE status per student × key × level in SkillStatus: NOT_STARTED ☆ · IN_PROGRESS ◐ · MASTERED ⭐ · NEXT_LEVEL ☆⬆ ·
 *    NEEDS_REVIEW 🔄. Rows exist only once a student has started (☆ is the absence of a row); "@level" is the
 *    student's own bookkeeping row (current star level, level-ups already applied) and is never shown.
 * 3. Any skill practice of any family copy updates it (onSkillAnswer, called after each practice / question-set
 *    answer): ⭐ needs ≥ 30 answered questions that are not rapid guesses AND the engine's mastery; tests, Learn checks,
 *    lessons, review checks and other sources never count. The shown score is capped at 99 until 30 are answered.
 *    50 answers without mastery → "Needs support" for the teacher (the student keeps ◐ and sees Done), one alert and
 *    the RTI plan suggests the student + skill (plans/wizard.ts).
 * Reads are batched (one query per page for any number of students and skills).
 */
import type { Repo, Row } from "../seeding/repo";
import taxonomy from "../../../data/curriculum/taxonomy.json";
import { canonicalSkillName, familyKeyOf, isGradeBoundSkill, normalizeSkillName, schoolSkillIndex } from "../questions/skill-questions";
import { PLACE_ALIASES } from "../curriculum-map/remap-skills";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { isHiddenSkill } from "./master";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const ms = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);
const DAY = 86_400_000;

// ------------------------------------------------------------------ the rules (owner)

export const STAR_MIN_ANSWERS = 30;
export const STAR_MAX_ANSWERS = 50;
/** a review check comes this many days after ⭐; the next (optional) one ~8 weeks after a pass */
export const REVIEW_AFTER_DAYS = 21;
export const REVIEW_AGAIN_DAYS = 56;
export const REVIEW_QUESTIONS = 5;
export const REVIEW_PASS = 4;
/** a review with this many rapid guesses (or more) does not count and is offered again */
export const REVIEW_GUESS_LIMIT = 2;
export const MIXED_QUESTIONS = 10;
/** a skill failing the monthly mixed review this many times → 🔄 */
export const MIXED_FAILS_FOR_REVIEW = 2;
/** after a failed review: mastered again with this many new answers and the engine's mastery */
export const REMASTER_ANSWERS = 10;
/** stuck at ◐: no progress for this many days (Needs attention, Learn suggestion) … */
export const STUCK_DAYS = 7;
/** … or this many answers without progress (Learn suggestion) */
export const STUCK_ANSWERS = 25;
export const LEVEL_ROW = "@level";

export type StarStatus = "NOT_STARTED" | "IN_PROGRESS" | "MASTERED" | "NEXT_LEVEL" | "NEEDS_REVIEW";
export const STAR_STATUSES: readonly StarStatus[] = ["NOT_STARTED", "IN_PROGRESS", "MASTERED", "NEXT_LEVEL", "NEEDS_REVIEW"];

/** The shown score: the engine's mastery %, never 100 before the 30th answer. */
export const displayScore = (score: number, answered: number): number => { const v = Math.max(0, Math.min(100, Math.round(Number(score) || 0))); return answered < STAR_MIN_ANSWERS ? Math.min(99, v) : v; };

// ------------------------------------------------------------------ level: skills that get harder / stay the same

/**
 * Families whose content gets HARDER with the student's level (comprehension, inference, vocabulary in context,
 * analysis, writing): a new, higher level makes their ⭐ a ☆⬆ "new challenge" at that level.
 */
export const LEVEL_HARD_FAMILIES: readonly string[] = [
  "theme", "summarize", "character", "character-perspective", "point-of-view", "plot-conflict", "plot-events", "plot-setting", "plot-flashback", "plot-foreshadowing",
  "make-predictions", "visualize", "ask-answer-questions", "reread", "drama-elements", "poetry-elements", "sound-devices", "imagery", "inference", "text-evidence",
  "compare-texts", "central-idea", "compare-contrast", "cause-effect", "problem-solution", "sequence", "description", "text-features", "author-perspective",
  "author-purpose", "author-claim", "context-clues", "multiple-meaning", "figurative-language", "connotation", "idioms-adages", "academic-vocabulary",
  "greek-latin-roots", "writing-argument", "writing-informative", "writing-narrative", "writing-poetry", "writing-research", "precise-language",
];
/** Families that are the SAME at every level (capitalization, punctuation, spelling patterns, basic grammar forms): ⭐ stays. */
export const LEVEL_STABLE_FAMILIES: readonly string[] = [
  "capitalization", "commas", "quotations-dialogue", "titles-abbreviations", "apostrophes-contractions", "spelling", "sentences", "subjects-predicates",
  "fragments-run-ons", "compound-sentences", "clauses-complex", "combining-sentences", "nouns", "plural-nouns", "possessive-nouns", "verbs", "verb-tenses",
  "irregular-verbs", "subject-verb-agreement", "pronouns", "pronoun-homophones", "adjectives", "comparatives", "adverbs", "negatives", "prepositions",
  "prefixes", "suffixes", "synonyms-antonyms", "homographs-homophones", "reference-materials", "puns",
];
const STABLE = new Set(LEVEL_STABLE_FAMILIES);
const HARD = new Set(LEVEL_HARD_FAMILIES);
/** Does this skill get harder at a higher level? Unknown keys: grammar / mechanics names stay, everything else gets harder. */
export function getsHarderWithLevel(key: string): boolean {
  if (key.startsWith("fam:")) { const c = key.slice(4); return HARD.has(c) || !STABLE.has(c); }
  return !/^name:grammar:|capital|punctuat|spelling|comma/i.test(key);
}

// ------------------------------------------------------------------ 1. skill identity

interface TaxFamily { code: string; name: string; domain: string; ccssStems?: string[] }
const FAMILIES = (taxonomy as { families: TaxFamily[] }).families;
const FAMILY_CODES = new Set(FAMILIES.map((f) => f.code));
export const isTaxonomyFamily = (code: string): boolean => FAMILY_CODES.has(code);
const STOP = new Set(["and", "the", "a", "an", "of", "to", "in", "with", "text", "texts", "skill", "skills", "identify", "determine", "understand", "use", "using"]);
const words = (n: string) => n.split(" ").filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""));

/** extra names → family (as teachers and imports write them) */
const EXTRA_ALIASES: [RegExp, string][] = [
  [/^characters?( traits?)?( and development)?$|^characterization$|^character analysis$/, "character"],
  [/^(main|central) ideas?( and (key|supporting|relevant) details)?$|^(key|supporting) details$/, "central-idea"],
  [/^(make |making |draw(ing)? )?inferences?( and conclusions)?$|^infer(ence|ring)?$/, "inference"],
  [/^authors? purpose$/, "author-purpose"],
  [/^context clues?$|^vocabulary in context$/, "context-clues"],
  [/^(similes?|metaphors?|personification|hyperbole)( and (similes?|metaphors?))?$/, "figurative-language"],
  [/^(capital letters|capitalisation)$/, "capitalization"],
  [/^punctuation$/, "commas"],
  [/^(subject verb agreement)$/, "subject-verb-agreement"],
  [/^(text evidence|textual evidence|citing evidence)$/, "text-evidence"],
  [/^summar(y|ize|ise|izing|ising)$/, "summarize"],
];

/** name → family code: every family's own name, its canonical name and its unique short forms. Built once. */
const NAME_INDEX: Map<string, string> = (() => {
  const out = new Map<string, string>(), short = new Map<string, Set<string>>();
  const add = (k: string, code: string) => { if (k && !out.has(k)) out.set(k, code); };
  for (const f of FAMILIES) {
    const n = normalizeSkillName(f.name);
    add(n, f.code); add(canonicalSkillName(f.name), f.code); add(normalizeSkillName(f.code.replace(/-/g, " ")), f.code);
    // short forms: before ":" / "(" / " and " — only when no other family has the same short form
    for (const part of [f.name.split(/[:(]/)[0], f.name.split(/ and | & /i)[0], f.name.split(":").slice(-1)[0]]) {
      const k = normalizeSkillName(part); if (!k || k === n) continue;
      short.set(k, (short.get(k) ?? new Set()).add(f.code));
    }
  }
  for (const [k, codes] of short) if (codes.size === 1) add(k, [...codes][0]);
  return out;
})();

/** The taxonomy family a skill NAME stands for (or null): "Character", "Character Traits", "Main Idea" … */
export function familyOfName(name: string): string | null {
  const n = normalizeSkillName(name).replace(/\b(?:skills?|reading skill)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return null;
  const hit = NAME_INDEX.get(n) ?? NAME_INDEX.get(canonicalSkillName(name));
  if (hit) return hit;
  for (const [re, code] of EXTRA_ALIASES) if (re.test(n)) return code;
  for (const [re, codes] of PLACE_ALIASES) if (re.test(n)) { const c = codes.find((x) => FAMILY_CODES.has(x)); if (c) return c; }
  return null;
}

/** "CCSS.ELA-LITERACY.RL.4.3" / "RL.4.3" → "RL.3" (strand + number, any grade). */
export function anchorOfStandard(code: string): string {
  const p = s(code).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase().split(".");
  return p.length >= 3 ? `${p[0]}.${p.slice(2).join(".")}` : p.join(".");
}
const ANCHOR_FAMILIES: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const f of FAMILIES) for (const st of f.ccssStems ?? []) { const a = anchorOfStandard(st.replace("{g}", "0")); m.set(a, [...(m.get(a) ?? []), f.code]); }
  return m;
})();

/** The taxonomy family a skill's STANDARDS point at: one family for the anchors (or one sharing a word with the name). */
export function familyOfStandards(codes: readonly string[], name = ""): string | null {
  const cand = new Set<string>();
  for (const c of codes) for (const f of ANCHOR_FAMILIES.get(anchorOfStandard(c)) ?? []) cand.add(f);
  if (cand.size === 1) return [...cand][0];
  if (!cand.size || !name) return null;
  const w = new Set(words(normalizeSkillName(name)));
  const near = [...cand].filter((code) => { const f = FAMILIES.find((x) => x.code === code)!; return words(normalizeSkillName(f.name)).some((x) => w.has(x)); });
  return near.length === 1 ? near[0] : null;
}

export interface SkillRowLike { id: string; name: string; code: string; domain?: string; familyCode?: string | null; standards?: readonly string[] }
/** One skill row's key (before the sibling step): see the header (a–e). Pure. */
export function skillKeyOfRow(k: SkillRowLike): string {
  if (isGradeBoundSkill(k) || isHiddenSkill(k.code)) return `solo:${k.id}`;
  if (k.familyCode && FAMILY_CODES.has(k.familyCode)) return `fam:${k.familyCode}`;
  const byName = familyOfName(k.name);
  if (byName) return `fam:${byName}`;
  const byStd = k.standards?.length ? familyOfStandards(k.standards, k.name) : null;
  if (byStd) return `fam:${byStd}`;
  return `name:${familyKeyOf({ id: k.id, name: k.name, code: k.code, domain: k.domain })}`;
}

export interface SkillKeyIndex {
  /** skill id → key */
  keyOf: Map<string, string>;
  /** key → every skill id of the school with it (lowest grade first) */
  skillsOf: Map<string, string[]>;
  /** key → a display name (the taxonomy family's name, else the first skill's name) */
  nameOf: Map<string, string>;
  /** skill id → grade */
  gradeOf: Map<string, number>;
}
const keyCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<SkillKeyIndex> }>>();
const KEY_MODELS = ["Skill", "SkillFamily", "SkillStandard", "Standard", "Curriculum", "Grade"];

/** Every skill of the school with its key. Cached per school until a skill table changes (at most a minute). */
export function skillKeyIndex(repo: Repo, schoolId: string): Promise<SkillKeyIndex> {
  let m = keyCache.get(repo); if (!m) keyCache.set(repo, (m = new Map()));
  const v = modelVersion(...KEY_MODELS), hit = m.get(schoolId);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = buildKeyIndex(repo, schoolId).catch((e) => { m!.delete(schoolId); throw e; });
  remember(m, schoolId, { v, at: Date.now(), p }, 8);
  return p;
}
/** Forget the cached keys (tests). */
export const clearSkillKeys = (repo: Repo): void => { keyCache.delete(repo); };

async function buildKeyIndex(repo: Repo, schoolId: string): Promise<SkillKeyIndex> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const famIds = [...new Set([...idx.familyOf.values()].filter(Boolean))];
  const fams = famIds.length ? await repo.findMany("SkillFamily", { id: { in: famIds } }, { select: ["id", "code"] }) : [];
  const famCode = new Map(fams.map((f) => [s(f.id), s(f.code)]));
  // standards only for the skills that need them (no taxonomy family, no name match)
  const need = [...idx.ids].filter((id) => { const k = idx.skillOf.get(id)!; return !FAMILY_CODES.has(famCode.get(idx.familyOf.get(id) ?? "") ?? "") && !familyOfName(k.name) && !isGradeBoundSkill(k); });
  const stdOf = new Map<string, string[]>();
  if (need.length) {
    const links: Row[] = [];
    for (let i = 0; i < need.length; i += 500) links.push(...(await repo.findMany("SkillStandard", { skillId: { in: need.slice(i, i + 500) } }, { select: ["skillId", "standardId"] })));
    const codes = links.length ? new Map((await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] })).map((x) => [s(x.id), s(x.code)])) : new Map<string, string>();
    for (const l of links) { const c = codes.get(s(l.standardId)); if (c) stdOf.set(s(l.skillId), [...(stdOf.get(s(l.skillId)) ?? []), c]); }
  }
  const keyOf = new Map<string, string>();
  for (const id of idx.ids) {
    const k = idx.skillOf.get(id)!;
    keyOf.set(id, skillKeyOfRow({ id, name: k.name, code: k.code, domain: k.domain, familyCode: famCode.get(idx.familyOf.get(id) ?? "") ?? null, standards: stdOf.get(id) }));
  }
  // siblings of one name family share the family key one of them found
  for (const members of idx.members.values()) {
    const found = [...new Set(members.map((id) => keyOf.get(id)!).filter((k) => k.startsWith("fam:")))];
    if (found.length === 1) for (const id of members) if (keyOf.get(id)!.startsWith("name:")) keyOf.set(id, found[0]);
  }
  const skillsOf = new Map<string, string[]>(), nameOf = new Map<string, string>();
  for (const id of [...idx.ids].sort((a, b) => (idx.gradeOf.get(a) ?? 0) - (idx.gradeOf.get(b) ?? 0) || (a < b ? -1 : 1))) {
    const key = keyOf.get(id)!;
    skillsOf.set(key, [...(skillsOf.get(key) ?? []), id]);
    if (!nameOf.has(key)) nameOf.set(key, key.startsWith("fam:") ? FAMILIES.find((f) => f.code === key.slice(4))?.name ?? idx.skillOf.get(id)!.name : idx.skillOf.get(id)!.name);
  }
  return { keyOf, skillsOf, nameOf, gradeOf: idx.gradeOf };
}

/**
 * The skills a Curriculum Map place names, as written on the map ("Reread / Diagrams and Headings \ Compare and
 * Contrast", "Character"): each phrase that names a taxonomy family → its key. Pure.
 */
export function keysOfPlaceText(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of s(text).split(/[\\/|;,]+/)) { const f = familyOfName(part.trim()); if (f && !out.includes(`fam:${f}`)) out.push(`fam:${f}`); }
  return out;
}

/** The keys of some skill ids (unknown ids: "skill:<id>", so nothing breaks for another school's skill). */
export async function skillKeysFor(repo: Repo, schoolId: string, skillIds: readonly string[]): Promise<Map<string, string>> {
  const ix = await skillKeyIndex(repo, schoolId);
  return new Map(skillIds.map((id) => [s(id), ix.keyOf.get(s(id)) ?? `skill:${s(id)}`]));
}

/** The school of a student (memoised). */
const schoolOfStudent = new Map<string, string>();
export async function studentSchool(repo: Repo, studentId: string): Promise<string> {
  const hit = schoolOfStudent.get(studentId); if (hit) return hit;
  const st = await repo.findUnique("Student", { id: studentId });
  const id = s(st?.schoolId);
  if (id) remember(schoolOfStudent, studentId, id, 20_000);
  return id;
}

// ------------------------------------------------------------------ 2. reading the status (one batched query)

export interface StarView {
  key: string; status: StarStatus; level: number; answered: number; correct: number; score: number; skillId: string | null;
  startedAt: string | null; masteredAt: string | null; reviewDueAt: string | null; needsSupport: boolean; selfCheck: string | null; updatedAt: string | null;
}
const iso = (v: unknown): string | null => (ms(v) ? new Date(ms(v)).toISOString() : null);
export function viewOf(r: Row): StarView {
  const answered = Number(r.answered ?? 0);
  return {
    key: s(r.skillKey), status: (s(r.status) || "NOT_STARTED") as StarStatus, level: Number(r.level ?? 1), answered, correct: Number(r.correct ?? 0),
    score: displayScore(Number(r.score ?? 0), answered), skillId: r.skillId ? s(r.skillId) : null, startedAt: iso(r.startedAt), masteredAt: iso(r.masteredAt),
    reviewDueAt: iso(r.reviewDueAt), needsSupport: Boolean(r.needsSupportAt) && s(r.status) === "IN_PROGRESS", selfCheck: r.selfCheck ? s(r.selfCheck) : null, updatedAt: iso(r.updatedAt),
  };
}
export const NOT_STARTED_VIEW = (key: string): StarView => ({ key, status: "NOT_STARTED", level: 1, answered: 0, correct: 0, score: 0, skillId: null, startedAt: null, masteredAt: null, reviewDueAt: null, needsSupport: false, selfCheck: null, updatedAt: null });

/** The current row (highest level) per key from a list of rows. */
export function currentRows(rows: readonly Row[]): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const r of rows) {
    if (s(r.skillKey) === LEVEL_ROW) continue;
    const k = s(r.skillKey), prev = out.get(k);
    if (!prev || Number(r.level ?? 1) > Number(prev.level ?? 1)) out.set(k, r);
  }
  return out;
}

const STATUS_COLS = ["studentId", "skillKey", "level", "status", "skillId", "answered", "correct", "score", "startedAt", "masteredAt", "reviewDueAt", "needsSupportAt", "selfCheck", "updatedAt"];
async function rowsFor(repo: Repo, studentIds: readonly string[], skillKeys?: readonly string[]): Promise<Row[]> {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length || (skillKeys && !skillKeys.length)) return [];
  const out: Row[] = [];
  const keys = skillKeys ? [...new Set(skillKeys)] : null;
  for (let i = 0; i < ids.length; i += 400) {
    const where = { studentId: { in: ids.slice(i, i + 400) }, ...(keys && keys.length <= 400 ? { skillKey: { in: keys } } : {}) };
    out.push(...(await repo.findMany("SkillStatus", where, { select: STATUS_COLS })));
  }
  return keys && keys.length > 400 ? out.filter((r) => keys.includes(s(r.skillKey))) : out;
}

/**
 * ⭐ THE read every page uses: student → key → status (current level). Keys without a row are ☆ Not started (filled in
 * when `skillKeys` are given). One query for up to 400 students.
 */
export async function skillStatusesFor(repo: Repo, studentIds: readonly string[], skillKeys?: readonly string[]): Promise<Map<string, Map<string, StarView>>> {
  const out = new Map<string, Map<string, StarView>>();
  for (const id of studentIds) out.set(s(id), new Map());
  const rows = await rowsFor(repo, studentIds, skillKeys);
  const bySt = new Map<string, Row[]>();
  for (const r of rows) bySt.set(s(r.studentId), [...(bySt.get(s(r.studentId)) ?? []), r]);
  for (const [sid, list] of bySt) { const m = out.get(sid) ?? new Map(); for (const [k, r] of currentRows(list)) m.set(k, viewOf(r)); out.set(sid, m); }
  if (skillKeys) for (const m of out.values()) for (const k of skillKeys) if (!m.has(k)) m.set(k, NOT_STARTED_VIEW(k));
  return out;
}

/** The statuses of SKILL IDS (each through its key): student → skill id → status. */
export async function statusesOfSkills(repo: Repo, schoolId: string, studentIds: readonly string[], skillIds: readonly string[]): Promise<Map<string, Map<string, StarView>>> {
  const keys = await skillKeysFor(repo, schoolId, skillIds);
  const by = await skillStatusesFor(repo, studentIds, [...new Set(keys.values())]);
  const out = new Map<string, Map<string, StarView>>();
  for (const [sid, m] of by) out.set(sid, new Map(skillIds.map((id) => [s(id), m.get(keys.get(s(id))!) ?? NOT_STARTED_VIEW(keys.get(s(id))!)])));
  return out;
}

/** One student's status of one skill (any copy of it) — e.g. a Learn lesson's skill. */
export async function starOfSkill(repo: Repo, studentId: string, skillId: string): Promise<StarView | null> {
  const schoolId = await studentSchool(repo, studentId);
  if (!schoolId || !skillId) return null;
  return (await statusesOfSkills(repo, schoolId, [studentId], [skillId])).get(studentId)?.get(skillId) ?? null;
}

export type StatusCounts = Record<StarStatus, number>;
export const emptyCounts = (): StatusCounts => ({ NOT_STARTED: 0, IN_PROGRESS: 0, MASTERED: 0, NEXT_LEVEL: 0, NEEDS_REVIEW: 0 });
/**
 * How many statuses of each kind these students have. With `universe` (the number of skills each student could
 * have), ☆ = universe × students − started ones; without it, ☆ counts only stored Not-started rows.
 */
export async function statusCounts(repo: Repo, studentIds: readonly string[], universe?: number): Promise<StatusCounts> {
  const c = emptyCounts();
  const rows = await rowsFor(repo, studentIds);
  const bySt = new Map<string, Row[]>();
  for (const r of rows) bySt.set(s(r.studentId), [...(bySt.get(s(r.studentId)) ?? []), r]);
  let started = 0;
  for (const list of bySt.values()) for (const r of currentRows(list).values()) { c[(s(r.status) || "NOT_STARTED") as StarStatus]++; if (s(r.status) !== "NOT_STARTED") started++; }
  if (universe !== undefined) c.NOT_STARTED = Math.max(0, universe * new Set(studentIds).size - started);
  return c;
}

// ------------------------------------------------------------------ 3. any practice updates it

/** Practice sessions that may count toward ⭐ (tests, the Diagnostic, placement … never do). */
const PRACTICE_MODES = new Set(["ADAPTIVE_PRACTICE", "TEACHER_QUIZ"]);
/** Assignment marks of tests and checks (tests/runtime TEST_MARK, the Weekly Check) — never counted. */
const TEST_MARKS = new Set(["TEST", "WEEKLY_CHECK"]);

export interface CountedAnswers { answered: number; correct: number; at: number[] }
/**
 * The student's answers that count for a key: skill practice of ANY copy of the skill (practice, assigned work, MAP
 * plan, free practice, Curriculum Map question sets), not rapid guesses; never tests / checks / review checks /
 * Learn checks / lessons / ReadMaster / games. `since` (ms): only answers after it.
 */
export async function countedAnswers(repo: Repo, studentId: string, skillIds: readonly string[], since = 0): Promise<CountedAnswers> {
  if (!skillIds.length) return { answered: 0, correct: 0, at: [] };
  const rows = await repo.findMany("QuestionAttempt", { studentId, skillId: { in: [...skillIds] }, rapidGuess: false }, { select: ["sessionId", "isCorrect", "source", "createdAt"] });
  const mine = rows.filter((r) => !s(r.source) && (!since || ms(r.createdAt) > since));
  if (!mine.length) return { answered: 0, correct: 0, at: [] };
  const sids = [...new Set(mine.map((r) => s(r.sessionId)))];
  const sessions: Row[] = [];
  for (let i = 0; i < sids.length; i += 500) sessions.push(...(await repo.findMany("PracticeSession", { id: { in: sids.slice(i, i + 500) } }, { select: ["id", "mode", "assignmentId"] })));
  const aids = [...new Set(sessions.map((x) => s(x.assignmentId)).filter(Boolean))];
  const [as, checks] = aids.length ? await Promise.all([
    repo.findMany("Assignment", { id: { in: aids } }, { select: ["id", "testId", "curriculumPlanId", "title"] }),
    repo.findMany("SkillReviewCheck", { assignmentId: { in: aids } }, { select: ["assignmentId"] }),
  ]) : [[], []] as Row[][];
  const bad = new Set([...as.filter((a) => a.testId || TEST_MARKS.has(s(a.curriculumPlanId)) || s(a.title).startsWith("Re-check: ")).map((a) => s(a.id)), ...checks.map((c) => s(c.assignmentId))]);
  const ok = new Set(sessions.filter((x) => PRACTICE_MODES.has(s(x.mode)) && !bad.has(s(x.assignmentId))).map((x) => s(x.id)));
  const counted = mine.filter((r) => ok.has(s(r.sessionId)));
  return { answered: counted.length, correct: counted.filter((r) => Boolean(r.isCorrect)).length, at: counted.map((r) => ms(r.createdAt)).sort((a, b) => a - b) };
}

/** The engine's mastery for a key: the best score of the student's rows of its skills, mastered if one is. */
export async function engineMastery(repo: Repo, studentId: string, skillIds: readonly string[]): Promise<{ score: number; mastered: boolean }> {
  if (!skillIds.length) return { score: 0, mastered: false };
  const rows = await repo.findMany("StudentSkillMastery", { studentId, skillId: { in: [...skillIds] } }, { select: ["score", "isMastered"] });
  return { score: rows.reduce((m, r) => Math.max(m, Number(r.score ?? 0)), 0), mastered: rows.some((r) => Boolean(r.isMastered)) };
}

export interface Decision { status: StarStatus; justMastered: boolean; justNeedsSupport: boolean }
/**
 * The status rule (pure). `answered` = counted answers at this level (since the level started), `sinceFail` = counted
 * answers since a failed review.
 */
export function decideStatus(prev: StarStatus | null, answered: number, mastered: boolean, opts: { sinceFail?: number; needsSupport?: boolean } = {}): Decision {
  const was = prev ?? "NOT_STARTED";
  let status: StarStatus;
  if (was === "MASTERED") status = "MASTERED";
  else if (was === "NEEDS_REVIEW") status = mastered && (opts.sinceFail ?? 0) >= REMASTER_ANSWERS ? "MASTERED" : "NEEDS_REVIEW";
  else if (answered >= STAR_MIN_ANSWERS && mastered) status = "MASTERED";
  else if (answered > 0) status = "IN_PROGRESS";
  else status = was === "NEXT_LEVEL" ? "NEXT_LEVEL" : "NOT_STARTED";
  return { status, justMastered: status === "MASTERED" && was !== "MASTERED", justNeedsSupport: status === "IN_PROGRESS" && answered >= STAR_MAX_ANSWERS && !opts.needsSupport };
}

/** When the current level of a skill started (a level-up made a new row over a lower one), else 0 (all answers count). */
export function levelStart(rows: readonly Row[], prev: Row | null): number {
  if (!prev) return 0;
  const lv = Number(prev.level ?? 1);
  return rows.some((r) => s(r.skillKey) === s(prev.skillKey) && Number(r.level ?? 1) < lv) ? ms(prev.createdAt) : 0;
}

const hist = (v: unknown): Row[] => { if (Array.isArray(v)) return v as Row[]; if (typeof v === "string") { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } } return []; };
export const historyOf = hist;
const pushHist = (h: Row[], e: Row): Row[] => [...h, e].slice(-40);

export interface RefreshResult { key: string; status: StarStatus; justMastered: boolean; justNeedsSupport: boolean; answered: number; level: number }

/**
 * Recomputes ONE student's status of the skill's key from the data (idempotent: the same data gives the same row).
 * Called after every skill-practice answer (onSkillAnswer) and by the migration.
 */
export async function refreshSkillStatus(repo: Repo, studentId: string, skillId: string, now = new Date(), opts: { schoolId?: string; quiet?: boolean; index?: SkillKeyIndex } = {}): Promise<RefreshResult | null> {
  const schoolId = opts.schoolId ?? (await studentSchool(repo, studentId));
  if (!schoolId) return null;
  const ix = opts.index ?? (await skillKeyIndex(repo, schoolId));
  const key = ix.keyOf.get(s(skillId));
  if (!key) return null;
  const skillIds = ix.skillsOf.get(key) ?? [s(skillId)];
  const rows = await repo.findMany("SkillStatus", { studentId, skillKey: key });
  const prev = currentRows(rows).get(key) ?? null;
  const level = prev ? Number(prev.level ?? 1) : await currentStarLevel(repo, studentId);
  // a level the student moved up to (a lower level's row exists) counts only the answers given since it started
  const since = levelStart(rows, prev);
  const [cnt, eng] = await Promise.all([countedAnswers(repo, studentId, skillIds, since), engineMastery(repo, studentId, skillIds)]);
  const prevStatus = prev ? (s(prev.status) as StarStatus) : null;
  const failAt = prevStatus === "NEEDS_REVIEW" ? Math.max(0, ...hist(prev?.history).filter((h) => s(h.status) === "NEEDS_REVIEW").map((h) => ms(h.at))) : 0;
  const sinceFail = failAt ? cnt.at.filter((t) => t > failAt).length : 0;
  const d = decideStatus(prevStatus, cnt.answered, eng.mastered, { sinceFail, needsSupport: Boolean(prev?.needsSupportAt) });
  if (!prev && d.status === "NOT_STARTED") return { key, status: "NOT_STARTED", justMastered: false, justNeedsSupport: false, answered: 0, level };
  const rose = Number(eng.score) > Number(prev?.score ?? 0) + 0.5;
  let history = hist(prev?.history);
  if (!prev || s(prev.status) !== d.status) history = pushHist(history, { at: now.toISOString(), status: d.status, why: d.justMastered ? `${cnt.answered} answers and mastered` : !prev ? "started" : "practice" });
  const data: Row = {
    status: d.status, skillId: s(skillId), answered: cnt.answered, correct: cnt.correct, score: eng.score, history, updatedAt: now,
    ...(!prev?.startedAt && cnt.answered > 0 ? { startedAt: now } : {}),
    ...(rose || !prev ? { progressAt: now, progressAnswered: cnt.answered } : {}),
    ...(d.justMastered ? { masteredAt: now, reviewDueAt: new Date(now.getTime() + REVIEW_AFTER_DAYS * DAY), needsSupportAt: null, celebratedAt: null } : {}),
    ...(d.justNeedsSupport ? { needsSupportAt: now } : {}),
  };
  if (prev) await repo.updateMany("SkillStatus", { id: prev.id }, data);
  else {
    try { await repo.create("SkillStatus", { studentId, skillKey: key, level, createdAt: now, ...data }); }
    catch { await repo.updateMany("SkillStatus", { studentId, skillKey: key, level }, data); } // a second request won the race
  }
  if (!opts.quiet) {
    if (d.justMastered) await onStarEarned(repo, studentId, s(skillId), level, now).catch(() => undefined);
    if (d.justNeedsSupport) await onNeedsSupport(repo, studentId, s(skillId), ix.nameOf.get(key) ?? "a skill", now).catch(() => undefined);
  }
  return { key, status: d.status, justMastered: d.justMastered, justNeedsSupport: d.justNeedsSupport, answered: cnt.answered, level };
}

/**
 * 🔌 THE hook (called after each skill-practice or question-set answer, after the response: the student never waits).
 * A failure never breaks the answer.
 */
export async function onSkillAnswer(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<RefreshResult | null> {
  try { return await refreshSkillStatus(repo, studentId, skillId, now); } catch { return null; }
}

/** ⭐ earned: coins (the existing coins, once per skill and level). The light celebration shows on My Plan / My Work. */
async function onStarEarned(repo: Repo, studentId: string, skillId: string, level: number, now: Date): Promise<void> {
  const { awardCoins, COINS } = await import("../motivation/coins");
  // the same refId as the existing "skill mastered" coins: a star and that rule never pay twice for one skill
  await awardCoins(repo, studentId, "mastered", COINS.mastered, level > 1 ? `${skillId}:L${level}` : skillId, { note: "New star", now });
}

/** 50 answers without mastery: one alert to the class's teachers (the RTI plan then suggests the student + skill). */
async function onNeedsSupport(repo: Repo, studentId: string, skillId: string, skillName: string, now: Date): Promise<void> {
  const open = await repo.findMany("InterventionAlert", { studentId, skillId, ruleCode: "NEEDS_SUPPORT", resolvedAt: null }, { select: ["id"] });
  if (open.length) return;
  await repo.create("InterventionAlert", { studentId, skillId, ruleCode: "NEEDS_SUPPORT", message: `50 questions on ${skillName} without mastery: needs support.`, evidence: { answers: STAR_MAX_ANSWERS }, createdAt: now });
  const st = await repo.findUnique("Student", { id: studentId });
  const u = st ? await repo.findUnique("User", { id: st.userId }) : null;
  const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  const ct = m.length ? await repo.findMany("ClassTeacher", { classId: { in: m.map((x) => x.classId) } }, { select: ["teacherId"] }) : [];
  const ts = ct.length ? await repo.findMany("Teacher", { id: { in: [...new Set(ct.map((x) => s(x.teacherId)))] } }, { select: ["userId"] }) : [];
  if (ts.length) await repo.createMany("Notification", ts.map((t) => ({ userId: t.userId, type: "INTERVENTION_ALERT", title: `🛟 ${s(u?.displayName) || "A student"} needs support`, body: `50 questions on “${skillName}” without mastery. The RTI plan suggests this skill for the student.`, link: `/teacher/rti-plan`, readAt: null, createdAt: now })));
}

// ------------------------------------------------------------------ level (the student's own star level)

/** The student's current star level (1 until a level-up). */
export async function currentStarLevel(repo: Repo, studentId: string): Promise<number> {
  const r = (await repo.findMany("SkillStatus", { studentId, skillKey: LEVEL_ROW }, { select: ["level"] }))[0];
  return r ? Math.max(1, Number(r.level ?? 1)) : 1;
}

/**
 * A new, higher level (a MAP result moved the student up): every ⭐ skill that gets harder with level becomes ☆⬆ at
 * the new level (a new row; the old ⭐ row stays as history); stable skills keep ⭐. Idempotent per `eventId`.
 * Returns how many skills became ☆⬆.
 */
export async function applyLevelUp(repo: Repo, studentId: string, eventId: string, now = new Date()): Promise<number> {
  const all = await repo.findMany("SkillStatus", { studentId });
  const meta = all.find((r) => s(r.skillKey) === LEVEL_ROW);
  const done = hist(meta?.history).map((h) => s(h.event));
  if (done.includes(eventId)) return 0;
  const level = (meta ? Number(meta.level ?? 1) : 1) + 1;
  let n = 0;
  for (const r of currentRows(all).values()) {
    if (s(r.status) !== "MASTERED" || !getsHarderWithLevel(s(r.skillKey))) continue;
    const h = pushHist(hist(r.history), { at: now.toISOString(), status: "NEXT_LEVEL", why: `level ${level}` });
    try { await repo.create("SkillStatus", { studentId, skillKey: s(r.skillKey), level, status: "NEXT_LEVEL", skillId: r.skillId ?? null, answered: 0, correct: 0, score: 0, history: h, createdAt: now, updatedAt: now }); n++; } catch { /* already there */ }
  }
  const mh = pushHist(hist(meta?.history), { at: now.toISOString(), event: eventId, level });
  if (meta) await repo.updateMany("SkillStatus", { id: meta.id }, { level, history: mh, updatedAt: now });
  else await repo.create("SkillStatus", { studentId, skillKey: LEVEL_ROW, level, status: "LEVEL", history: mh, createdAt: now, updatedAt: now });
  return n;
}

/** Level-ups recorded since (AuditLog level.change, upward): applied once each. Bounded (the last 60 days). */
export async function syncLevelUps(repo: Repo, studentId: string, now = new Date()): Promise<number> {
  const audits = await repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change", createdAt: { gte: new Date(now.getTime() - 60 * DAY) } }, { select: ["id", "before", "after", "createdAt"], take: 50 });
  if (!audits.length) return 0;
  const { levelUps } = await import("../motivation/sync");
  let n = 0;
  for (const u of levelUps(audits).sort((a, b) => a.at - b.at)) n += await applyLevelUp(repo, studentId, `audit:${u.id}`, now);
  return n;
}
