/**
 * 👥 Internal admin report: NAFS practice vs. the platform's motivational features (ReadRise, games), per student,
 * over a recent window. Prompted by a pedagogical review: NAFS practice is explicit exam-pattern drilling, and if
 * teachers over-assign it relative to ReadRise and games a student could experience the platform as "endless test
 * prep" instead of the adaptive, game-ified learning it is meant to be. This report gives a department a number to
 * watch and a target ratio to hold teachers to, rather than a feeling.
 *
 * WHAT IS ACTUALLY MEASURABLE (no schema change was made — this reads only columns that already exist):
 *   NAFS      NafsPracticeRun.seconds — real time spent, tracked by the NAFS engine itself (src/server/nafs/
 *             practice.ts). Summed per student → real minutes.
 *   ReadRise  RRRun.readSeconds — real time spent reading the article (not the quiz/write steps, which are
 *             untimed). Summed per student → real minutes. A run with readSeconds still null (not finished
 *             reading) contributes 0.
 *   Games     GamePlay has NO time or duration column at all (only correct/incorrect/points counts) — Live
 *             Challenge answers (LiveGameAnswer.ms) are timed, but most play is solo and untimed. There is no
 *             honest way to turn this into minutes from the existing schema. We report it as a separate, clearly
 *             labelled PROXY — "questions answered" (correct+incorrect) — and never add it into a minutes total.
 * Badges and streaks (src/server/student/badges.ts, streak.ts) are not practice sessions at all (no duration of
 * any kind), so they are out of scope for a minutes ratio and are left out of this report entirely.
 *
 * The ratio this report watches is therefore NAFS minutes vs. (NAFS + ReadRise) minutes — the two activities the
 * schema can time honestly. Games are shown alongside as a volume signal, not folded into the percentage.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { DAY, findIn, s, time } from "../reports/report-access";

/** At most this many classes are scanned (a bounded, occasional admin report — never run on every page load). */
export const MAX_CLASSES = 80;
/** The report's default look-back window, matching the 30-day window other school-wide reports use (e.g. the
 *  department page's "hardest skills (last 30 days)", classGamesReport's default). */
export const DEFAULT_DAYS = 30;
/** NAFS share of (NAFS + ReadRise) minutes above this is flagged — informational, not an alarm. Chosen so a
 *  student whose timed practice is overwhelmingly exam drilling (more than two thirds) stands out, while a
 *  student who does some of both does not. */
export const NAFS_SHARE_FLAG = 0.7;
/** Below this many combined timed minutes, the share is too noisy to flag (a single short NAFS session would
 *  otherwise show "100% NAFS" and mean nothing). */
export const MIN_FLAG_MINUTES = 10;

export interface PracticeBalanceStudentRow {
  studentId: string; name: string;
  nafsMinutes: number; readriseMinutes: number;
  /** Proxy only (see file header): questions answered in games, no time data exists for this. */
  gameAnswers: number;
  /** NAFS minutes as a share of (NAFS + ReadRise) minutes, 0-100; null when both are 0. */
  nafsSharePct: number | null;
  flagged: boolean;
}
export interface PracticeBalanceClassRow {
  classId: string; className: string; teacherName: string; grade: number;
  students: PracticeBalanceStudentRow[];
  totals: { nafsMinutes: number; readriseMinutes: number; gameAnswers: number; flagged: number };
}
export interface PracticeBalanceReport {
  days: number; threshold: number; minMinutes: number;
  classes: PracticeBalanceClassRow[];
  schoolTotals: { students: number; nafsMinutes: number; readriseMinutes: number; gameAnswers: number; flagged: number };
}

async function teacherNamesOf(repo: Repo, classIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!classIds.length) return out;
  const cts = await findIn(repo, "ClassTeacher", "classId", classIds, {}, ["classId", "teacherId"]);
  if (!cts.length) return out;
  const teacherRows = await findIn(repo, "Teacher", "id", [...new Set(cts.map((c) => s(c.teacherId)))], {}, ["id", "userId"]);
  const users = teacherRows.length ? await findIn(repo, "User", "id", teacherRows.map((t) => s(t.userId)), {}, ["id", "displayName"]) : [];
  const userIdOfTeacher = new Map(teacherRows.map((t) => [s(t.id), s(t.userId)]));
  const nameOfUser = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  for (const classId of classIds) {
    const names = cts.filter((c) => s(c.classId) === classId).map((c) => nameOfUser.get(userIdOfTeacher.get(s(c.teacherId)) ?? "") ?? "").filter(Boolean);
    out.set(classId, [...new Set(names)].join(", ") || "—");
  }
  return out;
}

/**
 * NAFS vs. ReadRise/games practice volume, per student, per class, over the last `opts.days` days (default 30).
 * School-wide (admin only — it reads across every teacher's classes).
 */
export async function practiceBalance(repo: Repo, actor: Actor, opts: { days?: number; now?: Date } = {}): Promise<PracticeBalanceReport> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins see the school-wide practice balance.");
  const days = opts.days && opts.days > 0 ? opts.days : DEFAULT_DAYS;
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - days * DAY);

  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt).slice(0, MAX_CLASSES);
  const classIds = classes.map((c) => s(c.id));
  const schoolTotals = { students: 0, nafsMinutes: 0, readriseMinutes: 0, gameAnswers: 0, flagged: 0 };
  if (!classes.length) return { days, threshold: NAFS_SHARE_FLAG, minMinutes: MIN_FLAG_MINUTES, classes: [], schoolTotals };

  const [teacherOf, members, gradeRows] = await Promise.all([
    teacherNamesOf(repo, classIds),
    findIn(repo, "ClassMembership", "classId", classIds, { leftAt: null }, ["classId", "studentId"]),
    repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }),
  ]);
  const gradeOf = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const studentIds = [...new Set(members.map((m) => s(m.studentId)))];
  const names = await studentNames(repo, studentIds);

  const [nafsRuns, rrRuns, plays] = await Promise.all([
    studentIds.length ? findIn(repo, "NafsPracticeRun", "studentId", studentIds, {}, ["studentId", "seconds", "startedAt"]) : Promise.resolve([] as Row[]),
    studentIds.length ? findIn(repo, "RRRun", "studentId", studentIds, {}, ["studentId", "readSeconds", "startedAt"]) : Promise.resolve([] as Row[]),
    studentIds.length ? findIn(repo, "GamePlay", "studentId", studentIds, {}, ["studentId", "correct", "incorrect", "createdAt"]) : Promise.resolve([] as Row[]),
  ]);

  const nafsSeconds = new Map<string, number>();
  for (const r of nafsRuns) { if (time(r.startedAt) < from.getTime()) continue; const id = s(r.studentId); nafsSeconds.set(id, (nafsSeconds.get(id) ?? 0) + Number(r.seconds ?? 0)); }
  const rrSeconds = new Map<string, number>();
  for (const r of rrRuns) { if (time(r.startedAt) < from.getTime()) continue; const id = s(r.studentId); rrSeconds.set(id, (rrSeconds.get(id) ?? 0) + Number(r.readSeconds ?? 0)); }
  const gameAnswers = new Map<string, number>();
  for (const p of plays) { if (time(p.createdAt) < from.getTime()) continue; const id = s(p.studentId); gameAnswers.set(id, (gameAnswers.get(id) ?? 0) + Number(p.correct ?? 0) + Number(p.incorrect ?? 0)); }

  const classRows: PracticeBalanceClassRow[] = classes.map((c) => {
    const classId = s(c.id);
    const classStudentIds = [...new Set(members.filter((m) => s(m.classId) === classId).map((m) => s(m.studentId)))];
    const students: PracticeBalanceStudentRow[] = classStudentIds.map((id) => {
      const nafsMinutes = Math.round((nafsSeconds.get(id) ?? 0) / 60);
      const readriseMinutes = Math.round((rrSeconds.get(id) ?? 0) / 60);
      const total = nafsMinutes + readriseMinutes;
      const nafsSharePct = total > 0 ? Math.round((100 * nafsMinutes) / total) : null;
      const flagged = total >= MIN_FLAG_MINUTES && nafsSharePct !== null && nafsSharePct / 100 > NAFS_SHARE_FLAG;
      return { studentId: id, name: names.get(id)?.name ?? "Student", nafsMinutes, readriseMinutes, gameAnswers: gameAnswers.get(id) ?? 0, nafsSharePct, flagged };
    }).sort((a, b) => b.nafsMinutes + b.readriseMinutes - (a.nafsMinutes + a.readriseMinutes) || a.name.localeCompare(b.name));
    const totals = students.reduce((t, st) => ({ nafsMinutes: t.nafsMinutes + st.nafsMinutes, readriseMinutes: t.readriseMinutes + st.readriseMinutes, gameAnswers: t.gameAnswers + st.gameAnswers, flagged: t.flagged + (st.flagged ? 1 : 0) }),
      { nafsMinutes: 0, readriseMinutes: 0, gameAnswers: 0, flagged: 0 });
    schoolTotals.students += students.length; schoolTotals.nafsMinutes += totals.nafsMinutes; schoolTotals.readriseMinutes += totals.readriseMinutes; schoolTotals.gameAnswers += totals.gameAnswers; schoolTotals.flagged += totals.flagged;
    return { classId, className: s(c.name), teacherName: teacherOf.get(classId) ?? "—", grade: gradeOf.get(s(c.gradeId)) ?? 0, students, totals };
  }).filter((c) => c.students.length).sort((a, b) => b.totals.flagged - a.totals.flagged || a.grade - b.grade || a.className.localeCompare(b.className));

  return { days, threshold: NAFS_SHARE_FLAG, minMinutes: MIN_FLAG_MINUTES, classes: classRows, schoolTotals };
}
