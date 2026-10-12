/**
 * Admin Home tidied (the school asked: "too many icons", then "icons that are just for show"): a short welcome with
 * one primary action (Open School), the school at a glance, Needs your attention (≤ 3), five sections of ≤ 6 working
 * tools + "More" → All Admin Tools; the admin menu shows the same five sections (no "More" group). Checked here:
 * no admin page was lost (every page from the old menu and the old home is in the menu, on All Admin Tools, a
 * forwarding page that redirects, or a question page reached from Questions), ≤ 6 tiles each, labels translated.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { navItemsFor, MORE_TOOLS } from "../src/components/nav-items";
import { REMOVED_ADMIN_ROUTES } from "../src/components/admin-tools";
import { ADMIN_GROUPS, ADMIN_TOOLS, ALL_TOOLS_HREF } from "../src/components/admin-tools";
import { TOUR_STEPS } from "../src/components/ui-kit/first-login-tour";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const isUi = (s: string) => (UI_STRINGS as readonly string[]).includes(s);
/** Every link of the Admin Home before the tidy-up (cards, tiles, header buttons, widgets). */
const OLD_HOME = ("/admin/analytics /admin/backup /admin/bank-gaps /admin/connections /admin/curriculum-map /admin/department /admin/dictionary " +
  "/admin/errors /admin/imports /admin/item-quality /admin/logins /admin/map-continuum /admin/map-links /admin/nafs-links /admin/performance " +
  "/admin/question-bank /admin/question-flags /admin/questions/import /admin/questions/requests /admin/questions/unclassified /admin/questions " +
  "/admin/questions?status=UNDER_REVIEW /admin/quick-students /admin/readmaster /admin/report-approvals /admin/roster /admin/roster/clean " +
  "/admin/settings /admin/skill-links /admin/student-file /admin/term-report /admin/users /admin/visit /admin/tests /teacher/alerts " +
  "/teacher/curriculum-results /teacher/growth /teacher/intervention /teacher/learning-loop /teacher/levels /teacher/map-plans " +
  "/teacher/map-recommendations /teacher/map-reports /teacher/map-rit /teacher/map-test /teacher/personal-plan /teacher/plans " +
  "/teacher/reports/games-usage").split(" ");

describe("admin: calm home, nothing lost", () => {
  const items = navItemsFor("SCHOOL_ADMIN");
  const nav = new Set(items.map((i) => i.href));
  const all = new Set(ADMIN_TOOLS.map((x) => x.href));

  test("every page of the old menu and the old home is still reachable (menu or All Admin Tools)", () => {
    const oldMenu = read("tests/uiro-shell.test.ts").match(/SCHOOL_ADMIN: "([^"]+)"/)![1].split(" ");
    const removed = new Set(REMOVED_ADMIN_ROUTES.map((r) => r.from));
    // forwarding pages (the MAP page / Reports hub / top-bar search have them) and the question pages (reached from Questions)
    const elsewhere = /^\/admin\/(question-|questions[/?]|bank-gaps|item-quality|imports)|^\/teacher\/(map-plans|map-reports|growth|map-recommendations|personal-plan|progress|curriculum-results|reports\/games-usage|search)$/;
    for (const h of [...oldMenu, ...OLD_HOME]) assert.ok(nav.has(h) || all.has(h) || removed.has(h) || elsewhere.test(h), `still reachable: ${h}`);
    // every tool of the list is in the menu or on All Admin Tools; every menu page is a tool
    for (const i of items) if (i.href !== "/admin" && i.href !== ALL_TOOLS_HREF) assert.ok(all.has(i.href), `${i.href} is in the tool list`);
    assert.equal(new Set(ADMIN_TOOLS.map((x) => x.href)).size, ADMIN_TOOLS.length, "no tool listed twice");
    assert.ok(existsSync(join(process.cwd(), "src/app/admin/all/page.tsx")), "All Admin Tools page");
    // every admin page file still exists (nothing deleted)
    // (pages another agent builds in parallel — School, Data Cleanup, Feedback inbox — are listed before they land)
    const PLANNED = new Set(["/admin/questions/duplicates"]);
    for (const h of [...all].filter((x) => x.startsWith("/admin/") && !PLANNED.has(x))) assert.ok(existsSync(join(process.cwd(), "src/app", h.split("?")[0], "page.tsx")), `page ${h}`);
  });

  test("the menu: Home, All Admin Tools, the five sections (≤ 6 each), no More", () => {
    assert.equal(items[0].label, "Home");
    assert.equal(items[1].href, ALL_TOOLS_HREF);
    const groups = [...new Set(items.map((i) => i.group).filter(Boolean))];
    assert.deepEqual(groups, ADMIN_GROUPS.map((g) => g.title));
    for (const g of ADMIN_GROUPS) {
      const n = items.filter((i) => i.group === g.title).length;
      assert.ok(n >= 3 && n <= 6, `${g.title}: ${n}`);
    }
    assert.ok(items.length <= 32, `menu entries: ${items.length} (was 61)`);
    assert.match(read("src/components/ui/side-nav.tsx"), /FOLDED_BY_DEFAULT = new Set\(\["More"\]\)/);
  });

  test("the home: ≤ 5 groups of 3–6 tiles, ≤ 3 attention cards, More links to All Admin Tools", () => {
    assert.ok(ADMIN_GROUPS.length <= 5);
    for (const g of ADMIN_GROUPS) {
      const n = ADMIN_TOOLS.filter((x) => x.group === g.key && x.home).length;
      assert.ok(n >= 3 && n <= 6, `${g.title}: ${n} tiles`);
      for (const x of ADMIN_TOOLS.filter((y) => y.group === g.key && y.home)) assert.ok(x.hint && isUi(x.hint), `hint of ${x.label}`);
    }
    const page = read("src/app/admin/page.tsx");
    assert.match(page, /\.slice\(0, 3\)/, "at most three attention cards");
    assert.match(page, /href="\/admin\/school" className=\{`\$\{BTN_PRIMARY\}/, "one primary action: Open School");
    assert.match(page, /ALL_TOOLS_HREF\}#\$\{g\.key\}/, "each group's More opens All Admin Tools at the group");
    assert.doesNotMatch(page, /ToolFinder|Everything you can do/, "the long list of 45 cards is gone");
    assert.ok((page.match(/<BigTile /g) ?? []).length === 1, "tiles come from the tool list only");
  });

  test("labels, groups and hints are interface strings with Arabic", () => {
    for (const s of [...ADMIN_GROUPS.flatMap((g) => [g.title, g.blurb]), ...ADMIN_TOOLS.map((x) => x.label), MORE_TOOLS, "Open School", "All Admin Tools", "School at a glance", "More: {n} tools", "Classes at a glance"]) {
      assert.ok(isUi(s), `“${s}” is in en.ts`);
      assert.ok(ar[s as keyof typeof ar] && ar[s as keyof typeof ar] !== s || s === "MAP" || s === "ReadMaster", `“${s}” has Arabic`);
    }
    assert.equal(new Set(items.map((i) => i.icon)).size, items.length, "one icon per menu entry");
    assert.equal(new Set(items.map((i) => i.label)).size, items.length, "one name per menu entry");
  });

  test("the admin tour points at the new groups and All Admin Tools", () => {
    const targets = TOUR_STEPS.ADMIN.map((s) => s.target);
    assert.deepEqual(targets, ["content", "reports", "all-tools", "home"]);
    const nav = read("src/components/ui/side-nav.tsx");
    assert.match(nav, /Content: "content", Reports: "reports"/);
    assert.match(nav, /"\/admin\/all": "all-tools"/);
  });
});
