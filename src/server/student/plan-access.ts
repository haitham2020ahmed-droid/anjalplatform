/**
 * 🗺️ A skill in the student's OWN plan opens its questions — even when it belongs to another grade.
 *
 * Root cause of "This skill is for another grade. Here is your own work" from My Plan: the practice page let a
 * student in only for (1) assigned work, (2) the MAP practice skills of their OWN grade's curriculum, (3) any skill
 * of their own grade. A plan, though, may give a student a skill of another grade (a Grade 4 skill for a Grade 5
 * student: the "Reinforce" band of the Personal Study Plan, a teacher's MAP plan built from the student's RIT), and
 * those links were refused.
 *
 * Now a skill (or another grade's copy of it: one skill family, one pooled bank) counts as the student's when it is in
 *   · a MAP plan the teacher SENT to the student (MapPlan.items[].skillIds), or
 *   · the student's Personal Study Plan (the platform plan from their MAP scores, Reading and Language Usage).
 * Random skills of another grade that no plan gives the student stay closed. The adaptive engine is unchanged: the
 * practice starts at the student's own level on the skill's family bank, as always.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { skillFamilyIds } from "../questions/skill-questions";

const s = (v: unknown) => String(v ?? "");
const json = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };

/** The skill ids a teacher-sent MAP plan gives the student (bounded: one student's SENT plans). */
export async function sentMapPlanSkills(repo: Repo, studentId: string): Promise<Set<string>> {
  const rows = await repo.findMany("MapPlan", { studentId, status: "SENT" }, { select: ["items"], take: 50 });
  const out = new Set<string>();
  for (const r of rows) {
    const items = json(r.items);
    if (!Array.isArray(items)) continue;
    for (const it of items) for (const k of (Array.isArray((it as { skillIds?: unknown })?.skillIds) ? (it as { skillIds: unknown[] }).skillIds : [])) out.add(s(k));
  }
  return out;
}

/** The skill ids linked in the student's Personal Study Plan (both subjects; nothing when there is no MAP score). */
async function studyPlanSkills(repo: Repo, actor: Actor, studentId: string): Promise<Set<string>> {
  const { studyPlan } = await import("../map/map-reports");
  const out = new Set<string>();
  for (const subject of ["READING", "LANGUAGE"] as const) {
    try {
      const d = await studyPlan(repo, actor, studentId, subject, { full: true });
      for (const a of d.areas) for (const st of a.stages) for (const t of st.topics) for (const x of t.statements) for (const k of x.skills) out.add(s(k.id));
    } catch { /* no MAP data for this subject: nothing from it */ }
  }
  return out;
}

/** True when the skill (or its family) is in one of the student's own plans. Server-side; students only. */
export async function isPlanSkill(repo: Repo, actor: Actor, skillId: string): Promise<boolean> {
  if (actor.role !== "STUDENT" || !actor.studentId) return false;
  const studentId = actor.studentId;
  const fam = new Set([skillId, ...(await skillFamilyIds(repo, skillId))]);
  const hit = (ids: Set<string>) => [...ids].some((k) => fam.has(k));
  if (hit(await sentMapPlanSkills(repo, studentId))) return true;
  return hit(await studyPlanSkills(repo, actor, studentId));
}
