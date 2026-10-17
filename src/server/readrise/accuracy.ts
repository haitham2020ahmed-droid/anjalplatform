/**
 * 🎯 ReadRise accuracy (owner r69 item 3 — "more accurate than Achieve3000"):
 *
 *  1. RAPID GUESSES: the reader sends, for each of the 8 questions, when it was first answered (ms after the
 *     questions opened). The FIRST answer is timed from when the article opened (reading time + its own time)
 *     against a third of the text's expected reading time by its word count — the same rule as practice
 *     (src/server/practice/guessing.ts), because that one does need a fresh reading of the passage. Every OTHER
 *     answer is judged against RR_ANSWER_GAP_MS, not practice's flat RAPID_GUESS_MS: unlike practice (one question
 *     revealed at a time, so every answer needs its own "time to read this question"), the ReadRise reader shows
 *     all 8 questions at once — a careful student who read them while finishing the passage, then clicks through
 *     the ones already decided, naturally answers them a couple of seconds apart, not a fresh 3 s each (bug: this
 *     used to reuse RAPID_GUESS_MS here too, so that completely normal click-through was flagged a rapid guess and
 *     2+ such "guesses" made the whole run UNRELIABLE — which silently stopped the faster-down level rule from
 *     ever firing on exactly the struggling-reader sessions it exists to catch: a low scorer who does not linger
 *     over answers they do not understand). A run with 2+ rapid answers is UNRELIABLE (teacher-only): it never
 *     moves the level, never counts toward the weekly goal and never feeds the skills. A client that claims more
 *     time than the server saw since the questions opened is scaled down to the server's time.
 *  2. QUESTION TYPES: every ReadRise question carries a type (central idea, detail, inference, vocabulary, text
 *     structure, author's purpose, cause–effect, sequence, compare). A question without one (an older import, a
 *     school's file) gets one by a deterministic rule from its stem (inferQuestionType).
 *  3. MAP CHECK: a placed student whose ReadRise level and MAP reading level (the latest MAP result) are more than
 *     MAP_GAP apart → ONE alert for the class's teachers per school year (StudentAlert RR_MAP_GAP + a notification).
 * Everything except alertMapGap is pure.
 */
import type { Repo } from "../seeding/repo";
import { PASSAGE_SHARE, RAPID_GUESS_MS, expectedReadingMs } from "../practice/guessing";
import { schoolYearOf } from "../assessment-cycle/cycle";
import { latestMapLexile, readRisePlaced, s } from "./engine";

/** this many rapid answers in one run make it Unreliable */
export const RR_UNRELIABLE_RAPID = 2;
/**
 * The gap threshold for every answer after the first (ms): all 8 questions are visible from the moment the quiz
 * opens, so answering one soon after another is not "too fast to have read it" the way it would be in practice's
 * one-question-at-a-time flow — only a near-instant click (well under practice's 3 s) is still a guess here.
 */
export const RR_ANSWER_GAP_MS = 1500;
/** the longest answer time kept (3 hours) */
const MAX_MS = 3 * 3_600_000;

export interface RapidInput {
  /** question number → ms after the questions opened when it was first answered (from the reader) */
  at?: Record<string, unknown> | null;
  /** the run's question numbers */
  numbers: number[];
  /** seconds spent on the article before the questions */
  readSeconds: number;
  /** words of the version read */
  words: number;
  /** ms the server saw between the questions opening and the submit (null when unknown) */
  serverMs?: number | null;
}
export interface RapidResult { ms: Record<string, number>; rapid: number[]; unreliable: boolean }

/** The passage threshold for the first answer: a third of the expected reading time, at least 3 s. */
export const firstAnswerThresholdMs = (words: number): number => Math.max(RAPID_GUESS_MS, Math.round(PASSAGE_SHARE * expectedReadingMs(words)));

/** Which answers of a run were rapid guesses (pure). */
export function rapidAnswers(i: RapidInput): RapidResult {
  const offsets: { n: number; t: number }[] = [];
  for (const n of i.numbers) {
    const v = Number(i.at?.[String(n)]);
    if (Number.isFinite(v) && v >= 0 && v <= MAX_MS) offsets.push({ n, t: v });
  }
  const readMs = Math.max(0, Number(i.readSeconds) || 0) * 1000;
  const first = firstAnswerThresholdMs(Math.max(0, Number(i.words) || 0));
  if (!offsets.length) {
    // no answer times (an older page): only the reading time can be judged — at most one rapid answer
    const rapid = readMs > 0 && readMs < first && i.numbers.length ? [i.numbers[0]] : [];
    return { ms: {}, rapid, unreliable: rapid.length >= RR_UNRELIABLE_RAPID };
  }
  // never more time than the server saw
  const maxT = Math.max(...offsets.map((o) => o.t));
  const server = i.serverMs === null || i.serverMs === undefined ? null : Math.max(0, Number(i.serverMs) || 0);
  const k = server !== null && maxT > server + 5000 ? server / maxT : 1;
  offsets.sort((a, b) => a.t - b.t || a.n - b.n);
  const ms: Record<string, number> = {};
  const rapid: number[] = [];
  let prev = 0;
  offsets.forEach((o, idx) => {
    const t = Math.round(o.t * k), d = Math.max(0, t - prev);
    prev = t;
    ms[String(o.n)] = d;
    const isRapid = idx === 0 ? readMs + d < first : d < RR_ANSWER_GAP_MS;
    if (isRapid) rapid.push(o.n);
  });
  rapid.sort((a, b) => a - b);
  return { ms, rapid, unreliable: rapid.length >= RR_UNRELIABLE_RAPID };
}

/** The rapid question numbers stored on a run (RRRun.answerMs.rapid), [] when none. */
export function storedRapid(v: unknown): number[] {
  const o = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v;
  const r = o && typeof o === "object" ? (o as { rapid?: unknown }).rapid : null;
  return Array.isArray(r) ? r.map(Number).filter((n) => Number.isInteger(n)) : [];
}
/** A run marked Unreliable (2+ rapid answers). */
export const isUnreliableRun = (r: Record<string, unknown>): boolean => r.unreliable === true || r.unreliable === 1;

// ------------------------------------------------------------------ question types (question-type.ts)

export { QUESTION_TYPES, QUESTION_TYPE_NAME, inferQuestionType, normalizeQuestionType, questionTypeOf, type QuestionType } from "./question-type";

// ------------------------------------------------------------------ the MAP check

/** ReadRise level vs MAP reading level: further apart than this → one alert for the teacher */
export const MAP_GAP = 250;
export const MAP_GAP_KIND = "RR_MAP_GAP";

/** The gap (ReadRise level − MAP reading level) when it is bigger than MAP_GAP, else null (pure). */
export function mapGap(level: number, mapLevel: number | null): number | null {
  if (mapLevel === null || !Number.isFinite(mapLevel) || !Number.isFinite(level)) return null;
  const d = Math.round(level - mapLevel);
  return Math.abs(d) > MAP_GAP ? d : null;
}

/**
 * ⚖️ One alert per student and school year when the ReadRise level and the MAP reading level differ by more than
 * MAP_GAP (only for a placed student). Runs after the response (never on the answer path). Returns true when an
 * alert was raised now.
 */
export async function alertMapGap(repo: Repo, studentId: string, now = new Date()): Promise<boolean> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  if (!rr) return false;
  if (!readRisePlaced(rr, (await repo.count("RRPlacement", { studentId, completedAt: { not: null } })) > 0)) return false;
  const map = await latestMapLexile(repo, studentId);
  const level = Number(rr.level);
  const gap = mapGap(level, map);
  if (gap === null) return false;
  const key = `${MAP_GAP_KIND}|${schoolYearOf(now)}`;
  if ((await repo.findMany("StudentAlert", { studentId, key }, { select: ["id"], take: 1 })).length) return false;
  const [student, member] = await Promise.all([
    repo.findUnique("Student", { id: studentId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  if (!student) return false;
  const detail = `ReadRise level ${level} and the MAP reading level ${map} are ${Math.abs(gap)} points apart (more than ${MAP_GAP}). ` +
    `${gap > 0 ? "ReadRise is higher" : "ReadRise is lower"}: check the placement or the MAP result; you can set the ReadRise level by hand or allow a new placement.`;
  try {
    await repo.create("StudentAlert", { schoolId: s(student.schoolId), classId: member.length ? s(member[0].classId) : null, studentId, kind: MAP_GAP_KIND, key, detail: detail.slice(0, 500), status: "OPEN", createdAt: now });
  } catch { return false; } // raised by another request at the same moment: one alert
  if (!member.length) return true;
  const teachers = await repo.findMany("ClassTeacher", { classId: { in: [...new Set(member.map((m) => s(m.classId)))] } }, { select: ["teacherId"] });
  const users = teachers.length ? await repo.findMany("Teacher", { id: { in: [...new Set(teachers.map((t) => s(t.teacherId)))] } }, { select: ["userId"] }) : [];
  if (!users.length) return true;
  const me = await repo.findUnique("User", { id: student.userId });
  const name = s(me?.displayName) || "A student";
  await repo.createMany("Notification", [...new Set(users.map((u) => s(u.userId)))].map((userId) => ({
    userId, type: "INTERVENTION_ALERT", title: `⚖️ ${name}: ReadRise and MAP disagree`,
    body: `${name}'s ReadRise level (${level}) and MAP reading level (${map}) are ${Math.abs(gap)} points apart. Check the placement or the MAP result.`,
    link: "/teacher/alerts", readAt: null, createdAt: now,
  })));
  return true;
}
