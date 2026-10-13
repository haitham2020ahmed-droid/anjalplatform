/**
 * 👀 "Preview as student" for everything a teacher sends to students.
 *
 * The preview is the student's OWN page (the same component, the same format, the same "no level words" rules), shown
 * to the teacher with a chosen student's data: the student page is opened with `?preview=<studentId>`
 * (src/server/auth/student-page.ts) and wrapped in a read-only frame with a Download button
 * (src/components/student/preview-frame.tsx). The frame is inert, and every Server Action of a student page needs a
 * signed-in STUDENT, so a preview can never answer, submit or record an attempt.
 *
 * A test before it is assigned (no student yet) is previewed in the quiz player itself, in preview mode
 * (/teacher/preview?test=…); an assigned test with the chosen student's own version and order
 * (/teacher/preview?assigned=<testId>&as=<studentId>, assignedTestPreview).
 *
 * Access: staff only; a teacher only for students of their own classes (bounded reads: the classes, then the
 * memberships of the one student).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { resolveActor } from "../auth/actor";
import { accessibleClasses } from "../teacher/assign";
import { hideLevels } from "../../lib/hide-levels";
import { loadQuestionItems, toClientQuestion, type ClientQuestion } from "../practice/items";
import { choiceSeed, shuffleChoices, testOrder } from "../tests/runtime";

const s = (v: unknown) => String(v ?? "");
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

export interface PreviewStudent { actor: Actor; studentId: string; name: string }

/** The student as an actor for a read-only preview (the teacher's own classes only; the admin: the school). */
export async function previewStudentFor(repo: Repo, actor: Actor, studentId: string): Promise<PreviewStudent> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Only teachers can preview as a student.");
  const st = await repo.findUnique("Student", { id: s(studentId) });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  if (actor.role === "TEACHER") {
    const mine = new Set((await accessibleClasses(repo, actor)).map((c) => s(c.id)));
    const member = (await repo.findMany("ClassMembership", { studentId: st.id, leftAt: null }, { select: ["classId"], take: 50 })).some((m) => mine.has(s(m.classId)));
    if (!member) throw new ForbiddenError("You can preview only the students of your own classes.");
  }
  const user = await repo.findUnique("User", { id: st.userId });
  if (!user || user.deletedAt) throw new ForbiddenError("Student not found.");
  return { actor: await resolveActor(repo, user), studentId: s(st.id), name: s(user.displayName) || "Student" };
}

// ------------------------------------------------------------------ every teacher → student item and its preview

export interface PreviewItem {
  key: string; icon: string; label: string;
  /** the student's page (the same file renders the preview) */
  page: string;
  /** the student component the page draws */
  component: string;
  /** the preview address for one student */
  href: (studentId: string) => string;
}

/**
 * The places where something a teacher makes or triggers reaches a student. Item pages that need an id (one plan,
 * one exit ticket, one writing task, one test review) are linked from the teacher's own page of that item with the
 * same `?preview=` address; the list here is the student's view of each kind.
 */
export const PREVIEW_ITEMS: readonly PreviewItem[] = [
  { key: "tests", icon: "📝", label: "My Tests (tests and quizzes)", page: "src/app/student/tests/page.tsx", component: "SourceTag", href: (sid) => `/student/tests?preview=${sid}` },
  { key: "plans", icon: "🗂️", label: "My study plan (skill, curriculum and NAFS plans)", page: "src/app/student/curriculum/page.tsx", component: "StudyPlan", href: (sid) => `/student/curriculum?preview=${sid}` },
  { key: "progress", icon: "📊", label: "My Reports: my progress", page: "src/app/student/reports/page.tsx", component: "ProgressView", href: (sid) => `/student/reports?view=progress&preview=${sid}` },
  { key: "family", icon: "👪", label: "My Reports: for my family (family reports)", page: "src/app/student/reports/page.tsx", component: "FamilyView", href: (sid) => `/student/reports?view=family&preview=${sid}` },
  { key: "teacher-report", icon: "📄", label: "Report from my teacher", page: "src/app/student/family/teacher-report/page.tsx", component: "ParentReportView", href: (sid) => `/student/family/teacher-report?preview=${sid}` },
  { key: "diagnostic", icon: "🩺", label: "My Diagnostic report", page: "src/app/student/family/diagnostic/page.tsx", component: "StudentDiagnosticView", href: (sid) => `/student/family/diagnostic?preview=${sid}` },
  { key: "nafs", icon: "🇸🇦", label: "NAFS: practice, tests and results", page: "src/app/student/nafs/page.tsx", component: "NAFS", href: (sid) => `/student/nafs?part=results&preview=${sid}` },
  { key: "map", icon: "🗺️", label: "My MAP (results and MAP plan)", page: "src/app/student/map/page.tsx", component: "MapDashboard", href: (sid) => `/student/map?preview=${sid}` },
  { key: "comments", icon: "💬", label: "Comments from my teachers", page: "src/app/student/comments/page.tsx", component: "Comments", href: (sid) => `/student/comments?preview=${sid}` },
  { key: "writing", icon: "✍️", label: "Writing tasks and feedback", page: "src/app/student/writing/page.tsx", component: "Writing", href: (sid) => `/student/writing?preview=${sid}` },
] as const;

/** Per item (one record): the student page of that record, previewed for one student. */
export const ITEM_PREVIEW = {
  plan: (planId: string, sid: string) => `/student/plans/${encodeURIComponent(planId)}?preview=${sid}`,
  exit: (ticketId: string, sid: string) => `/student/exit/${encodeURIComponent(ticketId)}?preview=${sid}`,
  writing: (taskId: string, sid: string) => `/student/writing/${encodeURIComponent(taskId)}?preview=${sid}`,
  testReview: (assignmentId: string, sid: string) => `/student/tests/${encodeURIComponent(assignmentId)}?preview=${sid}`,
  test: (testId: string, sid: string) => `/teacher/preview?assigned=${encodeURIComponent(testId)}&as=${sid}`,
} as const;

// ------------------------------------------------------------------ an assigned test, as one student gets it

export interface AssignedTestPreview { testId: string; title: string; studentId: string; studentName: string; timeLimitMin: number | null; questions: ClientQuestion[]; students: { id: string; name: string }[] }

/**
 * The test exactly as `studentId` gets it: their version (their level group's set), in their order (shuffle) with their
 * answer-choice order. Reads only (nothing is started, answered or recorded).
 */
export async function assignedTestPreview(repo: Repo, actor: Actor, testId: string, studentId?: string | null): Promise<AssignedTestPreview> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Only teachers can preview as a student.");
  const t = await repo.findUnique("TeacherTest", { id: s(testId) });
  if (!t || t.deletedAt || s(t.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Test not found.");
  const sets = await repo.findMany("Assignment", { testId: t.id, deletedAt: null }, { select: ["id", "assessmentId", "shuffle", "classId"] });
  if (actor.role === "TEACHER" && sets[0]) {
    const mine = new Set((await accessibleClasses(repo, actor)).map((c) => s(c.id)));
    if (!mine.has(s(t.classId))) throw new ForbiddenError("Test not found.");
  }
  const rows: Row[] = sets.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: sets.map((a) => s(a.id)) } }, { select: ["assignmentId", "studentId"] }) : [];
  const ids = [...new Set(rows.map((r) => s(r.studentId)))];
  const st = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(st.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName) || "Student"]));
  const students = ids.map((id) => ({ id, name: nameOf.get(id)! })).sort((a, b) => a.name.localeCompare(b.name));
  if (!students.length) throw new ValidationError("This test has no students yet.");
  const who = students.find((x) => x.id === s(studentId)) ?? students[0];
  const a = sets.find((x) => rows.some((r) => s(r.assignmentId) === s(x.id) && s(r.studentId) === who.id))!;
  const aqs = await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId }, { select: ["questionId", "order"] });
  const order = testOrder(a, aqs.sort((x, y) => Number(x.order) - Number(y.order)).map((x) => s(x.questionId)), who.id);
  const items = new Map((await loadQuestionItems(repo, order)).map((i) => [i.questionId, i]));
  const questions = order.flatMap((qid) => {
    const it = items.get(qid);
    if (!it) return [];
    const q = toClientQuestion(it, `preview:${s(a.id)}:${who.id}:${qid}`);
    return [a.shuffle ? shuffleChoices(q, choiceSeed(a, who.id, qid)) : q];
  });
  return { testId: s(t.id), title: hideLevels(s(t.title)), studentId: who.id, studentName: who.name, timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null, questions, students };
}
