/**
 * 🔎 One search box for staff: students (their file), classes (the class page) and skills (the Skill Hub).
 * Teachers find only their own classes' students; admins the whole school.
 */
import type { Repo } from "./seeding/repo";
import type { Actor } from "./auth/rbac";
import { searchStudents } from "./insights/student-file";
import { readableClasses } from "./teacher/coordinators";
import { masterSkills } from "./skills/master";

export interface SearchHit { kind: "student" | "class" | "skill"; label: string; sub: string; href: string }

export async function globalSearch(repo: Repo, actor: Actor, q: string): Promise<SearchHit[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const words = term.split(/\s+/);
  const has = (v: string) => words.every((w) => v.toLowerCase().includes(w));
  const [students, classes, skills] = await Promise.all([
    searchStudents(repo, actor, term).catch(() => []),
    readableClasses(repo, actor).catch(() => []),
    actor.schoolId ? masterSkills(repo, actor.schoolId, {}).catch(() => []) : Promise.resolve([]),
  ]);
  const out: SearchHit[] = [];
  for (const c of classes.filter((c) => has(String(c.name))).slice(0, 5)) out.push({ kind: "class", label: String(c.name), sub: "Class", href: `/teacher/classes/${c.id}` });
  for (const s of students.slice(0, 8)) out.push({ kind: "student", label: s.name, sub: `Student · ${s.className || `Grade ${s.grade}`}${s.number ? ` · ${s.number}` : ""}`, href: `/admin/student-file/${s.id}` });
  const seen = new Set<string>();
  for (const k of skills.filter((k) => has(k.name))) {
    if (seen.size >= 8) break;
    const key = `${k.name}|${k.grade}`; if (seen.has(key)) continue; seen.add(key);
    out.push({ kind: "skill", label: k.name, sub: `Skill · Grade ${k.grade}`, href: `/skill/${k.id}` });
  }
  return out;
}
