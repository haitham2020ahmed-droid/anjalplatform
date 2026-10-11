/**
 * 💡 The hint ladder for one bank item (shared by normal practice and lessons): question type from Question.tags.qar
 * (else estimated from the wording), one strategy step of the skill's lesson, the paragraph, then the clue sentence.
 */
import { estimateQar } from "../../questions/intelligence";
import { hintLadderStep, pickEvidenceSentence, type Evidence, type HintStep } from "../../tutor/tutor";
import { answerTexts, type PracticeItem } from "../practice/items";
import type { Repo } from "../seeding/repo";
import { familyOfSkillCode, lessonFor } from "./content";

const words = (s: string) => new Set(String(s).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));

/** The strategy step that fits the question best (most shared words with the stem); the first step on a tie. */
export function strategyStepFor(familyCode: string, stem: string): string | null {
  const l = lessonFor(familyCode);
  if (!l) return null;
  const want = words(stem);
  let best = l.steps[0], score = -1;
  for (const st of l.steps) {
    let n = 0;
    for (const w of words(st)) if (want.has(w)) n++;
    if (n > score) { best = st; score = n; }
  }
  return best;
}

/** The evidence sentence of an item: best word overlap with the correct option(s), its rationale and the explanation. */
export function evidenceForItem(item: PracticeItem): Evidence | null {
  const correctOpts = [...(item.options ?? []), ...(item.twoPart?.partA.options ?? [])].filter((o) => o.correct);
  return pickEvidenceSentence(item.passageText, [...answerTexts(item), ...correctOpts.map((o) => o.rationale ?? ""), item.explanation.whyCorrect]);
}

const tagsOf = (v: unknown): Record<string, unknown> => {
  let t = v;
  if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
  return t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
};

/** The QAR type of a question: its tag, else the rule estimate from the skill and the wording. */
export async function qarOf(repo: Repo, questionId: string, skillCode: string, stem: string, hasPassage: boolean): Promise<string | null> {
  const q = await repo.findUnique("Question", { id: questionId });
  const tag = tagsOf(q?.tags).qar;
  if (typeof tag === "string" && tag) return tag;
  return estimateQar(skillCode, stem, { hasPassage });
}

/** Hint `level` (1–3) for this item. */
export async function itemHintStep(repo: Repo, item: PracticeItem, skillCode: string, level: number): Promise<HintStep> {
  const qar = await qarOf(repo, item.questionId, skillCode, item.stem, Boolean(item.passageText));
  return hintLadderStep(level, {
    qar, strategyStep: strategyStepFor(familyOfSkillCode(skillCode), item.stem), passage: item.passageText,
    evidence: evidenceForItem(item), itemHint: item.hint || item.explanation.tip || null, correctTexts: answerTexts(item),
  });
}
