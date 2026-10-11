/**
 * The teacher names of some classes, for the top of printed class sheets (read only; the caller has already
 * checked that this person may open these classes).
 */
import type { Repo } from "../server/seeding/repo";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export async function classTeacherNames(repo: Repo, classIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(classIds.filter(Boolean))];
  if (!ids.length) return out;
  const links = await repo.findMany("ClassTeacher", { classId: { in: ids } }, { select: ["classId", "teacherId"] });
  const teachers = links.length ? await repo.findMany("Teacher", { id: { in: [...new Set(links.map((l) => s(l.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  const users = teachers.length ? await repo.findMany("User", { id: { in: teachers.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const userOf = new Map(teachers.map((x) => [s(x.id), s(users.find((u) => s(u.id) === s(x.userId))?.displayName)]));
  for (const l of links) {
    const name = userOf.get(s(l.teacherId));
    if (!name) continue;
    const before = out.get(s(l.classId));
    out.set(s(l.classId), before ? (before.split(" · ").includes(name) ? before : `${before} · ${name}`) : name);
  }
  return out;
}
