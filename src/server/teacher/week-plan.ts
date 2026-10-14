/**
 * 📅 The teacher's week: a suggested plan for each class (weakest skills, MAP drafts to send, small groups, open
 * alerts, the weekly rhythm) with “Plan next week” in one click; and ✅ the first-week checklist for new teachers.
 * 🔢 Also the numbers on the navigation icons (tasks to do, overdue in red).
 */
import { TtlCache } from "../lib/ttl-cache";
import type { Repo, Row } from "../seeding/repo";
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
import { secondChanceCount } from "../second-chance/service";
import { hiddenWorkKeys } from "../student/cancelled-work";

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
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: OKEY(actor.userId) }, { value: { hidden }, updatedBy: actor.userId, updatedAt: now }, { value: { hidden }, updatedBy: actor.userId, updatedAt: now });
}

// ------------------------------------------------------------------ 🔢 numbers on the navigation icons

export interface NavCount { count: number; alert: boolean }

/**
 * The header numbers are asked on every page: kept 15 s per person (a click after a click costs nothing), at most
 * 5,000 people in memory (least recently used dropped first) — Update 42B.
 */
const navCache = new TtlCache<Record<string, NavCount>>(15_000, 5000);
export async function navCountsCached(repo: Repo, actor: Actor, now = new Date()): Promise<Record<string, NavCount>> {
  return navCache.getOrLoad(actor.userId, () => navCounts(repo, actor, now), now.getTime());
}

/** Cheap counts for the header (every page): tasks to do per area (red when overdue or due today). */
export async function navCounts(repo: Repo, actor: Actor, now = new Date()): Promise<Record<string, NavCount>> {
  const out: Record<string, NavCount> = {};
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)).getTime();
  if (actor.role === "STUDENT" && actor.studentId) {
    // every independent read in one round trip (Update 42B), then the few that need their results
    // (work the teacher cancelled — "Assigned" — is not counted: hidden = its My Work keys)
    const [rowsAll, respondAll, cls, winsAll, fresh, words, quizzed, tier, hidden] = await Promise.all([
      repo.findMany("AssignmentStudent", { studentId: actor.studentId, status: { in: ["NOT_STARTED", "IN_PROGRESS", "OVERDUE"] } }, { select: ["assignmentId", "status"] }),
      repo.findMany("RespondAssignmentStudent", { studentId: actor.studentId, finishedAt: null }, { select: ["assignmentId"] }),
      repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] }).then((r) => r.map((m) => m.classId)),
      repo.findMany("MapSimWindow", { schoolId: actor.schoolId }, { select: ["id", "grade", "subjects", "opensAt", "closesAt"] }),
      repo.count("StudentBadge", { studentId: actor.studentId, awardedAt: { gte: new Date(now.getTime() - 3 * DAY) } }),
      repo.count("StudentWord", { studentId: actor.studentId }),
      repo.count("StudentWord", { studentId: actor.studentId, lastQuizAt: { gte: weekStart(now) } }),
      repo.findUnique("StudentTier", { studentId: actor.studentId }),
      hiddenWorkKeys(repo, actor.studentId, actor.schoolId).catch(() => new Set<string>()),
    ]);
    const rows = rowsAll.filter((r) => !hidden.has(s(r.assignmentId)));
    const respond = respondAll.filter((r) => !hidden.has(`respond:${s(r.assignmentId)}`));
    // student home (UI reorg Phase 2): the RTI Program entry is shown only to students in Tier 2/3 (count 0 = no badge)
    if (Number(tier?.tier ?? 1) >= 2) out["/student/rti"] = { count: 0, alert: false };
    const wins = winsAll.filter((w) => time(w.opensAt) <= now.getTime() && time(w.closesAt) > now.getTime());
    const [as, ra, tasks, st, done] = await Promise.all([
      rows.length ? repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "track", "dueAt", "startAt", "testId", "curriculumPlanId"] }) : Promise.resolve([] as Row[]),
      respond.length ? repo.findMany("RespondAssignment", { id: { in: respond.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "dueAt"] }) : Promise.resolve([] as Row[]),
      cls.length ? repo.findMany("WritingTask", { classId: { in: cls }, deletedAt: null }, { select: ["id", "dueAt"] }) : Promise.resolve([] as Row[]),
      wins.length ? repo.findUnique("Student", { id: actor.studentId }) : Promise.resolve(null),
      wins.length ? repo.findMany("MapSimSession", { studentId: actor.studentId, kind: "SIM", status: "DONE" }, { select: ["windowId", "subject"] }) : Promise.resolve([] as Row[]),
    ]);
    const add = (href: string, urgent: boolean) => { const v = out[href] ?? { count: 0, alert: false }; v.count++; v.alert ||= urgent; out[href] = v; };
    for (const r of rows) {
      const a = as.find((x) => x.id === r.assignmentId);
      if (!a || (a.startAt && time(a.startAt) > now.getTime())) continue;
      const urgent = r.status === "OVERDUE" || Boolean(a.dueAt && time(a.dueAt) <= endOfDay);
      // MAP work is in My Work now (UI reorg Phase 2); tests are counted on My Tests
      add(a.testId ? "/student/tests" : a.curriculumPlanId ? "/student/plans" : "/student", urgent);
    }
    for (const a of ra) add("/student/respond", Boolean(a.dueAt && time(a.dueAt) <= endOfDay));
    // writing / reading-aloud tasks not handed in yet
    if (tasks.length) {
      const handed = new Set((await repo.findMany("WritingSubmission", { studentId: actor.studentId, taskId: { in: tasks.map((t) => t.id) } }, { select: ["taskId", "status"] })).filter((x) => x.status !== "DRAFT").map((x) => s(x.taskId)));
      for (const t of tasks) if (!handed.has(s(t.id)) && !hidden.has(`writing:${s(t.id)}`) && !hidden.has(`read_aloud:${s(t.id)}`)) add("/student/writing", Boolean(t.dueAt && time(t.dueAt) <= endOfDay));
    }
    // an open MAP practice test not finished yet counts on My MAP
    if (wins.length) {
      const g = st?.gradeId ? Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0) : 0;
      for (const w of wins) {
        if (w.grade !== null && w.grade !== undefined && Number(w.grade) !== g) continue;
        const subs = (Array.isArray(w.subjects) ? w.subjects : JSON.parse(s(w.subjects) || "[]")) as string[];
        for (const sub of subs) if (!done.some((d) => d.windowId === w.id && d.subject === sub) && !hidden.has(`map_test:${s(w.id)}:${sub}`)) add("/student/plans", time(w.closesAt) - now.getTime() < 2 * DAY);
      }
    }
    if (fresh) out["/student/badges"] = { count: fresh, alert: false };
    // ⭐ Second Chance: questions waiting to be fixed
    const chance = await secondChanceCount(repo, actor.studentId, now).catch(() => 0);
    if (chance) out["/student/second-chance"] = { count: chance, alert: false };
    if (words >= 4) {
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
