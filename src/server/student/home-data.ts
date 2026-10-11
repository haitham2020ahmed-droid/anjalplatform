/**
 * ⚡ Student home (“My work”) data in two round trips (Update 42B). Before: seven waves one after another.
 *   1. the assigned work (it also brings this student's assignment statuses up to date) and the student row
 *   2. everything else at once — none of it depends on another part, only on the statuses from step 1
 * Same functions and same results as before; only the waiting is shorter.
 */
import type { Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { latestDiagnostic } from "../assessment/diagnostic";
import { assignedSkills, placementRequired } from "./assigned";
import { readingLexile } from "../readmaster/service";
import { studentSkillPlans, todaysPlanStep } from "../curriculum-map/plans";
import { reviewDue, weekStats } from "./weekly";
import { myDiagnostic } from "../diagnostic/test";
import { weeklyCheck } from "./weekly-check";
import { streakAndPoints } from "./streak";
import { openGamesFor } from "../game/live";
import { lexileBands } from "../curriculum-map/lexile";
import { studentRespondWork } from "../curriculum-map/respond-assign";
import { studentBadges } from "./badges";
import { dueMistakes, myExitTicket, studentWeek } from "../teacher/classroom";
import { myTests } from "../map/sim";
import { classChallenge, questionOfTheDay } from "../teacher/extras";
import { myTasks } from "../teacher/writing";
import { nextStep } from "./next-step";
import { studentReadRiseSummary } from "../readrise/engine";
import { coachSummary } from "../fluency/coach";

export async function studentHomeData(repo: Repo, actor: Actor) {
  const sid = actor.studentId!;
  const [view, required, diagnostic, lexile, maps, student] = await Promise.all([
    assignedSkills(repo, actor), placementRequired(repo, actor.schoolId!), latestDiagnostic(repo, sid),
    readingLexile(repo, sid), repo.findMany("MapResult", { studentId: sid }), repo.findUnique("Student", { id: sid }),
  ]);
  // asked by the page and by the next step: one request each, shared
  const diagP = myDiagnostic(repo, actor), checkP = weeklyCheck(repo, actor), planP = todaysPlanStep(repo, actor);
  const [gradeRow, bands, plans, streak, games, respond, badges, week, exitTicket, review, comments, tests, qotd, challenge, writing, today, myWeek, spaced, diag, check, coach, step, readRise, classes] = await Promise.all([
    student?.gradeId ? repo.findUnique("Grade", { id: student.gradeId }) : Promise.resolve(null as Row | null),
    lexileBands(repo, actor.schoolId ?? null), studentSkillPlans(repo, actor), streakAndPoints(repo, sid), openGamesFor(repo, actor), studentRespondWork(repo, actor), studentBadges(repo, sid),
    studentWeek(repo, actor), myExitTicket(repo, actor), dueMistakes(repo, sid), repo.findMany("WorkComment", { studentId: sid }, { select: ["createdAt"] }), myTests(repo, actor),
    questionOfTheDay(repo, actor), student?.gradeId ? classChallenge(repo, String(student.schoolId), String(student.gradeId)) : Promise.resolve([] as Awaited<ReturnType<typeof classChallenge>>), myTasks(repo, actor),
    planP, weekStats(repo, sid), reviewDue(repo, sid), diagP, checkP, coachSummary(repo, sid),
    nextStep(repo, actor, new Date(), { diag: diagP, check: checkP, plan: planP }), studentReadRiseSummary(repo, sid),
    repo.findMany("ClassMembership", { studentId: sid, leftAt: null }, { select: ["classId"] }),
  ]);
  return { view, required, diagnostic, lexile, maps, student, gradeRow, bands, plans, streak, games, respond, badges, week, exitTicket, review, comments, tests, qotd, challenge, writing, today, myWeek, spaced, diag, check, coach, step, readRise, myClass: classes[0]?.classId };
}
