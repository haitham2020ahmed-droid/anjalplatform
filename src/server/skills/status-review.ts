/**
 * 🔄 Keeping stars (owner r67 §4 and §9 point 3): retention checks given in My Work automatically, never counted in the
 * 30 rule (status.ts countedAnswers leaves their sessions out).
 *
 *   REVIEW  3 weeks after ⭐: 5 quick questions on the skill. 4 of 5 or more → stays ⭐ (the next, optional review about
 *           8 weeks later). Fewer → 🔄 Needs review: the skill returns to the student's plan; mastering it again → ⭐.
 *           Mostly rapid guesses (2 of 5 or more) → it does not count and is offered again.
 *   MIXED   once a month: 10 questions from several of the student's ⭐ skills. A skill missing its questions in the
 *           mixed check twice → 🔄. Mostly rapid guesses → not counted.
 * Each check is a real question set (Assessment + Assignment for the student, from the class's teacher) so it opens in
 * the usual player and shows in My Work like any set; SkillReviewCheck links it to the star. Settled once, when the
 * set's session has ended.
 */
import type { Repo, Row } from "../seeding/repo";
import { currentRows, historyOf, ms, REVIEW_AGAIN_DAYS, REVIEW_GUESS_LIMIT, REVIEW_PASS, REVIEW_QUESTIONS, MIXED_QUESTIONS, MIXED_FAILS_FOR_REVIEW, skillKeyIndex, studentSchool, type SkillKeyIndex } from "./status";
import { remember } from "../cache/lru";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const DAY = 86_400_000;

export type ReviewOutcome = "PASS" | "FAIL" | "GUESSING";
export interface ReviewAnswer { correct: boolean; rapidGuess: boolean; key?: string }

/** A review check's result (pure): guessing first (it does not count), then 4 of 5 right. */
export function evaluateReview(answers: readonly ReviewAnswer[]): { outcome: ReviewOutcome; right: number; answered: number; guesses: number } {
  const guesses = answers.filter((a) => a.rapidGuess).length;
  const right = answers.filter((a) => a.correct && !a.rapidGuess).length;
  if (guesses >= REVIEW_GUESS_LIMIT) return { outcome: "GUESSING", right, answered: answers.length, guesses };
  return { outcome: right >= REVIEW_PASS ? "PASS" : "FAIL", right, answered: answers.length, guesses };
}

/** The monthly mixed check (pure): mostly guesses → not counted; per skill, under half right = failed this time. */
export function evaluateMixed(answers: readonly ReviewAnswer[]): { outcome: "COUNTED" | "GUESSING"; failed: string[]; perKey: Record<string, { right: number; answered: number }> } {
  const guesses = answers.filter((a) => a.rapidGuess).length;
  const perKey: Record<string, { right: number; answered: number }> = {};
  for (const a of answers) { if (!a.key) continue; const p = perKey[a.key] ?? { right: 0, answered: 0 }; p.answered++; if (a.correct && !a.rapidGuess) p.right++; perKey[a.key] = p; }
  if (guesses * 10 >= answers.length * 4 && answers.length > 0) return { outcome: "GUESSING", failed: [], perKey };
  return { outcome: "COUNTED", failed: Object.entries(perKey).filter(([, p]) => p.right * 2 < p.answered).map(([k]) => k), perKey };
}

/** The month of a date (yyyy-mm, Riyadh time). */
export const monthOf = (d: Date): string => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 7);

// ------------------------------------------------------------------ making a check

/** Auto-scored, published questions of these skills, the ones the student has not answered first. */
async function pickQuestions(repo: Repo, studentId: string, skillIds: readonly string[], n: number): Promise<{ id: string; skillId: string }[]> {
  if (!skillIds.length || n <= 0) return [];
  const qs = await repo.findMany("Question", { skillId: { in: [...skillIds] }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "typeId"], take: 600 });
  if (!qs.length) return [];
  const types = await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] });
  const okType = new Set(types.filter((t) => s(t.code) !== "SHORT_ANSWER" && t.isAutoScored !== false && t.isAutoScored !== 0).map((t) => s(t.id)));
  const usable = qs.filter((q) => okType.has(s(q.typeId)));
  const seen = new Set((await repo.findMany("QuestionAttempt", { studentId, questionId: { in: usable.map((q) => s(q.id)) } }, { select: ["questionId"] })).map((a) => s(a.questionId)));
  // a stable spread: unseen first, then a fixed shuffle by id (no randomness: the same data gives the same check)
  const h = (x: string) => { let v = 0; for (const c of x) v = (v * 31 + c.charCodeAt(0)) >>> 0; return v; };
  return usable.sort((a, b) => Number(seen.has(s(a.id))) - Number(seen.has(s(b.id))) || h(s(a.id) + studentId) - h(s(b.id) + studentId)).slice(0, n).map((q) => ({ id: s(q.id), skillId: s(q.skillId) }));
}

/** The student's class and its teacher (who "gives" the check). Null when the class has no teacher. */
async function classAndTeacher(repo: Repo, studentId: string): Promise<{ classId: string; teacherId: string } | null> {
  const ms2 = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  for (const m of ms2) {
    const ct = (await repo.findMany("ClassTeacher", { classId: m.classId }, { select: ["teacherId"] }))[0];
    if (ct) return { classId: s(m.classId), teacherId: s(ct.teacherId) };
  }
  return null;
}

async function createCheck(repo: Repo, studentId: string, kind: "REVIEW" | "MIXED", keys: string[], periodKey: string, title: string, questions: { id: string }[], now: Date): Promise<string | null> {
  if (!questions.length) return null;
  const ct = await classAndTeacher(repo, studentId);
  if (!ct) return null;
  // the check row first (its unique key stops a second page load making a second set)
  let check: Row;
  try { check = await repo.create("SkillReviewCheck", { studentId, kind, skillKeys: keys, periodKey: periodKey.slice(0, 120), createdAt: now }); } catch { return null; }
  const id = await repo.transaction(async (tx) => {
    const set = await tx.create("Assessment", { title: title.slice(0, 191), type: "TEACHER_QUIZ", isAdaptive: false, maxQuestions: questions.length, status: "PUBLISHED", createdById: null, createdAt: now });
    await tx.createMany("AssessmentQuestion", questions.map((q, order) => ({ assessmentId: set.id, questionId: q.id, order, points: 1 })));
    const a = await tx.create("Assignment", { track: "CURRICULUM", classId: ct.classId, createdById: ct.teacherId, title: title.slice(0, 191), target: "ASSESSMENT", assessmentId: set.id, dueAt: new Date(now.getTime() + 7 * DAY), createdAt: now, source: "CURRICULUM" });
    await tx.create("AssignmentStudent", { assignmentId: a.id, studentId, status: "NOT_STARTED", progress: 0 });
    return s(a.id);
  });
  await repo.updateMany("SkillReviewCheck", { id: check.id }, { assignmentId: id });
  return id;
}

/**
 * Gives the checks that are due (idempotent): a REVIEW for each ⭐ whose review date has come, and this month's MIXED
 * check (2+ stars). Returns how many sets were made.
 */
export async function ensureReviewChecks(repo: Repo, studentId: string, now = new Date(), opts: { index?: SkillKeyIndex } = {}): Promise<number> {
  const rows = await repo.findMany("SkillStatus", { studentId }, { select: ["id", "skillKey", "level", "status", "reviewDueAt", "history"] });
  const cur = [...currentRows(rows).values()];
  const stars = cur.filter((r) => s(r.status) === "MASTERED");
  if (!stars.length) return 0;
  const open = await repo.findMany("SkillReviewCheck", { studentId, settledAt: null }, { select: ["kind", "skillKeys"] });
  const openKeys = new Set(open.filter((c) => s(c.kind) === "REVIEW").flatMap((c) => (Array.isArray(c.skillKeys) ? c.skillKeys : []).map(String)));
  const schoolId = await studentSchool(repo, studentId);
  const ix = opts.index ?? (await skillKeyIndex(repo, schoolId));
  let made = 0;
  for (const r of stars) {
    const due = ms(r.reviewDueAt);
    if (!due || due > now.getTime() || openKeys.has(s(r.skillKey))) continue;
    const key = s(r.skillKey);
    const tries = historyOf(r.history).filter((h) => s(h.review) === "GUESSING").length;
    const qs = await pickQuestions(repo, studentId, ix.skillsOf.get(key) ?? [], REVIEW_QUESTIONS);
    if (qs.length < REVIEW_QUESTIONS) continue; // too few questions for a fair check: the star stays
    if (await createCheck(repo, studentId, "REVIEW", [key], `${key}|${new Date(due).toISOString().slice(0, 10)}|${tries}`, `Review check: ${ix.nameOf.get(key) ?? "skill"}`, qs, now)) made++;
  }
  // the monthly mixed review: several ⭐ skills, 2 questions each (10 in all)
  const month = monthOf(now);
  if (stars.length >= 2 && !(await repo.findMany("SkillReviewCheck", { studentId, kind: "MIXED", periodKey: month }, { select: ["id"] })).length) {
    const keys = stars.map((r) => s(r.skillKey)).sort((a, b) => { const h = (x: string) => { let v = 0; for (const c of x + month) v = (v * 31 + c.charCodeAt(0)) >>> 0; return v; }; return h(a) - h(b); }).slice(0, 5);
    const qs: { id: string; skillId: string }[] = [];
    const per = Math.ceil(MIXED_QUESTIONS / keys.length);
    for (const k of keys) qs.push(...(await pickQuestions(repo, studentId, ix.skillsOf.get(k) ?? [], per)));
    if (qs.length >= Math.min(MIXED_QUESTIONS, 4)) { if (await createCheck(repo, studentId, "MIXED", keys, month, "Monthly mixed review", qs.slice(0, MIXED_QUESTIONS), now)) made++; }
  }
  return made;
}

/**
 * Settles the checks the student has finished (the set's session ended): the star is kept, becomes 🔄, or the check
 * is offered again (guessing). Returns the outcomes.
 */
export async function settleReviewChecks(repo: Repo, studentId: string, now = new Date(), opts: { index?: SkillKeyIndex } = {}): Promise<{ checkId: string; kind: string; outcome: string }[]> {
  const open = (await repo.findMany("SkillReviewCheck", { studentId, settledAt: null })).filter((c) => c.assignmentId);
  if (!open.length) return [];
  const sessions = await repo.findMany("PracticeSession", { studentId, assignmentId: { in: open.map((c) => s(c.assignmentId)) } }, { select: ["id", "assignmentId", "endedAt"] });
  const ended = sessions.filter((x) => x.endedAt);
  if (!ended.length) return [];
  const attempts = await repo.findMany("QuestionAttempt", { sessionId: { in: ended.map((x) => s(x.id)) } }, { select: ["sessionId", "skillId", "isCorrect", "rapidGuess"] });
  const schoolId = await studentSchool(repo, studentId);
  const ix = opts.index ?? (await skillKeyIndex(repo, schoolId));
  const rows = await repo.findMany("SkillStatus", { studentId });
  const cur = currentRows(rows);
  const out: { checkId: string; kind: string; outcome: string }[] = [];
  for (const c of open) {
    const ses = ended.find((x) => s(x.assignmentId) === s(c.assignmentId));
    if (!ses) continue;
    const answers: ReviewAnswer[] = attempts.filter((a) => s(a.sessionId) === s(ses.id)).map((a) => ({ correct: Boolean(a.isCorrect), rapidGuess: Boolean(a.rapidGuess), key: ix.keyOf.get(s(a.skillId)) }));
    const keys = (Array.isArray(c.skillKeys) ? c.skillKeys : []).map(String);
    let outcome: string;
    if (s(c.kind) === "REVIEW") {
      const r = evaluateReview(answers);
      outcome = r.outcome;
      const row = cur.get(keys[0]);
      if (row) {
        const h = [...historyOf(row.history), { at: now.toISOString(), review: r.outcome, right: r.right, of: r.answered, ...(r.outcome === "FAIL" ? { status: "NEEDS_REVIEW" } : {}) }].slice(-40);
        const data: Row = r.outcome === "PASS" ? { reviewDueAt: new Date(now.getTime() + REVIEW_AGAIN_DAYS * DAY), history: h, updatedAt: now }
          : r.outcome === "FAIL" ? { status: "NEEDS_REVIEW", reviewDueAt: null, history: h, updatedAt: now }
          : { reviewDueAt: now, history: h, updatedAt: now }; // guessing: offered again
        if (s(row.status) === "MASTERED") await repo.updateMany("SkillStatus", { id: row.id }, data);
      }
      await repo.updateMany("SkillReviewCheck", { id: c.id }, { settledAt: now, result: { ...r } });
    } else {
      const r = evaluateMixed(answers);
      outcome = r.outcome;
      if (r.outcome === "COUNTED") for (const k of r.failed) {
        const row = cur.get(k);
        if (!row || s(row.status) !== "MASTERED") continue;
        const fails = historyOf(row.history).filter((x) => x.mixedFail).length + 1;
        const h = [...historyOf(row.history), { at: now.toISOString(), mixedFail: true, ...(fails >= MIXED_FAILS_FOR_REVIEW ? { status: "NEEDS_REVIEW" } : {}) }].slice(-40);
        await repo.updateMany("SkillStatus", { id: row.id }, fails >= MIXED_FAILS_FOR_REVIEW ? { status: "NEEDS_REVIEW", reviewDueAt: null, history: h, updatedAt: now } : { history: h, updatedAt: now });
      }
      await repo.updateMany("SkillReviewCheck", { id: c.id }, { settledAt: now, result: { outcome: r.outcome, failed: r.failed, perKey: r.perKey } });
      // a mixed check that did not count (guessing) is offered again next time: its month key is freed
      if (r.outcome === "GUESSING") await repo.updateMany("SkillReviewCheck", { id: c.id }, { periodKey: `${s(c.periodKey)}|g${now.getTime()}`.slice(0, 120) });
    }
    out.push({ checkId: s(c.id), kind: s(c.kind), outcome });
  }
  return out;
}

const lastRun = new Map<string, number>();
export const REVIEW_EVERY_MS = 10 * 60_000;
/**
 * My Work / My Plan: settle finished checks and give due ones — at most once per student every 10 minutes in this
 * process (pages load often). Never throws (a missing table gives nothing).
 */
export async function keepStarsFresh(repo: Repo, studentId: string, now = new Date(), opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force) {
    const at = lastRun.get(studentId);
    if (at !== undefined && Date.now() - at < REVIEW_EVERY_MS && Date.now() >= at) return;
    remember(lastRun, studentId, Date.now(), 50_000);
  }
  try {
    await settleReviewChecks(repo, studentId, now);
    await ensureReviewChecks(repo, studentId, now);
  } catch { /* the next visit tries again */ }
}
/** Forget the throttle (tests). */
export const resetStarsFresh = (): void => lastRun.clear();
