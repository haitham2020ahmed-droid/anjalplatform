/**
 * Student reading levels (Above / On / Below Level) and the work built on them:
 *   - assign from the Curriculum Map: each student gets the questions of their own level;
 *   - Placement test: from questions marked “Placement”; the score sets each student's level;
 *   - MAP practice test: from questions marked “MAP test”; the report groups results by MAP goal area.
 * All three reuse teacher question sets (statuses, notifications, the answer page, reports).
 */
import { recordLevel } from "./student-level";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { accessibleClasses, assignQuestions } from "../teacher/assign";
import { attachmentNodes, type AttachmentNode } from "./questions";
import { bridgeOf } from "./bridge";
import { fromDifficulty } from "./leveled-run";

const s = (v: unknown) => String(v ?? "");
export type Level = "ABOVE" | "ON" | "BELOW";
export const LEVEL_NAMES: Record<Level, string> = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level" };
const MANUAL_TYPES = new Set(["SHORT_ANSWER"]);   // the platform cannot mark these: never put in a set

/** Levels of these students (students without one are “not set”, treated as On Level when assigning). */
export async function studentLevels(repo: Repo, studentIds: string[]): Promise<Map<string, { level: Level; source: string }>> {
  if (!studentIds.length) return new Map();
  const rows = await repo.findMany("StudentLevel", { studentId: { in: studentIds } });
  return new Map(rows.map((r) => [s(r.studentId), { level: s(r.level) as Level, source: s(r.source) }]));
}

async function classStudents(repo: Repo, classId: string): Promise<{ id: string; name: string }[]> {
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] });
  if (!members.length) return [];
  const st = await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["id", "userId"] });
  const users = await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] });
  return st.map((x) => ({ id: s(x.id), name: s(users.find((u) => u.id === x.userId)?.displayName ?? "Student") })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface ClassLevels { classId: string; className: string; grade: number; students: { id: string; name: string; level: Level | null; source: string | null }[] }

export async function classLevels(repo: Repo, actor: Actor, classId: string): Promise<ClassLevels> {
  assertCan(actor, "students:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const students = await classStudents(repo, classId);
  const levels = await studentLevels(repo, students.map((x) => x.id));
  const grade = await repo.findUnique("Grade", { id: klass.gradeId });
  return { classId, className: s(klass.name), grade: Number(grade?.level ?? 0), students: students.map((x) => ({ ...x, level: levels.get(x.id)?.level ?? null, source: levels.get(x.id)?.source ?? null })) };
}

/** The teacher sets levels by hand (null clears a level). Only students of their own class. */
export async function setStudentLevels(repo: Repo, actor: Actor, classId: string, entries: { studentId: string; level: Level | null }[], now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const inClass = new Set((await classStudents(repo, classId)).map((x) => x.id));
  let n = 0;
  for (const e of entries) {
    if (!inClass.has(e.studentId)) throw new ForbiddenError("That student is not in this class.");
    if (e.level && !["ABOVE", "ON", "BELOW"].includes(e.level)) throw new ValidationError("Level must be Above, On or Below.");
    if (!e.level) { n += await repo.deleteMany("StudentLevel", { studentId: e.studentId }); continue; }
    await recordLevel(repo, { studentId: e.studentId, level: e.level as Level, source: "TEACHER", setById: actor.userId, now });
    n++;
  }
  return n;
}

/** Published questions the platform can mark itself, among these ids. */
async function usable(repo: Repo, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const qs = await repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId"] });
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }, { select: ["id", "code"] }) : [];
  const code = new Map(types.map((t) => [s(t.id), s(t.code)]));
  return qs.filter((q) => !MANUAL_TYPES.has(code.get(s(q.typeId)) ?? "")).map((q) => s(q.id));
}

async function questionsOnNodes(repo: Repo, nodeIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  if (!nodeIds.length) return out;
  const links = await repo.findMany("QuestionMapLink", { nodeId: { in: nodeIds } });
  const ok = new Set(await usable(repo, links.map((l) => s(l.questionId))));
  for (const l of links) if (ok.has(s(l.questionId))) out.get(s(l.nodeId))!.push(s(l.questionId));
  return out;
}

export interface MapAssignPreview { place: string; category: string; levels: { level: Level | null; questions: number; students: number }[]; studentsWithoutLevel: number }
export interface MapAssignResult { groups: { level: Level | null; students: number; questions: number; assignmentId: string; usedLevel: Level | null }[]; notes: string[] }

function categoryPlaces(nodes: AttachmentNode[], categoryCode: string): AttachmentNode[] {
  const code = categoryCode.trim().toUpperCase();
  return nodes.filter((n) => n.code === code || n.code.startsWith(`${code}.`));
}

/** What “assign by level” would do for this class and Curriculum Map category (changes nothing). */
export async function previewMapAssign(repo: Repo, actor: Actor, classId: string, categoryCode: string): Promise<MapAssignPreview> {
  const klass = await assertClassAccess(repo, actor, classId);
  const places = categoryPlaces(await attachmentNodes(repo, actor.schoolId!), categoryCode);
  if (!places.length) throw new ValidationError("That place is not on the Curriculum Map.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  if (places[0].grade !== grade) throw new ValidationError(`This class is Grade ${grade}; the place is Grade ${places[0].grade}.`);
  const students = await classStudents(repo, classId);
  const levels = await studentLevels(repo, students.map((x) => x.id));
  const counts = await questionsOnNodes(repo, places.map((p) => p.id));
  const levelOf = (id: string): Level => levels.get(id)?.level ?? "ON";
  // one level chosen on its own: everyone chosen gets it; a whole category: students by their level
  const out = places.map((p) => ({ level: p.level, questions: counts.get(p.id)!.length, students: p.level && places.length > 1 ? students.filter((x) => levelOf(x.id) === p.level).length : students.length }));
  return { place: places[0].path.split(" › ").slice(0, 3).join(" › "), category: places[0].categoryLabel, levels: out, studentsWithoutLevel: students.filter((x) => !levels.has(x.id)).length };
}

/**
 * Assign a Curriculum Map category to a class (or chosen students): Concept Vocabulary → one set for all;
 * Analyze Craft / Respond to Reading → one set per level, each student in the set of their level
 * (no level yet = On Level; a level with no questions falls back to On Level, then to any level).
 */
export async function assignFromMap(repo: Repo, actor: Actor, input: { classId: string; categoryCode: string; studentIds?: string[]; dueAt?: Date | null; startAt?: Date | null; note?: string | null; maxQuestions?: number; mode?: "ADAPTIVE" | "BY_LEVEL"; targetCorrect?: number | null; silent?: boolean; curriculumPlanId?: string | null }, now = new Date()): Promise<MapAssignResult> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const places = categoryPlaces(await attachmentNodes(repo, actor.schoolId!), input.categoryCode);
  if (!places.length) throw new ValidationError("That place is not on the Curriculum Map.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  if (places[0].grade !== grade) throw new ValidationError(`This class is Grade ${grade}; the place is Grade ${places[0].grade}.`);
  const all = await classStudents(repo, input.classId);
  const chosen = input.studentIds?.length ? all.filter((x) => input.studentIds!.includes(x.id)) : all;
  if (input.studentIds?.length && chosen.length !== new Set(input.studentIds).size) throw new ForbiddenError("You can only assign work to students in this class.");
  if (!chosen.length) throw new ValidationError("This class has no students yet.");
  const levels = await studentLevels(repo, chosen.map((x) => x.id));
  const counts = await questionsOnNodes(repo, places.map((p) => p.id));
  const max = Math.max(1, Math.min(50, input.maxQuestions ?? 20));
  const base = `${places[0].unitTitle} · ${places[0].heading} · ${places[0].categoryLabel.replace(/^\d+-\s*/, "")}`;
  const notes: string[] = [];
  const groups: MapAssignResult["groups"] = [];
  const pick = (ids: string[]) => ids.slice(0, max);
  const send = async (level: Level | null, usedLevel: Level | null, students: string[], ids: string[]) => {
    const r = await assignQuestions(repo, actor, {
      classId: input.classId, studentIds: students, questionIds: pick(ids), track: "CURRICULUM", exactTitle: true,
      title: `${base}${usedLevel ? ` (${LEVEL_NAMES[usedLevel]})` : ""}`, dueAt: input.dueAt ?? null, startAt: input.startAt ?? null, note: input.note ?? null, silent: input.silent, curriculumPlanId: input.curriculumPlanId ?? null,
    }, now);
    groups.push({ level, students: students.length, questions: Math.min(ids.length, max), assignmentId: r.assignmentId, usedLevel });
  };
  if (places.length === 1 && places[0].level) {
    // one level only (e.g. just “Below Level”): that level's questions for the chosen students, no level matching
    const ids = counts.get(places[0].id)!;
    if (!ids.length) throw new ValidationError("There are no published questions on this place yet. Add or import questions first.");
    await send(places[0].level as Level, places[0].level as Level, chosen.map((x) => x.id), ids);
    return { groups, notes };
  }
  if (places.length === 1 && !places[0].level) {
    const ids = counts.get(places[0].id)!;
    if (!ids.length) throw new ValidationError("There are no published questions on this place yet. Add or import questions first.");
    // a place without map levels (e.g. Concept Vocabulary) whose questions have different difficulties is adaptive
    // too: each student starts at their level and moves Below → On → Above by their answers (difficulty ≤3 / 4 / ≥5)
    const diffs = await repo.findMany("Question", { id: { in: ids } }, { select: ["difficultyLevel"] });
    const spread = new Set(diffs.map((q) => fromDifficulty(Number(q.difficultyLevel ?? 4))));
    if ((input.mode ?? "ADAPTIVE") === "ADAPTIVE" && (spread.size >= 2 || (input.targetCorrect ?? 0) > 0)) {
      const maxQ = Math.max(5, Math.min(60, input.maxQuestions ?? 20));
      const r = await assignQuestions(repo, actor, {
        classId: input.classId, studentIds: chosen.map((x) => x.id), questionIds: ids, track: "CURRICULUM", exactTitle: true,
        title: `${base} (adaptive: Below → On → Above)`, adaptive: { maxQuestions: maxQ, targetCorrect: input.targetCorrect ?? null }, silent: input.silent, curriculumPlanId: input.curriculumPlanId ?? null,
        dueAt: input.dueAt ?? null, startAt: input.startAt ?? null, note: input.note ?? null,
      }, now);
      groups.push({ level: null, students: chosen.length, questions: ids.length, assignmentId: r.assignmentId, usedLevel: null });
      notes.push(`🔁 Adaptive by difficulty: ${ids.length} question(s); each student answers up to ${maxQ}, starting at their level.`);
      return { groups, notes };
    }
    await send(null, null, chosen.map((x) => x.id), ids);
    return { groups, notes };
  }
  const byLevel = new Map(places.filter((p) => p.level).map((p) => [p.level as Level, counts.get(p.id)!]));
  if ([...byLevel.values()].every((x) => !x.length)) throw new ValidationError("There are no published questions on this place yet. Add or import questions first.");
  if ((input.mode ?? "ADAPTIVE") === "ADAPTIVE") {
    // one adaptive set for everyone: the whole pool (Below + On + Above); each student moves between levels.
    // 🌉 Cross-Grade Bridge: the same skill one grade up (🚀 challenge: its On + Above questions) and one grade
    // down (🛟 support: its Below + On questions) extend the ladder — real text difficulty, no copied questions.
    const pool = (["BELOW", "ON", "ABOVE"] as Level[]).flatMap((l) => byLevel.get(l) ?? []);
    const br = await bridgeOf(repo, actor.schoolId!, places[0].code.replace(/\.(ABOVE|ON|BELOW)$/, ""));
    const allNodes = await attachmentNodes(repo, actor.schoolId!);
    const bridgeIds = async (code: string | null, levels: (Level | null)[]) => {
      if (!code) return [] as string[];
      const ps = allNodes.filter((n) => (n.code === code || n.code.startsWith(`${code}.`)) && levels.includes(n.level));
      return [...(await questionsOnNodes(repo, ps.map((p) => p.id))).values()].flat();
    };
    const challenge = await bridgeIds(br.challenge, ["ON", "ABOVE", null]);
    const support = await bridgeIds(br.support, ["BELOW", "ON", null]);
    pool.push(...challenge.filter((id) => !pool.includes(id)), ...support.filter((id) => !pool.includes(id)));
    if (challenge.length) notes.push(`🚀 Challenge path: ${challenge.length} question(s) from Grade ${places[0].grade + 1} (same skill) for students who master Above Level.`);
    if (support.length) notes.push(`🛟 Support path: ${support.length} question(s) from Grade ${places[0].grade - 1} (same skill) for students who struggle at Below Level.`);
    const r = await assignQuestions(repo, actor, {
      classId: input.classId, studentIds: chosen.map((x) => x.id), questionIds: pool, track: "CURRICULUM", exactTitle: true,
      title: `${base} (adaptive: Below → On → Above)`, adaptive: { maxQuestions: Math.max(5, Math.min(60, input.maxQuestions ?? 20)), targetCorrect: input.targetCorrect ?? null }, silent: input.silent, curriculumPlanId: input.curriculumPlanId ?? null,
      dueAt: input.dueAt ?? null, startAt: input.startAt ?? null, note: input.note ?? null,
    }, now);
    groups.push({ level: null, students: chosen.length, questions: pool.length, assignmentId: r.assignmentId, usedLevel: null });
    const noLevel = chosen.filter((x) => !levels.has(x.id)).length;
    if (noLevel) notes.push(`ℹ️ ${noLevel} student(s) have no level yet: they start at On Level (or from their MAP Lexile) and move by their answers.`);
    for (const l of ["BELOW", "ON", "ABOVE"] as Level[]) if (!(byLevel.get(l) ?? []).length) notes.push(`${LEVEL_NAMES[l]} has no questions yet: students cannot move to it until you add some.`);
    return { groups, notes };
  }
  const unset = chosen.filter((x) => !levels.has(x.id)).length;
  if (unset) notes.push(`${unset} student(s) have no level yet: they got On Level questions. Set levels on the Student levels page or give the Placement test.`);
  for (const level of ["ABOVE", "ON", "BELOW"] as Level[]) {
    const students = chosen.filter((x) => (levels.get(x.id)?.level ?? "ON") === level).map((x) => x.id);
    if (!students.length) continue;
    let used: Level = level;
    let ids = byLevel.get(level) ?? [];
    if (!ids.length) { used = "ON"; ids = byLevel.get("ON") ?? []; }
    if (!ids.length) { used = (["ABOVE", "ON", "BELOW"] as Level[]).find((l) => (byLevel.get(l) ?? []).length)!; ids = byLevel.get(used)!; }
    if (used !== level) notes.push(`${LEVEL_NAMES[level]} has no questions yet: those ${students.length} student(s) got ${LEVEL_NAMES[used]} questions.`);
    await send(level, used, students, ids);
  }
  return { groups, notes };
}

/** Published, auto-marked questions of this grade marked for a use (Placement / MAP test), mixed. */
export async function questionsForUse(repo: Repo, schoolId: string, gradeLevel: number, use: "PLACEMENT" | "MAP_TEST"): Promise<string[]> {
  const grade = (await repo.findMany("Grade", { schoolId, level: gradeLevel }))[0];
  if (!grade) return [];
  const curs = await repo.findMany("Curriculum", { gradeId: grade.id }, { select: ["id"] });
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id", "code"] }) : [];
  // questions marked for this use + every question on the grade's Curriculum Map (distributed automatically)
  const marked = (await repo.findMany("QuestionUse", { use }, { select: ["questionId"] })).map((u) => s(u.questionId));
  const mapNodes = await repo.findMany("CurriculumMapNode", { gradeId: grade.id, acceptsQuestions: true }, { select: ["id"] });
  let onMap = mapNodes.length ? (await repo.findMany("QuestionMapLink", { nodeId: { in: mapNodes.map((n) => n.id) } }, { select: ["questionId"] })).map((l) => s(l.questionId)) : [];
  if (use === "MAP_TEST" && onMap.length) {
    // MAP results are reported by goal area: only curriculum questions that have a real skill (not “Unclassified”)
    const unclassified = new Set(skills.filter((k) => String(k.code ?? "").endsWith(".curriculum-map-unclassified")).map((k) => s(k.id)));
    const ok = new Set((await repo.findMany("Question", { id: { in: onMap } }, { select: ["id", "skillId"] })).filter((q) => !unclassified.has(s(q.skillId))).map((q) => s(q.id)));
    onMap = onMap.filter((id) => ok.has(id));
  }
  marked.push(...onMap.filter((id) => !marked.includes(id)));
  if (!marked.length) return [];
  for (const q of await repo.findMany("Question", { id: { in: onMap } }, { select: ["skillId"] })) skills.push({ id: q.skillId } as Row);
  const skillSet = new Set(skills.map((k) => s(k.id)));
  const qs = await repo.findMany("Question", { id: { in: marked }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "difficultyLevel"] });
  const ok = new Set(await usable(repo, qs.filter((q) => skillSet.has(s(q.skillId))).map((q) => s(q.id))));
  // mixed difficulty: easy → hard, interleaved by skill so one skill never fills the test
  const list = qs.filter((q) => ok.has(s(q.id))).sort((a, b) => Number(a.difficultyLevel) - Number(b.difficultyLevel) || s(a.skillId).localeCompare(s(b.skillId)) || s(a.id).localeCompare(s(b.id)));
  const bySkill = new Map<string, Row[]>();
  for (const q of list) bySkill.set(s(q.skillId), [...(bySkill.get(s(q.skillId)) ?? []), q]);
  const out: string[] = [];
  for (let round = 0; out.length < list.length; round++) for (const qsOfSkill of bySkill.values()) if (qsOfSkill[round]) out.push(s(qsOfSkill[round].id));
  return out;
}

/** Placement test or MAP practice test for a class (or chosen students). */
export async function giveTest(repo: Repo, actor: Actor, input: { classId: string; kind: "PLACEMENT" | "MAP_TEST"; questions?: number; studentIds?: string[]; dueAt?: Date | null }, now = new Date()): Promise<{ assignmentId: string; students: number; questions: number }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await questionsForUse(repo, actor.schoolId!, grade, input.kind);
  const want = Math.max(5, Math.min(50, input.questions ?? 20));
  if (ids.length < 5) throw new ValidationError(`Grade ${grade} has ${ids.length} published question(s) marked “${input.kind === "PLACEMENT" ? "Placement" : "MAP test"}”; at least 5 are needed. Mark more questions in the Question Bank (Use column or the editor).`);
  const title = input.kind === "PLACEMENT" ? `Placement test · Grade ${grade}` : `MAP practice test · Grade ${grade}`;
  const r = await assignQuestions(repo, actor, {
    // Placement: adaptive over the whole pool (starts On Level, moves up or down); MAP practice test: a fixed mixed set
    ...(input.kind === "PLACEMENT" ? { adaptive: { maxQuestions: want } } : {}),
    classId: input.classId, studentIds: input.studentIds, questionIds: input.kind === "PLACEMENT" ? ids : ids.slice(0, want), title, exactTitle: true,
    kind: input.kind === "PLACEMENT" ? "PLACEMENT" : "BENCHMARK", track: input.kind === "MAP_TEST" ? "MAP" : "CURRICULUM", dueAt: input.dueAt ?? null,
  }, now);
  return { assignmentId: r.assignmentId, students: r.students, questions: r.questions };
}

/** Placement score → level: 80%+ Above, 50–79% On, under 50% Below. */
export const levelFromScore = (pct: number): Level => (pct >= 80 ? "ABOVE" : pct >= 50 ? "ON" : "BELOW");

/**
 * The actor's classes of one grade with their students and levels, in a fixed number of queries
 * (for the ⭐ Assign window on the Curriculum Map), whatever the number of classes.
 */
export async function rosterForGrade(repo: Repo, actor: Actor, gradeLevel: number): Promise<{ id: string; name: string; students: { id: string; name: string; level: Level | null }[] }[]> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return [];
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const mine = classes.filter((c) => Number(grades.find((g) => g.id === c.gradeId)?.level) === gradeLevel).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (!mine.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: mine.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const [studs, levels] = await Promise.all([
    ids.length ? repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    studentLevels(repo, ids),
  ]);
  const users = studs.length ? await repo.findMany("User", { id: { in: studs.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(studs.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  return mine.map((c) => ({
    id: s(c.id), name: s(c.name),
    students: members.filter((m) => m.classId === c.id).map((m) => ({ id: s(m.studentId), name: nameOf.get(s(m.studentId)) ?? "Student", level: levels.get(s(m.studentId))?.level ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
