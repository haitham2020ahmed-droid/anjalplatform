/**
 * 🆕 feature (Oct 2026, "عايز تقرير للـ Reviews اللي بعتها"): a class-level report of REVIEWS the teacher has sent
 * (Assignment.target === "ASSESSMENT", built via the Review Builder's or a per-Text-Set Review's ⭐ Assign — never a
 * MAP/NAFS/adaptive-skill assignment, a Curriculum Map plan place, or a My Tests test), with each Review's sent/due
 * dates, every student's NOT_STARTED/IN_PROGRESS/COMPLETED/OVERDUE status, their accuracy and how many of the
 * Review's questions they have answered so far (works even while still IN_PROGRESS), and an optional per-skill
 * breakdown scoped to that one Review.
 *
 * Deliberately SEPARATE from the Student Skills report (skills-grid.ts): that report's grid/By-source/Class-report
 * tabs deliberately EXCLUDE any assignment whose questions span more than one skill (r82, "STILL all skills" — it
 * protects per-skill accuracy), and a Review Builder send is normally multi-skill, so it never appears there by
 * design — this is not a bug to fix, it is a different question ("how did this SENT REVIEW do, as a whole and per
 * student") that the Skills Grid was never meant to answer. This module never reads SkillStatus, StudentSkillMastery
 * or any Skills Grid helper, and never writes anything the Skills Grid reads — the per-skill breakdown below is
 * computed fresh from THIS Review's own AssessmentQuestion/QuestionAttempt rows only, scoped to one assignmentId, so
 * it can never feed back into or be confused with the global per-skill mastery the Skills Grid shows.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { assertCan } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { accessibleClasses, assignmentDetail, type AssignmentDetail } from "../teacher/assign";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));

export type ReviewStatusCounts = { NOT_STARTED: number; IN_PROGRESS: number; COMPLETED: number; OVERDUE: number };

export interface ReviewReportSkill {
  skillId: string; name: string;
  /** how many of this Review's questions belong to this skill */
  questions: number;
  /** answers given so far (any student, this Review only) on this skill's questions */
  answered: number; correct: number; accuracy: number | null;
}

export interface ReviewReportRow {
  assignmentId: string; title: string; createdAt: string; dueAt: string | null; startAt: string | null;
  questions: number; counts: ReviewStatusCounts;
  /** per student: status, progress, answered/correct/accuracy on THIS Review (assignmentDetail's own computation) */
  students: AssignmentDetail["students"];
  /** this Review's own per-skill breakdown (empty when its questions carry no skill, which should not normally happen) */
  skills: ReviewReportSkill[];
}

export interface ReviewReportsView {
  classes: { id: string; name: string }[]; classId: string | null; className: string;
  reviews: ReviewReportRow[];
}

/**
 * This Review's own per-skill breakdown: each question's skill, how many of the Review's questions are that skill,
 * and how many answers / correct answers THIS Review's own QuestionAttempt rows carry for that skill so far — never
 * the global mastery the Skills Grid reads, and never written anywhere.
 */
async function reviewSkillBreakdown(repo: Repo, assignmentId: string, assessmentId: string): Promise<{ skills: ReviewReportSkill[]; questions: number }> {
  const [aq, sessions] = await Promise.all([
    repo.findMany("AssessmentQuestion", { assessmentId }, { select: ["questionId"] }),
    repo.findMany("PracticeSession", { assignmentId }, { select: ["id"] }),
  ]);
  if (!aq.length) return { skills: [], questions: 0 };
  const qIds = [...new Set(aq.map((x) => s(x.questionId)))];
  const qRows = await repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "skillId"] });
  const skillOfQ = new Map(qRows.map((q) => [s(q.id), s(q.skillId)]));
  const countOfSkill = new Map<string, number>();
  for (const q of qRows) { const sk = s(q.skillId); if (sk) countOfSkill.set(sk, (countOfSkill.get(sk) ?? 0) + 1); }
  const skillIds = [...countOfSkill.keys()];
  const questions = qIds.length;
  if (!skillIds.length) return { skills: [], questions };
  const skills = await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] });
  const nameOf = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  const sessionIds = sessions.map((x) => s(x.id));
  const attempts = sessionIds.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessionIds } }, { select: ["questionId", "isCorrect"] }) : [];
  const answeredOf = new Map<string, number>(), correctOf = new Map<string, number>();
  for (const a of attempts) {
    const sk = skillOfQ.get(s(a.questionId));
    if (!sk) continue;
    answeredOf.set(sk, (answeredOf.get(sk) ?? 0) + 1);
    if (a.isCorrect) correctOf.set(sk, (correctOf.get(sk) ?? 0) + 1);
  }
  const bySkill = skillIds.map((id) => {
    const answered = answeredOf.get(id) ?? 0, correct = correctOf.get(id) ?? 0;
    return { skillId: id, name: nameOf.get(id) ?? "Skill", questions: countOfSkill.get(id) ?? 0, answered, correct, accuracy: answered ? Math.round((100 * correct) / answered) : null };
  }).sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));
  return { skills: bySkill, questions };
}

/**
 * Every sent Review of this class (any teacher of the class — a class-level report, not "mine only"), newest first,
 * each with its own status counts, per-student progress/accuracy and per-skill breakdown. `classId` chooses the
 * class (default: the actor's first accessible one, same convention as Class progress's class picker).
 */
export async function reviewReports(repo: Repo, actor: Actor, classId?: string | null, now = new Date()): Promise<ReviewReportsView> {
  assertCan(actor, "reports:read");
  const classes = (await accessibleClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const chosen = classId && classes.some((c) => c.id === classId) ? classId : classes[0]?.id ?? null;
  if (!chosen) return { classes, classId: null, className: "", reviews: [] };
  const klass = await assertClassAccess(repo, actor, chosen);
  // Reviews only: a question-set Assignment (target ASSESSMENT) that is neither a My Tests test (testId) nor a
  // Curriculum Map plan place (curriculumPlanId) — same exclusion sentReviewAssignmentsForClass already uses, so
  // the two stay in lockstep on "what counts as a Review".
  const rows = (await repo.findMany("Assignment", { classId: chosen, target: "ASSESSMENT", testId: null, curriculumPlanId: null, deletedAt: null }, { select: ["id", "title", "createdAt", "dueAt", "startAt", "assessmentId"] }))
    .sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0));
  const reviews: ReviewReportRow[] = [];
  for (const r of rows) {
    const assignmentId = s(r.id);
    const [detail, breakdown] = await Promise.all([
      assignmentDetail(repo, actor, assignmentId, now),
      reviewSkillBreakdown(repo, assignmentId, s(r.assessmentId)),
    ]);
    const counts: ReviewStatusCounts = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, OVERDUE: 0 };
    for (const st of detail.students) counts[st.status]++;
    reviews.push({
      assignmentId, title: s(r.title), createdAt: d(r.createdAt)!.toISOString(), dueAt: d(r.dueAt)?.toISOString() ?? null, startAt: d(r.startAt)?.toISOString() ?? null,
      questions: breakdown.questions, counts, students: detail.students, skills: breakdown.skills,
    });
  }
  return { classes, classId: chosen, className: s(klass.name), reviews };
}
