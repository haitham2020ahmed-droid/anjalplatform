/**
 * Child process of tests/jobs-memory.test.ts (real --expose-gc): the three startup jobs on a large synthetic school
 * (≥ 3,000 students, ≥ 20,000 questions, ≥ 300,000 answers), their results compared with the old way of running them,
 * their peak heap, a simulated restart, overlap, the settings race and the memory gate. Printed as {"result": …}.
 */
import type { Repo, Row } from "../../src/server/seeding/repo";
import { bigSchool } from "./big-school";
import { peakHeap } from "./peak-heap";
import { claimSetting, configureRunner, enqueueJob, jobsSettled, jobState, runJob, runnerPeakConcurrency, type JobDef } from "../../src/server/jobs/runner";
import { PRIVATIZE_JOB } from "../../src/server/jobs/startup";
import { STARS_JOB, MIGRATION_KEY, migrateSchool } from "../../src/server/skills/status-extras";
import { FIX_STUCK_JOB, fixStuckQuestions, stuckCounts } from "../../src/server/admin/stuck-questions";
import { resolveActor } from "../../src/server/auth/actor";

const s = (v: unknown) => String(v ?? "");
async function stars(repo: Repo): Promise<Map<string, string>> {
  const rows = await repo.findMany("SkillStatus", {}, { select: ["studentId", "skillKey", "status", "answered", "correct", "level"] });
  return new Map(rows.map((r: Row) => [`${s(r.studentId)}|${s(r.skillKey)}|${s(r.level)}`, `${s(r.status)}|${s(r.answered)}|${s(r.correct)}`]));
}
const same = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

void (async () => {
  const out: Record<string, unknown> = {};
  const b = await bigSchool();
  const { repo, schoolId } = b;
  out.dataset = { students: b.students, questions: b.questions, answers: b.answers, copies: b.copies };
  configureRunner({ yieldMs: 0 });

  // ✏️ privatize: every old teacher copy becomes private to its creator (same rule as privatizeOldCopies)
  const p = await peakHeap(() => runJob(repo, PRIVATIZE_JOB, schoolId));
  const copies = await repo.findMany("Question", { externalRef: { contains: "TCOPY-" }, privateToId: { not: null } }, { select: ["privateToId", "createdById"] });
  out.privatize = { peakMb: p.peakMb, heldMb: p.heldMb, ran: p.value.ran, privatized: p.value.state?.progress.privatized, private: copies.length, ownerOk: copies.every((c) => s(c.privateToId) === s(c.createdById)) };

  // ⭐ stars: the job (batches of 25) and the old migrateSchool give the same statuses
  const j = await peakHeap(() => runJob(repo, STARS_JOB, schoolId));
  const viaJob = await stars(repo);
  const report = await repo.findMany("SchoolSetting", { schoolId, key: MIGRATION_KEY }, { select: ["value"] });
  await repo.deleteMany("SkillStatus", {});
  await repo.deleteMany("SchoolSetting", { schoolId, key: MIGRATION_KEY });
  const o = await peakHeap(() => migrateSchool(repo, schoolId));
  const viaOld = await stars(repo);
  out.stars = { peakMb: j.peakMb, heldMb: j.heldMb, oldPeakMb: o.peakMb, ran: j.value.ran, statuses: viaJob.size, sameAsOld: same(viaJob, viaOld), written: j.value.state?.progress.written, oldWritten: o.value.written, report: report.length };

  // 🛟 a restart in the middle: the job resumes from its checkpoint (not from the start) with the same result
  await repo.deleteMany("SkillStatus", {});
  await repo.deleteMany("SchoolSetting", { schoolId, key: "job.skill-stars" });
  await repo.deleteMany("SchoolSetting", { schoolId, key: MIGRATION_KEY });
  let steps = 0;
  const dying: JobDef<string> = { ...STARS_JOB, async step(r, sc, c, st, now) { if (++steps > 3) throw new Error("simulated restart"); return STARS_JOB.step(r, sc, c, st, now); } };
  await runJob(repo, dying, schoolId);
  const saved = await jobState<string>(repo, STARS_JOB, schoolId);
  // the process died: its lease and in-flight mark are left behind
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: "job.skill-stars" }))[0];
  const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  await repo.updateMany("SchoolSetting", { id: row.id }, { updatedBy: "dead-boot", value: { ...v, until: Date.now() - 1000, inFlight: { boot: "dead-boot", at: new Date().toISOString() }, error: null } });
  const firstCursors: (string | null)[] = [];
  const watching: JobDef<string> = { ...STARS_JOB, async step(r, sc, c, st, now) { firstCursors.push(c); return STARS_JOB.step(r, sc, c, st, now); } };
  const resumed = await runJob(repo, watching, schoolId);
  out.resume = { savedCursor: saved?.cursor ?? null, savedBatches: saved?.batches, firstCursor: firstCursors[0] ?? null, ran: resumed.ran, done: resumed.state?.done, crashes: resumed.state?.crashes, sameResult: same(await stars(repo), viaOld), totalBatches: resumed.state?.batches };

  // 🛠 fix stuck: the job and the old whole run end in the same state (a direct run afterwards finds nothing to do)
  const f = await peakHeap(() => runJob(repo, FIX_STUCK_JOB, schoolId));
  const afterJob = await stuckCounts(repo, schoolId);
  const admin = await resolveActor(repo, (await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN" }))[0]);
  const direct = await fixStuckQuestions(repo, admin, { by: "admin" });
  out.fix = { peakMb: f.peakMb, heldMb: f.heldMb, ran: f.value.ran, result: f.value.state?.result, afterJob, afterDirect: await stuckCounts(repo, schoolId), directPublished: direct.published, directClassified: direct.classified };

  // one at a time: three jobs asked for at the same moment never overlap
  const before = runnerPeakConcurrency();
  await Promise.all([runJob(repo, PRIVATIZE_JOB, schoolId, { force: true }), runJob(repo, STARS_JOB, schoolId, { force: true }), runJob(repo, FIX_STUCK_JOB, schoolId, { force: true })]);
  enqueueJob(repo, PRIVATIZE_JOB, schoolId, { force: true });
  enqueueJob(repo, PRIVATIZE_JOB, schoolId, { force: true }); // the same job waiting already: not added twice
  await jobsSettled();
  out.overlap = { peakBefore: before, peak: runnerPeakConcurrency() };

  // the settings race: two runs / two claims of the same row at the same moment → no error, one winner
  let raceError: string | null = null;
  const both = await Promise.all([runJob(repo, PRIVATIZE_JOB, schoolId, { force: true }), runJob(repo, PRIVATIZE_JOB, schoolId, { force: true })]).catch((e) => { raceError = String(e); return []; });
  const claims = await Promise.all([claimSetting(repo, schoolId, "race.test", { a: 1 }), claimSetting(repo, schoolId, "race.test", { a: 2 })]);
  out.race = { error: raceError, outcomes: both.map((x) => x.reason ?? (x.ran ? "ran" : "")), claims, rows: await repo.count("SchoolSetting", { schoolId, key: "race.test" }) };

  // 2 servers: while another LIVE server holds the job's lease, this one skips it; once that lease expired, it takes over
  const lease = (await repo.findMany("SchoolSetting", { schoolId, key: "job.privatize-copies" }))[0];
  const lv = typeof lease.value === "string" ? JSON.parse(lease.value) : lease.value;
  await repo.updateMany("SchoolSetting", { id: lease.id }, { updatedBy: "other-server", value: { ...lv, until: Date.now() + 60_000 } });
  const busy = await runJob(repo, PRIVATIZE_JOB, schoolId, { force: true });
  await repo.updateMany("SchoolSetting", { id: lease.id }, { updatedBy: "other-server", value: { ...lv, until: Date.now() - 1 } });
  const takeover = await runJob(repo, PRIVATIZE_JOB, schoolId, { force: true });
  out.lease = { whileHeld: busy.reason, afterExpiry: takeover.ran };

  // 🧠 the memory gate: above the threshold a job waits (logged once) and goes on when memory is back; too long → paused
  let reads = 0;
  const counting: JobDef<number> = { name: "gate-test", version: "1", async step(_r, _s, c) { const n = (c ?? 0) + 1; return { cursor: n, done: n >= 3 }; } };
  configureRunner({ enforce: true, waitMs: 1, memory: () => (++reads <= 3 ? { rssMb: 999, heapMb: 999 } : { rssMb: 100, heapMb: 50 }) });
  const waited = await runJob(repo, counting, schoolId);
  configureRunner({ enforce: true, waitMs: 1, maxWaitMs: 15, memory: () => ({ rssMb: 999, heapMb: 999 }) });
  const paused = await runJob(repo, { ...counting, name: "gate-test-2" }, schoolId);
  configureRunner("reset");
  out.gate = { waitedDone: waited.state?.done, waits: waited.state?.waits, pausedReason: paused.reason, pausedDone: paused.state?.done };

  console.log(JSON.stringify({ result: out }));
})().catch((e) => { console.error(e); process.exit(1); });
