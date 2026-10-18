/**
 * 🇸🇦⚡ r78 NAFS speed + no white page (owner: "the NAFS menu is VERY slow; after Assign in Suggested plan a WHITE PAGE
 * appears"). On a realistic Grade 6 school (tests/helpers/nafs-school.ts: 25 students per class, 4 NAFS tests handed in,
 * 3 adaptive practices with answers, the Ministry booklets and practice sets in the bank, 3 ms per database call):
 *   - every NAFS center tab is RENDERED for real and its database calls / rows stay within budget (first visit with
 *     empty caches, and the next visit);
 *   - "Assign adaptive practice now" from the Suggested plan (a student and the whole class) works end to end: the
 *     practice is saved, the teacher is sent back to the plan with the success message, and the plan page that follows
 *     stays within budget;
 *   - any failure of a NAFS action comes back as a message on the page (never a thrown error = never a white page),
 *     Next.js redirects still pass through;
 *   - the NAFS center has its own error page (EN + AR, retry + back link) and a light loading page; the assign buttons
 *     show "Assigning…" and are disabled while the request runs.
 * In-memory SQLite only — never a real database or real students.
 */
import { inRequest, isRedirect, renderPage, unhandled } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshStats } from "../scripts/perf/measuring-repo";
import { cacheSizes, clearCaches } from "../src/server/cache/idle";
import { noteWrite } from "../src/server/cache/bank-version";
import { nafsBankChanged, nafsIndex } from "../src/server/nafs/bank";
import { nafsDashboardCached } from "../src/server/nafs/dashboard";
import { createNafsPractice, deleteNafsPractice } from "../src/server/nafs/practice";
import { nafsSchool, type NafsSchool } from "./helpers/nafs-school";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const settle = () => new Promise((r) => setTimeout(r, 30));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadPage = () => require(join(ROOT, "src/app/teacher/nafs/page.tsx")) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const actions = () => require(join(ROOT, "src/app/teacher/nafs/actions.ts")) as Record<string, (f: FormData) => Promise<unknown>>;

/** The tabs (and their inner views) of the NAFS center, as the teacher opens them. */
const TABS: Record<string, Record<string, string>> = {
  "adaptive": { tab: "adaptive" },
  "adaptive/report": { tab: "adaptive", sub: "report" },
  "test": { tab: "test" },
  "test/report": { tab: "test", sub: "report" },
  "booklets": { tab: "booklets" },
  "booklets/report": { tab: "booklets", sub: "report" },
  "reports": { tab: "reports" },
  "reports/detail": { tab: "reports", view: "detail" },
  "reports/compare": { tab: "reports", view: "compare" },
  "plan": { tab: "plan" },
  "bank": { tab: "bank" },
  "marking": { tab: "marking" },
};
/**
 * Budgets: database calls on the first visit after a restart (empty caches) / the next visit 4 minutes later (nothing
 * written meanwhile), and rows read on that later visit. Measured after r78 plus some room. Before r78 the later visit
 * read the whole linked bank again on 9 of the 12 views (plan: 44 calls, 11 166 rows; bank: 48 calls, 14 206 rows),
 * because the NAFS index and the reports were kept only one minute.
 */
const BUDGET: Record<string, { first: number; next: number; rows: number }> = {
  "adaptive": { first: 35, next: 20, rows: 400 },
  "adaptive/report": { first: 25, next: 22, rows: 500 },
  "test": { first: 20, next: 18, rows: 300 },
  "test/report": { first: 55, next: 36, rows: 800 },
  "booklets": { first: 36, next: 20, rows: 300 },
  "booklets/report": { first: 36, next: 20, rows: 300 },
  "reports": { first: 42, next: 18, rows: 300 },
  "reports/detail": { first: 42, next: 18, rows: 300 },
  "reports/compare": { first: 44, next: 28, rows: 900 },
  "plan": { first: 42, next: 18, rows: 300 },
  "bank": { first: 34, next: 18, rows: 400 },
  "marking": { first: 30, next: 30, rows: 1200 },
};
/** The first visit after a restart builds the school's NAFS index once (the whole linked bank): never twice. */
const FIRST_ROWS = 12500;

interface Measured { calls: number; rows: number; outcome: string; detail?: string; byModel: string }

let N: NafsSchool;
async function render(sp: Record<string, string>): Promise<Measured> {
  await settle();
  const m = N.b.S.m;
  m.stats = freshStats();
  const r = await renderPage(loadPage, { path: "/teacher/nafs", cookies: N.cookie, searchParams: sp });
  const calls = m.stats.calls, rows = m.stats.rows;
  const byModel = [...m.stats.byModel].sort((a, b) => b[1].calls - a[1].calls).slice(0, 12).map(([k, v]) => `${k} ${v.calls}/${v.rows}`).join(", ");
  for (const f of r.after) await Promise.resolve(f()).catch(() => null);
  return { calls, rows, outcome: r.outcome, detail: r.detail, byModel };
}

/** Runs fn as if `ms` had passed (the caches' clocks read Date.now). */
async function later<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const real = Date.now;
  Date.now = () => real() + ms;
  try { return await fn(); } finally { Date.now = real; }
}

/** A Server Action as one request (the teacher's cookies): its redirect target, or what it returned. */
async function act(name: string, form: FormData): Promise<{ to: string | null; error: unknown; calls: number; rows: number }> {
  await settle();
  const m = N.b.S.m;
  m.stats = freshStats();
  let to: string | null = null, error: unknown = null;
  await inRequest({ path: "/teacher/nafs", cookies: N.cookie }, async () => {
    try { await actions()[name](form); } catch (e) { if (isRedirect(e)) to = e.to; else error = e; }
  });
  return { to, error, calls: m.stats.calls, rows: m.stats.rows };
}
const spOf = (to: string) => Object.fromEntries(new URL(to, "http://x").searchParams);
const planForm = (opts: { codes: string[]; sids?: string[]; back?: string; classId?: string; title?: string }) => {
  const f = new FormData();
  f.set("title", opts.title ?? "NAFS plan: S04 · S05");
  f.set("classId", opts.classId ?? N.classId);
  f.set("back", opts.back ?? `/teacher/nafs?tab=plan&class=${N.classId}`);
  for (const c of opts.codes) f.append("target", c);
  for (const s of opts.sids ?? []) f.append("sid", s);
  return f;
};

before(async () => { N = await nafsSchool(); loadPage(); actions(); });

describe("⚡ r78 the NAFS center: every tab within its database budget", () => {
  test("each tab and view: first visit (empty caches) and next visit", async () => {
    const lines: string[] = [], over: string[] = [];
    for (const [name, sp] of Object.entries(TABS)) {
      clearCaches();
      const cold = await render(sp);
      // the next click some minutes later (nothing written meanwhile): before r78 every cache had expired after 60 s
      const warm = await later(4 * 60_000, () => render(sp));
      assert.equal(cold.outcome, "ok", `${name}: ${cold.outcome} ${cold.detail ?? ""}`);
      assert.equal(warm.outcome, "ok", `${name}: ${warm.outcome} ${warm.detail ?? ""}`);
      lines.push(`${name.padEnd(16)} first ${String(cold.calls).padStart(3)} calls ${String(cold.rows).padStart(6)} rows · 4 min later ${String(warm.calls).padStart(3)} calls ${String(warm.rows).padStart(6)} rows   [${warm.byModel}]`);
      const b = BUDGET[name];
      if (cold.calls > b.first || warm.calls > b.next || warm.rows > b.rows || cold.rows > FIRST_ROWS) over.push(`${name}: ${cold.calls}/${warm.calls} calls, ${cold.rows}/${warm.rows} rows (budget ${b.first}/${b.next} calls, ${FIRST_ROWS}/${b.rows} rows)`);
    }
    console.log(lines.join("\n"));
    assert.deepEqual(over, [], "over budget (an N+1, a whole-bank read per request, or a lost cache?)");
    assert.deepEqual(unhandled, [], "no stray rejected promise while rendering");
  });
});

describe("🎯 r78 Suggested plan → Assign adaptive practice now: works, comes back to the plan with the message", () => {
  test("a student: saved, redirected to the plan with the success message; the plan page renders within budget", async () => {
    const codes = ["MOE.S04", "MOE.S05"];
    // the teacher opens the plan, reads it for a few minutes, then presses Assign (the action + the plan drawn again)
    clearCaches();
    assert.equal((await render({ tab: "plan", class: N.classId })).outcome, "ok");
    const { r, page } = await later(4 * 60_000, async () => {
      const r = await act("createPracticeAction", planForm({ codes, sids: [N.studentIds[0]] }));
      return { r, page: r.to ? await render(spOf(r.to)) : null };
    });
    assert.equal(r.error, null, String((r.error as Error)?.stack ?? r.error));
    assert.ok(r.to?.startsWith(`/teacher/nafs?tab=plan&class=${N.classId}`), String(r.to));
    assert.match(spOf(r.to!).msg ?? "", /Given to 1 student/);
    const p = (await N.b.S.repo.findMany("NafsPractice", { classId: N.classId }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 1 }))[0];
    assert.deepEqual(JSON.parse(JSON.stringify(p.studentIds)), [N.studentIds[0]]);
    assert.ok(page);
    assert.equal(page.outcome, "ok", page.detail ?? "");
    console.log(`assign (student): action ${r.calls} calls ${r.rows} rows · plan page after ${page.calls} calls ${page.rows} rows`);
    assert.ok(page.rows <= 2000, `the plan page after the assign: ${page.rows} rows`);
    assert.ok(r.calls <= 20, `the assign itself: ${r.calls} calls`);
    assert.ok(r.rows <= 500, `the assign itself: ${r.rows} rows (no whole-bank read)`);
    assert.ok(r.calls + page.calls <= 55, `assign + the plan page: ${r.calls + page.calls} calls`);
  });

  test("the whole class: saved for every student, back on the plan with the message", async () => {
    const r = await act("createPracticeAction", planForm({ codes: ["MOE.S04"] }));
    assert.equal(r.error, null, String(r.error));
    assert.match(spOf(r.to!).msg ?? "", new RegExp(`Given to ${N.studentIds.length} student`));
    assert.equal(spOf(r.to!).tab, "plan");
    const page = await render(spOf(r.to!));
    assert.equal(page.outcome, "ok", page.detail ?? "");
  });

  test("a failing assign comes back as a message on the plan (never thrown): known and unknown errors", async () => {
    // known: no standards chosen
    const a = await act("createPracticeAction", planForm({ codes: [] }));
    assert.equal(a.error, null);
    assert.equal(spOf(a.to!).tab, "plan");
    assert.match(spOf(a.to!).msg ?? "", /Choose at least one/);
    // unknown: the database fails in the middle of the save
    const repo = N.b.S.m as unknown as Record<string, unknown>;
    const orig = repo.create as (...x: unknown[]) => Promise<unknown>;
    repo.create = (model: unknown, ...rest: unknown[]) => (model === "NafsPractice" ? Promise.reject(new Error("Connection lost (simulated)")) : orig.call(N.b.S.m, model, ...rest));
    try {
      const b = await act("createPracticeAction", planForm({ codes: ["MOE.S04"] }));
      assert.equal(b.error, null, "an unknown error is never thrown to the page");
      assert.equal(spOf(b.to!).tab, "plan");
      assert.match(spOf(b.to!).msg ?? "", /Something went wrong/);
      assert.doesNotMatch(spOf(b.to!).msg ?? "", /Connection lost/, "no technical text for the teacher");
    } finally { repo.create = orig; }
    // a class of another teacher: refused with a message
    const other = (await N.b.S.repo.findMany("Class", {}, { select: ["id"] })).map((c) => String(c.id)).find((id) => id !== N.classId)!;
    const c = await act("createPracticeAction", planForm({ codes: ["MOE.S04"], classId: other }));
    assert.equal(c.error, null);
    assert.ok(spOf(c.to!).msg);
  });

  test("every NAFS form action: an unknown error becomes a message, redirects pass through (source check)", () => {
    const src = read("src/app/teacher/nafs/actions.ts");
    assert.doesNotMatch(src.replace(/if \(isNextControl\(e\)\) throw e;/g, ""), /throw e\b/, "no action rethrows an unknown error (that is the white page)");
    assert.match(src, /isNextControl\(e\)\) throw e/, "Next.js redirects pass through");
    assert.match(src, /logError\(/);
    assert.match(src, /log\("error"/, "failures are logged");
    let n = 0;
    for (const m of src.matchAll(/export async function (\w+)\(form: FormData\): Promise<void> \{([\s\S]*?)\n\}/g)) {
      n++;
      assert.match(m[2], /await guard\(|if \(isNextControl\(e\)\) throw e; msg = await messageOf\(/, `${m[1]}: wrapped so any error comes back as a message`);
      const at = m[2].indexOf("requireActor(");
      if (at >= 0) assert.ok(at > m[2].search(/guard\(|try \{/), `${m[1]}: the sign-in / permission check is inside the guard too`);
    }
    assert.ok(n >= 12, `${n} form actions checked`);
    assert.doesNotMatch(src, /^export (const|let|var|class|function) /m, "a \"use server\" file exports async functions only");
  });
});

describe("🧠 r78 the kept NAFS data: one build, dropped by edits, small", () => {
  test("the school's NAFS index: concurrent reads share one build; kept until a question / tag edit (any path)", async () => {
    const repo = N.b.S.repo, school = N.g6.schoolId!;
    clearCaches();
    const m = N.b.S.m;
    m.stats = freshStats();
    const [a, b2, c] = await Promise.all([nafsIndex(m, school), nafsIndex(m, school), nafsIndex(m, school)]);
    assert.ok(a === b2 && b2 === c, "one build shared");
    const oneBuild = m.stats.calls;
    m.stats = freshStats();
    assert.equal(await later(4 * 60_000, () => nafsIndex(m, school)), a, "kept for minutes when nothing changed");
    assert.equal(m.stats.calls, 0);
    noteWrite("Question"); // an edit through the app's data layer (the editor, an import, the AI bank …)
    const after = await nafsIndex(m, school);
    assert.notEqual(after, a, "built again after a question edit");
    noteWrite("NafsBankItem");
    assert.notEqual(await nafsIndex(m, school), after, "built again after a NAFS tag edit");
    nafsBankChanged(repo, school);
    assert.ok(oneBuild > 5);
    assert.deepEqual(cacheSizes().filter((x) => x.name === "nafs.bank.cache").every((x) => x.size <= 8), true, "a few schools at most");
  });

  test("the reports behind Reports / Suggested plan: kept after a new practice, built again after an answer or a removal", async () => {
    const m = N.b.S.m;
    const d1 = await nafsDashboardCached(m, N.g6, { classId: N.classId });
    const p = await createNafsPractice(N.b.S.repo, N.g6, { title: "Cache check", targets: ["MOE.S04"], classId: N.classId });
    assert.equal(await later(3 * 60_000, () => nafsDashboardCached(m, N.g6, { classId: N.classId })), d1, "a new practice (no answers yet) keeps the plan");
    noteWrite("NafsPracticeAnswer");
    const d2 = await nafsDashboardCached(m, N.g6, { classId: N.classId });
    assert.notEqual(d2, d1, "a student's answer builds it again");
    await deleteNafsPractice(N.b.S.repo, N.g6, p.id);
    assert.notEqual(await nafsDashboardCached(m, N.g6, { classId: N.classId }), d2, "a removed practice leaves the reports");
  });

  test("a NAFS plan from Plans is NAFS work: its Source is set automatically (never refused for a missing one)", () => {
    // r82 (owner): every program plan's source is its program (NAFS → NAFS, RTI → RTI, MAP → MAP, Curriculum → Curriculum)
    assert.match(read("src/server/plans/send.ts"), /const source = planSource\(input\.program, input\.source\);/);
    assert.match(read("src/server/plans/editor.ts"), /const source = planSource\(program, sourceIn\);/);
    assert.match(read("src/server/plans/batch-send.ts"), /if \(program\) return program;/);
  });
});

describe("🧯 r78 the NAFS center never shows a white page", () => {
  test("its own error page (EN + AR, retry + back to the center) and a light loading page", () => {
    const err = read("src/app/teacher/nafs/error.tsx");
    assert.match(err, /^"use client"/);
    assert.match(err, /reset\(\)/);
    assert.match(err, /href="\/teacher\/nafs"/);
    const loading = read("src/app/teacher/nafs/loading.tsx");
    assert.ok(loading.length < 2000, "a light skeleton");
    for (const x of ["Something went wrong — try again", "Try again", "Back to NAFS", "Assigning…"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(x), `EN: ${x}`);
      assert.ok((ar as Record<string, string>)[x], `AR: ${x}`);
    }
  });

  test("the assign buttons show a pending state and cannot be pressed twice", () => {
    // r79: the button is shared (NAFS and MAP); the NAFS path re-exports it
    assert.match(read("src/components/nafs/pending-button.tsx"), /export \{ PendingButton \} from "\.\.\/pending-button"/);
    const btn = read("src/components/pending-button.tsx");
    assert.match(btn, /^"use client"/);
    assert.match(btn, /useFormStatus/);
    assert.match(btn, /disabled=\{pending\}/);
    assert.match(read("src/components/nafs/plan-tab.tsx"), /<PendingButton[\s\S]*Assigning…/);
  });
});
