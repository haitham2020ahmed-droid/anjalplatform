/**
 * 📋 New MAP scores → plans at once: after an import or typed scores, every class of those students gets its
 * individual plan drafts (Reading and Language Usage) without opening the plans page first, and the class
 * teachers are told when someone else (the admin) imported them.
 * A draft nobody has edited yet is made again from the new scores; edited or sent plans are kept.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { ensureDrafts } from "./map-plan";

const s = (v: unknown) => String(v ?? "");

export interface AutoPlans { plans: number; classes: { id: string; name: string; plans: number }[] }

export async function draftPlansFor(repo: Repo, actor: Actor, studentIds: string[], now = new Date()): Promise<AutoPlans> {
  const out: AutoPlans = { plans: 0, classes: [] };
  if (!studentIds.length) return out;
  const members = await repo.findMany("ClassMembership", { studentId: { in: studentIds }, leftAt: null }, { select: ["classId", "studentId"] });
  const classIds = [...new Set(members.map((m) => s(m.classId)))];
  // drafts of these students that nobody edited: made again from the new scores
  const stale = await repo.findMany("MapPlan", { studentId: { in: studentIds }, status: "DRAFT", editedAt: null }, { select: ["id"] });
  if (stale.length) await repo.deleteMany("MapPlan", { id: { in: stale.map((p) => p.id) } });
  for (const classId of classIds) {
    let klass;
    try { klass = await assertClassAccess(repo, actor, classId); } catch { continue; }
    let n = 0;
    for (const subject of ["READING", "LANGUAGE"] as const) n += await ensureDrafts(repo, actor, classId, subject, now);
    out.plans += n;
    out.classes.push({ id: classId, name: s(klass.name), plans: n });
    if (n && actor.role !== "TEACHER") {
      const teachers = await repo.findMany("ClassTeacher", { classId }, { select: ["teacherId"] });
      const tRows = teachers.length ? await repo.findMany("Teacher", { id: { in: teachers.map((t) => t.teacherId) } }, { select: ["userId"] }) : [];
      if (tRows.length) await repo.createMany("Notification", tRows.map((t) => ({ userId: t.userId, type: "PARENT_PROGRESS", title: `🗺️ MAP plans ready · ${s(klass.name)}`, body: `New MAP scores: ${n} individual plan draft(s) are ready, and the 3-level group plan (Personalized plan) to check and send.`, link: `/teacher/map-plans?classId=${classId}&tab=plans`, readAt: null, createdAt: now })));
    }
  }
  out.classes.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
