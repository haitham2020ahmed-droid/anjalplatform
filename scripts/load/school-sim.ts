/**
 * 🏫 School simulation (Update 20): 100 students using the platform at the same time, through the REAL services.
 *
 *   tsx scripts/load/school-sim.ts [students=100] [answersEach=20]
 *
 * 1. The Test School (fake data) gets MAP Fall scores (Reading + Language, goal areas) for every student.
 * 2. 100 students practise at the same time (real adaptive engine), then open their pages (My work, My MAP,
 *    the numbers on the icons, their week, review).
 * 3. Teachers and the admin open the heavy pages (MAP matrix, plans, groups, alerts, Students, department week).
 * For every call: time (ms) AND the number of database queries — on the real MySQL each query also costs the
 * network round trip (~2–10 ms on Aiven), so the query count is what matters most for speed.
 * Runs on in-memory SQLite: CPU + query count, not network latency.
 */
import { performance } from "node:perf_hooks";
import { demoDatabase, seededRandom } from "../../tests/helpers/db";
import type { SqliteRepo } from "../db/sqlite-repo";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { seedTestEnvironment } from "../../src/server/seeding/test-env";
import { loadSkillItems } from "../../src/server/practice/items";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { assignedSkills } from "../../src/server/student/assigned";
import { navCounts, weekSuggestions } from "../../src/server/teacher/week-plan";
import { myMap, classMatrix } from "../../src/server/map/map-more";
import { classPlans, smallGroups } from "../../src/server/map/map-plan";
import { dueMistakes, studentWeek } from "../../src/server/teacher/classroom";
import { alertList } from "../../src/server/insights/alerts";
import { classProgress, gradeSummary } from "../../src/server/insights/progress";
import { departmentSummary } from "../../src/server/insights/department";
import { readableClasses } from "../../src/server/teacher/coordinators";
import { answerTest, createWindow, myTests, startTest } from "../../src/server/map/sim";
import { classChallenge, questionOfTheDay } from "../../src/server/teacher/extras";
import { myExitTicket } from "../../src/server/teacher/classroom";
import { studentBadges } from "../../src/server/student/badges";
import { loadQuestionItems } from "../../src/server/practice/items";

const N = Number(process.argv[2] ?? 100);
const ANSWERS = Number(process.argv[3] ?? 20);
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;

/** Counts the queries a call makes (every repo method = one query). */
function counted(repo: SqliteRepo): { repo: SqliteRepo; n: () => number; reset: () => void } {
  let n = 0;
  const methods = ["findMany", "findUnique", "create", "createMany", "updateMany", "deleteMany", "upsert", "count"];
  const proxy = new Proxy(repo, { get(t, k, r) { const v = Reflect.get(t, k, r); if (typeof v === "function" && methods.includes(String(k))) return (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(t, a); }; return typeof v === "function" ? v.bind(t) : v; } });
  return { repo: proxy as SqliteRepo, n: () => n, reset: () => { n = 0; } };
}

const results: { name: string; ms: number[]; q: number[] }[] = [];
async function measure<T>(name: string, c: ReturnType<typeof counted>, fn: (repo: SqliteRepo) => Promise<T>): Promise<T> {
  const before = c.n();
  const t = performance.now();
  const out = await fn(c.repo);
  let r = results.find((x) => x.name === name);
  if (!r) results.push((r = { name, ms: [], q: [] }));
  r.ms.push(performance.now() - t); r.q.push(c.n() - before);
  return out;
}

async function main() {
  const t0 = performance.now();
  const { repo: raw } = await demoDatabase();
  const now = new Date();
  await seedTestEnvironment(raw, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none", now });
  const c = counted(raw);
  const repo = c.repo;
  const students = (await raw.findMany("Student", {})).filter((s) => String(s.studentNumber).startsWith("TEST-")).slice(0, N);
  console.log(`setup: Test School, ${students.length} students in the simulation (${Math.round(performance.now() - t0)} ms)`);

  // MAP Fall scores for everyone (fake, varied)
  const areas = await raw.findMany("MapGoalArea", {});
  const rng = seededRandom(11);
  const rows: Record<string, unknown>[] = [];
  const fall = new Date(Date.UTC(now.getUTCFullYear(), 8, 15));
  for (const s of students) {
    for (const [subj, list] of [["Reading", ["LIT_STRUCTURE", "LIT_THEME", "INFO_STRUCTURE", "INFO_CENTRAL_IDEA", "VOCAB"]], ["Language Usage", ["WRITING_STYLE", "WRITING_ORG", "WRITING_SUPPORT", "LANG_GRAMMAR", "LANG_MECHANICS"]]] as const) {
      const rit = 175 + Math.round(rng() * 40);
      rows.push({ studentId: s.id, testDate: fall, subject: subj, goalName: null, rit, projectedGrowth: 6 + Math.round(rng() * 6), termName: `Fall ${fall.getUTCFullYear()}`, rapidGuessPct: rng() < 0.05 ? 35 : 5, importedAt: now });
      for (const code of list) rows.push({ studentId: s.id, testDate: fall, subject: subj, goalName: code, goalAreaId: areas.find((a) => a.code === code)!.id, rit: rit - 8 + Math.round(rng() * 16), termName: `Fall ${fall.getUTCFullYear()}`, importedAt: now });
    }
  }
  for (let i = 0; i < rows.length; i += 200) await raw.createMany("MapResult", rows.slice(i, i + 200));

  // 1) 100 students practise at the same time
  const actors = new Map<string, Actor>();
  for (const s of students) actors.set(String(s.id), await resolveActor(raw, (await raw.findUnique("User", { id: s.userId }))!));
  const answerTimes: number[] = [];
  const answerQueries: number[] = [];
  const started = performance.now();
  await Promise.all(students.map(async (s, k) => {
    const actor = actors.get(String(s.id))!;
    const work = await assignedSkills(raw, actor, now);
    const skill = work.items.find((i) => i.kind === "skill")?.skillId;
    if (!skill) return;
    const items = await loadSkillItems(raw, skill);
    let clock = now.getTime() - 3600_000 + k * 1000;
    let view = await startPractice(raw, actor, skill, new Date(clock), rng);
    for (let n = 0; n < ANSWERS && view.question; n++) {
      const it = items.find((i) => i.questionId === view.question!.questionId)!;
      const right = rng() < 0.65;
      const resp = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : (it.options.find((o) => o.correct === right) ?? it.options[0]).label)
        : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer) : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
        : it.type === "ERROR_CORRECTION" ? it.errorIndex : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p) => [p.left, p.right])) : it.sequence;
      const before = c.n(), a = performance.now();
      ({ view } = await submitAnswer(repo, actor, { sessionId: view.sessionId, questionId: it.questionId, response: resp }, new Date((clock += 30_000)), rng));
      answerTimes.push(performance.now() - a); answerQueries.push(c.n() - before);
      if (process.env.SIM_DEBUG && c.n() - before > 40) console.log(`heavy answer #${n + 1}: ${c.n() - before} queries, ended=${view.ended}`);
      await new Promise((r) => setImmediate(r));
    }
  }));
  const wall = performance.now() - started;
  console.log(`\npractice: ${answerTimes.length} answers by ${students.length} students at the same time in ${(wall / 1000).toFixed(1)} s · ${(answerTimes.length / (wall / 1000)).toFixed(0)} answers/s`);

  // 2) students open their pages: all at once (wall time), then one by one (exact query counts)
  const burst0 = performance.now();
  await Promise.all(students.map(async (s) => { const a = actors.get(String(s.id))!; await assignedSkills(raw, a, now); await navCounts(raw, a, now); await myMap(raw, a, now); }));
  console.log(`burst: ${students.length} students open My work + My MAP at the same instant: all served in ${((performance.now() - burst0) / 1000).toFixed(1)} s`);
  for (const s of students) await (async () => {
    const a = actors.get(String(s.id))!;
    await measure("student · My work", c, (r) => assignedSkills(r, a, now));
    await measure("student · icon numbers (every page)", c, (r) => navCounts(r, a, now));
    await measure("student · My MAP", c, (r) => myMap(r, a, now));
    await measure("student · my week", c, (r) => studentWeek(r, a, now));
    await measure("student · review due", c, (r) => dueMistakes(r, String(s.id), now));
    await measure("student · HOME page (all of it)", c, async (r) => { await Promise.all([assignedSkills(r, a, now), studentWeek(r, a, now), myExitTicket(r, a), dueMistakes(r, String(s.id), now), myTests(r, a, now), questionOfTheDay(r, a, now), classChallenge(r, String(s.schoolId), String(s.gradeId), now), studentBadges(r, String(s.id), now)]); });
  })();

  // 1b) the MAP practice test: every student at the same time, 10 answers each
  const admin0 = await resolveActor(raw, (await raw.findUnique("User", { username: "test.admin" }))!);
  const win = await createWindow(raw, admin0, { grade: null, season: "WINTER", subjects: ["READING"], items: 50, opensAt: new Date(now.getTime() - 3600_000), closesAt: new Date(now.getTime() + 7 * 86_400_000) }, now);
  const simTimes: number[] = [];
  const simStart = performance.now();
  await Promise.all(students.map(async (s, k) => {
    const a = actors.get(String(s.id))!;
    let clock = now.getTime() + k * 100;
    let sc = await startTest(raw, a, { windowId: win, subject: "READING" }, new Date(clock));
    for (let n = 0; n < 10 && !sc.done; n++) {
      const [it] = await loadQuestionItems(raw, [sc.question!.questionId]);
      const t0 = performance.now();
      sc = await answerTest(raw, a, sc.sessionId, sc.question!.questionId, it.options ? it.options[0].label : null, new Date((clock += 30_000)));
      simTimes.push(performance.now() - t0);
      await new Promise((r) => setImmediate(r));
    }
  }));
  simTimes.sort((x, y) => x - y);
  console.log(`MAP practice test: ${simTimes.length} answers by ${students.length} students at once in ${((performance.now() - simStart) / 1000).toFixed(1)} s · per answer p50 ${pct(simTimes, 50).toFixed(1)} ms · p95 ${pct(simTimes, 95).toFixed(1)} ms`);

  // 3) teachers and the admin
  const admin = await resolveActor(raw, (await raw.findUnique("User", { username: "test.admin" }))!);
  for (let i = 1; i <= 6; i++) {
    const t = await resolveActor(raw, (await raw.findUnique("User", { username: `test.teacher.${i}` }))!);
    const cls = await readableClasses(raw, t);
    for (const k of cls) {
      const id = String(k.id);
      await measure("teacher · MAP matrix (class)", c, (r) => classMatrix(r, t, id, "READING", now));
      await measure("teacher · MAP plans (class)", c, (r) => classPlans(r, t, id, "READING"));
      await measure("teacher · small groups", c, (r) => smallGroups(r, t, id, "READING"));
      await measure("teacher · Students (class)", c, (r) => classProgress(r, t, id, "READING"));
    }
    await measure("teacher · icon numbers (every page)", c, (r) => navCounts(r, t, now));
    await measure("teacher · alerts", c, (r) => alertList(r, t, { status: "OPEN" }, now));
    await measure("teacher · My week", c, (r) => weekSuggestions(r, t, now));
  }
  await measure("admin · alerts (whole school)", c, (r) => alertList(r, admin, { status: "ALL" }, now));
  await measure("admin · grade summary", c, (r) => gradeSummary(r, admin, "READING", now));
  await measure("admin · department week", c, (r) => departmentSummary(r, admin, now));

  const r1 = (x: number) => x.toFixed(1);
  answerTimes.sort((a, b) => a - b); answerQueries.sort((a, b) => a - b);
  console.log(`one answer (100 students at once): p50 ${r1(pct(answerTimes, 50))} ms · p95 ${r1(pct(answerTimes, 95))} ms · queries p50 ${pct(answerQueries, 50)} (the max is inflated: answers of other students run at the same time)`);
  console.log("\npage / call                              runs   p50 ms   p95 ms   max ms   queries (p50 / max)");
  for (const x of results) {
    const ms = [...x.ms].sort((a, b) => a - b), q = [...x.q].sort((a, b) => a - b);
    console.log(`${x.name.padEnd(40)} ${String(x.ms.length).padStart(4)} ${r1(pct(ms, 50)).padStart(8)} ${r1(pct(ms, 95)).padStart(8)} ${r1(ms[ms.length - 1]).padStart(8)}   ${pct(q, 50)} / ${q[q.length - 1]}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
