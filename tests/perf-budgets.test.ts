/**
 * ⚡ Performance budgets (owner: "heavy moving from page to page; some pages take seconds — fix it at the root").
 * Every page below is RENDERED for real (tests/helpers/page-render.ts: the page component, its server components, the
 * frame) on the speed-test school (225 students, the full bank, 3 ms per database call), as one navigation:
 *   - per-route database-call budgets for the 30 most used pages (first visit and the next visit) and a time budget;
 *   - the frame's per-navigation work is bounded: drawn once by the section layouts and kept; each page adds only the
 *     session check and its own menu numbers (kept caches), nothing of the frame is sent again;
 *   - every page of a framed section uses AppShell, only redirects, or is a listed bare page;
 *   - data files (Learn, NAFS booklets / practice sets, ReadRise placement) are parsed once, not per request;
 *   - the shared building blocks: page reads shared per request (and dropped by writes), bank-wide figures kept while
 *     the bank is unchanged, QR codes and "password = username" checks not recomputed on every visit.
 * In-memory SQLite only — never a real database or real students.
 */
import { unhandled } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { bench, measureFrame, measureRoute, pageFiles, routeOf, routeTable, type Bench, type RouteRow } from "./helpers/route-bench";
import { ROOT } from "./helpers/db";
import { RequestReadRepo, newReadScope } from "../src/server/db/request-reads";
import { keptWhileUnchanged } from "../src/server/cache/kept";
import { noteWrite } from "../src/server/cache/bank-version";
import { qrMatrix, qrPath } from "../src/lib/qr";
import type { Repo } from "../src/server/seeding/repo";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** generous time limit for a slow CI machine (the call counts are exact properties of the code) */
const NEXT_MS = Number(process.env.SPEED_LIMIT_MS ?? 400);

/**
 * The 30 most used pages: each role's home and menu pages, practice, the class and student pages. Budget = the calls
 * measured after the r67 speed work (first visit / next visit), plus a quarter and 3 (other changes have room; an N+1
 * or a lost cache does not fit).
 */
const BUDGETS: Record<string, { first: number; next: number }> = {
  "src/app/student/page.tsx": { first: 178, next: 47 },
  "src/app/student/work/page.tsx": { first: 40, next: 40 },
  "src/app/student/map/page.tsx": { first: 61, next: 22 },
  "src/app/student/readrise/page.tsx": { first: 41, next: 30 },
  "src/app/student/reading/page.tsx": { first: 7, next: 7 },
  "src/app/student/curriculum/page.tsx": { first: 18, next: 18 },
  "src/app/student/tests/page.tsx": { first: 10, next: 10 },
  "src/app/student/reports/page.tsx": { first: 7, next: 7 },
  "src/app/student/badges/page.tsx": { first: 37, next: 37 },
  "src/app/student/learn/page.tsx": { first: 40, next: 13 },
  "src/app/practice/[skillId]/page.tsx": { first: 80, next: 43 },
  "src/app/teacher/page.tsx": { first: 50, next: 32 },
  "src/app/teacher/students/page.tsx": { first: 36, next: 41 },
  "src/app/teacher/students/[studentId]/page.tsx": { first: 171, next: 98 }, // r67: + effort, skill stars and the strands/mistakes insights on the student file; r87c: + the By Source report (+2 calls)
  "src/app/teacher/classes/[classId]/page.tsx": { first: 61, next: 53 },
  "src/app/teacher/assignments/page.tsx": { first: 11, next: 11 },
  // r67 (owner): the Reports hub shows the teacher's week in two lines (stars, reviews due, weakest skill, minutes): 12 calls
  "src/app/teacher/reports/page.tsx": { first: 18, next: 18 },
  "src/app/teacher/progress/page.tsx": { first: 38, next: 38 },
  "src/app/teacher/plans/page.tsx": { first: 31, next: 30 },
  "src/app/teacher/curriculum/page.tsx": { first: 63, next: 60 },
  "src/app/teacher/week/page.tsx": { first: 136, next: 66 },
  "src/app/teacher/map-center/page.tsx": { first: 36, next: 36 },
  "src/app/teacher/readrise/page.tsx": { first: 26, next: 26 },
  "src/app/admin/page.tsx": { first: 87, next: 51 },
  "src/app/admin/questions/page.tsx": { first: 16, next: 8 },
  "src/app/admin/school/page.tsx": { first: 17, next: 17 },
  "src/app/admin/users/page.tsx": { first: 22, next: 22 },
  "src/app/admin/analytics/page.tsx": { first: 31, next: 31 },
  "src/app/admin/diagnostic/page.tsx": { first: 67, next: 10 },
  "src/app/parent/page.tsx": { first: 35, next: 30 },
};

describe("⚡ performance budgets: real page renders on the speed-test school", () => {
  let b: Bench;
  const rows: RouteRow[] = [];
  before(async () => { b = await bench({ bigBank: Number(process.env.PERF_BANK ?? 0) }); });

  test("the 30 most used pages: database calls within budget, the next visit fast", async () => {
    const over: string[] = [];
    for (const [file, budget] of Object.entries(BUDGETS)) {
      const r = await measureRoute(b, file);
      assert.ok(r, file);
      rows.push(r);
      assert.ok(r.outcome === "ok", `${r.route}: ${r.outcome} ${r.detail ?? ""}`);
      if (r.coldCalls > budget.first || r.warmCalls > budget.next) over.push(`${r.route}: ${r.coldCalls}/${r.warmCalls} calls (budget ${budget.first}/${budget.next})`);
      assert.ok(r.warmMs < NEXT_MS, `${r.route}: next visit ${r.warmMs} ms`);
    }
    console.log(routeTable(rows));
    if (process.env.PERF_PRINT) console.log(rows.map((r) => `  "${r.file}": { first: ${r.coldCalls}, next: ${r.warmCalls} },`).join("\n"));
    assert.deepEqual(over, [], "over budget (an N+1 or a lost cache?)");
    assert.deepEqual(unhandled, [], "no stray rejected promise while rendering");
  });

  test("the frame's per-navigation work is bounded: drawn once by the section layout, each page adds the session check only", async () => {
    for (const role of ["student", "teacher", "admin", "parent"]) {
      // the short per-person caches (15–30 s, shared with the page's own reads) are refilled now and then: the usual visit
      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await measureFrame(b, role, `/${role}`));
      const page = runs.reduce((x, y) => (y.calls < x.calls ? y : x));
      assert.ok(page.calls <= 2, `${role}: ${page.calls} calls per navigation (the session + user, one round trip)`);
      assert.ok(page.clientKB <= 1, `${role}: ${page.clientKB} KB of frame per navigation`);
      const layout = await measureFrame(b, role, `/${role}`, "layout");
      assert.ok(layout.clientKB > 0, `${role}: the section layout draws the frame (${layout.clientKB} KB, once per section visit)`);
    }
    for (const s of ["admin", "teacher", "student", "parent"]) {
      const layout = read(`src/app/${s}/layout.tsx`);
      assert.match(layout, /<SectionFrame>\{children\}<\/SectionFrame>/, `${s}: the frame lives in the layout`);
      assert.equal((layout.match(/^export /gm) ?? []).length, 1, "a layout file exports only its component");
    }
    const shell = read("src/components/app-shell.tsx");
    assert.match(shell, /if \(isFramedPath\(pathname\)\) return <PageBody name=\{name\} framed>/, "inside a section AppShell draws only the page's part");
    assert.match(read("src/components/ui/side-nav.tsx"), /<Link href=\{i\.href\} aria-current/, "menu links prefetch the next page's loading frame");
    assert.match(read("src/app/globals.css"), /#main \.skeleton-top \{ display: none; \}/, "the Loading… skeleton shows inside the kept frame");
  });

  test("framed sections: every page uses AppShell, only redirects, or is a listed bare page", async () => {
    const { BARE_PAGES, FRAMED_SECTIONS, isFramedPath } = await import("../src/components/app-shell");
    const bad: string[] = [];
    for (const f of pageFiles()) {
      const route = routeOf(f);
      if (!FRAMED_SECTIONS.some((p) => route === p || route.startsWith(`${p}/`))) continue;
      const src = read(f);
      const sample = route.replace(/\[[^\]]+\]/g, "x");
      const bare = !isFramedPath(sample);
      if (bare) { assert.doesNotMatch(src, /<AppShell/, `${route} is bare: no AppShell`); continue; }
      if (/<AppShell/.test(src)) continue;
      if (/redirect\(/.test(src) && !/return \(/.test(src)) continue;
      bad.push(route);
    }
    assert.deepEqual(bad, [], "pages drawn without AppShell inside a framed section: add them to BARE_PAGES");
    assert.ok(BARE_PAGES.length >= 2);
    for (const p of ["/teacher/learn/G4.L1/print", "/student/writing/t1/write"]) assert.equal(isFramedPath(p), false, p);
    for (const p of ["/teacher", "/student/work", "/admin/questions", "/parent"]) assert.equal(isFramedPath(p), true, p);
    for (const p of ["/practice/abc", "/quiz/1", "/notifications", "/login"]) assert.equal(isFramedPath(p), false, p);
  });

  test("data files are parsed once, not on every request", async () => {
    const { readLessons, readTopics, readContinuum, readWordFiles } = await import("../src/server/learn/files");
    const { readBooklets } = await import("../src/server/nafs/booklets");
    const { readPracticeSets } = await import("../src/server/nafs/practice-sets");
    const { loadPlacementPassages } = await import("../src/server/readrise/content-loader");
    const loaders: [string, () => unknown][] = [["Learn lessons", readLessons], ["Learn topics", readTopics], ["Learn continuum", readContinuum], ["Learn words", readWordFiles],
      ["NAFS booklets", () => readBooklets()], ["NAFS practice sets", () => readPracticeSets()], ["ReadRise placement", () => loadPlacementPassages(ROOT)]];
    const parse = JSON.parse;
    let n = 0;
    for (const [name, load] of loaders) {
      const first = load();
      n = 0;
      JSON.parse = ((...a: Parameters<typeof JSON.parse>) => { n++; return parse(...a); }) as typeof JSON.parse;
      try {
        const again = load();
        assert.equal(n, 0, `${name}: parsed again`);
        assert.equal(again, first, `${name}: the same kept value`);
      } finally { JSON.parse = parse; }
    }
  });

  test("page reads are shared within one page render, dropped by a write, and never outside a render", async () => {
    const calls: string[] = [];
    const inner = b.S.repo as unknown as Repo;
    const spy = new Proxy(inner, { get(t, k) { const v = (t as unknown as Record<string | symbol, unknown>)[k]; return typeof v === "function" ? (...a: unknown[]) => { calls.push(String(k)); return (v as (...x: unknown[]) => unknown).apply(t, a); } : v; } });
    let scope = newReadScope();
    let inRender = true;
    const repo = new RequestReadRepo(spy, () => (inRender ? scope : null));
    const id = b.S.student.studentId!;
    const [a1, a2] = await Promise.all([repo.findUnique("Student", { id }), repo.findUnique("Student", { id })]);
    assert.deepEqual(a1, a2);
    assert.notEqual(a1, a2, "each caller gets its own copy");
    assert.equal(calls.filter((c) => c === "findUnique").length, 1, "one database read for both");
    const list1 = await repo.findMany("ClassMembership", { studentId: id });
    list1.length = 0; // a caller changing its answer never changes another's
    assert.ok((await repo.findMany("ClassMembership", { studentId: id })).length > 0);
    assert.equal(calls.filter((c) => c === "findMany").length, 1);
    await repo.updateMany("Student", { id }, { studentNumber: "S-PERF-1" });
    assert.equal((await repo.findUnique("Student", { id }))!.studentNumber, "S-PERF-1", "a read after a write sees it");
    assert.equal(calls.filter((c) => c === "findUnique").length, 2);
    inRender = false; // Server Actions, route handlers, jobs: straight through
    await repo.findUnique("Student", { id }); await repo.findUnique("Student", { id });
    assert.equal(calls.filter((c) => c === "findUnique").length, 4);
    scope = newReadScope();
    assert.match(read("src/server/auth/next.ts"), /export const repo = new RequestReadRepo\(new PrismaRepo\(db\), readScope\)/);
  });

  test("bank-wide figures are kept while the bank is unchanged and rebuilt at once after a write", async () => {
    const owner = {};
    let builds = 0;
    const load = async () => ({ n: ++builds, list: [3, 1, 2] });
    const a = await keptWhileUnchanged(owner, "k", ["Question"], 60_000, load);
    a.list.sort();
    const b2 = await keptWhileUnchanged(owner, "k", ["Question"], 60_000, load);
    assert.equal(builds, 1, "kept");
    assert.deepEqual(b2.list, [3, 1, 2], "callers get copies");
    noteWrite("Question");
    assert.equal((await keptWhileUnchanged(owner, "k", ["Question"], 60_000, load)).n, 2, "a write to the bank rebuilds it");
    for (const [f, fn] of [["src/server/questions/intelligence.ts", "intelligenceOverview"], ["src/server/map/map-more.ts", "mapLinks"], ["src/server/map/question-areas.ts", "savedCounts"], ["src/server/admin/question-requests.ts", "requestRows"], ["src/server/map/student-map.ts", "curriculumMapSkills"], ["src/server/diagnostic/test.ts", "diagnosticReadiness"]] as const) {
      assert.match(read(f), new RegExp(`${fn}[\\s\\S]{0,400}(keptWhileUnchanged|readinessKept)`), `${fn} is kept`);
    }
  });

  test("QR codes: the same matrix, a smaller drawing, not recomputed for the same text", () => {
    const text = "https://anjalplatform.onrender.com/login?u=demo.s1001";
    const g = qrMatrix(text), p = qrPath(text);
    const on = new Set<string>();
    for (const m of p.d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let k = 0; k < Number(m[3]); k++) on.add(`${Number(m[2]) - 4},${Number(m[1]) - 4 + k}`);
    const want = new Set<string>(); g.forEach((row, r) => row.forEach((v, c) => { if (v) want.add(`${r},${c}`); }));
    assert.deepEqual([...on].sort(), [...want].sort(), "every dark module drawn, nothing else");
    assert.equal(p.total, g.length + 8);
    const t = performance.now();
    for (let i = 0; i < 200; i++) qrPath(text);
    assert.ok(performance.now() - t < 50, "kept");
    assert.match(read("src/server/teacher/class-accounts.ts"), /passwordIsUsername\(s\(u\.username\), s\(u\.passwordHash\)\)/, "the scrypt check is remembered per (username, hash)");
  });

  test("no page file exports anything but Next page fields; no loading file is missing for the busiest sections", () => {
    for (const s of ["admin", "teacher", "student", "parent", "practice"]) {
      const f = join(ROOT, "src/app", s, "loading.tsx");
      assert.ok(statSync(f).isFile(), `${s}/loading.tsx`);
    }
    const allowed = /^export (default |const (metadata|dynamic|revalidate|viewport|fetchCache|runtime|preferredRegion|maxDuration)\b|(async )?function generate(Metadata|StaticParams|Viewport))/;
    const visit = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? visit(p) : n === "layout.tsx" ? [p] : []; });
    for (const f of visit(join(ROOT, "src/app"))) for (const line of readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("export "))) assert.match(line, allowed, `${relative(ROOT, f)}: ${line.slice(0, 80)}`);
  });
});
