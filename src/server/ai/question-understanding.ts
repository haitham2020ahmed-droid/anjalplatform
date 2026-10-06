/**
 * AI understanding for the question-bank importer.
 *
 * PRIVACY: like question-generator.ts, this module imports nothing and never touches the
 * database. It receives only question text from the uploaded file (already redacted by the
 * import service: the school's student names, usernames and student numbers are replaced)
 * and the school's curriculum list (skill codes and names, standard codes).
 */
import type { AiProvider } from "./question-generator";
import type { DetectedQuestion } from "../../imports/questions/parse";

export interface CurriculumSkill { code: string; name: string; standards: string[] }

export interface AiClassification {
  index: number;
  skillCode: string | null;
  standardCode: string | null;
  level: number | null;
  cognitiveLevel: string | null;
  type: string | null;
  /** only when the file has no correct answer: the AI's suggestion (marked for review) */
  suggestedAnswer: string | null;
  explanation: string | null;
  /** feedback for each wrong option, by option label */
  rationales: Record<string, string> | null;
}

const json = (text: string): unknown => {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const a = Math.min(...["{", "["].map((c) => (t.indexOf(c) < 0 ? Infinity : t.indexOf(c))));
  const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (!Number.isFinite(a) || b < a) throw new Error("The AI reply did not contain JSON.");
  return JSON.parse(t.slice(a, b + 1));
};

/** Replaces any of the given personal strings (case-insensitive, whole words) with [REDACTED]. */
export function redact(text: string, personal: string[]): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const p of personal.filter((x) => x && x.trim().length >= 3).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, () => {
      count++;
      return "[REDACTED]";
    });
  }
  return { text: out, count };
}

/** For files the rules could not read: ask the AI to find the questions (text in chunks). */
export async function extractWithAi(provider: AiProvider, text: string): Promise<Partial<DetectedQuestion>[]> {
  const system = [
    "You read question-bank documents written by teachers and return the questions they contain, unchanged.",
    "Do not invent questions or answers. If a question has no correct answer in the text, leave the answer empty.",
    "Types: MULTIPLE_CHOICE, TRUE_FALSE, MULTI_SELECT, FILL_BLANK, DROPDOWN, MATCHING, SENTENCE_ORDER, ERROR_CORRECTION, SHORT_ANSWER.",
    'Return ONLY JSON: {"questions":[{"type":"…","stem":"…","options":["…"],"answer":"letter(s), text, true/false or ordered letters",',
    '"pairs":[{"left":"…","right":"…"}],"explanation":"…","difficulty":"easy|medium|hard","grade":4,"unit":"…","skill":"…","standard":"…"}]}',
  ].join(" ");
  const out: Partial<DetectedQuestion>[] = [];
  for (let i = 0; i < text.length && i < 60_000; i += 12_000) {
    const reply = (await provider.complete(system, text.slice(i, i + 12_000))) || "{}";
    const data = json(reply) as { questions?: unknown[] };
    for (const q of data.questions ?? []) out.push(q as Partial<DetectedQuestion>);
  }
  return out;
}

/** Maps detected questions to the school's skills and standards, and fills difficulty and feedback. */
export async function classifyWithAi(provider: AiProvider, grade: number, skills: CurriculumSkill[], questions: { index: number; q: DetectedQuestion }[]): Promise<AiClassification[]> {
  if (!questions.length) return [];
  const system = [
    `You are an English Language Arts curriculum specialist for Grade ${grade}.`,
    "For each question choose the best matching skill from the list (use its exact code) and one of that skill's standards.",
    "Rate difficulty 1-7 (1-2 easy, 3-5 medium, 6-7 hard) and a Bloom's cognitive level (Remember, Understand, Apply, Analyze, Evaluate, Create).",
    "If explanation is missing write one sentence; write a short rationale for each wrong option. If no correct answer is marked, suggest one in suggestedAnswer, otherwise null.",
    'Return ONLY JSON: {"results":[{"index":0,"skillCode":"…","standardCode":"…","level":4,"cognitiveLevel":"Understand","type":null,"suggestedAnswer":null,"explanation":"…","rationales":{"A":"…"}}]}',
  ].join(" ");
  const user = JSON.stringify({
    skills: skills.map((s) => ({ code: s.code, name: s.name, standards: s.standards })),
    questions: questions.map(({ index, q }) => ({ index, type: q.type, stem: q.stem, options: q.options?.map((o) => ({ label: o.label, text: o.text, correct: o.correct })), answer: q.answer ?? q.answers, hasExplanation: Boolean(q.explanation) })),
  });
  const data = json(await provider.complete(system, user)) as { results?: Partial<AiClassification>[] };
  return (data.results ?? []).map((r) => ({
    index: Number(r.index), skillCode: r.skillCode ?? null, standardCode: r.standardCode ?? null,
    level: Number.isFinite(Number(r.level)) ? Math.min(7, Math.max(1, Number(r.level))) : null, cognitiveLevel: r.cognitiveLevel ?? null, type: r.type ?? null,
    suggestedAnswer: r.suggestedAnswer ?? null, explanation: r.explanation ?? null, rationales: r.rationales ?? null,
  }));
}
