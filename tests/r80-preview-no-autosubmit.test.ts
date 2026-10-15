import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// r80 (owner: "pressing Preview assigns the skill by itself"): the Preview button and the Assign button sat in the same
// place, so React reused one <button> and switched its type to "submit" during the click — the form was sent. Each
// button now has its own key (a new element) and Preview/Back stop the default action.
test("r80: Preview as student never submits the assign form", () => {
  const src = readFileSync("src/components/skill-picker/assign-steps.tsx", "utf8");
  assert.match(src, /key="to-preview" type="button" onClick=\{\(e\) => \{ e\.preventDefault\(\); setStep\("preview"\)/);
  assert.match(src, /key="back" type="button"/);
  assert.match(src, /key="assign" type="submit"/);
});
