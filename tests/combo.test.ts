/**
 * 🔎 The platform's ONE picker (owner request, item 4): every search / select box is a combobox — clicking or focusing
 * it opens the FULL list at once (grouped, scrollable), typing filters it live, never an empty box where the user must
 * type first; keyboard, RTL, mobile, a multi-select variant with chips + "Select all"; lists over 300 rows virtualised.
 * The logic (src/lib/combo.ts) is tested directly; the component (src/components/ui/combo.tsx) and its adoption by
 * reading the sources.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRows, clearValues, filterOptions, fold, LIST_PX, moveActive, ROW_PX, scrollFor, selectAllValues, toggleValue, VIRTUAL_FROM, virtualWindow, type ComboOption } from "../src/lib/combo";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);

const OPTS: ComboOption[] = [
  { value: "", label: "All classes" },
  { value: "c1", label: "6A", group: "Grade 6", hint: "24 students" },
  { value: "c2", label: "6B", group: "Grade 6", hint: "22 students", disabled: true },
  { value: "c3", label: "5A", group: "Grade 5", keywords: "morning" },
  { value: "s1", label: "Characters & Setting", group: "Reading" },
  { value: "s2", label: "Author's purpose", group: "Reading" },
  { value: "a1", label: "عبد العزيز", group: "Students" },
];

describe("🔎 the full list at once, typing filters it live", () => {
  test("an empty query keeps EVERY option (the list is never empty before typing)", () => {
    assert.deepEqual(filterOptions(OPTS, ""), OPTS.map((_, i) => i));
    assert.deepEqual(filterOptions(OPTS, "   "), OPTS.map((_, i) => i));
  });
  test("every typed word must appear in the label, hint, group or keywords; case, accents, & / and, apostrophes ignored", () => {
    const labels = (q: string) => filterOptions(OPTS, q).map((i) => OPTS[i].label);
    assert.deepEqual(labels("6a"), ["6A"]);
    assert.deepEqual(labels("grade 6"), ["6A", "6B"]);
    assert.deepEqual(labels("characters and setting"), ["Characters & Setting"]);
    assert.deepEqual(labels("authors purpose"), ["Author's purpose"]);
    assert.deepEqual(labels("morning"), ["5A"], "keywords find an option");
    assert.deepEqual(labels("22 students"), ["6B"], "the hint is searched");
    assert.deepEqual(labels("عبد"), ["عبد العزيز"], "Arabic");
    assert.deepEqual(labels("zzz"), []);
    assert.equal(fold("Café  &  Crème"), "cafe and creme");
  });
  test("a picker's own search rule", () => {
    const only = filterOptions(OPTS, "x", (o) => o.value.startsWith("s"));
    assert.deepEqual(only.map((i) => OPTS[i].value), ["s1", "s2"]);
  });
  test("rows: loose options first, then each group under its heading (first-seen order)", () => {
    const rows = buildRows(OPTS, filterOptions(OPTS, ""));
    assert.deepEqual(rows.map((r) => (r.kind === "group" ? `#${r.label}` : OPTS[r.index].value)), ["", "#Grade 6", "c1", "c2", "#Grade 5", "c3", "#Reading", "s1", "s2", "#Students", "a1"]);
  });
});

describe("⌨ keyboard", () => {
  const rows = buildRows(OPTS, filterOptions(OPTS, ""));
  test("↓ ↑ skip headings and disabled options and wrap; Home / End", () => {
    const first = moveActive(rows, OPTS, -1, "first");
    assert.equal(first, 0);
    const r1 = moveActive(rows, OPTS, first, 1);
    assert.equal(rows[r1].kind === "option" && OPTS[rows[r1].index].value, "c1", "the heading is skipped");
    const r2 = moveActive(rows, OPTS, r1, 1);
    assert.equal(rows[r2].kind === "option" && OPTS[rows[r2].index].value, "c3", "6B is disabled: skipped");
    const last = moveActive(rows, OPTS, -1, "last");
    assert.equal(rows[last].kind === "option" && OPTS[rows[last].index].value, "a1");
    assert.equal(moveActive(rows, OPTS, last, 1), first, "wraps to the top");
    assert.equal(moveActive(rows, OPTS, first, -1), last, "wraps to the bottom");
    assert.equal(moveActive([], OPTS, -1, 1), -1);
  });
  test("the component: combobox + listbox roles, active option announced, Enter / Escape / Tab / Backspace", () => {
    const src = read("src/components/ui/combo.tsx");
    for (const x of ['role="combobox"', 'role="listbox"', 'role="option"', "aria-expanded={open}", "aria-controls={listId}", "aria-activedescendant", "aria-selected={on}", "aria-multiselectable", 'aria-autocomplete="list"']) assert.ok(src.includes(x), x);
    for (const k of ['"ArrowDown"', '"ArrowUp"', '"Home"', '"End"', '"Enter"', '"Escape"', '"Tab"', '"Backspace"']) assert.ok(src.includes(k), k);
  });
});

describe("👆 opens on focus / click; RTL; mobile; form fields", () => {
  const src = read("src/components/ui/combo.tsx");
  test("focus or click opens the FULL list (query cleared)", () => {
    assert.match(src, /onFocus=\{\(\) => \{ if \(!open\) openList\(\); \}\}/);
    assert.match(src, /onClick=\{\(\) => \{ if \(!open\) openList\(\); \}\}/);
    assert.match(src, /const openList = \(\) => \{[\s\S]*setOpen\(true\);[\s\S]*setQuery\(""\);/);
  });
  test("RTL-safe (logical sides only), mobile-friendly (44 px rows, 16 px text), hidden inputs for forms, submitOnChange", () => {
    assert.doesNotMatch(src, /\b(ml|mr|pl|pr|left|right)-\d/, "no physical left / right classes");
    assert.equal(ROW_PX, 44);
    assert.match(src, /const INPUT = "[^"]*\btext-base\b[^"]*\bsm:text-sm\b/, "16 px text on phones (no zoom)");
    assert.match(src, /type="hidden" name=\{props\.name\}/);
    assert.match(src, /requestSubmit/);
    assert.match(src, /required value=/, "a required picker blocks the form like a <select required>");
  });
  test("the strings it shows exist in English and Arabic", () => {
    for (const x of ["Search or choose…", "No matches.", "Select all", "Clear", "{n} selected", "Remove {name}"]) assert.ok(hasAr(x), x);
  });
});

describe("☑ multi-select: chips, Select all, Clear", () => {
  test("toggle keeps the first-choice order", () => {
    assert.deepEqual(toggleValue([], "c1"), ["c1"]);
    assert.deepEqual(toggleValue(["c1", "c3"], "a1"), ["c1", "c3", "a1"]);
    assert.deepEqual(toggleValue(["c1", "c3"], "c1"), ["c3"]);
  });
  test("Select all adds every enabled option of the FILTERED list; Clear removes the filtered ones (or all)", () => {
    const g6 = filterOptions(OPTS, "grade 6");
    assert.deepEqual(selectAllValues(["s1"], OPTS, g6), ["s1", "c1"], "6B is disabled");
    assert.deepEqual(selectAllValues([], OPTS, filterOptions(OPTS, "")).length, OPTS.length - 1);
    assert.deepEqual(clearValues(["s1", "c1", "c3"], OPTS, g6, "grade 6"), ["s1", "c3"]);
    assert.deepEqual(clearValues(["s1", "c1"], OPTS, filterOptions(OPTS, ""), ""), []);
  });
  test("chips with a remove button, the Select all / Clear bar, the count", () => {
    const src = read("src/components/ui/combo.tsx");
    assert.match(src, /multiple && values\.map\(\(v\) => \(\s*<span key=\{v\}/);
    assert.match(src, /selectAllValues\(values, options, visible\)/);
    assert.match(src, /clearValues\(values, options, visible, query\)/);
  });
});

describe("⚡ long lists are virtualised", () => {
  test(`up to ${VIRTUAL_FROM} rows: all drawn; more: only the window around the scroll position`, () => {
    assert.deepEqual(virtualWindow(120, 0), { start: 0, end: 120, padTop: 0, padBottom: 0, virtual: false });
    const w = virtualWindow(5000, 44 * 1000);
    assert.equal(w.virtual, true);
    assert.ok(w.start <= 1000 && w.end >= 1000 + Math.ceil(LIST_PX / ROW_PX));
    assert.ok(w.end - w.start < 40, "a few dozen rows, not 5000");
    assert.equal(w.padTop, w.start * ROW_PX);
    assert.equal(w.padBottom, (5000 - w.end) * ROW_PX);
    assert.equal(virtualWindow(5000, 0).start, 0);
  });
  test("keyboard scrolling keeps the active row visible", () => {
    assert.equal(scrollFor(0, 0), 0);
    assert.equal(scrollFor(20, 0), 21 * ROW_PX - LIST_PX);
    assert.equal(scrollFor(2, 10 * ROW_PX), 2 * ROW_PX);
    assert.equal(scrollFor(10, 8 * ROW_PX), 8 * ROW_PX, "already visible");
  });
});

/** The pickers converted to the shared combobox (teacher, admin, NAFS). */
export const ADOPTION: string[] = [
  // NAFS center
  "src/components/nafs/nafs-builder.tsx", "src/components/nafs/practice-tab.tsx", "src/components/nafs/bank-tab.tsx", "src/components/nafs/skills-tab.tsx",
  "src/components/nafs/marking-tab.tsx", "src/components/nafs/sheets-tab.tsx", "src/components/nafs/reports-tab.tsx", "src/components/nafs/dashboard-tab.tsx",
  "src/components/nafs/grade-sheets.tsx", "src/components/nafs/question-form.tsx", "src/app/teacher/nafs/tests/[id]/page.tsx",
  "src/app/teacher/nafs/tests/[id]/grade/page.tsx", "src/app/teacher/nafs/tests/[id]/sheets/page.tsx",
  // teacher pages and components
  "src/components/skill-picker/skill-search-select.tsx", "src/app/teacher/plans/bulk/page.tsx", "src/app/teacher/lessons/page.tsx", "src/app/teacher/intervention/groups/page.tsx",
  // r67: Student Progress and the weekly summary merged (redirects): the comments form lives in the student file
  "src/app/teacher/students/[studentId]/page.tsx", "src/app/teacher/family-reports/page.tsx", "src/app/teacher/progress-checks/page.tsx",
  "src/app/teacher/readrise/library/[articleId]/page.tsx", "src/app/teacher/learn/assign/page.tsx", "src/app/teacher/reports/early-warning/page.tsx",
  "src/app/teacher/assignments/new/assignment-form.tsx", "src/app/teacher/assignments/[assignmentId]/page.tsx", "src/app/teacher/assessments/new/test-builder.tsx",
  "src/app/teacher/assessments/new/make-test.tsx", "src/app/teacher/assessments/new/review-source.tsx", "src/components/game/challenge-setup.tsx", "src/components/teacher/home-widgets.tsx",
  "src/components/skills/skill-assign.tsx", "src/components/curriculum-map/assign-button.tsx", "src/components/curriculum-map/send-plan.tsx", "src/components/writing/rubric-builder.tsx",
  // admin
  "src/app/admin/school/school-tree.tsx", "src/app/admin/users/create-user-form.tsx", "src/app/admin/users/[userId]/page.tsx", "src/app/admin/quick-students/quick-form.tsx",
  "src/app/admin/curriculum/unit/[unitId]/editor-forms.tsx", "src/app/admin/curriculum/skill/[skillId]/skill-forms.tsx", "src/app/admin/curriculum/page.tsx", "src/app/admin/student-cards/page.tsx",
  "src/app/admin/questions/page.tsx", "src/app/admin/questions/question-list.tsx", "src/app/admin/questions/assign-questions-dialog.tsx", "src/app/admin/questions/question-editor.tsx",
  "src/app/admin/questions/unclassified/page.tsx", "src/app/admin/skill-links/page.tsx", "src/app/admin/skill-links/bulk-review.tsx", "src/app/admin/readmaster/page.tsx",
];

describe("🧩 adoption: the entity pickers use the one combobox", () => {
  test("each converted page / component renders <Combo …> from the shared component", () => {
    for (const f of ADOPTION) {
      const src = read(f);
      assert.match(src, /import \{ Combo(, type ComboOption)? \} from "@\/components\/ui\/combo";/, `${f} imports the shared combobox`);
      assert.match(src, /<Combo\b/, `${f} renders it`);
    }
  });
  test("no entity <select> left in the converted places (class / student / skill / standard / test / booklet …)", () => {
    const ENTITY = /<select[^>]*name="(classId|class|studentId|sid|student|skillId|skill|family|test|practice|std|code|set|standard|familyId|unitId|lessonId|assignmentId|teacherId|prerequisiteId|studentUserId|choice|rubricId)"/;
    for (const f of ADOPTION) assert.doesNotMatch(read(f), ENTITY, `${f}: an entity picker is still a plain <select>`);
    // no NAFS screen keeps a multi-select box or a free-text-only picker for students
    for (const f of ["src/components/nafs/practice-tab.tsx", "src/app/teacher/nafs/tests/[id]/page.tsx"]) assert.doesNotMatch(read(f), /<select[^>]*multiple/);
  });
});
