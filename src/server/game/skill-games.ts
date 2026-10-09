/**
 * 🎯 Skill games: a fast, self-paced game for ANY skill of the master list (Grammar included). Each student plays
 * alone at their own level: the questions come from the central bank through the adaptive practice engine, so
 * every answer counts toward the student's mastery, ability and points like practice does. Teachers print QR
 * cards (one per skill); scanning opens the game (after signing in) and the join is recorded for the teacher.
 *
 * Also the student's “My skills” list: assigned skills first, then every other skill of their grade for free practice.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { masterSkills, KIND_NAME, type SkillKind } from "../skills/master";
import { assignedSkills } from "../student/assigned";
import { hideLevels } from "../../lib/hide-levels";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();

async function studentGrade(repo: Repo, actor: Actor): Promise<number> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students play skill games.");
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  return Number(g?.level ?? 0);
}

/** A student may play / practise any skill of their own grade that has questions. */
export async function canPlaySkill(repo: Repo, actor: Actor, skillId: string): Promise<boolean> {
  if (actor.role !== "STUDENT") return false;
  const grade = await studentGrade(repo, actor);
  return (await masterSkills(repo, s(actor.schoolId), { grade, withQuestionsOnly: true })).some((k) => k.id === skillId);
}

export interface MySkill { id: string; name: string; kind: SkillKind; kindName: string; assigned: boolean; dueAt: string | null; status: string | null; progress: number | null }

/** “My skills”: assigned first (with due dates), then the rest of the grade grouped by kind. No level names. */
export async function mySkills(repo: Repo, actor: Actor): Promise<{ assigned: MySkill[]; free: { kind: string; skills: MySkill[] }[] }> {
  const grade = await studentGrade(repo, actor);
  const [all, view] = await Promise.all([masterSkills(repo, s(actor.schoolId), { grade, withQuestionsOnly: true }), assignedSkills(repo, actor)]);
  const assignedItems = view.items.filter((i) => i.kind === "skill" && i.skillId);
  const assigned: MySkill[] = assignedItems.map((i) => {
    const k = all.find((x) => x.id === i.skillId);
    const kind = (k?.kind ?? "OTHER") as SkillKind;
    return { id: i.skillId, name: hideLevels(i.skill), kind, kindName: KIND_NAME[kind], assigned: true, dueAt: i.dueAt, status: i.status, progress: i.progress };
  });
  const taken = new Set(assigned.map((a) => a.id));
  const groups = new Map<string, MySkill[]>();
  for (const k of all.filter((x) => !taken.has(x.id))) groups.set(KIND_NAME[k.kind], [...(groups.get(KIND_NAME[k.kind]) ?? []), { id: k.id, name: k.name, kind: k.kind, kindName: KIND_NAME[k.kind], assigned: false, dueAt: null, status: null, progress: null }]);
  const order = ["Reading", "Vocabulary", "Grammar", "Language", "Other"];
  return { assigned, free: [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([kind, skills]) => ({ kind, skills })) };
}

/** Records that a student opened a skill game (and whether it came from a QR code). */
export async function recordGameJoin(repo: Repo, actor: Actor, skillId: string, via: "QR" | "LINK", now = new Date()): Promise<void> {
  if (actor.role !== "STUDENT" || !actor.studentId) return;
  await repo.create("AuditLog", { actorId: actor.userId, action: "game.join", entityType: "Skill", entityId: skillId, before: null, after: { studentId: actor.studentId, via }, createdAt: now });
}

/** Teacher: who joined skill games by QR code (a class, the last N days). */
export async function qrJoins(repo: Repo, actor: Actor, classId: string, days = 7, now = new Date()): Promise<{ name: string; skill: string; at: string; via: string }[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const members = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  if (!members.length) return [];
  const st = await repo.findMany("Student", { id: { in: members } }, { select: ["id", "userId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const logs = (await repo.findMany("AuditLog", { action: "game.join", actorId: { in: users.map((u) => u.id) } })).filter((l) => time(l.createdAt) >= now.getTime() - days * 86_400_000);
  const skills = logs.length ? await repo.findMany("Skill", { id: { in: [...new Set(logs.map((l) => s(l.entityId)))] } }, { select: ["id", "name"] }) : [];
  return logs.sort((a, b) => time(b.createdAt) - time(a.createdAt)).map((l) => ({
    name: s(users.find((u) => u.id === l.actorId)?.displayName ?? "Student"), skill: s(skills.find((k) => k.id === l.entityId)?.name ?? "Skill"),
    at: new Date(time(l.createdAt)).toISOString(), via: s(((l.after ?? {}) as Record<string, unknown>).via ?? "LINK"),
  }));
}
