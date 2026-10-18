/**
 * 🏫 A class rush, simulated (r68): N students of the demo school (in-memory SQLite — never a real database or real
 * students) open their home page and My Work, start practice on a skill of their grade, and answer Q questions each, ALL
 * AT THE SAME TIME, through the real server functions. Every database call costs `latencyMs` (Render → Aiven), so the
 * students' requests interleave as on the one-process server. Measures each request's time, the errors, and the
 * process's heap (sampled every 25 ms) — peak and after the rush.
 */
import { performance } from "node:perf_hooks";
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";
import { MeasuringRepo } from "../../scripts/perf/measuring-repo";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { loadSkillItems, type PracticeItem } from "../../src/server/practice/items";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { studentHome } from "../../src/server/student/student-home";
import { afterResponseSettled } from "../../src/server/lib/after-response";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { demoDatabase, ROOT, seededRandom } from "./db";

const MB = 1048576;
const s = (v: unknown) => String(v ?? "");

export interface RushSchool { repo: SqliteRepo; students: Actor[]; skillOf: Map<string, string> }

/** The school: `classesPerGrade` × 25 students in Grades 4–6 (3 grades), the whole bank published. */
export async function rushSchool(opts: { classesPerGrade?: number; studentsPerClass?: number } = {}): Promise<RushSchool> {
  const { repo } = await demoDatabase({ classesPerGrade: opts.classesPerGrade ?? 4, studentsPerClass: opts.studentsPerClass ?? 25 });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const pending = await repo.findMany("Question", { status: "UNDER_REVIEW" }, { select: ["id"] });
  await repo.updateMany("Question", { id: { in: pending.map((q) => q.id) } }, { status: "PUBLISHED" });
  // a few skills with enough questions per grade (a class works on a handful of skills at a time)
  const skillsOfGrade = new Map<string, string[]>();
  for (const cur of await repo.findMany("Curriculum", {}, { select: ["id", "gradeId"] })) {
    const list: string[] = [];
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id, isActive: true, deletedAt: null }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }] })) {
      if ((await loadSkillItems(repo, s(k.id))).length >= 25) list.push(s(k.id));
      if (list.length >= 4) break;
    }
    if (list.length) skillsOfGrade.set(s(cur.gradeId), list);
  }
  const students: Actor[] = [];
  const skillOf = new Map<string, string>();
  for (const u of await repo.findMany("User", { role: "STUDENT" }, { orderBy: [{ field: "username", dir: "asc" }] })) {
    const a = await resolveActor(repo, u);
    const st = await repo.findUnique("Student", { id: a.studentId! });
    const list = skillsOfGrade.get(s(st?.gradeId));
    if (!list?.length) continue;
    skillOf.set(a.studentId!, list[students.length % list.length]);
    students.push(a);
  }
  return { repo, students, skillOf };
}

export interface RushResult {
  students: number; answers: number; errors: number; errorSamples: string[];
  p50: number; p95: number; max: number; homeP95: number;
  heapStartMb: number; heapPeakMb: number; heapAfterMb: number; rssPeakMb: number; seconds: number;
}

const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]); };

/** The response a student gives (right for 2 of 3, as a class would). */
export function answerFor(it: PracticeItem, right: boolean): unknown {
  if (it.options) return it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct === right || (!right && !o.correct)).map((o) => o.label) : (it.options.find((o) => o.correct === right) ?? it.options[0]).label;
  if (it.type === "TRUE_FALSE") return right ? it.answer : !it.answer;
  if (it.type === "FILL_BLANK") return right ? it.answers![0] : "zzz";
  if (it.type === "ERROR_CORRECTION") return right ? it.errorIndex : ((it.errorIndex ?? 0) + 1) % (it.segments?.length ?? 1);
  if (it.type === "MATCHING") return Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]));
  if (it.sequence) return right ? it.sequence : [...it.sequence].reverse();
  return "A";
}

/**
 * The database as the server sees it: at most `size` connections (Prisma's connection_limit); every call waits for a free
 * connection, holds it for `latencyMs` (the round trip) and gives it back; a transaction holds ONE connection until it
 * ends. Calls that wait longer than `timeoutMs` fail like Prisma's pool timeout (P2024).
 */
export class PooledRepo implements Repo {
  waits = 0; timeouts = 0; peakWaiting = 0;
  private free: number;
  private queue: (() => void)[] = [];
  constructor(private readonly inner: Repo, readonly size: number, readonly latencyMs: number, readonly timeoutMs = 20_000, private readonly inTx = false, private readonly root?: PooledRepo) { this.free = size; }
  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTx) { await sleep(this.latencyMs); return fn(); } // inside a transaction: its own connection
    const r = this.root ?? this;
    if (r.free > 0) r.free--;
    else {
      r.waits++;
      await new Promise<void>((go, fail) => {
        const enter = () => { clearTimeout(t); go(); };
        const t = setTimeout(() => { const i = r.queue.indexOf(enter); if (i >= 0) r.queue.splice(i, 1); r.timeouts++; fail(Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" })); }, r.timeoutMs);
        r.queue.push(enter);
        r.peakWaiting = Math.max(r.peakWaiting, r.queue.length);
      });
    }
    try { await sleep(this.latencyMs); return await fn(); }
    finally { const next = r.queue.shift(); if (next) next(); else r.free++; }
  }
  upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { return this.slot(() => this.inner.upsert(m, w, c, u)); }
  create(m: string, d: Row) { return this.slot(() => this.inner.create(m, d)); }
  createMany(m: string, rows: Row[]) { return this.slot(() => this.inner.createMany(m, rows)); }
  findUnique(m: string, w: Record<string, unknown>) { return this.slot(() => this.inner.findUnique(m, w)); }
  findMany(m: string, w?: Where, o?: FindOptions) { return this.slot(() => this.inner.findMany(m, w, o)); }
  count(m: string, w?: Where) { return this.slot(() => this.inner.count(m, w)); }
  updateMany(m: string, w: Where, d: Row) { return this.slot(() => this.inner.updateMany(m, w, d)); }
  deleteMany(m: string, w: Where) { return this.slot(() => this.inner.deleteMany(m, w)); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    return this.slot(() => this.inner.transaction((tx) => fn(new PooledRepo(tx, this.size, this.latencyMs, this.timeoutMs, true, this.root ?? this))));
  }
}
const sleep = (ms: number) => new Promise<void>((r) => (ms > 0 ? setTimeout(r, ms) : setImmediate(r)));

/** Runs the rush: every student at once. `gc` (when exposed) before the start and after the end. `pool`: the database
 *  connection pool to model (connections, round trip ms) — without it every call only costs `latencyMs`. */
export async function runRush(school: RushSchool, opts: { questions?: number; latencyMs?: number; students?: number; pool?: number } = {}): Promise<RushResult & { poolWaits?: number; poolTimeouts?: number }> {
  const gc = (globalThis as { gc?: () => void }).gc;
  const q = opts.questions ?? 20;
  const pooled = opts.pool ? new PooledRepo(school.repo, opts.pool, opts.latencyMs ?? 2) : null;
  const m = new MeasuringRepo(pooled ?? school.repo);
  m.latency = pooled ? 0 : opts.latencyMs ?? 2;
  const who = school.students.slice(0, opts.students ?? school.students.length);
  const keys = new Map<string, Map<string, PracticeItem>>();
  for (const id of new Set(who.map((a) => school.skillOf.get(a.studentId!)!))) keys.set(id, new Map((await loadSkillItems(school.repo, id, { wholePool: true })).map((i) => [i.questionId, i])));
  gc?.(); gc?.();
  const heapStartMb = process.memoryUsage().heapUsed / MB;
  let heapPeakMb = heapStartMb, rssPeakMb = process.memoryUsage().rss / MB;
  const sampler = setInterval(() => { const u = process.memoryUsage(); heapPeakMb = Math.max(heapPeakMb, u.heapUsed / MB); rssPeakMb = Math.max(rssPeakMb, u.rss / MB); }, 25);
  const times: number[] = [], home: number[] = [], errors: string[] = [];
  let answers = 0;
  const rng = seededRandom(68);
  const t0 = performance.now();
  const timed = async <T,>(list: number[], fn: () => Promise<T>): Promise<T | null> => {
    const t = performance.now();
    try { return await fn(); }
    catch (e) { errors.push(String((e as Error)?.message ?? e).slice(0, 160)); return null; }
    finally { list.push(performance.now() - t); }
  };
  await Promise.all(who.map(async (actor, k) => {
    const skillId = school.skillOf.get(actor.studentId!)!;
    const items = keys.get(skillId)!;
    await timed(home, () => studentHome(m, actor));
    // the student's own clock: 40 s per answer (a careful answer, never a rapid guess)
    let clock = Date.now();
    let view = await timed(times, () => startPractice(m, actor, skillId, new Date(clock), rng));
    for (let n = 0; n < q && view?.question; n++) {
      const it = items.get(view.question.questionId) ?? (await loadSkillItems(school.repo, skillId, { wholePool: true })).find((i) => i.questionId === view!.question!.questionId);
      if (!it) { errors.push("question not in the pool"); break; }
      const r = await timed(times, () => submitAnswer(m, actor, { sessionId: view!.sessionId, questionId: it.questionId, response: answerFor(it, (n + k) % 3 !== 0) }, new Date((clock += 40_000)), rng));
      if (!r) break;
      answers++;
      view = r.view;
    }
  }));
  const seconds = (performance.now() - t0) / 1000;
  await afterResponseSettled();
  clearInterval(sampler);
  gc?.(); gc?.();
  return {
    students: who.length, answers, errors: errors.length, errorSamples: [...new Set(errors)].slice(0, 5),
    p50: pct(times, 50), p95: pct(times, 95), max: Math.round(Math.max(0, ...times)), homeP95: pct(home, 95),
    heapStartMb: Math.round(heapStartMb), heapPeakMb: Math.round(heapPeakMb), heapAfterMb: Math.round(process.memoryUsage().heapUsed / MB), rssPeakMb: Math.round(rssPeakMb), seconds: Math.round(seconds * 10) / 10,
    ...(pooled ? { poolWaits: pooled.waits, poolTimeouts: pooled.timeouts } : {}),
  };
}
