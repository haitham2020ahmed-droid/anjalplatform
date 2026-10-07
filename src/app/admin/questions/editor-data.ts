import type { Repo } from "@/server/seeding/repo";

/** Skills (with grade) and standard codes for the editor's pickers, for one school. */
export async function editorOptions(repo: Repo, schoolId: string) {
  // the standards list does not depend on the skills: read both at once, only the columns used
  const [chain, standardRows] = await Promise.all([
    (async () => {
      const grades = (await repo.findMany("Grade", { schoolId })).filter((g) => g.isActive !== false);
      const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
      const skills = curricula.length ? (await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } }, { select: ["id", "name", "curriculumId", "isActive", "deletedAt"] })).filter((k) => k.isActive !== false && !k.deletedAt) : [];
      return { grades, curricula, skills };
    })(),
    repo.findMany("Standard", { framework: "CCSS_ELA" }, { select: ["code", "isActive"] }).then((r) => r.filter((x) => x.isActive !== false)),
  ]);
  const { grades, curricula, skills } = chain;
  const level = (skill: Record<string, unknown>) => Number(grades.find((g) => g.id === curricula.find((c) => c.id === skill.curriculumId)?.gradeId)?.level ?? 0);
  const standards = standardRows.map((s) => String(s.code)).sort();
  return {
    skills: skills.map((s) => ({ id: String(s.id), grade: level(s), name: String(s.name) })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)),
    grades: grades.map((g) => ({ id: String(g.id), level: Number(g.level) })).sort((a, b) => a.level - b.level),
    standards,
  };
}
