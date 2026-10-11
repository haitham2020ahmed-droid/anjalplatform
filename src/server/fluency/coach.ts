/**
 * 🎙 Fluency Coach: a student reads a passage aloud, records it, and gets their words correct per minute (WCPM), the
 * words they mispronounced or skipped (with the right pronunciation to listen to), an expression score and a plan.
 *
 * Two ways to read:
 *   MINUTE  — the 1-minute check: the recording stops by itself after 60 seconds. Official: its WCPM sets the
 *             student's fluency level on the school's rubric (Hasbrouck & Tindal 2017) and goes to Reading Fluency,
 *             the Diagnostic analysis, the support groups and the Family Report.
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
import { fluencySeason, normView, weeklyGoal, wcpmPercentile, isSeason, type NormView, type Season } from "./norms";
import { chunkPassage, marksForTrial, sentences, type PhraseMark } from "./phrasing";
import { buildDrill, gridWords, scoreDrill, validateGrid, DRILL_SECONDS, type DrillGrid, type DrillResult } from "./drill";
import { patternForError } from "./drill-words";
import { arabicTags, tipsFor, type ArabicTip } from "./arabic";

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
  const arts = (await repo.findMany("ReadMasterArticle", { schoolId, status: "PUBLISHED" }, { select: ["id", "title", "gradeLevel"] })).filter((a) => Math.abs(Number(a.gradeLevel) - grade) <= 1);
  const vers = arts.length ? await repo.findMany("ReadMasterVersion", { articleId: { in: arts.map((a) => a.id) } }, { select: ["id", "articleId", "level", "lexile", "body", "wordCount"] }) : [];
  const ORDER: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
  for (const v of vers.sort((a, b) => s(a.articleId).localeCompare(s(b.articleId)) || (ORDER[s(a.level)] ?? 1) - (ORDER[s(b.level)] ?? 1))) {
    const a = arts.find((x) => x.id === v.articleId)!;
    const body = s(v.body); const words = body.split(/\s+/).filter(Boolean).length;
    if (words < 40) continue;
    out.push({ key: `RM:${s(v.id)}`, title: `${s(a.title)} · ${s(v.level).charAt(0)}${s(v.level).slice(1).toLowerCase()}`, words, lexile: Number(v.lexile) || null, level: (s(v.level) as Level) || null, grade: Number(a.gradeLevel), source: "READMASTER", body });
  }
  const bank = (await repo.findMany("ReadingPassage", {}, { select: ["id", "title", "body", "wordCount", "gradeLevel", "genre"] })).filter((p) => p.gradeLevel !== null && Math.abs(Number(p.gradeLevel) - grade) <= 1 && Number(p.wordCount) >= 60 && !/poem|poetry|drama|play/i.test(s(p.genre)));
  // a ReadMaster version also lives in the bank as a passage: list it once
  const head = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
  const rmHeads = new Set(out.map((x) => head(x.body)));
  for (const p of bank.filter((x) => !rmHeads.has(head(s(x.body)))).slice(0, 60)) out.push({ key: `RP:${s(p.id)}`, title: s(p.title), words: Number(p.wordCount), lexile: null, level: Number(p.gradeLevel) < grade ? "BELOW" : Number(p.gradeLevel) > grade ? "ABOVE" : "ON", grade: Number(p.gradeLevel), source: "BANK", body: s(p.body) });
  return out;
}

/** The words of a passage as read aloud: whole sentences up to the mode's limit (markup and extra spaces removed). */
export function passageWords(body: string, mode: CoachMode): string[] {
  const text = body.replace(/<[^>]+>/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean);
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
}
export type ScoreTask = "READ" | "ECHO" | "DRILL";
export type AudioScorer = (input: { words: string[]; audio: Uint8Array; mime: string; task?: ScoreTask }) => Promise<ReadingMarks>;

const SYSTEM = `You are an expert assessor of oral reading fluency (running records, Hasbrouck & Tindal, NAEP). You get the passage as a numbered list of words and an audio recording of a school student (an English learner whose first language is Arabic) reading it aloud.
Mark only real reading errors on passage words:
 - MISPRONOUNCED: the word was said wrongly so it became another or an unrecognisable word,
 - SUBSTITUTED: another word was said instead,
 - SKIPPED: the word was left out,
 - HESITATION: the 3-second rule — the reader stopped on the word for MORE than 3 seconds before saying it (or never said it and went on after the pause). This counts as an error.
NEVER count an accent as an error. A recognisable word said with an Arabic accent is CORRECT (for example a slightly different vowel, a rolled r, p close to b, v close to f, or th close to s/z/t/d while the word is still clearly the word). Count it only when it clearly becomes a different word.
Do NOT count as errors: self-corrections made within 3 seconds (the word is correct), repetitions, short pauses, inserted extra words.
lastWordIndex = the index of the last passage word the reader reached (they may stop before the end). If nothing of the passage can be heard, lastWordIndex = -1.
hesitations = the indexes of every word the reader stopped on for more than 3 seconds (the same words are HESITATION errors unless already marked as another error).
prosody = four traits, each a whole number 1–4 with ONE short reason in simple English (max 15 words):
 - phrasing: 1 word by word · 2 two-word groups · 3 mostly meaningful phrases · 4 phrases that follow the meaning and punctuation,
 - smoothness: 1 many long pauses, sound-outs and restarts · 2 several rough spots · 3 a few breaks, fixed quickly · 4 smooth,
 - pace: 1 very slow and laboured · 2 slow, or too fast to follow · 3 uneven but mostly conversational · 4 steady conversational pace,
 - intonation: 1 flat, no expression · 2 little expression · 3 some expression that fits the meaning · 4 voice matches meaning and punctuation (questions, exclamations, dialogue).
expression = the overall NAEP fluency scale: 1 word by word, 2 mostly two-word phrases, 3 mostly meaningful phrases with some expression, 4 phrased, smooth, expressive with attention to punctuation. null if too short to judge (then prosody null too).
patterns = up to 3 short sound/spelling patterns behind the errors (e.g. "-tion endings", "silent e", "vowel team ea", "-ed endings", "th sound"), or [] when none.
For each error, "heard" is what the reader said (as letters, e.g. "wus"), or "" when skipped or stuck.
Reply with JSON only: {"lastWordIndex": number, "errors": [{"i": number, "kind": "MISPRONOUNCED"|"SUBSTITUTED"|"SKIPPED"|"HESITATION", "heard": string}], "hesitations": [number], "expression": 1|2|3|4|null, "prosody": {"phrasing": {"score": 1|2|3|4, "reason": string}, "smoothness": {...}, "pace": {...}, "intonation": {...}} | null, "patterns": [string]}`;

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

/** Checks the AI's reply against the passage (indexes in range, known kinds, one mark per word, 3-second rule). */
export function validateMarks(data: unknown, n: number): { ok: true; value: ReadingMarks } | { ok: false; error: string } {
  const o = data as Partial<ReadingMarks> | null;
  if (!o || typeof o !== "object") return { ok: false, error: "reply must be an object" };
  const last = Number(o.lastWordIndex);
  if (!Number.isInteger(last) || last < -1 || last >= n) return { ok: false, error: `lastWordIndex must be a whole number from -1 to ${n - 1}` };
  if (!Array.isArray(o.errors)) return { ok: false, error: "errors must be a list" };
  const seen = new Set<number>(); const errors: ReadingMarks["errors"] = [];
  for (const e of o.errors) {
    const i = Number((e as { i?: unknown })?.i), kind = s((e as { kind?: unknown })?.kind).toUpperCase();
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
  return { ok: true, value: { lastWordIndex: last, errors: errors.sort((a, b) => a.i - b.i), expression, patterns, hesitations, prosody } };
}

/** Gemini listens to the recording (audio inline, JSON reply). Null when Gemini is not set up. */
export function geminiAudioScorer(env: EnvLike, fetchImpl: typeof fetch = fetch): AudioScorer | null {
  const c = chooseAiProvider({ ...env, AI_PROVIDER: "gemini" });
  if ("error" in c || c.provider !== "gemini") return null;
  const model = env.GEMINI_MODEL || c.model;
  return async ({ words, audio, mime, task = "READ" }) => {
    const numbered = words.map((w, i) => `${i}:${w}`).join(" ");
    let body = { passageWords: numbered, wordCount: words.length } as Record<string, unknown>;
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM + TASK_NOTE[task] }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(body) }, { inline_data: { mime_type: mime, data: Buffer.from(audio).toString("base64") } }] }],
          generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(res.status === 429 ? "RATE_LIMIT: the AI provider's limit was reached" : `Gemini error ${res.status}: ${t.slice(0, 200)}`); }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      try { const v = validateMarks(extractJson(text), words.length); if (v.ok) return v.value; lastError = v.error; }
      catch (e) { lastError = (e as Error).message; }
      body = { ...body, yourPreviousReplyWasRejectedBecause: lastError };
    }
    throw new Error(`The AI reply could not be used (${lastError}).`);
  };
}

export interface CoachResult {
  id: string; mode: CoachMode; kind: PracticeKind; title: string; passageKey: string;
  words: { text: string; mark: "OK" | ErrorKind | "NOT_READ"; heard: string }[];
  wordsRead: number; wordsCorrect: number; seconds: number; wcpm: number; accuracy: number; expression: number | null;
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
}
export interface CoachPlan {
  level: Level; goal: number; nextCheck: string; perWeek: number; steps: { icon: string; text: string; href?: string }[]; words: string[]; patterns: string[]; nextPassageKey: string | null;
  /** the weekly goal toward the next season's 50th percentile */
  growth?: { nextGoal: number; perWeek: number; target: number; weeks: number; season: Season; reached: boolean } | null;
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
export function makePlan(input: { level: Level; wcpm: number; expression: number | null; grade: number; words: string[]; patterns: string[]; passageKey: string; nextKey: { same: string; harder: string | null; another: string | null }; phrasing?: number | null }, now = new Date()): CoachPlan {
  const b = fluencyBands(input.grade);
  const goal = input.level === "BELOW" ? Math.max(input.wcpm + 1, Math.min(b.below + 1, input.wcpm + 10)) : input.level === "ON" ? Math.max(input.wcpm + 1, Math.min(b.above + 1, input.wcpm + 8)) : input.wcpm + 5;
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
  steps.push({ icon: "⏱", text: `Take your next 1-minute check on ${next}. Goal: ${growth && !growth.reached ? growth.nextGoal : goal} words correct per minute.`, href: go(input.nextKey.same, "MINUTE") });
  const nextPassageKey = input.level === "BELOW" ? input.nextKey.same : input.level === "ON" ? input.nextKey.another : input.nextKey.harder;
  return { level: input.level, goal, nextCheck: next, perWeek: input.level === "BELOW" ? 3 : 2, steps, words: input.words.slice(0, 12), patterns: input.patterns, nextPassageKey: nextPassageKey ?? null, growth };
}

const clampKind = (k: unknown, mode: CoachMode): PracticeKind => (PRACTICE_KINDS.includes(k as PracticeKind) ? (k as PracticeKind) : mode);
const day = (x: unknown) => (d(x) ?? new Date(0)).toISOString().slice(0, 10);

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

export interface ScoreInput { key: string; mode: CoachMode; seconds: number; audio: Uint8Array; mime: string; kind?: PracticeKind; sentence?: number; grid?: unknown }

/**
 * Scores one recording. The school's AI limits are kept: when the provider needs a pause, the reply says how long
 * to wait and the page sends the same recording again by itself (a queue, without storing the audio).
 */
export async function scoreReading(repo: Repo, actor: Actor, input: ScoreInput, env: EnvLike, deps: { scorer?: AudioScorer | null } = {}, now = new Date()): Promise<{ status: "OK"; result: CoachResult } | { status: "WAIT"; seconds: number; reason: string }> {
  const grade = await studentGrade(repo, actor);
  const schoolId = s(actor.schoolId);
  if (!(await coachSettings(repo, schoolId)).enabled) throw new ValidationError("The Fluency Coach is switched off by the school.");
  if (input.mode !== "MINUTE" && input.mode !== "PASSAGE") throw new ValidationError("Choose the 1-minute check or the whole passage.");
  const kind = clampKind(input.kind, input.mode);
  const mode: CoachMode = kind === "MINUTE" ? "MINUTE" : "PASSAGE";
  if (!input.audio.length) throw new ValidationError("The recording is empty. Check the microphone and read again.");
  if (input.audio.length > MAX_AUDIO_BYTES) throw new ValidationError("The recording is too long.");
  if (!/^audio\/(wav|x-wav|wave|webm|ogg|mp4|mpeg|aac|flac)(;.*)?$/i.test(input.mime)) throw new ValidationError("This recording type is not supported.");
  if (!(input.seconds >= (kind === "ECHO" ? 1 : 3))) throw new ValidationError("Read for a few seconds at least, then stop.");
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
    p = all.find((x) => x.key === input.key) ?? null;
    if (!p) throw new ForbiddenError("Passage not found.");
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
      if (kind === "REPEATED" && trial > REPEATED_MAX_TRIALS) throw new ValidationError(`You read this passage ${REPEATED_MAX_TRIALS} times — well done! Choose a new passage.`);
    }
  }
  const scorer = deps.scorer === undefined ? geminiAudioScorer(env) : deps.scorer;
  if (!scorer) throw new ValidationError("The Fluency Coach needs the school's Gemini key (GEMINI_API_KEY). Ask the admin.");
  // the school's AI limits (shared with the other AI tools), and a daily limit per student
  const settings = await aiSettings(repo, schoolId);
  if (settings.provider === "off") throw new ValidationError("The AI tools are switched off by the school.");
  const rs = await rateState(repo, schoolId, settings, now);
  if (rs.waitMs > 0) return { status: "WAIT", seconds: Math.ceil(rs.waitMs / 1000), reason: rs.reason ?? "Many students are reading right now. Your result is next." };
  const mine = kind === "ECHO" ? await consumeRateLimit(repo, `fluency-echo:${actor.userId}`, ECHO_PER_DAY, 86_400_000, now) : await consumeRateLimit(repo, `fluency:${actor.userId}`, COACH_PER_DAY, 86_400_000, now);
  if (!mine.allowed) throw new ValidationError(`That is a lot of reading today — well done! Come back tomorrow.`);
  const started = Date.now();
  let marks: ReadingMarks;
  try { marks = await scorer({ words, audio: input.audio, mime: input.mime, task: kind === "ECHO" ? "ECHO" : kind === "DRILL" ? "DRILL" : "READ" }); }
  catch (e) {
    const m = (e as Error).message ?? "";
    await repo.create("AiRequestLog", { schoolId, tool: "fluency", provider: "gemini", model: s(env.GEMINI_MODEL).slice(0, 80) || "gemini", ok: false, items: 1, ms: Date.now() - started, error: m.slice(0, 500), createdAt: new Date() });
    if (/RATE_LIMIT|429/.test(m)) return { status: "WAIT", seconds: 60, reason: "The AI provider asked us to slow down. Your result is next." };
    throw new ValidationError("The coach could not listen to this recording. Please try again in a moment.");
  }
  await repo.create("AiRequestLog", { schoolId, tool: "fluency", provider: "gemini", model: s(env.GEMINI_MODEL).slice(0, 80) || "gemini", ok: true, items: 1, ms: Date.now() - started, error: null, createdAt: new Date() });
  // a fake or older scorer may skip the checks: run the reply through the validator once more
  const v = validateMarks(marks, words.length);
  if (!v.ok) throw new ValidationError("The coach could not listen to this recording. Please try again in a moment.");
  marks = v.value;
  if (marks.lastWordIndex < 0) throw new ValidationError("We could not hear the passage in the recording. Check the microphone, read a little louder, and try again.");
  if (kind === "DRILL") marks = { ...marks, expression: null, prosody: null };

  const season = fluencySeason(now);
  const drill = grid ? { ...scoreDrill(grid, marks, input.seconds), grid } : null;
  const n = drill ? { wordsRead: drill.wordsRead, wordsCorrect: drill.wordsCorrect, seconds: drill.seconds, wcpm: drill.wcpm, accuracy: drill.wordsRead ? Math.round((100 * drill.wordsCorrect) / drill.wordsRead) : 0 }
    : countReading(words, marks, kind === "ECHO" ? Math.min(ECHO_MAX_SECONDS, input.seconds) : input.seconds, mode);
  const level = fluencyLevel(n.wcpm, grade, season);
  const official = kind === "MINUTE";
  const norm = normView(grade, n.wcpm, season);
  const errWords = [...new Set(marks.errors.map((e) => clean(words[e.i])).filter((w) => w.length > 1))];
  const storedErrors = marks.errors.map((e) => { const w = clean(words[e.i]); return { i: e.i, word: w, heard: e.heard, kind: e.kind, pattern: patternForError(w, marks.patterns), arabic: arabicTags(w, e.heard) }; });
  const tips = tipsFor(storedErrors);
  const prosody = marks.prosody ?? null;

  // the plan (passage readings only)
  let plan: CoachPlan | null = null;
  if (p && kind !== "ECHO") {
    const sameLevel = all.filter((x) => x.level === p!.level && x.key !== p!.key);
    const harder = all.filter((x) => (p!.lexile && x.lexile ? x.lexile > p!.lexile : x.grade > p!.grade || (x.level === "ABOVE" && p!.level !== "ABOVE")));
    plan = makePlan({ level: official ? level : official0?.level ?? level, wcpm: official ? n.wcpm : official0?.wcpm ?? n.wcpm, expression: marks.expression, grade, words: errWords, patterns: marks.patterns, passageKey: p.key, nextKey: { same: p.key, harder: harder[0]?.key ?? null, another: sameLevel[0]?.key ?? null }, phrasing: prosody?.phrasing?.score ?? null }, now);
    if (!repeatedOffered(official0?.level ?? (official ? level : null))) plan.steps = plan.steps.map((st) => (/repeated reading/.test(st.text) ? { icon: "🚀", text: "Wider reading: choose a new, harder passage this week.", href: "/student/fluency-coach" } : st));
  }

  // repeated / phrased trials: every trial's WCPM and the stretch goal for the next one
  const p50 = norm.p50;
  const trials: CoachResult["trials"] = [];
  if (trial !== null) {
    let prev: number | null = null;
    for (const [k, r] of earlier.entries()) { trials.push({ trial: k + 1, wcpm: Number(r.wcpm), goal: prev === null ? null : trialGoal(prev, p50) }); prev = Number(r.wcpm); }
    trials.push({ trial, wcpm: n.wcpm, goal: prev === null ? null : trialGoal(prev, p50) });
  }
  const nextGoal = trial !== null && (kind !== "REPEATED" || trial < REPEATED_MAX_TRIALS) ? trialGoal(n.wcpm, p50) : null;

  const row = await repo.create("FluencyPractice", {
    studentId: actor.studentId, mode, passageKey: p ? p.key : "DRILL", title: (p ? (kind === "ECHO" ? `Echo · ${p.title}` : p.title) : "Speed drill").slice(0, 191), lexile: p?.lexile ?? null, wordsRead: n.wordsRead, wordsCorrect: n.wordsCorrect, seconds: n.seconds, wcpm: n.wcpm, accuracy: n.accuracy,
    expression: marks.expression, level: official ? level : null, errors: storedErrors, patterns: drill ? drill.reteach : marks.patterns, plan,
    prosody: prosody ? { ...prosodyScores(prosody), reasons: Object.fromEntries(PROSODY_TRAITS.map((t) => [t, prosody[t]?.reason ?? ""])) } : null,
    hesitations: marks.hesitations?.length ?? 0, comprehension: null, practiceKind: kind, trial, percentile: official ? norm.percentile : null, createdAt: now,
  });

  // the official 1-minute check joins Reading Fluency (and from there every report); two the same day → the average
  let average: CoachResult["average"] = null;
  if (official) {
    const today = now.toISOString().slice(0, 10);
    const todays = (await repo.findMany("FluencyCheck", { studentId: actor.studentId, source: "COACH" })).filter((c) => day(c.checkedAt) === today);
    const first = todays.find((c) => !/average of 2/i.test(s(c.note)));
    if (first && todays.length === 1) {
      const reads = [Number(first.wcpm), n.wcpm];
      const avg = averageReads(reads);
      const v2 = normView(grade, avg, season);
      await repo.updateMany("FluencyCheck", { id: first.id }, { wcpm: avg, accuracy: Math.round((Number(first.accuracy ?? n.accuracy) + n.accuracy) / 2), note: `Fluency Coach · average of 2 cold reads (${reads.join(" and ")} WCPM): ${p!.title}`.slice(0, 500), season, percentile: v2.percentile, prosody: prosodyScores(prosody) ?? first.prosody ?? null, checkedAt: now });
      average = { reads, wcpm: avg };
    } else if (!todays.length) {
      await repo.create("FluencyCheck", { studentId: actor.studentId, wcpm: n.wcpm, accuracy: n.accuracy, note: `Fluency Coach: ${p!.title}`.slice(0, 500), source: "COACH", checkedById: null, checkedAt: now, season, percentile: norm.percentile, prosody: prosodyScores(prosody), comprehension: null });
    }
    // a third check on the same day is kept as a reading; the day's official score stays the average of two
  }
  const byIndex = new Map(marks.errors.map((e) => [e.i, e]));
  const emptyPlan: CoachPlan = { level, goal: n.wcpm + 1, nextCheck: "", perWeek: 0, steps: [], words: errWords, patterns: marks.patterns, nextPassageKey: null, growth: null };
  return {
    status: "OK",
    result: {
      id: s(row.id), mode, kind, title: p ? p.title : "Speed drill", passageKey: p ? p.key : "DRILL",
      words: words.map((w, i) => { const e = byIndex.get(i); return { text: w, mark: i > marks.lastWordIndex ? "NOT_READ" : e ? e.kind : "OK", heard: e?.heard ?? "" }; }),
      ...n, expression: marks.expression, level, official, rubric: fluencyRubricText(grade, season), patterns: marks.patterns, practise: errWords, plan: plan ?? emptyPlan, date: now.toISOString().slice(0, 10),
      norm: average ? normView(grade, average.wcpm, season) : norm, prosody, hesitations: marks.hesitations?.length ?? 0, tips, average, trial, trials, nextGoal, drill, echo,
    },
  };
}

// ------------------------------------------------------------------ the student's page

export interface CoachHome {
  enabled: boolean; ready: boolean; grade: number; rubric: string; bands: { below: number; above: number };
  passages: CoachPassage[]; recommended: string | null;
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
}
export async function coachHome(repo: Repo, actor: Actor, env: EnvLike, now = new Date()): Promise<CoachHome> {
  const grade = await studentGrade(repo, actor);
  const schoolId = s(actor.schoolId);
  const [{ enabled }, all, lex, practice, checkRows] = await Promise.all([
    coachSettings(repo, schoolId), passagesFor(repo, schoolId, grade), repo.findUnique("StudentReadingLexile", { studentId: actor.studentId }),
    repo.findMany("FluencyPractice", { studentId: actor.studentId }, { select: ["id", "mode", "practiceKind", "title", "wcpm", "accuracy", "level", "plan", "createdAt", "prosody", "errors", "comprehension"] }),
    repo.findMany("FluencyCheck", { studentId: actor.studentId }),
  ]);
  const passages = all.map(({ body: _b, ...x }) => x);
  const mine = practice.sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0));
  const minute = mine.filter((x) => s(x.mode) === "MINUTE");
  const lexile = lex ? Number(lex.lexile) : null;
  const ofGrade = passages.filter((x) => x.grade === grade);
  const planOf = (r: Row | undefined) => { const pl = json<(CoachPlan & { quiz?: unknown }) | null>(r?.plan, null); if (!pl || !Array.isArray(pl.steps)) return null; const { quiz: _q, ...rest } = pl; return rest as CoachPlan; };
  const planRow = mine.find((x) => planOf(x));
  const lastPlan = planOf(planRow);
  const recommended = (lastPlan?.nextPassageKey && passages.some((x) => x.key === lastPlan.nextPassageKey) ? lastPlan.nextPassageKey
    : lexile !== null ? [...passages].filter((x) => x.lexile !== null).sort((a, b) => Math.abs(a.lexile! - lexile) - Math.abs(b.lexile! - lexile))[0]?.key
    : (ofGrade.find((x) => x.level === (minute[0] ? s(minute[0].level) : "ON")) ?? ofGrade[0] ?? passages[0])?.key) ?? null;
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
  return {
    enabled, ready: !("error" in chooseAiProvider({ ...env, AI_PROVIDER: "gemini" })), grade, rubric: fluencyRubricText(grade, season), bands: fluencyBands(grade, season),
    passages, recommended,
    latest: minute[0] ? { wcpm: Number(minute[0].wcpm), level: (s(minute[0].level) as Level) || fluencyLevel(Number(minute[0].wcpm), grade, season), date: day(minute[0].createdAt) } : null,
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

/** For the Family Report and the student's home: the latest plan and official check. */
export async function coachSummary(repo: Repo, studentId: string): Promise<{ latest: { wcpm: number; level: string; date: string } | null; plan: CoachPlan | null; readings14: number }> {
  const rows: Row[] = (await repo.findMany("FluencyPractice", { studentId }, { select: ["mode", "wcpm", "level", "plan", "createdAt"] })).sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0));
  const m = rows.find((x) => s(x.mode) === "MINUTE");
  const withPlan = rows.map((r) => json<(CoachPlan & { quiz?: unknown }) | null>(r.plan, null)).find((pl) => pl && Array.isArray(pl.steps));
  const plan = withPlan ? (({ quiz: _q, ...rest }) => rest as CoachPlan)(withPlan) : null;
  return { latest: m ? { wcpm: Number(m.wcpm), level: s(m.level), date: d(m.createdAt)!.toISOString().slice(0, 10) } : null, plan, readings14: rows.filter((x) => (d(x.createdAt)?.getTime() ?? 0) >= Date.now() - 14 * 86_400_000).length };
}
