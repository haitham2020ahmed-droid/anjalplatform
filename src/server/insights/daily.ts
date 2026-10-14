/**
 * 🌙 The daily learning job, per school. Runs from the nightly schedule (scripts/jobs/daily-learning.ts) and,
 * so it never depends on a cron being set up, also once a day on the first teacher or admin visit (in the
 * background: the page does not wait). Every step is idempotent and bounded.
 *
 *   1. retention decay   mastery fades after 30 idle days (so forgotten skills come back for review)
 *   2. misconceptions    wrong options still without a misconception are tagged       ┐ platform-wide:
 *   3. prerequisites     missing CCSS prerequisites between skills of a grade are added ├ once a day for
 *   4. recommendations   advice given 7+ days ago is checked: followed? improved?       ┘ all schools
 *   5. interventions     finished ones are measured and the teacher is told
 *   6. profiles          every student's profile (level, prediction, misconceptions) is rebuilt
 *   7. support tiers     RTI/MTSS tier rules (after the risks): changes, teacher notices, reteach + re-checks
 *   8. teacher digest    ONE summary notification per teacher instead of many small ones
 */
import { ensureReadRiseLibrary } from "../readrise/seed";
import { resolveEngineConfig, type MasteryThresholds } from "../../config/engine";
import { bandFor } from "../../mastery/mastery";
import type { Repo, Row } from "../seeding/repo";
import { tagOptions, groupMisconceptions } from "./misconception-tags";
import { ensurePrerequisites } from "../skills/auto-prerequisites";
import { evaluateRecommendations } from "./recommendation-log";
import { evaluateInterventions } from "./interventions";
import { buildProfiles } from "./student-profile";
import { log } from "../monitoring/log";
import { memoryHigh, rssMb, runHeavy } from "../monitoring/memory";

const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();

/** The decay factor after `idleDays` without practice (same rule as the mastery engine). */
export function decayFactorFor(idleDays: number, t: MasteryThresholds): number {
  if (idleDays <= t.decayAfterDays) return 1;
  return Math.max(t.decayFloor, 1 - t.decayPerWeek * ((idleDays - t.decayAfterDays) / 7));
}

/**
 * Applies retention decay to idle mastery rows of these students. The earned score is kept (score ÷ the factor
 * already applied), so running it every day never compounds. Returns how many rows changed.
 */
export async function decaySweep(repo: Repo, studentIds: string[], now = new Date(), t: MasteryThresholds = resolveEngineConfig().mastery): Promise<number> {
  let changed = 0;
  const cutoff = new Date(now.getTime() - t.decayAfterDays * DAY);
  for (let i = 0; i < studentIds.length; i += 500) {
    const rows = await repo.findMany("StudentSkillMastery", { studentId: { in: studentIds.slice(i, i + 500) }, lastPracticedAt: { lt: cutoff }, score: { gt: 0 } }, { select: ["studentId", "skillId", "score", "components", "lastPracticedAt", "isMastered", "band"] });
    for (const r of rows) {
      const comp = (typeof r.components === "string" ? JSON.parse(r.components) : r.components ?? {}) as Record<string, unknown>;
      const applied = Number(comp.decayFactor ?? 1) || 1;
      const earned = Number(r.score) / applied;
      const factor = decayFactorFor((now.getTime() - time(r.lastPracticedAt)) / DAY, t);
      const score = Math.round(earned * factor * 10) / 10;
      if (Math.abs(score - Number(r.score)) < 0.1) continue;
      const band = bandFor(score, t);
      await repo.updateMany("StudentSkillMastery", { studentId: r.studentId, skillId: r.skillId }, {
        score, band, isMastered: band === "MASTERED", components: { ...comp, decayFactor: Math.round(factor * 1000) / 1000 },
        // a skill that lost mastery leaves the review schedule (it is practised normally again)
        ...(band !== "MASTERED" ? { nextReviewAt: null, reviewStep: 0 } : {}),
      });
      changed++;
    }
  }
  return changed;
}

/** One summary per teacher: students at risk, the class's top misconception, interventions to look at. */
export async function teacherDigests(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name"] });
  const classIds = new Set(classes.map((c) => s(c.id)));
  const links = classIds.size ? await repo.findMany("ClassTeacher", { classId: { in: [...classIds] } }, { select: ["classId", "teacherId"] }) : [];
  const byTeacher = new Map<string, string[]>();
  for (const l of links) if (classIds.has(s(l.classId))) byTeacher.set(s(l.teacherId), [...(byTeacher.get(s(l.teacherId)) ?? []), s(l.classId)]);
  if (!byTeacher.size) return 0;
  const teachers = await repo.findMany("Teacher", { id: { in: [...byTeacher.keys()] } }, { select: ["id", "userId"] });
  let sent = 0;
  for (const tch of teachers) {
    const mine = byTeacher.get(s(tch.id)) ?? [];
    const members = await repo.findMany("ClassMembership", { classId: { in: mine }, leftAt: null }, { select: ["studentId"] });
    const ids = [...new Set(members.map((m) => s(m.studentId)))];
    if (!ids.length) continue;
    const [profiles, active, top] = await Promise.all([
      repo.findMany("StudentProfile", { studentId: { in: ids } }, { select: ["studentId", "goalChance", "practiceDays14", "level", "riskScore"] }),
      repo.findMany("Intervention", { classId: { in: mine }, status: "ACTIVE" }, { select: ["id"] }),
      groupMisconceptions(repo, ids, 7, now, 1),
    ]);
    const atRisk = profiles.filter((p) => Number(p.riskScore ?? 0) >= 65 || (p.riskScore === null && ((p.goalChance !== null && p.goalChance !== undefined && Number(p.goalChance) < 40) || Number(p.practiceDays14 ?? 0) === 0))).length;
    const lines = [
      atRisk ? `${atRisk} student${atRisk === 1 ? "" : "s"} at high risk of missing the MAP goal — see Class AI for why and what to do.` : "No student at high risk today.",
      top[0] ? `Top misconception this week: ${top[0].label} (${top[0].students.length} students).` : null,
      active.length ? `${active.length} intervention${active.length === 1 ? "" : "s"} running.` : null,
    ].filter(Boolean);
    await repo.create("Notification", { userId: tch.userId, type: "DAILY_DIGEST", title: "☀️ Your class today", body: lines.join(" "), link: "/teacher/ai", readAt: null, createdAt: now });
    sent++;
  }
  return sent;
}

export interface DailyResult { rewards?: number; nafsPlans?: number; tiers: number; levelChanges?: number; declining?: number; highRisk: number; decayed: number; tagged: number; analysed: number; reclassified?: number; alerts?: number; skillFlags?: number; prerequisites: number; recommendations: number; interventions: number; profiles: number; digests: number; monthly?: number }

/** Daily alert generation for one school: skill-support flags for enrolled students, then student alerts (forced scan). */
export async function scanDailyAlerts(repo: Repo, schoolId: string, now = new Date()): Promise<{ interventions: number; alerts: number }> {
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id"] });
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId"] }) : [];
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const { scanInterventions } = await import("../teacher/interventions");
  let interventions = 0;
  for (let i = 0; i < ids.length; i += 50) interventions += await scanInterventions(repo, ids.slice(i, i + 50), now); // Update 42A: 50 per round
  const { scanAlerts } = await import("./alerts");
  const alerts = await scanAlerts(repo, schoolId, now, true);
  return { interventions, alerts };
}

/** The daily job for one school. */
export async function runDaily(repo: Repo, schoolId: string, now = new Date()): Promise<DailyResult> {
  const students = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
  const settings = await repo.findMany("SchoolSetting", { schoolId, key: { in: ["adaptive.engine", "mastery.thresholds"] } });
  const get = (k: string) => (settings.find((r: Row) => r.key === k)?.value ?? {}) as Record<string, unknown>;
  const cfg = resolveEngineConfig(get("adaptive.engine"), get("mastery.thresholds"));
  const decayed = await decaySweep(repo, students, now, cfg.mastery);
  // platform-wide steps (not per school): once a day for all schools
  const { tagged, prerequisites, recommendations } = await platformDaily(repo, now);
  // 🧠 question intelligence for questions added or changed since the last run (bounded)
  const { analyzeQuestions } = await import("../questions/intelligence");
  const analysed = (await analyzeQuestions(repo, schoolId, { limit: 3000 }, now)).analysed;
  // 🔁 re-classify questions from students' first answers (+ alerts; weekly: IRT calibration, admin notice)
  const reclassified = (await (await import("../questions/reclassify")).questionDataDaily(repo, schoolId, now).catch((e) => { log("error", "reclassify.failed", { schoolId, error: e }); return null; }))?.changed ?? 0;
  const interventions = await evaluateInterventions(repo, now, schoolId);
  // ⚖️ overall levels: evaluated every day, changed only when confirmed (hysteresis + decline check, Update 39B)
  const levels = await (await import("../curriculum-map/level-evidence")).refreshLevelStates(repo, schoolId, now).catch((e) => { log("error", "levels.refresh.failed", { schoolId, error: e }); return null; });
  const profiles = await buildProfiles(repo, schoolId, now);
  // 🚨 early warning, then 🔁 the models learn from the outcomes so far
  const { computeRisks, trainRiskModel } = await import("../predict/risk");
  const { learnActionWeights } = await import("./learning-weights");
  const risk = await computeRisks(repo, schoolId, now);
  await learnActionWeights(repo, schoolId, now).catch(() => null);
  // re-fit the risk model at most once a week (it reads a year of history)
  const last = (await repo.findMany("PredictionModel", { schoolId, kind: "RISK" }, { select: ["trainedAt"] }))[0];
  if (!last || now.getTime() - time(last.trainedAt) >= 7 * DAY) await trainRiskModel(repo, schoolId, now).catch((e) => log("error", "risk.train.failed", { schoolId, error: e }));
  // 🚨 alerts are generated here every day (readiness I-4), not only when someone opens an alert list:
  // skill-support flags (InterventionAlert) for enrolled students, then the student alerts (one open per kind)
  const alerts = await scanDailyAlerts(repo, schoolId, now).catch((e) => { log("error", "alerts.scan.failed", { schoolId, error: e }); return { interventions: 0, alerts: 0 }; });
  // 🧭 support tiers (RTI/MTSS): after the risks, which they read; a failure never stops the rest of the job
  const { computeTiers } = await import("../tiers/tiers");
  const tiers = (await computeTiers(repo, schoolId, now).catch((e) => { log("error", "tiers.compute.failed", { schoolId, error: e }); return null; }))?.changed ?? 0;
  // 🔤 decoding screener invitations for Tier 2/3 students with low fluency and comprehension (never stops the job)
  await (await import("../word-study/screener")).queueDecodingScreens(repo, schoolId, now).catch((e) => log("error", "decoding.queue.failed", { schoolId, error: e }));
  // 🇸🇦 NAFS tests past their due date (or submitted by everyone): personal NAFS plans from the results (bounded)
  const nafsPlans = (await (await import("../tests/assessments")).autoPersonalizeNafsTests(repo, schoolId, now).catch((e) => { log("error", "nafs.personalize.failed", { schoolId, error: e }); return null; }))?.personalized ?? 0;
  // 🎖️ rewards (Games Part 3): coins, badges and automatic certificates for students active since yesterday — read
  // only on learning data; a failure never stops the rest of the job
  const rewards = (await (await import("../motivation/sync")).syncSchoolRewards(repo, schoolId, now).catch((e) => { log("error", "rewards.sync.failed", { schoolId, error: e }); return null; }))?.students ?? 0;
  // 📅 month end: the monthly family reports as drafts for the teachers to review (first 7 days of a month, once)
  const monthly = await (await import("../reports/monthly-report")).generateMonthlyReports(repo, schoolId, now).catch((e) => { log("error", "monthly.reports.failed", { schoolId, error: e }); return 0; });
  const digests = await teacherDigests(repo, schoolId, now);
  return { rewards, nafsPlans, tiers, levelChanges: levels?.changed ?? 0, declining: levels?.declining ?? 0, decayed, tagged, analysed, reclassified, prerequisites, recommendations, interventions, profiles, highRisk: risk.high, digests, alerts: alerts.alerts, skillFlags: alerts.interventions, monthly };
}

/** The school day in Riyadh (the job runs once per school per day). */
export const riyadhDay = (now: Date) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Platform-wide steps already started today, per database (one process runs them once a day for all schools;
 *  every step is idempotent, so another process running them too costs time, not correctness). */
const platformRun = new WeakMap<object, string>();

/** Misconception tags, prerequisites, recommendation outcomes: they span every school, so once a day, not per school. */
export async function platformDaily(repo: Repo, now = new Date()): Promise<{ tagged: number; prerequisites: number; recommendations: number }> {
  const day = riyadhDay(now);
  if (platformRun.get(repo) === day) return { tagged: 0, prerequisites: 0, recommendations: 0 };
  platformRun.set(repo, day);
  try {
    const tagged = await tagOptions(repo, { limit: 5000 });
    const prerequisites = await ensurePrerequisites(repo);
    const recommendations = (await evaluateRecommendations(repo, now)).evaluated;
    await ensureReadRiseLibrary(repo).catch((e) => log("error", "readrise.library.ensure_failed", { error: e }));
    return { tagged, prerequisites, recommendations };
  } catch (e) {
    platformRun.delete(repo); // let the next school's run try again
    throw e;
  }
}

/** A claim with no done mark older than this is treated as a crashed run and may be claimed again. */
export const STALE_CLAIM_MS = 2 * 3_600_000;
/** A day's run that never finished is retried at most this many times (then it waits for the next day). */
export const MAX_DAILY_RETRIES = 2;

/** Claims today's run for the school: a new claim, or a stale one (started 2+ h ago, never finished). */
async function claimDay(repo: Repo, schoolId: string, key: string, now: Date): Promise<boolean> {
  try {
    await repo.create("SchoolSetting", { schoolId, key, value: { startedAt: now.toISOString() }, updatedBy: null });
    return true;
  } catch {
    // already claimed today (unique schoolId + key): take it over only if that run crashed
    const row = (await repo.findMany("SchoolSetting", { schoolId, key }))[0];
    if (!row) return false;
    const v = (typeof row.value === "string" ? JSON.parse(row.value) : row.value ?? {}) as Record<string, unknown>;
    const done = Boolean(v.doneAt) || v.profiles !== undefined; // the nightly script saves the result without doneAt
    const started = time(v.startedAt);
    if (done || !(now.getTime() - started >= STALE_CLAIM_MS)) return false;
    // 🛟 a run that stopped the server MAX_DAILY_RETRIES times today is not started again today (Update 42A: no crash loop)
    const retries = Number(v.retries ?? 0);
    if (retries >= MAX_DAILY_RETRIES) { log("error", "daily.run.crash_loop_stopped", { schoolId, key, retries }); return false; }
    // compare-and-set on updatedAt: of two visitors, only one takes the stale claim
    const n = await repo.updateMany("SchoolSetting", { schoolId, key, updatedAt: row.updatedAt }, { value: { startedAt: now.toISOString(), retryOf: v.startedAt ?? null, retries: retries + 1 } });
    return n === 1;
  }
}

/**
 * Starts today's job for the school if it has not run yet (claims the day first, so two visits never run it
 * twice). Does not wait for it. Returns true when it started.
 */
export async function maybeRunDaily(repo: Repo, schoolId: string | null, now = new Date()): Promise<boolean> {
  if (!schoolId) return false;
  // 🧠 the server is near its memory limit: do not claim the day now — the next teacher/admin visit starts it
  if (memoryHigh()) { log("warn", "daily.run.deferred_memory", { schoolId, rssMB: rssMb() }); return false; }
  const key = `daily.run.${riyadhDay(now)}`;
  if (!(await claimDay(repo, schoolId, key, now))) return false;
  // one heavy job at a time in this process (never side by side with an alert scan or the library load)
  void runHeavy(() => runDaily(repo, schoolId, now))
    .then((r) => repo.upsert("SchoolSetting", { schoolId, key }, { value: { ...r, doneAt: new Date().toISOString() } }, { value: { ...r, doneAt: new Date().toISOString() } }).catch((e) => log("error", "daily.done_mark.failed", { schoolId, key, error: e })))
    .catch((e) => log("error", "daily.run.failed", { schoolId, key, error: e }));
  return true;
}

export interface EngineOverview {
  lastRun: { day: string; result: Record<string, unknown> | null } | null;
  options: { tagged: number; wrong: number };
  prerequisites: number;
  profiles: { total: number; below: number; on: number; above: number; unknown: number; atRisk: number };
}

/** What the learning engine knows for a school (admin page). */
export async function engineOverview(repo: Repo, schoolId: string): Promise<EngineOverview> {
  const runs = (await repo.findMany("SchoolSetting", { schoolId, key: { contains: "daily.run." } }, { select: ["key", "value"] })).sort((a, b) => s(b.key).localeCompare(s(a.key)));
  const [tagged, wrong, prerequisites, profiles] = await Promise.all([
    repo.count("QuestionOption", { isCorrect: false, misconception: { not: null } }), repo.count("QuestionOption", { isCorrect: false }),
    repo.count("SkillPrerequisite", {}), repo.findMany("StudentProfile", { schoolId }, { select: ["level", "goalChance"] }),
  ]);
  const by = (l: string) => profiles.filter((p) => s(p.level) === l).length;
  return {
    lastRun: runs[0] ? { day: s(runs[0].key).replace("daily.run.", ""), result: (typeof runs[0].value === "string" ? JSON.parse(runs[0].value) : runs[0].value) as Record<string, unknown> } : null,
    options: { tagged, wrong }, prerequisites,
    profiles: { total: profiles.length, below: by("BELOW"), on: by("ON"), above: by("ABOVE"), unknown: by("UNKNOWN"), atRisk: profiles.filter((p) => p.goalChance !== null && p.goalChance !== undefined && Number(p.goalChance) < 40).length },
  };
}
