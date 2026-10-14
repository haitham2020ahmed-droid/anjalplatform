/**
 * 🇸🇦 The NAFS center's Home tab: a quick summary — tests open online now, adaptive practice open now, written answers
 * waiting for marking, the classes' weakest Ministry standard (from every NAFS result), and the center's questions by
 * difficulty. Bounded: the lists below are the same capped reads the other tabs use.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { assertNafs } from "../teacher/nafs-access";
import { DIFFICULTIES, MOE_BY_CODE, type Difficulty } from "./framework";
import { nafsIndex, usable } from "./bank";
import { markingQueue, nafsClasses } from "./tests";
import { nafsAcrossReport } from "./reports";
import { listNafsPractice } from "./practice";

const s = (v: unknown) => String(v ?? "");

/**
 * The center's tabs, in the owner's order (r69 reorganisation; About NAFS is a small link at the top). Each of the first
 * three holds its OWN report inside (one place each, no duplicates):
 *   1. Adaptive          — Practice (give adaptive practice) · Report (per class, student, standard / skill: level
 *                          reached Easy / Medium / Hard, accuracy, mastery, time, trend; one practice in detail)
 *   2. NAFS test         — Create (the one builder + the tests) · Report (one test, all tests, progress, one student,
 *                          item analysis, distractors, export)
 *   3. Ministry booklets — the 100 model booklets: open one (passage + questions + answers), assign one or several
 *                          (online or print), a Report per booklet
 *   4. Reports           — the overall picture of EVERYTHING the students did in NAFS (the old Dashboard merged in) · Compare (up or down)
 *   5. Suggested plan    — from the reports: the weakest standards per class / group / student, one-click assign
 *   then Question bank and Marking (still needed: the bank behind every tool; written answers + bubble sheets).
 */
export const CENTER_TABS = [
  { key: "adaptive", label: "Adaptive" },
  { key: "test", label: "NAFS test" },
  { key: "booklets", label: "Ministry booklets" },
  { key: "reports", label: "Reports" },
  { key: "plan", label: "Suggested plan" },
  { key: "bank", label: "Question bank" },
  { key: "marking", label: "Marking" },
] as const;
export type CenterTab = (typeof CENTER_TABS)[number]["key"];

/** The sub-tabs inside a tab (the first is the default). */
export const SUB_TABS: Partial<Record<CenterTab, readonly { key: string; label: string }[]>> = {
  adaptive: [{ key: "practice", label: "Practice" }, { key: "report", label: "Report" }],
  test: [{ key: "create", label: "Create" }, { key: "report", label: "Report" }],
  booklets: [{ key: "list", label: "Booklets" }, { key: "report", label: "Report" }],
};
/**
 * The views inside 4. Reports (?view=): the overview, the full detail (the old Dashboard) and COMPARE (r75: did the
 * students go up or down — Tests & Booklets · Practice · All; ?mode=tests|practice|all).
 */
export const REPORT_VIEWS = [{ key: "", label: "Overview" }, { key: "detail", label: "Full detail" }, { key: "compare", label: "Compare" }] as const;
export const subOf = (tab: string, sub: string | null | undefined): string => {
  const list = SUB_TABS[tab as CenterTab];
  return list?.find((x) => x.key === sub)?.key ?? list?.[0]?.key ?? "";
};
export const centerHref = (tab: CenterTab, extra: Record<string, string | string[] | null | undefined> = {}): string => {
  const q = new URLSearchParams([["tab", tab]]);
  for (const [k, v] of Object.entries(extra)) for (const x of Array.isArray(v) ? v : [v]) if (x !== null && x !== undefined && x !== "") q.append(k, x);
  return `/teacher/nafs?${q}`;
};

/** Old tab keys → the tab that holds the capability now (links keep working). */
export const OLD_TABS: Record<string, string> = { sheets: "marking", create: "test", tests: "test", practice: "adaptive", home: "reports", dashboard: "reports" };

/**
 * The new address of an old center link (null = it is a current link). Every old link still works:
 *   home → Reports · dashboard → Reports (the detail view) · practice → Adaptive (?open= → its Report) ·
 *   tests / create → NAFS test · sheets → Marking#sheets · reports?view=test|across|trend|student or ?test= →
 *   NAFS test → Report · reports?view=practice → Adaptive → Report.
 */
export function centerRedirect(sp: Record<string, string | string[] | undefined>): string | null {
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const keep = (drop: string[] = []) => Object.entries(sp).filter(([k, v]) => k !== "tab" && !drop.includes(k) && v !== undefined).flatMap(([k, v]) => (Array.isArray(v) ? v : [v as string]).map((x) => [k, x] as [string, string]));
  const to = (pairs: [string, string][], hash = "") => `/teacher/nafs?${new URLSearchParams(pairs)}${hash}`;
  if (tab === "sheets") return to([["tab", "marking"], ...keep()], "#sheets");
  if (tab === "practice") return sp.open ? to([["tab", "adaptive"], ["sub", "report"], ...keep()]) : to([["tab", "adaptive"], ...keep()]);
  if (tab === "tests" || tab === "create") return to([["tab", "test"], ...keep()]);
  if (tab === "home") return to([["tab", "reports"], ...keep()]);
  if (tab === "dashboard") return to([["tab", "reports"], ["view", "detail"], ...keep(["view"])]);
  if (tab === "reports") {
    if (sp.sub === "compare" && sp.view !== "compare") return to([["tab", "reports"], ["view", "compare"], ...keep(["sub", "view"])]);
    if (sp.view === "practice") return to([["tab", "adaptive"], ["sub", "report"], ...(typeof sp.practice === "string" ? [["open", sp.practice] as [string, string]] : []), ...keep(["view", "practice"])]);
    if (sp.view === "test" || sp.view === "across" || sp.view === "trend" || sp.view === "student" || (sp.test && sp.view !== "detail")) return to([["tab", "test"], ["sub", "report"], ...keep()]);
  }
  return null;
}

/**
 * The ONE NAFS test builder's link. The old six modes (?mode=FULL · SIMULATION · MINISTRY · AUTO · MANUAL · AI) are
 * the builder's three starts now; an old link is redirected to the matching start (other parameters kept).
 */
export const LEGACY_MODE_START: Record<string, { start: "BOOKLET" | "ALL" | "CHOOSE"; shape?: "BOOKLET"; add?: "BANK" | "AI" }> = {
  FULL: { start: "ALL" }, MINISTRY: { start: "BOOKLET" }, SIMULATION: { start: "CHOOSE", shape: "BOOKLET" },
  AUTO: { start: "CHOOSE" }, MANUAL: { start: "CHOOSE", add: "BANK" }, AI: { start: "CHOOSE", add: "AI" },
};
export function builderHref(p: { start?: string | null; purpose?: string | null; codes?: string[] | null; classId?: string | null; id?: string | null; shape?: string | null; add?: string | null }): string {
  const q = new URLSearchParams();
  if (p.id) q.set("id", p.id);
  if (p.start) q.set("start", p.start);
  if (p.shape) q.set("shape", p.shape);
  if (p.add) q.set("add", p.add);
  if (p.purpose === "PRACTICE") q.set("purpose", "PRACTICE");
  if (p.classId) q.set("class", p.classId);
  if (p.codes?.length) q.set("codes", p.codes.join(","));
  const s = q.toString();
  return `/teacher/nafs/tests/new${s ? `?${s}` : ""}`;
}
/** The new address of an old builder link (null = nothing to redirect). */
export function legacyBuilderRedirect(sp: Record<string, string | undefined>): string | null {
  if (!sp.mode || sp.start) return null;
  const to = LEGACY_MODE_START[String(sp.mode).toUpperCase()] ?? { start: "CHOOSE" as const };
  return builderHref({ id: sp.id, start: to.start, shape: to.shape, add: to.add, purpose: sp.purpose, classId: sp.class, codes: sp.codes ? sp.codes.split(",") : null });
}

export interface CenterSummary {
  openTests: number; openPractice: number; waiting: number;
  weakest: { code: string; short: string; text: string; pct: number | null } | null;
  questions: number; byDifficulty: Record<Difficulty, number>; classes: number;
}

export async function nafsHomeSummary(repo: Repo, actor: Actor, now = new Date()): Promise<CenterSummary> {
  await assertNafs(repo, actor);
  const classes = await nafsClasses(repo, actor);
  const ids = classes.map((c) => c.id);
  const [given, practice, queue, idx, across] = await Promise.all([
    ids.length ? repo.findMany("NafsTestClass", { classId: { in: ids } }, { select: ["testId", "dueAt", "openAt"], take: 500 }) : Promise.resolve([]),
    listNafsPractice(repo, actor, now),
    markingQueue(repo, actor).catch(() => ({ items: [], waiting: 0 })),
    nafsIndex(repo, actor.schoolId ?? ""),
    ids.length ? nafsAcrossReport(repo, actor, null).catch(() => null) : Promise.resolve(null),
  ]);
  const live = given.length ? new Set((await repo.findMany("NafsTest", { id: { in: [...new Set(given.map((g) => s(g.testId)))] }, deletedAt: null }, { select: ["id"] })).map((t) => s(t.id))) : new Set<string>();
  const openTests = given.filter((g) => live.has(s(g.testId)) && !(g.dueAt && new Date(String(g.dueAt instanceof Date ? g.dueAt.toISOString() : g.dueAt)) <= now)).length;
  const pool = idx.filter(usable);
  const byDifficulty = Object.fromEntries(DIFFICULTIES.map((k) => [k, pool.filter((e) => e.difficulty === k).length])) as Record<Difficulty, number>;
  const code = across?.summary.weakest[0] ?? null;
  const row = code ? across!.summary.standards.find((x) => x.key === code) : undefined;
  return {
    openTests, openPractice: practice.filter((x) => x.open).length, waiting: queue.waiting, classes: classes.length,
    weakest: code && MOE_BY_CODE.has(code) ? { code, short: MOE_BY_CODE.get(code)!.short, text: MOE_BY_CODE.get(code)!.text, pct: row?.pct ?? null } : null,
    questions: pool.length, byDifficulty,
  };
}
