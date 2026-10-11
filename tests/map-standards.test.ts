/**
 * Question Bank ↔ MAP goal areas by standard (FAKE data only — the Test School): every question joins the MAP
 * goal area of its own standard, even when its skill family was never linked by hand; the Weekly Check then
 * picks from those areas; the admin's suggestions read the questions' standards too.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { groupPools } from "../src/server/map/map-plan";
import { mapLinks } from "../src/server/map/map-more";
import { openWeeklyCheck } from "../src/server/student/weekly-check";
import { teacherRoster } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";

describe("MAP goal areas by standard", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  const made: Record<string, string[]> = {};
  const mc = (stem: string, extra: Record<string, unknown>) => ({ type: "MULTIPLE_CHOICE", stem, whyCorrect: "The text says so.", options: [{ label: "A", text: `right · ${stem}`, correct: true, rationale: null }, { label: "B", text: `wrong · ${stem}`, correct: false, rationale: "Not in the text." }], ...extra });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    await repo.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
    // no family linked by hand: every MAP link must come from the standards
    await repo.updateMany("SkillFamily", {}, { mapGoalAreaId: null });
    const gr = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: gr.id }))[0];
    const skill = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0];
    for (const code of ["RL.4.2", "RL.4.5", "RI.4.2", "RI.4.5", "L.4.4", "L.4.1", "L.4.2"]) {
      if (!(await repo.findMany("Standard", { code: `CCSS.ELA-LITERACY.${code}` })).length) await repo.create("Standard", { framework: "CCSS", code: `CCSS.ELA-LITERACY.${code}`, description: code, gradeLevel: 4, strand: code.split(".")[0], isActive: true });
      made[code] = [];
      for (let i = 0; i < 3; i++) made[code].push(await createDraft(repo, admin, mc(`${code} q${i}`, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.${code}`, level: 3 + i }) as never));
    }
    await repo.updateMany("Question", { id: { in: Object.values(made).flat() } }, { status: "PUBLISHED" });
  });

  test("each question counts for its own standard's MAP goal area", async () => {
    const { pools, skills } = await groupPools(repo, admin.schoolId!, 4);
    const has = (g: string, code: string) => made[code].every((id) => (pools.get(g as never) ?? []).some((q) => q.id === id));
    assert.ok(has("LIT", "RL.4.2") && has("LIT", "RL.4.5"), "RL → Literary Text");
    assert.ok(has("INFO", "RI.4.2") && has("INFO", "RI.4.5"), "RI → Informational Text");
    assert.ok(has("VOCAB", "L.4.4"), "L.4.4 → Vocabulary");
    assert.ok(has("GRAMMAR", "L.4.1"), "L.4.1 → Grammar & Usage");
    assert.ok(has("MECH", "L.4.2"), "L.4.2 → Mechanics");
    const all = [...pools.values()].flat().map((q) => q.id);
    assert.equal(all.length, new Set(all).size, "a question sits in one area only");
    assert.ok(skills.size >= 1, "the skill is listed under a MAP area");
    for (const q of [...pools.values()].flat()) assert.ok(q.rit > 100 && q.rit < 300, "every question has a RIT");
  });

  test("the Weekly Check picks from the MAP goal areas (one per area)", async () => {
    const r = await teacherRoster(repo, teacher);
    const grade4 = r.find((c) => /4/.test(c.name))!;
    const st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: grade4.students[0].id }))!.userId }))!);
    const href = await openWeeklyCheck(repo, st);
    assert.ok(href);
    const row = (await repo.findMany("WeeklyCheck", { studentId: st.studentId }))[0];
    const a = (await repo.findUnique("Assignment", { id: row.assignmentId }))!;
    const ids = (await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId })).map((x) => String(x.questionId));
    assert.equal(ids.length, 8, "Update 39B: 8 items (a result that can move a tier needs 8+)");
    const { pools } = await groupPools(repo, admin.schoolId!, 4);
    const groups = new Set(ids.map((id) => [...pools.entries()].find(([, l]) => l.some((q) => q.id === id))?.[0]));
    assert.ok(!groups.has(undefined), "every question comes from a MAP goal area");
    assert.ok(groups.size >= 4, `spread over the areas (${[...groups].join(", ")})`);
  });

  test("the admin's suggestion reads the questions' standards when the skill has none", async () => {
    const { rows } = await mapLinks(repo, admin);
    const withQs = rows.filter((r) => r.questions > 0 && !r.areaCode);
    assert.ok(withQs.length >= 1);
    assert.ok(withQs.every((r) => r.suggested), "every unlinked skill with questions gets a suggestion");
  });
});
