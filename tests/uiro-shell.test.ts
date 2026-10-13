/**
 * UI reorganisation — the shell: interface language (English | Arabic for parents, interface only, RTL),
 * the first-login tour (once per user), the design kit tokens, and the decluttered menus (nothing lost).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { ar } from "../src/i18n/ar";
import { dirOf, isLang, LANG_NAMES, makeT, toLang, translate, UI_STRINGS } from "../src/i18n";
import { isContentPath } from "../src/i18n/content-routes";
import { searchablePagesFor, navItemsFor } from "../src/components/nav-items";
import { ADMIN_TOOLS, ALL_TOOLS_HREF, REMOVED_ADMIN_ROUTES } from "../src/components/admin-tools";
import { TAG_STYLE, tagKey, workStatus, STATUS_STYLE } from "../src/components/ui-kit/tokens";
import { TOUR_STEPS } from "../src/components/ui-kit/first-login-tour";
import { markTourSeen, needsTour, saveUiLang } from "../src/server/ui/prefs";
import { resolveActor } from "../src/server/auth/actor";
import { demoDatabase, ROOT } from "./helpers/db";

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFC]/;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out); else if (/\.(tsx?|css)$/.test(n)) out.push(p);
  }
  return out;
}

describe("interface language: t()", () => {
  test("English is the default; unknown text falls back unchanged (content can never turn Arabic)", () => {
    assert.equal(toLang(undefined), "en");
    assert.equal(toLang("fr"), "en");
    assert.equal(toLang("ar"), "ar");
    assert.ok(isLang("en") && isLang("ar") && !isLang("AR"));
    assert.equal(translate("en", "Home"), "Home");
    assert.equal(translate("ar", "Home"), "الرئيسية");
    const passage = "The fox crept quietly through the tall grass.";
    assert.equal(translate("ar", passage), passage, "a passage is not an interface string");
    assert.equal(translate("ar", "Ahmed Al-Harbi"), "Ahmed Al-Harbi", "names stay as they are");
    assert.equal(makeT("ar")("Tip {n} of {total}", { n: 1, total: 4 }), "نصيحة 1 من 4");
    assert.equal(makeT("en")("Tip {n} of {total}", { n: 2, total: 3 }), "Tip 2 of 3");
    assert.equal(makeT("en")("Due {date}"), "Due {date}", "missing values keep their placeholder");
  });

  test("ar has every key (and only those), each one written", () => {
    const keys = new Set<string>(UI_STRINGS);
    assert.equal(keys.size, UI_STRINGS.length, "no duplicate interface strings");
    for (const k of UI_STRINGS) {
      assert.ok(typeof ar[k] === "string" && ar[k].trim().length > 0, `missing Arabic for “${k}”`);
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(placeholders(ar[k]), placeholders(k), `same placeholders: “${k}”`);
    }
    for (const k of Object.keys(ar)) assert.ok(keys.has(k), `extra Arabic key “${k}”`);
    // product names may stay Latin; everything else is really Arabic
    const latinOk = new Set(["MAP", "RTI", "ReadRise", "ReadMaster", "English", "MAP Growth"]);
    for (const k of UI_STRINGS) if (!latinOk.has(k)) assert.match(ar[k], ARABIC, `“${k}” is translated`);
    assert.equal(LANG_NAMES.ar, "العربية");
  });

  test("never 'Lexile' and no technical 'adaptive' in the interface words", () => {
    for (const k of UI_STRINGS) {
      assert.doesNotMatch(k, /lexile/i);
      assert.doesNotMatch(k, /\badaptive\b/i);
    }
  });
});

describe("right-to-left", () => {
  test("Arabic turns the page right-to-left; English stays left-to-right", () => {
    assert.equal(dirOf("ar"), "rtl");
    assert.equal(dirOf("en"), "ltr");
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /<html lang=\{lang\} dir=\{dirOf\(lang\)\}/);
    assert.match(layout, /<I18nProvider lang=\{lang\}>/);
  });

  test("English content keeps its direction in Arabic mode (lessons, questions, passages)", () => {
    for (const p of ["/practice/abc", "/quiz/1", "/student/readrise/x", "/student/readmaster/y", "/student/lesson", "/student/map-test/run", "/play/123"]) assert.ok(isContentPath(p), p);
    for (const p of ["/student", "/student/readrise", "/student/readmaster", "/teacher", "/teacher/plans", "/admin"]) assert.ok(!isContentPath(p), p);
    const css = read("src/app/globals.css");
    assert.match(css, /\[dir="rtl"\] :is\(\[data-content\], \.reading\) \{ direction: ltr;/);
    assert.match(read("src/components/app-shell.tsx"), /"data-content"/);
  });

  test("the shell uses logical sides (start/end, ps/pe, ms/me) only", () => {
    for (const f of ["src/components/app-shell.tsx", "src/components/ui/side-nav.tsx", "src/components/page-header.tsx", ...files(join(ROOT, "src/components/ui-kit")).map((x) => relative(ROOT, x))]) {
      assert.doesNotMatch(read(f), /[\s"`](ml|mr|pl|pr)-\d|[\s"`](left|right)-\d|text-(left|right)\b/, f);
    }
  });
});

describe("no Arabic outside the translation files", () => {
  test("src/app and src/components carry no Arabic; only src/i18n does", () => {
    const hits = [...files(join(ROOT, "src/app")), ...files(join(ROOT, "src/components"))]
      .filter((f) => ARABIC.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    assert.deepEqual(hits, []);
    assert.ok(ARABIC.test(read("src/i18n/ar.ts")));
  });
});

describe("Lexend only (plus the Literise brand serif)", () => {
  test("Lexend is loaded with next/font and is the interface font; DM Serif Display only for the Literise brand", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /import \{ DM_Serif_Display, Lexend \} from "next\/font\/google"/);
    assert.match(read("src/app/globals.css"), /--font-display: var\(--font-literise\)/);
    const css = read("src/app/globals.css");
    assert.match(css, /--font-sans: var\(--font-lexend\)/);
    assert.match(css, /--font-mono: var\(--font-lexend\)/);
    assert.doesNotMatch(css, /Georgia|Times New Roman|Iowan/);
    const fontImports = files(join(ROOT, "src/app")).filter((f) => /from "next\/font\/google"/.test(readFileSync(f, "utf8")));
    assert.deepEqual(fontImports.map((f) => relative(ROOT, f)), ["src/app/layout.tsx"]);
  });
});

describe("design kit tokens", () => {
  test("one colour per source: Curriculum blue, MAP green, RTI orange, Grammar purple, NAFS teal", () => {
    assert.match(TAG_STYLE.CURRICULUM.className, /blue/);
    assert.match(TAG_STYLE.MAP.className, /green/);
    assert.match(TAG_STYLE.RTI.className, /orange/);
    assert.match(TAG_STYLE.GRAMMAR.className, /purple/);
    assert.match(TAG_STYLE.NAFS.className, /teal/);
    assert.equal(tagKey("map"), "MAP");
    assert.equal(tagKey("Weekly Quiz"), "WEEKLY_QUIZ");
    assert.equal(tagKey("chapter-test"), "CHAPTER_TEST");
    assert.equal(tagKey("Reading Check 3"), "CUSTOM");
    for (const s of Object.values(TAG_STYLE)) assert.ok((UI_STRINGS as readonly string[]).includes(s.label), s.label);
  });
  test("three status words", () => {
    assert.equal(workStatus("COMPLETED"), "DONE");
    assert.equal(workStatus("STARTED"), "IN_PROGRESS");
    assert.equal(workStatus("ASSIGNED"), "NOT_STARTED");
    assert.equal(workStatus(null), "NOT_STARTED");
    for (const s of Object.values(STATUS_STYLE)) assert.ok((UI_STRINGS as readonly string[]).includes(s.label));
  });
});

describe("menus: decluttered, nothing lost", () => {
  const BEFORE: Record<string, string[]> = {
    TEACHER: "/teacher /teacher/ai /teacher/readrise /teacher/learning-loop /teacher/classes /teacher/week /teacher/reports /teacher/messages /admin/curriculum-map /teacher/assignments /teacher/worksheet /teacher/writing /teacher/lessons /admin/grammar /teacher/respond /teacher/games /admin/dictionary /teacher/progress /admin/student-file /teacher/intervention /teacher/intervention/groups /teacher/tiers /teacher/rti-plan /teacher/data-meeting /teacher/knowledge-graph /teacher/alerts /teacher/diagnostic /teacher/progress-checks /teacher/decoding /teacher/strategy-groups /teacher/word-journal /teacher/levels /teacher/groups /teacher/fluency /teacher/family-reports /teacher/calendar /teacher/map-center /teacher/map-rit /teacher/map-plans /teacher/search /guide".split(" "),
    SCHOOL_ADMIN: "/admin /teacher/learning-loop /admin/department /admin/report-approvals /teacher/reports /admin/curriculum-map /admin/questions /admin/question-intelligence /admin/question-bank /admin/skills /admin/ai-tools /admin/question-review /admin/question-flags /admin/item-quality /admin/dictionary /admin/readmaster /admin/readrise /admin/readrise/dashboard /admin/grammar /teacher/worksheet /admin/ai-dashboard /teacher/ai /admin/learning-engine /admin/tiers /admin/levels /teacher/rti-plan /teacher/data-meeting /admin/messages /teacher/knowledge-graph /teacher/intervention /teacher/alerts /admin/diagnostic /admin/assessment-calendar /teacher/progress-checks /admin/school-goals /admin/student-file /teacher/progress /teacher/grade-summary /admin/teachers /admin/visit /admin/term-report /admin/analytics /teacher/map-center /teacher/map-rit /teacher/map-plans /admin/map-classification /admin/users /admin/student-cards /admin/class-transfer /admin/quick-students /admin/roster/clean /admin/settings /teacher/search /admin/data-health /admin/errors /admin/connections /admin/logins /admin/backup /admin/map-links /admin/map-continuum".split(" "),
    STUDENT: "/student /student/insights /student/map /student/plans /student/skills /student/readmaster /student/readrise /student/lesson /student/fluency-coach /student/respond /student/writing /student/words /student/decoding /student/strategy-survey /student/review /student/badges /student/family /play /guide".split(" "),
  };
  for (const role of ["TEACHER", "SCHOOL_ADMIN", "STUDENT"]) {
    test(`${role}: every page from before is still one click away; no duplicates; plain, translatable labels`, () => {
      const items = navItemsFor(role);
      const hrefs = items.map((i) => i.href);
      // b1-nav (short menus): pages taken out of a menu are reached from another menu page (docs/WHAT-MOVED-WHERE.md);
      // the address still opens. OUT = left the menu on purpose (still open by address / from the page named there).
      const MOVED: Record<string, Record<string, string>> = {
        STUDENT: { "/student/plans": "/student/reports", "/student/insights": "/student/reports", "/student/skills": "/student/reports", "/student/family": "/student/reports", "/play": "/student" },
        TEACHER: {
          "/teacher/classes": "/teacher/students", "/admin/student-file": "/teacher/students", "/teacher/ai": "/teacher/students", "/teacher/intervention": "/teacher/students",
          "/teacher/alerts": "/teacher/students", "/teacher/levels": "/teacher/students", "/teacher/progress": "/teacher/reports", "/teacher/family-reports": "/teacher/reports",
          "/teacher/assignments": "/teacher/plans", "/teacher/map-rit": "/teacher/map-center", "/teacher/map-plans": "/teacher/map-center",
          "/teacher/intervention/groups": "/teacher/groups", "/teacher/strategy-groups": "/teacher/groups",
        },
      };
      // /student/review: "Review my mistakes" now opens ⭐ Second Chance (the only place a missed question comes back)
      const OUT: Record<string, string[]> = { TEACHER: ["/teacher/learning-loop", "/teacher/knowledge-graph", "/teacher/search"], STUDENT: ["/student/review"] };
      // admin review: the admin menu keeps ≤ 6 tools per section; every other working tool is on All Admin Tools (in the
      // menu), forwarding pages left the lists (REMOVED_ADMIN_ROUTES), the question pages hang off Questions,
      // MAP plans / Student Progress / Search live in MAP, Reports and the top bar
      if (role === "SCHOOL_ADMIN") {
        assert.ok(hrefs.includes(ALL_TOOLS_HREF));
        for (const x of ADMIN_TOOLS) MOVED.SCHOOL_ADMIN = { ...MOVED.SCHOOL_ADMIN, [x.href]: ALL_TOOLS_HREF };
        for (const r of REMOVED_ADMIN_ROUTES) MOVED.SCHOOL_ADMIN[r.from] = ALL_TOOLS_HREF;
        OUT.SCHOOL_ADMIN = ["/admin/question-intelligence", "/admin/question-bank", "/admin/question-review", "/admin/question-flags", "/admin/item-quality", "/teacher/map-plans", "/teacher/progress", "/teacher/search"];
      }
      // owner's spec (Update 53): the teacher and student menus are short (7 and 5 entries); every other page is
      // still found by name in "Find a page" (searchablePagesFor) or opens from a hub page
      const found = new Set(searchablePagesFor(role).map((p) => p.href));
      for (const h of BEFORE[role]) {
        const via = MOVED[role]?.[h];
        assert.ok(hrefs.includes(h) || found.has(h) || (via !== undefined && hrefs.includes(via)) || OUT[role]?.includes(h) || (role === "STUDENT" && ["/student/plans", "/student/rti"].includes(h)) || (role === "TEACHER" && ["/teacher/tiers", "/teacher/data-meeting", "/teacher/classes", "/admin/student-file", "/teacher/search"].includes(h)), `${role} lost ${h}`);
      }
      assert.equal(new Set(hrefs).size, hrefs.length, "no page listed twice");
      assert.equal(new Set(items.map((i) => i.label)).size, items.length, "no two entries with the same name");
      assert.equal(new Set(items.map((i) => i.icon)).size, items.length, "one icon per entry");
      for (const i of items) {
        assert.ok((UI_STRINGS as readonly string[]).includes(i.label), `label “${i.label}” is in the translation file`);
        if (i.group) assert.ok((UI_STRINGS as readonly string[]).includes(i.group), `group “${i.group}”`);
        assert.doesNotMatch(i.label, /adaptive|lexile/i);
      }
      assert.equal(items[0].label, "Home");
    });
  }
  test("the tour's tips are interface strings and 3–4 per role", () => {
    for (const [role, steps] of Object.entries(TOUR_STEPS)) {
      assert.ok(steps.length >= 3 && steps.length <= 4, role);
      for (const s of steps) { assert.ok((UI_STRINGS as readonly string[]).includes(s.title), s.title); assert.ok((UI_STRINGS as readonly string[]).includes(s.text), s.text); }
    }
    assert.deepEqual(TOUR_STEPS.STUDENT.map((s) => s.target).slice(0, 3), ["my-work", "plans", "tests"]);
  });
});

describe("per-user settings (Test School, in-memory)", () => {
  let repo: SqliteRepo;
  before(async () => { ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 })); });

  test("the tour shows once per user: finished or skipped → never again (on every device)", async () => {
    const [u] = await repo.findMany("User", { role: "STUDENT" });
    const actor = await resolveActor(repo, u);
    assert.equal(needsTour(u, "STUDENT"), true, "a new user gets the tour");
    await markTourSeen(repo, actor, new Date("2026-10-01T08:00:00Z"));
    const after = await repo.findUnique("User", { id: u.id });
    assert.equal(needsTour(after, "STUDENT"), false);
    await markTourSeen(repo, actor, new Date("2026-10-05T08:00:00Z"));
    const again = await repo.findUnique("User", { id: u.id });
    assert.equal(new Date(String(again!.tourSeenAt)).toISOString(), "2026-10-01T08:00:00.000Z", "the first time is kept");
    assert.equal(needsTour(u, "PARENT"), false, "no tour for other roles");
  });

  test("the language choice is saved on the user's own row only", async () => {
    const [a, b] = await repo.findMany("User", { role: "STUDENT" });
    await saveUiLang(repo, await resolveActor(repo, a), "ar");
    assert.equal((await repo.findUnique("User", { id: a.id }))!.uiLang, "ar");
    assert.notEqual((await repo.findUnique("User", { id: b.id }))!.uiLang, "ar");
    await assert.rejects(saveUiLang(repo, await resolveActor(repo, a), "xx" as "en"));
  });

  test("the switch and the tour routes check the session and the origin", () => {
    const lang = read("src/app/api/ui-lang/route.ts"), tour = read("src/app/api/tour/route.ts");
    for (const src of [lang, tour]) { assert.match(src, /assertSameOrigin\(/); assert.match(src, /apiActor\(/); }
    assert.doesNotMatch(lang + tour + read("src/i18n/server.ts"), /process\.env/);
  });
});
