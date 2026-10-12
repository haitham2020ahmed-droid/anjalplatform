/**
 * ⚡ Admin home data (Update 42B): every count in one round trip (before: seven waves one after another), and the
 * alert scan (every 3 hours) runs after the page is sent instead of before it — the admin no longer waits for it.
 */
import { can, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { listQuestions } from "./questions";
import { countDeletionRequests } from "./question-requests";
import { scanAlerts } from "../insights/alerts";
import { readiness } from "../map/sim";
import { classesAtAGlance } from "../insights/overview";
import { connectionsCached } from "./connections";
import { pendingCount } from "../reports/family-reports";
import { runAfterResponse } from "../lib/after-response";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { memoryHigh, runHeavy } from "../monitoring/memory";

/**
 * ⚡ Bank-wide figures of the admin home (Update 46, performance): the MAP readiness of every grade reads the whole
 * question bank (3 grades × 2 subjects) and the waiting/deletion counts read every question of the school. They are
 * kept per school until a table they read changes in this process (write counters), and at most `ms` (other
 * processes: the jobs worker). Bounded: a few schools.
 */
const homeCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<unknown> }>>();
function cachedFor<T>(repo: Repo, key: string, models: string[], ms: number, load: () => Promise<T>): Promise<T> {
  let m = homeCache.get(repo);
  if (!m) homeCache.set(repo, (m = new Map()));
  const v = modelVersion(...models), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < ms) return hit.p as Promise<T>;
  const p = load().catch((e) => { m!.delete(key); throw e; });
  remember(m, key, { v, at: Date.now(), p }, 32);
  return p;
}
const BANK_COUNT_MODELS = ["Question", "Skill", "Curriculum", "Grade", "SkillFamily"];
const READINESS_MODELS = ["Question", "Skill", "SkillFamily", "MapGoalArea", "QuestionType", "Curriculum", "Grade", "SkillStandard", "Standard", "QuestionMapLink", "CurriculumMapNode", "BenchmarkReference"];

export async function adminHomeData(repo: Repo, actor: Actor) {
  const schoolId = actor.schoolId;
  // one heavy job at a time, and none started while the server is near its memory limit (the next visit scans)
  if (schoolId && !memoryHigh()) runAfterResponse("admin.alert_scan", () => runHeavy(() => scanAlerts(repo, schoolId)).catch(() => 0));
  // what is waiting for an admin's decision; today at a glance (cheap counts); is the question bank big enough for
  // MAP plans and the practice test (cached pools: cheap); the classes and the connections
  const canApprove = can(actor, "questions:publish");
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [waiting, deletions, students, activeRows, alertsOpen, flags, reportsWaiting, ready, rows, conn] = await Promise.all([
    canApprove ? cachedFor(repo, `waiting|${actor.role}|${schoolId}`, BANK_COUNT_MODELS, 60_000, () => listQuestions(repo, actor, { status: "UNDER_REVIEW", limit: 1, page: 1 }).then((r) => r.total)) : Promise.resolve(0),
    canApprove ? cachedFor(repo, `deletions|${actor.role}|${schoolId}`, BANK_COUNT_MODELS, 60_000, () => countDeletionRequests(repo, actor)) : Promise.resolve(0),
    repo.count("Student", { schoolId }),
    repo.findMany("PracticeSession", { startedAt: { gte: weekAgo } }, { select: ["studentId"] }),
    repo.count("StudentAlert", { schoolId, status: "OPEN" }),
    repo.count("QuestionFlag", { schoolId, status: "OPEN" }),
    schoolId ? pendingCount(repo, schoolId) : Promise.resolve(0),
    cachedFor(repo, `ready|${schoolId}`, READINESS_MODELS, 5 * 60_000, () => repo.findMany("Grade", { schoolId }, { select: ["level"] }).then(async (gs) => {
      const levels = gs.map((g) => Number(g.level)).filter((g) => g >= 1);
      return (await Promise.all(levels.map((g) => readiness(repo, actor, g).catch(() => [] as Awaited<ReturnType<typeof readiness>>)))).flat();
    })),
    classesAtAGlance(repo, actor),
    connectionsCached(repo, actor).catch(() => null),
  ]);
  const active = new Set(activeRows.map((r) => String(r.studentId))).size;
  const short = ready.flatMap((r) => r.groups.filter((g) => !g.ok).map((g) => `G${r.grade} ${g.name}`));
  return { waiting, deletions, students, active, alertsOpen, flags, reportsWaiting, short, rows, conn };
}
