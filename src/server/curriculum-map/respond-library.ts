/**
 * ✍️ The school's Respond to Reading tasks, Grades 4–5 (data/curriculum-map/respond-to-reading-g4-g5.json, parsed from
 * the school's own “Grades 4 & 5 Respond to Reading — Differentiated Writing Tasks — Units 1–6” by
 * scripts/curriculum/parse-respond-docx.py). One entry per Text Set (keyed G4.U1.TS1) with the prompt and three
 * versions: BELOW (word bank + six gap sentences), ON (seven sentence starters), ABOVE (success checklist +
 * challenge sentence starter), and the teacher's model answer of each level. The text is the school's, unchanged.
 *
 *   respondLibrary          reads the file for one call (released afterwards: nothing keeps it in memory)
 *   validateRespondLibrary  the counts: up to 18 per grade, units 1–6, three levels and three model answers each
 *   ensureRespondLibrary    writes the missing activities of a school into RespondActivity (G4.U1.TS1.RTR.BELOW…)
 *                           — idempotent: rows already there (an admin's edits included) are never overwritten,
 *                           only an empty model answer is filled in
 *   autoLoadRespondLibrary  the lazy first load, the first time a Respond to Reading page or a lesson card needs it;
 *                           a school setting (RESPOND_LIBRARY_KEY) records it so it runs once per school
 */
import type { Repo } from "../seeding/repo";
import { withLock } from "../lib/key-lock";
import { RESPOND_LEVELS, type RespondLevel } from "./respond";

export const RESPOND_LIBRARY_KEY = "respond.library.g4g5";
const s = (v: unknown) => String(v ?? "");

export interface RespondLibraryLevel { title: string; instructions: string[]; wordBank: string[]; gapSentences: string[]; starters: string[]; checklist: string[]; challengeStarter: string | null }
export interface RespondLibraryTask {
  code: string; grade: number; unit: number; textSet: number; selection: string; genre: string; prompt: string; promptNote: string | null;
  levels: Record<RespondLevel, RespondLibraryLevel>; modelAnswers: Record<RespondLevel, string>;
}
export interface RespondLibraryFile { source: string; levels: Record<RespondLevel, string>; tasks: Record<string, RespondLibraryTask> }

/** The library file, read from disk for this call only (the bundled copy where the data folder is not shipped). */
export async function respondLibrary(): Promise<RespondLibraryFile> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = JSON.parse(await readFile(join(process.cwd(), "data", "curriculum-map", "respond-to-reading-g4-g5.json"), "utf8")) as RespondLibraryFile;
    if (raw && raw.tasks) return raw;
  } catch { /* not on disk here: the bundled copy */ }
  const mod = (await import("../../../data/curriculum-map/respond-to-reading-g4-g5.json")) as unknown as { default?: RespondLibraryFile } & RespondLibraryFile;
  return (mod.default ?? mod) as RespondLibraryFile;
}

/** Problems with the file's counts (empty = valid). */
export function validateRespondLibrary(file: RespondLibraryFile): string[] {
  const problems: string[] = [];
  const tasks = Object.entries(file.tasks ?? {});
  for (const g of [4, 5]) {
    const mine = tasks.filter(([, t]) => t.grade === g);
    if (mine.length < 1 || mine.length > 18) problems.push(`Grade ${g}: ${mine.length} selections (1–18 expected)`);
    const units = [...new Set(mine.map(([, t]) => t.unit))].sort((a, b) => a - b);
    if (units.join(",") !== "1,2,3,4,5,6") problems.push(`Grade ${g}: units ${units.join(", ")}`);
  }
  for (const [key, t] of tasks) {
    if (key !== `G${t.grade}.U${t.unit}.TS${t.textSet}` || t.code !== `${key}.RTR`) problems.push(`${key}: the key does not match grade/unit/text set`);
    if (!s(t.prompt).trim()) problems.push(`${key}: no prompt`);
    for (const l of RESPOND_LEVELS) {
      if (!t.levels?.[l]) problems.push(`${key}: no ${l} level`);
      if (!s(t.modelAnswers?.[l]).trim()) problems.push(`${key}: no ${l} model answer`);
    }
    if (t.levels?.BELOW && (!t.levels.BELOW.wordBank.length || t.levels.BELOW.gapSentences.length !== 6)) problems.push(`${key}: BELOW needs a word bank and six gap sentences`);
    if (t.levels?.ON && t.levels.ON.starters.length !== 7) problems.push(`${key}: ON needs seven sentence starters`);
    if (t.levels?.ABOVE && (!t.levels.ABOVE.checklist.length || !s(t.levels.ABOVE.challengeStarter).trim())) problems.push(`${key}: ABOVE needs a checklist and a challenge starter`);
  }
  return problems;
}

/**
 * One level of the library as a RespondActivity row (the existing columns): the gap sentences (BELOW), the starters
 * (ON) or the challenge starter (ABOVE) go in sentenceStarters; the student page tells them apart by the word bank
 * and the checklist. The title is the selection's name only (never a level name).
 */
export function activityRow(t: RespondLibraryTask, level: RespondLevel): { title: string; prompt: string; instructions: string[]; wordBank: string[]; sentenceStarters: string[]; checklist: string[]; hint: null; modelAnswer: string } {
  const L = t.levels[level];
  return {
    title: t.selection.slice(0, 255), prompt: t.prompt,
    instructions: [...(t.promptNote ? [t.promptNote] : []), ...L.instructions.filter((x) => x !== "Your response should include:")],
    wordBank: level === "BELOW" ? L.wordBank : [],
    sentenceStarters: level === "BELOW" ? L.gapSentences : level === "ON" ? L.starters : L.challengeStarter ? [L.challengeStarter] : [],
    checklist: level === "ABOVE" ? L.checklist : [],
    hint: null, modelAnswer: t.modelAnswers[level],
  };
}

export interface RespondLibraryResult { tasks: number; created: number; filled: number; skipped: number; grades: number[] }

/**
 * Writes the library into a school: for each Text Set of Grades 4–5 the school has, the missing level activities are
 * created; an existing activity is kept as it is (only an empty model answer is filled). Safe to run again.
 */
export async function ensureRespondLibrary(repo: Repo, schoolId: string, now = new Date()): Promise<RespondLibraryResult> {
  const grades = (await repo.findMany("Grade", { schoolId, level: { in: [4, 5] } }, { select: ["level"] })).map((g) => Number(g.level)).sort();
  const out: RespondLibraryResult = { tasks: 0, created: 0, filled: 0, skipped: 0, grades: [...new Set(grades)] };
  if (!out.grades.length) return out;
  const file = await respondLibrary();
  const tasks = Object.values(file.tasks).filter((t) => out.grades.includes(t.grade));
  out.tasks = tasks.length;
  const codes = tasks.flatMap((t) => RESPOND_LEVELS.map((l) => `${t.code}.${l}`));
  const have = new Map((await repo.findMany("RespondActivity", { schoolId, code: { in: codes } }, { select: ["code", "modelAnswer"] })).map((r) => [s(r.code), r]));
  const fresh: Record<string, unknown>[] = [];
  for (const t of tasks) for (const l of RESPOND_LEVELS) {
    const code = `${t.code}.${l}`, row = activityRow(t, l), cur = have.get(code);
    if (!cur) { fresh.push({ schoolId, code, ...row, updatedById: null, createdAt: now, updatedAt: now }); out.created++; continue; }
    if (!s(cur.modelAnswer).trim()) { await repo.updateMany("RespondActivity", { schoolId, code }, { modelAnswer: row.modelAnswer, updatedAt: now }); out.filled++; }
    else out.skipped++;
  }
  for (let i = 0; i < fresh.length; i += 50) await repo.createMany("RespondActivity", fresh.slice(i, i + 50));
  return out;
}

async function readState(repo: Repo, schoolId: string): Promise<{ status: string; grades: number[] } | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: RESPOND_LIBRARY_KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  return o ? { status: s(o.status), grades: Array.isArray(o.grades) ? o.grades.map(Number) : [] } : null;
}

/** Runs the load and records it (DONE with the counts) in the school setting. */
export async function runRespondLibraryLoad(repo: Repo, schoolId: string, by: string | null = null, now = new Date()): Promise<RespondLibraryResult> {
  const result = await ensureRespondLibrary(repo, schoolId, now);
  const value = { status: "DONE", at: now.toISOString(), grades: result.grades, result };
  await repo.upsert("SchoolSetting", { schoolId, key: RESPOND_LIBRARY_KEY }, { schoolId, key: RESPOND_LIBRARY_KEY, value, updatedBy: by, updatedAt: now }, { value, updatedBy: by, updatedAt: now });
  return result;
}

/** Schools already checked by this process (no query on every page after the first). */
const loadedHere = new Map<object, Set<string>>();

/**
 * The lazy first load: the first time a school needs Respond to Reading, the library is written (a few small
 * statements, so the page waits for it). Runs again only when the school gained Grade 4 or 5 since.
 */
export async function autoLoadRespondLibrary(repo: Repo, schoolId: string | null | undefined): Promise<void> {
  if (!schoolId) return;
  let mine = loadedHere.get(repo as object);
  if (!mine) { mine = new Set(); loadedHere.set(repo as object, mine); }
  if (mine.has(schoolId)) return;
  await withLock(`respond-library:${schoolId}`, async () => {
    if (mine!.has(schoolId)) return;
    const state = await readState(repo, schoolId);
    const grades = (await repo.findMany("Grade", { schoolId, level: { in: [4, 5] } }, { select: ["level"] })).map((g) => Number(g.level));
    if (!(state?.status === "DONE" && grades.every((g) => state.grades.includes(g)))) await runRespondLibraryLoad(repo, schoolId);
    mine!.add(schoolId);
  });
}

/** Tests: forget what this process loaded. */
export function resetRespondLibraryMemo(): void { loadedHere.clear(); }
