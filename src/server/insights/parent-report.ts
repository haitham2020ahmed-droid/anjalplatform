/**
 * 👪 Parent report: one student's progress in plain words (skills completed, current progress, strengths,
 * areas to practise, MAP progress if any, badges, the teacher's note). The teacher decides when to share it;
 * the parent sees it only after that. Printable / saved as PDF from the browser.
 * Sharing is a school setting per student (parentReport.<studentId>): reversible, no schema change.
 */
import type { Repo } from "../seeding/repo";
import { reconcileStatus, tiersOf } from "./student-status";
import { isHiddenSkill } from "../skills/master";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { assertClassAccess } from "../teacher/assignments";
import { mapSummaries, practiceStats, studentNames, workStats } from "./student-data";
import { statusOf } from "./progress";
import { sentPlans } from "../map/map-more";
import { studentBadges } from "../student/badges";

const s = (v: unknown) => String(v ?? "");
const key = (studentId: string) => `parentReport.${studentId}`;

export interface ShareState { shared: boolean; sharedAt: string | null; note: string | null }
export interface ParentReport {
  studentId: string; name: string; grade: number; className: string; date: string;
  summary: { en: string; ar: string };
  practice: { answers: number; accuracy: number | null; minutesMonth: number; tasksDone: number; tasksLate: number };
  completed: string[]; strengths: string[]; practiseNext: string[];
  map: { subject: string; fall: number | null; latest: number | null; latestTerm: string | null; target: number | null; status: string } [];
  badges: { icon: string; name: string }[];
  share: ShareState;
  /** the MAP plan the teacher sent (areas to practise, progress) */
  mapPlans: { id: string; subject: string; term: string; goal: number | null; items: { name: string; icon: string; skills: string[]; progress: number | null; done: boolean }[] }[];
  /** the teachers' comments on the student's work */
  comments: { body: string; author: string; date: string; about: string | null }[];
}

async function shareState(repo: Repo, schoolId: string, studentId: string): Promise<ShareState> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: key(studentId) }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { shared: Boolean(o.shared), sharedAt: o.sharedAt ? s(o.sharedAt) : null, note: o.note ? s(o.note) : null };
}

/** Who may open it: staff of the student's class (or admin), or their parent once it is shared. */
async function checkAccess(repo: Repo, actor: Actor, studentId: string): Promise<{ grade: number; className: string; schoolId: string }> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const grade = Number((st.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  if (actor.role === "PARENT") {
    if (!actor.parentChildIds?.has(studentId)) throw new ForbiddenError("Student not found.");
    if (!(await shareState(repo, s(st.schoolId), studentId)).shared) throw new ForbiddenError("The teacher has not shared this report yet.");
  } else if (actor.role === "STUDENT") {
    // a student opens their own report with the family, once the teacher shared it
    if (actor.studentId !== studentId) throw new ForbiddenError("Student not found.");
    if (!(await shareState(repo, s(st.schoolId), studentId)).shared) throw new ForbiddenError("Your teacher has not shared this report yet.");
  } else if (actor.role === "TEACHER") {
    if (!(await readableClasses(repo, actor)).some((c) => klass && c.id === klass.id)) throw new ForbiddenError("This student is not in your classes.");
  } else if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  return { grade, className: s(klass?.name), schoolId: s(st.schoolId) };
}

export async function parentReport(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<ParentReport> {
  if (actor.role !== "PARENT" && actor.role !== "STUDENT") assertCan(actor, "reports:read");
  const { grade, className, schoolId } = await checkAccess(repo, actor, studentId);
  const ids = [studentId];
  const [names, practice, work, reading, language, badges, share, tiers] = await Promise.all([
    studentNames(repo, ids), practiceStats(repo, ids, now), workStats(repo, ids, now),
    mapSummaries(repo, ids, "READING", new Map([[studentId, grade]])), mapSummaries(repo, ids, "LANGUAGE", new Map([[studentId, grade]])),
    studentBadges(repo, studentId, now), shareState(repo, schoolId, studentId), tiersOf(repo, ids),
  ]);
  // the adaptive engine's mastery (isMastered / score 0–100): the same source the teacher views use,
  // so a parent never sees "mastered" for a skill the teacher's screen shows as still developing
  const mastery = await repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "attempts", "score", "isMastered"] });
  const skills = mastery.length ? (await repo.findMany("Skill", { id: { in: mastery.map((m) => m.skillId) } }, { select: ["id", "name", "code"] })).filter((k) => !isHiddenSkill(k.code)) : [];
  const nameOf = (id: unknown) => s(skills.find((k) => k.id === id)?.name);
  const score = (m: Record<string, unknown>) => Number(m.score ?? 0);
  // the hidden “Unclassified (Curriculum Map)” skill is never shown to families (readiness I-18)
  const shown = mastery.filter((m) => skills.some((k) => k.id === m.skillId));
  const done = shown.filter((m) => Boolean(m.isMastered));
  const tried = shown.filter((m) => Number(m.attempts) >= 5);
  const strengths = [...tried].sort((a, b) => score(b) - score(a)).filter((m) => m.isMastered || score(m) >= 70).slice(0, 3).map((m) => nameOf(m.skillId));
  const practiseNext = [...tried].filter((m) => !m.isMastered && score(m) < 70).sort((a, b) => score(a) - score(b)).slice(0, 3).map((m) => nameOf(m.skillId));
  const p = practice.get(studentId)!, w = work.get(studentId)!;
  const plain = (st: string) => ({ ON_TRACK: "on track", MET: "reached the goal", AT_RISK: "needs extra practice", MISSED: "did not reach the goal yet", NO_DATA: "not enough data yet" } as Record<string, string>)[st] ?? st;
  const map = ([["Reading", reading.get(studentId)], ["Language Usage", language.get(studentId)]] as const).filter(([, m]) => m && (m.fall || m.latest)).map(([subject, m]) => ({
    subject, fall: m!.fall?.rit ?? null, latest: m!.latest && m!.latest.season !== "FALL" ? m!.latest.rit : null, latestTerm: m!.latest?.term ?? null, target: m!.springTarget, status: plain(statusOf(m!, p).status),
  }));
  // the same status as the teacher's pages (consistent with the support tier): never “good progress” in Tier 3
  const overall = reconcileStatus(statusOf(reading.get(studentId), p), tiers.get(studentId)).status;
  const first = (names.get(studentId)?.name ?? "Your child").split(" ")[0];
  const summary = overall === "AT_RISK" || overall === "MISSED"
    ? { en: `${first} is working hard. A little extra practice at home on the skills below will help a lot.`, ar: `${first} يبذل جهداً. قليل من التدريب الإضافي في البيت على المهارات أدناه سيساعده كثيراً.` }
    : p.answers < 20 ? { en: `${first} has started. Encourage 15 minutes of practice on the platform a few times a week.`, ar: `بدأ ${first} العمل. شجّعوه على التدريب 15 دقيقة على المنصة عدة مرات في الأسبوع.` }
    : { en: `${first} is making good progress. Keep encouraging daily reading at home.`, ar: `${first} يتقدّم بشكل جيد. استمروا في تشجيع القراءة اليومية في البيت.` };
  return {
    studentId, name: names.get(studentId)?.name ?? "Student", grade, className, date: now.toISOString().slice(0, 10), summary,
    practice: { answers: p.answers, accuracy: p.accuracy, minutesMonth: p.month.minutes, tasksDone: w.done, tasksLate: w.late },
    completed: done.map((m) => nameOf(m.skillId)).filter(Boolean), strengths: strengths.filter(Boolean), practiseNext: practiseNext.filter(Boolean),
    map, badges: badges.filter((b) => b.earned).map((b) => ({ icon: b.icon, name: b.name })), share,
    mapPlans: (await sentPlans(repo, studentId, now)).map((d) => ({ id: d.id, subject: d.subject === "LANGUAGE" ? "Language Usage" : "Reading", term: d.term, goal: d.profile.fall?.projection ?? null, items: d.items.map((i) => ({ name: i.name, icon: i.icon, skills: i.skills, progress: i.progress, done: i.done })) })),
    comments: (await repo.findMany("WorkComment", { studentId })).sort((a, b) => new Date(b.createdAt as string | Date).getTime() - new Date(a.createdAt as string | Date).getTime()).slice(0, 5).map((c) => ({ body: s(c.body), author: "", date: new Date(c.createdAt instanceof Date ? c.createdAt.toISOString() : s(c.createdAt)).toISOString().slice(0, 10), about: null })),
  };
}

/**
 * Share (or stop sharing) the report with the parent, with an optional note. An admin shares at once; a teacher's
 * share is sent to the school admins for approval first (👪 family reports): "PENDING" until an admin approves it.
 * Stopping is always immediate.
 */
export async function shareParentReport(repo: Repo, actor: Actor, studentId: string, shared: boolean, note: string | null, now = new Date()): Promise<"SHARED" | "PENDING" | "STOPPED"> {
  assertCan(actor, "assignments:create");
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  if (!m) throw new ValidationError("This student is not in a class.");
  await assertClassAccess(repo, actor, s(m.classId));
  if (shared && actor.role === "TEACHER") {
    const { requestShareApproval } = await import("../reports/family-reports");
    await requestShareApproval(repo, actor, { studentId, kind: "PROGRESS", note }, now);
    return "PENDING";
  }
  await setReportShared(repo, s(st.schoolId), studentId, shared, note, actor.userId, now);
  return shared ? "SHARED" : "STOPPED";
}

/** The share switch itself (after approval, or by an admin); sharing notifies the parents. */
export async function setReportShared(repo: Repo, schoolId: string, studentId: string, shared: boolean, note: string | null, by: string, now = new Date()): Promise<void> {
  const value = { shared, sharedAt: shared ? now.toISOString() : null, note: s(note).slice(0, 1000) || null, by };
  await repo.upsert("SchoolSetting", { schoolId, key: key(studentId) }, { value, updatedBy: by, updatedAt: now }, { value, updatedBy: by, updatedAt: now });
  if (shared) {
    const parents = await repo.findMany("ParentStudent", { studentId });
    const users = parents.length ? await repo.findMany("Parent", { id: { in: parents.map((p) => p.parentId) } }, { select: ["userId"] }) : [];
    for (const u of users) await repo.create("Notification", { userId: u.userId, type: "PARENT_PROGRESS", title: "📄 A new progress report", body: "Your child's teacher shared a progress report.", link: `/parent/report/${studentId}`, readAt: null, createdAt: now });
  }
}

export async function isReportShared(repo: Repo, schoolId: string, studentId: string): Promise<boolean> {
  return (await shareState(repo, schoolId, studentId)).shared;
}
