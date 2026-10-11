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
import { assertClassRead, readableClasses } from "../teacher/coordinators";
import type { Actor } from "../auth/rbac";
import { studentNames } from "../insights/student-data";
import { avg, DAY, findIn, isStaff, pct, reportClass, reportSchool, reportStudent, s, time } from "./report-access";
import { ForbiddenError } from "../auth/rbac";

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
  articles: { date: string; title: string; version: string; lexileBefore: number; lexileAfter: number; correct: number; total: number; minutes: number | null; rapid: number | null; practice: boolean }[];
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
      practice: Boolean(a.practice),
    })),
    types: await typesOf(repo, answers),
  };
}

// ------------------------------------------------------------------ ReadMaster analytics (the ReadMaster page update)

/**
 * ⭐ ReadMaster analytics for the Reports hub: per student, per text, per skill and the students reading below their
 * level. Scope (server-enforced, typed URLs too):
 *   class   one class the actor can read (its teacher, a grade coordinator, a school admin) — assertClassRead
 *   mine    every class the actor can read (a teacher: their own classes)
 *   school  the whole school — analytics:school (school admins only)
 * Counted = read at the student's own level or higher (moves the reading Lexile); Practice = a lower level (no change).
 * Reads are ReadMasterAttempt rows in the window (bounded: chunked reads, only the scope's students).
 */
export type RmScope = "class" | "mine" | "school";
type Lv = "BELOW" | "ON" | "ABOVE";
const LVS: Lv[] = ["BELOW", "ON", "ABOVE"];
export interface RmaStudent { studentId: string; name: string; grade: number | null; texts: number; counted: number; practice: number; avgScore: number | null; practiceScore: number | null; lexileStart: number | null; lexileNow: number | null; change: number | null; lastRead: string | null }
export interface RmaText { articleId: string; title: string; grade: number; skill: string; readers: number; reads: number; practice: number; avgScore: number | null; byLevel: Record<Lv, { reads: number; avg: number | null }> }
export interface RmaSkill { skill: string; texts: number; readers: number; counted: number; accuracy: number | null; practice: number; practiceAccuracy: number | null }
export interface RmaBelow { studentId: string; name: string; grade: number | null; lower: number; reads: number; share: number | null; last: string | null }
export interface ReadMasterAnalytics {
  scope: RmScope; classId: string | null; label: string; days: number;
  summary: { students: number; readers: number; reads: number; counted: number; practice: number; avgScore: number | null; avgChange: number | null; belowReaders: number };
  students: RmaStudent[]; texts: RmaText[]; skills: RmaSkill[]; below: RmaBelow[];
}

async function scopeStudents(repo: Repo, actor: Actor, scope: RmScope, classId: string | null): Promise<{ ids: string[]; label: string }> {
  if (!isStaff(actor)) throw new ForbiddenError("You cannot open this report.");
  if (scope === "class") {
    if (!classId) throw new ForbiddenError("Choose a class.");
    const { klass, ids } = await reportClass(repo, actor, classId);
    return { ids, label: s(klass.name) };
  }
  if (scope === "school") {
    const schoolId = reportSchool(actor);
    const st = await repo.findMany("Student", { schoolId, deletedAt: null }, { select: ["id"] });
    return { ids: st.map((x) => s(x.id)), label: "Whole school" };
  }
  const classes = await readableClasses(repo, actor);
  const members = await findIn(repo, "ClassMembership", "classId", classes.map((c) => s(c.id)), { leftAt: null }, ["studentId"]);
  return { ids: [...new Set(members.map((m) => s(m.studentId)))], label: "All my classes" };
}

export async function readMasterAnalytics(repo: Repo, actor: Actor, opts: { scope?: RmScope; classId?: string | null; days?: number; now?: Date } = {}): Promise<ReadMasterAnalytics> {
  const now = opts.now ?? new Date(), days = opts.days ?? 90, scope: RmScope = opts.scope ?? (opts.classId ? "class" : "mine");
  if (scope === "class" && opts.classId) await assertClassRead(repo, actor, opts.classId);
  const { ids, label } = await scopeStudents(repo, actor, scope, opts.classId ?? null);
  const from = now.getTime() - days * DAY;
  const [atts, lex, studs] = await Promise.all([
    findIn(repo, "ReadMasterAttempt", "studentId", ids, { createdAt: { gte: new Date(from) } }, ["studentId", "articleId", "level", "lexileBefore", "lexileAfter", "correct", "total", "practice", "createdAt"]),
    findIn(repo, "StudentReadingLexile", "studentId", ids, {}, ["studentId", "lexile"]),
    findIn(repo, "Student", "id", ids, {}, ["id", "gradeId"]),
  ]);
  atts.sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const readerIds = [...new Set(atts.map((a) => s(a.studentId)))];
  // names: every student of a class; only the readers for the wider scopes (bounded)
  const nameIds = scope === "class" ? ids : readerIds;
  const names = new Map<string, string>();
  for (let i = 0; i < nameIds.length; i += 500) for (const [k, v] of await studentNames(repo, nameIds.slice(i, i + 500))) names.set(k, v.name);
  const gradeRows = studs.length ? await findIn(repo, "Grade", "id", [...new Set(studs.map((x) => s(x.gradeId)).filter(Boolean))], {}, ["id", "level"]) : [];
  const gradeOf = new Map(studs.map((x) => [s(x.id), Number(gradeRows.find((g) => g.id === x.gradeId)?.level ?? 0) || null]));
  const arts = atts.length ? await findIn(repo, "ReadMasterArticle", "id", [...new Set(atts.map((a) => s(a.articleId)))], {}, ["id", "title", "gradeLevel", "skillName"]) : [];
  const artOf = new Map(arts.map((a) => [s(a.id), a]));
  const lexOf = new Map(lex.map((l) => [s(l.studentId), Number(l.lexile)]));
  const scoreOf = (a: Row) => (Number(a.total) ? (100 * Number(a.correct)) / Number(a.total) : 0);
  const mean = (rows: Row[]) => (rows.length ? Math.round(rows.reduce((t, a) => t + scoreOf(a), 0) / rows.length) : null);
  const day = (a: Row | undefined) => (a ? new Date(time(a.createdAt)).toISOString().slice(0, 10) : null);
  const by = <K>(rows: Row[], key: (r: Row) => K) => { const m = new Map<K, Row[]>(); for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); } return m; };
  const perStudent = by(atts, (a) => s(a.studentId));

  const students: RmaStudent[] = (scope === "class" ? ids : readerIds).map((id) => {
    const mine = perStudent.get(id) ?? [];
    const counted = mine.filter((a) => !a.practice), practice = mine.filter((a) => a.practice);
    const start = counted.length ? Number(counted[0].lexileBefore) : mine.length ? Number(mine[0].lexileBefore) : null;
    const nowLx = lexOf.get(id) ?? null;
    return {
      studentId: id, name: names.get(id) ?? "Student", grade: gradeOf.get(id) ?? null, texts: new Set(mine.map((a) => s(a.articleId))).size, counted: counted.length, practice: practice.length,
      avgScore: mean(counted), practiceScore: mean(practice), lexileStart: start, lexileNow: nowLx, change: start !== null && nowLx !== null ? nowLx - start : null, lastRead: day(mine[mine.length - 1]),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const texts: RmaText[] = [...by(atts, (a) => s(a.articleId))].map(([articleId, rows]) => {
    const a = artOf.get(articleId);
    const counted = rows.filter((r) => !r.practice);
    const byLevel = Object.fromEntries(LVS.map((l) => { const r = rows.filter((x) => s(x.level) === l); return [l, { reads: r.length, avg: mean(r) }]; })) as Record<Lv, { reads: number; avg: number | null }>;
    return { articleId, title: s(a?.title ?? "Article"), grade: Number(a?.gradeLevel ?? 0), skill: s(a?.skillName) || "—", readers: new Set(rows.map((r) => s(r.studentId))).size, reads: rows.length, practice: rows.length - counted.length, avgScore: mean(counted.length ? counted : rows), byLevel };
  }).sort((a, b) => b.readers - a.readers || a.title.localeCompare(b.title));

  const skills: RmaSkill[] = [...by(atts, (a) => s(artOf.get(s(a.articleId))?.skillName) || "No skill")].map(([skill, rows]) => {
    const counted = rows.filter((r) => !r.practice), practice = rows.filter((r) => r.practice);
    const acc = (list: Row[]) => pct(list.reduce((t, a) => t + Number(a.correct), 0), list.reduce((t, a) => t + Number(a.total), 0));
    return { skill, texts: new Set(rows.map((r) => s(r.articleId))).size, readers: new Set(rows.map((r) => s(r.studentId))).size, counted: counted.length, accuracy: acc(counted), practice: practice.length, practiceAccuracy: acc(practice) };
  }).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.counted - a.counted);

  const below: RmaBelow[] = readerIds.map((id) => {
    const mine = perStudent.get(id) ?? [];
    const lower = mine.filter((a) => a.practice);
    return { studentId: id, name: names.get(id) ?? "Student", grade: gradeOf.get(id) ?? null, lower: lower.length, reads: mine.length, share: pct(lower.length, mine.length), last: day(lower[lower.length - 1]) };
  }).filter((x) => x.lower > 0).sort((a, b) => b.lower - a.lower || (b.share ?? 0) - (a.share ?? 0) || a.name.localeCompare(b.name));

  const changes = students.filter((x) => x.counted > 0 && x.change !== null).map((x) => x.change as number);
  const counted = atts.filter((a) => !a.practice);
  return {
    scope, classId: scope === "class" ? opts.classId ?? null : null, label, days,
    summary: { students: ids.length, readers: readerIds.length, reads: atts.length, counted: counted.length, practice: atts.length - counted.length, avgScore: mean(counted), avgChange: avg(changes), belowReaders: below.length },
    students, texts, skills, below,
  };
}
