/**
 * ❓ The real questions behind the class's mistakes (Nov 2026, IXL "Trouble Spots"): the questions most students of a
 * class got wrong (2+ students, last 30 days), each with the question itself, the right answer, the wrong answer
 * most of them chose, its difficulty band and who missed it — and, for each class-wide mistake (a misconception code),
 * the question that shows it best (missed with that mistake by the most students).
 *
 * Careful answers only: a rapid guess is not a mistake about the skill. Live games never count. Read only.
 * Access: a class the actor can read (assertClassRead).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { studentNames } from "./student-data";
import { correctAnswerText, loadQuestionItems, studentAnswerText, type PracticeItem } from "../practice/items";
import { skillKeyIndex } from "../skills/status";
import { bandOf, type Band } from "../skills/difficulty";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
const DAY = 86_400_000;
export const MISSED_DAYS = 30;
export const MISSED_TOP = 8;
/** answers read at most (newest first) */
const MAX_ROWS = 20000;

export interface MissedQuestion {
  questionId: string; skillId: string; skill: string; skillKey: string; stem: string; passageTitle: string | null;
  /** the choices (multiple choice / true-false), the right one marked; null for other question types */
  options: { label: string; text: string; correct: boolean }[] | null;
  correctAnswer: string; why: string; band: Band;
  missedBy: { id: string; name: string }[]; tried: number;
  /** the wrong answer chosen most often (2+ students), or null */
  commonWrong: { text: string; n: number } | null;
}
export interface ClassMissed { top: MissedQuestion[]; byCode: Record<string, MissedQuestion> }

export function optionsOf(it: PracticeItem): MissedQuestion["options"] {
  if (it.type === "TRUE_FALSE") return [{ label: "A", text: "True", correct: it.answer === true }, { label: "B", text: "False", correct: it.answer === false }];
  return it.options?.length ? it.options.map((o) => ({ label: o.label, text: o.text, correct: Boolean(o.correct) })) : null;
}

export async function classMissedQuestions(repo: Repo, actor: Actor, classId: string, opts: { codes?: string[]; days?: number; limit?: number } = {}, now = new Date()): Promise<ClassMissed> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const klass = await assertClassRead(repo, actor, classId);
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  if (!ids.length) return { top: [], byCode: {} };
  const since = new Date(now.getTime() - (opts.days ?? MISSED_DAYS) * DAY);
  const rows = (await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, {
    select: ["studentId", "questionId", "skillId", "isCorrect", "misconception", "response", "rapidGuess", "source"],
    orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ROWS,
  })).filter((r) => s(r.source) !== "GAME" && !r.rapidGuess && s(r.questionId));

  const per = new Map<string, { wrong: Set<string>; tried: Set<string>; skillId: string; wrongRows: Row[] }>();
  const byCodeQ = new Map<string, Map<string, Set<string>>>();   // code → question → students wrong with it
  for (const r of rows) {
    const q = s(r.questionId);
    const e = per.get(q) ?? { wrong: new Set<string>(), tried: new Set<string>(), skillId: s(r.skillId), wrongRows: [] };
    e.tried.add(s(r.studentId));
    if (!r.isCorrect) {
      e.wrong.add(s(r.studentId)); e.wrongRows.push(r);
      const code = s(r.misconception);
      if (code) { const m = byCodeQ.get(code) ?? new Map<string, Set<string>>(); const st = m.get(q) ?? new Set<string>(); st.add(s(r.studentId)); m.set(q, st); byCodeQ.set(code, m); }
    }
    per.set(q, e);
  }
  const rank = (a: [string, { wrong: Set<string>; tried: Set<string> }], b: [string, { wrong: Set<string>; tried: Set<string> }]) => b[1].wrong.size - a[1].wrong.size || b[1].tried.size - a[1].tried.size || a[0].localeCompare(b[0]);
  const topIds = [...per].filter(([, e]) => e.wrong.size >= 2).sort(rank).slice(0, opts.limit ?? MISSED_TOP).map(([q]) => q);
  const codeIds: Record<string, string> = {};
  // the given codes, or (none given) every mistake 2+ students made
  const codes = opts.codes ?? [...byCodeQ].filter(([, m]) => new Set([...m.values()].flatMap((x) => [...x])).size >= 2).map(([c]) => c);
  for (const code of codes) {
    const m = byCodeQ.get(code);
    if (!m) continue;
    const best = [...m].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];
    if (best) codeIds[code] = best[0];
  }
  const need = [...new Set([...topIds, ...Object.values(codeIds)])];
  const [items, names, ix] = await Promise.all([loadQuestionItems(repo, need), studentNames(repo, ids), skillKeyIndex(repo, s(klass.schoolId) || s(actor.schoolId))]);
  const itemOf = new Map(items.map((it) => [it.questionId, it]));
  const build = (qid: string): MissedQuestion | null => {
    const it = itemOf.get(qid), e = per.get(qid);
    if (!it || !e) return null;   // deleted or unpublished since: not shown
    const counts = new Map<string, number>();
    for (const r of e.wrongRows) { const txt = studentAnswerText(it, json<{ value?: unknown }>(r.response, {}).value); if (txt && txt !== "No answer") counts.set(txt, (counts.get(txt) ?? 0) + 1); }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    const key = ix.keyOf.get(e.skillId) ?? `skill:${e.skillId}`;
    return {
      questionId: qid, skillId: e.skillId, skill: ix.nameOf.get(key) ?? "Skill", skillKey: key, stem: it.stem, passageTitle: it.passageTitle ?? null,
      options: optionsOf(it), correctAnswer: correctAnswerText(it), why: s(it.explanation?.whyCorrect), band: bandOf(it.irt?.b),
      missedBy: [...e.wrong].map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
      tried: e.tried.size, commonWrong: common && common[1] >= 2 ? { text: common[0], n: common[1] } : null,
    };
  };
  const top = topIds.map(build).filter((x): x is MissedQuestion => x !== null);
  const byCode: Record<string, MissedQuestion> = {};
  for (const [code, qid] of Object.entries(codeIds)) { const m = build(qid); if (m) byCode[code] = m; }
  return { top, byCode };
}

export interface ScreenQuestion { questionId: string; skill: string; stem: string; passage: { title: string | null; text: string } | null; options: MissedQuestion["options"]; correctAnswer: string; why: string; band: Band }
/**
 * 📺 One question to show big on the class screen ("Show on screen"): the question, its passage and choices; the
 * answer stays hidden until the teacher opens it. Staff only, a question of the actor's own school.
 */
export async function questionForScreen(repo: Repo, actor: Actor, questionId: string): Promise<ScreenQuestion> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const q = await repo.findUnique("Question", { id: s(questionId) });
  if (!q || q.deletedAt) throw new ForbiddenError("Question not found.");
  const ix = await skillKeyIndex(repo, s(actor.schoolId));
  if (actor.role !== "SUPER_ADMIN" && !ix.keyOf.has(s(q.skillId))) throw new ForbiddenError("Question not found.");
  const it = (await loadQuestionItems(repo, [s(questionId)]))[0];
  if (!it) throw new ForbiddenError("Question not found.");
  const key = ix.keyOf.get(s(q.skillId)) ?? "";
  return {
    questionId: it.questionId, skill: ix.nameOf.get(key) ?? "Skill", stem: it.stem,
    passage: it.passageText ? { title: it.passageTitle ?? null, text: it.passageText } : null,
    options: optionsOf(it), correctAnswer: correctAnswerText(it), why: s(it.explanation?.whyCorrect), band: bandOf(it.irt?.b),
  };
}
