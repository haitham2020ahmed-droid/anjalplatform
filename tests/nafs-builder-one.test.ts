/**
 * 🇸🇦 NAFS center — owner requests (r67; fictional demo school only, in-memory database):
 *  1. ONE way to build a NAFS test: one builder with three starts (a model booklet · all 13 standards · standards /
 *     skills I choose), the same options for every start, the question list with "✨ write new with AI" as an add
 *     source; the old six modes and duplicate entry points are gone and their old links redirect;
 *  2. every skill / standard checklist: "Select all" / "Clear" per group and overall, the questions behind the
 *     selection visible right there (count, preview, difficulty filter) and pickable;
 *  3. every code with its name ("S13 — Proposes a title…");
 *  5. the difficulty choice everywhere: Any · Easy · Medium · Hard · Mixed (%) · Adaptive (online: the adaptive engine;
 *     on paper: Mixed); the tabs Home · Dashboard · Practice · Tests · Question bank · Marking · Reports (+ About);
 *  6. 100 booklets / 200 practice sets: the set pickers and filters (search by title / genre / kind, paginated).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { teacherRoster } from "../src/server/teacher/assign";
import { ADAPTIVE_FALLBACK_MIX, codeName, codeShort, DIFFICULTY_CHOICES, MOE_AREAS, MOE_STANDARDS, NAFS_DOMAINS, NAFS_SKILLS } from "../src/server/nafs/framework";
import { nafsBankChanged, nafsBankPage, nafsIndex, saveNafsQuestion } from "../src/server/nafs/bank";
import { adaptiveTargets, assignNafsTestOnline, builderPractice, cleanDifficultyMix, isAdaptiveTest, setChoices } from "../src/server/nafs/build";
import { nafsClasses, saveNafsTest } from "../src/server/nafs/tests";
import { createNafsPractice, practiceMix, questionsForMix } from "../src/server/nafs/practice";
import { builderHref, CENTER_TABS, LEGACY_MODE_START, legacyBuilderRedirect, OLD_TABS } from "../src/server/nafs/center";
import { nafsGroups, STARTS, startOfMode } from "../src/components/nafs/builder-starts";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const arr = (v: unknown): string[] => (typeof v === "string" ? JSON.parse(v) : (v as string[]));
const walk = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(f) ? [p] : []; });
const NAFS_UI = [...walk("src/app/teacher/nafs"), ...walk("src/components/nafs")];

describe("1 · ONE NAFS test builder (no duplicates)", () => {
  test("three starts, one builder component; the old six-mode builders are gone", () => {
    assert.deepEqual(STARTS.map((x) => x.key), ["BOOKLET", "ALL", "CHOOSE"]);
    for (const x of STARTS) { assert.ok(hasAr(x.title), x.title); assert.ok(hasAr(x.text), x.text); }
    assert.ok(!existsSync(join(ROOT, "src/components/nafs/test-builder.tsx")), "the old builder (6 modes) is removed");
    assert.ok(!existsSync(join(ROOT, "src/components/nafs/full-test-builder.tsx")), "the separate complete-test builder is merged");
    const page = read("src/app/teacher/nafs/tests/new/page.tsx");
    assert.match(page, /<NafsBuilder /);
    const b = read("src/components/nafs/nafs-builder.tsx");
    // step 1 · step 2 (for every start) · step 3
    assert.match(b, /t\("Start from"\)[\s\S]*t\("Options"\)[\s\S]*t\("The questions"\)/);
    for (const x of ["Number of questions", "Time (minutes)", "<DifficultyPicker", "Test or practice"]) assert.ok(b.includes(x), x);
    // step 3: replace · remove · reorder · add from the bank · write new with AI (an add source, not a mode)
    for (const x of ["replaceAction", "remove(r.id)", "move(i, -1)", "bankSearchAction", "aiDraftsAction", "approveDraftsAction", "Write new with AI"]) assert.ok(b.includes(x), x);
    // the model booklet: a picker of all booklets (combobox) + a random one
    assert.match(b, /RANDOM/);
    assert.match(b, /<Combo id="nb-pick"/);
    // no leftover modes
    for (const old of ["Generate new questions with AI", "\"MANUAL\" | \"AI\"", "ModeNav"]) assert.ok(!b.includes(old), old);
  });

  test("old URLs keep working: ?mode=… redirects to the matching start (parameters kept), old tab keys redirect", () => {
    const want: Record<string, string> = { FULL: "ALL", MINISTRY: "BOOKLET", SIMULATION: "CHOOSE", AUTO: "CHOOSE", MANUAL: "CHOOSE", AI: "CHOOSE" };
    for (const [mode, start] of Object.entries(want)) {
      assert.equal(LEGACY_MODE_START[mode].start, start, mode);
      const to = new URL(legacyBuilderRedirect({ mode, purpose: "PRACTICE", class: "k1", codes: "MOE.S04,MOE.S07", id: "t9" })!, "http://x");
      assert.equal(to.pathname, "/teacher/nafs/tests/new");
      assert.equal(to.searchParams.get("start"), start);
      assert.equal(to.searchParams.get("purpose"), "PRACTICE");
      assert.equal(to.searchParams.get("class"), "k1");
      assert.equal(to.searchParams.get("codes"), "MOE.S04,MOE.S07");
      assert.equal(to.searchParams.get("id"), "t9");
    }
    assert.equal(new URL(legacyBuilderRedirect({ mode: "AI" })!, "http://x").searchParams.get("add"), "AI");
    assert.equal(new URL(legacyBuilderRedirect({ mode: "SIMULATION" })!, "http://x").searchParams.get("shape"), "BOOKLET");
    assert.equal(legacyBuilderRedirect({ start: "ALL" }), null, "a new link is not redirected");
    assert.equal(legacyBuilderRedirect({}), null);
    // the page redirects BEFORE anything else
    const page = read("src/app/teacher/nafs/tests/new/page.tsx");
    assert.ok(page.indexOf("legacyBuilderRedirect(sp)") > 0 && page.indexOf("legacyBuilderRedirect(sp)") < page.indexOf("await requireActor"));
    // old tabs
    assert.equal(OLD_TABS.sheets, "marking");
    assert.match(read("src/app/teacher/nafs/page.tsx"), /centerRedirect\(sp\)/); // owner r69: old tabs and old report views redirect
    // a saved test's mode → its start
    assert.equal(startOfMode("FULL"), "ALL");
    assert.equal(startOfMode("MINISTRY", { booklet: "NB-001" }), "BOOKLET");
    assert.equal(startOfMode("MINISTRY", {}), "ALL");
    for (const m of ["SIMULATION", "AUTO", "MANUAL"]) assert.equal(startOfMode(m), "CHOOSE");
    assert.equal(builderHref({ start: "CHOOSE", classId: "k", codes: ["MOE.S02"] }), "/teacher/nafs/tests/new?start=CHOOSE&class=k&codes=MOE.S02");
  });

  test("no capability twice: the tabs, one entry point to the builder, no old links left", () => {
    assert.deepEqual(CENTER_TABS.map((x) => x.label), ["Adaptive", "NAFS test", "Ministry booklets", "Reports", "Suggested plan", "Question bank", "Marking"]); // owner r69
    assert.equal(new Set(CENTER_TABS.map((x) => x.key)).size, CENTER_TABS.length);
    for (const x of CENTER_TABS) assert.ok(hasAr(x.label), x.label);
    assert.match(read("src/app/teacher/nafs/page.tsx"), /About NAFS/);
    for (const f of [...NAFS_UI, ...walk("src/server/nafs")]) {
      const src = read(f);
      assert.doesNotMatch(src, /tests\/new\?mode=/, `${f}: no old builder link`);
      assert.doesNotMatch(src, /tab=sheets/, `${f}: bubble sheets live in Marking`);
      assert.doesNotMatch(src, /FullTestTile/, `${f}: the complete test is a start of the builder, not a second tile`);
    }
    // the builder's three starts are listed on the Tests tab only (Home links to the tools)
    assert.match(read("src/components/nafs/tests-tab.tsx"), /STARTS\.map/);
    // (owner r69: Home was merged into Reports)
    // the Dashboard's "Make a test on these standards" opens the one builder
    assert.match(read("src/server/nafs/dashboard.ts"), /\["start", "CHOOSE"\]/);
  });
});

describe("2 · checklists: select all / clear, the questions behind the selection", () => {
  test("groups with Select all / Clear each and for everything; the questions listed, previewed, filtered and pickable", () => {
    const src = read("src/components/nafs/target-checklist.tsx");
    assert.ok((src.match(/t\("Select all"\)/g) ?? []).length >= 2, "Select all overall and per group");
    assert.ok((src.match(/t\("Clear"\)/g) ?? []).length >= 3, "Clear overall, per group and for the picked questions");
    for (const x of ["targetQuestionsAction", "The questions behind your choice", "found.total", "r.options.map", "DIFFICULTY_NAME", "Choose this question", "pickName"]) assert.ok(src.includes(x), x);
    const groups = nafsGroups({ areas: MOE_AREAS, standards: MOE_STANDARDS, domains: NAFS_DOMAINS.filter((d) => d.code !== "PIRLS"), skills: NAFS_SKILLS.filter((k) => k.domain !== "PIRLS") }, (x) => x);
    assert.deepEqual(groups.map((g) => g.key), ["VOC", "CA", "EV", "RC", "IAE", "V"]);
    assert.equal(groups.slice(0, 3).reduce((a, g) => a + g.items.length, 0), 13);
    assert.equal(groups[2].items.find((i) => i.code === "MOE.S13")!.label, "S13 — Proposes a title, a different ending and solutions to problems or ideas in the text.");
    // Adaptive practice and the builder use it; the practice form sends the targets and the picked questions
    assert.match(read("src/components/nafs/practice-tab.tsx"), /<TargetChecklist name="target" pickName="pick" mcqOnly/);
    assert.match(read("src/components/nafs/nafs-builder.tsx"), /<TargetChecklist /);
  });
});

describe("3 · every code with its name", () => {
  test("codeName / codeShort", () => {
    assert.equal(codeName("MOE.S13"), "S13 — Proposes a title, a different ending and solutions to problems or ideas in the text.");
    assert.equal(codeName("P2"), "P2 — Make straightforward inferences");
    assert.equal(codeName("NAFS.P4"), "P4 — Evaluate and critique content and textual elements");
    assert.equal(codeName("NAFS.RC.MAIN"), "Main idea");
    assert.equal(codeName("MOE.S01", (x) => `[${x}]`), "S01 — [Identifies synonyms and antonyms of words in the text and explains their meanings.]");
    assert.equal(codeShort("MOE.S07"), "S07");
  });
  test("no bare standard code in the NAFS screens (dropdowns, chips, tables, reports)", () => {
    for (const f of NAFS_UI) {
      const src = read(f);
      // a standard's short code is never printed alone: <b …>{x.short}</b> must be followed by its text, chips use codeName
      assert.doesNotMatch(src, /MOE_BY_CODE\.get\([^)]*\)!?\??\.short\s*[:}]/, `${f}: a bare short code`);
      assert.doesNotMatch(src, />\{short\(c\)\}</, `${f}: a bare short code in a header`);
      assert.doesNotMatch(src, /\{x\.short\}<\/th>/, `${f}: a header without the name`);
    }
    for (const f of ["src/components/nafs/bank-tab.tsx", "src/components/nafs/nafs-builder.tsx", "src/components/nafs/reports-tab.tsx", "src/components/nafs/dashboard-tab.tsx", "src/app/teacher/nafs/tests/[id]/page.tsx"]) assert.match(read(f), /codeName\(|CodeHead/, f);
  });
});

describe("5 · the difficulty choice everywhere, with Adaptive", () => {
  test("Any · Easy · Medium · Hard · Mixed · Adaptive — offered by the builder and Adaptive practice", () => {
    assert.deepEqual(DIFFICULTY_CHOICES.map((x) => x.key), ["ANY", "1", "2", "3", "MIX", "ADAPTIVE"]);
    for (const x of DIFFICULTY_CHOICES) assert.ok(hasAr(x.label), x.label);
    assert.match(read("src/components/nafs/practice-tab.tsx"), /<DifficultyPicker name="difficulty" defaultValue="ADAPTIVE"/);
    assert.match(read("src/components/nafs/nafs-builder.tsx"), /<DifficultyPicker /);
    // a printed adaptive test (and its first list) is Mixed
    assert.deepEqual(cleanDifficultyMix("ADAPTIVE"), ADAPTIVE_FALLBACK_MIX);
    assert.equal(isAdaptiveTest({ adaptive: true }), true);
    assert.equal(isAdaptiveTest({ difficulty: "ADAPTIVE" }), true);
    assert.equal(isAdaptiveTest({ difficulty: { 1: 30, 2: 40, 3: 30 } }), false);
    // practice: adaptive / any = the engine over every level; a level or a mix limits the questions
    assert.equal(practiceMix("ADAPTIVE"), null);
    assert.equal(practiceMix("ANY"), null);
    assert.deepEqual(practiceMix("3"), { 1: 0, 2: 0, 3: 100 });
    assert.deepEqual(practiceMix(JSON.stringify({ 1: 50, 2: 50, 3: 0 })), { 1: 50, 2: 50, 3: 0 });
  });

  test("questionsForMix: the mix shared over the levels and the targets, a single level stays strict", () => {
    let k = 0;
    const e = (difficulty: 1 | 2 | 3, standard: string) => ({ id: `q${++k}`, nafsCode: "NAFS.RC.MAIN", process: "P3" as const, domain: "RC" as const, passageId: null, own: true, hidden: false, draft: false, copyOfId: null, cat: null, standard, kind: "MCQ" as const, booklet: null, bookletN: null, practiceSet: null, difficulty });
    const pool = [...Array.from({ length: 10 }, (_, i) => e(((i % 3) + 1) as 1 | 2 | 3, "MOE.S04")), ...Array.from({ length: 10 }, (_, i) => e(((i % 3) + 1) as 1 | 2 | 3, "MOE.S07"))];
    const by = new Map(pool.map((x) => [x.id, x]));
    const hard = questionsForMix(pool, ["MOE.S04", "MOE.S07"], { 1: 0, 2: 0, 3: 100 }, 20, "s");
    assert.ok(hard.length > 0 && hard.every((id) => by.get(id)!.difficulty === 3), "only Hard");
    assert.ok(hard.some((id) => by.get(id)!.standard === "MOE.S04") && hard.some((id) => by.get(id)!.standard === "MOE.S07"), "both targets");
    const mix = questionsForMix(pool, ["MOE.S04", "MOE.S07"], { 1: 50, 2: 50, 3: 0 }, 10, "s");
    assert.equal(mix.length, 10);
    assert.ok(mix.every((id) => by.get(id)!.difficulty !== 3));
    assert.equal(new Set(mix).size, mix.length, "no repeats");
  });
});

// ------------------------------------------------------------------ in the demo school (in-memory database)

let repo: SqliteRepo;
let g6: Actor;
let klassId = "";
const made: string[] = [];

before(async () => {
  ({ repo } = await demoDatabase());
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
  const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
  let i = grades.findIndex((g) => g.includes(6));
  if (i < 0) {
    i = 0;
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
    const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
    await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
  }
  g6 = teachers[i];
  klassId = (await nafsClasses(repo, g6))[0].id;
  for (const code of ["MOE.S04", "MOE.S07"]) for (let k = 0; k < 6; k++) {
    const x = MOE_STANDARDS.find((y) => y.code === code)!;
    const r = await saveNafsQuestion(repo, g6, { nafsCode: x.nafs.find((c) => !c.startsWith("NAFS.P"))!, standard: code, difficulty: (k % 3) + 1, stem: `${x.short} builder-one question ${k + 1}?`, options: [`a${code}${k}`, `b${code}${k}`, `c${code}${k}`, `d${code}${k}`], correct: 2 });
    made.push(r.id);
  }
  nafsBankChanged(repo, g6.schoolId!);
});

describe("in the school's NAFS center", () => {
  test("the questions behind a selection: any of the targets, a difficulty, each with its options and key (paginated)", async () => {
    const all = await nafsBankPage(repo, g6, { targets: ["MOE.S04", "MOE.S07"], size: 5 });
    assert.ok(all.total >= 12);
    assert.equal(all.rows.length, 5);
    assert.ok(all.pages >= 3, "paginated");
    assert.ok(all.rows.every((r) => r.standard === "MOE.S04" || r.standard === "MOE.S07"));
    const mine = all.rows.find((r) => made.includes(r.id));
    if (mine) { assert.equal(mine.options.length, 4); assert.equal(mine.correct, 2); }
    const hard = await nafsBankPage(repo, g6, { targets: ["MOE.S04"], difficulty: 3, size: 50 });
    assert.ok(hard.total >= 2 && hard.rows.every((r) => r.difficulty === 3 && r.standard === "MOE.S04"));
    // the picked questions of a checklist go into the practice
    const ids = hard.rows.filter((r) => made.includes(r.id)).map((r) => r.id);
    const p = await createNafsPractice(repo, g6, { title: "Picked", targets: ["MOE.S04"], questionIds: ids, classId: klassId });
    assert.deepEqual(arr((await repo.findUnique("NafsPractice", { id: p.id }))!.questionIds).sort(), [...ids].sort());
  });

  test("a practice with a fixed difficulty keeps to it; Adaptive leaves every level to the engine", async () => {
    const idx = new Map((await nafsIndex(repo, g6.schoolId!)).map((e) => [e.id, e]));
    const hard = await createNafsPractice(repo, g6, { title: "Hard only", targets: ["MOE.S07"], classId: klassId, difficulty: "3" });
    const qs = arr((await repo.findUnique("NafsPractice", { id: hard.id }))!.questionIds);
    assert.ok(qs.length >= 2 && qs.every((id) => idx.get(id)!.difficulty === 3));
    const ad = await createNafsPractice(repo, g6, { title: "Adaptive", targets: ["MOE.S07"], classId: klassId, difficulty: "ADAPTIVE" });
    assert.equal((await repo.findUnique("NafsPractice", { id: ad.id }))!.questionIds ?? null, null);
    // the builder's "Practice" purpose: the list's standards as targets
    const b = await builderPractice(repo, g6, { title: "From the builder", classId: klassId, questionIds: made.slice(0, 4) });
    assert.deepEqual(arr((await repo.findUnique("NafsPractice", { id: b.id }))!.targets), ["MOE.S04"]);
  });

  test("an ADAPTIVE test goes online through the adaptive engine (NAFS tables only); a fixed test as it is", async () => {
    const ids = made.slice(0, 8);
    const adaptiveId = await saveNafsTest(repo, g6, { title: "Adaptive NAFS", mode: "AUTO", questionIds: ids, timeLimitMin: 30, settings: { difficulty: "ADAPTIVE", adaptive: true, targets: ["MOE.S04", "MOE.S07"] } });
    assert.deepEqual(await adaptiveTargets(repo, g6, { adaptive: true }, ids), ["MOE.S04", "MOE.S07"], "the test's standards when none were saved");
    const before = await repo.count("NafsTestClass", {});
    const r = await assignNafsTestOnline(repo, g6, { testId: adaptiveId, classId: klassId });
    assert.equal(r.adaptive, true);
    assert.equal(await repo.count("NafsTestClass", {}), before, "not a fixed online test");
    const p = (await repo.findUnique("NafsPractice", { id: r.practiceId! }))!;
    assert.deepEqual(arr(p.targets), ["MOE.S04", "MOE.S07"]);
    assert.equal(Number(p.maxQuestions), 8);
    assert.equal(Number(p.timeLimitMin), 30);
    const fixedId = await saveNafsTest(repo, g6, { title: "Fixed NAFS", mode: "AUTO", questionIds: ids, timeLimitMin: 30, settings: { difficulty: { 1: 30, 2: 40, 3: 30 } } });
    const f = await assignNafsTestOnline(repo, g6, { testId: fixedId, classId: klassId });
    assert.equal(f.adaptive, false);
    assert.equal(await repo.count("NafsTestClass", { testId: fixedId }), 1);
  });

  test("6 · booklets and practice sets: one cached pass, sorted by number, searchable by title / genre / kind; the bank filters one set", async () => {
    const sets = await setChoices(repo, g6, "ALL");
    const codes = sets.map((x) => x.code);
    assert.deepEqual(codes, [...codes].sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
    for (const x of sets) { assert.ok(x.questions > 0); assert.ok(x.kind === null || x.kind === "LIT" || x.kind === "INFO"); }
    if (sets.length) {
      const one = sets[0].code;
      const page = await nafsBankPage(repo, g6, { set: one, size: 50 });
      assert.ok(page.total > 0 && page.rows.every((r) => r.booklet === one || r.practiceSet === one));
    }
    // the pickers: a combobox over every booklet / set with the genre and kind as search words
    const b = read("src/components/nafs/nafs-builder.tsx");
    assert.match(b, /keywords: `\$\{b\.genre\}/);
    assert.match(read("src/components/nafs/bank-tab.tsx"), /<Combo name="set"/);
    // r84: from the light catalogs (titles, kinds, genres), never the files' full text
    assert.match(read("src/server/nafs/build.ts"), /bookletCatalog\(\)\?\.list \?\? \[\]\), \.\.\.\(practiceCatalog\(\)\?\.list \?\? \[\]\)/);
  });
});
