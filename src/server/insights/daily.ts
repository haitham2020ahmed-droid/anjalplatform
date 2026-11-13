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
import { memoryHigh, rssMb } from "../monitoring/memory";

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

export interface DailyResult { rewards?: number; nafsPlans?: number; nafsReminders?: number; mapPlanReminders?: number; tiers: number; skipped?: string[]; levelChanges?: number; declining?: number; highRisk: number; decayed: number; tagged: number; analysed: number; reclassified?: number; alerts?: number; skillFlags?: number; prerequisites: number; recommendations: number; interventions: number; profiles: number; digests: number; monthly?: number }

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
/** One step of the daily job: it returns its part of the result (steps are idempotent — a step may run again). */
interface DailyStep { name: string; run: (repo: Repo, schoolId: string, now: Date) => Promise<Partial<DailyResult>> }

/**
 * 🩹 Nov 2026 (owner, Render log "daily.run.crash_loop_stopped"): the job was ONE long run — a deploy, a restart or a
 * memory pause in the middle threw the whole run away, every attempt counted as "it stopped the server", and after 2
 * the day's alerts, rewards, profiles and digests were simply not done. Now the job is a list of steps: after each one
 * the place is saved (DailyCheckpoint), the next attempt CONTINUES from there, and only a step that was started
 * MAX_STEP_TRIES times without finishing is skipped for the day (the rest still runs).
 */
const DAILY_STEPS: DailyStep[] = [
  { name: "decay", async run(repo, schoolId, now) {
    const students = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
    const settings = await repo.findMany("SchoolSetting", { schoolId, key: { in: ["adaptive.engine", "mastery.thresholds"] } });
    const get = (k: string) => (settings.find((r: Row) => r.key === k)?.value ?? {}) as Record<string, unknown>;
    const cfg = resolveEngineConfig(get("adaptive.engine"), get("mastery.thresholds"));
    return { decayed: await decaySweep(repo, students, now, cfg.mastery) };
  } },
  // platform-wide steps (not per school): once a day for all schools
  { name: "platform", run: (repo, _s, now) => platformDaily(repo, now) },
  // 🧠 question intelligence for questions added or changed since the last run (bounded)
  { name: "analyse", async run(repo, schoolId, now) { return { analysed: (await (await import("../questions/intelligence")).analyzeQuestions(repo, schoolId, { limit: 3000 }, now)).analysed }; } },
  // 🔁 re-classify questions from students' first answers (+ alerts; weekly: IRT calibration, admin notice)
  { name: "reclassify", async run(repo, schoolId, now) { return { reclassified: (await (await import("../questions/reclassify")).questionDataDaily(repo, schoolId, now).catch((e) => { log("error", "reclassify.failed", { schoolId, error: e }); return null; }))?.changed ?? 0 }; } },
  { name: "interventions", async run(repo, schoolId, now) { return { interventions: await evaluateInterventions(repo, now, schoolId) }; } },
  // ⚖️ overall levels: evaluated every day, changed only when confirmed (hysteresis + decline check, Update 39B)
  { name: "levels", async run(repo, schoolId, now) {
    const levels = await (await import("../curriculum-map/level-evidence")).refreshLevelStates(repo, schoolId, now).catch((e) => { log("error", "levels.refresh.failed", { schoolId, error: e }); return null; });
    return { levelChanges: levels?.changed ?? 0, declining: levels?.declining ?? 0 };
  } },
  { name: "profiles", async run(repo, schoolId, now) { return { profiles: await buildProfiles(repo, schoolId, now) }; } },
  // 🚨 early warning, then 🔁 the models learn from the outcomes so far
  { name: "risk", async run(repo, schoolId, now) {
    const { computeRisks, trainRiskModel } = await import("../predict/risk");
    const risk = await computeRisks(repo, schoolId, now);
    await (await import("./learning-weights")).learnActionWeights(repo, schoolId, now).catch(() => null);
    // re-fit the risk model at most once a week (it reads a year of history)
    const last = (await repo.findMany("PredictionModel", { schoolId, kind: "RISK" }, { select: ["trainedAt"] }))[0];
    if (!last || now.getTime() - time(last.trainedAt) >= 7 * DAY) await trainRiskModel(repo, schoolId, now).catch((e) => log("error", "risk.train.failed", { schoolId, error: e }));
    return { highRisk: risk.high };
  } },
  // 🚨 alerts are generated here every day (readiness I-4), not only when someone opens an alert list:
  // skill-support flags (InterventionAlert) for enrolled students, then the student alerts (one open per kind)
  { name: "alerts", async run(repo, schoolId, now) {
    const a = await scanDailyAlerts(repo, schoolId, now).catch((e) => { log("error", "alerts.scan.failed", { schoolId, error: e }); return { interventions: 0, alerts: 0 }; });
    return { alerts: a.alerts, skillFlags: a.interventions };
  } },
  // 🧭 support tiers (RTI/MTSS): after the risks, which they read; a failure never stops the rest of the job
  { name: "tiers", async run(repo, schoolId, now) { return { tiers: (await (await import("../tiers/tiers")).computeTiers(repo, schoolId, now).catch((e) => { log("error", "tiers.compute.failed", { schoolId, error: e }); return null; }))?.changed ?? 0 }; } },
  // 🔤 decoding screener invitations for Tier 2/3 students with low fluency and comprehension (never stops the job)
  { name: "decoding", async run(repo, schoolId, now) { await (await import("../word-study/screener")).queueDecodingScreens(repo, schoolId, now).catch((e) => log("error", "decoding.queue.failed", { schoolId, error: e })); return {}; } },
  // 🇸🇦 NAFS tests past their due date (or submitted by everyone): personal NAFS plans from the results (bounded)
  { name: "nafsPlans", async run(repo, schoolId, now) { return { nafsPlans: (await (await import("../tests/assessments")).autoPersonalizeNafsTests(repo, schoolId, now).catch((e) => { log("error", "nafs.personalize.failed", { schoolId, error: e }); return null; }))?.personalized ?? 0 }; } },
  // 🇸🇦 a practice reminder for Grade 6 students below NAFS readiness who have gone quiet a few days
  { name: "nafsReminders", async run(repo, schoolId, now) { return { nafsReminders: await (await import("../nafs/reminders")).nafsPracticeReminders(repo, schoolId, now).catch((e) => { log("error", "nafs.reminders.failed", { schoolId, error: e }); return 0; }) }; } },
  // 🗺️ a teacher alert for a SENT MAP plan still fully untouched days after it was sent
  { name: "mapPlanReminders", async run(repo, schoolId, now) { return { mapPlanReminders: await (await import("../map/plan-idle-reminders")).mapPlanIdleReminders(repo, schoolId, now).catch((e) => { log("error", "map.plan.reminders.failed", { schoolId, error: e }); return 0; }) }; } },
  // 🎖️ rewards (Games Part 3): coins, badges and automatic certificates for students active since yesterday
  { name: "rewards", async run(repo, schoolId, now) { return { rewards: (await (await import("../motivation/sync")).syncSchoolRewards(repo, schoolId, now).catch((e) => { log("error", "rewards.sync.failed", { schoolId, error: e }); return null; }))?.students ?? 0 }; } },
  // 📅 month end: the monthly family reports as drafts for the teachers to review (first 7 days of a month, once)
  { name: "monthly", async run(repo, schoolId, now) { return { monthly: await (await import("../reports/monthly-report")).generateMonthlyReports(repo, schoolId, now).catch((e) => { log("error", "monthly.reports.failed", { schoolId, error: e }); return 0; }) }; } },
  { name: "digests", async run(repo, schoolId, now) { return { digests: await teacherDigests(repo, schoolId, now) }; } },
];
export const DAILY_STEP_NAMES: readonly string[] = DAILY_STEPS.map((x) => x.name);

/** Where a day's run is (saved in its daily.run.<day> setting after every step). */
export interface DailyCheckpoint { step: number; result: Partial<DailyResult>; tries: Record<string, number>; skipped: string[] }
/** A step started this many times without finishing (the server stopped in it each time) is skipped for the day. */
export const MAX_STEP_TRIES = 2;

/**
 * Runs the day's steps from `cp.step` on. `save` (optional) is called before each step (its try is counted) and
 * after it (the place moves on), so an interrupted run continues where it stopped. The memory gate between steps may
 * throw JobPaused: the step is then not counted as a try (nothing crashed) and the run continues later.
 */
export async function runDailySteps(repo: Repo, schoolId: string, now = new Date(), cp: DailyCheckpoint = { step: 0, result: {}, tries: {}, skipped: [] }, save?: (cp: DailyCheckpoint) => Promise<void>): Promise<DailyResult> {
  // r68: before each heavy step the job waits while the server is near its memory limit (src/server/jobs/runner.ts)
  const { memoryGate } = await import("../jobs/runner");
  for (let i = cp.step; i < DAILY_STEPS.length; i++) {
    const st = DAILY_STEPS[i];
    if ((cp.tries[st.name] ?? 0) >= MAX_STEP_TRIES) {
      if (!cp.skipped.includes(st.name)) { cp.skipped.push(st.name); log("error", "daily.step.skipped", { schoolId, step: st.name, tries: cp.tries[st.name] }); }
      cp.step = i + 1; await save?.(cp); continue;
    }
    await memoryGate(`daily.${st.name}`); // may throw JobPaused (not a try: nothing has started)
    cp.tries[st.name] = (cp.tries[st.name] ?? 0) + 1;
    await save?.(cp);
    Object.assign(cp.result, await st.run(repo, schoolId, now));
    cp.step = i + 1;
    await save?.(cp);
  }
  const r = cp.result;
  return { decayed: 0, tagged: 0, prerequisites: 0, recommendations: 0, analysed: 0, interventions: 0, profiles: 0, highRisk: 0, tiers: 0, digests: 0, ...r, ...(cp.skipped.length ? { skipped: [...cp.skipped] } : {}) } as DailyResult;
}

export async function runDaily(repo: Repo, schoolId: string, now = new Date()): Promise<DailyResult> {
  return runDailySteps(repo, schoolId, now);
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

/**
 * 🩹 Nov 2026: a day's run that has not saved a step for this long is dead (its process stopped: a deploy, a restart,
 * a crash) and the next teacher/admin visit continues it from its last step. (Was: 2 hours, and the whole run again.)
 */
export const STALE_CLAIM_MS = 15 * 60_000;
/** A run paused by the memory gate may be continued after this (memory usually settles within minutes). */
export const PAUSED_RETRY_MS = 5 * 60_000;
/** kept for old imports — the per-step limit is MAX_STEP_TRIES */
export const MAX_DAILY_RETRIES = MAX_STEP_TRIES;

interface DailyClaim { startedAt?: string; beatAt?: string; pausedAt?: string | null; doneAt?: string; profiles?: unknown; cp?: DailyCheckpoint; retries?: number }
const parse = (v: unknown): DailyClaim => (typeof v === "string" ? JSON.parse(v) : v ?? {}) as DailyClaim;

/** Claims today's run for the school: a new claim, or one whose run stopped (no step saved for 15 min, or paused). */
async function claimDay(repo: Repo, schoolId: string, key: string, now: Date): Promise<DailyCheckpoint | null> {
  // r68: read first — the usual "already claimed today" is no failed insert ("Unique constraint failed" in the log)
  const { claimSetting } = await import("../jobs/runner");
  const fresh: DailyCheckpoint = { step: 0, result: {}, tries: {}, skipped: [] };
  if (await claimSetting(repo, schoolId, key, { startedAt: now.toISOString(), beatAt: now.toISOString(), cp: fresh })) return fresh;
  // already claimed today (unique schoolId + key): continue it only if that run stopped
  const row = (await repo.findMany("SchoolSetting", { schoolId, key }))[0];
  if (!row) return null;
  const v = parse(row.value);
  if (v.doneAt || v.profiles !== undefined) return null; // the nightly script saves the result without doneAt
  const beat = time(v.beatAt ?? v.startedAt);
  const stopped = v.pausedAt ? now.getTime() - time(v.pausedAt) >= PAUSED_RETRY_MS : now.getTime() - beat >= STALE_CLAIM_MS;
  if (!stopped) return null;
  // a claim from before Nov 2026 (no checkpoint): its whole run counts as one try of the first step
  const cp: DailyCheckpoint = v.cp ?? { ...fresh, tries: { [DAILY_STEP_NAMES[0]]: Math.min(Number(v.retries ?? 0), MAX_STEP_TRIES) } };
  // compare-and-set on updatedAt: of two visitors, only one takes the stopped claim
  const n = await repo.updateMany("SchoolSetting", { schoolId, key, updatedAt: row.updatedAt }, { value: { ...v, beatAt: now.toISOString(), pausedAt: null, cp } });
  return n === 1 ? cp : null;
}

/**
 * Starts (or continues) today's job for the school if it has not finished yet (claims the day first, so two visits
 * never run it side by side). Does not wait for it. Returns true when it started.
 */
export async function maybeRunDaily(repo: Repo, schoolId: string | null, now = new Date()): Promise<boolean> {
  if (!schoolId) return false;
  // 🧠 the server is near its memory limit: do not claim the day now — the next teacher/admin visit starts it
  if (memoryHigh()) { log("warn", "daily.run.deferred_memory", { schoolId, rssMB: rssMb() }); return false; }
  const key = `daily.run.${riyadhDay(now)}`;
  const cp = await claimDay(repo, schoolId, key, now);
  if (!cp) return false;
  const write = async (value: Record<string, unknown>) => {
    const row = (await repo.findMany("SchoolSetting", { schoolId, key }))[0];
    const merged = { ...parse(row?.value), ...value };
    await repo.upsert("SchoolSetting", { schoolId, key }, { value: merged }, { value: merged });
  };
  const save = (c: DailyCheckpoint) => write({ cp: c, beatAt: new Date().toISOString() }).catch((e) => log("error", "daily.checkpoint.failed", { schoolId, key, error: e }));
  const { inJobSlot, JobPaused } = await import("../jobs/runner");
  // one heavy job at a time in this process (never side by side with an alert scan or the library load)
  // r68: in the job runner's slot (never beside a startup job), with its memory gate between the steps
  void inJobSlot(`daily|${schoolId}`, () => runDailySteps(repo, schoolId, now, cp, save))
    .then((r) => write({ ...r, doneAt: new Date().toISOString(), pausedAt: null }).catch((e) => log("error", "daily.done_mark.failed", { schoolId, key, error: e })))
    .catch((e) => {
      // ⏸ paused for memory: not a failure — the place is kept and a visit in a few minutes continues it
      if (e instanceof JobPaused) { log("warn", "daily.run.paused", { schoolId, key, step: DAILY_STEP_NAMES[cp.step] ?? null, reason: e.reason }); void write({ pausedAt: new Date().toISOString() }).catch(() => undefined); return; }
      log("error", "daily.run.failed", { schoolId, key, step: DAILY_STEP_NAMES[cp.step] ?? null, error: e });
    });
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
