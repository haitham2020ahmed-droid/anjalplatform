/**
 * Simulated practice for report tests and previews: students answer real items
 * through the real practice service, with a deterministic right/wrong pattern.
 * (Same approach as tests/analytics.test.ts.)
 */
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";
import { resolveActor } from "../../src/server/auth/actor";
import { loadSkillItems } from "../../src/server/practice/items";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { ROOT, seededRandom } from "./db";

export async function publishGrade4Bank(repo: SqliteRepo): Promise<void> {
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
}

/** Each listed user practises one skill per month; accuracy varies by student (k). */
export async function simulatePractice(
  repo: SqliteRepo,
  usernames: string[],
  months: { date: string; skill: string }[],
  perSession = 8,
  seed = 4242,
): Promise<void> {
  const rng = seededRandom(seed);
  let k = 0;
  for (const u of usernames) {
    const a = await resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const st = (await repo.findUnique("Student", { id: a.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    for (const { date, skill: code } of months) {
      const skill = String((await repo.findUnique("Skill", { curriculumId: cur.id, code }))!.id);
      let clock = Date.parse(`${date}T08:00:00Z`);
      let view = await startPractice(repo, a, skill, new Date(clock), rng);
      const items = await loadSkillItems(repo, skill);
      for (let n = 0; n < perSession && view.question; n++) {
        const it = items.find((i) => i.questionId === view.question!.questionId)!;
        const right = (n + k) % 3 !== 0;
        const resp = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct === right || (!right && !o.correct)).map((o) => o.label) : it.options.find((o) => o.correct === right)!.label)
          : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer) : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
          : it.type === "ERROR_CORRECTION" ? (right ? it.errorIndex : (it.errorIndex! + 1) % it.segments!.length)
          : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]))
          : right ? it.sequence : [...it.sequence!].reverse();
        ({ view } = await submitAnswer(repo, a, { sessionId: view.sessionId, questionId: it.questionId, response: resp }, new Date((clock += 40_000)), rng));
      }
      if (!view.ended) await repo.updateMany("PracticeSession", { id: view.sessionId }, { endedAt: new Date(clock), endReason: "STUDENT_EXIT", currentQuestionId: null });
    }
    k++;
  }
}
