/**
 * 🚨 Student alerts with follow-up. The school is scanned (at most every 3 hours, when a teacher or the admin
 * opens a page that shows alerts); each new alert is kept (once per student and reason per week), the teachers of
 * the class and the head of department get ONE notification per scan, and the teacher writes what was done and
 * marks it handled. The admin (head of department) sees everything, including what is not handled yet.
 *
 * Reasons: NO_PRACTICE (7 days without an answer), WEAK_SKILL (a skill under 40% after 8+ answers), DROPPED (a level
 * dropped twice in a row), LATE_WORK (2+ tasks not started by their due date), MAP_RISK (MAP Low, or at risk of
 * missing the Spring goal), RAPID_GUESS (NWEA rapid guessing 30%+ → retest; or many too-fast answers here),
 * DECLINING (a sustained drop in recent answers, from the daily level check), INVALID_TEST (a Diagnostic or check with
 * 30%+ rapid guesses: not used for decisions; re-test).
 */
import { conflictsFor } from "./level-story";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { coordinatorGrades, readableClasses } from "../teacher/coordinators";
import { mapSummaries, practiceStats, studentNames } from "./student-data";
import { statusOf } from "./progress";
import { isHiddenSkill } from "../skills/master";
import { safeIfBehind } from "../db/schema-errors";
import { cancelIndex, liveAssignmentWhere } from "../student/cancelled-work";
import { weekStart } from "../student/weekly";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;
export type AlertKind = "NO_PRACTICE" | "WEAK_SKILL" | "DROPPED" | "LATE_WORK" | "MAP_RISK" | "RAPID_GUESS" | "LEVEL_CONFLICT" | "DECLINING" | "INVALID_TEST" | "EARLY_WARNING" | "RR_MAP_GAP" | "RR_STUCK_UNRELIABLE";
export const ALERT_INFO: Record<AlertKind, { icon: string; title: string; tip: string }> = {
  MAP_RISK: { icon: "🗺️", title: "MAP: at risk", tip: "Check the MAP plan; a small group for the focus area helps." },
  RAPID_GUESS: { icon: "⚡", title: "Rapid guessing", tip: "Talk with the student; if it is the MAP test, ask about a retest." },
  DROPPED: { icon: "📉", title: "Dropped a level twice", tip: "Give support at the lower level, then try again." },
  WEAK_SKILL: { icon: "🧩", title: "Weak in a skill", tip: "Reteach the skill or send it again at a lower level." },
  LATE_WORK: { icon: "⏰", title: "Late work", tip: "Remind the student; contact the parent if it continues." },
  NO_PRACTICE: { icon: "💤", title: "No practice for 7 days", tip: "Check in with the student; a short task to restart." },
  DECLINING: { icon: "📉", title: "Declining", tip: "Their recent answers are clearly weaker than before: check in with the student, look at the skills that fell, and give support now." },
  INVALID_TEST: { icon: "⚡", title: "Invalid result — re-test", tip: "Too many answers were too fast to read: the result is not used for the level or the tier. Talk with the student and let them take it again." },
  EARLY_WARNING: { icon: "🔴", title: "Early warning: urgent", tip: "Open the early warning: see which measures fell, make a plan or assign practice, and write what you did." },
  LEVEL_CONFLICT: { icon: "⚖️", title: "Data disagree", tip: "Open their Level Story: one source says Exceeding, another Approaching. Decide the level, or check for guessing." },
  // owner r69: raised once a school year by ReadRise itself (readrise/accuracy.ts alertMapGap), not by the scan
  RR_MAP_GAP: { icon: "🚀", title: "ReadRise and MAP disagree", tip: "The ReadRise level and the MAP reading level are far apart. Check the placement or the MAP result; set the ReadRise level by hand or allow a new placement." },
  // owner r69: raised once a school year by ReadRise itself (readrise/accuracy.ts alertStuckUnreliable), not by the scan
  RR_STUCK_UNRELIABLE: { icon: "🚩", title: "ReadRise isn't getting a real reading", tip: "The last few attempts were too fast / guessed, or a low Stretch score, so the level hasn't moved — nothing real has been measured. Check in with the student." },
};
const ORDER: AlertKind[] = ["EARLY_WARNING", "DECLINING", "INVALID_TEST", "MAP_RISK", "RAPID_GUESS", "LEVEL_CONFLICT", "RR_MAP_GAP", "RR_STUCK_UNRELIABLE", "DROPPED", "WEAK_SKILL", "LATE_WORK", "NO_PRACTICE"];

/**
 * Week label of a date, e.g. 2026-10-26 (the Sunday that starts its week).
 * 🐛 fix (Oct 2026): this was a pure-UTC ISO week (Monday start) — the platform's real week everywhere else
 * (family-week.ts, ReadRise, student-profile.ts) is Sunday 00:00 Riyadh time (student/weekly.ts#weekStart). Near
 * the boundary (e.g. Sunday 1am Riyadh = Saturday 10pm UTC) the old key could put the same real week's alert into
 * two different "weeks", defeating the "once per student and reason per week" de-dup this key exists for.
 */
export function weekKey(d: Date): string {
  return weekStart(d).toISOString().slice(0, 10);
}

interface Found { studentId: string; classId: string; kind: AlertKind; key: string; detail: string }

/** Finds every alert of the school now (nothing is written). */
export async function findAlerts(repo: Repo, schoolId: string, now = new Date()): Promise<Found[]> {
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "gradeId"] });
  if (!classes.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId", "joinedAt"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return [];
  const classOf = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const gradeOf = new Map(members.map((m) => [s(m.studentId), Number(grades.find((g) => g.id === classes.find((c) => c.id === m.classId)?.gradeId)?.level ?? 0)]));
  // Update 42A: ALERT_CHUNK students at a time (every finding is about one student): the school's recent answers, mastery
  // and MAP rows are never all in memory at once; each student's findings come in the same order as before
  const out: Found[] = [];
  for (let i = 0; i < ids.length; i += ALERT_CHUNK) out.push(...await alertsFor(repo, schoolId, now, ids.slice(i, i + ALERT_CHUNK), classOf, gradeOf));
  return out;
}

/** Students per round of the alert scan (Update 42A). */
const ALERT_CHUNK = 50;

async function alertsFor(repo: Repo, schoolId: string, now: Date, ids: string[], classOf: Map<string, string>, gradeOf: Map<string, number>): Promise<Found[]> {
  const wk = weekKey(now);
  const out: Found[] = [];
  const add = (studentId: string, kind: AlertKind, key: string, detail: string) => out.push({ studentId, classId: classOf.get(studentId) ?? "", kind, key: `${kind}|${key}`, detail: detail.slice(0, 500) });

  const [maps, practice, students] = await Promise.all([mapSummaries(repo, ids, "READING", gradeOf), practiceStats(repo, ids, now), repo.findMany("Student", { id: { in: ids } }, { select: ["id", "createdAt"] })]);
  // MAP risk (Low, or the Spring goal is at risk/missed)
  for (const id of ids) {
    const m = maps.get(id), st = statusOf(m, practice.get(id));
    if (m?.latest && (st.status === "AT_RISK" || st.status === "MISSED")) add(id, "MAP_RISK", `${m.latest.term}|${wk}`, st.why);
    else if (m?.latest?.percentile !== null && m?.latest?.percentile !== undefined && m.latest.percentile < 21) add(id, "MAP_RISK", `${m.latest.term}|low`, `MAP ${m.latest.term}: RIT ${m.latest.rit}, percentile ${m.latest.percentile} (Low).`);
  }
  // NWEA rapid guessing on the latest test
  const rg = await repo.findMany("MapResult", { studentId: { in: ids }, goalName: null }, { select: ["studentId", "rapidGuessPct", "termName", "subject", "testDate"] });
  for (const r of rg) if (Number(r.rapidGuessPct ?? 0) >= 30) add(s(r.studentId), "RAPID_GUESS", `map|${s(r.termName)}|${s(r.subject)}`, `MAP ${s(r.subject)} ${s(r.termName)}: ${Number(r.rapidGuessPct)}% rapid guessing. NWEA suggests the score may not show what the student knows: consider a retest.`);
  // too-fast answers on the platform (last 14 days)
  const recent = await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } }, { select: ["studentId", "rapidGuess"] });
  const rgCount = new Map<string, [number, number]>();
  for (const a of recent) { const c = rgCount.get(s(a.studentId)) ?? [0, 0]; c[0]++; if (a.rapidGuess) c[1]++; rgCount.set(s(a.studentId), c); }
  for (const [id, [n, fast]] of rgCount) if (n >= 20 && fast / n >= 0.3) add(id, "RAPID_GUESS", `platform|${wk}`, `${Math.round((100 * fast) / n)}% of the last ${n} answers were too fast to be read (last 14 days).`);
  // 📉 a sustained decline (the daily level check: the last 2 weeks clearly under the 4 weeks before) — Update 39B
  const states = await repo.findMany("StudentLevelState", { studentId: { in: ids }, declining: true }, { select: ["studentId", "thetaRecent", "thetaPrior", "level"] });
  const sg = (v: unknown) => { const x = Number(v); return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`; };
  for (const st of states) add(s(st.studentId), "DECLINING", wk, `Ability fell from ${sg(st.thetaPrior)} (the 4 weeks before) to ${sg(st.thetaRecent)} in the last 2 weeks (0 = grade level). Confirmed level: ${s(st.level) === "BELOW" ? "Approaching" : s(st.level) === "ABOVE" ? "Exceeding" : "Meeting"}.`);
  // ⚡ invalid results (30%+ rapid guesses): Diagnostic (last 30 days) and checks (last 14 days) — not used; re-test
  const { isInvalidResult } = await import("../curriculum-map/level-evidence");
  const diags = await repo.findMany("DiagnosticScore", { studentId: { in: ids }, completedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, { select: ["studentId", "rapid", "total", "completedAt", "pct"] });
  for (const dg of diags) if (isInvalidResult(Number(dg.rapid ?? 0), Number(dg.total ?? 0))) add(s(dg.studentId), "INVALID_TEST", `diagnostic|${new Date(time(dg.completedAt)).toISOString().slice(0, 10)}`, `Diagnostic Test (${new Date(time(dg.completedAt)).toISOString().slice(0, 10)}): ${Number(dg.rapid)} of ${Number(dg.total)} answers were rapid guesses. Invalid — re-test; not used for the level or the tier.`);
  const wks = await repo.findMany("WeeklyCheck", { studentId: { in: ids }, completedAt: { gte: new Date(now.getTime() - 14 * DAY) } }, { select: ["studentId", "assignmentId", "week"] });
  if (wks.length) {
    const { checkDetails } = await import("../tiers/tiers");
    const det = await checkDetails(repo, wks.map((w) => ({ assignmentId: s(w.assignmentId), studentId: s(w.studentId) })));
    for (const w of wks) { const x = det.get(`${s(w.assignmentId)}|${s(w.studentId)}`); if (x && isInvalidResult(x.rapid, x.items + x.rapid)) add(s(w.studentId), "INVALID_TEST", `weekly|${s(w.week)}`, `Weekly Check of ${s(w.week)}: ${x.rapid} of ${x.items + x.rapid} answers were rapid guesses. Invalid — not used for the support tier.`); }
  }
  // no practice for 7 days (students who had at least one week on the platform)
  for (const id of ids) {
    const p = practice.get(id), created = time(students.find((x) => x.id === id)?.createdAt);
    if (created > now.getTime() - 7 * DAY) continue;
    const last = p?.lastActive ? time(p.lastActive) : 0;
    if (last < now.getTime() - 7 * DAY) add(id, "NO_PRACTICE", wk, last ? `No answer since ${new Date(last).toISOString().slice(0, 10)}.` : "Has not practised on the platform yet.");
  }
  // weak skill (readiness I-2/4): aligned with mastery, not raw accuracy — mastery under 40 (Developing or below) with
  // enough evidence (effective answers ≥ 5, and 5+ answers that were NOT rapid guesses in the last 3 weeks); a skill
  // practised in the last 3 weeks; the hidden “Unclassified (Curriculum Map)” skill is never named in an alert
  const mastery = await repo.findMany("StudentSkillMastery", { studentId: { in: ids }, score: { lt: WEAK_MASTERY } }, { select: ["studentId", "skillId", "attempts", "score", "band", "components", "lastPracticedAt"] });
  const recentSkill = mastery.length ? await repo.findMany("QuestionAttempt", { studentId: { in: [...new Set(mastery.map((m) => s(m.studentId)))] }, createdAt: { gte: new Date(now.getTime() - 21 * DAY) }, rapidGuess: false }, { select: ["studentId", "skillId"] }) : [];
  const valid = new Map<string, number>();
  for (const a of recentSkill) valid.set(`${s(a.studentId)}|${s(a.skillId)}`, (valid.get(`${s(a.studentId)}|${s(a.skillId)}`) ?? 0) + 1);
  const weakRows = mastery.filter((m) => isWeakSkill({ score: Number(m.score), attempts: Number(m.attempts), components: m.components, validRecent: valid.get(`${s(m.studentId)}|${s(m.skillId)}`) ?? 0 }) && time(m.lastPracticedAt) >= now.getTime() - 21 * DAY);
  const skillRows = weakRows.length ? await repo.findMany("Skill", { id: { in: [...new Set(weakRows.map((w) => s(w.skillId)))] } }, { select: ["id", "name", "code"] }) : [];
  const skillNames = new Map(skillRows.filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)]));
  for (const w of weakRows) {
    const name = skillNames.get(s(w.skillId));
    if (!name) continue; // hidden skill
    add(s(w.studentId), "WEAK_SKILL", `${s(w.skillId)}|${wk}`, `${name}: mastery ${Math.round(Number(w.score))} (${BAND_TEXT[s(w.band)] ?? "Developing"}) after ${valid.get(`${s(w.studentId)}|${s(w.skillId)}`) ?? 0} answers in 3 weeks (rapid guesses not counted).`);
  }
  // dropped a level twice in a row (same category), last 30 days
  const RANK: Record<string, number> = { SUPPORT: -1, BELOW: 0, ON: 1, ABOVE: 2, CHALLENGE: 3 };
  const logs = await repo.findMany("AuditLog", { entityType: "Student", entityId: { in: ids }, action: "level.change" });
  const byKey = new Map<string, Row[]>();
  for (const l of logs) { const a = (l.after ?? {}) as Record<string, unknown>; if (a.outcome !== "CHANGED") continue; const k = `${s(l.entityId)}|${s(a.category)}`; byKey.set(k, [...(byKey.get(k) ?? []), l]); }
  for (const [k, list] of byKey) {
    const [last, prev] = list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    if (!last || !prev || time(last.createdAt) < now.getTime() - 30 * DAY) continue;
    const down = (l: Row) => RANK[s(((l.after ?? {}) as Record<string, unknown>).level)] < RANK[s(((l.before ?? {}) as Record<string, unknown>).level)];
    const [id, cat] = k.split("|");
    if (down(last) && down(prev)) add(id, "DROPPED", `${cat}|${s(last.id)}`, `Dropped a level twice in a row${cat && cat !== "undefined" ? ` (${cat})` : ""}.`);
  }
  // late work: 2+ tasks not started by their due date (last 30 days)
  const asg = await repo.findMany("AssignmentStudent", { studentId: { in: ids }, status: { in: ["NOT_STARTED", "OVERDUE"] } }, { select: ["studentId", "assignmentId", "progress"] });
  // r78: work cancelled on Assigned is never "late work"
  const [as, ix] = await Promise.all([
    asg.length ? repo.findMany("Assignment", liveAssignmentWhere({ id: { in: [...new Set(asg.map((a) => s(a.assignmentId)))] } }), { select: ["id", "dueAt", "testId", "curriculumPlanId"] }) : Promise.resolve([] as Row[]),
    cancelIndex(repo, schoolId),
  ]);
  const due = new Map(as.filter((a) => a.dueAt && time(a.dueAt) < now.getTime() && time(a.dueAt) > now.getTime() - 30 * DAY).map((a) => [s(a.id), a]));
  const late = new Map<string, number>();
  for (const r of asg) if (due.has(s(r.assignmentId)) && Number(r.progress ?? 0) === 0 && ix.live(due.get(s(r.assignmentId))!, s(r.studentId))) late.set(s(r.studentId), (late.get(s(r.studentId)) ?? 0) + 1);
  for (const [id, n] of late) if (n >= 2) add(id, "LATE_WORK", wk, `${n} tasks not started by their due date.`);
  // ⚖️ the data disagree (MAP / Diagnostic / platform / Weekly Checks): once a month per pair of sources
  for (const c of await conflictsFor(repo, schoolId, ids, gradeOf, now)) add(c.studentId, "LEVEL_CONFLICT", `${c.key}|${now.toISOString().slice(0, 7)}`, c.detail);
  return out;
}

const SCAN_KEY = "alerts.scan";
/** After a teacher handles an alert, the same kind is not raised again for this many days. */
export const HANDLED_QUIET_DAYS = 7;
/** WEAK_SKILL threshold: the top of the Developing band. */
export const WEAK_MASTERY = 40;
const BAND_TEXT: Record<string, string> = { BEGINNING: "Beginning", DEVELOPING: "Developing", APPROACHING: "Approaching", PROFICIENT: "Proficient", MASTERED: "Mastered" };

/** A weak skill for an alert: mastery < 40 with enough evidence (effective N ≥ 5) and 5+ non-rapid recent answers. */
export function isWeakSkill(m: { score: number; attempts: number; components?: unknown; validRecent: number }): boolean {
  if (!(m.score < WEAK_MASTERY)) return false;
  let c: unknown = m.components;
  if (typeof c === "string") { try { c = JSON.parse(c); } catch { c = null; } }
  const effN = Number((c as { effectiveN?: unknown } | null)?.effectiveN);
  const enough = Number.isFinite(effN) ? effN >= 5 : m.attempts >= 8;
  return enough && m.validRecent >= 5;
}
/** Status of an alert merged into an older open alert of the same student and kind (kept for history, never shown). */
export const MERGED = "MERGED";

/** Keeps new alerts and sends ONE notification per teacher / admin. Runs at most every 3 hours (force = now). */
export async function scanAlerts(repo: Repo, schoolId: string, now = new Date(), force = false): Promise<number> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: SCAN_KEY }))[0];
  let last = 0; if (row) { let v: unknown = row.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } } last = Number((v as { at?: number } | null)?.at ?? 0); }
  if (!force && now.getTime() - last < 3 * 3600_000) return 0;
  // r85 audit: claim the scan window with a compare-and-set instead of an unconditional upsert — two staff opening
  // alert pages within the same second (more than 3h after the last scan) both used to pass the staleness check
  // above and then both run the whole (expensive) findAlerts() + StudentAlert writes concurrently, which could
  // throw on the StudentAlert unique(studentId,key) constraint or send duplicate "N new alerts" notifications.
  // Whoever's write loses the race (the row changed since we read it, or didn't exist and lost the create) skips
  // this scan entirely — the other caller's scan already covers the same window.
  const { claimSetting } = await import("../jobs/runner");
  const claimed = row
    ? (await repo.updateMany("SchoolSetting", { schoolId, key: SCAN_KEY, updatedAt: row.updatedAt }, { value: { at: now.getTime() }, updatedAt: now })) > 0
    : await claimSetting(repo, schoolId, SCAN_KEY, { at: now.getTime() });
  if (!claimed) return 0;
  const found = await findAlerts(repo, schoolId, now);
  // 🔴 early warning (early-warning.ts): each Urgent student is ONE open alert, raised by this same scan
  const { urgentFindings, EW_KIND } = await import("./early-warning");
  found.push(...await urgentFindings(repo, schoolId, now, weekKey(now)));
  // 📘 automatic Learn lessons, ONLY for clear, strong problems on one skill (learn/auto.ts); never breaks the scan
  try {
    const { autoLearnScan } = await import("../learn/auto");
    await safeIfBehind("learn.auto", () => autoLearnScan(repo, schoolId, now, new Set(found.filter((f) => f.kind === EW_KIND).map((f) => f.studentId))), 0);
  } catch (e) { console.error("learn.auto scan failed", e); }
  // readiness I-5: ONE open alert per student and kind. Findings of the same kind are merged (e.g. two weak skills);
  // an alert that is still open is refreshed ("still true on …"), not raised again every week
  const merged = new Map<string, Found>();
  for (const f of found) {
    const k = `${f.studentId}|${f.kind}`, prev = merged.get(k);
    if (!prev) merged.set(k, { ...f });
    else if (!prev.detail.includes(f.detail)) prev.detail = `${prev.detail} ${f.detail}`.slice(0, 500);
  }
  const open = await repo.findMany("StudentAlert", { schoolId, status: "OPEN" }, { select: ["id", "studentId", "kind", "key", "detail", "createdAt"] });
  // older data: several open alerts of the same kind for one student → the oldest stays open, the others are merged
  const openBy = new Map<string, Row>();
  const dupes: string[] = [];
  for (const r of [...open].sort((a, b) => time(a.createdAt) - time(b.createdAt) || s(a.id).localeCompare(s(b.id)))) {
    const k = `${s(r.studentId)}|${s(r.kind)}`;
    if (openBy.has(k)) dupes.push(s(r.id)); else openBy.set(k, r);
  }
  if (dupes.length) await repo.updateMany("StudentAlert", { id: { in: dupes } }, { status: MERGED, action: "Merged into the older open alert of the same kind.", handledAt: now });
  // 📉 a DECLINING alert closes itself when the daily level check no longer sees the decline (Update 39B): it is a
  // state, not an event — an up-and-down week must not leave a "declining" flag open for weeks
  const cleared = [...openBy.entries()].filter(([k]) => k.endsWith("|DECLINING") && !merged.has(k)).map(([, r]) => s(r.id));
  if (cleared.length) await repo.updateMany("StudentAlert", { id: { in: cleared } }, { status: "HANDLED", action: `Cleared automatically on ${now.toISOString().slice(0, 10)}: the recent answers no longer show a decline.`, handledAt: now });
  // the same for an urgent early warning that is no longer urgent
  const calm = [...openBy.entries()].filter(([k]) => k.endsWith(`|${EW_KIND}`) && !merged.has(k)).map(([, r]) => s(r.id));
  if (calm.length) await repo.updateMany("StudentAlert", { id: { in: calm } }, { status: "HANDLED", action: `Cleared automatically on ${now.toISOString().slice(0, 10)}: no longer urgent.`, handledAt: now });
  if (!merged.size) return 0;
  const studentIds = [...new Set([...merged.values()].map((f) => f.studentId))];
  const [have, recentHandled] = await Promise.all([
    repo.findMany("StudentAlert", { studentId: { in: studentIds } }, { select: ["studentId", "key"] }),
    repo.findMany("StudentAlert", { studentId: { in: studentIds }, status: "HANDLED", handledById: { not: null }, handledAt: { gte: new Date(now.getTime() - HANDLED_QUIET_DAYS * DAY) } }, { select: ["studentId", "kind"] }), // closed by a person (not cleared automatically)
  ]);
  const seen = new Set(have.map((h) => `${s(h.studentId)}#${s(h.key)}`));
  const quiet = new Set(recentHandled.map((h) => `${s(h.studentId)}|${s(h.kind)}`));
  const unique: Found[] = [];
  const day = now.toISOString().slice(0, 10);
  for (const [k, f] of merged) {
    const cur = openBy.get(k);
    if (cur) {
      const since = new Date(time(cur.createdAt)).toISOString().slice(0, 10);
      const detail = (since === day ? f.detail : `${f.detail} Still true on ${day} (open since ${since}).`).slice(0, 500);
      if (detail !== s(cur.detail)) await repo.updateMany("StudentAlert", { id: cur.id }, { detail });
      continue;
    }
    if (quiet.has(k)) continue; // the teacher acted on this in the last week: give it time
    if (seen.has(`${f.studentId}#${f.key}`)) continue;
    unique.push(f);
  }
  if (!unique.length) return 0;
  await repo.createMany("StudentAlert", unique.map((f) => ({ schoolId, classId: f.classId || null, studentId: f.studentId, kind: f.kind, key: f.key.slice(0, 120), detail: f.detail, status: "OPEN", createdAt: now })));
  // one notification per person: the teachers of the classes concerned, and the school admins
  const perUser = new Map<string, number>();
  const urgentOf = new Map<string, number>(); // new Urgent early warnings per person (the same ONE notification says so)
  const classIds = [...new Set(unique.map((f) => f.classId).filter(Boolean))];
  const ct = classIds.length ? await repo.findMany("ClassTeacher", { classId: { in: classIds } }) : [];
  const teachers = ct.length ? await repo.findMany("Teacher", { id: { in: [...new Set(ct.map((c) => s(c.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  for (const f of unique) for (const c of ct.filter((x) => x.classId === f.classId)) { const u = s(teachers.find((t) => t.id === c.teacherId)?.userId); if (u) { perUser.set(u, (perUser.get(u) ?? 0) + 1); if (f.kind === EW_KIND) urgentOf.set(u, (urgentOf.get(u) ?? 0) + 1); } }
  const admins = await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true }, { select: ["id"] });
  const urgentAll = unique.filter((f) => f.kind === EW_KIND).length;
  for (const a of admins) { perUser.set(s(a.id), unique.length); if (urgentAll) urgentOf.set(s(a.id), urgentAll); }
  if (perUser.size) await repo.createMany("Notification", [...perUser].map(([userId, n]) => {
    const u = urgentOf.get(userId) ?? 0;
    return u
      ? { userId, type: "INTERVENTION_ALERT", title: `🔴 ${u} urgent student${u === 1 ? "" : "s"} · ${n} new alert${n === 1 ? "" : "s"}`, body: "Early warning: a student needs action now. Open the list, act, and mark it handled.", link: "/teacher/reports/early-warning", createdAt: now }
      : { userId, type: "INTERVENTION_ALERT", title: `🚨 ${n} new student alert${n === 1 ? "" : "s"}`, body: "Students who need attention: open the list, act, and mark them handled.", link: "/teacher/alerts", createdAt: now };
  }));
  return unique.length;
}

export interface AlertRow { id: string; kind: AlertKind; icon: string; title: string; tip: string; studentId: string; name: string; className: string; classId: string | null; detail: string; status: "OPEN" | "HANDLED"; action: string | null; handledBy: string | null; handledAt: string | null; createdAt: string; ageDays: number }

/** The alerts this person may see: a teacher → their classes (a coordinator → their grades); the admin → all. */
export async function alertList(repo: Repo, actor: Actor, opts: { status?: "OPEN" | "HANDLED" | "ALL"; classId?: string | null; kind?: string | null } = {}, now = new Date()): Promise<AlertRow[]> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  await scanAlerts(repo, actor.schoolId!, now);
  const classes = await readableClasses(repo, actor);
  const allowed = new Set(classes.map((c) => s(c.id)));
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const where: Record<string, unknown> = { schoolId: actor.schoolId };
  if (opts.status && opts.status !== "ALL") where.status = opts.status;
  if (opts.kind) where.kind = opts.kind;
  let rows = await repo.findMany("StudentAlert", where);
  rows = rows.filter((r) => r.status !== MERGED && (isAdmin || allowed.has(s(r.classId))) && (!opts.classId || r.classId === opts.classId));
  const names = await studentNames(repo, [...new Set(rows.map((r) => s(r.studentId)))]);
  const handlers = [...new Set(rows.map((r) => s(r.handledById)).filter(Boolean))];
  const users = handlers.length ? await repo.findMany("User", { id: { in: handlers } }, { select: ["id", "displayName"] }) : [];
  const allClasses = isAdmin ? await repo.findMany("Class", { schoolId: actor.schoolId }, { select: ["id", "name"] }) : classes;
  return rows.map((r) => {
    const k = s(r.kind) as AlertKind, info = ALERT_INFO[k] ?? { icon: "•", title: k, tip: "" };
    return { id: s(r.id), kind: k, ...info, studentId: s(r.studentId), name: names.get(s(r.studentId))?.name ?? "Student", className: s(allClasses.find((c) => c.id === r.classId)?.name), classId: r.classId ? s(r.classId) : null, detail: s(r.detail), status: s(r.status) as "OPEN" | "HANDLED", action: r.action ? s(r.action) : null, handledBy: r.handledById ? s(users.find((u) => u.id === r.handledById)?.displayName) || null : null, handledAt: r.handledAt ? new Date(time(r.handledAt)).toISOString() : null, createdAt: new Date(time(r.createdAt)).toISOString(), ageDays: Math.floor((now.getTime() - time(r.createdAt)) / DAY) };
  }).sort((a, b) => Number(a.status === "HANDLED") - Number(b.status === "HANDLED") || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
}

export async function openAlertCount(repo: Repo, actor: Actor): Promise<number> {
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return repo.count("StudentAlert", { schoolId: actor.schoolId, status: "OPEN" });
  if (actor.role !== "TEACHER") return 0;
  const classes = await readableClasses(repo, actor);
  return classes.length ? repo.count("StudentAlert", { classId: { in: classes.map((c) => c.id) }, status: "OPEN" }) : 0;
}

/** The teacher records what was done and marks the alert handled (or reopens it). */
export async function handleAlert(repo: Repo, actor: Actor, alertId: string, action: string | null, reopen = false, now = new Date()): Promise<void> {
  assertCan(actor, "reports:read");
  const a = await repo.findUnique("StudentAlert", { id: alertId });
  if (!a || s(a.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Alert not found.");
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  if (!isAdmin) {
    if (actor.role !== "TEACHER") throw new ForbiddenError();
    const classes = await readableClasses(repo, actor);
    if (!classes.some((c) => c.id === a.classId)) throw new ForbiddenError("Not your student.");
  }
  if (reopen) { await repo.updateMany("StudentAlert", { id: alertId }, { status: "OPEN", handledAt: null, handledById: null }); return; }
  const text = s(action).trim();
  if (text.length < 3) throw new ValidationError("Write in a few words what you did (e.g. “Talked with the student”, “Called the parent”).");
  await repo.updateMany("StudentAlert", { id: alertId }, { status: "HANDLED", action: text.slice(0, 1000), handledById: actor.userId, handledAt: now });
  await audit(repo, { actorId: actor.userId, action: "alert.handled", entityType: "StudentAlert", entityId: alertId, after: { action: text.slice(0, 200) }, at: now });
}

/** For the department summary: open / handled per class and the oldest open. */
export async function alertStats(repo: Repo, schoolId: string): Promise<Map<string, { open: number; handled: number; oldestOpenDays: number | null }>> {
  const rows = await repo.findMany("StudentAlert", { schoolId }, { select: ["classId", "status", "createdAt"] });
  const out = new Map<string, { open: number; handled: number; oldestOpenDays: number | null }>();
  for (const r of rows) {
    if (r.status === MERGED) continue;
    const k = s(r.classId), v = out.get(k) ?? { open: 0, handled: 0, oldestOpenDays: null };
    if (r.status === "OPEN") { v.open++; const d = Math.floor((Date.now() - time(r.createdAt)) / DAY); v.oldestOpenDays = Math.max(v.oldestOpenDays ?? 0, d); } else v.handled++;
    out.set(k, v);
  }
  return out;
}

export { coordinatorGrades };
