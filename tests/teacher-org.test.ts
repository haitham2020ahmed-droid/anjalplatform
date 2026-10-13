/**
 * Update 15 — the teacher side, organised (fictional Test School only):
 *  - every teacher page lives in ONE place: the menu has no page twice, and Home, the Reading hub, the MAP page and
 *    the Reports grid do not repeat what the menu (or another area) already has;
 *  - NAFS only for teachers of a Grade 6 class and admins (menu search, Plans tab, curriculum view, the send action);
 *  - Reports: no wizard — a report opens at once; the report bar (class switcher, student, date range, Download, Send
 *    to family) is found from the address; old wizard addresses and old MAP routes still open the right page;
 *  - new interface words have Arabic; page files export only Next.js page fields.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { assertNafs, canSeeNafs, NAFS_REFUSED } from "../src/server/teacher/nafs-access";
import { MORE, NAFS_PAGE, navItemsFor, searchablePagesFor, TEACHER_MENU } from "../src/components/nav-items";
import { carryQuery, DEFAULT_PERIOD, matchReport, MOVED_REPORTS, openReportUrl, periodOf, REPORT_CATEGORIES, REPORTS, reportByKey } from "../src/components/teacher/report-catalog";
import { isLineIcon } from "../src/components/ui/line-icon";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (s: string) => (UI_STRINGS as readonly string[]).includes(s) && Boolean((ar as Record<string, string>)[s]);
const pathOf = (u: string) => u.split("?")[0];

describe("one place per page (menus, Home, hubs)", () => {
  test("every role's menu: no page twice, no name twice, one icon each; teacher entries carry clean line icons", () => {
    for (const role of ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN", "STUDENT"]) {
      for (const flags of [{}, { nafs: true }, { rti: true, nafs: true }]) {
        const items = navItemsFor(role, flags);
        assert.equal(new Set(items.map((i) => i.href)).size, items.length, `${role}: a page twice`);
        assert.equal(new Set(items.map((i) => i.label)).size, items.length, `${role}: a name twice`);
        const pages = searchablePagesFor(role, flags);
        assert.equal(new Set(pages.map((p) => p.href)).size, pages.length, `${role}: Find a page lists a page twice`);
      }
    }
    for (const i of TEACHER_MENU) { assert.ok(isLineIcon(i.line), `${i.href}: line icon`); assert.ok(hasAr(i.label), i.label); }
    assert.equal(new Set(TEACHER_MENU.map((i) => i.line)).size, TEACHER_MENU.length, "one line icon per entry");
    assert.deepEqual(TEACHER_MENU.filter((i) => !i.group).map((i) => i.href),
      ["/teacher", "/teacher/students", "/admin/curriculum-map", "/teacher/plans", "/teacher/assessments", "/teacher/writing", "/teacher/reading", "/teacher/map-center", "/teacher/reports"]);
    assert.ok(TEACHER_MENU.filter((i) => i.group).every((i) => i.group === MORE));
    // the calm side menu draws the line icons for teachers
    const nav = read("src/components/ui/side-nav.tsx");
    assert.match(nav, /<LineIcon name=\{i\.line\}/);
    assert.match(read("src/components/app-shell.tsx"), /variant=\{calm \? "calm" : "default"\}/);
  });

  test("Teacher Home repeats no menu page (numbers, Needs attention and Find a skill only)", () => {
    const home = read("src/app/teacher/page.tsx");
    // (a contextual action such as "Create Plan" for one stuck student, with the skills filled in, is not a page tile)
    for (const i of TEACHER_MENU.filter((x) => x.href !== "/teacher")) {
      assert.ok(!new RegExp(`href=\\{?["\`]${i.href.replace(/[/?]/g, "\\$&")}(["\`]|\\$\\{q\\})`).test(home), `Home links ${i.href}`);
    }
    for (const gone of ["Quick actions", "New Plan", "New Test", "Upload MAP Scores", "Download Accounts", "My Week"]) assert.ok(!home.includes(`"${gone}"`), gone);
  });

  test("hub pages do not repeat another area: Reading has no Writing tile; Students has no Reports link; MAP keeps only its results", () => {
    const reading = read("src/app/teacher/reading/page.tsx");
    assert.ok(!reading.includes('"/teacher/writing"'), "Writing has its own menu entry");
    for (const h of ["/student/readmaster", "/teacher/readrise", "/teacher/fluency"]) assert.ok(reading.includes(`"${h}"`), h);
    assert.ok(!read("src/app/teacher/students/page.tsx").includes("/teacher/reports"), "Needs help is a report (Reports → Skills)");
    const map = read("src/app/teacher/map-center/page.tsx");
    assert.match(map, /tab === "results" && \(/, "the MAP tabs row shows on Results only");
    assert.match(map, /\/teacher\/map-entry/); assert.match(map, /\/teacher\/map-test/);
    assert.match(map, /back: \{ href: "\/teacher\/reports", label: "Reports" \}/, "MAP reports go back to Reports");
    assert.match(map, /back: \{ href: "\/teacher\/plans", label: "Plans" \}/, "the MAP plan goes back to Plans");
    assert.ok(!read("src/app/teacher/map-center/reports-tab.tsx").includes("/map-report/class/${classId}/groups"), "the MAP report cards live in Reports → MAP");
    // the Reports grid never repeats another area's page
    const menu = new Set(TEACHER_MENU.map((i) => i.href));
    for (const r of REPORTS) {
      const u = openReportUrl(r, { classId: "c1", firstStudent: "s1" })!;
      assert.ok(!menu.has(pathOf(u)) || pathOf(u) === "/teacher/map-center", `${r.key} repeats a menu page`);
      for (const other of ["/teacher/assessments", "/teacher/readrise", "/teacher/fluency", "/teacher/diagnostic", "/teacher/students/"]) assert.ok(!u.startsWith(other), `${r.key}: ${other} lives elsewhere`);
    }
    assert.equal(new Set(REPORTS.map((r) => pathOf(openReportUrl(r, { classId: "c1", firstStudent: "s1" })!) + (r.key.startsWith("map-") ? r.key : ""))).size, REPORTS.length, "no two cards open the same page");
  });
});

describe("NAFS: Grade 6 teachers and admins only", () => {
  let repo: SqliteRepo;
  let g6: Actor, other: Actor, admin: Actor, student: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); student = await as("test.student.005");
    const teachers = await repo.findMany("User", { role: "TEACHER" });
    const actors = await Promise.all(teachers.map((u) => resolveActor(repo, u)));
    const grades = await Promise.all(actors.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
    other = actors[grades.findIndex((g) => g.length > 0 && !g.includes(6))];
    let i = grades.findIndex((g) => g.includes(6));
    if (i < 0) {
      // no Grade 6 teacher in the seed: give a second teacher a Grade 6 class
      i = actors.findIndex((a) => a !== other);
      const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
      const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
      await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: actors[i].userId }))!.id });
    }
    g6 = actors[i];
    assert.ok(other && g6 && other.userId !== g6.userId);
  });

  test("who sees NAFS: a teacher with a Grade 6 class and the admins; not other teachers, never students", async () => {
    assert.equal(await canSeeNafs(repo, g6), true);
    assert.equal(await canSeeNafs(repo, admin), true);
    assert.equal(await canSeeNafs(repo, other), false);
    assert.equal(await canSeeNafs(repo, student), false);
    await assert.rejects(assertNafs(repo, other), (e: unknown) => e instanceof ForbiddenError && e.message === NAFS_REFUSED);
    await assertNafs(repo, g6);
  });

  test("menus: NAFS is its own teacher menu entry only for Grade 6 teachers; Find a page lists it (and the NAFS plan) for them and admins", () => {
    // owner's latest instruction: NAFS is its OWN icon in the teacher menu (not inside Plans or Assessments)
    assert.ok(!navItemsFor("TEACHER", {}).some((i) => /nafs/i.test(i.href + i.label)), "other teachers: no NAFS entry");
    const g6 = navItemsFor("TEACHER", { nafs: true });
    assert.equal(g6.filter((i) => i.href === NAFS_PAGE.href).length, 1);
    assert.equal(g6[g6.findIndex((i) => i.href === "/teacher/assessments") + 1].href, "/teacher/nafs", "right after Assessments");
    assert.ok(!searchablePagesFor("TEACHER", { nafs: false }).some((p) => /nafs/i.test(p.href + p.label)), "other teachers: no NAFS");
    assert.ok(searchablePagesFor("TEACHER", { nafs: true }).some((p) => p.href === NAFS_PAGE.href), "Grade 6 teachers find it");
    assert.ok(searchablePagesFor("TEACHER", { nafs: true }).some((p) => p.href === "/teacher/plans?tab=nafs"), "and the NAFS plan");
    assert.ok(searchablePagesFor("SCHOOL_ADMIN").some((p) => p.href === NAFS_PAGE.href), "admins find it");
    assert.ok(hasAr(NAFS_PAGE.label) && hasAr(NAFS_REFUSED));
    // the frame passes the teacher's Grade 6 flag (one cached read per request)
    assert.match(read("src/components/app-shell.tsx"), /canSeeNafsCached\(repo, me\.actor\)/);
    assert.match(read("src/components/app-shell.tsx"), /searchablePagesFor\(role, flags\)/);
  });

  test("pages and actions refuse NAFS to others: Plans tab, the curriculum NAFS view, the send action", () => {
    const plans = read("src/app/teacher/plans/page.tsx");
    // the plan editor's page: NAFS is a program choice offered only for a Grade 6 class (the editor refuses it otherwise)
    assert.match(plans, /PROGRAM_CHOICES\.filter\(\(\[k\]\) => k !== "NAFS" \|\| klass\.grade === NAFS_GRADE\)/);
    assert.match(read("src/app/teacher/plans/actions.ts"), /await assertNafs\(repo, actor\)/);
    const cur = read("src/app/teacher/curriculum/page.tsx");
    assert.match(cur, /const nafs = sp\.area === "nafs" && nafsOk;/);
    assert.match(cur, /\{nafsOk && <Link href=\{href\(\{ area: "nafs" \}\)\}/);
  });
});

describe("Reports: open at once, the report bar, redirects", () => {
  test("five groups of cards; every report opens straight away on the current term (the Students dashboard on the class)", () => {
    assert.deepEqual(REPORT_CATEGORIES.map((c) => c.key), ["Class", "Student", "Skills", "MAP", "Family"]);
    assert.equal(DEFAULT_PERIOD, "term");
    assert.equal(openReportUrl(reportByKey("class-dashboard")!, { classId: "c1" }), "/teacher/progress?classId=c1");
    assert.match(openReportUrl(reportByKey("practice")!, { classId: "c1" })!, /range=TERM/);
    assert.match(openReportUrl(reportByKey("grammar")!, { classId: "c1" })!, /days=90/);
    assert.equal(openReportUrl(reportByKey("student-file")!, { classId: "c1", firstStudent: "s9" }), "/admin/student-file/s9", "a student report opens on the class's first student");
    assert.equal(openReportUrl(reportByKey("student-file")!, { classId: "c1" }), null);
    for (const r of REPORTS) assert.ok(isLineIcon(r.line), r.key);
    const page = read("src/app/teacher/reports/page.tsx");
    assert.doesNotMatch(page, /Pick a report|Who and when|"Preview"|STEPS/, "no wizard");
    assert.match(page, /redirect\(url\)/, "?report=… opens the report");
    assert.match(page, /MOVED_REPORTS\[sp\.report\]/, "old wizard keys go to the page that has them now");
    for (const [k, to] of Object.entries(MOVED_REPORTS)) { assert.ok(!reportByKey(k), k); assert.ok(existsSync(join(ROOT, "src/app", to, "page.tsx")), to); }
  });

  test("the bar finds the report from the address: class and student pages, the date range, MAP views", () => {
    for (const r of REPORTS) {
      if (r.classUrl) {
        const u = r.classUrl({ classId: "c1", period: "week" });
        const m = matchReport(pathOf(u), u.includes("?") ? `?${u.split("?")[1]}&_rsc=abc` : "");
        assert.equal(m?.report.key, r.key, `class page of ${r.key}: ${u}`);
        assert.equal(m!.at.scope, "class");
        assert.equal(m!.at.classId, "c1", `${r.key}: the class (from the path or the query)`);
        if (r.period) assert.equal(m!.at.period, "week", `${r.key} carries the range`);
      }
      if (r.studentUrl) {
        const u = r.studentUrl({ classId: "c1", studentId: "s1", period: "month" });
        const m = matchReport(pathOf(u), u.includes("?") ? u.slice(u.indexOf("?")) : "");
        assert.equal(m?.report.key, r.key, `student page of ${r.key}: ${u}`);
        assert.equal(m!.at.scope, "student"); assert.equal(m!.at.studentId, "s1");
      }
    }
    assert.equal(matchReport("/teacher/map-center", "?tab=results"), null, "MAP results are not a report");
    assert.equal(matchReport("/teacher/map-center", "?tab=plan"), null);
    assert.equal(matchReport("/teacher/plans", ""), null);
    assert.equal(matchReport("/teacher", ""), null);
    assert.equal(periodOf(new URLSearchParams("days=30")), "month");
    assert.equal(periodOf(new URLSearchParams("range=TERM")), "term");
    assert.equal(carryQuery("/map-report/class/c2/profile?subject=READING", "?subject=LANGUAGE"), "/map-report/class/c2/profile?subject=LANGUAGE", "Reading / Language is kept");
    assert.equal(carryQuery("/teacher/progress?classId=c2", "?subject=LANGUAGE"), "/teacher/progress?classId=c2");
  });

  test("the bar: class switcher, student picker, date range, Download (PDF / print + Excel / CSV), Send to family; drawn by the frame", () => {
    const bar = read("src/components/teacher/report-bar.tsx");
    for (const x of ['label="Class"', 'label="Student"', 't("Date range")', 't("Download")', "<PrintThisPage", "r.files", "shareManyAction", 't("Send to family")', "readableClasses(repo, actor)"]) assert.ok(bar.includes(x), x);
    const shell = read("src/components/app-shell.tsx");
    assert.match(shell, /matchReport\(pathname, search\)/);
    assert.match(shell, /<ReportBar actor=\{me\.actor\}/);
    assert.match(read("src/middleware.ts"), /headers\.set\("x-search", req\.nextUrl\.search\)/);
    // one Download / back link: the report's own are hidden under the bar
    assert.match(read("src/app/globals.css"), /\.has-report-bar \.rk-header \[data-rk="back"\]/);
    const files = (k: string, scope: "class" | "student" = "class") => reportByKey(k)!.files!({ classId: "c1", period: "term", scope }).map((f) => f.label);
    assert.deepEqual(files("grammar"), ["PDF file", "Excel", "CSV"]);
    assert.deepEqual(files("class-dashboard"), ["Excel · Reading", "Excel · Language"]);
    for (const r of REPORTS) for (const f of r.files?.({ classId: "c1", period: "term", scope: "class" }) ?? []) assert.ok(hasAr(f.label), f.label);
    assert.ok(reportByKey("family-progress")!.send);
    // after sending, back to the same report (same-site report pages only)
    const act = read("src/app/teacher/reports/actions.ts");
    assert.match(act, /redirect\(backTo\(f, classId, msg\)\)/);
    assert.match(act, /\^\\\/\(teacher\|map-report\|admin\\\/student-file\)/);
  });

  test("redirects: old MAP routes still open MAP views; the Needs help section has its own report page", () => {
    for (const r of ["map-plans", "map-reports", "growth", "map-overview", "map-recommendations", "map-skill-plan", "personal-plan"]) assert.match(read(`src/app/teacher/${r}/page.tsx`), /redirect\(mapCenterHref\(/, r);
    assert.match(read("src/app/teacher/reports/needs-help/page.tsx"), /repeatedMistakes\(repo, actor/);
    assert.match(read("src/components/ui/side-nav.tsx"), /tab === "reports" \? "\/teacher\/reports"/, "MAP reports light up Reports in the menu");
  });

  test("new interface words have Arabic", () => {
    for (const c of REPORT_CATEGORIES) assert.ok(hasAr(c.key) && hasAr(c.hint), c.key);
    for (const r of REPORTS) assert.ok(hasAr(r.title) && hasAr(r.hint), r.key);
    for (const s of ["Report options", "All reports", "Download", "PDF / Print", "Send to family", "Send to every family", "Class", "Student", "Whole class", "Date range", "This week", "This month", "This term", "Students & Classes", "Reading", "Writing", "Assessments", "Upload MAP Scores", "MAP Practice Test",
      "Open any report: it shows at once for your class, with the class switcher, the date range and Download on top.", "ReadMaster, ReadRise, Reading Fluency and the reading tools."]) assert.ok(hasAr(s), s);
  });
});

describe("page files export only Next.js page fields", () => {
  test("the pages touched here", () => {
    const ALLOWED = /^export (default |const (metadata|dynamic|revalidate|runtime|fetchCache|preferredRegion|maxDuration|viewport) |async function generate(Metadata|StaticParams|Viewport)\b)/;
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === "page.tsx" ? [p] : []; });
    const files = [...walk(join(ROOT, "src/app/teacher/reports")), join(ROOT, "src/app/teacher/page.tsx"), join(ROOT, "src/app/teacher/reading/page.tsx"), join(ROOT, "src/app/teacher/map-center/page.tsx")];
    for (const f of files) for (const line of readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("export "))) assert.match(line, ALLOWED, `${f}: ${line.slice(0, 60)}`);
  });
});
