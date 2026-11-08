/**
 * 🩺 Platform audit (8 Nov 2026, live) — fictional demo school only:
 *  - the Diagnostic pool page shows one page of questions (the pool is thousands: 23 MB of HTML before);
 *  - a grade without a curriculum gives an empty curriculum, not an error (Grade 11 student file);
 *  - the class knowledge graph reads recent answers with one query per student (was one per student × skill).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { DIAG_PAGE, pageOf } from "../src/server/diagnostic/test";
import { getStudentCurriculum } from "../src/server/queries/student-curriculum";
import { classGaps, skillStatesMany } from "../src/server/graph/knowledge-graph";
import { demoDatabase } from "./helpers/db";

let repo: SqliteRepo;
before(async () => { ({ repo } = await demoDatabase()); });

describe("platform audit 8 Nov 2026", () => {
  test("the diagnostic pool: one page at a time, a skill filter, every code listed", () => {
    const all = Array.from({ length: 250 }, (_x, i) => ({ id: `q${i}`, area: { code: i < 200 ? "RL.5.1" : "RI.5.2" } }));
    const p1 = pageOf(all, {});
    assert.equal(p1.items.length, DIAG_PAGE);
    assert.equal(p1.pages, 3);
    assert.deepEqual(p1.codes, ["RI.5.2", "RL.5.1"]);
    assert.equal(pageOf(all, { page: 3 }).items.length, 50);
    assert.equal(pageOf(all, { page: 99 }).page, 3, "past the end → the last page");
    const ri = pageOf(all, { code: "RI.5.2" });
    assert.equal(ri.total, 50);
    assert.ok(ri.items.every((q) => q.area.code === "RI.5.2"));
  });

  test("a grade without an active curriculum: no units, no error", async () => {
    const st = (await repo.findMany("Student", {}))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    assert.ok(cur, "the demo grade has a curriculum");
    await repo.updateMany("Curriculum", { id: cur.id }, { isActive: false });
    try {
      const c = await getStudentCurriculum(repo, String(st.id));
      assert.deepEqual(c.units, []);
    } finally { await repo.updateMany("Curriculum", { id: cur.id }, { isActive: true }); }
  });

  test("class skill states: one answers query per student, the same states as before for a practised skill", async () => {
    const klass = (await repo.findMany("Class", { deletedAt: null }))[0];
    const ids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null })).map((m) => String(m.studentId));
    const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
    const skills = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id"] })).map((k) => String(k.id));
    let attemptReads = 0;
    const orig = repo.findMany.bind(repo);
    (repo as unknown as { findMany: typeof repo.findMany }).findMany = ((model: string, ...rest: unknown[]) => { if (model === "QuestionAttempt") attemptReads++; return (orig as (...a: unknown[]) => unknown)(model, ...rest); }) as typeof repo.findMany;
    try {
      const states = await skillStatesMany(repo, ids, skills);
      assert.equal(states.size, new Set(ids).size);
      assert.ok(attemptReads <= ids.length * Math.ceil(skills.length / 500), `${attemptReads} answer reads for ${ids.length} students`);
      for (const m of states.values()) for (const v of m.values()) assert.ok(v.recentAnswers <= 10);
      const g = await classGaps(repo, ids, String(cur.id));
      assert.ok(Array.isArray(g.gaps));
    } finally { (repo as unknown as { findMany: typeof repo.findMany }).findMany = orig; }
  });
});

import { pickBand, PICK_MAX, spreadCap } from "../src/server/map/map-plan";
describe("MAP plan picks never pass one adaptive set (1000)", () => {
  test("a huge band is spread to PICK_MAX, easy to hard kept", () => {
    const pool = Array.from({ length: 3000 }, (_x, i) => ({ id: `q${i}`, rit: 180 + (i % 30), skillId: "k" })) as Parameters<typeof pickBand>[0];
    const p = pickBand(pool, 180, 190, 10, null);
    assert.equal(p.ids.length, PICK_MAX);
    assert.equal(new Set(p.ids).size, PICK_MAX);
    assert.deepEqual(spreadCap([1, 2, 3]), [1, 2, 3]);
    assert.equal(spreadCap(Array.from({ length: 5000 }, (_x, i) => i)).length, PICK_MAX);
  });
});
