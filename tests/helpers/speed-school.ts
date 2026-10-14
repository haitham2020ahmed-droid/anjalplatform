/**
 * ⚡ The speed-test school (the same dataset as scripts/perf/measure.ts, smaller practice history so a test builds it
 * in well under a minute): demo school with 3 classes per grade × 25 students, the full question bank published (plus,
 * with `bigBank`, a production-sized bank of that many generated questions), and practice history for the first Grade 4
 * students; every database call costs LATENCY_MS (a database in another region). In-memory SQLite only — never a real database or real students.
 *
 *   timePage(name, fn)   runs fn twice (cold: empty caches · warm: the next visit) and returns the server time
 *                        (ms) and the number of database calls of each run (MeasuringRepo).
 */
import { performance } from "node:perf_hooks";
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";
import { MeasuringRepo, freshStats } from "../../scripts/perf/measuring-repo";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { loadSkillItems } from "../../src/server/practice/items";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { demoDatabase, ROOT } from "./db";
import { simulatePractice } from "./practice";
import { holdAfterResponse } from "../../src/server/lib/after-response";
import { addBigBank } from "./big-bank";

export interface SpeedSchool { repo: SqliteRepo; m: MeasuringRepo; admin: Actor; teacher: Actor; student: Actor; classId: string; actorFor: (u: string) => Promise<Actor> }

/** latencyMs: simulated round trip per database call (the school's database is in another region: 2–10 ms). */
export const LATENCY_MS = 3;

export async function speedSchool(opts: { students?: number; sessions?: number; bigBank?: number } = {}): Promise<SpeedSchool> {
  const { db, repo } = await demoDatabase({ classesPerGrade: 3, studentsPerClass: 25 });
  if (opts.bigBank) await addBigBank(db, repo, { n: opts.bigBank });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const pending = await repo.findMany("Question", { status: "UNDER_REVIEW" }, { select: ["id"] });
  await repo.updateMany("Question", { id: { in: pending.map((q) => q.id) } }, { status: "PUBLISHED" });
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const g4 = (await repo.findMany("User", { role: "STUDENT" }, { select: ["username"] })).map((u) => String(u.username)).filter((u) => u.startsWith("demo.s1"));
  const cur4 = (await repo.findMany("Curriculum", {})).find((c) => String(c.name).startsWith("Grade 4"))!;
  const withItems: string[] = [];
  for (const k of await repo.findMany("Skill", { curriculumId: cur4.id }, { select: ["id", "code"] })) {
    if ((await loadSkillItems(repo, String(k.id))).length >= 10) withItems.push(String(k.code));
    if (withItems.length >= 6) break;
  }
  const sessions = opts.sessions ?? 2;
  const months = Array.from({ length: sessions }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 3 + Math.floor((i * 110) / sessions))).toISOString().slice(0, 10), skill: withItems[i % withItems.length] }));
  await simulatePractice(repo, g4.slice(0, opts.students ?? 20), months, 8);
  const admin = await actorFor("demo.admin");
  const teacher = await actorFor("demo.teacher.4a");
  const student = await actorFor(g4[0]);
  const classId = String((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: teacher.userId }))!.id }))[0].classId);
  const m = new MeasuringRepo(repo);
  m.latency = LATENCY_MS;
  return { repo, m, admin, teacher, student, classId, actorFor };
}

export interface PageTime { page: string; coldMs: number; warmMs: number; coldCalls: number; warmCalls: number }

/**
 * Server time of one page's data loading: a cold first visit, then the next visit (caches warm). Work the page leaves
 * for after the response (runAfterResponse) runs between the two visits, not inside the timed time — as on the server.
 */
export async function timePage(m: MeasuringRepo, page: string, fn: () => Promise<unknown>): Promise<PageTime> {
  m.stats = freshStats();
  let release = holdAfterResponse();
  let t = performance.now();
  await fn();
  const coldMs = performance.now() - t, coldCalls = m.stats.calls;
  await release();
  m.stats = freshStats();
  release = holdAfterResponse();
  t = performance.now();
  await fn();
  const warmMs = performance.now() - t, warmCalls = m.stats.calls;
  await release();
  return { page, coldMs: Math.round(coldMs), warmMs: Math.round(warmMs), coldCalls, warmCalls };
}

export function table(rows: PageTime[]): string {
  const w = Math.max(...rows.map((r) => r.page.length));
  return [`${"page".padEnd(w)}  cold ms  calls  warm ms  calls`, ...rows.map((r) => `${r.page.padEnd(w)}  ${String(r.coldMs).padStart(7)}  ${String(r.coldCalls).padStart(5)}  ${String(r.warmMs).padStart(7)}  ${String(r.warmCalls).padStart(5)}`)].join("\n");
}
