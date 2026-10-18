/**
 * 🧾 r70 reports: every listed teacher / admin report page RENDERS (for real, tests/helpers/page-render.ts, on the
 * speed-test school) its "What this shows" intro at the top and its SUMMARY with the action plan at the end — and the
 * summary is computed from the page's own data (3–5 interface sentences, buttons with links). The NAFS reports and
 * the Student Skills grid are another part of the work (not listed here). In-memory SQLite only.
 */
import { unhandled, renderPage } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bench, routeOf, type Bench } from "./helpers/route-bench";
import { ROOT } from "./helpers/db";
import { UI_STRINGS } from "../src/i18n/en";
import type { Summary } from "../src/lib/report-summary";

const INTRO = "src/components/report-kit/report-intro.tsx#ReportIntro";
const SUMMARY = "src/components/report-kit/report-summary.tsx#ReportSummary";

/** page → role and search params (the class / view the report opens with). */
const PAGES: [file: string, role: "teacher" | "admin", search?: Record<string, string>][] = [
  ["src/app/teacher/reports/page.tsx", "teacher"],
  ["src/app/teacher/reports/page.tsx", "admin"],
  ["src/app/teacher/reports/class/page.tsx", "teacher"],
  ["src/app/teacher/progress/page.tsx", "teacher"],
  ["src/app/teacher/reports/errors/page.tsx", "teacher"],
  ["src/app/teacher/reports/early-warning/page.tsx", "teacher"],
  ["src/app/teacher/reports/early-warning/page.tsx", "admin"],
  ["src/app/teacher/reports/grammar/page.tsx", "teacher"],
  ["src/app/teacher/reports/grammar/page.tsx", "admin", { view: "school" }],
  ["src/app/teacher/reports/grammar/[studentId]/page.tsx", "teacher"],
  ["src/app/teacher/reports/readmaster/page.tsx", "teacher"],
  ["src/app/teacher/reports/readmaster/[studentId]/page.tsx", "teacher"],
  ["src/app/teacher/reports/games/page.tsx", "teacher"],
  ["src/app/teacher/reports/games-usage/page.tsx", "teacher"],
  ["src/app/teacher/readrise/report/page.tsx", "teacher"],
  ["src/app/teacher/learn/[code]/results/page.tsx", "teacher"],
  ["src/app/teacher/writing/report/page.tsx", "teacher"],
  ["src/app/teacher/fluency/page.tsx", "teacher"],
  ["src/app/teacher/family-reports/page.tsx", "teacher"],
  ["src/app/teacher/family-reports/this-week/page.tsx", "teacher"],
  ["src/app/teacher/students/[studentId]/page.tsx", "teacher"],
  ["src/app/teacher/map-center/page.tsx", "teacher", { tab: "reports" }],
  ["src/app/teacher/map-center/page.tsx", "teacher", { tab: "reports", view: "overview" }],
  ["src/app/teacher/map-center/page.tsx", "teacher", { tab: "results" }],
  ["src/app/admin/analytics/page.tsx", "admin"],
  ["src/app/admin/department/page.tsx", "admin"],
  ["src/app/admin/term-report/page.tsx", "admin"],
];

describe("🧾 every report page: the intro on top, the summary + action plan at the end", () => {
  let b: Bench;
  before(async () => {
    b = await bench();
    const { readLessons } = await import("../src/server/learn/files");
    b.params.code = [...readLessons().valid.keys()][0] ?? "G4.L1";
  });

  for (const [file, role, search] of PAGES) {
    test(`${routeOf(file)} (${role}${search ? ` · ${new URLSearchParams(search)}` : ""})`, async () => {
      const route = routeOf(file);
      const names = [...route.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      const params = Object.fromEntries(names.map((n) => [n, b.params[n]]));
      const path = route.replace(/\[([^\]]+)\]/g, (_m, n: string) => b.params[n]);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const r = await renderPage(() => require(join(ROOT, file)) as Record<string, unknown>, { path, cookies: b.cookies[role], params, searchParams: search, collect: true });
      assert.equal(r.outcome, "ok", `${route}: ${r.outcome} ${r.detail ?? ""}`);
      const seen = r.stats.seen ?? [];
      const intro = seen.filter((x) => x.name === INTRO), sums = seen.filter((x) => x.name === SUMMARY);
      assert.ok(intro.length >= 1, `${route}: the "What this shows" intro`);
      assert.ok(UI_STRINGS.includes(intro[0].props.text as never), `${route}: the intro is an interface string (EN + AR)`);
      assert.equal(sums.length, 1, `${route}: one summary at the end`);
      const s = sums[0].props.summary as Summary;
      assert.ok(s.lines.length >= 2 && s.lines.length <= 5, `${route}: 2–5 sentences (${s.lines.length})`);
      for (const l of s.lines) assert.ok(UI_STRINGS.includes(l.key as never), `${route}: "${l.key}" is translated`);
      assert.equal(s.lines.at(-1)!.tone, "next", `${route}: the last sentence is the next step`);
      assert.ok(s.actions.length >= 1, `${route}: an action plan`);
      for (const a of s.actions) { assert.match(a.href, /^\//, `${route}: ${a.kind} links inside the platform`); assert.ok(UI_STRINGS.includes(a.label as never), a.label); }
      // the summary is the LAST thing drawn among the report's client parts
      const idx = seen.findIndex((x) => x.name === SUMMARY), introIdx = seen.findIndex((x) => x.name === INTRO);
      assert.ok(introIdx < idx, `${route}: the intro comes before the summary`);
    });
  }

  test("the summaries cost no extra database query: every page computes them from data it already loaded", () => {
    for (const file of new Set(PAGES.map((p) => p[0]))) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const tabs = file.endsWith("map-center/page.tsx") ? ["reports-tab.tsx", "overview.tsx", "results-tab.tsx"].map((f) => readFileSync(join(ROOT, "src/app/teacher/map-center", f), "utf8")).join("\n") : "";
      const all = src + tabs;
      assert.match(all, /<ReportSummary summary=\{\w+\(/, `${file}: the summary is a pure function call`);
      assert.match(all, /from "@\/lib\/report-summaries"/, file);
    }
    // the coordinator's read-only student file too
    const lite = readFileSync(join(ROOT, "src/app/admin/student-file/[studentId]/page.tsx"), "utf8");
    assert.match(lite, /<ReportIntro text=/);
    assert.match(lite, /<ReportSummary summary=\{studentFileLiteSummary\(/);
    for (const f of ["src/lib/report-summary.ts", "src/lib/report-summaries.ts", "src/lib/report-columns.ts"]) assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /repo\.|findMany|@\/server\/(?!.*types)/, `${f} is pure`);
  });

  test("no stray rejected promise while rendering", () => { assert.deepEqual(unhandled, []); });
});
