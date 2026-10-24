/**
 * Admin Map Links (/admin/map-links): src/server/map/map-more.ts — an admin sets (or clears) the MAP goal area of a
 * skill family; applyLinkSuggestions links every family the rule is confident about. curriculum:edit only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { applyLinkSuggestions, linkFamily, mapLinks } from "../src/server/map/map-more";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin Map Links", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin"); teacher = await a("demo.teacher.4a");
    // Isolate the test: clear every family's area so we know exactly which ones are linked by the test itself.
    await repo.updateMany("SkillFamily", {}, { mapGoalAreaId: null });
  });

  test("teachers are refused: curriculum:edit only", async () => {
    await assert.rejects(mapLinks(repo, teacher), ForbiddenError);
    const { rows } = await mapLinks(repo, admin);
    const any = rows.find((r) => r.questions > 0)!;
    assert.ok(any, "the demo bank has at least one skill family with questions");
    await assert.rejects(linkFamily(repo, teacher, any.familyId, "LIT_THEME"), ForbiddenError);
    await assert.rejects(applyLinkSuggestions(repo, teacher), ForbiddenError);
  });

  test("linkFamily: sets, then clears, the family's MAP goal area", async () => {
    const { rows } = await mapLinks(repo, admin);
    const target = rows.find((r) => !r.areaCode)!;
    assert.ok(target);
    await linkFamily(repo, admin, target.familyId, "LANG_GRAMMAR");
    const f = (await repo.findUnique("SkillFamily", { id: target.familyId }))!;
    const area = (await repo.findUnique("MapGoalArea", { id: f.mapGoalAreaId }))!;
    assert.equal(s(area.code), "LANG_GRAMMAR");
    await linkFamily(repo, admin, target.familyId, null);
    assert.equal((await repo.findUnique("SkillFamily", { id: target.familyId }))!.mapGoalAreaId, null, "null clears the link");
  });

  test("an unknown MAP goal area code is refused; a missing skill family is refused", async () => {
    const { rows } = await mapLinks(repo, admin);
    await assert.rejects(linkFamily(repo, admin, rows[0].familyId, "NOT_A_REAL_AREA"), ValidationError);
    await assert.rejects(linkFamily(repo, admin, "no-such-family-id", "LIT"), ValidationError);
  });

  test("applyLinkSuggestions: links every unlinked family the rule is confident about, leaves the rest for review", async () => {
    const before = await mapLinks(repo, admin);
    const withSuggestion = before.rows.filter((r) => !r.areaCode && r.suggested);
    assert.ok(withSuggestion.length >= 1, "at least one unlinked family has a confident suggestion");
    const n = await applyLinkSuggestions(repo, admin);
    assert.equal(n, withSuggestion.length);
    const after = await mapLinks(repo, admin);
    for (const r of withSuggestion) {
      const now = after.rows.find((x) => x.familyId === r.familyId)!;
      assert.equal(now.areaCode, r.suggested, `${r.family} took its suggested area`);
    }
    // idempotent: nothing left to suggest-and-apply a second time for families that already have none
    const n2 = await applyLinkSuggestions(repo, admin);
    const stillUnlinkedWithSuggestion = (await mapLinks(repo, admin)).rows.filter((r) => !r.areaCode && r.suggested);
    assert.equal(stillUnlinkedWithSuggestion.length, 0);
    assert.equal(n2, 0);
  });
});
