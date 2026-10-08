import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { attachmentNodes } from "../src/server/curriculum-map/questions";
import { createDraft, listQuestions } from "../src/server/admin/questions";
import { demoDatabase } from "./helpers/db";

describe("🧭 Curriculum Map place picker: step by step, and the filter by any step", () => {
  let repo: SqliteRepo; let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
  });

  test("every place's path has one label per code step (what the picker shows at each step)", async () => {
    const places = await attachmentNodes(repo, admin.schoolId!);
    assert.ok(places.length > 300);
    for (const p of places) assert.equal(p.path.split(" › ").length, p.code.split(".").length, `${p.code} / ${p.path}`);
    const units = new Set(places.filter((p) => p.code.startsWith("G5.")).map((p) => p.code.split(".").slice(0, 2).join(".")));
    assert.equal(units.size, 6, "Grade 5 → its 6 units");
  });

  test("the bank filter works at any step: a whole unit, a text set, a category with its levels", async () => {
    const mk = async (code: string, i: number) => createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `Place test ${code} ${i}`, level: 4, whyCorrect: "x", mapNodeCode: code, options: [{ label: "A", text: `r${code}${i}`, correct: true, rationale: null }, { label: "B", text: `w${code}${i}`, correct: false, rationale: "n" }] });
    await mk("G5.U1.TS2.ACS.ON", 1); await mk("G5.U1.TS2.ACS.BELOW", 2); await mk("G5.U1.TS1.CV", 3); await mk("G5.U2.TS1.CV", 4);
    const count = async (map: string) => (await listQuestions(repo, admin, { status: "DRAFT", mapCode: map, limit: 50, page: 1 })).total;
    assert.deepEqual([await count("G5"), await count("G5.U1"), await count("G5.U1.TS2"), await count("G5.U1.TS2.ACS"), await count("G5.U1.TS2.ACS.ON")], [4, 3, 2, 2, 1]);
  });

  test("an unfinished place is refused with a clear message", async () => {
    await assert.rejects(createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: "Unfinished place", level: 4, whyCorrect: "x", mapNodeCode: "?", options: [{ label: "A", text: "a1", correct: true, rationale: null }, { label: "B", text: "b1", correct: false, rationale: "n" }] }), /Finish choosing the Curriculum Map place/);
  });
});
