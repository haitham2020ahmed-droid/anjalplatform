/**
 * UI reorg Phase 2 — Student Home (in-memory Demo School; invented students only):
 *  - welcome counts (skills to work on, tests waiting) and "Continue where you left off"
 *  - My Work: one row per skill with its source tag (Curriculum / MAP / RTI / Grammar / Reteach …); ALL grammar inside
 *  - RTI Program only for students in Tier 2/3 (home tile, menu entry, page)
 *  - ReadMaster (every published article of the grade) and ReadRise (the whole library) open with no assignment
 *  - MAP dashboard at the top of My Plans; /student/map still reachable from there
 *  - the home page stays fast (bounded number of queries)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { assignPlan } from "../src/server/plans/wizard";
import { assignTest } from "../src/server/tests/assessments";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { myMap } from "../src/server/map/map-more";
import { startPractice } from "../src/server/practice/session";
import { navCounts } from "../src/server/teacher/week-plan";
import { navItemsFor } from "../src/components/nav-items";
import { lastActivity, reportCategories, studentCurriculum, studentHome, studentRtiProgram } from "../src/server/student/student-home";
import { mapDashboardData } from "../src/server/student/student-home";
import { addVersionQuestion, openArticle, saveArticle, saveVersion, setArticleStatus, studentArticles } from "../src/server/readmaster/service";
import { ensureReadRiseLibrary } from "../src/server/readrise/seed";
import { startRun, studentLibrary } from "../src/server/readrise/student";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2027-01-10T08:00:00Z");
const AUTO = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN", "TRUE_FALSE"]);

/** Counts every database call (a call = one round trip). */
function counting(repo: Repo): { repo: Repo; calls: () => number } {
  let n = 0;
  const r = new Proxy(repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === "function" ? (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(target, a); } : v; } });
  return { repo: r as Repo, calls: () => n };
}

describe("UI reorg Phase 2: Student Home", () => {
  let repo: SqliteRepo;
  let admin: Actor, t4: Actor;
  let class4: string;
  let a: string, b: string;          // two Grade 4 students
  let A: Actor, B: Actor;
  let skill1: string, skill2: string, grammarSkill: string, reteachSkill: string;
  const actorFor = async (username: string) => resolveActor(repo, (await repo.findUnique("User", { username }))!);
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id: studentId }))!.userId) }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const qs = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^G4-/.test(String(q.externalRef)));
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await actorFor("demo.admin");
    t4 = await actorFor("demo.teacher.4a");
    const cur = (await teacherCurriculum(repo, t4))!;
    class4 = cur.classId;
    const members = (await repo.findMany("ClassMembership", { classId: class4, leftAt: null })).map((m) => String(m.studentId)).sort();
    [a, b] = members;
    A = await studentActor(a); B = await studentActor(b);
    const counts = new Map<string, number>();
    for (const q of await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"] })) counts.set(String(q.skillId), (counts.get(String(q.skillId)) ?? 0) + 1);
    const skills = cur.units.flatMap((u) => u.skills).filter((k) => (counts.get(k.id) ?? 0) >= 6);
    [skill1, skill2, reteachSkill] = skills.map((k) => k.id);
    // a grammar skill (sent as Custom work → shows as Grammar in My Work)
    const base = (await repo.findMany("Skill", { id: skill1 }))[0];
    const { id: _id, code: _code, ...rest } = base; void _id; void _code;
    grammarSkill = String((await repo.create("Skill", { ...rest, code: "G4.grammar.test-shome-1", name: "Test grammar: capital letters" })).id);
  });

  test("welcome counts and My Work rows with their source tags (all grammar inside My Work)", async () => {
    const empty = await studentHome(repo, A, NOW);
    assert.equal(empty.toDo, 0);
    assert.equal(empty.work.length, 0, "friendly empty state when there is no work");
    await assignSkill(repo, t4, { classId: class4, skillId: skill1 }, NOW);
    await assignSkill(repo, t4, { classId: class4, skillId: skill2, track: "MAP", studentIds: [a] }, NOW);
    await assignPlan(repo, t4, { classId: class4, type: "CUSTOM", skillIds: [grammarSkill], studentIds: [a] }, NOW);
    await assignSkill(repo, t4, { classId: class4, skillId: reteachSkill, studentIds: [a], note: "Reteach: Weekly Quiz – Week 6" }, NOW);
    // one test waiting (My Tests, not My Work)
    const qIds = (await repo.findMany("Question", { skillId: skill1, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId"] }));
    const types = await repo.findMany("QuestionType", { id: { in: [...new Set(qIds.map((q) => q.typeId))] } });
    const auto = qIds.filter((q) => AUTO.has(String(types.find((t) => t.id === q.typeId)?.code))).slice(0, 3).map((q) => String(q.id));
    assert.ok(auto.length >= 2, "auto-marked questions for the test");
    await assignTest(repo, t4, { classId: class4, type: "WEEKLY_QUIZ", title: "Weekly Quiz – Week 6", levelMode: "SAME", questions: { SAME: auto }, studentIds: [a] }, NOW);

    const h = await studentHome(repo, A, NOW);
    const tag = (id: string) => h.work.find((w) => w.skillId === id);
    assert.equal(tag(skill1)?.sourceKey, "CURRICULUM");
    assert.equal(tag(skill2)?.sourceKey, "MAP", "MAP work is in My Work (no separate MAP area)");
    assert.equal(tag(grammarSkill)?.sourceKey, "GRAMMAR", "grammar work lives in My Work with the Grammar tag");
    assert.equal(tag(reteachSkill)?.reteach, true, "Reteach work after a test is tagged Reteach");
    assert.equal(h.work.length, 4, "one row per skill; the test is not a My Work row");
    assert.ok(h.work.every((w) => w.href.startsWith("/practice/") && w.action === "Start"), "Start opens the questions at the student's level");
    assert.equal(h.toDo, 4);
    assert.equal(h.testsToDo, 1);
    // the welcome line (and its Arabic version) carries both numbers
    const line = "Hello, {name} — you have {x} skills to work on and {y} tests waiting.";
    assert.ok((UI_STRINGS as readonly string[]).includes(line));
    assert.match(ar[line as (typeof UI_STRINGS)[number]], /\{x\}[\s\S]*\{y\}/);
    // another student: only the class-wide skill, no tests
    const hb = await studentHome(repo, B, NOW);
    assert.deepEqual([hb.toDo, hb.testsToDo, hb.work.map((w) => w.skillId)], [1, 0, [skill1]]);
  });

  test("Continue where you left off: reopens the last practice (or nothing when nothing is open)", async () => {
    assert.equal(await lastActivity(repo, B, NOW), null, "nothing open yet");
    const view = await startPractice(repo, A, skill2, NOW);
    assert.ok(view.question);
    const last = await lastActivity(repo, A, new Date(NOW.getTime() + 60_000));
    assert.ok(last, "an open practice session is found");
    assert.equal(last!.kind, "PRACTICE");
    assert.equal(last!.href, `/practice/${encodeURIComponent(skill2)}`);
    assert.equal(last!.title, String((await repo.findUnique("Skill", { id: skill2 }))!.name));
    const h = await studentHome(repo, A, new Date(NOW.getTime() + 60_000));
    assert.equal(h.last?.href, last!.href, "the home page's Continue button");
    // a month later the old session is not "where you left off" any more
    assert.equal(await lastActivity(repo, A, new Date(NOW.getTime() + 40 * 86_400_000)), null);
  });

  test("RTI Program: only for students in Tier 2/3 (home tile, menu entry, page)", async () => {
    assert.equal((await studentHome(repo, B, NOW)).rti, null);
    assert.equal(await studentRtiProgram(repo, B, NOW), null);
    assert.ok(!navItemsFor("STUDENT").some((i) => i.href === "/student/rti"), "no RTI entry by default");
    assert.ok(!("/student/rti" in (await navCounts(repo, B, NOW))));
    await repo.create("StudentTier", { studentId: b, schoolId: admin.schoolId, tier: 2, source: "TEACHER", locked: false, reason: "Test", focusSkillId: skill2, since: NOW, monitorEveryDays: 14, updatedAt: NOW });
    await assignPlan(repo, t4, { classId: class4, type: "RTI" }, NOW);
    const h = await studentHome(repo, B, NOW);
    assert.deepEqual(h.rti, { tier: 2, focusSkillId: skill2 });
    assert.ok(h.work.some((w) => w.sourceKey === "RTI"), "RTI skills are in My Work with the RTI tag");
    const p = (await studentRtiProgram(repo, B, NOW))!;
    assert.equal(p.tier, 2);
    assert.equal(p.focus?.skillId, skill2);
    assert.ok(p.skills.length >= 1 && p.skills.every((w) => w.sourceKey === "RTI"), "the week's skills");
    assert.ok("/student/rti" in (await navCounts(repo, B, NOW)), "the menu shows the RTI entry");
    assert.ok(navItemsFor("STUDENT", { rti: true }).some((i) => i.href === "/student/rti" && i.group === "Programs"));
    assert.equal((await studentHome(repo, A, NOW)).rti, null, "a student outside RTI still has no RTI icon");
    // the page source shows the tile only when rti is set
    const page = readFileSync(join(ROOT, "src/app/student/page.tsx"), "utf8");
    assert.match(page, /\{h\.rti && <BigTile href="\/student\/rti"/);
  });

  test("ReadMaster (all of the grade) and ReadRise (whole library) open with no teacher assignment", async () => {
    const id = await saveArticle(repo, admin, { code: "SHOME-01", title: "Shome test article", grade: 4 });
    for (const [lv, lx] of [["BELOW", 640], ["ON", 800], ["ABOVE", 950]] as const) {
      const vid = await saveVersion(repo, admin, id, lv, { lexile: lx, body: `An invented article about rivers at the ${lv} level. ${"Rivers carry water from the hills to the sea. ".repeat(4)}` });
      await addVersionQuestion(repo, admin, vid, { stem: `Main idea ${lv}?`, whyCorrect: "Because.", options: [{ label: "A", text: `right ${lv}`, correct: true }, { label: "B", text: `wrong ${lv}`, correct: false }] });
    }
    await setArticleStatus(repo, admin, id, "PUBLISHED");
    assert.equal(await repo.count("Assignment", { title: "Shome test article" }), 0, "nothing assigned");
    const list = await studentArticles(repo, A);
    assert.ok(list.articles.some((x) => x.id === id), "every published article of the grade is listed");
    assert.equal((await openArticle(repo, A, id)).articleId, id, "and opens without an assignment");

    await ensureReadRiseLibrary(repo, ROOT, NOW);
    const lib = await studentLibrary(repo, B, {}, NOW);
    assert.ok(lib.all.length >= 10, "the whole ReadRise library");
    assert.equal(lib.assigned.length, 0, "nothing assigned by a teacher");
    const run = await startRun(repo, B, lib.all[0].id, {}, NOW);
    assert.ok(run, "an article opens without an assignment");
    // an open ReadRise article is "where you left off" when it is the newest activity
    const last = await lastActivity(repo, B, new Date(NOW.getTime() + 1000));
    assert.equal(last?.kind, "READRISE");
    assert.equal(last?.href, `/student/readrise/${lib.all[0].id}`);
  });

  test("My Plans: the MAP dashboard (RIT, level, strengths, skills to work on); MAP results reachable from there", async () => {
    const st = (await repo.findUnique("Student", { id: a }))!;
    const name = String((await repo.findUnique("User", { id: st.userId }))!.displayName);
    const header = [...MAP_TEMPLATE_HEADERS];
    const row = header.map((h) => ({ "Student Number": String(st.studentNumber), "Student Name": name, "Reading Fall RIT": "188", "R: Informational Text": "176", "R: Literary Text": "199", "R: Vocabulary": "190" } as Record<string, string>)[h] ?? "");
    assert.equal((await importMapScores(repo, t4, [header, row], 2026, NOW)).imported, 1);
    const d = mapDashboardData(await myMap(repo, A));
    const r = d.subjects.find((x) => x.subject === "READING")!;
    assert.ok(r, "Reading MAP on the dashboard");
    assert.equal(r.rit, 188);
    assert.ok(r.needsWork.length >= 1, "skills needing work");
    assert.ok(r.strengths.length >= 1, "strengths");
    assert.ok(!r.strengths.some((n) => r.needsWork.some((w) => w.name === n)), "a strength is never also a weak area");
    const plans = readFileSync(join(ROOT, "src/app/student/plans/page.tsx"), "utf8");
    assert.match(plans, /<MapDashboard actor=\{actor\} \/>/, "the dashboard is at the top of My Plans");
    assert.match(readFileSync(join(ROOT, "src/components/student/map-dashboard.tsx"), "utf8"), /href="\/student\/map"/, "the full MAP results page is one click from My Plans");
    // no student MAP icon in the menu; My Tests and My Reports are there
    const nav = navItemsFor("STUDENT").map((i) => i.href);
    assert.ok(!nav.includes("/student/map"));
    for (const h of ["/student/plans", "/student/tests", "/student/reports", "/student/curriculum"]) assert.ok(nav.includes(h), h);
    // no student without MAP scores breaks the dashboard
    assert.deepEqual(mapDashboardData(await myMap(repo, B)).subjects, []);
  });

  test("Curriculum Map of the grade and the reports hub", async () => {
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    const c = await studentCurriculum(repo, A);
    assert.equal(c.grade, 4);
    assert.ok(c.units.length > 0 && c.units.some((u) => u.sets.length > 0), "units → text sets / selections");
    const cats = reportCategories(a);
    assert.ok(cats.length >= 4);
    const hrefs = cats.flatMap((x) => x.links.map((l) => l.href));
    for (const h of ["/student/tests", "/student/map", "/student/insights", "/student/family", "/student/readrise"]) assert.ok(hrefs.includes(h), h);
    for (const x of cats) { assert.ok((UI_STRINGS as readonly string[]).includes(x.title), x.title); for (const l of x.links) { assert.ok((UI_STRINGS as readonly string[]).includes(l.label), l.label); assert.ok((UI_STRINGS as readonly string[]).includes(l.hint), l.hint); } }
  });

  test("the home page stays fast: a bounded number of database calls", async (t) => {
    const c = counting(repo);
    const h = await studentHome(c.repo, A, NOW);
    assert.ok(h.work.length >= 4);
    t.diagnostic(`student home: ${c.calls()} database calls`);
    assert.ok(c.calls() <= 40, `student home used ${c.calls()} database calls`);
  });

  test("no clutter: no question counts or 'adaptive'; never 'Lexile' for ReadRise", () => {
    const page = readFileSync(join(ROOT, "src/app/student/page.tsx"), "utf8");
    assert.doesNotMatch(page, /questionCount|questions`|\badaptive\b/i);
    assert.doesNotMatch(page, /Lexile/);
    assert.match(page, /ReadRise Level \(estimate\)/);
    assert.match(page, /tour="plans"/); assert.match(page, /tour="tests"/); assert.match(page, /data-tour="my-work"/);
  });
});
