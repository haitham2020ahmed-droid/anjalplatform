/**
 * 🩹 (Oct 2026) Grade 6 extras → Curriculum Map link repair. The `gradeSixExtras` pack adds 100 published
 * questions each for "Analyzing Figurative, Connotative, and Technical Language" (Mother to Son) and
 * "Analyzing Informational Text Elements" (Shakespeare in Harlem) through addSkillSets(), which — before
 * this fix — never placed a question on the Curriculum Map, so both lessons' "Analyze Craft and Structure"
 * section stayed "Not ready" on the Skill-plan page even though the questions existed and were published.
 * This covers: (a) the bug reproduced (Not ready before the fix), (b) the retroactive repair links every
 * question to the right Level node by its own difficulty level, (c) the Skill-plan page now shows "ready",
 * (d) running the repair again links nothing new (idempotent), and (e) a *fresh* run of the pack (as if for
 * a brand-new school) now links correctly from the start, thanks to the pack's own mapNodeCodeBase.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { packOf, runPackChunk } from "../src/server/questions/load-packs";
import { linkGradeSixExtrasToMap } from "../src/server/curriculum-map/fix-grade6-extras";
import { curriculumLessons } from "../src/server/curriculum-map/lesson-details";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { addSkillSets, loadSkillSetsFile } from "../src/server/questions/skill-sets";

const MAP = parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8"));

const FIG = "Analyzing Figurative, Connotative, and Technical Language";
const INFO = "Analyzing Informational Text Elements";

async function readySection(repo: SqliteRepo, admin: Actor, lessonNameHas: string) {
  const { units } = await curriculumLessons(repo, admin, 6);
  const lesson = units.flatMap((u) => u.lessons).find((l) => l.name.includes(lessonNameHas));
  assert.ok(lesson, `lesson "${lessonNameHas}" exists in the Grade 6 map`);
  const section = lesson!.sections.find((s) => s.kind === "ANALYZE_CRAFT_AND_STRUCTURE");
  assert.ok(section, `"${lessonNameHas}": has an Analyze Craft and Structure section`);
  return section!;
}

describe("🩹 Grade 6 extras → Curriculum Map link repair", () => {
  let repo: SqliteRepo; let admin: Actor; let schoolId = "";

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = admin.schoolId!;
    await seedCurriculumMap(repo, MAP, { schoolId });
  });

  test("reproduces the bug: loading the pack the OLD way (no mapNodeCodeBase, as it shipped before this fix) leaves both lessons Not ready", async () => {
    // simulate the exact state already on production: the same 100+100+20 questions, but added via the pre-fix
    // addSkillSets() path that never placed a question on the Curriculum Map
    const sets = (await loadSkillSetsFile("grade6-extra-skill-sets.json")).map((set) => { const { mapNodeCodeBase, ...rest } = set; return rest; });
    const r = await addSkillSets(repo, schoolId, sets);
    assert.equal(r.reduce((n, x) => n + x.added, 0), 220, "100 + 100 + 20, same as the pack");
    assert.equal((await readySection(repo, admin, "Mother to Son")).ready, false);
    assert.equal((await readySection(repo, admin, "Shakespeare in Harlem")).ready, false);
  });

  test("the repair links every published question to the right Level node, and the Skill-plan page now shows ready", async () => {
    const results = await linkGradeSixExtrasToMap(repo, schoolId);
    assert.equal(results.length, 2);
    for (const r of results) { assert.deepEqual(r.errors, []); assert.equal(r.linked, 100, r.skill); assert.equal(r.alreadyLinked, 0, r.skill); assert.equal(r.skippedUnknownLevel, 0, r.skill); }

    assert.equal((await readySection(repo, admin, "Mother to Son")).ready, true);
    assert.equal((await readySection(repo, admin, "Shakespeare in Harlem")).ready, true);

    // every question went to the Level node matching its own difficulty (2=Below · 4=On · 6=Above)
    for (const name of [FIG, INFO]) {
      const skill = (await repo.findMany("Skill", { deletedAt: null }, { select: ["id", "name"] })).find((k) => String(k.name) === name)!;
      const qs = await repo.findMany("Question", { skillId: skill.id, deletedAt: null }, { select: ["id", "difficultyLevel"] });
      assert.equal(qs.length, 100, name);
      const links = await repo.findMany("QuestionMapLink", { questionId: { in: qs.map((q) => String(q.id)) } }, { select: ["questionId", "nodeId"] });
      assert.equal(links.length, 100, `${name}: exactly one link per question`);
      const nodes = await repo.findMany("CurriculumMapNode", { id: { in: links.map((l) => String(l.nodeId)) } }, { select: ["id", "code", "level"] });
      const nodeOf = new Map(nodes.map((n) => [String(n.id), n]));
      const linkOf = new Map(links.map((l) => [String(l.questionId), l]));
      const WANT: Record<number, string> = { 2: "BELOW", 4: "ON", 6: "ABOVE" };
      for (const q of qs) {
        const n = nodeOf.get(String(linkOf.get(String(q.id))!.nodeId))!;
        assert.equal(n.level, WANT[Number(q.difficultyLevel)], `${name} q${q.id}: level ${q.difficultyLevel} on a ${n.level} node`);
        assert.ok(String(n.code).endsWith(`.ACS.${WANT[Number(q.difficultyLevel)]}`), `${name} q${q.id}: on an ACS level node (${n.code})`);
      }
    }
  });

  test("running the repair again links nothing new (idempotent)", async () => {
    const results = await linkGradeSixExtrasToMap(repo, schoolId);
    for (const r of results) { assert.equal(r.linked, 0, r.skill); assert.equal(r.alreadyLinked, 100, r.skill); }
  });

  test("a fresh school loading the pack today links correctly from the start (no repair needed)", async () => {
    const { repo: fresh } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    const freshAdmin = await resolveActor(fresh, (await fresh.findUnique("User", { username: "demo.admin" }))!);
    await seedCurriculumMap(fresh, MAP, { schoolId: freshAdmin.schoolId! });
    const def = packOf("gradeSixExtras")!;
    let next = 0;
    for (;;) { const w = await runPackChunk(fresh, freshAdmin.schoolId!, def, next); next = w.next; if (next >= w.total) break; }
    assert.equal((await readySection(fresh, freshAdmin, "Mother to Son")).ready, true);
    assert.equal((await readySection(fresh, freshAdmin, "Shakespeare in Harlem")).ready, true);
  });
});
