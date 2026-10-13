/**
 * 🧩 Every skill in every skill picker + 🪜 the student's progress bar.
 *
 * Pickers: on the demo school with the gap sets loaded, every name of tests/fixtures/all-skills.json that the school
 * has is in the data of each picker (Live Challenge, test builder, worksheets / week plan, Assignments → New, QR skill
 * games, writing tasks, ReadMaster, admin AI tools) and its search finds it — whatever the case, "&" / "and" or
 * apostrophe, and by either name of a shared pool. One row per pool, A–Z, every row in one of the four domain tabs,
 * the pool's published count (0 → shown disabled), never the hidden "Unclassified".
 *
 * Progress bar: five friendly steps over the same bands, a visible start at 0, the next step, role=progressbar,
 * no level / tier words.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { addSkillSets, loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { countQuestionsOfSkills, schoolSkillIndex } from "../src/server/questions/skill-questions";
import { masterSkills } from "../src/server/skills/master";
import { skillPickerList } from "../src/server/skills/picker";
import { challengeSkills } from "../src/server/game/live-challenge";
import { builderSkills } from "../src/server/tests/assessments";
import { pickerSkills } from "../src/server/teacher/worksheet";
import { writingSkillOptions } from "../src/server/teacher/writing";
import { accessibleClasses } from "../src/server/teacher/assign";
import { filterSkills, skillMatches, skillSearchKey, skillTabOf, SKILL_TABS, type PickerSkill, type SkillTab } from "../src/lib/skill-picker";
import { correctAnswersToNext, MASTERY_STEPS, MIN_FILL, nextStepText, progressText, segmentFills, stepLabel } from "../src/lib/mastery-steps";
import { BandMeter } from "../src/components/curriculum/band-meter";
import { I18nProvider } from "../src/i18n/client";
import { ar } from "../src/i18n/ar";
import { DEFAULT_MASTERY } from "../src/config/engine";

const NAMES: string[] = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/all-skills.json"), "utf8"));
const variants = (n: string) => [...new Set([n, n.replace(/&/g, "and"), n.replace(/'/g, "’"), n.toLowerCase(), n.toUpperCase(), `  ${n}  `])];
type Row = { id: string; name: string; names?: readonly string[]; tab: SkillTab };
const TABS = new Set(["READING", "GRAMMAR", "VOCABULARY", "WRITING"]);

describe("🧩 every skill in every skill picker", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = ""; let classId = "";
  /** each fixture name the school has → its skill ids and the grades of its whole pool */
  let present: { name: string; ids: string[]; poolGrades: number[] }[] = [];

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
    classId = String((await accessibleClasses(repo, teacher))[0].id);
    const gap = (await loadSkillSetsFile("gap-skill-sets.json")).map((x) => ({ ...x, questions: x.questions.slice(0, 2) }));
    const r = await addSkillSets(repo, schoolId, gap);
    assert.deepEqual(r.flatMap((x) => x.errors), []);
    const idx = await schoolSkillIndex(repo, schoolId);
    present = NAMES.map((name) => {
      const ks = [...idx.skillOf.values()].filter((k) => k.isActive && skillSearchKey(k.name) === skillSearchKey(name) && !k.code.endsWith(".curriculum-map-unclassified"));
      const pool = ks.flatMap((k) => idx.members.get(idx.keyOf.get(k.id)!) ?? [k.id]);
      return { name, ids: ks.map((k) => k.id), poolGrades: [...new Set(pool.map((id) => idx.gradeOf.get(id)!))] };
    }).filter((x) => x.ids.length);
    assert.ok(present.length >= 140, `the demo school has ${present.length} of the ${NAMES.length} names`);
  });

  /** every present name (of `grade` when given) is a row of `rows` and the search finds that row */
  function complete(label: string, rows: readonly Row[], grade?: number) {
    let checked = 0;
    for (const x of present) {
      if (grade && !x.poolGrades.includes(grade)) continue;
      const row = rows.find((k) => [k.name, ...(k.names ?? [])].some((n) => skillSearchKey(n) === skillSearchKey(x.name)));
      assert.ok(row, `${label}: ${x.name} is listed`);
      for (const q of variants(x.name)) assert.ok(filterSkills(rows, q).some((k) => k.id === row.id), `${label}: search "${q}" finds ${x.name}`);
      checked++;
    }
    assert.ok(checked > 0, `${label}: checked some names`);
    return checked;
  }

  test("the one source: every active skill, one row per pool, A–Z, a tab each, pooled counts, no hidden skill", async () => {
    const rows = await skillPickerList(repo, teacher);
    const master = await masterSkills(repo, schoolId);
    const idx = await schoolSkillIndex(repo, schoolId);
    // every active skill of the school is in a row (as itself or as its pool); no row twice
    const inRows = new Set(rows.flatMap((k) => k.skillIds));
    for (const k of master) assert.ok(inRows.has(k.id), `${k.name} (Grade ${k.grade}) is in the picker`);
    assert.equal(new Set(rows.map((k) => k.id)).size, rows.length);
    assert.equal(new Set(rows.map((k) => idx.keyOf.get(k.id))).size, rows.length, "one row per shared pool");
    assert.ok(rows.every((k) => !k.code.endsWith(".curriculum-map-unclassified")), "never the hidden Unclassified skill");
    assert.ok(rows.every((k) => TABS.has(k.tab)), "every row in a domain tab");
    for (const tab of ["READING", "GRAMMAR", "VOCABULARY", "WRITING"] as const) assert.ok(rows.some((k) => k.tab === tab), `${tab} tab has skills`);
    const allTabs = SKILL_TABS.filter((t) => t.key !== "ALL").reduce((n, t) => n + filterSkills(rows, "", t.key).length, 0);
    assert.equal(allTabs, rows.length, "the tabs together hold every row exactly once");
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.name.localeCompare(b.name));
    assert.deepEqual(rows.map((k) => k.id), sorted.map((k) => k.id), "A–Z");
    const pooled = await countQuestionsOfSkills(repo, schoolId, rows.map((k) => k.id));
    for (const k of rows) assert.equal(k.questions, pooled.get(k.id), `${k.name}: the pool's published count`);
    assert.ok(rows.some((k) => k.questions === 0), "skills without questions are listed too (shown disabled)");
    // the teacher's own grade stands for a shared skill
    for (const k of rows) if (k.skillIds.some((id) => idx.gradeOf.get(id) === 4)) assert.equal(k.grade, 4, `${k.name}: the Grade 4 copy`);
    await assert.rejects(skillPickerList(repo, { ...teacher, role: "STUDENT" } as Actor), ForbiddenError);
  });

  test("a shared pool is found by either name", async () => {
    const rows = await skillPickerList(repo, admin);
    const multi = rows.filter((k) => k.names.length > 1);
    assert.ok(multi.length > 0, "some pools have two names");
    for (const k of multi) for (const n of k.names) {
      assert.ok(filterSkills(rows, n).some((x) => x.id === k.id), `"${n}" finds ${k.name}`);
      assert.ok((await skillPickerList(repo, admin, { q: n.toLowerCase().replace(/&/g, "and") })).some((x) => x.id === k.id));
    }
  });

  test("Live Challenge (teacher and admin): every skill, search by any spelling, 0 Q rows kept", async () => {
    for (const who of [teacher, admin]) {
      const rows = (await challengeSkills(repo, who, {})).map((k) => ({ ...k, tab: k.filter }));
      complete(`Live Challenge (${who.role})`, rows);
      assert.ok(rows.some((k) => k.fitting === 0), "skills without fitting questions are listed (disabled)");
      for (const x of present.slice(0, 25)) for (const q of variants(x.name)) assert.ok((await challengeSkills(repo, who, { q })).some((k) => [k.name, ...k.names].some((n) => skillSearchKey(n) === skillSearchKey(x.name))), `server search "${q}"`);
      for (const tab of ["READING", "GRAMMAR", "VOCABULARY", "WRITING"] as const) assert.ok((await challengeSkills(repo, who, { filter: tab })).every((k) => k.filter === tab));
    }
  });

  test("test builder, worksheets / week plan, Assignments → New", async () => {
    complete("Test builder", (await builderSkills(repo, teacher)).map((k) => ({ ...k, tab: k.filter })));
    for (const x of present.slice(0, 25)) for (const q of variants(x.name)) assert.ok((await builderSkills(repo, teacher, { q })).some((b) => b.skillIds.some((id) => x.ids.includes(id))), `builder search "${q}"`);
    complete("Worksheets / week plan", await pickerSkills(repo, teacher));
    complete("Worksheets (admin)", await pickerSkills(repo, admin));
    complete("Assignments → New", await skillPickerList(repo, teacher, { preferGrade: 4 }));
  });

  test("grade-bound pickers: QR skill games, writing tasks, ReadMaster and AI tools list every skill of the grade", async () => {
    complete("QR skill games (Grade 4)", await skillPickerList(repo, teacher, { onlyGrade: 4 }), 4);
    const writing = await writingSkillOptions(repo, teacher, classId);
    complete("Writing tasks", writing, 4);
    assert.ok(writing.some((k) => k.tab === "WRITING"), "the Writing tab has the writing skills");
    for (const g of [4, 5, 6]) {
      const rows = await skillPickerList(repo, admin, { onlyGrade: g });
      complete(`ReadMaster / AI tools (Grade ${g})`, rows, g);
      assert.ok(rows.every((k) => k.grade === g), "that grade's copy");
    }
  });

  test("every picker page reads the one source and shows search + tabs", () => {
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
    for (const f of ["src/server/game/live-challenge.ts", "src/server/tests/assessments.ts", "src/server/teacher/worksheet.ts", "src/server/teacher/writing.ts", "src/app/teacher/assignments/new/page.tsx", "src/app/teacher/games/qr/page.tsx", "src/app/admin/readmaster/page.tsx", "src/app/admin/ai-tools/page.tsx"])
      assert.match(read(f), /skillPickerList|pickerSkills/, `${f} reads the one source`);
    for (const f of ["src/components/game/challenge-setup.tsx", "src/app/teacher/assessments/new/test-builder.tsx", "src/components/skill-picker/skill-list-picker.tsx", "src/components/skill-picker/skill-search-select.tsx"]) {
      const src = read(f);
      assert.match(src, /filterSkills/, `${f} searches with the shared rules`);
      assert.match(src, /Search skills…/, `${f} has the search box`);
    }
    for (const f of ["src/components/game/challenge-setup.tsx", "src/app/teacher/assessments/new/test-builder.tsx", "src/components/skill-picker/skill-list-picker.tsx"]) assert.match(read(f), /SKILL_TABS/);
    for (const f of ["src/app/teacher/worksheet/page.tsx", "src/app/teacher/week/page.tsx", "src/app/teacher/assignments/new/assignment-form.tsx", "src/app/teacher/games/qr/page.tsx", "src/app/teacher/writing/page.tsx", "src/app/admin/readmaster/page.tsx"])
      assert.match(read(f), /<SkillListPicker /, `${f} shows the skill list picker`);
    assert.match(read("src/components/skill-picker/skill-list-picker.tsx"), /questionBadge/);
  });
});

describe("🔎 the shared search rules", () => {
  test("case, & / and, apostrophes, spaces and either name", () => {
    const k = { name: "Character Traits & Development", names: ["Character Traits & Development", "Character Growth"] };
    for (const q of ["character traits and development", "CHARACTER TRAITS & DEVELOPMENT", "  character   traits ", "char dev", "growth", "Character Growth"]) assert.ok(skillMatches(k, q), q);
    assert.ok(!skillMatches(k, "theme"));
    assert.ok(skillMatches({ name: "Author's Purpose" }, "author’s purpose"));
    assert.ok(skillMatches({ name: "Author’s Purpose" }, "authors purpose"));
    assert.equal(skillSearchKey("Author’s  Purpose & Point-of-View"), "authors purpose and point of view");
  });
  test("every domain has one tab", () => {
    assert.equal(skillTabOf("READING"), "READING");
    assert.equal(skillTabOf("LITERATURE"), "READING");
    assert.equal(skillTabOf("SPEAKING_LISTENING"), "READING");
    assert.equal(skillTabOf("GRAMMAR"), "GRAMMAR");
    assert.equal(skillTabOf("LANGUAGE"), "GRAMMAR");
    assert.equal(skillTabOf("READING", "g4.grammar.nouns"), "GRAMMAR");
    assert.equal(skillTabOf("VOCABULARY"), "VOCABULARY");
    assert.equal(skillTabOf("WORD_STUDY"), "VOCABULARY");
    assert.equal(skillTabOf("WRITING"), "WRITING");
    assert.equal(skillTabOf(""), "READING");
  });
  test("tab filter + A–Z", () => {
    const rows: PickerSkill[] = ["b", "A", "c"].map((n, i) => ({ id: String(i), name: n, names: [n], code: "", grade: 4, tab: i === 2 ? "WRITING" : "READING", questions: i, skillIds: [String(i)] }));
    assert.deepEqual(filterSkills(rows).map((k) => k.name), ["A", "b", "c"]);
    assert.deepEqual(filterSkills(rows, "", "WRITING").map((k) => k.name), ["c"]);
  });
});

describe("🪜 the student's progress bar", () => {
  const html = (el: React.ReactElement, lang: "en" | "ar" = "en") => renderToStaticMarkup(React.createElement(I18nProvider, { lang }, el));
  const meter = (band: string, score: number, started = true, answered?: number) => React.createElement(BandMeter, { band: band as never, score, started, answered });

  test("five steps over the engine's bands (same thresholds)", () => {
    assert.deepEqual(MASTERY_STEPS.map((s) => s.label), ["Getting started", "Building", "Strengthening", "Nearly there", "Mastered"]);
    assert.deepEqual(MASTERY_STEPS.map((s) => s.band), ["BEGINNING", "DEVELOPING", "APPROACHING", "PROFICIENT", "MASTERED"]);
    const b = DEFAULT_MASTERY.bands;
    assert.deepEqual(MASTERY_STEPS.map((s) => s.from), [b.beginning, b.developing, b.approaching, b.proficient, b.mastered]);
    assert.equal(stepLabel("APPROACHING"), "Strengthening");
  });

  test("a small start is always visible; steps reached are full; progress inside the step", () => {
    assert.deepEqual(segmentFills("BEGINNING", 0), [MIN_FILL, 0, 0, 0, 0]);
    const mid = segmentFills("DEVELOPING", 50);
    assert.equal(mid[0], 1); assert.equal(mid[1], 0.5); assert.deepEqual(mid.slice(2), [0, 0, 0]);
    assert.deepEqual(segmentFills("MASTERED", 93), [1, 1, 1, 1, 1]);
  });

  test("the next step in correct answers (and the engine's minimum answers)", () => {
    const n0 = correctAnswersToNext("BEGINNING", 0)!;
    assert.ok(n0 >= 2 && n0 <= 6, `from 0 to Building: ${n0}`);
    assert.ok(correctAnswersToNext("BEGINNING", 38)! <= 1 + 1);
    assert.equal(correctAnswersToNext("MASTERED", 95), null);
    assert.ok(correctAnswersToNext("APPROACHING", 74, 3)! >= 5, "Nearly there needs 8 answers");
    assert.ok(correctAnswersToNext("PROFICIENT", 89, 5)! >= 10, "Mastered needs 15 answers");
    assert.match(nextStepText("BEGINNING", 0, true), /^About \d+ more correct answers to reach Building$/);
    assert.equal(nextStepText("BEGINNING", 39.5, true), "1 more correct answer to reach Building");
    assert.equal(nextStepText("BEGINNING", 0, false), "Answer your first question to begin.");
    assert.match(progressText("DEVELOPING", 45, true), /^Step 2 of 5: Building\. 45 of 100\. About \d+ more correct answers to reach Strengthening$/);
  });

  test("renders an accessible, encouraging progress bar (no 0 / 100, no level or tier words)", () => {
    const zero = html(meter("BEGINNING", 0));
    assert.match(zero, /role="progressbar"/);
    assert.match(zero, /aria-valuenow="0"/);
    assert.match(zero, /aria-valuemin="0"/); assert.match(zero, /aria-valuemax="100"/);
    assert.match(zero, /aria-valuetext="Step 1 of 5: Getting started/);
    assert.match(zero, /Getting started/);
    assert.match(zero, /more correct answers? to reach Building/);
    assert.match(zero, new RegExp(`width:${Math.round(MIN_FILL * 100)}%`), "a visible start at 0");
    assert.doesNotMatch(zero, /0 \/ 100|Beginning/);
    const mid = html(meter("APPROACHING", 68, true, 6));
    assert.match(mid, /Strengthening/); assert.match(mid, /Step 3 of 5/); assert.match(mid, /68 \/ 100/); assert.match(mid, /to reach Nearly there/);
    const top = html(meter("MASTERED", 94));
    assert.match(top, /Mastered/); assert.match(top, /bg-brand-gold/); assert.match(top, /Skill mastered/);
    const none = html(meter("BEGINNING", 0, false));
    assert.match(none, /Answer your first question to begin\./);
    for (const h of [zero, mid, top, none]) assert.doesNotMatch(h, /\b(Below|On Level|Above|Tier|RTI)\b/);
  });

  test("Arabic", () => {
    for (const k of ["Getting started", "Building", "Strengthening", "Nearly there", "Mastered", "Skill progress", "Step {n} of 5", "About {n} more correct answers to reach {step}", "1 more correct answer to reach {step}", "Answer your first question to begin.", "{step} reached", "Search skills…", "No questions for this game yet"])
      assert.ok((ar as Record<string, string>)[k], `Arabic for "${k}"`);
    const h = html(meter("DEVELOPING", 45), "ar");
    assert.match(h, /البناء/); assert.match(h, /التقوية/);
  });
});
