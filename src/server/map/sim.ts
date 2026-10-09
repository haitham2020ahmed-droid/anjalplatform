/**
 * 🗺️ MAP practice test — a simulation of MAP Growth for EVERY student, before Winter and Spring.
 *
 * How it works (as close to MAP Growth as the school's bank allows):
 *   - adaptive: it starts at the student's latest MAP RIT (or the grade's national mean) and every answer moves the
 *     estimate; the next question is the closest to the estimate (Rasch, 10 RIT per logit, a prior of ±15 RIT);
 *   - blueprint: the questions are shared evenly between the subject's goal-area groups (Reading: Literary,
 *     Informational, Vocabulary · Language: Grammar & Usage, Mechanics, Writing);
 *   - one question per screen, no going back, no right / wrong during the test, no dictionary, hints or read-aloud;
 *   - untimed; it can be finished in two sittings (the same question comes back);
 *   - a question already seen in a practice test is never shown again; questions seen in practice only if needed;
 *   - rapid guessing (answers faster than the question can be read) is not scored, the student is asked to slow
 *     down, and the teacher is told;
 *   - the result is an RIT with its range (±1 standard error, as NWEA shows), each goal area, and whether the
 *     student is on track for the Spring goal.
 * The questions' RIT starts from their difficulty and is corrected from real MAP scores (recalibrateFromReal).
 * It is an ESTIMATE: NWEA's own items and calibration are not available to the school.
 */
import { randomInt } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { loadQuestionItems, toClientQuestion, type ClientQuestion } from "../practice/items";
import { normalizeResponse } from "../practice/session";
import { scoreResponse } from "../../imports/questions/validate";
import { classMembers, studentNames } from "../insights/student-data";
import { assertClassRead, readableClasses } from "../teacher/coordinators";
import { assertClassAccess } from "../teacher/assignments";
import { bandSettings, groupOf, groupPools, GROUPS, mapProfiles, ritBand, autoItems, type GroupKey, type MapProfile, type PoolQ, type Subject, type AreaStatus, type Descriptor } from "./map-plan";
import { bandOf, ensureNationalNorms, nationalNorm, type Season } from "./rit";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const iso = (v: unknown) => (v ? new Date(time(v)).toISOString() : null);
const DAY = 86_400_000;
export const SIM_ITEMS = 50;
export const WARMUP_ITEMS = 5;
const PRIOR_SD = 15;
/** answers faster than this are “rapid guesses” (not read): 3 s, or 6 s when there is a passage */
export const rapidMs = (hasPassage: boolean) => (hasPassage ? 6000 : 3000);
const subjectOfGroup = (g: GroupKey): Subject => groupOf(g).subject;
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

// ------------------------------------------------------------------ the estimate

/** Bayesian (MAP) estimate on the RIT scale: answers {b, x}, prior N(mu, PRIOR_SD). Returns RIT and its SE. */
export function estimate(answers: { b: number; x: number }[], mu: number, sd = PRIOR_SD): { rit: number; se: number } {
  let r = mu;
  for (let i = 0; i < 40; i++) {
    let f = -(r - mu) / (sd * sd), d = 1 / (sd * sd);
    for (const a of answers) { const p = 1 / (1 + Math.exp(-(r - a.b) / 10)); f += (a.x - p) / 10; d += (p * (1 - p)) / 100; }
    const step = f / d;
    r = Math.max(120, Math.min(320, r + Math.max(-15, Math.min(15, step))));
    if (Math.abs(step) < 0.01) break;
  }
  let info = 1 / (sd * sd);
  for (const a of answers) { const p = 1 / (1 + Math.exp(-(r - a.b) / 10)); info += (p * (1 - p)) / 100; }
  return { rit: r, se: 1 / Math.sqrt(info) };
}

/** Even blueprint: 50 → 17 · 17 · 16 for the three goal-area groups of the subject. */
export function blueprint(subject: Subject, total: number): Map<GroupKey, number> {
  const gs = GROUPS.filter((g) => g.subject === subject).map((g) => g.key);
  return new Map(gs.map((g, i) => [g, Math.floor(total / gs.length) + (i < total % gs.length ? 1 : 0)]));
}

/** The next group: the one furthest behind its share of the blueprint. */
export function nextGroup(plan: Map<GroupKey, number>, done: Map<GroupKey, number>, available: Set<GroupKey>): GroupKey | null {
  let best: GroupKey | null = null, bestRatio = Infinity;
  for (const [g, target] of plan) {
    if (!available.has(g) || (done.get(g) ?? 0) >= target) continue;
    const ratio = (done.get(g) ?? 0) / target;
    if (ratio < bestRatio) { best = g; bestRatio = ratio; }
  }
  if (best) return best;
  // blueprint full for the groups that still have questions: take any group that has some left
  return [...available][0] ?? null;
}

/** The item closest to the estimate, chosen at random among the 4 closest (so classmates see different items). */
export function pickItem(pool: PoolQ[], rit: number, exclude: Set<string>, avoid: Set<string>): PoolQ | null {
  const fresh = pool.filter((q) => !exclude.has(q.id));
  const unseen = fresh.filter((q) => !avoid.has(q.id));
  const list = (unseen.length ? unseen : fresh).sort((a, b) => Math.abs(a.rit - rit) - Math.abs(b.rit - rit));
  if (!list.length) return null;
  return list[randomInt(Math.min(4, list.length))];
}

// ------------------------------------------------------------------ pools (the grade and the grades around it)

interface SimPool { byGroup: Map<GroupKey, PoolQ[]>; group: Map<string, GroupKey>; rit: Map<string, number> }
async function simPool(repo: Repo, schoolId: string, grade: number, subject: Subject): Promise<SimPool> {
  const byGroup = new Map<GroupKey, PoolQ[]>(GROUPS.filter((g) => g.subject === subject).map((g) => [g.key, []]));
  const group = new Map<string, GroupKey>(), rit = new Map<string, number>();
  // MAP items are not tied to one grade: use the grade below and above as well (wider RIT range)
  for (const g of [grade - 1, grade, grade + 1]) {
    if (g < 1) continue;
    const pk = await groupPools(repo, schoolId, g);
    for (const [k, list] of pk.pools) {
      if (!byGroup.has(k)) continue;
      for (const q of list) if (!group.has(q.id)) { group.set(q.id, k); rit.set(q.id, q.rit); byGroup.get(k)!.push(q); }
    }
  }
  return { byGroup, group, rit };
}

async function studentGrade(repo: Repo, studentId: string): Promise<number> {
  const st = await repo.findUnique("Student", { id: studentId });
  return Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
}

// ------------------------------------------------------------------ windows (admin / teacher)

export interface WindowView { id: string; title: string; grade: number | null; season: string; subjects: Subject[]; items: number; opensAt: string; closesAt: string; open: boolean }
const windowView = (w: Row, now: Date): WindowView => ({ id: s(w.id), title: s(w.title), grade: w.grade === null || w.grade === undefined ? null : Number(w.grade), season: s(w.season), subjects: (Array.isArray(w.subjects) ? w.subjects : JSON.parse(s(w.subjects) || "[]")) as Subject[], items: Number(w.items), opensAt: iso(w.opensAt)!, closesAt: iso(w.closesAt)!, open: time(w.opensAt) <= now.getTime() && time(w.closesAt) > now.getTime() });

export async function createWindow(repo: Repo, actor: Actor, input: { title?: string; grade: number | null; season: Season; subjects: Subject[]; items?: number; opensAt: Date; closesAt: Date }, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  if (!isAdmin(actor)) throw new ForbiddenError("The head of department opens practice-test windows.");
  const subjects = input.subjects.filter((x) => x === "READING" || x === "LANGUAGE");
  if (!subjects.length) throw new ValidationError("Choose Reading, Language Usage or both.");
  const items = input.items ?? SIM_ITEMS;
  if (!Number.isInteger(items) || items < 20 || items > 60) throw new ValidationError("Questions per subject: 20 to 60.");
  if (!(input.closesAt.getTime() > input.opensAt.getTime())) throw new ValidationError("The window must close after it opens.");
  const w = await repo.create("MapSimWindow", { schoolId: actor.schoolId!, title: s(input.title).trim().slice(0, 160) || `MAP practice test · before ${input.season === "WINTER" ? "Winter" : input.season === "SPRING" ? "Spring" : "Fall"}`, grade: input.grade, season: input.season, subjects, items, opensAt: input.opensAt, closesAt: input.closesAt, createdById: actor.userId, createdAt: now });
  // tell the students (one notification each)
  const grades = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] });
  const gIds = grades.filter((g) => input.grade === null || Number(g.level) === input.grade).map((g) => g.id);
  const students = gIds.length ? await repo.findMany("Student", { gradeId: { in: gIds }, schoolId: actor.schoolId }, { select: ["userId"] }) : [];
  for (let i = 0; i < students.length; i += 200) await repo.createMany("Notification", students.slice(i, i + 200).map((st) => ({ userId: st.userId, type: "ASSESSMENT_AVAILABLE", title: "🗺️ MAP practice test", body: `Your MAP practice test opens ${input.opensAt.toISOString().slice(0, 10)}. Do your best: it shows your teacher how to help you before the real test.`, link: "/student/map-test", createdAt: now })));
  await audit(repo, { actorId: actor.userId, action: "mapsim.window", entityType: "MapSimWindow", entityId: s(w.id), after: { grade: input.grade, season: input.season, subjects, items }, at: now });
  return s(w.id);
}

export async function closeWindow(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  if (!isAdmin(actor)) throw new ForbiddenError();
  const w = await repo.findUnique("MapSimWindow", { id });
  if (!w || s(w.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  await repo.updateMany("MapSimWindow", { id }, { closesAt: now });
}

export async function windows(repo: Repo, actor: Actor, now = new Date()): Promise<WindowView[]> {
  if (!isStaff(actor)) throw new ForbiddenError();
  return (await repo.findMany("MapSimWindow", { schoolId: actor.schoolId })).map((w) => windowView(w, now)).sort((a, b) => b.opensAt.localeCompare(a.opensAt));
}

// ------------------------------------------------------------------ readiness of the bank

export interface Readiness { grade: number; subject: Subject; groups: { key: GroupKey; name: string; icon: string; total: number; low: number; mid: number; high: number; need: number; ok: boolean }[]; ok: boolean; mean: number }

/** Is the bank big enough for a 50-question adaptive test (twice a year, no repeats) for this grade? */
export async function readiness(repo: Repo, actor: Actor, grade: number, items = SIM_ITEMS): Promise<Readiness[]> {
  if (!isStaff(actor)) throw new ForbiddenError();
  await ensureNationalNorms(repo);
  const norm = await nationalNorm(repo, grade, "WINTER");
  const mean = norm?.mean ?? 200, sd = norm?.sd ?? 17;
  const out: Readiness[] = [];
  for (const subject of ["READING", "LANGUAGE"] as const) {
    const pool = await simPool(repo, actor.schoolId!, grade, subject);
    const plan = blueprint(subject, items);
    const groups = [...pool.byGroup].map(([k, list]) => {
      const g = groupOf(k), need = (plan.get(k) ?? 0) * 3;   // two tests a year + room to choose
      const low = list.filter((q) => q.rit < mean - sd / 2).length, high = list.filter((q) => q.rit > mean + sd / 2).length;
      return { key: k, name: g.name, icon: g.icon, total: list.length, low, mid: list.length - low - high, high, need, ok: list.length >= need && low >= 10 && high >= 10 };
    });
    out.push({ grade, subject, groups, ok: groups.every((g) => g.ok), mean: Math.round(mean) });
  }
  return out;
}

// ------------------------------------------------------------------ the student's test

export interface MyTests { windows: (WindowView & { sessions: { subject: Subject; status: "NOT_STARTED" | "IN_PROGRESS" | "DONE"; answered: number; total: number; resultRit: number | null; resultLow: number | null; resultHigh: number | null }[] })[]; warmupDone: boolean }

function student(actor: Actor): string { if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only."); return actor.studentId; }

export async function myTests(repo: Repo, actor: Actor, now = new Date()): Promise<MyTests> {
  const sid = student(actor);
  const grade = await studentGrade(repo, sid);
  const all = (await repo.findMany("MapSimWindow", { schoolId: actor.schoolId })).filter((w) => (w.grade === null || w.grade === undefined || Number(w.grade) === grade) && time(w.opensAt) <= now.getTime() && time(w.closesAt) > now.getTime() - 30 * DAY);
  const sessions = await repo.findMany("MapSimSession", { studentId: sid });
  return {
    windows: all.map((w) => windowView(w, now)).sort((a, b) => b.opensAt.localeCompare(a.opensAt)).map((w) => ({ ...w, sessions: w.subjects.map((subject) => { const x = sessions.find((y) => y.windowId === w.id && y.subject === subject && y.kind === "SIM"); return { subject, status: (x ? s(x.status) : "NOT_STARTED") as "NOT_STARTED" | "IN_PROGRESS" | "DONE", answered: Number(x?.answered ?? 0), total: Number(x?.total ?? w.items), resultRit: x?.resultRit !== null && x?.resultRit !== undefined ? Number(x.resultRit) : null, resultLow: x?.resultLow !== null && x?.resultLow !== undefined ? Number(x.resultLow) : null, resultHigh: x?.resultHigh !== null && x?.resultHigh !== undefined ? Number(x.resultHigh) : null }; }) })),
    warmupDone: sessions.some((x) => x.kind === "WARMUP" && x.status === "DONE"),
  };
}

export interface TestScreen { sessionId: string; subject: Subject; kind: "SIM" | "WARMUP"; n: number; total: number; question: ClientQuestion | null; done: boolean; warning: string | null; result: { rit: number; low: number; high: number } | null }

/** Starts (or resumes) the test of one subject in an open window; kind WARMUP = 5 practice questions, not scored. */
export async function startTest(repo: Repo, actor: Actor, input: { windowId?: string | null; subject: Subject; warmup?: boolean }, now = new Date()): Promise<TestScreen> {
  const sid = student(actor);
  const grade = await studentGrade(repo, sid);
  let total = WARMUP_ITEMS, windowId: string | null = null;
  if (!input.warmup) {
    const w = input.windowId ? await repo.findUnique("MapSimWindow", { id: input.windowId }) : null;
    if (!w || s(w.schoolId) !== s(actor.schoolId) || (w.grade !== null && w.grade !== undefined && Number(w.grade) !== grade)) throw new ForbiddenError("This test is not for you.");
    const v = windowView(w, now);
    if (!v.open) throw new ValidationError("This practice test is not open now.");
    if (!v.subjects.includes(input.subject)) throw new ValidationError("This subject is not part of this test.");
    total = v.items; windowId = v.id;
  }
  const kind = input.warmup ? "WARMUP" : "SIM";
  const existing = (await repo.findMany("MapSimSession", { studentId: sid, subject: input.subject, kind })).filter((x) => (windowId ? x.windowId === windowId : true)).sort((a, b) => time(b.startedAt) - time(a.startedAt))[0];
  if (existing && (existing.status === "IN_PROGRESS" || windowId)) return screen(repo, existing, now, null);
  // start: the student's latest MAP RIT for the subject, else the grade's national mean
  const p = (await mapProfiles(repo, actor.schoolId!, [sid], input.subject)).get(sid);
  await ensureNationalNorms(repo);
  const start = p?.overall?.rit ?? (await nationalNorm(repo, grade, "WINTER"))?.mean ?? 200;
  const row = await repo.create("MapSimSession", { windowId, schoolId: actor.schoolId!, studentId: sid, subject: input.subject, kind, status: "IN_PROGRESS", total, startRit: start, rit: start, se: PRIOR_SD, answered: 0, correct: 0, rapid: 0, startedAt: now });
  return serveNext(repo, row, grade, now, null);
}

async function seenIds(repo: Repo, studentId: string): Promise<{ sim: Set<string>; practice: Set<string> }> {
  const sessions = await repo.findMany("MapSimSession", { studentId }, { select: ["id"] });
  const sim = sessions.length ? await repo.findMany("MapSimAnswer", { sessionId: { in: sessions.map((x) => x.id) } }, { select: ["questionId"] }) : [];
  // questions seen in practice recently are avoided when there are others (the last 4 months is enough)
  const practice = await repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: new Date(Date.now() - 120 * DAY) } }, { select: ["questionId"] });
  return { sim: new Set(sim.map((a) => s(a.questionId))), practice: new Set(practice.map((a) => s(a.questionId))) };
}

async function serveNext(repo: Repo, row: Row, grade: number, now: Date, warning: string | null): Promise<TestScreen> {
  const subject = s(row.subject) as Subject;
  if (Number(row.answered) >= Number(row.total)) return finish(repo, row, now, warning);
  const pool = await simPool(repo, s(row.schoolId), grade, subject);
  const mine = await repo.findMany("MapSimAnswer", { sessionId: row.id }, { select: ["area"] });
  const done = new Map<GroupKey, number>();
  for (const a of mine) done.set(s(a.area) as GroupKey, (done.get(s(a.area) as GroupKey) ?? 0) + 1);
  const seen = await seenIds(repo, s(row.studentId));
  const available = new Set([...pool.byGroup].filter(([, l]) => l.some((q) => !seen.sim.has(q.id))).map(([k]) => k));
  const plan = blueprint(subject, Number(row.total));
  let q: PoolQ | null = null;
  for (let tries = 0; tries < 6 && !q; tries++) {
    const g = nextGroup(plan, done, available);
    if (!g) break;
    q = pickItem(pool.byGroup.get(g) ?? [], Number(row.rit), seen.sim, seen.practice);
    if (!q) available.delete(g);
  }
  if (!q) return finish(repo, row, now, warning);   // the bank ran out: finish with what we have
  await repo.updateMany("MapSimSession", { id: row.id }, { servedQuestionId: q.id, servedAt: now });
  return screen(repo, { ...row, servedQuestionId: q.id, servedAt: now }, now, warning);
}

async function screen(repo: Repo, row: Row, now: Date, warning: string | null): Promise<TestScreen> {
  const base = { sessionId: s(row.id), subject: s(row.subject) as Subject, kind: s(row.kind) as "SIM" | "WARMUP", n: Number(row.answered) + 1, total: Number(row.total), warning };
  if (row.status === "DONE") return { ...base, n: Number(row.answered), question: null, done: true, result: row.kind === "SIM" && row.resultRit !== null && row.resultRit !== undefined ? { rit: Number(row.resultRit), low: Number(row.resultLow), high: Number(row.resultHigh) } : null };
  if (!row.servedQuestionId) return serveNext(repo, row, await studentGrade(repo, s(row.studentId)), now, warning);
  const [item] = await loadQuestionItems(repo, [s(row.servedQuestionId)]);
  if (!item) { await repo.updateMany("MapSimSession", { id: row.id }, { servedQuestionId: null }); return serveNext(repo, { ...row, servedQuestionId: null }, await studentGrade(repo, s(row.studentId)), now, warning); }
  return { ...base, question: toClientQuestion(item, `${row.id}:${item.questionId}`), done: false, result: null };
}

/** One answer: only for the question on the screen (no going back), no feedback; the next question comes back. */
export async function answerTest(repo: Repo, actor: Actor, sessionId: string, questionId: string, response: unknown, now = new Date()): Promise<TestScreen> {
  const sid = student(actor);
  const row = await repo.findUnique("MapSimSession", { id: sessionId });
  if (!row || row.studentId !== sid) throw new ForbiddenError("This test is not yours.");
  if (row.status === "DONE") return screen(repo, row, now, null);
  if (s(row.servedQuestionId) !== questionId) return screen(repo, row, now, null);   // an old screen: show the current question
  if (row.windowId) { const w = await repo.findUnique("MapSimWindow", { id: row.windowId }); if (!w || time(w.closesAt) <= now.getTime()) throw new ValidationError("This practice test has closed."); }
  const [item] = await loadQuestionItems(repo, [questionId]);
  const grade = await studentGrade(repo, sid);
  const pool = await simPool(repo, s(row.schoolId), grade, s(row.subject) as Subject);
  let ok = false;
  try { ok = Boolean(item) && scoreResponse(item as never, normalizeResponse(item!, response)) >= 1; } catch { ok = false; }
  const ms = Math.max(0, now.getTime() - time(row.servedAt));
  const rapid = ms < rapidMs(Boolean(item?.passageText));
  const n = Number(row.answered) + 1;
  await repo.create("MapSimAnswer", { sessionId, n, questionId, area: pool.group.get(questionId) ?? "LIT", itemRit: pool.rit.get(questionId) ?? Number(row.rit), isCorrect: ok, responseMs: Math.min(ms, 2_000_000_000), rapid, createdAt: now });
  // the estimate from all careful answers (rapid guesses are not scored, as NWEA)
  const answers = await repo.findMany("MapSimAnswer", { sessionId }, { select: ["itemRit", "isCorrect", "rapid", "n"] });
  const est = estimate(answers.filter((a) => !a.rapid).map((a) => ({ b: Number(a.itemRit), x: a.isCorrect ? 1 : 0 })), Number(row.startRit));
  const recentRapid = answers.sort((a, b) => Number(b.n) - Number(a.n)).slice(0, 6).filter((a) => a.rapid).length;
  const next = { answered: n, correct: Number(row.correct) + (ok ? 1 : 0), rapid: Number(row.rapid) + (rapid ? 1 : 0), rit: est.rit, se: est.se, servedQuestionId: null, servedAt: null };
  await repo.updateMany("MapSimSession", { id: sessionId }, next);
  let warning: string | null = null;
  if (rapid && recentRapid >= 2) {
    warning = "Slow down 🙂 Read each question carefully before you answer. Your teacher wants to see what you really know.";
    if (recentRapid === 3 && row.kind === "SIM") await tellTeachers(repo, sid, `⚡ Rapid answers in the MAP practice test`, `A student is answering too fast to read the questions (${s(row.subject) === "READING" ? "Reading" : "Language Usage"}). Check on them.`, now);
  }
  return serveNext(repo, { ...row, ...next }, grade, now, warning);
}

async function tellTeachers(repo: Repo, studentId: string, title: string, body: string, now: Date): Promise<void> {
  const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  const ct = m.length ? await repo.findMany("ClassTeacher", { classId: { in: m.map((x) => x.classId) } }) : [];
  const ts = ct.length ? await repo.findMany("Teacher", { id: { in: ct.map((c) => c.teacherId) } }, { select: ["userId"] }) : [];
  const names = await studentNames(repo, [studentId]);
  if (ts.length) await repo.createMany("Notification", ts.map((t) => ({ userId: t.userId, type: "INTERVENTION_ALERT", title, body: `${names.get(studentId)?.name ?? "A student"}: ${body}`, link: "/teacher/map-test", createdAt: now })));
}

async function finish(repo: Repo, row: Row, now: Date, warning: string | null): Promise<TestScreen> {
  const answers = (await repo.findMany("MapSimAnswer", { sessionId: row.id })).filter((a) => !a.rapid);
  const overall = estimate(answers.map((a) => ({ b: Number(a.itemRit), x: a.isCorrect ? 1 : 0 })), Number(row.startRit));
  const rit = Math.round(overall.rit), half = Math.max(2, Math.round(overall.se));
  // each goal area: its own answers, pulled toward the overall result (few answers per area)
  const areas: Record<string, { rit: number; n: number }> = {};
  for (const g of GROUPS.filter((x) => x.subject === s(row.subject))) {
    const mine = answers.filter((a) => a.area === g.key);
    if (!mine.length) continue;
    areas[g.key] = { rit: Math.round(estimate(mine.map((a) => ({ b: Number(a.itemRit), x: a.isCorrect ? 1 : 0 })), overall.rit, 8).rit), n: mine.length };
  }
  const data = { status: "DONE", rit: overall.rit, se: overall.se, resultRit: rit, resultLow: rit - half, resultHigh: rit + half, areas, servedQuestionId: null, servedAt: null, finishedAt: now };
  await repo.updateMany("MapSimSession", { id: row.id }, data);
  return screen(repo, { ...row, ...data }, now, warning);
}

// ------------------------------------------------------------------ results for teachers and the head of department

export interface SimRow {
  studentId: string; name: string; status: "NOT_STARTED" | "IN_PROGRESS" | "DONE"; answered: number; total: number;
  rit: number | null; low: number | null; high: number | null; fall: number | null; goal: number | null; expected: number | null; onTrack: boolean | null; growth: number | null;
  rapidPct: number | null; retest: boolean; descriptor: Descriptor | null; areas: { key: GroupKey; name: string; icon: string; rit: number | null; status: AreaStatus | null }[];
}
export interface SimClass { windowId: string; title: string; className: string; grade: number; subject: Subject; rows: SimRow[]; done: number; members: number; avg: number | null; onTrack: number; offTrack: number; canEdit: boolean }

/** Where the student should be now: the Fall RIT plus the share of the year's projected growth (Winter ≈ 55%). */
export function expectedNow(fall: number, growth: number, season: string): number {
  return Math.round(fall + growth * (season === "WINTER" ? 0.55 : season === "SPRING" ? 1 : 0));
}

export async function classResults(repo: Repo, actor: Actor, windowId: string, classId: string, subject: Subject): Promise<SimClass> {
  assertCan(actor, "reports:read");
  const w = await repo.findUnique("MapSimWindow", { id: windowId });
  if (!w || s(w.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  const klass = await assertClassRead(repo, actor, classId);
  let canEdit = true; try { await assertClassAccess(repo, actor, classId); } catch { canEdit = false; }
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const [names, profiles, sessions] = await Promise.all([studentNames(repo, ids), mapProfiles(repo, actor.schoolId!, ids, subject), ids.length ? repo.findMany("MapSimSession", { windowId, studentId: { in: ids }, subject, kind: "SIM" }) : Promise.resolve([] as Row[])]);
  await ensureNationalNorms(repo);
  const norm = await nationalNorm(repo, grade, (s(w.season) as Season) || "WINTER");
  const pctOf = (rit: number) => (norm ? Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-1.702 * ((rit - norm.mean) / norm.sd)))))) : null);
  const rows: SimRow[] = ids.map((id) => {
    const x = sessions.find((y) => y.studentId === id), p = profiles.get(id) as MapProfile | undefined;
    const done = x?.status === "DONE";
    const rit = done ? Number(x!.resultRit) : null;
    const fall = p?.fall?.rit ?? null, goal = p?.fall?.projection ?? null;
    const expected = fall !== null && p?.fall?.growth !== null && p?.fall?.growth !== undefined ? expectedNow(fall, p.fall.growth, s(w.season)) : null;
    let ar: Record<string, { rit: number }> = {};
    if (x?.areas) ar = (typeof x.areas === "string" ? JSON.parse(x.areas) : x.areas) as Record<string, { rit: number }>;
    const areas = GROUPS.filter((g) => g.subject === subject).map((g) => {
      const r = ar[g.key]?.rit ?? null;
      const pc = r === null ? null : pctOf(r), d = pc === null ? null : (bandOf(pc) as Descriptor);
      const st: AreaStatus | null = r === null || rit === null ? null : d === "Low" || d === "LoAvg" || r <= rit - 3 ? "FOCUS" : (d === "HiAvg" || d === "High") && r >= rit + 3 ? "EXTEND" : "MAINTAIN";
      return { key: g.key, name: g.name, icon: g.icon, rit: r, status: st };
    });
    const pc = rit === null ? null : pctOf(rit);
    const rapidPct = x && Number(x.answered) ? Math.round((100 * Number(x.rapid)) / Number(x.answered)) : null;
    return { studentId: id, name: names.get(id)?.name ?? "Student", status: (x ? s(x.status) : "NOT_STARTED") as SimRow["status"], answered: Number(x?.answered ?? 0), total: Number(x?.total ?? w.items), rit, low: done ? Number(x!.resultLow) : null, high: done ? Number(x!.resultHigh) : null, fall, goal, expected, onTrack: rit !== null && expected !== null ? rit >= expected - 2 : null, growth: rit !== null && fall !== null ? rit - fall : null, rapidPct, retest: (rapidPct ?? 0) >= 30, descriptor: pc === null ? null : (bandOf(pc) as Descriptor), areas };
  }).sort((a, b) => Number(a.onTrack !== false) - Number(b.onTrack !== false) || (a.rit ?? 999) - (b.rit ?? 999) || a.name.localeCompare(b.name));
  const done = rows.filter((r) => r.status === "DONE");
  return { windowId, title: s(w.title), className: s(klass.name), grade, subject, rows, done: done.length, members: ids.length, avg: done.length ? Math.round(done.reduce((t, r) => t + r.rit!, 0) / done.length) : null, onTrack: rows.filter((r) => r.onTrack === true).length, offTrack: rows.filter((r) => r.onTrack === false).length, canEdit };
}

/** The whole school (head of department): each class of the window's grade(s). */
export async function schoolResults(repo: Repo, actor: Actor, windowId: string, subject: Subject): Promise<{ title: string; classes: { classId: string; className: string; grade: number; done: number; members: number; avg: number | null; onTrack: number; offTrack: number; retest: number }[] }> {
  if (!isAdmin(actor) && actor.role !== "TEACHER") throw new ForbiddenError();
  const w = await repo.findUnique("MapSimWindow", { id: windowId });
  if (!w || s(w.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  const classes = await readableClasses(repo, actor);
  const out = [];
  for (const c of classes) {
    const g = Number((await repo.findUnique("Grade", { id: c.gradeId }))?.level ?? 0);
    if (w.grade !== null && w.grade !== undefined && Number(w.grade) !== g) continue;
    const r = await classResults(repo, actor, windowId, s(c.id), subject);
    out.push({ classId: s(c.id), className: r.className, grade: g, done: r.done, members: r.members, avg: r.avg, onTrack: r.onTrack, offTrack: r.offTrack, retest: r.rows.filter((x) => x.retest).length });
  }
  return { title: s(w.title), classes: out.sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className)) };
}

/** New DRAFT MAP plans from the practice-test results (the teacher checks and sends them, as usual). */
export async function draftsFromTest(repo: Repo, actor: Actor, windowId: string, classId: string, subject: Subject, now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const v = await classResults(repo, actor, windowId, classId, subject);
  const w = await repo.findUnique("MapSimWindow", { id: windowId });
  const bands = await bandSettings(repo, actor.schoolId);
  const grade = v.grade;
  const pk = await groupPools(repo, actor.schoolId!, grade);
  const term = `Practice test ${s(w?.title).slice(0, 20)} ${new Date(time(w?.opensAt)).toISOString().slice(0, 10)}`.slice(0, 40);
  const existing = await repo.findMany("MapPlan", { classId, subject, term });
  let n = 0;
  for (const r of v.rows) {
    if (r.rit === null || existing.some((x) => x.studentId === r.studentId)) continue;
    const profile: MapProfile = {
      studentId: r.studentId, subject, term, season: null, grade,
      overall: { rit: r.rit, percentile: null, descriptor: r.descriptor, band: ritBand(r.rit, bands).label, lexile: null, rapidGuessPct: r.rapidPct },
      fall: null, history: [],
      areas: r.areas.map((a) => { const b = a.rit === null ? null : ritBand(a.rit, bands); return { group: a.key, name: a.name, icon: a.icon, rit: a.rit, band: b?.label ?? null, low: b?.low ?? null, high: b?.high ?? null, percentile: null, descriptor: null, status: a.status }; }),
      hasGoals: r.areas.some((a) => a.rit !== null),
    };
    const skillsByGroup = new Map<GroupKey, string[]>(GROUPS.map((g) => [g.key, [...new Set((pk.pools.get(g.key) ?? []).map((q) => q.skillId))]]));
    const items = autoItems(profile, skillsByGroup, bands);
    if (!items.length) continue;
    await repo.create("MapPlan", { schoolId: actor.schoolId!, classId, studentId: r.studentId, subject, term, status: "DRAFT", items, note: "From the MAP practice test.", dueAt: null, assignmentIds: null, createdById: actor.userId, createdAt: now, updatedAt: now, sentAt: null });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ how good was the estimate? (after the real MAP)

export interface Accuracy { pairs: number; meanAbs: number | null; bias: number | null; within5: number | null; rows: { name: string; predicted: number; actual: number }[] }

/** Compares each finished practice test with the student's real MAP score of the next term (same subject). */
export async function accuracy(repo: Repo, actor: Actor, windowId: string, subject: Subject): Promise<Accuracy> {
  if (!isStaff(actor)) throw new ForbiddenError();
  const w = await repo.findUnique("MapSimWindow", { id: windowId });
  if (!w || s(w.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  let sessions = await repo.findMany("MapSimSession", { windowId, subject, kind: "SIM", status: "DONE" });
  if (!isAdmin(actor)) {   // a teacher sees only the students of their classes
    const mine = new Set((await Promise.all((await readableClasses(repo, actor)).map((c) => classMembers(repo, s(c.id))))).flat());
    sessions = sessions.filter((x) => mine.has(s(x.studentId)));
  }
  const ids = sessions.map((x) => s(x.studentId));
  const real = ids.length ? (await repo.findMany("MapResult", { studentId: { in: ids }, goalName: null })).filter((r) => (subject === "READING" ? /read/i : /language/i).test(s(r.subject)) && time(r.testDate) >= time(w.opensAt) - 7 * DAY && time(r.testDate) <= time(w.closesAt) + 75 * DAY) : [];
  const names = await studentNames(repo, ids);
  const rows: Accuracy["rows"] = [];
  for (const x of sessions) {
    const r = real.filter((y) => y.studentId === x.studentId).sort((a, b) => time(a.testDate) - time(b.testDate))[0];
    if (r) rows.push({ name: names.get(s(x.studentId))?.name ?? "Student", predicted: Number(x.resultRit), actual: Number(r.rit) });
  }
  if (!rows.length) return { pairs: 0, meanAbs: null, bias: null, within5: null, rows };
  const d = rows.map((r) => r.predicted - r.actual);
  return { pairs: rows.length, meanAbs: Math.round((10 * d.reduce((t, x) => t + Math.abs(x), 0)) / d.length) / 10, bias: Math.round((10 * d.reduce((t, x) => t + x, 0)) / d.length) / 10, within5: Math.round((100 * d.filter((x) => Math.abs(x) <= 5).length) / d.length), rows: rows.sort((a, b) => Math.abs(b.predicted - b.actual) - Math.abs(a.predicted - a.actual)) };
}

/**
 * Corrects each question's RIT from REAL MAP scores: students who answered it in a practice test and have a real
 * score of that season. b solves Σ(x − P(rit − b)) = 0, mixed with the old value by the number of answers (n / (n + 10)).
 */
export async function recalibrateFromReal(repo: Repo, actor: Actor, windowId: string, now = new Date()): Promise<{ questions: number; changed: number }> {
  if (!isAdmin(actor)) throw new ForbiddenError();
  const w = await repo.findUnique("MapSimWindow", { id: windowId });
  if (!w || s(w.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  const sessions = await repo.findMany("MapSimSession", { windowId, kind: "SIM" });
  if (!sessions.length) return { questions: 0, changed: 0 };
  const real = (await repo.findMany("MapResult", { studentId: { in: [...new Set(sessions.map((x) => s(x.studentId)))] }, goalName: null })).filter((r) => time(r.testDate) >= time(w.opensAt) - 7 * DAY && time(r.testDate) <= time(w.closesAt) + 75 * DAY);
  const ritOf = (studentId: string, subject: string) => real.find((r) => r.studentId === studentId && (subject === "READING" ? /read/i : /language/i).test(s(r.subject)));
  const answers = await repo.findMany("MapSimAnswer", { sessionId: { in: sessions.map((x) => x.id) } });
  const by = new Map<string, { r: number; x: number }[]>();
  for (const a of answers) {
    if (a.rapid) continue;
    const se = sessions.find((x) => x.id === a.sessionId)!;
    const r = ritOf(s(se.studentId), s(se.subject));
    if (r) by.set(s(a.questionId), [...(by.get(s(a.questionId)) ?? []), { r: Number(r.rit), x: a.isCorrect ? 1 : 0 }]);
  }
  const qs = by.size ? await repo.findMany("Question", { id: { in: [...by.keys()] } }, { select: ["id", "tags"] }) : [];
  let changed = 0;
  for (const q of qs) {
    const list = by.get(s(q.id))!;
    if (list.length < 5) continue;
    let tags: Record<string, unknown> = {}; try { tags = (typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags ?? {}) as Record<string, unknown>; } catch { tags = {}; }
    const old = Number((tags.rit as { value?: number } | undefined)?.value ?? list.reduce((t, a) => t + a.r, 0) / list.length);
    let b = old;
    for (let i = 0; i < 30; i++) {
      let f = 0, d = 0;
      for (const a of list) { const p = 1 / (1 + Math.exp(-(a.r - b) / 10)); f += a.x - p; d += (p * (1 - p)) / 10; }
      if (d < 1e-6) break;
      const step = -f / d;
      b = Math.max(120, Math.min(320, b + Math.max(-10, Math.min(10, step))));
      if (Math.abs(step) < 0.05) break;
    }
    const wgt = list.length / (list.length + 10), value = Math.round(old * (1 - wgt) + b * wgt);
    if (value !== Math.round(old)) changed++;
    await repo.updateMany("Question", { id: q.id }, { tags: { ...tags, rit: { value, answers: list.length, source: "MAP practice test vs real MAP", at: now.toISOString() } } });
  }
  await audit(repo, { actorId: actor.userId, action: "mapsim.recalibrate", entityType: "MapSimWindow", entityId: windowId, after: { questions: qs.length, changed }, at: now });
  return { questions: qs.length, changed };
}

export const _test = { subjectOfGroup };
