/**
 * Update 24 (FAKE data only — the Test School): Connections audit, Skill Hub, global search, classes at a glance.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { connections } from "../src/server/admin/connections";
import { skillHub } from "../src/server/skills/hub";
import { globalSearch } from "../src/server/search";
import { classesAtAGlance } from "../src/server/insights/overview";
import { masterSkills } from "../src/server/skills/master";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { demoDatabase } from "./helpers/db";

describe("Update 24 · everything joined up", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher, other] = await Promise.all([a("test.admin"), a("test.teacher.1"), a("test.teacher.3")]);
  });

  test("connections: every stage of the thread, shares within totals, the missing continuum flagged", async () => {
    const v = await connections(repo, admin);
    assert.deepEqual(v.stages.map((s) => s.key), ["MAP_PLACES", "SKILLS", "QUESTIONS", "MAP", "CONTINUUM", "PEOPLE", "PLANS"]);
    for (const c of v.stages.flatMap((s) => s.checks)) assert.ok(c.ok >= 0 && c.ok <= c.total, c.id);
    assert.equal(v.stages.find((s) => s.key === "CONTINUUM")!.checks[0].health, "BAD");
    assert.equal(v.stages.find((s) => s.key === "PEOPLE")!.checks.find((c) => c.id === "st-class")!.ok, 200);
    assert.ok(v.score >= 0 && v.score <= 100);
    await assert.rejects(connections(repo, teacher), ForbiddenError);
  });

  test("skill hub: questions by level, MAP area, standards, students of the teacher's classes; unknown skills refused", async () => {
    const k = (await masterSkills(repo, admin.schoolId!, { grade: 4, withQuestionsOnly: true }))[0];
    const h = await skillHub(repo, teacher, k.id);
    assert.equal(h.grade, 4);
    assert.equal(h.questions.byLevel.Below + h.questions.byLevel.On + h.questions.byLevel.Above, h.questions.published);
    assert.ok(h.area);
    assert.equal(h.students.mastered + h.students.practising + h.students.notStarted, h.students.total);
    await assert.rejects(skillHub(repo, teacher, "no-such-skill"), ForbiddenError);
  });

  test("search: a teacher finds only their own students; skills and classes by name", async () => {
    const mine = await globalSearch(repo, teacher, "Test Student");
    const all = await globalSearch(repo, admin, "Test Student");
    assert.ok(mine.filter((h) => h.kind === "student").length <= all.filter((h) => h.kind === "student").length);
    assert.ok((await globalSearch(repo, teacher, "theme")).some((h) => h.kind === "skill" && h.href.startsWith("/skill/")));
    assert.deepEqual(await globalSearch(repo, teacher, "x"), []);
  });

  test("classes at a glance: a teacher sees their classes with MAP split and plans; an admin sees every class", async () => {
    const t = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    const classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    const sts = await repo.findMany("Student", { id: { in: ids } });
    const H = [...MAP_TEMPLATE_HEADERS];
    await importMapScores(repo, admin, [H, ...sts.map((st, i) => { const r = H.map(() => ""); r[0] = String(st.studentNumber); r[H.indexOf("Reading Fall RIT")] = String(170 + i * 2); return r; })], 2026);
    const rows = await classesAtAGlance(repo, teacher);
    const row = rows.find((r) => r.id === classId)!;
    assert.equal(row.map.scored, ids.length);
    assert.equal(row.map.below + row.map.on + row.map.above, ids.length);
    assert.ok(row.plans.drafts > 0, "plans were drafted from the scores");
    assert.ok(!(await classesAtAGlance(repo, other)).some((r) => r.id === classId));
    assert.equal((await classesAtAGlance(repo, admin)).length, 6);
  });
});
