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
import { navItemsFor, navSections as sections, searchablePagesFor, MORE, MORE_GROUPS } from "../src/components/nav-items";
import { ADMIN_GROUPS, ADMIN_TOOLS } from "../src/components/admin-tools";
import { matchesStudent, normalizeName } from "../src/components/teacher/name-match";
import { REPORTS, REPORT_CATEGORIES, openReportUrl, reportUrls, scopesOf } from "../src/components/teacher/report-catalog";
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
  // r68 (owner): ⭐ My Skills right after My Work
  // r87 (owner, Oct 2026): nothing is menu-only-by-search any more — every page that used to live only in OFF_MENU /
  // adminOffMenu (findable by name, never an icon) is now ALSO a real icon, folded under the same "More" group each
  // role already had (side-nav.tsx FOLDED_BY_DEFAULT). The short top list itself is unchanged.
  test("student: Home, My Work, My Skills, My Plans (owner r82), My Tests, MAP, ReadMaster / ReadRise, Learn, My Words, Fluency (owner's spec) + NAFS only for Grade 6, then every other student page under More, line icons, no repeats", () => {
    const top = (items: ReturnType<typeof navItemsFor>) => items.filter((i) => !i.group).map((i) => i.label);
    assert.deepEqual(top(navItemsFor("STUDENT", { rti: true, nafs: true })), ["Home", "My Work", "My Skills", "My Plans", "My Tests", "MAP", "ReadMaster / ReadRise", "Learn", "My Words", "Fluency", "NAFS"], "the NAFS icon: students in a Grade 6 class");
    const items = navItemsFor("STUDENT", { rti: true, nafs: false });
    assert.deepEqual(top(items), ["Home", "My Work", "My Skills", "My Plans", "My Tests", "MAP", "ReadMaster / ReadRise", "Learn", "My Words", "Fluency"]);
    assert.ok(items.every((i) => i.line), "every student entry has a clean line icon");
    assert.equal(new Set(items.map((i) => i.href)).size, items.length, "no page twice in the menu");
    assert.equal(new Set(items.map((i) => i.label)).size, items.length, "no label twice in the menu");
    // the rest (r87/r88): every page that used to only be findable by name is now a real icon, under one of three
    // themed "More · …" sub-sections (Reading / My Achievements / Other Tools)
    assert.deepEqual([...new Set(items.filter((i) => i.group).map((i) => i.group))], [MORE_GROUPS.studentReading, MORE_GROUPS.studentAchievements, MORE_GROUPS.otherTools]);
    const moreHrefs = new Set(items.filter((i) => i.group).map((i) => i.href));
    for (const h of ["/student/readmaster", "/student/readrise", "/student/curriculum", "/student/second-chance", "/student/certificates", "/student/badges", "/student/reports", "/play", "/guide"]) assert.ok(moreHrefs.has(h), `now a More icon: ${h}`);
  });

  test("student: no RTI-worded entry anywhere (support work is ordinary work in My Work)", () => {
    // word-boundary regex: a plain substring test would also flag "My Certificates" ("...ceRTIficates...")
    for (const f of [{}, { rti: true }, { nafs: true }, { rti: true, nafs: true }]) assert.ok(!navItemsFor("STUDENT", f).some((i) => /\b(rti|tier|support)\b/i.test(`${i.href} ${i.label}`)));
    const pages = searchablePagesFor("STUDENT");
    assert.ok(!pages.some((p) => p.href === "/student/rti"));
    for (const h of ["/student/readmaster", "/student/readrise", "/student/fluency-coach", "/student/curriculum", "/student/certificates", "/student/badges", "/student/reports", "/play"]) assert.ok(pages.some((p) => p.href === h), `still found (now as a menu icon too): ${h}`);
  });

  test("teacher (Update 15): one place per area — Students & Classes, Curriculum Map, Plans, Assigned (owner r67), Assessments, Writing, Grammar, Reading, Learn, MAP, Reports; the rest (r87: every teacher page, nothing search-only) folded under More", () => {
    const items = navItemsFor("TEACHER");
    // 🔁 Review (the teacher's own Review of a text set, src/server/curriculum-map/review-control.ts) added to the
    // short menu, after Curriculum Map.
    assert.deepEqual(items.filter((i) => !i.group).map((i) => i.label), ["Home", "Students & Classes", "Curriculum Map", "Review", "Plans", "Assigned", "Assessments", "Writing", "Grammar", "Reading", "Learn", "MAP", "Reports", "School Reports"]);
    // r88: the rest is under one of 5 themed "More · …" sub-sections, plus the pre-existing plain "More" (My Week etc.)
    assert.deepEqual([...new Set(items.filter((i) => i.group).map((i) => i.group))], [MORE, MORE_GROUPS.teacherSupport, MORE_GROUPS.teacherReading, MORE_GROUPS.teacherDiagnostics, MORE_GROUPS.otherTools, MORE_GROUPS.teacherMap]);
    assert.ok(items.every((i) => i.line), "every teacher entry has a line icon");
    // admin-only tools stay admin-only even under More
    const hrefs = new Set(items.map((i) => i.href));
    for (const h of ["/teacher/tiers", "/teacher/data-meeting"]) assert.ok(!hrefs.has(h), `admin-only, not in the teacher menu: ${h}`);
    // r87: these used to be findable only by name — now real More icons too
    for (const h of ["/teacher/plans/support", "/teacher/rti-plan", "/teacher/map-rit", "/teacher/progress", "/teacher/levels", "/teacher/knowledge-graph"]) assert.ok(hrefs.has(h), `now a More icon: ${h}`);
    const pages = searchablePagesFor("TEACHER");
    for (const h of ["/teacher/plans/support", "/teacher/assessments", "/teacher/games", "/teacher/week", "/teacher/messages", "/teacher/map-rit"]) assert.ok(pages.some((p) => p.href === h), `still found by name: ${h}`);
  });

  // Bug report: the 🔤 Grammar icon was missing from the teacher's menu — it was only in OFF_MENU (found by
  // name, never shown as an icon), so a real teacher could never find it to assign Grammar, and in turn no
  // student ever saw a "Grammar" group in My Skills (nothing had ever been assigned). Fixed by giving Grammar
  // its own visible entry in TEACHER_MENU, same as it already has in the admin menu.
  test("teacher: Grammar (🔤 /admin/grammar) is a visible icon, not just findable by name — for a real school with an active Grades 4-6 curriculum and no special flags", () => {
    for (const opts of [{}, { rti: false, nafs: false }]) {
      const items = navItemsFor("TEACHER", opts);
      const grammar = items.find((i) => i.label === "Grammar");
      assert.ok(grammar, "Grammar is a visible teacher menu icon");
      assert.equal(grammar!.href, "/admin/grammar");
      assert.equal(grammar!.icon, "🔤");
      assert.ok(!grammar!.group, "Grammar is not folded under More");
    }
  });

  // Students never get their own Grammar icon: a grammar skill is an ordinary Skill, and shows up in the
  // "Grammar" strand of My Skills (my-skills.ts STRAND_LABEL.GRAMMAR) once the teacher assigns it — which the
  // fix above makes possible in practice.
  test("student: no separate Grammar nav icon (grammar skills surface inside My Skills instead)", () => {
    const items = navItemsFor("STUDENT", { rti: false, nafs: false });
    assert.ok(!items.some((i) => i.label === "Grammar"));
    assert.ok(items.some((i) => i.label === "My Skills" && i.href === "/student/skills"), "where a student's assigned Grammar skills appear");
  });

  test("admin: five top sections (School, Content, Assessments & Programs, Reports, Settings), ≤ 6 working tools each, then r87's More (every other admin tool, now a real icon, not just findable by name)", () => {
    assert.deepEqual(ADMIN_GROUPS.map((g) => g.title), ["School", "Content", "Assessments & Programs", "Reports", "Settings"]);
    const items = navItemsFor("SCHOOL_ADMIN");
    // r88: then one themed "More · <section>" per top section, same 5 names, each its own folded sub-section
    assert.deepEqual([...new Set(items.map((i) => i.group).filter(Boolean))], [...ADMIN_GROUPS.map((g) => g.title), ...ADMIN_GROUPS.map((g) => `More · ${g.title}`)], "the five sections, then five More · sub-sections");
    const at = (g: string) => items.filter((i) => i.group === g).map((i) => i.href);
    for (const g of ADMIN_GROUPS) assert.ok(at(g.title).length <= 6, `${g.title}: ${at(g.title).length}`);
    for (const h of ["/admin/school", "/admin/users", "/teacher/students"]) assert.ok(at("School").includes(h), h);
    for (const h of ["/admin/questions", "/admin/skill-links", "/admin/readrise", "/student/readmaster", "/admin/curriculum-map", "/admin/grammar"]) assert.ok(at("Content").includes(h), h);
    for (const h of ["/admin/tests", "/admin/diagnostic", "/teacher/map-center", "/admin/nafs-links", "/admin/levels", "/teacher/rti-plan"]) assert.ok(at("Assessments & Programs").includes(h), h);
    for (const h of ["/admin/analytics", "/admin/term-report", "/admin/report-approvals", "/teacher/reports"]) assert.ok(at("Reports").includes(h), h);
    for (const h of ["/admin/settings", "/admin/ai-tools", "/admin/backup", "/admin/data-health", "/admin/data-cleanup", "/admin/feedback"]) assert.ok(at("Settings").includes(h), h);
    assert.equal(ADMIN_TOOLS.find((x) => x.href === "/admin/skill-links")?.label, "Sort Questions");
    // r87/r88: every ADMIN_TOOLS entry that isn't in the top five sections is now a real More · … icon, not just a search hit
    const moreHrefs = new Set(items.filter((i) => typeof i.group === "string" && i.group.startsWith("More ·")).map((i) => i.href));
    for (const x of ADMIN_TOOLS.filter((x) => !x.menu)) assert.ok(moreHrefs.has(x.href), `now a More · … icon: ${x.href}`);
    // still found by name too (top bar "Find a page")
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
    // 🐛 fix (audit finding, Oct 2026): "Progress Report" now points straight at /student/reports?view=progress
    // instead of the old /student/insights redirect shim (see nav-items.ts's own comment on the change — it fixed a
    // side-menu highlight bug); /student/insights itself still works for an old bookmark, but is no longer a
    // distinct, separately-findable entry, so this checks the new canonical href instead.
    for (const [role, h] of [["TEACHER", "/teacher/alerts"], ["TEACHER", "/teacher/map-rit"], ["STUDENT", "/student/reports?view=progress"], ["STUDENT", "/play"]] as const) {
      const pages = searchablePagesFor(role);
      assert.ok(pages.some((p) => p.href === h), `${role} finds ${h}`);
      assert.equal(new Set(pages.map((p) => p.href)).size, pages.length);
      for (const p of pages) assert.ok(hasAr(p.label), p.label);
    }
    const nav = read("src/components/ui/side-nav.tsx");
    assert.match(nav, /isMoreGroup = \(name: string\) => name === "More" \|\| name\.startsWith\("More ·"\)/);
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
    // r67: the ONE student file is /teacher/students/[id] (the older /admin/student-file/[id] redirects there)
    assert.match(read("src/app/admin/student-file/page.tsx"), /redirect\(`\/teacher\/students\/\$\{id\}`\)/);
    assert.match(read("src/app/teacher/classes/page.tsx"), /redirect\("\/teacher\/students"\)/);
    assert.match(read("src/components/teacher/student-list.tsx"), /href=\{`\/teacher\/students\/\$\{x\.id\}`\}/, "a name opens the file");
  });

  test("reports (no wizard): four groups (r67), every report has a page, strings translated; old pages kept", () => {
    assert.deepEqual(REPORT_CATEGORIES.map((c) => c.key), ["My class", "Students", "Programs", "Follow-up"]);
    for (const c of REPORT_CATEGORIES) { assert.ok(REPORTS.some((r) => r.category === c.key), c.key); assert.ok(hasAr(c.key) && hasAr(c.hint), c.key); }
    for (const r of REPORTS) {
      assert.ok(hasAr(r.title) && hasAr(r.hint), r.key);
      assert.ok(scopesOf(r).length > 0, r.key);
      for (const p of [...reportUrls(r, "class", { classId: "c1", period: "week" }, ["s1", "s2"]), ...reportUrls(r, "student", { classId: "c1", studentId: "s1", period: "term" })]) assert.ok(routeExists(p.url), `${r.key}: ${p.url}`);
      assert.ok(routeExists(openReportUrl(r, { classId: "c1", firstStudent: "s1" })!), r.key);
    }
    const fam = REPORTS.find((r) => r.key === "family-reports")!;
    assert.ok(fam.send, "family reports can be sent");
    assert.match(reportUrls(REPORTS.find((r) => r.key === "practice")!, "class", { classId: "c1", period: "week" })[0].url, /range=LAST_7_DAYS/);
    const page = read("src/app/teacher/reports/page.tsx");
    assert.doesNotMatch(page, /Pick a report|Who and when|STEPS/, "no wizard");
    for (const f of ["games/page.tsx", "games-usage/page.tsx", "grammar/page.tsx", "readmaster/page.tsx", "needs-help/page.tsx"]) assert.ok(existsSync(join(ROOT, "src/app/teacher/reports", f)), f);
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

  test("role guides: English by default with an Arabic toggle (?lang=ar); the moved-where table lists every role", () => {
    // 🐛 fix (audit finding, Oct 2026): /guide used to be Arabic-only no matter the site's language toggle — it now
    // defaults to English (guides-en.ts) like the rest of the interface, with an explicit "?lang=ar" switch for
    // Arabic (guides-ar.ts, content unchanged). See guide/page.tsx's own doc comment on the change.
    const page = read("src/app/guide/page.tsx");
    assert.match(page, /dir=\{ar \? "rtl" : "ltr"\}/);
    assert.match(page, /GUIDES_EN, GUIDE_UI_EN, ROLE_LABEL_EN/, "English guide set is imported");
    for (const k of ["STUDENT", "TEACHER", "SCHOOL_ADMIN"] as const) {
      assert.match(GUIDES[k].title, /^[\u0600-\u06FF ]+$/, `${k}: Arabic title`);
      assert.ok(GUIDES[k].steps.length >= 5 && GUIDES[k].steps.every((s) => s.href.startsWith("/")), `${k}: numbered steps with links`);
    }
    const doc = read("docs/WHAT-MOVED-WHERE.md");
    for (const h of ["/student/plans", "/teacher/map-rit", "/admin/student-file", "/teacher/classes", "/admin/skill-links"]) assert.ok(doc.includes(h), h);
  });
});
