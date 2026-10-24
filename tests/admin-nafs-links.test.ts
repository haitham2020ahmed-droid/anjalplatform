/**
 * Admin NAFS Links (/admin/nafs-links): src/server/nafs/nafs-links.ts — links a skill family to a NAFS area, applies
 * confident rule suggestions, and manages the NAFS area list. Admin (curriculum:edit, role-gated) only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { applyNafsSuggestions, ensureNafsAreas, linkNafsFamily, nafsLinks, nafsRuleForFamily, saveNafsArea } from "../src/server/nafs/nafs-links";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin NAFS Links", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin"); teacher = await a("demo.teacher.4a");
    await ensureNafsAreas(repo);
    await repo.deleteMany("NafsSkillLink", {}); // isolate: nothing linked yet
  });

  test("the pure rule: grammar / mechanics / writing / vocabulary skills decide outright; mixed RL+RI with no MAP area does not", () => {
    assert.equal(nafsRuleForFamily({ code: "x", name: "Pronouns", domain: "GRAMMAR", category: "GRAMMAR", mapArea: null, standards: [] }).area, "GRAMMAR");
    assert.equal(nafsRuleForFamily({ code: "x", name: "Punctuation", domain: "MECHANICS", category: "MECHANICS", mapArea: null, standards: [] }).area, "WRITING");
    assert.equal(nafsRuleForFamily({ code: "x", name: "Theme", domain: "READING", category: "LITERATURE", mapArea: null, standards: [] }).area, "RC_LIT");
    assert.equal(nafsRuleForFamily({ code: "x", name: "Main idea", domain: "READING", category: "INFORMATIONAL", mapArea: null, standards: [] }).area, "RC_INFO");
    const unsure = nafsRuleForFamily({ code: "x", name: "General comprehension", domain: "READING", category: "COMPREHENSION", mapArea: null, standards: ["RL.4.2", "RI.4.2"] });
    assert.equal(unsure.area, "RC_LIT", "RL+RI with no MAP area: a weak guess, not null");
    assert.ok(unsure.confidence < 0.8, "but with low confidence: it should go to review, not be auto-applied");
    assert.equal(nafsRuleForFamily({ code: "x", name: "Nothing to go on", domain: "", category: "", mapArea: null, standards: [] }).area, null);
  });

  test("teachers are refused: only an admin links skills to NAFS areas", async () => {
    await assert.rejects(nafsLinks(repo, teacher), ForbiddenError);
    const { rows } = await nafsLinks(repo, admin);
    const any = rows.find((r) => r.skills.length)!;
    assert.ok(any);
    await assert.rejects(linkNafsFamily(repo, teacher, any.familyId, "GRAMMAR"), ForbiddenError);
    await assert.rejects(applyNafsSuggestions(repo, teacher), ForbiddenError);
    await assert.rejects(saveNafsArea(repo, teacher, { name: "New area" }), ForbiddenError);
  });

  test("linkNafsFamily: ADMIN links are never changed by applyNafsSuggestions afterwards", async () => {
    const { rows } = await nafsLinks(repo, admin);
    const target = rows.find((r) => !r.areaCode && r.suggested && r.suggested !== "GRAMMAR")!;
    assert.ok(target, "a family with a suggestion other than Grammar exists");
    await linkNafsFamily(repo, admin, target.familyId, "GRAMMAR"); // deliberately NOT the suggested area
    const link = (await repo.findUnique("NafsSkillLink", { familyId: target.familyId }))!;
    assert.equal(s(link.source), "ADMIN");
    await applyNafsSuggestions(repo, admin);
    const after = (await repo.findUnique("NafsSkillLink", { familyId: target.familyId }))!;
    assert.equal(s(after.areaId), s(link.areaId), "the admin's own choice is untouched");
  });

  test("an unknown NAFS area code, or a missing skill family, is refused", async () => {
    const { rows } = await nafsLinks(repo, admin);
    await assert.rejects(linkNafsFamily(repo, admin, rows[0].familyId, "NOT_A_REAL_AREA"), ValidationError);
    await assert.rejects(linkNafsFamily(repo, admin, "no-such-family", "GRAMMAR"), ValidationError);
  });

  test("applyNafsSuggestions: links every unlinked, confident family; leaves low-confidence ones unlinked", async () => {
    const before = (await nafsLinks(repo, admin)).rows.filter((r) => !r.areaCode);
    const confident = before.filter((r) => r.confidence >= 0.8 && r.suggested);
    const unsure = before.filter((r) => r.suggested && r.confidence < 0.8);
    const n = await applyNafsSuggestions(repo, admin);
    assert.equal(n, confident.length);
    const after = await nafsLinks(repo, admin);
    for (const r of confident) assert.equal(after.rows.find((x) => x.familyId === r.familyId)!.areaCode, r.suggested);
    for (const r of unsure) assert.equal(after.rows.find((x) => x.familyId === r.familyId)!.areaCode, null, `${r.family}: low-confidence, left for review`);
  });

  test("saveNafsArea: add, rename, and reject a duplicate code / empty name", async () => {
    const id = await saveNafsArea(repo, admin, { name: "Listening Skills" });
    const created = (await repo.findUnique("NafsArea", { id }))!;
    assert.equal(s(created.code), "LISTENING_SKILLS");
    assert.equal(s(created.name), "Listening Skills");
    assert.ok(created.isActive);
    await saveNafsArea(repo, admin, { id, name: "Listening & Speaking", isActive: false });
    const renamed = (await repo.findUnique("NafsArea", { id }))!;
    assert.equal(s(renamed.name), "Listening & Speaking");
    assert.equal(renamed.isActive, false);
    await assert.rejects(saveNafsArea(repo, admin, { name: "Listening Skills" }), ValidationError, "the code LISTENING_SKILLS would clash with the one already created");
    await assert.rejects(saveNafsArea(repo, admin, { name: " " }), ValidationError);
  });
});
