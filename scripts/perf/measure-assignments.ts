/**
 * Performance of the assignment pages with the Test School (200 students), on a local SQLite copy with a
 * simulated network delay per database call (default 200 ms, like a far-away database).
 *   npx tsx scripts/perf/measure-assignments.ts [latencyMs]
 */
import { demoDatabase } from "../../tests/helpers/db";
import type { Repo } from "../../src/server/seeding/repo";
import { resolveActor } from "../../src/server/auth/actor";
import { seedTestEnvironment } from "../../src/server/seeding/test-env";
import { assignmentDetail, teacherCurriculum, weeklyAssignments } from "../../src/server/teacher/assign";
import { assignedSkills, assignmentReport } from "../../src/server/student/assigned";
import { unreadCount, listNotifications } from "../../src/server/notifications";
import { listQuestions } from "../../src/server/admin/questions";
import { curriculumTree } from "../../src/server/curriculum-manage";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { loadSkillItems } from "../../src/server/practice/items";

const LATENCY = Number(process.argv[2] ?? 200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slow(repo: Repo, stats: { calls: number }, latency: () => number): Repo {
  return new Proxy(repo, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      if (typeof v !== "function") return v;
      if (k === "transaction") return (fn: (tx: Repo) => Promise<unknown>) => (v as (f: unknown) => Promise<unknown>).call(t, (tx: Repo) => fn(slow(tx, stats, latency)));
      if (!["findMany", "findUnique", "count", "create", "createMany", "updateMany", "deleteMany", "upsert"].includes(String(k))) return v.bind(t);
      return async (...a: unknown[]) => { stats.calls++; if (latency()) await sleep(latency()); return (v as (...x: unknown[]) => unknown).apply(t, a); };
    },
  }) as Repo;
}

(async () => {
  const { repo: base } = await demoDatabase();
  const now = new Date();
  await seedTestEnvironment(base, { root: process.cwd(), passwordHash: "x".repeat(60), now });
  const stats = { calls: 0 };
  let lat = 0;
  const repo = slow(base, stats, () => lat);
  const actor = async (u: string) => resolveActor(base, (await base.findUnique("User", { username: u }))!);
  const [admin, teacher, student] = [await actor("test.admin"), await actor("test.teacher.1"), await actor("test.student.002")];
  const view = (await teacherCurriculum(base, teacher))!;
  const someAssignment = (await weeklyAssignments(base, teacher, new Date(now.getTime() - 3 * 86_400_000), now))[0].id;
  const weekStart = new Date(now.getTime() - 3 * 86_400_000);
  const skill = view.units[0].skills[0].id;
  const pages: [string, () => Promise<unknown>][] = [
    ["Teacher › Curriculum (⭐ Assign view)", () => teacherCurriculum(repo, teacher)],
    ["Teacher › Weekly assignments", () => weeklyAssignments(repo, teacher, weekStart, now)],
    ["Admin › Weekly assignments (6 classes)", () => weeklyAssignments(repo, admin, weekStart, now)],
    ["Teacher › Assignment results (34 students)", () => assignmentDetail(repo, teacher, someAssignment, now)],
    ["Teacher › Student report", async () => assignmentReport(repo, teacher, someAssignment, view.students[0].id)],
    ["Student › Home (assigned skills)", () => assignedSkills(repo, student, now)],
    ["Any page › Notification bell", () => unreadCount(repo, student.userId)],
    ["Student › Notifications list", () => listNotifications(repo, student)],
    ["Admin › Questions (page 1 of 100)", () => listQuestions(repo, admin, { status: "PUBLISHED", limit: 100, page: 1 })],
    ["Admin › Questions, possible missing passage", () => listQuestions(repo, admin, { status: "PUBLISHED", passage: "missing", limit: 100 })],
    ["Admin › Curriculum management", () => curriculumTree(repo, admin)],
  ];
  console.log(`latency per database call: ${LATENCY} ms\n`);
  console.log("page".padEnd(46), "calls".padStart(6), "time".padStart(8), "data".padStart(9));
  for (const [name, fn] of pages) {
    await fn(); // warm caches
    stats.calls = 0; lat = LATENCY;
    const t0 = performance.now();
    const out = await fn();
    const ms = performance.now() - t0;
    lat = 0;
    console.log(name.padEnd(46), String(stats.calls).padStart(6), `${(ms / 1000).toFixed(2)} s`.padStart(8), `${Math.round(JSON.stringify(out ?? null).length / 1024)} KB`.padStart(9));
  }
  // practice: start + one answer on an assigned skill (the session is linked to the assignment)
  await loadSkillItems(base, skill);
  const st = await actor("test.student.010");
  stats.calls = 0; lat = LATENCY;
  let t0 = performance.now();
  const v = await startPractice(repo, st, skill, now);
  console.log("Student › Start practice (assigned skill)".padEnd(46), String(stats.calls).padStart(6), `${((performance.now() - t0) / 1000).toFixed(2)} s`.padStart(8));
  const it = (await loadSkillItems(base, skill)).find((x) => x.questionId === v.question!.questionId)!;
  stats.calls = 0; t0 = performance.now();
  await submitAnswer(repo, st, { sessionId: v.sessionId, questionId: it.questionId, response: it.options ? it.options[0].label : it.type === "TRUE_FALSE" ? true : it.answers?.[0] ?? it.sequence ?? it.errorIndex ?? Object.fromEntries(it.pairs!.map((p) => [p.left, p.right])) }, new Date(now.getTime() + 20_000));
  console.log("Student › Each answer (with assignment update)".padEnd(46), String(stats.calls).padStart(6), `${((performance.now() - t0) / 1000).toFixed(2)} s`.padStart(8));
})();
