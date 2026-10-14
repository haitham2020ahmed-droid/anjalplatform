/**
 * 👩‍🏫 Learn for teachers (and the admin): every lesson (filter by goal area, sub-topic, standard, search) → Preview
 * exactly as the student sees it (level 1–4 for the teacher only), Edit, Assign (one student, several, a level group
 * or a whole class, optional level and due date), Results; "Students who need this lesson"; the coverage view (every
 * platform skill with its lesson(s), every continuum statement group, the curriculum words explained).
 * Staff only; a teacher works with their own classes (coordinators: their grade), the admin with the school.
 * Bounded reads; new tables through safeIfBehind.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { safeIfBehind } from "../db/schema-errors";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { audit } from "../audit";
import type { LevelKey } from "../../lib/learn/format";
import { lessonCatalog, lessonFile, readContinuum, readLessons, readTopics, type LessonMeta } from "./files";
import { hiddenCodes, isAdmin, lessonLevelFor, staffSchool, teacherIdOf, type LevelVersion } from "./edits";
import { learnSkills, matchSkills, normStd, RULE_LABEL, type LearnSkill, type MatchRule } from "./match";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v === null || v === undefined || v === "" ? null : new Date(v instanceof Date ? v.getTime() : s(v)).toISOString());
const STRONG: MatchRule[] = ["NAME", "FAMILY", "STANDARD"];

// ------------------------------------------------------------------ the list

export interface LessonFilter { area?: string | null; subtopic?: string | null; standard?: string | null; q?: string | null }
export interface TeacherLessonList { lessons: (LessonMeta & { hidden: boolean })[]; areas: string[]; subtopics: string[]; standards: string[]; invalid: { file: string; problems: string[] }[] }

/** Every lesson (files), filtered. Hidden lessons: the admin sees them marked; teachers do not see them. */
export async function teacherLessons(repo: Repo, actor: Actor, f: LessonFilter = {}): Promise<TeacherLessonList> {
  const schoolId = staffSchool(actor);
  const hidden = await safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>());
  const all = lessonCatalog().filter((l) => l.ready).map((l) => ({ ...l, hidden: hidden.has(l.code) })).filter((l) => isAdmin(actor) || !l.hidden);
  const q = s(f.q).trim().toLowerCase(), std = normStd(s(f.standard));
  const lessons = all.filter((l) => (!f.area || l.goalArea === f.area) && (!f.subtopic || l.subtopic === f.subtopic) && (!std || l.standards.some((x) => normStd(x) === std || normStd(x).startsWith(`${std}.`)))
    && (!q || `${l.code} ${l.title} ${l.summary} ${l.subtopic} ${l.skillNames.join(" ")}`.toLowerCase().includes(q)));
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  return { lessons, areas: uniq(all.map((l) => l.goalArea)), subtopics: uniq(all.filter((l) => !f.area || l.goalArea === f.area).map((l) => l.subtopic)), standards: uniq(all.flatMap((l) => l.standards)), invalid: isAdmin(actor) ? readLessons().invalid : [] };
}

// ------------------------------------------------------------------ preview (+ who needs it)

export interface TeacherLessonView {
  meta: LessonMeta & { hidden: boolean }; level: LevelKey; version: LevelVersion; skills: { id: string; name: string; grade: number; rule: string }[];
  needs: { studentId: string; name: string; className: string; classId: string; skill: string; score: number }[];
}

/** Preview of one level as the teacher's students get it (the teacher's own version first). */
export async function teacherLessonView(repo: Repo, actor: Actor, code: string, levelIn: unknown = "2"): Promise<TeacherLessonView | null> {
  const schoolId = staffSchool(actor);
  const file = lessonFile(code);
  if (!file) return null;
  const level = (["1", "2", "3", "4"].includes(s(levelIn)) ? s(levelIn) : "2") as LevelKey;
  const [teacherId, hidden, skills] = await Promise.all([teacherIdOf(repo, actor), safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>()), learnSkills(repo, schoolId)]);
  if (hidden.has(code) && !isAdmin(actor)) return null;
  const version = (await lessonLevelFor(repo, schoolId, code, level, teacherId ? [teacherId] : [], teacherId))!;
  const linked = linkedSkills(code, skills);
  const meta = { ...lessonCatalog().find((l) => l.code === code)!, hidden: hidden.has(code) };
  return { meta, level, version, skills: linked.map((x) => ({ id: x.skill.id, name: x.skill.name, grade: x.skill.grade, rule: RULE_LABEL[x.rule] })), needs: await studentsWhoNeed(repo, actor, linked.filter((x) => STRONG.includes(x.rule)).map((x) => x.skill)) };
}

/** The skills a lesson explains (best rule per skill), strongest first. */
export function linkedSkills(code: string, skills: LearnSkill[]): { skill: LearnSkill; rule: MatchRule }[] {
  const m = matchSkills(skills, lessonCatalog());
  const order: MatchRule[] = ["NAME", "FAMILY", "STANDARD", "PARENT", "ANCHOR"];
  return skills.filter((k) => m.get(k.id)?.codes.includes(code)).map((k) => ({ skill: k, rule: m.get(k.id)!.rule })).sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule) || a.skill.grade - b.skill.grade || a.skill.name.localeCompare(b.skill.name));
}

/** The teacher's classes (admin: the school's) and their current students. */
export async function myStudents(repo: Repo, actor: Actor): Promise<{ classes: Row[]; members: Row[] }> {
  const classes = await readableClasses(repo, actor);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  return { classes, members };
}

/** "Students who need this lesson": the teacher's students weak (< 60, 3+ answers) on the skills it explains. */
async function studentsWhoNeed(repo: Repo, actor: Actor, skills: LearnSkill[]): Promise<TeacherLessonView["needs"]> {
  if (!skills.length) return [];
  const { classes, members } = await myStudents(repo, actor);
  if (!members.length) return [];
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const weak = await repo.findMany("StudentSkillMastery", { studentId: { in: ids }, skillId: { in: skills.map((k) => k.id) }, score: { lt: 60 }, attempts: { gte: 3 } }, { select: ["studentId", "skillId", "score"], take: 500 });
  if (!weak.length) return [];
  const worst = new Map<string, Row>();
  for (const w of weak) { const c = worst.get(s(w.studentId)); if (!c || Number(w.score) < Number(c.score)) worst.set(s(w.studentId), w); }
  const names = await studentNames(repo, [...worst.keys()]);
  return [...worst.values()].map((w) => {
    const cid = s(members.find((m) => m.studentId === w.studentId)?.classId);
    return { studentId: s(w.studentId), name: names.get(s(w.studentId))?.name ?? "Student", classId: cid, className: s(classes.find((c) => c.id === cid)?.name), skill: skills.find((k) => k.id === w.skillId)?.name ?? "", score: Math.round(Number(w.score)) };
  }).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 60);
}

/** Early warning → "Send a lesson": the lesson for a (dropping / weakest) skill, by the same matching. */
export async function lessonForSkill(repo: Repo, actor: Actor, skillId: string): Promise<string | null> {
  const schoolId = staffSchool(actor);
  const skills = await learnSkills(repo, schoolId);
  const k = skills.find((x) => x.id === skillId);
  if (!k) return null;
  const hidden = await safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>());
  const ready = lessonCatalog().filter((l) => l.ready && !hidden.has(l.code));
  return matchSkills([k], ready).get(k.id)?.codes[0] ?? null;
}

// ------------------------------------------------------------------ assign

export type AssignTarget = "CLASS" | "GROUP" | "STUDENTS";
export interface AssignInput { kind: "LESSON" | "WORDS"; ref: string; title?: string; classId: string; target: AssignTarget; groupLevel?: string | null; studentIds?: string[]; level?: number | null; dueAt?: Date | null; /** r68: students see it from this day (null: at once) */ startAt?: Date | null }

/**
 * Assigns a lesson (or a selection's words) to a class, a level group of it or some of its students. A student who
 * already has it open gets nothing new (it is listed once in My Work).
 */
export async function assignLearn(repo: Repo, actor: Actor, input: AssignInput, now = new Date()): Promise<{ assignId: string; students: number; already: number }> {
  const schoolId = staffSchool(actor);
  const kind = input.kind === "WORDS" ? "WORDS" : "LESSON";
  let title = s(input.title).trim();
  if (kind === "LESSON") {
    const f = lessonFile(input.ref);
    if (!f) throw new ValidationError("This lesson is not on the platform.");
    if ((await safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>())).has(f.code)) throw new ValidationError("This lesson is hidden until it is fixed.");
    title = f.title;
  }
  if (!title) throw new ValidationError("Choose what to assign.");
  const classes = await readableClasses(repo, actor);
  const klass = classes.find((c) => s(c.id) === s(input.classId));
  if (!klass) throw new ForbiddenError("Not your class.");
  let ids = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const target: AssignTarget = input.target === "GROUP" || input.target === "STUDENTS" ? input.target : "CLASS";
  let groupLevel: string | null = null;
  if (target === "GROUP") {
    groupLevel = ["BELOW", "ON", "ABOVE"].includes(s(input.groupLevel)) ? s(input.groupLevel) : null;
    if (!groupLevel) throw new ValidationError("Choose a group.");
    const inGroup = new Set((ids.length ? await repo.findMany("StudentLevelState", { studentId: { in: ids }, level: groupLevel }, { select: ["studentId"] }) : []).map((r) => s(r.studentId)));
    ids = ids.filter((id) => inGroup.has(id));
  } else if (target === "STUDENTS") {
    const want = new Set((input.studentIds ?? []).map(s));
    ids = ids.filter((id) => want.has(id));
  }
  if (!ids.length) throw new ValidationError(target === "GROUP" ? "No student of this class is in that group." : "Choose at least one student.");
  const level = input.level && input.level >= 1 && input.level <= 4 ? Math.trunc(input.level) : null;
  const open = new Set((await repo.findMany("LearnAssignee", { studentId: { in: ids }, kind, ref: input.ref, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }, { select: ["studentId"] })).map((r) => s(r.studentId)));
  const fresh = ids.filter((id) => !open.has(id));
  if (input.startAt && input.dueAt && input.dueAt.getTime() < input.startAt.getTime()) throw new ValidationError("The end (due) date must be on or after the start date.");
  const start = input.startAt ? { startAt: input.startAt } : {};
  const a = await repo.create("LearnAssign", { schoolId, kind, ref: input.ref, title: title.slice(0, 191), classId: klass.id, target, groupLevel, level, dueAt: input.dueAt ?? null, ...start, createdById: actor.userId, createdAt: now });
  if (fresh.length) await repo.createMany("LearnAssignee", fresh.map((studentId) => ({ assignId: s(a.id), schoolId, studentId, kind, ref: input.ref, title: title.slice(0, 191), level, dueAt: input.dueAt ?? null, ...start, status: "NOT_STARTED", createdAt: now, updatedAt: now })));
  await audit(repo, { actorId: actor.userId, action: "learn.assign", entityType: "LearnAssign", entityId: s(a.id), after: { kind, ref: input.ref, classId: klass.id, target, students: fresh.length }, at: now });
  return { assignId: s(a.id), students: fresh.length, already: open.size };
}

// ------------------------------------------------------------------ results

export interface ResultRow { studentId: string; name: string; className: string; assigned: boolean; dueAt: string | null; opened: string | null; finished: string | null; score: number | null; best: number | null; again: boolean; attempts: number; minutes: number; level: number | null }
export interface LessonResults { title: string; rows: ResultRow[]; counts: { assigned: number; opened: number; finished: number; again: number } }

/** Who opened / finished one lesson (or one selection's words), checks score, needed "again", time — my students. */
export async function learnResults(repo: Repo, actor: Actor, kind: "LESSON" | "WORDS", ref: string, classId: string | null = null): Promise<LessonResults> {
  staffSchool(actor);
  const { classes, members } = await myStudents(repo, actor);
  const mine = members.filter((m) => !classId || s(m.classId) === classId);
  const ids = [...new Set(mine.map((m) => s(m.studentId)))];
  const title = kind === "LESSON" ? lessonFile(ref)?.title ?? ref : ref;
  if (!ids.length) return { title, rows: [], counts: { assigned: 0, opened: 0, finished: 0, again: 0 } };
  const [prog, asg] = await Promise.all([
    safeIfBehind("learn.progress", () => repo.findMany("LearnProgress", { studentId: { in: ids }, kind, ref }, { select: ["studentId", "openedAt", "finishedAt", "score", "best", "neededAgain", "attempts", "seconds", "level"] }), [] as Row[]),
    safeIfBehind("learn.assigned", () => repo.findMany("LearnAssignee", { studentId: { in: ids }, kind, ref }, { select: ["studentId", "dueAt", "status"] }), [] as Row[]),
  ]);
  const who = [...new Set([...prog.map((p) => s(p.studentId)), ...asg.map((a) => s(a.studentId))])];
  const names = await studentNames(repo, who);
  const rows: ResultRow[] = who.map((id) => {
    const p = prog.find((x) => x.studentId === id), a = asg.find((x) => x.studentId === id);
    const cid = s(mine.find((m) => m.studentId === id)?.classId);
    return { studentId: id, name: names.get(id)?.name ?? "Student", className: s(classes.find((c) => c.id === cid)?.name), assigned: Boolean(a), dueAt: iso(a?.dueAt), opened: iso(p?.openedAt), finished: iso(p?.finishedAt), score: p?.score === null || p?.score === undefined ? null : Number(p.score), best: p?.best === null || p?.best === undefined ? null : Number(p.best), again: Boolean(p?.neededAgain), attempts: Number(p?.attempts ?? 0), minutes: Math.round(Number(p?.seconds ?? 0) / 60), level: p ? Number(p.level) : null };
  }).sort((a, b) => Number(Boolean(b.finished)) - Number(Boolean(a.finished)) || a.name.localeCompare(b.name));
  return { title, rows, counts: { assigned: rows.filter((r) => r.assigned).length, opened: rows.filter((r) => r.opened).length, finished: rows.filter((r) => r.finished).length, again: rows.filter((r) => r.again).length } };
}

/** One student's Learn work (every lesson / selection they opened or were given). */
export async function studentLearnResults(repo: Repo, actor: Actor, studentId: string): Promise<{ name: string; rows: { kind: string; ref: string; title: string; opened: string | null; finished: string | null; score: number | null; again: boolean; minutes: number; status: string | null }[] }> {
  staffSchool(actor);
  const { members } = await myStudents(repo, actor);
  if (!members.some((m) => s(m.studentId) === studentId)) throw new ForbiddenError("Not your student.");
  const [prog, asg, names] = await Promise.all([
    safeIfBehind("learn.progress", () => repo.findMany("LearnProgress", { studentId }, { select: ["kind", "ref", "openedAt", "finishedAt", "score", "neededAgain", "seconds"], take: 300 }), [] as Row[]),
    safeIfBehind("learn.assigned", () => repo.findMany("LearnAssignee", { studentId }, { select: ["kind", "ref", "title", "status"], take: 300 }), [] as Row[]),
    studentNames(repo, [studentId]),
  ]);
  const keys = [...new Set([...prog, ...asg].map((r) => `${s(r.kind)}#${s(r.ref)}`))];
  const files = readLessons().valid;
  return {
    name: names.get(studentId)?.name ?? "Student",
    rows: keys.map((k) => {
      const [kind, ref] = k.split("#");
      const p = prog.find((x) => x.kind === kind && x.ref === ref), a = asg.find((x) => x.kind === kind && x.ref === ref);
      return { kind, ref, title: kind === "LESSON" ? files.get(ref)?.title ?? s(a?.title) ?? ref : s(a?.title) || ref, opened: iso(p?.openedAt), finished: iso(p?.finishedAt), score: p?.score === null || p?.score === undefined ? null : Number(p.score), again: Boolean(p?.neededAgain), minutes: Math.round(Number(p?.seconds ?? 0) / 60), status: a ? s(a.status) : null };
    }),
  };
}

// ------------------------------------------------------------------ coverage

export interface CoverageSkill { id: string; name: string; grade: number; kind: string; area: string | null; rule: string | null; lessons: { code: string; title: string; ready: boolean }[] }
export interface CoverageGroup { subject: string; goalArea: string; subtopic: string; statements: number; covered: number; lessons: { code: string; title: string; ready: boolean }[] }
export interface Coverage { skills: CoverageSkill[]; withLesson: number; total: number; lessonsReady: number; lessonsPlanned: number; groups: CoverageGroup[]; families: { code: string; lessons: number }[] }

/** Every active platform skill with its lesson(s) (or none), every continuum statement group, the lesson counts. */
export async function learnCoverage(repo: Repo, actor: Actor): Promise<Coverage> {
  const schoolId = staffSchool(actor);
  const skills = await learnSkills(repo, schoolId);
  const catalog = lessonCatalog();
  const byCode = new Map(catalog.map((l) => [l.code, l]));
  const m = matchSkills(skills, catalog);
  const rows: CoverageSkill[] = skills.map((k) => {
    const x = m.get(k.id) ?? null;
    return { id: k.id, name: k.name, grade: k.grade, kind: k.kind, area: k.area, rule: x ? RULE_LABEL[x.rule] : null, lessons: (x?.codes ?? []).slice(0, 6).map((c) => ({ code: c, title: byCode.get(c)!.title, ready: byCode.get(c)!.ready })) };
  }).sort((a, b) => Number(a.lessons.length > 0) - Number(b.lessons.length > 0) || a.grade - b.grade || a.name.localeCompare(b.name));
  const topics = readTopics();
  const covered = new Set(topics.flatMap((t) => t.statementIds));
  const groups = new Map<string, CoverageGroup>();
  for (const st of readContinuum()) {
    const key = `${st.subject}|${st.goalArea}|${st.subtopic}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { subject: st.subject, goalArea: st.goalArea, subtopic: st.subtopic, statements: 0, covered: 0, lessons: [] }));
    g.statements++;
    if (covered.has(st.id)) g.covered++;
  }
  for (const g of groups.values()) g.lessons = catalog.filter((l) => l.subject === g.subject && l.goalArea === g.goalArea && l.subtopic === g.subtopic).map((l) => ({ code: l.code, title: l.title, ready: l.ready }));
  const famCount = new Map<string, number>();
  for (const l of catalog) for (const f of l.families) famCount.set(f, (famCount.get(f) ?? 0) + 1);
  return {
    skills: rows, withLesson: rows.filter((r) => r.lessons.length).length, total: rows.length, lessonsReady: catalog.filter((l) => l.ready).length, lessonsPlanned: catalog.length,
    groups: [...groups.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.goalArea.localeCompare(b.goalArea) || a.subtopic.localeCompare(b.subtopic)),
    families: [...famCount].map(([code, lessons]) => ({ code, lessons })).sort((a, b) => a.code.localeCompare(b.code)),
  };
}
