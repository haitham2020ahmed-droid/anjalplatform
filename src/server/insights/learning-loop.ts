/**
 * 🔄 The Learning Intelligence Loop — the platform's whole cycle in one view, for a class (teacher) or the school
 * (admin), with every student's place in it:
 *
 *   1 MEASURE   MAP Growth (Fall · Winter · Spring), the Diagnostic, the Weekly Check
 *   2 ANALYZE   each student's weakest NWEA instructional area (MAP goal RITs; else the Diagnostic level)
 *   3 PLAN      the MAP plans (individual / groups) made from that area and RIT
 *   4 PRACTICE  adaptive practice; how much of it lands in the student's weakest area (questions carry their
 *               own MAP instructional area), at their level
 *   5 CHECK     the Weekly Check moves the RIT estimate between MAP tests
 *   6 REPORT    family reports (approved by the admin) close the loop with the home — then MEASURE again
 *
 * Each stage has a status (good / to do / needs attention), its numbers and the next action. Each student gets
 * “the next step” that would move them on most. Everything is read from the school's own data; nothing is sent out.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "./student-data";
import { weekStart } from "../student/weekly";
import { areaByKey, areaFromName, type AreaKey } from "../map/nwea-area";

const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

export type StageKey = "MEASURE" | "ANALYZE" | "PLAN" | "PRACTICE" | "CHECK" | "REPORT";
export type Health = "GOOD" | "WARN" | "TODO";
export interface Stage { key: StageKey; n: number; title: string; icon: string; health: Health; score: number; headline: string; metrics: { label: string; value: string }[]; next: { label: string; href: string } | null }
export interface LoopStudent {
  id: string; name: string; className: string;
  rit: number | null; percentile: number | null; weakest: { key: AreaKey; name: string; rit: number | null } | null; diagnostic: string | null;
  plan: "SENT" | "DRAFT" | null; practice7: number; inWeakArea7: number; accuracy7: number | null; check: { done: boolean; change: number | null }; report: "APPROVED" | "PENDING" | null;
  stage: StageKey; next: { label: string; href: string };
}
export interface Loop { scope: string; classId: string | null; students: LoopStudent[]; stages: Stage[]; score: number; areaNeeds: { key: AreaKey; name: string; students: number; practice: number }[]; generatedAt: string }

/** The loop of one class (or every class the actor can see, when classId is null and the actor is an admin). */
export async function learningLoop(repo: Repo, actor: Actor, classId: string | null, now = new Date()): Promise<Loop> {
  assertCan(actor, "reports:read");
  const classes = await readableClasses(repo, actor);
  const scopeClasses = classId ? classes.filter((c) => c.id === classId) : actor.role === "TEACHER" ? classes : classes;
  if (classId && !scopeClasses.length) throw new ForbiddenError("Class not found.");
  const members: { id: string; classId: string }[] = [];
  for (const c of scopeClasses) for (const id of await classMembers(repo, s(c.id))) members.push({ id, classId: s(c.id) });
  const ids = [...new Set(members.map((m) => m.id))];
  const classOf = new Map(members.map((m) => [m.id, m.classId]));
  const className = new Map(scopeClasses.map((c) => [s(c.id), s(c.name)]));
  const week = weekStart(now).toISOString().slice(0, 10);
  const since7 = new Date(now.getTime() - 7 * DAY), since30 = new Date(now.getTime() - 30 * DAY), since28 = new Date(now.getTime() - 28 * DAY);
  const none = <T,>() => Promise.resolve([] as T[]);
  const [names, maps, diag, plans, attempts, checks, reports] = await Promise.all([
    studentNames(repo, ids),
    ids.length ? repo.findMany("MapResult", { studentId: { in: ids } }, { select: ["studentId", "subject", "goalName", "rit", "achievementPercentile", "termName", "testDate"] }) : none<Row>(),
    ids.length ? repo.findMany("DiagnosticScore", { studentId: { in: ids } }, { select: ["studentId", "level", "completedAt"] }) : none<Row>(),
    ids.length ? repo.findMany("MapPlan", { studentId: { in: ids } }, { select: ["studentId", "status", "createdAt"] }) : none<Row>(),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since7 } }, { select: ["studentId", "questionId", "isCorrect"] }) : none<Row>(),
    ids.length ? repo.findMany("WeeklyCheck", { studentId: { in: ids } }, { select: ["studentId", "week", "ritBefore", "ritAfter", "completedAt", "createdAt"] }) : none<Row>(),
    ids.length ? repo.findMany("FamilyReport", { studentId: { in: ids } }, { select: ["studentId", "status", "reviewedAt", "submittedAt"] }) : none<Row>(),
  ]);
  // the MAP area of every question answered this week
  const qIds = [...new Set(attempts.map((a) => s(a.questionId)))];
  const areaOfQ = new Map<string, AreaKey | null>();
  for (let i = 0; i < qIds.length; i += 800) for (const q of await repo.findMany("Question", { id: { in: qIds.slice(i, i + 800) } }, { select: ["id", "mapInstructionalArea"] })) areaOfQ.set(s(q.id), areaFromName(s(q.mapInstructionalArea)));

  const students: LoopStudent[] = ids.map((id): LoopStudent => {
    const mine = maps.filter((m) => m.studentId === id);
    const overall = mine.filter((m) => !m.goalName && /read/i.test(s(m.subject))).sort((a, b) => t(b.testDate) - t(a.testDate))[0];
    const latestTerm = mine.length ? mine.reduce((a, b) => (t(b.testDate) > t(a.testDate) ? b : a)).termName : null;
    const areas = new Map<AreaKey, number>();
    for (const g of mine.filter((m) => m.goalName && s(m.termName) === s(latestTerm))) {
      const k = areaFromName(s(g.goalName).split(":")[0]) ?? areaFromName(s(g.goalName));
      if (k && k !== "WRITING" && !areas.has(k)) areas.set(k, Number(g.rit));
    }
    const w = [...areas].sort((a, b) => a[1] - b[1])[0];
    const d = diag.filter((x) => x.studentId === id).sort((a, b) => t(b.completedAt) - t(a.completedAt))[0];
    const weakest = w ? { key: w[0], name: areaByKey(w[0]).name, rit: w[1] } : null;
    const myPlans = plans.filter((p) => p.studentId === id);
    const plan: LoopStudent["plan"] = myPlans.some((p) => p.status === "SENT") ? "SENT" : myPlans.length ? "DRAFT" : null;
    const myA = attempts.filter((a) => a.studentId === id);
    const inWeak = weakest ? myA.filter((a) => areaOfQ.get(s(a.questionId)) === weakest.key).length : 0;
    const myChecks = checks.filter((c) => c.studentId === id).sort((a, b) => s(b.week).localeCompare(s(a.week)));
    const thisWeek = myChecks.find((c) => s(c.week) === week);
    const recent = myChecks.filter((c) => c.completedAt && t(c.createdAt) >= since28.getTime() && c.ritBefore !== null && c.ritAfter !== null);
    const change = recent.length ? Number(recent[0].ritAfter) - Number(recent[recent.length - 1].ritBefore) : null;
    const myReports = reports.filter((r) => r.studentId === id);
    const report: LoopStudent["report"] = myReports.some((r) => r.status === "APPROVED" && t(r.reviewedAt) >= since30.getTime()) ? "APPROVED" : myReports.some((r) => r.status === "PENDING") ? "PENDING" : null;
    const cid = classOf.get(id) ?? "";
    // where the student is in the loop, and what moves them on
    let stage: StageKey, next: { label: string; href: string };
    if (!overall && !d) { stage = "MEASURE"; next = { label: "Enter MAP scores (or the Diagnostic)", href: `/teacher/map-entry?classId=${cid}` }; }
    else if (!weakest && !d) { stage = "ANALYZE"; next = { label: "Add the MAP instructional areas", href: `/teacher/map-entry?classId=${cid}` }; }
    else if (plan !== "SENT") { stage = "PLAN"; next = { label: plan === "DRAFT" ? "Check and send the MAP plan" : "Make the MAP plan", href: `/teacher/map-plans?classId=${cid}&tab=plans` }; }
    else if (myA.length < 10 || (weakest && inWeak < 3)) { stage = "PRACTICE"; next = { label: weakest ? `Practise ${areaByKey(weakest.key).short} (their weakest area)` : "Practise this week", href: `/teacher/map-plans?classId=${cid}&tab=plans` }; }
    else if (!thisWeek?.completedAt) { stage = "CHECK"; next = { label: "Weekly Check this week", href: `/teacher/students/${id}` }; }
    else if (report !== "APPROVED") { stage = "REPORT"; next = { label: report === "PENDING" ? "Family report waits for the admin" : "Send a family report", href: `/teacher/students/${id}` }; }
    else { stage = "MEASURE"; next = { label: "On track: next MAP or Weekly Check", href: `/map-report/profile/${id}` }; }
    return {
      id, name: names.get(id)?.name ?? "Student", className: className.get(cid) ?? "",
      rit: overall ? Number(overall.rit) : null, percentile: overall?.achievementPercentile !== null && overall?.achievementPercentile !== undefined ? Number(overall.achievementPercentile) : null,
      weakest, diagnostic: d ? s(d.level) : null, plan, practice7: myA.length, inWeakArea7: inWeak, accuracy7: myA.length ? pct(myA.filter((a) => a.isCorrect).length, myA.length) : null,
      check: { done: Boolean(thisWeek?.completedAt), change }, report, stage, next,
    };
  }).sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || a.name.localeCompare(b.name));

  const N = students.length || 1;
  const measured = students.filter((x) => x.rit !== null || x.diagnostic).length;
  const analyzed = students.filter((x) => x.weakest).length;
  const planned = students.filter((x) => x.plan === "SENT").length;
  const practising = students.filter((x) => x.practice7 >= 10).length;
  const withWeak = students.filter((x) => x.weakest);
  const aligned = withWeak.length ? pct(withWeak.reduce((a, x) => a + x.inWeakArea7, 0), withWeak.reduce((a, x) => a + x.practice7, 0)) : 0;
  const checked = students.filter((x) => x.check.done).length;
  const moved = students.filter((x) => x.check.change !== null);
  const up = moved.filter((x) => x.check.change! > 0).length;
  const reported = students.filter((x) => x.report === "APPROVED").length, pending = students.filter((x) => x.report === "PENDING").length;
  const first = scopeClasses[0] ? s(scopeClasses[0].id) : "";
  const cq = classId ? `?classId=${classId}` : first ? `?classId=${first}` : "";
  const health = (p: number): Health => (p >= 80 ? "GOOD" : p >= 40 ? "WARN" : "TODO");
  const answers7 = students.reduce((a, x) => a + x.practice7, 0);
  const stages: Stage[] = [
    { key: "MEASURE", n: 1, title: "Measure", icon: "📏", score: pct(measured, N), health: health(pct(measured, N)), headline: `${measured} of ${students.length} students measured (MAP or Diagnostic)`,
      metrics: [{ label: "MAP Reading score", value: `${students.filter((x) => x.rit !== null).length}` }, { label: "Diagnostic done", value: `${students.filter((x) => x.diagnostic).length}` }, { label: "Weekly Check this week", value: `${checked}` }],
      next: measured < students.length ? { label: "Enter the missing MAP scores", href: `/teacher/map-entry${cq}` } : null },
    { key: "ANALYZE", n: 2, title: "Analyze", icon: "🔍", score: pct(analyzed, N), health: health(pct(analyzed, N)), headline: `${analyzed} students with their weakest MAP area found`,
      metrics: AREA_ORDER.map((k) => ({ label: areaByKey(k).short, value: String(withWeak.filter((x) => x.weakest!.key === k).length) })),
      next: analyzed < measured ? { label: "Add the instructional areas (3 + 3)", href: `/teacher/map-entry${cq}` } : { label: "Class Profile", href: classId ? `/map-report/class/${classId}/profile` : "/teacher/map-overview" } },
    { key: "PLAN", n: 3, title: "Plan", icon: "🗺️", score: pct(planned, N), health: health(pct(planned, N)), headline: `${planned} MAP plans sent to students`,
      metrics: [{ label: "Sent", value: `${planned}` }, { label: "Drafts to check", value: `${students.filter((x) => x.plan === "DRAFT").length}` }, { label: "No plan", value: `${students.filter((x) => !x.plan).length}` }],
      next: planned < analyzed ? { label: "Check and send the plans", href: `/teacher/map-plans${cq}${cq ? "&" : "?"}tab=plans` } : null },
    { key: "PRACTICE", n: 4, title: "Practice", icon: "🎯", score: Math.round((pct(practising, N) + aligned) / 2), health: health(Math.round((pct(practising, N) + aligned) / 2)), headline: `${answers7} answers this week · ${aligned}% in each student's weakest area`,
      metrics: [{ label: "Practised 10+ this week", value: `${practising}` }, { label: "In the weakest area", value: `${aligned}%` }, { label: "Accuracy", value: answers7 ? `${pct(students.reduce((a, x) => a + Math.round(((x.accuracy7 ?? 0) * x.practice7) / 100), 0), answers7)}%` : "—" }],
      next: { label: "Practice Analytics", href: `/teacher/practice-analytics${cq}` } },
    { key: "CHECK", n: 5, title: "Check", icon: "✅", score: pct(checked, N), health: health(pct(checked, N)), headline: `${checked} Weekly Checks done this week · RIT up for ${up} of ${moved.length}`,
      metrics: [{ label: "Done this week", value: `${checked}` }, { label: "RIT estimate up (4 weeks)", value: `${up}` }, { label: "Average change", value: moved.length ? `${(moved.reduce((a, x) => a + x.check.change!, 0) / moved.length).toFixed(1)} RIT` : "—" }],
      next: { label: "MAP Growth", href: "/teacher/growth" } },
    { key: "REPORT", n: 6, title: "Report", icon: "👪", score: pct(reported, N), health: health(pct(reported, N)), headline: `${reported} families got a report this month${pending ? ` · ${pending} waiting for the admin` : ""}`,
      metrics: [{ label: "Approved (30 days)", value: `${reported}` }, { label: "Waiting for approval", value: `${pending}` }, { label: "No report yet", value: `${students.length - reported - pending}` }],
      next: { label: "Family Reports", href: `/teacher/family-reports${cq}` } },
  ];
  const areaNeeds = AREA_ORDER.map((k) => ({ key: k, name: areaByKey(k).name, students: withWeak.filter((x) => x.weakest!.key === k).length, practice: attempts.filter((a) => areaOfQ.get(s(a.questionId)) === k).length }));
  return {
    scope: classId ? className.get(classId) ?? "" : actor.role === "TEACHER" ? "My classes" : "Whole school", classId, students, stages,
    score: Math.round(stages.reduce((a, x) => a + x.score, 0) / stages.length), areaNeeds, generatedAt: now.toISOString(),
  };
}
const ORDER: StageKey[] = ["MEASURE", "ANALYZE", "PLAN", "PRACTICE", "CHECK", "REPORT"];
const AREA_ORDER: AreaKey[] = ["LIT", "INFO", "VOCAB", "GRAMMAR", "MECH"];
