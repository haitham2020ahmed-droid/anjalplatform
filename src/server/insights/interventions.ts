/**
 * 🎯 Interventions with measured impact.
 *
 * A teacher starts an intervention: a small group, one skill, a period (default 14 days). The platform saves
 * each student's mastery at the start, shows the change while it runs, and at the end compares before and
 * after, tells the teacher the result, and keeps it, so the school learns which interventions work.
 */
import { assertClassAccess } from "../teacher/assignments";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";

const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");
const json = <T,>(v: unknown, d: T): T => { if (v === null || v === undefined) return d; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return d; } } return v as T; };

export interface InterventionView {
  id: string; title: string; classId: string; skillId: string; skillName: string; status: "ACTIVE" | "DONE";
  startedAt: string; endsAt: string; daysLeft: number;
  students: { id: string; name: string; before: number; now: number; change: number }[];
  avgChange: number; improved: number; total: number;
}

async function mastery(repo: Repo, studentIds: string[], skillId: string): Promise<Map<string, number>> {
  if (!studentIds.length) return new Map();
  const rows = await repo.findMany("StudentSkillMastery", { studentId: { in: studentIds }, skillId }, { select: ["studentId", "score"] });
  return new Map(rows.map((r) => [s(r.studentId), Math.round(Number(r.score))]));
}

export async function startIntervention(repo: Repo, actor: Actor, input: { classId: string; skillId: string; studentIds: string[]; days?: number; title?: string }, now = new Date()): Promise<string> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can start interventions.");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const members = new Set((await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  const ids = [...new Set(input.studentIds)].filter((id) => members.has(id));
  if (!ids.length) throw new ValidationError("Choose at least one student of this class.");
  const skill = await repo.findUnique("Skill", { id: input.skillId });
  if (!skill || skill.deletedAt) throw new ValidationError("Skill not found.");
  const days = Math.max(3, Math.min(42, Math.round(input.days ?? 14)));
  const before = await mastery(repo, ids, input.skillId);
  const row = await repo.create("Intervention", {
    schoolId: klass.schoolId, classId: input.classId, skillId: input.skillId, title: (input.title || `${s(skill.name)} group`).slice(0, 120),
    studentIds: ids, createdById: actor.userId, startedAt: now, endsAt: new Date(now.getTime() + days * DAY),
    baseline: Object.fromEntries(ids.map((id) => [id, before.get(id) ?? 0])), status: "ACTIVE",
  });
  return s(row.id);
}

async function view(repo: Repo, r: Row, now: Date): Promise<InterventionView> {
  const ids = json<string[]>(r.studentIds, []);
  const base = json<Record<string, number>>(r.baseline, {});
  const done = s(r.status) === "DONE";
  const current = done ? json<Record<string, number>>(r.result, {}) : Object.fromEntries(await mastery(repo, ids, s(r.skillId)));
  const st = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const name = (id: string) => s(users.find((u) => u.id === st.find((x) => x.id === id)?.userId)?.displayName ?? "Student");
  const students = ids.map((id) => { const b = Number(base[id] ?? 0), n = Number(current[id] ?? b); return { id, name: name(id), before: b, now: n, change: n - b }; }).sort((a, b) => b.change - a.change);
  const skill = await repo.findUnique("Skill", { id: r.skillId });
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v));
  return {
    id: s(r.id), title: s(r.title), classId: s(r.classId), skillId: s(r.skillId), skillName: s(skill?.name), status: done ? "DONE" : "ACTIVE",
    startedAt: t(r.startedAt).toISOString().slice(0, 10), endsAt: t(r.endsAt).toISOString().slice(0, 10), daysLeft: Math.max(0, Math.ceil((t(r.endsAt).getTime() - now.getTime()) / DAY)),
    students, avgChange: students.length ? Math.round(students.reduce((a, x) => a + x.change, 0) / students.length) : 0,
    improved: students.filter((x) => x.change >= 5).length, total: students.length,
  };
}

/** Interventions of a class (newest first). */
export async function classInterventions(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<InterventionView[]> {
  await assertClassAccess(repo, actor, classId);
  const rows = (await repo.findMany("Intervention", { classId })).sort((a, b) => s(b.startedAt instanceof Date ? b.startedAt.toISOString() : b.startedAt).localeCompare(s(a.startedAt instanceof Date ? a.startedAt.toISOString() : a.startedAt)));
  return Promise.all(rows.slice(0, 30).map((r) => view(repo, r, now)));
}

/** Ends the interventions whose period is over: saves the result and tells the teacher. Returns how many. */
export async function evaluateInterventions(repo: Repo, now = new Date(), schoolId?: string): Promise<number> {
  const rows = (await repo.findMany("Intervention", { status: "ACTIVE", ...(schoolId ? { schoolId } : {}), endsAt: { lte: now } })).slice(0, 500);
  for (const r of rows) {
    const ids = json<string[]>(r.studentIds, []);
    const after = Object.fromEntries(await mastery(repo, ids, s(r.skillId)));
    const updated = await repo.updateMany("Intervention", { id: r.id, status: "ACTIVE" }, { status: "DONE", result: after, evaluatedAt: now });
    if (updated !== 1) continue;
    const v = await view(repo, { ...r, status: "DONE", result: after }, now);
    await repo.create("Notification", {
      userId: r.createdById, type: "INTERVENTION_ALERT", title: `🎯 Intervention result: ${v.title}`,
      body: `${v.improved} of ${v.total} students improved by 5+ points on ${v.skillName} (average change ${v.avgChange >= 0 ? "+" : ""}${v.avgChange}).`,
      link: `/teacher/intervention/groups?class=${s(r.classId)}`, readAt: null, createdAt: now,
    });
  }
  return rows.length;
}

/** What worked at school level: finished interventions by skill (average change, students improved). */
export async function interventionImpact(repo: Repo, schoolId: string): Promise<{ skillName: string; groups: number; students: number; improvedPct: number; avgChange: number }[]> {
  const rows = await repo.findMany("Intervention", { schoolId, status: "DONE" });
  const by = new Map<string, { groups: number; students: number; improved: number; change: number }>();
  for (const r of rows) {
    const base = json<Record<string, number>>(r.baseline, {}), res = json<Record<string, number>>(r.result, {});
    const g = by.get(s(r.skillId)) ?? { groups: 0, students: 0, improved: 0, change: 0 };
    g.groups++;
    for (const id of json<string[]>(r.studentIds, [])) { const c = Number(res[id] ?? 0) - Number(base[id] ?? 0); g.students++; g.change += c; if (c >= 5) g.improved++; }
    by.set(s(r.skillId), g);
  }
  const names = new Map((by.size ? await repo.findMany("Skill", { id: { in: [...by.keys()] } }, { select: ["id", "name"] }) : []).map((k) => [s(k.id), s(k.name)]));
  return [...by.entries()].map(([id, g]) => ({ skillName: names.get(id) ?? "", groups: g.groups, students: g.students, improvedPct: g.students ? Math.round((100 * g.improved) / g.students) : 0, avgChange: g.students ? Math.round(g.change / g.students) : 0 })).sort((a, b) => b.improvedPct - a.improvedPct);
}
