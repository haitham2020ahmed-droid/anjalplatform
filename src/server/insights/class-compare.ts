/**
 * 📈 Progress compared fairly — a class with ITSELF, a student with their own class (owner: very important).
 *
 *   classMonth     the class this month against the same class last month (rolling 30 days against the 30 days
 *                  before): new stars (skills mastered), skills improved, skills still weak, effort (answers, active
 *                  students) and practice time. NEVER ranked against other teachers' classes: only this class's
 *                  rows are read and nothing about another class is returned.
 *   peerCompare    each student against their classmates — position (above / around / below the class middle) and
 *                  growth against the class's growth ("progressing faster than 70% of classmates this month ↑") —
 *                  with the "weak but growing fast" (encourage) and "strong but flat" (challenge) lists.
 *                  TEACHERS AND ADMINS ONLY: students and parents never see a rank (refused here).
 *   weeklySummary  the teacher's week in two lines for Reports ("This week: 12 new stars · 3 students need review ·
 *                  weakest class skill: Inference").
 *   myMonth        the student's own month ("This month you mastered 4 skills — more than last month 🎉"): their
 *                  own numbers only, no class, no rank.
 * ⭐ "New stars" / "mastered" (owner, 1 Nov 2026) are the SkillStatus stars of My Skills, by skill KEY (copies of a
 * skill count once): a ⭐ earned (masteredAt) in the window and still ⭐; "need review" = students with a 🔄. The
 * answers, accuracy and time numbers are practice-totals.ts (round 4); the skill lists are by KEY from the stars.
 * Bounded: a fixed number of batched reads per class (one star read for all its students).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { accessibleClasses } from "../teacher/assign";
import { starBook, starMastered, type StarBook } from "../skills/star-read";
import { hiddenStarKeys } from "../teacher/queries";
import { practiceTotals, type PracticeTotals } from "../analytics/practice-totals";
import { riyadhDay } from "../analytics/practice";
import { weekNumbers } from "./week-in-review";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;
const yes = (v: unknown) => v === true || v === 1;
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const pct = (ok: number, n: number) => (n ? Math.round((100 * ok) / n) : null);

export interface MonthWindow { newStars: number; answers: number; accuracy: number | null; active: number; minutes: number }
export interface ClassMonth {
  classId: string; className: string; size: number;
  thisMonth: MonthWindow; lastMonth: MonthWindow;
  improved: { skillId: string; name: string; from: number; to: number }[];
  weak: { skillId: string; name: string; accuracy: number; answers: number; stillWeak: boolean }[];
  /** plain sentences, this class against itself */
  lines: string[];
}

/** ⭐ The stars of these students as rows { studentId, skillId: key, masteredAt } — one row per ⭐ key (still ⭐) earned since `since`. */
export function starRows(book: StarBook, ids: readonly string[], since = 0): Row[] {
  const out: Row[] = [];
  for (const id of ids) for (const [key, v] of book.byKey.get(id) ?? new Map()) if (starMastered(v) && v.masteredAt && time(v.masteredAt) >= since) out.push({ studentId: id, skillId: key, masteredAt: v.masteredAt });
  return out;
}

async function members(repo: Repo, classId: string): Promise<string[]> {
  return [...new Set((await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
}

/** One student × skill KEY star, flattened for the pure month comparison (built from the star book). */
export interface StarRow { studentId: string; key: string; skillId: string; name: string; status: string; score: number; masteredAt: string | null; startedAt: string | null }
/** The two 30-day windows (ms): this = the last 30 Riyadh days up to today, last = the 30 days before. */
export interface MonthWindows { thisFrom: number; thisTo: number; lastFrom: number; lastTo: number }

/** The class's stars as rows (one per student × started KEY, the hidden holder skill left out). */
export function starRowsOf(book: StarBook, ids: readonly string[], hidden: ReadonlySet<string> = new Set()): StarRow[] {
  const out: StarRow[] = [];
  for (const id of ids) for (const [key, v] of book.byKey.get(id) ?? new Map()) {
    if (hidden.has(key) || v.status === "NOT_STARTED") continue;
    out.push({ studentId: id, key, skillId: v.skillId ?? book.ix.skillsOf.get(key)?.[0] ?? "", name: book.nameOf(key), status: v.status, score: v.score, masteredAt: v.masteredAt, startedAt: v.startedAt });
  }
  return out;
}

/** The two 30-day windows ending today (Riyadh calendar days), as calendar dates for practiceTotals `days: true`. */
export function monthWindows(now: Date): { cal: { thisFrom: Date; thisTo: Date; lastFrom: Date; lastTo: Date }; ms: MonthWindows } {
  const today = Date.parse(`${riyadhDay(now)}T00:00:00Z`);
  const cal = { thisFrom: new Date(today - 29 * DAY), thisTo: new Date(today + DAY - 1), lastFrom: new Date(today - 59 * DAY), lastTo: new Date(today - 29 * DAY - 1) };
  // the same days as instants (Riyadh midnight = 21:00 UTC the day before)
  const r = (d: Date) => d.getTime() - RIYADH;
  return { cal, ms: { thisFrom: r(cal.thisFrom), thisTo: r(cal.thisTo), lastFrom: r(cal.lastFrom), lastTo: r(cal.lastTo) } };
}

/**
 * Pure: the two windows and the skill lists (exported for the tests).
 * 📏 Round 4: answers / accuracy / minutes / active come from practice-totals.ts (THE one definition: skill practice +
 * NAFS + ReadRise, rapid guesses out of accuracy, ≤ 5 min per answer) for each 30-day window; the skills are by KEY
 * from the stars: "improved" = skills on which students earned ⭐ this month (from → to = % of the class with ⭐ at
 * the window start → now); "still weak" = the class's weakest skills (🔄 needs review first, then the lowest star
 * score of the students working on them; `accuracy` = that average star score, `answers` = the students on it),
 * `stillWeak` = somebody has been on it since before this month.
 */
export function monthCompare(input: { ids: string[]; thisTotals: ReadonlyMap<string, PracticeTotals>; lastTotals: ReadonlyMap<string, PracticeTotals>; stars: readonly StarRow[]; windows: MonthWindows }): Omit<ClassMonth, "classId" | "className" | "size" | "lines"> {
  const { ids, stars, windows: w } = input;
  const win = (totals: ReadonlyMap<string, PracticeTotals>, from: number, to: number): MonthWindow => {
    let answers = 0, correct = 0, careful = 0, minutes = 0, active = 0;
    for (const id of ids) { const x = totals.get(id); if (!x) continue; answers += x.questions; correct += x.correct; careful += x.careful; minutes += x.minutes; if (x.questions) active++; }
    const newStars = stars.filter((x) => (x.status === "MASTERED" || x.status === "NEXT_LEVEL") && x.masteredAt && time(x.masteredAt) >= from && time(x.masteredAt) <= to).length;
    return { newStars, answers, accuracy: pct(correct, careful), active, minutes };
  };
  const size = Math.max(1, ids.length);
  const byKey = new Map<string, StarRow[]>();
  for (const r of stars) (byKey.get(r.key) ?? byKey.set(r.key, []).get(r.key)!).push(r);
  const improved: ClassMonth["improved"] = [], weak: (ClassMonth["weak"][number] & { review: number })[] = [];
  for (const [, list] of byKey) {
    const star = list.filter((x) => x.status === "MASTERED" || x.status === "NEXT_LEVEL");
    const before = star.filter((x) => !x.masteredAt || time(x.masteredAt) < w.thisFrom).length;
    if (star.length > before) improved.push({ skillId: list[0].skillId, name: list[0].name, from: Math.round((100 * before) / size), to: Math.round((100 * star.length) / size) });
    const review = list.filter((x) => x.status === "NEEDS_REVIEW"), learning = list.filter((x) => x.status === "IN_PROGRESS");
    const avg = learning.length ? Math.round(learning.reduce((t, x) => t + x.score, 0) / learning.length) : null;
    if (review.length || (avg !== null && avg < 60)) {
      const on = [...review, ...learning];
      weak.push({ skillId: list[0].skillId, name: list[0].name, accuracy: avg ?? 0, answers: on.length, review: review.length, stillWeak: on.some((x) => x.startedAt && time(x.startedAt) < w.thisFrom) });
    }
  }
  improved.sort((a, b) => b.to - b.from - (a.to - a.from) || a.name.localeCompare(b.name));
  weak.sort((a, b) => b.review - a.review || a.accuracy - b.accuracy || a.name.localeCompare(b.name));
  return { thisMonth: win(input.thisTotals, w.thisFrom, w.thisTo), lastMonth: win(input.lastTotals, w.lastFrom, w.lastTo), improved: improved.slice(0, 8), weak: weak.slice(0, 8).map(({ review: _r, ...x }) => x) };
}

/** Pure: the plain sentences of the class against itself. */
export function monthLines(m: Pick<ClassMonth, "thisMonth" | "lastMonth" | "improved" | "weak">): string[] {
  const a = m.thisMonth, b = m.lastMonth, out: string[] = [];
  const more = (x: number, y: number) => (x > y ? `up from ${y}` : x < y ? `down from ${y}` : "the same as last month");
  out.push(`${a.newStars} new stars this month (${more(a.newStars, b.newStars)}).`);
  if (m.improved.length) out.push(`Improved most: ${m.improved[0].name} (⭐ ${m.improved[0].from}% → ${m.improved[0].to}% of the class).`);
  if (m.weak.length) out.push(`Still to work on: ${m.weak[0].name} (star score ${m.weak[0].accuracy}).`);
  out.push(`Practice: ${a.minutes} minutes by ${a.active} students (last month ${b.minutes} minutes by ${b.active}).`);
  return out;
}

/** The class this month against the same class last month. Never other classes. */
export async function classMonth(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassMonth> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can open class reports.");
  const klass = await assertClassRead(repo, actor, classId);
  const ids = await members(repo, classId);
  const { cal, ms } = monthWindows(now);
  // 📏 round 4: the two 30-day windows from practice-totals.ts (Riyadh days, 25 students at a time) — no 30,000-row read
  const [thisTotals, lastTotals, book] = ids.length ? await Promise.all([
    practiceTotals(repo, ids, cal.thisFrom, cal.thisTo, { schoolId: s(klass.schoolId), days: true }),
    practiceTotals(repo, ids, cal.lastFrom, cal.lastTo, { schoolId: s(klass.schoolId), days: true }),
    starBook(repo, ids, s(klass.schoolId)),
  ]) : [new Map<string, PracticeTotals>(), new Map<string, PracticeTotals>(), null];
  const stars = book ? starRowsOf(book, ids, await hiddenStarKeys(repo, book)) : [];
  const m = monthCompare({ ids, thisTotals, lastTotals, stars, windows: ms });
  return { classId: s(klass.id), className: s(klass.name), size: ids.length, ...m, lines: monthLines(m) };
}

// ------------------------------------------------------------------ a student against the class

export type Position = "above" | "around" | "below";
/**
 * `sentence` is a short line made of interface strings: "{position} · {growth}" — position is one of "Above the class
 * middle" / "Below the class middle" / "Around the class middle" / "Not enough answers yet"; growth is
 * "progressing faster than {n}% of classmates" + " ↑" / " ↓", or "no practice this month". `parts` carries the same
 * pieces so a renderer translates them: `${t(parts.position)} · ${t(parts.growth, parts.vars)}${parts.arrow}`.
 */
export interface PeerSentenceParts { position: string; growth: string; vars: Record<string, number>; arrow: "" | " ↑" | " ↓" }
export interface PeerRow { studentId: string; name: string; average: number | null; position: Position | null; newStars: number; accuracyChange: number | null; growth: number; fasterThan: number | null; sentence: string; parts: PeerSentenceParts }

/**
 * ⭐ The rows peerRows places students by: one per STARTED star (skill key, the hidden holder skill left out) with the
 * STAR score (StarView.score) — the class middle is the median of each student's average star score.
 */
export function starScoreRows(book: StarBook, ids: readonly string[], hidden: ReadonlySet<string> = new Set()): Row[] {
  const out: Row[] = [];
  for (const id of ids) for (const v of book.byKey.get(id)?.values() ?? []) if (v.status !== "NOT_STARTED" && !hidden.has(v.key)) out.push({ studentId: id, skillId: v.key, score: v.score, attempts: Math.max(1, v.answered) });
  return out;
}
export interface PeerCompare { classId: string; rows: PeerRow[]; middle: number | null; encourage: PeerRow[]; challenge: PeerRow[] }

const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/** Pure: positions and growth within ONE class (exported for the tests). */
export function peerRows(input: { students: { id: string; name: string }[]; mastery: Row[]; stars: Row[]; attempts: Row[]; now: Date }): Omit<PeerCompare, "classId"> {
  const { students, mastery, stars, attempts, now } = input;
  const cut = now.getTime() - 30 * DAY;
  const avgOf = new Map<string, number>();
  for (const st of students) {
    const mine = mastery.filter((r) => s(r.studentId) === st.id && Number(r.attempts ?? 0) > 0);
    if (mine.length) avgOf.set(st.id, Math.round(mine.reduce((t, r) => t + Number(r.score ?? 0), 0) / mine.length));
  }
  const middle = median([...avgOf.values()]);
  const base = students.map((st) => {
    const newStars = stars.filter((r) => s(r.studentId) === st.id && time(r.masteredAt) >= cut).length;
    const a = attempts.filter((x) => s(x.studentId) === st.id && !yes(x.rapidGuess));
    const now_ = a.filter((x) => time(x.createdAt) >= cut), before = a.filter((x) => time(x.createdAt) < cut);
    const accNow = now_.length >= 5 ? pct(now_.filter((x) => yes(x.isCorrect)).length, now_.length) : null;
    const accBefore = before.length >= 5 ? pct(before.filter((x) => yes(x.isCorrect)).length, before.length) : null;
    const accuracyChange = accNow !== null && accBefore !== null ? accNow - accBefore : null;
    // growth: new stars count most; the change of accuracy breaks ties (a tenth of a star per point)
    const growth = newStars + (accuracyChange ?? 0) / 10;
    const average = avgOf.get(st.id) ?? null;
    const position: Position | null = average === null || middle === null ? null : average > middle + 5 ? "above" : average < middle - 5 ? "below" : "around";
    return { studentId: st.id, name: st.name, average, position, newStars, accuracyChange, growth, active: now_.length > 0 || newStars > 0 };
  });
  const active = base.filter((r) => r.active);
  const rows: PeerRow[] = base.map((r) => {
    const others = active.filter((o) => o.studentId !== r.studentId);
    const fasterThan = r.active && others.length ? Math.round((100 * others.filter((o) => o.growth < r.growth).length) / others.length) : null;
    const parts: PeerSentenceParts = {
      position: r.position === "above" ? "Above the class middle" : r.position === "below" ? "Below the class middle" : r.position === "around" ? "Around the class middle" : "Not enough answers yet",
      growth: fasterThan === null ? "no practice this month" : "progressing faster than {n}% of classmates",
      vars: fasterThan === null ? {} : { n: fasterThan },
      arrow: fasterThan === null ? "" : fasterThan >= 50 ? " ↑" : " ↓",
    };
    const sentence = `${parts.position} · ${parts.growth.replace("{n}", String(fasterThan ?? ""))}${parts.arrow}`;
    return { studentId: r.studentId, name: r.name, average: r.average, position: r.position, newStars: r.newStars, accuracyChange: r.accuracyChange, growth: r.growth, fasterThan, sentence, parts };
  });
  const encourage = rows.filter((r) => r.position === "below" && r.fasterThan !== null && r.fasterThan >= 60).sort((a, b) => (b.fasterThan ?? 0) - (a.fasterThan ?? 0));
  const challenge = rows.filter((r) => r.position === "above" && r.newStars === 0 && (r.accuracyChange ?? 0) <= 0).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), middle, encourage, challenge };
}

/** Each student against their own classmates. Teachers and admins only: a student or a parent is refused. */
export async function peerCompare(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<PeerCompare> {
  if (!isStaff(actor)) throw new ForbiddenError("Comparisons with classmates are for teachers only.");
  await assertClassRead(repo, actor, classId);
  const ids = await members(repo, classId);
  if (!ids.length) return { classId, rows: [], middle: null, encourage: [], challenge: [] };
  const since = new Date(now.getTime() - 60 * DAY);
  const [attempts, students, book] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "isCorrect", "rapidGuess", "createdAt"], take: 30000 }),
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId", "schoolId"] }),
    starBook(repo, ids),
  ]);
  // ⭐ above / around / below the class middle = the average STAR score over the started stars (not the engine score)
  const mastery = starScoreRows(book, ids, await hiddenStarKeys(repo, book));
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const list = students.map((x) => ({ id: s(x.id), name: nameOf.get(s(x.userId)) || "Student" }));
  return { classId, ...peerRows({ students: list, mastery, stars: starRows(book, ids), attempts, now }) };
}

/** One student against their classmates (the student file). Teachers and admins only. */
export async function studentPeer(repo: Repo, actor: Actor, classId: string, studentId: string, name: string, now = new Date()): Promise<PeerRow | null> {
  if (!isStaff(actor)) throw new ForbiddenError("Comparisons with classmates are for teachers only.");
  await assertClassRead(repo, actor, classId);
  const ids = await members(repo, classId);
  if (!ids.includes(studentId)) return null;
  const since = new Date(now.getTime() - 60 * DAY);
  const [attempts, book] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "isCorrect", "rapidGuess", "createdAt"], take: 30000 }),
    starBook(repo, ids),
  ]);
  const mastery = starScoreRows(book, ids, await hiddenStarKeys(repo, book));
  const r = peerRows({ students: ids.map((id) => ({ id, name: id === studentId ? name : "" })), mastery, stars: starRows(book, ids), attempts, now });
  return r.rows.find((x) => x.studentId === studentId) ?? null;
}

// ------------------------------------------------------------------ the teacher's week in two lines

export interface WeeklySummary { newStars: number; needReview: number; weakest: string | null; minutes: number; active: number; students: number; lines: [string, string] }

/**
 * The teacher's own classes this week (admins: null — the school view lives in the admin analytics).
 * 📏 Round 4: the SAME numbers as the Week in Review card (week-in-review.ts weekNumbers): the Riyadh school week
 * from Sunday, minutes / active students from practice-totals.ts, the weakest skill by KEY from the star book
 * (🔄 first, then the lowest star score among the started skills), new ⭐ by key with the holder skill out.
 */
export async function weeklySummary(repo: Repo, actor: Actor, now = new Date()): Promise<WeeklySummary | null> {
  if (actor.role !== "TEACHER") return null;
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return null;
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  if (!ids.length) return null;
  const w = await weekNumbers(repo, ids, now, { schoolId: actor.schoolId, stars: true });
  return {
    newStars: w.newStars, needReview: w.needReview, weakest: w.weakest, minutes: w.minutes, active: w.active, students: ids.length,
    lines: [
      `This week: ${w.newStars} new stars · ${w.needReview} students need review · weakest class skill: ${w.weakest ?? "—"}`,
      `Practice: ${w.minutes} minutes by ${w.active} of ${ids.length} students.`,
    ],
  };
}

// ------------------------------------------------------------------ the student's own month

export interface MyMonth { thisMonth: number; lastMonth: number; message: string; template: string; vars: Record<string, number> }

/** Pure: the student's sentence as an interface template + its numbers (own numbers only, encouraging, no rank). */
export function myMonthTemplate(n: number, last: number): { template: string; vars: Record<string, number> } {
  if (n === 0) return { template: "No new skill mastered this month yet — practise today to earn your first star! ⭐", vars: {} };
  const one = n === 1;
  if (n > last) return { template: one ? "This month you mastered 1 skill — more than last month 🎉" : "This month you mastered {n} skills — more than last month 🎉", vars: { n } };
  if (n === last) return { template: one ? "This month you mastered 1 skill — as many as last month. Keep going! 💪" : "This month you mastered {n} skills — as many as last month. Keep going! 💪", vars: { n } };
  return { template: one ? "This month you mastered 1 skill. Keep practising to beat last month's {m}! 💪" : "This month you mastered {n} skills. Keep practising to beat last month's {m}! 💪", vars: { n, m: last } };
}
/** Pure: the English sentence. */
export function myMonthMessage(n: number, last: number): string {
  const { template, vars } = myMonthTemplate(n, last);
  return template.replace(/\{(\w+)\}/g, (x, k: string) => (k in vars ? String(vars[k]) : x));
}

/** The signed-in student's month (calendar months). Only their own rows. */
export async function myMonth(repo: Repo, actor: Actor, now = new Date()): Promise<MyMonth> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only the student sees this.");
  // round 4: calendar months in Riyadh time (the 1st 00:00 Riyadh = the last day 21:00 UTC), not UTC months
  const local = new Date(now.getTime() + RIYADH);
  const startThis = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - RIYADH);
  const startLast = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - RIYADH);
  // ⭐ the student's own stars by skill key (still ⭐, earned in the month) — the same stars as My Skills
  const book = await starBook(repo, [actor.studentId], actor.schoolId);
  const thisMonth = book.newStars(actor.studentId, startThis, new Date(8.64e15));
  const lastMonth = book.newStars(actor.studentId, startLast, new Date(startThis.getTime() - 1));
  return { thisMonth, lastMonth, message: myMonthMessage(thisMonth, lastMonth), ...myMonthTemplate(thisMonth, lastMonth) };
}
