/**
 * Update 20 — smaller tools that save teachers and the head of department time:
 *   🔒 private notes on a student · 💬 a bank of quick comments · 📋 copy an assignment to another class ·
 *   🗓️ the week calendar · ☀️ question of the day · 🏁 the class challenge · 📈 MAP growth report ·
 *   👀 class visit (read only) · 🔑 sign-ins · 💾 backup to Excel · 🩺 error log · 👪 share all parent reports.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { sourceOfAssignment } from "../../lib/assign-source";
import { audit } from "../audit";
import { assertClassAccess } from "./assignments";
import { assertClassRead, readableClasses } from "./coordinators";
import { assignQuestions, assignSkill } from "./assign";
import { classMembers, studentNames } from "../insights/student-data";
import { type Subject } from "../map/map-plan";
import { expectedNow } from "../map/sim";
import { seasonOf } from "../map/rit";
import { shareParentReport } from "../insights/parent-report";
import { weekStart } from "./classroom";
import { cycleCalendarEvents } from "../assessment-cycle/status";
import { schemaGap, SCHEMA_FIX } from "../db/schema-errors";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const iso = (v: unknown) => (v ? new Date(time(v)).toISOString() : null);
const DAY = 86_400_000;
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

async function studentClassFor(repo: Repo, actor: Actor, studentId: string, write: boolean): Promise<Row> {
  const ms = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  for (const m of ms) { try { return write ? await assertClassAccess(repo, actor, s(m.classId)) : await assertClassRead(repo, actor, s(m.classId)); } catch { /* next */ } }
  throw new ForbiddenError("Not your student.");
}

// ------------------------------------------------------------------ 🔒 private notes (staff only)

export async function addNote(repo: Repo, actor: Actor, studentId: string, body: string, now = new Date()): Promise<void> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  await studentClassFor(repo, actor, studentId, false);
  const text = s(body).trim();
  if (text.length < 2) throw new ValidationError("Write the note.");
  await repo.create("TeacherNote", { schoolId: actor.schoolId!, studentId, authorId: actor.userId, body: text.slice(0, 1000), createdAt: now });
}

export async function notesFor(repo: Repo, actor: Actor, studentId: string): Promise<{ id: string; body: string; author: string; date: string; mine: boolean }[]> {
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  await studentClassFor(repo, actor, studentId, false);
  const rows = await repo.findMany("TeacherNote", { studentId });
  const users = rows.length ? await repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.authorId)))] } }, { select: ["id", "displayName"] }) : [];
  return rows.map((r) => ({ id: s(r.id), body: s(r.body), author: s(users.find((u) => u.id === r.authorId)?.displayName), date: iso(r.createdAt)!.slice(0, 10), mine: r.authorId === actor.userId })).sort((a, b) => b.date.localeCompare(a.date));
}

export async function deleteNote(repo: Repo, actor: Actor, id: string): Promise<void> {
  const n = await repo.findUnique("TeacherNote", { id });
  if (!n || String(n.schoolId) !== String(actor.schoolId ?? "") || (n.authorId !== actor.userId && !isAdmin(actor))) throw new ForbiddenError();
  await repo.deleteMany("TeacherNote", { id });
}

// ------------------------------------------------------------------ 💬 quick comments

export const DEFAULT_QUICK = [
  "Great effort this week — keep it up! 🌟",
  "Read the question twice before you answer.",
  "Go back to the text to find evidence for your answer.",
  "Your vocabulary is growing — well done!",
  "Please finish your late work this week.",
  "Excellent progress on your MAP goal areas! 🚀",
  "Practise 15 minutes a day on the platform.",
];
const QKEY = (userId: string) => `comments.${userId}`;

export async function quickComments(repo: Repo, actor: Actor): Promise<string[]> {
  const row = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: QKEY(actor.userId) }))[0];
  let v: unknown = row?.value ?? null; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const mine = Array.isArray(v) ? (v as string[]).map(s).filter(Boolean) : [];
  return [...new Set([...mine, ...DEFAULT_QUICK])].slice(0, 30);
}

export async function saveQuickComment(repo: Repo, actor: Actor, text: string, remove = false, now = new Date()): Promise<void> {
  if (actor.role !== "TEACHER" && !isAdmin(actor)) throw new ForbiddenError();
  const t = s(text).trim().slice(0, 300);
  if (!t) return;
  const row = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: QKEY(actor.userId) }))[0];
  let v: unknown = row?.value ?? []; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = []; } }
  const list = (Array.isArray(v) ? (v as string[]) : []).filter((x) => x !== t);
  const value = remove ? list : [t, ...list].slice(0, 20);
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: QKEY(actor.userId) }, { value, updatedBy: actor.userId, updatedAt: now }, { value, updatedBy: actor.userId, updatedAt: now });
}

// ------------------------------------------------------------------ 📋 copy an assignment to another class

/** The same work for another class of the same grade (whole class), with a new due date. */
export async function copyAssignment(repo: Repo, actor: Actor, assignmentId: string, toClassId: string, dueAt: Date | null, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt) throw new ValidationError("Assignment not found.");
  const from = await assertClassRead(repo, actor, s(a.classId));
  const to = await assertClassAccess(repo, actor, toClassId);
  if (s(from.gradeId) !== s(to.gradeId)) throw new ValidationError("Copy only to a class of the same grade.");
  if (s(a.classId) === toClassId) throw new ValidationError("Choose another class.");
  const track = (s(a.track) || "CURRICULUM") as "CURRICULUM" | "MAP" | "NAFS";
  // r74: the copy keeps the original's source (older rows: inferred once)
  const source = sourceOfAssignment(a);
  let id: string;
  if (a.skillId) id = (await assignSkill(repo, actor, { classId: toClassId, skillId: s(a.skillId), dueAt, note: a.note ? s(a.note) : null, track, source }, now)).assignmentId;
  else if (a.assessmentId) {
    const set = await repo.findUnique("Assessment", { id: a.assessmentId });
    const qs = (await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId })).sort((x, y) => Number(x.order) - Number(y.order)).map((x) => s(x.questionId));
    id = (await assignQuestions(repo, actor, { classId: toClassId, questionIds: qs, title: s(a.title), exactTitle: true, track, dueAt, note: a.note ? s(a.note) : null, ...(set?.isAdaptive ? { adaptive: { maxQuestions: Number(set.maxQuestions) || qs.length } } : {}), source }, now)).assignmentId;
  } else throw new ValidationError("This kind of assignment cannot be copied.");
  await audit(repo, { actorId: actor.userId, action: "assignment.copy", entityType: "Assignment", entityId: id, after: { from: assignmentId, toClassId }, at: now });
  return id;
}

// ------------------------------------------------------------------ 🗓️ the calendar

/** CYCLE = the school's assessment calendar (diagnostic / MAP windows, breaks); PROGRESS = a text-set progress check due;
 *  FLUENCY = Tier 2/3 fluency checks due (src/server/assessment-cycle) */
export interface CalEvent { date: string; kind: "DUE" | "EXIT" | "MAP_TEST" | "RESPOND" | "WRITING" | "CYCLE" | "PROGRESS" | "FLUENCY"; title: string; className: string; href: string | null }

/** Everything dated in the teacher's classes for these weeks (due dates, exit tickets, MAP practice tests, writing). */
export async function calendar(repo: Repo, actor: Actor, from: Date, days = 35): Promise<CalEvent[]> {
  assertCan(actor, "reports:read");
  const classes = await readableClasses(repo, actor);
  const ids = classes.map((c) => c.id);
  const nameOf = (id: unknown) => s(classes.find((c) => c.id === id)?.name);
  const to = from.getTime() + days * DAY, inRange = (v: unknown) => v && time(v) >= from.getTime() && time(v) < to;
  if (!ids.length) return [];
  const [asg, exits, respond, writing, wins] = await Promise.all([
    repo.findMany("Assignment", { classId: { in: ids }, deletedAt: null }, { select: ["id", "title", "dueAt", "classId"] }),
    repo.findMany("ExitTicket", { classId: { in: ids } }, { select: ["id", "title", "createdAt", "classId"] }),
    repo.findMany("RespondAssignment", { classId: { in: ids }, deletedAt: null }, { select: ["id", "title", "dueAt", "classId"] }),
    repo.findMany("WritingTask", { classId: { in: ids }, deletedAt: null }, { select: ["id", "title", "dueAt", "classId", "kind"] }),
    repo.findMany("MapSimWindow", { schoolId: actor.schoolId }, { select: ["id", "title", "opensAt", "closesAt"] }),
  ]);
  const out: CalEvent[] = [];
  for (const a of asg) if (inRange(a.dueAt)) out.push({ date: iso(a.dueAt)!.slice(0, 10), kind: "DUE", title: s(a.title), className: nameOf(a.classId), href: `/teacher/assignments/${s(a.id)}` });
  for (const x of exits) if (inRange(x.createdAt)) out.push({ date: iso(x.createdAt)!.slice(0, 10), kind: "EXIT", title: s(x.title), className: nameOf(x.classId), href: `/teacher/exit/${s(x.id)}` });
  for (const r of respond) if (inRange(r.dueAt)) out.push({ date: iso(r.dueAt)!.slice(0, 10), kind: "RESPOND", title: s(r.title), className: nameOf(r.classId), href: "/teacher/respond" });
  for (const w of writing) if (inRange(w.dueAt)) out.push({ date: iso(w.dueAt)!.slice(0, 10), kind: "WRITING", title: s(w.title), className: nameOf(w.classId), href: `/teacher/writing?task=${s(w.id)}` });
  for (const w of wins) { if (inRange(w.opensAt)) out.push({ date: iso(w.opensAt)!.slice(0, 10), kind: "MAP_TEST", title: `Opens: ${s(w.title)}`, className: "", href: `/teacher/map-center/test/${s(w.id)}` }); if (inRange(w.closesAt)) out.push({ date: iso(w.closesAt)!.slice(0, 10), kind: "MAP_TEST", title: `Closes: ${s(w.title)}`, className: "", href: `/teacher/map-center/test/${s(w.id)}` }); }
  // the assessment cycle: windows, progress checks due per text set, Tier 2/3 fluency checks due
  for (const e of await cycleCalendarEvents(repo, s(actor.schoolId ?? classes[0]?.schoolId), classes, from, new Date(to))) out.push({ date: e.date, kind: e.kind, title: e.title, className: e.classId ? nameOf(e.classId) : "", href: e.href });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

// ------------------------------------------------------------------ ☀️ question of the day

/** Games Part 3: one level above the student's level, one attempt, coins — src/server/motivation/qotd.ts */
export { questionOfTheDay, answerQuestionOfTheDay } from "../motivation/qotd";

// ------------------------------------------------------------------ 🏁 the class challenge (classes, never individuals)

/** This week: average answers per student of each class of the grade (so big and small classes are fair). */
export async function classChallenge(repo: Repo, schoolId: string, gradeId: string, now = new Date()): Promise<{ classId: string; name: string; perStudent: number; rank: number }[]> {
  const classes = await repo.findMany("Class", { schoolId, gradeId, deletedAt: null }, { select: ["id", "name"] });
  if (classes.length < 2) return [];
  const from = weekStart(now);
  const out = [];
  for (const c of classes) {
    const ids = await classMembers(repo, s(c.id));
    const n = ids.length ? await repo.count("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: from } }) : 0;
    out.push({ classId: s(c.id), name: s(c.name), perStudent: ids.length ? Math.round((10 * n) / ids.length) / 10 : 0, rank: 0 });
  }
  out.sort((a, b) => b.perStudent - a.perStudent || a.name.localeCompare(b.name)).forEach((x, i) => { x.rank = i + 1; });
  return out;
}

// ------------------------------------------------------------------ 📈 MAP growth report (after Winter / Spring)

export interface GrowthRow { studentId: string; name: string; fall: number; latest: number; latestTerm: string; growth: number; projected: number | null; expected: number | null; met: boolean | null; pctOfGoal: number | null }
/** `tested` = students with a Fall and a later score; `measured` = those of them with an expected growth (met / not
 *  met known): "% met" is met / measured — a student without an NWEA projection is never counted as "not met" (r72). */
export interface GrowthClass { classId: string; className: string; grade: number; rows: GrowthRow[]; tested: number; measured: number; met: number; avgGrowth: number | null; avgProjected: number | null }

export async function growthReport(repo: Repo, actor: Actor, subject: Subject = "READING"): Promise<GrowthClass[]> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const classes = (await readableClasses(repo, actor)).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  // ⚡ Update 57: every class's students, grades, names and MAP rows in four reads (before: four per class, in turn)
  const classIds = classes.map((c) => s(c.id));
  const [members, gradeRows] = await Promise.all([
    classIds.length ? repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId"] }) : Promise.resolve([] as Row[]),
    classes.length ? repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }) : Promise.resolve([] as Row[]),
  ]);
  const membersOf = new Map<string, string[]>();
  for (const m of members) { const k = s(m.classId); const l = membersOf.get(k); if (l) l.push(s(m.studentId)); else membersOf.set(k, [s(m.studentId)]); }
  const levelOf = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const allIds = [...new Set(members.map((m) => s(m.studentId)))];
  const [names, maps] = await Promise.all([
    studentNames(repo, allIds),
    allIds.length ? repo.findMany("MapResult", { studentId: { in: allIds }, goalName: null }, { select: ["studentId", "subject", "termName", "testDate", "rit", "projectedGrowth"] }) : Promise.resolve([] as Row[]),
  ]);
  const mapsOf = new Map<string, Row[]>();
  for (const m of maps) { const k = s(m.studentId); const l = mapsOf.get(k); if (l) l.push(m); else mapsOf.set(k, [m]); }
  const out: GrowthClass[] = [];
  for (const c of classes) {
    const ids = [...new Set(membersOf.get(s(c.id)) ?? [])];
    const grade = levelOf.get(s(c.gradeId)) ?? 0;
    const rows: GrowthRow[] = [];
    for (const id of ids) {
      const mine = (mapsOf.get(id) ?? []).filter((m) => (subject === "READING" ? /read/i : /language/i).test(s(m.subject))).sort((a, b) => time(a.testDate) - time(b.testDate));
      const fall = [...mine].reverse().find((m) => seasonOf(m.termName, m.testDate) === "FALL");
      if (!fall) continue;
      const latest = mine.filter((m) => time(m.testDate) > time(fall.testDate)).pop();
      if (!latest) continue;
      const season = seasonOf(latest.termName, latest.testDate);
      const projected = fall.projectedGrowth !== null && fall.projectedGrowth !== undefined ? Number(fall.projectedGrowth) : null;
      const expected = projected !== null ? expectedNow(Number(fall.rit), projected, season) - Number(fall.rit) : null;
      const growth = Number(latest.rit) - Number(fall.rit);
      rows.push({ studentId: id, name: names.get(id)?.name ?? "Student", fall: Number(fall.rit), latest: Number(latest.rit), latestTerm: s(latest.termName), growth, projected, expected, met: expected === null ? null : growth >= expected, pctOfGoal: projected ? Math.round((100 * growth) / projected) : null });
    }
    rows.sort((a, b) => Number(a.met !== false) - Number(b.met !== false) || a.growth - b.growth);
    const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((t, x) => t + x, 0)) / xs.length) / 10 : null);
    out.push({ classId: s(c.id), className: s(c.name), grade, rows, tested: rows.length, measured: rows.filter((r) => r.met !== null).length, met: rows.filter((r) => r.met === true).length, avgGrowth: avg(rows.map((r) => r.growth)), avgProjected: avg(rows.filter((r) => r.expected !== null).map((r) => r.expected!)) });
  }
  return out;
}

// ------------------------------------------------------------------ 👀 class visit (read only)

export interface Visit {
  teacher: { id: string; name: string; lastLogin: string | null }; classes: { id: string; name: string }[];
  klass: { id: string; name: string; students: number } | null;
  work: { title: string; dueAt: string | null; done: number; total: number; late: number; href: string }[];
  alerts: { open: number; handled: number; recent: { name: string; title: string; action: string | null; status: string }[] };
  plans: { draft: number; sent: number }; tickets: number; comments: number; goals: string | null; rhythm: string | null;
  activeWeek: number; accuracy: number | null;
}

/** The head of department sees a teacher's class as the teacher sees it — nothing can be changed from here. */
export async function classVisit(repo: Repo, actor: Actor, teacherUserId: string | null, classId: string | null, now = new Date()): Promise<{ teachers: { id: string; name: string }[]; visit: Visit | null }> {
  if (!isAdmin(actor)) throw new ForbiddenError("Class visits are for the head of department.");
  const tRows = await repo.findMany("Teacher", { schoolId: actor.schoolId }, { select: ["id", "userId"] });
  const users = tRows.length ? await repo.findMany("User", { id: { in: tRows.map((t) => t.userId) }, isActive: true }, { select: ["id", "displayName", "lastLoginAt"] }) : [];
  const teachers = users.map((u) => ({ id: s(u.id), name: s(u.displayName) })).sort((a, b) => a.name.localeCompare(b.name));
  const tu = users.find((u) => u.id === teacherUserId) ?? null;
  if (!tu) return { teachers, visit: null };
  const t = tRows.find((x) => x.userId === tu.id)!;
  const links = await repo.findMany("ClassTeacher", { teacherId: t.id });
  const cls = links.length ? (await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null }, { select: ["id", "name"] })).sort((a, b) => s(a.name).localeCompare(s(b.name))) : [];
  const c = cls.find((x) => x.id === classId) ?? cls[0];
  const base: Visit = { teacher: { id: s(tu.id), name: s(tu.displayName), lastLogin: iso(tu.lastLoginAt) }, classes: cls.map((x) => ({ id: s(x.id), name: s(x.name) })), klass: null, work: [], alerts: { open: 0, handled: 0, recent: [] }, plans: { draft: 0, sent: 0 }, tickets: 0, comments: 0, goals: null, rhythm: null, activeWeek: 0, accuracy: null };
  if (!c) return { teachers, visit: base };
  const ids = await classMembers(repo, s(c.id));
  const asg = (await repo.findMany("Assignment", { classId: c.id, deletedAt: null }, { select: ["id", "title", "dueAt", "createdAt"] })).sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 8);
  const rows = asg.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: asg.map((a) => a.id) } }, { select: ["assignmentId", "status"] }) : [];
  const alerts = (await repo.findMany("StudentAlert", { classId: c.id })).filter((a) => a.status !== "MERGED");
  const names = await studentNames(repo, [...new Set(alerts.map((a) => s(a.studentId)))]);
  const [plans, tickets, comments, week] = await Promise.all([
    repo.findMany("MapPlan", { classId: c.id }, { select: ["status"] }), repo.count("ExitTicket", { classId: c.id }),
    ids.length ? repo.count("WorkComment", { studentId: { in: ids }, authorId: tu.id }) : Promise.resolve(0),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, { select: ["studentId", "isCorrect"] }) : Promise.resolve([] as Row[]),
  ]);
  const goal = (await repo.findMany("WeeklyGoal", { scope: "CLASS", ownerId: c.id, weekStart: weekStart(now) }))[0];
  const rh = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: `rhythm.${s(c.id)}` }))[0];
  let rv: unknown = rh?.value ?? null; if (typeof rv === "string") { try { rv = JSON.parse(rv); } catch { rv = null; } }
  const r = rv as { days?: number; minutes?: number } | null;
  return {
    teachers,
    visit: {
      ...base, klass: { id: s(c.id), name: s(c.name), students: ids.length },
      work: asg.map((a) => { const mine = rows.filter((x) => x.assignmentId === a.id); return { title: s(a.title), dueAt: iso(a.dueAt), done: mine.filter((x) => x.status === "COMPLETED").length, total: mine.length, late: mine.filter((x) => x.status === "OVERDUE").length, href: `/teacher/assignments/${s(a.id)}` }; }),
      alerts: { open: alerts.filter((a) => a.status === "OPEN").length, handled: alerts.filter((a) => a.status === "HANDLED").length, recent: alerts.sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 8).map((a) => ({ name: names.get(s(a.studentId))?.name ?? "Student", title: s(a.kind).replace("_", " ").toLowerCase(), action: a.action ? s(a.action) : null, status: s(a.status) })) },
      plans: { draft: plans.filter((p) => p.status === "DRAFT").length, sent: plans.filter((p) => p.status === "SENT").length }, tickets, comments,
      goals: goal ? `${s(goal.title) || `${goal.target} ${s(goal.kind).toLowerCase()}`}` : null, rhythm: r?.days ? `${r.days} day(s) a week, ${r.minutes} min` : null,
      activeWeek: new Set(week.map((w) => s(w.studentId))).size, accuracy: week.length ? Math.round((100 * week.filter((w) => w.isCorrect).length) / week.length) : null,
    },
  };
}

// ------------------------------------------------------------------ 🔑 sign-ins

export async function signIns(repo: Repo, actor: Actor, now = new Date()): Promise<{ users: { id: string; name: string; role: string; className: string; lastLogin: string | null; days: number | null }[]; logins7: number; failed7: number }> {
  if (!isAdmin(actor)) throw new ForbiddenError();
  const users = await repo.findMany("User", { schoolId: actor.schoolId, isActive: true, deletedAt: null }, { select: ["id", "displayName", "role", "lastLoginAt"] });
  const st = await repo.findMany("Student", { schoolId: actor.schoolId }, { select: ["id", "userId"] });
  const mem = st.length ? await repo.findMany("ClassMembership", { studentId: { in: st.map((x) => x.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const classes = await repo.findMany("Class", { schoolId: actor.schoolId }, { select: ["id", "name"] });
  const since = new Date(now.getTime() - 7 * DAY);
  const logs = await repo.findMany("AuditLog", { action: { in: ["auth.login.success", "auth.login.failure"] }, createdAt: { gte: since } }, { select: ["action", "actorId", "entityId"] });
  const mine = new Set(users.map((u) => s(u.id)));
  return {
    users: users.map((u) => { const sid = st.find((x) => x.userId === u.id)?.id; const cid = mem.find((m) => m.studentId === sid)?.classId; const last = u.lastLoginAt ? time(u.lastLoginAt) : null; return { id: s(u.id), name: s(u.displayName), role: s(u.role), className: s(classes.find((c) => c.id === cid)?.name), lastLogin: last ? new Date(last).toISOString() : null, days: last ? Math.floor((now.getTime() - last) / DAY) : null }; })
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999) || a.name.localeCompare(b.name)),
    logins7: logs.filter((l) => l.action === "auth.login.success" && mine.has(s(l.actorId))).length,
    failed7: logs.filter((l) => l.action === "auth.login.failure" && (mine.has(s(l.entityId)) || !l.entityId)).length,
  };
}

// ------------------------------------------------------------------ 💾 backup (Excel sheets)

export async function backupSheets(repo: Repo, actor: Actor): Promise<{ name: string; rows: string[][] }[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("Only the admin downloads the backup.");
  assertCan(actor, "reports:export");
  const students = await repo.findMany("Student", { schoolId: actor.schoolId });
  const ids = students.map((x) => s(x.id));
  const [users, mem, classes, grades, maps, mastery, skills, asgRows, plans, alerts] = await Promise.all([
    repo.findMany("User", { schoolId: actor.schoolId }, { select: ["id", "displayName", "username", "role"] }),
    ids.length ? repo.findMany("ClassMembership", { studentId: { in: ids }, leftAt: null }) : Promise.resolve([] as Row[]),
    repo.findMany("Class", { schoolId: actor.schoolId }), repo.findMany("Grade", { schoolId: actor.schoolId }),
    ids.length ? repo.findMany("MapResult", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentSkillMastery", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    repo.findMany("Skill", {}, { select: ["id", "name"] }),
    ids.length ? repo.findMany("AssignmentStudent", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    repo.findMany("MapPlan", { schoolId: actor.schoolId }), repo.findMany("StudentAlert", { schoolId: actor.schoolId }),
  ]);
  const asg = asgRows.length ? await repo.findMany("Assignment", { id: { in: [...new Set(asgRows.map((a) => s(a.assignmentId)))] } }, { select: ["id", "title", "dueAt", "classId"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName)]));
  const numOf = new Map(students.map((x) => [s(x.id), s(x.studentNumber)]));
  const classOf = (sid: string) => s(classes.find((c) => c.id === mem.find((m) => m.studentId === sid)?.classId)?.name);
  const d = (v: unknown) => (v ? iso(v)!.slice(0, 10) : "");
  return [
    { name: "Students", rows: [["Student", "Student ID", "Username", "Grade", "Class"], ...students.map((x) => [nameOf.get(s(x.id))!, s(x.studentNumber), s(users.find((u) => u.id === x.userId)?.username), s(grades.find((g) => g.id === x.gradeId)?.level), classOf(s(x.id))])] },
    { name: "MAP results", rows: [["Student", "Student ID", "Term", "Subject", "Goal area", "RIT", "Percentile", "Projected growth", "Lexile", "Rapid guessing %", "Test date"], ...maps.map((m) => [nameOf.get(s(m.studentId)) ?? "", numOf.get(s(m.studentId)) ?? "", s(m.termName), s(m.subject), s(m.goalName), s(m.rit), s(m.achievementPercentile ?? ""), s(m.projectedGrowth ?? ""), s(m.lexile ?? ""), s(m.rapidGuessPct ?? ""), d(m.testDate)])] },
    { name: "Skills", rows: [["Student", "Student ID", "Skill", "Answers", "Correct", "Mastery score", "Mastered", "Last practised"], ...mastery.map((m) => [nameOf.get(s(m.studentId)) ?? "", numOf.get(s(m.studentId)) ?? "", s(skills.find((k) => k.id === m.skillId)?.name), s(m.attempts), s(m.correct), String(Math.round(Number(m.score))), m.isMastered ? "yes" : "", d(m.lastPracticedAt)])] },
    { name: "Assignments", rows: [["Student", "Student ID", "Class", "Assignment", "Due", "Status", "Progress %"], ...asgRows.map((r) => { const a = asg.find((x) => x.id === r.assignmentId); return [nameOf.get(s(r.studentId)) ?? "", numOf.get(s(r.studentId)) ?? "", s(classes.find((c) => c.id === a?.classId)?.name), s(a?.title), d(a?.dueAt), s(r.status), String(Math.round(Number(r.progress) * 100))]; })] },
    { name: "MAP plans", rows: [["Student", "Student ID", "Subject", "Term", "Status", "Sent"], ...plans.map((p) => [nameOf.get(s(p.studentId)) ?? "", numOf.get(s(p.studentId)) ?? "", s(p.subject), s(p.term), s(p.status), d(p.sentAt)])] },
    { name: "Alerts", rows: [["Date", "Student", "Reason", "Details", "Status", "What was done"], ...alerts.map((a) => [d(a.createdAt), nameOf.get(s(a.studentId)) ?? "", s(a.kind), s(a.detail), s(a.status), s(a.action)])] },
  ];
}

// ------------------------------------------------------------------ 🩺 errors

/** Keeps one error line (message only, at most 1000 characters; nothing about the student). Never throws. */
export async function logError(repo: Repo, e: { source: "SERVER" | "BROWSER"; message: string; path?: string | null; digest?: string | null; userId?: string | null }, now = new Date()): Promise<void> {
  try {
    const recent = await repo.findMany("ErrorLog", { createdAt: { gte: new Date(now.getTime() - 60_000) } }, { select: ["id"] });
    if (recent.length > 50) return;   // a storm: keep the database safe
    await repo.create("ErrorLog", { source: e.source, message: s(e.message).replace(/\s+/g, " ").slice(0, 1000), path: e.path ? s(e.path).slice(0, 300) : null, digest: e.digest ? s(e.digest).slice(0, 100) : null, userId: e.userId ?? null, createdAt: now });
  } catch { /* logging must never break a page */ }
}

/**
 * 🩺 The real message behind an error page's "Reference" (a server error's digest), for the school admin / platform
 * admin only — never for teachers or students (null). A missing table / column gets the fix ("Run npx prisma db push").
 * Only the last 2 hours are searched (createdAt index), one row.
 */
export async function errorDetail(repo: Repo, actor: Actor, digest: string, now = new Date()): Promise<{ message: string; path: string | null } | null> {
  if (!isAdmin(actor)) return null;
  const d = s(digest).trim();
  if (!/^[\w-]{3,100}$/.test(d)) return null;
  const rows = await repo.findMany("ErrorLog", { digest: d, source: "SERVER", createdAt: { gte: new Date(now.getTime() - 2 * 3_600_000) } }, { select: ["message", "path"], take: 1 });
  if (!rows.length) return null;
  const message = s(rows[0].message);
  const gap = schemaGap({ message });
  return { message: gap ? `${SCHEMA_FIX.replace("{what}", gap.what)} — ${message.slice(0, 400)}` : message.slice(0, 600), path: rows[0].path ? s(rows[0].path) : null };
}

export async function errorList(repo: Repo, actor: Actor): Promise<{ id: string; source: string; message: string; path: string | null; digest: string | null; at: string; count: number }[]> {
  if (!isAdmin(actor)) throw new ForbiddenError();
  const rows = (await repo.findMany("ErrorLog", { createdAt: { gte: new Date(Date.now() - 30 * DAY) } })).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const by = new Map<string, { id: string; source: string; message: string; path: string | null; digest: string | null; at: string; count: number }>();
  for (const r of rows) { const k = `${s(r.source)}|${s(r.message)}`; const v = by.get(k); if (v) v.count++; else by.set(k, { id: s(r.id), source: s(r.source), message: s(r.message), path: r.path ? s(r.path) : null, digest: r.digest ? s(r.digest) : null, at: iso(r.createdAt)!, count: 1 }); }
  return [...by.values()].slice(0, 200);
}

// ------------------------------------------------------------------ 👪 share every parent report of a class

export async function shareClassReports(repo: Repo, actor: Actor, classId: string, note: string | null, now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  let n = 0;
  for (const id of await classMembers(repo, classId)) { await shareParentReport(repo, actor, id, true, note, now); n++; }
  return n;
}
