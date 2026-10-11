/**
 * 🚀 ReadRise — article import (JSON in data/readrise/FORMAT.md format, or the Excel template).
 *
 *   validateArticle(json)      strict checks (12 levels 300–1400, per band 5 key words + 8 questions with 4 options
 *                              and an A–D answer + a prompt) and, per version, the estimated ReadRise Level and word
 *                              count against the target (warnings, with a hint for the writer)
 *   importArticleJson(...)     upserts RRArticle / RRVersion / RRQuestion / RRPrompt by code (school-scoped;
 *                              platform codes "RR-…"); idempotent
 *   templateWorkbook()         the downloadable Excel template (Instructions, Article, Versions, KeyWords, Questions,
 *                              Prompts — an [Example] row on each sheet)
 *   parseArticleXlsx(buf)      the filled template → the JSON format, with sheet/row locations for every problem
 *   (the platform seed of data/readrise/articles/*.json is in ./seed.ts)
 *
 * "ReadRise Level" is an estimate on a Lexile-like scale, never an official Lexile measure.
 */
import type { Repo, Row } from "../seeding/repo";
import { can, ForbiddenError, type Actor } from "../auth/rbac";
import { audit } from "../audit";
import { analyzeText } from "../../reading/prl";
import { readPart, readXlsx, readZipEntries } from "../../imports/xlsx";
import { workbookXlsx, type Sheet } from "../../imports/questions/template-files";
import { estimateLevel, RR_LEVELS, targetWords, type RRBand } from "./level";

export const BANDS: readonly RRBand[] = ["LOW", "MID", "HIGH"];
export const BAND_RANGE: Record<RRBand, string> = { LOW: "300–600", MID: "700–1000", HIGH: "1100–1400" };
export const BAND_LEVELS: Record<RRBand, number[]> = { LOW: [300, 400, 500, 600], MID: [700, 800, 900, 1000], HIGH: [1100, 1200, 1300, 1400] };
export const RR_SKILLS = ["central-idea", "detail", "inference", "vocabulary", "text-structure", "author-purpose", "cause-effect", "sequence", "compare"] as const;
export const RR_TOPICS = ["Science", "Animals", "Space", "Earth", "Health", "Technology", "History", "People", "Environment", "Sports"] as const;
export const PLATFORM_PREFIX = "RR-";
export const EXAMPLE_MARK = "[Example]";
/** Estimated level further than this from the version's level → a warning. */
export const LEVEL_TOLERANCE = 100;
const MAX_TEXT = 20_000;

export interface KeyWordJson { word: string; partOfSpeech?: string; definition: string; example: string }
export interface QuestionJson { stem: string; options: string[]; answer: string; skill: string; why?: string; wrong?: Record<string, string> }
export interface BandJson { keyWords: KeyWordJson[]; questions: QuestionJson[]; prompt: string; checklist?: string[] }
export interface VersionJson { level: number; title: string; text: string; officialLexile?: number | null }
export interface ArticleJson { code: string; title: string; topic: string; summary?: string; poll: string; versions: VersionJson[]; bands: Record<RRBand, BandJson> }

/** A problem and where it is (a JSON place, or "Questions row 7" for the Excel template). */
export interface Issue { where: string; message: string }
export interface VersionCheck {
  level: number; title: string; wordCount: number; estLevel: number; target: { min: number; max: number };
  levelOk: boolean; wordsOk: boolean; hint: string | null;
}
export interface ValidationResult { article: ArticleJson | null; errors: Issue[]; warnings: Issue[]; checks: VersionCheck[] }

/** Maps a logical place ("article", "version:300", "q:LOW:3", "kw:MID:2", "prompt:HIGH", "band:LOW") to a label. */
export type Locate = (key: string) => string | undefined;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const defaultLabel = (key: string): string => {
  const [k, a, b] = key.split(":");
  if (k === "article") return "Article";
  if (k === "version") return a ? `Version ${a}` : "Versions";
  if (k === "q") return `${a} question ${b}`;
  if (k === "kw") return `${a} key word ${b}`;
  if (k === "prompt") return `${a} prompt`;
  if (k === "band") return `${a} band`;
  return key;
};

/** Words counted the same way as the level estimate. */
export const countWords = (text: string) => analyzeText(text).wordCount;

/** One version's estimated level and word count against its target, with a hint for the writer. */
export function checkVersion(level: number, title: string, text: string): VersionCheck {
  const estLevel = estimateLevel(text), wordCount = countWords(text), target = targetWords(level);
  const levelOk = Math.abs(estLevel - level) <= LEVEL_TOLERANCE;
  const wordsOk = wordCount >= Math.round(target.min * 0.85) && wordCount <= Math.round(target.max * 1.2);
  const hints: string[] = [];
  if (estLevel > level + LEVEL_TOLERANCE) hints.push("Reads harder than the target: make sentences shorter and use simpler words.");
  if (estLevel < level - LEVEL_TOLERANCE) hints.push("Reads easier than the target: use longer sentences that join ideas, and richer, more precise words.");
  if (wordCount < Math.round(target.min * 0.85)) hints.push(`Too short: aim for ${target.min}–${target.max} words.`);
  if (wordCount > Math.round(target.max * 1.2)) hints.push(`Too long: aim for ${target.min}–${target.max} words.`);
  return { level, title, wordCount, estLevel, target, levelOk, wordsOk, hint: hints.length ? hints.join(" ") : null };
}

/** Strict validation of an article in the FORMAT.md shape. Never throws. */
export function validateArticle(input: unknown, locate: Locate = () => undefined): ValidationResult {
  const errors: Issue[] = [], warnings: Issue[] = [], checks: VersionCheck[] = [];
  const at = (key: string) => locate(key) ?? defaultLabel(key);
  const err = (key: string, message: string) => errors.push({ where: at(key), message });
  const warn = (key: string, message: string) => warnings.push({ where: at(key), message });
  if (!input || typeof input !== "object" || Array.isArray(input)) return { article: null, errors: [{ where: "File", message: "The file is not a ReadRise article (expected one JSON object)." }], warnings, checks };
  const a = input as Record<string, unknown>;

  const code = str(a.code), title = str(a.title), topic = str(a.topic), summary = str(a.summary), poll = str(a.poll);
  if (!code) err("article", "Code is required (for example RR-021 or 4A-SPACE-01).");
  else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(code)) err("article", "Code: use 2–40 letters, digits, dots, dashes or underscores (no spaces).");
  if (!title) err("article", "Title is required.");
  else if (title.length > 191) err("article", "Title is too long (191 characters at most).");
  if (!topic) err("article", "Topic is required.");
  else if (topic.length > 60) err("article", "Topic is too long (60 characters at most).");
  else if (!RR_TOPICS.some((t) => t.toLowerCase() === topic.toLowerCase())) warn("article", `Topic “${topic}” is not one of the usual topics (${RR_TOPICS.join(", ")}). It will still be imported.`);
  if (summary.length > 400) err("article", "Summary is too long (400 characters at most).");
  if (!poll) err("article", "Poll statement is required (a sentence students agree or disagree with before and after reading).");
  else if (poll.length > 300) err("article", "Poll statement is too long (300 characters at most).");

  // ---- versions
  const rawVersions = Array.isArray(a.versions) ? (a.versions as unknown[]) : [];
  if (!Array.isArray(a.versions)) err("version", "Versions are missing: an article needs 12 versions (levels 300, 400 … 1400).");
  else if (rawVersions.length !== 12) err("version", `The article has ${rawVersions.length} version${rawVersions.length === 1 ? "" : "s"}; it needs exactly 12 (levels 300, 400 … 1400).`);
  const versions: VersionJson[] = [];
  const seen = new Set<number>();
  for (const [i, rv] of rawVersions.entries()) {
    const v = (rv && typeof rv === "object" ? rv : {}) as Record<string, unknown>;
    const level = Number(str(v.level));
    const key = Number.isFinite(level) && level ? `version:${level}` : `version:#${i + 1}`;
    if (!(RR_LEVELS as readonly number[]).includes(level)) { err(key, `Level “${str(v.level) || "(empty)"}” is not a ReadRise version level. Use 300, 400 … 1400.`); continue; }
    if (seen.has(level)) { err(key, `Level ${level} appears twice.`); continue; }
    seen.add(level);
    const vt = str(v.title), text = typeof v.text === "string" ? v.text.replace(/\r\n?/g, "\n").trim() : "";
    if (!vt) err(key, "Title is required.");
    else if (vt.length > 191) err(key, "Title is too long (191 characters at most).");
    if (!text) { err(key, "Text is required."); continue; }
    if (text.length > MAX_TEXT) { err(key, `Text is too long (${MAX_TEXT.toLocaleString()} characters at most).`); continue; }
    const off = v.officialLexile === undefined || v.officialLexile === null || str(v.officialLexile) === "" ? null : Number(str(v.officialLexile));
    if (off !== null && (!Number.isInteger(off) || off < 0 || off > 2000)) err(key, "Official Lexile must be a whole number from 0 to 2000 (or empty).");
    versions.push({ level, title: vt || title, text, ...(off !== null && Number.isInteger(off) ? { officialLexile: off } : {}) });
  }
  if (Array.isArray(a.versions) && rawVersions.length === 12) for (const l of RR_LEVELS) if (!seen.has(l)) err("version", `Level ${l} is missing.`);
  versions.sort((x, y) => x.level - y.level);
  let prevEst = -Infinity, prevLevel = 0;
  for (const v of versions) {
    const c = checkVersion(v.level, v.title, v.text);
    checks.push(c);
    if (!c.levelOk) warn(`version:${v.level}`, `Estimated ReadRise Level ${c.estLevel} is more than ${LEVEL_TOLERANCE} away from ${v.level}. ${c.hint ?? ""}`.trim());
    else if (!c.wordsOk) warn(`version:${v.level}`, `${c.wordCount} words; ${c.hint}`);
    if (c.estLevel < prevEst) warn(`version:${v.level}`, `Levels are not rising: version ${v.level} reads easier (estimated ${c.estLevel}) than version ${prevLevel} (estimated ${prevEst}).`);
    prevEst = c.estLevel; prevLevel = v.level;
  }

  // ---- bands
  const rawBands = (a.bands && typeof a.bands === "object" ? a.bands : {}) as Record<string, unknown>;
  const bands = {} as Record<RRBand, BandJson>;
  for (const b of BANDS) {
    const rb = rawBands[b];
    if (!rb || typeof rb !== "object") { err(`band:${b}`, `The ${b} band (${BAND_RANGE[b]}) is missing: it needs 5 key words, 8 questions and a prompt.`); continue; }
    const band = rb as Record<string, unknown>;
    // key words
    const rawKw = Array.isArray(band.keyWords) ? (band.keyWords as unknown[]) : [];
    if (rawKw.length !== 5) err(`band:${b}`, `${b} has ${rawKw.length} key word${rawKw.length === 1 ? "" : "s"}; it needs exactly 5.`);
    const keyWords: KeyWordJson[] = [];
    for (const [i, rk] of rawKw.entries()) {
      const k = (rk && typeof rk === "object" ? rk : {}) as Record<string, unknown>;
      const kw: KeyWordJson = { word: str(k.word), partOfSpeech: str(k.partOfSpeech), definition: str(k.definition), example: str(k.example) };
      const key = `kw:${b}:${i + 1}`;
      if (!kw.word) err(key, "Word is required.");
      if (!kw.definition) err(key, "Definition is required.");
      if (!kw.example) err(key, "Example sentence is required.");
      if (kw.word) for (const lvl of BAND_LEVELS[b]) {
        const v = versions.find((x) => x.level === lvl);
        const stem = kw.word.toLowerCase().slice(0, Math.max(4, kw.word.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (v && !new RegExp(`\\b${stem}`, "i").test(v.text)) warn(key, `“${kw.word}” does not appear in version ${lvl}.`);
      }
      keyWords.push(kw);
    }
    // questions
    const rawQs = Array.isArray(band.questions) ? (band.questions as unknown[]) : [];
    if (rawQs.length !== 8) err(`band:${b}`, `${b} has ${rawQs.length} question${rawQs.length === 1 ? "" : "s"}; it needs exactly 8.`);
    const questions: QuestionJson[] = [];
    for (const [i, rq] of rawQs.entries()) {
      const q = (rq && typeof rq === "object" ? rq : {}) as Record<string, unknown>;
      const key = `q:${b}:${i + 1}`;
      const stem = str(q.stem), options = Array.isArray(q.options) ? (q.options as unknown[]).map(str) : [];
      const answer = str(q.answer).toUpperCase(), skill = str(q.skill).toLowerCase().replace(/[\s_]+/g, "-"), why = str(q.why);
      if (!stem) err(key, "Question text is required.");
      if (options.length !== 4 || options.some((o) => !o)) err(key, "Needs exactly 4 answer choices (A, B, C, D), none empty.");
      if (!/^[ABCD]$/.test(answer)) err(key, `Answer must be A, B, C or D (found “${str(q.answer) || "(empty)"}”).`);
      if (!skill) err(key, `Skill is required (${RR_SKILLS.join(", ")}).`);
      else if (!(RR_SKILLS as readonly string[]).includes(skill)) err(key, `Skill “${str(q.skill)}” is not known. Use one of: ${RR_SKILLS.join(", ")}.`);
      if (!why) warn(key, "No explanation (Why): students see why the answer is right after the quiz.");
      const wrong: Record<string, string> = {};
      if (q.wrong && typeof q.wrong === "object") for (const [L, t] of Object.entries(q.wrong as Record<string, unknown>)) if (/^[ABCD]$/.test(L) && str(t)) wrong[L] = str(t);
      questions.push({ stem, options, answer, skill, ...(why ? { why } : {}), ...(Object.keys(wrong).length ? { wrong } : {}) });
    }
    if (questions.length === 8 && new Set(questions.map((q) => q.answer)).size < 3) warn(`band:${b}`, "The answers use fewer than 3 different letters: spread them over A–D.");
    const prompt = str(band.prompt);
    if (!prompt) err(`prompt:${b}`, "The written-answer prompt is required.");
    else if (prompt.length > 2000) err(`prompt:${b}`, "The prompt is too long (2,000 characters at most).");
    const checklist = (Array.isArray(band.checklist) ? (band.checklist as unknown[]) : typeof band.checklist === "string" ? band.checklist.split("|") : []).map(str).filter(Boolean);
    if (prompt && !checklist.length) warn(`prompt:${b}`, "No checklist: add what a strong answer includes (students see it; teachers score with it).");
    bands[b] = { keyWords, questions, prompt, checklist };
  }

  if (errors.length) return { article: null, errors, warnings, checks };
  return { article: { code, title, topic, summary, poll, versions, bands }, errors, warnings, checks };
}

// ------------------------------------------------------------------ write

export interface ImportOptions { schoolId: string | null; publish: boolean; locate?: Locate; now?: Date }
export interface ImportResult extends ValidationResult { ok: boolean; articleId: string | null; created: boolean; status: "DRAFT" | "PUBLISHED" | null }

const STAFF = new Set(["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"]);

/**
 * Validates and stores one article. `actor` null = the platform seed. Teachers and admins write their school's
 * articles (DRAFT unless they hold questions:publish and ask to publish); only a super admin (or the seed) writes
 * the platform library. Re-importing the same code updates the same rows (ids, official Lexile values kept).
 */
export async function importArticleJson(repo: Repo, actor: Actor | null, json: unknown, opts: ImportOptions): Promise<ImportResult> {
  if (actor) {
    if (!STAFF.has(actor.role) || !can(actor, "questions:edit")) throw new ForbiddenError("Only teachers and admins can import ReadRise articles.");
    if (opts.schoolId === null && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the platform can add articles to the platform library.");
    if (opts.schoolId !== null && opts.schoolId !== actor.schoolId && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("You can only import articles for your own school.");
    if (opts.publish && !can(actor, "questions:publish")) throw new ForbiddenError("Publishing needs the questions:publish permission. Import as a draft; an admin publishes it.");
  }
  const v = validateArticle(json, opts.locate);
  const fail = (extra?: Issue): ImportResult => ({ ...v, errors: extra ? [...v.errors, extra] : v.errors, ok: false, articleId: null, created: false, status: null });
  if (!v.article) return fail();
  const art = v.article;
  const platformCode = art.code.toUpperCase().startsWith(PLATFORM_PREFIX);
  if (opts.schoolId === null && !platformCode) return fail({ where: "Article", message: `Platform article codes start with “${PLATFORM_PREFIX}”.` });
  if (opts.schoolId !== null && platformCode) return fail({ where: "Article", message: `Codes starting with “${PLATFORM_PREFIX}” are kept for the platform library. Choose another code (for example ${art.code.slice(3) || "MY"}-SCH).` });

  const now = opts.now ?? new Date();
  const status = opts.publish ? "PUBLISHED" : "DRAFT";
  const existing = (await repo.findMany("RRArticle", { schoolId: opts.schoolId, code: art.code }))[0] ?? null;
  if (existing && actor?.role === "TEACHER" && existing.createdById && existing.createdById !== actor.userId)
    return fail({ where: "Article", message: `Another teacher's article already uses the code “${art.code}”. Choose another code.` });

  const articleId = await repo.transaction(async (tx) => {
    const fields: Row = { title: art.title, topic: art.topic, summary: art.summary || null, pollStatement: art.poll, status, deletedAt: null, updatedAt: now };
    let id: string;
    if (existing) { id = String(existing.id); await tx.updateMany("RRArticle", { id }, fields); }
    else id = String((await tx.create("RRArticle", { ...fields, schoolId: opts.schoolId, code: art.code, createdById: actor?.userId ?? null, createdAt: now })).id);
    for (const ver of art.versions) {
      const c = v.checks.find((x) => x.level === ver.level)!;
      const data: Row = { title: ver.title, body: ver.text, wordCount: c.wordCount, estLevel: c.estLevel };
      if (ver.officialLexile !== undefined) data.officialLexile = ver.officialLexile;
      await tx.upsert("RRVersion", { articleId: id, level: ver.level }, data, data);
    }
    for (const b of BANDS) {
      const band = art.bands[b];
      for (const [i, q] of band.questions.entries()) {
        const rationale: Record<string, string> = { ...(q.wrong ?? {}) };
        if (q.why) rationale[q.answer] = q.why;
        const data: Row = { stem: q.stem, options: q.options, answer: q.answer, skill: q.skill, rationale: Object.keys(rationale).length ? rationale : null };
        await tx.upsert("RRQuestion", { articleId: id, band: b, number: i + 1 }, data, data);
      }
      const p: Row = { prompt: band.prompt, checklist: band.checklist ?? [], keyWords: band.keyWords };
      await tx.upsert("RRPrompt", { articleId: id, band: b }, p, p);
    }
    return id;
  });
  if (actor) await audit(repo, { actorId: actor.userId, action: existing ? "readrise.article.reimport" : "readrise.article.import", entityType: "RRArticle", entityId: articleId, after: { code: art.code, status, schoolId: opts.schoolId }, at: now });
  return { ...v, ok: true, articleId, created: !existing, status };
}

// ------------------------------------------------------------------ Excel template

const VERSION_HEAD = ["Level", "Title", "Text"];
const ARTICLE_HEAD = ["Code", "Title", "Topic", "Summary", "Poll statement"];
const KW_HEAD = ["Band", "Word", "Part of speech", "Definition", "Example"];
const Q_HEAD = ["Band", "Number", "Question", "A", "B", "C", "D", "Answer", "Skill", "Why"];
const P_HEAD = ["Band", "Prompt", "Checklist (lines separated by |)"];
const col = (i: number): string => String.fromCharCode(65 + i);
const listValidation = (colIdx: number, rows: number, values: readonly string[]) =>
  `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${col(colIdx)}2:${col(colIdx)}${rows}"><formula1>"${values.join(",")}"</formula1></dataValidation>`;
const validations = (...v: string[]) => `<dataValidations count="${v.length}">${v.join("")}</dataValidations>`;

/** The downloadable Excel template: one article per file. */
export function templateWorkbook(): Uint8Array {
  const levelRows = RR_LEVELS.map((l) => { const t = targetWords(l); return [String(l), l <= 600 ? "LOW" : l <= 1000 ? "MID" : "HIGH", `${t.min}–${t.max} words`]; });
  const instructions: Sheet = {
    name: "Instructions", widths: [26, 110],
    rows: [
      ["ReadRise article template"],
      ["One article per file. The same article is written 12 times, from level 300 (easiest) to 1400 (hardest). Every version teaches the same facts."],
      [""],
      ["Step", "What to do"],
      ["1.", "Article sheet: write the Code (letters, digits, dashes; codes starting with RR- are kept for the platform library), the Title, the Topic, a one-sentence Summary and a Poll statement students agree or disagree with before and after reading."],
      ["2.", "Versions sheet: write a Title and the Text for each of the 12 levels. Separate paragraphs with a blank line (Alt+Enter twice in a cell). Keep each version near its target word count (table below)."],
      ["3.", "KeyWords sheet: 5 key words per band (LOW, MID, HIGH), each with part of speech, a kid-friendly definition and a NEW example sentence. The word must appear in every version of its band."],
      ["4.", "Questions sheet: 8 questions per band. Write the question, four choices A–D, the correct letter, the skill and why the answer is right. Mix skills: at least 1 central idea, 2 details, 2 inference, 1 vocabulary, 1 text structure or author's purpose, 1 cause–effect / sequence / compare."],
      ["5.", "Prompts sheet: one short written-answer prompt per band, with a checklist of what a strong answer includes (separate the lines with |)."],
      ["6.", "Upload the file in ReadRise → Import. The preview shows, for each version, the estimated ReadRise Level against the target (✓ or ⚠ with a hint), and every problem with its sheet and row. Nothing is saved until you click Import."],
      ["7.", "The article is imported as a DRAFT. Open it, check the 12 versions side by side, then Publish (teachers without the publish permission ask an admin)."],
      ["", `Rows that start with ${EXAMPLE_MARK} are examples: they are ignored. You may delete them.`],
      ["", "The ReadRise Level is an estimate on a Lexile-like scale (sentence length and word length). It is NOT an official Lexile measure; an official Lexile can be added per version on the review page."],
      ["", "If the estimate is too high: make sentences shorter and use simpler, shorter words. If it is too low: join ideas into longer sentences and use richer, more precise words."],
      [""],
      ["Bands", "LOW = versions 300–600 · MID = versions 700–1000 · HIGH = versions 1100–1400. Each band has its own key words, questions and prompt, and they must work for every version in the band."],
      ["Skills", RR_SKILLS.join(", ")],
      ["Topics", RR_TOPICS.join(", ")],
      [""],
      ["Level", "Band · target words"],
      ...levelRows.map((r) => [r[0], `${r[1]} · ${r[2]}`]),
    ],
  };
  const article: Sheet = {
    name: "Article", headerStyle: true, freeze: true, widths: [18, 34, 16, 50, 50],
    rows: [ARTICLE_HEAD, [`${EXAMPLE_MARK} 4A-OASIS`, "Life in an Oasis", "Environment", "How people, plants and animals share the water of a desert oasis.", "Every town should protect its water like an oasis does."], ["", "", "", "", ""]],
    validations: validations(listValidation(2, 3, RR_TOPICS)),
  };
  const versions: Sheet = {
    name: "Versions", headerStyle: true, freeze: true, widths: [16, 30, 110], numericCols: new Set([0]),
    rows: [VERSION_HEAD, [`${EXAMPLE_MARK} 300`, "Life in an Oasis", "An oasis is a green place in the desert. It has water.\n\nPalm trees grow there. People come to drink and rest."], ...RR_LEVELS.map((l) => [String(l), "", ""])],
  };
  const kwRows = BANDS.flatMap((b) => Array.from({ length: 5 }, () => [b, "", "", "", ""]));
  const keyWords: Sheet = {
    name: "KeyWords", headerStyle: true, freeze: true, widths: [10, 18, 16, 50, 60],
    rows: [KW_HEAD, [`${EXAMPLE_MARK} LOW`, "oasis", "noun", "a green place in a desert where there is water", "We stopped at the oasis to fill our bottles."], ...kwRows],
    validations: validations(listValidation(0, kwRows.length + 2, BANDS)),
  };
  const qRows = BANDS.flatMap((b) => Array.from({ length: 8 }, (_, i) => [b, String(i + 1), "", "", "", "", "", "", "", ""]));
  const questions: Sheet = {
    name: "Questions", headerStyle: true, freeze: true, widths: [10, 9, 50, 24, 24, 24, 24, 9, 16, 44], numericCols: new Set([1]),
    rows: [Q_HEAD, [`${EXAMPLE_MARK} LOW`, "1", "What is the article mostly about?", "how an oasis gives life in the desert", "how to build a well", "why camels are fast", "where rain comes from", "A", "central-idea", "The whole article explains how the water of an oasis helps people, plants and animals."], ...qRows],
    validations: validations(listValidation(0, qRows.length + 2, BANDS), listValidation(7, qRows.length + 2, ["A", "B", "C", "D"]), listValidation(8, qRows.length + 2, RR_SKILLS)),
  };
  const prompts: Sheet = {
    name: "Prompts", headerStyle: true, freeze: true, widths: [10, 70, 70],
    rows: [P_HEAD, [`${EXAMPLE_MARK} LOW`, "Why is water so important in an oasis? Use two facts from the article.", "Answer the question | Use two facts from the article | Write in complete sentences"], ...BANDS.map((b) => [b, "", ""])],
    validations: validations(listValidation(0, 6, BANDS)),
  };
  return workbookXlsx([instructions, article, versions, keyWords, questions, prompts]);
}

// ------------------------------------------------------------------ Excel → JSON

/** Sheet names in workbook order. */
export function xlsxSheetNames(buf: Buffer): string[] {
  const entries = readZipEntries(buf);
  const wb = entries.get("xl/workbook.xml");
  if (!wb) throw new Error("The Excel file has no workbook.");
  return [...readPart(buf, wb).matchAll(/<sheet\b[^>]*>/g)].map((m) => (m[0].match(/\bname="([^"]*)"/)?.[1] ?? "").replace(/&amp;/g, "&").trim());
}

const normHead = (h: string) => String(h ?? "").toLowerCase().replace(/\(.*?\)|\*/g, "").replace(/[\s_]+/g, " ").trim();
const isExample = (r: string[]) => /^\s*\[example\]/i.test(r[0] ?? "");
const bandFrom = (raw: string): RRBand | null => { const w = raw.trim().toUpperCase().split(/[\s(·-]+/)[0]; return (BANDS as readonly string[]).includes(w) ? (w as RRBand) : null; };

export interface ParsedFile { json: unknown; errors: Issue[]; locate: Locate }

/** Reads the filled Excel template into the JSON format; problems carry the sheet and row. */
export function parseArticleXlsx(buf: Buffer): ParsedFile {
  const errors: Issue[] = [];
  const places = new Map<string, string>();
  const locate: Locate = (k) => places.get(k);
  let names: string[];
  try { names = xlsxSheetNames(buf); } catch (e) { return { json: null, errors: [{ where: "File", message: (e as Error).message }], locate }; }
  const sheet = (name: string, head: string[]): { rows: { n: number; cells: Record<string, string> }[] } | null => {
    const real = names.find((x) => x.toLowerCase() === name.toLowerCase());
    if (!real) { errors.push({ where: name, message: `The sheet “${name}” is missing. Download the template again and keep the sheet names.` }); return null; }
    const table = readXlsx(buf, { sheet: real });
    const hi = table.findIndex((r) => normHead(r[0] ?? "") === normHead(head[0]));
    if (hi < 0) { errors.push({ where: name, message: `The header row (${head.join(", ")}) was not found.` }); return null; }
    const idx = table[hi].map(normHead);
    const missing = head.filter((h) => !idx.includes(normHead(h)));
    if (missing.length) { errors.push({ where: name, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` }); return null; }
    const rows = table.slice(hi + 1).map((r, i) => ({ r, n: hi + i + 2 })).filter(({ r }) => !isExample(r))
      .map(({ r, n }) => ({ n, cells: Object.fromEntries(head.map((h) => [h, String(r[idx.indexOf(normHead(h))] ?? "").trim()])) }));
    return { rows };
  };

  const json: Record<string, unknown> = {};
  const art = sheet("Article", ARTICLE_HEAD);
  if (art) {
    const row = art.rows.find((r) => Object.values(r.cells).some(Boolean));
    if (!row) errors.push({ where: "Article", message: "The article row is empty: fill in Code, Title, Topic, Summary and Poll statement." });
    else {
      places.set("article", `Article row ${row.n}`);
      Object.assign(json, { code: row.cells.Code, title: row.cells.Title, topic: row.cells.Topic, summary: row.cells.Summary, poll: row.cells["Poll statement"] });
      if (art.rows.filter((r) => Object.values(r.cells).some(Boolean)).length > 1) errors.push({ where: "Article", message: "One article per file: the Article sheet has more than one filled row." });
    }
  }
  const ver = sheet("Versions", VERSION_HEAD);
  if (ver) {
    places.set("version", "Versions");
    const filled = ver.rows.filter((r) => r.cells.Title || r.cells.Text || r.cells.Level);
    json.versions = filled.map((r) => {
      const level = Number(r.cells.Level);
      places.set(Number.isFinite(level) && level ? `version:${level}` : `version:#${filled.indexOf(r) + 1}`, `Versions row ${r.n} (level ${r.cells.Level || "?"})`);
      return { level: Number.isFinite(level) && r.cells.Level !== "" ? level : r.cells.Level, title: r.cells.Title, text: r.cells.Text };
    });
  }
  const bands: Record<string, { keyWords: unknown[]; questions: { n: number; q: unknown }[]; prompt?: string; checklist?: string[] }> = {};
  for (const b of BANDS) bands[b] = { keyWords: [], questions: [] };
  const kw = sheet("KeyWords", KW_HEAD);
  if (kw) for (const r of kw.rows) {
    if (!r.cells.Word && !r.cells.Definition && !r.cells.Example && !r.cells["Part of speech"]) continue; // only the band filled in
    const b = bandFrom(r.cells.Band);
    if (!b) { errors.push({ where: `KeyWords row ${r.n}`, message: `Band must be LOW, MID or HIGH (found “${r.cells.Band || "(empty)"}”).` }); continue; }
    bands[b].keyWords.push({ word: r.cells.Word, partOfSpeech: r.cells["Part of speech"], definition: r.cells.Definition, example: r.cells.Example });
    places.set(`kw:${b}:${bands[b].keyWords.length}`, `KeyWords row ${r.n}`);
  }
  const qs = sheet("Questions", Q_HEAD);
  if (qs) for (const r of qs.rows) {
    const c = r.cells;
    if (!c.Question && !c.A && !c.B && !c.C && !c.D && !c.Answer && !c.Why) continue;
    const b = bandFrom(c.Band);
    if (!b) { errors.push({ where: `Questions row ${r.n}`, message: `Band must be LOW, MID or HIGH (found “${c.Band || "(empty)"}”).` }); continue; }
    const num = Number(c.Number);
    if (!Number.isInteger(num) || num < 1 || num > 8) { errors.push({ where: `Questions row ${r.n}`, message: `Number must be 1 to 8 (found “${c.Number || "(empty)"}”).` }); continue; }
    if (bands[b].questions.some((x) => x.n === num)) { errors.push({ where: `Questions row ${r.n}`, message: `${b} question ${num} appears twice.` }); continue; }
    bands[b].questions.push({ n: num, q: { stem: c.Question, options: [c.A, c.B, c.C, c.D], answer: c.Answer, skill: c.Skill, why: c.Why } });
    places.set(`qrow:${b}:${num}`, `Questions row ${r.n}`);
  }
  for (const b of BANDS) {
    bands[b].questions.sort((x, y) => x.n - y.n);
    bands[b].questions.forEach((x, i) => { const p = places.get(`qrow:${b}:${x.n}`); if (p) places.set(`q:${b}:${i + 1}`, `${p} (${b} ${x.n})`); });
    places.set(`band:${b}`, `${b} band`);
  }
  const pr = sheet("Prompts", P_HEAD);
  if (pr) for (const r of pr.rows) {
    const c = r.cells;
    if (!c.Prompt && !c["Checklist (lines separated by |)"]) continue;
    const b = bandFrom(c.Band);
    if (!b) { errors.push({ where: `Prompts row ${r.n}`, message: `Band must be LOW, MID or HIGH (found “${c.Band || "(empty)"}”).` }); continue; }
    if (bands[b].prompt !== undefined) { errors.push({ where: `Prompts row ${r.n}`, message: `${b} has more than one prompt.` }); continue; }
    bands[b].prompt = c.Prompt;
    bands[b].checklist = c["Checklist (lines separated by |)"].split(/\s*\|\s*|\n+/).map((x) => x.trim()).filter(Boolean);
    places.set(`prompt:${b}`, `Prompts row ${r.n}`);
  }
  json.bands = Object.fromEntries(BANDS.map((b) => [b, { keyWords: bands[b].keyWords, questions: bands[b].questions.map((x) => x.q), prompt: bands[b].prompt ?? "", checklist: bands[b].checklist ?? [] }]));
  return { json, errors, locate };
}

/** An uploaded file (Excel template or JSON) → the article JSON with its locations. */
export function parseArticleFile(name: string, buf: Buffer): ParsedFile {
  const looksJson = /\.json$/i.test(name) || buf.subarray(0, 64).toString("utf8").trimStart().startsWith("{");
  if (looksJson) {
    try { return { json: JSON.parse(buf.toString("utf8").replace(/^﻿/, "")), errors: [], locate: () => undefined }; }
    catch (e) { return { json: null, errors: [{ where: "File", message: `The JSON file could not be read: ${(e as Error).message}` }], locate: () => undefined }; }
  }
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) return { json: null, errors: [{ where: "File", message: "Upload the ReadRise Excel template (.xlsx) or a JSON article file." }], locate: () => undefined };
  try { return parseArticleXlsx(buf); }
  catch (e) { return { json: null, errors: [{ where: "File", message: (e as Error).message }], locate: () => undefined }; }
}

/** Upload preview: parse + validate, nothing saved. */
export function previewArticleFile(name: string, buf: Buffer): ValidationResult {
  const p = parseArticleFile(name, buf);
  if (p.json === null) return { article: null, errors: p.errors, warnings: [], checks: [] };
  const v = validateArticle(p.json, p.locate);
  return { ...v, article: p.errors.length ? null : v.article, errors: [...p.errors, ...v.errors] };
}

/** Upload → import: parse, validate and store (stops at any sheet/row problem). */
export async function importArticleFile(repo: Repo, actor: Actor, name: string, buf: Buffer, opts: { publish: boolean; now?: Date }): Promise<ImportResult> {
  const p = parseArticleFile(name, buf);
  if (p.json === null || p.errors.length) {
    const v = p.json === null ? { article: null, errors: [], warnings: [], checks: [] } : validateArticle(p.json, p.locate);
    return { ...v, article: null, errors: [...p.errors, ...v.errors], ok: false, articleId: null, created: false, status: null };
  }
  return importArticleJson(repo, actor, p.json, { schoolId: actor.schoolId, publish: opts.publish, locate: p.locate, now: opts.now });
}

/** An empty article in the JSON format (the JSON alternative to the Excel template). */
export function templateJson(): ArticleJson {
  const q = (): QuestionJson => ({ stem: "", options: ["", "", "", ""], answer: "A", skill: "detail", why: "" });
  const band = (): BandJson => ({ keyWords: Array.from({ length: 5 }, () => ({ word: "", partOfSpeech: "", definition: "", example: "" })), questions: Array.from({ length: 8 }, q), prompt: "", checklist: [""] });
  return { code: "", title: "", topic: "", summary: "", poll: "", versions: RR_LEVELS.map((level) => ({ level, title: "", text: "" })), bands: { LOW: band(), MID: band(), HIGH: band() } };
}
