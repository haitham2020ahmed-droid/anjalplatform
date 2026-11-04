/**
 * 📊 Week in Review — three headline numbers in the style of an IXL "week in review" email, built into the app:
 * questions answered, minutes spent practising, and distinct skills practised.
 *
 * 📏 Round 4: ONE function (`weekNumbers`) for every "this week" practice number of the teacher home card, the admin
 * card and the Reports week summary (class-compare.ts weeklySummary), so they can never disagree:
 *   - the week = the Riyadh school week from Sunday 00:00 to now (student/weekly.ts weekStart);
 *   - questions / minutes = THE one definition (analytics/practice-totals.ts: skill practice + NAFS + ReadRise,
 *     ≤ 5 min per answer, the hidden holder skill out) — no longer session time;
 *   - skills = distinct shared skill KEYS practised (copies of a skill count once, the holder skill out);
 *   - with `stars`: new ⭐ this week, students with a 🔄, and the class's weakest skill by KEY from the star book
 *     (🔄 needs review first, then the lowest star score among the started skills).
 * Students are read 25 at a time and only totals are kept (512 MB server).
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { accessibleClasses } from "../teacher/assign";
import { practiceTotals } from "../analytics/practice-totals";
import { schoolOfStudents, starBook, starNeedsReview } from "../skills/star-read";
import { hiddenStarKeys } from "../teacher/queries";
import { weekStart } from "../student/weekly";
import { newStarKeys, weakKeys } from "./star-keys";

const s = (v: unknown) => String(v ?? "");
const PART = 25;

export interface WeekInReview { questions: number; minutes: number; skills: number }
export interface WeekNumbers extends WeekInReview {
  from: Date; to: Date; students: number;
  /** students who answered at least one practice question this week */
  active: number;
  /** with `stars` only (else 0 / null) */
  newStars: number; needReview: number; weakest: string | null;
}

/** This school week's numbers for these students (see the file header). */
export async function weekNumbers(repo: Repo, studentIds: readonly string[], now = new Date(), opts: { schoolId?: string | null; stars?: boolean } = {}): Promise<WeekNumbers> {
  const ids = [...new Set(studentIds.map(s).filter(Boolean))];
  const from = weekStart(now);
  const out: WeekNumbers = { from, to: now, students: ids.length, questions: 0, minutes: 0, skills: 0, active: 0, newStars: 0, needReview: 0, weakest: null };
  if (!ids.length) return out;
  const schoolId = s(opts.schoolId) || (await schoolOfStudents(repo, ids));
  // ONE read per 25 students: the totals AND the skill keys practised (practice-totals.ts, holder skill out)
  const keys = new Set<string>();
  for (let i = 0; i < ids.length; i += PART) {
    for (const tot of (await practiceTotals(repo, ids.slice(i, i + PART), from, now, { schoolId })).values()) {
      out.questions += tot.questions; out.minutes += tot.minutes; if (tot.questions) out.active++;
      for (const k of tot.skillKeys) keys.add(k);
    }
  }
  out.skills = keys.size;
  if (opts.stars) {
    const book = await starBook(repo, ids, schoolId);
    const hidden = await hiddenStarKeys(repo, book);
    out.newStars = ids.reduce((t, id) => t + newStarKeys(book, id, from, now, hidden).length, 0);
    out.needReview = ids.filter((id) => [...(book.byKey.get(id)?.values() ?? [])].some((v) => !hidden.has(v.key) && starNeedsReview(v))).length;
    out.weakest = weakKeys(book, ids, hidden)[0]?.name ?? null;
  }
  return out;
}

/** The teacher's own classes (every class they can see), this school week. */
export async function teacherWeekInReview(repo: Repo, actor: Actor, now = new Date()): Promise<WeekInReview> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return { questions: 0, minutes: 0, skills: 0 };
  const classIds = classes.map((c) => s(c.id));
  const members = await repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["studentId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const w = await weekNumbers(repo, ids, now, { schoolId: actor.schoolId });
  return { questions: w.questions, minutes: w.minutes, skills: w.skills };
}

/** The whole school, this school week (admin dashboard). */
export async function schoolWeekInReview(repo: Repo, actor: Actor, now = new Date()): Promise<WeekInReview> {
  const schoolId = actor.schoolId;
  if (!schoolId) return { questions: 0, minutes: 0, skills: 0 };
  const students = await repo.findMany("Student", { schoolId }, { select: ["id"] });
  const w = await weekNumbers(repo, students.map((x) => s(x.id)), now, { schoolId });
  return { questions: w.questions, minutes: w.minutes, skills: w.skills };
}
