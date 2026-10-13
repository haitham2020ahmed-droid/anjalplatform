/**
 * MAP → MAP Test tab (FAKE test data only — the in-memory Test School): the automatic test (adaptive, length, goal-area
 * shares, exclusions), the manual test (suggest, edit, fixed order, grading, RIT estimate), the test page's report data,
 * the student's side (their RIT, never a level word) and the old /teacher/map-test redirect.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { loadQuestionItems, type PracticeItem } from "../src/server/practice/items";
import { answerTest, blueprint, myTests, startTest, type TestScreen } from "../src/server/map/sim";
import { createMapTest, DEFAULT_ITEMS, editManualItems, ESTIMATE_NOTE, loadTest, mapTestDoc, mapTestList, studentItems, testDetail, testPool, testReport, updateMapTest } from "../src/server/map/map-test";
import { renderXlsx } from "../src/reports/xlsx";
import { mapCenterHref, mapTabOf, mapTestHref } from "../src/app/teacher/map-center/href";
import { demoDatabase, seededRandom } from "./helpers/db";

const DAY = 86_400_000;
const LEVEL_WORDS = /\b(Below|On Level|Above|Approaching|Meeting|Exceeding|Mastered|Developing|Needs support|Tier|RTI|LoAvg|HiAvg)\b/;

/** A right (or wrong) answer for any question type. */
function answerFor(it: PracticeItem, right: boolean): unknown {
  if (it.options) {
    if (it.type === "MULTI_SELECT") return right ? it.options.filter((o) => o.correct).map((o) => o.label) : [it.options.find((o) => !o.correct)!.label];
    return (it.options.find((o) => o.correct === right) ?? it.options[0]).label;
  }
  if (it.type === "TRUE_FALSE") return right ? it.answer : !it.answer;
  if (it.type === "FILL_BLANK") return right ? it.answers![0] : "zzzz";
  if (it.type === "ERROR_CORRECTION") return right ? { index: it.errorIndex, correction: it.correction } : { index: (it.errorIndex! + 1) % it.segments!.length, correction: "zz" };
  if (it.type === "MATCHING") { const m = Object.fromEntries(it.pairs!.map((p) => [p.left, p.right])); if (!right) { const ks = Object.keys(m); [m[ks[0]], m[ks[1]]] = [m[ks[1]], m[ks[0]]]; } return m; }
  if (it.sequence) return right ? it.sequence : [...it.sequence].reverse();
  return null;
}

describe("MAP → MAP Test tab", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor;
  let classId = ""; let students: string[] = [];
  let autoId = ""; let manualId = "";
  const now = new Date(Date.UTC(2026, 10, 2, 8));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  /** A fake student answers like the Rasch model says (or always right / wrong); returns the last screen and the items served. */
  async function take(windowId: string, sid: string, opts: { ability?: number; always?: boolean; seed?: number }): Promise<{ sc: TestScreen; served: string[] }> {
    const me = await studentActor(sid);
    const rng = seededRandom(opts.seed ?? 1);
    let clock = now.getTime() + DAY;
    let sc = await startTest(repo, me, { windowId, subject: "READING" }, new Date(clock));
    const served: string[] = [];
    while (!sc.done) {
      const q = sc.question!;
      assert.ok(!served.includes(q.questionId), "never the same question twice");
      served.push(q.questionId);
      const [it] = await loadQuestionItems(repo, [q.questionId]);
      let right: boolean;
      if (opts.always !== undefined) right = opts.always;
      else { const tag = await repo.findUnique("Question", { id: q.questionId }); const b = Number((tag?.tags as { rit?: { value?: number } } | null)?.rit?.value ?? NaN); const r = Number.isFinite(b) ? b : 200 + (Number(it.level) - 4) * 6; right = rng() < 1 / (1 + Math.exp(-(opts.ability! - r) / 10)); }
      clock += 40_000;
      sc = await answerTest(repo, me, sc.sessionId, q.questionId, answerFor(it, right), new Date(clock));
    }
    return { sc, served };
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await actorFor(`test.teacher.${i}`);
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      const g = Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level);
      if (g === 5 && !classId) { teacher = t; classId = String(c.id); } else if (!other) other = t;
    }
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    await repo.create("MapResult", { studentId: students[0], testDate: new Date(Date.UTC(2026, 8, 15)), subject: "Reading", goalName: null, rit: 200, projectedGrowth: 10, termName: "Fall 2026", importedAt: now });
  });

  test("automatic test: MAP-like default length, the teacher's class only, area shares, exclusions", async () => {
    // the real MAP Growth length by default (Reading 42, Language Usage 52), changeable
    assert.equal(DEFAULT_ITEMS.READING, 42); assert.equal(DEFAULT_ITEMS.LANGUAGE, 52);
    const lang = await createMapTest(repo, teacher, { kind: "AUTO", subject: "LANGUAGE", classIds: [classId], opensAt: now, closesAt: new Date(now.getTime() + 14 * DAY) }, now);
    assert.equal((await testDetail(repo, teacher, lang, now)).v.items, 52);
    await assert.rejects(createMapTest(repo, other, { kind: "AUTO", subject: "READING", classIds: [classId], opensAt: now, closesAt: new Date(now.getTime() + DAY) }, now), ForbiddenError, "another teacher's class");
    await assert.rejects(createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", classIds: [classId], items: 70, opensAt: now, closesAt: new Date(now.getTime() + DAY) }, now), ValidationError);
    autoId = await createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", classIds: [classId], items: 24, shares: { LIT: 50, INFO: 25, VOCAB: 25 }, opensAt: now, closesAt: new Date(now.getTime() + 14 * DAY) }, now);
    const d = await testDetail(repo, teacher, autoId, now);
    assert.deepEqual(d.plan.map((p) => p.n), [12, 6, 6], "the shares decide the blueprint");
    assert.deepEqual([...blueprint("READING", 24, { LIT: 50, INFO: 25, VOCAB: 25 }).values()], [12, 6, 6]);
    assert.deepEqual([...blueprint("READING", 50).values()], [17, 17, 16], "even without shares");
    // the pool of each goal area, and exclusions
    const pool = await testPool(repo, teacher, autoId, { area: "LIT" }, now);
    assert.equal(pool.length, 3);
    const lit = pool.find((p) => p.key === "LIT")!;
    assert.ok(lit.total > 10 && lit.items.length > 0);
    const out = lit.items.slice(0, 6).map((q) => q.id);
    await updateMapTest(repo, teacher, autoId, { excludedIds: out }, now);
    assert.equal((await testPool(repo, teacher, autoId, {}, now)).find((p) => p.key === "LIT")!.excluded, 6);
    // the list (the tab): the teacher's test, finished 0 of the class
    const rows = await mapTestList(repo, teacher, "READING", now);
    const row = rows.find((r) => r.id === autoId)!;
    assert.equal(row.status, "open"); assert.equal(row.total, students.length); assert.equal(row.finished, 0);
    await assert.rejects(loadTest(repo, other, autoId, now), ForbiddenError, "another teacher cannot open it");
    assert.ok((await mapTestList(repo, admin, null, now)).some((r) => r.id === autoId), "the admin sees every class's tests");
  });

  test("automatic test: adaptive (a strong reader scores higher), never an excluded item, the blueprint followed", async () => {
    const weak = await take(autoId, students[0], { ability: 185, seed: 1 });
    const strong = await take(autoId, students[1], { ability: 228, seed: 2 });
    assert.ok(weak.sc.result && strong.sc.result);
    assert.ok(strong.sc.result!.rit > weak.sc.result!.rit + 8, `strong ${strong.sc.result!.rit} vs weak ${weak.sc.result!.rit}`);
    const excluded = new Set((await testDetail(repo, teacher, autoId, now)).excluded);
    for (const q of [...weak.served, ...strong.served]) assert.ok(!excluded.has(q), "an excluded question is never served");
    assert.equal(weak.served.length, 24, "the test length");
    const sess = (await repo.findMany("MapSimSession", { windowId: autoId, studentId: students[0] }))[0];
    const ans = await repo.findMany("MapSimAnswer", { sessionId: sess.id });
    const n = (k: string) => ans.filter((a) => a.area === k).length;
    assert.ok(n("LIT") >= 10 && n("LIT") > n("INFO") && n("LIT") > n("VOCAB"), `LIT ${n("LIT")} INFO ${n("INFO")} VOCAB ${n("VOCAB")}`);
    // after anyone started: only the dates and the students can change
    await assert.rejects(updateMapTest(repo, teacher, autoId, { items: 30 }, now), ValidationError);
    await updateMapTest(repo, teacher, autoId, { closesAt: new Date(now.getTime() + 20 * DAY) }, now);
  });

  test("manual test: Suggest for me, edit (remove / add / move / replace), fixed order, graded with an RIT estimate", async () => {
    manualId = await createMapTest(repo, teacher, { kind: "MANUAL", subject: "READING", classIds: [classId], opensAt: now, closesAt: new Date(now.getTime() + 14 * DAY), manual: { areas: ["LIT", "VOCAB"], count: 8, ritLow: 150, ritHigh: 260 } }, now);
    let d = await testDetail(repo, teacher, manualId, now);
    assert.equal(d.v.draft, true); assert.equal(d.items.length, 8);
    assert.ok(d.items.every((x) => x.area === "LIT" || x.area === "VOCAB"), "only the chosen goal areas");
    assert.deepEqual(d.items.map((x) => x.area).filter((a) => a === "LIT").length, 4, "shared evenly");
    const me = await studentActor(students[2]);
    assert.ok(!(await myTests(repo, me, now)).windows.some((w) => w.id === manualId), "a draft is not shown to students");
    await editManualItems(repo, teacher, manualId, { op: "remove", id: d.items[0].id }, now);
    await editManualItems(repo, teacher, manualId, { op: "add", area: "INFO" }, now);
    d = await testDetail(repo, teacher, manualId, now);
    assert.equal(d.items.length, 8); assert.equal(d.items[7].area, "INFO");
    const [a, b] = [d.items[0].id, d.items[1].id];
    await editManualItems(repo, teacher, manualId, { op: "down", id: a }, now);
    d = await testDetail(repo, teacher, manualId, now);
    assert.deepEqual([d.items[0].id, d.items[1].id], [b, a], "reordered");
    const old = d.items[2];
    await editManualItems(repo, teacher, manualId, { op: "replace", id: old.id }, now);
    d = await testDetail(repo, teacher, manualId, now);
    assert.notEqual(d.items[2].id, old.id); assert.equal(d.items[2].area, old.area, "replaced inside the same goal area");
    // pick one by one from the bank
    const info = (await testPool(repo, teacher, manualId, { area: "INFO" }, now)).find((p) => p.key === "INFO")!;
    const pick = info.items.find((q) => !q.inTest)!;
    await editManualItems(repo, teacher, manualId, { op: "add", id: pick.id }, now);
    await assert.rejects(editManualItems(repo, teacher, manualId, { op: "add", id: pick.id }, now), ValidationError, "not twice");
    d = await testDetail(repo, teacher, manualId, now);
    assert.equal(d.items.length, 9);
    await updateMapTest(repo, teacher, manualId, { publish: true }, now);
    assert.ok((await myTests(repo, me, now)).windows.some((w) => w.id === manualId), "assigned: the student sees it");
    // the student: the items in the teacher's order; all right → an RIT above the items' average
    const r = await take(manualId, students[2], { always: true });
    assert.deepEqual(r.served, d.items.map((x) => x.id), "fixed order, every item once");
    const avg = d.items.reduce((t, x) => t + x.rit, 0) / d.items.length;
    assert.ok(r.sc.result!.rit > avg, `RIT ${r.sc.result!.rit} vs items ${avg}`);
    const wrong = await take(manualId, students[3], { always: false });
    assert.ok(wrong.sc.result!.rit < r.sc.result!.rit);
    // started: the items are locked, the dates can still move
    await assert.rejects(editManualItems(repo, teacher, manualId, { op: "remove", id: d.items[0].id }, now), ValidationError);
    await updateMapTest(repo, teacher, manualId, { opensAt: now, closesAt: new Date(now.getTime() + 21 * DAY) }, now);
    const rep = await testReport(repo, teacher, manualId, "READING", now);
    const st = rep.students.find((x) => x.studentId === students[2])!;
    assert.equal(st.score, 100);
    assert.ok(st.areas.filter((x) => x.n).every((x) => x.ok === x.n), "score per goal area");
    assert.equal(rep.students.find((x) => x.studentId === students[3])!.score, 0);
  });

  test("the test page: progress, each student's RIT with range and percentile, class summary, groups, item analysis, downloads", async () => {
    const r = await testReport(repo, teacher, manualId, "READING", now);
    assert.equal(r.note, ESTIMATE_NOTE);
    assert.equal(r.progress.targets, students.length);
    assert.equal(r.progress.finished, 2); assert.equal(r.progress.notStarted, students.length - 2);
    const done = r.students.filter((x) => x.status === "DONE");
    for (const x of done) { assert.ok(x.rit !== null && x.low! < x.rit! && x.high! > x.rit!); assert.ok(x.percentile !== null && x.percentile >= 1 && x.percentile <= 99); }
    assert.equal(r.summary.distribution.reduce((t, b) => t + b.n, 0), 2);
    assert.ok(r.summary.avg !== null);
    assert.ok(r.groups.length >= 1 && r.groups.every((g) => g.href.includes("tab=plan") && g.href.includes("sid=")), "ready-made groups → Make a plan");
    assert.equal(r.items.length, 9);
    assert.ok(r.items.every((x) => x.pct === 50), "one right, one wrong on each item");
    assert.ok(r.items.some((x) => x.topWrong), "the most chosen wrong answer");
    // the latest real MAP and the Spring goal (student 0 has a Fall score) on the automatic test
    const a = await testReport(repo, teacher, autoId, "READING", now);
    const s0 = a.students.find((x) => x.studentId === students[0])!;
    assert.equal(s0.real?.rit, 200); assert.equal(s0.fall, 200);
    assert.equal(typeof s0.onTrack, "boolean", "on track for the Spring goal (Fall + the share of the projected growth)");
    const items = await studentItems(repo, teacher, autoId, students[0], "READING", now);
    assert.equal(items.items.length, 24, "exactly which items the student got");
    await assert.rejects(testReport(repo, other, manualId, "READING", now), ForbiddenError);
    // Excel (the same document makes the PDF)
    const doc = mapTestDoc(r, { branding: { name: "Test School", nameAr: null, logo: null }, generatedAt: now, generatedBy: "Teacher" });
    assert.deepEqual(doc.sections.filter((x) => x.type === "table").map((x) => (x as { id: string }).id), ["students", "items", "groups"]);
    assert.ok(renderXlsx(doc).length > 1000);
    const page = readFileSync(join(process.cwd(), "src/app/teacher/map-center/test-page.tsx"), "utf8");
    for (const w of ["/api/map-test/export", "Make a plan", "Item analysis", "Progress", "Details", "/preview", "view: \"print\""]) assert.ok(page.includes(w), w);
  });

  test("the student sees the RIT and the goal areas to practise — never a level word", async () => {
    const me = await studentActor(students[2]);
    const t = await myTests(repo, me, now);
    const w = t.windows.find((x) => x.id === manualId)!;
    const x = w.sessions[0];
    assert.equal(x.status, "DONE");
    assert.equal(typeof x.resultRit, "number");
    const sc = await startTest(repo, me, { windowId: manualId, subject: "READING" }, now);
    assert.ok(sc.done && sc.result && typeof sc.result.rit === "number");
    assert.ok(Array.isArray(sc.result.practise));
    const words = JSON.stringify({ practise: sc.result.practise, titles: t.windows.map((v) => v.title), all: t.windows.flatMap((v) => v.sessions.flatMap((y) => y.practise)) });
    assert.ok(!LEVEL_WORDS.test(words), words);
    for (const f of ["src/components/map/test-player.tsx", "src/app/student/map-test/page.tsx", "src/app/student/map/page.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      assert.ok(!/descriptor|DESC_STYLE|LoAvg|HiAvg|"Below"|"Above"/.test(src), `${f}: no level words for students`);
    }
    assert.match(readFileSync(join(process.cwd(), "src/components/map/test-player.tsx"), "utf8"), /result\.rit/);
  });

  test("/teacher/map-test opens the MAP Test tab (one place only)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/teacher/map-test/page.tsx"), "utf8");
    assert.match(src, /redirect\(/); assert.match(src, /mapCenterHref\("test"/); assert.match(src, /mapTestHref\(/);
    assert.equal(mapTabOf("test"), "test");
    assert.equal(mapCenterHref("test", { subject: "language" }), "/teacher/map-center?tab=test&subject=LANGUAGE");
    assert.equal(mapTestHref("abc", { subject: "READING" }), "/teacher/map-center/test/abc?subject=READING");
    const page = readFileSync(join(process.cwd(), "src/app/teacher/map-center/page.tsx"), "utf8");
    assert.match(page, /tab: "test"/); assert.ok(page.includes("<TestTab"));
    const tab = readFileSync(join(process.cwd(), "src/app/teacher/map-center/test-tab.tsx"), "utf8");
    for (const w of ["Automatic MAP test (simulates MAP Growth)", "Manual test", "Suggest for me"]) assert.ok(tab.includes(w), w);
  });
});
