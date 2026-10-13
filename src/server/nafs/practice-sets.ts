/**
 * 🇸🇦 NAFS practice sets (data/nafs/practice/NP-*.json — one original Grade 6 passage + 10 MCQ, each tagged with its
 * Ministry standard, NAFS skill, PIRLS process and a DIFFICULTY 1 / 2 / 3 = Easy / Medium / Hard; see
 * data/nafs/practice/README.md) loaded into the NAFS center like the model booklets:
 *   - the passage is one shared ReadingPassage (externalRef NAFS-<code>), the same for every school;
 *   - each question is written once per school on the school's inactive "NAFS practice sets" holding skill, externalRef
 *     "<code>#<n>": loading again adds nothing (idempotent by code + n);
 *   - its NafsBankItem is platform content (own = false, booklet = the set's code NP-…, its number, the standard, the
 *     NAFS skill, the process and the difficulty the adaptive practice uses).
 * An invalid file is skipped as a whole and reported. Runs from Admin → Load new questions (pack "NAFS practice sets",
 * a file per chunk) and in the background when the NAFS icon opens and the bank lacks them (never blocks the page).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "../seeding/repo";
import { isDifficulty, isMoeCode, isNafsCode, domainOf, isProcess, type Difficulty, type NafsProcess } from "./framework";
import { PRACTICE_FAMILY } from "./bank";
import { loadBookletsInto, type Booklet, type BookletQuestion } from "./booklets";

const s = (v: unknown) => String(v ?? "");
export const PRACTICE_SETTING = "nafs.practiceSets";
export const PRACTICE_FILE = /^NP-[A-Za-z0-9-]{1,12}\.json$/;
const LETTER = ["A", "B", "C", "D"];

export interface PracticeRead { valid: Booklet[]; invalid: { file: string; problems: string[] }[]; files: string[] }

// ------------------------------------------------------------------ where the files are

let dirOverride: string | null = null;
let packDirHint: string | null = null;
/** Tests: point the loader at a folder of small fixture sets (null = the default). */
export function usePracticeDir(dir: string | null): void { dirOverride = dir; parsed = null; }
/** load-packs: when the packs read from another folder (tests), the sets are its "nafs-practice" sub-folder. */
export function practicePackDir(dir: string | null): void { packDirHint = dir; parsed = null; }
export const practiceDir = () => dirOverride ?? (packDirHint ? join(packDirHint, "nafs-practice") : join(process.cwd(), "data", "nafs", "practice"));

export function practiceFiles(dir = practiceDir()): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir).filter((f) => PRACTICE_FILE.test(f)).sort(); } catch { return []; }
}
export function practiceSignature(dir = practiceDir()): string | null {
  const files = practiceFiles(dir);
  if (!files.length) return null;
  return files.map((f) => { const st = statSync(join(dir, f)); return `${f}:${st.size}:${Math.round(st.mtimeMs)}`; }).join("|");
}

// ------------------------------------------------------------------ checking one file

/** Checks one practice set (the structure the loader needs); problems → the file is skipped. */
export function checkPracticeSet(raw: unknown, file: string): { set: Booklet | null; problems: string[] } {
  const p: string[] = [];
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const code = s(b.code).trim();
  if (!/^NP-[A-Za-z0-9-]{1,12}$/.test(code)) p.push("code must look like NP-001");
  else if (file && file.replace(/\.json$/, "") !== code) p.push(`code ${code} does not match the file name`);
  if (!s(b.title).trim()) p.push("missing title");
  const kind = s(b.kind);
  if (kind !== "INFORMATIONAL" && kind !== "LITERARY") p.push("kind must be INFORMATIONAL or LITERARY");
  const passage = s(b.passage).replace(/\r\n/g, "\n").trim();
  if (passage.length < 40) p.push("missing passage");
  if (passage.length > 8000) p.push("passage too long (8000 characters at most)");
  const qs = Array.isArray(b.questions) ? (b.questions as Record<string, unknown>[]) : [];
  if (!qs.length) p.push("no questions");
  if (qs.length > 30) p.push(`${qs.length} questions (at most 30)`);
  const seen = new Set<number>();
  const out: BookletQuestion[] = [];
  for (const [i, raw0] of qs.slice(0, 30).entries()) {
    const q = (raw0 && typeof raw0 === "object" ? raw0 : {}) as Record<string, unknown>;
    const n = Number(q.n);
    const at = `q${Number.isInteger(n) ? n : i + 1}`;
    if (!Number.isInteger(n) || n < 1 || n > 999) { p.push(`${at}: n must be a whole number`); continue; }
    if (seen.has(n)) { p.push(`${at}: number used twice`); continue; }
    seen.add(n);
    const standard = s(q.standard), nafs = s(q.nafs), pirls = s(q.pirls), dif = Number(q.difficulty);
    if (!isMoeCode(standard)) p.push(`${at}: standard must be MOE.S01 … MOE.S13`);
    if (!isNafsCode(nafs) || domainOf(nafs) === "PIRLS") p.push(`${at}: unknown NAFS skill`);
    if (!isProcess(pirls)) p.push(`${at}: pirls must be P1–P4`);
    if (!isDifficulty(dif)) p.push(`${at}: difficulty must be 1, 2 or 3`);
    const stem = s(q.stem).trim();
    if (stem.length < 5) p.push(`${at}: missing stem`);
    const options = Array.isArray(q.options) ? (q.options as unknown[]).map((x) => s(x).trim()) : [];
    if (options.length !== 4 || options.some((o) => !o) || new Set(options.map((o) => o.toLowerCase())).size !== 4) p.push(`${at}: needs 4 different options`);
    const answer = LETTER.indexOf(s(q.answer).trim().toUpperCase());
    if (answer < 0) p.push(`${at}: answer must be A–D`);
    out.push({ n, standard, nafs, pirls: pirls as NafsProcess, type: "MCQ", stem, options, answer, model: "", rubric: [], why: s(q.why).trim(), difficulty: isDifficulty(dif) ? (dif as Difficulty) : null });
  }
  if (p.length) return { set: null, problems: p };
  return { set: { file, code, title: s(b.title).trim().slice(0, 150), kind: kind as Booklet["kind"], genre: s(b.genre).trim().slice(0, 60), passage, questions: out.sort((a, z) => a.n - z.n) }, problems: [] };
}

let parsed: { sig: string; dir: string; read: PracticeRead } | null = null;
/** Every practice set of the folder, checked (kept in memory until a file changes). */
export function readPracticeSets(dir = practiceDir()): PracticeRead {
  const sig = practiceSignature(dir);
  if (!sig) return { valid: [], invalid: [], files: [] };
  if (parsed && parsed.sig === sig && parsed.dir === dir) return parsed.read;
  const files = practiceFiles(dir);
  const read: PracticeRead = { valid: [], invalid: [], files };
  const codes = new Set<string>();
  for (const f of files) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch (e) { read.invalid.push({ file: f, problems: [`invalid JSON: ${(e as Error).message.slice(0, 120)}`] }); continue; }
    const r = checkPracticeSet(raw, f);
    if (r.set && codes.has(r.set.code)) r.problems.push(`code ${r.set.code} used by another file`);
    if (r.problems.length || !r.set) { read.invalid.push({ file: f, problems: r.problems.slice(0, 20) }); continue; }
    codes.add(r.set.code);
    read.valid.push(r.set);
  }
  parsed = { sig, dir, read };
  return read;
}

// ------------------------------------------------------------------ loading into a school's NAFS center

export interface PracticeLoad { sets: number; added: number; skipped: number; invalid: { file: string; problems: string[] }[] }

/** Loads sets into one school's NAFS center (only the questions that are not there yet). */
export function loadPracticeSetsInto(repo: Repo, schoolId: string, list: Booklet[], byUserId: string | null, now = new Date()): Promise<{ added: number; skipped: number }> {
  return loadBookletsInto(repo, schoolId, list, byUserId, now, PRACTICE_FAMILY);
}

/** Loads every valid practice set of the folder (invalid files skipped and reported). */
export async function loadNafsPracticeSets(repo: Repo, schoolId: string, byUserId: string | null, now = new Date(), dir = practiceDir()): Promise<PracticeLoad> {
  const r = readPracticeSets(dir);
  const done = await loadPracticeSetsInto(repo, schoolId, r.valid, byUserId, now);
  const value = { sig: practiceSignature(dir), at: now.toISOString(), ...done, invalid: r.invalid };
  await repo.upsert("SchoolSetting", { schoolId, key: PRACTICE_SETTING }, { schoolId, key: PRACTICE_SETTING, value, updatedBy: byUserId }, { value, updatedBy: byUserId });
  return { sets: r.valid.length, ...done, invalid: r.invalid };
}

/** How many practice-set questions the folder has and how many are in the school's center already. */
export async function practiceCount(repo: Repo, schoolId: string, dir = practiceDir()): Promise<{ questions: number; inBank: number; files: number; invalid: number }> {
  const r = readPracticeSets(dir);
  const questions = r.valid.reduce((a, b) => a + b.questions.length, 0);
  const codes = r.valid.map((b) => b.code);
  let inBank = 0;
  for (let i = 0; i < codes.length; i += 400) inBank += await repo.count("NafsBankItem", { schoolId, booklet: { in: codes.slice(i, i + 400) } });
  return { questions, inBank, files: r.files.length, invalid: r.invalid.length };
}

const running = new Map<string, Promise<PracticeLoad | null>>();
/** When the NAFS icon opens and the school's center lacks practice-set questions: loads them IN THE BACKGROUND. */
export function ensureNafsPracticeSets(repo: Repo, schoolId: string, byUserId: string | null): Promise<PracticeLoad | null> {
  const busy = running.get(schoolId);
  if (busy) return busy;
  const p = (async () => {
    if (!practiceSignature()) return null;
    const c = await practiceCount(repo, schoolId);
    if (!c.questions || c.inBank >= c.questions) return null;
    return loadNafsPracticeSets(repo, schoolId, byUserId);
  })().catch((e) => { console.error("nafs practice sets", e); return null; }).finally(() => running.delete(schoolId));
  running.set(schoolId, p);
  return p;
}
