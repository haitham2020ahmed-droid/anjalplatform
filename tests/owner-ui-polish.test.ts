/**
 * Owner's UI polish: the compact, scrollable "Needs attention" list on Teacher Home; the re-laid-out Writing page
 * (toolbar, full-width form card, no empty right panel, line icons); the plain "Let's go" sign-in button; and the
 * plan editor's "Preview as student" showing the student's own study-plan sheet with a Download button.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Teacher Home: Needs attention", () => {
  const home = read("src/app/teacher/page.tsx");
  test("compact rows in a fixed-height, keyboard-scrollable box; Show all (N) kept; no '… and N more'", () => {
    assert.match(home, /role="region" aria-label=\{t\("Needs attention"\)\} tabIndex=\{0\} className="[^"]*max-h-\[18rem\] overflow-y-auto/);
    assert.match(home, /px-3 py-1\.5 text-sm/, "tight 14px rows");
    assert.match(home, /truncate/, "name · class · reason on one line");
    assert.match(home, /h-7 shrink-0 items-center rounded-md[^"]*text-xs[^"]*">\{t\("Open"\)\}/, "small Open button");
    assert.match(home, /t\("Show all \(\{n\}\)", \{ n: sum\.list\.length \}\)/);
    assert.doesNotMatch(home, /… and \{n\} more/);
  });
});

describe("Teacher Writing page", () => {
  const page = read("src/app/teacher/writing/page.tsx");
  test("toolbar with line icons, no emoji on the main buttons", () => {
    for (const [icon, label] of [["lock", "New writing task (rubric, locked page)"], ["scale", "Rubrics"], ["chart", "Writing results"]])
      assert.match(page, new RegExp(`<LineIcon name="${icon}"[^>]*/>\\{tr\\("${label.replace(/[()]/g, "\\$&")}"\\)\\}`), label);
    assert.doesNotMatch(page, /🔒 \{tr|📏 \{tr|📊 \{tr|➕ New genre/);
  });
  test("full-width form card with a two-column grid and 44px inputs; no big empty task panel", () => {
    assert.match(page, /md:grid-cols-2/);
    assert.match(page, /const inp = "[^"]*h-11/);
    assert.match(page, /const lbl = "block text-sm font-semibold/);
    assert.doesNotMatch(page, /Choose a task, or make a new one\./);
    assert.match(page, /task \? "lg:grid-cols-\[20rem_minmax\(0,1fr\)\]" : ""/, "two columns only when a task is open");
    for (const k of ["New genre task or reading aloud", "Genre (writing)", "What students do", "Min. words", "Assign to the class", "Class writing errors", "Tasks", "Choose a task to see the students' work.", "No tasks for this class yet."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), `en: ${k}`);
      assert.ok((ar as Record<string, string>)[k], `ar: ${k}`);
    }
  });
});

describe("Sign-in button", () => {
  test("says only \"Let's go\" (هيا بنا)", () => {
    const form = read("src/app/login/login-form.tsx");
    assert.match(form, /\{t\("Let's go"\)\} <span aria-hidden="true"[^>]*>→<\/span>/);
    assert.doesNotMatch(form, /Let's go, /);
    assert.equal((ar as Record<string, string>)["Let's go"], "هيا بنا");
  });
});

describe("Plan editor: Preview as student", () => {
  // render-free (next/link is not available to the test runner): the preview reuses the student's own StudyPlan sheet
  const ui = read("src/components/plans/editor-ui.tsx");
  const sheet = read("src/components/student/study-plan.tsx");
  test("the editor builds the student's sheet the way sending writes the plan items, read-only", () => {
    assert.match(ui, /import \{ StudyPlan \} from "@\/components\/student\/study-plan"/);
    assert.match(ui, /const unit = editorPlanLabel\(v\.program\), set = `Grade \$\{v\.grade\}`/);
    assert.match(ui, /href: null, locked: false/, "nothing is a working link");
    assert.match(ui, /<StudyPlan t=\{t\} p=\{studentSheetOf\(v, mine\)\}[^>]*preview \/>/);
    assert.doesNotMatch(ui, /<StudentPlanPreview /);
  });
  test("preview mode: no switcher, no Respond link, no certificate, rows not links; one Download button", () => {
    assert.match(sheet, /\{!preview && plans\.length > 1 &&/);
    assert.match(sheet, /\{!preview && <Link prefetch=\{false\} href="\/student\/respond"/);
    assert.match(sheet, /\{!preview && uDone === inUnit\.length/);
    assert.match(sheet, /<PrintButton label=\{preview \? "Download" : "Download PDF \/ Print"\} \/>/);
    assert.match(sheet, /\{x\.href && !preview \? <Link/);
    assert.match(sheet, /hideLevels\(x\.label\)/, "no level words");
  });
  test("Download prints only the student's sheet", () => {
    assert.match(ui, /<div data-print="hide">\s*<Section title="3 · Preview as student"/);
    assert.match(read("src/app/teacher/plans/[planId]/page.tsx"), /data-print=\{step === "preview" \? "hide" : undefined\}/);
    assert.match(read("src/app/globals.css"), /\[data-print="hide"\]/);
  });
});
