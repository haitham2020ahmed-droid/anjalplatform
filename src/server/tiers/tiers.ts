/**
 * 🧭 Support tiers: the daily computation, the teacher's override and the reteach routing.
 *
 *   computeTiers   reads each student's evidence (Diagnostic, MAP, Weekly Checks, re-checks and text-set progress
 *                  checks, practice, risk,
 *                  fluency, interventions) in bounded queries (students in chunks of 300, rows grouped with Maps),
 *                  applies the rules (./rules.ts), writes StudentTier + TierChange, and tells the class teachers
 *                  (one TIER_CHANGE notification per teacher and run). A tier the teacher locked is never changed.
 *   setTierManually / unlockTier   the teacher of the student (or a school admin) overrides the tier (locks it), or
 *                  lets the rules decide again.
 *   reteach        a Tier 2/3 student with a focus skill gets (once) that skill assigned and a short 8-question
 *                  re-check 7–14 days later; the re-check's result is written into the routing's TierChange row
 *                  (source RETEACH) and counts as a check for the rules.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { log } from "../monitoring/log";
import { mapSummaries } from "../insights/student-data";
import { fluencySeason, wcpmPercentile } from "../fluency/norms";
import { progressCheckPoints } from "../progress-checks/score";
import { decideTier, nextCheckAt, MONITOR_EVERY_DAYS, TIER_RULES, type CheckPoint, type Tier, type TierEvidenceInput } from "./rules";
import { fluencySummary, isInvalidResult, pooledTheta } from "../curriculum-map/level-evidence";
import { scoringParams } from "../practice/scoring-params";

const DAY = 86_400_000;
export const CHUNK = 300;
/** at most this many new reteach routings per school and run (keeps the daily job bounded) */
export const MAX_ROUTINGS_PER_RUN = 100;
/** re-check items: 8, so a result that can move a tier rests on 8+ items (Update 39B; was 5) */
export const RECHECK_SIZE = 8;
/** days until the re-check opens: Tier 3 sooner */
export const RECHECK_AFTER_DAYS: Record<2 | 3, number> = { 2: 10, 3: 7 };
export const RECHECK_OPEN_DAYS = 7;
export const RECHECK_TITLE = "Re-check: ";
/** When each teacher lock was set: the teacher's latest TierChange (source TEACHER) per student. */
export async function lockedAtOf(repo: Repo, studentIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!studentIds.length) return out;
  for (const r of await repo.findMany("TierChange", { studentId: { in: studentIds }, source: "TEACHER" }, { select: ["studentId", "createdAt"] })) {
    const t = d(r.createdAt); if (!t) continue;
    const k = s(r.studentId); if (!out.has(k) || out.get(k)!.getTime() < t.getTime()) out.set(k, t);
  }
  return out;
}
/** A teacher's tier lock is reviewed after this many days (6 weeks): the tier stays, the rules then only suggest. */
export const LOCK_DAYS = 42;
/** When a teacher's lock passed LOCK_DAYS (from the time it was set: the teacher's latest TierChange), else null. */
export function lockExpiredAt(row: Row, now: Date, lockedAt?: Date | null): Date | null {
  if (!row.locked) return null;
  const set = lockedAt ?? d(row.updatedAt) ?? d(row.since);
  if (!set) return null;
  const until = new Date(set.getTime() + LOCK_DAYS * DAY);
  return now.getTime() >= until.getTime() ? until : null;
}

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
const asTier = (v: unknown): Tier => (Number(v) === 3 ? 3 : Number(v) === 2 ? 2 : 1);

function groupBy(rows: Row[], key = "studentId"): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const k = s(r[key]); const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); }
  return m;
}

export interface ComputeResult { students: number; changed: number; notified: number; routed: number; rechecksEvaluated: number; locked: number }
interface Change { studentId: string; from: Tier; to: Tier; reason: string }

/** Re-check outcomes: RETEACH rows whose re-check is done (or closed) get their result. Returns check points by student. */
type RawCheck = CheckPoint & { assignmentId?: string };
async function evaluateRechecks(repo: Repo, ids: string[], now: Date): Promise<{ points: Map<string, RawCheck[]>; evaluated: number }> {
  const points = new Map<string, RawCheck[]>();
  const rows = await repo.findMany("TierChange", { studentId: { in: ids }, source: "RETEACH", createdAt: { gte: new Date(now.getTime() - 180 * DAY) } }, { select: ["id", "studentId", "evidence", "createdAt"] });
  const pending: { row: Row; ev: Record<string, unknown>; aid: string }[] = [];
  for (const r of rows) {
    const ev = json<Record<string, unknown>>(r.evidence, {});
    const rc = ev.recheck as { assignmentId?: string } | null | undefined;
    const out = ev.outcome as { pct?: number; at?: string } | null | undefined;
    if (out && typeof out.pct === "number" && out.at) { const l = points.get(s(r.studentId)) ?? []; l.push({ at: new Date(out.at), pct: out.pct, kind: "RECHECK", assignmentId: rc?.assignmentId ? s(rc.assignmentId) : undefined }); points.set(s(r.studentId), l); }
    else if (!out && rc?.assignmentId) pending.push({ row: r, ev, aid: s(rc.assignmentId) });
  }
  if (!pending.length) return { points, evaluated: 0 };
  const aids = [...new Set(pending.map((p) => p.aid))];
  const [links, sessions] = await Promise.all([
    repo.findMany("AssignmentStudent", { assignmentId: { in: aids }, studentId: { in: ids } }, { select: ["assignmentId", "studentId", "status", "completedAt"] }),
    repo.findMany("PracticeSession", { assignmentId: { in: aids }, studentId: { in: ids } }, { select: ["assignmentId", "studentId", "questionCount", "correctCount", "endedAt"] }),
  ]);
  const link = new Map(links.map((l) => [`${s(l.assignmentId)}|${s(l.studentId)}`, l]));
  const ses = new Map(sessions.map((x) => [`${s(x.assignmentId)}|${s(x.studentId)}`, x]));
  let evaluated = 0;
  for (const p of pending) {
    const k = `${p.aid}|${s(p.row.studentId)}`, l = link.get(k), x = ses.get(k);
    const due = d((p.ev.recheck as { dueAt?: string }).dueAt);
    const done = s(l?.status) === "COMPLETED" || Boolean(x?.endedAt);
    let outcome: Record<string, unknown> | null = null;
    if (done && x && Number(x.questionCount) > 0) {
      const pctv = Math.round((100 * Number(x.correctCount)) / Number(x.questionCount));
      const at = d(l?.completedAt) ?? d(x.endedAt) ?? now;
      outcome = { pct: pctv, correct: Number(x.correctCount), total: Number(x.questionCount), at: at.toISOString(), passed: pctv >= 80, evaluatedAt: now.toISOString() };
      const list = points.get(s(p.row.studentId)) ?? []; list.push({ at, pct: pctv, kind: "RECHECK", assignmentId: p.aid }); points.set(s(p.row.studentId), list);
    } else if (!l || (due && due.getTime() < now.getTime())) outcome = { missed: true, evaluatedAt: now.toISOString() };
    if (outcome) { await repo.updateMany("TierChange", { id: p.row.id }, { evidence: { ...p.ev, outcome } }); evaluated++; }
  }
  return { points, evaluated };
}

/** Prior of a check's ability: grade level, wide (a check should speak for itself). */
export const CHECK_PRIOR_SD = 1.5;
/**
 * What each check's own answers say (Update 39B): valid items, % correct without rapid guesses, the ability (θ on
 * the grade scale, 3PL with the item format's guessing floor) and its standard error, and the rapid guesses.
 * Key: assignmentId|studentId. Bounded: the sessions of these assignments, then their answers.
 */
export async function checkDetails(repo: Repo, pairs: { assignmentId: string; studentId: string }[]): Promise<Map<string, { items: number; correct: number; rapid: number; theta: number | null; se: number | null }>> {
  const out = new Map<string, { items: number; correct: number; rapid: number; theta: number | null; se: number | null }>();
  if (!pairs.length) return out;
  const aids = [...new Set(pairs.map((p) => p.assignmentId))], sids = [...new Set(pairs.map((p) => p.studentId))];
  const sessions = await repo.findMany("PracticeSession", { assignmentId: { in: aids }, studentId: { in: sids } }, { select: ["id", "assignmentId", "studentId"] });
  if (!sessions.length) return out;
  const keyOf = new Map(sessions.map((x) => [s(x.id), `${s(x.assignmentId)}|${s(x.studentId)}`]));
  const attempts = await repo.findMany("QuestionAttempt", { sessionId: { in: [...keyOf.keys()] } }, { select: ["sessionId", "questionId", "isCorrect", "partialCredit", "difficultyB", "rapidGuess"] });
  const params = await scoringParams(repo, attempts.map((a) => s(a.questionId)));
  const by = new Map<string, Row[]>();
  for (const a of attempts) { const k = keyOf.get(s(a.sessionId))!; const l = by.get(k); if (l) l.push(a); else by.set(k, [a]); }
  for (const [k, list] of by) {
    const seen = new Set<string>(); const valid: Row[] = []; let rapid = 0;
    for (const a of list) { if (seen.has(s(a.questionId))) continue; seen.add(s(a.questionId)); if (a.rapidGuess) rapid++; else valid.push(a); }
    const credit = (a: Row) => (a.partialCredit !== null && a.partialCredit !== undefined ? Number(a.partialCredit) : a.isCorrect ? 1 : 0);
    const est = valid.length ? pooledTheta(valid.map((a) => ({ b: Number(a.difficultyB) || 0, c: params.get(s(a.questionId))?.c ?? 0, credit: credit(a), weight: 1 })), { mean: 0, sd: CHECK_PRIOR_SD }) : null;
    out.set(k, { items: valid.length, correct: valid.reduce((t, a) => t + credit(a), 0), rapid, theta: est ? est.theta : null, se: est ? est.se : null });
  }
  return out;
}

/** The tier rules for every student of a school (or some students). Idempotent: rows change only when the result does. */
export async function computeTiers(repo: Repo, schoolId: string, now = new Date(), opts: { studentIds?: string[]; notify?: boolean; route?: boolean } = {}): Promise<ComputeResult> {
  const res: ComputeResult = { students: 0, changed: 0, notified: 0, routed: 0, rechecksEvaluated: 0, locked: 0 };
  let students = await repo.findMany("Student", { schoolId, deletedAt: null }, { select: ["id", "gradeId"] });
  if (opts.studentIds) { const want = new Set(opts.studentIds); students = students.filter((x) => want.has(s(x.id))); }
  if (!students.length) return res;
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const gradeLevel = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const gradeOf = new Map(students.map((x) => [s(x.id), gradeLevel.get(s(x.gradeId)) ?? 0]));
  // the focus skill must be one the class can be assigned: an active skill of the grade's active curriculum
  const curs = await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => s(g.id)) }, isActive: true }, { select: ["id", "gradeId"] });
  const curSkills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => s(c.id)) }, deletedAt: null }, { select: ["id", "curriculumId", "isActive"] }) : [];
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), s(c.gradeId)]));
  const assignable = new Map<string, Set<string>>(); // gradeId → skill ids
  for (const k of curSkills) { if (k.isActive === false) continue; const g = gradeOfCur.get(s(k.curriculumId))!; const set = assignable.get(g) ?? new Set<string>(); set.add(s(k.id)); assignable.set(g, set); }
  const studentGrade = new Map(students.map((x) => [s(x.id), s(x.gradeId)]));
  // finished interventions of the school (one query), by student
  const ivs = await repo.findMany("Intervention", { schoolId, status: "DONE" }, { select: ["studentIds", "baseline", "result", "evaluatedAt", "endsAt", "startedAt", "skillId"] });
  const ivBy = new Map<string, TierEvidenceInput["interventions"]>();
  const noGain: { id: string; skillId: string; from: Date; to: Date; entry: TierEvidenceInput["interventions"][number] }[] = [];
  for (const iv of ivs) {
    const base = json<Record<string, number>>(iv.baseline, {}), after = json<Record<string, number>>(iv.result, {});
    const ended = d(iv.evaluatedAt) ?? d(iv.endsAt) ?? now;
    for (const id of json<string[]>(iv.studentIds, [])) {
      const entry = { endedAt: ended, skillId: s(iv.skillId), gain: Number(after[id] ?? base[id] ?? 0) - Number(base[id] ?? 0) };
      const l = ivBy.get(id) ?? []; l.push(entry); ivBy.set(id, l);
      if (entry.gain < TIER_RULES.INTERVENTION_GAIN) noGain.push({ id, skillId: entry.skillId, from: d(iv.startedAt) ?? new Date(ended.getTime() - 28 * DAY), to: ended, entry });
    }
  }
  // Update 39B: a "no gain" intervention is judged only on careful work — count the student's non-rapid answers on
  // the skill during it (bounded: only students with a no-gain intervention, only those skills)
  if (noGain.length) {
    const from = new Date(Math.min(...noGain.map((x) => x.from.getTime())));
    const sids = [...new Set(noGain.map((x) => x.id))], skids = [...new Set(noGain.map((x) => x.skillId))];
    for (let i = 0; i < sids.length; i += CHUNK) {
      const rows = await repo.findMany("QuestionAttempt", { studentId: { in: sids.slice(i, i + CHUNK) }, skillId: { in: skids }, rapidGuess: false, createdAt: { gte: from, lte: now } }, { select: ["studentId", "skillId", "createdAt"] });
      const at = new Map<string, number[]>();
      for (const r of rows) { const k = `${s(r.studentId)}|${s(r.skillId)}`; const l = at.get(k); const t = d(r.createdAt)?.getTime() ?? 0; if (l) l.push(t); else at.set(k, [t]); }
      const these = new Set(sids.slice(i, i + CHUNK));
      for (const x of noGain) if (these.has(x.id)) x.entry.validAnswers = (at.get(`${x.id}|${x.skillId}`) ?? []).filter((t) => t >= x.from.getTime() && t <= x.to.getTime()).length;
    }
  }
  const changes: Change[] = [];
  const suggestions: Change[] = [];
  const toRoute: { studentId: string; tier: 2 | 3; skillId: string }[] = [];
  const ids = students.map((x) => s(x.id));
  res.students = ids.length;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rc = await evaluateRechecks(repo, chunk, now);
    res.rechecksEvaluated += rc.evaluated;
    // completed text-set progress checks count as checks too (two < 60% / two ≥ 80% in a row move the tier)
    const pc = await progressCheckPoints(repo, schoolId, chunk, new Date(now.getTime() - 180 * DAY), now);
    const [tiers, diags, weekly, profiles, risks, fluency, mastery, maps, levelStates, studentRows] = await Promise.all([
      repo.findMany("StudentTier", { studentId: { in: chunk } }),
      repo.findMany("DiagnosticScore", { studentId: { in: chunk } }, { select: ["studentId", "pct", "level", "completedAt", "rapid", "total"] }),
      repo.findMany("WeeklyCheck", { studentId: { in: chunk }, completedAt: { gte: new Date(now.getTime() - 180 * DAY) } }, { select: ["studentId", "correct", "total", "completedAt", "assignmentId"] }),
      repo.findMany("StudentProfile", { studentId: { in: chunk } }, { select: ["studentId", "riskScore"] }),
      repo.findMany("RiskSnapshot", { studentId: { in: chunk }, takenOn: { gte: new Date(now.getTime() - 35 * DAY) } }, { select: ["studentId", "takenOn", "score"] }),
      repo.findMany("FluencyCheck", { studentId: { in: chunk }, checkedAt: { gte: new Date(now.getTime() - 365 * DAY) } }, { select: ["studentId", "wcpm", "percentile", "checkedAt", "season", "comprehension", "source"] }),
      repo.findMany("StudentSkillMastery", { studentId: { in: chunk }, lastPracticedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, { select: ["studentId", "skillId", "score", "attempts"] }),
      mapSummaries(repo, chunk, "READING", gradeOf),
      repo.findMany("StudentLevelState", { studentId: { in: chunk } }),
      repo.findMany("Student", { id: { in: chunk } }, { select: ["id", "createdAt"] }),
    ]);
    const stateOf = new Map(levelStates.map((r) => [s(r.studentId), r]));
    const createdOf = new Map(studentRows.map((r) => [s(r.id), d(r.createdAt)]));
    // what each check's answers say (θ, valid items, rapid guesses): checks of the last 8 weeks
    const recentFrom = now.getTime() - 56 * DAY;
    const pairs: { assignmentId: string; studentId: string }[] = [];
    for (const w of weekly) if (w.assignmentId && (d(w.completedAt)?.getTime() ?? 0) >= recentFrom) pairs.push({ assignmentId: s(w.assignmentId), studentId: s(w.studentId) });
    for (const [sid, list] of rc.points) for (const p of list) if (p.assignmentId && p.at.getTime() >= recentFrom) pairs.push({ assignmentId: p.assignmentId, studentId: sid });
    for (const [sid, list] of pc) for (const p of list) if (p.assignmentId && p.at.getTime() >= recentFrom) pairs.push({ assignmentId: p.assignmentId, studentId: sid });
    const details = await checkDetails(repo, pairs);
    const withDetails = (sid: string, p: RawCheck): CheckPoint => {
      const x = p.assignmentId ? details.get(`${p.assignmentId}|${sid}`) : undefined;
      if (!x || !(x.items + x.rapid)) return { at: p.at, pct: p.pct, kind: p.kind };
      const invalid = isInvalidResult(x.rapid, x.items + x.rapid);
      return { at: p.at, pct: x.items ? (100 * x.correct) / x.items : p.pct, kind: p.kind, items: x.items, theta: x.theta, se: x.se, rapid: x.rapid, invalid };
    };
    const tierOf = new Map(tiers.map((t) => [s(t.studentId), t]));
    const lockedAt = await lockedAtOf(repo, tiers.filter((t) => t.locked).map((t) => s(t.studentId)));
    const [diagBy, weekBy, riskBy, fluBy, mastBy] = [groupBy(diags), groupBy(weekly), groupBy(risks), groupBy(fluency), groupBy(mastery)];
    const riskOf = new Map(profiles.map((p) => [s(p.studentId), p.riskScore === null || p.riskScore === undefined ? null : Number(p.riskScore)]));
    const focusIds = new Set<string>();
    const decisions: { id: string; dec: ReturnType<typeof decideTier>; row: Row | undefined; lastCheck: Date | null; suggestOnly: boolean }[] = [];
    for (const id of chunk) {
      const row = tierOf.get(id);
      // a teacher's tier stays: within LOCK_DAYS it is not even re-evaluated; after that the rules only SUGGEST (S-8)
      const lockExpired = Boolean(row?.locked) && lockExpiredAt(row!, now, lockedAt.get(id)) !== null;
      if (row?.locked && !lockExpired) { res.locked++; continue; }
      if (row?.locked) res.locked++;
      const diag = (diagBy.get(id) ?? []).sort((a, b) => (d(b.completedAt)?.getTime() ?? 0) - (d(a.completedAt)?.getTime() ?? 0))[0];
      const m = maps.get(id)?.latest ?? null;
      const checks: CheckPoint[] = [
        ...(weekBy.get(id) ?? []).filter((w) => Number(w.total) > 0).map((w) => withDetails(id, { at: d(w.completedAt)!, pct: (100 * Number(w.correct)) / Number(w.total), kind: "WEEKLY" as const, assignmentId: w.assignmentId ? s(w.assignmentId) : undefined })),
        ...(rc.points.get(id) ?? []).map((p) => withDetails(id, p)),
        ...(pc.get(id) ?? []).filter((p) => p.at.getTime() <= now.getTime()).map((p) => withDetails(id, p)),
      ];
      // fluency: the median of the last 3 checks; one Fluency Coach score alone is only noted (Update 39B)
      const fluRows = (fluBy.get(id) ?? []).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0));
      const flu = fluRows[0];
      const fluAt = flu ? d(flu.checkedAt)! : null;
      const fs = fluencySummary(fluRows.map((f) => { const at = d(f.checkedAt)!; return { percentile: f.percentile !== null && f.percentile !== undefined ? Number(f.percentile) : wcpmPercentile(gradeOf.get(id) ?? 0, Number(f.wcpm), fluencySeason(at)), wcpm: Number(f.wcpm), at: at.getTime(), source: s(f.source) }; }));
      const fluP = fs ? fs.percentile : null;
      const ls = stateOf.get(id);
      const created = createdOf.get(id);
      const ms = (mastBy.get(id) ?? []);
      const canAssign = assignable.get(studentGrade.get(id) ?? "");
      const weak = ms.filter((x) => Number(x.attempts ?? 0) >= 5 && Number(x.score) < 60 && (!canAssign || canAssign.has(s(x.skillId)))).sort((a, b) => Number(a.score) - Number(b.score))[0];
      const input: TierEvidenceInput = {
        // the minimum time in a tier applies to tiers the rules set; after the teacher unlocks, the rules decide at once
        current: row ? { tier: asTier(row.tier), since: s(row.source) === "AUTO" ? d(row.since) ?? now : new Date(0) } : null,
        diagnostic: diag ? { pct: Number(diag.pct), level: s(diag.level) as "BELOW" | "ON" | "ABOVE", at: d(diag.completedAt) ?? now, valid: !isInvalidResult(Number(diag.rapid ?? 0), Number(diag.total ?? 0)), why: isInvalidResult(Number(diag.rapid ?? 0), Number(diag.total ?? 0)) ? `invalid: ${Number(diag.rapid)} of ${Number(diag.total)} answers were rapid guesses — re-test` : null } : null,
        map: m ? { percentile: m.percentile, at: new Date(m.date), rit: m.rit, term: m.term } : null,
        checks,
        practice: { avgMastery: ms.length ? ms.reduce((t, x) => t + Number(x.score), 0) / ms.length : null, skills: ms.length, weakSkill: weak ? { skillId: s(weak.skillId), mastery: Number(weak.score) } : null },
        risk: riskOf.get(id) ?? null,
        riskHistory: (riskBy.get(id) ?? []).map((r) => ({ at: d(r.takenOn) ?? now, score: Number(r.score) })),
        fluency: flu && fs ? { percentile: fluP, wcpm: fs.wcpm, at: fluAt!, comprehension: flu.comprehension === null || flu.comprehension === undefined ? null : Number(flu.comprehension), usable: fs.usable, checks: fs.checks } : null,
        interventions: ivBy.get(id) ?? [],
        platform: { days: created ? Math.floor((now.getTime() - created.getTime()) / DAY) : 0, answers: ls ? Number(ls.effN ?? 0) : 0 },
        level: ls ? { level: s(ls.level) as "BELOW" | "ON" | "ABOVE", source: s(ls.source), declining: Boolean(ls.declining), theta: ls.theta === null || ls.theta === undefined ? null : Number(ls.theta), recentTheta: ls.thetaRecent === null || ls.thetaRecent === undefined ? null : Number(ls.thetaRecent), priorTheta: ls.thetaPrior === null || ls.thetaPrior === undefined ? null : Number(ls.thetaPrior) } : null,
      };
      if (weak) focusIds.add(s(weak.skillId));
      const valid = checks.filter((c) => !c.invalid);
      const lastCheck = valid.length ? new Date(Math.max(...valid.map((c) => c.at.getTime()))) : null;
      decisions.push({ id, dec: decideTier(input, now), row, lastCheck, suggestOnly: lockExpired });
    }
    // skill names for the reasons
    const names = focusIds.size ? new Map((await repo.findMany("Skill", { id: { in: [...focusIds] } }, { select: ["id", "name"] })).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
    for (const { id, dec, row, lastCheck, suggestOnly } of decisions) {
      const reason = dec.focusSkillId && names.has(dec.focusSkillId) ? dec.reason.replace("weakest current skill", names.get(dec.focusSkillId)!) : dec.reason;
      if (suggestOnly && row) {
        // the teacher's lock is older than LOCK_DAYS: keep the teacher's tier, record what the rules suggest (once per
        // suggested tier since the lock) and tell the teachers; the teacher confirms, changes or unlocks it
        const from = asTier(row.tier);
        if (dec.tier !== from) {
          const setAt = lockedAt.get(id) ?? d(row.updatedAt) ?? now;
          const prev = (await repo.findMany("TierChange", { studentId: id, source: "SUGGEST", createdAt: { gte: setAt } }, { select: ["toTier"] })).some((x) => Number(x.toTier) === dec.tier);
          if (!prev) {
            await repo.create("TierChange", { studentId: id, schoolId, fromTier: from, toTier: dec.tier, source: "SUGGEST", reason: `Review the teacher's tier (set over ${LOCK_DAYS} days ago): the rules suggest Tier ${dec.tier}. ${reason}`.slice(0, 1000), evidence: { lockExpired: true, triggers: dec.triggers }, changedById: null, createdAt: now });
            suggestions.push({ studentId: id, from, to: dec.tier, reason });
          }
        }
        continue;
      }
      const from = row ? asTier(row.tier) : 1;
      const moved = !row ? dec.tier !== 1 : from !== dec.tier;
      const since = moved || !row ? now : d(row.since) ?? now;
      const reviewAt = nextCheckAt(dec.tier, since, lastCheck);
      const data = { schoolId, tier: dec.tier, source: "AUTO", locked: false, reason, focusSkillId: dec.focusSkillId, since, reviewAt, monitorEveryDays: MONITOR_EVERY_DAYS[dec.tier] };
      if (!row) await repo.create("StudentTier", { studentId: id, ...data });
      else if (moved || s(row.reason) !== reason || s(row.focusSkillId) !== s(dec.focusSkillId) || (d(row.reviewAt)?.getTime() ?? 0) !== (reviewAt?.getTime() ?? 0) || s(row.source) !== "AUTO") {
        await repo.updateMany("StudentTier", { studentId: id }, data);
      }
      if (moved) {
        await repo.create("TierChange", { studentId: id, schoolId, fromTier: from, toTier: dec.tier, source: "AUTO", reason, evidence: { ...dec.evidence, triggers: dec.triggers, refer: dec.refer }, changedById: null, createdAt: now });
        changes.push({ studentId: id, from, to: dec.tier, reason });
      }
      if (dec.tier >= 2 && dec.focusSkillId) toRoute.push({ studentId: id, tier: dec.tier as 2 | 3, skillId: dec.focusSkillId });
    }
  }
  res.changed = changes.length;
  if (suggestions.length && opts.notify !== false) await notifyTeachers(repo, suggestions, now, true).catch((e) => log("error", "tiers.suggest.notify.failed", { schoolId, error: e }));
  if (changes.length && opts.notify !== false) res.notified = await notifyTeachers(repo, changes, now).catch((e) => { log("error", "tiers.notify.failed", { schoolId, error: e }); return 0; });
  if (toRoute.length && opts.route !== false) res.routed = await routeReteach(repo, schoolId, toRoute, now).catch((e) => { log("error", "tiers.reteach.failed", { schoolId, error: e }); return 0; });
  return res;
}

/** The class teachers of these students: teacher userId → student ids. */
async function teachersOf(repo: Repo, studentIds: string[]): Promise<Map<string, { userId: string; teacherId: string; students: { studentId: string; classId: string }[] }>> {
  const out = new Map<string, { userId: string; teacherId: string; students: { studentId: string; classId: string }[] }>();
  if (!studentIds.length) return out;
  const members = await repo.findMany("ClassMembership", { studentId: { in: studentIds }, leftAt: null }, { select: ["classId", "studentId"] });
  if (!members.length) return out;
  const links = await repo.findMany("ClassTeacher", { classId: { in: [...new Set(members.map((m) => s(m.classId)))] } }, { select: ["classId", "teacherId"] });
  const teachers = links.length ? await repo.findMany("Teacher", { id: { in: [...new Set(links.map((l) => s(l.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  const userOf = new Map(teachers.map((t) => [s(t.id), s(t.userId)]));
  const linksBy = groupBy(links, "classId");
  for (const m of members) for (const l of linksBy.get(s(m.classId)) ?? []) {
    const u = userOf.get(s(l.teacherId)); if (!u) continue;
    const e = out.get(u) ?? { userId: u, teacherId: s(l.teacherId), students: [] };
    e.students.push({ studentId: s(m.studentId), classId: s(m.classId) }); out.set(u, e);
  }
  return out;
}

/** The support levels in plain words (Teacher Home, notifications); the Tier term stays beside them. */
export const SUPPORT_WORDS: Record<number, string> = { 1: "needs no support", 2: "needs some support", 3: "needs strong support" };

/** One TIER_CHANGE notification per teacher and run, naming the students who moved. */
async function notifyTeachers(repo: Repo, changes: Change[], now: Date, suggest = false): Promise<number> {
  const by = await teachersOf(repo, changes.map((c) => c.studentId));
  if (!by.size) return 0;
  const st = await repo.findMany("Student", { id: { in: changes.map((c) => c.studentId) } }, { select: ["id", "userId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName) || "Student"]));
  const name = new Map(st.map((x) => [s(x.id), uname.get(s(x.userId)) ?? "Student"]));
  const change = new Map(changes.map((c) => [c.studentId, c]));
  const rows: Row[] = [];
  for (const t of by.values()) {
    const mine = [...new Set(t.students.map((x) => x.studentId))].map((id) => change.get(id)!).filter(Boolean);
    if (!mine.length) continue;
    const list = mine.slice(0, 6).map((c) => `${name.get(c.studentId)}: Tier ${c.from} → Tier ${c.to}`).join("; ");
    const classId = t.students[0].classId;
    if (suggest) rows.push({ userId: t.userId, type: "TIER_CHANGE", title: `🧭 Review ${mine.length} tier${mine.length === 1 ? "" : "s"} you set`, body: `${list.replace(/Tier (\d) → Tier (\d)/g, "your Tier $1, the rules suggest Tier $2")}${mine.length > 6 ? ` and ${mine.length - 6} more` : ""}. You set these more than ${LOCK_DAYS} days ago: confirm (set the tier again), change it, or unlock it.`, link: `/teacher/tiers?class=${classId}`, readAt: null, createdAt: now });
    // plain words for the teacher ("Ahmed improved — now needs some support"), the Tier term in brackets
    else {
      const plain = mine.slice(0, 6).map((c) => `${name.get(c.studentId)} ${c.to < c.from ? "improved" : "needs more help"} — now ${SUPPORT_WORDS[c.to] ?? `Tier ${c.to}`} (Tier ${c.to})`).join("; ");
      rows.push({ userId: t.userId, type: "TIER_CHANGE", title: mine.length === 1 ? `🛟 ${plain.split(" (Tier")[0]}` : `🛟 Support changed for ${mine.length} students`, body: `${plain}${mine.length > 6 ? ` and ${mine.length - 6} more` : ""}. Open the Support plan to see why and to create a plan.`, link: `/teacher/plans/support?classId=${classId}`, readAt: null, createdAt: now });
    }
  }
  if (rows.length) await repo.createMany("Notification", rows);
  return rows.length;
}

// ------------------------------------------------------------------ reteach routing

/** Assigns the focus skill and a later 8-question re-check, once per student and skill (21 days), and invites the student to the skill's lesson. */
export async function routeReteach(repo: Repo, schoolId: string, items: { studentId: string; tier: 2 | 3; skillId: string }[], now = new Date()): Promise<number> {
  if (!items.length) return 0;
  const ids = [...new Set(items.map((x) => x.studentId))];
  const recent = await repo.findMany("TierChange", { studentId: { in: ids }, source: "RETEACH", createdAt: { gte: new Date(now.getTime() - 21 * DAY) } }, { select: ["studentId", "evidence"] });
  const busy = new Set<string>();
  for (const r of recent) { const ev = json<Record<string, unknown>>(r.evidence, {}); busy.add(s(r.studentId)); busy.add(`${s(r.studentId)}|${s(ev.skillId)}`); }
  const todo = items.filter((x) => !busy.has(x.studentId)).slice(0, MAX_ROUTINGS_PER_RUN);
  if (!todo.length) return 0;
  const teachers = await teachersOf(repo, todo.map((x) => x.studentId));
  const teacherFor = new Map<string, { userId: string; classId: string }>();
  for (const t of teachers.values()) for (const x of t.students) if (!teacherFor.has(x.studentId)) teacherFor.set(x.studentId, { userId: t.userId, classId: x.classId });
  const skills = [...new Set(todo.map((x) => x.skillId))];
  const [skillRows, qs] = await Promise.all([
    repo.findMany("Skill", { id: { in: skills } }, { select: ["id", "name"] }),
    repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "typeId"] }),
  ]);
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] }) : [];
  const auto = new Set(types.filter((t) => t.isAutoScored !== false && s(t.code) !== "SHORT_ANSWER").map((t) => s(t.id)));
  const qBy = groupBy(qs.filter((q) => auto.has(s(q.typeId))), "skillId");
  const skillName = new Map(skillRows.map((k) => [s(k.id), s(k.name)]));
  const { assignSkill, assignQuestions } = await import("../teacher/assign");
  const { inviteToLesson } = await import("../lessons/run");
  let routed = 0;
  for (const x of todo) {
    const t = teacherFor.get(x.studentId);
    if (!t) continue;
    const actor: Actor = { userId: t.userId, role: "TEACHER", schoolId };
    const after = RECHECK_AFTER_DAYS[x.tier];
    const startAt = new Date(now.getTime() + after * DAY), dueAt = new Date(startAt.getTime() + RECHECK_OPEN_DAYS * DAY);
    try {
      const practice = await assignSkill(repo, actor, { classId: t.classId, skillId: x.skillId, studentIds: [x.studentId], dueAt: startAt, note: "Extra practice on this skill, then a short re-check." }, now);
      // the re-check: 8 questions on the skill, spread over the pool (a different set for each student)
      const pool = (qBy.get(x.skillId) ?? []).map((q) => s(q.id)).sort();
      let recheck: { assignmentId: string; startAt: string; dueAt: string; questions: number } | null = null;
      if (pool.length >= 3) {
        const off = [...x.studentId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % pool.length;
        const pick = Array.from({ length: Math.min(RECHECK_SIZE, pool.length) }, (_, k) => pool[(off + Math.floor((k * pool.length) / Math.min(RECHECK_SIZE, pool.length))) % pool.length]);
        const set = await assignQuestions(repo, actor, { classId: t.classId, questionIds: [...new Set(pick)], studentIds: [x.studentId], title: `${RECHECK_TITLE}${skillName.get(x.skillId) ?? "skill"}`, exactTitle: true, startAt, dueAt, silent: true }, now);
        recheck = { assignmentId: set.assignmentId, startAt: startAt.toISOString(), dueAt: dueAt.toISOString(), questions: set.questions };
      }
      await repo.create("TierChange", {
        studentId: x.studentId, schoolId, fromTier: x.tier, toTier: x.tier, source: "RETEACH",
        reason: `Reteach: ${skillName.get(x.skillId) ?? "focus skill"} assigned${recheck ? `; ${RECHECK_SIZE}-question re-check opens ${startAt.toISOString().slice(0, 10)}` : " (not enough questions for a re-check)"}.`,
        evidence: { kind: "RETEACH", skillId: x.skillId, assignmentId: practice.assignmentId, recheck, outcome: null }, changedById: null, createdAt: now,
      });
      routed++;
      // 🧩 the student is also invited to the interactive lesson for the focus skill (once: an open run is not invited again)
      await inviteToLesson(repo, x.studentId, x.skillId, "TIER", now, "A short lesson on your focus skill: examples, hints and a quick check.").catch((e) => log("warn", "tiers.lesson.invite.failed", { schoolId, studentId: x.studentId, error: e }));
    } catch (e) {
      log("warn", "tiers.reteach.skip", { schoolId, studentId: x.studentId, skillId: x.skillId, error: e });
    }
  }
  return routed;
}

// ------------------------------------------------------------------ teacher override

/** The student, if the actor may change their tier: their class teacher, a school admin of the school, a super admin. */
export async function assertTierAccess(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || st.deletedAt) throw new ForbiddenError("Student not found.");
  if (actor.role === "SUPER_ADMIN") return st;
  if (actor.role === "SCHOOL_ADMIN" && actor.schoolId && actor.schoolId === s(st.schoolId)) return st;
  if (actor.role === "TEACHER" && actor.schoolId && actor.schoolId === s(st.schoolId)) {
    const t = await repo.findUnique("Teacher", { userId: actor.userId });
    if (t) {
      const classes = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
      if (classes.length && (await repo.count("ClassTeacher", { teacherId: t.id, classId: { in: classes } })) > 0) return st;
    }
  }
  throw new ForbiddenError("Only the student's teacher or a school admin can change their tier.");
}

/** The teacher sets the tier (with a reason): it is locked, so the daily rules leave it. */
export async function setTierManually(repo: Repo, actor: Actor, input: { studentId: string; tier: number; reason: string; focusSkillId?: string | null }, now = new Date()): Promise<void> {
  const st = await assertTierAccess(repo, actor, input.studentId);
  const tier = Number(input.tier);
  if (tier !== 1 && tier !== 2 && tier !== 3) throw new ValidationError("Choose Tier 1, 2 or 3.");
  const reason = s(input.reason).replace(/\s+/g, " ").trim().slice(0, 1000);
  if (reason.length < 3) throw new ValidationError("Write a short reason for the tier.");
  const row = await repo.findUnique("StudentTier", { studentId: input.studentId });
  const from = row ? asTier(row.tier) : 1;
  const since = !row || from !== tier ? now : d(row.since) ?? now;
  const focus = input.focusSkillId === undefined ? (row?.focusSkillId ? s(row.focusSkillId) : null) : input.focusSkillId || null;
  const data = { schoolId: s(st.schoolId), tier, source: "TEACHER", locked: true, reason: `Set by the teacher: ${reason}`, focusSkillId: tier >= 2 ? focus : null, since, reviewAt: nextCheckAt(tier as Tier, since, null), monitorEveryDays: MONITOR_EVERY_DAYS[tier as Tier] };
  await repo.upsert("StudentTier", { studentId: input.studentId }, { studentId: input.studentId, ...data }, data);
  await repo.create("TierChange", { studentId: input.studentId, schoolId: s(st.schoolId), fromTier: from, toTier: tier, source: "TEACHER", reason, evidence: { locked: true }, changedById: actor.userId, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "tier.set", entityType: "Student", entityId: input.studentId, before: row ? { tier: from, source: s(row.source) } : null, after: { tier, reason } });
}

/** "Unlock (let the rules decide)": the rules run again for this student at once. */
export async function unlockTier(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<void> {
  const st = await assertTierAccess(repo, actor, studentId);
  const row = await repo.findUnique("StudentTier", { studentId });
  if (!row) return;
  await repo.updateMany("StudentTier", { studentId }, { locked: false, source: "UNLOCKED" });
  await audit(repo, { actorId: actor.userId, action: "tier.unlock", entityType: "Student", entityId: studentId, before: { tier: asTier(row.tier), source: s(row.source) }, after: { locked: false } });
  await computeTiers(repo, s(st.schoolId), now, { studentIds: [studentId], notify: false, route: false });
}
