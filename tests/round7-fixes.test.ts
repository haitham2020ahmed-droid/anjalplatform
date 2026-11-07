/**
 * Round 7 (owner, after testing the live site as a student and a teacher): placement texts, ONE grade band,
 * article vs version titles, "Read next" never the same article, levels shown as "600L" / "BR120L", small averages.
 * (The placement length and accuracy: tests/round7-placement-sim.test.ts.)
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bandCounts, bucketLabel, gradeBand as chartBand, histogram } from "../src/server/readrise/dashboards";
import { BAND_LABEL, gradeBand, meetsRange } from "../src/server/readrise/benchmarks";
import { readAsTitle, runTitle } from "../src/server/readrise/version-title";
import { reasonLabel, reasons } from "../src/server/readrise/recommend";
import { rateText } from "../src/server/readrise/teacher-report";
import { rangeText } from "../src/server/readrise/growth-words";
import { PLACEMENT } from "../src/server/readrise/placement";

const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const plain = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? `{${k}}`));

describe("Round 7 fixes", () => {
  test("1–2. placement: 12–13 passages; the texts say 20–30 minutes, no time limit, 36–39 questions", () => {
    assert.deepEqual([PLACEMENT.minPassages, PLACEMENT.maxPassages], [12, 13]);
    for (const f of ["src/components/readrise/placement.tsx", "src/components/readrise/placement-popup.tsx", "src/app/student/readrise/placement/page.tsx", "src/app/student/readrise/page.tsx"]) {
      const s = src(f);
      assert.ok(s.includes("About 20–30 minutes — no time limit, you can stop and come back."), f);
      assert.ok(s.includes("about 36–39 questions"), f);
      assert.ok(!/about 30 minutes|about 40 questions/.test(s), f);
    }
  });

  test("3. one grade band: the chart band is the Meets range; counts per band; the teacher page has no old 'Below band' tile", () => {
    assert.deepEqual(chartBand(4), { low: meetsRange(4).min, high: meetsRange(4).max });
    assert.deepEqual(chartBand(4), { low: 740, high: 940 }, "was 640–940 (the old guidance table)");
    // a 600L Grade 4 reader: Approaches everywhere (was "Below band" on the At a glance card)
    assert.equal(gradeBand(4, 600), "APPROACHES");
    assert.deepEqual(bandCounts(4, [300, 600, 800, 1000]), { FAR_BELOW: 1, APPROACHES: 1, MEETS: 1, EXCEEDS: 1 });
    const h = histogram([600, 800], chartBand(4));
    assert.equal(h.find((b) => b.from === 700)!.inBand, true);
    assert.equal(h.find((b) => b.from === 600)!.inBand, false, "600–699 is under the Grade 4 Meets range");
    const page = src("src/app/teacher/readrise/page.tsx");
    assert.ok(!page.includes('label: "Below band"') && page.includes('label: "Grade bands"') && page.includes("flags.farBelow"));
    assert.ok(!src("src/server/readrise/dashboards.ts").includes("640, high: 940"), "the old table is gone");
    assert.ok(!src("src/app/teacher/readrise/_components/growth.tsx").includes("POSITION_TEXT"));
    assert.equal(BAND_LABEL.FAR_BELOW, "Falls Far Below");
  });

  test("4. teacher pages: the article title + (read as: version title · 600L) when they differ", () => {
    assert.equal(readAsTitle("Honeybees: Tiny Workers", "Honeybees: Busy Helpers", 600), "Honeybees: Tiny Workers (read as: Honeybees: Busy Helpers · 600L)");
    assert.equal(readAsTitle("Honeybees: Tiny Workers", "Honeybees: Tiny Workers", 600), "Honeybees: Tiny Workers", "same title: nothing added");
    assert.equal(readAsTitle("A", "", 600), "A");
    const titles = new Map([["art1|300", "Bees (easy)"]]);
    assert.equal(runTitle("Bees", titles, "art1", 300), "Bees (read as: Bees (easy) · 300L)");
    assert.equal(runTitle("Bees", titles, "art1", null), "Bees");
    for (const f of ["src/server/readrise/teacher-report.ts", "src/server/readrise/teacher.ts", "src/server/readrise/dashboards.ts", "src/server/readrise/growth-report.ts"]) assert.match(src(f), /runTitle|readAsTitle/, f);
  });

  test("5. Read next: no 'one level up' reason any more; the new 'same topic' reason", () => {
    const rec = src("src/server/readrise/recommend.ts");
    assert.ok(!/reasons\.stretch|"STRETCH"|one level up"/.test(rec.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "no stale reason in the code");
    assert.ok(!src("src/components/readrise/reader.tsx").includes("Try it one level up"));
    const r = reasons.sameTopic("Animals");
    assert.deepEqual([r.kind, r.topic], ["SAME_TOPIC", "Animals"]);
    assert.equal(reasonLabel(r, plain), "📚 More on this topic");
  });

  test("6. levels read 600L / BR120L: histogram labels, ranges, the library, the report page", () => {
    assert.deepEqual([bucketLabel(-400, 0), bucketLabel(600, 7), bucketLabel(1600, 17)], ["BR", "600L", "1600L+"]);
    assert.equal(rangeText({ mid: 820, low: 760, high: -100, confidence: "LOW", weeksLeft: 1, readings: 1 }), "820L (760L–BR100L)");
    assert.match(src("src/components/readrise/library.tsx"), /t\("Your level \{n\}", \{ n: formatLevel\(/);
    assert.match(src("src/components/readrise/library.tsx"), /t\("text ≈\{n\}", \{ n: formatLevel\(/);
    assert.match(src("src/app/teacher/readrise/page.tsx"), /value: s\.medianLevel === null \? "—" : formatLevel\(s\.medianLevel\)/);
    assert.match(src("src/server/reports/family-sections.ts"), /ReadRise Level: \$\{formatLevel\(rr\.level\)\}/);
  });

  test("7. an average under 10 shows one decimal; a small one is never '0'", () => {
    assert.deepEqual([rateText(null), rateText(0), rateText(0.01), rateText(0.05), rateText(0.12), rateText(2.46), rateText(12.4)], ["—", "0", "<0.1", "0.1", "0.1", "2.5", "12"]);
  });
});
