/**
 * 🇸🇦 NAFS audit fixes (8 Nov 2026) — fictional demo school, in-memory database:
 *  - an online attempt with no answer at all is never handed in by the time-out (no 0 % in the averages, nothing to
 *    mark), and one an earlier version finished that way is reopened; an attempt WITH answers is still finished;
 *  - every page that reads results by class applies the same rule (finishLateForClasses);
 *  - mastery needs 5 answers per skill: questionsForMastery, the practice limit fits all 13 standards;
 *  - the booklet files: no "All / None of the above" key, and a corrected file updates the platform question.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, saveNafsQuestion } from "../src/server/nafs/bank";
import { nafsClasses, saveNafsTest } from "../src/server/nafs/tests";
import { blankAttempt, finishLateForClasses, nafsTestReport } from "../src/server/nafs/reports";
import { MAX_PRACTICE_QUESTIONS, questionsForMastery } from "../src/server/nafs/practice";
import { loadBookletsInto, type Booklet } from "../src/server/nafs/booklets";
import { demoDatabase } from "./helpers/db";

let repo: SqliteRepo; let teacher: Actor; let klassId = ""; let ids: string[] = []; let testId = ""; let students: string[] = [];
const T0 = new Date("2026-11-01T08:00:00Z"), NOW = new Date("2026-11-01T12:00:00Z");

before(async () => {
  ({ repo } = await demoDatabase());
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  teacher = admin;
  await ensureNafsFramework(repo);
  const k = (await nafsClasses(repo, admin))[0];
  klassId = k.id; students = k.students.map((x) => x.id);
  // four students in the class (the demo class may have fewer): add members from the school
  for (const x of await repo.findMany("Student", { schoolId: admin.schoolId })) {
    if (students.length >= 4) break;
    if (students.includes(String(x.id))) continue;
    await repo.create("ClassMembership", { classId: klassId, studentId: x.id, joinedAt: T0 });
    students.push(String(x.id));
  }
  for (let i = 0; i < 4; i++) ids.push((await saveNafsQuestion(repo, admin, { nafsCode: "NAFS.RC.MAIN", standard: "MOE.S04", difficulty: 2, stem: `Audit question ${i + 1}?`, options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`], correct: 1 })).id);
  nafsBankChanged(repo, admin.schoolId!);
  testId = await saveNafsTest(repo, admin, { title: "Audit test", mode: "MANUAL", questionIds: ids, timeLimitMin: 30 });
  await repo.create("NafsTestClass", { testId, classId: klassId, timeLimitMin: 30, createdById: admin.userId, createdAt: T0 });
  const row = (sid: string, answers: (number | null)[], submittedAt: Date | null) => repo.create("NafsResult", { testId, classId: klassId, studentId: sid, source: "ONLINE", answers, correct: 0, points: 0, maxPoints: 4, startedAt: T0, submittedAt, updatedAt: T0 });
  await row(students[0], [null, null, null, null], null);                        // opened, answered nothing, time over
  await row(students[1], [1, 1, 0, null], null);                                 // answered 3, never handed in
  await row(students[2], [null, null, null, null], new Date("2026-11-01T09:00:00Z")); // an earlier version's blank time-out
  await row(students[3], [1, 1, 1, 1], new Date("2026-11-01T08:20:00Z"));         // handed in, 4/4
});

describe("NAFS audit 8 Nov 2026", () => {
  test("blank attempts: not handed in, reopened if an earlier version did; answered ones finished", async () => {
    assert.equal(blankAttempt({ answers: [null, null], texts: {} }), true);
    assert.equal(blankAttempt({ answers: [null, 2], texts: {} }), false);
    assert.equal(blankAttempt({ answers: [null], texts: { "0": "  my answer " } }), false);
    await finishLateForClasses(repo, [klassId], NOW);
    const by = async (i: number) => (await repo.findMany("NafsResult", { testId, studentId: students[i] }))[0];
    assert.equal((await by(0)).submittedAt, null, "blank: stays 'started, no answers'");
    assert.ok((await by(1)).submittedAt, "answered: finished by the time-out");
    assert.equal(Number((await by(1)).correct), 2);
    assert.equal((await by(2)).submittedAt, null, "an earlier blank time-out is reopened");
    assert.ok((await by(3)).submittedAt, "handed in by the student: unchanged");
    const r = await nafsTestReport(repo, teacher, testId, klassId, NOW);
    assert.equal(r.taken, 2, "only the two real attempts count");
    assert.equal(r.avgPct, 75, "mean of 50 % and 100 % (no 0 % from blank attempts)");
    assert.ok(r.notTaken.filter((x) => x.started).length >= 2, "the blank ones are listed as started");
  });

  test("mastery needs 5 answers per skill; the practice limit fits all 13 standards", () => {
    assert.equal(questionsForMastery(13), 65);
    assert.ok(MAX_PRACTICE_QUESTIONS >= questionsForMastery(13));
  });

  test("booklet files: no 'All / None of the above' as an answer or an option", () => {
    const dir = join(process.cwd(), "data/nafs/booklets");
    for (const f of readdirSync(dir).filter((x) => /^NB-\d+\.json$/.test(x))) {
      for (const q of JSON.parse(readFileSync(join(dir, f), "utf8")).questions) {
        for (const o of q.options ?? []) assert.ok(!/\b(all|none) of the above\b/i.test(o), `${f} Q${q.n}: ${o}`);
      }
    }
  });

  test("a corrected booklet file updates the platform question (no duplicate)", async () => {
    const q = { n: 1, standard: "MOE.S13", nafs: "NAFS.IAE.EVAL", pirls: "P4" as const, type: "MCQ" as const, stem: "Old stem?", options: ["one", "two", "three", "All of the above"], answer: 3, model: "", rubric: [], why: "old", difficulty: 2 as const };
    const b = { code: "NB-999", title: "Audit booklet", kind: "INFORMATIONAL", genre: "expository", passage: "A short passage.\n\nSecond paragraph.", questions: [q] } as unknown as Booklet;
    const first = await loadBookletsInto(repo, teacher.schoolId!, [b], teacher.userId, NOW);
    assert.equal(first.added, 1);
    const fixed = { ...b, questions: [{ ...q, stem: "New stem?", options: ["one", "two", "three", "four"], answer: 1, why: "new" }] } as unknown as Booklet;
    const again = await loadBookletsInto(repo, teacher.schoolId!, [fixed], teacher.userId, NOW);
    assert.deepEqual([again.added, again.updated], [0, 1]);
    const row = (await repo.findMany("Question", { externalRef: "NB-999#1" }));
    assert.equal(row.length, 1, "updated in place");
    assert.equal(String(row[0].stem), "New stem?");
    const opts = (await repo.findMany("QuestionOption", { questionId: row[0].id })).sort((x, y) => Number(x.order) - Number(y.order));
    assert.deepEqual(opts.map((o) => String(o.text)), ["one", "two", "three", "four"]);
    assert.equal(opts.findIndex((o) => o.isCorrect === true || o.isCorrect === 1), 1);
    assert.equal((await loadBookletsInto(repo, teacher.schoolId!, [fixed], teacher.userId, NOW)).updated, 0, "unchanged: nothing written");
  });
});
