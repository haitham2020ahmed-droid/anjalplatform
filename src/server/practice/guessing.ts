/**
 * 🎲 Guessing, effort and new texts (owner-approved r67, items 1, 2 and 6) — small helpers shared by practice, question
 * sets, MAP practice, Curriculum Map practice and the reports.
 *
 * 1. A RAPID GUESS is an answer given faster than anyone can read the question:
 *      · any question answered in under 3 seconds;
 *      · the FIRST question on a passage answered in under a third of the passage's expected reading time (by its
 *        word count, timed from when the passage opened = when that first question was served);
 *      · once a question has ≥ 20 careful (non-guess) answers, its own threshold is 10 % of their average time,
 *        capped at 10 seconds (it replaces the two rules above).
 *    A rapid guess counts for NOTHING: not the 30/50 counters, not mastery or ability (weight 0), not accuracy, no
 *    coins. It is only logged (QuestionAttempt.rapidGuess).
 * 2. GRADUATED RESPONSE in a session: 1 guess → logged only · 3 of the last 5 answers → a gentle "take your time"
 *    message and the next question's answer buttons enable after 3 s · 5 of the last 10 → the session pauses calmly
 *    (progress saved, one teacher alert, never a failed attempt).
 * 3. EFFORT of a session = careful answers / all answers. More than 20 % guesses → the session is "Unreliable"
 *    (teacher-only): its answers never change the student's level, tier or intervention plan.
 * 4. NEW TEXTS: a passage the student has never answered a question on (isUnseenPassage) — the final mastery stretch
 *    of a passage-based skill prefers them, and the star needs a correct answer on one (session.ts).
 */
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");

/** under this many milliseconds any answer is a rapid guess */
export const RAPID_GUESS_MS = 3000;
/** silent reading rate used for a passage's expected reading time (words per minute; Grades 4–6) */
export const READING_WPM = 150;
/** the first question on a passage answered faster than this share of the reading time is a guess */
export const PASSAGE_SHARE = 1 / 3;
/** a question's own threshold is used once it has this many careful answers */
export const ITEM_STATS_MIN = 20;
/** …and is this share of their average time… */
export const ITEM_SHARE = 0.1;
/** …capped at this many milliseconds */
export const ITEM_CAP_MS = 10_000;
/** guessing over this share of a session's answers makes the session Unreliable */
export const UNRELIABLE_SHARE = 0.2;
/** after "take your time" the next question's answer buttons enable after this many milliseconds */
export const SLOW_DOWN_MS = 3000;

/** Words in a passage (tags and markup ignored). */
export function passageWords(text: string | null | undefined): number {
  const t = s(text).replace(/<[^>]*>/g, " ").replace(/[#*_>`|[\]()]/g, " ").trim();
  return t ? t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

/** The expected reading time of a passage, in milliseconds. */
export const expectedReadingMs = (words: number): number => Math.round((Math.max(0, words) / READING_WPM) * 60_000);

export interface ItemTimeStats { answers: number; avgMs: number }
export interface GuessInput {
  /** the passage of the question (its text), when it has one */
  passageText?: string | null;
  /** true when this is the first question of the passage the student meets in this sitting (timed from the passage opening) */
  firstOnPassage?: boolean;
  /** the question's careful answers so far (count and average time) */
  itemStats?: ItemTimeStats | null;
}

/** The rapid-guess threshold for one answer, in milliseconds (pure). */
export function rapidGuessThresholdMs(input: GuessInput = {}): number {
  const st = input.itemStats;
  if (st && st.answers >= ITEM_STATS_MIN && st.avgMs > 0) return Math.min(ITEM_CAP_MS, Math.round(ITEM_SHARE * st.avgMs));
  if (input.firstOnPassage && input.passageText) return Math.max(RAPID_GUESS_MS, Math.round(PASSAGE_SHARE * expectedReadingMs(passageWords(input.passageText))));
  return RAPID_GUESS_MS;
}

/** Whether an answer given after `responseMs` is a rapid guess (pure). */
export function isRapidGuess(responseMs: number, input: GuessInput = {}): boolean {
  return Number(responseMs) < rapidGuessThresholdMs(input);
}

/** An answer that counts toward the 30/50 counters, accuracy, mastery and coins: never a rapid guess. */
export const countsTowardWork = (answer: { rapidGuess?: unknown } | null | undefined): boolean => Boolean(answer) && !answer!.rapidGuess;

export type GuessAction = "NONE" | "LOGGED" | "SLOW_DOWN" | "PAUSE";
/**
 * What the platform does after an answer, from the session's answers (oldest first, the new one last; true = a
 * rapid guess): 5 of the last 10 → PAUSE · 3 of the last 5 → SLOW_DOWN · this one a guess → LOGGED · else NONE.
 */
export function guessResponse(flags: readonly boolean[]): GuessAction {
  const last = (n: number) => flags.slice(-n).filter(Boolean).length;
  if (last(10) >= 5) return "PAUSE";
  if (last(5) >= 3) return "SLOW_DOWN";
  return flags.length && flags[flags.length - 1] ? "LOGGED" : "NONE";
}

export interface SessionEffort { answers: number; guesses: number; /** % careful answers, null before any answer */ effort: number | null; unreliable: boolean }
/** A session's effort from its answers (each with its rapidGuess flag). */
export function sessionEffort(answers: readonly Record<string, unknown>[]): SessionEffort {
  return effortFromCounts(answers.length, answers.filter((a) => a.rapidGuess).length);
}
/** A session's effort from its counts (PracticeSession.questionCount / guessCount). */
export function effortFromCounts(answers: number, guesses: number): SessionEffort {
  const n = Math.max(0, Number(answers) || 0), g = Math.min(n, Math.max(0, Number(guesses) || 0));
  return { answers: n, guesses: g, effort: n ? Math.round((100 * (n - g)) / n) : null, unreliable: n > 0 && g / n > UNRELIABLE_SHARE };
}

/**
 * ⏸ The guessing pause: one alert to the student's teachers (their classes' teachers), calm and actionable. Never
 * shown to the student as a failure.
 */
export async function notifyGuessPause(repo: Repo, studentId: string, where: string, now = new Date(), key = `pause|${now.toISOString()}`): Promise<number> {
  const [student, member] = await Promise.all([
    repo.findUnique("Student", { id: studentId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  if (!student || !member.length) return 0;
  // the alert in the teacher's Alerts list (with follow-up: what was done, handled) — once per pause
  try {
    await repo.create("StudentAlert", { schoolId: s(student.schoolId), classId: s(member[0].classId) || null, studentId, kind: "RAPID_GUESS", key: key.slice(0, 120), detail: `Practice paused in “${where}”: 5 of the last 10 answers were too fast to be read. Those answers did not count. Talk with the student.`.slice(0, 500), status: "OPEN", createdAt: now });
  } catch { /* the same pause recorded twice (a retry): one alert */ return 0; }
  const teachers = await repo.findMany("ClassTeacher", { classId: { in: [...new Set(member.map((m) => s(m.classId)))] } }, { select: ["teacherId"] });
  const users = teachers.length ? await repo.findMany("Teacher", { id: { in: [...new Set(teachers.map((t) => s(t.teacherId)))] } }, { select: ["userId"] }) : [];
  if (!users.length) return 0;
  const me = await repo.findUnique("User", { id: student.userId });
  const name = s(me?.displayName) || "A student";
  return repo.createMany("Notification", [...new Set(users.map((u) => s(u.userId)))].map((userId) => ({
    userId, type: "INTERVENTION_ALERT", title: `⏸ ${name} was answering too fast`,
    body: `${name} answered 5 of the last 10 questions in “${where}” in a few seconds, so the practice paused for a break. Those answers did not count. A short check-in may help.`,
    link: "/teacher/alerts", readAt: null, createdAt: now,
  })));
}

/** A student's effort over their practice sessions of the last `days` days (one read; teacher reports). */
export async function studentEffort(repo: Repo, studentId: string, days = 30, now = new Date()): Promise<SessionEffort & { sessions: number; unreliableSessions: number }> {
  const rows = await repo.findMany("PracticeSession", { studentId, startedAt: { gte: new Date(now.getTime() - days * 86_400_000) } }, { select: ["questionCount", "guessCount", "unreliable"], take: 2000 });
  const answers = rows.reduce((n, r) => n + (Number(r.questionCount) || 0), 0), guesses = rows.reduce((n, r) => n + (Number(r.guessCount) || 0), 0);
  return { ...effortFromCounts(answers, guesses), sessions: rows.filter((r) => Number(r.questionCount) > 0).length, unreliableSessions: rows.filter((r) => r.unreliable).length };
}

// ------------------------------------------------------------------ item time statistics (cached per process)

const STATS_TTL_MS = 10 * 60_000;
const statsCache = new Map<string, { at: number; v: ItemTimeStats }>();
/** A question's careful answers (count, average time; at most its last 200), kept 10 minutes in memory. */
export async function itemTimeStats(repo: Repo, questionId: string, now = Date.now()): Promise<ItemTimeStats> {
  const hit = statsCache.get(questionId);
  if (hit && now - hit.at < STATS_TTL_MS && now >= hit.at) return hit.v;
  const rows = await repo.findMany("QuestionAttempt", { questionId, rapidGuess: false }, { select: ["responseMs"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 200 });
  const ms = rows.map((r) => Number(r.responseMs) || 0).filter((x) => x > 0 && x <= 30 * 60_000);
  const v = { answers: ms.length, avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0 };
  if (statsCache.size > 20_000) statsCache.clear();
  statsCache.set(questionId, { at: now, v });
  return v;
}
/** Forgets the kept statistics (tests). */
export const resetItemTimeStats = (): void => statsCache.clear();

// ------------------------------------------------------------------ new texts

/**
 * Whether the student has never answered a question on this passage (before `before`, when given). A question
 * without a passage is never a "new text": false.
 */
export async function isUnseenPassage(repo: Repo, studentId: string, passageId: string | null | undefined, opts: { before?: Date } = {}): Promise<boolean> {
  if (!passageId || !studentId) return false;
  const qs = await repo.findMany("Question", { passageId: s(passageId) }, { select: ["id"] });
  if (!qs.length) return true;
  const n = await repo.count("QuestionAttempt", { studentId: s(studentId), questionId: { in: qs.map((q) => s(q.id)) }, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) });
  return n === 0;
}

/**
 * The passages a student has answered questions on, among these questions (pure helper over an answered set):
 * `passageOf` maps a question id to its passage id.
 */
export function seenPassages(answered: Iterable<string>, passageOf: (questionId: string) => string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const id of answered) { const p = passageOf(id); if (p) out.add(p); }
  return out;
}

/**
 * ⭐ The star rule for a passage-based skill (pure): when an answer would turn the star, it needs a correct answer on
 * a NEW text in the final stretch — OK (it has one, or the skill is not passage-based / no star is turning), HOLD
 * (none yet and new texts remain: the star waits for one), SEEN_TEXTS (none and no new text is left: the star is
 * earned, marked "mastered on seen texts" for the teacher).
 */
export type StarRule = "OK" | "HOLD" | "SEEN_TEXTS";
export function newTextStar(input: { passageSkill: boolean; turningStar: boolean; newTextCorrect: boolean; unseenLeft: number }): StarRule {
  if (!input.passageSkill || !input.turningStar || input.newTextCorrect) return "OK";
  return input.unseenLeft > 0 ? "HOLD" : "SEEN_TEXTS";
}

/** A correct (careful) answer on a passage met for the first time, among these answers (oldest first). */
export function correctOnNewText(history: readonly { itemId: string; correct: boolean; rapid?: boolean }[], passageOf: (id: string) => string | null | undefined): boolean {
  const seen = new Set<string>();
  let found = false;
  for (const h of history) {
    const p = passageOf(h.itemId);
    if (!p) continue;
    if (!seen.has(p) && h.correct && !h.rapid) found = true;
    seen.add(p);
  }
  return found;
}

/** A skill is passage-based when at least half of its questions come with a passage. */
export const isPassageSkill = (items: readonly { passage?: string | null }[]): boolean => items.length > 0 && items.filter((i) => i.passage).length * 2 >= items.length;
