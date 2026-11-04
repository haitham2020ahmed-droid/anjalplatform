/**
 * 🎙 Fluency Coach: a student reads a passage aloud, records it, and gets their words correct per minute (WCPM), the
 * words they mispronounced or skipped (with the right pronunciation to listen to), an expression score and a plan.
 *
 * Two ways to read:
 *   MINUTE  — the 1-minute check: the recording stops by itself after 60 seconds. Official: its WCPM sets the
 *             student's fluency level on the school's rubric (Hasbrouck & Tindal 2017) and goes to Reading Fluency,
 *             the Diagnostic analysis, the support groups and the Family Report. r4: official only when the reading
 *             lasted ≥ 55 s (measured from the WAV itself, never only the browser's word) or the whole passage was
 *             read; an early Stop is saved as practice. Offered only on passages of MINUTE_MIN_WORDS+ words.
 *   PASSAGE — the whole passage (up to 4 minutes): practice, with feedback on every word; it does not change the
 *             official level (its time is not the standard minute).
 * Practice kinds (FluencyPractice.practiceKind), all built on the same scorer:
 *   ECHO     — the browser's voice reads one sentence, the student says it back; phrasing and intonation compared.
 *   PHRASED  — the passage with phrase marks (/ short, // long pause); the marks fade over trials (phrasing.ts).
 *   REPEATED — the same passage up to 5 times with a stretch goal each trial (not for students already Above).
 *   DRILL    — a 60-second word grid of the student's own patterns (drill.ts); a row with 2+ misses → reteach.
 * Scoring follows running-record practice: the 3-second rule (a word the reader is stuck on for more than 3 seconds
 * counts as an error; a self-correction within 3 seconds is correct), four prosody traits 1–4 (phrasing, smoothness,
 * pace, intonation) plus the NAEP 1–4 scale. An accent never counts — only wrong, changed or skipped words.
 * Norms: Hasbrouck & Tindal 2017, by season (norms.ts); every official check stores its season and percentile, and two
 * 1-minute checks on the same day are averaged (both kept).
 *
 * Practice re-reads ("Read it again for practice", after listening to the passage): scored the same way and compared with
 * the first read, but NEVER stored — no FluencyPractice row, no FluencyCheck — so only the first read counts toward the
 * level, the reports and the norms.
 *
 * After every reading (feedback.ts): each word marked (also self-corrections, repetitions and extra words — shown,
 * never counted), the counts, the NAEP level, the 3 words to practise, 2–3 next steps and the growth since the last
 * reading of the same text. Every passage reading also reviews the student's remedial plan (remedial.ts: goal from the
 * norms and the baseline, daily routine with minutes, weekly cold read, automatic raise / Plan B / easier text).
 * "Heard nothing" while the device measured a voice: every backup model listens, the listener is told a voice is
 * there, and the page sends the same recording once more (another model first) — never "we could not hear you".
 *
 * Privacy: the audio is scored in memory and dropped — it is never stored. Only the passage text and the audio go to
 * the AI provider (Gemini); never the student's name or any record. The admin can switch the coach off.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { consumeRateLimit } from "../auth/rate-limit";
import { aiSettings, extractJson, rateState, type EnvLike } from "../ai/engine";
import { chooseAiProvider } from "../ai/question-generator";
import { fluencyBands, fluencyLevel, fluencyRubricText } from "../diagnostic/standards";
import { audit } from "../audit";
import { bandEdges, fluencySeason, normView, weeklyGoal, wcpmPercentile, isSeason, type NormView, type Season } from "./norms";
import { chunkPassage, marksForTrial, sentences, type PhraseMark } from "./phrasing";
import { buildDrill, gridWords, scoreDrill, validateGrid, DRILL_SECONDS, type DrillGrid, type DrillResult } from "./drill";
import { patternForError } from "./drill-words";
import { arabicTags, tipsFor, type ArabicTip } from "./arabic";
import { feedbackSummary, type FeedbackSummary, type MarkedWord, type WordNote } from "./feedback";
import { asRemedialPlan, nextRemedialPlan, reviewPlan, type PlanEvidence, type ReadingEvidence, type RemedialPlan } from "./remedial";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };

export type CoachMode = "MINUTE" | "PASSAGE";
export type PracticeKind = "MINUTE" | "PASSAGE" | "ECHO" | "PHRASED" | "DRILL" | "REPEATED";
export const PRACTICE_KINDS: PracticeKind[] = ["MINUTE", "PASSAGE", "ECHO", "PHRASED", "DRILL", "REPEATED"];
export type Level = "BELOW" | "ON" | "ABOVE";
export const REPEATED_MAX_TRIALS = 5;
export const ECHO_PER_DAY = 60;
export const ECHO_MAX_SECONDS = 30;
export const MINUTE_SECONDS = 60;
export const PASSAGE_MAX_SECONDS = 240;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const COACH_PER_DAY = 12;
const MINUTE_WORDS = 260, PASSAGE_WORDS = 400;
// 🐛 r91 fix ("قارئ سريع بيخلّص النص بدري فيقعد صامت لحد ما الدقيقة تخلص فتطلع سرعته أقل مما هي فعلاً"): the MINUTE
// check always records the full 60 seconds (coach-reader.tsx auto-stops at :60, no early-stop), so a passage
// shorter than the fastest realistic reader's 1-minute output understates their WCPM. 225 ≈ the highest published
// Hasbrouck & Tindal 90th-percentile rate (Grade 6, spring: 204 WCPM) plus a safety margin.
// r4: exported so the student page / coachSession / coachHome offer the 1-minute check only on passages this long.
export const MINUTE_MIN_WORDS = 225;
/**
 * r4: a 1-minute check counts as OFFICIAL (a FluencyCheck) only when the reading lasted at least this long or the
 * student read the whole passage; a check stopped early is saved as practice ("Read for the whole minute…").
 */
export const OFFICIAL_MIN_SECONDS = 55;
export const SHORT_MINUTE_NOTICE = "Read for the whole minute so your score counts.";
export const MINUTE_TOO_SHORT = "This passage is too short for a full 1-minute check — it could run out before the minute is up. Choose a longer passage.";
/** r4: no reader is faster than this: a duration the server cannot measure (not a WAV) is stretched to fit it */
export const MAX_PLAUSIBLE_WCPM = 300;
const KEY = "fluency.coach";

// ------------------------------------------------------------------ settings (the admin's switch)

export async function coachSettings(repo: Repo, schoolId: string | null): Promise<{ enabled: boolean }> {
  if (!schoolId) return { enabled: false };
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  const v = json<{ enabled?: boolean } | null>(row?.value, null);
  return { enabled: v?.enabled !== false };
}
export async function setCoachSettings(repo: Repo, actor: Actor, enabled: boolean, now = new Date()): Promise<void> {
  assertCan(actor, "settings:engine");
  const value = { enabled: Boolean(enabled) };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY }, { value, updatedBy: actor.userId, updatedAt: now }, { value, updatedBy: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "fluency.coach.settings", entityType: "School", entityId: s(actor.schoolId), after: value, at: now });
}

// ------------------------------------------------------------------ passages

export interface CoachPassage { key: string; title: string; words: number; lexile: number | null; level: Level | null; grade: number; source: "READMASTER" | "BANK" }
export async function studentGrade(repo: Repo, actor: Actor): Promise<number> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const st = await repo.findUnique("Student", { id: actor.studentId });
  return Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 5);
}

/** Passages of the student's grade (one below to one above): ReadMaster versions, then the bank's reading passages. */
export async function passagesFor(repo: Repo, schoolId: string, grade: number): Promise<(CoachPassage & { body: string })[]> {
  const out: (CoachPassage & { body: string })[] = [];
  const allArts = await repo.findMany("ReadMasterArticle", { schoolId, status: "PUBLISHED" }, { select: ["id", "title", "gradeLevel"] });
  const allBank = (await repo.findMany("ReadingPassage", {}, { select: ["id", "title", "body", "wordCount", "gradeLevel", "genre"] })).filter((p) => p.gradeLevel !== null && Number(p.wordCount) >= 60 && !/poem|poetry|drama|play/i.test(s(p.genre)));
  // a grade with no passages of its own (e.g. Grade 11): the nearest grades that have some, so the coach always opens
  const dists = [...allArts.map((a) => Math.abs(Number(a.gradeLevel) - grade)), ...allBank.map((p) => Math.abs(Number(p.gradeLevel) - grade))];
  const minDist = dists.length ? Math.min(...dists) : 0;
  const tol = minDist <= 1 ? 1 : minDist + 1;
  const arts = allArts.filter((a) => Math.abs(Number(a.gradeLevel) - grade) <= tol);
  const vers = arts.length ? await repo.findMany("ReadMasterVersion", { articleId: { in: arts.map((a) => a.id) } }, { select: ["id", "articleId", "level", "lexile", "body", "wordCount"] }) : [];
  const ORDER: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
  for (const v of vers.sort((a, b) => s(a.articleId).localeCompare(s(b.articleId)) || (ORDER[s(a.level)] ?? 1) - (ORDER[s(b.level)] ?? 1))) {
    const a = arts.find((x) => x.id === v.articleId)!;
    const body = s(v.body); const words = textWords(body).length;
    if (words < 40) continue;
    out.push({ key: `RM:${s(v.id)}`, title: `${s(a.title)} · ${s(v.level).charAt(0)}${s(v.level).slice(1).toLowerCase()}`, words, lexile: Number(v.lexile) || null, level: (s(v.level) as Level) || null, grade: Number(a.gradeLevel), source: "READMASTER", body });
  }
  const bank = allBank.filter((p) => Math.abs(Number(p.gradeLevel) - grade) <= tol);
  // a ReadMaster version also lives in the bank as a passage: list it once
  const head = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
  const rmHeads = new Set(out.map((x) => head(x.body)));
  for (const p of bank.filter((x) => !rmHeads.has(head(s(x.body)))).slice(0, 60)) out.push({ key: `RP:${s(p.id)}`, title: s(p.title), words: Number(p.wordCount), lexile: null, level: Number(p.gradeLevel) < grade ? "BELOW" : Number(p.gradeLevel) > grade ? "ABOVE" : "ON", grade: Number(p.gradeLevel), source: "BANK", body: s(p.body) });
  return out;
}

/** The words of a passage as read aloud: whole sentences up to the mode's limit (markup and extra spaces removed). */
/**
 * The words of a text: markup removed; a token with no letter or digit ("—", "–", "&", "…", a lone quote) is not a
 * word (it is never read aloud, so it must not count toward the words read or the 225-word minimum).
 */
export function textWords(body: string): string[] {
  const text = s(body).replace(/<[^>]+>/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  return text.split(" ").filter((w) => w && /[\p{L}\p{N}]/u.test(w));
}
export function passageWords(body: string, mode: CoachMode): string[] {
  const words = textWords(body);
  const max = mode === "MINUTE" ? MINUTE_WORDS : PASSAGE_WORDS;
  if (words.length <= max) return words;
  // stop at the end of a sentence near the limit
  let end = max;
  for (let i = max; i > max * 0.7; i--) if (/[.!?]["”’)]?$/.test(words[i - 1])) { end = i; break; }
  return words.slice(0, end);
}
const clean = (w: string) => w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "");

// ------------------------------------------------------------------ scoring (the AI listens, the platform counts)

export type ErrorKind = "MISPRONOUNCED" | "SUBSTITUTED" | "SKIPPED" | "HESITATION";
export const PROSODY_TRAITS = ["phrasing", "smoothness", "pace", "intonation"] as const;
export type ProsodyTrait = (typeof PROSODY_TRAITS)[number];
/** four traits 1–4, each with one short reason (null trait: could not be judged) */
export type Prosody = Record<ProsodyTrait, { score: number; reason: string } | null>;

export interface ReadingMarks {
  /** index of the last passage word the reader reached (-1: nothing of the passage was heard) */
  lastWordIndex: number;
  /** wrong words; HESITATION = stuck on the word for more than 3 seconds (the 3-second rule: an error) */
  errors: { i: number; kind: ErrorKind; heard: string }[];
  /** 1–4, NAEP oral reading fluency scale; null when it cannot be judged */
  expression: number | null;
  patterns: string[];
  /** indexes of the words the reader stopped on for more than 3 seconds (also in errors as HESITATION) */
  hesitations?: number[];
  prosody?: Prosody | null;
  /** about how many words the AI heard the reader say (0: silence / noise only); undefined when not given */
  heardWords?: number;
  /**
   * shown on the word, NOT errors (standard ORF scoring): a self-correction within 3 s, a repeated word, an inserted
   * extra word (i = the passage word it came before; heard = the extra word)
   */
  notes?: { i: number; kind: WordNote; heard: string }[];
}
export type ScoreTask = "READ" | "ECHO" | "DRILL";
/** voiced: seconds of voice the student's device measured (a hint for the listener; never a name or record) */
export type AudioScorer = (input: { words: string[]; audio: Uint8Array; mime: string; task?: ScoreTask; voiced?: number }) => Promise<ReadingMarks>;

const SYSTEM = `You are an expert assessor of oral reading fluency (running records, Hasbrouck & Tindal, NAEP). You get the passage as a numbered list of words and an audio recording of a school student (an English learner whose first language is Arabic) reading it aloud.
Mark only real reading errors on passage words:
 - MISPRONOUNCED: the word was said wrongly so it became another or an unrecognisable word,
 - SUBSTITUTED: another word was said instead,
 - SKIPPED: the word was left out,
 - HESITATION: the 3-second rule — the reader stopped on the word for MORE than 3 seconds before saying it (or never said it and went on after the pause). This counts as an error.
NEVER count an accent as an error. A recognisable word said with an Arabic accent is CORRECT (for example a slightly different vowel, a rolled r, p close to b, v close to f, or th close to s/z/t/d while the word is still clearly the word). Count it only when it clearly becomes a different word.
A numeral or number word written with digits (e.g. 1999, 25, 3rd, 50%) is CORRECT when it is said in any acceptable way ("nineteen ninety-nine" or "one thousand nine hundred ninety-nine"; "twenty-five"; "third"; "fifty percent").
A proper name (a person, place or brand) that is mispronounced counts as ONE error for the whole passage: mark only its FIRST mispronunciation; every later reading of the same name is CORRECT, however it is said.
Do NOT count as errors (standard oral reading fluency scoring): self-corrections made within 3 seconds (the word is CORRECT), repetitions, pauses of 3 seconds or less, "um"/"uh" fillers, sounding a word out before saying it right, inserted extra words. Never list them and never use any other error kind.
The recording may be quiet (its volume was raised on the device), start with a moment of silence, contain classroom noise or other voices in the background, or contain long pauses: listen to all of it. A young reader often pauses between words or sentences, reads slowly, softly or with a strong accent — that is still reading. If you can recognise the reader saying ANY words of the passage (even a few, even with many errors), it is a reading: give lastWordIndex for the last word they reached.
lastWordIndex = the index of the last passage word the reader reached (they may stop before the end). Use -1 ONLY when no passage word at all can be heard (silence, noise or a different text).
heardWords = about how many words the reader said aloud (0 for silence or noise only).
hesitations = the indexes of every word the reader stopped on for more than 3 seconds (the same words are HESITATION errors unless already marked as another error).
prosody = four traits, each a whole number 1–4 with ONE short reason in simple English (max 15 words):
 - phrasing: 1 word by word · 2 two-word groups · 3 mostly meaningful phrases · 4 phrases that follow the meaning and punctuation,
 - smoothness: 1 many long pauses, sound-outs and restarts · 2 several rough spots · 3 a few breaks, fixed quickly · 4 smooth,
 - pace: 1 very slow and laboured · 2 slow, or too fast to follow · 3 uneven but mostly conversational · 4 steady conversational pace,
 - intonation: 1 flat, no expression · 2 little expression · 3 some expression that fits the meaning · 4 voice matches meaning and punctuation (questions, exclamations, dialogue).
expression = the overall NAEP fluency scale: 1 word by word, 2 mostly two-word phrases, 3 mostly meaningful phrases with some expression, 4 phrased, smooth, expressive with attention to punctuation. null if too short to judge (then prosody null too).
patterns = up to 3 short sound/spelling patterns behind the errors (e.g. "-tion endings", "silent e", "vowel team ea", "-ed endings", "th sound"), or [] when none.
For each error, "heard" is what the reader said (as letters, e.g. "wus"), or "" when skipped or stuck.
notes = what a teacher marks on a running record that is NOT an error: SELF_CORRECTION (the word was misread, then fixed within 3 seconds: i = that word), REPETITION (a word or phrase said twice: i = its first word), INSERTION (an extra word not in the text: i = the passage word it came before, heard = the extra word). [] when none.
Reply with JSON only: {"lastWordIndex": number, "heardWords": number, "errors": [{"i": number, "kind": "MISPRONOUNCED"|"SUBSTITUTED"|"SKIPPED"|"HESITATION", "heard": string}], "hesitations": [number], "notes": [{"i": number, "kind": "SELF_CORRECTION"|"REPETITION"|"INSERTION", "heard": string}], "expression": 1|2|3|4|null, "prosody": {"phrasing": {"score": 1|2|3|4, "reason": string}, "smoothness": {...}, "pace": {...}, "intonation": {...}} | null, "patterns": [string]}`;
/** the student's device measured a voice: said to the listener so a soft, accented or noisy reading is not missed */
const VOICE_NOTE = (s: number) => `\nThe student's device measured about ${Math.round(s * 10) / 10} seconds of voice in this recording: someone IS speaking. Listen to the whole recording carefully (raise the volume in your mind; the voice may be soft, accented, far from the microphone or under classroom noise) and give the last passage word reached. Use lastWordIndex -1 only if the voice clearly reads none of these passage words.`;

const TASK_NOTE: Record<ScoreTask, string> = {
  READ: "",
  ECHO: "\nThis is ECHO READING: the student first heard a fluent model reading of this ONE sentence and is copying it. Judge phrasing and intonation against how a fluent reader says this sentence; in each prosody reason, name ONE specific thing to copy from the model (e.g. \"pause at the comma after morning\", \"let your voice go up at the question\").",
  DRILL: "\nThis is a SPEED DRILL: the words are a list of separate words read row by row, not a passage. Mark word errors only. Set expression null and prosody null.",
};

/** A trait score from the AI: a number 1–4 (rounded and clamped); null when missing or not a number. */
const clampTrait = (v: unknown): number | null => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.max(1, Math.min(4, Math.round(n))); };

/** Checks the prosody part of the AI's reply (each trait clamped to 1–4, reasons shortened). */
export function validateProsody(o: unknown): Prosody | null {
  if (!o || typeof o !== "object") return null;
  const out = {} as Prosody; let any = false;
  for (const t of PROSODY_TRAITS) {
    const raw = (o as Record<string, unknown>)[t];
    const score = clampTrait(raw && typeof raw === "object" ? (raw as { score?: unknown }).score : raw);
    const reason = raw && typeof raw === "object" ? s((raw as { reason?: unknown }).reason).replace(/\s+/g, " ").trim().slice(0, 140) : "";
    out[t] = score === null ? null : { score, reason };
    if (score !== null) any = true;
  }
  return any ? out : null;
}
export const prosodyScores = (p: Prosody | null | undefined): Record<ProsodyTrait, number> | null => (p ? (Object.fromEntries(PROSODY_TRAITS.filter((t) => p[t]).map((t) => [t, p[t]!.score])) as Record<ProsodyTrait, number>) : null);

/** Kinds a model sometimes lists that are NOT errors in oral reading fluency scoring (never counted). */
const NOT_ERRORS = new Set(["SELF_CORRECTION", "SELF_CORRECTED", "SELFCORRECTION", "CORRECTED", "SC", "REPETITION", "REPEATED", "INSERTION", "INSERTED", "CORRECT", "OK", "PAUSE", "FILLER"]);
/** …of those, the ones shown on the word as a note (the reader's own work, worth seeing) */
const NOTE_KIND: Record<string, WordNote> = { SELF_CORRECTION: "SELF_CORRECTION", SELF_CORRECTED: "SELF_CORRECTION", SELFCORRECTION: "SELF_CORRECTION", CORRECTED: "SELF_CORRECTION", SC: "SELF_CORRECTION", REPETITION: "REPETITION", REPEATED: "REPETITION", INSERTION: "INSERTION", INSERTED: "INSERTION" };
/** Other names for the four error kinds. */
const KIND_ALIASES: Record<string, string> = { MISPRONUNCIATION: "MISPRONOUNCED", MISPRONOUNCE: "MISPRONOUNCED", MISREAD: "MISPRONOUNCED", SUBSTITUTION: "SUBSTITUTED", SUBSTITUTE: "SUBSTITUTED", OMISSION: "SKIPPED", OMITTED: "SKIPPED", DELETION: "SKIPPED", SKIP: "SKIPPED", HESITATED: "HESITATION", LONG_PAUSE: "HESITATION" };

/**
 * A reply that says "nothing heard" (lastWordIndex -1) but also lists errors, an expression, prosody or words heard
 * contradicts itself: the model is asked once more before the student is told anything.
 */
export function heardButNoWords(data: unknown): boolean {
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || Number(o.lastWordIndex) !== -1) return false;
  return (Array.isArray(o.errors) && o.errors.length > 0) || Number(o.heardWords) > 0 || (o.expression !== null && o.expression !== undefined && Number(o.expression) >= 1) || validateProsody(o.prosody) !== null;
}

/** Checks the AI's reply against the passage (indexes in range, known kinds, one mark per word, 3-second rule). */
export function validateMarks(data: unknown, n: number): { ok: true; value: ReadingMarks } | { ok: false; error: string } {
  const o = data as Partial<ReadingMarks> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "reply must be an object" };
  let last = Number(o.lastWordIndex);
  // a count instead of an index ("reached word n" for an n-word passage): the last word
  if (Number.isInteger(last) && last >= n && last <= n + 1) last = n - 1;
  if (!Number.isInteger(last) || last < -1 || last >= n) return { ok: false, error: `lastWordIndex must be a whole number from -1 to ${n - 1}` };
  const rawErrors = o.errors === undefined || o.errors === null ? [] : o.errors;
  if (!Array.isArray(rawErrors)) return { ok: false, error: "errors must be a list" };
  const seen = new Set<number>(); const errors: ReadingMarks["errors"] = [];
  const noteList: { i: number; kind: WordNote; heard: string }[] = [];
  const addNote = (e: unknown, kind0: string) => {
    const i = Number((e as { i?: unknown })?.i), kind = NOTE_KIND[kind0];
    if (kind && Number.isInteger(i) && i >= 0 && i <= Math.max(last, 0) && !noteList.some((x) => x.i === i)) noteList.push({ i, kind, heard: s((e as { heard?: unknown })?.heard).slice(0, 40) });
  };
  for (const e of rawErrors) {
    const i = Number((e as { i?: unknown })?.i), kind0 = s((e as { kind?: unknown })?.kind).toUpperCase().replace(/[\s-]+/g, "_");
    // standard scoring: a self-correction, a repetition or an inserted word is not an error (the word counts as correct)
    if (NOT_ERRORS.has(kind0)) { addNote(e, kind0); continue; }
    const kind = KIND_ALIASES[kind0] ?? kind0;
    if (!Number.isInteger(i) || i < 0 || i >= n) return { ok: false, error: `error index ${s((e as { i?: unknown })?.i)} is not a passage word` };
    if (!["MISPRONOUNCED", "SUBSTITUTED", "SKIPPED", "HESITATION"].includes(kind)) return { ok: false, error: `unknown error kind ${kind}` };
    if (seen.has(i) || i > last) continue;
    seen.add(i); errors.push({ i, kind: kind as ErrorKind, heard: kind === "HESITATION" ? "" : s((e as { heard?: unknown })?.heard).slice(0, 40) });
  }
  // the 3-second rule: a word the reader was stuck on for more than 3 seconds is an error
  const hes = Array.isArray(o.hesitations) ? o.hesitations.map((h) => Number(typeof h === "object" && h !== null ? (h as { i?: unknown }).i : h)).filter((i) => Number.isInteger(i) && i >= 0 && i <= last) : [];
  const hesitations = [...new Set([...hes, ...errors.filter((e) => e.kind === "HESITATION").map((e) => e.i)])].sort((a, b) => a - b);
  for (const i of hesitations) if (!seen.has(i)) { seen.add(i); errors.push({ i, kind: "HESITATION", heard: "" }); }
  const prosody = validateProsody(o.prosody);
  const exRaw = o.expression === null || o.expression === undefined ? null : Number(o.expression);
  let expression = exRaw !== null && Number.isFinite(exRaw) && exRaw >= 1 && exRaw <= 4 ? Math.round(exRaw) : null;
  if (expression === null && prosody) { const sc = PROSODY_TRAITS.map((t) => prosody[t]?.score).filter((x): x is number => typeof x === "number"); expression = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length); }
  const patterns = Array.isArray(o.patterns) ? o.patterns.map((p) => s(p).slice(0, 60)).filter(Boolean).slice(0, 3) : [];
  const hw = Number((o as { heardWords?: unknown }).heardWords);
  const heardWords = Number.isFinite(hw) && hw >= 0 ? Math.round(hw) : undefined;
  if (Array.isArray(o.notes)) for (const x of o.notes) addNote(x, s((x as { kind?: unknown })?.kind).toUpperCase().replace(/[\s-]+/g, "_"));
  // a note never sits on a word that is an error (the error wins); a self-correction or repetition needs a word read
  const notes = noteList.filter((x) => !seen.has(x.i) && (x.kind === "INSERTION" || x.i <= last)).sort((a, b) => a.i - b.i);
  return { ok: true, value: { lastWordIndex: last, errors: errors.sort((a, b) => a.i - b.i), expression, patterns, hesitations, prosody, ...(heardWords !== undefined ? { heardWords } : {}), ...(notes.length ? { notes } : {}) } };
}

// ------------------------------------------------------------------ the Gemini call (Update 41: robust connection)

/** The whole scoring call must finish before the hosting proxy gives up (Cloudflare/Render: 100 s). */
export const FLUENCY_TIMEOUT_MS = 80_000;
export const FLUENCY_MAX_OUTPUT_TOKENS = 16_384;

/** What went wrong with the provider, in plain English (never the key). */
export type CoachFailureKind = "CONFIG" | "RATE_LIMIT" | "TIMEOUT" | "DOWN" | "INVALID" | "REQUEST";
export class CoachProviderError extends Error {
  constructor(readonly kind: CoachFailureKind, message: string, readonly status: number | null = null) { super(message); }
}

const AUDIO_MIME: Record<string, string> = {
  "audio/wav": "audio/wav", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav", "audio/x-pn-wav": "audio/wav",
  "audio/webm": "audio/webm", "video/webm": "audio/webm",
  "audio/ogg": "audio/ogg", "application/ogg": "audio/ogg", "audio/opus": "audio/ogg", "video/ogg": "audio/ogg",
  "audio/mp4": "audio/mp4", "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "audio/mp4a-latm": "audio/mp4", "video/mp4": "audio/mp4", "audio/x-mp4": "audio/mp4",
  "audio/aac": "audio/aac", "audio/x-aac": "audio/aac", "audio/aacp": "audio/aac",
  "audio/mpeg": "audio/mp3", "audio/mp3": "audio/mp3", "audio/x-mp3": "audio/mp3", "audio/mpeg3": "audio/mp3", "audio/x-mpeg": "audio/mp3",
  "audio/flac": "audio/flac", "audio/x-flac": "audio/flac",
  "audio/aiff": "audio/aiff", "audio/x-aiff": "audio/aiff",
};

/** The recording's real type from its first bytes (a browser's label can be missing or wrong). */
function sniffAudio(b: Uint8Array | undefined): string | null {
  if (!b || b.length < 12) return null;
  const at = (o: number, t: string) => [...t].every((c, k) => b[o + k] === c.charCodeAt(0));
  if (at(0, "RIFF") && at(8, "WAVE")) return "audio/wav";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (at(0, "OggS")) return "audio/ogg";
  if (at(4, "ftyp")) return "audio/mp4";
  if (at(0, "fLaC")) return "audio/flac";
  if (at(0, "FORM") && at(8, "AIF")) return "audio/aiff";
  if (at(0, "ID3")) return "audio/mp3";
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return "audio/aac";   // ADTS
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "audio/mp3";   // MPEG frame
  return null;
}

/**
 * The audio type in a form Gemini accepts: codec parameters removed ("audio/webm;codecs=opus" → "audio/webm"),
 * Safari/iPad names mapped ("audio/x-m4a" → "audio/mp4"), and the file's own bytes trusted over its label.
 * Null when it is not a recording type we can send.
 */
export function geminiAudioMime(mime: string, audio?: Uint8Array): string | null {
  const sniffed = sniffAudio(audio);
  if (sniffed) return sniffed;
  const base = s(mime).split(";")[0].trim().toLowerCase();
  return AUDIO_MIME[base] ?? null;
}

/**
 * Thinking settings per model: the 2.5 / 3.x models "think" before answering and those tokens count against
 * maxOutputTokens, which can cut the JSON off. Flash: thinking off (budget 0); 2.5 Pro cannot switch it off (the
 * smallest budget, 128); Gemini 3.x: the low level. Unknown models: nothing (the provider's default).
 */
export function thinkingConfigFor(model: string): Record<string, unknown> | null {
  const m = model.trim().toLowerCase().replace(/^models\//, "");
  if (/^gemini-2\.5-flash/.test(m)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5-pro/.test(m)) return { thinkingBudget: 128 };
  if (/^gemini-[3-9]/.test(m)) return { thinkingLevel: "low" };
  return null;
}

/** The recording as base64, made once per recording (retries and backup models reuse it: less memory, less time). */
const B64 = new WeakMap<Uint8Array, string>();
function base64Of(audio: Uint8Array): string {
  let b = B64.get(audio);
  if (b === undefined) { b = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength).toString("base64"); B64.set(audio, b); }
  return b;
}

/** The Gemini request body for one scoring call. */
export function geminiAudioRequest(model: string, system: string, userText: string, audio: Uint8Array, mime: string, opts: { thinking?: boolean } = {}): Record<string, unknown> {
  const thinking = opts.thinking === false ? null : thinkingConfigFor(model);
  const gemini3 = /^gemini-[3-9]/.test(model.trim().toLowerCase());
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userText }, { inline_data: { mime_type: mime, data: base64Of(audio) } }] }],
    generationConfig: {
      maxOutputTokens: FLUENCY_MAX_OUTPUT_TOKENS, responseMimeType: "application/json",
      // Gemini 3 is tuned for its default temperature (lower values can make it loop until the reply is cut off)
      ...(gemini3 ? {} : { temperature: 0 }),
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  };
}

/** A failed HTTP reply from Gemini as a plain-English reason and its kind (configuration or passing). */
export function classifyGeminiFailure(status: number, body: string, model: string): CoachProviderError {
  const b = s(body).slice(0, 600);
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(b)) return new CoachProviderError("RATE_LIMIT", "RATE_LIMIT: Gemini's usage limit was reached (per minute or per day).", status);
  if (/API_KEY_INVALID|API key not valid|API key expired|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(b)) return new CoachProviderError("CONFIG", `CONFIG: Google did not accept the Gemini API key (HTTP ${status}). Check GEMINI_API_KEY on Render: the whole key, no spaces; or create a new key at aistudio.google.com.`, status);
  if (status === 401 || status === 403) return new CoachProviderError("CONFIG", `CONFIG: Google refused the Gemini API key (HTTP ${status}${/PERMISSION_DENIED|SERVICE_DISABLED/.test(b) ? ": the Generative Language API is not allowed for this key's project" : ""}). Check GEMINI_API_KEY on Render.`, status);
  if (status === 404) return new CoachProviderError("CONFIG", `CONFIG: The Gemini model “${model}” was not found (HTTP 404). Set GEMINI_MODEL on Render to a current model that listens to audio, e.g. gemini-2.5-flash.`, status);
  if (/User location is not supported|FAILED_PRECONDITION/i.test(b)) return new CoachProviderError("CONFIG", `CONFIG: Gemini is not available for this server's region or project (HTTP ${status}): ${b.replace(/\s+/g, " ").slice(0, 200)}`, status);
  if (status >= 500) return new CoachProviderError("DOWN", `DOWN: Gemini is temporarily unavailable (HTTP ${status}).`, status);
  return new CoachProviderError("REQUEST", `REQUEST: Gemini did not accept the request (HTTP ${status}): ${b.replace(/\s+/g, " ").slice(0, 300)}`, status);
}

/** Steadier models tried once when the main model is busy (HTTP 5xx, "high demand"). */
export const FLUENCY_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

/** The model the Fluency Coach uses (GEMINI_MODEL, else the platform default). */
export function fluencyModel(env: EnvLike): string {
  const c = chooseAiProvider({ ...env, AI_PROVIDER: "gemini" });
  return ("error" in c ? "" : c.model) || s(env.GEMINI_MODEL).trim() || "gemini";
}

const COMPACT = "\nKeep the reply short: list ONLY the words with errors (never the correct words), each reason at most 12 words, no other text.";
/** the second try after an unusable reply: stricter */
const STRICT = "\nSTRICT: your previous reply could not be used (see yourPreviousReplyWasRejectedBecause). Reply with ONE valid JSON object exactly in the given shape, indexes from the numbered list only, error kinds only MISPRONOUNCED, SUBSTITUTED, SKIPPED or HESITATION. If the reader can be heard reading any passage word, lastWordIndex MUST be the index of the last word they reached (not -1).";

/** Gemini listens to the recording (audio inline, JSON reply). Null when Gemini is not set up. */
export function geminiAudioScorer(env: EnvLike, fetchImpl: typeof fetch = fetch, opts: { timeoutMs?: number } = {}): AudioScorer | null {
  const c = chooseAiProvider({ ...env, AI_PROVIDER: "gemini" });
  if ("error" in c || c.provider !== "gemini") return null;
  const model = c.model;
  const budget = opts.timeoutMs ?? FLUENCY_TIMEOUT_MS;
  return async ({ words, audio, mime, task = "READ", voiced = 0 }) => {
    const sendMime = geminiAudioMime(mime, audio);
    if (!sendMime) throw new CoachProviderError("REQUEST", `REQUEST: the recording type “${mime}” cannot be sent to Gemini.`);
    const numbered = words.map((w, i) => `${i}:${w}`).join(" ");
    // only the passage words and the measured seconds of voice go with the audio (no name, no record)
    const hint = voiced >= SECOND_OPINION_VOICED_S ? { deviceMeasuredVoiceSeconds: Math.round(voiced * 10) / 10 } : {};
    const system = SYSTEM + TASK_NOTE[task] + (voiced >= SECOND_OPINION_VOICED_S ? VOICE_NOTE(voiced) : "") + COMPACT;
    let body = { passageWords: numbered, wordCount: words.length, ...hint } as Record<string, unknown>;
    let lastError = "";
    let thinking = true, answers = 0;
    let heardBefore: ReadingMarks | null = null;
    const deadline = Date.now() + budget;
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = deadline - Date.now();
      if (attempt > 0 && left < 10_000) break;   // no time for another try before the proxy gives up
      let res: Response;
      try {
        res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
          body: JSON.stringify(geminiAudioRequest(model, system + (answers ? STRICT : ""), JSON.stringify(body), audio, sendMime, { thinking })),
          signal: AbortSignal.timeout(Math.max(1_000, left)),
        });
      } catch (e) {
        const n = (e as Error)?.name ?? "";
        if (n === "TimeoutError" || n === "AbortError") throw new CoachProviderError("TIMEOUT", `TIMEOUT: Gemini did not answer within ${Math.round(budget / 1000)} seconds.`);
        throw new CoachProviderError("DOWN", `DOWN: Gemini could not be reached (${s((e as Error)?.message).slice(0, 120)}).`);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        // a model that does not take these thinking settings: ask once more without them
        if (res.status === 400 && thinking && /thinking/i.test(t)) { thinking = false; continue; }
        throw classifyGeminiFailure(res.status, t, model);
      }
      const data = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (data.promptFeedback?.blockReason) lastError = `Gemini refused the recording (${data.promptFeedback.blockReason})`;
      else if (!text.trim()) lastError = cand?.finishReason === "MAX_TOKENS" ? "the reply was cut off before the answer (MAX_TOKENS: thinking used the output budget)" : `the reply was empty${cand?.finishReason ? ` (${cand.finishReason})` : ""}`;
      else {
        try {
          const raw = extractJson(text);
          const v = validateMarks(raw, words.length);
          if (v.ok) {
            // "nothing heard" while also describing the reading: ask once more; a second -1 is believed
            if (!heardButNoWords(raw) || answers >= 1) return v.value;
            heardBefore = v.value;
            lastError = "lastWordIndex was -1 although you described words being read; give the index of the last passage word the reader reached";
          } else lastError = v.error;
        }
        catch (e) { lastError = `${(e as Error).message}${cand?.finishReason === "MAX_TOKENS" ? " (cut off: MAX_TOKENS)" : ""}`; }
      }
      body = { passageWords: numbered, wordCount: words.length, ...hint, yourPreviousReplyWasRejectedBecause: lastError };
      if (++answers >= 2) break;   // two answers at most
    }
    if (heardBefore) return heardBefore;   // no time for the second try: the first (valid) answer stands
    throw new CoachProviderError("INVALID", `INVALID: The AI reply could not be used (${lastError || "no answer in time"}).`);
  };
}

/** One second of silence as a 16 kHz mono WAV (for the admin's connection test: no voice, no student). */
export function silentWav(seconds = 1, rate = 16000): Uint8Array {
  const n = Math.round(seconds * rate), buf = new Uint8Array(44 + n * 2), v = new DataView(buf.buffer);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  return buf;
}

/** Plain-English text of a provider failure for the admin (the prefix code removed). */
export const plainFailure = (m: string) => s(m).replace(/^(CONFIG|RATE_LIMIT|TIMEOUT|DOWN|INVALID|REQUEST):\s*/, "");

/**
 * 🔌 The admin's "Test the Fluency Coach connection": one second of generated silence goes to Gemini with the
 * same settings the students use. OK, or the exact reason in plain English. No student data is sent.
 */
export async function testCoachConnection(repo: Repo, actor: Actor, env: EnvLike, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<{ ok: boolean; model: string; ms: number; message: string }> {
  assertCan(actor, "settings:engine");
  const model = fluencyModel(env);
  const scorer = geminiAudioScorer(env, fetchImpl);
  if (!scorer) return { ok: false, model, ms: 0, message: "GEMINI_API_KEY is not set on the server (Render → Environment). The Fluency Coach needs a Google Gemini key." };
  const started = Date.now();
  try {
    await scorer({ words: ["The", "kite", "flew", "high."], audio: silentWav(1), mime: "audio/wav", task: "READ" });
    const ms = Date.now() - started;
    await repo.create("AiRequestLog", { schoolId: s(actor.schoolId), tool: "fluency-test", provider: "gemini", model: model.slice(0, 80), ok: true, items: 1, ms, error: null, createdAt: now });
    return { ok: true, model, ms, message: `OK: Gemini (${model}) listened to a test recording and answered in ${(ms / 1000).toFixed(1)} s. The Fluency Coach is ready.` };
  } catch (e) {
    const ms = Date.now() - started, m = s((e as Error).message);
    await repo.create("AiRequestLog", { schoolId: s(actor.schoolId), tool: "fluency-test", provider: "gemini", model: model.slice(0, 80), ok: false, items: 1, ms, error: m.slice(0, 500), createdAt: now });
    return { ok: false, model, ms, message: plainFailure(m) };
  }
}

const COACH_ALERT = "🎙 The Fluency Coach is not set up correctly";
/** Tells the school admins (once while the notice is unread) that the coach's AI connection needs fixing. */
export async function notifyCoachProblem(repo: Repo, schoolId: string, reason: string, now = new Date()): Promise<number> {
  const admins = await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true }, { select: ["id"] });
  let n = 0;
  for (const a of admins) {
    const open = await repo.findMany("Notification", { userId: a.id, title: COACH_ALERT, readAt: null }, { select: ["id"] });
    if (open.length) continue;
    await repo.create("Notification", { userId: a.id, type: "ADMIN_MESSAGE", title: COACH_ALERT, body: `Students cannot get their reading scored. Reason: ${plainFailure(reason).slice(0, 300)} Open AI Tools → Settings and press “Test the Fluency Coach connection” after fixing it.`, link: "/admin/ai-tools?tab=settings", readAt: null, createdAt: now });
    n++;
  }
  return n;
}

export interface CoachResult {
  id: string; mode: CoachMode; kind: PracticeKind; title: string; passageKey: string;
  /** every passage word with its mark; note = a self-correction / repetition / an extra word said before it (not errors) */
  words: MarkedWord[];
  wordsRead: number; wordsCorrect: number; seconds: number; wcpm: number; accuracy: number; expression: number | null;
  /** the counts of each miscue, the NAEP level, the 3 words to practise, 2–3 next steps and the growth on this text */
  feedback?: FeedbackSummary;
  /** MINUTE: the official level; PASSAGE: an estimate (practice) */
  level: Level; official: boolean; rubric: string; patterns: string[]; practise: string[];
  plan: CoachPlan; date: string;
  /** "92 WCPM = 23rd percentile (winter, Grade 5)" and the student's simple-words version */
  norm: NormView;
  prosody: Prosody | null; hesitations: number;
  /** friendly tips for Arabic-speaking readers, from the missed words */
  tips: (ArabicTip & { words: string[] })[];
  /** 1-minute checks: two the same day → the official score is their average */
  average: { reads: number[]; wcpm: number } | null;
  /** REPEATED / PHRASED: this trial, all trials of the passage and the next goal */
  trial: number | null; trials: { trial: number; wcpm: number; goal: number | null }[]; nextGoal: number | null;
  drill: (DrillResult & { grid: DrillGrid }) | null;
  echo: { sentence: number; sentences: number } | null;
  /** a practice re-read: compared with the first read, never stored, never counted */
  practice?: boolean;
  /** r4: a message for the student, e.g. a 1-minute check stopped early: "Read for the whole minute so your score counts." */
  notice?: string;
  improvement?: Improvement | null;
}
export interface Improvement { first: { wcpm: number; accuracy: number }; wcpmGain: number; accuracyGain: number; message: string }

/** How a practice re-read compares with the first read, in encouraging words. */
export function improvementOf(first: { wcpm: number; accuracy: number }, now: { wcpm: number; accuracy: number }): Improvement {
  const wcpmGain = now.wcpm - first.wcpm, accuracyGain = now.accuracy - first.accuracy;
  const message = wcpmGain > 0 && accuracyGain >= 0 ? `🚀 Great growth! You read ${wcpmGain} more word${wcpmGain === 1 ? "" : "s"} correct per minute than the first time.`
    : wcpmGain > 0 ? "⚡ Faster than the first time! Slow down a little on the tricky words to get every word right."
    : accuracyGain > 0 ? `🎯 More words right than the first time (${now.accuracy}%). Your speed will grow with practice.`
    : wcpmGain === 0 && accuracyGain === 0 ? "👍 Steady reading, just like the first time. Every reading makes you stronger."
    : "💪 Good effort! Listen once more, then read it again. Practice makes reading easier.";
  return { first, wcpmGain, accuracyGain, message };
}
export interface CoachPlan {
  level: Level; goal: number; nextCheck: string; perWeek: number; steps: { icon: string; text: string; href?: string }[]; words: string[]; patterns: string[]; nextPassageKey: string | null;
  /** the weekly goal toward the next season's 50th percentile */
  growth?: { nextGoal: number; perWeek: number; target: number; weeks: number; season: Season; reached: boolean } | null;
  /** the remedial plan (goal, daily routine with minutes, weeks, success criteria, automatic adjustment) — remedial.ts */
  remedial?: RemedialPlan | null;
}

/** The counts (the platform's own arithmetic: the AI only marks the words). */
export function countReading(words: string[], marks: ReadingMarks, seconds: number, mode: CoachMode): { wordsRead: number; wordsCorrect: number; seconds: number; wcpm: number; accuracy: number } {
  const wordsRead = marks.lastWordIndex + 1;
  const errs = marks.errors.filter((e) => e.i <= marks.lastWordIndex).length;
  const wordsCorrect = Math.max(0, wordsRead - errs);
  const secs = Math.max(5, Math.min(mode === "MINUTE" ? MINUTE_SECONDS : PASSAGE_MAX_SECONDS, Math.round(seconds)));
  void words;
  return { wordsRead, wordsCorrect, seconds: secs, wcpm: Math.round((wordsCorrect * 60) / secs), accuracy: wordsRead ? Math.round((100 * wordsCorrect) / wordsRead) : 0 };
}

/** Repeated reading is for students who are not already Above level (they get wider reading instead). */
export const repeatedOffered = (level: Level | null) => level !== "ABOVE";

/** The stretch goal for the next trial: about +10%, and at most the 50th percentile while still under it. */
export function trialGoal(prevWcpm: number, p50: number | null): number {
  const ten = Math.max(prevWcpm + 1, Math.round(prevWcpm * 1.1));
  return p50 !== null && prevWcpm < p50 ? Math.min(ten, p50) : ten;
}

/** Two 1-minute cold reads on the same day: the official score is their (rounded) average. */
export const averageReads = (reads: number[]) => Math.round(reads.reduce((a, b) => a + b, 0) / Math.max(1, reads.length));

/** The plan after a reading: words and patterns to practise, the week's reading by level, a goal and the next check. */
export function makePlan(input: { level: Level; wcpm: number; expression: number | null; grade: number; words: string[]; patterns: string[]; passageKey: string; nextKey: { same: string; harder: string | null; another: string | null; minute?: string | null }; phrasing?: number | null }, now = new Date()): CoachPlan {
  const b = fluencyBands(input.grade);
  const goal = input.level === "BELOW" ? Math.max(input.wcpm + 1, Math.min(b.below, input.wcpm + 10)) : input.level === "ON" ? Math.max(input.wcpm + 1, Math.min(b.above + 1, input.wcpm + 8)) : input.wcpm + 5;
  const next = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const growth = weeklyGoal(input.grade, input.wcpm, now);
  const go = (key: string, kind: PracticeKind) => `/student/fluency-coach?key=${encodeURIComponent(key)}&mode=${kind}`;
  const steps: CoachPlan["steps"] = [];
  if (input.words.length) steps.push({ icon: "🗣", text: `Practise your words: listen to each one 🔊 and say it three times — ${input.words.slice(0, 8).join(", ")}.` });
  if (input.patterns.length) steps.push({ icon: "🔤", text: `Sound pattern${input.patterns.length > 1 ? "s" : ""} to work on: ${input.patterns.join(" · ")}. Do a 1-minute speed drill of these patterns.`, href: "/student/fluency-coach?mode=DRILL" });
  if (input.level === "BELOW") steps.push({ icon: "🔁", text: "Read the same passage again three times this week (repeated reading). Listen to the hard words first, then read a little faster each time.", href: go(input.nextKey.same, "REPEATED") });
  else if (input.level === "ON") steps.push({ icon: "📖", text: "Read a new passage at your level twice this week. Pause at commas and full stops, and let your voice show the meaning.", href: input.nextKey.another ? go(input.nextKey.another, "PASSAGE") : undefined });
  else steps.push({ icon: "🚀", text: "Wider reading: try a harder passage this week, then answer its questions in ReadMaster to check you understood it.", href: input.nextKey.harder ? go(input.nextKey.harder, "PASSAGE") : "/student/readmaster" });
  if ((input.expression !== null && input.expression <= 2) || (input.phrasing != null && input.phrasing <= 2)) steps.push({ icon: "🎭", text: "Read like a storyteller: group the words into phrases, and read the sentence again when it does not sound right. Try phrased reading and echo reading.", href: go(input.nextKey.same, "PHRASED") });
  steps.push({ icon: "⏱", text: `Take your next 1-minute check on ${next}. Goal: ${growth && !growth.reached ? growth.nextGoal : goal} words correct per minute.`, href: input.nextKey.minute !== undefined ? (input.nextKey.minute ? go(input.nextKey.minute, "MINUTE") : "/student/fluency-coach") : go(input.nextKey.same, "MINUTE") });
  const nextPassageKey = input.level === "BELOW" ? input.nextKey.same : input.level === "ON" ? input.nextKey.another : input.nextKey.harder;
  return { level: input.level, goal, nextCheck: next, perWeek: input.level === "BELOW" ? 3 : 2, steps, words: input.words.slice(0, 12), patterns: input.patterns, nextPassageKey: nextPassageKey ?? null, growth };
}

const clampKind = (k: unknown, mode: CoachMode): PracticeKind => (PRACTICE_KINDS.includes(k as PracticeKind) ? (k as PracticeKind) : mode);
const day = (x: unknown) => (d(x) ?? new Date(0)).toISOString().slice(0, 10);
// r85 audit: for deciding whether "two 1-minute cold reads on the same day" should be averaged (riyadhDay below),
// the school day must be Riyadh-local (UTC+3), the convention used elsewhere in this codebase for day boundaries
// — `day()` above stays raw UTC since it is only used for display dates, where this doesn't matter.
export const riyadhDay = (x: unknown) => new Date((d(x) ?? new Date(0)).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** One prosody number (NAEP 1–4) for a reading: the mean of the four traits, else the overall expression score. */
export function prosodyMean(traits: Record<string, unknown> | null | undefined, expression: unknown = null): number | null {
  const xs = traits ? PROSODY_TRAITS.map((t) => traits[t]).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 4) : [];
  if (xs.length) return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  const e = Number(expression);
  return expression !== null && expression !== undefined && e >= 1 && e <= 4 ? e : null;
}

/** Stored readings → the evidence the remedial plan is made from (oldest first). */
export function readingEvidence(rows: Row[]): ReadingEvidence[] {
  return rows.map((r) => ({ date: (d(r.createdAt) ?? new Date(0)).toISOString(), kind: s(r.practiceKind) || s(r.mode), wcpm: Number(r.wcpm), accuracy: Number(r.accuracy), prosody: prosodyMean(json<Record<string, unknown> | null>(r.prosody, null), r.expression), trial: r.trial === null || r.trial === undefined ? null : Number(r.trial) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** Official checks → cold reads (oldest first). */
export const coldReads = (checks: Row[]) => checks.map((c) => ({ date: (d(c.checkedAt) ?? new Date(0)).toISOString(), wcpm: Number(c.wcpm), accuracy: c.accuracy === null || c.accuracy === undefined ? null : Number(c.accuracy) })).sort((a, b) => a.date.localeCompare(b.date));
/** The latest stored remedial plan in a list of readings (newest first). */
export const latestRemedial = (rows: Row[]): RemedialPlan | null => { for (const r of rows) { const pl = asRemedialPlan(json<{ remedial?: unknown } | null>(r.plan, null)?.remedial); if (pl) return pl; } return null; };

/**
 * The remedial plan after a reading: the student's last plan reviewed with all the evidence (cold reads, readings),
 * or a new one. Two small reads: the official checks and the last plans (only their plan column).
 */
async function remedialAfter(repo: Repo, studentId: string, grade: number, history: Row[], current: ReadingEvidence, ctx: { words: string[]; patterns: string[]; links: PlanEvidence["links"] }, repeatedOk: boolean, now: Date): Promise<RemedialPlan | null> {
  const [checks, planRows] = await Promise.all([
    repo.findMany("FluencyCheck", { studentId }, { select: ["wcpm", "accuracy", "checkedAt"], orderBy: [{ field: "checkedAt", dir: "desc" }], take: 30 }),
    repo.findMany("FluencyPractice", { studentId }, { select: ["plan", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 8 }),
  ]);
  const ev: PlanEvidence = { grade, cold: coldReads(checks), readings: [...readingEvidence(history), current], words: ctx.words.slice(0, 8), patterns: ctx.patterns, links: ctx.links };
  const plan = nextRemedialPlan(latestRemedial(planRows), ev, now);
  if (plan && !repeatedOk) {
    // students already reading strongly get wider reading, never repeated reading of one passage
    const fix = (st: RemedialPlan["daily"][number]) => (st.href && /mode=REPEATED/.test(st.href) ? { ...st, href: st.href.replace("mode=REPEATED", "mode=PASSAGE") } : st);
    plan.daily = plan.daily.map(fix);
  }
  return plan;
}

/** The student's latest official level (from the checks, season of each check). */
async function latestOfficial(repo: Repo, studentId: string, grade: number): Promise<{ wcpm: number; level: Level; season: Season } | null> {
  const c = (await repo.findMany("FluencyCheck", { studentId })).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0];
  if (!c) return null;
  const season = isSeason(c.season) ? (c.season as Season) : fluencySeason(d(c.checkedAt) ?? new Date());
  return { wcpm: Number(c.wcpm), level: fluencyLevel(Number(c.wcpm), grade, season), season };
}

/** The student's own missed words and pattern notes (for the drill), most recent readings first. */
async function ownErrors(repo: Repo, studentId: string): Promise<{ words: string[]; notes: string[] }> {
  const rows = (await repo.findMany("FluencyPractice", { studentId }, { select: ["errors", "patterns", "createdAt", "practiceKind"] })).sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0)).slice(0, 10);
  const words: string[] = [], notes: string[] = [];
  for (const r of rows) { for (const e of json<{ word?: string }[]>(r.errors, [])) if (e.word) words.push(s(e.word)); notes.push(...json<string[]>(r.patterns, [])); }
  return { words: [...new Set(words)].slice(0, 40), notes: [...new Set(notes)].slice(0, 10) };
}

/** Today's drill grid for the student (deterministic for the day). */
export async function drillFor(repo: Repo, actor: Actor, now = new Date()): Promise<DrillGrid> {
  await studentGrade(repo, actor);
  const own = await ownErrors(repo, actor.studentId!);
  return buildDrill({ errorWords: own.words, notes: own.notes, seed: `${actor.studentId}:${now.toISOString().slice(0, 10)}` });
}

/** The student is told this only when the coach heard no reading at all in a recording that had a voice. */
export const NOT_HEARD = "We could not hear the passage in the recording. Check the microphone, read a little louder, and try again.";
/** said when the device DID measure a voice but no model could follow the passage (never "we could not hear you") */
export const HEARD_UNCLEAR = "We heard your voice, but not clearly enough to follow the passage. Hold the device closer, read in a clear voice, and start from the first word.";
/**
 * NOT_HEARD: no voice at all (record again). HEARD_UNCLEAR: the device measured a voice — the page listens to the
 * same recording once more by itself before showing this, and "Send again" stays possible.
 */
export class NotHeardError extends ValidationError {
  constructor(message = NOT_HEARD, readonly code: "NOT_HEARD" | "HEARD_UNCLEAR" = "NOT_HEARD") { super(message); }
}
const SCORING_FAILED = "The coach could not finish scoring this reading. Please try again in a moment — your recording is kept.";

/**
 * r4 (memory): the recordings this server holds at the same time are limited by their total SIZE (512 MB on Render),
 * not by their number: a 16 kHz mono WAV is ≈1.9 MB a minute, an odd 12 MB upload weighs six of them. The API route
 * reserves the bytes BEFORE reading the request body (Content-Length, else the largest allowed upload), so a busy
 * server answers "busy, retry in a few seconds" without buffering anything.
 */
export const FLUENCY_MAX_INFLIGHT_BYTES = 60 * 1024 * 1024;
/** @deprecated r4: the limit is by bytes (FLUENCY_MAX_INFLIGHT_BYTES); kept for old imports */
export const FLUENCY_MAX_INFLIGHT = 6;
export const FLUENCY_BUSY_SECONDS = 5;
export const FLUENCY_BUSY_REASON = "Many students are reading right now. Your result is next.";
let inflight = 0, inflightBytes = 0;
export const fluencyInflight = () => inflight;
export const fluencyInflightBytes = () => inflightBytes;
/** A reservation of `bytes` of audio memory; null when the server is full (the caller answers "busy"). */
export function reserveFluencyBytes(bytes: number): { release: () => void } | null {
  const n = Math.max(1, Math.round(Number(bytes) || 0));
  // one recording is always allowed when nothing else is held (a single upload can never be refused for ever)
  if (inflight > 0 && inflightBytes + n > FLUENCY_MAX_INFLIGHT_BYTES) return null;
  inflight++; inflightBytes += n;
  let done = false;
  return { release: () => { if (done) return; done = true; inflight--; inflightBytes -= n; } };
}

/**
 * r4: the length of a WAV recording in seconds from its own header (data bytes ÷ byte rate); null when it is not a
 * WAV (another container: the server cannot measure it cheaply). The client sends 16 kHz mono 16-bit WAV.
 */
export function wavSeconds(b: Uint8Array): number | null {
  if (!b || b.length < 44) return null;
  const at = (o: number, t: string) => [...t].every((c, k) => b[o + k] === c.charCodeAt(0));
  if (!at(0, "RIFF") || !at(8, "WAVE")) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12, byteRate = 0;
  while (o + 8 <= b.length) {
    const size = v.getUint32(o + 4, true);
    if (at(o, "fmt ") && o + 20 <= b.length) byteRate = v.getUint32(o + 16, true);
    if (at(o, "data")) {
      if (!byteRate) return null;
      // a streamed header may say 0 / 0xFFFFFFFF: the bytes actually there count
      const bytes = Math.min(size || Infinity, b.length - (o + 8));
      return bytes / byteRate;
    }
    o += 8 + size + (size % 2);
  }
  return null;
}

/**
 * r4: the duration the server believes: the audio's own length (WAV) and the browser's `seconds`, the smaller one.
 * Not a WAV: the browser's value (WCPM plausibility is capped later, MAX_PLAUSIBLE_WCPM).
 */
export function readingSeconds(audio: Uint8Array, clientSeconds: number): { seconds: number; measured: boolean } {
  const a = wavSeconds(audio), c = Number(clientSeconds) || 0;
  return a === null ? { seconds: c, measured: false } : { seconds: Math.min(a, c), measured: true };
}

/**
 * r4: a mispronounced proper name is ONE error for the whole passage: later errors on the same name are dropped (the
 * word counts as correct). A name = a capitalised word that is not the first word of a sentence somewhere.
 */
export function onePerName(words: string[], errors: ReadingMarks["errors"]): ReadingMarks["errors"] {
  const key = (w: string) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").replace(/'s$/i, "");
  const startOf = (i: number) => i === 0 || /[.!?]["”’)]?$/.test(words[i - 1] ?? "");
  const names = new Set<string>();
  words.forEach((w, i) => { const k = key(w); if (/^[A-Z][a-z]/.test(k) && !startOf(i)) names.add(k); });
  const seen = new Set<string>();
  return errors.filter((e) => {
    if (e.kind !== "MISPRONOUNCED" && e.kind !== "SUBSTITUTED") return true;
    const k = key(words[e.i] ?? "");
    if (!names.has(k)) return true;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/**
 * r4 (retries): the browser sends one id per recording (crypto.randomUUID) with every retry. The first request
 * claims it (a unique row: RateLimitBucket key, the codebase's create-or-lose guard); a retry of a reading already
 * scored gets the stored result back — no new scoring, no trial, no daily attempt, no averaging.
 */
const REQ_PREFIX = "fluency-req:";
/**
 * the request ids (and per-day check slots) being worked on in THIS process (one server instance): a claim row whose
 * key is not here belongs to a request that died (e.g. an out-of-memory restart) and may be taken again at once
 */
const scoringNow = new Set<string>();
const slotsNow = new Set<string>();
const recentResults = new Map<string, CoachResult>();
const RECENT_MAX = 60;
function rememberResult(k: string, r: CoachResult) { recentResults.delete(k); recentResults.set(k, r); while (recentResults.size > RECENT_MAX) recentResults.delete(recentResults.keys().next().value as string); }
export const cleanRequestId = (v: unknown): string | null => { const x = s(v).trim(); return /^[A-Za-z0-9-]{8,64}$/.test(x) ? x : null; };

/** Creates a unique row; false when it already exists (also when two requests race: the loser's insert fails). */
async function claimRow(repo: Repo, key: string, now: Date): Promise<boolean> {
  if (await repo.findUnique("RateLimitBucket", { key })) return false;
  try { await repo.create("RateLimitBucket", { key, count: 0, windowStart: now }); return true; }
  catch (e) { if (await repo.findUnique("RateLimitBucket", { key })) return false; throw e; }
}

/** Gives back one use of a daily limit (a reading that could not be scored). */
export async function refundRateLimit(repo: Repo, key: string): Promise<void> {
  const b = await repo.findUnique("RateLimitBucket", { key });
  if (b && Number(b.count) > 0) await repo.updateMany("RateLimitBucket", { key }, { count: Number(b.count) - 1 });
}

/** The first model's share of the time when backup models may follow (the rest is kept for them). */
export const FIRST_MODEL_MS = 55_000;
const MIN_BACKUP_MS = 15_000;
/**
 * at least this much voice (seconds, measured on the device) before a "nothing heard" reply is checked by the other
 * models (and the listener is told a voice is there) — about one short sentence
 */
export const SECOND_OPINION_VOICED_S = 0.6;

/**
 * The configured model, then the steadier ones (gemini-2.5-flash, then gemini-2.5-flash-lite), all within the one
 * time limit under the hosting proxy. A backup is tried when a model is busy (5xx), missing, refuses audio, gives no
 * usable answer twice, or runs out of time while time is left.
 */
async function scoreWithFallback(a: { repo: Repo; schoolId: string; env: EnvLike; model: string; scorer: AudioScorer; own: boolean; fetchImpl?: typeof fetch; started: number; voiced?: number; attempt?: number; input: Parameters<AudioScorer>[0] }): Promise<ReadingMarks> {
  const deadline = a.started + FLUENCY_TIMEOUT_MS;
  let backups = a.own ? FLUENCY_FALLBACK_MODELS.filter((x) => x !== a.model) : [];
  // the page sends the same recording again after "heard but unclear": this time another model listens first
  const rotate = (a.attempt ?? 0) > 0 && backups.length > 0;
  const firstModel = rotate ? backups[0] : a.model;
  if (rotate) backups = [...backups.slice(1), a.model];
  const first = backups.length ? geminiAudioScorer(rotate ? { ...a.env, GEMINI_MODEL: firstModel } : a.env, a.fetchImpl, { timeoutMs: FIRST_MODEL_MS }) ?? a.scorer : a.scorer;
  let last: unknown;
  try {
    const m = await first(a.input);
    // 🎙 second opinions: the coach heard "nothing" but the device measured a voice → each other model listens in
    // turn (while time is left) before the student is told anything
    if (m.lastWordIndex < 0 && (a.voiced ?? 0) >= SECOND_OPINION_VOICED_S) {
      for (const fb of backups) {
        if (deadline - Date.now() < MIN_BACKUP_MS) break;
        const backup = geminiAudioScorer({ ...a.env, GEMINI_MODEL: fb }, a.fetchImpl, { timeoutMs: deadline - Date.now() });
        if (!backup) break;
        try { const m2 = await backup(a.input); if (m2.lastWordIndex >= 0) { await a.repo.create("AiRequestLog", { schoolId: a.schoolId, tool: "fluency", provider: "gemini", model: a.model, ok: true, items: 1, ms: Date.now() - a.started, error: `${firstModel} heard nothing although the device measured ${Math.round((a.voiced ?? 0) * 10) / 10} s of voice -> second opinion from ${fb}`, createdAt: new Date() }); return m2; } }
        catch { /* try the next model; the first answer stands at the end */ }
      }
    }
    return m;
  } catch (e) { last = e; }
  for (const fb of backups) {
    const e0 = last;
    const retryable = e0 instanceof CoachProviderError && (e0.kind === "DOWN" || e0.kind === "INVALID" || e0.kind === "TIMEOUT" || (e0.kind === "CONFIG" && e0.status === 404) || (e0.kind === "REQUEST" && /model|not supported|audio/i.test(e0.message)));
    const left = deadline - Date.now();
    if (!retryable || left < MIN_BACKUP_MS) break;
    const backup = geminiAudioScorer({ ...a.env, GEMINI_MODEL: fb }, a.fetchImpl, { timeoutMs: left });
    if (!backup) break;
    await a.repo.create("AiRequestLog", { schoolId: a.schoolId, tool: "fluency", provider: "gemini", model: a.model, ok: false, items: 1, ms: Date.now() - a.started, error: `${s((e0 as Error).message).slice(0, 400)} -> retried with ${fb}`, createdAt: new Date() });
    try { return await backup(a.input); } catch (e) { last = e; }
  }
  throw last;
}

export interface ScoreInput {
  /** r4: one id per recording (crypto.randomUUID in the browser), sent with every retry of the same recording */
  requestId?: string;
  /** r4: the API route already reserved this recording's bytes (reserveFluencyBytes) before reading the body */
  reserved?: boolean;
  key: string; mode: CoachMode; seconds: number; audio: Uint8Array; mime: string; /** seconds of voice the student's device measured in the recording (a second opinion is asked when the coach hears nothing) */ voiced?: number; kind?: PracticeKind; sentence?: number; grid?: unknown; /** a practice re-read of this earlier reading (not stored, not counted) */ rereadOf?: string; /** 1+: the page sends the same recording again after "heard but unclear" (another model listens first) */ attempt?: number }

/**
 * Scores one recording. The school's AI limits are kept: when the provider needs a pause, the reply says how long
 * to wait and the page sends the same recording again by itself (a queue, without storing the audio).
 */
export type ScoreReply = { status: "OK"; result: CoachResult } | { status: "WAIT"; seconds: number; reason: string; timeout?: boolean };
export async function scoreReading(repo: Repo, actor: Actor, input: ScoreInput, env: EnvLike, deps: { scorer?: AudioScorer | null; fetchImpl?: typeof fetch } = {}, now = new Date()): Promise<ScoreReply> {
  const reqId = cleanRequestId(input.requestId);
  if (!reqId) return scoreFresh(repo, actor, input, env, deps, now, null);
  await studentGrade(repo, actor);
  const reqKey = `${REQ_PREFIX}${actor.studentId}:${reqId}`;
  // the first request with this id is still being scored in this process: wait, then ask again (its result comes back).
  // Checked and set without an await in between, so two requests here can never both score it.
  if (scoringNow.has(reqKey)) return { status: "WAIT", seconds: FLUENCY_BUSY_SECONDS, reason: "Your reading is still being scored. Your result is next." };
  scoringNow.add(reqKey);
  try {
    const prior = await repo.findUnique("RateLimitBucket", { key: reqKey });
    if (prior) {
      if (Number(prior.count) >= 1) {
        // already scored: the same result again — no scoring, no trial, no daily attempt, no averaging
        const cached = recentResults.get(reqKey);
        if (cached) return { status: "OK", result: cached };
        const row = await storedReading(repo, actor.studentId!, reqId);
        if (row) return { status: "OK", result: await resultFromRow(repo, actor, row) };
        // scored but never stored (a practice re-read) and forgotten (a restart): it is scored again below
      }
      // count 0 and not in scoringNow: the request that claimed it died (a restart) — it is scored now
      await repo.updateMany("RateLimitBucket", { key: reqKey }, { count: 0, windowStart: now });
    } else await claimRow(repo, reqKey, now);
    let r: ScoreReply;
    try { r = await scoreFresh(repo, actor, input, env, deps, now, reqId); }
    catch (e) { await repo.deleteMany("RateLimitBucket", { key: reqKey }).catch(() => 0); throw e; }
    if (r.status !== "OK") { await repo.deleteMany("RateLimitBucket", { key: reqKey }).catch(() => 0); return r; }
    rememberResult(reqKey, r.result);
    await repo.updateMany("RateLimitBucket", { key: reqKey }, { count: 1 }).catch(() => 0);
    return r;
  } finally { scoringNow.delete(reqKey); }
}

/** The stored reading made from this recording id (the newest 30 readings of the student). */
async function storedReading(repo: Repo, studentId: string, reqId: string): Promise<Row | null> {
  const rows = await repo.findMany("FluencyPractice", { studentId }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 30 });
  return rows.find((r) => json<{ requestId?: unknown } | null>(r.plan, null)?.requestId === reqId) ?? null;
}

/** A stored reading as a result (a retry after the server forgot the first answer): the same numbers and marks. */
async function resultFromRow(repo: Repo, actor: Actor, row: Row): Promise<CoachResult> {
  const grade = await studentGrade(repo, actor);
  const storedMode: CoachMode = s(row.mode) === "MINUTE" ? "MINUTE" : "PASSAGE";
  const kind = clampKind(row.practiceKind, storedMode);
  const errs = json<{ i: number; word?: string; heard?: string; kind?: string }[]>(row.errors, []);
  let words: string[] = [];
  if (s(row.passageKey) !== "DRILL" && kind !== "ECHO") {
    const p = (await passagesFor(repo, s(actor.schoolId), grade)).find((x) => x.key === s(row.passageKey));
    if (p) words = passageWords(p.body, kind === "MINUTE" ? "MINUTE" : storedMode);
  }
  const last = Number(row.wordsRead) - 1;
  const byI = new Map(errs.map((e) => [Number(e.i), e]));
  const marked: MarkedWord[] = words.length
    ? words.map((w, i) => { const e = byI.get(i); return { text: w, mark: i > last ? "NOT_READ" : e ? (s(e.kind) as ErrorKind) : "OK", heard: e ? s(e.heard) : "" }; })
    : errs.map((e) => ({ text: s(e.word), mark: s(e.kind) as ErrorKind, heard: s(e.heard) }));
  const season = fluencySeason(d(row.createdAt) ?? new Date());
  const wcpm = Number(row.wcpm);
  const official = row.level !== null && row.level !== undefined && s(row.level) !== "";
  const level: Level = official ? (s(row.level) as Level) : fluencyLevel(wcpm, grade, season);
  const pj = json<Record<string, unknown> | null>(row.prosody, null);
  const reasons = json<Record<string, string>>(pj?.reasons, {});
  const prosody = pj ? validateProsody(Object.fromEntries(PROSODY_TRAITS.map((t) => [t, typeof pj[t] === "number" ? { score: pj[t], reason: s(reasons[t]) } : null]))) : null;
  const planJ = json<(CoachPlan & { quiz?: unknown; requestId?: unknown }) | null>(row.plan, null);
  const plan: CoachPlan = planJ && Array.isArray(planJ.steps) ? (({ quiz: _q, requestId: _r, ...rest }) => rest as CoachPlan)(planJ) : { level, goal: wcpm + 1, nextCheck: "", perWeek: 0, steps: [], words: [], patterns: [], nextPassageKey: null, growth: null };
  const errWords = [...new Set(errs.map((e) => s(e.word)).filter((w) => w.length > 1))];
  return {
    id: s(row.id), mode: storedMode, kind, title: s(row.title), passageKey: s(row.passageKey), words: marked,
    wordsRead: Number(row.wordsRead), wordsCorrect: Number(row.wordsCorrect), seconds: Number(row.seconds), wcpm, accuracy: Number(row.accuracy),
    expression: row.expression === null || row.expression === undefined ? null : Number(row.expression),
    level, official, rubric: fluencyRubricText(grade, season), patterns: json<string[]>(row.patterns, []), practise: errWords, plan,
    date: (d(row.createdAt) ?? new Date()).toISOString().slice(0, 10), norm: normView(grade, wcpm, season), prosody,
    hesitations: Number(row.hesitations ?? 0), tips: tipsFor(errs.map((e) => ({ word: s(e.word), heard: s(e.heard) }))),
    average: null, trial: row.trial === null || row.trial === undefined ? null : Number(row.trial), trials: [], nextGoal: null, drill: null, echo: null,
    ...(kind === "MINUTE" && !official ? { notice: SHORT_MINUTE_NOTICE } : {}),
  };
}

async function scoreFresh(repo: Repo, actor: Actor, input: ScoreInput, env: EnvLike, deps: { scorer?: AudioScorer | null; fetchImpl?: typeof fetch }, now: Date, reqId: string | null): Promise<ScoreReply> {
  const grade = await studentGrade(repo, actor);
  const schoolId = s(actor.schoolId);
  if (!(await coachSettings(repo, schoolId)).enabled) throw new ValidationError("The Fluency Coach is switched off by the school.");
  if (input.mode !== "MINUTE" && input.mode !== "PASSAGE") throw new ValidationError("Choose the 1-minute check or the whole passage.");
  // a practice re-read: the same passage and the same words as the first read, scored but never stored or counted
  let first: Row | null = null;
  if (input.rereadOf) {
    first = await repo.findUnique("FluencyPractice", { id: String(input.rereadOf) });
    if (!first || s(first.studentId) !== actor.studentId) throw new ForbiddenError("Reading not found.");
    const k0 = clampKind(first.practiceKind, s(first.mode) === "MINUTE" ? "MINUTE" : "PASSAGE");
    if (k0 === "ECHO" || k0 === "DRILL") throw new ValidationError("This reading cannot be read again for practice.");
  }
  const practiceRead = first !== null;
  const kind: PracticeKind = practiceRead ? "PASSAGE" : clampKind(input.kind, input.mode);
  const mode: CoachMode = practiceRead ? (s(first!.mode) === "MINUTE" ? "MINUTE" : "PASSAGE") : kind === "MINUTE" ? "MINUTE" : "PASSAGE";
  const key = practiceRead ? s(first!.passageKey) : input.key;
  if (!input.audio.length) throw new ValidationError("The recording is empty. Check the microphone and read again.");
  if (input.audio.length > MAX_AUDIO_BYTES) throw new ValidationError("The recording is too long.");
  if (!geminiAudioMime(input.mime, input.audio)) throw new ValidationError("This recording type is not supported.");
  if (!(input.seconds >= (kind === "ECHO" ? 1 : 3))) throw new ValidationError("Read for a few seconds at least, then stop.");
  // r4: the server does not trust the browser's `seconds` for the score: a WAV's own length wins when it is shorter
  // (used for the WCPM and for "official or practice"; the quick check above only stops an empty Stop)
  const dur = readingSeconds(input.audio, input.seconds);
  const all = await passagesFor(repo, schoolId, grade);
  const official0 = await latestOfficial(repo, actor.studentId!, grade);

  // what was read: a passage (or one of its sentences), or the drill grid
  let p: (CoachPassage & { body: string }) | null = null;
  let words: string[]; let grid: DrillGrid | null = null; let echo: CoachResult["echo"] = null; let trial: number | null = null;
  let earlier: Row[] = [];
  if (kind === "DRILL") {
    grid = validateGrid(input.grid, (await ownErrors(repo, actor.studentId!)).words);
    if (!grid) throw new ValidationError("This drill is not valid. Open the drill again.");
    words = gridWords(grid);
  } else {
    p = all.find((x) => x.key === key) ?? null;
    if (!p) throw new ForbiddenError("Passage not found.");
    if (mode === "MINUTE" && p.words < MINUTE_MIN_WORDS) throw new ValidationError(MINUTE_TOO_SHORT);
    words = passageWords(p.body, mode);
    if (kind === "ECHO") {
      const ss = sentences(words), k = Number(input.sentence);
      if (!Number.isInteger(k) || k < 0 || k >= ss.length) throw new ValidationError("Choose a sentence of the passage.");
      echo = { sentence: k, sentences: ss.length };
      words = words.slice(ss[k].from, ss[k].to + 1);
    }
    if (kind === "REPEATED" || kind === "PHRASED") {
      if (kind === "REPEATED" && !repeatedOffered(official0?.level ?? null)) throw new ValidationError("You already read above your grade level — repeated reading is not needed. Try wider reading: a new, harder passage.");
      earlier = (await repo.findMany("FluencyPractice", { studentId: actor.studentId, passageKey: p.key, practiceKind: kind }, { select: ["wcpm", "trial", "createdAt"] })).sort((a, b) => (d(a.createdAt)?.getTime() ?? 0) - (d(b.createdAt)?.getTime() ?? 0));
      trial = earlier.length + 1;
      if (kind === "REPEATED" && trial > REPEATED_MAX_TRIALS) throw new ValidationError("You read this passage 5 times — well done! Choose a new passage.");
    }
  }
  const scorer = deps.scorer === undefined ? geminiAudioScorer(env, deps.fetchImpl) : deps.scorer;
  if (!scorer) throw new ValidationError("The Fluency Coach needs the school's Gemini key (GEMINI_API_KEY). Ask the admin.");
  // the school's AI limits (shared with the other AI tools), and a daily limit per student
  const settings = await aiSettings(repo, schoolId);
  if (settings.provider === "off") throw new ValidationError("The AI tools are switched off by the school.");
  const rs = await rateState(repo, schoolId, settings, now);
  if (rs.waitMs > 0) return { status: "WAIT", seconds: Math.ceil(rs.waitMs / 1000), reason: rs.reason ?? "Many students are reading right now. Your result is next." };
  // this server holds a limited amount of audio at a time (by bytes): the rest wait a moment, in order. The API route
  // reserves before reading the body (input.reserved); a direct call reserves here.
  const lease = input.reserved ? null : reserveFluencyBytes(input.audio.length);
  if (!input.reserved && !lease) return { status: "WAIT", seconds: FLUENCY_BUSY_SECONDS, reason: FLUENCY_BUSY_REASON };
  const limitKey = kind === "ECHO" ? `fluency-echo:${actor.userId}` : `fluency:${actor.userId}`;
  const mine = await consumeRateLimit(repo, limitKey, kind === "ECHO" ? ECHO_PER_DAY : COACH_PER_DAY, 86_400_000, now).catch((e) => { lease?.release(); throw e; });
  if (!mine.allowed) { lease?.release(); throw new ValidationError("That is a lot of reading today — well done! Come back tomorrow."); }
  // a reading that could not be scored does not count toward the student's daily limit
  const refund = () => refundRateLimit(repo, limitKey).catch(() => undefined);
  const started = Date.now();
  const model = fluencyModel(env).slice(0, 80);
  let marks: ReadingMarks;
  const task = kind === "ECHO" ? "ECHO" : kind === "DRILL" ? "DRILL" : "READ";
  try {
    try { marks = await scoreWithFallback({ repo, schoolId, env, model, scorer, own: deps.scorer === undefined, fetchImpl: deps.fetchImpl, started, voiced: input.voiced, attempt: input.attempt, input: { words, audio: input.audio, mime: input.mime, task, voiced: input.voiced ?? 0 } }); }
    catch (e) {
      await refund();
      const m = s((e as Error)?.message);
      const kindOf: CoachFailureKind | null = e instanceof CoachProviderError ? e.kind : /RATE_LIMIT|429/.test(m) ? "RATE_LIMIT" : null;
      // the real reason goes to the AI log (admins see it under AI Tools → Log): never the audio, never a name
      await repo.create("AiRequestLog", { schoolId, tool: "fluency", provider: "gemini", model, ok: false, items: 1, ms: Date.now() - started, error: m.slice(0, 500) || "unknown error", createdAt: new Date() });
      if (kindOf === "RATE_LIMIT") return { status: "WAIT", seconds: 60, reason: "The AI provider asked us to slow down. Your result is next." };
      if (kindOf === "TIMEOUT") return { status: "WAIT", seconds: 15, reason: "The coach is taking longer than usual to listen. It will try again by itself.", timeout: true };
      if (kindOf === "DOWN") return { status: "WAIT", seconds: 20, reason: "Many schools are using the coach right now. It will try again by itself.", timeout: true };
      if (kindOf === "CONFIG") {
        await notifyCoachProblem(repo, schoolId, m, now).catch(() => 0);
        throw new ValidationError("The Fluency Coach is not set up correctly. Your teacher has been told.");
      }
      throw new ValidationError(SCORING_FAILED);
    }
  } finally { lease?.release(); }
  await repo.create("AiRequestLog", { schoolId, tool: "fluency", provider: "gemini", model, ok: true, items: 1, ms: Date.now() - started, error: null, createdAt: new Date() });
  // a fake or older scorer may skip the checks: run the reply through the validator once more
  const v = validateMarks(marks, words.length);
  if (!v.ok) { await refund(); throw new ValidationError(SCORING_FAILED); }
  marks = { ...v.value, ...(marks.heardWords !== undefined ? { heardWords: marks.heardWords } : {}) };
  if (marks.lastWordIndex < 0) {
    await refund();
    // the coach heard speech, but not this passage; or it heard no reading at all (the only "could not hear")
    if ((marks.heardWords ?? 0) > 0) throw new ValidationError("The coach heard you, but not the words of this passage. Start from the first word on the screen and read it aloud.");
    // the device measured a voice: the student did speak — never "we could not hear you": the page listens again
    // to the same recording (another model first), then asks for a clearer reading, not a microphone check
    if ((input.voiced ?? 0) >= SECOND_OPINION_VOICED_S) throw new NotHeardError(HEARD_UNCLEAR, "HEARD_UNCLEAR");
    throw new NotHeardError();
  }
  if (kind === "DRILL") marks = { ...marks, expression: null, prosody: null };
  // r4: a mispronounced proper name is one error for the whole passage (the prompt says so; the server makes sure)
  if (task === "READ") marks = { ...marks, errors: onePerName(words, marks.errors) };

  const season = fluencySeason(now);
  // r4: the reading's time: the smaller of the audio's own length and the browser's value, never faster than a
  // plausible reader (MAX_PLAUSIBLE_WCPM) — a forged or broken `seconds` cannot inflate the WCPM
  const secs = Math.max(dur.seconds, ((marks.lastWordIndex + 1) * 60) / MAX_PLAUSIBLE_WCPM);
  const drill = grid ? { ...scoreDrill(grid, marks, secs), grid } : null;
  const n = drill ? { wordsRead: drill.wordsRead, wordsCorrect: drill.wordsCorrect, seconds: drill.seconds, wcpm: drill.wcpm, accuracy: drill.wordsRead ? Math.round((100 * drill.wordsCorrect) / drill.wordsRead) : 0 }
    : countReading(words, marks, kind === "ECHO" ? Math.min(ECHO_MAX_SECONDS, secs) : secs, mode);
  const level = fluencyLevel(n.wcpm, grade, season);
  // r4: official only after (about) the whole minute, or when the whole passage was read; an early Stop is practice
  const finished = marks.lastWordIndex >= words.length - 1;
  const minuteTry = kind === "MINUTE" && !practiceRead;
  const official = minuteTry && (secs >= OFFICIAL_MIN_SECONDS || finished);
  const shortMinute = minuteTry && !official;
  /** a 1-minute check stopped early is stored as a passage reading (no level, never a minute reading in the reports) */
  const storedMode: CoachMode = shortMinute ? "PASSAGE" : mode;
  const norm = normView(grade, n.wcpm, season);
  const errWords = [...new Set(marks.errors.map((e) => clean(words[e.i])).filter((w) => w.length > 1))];
  const storedErrors = marks.errors.map((e) => { const w = clean(words[e.i]); return { i: e.i, word: w, heard: e.heard, kind: e.kind, pattern: patternForError(w, marks.patterns), arabic: arabicTags(w, e.heard) }; });
  const tips = tipsFor(storedErrors);
  const prosody = marks.prosody ?? null;

  // every word with its mark, and the notes that are not errors (a self-correction, a repetition, an extra word)
  const byIndex = new Map(marks.errors.map((e) => [e.i, e]));
  const noteAt = new Map((marks.notes ?? []).map((x) => [x.i, x]));
  const marked: MarkedWord[] = words.map((w, i) => {
    const e = byIndex.get(i), nt = noteAt.get(i);
    return { text: w, mark: i > marks.lastWordIndex ? "NOT_READ" : e ? e.kind : "OK", heard: e?.heard ?? "", ...(nt ? { note: nt.kind, ...(nt.kind === "INSERTION" && nt.heard ? { inserted: nt.heard } : {}) } : {}) };
  });
  // the student's earlier readings (only the columns needed, newest first, one page): growth on this text and the plan
  const history = p && kind !== "ECHO" ? await repo.findMany("FluencyPractice", { studentId: actor.studentId }, { select: ["passageKey", "practiceKind", "mode", "wcpm", "accuracy", "expression", "prosody", "trial", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 40 }) : [];
  const prevSame = practiceRead ? first : p ? history.find((r) => s(r.passageKey) === p!.key && !["ECHO", "DRILL"].includes(s(r.practiceKind))) ?? null : null;
  const edges = bandEdges(grade, season);
  const feedback = feedbackSummary({
    words: marked, wcpm: n.wcpm, accuracy: n.accuracy, expression: marks.expression, prosody, p25: edges?.below ?? null, p50: edges?.p50 ?? null, task,
    previous: prevSame ? { wcpm: Number(prevSame.wcpm), accuracy: Number(prevSame.accuracy), date: day(prevSame.createdAt) } : null,
  });

  // repeated / phrased trials: every trial's WCPM and the stretch goal for the next one
  const p50 = norm.p50;
  const trials: CoachResult["trials"] = [];
  if (trial !== null) {
    let prev: number | null = null;
    for (const [k, r] of earlier.entries()) { trials.push({ trial: k + 1, wcpm: Number(r.wcpm), goal: prev === null ? null : trialGoal(prev, p50) }); prev = Number(r.wcpm); }
    trials.push({ trial, wcpm: n.wcpm, goal: prev === null ? null : trialGoal(prev, p50) });
  }
  const nextGoal = trial !== null && (kind !== "REPEATED" || trial < REPEATED_MAX_TRIALS) ? trialGoal(n.wcpm, p50) : null;

  const emptyPlan: CoachPlan = { level, goal: n.wcpm + 1, nextCheck: "", perWeek: 0, steps: [], words: errWords, patterns: marks.patterns, nextPassageKey: null, growth: null };
  if (practiceRead) {
    // practice only: nothing is written (no reading, no check), so the level, the reports and the norms never see it
    return {
      status: "OK",
      result: {
        id: "", mode, kind, title: p!.title, passageKey: p!.key,
        words: marked, feedback,
        ...n, expression: marks.expression, level, official: false, rubric: fluencyRubricText(grade, season), patterns: marks.patterns, practise: errWords, plan: emptyPlan, date: now.toISOString().slice(0, 10),
        norm, prosody, hesitations: marks.hesitations?.length ?? 0, tips, average: null, trial: null, trials: [], nextGoal: null, drill: null, echo: null,
        practice: true, improvement: improvementOf({ wcpm: Number(first!.wcpm), accuracy: Number(first!.accuracy) }, n),
      },
    };
  }

  // the official 1-minute check joins Reading Fluency (and from there every report); two the same day → the average
  let average: CoachResult["average"] = null;
  if (official) {
    const today = riyadhDay(now);
    // r4: two requests at the same moment must not both create "the first check" (or both average): each of the
    // day's two official slots is claimed once (a unique row, the codebase's create-or-lose guard); the loser looks
    // again a moment later (the winner's check is then there) and takes the next slot, or stays a reading
    // A claim is real only while the check it stands for exists (slot 1: a check today; slot 2: the averaged check):
    // `want` is computed from the checks just read, so a claim that is taken although its check is missing is either
    // being written right now in this process (slotsNow: wait and look again) or left over (a failed write, a
    // restart, a check the teacher deleted): it is released and claimed again.
    let todays: Row[] = [], first: Row | undefined, slot = 0, slotKey = "";
    for (let tryNo = 0; tryNo < 4 && !slot; tryNo++) {
      if (tryNo) await new Promise((ok) => setTimeout(ok, 250 * tryNo));
      todays = (await repo.findMany("FluencyCheck", { studentId: actor.studentId, source: "COACH" })).filter((c) => riyadhDay(c.checkedAt) === today);
      first = todays.find((c) => !/average of 2/i.test(s(c.note)));
      const want = !todays.length ? 1 : first && todays.length === 1 ? 2 : 0;
      if (!want) break;
      const k = `fluency-check:${actor.studentId}:${today}:${want}`;
      if (slotsNow.has(k)) continue;   // another reading in this process is writing it: look again in a moment
      slotsNow.add(k);
      let got = await claimRow(repo, k, now).catch(() => false);
      if (!got) { await repo.deleteMany("RateLimitBucket", { key: k }).catch(() => 0); got = await claimRow(repo, k, now).catch(() => false); }
      if (got) { slot = want; slotKey = k; } else slotsNow.delete(k);
    }
    try {
    if (slot === 2 && first) {
      const reads = [Number(first.wcpm), n.wcpm];
      const avg = averageReads(reads);
      const v2 = normView(grade, avg, season);
      await repo.updateMany("FluencyCheck", { id: first.id }, { wcpm: avg, accuracy: Math.round((Number(first.accuracy ?? n.accuracy) + n.accuracy) / 2), note: `Fluency Coach · average of 2 cold reads (${reads.join(" and ")} WCPM): ${p!.title}`.slice(0, 500), season, percentile: v2.percentile, prosody: prosodyScores(prosody) ?? first.prosody ?? null, checkedAt: now });
      average = { reads, wcpm: avg };
    } else if (slot === 1) {
      await repo.create("FluencyCheck", { studentId: actor.studentId, wcpm: n.wcpm, accuracy: n.accuracy, note: `Fluency Coach: ${p!.title}`.slice(0, 500), source: "COACH", checkedById: null, checkedAt: now, season, percentile: norm.percentile, prosody: prosodyScores(prosody), comprehension: null });
    }
    } catch (e) {
      // the check was not written: the slot is released so the next reading can take it
      if (slotKey) await repo.deleteMany("RateLimitBucket", { key: slotKey }).catch(() => 0);
      throw e;
    } finally { if (slotKey) slotsNow.delete(slotKey); }
    // a third check on the same day is kept as a reading; the day's official score stays the average of two
  }

  // the plan (passage readings only; a practice re-read keeps the plan of the first read)
  let plan: CoachPlan | null = null;
  if (p && kind !== "ECHO") {
    const sameLevel = all.filter((x) => x.level === p!.level && x.key !== p!.key);
    const harder = all.filter((x) => (p!.lexile && x.lexile ? x.lexile > p!.lexile : x.grade > p!.grade || (x.level === "ABOVE" && p!.level !== "ABOVE")));
    const easier = all.filter((x) => (p!.lexile && x.lexile ? x.lexile < p!.lexile : x.grade < p!.grade || (x.level === "BELOW" && p!.level !== "BELOW")));
    // r4: the 1-minute check is offered only on passages long enough for a whole minute
    const longs = all.filter((x) => x.words >= MINUTE_MIN_WORDS);
    const minuteNew = longs.find((x) => x.key !== p!.key && x.level === p!.level) ?? longs.find((x) => x.key !== p!.key) ?? null;
    const minuteNext = p.words >= MINUTE_MIN_WORDS ? p.key : minuteNew?.key ?? null;
    plan = makePlan({ level: official ? level : official0?.level ?? level, wcpm: official ? n.wcpm : official0?.wcpm ?? n.wcpm, expression: marks.expression, grade, words: errWords, patterns: marks.patterns, passageKey: p.key, nextKey: { same: p.key, harder: harder[0]?.key ?? null, another: sameLevel[0]?.key ?? null, minute: minuteNext }, phrasing: prosody?.phrasing?.score ?? null }, now);
    const repeatedOk = repeatedOffered(official0?.level ?? (official ? level : null));
    if (!repeatedOk) plan.steps = plan.steps.map((st) => (/repeated reading/.test(st.text) ? { icon: "🚀", text: "Wider reading: choose a new, harder passage this week.", href: "/student/fluency-coach" } : st));
    // 🧭 the remedial plan: the previous one reviewed with this reading (goal met → raised; no growth → new methods), or a new one
    const current: ReadingEvidence = { date: now.toISOString(), kind, wcpm: n.wcpm, accuracy: n.accuracy, prosody: prosodyMean(prosodyScores(prosody), marks.expression), trial };
    plan.remedial = await remedialAfter(repo, actor.studentId!, grade, history, current, {
      words: feedback.practise.map((x) => x.word.toLowerCase()).concat(errWords).filter((w, i, a) => a.indexOf(w) === i), patterns: marks.patterns,
      links: { same: p.key, easier: easier[easier.length - 1]?.key ?? null, harder: harder[0]?.key ?? null, another: sameLevel[0]?.key ?? null, minute: minuteNew?.key ?? minuteNext },
    }, repeatedOk, now);
  }
  const row = await repo.create("FluencyPractice", {
    studentId: actor.studentId, mode: storedMode, passageKey: p ? p.key : "DRILL", title: (p ? (kind === "ECHO" ? `Echo · ${p.title}` : p.title) : "Speed drill").slice(0, 191), lexile: p?.lexile ?? null, wordsRead: n.wordsRead, wordsCorrect: n.wordsCorrect, seconds: n.seconds, wcpm: n.wcpm, accuracy: n.accuracy,
    expression: marks.expression, level: official ? level : null, errors: storedErrors, patterns: drill ? drill.reteach : marks.patterns,
    // r4: the recording's id rides with the reading (no new column): a retry finds it and gets this result back
    plan: reqId ? { ...(plan ?? {}), requestId: reqId } : plan,
    prosody: prosody ? { ...prosodyScores(prosody), reasons: Object.fromEntries(PROSODY_TRAITS.map((t) => [t, prosody[t]?.reason ?? ""])) } : null,
    hesitations: marks.hesitations?.length ?? 0, comprehension: null, practiceKind: kind, trial, percentile: official ? norm.percentile : null, createdAt: now,
  });
  return {
    status: "OK",
    result: {
      id: s(row.id), mode, kind, title: p ? p.title : "Speed drill", passageKey: p ? p.key : "DRILL",
      words: marked, feedback,
      ...n, expression: marks.expression, level, official, rubric: fluencyRubricText(grade, season), patterns: marks.patterns, practise: errWords, plan: plan ?? emptyPlan, date: now.toISOString().slice(0, 10),
      norm: average ? normView(grade, average.wcpm, season) : norm, prosody, hesitations: marks.hesitations?.length ?? 0, tips, average, trial, trials, nextGoal, drill, echo,
      ...(shortMinute ? { notice: SHORT_MINUTE_NOTICE } : {}),
    },
  };
}

// ------------------------------------------------------------------ the student's page

export interface CoachHome {
  enabled: boolean; ready: boolean; grade: number; rubric: string; bands: { below: number; above: number };
  passages: CoachPassage[]; recommended: string | null;
  /** r4: the passage for the 1-minute check — the recommended one when it is long enough (MINUTE_MIN_WORDS), else the nearest long-enough one; null when none */
  recommendedMinute: string | null;
  /** r4: the latest OFFICIAL check (FluencyCheck, teacher checks included) — the same number every page shows */
  latest: { wcpm: number; level: Level; date: string } | null;
  plan: (CoachPlan & { date: string }) | null;
  history: { id: string; mode: CoachMode; kind: PracticeKind; title: string; wcpm: number; accuracy: number; level: Level | null; comprehension: number | null; date: string }[];
  checks: { wcpm: number; date: string }[];
  /** the season now, and the latest official score on the norms */
  season: Season; norm: NormView | null;
  /** official checks over time with the 50th percentile of each check's season (for the progress chart) */
  progress: { date: string; wcpm: number; p50: number | null; percentile: number | null; season: Season }[];
  prosody: { phrasing: number | null; smoothness: number | null; pace: number | null; intonation: number | null; reasons: Record<string, string>; date: string } | null;
  goal: CoachPlan["growth"];
  tips: (ArabicTip & { words: string[] })[];
  comprehension: { pct: number; date: string } | null;
  fastNotUnderstanding: boolean;
  /** repeated reading is not offered to students already Above (wider reading instead) */
  repeatedOffered: boolean;
  officialLevel: Level | null;
  /** the student's remedial plan, reviewed today (a check due, on track…) — shown in friendly words */
  remedial: RemedialPlan | null;
}
export async function coachHome(repo: Repo, actor: Actor, env: EnvLike, now = new Date()): Promise<CoachHome> {
  const grade = await studentGrade(repo, actor);
  const schoolId = s(actor.schoolId);
  const [{ enabled }, all, lex, practice, checkRows] = await Promise.all([
    coachSettings(repo, schoolId), passagesFor(repo, schoolId, grade), repo.findUnique("StudentReadingLexile", { studentId: actor.studentId }),
    repo.findMany("FluencyPractice", { studentId: actor.studentId }, { select: ["id", "mode", "practiceKind", "title", "wcpm", "accuracy", "level", "plan", "createdAt", "prosody", "errors", "comprehension", "expression", "trial"] }),
    repo.findMany("FluencyCheck", { studentId: actor.studentId }),
  ]);
  const passages = all.map(({ body: _b, ...x }) => x);
  const mine = practice.sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0));
  const minute = mine.filter((x) => s(x.mode) === "MINUTE");
  const lexile = lex ? Number(lex.lexile) : null;
  const ofGrade = passages.filter((x) => x.grade === grade);
  const planOf = (r: Row | undefined) => { const pl = json<(CoachPlan & { quiz?: unknown; requestId?: unknown }) | null>(r?.plan, null); if (!pl || !Array.isArray(pl.steps)) return null; const { quiz: _q, requestId: _r, ...rest } = pl; return rest as CoachPlan; };
  const planRow = mine.find((x) => planOf(x));
  const lastPlan = planOf(planRow);
  const recommended = (lastPlan?.nextPassageKey && passages.some((x) => x.key === lastPlan.nextPassageKey) ? lastPlan.nextPassageKey
    : lexile !== null ? [...passages].filter((x) => x.lexile !== null).sort((a, b) => Math.abs(a.lexile! - lexile) - Math.abs(b.lexile! - lexile))[0]?.key
    : (ofGrade.find((x) => x.level === (minute[0] ? s(minute[0].level) : "ON")) ?? ofGrade[0] ?? passages[0])?.key) ?? null;
  const longEnough = (x: CoachPassage) => x.words >= MINUTE_MIN_WORDS;
  const recP = passages.find((x) => x.key === recommended);
  const recommendedMinute = recP && longEnough(recP) ? recP.key
    : ([...passages].filter(longEnough).sort((a, b) => Math.abs(a.grade - grade) - Math.abs(b.grade - grade) || (lexile !== null && a.lexile !== null && b.lexile !== null ? Math.abs(a.lexile - lexile) - Math.abs(b.lexile - lexile) : 0))[0]?.key ?? null);
  const season = fluencySeason(now);
  const checks = checkRows.sort((a, b) => (d(a.checkedAt)?.getTime() ?? 0) - (d(b.checkedAt)?.getTime() ?? 0));
  const seasonOf = (c: Row): Season => (isSeason(c.season) ? (c.season as Season) : fluencySeason(d(c.checkedAt) ?? now));
  const progress = checks.slice(-12).map((c) => { const se = seasonOf(c); const v = normView(grade, Number(c.wcpm), se); return { date: day(c.checkedAt), wcpm: Number(c.wcpm), p50: v.p50, percentile: c.percentile === null || c.percentile === undefined ? v.percentile : Number(c.percentile), season: se }; });
  const lastCheck = checks[checks.length - 1];
  const norm = lastCheck ? normView(grade, Number(lastCheck.wcpm), seasonOf(lastCheck)) : null;
  const officialLevel = lastCheck ? fluencyLevel(Number(lastCheck.wcpm), grade, seasonOf(lastCheck)) : null;
  const pr = mine.find((x) => x.prosody && s(x.practiceKind) !== "DRILL");
  const prJ = json<Record<string, unknown> | null>(pr?.prosody, null);
  const num = (v: unknown) => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v) || null);
  const comp = mine.find((x) => x.comprehension !== null && x.comprehension !== undefined);
  const compPct = comp ? Number(comp.comprehension) : null;
  const errs = mine.slice(0, 8).flatMap((x) => json<{ word?: string; heard?: string; arabic?: string[] }[]>(x.errors, []).map((e) => ({ word: s(e.word), heard: s(e.heard), arabic: e.arabic })));
  // the remedial plan as it stands today (reviewed with the latest checks: a check due, on track, …)
  const stored = latestRemedial(mine);
  // words/patterns omitted (undefined): this is a status-only re-check, not a fresh reading — keep the stored list.
  const remedial = stored ? reviewPlan(stored, { grade, cold: coldReads(checks), readings: readingEvidence(mine) }, now) : null;
  if (remedial && !repeatedOffered(officialLevel)) remedial.daily = remedial.daily.map((st) => (st.href && /mode=REPEATED/.test(st.href) ? { ...st, href: st.href.replace("mode=REPEATED", "mode=PASSAGE") } : st));
  return {
    enabled, ready: !("error" in chooseAiProvider({ ...env, AI_PROVIDER: "gemini" })), grade, rubric: fluencyRubricText(grade, season), bands: fluencyBands(grade, season),
    passages, recommended, recommendedMinute,
    latest: lastCheck ? { wcpm: Number(lastCheck.wcpm), level: officialLevel!, date: day(lastCheck.checkedAt) } : null,
    plan: planRow && lastPlan ? { ...lastPlan, date: day(planRow.createdAt) } : null,
    history: mine.slice(0, 12).map((x) => ({ id: s(x.id), mode: s(x.mode) as CoachMode, kind: clampKind(x.practiceKind, s(x.mode) as CoachMode), title: s(x.title), wcpm: Number(x.wcpm), accuracy: Number(x.accuracy), level: x.level ? (s(x.level) as Level) : null, comprehension: x.comprehension === null || x.comprehension === undefined ? null : Number(x.comprehension), date: day(x.createdAt) })),
    checks: minute.slice(0, 8).reverse().map((x) => ({ wcpm: Number(x.wcpm), date: day(x.createdAt) })),
    season, norm, progress,
    prosody: prJ ? { phrasing: num(prJ.phrasing), smoothness: num(prJ.smoothness), pace: num(prJ.pace), intonation: num(prJ.intonation), reasons: json<Record<string, string>>(prJ.reasons, {}), date: day(pr!.createdAt) } : null,
    goal: norm ? weeklyGoal(grade, norm.wcpm, now) : null,
    tips: tipsFor(errs),
    comprehension: comp ? { pct: compPct!, date: day(comp.createdAt) } : null,
    fastNotUnderstanding: !!(comp && norm && norm.p50 !== null && Number(comp.wcpm ?? norm.wcpm) >= norm.p50 && compPct! < 60),
    repeatedOffered: repeatedOffered(officialLevel),
    officialLevel,
    remedial,
  };
}

/** The passage to read (only one of the student's own passages). */
export async function coachPassage(repo: Repo, actor: Actor, key: string, mode: CoachMode): Promise<{ key: string; title: string; words: string[]; lexile: number | null }> {
  const grade = await studentGrade(repo, actor);
  const p = (await passagesFor(repo, s(actor.schoolId), grade)).find((x) => x.key === key);
  if (!p) throw new ForbiddenError("Passage not found.");
  return { key: p.key, title: p.title, words: passageWords(p.body, mode), lexile: p.lexile };
}

export interface CoachSession {
  key: string; title: string; words: string[]; lexile: number | null; kind: PracticeKind;
  /** PHRASED: the marks for this trial (faded); ECHO: the sentences */
  marks: PhraseMark[] | null; sentences: { from: number; to: number; text: string }[] | null;
  /** PHRASED / REPEATED: the next trial, earlier trials and the stretch goal */
  trial: number | null; trials: { trial: number; wcpm: number; goal: number | null }[]; goal: number | null;
  /** REPEATED: false when the student is Above (wider reading instead) or did all 5 trials */
  offered: boolean; reason: string | null;
}
/** Everything a practice kind needs before reading. */
export async function coachSession(repo: Repo, actor: Actor, key: string, kind: PracticeKind, now = new Date()): Promise<CoachSession> {
  const grade = await studentGrade(repo, actor);
  const p = (await passagesFor(repo, s(actor.schoolId), grade)).find((x) => x.key === key);
  if (!p) throw new ForbiddenError("Passage not found.");
  const mode: CoachMode = kind === "MINUTE" ? "MINUTE" : "PASSAGE";
  const words = passageWords(p.body, mode);
  const base: CoachSession = { key: p.key, title: p.title, words, lexile: p.lexile, kind, marks: null, sentences: null, trial: null, trials: [], goal: null, offered: true, reason: null };
  // r4: the 1-minute check only on a passage long enough for a whole minute (the same rule as the scorer)
  if (kind === "MINUTE" && p.words < MINUTE_MIN_WORDS) return { ...base, offered: false, reason: MINUTE_TOO_SHORT };
  if (kind === "ECHO") return { ...base, sentences: sentences(words) };
  if (kind !== "PHRASED" && kind !== "REPEATED") return base;
  const earlier = (await repo.findMany("FluencyPractice", { studentId: actor.studentId, passageKey: p.key, practiceKind: kind }, { select: ["wcpm", "createdAt"] })).sort((a, b) => (d(a.createdAt)?.getTime() ?? 0) - (d(b.createdAt)?.getTime() ?? 0));
  const p50 = normView(grade, 0, fluencySeason(now)).p50;
  let prev: number | null = null;
  const trials = earlier.map((r, k) => { const t = { trial: k + 1, wcpm: Number(r.wcpm), goal: prev === null ? null : trialGoal(prev, p50) }; prev = Number(r.wcpm); return t; });
  const trial = trials.length + 1;
  const goal = prev === null ? null : trialGoal(prev, p50);
  if (kind === "PHRASED") return { ...base, marks: marksForTrial(chunkPassage(words), trial), trial, trials, goal };
  const off = await latestOfficial(repo, actor.studentId!, grade);
  if (!repeatedOffered(off?.level ?? null)) return { ...base, trial, trials, goal, offered: false, reason: "You already read above your grade level, so you do not need repeated reading. Wider reading is better for you: choose a new, harder passage." };
  if (trial > REPEATED_MAX_TRIALS) return { ...base, trial, trials, goal: null, offered: false, reason: `You read this passage ${REPEATED_MAX_TRIALS} times — well done! Choose a new passage.` };
  return { ...base, trial, trials, goal };
}

/**
 * For the Family Report, the parent page and the student's home: the latest plan and the latest OFFICIAL check.
 * r4: `latest` = the newest FluencyCheck (the Fluency Coach's official 1-minute check or a teacher's check) — the same
 * number the Diagnostic, the teacher's pages and the tiers use; the newest practice reading is `latestPractice`.
 */
export async function coachSummary(repo: Repo, studentId: string): Promise<{ latest: { wcpm: number; level: string; date: string } | null; latestPractice: { wcpm: number; date: string } | null; plan: CoachPlan | null; readings14: number }> {
  const [practiceRows, checkRows, st] = await Promise.all([
    repo.findMany("FluencyPractice", { studentId }, { select: ["mode", "practiceKind", "wcpm", "level", "plan", "createdAt"] }),
    repo.findMany("FluencyCheck", { studentId }, { select: ["wcpm", "season", "checkedAt"] }),
    repo.findUnique("Student", { id: studentId }),
  ]);
  const rows: Row[] = practiceRows.sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0));
  const c = checkRows.sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0];
  let latest: { wcpm: number; level: string; date: string } | null = null;
  if (c) {
    const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 5);
    const season = isSeason(c.season) ? (c.season as Season) : fluencySeason(d(c.checkedAt) ?? new Date());
    latest = { wcpm: Number(c.wcpm), level: fluencyLevel(Number(c.wcpm), grade, season), date: day(c.checkedAt) };
  }
  // the newest practice reading of a passage (echo = one sentence, drill = a word list: left out)
  const pr = rows.find((x) => !["ECHO", "DRILL"].includes(s(x.practiceKind)) && x.wcpm !== null && x.wcpm !== undefined);
  const withPlan = rows.map((r) => json<(CoachPlan & { quiz?: unknown; requestId?: unknown }) | null>(r.plan, null)).find((pl) => pl && Array.isArray(pl.steps));
  const plan = withPlan ? (({ quiz: _q, requestId: _r, ...rest }) => rest as CoachPlan)(withPlan) : null;
  return { latest, latestPractice: pr ? { wcpm: Number(pr.wcpm), date: day(pr.createdAt) } : null, plan, readings14: rows.filter((x) => (d(x.createdAt)?.getTime() ?? 0) >= Date.now() - 14 * 86_400_000).length };
}
