/**
 * 🗂️ The student's complete file — everything about one student in one place, for the head of department (every
 * student of the school) and for the student's own teachers (their classes): who they are, practice and work, skills,
 * MAP (results, plans, practice test), writing and recordings, words, badges, alerts and what was done, comments,
 * private notes, sign-ins. Read only. Plus a search over the whole school.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { levelsOf, practiceStats, studentNames, workStats, type PracticeStats, type WorkStats } from "./student-data";
import { mapProfiles, type MapProfile } from "../map/map-plan";
import { sentPlans, type PlanDoc } from "../map/map-more";
import { commentsFor, dueMistakes, type CommentView } from "../teacher/classroom";
import { notesFor } from "../teacher/extras";
import { studentBadges } from "../student/badges";
import { isReportShared } from "./parent-report";
import { ALERT_INFO, type AlertKind } from "./alerts";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const iso = (v: unknown) => (v ? new Date(time(v)).toISOString() : null);
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/** The classes whose students this person may open (admin: every class of the school). */
async function allowedStudents(repo: Repo, actor: Actor): Promise<{ classIds: string[]; all: boolean }> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  if (isAdmin(actor)) return { classIds: [], all: true };
  return { classIds: (await readableClasses(repo, actor)).map((c) => s(c.id)), all: false };
}

export interface FoundStudent { id: string; name: string; number: string; username: string; grade: number; className: string }

/** Find students by name, student ID or username (at most 40). */
export async function searchStudents(repo: Repo, actor: Actor, q: string): Promise<FoundStudent[]> {
  const scope = await allowedStudents(repo, actor);
  const term = s(q).trim().toLowerCase();
  if (term.length < 2) return [];
  const students = await repo.findMany("Student", { schoolId: actor.schoolId }, { select: ["id", "userId", "studentNumber", "gradeId"] });
  const users = await repo.findMany("User", { schoolId: actor.schoolId, role: "STUDENT" }, { select: ["id", "displayName", "username"] });
  const mem = await repo.findMany("ClassMembership", { leftAt: null, ...(scope.all ? {} : { classId: { in: scope.classIds } }) }, { select: ["studentId", "classId"] });
  const classes = await repo.findMany("Class", { schoolId: actor.schoolId }, { select: ["id", "name"] });
  const grades = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] });
  const inScope = new Set(mem.map((m) => s(m.studentId)));
  const out: FoundStudent[] = [];
  for (const st of students) {
    if (!scope.all && !inScope.has(s(st.id))) continue;
    const u = users.find((x) => x.id === st.userId);
    const hay = `${s(u?.displayName)} ${s(st.studentNumber)} ${s(u?.username)}`.toLowerCase();
    if (!term.split(/\s+/).every((w) => hay.includes(w))) continue;
    out.push({ id: s(st.id), name: s(u?.displayName), number: s(st.studentNumber), username: s(u?.username), grade: Number(grades.find((g) => g.id === st.gradeId)?.level ?? 0), className: s(classes.find((c) => c.id === mem.find((m) => m.studentId === st.id)?.classId)?.name) });
    if (out.length >= 40) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface StudentFile {
  id: string; name: string; number: string; username: string; grade: number; className: string; classId: string | null; teachers: string[];
  lastLogin: string | null; signIns30: number; level: string | null; reportShared: boolean;
  practice: PracticeStats; work: WorkStats; streakDays: number;
  skills: { strong: { name: string; pct: number; answers: number }[]; weak: { name: string; pct: number; answers: number }[]; mastered: number; started: number };
  map: MapProfile[]; plans: PlanDoc[]; draftPlans: number;
  tests: { title: string; subject: string; status: string; rit: number | null; low: number | null; high: number | null; answered: number; total: number; rapid: number; when: string | null }[];
  writing: { taskId: string; title: string; kind: string; status: string; total: number | null; max: number; hasAudio: boolean; when: string | null }[];
  words: { count: number; recent: string[] }; review: { due: number; learned: number };
  badges: { icon: string; name: string; earnedAt: string | null }[];
  alerts: { title: string; icon: string; detail: string; status: string; action: string | null; date: string }[];
  comments: CommentView[]; notes: { body: string; author: string; date: string }[];
  work10: { title: string; status: string; progress: number; dueAt: string | null; href: string }[];
  exitTickets: { title: string; score: number; total: number; date: string }[];
}

export async function studentFile(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<StudentFile> {
  const scope = await allowedStudents(repo, actor);
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const mem = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }))[0];
  if (!scope.all && !scope.classIds.includes(s(mem?.classId))) throw new ForbiddenError("Not your student.");
  const [user, klass, grade] = await Promise.all([repo.findUnique("User", { id: st.userId }), mem ? repo.findUnique("Class", { id: mem.classId }) : null, st.gradeId ? repo.findUnique("Grade", { id: st.gradeId }) : null]);
  const links = mem ? await repo.findMany("ClassTeacher", { classId: mem.classId }) : [];
  const tRows = links.length ? await repo.findMany("Teacher", { id: { in: links.map((l) => l.teacherId) } }, { select: ["userId"] }) : [];
  const tUsers = tRows.length ? await repo.findMany("User", { id: { in: tRows.map((t) => t.userId) } }, { select: ["displayName"] }) : [];
  const ids = [studentId];
  const [practice, work, levels, reading, language, plans, draftPlans, sims, subs, wordsRows, review, badges, alerts, comments, notes, logins, asgRows, exitAns, mastery, shared] = await Promise.all([
    practiceStats(repo, ids, now), workStats(repo, ids, now), levelsOf(repo, ids),
    mapProfiles(repo, actor.schoolId!, ids, "READING"), mapProfiles(repo, actor.schoolId!, ids, "LANGUAGE"),
    sentPlans(repo, studentId, now), repo.count("MapPlan", { studentId, status: "DRAFT" }),
    repo.findMany("MapSimSession", { studentId, kind: "SIM" }),
    repo.findMany("WritingSubmission", { studentId }, { select: ["taskId", "status", "scores", "audioType", "submittedAt"] }),
    repo.findMany("StudentWord", { studentId }, { select: ["word", "lastAt"] }), dueMistakes(repo, studentId, now),
    studentBadges(repo, studentId, now), repo.findMany("StudentAlert", { studentId }),
    commentsFor(repo, actor, studentId), notesFor(repo, actor, studentId),
    repo.findMany("AuditLog", { actorId: st.userId, action: "auth.login.success", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, { select: ["id"] }),
    repo.findMany("AssignmentStudent", { studentId }), repo.findMany("ExitTicketAnswer", { studentId }),
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "attempts", "correct", "isMastered"] }),
    isReportShared(repo, s(actor.schoolId), studentId),
  ]);
  const windows = sims.length ? await repo.findMany("MapSimWindow", { id: { in: [...new Set(sims.map((x) => s(x.windowId)).filter(Boolean))] } }, { select: ["id", "title"] }) : [];
  const tasks = subs.length ? await repo.findMany("WritingTask", { id: { in: subs.map((x) => x.taskId) } }, { select: ["id", "title", "kind"] }) : [];
  const asg = asgRows.length ? await repo.findMany("Assignment", { id: { in: asgRows.map((a) => a.assignmentId) }, deletedAt: null }, { select: ["id", "title", "dueAt", "createdAt"] }) : [];
  const tickets = exitAns.length ? await repo.findMany("ExitTicket", { id: { in: [...new Set(exitAns.map((a) => s(a.ticketId)))] } }, { select: ["id", "title", "createdAt"] }) : [];
  const skills = mastery.length ? await repo.findMany("Skill", { id: { in: mastery.map((m) => m.skillId) } }, { select: ["id", "name"] }) : [];
  const tried = mastery.filter((m) => Number(m.attempts) >= 5).map((m) => ({ name: s(skills.find((k) => k.id === m.skillId)?.name), pct: Math.round((100 * Number(m.correct)) / Number(m.attempts)), answers: Number(m.attempts) }));
  const lv = levels.get(studentId);
  return {
    id: studentId, name: s(user?.displayName), number: s(st.studentNumber), username: s(user?.username), grade: Number(grade?.level ?? 0), className: s(klass?.name), classId: klass ? s(klass.id) : null, teachers: tUsers.map((u) => s(u.displayName)),
    lastLogin: iso(user?.lastLoginAt), signIns30: logins.length, level: lv?.level ?? null, reportShared: shared,
    practice: practice.get(studentId)!, work: work.get(studentId)!, streakDays: 0,
    skills: { strong: [...tried].sort((a, b) => b.pct - a.pct).filter((x) => x.pct >= 70).slice(0, 5), weak: [...tried].sort((a, b) => a.pct - b.pct).filter((x) => x.pct < 60).slice(0, 5), mastered: mastery.filter((m) => m.isMastered).length, started: mastery.length },
    map: [reading.get(studentId)!, language.get(studentId)!].filter((p) => p.term), plans, draftPlans,
    tests: sims.sort((a, b) => time(b.startedAt) - time(a.startedAt)).map((x) => ({ title: s(windows.find((w) => w.id === x.windowId)?.title) || "MAP practice test", subject: s(x.subject), status: s(x.status), rit: x.resultRit === null || x.resultRit === undefined ? null : Number(x.resultRit), low: x.resultLow === null || x.resultLow === undefined ? null : Number(x.resultLow), high: x.resultHigh === null || x.resultHigh === undefined ? null : Number(x.resultHigh), answered: Number(x.answered), total: Number(x.total), rapid: Number(x.rapid), when: iso(x.finishedAt ?? x.startedAt) })),
    writing: subs.map((x) => { const t = tasks.find((y) => y.id === x.taskId); const sc = x.scores ? (typeof x.scores === "string" ? JSON.parse(x.scores) : x.scores) as Record<string, number> : null; const kind = s(t?.kind); return { taskId: s(x.taskId), title: s(t?.title), kind, status: s(x.status), total: sc ? Object.values(sc).reduce((a, b) => a + Number(b), 0) : null, max: kind === "READ_ALOUD" ? 12 : 16, hasAudio: Boolean(x.audioType), when: iso(x.submittedAt) }; }),
    words: { count: wordsRows.length, recent: wordsRows.sort((a, b) => time(b.lastAt) - time(a.lastAt)).slice(0, 12).map((w) => s(w.word)) },
    review: { due: review.due.length, learned: review.learned },
    badges: badges.filter((b) => b.earned).map((b) => ({ icon: b.icon, name: b.name, earnedAt: b.earnedAt })),
    alerts: alerts.sort((a, b) => time(b.createdAt) - time(a.createdAt)).map((a) => { const info = ALERT_INFO[s(a.kind) as AlertKind]; return { title: info?.title ?? s(a.kind), icon: info?.icon ?? "•", detail: s(a.detail), status: s(a.status), action: a.action ? s(a.action) : null, date: iso(a.createdAt)!.slice(0, 10) }; }),
    comments, notes: notes.map((n) => ({ body: n.body, author: n.author, date: n.date })),
    work10: asg.sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 10).map((a) => { const r = asgRows.find((x) => x.assignmentId === a.id)!; return { title: s(a.title), status: s(r.status), progress: Math.round(Number(r.progress) * 100), dueAt: iso(a.dueAt), href: `/teacher/assignments/${s(a.id)}` }; }),
    exitTickets: tickets.sort((a, b) => time(b.createdAt) - time(a.createdAt)).map((t) => { const mine = exitAns.filter((x) => x.ticketId === t.id); return { title: s(t.title), score: mine.filter((x) => x.isCorrect).length, total: mine.length, date: iso(t.createdAt)!.slice(0, 10) }; }),
  };
}

/** For “see it as the student does”: the student's own actor (read only use). The caller must have opened the file. */
export async function studentActorFor(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  await studentFile(repo, actor, studentId);   // the same access check
  const st = await repo.findUnique("Student", { id: studentId });
  const u = await repo.findUnique("User", { id: st!.userId });
  if (!u) throw new ForbiddenError("Student not found.");
  return u;
}

export { studentNames };
