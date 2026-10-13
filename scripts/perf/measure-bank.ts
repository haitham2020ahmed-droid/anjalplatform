/**
 * Performance with the FULL question packs loaded (offline, no Render needed):
 *   npx tsx scripts/perf/measure-bank.ts            (PACKS=gap,topup,span,map,grammar  LATENCY_MS=5)
 *
 * Builds the demo school in SQLite, loads the question packs of data/questions/sets exactly as Admin → Questions →
 * Load new questions does (runPackChunk, chunk by chunk) and reports the database calls and time of each chunk, then
 * the hot pages (skill pickers, test builder, Curriculum Map, plans, practice, ReadRise library, the Load page) through
 * a measuring Repo that counts every call and the rows it returns and adds LATENCY_MS per call.
 * SAVE_DB=file keeps the loaded database; LOAD_DB=file measures the pages on it again without loading (e.g. to
 * compare two versions of the code on the same data).
 */
import { performance } from "node:perf_hooks";
import { demoDatabase, ROOT } from "../../tests/helpers/db";
import { resolveActor } from "../../src/server/auth/actor";
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";
import { seedQuestions } from "../../src/server/seeding/questions";
import { loadBank } from "../../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { PACKS, runPackChunk } from "../../src/server/questions/load-packs";
import { loadStatus } from "../../src/server/admin/load-questions";
import { skillPickerList } from "../../src/server/skills/picker";
import { masterSkills } from "../../src/server/skills/master";
import { builderSkills, previewTest } from "../../src/server/tests/assessments";
import { generateTest } from "../../src/server/tests/generate";
import { questionDetail } from "../../src/server/tests/question-detail";
import { teacherCurriculum } from "../../src/server/teacher/assign";
import { planPlaces, listSkillPlans, createSkillPlan, studentStudyPlans, skillPlanForStudent } from "../../src/server/curriculum-map/plans";
import { classLevels } from "../../src/server/curriculum-map/levels";
import { startPractice } from "../../src/server/practice/session";
import { loadSkillItems } from "../../src/server/practice/items";
import { studentHome } from "../../src/server/student/student-home";
import { listQuestions } from "../../src/server/admin/questions";
import { seedReadRiseLibrary } from "../../src/server/readrise/seed";
import { listLibrary } from "../../src/server/readrise/library";
import { plansOverview } from "../../src/server/plans/editor";
import { attachmentNodes, clearMapCache } from "../../src/server/curriculum-map/questions";
import { listBankPage, bankStatusCounts, bankBanners, familyOptions } from "../../src/server/admin/questions-list";
import { copyFileSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SqliteRepo } from "../db/sqlite-repo";
import { parseSchema } from "../db/schema-ddl";
import { bumpBankVersion, noteWrite } from "../../src/server/cache/bank-version";
import { join } from "node:path";
import { parseCurriculumMap } from "../../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../../src/server/curriculum-map/seed";

const LATENCY = Number(process.env.LATENCY_MS ?? 5);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const s = (v: unknown) => String(v ?? "");

interface Stats { calls: number; rows: number; byModel: Map<string, { calls: number; rows: number }> }
const fresh = (): Stats => ({ calls: 0, rows: 0, byModel: new Map() });

class MeasuringRepo implements Repo {
  stats = fresh();
  latency = 0;
  constructor(private readonly inner: Repo, private readonly root?: MeasuringRepo) {}
  private get st() { return (this.root ?? this).stats; }
  private get l() { return (this.root ?? this).latency; }
  private async run<T>(model: string, p: Promise<T>): Promise<T> {
    if (this.l) await sleep(this.l);
    const r = await p;
    const rows = Array.isArray(r) ? r.length : r && typeof r === "object" ? 1 : 0;
    const x = this.st;
    x.calls++; x.rows += rows;
    const m = x.byModel.get(model) ?? { calls: 0, rows: 0 };
    m.calls++; m.rows += rows; x.byModel.set(model, m);
    return r;
  }
  upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { return this.run(m, this.inner.upsert(m, w, c, u)); }
  create(m: string, d: Row) { return this.run(m, this.inner.create(m, d)); }
  createMany(m: string, rows: Row[]) { return this.run(m, this.inner.createMany(m, rows)); }
  findUnique(m: string, w: Record<string, unknown>) { return this.run(m, this.inner.findUnique(m, w)); }
  findMany(m: string, w?: Where, o?: FindOptions) { return this.run(m, this.inner.findMany(m, w, o)); }
  count(m: string, w?: Where) { return this.run(m, this.inner.count(m, w)); }
  groupCount(m: string, by: string, w?: Where): Promise<Map<string, number>> {
    const inner = this.inner;
    if (typeof inner.groupCount !== "function") return this.findMany(m, w, { select: [by] }).then((rows) => { const o = new Map<string, number>(); for (const r of rows) { const k = String(r[by] ?? ""); o.set(k, (o.get(k) ?? 0) + 1); } return o; });
    return this.run(m, inner.groupCount(m, by, w).then((x) => [...x.entries()])).then((e) => new Map(e));
  }
  updateMany(m: string, w: Where, d: Row) { return this.run(m, this.inner.updateMany(m, w, d)); }
  deleteMany(m: string, w: Where) { return this.run(m, this.inner.deleteMany(m, w)); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> { return this.inner.transaction((tx) => fn(new MeasuringRepo(tx, this.root ?? this))); }
}

type Run = { calls: number; rows: number; ms: number; top: string };
const results: { page: string; cold: Run | null; warm: Run | null }[] = [];
/**
 * Each page twice: COLD (right after a question was saved — every cache built on the bank is stale, as during and
 * after a load or an edit) and WARM (a second visit while nothing changed).
 */
async function measure(page: string, m: MeasuringRepo, fn: () => Promise<unknown>) {
  const once = async () => {
    m.stats = fresh(); m.latency = LATENCY;
    const t = performance.now(); await fn(); const ms = performance.now() - t;
    m.latency = 0;
    const st = m.stats;
    return { calls: st.calls, rows: st.rows, ms: Math.round(ms), top: [...st.byModel.entries()].sort((a, b) => b[1].rows - a[1].rows).slice(0, 3).map(([k, v]) => `${k} ${v.rows}`).join(", ") };
  };
  try {
    await fn(); // first visit (one-time process setup)
    noteWrite("Question"); bumpBankVersion(); // a question was saved
    const cold = await once();
    const warm = await once();
    results.push({ page, cold, warm });
  } catch (e) { m.latency = 0; results.push({ page: `${page} (error: ${(e as Error).message.slice(0, 60)})`, cold: null, warm: null }); }
}

async function main() {
  const t0 = performance.now();
  // LOAD_DB=file: measure the pages on a database saved by an earlier run (SAVE_DB=file), without loading the packs
  const loadDb = process.env.LOAD_DB;
  const { db, repo } = loadDb ? (() => { const copy = `${loadDb}.${process.pid}`; copyFileSync(loadDb, copy); const d = new DatabaseSync(copy); d.exec("PRAGMA foreign_keys = ON"); return { db: d, repo: new SqliteRepo(d, parseSchema(join(ROOT, "prisma/schema.prisma"))) }; })() : await demoDatabase({ classesPerGrade: 2, studentsPerClass: 20 });
  if (!loadDb) await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const m = new MeasuringRepo(repo);
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const admin = await actorFor("demo.admin");
  const teacher = await actorFor("demo.teacher.4a");
  const studentUser = (await repo.findMany("User", { role: "STUDENT" }, { select: ["username"] })).map((u) => s(u.username)).find((u) => u.startsWith("demo.s1"))!;
  const student = await actorFor(studentUser);
  const schoolId = admin.schoolId!;
  console.log(`setup ${Math.round((performance.now() - t0) / 1000)} s, questions before: ${await repo.count("Question", {})}`);

  // ---- the loader, chunk by chunk (as the Load page does)
  const want = loadDb ? [] : (process.env.PACKS ?? PACKS.map((p) => p.key).join(",")).split(",");
  for (const def of PACKS.filter((p) => want.includes(p.key))) {
    let from = 0, chunks = 0, calls = 0, maxCalls = 0, maxMs = 0, added = 0, total = 0;
    const tp = performance.now();
    for (;;) {
      m.stats = fresh(); m.latency = LATENCY;
      const t = performance.now();
      const w = await runPackChunk(m, schoolId, def, from);
      const ms = performance.now() - t;
      m.latency = 0;
      chunks++; calls += m.stats.calls; maxCalls = Math.max(maxCalls, m.stats.calls); maxMs = Math.max(maxMs, ms); added += w.added; total = w.total;
      if (w.next >= w.total || w.next === from) break;
      from = w.next;
    }
    console.log(`pack ${def.key.padEnd(8)} units ${total} chunks ${chunks} added ${added}  DB calls/chunk avg ${Math.round(calls / chunks)} max ${maxCalls}  slowest chunk ${Math.round(maxMs)} ms @${LATENCY}ms/call  (pack ${Math.round((performance.now() - tp) / 1000)} s)`);
  }
  console.log(`questions after: ${await repo.count("Question", {})}, map links: ${await repo.count("QuestionMapLink", {})}`);
  if (!loadDb) {
    const rr = await seedReadRiseLibrary(repo, ROOT, () => undefined);
    console.log(`ReadRise articles: ${rr.created} (${rr.skipped.length} skipped)`);
  }
  if (process.env.SAVE_DB) { db.exec(`VACUUM INTO '${process.env.SAVE_DB}'`); console.log(`saved ${process.env.SAVE_DB}`); }

  // ---- hot pages
  const classId = s((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: teacher.userId }))!.id }))[0].classId);
  const picker = await skillPickerList(repo, teacher);
  const big = [...picker].sort((a, b) => b.questions - a.questions).slice(0, 3);
  const someQ = s((await repo.findMany("Question", { skillId: big[0].id, status: "PUBLISHED" }, { select: ["id"], take: 1 }))[0]?.id);
  if (!(await attachmentNodes(repo, schoolId)).length) { await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId }); clearMapCache(); }
  const nodes = await attachmentNodes(repo, schoolId);
  const g4 = nodes.filter((n) => n.grade === 4);
  const plan = await createSkillPlan(repo, teacher, { classId, title: "Perf plan", codes: g4.slice(0, 12).map((n) => n.code) }).catch(() => null);

  await measure("Admin › Load new questions (page)", m, () => loadStatus(m, admin));
  await measure("Skill picker (teacher)", m, () => skillPickerList(m, teacher));
  await measure("Master skills (admin)", m, () => masterSkills(m, schoolId));
  await measure("Test builder › skills", m, () => builderSkills(m, teacher, {}));
  await measure("Test builder › preview (3 big skills × 5)", m, () => previewTest(m, teacher, { skills: big.map((k) => ({ skillId: k.id, count: 5 })), levelMode: "LEVEL", seed: "x" }));
  await measure("Test builder › generate (skills, 20)", m, () => generateTest(m, teacher, { skillIds: big.map((k) => k.id), count: 20, level: "MIXED", classId, seed: "x" }));
  await measure("Test builder › generate (map lessons, 20)", m, () => generateTest(m, teacher, { lessons: [...new Set(g4.slice(0, 8).map((n) => n.code.split(".").slice(0, 3).join(".")))], count: 20, level: "MIXED", classId, seed: "x" }));
  await measure("Test builder › question detail", m, () => questionDetail(m, teacher, someQ));
  await measure("Teacher › Curriculum (MAP view)", m, () => teacherCurriculum(m, teacher, classId));
  await measure("Teacher › Curriculum Map plans", m, async () => { await listSkillPlans(m, teacher); const r = await classLevels(m, teacher, classId); await planPlaces(m, schoolId, r.grade); });
  await measure("Teacher › Plans overview", m, () => plansOverview(m, teacher, {}));
  await measure("Student › Curriculum Map (study plan)", m, async () => { const mine = await studentStudyPlans(m, student); const id = mine.defaultId ?? plan?.planId; if (id) await skillPlanForStudent(m, student, id); });
  await measure("Student › Home", m, () => studentHome(m, student));
  await measure("Student › Start practice (big skill)", m, () => startPractice(m, student, big[0].id));
  await measure("Practice items (big skill, cached)", m, () => loadSkillItems(m, big[0].id));
  await measure("Admin › Questions (search 'main idea')", m, () => listQuestions(m, admin, { status: "PUBLISHED", q: "main idea" }));
  await measure("Admin › Questions (map place list, 100)", m, () => listQuestions(m, admin, { status: "PUBLISHED", mapCode: g4[0].code, limit: 100, page: 1 }));
  await measure("Admin › Question Bank (page 1)", m, async () => { const f = { status: "PUBLISHED" as const }; await Promise.all([listBankPage(m, admin, f), bankStatusCounts(m, admin, f), bankBanners(m, admin), familyOptions(m, admin)]); });
  await measure("ReadRise › library (teacher)", m, () => listLibrary(m, teacher, {}));

  const w = Math.max(...results.map((r) => r.page.length));
  const col = (r: Run | null) => r ? `${String(r.calls).padStart(5)} ${String(r.rows).padStart(7)} ${String(r.ms).padStart(6)} ms` : "".padStart(22);
  console.log(`\n${"page".padEnd(w)}  ${"COLD calls / rows / time".padEnd(24)}  ${"WARM calls / rows / time".padEnd(24)}  largest reads (cold)   @${LATENCY}ms/call`);
  for (const r of results) console.log(`${r.page.padEnd(w)}  ${col(r.cold)}    ${col(r.warm)}    ${r.cold?.top ?? ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
