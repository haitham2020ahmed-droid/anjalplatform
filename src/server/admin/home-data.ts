/**
 * ⚡ Admin home data (Update 42B → Update 57). The page is streamed: its frame (greeting, shortcuts) is sent at once and
 * each section arrives on its own behind a loader (src/app/admin/page.tsx), so no section waits for another:
 *
 *   adminHomeCounts   the 4 numbers and what waits for a decision — cheap counts (+ two bank scans kept per school)
 *   mapShortAreas     "MAP areas short of questions": the MAP readiness of every grade reads the whole question bank
 *                     (3 grades × 2 subjects) — never built while the admin waits. The last answer is kept per school
 *                     (version-checked, stale-while-revalidate); when there is none yet or the bank changed, it is
 *                     (re)built AFTER the response, one heavy job at a time, and the next visit shows it.
 *   connectionsKept   the Connections check (it builds the MAP pools too): the same rule — kept, rebuilt after the response
 *   classesAtAGlance · teacherFollowupForHome — read by their own sections.
 *
 * The alert scan (every 3 hours) also runs after the page is sent.
 */
import { can, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { listQuestions } from "./questions";
import { countDeletionRequests } from "./question-requests";
import { scanAlerts } from "../insights/alerts";
import { readiness, type Readiness } from "../map/sim";
import { classesAtAGlance } from "../insights/overview";
import { connectionsKept } from "./connections";
import { pendingCount } from "../reports/family-reports";
import { runAfterResponse } from "../lib/after-response";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { countGroups } from "../db/group-count";
import { memoryHigh, runHeavy } from "../monitoring/memory";
import { sweptWeakMap } from "../cache/idle";

/**
 * Bank-wide figures of the admin home (Update 46, performance): the waiting/deletion counts read every question of the
 * school. They are kept per school until a table they read changes in this process (write counters), and at most `ms`
 * (other processes: the jobs worker). Bounded: a few schools.
 */
const homeCache = sweptWeakMap<{ v: string; at: number; p: Promise<unknown> }>("admin.home-data.homeCache", 15 * 60_000);
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
/** a kept MAP readiness answer is rebuilt (in the background) after this long even when nothing changed here */
const READY_MAX_AGE = 30 * 60_000;

export interface AdminHomeCounts { waiting: number; deletions: number; students: number; active: number; alertsOpen: number; flags: number; reportsWaiting: number }

/** The page's numbers: cheap counts side by side (the two bank scans are kept per school). */
export async function adminHomeCounts(repo: Repo, actor: Actor, now = new Date()): Promise<AdminHomeCounts> {
  const schoolId = actor.schoolId;
  const canApprove = can(actor, "questions:publish");
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [waiting, deletions, students, activeRows, alertsOpen, flags, reportsWaiting] = await Promise.all([
    canApprove ? cachedFor(repo, `waiting|${actor.role}|${schoolId}`, BANK_COUNT_MODELS, 5 * 60_000, () => listQuestions(repo, actor, { status: "UNDER_REVIEW", limit: 1, page: 1 }).then((r) => r.total)) : Promise.resolve(0),
    canApprove ? cachedFor(repo, `deletions|${actor.role}|${schoolId}`, BANK_COUNT_MODELS, 5 * 60_000, () => countDeletionRequests(repo, actor)) : Promise.resolve(0),
    repo.count("Student", { schoolId }),
    countGroups(repo, "PracticeSession", "studentId", { startedAt: { gte: weekAgo } }), // one GROUP BY, not every session
    repo.count("StudentAlert", { schoolId, status: "OPEN" }),
    repo.count("QuestionFlag", { schoolId, status: "OPEN" }),
    schoolId ? pendingCount(repo, schoolId) : Promise.resolve(0),
  ]);
  const active = [...activeRows.keys()].filter(Boolean).length;
  return { waiting, deletions, students, active, alertsOpen, flags, reportsWaiting };
}

// ------------------------------------------------------------------ MAP readiness, off the critical path

interface ReadyEntry { v: string; at: number; value: string[] | null; building: Promise<string[]> | null }
const readyCache = new WeakMap<object, Map<string, ReadyEntry>>();

/** "G4 Literary Text" … : the MAP areas of every grade that are short of questions (the slow part: reads the bank). */
export async function buildMapShortAreas(repo: Repo, actor: Actor): Promise<string[]> {
  const gs = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["level"] });
  const levels = gs.map((g) => Number(g.level)).filter((g) => g >= 1).sort((a, b) => a - b);
  const ready = (await Promise.all(levels.map((g) => readiness(repo, actor, g).catch(() => [] as Readiness[])))).flat();
  return ready.flatMap((r) => r.groups.filter((g) => !g.ok).map((g) => `G${r.grade} ${g.name}`));
}

/**
 * The MAP areas short of questions WITHOUT waiting for the bank: the kept answer of this school (also while a newer
 * one is being built), or null when there is none yet. A missing or out-of-date answer is built after the response
 * (once at a time per school, never while the server is near its memory limit).
 */
export function mapShortAreas(repo: Repo, actor: Actor, opts: { wait?: boolean } = {}): Promise<string[] | null> {
  const key = String(actor.schoolId ?? "");
  let m = readyCache.get(repo);
  if (!m) readyCache.set(repo, (m = new Map()));
  const v = modelVersion(...READINESS_MODELS);
  const hit = m.get(key);
  const fresh = hit && hit.value !== null && hit.v === v && Date.now() - hit.at < READY_MAX_AGE;
  if (fresh) return Promise.resolve(hit!.value);
  const entry: ReadyEntry = hit ?? { v, at: 0, value: null, building: null };
  remember(m, key, entry, 16);
  if (!entry.building) {
    const start = () => {
      if (entry.building) return entry.building;
      const vAt = modelVersion(...READINESS_MODELS);
      entry.building = runHeavy(() => buildMapShortAreas(repo, actor))
        .then((value) => { entry.value = value; entry.v = vAt; entry.at = Date.now(); return value; })
        .finally(() => { entry.building = null; });
      entry.building.catch(() => undefined);
      return entry.building;
    };
    if (opts.wait) return start();
    if (!memoryHigh()) runAfterResponse("admin.map_readiness", () => start().catch(() => []));
  } else if (opts.wait) return entry.building;
  return Promise.resolve(entry.value);
}

/** Everything of the admin home in one call (scripts and tests; the page streams the parts). */
export async function adminHomeData(repo: Repo, actor: Actor) {
  const schoolId = actor.schoolId;
  // one heavy job at a time, and none started while the server is near its memory limit (the next visit scans)
  if (schoolId && !memoryHigh()) runAfterResponse("admin.alert_scan", () => runHeavy(() => scanAlerts(repo, schoolId)).catch(() => 0));
  const [counts, short, rows, conn] = await Promise.all([
    adminHomeCounts(repo, actor), mapShortAreas(repo, actor), classesAtAGlance(repo, actor), Promise.resolve(connectionsKept(repo, actor)),
  ]);
  return { ...counts, short: short ?? [], rows, conn };
}
