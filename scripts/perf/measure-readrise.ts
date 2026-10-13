/**
 * ReadRise performance with the FULL article library (offline, SQLite copy of the demo school — never a real database):
 *   npx tsx scripts/perf/measure-readrise.ts          (LATENCY_MS=5 per database call, OLD=150 articles before the update)
 *
 * 1. "Before the update": the platform library holds the first OLD article files.
 * 2. "The update ships": data/readrise/articles holds every file. Measures what the first ReadRise page view after the
 *    deploy waits for (the library check / load), and the background load.
 * 3. Students read a few articles; then every ReadRise page's data loading is measured COLD (right after a write to the
 *    ReadRise tables) and WARM (a second visit), counting database calls and rows through a measuring Repo.
 */
import { performance } from "node:perf_hooks";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoDatabase, ROOT } from "../../tests/helpers/db";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { noteWrite } from "../../src/server/cache/bank-version";
import { afterResponseSettled } from "../../src/server/lib/after-response";
import * as seed from "../../src/server/readrise/seed";
import { listLibrary } from "../../src/server/readrise/library";
import { articlePage, finishReading, readRiseHome, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../../src/server/readrise/student";
import { classReport, pollReport, schoolDashboard, skillsReport, writingQueue } from "../../src/server/readrise/dashboards";
import { classGrowth, myGrowthStory, studentGrowthReport } from "../../src/server/readrise/growth-report";
import { classArticles, teacherReadRiseClasses } from "../../src/server/readrise/teacher";
import { assignableArticles } from "../../src/server/readrise/library";
import { freshStats, MeasuringRepo } from "./measuring-repo";
import { canSeeNafsCached } from "../../src/server/teacher/nafs-access";

const LATENCY = Number(process.env.LATENCY_MS ?? 5);
const OLD = Number(process.env.OLD ?? 150);
const s = (v: unknown) => String(v ?? "");

type Run = { calls: number; rows: number; ms: number; top: string };
const results: { page: string; cold: Run | null; warm: Run | null }[] = [];

async function once(m: MeasuringRepo, fn: () => Promise<unknown>): Promise<Run> {
  m.stats = freshStats(); m.latency = LATENCY;
  const t = performance.now(); await fn(); const ms = performance.now() - t;
  m.latency = 0;
  const st = m.stats;
  return { calls: st.calls, rows: st.rows, ms: Math.round(ms), top: [...st.byModel.entries()].sort((a, b) => b[1].rows - a[1].rows).slice(0, 3).map(([k, v]) => `${k} ${v.rows}`).join(", ") };
}

async function measure(page: string, m: MeasuringRepo, fn: () => Promise<unknown>) {
  try {
    await fn();
    noteWrite("RRRun"); noteWrite("RRArticle"); noteWrite("RRVersion"); // a reading was saved / an article changed
    const cold = await once(m, fn);
    const warm = await once(m, fn);
    results.push({ page, cold, warm });
  } catch (e) { m.latency = 0; results.push({ page: `${page} (error: ${(e as Error).message.slice(0, 60)})`, cold: null, warm: null }); }
}

async function main() {
  const t0 = performance.now();
  const { repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 20 });
  const m = new MeasuringRepo(repo);
  const actorFor = async (u: string): Promise<Actor> => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const admin = await actorFor("demo.admin");
  const teacher = await actorFor("demo.teacher.4a");

  // 1. the library before the update: the first OLD files
  const files = readdirSync(join(ROOT, "data", "readrise", "articles")).filter((n) => n.endsWith(".json")).sort();
  const oldRoot = mkdtempSync(join(tmpdir(), "rr-old-"));
  mkdirSync(join(oldRoot, "data", "readrise", "articles"), { recursive: true });
  for (const f of files.slice(0, OLD)) symlinkSync(join(ROOT, "data", "readrise", "articles", f), join(oldRoot, "data", "readrise", "articles", f));
  const before = await seed.seedReadRiseLibrary(repo, oldRoot, () => undefined);
  rmSync(oldRoot, { recursive: true, force: true });
  console.log(`setup ${Math.round((performance.now() - t0) / 1000)} s; library before the update: ${before.created} articles; files now: ${files.length}`);

  // 2. the first ReadRise page view after the deploy
  const fresh = new Date();
  const kick = (seed as unknown as { startReadRiseLibraryLoad?: (r: MeasuringRepo, root?: string) => unknown }).startReadRiseLibraryLoad;
  if (typeof kick === "function") {
    const page = await once(m, async () => { kick(m, ROOT); });
    console.log(`first page view after the deploy waits for: ${page.calls} DB calls, ${page.ms} ms (the load runs in the background)`);
    const bg = await once(m, () => seed.ensureReadRiseLibrary(m, ROOT, fresh));
    console.log(`  background load (awaited here): ${bg.calls} DB calls, ${bg.rows} rows, ${bg.ms} ms @${LATENCY}ms/call`);
  } else {
    const page = await once(m, () => seed.ensureReadRiseLibrary(m, ROOT, fresh));
    console.log(`first page view after the deploy waits for: ${page.calls} DB calls, ${page.rows} rows, ${page.ms} ms @${LATENCY}ms/call (${page.top})`);
  }
  await afterResponseSettled();
  console.log(`platform articles now: ${await repo.count("RRArticle", { schoolId: null, deletedAt: null })}`);

  // 3. students read: class 4A, 3 articles each
  const klass = (await teacherReadRiseClasses(repo, teacher)).find((c) => c.own)!;
  const kids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((x) => s(x.studentId));
  const studentUsers = await repo.findMany("Student", { id: { in: kids } }, { select: ["id", "userId"] });
  const users = await repo.findMany("User", { id: { in: studentUsers.map((x) => x.userId) } }, { select: ["id", "username"] });
  const arts = (await repo.findMany("RRArticle", { schoolId: null, deletedAt: null }, { select: ["id", "code"] })).sort((a, b) => s(a.code).localeCompare(s(b.code)));
  const writing = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
  const ans = (k: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < k ? "A" : "B"]));
  const students: Actor[] = [];
  for (const [i, u] of users.entries()) {
    const a = await actorFor(s(u.username));
    students.push(a);
    for (let j = 0; j < 3; j++) {
      const v = await startRun(repo, a, s(arts[(i * 3 + j) % arts.length].id));
      await submitPrePoll(repo, a, v.runId, 1); await finishReading(repo, a, v.runId, { readSeconds: 100 });
      await submitActivity(repo, a, v.runId, ans(4 + ((i + j) % 5))); await submitWriting(repo, a, v.runId, writing); await submitPostPoll(repo, a, v.runId, 2);
    }
  }
  await afterResponseSettled();
  const student = students[0];
  console.log(`readings: ${await repo.count("RRRun", {})}`);

  await measure("Student › ReadRise home (library)", m, () => readRiseHome(m, student, {}));
  await measure("Student › ReadRise home (search 'bee')", m, () => readRiseHome(m, student, { q: "bee" }));
  await measure("Student › My report (growth story)", m, () => myGrowthStory(m, student));
  await measure("Student › article page", m, () => articlePage(m, student, s(arts[0].id)));
  await measure("Teacher › ReadRise library", m, () => listLibrary(m, teacher, {}));
  await measure("Admin › ReadRise library", m, () => listLibrary(m, admin, {}));
  await measure("Teacher › class report (Students tab)", m, () => classReport(m, teacher, klass.id));
  await measure("Teacher › Growth tab", m, () => classGrowth(m, teacher, klass.id));
  await measure("Teacher › student growth report", m, () => studentGrowthReport(m, teacher, klass.id, kids[0]));
  await measure("Teacher › Skills tab", m, () => skillsReport(m, teacher, klass.id));
  await measure("Teacher › Polls tab", m, () => pollReport(m, teacher, klass.id));
  await measure("Teacher › Scoring tab", m, () => writingQueue(m, teacher, klass.id, { scored: true }));
  await measure("Teacher › Assign tab", m, async () => { await classArticles(m, teacher, klass.id); await assignableArticles(m, teacher); });
  await measure("Admin › ReadRise school dashboard", m, () => schoolDashboard(m, admin));
  // the teacher ReadRise page: the class summary and the open tab one after the other (before) vs side by side (now)
  await measure("Teacher › ReadRise page, Growth tab (one after the other)", m, async () => { await classReport(m, teacher, klass.id); await classGrowth(m, teacher, klass.id); });
  await measure("Teacher › ReadRise page, Growth tab (side by side)", m, () => Promise.all([classReport(m, teacher, klass.id), classGrowth(m, teacher, klass.id)]));
  // the page frame on every teacher page: the NAFS menu flag (the second page reuses the teacher's answer)
  await measure("Teacher frame › NAFS menu flag", m, () => canSeeNafsCached(m, teacher));

  const w = Math.max(...results.map((r) => r.page.length));
  const col = (r: Run | null) => r ? `${String(r.calls).padStart(5)} ${String(r.rows).padStart(7)} ${String(r.ms).padStart(6)} ms` : "".padStart(22);
  console.log(`\n${"page".padEnd(w)}  ${"COLD calls / rows / time".padEnd(24)}  ${"WARM calls / rows / time".padEnd(24)}  largest reads (cold)   @${LATENCY}ms/call`);
  for (const r of results) console.log(`${r.page.padEnd(w)}  ${col(r.cold)}    ${col(r.warm)}    ${r.cold?.top ?? ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
