/**
 * 👁 One question in full, for the teacher (Assessments → New test → "View"): the full passage (title + text),
 * every option with the right answer marked, the type's own parts (two-part, grid, hot text, matching, order, error
 * correction…), level, skill, Curriculum Map section and the explanation. Read on demand: one call per opened
 * question. Staff of the question's school only — never sent to students (it contains the answers).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { errorKey } from "../../imports/questions/validate";
import { correctAnswerText, loadQuestionItems } from "../practice/items";
import { describePicks, type MapSourceQuestion } from "./map-source";
import { skillMeta } from "./assessments";

const s = (v: unknown) => String(v ?? "");

export interface DetailOption { label: string; text: string; correct: boolean; why: string | null }
export interface QuestionDetail {
  id: string;
  /** the row the builder's lists use (to add the question from the drawer) */
  row: MapSourceQuestion;
  type: string; typeLabel: string; level: "BELOW" | "ON" | "ABOVE"; skill: string; grade: number; section: string;
  stem: string;
  passage: { title: string | null; text: string } | null;
  image: { url: string; alt: string } | null;
  options: DetailOption[] | null;
  trueFalse: boolean | null;
  /** fill in the blank: the accepted answers */
  answers: string[] | null;
  /** sentence / word order: the right order */
  order: string[] | null;
  pairs: { left: string; right: string }[] | null;
  errors: { segments: { text: string; wrong: boolean; fix: string | null }[]; noError: boolean } | null;
  twoPart: { a: { stem: string; options: DetailOption[] }; b: { stem: string; options: DetailOption[]; multiple: boolean } } | null;
  grid: { rows: { text: string; answer: string }[]; columns: string[] } | null;
  hot: { segments: { text: string; correct: boolean }[]; maxSelect: number } | null;
  dictation: { word: string; sentence: string | null } | null;
  combine: { sentences: string[]; connector: string | null; accepted: string[] } | null;
  answerText: string;
  explanation: { why: string; tip: string };
  hint: string | null;
}

/**
 * The passage's heading: imported passages are stored as "Imported passage: <the first words>…"; then the real title
 * is the passage's first short line (and the text continues after it), or none.
 */
export function passageHeading(title: string | null | undefined, text: string): { title: string | null; text: string } {
  const t = s(title).trim();
  const body = s(text).replace(/\r\n/g, "\n").trim();
  if (t && !/^imported passage\s*:/i.test(t)) return { title: t, text: body };
  const lines = body.split("\n");
  const first = lines[0].replace(/^#+\s*/, "").trim();
  if (lines.length > 1 && first && first.length <= 80 && !/[.!?:;,]$/.test(first)) return { title: first, text: lines.slice(1).join("\n").trim() };
  return { title: null, text: body };
}

export async function questionDetail(repo: Repo, actor: Actor, questionId: string): Promise<QuestionDetail> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can see the answers.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  assertCan(actor, "questions:read");
  const id = s(questionId).trim();
  if (!id || id.length > 191) throw new ValidationError("That question was not found.");
  const q = await repo.findUnique("Question", { id });
  if (!q || q.deletedAt) throw new ValidationError("That question was not found.");
  // this school's questions only
  const [meta] = await skillMeta(repo, actor.schoolId, [s(q.skillId)]);
  if (!meta) throw new ForbiddenError("That question was not found.");
  const [[it], [row]] = await Promise.all([loadQuestionItems(repo, [id]), describePicks(repo, actor, [id])]);
  if (!it || !row) throw new ValidationError("That question is not published, so it cannot be used in a test.");
  const opt = (o: { label: string; text: string; correct: boolean; rationale?: string | null }): DetailOption => ({ label: o.label, text: o.text, correct: Boolean(o.correct), why: o.rationale ?? null });
  const err = it.type === "ERROR_CORRECTION" && it.segments ? errorKey(it) : null;
  let answerText = "";
  try { answerText = correctAnswerText(it); } catch { answerText = ""; }
  return {
    id, row, type: row.type, typeLabel: row.typeLabel, level: row.level, skill: meta.name, grade: meta.grade, section: row.code ? row.section : "",
    stem: it.stem,
    passage: it.passageText && it.passageText.trim() ? passageHeading(it.passageTitle, it.passageText) : null,
    image: it.image ? { url: `/api/question-images/${it.image.id}`, alt: it.image.alt || "Picture for this question" } : null,
    options: it.options?.length ? it.options.map(opt) : null,
    trueFalse: it.type === "TRUE_FALSE" ? Boolean(it.answer) : null,
    answers: it.type === "FILL_BLANK" && it.answers?.length ? it.answers : null,
    order: it.sequence?.length ? it.sequence : null,
    pairs: it.pairs?.length ? it.pairs : null,
    errors: err ? { segments: it.segments!.map((text, k) => { const n = err.indexes.indexOf(k); return { text, wrong: n >= 0, fix: n >= 0 ? s(err.corrections[n]).split("|")[0].trim() || null : null }; }), noError: !err.indexes.length } : null,
    twoPart: it.twoPart ? { a: { stem: it.twoPart.partA.stem.trim() === it.stem.trim() ? "" : it.twoPart.partA.stem, options: it.twoPart.partA.options.map(opt) }, b: { stem: it.twoPart.partB.stem, options: it.twoPart.partB.options.map(opt), multiple: Boolean(it.twoPart.partB.multiple) } } : null,
    grid: it.grid ? { columns: it.grid.columns.map((c) => c.text), rows: it.grid.rows.map((r) => ({ text: r.text, answer: s(it.grid!.columns.find((c) => c.id === it.grid!.answer[r.id])?.text) })) } : null,
    hot: it.hotText ? { segments: it.hotText.segments.map((x) => ({ text: x.text, correct: it.hotText!.correct.includes(x.id) })), maxSelect: it.hotText.maxSelect } : null,
    dictation: it.dictation ? { word: it.dictation.word, sentence: it.dictation.sentence ?? null } : null,
    combine: it.combine ? { sentences: it.combine.sentences, connector: it.combine.connector ?? null, accepted: it.combine.accepted } : null,
    answerText,
    explanation: { why: it.explanation.whyCorrect, tip: it.explanation.tip },
    hint: it.hint,
  };
}
