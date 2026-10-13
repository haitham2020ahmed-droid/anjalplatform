/**
 * 🇸🇦 NAFS model booklets (data/nafs/booklets/NB-*.json, one original English text + its questions grouped under the
 * Ministry's 13 standards, see data/nafs/booklets/README.md) loaded into the NAFS bank as PLATFORM content:
 *   - the passage is one shared ReadingPassage (externalRef NAFS-<code>, published) — the same for every school;
 *   - each question is written once per school on the school's inactive "NAFS model booklets" holding skill (Grade 6;
 *     never practised), externalRef "<code>#<n>": loading again adds nothing (idempotent by code + n);
 *   - its NafsBankItem is platform (own = false) with the booklet code / number, the Ministry standard, the NAFS skill and
 *     the PIRLS process; editing one makes a school copy like any platform question; hiding never deletes.
 * An invalid file is skipped as a whole and reported (file + problems). Runs from Admin → Load new questions (pack
 * "NAFS model booklets", a file per chunk) and in the background the first time the NAFS section opens when the bank
 * lacks them (ensureNafsBooklets — never blocks the page).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { analyzeText } from "../../reading/prl";
import { domainOf, isDifficulty, isMoeCode, isNafsCode, isProcess, type Difficulty, type NafsProcess } from "./framework";
import { BOOKLET_FAMILY, cleanInput, holdingSkill, nafsBankChanged, writeQuestion } from "./bank";

const s = (v: unknown) => String(v ?? "");
export const BOOKLET_SETTING = "nafs.booklets";
export const BOOKLET_FILE = /^NB-[A-Za-z0-9-]{1,12}\.json$/;
const MAX_QUESTIONS = 60;

export interface BookletQuestion { n: number; standard: string; nafs: string; pirls: NafsProcess; type: "MCQ" | "WRITTEN"; stem: string; options: string[]; answer: number; model: string; rubric: string[]; why: string;
  /** the question's own difficulty (1 Easy · 2 Medium · 3 Hard) when the file gives one */
  difficulty: Difficulty | null }
export interface Booklet { file: string; code: string; title: string; kind: "INFORMATIONAL" | "LITERARY"; genre: string; passage: string; questions: BookletQuestion[] }
export interface BookletRead { valid: Booklet[]; invalid: { file: string; problems: string[] }[]; files: string[] }

// ------------------------------------------------------------------ where the files are

let dirOverride: string | null = null;
let packDirHint: string | null = null;
/** Tests: point the loader at a folder of small fixture booklets (null = the default). */
export function useBookletDir(dir: string | null): void { dirOverride = dir; parsed = null; }
/** load-packs: when the packs read from another folder (tests), the booklets are its "nafs-booklets" sub-folder. */
export function bookletPackDir(dir: string | null): void { packDirHint = dir; parsed = null; }
export const bookletDir = () => dirOverride ?? (packDirHint ? join(packDirHint, "nafs-booklets") : join(process.cwd(), "data", "nafs", "booklets"));

export function bookletFiles(dir = bookletDir()): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir).filter((f) => BOOKLET_FILE.test(f)).sort(); } catch { return []; }
}
/** The folder's signature (every booklet's name, size and time); null when there is none. */
export function bookletSignature(dir = bookletDir()): string | null {
  const files = bookletFiles(dir);
  if (!files.length) return null;
  return files.map((f) => { const st = statSync(join(dir, f)); return `${f}:${st.size}:${Math.round(st.mtimeMs)}`; }).join("|");
}

// ------------------------------------------------------------------ reading + checking one file

const LETTER = ["A", "B", "C", "D"];
/** Checks one booklet (the structure the loader needs); problems → the file is skipped. */
export function checkBooklet(raw: unknown, file: string): { booklet: Booklet | null; problems: string[] } {
  const p: string[] = [];
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const code = s(b.code).trim();
  if (!/^NB-[A-Za-z0-9-]{1,12}$/.test(code)) p.push("code must look like NB-001");
  else if (file && file.replace(/\.json$/, "") !== code) p.push(`code ${code} does not match the file name`);
  if (!s(b.title).trim()) p.push("missing title");
  const kind = s(b.kind);
  if (kind !== "INFORMATIONAL" && kind !== "LITERARY") p.push("kind must be INFORMATIONAL or LITERARY");
  const passage = s(b.passage).replace(/\r\n/g, "\n").trim();
  if (passage.length < 40) p.push("missing passage");
  if (passage.length > 8000) p.push("passage too long (8000 characters at most)");
  const qs = Array.isArray(b.questions) ? (b.questions as Record<string, unknown>[]) : [];
  if (!qs.length) p.push("no questions");
  if (qs.length > MAX_QUESTIONS) p.push(`${qs.length} questions (at most ${MAX_QUESTIONS})`);
  const seen = new Set<number>();
  const out: BookletQuestion[] = [];
  for (const [i, raw0] of qs.slice(0, MAX_QUESTIONS).entries()) {
    const q = (raw0 && typeof raw0 === "object" ? raw0 : {}) as Record<string, unknown>;
    const n = Number(q.n);
    const at = `q${Number.isInteger(n) ? n : i + 1}`;
    if (!Number.isInteger(n) || n < 1 || n > 999) { p.push(`${at}: n must be a whole number`); continue; }
    if (seen.has(n)) { p.push(`${at}: number used twice`); continue; }
    seen.add(n);
    const standard = s(q.standard), nafs = s(q.nafs), pirls = s(q.pirls), type = s(q.type);
    if (!isMoeCode(standard)) p.push(`${at}: standard must be MOE.S01 … MOE.S13`);
    if (!isNafsCode(nafs) || domainOf(nafs) === "PIRLS") p.push(`${at}: unknown NAFS skill`);
    if (!isProcess(pirls)) p.push(`${at}: pirls must be P1–P4`);
    const stem = s(q.stem).trim();
    if (stem.length < 5) p.push(`${at}: missing stem`);
    let options: string[] = [], answer = -1, model = "", rubric: string[] = [];
    if (type === "MCQ") {
      options = Array.isArray(q.options) ? (q.options as unknown[]).map((x) => s(x).trim()) : [];
      if (options.length !== 4 || options.some((o) => !o) || new Set(options.map((o) => o.toLowerCase())).size !== 4) p.push(`${at}: needs 4 different options`);
      answer = LETTER.indexOf(s(q.answer).trim().toUpperCase());
      if (answer < 0) p.push(`${at}: answer must be A–D`);
    } else if (type === "WRITTEN") {
      model = s(q.model).trim();
      rubric = Array.isArray(q.rubric) ? (q.rubric as unknown[]).map((x) => s(x).trim()).filter(Boolean) : [];
      if (!model) p.push(`${at}: WRITTEN needs a model answer`);
      if (rubric.length !== 3) p.push(`${at}: WRITTEN needs a 3-line rubric (2 / 1 / 0)`);
    } else p.push(`${at}: type must be MCQ or WRITTEN`);
    const dif = q.difficulty === undefined || q.difficulty === null ? null : Number(q.difficulty);
    if (dif !== null && !isDifficulty(dif)) p.push(`${at}: difficulty must be 1, 2 or 3`);
    out.push({ n, standard, nafs, pirls: pirls as NafsProcess, type: type === "WRITTEN" ? "WRITTEN" : "MCQ", stem, options, answer, model, rubric, why: s(q.why).trim(), difficulty: dif as Difficulty | null });
  }
  if (p.length) return { booklet: null, problems: p };
  return { booklet: { file, code, title: s(b.title).trim().slice(0, 150), kind: kind as Booklet["kind"], genre: s(b.genre).trim().slice(0, 60), passage, questions: out.sort((a, z) => a.n - z.n) }, problems: [] };
}

let parsed: { sig: string; dir: string; read: BookletRead } | null = null;
/** Every booklet of the folder, checked (kept in memory until a file changes). */
export function readBooklets(dir = bookletDir()): BookletRead {
  const sig = bookletSignature(dir);
  if (!sig) return { valid: [], invalid: [], files: [] };
  if (parsed && parsed.sig === sig && parsed.dir === dir) return parsed.read;
  const files = bookletFiles(dir);
  const read: BookletRead = { valid: [], invalid: [], files };
  const codes = new Set<string>();
  for (const f of files) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch (e) { read.invalid.push({ file: f, problems: [`invalid JSON: ${(e as Error).message.slice(0, 120)}`] }); continue; }
    const r = checkBooklet(raw, f);
    if (r.booklet && codes.has(r.booklet.code)) r.problems.push(`code ${r.booklet.code} used by another file`);
    if (r.problems.length || !r.booklet) { read.invalid.push({ file: f, problems: r.problems.slice(0, 20) }); continue; }
    codes.add(r.booklet.code);
    read.valid.push(r.booklet);
  }
  parsed = { sig, dir, read };
  return read;
}

// ------------------------------------------------------------------ loading into a school's NAFS bank

export async function bookletPassage(repo: Repo, b: Booklet, now: Date): Promise<string> {
  const ref = `NAFS-${b.code}`;
  const have = await repo.findUnique("ReadingPassage", { externalRef: ref });
  if (have) return s(have.id);
  const st = analyzeText(b.passage);
  const p = await repo.create("ReadingPassage", {
    externalRef: ref, title: b.title, body: b.passage, genre: b.kind === "LITERARY" ? "Literary" : "Informational", gradeLevel: 6, gradeBand: "6",
    wordCount: st.wordCount, sentenceCount: st.sentenceCount, avgSentenceLength: st.avgSentenceLength, avgWordLength: st.avgWordLength,
    status: "PUBLISHED", origin: "IMPORTED", createdById: null, createdAt: now, updatedAt: now,
  });
  return s(p.id);
}

export interface BookletLoad { booklets: number; added: number; skipped: number; invalid: { file: string; problems: string[] }[] }

/**
 * Loads booklets (or practice sets: the same shape, their own holding family) into one school's NAFS bank — only the
 * questions that are not there yet.
 */
export async function loadBookletsInto(repo: Repo, schoolId: string, list: Booklet[], byUserId: string | null, now = new Date(), family: string = BOOKLET_FAMILY): Promise<{ added: number; skipped: number }> {
  if (!list.length) return { added: 0, skipped: 0 };
  const skillId = await holdingSkill(repo, schoolId, family);
  const actor = { userId: byUserId ?? "", role: "SCHOOL_ADMIN", schoolId } as unknown as Actor;
  let added = 0, skipped = 0;
  for (const b of list) {
    const passageId = await bookletPassage(repo, b, now);
    const refs = b.questions.map((q) => `${b.code}#${q.n}`);
    const have = new Map((await repo.findMany("Question", { skillId, externalRef: { in: refs } }, { select: ["id", "externalRef"] })).map((q) => [s(q.externalRef), s(q.id)]));
    const items = have.size ? new Set((await repo.findMany("NafsBankItem", { schoolId, questionId: { in: [...have.values()] } }, { select: ["questionId"] })).map((x) => s(x.questionId))) : new Set<string>();
    for (const q of b.questions) {
      const ref = `${b.code}#${q.n}`;
      let id = have.get(ref);
      if (id && items.has(id)) { skipped++; continue; }
      if (!id) {
        const c = cleanInput({ nafsCode: q.nafs, process: q.pirls, standard: q.standard, kind: q.type, stem: q.stem, options: q.options, correct: q.answer, explanation: q.why, model: q.model, rubric: q.rubric, difficulty: q.difficulty });
        id = await writeQuestion(repo, actor, schoolId, c, { status: "PUBLISHED", origin: "IMPORTED", skillId, externalRef: ref, passageId }, now);
        added++;
      } else skipped++;
      await repo.create("NafsBankItem", { schoolId, questionId: id, nafsCode: q.nafs, process: q.pirls, standard: q.standard, difficulty: q.difficulty, own: false, booklet: b.code, bookletN: q.n, hidden: false, draft: false, createdById: byUserId, createdAt: now, updatedAt: now });
    }
  }
  nafsBankChanged(repo, schoolId);
  return { added, skipped };
}

/** Loads every valid booklet of the folder (invalid files skipped and reported). */
export async function loadNafsBooklets(repo: Repo, schoolId: string, byUserId: string | null, now = new Date(), dir = bookletDir()): Promise<BookletLoad> {
  const r = readBooklets(dir);
  const done = await loadBookletsInto(repo, schoolId, r.valid, byUserId, now);
  await repo.upsert("SchoolSetting", { schoolId, key: BOOKLET_SETTING }, { schoolId, key: BOOKLET_SETTING, value: { sig: bookletSignature(dir), at: now.toISOString(), ...done, invalid: r.invalid }, updatedBy: byUserId }, { value: { sig: bookletSignature(dir), at: now.toISOString(), ...done, invalid: r.invalid }, updatedBy: byUserId });
  return { booklets: r.valid.length, ...done, invalid: r.invalid };
}

/** How many booklet questions the folder has and how many are in the school's bank already. */
export async function bookletCount(repo: Repo, schoolId: string, dir = bookletDir()): Promise<{ questions: number; inBank: number; files: number; invalid: number }> {
  const r = readBooklets(dir);
  const questions = r.valid.reduce((a, b) => a + b.questions.length, 0);
  const inBank = r.valid.length ? await repo.count("NafsBankItem", { schoolId, booklet: { in: r.valid.map((b) => b.code) } }) : 0;
  return { questions, inBank, files: r.files.length, invalid: r.invalid.length };
}

const running = new Map<string, Promise<BookletLoad | null>>();
/**
 * The first time the NAFS section opens (and after new booklet files arrive): when the school's bank lacks booklet
 * questions, loads them IN THE BACKGROUND — the caller does not wait (one run per school at a time; errors are logged).
 */
export function ensureNafsBooklets(repo: Repo, schoolId: string, byUserId: string | null): Promise<BookletLoad | null> {
  const busy = running.get(schoolId);
  if (busy) return busy;
  const p = (async () => {
    if (!bookletSignature()) return null;
    const c = await bookletCount(repo, schoolId);
    if (!c.questions || c.inBank >= c.questions) return null;
    return loadNafsBooklets(repo, schoolId, byUserId);
  })().catch((e) => { console.error("nafs booklets", e); return null; }).finally(() => running.delete(schoolId));
  running.set(schoolId, p);
  return p;
}
