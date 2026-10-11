/**
 * 🧭 Reading Strategy Survey: scoring, the student's once-per-term attempt, the teacher's "open for my class", and the
 * class strategy profile with suggested strategy groups (students per weak strategy). For grouping only — the
 * survey never changes a student's level or placement.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { periodOf, periodStart, schoolYear, PERIOD_LABEL } from "../diagnostic/test";
import { PHASES, STRATEGY_ITEMS, STRATEGY_LABEL, STRATEGY_TIP, type Phase, type ReadingStrategy } from "./strategy-items";

export { PHASES, PHASE_LABEL, STRATEGY_ITEMS, STRATEGY_LABEL, STRATEGY_TIP } from "./strategy-items";
export type { Phase, ReadingStrategy, SurveyItem } from "./strategy-items";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
/** a strategy is weak when the student chose the effective strategy in under 60% of its items (1 of 2, 0–1 of 3) */
export const WEAK_BELOW = 60;
export const OPEN_KEY = "strategySurvey.open";

export interface SurveyResult { BEFORE: number; DURING: number; AFTER: number; total: number; byStrategy: Partial<Record<ReadingStrategy, number>>; weakStrategies: ReadingStrategy[]; term?: string }

/** Pure: % effective choices per phase and per strategy, and the weak strategies (weakest first). */
export function scoreStrategySurvey(answers: Record<string, number>): SurveyResult {
  const phase = new Map<Phase, [number, number]>(), strat = new Map<ReadingStrategy, [number, number]>();
  let right = 0;
  for (const it of STRATEGY_ITEMS) {
    const ok = Number(answers[it.id]) === it.best ? 1 : 0; right += ok;
    const p = phase.get(it.phase) ?? [0, 0]; phase.set(it.phase, [p[0] + ok, p[1] + 1]);
    const q = strat.get(it.strategy) ?? [0, 0]; strat.set(it.strategy, [q[0] + ok, q[1] + 1]);
  }
  const byStrategy = Object.fromEntries([...strat].map(([k, [a, b]]) => [k, pct(a, b)])) as Partial<Record<ReadingStrategy, number>>;
  const weakStrategies = (Object.keys(byStrategy) as ReadingStrategy[]).filter((k) => byStrategy[k]! < WEAK_BELOW).sort((a, b) => byStrategy[a]! - byStrategy[b]! || a.localeCompare(b));
  const ph = (k: Phase) => { const [a, b] = phase.get(k) ?? [0, 0]; return pct(a, b); };
  return { BEFORE: ph("BEFORE"), DURING: ph("DURING"), AFTER: ph("AFTER"), total: pct(right, STRATEGY_ITEMS.length), byStrategy, weakStrategies };
}

/** "2026-2027 · BOY" — the term window a survey belongs to (students take it once per term). */
export const surveyTerm = (now = new Date()) => `${schoolYear(now)} · ${periodOf(now)}`;
export const surveyTermLabel = (now = new Date()) => `${PERIOD_LABEL[periodOf(now)]} ${schoolYear(now)}`;

async function latestInTerm(repo: Repo, studentId: string, now: Date): Promise<Row | null> {
  const from = periodStart(now).getTime();
  return (await repo.findMany("StrategySurvey", { studentId })).filter((r) => (d(r.createdAt)?.getTime() ?? 0) >= from && (d(r.createdAt)?.getTime() ?? 0) <= now.getTime() + 60_000)
    .sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0))[0] ?? null;
}

async function studentClass(repo: Repo, studentId: string): Promise<Row | null> {
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  return m ? repo.findUnique("Class", { id: m.classId }) : null;
}

async function openMap(repo: Repo, schoolId: string): Promise<Record<string, { at: string; term: string; by: string }>> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: OPEN_KEY }))[0];
  return json(row?.value, {} as Record<string, { at: string; term: string; by: string }>);
}

/** The student's survey page: the items, this term's result (if taken) and whether the teacher opened it for the class. */
export async function myStrategySurvey(repo: Repo, actor: Actor, now = new Date()): Promise<{ taken: (SurveyResult & { date: string }) | null; openedByTeacher: boolean; term: string }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take the Reading Strategy Survey.");
  const row = await latestInTerm(repo, actor.studentId, now);
  const klass = await studentClass(repo, actor.studentId);
  const open = klass ? (await openMap(repo, s(actor.schoolId)))[s(klass.id)] : undefined;
  return { taken: row ? { ...json<SurveyResult>(row.result, scoreStrategySurvey({})), date: (d(row.createdAt) ?? now).toISOString().slice(0, 10) } : null, openedByTeacher: !!open && open.term === surveyTerm(now), term: surveyTermLabel(now) };
}

/** Saves the student's answers (every item, choice 0–3), once per term. */
export async function submitStrategySurvey(repo: Repo, actor: Actor, answers: Record<string, unknown>, now = new Date()): Promise<SurveyResult> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take the Reading Strategy Survey.");
  assertCan(actor, "practice:take");
  const clean: Record<string, number> = {};
  for (const it of STRATEGY_ITEMS) {
    const v = Number(answers[it.id]);
    if (!Number.isInteger(v) || v < 0 || v > 3) throw new ValidationError("Please answer every question.");
    clean[it.id] = v;
  }
  if (await latestInTerm(repo, actor.studentId, now)) throw new ValidationError("You already took the survey this term. Thank you!");
  const result = { ...scoreStrategySurvey(clean), term: surveyTerm(now) };
  await repo.create("StrategySurvey", { studentId: actor.studentId, schoolId: actor.schoolId, answers: clean, result, createdAt: now });
  return result;
}

async function myClass(repo: Repo, actor: Actor, classId?: string | null): Promise<{ klass: Row; classes: Row[] }> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  const klass = classId ? classes.find((c) => s(c.id) === classId) : classes[0];
  if (!klass) throw new ForbiddenError(classId ? "This class is not yours." : "You have no class.");
  return { klass, classes };
}

/** The teacher opens the survey for their class: the students are notified (they can always take it once per term). */
export async function openStrategySurvey(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  const { klass } = await myClass(repo, actor, classId);
  const map = await openMap(repo, s(actor.schoolId));
  map[s(klass.id)] = { at: now.toISOString(), term: surveyTerm(now), by: actor.userId };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: OPEN_KEY }, { value: map, updatedBy: actor.userId, updatedAt: now }, { value: map, updatedBy: actor.userId, updatedAt: now });
  const ids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const taken = new Set<string>(); for (const id of ids) if (await latestInTerm(repo, id, now)) taken.add(id);
  const users = await repo.findMany("Student", { id: { in: ids.filter((id) => !taken.has(id)) } }, { select: ["userId"] });
  if (users.length) await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "ASSESSMENT_AVAILABLE", title: "🧭 Reading Strategy Survey", body: "Tell us how you read! 18 short questions — there are no marks. Choose what a good reader would do.", link: "/student/strategy-survey", readAt: null, createdAt: now })));
  return users.length;
}

export interface StrategyProfile {
  classId: string; className: string; classes: { id: string; name: string }[]; term: string; opened: string | null;
  taken: number; roster: number;
  phases: { phase: Phase; pct: number | null }[];
  strategies: { strategy: ReadingStrategy; label: string; pct: number | null; weakCount: number }[];
  groups: { strategy: ReadingStrategy; label: string; tip: string; students: { id: string; name: string; pct: number }[] }[];
  students: { id: string; name: string; date: string; BEFORE: number; DURING: number; AFTER: number; weak: ReadingStrategy[] }[];
  notTaken: { id: string; name: string }[];
}

/** The class strategy profile (latest survey of each student this school year) and the suggested strategy groups. */
export async function classStrategyProfile(repo: Repo, actor: Actor, classId?: string | null, now = new Date()): Promise<StrategyProfile> {
  const { klass, classes } = await myClass(repo, actor, classId);
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  const names = await studentNames(repo, ids);
  const yearStart = new Date(Date.UTC(Number(schoolYear(now).slice(0, 4)), 7, 1)).getTime();
  const rows = ids.length ? await repo.findMany("StrategySurvey", { studentId: { in: ids } }) : [];
  const latest = new Map<string, Row>();
  for (const r of rows.filter((x) => (d(x.createdAt)?.getTime() ?? 0) >= yearStart).sort((a, b) => (d(a.createdAt)?.getTime() ?? 0) - (d(b.createdAt)?.getTime() ?? 0))) latest.set(s(r.studentId), r);
  const students = [...latest].map(([id, r]) => { const x = json<SurveyResult>(r.result, scoreStrategySurvey({})); return { id, name: names.get(id)?.name ?? "Student", date: (d(r.createdAt) ?? now).toISOString().slice(0, 10), BEFORE: x.BEFORE, DURING: x.DURING, AFTER: x.AFTER, weak: x.weakStrategies ?? [], by: x.byStrategy ?? {} }; }).sort((a, b) => a.name.localeCompare(b.name));
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const all = Object.keys(STRATEGY_LABEL) as ReadingStrategy[];
  const strategies = all.map((k) => ({ strategy: k, label: STRATEGY_LABEL[k], pct: mean(students.map((x) => x.by[k]).filter((v): v is number => typeof v === "number")), weakCount: students.filter((x) => x.weak.includes(k)).length }));
  const groups = all.map((k) => ({ strategy: k, label: STRATEGY_LABEL[k], tip: STRATEGY_TIP[k], students: students.filter((x) => x.weak.includes(k)).map((x) => ({ id: x.id, name: x.name, pct: x.by[k] ?? 0 })).sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name)) }))
    .filter((g) => g.students.length).sort((a, b) => b.students.length - a.students.length || a.label.localeCompare(b.label));
  const open = (await openMap(repo, s(actor.schoolId)))[s(klass.id)];
  return {
    classId: s(klass.id), className: s(klass.name), classes: classes.map((c) => ({ id: s(c.id), name: s(c.name) })), term: surveyTermLabel(now), opened: open && open.term === surveyTerm(now) ? open.at.slice(0, 10) : null,
    taken: students.length, roster: ids.length,
    phases: PHASES.map((p) => ({ phase: p, pct: mean(students.map((x) => x[p])) })),
    strategies, groups,
    students: students.map(({ by: _b, ...x }) => x),
    notTaken: ids.filter((id) => !latest.has(id)).map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
