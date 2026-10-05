/**
 * Intervention detection. Rules run per student × skill over recent evidence:
 *   LOW_ACCURACY       ≥ 8 answers in 14 days, < 60% correct AND mastery < 40
 *   REPEATED_ERRORS    ≥ 4 wrong in the last 6 answers AND mastery < 60
 *   DECLINING_MASTERY  current mastery ≥ 15 points below its peak in the last 30 days
 *   SLOW_RESPONSES     ≥ 8 answers, average time > 2× the expected time
 *   FAILED_SESSIONS    ≥ 3 sessions in 30 days each below 50% correct
 *   PREREQ_GAP         the engine routed the student to a prerequisite ≥ 2 times in 14 days
 * At most ONE open alert per student × skill: all findings are merged into it (the most
 * important rule leads the message), so teachers are not flooded. Teachers resolve them.
 * (Thresholds were tightened after a 14-student simulated class produced 20 alerts.)
 * Rapid guesses are excluded from accuracy rules (they are handled as engagement).
 */
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";

export type RuleCode = "LOW_ACCURACY" | "REPEATED_ERRORS" | "DECLINING_MASTERY" | "SLOW_RESPONSES" | "FAILED_SESSIONS" | "PREREQ_GAP";

export const NEXT_ACTION: Record<RuleCode, string> = {
  LOW_ACCURACY: "Reteach the skill in a small group, then assign 10 minutes of practice.",
  REPEATED_ERRORS: "Check the recent wrong answers below for a shared misconception and model one example.",
  DECLINING_MASTERY: "Assign a short review; the skill may need refreshing.",
  SLOW_RESPONSES: "Check whether reading load is the barrier: try reading the passage aloud together.",
  FAILED_SESSIONS: "Meet briefly with the student; consider practising the prerequisite skill first.",
  PREREQ_GAP: "Assign the building-block skill the engine pointed to before returning to this one.",
};

/** Which rule leads when several fire for the same student × skill. */
const PRIORITY: RuleCode[] = ["FAILED_SESSIONS", "LOW_ACCURACY", "DECLINING_MASTERY", "REPEATED_ERRORS", "PREREQ_GAP", "SLOW_RESPONSES"];

const RULE_TEXT: Record<RuleCode, string> = {
  LOW_ACCURACY: "accuracy is below 60%",
  REPEATED_ERRORS: "several recent answers were wrong",
  DECLINING_MASTERY: "mastery has dropped",
  SLOW_RESPONSES: "answers are taking much longer than expected",
  FAILED_SESSIONS: "several practice sessions ended below 50%",
  PREREQ_GAP: "a building-block skill is not secure yet",
};

export interface Finding {
  rule: RuleCode;
  evidence: Record<string, unknown>;
}

interface AttemptLite { correct: boolean; at: number; ms: number; est: number; rapid: boolean; session: string; questionRef: string }
const DAY = 86_400_000;

/** Pure rule evaluation for one student × skill. */
export function evaluateRules(input: {
  attempts: AttemptLite[]; // oldest first
  masteryNow: number;
  masteryPeak30d: number;
  prereqRoutes14d: number;
  now: number;
}): Finding[] {
  const out: Finding[] = [];
  const recent14 = input.attempts.filter((a) => !a.rapid && input.now - a.at <= 14 * DAY);
  if (recent14.length >= 8) {
    const acc = recent14.filter((a) => a.correct).length / recent14.length;
    // adaptive practice deliberately serves challenging items, so low accuracy alone is not a concern:
    // it must come with low mastery
    if (acc < 0.6 && input.masteryNow < 40) out.push({ rule: "LOW_ACCURACY", evidence: { answers: recent14.length, accuracyPct: Math.round(acc * 100) } });
  }
  const last6 = input.attempts.filter((a) => !a.rapid).slice(-6);
  const wrong6 = last6.filter((a) => !a.correct);
  if (last6.length >= 6 && wrong6.length >= 4 && input.masteryNow < 60) out.push({ rule: "REPEATED_ERRORS", evidence: { wrongOfLast6: wrong6.length, questions: wrong6.map((a) => a.questionRef) } });
  if (input.masteryPeak30d - input.masteryNow >= 15) out.push({ rule: "DECLINING_MASTERY", evidence: { peak: Math.round(input.masteryPeak30d), now: Math.round(input.masteryNow) } });
  const timed = input.attempts.filter((a) => !a.rapid).slice(-12);
  if (timed.length >= 8) {
    const ratio = timed.reduce((s, a) => s + a.ms / (a.est * 1000), 0) / timed.length;
    if (ratio > 2) out.push({ rule: "SLOW_RESPONSES", evidence: { answers: timed.length, timesExpected: Math.round(ratio * 10) / 10 } });
  }
  const bySession = new Map<string, AttemptLite[]>();
  for (const a of input.attempts.filter((x) => input.now - x.at <= 30 * DAY)) (bySession.get(a.session) ?? bySession.set(a.session, []).get(a.session)!).push(a);
  const failed = [...bySession.values()].filter((as) => as.length >= 3 && as.filter((a) => a.correct).length / as.length < 0.5);
  if (failed.length >= 3) out.push({ rule: "FAILED_SESSIONS", evidence: { sessions: failed.length } });
  if (input.prereqRoutes14d >= 2) out.push({ rule: "PREREQ_GAP", evidence: { routes: input.prereqRoutes14d } });
  return out;
}

const t = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).getTime();

/** Scan a set of students and create (deduplicated) alerts. Returns the number created. */
export async function scanInterventions(repo: Repo, studentIds: string[], now = new Date()): Promise<number> {
  if (!studentIds.length) return 0;
  const since = new Date(now.getTime() - 30 * DAY);
  const [attempts, mastery, logs, open, students] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: since } }),
    repo.findMany("StudentSkillMastery", { studentId: { in: studentIds } }),
    repo.findMany("AdaptiveDecisionLog", { studentId: { in: studentIds }, createdAt: { gte: since } }),
    repo.findMany("InterventionAlert", { studentId: { in: studentIds }, resolvedAt: null }),
    repo.findMany("Student", { id: { in: studentIds } }),
  ]);
  const qIds = [...new Set(attempts.map((a) => String(a.questionId)))];
  const questions = qIds.length ? await repo.findMany("Question", { id: { in: qIds } }) : [];
  const qMeta = new Map(questions.map((q) => [String(q.id), q]));
  const skillIds = [...new Set(attempts.map((a) => String(a.skillId)))];
  const skills = new Map((skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }) : []).map((k) => [String(k.id), String(k.name)]));
  const users = new Map((await repo.findMany("User", { id: { in: students.map((s) => s.userId) } })).map((u) => [String(u.id), String(u.displayName)]));
  const nameOf = new Map(students.map((s) => [String(s.id), (users.get(String(s.userId)) ?? "This student").split(" ")[0]]));
  const openKey = new Set(open.map((a) => `${a.studentId}|${a.skillId}`));
  let created = 0;
  for (const sid of studentIds) {
    const mine = attempts.filter((a) => a.studentId === sid);
    for (const skillId of new Set(mine.map((a) => String(a.skillId)))) {
      const as = mine.filter((a) => a.skillId === skillId).sort((a, b) => t(a.createdAt) - t(b.createdAt)).map((a) => ({
        correct: Boolean(a.isCorrect), at: t(a.createdAt), ms: Number(a.responseMs), rapid: Boolean(a.rapidGuess), session: String(a.sessionId),
        est: Number(qMeta.get(String(a.questionId))?.estimatedSeconds ?? 45), questionRef: String(qMeta.get(String(a.questionId))?.externalRef ?? a.questionId),
      }));
      const skillLogs = logs.filter((l) => l.studentId === sid && l.skillId === skillId);
      const m = mastery.find((x) => x.studentId === sid && x.skillId === skillId);
      const findings = evaluateRules({
        attempts: as,
        masteryNow: Number(m?.score ?? 0),
        masteryPeak30d: Math.max(Number(m?.score ?? 0), ...skillLogs.map((l) => Number(l.masteryAfter ?? 0))),
        prereqRoutes14d: skillLogs.filter((l) => l.reasonCode === "PREREQ_ROUTE" && now.getTime() - t(l.createdAt) <= 14 * DAY).length,
        now: now.getTime(),
      });
      if (!findings.length) continue;
      const key = `${sid}|${skillId}`;
      if (openKey.has(key)) continue;
      openKey.add(key);
      const ordered = [...findings].sort((a, b) => PRIORITY.indexOf(a.rule) - PRIORITY.indexOf(b.rule));
      const lead = ordered[0].rule;
      const reasons = ordered.map((f) => RULE_TEXT[f.rule]);
      const reasonText = reasons.length === 1 ? reasons[0] : `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
      await repo.create("InterventionAlert", {
        studentId: sid, skillId, ruleCode: lead,
        message: `${nameOf.get(sid)} may need support with ${skills.get(skillId) ?? "a skill"}: ${reasonText}.`,
        evidence: { rules: ordered.map((f) => ({ rule: f.rule, ...f.evidence })), nextAction: NEXT_ACTION[lead] }, createdAt: now,
      });
      created++;
    }
  }
  return created;
}

export async function resolveAlert(repo: Repo, actor: Actor, alertId: string, note?: string): Promise<void> {
  const a = await repo.findUnique("InterventionAlert", { id: alertId });
  if (!a) throw new ForbiddenError("Alert not found.");
  const st = (await repo.findUnique("Student", { id: a.studentId }))!;
  if (!canAccessStudent(actor, { studentId: String(st.id), schoolId: String(st.schoolId) })) throw new ForbiddenError("You cannot manage this student's alerts.");
  await repo.updateMany("InterventionAlert", { id: alertId }, { resolvedAt: new Date() });
  await audit(repo, { actorId: actor.userId, action: "intervention.resolve", entityType: "InterventionAlert", entityId: alertId, after: { note: note ?? null } });
}

export type { Row };
