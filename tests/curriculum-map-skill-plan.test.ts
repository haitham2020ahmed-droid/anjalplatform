/**
 * 🗺️ skillPlanData (src/server/curriculum-map/skill-plan.ts) — the thin wrapper the new "skill plan" view of the
 * Curriculum Map reads from. It must return EXACTLY what curriculumMapPdfData returns (same units, same per-category
 * skill groups) — the live page and the printable PDF must never drift apart. Role gating happens on the page
 * itself (requireActor roles: TEACHER/SCHOOL_ADMIN/SUPER_ADMIN), same as the rest of this page's data calls.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { curriculumMapPdfData, MAP_CATEGORY_GROUPS } from "../src/server/curriculum-map/map-pdf";
import { skillPlanData } from "../src/server/curriculum-map/skill-plan";

const s = (v: unknown) => String(v);

describe("skillPlanData (the live Curriculum Map skill-plan view's data)", () => {
  let repo: SqliteRepo; let teacher: Awaited<ReturnType<typeof resolveActor>>;
  let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actor("demo.teacher.4a");
    schoolId = s(teacher.schoolId);
  });

  test("mirrors curriculumMapPdfData exactly, for every grade", async () => {
    for (const g of [4, 5, 6]) {
      const expected = await curriculumMapPdfData(repo, schoolId, g);
      const got = await skillPlanData(repo, teacher, g);
      assert.deepEqual(got, expected, `Grade ${g}`);
      assert.ok(got!.units.length > 0);
      // every skill's group is one of the known category keys the live view's CATEGORY_LABEL covers
      const keys = new Set(MAP_CATEGORY_GROUPS.map((x) => x.key));
      for (const u of got!.units) for (const sec of u.sections) for (const k of sec.skills) assert.ok(keys.has(k.group), `${k.name}: unknown group "${k.group}"`);
    }
  });
});
