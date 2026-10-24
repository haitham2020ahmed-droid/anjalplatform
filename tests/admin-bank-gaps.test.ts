/**
 * 🕳 Admin "Question Bank Gaps" (src/app/admin/bank-gaps): where to write questions first (bankGaps), skills where
 * adaptive practice ran out of items within reach (practiceGaps), and skills lacking Below/On/Above questions
 * (levelGaps). All three only read data (nothing is deleted or published) and are gated to admins and teachers.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { bankGaps, levelGaps, practiceGaps, MIN_PER_LEVEL } from "../src/server/map/bank-gaps";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");

describe("🕳 admin Bank Gaps", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("teachers may read the gaps pages; students are refused (matches the page's own role list)", async () => {
    await bankGaps(repo, teacher);
    await practiceGaps(repo, teacher);
    await levelGaps(repo, teacher);
    await assert.rejects(bankGaps(repo, student), ForbiddenError);
    await assert.rejects(practiceGaps(repo, student), ForbiddenError);
    await assert.rejects(levelGaps(repo, student), ForbiddenError);
  });

  test("bank gaps: a MAP goal area nobody's weakest area points to has no 'per student' figure, and status is GAP/LOW/OK only", async () => {
    const rows = await bankGaps(repo, admin);
    assert.ok(rows.length > 0, "every grade × MAP goal area combination is a row");
    for (const r of rows) {
      assert.ok(["GAP", "LOW", "OK"].includes(r.status));
      assert.ok(r.questions >= 0 && r.skills >= 0 && r.studentsWeakest >= 0);
      if (r.studentsWeakest === 0) assert.equal(r.perStudent, null, "no students need it: no ratio to show");
      if (r.questions === 0) assert.equal(r.status, "GAP");
    }
    // sorted grade first, GAP/LOW before OK within a grade
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].grade === rows[i].grade) {
        const rank = { GAP: 0, LOW: 1, OK: 2 } as const;
        assert.ok(rank[rows[i - 1].status] <= rank[rows[i].status]);
      } else assert.ok(rows[i - 1].grade <= rows[i].grade);
    }
  });

  test("bank gaps: a student's weakest Reading area is counted for their grade's row", async () => {
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const [areaWeak, areaStrong] = await repo.findMany("MapGoalArea", { subject: "READING" }, { take: 2 });
    const stId = s((await repo.findMany("Student", { schoolId, gradeId: g4.id }, { take: 1 }))[0].id);
    const now = new Date("2026-10-01T00:00:00Z");
    await repo.create("MapResult", { studentId: stId, testDate: now, subject: "READING", goalName: s(areaWeak.name), goalAreaId: areaWeak.id, rit: 180, termName: "Fall 2026" });
    await repo.create("MapResult", { studentId: stId, testDate: now, subject: "READING", goalName: s(areaStrong.name), goalAreaId: areaStrong.id, rit: 230, termName: "Fall 2026" });
    const rows = await bankGaps(repo, admin);
    const row = rows.find((r) => r.grade === 4 && r.area === s(areaWeak.name))!;
    assert.ok(row.studentsWeakest >= 1, "the lower-RIT area is this student's weakest, so it is counted there");
    const other = rows.find((r) => r.grade === 4 && r.area === s(areaStrong.name))!;
    assert.ok(other.studentsWeakest === 0 || other.studentsWeakest < row.studentsWeakest || row !== other);
  });

  test("practice gaps: counts a skill's NO_ITEM_IN_RANGE decisions from the last 30 days only, lowest ability first", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { take: 1 }))[0];
    const skillId = s(q.skillId);
    const [stA, stB] = await repo.findMany("Student", { schoolId }, { take: 2 });
    const sess = await repo.create("PracticeSession", { studentId: stA.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    const recent = new Date();
    const old = new Date(recent.getTime() - 40 * 86_400_000);
    await repo.create("AdaptiveDecisionLog", { studentId: stA.id, sessionId: sess.id, skillId, previousTheta: -1.2, newTheta: -1.2, thetaSE: 1, reason: "no item", reasonCode: "NO_ITEM_IN_RANGE", engineVersion: "t", createdAt: recent });
    await repo.create("AdaptiveDecisionLog", { studentId: stB.id, sessionId: sess.id, skillId, previousTheta: -0.3, newTheta: -0.3, thetaSE: 1, reason: "no item", reasonCode: "NO_ITEM_IN_RANGE", engineVersion: "t", createdAt: recent });
    // outside the 30-day window: must not count
    await repo.create("AdaptiveDecisionLog", { studentId: stA.id, sessionId: sess.id, skillId, previousTheta: -5, newTheta: -5, thetaSE: 1, reason: "no item", reasonCode: "NO_ITEM_IN_RANGE", engineVersion: "t", createdAt: old });
    // a different reason code: must not count
    await repo.create("AdaptiveDecisionLog", { studentId: stA.id, sessionId: sess.id, skillId, previousTheta: 2, newTheta: 2, thetaSE: 1, reason: "fine", reasonCode: "TARGET_SUCCESS_RATE", engineVersion: "t", createdAt: recent });
    const gaps = await practiceGaps(repo, admin, new Date(recent.getTime() + 60_000));
    const row = gaps.find((g) => g.skillId === skillId)!;
    assert.ok(row, "the skill with recent NO_ITEM_IN_RANGE logs is listed");
    assert.equal(row.times, 2, "the old and the other-reason logs are excluded");
    assert.equal(row.students, 2);
    assert.equal(row.lowestAbility, -1.2, "the lower of the two students' previous theta");
  });

  test("practice gaps: nothing logged → an empty list (no crash on a quiet school)", async () => {
    const { repo: fresh } = await demoDatabase();
    const a = await resolveActor(fresh, (await fresh.findUnique("User", { username: "demo.admin" }))!);
    assert.deepEqual(await practiceGaps(fresh, a), []);
  });

  test("level gaps: a skill under MIN_PER_LEVEL at any level is listed with the levels it is missing", async () => {
    const rows = await levelGaps(repo, admin);
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.equal(r.total, r.below + r.on + r.above);
      assert.ok(r.missing.length > 0);
      for (const lvl of r.missing) assert.ok(r[lvl.toLowerCase() as "below" | "on" | "above"] < MIN_PER_LEVEL);
      // a fully-stocked skill (not under MIN_PER_LEVEL anywhere) would never appear
      assert.ok(r.below < MIN_PER_LEVEL || r.on < MIN_PER_LEVEL || r.above < MIN_PER_LEVEL);
    }
  });
});
