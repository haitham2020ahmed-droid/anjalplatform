/**
 * Admin review (the owner: "icons that are just for show, useless, and don't even work"). Checked here:
 * - every link of the admin menu, the Admin Home and All Admin Tools opens an existing page file;
 * - no "Soon" / "#" links, no empty click handlers in the admin pages;
 * - the five sections (School · Content · Assessments & Programs · Reports · Settings), a few tools each;
 * - the pages taken out (duplicates / redirect-only pages) still open and redirect to their new home;
 * - every kept admin page's data loads against the demo school (no crash), and the main actions' services work.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { navItemsFor, MORE } from "../src/components/nav-items";
import { ADMIN_GROUPS, ADMIN_TOOLS, ALL_TOOLS_HREF, REMOVED_ADMIN_ROUTES } from "../src/components/admin-tools";
import { demoDatabase } from "./helpers/db";
// the loaders of every kept admin page
import { schoolTree } from "../src/server/admin/school";
import { listUsers } from "../src/server/admin/users";
import { teacherFollowup } from "../src/server/insights/teacher-followup";
import { classVisit, errorList, growthReport, signIns } from "../src/server/teacher/extras";
import { studentCards, studentPasswordIsUsername } from "../src/server/admin/student-cards";
import { composeOptions, listAdminMessages } from "../src/server/messages/admin-messages";
import { listReviews } from "../src/server/questions/link-review";
import { ensureReadRiseLibrary } from "../src/server/readrise/seed";
import { listLibrary } from "../src/server/readrise/library";
import { curriculumLessons } from "../src/server/curriculum-map/lesson-details";
import { sendTargets } from "../src/server/curriculum-map/send-plan";
import { grammarLibrary } from "../src/server/grammar/grammar";
import { missingWords } from "../src/server/vocabulary/meaning";
import { wordList } from "../src/server/student/words";
import { gradeSkills, gradeStandards, listArticles } from "../src/server/readmaster/service";
import { lexileBands } from "../src/server/curriculum-map/lexile";
import { curriculumTree } from "../src/server/curriculum-manage";
import { duplicateSkills, masterSkills } from "../src/server/skills/master";
import { mapLinks } from "../src/server/map/map-more";
import { adminTestCounts } from "../src/server/tests/assessments";
import { ensureNafsAreas, nafsLinks } from "../src/server/nafs/nafs-links";
import { schoolLevels } from "../src/server/reports/level-distribution";
import { schoolTierSummary } from "../src/server/tiers/views";
import { classificationPreview, savedCounts, standardFixes } from "../src/server/map/question-areas";
import { continuumStats } from "../src/server/map/continuum";
import { loadCycle } from "../src/server/assessment-cycle/cycle";
import { engineOverview, runDaily } from "../src/server/insights/daily";
import { recommendationStats } from "../src/server/insights/recommendation-log";
import { interventionImpact } from "../src/server/insights/interventions";
import { groupMisconceptions } from "../src/server/insights/misconception-tags";
import { loadCalendar } from "../src/server/analytics/calendar";
import { resolvePeriod } from "../src/analytics/periods";
import { standardsReport } from "../src/server/analytics/reports";
import { teacherClasses } from "../src/server/teacher/queries";
import { departmentSummary } from "../src/server/insights/department";
import { schoolResults, windows } from "../src/server/map/sim";
import { pendingApprovals, staffFamilyReports } from "../src/server/reports/family-reports";
import { schoolPerformance } from "../src/server/admin/performance";
import { schoolAi } from "../src/server/predict/school-ai";
import { goalProgress, schoolGoals } from "../src/server/admin/school-goals";
import { planPlaces } from "../src/server/curriculum-map/plans";
import { getBranding, getEngineSettings, listAcademicYears } from "../src/server/admin/settings";
import { coordinatorMap } from "../src/server/teacher/coordinators";
import { ladderSettings } from "../src/server/curriculum-map/ladder-settings";
import { placementRequired } from "../src/server/student/assigned";
import { aiErrors, aiLogSummary, aiSince, listJobs, suggestions, weeklyState } from "../src/server/ai/jobs";
import { aiSettings, rateState } from "../src/server/ai/engine";
import { coachSettings } from "../src/server/fluency/coach";
import { gapReport, suspiciousQuestions } from "../src/server/ai/tools";
import { wizardList } from "../src/server/ai/wizard";
import { dataHealth } from "../src/server/insights/level-story";
import { cleanupCounts } from "../src/server/admin/data-cleanup";
import { listFeedback } from "../src/server/admin/feedback";
import { connections } from "../src/server/admin/connections";
import { previewClean, rosterList } from "../src/server/admin/roster-clean";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** Pages another agent adds in parallel (listed before they land). */
const PLANNED = new Set(["/admin/questions/duplicates"]);
/** The page file of an app address (a folder with page.tsx; `dynamic` = a [param] folder may match a segment). */
function pageExists(href: string, dynamic = false): boolean {
  const path = href.split(/[?#]/)[0].replace(/^\//, "");
  let dir = join(ROOT, "src/app");
  for (const seg of path ? path.split("/") : []) {
    const entries = readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
    const plain = entries.filter((e) => e === seg || (e.startsWith("(") && existsSync(join(dir, e, seg))));
    if (plain.includes(seg)) { dir = join(dir, seg); continue; }
    const group = entries.find((e) => e.startsWith("(") && existsSync(join(dir, e, seg)));
    if (group) { dir = join(dir, group, seg); continue; }
    const dyn = dynamic ? entries.find((e) => e.startsWith("[") && !e.startsWith("[[")) : undefined;
    if (!dyn) return false;
    dir = join(dir, dyn);
  }
  return existsSync(join(dir, "page.tsx"));
}
function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((e) => {
    const p = join(dir, e);
    return statSync(join(ROOT, p)).isDirectory() ? filesUnder(p) : /\.tsx?$/.test(e) ? [p] : [];
  });
}

describe("admin review: only working tools", () => {
  const menu = navItemsFor("SCHOOL_ADMIN");

  test("five sections, a few tools each, Home first", () => {
    assert.deepEqual(ADMIN_GROUPS.map((g) => g.title), ["School", "Content", "Assessments & Programs", "Reports", "Settings"]);
    assert.equal(menu[0].href, "/admin");
    const groups = [...new Set(menu.map((i) => i.group).filter(Boolean))];
    assert.deepEqual(groups.filter((g) => g !== MORE), ADMIN_GROUPS.map((g) => g.title));
    for (const g of ADMIN_GROUPS) {
      const home = ADMIN_TOOLS.filter((x) => x.group === g.key && x.home);
      assert.ok(home.length >= 2 && home.length <= 6, `${g.title}: ${home.length} home tools`);
      const inMenu = menu.filter((i) => i.group === g.title).length;
      assert.ok(inMenu >= 2 && inMenu <= 6, `${g.title}: ${inMenu} menu entries`);
    }
    assert.ok(ADMIN_TOOLS.length <= 65, `${ADMIN_TOOLS.length} tools in all (was 85)`);
  });

  test("every menu / home / All Admin Tools link opens an existing page", () => {
    const home = read("src/app/admin/page.tsx");
    const homeLinks = [...home.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    for (const h of [...menu.map((i) => i.href), ...ADMIN_TOOLS.map((x) => x.href), ...homeLinks, ALL_TOOLS_HREF]) {
      if (PLANNED.has(h) && !pageExists(h)) continue;
      assert.ok(pageExists(h), `page for ${h}`);
    }
    assert.equal(new Set(ADMIN_TOOLS.map((x) => x.href.split("?")[0])).size, ADMIN_TOOLS.length, "no tool listed twice");
  });

  test("the question pages owned elsewhere: one Questions entry, Diagnostic Test under Assessments & Programs", () => {
    const qs = ADMIN_TOOLS.filter((x) => /^\/admin\/(question|bank-gaps|item-quality|imports)/.test(x.href));
    assert.deepEqual(qs.map((x) => x.href).sort(), ["/admin/questions", "/admin/questions/duplicates"]);
    assert.equal(ADMIN_TOOLS.find((x) => x.href === "/admin/diagnostic")?.group, "programs");
  });

  test("no Soon / # links, no empty handlers, no decorative-only buttons", () => {
    const files = [...filesUnder("src/app/admin"), ...(existsSync(join(ROOT, "src/components/admin")) ? filesUnder("src/components/admin") : []), "src/components/admin-tools.ts", "src/components/nav-items.ts"];
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /href=["{]"?#"?["}]/, `${f}: href="#"`);
      assert.doesNotMatch(s, /onClick=\{\(\) => \{\s*\}\}/, `${f}: empty onClick`);
      assert.doesNotMatch(s, /[Cc]oming soon|\(Soon\)|>Soon</, `${f}: “Soon”`);
    }
    for (const x of ADMIN_TOOLS) assert.doesNotMatch(x.label, /soon/i);
    // the home: one primary action, no section icons
    const home = read("src/app/admin/page.tsx");
    assert.match(home, /Open School/);
    assert.equal((home.match(/BTN_PRIMARY/g) ?? []).length, 2, "one primary button (import + use)");
    assert.ok(ADMIN_GROUPS.every((g) => !("icon" in g)), "sections have no decorative icons");
  });

  test("removed / merged pages redirect to their new home and are off every list", () => {
    const listed = new Set([...menu.map((i) => i.href), ...ADMIN_TOOLS.map((x) => x.href)]);
    assert.ok(REMOVED_ADMIN_ROUTES.length >= 4);
    for (const r of REMOVED_ADMIN_ROUTES) {
      assert.ok(!listed.has(r.from), `${r.from} is off the lists`);
      const page = read(`src/app${r.from}/page.tsx`);
      assert.match(page, /redirect\(/, `${r.from} redirects`);
      assert.ok(page.includes(r.to.split("?")[0]), `${r.from} → ${r.to}`);
      assert.ok(pageExists(r.to), `target ${r.to} exists`);
    }
    const doc = read("docs/WHAT-MOVED-WHERE.md");
    for (const r of REMOVED_ADMIN_ROUTES) assert.ok(doc.includes(r.from), `WHAT-MOVED-WHERE lists ${r.from}`);
  });
});

describe("admin review: every kept page loads for the admin (demo school)", () => {
  let repo: SqliteRepo; let admin: Actor; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = String(admin.schoolId);
  });

  const ok = async (name: string, f: () => Promise<unknown>) => {
    try { await f(); } catch (e) { assert.fail(`${name}: ${(e as Error).stack}`); }
  };

  test("School", async () => {
    await ok("school", () => schoolTree(repo, admin));
    await ok("users", () => listUsers(repo, admin, {}));
    await ok("teachers", () => teacherFollowup(repo, admin));
    await ok("visit", () => classVisit(repo, admin, null, null));
    await ok("student-cards", async () => { await studentCards(repo, admin); await studentPasswordIsUsername(repo, schoolId); });
    await ok("logins", () => signIns(repo, admin));
    await ok("messages", async () => { await composeOptions(repo, admin); await listAdminMessages(repo, admin); });
    await ok("roster/clean", async () => { await previewClean(repo, admin, { kind: "SCHOOL" }); await rosterList(repo, admin, { kind: "GRADE", grade: 4 }); });
  });

  test("Content", async () => {
    await ok("skill-links", () => listReviews(repo, admin, {}));
    await ok("readrise", async () => { await ensureReadRiseLibrary(repo); await listLibrary(repo, admin, {}); });
    await ok("curriculum-map", async () => { await curriculumLessons(repo, admin, 4); await sendTargets(repo, admin); });
    await ok("grammar", () => grammarLibrary(repo, admin));
    await ok("dictionary", async () => { await missingWords(repo, admin, 100); await wordList(repo, admin, ""); });
    await ok("readmaster", async () => { await listArticles(repo, admin, 4); await gradeSkills(repo, schoolId, 4); await lexileBands(repo, schoolId); await gradeStandards(repo, 4); });
    await ok("curriculum", () => curriculumTree(repo, admin));
    await ok("skills", async () => { await duplicateSkills(repo, admin); await masterSkills(repo, schoolId); });
    await ok("map-links", () => mapLinks(repo, admin));
  });

  test("Assessments & Programs", async () => {
    await ok("tests", () => adminTestCounts(repo, admin));
    await ok("nafs-links", async () => { await ensureNafsAreas(repo); await nafsLinks(repo, admin); });
    await ok("levels", () => schoolLevels(repo, admin));
    await ok("tiers", () => schoolTierSummary(repo, admin));
    await ok("map-classification", async () => { await classificationPreview(repo, admin); await savedCounts(repo, admin); await standardFixes(repo, admin, "SUGGESTED"); await standardFixes(repo, admin, "APPLIED"); });
    await ok("map-continuum", () => continuumStats(repo));
    await ok("assessment-calendar", () => loadCycle(repo, schoolId));
    await ok("learning-engine", async () => {
      const ids = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => String(x.id));
      await Promise.all([engineOverview(repo, schoolId), recommendationStats(repo, ids), interventionImpact(repo, schoolId), groupMisconceptions(repo, ids, 30, new Date(), 8)]);
      // the “Update now” button's job
      await runDaily(repo, schoolId, new Date());
    });
  });

  test("Reports", async () => {
    await ok("analytics", async () => {
      const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, schoolId));
      await standardsReport(repo, admin, { school: true }, period);
      await teacherClasses(repo, admin);
    });
    await ok("term-report", async () => {
      await departmentSummary(repo, admin); await growthReport(repo, admin, "READING");
      const ws = await windows(repo, admin);
      if (ws[0]) await schoolResults(repo, admin, ws[0].id, "READING");
    });
    await ok("report-approvals", async () => { await pendingApprovals(repo, admin); await staffFamilyReports(repo, admin); });
    await ok("department", () => departmentSummary(repo, admin));
    await ok("performance", () => schoolPerformance(repo, admin));
    await ok("ai-dashboard", () => schoolAi(repo, schoolId));
    await ok("school-goals", async () => {
      await schoolGoals(repo, schoolId); await planPlaces(repo, schoolId, 4);
      await goalProgress(repo, admin, await repo.findMany("Class", { schoolId, deletedAt: null }));
    });
  });

  test("Settings", async () => {
    await ok("settings", async () => { await getBranding(repo, admin); await getEngineSettings(repo, admin); await listAcademicYears(repo, admin); await coordinatorMap(repo, schoolId); await ladderSettings(repo, schoolId); await placementRequired(repo, schoolId); });
    await ok("ai-tools", async () => {
      const s = await aiSettings(repo, schoolId);
      await rateState(repo, schoolId, s); await coachSettings(repo, schoolId);
      await aiErrors(repo, admin, 50); await aiLogSummary(repo, admin, 7); await aiSince(repo, schoolId);
      await listJobs(repo, admin, 15); await suggestions(repo, admin, {}); await weeklyState(repo, schoolId);
      await gapReport(repo, schoolId, 4); await suspiciousQuestions(repo, schoolId, { grade: 4 }); await wizardList(repo, admin, 4);
    });
    await ok("data-health", () => dataHealth(repo, admin));
    await ok("data-cleanup", () => cleanupCounts(repo, admin));
    await ok("feedback", () => listFeedback(repo, admin));
    await ok("connections", () => connections(repo, admin));
    await ok("errors", () => errorList(repo, admin));
  });
});
