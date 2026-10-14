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
 * Bounded: a fixed number of batched reads per class.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { accessibleClasses } from "../teacher/assign";
import { isHiddenSkill } from "../skills/master";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const DAY = 86_400_000;
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

async function members(repo: Repo, classId: string): Promise<string[]> {
  return [...new Set((await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
}

/** Pure: the two windows and the skill lists (exported for the tests). */
export function monthCompare(input: { ids: string[]; attempts: Row[]; stars: Row[]; sessions: Row[]; skillNames: Map<string, string>; now: Date }): Omit<ClassMonth, "classId" | "className" | "size" | "lines"> {
  const { attempts, stars, sessions, skillNames, now } = input;
  const cut = now.getTime() - 30 * DAY, start = now.getTime() - 60 * DAY;
  const inThis = (t: number) => t >= cut && t <= now.getTime(), inLast = (t: number) => t >= start && t < cut;
  const win = (inside: (t: number) => boolean): MonthWindow => {
    const a = attempts.filter((x) => inside(time(x.createdAt)));
    return {
      newStars: stars.filter((x) => inside(time(x.masteredAt))).length,
      answers: a.length, accuracy: pct(a.filter((x) => yes(x.isCorrect)).length, a.length),
      active: new Set(a.map((x) => s(x.studentId))).size,
      minutes: Math.round(sessions.filter((x) => inside(time(x.startedAt))).reduce((t, x) => t + Math.min(Number(x.activeMs ?? 0), 3 * 3_600_000), 0) / 60_000),
    };
  };
  const per = new Map<string, { a: [number, number]; b: [number, number] }>();
  for (const x of attempts) {
    if (yes(x.rapidGuess) || !skillNames.has(s(x.skillId))) continue;
    const t = time(x.createdAt), e = per.get(s(x.skillId)) ?? { a: [0, 0], b: [0, 0] };
    const w = inThis(t) ? e.a : inLast(t) ? e.b : null;
    if (!w) continue;
    w[0]++; if (yes(x.isCorrect)) w[1]++;
    per.set(s(x.skillId), e);
  }
  const improved: ClassMonth["improved"] = [], weak: ClassMonth["weak"] = [];
  for (const [id, e] of per) {
    const now_ = pct(e.a[1], e.a[0]), before = pct(e.b[1], e.b[0]);
    if (e.a[0] >= 10 && e.b[0] >= 10 && now_ !== null && before !== null && now_ - before >= 10) improved.push({ skillId: id, name: skillNames.get(id)!, from: before, to: now_ });
    if (e.a[0] >= 10 && now_ !== null && now_ < 60) weak.push({ skillId: id, name: skillNames.get(id)!, accuracy: now_, answers: e.a[0], stillWeak: e.b[0] >= 10 && before !== null && before < 60 });
  }
  improved.sort((a, b) => b.to - b.from - (a.to - a.from));
  weak.sort((a, b) => a.accuracy - b.accuracy);
  return { thisMonth: win(inThis), lastMonth: win(inLast), improved: improved.slice(0, 8), weak: weak.slice(0, 8) };
}

/** Pure: the plain sentences of the class against itself. */
export function monthLines(m: Pick<ClassMonth, "thisMonth" | "lastMonth" | "improved" | "weak">): string[] {
  const a = m.thisMonth, b = m.lastMonth, out: string[] = [];
  const more = (x: number, y: number) => (x > y ? `up from ${y}` : x < y ? `down from ${y}` : "the same as last month");
  out.push(`${a.newStars} new stars this month (${more(a.newStars, b.newStars)}).`);
  if (m.improved.length) out.push(`Improved most: ${m.improved[0].name} (${m.improved[0].from}% → ${m.improved[0].to}%).`);
  if (m.weak.length) out.push(`Still to work on: ${m.weak[0].name} (${m.weak[0].accuracy}% correct).`);
  out.push(`Practice: ${a.minutes} minutes by ${a.active} students (last month ${b.minutes} minutes by ${b.active}).`);
  return out;
}

/** The class this month against the same class last month. Never other classes. */
export async function classMonth(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassMonth> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can open class reports.");
  const klass = await assertClassRead(repo, actor, classId);
  const ids = await members(repo, classId);
  const since = new Date(now.getTime() - 60 * DAY);
  const [attempts, stars, sessions] = ids.length ? await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "skillId", "isCorrect", "rapidGuess", "createdAt"], take: 30000 }),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, masteredAt: { gte: since } }, { select: ["studentId", "skillId", "masteredAt"] }),
    repo.findMany("PracticeSession", { studentId: { in: ids }, startedAt: { gte: since } }, { select: ["studentId", "activeMs", "startedAt"] }),
  ]) : [[], [], []] as Row[][];
  const skillIds = [...new Set(attempts.map((a) => s(a.skillId)))];
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "code"] }) : [];
  const skillNames = new Map(skills.filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)]));
  const m = monthCompare({ ids, attempts, stars, sessions, skillNames, now });
  return { classId: s(klass.id), className: s(klass.name), size: ids.length, ...m, lines: monthLines(m) };
}

// ------------------------------------------------------------------ a student against the class

export type Position = "above" | "around" | "below";
export interface PeerRow { studentId: string; name: string; average: number | null; position: Position | null; newStars: number; accuracyChange: number | null; growth: number; fasterThan: number | null; sentence: string }
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
    const pos = r.position === "above" ? "above the class middle" : r.position === "below" ? "below the class middle" : r.position === "around" ? "around the class middle" : "not placed yet (too few answers)";
    const sentence = fasterThan === null ? `${r.name} is ${pos}; no practice this month to compare growth.` : `${r.name} is ${pos} and progressing faster than ${fasterThan}% of classmates this month ${fasterThan >= 50 ? "↑" : "↓"}.`;
    return { studentId: r.studentId, name: r.name, average: r.average, position: r.position, newStars: r.newStars, accuracyChange: r.accuracyChange, growth: r.growth, fasterThan, sentence };
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
  const [mastery, attempts, students] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score", "attempts", "masteredAt"] }),
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "isCorrect", "rapidGuess", "createdAt"], take: 30000 }),
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const list = students.map((x) => ({ id: s(x.id), name: nameOf.get(s(x.userId)) || "Student" }));
  return { classId, ...peerRows({ students: list, mastery, stars: mastery.filter((r) => r.masteredAt), attempts, now }) };
}

/** One student against their classmates (the student file). Teachers and admins only. */
export async function studentPeer(repo: Repo, actor: Actor, classId: string, studentId: string, name: string, now = new Date()): Promise<PeerRow | null> {
  if (!isStaff(actor)) throw new ForbiddenError("Comparisons with classmates are for teachers only.");
  await assertClassRead(repo, actor, classId);
  const ids = await members(repo, classId);
  if (!ids.includes(studentId)) return null;
  const since = new Date(now.getTime() - 60 * DAY);
  const [mastery, attempts] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score", "attempts", "masteredAt"] }),
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "isCorrect", "rapidGuess", "createdAt"], take: 30000 }),
  ]);
  const r = peerRows({ students: ids.map((id) => ({ id, name: id === studentId ? name : "" })), mastery, stars: mastery.filter((x) => x.masteredAt), attempts, now });
  return r.rows.find((x) => x.studentId === studentId) ?? null;
}

// ------------------------------------------------------------------ the teacher's week in two lines

export interface WeeklySummary { newStars: number; needReview: number; weakest: string | null; minutes: number; active: number; students: number; lines: [string, string] }

/** The teacher's own classes this week (admins: null — the school view lives in the admin analytics). */
export async function weeklySummary(repo: Repo, actor: Actor, now = new Date()): Promise<WeeklySummary | null> {
  if (actor.role !== "TEACHER") return null;
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return null;
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  if (!ids.length) return null;
  const since = new Date(now.getTime() - 7 * DAY);
  const [stars, review, attempts, sessions] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, masteredAt: { gte: since } }, { select: ["studentId"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, isMastered: true, nextReviewAt: { lte: now } }, { select: ["studentId"] }),
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "skillId", "isCorrect", "rapidGuess"], take: 20000 }),
    repo.findMany("PracticeSession", { studentId: { in: ids }, startedAt: { gte: since } }, { select: ["activeMs"] }),
  ]);
  const per = new Map<string, [number, number]>();
  for (const a of attempts) { if (yes(a.rapidGuess)) continue; const e = per.get(s(a.skillId)) ?? [0, 0]; e[0]++; if (yes(a.isCorrect)) e[1]++; per.set(s(a.skillId), e); }
  const worst = [...per].filter(([, e]) => e[0] >= 10).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0]).slice(0, 5).map(([id]) => id);
  const names = worst.length ? await repo.findMany("Skill", { id: { in: worst } }, { select: ["id", "name", "code"] }) : [];
  const weakestId = worst.find((id) => names.some((k) => s(k.id) === id && !isHiddenSkill(k.code)));
  const weakest = weakestId ? s(names.find((k) => s(k.id) === weakestId)?.name) : null;
  const minutes = Math.round(sessions.reduce((t, x) => t + Math.min(Number(x.activeMs ?? 0), 3 * 3_600_000), 0) / 60_000);
  const active = new Set(attempts.map((a) => s(a.studentId))).size;
  const needReview = new Set(review.map((r) => s(r.studentId))).size;
  return {
    newStars: stars.length, needReview, weakest, minutes, active, students: ids.length,
    lines: [
      `This week: ${stars.length} new stars · ${needReview} students need review · weakest class skill: ${weakest ?? "—"}`,
      `Practice: ${minutes} minutes by ${active} of ${ids.length} students.`,
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
  const startThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const rows = await repo.findMany("StudentSkillMastery", { studentId: actor.studentId, masteredAt: { gte: startLast } }, { select: ["masteredAt"] });
  const thisMonth = rows.filter((r) => time(r.masteredAt) >= startThis.getTime()).length;
  const lastMonth = rows.length - thisMonth;
  return { thisMonth, lastMonth, message: myMonthMessage(thisMonth, lastMonth), ...myMonthTemplate(thisMonth, lastMonth) };
}
