/**
 * Level words for staff and parents: Approaching / Meeting / Exceeding (the standard) replace Below / On / Above
 * everywhere they are shown. The stored values (BELOW / ON / ABOVE) do not change, and students still never see
 * a level word: work titles that carry the new words are cleaned exactly like the old ones.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hideLevels } from "../src/lib/hide-levels";
import { groupFor } from "../src/server/teacher/queries";
import { LEVEL_NAMES } from "../src/server/curriculum-map/levels";
import { LEVEL_NAME as TEST_LEVEL_NAME } from "../src/server/tests/assessments";
import { RESPOND_LEVEL_NAME } from "../src/server/curriculum-map/respond";
import { LEVEL_NAMES as READMASTER_LEVEL_NAMES } from "../src/server/readmaster/service";
import { fluencyRubricText } from "../src/server/diagnostic/standards";
import { achievementText } from "../src/server/motivation/certificates";
import { groupLabel } from "../src/reports/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const OLD_WORDS = /\b(Below|Above) Level\b|\bOn Level\b|\bOn level\b/;

describe("Approaching / Meeting / Exceeding", () => {
  test("the level name maps show the new words for the stored BELOW / ON / ABOVE", () => {
    for (const m of [LEVEL_NAMES, TEST_LEVEL_NAME, RESPOND_LEVEL_NAME, READMASTER_LEVEL_NAMES] as Record<string, string>[]) {
      assert.deepEqual([m.BELOW, m.ON, m.ABOVE], ["Approaching", "Meeting", "Exceeding"]);
    }
    assert.match(fluencyRubricText(5, "WINTER"), /^Grade 5: Approaching ≤ \d+ · Meeting \d+–\d+ · Exceeding > \d+ WCPM$/);
  });

  test("the teacher group 'On level' is now 'Meeting' (and in the Arabic report words)", () => {
    assert.equal(groupFor(0.2, null), "Meeting");
    assert.equal(groupFor(null, 80), "Meeting");
    assert.equal(groupLabel("en", "Meeting"), "Meeting");
    assert.equal(groupLabel("ar", "Meeting"), "يحقق المعيار");
  });

  test("English and Arabic interface words", () => {
    const want: Record<string, string> = {
      Approaching: "يقترب من المعيار", Meeting: "يحقق المعيار", Exceeding: "يتجاوز المعيار",
      "Approaching the standard": "يقترب من المعيار", "Meeting the standard": "يحقق المعيار", "Exceeding the standard": "يتجاوز المعيار",
    };
    const list = UI_STRINGS as readonly string[];
    for (const [en, arabic] of Object.entries(want)) {
      assert.ok(list.includes(en), en);
      assert.equal((ar as Record<string, string>)[en], arabic, en);
    }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
    assert.equal(list.filter((s) => OLD_WORDS.test(s)).length, 0, "no old level words left in the interface strings");
    assert.ok(list.includes("On"), "the On / Off switch word stays");
  });

  test("students still never see a level: new-style titles are cleaned, old ones too", () => {
    assert.equal(hideLevels("Main idea (Approaching)"), "Main idea");
    assert.equal(hideLevels("Weekly test (Exceeding the standard)"), "Weekly test");
    assert.equal(hideLevels("Commas (adaptive: Approaching → Meeting → Exceeding)"), "Commas");
    assert.equal(hideLevels("Analyze Craft and Structure · Meeting"), "Analyze Craft and Structure");
    assert.equal(hideLevels("Meeting · Main idea"), "Main idea");
    assert.equal(hideLevels("Analyze Craft and Structure (Below Level)"), "Analyze Craft and Structure", "older titles");
    assert.equal(hideLevels("Meeting new friends"), "Meeting new friends", "ordinary words are kept");
    // a certificate saved with the new words is still told as "moved up to the next level"
    const cert = { kind: "LEVEL_UP", title: "Moved up to Exceeding", detail: null } as unknown as Parameters<typeof achievementText>[0];
    assert.match(achievementText(cert, "en"), /^Moved up to the next level/);
  });

  test("teacher / admin pages and exports no longer write the old words", () => {
    const files = [
      "src/components/teacher/level-board.tsx", "src/components/report-kit/tokens.ts", "src/components/plans/editor-ui.tsx",
      "src/components/skill-picker/skill-question-picker.tsx", "src/components/tests/question-drawer.tsx", "src/components/curriculum-map/assign-button.tsx",
      "src/components/diagnostic/class-report.tsx", "src/components/student/learning-path-view.tsx",
      "src/server/tests/generate.ts", "src/server/map/personal-plan-doc.ts", "src/server/admin/question-import.ts", "src/server/diagnostic/export.ts",
      "src/server/reports/builders-extra.ts", "src/app/admin/levels/page.tsx", "src/app/teacher/levels/page.tsx",
    ];
    for (const f of files) {
      const code = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
      assert.doesNotMatch(code, OLD_WORDS, f);
      assert.doesNotMatch(code, /"(Below|Above)"(?!\s*[|:\]])|: "On"/, f);
    }
  });
});
