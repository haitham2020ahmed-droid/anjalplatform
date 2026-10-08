import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { assignFromMap } from "../src/server/curriculum-map/levels";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";

describe("📘 Concept Vocabulary: a place without map levels is adaptive when its questions span levels", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string;
  const mk = async (code: string, level: number, i: number) => createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `Vocabulary ${code} item ${i} with the word number ${i}`, level, whyCorrect: "x", mapNodeCode: code, options: [{ label: "A", text: `right ${code}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${code}${i}`, correct: false, rationale: "n" }] });
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    classId = (await teacherRoster(repo, teacher))[0].id;
    const ids: string[] = [];
    for (const [i, lv] of [3, 3, 4, 4, 6, 6].entries()) ids.push(await mk("G4.U1.TS1.CV", lv, i));      // Below, On, Above
    for (const i of [0, 1, 2]) ids.push(await mk("G4.U1.TS2.CV", 4, i));                               // all On
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  });

  test("mixed difficulties → one adaptive set", async () => {
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS1.CV" });
    const a = await repo.findUnique("Assignment", { id: r.groups[0].assignmentId });
    assert.match(String(a!.title), /Concept Vocabulary \(adaptive: Below → On → Above\)/);
    assert.ok(r.notes.some((n) => /Adaptive by difficulty/.test(n)));
  });

  test("one difficulty only → a fixed set (as before)", async () => {
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS2.CV" });
    const a = await repo.findUnique("Assignment", { id: r.groups[0].assignmentId });
    assert.doesNotMatch(String(a!.title), /adaptive/);
  });
});
