/**
 * 🔎 Questions Log (Nov 2026, IXL-style): ONE student × ONE skill — every question they answered on it, newest
 * session first. For each answer: the question, the student's answer and the right one, the seconds it took, a hint
 * (💡), a rapid guess (⚡), and the mastery % after it (the engine's own log, AdaptiveDecisionLog); per session the
 * day, the clock time, school 🏫 or home 🏠 and the accuracy; a curve of the mastery % over the answers.
 *
 * Read only: nothing is written. Bank answers only (QuestionAttempt: skill practice, tests, lessons, reviews,
 * ReadMaster); live games never write answers there. NAFS and ReadRise have their own reports.
 * Access: a class the actor can read (readableClasses) and a student of that class — the same rule as Practice and
 * time. At most LOG_LIMIT answers (the newest) so the page stays light.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { skillKeyIndex, skillStatusesFor, displayScore, practiceSessionIds } from "../skills/status";
import { correctAnswerText, loadQuestionItems, studentAnswerText } from "../practice/items";
import { atSchool, riyadhDay, riyadhMinute, SOURCE_LABEL, type AnswerSource } from "./practice";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ms = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
const RIYADH = 3 * 3_600_000;
/** the newest answers shown (older ones are counted, not listed) */
export const LOG_LIMIT = 300;

export interface LogAnswer {
  /** 1 = the oldest shown answer */
  n: number; questionId: string; at: string; stem: string; passageTitle: string | null;
  yourAnswer: string; correctAnswer: string; correct: boolean; partial: boolean;
  seconds: number; hint: boolean; guess: boolean; why: string;
  /** mastery % after this answer (null: no engine log for it) */
  score: number | null;
  /** the question is no longer in the bank (deleted or unpublished since) */
  missing: boolean;
}
export interface LogSession {
  id: string; day: string; weekday: number; startMin: number; endMin: number; atSchool: boolean;
  source: AnswerSource; sourceLabel: string; answered: number; correct: number; accuracy: number | null; answers: LogAnswer[];
}
export interface QuestionsLog {
  classId: string; className: string; student: { id: string; name: string }; skill: { key: string; skillId: string; name: string };
  totals: { answered: number; correct: number; accuracy: number | null; minutes: number; hints: number; guesses: number; scoreNow: number | null; status: string | null };
  /** the mastery % after each answer, oldest first (for the curve); `session` changes mark a new session */
  curve: { n: number; score: number; session: number }[];
  /** newest session first */
  sessions: LogSession[];
  /** older answers that are not listed (over LOG_LIMIT) */
  older: number;
}
export interface LoggedSkill { key: string; skillId: string; name: string; answered: number; last: string }

async function access(repo: Repo, actor: Actor, classId: string, studentId: string): Promise<{ klass: Row; schoolId: string }> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => s(c.id) === s(classId));
  if (!klass) throw new ForbiddenError("Class not found.");
  if (!(await classMembers(repo, s(classId))).includes(s(studentId))) throw new ForbiddenError("This student is not in the class.");
  return { klass, schoolId: s(klass.schoolId) || s(actor.schoolId) };
}

/** source of one bank answer: practice (builds ⭐), tests & checks, or lessons / reviews / ReadMaster */
async function sourcesOf(repo: Repo, rows: Row[]): Promise<Map<string, AnswerSource>> {
  const practice = await practiceSessionIds(repo, [...new Set(rows.filter((r) => !s(r.source)).map((r) => s(r.sessionId)))]);
  const out = new Map<string, AnswerSource>();
  for (const r of rows) out.set(s(r.sessionId), s(r.source) ? "OTHER" : practice.has(s(r.sessionId)) ? "PRACTICE" : "TESTS");
  return out;
}

/** The skills this student answered (newest first) — the picker when no skill is chosen. */
export async function loggedSkills(repo: Repo, actor: Actor, input: { classId: string; studentId: string }): Promise<LoggedSkill[]> {
  const { schoolId } = await access(repo, actor, input.classId, input.studentId);
  const [rows, ix] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: input.studentId }, { select: ["skillId", "createdAt", "source"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 4000 }),
    skillKeyIndex(repo, schoolId),
  ]);
  const by = new Map<string, LoggedSkill>();
  for (const r of rows) {
    if (s(r.source) === "GAME" || !s(r.skillId)) continue;
    const key = ix.keyOf.get(s(r.skillId)) ?? `skill:${s(r.skillId)}`;
    const e = by.get(key) ?? { key, skillId: s(r.skillId), name: ix.nameOf.get(key) ?? "Skill", answered: 0, last: riyadhDay(ms(r.createdAt)) };
    e.answered++; by.set(key, e);
  }
  return [...by.values()];
}

/** The log of one student on one skill (`skill` = the shared skill key, or any skill id of it). */
export async function questionsLog(repo: Repo, actor: Actor, input: { classId: string; studentId: string; skill: string; missedOnly?: boolean }): Promise<QuestionsLog> {
  const { klass, schoolId } = await access(repo, actor, input.classId, input.studentId);
  const ix = await skillKeyIndex(repo, schoolId);
  const key = ix.skillsOf.has(input.skill) ? input.skill : ix.keyOf.get(input.skill) ?? "";
  const skillIds = key ? ix.skillsOf.get(key) ?? [] : [];
  if (!skillIds.length) throw new ForbiddenError("Skill not found.");

  const [names, rowsDesc, total, stars] = await Promise.all([
    studentNames(repo, [input.studentId]),
    repo.findMany("QuestionAttempt", { studentId: input.studentId, skillId: { in: skillIds } }, {
      select: ["id", "sessionId", "questionId", "response", "isCorrect", "partialCredit", "responseMs", "usedHint", "rapidGuess", "createdAt", "source"],
      orderBy: [{ field: "createdAt", dir: "desc" }], take: LOG_LIMIT + 50,
    }),
    repo.count("QuestionAttempt", { studentId: input.studentId, skillId: { in: skillIds } }).catch(() => 0),
    skillStatusesFor(repo, [input.studentId]).catch(() => new Map()),
  ]);
  // live games never count here (they never change a level, star or score)
  const rows = rowsDesc.filter((r) => s(r.source) !== "GAME").slice(0, LOG_LIMIT).reverse();
  const qids = [...new Set(rows.map((r) => s(r.questionId)))];
  const [items, logs, srcOf] = await Promise.all([
    loadQuestionItems(repo, qids),
    rows.length ? repo.findMany("AdaptiveDecisionLog", { attemptId: { in: rows.map((r) => r.id) } }, { select: ["attemptId", "masteryAfter"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    sourcesOf(repo, rows),
  ]);
  const itemOf = new Map(items.map((it) => [it.questionId, it]));
  const scoreOf = new Map(logs.filter((l) => l.masteryAfter !== null && l.masteryAfter !== undefined).map((l) => [s(l.attemptId), Math.max(0, Math.min(100, Math.round(Number(l.masteryAfter))))]));

  // every answer, oldest first, numbered
  const all: (LogAnswer & { session: string; atMs: number; ms: number })[] = rows.map((r, i) => {
    const it = itemOf.get(s(r.questionId));
    const value = json<{ value?: unknown }>(r.response, {}).value;
    const time = Math.max(0, Number(r.responseMs) || 0);
    return {
      n: i + 1, questionId: s(r.questionId), at: new Date(ms(r.createdAt)).toISOString(), session: s(r.sessionId), atMs: ms(r.createdAt), ms: time,
      stem: it ? it.stem : "", passageTitle: it?.passageTitle ?? null,
      yourAnswer: it ? studentAnswerText(it, value) : "", correctAnswer: it ? correctAnswerText(it) : "",
      correct: Boolean(r.isCorrect), partial: r.partialCredit !== null && r.partialCredit !== undefined && Number(r.partialCredit) > 0 && Number(r.partialCredit) < 1,
      seconds: Math.round(time / 1000), hint: Boolean(r.usedHint), guess: Boolean(r.rapidGuess), why: s(it?.explanation?.whyCorrect),
      score: scoreOf.get(s(r.id)) ?? null, missing: !it,
    };
  });

  // sessions (in answer order), then newest first
  const order: string[] = []; const bySession = new Map<string, typeof all>();
  for (const a of all) { if (!bySession.has(a.session)) { bySession.set(a.session, []); order.push(a.session); } bySession.get(a.session)!.push(a); }
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
  const curve: QuestionsLog["curve"] = [];
  order.forEach((id, si) => { for (const a of bySession.get(id)!) if (a.score !== null) curve.push({ n: a.n, score: a.score, session: si }); });
  const sessions: LogSession[] = order.map((id) => {
    const list = bySession.get(id)!;
    const begin = list[0].atMs - Math.min(5 * 60_000, list[0].ms), end = list[list.length - 1].atMs;
    const correct = list.filter((a) => a.correct).length;
    const src = srcOf.get(id) ?? "PRACTICE";
    const shown = input.missedOnly ? list.filter((a) => !a.correct) : list;
    return {
      id, day: riyadhDay(begin), weekday: new Date(begin + RIYADH).getUTCDay(), startMin: riyadhMinute(begin), endMin: riyadhMinute(end), atSchool: atSchool(begin),
      source: src, sourceLabel: SOURCE_LABEL[src], answered: list.length, correct, accuracy: pct(correct, list.length),
      answers: shown.map(({ session: _s, atMs: _a, ms: _m, ...a }) => a).reverse(),
    };
  }).reverse().filter((x) => !input.missedOnly || x.answers.length > 0);

  const v = stars.get(input.studentId)?.get(key);
  const correct = all.filter((a) => a.correct).length;
  return {
    classId: s(klass.id), className: s(klass.name), student: { id: input.studentId, name: names.get(input.studentId)?.name ?? "Student" },
    skill: { key, skillId: skillIds[0], name: ix.nameOf.get(key) ?? "Skill" },
    totals: {
      answered: all.length, correct, accuracy: pct(correct, all.length), minutes: Math.round(all.reduce((x, a) => x + Math.min(5 * 60_000, a.ms), 0) / 60_000),
      hints: all.filter((a) => a.hint).length, guesses: all.filter((a) => a.guess).length,
      scoreNow: v ? displayScore(v.score, v.answered) : null, status: v ? s(v.status) : null,
    },
    curve, sessions, older: Math.max(0, Number(total) - all.length - rowsDesc.filter((r) => s(r.source) === "GAME").length),
  };
}
