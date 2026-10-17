/**
 * 🗺️⚡ r79 MAP speed + no white page (owner: "Same thing — the MAP page is VERY slow"). On a realistic MAP school
 * (tests/helpers/map-school.ts: one teacher with a Grade 4, 5 and 6 class of 25 students, every student of the school
 * with MAP scores in 3 terms and goal-area scores, the Learning Continuum, the bank classified on MAP, plan drafts,
 * Year plans with a week assigned, an automatic and a manual MAP test; 3 ms per database call):
 *   - every MAP tab and page is RENDERED for real and its database calls / rows stay within budget (first visit with
 *     empty caches, and the next visit 4 minutes later — before r79 the grade's MAP pools were kept 60 s, so nearly
 *     every click read the grade's whole bank again);
 *   - the main MAP actions (send a draft, send all, send a group plan, assign a Year plan week, send the Year plan,
 *     make a MAP test, assign a band group) work end to end within budget, and the page they lead to as well;
 *   - any failure of a MAP action comes back as a message (never a thrown error = never a white page), Next.js
 *     redirects still pass through;
 *   - the kept MAP data is rebuilt after new scores / bank edits, and stays small (registered caches with caps).
 * In-memory SQLite only — never a real database or real students.
 */
import { unhandled } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshStats } from "../scripts/perf/measuring-repo";
import { cacheSizes, clearCaches } from "../src/server/cache/idle";
import { noteWrite } from "../src/server/cache/bank-version";
import { groupPools, mapProfiles } from "../src/server/map/map-plan";
import { continuumIndex } from "../src/server/map/continuum";
import { schoolOverview } from "../src/server/map/nwea-reports";
import { mapSchool, type MapSchool } from "./helpers/map-school";
import { later, measureAll, renderView, runAction, table, views, type Measured } from "./helpers/map-measure";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const spOf = (to: string) => Object.fromEntries(new URL(to, "http://x").searchParams);
const pathOf = (to: string) => new URL(to, "http://x").pathname;

/**
 * Budgets: database calls on the first visit after a restart (empty caches) / the next visit 4 minutes later (nothing
 * written meanwhile), and rows read on that later visit. Measured after r79 plus some room. Before r79 (same fixture):
 * results 69/58 calls, 4 252 rows later · year 34/34, 1 884 · test page 88/88, 6 566 · study plan 68/66, 3 766 ·
 * class groups 59/59, 4 323 · admin overview 14/14, 6 095 (see the r79 commit for the whole table).
 */
const BUDGET: Record<string, { first: number; next: number; rows: number }> = {
  "results": { first: 42, next: 24, rows: 450 },
  "results (class 2)": { first: 30, next: 22, rows: 300 },
  "results LANGUAGE": { first: 30, next: 22, rows: 300 },
  "test": { first: 22, next: 22, rows: 450 },
  // r88: Automatic mode (the default since r86) rebuilds the plan from classNeeds() on every open; a kept-plan
  // cache (map-year-plan.makePlan, year-plan.ts) now makes a revisit within MAP_KEEP_MS nearly free (next/rows
  // stayed within the old budget), but the FIRST build is still classNeeds' own cost — raised, not re-architected.
  "year": { first: 80, next: 26, rows: 600 },
  "year preview": { first: 85, next: 32, rows: 650 },
  "reports": { first: 30, next: 21, rows: 450 },
  "reports overview": { first: 24, next: 14, rows: 150 },
  "plan (individual)": { first: 28, next: 28, rows: 600 },
  "plan group: class": { first: 36, next: 30, rows: 1200 },
  "admin results": { first: 24, next: 16, rows: 200 },
  "admin overview": { first: 18, next: 9, rows: 60 },
  "test page (auto)": { first: 95, next: 26, rows: 300 },
  "test page (manual)": { first: 95, next: 26, rows: 300 },
  "map-entry": { first: 22, next: 22, rows: 250 },
  "map-rit": { first: 25, next: 25, rows: 900 },
  "map-plans (redirect)": { first: 8, next: 8, rows: 100 },
  "map-reports (redirect)": { first: 8, next: 8, rows: 100 },
  "map-test (redirect)": { first: 8, next: 8, rows: 100 },
  "report: profile": { first: 26, next: 28, rows: 250 },
  "report: study plan": { first: 75, next: 36, rows: 800 },
  "report: family": { first: 34, next: 30, rows: 300 },
  "report: class profile": { first: 22, next: 22, rows: 900 },
  "report: class groups": { first: 65, next: 22, rows: 300 },
};
/** The first visit after a restart builds the grade's pools / continuum once (never twice). */
const FIRST_ROWS = 7500;

let M: MapSchool;
before(async () => { M = await mapSchool(); });

describe("⚡ r79 the MAP center: every tab and page within its database budget", () => {
  test("each tab / page: first visit (empty caches) and the next visit 4 minutes later", async () => {
    const rows = await measureAll(M);
    console.log(table(rows));
    const over: string[] = [];
    for (const { v, cold, warm } of rows) {
      assert.ok(cold.outcome === "ok" || cold.outcome === "redirect", `${v.name}: ${cold.outcome} ${cold.detail ?? ""}`);
      assert.equal(warm.outcome, cold.outcome, `${v.name}: ${warm.outcome} ${warm.detail ?? ""}`);
      const b = BUDGET[v.name];
      assert.ok(b, `a budget for ${v.name}`);
      if (cold.calls > b.first || warm.calls > b.next || warm.rows > b.rows || cold.rows > FIRST_ROWS) over.push(`${v.name}: ${cold.calls}/${warm.calls} calls, ${cold.rows}/${warm.rows} rows (budget ${b.first}/${b.next} calls, ${FIRST_ROWS}/${b.rows} rows)`);
    }
    assert.deepEqual(over, [], "over budget (an N+1, a whole-bank read per click, or a lost cache?)");
    assert.deepEqual(unhandled, [], "no stray rejected promise while rendering");
  });

  test("the plan tab computes only the view on screen (individual plans: no group suggestion)", async () => {
    clearCaches();
    const ind = views(M).find((v) => v.name === "plan (individual)")!;
    const r = await renderView(M, ind);
    assert.equal(r.outcome, "ok");
    assert.doesNotMatch(r.byModel, /StudentSkillMastery/, "the group suggestion (mastery of every student) is not made");
  });
});

/** An action, then the page it leads to (as the browser follows the redirect). */
async function actThenPage(file: string, name: string, args: unknown[], admin = false): Promise<{ a: Measured & { value?: unknown; error?: unknown }; page: Measured | null }> {
  const a = await runAction(M, file, name, args, admin);
  let page: Measured | null = null;
  if (a.to) {
    const path = pathOf(a.to);
    const v = path === "/teacher/map-center" ? views(M)[0] : path.startsWith("/teacher/map-center/test/") ? views(M).find((x) => x.name === "test page (auto)")! : path.startsWith("/map-report/class/") ? views(M).find((x) => x.name === "report: class groups")! : null;
    if (v) {
      const id = path.split("/").filter(Boolean)[3];
      page = await renderView(M, { ...v, path, sp: spOf(a.to), params: path.startsWith("/teacher/map-center/test/") ? { id } : v.params });
    }
  }
  return { a, page };
}
/** The page the teacher is on before pressing the button (fills the caches, as in real use). */
const openFirst = async (name: string) => { const r = await renderView(M, views(M).find((v) => v.name === name)!); assert.equal(r.outcome, "ok", `${name}: ${r.detail ?? ""}`); };
const form = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };
const C = "src/app/teacher/map-center/actions.ts", Y = "src/app/teacher/map-center/year-actions.ts", T = "src/app/teacher/map-center/test-actions.ts";

describe("🎯 r79 the main MAP actions: work end to end, within budget, back on the MAP page with the message", () => {
  const lines: string[] = [];
  const note = (n: string, a: Measured, page: Measured | null) => lines.push(`${n.padEnd(26)} action ${String(a.calls).padStart(4)} calls ${String(a.rows).padStart(6)} rows · page after ${page ? `${String(page.calls).padStart(4)} calls ${String(page.rows).padStart(6)} rows` : "—"}`);

  test("send one individual draft, then send all (Language Usage)", async () => {
    const c0 = M.classIds[0];
    const drafts = await M.b.S.repo.findMany("MapPlan", { classId: c0, status: "DRAFT", subject: "READING" }, { select: ["id"], take: 2 });
    // the teacher opens the individual plans, reads them for a few minutes, then presses Send (twice)
    await openFirst("plan (individual)");
    await later(4 * 60_000, async () => {
      // the first Send after a restart builds the grade's MAP pools once (kept for the next ones)
      const first = await actThenPage(C, "sendMapDraftAction", [form({ planId: String(drafts[0].id), classId: c0, subject: "READING" })]);
      assert.equal(first.a.error, null, String(first.a.detail));
      note("send a draft (first)", first.a, first.page);
      assert.ok(first.a.calls <= 95, `the first send: ${first.a.calls} calls`);
      const one = await actThenPage(C, "sendMapDraftAction", [form({ planId: String(drafts[1].id), classId: c0, subject: "READING" })]);
      assert.equal(one.a.error, null, String(one.a.detail));
      assert.match(spOf(one.a.to!).msg ?? "", /MAP plan sent/);
      assert.equal(spOf(one.a.to!).tab, "plan");
      assert.equal(one.page?.outcome, "ok", one.page?.detail ?? "");
      note("send a draft (next)", one.a, one.page);
      assert.ok(one.a.calls <= 45 && one.a.rows <= 600, `send one draft: ${one.a.calls} calls ${one.a.rows} rows`);
      const all = await actThenPage(C, "sendAllMapDraftsAction", [form({ classId: c0, subject: "LANGUAGE" })]);
      assert.equal(all.a.error, null, String(all.a.detail));
      assert.match(spOf(all.a.to!).msg ?? "", /Sent \d+ individual MAP plan/);
      note("send all drafts (25)", all.a, all.page);
      assert.ok(all.a.rows <= 6000 && all.a.calls <= 700, `send all: ${all.a.calls} calls ${all.a.rows} rows (no whole-bank read per draft; before r79 751 calls)`);
    });
  });

  test("send a group plan for the whole class (suggested again on the server)", async () => {
    const c0 = M.classIds[0];
    await openFirst("plan group: class");
    const r = await later(4 * 60_000, () => actThenPage(C, "sendMapPlanAction", [form({ classId: c0, who: "class", subject: "READING", title: "MAP plan", source: "MAP" })]));
    assert.equal(r.a.error, null, String(r.a.detail));
    assert.ok(r.a.to?.startsWith("/teacher/map-center?"), r.a.to ?? "");
    assert.ok(spOf(r.a.to!).msg, "a message");
    note("send group plan", r.a, r.page);
    assert.ok(r.a.rows <= 3000, `group plan: ${r.a.rows} rows`);
  });

  test("Year plan: assign this week (client call) and send it to the students", async () => {
    const c1 = M.classIds[1];
    const v = (await import("../src/server/map/year-plan")).yearPlanView;
    const plan = await v(M.b.S.repo, M.teacher, c1);
    const w = plan.weeks.find((x) => x.skills.some((k) => !k.assignedId))!;
    await renderView(M, { name: "year", file: "src/app/teacher/map-center/page.tsx", path: "/teacher/map-center", sp: { tab: "year", classId: c1 } });
    const a = await later(4 * 60_000, () => runAction(M, Y, "yearAssignWeekAction", [c1, w.week, false, "MAP"]));
    assert.equal(a.error, null, String(a.detail));
    assert.equal((a.value as { ok: boolean }).ok, true, JSON.stringify(a.value).slice(0, 200));
    note("year: assign this week", a, null);
    assert.ok(a.calls <= 90 && a.rows <= 3000, `assign this week: ${a.calls} calls ${a.rows} rows`);
    const s = await actThenPage(Y, "yearSendAction", [form({ classId: c1, on: "1" })]);
    assert.equal(s.a.error, null, String(s.a.detail));
    assert.equal(spOf(s.a.to!).tab, "year");
    note("year: send to students", s.a, s.page);
    // no source chosen: the r74 rule — refused with its message, never thrown
    const bad = await runAction(M, Y, "yearAssignWeekAction", [c1, w.week, false, null]);
    assert.equal(bad.error, null);
    assert.equal((bad.value as { ok: boolean }).ok, false);
  });

  test("make an automatic MAP test (and the test page after it)", async () => {
    const today = new Date().toISOString().slice(0, 10), in7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await openFirst("test page (auto)");
    const r = await later(4 * 60_000, () => actThenPage(T, "createMapTestAction", [form({ kind: "AUTO", subject: "READING", title: "Speed test", classIds: M.classIds[0], opensAt: today, closesAt: in7 })]));
    assert.equal(r.a.error, null, String(r.a.detail));
    assert.match(pathOf(r.a.to!), /^\/teacher\/map-center\/test\//);
    assert.equal(r.page?.outcome, "ok", r.page?.detail ?? "");
    note("make a MAP test", r.a, r.page);
    assert.ok((r.page?.rows ?? 0) <= 600, `the test page after it: ${r.page?.rows} rows`);
  });

  test("assign a band group of the Group Study Plan", async () => {
    const c0 = M.classIds[0];
    const { groupStudyPlan } = await import("../src/server/map/map-reports");
    const g = await groupStudyPlan(M.b.S.repo, M.teacher, c0, "READING");
    const area = g.areas.find((a) => a.bands.some((b) => b.students.length && b.skillIds.length))!;
    assert.ok(area, "a band group to assign");
    const band = area.bands.find((b) => b.students.length && b.skillIds.length)!;
    const f = form({ classId: c0, subject: "READING", group: area.group, low: String(band.low), high: String(band.high), student: band.students.map((x) => x.id), skill: band.skillIds.slice(0, 3), source: "MAP" });
    await openFirst("report: class groups");
    const r = await later(4 * 60_000, () => runAction(M, "src/app/map-report/actions.ts", "assignGroupAction", [f]));
    assert.equal(r.error, null, String(r.detail));
    assert.match(r.to ?? "", /^\/map-report\/class\//);
    assert.ok(spOf(r.to!).msg, "a message (sent, or why not)");
    note("assign a band group", r, null);
    console.log(lines.join("\n"));
  });
});

describe("🧯 r79 MAP actions never end on a white page", () => {
  test("an unknown failure comes back as a message (never thrown); known refusals keep their text", async () => {
    const c0 = M.classIds[0];
    const repo = M.b.S.m as unknown as Record<string, unknown>;
    const orig = repo.findMany as (...x: unknown[]) => Promise<unknown>;
    repo.findMany = (model: unknown, ...rest: unknown[]) => (model === "MapPlan" ? Promise.reject(new Error("Connection lost (simulated)")) : orig.call(M.b.S.m, model, ...rest));
    try {
      const a = await runAction(M, C, "sendAllMapDraftsAction", [form({ classId: c0, subject: "READING" })]);
      assert.equal(a.error, null, "an unknown error is never thrown to the page");
      assert.equal(spOf(a.to!).tab, "plan");
      assert.match(spOf(a.to!).msg ?? "", /Something went wrong/);
      assert.doesNotMatch(spOf(a.to!).msg ?? "", /Connection lost/, "no technical text for the teacher");
      const y = await runAction(M, Y, "yearEditAction", [c0, { op: "regenerate" }]);
      assert.equal(y.error, null);
      const yv = y.value as { ok: boolean; message?: string };
      assert.ok(yv.ok === true || /Something went wrong/.test(yv.message ?? ""), JSON.stringify(yv).slice(0, 200));
    } finally { repo.findMany = orig; }
    // known: a draft that does not exist
    const k = await runAction(M, C, "sendMapDraftAction", [form({ planId: "nope", classId: c0, subject: "READING" })]);
    assert.equal(k.error, null);
    assert.match(spOf(k.to!).msg ?? "", /Plan not found/);
    // known: a class of another teacher
    const other = (await M.b.S.repo.findMany("Class", {}, { select: ["id"] })).map((c) => String(c.id)).find((id) => !M.classIds.includes(id))!;
    const o = await runAction(M, C, "sendMapPlanAction", [form({ classId: other, who: "class", subject: "READING", source: "MAP" })]);
    assert.equal(o.error, null);
    assert.ok(spOf(o.to!).msg);
    // a client call (Year plan): an unknown error is { ok: false, message }
    const repo2 = M.b.S.m as unknown as Record<string, unknown>;
    const orig2 = repo2.findMany as (...x: unknown[]) => Promise<unknown>;
    repo2.findMany = (model: unknown, ...rest: unknown[]) => (model === "MapYearPlan" ? Promise.reject(new Error("timeout (simulated)")) : orig2.call(M.b.S.m, model, ...rest));
    try {
      const q = await runAction(M, Y, "yearAssignWeekAction", [c0, 1, false, "MAP"]);
      assert.equal(q.error, null);
      const qv = q.value as { ok: boolean; message?: string };
      assert.equal(qv.ok, false); assert.match(qv.message ?? "", /Something went wrong/);
    } finally { repo2.findMany = orig2; }
  });

  test("every MAP action file: unknown errors become messages, redirects pass through (source check)", () => {
    const files = ["src/app/teacher/map-center/actions.ts", "src/app/teacher/map-center/year-actions.ts", "src/app/teacher/map-center/test-actions.ts", "src/app/teacher/map-plans/actions.ts", "src/app/teacher/map-test/actions.ts", "src/app/teacher/map-skill-plan/actions.ts", "src/app/teacher/map-recommendations/actions.ts", "src/app/teacher/map-overview/actions.ts", "src/app/teacher/map-entry/actions.ts", "src/app/teacher/map-rit-actions.ts", "src/app/map-report/actions.ts"];
    let n = 0;
    for (const f of files) {
      const src = read(f);
      assert.match(src, /^"use server"/, f);
      assert.match(src, /action-guard/, `${f}: uses the shared guard`);
      assert.doesNotMatch(src.replace(/if \(isNextControl\(e\)\) throw e;/g, "").replace(/if \(!\(e instanceof ValidationError \|\| e instanceof ForbiddenError\)\) throw e; \}/g, ""), /\belse throw e\b|; throw e; \}/, `${f}: no action rethrows an unknown error (that is the white page)`);
      for (const m of src.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g)) {
        n++;
        const body = m[3], at = body.indexOf("requireActor(");
        if (at >= 0) assert.ok(at > body.search(/guardAction\(|guardCall\(|run\(|go\(|try \{/), `${f} ${m[1]}: the sign-in / permission check is inside the guard too`);
      }
      assert.doesNotMatch(src, /^export (const|let|var|class|function) /m, `${f}: a "use server" file exports async functions only`);
    }
    assert.ok(n >= 30, `${n} MAP actions checked`);
    const g = read("src/server/lib/action-guard.ts");
    assert.match(g, /log\("error"/); assert.match(g, /logError\(/); assert.match(g, /NEXT_REDIRECT/);
  });

  test("its own error page (EN + AR, retry + back to MAP), a light loading page, pending buttons", () => {
    for (const f of ["src/app/teacher/map-center/error.tsx", "src/app/teacher/map-entry/error.tsx", "src/app/teacher/map-rit/error.tsx", "src/app/teacher/map-assign/error.tsx"]) {
      const src = read(f);
      assert.match(src, /^"use client"/, f); assert.match(src, /<MapError /, f);
    }
    const err = read("src/components/map/map-error.tsx");
    assert.match(err, /reset\(\)/); assert.match(err, /href="\/teacher\/map-center"/);
    assert.ok(read("src/app/teacher/map-center/loading.tsx").length < 1500, "a light skeleton");
    for (const x of ["Something went wrong — try again", "Try again", "Back to MAP", "Your saved work is safe. Try again, or go back to MAP.", "Assigning…", "Sending…"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(x), `EN: ${x}`);
      assert.ok((ar as Record<string, string>)[x], `AR: ${x}`);
    }
    const btn = read("src/components/pending-button.tsx");
    assert.match(btn, /useFormStatus/); assert.match(btn, /disabled=\{pending\}/);
    assert.match(read("src/app/teacher/map-center/plan-tab.tsx"), /<PendingButton[^>]*label="Send to \{name\}"[^>]*pendingLabel="Sending…"/);
    assert.match(read("src/app/teacher/map-center/plan-tab.tsx"), /<PendingButton[^>]*label="Send all \{n\} plans"/);
    assert.match(read("src/components/plans/plan-builder.tsx"), /<PendingButton formAction=\{p\.send\}[^>]*pendingLabel="Sending…"/);
    assert.match(read("src/app/teacher/map-center/year-tab.tsx"), /<PendingButton[\s\S]{0,300}pendingLabel=/);
    assert.match(read("src/app/teacher/map-center/test-page.tsx"), /<PendingButton[^>]*pendingLabel="Assigning…"/);
    assert.match(read("src/components/map/year-plan-board.tsx"), /t\("Assigning…"\)/);
  });
});

describe("🧠 r79 the kept MAP data: one build, rebuilt after a change, small", () => {
  test("the grade's pools and the continuum: kept for minutes, rebuilt after a bank / continuum edit (any path)", async () => {
    const m = M.b.S.m, school = M.teacher.schoolId!;
    clearCaches();
    m.stats = freshStats();
    const [a, b2] = await Promise.all([groupPools(m, school, 4), groupPools(m, school, 4)]);
    assert.equal(a, b2, "concurrent reads share one build");
    assert.ok(m.stats.calls > 5);
    m.stats = freshStats();
    assert.equal(await later(4 * 60_000, () => groupPools(m, school, 4)), a, "kept 4 minutes later when nothing changed");
    assert.equal(m.stats.calls, 0);
    noteWrite("Question");
    assert.notEqual(await groupPools(m, school, 4), a, "built again after a question edit");
    assert.notEqual(await later(6 * 60_000, () => groupPools(m, school, 4)), a, "and at most 5 minutes (other processes)");
    const ix = await continuumIndex(m, school, 4, "READING");
    assert.equal(await continuumIndex(m, school, 4, "READING"), ix);
    noteWrite("LearningStatement");
    assert.notEqual(await continuumIndex(m, school, 4, "READING"), ix, "a new continuum import builds it again");
  });

  test("the class's MAP profiles and the school overview: rebuilt after new MAP scores; callers get their own copy", async () => {
    const m = M.b.S.m, school = M.teacher.schoolId!;
    const ids = M.studentIds.slice(0, 25);
    const p1 = await mapProfiles(m, school, ids, "READING");
    p1.get(ids[0])!.areas.length = 0; // a caller changing its copy never changes the kept one
    m.stats = freshStats();
    const p2 = await mapProfiles(m, school, ids, "READING");
    assert.equal(m.stats.calls, 0, "kept");
    assert.ok(p2.get(ids[0])!.areas.length > 0, "its own copy");
    const before = p2.get(ids[0])!.overall!.rit;
    await M.b.S.repo.create("MapResult", { studentId: ids[0], subject: "Reading", termName: "Fall 2026-2027", testDate: new Date("2026-09-25T08:00:00Z"), rit: 240, importedAt: new Date(), goalName: null });
    assert.equal((await mapProfiles(m, school, ids, "READING")).get(ids[0])!.overall!.rit, 240, `new scores are seen at once (was ${before})`);
    const o1 = await schoolOverview(m, M.admin, "READING");
    m.stats = freshStats();
    await schoolOverview(m, M.admin, "READING");
    assert.equal(m.stats.calls, 0, "the overview is kept");
    assert.ok(o1.terms.includes("Fall 2026-2027"));
  });

  test("small: every MAP cache is registered with the idle sweep and capped", async () => {
    await measureAll(M, { laterMs: 60_000 });
    const sizes = new Map(cacheSizes().map((x) => [x.name, x.size]));
    const caps: Record<string, number> = { "map.map-plan.poolCache": 8, "map.map-plan.profiles": 24, "map.continuum.index": 9, "map.continuum.has": 4, "map.recommend.areaSkills": 8, "map.nwea-reports.overview": 8, "map.year-plan.lessons": 12, "map.map-reports.anchors": 4 };
    for (const [name, cap] of Object.entries(caps)) {
      assert.ok(sizes.has(name), `${name} is registered with the idle sweep`);
      assert.ok(sizes.get(name)! <= cap, `${name}: ${sizes.get(name)} entries (cap ${cap})`);
    }
    const src = read("src/server/map/map-cache.ts");
    assert.match(src, /sweptWeakMap</); assert.match(src, /while \(m\.size > max\)/);
  });
});
