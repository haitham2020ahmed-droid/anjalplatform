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

/** The center's tabs, in the owner's order (About NAFS is a small link at the top): Home · Dashboard · Practice · Tests ·
 * Question bank · Marking · Reports — every capability once, in one place. */
export const CENTER_TABS = [
  { key: "home", label: "Home" },
  { key: "dashboard", label: "Dashboard" },
  { key: "practice", label: "Practice" },
  { key: "tests", label: "Tests" },
  { key: "bank", label: "Question bank" },
  { key: "marking", label: "Marking" },
  { key: "reports", label: "Reports" },
] as const;

/** Old tab keys that now live inside another tab (links keep working). */
export const OLD_TABS: Record<string, string> = { sheets: "marking", create: "tests", adaptive: "practice" };

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
