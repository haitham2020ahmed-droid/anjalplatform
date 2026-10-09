/**
 * 📅 The teacher's week: a suggested plan for each class (weakest skills, MAP drafts to send, small groups, open
 * alerts, the weekly rhythm) with “Plan next week” in one click; and ✅ the first-week checklist for new teachers.
 * 🔢 Also the numbers on the navigation icons (tasks to do, overdue in red).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";
import { readableClasses } from "./coordinators";
import { assignSkill } from "./assign";
import { classMembers } from "../insights/student-data";
import { weakestSkills } from "../insights/department";
import { openAlertCount } from "../insights/alerts";
import { classPlans, sendPlans, smallGroups } from "../map/map-plan";
import { classRhythm, weekStart } from "./classroom";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;

export interface Suggestion { kind: "RETEACH" | "MAP_PLANS" | "GROUPS" | "ALERTS" | "RHYTHM"; text: string; href: string | null }
export interface ClassSuggestions { classId: string; className: string; weak: { skillId: string; name: string; accuracy: number }[]; drafts: number; groups: number; suggestions: Suggestion[] }

export async function weekSuggestions(repo: Repo, actor: Actor, now = new Date()): Promise<ClassSuggestions[]> {
  assertCan(actor, "assignments:create");
  const classes = (await readableClasses(repo, actor)).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  const out: ClassSuggestions[] = [];
  for (const c of classes) {
    try { await assertClassAccess(repo, actor, s(c.id)); } catch { continue; }
    const ids = await classMembers(repo, s(c.id));
    const weak = (await weakestSkills(repo, ids, now, 3)).filter((w) => w.accuracy < 70);
    const plans = await classPlans(repo, actor, s(c.id), "READING");
    const drafts = plans.plans.filter((p) => p.status === "DRAFT").length;
    const groups = (await smallGroups(repo, actor, s(c.id), "READING")).length;
    const rhythm = await classRhythm(repo, actor.schoolId!, s(c.id));
    const alerts = await repo.count("StudentAlert", { classId: c.id, status: "OPEN" });
    const sug: Suggestion[] = [];
    for (const w of weak.slice(0, 2)) sug.push({ kind: "RETEACH", text: `Reteach “${w.name}”: the class is at ${w.accuracy}% (${w.answers} answers).`, href: `/teacher/skill-assign?skillId=${w.skillId}&classId=${s(c.id)}` });
    if (drafts) sug.push({ kind: "MAP_PLANS", text: `${drafts} MAP plan(s) are ready to check and send.`, href: `/teacher/map-plans?classId=${s(c.id)}&tab=plans` });
    if (groups) sug.push({ kind: "GROUPS", text: `${groups} small group(s) need the same MAP area: teach them together.`, href: `/teacher/map-plans?classId=${s(c.id)}&tab=groups` });
    if (alerts) sug.push({ kind: "ALERTS", text: `${alerts} student alert(s) to follow up.`, href: `/teacher/alerts?classId=${s(c.id)}` });
    if (!rhythm) sug.push({ kind: "RHYTHM", text: "Set how many days a week the class practises (students get a reminder).", href: null });
    out.push({ classId: s(c.id), className: s(c.name), weak: weak.map((w) => ({ skillId: w.skillId, name: w.name, accuracy: w.accuracy })), drafts, groups, suggestions: sug });
  }
  return out;
}

/** “Plan next week” in one click: the weakest skills again (adaptive, due next Thursday) and the MAP drafts sent. */
export async function planNextWeek(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<{ assigned: string[]; plansSent: number }> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const weak = (await weakestSkills(repo, ids, now, 2)).filter((w) => w.accuracy < 70);
  const monday = new Date(weekStart(now).getTime() + 7 * DAY);
  const due = new Date(monday.getTime() + 3 * DAY + 20 * 3600_000);   // Thursday evening
  const assigned: string[] = [];
  for (const w of weak) { await assignSkill(repo, actor, { classId, skillId: w.skillId, startAt: monday, dueAt: due, note: "Practice again: this skill was hard for the class." }, now); assigned.push(w.name); }
  const drafts = (await classPlans(repo, actor, classId, "READING")).plans.filter((p) => p.status === "DRAFT").map((p) => p.id);
  const sent = drafts.length ? (await sendPlans(repo, actor, drafts, now)).sent : 0;
  if (!assigned.length && !sent) throw new ValidationError("Nothing to plan: no weak skill (under 70%) and no MAP draft. Well done!");
  return { assigned, plansSent: sent };
}

// ------------------------------------------------------------------ ✅ first-week checklist

export interface CheckStep { key: string; title: string; done: boolean; href: string }
const OKEY = (userId: string) => `onboard.${userId}`;

export async function onboarding(repo: Repo, actor: Actor): Promise<{ steps: CheckStep[]; hidden: boolean; done: number }> {
  const row = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: OKEY(actor.userId) }))[0];
  let v: unknown = row?.value ?? null; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const hidden = Boolean((v as { hidden?: boolean } | null)?.hidden);
  const classes = await readableClasses(repo, actor);
  const cids = classes.map((c) => c.id);
  const ids = [...new Set((await Promise.all(cids.map((c) => classMembers(repo, s(c))))).flat())];
  const teacher = await repo.findUnique("Teacher", { userId: actor.userId });
  const users = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["userId"] }) : [];
  const logged = users.length ? (await repo.findMany("User", { id: { in: users.map((u) => u.userId) } }, { select: ["lastLoginAt"] })).filter((u) => u.lastLoginAt).length : 0;
  const [maps, asg, plans, tickets, rhythms] = await Promise.all([
    ids.length ? repo.count("MapResult", { studentId: { in: ids } }) : Promise.resolve(0),
    teacher ? repo.count("Assignment", { createdById: teacher.id }) : Promise.resolve(0),
    cids.length ? repo.count("MapPlan", { classId: { in: cids }, status: "SENT" }) : Promise.resolve(0),
    repo.count("ExitTicket", { createdById: actor.userId }),
    Promise.all(cids.map((c) => classRhythm(repo, actor.schoolId!, s(c)))),
  ]);
  const steps: CheckStep[] = [
    { key: "classes", title: "Open My Classes and check your students", done: cids.length > 0, href: "/teacher/classes" },
    { key: "login", title: "Students signed in (at least half)", done: ids.length > 0 && logged >= ids.length / 2, href: "/teacher/classes" },
    { key: "map", title: "MAP scores are on the platform (import or type)", done: maps > 0, href: "/teacher/map-rit" },
    { key: "assign", title: "Send your first assignment", done: asg > 0, href: "/admin/curriculum-map" },
    { key: "plans", title: "Check and send the MAP plans", done: plans > 0, href: "/teacher/map-plans?tab=plans" },
    { key: "rhythm", title: "Set the weekly practice rhythm", done: rhythms.some(Boolean), href: "/teacher/week" },
    { key: "exit", title: "Try an exit ticket at the end of a lesson", done: tickets > 0, href: "/teacher/week" },
  ];
  return { steps, hidden, done: steps.filter((x) => x.done).length };
}

export async function hideOnboarding(repo: Repo, actor: Actor, hidden: boolean, now = new Date()): Promise<void> {
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: OKEY(actor.userId) }, { value: { hidden }, updatedById: actor.userId, updatedAt: now }, { value: { hidden }, updatedById: actor.userId, updatedAt: now });
}

// ------------------------------------------------------------------ 🔢 numbers on the navigation icons

export interface NavCount { count: number; alert: boolean }

/** The header numbers are asked on every page: kept 10 s per person (a click after a click costs nothing). */
const navCache = new Map<string, { at: number; v: Record<string, NavCount> }>();
export async function navCountsCached(repo: Repo, actor: Actor, now = new Date()): Promise<Record<string, NavCount>> {
  const hit = navCache.get(actor.userId);
  if (hit && now.getTime() - hit.at < 10_000) return hit.v;
  const v = await navCounts(repo, actor, now);
  if (navCache.size > 5000) navCache.clear();
  navCache.set(actor.userId, { at: now.getTime(), v });
  return v;
}

/** Cheap counts for the header (every page): tasks to do per area (red when overdue or due today). */
export async function navCounts(repo: Repo, actor: Actor, now = new Date()): Promise<Record<string, NavCount>> {
  const out: Record<string, NavCount> = {};
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)).getTime();
  if (actor.role === "STUDENT" && actor.studentId) {
    const rows = await repo.findMany("AssignmentStudent", { studentId: actor.studentId, status: { in: ["NOT_STARTED", "IN_PROGRESS", "OVERDUE"] } }, { select: ["assignmentId", "status"] });
    const as = rows.length ? await repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "track", "dueAt", "startAt"] }) : [];
    const add = (href: string, urgent: boolean) => { const v = out[href] ?? { count: 0, alert: false }; v.count++; v.alert ||= urgent; out[href] = v; };
    for (const r of rows) {
      const a = as.find((x) => x.id === r.assignmentId);
      if (!a || (a.startAt && time(a.startAt) > now.getTime())) continue;
      const urgent = r.status === "OVERDUE" || Boolean(a.dueAt && time(a.dueAt) <= endOfDay);
      add(a.track === "MAP" ? "/student/map" : "/student", urgent);
    }
    const respond = await repo.findMany("RespondAssignmentStudent", { studentId: actor.studentId, finishedAt: null }, { select: ["assignmentId"] });
    if (respond.length) {
      const ra = await repo.findMany("RespondAssignment", { id: { in: respond.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "dueAt"] });
      for (const a of ra) add("/student/respond", Boolean(a.dueAt && time(a.dueAt) <= endOfDay));
    }
    // writing / reading-aloud tasks not handed in yet
    const cls = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] })).map((m) => m.classId);
    const tasks = cls.length ? await repo.findMany("WritingTask", { classId: { in: cls }, deletedAt: null }, { select: ["id", "dueAt"] }) : [];
    if (tasks.length) {
      const handed = new Set((await repo.findMany("WritingSubmission", { studentId: actor.studentId, taskId: { in: tasks.map((t) => t.id) } }, { select: ["taskId", "status"] })).filter((x) => x.status !== "DRAFT").map((x) => s(x.taskId)));
      for (const t of tasks) if (!handed.has(s(t.id))) add("/student/writing", Boolean(t.dueAt && time(t.dueAt) <= endOfDay));
    }
    // an open MAP practice test not finished yet counts on My MAP
    const wins = (await repo.findMany("MapSimWindow", { schoolId: actor.schoolId }, { select: ["id", "grade", "subjects", "opensAt", "closesAt"] })).filter((w) => time(w.opensAt) <= now.getTime() && time(w.closesAt) > now.getTime());
    if (wins.length) {
      const st = await repo.findUnique("Student", { id: actor.studentId });
      const g = st?.gradeId ? Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0) : 0;
      const done = await repo.findMany("MapSimSession", { studentId: actor.studentId, kind: "SIM", status: "DONE" }, { select: ["windowId", "subject"] });
      for (const w of wins) {
        if (w.grade !== null && w.grade !== undefined && Number(w.grade) !== g) continue;
        const subs = (Array.isArray(w.subjects) ? w.subjects : JSON.parse(s(w.subjects) || "[]")) as string[];
        for (const sub of subs) if (!done.some((d) => d.windowId === w.id && d.subject === sub)) add("/student/map", time(w.closesAt) - now.getTime() < 2 * DAY);
      }
    }
    const fresh = await repo.count("StudentBadge", { studentId: actor.studentId, awardedAt: { gte: new Date(now.getTime() - 3 * DAY) } });
    if (fresh) out["/student/badges"] = { count: fresh, alert: false };
    const words = await repo.count("StudentWord", { studentId: actor.studentId });
    if (words >= 4) {
      const quizzed = await repo.count("StudentWord", { studentId: actor.studentId, lastQuizAt: { gte: weekStart(now) } });
      if (!quizzed) out["/student/words"] = { count: 1, alert: false };
    }
    return out;
  }
  if (actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") {
    const n = await openAlertCount(repo, actor);
    if (n) out["/teacher/alerts"] = { count: n, alert: true };
    if (actor.role !== "TEACHER") {
      const f = await repo.count("QuestionFlag", { schoolId: actor.schoolId, status: "OPEN" });
      if (f) out["/admin/question-flags"] = { count: f, alert: false };
    }
  }
  return out;
}
