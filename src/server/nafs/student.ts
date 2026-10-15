/**
 * 🇸🇦 The student's NAFS test (online, simulation mode): listed in My Tests (and counted on the home badge) when the
 * teacher assigned it to the student's Grade 6 class or to the student; one booklet view (each passage with its
 * questions, paragraphs numbered), the timer from the first opening (the assignment's own time), answers kept as the
 * student goes, a warning about unanswered questions at submit (in the page), no hints and no explanations.
 * Multiple-choice answers are graded on hand-in; short written answers wait for the teacher's marking (never scored
 * automatically). After the teacher releases the results the student sees the score and the skills to practise —
 * never a level word.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { hideLevels } from "../../lib/hide-levels";
import { SKILL_BY_CODE } from "./framework";
import { loadNafsQuestions, nafsIndex, type NafsKind } from "./bank";
import { assignedTo, cleanAnswers, cleanScores, cleanTexts, gradeAnswers, json, markOf, type Answer } from "./tests";
import { effectiveEnd, liveKey, liveStamp, studentExtra } from "../timing/live-time";
import { hiddenWorkKeys } from "../student/cancelled-work";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const iso = (v: unknown) => d(v)?.toISOString() ?? null;
/** A little time after the timer ends (slow networks) before answers are no longer taken. */
export const GRACE_MS = 2 * 60_000;
export const PRACTISE_BELOW = 70;

function student(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take NAFS simulations.");
  return actor.studentId;
}
/** The assignment's time (minutes): its own, else the test's. */
export const minutesFor = (g: Row, t: Row): number | null => (g.timeLimitMin ? Number(g.timeLimitMin) : t.timeLimitMin ? Number(t.timeLimitMin) : null);
/** r69 live time: when this student's time is up (the limit from the first opening, the class's end time, the student's own extra minutes). */
export const nafsEndFor = (g: Row, t: Row, studentId: string, startedAt: unknown): Date | null =>
  effectiveEnd({ startedAt: (startedAt ?? null) as Date | string | null, minutes: minutesFor(g, t), extra: studentExtra(g.studentMinutes, studentId), endsAt: (g.endsAt ?? null) as Date | string | null });

export interface MyNafsTest { id: string; title: string; questions: number; minutes: number | null; openAt: string | null; dueAt: string | null; startsLater: boolean; status: "TODO" | "IN_PROGRESS" | "DONE"; released: boolean; pct: number | null; practise: string[]; marking: boolean }

/** The NAFS assignments of the student's classes that are for this student (online). */
async function myGivenRows(repo: Repo, studentId: string, schoolId?: string | null): Promise<Row[]> {
  const classes = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
  if (!classes.length) return [];
  const given = await repo.findMany("NafsTestClass", { classId: { in: classes } }, { take: 200 });
  // r82: cancelled on the teacher's Assigned page (for everyone or for this student) = gone from the NAFS icon too
  const hidden = given.length && schoolId ? await hiddenWorkKeys(repo, studentId, schoolId) : new Set<string>();
  return given.filter((g) => { const who = assignedTo(g); return (!who || who.includes(studentId)) && !hidden.has(`nafs_test:${s(g.id)}`); });
}

/** The NAFS tests assigned to the student. */
export async function myNafsTests(repo: Repo, actor: Actor, now = new Date()): Promise<MyNafsTest[]> {
  const studentId = student(actor);
  const given = await myGivenRows(repo, studentId, actor.schoolId);
  if (!given.length) return [];
  const [tests, results] = await Promise.all([
    repo.findMany("NafsTest", { id: { in: [...new Set(given.map((g) => s(g.testId)))] }, deletedAt: null }, { select: ["id", "title", "questionIds", "timeLimitMin", "schoolId", "marks"] }),
    repo.findMany("NafsResult", { studentId, testId: { in: given.map((g) => s(g.testId)) } }, { select: ["testId", "answers", "submittedAt", "correct", "writtenScores"] }),
  ]);
  const out: MyNafsTest[] = [];
  for (const g of given) {
    const t = tests.find((x) => x.id === g.testId);
    if (!t) continue;
    const r = results.find((x) => x.testId === t.id);
    const ids = json<string[]>(t.questionIds, []);
    const released = Boolean(g.releasedAt);
    const done = Boolean(r?.submittedAt);
    let practise: string[] = [], pct: number | null = null, marking = false;
    if (released && done && r) {
      const qs = await loadNafsQuestions(repo, ids);
      const key = ids.map((id) => qs.find((q) => q.id === id)?.correct ?? -1);
      const marks = json<Record<string, number> | null>(t.marks, null);
      const gr = gradeAnswers(key, ids.map((id) => markOf(marks, id)), json<Answer[]>(r.answers, []), cleanScores(r.writtenScores, key));
      marking = gr.pending > 0;
      if (!marking) {
        pct = gr.maxPoints ? Math.round((100 * gr.points) / gr.maxPoints) : 0;
        practise = await skillsToPractise(repo, s(t.schoolId), ids, gr.credit);
      }
    }
    out.push({
      id: s(g.id), title: hideLevels(s(t.title)), questions: ids.length, minutes: minutesFor(g, t), openAt: iso(g.openAt), dueAt: iso(g.dueAt),
      startsLater: Boolean(d(g.openAt) && d(g.openAt)! > now), status: done ? "DONE" : r ? "IN_PROGRESS" : "TODO", released, pct, practise, marking,
    });
  }
  return out;
}

/** The home badge: NAFS tests open now and not handed in yet. */
export async function nafsToDoCount(repo: Repo, actor: Actor, now = new Date()): Promise<number> {
  if (actor.role !== "STUDENT" || !actor.studentId) return 0;
  const given = await myGivenRows(repo, actor.studentId, actor.schoolId);
  if (!given.length) return 0;
  const [tests, done] = await Promise.all([
    repo.findMany("NafsTest", { id: { in: [...new Set(given.map((g) => s(g.testId)))] }, deletedAt: null }, { select: ["id"] }),
    repo.findMany("NafsResult", { studentId: actor.studentId, testId: { in: given.map((g) => s(g.testId)) }, submittedAt: { not: null } }, { select: ["testId"] }),
  ]);
  return given.filter((g) => tests.some((t) => t.id === g.testId) && !done.some((r) => r.testId === g.testId) && !(d(g.openAt) && d(g.openAt)! > now)).length;
}

async function skillsToPractise(repo: Repo, schoolId: string, ids: string[], credit: (number | null)[]): Promise<string[]> {
  const idx = new Map((await nafsIndex(repo, schoolId)).map((e) => [e.id, e]));
  const per = new Map<string, { right: number; n: number }>();
  ids.forEach((id, i) => {
    const code = idx.get(id)?.nafsCode;
    if (!code || credit[i] === null || credit[i] === undefined) return;
    const b = per.get(code) ?? { right: 0, n: 0 };
    b.n++; b.right += credit[i]!;
    per.set(code, b);
  });
  return [...per].filter(([, b]) => (100 * b.right) / b.n < PRACTISE_BELOW).map(([c]) => SKILL_BY_CODE.get(c)?.name ?? "").filter(Boolean);
}

async function myGiven(repo: Repo, actor: Actor, id: string): Promise<{ g: Row; t: Row; studentId: string }> {
  const studentId = student(actor);
  const g = await repo.findUnique("NafsTestClass", { id });
  if (!g) throw new ForbiddenError("Test not found.");
  const member = await repo.findUnique("ClassMembership", { classId: g.classId, studentId });
  if (!member || member.leftAt) throw new ForbiddenError("Test not found.");
  const who = assignedTo(g);
  if (who && !who.includes(studentId)) throw new ForbiddenError("Test not found.");
  const t = await repo.findUnique("NafsTest", { id: g.testId });
  if (!t || t.deletedAt) throw new ForbiddenError("Test not found.");
  return { g, t, studentId };
}

export interface BookletGroup { passage: { title: string; paragraphs: string[] } | null; questions: { n: number; stem: string; options: string[]; kind: NafsKind }[] }
export interface Booklet { id: string; title: string; minutes: number | null; endsAt: string | null; done: boolean; answers: Answer[]; texts: Record<string, string>; groups: BookletGroup[]; total: number;
  /** r69 live time: the stamp the player polls with (the teacher's changes reach the timer) */
  stamp: number }

/** Paragraphs of a passage (blank lines or new lines), numbered in the page. */
export function paragraphsOf(text: string): string[] {
  const t = s(text).replace(/\r\n/g, "\n").trim();
  const parts = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/) : t.split("\n");
  return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Groups questions under their passage (each passage printed once, in the test's order). */
export function bookletGroups(order: string[], qs: { id: string; stem: string; options: string[]; kind?: NafsKind; passage: { id: string; title: string; text: string } | null }[]): BookletGroup[] {
  const groups: (BookletGroup & { pid: string | null })[] = [];
  order.forEach((id, i) => {
    const q = qs.find((x) => x.id === id);
    if (!q) return;
    const pid = q.passage?.id ?? null;
    const last = groups[groups.length - 1];
    const item = { n: i + 1, stem: q.stem, options: q.options, kind: q.kind ?? "MCQ" };
    if (last && pid && last.pid === pid) last.questions.push(item);
    else groups.push({ pid, passage: q.passage ? { title: q.passage.title, paragraphs: paragraphsOf(q.passage.text) } : null, questions: [item] });
  });
  return groups.map(({ pid: _p, ...g }) => g);
}

/** Opens the booklet: the timer starts at the first opening (kept on the server). No keys, no explanations, no rubrics. */
export async function openBooklet(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<Booklet> {
  const { g, t, studentId } = await myGiven(repo, actor, id);
  if (d(g.openAt) && d(g.openAt)! > now) throw new ValidationError("This test is not open yet.");
  const ids = json<string[]>(t.questionIds, []);
  let r = (await repo.findMany("NafsResult", { testId: t.id, studentId }))[0];
  if (!r) r = await repo.create("NafsResult", { testId: t.id, classId: g.classId, studentId, source: "ONLINE", answers: ids.map(() => null), startedAt: now, updatedAt: now });
  const minutes = minutesFor(g, t);
  const started = d(r.startedAt) ?? now;
  const qs = await loadNafsQuestions(repo, ids);
  return {
    id: s(g.id), title: hideLevels(s(t.title)), minutes, endsAt: nafsEndFor(g, t, studentId, started)?.toISOString() ?? null, done: Boolean(r.submittedAt), stamp: liveStamp(liveKey("nafs", s(g.id))),
    answers: json<Answer[]>(r.answers, ids.map(() => null)), texts: json<Record<string, string>>(r.texts, {}) ?? {}, groups: bookletGroups(ids, qs), total: ids.length,
  };
}

/**
 * Keeps the answers so far (a closed browser loses nothing); `submit` hands the test in: multiple-choice answers are
 * graded, written answers go to the teacher's marking queue (never scored here).
 */
export async function saveBooklet(repo: Repo, actor: Actor, input: { id: string; answers: unknown; texts?: unknown; submit: boolean }, now = new Date()): Promise<{ done: boolean; blanks: number }> {
  const { g, t, studentId } = await myGiven(repo, actor, s(input.id));
  const ids = json<string[]>(t.questionIds, []);
  const r = (await repo.findMany("NafsResult", { testId: t.id, studentId }))[0];
  if (!r) throw new ValidationError("Open the test first.");
  if (r.submittedAt) return { done: true, blanks: 0 };
  const qs = await loadNafsQuestions(repo, ids);
  const key = ids.map((id) => qs.find((q) => q.id === id)?.correct ?? -1);
  const answers = cleanAnswers(input.answers, ids.length).map((a, i) => (key[i] < 0 ? null : a));
  const texts = cleanTexts(input.texts, key);
  const blanks = key.filter((k, i) => (k < 0 ? !texts[String(i)] : answers[i] === null)).length;
  // r69: the live end (the teacher may have extended or shortened the time while the test runs)
  const end = d(r.startedAt) ? nafsEndFor(g, t, studentId, r.startedAt) : null;
  const late = end ? now.getTime() > end.getTime() + GRACE_MS : false;
  const submit = input.submit || Boolean(late);
  if (!submit) { await repo.updateMany("NafsResult", { id: r.id }, { answers, texts, updatedAt: now }); return { done: false, blanks }; }
  const marks = json<Record<string, number> | null>(t.marks, null);
  const gr = gradeAnswers(key, ids.map((id) => markOf(marks, id)), answers, {});
  await repo.updateMany("NafsResult", { id: r.id }, { answers, texts, writtenScores: {}, correct: gr.correct, points: gr.points, maxPoints: gr.maxPoints, submittedAt: now, updatedAt: now });
  return { done: true, blanks };
}

/**
 * ⏱ r69 the player's poll: "same" while the teacher changed nothing (no database read — the stamp is in memory),
 * else this student's end time now. Only for the student's own assignment.
 */
export async function bookletTime(repo: Repo, actor: Actor, id: string, stamp: number, now = new Date()): Promise<{ same: true } | { same: false; endsAt: string | null; stamp: number; done: boolean }> {
  const cur = liveStamp(liveKey("nafs", s(id)));
  if (Number(stamp) === cur) return { same: true };
  const { g, t, studentId } = await myGiven(repo, actor, s(id));
  const r = (await repo.findMany("NafsResult", { testId: t.id, studentId }, { select: ["startedAt", "submittedAt"] }))[0];
  const end = nafsEndFor(g, t, studentId, r?.startedAt ?? now);
  return { same: false, endsAt: end?.toISOString() ?? null, stamp: cur, done: Boolean(r?.submittedAt) };
}
