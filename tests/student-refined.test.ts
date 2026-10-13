/**
 * Refined student pages (Grades 2–12, in-memory demo school; invented students only):
 *  - Home: one grid of main tiles, each page once (no Respond to Reading tile, no page repeated as a notice / link)
 *  - side menu: each page once, clean line icons; every student page uses the calm theme
 *  - Question of the Day: a compact strip, "Challenge question" — never a level word
 *  - Curriculum Map opens the student's own study plan directly (switcher, newest of the own grade, Review sections,
 *    "Literise · Study plan" header, Download PDF / Print)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { sendCurriculumPlan } from "../src/server/curriculum-map/curriculum-plan";
import { sendMapPlan } from "../src/server/curriculum-map/send-plan";
import { skillPlanForStudent, studentStudyPlans } from "../src/server/curriculum-map/plans";
import { STUDENT_HOME_TILES, withoutTilePages } from "../src/components/student/home-tiles-data";
import { navItemsFor } from "../src/components/nav-items";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && /[؀-ۿ]|^(MAP|ReadMaster|ReadRise|ReadMaster \/ ReadRise)$/.test(String(ar[x as keyof typeof ar] ?? ""));
const LEVEL_WORDS = /\b(Below|On|Above) Level\b|\bTier\b|LEVEL_LABEL|Hardest|level=\{/;

describe("student home: tiles, each page once", () => {
  test("the main tiles: My Work, MAP, Curriculum Map, Second Chance, ReadMaster / ReadRise, Fluency Coach, Writing, My Tests", () => {
    assert.deepEqual(STUDENT_HOME_TILES.map((x) => x.label), ["My Work", "MAP", "Curriculum Map", "Second Chance", "ReadMaster / ReadRise", "Fluency Coach", "Writing", "My Tests"]);
    assert.equal(new Set(STUDENT_HOME_TILES.map((x) => x.href)).size, STUDENT_HOME_TILES.length, "no tile twice");
    assert.ok(!STUDENT_HOME_TILES.some((x) => /respond/i.test(x.href + x.label)), "no Respond to Reading tile");
    for (const x of STUDENT_HOME_TILES) {
      assert.ok(existsSync(join(ROOT, `src/app${x.href}/page.tsx`)), `the tile opens a page: ${x.href}`);
      assert.ok(hasAr(x.label), `Arabic: ${x.label}`); assert.ok(hasAr(x.hint), `Arabic: ${x.hint}`);
    }
  });

  test("the home page: tiles once, no Respond to Reading tile, no tile page repeated as a link or notice", () => {
    const page = read("src/app/student/page.tsx");
    assert.match(page, /<HomeTiles /);
    assert.doesNotMatch(page, /Respond to Reading|Write about what you read/);
    for (const x of STUDENT_HOME_TILES) assert.ok(!page.includes(`href="${x.href}"`), `not repeated on Home: ${x.href}`);
    assert.doesNotMatch(page, /PageHero|playful|👋|☀️|🌟/, "calm: no cartoon hero, no emoji");
    assert.match(page, /withoutTilePages\(h\.notices\)/);
    const notices = [{ href: "/student/writing" }, { href: "/student/tests?tab=todo" }, { href: "/student/respond/G4.U1.TS1" }, { href: "/student/comments" }];
    assert.deepEqual(withoutTilePages(notices).map((n) => n.href), ["/student/respond/G4.U1.TS1", "/student/comments"]);
    // the reading hub has no Respond to Reading tile either (it opens from the study plan)
    assert.doesNotMatch(read("src/app/student/reading/page.tsx"), /\/student\/respond|Write about what you read/);
    assert.match(read("src/components/student/study-plan.tsx"), /href="\/student\/respond"/);
  });

  test("side menu: each page once, line icons; students always get the calm theme", () => {
    const items = navItemsFor("STUDENT", { rti: true, nafs: true });
    assert.equal(new Set(items.map((i) => i.href)).size, items.length);
    assert.equal(new Set(items.map((i) => i.label)).size, items.length);
    assert.ok(items.every((i) => i.line));
    assert.match(read("src/components/ui/side-nav.tsx"), /<LineIcon name=\{i\.line\}/);
    assert.match(read("src/components/app-shell.tsx"), /role === "STUDENT" \? "theme-calm"/);
  });
});

describe("Question of the Day: compact, no level words", () => {
  test("a strip that opens on demand; 'Challenge question' instead of a level", () => {
    const ui = read("src/components/student/qotd.tsx");
    const card = read("src/components/motivation/qotd-card.tsx");
    assert.doesNotMatch(ui, LEVEL_WORDS);
    assert.doesNotMatch(card, /level=/, "the level never reaches the browser");
    assert.match(ui, /t\("Challenge question"\)/);
    assert.match(ui, /aria-expanded=\{open\}/);
    assert.match(ui, /\{open && \(/, "the question shows only after a tap");
    assert.ok(hasAr("Challenge question"));
  });
});

describe("Curriculum Map → the student's own study plan", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let student: Actor; let classId = ""; let sid = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin] = await Promise.all(["demo.teacher.4a", "demo.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    const ids: string[] = [];
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 3; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `Refined ${lv} q ${i}`, level: 4, whyCorrect: "Because.", mapNodeCode: `G4.U1.TS1.ACS.${lv}`, options: [{ label: "A", text: `r${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `w${lv}${i}`, correct: false, rationale: "No." }] } as never));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const r = await teacherRoster(repo, teacher);
    classId = r[0].id; sid = r[0].students[0].id;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
  });

  test("only my plans; the newest of my own grade by default; a switcher when there are several", async () => {
    assert.deepEqual((await studentStudyPlans(repo, student)).plans, [], "nothing sent yet → the friendly empty page");
    const cur = await sendCurriculumPlan(repo, teacher, { classId }, new Date("2026-09-01T08:00:00Z"));
    const unit = await sendMapPlan(repo, teacher, { grade: 4, unitCode: "G4.U1", classId, studentIds: [sid] }, new Date("2026-09-20T08:00:00Z"));
    await repo.updateMany("SkillPlan", { id: cur.planId }, { createdAt: new Date("2026-09-01T08:00:00Z") });
    await repo.updateMany("SkillPlan", { id: unit.planId }, { createdAt: new Date("2026-09-20T08:00:00Z") });
    let mine = await studentStudyPlans(repo, student);
    assert.equal(mine.grade, 4);
    assert.deepEqual(mine.plans.map((p) => p.id), [unit.planId, cur.planId], "newest first");
    assert.equal(mine.defaultId, unit.planId, "the newest plan of my grade");
    // a plan of another grade is never the default while my grade has one
    await repo.updateMany("SkillPlan", { id: unit.planId }, { gradeLevel: 3 });
    mine = await studentStudyPlans(repo, student);
    assert.equal(mine.defaultId, cur.planId);
    // another class's student does not get these plans
    const other = (await repo.findMany("ClassMembership", { leftAt: null })).find((m) => String(m.classId) !== classId)!;
    const otherActor = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: other.studentId }))!.userId }))!);
    assert.ok(!(await studentStudyPlans(repo, otherActor)).plans.some((p) => p.id === cur.planId || p.id === unit.planId));
  });

  test("Review sections are in the plan — also in a plan sent before Review existed", async () => {
    const plan = (await repo.findMany("SkillPlan", { classId, kind: "CURRICULUM" }))[0];
    const rev = (await repo.findMany("SkillPlanItem", { planId: plan.id })).filter((i) => /\.REV$/.test(String(i.code)));
    assert.ok(rev.length > 0, "Review is a part of every selection");
    await repo.deleteMany("SkillPlanItem", { id: { in: rev.map((i) => i.id) } });   // an older plan without Review
    const v = await skillPlanForStudent(repo, student, String(plan.id));
    const reviews = v.places.filter((p) => p.label === "Review");
    assert.equal(reviews.length, rev.length, "every Review section is back in the plan");
    const first = v.places.filter((p) => p.unit === reviews[0].unit && p.set === reviews[0].set);
    assert.equal(first[first.length - 1].label, "Review", "Review is the last section of its selection");
    const again = await skillPlanForStudent(repo, student, String(plan.id));
    assert.equal(again.places.length, v.places.length, "added once");
  });

  test("the Curriculum Map route lands on the plan: Literise · Study plan, Download PDF / Print, no old cards", () => {
    const page = read("src/app/student/curriculum/page.tsx");
    assert.match(page, /studentStudyPlans\(repo, actor\)/);
    assert.match(page, /<StudyPlan /);
    assert.doesNotMatch(page, /<StudentCurriculum |Sent to you|studentCurriculumLessons|redirect\(/);
    const sheet = read("src/components/student/study-plan.tsx");
    assert.match(sheet, /<span dir="ltr">Literise<\/span> · \{t\("Study plan"\)\}/);
    assert.doesNotMatch(sheet, /Al-Anjal English/);
    assert.match(sheet, /<PrintButton label="Download PDF \/ Print" \/>/);
    assert.match(sheet, /data-testid="plan-switcher"/);
    assert.match(sheet, /print:hidden/);
    assert.match(read("src/app/student/plans/[planId]/page.tsx"), /<StudyPlan /);
    for (const x of ["Study plan", "Download PDF / Print", "Your plans", "No study plan yet", "Tap any part to practise it. Each part finishes when you get {n} correct answers."]) assert.ok(hasAr(x), x);
  });

  test("page files export only Next.js page fields", () => {
    for (const f of ["src/app/student/page.tsx", "src/app/student/curriculum/page.tsx", "src/app/student/plans/[planId]/page.tsx", "src/app/student/reading/page.tsx"]) {
      const exports = [...read(f).matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class)?\s*(\w+)?/gm)].map((m) => m[0]);
      for (const e of exports) assert.match(e, /^export (default|const (metadata|dynamic|revalidate)\b)/, `${f}: ${e}`);
    }
  });
});
