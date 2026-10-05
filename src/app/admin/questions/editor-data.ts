import type { Repo } from "@/server/seeding/repo";

/** Skills (with grade) and standard codes for the editor's pickers, for one school. */
export async function editorOptions(repo: Repo, schoolId: string) {
  const grades = await repo.findMany("Grade", { schoolId });
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
  const skills = curricula.length ? await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } }) : [];
  const level = (skill: Record<string, unknown>) => Number(grades.find((g) => g.id === curricula.find((c) => c.id === skill.curriculumId)?.gradeId)?.level ?? 0);
  const standards = (await repo.findMany("Standard", { framework: "CCSS_ELA" })).map((s) => String(s.code)).sort();
  return {
    skills: skills.map((s) => ({ id: String(s.id), grade: level(s), name: String(s.name) })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)),
    standards,
  };
}
