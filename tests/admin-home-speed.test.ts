/**
 * ⚡ Admin home speed (owner: "first visit ~1.6 s because it builds the MAP pools") and the heaviest admin / teacher
 * pages, on the speed-test school (tests/helpers/speed-school.ts: 225 students, the full bank + 14,000 generated
 * questions, practice history, 3 ms per database call). The page's server time is what it awaits before the HTML is
 * complete — its streamed sections side by side; work left for after the response (the MAP readiness and the
 * Connections check, which build the MAP pools; the alert scan) is not part of it. In-memory SQLite only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { speedSchool, table, timePage, type PageTime, type SpeedSchool } from "./helpers/speed-school";
import { adminHomeCounts, mapShortAreas, buildMapShortAreas } from "../src/server/admin/home-data";
import { urgentUnhandledCount } from "../src/server/insights/early-warning";
import { teacherFollowupForHome } from "../src/server/insights/teacher-followup";
import { classesAtAGlance } from "../src/server/insights/overview";
import { connectionsKept } from "../src/server/admin/connections";
import { departmentSummary } from "../src/server/insights/department";
import { gradeSummary } from "../src/server/insights/progress";
import { growthReport } from "../src/server/teacher/extras";
import { bankGaps, levelGaps, practiceGaps } from "../src/server/map/bank-gaps";
import { windows, schoolResults } from "../src/server/map/sim";
import { classComparison, standardsReport } from "../src/server/analytics/reports";
import { loadCalendar } from "../src/server/analytics/calendar";
import { resolvePeriod } from "../src/analytics/periods";
import { holdAfterResponse } from "../src/server/lib/after-response";
import { ROOT } from "./helpers/db";
import { freshStats } from "../scripts/perf/measuring-repo";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** generous limits for a slow CI machine; the counts of database calls are exact properties of the code */
const LIMIT_MS = Number(process.env.SPEED_LIMIT_MS ?? 400);

describe("⚡ admin home and the heaviest pages", () => {
  let S: SpeedSchool;
  const rows: PageTime[] = [];
  before(async () => { S = await speedSchool({ bigBank: 14000 }); });

  const home = () => {
    const { m, admin } = S, now = new Date();
    // every section of the streamed page, side by side (as Suspense renders them)
    return Promise.all([adminHomeCounts(m, admin, now), mapShortAreas(m, admin), urgentUnhandledCount(m, admin.schoolId!, now), teacherFollowupForHome(m, admin, now), classesAtAGlance(m, admin), Promise.resolve(connectionsKept(m, admin))]);
  };

  test(`admin home: first visit under ${LIMIT_MS} ms of server time; the MAP pools are built after the response, shown on the next visit`, async () => {
    const release = holdAfterResponse();
    S.m.stats = freshStats();
    const t0 = performance.now();
    const [, shortFirst, , , , connFirst] = await home();
    const first = performance.now() - t0, firstCalls = S.m.stats.calls;
    assert.equal(shortFirst, null, "the MAP readiness is not built while the admin waits");
    assert.equal(connFirst, null, "nor the Connections check");
    await release(); // after the response: the pools are built (one heavy job at a time)
    const r = await timePage(S.m, "Admin › Home", home);
    rows.push({ ...r, coldMs: Math.round(first), coldCalls: firstCalls });
    assert.ok(firstCalls <= 70, `first visit: ${firstCalls} database calls (before: 288)`);
    const [, shortNext, , , , connNext] = await home();
    assert.ok(Array.isArray(shortNext), "the next visit shows the MAP areas short of questions");
    assert.deepEqual(shortNext, await buildMapShortAreas(S.repo, S.admin), "the kept answer is the real one");
    assert.ok(connNext && connNext.stages.length > 0, "and the Connections check");
    console.log(`admin home: first visit ${first.toFixed(0)} ms, next ${r.warmMs} ms (${r.warmCalls} calls)`);
    assert.ok(first < LIMIT_MS, `first visit ${first.toFixed(0)} ms`);
    assert.ok(r.warmMs < LIMIT_MS / 2, `next visit ${r.warmMs} ms`);
  });

  test("admin home page: streamed sections with loaders; nothing heavy awaited", () => {
    const p = read("src/app/admin/page.tsx");
    assert.ok((p.match(/<Suspense fallback=\{</g) ?? []).length >= 3, "the sections stream behind loaders");
    assert.match(p, /mapShortAreas\(repo, actor\)/);
    assert.match(p, /connectionsKept\(repo, actor\)/);
    assert.doesNotMatch(p, /await adminHomeData|readiness\(|connectionsCached\(/, "the MAP pools are never built while the admin waits");
    assert.match(p, /role="status"/, "the loaders say Loading… to screen readers");
    assert.equal((p.match(/^export /gm) ?? []).length, 2, "the page file exports only Next page fields");
    assert.match(read("src/server/admin/home-data.ts"), /runAfterResponse\("admin\.map_readiness"/);
  });

  test("the heaviest pages: few round trips, fast on the same dataset", async () => {
    const { m, admin, teacher, classId } = S;
    const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(S.repo, admin.schoolId!));
    const pages: [string, () => Promise<unknown>, number][] = [
      ["Admin › Department summary", () => departmentSummary(m, admin), 60],
      ["Admin › Grade summary", () => gradeSummary(m, admin), 50],
      ["Admin › Term report", async () => { const [, , ws] = await Promise.all([departmentSummary(m, admin), growthReport(m, admin, "READING"), windows(m, admin)]); if (ws[0]) await schoolResults(m, admin, ws[0].id, "READING"); }, 70],
      ["Admin › MAP bank gaps", () => Promise.all([bankGaps(m, admin), practiceGaps(m, admin), levelGaps(m, admin)]), 35],
      ["Teacher › Growth (MAP) report", () => growthReport(m, teacher, "READING"), 12],
      ["Teacher › Class analytics", async () => { await classComparison(m, teacher, classId, period); await standardsReport(m, teacher, { classId }, period); }, 90],
    ];
    for (const [name, fn, maxCalls] of pages) {
      const r = await timePage(m, name, fn);
      rows.push(r);
      assert.ok(r.coldCalls <= maxCalls, `${name}: ${r.coldCalls} database calls (at most ${maxCalls})`);
      assert.ok(r.coldMs < LIMIT_MS, `${name}: ${r.coldMs} ms`);
    }
    console.log(table(rows));
  });

  test("batched reads give the same answers: department summary classes and totals add up", async () => {
    const d = await departmentSummary(S.repo, S.admin);
    const g = await gradeSummary(S.repo, S.admin);
    assert.equal(d.classes.length, g.flatMap((x) => x.classes).length);
    assert.equal(d.totals.students, d.classes.reduce((t, c) => t + c.students, 0));
    assert.equal(d.totals.students, await S.repo.count("ClassMembership", { leftAt: null }));
    for (const c of g.flatMap((x) => x.classes)) assert.notEqual(c.teacher, "", c.className);
    const gaps = await bankGaps(S.repo, S.admin);
    assert.ok(gaps.length > 0 && gaps.every((r) => r.questions >= 0));
  });
});
