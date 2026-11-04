/**
 * 📅 The teacher's class today and this week — read only, bounded reads, the teacher's own class only.
 *
 *   classToday   three big numbers for the Teacher Home: students who worked today · students who need help
 *                (an open alert or Tier 2/3) · students who have not started work that is already open
 *   myWeek       this school week (Sunday → Thursday, Riyadh time): the work that starts / is due each day, what is
 *                due with how many finished, who has not started, and the Live Challenges of the week
 *
 * Nothing here changes levels, scores or the engine.
 */
import type { Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { assertClassAccess } from "./assignments";
import { studentNames } from "../insights/student-data";
import { cancelIndex, liveAssignmentWhere } from "../student/cancelled-work";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const time = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : String(v)).getTime() : 0);
const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;
const CHUNK = 400;
async function inChunks<T>(ids: string[], f: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await f(ids.slice(i, i + CHUNK))));
  return out;
}

/** Midnight (Riyadh) of the day of `now`, as a UTC instant. */
export function riyadhMidnight(now: Date): Date {
  const local = now.getTime() + RIYADH;
  return new Date(local - (local % DAY) - RIYADH);
}
/** Sunday midnight (Riyadh) of the school week of `now` (Friday and Saturday belong to the week just ended). */
export function schoolWeekStart(now: Date): Date {
  const mid = riyadhMidnight(now);
  const dow = new Date(mid.getTime() + RIYADH).getUTCDay(); // 0 = Sunday
  return new Date(mid.getTime() - dow * DAY);
}

async function members(repo: Repo, classId: string): Promise<string[]> {
  return (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
}

export interface ClassToday { students: number; doneToday: number; needHelp: number; notStarted: number }

/** The Teacher Home's three numbers for one class. */
export async function classToday(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassToday> {
  await assertClassAccess(repo, actor, classId);
  const ids = await members(repo, classId);
  if (!ids.length) return { students: 0, doneToday: 0, needHelp: 0, notStarted: 0 };
  const today = riyadhMidnight(now);
  const [sessions, finished, alerts, tiers, work, ix] = await Promise.all([
    inChunks(ids, (part) => repo.findMany("PracticeSession", { studentId: { in: part }, startedAt: { gte: today }, questionCount: { gt: 0 } }, { select: ["studentId"] })),
    inChunks(ids, (part) => repo.findMany("AssignmentStudent", { studentId: { in: part }, completedAt: { gte: today } }, { select: ["studentId"] })),
    repo.findMany("StudentAlert", { classId, status: "OPEN" }, { select: ["studentId"] }),
    inChunks(ids, (part) => repo.findMany("StudentTier", { studentId: { in: part }, tier: { gte: 2 } }, { select: ["studentId"] })),
    repo.findMany("Assignment", liveAssignmentWhere({ classId }), { select: ["id", "startAt", "createdAt", "curriculumPlanId", "testId"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 200 }),
    cancelIndex(repo, actor.schoolId),
  ]);
  const inClass = new Set(ids);
  const done = new Set([...sessions, ...finished].map((r) => s(r.studentId)).filter((x) => inClass.has(x)));
  const help = new Set([...alerts, ...tiers].map((r) => s(r.studentId)).filter((x) => inClass.has(x)));
  // r78: work cancelled on Assigned (for everyone or one student) is never "not started"
  const open = work.filter((a) => (!a.startAt || time(a.startAt) <= now.getTime()) && ix.live(a));
  const openById = new Map(open.map((a) => [s(a.id), a]));
  const waiting = open.length ? await inChunks(open.map((a) => s(a.id)), (part) => repo.findMany("AssignmentStudent", { assignmentId: { in: part }, status: { in: ["NOT_STARTED", "OVERDUE"] } }, { select: ["assignmentId", "studentId", "progress"] })) : [];
  const notStarted = new Set(waiting.filter((r) => Number(r.progress ?? 0) <= 0 && inClass.has(s(r.studentId)) && ix.live(openById.get(s(r.assignmentId)) ?? { id: s(r.assignmentId) }, s(r.studentId))).map((r) => s(r.studentId)));
  return { students: ids.length, doneToday: done.size, needHelp: help.size, notStarted: notStarted.size };
}

export interface WeekItem { id: string; title: string; kind: "START" | "DUE"; href: string }
export interface MyWeek {
  start: string; // YYYY-MM-DD (Sunday)
  days: { date: string; items: WeekItem[] }[];
  due: { id: string; title: string; dueAt: string; done: number; total: number; href: string }[];
  notStarted: { studentId: string; name: string; titles: string[] }[];
  games: { id: string; title: string; status: string; when: string; href: string }[];
}

const ymd = (ms: number) => new Date(ms + RIYADH).toISOString().slice(0, 10);

/** This school week for one of the teacher's classes. */
export async function myWeek(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<MyWeek> {
  await assertClassAccess(repo, actor, classId);
  const start = schoolWeekStart(now).getTime();
  const end = start + 5 * DAY; // Sunday → Thursday
  const ids = await members(repo, classId);
  const [allRows, games, ix] = await Promise.all([
    repo.findMany("Assignment", liveAssignmentWhere({ classId }), { select: ["id", "title", "startAt", "dueAt", "createdAt", "curriculumPlanId", "testId"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }),
    repo.findMany("LiveGame", { classId, createdAt: { gte: new Date(start - 7 * DAY) } }, { select: ["id", "title", "status", "createdAt", "finishedAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 30 }),
    cancelIndex(repo, actor.schoolId),
  ]);
  // r78: cancelled on Assigned = not on the week, not "due", not "not started"
  const rows = allRows.filter((a) => ix.live(a));
  const inWeek = (ms: number) => ms >= start && ms < end;
  const startOf = (a: Row) => time(a.startAt) || time(a.createdAt);
  const week = rows.filter((a) => inWeek(startOf(a)) || inWeek(time(a.dueAt)));
  const href = (a: Row) => (a.testId ? `/teacher/assessments/${s(a.testId)}` : `/teacher/assignments/${s(a.id)}`);
  const days = Array.from({ length: 5 }, (_, i) => ({ date: ymd(start + i * DAY), items: [] as WeekItem[] }));
  const seen = new Set<string>();
  const put = (ms: number, item: WeekItem) => {
    const d = days.find((x) => x.date === ymd(ms));
    const key = `${d?.date}|${item.kind}|${item.title}`;
    if (d && !seen.has(key)) { seen.add(key); d.items.push(item); }
  };
  for (const a of week) {
    if (inWeek(startOf(a))) put(startOf(a), { id: s(a.id), title: s(a.title), kind: "START", href: href(a) });
    if (inWeek(time(a.dueAt))) put(time(a.dueAt), { id: s(a.id), title: s(a.title), kind: "DUE", href: href(a) });
  }
  for (const d of days) d.items = d.items.slice(0, 12);
  const dueRows = week.filter((a) => inWeek(time(a.dueAt)) && !a.curriculumPlanId).slice(0, 30);
  const opened = week.filter((a) => startOf(a) <= now.getTime()).slice(0, 100);
  const allIds = [...new Set([...dueRows, ...opened].map((a) => s(a.id)))];
  const rowById = new Map(rows.map((a) => [s(a.id), a]));
  const asg = (allIds.length ? await inChunks(allIds, (part) => repo.findMany("AssignmentStudent", { assignmentId: { in: part } }, { select: ["assignmentId", "studentId", "status", "progress"] })) : [])
    .filter((r) => ix.live(rowById.get(s(r.assignmentId)) ?? { id: s(r.assignmentId) }, s(r.studentId)));
  const inClass = new Set(ids);
  const due = dueRows.map((a) => {
    const mine = asg.filter((r) => r.assignmentId === a.id && inClass.has(s(r.studentId)));
    return { id: s(a.id), title: s(a.title), dueAt: new Date(time(a.dueAt)).toISOString(), done: mine.filter((r) => r.status === "COMPLETED").length, total: mine.length, href: href(a) };
  }).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const titleOf = new Map(opened.map((a) => [s(a.id), s(a.title)]));
  const openIds = new Set(opened.map((a) => s(a.id)));
  const waiting = new Map<string, string[]>();
  for (const r of asg) {
    if (!openIds.has(s(r.assignmentId)) || !inClass.has(s(r.studentId))) continue;
    if (!["NOT_STARTED", "OVERDUE"].includes(s(r.status)) || Number(r.progress ?? 0) > 0) continue;
    const t = titleOf.get(s(r.assignmentId)) ?? "";
    const list = waiting.get(s(r.studentId)) ?? [];
    if (t && !list.includes(t)) list.push(t);
    waiting.set(s(r.studentId), list);
  }
  const names = waiting.size ? await studentNames(repo, [...waiting.keys()]) : new Map<string, { name: string }>();
  const notStarted = [...waiting].map(([id, titles]) => ({ studentId: id, name: names.get(id)?.name ?? "Student", titles: titles.slice(0, 3) })).sort((a, b) => a.name.localeCompare(b.name));
  // planned (not finished yet) or played this week
  const liveGames = games.filter((g) => s(g.status) !== "FINISHED" || time(g.createdAt) >= start)
    .map((g) => ({ id: s(g.id), title: s(g.title), status: s(g.status), when: new Date(time(g.createdAt)).toISOString(), href: `/teacher/games/${s(g.id)}` }));
  return { start: ymd(start), days, due, notStarted, games: liveGames };
}
