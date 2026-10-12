/**
 * Short, tidy menus for every role (b1-nav) + My Students (search and access) + the Reports wizard catalogue +
 * My Week / class today. Pure checks first, then the Test School (in-memory SQLite) for search and access.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { accessibleClasses } from "../src/server/teacher/assign";
import { navItemsFor, navSections as sections, searchablePagesFor, MORE } from "../src/components/nav-items";
import { ADMIN_GROUPS, ADMIN_TOOLS } from "../src/components/admin-tools";
import { matchesStudent, normalizeName } from "../src/components/teacher/name-match";
import { REPORTS, REPORT_CATEGORIES, reportUrls, scopesOf } from "../src/components/teacher/report-catalog";
import { myStudentsList, searchStudents } from "../src/server/insights/student-file";
import { classToday, myWeek, schoolWeekStart } from "../src/server/teacher/my-week";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { GUIDES } from "../src/i18n/guides-ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const isUi = (s: string) => (UI_STRINGS as readonly string[]).includes(s);
const hasAr = (s: string) => isUi(s) && Boolean(ar[s as keyof typeof ar]);
/** Is there an app page for this address (a dynamic folder matches any segment)? */
function routeExists(url: string): boolean {
  let dir = join(ROOT, "src/app");
  for (const seg of url.split("?")[0].split("/").filter(Boolean)) {
    if (existsSync(join(dir, seg))) { dir = join(dir, seg); continue; }
    const dyn = readdirSync(dir).find((x) => x.startsWith("["));
    if (!dyn) return false;
    dir = join(dir, dyn);
  }
  return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"));
}

describe("menus: short and tidy", () => {
  test("student: My Work first; no My Plans / Progress Report / My Skills / Family Report; Join Live only on the home page", () => {
    const items = navItemsFor("STUDENT");
    assert.equal(items[0].label, "My Work");
    assert.equal(items[0].href, "/student");
    const hrefs = items.map((i) => i.href), labels = items.map((i) => i.label);
    for (const gone of ["My Plans", "Progress Report", "My Skills", "Family Report", "Join Live"]) assert.ok(!labels.includes(gone), gone);
    for (const h of ["/student/plans", "/student/insights", "/student/skills", "/student/family", "/play"]) assert.ok(!hrefs.includes(h), h);
    const groups = [...new Set(items.map((i) => i.group).filter(Boolean))];
    assert.deepEqual(groups, ["Programs", "Reading", "Achievements", MORE]);
    for (const h of ["/student/map", "/student/curriculum", "/student/readmaster", "/student/readrise", "/student/fluency-coach", "/student/tests", "/student/certificates", "/student/badges", "/student/reports"]) assert.ok(hrefs.includes(h), h);
    assert.ok(items.filter((i) => i.group === MORE).every((i) => ["/student/lesson", "/student/review", "/student/words", "/student/respond", "/student/writing", "/student/decoding", "/student/strategy-survey", "/guide"].includes(i.href)));
  });

  test("student: RTI only with the RTI flag, NAFS only with the NAFS flag (both under Programs)", () => {
    assert.ok(!navItemsFor("STUDENT").some((i) => i.href === "/student/nafs" || i.href === "/student/rti"));
    assert.ok(navItemsFor("STUDENT", { nafs: true }).some((i) => i.href === "/student/nafs" && i.group === "Programs"));
    assert.ok(!navItemsFor("STUDENT", { nafs: true }).some((i) => i.href === "/student/rti"));
    assert.ok(navItemsFor("STUDENT", { rti: true }).some((i) => i.href === "/student/rti" && i.group === "Programs"));
    assert.ok(!navItemsFor("STUDENT", { rti: true }).some((i) => i.href === "/student/nafs"));
    assert.match(read("src/components/app-shell.tsx"), /nafs: "\/student\/nafs" in counts/, "the shell passes the NAFS flag like the RTI one");
  });

  test("teacher: at most 8 top-level entries besides Home; duplicates removed; rare pages under More", () => {
    const items = navItemsFor("TEACHER");
    const top = sections(items).flatMap((s) => (s.name ? [s.name] : s.items.map((i) => i.label))).filter((x) => x !== "Home");
    assert.ok(top.length <= 8, `top level: ${top.join(", ")}`);
    const hrefs = new Set(items.map((i) => i.href));
    for (const h of ["/teacher/students", "/teacher/map-center", "/admin/curriculum-map", "/teacher/rti-plan", "/teacher/plans", "/teacher/assessments", "/teacher/games", "/teacher/reports", "/teacher/week", "/teacher/messages"]) assert.ok(hrefs.has(h), h);
    for (const h of ["/teacher/map-rit", "/teacher/map-plans", "/admin/student-file", "/teacher/progress", "/teacher/intervention", "/teacher/alerts", "/teacher/ai", "/teacher/family-reports", "/teacher/assignments", "/teacher/classes"]) assert.ok(!hrefs.has(h), `removed: ${h}`);
    assert.deepEqual(items.filter((i) => i.group === "Programs").map((i) => i.href), ["/teacher/map-center", "/admin/curriculum-map", "/teacher/rti-plan", "/teacher/plans"]);
    assert.ok(items.filter((i) => i.group === MORE).length >= 10);
  });

  test("admin: five sections (School, Content, Assessments & Programs, Reports, Settings), ≤ 6 working tools each, no More", () => {
    assert.deepEqual(ADMIN_GROUPS.map((g) => g.title), ["School", "Content", "Assessments & Programs", "Reports", "Settings"]);
    const items = navItemsFor("SCHOOL_ADMIN");
    assert.deepEqual([...new Set(items.map((i) => i.group).filter(Boolean))], ADMIN_GROUPS.map((g) => g.title));
    assert.ok(!items.some((i) => i.group === MORE), "the admin menu has no More group (All Admin Tools has the rest)");
    const at = (g: string) => items.filter((i) => i.group === g).map((i) => i.href);
    for (const g of ADMIN_GROUPS) assert.ok(at(g.title).length <= 6, `${g.title}: ${at(g.title).length}`);
    for (const h of ["/admin/school", "/admin/users", "/teacher/students"]) assert.ok(at("School").includes(h), h);
    for (const h of ["/admin/questions", "/admin/skill-links", "/admin/readrise", "/student/readmaster", "/admin/curriculum-map", "/admin/grammar"]) assert.ok(at("Content").includes(h), h);
    for (const h of ["/admin/tests", "/admin/diagnostic", "/teacher/map-center", "/admin/nafs-links", "/admin/levels", "/teacher/rti-plan"]) assert.ok(at("Assessments & Programs").includes(h), h);
    for (const h of ["/admin/analytics", "/admin/term-report", "/admin/report-approvals", "/teacher/reports"]) assert.ok(at("Reports").includes(h), h);
    for (const h of ["/admin/settings", "/admin/ai-tools", "/admin/backup", "/admin/data-health", "/admin/data-cleanup", "/admin/feedback"]) assert.ok(at("Settings").includes(h), h);
    assert.equal(ADMIN_TOOLS.find((x) => x.href === "/admin/skill-links")?.label, "Sort Questions");
    // the rest is found by name in the top bar
    const found = new Set(searchablePagesFor("SCHOOL_ADMIN").map((i) => i.href));
    for (const x of ADMIN_TOOLS) assert.ok(found.has(x.href), `findable: ${x.href}`);
  });

  test("every role: one name and one icon per entry; labels and groups translated; More folds", () => {
    for (const role of ["TEACHER", "SCHOOL_ADMIN", "STUDENT"]) {
      const items = navItemsFor(role, { rti: true, nafs: true });
      assert.equal(new Set(items.map((i) => i.href)).size, items.length, `${role}: no page twice`);
      assert.equal(new Set(items.map((i) => i.label)).size, items.length, `${role}: no name twice`);
      assert.equal(new Set(items.map((i) => i.icon)).size, items.length, `${role}: one icon each`);
      for (const i of items) { assert.ok(hasAr(i.label), `${role}: “${i.label}”`); if (i.group) assert.ok(hasAr(i.group), `${role}: group “${i.group}”`); }
    }
    // pages that left a menu are still found by name (top bar "Find a page" and the search)
    for (const [role, h] of [["TEACHER", "/teacher/alerts"], ["TEACHER", "/teacher/map-rit"], ["STUDENT", "/student/plans"], ["STUDENT", "/play"]] as const) {
      const pages = searchablePagesFor(role);
      assert.ok(pages.some((p) => p.href === h), `${role} finds ${h}`);
      assert.equal(new Set(pages.map((p) => p.href)).size, pages.length);
      for (const p of pages) assert.ok(hasAr(p.label), p.label);
    }
    const nav = read("src/components/ui/side-nav.tsx");
    assert.match(nav, /FOLDED_BY_DEFAULT = new Set\(\["More"\]\)/);
    assert.match(nav, /GROUP_TONE/, "soft coloured group headings");
    assert.match(read("src/components/app-shell.tsx"), /<FeedbackButton \/>/);
    assert.ok(existsSync(join(ROOT, "src/components/feedback/feedback-button.tsx")));
  });
});

describe("My Students search: Arabic normalisation", () => {
  test("diacritics, hamza forms, taa marbuta and alif maqsura; English any case; one letter is enough", () => {
    assert.equal(normalizeName("أَحْمَد"), "احمد");
    assert.equal(normalizeName("إيمان"), "ايمان");
    assert.equal(normalizeName("آمنة"), "امنه");
    assert.equal(normalizeName("مُصْطَفَى"), "مصطفي");
    assert.equal(normalizeName("عـــلي"), "علي", "tatweel removed");
    assert.equal(normalizeName("  Ahmed   KHALID "), "ahmed khalid");
    const st = { name: "فاطمة الزهراء أحمد", number: "20231045", username: "fatima.a" };
    for (const q of ["فاطمه", "فاطِمة", "احمد", "الزهراء احمد", "2023", "FATIMA", "f", "ف"]) assert.ok(matchesStudent(st, q), q);
    assert.ok(!matchesStudent(st, "خالد"));
    assert.ok(matchesStudent({ name: "Omar Ali", number: "1", username: "omar" }, "ALI om"), "every word, any order, any case");
  });
});

describe("My Students, Reports and My Week on the Test School", () => {
  let repo: SqliteRepo, admin: Actor, t1: Actor, t2: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); t1 = await as("test.teacher.1"); t2 = await as("test.teacher.2");
  });

  test("a teacher lists only the students of their own classes; the admin lists the school", async () => {
    const own = new Set((await accessibleClasses(repo, t1)).map((c) => String(c.id)));
    const other = new Set((await accessibleClasses(repo, t2)).map((c) => String(c.id)));
    const mine = await myStudentsList(repo, t1);
    assert.ok(mine.length > 0 && mine.every((c) => own.has(c.classId)), "only own classes");
    const ids = new Set(mine.flatMap((c) => c.students.map((x) => x.id)));
    const theirs = (await myStudentsList(repo, t2)).filter((c) => !own.has(c.classId)).flatMap((c) => c.students.map((x) => x.id));
    assert.ok(theirs.length > 0 && theirs.every((id) => !ids.has(id)), "teacher 1 never sees teacher 2's students");
    assert.ok([...other].some((c) => !own.has(c)));
    const all = await myStudentsList(repo, admin);
    assert.ok(all.reduce((n, c) => n + c.students.length, 0) > mine.reduce((n, c) => n + c.students.length, 0));
    // the search: one letter works, scoped the same way
    const one = await searchStudents(repo, t1, "T");
    assert.ok(one.length > 0 && one.every((x) => ids.has(x.id)), "1 character, own students only");
    const outsider = theirs[0];
    const num = String((await repo.findUnique("Student", { id: outsider }))!.studentNumber);
    assert.equal((await searchStudents(repo, t1, num)).length, 0, "another teacher's student is not found by number");
    assert.equal((await searchStudents(repo, admin, num)).length, 1);
    const st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: outsider }))!.userId }))!);
    await assert.rejects(myStudentsList(repo, st), ForbiddenError);
  });

  test("redirects: Find a Student and My Classes go to My Students", () => {
    assert.match(read("src/app/admin/student-file/page.tsx"), /redirect\(q \? `\/teacher\/students\?/);
    assert.match(read("src/app/admin/student-file/page.tsx"), /redirect\(`\/admin\/student-file\/\$\{id\}`\)/);
    assert.match(read("src/app/teacher/classes/page.tsx"), /redirect\("\/teacher\/students"\)/);
    assert.match(read("src/components/teacher/student-list.tsx"), /href=\{`\/admin\/student-file\/\$\{x\.id\}`\}/, "a name opens the file");
  });

  test("reports wizard: seven categories, every report has a page, strings translated; old pages kept", () => {
    assert.deepEqual(REPORT_CATEGORIES.map((c) => c.key), ["Class", "Student", "Skills", "Tests", "MAP", "Reading", "Games"]);
    for (const c of REPORT_CATEGORIES) assert.ok(REPORTS.some((r) => r.category === c.key), c.key);
    for (const r of REPORTS) {
      assert.ok(hasAr(r.title) && hasAr(r.hint), r.key);
      assert.ok(scopesOf(r).length > 0, r.key);
      for (const p of [...reportUrls(r, "class", { classId: "c1", period: "week" }, ["s1", "s2"]), ...reportUrls(r, "student", { classId: "c1", studentId: "s1", period: "term" })]) assert.ok(routeExists(p.url), `${r.key}: ${p.url}`);
    }
    const fam = REPORTS.find((r) => r.key === "family-progress")!;
    assert.ok(fam.send, "family reports can be sent after the preview");
    assert.deepEqual(reportUrls(fam, "group", { classId: "c1", period: "month" }, ["a", "b"]).map((x) => x.studentId), ["a", "b"]);
    assert.match(reportUrls(REPORTS.find((r) => r.key === "practice")!, "class", { classId: "c1", period: "week" })[0].url, /range=LAST_7_DAYS/);
    const page = read("src/app/teacher/reports/page.tsx");
    assert.match(page, /preview/); assert.match(page, /Send to parents/); assert.match(page, /PrintReportButton/);
    for (const f of ["games/page.tsx", "games-usage/page.tsx", "grammar/page.tsx", "readmaster/page.tsx"]) assert.ok(existsSync(join(ROOT, "src/app/teacher/reports", f)), f);
  });

  test("My Week and the class today: own class only; days Sunday → Thursday", async () => {
    const cid = String((await accessibleClasses(repo, t1))[0].id);
    const other = (await accessibleClasses(repo, t2)).map((c) => String(c.id)).find((c) => c !== cid)!;
    const w = await myWeek(repo, t1, cid, new Date("2026-10-13T08:00:00Z"));
    assert.equal(w.days.length, 5);
    assert.equal(w.start, "2026-10-11", "the week starts on Sunday");
    assert.equal(schoolWeekStart(new Date("2026-10-17T10:00:00Z")).toISOString(), "2026-10-10T21:00:00.000Z", "Saturday belongs to the week that started Sunday");
    const d = await classToday(repo, t1, cid);
    assert.ok(d.students > 0 && d.doneToday >= 0 && d.needHelp >= 0 && d.notStarted >= 0);
    await assert.rejects(myWeek(repo, t1, other), ForbiddenError);
    await assert.rejects(classToday(repo, t1, other), ForbiddenError);
  });

  test("role guides are Arabic; the moved-where table lists every role", () => {
    assert.match(read("src/app/guide/page.tsx"), /dir="rtl" lang="ar"/);
    for (const k of ["STUDENT", "TEACHER", "SCHOOL_ADMIN"] as const) {
      assert.match(GUIDES[k].title, /^[\u0600-\u06FF ]+$/, `${k}: Arabic title`);
      assert.ok(GUIDES[k].steps.length >= 5 && GUIDES[k].steps.every((s) => s.href.startsWith("/")), `${k}: numbered steps with links`);
    }
    const doc = read("docs/WHAT-MOVED-WHERE.md");
    for (const h of ["/student/plans", "/teacher/map-rit", "/admin/student-file", "/teacher/classes", "/admin/skill-links"]) assert.ok(doc.includes(h), h);
  });
});
