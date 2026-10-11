/**
 * Reading Strategy Survey (FAKE data only — the Test School): 18 original items (6 before / 6 during / 6 after),
 * scoring by phase and strategy, once per term, the teacher opening it for a class, the class profile and the
 * suggested strategy groups, and who may do what.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { classStrategyProfile, myStrategySurvey, openStrategySurvey, PHASES, scoreStrategySurvey, STRATEGY_ITEMS, STRATEGY_LABEL, submitStrategySurvey, type ReadingStrategy } from "../src/server/surveys/strategy";
import { demoDatabase } from "./helpers/db";

const OCT = new Date("2026-10-05T08:00:00Z"), NOV = new Date("2026-11-20T08:00:00Z"), JAN = new Date("2027-01-12T08:00:00Z");
const allBest = () => Object.fromEntries(STRATEGY_ITEMS.map((it) => [it.id, it.best]));
const wrong = (best: number) => (best + 1) % 4;
/** every answer effective except the items of these strategies */
const missing = (...strategies: ReadingStrategy[]) => Object.fromEntries(STRATEGY_ITEMS.map((it) => [it.id, strategies.includes(it.strategy) ? wrong(it.best) : it.best]));

describe("Reading Strategy Survey · items and scoring", () => {
  test("18 original items: 6 per phase, 4 choices, one effective strategy each, every strategy at least twice", () => {
    assert.equal(STRATEGY_ITEMS.length, 18);
    assert.equal(new Set(STRATEGY_ITEMS.map((it) => it.id)).size, 18);
    for (const p of PHASES) assert.equal(STRATEGY_ITEMS.filter((it) => it.phase === p).length, 6, p);
    for (const it of STRATEGY_ITEMS) {
      assert.equal(it.choices.length, 4);
      assert.ok(it.best >= 0 && it.best <= 3 && STRATEGY_LABEL[it.strategy]);
      assert.equal(new Set(it.choices).size, 4, `${it.id}: distinct choices`);
    }
    for (const k of Object.keys(STRATEGY_LABEL)) assert.ok(STRATEGY_ITEMS.filter((it) => it.strategy === k).length >= 2, k);
    assert.ok(new Set(STRATEGY_ITEMS.map((it) => it.best)).size === 4, "the effective choice is not always in the same place");
  });

  test("scoring: % effective per phase; weak strategies (weakest first)", () => {
    const top = scoreStrategySurvey(allBest());
    assert.deepEqual([top.BEFORE, top.DURING, top.AFTER, top.total], [100, 100, 100, 100]);
    assert.deepEqual(top.weakStrategies, []);
    const r = scoreStrategySurvey(missing("SUMMARIZE", "PREVIEW"));
    assert.deepEqual([r.BEFORE, r.DURING, r.AFTER], [67, 100, 50]);
    assert.deepEqual(r.weakStrategies.sort(), ["PREVIEW", "SUMMARIZE"]);
    assert.equal(r.byStrategy.SUMMARIZE, 0);
    // one of two FIX_UP-style misses: D1 only → 2 of 3 fix-up items right → not weak
    const one = scoreStrategySurvey({ ...allBest(), D1: wrong(STRATEGY_ITEMS.find((x) => x.id === "D1")!.best) });
    assert.equal(one.byStrategy.FIX_UP, 67);
    assert.deepEqual(one.weakStrategies, []);
    const none = scoreStrategySurvey({});
    assert.equal(none.total, 0);
    assert.equal(none.weakStrategies.length, Object.keys(STRATEGY_LABEL).length);
  });
});

describe("Reading Strategy Survey · students, teachers, groups", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher, other] = await Promise.all(["test.admin", "test.teacher.1", "test.teacher.3"].map(a));
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
  });

  test("the teacher opens it for their class; the students are notified; others cannot", async () => {
    const n = await openStrategySurvey(repo, teacher, classId, OCT);
    assert.equal(n, roster.length);
    const st = await student(roster[0].id);
    const users = (await repo.findMany("Student", { id: roster[0].id }))[0];
    assert.ok((await repo.findMany("Notification", { userId: users.userId })).some((x) => String(x.link) === "/student/strategy-survey"));
    assert.equal((await myStrategySurvey(repo, st, OCT)).openedByTeacher, true);
    assert.equal((await myStrategySurvey(repo, st, JAN)).openedByTeacher, false, "the open flag belongs to its term");
    await assert.rejects(openStrategySurvey(repo, other, classId, OCT), ForbiddenError);
    await assert.rejects(openStrategySurvey(repo, st, classId, OCT), ForbiddenError);
  });

  test("students take it once per term; every item must be answered; only students submit", async () => {
    const s0 = await student(roster[0].id);
    await assert.rejects(submitStrategySurvey(repo, s0, { B1: 1 }, OCT), ValidationError);
    const r = await submitStrategySurvey(repo, s0, missing("SUMMARIZE", "VISUALIZE"), OCT);
    assert.deepEqual(r.weakStrategies.sort(), ["SUMMARIZE", "VISUALIZE"]);
    const row = (await repo.findMany("StrategySurvey", { studentId: roster[0].id }))[0];
    const stored = (typeof row.result === "string" ? JSON.parse(String(row.result)) : row.result) as { BEFORE: number; DURING: number; AFTER: number; weakStrategies: string[] };
    assert.deepEqual([stored.BEFORE, stored.DURING, stored.AFTER], [100, 67, 50]);
    await assert.rejects(submitStrategySurvey(repo, s0, allBest(), NOV), ValidationError, "once per term");
    assert.ok((await myStrategySurvey(repo, s0, NOV)).taken);
    assert.equal((await myStrategySurvey(repo, s0, JAN)).taken, null, "a new term");
    await assert.rejects(submitStrategySurvey(repo, teacher, allBest(), OCT), ForbiddenError);
    await assert.rejects(myStrategySurvey(repo, teacher, OCT), ForbiddenError);
    await submitStrategySurvey(repo, await student(roster[1].id), missing("SUMMARIZE"), OCT);
    await submitStrategySurvey(repo, await student(roster[2].id), allBest(), OCT);
  });

  test("class profile and suggested strategy groups (students per weak strategy)", async () => {
    const p = await classStrategyProfile(repo, teacher, classId, NOV);
    assert.equal(p.taken, 3); assert.equal(p.roster, roster.length);
    assert.equal(p.notTaken.length, roster.length - 3);
    assert.ok(p.opened, "opened this term");
    assert.equal(p.groups[0].strategy, "SUMMARIZE", "the biggest group first");
    assert.deepEqual(p.groups[0].students.map((x) => x.id).sort(), [roster[0].id, roster[1].id].sort());
    assert.deepEqual(p.groups.find((g) => g.strategy === "VISUALIZE")!.students.map((x) => x.id), [roster[0].id]);
    assert.ok(p.groups.every((g) => g.tip.length > 20));
    assert.equal(p.phases.find((x) => x.phase === "BEFORE")!.pct, 100);
    assert.equal(p.strategies.find((x) => x.strategy === "SUMMARIZE")!.weakCount, 2);
    assert.ok((await classStrategyProfile(repo, admin, classId, NOV)).taken === 3, "admins see every class");
    await assert.rejects(classStrategyProfile(repo, other, classId, NOV), ForbiddenError);
    await assert.rejects(classStrategyProfile(repo, await student(roster[0].id), classId, NOV), ForbiddenError);
  });

  test("UI pages are English only and the actions check the session", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/app/student/strategy-survey/page.tsx", "src/app/teacher/strategy-groups/page.tsx", "src/server/surveys/strategy-items.ts"]) assert.ok(!/[؀-ۿ]/.test(readFileSync(f, "utf8")), `${f}: no Arabic text`);
    for (const f of ["src/app/student/strategy-survey/actions.ts", "src/app/teacher/strategy-groups/actions.ts"]) assert.match(readFileSync(f, "utf8"), /requireActor\(/);
  });
});
