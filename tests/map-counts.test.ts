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
import { curriculumMapView, LEVEL_TARGET, type MapViewNode } from "../src/server/curriculum-map/view";
import { demoDatabase } from "./helpers/db";

const find = (n: MapViewNode | null, code: string): MapViewNode | null => !n ? null : n.code === code ? n : n.children.map((c) => find(c, code)).find(Boolean) ?? null;

describe("🔁 Curriculum Map counts: exactly what the adaptive sets use, per level", () => {
  let repo: SqliteRepo; let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
  });

  test("published auto-marked = adaptive; published Short Answer = teacher-scored; drafts = waiting; archived = not counted", async () => {
    const code = "G5.U1.TS1.ACS.ABOVE";
    const mc = async (i: number) => createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `Counting question number ${i} about the text?`, level: 5, whyCorrect: "x", mapNodeCode: code, options: [{ label: "A", text: `right ${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${i}`, correct: false, rationale: "n" }] });
    const ids: string[] = [];
    for (let i = 0; i < LEVEL_TARGET + 2; i++) ids.push(await mc(i));
    await repo.updateMany("Question", { id: { in: ids.slice(0, LEVEL_TARGET) } }, { status: "PUBLISHED" });   // 20 published
    await repo.updateMany("Question", { id: ids[LEVEL_TARGET] }, { status: "ARCHIVED" });                       // 1 archived
    // (the last one stays a draft)
    const sa = await createDraft(repo, admin, { skillId: "", type: "SHORT_ANSWER", stem: "Explain the theme of the counting text.", level: 5, whyCorrect: "x", mapNodeCode: code, answers: ["A long model answer about the theme."] });
    await repo.updateMany("Question", { id: sa }, { status: "PUBLISHED" });
    const v = await curriculumMapView(repo, admin, 5);
    const n = find(v.book, code)!;
    assert.deepEqual(n.counts, { adaptive: LEVEL_TARGET, teacher: 1, waiting: 1 });
    assert.equal(n.questions, LEVEL_TARGET, "the number shown is the adaptive number");
    const above = v.coverage.find((c) => c.level === "ABOVE" && /Analyze Craft/i.test(c.category))!;
    assert.equal(above.atTarget, 1, "one Above place has reached 20");
    assert.ok(above.places > 1);
  });
});
