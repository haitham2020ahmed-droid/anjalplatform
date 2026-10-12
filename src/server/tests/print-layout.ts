/**
 * 🖨 The printed test's layout (pure): questions numbered 1, 2, 3…; questions that share a passage are kept
 * together under that passage, which is printed ONCE (at the place of its first question); each question gets the
 * right answer space (choices, True / False, ordering and matching lists, or answer lines).
 */
import { correctAnswerText, seededShuffle, type PracticeItem } from "../practice/items";

export type PrintAnswer =
  | { kind: "CHOICES"; options: { label: string; text: string }[]; wide: boolean }
  | { kind: "TRUE_FALSE" }
  | { kind: "ORDER"; elements: string[] }
  | { kind: "MATCH"; left: string[]; right: string[] }
  | { kind: "LINES"; lines: number };
export interface PrintQuestion { n: number; id: string; stem: string; answer: PrintAnswer; key: string }
export interface PrintGroup { passage: { title: string | null; text: string } | null; questions: PrintQuestion[] }

function answerSpace(it: PracticeItem): PrintAnswer {
  const opts = (it.options ?? []).map((o) => ({ label: o.label, text: o.text }));
  if (opts.length) return { kind: "CHOICES", options: opts, wide: opts.some((o) => o.text.length > 38) };
  if (it.type === "TRUE_FALSE") return { kind: "TRUE_FALSE" };
  if (it.sequence?.length) return { kind: "ORDER", elements: seededShuffle(it.sequence, `print:${it.questionId}`) };
  if (it.pairs?.length) return { kind: "MATCH", left: it.pairs.map((p) => p.left), right: seededShuffle(it.pairs.map((p) => p.right), `print:${it.questionId}`) };
  return { kind: "LINES", lines: it.type === "FILL_BLANK" ? 1 : 2 };
}

export function printLayout(items: PracticeItem[]): PrintGroup[] {
  const groups: PrintGroup[] = [];
  const byPassage = new Map<string, PrintGroup>();
  for (const it of items) {
    const text = (it.passageText ?? "").trim();
    let g = text ? byPassage.get(text) : undefined;
    if (!g) {
      g = { passage: text ? { title: it.passageTitle ?? null, text } : null, questions: [] };
      // questions without a passage that follow each other share one group (no empty passage boxes)
      const last = groups[groups.length - 1];
      if (!text && last && !last.passage) g = last; else groups.push(g);
      if (text) byPassage.set(text, g);
    }
    let key = "";
    try { key = correctAnswerText(it); } catch { key = ""; }
    g.questions.push({ n: 0, id: it.questionId, stem: it.stem, answer: answerSpace(it), key });
  }
  let n = 0;
  for (const g of groups) for (const q of g.questions) q.n = ++n;
  return groups;
}
