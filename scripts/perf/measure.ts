/**
 * Performance measurement (offline, no Render needed):
 *   npx tsx scripts/perf/measure.ts
 *
 * Builds a realistic demo school in SQLite (full question bank, 225 students, months of practice),
 * then runs the data loading of each page exactly as the page does, through a measuring Repo that
 * counts every database call, the rows and bytes it returns, and adds a simulated network delay per
 * call (LATENCY_MS, default 30 ms: a database in another region). Parallel calls overlap, as on the
 * real server, so "time" reflects the critical path of round trips.
 */
import { performance } from "node:perf_hooks";
import { demoDatabase } from "../../tests/helpers/db";
import { simulatePractice } from "../../tests/helpers/practice";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";
import { seedQuestions } from "../../src/server/seeding/questions";
import { loadBank } from "../../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { ROOT } from "../../tests/helpers/db";
import { validateSession, createSession } from "../../src/server/auth/sessions";
import { listQuestions, getQuestion } from "../../src/server/admin/questions";
import { skillCoverage } from "../../src/server/admin/ai-bank";
import { listUsers } from "../../src/server/admin/users";
import { listImportJobs } from "../../src/server/admin/question-import";
import { classOverview, masteryGrid, teacherClasses, studentDetail } from "../../src/server/teacher/queries";
import { scanInterventions } from "../../src/server/teacher/interventions";
import { classAssignments } from "../../src/server/teacher/assignments";
import { standardsReport, studentAnalytics, classComparison } from "../../src/server/analytics/reports";
import { loadCalendar } from "../../src/server/analytics/calendar";
import { resolvePeriod } from "../../src/analytics/periods";
import { getStudentCurriculum } from "../../src/server/queries/student-curriculum";
import { latestDiagnostic } from "../../src/server/assessment/diagnostic";
import { parentChildren } from "../../src/server/queries/parent";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { loadSkillItems } from "../../src/server/practice/items";
import { editorOptions } from "../../src/app/admin/questions/editor-data";

const AUTH = { sessionTtlMinutes: 720, idleMinutes: 30, touchEveryMinutes: 5, maxFailedLogins: 5 } as never;
const LATENCY = Number(process.env.LATENCY_MS ?? 30);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Stats { calls: number; rows: number; bytes: number; byModel: Map<string, { calls: number; rows: number }> }
const fresh = (): Stats => ({ calls: 0, rows: 0, bytes: 0, byModel: new Map() });

/** Counts calls/rows/bytes and adds LATENCY ms to each call (parallel calls overlap). */
class MeasuringRepo implements Repo {
  stats = fresh();
  latency = 0;
  constructor(private readonly inner: Repo, private readonly root?: MeasuringRepo) {}
  private get s() { return (this.root ?? this).stats; }
  private get l() { return (this.root ?? this).latency; }
  private async run<T>(model: string, p: Promise<T>): Promise<T> {
    if (this.l) await sleep(this.l);
    const r = await p;
    const rows = Array.isArray(r) ? r.length : r && typeof r === "object" ? 1 : 0;
    const s = this.s;
    s.calls++; s.rows += rows;
    if (Array.isArray(r) || (r && typeof r === "object")) s.bytes += JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v)).length;
    const m = s.byModel.get(model) ?? { calls: 0, rows: 0 };
    m.calls++; m.rows += rows; s.byModel.set(model, m);
    return r;
  }
  upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { return this.run(m, this.inner.upsert(m, w, c, u)); }
  create(m: string, d: Row) { return this.run(m, this.inner.create(m, d)); }
  createMany(m: string, rows: Row[]) { return this.run(m, this.inner.createMany(m, rows)); }
  findUnique(m: string, w: Record<string, unknown>) { return this.run(m, this.inner.findUnique(m, w)); }
  findMany(m: string, w?: Where, o?: FindOptions) { return this.run(m, this.inner.findMany(m, w, o)); }
  count(m: string, w?: Where) { return this.run(m, this.inner.count(m, w)); }
  updateMany(m: string, w: Where, d: Row) { return this.run(m, this.inner.updateMany(m, w, d)); }
  deleteMany(m: string, w: Where) { return this.run(m, this.inner.deleteMany(m, w)); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> { return this.inner.transaction((tx) => fn(new MeasuringRepo(tx, this.root ?? this))); }
}

interface Result { page: string; calls: number; rows: number; kb: number; ms0: number; msLat: number; top: string }
const results: Result[] = [];

async function measure(page: string, m: MeasuringRepo, fn: () => Promise<unknown>) {
  // run once at 0 latency (CPU only), once with simulated latency (critical path of round trips)
  m.stats = fresh(); m.latency = 0;
  let t = performance.now(); await fn(); const ms0 = performance.now() - t;
  const s = m.stats;
  m.stats = fresh(); m.latency = LATENCY;
  t = performance.now(); await fn(); const msLat = performance.now() - t;
  m.latency = 0;
  const top = [...s.byModel.entries()].sort((a, b) => b[1].rows - a[1].rows).slice(0, 3).map(([k, v]) => `${k} ${v.rows}`).join(", ");
  results.push({ page, calls: s.calls, rows: s.rows, kb: Math.round(s.bytes / 1024), ms0: Math.round(ms0), msLat: Math.round(msLat), top });
}

async function main() {
  const t0 = performance.now();
  const { repo } = await demoDatabase({ classesPerGrade: 3, studentsPerClass: 25 });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const pending = await repo.findMany("Question", { status: "UNDER_REVIEW" });
  await repo.updateMany("Question", { id: { in: pending.map((q) => q.id) } }, { status: "PUBLISHED" });
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  // practice history: grade-4 students, 4 months, 8 answers per session
  const g4Students = (await repo.findMany("User", { role: "STUDENT" })).map((u) => String(u.username)).filter((u) => u.startsWith("demo.s1"));
  const cur4 = (await repo.findMany("Curriculum", {})).find((c) => String(c.name).startsWith("Grade 4"))!;
  const skills4 = await repo.findMany("Skill", { curriculumId: cur4.id });
  const withItems: string[] = [];
  for (const s of skills4) if ((await loadSkillItems(repo, String(s.id))).length >= 10) withItems.push(String(s.code));
  // SESSIONS practice sessions per student (default 4), spread over Sep–Dec
  const sessions = Number(process.env.SESSIONS ?? 4);
  const months = Array.from({ length: sessions }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 3 + Math.floor((i * 110) / sessions))).toISOString().slice(0, 10), skill: withItems[i % withItems.length] }));
  await simulatePractice(repo, g4Students.slice(0, Number(process.env.STUDENTS ?? 60)), months, 8);
  const counts = { students: await repo.count("Student", {}), questions: await repo.count("Question", {}), attempts: await repo.count("QuestionAttempt", {}) };
  console.log(`setup ${Math.round((performance.now() - t0) / 1000)} s:`, counts, `latency per DB call: ${LATENCY} ms\n`);

  const m = new MeasuringRepo(repo);
  const admin = await actorFor("demo.admin");
  const teacher = await actorFor("demo.teacher.4a");
  const student = await actorFor(g4Students[0]);
  const parent = await actorFor("demo.p1001");
  const adminUser = (await repo.findUnique("User", { username: "demo.admin" }))!;
  const token = (await createSession(repo, adminUser, AUTH)).token;
  const classId = String((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: teacher.userId }))!.id }))[0].classId);
  const cal = await loadCalendar(repo, admin.schoolId!);
  const period = resolvePeriod("SCHOOL_YEAR", cal, new Date("2026-12-20T12:00:00Z"));
  const range = { from: new Date("2026-09-01"), to: new Date("2026-12-31") };
  const unitId = String((await repo.findMany("Unit", { curriculumId: cur4.id }))[0]?.id ?? "");
  const someQ = String((await repo.findMany("Question", { skillId: skills4[0].id }))[0].id);
  const studentId = student.studentId!;
  const skillForPractice = String(skills4.find((s) => s.code === withItems[0])!.id);

  const auth = async (u: Row) => { const v = await validateSession(m, token, AUTH); if (v.ok) await resolveActor(m, u); };
  await measure("every page: session + user check (admin)", m, () => auth(adminUser));
  await measure("every page: session + user check (teacher)", m, async () => { await validateSession(m, token, AUTH); await resolveActor(m, (await repo.findUnique("User", { id: teacher.userId }))!); });
  await measure("Admin › Questions (list, Waiting for review)", m, () => listQuestions(m, admin, { status: "UNDER_REVIEW" }));
  await measure("Admin › Questions (search 'main idea')", m, () => listQuestions(m, admin, { status: "PUBLISHED", q: "main idea" }));
  await measure("Admin › Question detail", m, async () => { await getQuestion(m, admin, someQ); await editorOptions(m, admin.schoolId!); });
  await measure("Admin › Question bank coverage (G4)", m, async () => { await skillCoverage(m, admin, 4); await listQuestions(m, admin, { aiOnly: true }); });
  await measure("Admin › Users", m, () => listUsers(m, admin, {}));
  await measure("Admin › Analytics (school standards)", m, async () => { const c = await loadCalendar(m, admin.schoolId!); await standardsReport(m, admin, { school: true }, period); await teacherClasses(m, admin); void c; });
  await measure("Admin › Import questions (history)", m, () => listImportJobs(m, admin));
  await measure("Teacher › Home (my classes)", m, () => teacherClasses(m, teacher));
  await measure("Teacher › Class page", m, async () => {
    const o = await classOverview(m, teacher, classId, range);
    await scanInterventions(m, o.students.map((s) => s.studentId));
    await classOverview(m, teacher, classId, range);
    if (unitId) await masteryGrid(m, teacher, classId, unitId);
    await classAssignments(m, teacher, classId);
  });
  await measure("Teacher › Class analytics", m, async () => { await loadCalendar(m, admin.schoolId!); await classComparison(m, teacher, classId, period); await standardsReport(m, teacher, { classId }, period); });
  await measure("Teacher › Student detail", m, async () => { await studentDetail(m, teacher, studentId); await studentAnalytics(m, teacher, studentId, period); });
  await measure("Student › Home", m, async () => { await getStudentCurriculum(m, studentId); await latestDiagnostic(m, studentId); });
  await measure("Parent › Home", m, () => parentChildren(m, parent));
  let view = await startPractice(repo, student, skillForPractice, new Date("2027-01-10T08:00:00Z"));
  await measure("Student › Start practice", m, async () => { view = await startPractice(m, student, skillForPractice, new Date("2027-01-10T08:00:00Z")); });
  const items = await loadSkillItems(repo, skillForPractice);
  let clock = Date.parse("2027-01-10T08:01:00Z");
  await measure("Student › Answer one question", m, async () => {
    if (!view.question) view = await startPractice(repo, student, skillForPractice, new Date(clock));
    const it = items.find((i) => i.questionId === view.question!.questionId)!;
    const resp = it.options ? (it.type === "MULTI_SELECT" ? [it.options[0].label] : it.options[0].label) : it.type === "TRUE_FALSE" ? true : it.answers?.[0] ?? it.sequence ?? 0;
    ({ view } = await submitAnswer(m, student, { sessionId: view.sessionId, questionId: it.questionId, response: resp }, new Date((clock += 40_000))));
  });

  const w = Math.max(...results.map((r) => r.page.length));
  console.log(`${"page".padEnd(w)}  DB calls   rows      KB   CPU ms  @${LATENCY}ms/call  largest reads`);
  for (const r of results) console.log(`${r.page.padEnd(w)}  ${String(r.calls).padStart(8)} ${String(r.rows).padStart(6)} ${String(r.kb).padStart(7)} ${String(r.ms0).padStart(8)} ${String(r.msLat).padStart(12)}  ${r.top}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
