/**
 * 📚 Source-based writing: up to 3 sources ({ title, text }) and up to 3 research questions answered before
 * writing. Multiple-choice questions are scored automatically (0–1); short answers are scored by the teacher (0–2).
 */
import { ValidationError } from "../curriculum-admin";

export interface Source { title: string; text: string }
export interface ResearchQuestion { id: string; q: string; kind: "MC" | "SHORT"; options?: string[]; answer?: number }
/** What the student sees: never the answer key. */
export type ResearchQuestionView = Omit<ResearchQuestion, "answer">;
export interface ResearchAnswers { answers: Record<string, string | number>; scores: Record<string, number | null>; submittedAt: string | null }
export const MAX_SOURCES = 3, MAX_RESEARCH = 3;
export const researchMax = (q: ResearchQuestion) => (q.kind === "MC" ? 1 : 2);

const s = (v: unknown) => String(v ?? "");
const clean = (v: unknown, max: number) => s(v).replace(/\r/g, "").trim().slice(0, max);

export function cleanSources(raw: unknown): Source[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Source[] = [];
  for (const r of list) {
    const title = clean((r as Source)?.title, 120), text = clean((r as Source)?.text, 8000);
    if (!title && !text) continue;
    if (!title || text.length < 20) throw new ValidationError("Each source needs a title and its text (at least a few sentences).");
    out.push({ title, text });
  }
  if (out.length > MAX_SOURCES) throw new ValidationError(`Use at most ${MAX_SOURCES} sources.`);
  return out;
}

export function cleanResearch(raw: unknown): ResearchQuestion[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ResearchQuestion[] = [];
  for (const r of list) {
    const x = r as ResearchQuestion;
    const q = clean(x?.q, 300);
    if (!q) continue;
    const id = `q${out.length + 1}`;
    if (x.kind === "MC") {
      const options = (Array.isArray(x.options) ? x.options : []).map((o) => clean(o, 200)).filter(Boolean);
      if (options.length < 2 || options.length > 4) throw new ValidationError(`Research question ${out.length + 1}: give 2 to 4 choices.`);
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new ValidationError(`Research question ${out.length + 1}: two choices are the same.`);
      const answer = Number(x.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new ValidationError(`Research question ${out.length + 1}: choose the correct choice.`);
      out.push({ id, q, kind: "MC", options, answer });
    } else out.push({ id, q, kind: "SHORT" });
  }
  if (out.length > MAX_RESEARCH) throw new ValidationError(`Use at most ${MAX_RESEARCH} research questions.`);
  return out;
}

export const studentView = (qs: ResearchQuestion[]): ResearchQuestionView[] => qs.map(({ answer: _a, ...rest }) => rest);

/** The student's answers checked (every question answered) and the multiple-choice ones scored. */
export function scoreResearch(qs: ResearchQuestion[], answers: Record<string, unknown>, now: Date): ResearchAnswers {
  const out: ResearchAnswers = { answers: {}, scores: {}, submittedAt: now.toISOString() };
  for (const [i, q] of qs.entries()) {
    const a = answers?.[q.id];
    if (q.kind === "MC") {
      const n = Number(a);
      if (a === undefined || a === null || a === "" || !Number.isInteger(n) || n < 0 || n >= (q.options?.length ?? 0)) throw new ValidationError(`Answer research question ${i + 1} first.`);
      out.answers[q.id] = n;
      out.scores[q.id] = n === q.answer ? 1 : 0;
    } else {
      const t = clean(a, 1000);
      if (t.split(/\s+/).filter(Boolean).length < 3) throw new ValidationError(`Answer research question ${i + 1} in a full sentence.`);
      out.answers[q.id] = t;
      out.scores[q.id] = null; // the teacher scores it 0–2
    }
  }
  return out;
}

/** The score so far: points, the maximum, and how many short answers still wait for the teacher. */
export function researchTotal(qs: ResearchQuestion[], ra: ResearchAnswers | null): { points: number; max: number; pending: number } {
  let points = 0, pending = 0;
  for (const q of qs) {
    const v = ra?.scores?.[q.id];
    if (v === null || v === undefined) { if (ra?.answers?.[q.id] !== undefined) pending++; } else points += Number(v);
  }
  return { points, max: qs.reduce((t, q) => t + researchMax(q), 0), pending };
}

/** The teacher's 0–2 scores for the short answers (multiple choice stays automatic). */
export function teacherScoreResearch(qs: ResearchQuestion[], ra: ResearchAnswers, scores: Record<string, unknown>): ResearchAnswers {
  const next = { ...ra, scores: { ...ra.scores } };
  for (const q of qs) {
    if (q.kind !== "SHORT" || scores[q.id] === undefined || scores[q.id] === "") continue;
    const n = Number(scores[q.id]);
    if (!Number.isInteger(n) || n < 0 || n > 2) throw new ValidationError("Research answers: choose 0, 1 or 2.");
    next.scores[q.id] = n;
  }
  return next;
}

/** Does the text name a source (its title, or “according to / the article / the text says …”)? */
export function citesSource(text: string, sources: Source[]): boolean {
  const t = text.toLowerCase();
  if (sources.some((x) => x.title && t.includes(x.title.toLowerCase()))) return true;
  return /\baccording to\b|\b(the|this|that) (article|text|source|passage|book|website) (says|said|states|explains|tells)\b|\bsource \d\b/.test(t);
}
