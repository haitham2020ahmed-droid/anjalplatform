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

/** The center's tabs, in the owner's order (About NAFS is a small link at the top): Home · Dashboard · Adaptive practice ·
 * Create test · Question bank · Marking · Reports. */
export const CENTER_TABS = [
  { key: "home", label: "Home" },
  { key: "dashboard", label: "Dashboard" },
  { key: "practice", label: "Adaptive practice" },
  { key: "tests", label: "Create test" },
  { key: "bank", label: "Question bank" },
  { key: "marking", label: "Marking" },
  { key: "reports", label: "Reports" },
] as const;

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
