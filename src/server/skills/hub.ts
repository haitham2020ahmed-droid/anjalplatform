/**
 * 🧩 Skill Hub: everything the platform knows about one skill, joined up — its grade and units, its MAP goal
 * area and the RIT of its questions, its CCSS standards and the Learning Continuum statements it practises,
 * the Curriculum Map places its questions sit in, the skills before and after it, and how the students
 * (a teacher's classes, or the whole grade for admins) are doing in it.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { groupPools, GROUPS, type GroupKey } from "../map/map-plan";
import { continuumIndex, groupOfGoal, skillsFor } from "../map/continuum";
import { skillRanges } from "../map/skill-plan";

const s = (v: unknown) => String(v ?? "");
const LEVEL = (d: number) => (d <= 3 ? "Below" : d === 4 ? "On" : "Above");

export interface SkillHub {
  id: string; name: string; code: string; description: string | null; grade: number; domain: string; family: string;
  area: { name: string; group: GroupKey | null; subject: string } | null;
  units: { id: string; title: string; number: number }[];
  standards: { code: string; description: string | null }[];
  questions: { published: number; drafts: number; byLevel: Record<"Below" | "On" | "Above", number>; byType: { name: string; n: number }[]; ritLow: number | null; ritHigh: number | null; ranges: string[] };
  places: { code: string; title: string }[];
  statements: { subject: string; band: string; text: string; standards: string }[];
  before: { id: string; name: string }[]; after: { id: string; name: string }[];
  students: { scope: string; total: number; mastered: number; practising: number; notStarted: number; avg: number | null; needHelp: { id: string; name: string; className: string; score: number }[] };
  assignments: number;
}

export async function skillHub(repo: Repo, actor: Actor, skillId: string): Promise<SkillHub> {
  assertCan(actor, "reports:read");
  const k = await repo.findUnique("Skill", { id: skillId });
  if (!k || k.deletedAt) throw new ForbiddenError("Skill not found.");
  const cur = await repo.findUnique("Curriculum", { id: k.curriculumId });
  const g = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!g || s(g.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Skill not found.");
  const grade = Number(g.level);
  const [fam, stdLinks, unitLinks, qs, pre, post, types] = await Promise.all([
    repo.findUnique("SkillFamily", { id: k.familyId }),
    repo.findMany("SkillStandard", { skillId }),
    repo.findMany("UnitSkill", { skillId }, { select: ["unitId"] }),
    repo.findMany("Question", { skillId, deletedAt: null }, { select: ["id", "status", "difficultyLevel", "typeId"] }),
    repo.findMany("SkillPrerequisite", { skillId }, { select: ["prerequisiteSkillId"] }),
    repo.findMany("SkillPrerequisite", { prerequisiteSkillId: skillId }, { select: ["skillId"] }),
    repo.findMany("QuestionType", {}, { select: ["id", "name", "code"] }),
  ]);
  const area = fam?.mapGoalAreaId ? await repo.findUnique("MapGoalArea", { id: fam.mapGoalAreaId }) : null;
  const group = area ? GROUPS.find((x) => x.codes.includes(s(area.code)))?.key ?? null : null;
  const [stds, units, prereqSkills, nextSkills] = await Promise.all([
    stdLinks.length ? repo.findMany("Standard", { id: { in: stdLinks.map((l) => s(l.standardId)) } }, { select: ["code", "description"] }) : Promise.resolve([] as Row[]),
    unitLinks.length ? repo.findMany("Unit", { id: { in: unitLinks.map((u) => s(u.unitId)) } }, { select: ["id", "title", "number"] }) : Promise.resolve([] as Row[]),
    pre.length ? repo.findMany("Skill", { id: { in: pre.map((p) => s(p.prerequisiteSkillId)) }, deletedAt: null }, { select: ["id", "name", "curriculumId"] }) : Promise.resolve([] as Row[]),
    post.length ? repo.findMany("Skill", { id: { in: post.map((p) => s(p.skillId)) }, deletedAt: null }, { select: ["id", "name", "curriculumId"] }) : Promise.resolve([] as Row[]),
  ]);
  // the grade of each linked skill (a skill often leads to the same skill in the next grade)
  const curIds = [...new Set([...prereqSkills, ...nextSkills].map((x) => s(x.curriculumId)))];
  const curs = curIds.length ? await repo.findMany("Curriculum", { id: { in: curIds } }, { select: ["id", "gradeId"] }) : [];
  const gs = curs.length ? await repo.findMany("Grade", { id: { in: curs.map((c) => s(c.gradeId)) } }, { select: ["id", "level"] }) : [];
  const gradeOfSkill = (x: Row) => Number(gs.find((g2) => g2.id === curs.find((c) => c.id === x.curriculumId)?.gradeId)?.level ?? 0);
  const named = (x: Row) => ({ id: s(x.id), name: gradeOfSkill(x) && gradeOfSkill(x) !== grade ? `${s(x.name)} (Grade ${gradeOfSkill(x)})` : s(x.name) });
  const published = qs.filter((q) => q.status === "PUBLISHED");
  const byLevel = { Below: 0, On: 0, Above: 0 };
  for (const q of published) byLevel[LEVEL(Number(q.difficultyLevel ?? 4))]++;
  const typeCount = new Map<string, number>();
  for (const q of published) { const t = types.find((x) => x.id === q.typeId); const n = s(t?.name ?? t?.code ?? "Other"); typeCount.set(n, (typeCount.get(n) ?? 0) + 1); }
  // the RIT of its questions and the skill-plan ranges they cover
  let ritLow: number | null = null, ritHigh: number | null = null, ranges: string[] = [];
  if (group) {
    const pool = ((await groupPools(repo, s(actor.schoolId), grade)).pools.get(group) ?? []).filter((q) => q.skillId === skillId);
    if (pool.length) {
      ritLow = Math.min(...pool.map((q) => q.rit)); ritHigh = Math.max(...pool.map((q) => q.rit));
      ranges = (await skillRanges(repo, grade)).filter((r) => pool.some((q) => q.rit >= r.low && q.rit <= r.high)).map((r) => r.label);
    }
  }
  // Curriculum Map places of its questions
  const links = published.length ? await repo.findMany("QuestionMapLink", { questionId: { in: published.map((q) => q.id) } }, { select: ["nodeId"] }) : [];
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["code", "title", "sortOrder"] }) : [];
  // Learning Continuum statements that link to this skill
  const statements: SkillHub["statements"] = [];
  if (group && (await repo.count("LearningStatement", {})) > 0) {
    const subject = GROUPS.find((x) => x.key === group)!.subject;
    const ix = await continuumIndex(repo, s(actor.schoolId), grade, subject);
    const seen = new Set<string>();
    for (const r of ix.rows) {
      if (groupOfGoal(s(r.goalArea)) !== group) continue;
      const codes = s(r.standards).split(/\s+/).filter(Boolean);
      if (!skillsFor(ix, codes, group, 6, `${s(r.topic)} ${s(r.statement)}`).some((x) => x.id === skillId)) continue;
      const key = s(r.statement).toLowerCase();
      if (seen.has(key)) continue; seen.add(key);
      statements.push({ subject, band: `${r.ritLow}–${r.ritHigh}`, text: s(r.statement), standards: s(r.standards) });
    }
  }
  // students: a teacher's classes; admins the grade
  const classes = (await readableClasses(repo, actor)).filter((c) => s(c.gradeId) === s(g.id));
  const mem = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const ids = [...new Set(mem.map((m) => s(m.studentId)))];
  const [mastery, sts] = await Promise.all([
    ids.length ? repo.findMany("StudentSkillMastery", { skillId, studentId: { in: ids } }, { select: ["studentId", "score", "isMastered", "attempts"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
  ]);
  const users = sts.length ? await repo.findMany("User", { id: { in: sts.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = (id: string) => s(users.find((u) => u.id === sts.find((x) => x.id === id)?.userId)?.displayName) || "Student";
  const started = mastery.filter((m) => Number(m.attempts) > 0);
  const assignments = await repo.count("Assignment", { skillId, deletedAt: null });
  return {
    id: skillId, name: s(k.name), code: s(k.code), description: k.description ? s(k.description) : null, grade, domain: s(k.domain), family: s(fam?.name),
    area: area ? { name: s(area.name), group, subject: s(area.subject) } : null,
    units: units.map((u) => ({ id: s(u.id), title: s(u.title), number: Number(u.number) })).sort((a, b) => a.number - b.number),
    standards: stds.map((x) => ({ code: s(x.code).replace(/^CCSS\.ELA-LITERACY\./, ""), description: x.description ? s(x.description) : null })).sort((a, b) => a.code.localeCompare(b.code)),
    questions: { published: published.length, drafts: qs.length - published.length, byLevel, byType: [...typeCount].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n), ritLow, ritHigh, ranges },
    places: nodes.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map((n) => ({ code: s(n.code), title: s(n.title) })),
    statements: statements.slice(0, 40),
    before: prereqSkills.map(named), after: nextSkills.map(named),
    students: {
      scope: actor.role === "TEACHER" ? "Your classes" : `Grade ${grade}`, total: ids.length,
      mastered: mastery.filter((m) => m.isMastered).length, practising: started.filter((m) => !m.isMastered).length, notStarted: ids.length - started.length,
      avg: started.length ? Math.round(started.reduce((t, m) => t + Number(m.score), 0) / started.length) : null,
      needHelp: started.filter((m) => !m.isMastered && Number(m.score) < 50).sort((a, b) => Number(a.score) - Number(b.score)).slice(0, 12).map((m) => ({ id: s(m.studentId), name: nameOf(s(m.studentId)), className: s(classes.find((c) => c.id === mem.find((x) => x.studentId === m.studentId)?.classId)?.name), score: Math.round(Number(m.score)) })),
    },
    assignments,
  };
}
