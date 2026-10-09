/**
 * 📈 Progress, plans and alerts (teacher dashboard, student page, grade summary):
 *   classProgress   → one row per student: MAP Fall → latest → Spring target, on track / at risk, plan
 *                     intensity, weakest goal areas, level, practice, work done / pending / late
 *   studentProgress → one student in detail + their automatic plan (weakest goal areas → skills, starting level)
 *   teacherAlerts   → at risk · dropped a level twice in a row · assigned work not started by its due date
 *   gradeSummary    → admin / grade coordinators: each grade and class in numbers
 * Students never see these pages; level names are for staff only.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead, coordinatorGrades, readableClasses } from "../teacher/coordinators";
import { gradeAreaSkills } from "../map/recommend";
import { classMembers, levelsOf, mapSummaries, practiceStats, studentNames, workStats, type Level, type MapSummary, type PracticeStats, type Subject, type WorkStats } from "./student-data";
import { ladderSettings } from "../curriculum-map/ladder-settings";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export type Intensity = "INTENSIVE" | "TARGETED" | "CORE";
export const INTENSITY_NAME: Record<Intensity, string> = { INTENSIVE: "Intensive support", TARGETED: "Targeted practice", CORE: "Keep growing" };

/** Gap (Spring projection − Fall RIT) and the latest percentile → how much support the plan gives. */
export function intensityOf(gap: number | null, percentile: number | null): Intensity | null {
  if (gap === null && percentile === null) return null;
  if ((percentile ?? 50) < 21 || (gap ?? 0) >= 10) return "INTENSIVE";
  if ((percentile ?? 50) < 41 || (gap ?? 0) >= 6) return "TARGETED";
  return "CORE";
}

/** On track / at risk from MAP, or — without a mid-year MAP score — from platform work (last 30 days). */
export function statusOf(m: MapSummary | undefined, p: PracticeStats | undefined): { status: "ON_TRACK" | "AT_RISK" | "MET" | "MISSED" | "NO_DATA"; why: string } {
  if (m && (m.status === "MET" || m.status === "MISSED" || (m.latest && m.latest.season !== "FALL"))) return { status: m.status, why: m.statusWhy };
  if (p && p.recentAnswers >= 10 && p.recentAccuracy !== null) {
    if (p.recentAccuracy < 50) return { status: "AT_RISK", why: `${p.recentAccuracy}% correct on the platform (last 30 days).` };
    if (m?.status === "AT_RISK") return { status: "AT_RISK", why: m.statusWhy };
    return { status: "ON_TRACK", why: `${p.recentAccuracy}% correct on the platform (last 30 days)${m?.latest ? `; ${m.statusWhy}` : ""}` };
  }
  if (m && m.status !== "NO_DATA") return { status: m.status, why: m.statusWhy };
  return { status: "NO_DATA", why: "No MAP score and not enough work on the platform yet." };
}

export interface ProgressRow {
  studentId: string; name: string; number: string;
  map: MapSummary | null; status: ReturnType<typeof statusOf>["status"]; statusWhy: string; intensity: Intensity | null;
  level: Level | null; categories: Record<string, Level>; practice: PracticeStats; work: WorkStats; weakest: string[]; mastered: number; needsWork: number;
}
export interface ClassProgress { classId: string; className: string; grade: number; subject: Subject; rows: ProgressRow[]; summary: { students: number; tested: number; onTrack: number; atRisk: number; activeWeek: number; late: number; avgFall: number | null; avgTarget: number | null }; canAssign: boolean }

async function masteryCounts(repo: Repo, ids: string[], schoolId: string | null): Promise<Map<string, { mastered: number; needsWork: number }>> {
  const out = new Map(ids.map((id) => [id, { mastered: 0, needsWork: 0 }]));
  if (!ids.length) return out;
  const rules = await ladderSettings(repo, schoolId);
  const rows = await repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "correct", "attempts"] });
  for (const r of rows) {
    const o = out.get(s(r.studentId)); if (!o) continue;
    // “mastered” = accuracy at or above the school's threshold over at least its minimum number of answers
    const n = Number(r.attempts ?? 0), sc = n ? (Number(r.correct ?? 0) / n) * 100 : 0;
    if (n >= rules.masteredMin && sc >= rules.masteredPct) o.mastered++; else if (n >= 3) o.needsWork++;
  }
  return out;
}

async function rowsFor(repo: Repo, ids: string[], grade: number, subject: Subject, schoolId: string | null, now: Date): Promise<ProgressRow[]> {
  const [names, maps, practice, work, levels, mastery] = await Promise.all([
    studentNames(repo, ids), mapSummaries(repo, ids, subject, new Map(ids.map((id) => [id, grade]))), practiceStats(repo, ids, now), workStats(repo, ids, now), levelsOf(repo, ids), masteryCounts(repo, ids, schoolId),
  ]);
  return ids.map((id) => {
    const m = maps.get(id) ?? null, p = practice.get(id)!, st = statusOf(m ?? undefined, p);
    return {
      studentId: id, name: names.get(id)?.name ?? "Student", number: names.get(id)?.number ?? "", map: m && (m.latest || m.fall) ? m : null,
      status: st.status, statusWhy: st.why, intensity: m ? intensityOf(m.gap, m.latest?.percentile ?? null) : null,
      level: levels.get(id)?.level ?? null, categories: levels.get(id)?.categories ?? {}, practice: p, work: work.get(id)!,
      weakest: (m?.goals ?? []).slice(0, 2).map((g) => g.name), mastered: mastery.get(id)?.mastered ?? 0, needsWork: mastery.get(id)?.needsWork ?? 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((t, x) => t + x, 0) / xs.length) : null);

export async function classProgress(repo: Repo, actor: Actor, classId: string, subject: Subject = "READING", now = new Date()): Promise<ClassProgress> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const rows = await rowsFor(repo, ids, grade, subject, actor.schoolId, now);
  const week = now.getTime() - 7 * 86_400_000;
  let canAssign = false;
  if (actor.role === "TEACHER") { const t = await repo.findUnique("Teacher", { userId: actor.userId }); canAssign = Boolean(t && (await repo.findUnique("ClassTeacher", { classId, teacherId: t.id }))); }
  return {
    classId, className: s(klass.name), grade, subject, rows, canAssign,
    summary: {
      students: rows.length, tested: rows.filter((r) => r.map).length, onTrack: rows.filter((r) => r.status === "ON_TRACK" || r.status === "MET").length,
      atRisk: rows.filter((r) => r.status === "AT_RISK" || r.status === "MISSED").length, activeWeek: rows.filter((r) => r.practice.lastActive && time(r.practice.lastActive) >= week).length,
      late: rows.reduce((t, r) => t + r.work.late, 0), avgFall: avg(rows.filter((r) => r.map?.fall).map((r) => r.map!.fall!.rit)), avgTarget: avg(rows.filter((r) => r.map?.springTarget).map((r) => r.map!.springTarget!)),
    },
  };
}

// ------------------------------------------------------------------ one student

export interface PlanArea { area: string; rit: number | null; skills: { id: string; name: string; mastery: number | null; assigned: boolean }[] }
export interface StudentProgress {
  row: ProgressRow; classId: string; className: string; grade: number; subject: Subject;
  plan: { intensity: Intensity | null; startLevel: Level; why: string; areas: PlanArea[] };
  history: { at: string; category: string | null; from: string | null; to: string; source: string; outcome: string }[];
  mapPoints: { term: string; rit: number }[];
  recent: { title: string; status: string; dueAt: string | null }[];
  canAssign: boolean;
}

async function studentClass(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const classes = await readableClasses(repo, actor);
  const m = classes.length ? await repo.findMany("ClassMembership", { studentId, classId: { in: classes.map((c) => c.id) }, leftAt: null }) : [];
  const klass = classes.find((c) => m.some((x) => x.classId === c.id));
  if (!klass) throw new ForbiddenError("This student is not in your classes.");
  return klass;
}

export async function studentProgress(repo: Repo, actor: Actor, studentId: string, subject: Subject = "READING", now = new Date()): Promise<StudentProgress> {
  assertCan(actor, "reports:read");
  const klass = await studentClass(repo, actor, studentId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const [row] = await rowsFor(repo, [studentId], grade, subject, actor.schoolId, now);
  // plan: weakest goal areas (by goal RIT) → that area's skills, weakest mastery first; without goal scores: all areas
  const areas = await gradeAreaSkills(repo, actor.schoolId!, grade);
  const [mastery, open] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "score"] }),
    repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId", "status"] }),
  ]);
  const openIds = open.filter((o) => o.status !== "COMPLETED").map((o) => s(o.assignmentId));
  const openSkills = new Set(openIds.length ? (await repo.findMany("Assignment", { id: { in: openIds }, deletedAt: null }, { select: ["skillId"] })).map((a) => s(a.skillId)) : []);
  const mOf = new Map(mastery.map((m) => [s(m.skillId), Math.round(Number(m.score))]));
  const goals = row.map?.goals ?? [];
  const goalAreaIds = new Set(goals.map((g) => g.areaId).filter(Boolean));
  const ranked = goals.length
    ? areas.filter((a) => goalAreaIds.has(a.areaId)).map((a) => ({ a, rit: goals.find((g) => g.areaId === a.areaId)?.rit ?? null })).sort((x, y) => Number(x.rit) - Number(y.rit))
    : areas.map((a) => ({ a, rit: null as number | null }));
  const planAreas: PlanArea[] = ranked.slice(0, goals.length ? 2 : 3).map(({ a, rit }) => ({
    area: a.area, rit,
    skills: a.skills.map((k) => ({ id: k.id, name: k.name, mastery: mOf.get(k.id) ?? null, assigned: openSkills.has(k.id) })).sort((x, y) => (x.mastery ?? -1) - (y.mastery ?? -1) || x.name.localeCompare(y.name)).slice(0, 3),
  })).filter((x) => x.skills.length);
  const pct = row.map?.latest?.percentile ?? null;
  const startLevel: Level = row.level ?? (pct === null ? "ON" : pct < 41 ? "BELOW" : pct > 60 ? "ABOVE" : "ON");
  const why = row.level ? "The level set for the student (board / their work)." : pct === null ? "No data yet: On Level." : `MAP ${row.map!.latest!.term}: ${pct}th percentile.`;
  // history of level changes
  const logs = (await repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change" })).sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 15);
  const history = logs.map((l) => { const a = (l.after ?? {}) as Record<string, unknown>, b = (l.before ?? {}) as Record<string, unknown>; return { at: new Date(time(l.createdAt)).toISOString(), category: a.category ? s(a.category) : null, from: b.level ? s(b.level) : null, to: s(a.level), source: s(a.source), outcome: s(a.outcome) }; });
  const mapPoints = (await repo.findMany("MapResult", { studentId })).filter((r) => !r.goalName && (subject === "READING" ? /read/i : /language/i).test(s(r.subject))).sort((a, b) => time(a.testDate) - time(b.testDate)).map((r) => ({ term: s(r.termName), rit: Number(r.rit) }));
  const asg = await repo.findMany("AssignmentStudent", { studentId });
  const aRows = asg.length ? await repo.findMany("Assignment", { id: { in: asg.map((x) => x.assignmentId) }, deletedAt: null }, { select: ["id", "title", "dueAt", "createdAt"] }) : [];
  const recent = aRows.sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 8).map((a) => ({ title: s(a.title), status: s(asg.find((x) => x.assignmentId === a.id)?.status), dueAt: a.dueAt ? new Date(time(a.dueAt)).toISOString() : null }));
  let canAssign = false;
  if (actor.role === "TEACHER") { const t = await repo.findUnique("Teacher", { userId: actor.userId }); canAssign = Boolean(t && (await repo.findUnique("ClassTeacher", { classId: klass.id, teacherId: t.id }))); }
  return { row, classId: s(klass.id), className: s(klass.name), grade, subject, plan: { intensity: row.intensity, startLevel, why, areas: planAreas }, history, mapPoints, recent, canAssign };
}

// ------------------------------------------------------------------ alerts

export type AlertKind = "AT_RISK" | "DROPPED" | "NOT_STARTED";
export interface Alert { kind: AlertKind; studentId: string; name: string; className: string; detail: string; at: string }

/** The teacher's students who need attention now (computed fresh on every visit: nothing to clear). */
export async function teacherAlerts(repo: Repo, actor: Actor, now = new Date()): Promise<Alert[]> {
  assertCan(actor, "reports:read");
  const classes = actor.role === "TEACHER" ? await readableClasses(repo, actor) : [];
  if (!classes.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return [];
  const classOf = new Map(members.map((m) => [s(m.studentId), s(classes.find((c) => c.id === m.classId)?.name)]));
  const names = await studentNames(repo, ids);
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const gradeOfStudent = new Map(members.map((m) => [s(m.studentId), Number(grades.find((g) => g.id === classes.find((c) => c.id === m.classId)?.gradeId)?.level ?? 0)]));
  const [maps, practice] = await Promise.all([mapSummaries(repo, ids, "READING", gradeOfStudent), practiceStats(repo, ids, now)]);
  const out: Alert[] = [];
  const nameOf = (id: string) => names.get(id)?.name ?? "Student";
  for (const id of ids) {
    const st = statusOf(maps.get(id), practice.get(id));
    if (st.status === "AT_RISK" || st.status === "MISSED") out.push({ kind: "AT_RISK", studentId: id, name: nameOf(id), className: classOf.get(id) ?? "", detail: st.why, at: now.toISOString() });
  }
  // dropped a level twice in a row (same category), in the last 30 days
  const RANK: Record<string, number> = { SUPPORT: -1, BELOW: 0, ON: 1, ABOVE: 2, CHALLENGE: 3 };
  const logs = await repo.findMany("AuditLog", { entityType: "Student", entityId: { in: ids }, action: "level.change" });
  const byKey = new Map<string, Row[]>();
  for (const l of logs) { const a = (l.after ?? {}) as Record<string, unknown>; if (a.outcome !== "CHANGED") continue; const k = `${s(l.entityId)}|${s(a.category)}`; byKey.set(k, [...(byKey.get(k) ?? []), l]); }
  for (const [k, list] of byKey) {
    const [last, prev] = list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    if (!last || !prev || time(last.createdAt) < now.getTime() - 30 * 86_400_000) continue;
    const down = (l: Row) => RANK[s(((l.after ?? {}) as Record<string, unknown>).level)] < RANK[s(((l.before ?? {}) as Record<string, unknown>).level)];
    if (down(last) && down(prev)) { const id = k.split("|")[0], cat = k.split("|")[1]; out.push({ kind: "DROPPED", studentId: id, name: nameOf(id), className: classOf.get(id) ?? "", detail: `Dropped a level twice in a row${cat && cat !== "undefined" ? ` (${cat})` : ""}.`, at: new Date(time(last.createdAt)).toISOString() }); }
  }
  // assigned work not started by its due date (last 30 days)
  const asg = await repo.findMany("AssignmentStudent", { studentId: { in: ids }, status: { in: ["NOT_STARTED", "OVERDUE"] } }, { select: ["studentId", "assignmentId", "progress"] });
  const as = asg.length ? await repo.findMany("Assignment", { id: { in: [...new Set(asg.map((a) => s(a.assignmentId)))] }, deletedAt: null }, { select: ["id", "title", "dueAt"] }) : [];
  const late = new Map(as.filter((a) => a.dueAt && time(a.dueAt) < now.getTime() && time(a.dueAt) > now.getTime() - 30 * 86_400_000).map((a) => [s(a.id), a]));
  const count = new Map<string, { n: number; title: string; at: number }>();
  for (const r of asg) { const a = late.get(s(r.assignmentId)); if (!a || Number(r.progress ?? 0) > 0) continue; const c = count.get(s(r.studentId)) ?? { n: 0, title: s(a.title), at: time(a.dueAt) }; c.n++; count.set(s(r.studentId), c); }
  const rtr = await repo.findMany("RespondAssignmentStudent", { studentId: { in: ids }, finishedAt: null });
  const ra = rtr.length ? await repo.findMany("RespondAssignment", { id: { in: [...new Set(rtr.map((r) => s(r.assignmentId)))] }, deletedAt: null }) : [];
  for (const r of rtr) { const a = ra.find((x) => x.id === r.assignmentId); if (!a?.dueAt || time(a.dueAt) >= now.getTime() || time(a.dueAt) < now.getTime() - 30 * 86_400_000) continue; const c = count.get(s(r.studentId)) ?? { n: 0, title: s(a.title), at: time(a.dueAt) }; c.n++; count.set(s(r.studentId), c); }
  for (const [id, c] of count) out.push({ kind: "NOT_STARTED", studentId: id, name: nameOf(id), className: classOf.get(id) ?? "", detail: c.n === 1 ? `Did not start “${c.title.replace(/\s*\((?:adaptive[^)]*|(?:Below|On|Above) Level)\)/g, "")}” by its due date.` : `${c.n} tasks not started by their due date.`, at: new Date(c.at).toISOString() });
  const order: Record<AlertKind, number> = { AT_RISK: 0, DROPPED: 1, NOT_STARTED: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ grade summary

export interface GradeSummary { grade: number; classes: { classId: string; className: string; teacher: string; students: number; tested: number; avgFall: number | null; avgTarget: number | null; onTrack: number; atRisk: number; activeWeek: number; accuracy: number | null; done: number; late: number; levels: Record<Level | "NONE", number> }[] }

/** Admin (every grade) or a grade coordinator (their grades): each class in numbers. */
export async function gradeSummary(repo: Repo, actor: Actor, subject: Subject = "READING", now = new Date()): Promise<GradeSummary[]> {
  assertCan(actor, "reports:read");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN" && actor.role !== "TEACHER") throw new ForbiddenError();
  const grades = await coordinatorGrades(repo, actor);
  if (!grades.length) throw new ForbiddenError("The grade summary is for admins and grade coordinators.");
  const gradeRows = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => grades.includes(Number(g.level)));
  const out: GradeSummary[] = [];
  const week = now.getTime() - 7 * 86_400_000;
  for (const g of gradeRows.sort((a, b) => Number(a.level) - Number(b.level))) {
    const classes = (await repo.findMany("Class", { schoolId: actor.schoolId, gradeId: g.id, deletedAt: null })).sort((a, b) => s(a.name).localeCompare(s(b.name)));
    const list: GradeSummary["classes"] = [];
    for (const c of classes) {
      const ids = await classMembers(repo, s(c.id));
      const rows = await rowsFor(repo, ids, Number(g.level), subject, actor.schoolId, now);
      const links = await repo.findMany("ClassTeacher", { classId: c.id });
      const teachers = links.length ? await repo.findMany("Teacher", { id: { in: links.map((l) => l.teacherId) } }, { select: ["userId"] }) : [];
      const users = teachers.length ? await repo.findMany("User", { id: { in: teachers.map((t) => t.userId) } }, { select: ["displayName"] }) : [];
      const answers = rows.reduce((t, r) => t + r.practice.answers, 0), correct = rows.reduce((t, r) => t + r.practice.correct, 0);
      const levels: Record<Level | "NONE", number> = { BELOW: 0, ON: 0, ABOVE: 0, NONE: 0 };
      for (const r of rows) levels[r.level ?? "NONE"]++;
      list.push({
        classId: s(c.id), className: s(c.name), teacher: users.map((u) => s(u.displayName)).join(", ") || "—", students: rows.length, tested: rows.filter((r) => r.map).length,
        avgFall: avg(rows.filter((r) => r.map?.fall).map((r) => r.map!.fall!.rit)), avgTarget: avg(rows.filter((r) => r.map?.springTarget).map((r) => r.map!.springTarget!)),
        onTrack: rows.filter((r) => r.status === "ON_TRACK" || r.status === "MET").length, atRisk: rows.filter((r) => r.status === "AT_RISK" || r.status === "MISSED").length,
        activeWeek: rows.filter((r) => r.practice.lastActive && time(r.practice.lastActive) >= week).length, accuracy: answers ? Math.round((correct / answers) * 100) : null,
        done: rows.reduce((t, r) => t + r.work.done, 0), late: rows.reduce((t, r) => t + r.work.late, 0), levels,
      });
    }
    out.push({ grade: Number(g.level), classes: list });
  }
  return out;
}
