/**
 * Engine load benchmark (Phase 12): many students practising at the same time
 * through the REAL services (adaptive selection, scoring, mastery update, logging,
 * database writes), measuring the time of every answer.
 *
 *   tsx scripts/load/engine-bench.ts [studentsPerClass=20] [answersEach=20]
 *
 * Runs on the in-memory SQLite test database, so it measures the application's own
 * cost per answer (CPU + queries), not network or MySQL latency. For end-to-end
 * numbers on a real deployment use scripts/load/http-load.ts.
 */
import { performance } from "node:perf_hooks";
import { resolveActor } from "../../src/server/auth/actor";
import { loadSkillItems } from "../../src/server/practice/items";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { demoDatabase, seededRandom } from "../../tests/helpers/db";
import { publishGrade4Bank } from "../../tests/helpers/practice";

const perClass = Number(process.argv[2] ?? 20);
const answersEach = Number(process.argv[3] ?? 20);
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

async function main() {
  const t0 = performance.now();
  const { repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: perClass });
  await publishGrade4Bank(repo);
  const g4 = (await repo.findMany("Grade", { level: 4 }))[0];
  const students = await repo.findMany("Student", { gradeId: g4.id });
  const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
  const skills = ["G4.theme", "G4.context-clues", "G4.central-idea"].map(async (code) => String((await repo.findUnique("Skill", { curriculumId: cur.id, code }))!.id));
  const skillIds = await Promise.all(skills);
  console.log(`setup: ${students.length} Grade 4 students (of ${await repo.count("Student", {})}), ${Math.round(performance.now() - t0)} ms`);

  const times: number[] = [];
  const burst: number[] = []; // each student's first answer: all arrive at the same instant
  const rng = seededRandom(7);
  const started = performance.now();
  await Promise.all(students.map(async (st, k) => {
    const actor = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    const skill = skillIds[k % skillIds.length];
    const items = await loadSkillItems(repo, skill);
    let clock = Date.parse("2026-10-05T07:30:00Z") + k * 1000;
    let view = await startPractice(repo, actor, skill, new Date(clock), rng);
    for (let n = 0; n < answersEach && view.question; n++) {
      const it = items.find((i) => i.questionId === view.question!.questionId)!;
      const right = rng() < 0.7;
      const resp = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.find((o) => o.correct === right)!.label)
        : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer) : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
        : it.type === "ERROR_CORRECTION" ? it.errorIndex : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p) => [p.left, p.right])) : it.sequence;
      const a = performance.now();
      ({ view } = await submitAnswer(repo, actor, { sessionId: view.sessionId, questionId: it.questionId, response: resp }, new Date((clock += 35_000)), rng));
      (n === 0 ? burst : times).push(performance.now() - a);
      await new Promise((r) => setImmediate(r)); // let other students interleave, as concurrent requests would
    }
  }));
  const wall = performance.now() - started;
  times.sort((a, b) => a - b);
  burst.sort((a, b) => a - b);
  const r = (x: number) => x.toFixed(1);
  const total = times.length + burst.length;
  console.log(`answers: ${total} by ${students.length} concurrent students in ${(wall / 1000).toFixed(1)} s`);
  console.log(`steady state, per answer (ms): p50 ${r(pct(times, 50))} · p95 ${r(pct(times, 95))} · p99 ${r(pct(times, 99))} · max ${r(times[times.length - 1])}`);
  console.log(`burst: ${burst.length} answers arriving at the same instant: fastest ${r(burst[0])} ms, slowest ${r(burst[burst.length - 1])} ms (queueing on one process)`);
  console.log(`throughput: ${(total / (wall / 1000)).toFixed(0)} answers/s on one Node process (~${(wall / total).toFixed(1)} ms of work per answer)`);
  console.log(`rows written: ${await repo.count("QuestionAttempt", {})} attempts, ${await repo.count("AdaptiveDecisionLog", {})} decision logs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
