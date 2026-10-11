/**
 * Pure helpers of the skill question picker (no React, no server code): safe to import from client components,
 * server actions and tests.
 */

export type PickerLevel = "BELOW" | "ON" | "ABOVE";
export type LevelFilter = "ALL" | PickerLevel;

/** One question as the picker shows it to the TEACHER (the answer is never sent to students). */
export interface PickerQuestion { id: string; stem: string; choices: string[] | null; answer: string | null; level: PickerLevel | string; type: string; passageTitle?: string | null }

/** What the picker hands to its form: the platform chooses (recommended), or the teacher's chosen questions. */
export type PickerValue = { auto: true } | { auto: false; questionIds: string[] };

export const AUTO: PickerValue = { auto: true };
/** At most this many chosen questions per skill (the size of a question set). */
export const MAX_PICKED = 50;

/** The picker's output from the current choice. An empty manual choice is still manual (the form blocks it). */
export function pickerOutput(auto: boolean, selected: Iterable<string>): PickerValue {
  if (auto) return { auto: true };
  return { auto: false, questionIds: [...new Set([...selected].map(String).filter(Boolean))].slice(0, MAX_PICKED) };
}

/** The hidden form field `questionIds`: "" for the platform's choice, a JSON array for the teacher's own choice. */
export const questionIdsField = (v: PickerValue): string => (v.auto ? "" : JSON.stringify(v.questionIds));

/**
 * Reads the `questionIds` form field back on the server: null = the platform chooses; otherwise the chosen ids
 * (deduplicated, capped; ids are letters, digits, _ and -). Accepts a JSON array or a comma list; anything else
 * counts as "the platform chooses".
 */
export function parseQuestionIdsField(v: unknown): string[] | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  let list: unknown = null;
  if (raw.startsWith("[")) { try { list = JSON.parse(raw); } catch { return null; } }
  else list = raw.split(",");
  if (!Array.isArray(list)) return null;
  const ids = [...new Set(list.map((x) => String(x ?? "").trim()).filter((x) => /^[\w-]{1,191}$/.test(x)))].slice(0, MAX_PICKED);
  return ids.length ? ids : null;
}

/**
 * The server's picker result ({ skill, total, questions: [{ id, stem, choices: [{ label, text }], correctAnswer, level,
 * type, passageTitle }] }) → the rows the picker shows. A plain array of PickerQuestion is kept as it is; anything
 * else (e.g. { error }) is an empty list.
 */
export function toPickerQuestions(r: unknown): PickerQuestion[] {
  const list: unknown[] = Array.isArray(r) ? r : r && typeof r === "object" && Array.isArray((r as { questions?: unknown }).questions) ? (r as { questions: unknown[] }).questions : [];
  return list.filter((q): q is Record<string, unknown> => !!q && typeof q === "object" && typeof (q as { id?: unknown }).id === "string").map((q) => {
    const raw = Array.isArray(q.choices) ? (q.choices as unknown[]) : null;
    const choices = raw ? raw.map((c) => (c && typeof c === "object" ? String((c as { text?: unknown }).text ?? "") : String(c ?? ""))) : null;
    const answer = q.answer !== undefined && q.answer !== null ? String(q.answer) : q.correctAnswer !== undefined && q.correctAnswer !== null ? String(q.correctAnswer) : null;
    return { id: String(q.id), stem: String(q.stem ?? ""), choices: choices && choices.length ? choices : null, answer: answer || null, level: String(q.level ?? "ON"), type: String(q.type ?? ""), passageTitle: q.passageTitle ? String(q.passageTitle) : null };
  });
}

// ------------------------------------------------------------------ skill names only (one row per skill)

/** “Main Idea & Details ” / “main idea and details” → the same key. */
export function normalizeSkillName(name: string): string {
  return String(name ?? "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * One row per skill name (+ kind, e.g. READING / GRAMMAR): the same skill of several grades is shown once.
 * The kept row is the one `better` prefers (default: the first); the order of first appearance is kept.
 */
export function dedupeSkillsByName<T extends { name: string }>(rows: readonly T[], kindOf: (r: T) => string = () => "", better?: (a: T, b: T) => boolean): T[] {
  const at = new Map<string, number>();
  const out: T[] = [];
  for (const r of rows) {
    const key = `${normalizeSkillName(r.name)}|${String(kindOf(r) ?? "").toUpperCase()}`;
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push(r); }
    else if (better && better(r, out[i])) out[i] = r;
  }
  return out;
}

// ------------------------------------------------------------------ program (where the work comes from)

export type Program = "MAP" | "RTI" | "CURRICULUM" | "NAFS";
export const PROGRAMS: readonly Program[] = ["CURRICULUM", "MAP", "RTI", "NAFS"];
export const PROGRAM_LABEL: Record<Program, string> = { CURRICULUM: "Curriculum", MAP: "MAP", RTI: "RTI", NAFS: "NAFS" };

export const isProgram = (v: unknown): v is Program => (PROGRAMS as readonly unknown[]).includes(v);
/** A form value → a program (unknown values are Curriculum). */
export const programOf = (v: unknown): Program => { const k = String(v ?? "").trim().toUpperCase(); return isProgram(k) ? k : "CURRICULUM"; };

/**
 * The program chosen when the dialog opens: the page's own program when it is one (a MAP page → MAP), otherwise
 * Curriculum. Grammar skills (track GRAMMAR) start on Curriculum.
 */
export function defaultProgram(track?: string | null): Program {
  const k = String(track ?? "").trim().toUpperCase();
  return isProgram(k) ? k : "CURRICULUM";
}

// ------------------------------------------------------------------ filtering the list

export const LEVEL_FILTERS: readonly LevelFilter[] = ["ALL", "BELOW", "ON", "ABOVE"];

/** The questions shown for a level filter and a search (stem, choices and passage title; case-insensitive). */
export function filterQuestions<Q extends PickerQuestion>(list: readonly Q[], level: LevelFilter, search: string): Q[] {
  const w = search.trim().toLowerCase();
  return list.filter((q) => (level === "ALL" || q.level === level) && (!w || [q.stem, q.passageTitle ?? "", ...(q.choices ?? [])].some((x) => x.toLowerCase().includes(w))));
}

/**
 * Is this answer choice the correct one? `answer` is the bank's answer text: “B. a dog” (or several, “A. x; C. y”),
 * or the bare choice text.
 */
export function isCorrectChoice(choice: string, answer: string | null | undefined): boolean {
  if (!answer) return false;
  const c = choice.trim().toLowerCase();
  return answer.split(/;\s*/).some((part) => { const p = part.trim().toLowerCase(); return p === c || p.replace(/^[a-z0-9]{1,2}[.)]\s+/, "") === c; });
}

/** The first questions the student would see: the chosen ones in order, or (platform's choice) On Level first. */
export function previewQuestions<Q extends PickerQuestion>(list: readonly Q[], value: PickerValue, n = 3): Q[] {
  if (!value.auto) {
    const byId = new Map(list.map((q) => [q.id, q]));
    return value.questionIds.map((id) => byId.get(id)).filter((q): q is Q => Boolean(q)).slice(0, n);
  }
  const rank = (q: Q) => (q.level === "ON" ? 0 : q.level === "BELOW" ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b)).slice(0, n);
}
