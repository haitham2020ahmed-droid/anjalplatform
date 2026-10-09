/**
 * 🚨 Student alerts with follow-up. The school is scanned (at most every 3 hours, when a teacher or the admin
 * opens a page that shows alerts); each new alert is kept (once per student and reason per week), the teachers of
 * the class and the head of department get ONE notification per scan, and the teacher writes what was done and
 * marks it handled. The admin (head of department) sees everything, including what is not handled yet.
 *
 * Reasons: NO_PRACTICE (7 days without an answer), WEAK_SKILL (a skill under 40% after 8+ answers), DROPPED (a level
 * dropped twice in a row), LATE_WORK (2+ tasks not started by their due date), MAP_RISK (MAP Low, or at risk of
 * missing the Spring goal), RAPID_GUESS (NWEA rapid guessing 30%+ → retest; or many too-fast answers here).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { coordinatorGrades, readableClasses } from "../teacher/coordinators";
import { mapSummaries, practiceStats, studentNames } from "./student-data";
import { statusOf } from "./progress";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;
export type AlertKind = "NO_PRACTICE" | "WEAK_SKILL" | "DROPPED" | "LATE_WORK" | "MAP_RISK" | "RAPID_GUESS";
export const ALERT_INFO: Record<AlertKind, { icon: string; title: string; tip: string }> = {
  MAP_RISK: { icon: "🗺️", title: "MAP: at risk", tip: "Check the MAP plan; a small group for the focus area helps." },
  RAPID_GUESS: { icon: "⚡", title: "Rapid guessing", tip: "Talk with the student; if it is the MAP test, ask about a retest." },
  DROPPED: { icon: "📉", title: "Dropped a level twice", tip: "Give support at the lower level, then try again." },
  WEAK_SKILL: { icon: "🧩", title: "Weak in a skill", tip: "Reteach the skill or send it again at a lower level." },
  LATE_WORK: { icon: "⏰", title: "Late work", tip: "Remind the student; contact the parent if it continues." },
  NO_PRACTICE: { icon: "💤", title: "No practice for 7 days", tip: "Check in with the student; a short task to restart." },
};
const ORDER: AlertKind[] = ["MAP_RISK", "RAPID_GUESS", "DROPPED", "WEAK_SKILL", "LATE_WORK", "NO_PRACTICE"];

/** ISO week label of a date, e.g. 2026-W41. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

interface Found { studentId: string; classId: string; kind: AlertKind; key: string; detail: string }

/** Finds every alert of the school now (nothing is written). */
export async function findAlerts(repo: Repo, schoolId: string, now = new Date()): Promise<Found[]> {
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "gradeId"] });
  if (!classes.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId", "joinedAt"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return [];
  const classOf = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const gradeOf = new Map(members.map((m) => [s(m.studentId), Number(grades.find((g) => g.id === classes.find((c) => c.id === m.classId)?.gradeId)?.level ?? 0)]));
  const wk = weekKey(now);
  const out: Found[] = [];
  const add = (studentId: string, kind: AlertKind, key: string, detail: string) => out.push({ studentId, classId: classOf.get(studentId) ?? "", kind, key: `${kind}|${key}`, detail: detail.slice(0, 500) });

  const [maps, practice, students] = await Promise.all([mapSummaries(repo, ids, "READING", gradeOf), practiceStats(repo, ids, now), repo.findMany("Student", { id: { in: ids } }, { select: ["id", "createdAt"] })]);
  // MAP risk (Low, or the Spring goal is at risk/missed)
  for (const id of ids) {
    const m = maps.get(id), st = statusOf(m, practice.get(id));
    if (m?.latest && (st.status === "AT_RISK" || st.status === "MISSED")) add(id, "MAP_RISK", `${m.latest.term}|${wk}`, st.why);
    else if (m?.latest?.percentile !== null && m?.latest?.percentile !== undefined && m.latest.percentile < 21) add(id, "MAP_RISK", `${m.latest.term}|low`, `MAP ${m.latest.term}: RIT ${m.latest.rit}, percentile ${m.latest.percentile} (Low).`);
  }
  // NWEA rapid guessing on the latest test
  const rg = await repo.findMany("MapResult", { studentId: { in: ids }, goalName: null }, { select: ["studentId", "rapidGuessPct", "termName", "subject", "testDate"] });
  for (const r of rg) if (Number(r.rapidGuessPct ?? 0) >= 30) add(s(r.studentId), "RAPID_GUESS", `map|${s(r.termName)}|${s(r.subject)}`, `MAP ${s(r.subject)} ${s(r.termName)}: ${Number(r.rapidGuessPct)}% rapid guessing. NWEA suggests the score may not show what the student knows: consider a retest.`);
  // too-fast answers on the platform (last 14 days)
  const recent = await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } }, { select: ["studentId", "rapidGuess"] });
  const rgCount = new Map<string, [number, number]>();
  for (const a of recent) { const c = rgCount.get(s(a.studentId)) ?? [0, 0]; c[0]++; if (a.rapidGuess) c[1]++; rgCount.set(s(a.studentId), c); }
  for (const [id, [n, fast]] of rgCount) if (n >= 20 && fast / n >= 0.3) add(id, "RAPID_GUESS", `platform|${wk}`, `${Math.round((100 * fast) / n)}% of the last ${n} answers were too fast to be read (last 14 days).`);
  // no practice for 7 days (students who had at least one week on the platform)
  for (const id of ids) {
    const p = practice.get(id), created = time(students.find((x) => x.id === id)?.createdAt);
    if (created > now.getTime() - 7 * DAY) continue;
    const last = p?.lastActive ? time(p.lastActive) : 0;
    if (last < now.getTime() - 7 * DAY) add(id, "NO_PRACTICE", wk, last ? `No answer since ${new Date(last).toISOString().slice(0, 10)}.` : "Has not practised on the platform yet.");
  }
  // weak skill: under 40% after 8+ answers, practised in the last 3 weeks
  const mastery = await repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "attempts", "correct", "lastPracticedAt"] });
  const weak = mastery.filter((m) => Number(m.attempts) >= 8 && Number(m.correct) / Number(m.attempts) < 0.4 && time(m.lastPracticedAt) >= now.getTime() - 21 * DAY);
  const skillNames = weak.length ? new Map((await repo.findMany("Skill", { id: { in: [...new Set(weak.map((w) => s(w.skillId)))] } }, { select: ["id", "name"] })).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  for (const w of weak) add(s(w.studentId), "WEAK_SKILL", `${s(w.skillId)}|${wk}`, `${skillNames.get(s(w.skillId)) ?? "A skill"}: ${Math.round((100 * Number(w.correct)) / Number(w.attempts))}% correct after ${Number(w.attempts)} answers.`);
  // dropped a level twice in a row (same category), last 30 days
  const RANK: Record<string, number> = { SUPPORT: -1, BELOW: 0, ON: 1, ABOVE: 2, CHALLENGE: 3 };
  const logs = await repo.findMany("AuditLog", { entityType: "Student", entityId: { in: ids }, action: "level.change" });
  const byKey = new Map<string, Row[]>();
  for (const l of logs) { const a = (l.after ?? {}) as Record<string, unknown>; if (a.outcome !== "CHANGED") continue; const k = `${s(l.entityId)}|${s(a.category)}`; byKey.set(k, [...(byKey.get(k) ?? []), l]); }
  for (const [k, list] of byKey) {
    const [last, prev] = list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    if (!last || !prev || time(last.createdAt) < now.getTime() - 30 * DAY) continue;
    const down = (l: Row) => RANK[s(((l.after ?? {}) as Record<string, unknown>).level)] < RANK[s(((l.before ?? {}) as Record<string, unknown>).level)];
    const [id, cat] = k.split("|");
    if (down(last) && down(prev)) add(id, "DROPPED", `${cat}|${s(last.id)}`, `Dropped a level twice in a row${cat && cat !== "undefined" ? ` (${cat})` : ""}.`);
  }
  // late work: 2+ tasks not started by their due date (last 30 days)
  const asg = await repo.findMany("AssignmentStudent", { studentId: { in: ids }, status: { in: ["NOT_STARTED", "OVERDUE"] } }, { select: ["studentId", "assignmentId", "progress"] });
  const as = asg.length ? await repo.findMany("Assignment", { id: { in: [...new Set(asg.map((a) => s(a.assignmentId)))] }, deletedAt: null }, { select: ["id", "dueAt"] }) : [];
  const due = new Map(as.filter((a) => a.dueAt && time(a.dueAt) < now.getTime() && time(a.dueAt) > now.getTime() - 30 * DAY).map((a) => [s(a.id), a]));
  const late = new Map<string, number>();
  for (const r of asg) if (due.has(s(r.assignmentId)) && Number(r.progress ?? 0) === 0) late.set(s(r.studentId), (late.get(s(r.studentId)) ?? 0) + 1);
  for (const [id, n] of late) if (n >= 2) add(id, "LATE_WORK", wk, `${n} tasks not started by their due date.`);
  return out;
}

const SCAN_KEY = "alerts.scan";

/** Keeps new alerts and sends ONE notification per teacher / admin. Runs at most every 3 hours (force = now). */
export async function scanAlerts(repo: Repo, schoolId: string, now = new Date(), force = false): Promise<number> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: SCAN_KEY }))[0];
  let last = 0; if (row) { let v: unknown = row.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } } last = Number((v as { at?: number } | null)?.at ?? 0); }
  if (!force && now.getTime() - last < 3 * 3600_000) return 0;
  await repo.upsert("SchoolSetting", { schoolId, key: SCAN_KEY }, { value: { at: now.getTime() }, updatedAt: now }, { value: { at: now.getTime() }, updatedAt: now });
  const found = await findAlerts(repo, schoolId, now);
  if (!found.length) return 0;
  const have = await repo.findMany("StudentAlert", { studentId: { in: [...new Set(found.map((f) => f.studentId))] } }, { select: ["studentId", "key"] });
  const seen = new Set(have.map((h) => `${s(h.studentId)}#${s(h.key)}`));
  const fresh = found.filter((f) => !seen.has(`${f.studentId}#${f.key}`));
  const unique = [...new Map(fresh.map((f) => [`${f.studentId}#${f.key}`, f])).values()];
  if (!unique.length) return 0;
  await repo.createMany("StudentAlert", unique.map((f) => ({ schoolId, classId: f.classId || null, studentId: f.studentId, kind: f.kind, key: f.key.slice(0, 120), detail: f.detail, status: "OPEN", createdAt: now })));
  // one notification per person: the teachers of the classes concerned, and the school admins
  const perUser = new Map<string, number>();
  const classIds = [...new Set(unique.map((f) => f.classId).filter(Boolean))];
  const ct = classIds.length ? await repo.findMany("ClassTeacher", { classId: { in: classIds } }) : [];
  const teachers = ct.length ? await repo.findMany("Teacher", { id: { in: [...new Set(ct.map((c) => s(c.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  for (const f of unique) for (const c of ct.filter((x) => x.classId === f.classId)) { const u = s(teachers.find((t) => t.id === c.teacherId)?.userId); if (u) perUser.set(u, (perUser.get(u) ?? 0) + 1); }
  const admins = await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true }, { select: ["id"] });
  for (const a of admins) perUser.set(s(a.id), unique.length);
  if (perUser.size) await repo.createMany("Notification", [...perUser].map(([userId, n]) => ({ userId, type: "INTERVENTION_ALERT", title: `🚨 ${n} new student alert${n === 1 ? "" : "s"}`, body: "Students who need attention: open the list, act, and mark them handled.", link: "/teacher/alerts", createdAt: now })));
  return unique.length;
}

export interface AlertRow { id: string; kind: AlertKind; icon: string; title: string; tip: string; studentId: string; name: string; className: string; classId: string | null; detail: string; status: "OPEN" | "HANDLED"; action: string | null; handledBy: string | null; handledAt: string | null; createdAt: string; ageDays: number }

/** The alerts this person may see: a teacher → their classes (a coordinator → their grades); the admin → all. */
export async function alertList(repo: Repo, actor: Actor, opts: { status?: "OPEN" | "HANDLED" | "ALL"; classId?: string | null; kind?: string | null } = {}, now = new Date()): Promise<AlertRow[]> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  await scanAlerts(repo, actor.schoolId!, now);
  const classes = await readableClasses(repo, actor);
  const allowed = new Set(classes.map((c) => s(c.id)));
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const where: Record<string, unknown> = { schoolId: actor.schoolId };
  if (opts.status && opts.status !== "ALL") where.status = opts.status;
  if (opts.kind) where.kind = opts.kind;
  let rows = await repo.findMany("StudentAlert", where);
  rows = rows.filter((r) => (isAdmin || allowed.has(s(r.classId))) && (!opts.classId || r.classId === opts.classId));
  const names = await studentNames(repo, [...new Set(rows.map((r) => s(r.studentId)))]);
  const handlers = [...new Set(rows.map((r) => s(r.handledById)).filter(Boolean))];
  const users = handlers.length ? await repo.findMany("User", { id: { in: handlers } }, { select: ["id", "displayName"] }) : [];
  const allClasses = isAdmin ? await repo.findMany("Class", { schoolId: actor.schoolId }, { select: ["id", "name"] }) : classes;
  return rows.map((r) => {
    const k = s(r.kind) as AlertKind, info = ALERT_INFO[k] ?? { icon: "•", title: k, tip: "" };
    return { id: s(r.id), kind: k, ...info, studentId: s(r.studentId), name: names.get(s(r.studentId))?.name ?? "Student", className: s(allClasses.find((c) => c.id === r.classId)?.name), classId: r.classId ? s(r.classId) : null, detail: s(r.detail), status: s(r.status) as "OPEN" | "HANDLED", action: r.action ? s(r.action) : null, handledBy: r.handledById ? s(users.find((u) => u.id === r.handledById)?.displayName) || null : null, handledAt: r.handledAt ? new Date(time(r.handledAt)).toISOString() : null, createdAt: new Date(time(r.createdAt)).toISOString(), ageDays: Math.floor((now.getTime() - time(r.createdAt)) / DAY) };
  }).sort((a, b) => Number(a.status === "HANDLED") - Number(b.status === "HANDLED") || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
}

export async function openAlertCount(repo: Repo, actor: Actor): Promise<number> {
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return repo.count("StudentAlert", { schoolId: actor.schoolId, status: "OPEN" });
  if (actor.role !== "TEACHER") return 0;
  const classes = await readableClasses(repo, actor);
  return classes.length ? repo.count("StudentAlert", { classId: { in: classes.map((c) => c.id) }, status: "OPEN" }) : 0;
}

/** The teacher records what was done and marks the alert handled (or reopens it). */
export async function handleAlert(repo: Repo, actor: Actor, alertId: string, action: string | null, reopen = false, now = new Date()): Promise<void> {
  assertCan(actor, "reports:read");
  const a = await repo.findUnique("StudentAlert", { id: alertId });
  if (!a || s(a.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Alert not found.");
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  if (!isAdmin) {
    if (actor.role !== "TEACHER") throw new ForbiddenError();
    const classes = await readableClasses(repo, actor);
    if (!classes.some((c) => c.id === a.classId)) throw new ForbiddenError("Not your student.");
  }
  if (reopen) { await repo.updateMany("StudentAlert", { id: alertId }, { status: "OPEN", handledAt: null, handledById: null }); return; }
  const text = s(action).trim();
  if (text.length < 3) throw new ValidationError("Write in a few words what you did (e.g. “Talked with the student”, “Called the parent”).");
  await repo.updateMany("StudentAlert", { id: alertId }, { status: "HANDLED", action: text.slice(0, 1000), handledById: actor.userId, handledAt: now });
  await audit(repo, { actorId: actor.userId, action: "alert.handled", entityType: "StudentAlert", entityId: alertId, after: { action: text.slice(0, 200) }, at: now });
}

/** For the department summary: open / handled per class and the oldest open. */
export async function alertStats(repo: Repo, schoolId: string): Promise<Map<string, { open: number; handled: number; oldestOpenDays: number | null }>> {
  const rows = await repo.findMany("StudentAlert", { schoolId }, { select: ["classId", "status", "createdAt"] });
  const out = new Map<string, { open: number; handled: number; oldestOpenDays: number | null }>();
  for (const r of rows) {
    const k = s(r.classId), v = out.get(k) ?? { open: 0, handled: 0, oldestOpenDays: null };
    if (r.status === "OPEN") { v.open++; const d = Math.floor((Date.now() - time(r.createdAt)) / DAY); v.oldestOpenDays = Math.max(v.oldestOpenDays ?? 0, d); } else v.handled++;
    out.set(k, v);
  }
  return out;
}

export { coordinatorGrades };
