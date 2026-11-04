import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { filterSkills, skillAliases, skillMatches } from "../src/lib/skill-picker";

describe("skill search: teachers' other words (SKILL_SEARCH_ALIASES)", () => {
  test("'Characterization' finds Character Traits & Development in every grade", () => {
    for (const g of [4, 5, 6]) for (const q of ["Characterization", "characterization", "direct and indirect characterization"])
      assert.ok(skillMatches({ name: "Character Traits & Development", code: `G${g}.character` }, q), `${g} ${q}`);
  });
  test("only that skill, and no other", () => {
    const rows = [
      { name: "Character Traits & Development", names: [], code: "G5.character", tab: "READING" as const },
      { name: "Character Perspective", names: [], code: "G5.character-perspective", tab: "READING" as const },
      { name: "Theme", names: [], code: "G5.theme", tab: "READING" as const },
    ];
    assert.deepEqual(filterSkills(rows, "Characterization").map((r) => r.code), ["G5.character"]);
    assert.deepEqual(skillAliases("G5.character-perspective"), []);
    assert.ok(!skillMatches({ name: "Theme", code: "G5.theme" }, "characterization"));
  });
});
