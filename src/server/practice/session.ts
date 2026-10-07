/**
 * Adaptive practice sessions.
 *
 *   startPractice   → open (or resume) a session for a skill, choose the first item
 *   currentQuestion → the safe payload for the item being shown
 *   submitAnswer    → ONE transaction: verify ownership + current item, time it on the
 *                     server, score it, run the adaptive engine, persist the attempt,
 *                     decision log, ability, mastery and XP, choose the next item, and
 *                     return feedback (only now are the answer and explanations revealed)
 *   endPractice     → close the session
 *
 * Rules: a student can only use their own sessions; answers are accepted only for the
 * question currently served (no replays or double-submits); response time comes from
 * the server clock, not the browser.
 */
import { modelVersion } from "../cache/bank-version";
import { resolveEngineConfig, ENGINE_VERSION, type AdaptiveConfig, type MasteryThresholds } from "../../config/engine";
import { processAnswer } from "../../adaptive/engine";
import { selectNextItem, type PrerequisiteStatus } from "../../adaptive/selector";
import { scoreResponse } from "../../imports/questions/validate";
import type { MasteryResult, ResponseEvidence } from "../../types/domain";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { correctAnswerText, loadSkillItems, studentAnswerText, toCandidate, toClientQuestion, whyChosenWrong, type ClientQuestion, type PracticeItem } from "./items";
import { openAssignmentFor, refreshAfterAnswer } from "../teacher/assign";

export const SESSION_RESUME_MINUTES = 120;
export const MAX_QUESTIONS_PER_SESSION = 20;
const HISTORY_WINDOW = 60;

export interface PracticeView {
  sessionId: string;
  skillId: string;
  skillName: string;
  question: ClientQuestion | null;
  answered: number;
  correct: number;
  mastery: number;
  band: string;
  ended: boolean;
  endReason: string | null;
}

export interface Feedback {
  correct: boolean;
  credit: number;
  yourAnswer: string;
  correctAnswer: string;
  whyCorrect: string;
  whyYoursIsWrong: string | null;
  tip: string;
  rapidGuess: boolean;
  masteryBefore: number;
  masteryAfter: number;
  band: string;
  xp: number;
  next: { hasQuestion: boolean; endReason: string | null; routeToSkillId: string | null; routeToSkillName: string | null };
}

const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

/**
 * Reference data read on every answer but rarely changed (engine settings, prerequisites, skill rows) is
 * kept in memory and reused only while no write to those tables has happened (modelVersion).
 */
const refCache = new Map<string, { v: string; value: unknown }>();
async function cached<T>(key: string, models: string[], load: () => Promise<T>): Promise<T> {
  const v = modelVersion(...models);
  const hit = refCache.get(key);
  if (hit && hit.v === v) return hit.value as T;
  const value = await load();
  if (refCache.size > 20_000) refCache.clear();
  refCache.set(key, { v, value });
  return value;
}

async function engineConfig(repo: Repo, schoolId: string | null): Promise<{ adaptive: AdaptiveConfig; mastery: MasteryThresholds }> {
  if (!schoolId) return resolveEngineConfig();
  return cached(`cfg:${schoolId}`, ["SchoolSetting"], async () => {
    const rows = await repo.findMany("SchoolSetting", { schoolId, key: { in: ["adaptive.engine", "mastery.thresholds"] } });
    const get = (k: string) => (rows.find((r) => r.key === k)?.value ?? {}) as Record<string, unknown>;
    return resolveEngineConfig(get("adaptive.engine"), get("mastery.thresholds"));
  });
}

const cachedSkill = (repo: Repo, skillId: string) => cached(`skill:${skillId}`, ["Skill"], () => repo.findUnique("Skill", { id: skillId }));

async function ownStudent(repo: Repo, actor: Actor): Promise<Row> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can practise.");
  return (await repo.findUnique("Student", { id: actor.studentId }))!;
}

async function ownSession(repo: Repo, actor: Actor, sessionId: string): Promise<Row> {
  // the actor's student id was resolved from the database for this request: no need to read it again
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can practise.");
  const s = await repo.findUnique("PracticeSession", { id: sessionId });
  if (!s || s.studentId !== actor.studentId) throw new ForbiddenError("This practice session is not yours.");
  return s;
}

/** The skill must belong to the student's own (active) curriculum. */
async function assertSkillInCurriculum(repo: Repo, student: Row, skillId: string): Promise<Row> {
  const [skill, curs] = await Promise.all([repo.findUnique("Skill", { id: skillId }), repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true })]);
  const cur = curs[0];
  if (!skill || !cur || skill.curriculumId !== cur.id || !skill.isActive || skill.deletedAt) throw new ForbiddenError("This skill is not part of your curriculum.");
  return skill;
}

async function skillHistory(repo: Repo, studentId: string, skillId: string, items: Map<string, PracticeItem>): Promise<ResponseEvidence[]> {
  // only the latest HISTORY_WINDOW answers, newest first from the database, then oldest → newest
  const rows = (await repo.findMany("QuestionAttempt", { studentId, skillId }, {
    select: ["questionId", "isCorrect", "partialCredit", "difficultyB", "responseMs", "usedHint", "createdAt"],
    orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }],
    take: HISTORY_WINDOW,
  })).reverse();
  return rows.map((r) => {
    const it = items.get(String(r.questionId));
    return {
      itemId: String(r.questionId), correct: Boolean(r.isCorrect), credit: r.partialCredit === null || r.partialCredit === undefined ? undefined : Number(r.partialCredit),
      level: it?.level ?? 4, a: it?.irt.a ?? 1, b: Number(r.difficultyB), c: it?.irt.c ?? 0,
      responseMs: Number(r.responseMs), estimatedSeconds: it?.estimatedSeconds ?? 45, usedHint: Boolean(r.usedHint), at: d(r.createdAt).toISOString(),
    };
  });
}

async function prerequisitesFor(repo: Repo, studentId: string, skillId: string): Promise<PrerequisiteStatus[]> {
  const { pre, skills } = await cached(`pre:${skillId}`, ["SkillPrerequisite", "Skill"], async () => {
    const pre = await repo.findMany("SkillPrerequisite", { skillId });
    const skills = pre.length ? await repo.findMany("Skill", { id: { in: pre.map((p) => String(p.prerequisiteSkillId)) } }, { select: ["id", "name"] }) : [];
    return { pre, skills };
  });
  if (!pre.length) return [];
  const ids = pre.map((p) => String(p.prerequisiteSkillId));
  const mastery = await repo.findMany("StudentSkillMastery", { studentId, skillId: { in: ids } });
  return pre.map((p) => ({
    skillId: String(p.prerequisiteSkillId),
    name: String(skills.find((s) => s.id === p.prerequisiteSkillId)?.name ?? ""),
    mastery: Number(mastery.find((m) => m.skillId === p.prerequisiteSkillId)?.score ?? 0),
    minimumMastery: Number(p.minimumMastery),
    weight: Number(p.weight),
  }));
}

/**
 * Current ability for a skill. With no practice yet, the starting point is the student's
 * placement estimate for the skill's domain (from the diagnostic), else grade level.
 * Returns the prior to use as well, so the first answers move from the placement level.
 */
async function abilityOf(repo: Repo, studentId: string, skillId: string, cfg: AdaptiveConfig) {
  const skill = await cachedSkill(repo, skillId);
  const [row, dom] = await Promise.all([
    repo.findUnique("StudentAbility", { studentId, scope: `SKILL:${skillId}` }),
    skill ? repo.findUnique("StudentAbility", { studentId, scope: `DOMAIN:${String(skill.domain)}` }) : Promise.resolve(null),
  ]);
  const priorMean = dom ? Number(dom.theta) : cfg.priorMean;
  return {
    theta: row ? Number(row.theta) : priorMean,
    se: row ? Number(row.thetaSE) : cfg.priorSD,
    prior: { mean: priorMean, sd: cfg.priorSD },
  };
}

export async function startPractice(repo: Repo, actor: Actor, skillId: string, now = new Date(), random?: () => number): Promise<PracticeView> {
  const student = await ownStudent(repo, actor);
  const skill = await assertSkillInCurriculum(repo, student, skillId);
  const [items, openRows, assignmentId] = await Promise.all([
    loadSkillItems(repo, skillId),
    repo.findMany("PracticeSession", { studentId: student.id, skillId, endedAt: null }),
    openAssignmentFor(repo, String(student.id), skillId, now), // practice on an assigned skill counts toward it
  ]);
  if (!items.length) throw new ValidationError("There are no questions for this skill yet.");

  // resume a recent open session for this skill instead of starting over
  const open = openRows.filter((s) => now.getTime() - d(s.startedAt).getTime() < SESSION_RESUME_MINUTES * 60_000 && s.currentQuestionId);
  if (open.length) return currentQuestion(repo, actor, String(open[0].id), now);

  const cfg = await engineConfig(repo, actor.schoolId);
  const byId = new Map(items.map((i) => [i.questionId, i]));
  const [history, ability] = await Promise.all([
    skillHistory(repo, String(student.id), skillId, byId),
    abilityOf(repo, String(student.id), skillId, cfg.adaptive),
  ]);
  const first = selectNextItem({
    mode: "PRACTICE", theta: ability.theta, previousTargetB: null, candidates: items.map((i) => toCandidate(i, skillId)),
    recentItemIds: history.map((h) => h.itemId), recentCorrect: [], prerequisites: [], config: cfg.adaptive, random,
  });
  // if every item was seen recently, allow repeats rather than refusing to practise
  const firstId = first.itemId ?? items.sort((a, b) => Math.abs(a.irt.b - ability.theta) - Math.abs(b.irt.b - ability.theta))[0].questionId;
  const session = await repo.create("PracticeSession", {
    studentId: student.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: now, ...(assignmentId ? { assignmentId } : {}),
    currentQuestionId: firstId, currentServedAt: now, lastTargetB: first.targetB,
  });
  await repo.create("AdaptiveDecisionLog", {
    studentId: student.id, sessionId: session.id, skillId, previousTheta: ability.theta, newTheta: ability.theta, thetaSE: ability.se,
    nextQuestionId: firstId, nextTargetB: first.targetB, reason: first.itemId ? first.reason : "All items seen recently; repeating the closest item.",
    reasonCode: first.itemId ? first.reasonCode : "POOL_EXHAUSTED", engineVersion: ENGINE_VERSION, createdAt: now,
  });
  void skill;
  return currentQuestion(repo, actor, String(session.id), now);
}

export async function currentQuestion(repo: Repo, actor: Actor, sessionId: string, _now = new Date(), known?: { session: Row; mastery: Row | null }): Promise<PracticeView> {
  // `known`: the answer transaction already has the updated session and mastery (ownership checked there)
  const s = known ? known.session : await ownSession(repo, actor, sessionId);
  const [skillRow, m, items] = await Promise.all([
    known ? cachedSkill(repo, String(s.skillId)) : repo.findUnique("Skill", { id: s.skillId }),
    known ? Promise.resolve(known.mastery) : repo.findUnique("StudentSkillMastery", { studentId: s.studentId, skillId: s.skillId }),
    s.currentQuestionId && !s.endedAt ? loadSkillItems(repo, String(s.skillId)) : Promise.resolve([] as PracticeItem[]),
  ]);
  const skill = skillRow!;
  let question: ClientQuestion | null = null;
  if (s.currentQuestionId && !s.endedAt) {
    const item = items.find((i) => i.questionId === s.currentQuestionId);
    if (item) question = toClientQuestion(item, `${s.id}:${item.questionId}`);
  }
  return {
    sessionId: String(s.id), skillId: String(s.skillId), skillName: String(skill.name), question,
    answered: Number(s.questionCount), correct: Number(s.correctCount),
    mastery: Math.round(Number(m?.score ?? 0)), band: String(m?.band ?? "BEGINNING"),
    ended: Boolean(s.endedAt), endReason: s.endReason ? String(s.endReason) : null,
  };
}

/** Validates the response shape for the question type (rejects anything else). */
export function normalizeResponse(item: PracticeItem, raw: unknown): unknown {
  const bad = () => { throw new ValidationError("That answer could not be read. Please try again."); };
  switch (item.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN":
      if (typeof raw !== "string" || !item.options!.some((o) => o.label === raw)) bad();
      return raw;
    case "MULTI_SELECT":
      if (!Array.isArray(raw) || raw.length === 0 || raw.some((l) => !item.options!.some((o) => o.label === l))) bad();
      return [...new Set(raw as string[])];
    case "TRUE_FALSE":
      if (typeof raw !== "boolean") bad();
      return raw;
    case "FILL_BLANK":
      if (typeof raw !== "string" || raw.length > 200) bad();
      return raw;
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      if (!Array.isArray(raw) || raw.length !== item.sequence!.length || [...raw].sort().join("\u0000") !== [...item.sequence!].sort().join("\u0000")) bad();
      return raw;
    case "ERROR_CORRECTION":
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw >= item.segments!.length) bad();
      return raw;
    case "MATCHING": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad();
      const lefts = new Set(item.pairs!.map((p) => p.left));
      const rights = new Set(item.pairs!.map((p) => p.right));
      for (const [l, r] of Object.entries(raw as Record<string, unknown>)) if (!lefts.has(l) || typeof r !== "string" || !rights.has(r)) bad();
      return raw;
    }
    default:
      bad();
  }
}

/** Assignment-status updates still running after an answer (pages refresh statuses themselves). */
const pendingRefreshes = new Set<Promise<unknown>>();
/** Waits until every assignment update started by an answer has finished (seeding scripts and tests). */
export async function assignmentUpdatesSettled(): Promise<void> {
  while (pendingRefreshes.size) await Promise.all([...pendingRefreshes]);
}

export async function submitAnswer(
  repo: Repo,
  actor: Actor,
  input: { sessionId: string; questionId: string; response: unknown; usedHint?: boolean },
  now = new Date(),
  random?: () => number,
): Promise<{ feedback: Feedback; view: PracticeView }> {
  let linkedAssignment: string | null = null;
  let linkedStudent = "";
  let linkedSkill = "";
  let after: { session: Row; mastery: Row } | null = null;
  const feedback = await repo.transaction(async (tx) => {
    const s = await ownSession(tx, actor, input.sessionId);
    linkedAssignment = s.assignmentId ? String(s.assignmentId) : null;
    linkedStudent = String(s.studentId);
    linkedSkill = String(s.skillId ?? "");
    if (s.endedAt) throw new ValidationError("This practice session has ended.");
    if (s.currentQuestionId !== input.questionId) throw new ValidationError("This question was already answered. Here is your next one.");
    const skillId = String(s.skillId);
    const studentId = String(s.studentId);
    const items = await loadSkillItems(tx, skillId);
    const byId = new Map(items.map((i) => [i.questionId, i]));
    const item = byId.get(input.questionId);
    if (!item) throw new ValidationError("This question is no longer available.");
    const response = normalizeResponse(item, input.response);

    const cfg = await engineConfig(tx, actor.schoolId);
    const servedAt = s.currentServedAt ? d(s.currentServedAt) : now;
    const responseMs = Math.max(0, Math.min(30 * 60_000, now.getTime() - servedAt.getTime())); // server clock, capped at 30 min
    const credit = scoreResponse(item, response);
    const correct = credit >= 1;

    const history = await skillHistory(tx, studentId, skillId, byId);
    const ability = await abilityOf(tx, studentId, skillId, cfg.adaptive);
    const evidence: ResponseEvidence = {
      itemId: item.questionId, correct, credit: credit > 0 && credit < 1 ? credit : undefined, level: item.level,
      a: item.irt.a, b: item.irt.b, c: item.irt.c, responseMs, estimatedSeconds: item.estimatedSeconds, usedHint: Boolean(input.usedHint), at: now.toISOString(),
    };
    const answeredThisSession = Number(s.questionCount) + 1;
    const step = processAnswer(
      {
        studentId, skillId, sessionId: String(s.id), mode: "PRACTICE", ability: { theta: ability.theta, se: ability.se }, prior: ability.prior,
        history, previousTargetB: s.lastTargetB === null || s.lastTargetB === undefined ? null : Number(s.lastTargetB),
        candidates: items.map((i) => toCandidate(i, skillId)), prerequisites: await prerequisitesFor(tx, studentId, skillId),
      },
      evidence, cfg, now, random,
    );

    const attempt = await tx.create("QuestionAttempt", {
      sessionId: s.id, studentId, questionId: item.questionId, skillId, response: { value: response }, isCorrect: correct,
      partialCredit: credit > 0 && credit < 1 ? credit : null, responseMs, usedHint: Boolean(input.usedHint), rapidGuess: step.rapidGuess,
      difficultyB: item.irt.b, createdAt: now,
    });

    // decide what comes next
    let nextId = step.next.itemId;
    let endReason: string | null = null;
    let routeToSkillId: string | null = null;
    const seenThisSession = new Set((await tx.findMany("QuestionAttempt", { sessionId: s.id }, { select: ["questionId"] })).map((a) => String(a.questionId)));
    if (answeredThisSession >= MAX_QUESTIONS_PER_SESSION) { nextId = null; endReason = "COMPLETED"; }
    else if (seenThisSession.size >= items.length && nextId && seenThisSession.has(nextId)) { nextId = null; endReason = "ALL_QUESTIONS_ANSWERED"; }
    else if (step.next.reasonCode === "PREREQ_ROUTE") { nextId = null; endReason = "PREREQ_ROUTE"; routeToSkillId = step.next.routeToSkillId ?? null; }
    else if (!nextId) endReason = "POOL_EXHAUSTED";

    const prevMastery = await tx.findUnique("StudentSkillMastery", { studentId, skillId });
    // The student's last SEEN score is the stored one; continue from it so numbers never jump between screens,
    // and apply the fairness rule against it: a wrong answer never raises mastery.
    const seenBefore = prevMastery ? Number(prevMastery.score) : step.log.masteryBefore;
    let mst: MasteryResult = step.mastery;
    if (!correct && mst.score > seenBefore) mst = { ...mst, score: seenBefore, band: (prevMastery?.band as MasteryResult["band"]) ?? mst.band, isMastered: Boolean(prevMastery?.isMastered) };
    await tx.create("AdaptiveDecisionLog", {
      ...step.log, attemptId: attempt.id, nextQuestionId: nextId, responseCorrect: correct, createdAt: now,
      masteryBefore: seenBefore, masteryAfter: mst.score,
      reason: endReason === "COMPLETED" ? `${step.log.reason} Session complete (${MAX_QUESTIONS_PER_SESSION} questions).` : step.log.reason,
    });
    await tx.upsert("StudentAbility", { studentId, scope: `SKILL:${skillId}` }, { skillId, theta: step.ability.theta, thetaSE: step.ability.se, responses: history.length + 1 },
      { theta: step.ability.theta, thetaSE: step.ability.se, responses: history.length + 1 });
const masteryData = {
      score: mst.score, band: mst.band, attempts: Number(prevMastery?.attempts ?? 0) + 1, correct: Number(prevMastery?.correct ?? 0) + (correct ? 1 : 0),
      maxLevelCorrect: mst.components.maxLevelCorrect, isMastered: mst.isMastered,
      masteredAt: mst.isMastered ? (prevMastery?.masteredAt ?? now) : null, lastPracticedAt: now, components: mst.components,
    };
    await tx.upsert("StudentSkillMastery", { studentId, skillId }, masteryData, masteryData);
    if (step.xp > 0) await tx.create("XpEvent", { studentId, points: step.xp, reason: mst.isMastered && !prevMastery?.isMastered ? "skill_mastered" : "practice", createdAt: now });

    const sessionPatch = {
      questionCount: answeredThisSession, correctCount: Number(s.correctCount) + (correct ? 1 : 0), activeMs: Number(s.activeMs) + responseMs,
      currentQuestionId: nextId, currentServedAt: nextId ? now : null, lastTargetB: step.next.targetB,
      ...(endReason ? { endedAt: now, endReason } : {}),
    };
    await tx.updateMany("PracticeSession", { id: s.id }, sessionPatch);
    after = { session: { ...s, ...sessionPatch }, mastery: { studentId, skillId, ...masteryData } };

    const routeName = routeToSkillId ? String((await tx.findUnique("Skill", { id: routeToSkillId }))?.name ?? "") : null;
    const fb: Feedback = {
      correct, credit,
      yourAnswer: studentAnswerText(item, response),
      correctAnswer: correctAnswerText(item),
      whyCorrect: item.explanation.whyCorrect,
      whyYoursIsWrong: correct ? null : whyChosenWrong(item, response),
      tip: item.explanation.tip,
      rapidGuess: step.rapidGuess,
      masteryBefore: Math.round(seenBefore), masteryAfter: Math.round(mst.score), band: mst.band, xp: step.xp,
      next: { hasQuestion: Boolean(nextId), endReason, routeToSkillId, routeToSkillName: routeName },
    };
    return fb;
  });
  // the next screen comes from the transaction's own results (no re-reading)
  const view = await currentQuestion(repo, actor, input.sessionId, now, after ?? undefined);
  // the assignment's status is updated after replying (the student does not wait; their home page refreshes it too)
  if (linkedAssignment) {
    const p = refreshAfterAnswer(repo, linkedAssignment, linkedStudent, now, linkedSkill || undefined).catch((e) => console.error("assignment refresh failed", e));
    pendingRefreshes.add(p);
    void p.finally(() => pendingRefreshes.delete(p));
  }
  return { feedback, view };
}

export async function endPractice(repo: Repo, actor: Actor, sessionId: string, now = new Date()): Promise<void> {
  const s = await ownSession(repo, actor, sessionId);
  if (s.endedAt) return;
  await repo.updateMany("PracticeSession", { id: s.id }, { endedAt: now, endReason: "STUDENT_EXIT", currentQuestionId: null, currentServedAt: null });
}
