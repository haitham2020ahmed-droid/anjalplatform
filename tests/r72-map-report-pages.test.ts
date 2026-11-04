/**
 * 🖨️ r72: the printable MAP pages (/map-report/*) RENDER (for real, tests/helpers/page-render.ts, on the speed-test
 * school) with their "What this shows" intro on top and the SUMMARY + action plan at the end; the student's own
 * study plan and family report get the home version (no teacher button, no level word). In-memory SQLite only.
 */
import { unhandled, renderPage } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { bench, routeOf, type Bench } from "./helpers/route-bench";
import { ROOT } from "./helpers/db";
import { UI_STRINGS } from "../src/i18n/en";
import type { Summary } from "../src/lib/report-summary";

const INTRO = "src/components/report-kit/report-intro.tsx#ReportIntro";
const SUMMARY = "src/components/report-kit/report-summary.tsx#ReportSummary";

/** page → role, how many summaries (the class's family reports: the cover + one per family). */
const PAGES: [file: string, role: "teacher" | "admin" | "student", summaries: "one" | "many" | "none"][] = [
  ["src/app/map-report/profile/[studentId]/page.tsx", "teacher", "one"],
  ["src/app/map-report/family/[studentId]/page.tsx", "teacher", "one"],
  ["src/app/map-report/family/[studentId]/page.tsx", "student", "one"],
  ["src/app/map-report/study-plan/[studentId]/page.tsx", "teacher", "one"],
  ["src/app/map-report/study-plan/[studentId]/page.tsx", "student", "one"],
  ["src/app/map-report/class/[classId]/profile/page.tsx", "teacher", "one"],
  ["src/app/map-report/class/[classId]/family/page.tsx", "teacher", "many"],
  ["src/app/map-report/class/[classId]/study-plans/page.tsx", "admin", "one"],
  ["src/app/map-report/class/[classId]/groups/page.tsx", "teacher", "none"],
];

describe("🖨️ the printable MAP pages: intro on top, summary + action plan at the end", () => {
  let b: Bench;
  before(async () => { b = await bench(); });

  for (const [file, role, want] of PAGES) {
    test(`${routeOf(file)} (${role})`, async () => {
      const route = routeOf(file);
      const names = [...route.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      const params = Object.fromEntries(names.map((n) => [n, b.params[n]]));
      const path = route.replace(/\[([^\]]+)\]/g, (_m, n: string) => b.params[n]);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const r = await renderPage(() => require(join(ROOT, file)) as Record<string, unknown>, { path, cookies: b.cookies[role], params, collect: true });
      assert.equal(r.outcome, "ok", `${route}: ${r.outcome} ${r.detail ?? ""}`);
      const seen = r.stats.seen ?? [];
      const intro = seen.filter((x) => x.name === INTRO), sums = seen.filter((x) => x.name === SUMMARY);
      assert.equal(intro.length, 1, `${route}: one intro`);
      assert.ok(UI_STRINGS.includes(intro[0].props.text as never), `${route}: the intro is translated`);
      if (want === "none") { assert.equal(sums.length, 0); return; }
      if (want === "one") assert.equal(sums.length, 1, `${route}: one summary`); else assert.ok(sums.length >= 1);
      for (const x of sums) {
        const s = x.props.summary as Summary;
        assert.ok(s.lines.length >= 2 && s.lines.length <= 5, `${route}: 2–5 sentences`);
        for (const l of s.lines) assert.ok(UI_STRINGS.includes(l.key as never), `"${l.key}" translated`);
        assert.equal(s.lines.at(-1)!.tone, "next", `${route}: ends with the next step`);
        for (const a of s.actions) { assert.match(a.href, /^\//); assert.ok(UI_STRINGS.includes(a.label as never), a.label); }
        if (role === "student") {
          for (const a of s.actions) assert.doesNotMatch(a.href, /^\/(teacher|admin)\//, `${route}: no teacher button for the student`);
          const text = s.lines.flatMap((l) => [l.key, ...Object.values(l.vars ?? {}).map(String)]).join(" ");
          assert.doesNotMatch(text, /\b(Low Average|High Average|Below Level|Above Level|On Level|Approaching|Meeting|Exceeding)\b/, "no level words");
        } else if (!/family\/\[studentId\]/.test(file)) assert.ok(s.actions.length >= 1, `${route}: an action plan`);
      }
      assert.ok(seen.findIndex((x) => x.name === INTRO) < seen.findIndex((x) => x.name === SUMMARY), `${route}: the intro comes first`);
    });
  }

  test("no stray rejected promise while rendering", () => { assert.deepEqual(unhandled, []); });
});
