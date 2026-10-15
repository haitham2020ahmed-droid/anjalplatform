/**
 * 📒 My Words = the one home of vocabulary (owner's request) — FAKE data only (in-memory demo school):
 *  - the reading hub keeps ReadMaster and ReadRise only; Fluency Coach and My Words have their own menu entries
 *  - My Words: tab "Curriculum words" (the Curriculum Map words of Grades 4, 5, 6, Grade → Unit → Selection, with
 *    explanations; my own grade first, any grade can be browsed) + tab "Words I saved" (review, quiz, journal, ⭐ unit
 *    words, the words I looked up)
 *  - Learn has no Words section of its own any more: it links to My Words; old /student/learn/words links redirect;
 *    assigned words in My Work open My Words
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { navItemsFor, searchablePagesFor } from "../src/components/nav-items";
import { studentWords } from "../src/server/learn/words";
import { ar as AR } from "../src/i18n/ar";

const read = (f: string) => readFileSync(`${ROOT}/${f}`, "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("📒 My Words: the curriculum words + the words I saved, in one place", () => {
  let repo: SqliteRepo; let student: Actor; let grade = 0;

  before(async () => {
    ({ repo } = await demoDatabase());
    const sid = String((await repo.findMany("Student", {}))[0].id);
    const st = (await repo.findUnique("Student", { id: sid }))!;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: String(st.userId) }))!);
    grade = Number((await repo.findUnique("Grade", { id: String(st.gradeId) }))!.level);
  });

  test("menu: My Words and Fluency are their own entries; the reading hub keeps ReadMaster and ReadRise only", () => {
    const items = navItemsFor("STUDENT", { nafs: false });
    assert.deepEqual(items.map((i) => i.href), ["/student", "/student/work", "/student/skills", "/student/plans", "/student/tests", "/student/map", "/student/reading", "/student/learn", "/student/words", "/student/fluency-coach"]);
    assert.deepEqual(items.slice(-2).map((i) => i.label), ["My Words", "Fluency"]);
    for (const i of items) assert.ok(i.line && AR[i.label as keyof typeof AR], `${i.label}: line icon and Arabic`);
    const pages = searchablePagesFor("STUDENT");
    assert.equal(new Set(pages.map((p) => p.href)).size, pages.length, "each page once");
    const hub = code("src/app/student/reading/page.tsx");
    assert.match(hub, /href="\/student\/readmaster"/);
    assert.match(hub, /href="\/student\/readrise"/);
    assert.doesNotMatch(hub, /fluency-coach|\/student\/words/);
  });

  test("Learn links to My Words; the old Learn → Words address redirects there (grade / unit / selection kept)", () => {
    const learn = code("src/app/student/learn/page.tsx");
    assert.match(learn, /href="\/student\/words"/);
    assert.doesNotMatch(learn, /\/student\/learn\/words/);
    const old = code("src/app/student/learn/words/page.tsx");
    assert.match(old, /redirect\(`\/student\/words/);
    assert.match(old, /\["preview", "grade", "unit", "sel"\]/);
    assert.match(code("src/server/student/all-work.ts"), /`\/student\/words\?sel=\$\{encodeURIComponent/);
  });

  test("My Words page: two tabs; Curriculum words (default) with the Grade → Unit → Selection filter, Words I saved keeps every feature", () => {
    const page = code("src/app/student/words/page.tsx");
    assert.match(page, /label: "Curriculum words"/);
    assert.match(page, /label: "Words I saved"/);
    assert.match(page, /sp\.tab === "saved"/);
    assert.match(page, /<WordsFilter base="\/student\/words"/);
    assert.match(page, /studentWords\(repo, actor, \{ grade: sp\.grade, unit: sp\.unit, sel: sp\.sel \}\)/);
    assert.match(page, /<WordCardView /);
    assert.match(page, /<WordPractice /);
    for (const f of ["reviewToday", "notebook", "wordQuiz", "unitWords", "journalAction", "starWordAction", "wordQuizAction", "/student/words/review", "/student/words/clues"]) assert.ok(page.includes(f), `saved tab keeps ${f}`);
    // the saved tab's own forms come back to it
    const actions = code("src/app/student/words/actions.ts");
    assert.equal((actions.match(/\/student\/words\?tab=saved&/g) ?? []).length, 3);
    for (const s of ["Curriculum words", "Words I saved", "The words of your Curriculum Map and the words you saved while reading.", "My Words", "Fluency"]) assert.ok(AR[s as keyof typeof AR], `Arabic: ${s}`);
  });

  test("the student sees their own grade first and can browse Grades 4, 5 and 6", async () => {
    const mine = await studentWords(repo, student, {});
    assert.deepEqual(mine.grades, [4, 5, 6]);
    assert.equal(mine.grade, grade, "own grade first");
    for (const g of [4, 5, 6]) {
      const v = await studentWords(repo, student, { grade: g });
      assert.equal(v.grade, g);
      assert.ok(v.selections.length > 0, `Grade ${g}: its selections can be browsed`);
      // (Grade 6's word lists arrive with its word file; until then its selections show "No words … yet")
      if (g === 6 && !v.selections.some((x) => x.words > 0)) continue;
      const withWords = v.selections.find((x) => x.words > 0);
      assert.ok(withWords, `Grade ${g}: selections with words`);
      const one = await studentWords(repo, student, { grade: g, sel: withWords.key });
      assert.equal(one.grade, g);
      assert.ok(one.view && one.view.words.length === withWords.words, `Grade ${g}: a selection shows all its words`);
    }
  });
});
