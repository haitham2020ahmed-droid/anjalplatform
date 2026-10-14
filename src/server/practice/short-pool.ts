/**
 * 🕳 Skills whose questions ran out before the 30 the practice rule asks for (r67): the student saw Done, the teacher
 * sees it here (Data Health). Each row is one skill: how many questions its WHOLE pool has (every grade's copy and its
 * Curriculum Map questions), how many students ran out, and when it last happened. Read from the decision log
 * (reasonCode SHORT_POOL, written by practice when the pool ran out): bounded to the last `days` days.
 */
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const CHUNK = 500;
export const SHORT_POOL_CODE = "SHORT_POOL";

export interface ShortPoolRow { skillId: string; name: string; questions: number | null; students: number; last: string }

export async function shortPoolSkills(repo: Repo, studentIds: readonly string[], now = new Date(), days = 60): Promise<ShortPoolRow[]> {
  const ids = [...new Set(studentIds.map(s))].filter(Boolean);
  if (!ids.length) return [];
  const since = new Date(now.getTime() - days * 86_400_000);
  const logs = [];
  for (let i = 0; i < ids.length; i += CHUNK) logs.push(...(await repo.findMany("AdaptiveDecisionLog", { studentId: { in: ids.slice(i, i + CHUNK) }, reasonCode: SHORT_POOL_CODE, createdAt: { gte: since } }, { select: ["studentId", "skillId", "reason", "createdAt"], take: 5000 })));
  if (!logs.length) return [];
  const by = new Map<string, { students: Set<string>; questions: number | null; last: number }>();
  for (const l of logs) {
    const k = s(l.skillId), x = by.get(k) ?? { students: new Set<string>(), questions: null, last: 0 };
    x.students.add(s(l.studentId));
    const m = s(l.reason).match(/(\d+) questions in the skill's whole pool/);
    if (m) x.questions = Number(m[1]);
    x.last = Math.max(x.last, new Date(l.createdAt instanceof Date ? l.createdAt.toISOString() : s(l.createdAt)).getTime());
    by.set(k, x);
  }
  const skills = await repo.findMany("Skill", { id: { in: [...by.keys()] } }, { select: ["id", "name"] });
  const name = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  return [...by].map(([skillId, x]) => ({ skillId, name: name.get(skillId) ?? "Skill", questions: x.questions, students: x.students.size, last: new Date(x.last).toISOString().slice(0, 10) }))
    .sort((a, b) => b.students - a.students || (a.questions ?? 0) - (b.questions ?? 0));
}
