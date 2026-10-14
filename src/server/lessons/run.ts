/**
 * 🧩 Interactive intervention lessons (LessonRun): gradual release for one skill.
 *
 *   MODEL        I do: definition, strategy steps, an original model passage with its clue sentences, a think-aloud,
 *                and a worked example the student answers (which sentence proves the answer?)
 *   GUIDED       we do: 3 published bank items of the skill at/below the student's level, with the 3-step hint ladder
 *                (question type + strategy · paragraph · clue sentence); every hint lowers the credit
 *   INDEPENDENT  you do: 3 items, no hints (2 of 3 to go on)
 *   CHECK        quick check: 5 items, 4 of 5 = passed → DONE
 *
 * A missed phase goes back one phase with the NEXT re-teach approach (1 = organizer first, 2 = easier items +
 * sentence frames); an approach is never repeated: after approach 2 the run ends and the teachers are told.
 * Every answer is scored with the bank scorer and saved as a QuestionAttempt in the run's PracticeSession, and it
 * updates ability and mastery with the same engine as practice.
 */
import { ATTEMPT_SOURCE_WEIGHT, skillHistoryWithEvidence } from "../practice/skill-evidence";
import { processAnswer } from "../../adaptive/engine";
import { isRecentRepeat, markRepeats } from "../../adaptive/evidence";
import { resolveEngineConfig, type AdaptiveConfig, type MasteryThresholds } from "../../config/engine";
import { scoreResponse } from "../../imports/questions/validate";
import { nextReview } from "../../mastery/review";
import { bandOfTheta, creditAfterHints, tutorFeedback, type HintStep } from "../../tutor/tutor";
import type { MasteryResult, ResponseEvidence } from "../../types/domain";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { withLock } from "../lib/key-lock";
import { runAfterResponse } from "../lib/after-response";
import { modelVersion } from "../cache/bank-version";
import { answerTexts, attemptMisconception, correctAnswerText, loadQuestionItems, loadSkillItems, studentAnswerText, toCandidate, toClientQuestion, whyChosenWrong, type ClientQuestion, type PracticeItem } from "../practice/items";
import { normalizeResponse, type Feedback } from "../practice/session";
import type { Repo, Row } from "../seeding/repo";
import { ORGANIZERS, lessonForSkill, type LessonContent, type OrganizerKind, type OrganizerSpec } from "./content";
import { itemHintStep } from "./hints";
import { freshOrder, itemContentKeys, seenIndex, Sitting } from "../questions/fresh";
import { isRapidGuess as isRapidAnswer } from "../practice/guessing";

export type Phase = "MODEL" | "GUIDED" | "INDEPENDENT" | "CHECK" | "DONE";
export type LessonSource = "STUDENT" | "TEACHER" | "TIER" | "ASSIGNMENT";
export const PHASES: Phase[] = ["MODEL", "GUIDED", "INDEPENDENT", "CHECK", "DONE"];
export const PHASE_SIZE = { GUIDED: 3, INDEPENDENT: 3, CHECK: 5 } as const;
/** correct answers needed to go on (GUIDED always goes on: it is supported practice) */
export const PHASE_PASS = { GUIDED: 0, INDEPENDENT: 2, CHECK: 4 } as const;
export const MAX_APPROACH = 2;
/**
 * Lesson answers live in a PracticeSession of this mode. The SessionMode enum has no "LESSON" value yet, so lesson
 * sessions use ADAPTIVE_PRACTICE and are marked with endReason "LESSON" (and never have a current question, so
 * normal practice never resumes them). Switch to "LESSON" once the enum has it.
 */
export const LESSON_SESSION_MODE = "ADAPTIVE_PRACTICE";
export const LESSON_SESSION_MARK = "LESSON";

type ItemPhase = "GUIDED" | "INDEPENDENT" | "CHECK";
export type LogEntry =
  | { t: "SESSION"; sessionId: string; at: string }
  | { t: "MODEL"; correct: boolean; pick: number; at: string }
  | { t: "SET"; phase: ItemPhase; approach: number; ids: string[]; at: string }
  | { t: "HINT"; phase: ItemPhase; questionId: string; level: number; at: string }
  | { t: "ANS"; phase: ItemPhase; questionId: string; correct: boolean; credit: number; hints: number; approach: number; at: string }
  | { t: "RESULT"; phase: ItemPhase; correct: number; total: number; passed: boolean; approach: number; at: string };

export interface OrganizerValue { kind: OrganizerKind; head: string; rows: string[][]; foot: string; complete: boolean; missing: string[]; savedAt: string }

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const json = <T>(v: unknown, dflt: T): T => { if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return dflt; } } return (v ?? dflt) as T; };
export const logOf = (run: Row): LogEntry[] => { const l = json<unknown>(run.log, []); return Array.isArray(l) ? (l as LogEntry[]) : []; };
export const organizerOf = (run: Row): OrganizerValue | null => (run.organizer ? json<OrganizerValue | null>(run.organizer, null) : null);

// ------------------------------------------------------------------ organizers (pure)

const filled = (x: unknown) => typeof x === "string" && x.trim().length >= 2 && /[\p{L}\p{N}]/u.test(x);

/** Is the organizer complete? Every box on top/bottom, and `requiredRows` rows with every column filled. */
export function organizerCompleteness(spec: OrganizerSpec, v: { head?: string; rows?: string[][]; foot?: string }): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (spec.head && !filled(v.head)) missing.push(spec.head);
  const fullRows = (v.rows ?? []).slice(0, spec.rows).filter((r) => spec.columns.every((_, c) => filled(r?.[c]))).length;
  if (fullRows < spec.requiredRows) missing.push(`${spec.requiredRows - fullRows} more complete row${spec.requiredRows - fullRows === 1 ? "" : "s"} (${spec.columns.join(" + ")})`);
  if (spec.foot && !filled(v.foot)) missing.push(spec.foot);
  return { complete: missing.length === 0, missing };
}

/** Cleans what the browser sent into the organizer's shape (text only, bounded). */
export function cleanOrganizer(spec: OrganizerSpec, raw: unknown): { head: string; rows: string[][]; foot: string } {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as { head?: unknown; rows?: unknown; foot?: unknown };
  const t = (x: unknown) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 300) : "");
  const rows = Array.isArray(r.rows) ? r.rows : [];
  return {
    head: spec.head ? t(r.head) : "",
    rows: Array.from({ length: spec.rows }, (_, i) => spec.columns.map((_, c) => t(Array.isArray(rows[i]) ? (rows[i] as unknown[])[c] : ""))),
    foot: spec.foot ? t(r.foot) : "",
  };
}

// ------------------------------------------------------------------ state of a run (pure)

/** The current item set of the run's phase, its answers so far and the question on screen. */
export function phaseState(run: Row) {
  const log = logOf(run);
  const phase = s(run.phase) as Phase;
  let setAt = -1;
  for (let i = log.length - 1; i >= 0; i--) { const e = log[i]; if (e.t === "SET" && e.phase === phase) { setAt = i; break; } if (e.t === "RESULT") break; }
  const set = setAt >= 0 ? (log[setAt] as Extract<LogEntry, { t: "SET" }>) : null;
  const after = setAt >= 0 ? log.slice(setAt + 1) : [];
  const answers = after.filter((e): e is Extract<LogEntry, { t: "ANS" }> => e.t === "ANS");
  const currentId = set && answers.length < set.ids.length ? set.ids[answers.length] : null;
  const hintLevel = currentId ? Math.max(0, ...after.filter((e): e is Extract<LogEntry, { t: "HINT" }> => e.t === "HINT" && e.questionId === currentId).map((e) => e.level)) : 0;
  const lastAt = [set?.at, ...answers.map((a) => a.at)].filter(Boolean).pop();
  return { log, phase, set, answers, currentId, hintLevel, servedAt: lastAt ? new Date(String(lastAt)) : null };
}

/** Where a missed phase goes back to. */
export const previousPhase = (p: ItemPhase): ItemPhase => (p === "CHECK" ? "INDEPENDENT" : "GUIDED");

/**
 * Bank items for a phase: at or below the student's level (b ≤ θ + 0.3; approach 2: easier, b ≤ θ − 0.7), the
 * closest to the level first (approach 2: the easiest first). The school's no-repeat rule (questions/fresh.ts): never
 * an item used in this run (one sitting), nor a copy of one (`keys`: content keys), never the same item twice in a
 * set; items the student never attempted before (`seenAt` 0) first, then the ones seen longest ago. A skill with too
 * few new items gives a shorter set; only a skill whose WHOLE bank was used in this run reuses items (least used
 * first, never twice in one set) so the lesson can still go on. Deterministic.
 */
export function pickItems(items: { questionId: string; b: number; keys?: readonly string[] }[], theta: number, n: number, used: Map<string, number>, approach: number, seenAt: (id: string) => number = () => 0): string[] {
  const ceiling = approach >= 2 ? theta - 0.7 : theta + 0.3;
  const byId = (a: { questionId: string }, b: { questionId: string }) => a.questionId.localeCompare(b.questionId);
  const below = items.filter((i) => i.b <= ceiling).sort((a, b) => (approach >= 2 ? a.b - b.b : b.b - a.b) || byId(a, b));
  const above = items.filter((i) => i.b > ceiling).sort((a, b) => a.b - b.b || byId(a, b));
  const ordered = [...below, ...above];
  const sitting = new Sitting();
  for (const i of items) if (used.has(i.questionId)) sitting.add(i.questionId, i.keys ?? []);
  const fresh = freshOrder(ordered.filter((i) => !sitting.has(i.questionId, i.keys ?? [])), (i) => seenAt(i.questionId));
  const pick = (list: typeof items): string[] => {
    const set = new Sitting(), out: string[] = [];
    for (const i of list) { if (out.length >= n) break; if (set.has(i.questionId, i.keys ?? [])) continue; set.add(i.questionId, i.keys ?? []); out.push(i.questionId); }
    return out;
  };
  const out = pick(fresh);
  if (out.length) return out;
  // the whole bank of the skill was used in this run: least used first (still never twice in one set)
  return pick(ordered.filter((i) => used.has(i.questionId)).sort((a, b) => (used.get(a.questionId)! - used.get(b.questionId)!) || a.b - b.b || byId(a, b)));
}

/** Correct answers needed to pass a phase: the usual number, scaled down when the set had to be shorter. */
export const passNeed = (phase: ItemPhase, total: number): number => Math.min(PHASE_PASS[phase], Math.ceil((PHASE_PASS[phase] * total) / PHASE_SIZE[phase]));

// ------------------------------------------------------------------ database helpers

/**
 * Skill rows and engine settings read on every lesson answer, kept in memory while no write to their tables has
 * happened in this process and for at most a minute (another process may change them) — Update 42B.
 */
const refCache = new Map<string, { v: string; at: number; value: unknown }>();
async function cachedRef<T>(key: string, models: string[], load: () => Promise<T>): Promise<T> {
  const v = modelVersion(...models), now = Date.now();
  const hit = refCache.get(key);
  if (hit && hit.v === v && now - hit.at < 60_000 && now >= hit.at) return hit.value as T;
  const value = await load();
  if (refCache.size > 5000) refCache.clear();
  refCache.set(key, { v, at: now, value });
  return value;
}

async function skillAndContent(repo: Repo, skillId: string): Promise<{ skill: Row; content: LessonContent }> {
  const { skill, fam } = await cachedRef(`skill+family:${skillId}`, ["Skill", "SkillFamily"], async () => {
    const skill = await repo.findUnique("Skill", { id: skillId });
    const fam = skill?.familyId ? await repo.findUnique("SkillFamily", { id: skill.familyId }) : null;
    return { skill, fam };
  });
  if (!skill || skill.deletedAt || skill.isActive === false) throw new ValidationError("This skill is not available.");
  const content = lessonForSkill({ familyCode: s(fam?.code), code: s(skill.code), name: s(skill.name) });
  if (!content) throw new ValidationError("There is no lesson for this skill yet.");
  return { skill: { ...skill }, content };
}

/** Has this skill got a lesson? (its family has lesson content) */
export async function hasLesson(repo: Repo, skillId: string): Promise<boolean> {
  try { await skillAndContent(repo, skillId); return true; } catch { return false; }
}

/** ⚡ hasLesson for many skills at once: two reads in all (not two per skill). Same answer as hasLesson. */
export async function hasLessons(repo: Repo, skillIds: string[]): Promise<Map<string, boolean>> {
  const ids = [...new Set(skillIds.filter(Boolean))];
  const out = new Map<string, boolean>(ids.map((id) => [id, false]));
  if (!ids.length) return out;
  const skills = await repo.findMany("Skill", { id: { in: ids } }, { select: ["id", "code", "name", "familyId", "deletedAt", "isActive"] });
  const famIds = [...new Set(skills.map((k) => s(k.familyId)).filter(Boolean))];
  const fams = famIds.length ? await repo.findMany("SkillFamily", { id: { in: famIds } }, { select: ["id", "code"] }) : [];
  const famCode = new Map(fams.map((f) => [s(f.id), s(f.code)]));
  for (const k of skills) {
    if (k.deletedAt || k.isActive === false) continue;
    out.set(s(k.id), Boolean(lessonForSkill({ familyCode: famCode.get(s(k.familyId)) ?? "", code: s(k.code), name: s(k.name) })));
  }
  return out;
}

async function assertSkillInStudentCurriculum(repo: Repo, student: Row, skillId: string): Promise<void> {
  const [skill, curs] = await Promise.all([repo.findUnique("Skill", { id: skillId }), repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true })]);
  if (!skill || !curs.some((c) => c.id === skill.curriculumId)) throw new ForbiddenError("This skill is not part of your curriculum.");
}

async function engineConfig(repo: Repo, schoolId: string | null): Promise<{ adaptive: AdaptiveConfig; mastery: MasteryThresholds }> {
  if (!schoolId) return resolveEngineConfig();
  const rows = await cachedRef(`cfg:${schoolId}`, ["SchoolSetting"], () => repo.findMany("SchoolSetting", { schoolId, key: { in: ["adaptive.engine", "mastery.thresholds"] } }));
  const get = (k: string) => (rows.find((r) => r.key === k)?.value ?? {}) as Record<string, unknown>;
  return resolveEngineConfig(get("adaptive.engine"), get("mastery.thresholds"));
}

/** The student's ability on the skill (else their domain placement, else the prior). */
async function abilityOf(repo: Repo, studentId: string, skill: Row, cfg: AdaptiveConfig) {
  const [row, dom] = await Promise.all([
    repo.findUnique("StudentAbility", { studentId, scope: `SKILL:${s(skill.id)}` }),
    repo.findUnique("StudentAbility", { studentId, scope: `DOMAIN:${s(skill.domain)}` }),
  ]);
  const priorMean = dom ? Number(dom.theta) : cfg.priorMean;
  return { theta: row ? Number(row.theta) : priorMean, se: row ? Number(row.thetaSE) : cfg.priorSD, prior: { mean: priorMean, sd: cfg.priorSD } };
}

async function history(repo: Repo, studentId: string, skillId: string, items: Map<string, PracticeItem>): Promise<ResponseEvidence[]> {
  return skillHistoryWithEvidence(repo, studentId, skillId, items, 60);
}

/** Saves one lesson answer as a QuestionAttempt and updates ability and mastery (the practice engine). */
/**
 * Also used by 🔁 Review my mistakes (readiness fix C-2), so every answer outside a practice session goes through the
 * same engine: repeat weight (isRecentRepeat), rapid-guess detection, ability and mastery.
 */
export async function recordEngineAttempt(tx: Repo, a: { sessionId: string; studentId: string; skillId: string; schoolId: string | null; item: PracticeItem; response: unknown; credit: number; usedHint: boolean; responseMs: number; now: Date; reasonCode?: string; reason?: string; source?: string }) {
  return recordAttempt(tx, a);
}

type AttemptInput = { sessionId: string; studentId: string; skillId: string; schoolId: string | null; item: PracticeItem; response: unknown; credit: number; usedHint: boolean; responseMs: number; now: Date; reasonCode?: string; reason?: string; source?: string };

async function recordAttempt(tx: Repo, a: AttemptInput) {
  const prep = await prepareAttempt(tx, a, a.sessionId);
  const out = await writeAttempt(tx, prep, a.sessionId);
  await tx.create("AdaptiveDecisionLog", out.decisionLog);
  return out.result;
}

/**
 * Update 42B: the READ half of an engine answer (settings, items, history, ability, mastery, the session's answers),
 * done in parallel and — for lesson answers — before the transaction. `sessionId` null: a session not created yet.
 */
async function prepareAttempt(repo: Repo, a: Omit<AttemptInput, "sessionId">, sessionId: string | null) {
  const { studentId, skillId, item, now } = a;
  const correct = a.credit >= 1;
  const [cfg, skill, skillItems] = await Promise.all([engineConfig(repo, a.schoolId), cachedRef(`skill:${skillId}`, ["Skill"], () => repo.findUnique("Skill", { id: skillId })), loadSkillItems(repo, skillId)]);
  const byId = new Map(skillItems.map((i) => [i.questionId, i]));
  if (!byId.has(item.questionId)) byId.set(item.questionId, item);
  const [hist, ability, prevMastery, sessionCorrect] = await Promise.all([
    history(repo, studentId, skillId, byId), abilityOf(repo, studentId, skill!, cfg.adaptive),
    repo.findUnique("StudentSkillMastery", { studentId, skillId }),
    sessionId ? repo.findMany("QuestionAttempt", { sessionId }, { select: ["id", "isCorrect", "createdAt"], orderBy: [{ field: "createdAt", dir: "asc" }, { field: "id", dir: "asc" }] }).then((r) => r.map((x) => Boolean(x.isCorrect))) : Promise.resolve([] as boolean[]),
  ]);
  const evidence: ResponseEvidence = {
    itemId: item.questionId, correct, credit: a.credit > 0 && a.credit < 1 ? a.credit : undefined, level: item.level,
    a: item.irt.a, b: item.irt.b, c: item.irt.c, responseMs: a.responseMs, estimatedSeconds: item.estimatedSeconds, usedHint: a.usedHint, at: now.toISOString(),
    repeat: isRecentRepeat(hist, item.questionId, now.toISOString()),
    // 🎲 r67: the owner's rapid-guess rule (under 3 s): it counts for nothing (weight 0; ability and mastery kept)
    rapid: isRapidAnswer(a.responseMs),
    ...(a.source && ATTEMPT_SOURCE_WEIGHT[a.source] !== undefined ? { sourceWeight: ATTEMPT_SOURCE_WEIGHT[a.source] } : {}),
  };
  const step = processAnswer({
    studentId, skillId, sessionId: sessionId ?? "", mode: "PRACTICE", ability: { theta: ability.theta, se: ability.se }, prior: ability.prior, history: hist,
    previousTargetB: null, candidates: [...byId.values()].map((i) => toCandidate(i, skillId)), prerequisites: [], sessionCorrect,
  }, evidence, cfg, now);
  const seenBefore = prevMastery ? Number(prevMastery.score) : step.log.masteryBefore;
  let mst: MasteryResult = step.mastery;
  if (!correct && mst.score > seenBefore) mst = { ...mst, score: seenBefore, band: (prevMastery?.band as MasteryResult["band"]) ?? mst.band, isMastered: Boolean(prevMastery?.isMastered) };
  return { a, correct, step, histLength: hist.length, prevMastery, seenBefore, mst };
}

/** The WRITE half: attempt, ability, mastery. Returns the result and the decision-log row (written by the caller). */
async function writeAttempt(tx: Repo, p: Awaited<ReturnType<typeof prepareAttempt>>, sessionId: string) {
  const { a, correct, step, prevMastery, seenBefore, mst } = p;
  const { studentId, skillId, item, now } = a;
  const attempt = await tx.create("QuestionAttempt", {
    sessionId, studentId, questionId: item.questionId, skillId, response: { value: a.response }, isCorrect: correct,
    partialCredit: a.credit > 0 && a.credit < 1 ? a.credit : null, responseMs: a.responseMs, usedHint: a.usedHint, rapidGuess: step.rapidGuess,
    difficultyB: item.irt.b, createdAt: now, misconception: correct ? null : attemptMisconception(item, a.response), source: a.source ?? (a.reasonCode === "REVIEW" ? "REVIEW" : "LESSON"),
  });
  if (!step.rapidGuess) await tx.upsert("StudentAbility", { studentId, scope: `SKILL:${skillId}` }, { skillId, theta: step.ability.theta, thetaSE: step.ability.se, responses: p.histLength + 1 },
    { theta: step.ability.theta, thetaSE: step.ability.se, responses: p.histLength + 1 });
  const masteryData = {
    score: mst.score, band: mst.band, attempts: Number(prevMastery?.attempts ?? 0) + 1, correct: Number(prevMastery?.correct ?? 0) + (correct ? 1 : 0),
    maxLevelCorrect: mst.components.maxLevelCorrect, isMastered: mst.isMastered, masteredAt: mst.isMastered ? (prevMastery?.masteredAt ?? now) : null, lastPracticedAt: now, components: mst.components,
    ...nextReview(prevMastery, mst.isMastered, correct, now),
  };
  if (!step.rapidGuess) await tx.upsert("StudentSkillMastery", { studentId, skillId }, masteryData, masteryData);
  const decisionLog: Row = {
    ...step.log, sessionId, attemptId: attempt.id, nextQuestionId: null, nextTargetB: null, responseCorrect: correct, createdAt: now,
    masteryBefore: seenBefore, masteryAfter: mst.score,
    reason: `${step.rapidGuess ? "Rapid guess: counted for nothing. " : ""}${a.reason ?? "Answer in an intervention lesson: ability and mastery updated; the next question follows the lesson."}`,
    reasonCode: a.reasonCode ?? "LESSON",
  };
  return { result: { correct, rapidGuess: step.rapidGuess, theta: step.ability.theta, masteryBefore: seenBefore, masteryAfter: mst.score, band: mst.band }, decisionLog };
}

/** The PracticeSession that holds the run's answers (created on the first answer). */
async function sessionOf(tx: Repo, run: Row, now: Date): Promise<{ id: string; created: LogEntry | null }> {
  const e = logOf(run).find((x): x is Extract<LogEntry, { t: "SESSION" }> => x.t === "SESSION");
  if (e && (await tx.findUnique("PracticeSession", { id: e.sessionId }))) return { id: e.sessionId, created: null };
  const ses = await tx.create("PracticeSession", { studentId: run.studentId, skillId: run.skillId, mode: LESSON_SESSION_MODE, startedAt: now, endReason: LESSON_SESSION_MARK });
  return { id: s(ses.id), created: { t: "SESSION", sessionId: s(ses.id), at: now.toISOString() } };
}

/** A new item set for `phase` (approach `approach`). */
async function newSet(repo: Repo, run: Row, phase: ItemPhase, approach: number, now: Date): Promise<LogEntry> {
  const skill = (await repo.findUnique("Skill", { id: run.skillId }))!;
  const items = await loadSkillItems(repo, s(run.skillId));
  if (!items.length) throw new ValidationError("There are no questions for this skill yet.");
  const cfg = await engineConfig(repo, s(run.schoolId) || null);
  const { theta } = await abilityOf(repo, s(run.studentId), skill, cfg.adaptive);
  const used = new Map<string, number>();
  for (const e of logOf(run)) if (e.t === "SET") for (const id of e.ids) used.set(id, (used.get(id) ?? 0) + 1);
  // never an item (or a copy of one) already used in this run; items the student never attempted first
  const pool = items.map((i) => ({ questionId: i.questionId, b: i.irt.b, keys: itemContentKeys(i) }));
  const runSession = logOf(run).find((e): e is Extract<LogEntry, { t: "SESSION" }> => e.t === "SESSION")?.sessionId;
  const seen = await seenIndex(repo, s(run.studentId), pool.map((q) => ({ id: q.questionId, keys: q.keys })), { exceptSessions: runSession ? [runSession] : [] });
  const keysOf = new Map(pool.map((q) => [q.questionId, q.keys]));
  const ids = pickItems(pool, theta, PHASE_SIZE[phase], used, approach, (id) => seen.lastSeen(id, keysOf.get(id) ?? []));
  return { t: "SET", phase, approach, ids, at: now.toISOString() };
}

/** Writes the run, guarded on its last update (a double click or a second tab is refused). */
async function saveRun(tx: Repo, run: Row, patch: Row): Promise<void> {
  const moved = await tx.updateMany("LessonRun", { id: run.id, phase: run.phase, attempts: Number(run.attempts), approach: Number(run.approach) }, patch);
  if (moved !== 1) throw new ValidationError("This lesson changed in another window. Please reload.");
}

async function teacherUserIds(repo: Repo, studentId: string): Promise<string[]> {
  const classIds = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
  const tIds = classIds.length ? (await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["teacherId"] })).map((t) => s(t.teacherId)) : [];
  return tIds.length ? [...new Set((await repo.findMany("Teacher", { id: { in: [...new Set(tIds)] } }, { select: ["userId"] })).map((t) => s(t.userId)))] : [];
}

async function studentName(repo: Repo, studentId: string): Promise<string> {
  const st = await repo.findUnique("Student", { id: studentId });
  const u = st ? await repo.findUnique("User", { id: st.userId }) : null;
  return s(u?.displayName) || "A student";
}

// ------------------------------------------------------------------ start / invite

/** The student's open (not finished) run for a skill, if any. */
export async function openRunFor(repo: Repo, studentId: string, skillId: string): Promise<Row | null> {
  const rows = await repo.findMany("LessonRun", { studentId, skillId }, { orderBy: [{ field: "startedAt", dir: "desc" }] });
  return rows.find((r) => s(r.phase) !== "DONE") ?? null;
}

/** Starts a lesson run (or returns the open one: a student has at most one open run per skill). */
export async function startLesson(repo: Repo, studentId: string, skillId: string, source: LessonSource, now = new Date()): Promise<{ run: Row; created: boolean }> {
  const open = await openRunFor(repo, studentId, skillId);
  if (open) return { run: open, created: false };
  await skillAndContent(repo, skillId);
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || st.deletedAt) throw new ValidationError("Student not found.");
  const run = await repo.create("LessonRun", { studentId, schoolId: st.schoolId, skillId, source, phase: "MODEL", attempts: 0, approach: 0, log: [], startedAt: now, updatedAt: now });
  return { run, created: true };
}

/** Invites the student to the lesson (run + notification with a link). Idempotent: an open run is not invited again. */
export async function inviteToLesson(repo: Repo, studentId: string, skillId: string, source: LessonSource, now = new Date(), note?: string): Promise<boolean> {
  if (!(await hasLesson(repo, skillId))) return false;
  const { created } = await startLesson(repo, studentId, skillId, source, now);
  if (!created) return false;
  const [st, skill] = await Promise.all([repo.findUnique("Student", { id: studentId }), repo.findUnique("Skill", { id: skillId })]);
  if (st) await repo.create("Notification", {
    userId: st.userId, type: "NEW_ASSIGNMENT", title: `🧩 A lesson for you: ${s(skill?.name)}`,
    body: note ?? "A short lesson with examples, hints and a quick check. Open it when you are ready.",
    link: `/student/lesson?skillId=${encodeURIComponent(skillId)}`, readAt: null, createdAt: now,
  });
  return true;
}

// ------------------------------------------------------------------ the student's view

export interface LessonView {
  runId: string; skillId: string; skillName: string; source: string;
  phase: Phase; approach: number; attempts: number; checkPct: number | null; passed: boolean | null;
  content: { name: string; definition: string; steps: string[]; signalWords: string[]; passage: { title: string; text: string; clues: string[] }; thinkAloud: string[]; frames: string[]; workedQuestion: string };
  /** the worked example: answered? then the answer and why (revealed only after the student tried) */
  model: { sentences: string[]; answered: boolean; correct: boolean | null; answer: string | null; why: string | null };
  reteach: { title: string; how: string } | null;
  showFrames: boolean;
  organizer: { spec: OrganizerSpec; value: OrganizerValue | null; required: boolean } | null;
  progress: { index: number; total: number; correct: number } | null;
  question: ClientQuestion | null;
  hints: HintStep[];
  canHint: boolean;
  lastResult: { phase: string; correct: number; total: number; passed: boolean } | null;
  outcome: "PASSED" | "NEEDS_TEACHER" | null;
}

/** Sentences of the model passage (the worked example's choices). */
export const modelSentences = (c: LessonContent) => c.passage.text.split(/\n\n+/).flatMap((p) => (p.match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g) ?? []).map((x) => x.trim()).filter((x) => x.length > 1));

async function ownRun(repo: Repo, actor: Actor, runId: string): Promise<Row> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can take lessons.");
  const run = await repo.findUnique("LessonRun", { id: runId });
  if (!run || run.studentId !== actor.studentId) throw new ForbiddenError("This lesson is not yours.");
  return run;
}

/** Builds the screen of a run (no answer keys). */
export async function buildView(repo: Repo, run: Row): Promise<LessonView> {
  const { skill, content } = await skillAndContent(repo, s(run.skillId));
  const st = phaseState(run);
  const approach = Number(run.approach);
  const modelEntry = st.log.find((e): e is Extract<LogEntry, { t: "MODEL" }> => e.t === "MODEL") ?? null;
  const spec = content.organizer !== "NONE" ? ORGANIZERS[content.organizer] : null;
  const org = organizerOf(run);
  let question: ClientQuestion | null = null;
  const hints: HintStep[] = [];
  if (st.currentId && st.set) {
    const item = (await loadQuestionItems(repo, [st.currentId]))[0];
    if (item) {
      question = toClientQuestion(item, `${s(run.id)}:${item.questionId}:${st.answers.length}`);
      for (let k = 1; k <= st.hintLevel; k++) hints.push(await itemHintStep(repo, item, s(skill.code), k));
    }
  }
  const results = st.log.filter((e): e is Extract<LogEntry, { t: "RESULT" }> => e.t === "RESULT");
  const last = results[results.length - 1] ?? null;
  const phase = s(run.phase) as Phase;
  return {
    runId: s(run.id), skillId: s(run.skillId), skillName: s(skill.name), source: s(run.source),
    phase, approach, attempts: Number(run.attempts), checkPct: run.checkPct === null || run.checkPct === undefined ? null : Number(run.checkPct), passed: run.passed === null || run.passed === undefined ? null : Boolean(run.passed),
    content: { name: content.name, definition: content.definition, steps: content.steps, signalWords: content.signalWords, passage: content.passage, thinkAloud: content.thinkAloud, frames: [...content.frames], workedQuestion: content.worked.question },
    model: { sentences: modelSentences(content), answered: Boolean(modelEntry), correct: modelEntry ? modelEntry.correct : null, answer: modelEntry ? content.worked.answer : null, why: modelEntry ? content.worked.why : null },
    reteach: approach > 0 ? content.reteach[Math.min(approach, MAX_APPROACH) - 1] : null,
    showFrames: approach >= 2 || phase === "GUIDED",
    organizer: spec ? { spec, value: org, required: approach === 1 && phase !== "DONE" } : null,
    progress: st.set ? { index: Math.min(st.answers.length + 1, st.set.ids.length), total: st.set.ids.length, correct: st.answers.filter((a) => a.correct).length } : null,
    question, hints, canHint: phase === "GUIDED" && Boolean(question) && st.hintLevel < 3,
    lastResult: last ? { phase: last.phase, correct: last.correct, total: last.total, passed: last.passed } : null,
    outcome: phase === "DONE" ? (run.passed ? "PASSED" : "NEEDS_TEACHER") : null,
  };
}

async function openLessonUnlocked(repo: Repo, actor: Actor, skillId: string, now: Date, again: boolean): Promise<LessonView> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can take lessons.");
  const student = (await repo.findUnique("Student", { id: actor.studentId }))!;
  await assertSkillInStudentCurriculum(repo, student, skillId);
  if (!again && !(await openRunFor(repo, actor.studentId, skillId))) {
    // a finished lesson shows its result until the student chooses to start again
    const last = (await repo.findMany("LessonRun", { studentId: actor.studentId, skillId }, { orderBy: [{ field: "startedAt", dir: "desc" }], take: 1 }))[0];
    if (last) return buildView(repo, last);
  }
  const { run } = await startLesson(repo, actor.studentId, skillId, "STUDENT", now);
  return buildView(repo, run);
}

/** The student opens (or resumes) the lesson for a skill; `again` starts a new run after a finished one. */
export function openLesson(repo: Repo, actor: Actor, skillId: string, now = new Date(), opts: { again?: boolean } = {}): Promise<LessonView> {
  return withLock(`lesson-open:${actor.userId}:${skillId}`, () => openLessonUnlocked(repo, actor, skillId, now, Boolean(opts.again)));
}

export async function lessonView(repo: Repo, actor: Actor, runId: string): Promise<LessonView> {
  return buildView(repo, await ownRun(repo, actor, runId));
}

// ------------------------------------------------------------------ MODEL: the worked example

/** The student answers the worked example (which sentence proves the answer?); the run moves on to GUIDED. */
export function answerModel(repo: Repo, actor: Actor, runId: string, pick: number, now = new Date()): Promise<LessonView> {
  return withLock(`lesson:${runId}`, async () => {
    const run = await ownRun(repo, actor, runId);
    if (s(run.phase) !== "MODEL") throw new ValidationError("This part of the lesson is finished.");
    const { content } = await skillAndContent(repo, s(run.skillId));
    const sentences = modelSentences(content);
    if (!Number.isInteger(pick) || pick < 0 || pick >= sentences.length) throw new ValidationError("Choose one sentence from the text.");
    const norm = (x: string) => x.replace(/\s+/g, " ").trim();
    const correct = content.passage.clues.some((c) => norm(c).includes(norm(sentences[pick])) || norm(sentences[pick]).includes(norm(c)));
    const log = [...logOf(run), { t: "MODEL", correct, pick, at: now.toISOString() } as LogEntry];
    await saveRun(repo, run, { log, updatedAt: now });
    return buildView(repo, { ...run, log });
  });
}

/** After reading the worked example's answer the student starts guided practice. */
export function beginGuided(repo: Repo, actor: Actor, runId: string, now = new Date()): Promise<LessonView> {
  return withLock(`lesson:${runId}`, async () => {
    const run = await ownRun(repo, actor, runId);
    if (s(run.phase) !== "MODEL") return buildView(repo, run);
    if (!logOf(run).some((e) => e.t === "MODEL")) throw new ValidationError("Answer the worked example first.");
    const set = await newSet(repo, run, "GUIDED", Number(run.approach), now);
    const log = [...logOf(run), set];
    await saveRun(repo, run, { phase: "GUIDED", log, updatedAt: now });
    return buildView(repo, { ...run, phase: "GUIDED", log });
  });
}

// ------------------------------------------------------------------ organizer

/** Saves the student's organizer (structure skills) and reports whether it is complete. */
export function saveOrganizer(repo: Repo, actor: Actor, runId: string, raw: unknown, now = new Date()): Promise<{ complete: boolean; missing: string[]; view: LessonView }> {
  return withLock(`lesson:${runId}`, async () => {
    const run = await ownRun(repo, actor, runId);
    if (s(run.phase) === "DONE") throw new ValidationError("This lesson is finished.");
    const { content } = await skillAndContent(repo, s(run.skillId));
    if (content.organizer === "NONE") throw new ValidationError("This lesson has no organizer.");
    const spec = ORGANIZERS[content.organizer];
    const clean = cleanOrganizer(spec, raw);
    const c = organizerCompleteness(spec, clean);
    const value: OrganizerValue = { kind: content.organizer, ...clean, complete: c.complete, missing: c.missing, savedAt: now.toISOString() };
    await repo.updateMany("LessonRun", { id: run.id }, { organizer: value, updatedAt: now });
    return { ...c, view: await buildView(repo, { ...run, organizer: value }) };
  });
}

// ------------------------------------------------------------------ hints (GUIDED only)

/** The next hint (1 → 3) for the guided question on screen; each one lowers the answer's credit. */
export function lessonHint(repo: Repo, actor: Actor, runId: string, questionId: string, now = new Date()): Promise<{ hint: HintStep; view: LessonView }> {
  return withLock(`lesson:${runId}`, async () => {
    const run = await ownRun(repo, actor, runId);
    const st = phaseState(run);
    if (st.phase !== "GUIDED") throw new ValidationError("Hints are part of guided practice only. Try it on your own now!");
    if (st.currentId !== questionId) throw new ValidationError("This question is no longer open.");
    if (st.hintLevel >= 3) throw new ValidationError("You have seen every hint for this question.");
    const item = (await loadQuestionItems(repo, [questionId]))[0];
    if (!item) throw new ValidationError("This question is no longer available.");
    const skill = (await repo.findUnique("Skill", { id: run.skillId }))!;
    const level = st.hintLevel + 1;
    const hint = await itemHintStep(repo, item, s(skill.code), level);
    const log = [...st.log, { t: "HINT", phase: "GUIDED", questionId, level, at: now.toISOString() } as LogEntry];
    await saveRun(repo, run, { log, updatedAt: now });
    return { hint, view: await buildView(repo, { ...run, log }) };
  });
}

// ------------------------------------------------------------------ answers

export interface LessonAnswer { feedback: Feedback; lessonCredit: number; view: LessonView }

/** One answer in GUIDED / INDEPENDENT / CHECK: scored, saved, mastery updated; the phase moves on when its set is done. */
export function answerLesson(repo: Repo, actor: Actor, input: { runId: string; questionId: string; response: unknown }, now = new Date()): Promise<LessonAnswer> {
  return withLock(`lesson:${input.runId}`, async () => {
    const run = await ownRun(repo, actor, input.runId);
    const st = phaseState(run);
    if (st.phase === "MODEL" || st.phase === "DONE" || !st.set) throw new ValidationError("There is no question open in this lesson.");
    if (st.currentId !== input.questionId) throw new ValidationError("This question was already answered. Here is your next one.");
    // the lesson content, the question and the run's practice session together (Update 42B)
    const known = logOf(run).find((x): x is Extract<LogEntry, { t: "SESSION" }> => x.t === "SESSION");
    const [{ content }, items, sesRow] = await Promise.all([
      skillAndContent(repo, s(run.skillId)), loadQuestionItems(repo, [input.questionId]),
      known ? repo.findUnique("PracticeSession", { id: known.sessionId }) : Promise.resolve(null),
    ]);
    const approach = Number(run.approach);
    if (approach === 1 && content.organizer !== "NONE" && !organizerOf(run)?.complete) throw new ValidationError("Finish the organizer first: it is the first step of this new way to learn the skill.");
    const item = items[0];
    if (!item) throw new ValidationError("This question is no longer available.");
    const response = normalizeResponse(item, input.response);
    const phase = st.phase as ItemPhase;
    const hints = phase === "GUIDED" ? st.hintLevel : 0;
    const credit = scoreResponse(item, response);
    const lessonCredit = creditAfterHints(credit, hints);
    const responseMs = Math.max(0, Math.min(30 * 60_000, now.getTime() - (st.servedAt ?? now).getTime()));

    let updated: Row = run;
    // Update 42B: the engine's reads happen first, in parallel and outside the transaction (the run is locked for this
    // student, and saveRun below is guarded); the transaction only writes. The decision log and the notes to the
    // student / teachers are written after the response.
    const attemptIn = { studentId: s(run.studentId), skillId: s(run.skillId), schoolId: s(run.schoolId) || null, item, response, credit, usedHint: hints > 0, responseMs, now };
    const prep = await prepareAttempt(repo, attemptIn, sesRow ? s(sesRow.id) : null);
    const after: (() => Promise<unknown>)[] = [];
    const out = await repo.transaction(async (tx) => {
      const ses = sesRow ? { id: s(sesRow.id), created: null as LogEntry | null } : await sessionOf(tx, run, now);
      const w = await writeAttempt(tx, prep, ses.id);
      const rec = w.result;
      after.push(() => repo.create("AdaptiveDecisionLog", w.decisionLog));
      await tx.updateMany("PracticeSession", { id: ses.id }, { questionCount: Number(sesRow?.questionCount ?? 0) + 1, correctCount: Number(sesRow?.correctCount ?? 0) + (rec.correct ? 1 : 0), activeMs: Number(sesRow?.activeMs ?? 0) + responseMs });
      const log: LogEntry[] = [...st.log, ...(ses.created ? [ses.created] : [])];
      log.push({ t: "ANS", phase, questionId: item.questionId, correct: rec.correct, credit: lessonCredit, hints, approach, at: now.toISOString() });
      const answers = [...st.answers, { correct: rec.correct }];
      const patch: Row = { updatedAt: now };
      let teacherAlert = false;
      if (answers.length >= st.set!.ids.length) {
        const right = answers.filter((a) => a.correct).length;
        const total = st.set!.ids.length;
        const passed = right >= passNeed(phase, total);
        log.push({ t: "RESULT", phase, correct: right, total, passed, approach, at: now.toISOString() });
        if (phase === "CHECK") { patch.attempts = Number(run.attempts) + 1; patch.checkPct = Math.round((100 * right) / total); }
        if (passed) {
          if (phase === "CHECK") Object.assign(patch, { phase: "DONE", passed: true, finishedAt: now });
          else { const next: ItemPhase = phase === "GUIDED" ? "INDEPENDENT" : "CHECK"; patch.phase = next; log.push(await newSet(tx, { ...run, log }, next, approach, now)); }
        } else if (approach < MAX_APPROACH) {
          // re-teach with a DIFFERENT approach, one phase back
          const back = previousPhase(phase);
          patch.phase = back; patch.approach = approach + 1;
          log.push(await newSet(tx, { ...run, log }, back, approach + 1, now));
        } else {
          Object.assign(patch, { phase: "DONE", passed: false, finishedAt: now });
          teacherAlert = true;
        }
        if (patch.phase === "DONE") await tx.updateMany("PracticeSession", { id: ses.id, endedAt: null }, { endedAt: now });
      }
      patch.log = log;
      await saveRun(tx, run, patch);
      updated = { ...run, ...patch };
      if (patch.phase === "DONE" && patch.passed === true) {
        // the teacher sees the win in class progress; the student gets a note
        after.push(async () => {
          const stRow = await repo.findUnique("Student", { id: run.studentId });
          if (stRow) await repo.create("Notification", { userId: stRow.userId, type: "SKILL_MASTERED", title: `🎉 Lesson passed: ${s((await repo.findUnique("Skill", { id: run.skillId }))?.name)}`, body: `Quick check: ${patch.checkPct}%. Keep practising to stay strong.`, link: `/student/lesson`, readAt: null, createdAt: now });
        });
      }
      if (teacherAlert) {
        after.push(async () => {
          const [users, name, skill] = await Promise.all([teacherUserIds(repo, s(run.studentId)), studentName(repo, s(run.studentId)), repo.findUnique("Skill", { id: run.skillId })]);
          for (const userId of users) await repo.create("Notification", { userId, type: "INTERVENTION_ALERT", title: `🧩 ${name} needs a small-group re-teach`, body: `The lesson on “${s(skill?.name)}” was tried with every approach (last quick check ${patch.checkPct ?? "—"}%). A short small-group lesson with you is the next step.`, link: `/teacher/lessons/${s(run.id)}`, readAt: null, createdAt: now });
        });
      }
      return rec;
    });
    for (const f of after) runAfterResponse("lesson.after_answer", f);

    const view = await buildView(repo, updated);
    const feedback: Feedback = {
      correct: out.correct, credit, yourAnswer: studentAnswerText(item, response), correctAnswer: correctAnswerText(item), whyCorrect: item.explanation.whyCorrect,
      whyYoursIsWrong: out.correct ? null : whyChosenWrong(item, response), tip: item.explanation.tip, rapidGuess: out.rapidGuess,
      masteryBefore: Math.round(out.masteryBefore), masteryAfter: Math.round(out.masteryAfter), band: out.band, xp: 0,
      next: { hasQuestion: Boolean(view.question) || view.phase !== "DONE", endReason: view.phase === "DONE" ? "COMPLETED" : null, routeToSkillId: null, routeToSkillName: null },
      tutor: out.correct ? null : tutorFeedback({ misconception: attemptMisconception(item, response), band: bandOfTheta(out.theta), repeated: 0, rationale: whyChosenWrong(item, response), tip: item.explanation.tip || null, hint: item.hint, hasPassage: Boolean(item.passageText), correctTexts: answerTexts(item) }),
    };
    return { feedback, lessonCredit, view };
  });
}

// ------------------------------------------------------------------ the student's list

export interface LessonListItem { skillId: string; skillName: string; runId: string | null; phase: Phase | null; source: string | null; checkPct: number | null; passed: boolean | null; why: string }

/** “Lessons for you”: open runs, then suggested skills (weak mastery, the tier focus skill), then finished ones. */
export async function lessonsForStudent(repo: Repo, actor: Actor): Promise<{ open: LessonListItem[]; suggested: LessonListItem[]; done: LessonListItem[] }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can take lessons.");
  const studentId = actor.studentId;
  const student = (await repo.findUnique("Student", { id: studentId }))!;
  const curs = await repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true });
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "code", "familyId", "isActive", "sequence"] }) : [];
  const fams = await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "code"] });
  const famCode = new Map(fams.map((f) => [s(f.id), s(f.code)]));
  const withLesson = skills.filter((k) => k.isActive !== false && lessonForSkill({ familyCode: famCode.get(s(k.familyId)), code: s(k.code), name: s(k.name) }));
  const name = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  const runs = await repo.findMany("LessonRun", { studentId }, { orderBy: [{ field: "updatedAt", dir: "desc" }] });
  const SOURCE: Record<string, string> = { TEACHER: "From your teacher", TIER: "Chosen for you", ASSIGNMENT: "From your teacher", STUDENT: "You started it" };
  const item = (r: Row): LessonListItem => ({ skillId: s(r.skillId), skillName: name.get(s(r.skillId)) ?? "Skill", runId: s(r.id), phase: s(r.phase) as Phase, source: s(r.source), checkPct: r.checkPct === null || r.checkPct === undefined ? null : Number(r.checkPct), passed: r.passed === null || r.passed === undefined ? null : Boolean(r.passed), why: SOURCE[s(r.source)] ?? "" });
  const open = runs.filter((r) => s(r.phase) !== "DONE").map(item);
  const seenDone = new Set<string>();
  const done = runs.filter((r) => s(r.phase) === "DONE" && !seenDone.has(s(r.skillId)) && seenDone.add(s(r.skillId))).slice(0, 10).map(item);
  const busy = new Set(open.map((o) => o.skillId));
  const [mastery, tier] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId, skillId: { in: withLesson.map((k) => s(k.id)) } }, { select: ["skillId", "score", "attempts"] }),
    repo.findUnique("StudentTier", { studentId }),
  ]);
  const suggested: LessonListItem[] = [];
  const focus = tier && Number(tier.tier) >= 2 && tier.focusSkillId ? s(tier.focusSkillId) : null;
  if (focus && !busy.has(focus) && withLesson.some((k) => s(k.id) === focus)) suggested.push({ skillId: focus, skillName: name.get(focus) ?? "Skill", runId: null, phase: null, source: null, checkPct: null, passed: null, why: "Your focus skill" });
  for (const m of mastery.filter((x) => Number(x.attempts) >= 3 && Number(x.score) < 60).sort((a, b) => Number(a.score) - Number(b.score))) {
    const id = s(m.skillId);
    if (busy.has(id) || suggested.some((x) => x.skillId === id) || done.some((x) => x.skillId === id && x.passed)) continue;
    suggested.push({ skillId: id, skillName: name.get(id) ?? "Skill", runId: null, phase: null, source: null, checkPct: null, passed: null, why: `Practice shows this skill is still growing (${Math.round(Number(m.score))}%)` });
    if (suggested.length >= 4) break;
  }
  return { open, suggested, done };
}
