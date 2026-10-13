/**
 * 🧩 ONE source for every skill picker (Live Challenge, test builder, worksheets, week plan, Assignments → New,
 * QR skill games, writing tasks, admin tools …):
 *
 *   - every ACTIVE skill of the school (masterSkills: Skills, Grammar, Vocabulary, Writing, gap sets, Curriculum
 *     Map and MAP skills) — never the hidden "Unclassified (Curriculum Map)" holder;
 *   - ONE row per shared question pool (the same skill in Grades 4, 5 and 6 is one row). The row stands for the copy
 *     of the teacher's own grade (else `preferGrade`, else the lowest grade); its `names` hold every member's name,
 *     so the row is found by either name;
 *   - the pool's published question count (0 → the picker shows it disabled, "0 Q");
 *   - one domain tab each (Reading · Grammar · Vocabulary · Writing), A–Z.
 *
 * Teachers: the skills of their own grades (as the copy of their grade) and — all content being open to every
 * teacher — the skills taught only in other grades; admins: every grade. Searching and tab filtering use the pure
 * rules of lib/skill-picker (the same in the browser and on the server).
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { masterSkills } from "./master";
import { schoolSkillIndex } from "../questions/skill-questions";
import { readableClasses } from "../teacher/coordinators";
import { byName, filterSkills, skillSearchKey, skillTabOf, type PickerSkill, type SkillTabFilter } from "../../lib/skill-picker";

export type { PickerSkill } from "../../lib/skill-picker";
const s = (v: unknown) => String(v ?? "");

/** The grades of a teacher's classes (own and coordinated); [] for admins (= every grade). */
export async function teacherGradeLevels(repo: Repo, actor: Actor): Promise<number[]> {
  if (actor.role !== "TEACHER") return [];
  const classes = await readableClasses(repo, actor);
  const ids = [...new Set(classes.map((c) => s(c.gradeId)).filter(Boolean))];
  const rows = ids.length ? await repo.findMany("Grade", { id: { in: ids } }, { select: ["level"] }) : [];
  return [...new Set(rows.map((g) => Number(g.level)))].sort((a, b) => a - b);
}

export interface PickerOptions {
  /** the copy of this grade stands for a pool when there is one (e.g. the class's grade) */
  preferGrade?: number | null;
  /** a search (any name of the pool; case, "&" / "and" and apostrophes ignored) */
  q?: string;
  /** a domain tab */
  tab?: SkillTabFilter;
  /** only the skills taught in this grade (as that grade's copy), e.g. QR skill games a class's students may play */
  onlyGrade?: number | null;
}

/** Every skill a picker lists (see the file comment). Bounded reads: the master list + the cached skill index. */
export async function skillPickerList(repo: Repo, actor: Actor, opts: PickerOptions = {}): Promise<PickerSkill[]> {
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Teachers and admins only.");
  const schoolId = s(actor.schoolId);
  const [all, idx, mine] = await Promise.all([masterSkills(repo, schoolId), schoolSkillIndex(repo, schoolId), teacherGradeLevels(repo, actor)]);
  const own = new Set(mine);
  const only = Number(opts.onlyGrade) || 0;
  const prefer = only || Number(opts.preferGrade) || 0;
  const pools = new Map<string, typeof all>();
  for (const k of all) {
    const key = idx.keyOf.get(k.id) ?? `solo:${k.id}`;
    const l = pools.get(key); if (l) l.push(k); else pools.set(key, [k]);
  }
  const rank = (g: number) => (prefer && g === prefer ? 0 : own.has(g) ? 1 : 2);
  const rows: PickerSkill[] = [];
  for (const members of pools.values()) {
    if (only && !members.some((m) => m.grade === only)) continue;
    const rep = [...members].sort((a, b) => rank(a.grade) - rank(b.grade) || a.grade - b.grade || b.questions - a.questions || a.id.localeCompare(b.id))[0];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const n of [rep.name, ...members.map((m) => m.name)]) { const key = skillSearchKey(n); if (key && !seen.has(key)) { seen.add(key); names.push(n); } }
    const ix = idx.skillOf.get(rep.id);
    rows.push({
      id: rep.id, name: rep.name, names, code: rep.code, grade: rep.grade, tab: skillTabOf(ix?.domain, rep.code),
      // the pool's count (masterSkills counts the whole family: every grade's copy reads the same questions)
      questions: Math.max(...members.map((m) => m.questions)),
      skillIds: [rep.id, ...members.map((m) => m.id).filter((id) => id !== rep.id)],
    });
  }
  return filterSkills(rows, opts.q ?? "", opts.tab ?? "ALL").sort(byName);
}

/** The picker row (if any) that holds a skill id — for checking a chosen id against the list. */
export function pickerRowOf(rows: readonly PickerSkill[], skillId: string): PickerSkill | undefined {
  return rows.find((k) => k.id === skillId) ?? rows.find((k) => k.skillIds.includes(skillId));
}
