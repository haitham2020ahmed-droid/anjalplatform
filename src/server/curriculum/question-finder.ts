/**
 * 🔎 Curriculum → Question Bank bridge. The Curriculum Map drives the learning objectives; the Question Bank
 * provides the practice. The bridge is the SKILL (and its STANDARDS), never a lesson: a bank question does not
 * have to belong to a lesson.
 *
 * findQuestionsForSkill → for one curriculum skill (optionally in one lesson / for one class) the matching
 * PUBLISHED questions of the school's own bank, same grade, in three groups:
 *   lesson   — linked to the lesson (Question.lessonId, or placed on the lesson's Curriculum Map node through
 *              QuestionMapLink) AND about this skill (same skill, or tagged with one of its standards)
 *   skill    — every other question of the same skill (more practice)
 *   standard — same standard(s), same grade, DIFFERENT skill (revision)
 * plus difficulty / DOK counts and the gaps a teacher should know about.
 *
 * buildSkillSet → a balanced ready-made set of N questions: lesson-linked first, then the same skill, spread
 * across difficulty around the class's typical level, plus 1–2 revision items when asked.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";

const s = (v: unknown) => String(v ?? "");
/** bounded reads: a skill rarely has more than a few hundred questions */
const SKILL_CAP = 1000, STANDARD_CAP = 400;
export const RECOMMENDED_PER_SKILL = 20;

export type FinderGroup = "lesson" | "skill" | "standard";
export interface FinderQuestion {
  id: string; stem: string; type: string; difficultyLevel: number; dok: number | null; standardCode: string | null; lessonLinked: boolean;
  /** auto-marked (can go into a ready set) */
  autoScored: boolean; skillId: string;
}
export interface FinderResult {
  skill: { id: string; name: string; grade: number; standards: { id: string; code: string }[] };
  lesson: { id: string; title: string } | null;
  /** the lessons of the curriculum that teach this skill (to pick one) */
  lessons: { id: string; title: string }[];
  groups: Record<FinderGroup, FinderQuestion[]>;
  /** lesson + same-skill questions by difficulty 1–7 */
  byDifficulty: { level: number; count: number }[];
  /** lesson + same-skill questions by DOK 1–4 (null = not set yet) */
  byDok: { dok: number | null; count: number }[];
  /** difficulty × DOK counts, key `${difficulty}|${dok ?? "-"}` */
  grid: Record<string, number>;
  total: number;
  gaps: string[];
}

const shortStem = (t: unknown) => { const x = s(t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return x.length > 140 ? `${x.slice(0, 137)}…` : x; };
const cleanCode = (c: unknown) => s(c).replace(/^CCSS\.ELA-LITERACY\./, "");

/** The skill, checked against the actor's school; with its grade and curriculum. */
async function skillInSchool(repo: Repo, actor: Actor, skillId: string): Promise<{ skill: Row; grade: Row; curriculumId: string }> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can search the question bank for a skill.");
  if (!skillId) throw new ValidationError("Choose a skill.");
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill || skill.deletedAt) throw new ValidationError("Skill not found.");
  const cur = await repo.findUnique("Curriculum", { id: skill.curriculumId });
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!grade || (actor.role !== "SUPER_ADMIN" && s(grade.schoolId) !== s(actor.schoolId))) throw new ForbiddenError("This skill belongs to another school.");
  return { skill, grade, curriculumId: s(skill.curriculumId) };
}

export async function findQuestionsForSkill(repo: Repo, actor: Actor, input: { skillId: string; lessonId?: string | null; classId?: string | null }): Promise<FinderResult> {
  const { skill, grade, curriculumId } = await skillInSchool(repo, actor, input.skillId);
  if (input.classId) await assertClassAccess(repo, actor, input.classId);
  const skillId = s(skill.id);

  // the grade's curricula (same school by construction: a Grade belongs to one school)
  const [curs, links, lessonSkills] = await Promise.all([
    repo.findMany("Curriculum", { gradeId: grade.id }, { select: ["id"] }),
    repo.findMany("SkillStandard", { skillId }),
    repo.findMany("LessonSkill", { skillId }, { select: ["lessonId"] }),
  ]);
  // lessons that teach this skill (only in the skill's own curriculum)
  const teachIds = [...new Set(lessonSkills.map((l) => s(l.lessonId)))];
  const teachLessons = teachIds.length ? await repo.findMany("Lesson", { id: { in: teachIds }, deletedAt: null }, { select: ["id", "unitId", "number", "code", "title"] }) : [];
  const units = teachLessons.length ? await repo.findMany("Unit", { id: { in: [...new Set(teachLessons.map((l) => s(l.unitId)))] }, curriculumId }, { select: ["id", "number"] }) : [];
  const unitNo = new Map(units.map((u) => [s(u.id), Number(u.number)]));
  const lessonTitle = (l: Row) => `Unit ${unitNo.get(s(l.unitId)) ?? "?"} · Lesson ${Number(l.number)}: ${s(l.title)}`;
  const lessons = teachLessons.filter((l) => unitNo.has(s(l.unitId)))
    .sort((a, b) => (unitNo.get(s(a.unitId))! - unitNo.get(s(b.unitId))!) || Number(a.number) - Number(b.number))
    .map((l) => ({ id: s(l.id), title: lessonTitle(l) }));

  // the lesson, which must be in this skill's curriculum
  let lesson: Row | null = null;
  if (input.lessonId) {
    lesson = await repo.findUnique("Lesson", { id: input.lessonId });
    const unit = lesson && !lesson.deletedAt ? await repo.findUnique("Unit", { id: lesson.unitId }) : null;
    if (!lesson || !unit || s(unit.curriculumId) !== curriculumId) throw new ValidationError("That lesson is not in this skill's curriculum.");
    unitNo.set(s(unit.id), Number(unit.number));
  }

  // the skill's standards (fallback: the standards its own questions are tagged with)
  const own = await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["id", "stem", "typeId", "difficultyLevel", "dok", "standardId", "lessonId", "skillId"], orderBy: [{ field: "difficultyLevel" }, { field: "id" }], take: SKILL_CAP });
  let stdIds = [...new Set(links.map((l) => s(l.standardId)))];
  if (!stdIds.length) stdIds = [...new Set(own.map((q) => s(q.standardId)).filter(Boolean))];

  // same grade, other skills sharing a standard (revision)
  const curIds = curs.map((c) => s(c.id));
  const [sharing, gradeSkills] = await Promise.all([
    stdIds.length ? repo.findMany("SkillStandard", { standardId: { in: stdIds } }, { select: ["skillId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("Skill", { curriculumId: { in: curIds }, deletedAt: null }, { select: ["id"] }),
  ]);
  const inGrade = new Set(gradeSkills.map((k) => s(k.id)));
  const otherSkills = [...new Set(sharing.map((x) => s(x.skillId)))].filter((id) => id !== skillId && inGrade.has(id));
  const otherSkillIds = [...inGrade].filter((id) => id !== skillId);
  const SEL = ["id", "stem", "typeId", "difficultyLevel", "dok", "standardId", "lessonId", "skillId"] as const;
  const [bySkill, byQStd] = await Promise.all([
    otherSkills.length ? repo.findMany("Question", { skillId: { in: otherSkills }, status: "PUBLISHED", deletedAt: null }, { select: SEL, orderBy: [{ field: "id" }], take: STANDARD_CAP }) : Promise.resolve([] as Row[]),
    stdIds.length && otherSkillIds.length ? repo.findMany("Question", { standardId: { in: stdIds }, skillId: { in: otherSkillIds }, status: "PUBLISHED", deletedAt: null }, { select: SEL, orderBy: [{ field: "id" }], take: STANDARD_CAP }) : Promise.resolve([] as Row[]),
  ]);
  const revision = new Map<string, Row>();
  for (const q of [...byQStd, ...bySkill]) if (revision.size < STANDARD_CAP) revision.set(s(q.id), q);

  // lesson links: Question.lessonId, or the lesson's place on the Curriculum Map (G4-U1-TS1 → G4.U1.TS1.*)
  const lessonLinked = new Set<string>();
  const lessonExtra: Row[] = [];
  if (lesson) {
    const direct = await repo.findMany("Question", { lessonId: lesson.id, status: "PUBLISHED", deletedAt: null }, { select: SEL, take: SKILL_CAP });
    const prefix = s(lesson.code).replace(/-/g, ".").toUpperCase();
    const nodes = prefix ? (await repo.findMany("CurriculumMapNode", { gradeId: grade.id, code: { contains: `${prefix}.` } }, { select: ["id", "code"], take: 200 })).filter((n) => s(n.code).toUpperCase().startsWith(`${prefix}.`)) : [];
    const mapLinks = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId"], take: SKILL_CAP }) : [];
    const mapIds = [...new Set(mapLinks.map((l) => s(l.questionId)))];
    const mapped = mapIds.length ? await repo.findMany("Question", { id: { in: mapIds }, status: "PUBLISHED", deletedAt: null }, { select: SEL }) : [];
    const std = new Set(stdIds);
    for (const q of [...direct, ...mapped]) {
      // about this skill: the same skill, or a question of this grade tagged with one of the skill's standards
      if (s(q.skillId) !== skillId && !(inGrade.has(s(q.skillId)) && std.has(s(q.standardId)))) continue;
      if (lessonLinked.has(s(q.id))) continue;
      lessonLinked.add(s(q.id));
      if (s(q.skillId) !== skillId) lessonExtra.push(q);
    }
  }

  const all = [...own, ...lessonExtra, ...revision.values()];
  const [types, stds] = await Promise.all([
    all.length ? repo.findMany("QuestionType", { id: { in: [...new Set(all.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] }) : Promise.resolve([] as Row[]),
    repo.findMany("Standard", { id: { in: [...new Set([...stdIds, ...all.map((q) => s(q.standardId)).filter(Boolean)])] } }, { select: ["id", "code"] }),
  ]);
  const typeOf = new Map(types.map((t) => [s(t.id), t]));
  const codeOf = new Map(stds.map((x) => [s(x.id), cleanCode(x.code)]));
  const toQ = (q: Row): FinderQuestion => {
    const t = typeOf.get(s(q.typeId));
    return {
      id: s(q.id), stem: shortStem(q.stem), type: s(t?.code ?? ""), difficultyLevel: Number(q.difficultyLevel ?? 4), dok: q.dok === null || q.dok === undefined ? null : Number(q.dok),
      standardCode: q.standardId ? codeOf.get(s(q.standardId)) ?? null : null, lessonLinked: lessonLinked.has(s(q.id)),
      autoScored: Boolean(t) && s(t!.code) !== "SHORT_ANSWER" && t!.isAutoScored !== false, skillId: s(q.skillId),
    };
  };
  const groups: Record<FinderGroup, FinderQuestion[]> = {
    lesson: [...own.filter((q) => lessonLinked.has(s(q.id))), ...lessonExtra].map(toQ),
    skill: own.filter((q) => !lessonLinked.has(s(q.id))).map(toQ),
    standard: [...revision.values()].filter((q) => !lessonLinked.has(s(q.id))).map(toQ),
  };

  const pool = [...groups.lesson, ...groups.skill];
  const byDifficulty = [1, 2, 3, 4, 5, 6, 7].map((level) => ({ level, count: pool.filter((q) => q.difficultyLevel === level).length }));
  const byDok = ([1, 2, 3, 4, null] as (number | null)[]).map((dok) => ({ dok, count: pool.filter((q) => q.dok === dok).length }));
  const grid: Record<string, number> = {};
  for (const q of pool) { const k = `${q.difficultyLevel}|${q.dok ?? "-"}`; grid[k] = (grid[k] ?? 0) + 1; }

  const gaps: string[] = [];
  if (pool.length < RECOMMENDED_PER_SKILL) gaps.push(`Only ${pool.length} question${pool.length === 1 ? "" : "s"} for this skill (${RECOMMENDED_PER_SKILL}+ recommended).`);
  const missing = byDifficulty.filter((d) => !d.count).map((d) => d.level);
  if (pool.length && missing.length) gaps.push(`No questions at difficulty level${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`);
  if (pool.length && !pool.some((q) => (q.dok ?? 0) >= 3)) gaps.push(pool.some((q) => q.dok !== null) ? "No DOK 3 questions (strategic thinking)." : "No DOK 3 questions: DOK is not set on these questions yet.");
  if (lesson && !groups.lesson.length) gaps.push("No questions linked to this lesson (fine — skill questions are used).");
  if (!stdIds.length) gaps.push("This skill has no standard, so no revision questions can be found.");

  return {
    skill: { id: skillId, name: s(skill.name), grade: Number(grade.level), standards: stdIds.map((id) => ({ id, code: codeOf.get(id) ?? "" })).filter((x) => x.code) },
    lesson: lesson ? { id: s(lesson.id), title: lessonTitle(lesson) } : null,
    lessons, groups, byDifficulty, byDok, grid, total: groups.lesson.length + groups.skill.length + groups.standard.length, gaps,
  };
}

// ------------------------------------------------------------------ a balanced ready set

export interface SkillSet {
  questionIds: string[];
  items: (FinderQuestion & { group: FinderGroup })[];
  /** the difficulty the set is centred on, and where it came from */
  target: { level: number; from: "CLASS_MASTERY" | "DEFAULT" };
  notes: string[];
}

/** The class's typical level on a skill: average mastery 0–100 → difficulty 2–6 (4 without data). Pure. */
export function typicalLevel(scores: number[]): number {
  if (!scores.length) return 4;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.max(2, Math.min(6, 2 + Math.round((Math.max(0, Math.min(100, avg)) / 100) * 4)));
}

/** Evenly spread difficulty targets around `center` (±2, within 1–7) for `n` slots. Pure. */
export function difficultyTargets(n: number, center: number): number[] {
  const lo = Math.max(1, center - 2), hi = Math.min(7, center + 2);
  if (n <= 0) return [];
  if (n === 1) return [center];
  return Array.from({ length: n }, (_, i) => Math.round(lo + ((hi - lo) * i) / (n - 1)));
}

/** Picks from the pools for each target: first pool within ±1 first, then nearest from any pool. Pure. */
export function pickSpread<T extends { id: string; difficultyLevel: number }>(targets: number[], pools: T[][]): T[] {
  const used = new Set<string>();
  const slot: (T | null)[] = targets.map(() => null);
  const nearest = (list: T[], level: number, maxDist: number) => list.filter((q) => !used.has(q.id) && Math.abs(q.difficultyLevel - level) <= maxDist)
    .sort((a, b) => Math.abs(a.difficultyLevel - level) - Math.abs(b.difficultyLevel - level) || a.id.localeCompare(b.id))[0] ?? null;
  for (const [pi, pool] of pools.entries()) {
    for (const [i, level] of targets.entries()) {
      if (slot[i]) continue;
      const q = nearest(pool, level, pi === pools.length - 1 ? 99 : 1);
      if (q) { slot[i] = q; used.add(q.id); }
    }
  }
  // anything still empty: nearest left in any pool
  for (const [i, level] of targets.entries()) {
    if (slot[i]) continue;
    const q = nearest(pools.flat(), level, 99);
    if (q) { slot[i] = q; used.add(q.id); }
  }
  return slot.filter((q): q is T => Boolean(q));
}

export async function buildSkillSet(repo: Repo, actor: Actor, input: { skillId: string; lessonId?: string | null; classId?: string | null; n?: number; includeRevision?: boolean }): Promise<SkillSet> {
  const found = await findQuestionsForSkill(repo, actor, input);
  const n = Math.max(3, Math.min(30, Math.round(input.n ?? 10)));
  const notes: string[] = [];
  // the class's typical level from its mastery of this skill (one bounded query)
  let target: SkillSet["target"] = { level: 4, from: "DEFAULT" };
  if (input.classId) {
    const members = await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"], take: 500 });
    const mastery = members.length ? await repo.findMany("StudentSkillMastery", { skillId: found.skill.id, studentId: { in: members.map((m) => s(m.studentId)) } }, { select: ["score", "attempts"] }) : [];
    const scores = mastery.filter((m) => Number(m.attempts ?? 0) > 0).map((m) => Number(m.score ?? 0));
    if (scores.length) target = { level: typicalLevel(scores), from: "CLASS_MASTERY" };
  }
  const auto = (list: FinderQuestion[]) => list.filter((q) => q.autoScored);
  const lesson = auto(found.groups.lesson), skill = auto(found.groups.skill), standard = auto(found.groups.standard);
  const revisionWanted = input.includeRevision ? (n >= 10 ? 2 : 1) : 0;
  const revisionCount = Math.min(revisionWanted, standard.length);
  if (input.includeRevision && !standard.length) notes.push("No revision questions with the same standard were found.");
  const mainCount = Math.min(n - revisionCount, lesson.length + skill.length);
  const main = pickSpread(difficultyTargets(mainCount, target.level), [lesson, skill]);
  // revision: nearest to the class's level, different skills first
  const rev: FinderQuestion[] = [];
  const seenSkill = new Set<string>();
  for (const q of [...standard].sort((a, b) => Math.abs(a.difficultyLevel - target.level) - Math.abs(b.difficultyLevel - target.level) || a.id.localeCompare(b.id))) {
    if (rev.length >= revisionCount) break;
    if (seenSkill.has(q.skillId) && standard.some((x) => !seenSkill.has(x.skillId) && !rev.includes(x))) continue;
    rev.push(q); seenSkill.add(q.skillId);
  }
  for (const q of standard) if (rev.length < revisionCount && !rev.includes(q)) rev.push(q);
  const lessonIds = new Set(lesson.map((q) => q.id));
  const items = [
    ...main.map((q) => ({ ...q, group: (lessonIds.has(q.id) ? "lesson" : "skill") as FinderGroup })).sort((a, b) => a.difficultyLevel - b.difficultyLevel || a.id.localeCompare(b.id)),
    ...rev.map((q) => ({ ...q, group: "standard" as FinderGroup })),
  ];
  if (items.length < n) notes.push(`Only ${items.length} auto-marked question${items.length === 1 ? "" : "s"} available (asked for ${n}).`);
  return { questionIds: items.map((q) => q.id), items, target, notes };
}
