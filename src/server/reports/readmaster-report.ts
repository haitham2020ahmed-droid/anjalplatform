/**
 * ⭐ ReadMaster results (Update 39C, readiness I-23): articles read, the ReadMaster reading Lexile over time (ReadMaster's
 * own level, named as on its pages — it is not MAP's Lexile and not the ReadRise Level), accuracy by question type and
 * the time spent. Before this, results existed only per article on an admin page.
 *
 * Definitions
 *   articles       ReadMasterAttempt rows (one per article: an article is read once) in the window; total = all time
 *   reading Lexile start = the Lexile before the first article in the window (lexileBefore); now = the saved
 *                  ReadMaster Lexile (StudentReadingLexile); change = now − start
 *   accuracy       correct ÷ questions of the articles (the article score, as students see it)
 *   by type        ReadMaster answers saved through the engine (QuestionAttempt.source READMASTER), per question
 *                  type, rapid guesses left out
 *   time           seconds from opening the article to submitting (recorded since Update 39C; older articles “—”)
 *   rapid          answers faster than the rapid-guess line (timed articles only)
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { studentNames } from "../insights/student-data";
import { DAY, findIn, pct, reportClass, reportStudent, s, time } from "./report-access";

export const TYPE_NAMES: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple choice", MULTI_SELECT: "Choose all that apply", TRUE_FALSE: "True / false", FILL_BLANK: "Fill in the blank", DROPDOWN: "Drop-down",
  MATCHING: "Matching", SENTENCE_ORDER: "Order the sentences", WORD_ORDER: "Order the words", ERROR_CORRECTION: "Find the error", SHORT_ANSWER: "Short answer",
  TWO_PART: "Two-part", HOT_TEXT: "Hot text", GRID: "Grid",
};
export interface TypeRow { type: string; name: string; answers: number; accuracy: number | null; rapid: number }
export interface RmStudentRow { studentId: string; name: string; articles: number; totalArticles: number; lexileStart: number | null; lexileNow: number | null; change: number | null; accuracy: number | null; minutes: number | null; timedArticles: number; rapid: number | null; lastRead: string | null }
export interface ReadMasterClassReport {
  classId: string; className: string; grade: number; days: number;
  summary: { students: number; readers: number; articles: number; accuracy: number | null; avgChange: number | null; minutes: number | null; rapidPct: number | null };
  students: RmStudentRow[]; types: TypeRow[];
}

async function typesOf(repo: Repo, attempts: Row[]): Promise<TypeRow[]> {
  if (!attempts.length) return [];
  const qs = await findIn(repo, "Question", "id", [...new Set(attempts.map((a) => s(a.questionId)))], {}, ["id", "typeId"]);
  const types = qs.length ? await findIn(repo, "QuestionType", "id", [...new Set(qs.map((q) => s(q.typeId)))], {}, ["id", "code"]) : [];
  const codeOf = new Map(qs.map((q) => [s(q.id), s(types.find((t) => t.id === q.typeId)?.code)]));
  const by = new Map<string, Row[]>();
  for (const a of attempts) { const c = codeOf.get(s(a.questionId)) || "OTHER"; by.set(c, [...(by.get(c) ?? []), a]); }
  return [...by].map(([type, list]) => { const careful = list.filter((a) => !a.rapidGuess); return { type, name: TYPE_NAMES[type] ?? type.replace(/_/g, " ").toLowerCase(), answers: list.length, accuracy: pct(careful.filter((a) => a.isCorrect).length, careful.length), rapid: list.length - careful.length }; })
    .sort((a, b) => b.answers - a.answers);
}

function studentRow(id: string, name: string, all: Row[], from: number, lexileNow: number | null): RmStudentRow {
  const mine = all.filter((a) => s(a.studentId) === id).sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const inWin = mine.filter((a) => time(a.createdAt) >= from);
  const correct = inWin.reduce((t, a) => t + Number(a.correct), 0), total = inWin.reduce((t, a) => t + Number(a.total), 0);
  const timed = inWin.filter((a) => a.seconds !== null && a.seconds !== undefined);
  const start = inWin.length ? Number(inWin[0].lexileBefore) : null;
  const now = lexileNow ?? (mine.length ? Number(mine[mine.length - 1].lexileAfter) : null);
  const rapidRows = inWin.filter((a) => a.rapid !== null && a.rapid !== undefined);
  return {
    studentId: id, name, articles: inWin.length, totalArticles: mine.length, lexileStart: start, lexileNow: now, change: start !== null && now !== null ? now - start : null,
    accuracy: pct(correct, total), minutes: timed.length ? Math.round(timed.reduce((t, a) => t + Number(a.seconds), 0) / 60) : null, timedArticles: timed.length,
    rapid: rapidRows.length ? rapidRows.reduce((t, a) => t + Number(a.rapid), 0) : null, lastRead: mine.length ? new Date(time(mine[mine.length - 1].createdAt)).toISOString().slice(0, 10) : null,
  };
}

export async function classReadMasterReport(repo: Repo, actor: Actor, classId: string, opts: { days?: number; now?: Date } = {}): Promise<ReadMasterClassReport> {
  const now = opts.now ?? new Date(), days = opts.days ?? 90;
  const { klass, grade, ids } = await reportClass(repo, actor, classId);
  const from = now.getTime() - days * DAY;
  const [atts, lex, names, answers] = await Promise.all([
    findIn(repo, "ReadMasterAttempt", "studentId", ids),
    findIn(repo, "StudentReadingLexile", "studentId", ids, {}, ["studentId", "lexile"]),
    studentNames(repo, ids),
    findIn(repo, "QuestionAttempt", "studentId", ids, { source: "READMASTER", createdAt: { gte: new Date(from) } }, ["studentId", "questionId", "isCorrect", "rapidGuess"]),
  ]);
  const lexOf = new Map(lex.map((l) => [s(l.studentId), Number(l.lexile)]));
  const rows = ids.map((id) => studentRow(id, names.get(id)?.name ?? "Student", atts, from, lexOf.get(id) ?? null)).sort((a, b) => a.name.localeCompare(b.name));
  const inWin = atts.filter((a) => time(a.createdAt) >= from);
  const readers = rows.filter((r) => r.articles > 0);
  const changes = readers.map((r) => r.change).filter((v): v is number => v !== null);
  const timed = inWin.filter((a) => a.seconds !== null && a.seconds !== undefined);
  const rapidRows = inWin.filter((a) => a.rapid !== null && a.rapid !== undefined);
  return {
    classId, className: s(klass.name), grade, days,
    summary: {
      students: ids.length, readers: readers.length, articles: inWin.length, accuracy: pct(inWin.reduce((t, a) => t + Number(a.correct), 0), inWin.reduce((t, a) => t + Number(a.total), 0)),
      avgChange: changes.length ? Math.round(changes.reduce((a, b) => a + b, 0) / changes.length) : null, minutes: timed.length ? Math.round(timed.reduce((t, a) => t + Number(a.seconds), 0) / 60) : null,
      rapidPct: rapidRows.length ? pct(rapidRows.reduce((t, a) => t + Number(a.rapid), 0), rapidRows.reduce((t, a) => t + Number(a.total), 0)) : null,
    },
    students: rows, types: await typesOf(repo, answers),
  };
}

export interface ReadMasterStudentReport {
  studentId: string; name: string; grade: number; row: RmStudentRow;
  articles: { date: string; title: string; version: string; lexileBefore: number; lexileAfter: number; correct: number; total: number; minutes: number | null; rapid: number | null }[];
  types: TypeRow[];
}

export async function studentReadMasterReport(repo: Repo, actor: Actor, studentId: string, opts: { days?: number; now?: Date } = {}): Promise<ReadMasterStudentReport> {
  const now = opts.now ?? new Date(), days = opts.days ?? 365;
  const st = await reportStudent(repo, actor, studentId);
  const from = now.getTime() - days * DAY;
  const [atts, lex, names, g, answers] = await Promise.all([
    repo.findMany("ReadMasterAttempt", { studentId }), repo.findUnique("StudentReadingLexile", { studentId }), studentNames(repo, [studentId]), repo.findUnique("Grade", { id: st.gradeId }),
    repo.findMany("QuestionAttempt", { studentId, source: "READMASTER", createdAt: { gte: new Date(from) } }, { select: ["studentId", "questionId", "isCorrect", "rapidGuess"] }),
  ]);
  const arts = atts.length ? await repo.findMany("ReadMasterArticle", { id: { in: [...new Set(atts.map((a) => s(a.articleId)))] } }, { select: ["id", "title"] }) : [];
  const name = names.get(studentId)?.name ?? "Student";
  return {
    studentId, name, grade: Number(g?.level ?? 0), row: studentRow(studentId, name, atts, from, lex ? Number(lex.lexile) : null),
    articles: atts.filter((a) => time(a.createdAt) >= from).sort((a, b) => time(a.createdAt) - time(b.createdAt)).map((a) => ({
      date: new Date(time(a.createdAt)).toISOString().slice(0, 10), title: s(arts.find((x) => x.id === a.articleId)?.title ?? "Article"), version: s(a.level),
      lexileBefore: Number(a.lexileBefore), lexileAfter: Number(a.lexileAfter), correct: Number(a.correct), total: Number(a.total),
      minutes: a.seconds === null || a.seconds === undefined ? null : Math.round(Number(a.seconds) / 6) / 10, rapid: a.rapid === null || a.rapid === undefined ? null : Number(a.rapid),
    })),
    types: await typesOf(repo, answers),
  };
}
