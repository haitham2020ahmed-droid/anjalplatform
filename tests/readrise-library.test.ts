/** 🚀 ReadRise library: import (JSON + Excel), library scoping, publishing, teacher actions and dashboards. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { readXlsx } from "../src/imports/xlsx";
import { workbookXlsx } from "../src/imports/questions/template-files";
import { checkVersion, importArticleFile, importArticleJson, parseArticleXlsx, previewArticleFile, templateWorkbook, validateArticle, xlsxSheetNames, type ArticleJson } from "../src/server/readrise/import";
import { articleDetail, articleToJson, deleteArticle, listLibrary, setArticleHidden, setArticleStatus, setOfficialLexile } from "../src/server/readrise/library";
import { ensureReadRiseLibrary, seedReadRiseLibrary } from "../src/server/readrise/seed";
import { classReport, goalWeeks, median, schoolDashboard, skillsReport, pollReport, writingQueue, weekStart } from "../src/server/readrise/dashboards";
import { allowPlacementRetake, assignArticle, classArticles, scoreWriting, setStudentLevel, teacherReadRiseClasses, unassignArticle } from "../src/server/readrise/teacher";
import { levelRange } from "../src/app/admin/readrise/_components/ui";
import { demoDatabase, ROOT } from "./helpers/db";

let repo: SqliteRepo;
let t4a: Actor, t4b: Actor, admin: Actor;
let classA: string, classB: string;
let s1: string, s2: string, s3: string, s4: string;
const NOW = new Date("2026-11-10T09:00:00Z");
const DAY = 86_400_000;
const sample = (): ArticleJson => JSON.parse(readFileSync(join(ROOT, "data/readrise/articles/RR-001.json"), "utf8"));
const schoolCopy = (code = "SCH-001"): ArticleJson => ({ ...sample(), code });
const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
const sid = async (u: string) => String((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: u }))!.id }))!.id);
const silent = () => {};

before(async () => {
  ({ repo } = await demoDatabase());
  t4a = await actor("demo.teacher.4a");
  t4b = await actor("demo.teacher.4b");
  admin = await actor("demo.admin");
  [s1, s2, s3, s4] = await Promise.all(["demo.s1001", "demo.s1002", "demo.s1003", "demo.s1004"].map(sid));
  classA = String((await repo.findMany("ClassMembership", { studentId: s1 }))[0].classId);
  classB = String((await repo.findMany("ClassMembership", { studentId: s4 }))[0].classId);
});

describe("validation", () => {
  test("the sample library files are valid", () => {
    const v = validateArticle(sample());
    assert.deepEqual(v.errors, []);
    assert.equal(v.checks.length, 12);
    assert.ok(v.checks.every((c) => c.wordCount > 50 && c.estLevel > 0));
  });

  test("wrong number of levels, a bad answer letter and missing key words are errors", () => {
    const a = sample();
    a.versions = a.versions.slice(0, 11);
    const v1 = validateArticle(a);
    assert.equal(v1.article, null);
    assert.ok(v1.errors.some((e) => /needs exactly 12/.test(e.message)), JSON.stringify(v1.errors));

    const b = sample();
    b.bands.MID.questions[2].answer = "E";
    const v2 = validateArticle(b);
    assert.ok(v2.errors.some((e) => e.where === "MID question 3" && /A, B, C or D/.test(e.message)));

    const c = sample();
    c.bands.HIGH.keyWords = c.bands.HIGH.keyWords.slice(0, 3);
    const v3 = validateArticle(c);
    assert.ok(v3.errors.some((e) => /3 key words; it needs exactly 5/.test(e.message)));

    const d = sample();
    (d.versions[4] as { level: number }).level = 750;
    assert.ok(validateArticle(d).errors.some((e) => /not a ReadRise version level/.test(e.message)));

    const e = sample();
    e.bands.LOW.questions[0].options = ["one", "two", "three"];
    assert.ok(validateArticle(e).errors.some((x) => /exactly 4 answer choices/.test(x.message)));
    assert.ok(validateArticle(null).errors.length === 1);
  });

  test("estimated level and word count per version, with warnings and hints", () => {
    const hard = "Photosynthetic organisms convert electromagnetic radiation into chemical potential energy through extraordinarily complicated biochemical mechanisms, simultaneously regulating atmospheric composition, sustaining heterotrophic communities, and influencing planetary temperature across geological timescales that substantially exceed human comprehension. ".repeat(3);
    const c = checkVersion(300, "Hard", hard);
    assert.ok(c.estLevel > 1000, `estimated ${c.estLevel}`);
    assert.equal(c.levelOk, false);
    assert.match(c.hint!, /shorter and use simpler words/);
    const easy = checkVersion(1400, "Easy", "The cat sat. The dog ran. We had fun. It was hot. ".repeat(12));
    assert.equal(easy.levelOk, false);
    assert.match(easy.hint!, /longer sentences/);

    const a = sample();
    a.versions[0].text = hard; // version 300 now reads far harder than 400
    const v = validateArticle(a);
    assert.deepEqual(v.errors, []);
    assert.ok(v.warnings.some((w) => w.where === "Version 300" && /more than 100 away/.test(w.message)));
    assert.ok(v.warnings.some((w) => w.where === "Version 400" && /not rising/.test(w.message)));
  });
});

describe("import and platform seed", () => {
  test("seed loads the platform library as PUBLISHED and is idempotent", async () => {
    const r1 = await seedReadRiseLibrary(repo, ROOT, silent);
    assert.ok(r1.files >= 1);
    assert.deepEqual(r1.skipped, []);
    assert.equal(r1.created, r1.files);
    const count = async () => [await repo.count("RRArticle", {}), await repo.count("RRVersion", {}), await repo.count("RRQuestion", {}), await repo.count("RRPrompt", {})];
    const before1 = await count();
    assert.deepEqual(before1, [r1.files, 12 * r1.files, 24 * r1.files, 3 * r1.files]);
    const a = (await repo.findMany("RRArticle", { code: "RR-001" }))[0];
    assert.equal(a.schoolId, null);
    assert.equal(a.status, "PUBLISHED");
    const v300 = (await repo.findMany("RRVersion", { articleId: a.id, level: 300 }))[0];
    await repo.updateMany("RRVersion", { id: v300.id }, { officialLexile: 320 });
    const r2 = await seedReadRiseLibrary(repo, ROOT, silent);
    assert.equal(r2.created, 0);
    assert.equal(r2.updated, r1.files);
    assert.deepEqual(await count(), before1);
    assert.equal((await repo.findUnique("RRVersion", { id: v300.id }))!.officialLexile, 320, "official Lexile kept on re-import");
    const p = (await repo.findMany("RRPrompt", { articleId: a.id, band: "LOW" }))[0];
    const kw = typeof p.keyWords === "string" ? JSON.parse(p.keyWords) : p.keyWords;
    assert.equal(kw.length, 5);
  });

  test("JSON export (articleToJson) re-imports to the same article", async () => {
    const id = String((await repo.findMany("RRArticle", { code: "RR-001" }))[0].id);
    const out = articleToJson(await articleDetail(repo, admin, id));
    const v = validateArticle(out);
    assert.deepEqual(v.errors, []);
    const src = validateArticle(sample()).article!;
    assert.deepEqual(v.article!.bands.MID.questions, src.bands.MID.questions);
    assert.deepEqual(v.article!.bands.LOW.keyWords, src.bands.LOW.keyWords);
    assert.equal(v.article!.versions[11].text, src.versions[11].text);
    assert.equal(out.versions[0].officialLexile, 320, "official Lexile travels with the export");
  });

  test("school codes cannot use the platform prefix; platform needs RR-", async () => {
    const r = await importArticleJson(repo, admin, sample(), { schoolId: admin.schoolId, publish: false });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /kept for the platform library/.test(e.message)));
    await assert.rejects(importArticleJson(repo, admin, sample(), { schoolId: null, publish: true }), ForbiddenError);
    const plat = await importArticleJson(repo, null, schoolCopy("X-1"), { schoolId: null, publish: true });
    assert.ok(plat.errors.some((e) => /start with “RR-”/.test(e.message)));
  });
});

describe("Excel template", () => {
  test("template has the six sheets, instructions with 12 levels, bands and example rows", () => {
    const buf = Buffer.from(templateWorkbook());
    assert.deepEqual(xlsxSheetNames(buf), ["Instructions", "Article", "Versions", "KeyWords", "Questions", "Prompts"]);
    const ins = readXlsx(buf, { sheet: "Instructions" }).map((r) => r.join(" ")).join("\n");
    for (const l of [300, 700, 1100, 1400]) assert.match(ins, new RegExp(`^${l}\\b`, "m"));
    assert.match(ins, /LOW = versions 300–600/);
    assert.match(ins, /\[Example\]/);
    // the empty template: no header problems, only "fill it in"
    const p = parseArticleXlsx(buf);
    assert.ok(p.errors.some((e) => /article row is empty/.test(e.message)));
    assert.ok(!p.errors.some((e) => /header row|Missing column|is missing/.test(e.message)));
  });

  test("a filled template round-trips to the same article", async () => {
    const a = schoolCopy("4A-SUN-01");
    const t = parseArticleXlsx(Buffer.from(templateWorkbook()));
    void t;
    const kwRows = (["LOW", "MID", "HIGH"] as const).flatMap((b) => a.bands[b].keyWords.map((k) => [b, k.word, k.partOfSpeech ?? "", k.definition, k.example]));
    const qRows = (["LOW", "MID", "HIGH"] as const).flatMap((b) => a.bands[b].questions.map((q, i) => [b, String(i + 1), q.stem, ...q.options, q.answer, q.skill, q.why ?? ""]));
    const buf = Buffer.from(workbookXlsx([
      { name: "Instructions", widths: [10], rows: [["x"]] },
      { name: "Article", widths: [10], rows: [["Code", "Title", "Topic", "Summary", "Poll statement"], ["[Example] X", "ignored", "", "", ""], [a.code, a.title, a.topic, a.summary ?? "", a.poll]] },
      { name: "Versions", widths: [10], rows: [["Level", "Title", "Text"], ...a.versions.map((v) => [String(v.level), v.title, v.text])] },
      { name: "KeyWords", widths: [10], rows: [["Band", "Word", "Part of speech", "Definition", "Example"], ...kwRows, ["MID", "", "", "", ""]] },
      { name: "Questions", widths: [10], rows: [["Band", "Number", "Question", "A", "B", "C", "D", "Answer", "Skill", "Why"], ...qRows] },
      { name: "Prompts", widths: [10], rows: [["Band", "Prompt", "Checklist (lines separated by |)"], ...(["LOW", "MID", "HIGH"] as const).map((b) => [b, a.bands[b].prompt, (a.bands[b].checklist ?? []).join(" | ")])] },
    ]));
    const pv = previewArticleFile("article.xlsx", buf);
    assert.deepEqual(pv.errors, []);
    assert.equal(pv.article!.code, "4A-SUN-01");
    assert.equal(pv.article!.versions.length, 12);
    assert.equal(pv.article!.versions[5].text, a.versions[5].text.replace(/\r\n?/g, "\n").trim());
    assert.deepEqual(pv.article!.bands.MID.questions.map((q) => q.answer), a.bands.MID.questions.map((q) => q.answer));
    assert.deepEqual(pv.article!.bands.HIGH.checklist, a.bands.HIGH.checklist);
    assert.equal(pv.checks.length, 12);

    // a bad cell is reported with its sheet and row
    const bad = Buffer.from(workbookXlsx([
      { name: "Article", widths: [10], rows: [["Code", "Title", "Topic", "Summary", "Poll statement"], [a.code, a.title, a.topic, "", a.poll]] },
      { name: "Versions", widths: [10], rows: [["Level", "Title", "Text"], ...a.versions.map((v) => [String(v.level), v.title, v.text])] },
      { name: "KeyWords", widths: [10], rows: [["Band", "Word", "Part of speech", "Definition", "Example"], ...kwRows] },
      { name: "Questions", widths: [10], rows: [["Band", "Number", "Question", "A", "B", "C", "D", "Answer", "Skill", "Why"], ...qRows.map((r, i) => (i === 9 ? [...r.slice(0, 7), "F", ...r.slice(8)] : r))] },
      { name: "Prompts", widths: [10], rows: [["Band", "Prompt", "Checklist (lines separated by |)"], ...(["LOW", "MID", "HIGH"] as const).map((b) => [b, a.bands[b].prompt, "x"])] },
    ]));
    const pb = previewArticleFile("a.xlsx", bad);
    assert.ok(pb.errors.some((e) => /^Questions row 11/.test(e.where) && /A, B, C or D/.test(e.message)), JSON.stringify(pb.errors));

    // import from the file as a DRAFT (teacher), then JSON upload works too
    const r = await importArticleFile(repo, t4a, "a.xlsx", buf, { publish: false, now: NOW });
    assert.equal(r.ok, true);
    assert.equal(r.status, "DRAFT");
    const j = await importArticleFile(repo, t4a, "b.json", Buffer.from(JSON.stringify(schoolCopy("4A-SUN-02"))), { publish: false, now: NOW });
    assert.equal(j.ok, true);
  });
});

describe("library scoping, hidden list and publishing", () => {
  let draftId: string, platformId: string;
  before(async () => {
    platformId = String((await repo.findMany("RRArticle", { code: "RR-001" }))[0].id);
    draftId = String((await repo.findMany("RRArticle", { code: "4A-SUN-01" }))[0].id);
  });

  test("teachers cannot publish without questions:publish; an admin publishes", async () => {
    await assert.rejects(importArticleJson(repo, t4a, schoolCopy("T-PUB"), { schoolId: t4a.schoolId, publish: true }), /questions:publish/);
    await assert.rejects(setArticleStatus(repo, t4a, draftId, "PUBLISHED", NOW), ForbiddenError);
    const lead: Actor = { ...t4a, extraPermissions: ["questions:publish"] };
    await setArticleStatus(repo, lead, draftId, "PUBLISHED", NOW);
    await setArticleStatus(repo, admin, draftId, "DRAFT", NOW);
    await setArticleStatus(repo, admin, draftId, "PUBLISHED", NOW);
    assert.equal((await repo.findUnique("RRArticle", { id: draftId }))!.status, "PUBLISHED");
    // platform articles are not the school's to publish
    await assert.rejects(setArticleStatus(repo, admin, platformId, "DRAFT", NOW), ForbiddenError);
  });

  test("other teachers see a draft only when it is theirs; another school sees nothing of ours", async () => {
    const draft2 = String((await repo.findMany("RRArticle", { code: "4A-SUN-02" }))[0].id);
    const mine = await listLibrary(repo, t4a);
    assert.ok(mine.items.some((i) => i.id === draft2 && i.status === "DRAFT" && i.mine));
    const theirs = await listLibrary(repo, t4b);
    assert.ok(!theirs.items.some((i) => i.id === draft2));
    assert.ok(theirs.items.some((i) => i.id === draftId), "published school article visible to colleagues");
    await assert.rejects(articleDetail(repo, t4b, draft2), ForbiddenError);
    const other: Actor = { userId: "x", role: "SCHOOL_ADMIN", schoolId: "other-school" };
    const lib = await listLibrary(repo, other);
    assert.ok(lib.items.every((i) => i.source === "PLATFORM"));
    await assert.rejects(articleDetail(repo, other, draftId), ForbiddenError);
    await assert.rejects(deleteArticle(repo, t4b, draft2, NOW), ForbiddenError);
    // filters
    assert.ok((await listLibrary(repo, admin, { source: "PLATFORM" })).items.every((i) => i.source === "PLATFORM"));
    assert.deepEqual((await listLibrary(repo, admin, { q: "4a-sun-02" })).items.map((i) => i.code), ["4A-SUN-02"]);
  });

  test("an admin hides a platform article for the school only; detail shows 12 versions", async () => {
    await assert.rejects(setArticleHidden(repo, t4a, platformId, true, NOW), ForbiddenError);
    await setArticleHidden(repo, admin, platformId, true, NOW);
    assert.ok(!(await listLibrary(repo, t4a)).items.some((i) => i.id === platformId));
    const adminView = (await listLibrary(repo, admin)).items.find((i) => i.id === platformId);
    assert.equal(adminView?.hidden, true);
    const other: Actor = { userId: "x", role: "SCHOOL_ADMIN", schoolId: "other-school" };
    assert.ok((await listLibrary(repo, other)).items.some((i) => i.id === platformId), "hidden only for our school");
    await setArticleHidden(repo, admin, platformId, false, NOW);
    assert.ok((await listLibrary(repo, t4a)).items.some((i) => i.id === platformId));
    const d = await articleDetail(repo, admin, platformId);
    assert.equal(d.versions.length, 12);
    assert.equal(d.bands.MID.questions.length, 8);
    assert.equal(d.bands.LOW.keyWords.length, 5);
    assert.equal(d.canHide, true);
    // official Lexile on a school article version
    const dv = await articleDetail(repo, admin, draftId);
    await setOfficialLexile(repo, admin, dv.versions[0].id, 310, NOW);
    assert.equal((await articleDetail(repo, admin, draftId)).versions[0].officialLexile, 310);
    await assert.rejects(setOfficialLexile(repo, t4b, dv.versions[0].id, 300, NOW), ForbiddenError);
  });
});

describe("teacher actions", () => {
  let artId: string;
  before(async () => { artId = String((await repo.findMany("RRArticle", { code: "RR-001" }))[0].id); });

  test("class selector and class assignment (own classes only, published articles only)", async () => {
    const classes = await teacherReadRiseClasses(repo, t4a);
    assert.ok(classes.some((c) => c.id === classA && c.own));
    const r = await assignArticle(repo, t4a, classA, artId, new Date("2026-11-20T00:00:00Z"), NOW);
    assert.equal(r.created, true);
    assert.equal((await assignArticle(repo, t4a, classA, artId, null, NOW)).created, false);
    await assert.rejects(assignArticle(repo, t4a, classB, artId, null, NOW), ForbiddenError);
    const draft = String((await repo.findMany("RRArticle", { code: "4A-SUN-02" }))[0].id);
    await assert.rejects(assignArticle(repo, t4a, classA, draft, null, NOW), /published article/);
    const list = await classArticles(repo, t4a, classA);
    assert.deepEqual(list.map((x) => [x.code, x.dueAt, x.students]), [["RR-001", null, 3]]);
    await unassignArticle(repo, t4a, classA, artId, NOW);
    assert.equal((await classArticles(repo, t4a, classA)).length, 0);
    await assignArticle(repo, t4a, classA, artId, null, NOW);
  });

  test("teacher override is recorded (source TEACHER + a level change with the reason)", async () => {
    await assert.rejects(setStudentLevel(repo, t4a, s1, 800, "", NOW), /reason/);
    await assert.rejects(setStudentLevel(repo, t4a, s4, 800, "MAP test", NOW), ForbiddenError);
    await assert.rejects(setStudentLevel(repo, t4a, s1, 5000, "MAP test", NOW), /from 200 to 1500/);
    const r = await setStudentLevel(repo, t4a, s1, 820, "MAP Lexile 820 in winter", NOW);
    assert.equal(r.to, 820);
    const st = (await repo.findUnique("RRStudent", { studentId: s1 }))!;
    assert.equal(st.source, "TEACHER");
    assert.equal(Number(st.level), 820);
    const ch = await repo.findMany("RRLevelChange", { studentId: s1 });
    assert.ok(ch.some((c) => Number(c.toLevel) === 820 && /^Teacher set the level: MAP Lexile 820/.test(String(c.reason))));
    await assert.rejects(allowPlacementRetake(repo, t4a, s1, "", NOW), /not taken the placement/);
  });

  test("writing is scored 0–4 only by the student's teacher (or an admin)", async () => {
    const run = await repo.create("RRRun", { studentId: s1, schoolId: t4a.schoolId, articleId: artId, versionLevel: 800, band: "MID", step: "DONE", levelBefore: 800, writing: "Plants make food from sunlight. They need water and air too.", score: 75, firstTry: true, startedAt: new Date(NOW.getTime() - DAY), completedAt: new Date(NOW.getTime() - DAY) });
    const q = await writingQueue(repo, t4a, classA);
    assert.ok(q.pending.some((x) => x.runId === run.id && x.prompt));
    await assert.rejects(scoreWriting(repo, t4b, String(run.id), 3, "", NOW), ForbiddenError);
    await assert.rejects(scoreWriting(repo, t4a, String(run.id), 5, "", NOW), /0, 1, 2, 3 or 4/);
    const studentActor = await actor("demo.s1001");
    await assert.rejects(scoreWriting(repo, studentActor, String(run.id), 3, "", NOW), ForbiddenError);
    await scoreWriting(repo, t4a, String(run.id), 3, "Good facts. Add one more detail.", NOW);
    const after = (await repo.findUnique("RRRun", { id: run.id }))!;
    assert.equal(Number(after.writingScore), 3);
    assert.equal(after.writingScoredById, t4a.userId);
    assert.equal((await writingQueue(repo, t4a, classA)).pending.length, 0);
    await scoreWriting(repo, admin, String(run.id), 4, "", NOW);
  });
});

describe("dashboards", () => {
  let artId: string;
  before(async () => {
    artId = String((await repo.findMany("RRArticle", { code: "RR-001" }))[0].id);
    const placedAt = new Date(NOW.getTime() - 35 * DAY);
    // s1 already has an RRStudent (teacher override above: start ? → 820); reset to a known history
    await repo.deleteMany("RRStudent", { studentId: { in: [s1, s2, s3] } });
    await repo.deleteMany("RRLevelChange", { studentId: { in: [s1, s2, s3] } });
    await repo.deleteMany("RRRun", { studentId: { in: [s1, s2, s3] } });
    await repo.create("RRStudent", { studentId: s1, schoolId: t4a.schoolId, level: 800, startLevel: 700, source: "PLACEMENT", placedAt, weeklyGoal: 1 });
    await repo.create("RRStudent", { studentId: s2, schoolId: t4a.schoolId, level: 550, startLevel: 600, source: "PLACEMENT", placedAt, weeklyGoal: 2 });
    await repo.create("RRLevelChange", { studentId: s1, schoolId: t4a.schoolId, fromLevel: 700, toLevel: 750, reason: "Up 50", createdAt: new Date(NOW.getTime() - 20 * DAY) });
    await repo.create("RRLevelChange", { studentId: s1, schoolId: t4a.schoolId, fromLevel: 750, toLevel: 800, reason: "Up 50", createdAt: new Date(NOW.getTime() - 6 * DAY) });
    // s1: 2 first-try runs (one this week); s2: one old run at 50%
    const qs = (await repo.findMany("RRQuestion", { articleId: artId, band: "MID" })).sort((a, b) => Number(a.number) - Number(b.number));
    const allRight = Object.fromEntries(qs.map((q) => [String(q.number), String(q.answer)]));
    const wrongOn = (skillMatch: (k: string) => boolean) => Object.fromEntries(qs.map((q) => [String(q.number), skillMatch(String(q.skill)) ? (q.answer === "A" ? "B" : "A") : String(q.answer)]));
    const mk = (studentId: string, daysAgo: number, answers: Record<string, string>, score: number, extra: Record<string, unknown> = {}) => repo.create("RRRun", {
      studentId, schoolId: t4a.schoolId, articleId: artId, versionLevel: 800, band: "MID", step: "DONE", levelBefore: 750, answers, score, firstTry: true,
      startedAt: new Date(NOW.getTime() - daysAgo * DAY), completedAt: new Date(NOW.getTime() - daysAgo * DAY), ...extra,
    });
    await mk(s1, 1, allRight, 100, { prePoll: 0, postPoll: 2 });
    await mk(s1, 15, wrongOn((k) => k === "inference"), 75, { firstTry: false });
    await mk(s2, 20, wrongOn((k) => k === "inference" || k === "detail"), 50, { prePoll: 1, postPoll: 1 });
  });

  test("pure helpers: median and goal weeks", () => {
    assert.equal(median([]), null);
    assert.equal(median([700, 500, 900]), 700);
    assert.equal(median([500, 800]), 650);
    const w = weekStart(NOW.getTime());
    // placed 3 weeks ago, goal 1: met in the placement week and this week → 2 of 4 (this week counts because it is met)
    const g = goalWeeks(w - 21 * DAY, 1, [{ at: w - 20 * DAY, score: 80 }, { at: w + DAY, score: 90 }, { at: w - 6 * DAY, score: 60 }], w + 2 * DAY);
    assert.deepEqual(g, { met: 2, weeks: 4 });
    // this week not met yet → not counted
    assert.deepEqual(goalWeeks(w - 7 * DAY, 2, [{ at: w - 6 * DAY, score: 80 }, { at: w - 5 * DAY, score: 90 }], w + DAY), { met: 1, weeks: 1 });
  });

  test("class report: growth since placement, flags, weekly history with the class median", async () => {
    const r = await classReport(repo, t4a, classA, NOW, 8);
    const a = r.students.find((x) => x.studentId === s1)!, b = r.students.find((x) => x.studentId === s2)!, c = r.students.find((x) => x.studentId === s3)!;
    assert.equal(a.growth, 100);
    assert.equal(b.growth, -50);
    assert.equal(c.placed, false);
    assert.equal(c.flags.notPlaced, true);
    assert.equal(b.flags.belowBand, true, "550 is under the Grade 4 guidance band (640)");
    assert.equal(b.flags.inactive, true, "last activity 20 days ago");
    assert.equal(a.flags.inactive, false);
    assert.equal(a.weekArticles, 1);
    assert.equal(a.totalArticles, 1);
    assert.equal(a.firstTryAvg, 100, "only first tries count");
    assert.equal(r.summary.medianLevel, 675);
    assert.equal(r.summary.avgGrowth, 25);
    assert.deepEqual(r.band, { low: 640, high: 940 });
    assert.equal(r.history.weeks.length, 8);
    const sa = r.history.series.find((x) => x.studentId === s1)!;
    assert.equal(sa.points[sa.points.length - 1], 800);
    assert.ok(sa.points.includes(750) && sa.points.includes(700));
    assert.equal(r.history.median[r.history.median.length - 1], 675);
    assert.equal(r.distribution.reduce((n, d) => n + d.count, 0), 2);
  });

  test("skills report: first-try accuracy by skill per class and per student", async () => {
    const r = await skillsReport(repo, t4a, classA);
    const inf = r.classBySkill.inference;
    assert.ok(inf && inf.total >= 2);
    const a = r.students.find((x) => x.studentId === s1)!, b = r.students.find((x) => x.studentId === s2)!;
    assert.equal(a.bySkill.inference.pct, 100, "the second (not first-try) run is ignored");
    assert.equal(b.bySkill.inference.pct, 0);
    assert.equal(a.total.pct, 100);
    await assert.rejects(skillsReport(repo, t4b, classA), ForbiddenError);
  });

  test("poll shift per article", async () => {
    const p = await pollReport(repo, t4a, classA);
    const row = p.find((x) => x.articleId === artId)!;
    assert.equal(row.responses, 2);
    assert.equal(row.changed, 1);
    assert.equal(row.avgBefore, 0.5);
    assert.equal(row.avgAfter, 1.5);
    assert.equal(row.shift, 1);
  });

  test("level chart range covers the values and the grade band", () => {
    assert.deepEqual(levelRange([null, 700, 820], { low: 640, high: 940 }), { min: 500, max: 1000, ticks: [500, 600, 700, 800, 900, 1000] });
    const empty = levelRange([]);
    assert.ok(empty.min <= 300 && empty.max >= 1400 && empty.ticks.length > 2);
  });

  test("school dashboard: placed / not placed, growth and usage by grade and class", async () => {
    const d = await schoolDashboard(repo, admin, NOW, 8);
    const g4 = d.grades.find((g) => g.grade === 4)!;
    assert.equal(g4.placed, 2);
    assert.equal(g4.students - g4.placed, g4.notPlaced);
    assert.equal(g4.avgGrowth, 25);
    assert.equal(g4.medianLevel, 675);
    assert.equal(d.weeks.length, 8);
    assert.equal(g4.usage.length, 8);
    const ca = d.classes.find((c) => c.classId === classA)!;
    assert.equal(ca.placed, 2);
    assert.equal(ca.usage.length, 8, "per-class weekly usage for the 8-week line");
    assert.ok(d.top.some((t) => t.classId === classA));
    await assert.rejects(schoolDashboard(repo, t4a, NOW), ForbiddenError);
  });
});

describe("🚀 ReadRise library loads itself on a live site", () => {
  test("the shipped articles are imported once when missing, then the check is a no-op", async () => {
    const { repo } = await demoDatabase();
    const first = await ensureReadRiseLibrary(repo, process.cwd());
    assert.ok(first && first.created >= 15 && first.skipped.length === 0, JSON.stringify(first?.skipped ?? first));
    const arts = await repo.findMany("RRArticle", { schoolId: null, status: "PUBLISHED" });
    assert.ok(arts.length >= 15);
    assert.equal(await ensureReadRiseLibrary(repo, process.cwd()), null, "nothing missing → no work");
  });
});
