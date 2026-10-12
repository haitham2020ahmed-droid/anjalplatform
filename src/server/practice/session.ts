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
import { skillHistoryWithEvidence } from "./skill-evidence";
import { hideLevels } from "../../lib/hide-levels";
import { modelVersion } from "../cache/bank-version";
import { resolveEngineConfig, ENGINE_VERSION, type AdaptiveConfig, type MasteryThresholds } from "../../config/engine";
import { processAnswer } from "../../adaptive/engine";
import { isRecentRepeat, markRepeats } from "../../adaptive/evidence";
import { nextReview } from "../../mastery/review";
import { bandOfTheta, tutorFeedback, type TutorMessage } from "../../tutor/tutor";
import { selectNextItem, type PrerequisiteStatus } from "../../adaptive/selector";
import { isClassicErrorItem, scoreResponse } from "../../imports/questions/validate";
import type { MasteryResult, ResponseEvidence } from "../../types/domain";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { answerTexts, attemptMisconception, correctAnswerText, loadQuestionItems, loadSkillItems, studentAnswerText, toCandidate, toClientQuestion, whyChosenWrong, type ClientQuestion, type PracticeItem } from "./items";
import { refreshAfterAnswer, refreshQuestionSets } from "../teacher/assign";
import { allowedQuestions, answerState, recentOf, withAnswer, type Allowed, type AnswerState } from "./no-repeat";
import { isFinishReason, lastPickedWorkFor, markDone, openWorkFor } from "./completion";
import { chosenQuestionIdsOfAssignment } from "../questions/skill-questions";
import { applyPlacementResult } from "../curriculum-map/placement-result";
import { adaptiveNext, STUCK_AFTER, type AdaptiveState } from "../curriculum-map/leveled-run";
import { diagnosticNext, diagnosticOfAssessment, recordDiagnosticResult } from "../diagnostic/test";
import { assertDiagnosticAccess } from "../diagnostic/window";
import { finishWeeklyCheck, WEEKLY_CHECK_MARK } from "../student/weekly-check";
import { withLock } from "../lib/key-lock";
import { afterResponseSettled, runAfterResponse } from "../lib/after-response";
import { choiceSeed, finishTimedOut, isTestAssignment, shuffleChoices, testEndsAt, testOrder, timeIsUp, unshuffleResponse } from "../tests/runtime";

export const SESSION_RESUME_MINUTES = 120;
export const MAX_QUESTIONS_PER_SESSION = 20;
/** Adaptive stop: after this many answers in a session, stop once the ability estimate is this precise (SE). */
export const MIN_QUESTIONS_BEFORE_STOP = 12;
export const STOP_SE = 0.3;
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
  /** 🧑‍🏫 after a wrong answer: the tutor names the mistake and guides (the answer is shown only on request) */
  tutor?: TutorMessage | null;
  /** the session had already ended (another tab, a double click): nothing was saved again, no score changed */
  alreadyEnded?: boolean;
}

/** The tutor's turn when the repeat count is already known (Update 42B: read with the answer's other data). */
function tutorFrom(item: PracticeItem, response: unknown, theta: number, misconception: string | null, repeated: number): TutorMessage {
  return tutorFeedback({
    misconception, band: bandOfTheta(theta), repeated, rationale: whyChosenWrong(item, response), tip: item.explanation.tip || null, hint: item.hint,
    hasPassage: Boolean(item.passageText), correctTexts: answerTexts(item),
  });
}

const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

/**
 * Reference data read on every answer but rarely changed (engine settings, prerequisites, skill rows) is
 * kept in memory and reused only while no write to those tables has happened (modelVersion).
 */
const refCache = new Map<string, { v: string; at: number; value: unknown }>();
async function cached<T>(key: string, models: string[], load: () => Promise<T>, maxAgeMs = Infinity): Promise<T> {
  const v = modelVersion(...models), now = Date.now();
  const hit = refCache.get(key);
  if (hit && hit.v === v && now - hit.at < maxAgeMs && now >= hit.at) return hit.value as T;
  const value = await load();
  if (refCache.size > 20_000) refCache.clear();
  refCache.set(key, { v, at: now, value });
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

/**
 * The skill must belong to the student's own (active) curriculum, OR be assigned to the student by their teacher
 * (access rules, UI reorg: a teacher may assign a skill of ANY grade, e.g. a Grade 6 skill to a Grade 11 class with
 * no curriculum yet). The adaptive engine itself is unchanged.
 */
async function assertSkillInCurriculum(repo: Repo, student: Row, skillId: string): Promise<Row> {
  const [skill, curs] = await Promise.all([repo.findUnique("Skill", { id: skillId }), repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true })]);
  const cur = curs[0];
  if (!skill || !skill.isActive || skill.deletedAt) throw new ForbiddenError("This skill is not part of your curriculum.");
  if (cur && skill.curriculumId === cur.id) return skill;
  if (await assignedToStudent(repo, String(student.id), skillId)) return skill;
  throw new ForbiddenError("This skill is not part of your curriculum.");
}

/** Has a teacher assigned this skill to the student (any status: “Practise again” after finishing works too)? */
async function assignedToStudent(repo: Repo, studentId: string, skillId: string): Promise<boolean> {
  const rows = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] });
  if (!rows.length) return false;
  const list = await repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["skillId", "skillIds"] });
  return list.some((a) => String(a.skillId ?? "") === skillId || (Array.isArray(a.skillIds) && (a.skillIds as unknown[]).map(String).includes(skillId)));
}

async function skillHistory(repo: Repo, studentId: string, skillId: string, items: Map<string, PracticeItem>): Promise<ResponseEvidence[]> {
  // only the latest HISTORY_WINDOW answers (bank answers with their source weight + evidence from ReadRise, writing,
  // Respond to Reading and word reviews: src/server/practice/skill-evidence.ts), oldest → newest
  return skillHistoryWithEvidence(repo, studentId, skillId, items, HISTORY_WINDOW);
}

/** A prerequisite routed to from a skill is not routed to again within this many hours (the detour and the return). */
export const PREREQ_VISIT_HOURS = 24;

async function prerequisitesFor(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<PrerequisiteStatus[]> {
  const { pre, skills } = await cached(`pre:${skillId}`, ["SkillPrerequisite", "Skill"], async () => {
    const pre = await repo.findMany("SkillPrerequisite", { skillId });
    const skills = pre.length ? await repo.findMany("Skill", { id: { in: pre.map((p) => String(p.prerequisiteSkillId)) } }, { select: ["id", "name"] }) : [];
    return { pre, skills };
  });
  if (!pre.length) return [];
  const ids = pre.map((p) => String(p.prerequisiteSkillId));
  const [mastery, routes] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId, skillId: { in: ids } }),
    // routes already made from this skill recently: the student was sent there once (the route log names the prerequisite)
    repo.findMany("AdaptiveDecisionLog", { studentId, skillId, reasonCode: "PREREQ_ROUTE", createdAt: { gte: new Date(now.getTime() - PREREQ_VISIT_HOURS * 3_600_000) } }, { select: ["reason"] }),
  ]);
  return pre.map((p) => {
    const m = mastery.find((x) => x.skillId === p.prerequisiteSkillId);
    const name = String(skills.find((s) => s.id === p.prerequisiteSkillId)?.name ?? "");
    return {
      skillId: String(p.prerequisiteSkillId),
      name,
      mastery: Number(m?.score ?? 0),
      minimumMastery: Number(p.minimumMastery),
      weight: Number(p.weight),
      tested: Boolean(m),
      visited: routes.some((r) => String(r.reason ?? "").includes(`prerequisite "${name}"`)),
    };
  });
}

/** The answers already given in this session, oldest first (the routing streak never spans sessions). */
async function sessionAnswersOf(repo: Repo, sessionId: string): Promise<Row[]> {
  return repo.findMany("QuestionAttempt", { sessionId }, { select: ["id", "questionId", "skillId", "isCorrect", "createdAt", "responseMs"], orderBy: [{ field: "createdAt", dir: "asc" }, { field: "id", dir: "asc" }] });
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

/**
 * The items of a practice session: the questions the teacher picked for the linked assignment ("I'll pick the
 * questions": Assignment.questionIds, in order), else the skill's whole pool (the platform chooses at each student's
 * level). The adaptive engine then selects from these items exactly as before.
 */
async function practiceItems(repo: Repo, skillId: string, assignmentId: unknown): Promise<{ items: PracticeItem[]; chosen: boolean }> {
  const ids = assignmentId ? await chosenQuestionIdsOfAssignment(repo, String(assignmentId)) : null;
  if (ids?.length) {
    const items = await loadSkillItems(repo, skillId, { questionIds: ids });
    if (items.length) return { items, chosen: true };
  }
  return { items: await loadSkillItems(repo, skillId), chosen: false };
}

/** The allowed next questions for a student (no repeats): see no-repeat.ts. */
function allowedFor(items: PracticeItem[], state: AnswerState, recent: ReadonlySet<string>, theta: number): Allowed {
  return allowedQuestions(items.map((i) => ({ questionId: i.questionId, b: i.irt.b })), state, recent, theta);
}

/** The allowed question closest to the student's level (when the engine's own pick is not allowed). */
function closestAllowed(items: PracticeItem[], allowed: Allowed, theta: number, not?: string): string | null {
  const ok = new Set(allowed.ids);
  const pool = items.filter((i) => ok.has(i.questionId) && i.questionId !== not);
  return pool.length ? pool.sort((a, b) => Math.abs(a.irt.b - theta) - Math.abs(b.irt.b - theta))[0].questionId : null;
}

/**
 * Nothing left to practise in this skill (every question answered, the missed ones answered correctly since): an
 * ended session records it, and the student's work for the skill is Done (idempotent). Levels and mastery unchanged.
 */
async function finishSkill(repo: Repo, actor: Actor, studentId: string, skillId: string, work: string[], now: Date, open?: Row): Promise<PracticeView> {
  const patch = { endedAt: now, endReason: "SKILL_FINISHED", currentQuestionId: null, currentServedAt: null };
  const session = open
    ? (await repo.updateMany("PracticeSession", { id: open.id, endedAt: null }, patch), { ...open, ...patch })
    : await repo.create("PracticeSession", { studentId, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: now, ...(work[0] ? { assignmentId: work[0] } : {}), ...patch });
  await markDone(repo, [...work, ...(session.assignmentId ? [String(session.assignmentId)] : [])], studentId, now);
  const mastery = await repo.findUnique("StudentSkillMastery", { studentId, skillId });
  return currentQuestion(repo, actor, String(session.id), now, { session, mastery });
}

async function startPracticeUnlocked(repo: Repo, actor: Actor, skillId: string, now = new Date(), random?: () => number): Promise<PracticeView> {
  const student = await ownStudent(repo, actor);
  const skill = await assertSkillInCurriculum(repo, student, skillId);
  const studentId = String(student.id);
  const [openRows, work, state] = await Promise.all([
    repo.findMany("PracticeSession", { studentId: student.id, skillId, endedAt: null }),
    // practice on an assigned skill counts toward it (also an older skillIds row or another grade's copy of the skill)
    openWorkFor(repo, studentId, skillId, now),
    answerState(repo, studentId, skillId),
  ]);
  // no open work: practising again after the work was Done stays inside the teacher's picks (if there were any)
  const assignmentId = work[0] ?? await lastPickedWorkFor(repo, studentId, skillId, now);
  const { items, chosen } = await practiceItems(repo, skillId, assignmentId);
  if (!items.length) throw new ValidationError("There are no questions for this skill yet.");
  const cfg = await engineConfig(repo, actor.schoolId);
  const ability = await abilityOf(repo, studentId, skillId, cfg.adaptive);

  // resume a recent open session for this skill instead of starting over (with the teacher's own questions: only
  // a session of that same assignment)
  const open = openRows.filter((s) => now.getTime() - d(s.startedAt).getTime() < SESSION_RESUME_MINUTES * 60_000 && s.currentQuestionId && (!chosen || String(s.assignmentId ?? "") === String(assignmentId)));
  if (open.length) {
    const s0 = open[0];
    const recent = recentOf((await sessionAnswersOf(repo, String(s0.id))).map((a) => String(a.questionId)));
    const allowed = allowedFor(items, state, recent, ability.theta);
    if (allowed.phase === "DONE") return finishSkill(repo, actor, studentId, skillId, work, now, s0);
    // the question waiting may have been answered meanwhile (another tab, another grade's copy): a new one instead
    let current = String(s0.currentQuestionId);
    if (!allowed.ids.includes(current) && allowed.ids.length) current = closestAllowed(items, allowed, ability.theta) ?? current;
    // linked now when the work was assigned after this session was opened
    const link = !s0.assignmentId && assignmentId ? { assignmentId } : {};
    // resumed: the question is served again now (time away is not answer time)
    const [, mastery] = await Promise.all([
      repo.updateMany("PracticeSession", { id: s0.id, endedAt: null, currentQuestionId: s0.currentQuestionId }, { currentServedAt: now, currentQuestionId: current, ...link }),
      repo.findUnique("StudentSkillMastery", { studentId: student.id, skillId }),
    ]);
    return currentQuestion(repo, actor, String(s0.id), now, { session: { ...s0, currentServedAt: now, currentQuestionId: current, ...link }, mastery });
  }

  const allowed = allowedFor(items, state, new Set(), ability.theta);
  if (allowed.phase === "DONE" || !allowed.ids.length) return finishSkill(repo, actor, studentId, skillId, work, now);
  const ok = new Set(allowed.ids);
  const candidates = items.filter((i) => ok.has(i.questionId));
  const byId = new Map(items.map((i) => [i.questionId, i]));
  const history = await skillHistory(repo, studentId, skillId, byId);
  const first = selectNextItem({
    mode: "PRACTICE", theta: ability.theta, previousTargetB: null, candidates: candidates.map((i) => toCandidate(i, skillId)),
    recentItemIds: history.map((h) => h.itemId), recentCorrect: [], prerequisites: [], config: cfg.adaptive, random,
  });
  // nothing picked (a missed question answered recently, or a content gap): the allowed question closest to the
  // student's level (a content gap starts with the easiest question; the next step then ends the session)
  const firstId = first.itemId ?? (first.reasonCode === "NO_ITEM_IN_RANGE" ? [...candidates].sort((a, b) => a.irt.b - b.irt.b)[0].questionId : closestAllowed(items, allowed, ability.theta)!);
  const [session, mastery] = await Promise.all([
    repo.create("PracticeSession", {
      studentId: student.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: now, ...(assignmentId ? { assignmentId } : {}),
      currentQuestionId: firstId, currentServedAt: now, lastTargetB: first.targetB,
    }),
    repo.findUnique("StudentSkillMastery", { studentId: student.id, skillId }),
  ]);
  // the first decision's log: after the response (Update 42B)
  runAfterResponse("practice.start_log", () => repo.create("AdaptiveDecisionLog", {
    studentId: student.id, sessionId: session.id, skillId, previousTheta: ability.theta, newTheta: ability.theta, thetaSE: ability.se,
    nextQuestionId: firstId, nextTargetB: first.targetB, reason: first.itemId || first.reasonCode === "NO_ITEM_IN_RANGE" ? first.reason : `No repeats: ${allowed.phase === "RETRY" ? "a question missed before comes back" : "the unanswered question closest to the level"}.`,
    reasonCode: first.itemId || first.reasonCode === "NO_ITEM_IN_RANGE" ? first.reasonCode : "POOL_EXHAUSTED", engineVersion: ENGINE_VERSION, createdAt: now,
  }));
  void skill;
  return currentQuestion(repo, actor, String(session.id), now, { session, mastery });
}

export async function currentQuestion(repo: Repo, actor: Actor, sessionId: string, _now = new Date(), known?: { session: Row; mastery: Row | null }): Promise<PracticeView> {
  // `known`: the answer transaction already has the updated session and mastery (ownership checked there)
  const s = known ? known.session : await ownSession(repo, actor, sessionId);
  const [skillRow, m, items] = await Promise.all([
    known ? cachedSkill(repo, String(s.skillId)) : repo.findUnique("Skill", { id: s.skillId }),
    known ? Promise.resolve(known.mastery) : repo.findUnique("StudentSkillMastery", { studentId: s.studentId, skillId: s.skillId }),
    s.currentQuestionId && !s.endedAt ? practiceItems(repo, String(s.skillId), s.assignmentId).then((x) => x.items) : Promise.resolve([] as PracticeItem[]),
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
    case "ERROR_CORRECTION": {
      const n = item.segments!.length;
      const okIndex = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n;
      // the original one-tap items: a part number, as always (a newer client may send { picks: [k] })
      if (isClassicErrorItem(item)) {
        const one = raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as { picks?: unknown[] }).picks) && (raw as { picks: unknown[] }).picks.length === 1 ? (raw as { picks: unknown[] }).picks[0] : raw;
        if (!okIndex(one)) bad();
        return one;
      }
      const r = typeof raw === "number" ? { picks: [raw] } : raw === "NONE" ? { none: true } : raw;
      if (!r || typeof r !== "object" || Array.isArray(r)) bad();
      const { picks = [], none, fixes = {} } = r as { picks?: unknown; none?: unknown; fixes?: unknown };
      if (!Array.isArray(picks) || !picks.every(okIndex) || (none !== undefined && typeof none !== "boolean") || !fixes || typeof fixes !== "object" || Array.isArray(fixes)) bad();
      if (none === true && (picks as number[]).length) bad();
      if (none === true && !item.noErrorOption) bad();
      if (!none && !(picks as number[]).length) bad();
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(fixes as Record<string, unknown>)) {
        if (typeof v !== "string" || v.length > 200 || !okIndex(Number(k))) bad();
        if ((picks as number[]).includes(Number(k)) && (v as string).trim()) out[k] = (v as string).trim();
      }
      return { picks: [...new Set(picks as number[])], none: none === true, fixes: item.typeCorrection ? out : {} };
    }
    case "TWO_PART": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad();
      const { a, b } = raw as { a?: unknown; b?: unknown };
      const tp = item.twoPart!;
      const bl = Array.isArray(b) ? b : b === undefined || b === null || b === "" ? [] : [b];
      if (typeof a !== "string" || !tp.partA.options.some((o) => o.label === a)) bad();
      if (!bl.length || bl.some((l) => typeof l !== "string" || !tp.partB.options.some((o) => o.label === l))) bad();
      if (!tp.partB.multiple && bl.length !== 1) bad();
      return { a, b: tp.partB.multiple ? [...new Set(bl as string[])] : bl[0] };
    }
    case "GRID": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad();
      const rows = new Set(item.grid!.rows.map((r) => r.id));
      const cols = new Set(item.grid!.columns.map((c) => c.id));
      for (const [r, c] of Object.entries(raw as Record<string, unknown>)) if (!rows.has(r) || typeof c !== "string" || !cols.has(c)) bad();
      return raw;
    }
    case "HOT_TEXT": {
      const ids = new Set(item.hotText!.segments.map((x) => x.id));
      if (!Array.isArray(raw) || raw.length === 0 || raw.some((x) => typeof x !== "string" || !ids.has(x))) bad();
      const picked = [...new Set(raw as string[])];
      if (picked.length > item.hotText!.maxSelect) throw new ValidationError(`Choose no more than ${item.hotText!.maxSelect} sentence${item.hotText!.maxSelect === 1 ? "" : "s"}.`);
      return picked;
    }
    case "DICTATION":
      // the typed spelling: one short line
      if (typeof raw !== "string" || !raw.trim() || raw.length > 60) bad();
      return (raw as string).trim();
    case "SENTENCE_COMBINE":
      // the typed combined sentence: one line
      if (typeof raw !== "string" || !raw.trim() || raw.length > 400) bad();
      return (raw as string).replace(/\s+/g, " ").trim();
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

/** Waits until every assignment update / log started by an answer has finished (seeding scripts and tests). */
export async function assignmentUpdatesSettled(): Promise<void> {
  await afterResponseSettled();
}

async function submitAnswerUnlocked(
  repo: Repo,
  actor: Actor,
  input: { sessionId: string; questionId: string; response: unknown; usedHint?: boolean },
  now = new Date(),
  random?: () => number,
): Promise<{ feedback: Feedback; view: PracticeView }> {
  // Update 42B: everything the answer needs is READ first, in parallel (one round trip after the session), outside
  // the transaction; the transaction only WRITES (attempt, ability, mastery, XP, the guarded session move). The
  // session move is guarded by the database (current question + answer count), so a double click or a second server
  // still cannot apply an answer twice — the losing request's writes are rolled back as before.
  const s = await ownSession(repo, actor, input.sessionId);
  if (s.endedAt) return endedSessionReply(repo, actor, s, input.questionId);
  if (s.currentQuestionId !== input.questionId) throw new ValidationError("This question was already answered. Here is your next one.");
  const skillId = String(s.skillId);
  const studentId = String(s.studentId);
  // the skill row is cached here too, so the ability read below needs no extra round trip
  const [{ items }, cfg] = await Promise.all([practiceItems(repo, skillId, s.assignmentId), engineConfig(repo, actor.schoolId), cachedSkill(repo, skillId)]);
  const byId = new Map(items.map((i) => [i.questionId, i]));
  const item = byId.get(input.questionId);
  if (!item) throw new ValidationError("This question is no longer available.");
  const response = normalizeResponse(item, input.response);
  const servedAt = s.currentServedAt ? d(s.currentServedAt) : now;
  const responseMs = Math.max(0, Math.min(30 * 60_000, now.getTime() - servedAt.getTime())); // server clock, capped at 30 min
  const credit = scoreResponse(item, response);
  const correct = credit >= 1;
  // the hint is known to the server (it was shown by practiceHint), never trusted from the browser
  const usedHint = Boolean(input.usedHint) || String(s.hintQuestionId ?? "") === item.questionId;
  const misconception = correct ? null : attemptMisconception(item, response);

  const [history, ability, prerequisites, sessionRows, prevMastery, repeatedBefore, stateBefore] = await Promise.all([
    skillHistory(repo, studentId, skillId, byId),
    abilityOf(repo, studentId, skillId, cfg.adaptive),
    prerequisitesFor(repo, studentId, skillId, now),
    sessionAnswersOf(repo, String(s.id)),
    repo.findUnique("StudentSkillMastery", { studentId, skillId }),
    // the tutor: how often this mistake came back in 30 days (this answer is added below)
    misconception ? repo.count("QuestionAttempt", { studentId, misconception, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }) : Promise.resolve(0),
    // 🔁 no repeats: what the student already answered in this skill family (one bounded indexed read)
    answerState(repo, studentId, skillId),
  ]);
  const evidence: ResponseEvidence = {
    itemId: item.questionId, correct, credit: credit > 0 && credit < 1 ? credit : undefined, level: item.level,
    a: item.irt.a, b: item.irt.b, c: item.irt.c, responseMs, estimatedSeconds: item.estimatedSeconds, usedHint, at: now.toISOString(),
    repeat: isRecentRepeat(history, item.questionId, now.toISOString()),
  };
  // the questions that may come next: never one already answered (any session, any copy of the skill), then only
  // the missed ones; the engine below scores this answer exactly as before and only CHOOSES among these
  // a missed question never comes back right after it was answered (the last RETRY_GAP answers of this session)
  const recent = recentOf([...sessionRows.map((a) => String(a.questionId)), item.questionId]);
  const answeredThisSession = Number(s.questionCount) + 1;
  const engineState = {
    studentId, skillId, sessionId: String(s.id), mode: "PRACTICE" as const, ability: { theta: ability.theta, se: ability.se }, prior: ability.prior,
    history, previousTargetB: s.lastTargetB === null || s.lastTargetB === undefined ? null : Number(s.lastTargetB),
    candidates: [] as ReturnType<typeof toCandidate>[], prerequisites,
    sessionCorrect: sessionRows.map((r) => Boolean(r.isCorrect)),
  };
  // the new ability after this answer (the engine's own estimate; no random draw is used, nothing is chosen)
  const probe = processAnswer(engineState, evidence, cfg, now, () => 0);
  const allowed = allowedFor(items, withAnswer(stateBefore, item.questionId, correct), recent, probe.ability.theta);
  const allowedSet = new Set(allowed.ids);
  // the engine scores this answer exactly as before (ability, mastery, XP do not depend on the candidates) and
  // chooses the next question among the allowed ones only
  const step = processAnswer({ ...engineState, candidates: items.filter((i) => allowedSet.has(i.questionId)).map((i) => toCandidate(i, skillId)) }, evidence, cfg, now, random);

  // decide what comes next (the questions of this session so far, and this one)
  let nextId = step.next.itemId && allowedSet.has(step.next.itemId) ? step.next.itemId : null;
  // the engine found nothing among the allowed questions only because they were answered recently (the missed ones
  // coming back): the allowed one closest to the new level
  if (!nextId && allowed.ids.length && step.next.reasonCode !== "PREREQ_ROUTE" && step.next.reasonCode !== "NO_ITEM_IN_RANGE") nextId = closestAllowed(items, allowed, step.ability.theta, item.questionId);
  let endReason: string | null = null;
  let routeToSkillId: string | null = null;
  if (allowed.phase === "DONE") { nextId = null; endReason = "SKILL_FINISHED"; }
  else if (answeredThisSession >= MAX_QUESTIONS_PER_SESSION) { nextId = null; endReason = "COMPLETED"; }
  else if (answeredThisSession >= MIN_QUESTIONS_BEFORE_STOP && step.ability.se <= STOP_SE) { nextId = null; endReason = "LEVEL_CONFIRMED"; }
  else if (allowed.phase === "LATER") { nextId = null; endReason = "RETRY_LATER"; }
  else if (step.next.reasonCode === "PREREQ_ROUTE") { nextId = null; endReason = "PREREQ_ROUTE"; routeToSkillId = step.next.routeToSkillId ?? null; }
  else if (!nextId) endReason = "POOL_EXHAUSTED";

  // The student's last SEEN score is the stored one; continue from it so numbers never jump between screens,
  // and apply the fairness rule against it: a wrong answer never raises mastery.
  const seenBefore = prevMastery ? Number(prevMastery.score) : step.log.masteryBefore;
  let mst: MasteryResult = step.mastery;
  if (!correct && mst.score > seenBefore) mst = { ...mst, score: seenBefore, band: (prevMastery?.band as MasteryResult["band"]) ?? mst.band, isMastered: Boolean(prevMastery?.isMastered) };
  const masteryData = {
    score: mst.score, band: mst.band, attempts: Number(prevMastery?.attempts ?? 0) + 1, correct: Number(prevMastery?.correct ?? 0) + (correct ? 1 : 0),
    maxLevelCorrect: mst.components.maxLevelCorrect, isMastered: mst.isMastered,
    masteredAt: mst.isMastered ? (prevMastery?.masteredAt ?? now) : null, lastPracticedAt: now, components: mst.components,
    ...nextReview(prevMastery, mst.isMastered, correct, now),
  };
  const sessionPatch = {
    questionCount: answeredThisSession, correctCount: Number(s.correctCount) + (correct ? 1 : 0), activeMs: Number(s.activeMs) + responseMs,
    currentQuestionId: nextId, currentServedAt: nextId ? now : null, lastTargetB: step.next.targetB, hintQuestionId: null,
    ...(endReason ? { endedAt: now, endReason } : {}),
  };
  const routeName = routeToSkillId ? String((await cachedSkill(repo, routeToSkillId))?.name ?? "") : null;
  // ✅ the practice is finished: the student's work for this skill becomes Done in the SAME transaction as this last
  // answer (immediate, server-side; guarded by completedAt IS NULL so a retry or a second tab writes it once)
  const finished = Boolean(endReason && isFinishReason(endReason));
  const linkedAssignment = s.assignmentId ? String(s.assignmentId) : null;
  const doneWork = finished ? [...new Set([...(linkedAssignment ? [linkedAssignment] : []), ...(await openWorkFor(repo, studentId, skillId, now))])] : [];

  const attempt = await repo.transaction(async (tx) => {
    // guarded by the database: only one request can move the session past this question (two servers, double clicks)
    const moved = await tx.updateMany("PracticeSession", { id: s.id, currentQuestionId: input.questionId, questionCount: Number(s.questionCount) }, sessionPatch);
    if (moved !== 1) throw new ValidationError("This question was already answered. Here is your next one.");
    const row = await tx.create("QuestionAttempt", {
      sessionId: s.id, studentId, questionId: item.questionId, skillId, response: { value: response }, isCorrect: correct,
      partialCredit: credit > 0 && credit < 1 ? credit : null, responseMs, usedHint, rapidGuess: step.rapidGuess,
      difficultyB: item.irt.b, createdAt: now, misconception,
    });
    await tx.upsert("StudentAbility", { studentId, scope: `SKILL:${skillId}` }, { skillId, theta: step.ability.theta, thetaSE: step.ability.se, responses: history.length + 1 },
      { theta: step.ability.theta, thetaSE: step.ability.se, responses: history.length + 1 });
    await tx.upsert("StudentSkillMastery", { studentId, skillId }, masteryData, masteryData);
    if (step.xp > 0) await tx.create("XpEvent", { studentId, points: step.xp, reason: mst.isMastered && !prevMastery?.isMastered ? "skill_mastered" : "practice", createdAt: now });
    if (doneWork.length) await markDone(tx, doneWork, studentId, now);
    return row;
  });

  const feedback: Feedback = {
    correct, credit,
    yourAnswer: studentAnswerText(item, response),
    correctAnswer: correctAnswerText(item),
    whyCorrect: item.explanation.whyCorrect,
    whyYoursIsWrong: correct ? null : whyChosenWrong(item, response),
    tip: item.explanation.tip,
    rapidGuess: step.rapidGuess,
    masteryBefore: Math.round(seenBefore), masteryAfter: Math.round(mst.score), band: mst.band, xp: step.xp,
    next: { hasQuestion: Boolean(nextId), endReason, routeToSkillId, routeToSkillName: routeName },
    tutor: correct ? null : tutorFrom(item, response, step.ability.theta, misconception, repeatedBefore + (misconception ? 1 : 0)),
  };
  // after the response: the decision log (reports, prerequisite routes) and the assignment's progress (the student
  // does not wait; their home page refreshes statuses too). Completion itself was written with the answer above.
  runAfterResponse("practice.decision_log", () => repo.create("AdaptiveDecisionLog", {
    ...step.log, attemptId: attempt.id, nextQuestionId: nextId, responseCorrect: correct, createdAt: now,
    masteryBefore: seenBefore, masteryAfter: mst.score,
    reason: endReason === "COMPLETED" ? `${step.log.reason} Session complete (${MAX_QUESTIONS_PER_SESSION} questions).` : step.log.reason,
  }));
  if (linkedAssignment && !finished) runAfterResponse("practice.assignment_refresh", () => refreshAfterAnswer(repo, linkedAssignment, studentId, now, skillId || undefined));
  // the next screen comes from this answer's own results (no re-reading)
  const view = await currentQuestion(repo, actor, input.sessionId, now, { session: { ...s, ...sessionPatch }, mastery: { studentId, skillId, ...masteryData } });
  return { feedback, view };
}

/**
 * 💡 A hint for the question being shown, one step further each time it is asked (the hint ladder,
 * src/server/lessons/hints.ts): 1 = the question type (QAR) and a strategy step, 2 = which paragraph, 3 = the clue
 * sentence. Recorded on the session, so the answer to this question counts half toward mastery (the browser cannot
 * hide hint use). The ladder step is kept on the session too (currentOrder.hint, keyed by question and answer count).
 */
export async function practiceHint(repo: Repo, actor: Actor, sessionId: string, questionId: string): Promise<{ hint: string; level: number; maxLevel: number; paragraph: number | null; sentence: string | null }> {
  const s = await ownSession(repo, actor, sessionId);
  if (s.endedAt || s.currentQuestionId !== questionId) throw new ValidationError("This question is no longer open.");
  const item = (await practiceItems(repo, String(s.skillId), s.assignmentId)).items.find((i) => i.questionId === questionId);
  if (!item) throw new ValidationError("There is no hint for this question.");
  const order = (s.currentOrder && typeof s.currentOrder === "object" && !Array.isArray(s.currentOrder) ? s.currentOrder : typeof s.currentOrder === "string" ? JSON.parse(s.currentOrder) : {}) as Record<string, unknown>;
  const prev = (order.hint ?? null) as { q?: string; n?: number; level?: number } | null;
  const sameQuestion = String(s.hintQuestionId ?? "") === questionId && prev?.q === questionId && prev?.n === Number(s.questionCount);
  const level = Math.min(3, sameQuestion ? Number(prev?.level ?? 0) + 1 : 1);
  const { itemHintStep } = await import("../lessons/hints");
  const step = await itemHintStep(repo, item, String((await cachedSkill(repo, String(s.skillId)))?.code ?? ""), level);
  await repo.updateMany("PracticeSession", { id: s.id, currentQuestionId: questionId }, { hintQuestionId: questionId, currentOrder: { ...order, hint: { q: questionId, n: Number(s.questionCount), level } } });
  return { hint: step.text, level: step.level, maxLevel: step.maxLevel, paragraph: step.paragraph, sentence: step.sentence };
}

export async function endPractice(repo: Repo, actor: Actor, sessionId: string, now = new Date()): Promise<void> {
  const s = await ownSession(repo, actor, sessionId);
  if (s.endedAt) return;
  await repo.updateMany("PracticeSession", { id: s.id }, { endedAt: now, endReason: "STUDENT_EXIT", currentQuestionId: null, currentServedAt: null });
}

// ------------------------------------------------------------------ teacher question sets (⭐ chosen questions)

/**
 * A teacher-chosen set of questions, answered in the teacher's order: one attempt per question, the correct
 * answer shown after each one, and every answer counted toward the student's mastery of that question's
 * skill (same scoring and mastery engine as practice). Stored as Assessment (TEACHER_QUIZ) + Assignment.
 */
export interface QuizView {
  assignmentId: string; sessionId: string; title: string; question: ClientQuestion | null;
  index: number; total: number; answered: number; correct: number; ended: boolean;
  /** sets with a goal of correct answers (Curriculum Map places, plans): the goal and how far the student is */
  goal: { target: number; correct: number; reached: boolean; early: boolean; struggling: boolean } | null;
  /** more than 25 minutes of answers in this set today: suggest a break */
  breakHint: boolean;
  /** where “Next” goes after the goal (the plan's next place), when the set belongs to a plan */
  nextHref: string | null;
  /** 📝 a test (the Diagnostic): no right/wrong feedback, answers are only saved */
  testMode: boolean;
  /** a teacher-built test from Assessments (My Tests) */
  isTest?: boolean;
  /** the test's time limit: when the time ends (ISO), else null */
  endsAt?: string | null;
}

async function quizContext(repo: Repo, actor: Actor, assignmentId: string, now = new Date()) {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can answer assigned questions.");
  const [a, mine] = await Promise.all([repo.findUnique("Assignment", { id: assignmentId }), repo.findMany("AssignmentStudent", { assignmentId, studentId: actor.studentId })]);
  if (!a || a.deletedAt || !a.assessmentId || !mine.length) throw new ForbiddenError("These questions were not assigned to you.");
  if (a.startAt && new Date(String(a.startAt instanceof Date ? a.startAt.toISOString() : a.startAt)) > new Date()) throw new ValidationError("This work has not started yet.");
  // 🗓️ the Diagnostic Test: only while the school admin has it open for the grade, once per school year (server check)
  await assertDiagnosticAccess(repo, actor, String(a.assessmentId), now);
  // the set's question order: kept in memory while no write to it has happened here, at most a minute (Update 42B)
  // only questions that still exist and are published: a deleted or unpublished question could never be answered,
  // so the set could never be finished (My Work stayed "In progress")
  const order = await cached(`order:${String(a.assessmentId)}`, ["AssessmentQuestion", "Question"], async () => {
    const ids = (await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId })).sort((x, y) => Number(x.order) - Number(y.order)).map((x) => String(x.questionId));
    if (!ids.length) return ids;
    const live = new Set((await repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((q) => String(q.id)));
    return ids.filter((id) => live.has(id));
  }, 60_000);
  // a teacher-built test may give each student their own (fixed) question order
  return { a, order: testOrder(a, order, actor.studentId!) };
}

/** The next question of a set: fixed sets in the teacher's order; adaptive sets by level (Below → On → Above). */
async function nextInSet(repo: Repo, a: Row, order: string[], sessionId: string, studentId: string, known?: { set: Row | null; answeredIds?: Set<string> }): Promise<{ nextId: string | null; total: number; goal: AdaptiveState["goal"] }> {
  const set = known ? known.set : await repo.findUnique("Assessment", { id: a.assessmentId });
  // 📝 the adaptive Diagnostic: the same skills for everyone, the difficulty follows the student
  if (String(set?.type ?? "") === "DIAGNOSTIC") { const dg = await diagnosticNext(repo, String(a.assessmentId), sessionId, studentId); if (dg) return { nextId: dg.nextId, total: dg.total, goal: null }; }
  if (set?.isAdaptive) { const st = await adaptiveNext(repo, set, order, sessionId, studentId); return { nextId: st.nextId, total: st.total, goal: st.goal }; }
  const answered = known?.answeredIds ?? new Set((await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId"] })).map((x) => String(x.questionId)));
  return { nextId: order.find((id) => !answered.has(id)) ?? null, total: order.length, goal: null };
}

/** The plan place after this one (a student working through a plan goes on to the next place). */
async function nextPlanHref(repo: Repo, a: Row, studentId: string): Promise<string | null> {
  const plans = await repo.findMany("SkillPlan", { classId: a.classId }, { select: ["id"] });
  if (!plans.length) return null;
  const items = await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }, { select: ["id", "planId", "assignmentIds", "order"] });
  const mine = items.find((i) => { const x = typeof i.assignmentIds === "string" ? JSON.parse(String(i.assignmentIds)) : i.assignmentIds; return Array.isArray(x) && x.map(String).includes(String(a.id)); });
  if (!mine) return null;
  const nextItem = items.filter((i) => i.planId === mine.planId && Number(i.order) > Number(mine.order)).sort((x, y) => Number(x.order) - Number(y.order))[0];
  void studentId;
  return nextItem ? `/student/plans/${String(mine.planId)}/open/${String(nextItem.id)}` : `/student/plans/${String(mine.planId)}`;
}

async function quizView(repo: Repo, a: Row, order: string[], s: Row, known?: { attempts: Row[]; set: Row | null; next?: { nextId: string | null; total: number; goal: AdaptiveState["goal"] }; nextItem?: Promise<PracticeItem | undefined> }): Promise<QuizView> {
  // `known` (Update 42B): the answer already has the session's answers, the set and (fixed and adaptive sets) the next question
  const [attempts, set] = known ? [known.attempts, known.set] : await Promise.all([
    repo.findMany("QuestionAttempt", { sessionId: s.id }, { select: ["questionId", "responseMs", "createdAt"] }),
    repo.findUnique("Assessment", { id: a.assessmentId }),
  ]);
  const answered = attempts.length;
  const isTest = isTestAssignment(a);
  const nx = known?.next ?? await nextInSet(repo, a, order, String(s.id), String(s.studentId), { set, ...(known ? { answeredIds: new Set(attempts.map((x) => String(x.questionId))) } : {}) });
  // a finished test (all answered or time up) shows no more questions
  const { total, goal } = nx;
  const nextId = isTest && s.endedAt ? null : nx.nextId;
  const [item, nextHref] = await Promise.all([
    nextId ? (known?.nextItem ?? Promise.resolve(undefined)).then(async (it) => it ?? (await loadQuestionItems(repo, [nextId]))[0]) : Promise.resolve(undefined),
    goal ? nextPlanHref(repo, a, String(s.studentId)) : Promise.resolve(null),
  ]);
  const dayAgo = Date.now() - 86_400_000;
  const todayMs = attempts.filter((x) => d(x.createdAt).getTime() >= dayAgo).reduce((t2, x) => t2 + Number(x.responseMs ?? 0), 0);
  return {
    assignmentId: String(a.id), sessionId: String(s.id), title: hideLevels(String(a.title)), question: item ? (a.shuffle ? shuffleChoices(toClientQuestion(item, `${s.id}:${item.questionId}:${answered}`), choiceSeed(a, String(s.studentId), item.questionId)) : toClientQuestion(item, `${s.id}:${item.questionId}:${answered}`)) : null,
    index: goal ? answered + 1 : Math.min(total, answered + 1), total, answered, correct: goal ? goal.correct : Number(s.correctCount ?? 0), ended: !nextId,
    goal: goal ? { target: goal.target, correct: goal.correct, reached: goal.reached || Boolean(s.goalReachedAt), early: goal.early, struggling: goal.struggling } : null,
    breakHint: todayMs >= 25 * 60_000, nextHref,
    testMode: String(set?.type ?? "") === "DIAGNOSTIC" || isTest,
    // only on teacher-built tests (other sets keep exactly the same view)
    ...(isTest ? { isTest: true, endsAt: !s.endedAt ? testEndsAt(set, s)?.toISOString() ?? null : null } : {}),
  };
}

/** Feedback that reveals nothing (tests: answers are only saved). */
function blankFeedback(): Feedback {
  return { correct: false, credit: 0, yourAnswer: "", correctAnswer: "", whyCorrect: "", whyYoursIsWrong: null, tip: "", rapidGuess: false, masteryBefore: 0, masteryAfter: 0, band: "", xp: 0, next: { hasQuestion: false, endReason: "COMPLETED", routeToSkillId: null, routeToSkillName: null }, tutor: null };
}

/** Starts or resumes the student's question set (continues from the first unanswered question). */
async function startQuizUnlocked(repo: Repo, actor: Actor, assignmentId: string, now = new Date()): Promise<QuizView> {
  const { a, order } = await quizContext(repo, actor, assignmentId, now);
  if (!order.length) throw new ValidationError("This assignment has no questions.");
  let s = (await repo.findMany("PracticeSession", { studentId: actor.studentId!, assignmentId: a.id, mode: "TEACHER_QUIZ" }))[0];
  if (!s) s = await repo.create("PracticeSession", { studentId: actor.studentId!, assessmentId: a.assessmentId, assignmentId: a.id, mode: "TEACHER_QUIZ", startedAt: now, currentServedAt: now });
  else if (!s.endedAt) {
    // resumed: the question is served again now, so the time away (another day, a closed tab) is not counted as answer time
    await repo.updateMany("PracticeSession", { id: s.id }, { currentServedAt: now });
    s = { ...s, currentServedAt: now };
  }
  // a test with a time limit: the server's clock decides (time up → the test ends with the answers given)
  if (isTestAssignment(a) && !s.endedAt) {
    const set = await repo.findUnique("Assessment", { id: a.assessmentId });
    if (timeIsUp(set, s, now)) s = await finishTimedOut(repo, a, s, order.length, now);
  }
  return quizView(repo, a, order, s);
}

/** One answer: scored, saved (one attempt per question), counted toward mastery; returns feedback and the next question. */
async function submitQuizAnswerUnlocked(repo: Repo, actor: Actor, input: { assignmentId: string; questionId: string; response: unknown }, now = new Date()): Promise<{ feedback: Feedback; view: QuizView }> {
  const { a, order } = await quizContext(repo, actor, input.assignmentId, now);
  if (!order.includes(input.questionId)) throw new ValidationError("This question is not part of the assignment.");
  // Update 42B: the reads first (in parallel, outside the transaction), then one short transaction of writes guarded
  // by the session's answer count (a double click or a second server is still refused, its writes rolled back)
  const [sessions, set, items, diag] = await Promise.all([
    repo.findMany("PracticeSession", { studentId: actor.studentId!, assignmentId: a.id, mode: "TEACHER_QUIZ" }),
    repo.findUnique("Assessment", { id: a.assessmentId }),
    loadQuestionItems(repo, [input.questionId]),
    diagnosticOfAssessment(repo, String(a.assessmentId)),
  ]);
  const s = sessions[0];
  if (!s) throw new ValidationError("Start the assignment first.");
  if (isTestAssignment(a) && (s.endedAt || timeIsUp(set, s, now))) {
    // the test is over (time up): nothing more is saved; the student sees the end of the test
    const ended = s.endedAt ? s : await finishTimedOut(repo, a, s, order.length, now);
    return { feedback: blankFeedback(), view: await quizView(repo, a, order, ended) };
  }
  const item = items[0];
  const skillId = item ? String(item.skillKey) : "";
  const studentId = String(s.studentId);
  const [sessionRows, cfg, skillItems, prevMastery] = await Promise.all([
    sessionAnswersOf(repo, String(s.id)), engineConfig(repo, actor.schoolId),
    item ? loadSkillItems(repo, skillId) : Promise.resolve([] as PracticeItem[]),
    item ? repo.findUnique("StudentSkillMastery", { studentId, skillId }) : Promise.resolve(null),
    item ? cachedSkill(repo, skillId) : Promise.resolve(null), // cached for the ability read below
  ]);
  // one answer per question — except in a goal set, where a question the student missed may come back
  const before = sessionRows.filter((x) => String(x.questionId) === input.questionId);
  if (before.length && !(Number(set?.targetCorrect) > 0 && before.every((x) => !x.isCorrect))) throw new ValidationError("You already answered this question.");
  if (!item) throw new ValidationError("This question is no longer available.");
  // a shuffled test: the student's choice letters are mapped back to the question's own before scoring
  const response = normalizeResponse(item, a.shuffle ? unshuffleResponse(item, input.response, choiceSeed(a, studentId, item.questionId)) : input.response);
  const credit = scoreResponse(item, response);
  const correct = credit >= 1;
  const misconception = correct ? null : attemptMisconception(item, response);
  const servedAt = s.currentServedAt ? d(s.currentServedAt) : now;
  const responseMs = Math.max(0, Math.min(30 * 60_000, now.getTime() - servedAt.getTime()));
  // mastery: the same engine as practice, with this question's skill as the context
  const byId = new Map(skillItems.map((i) => [i.questionId, i]));
  if (!byId.has(item.questionId)) byId.set(item.questionId, item);
  const [history, ability, prerequisites, repeatedBefore] = await Promise.all([
    skillHistory(repo, studentId, skillId, byId), abilityOf(repo, studentId, skillId, cfg.adaptive), prerequisitesFor(repo, studentId, skillId, now),
    misconception ? repo.count("QuestionAttempt", { studentId, misconception, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }) : Promise.resolve(0),
  ]);
  const sessionCorrect = sessionRows.filter((x) => String(x.skillId) === skillId).map((x) => Boolean(x.isCorrect));
  const evidence: ResponseEvidence = {
    itemId: item.questionId, correct, credit: credit > 0 && credit < 1 ? credit : undefined, level: item.level,
    a: item.irt.a, b: item.irt.b, c: item.irt.c, responseMs, estimatedSeconds: item.estimatedSeconds, usedHint: false, at: now.toISOString(),
    repeat: isRecentRepeat(history, item.questionId, now.toISOString()),
  };
  const step = processAnswer({
    studentId, skillId, sessionId: String(s.id), mode: "PRACTICE", ability: { theta: ability.theta, se: ability.se }, prior: ability.prior, history,
    previousTargetB: null, candidates: [...byId.values()].map((i) => toCandidate(i, skillId)), prerequisites, sessionCorrect,
  }, evidence, cfg, now);
  const seenBefore = prevMastery ? Number(prevMastery.score) : step.log.masteryBefore;
  let mst: MasteryResult = step.mastery;
  if (!correct && mst.score > seenBefore) mst = { ...mst, score: seenBefore, band: (prevMastery?.band as MasteryResult["band"]) ?? mst.band, isMastered: Boolean(prevMastery?.isMastered) };
  const masteryData = {
    score: mst.score, band: mst.band, attempts: Number(prevMastery?.attempts ?? 0) + 1, correct: Number(prevMastery?.correct ?? 0) + (correct ? 1 : 0),
    maxLevelCorrect: mst.components.maxLevelCorrect, isMastered: mst.isMastered, masteredAt: mst.isMastered ? (prevMastery?.masteredAt ?? now) : null, lastPracticedAt: now, components: mst.components,
    ...nextReview(prevMastery, mst.isMastered, correct, now),
  };
  const answered = sessionRows.length + 1;
  const answeredIds = new Set([...sessionRows.map((x) => String(x.questionId)), item.questionId]);
  // fixed sets: the next question is known without reading again; adaptive sets and the Diagnostic read the new answer
  const fixed = String(set?.type ?? "") !== "DIAGNOSTIC" && !set?.isAdaptive;
  // a fixed set's next question is known already: it is read while the answer is being saved
  const nextFixed = fixed ? order.find((id) => !answeredIds.has(id)) ?? null : null;
  const nextItem = nextFixed ? loadQuestionItems(repo, [nextFixed]).then((r) => r[0]).catch(() => undefined) : undefined;
  const { attempt, after, patch } = await repo.transaction(async (tx) => {
    const attempt = await tx.create("QuestionAttempt", {
      sessionId: s.id, studentId, questionId: item.questionId, skillId, response: { value: response }, isCorrect: correct,
      partialCredit: credit > 0 && credit < 1 ? credit : null, responseMs, usedHint: false, rapidGuess: step.rapidGuess, difficultyB: item.irt.b, createdAt: now,
      misconception,
    });
    await tx.upsert("StudentAbility", { studentId, scope: `SKILL:${skillId}` }, { skillId, theta: step.ability.theta, thetaSE: step.ability.se, responses: history.length + 1 },
      { theta: step.ability.theta, thetaSE: step.ability.se, responses: history.length + 1 });
    await tx.upsert("StudentSkillMastery", { studentId, skillId }, masteryData, masteryData);
    const after = await nextInSet(tx, a, order, String(s.id), studentId, { set, ...(fixed ? { answeredIds } : {}) });
    const goalSet = after.goal !== null;
    const done = goalSet ? !after.nextId : answered >= order.length || !after.nextId;
    // 🎯 the goal is reached once: the work is done (the student may keep practising)
    const goalNow = goalSet && after.goal!.reached && !s.goalReachedAt;
    const patch = {
      questionCount: answered, correctCount: Number(s.correctCount ?? 0) + (correct ? 1 : 0), activeMs: Number(s.activeMs ?? 0) + responseMs,
      currentServedAt: done ? null : now, ...(done ? { endedAt: now, endReason: "COMPLETED" } : {}), ...(goalNow ? { goalReachedAt: now } : {}),
    };
    // guarded by the database: a second request for the same answer (two servers, double clicks) is refused
    const moved = await tx.updateMany("PracticeSession", { id: s.id, questionCount: Number(s.questionCount ?? 0) }, patch);
    if (moved !== 1) throw new ValidationError("You already answered this question.");
    // ✅ the set is finished (last question, goal reached, or its questions ran out): Done in My Work with this
    // same answer — immediate and idempotent (completedAt IS NULL guard)
    if (done || goalNow) await markDone(tx, [String(a.id)], studentId, now);
    return { attempt, after, patch: { ...patch, done, goalNow } };
  });
  const goalSet = after.goal !== null;
  // after the response: the decision log of a set answer (θ BEFORE the answer for item calibration, mastery
  // before/after for growth; the next question follows the set, not the adaptive selector, so no route is made)
  runAfterResponse("quiz.decision_log", () => repo.create("AdaptiveDecisionLog", {
    ...step.log, attemptId: attempt.id, nextQuestionId: after.nextId, nextTargetB: null, responseCorrect: correct, createdAt: now,
    masteryBefore: seenBefore, masteryAfter: mst.score,
    reason: `${step.rapidGuess ? "Rapid response detected — counted as weak evidence. " : ""}Answer in an assigned set: ability and mastery updated; the next question follows the set.`,
    reasonCode: "ASSIGNED_SET",
  }));
  // stuck: many answers without reaching the goal — the class's teachers are told once (after the response)
  if (goalSet && answered === STUCK_AFTER && !after.goal!.reached) {
    const goal = after.goal!;
    runAfterResponse("quiz.stuck_notice", async () => {
      const teachers = await repo.findMany("ClassTeacher", { classId: a.classId }, { select: ["teacherId"] });
      const tRows = teachers.length ? await repo.findMany("Teacher", { id: { in: teachers.map((x) => x.teacherId) } }, { select: ["userId"] }) : [];
      const me = await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))?.userId });
      if (tRows.length) await repo.createMany("Notification", tRows.map((x) => ({ userId: x.userId, type: "PARENT_PROGRESS", title: `🆘 ${String(me?.displayName ?? "A student")} is stuck`, body: `${STUCK_AFTER} answers on “${hideLevels(String(a.title))}” and only ${goal.correct} of ${goal.target} correct. A short reteach may help.`, link: `/admin/student-file/${studentId}`, readAt: null, createdAt: now })));
    });
  }
  const feedback: Feedback = {
    correct, credit, yourAnswer: studentAnswerText(item, response), correctAnswer: correctAnswerText(item), whyCorrect: item.explanation.whyCorrect,
    whyYoursIsWrong: correct ? null : whyChosenWrong(item, response), tip: item.explanation.tip, rapidGuess: step.rapidGuess,
    masteryBefore: Math.round(seenBefore), masteryAfter: Math.round(mst.score), band: mst.band, xp: 0,
    next: { hasQuestion: !patch.done, endReason: patch.goalNow ? "GOAL" : patch.done ? "COMPLETED" : null, routeToSkillId: null, routeToSkillName: null },
    tutor: correct ? null : tutorFrom(item, response, step.ability.theta, misconception, repeatedBefore + (misconception ? 1 : 0)),
  };
  // the session as it is now (no re-reading)
  const { done: _done, goalNow: _goalNow, ...sessionPatch } = patch;
  void _done; void _goalNow;
  const sNow: Row = { ...s, ...sessionPatch };
  const attemptsNow: Row[] = [...sessionRows, { questionId: item.questionId, responseMs, createdAt: now }];
  const known = { attempts: attemptsNow, set, ...(String(set?.type ?? "") === "DIAGNOSTIC" ? {} : { next: after }), ...(nextItem && after.nextId === nextFixed ? { nextItem } : {}) };
  if (feedback.next.hasQuestion && !patch.goalNow) {
    // the set's status for the teacher and the work list: after the response
    runAfterResponse("quiz.status_refresh", () => refreshQuestionSets(repo, [a], [actor.studentId!], now));
  } else {
    // the work is done (last answer, or the goal reached): its status now, then its result (Weekly Check RIT,
    // Diagnostic analysis, Placement level)
    await refreshQuestionSets(repo, [a], [actor.studentId!], now);
  }
  // 🗓️ the Weekly Check: its result and the new RIT estimate when the last answer is in (once a week: kept with the
  // answer, so My Work shows the result at once)
  if (String(a.curriculumPlanId ?? "") === WEEKLY_CHECK_MARK && !feedback.next.hasQuestion) await finishWeeklyCheck(repo, String(a.id), actor.studentId!, String(sNow.id), String(actor.schoolId), now);
  // 📝 the Diagnostic Test: analysed when the last answer is in; the student sees no right/wrong while testing
  if (diag) {
    if (!feedback.next.hasQuestion) await recordDiagnosticResult(repo, diag, String(a.id), actor.studentId!, String(sNow.id), now);
    const blank: Feedback = { ...feedback, correct: false, credit: 0, correctAnswer: "", whyCorrect: "", whyYoursIsWrong: null, tip: "", masteryBefore: 0, masteryAfter: 0, xp: 0, tutor: null };
    return { feedback: blank, view: await quizView(repo, a, order, sNow, known) };
  }
  // a finished Placement test sets the student's level
  if (!feedback.next.hasQuestion && a.assessmentId) await applyPlacementResult(repo, String(a.assessmentId), String(sNow.id), actor.studentId!, now);
  // 📝 a teacher-built test: no right/wrong while testing (the review opens once it is completed)
  if (isTestAssignment(a)) return { feedback: { ...blankFeedback(), next: feedback.next }, view: await quizView(repo, a, order, sNow, known) };
  return { feedback, view: await quizView(repo, a, order, sNow, known) };
}

// ------------------------------------------------------------------ one request at a time per student (double clicks)

/** Starts or resumes practice on a skill (a double click never opens two sessions). */
export function startPractice(repo: Repo, actor: Actor, skillId: string, now = new Date(), random?: () => number): Promise<PracticeView> {
  return withLock(`practice:${actor.userId}:${skillId}`, () => startPracticeUnlocked(repo, actor, skillId, now, random));
}
/** One practice answer (a double click is answered once; a submit after the session ended is a no-op, not an error). */
export function submitAnswer(repo: Repo, actor: Actor, input: { sessionId: string; questionId: string; response: unknown; usedHint?: boolean }, now = new Date(), random?: () => number): Promise<{ feedback: Feedback; view: PracticeView }> {
  return withLock(`practice-session:${input.sessionId}`, async () => {
    try { return await submitAnswerUnlocked(repo, actor, input, now, random); }
    catch (e) {
      // lost the race to another server or tab that ended the session: the same friendly no-op reply
      if (e instanceof ValidationError) { const s = await ownSession(repo, actor, input.sessionId); if (s.endedAt) return endedSessionReply(repo, actor, s, input.questionId); }
      throw e;
    }
  });
}

/**
 * A submit for a practice session that already ended (two open tabs, a double click, a slow connection retrying):
 * nothing is written — no attempt, no mastery, no XP — and the result of that question's own answer is returned
 * again when it was answered (else a blank result), with `alreadyEnded` so the page shows "This practice is finished".
 */
async function endedSessionReply(repo: Repo, actor: Actor, s: Row, questionId: string): Promise<{ feedback: Feedback; view: PracticeView }> {
  // a finished practice: its work is Done (idempotent — normally already written with the last answer)
  if (s.assignmentId && isFinishReason(s.endReason)) await markDone(repo, [String(s.assignmentId)], String(s.studentId), s.endedAt ? d(s.endedAt) : new Date());
  const view = await currentQuestion(repo, actor, String(s.id));
  const base: Feedback = {
    ...blankFeedback(), masteryBefore: view.mastery, masteryAfter: view.mastery, band: view.band, alreadyEnded: true,
    next: { hasQuestion: false, endReason: s.endReason ? String(s.endReason) : "COMPLETED", routeToSkillId: null, routeToSkillName: null },
  };
  const [attempt] = await repo.findMany("QuestionAttempt", { sessionId: s.id, questionId }, { select: ["isCorrect", "partialCredit", "response", "rapidGuess"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 1 });
  if (!attempt) return { feedback: base, view };
  const item = (await practiceItems(repo, String(s.skillId), s.assignmentId)).items.find((i) => i.questionId === questionId);
  if (!item) return { feedback: base, view };
  let stored: unknown = attempt.response;
  if (typeof stored === "string") { try { stored = JSON.parse(stored); } catch { stored = null; } }
  const response = stored && typeof stored === "object" && "value" in stored ? (stored as { value: unknown }).value : stored;
  const correct = Boolean(attempt.isCorrect);
  const partial = attempt.partialCredit === null || attempt.partialCredit === undefined ? null : Number(attempt.partialCredit);
  return {
    feedback: {
      ...base, correct, credit: correct ? 1 : partial ?? 0, rapidGuess: Boolean(attempt.rapidGuess),
      yourAnswer: studentAnswerText(item, response), correctAnswer: correctAnswerText(item), whyCorrect: item.explanation.whyCorrect,
      whyYoursIsWrong: correct ? null : whyChosenWrong(item, response), tip: item.explanation.tip,
    },
    view,
  };
}
/** Starts or resumes the student's question set (continues from the first unanswered question). */
export function startQuiz(repo: Repo, actor: Actor, assignmentId: string, now = new Date()): Promise<QuizView> {
  return withLock(`quiz:${actor.userId}:${assignmentId}`, () => startQuizUnlocked(repo, actor, assignmentId, now));
}
/** One answer of a set (a double click is answered once). */
export function submitQuizAnswer(repo: Repo, actor: Actor, input: { assignmentId: string; questionId: string; response: unknown }, now = new Date()): Promise<{ feedback: Feedback; view: QuizView }> {
  return withLock(`quiz:${actor.userId}:${input.assignmentId}`, () => submitQuizAnswerUnlocked(repo, actor, input, now));
}
