/**
 * 🧠 The comprehension check after a reading: 2–3 quick questions about the passage the student just read, so the
 * coach can tell "fast" from "fast and understanding".
 *   1. Questions already linked to the passage (ReadMaster version questions, or Question Bank questions of the
 *      reading passage) — multiple choice and true/false only.
 *   2. Otherwise the school's AI provider writes them from the passage TEXT ONLY (no student data is sent).
 *   3. When the AI is off or busy: a simple main-idea question and a "which sentence was in the passage?" retell
 *      question, built from the passage and the student's other passages.
 * The questions (with their answers) stay on the server, in the reading's plan; the browser only gets the stems and
 * options. Flag: WCPM at or above the 50th percentile but comprehension under 60% → "fast but not understanding".
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Picked, type Validator } from "../ai/engine";
import type { geminiProvider, anthropicProvider } from "../ai/question-generator";
import { loadQuestionItems } from "../practice/items";
import { passageWords, passagesFor, studentGrade } from "./coach";
import { norm50, fluencySeason, isSeason, type Season } from "./norms";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };

export type QuizSource = "BANK" | "AI" | "BASIC";
export interface QuizQuestion { stem: string; options: string[]; answer: number }
export interface StoredQuiz { source: QuizSource; questions: QuizQuestion[]; answered?: boolean; pct?: number }
export interface ClientQuiz { practiceId: string; source: QuizSource; questions: { stem: string; options: string[] }[] }
export const COMPREHENSION_FLAG = 60;

/** WCPM at or above the 50th percentile, but under 60% on the questions. */
export function fastButNotUnderstanding(grade: number, wcpm: number, comprehension: number | null, season: Season = fluencySeason()): boolean {
  const p50 = norm50(grade, season);
  return comprehension !== null && p50 !== null && wcpm >= p50 && comprehension < COMPREHENSION_FLAG;
}

/** Deterministic order (no randomness in the app): a stable hash of the seed. */
function rotate<T>(xs: T[], seed: string): T[] {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const k = xs.length ? h % xs.length : 0;
  return [...xs.slice(k), ...xs.slice(0, k)];
}

/** 1. Questions linked to the passage (ReadMaster version or bank passage). */
export async function linkedQuestions(repo: Repo, key: string, max = 3): Promise<QuizQuestion[]> {
  const [kind, id] = [key.slice(0, 3), key.slice(3)];
  let ids: string[] = [];
  if (kind === "RM:") ids = (await repo.findMany("ReadMasterQuestion", { versionId: id }, { select: ["questionId", "order"] })).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => s(x.questionId));
  else if (kind === "RP:") ids = (await repo.findMany("Question", { passageId: id, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((x) => s(x.id)).sort();
  if (!ids.length) return [];
  const items = await loadQuestionItems(repo, ids.slice(0, 30));
  const out: QuizQuestion[] = [];
  for (const it of items) {
    if (it.type === "TRUE_FALSE" && typeof it.answer === "boolean") out.push({ stem: it.stem, options: ["True", "False"], answer: it.answer ? 0 : 1 });
    else if ((it.type === "MULTIPLE_CHOICE" || it.type === "DROPDOWN") && it.options?.length && it.options.filter((o) => o.correct).length === 1) out.push({ stem: it.stem, options: it.options.map((o) => o.text), answer: it.options.findIndex((o) => o.correct) });
    if (out.length >= max) break;
  }
  return out;
}

/** 3. Without AI: the main idea (the passage's title among other titles) and a retell (which sentence was in it). */
export function basicQuestions(passage: { title: string; body: string }, others: { title: string; body: string }[], seed: string): QuizQuestion[] {
  const strip = (t: string) => t.replace(/\s*·\s*(Below|On|Above)$/i, "").trim();
  const title = strip(passage.title);
  const sentencesOf = (b: string) => b.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.split(" ").length >= 5 && x.split(" ").length <= 18);
  const otherTitles = [...new Set(others.map((o) => strip(o.title)).filter((t) => t && t.toLowerCase() !== title.toLowerCase()))];
  const out: QuizQuestion[] = [];
  if (otherTitles.length >= 2) {
    const opts = rotate([title, ...rotate(otherTitles, seed).slice(0, 2)], `${seed}:t`);
    out.push({ stem: "What was the passage you just read mostly about? Choose its title.", options: opts, answer: opts.indexOf(title) });
  }
  const mine = sentencesOf(passage.body), theirs = others.flatMap((o) => sentencesOf(o.body)).filter((x) => !mine.includes(x));
  if (mine.length && theirs.length >= 2) {
    const right = rotate(mine, seed)[0];
    const opts = rotate([right, ...rotate(theirs, seed).slice(0, 2)], `${seed}:s`);
    out.push({ stem: "Retell check: which sentence was in the passage you read?", options: opts, answer: opts.indexOf(right) });
  }
  if (out.length < 2 && mine.length >= 2) {
    // a true/false retell when there are too few other passages
    out.push({ stem: `True or false: the passage said “${rotate(mine, `${seed}:tf`)[0]}”`, options: ["True", "False"], answer: 0 });
  }
  return out.slice(0, 3);
}

const QUIZ_SYSTEM = `You write quick reading-comprehension questions for Grade 4–6 English learners (first language Arabic).
You get one passage. Write 3 multiple-choice questions that can be answered ONLY from this passage: one about the main idea, one about an important detail, one about why something happened or what a word/phrase means in the passage.
Rules: simple, clear English; 3 or 4 short options each; exactly one correct option; no "all of the above"; no trick questions.
Reply with JSON only: {"questions": [{"stem": string, "options": [string], "answer": number (index of the correct option, from 0)}]}`;

export const quizValidator: Validator<QuizQuestion[]> = (data) => {
  const qs = (data as { questions?: unknown })?.questions;
  if (!Array.isArray(qs) || qs.length < 2) return { ok: false, error: "questions must be a list of 2 or 3" };
  const out: QuizQuestion[] = [];
  for (const q of qs.slice(0, 3) as { stem?: unknown; options?: unknown; answer?: unknown }[]) {
    const stem = s(q?.stem).trim().slice(0, 300);
    const options = Array.isArray(q?.options) ? q.options.map((o) => s(o).trim().slice(0, 160)).filter(Boolean) : [];
    const answer = Number(q?.answer);
    if (!stem) return { ok: false, error: "every question needs a stem" };
    if (options.length < 3 || options.length > 4 || new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: "every question needs 3 or 4 different options" };
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return { ok: false, error: "answer must be the index of the correct option" };
    out.push({ stem, options, answer });
  }
  return { ok: true, value: out };
};

/** 2. The AI writes them from the passage text (null when the AI is off, busy or fails — the caller falls back). */
export async function aiQuestions(repo: Repo, schoolId: string, passage: { title: string; text: string }, env: EnvLike, make: { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider } = {}, now = new Date()): Promise<QuizQuestion[] | null> {
  const settings = await aiSettings(repo, schoolId);
  const picked: Picked = pickProvider(env, settings, make);
  if (!picked.ok) return null;
  if ((await rateState(repo, schoolId, settings, now)).waitMs > 0) return null;
  const r = await callJson(repo, { schoolId, tool: "fluency-quiz", picked, items: 1 }, QUIZ_SYSTEM, { passageTitle: passage.title, passageText: passage.text }, quizValidator, 1);
  return r.ok ? r.value : null;
}

async function myPractice(repo: Repo, actor: Actor, practiceId: string) {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const row = await repo.findUnique("FluencyPractice", { id: practiceId });
  if (!row || s(row.studentId) !== actor.studentId) throw new ForbiddenError("Reading not found.");
  return row;
}

/** Starts (or re-opens) the check for one reading; returns the questions without their answers. */
export async function startComprehension(repo: Repo, actor: Actor, practiceId: string, env: EnvLike, deps: { make?: { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider } } = {}, now = new Date()): Promise<ClientQuiz> {
  const row = await myPractice(repo, actor, practiceId);
  const kind = s(row.practiceKind) || s(row.mode);
  if (kind === "DRILL" || kind === "ECHO") throw new ValidationError("This practice has no questions.");
  const plan = json<Record<string, unknown> | null>(row.plan, null) ?? {};
  const have = plan.quiz as StoredQuiz | undefined;
  const client = (q: StoredQuiz): ClientQuiz => ({ practiceId, source: q.source, questions: q.questions.map((x) => ({ stem: x.stem, options: x.options })) });
  if (have?.questions?.length && !have.answered) return client(have);
  if (have?.answered) throw new ValidationError("You already answered the questions for this reading.");
  const grade = await studentGrade(repo, actor);
  const all = await passagesFor(repo, s(actor.schoolId), grade);
  const p = all.find((x) => x.key === s(row.passageKey));
  if (!p) throw new ForbiddenError("Passage not found.");
  let quiz: StoredQuiz | null = null;
  const linked = await linkedQuestions(repo, p.key);
  if (linked.length >= 2) quiz = { source: "BANK", questions: linked };
  if (!quiz) {
    // only the part the student read (at least ~40 words), as plain text
    const words = passageWords(p.body, s(row.mode) === "MINUTE" ? "MINUTE" : "PASSAGE");
    const upTo = Math.max(Math.min(words.length, 40), Number(row.wordsRead) || words.length);
    const ai = await aiQuestions(repo, s(actor.schoolId), { title: p.title, text: words.slice(0, upTo).join(" ") }, env, deps.make, now).catch(() => null);
    if (ai?.length) quiz = { source: "AI", questions: ai };
  }
  if (!quiz) quiz = { source: "BASIC", questions: basicQuestions(p, all.filter((x) => x.key !== p.key).slice(0, 12), `${practiceId}`) };
  if (!quiz.questions.length) throw new ValidationError("No questions for this passage yet.");
  await repo.updateMany("FluencyPractice", { id: practiceId }, { plan: { ...plan, quiz } });
  return client(quiz);
}

export interface ComprehensionResult { correct: number; total: number; pct: number; review: { stem: string; right: boolean; answer: string }[]; flag: boolean; message: string }

/** Scores the answers, stores comprehension % on the reading (and on the day's official check for a 1-minute check). */
export async function answerComprehension(repo: Repo, actor: Actor, practiceId: string, answers: number[], now = new Date()): Promise<ComprehensionResult> {
  const row = await myPractice(repo, actor, practiceId);
  const plan = json<Record<string, unknown> | null>(row.plan, null) ?? {};
  const quiz = plan.quiz as StoredQuiz | undefined;
  if (!quiz?.questions?.length) throw new ValidationError("Start the questions first.");
  if (quiz.answered) throw new ValidationError("You already answered the questions for this reading.");
  if (!Array.isArray(answers) || answers.length !== quiz.questions.length) throw new ValidationError("Answer every question.");
  const review = quiz.questions.map((q, i) => ({ stem: q.stem, right: Number(answers[i]) === q.answer, answer: q.options[q.answer] }));
  const correct = review.filter((r) => r.right).length, total = review.length;
  const pct = Math.round((100 * correct) / total);
  await repo.updateMany("FluencyPractice", { id: practiceId }, { comprehension: pct, plan: { ...plan, quiz: { ...quiz, answered: true, pct } } });
  // the official 1-minute check of that day gets it too (two reads → the average of both checks)
  if (s(row.mode) === "MINUTE") {
    const day = (d(row.createdAt) ?? now).toISOString().slice(0, 10);
    const check = (await repo.findMany("FluencyCheck", { studentId: actor.studentId, source: "COACH" })).filter((c) => d(c.checkedAt)!.toISOString().slice(0, 10) === day).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0];
    if (check) {
      const prev = check.comprehension === null || check.comprehension === undefined ? null : Number(check.comprehension);
      await repo.updateMany("FluencyCheck", { id: check.id }, { comprehension: prev === null ? pct : Math.round((prev + pct) / 2) });
    }
  }
  const grade = await studentGrade(repo, actor);
  const season: Season = isSeason(row.season) ? (row.season as Season) : fluencySeason(d(row.createdAt) ?? now);
  const flag = fastButNotUnderstanding(grade, Number(row.wcpm), pct, season);
  const message = flag ? "You read fast! Now slow down a little and think about what the words mean — good readers read to understand."
    : pct >= 80 ? "Great understanding! You read well and you understood it." : pct >= 60 ? "Good. Read the passage again and look for the answers you missed." : "Read it again slowly. Stop after each paragraph and ask: what was this part about?";
  return { correct, total, pct, review, flag, message };
}
