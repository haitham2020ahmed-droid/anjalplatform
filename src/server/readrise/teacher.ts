/**
 * 🚀 ReadRise — the teacher's actions on the dashboard.
 *
 *   teacherReadRiseClasses   classes the teacher may open (own + coordinated grades; admins every class)
 *   assignArticle            put a published, visible article on a class's list (RRClassArticle, optional due date)
 *   unassignArticle / classArticles
 *   scoreWriting             score a written answer 0–4 with a comment (the student's teacher or a school admin)
 *   setStudentLevel          manual level set with a reason → RRStudent.source TEACHER + an RRLevelChange
 *   allowPlacementRetake     lets a student take the placement test again (once per term)
 *
 * Writes need a class the teacher TEACHES (coordinators may read other classes but not change them).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { accessibleClasses } from "../teacher/assign";
import { readableClasses } from "../teacher/coordinators";
import { ENGINE, assertStaffForStudent, setLevelByTeacher } from "./engine";
import { teacherResetPlacement } from "./placement";
import { canView, hiddenArticleIds } from "./library";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { visibleArticles } from "./student";
import { questionKeys } from "./question-key";
import { normalisedSkill, baseBand } from "./first-try";
import { weekStart as rrWeekStart, riyadhDay } from "./engine";
import { readAnnotations, withRunExtras } from "../../components/readrise/text";
import { formatLevel } from "./level";
import { runTitle, versionTitles } from "./version-title";
import { forgetStudentPoints } from "./points";

const s = (v: unknown) => String(v ?? "");
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

export interface RRClassOption { id: string; name: string; grade: number; own: boolean }

/** Classes for the class selector, sorted by grade then name. */
export async function teacherReadRiseClasses(repo: Repo, actor: Actor): Promise<RRClassOption[]> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can open ReadRise reports.");
  const [read, own] = await Promise.all([readableClasses(repo, actor), accessibleClasses(repo, actor)]);
  const ownIds = new Set(own.map((c) => s(c.id)));
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(read.map((c) => s(c.gradeId)))] } });
  const gl = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  return read.map((c) => ({ id: s(c.id), name: s(c.name), grade: gl.get(s(c.gradeId)) ?? 0, own: ownIds.has(s(c.id)) }))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** A class the actor teaches (or any class of an admin's school). Exported so multi-class callers can validate
 * every class BEFORE writing anything (all-or-nothing), instead of discovering a bad class mid-loop. */
export async function assertClassWrite(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can assign ReadRise articles.");
  assertCan(actor, "assignments:create");
  const c = (await accessibleClasses(repo, actor)).find((k) => s(k.id) === classId);
  if (!c) throw new ForbiddenError("You can only assign articles to classes you teach.");
  return c;
}

/** Puts an article on a class's list (students still read the version of their own level). Re-assigning updates the due date. */
export async function assignArticle(repo: Repo, actor: Actor, classId: string, articleId: string, dueAt: Date | null, now = new Date(), startAt: Date | null = null): Promise<{ created: boolean }> {
  await assertClassWrite(repo, actor, classId);
  const a = await repo.findUnique("RRArticle", { id: articleId });
  const hidden = await hiddenArticleIds(repo, actor.schoolId);
  if (!a || !canView(actor, a, hidden) || a.status !== "PUBLISHED" || hidden.has(articleId)) throw new ValidationError("Choose a published article from the library.");
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new ValidationError("The due date is not valid.");
  if (startAt && dueAt && dueAt.getTime() < startAt.getTime()) throw new ValidationError("The end (due) date must be on or after the start date.");
  const have = await repo.findUnique("RRClassArticle", { classId, articleId });
  // r68: the start date (students see it from that day); assigning again updates both dates
  await repo.upsert("RRClassArticle", { classId, articleId }, { classId, articleId, assignedById: actor.userId, dueAt, ...(startAt ? { startAt } : {}), createdAt: now }, { dueAt, startAt });
  await audit(repo, { actorId: actor.userId, action: "readrise.assign", entityType: "RRClassArticle", entityId: `${classId}:${articleId}`, after: { dueAt: dueAt?.toISOString() ?? null }, at: now });
  // 3 Nov 2026: assigning a cancelled article again brings it back for the class (its open cancels are restored)
  if (have) await repo.updateMany("AssignmentCancel", { kind: "READRISE", refId: s(have.id), restoredAt: null }, { restoredAt: now, restoredById: actor.userId }).catch(() => 0);
  return { created: !have };
}

export async function unassignArticle(repo: Repo, actor: Actor, classId: string, articleId: string, now = new Date()): Promise<void> {
  await assertClassWrite(repo, actor, classId);
  await repo.deleteMany("RRClassArticle", { classId, articleId });
  await audit(repo, { actorId: actor.userId, action: "readrise.unassign", entityType: "RRClassArticle", entityId: `${classId}:${articleId}`, at: now });
}

export interface AssignedClassRef { classId: string; className: string }

/**
 * 🚦 "Already assigned" badge on the Library catalog (owner request, Oct 2026): every article this teacher has
 * assigned, and to which of their OWN classes — so the Library page can show "✓ Assigned — 6A" without the
 * teacher opening the separate Assign tab just to check. Admins (no "my classes" here) and a teacher with no
 * classes of their own get an empty map — the Library page then shows no badges, same as today.
 */
export async function assignedClassesByArticle(repo: Repo, actor: Actor): Promise<Map<string, AssignedClassRef[]>> {
  if (actor.role !== "TEACHER") return new Map();
  const mine = (await teacherReadRiseClasses(repo, actor)).filter((c) => c.own);
  if (!mine.length) return new Map();
  const links = await repo.findMany("RRClassArticle", { classId: { in: mine.map((c) => c.id) } }, { select: ["articleId", "classId"] });
  const nameOf = new Map(mine.map((c) => [c.id, c.name]));
  const out = new Map<string, AssignedClassRef[]>();
  for (const l of links) {
    const articleId = s(l.articleId), classId = s(l.classId);
    out.set(articleId, [...(out.get(articleId) ?? []), { classId, className: nameOf.get(classId) ?? "" }]);
  }
  return out;
}

export interface ClassArticleRow { articleId: string; code: string; title: string; topic: string; dueAt: string | null; assignedAt: string; done: number; students: number }

/** The class's assigned articles with how many students finished each (first try). */
export async function classArticles(repo: Repo, actor: Actor, classId: string): Promise<ClassArticleRow[]> {
  const read = await readableClasses(repo, actor);
  if (!read.some((c) => s(c.id) === classId)) throw new ForbiddenError("You cannot open this class.");
  const links = await repo.findMany("RRClassArticle", { classId });
  if (!links.length) return [];
  const ids = links.map((l) => s(l.articleId));
  const [arts, members] = await Promise.all([
    repo.findMany("RRArticle", { id: { in: ids } }),
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
  ]);
  const sids = members.map((m) => s(m.studentId));
  const runs = sids.length ? await repo.findMany("RRRun", { studentId: { in: sids }, articleId: { in: ids } }, { select: ["studentId", "articleId", "completedAt"] }) : [];
  return links.map((l) => {
    const a = arts.find((x) => s(x.id) === s(l.articleId));
    const done = new Set(runs.filter((r) => s(r.articleId) === s(l.articleId) && r.completedAt).map((r) => s(r.studentId))).size;
    return {
      articleId: s(l.articleId), code: s(a?.code), title: a ? s(a.title) : "(deleted article)", topic: s(a?.topic),
      dueAt: l.dueAt ? new Date(l.dueAt as string | Date).toISOString() : null, assignedAt: new Date(l.createdAt as string | Date).toISOString(), done, students: sids.length,
    };
  }).filter((r) => r.code).sort((a, b) => s(a.dueAt ?? "9").localeCompare(s(b.dueAt ?? "9")) || a.title.localeCompare(b.title));
}

/** Scores a written answer (0–4) with an optional comment. Only the student's teacher or a school admin. */
export async function scoreWriting(repo: Repo, actor: Actor, runId: string, score: number, comment: string, now = new Date(), extra?: GradingExtra): Promise<void> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can score writing.");
  const run = await repo.findUnique("RRRun", { id: runId });
  if (!run) throw new ValidationError("This answer does not exist.");
  await assertStaffForStudent(repo, actor, s(run.studentId));
  if (!s(run.writing).trim()) throw new ValidationError("There is no written answer to score.");
  if (!Number.isInteger(score) || score < 0 || score > 4) throw new ValidationError("The score must be 0, 1, 2, 3 or 4.");
  const text = comment.trim();
  if (text.length > 1000) throw new ValidationError("The comment is too long (1,000 characters at most).");
  // round 6 (Grading Center): the points choice, the rubric and the badges go into RRRun.annotations (no schema change)
  const meta = extra ? cleanGradingExtra(extra) : null;
  // 🔒 annotations is one JSON value the reader writes too: lock the row first (a no-op update), read it again inside
  // the transaction and merge there — the same rule as the reader's writers (student.ts lockedRun)
  await repo.transaction(async (tx) => {
    await tx.updateMany("RRRun", { id: runId }, { studentId: run.studentId });
    const cur = meta ? await tx.findUnique("RRRun", { id: runId }) : null;
    await tx.updateMany("RRRun", { id: runId }, { writingScore: score, writingComment: text || null, writingScoredById: actor.userId, ...(meta ? { annotations: withRunMeta(cur?.annotations ?? run.annotations, { ...meta, gradedAt: now.toISOString() }) } : {}) });
  });
  forgetStudentPoints(repo, s(run.studentId)); // the writing score and teacher badges earn points (points.ts)
  await audit(repo, { actorId: actor.userId, action: "readrise.writing.score", entityType: "RRRun", entityId: runId, before: { writingScore: run.writingScore ?? null }, after: { writingScore: score }, at: now });
}

/** Manual level set by the teacher (a reason is required); recorded as a teacher change. */
export async function setStudentLevel(repo: Repo, actor: Actor, studentId: string, level: number, reason: string, now = new Date()): Promise<{ from: number; to: number }> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can set a ReadRise Level.");
  if (!Number.isFinite(level) || level < ENGINE.min || level > ENGINE.max) throw new ValidationError(`Enter a ReadRise Level from ${formatLevel(ENGINE.min)} (type ${ENGINE.min}) to ${formatLevel(ENGINE.max)}.`); // round 6: levels may be below 0 (BR)
  const why = reason.trim();
  if (why.length < 3) throw new ValidationError("Write a short reason for the change (for example: “MAP reading 820 in the winter test”).");
  const r = await setLevelByTeacher(repo, actor, studentId, level, why.slice(0, 250), now);
  await audit(repo, { actorId: actor.userId, action: "readrise.level.teacher", entityType: "RRStudent", entityId: studentId, before: { level: r.from }, after: { level: r.to, reason: why.slice(0, 250) }, at: now });
  return r;
}

/** Allows one placement retake (once per term; see placement.ts). */
export async function allowPlacementRetake(repo: Repo, actor: Actor, studentId: string, reason = "", now = new Date()): Promise<{ restarted: boolean }> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can allow a placement retake.");
  const r = await teacherResetPlacement(repo, actor, studentId, reason.trim().slice(0, 200), now);
  await audit(repo, { actorId: actor.userId, action: r.restarted ? "readrise.placement.restart" : "readrise.placement.retake", entityType: "RRStudent", entityId: studentId, at: now });
  return { restarted: Boolean(r.restarted) };
}

// ================================================================== round 6: Achieve3000-style teacher tools
//
//   runMeta / withRunMeta      extra run data kept in RRRun.annotations (no schema change): the student's 2nd-try score
//                              (secondTry, written by the reader) and the Grading Center's points, rubric and badges
//   gradingStudents / studentWritings / gradeWriting   the Grading Center (/teacher/readrise/grading)
//   classSettings / setClassSetting                    class toggles in SchoolSetting (feed, badges, weekly plan)
//   ensureWeeklyPlan / planByWeek                      Achieve-style weekly lesson plan (3 articles every Sunday)
//   teacherGuide                                       teacher materials from data/readrise/teacher-guides/RR-NNN.json

/** The Grading Center badges a teacher may award with a writing score. */
export const TEACHER_BADGES = ["Word Wiz", "Text-to-Self Connector", "Inquiring Mind", "Summarizer", "Literary Luminary"] as const;
/** A badge's stored code (points.ts TEACHER_BADGES codes: "Word Wiz" → "word-wiz"). */
export const badgeCode = (name: string): string => String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** A stored badge (code, name or { code | name }) → its name among TEACHER_BADGES, or null. */
const badgeName = (x: unknown): string | null => {
  const v = x && typeof x === "object" ? ((x as { code?: unknown; name?: unknown }).code ?? (x as { name?: unknown }).name) : x;
  return TEACHER_BADGES.find((b) => badgeCode(b) === badgeCode(String(v ?? ""))) ?? null;
};
/** The rubric rows (each 0–3). */
export const WRITING_RUBRIC = ["Answers the question", "Uses details from the article", "Uses vocabulary", "Clear sentences & conclusion"] as const;
/** The points choices and the 0–4 writing score each one is saved as (the student sees "n/4"). */
export const WRITING_POINTS = [
  { points: 5, label: "Okay response", score: 2 },
  { points: 10, label: "Good response", score: 3 },
  { points: 20, label: "Thoughtful, complete response", score: 4 },
] as const;
export const scoreForPoints = (points: number): number | null => WRITING_POINTS.find((p) => p.points === points)?.score ?? null;

export interface GradingExtra { points?: number; rubric?: number[]; badges?: string[] }
export interface RunMeta {
  /** the student's 2nd-try activity score when stored as a number (else computed from secondTryAnswers: secondTryScore) */
  secondTry: number | null;
  /** the reader's second tries (question number → letter; RRRun.annotations.secondTry) */
  secondTryAnswers: Record<string, string>;
  teacherBadges: string[];
  writingPoints: number | null;
  rubric: number[] | null;
}

const parseJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};
const scoreOf = (v: unknown): number | null => {
  const raw = v && typeof v === "object" ? (v as { score?: unknown }).score : v;
  if (raw === null || raw === undefined || raw === "" || typeof raw === "object") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * The extra data of a run's annotations — the reader's format (text.ts readAnnotations: { marks, …extras }; an old
 * plain list is all highlights): the 2nd tries (secondTry) and the Grading Center's points, rubric and badges. Pure.
 */
export function runMeta(annotations: unknown): RunMeta {
  const o = readAnnotations(annotations).extras as Record<string, unknown>;
  const rubric = Array.isArray(o.rubric) ? o.rubric.map((n) => Math.min(3, Math.max(0, Math.round(Number(n) || 0)))) : null;
  const st = o.secondTry;
  const answers = st && typeof st === "object" && !Array.isArray(st) && !("score" in (st as object))
    // the reader stores { "3": { letter: "B", correct: true } } (round 6 final format); a plain letter is also read
    ? Object.fromEntries(Object.entries(st as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, unknown>).letter ?? "") : ""]).filter(([, v]) => v)) : {};
  const badges = [...new Set((Array.isArray(o.teacherBadges) ? o.teacherBadges : []).map(badgeName).filter((b): b is string => !!b))];
  return { secondTry: scoreOf(st), secondTryAnswers: answers, teacherBadges: badges, writingPoints: scoreOf(o.writingPoints), rubric };
}

/** The annotations with extra data merged in (the highlights and the reader's extras kept: text.ts withRunExtras). Pure. */
export function withRunMeta(annotations: unknown, patch: Record<string, unknown>): unknown {
  return withRunExtras(parseJson(annotations), patch);
}

/**
 * The 2nd-try score (pure): the shown questions (the run's first answers) right on the first OR the second try, in %.
 * null when there was no second try.
 */
export function secondTryScore(first: unknown, second: Record<string, string>, key: readonly { number: number; answer: string }[]): number | null {
  const ans = parseJson(first);
  const a = ans && typeof ans === "object" ? (ans as Record<string, unknown>) : {};
  const shown = Object.keys(a);
  if (!shown.length || !Object.keys(second).length) return null;
  const right = new Map(key.map((q) => [String(q.number), String(q.answer)]));
  const ok = shown.filter((n) => right.has(n) && (String(a[n]) === right.get(n) || second[n] === right.get(n))).length;
  return Math.round((100 * ok) / shown.length);
}

function cleanGradingExtra(x: GradingExtra): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (x.points !== undefined) {
    if (scoreForPoints(Number(x.points)) === null) throw new ValidationError("Choose 5, 10 or 20 points.");
    out.writingPoints = Number(x.points);
  }
  if (x.rubric !== undefined) {
    if (!Array.isArray(x.rubric) || x.rubric.length !== WRITING_RUBRIC.length || x.rubric.some((n) => !Number.isInteger(n) || n < 0 || n > 3)) throw new ValidationError("Each rubric row is 0, 1, 2 or 3.");
    out.rubric = x.rubric;
  }
  // stored as points.ts codes ("word-wiz"), each once
  if (x.badges !== undefined) out.teacherBadges = [...new Set(x.badges.map(badgeName).filter((b): b is string => !!b).map(badgeCode))];
  return out;
}

// ------------------------------------------------------------------ Grading Center

async function assertReadClass(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can open the Grading Center.");
  const c = (await readableClasses(repo, actor)).find((k) => s(k.id) === classId);
  if (!c) throw new ForbiddenError("You cannot open this class.");
  return c;
}
async function classStudentNames(repo: Repo, classId: string): Promise<Map<string, string>> {
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  if (!ids.length) return new Map();
  const st = await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const un = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  return new Map(st.map((x) => [s(x.id), un.get(s(x.userId)) || "Student"]));
}

export interface GradingStudent { studentId: string; name: string; toGrade: number; graded: number }

/** The class's students with how many written answers wait for a score (most waiting first, then by name). */
export async function gradingStudents(repo: Repo, actor: Actor, classId: string): Promise<GradingStudent[]> {
  await assertReadClass(repo, actor, classId);
  const names = await classStudentNames(repo, classId);
  if (!names.size) return [];
  // only the sent writings (RRRun.writing is set on submit), and never their text: two small columns
  const runs = await repo.findMany("RRRun", { studentId: { in: [...names.keys()] }, completedAt: { not: null }, writing: { not: null } }, { select: ["studentId", "writingScore"] });
  const by = new Map<string, { toGrade: number; graded: number }>();
  for (const r of runs) {
    const c = by.get(s(r.studentId)) ?? { toGrade: 0, graded: 0 };
    if (r.writingScore === null || r.writingScore === undefined) c.toGrade++; else c.graded++;
    by.set(s(r.studentId), c);
  }
  return [...names].map(([studentId, name]) => ({ studentId, name, ...(by.get(studentId) ?? { toGrade: 0, graded: 0 }) }))
    .sort((a, b) => b.toGrade - a.toGrade || a.name.localeCompare(b.name));
}

export interface StudentWriting {
  runId: string; articleId: string; title: string; band: string; prompt: string; writing: string;
  /** when the student submitted (ISO) and the same moment in Riyadh time ("yyyy-mm-dd hh:mm") */
  submittedAt: string | null; submittedRiyadh: string | null;
  score: number | null; comment: string | null; aiScore: number | null; aiComment: string | null;
  points: number | null; rubric: number[] | null; badges: string[];
}

/** A student's submitted writings, newest first (the student must be in the class). */
export async function studentWritings(repo: Repo, actor: Actor, classId: string, studentId: string): Promise<StudentWriting[]> {
  await assertReadClass(repo, actor, classId);
  const m = await repo.findMany("ClassMembership", { classId, studentId, leftAt: null }, { select: ["studentId"], take: 1 });
  if (!m.length) throw new ForbiddenError("This student is not in the class.");
  const runs = (await repo.findMany("RRRun", { studentId, completedAt: { not: null } }, { select: ["id", "articleId", "band", "versionLevel", "writing", "completedAt", "writingScore", "writingComment", "writingAiScore", "writingAiComment", "annotations"] }))
    .filter((r) => s(r.writing).trim());
  if (!runs.length) return [];
  const ids = [...new Set(runs.map((r) => s(r.articleId)))];
  const [arts, prompts, vTitles] = await Promise.all([
    repo.findMany("RRArticle", { id: { in: ids } }, { select: ["id", "title"] }),
    repo.findMany("RRPrompt", { articleId: { in: ids } }, { select: ["articleId", "band", "prompt"] }),
    versionTitles(repo, ids),
  ]);
  const title = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return runs.map((r) => {
    const meta = runMeta(r.annotations);
    const at = r.completedAt ? new Date(r.completedAt as string | Date) : null;
    return {
      // round 7: the article title + "(read as: <version title> · 600L)" when the student's version has its own title
      runId: s(r.id), articleId: s(r.articleId), title: runTitle(title.get(s(r.articleId)) || "Article", vTitles, s(r.articleId), r.versionLevel), band: s(r.band),
      prompt: s(prompts.find((p) => s(p.articleId) === s(r.articleId) && s(p.band) === baseBand(r.band))?.prompt),
      writing: s(r.writing), submittedAt: at ? at.toISOString() : null, submittedRiyadh: at ? riyadhTime(at) : null,
      score: num(r.writingScore), comment: r.writingComment ? s(r.writingComment) : null, aiScore: num(r.writingAiScore), aiComment: r.writingAiComment ? s(r.writingAiComment) : null,
      points: meta.writingPoints, rubric: meta.rubric, badges: meta.teacherBadges,
    };
  }).sort((a, b) => s(b.submittedAt).localeCompare(s(a.submittedAt)));
}

/** "yyyy-mm-dd hh:mm" in Riyadh time (UTC+3). */
export const riyadhTime = (d: Date): string => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

/**
 * Grading Center submit: the points choice (5 okay / 10 good / 20 thoughtful) is saved as the 0–4 writing score
 * (2 / 3 / 4 — what the student sees as "n/4") through scoreWriting, with the comment; the points, the rubric and
 * the awarded badges are kept in RRRun.annotations.
 */
export async function gradeWriting(repo: Repo, actor: Actor, runId: string, input: { points: number; rubric?: number[]; comment: string; badges?: string[] }, now = new Date()): Promise<void> {
  const score = scoreForPoints(Number(input.points));
  if (score === null) throw new ValidationError("Choose 5, 10 or 20 points.");
  await scoreWriting(repo, actor, runId, score, input.comment, now, { points: Number(input.points), rubric: input.rubric, badges: input.badges ?? [] });
}

// ------------------------------------------------------------------ class settings (SchoolSetting)

export const CLASS_SETTINGS = ["feedOff", "badgesOff", "weeklyAuto"] as const;
export type ClassSettingKey = (typeof CLASS_SETTINGS)[number];
export const classSettingKey = (k: ClassSettingKey, classId: string) => `readrise.${k}:${classId}`;
export type ClassSettings = Record<ClassSettingKey, boolean>;

const onOf = (v: unknown): boolean => {
  const o = parseJson(v);
  return o === true || (!!o && typeof o === "object" && (o as { on?: unknown }).on === true);
};

/** A class's ReadRise toggles (all off when never set). Works for any caller (the student page reads it too). */
export async function classSettings(repo: Repo, classId: string, schoolId?: string | null): Promise<ClassSettings> {
  const sid = schoolId ?? s((await repo.findUnique("Class", { id: classId }))?.schoolId);
  const out: ClassSettings = { feedOff: false, badgesOff: false, weeklyAuto: false };
  if (!sid) return out;
  const rows = await repo.findMany("SchoolSetting", { schoolId: sid, key: { in: CLASS_SETTINGS.map((k) => classSettingKey(k, classId)) } }, { select: ["key", "value"] });
  for (const k of CLASS_SETTINGS) out[k] = onOf(rows.find((r) => s(r.key) === classSettingKey(k, classId))?.value);
  return out;
}

/** Turns one class toggle on or off (a teacher of the class or a school admin). */
export async function setClassSetting(repo: Repo, actor: Actor, classId: string, key: ClassSettingKey, on: boolean, now = new Date()): Promise<void> {
  if (!(CLASS_SETTINGS as readonly string[]).includes(key)) throw new ValidationError("Unknown setting.");
  const c = await assertClassWrite(repo, actor, classId);
  const schoolId = s(c.schoolId), k = classSettingKey(key, classId);
  const prev = parseJson((await repo.findUnique("SchoolSetting", { schoolId, key: k }))?.value);
  const value = { ...(prev && typeof prev === "object" && !Array.isArray(prev) ? prev : {}), on: Boolean(on), by: actor.userId, at: now.toISOString() };
  await repo.upsert("SchoolSetting", { schoolId, key: k }, { schoolId, key: k, value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "readrise.class.setting", entityType: "Class", entityId: classId, after: { [key]: Boolean(on) }, at: now });
}

// ------------------------------------------------------------------ weekly plan (Achieve-style lesson planning)

export const WEEKLY_ARTICLES = 3;
const WEEK_MS = 7 * 86_400_000;

/** A small stable hash (the same class + week always picks the same articles: two calls at once agree). */
function hash(x: string): number {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Picks `n` articles from the candidates, different topics first (pure, deterministic for a seed): the candidates
 * are shuffled by hash(seed + id), then one per topic in turn.
 */
export function pickWeekly(cands: readonly { id: string; topic: string }[], seed: string, n = WEEKLY_ARTICLES): string[] {
  const order = [...cands].sort((a, b) => hash(seed + a.id) - hash(seed + b.id) || a.id.localeCompare(b.id));
  const out: string[] = [], topics = new Set<string>();
  for (const a of order) { if (out.length >= n) break; if (!topics.has(a.topic)) { out.push(a.id); topics.add(a.topic); } }
  for (const a of order) { if (out.length >= n) break; if (!out.includes(a.id)) out.push(a.id); }
  return out;
}

/**
 * 📅 The weekly plan: when the class's `weeklyAuto` toggle is on, each school week (Sunday, Riyadh) the class gets
 * WEEKLY_ARTICLES new articles, each open 7 days (startAt = the Sunday, dueAt = the next Saturday 23:59 Riyadh),
 * chosen from the school's visible library (the hidden articles left out) that no student of the class has read and
 * that are not already on the class's list, mixed topics. Called lazily when the teacher or a student of the class
 * opens ReadRise (no cron); idempotent per week (the week is recorded on the setting row; the choice is
 * deterministic, so two calls at once write the same rows). Returns the articles added this call.
 */
export async function ensureWeeklyPlan(repo: Repo, classId: string, now = new Date()): Promise<{ week: string; added: string[] }> {
  const start = rrWeekStart(now), week = riyadhDay(start);
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass || klass.deletedAt) return { week, added: [] };
  const schoolId = s(klass.schoolId), key = classSettingKey("weeklyAuto", classId);
  const row = await repo.findUnique("SchoolSetting", { schoolId, key });
  const v = parseJson(row?.value) as { on?: boolean; by?: string; lastWeek?: string; weeks?: Record<string, string[]> } | null;
  if (!v || v.on !== true || v.lastWeek === week) return { week, added: [] };
  const members = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const [arts, links, runs] = await Promise.all([
    visibleArticles(repo, schoolId),
    repo.findMany("RRClassArticle", { classId }, { select: ["articleId"] }),
    members.length ? repo.findMany("RRRun", { studentId: { in: members } }, { select: ["articleId"] }) : Promise.resolve([] as Row[]),
  ]);
  const used = new Set([...links.map((l) => s(l.articleId)), ...runs.map((r) => s(r.articleId))]);
  const pick = pickWeekly(arts.filter((a) => !used.has(s(a.id))).map((a) => ({ id: s(a.id), topic: s(a.topic) })), `${classId}|${week}`);
  const startAt = new Date(start), dueAt = new Date(start + WEEK_MS - 60_000);
  // the teacher who turned the plan on (setClassSetting stores their user id) assigns it
  const by = s(v.by) || s(row?.updatedBy) || "system";
  for (const articleId of pick)
    await repo.upsert("RRClassArticle", { classId, articleId }, { classId, articleId, assignedById: by, dueAt, startAt, createdAt: now }, { dueAt, startAt });
  const weeks = { ...(v.weeks ?? {}), [week]: pick };
  // keep the last 52 weeks on the row
  const kept = Object.fromEntries(Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).slice(-52));
  const value = { ...v, lastWeek: week, weeks: kept };
  await repo.updateMany("SchoolSetting", { schoolId, key }, { value });
  return { week, added: pick };
}

/** ensureWeeklyPlan for every class of a student (the student's ReadRise page); never throws. */
export async function ensureWeeklyPlansForStudent(repo: Repo, studentId: string, now = new Date()): Promise<void> {
  try {
    const cls = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
    for (const c of cls) await ensureWeeklyPlan(repo, s(c.classId), now);
  } catch { /* the plan never blocks the reading page */ }
}

/** Reading strategy names by question type (the article's most common question skill). */
export const STRATEGY_OF_SKILL: Record<string, string> = {
  "central-idea": "Main Idea", detail: "Key Details", inference: "Making Inferences", vocabulary: "Vocabulary Building",
  "text-structure": "Text Structure", "author-purpose": "Author's Purpose", "cause-effect": "Cause/Effect", sequence: "Sequence", compare: "Compare/Contrast",
  "problem-solution": "Problem/Solution",
};

/** The article's reading strategy: the most common question skill over its MID band (else all bands). Pure. */
export function strategyOf(rows: readonly { band: string; skill: string }[]): string | null {
  const mid = rows.filter((q) => q.band === "MID");
  const use = mid.length ? mid : rows;
  if (!use.length) return null;
  const n = new Map<string, number>();
  for (const q of use) { const k = normalisedSkill(q.skill); n.set(k, (n.get(k) ?? 0) + 1); }
  const top = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return STRATEGY_OF_SKILL[top] ?? null;
}

export interface PlanWeek { week: string; articles: { articleId: string; code: string; title: string; topic: string; strategy: string | null; startAt: string | null; dueAt: string | null; auto: boolean }[] }

/** "By week": the class's assigned articles grouped by the week they open (newest week first). */
export async function planByWeek(repo: Repo, actor: Actor, classId: string): Promise<PlanWeek[]> {
  const c = await assertReadClass(repo, actor, classId);
  const links = await repo.findMany("RRClassArticle", { classId });
  if (!links.length) return [];
  const ids = links.map((l) => s(l.articleId));
  const [arts, keys, setting] = await Promise.all([
    repo.findMany("RRArticle", { id: { in: ids } }, { select: ["id", "code", "title", "topic", "deletedAt"] }),
    questionKeys(repo, ids),
    repo.findUnique("SchoolSetting", { schoolId: s(c.schoolId), key: classSettingKey("weeklyAuto", classId) }),
  ]);
  const autoWeeks = (parseJson(setting?.value) as { weeks?: Record<string, string[]> } | null)?.weeks ?? {};
  const auto = new Set(Object.values(autoWeeks).flat().map(String));
  const iso = (v: unknown) => (v ? new Date(v as string | Date).toISOString() : null);
  const by = new Map<string, PlanWeek["articles"]>();
  for (const l of links) {
    const a = arts.find((x) => s(x.id) === s(l.articleId));
    if (!a || a.deletedAt) continue;
    const opens = l.startAt ?? l.createdAt;
    const week = riyadhDay(rrWeekStart(new Date(opens as string | Date)));
    const guide = teacherGuide(s(a.code));
    const item = { articleId: s(a.id), code: s(a.code), title: s(a.title), topic: s(a.topic), strategy: guide?.strategy || strategyOf(keys.get(s(a.id)) ?? []), startAt: iso(l.startAt), dueAt: iso(l.dueAt), auto: auto.has(s(a.id)) };
    by.set(week, [...(by.get(week) ?? []), item]);
  }
  return [...by].sort(([a], [b]) => b.localeCompare(a)).map(([week, articles]) => ({ week, articles: articles.sort((x, y) => x.title.localeCompare(y.title)) }));
}

// ------------------------------------------------------------------ teacher materials (data/readrise/teacher-guides)

export interface TeacherGuide { summary: string; introduce: string; keyTerms: { term: string; def: string }[]; challengeTerms: { term: string; def: string }[]; discussion: string[]; strategy: string }

const GUIDE_TTL = 10 * 60_000, GUIDE_MAX = 400;
const guideCache = new Map<string, { at: number; g: TeacherGuide | null }>();

/** Cleans a guide file's JSON (pure; null when it has nothing to show). */
export function cleanGuide(v: unknown): TeacherGuide | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const terms = (x: unknown) => (Array.isArray(x) ? x : []).map((t) => ({ term: str((t as Record<string, unknown>)?.term), def: str((t as Record<string, unknown>)?.def) })).filter((t) => t.term).slice(0, 20);
  const g: TeacherGuide = {
    summary: str(o.summary), introduce: str(o.introduce), keyTerms: terms(o.keyTerms), challengeTerms: terms(o.challengeTerms),
    discussion: (Array.isArray(o.discussion) ? o.discussion : []).map(str).filter(Boolean).slice(0, 10), strategy: str(o.strategy),
  };
  return g.summary || g.introduce || g.keyTerms.length || g.discussion.length || g.strategy ? g : null;
}

/** The teacher materials of an article code (RR-NNN) from data/readrise/teacher-guides; null = no file (hide the panel). */
export function teacherGuide(code: string, root = process.cwd()): TeacherGuide | null {
  if (!/^RR-\d{1,5}$/.test(code)) return null;
  const hit = guideCache.get(code);
  if (hit && Date.now() - hit.at < GUIDE_TTL) return hit.g;
  let g: TeacherGuide | null = null;
  try { g = cleanGuide(JSON.parse(readFileSync(join(root, "data", "readrise", "teacher-guides", `${code}.json`), "utf8"))); } catch { g = null; }
  if (guideCache.size >= GUIDE_MAX) guideCache.delete(guideCache.keys().next().value!);
  guideCache.set(code, { at: Date.now(), g });
  return g;
}
