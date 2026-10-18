/**
 * Simultaneous requests (FAKE data only — the Test School): a double click on Start or on an answer, and a
 * whole class opening the same plan part in the same second, never create anything twice.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { rightAnswer, seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { sendCurriculumPlan, openPlanItem } from "../src/server/curriculum-map/curriculum-plan";
import { skillPlanForStudent } from "../src/server/curriculum-map/plans";
import { withLock } from "../src/server/lib/key-lock";
import { demoDatabase } from "./helpers/db";

describe("simultaneous requests", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string }[];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin] = await Promise.all(["test.teacher.1", "test.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const ids: string[] = [];
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 8; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${lv} q ${i}`, level: 4, whyCorrect: "Because.", mapNodeCode: `G4.U1.TS1.ACS.${lv}`, options: [{ label: "A", text: `r${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `w${lv}${i}`, correct: false, rationale: "No." }] } as never));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
  });

  test("the lock runs the same key one at a time and different keys together", async () => {
    const order: string[] = [];
    const job = (k: string, tag: string) => withLock(k, async () => { order.push(`${tag}+`); await new Promise((r) => setImmediate(r)); order.push(`${tag}-`); });
    await Promise.all([job("a", "1"), job("a", "2"), job("b", "3")]);
    assert.ok(order.indexOf("1-") < order.indexOf("2+"), "same key waits");
    assert.ok(order.indexOf("3+") < order.indexOf("1-"), "another key does not wait");
  });

  test("a whole class opens the same part at once: one set; double Start: one session; double answer: one answer", async () => {
    const { planId } = await sendCurriculumPlan(repo, teacher, { classId, targetCorrect: 5 });
    const sts = await Promise.all(roster.slice(0, 12).map((x) => student(x.id)));
    const item = (await skillPlanForStudent(repo, sts[0], planId)).places.find((p) => p.code === "G4.U1.TS1.ACS")!;
    const hrefs = await Promise.all(sts.map((st) => openPlanItem(repo, st, planId, item.itemId)));
    assert.equal(new Set(hrefs).size, 1, "everyone in the same class set");
    assert.equal((await repo.findMany("Assignment", { curriculumPlanId: planId })).length, 1);
    const aid = hrefs[0].split("/")[2];
    const [v1, v2] = await Promise.all([startQuiz(repo, sts[0], aid), startQuiz(repo, sts[0], aid)]);
    assert.equal(v1.sessionId, v2.sessionId);
    assert.equal((await repo.findMany("PracticeSession", { studentId: roster[0].id, assignmentId: aid })).length, 1);
    const it = (await loadQuestionItems(repo, [v1.question!.questionId]))[0];
    const tries = await Promise.allSettled([submitQuizAnswer(repo, sts[0], { assignmentId: aid, questionId: it.questionId, response: rightAnswer(it) }), submitQuizAnswer(repo, sts[0], { assignmentId: aid, questionId: it.questionId, response: rightAnswer(it) })]);
    // r68: the second click is never counted — it gets the first answer's saved result back (a retry after a lost reply
    // must not leave the player with an error)
    const done = tries.filter((t) => t.status === "fulfilled").map((t) => (t as PromiseFulfilledResult<Awaited<ReturnType<typeof submitQuizAnswer>>>).value);
    assert.equal(done.filter((r) => r.feedback.replayed).length, 1, "the second click is a replay");
    assert.equal((await repo.findMany("QuestionAttempt", { sessionId: v1.sessionId })).length, 1);
  });
});
