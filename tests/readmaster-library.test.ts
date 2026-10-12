/**
 * 📚 The ReadMaster library (Grades 4–5): the content file is complete and valid (36 original articles, one per
 * lesson, Below / On / Above × 5 questions, one correct answer each, no publisher name); the loader is idempotent and
 * publishes every article with its three versions; the lazy first load runs once per school; the student page has
 * the Grade 4 | Grade 5 tabs and groups the texts by Unit.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { autoLoadReadMasterLibrary, ensureReadMasterLibrary, LIBRARY_LABEL, libraryArticles, libraryCode, libraryState, type LibraryArticle } from "../src/server/readmaster/library";
import { openArticle, readingMinutes, readMasterHome } from "../src/server/readmaster/service";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const LEVELS = ["BELOW", "ON", "ABOVE"] as const;

describe("📚 ReadMaster library file (data/readmaster/library-g4-g5.json)", () => {
  const raw = read("data/readmaster/library-g4-g5.json");
  const file = JSON.parse(raw) as { articles: LibraryArticle[] };
  const lessons = (JSON.parse(read("data/curriculum-map/lesson-details.json")) as { grades: Record<string, Record<string, { unit: number; number: number; name: string; genre: string }>> }).grades;

  test("36 articles: every Grade 4 and Grade 5 lesson once, titled with the lesson name", () => {
    assert.equal(file.articles.length, 36);
    for (const g of ["4", "5"]) {
      const mine = file.articles.filter((a) => a.grade === Number(g));
      assert.equal(mine.length, 18, `Grade ${g}`);
      for (const l of Object.values(lessons[g])) {
        const a = mine.find((x) => x.unit === l.unit && x.lesson === l.number);
        assert.ok(a, `G${g} U${l.unit} L${l.number}`);
        assert.equal(a!.code, `G${g}-U${l.unit}-L${l.number}`);
        assert.equal(a!.title, l.name);
        assert.equal(a!.genre, l.genre);
        assert.match(a!.standard, new RegExp(`^R[LI]\\.${g}\\.\\d+$`), `${a!.code} standard of its grade`);
      }
    }
    assert.equal(new Set(file.articles.map((a) => a.code)).size, 36, "codes are unique");
  });

  test("each article: Below / On / Above with lexile and length by level, 5 questions with exactly one correct A–D", () => {
    const LEX: Record<number, Record<string, number>> = { 4: { BELOW: 600, ON: 800, ABOVE: 950 }, 5: { BELOW: 700, ON: 900, ABOVE: 1050 } };
    const RANGE: Record<string, [number, number]> = { BELOW: [140, 215], ON: [210, 310], ABOVE: [290, 400] };
    let qs = 0;
    for (const a of file.articles) {
      assert.deepEqual(Object.keys(a.versions).sort(), ["ABOVE", "BELOW", "ON"], a.code);
      for (const lv of LEVELS) {
        const v = a.versions[lv];
        assert.equal(v.lexile, LEX[a.grade][lv], `${a.code} ${lv} lexile`);
        const n = words(v.body);
        assert.ok(n >= RANGE[lv][0] && n <= RANGE[lv][1], `${a.code} ${lv}: ${n} words`);
        assert.equal(v.questions.length, 5, `${a.code} ${lv}`);
        for (const q of v.questions) {
          assert.ok(q.stem.trim() && q.why.trim(), `${a.code} ${lv} stem and explanation`);
          assert.equal(q.options.length, 4);
          assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, 4, `${a.code} ${lv}: distinct options in “${q.stem}”`);
          assert.ok(["A", "B", "C", "D"].includes(q.correct), `${a.code} ${lv}: one correct letter`);
          qs++;
        }
        assert.ok(v.questions.some((q) => /^L\.\d/.test(q.standard ?? "")), `${a.code} ${lv}: one vocabulary-in-context question`);
      }
      // the later versions are longer than the earlier ones
      assert.ok(words(a.versions.BELOW.body) < words(a.versions.ON.body) && words(a.versions.ON.body) < words(a.versions.ABOVE.body), `${a.code} lengths rise`);
    }
    assert.equal(qs, 36 * 3 * 5);
    // answers spread over A–D (not always the same letter)
    const letters = new Map<string, number>();
    for (const a of file.articles) for (const lv of LEVELS) for (const q of a.versions[lv].questions) letters.set(q.correct, (letters.get(q.correct) ?? 0) + 1);
    for (const l of ["A", "B", "C", "D"]) assert.ok((letters.get(l) ?? 0) > 80, `answer ${l} used`);
  });

  test("original content: no publisher name anywhere", () => {
    assert.doesNotMatch(raw, /wonders/i);
    assert.doesNotMatch(read("src/server/readmaster/library.ts"), /wonders/i);
  });
});

describe("📚 ReadMaster library loader and page", () => {
  let repo: SqliteRepo; let schoolId = "";
  const user = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    schoolId = String((await user("test.admin")).schoolId);
  });

  test("the first page load of a school with no articles loads the library once, in the background", async () => {
    assert.equal(await repo.count("ReadMasterArticle", { schoolId }), 0);
    assert.equal((await libraryState(repo, schoolId)).status, "NONE");
    const first = await autoLoadReadMasterLibrary(repo, schoolId);
    assert.equal(first.status, "RUNNING");
    assert.equal((await autoLoadReadMasterLibrary(repo, schoolId)).status, "RUNNING", "a second visit does not start another run");
    await afterResponseSettled();
    const done = await libraryState(repo, schoolId);
    assert.equal(done.status, "DONE", JSON.stringify(done));
    if (done.status === "DONE") assert.deepEqual([done.result.created, done.result.published, done.result.questions, done.result.errors], [36, 36, 540, []]);
    assert.equal((await autoLoadReadMasterLibrary(repo, schoolId)).status, "DONE", "never runs twice");
  });

  test("G4 and G5 articles are published, coded by Unit / Text Set, with 3 versions × 5 questions in the Question Bank", async () => {
    const arts = await repo.findMany("ReadMasterArticle", { schoolId });
    assert.equal(arts.length, 36);
    assert.ok(arts.every((a) => a.status === "PUBLISHED"));
    assert.deepEqual([...new Set(arts.map((a) => Number(a.gradeLevel)))].sort(), [4, 5]);
    assert.equal(libraryCode("G4-U1-L1"), "RM-G4-U1-TS1");
    const g4 = arts.find((a) => a.code === "RM-G4-U1-TS1")!;
    assert.equal(g4.title, "A World of Change");
    assert.equal(g4.topic, "Expository Text");
    assert.equal(g4.skillName, "Compare and Contrast");
    assert.match(String(g4.standardCode), /RI\.4\.5$/);
    for (const a of arts) {
      const vers = await repo.findMany("ReadMasterVersion", { articleId: a.id });
      assert.deepEqual(vers.map((v) => v.level).sort(), ["ABOVE", "BELOW", "ON"], String(a.code));
      for (const v of vers) assert.equal(await repo.count("ReadMasterQuestion", { versionId: v.id }), 5, `${a.code} ${v.level}`);
    }
    const links = await repo.findMany("ReadMasterQuestion", {});
    const qs = await repo.findMany("Question", { id: { in: links.map((l) => l.questionId) } }, { select: ["id", "status", "stem"] });
    assert.equal(qs.length, 540);
    assert.ok(qs.every((q) => q.status === "PUBLISHED"), "admin-published bank questions");
  });

  test("the loader is idempotent: a second run skips every article and adds nothing", async () => {
    const before = [await repo.count("ReadMasterArticle", { schoolId }), await repo.count("ReadMasterVersion", {}), await repo.count("ReadMasterQuestion", {})];
    const r = await ensureReadMasterLibrary(repo, schoolId);
    assert.deepEqual([r.created, r.completed, r.skipped, r.versions, r.questions, r.errors], [0, 0, 36, 0, 0, []]);
    assert.deepEqual([await repo.count("ReadMasterArticle", { schoolId }), await repo.count("ReadMasterVersion", {}), await repo.count("ReadMasterQuestion", {})], before);
  });

  test("an article left half-made is completed by the next run (and published)", async () => {
    const a = (await repo.findMany("ReadMasterArticle", { schoolId, code: "RM-G5-U6-TS3" }))[0];
    const v = (await repo.findMany("ReadMasterVersion", { articleId: a.id, level: "ABOVE" }))[0];
    const link = (await repo.findMany("ReadMasterQuestion", { versionId: v.id }))[0];
    await repo.deleteMany("ReadMasterQuestion", { versionId: v.id, questionId: link.questionId });
    await repo.updateMany("ReadMasterArticle", { id: a.id }, { status: "DRAFT" });
    const r = await ensureReadMasterLibrary(repo, schoolId, { only: ["G5-U6-L3", "G4-U1-L1"] });
    assert.deepEqual([r.completed, r.skipped, r.questions], [1, 1, 1]);
    assert.equal(await repo.count("ReadMasterQuestion", { versionId: v.id }), 5);
    assert.equal((await repo.findUnique("ReadMasterArticle", { id: a.id }))!.status, "PUBLISHED");
  });

  test("student page data: Grade 4 | Grade 5 tabs (own grade first), texts grouped by Unit, reading time, Below | On | Above", async () => {
    const s4 = await user("test.student.001"), s5 = await user("test.student.080");
    const h4 = await readMasterHome(repo, s4);
    assert.deepEqual([h4.grades, h4.grade, h4.myGrade], [[4, 5], 4, 4]);
    assert.deepEqual(h4.units.map((u) => u.unit), [1, 2, 3, 4, 5, 6]);
    assert.ok(h4.units.every((u) => u.articles.length === 3 && /^Unit \d$/.test(u.title)), "three texts per unit");
    assert.deepEqual(h4.units[0].articles.map((a) => a.title), ["A World of Change", "The Talent Show", "Dollars and Sense"], "lesson order inside the unit");
    const first = h4.units[0].articles[0];
    assert.deepEqual([first.topic, first.skill], ["Expository Text", "Compare and Contrast"]);
    const lib = (await libraryArticles()).find((a) => a.code === "G4-U1-L1")!;
    assert.equal(first.minutes, readingMinutes(words(lib.versions.ON.body)));
    assert.equal(first.minutes, Math.ceil(words(lib.versions.ON.body) / 130), "130 words a minute");
    // the other grade is open too
    const h4g5 = await readMasterHome(repo, s4, { grade: 5 });
    assert.deepEqual([h4g5.grade, h4g5.units.length, h4g5.units[5].articles.map((a) => a.title)], [5, 6, ["Shipped Out", "Mysterious Oceans", "To Travel!"]]);
    const h5 = await readMasterHome(repo, s5);
    assert.deepEqual([h5.grade, h5.myGrade], [5, 5], "a Grade 5 student opens on Grade 5");
    // open → the three levels, starting at the student's own level
    const o = await openArticle(repo, s4, first.id);
    assert.deepEqual(o.levels.map((l) => l.level), ["BELOW", "ON", "ABOVE"]);
    assert.equal(o.level, o.ownLevel);
    assert.equal(o.questions.length, 5);
  });

  test("pages wire the lazy load, the admin button and the banner; new strings have Arabic", () => {
    const sp = read("src/app/student/readmaster/page.tsx"), ap = read("src/app/admin/readmaster/page.tsx"), act = read("src/app/admin/readmaster/actions.ts");
    assert.match(sp, /autoLoadReadMasterLibrary\(repo, actor\.schoolId\)/);
    assert.match(ap, /autoLoadReadMasterLibrary\(repo, actor\.schoolId\)/);
    assert.match(ap, /loadLibraryAction/); assert.match(ap, /library-error/);
    assert.match(act, /export async function loadLibraryAction/);
    assert.equal(LIBRARY_LABEL, "Load the ReadMaster library (Grades 4–5)");
    const en = read("src/i18n/en.ts"), ar = read("src/i18n/ar.ts");
    for (const k of [LIBRARY_LABEL, "The ReadMaster library is being added.", "Refresh the page in a minute."]) { assert.ok(en.includes(`"${k}"`), k); assert.ok(ar.includes(`"${k}":`), k); }
  });
});
