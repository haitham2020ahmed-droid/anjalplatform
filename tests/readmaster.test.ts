import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { importReadMaster, rmTemplateRows } from "../src/server/readmaster/import";
import { addVersionQuestion, articleDetail, listArticles, openArticle, readingLexile, saveArticle, saveVersion, setArticleStatus, studentArticles, submitArticle } from "../src/server/readmaster/service";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

describe("⭐ ReadMaster: one article, three reading levels, Lexile that moves", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let articleId: string;
  const st = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const answerAll = async (s: Actor, aid: string, right: boolean) => {
    const o = await openArticle(repo, s, aid);
    const items = await loadQuestionItems(repo, o.questions.map((q) => q.questionId));
    const resp = Object.fromEntries(items.map((i) => [i.questionId, (right ? i.options!.find((x) => x.correct) : i.options!.find((x) => !x.correct))!.label]));
    return { open: o, result: await submitArticle(repo, s, aid, o.versionId, resp) };
  };
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(st));
  });

  test("the ready template imports: 1 article, 3 versions, 4 questions (also in the Question Bank)", async () => {
    const r = await importReadMaster(repo, admin, rmTemplateRows());
    assert.deepEqual([r.articles, r.versions, r.questions, r.errors], [1, 3, 4, []]);
    const a = (await listArticles(repo, admin, 4))[0];
    articleId = a.id;
    assert.deepEqual(a.versions.map((v) => [v.level, v.lexile, v.questions]), [["BELOW", 650, 2], ["ON", 820, 1], ["ABOVE", 960, 1]]);
    const d = await articleDetail(repo, admin, articleId);
    const q = (await repo.findUnique("Question", { id: d.versionsFull[0].questions[0].id }))!;
    assert.deepEqual([q.status, Number(q.lexile)], ["PUBLISHED", 650], "a published bank question carrying the version's Lexile");
    // a bad row is reported, the rest still imports
    const bad = await importReadMaster(repo, admin, [rmTemplateRows()[0], ["NEW-1", "", "4", "", "", "On", "", "", "Q?", "Multiple Choice", "a", "b", "", "", "A", "x"]]);
    assert.match(bad.errors[0].message, /is new: write its Title/);
  });

  test("students read the version that matches their Lexile; staff see results", async () => {
    await assert.rejects(openArticle(repo, await st("test.student.001"), articleId), ForbiddenError, "not published yet");
    await setArticleStatus(repo, teacher, articleId, "PUBLISHED");
    const s1 = await st("test.student.001");                 // no MAP: starts mid On band (G4 740–875 → 808)
    assert.deepEqual(await readingLexile(repo, s1.studentId!), { lexile: 808, source: "START" });
    assert.equal((await openArticle(repo, s1, articleId)).level, "ON");
    await repo.create("StudentReadingLexile", { studentId: (await st("test.student.002")).studentId!, lexile: 620, source: "MAP", updatedAt: new Date() });
    const low = await openArticle(repo, await st("test.student.002"), articleId);
    assert.deepEqual([low.level, low.lexile, low.questions.length], ["BELOW", 650, 2]);
    assert.ok(low.body.startsWith("The Sun is a star."));
    // a Grade 5 student does not see a Grade 4 article
    const g5 = (await repo.findMany("User", {})).find((u) => String(u.username) === "test.student.080");
    if (g5) await assert.rejects(openArticle(repo, await resolveActor(repo, g5), articleId), ForbiddenError);
  });

  test("real adaptivity: 75%+ raises the Lexile 30L, crossing the band edge moves to the next version; under 50% lowers it", async () => {
    // build two more On/Above articles so a strong reader keeps climbing
    const ids: string[] = [articleId];
    for (const n of [2, 3]) {
      const id = await saveArticle(repo, admin, { code: `PLANETS-0${n}`, title: `Planets ${n}`, grade: 4 });
      for (const [lv, lx] of [["BELOW", 640], ["ON", 830], ["ABOVE", 950]] as const) {
        const vid = await saveVersion(repo, admin, id, lv, { lexile: lx, body: `Planets text number ${n} at the ${lv} level. ${"Planets move around the Sun in long paths called orbits and each one is different. ".repeat(3)}` });
        await addVersionQuestion(repo, admin, vid, { stem: `Main idea of planets ${n} ${lv}?`, whyCorrect: "Because.", options: [{ label: "A", text: `right ${n}${lv}`, correct: true }, { label: "B", text: `wrong ${n}${lv}`, correct: false }, { label: "C", text: `other ${n}${lv}`, correct: false }] });
      }
      await setArticleStatus(repo, admin, id, "PUBLISHED"); ids.push(id);
    }
    const strong = await st("test.student.003");          // 808L (On)
    const a1 = await answerAll(strong, ids[0], true);
    assert.deepEqual([a1.open.level, a1.result.pct, a1.result.lexileBefore, a1.result.lexileAfter], ["ON", 100, 808, 838]);
    const a2 = await answerAll(strong, ids[1], true);
    assert.deepEqual([a2.open.level, a2.result.lexileAfter, a2.result.levelAfter], ["ON", 868, "ON"]);
    const a3 = await answerAll(strong, ids[2], true);
    assert.deepEqual([a3.open.level, a3.result.lexileAfter, a3.result.levelAfter], ["ON", 898, "ABOVE"], "crossed 875L: the next article will be the Above version");
    await assert.rejects(submitArticle(repo, strong, ids[0], a1.open.versionId, {}), /already finished/);
    const weak = await st("test.student.004");
    const w = await answerAll(weak, ids[0], false);
    assert.deepEqual([w.result.pct, w.result.lexileAfter], [0, 778]);
    const list = await studentArticles(repo, weak);
    assert.deepEqual([list.lexile, list.level, list.articles.find((x) => x.id === ids[0])!.done?.correct], [778, "ON", 0]);
    const d = await articleDetail(repo, teacher, ids[0]);
    assert.equal(d.results.length, 2);
    await assert.rejects(listArticles(repo, strong), ForbiddenError, "students cannot manage ReadMaster");
  });
});
