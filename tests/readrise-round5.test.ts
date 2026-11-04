/**
 * Round 5 — ReadRise (owner-approved): a stretch is always offered after a reliable 75%+ first try (stretch sets
 * "S-L/M/H" count fully; the same band without a set is practice: weekly goal only), one goal credit per article, ONE
 * article status, a too-fast read never counts, the library shelves (Continue / From my teacher / Recommended /
 * Finished / All), the done screen's Read next, and the stretch-set import + sync.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { levelWindow, readsToMoveUp, setLevelByTeacher, studentReadRiseSummary } from "../src/server/readrise/engine";
import { finishReading, startRun, stretchOffer, studentLibrary, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { articleRuns, articleStatus, countedTries, goalRuns, isCountedTry, isPracticeStretch } from "../src/server/readrise/first-try";
import { validateArticle } from "../src/server/readrise/import";
import { syncStretchChunk } from "../src/server/readrise/seed";
import { extraWorkItems } from "../src/server/student/all-work";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z"); // a Sunday morning in Riyadh
const at = (days: number, h = 0) => new Date(T0.getTime() + days * DAY + h * 3_600_000);

async function makeArticle(repo: SqliteRepo, code: string, opts: { stretchSet?: string } = {}): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) {
    const body = `${code} at ${level}. The colony works hard every day.\n\nBees ${"make honey ".repeat(Math.round(level / 20))}and the hive grows.`;
    await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body, wordCount: body.split(/\s+/).length, estLevel: level });
  }
  for (const band of ["LOW", "MID", "HIGH"]) {
    for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `${band} Q${n}?`, options: ["right", "w1", "w2", "w3"], answer: "A", skill: n <= 4 ? "central-idea" : "detail", rationale: { why: "w" } });
    await repo.create("RRPrompt", { articleId: id, band, prompt: `Explain (${band}).`, checklist: ["Use evidence"], keyWords: [] });
  }
  if (opts.stretchSet) for (let n = 1; n <= 4; n++) await repo.create("RRQuestion", { articleId: id, band: opts.stretchSet, number: n, stem: `STRETCH Q${n}?`, options: ["right", "w1", "w2", "w3"], answer: "A", skill: "inference", rationale: { A: "why" } });
  return id;
}
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
async function read(repo: SqliteRepo, s: Actor, articleId: string, right: number, now: Date, stretch = false, readSeconds = 120) {
  const v = await startRun(repo, s, articleId, { stretch }, now);
  await submitPrePoll(repo, s, v.runId, 1, now);
  await finishReading(repo, s, v.runId, { readSeconds }, now);
  const scored = await submitActivity(repo, s, v.runId, answers(right), now);
  await submitWriting(repo, s, v.runId, WRITING, now);
  return { start: v, scored, done: await submitPostPoll(repo, s, v.runId, 2, now) };
}

describe("round 5 — ReadRise", () => {
  let repo: SqliteRepo; let admin: Actor; let st: Actor[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    st = await Promise.all(["001", "002", "003", "004", "005", "006"].map((t) => actorOf(`test.student.${t}`)));
  });

  test("stretch at 1400: always offered; without a set it is practice (goal only), with an S-H set it counts fully", async () => {
    const s = st[0], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 1400, "", at(0));
    const a = await makeArticle(repo, "R5-1");
    const first = await read(repo, s, a, 8, at(1));
    assert.equal(first.done.done!.canStretch, true, "1400 HIGH → 1500 HIGH: offered (round 4 refused it)");
    assert.equal(first.done.done!.stretchMode, "PRACTICE");
    const win = (await levelWindow(repo, sid)).length;
    const sp = await read(repo, s, a, 8, at(1, 1), true);
    assert.deepEqual([sp.start.versionLevel, sp.start.band, sp.done.done!.kind, sp.done.done!.stretchCounted], [1500, "HIGH", "STRETCH", "PRACTICE"]);
    assert.equal((await levelWindow(repo, sid)).length, win, "a practice stretch never joins the level window");
    assert.equal(sp.done.done!.goal.thisWeek, 1, "one goal credit for the article (its first try already earned it)");
    // an article WITH a stretch set for HIGH: the stretch uses the 4 new questions and counts fully
    const b = await makeArticle(repo, "R5-2", { stretchSet: "S-H" });
    const fb = await read(repo, s, b, 8, at(1, 2));
    assert.equal(fb.done.done!.stretchMode, "FULL");
    assert.deepEqual(await levelWindow(repo, sid), [100, 100], "two first tries (the practice stretch is not in it)");
    const sb = await read(repo, s, b, 4, at(1, 3), true);
    assert.deepEqual([sb.start.band, sb.start.questions.length, sb.scored.score], ["S-H", 4, 100]);
    assert.equal(sb.done.done!.stretchCounted, "FULL");
    // the stretch-set stretch joined the window: 3 of the last 3 at 75%+ → up 50 (the window starts again)
    assert.deepEqual([sb.done.done!.levelBefore, sb.done.done!.levelAfter], [1400, 1450], "a stretch-set stretch at 75%+ counts for the level");
    assert.equal(sb.done.done!.kind, "STRETCH");
    // the reader shows the band's prompt for a stretch-set run
    assert.equal(sb.start.prompt, "Explain (HIGH).");
    await afterResponseSettled();
  });

  test("one goal credit per article; a re-read never; isCountedTry / practice stretch (pure)", () => {
    const r = (o: Record<string, unknown>) => ({ studentId: "s", articleId: "a", firstTry: true, stretch: false, band: "HIGH", completedAt: "2026-09-07T08:00:00Z", score: 80, ...o });
    assert.equal(goalRuns([r({}), r({ stretch: true, score: 100, completedAt: "2026-09-07T09:00:00Z" })]).length, 1, "first try + stretch = one credit");
    assert.equal(goalRuns([r({ readSeconds: 10 }), r({ stretch: true, completedAt: "2026-09-08T09:00:00Z" })])[0].stretch, true, "a too-fast first try earns nothing; its stretch earns the credit");
    assert.equal(goalRuns([r({ score: 60 }), r({ firstTry: false, score: 100 })]).length, 0, "a re-read never");
    assert.equal(goalRuns([r({ unreliable: true }), r({ articleId: "b" })]).length, 1);
    assert.equal(isCountedTry(r({ stretch: true, band: "S-H" }), "HIGH"), true);
    assert.equal(isCountedTry(r({ stretch: true, band: "HIGH" }), "HIGH"), false);
    assert.equal(isPracticeStretch(r({ stretch: true, band: "HIGH" }), "HIGH"), true);
    assert.equal(countedTries([r({}), r({ stretch: true, band: "S-H" })]).length, 2);
    // the progress strip: strong reads still needed for +50 (3 of the last 4 at 75%+)
    assert.deepEqual([readsToMoveUp([]), readsToMoveUp([80]), readsToMoveUp([80, 90]), readsToMoveUp([40, 80, 90])], [3, 2, 1, 1]);
    // the stretch offer at the top: no higher version
    assert.equal(stretchOffer([{ firstTry: true, stretch: false, step: "DONE", score: 100, band: "HIGH" }], 1600, [{ level: 1500 }, { level: 1600 }]).ok, false);
  });

  test("ONE article status: New / In progress / Finish steps 4–5 / Done; re-reads and stretches never change it", () => {
    assert.equal(articleStatus([]), "NEW");
    assert.equal(articleStatus([{ firstTry: true, stretch: false, step: "READ" }]), "IN_PROGRESS");
    assert.equal(articleStatus([{ firstTry: true, stretch: false, step: "WRITE", score: 75, completedAt: "x" }]), "FINISH_STEPS");
    assert.equal(articleStatus([{ firstTry: true, stretch: false, step: "POSTPOLL", score: 75, completedAt: "x" }]), "FINISH_STEPS");
    const done = { firstTry: true, stretch: false, step: "DONE", score: 75, completedAt: "x" };
    assert.equal(articleStatus([done]), "DONE");
    assert.equal(articleStatus([done, { firstTry: false, stretch: false, step: "READ" }]), "DONE", "an open re-read");
    assert.equal(articleStatus([done, { firstTry: true, stretch: true, step: "QUIZ" }]), "DONE", "an open stretch");
    assert.equal(articleStatus([{ firstTry: true, stretch: true, step: "DONE" }]), "NEW", "a stretch alone is not a first try");
  });

  test("a read under 45 s does not count (goal, articles read) and the done screen says so", async () => {
    const s = st[1], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const a = await makeArticle(repo, "R5-3");
    const before = (await studentReadRiseSummary(repo, sid, at(1)))!;
    const r = await read(repo, s, a, 8, at(1), false, 10);
    assert.equal(r.done.done!.readTooFast, true);
    const after = (await studentReadRiseSummary(repo, sid, at(1, 1)))!;
    assert.deepEqual([after.thisWeek, after.articlesDone], [before.thisWeek, before.articlesDone]);
    const src = readFileSync("src/components/readrise/reader.tsx", "utf8");
    assert.ok(src.includes('tr("You read this very fast, so it did not count. Read carefully next time.")'));
    await afterResponseSettled();
  });

  test("library: Finished shows the version READ; Continue reading; My Work uses the same status words", async () => {
    const s = st[2], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const a = await makeArticle(repo, "R5-4");
    await read(repo, s, a, 7, at(1));
    await setLevelByTeacher(repo, admin, sid, 1000, "", at(2));
    const lib = await studentLibrary(repo, s, {}, at(2, 1));
    const card = lib.finished.find((c) => c.id === a)!;
    assert.deepEqual([card.status, card.readLevel, card.versionLevel, card.firstTryScore], ["DONE", 800, 1000, 88]);
    assert.equal(card.textLevel, 1000, "the measured difficulty of today's version");
    // an open first try → Continue reading; a scored activity → Finish steps 4–5 (also in My Work)
    const b = await makeArticle(repo, "R5-5");
    const classId = String((await repo.findMany("ClassMembership", { studentId: sid, leftAt: null }))[0].classId);
    await repo.create("RRClassArticle", { classId, articleId: b, assignedById: admin.userId, createdAt: at(2) });
    const v = await startRun(repo, s, b, {}, at(2, 2));
    await submitPrePoll(repo, s, v.runId, 1, at(2, 2));
    await finishReading(repo, s, v.runId, { readSeconds: 100 }, at(2, 2));
    await submitActivity(repo, s, v.runId, answers(8), at(2, 2));
    const lib2 = await studentLibrary(repo, s, {}, at(2, 3));
    assert.equal(lib2.continueReading.find((c) => c.id === b)?.status, "FINISH_STEPS");
    const work = (await extraWorkItems(repo, s, at(2, 3))).find((w) => w.assignmentId === `readrise:${b}`)!;
    assert.deepEqual([work.status, work.note], ["In progress", "Finish steps 4–5"]);
    assert.ok(lib2.all.length <= 24 && lib2.total >= lib2.all.length && lib2.pages >= 1);
    await afterResponseSettled();
  });

  test("From my teacher: a cancelled article and a future start date are hidden (never recommended either)", async () => {
    const s = st[3], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const classId = String((await repo.findMany("ClassMembership", { studentId: sid, leftAt: null }))[0].classId);
    const a = await makeArticle(repo, "R5-6"), f = await makeArticle(repo, "R5-7");
    const ca = await repo.create("RRClassArticle", { classId, articleId: a, assignedById: admin.userId, createdAt: at(1) });
    await repo.create("RRClassArticle", { classId, articleId: f, assignedById: admin.userId, startAt: at(30), createdAt: at(1) });
    const lib = await studentLibrary(repo, s, {}, at(1, 1));
    assert.ok(lib.assigned.some((c) => c.id === a));
    assert.ok(!lib.assigned.some((c) => c.id === f), "starts later: not on the shelf yet");
    assert.ok(!lib.recommended.some((c) => c.id === f), "a future-start assigned article is never recommended");
    await repo.create("AssignmentCancel", { schoolId: s.schoolId, kind: "READRISE", refId: String(ca.id), classId, studentId: null, keys: [`readrise:${a}`], title: "x", cancelledById: admin.userId, cancelledAt: at(1, 2) });
    const lib2 = await studentLibrary(repo, s, {}, at(1, 3));
    assert.ok(!lib2.assigned.some((c) => c.id === a), "cancelled: gone from From my teacher");
    assert.ok(lib2.total > 0 && (lib2.all.some((c) => c.id === a) || lib2.pages > 1), "still in All articles");
  });

  test("the done screen offers Read next with its reason; no duplicate 'Try a new article' button", async () => {
    const s = st[4], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const a = await makeArticle(repo, "R5-8");
    await makeArticle(repo, "R5-9");
    const r = await read(repo, s, a, 8, at(1));
    const next = r.done.done!.readNext;
    assert.ok(next && next.articleId && next.reason && typeof next.reason.label === "string", "a Read next card");
    const src = readFileSync("src/components/readrise/reader.tsx", "utf8");
    assert.ok(src.includes('data-testid="rr-read-next"') && !src.includes("Try a new article"));
    assert.ok(src.includes('tr("Goal met! One more?")') && src.includes('tr("Score 75% on the next one so it counts toward moving up.")'));
    await afterResponseSettled();
  });

  test("stretch sets: the import reads them; the sync adds the missing ones once (idempotent)", async () => {
    const raw = JSON.parse(readFileSync("data/readrise/articles/RR-001.json", "utf8")) as Record<string, unknown> & { bands: Record<string, { questions: unknown[] }> };
    const sets = { LOW: raw.bands.LOW.questions.slice(0, 4), MID: raw.bands.MID.questions.slice(0, 4), HIGH: raw.bands.HIGH.questions.slice(0, 4) };
    const v = validateArticle({ ...raw, stretch: sets });
    assert.equal(v.errors.filter((e) => /stretch|S-/.test(`${e.where} ${e.message}`)).length, 0);
    if (v.article) assert.equal(v.article.stretch?.HIGH?.length, 4);
    const bad = validateArticle({ ...raw, stretch: { LOW: sets.LOW.slice(0, 3) } });
    assert.ok(bad.errors.some((e) => /stretch set needs exactly 4/.test(e.message)));
    // the sync: an article already in the database (no stretch rows) + a file with its stretch sets
    const root = mkdtempSync(join(tmpdir(), "rr5-"));
    mkdirSync(join(root, "data", "readrise", "articles"), { recursive: true });
    writeFileSync(join(root, "data", "readrise", "articles", "RR-001.json"), JSON.stringify({ ...raw, stretch: sets }));
    writeFileSync(join(root, "data", "readrise", "articles", "RR-002.json"), JSON.stringify({ code: "RR-NOPE", stretch: sets }));
    const art = await repo.create("RRArticle", { schoolId: null, code: String(raw.code), title: "x", topic: "Science", pollStatement: "p", status: "PUBLISHED" });
    const one = await syncStretchChunk(repo, root, 0, 1);
    assert.deepEqual([one.next, one.total, one.added, one.articles], [1, 2, 12, 1]);
    const two = await syncStretchChunk(repo, root, one.next!, 1);
    assert.deepEqual([two.next, two.added], [null, 0], "an article not in the database is skipped");
    assert.equal((await syncStretchChunk(repo, root, 0, 10)).added, 0, "idempotent");
    const rows = await repo.findMany("RRQuestion", { articleId: art.id, band: "S-H" });
    assert.equal(rows.length, 4);
    assert.ok(rows.every((q) => ["A", "B", "C", "D"].includes(String(q.answer))));
  });

  // ------------------------------------------------------------------ review fixes

  test("fix 1 · after a level drop the stretch is above the version READ (never the same or an easier text)", () => {
    const vs = RR_LEVELS.map((level) => ({ level }));
    const first = { firstTry: true, stretch: false, step: "DONE", score: 90, band: "MID", versionLevel: 1000 };
    const o = stretchOffer([first], 800, vs);
    assert.deepEqual([o.ok, o.up, o.band, o.mode], [true, 1100, "HIGH", "FULL"]);
    assert.equal(stretchOffer([{ ...first, versionLevel: 800 }], 800, vs).up, 900);
  });

  test("fix 3 · two first-try stretches (a race / old data) count once; startRun never makes two", async () => {
    const r = (o: Record<string, unknown>) => ({ studentId: "s", articleId: "a", firstTry: true, stretch: false, band: "MID", score: 90, completedAt: "2026-09-07T08:00:00Z", startedAt: "2026-09-07T07:00:00Z", ...o });
    const rows = [r({}), r({ stretch: true, band: "HIGH", startedAt: "2026-09-07T09:00:00Z" }), r({ stretch: true, band: "HIGH", startedAt: "2026-09-07T09:00:01Z" }), r({ startedAt: "2026-09-07T07:30:00Z" })];
    assert.equal(countedTries(rows).length, 2, "the earliest main first try + the earliest stretch");
    assert.equal(articleRuns(rows).length, 1);
    const s = st[5], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 1000, "", at(0));
    const a = await makeArticle(repo, "R5-R");
    await read(repo, s, a, 8, at(1));
    const both = await Promise.allSettled([startRun(repo, s, a, { stretch: true }, at(1, 1)), startRun(repo, s, a, { stretch: true }, at(1, 1))]);
    assert.ok(both.some((x) => x.status === "fulfilled"));
    assert.equal((await repo.findMany("RRRun", { studentId: sid, articleId: a, stretch: true })).length, 1, "one stretch run");
    const src = readFileSync("src/server/readrise/student.ts", "utf8");
    assert.match(src, /await tx\.updateMany\("RRStudent", \{ studentId \}, \{ updatedAt: now \}\);\s*const runs = await tx\.findMany\("RRRun"/, "the row lock comes first");
  });

  test("fix 5 · no '+50' promise at the top level", () => {
    assert.equal(readsToMoveUp([80], 1600), null);
    assert.equal(readsToMoveUp([80], 1650), null);
    assert.equal(readsToMoveUp([80], 1500), 2);
  });

  test("fix 2 · the sync skips a stretch band with an error (and reports it)", async () => {
    const raw = JSON.parse(readFileSync("data/readrise/articles/RR-002.json", "utf8")) as Record<string, unknown> & { bands: Record<string, { questions: Record<string, unknown>[] }> };
    const root = mkdtempSync(join(tmpdir(), "rr5b-"));
    mkdirSync(join(root, "data", "readrise", "articles"), { recursive: true });
    const broken = raw.bands.MID.questions.slice(0, 4).map((q, i) => (i === 2 ? { ...q, answer: "Z" } : q));
    writeFileSync(join(root, "data", "readrise", "articles", "RR-002.json"), JSON.stringify({ ...raw, stretch: { LOW: raw.bands.LOW.questions.slice(0, 4), MID: broken } }));
    const art = await repo.create("RRArticle", { schoolId: null, code: String(raw.code), title: "x", topic: "Science", pollStatement: "p", status: "PUBLISHED" });
    const r = await syncStretchChunk(repo, root, 0, 5);
    assert.equal(r.added, 4, "LOW only");
    assert.ok(r.problems.some((p) => p.problems.some((x) => /S-M/.test(x))));
    assert.equal((await repo.findMany("RRQuestion", { articleId: art.id, band: "S-M" })).length, 0);
  });

  test("fix 6 · a cancel in class A never hides the same article still given in class B", async () => {
    const s = st[3], sid = s.studentId!;
    const mine = (await repo.findMany("ClassMembership", { studentId: sid, leftAt: null })).map((m) => String(m.classId));
    const other = (await repo.findMany("Class", { schoolId: s.schoolId })).map((c) => String(c.id)).find((id) => !mine.includes(id))!;
    await repo.create("ClassMembership", { classId: other, studentId: sid, joinedAt: at(0) });
    const a = await makeArticle(repo, "R5-X");
    const rowA = await repo.create("RRClassArticle", { classId: mine[0], articleId: a, assignedById: admin.userId, createdAt: at(1) });
    await repo.create("RRClassArticle", { classId: other, articleId: a, assignedById: admin.userId, createdAt: at(1) });
    await repo.create("AssignmentCancel", { schoolId: s.schoolId, kind: "READRISE", refId: String(rowA.id), classId: mine[0], studentId: null, keys: [`readrise:${a}`], title: "x", cancelledById: admin.userId, cancelledAt: at(1, 1) });
    assert.ok((await studentLibrary(repo, s, {}, at(1, 2))).assigned.some((c) => c.id === a), "still given in class B");
  });
});
