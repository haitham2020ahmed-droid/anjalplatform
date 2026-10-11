/**
 * 🧭 "Where are we in the cycle": for the teacher's classes — the windows open now, what is due this week and what
 * is overdue (progress checks for finished text sets, fluency checks by tier cadence, diagnostic not done, the
 * Weekly Check) — and the same things as calendar events. Bounded queries: one pass per kind over all classes.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { accessibleClasses } from "../teacher/assign";
import { textSetsOfClasses } from "../progress-checks/progress-checks";
import { studentNames } from "../insights/student-data";
import { fluencyDue, isoDay, loadCycle, openPeriod, PERIODS, plusDays, textSetDueDate, instructionalWeekOf, type AssessmentCycle, type Period } from "./cycle";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const DAY = 86_400_000;
/** an unchecked text set counts as overdue for this long after its due date (older ones are history) */
export const PROGRESS_LOOKBACK_DAYS = 42;
/** a closed diagnostic window with students not done stays "overdue" this long */
export const DIAGNOSTIC_LOOKBACK_DAYS = 30;

export type ItemKind = "PROGRESS" | "FLUENCY" | "DIAGNOSTIC" | "WEEKLY";
export interface CycleItem { kind: ItemKind; title: string; detail: string; href: string; dueOn: string | null; students?: number }
export interface ClassCycle { classId: string; className: string; grade: number; due: CycleItem[]; overdue: CycleItem[] }
export interface CycleWindow { kind: "DIAGNOSTIC" | "MAP" | "BREAK"; title: string; opens: string; closes: string; state: "OPEN" | "UPCOMING" }
export interface CycleStatus { cycle: AssessmentCycle; saved: boolean; today: string; week: number; windows: CycleWindow[]; classes: ClassCycle[] }

/** Sunday of the school week containing the date (Sun–Thu week). */
const sunday = (now: Date) => isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - now.getUTCDay() * DAY));

interface ClassFacts {
  klass: Row; grade: number; students: string[];
  textSets: { lessonId: string; code: string; title: string; dueOn: string | null; checks: number }[];
  fluency: { studentId: string; tier: number; state: "OK" | "DUE" | "OVERDUE"; dueOn: string | null }[];
  diagnostic: { period: Period; open: boolean; closes: string; testExists: boolean; notDone: number } | null;
  weeklyDone: number;
}

/** Everything the strip and the calendar need, for some classes. */
async function classFacts(repo: Repo, schoolId: string, classes: Row[], cycle: AssessmentCycle, now: Date): Promise<ClassFacts[]> {
  if (!classes.length) return [];
  const today = isoDay(now);
  const [grades, members, textSets] = await Promise.all([
    repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }),
    repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] }),
    textSetsOfClasses(repo, classes),
  ]);
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const [tiers, flu, weekly] = await Promise.all([
    ids.length ? repo.findMany("StudentTier", { studentId: { in: ids } }, { select: ["studentId", "tier", "monitorEveryDays", "since"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("FluencyCheck", { studentId: { in: ids }, checkedAt: { gte: new Date(now.getTime() - 365 * DAY) } }, { select: ["studentId", "checkedAt"] }) : Promise.resolve([] as Row[]),
    ids.length && cycle.weeklyCheck ? repo.findMany("WeeklyCheck", { studentId: { in: ids }, week: sunday(now) }, { select: ["studentId", "completedAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const tierOf = new Map(tiers.map((t) => [s(t.studentId), t]));
  const lastFlu = new Map<string, Date>();
  for (const f of flu) { const at = d(f.checkedAt); if (at && at <= now && (!lastFlu.has(s(f.studentId)) || lastFlu.get(s(f.studentId))! < at)) lastFlu.set(s(f.studentId), at); }
  const weeklyDone = new Set(weekly.filter((w) => w.completedAt).map((w) => s(w.studentId)));

  // diagnostic: the window open now, or the latest one closed in the last 30 days
  let period: Period | null = openPeriod(cycle, now);
  let open = Boolean(period);
  if (!period) {
    const closed = [...PERIODS].reverse().find((p) => cycle.diagnostic[p].closes < today && now.getTime() - new Date(`${cycle.diagnostic[p].closes}T00:00:00Z`).getTime() <= DIAGNOSTIC_LOOKBACK_DAYS * DAY);
    period = closed ?? null; open = false;
  }
  let tests: Row[] = [], scores: Row[] = [];
  if (period) {
    const levels = [...new Set(classes.map((c) => levelOf.get(s(c.gradeId)) ?? 0))];
    tests = (await repo.findMany("DiagnosticTest", { schoolId, period, grade: { in: levels } }, { select: ["id", "grade", "status", "createdAt", "opensAt"] }))
      .filter((t) => s(t.status) !== "DRAFT" && (d(t.createdAt)?.getTime() ?? 0) >= new Date(`${cycle.yearStart}T00:00:00Z`).getTime() - 60 * DAY);
    scores = tests.length && ids.length ? await repo.findMany("DiagnosticScore", { diagnosticId: { in: tests.map((t) => s(t.id)) }, studentId: { in: ids } }, { select: ["studentId", "diagnosticId"] }) : [];
  }
  const doneDiag = new Set(scores.map((x) => s(x.studentId)));

  return classes.map((k) => {
    const grade = levelOf.get(s(k.gradeId)) ?? 0;
    const students = members.filter((m) => s(m.classId) === s(k.id)).map((m) => s(m.studentId));
    const ts = (textSets.get(s(k.id)) ?? []).map((t) => ({ lessonId: t.lessonId, code: t.code, title: t.title, checks: t.checks, dueOn: cycle.progressChecks.enabled ? textSetDueDate(cycle, t.unit, t.weeks, t.number) : null }));
    const fl = students.map((id) => {
      const t = tierOf.get(id);
      const tier = Number(t?.tier ?? 1);
      const r = fluencyDue(cycle, { tier, everyDays: Number(t?.monitorEveryDays ?? 0), lastCheck: lastFlu.get(id) ?? null, tierSince: d(t?.since) }, now);
      return { studentId: id, tier, state: r.state, dueOn: r.dueOn };
    });
    const gradeTests = tests.filter((t) => Number(t.grade) === grade);
    const diagnostic = period ? { period, open, closes: cycle.diagnostic[period].closes, testExists: gradeTests.length > 0, notDone: gradeTests.length ? students.filter((id) => !doneDiag.has(id)).length : 0 } : null;
    return { klass: k, grade, students, textSets: ts, fluency: fl, diagnostic, weeklyDone: students.filter((id) => weeklyDone.has(id)).length };
  });
}

/** The strip for the teacher (their classes) or an admin (every class). */
export async function cycleStatus(repo: Repo, actor: Actor, now = new Date(), opts: { classId?: string } = {}): Promise<CycleStatus> {
  assertCan(actor, "reports:read");
  let classes = await accessibleClasses(repo, actor);
  if (opts.classId) classes = classes.filter((c) => s(c.id) === opts.classId);
  const schoolId = s(actor.schoolId ?? classes[0]?.schoolId);
  const { cycle, saved } = await loadCycle(repo, schoolId, now);
  const today = isoDay(now), weekStart = sunday(now), weekEnd = plusDays(weekStart, 6);
  const windows: CycleWindow[] = [];
  const addWin = (kind: CycleWindow["kind"], title: string, opens: string, closes: string) => {
    if (opens <= today && today <= closes) windows.push({ kind, title, opens, closes, state: "OPEN" });
    else if (opens > today && opens <= plusDays(today, 14)) windows.push({ kind, title, opens, closes, state: "UPCOMING" });
  };
  for (const p of PERIODS) addWin("DIAGNOSTIC", `Diagnostic ${p} + fluency benchmark`, cycle.diagnostic[p].opens, cycle.diagnostic[p].closes);
  for (const m of cycle.map) addWin("MAP", `MAP ${m.name}`, m.opens, m.closes);
  for (const b of cycle.breaks) addWin("BREAK", b.name, b.opens, b.closes);

  const facts = await classFacts(repo, schoolId, classes, cycle, now);
  const allIds = [...new Set(facts.flatMap((f) => f.fluency.filter((x) => x.state !== "OK").map((x) => x.studentId)))];
  const names = await studentNames(repo, allIds);
  const out: ClassCycle[] = facts.map((f) => {
    const cid = s(f.klass.id), due: CycleItem[] = [], overdue: CycleItem[] = [];
    for (const t of f.textSets) {
      if (!t.dueOn || t.checks > 0) continue;
      const late = plusDays(t.dueOn, cycle.progressChecks.graceDays);
      const item = { kind: "PROGRESS" as const, title: `Progress check: ${t.code}`, detail: `${t.title} — text set ends ${t.dueOn}.`, href: `/teacher/progress-checks?class=${cid}&lesson=${t.lessonId}`, dueOn: t.dueOn };
      if (late < today && t.dueOn >= plusDays(today, -PROGRESS_LOOKBACK_DAYS)) overdue.push({ ...item, detail: `${t.title} — ended ${t.dueOn}, no check given yet.` });
      else if ((t.dueOn >= weekStart && t.dueOn <= weekEnd) || (t.dueOn <= today && today <= late)) due.push(item);
    }
    const tierLabel = (l: typeof f.fluency) => [...new Set(l.map((x) => x.tier))].sort().map((t) => `Tier ${t}`).join(", ");
    const list = (l: typeof f.fluency) => l.slice(0, 5).map((x) => `\u2068${names.get(x.studentId)?.name ?? "Student"}\u2069`).join(", ") + (l.length > 5 ? ` +${l.length - 5}` : "");
    const fDue = f.fluency.filter((x) => x.state === "DUE"), fLate = f.fluency.filter((x) => x.state === "OVERDUE");
    if (fDue.length) due.push({ kind: "FLUENCY", title: `Fluency checks: ${fDue.length}`, detail: `${tierLabel(fDue)}: ${list(fDue)}.`, href: "/teacher/fluency", dueOn: fDue.map((x) => x.dueOn ?? today).sort()[0], students: fDue.length });
    if (fLate.length) overdue.push({ kind: "FLUENCY", title: `Fluency checks overdue: ${fLate.length}`, detail: `${tierLabel(fLate)} (by tier cadence): ${list(fLate)}.`, href: "/teacher/fluency", dueOn: fLate.map((x) => x.dueOn ?? today).sort()[0], students: fLate.length });
    if (f.diagnostic) {
      const g = f.diagnostic;
      if (g.open && !g.testExists) due.push({ kind: "DIAGNOSTIC", title: `Diagnostic ${g.period} window open`, detail: `No ${g.period} test is open for Grade ${f.grade} yet — ask the school admin.`, href: "/teacher/diagnostic", dueOn: g.closes });
      else if (g.notDone && g.open) due.push({ kind: "DIAGNOSTIC", title: `Diagnostic ${g.period}: ${g.notDone} not done`, detail: `The window closes ${g.closes}.`, href: "/teacher/diagnostic", dueOn: g.closes, students: g.notDone });
      else if (g.notDone && !g.open) overdue.push({ kind: "DIAGNOSTIC", title: `Diagnostic ${g.period}: ${g.notDone} not done`, detail: `The window closed ${g.closes}.`, href: "/teacher/diagnostic", dueOn: g.closes, students: g.notDone });
    }
    if (cycle.weeklyCheck && f.students.length && today >= cycle.yearStart && today <= cycle.yearEnd) {
      const left = f.students.length - f.weeklyDone;
      if (left > 0) due.push({ kind: "WEEKLY", title: `Weekly Check: ${f.weeklyDone} of ${f.students.length} done`, detail: "This week's Weekly Check.", href: "/teacher/week", dueOn: plusDays(weekStart, 4), students: left });
    }
    return { classId: cid, className: s(f.klass.name), grade: f.grade, due, overdue };
  }).sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className));
  return { cycle, saved, today, week: instructionalWeekOf(cycle, now), windows, classes: out };
}

// ------------------------------------------------------------------ calendar events

export interface CycleEvent { date: string; kind: "CYCLE" | "PROGRESS" | "FLUENCY"; title: string; classId: string | null; href: string }

/** Cycle dates, progress checks due per text set and fluency checks due per class, between two dates. */
export async function cycleCalendarEvents(repo: Repo, schoolId: string, classes: Row[], from: Date, to: Date, now = new Date()): Promise<CycleEvent[]> {
  if (!schoolId) return [];
  const { cycle } = await loadCycle(repo, schoolId, now);
  const a = isoDay(from), b = isoDay(new Date(to.getTime() - 1)), today = isoDay(now);
  const inR = (x: string | null) => Boolean(x && x >= a && x <= b);
  const out: CycleEvent[] = [];
  const win = (title: string, w: { opens: string; closes: string }) => {
    if (inR(w.opens)) out.push({ date: w.opens, kind: "CYCLE", title: `Opens: ${title}`, classId: null, href: "/teacher/progress-checks" });
    if (inR(w.closes)) out.push({ date: w.closes, kind: "CYCLE", title: `Closes: ${title}`, classId: null, href: "/teacher/progress-checks" });
  };
  for (const p of PERIODS) win(`Diagnostic ${p} + fluency benchmark`, cycle.diagnostic[p]);
  for (const m of cycle.map) win(`MAP ${m.name} window`, m);
  for (const br of cycle.breaks) if (inR(br.opens)) out.push({ date: br.opens, kind: "CYCLE", title: `Break: ${br.name}`, classId: null, href: "/teacher/progress-checks" });
  if (!classes.length) return out;
  const facts = await classFacts(repo, schoolId, classes, cycle, now);
  for (const f of facts) {
    const cid = s(f.klass.id);
    for (const t of f.textSets) if (inR(t.dueOn) && !t.checks) out.push({ date: t.dueOn!, kind: "PROGRESS", title: `Progress check: ${t.code}`, classId: cid, href: `/teacher/progress-checks?class=${cid}&lesson=${t.lessonId}` });
    // Tier 2/3 fluency checks on their due day; overdue ones on today
    const byDay = new Map<string, number>();
    for (const x of f.fluency) {
      if (x.tier < 2 || !x.dueOn) continue;
      const day = x.state === "OVERDUE" ? today : x.dueOn;
      if (inR(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    for (const [day, n] of byDay) out.push({ date: day, kind: "FLUENCY", title: `Fluency checks (Tier 2/3): ${n}`, classId: cid, href: "/teacher/fluency" });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
