import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { passageBlocks, plainPassage } from "../src/lib/passage";

describe("📖 passages: headings, paragraphs and text features", () => {
  test("“## Heading”, paragraphs, and “FIG: kind | title | content” become their own blocks", () => {
    const t = "## Slow Changes\nEarth's surface changes all the time.\nIt is slow.\n\nFIG: Diagram | How a Rock Changes | Rain hits a rock → it breaks → a river carries it\nSecond paragraph.";
    const b = passageBlocks(t);
    assert.deepEqual(b.map((x) => x.kind), ["h", "p", "fig", "p"]);
    assert.equal(b[1].text, "Earth's surface changes all the time.\nIt is slow.");
    assert.deepEqual(b[2], { kind: "fig", figKind: "Diagram", title: "How a Rock Changes", text: "Rain hits a rock → it breaks → a river carries it" });
  });
  test("read aloud: no marks", () => {
    assert.equal(plainPassage("## Title\nFIG: Map | The River | From hills → to sea"), "Title\nMap: The River. From hills, then to sea");
  });
  test("plain passages are unchanged", () => {
    assert.deepEqual(passageBlocks("One.\n\nTwo."), [{ kind: "p", text: "One." }, { kind: "p", text: "Two." }]);
  });
});
