/**
 * 🎲 Guessing, effort and new texts (owner-approved r67, items 1, 2 and 6; redesigned Nov 2026 — "ليه السرعة تمنع
 * الدرجة من غير ما يكون فيه تخمين فعلاً؟") — small helpers shared by practice, question sets, MAP practice,
 * Curriculum Map practice, NAFS, lessons and the reports.
 *
 * Nov 2026 REDESIGN (everywhere EXCEPT MAP Test, which keeps its own original rule unchanged — map/sim.ts calls
 * isRapidGuess directly and is not touched by this file's change): speed itself is no longer a reason to withhold
 * credit. The old design zero-weighted ANY answer (right or wrong) faster than an estimated reading time — built on
 * a flat 150-words-a-minute assumption with no upper cap, which reliably flagged a fast, able reader's genuinely
 * correct answers as "guesses" on every new passage, while a slower, deliberated WRONG answer counted in full. That
 * is backwards: a true guess reveals itself by being wrong, not by being fast.
 *
 *   · "fast" (isRapidGuess / rapidGuessThresholdMs, the original r67 rule, UNCHANGED calculation: 3 s flat · a third
 *     of a passage's reading time on its first question · an item's own learned time once it has 20 careful
 *     answers) is now PURELY INFORMATIONAL: logged on QuestionAttempt.rapidGuess, shown to teachers (ReadMaster,
 *     Grammar reports, alerts), and used ONLY to spot a PATTERN — it never by itself withholds mastery, ability,
 *     accuracy or coins any more.
 *   · the one thing that still counts for NOTHING is an literal MISCLICK (isInstantMisclick): an answer given in
 *     under MISCLICK_MS — physically too fast to have read or decided anything, almost certainly an accidental
 *     double-tap, not a guess.
 *   · the PATTERN that still matters: fast AND WRONG, repeatedly (3 of the last 5 → a gentle "take your time" ·
 *     5 of the last 10 → the session pauses calmly, progress saved, one teacher alert) — this is the real signal of
 *     blind guessing (a true guess is wrong about 3 times out of 4 on a typical 4-option item), so it still catches
 *     a student clicking without reading, without ever penalising a fast, correct, genuinely able one.
 * 2. EFFORT of a session = careful (not fast-and-wrong) answers / all answers. More than 20 % fast-and-wrong →
 *    the session is "Unreliable" (teacher-only): its answers never change the student's level, tier or intervention
 *    plan.
 * 3. NEW TEXTS: a passage the student has never answered a question on (isUnseenPassage) — the final mastery stretch
 *    of a passage-based skill prefers them, and the star needs a correct answer on one (session.ts).
 */
import type { Repo } from "../seeding/repo";
import { sweptMap } from "../cache/idle";

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
/** guessing over this share of a session's answers makes the session Unreliable (now based on the fast-AND-WRONG
 * pattern, not speed alone — see effortFromCounts/sessionEffort below) */
export const UNRELIABLE_SHARE = 0.2;
/** after "take your time" the next question's answer buttons enable after this many milliseconds */
export const SLOW_DOWN_MS = 3000;
/** Nov 2026 redesign: an answer given faster than this is a literal MISCLICK — physically too fast for anyone to
 * have read the question or decided anything, almost certainly an accidental double-tap or stuck key, not a guess.
 * This is now the ONLY thing that zero-weights an answer toward mastery/ability/accuracy/XP/core-counting: a
 * correct answer always counts (raises the score) and a wrong answer always counts (lowers it), at any speed above
 * this floor. "Fast" (isRapidGuess, below) stays purely informational past this point — logged, shown to teachers,
 * and used only to spot the real signal of guessing: being fast AND wrong, repeatedly (guessResponse below). */
export const MISCLICK_MS = 500;
/** Whether an answer this fast is a literal misclick (pure). */
export const isInstantMisclick = (responseMs: number): boolean => Number(responseMs) < MISCLICK_MS;

/** Words in a passage (tags and markup ignored). */
export function passageWords(text: string | null | undefined): number {
  const t = s(text).replace(/<[^>]*>/g, " ").replace(/[#*_>`|[\]()]/g, " ").trim();
  return t ? t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

/** The expected reading time of a passage, in milliseconds. */
export const expectedReadingMs = (words: number): number => Math.round((Math.max(0, words) / READING_WPM) * 60_000);

export interface ItemTimeStats { answers: number; avgMs: number }
/** a short, simple question needs less reading time than the flat 3 s default assumes; see QUESTION_SHARE below */
export const QUESTION_MIN_MS = 1_500;
export interface GuessInput {
  /** the passage of the question (its text), when it has one */
  passageText?: string | null;
  /** true when this is the first question of the passage the student meets in this sitting (timed from the passage opening) */
  firstOnPassage?: boolean;
  /** the question's careful answers so far (count and average time) */
  itemStats?: ItemTimeStats | null;
  /** the question's own text (stem + its answer options), when it has no passage — Nov 2026 ("أسئلة سهلة ومش بياخد
   * فيها وقت"): a short standalone question (e.g. a one-line vocabulary or grammar item) gets its own, shorter
   * expected-reading-time floor instead of the flat 3 s used for every question regardless of length. */
  questionText?: string | null;
}
/** same reading-speed share of the question's own (short) text as PASSAGE_SHARE, applied to its own word count */
export const QUESTION_SHARE = 1 / 3;

/** The rapid-guess threshold for one answer, in milliseconds (pure). */
export function rapidGuessThresholdMs(input: GuessInput = {}): number {
  const st = input.itemStats;
  if (st && st.answers >= ITEM_STATS_MIN && st.avgMs > 0) return Math.min(ITEM_CAP_MS, Math.round(ITEM_SHARE * st.avgMs));
  if (input.firstOnPassage && input.passageText) return Math.max(RAPID_GUESS_MS, Math.round(PASSAGE_SHARE * expectedReadingMs(passageWords(input.passageText))));
  // Nov 2026 fix ("أسئلة سهلة والطالب لا ياخذ فيها وقت"): a question with no passage (a standalone skill item) used
  // the same flat 3 s floor as everything else, so a short, easy item a student can genuinely read and answer in
  // under 3 s was flagged exactly like a guess. Scale the floor to the question's own (short) text instead, same
  // formula as a passage's first question, but never below QUESTION_MIN_MS — reading four short answer options
  // still takes a little time even for a one-word question.
  if (!input.firstOnPassage && input.questionText) return Math.max(QUESTION_MIN_MS, Math.round(QUESTION_SHARE * expectedReadingMs(passageWords(input.questionText))));
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

/**
 * Nov 2026 redesign — REMOVED: the old "proof of fluency" apparatus (isFluentAnswer, isGenerallyFluentStudent,
 * inGraceWindow, PARTICIPATION_XP, and the generalCarefulRecord lookup below it used). It existed only to claw back
 * points for a fast-but-correct answer that the old design had already zero-weighted by default — a workaround for
 * a problem the new design doesn't have any more: a fast, correct answer now counts in full from the very first
 * attempt on a skill, no track record or grace window required. See the file header for the full redesign.
 */

export interface SessionEffort { answers: number; guesses: number; /** % careful answers, null before any answer */ effort: number | null; unreliable: boolean }
/**
 * A session's effort from its answers. Nov 2026 redesign: "guesses" here means fast-AND-WRONG (the real signal of
 * blind guessing), not fast alone — pass `a.rapidGuess && !a.correct`-shaped rows, not every rapid-flagged one.
 */
export function sessionEffort(answers: readonly Record<string, unknown>[]): SessionEffort {
  return effortFromCounts(answers.length, answers.filter((a) => a.rapidGuess && !a.correct).length);
}
/** A session's effort from its counts (PracticeSession.questionCount / guessCount — guessCount now counts
 * fast-AND-WRONG answers, see the callers in session.ts). */
export function effortFromCounts(answers: number, guesses: number): SessionEffort {
  const n = Math.max(0, Number(answers) || 0), g = Math.min(n, Math.max(0, Number(guesses) || 0));
  return { answers: n, guesses: g, effort: n ? Math.round((100 * (n - g)) / n) : null, unreliable: n > 0 && g / n > UNRELIABLE_SHARE };
}

/**
 * ⏸ The guessing pause: one alert to the student's teachers (their classes' teachers), calm and actionable. Never
 * shown to the student as a failure.
 */
/** one guessing-pause alert per student and work within this time */
export const PAUSE_ALERT_GAP_MS = 30 * 60_000;
export async function notifyGuessPause(repo: Repo, studentId: string, where: string, now = new Date(), key = `pause|${now.toISOString()}`): Promise<number> {
  const [student, member] = await Promise.all([
    repo.findUnique("Student", { id: studentId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  if (!student || !member.length) return 0;
  // 🩹 Nov 2026 (owner audit): two pauses seconds apart on the same work sent the teachers two identical notifications
  // — one alert per student and work within PAUSE_ALERT_GAP_MS
  const recent = await repo.findMany("StudentAlert", { studentId, kind: "RAPID_GUESS", createdAt: { gte: new Date(now.getTime() - PAUSE_ALERT_GAP_MS) } }, { select: ["detail"] });
  if (recent.some((r) => s(r.detail).includes(`“${where}”`))) return 0;
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
const statsCache = sweptMap<string, { at: number; v: ItemTimeStats }>("practice.item-times", STATS_TTL_MS, 5000);
/**
 * A question's correct answers (count, average time; at most its last 200), kept 10 minutes in memory.
 *
 * Nov 2026 fix (a feedback loop found while chasing "أسئلة سهلة... too fast"): this used to read only answers
 * already flagged `rapidGuess: false` ("careful"). For an easy, short question, the flat default threshold
 * (rapidGuessThresholdMs, above) flags most genuinely-fast-and-correct answers as guesses from the very first
 * answer onward — so this query kept finding zero "careful" rows, `answers` never reached ITEM_STATS_MIN, and the
 * smarter per-item rule could never take over: the question stayed stuck on the strict default forever. Reading
 * every CORRECT answer instead (rapid-flagged or not) breaks that loop — a question's own real answering time can
 * now be learned from how long correct answers actually take, not only from the ones that already passed the test
 * this very function exists to relax.
 */
export async function itemTimeStats(repo: Repo, questionId: string, now = Date.now()): Promise<ItemTimeStats> {
  const hit = statsCache.get(questionId);
  if (hit && now - hit.at < STATS_TTL_MS && now >= hit.at) return hit.v;
  const rows = await repo.findMany("QuestionAttempt", { questionId, isCorrect: true }, { select: ["responseMs"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 200 });
  const ms = rows.map((r) => Number(r.responseMs) || 0).filter((x) => x > 0 && x <= 30 * 60_000);
  const v = { answers: ms.length, avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0 };
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
