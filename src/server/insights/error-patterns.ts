/**
 * 🔍 Mistakes in plain words, and their root cause (student file + class "Mistakes and root causes" report).
 *
 *   errorSentenceFor   one student's main mistake from the misconception tags of their last wrong answers
 *                      (QuestionAttempt.misconception, tagged by misconception-tags.ts): "Ahmed confuses an event
 *                      or fact with the theme or lesson — 5 of the last 8 wrong answers."
 *   classWidePatterns  a mistake shared by 40 %+ of the class → "Re-teach to the whole class" (with a Learn lesson)
 *   rootCausesFrom     a skill the student struggles with whose prerequisite (SkillPrerequisite, the same graph the
 *                      practice engine routes with) is weak: "The real gap is Key Details (52%), which Main Idea
 *                      depends on." + Assign Key Details. Uses knowledge-graph.ts diagnose().
 * Staff only (callers check access). Queries are bounded: one read of the wrong answers for a whole class, the
 * grade's graph (2 queries) and the mastery + recent answers of the students (2 queries).
 */
import type { Repo, Row } from "../seeding/repo";
import { MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import { buildGraph, diagnose, MISCONCEPTION_ROOT, type Graph, type SkillState } from "../graph/knowledge-graph";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
/** How many of the latest wrong answers are read per student. */
export const LAST_WRONG = 8;
/** A mistake is the student's main one with 3+ of the last wrong answers and at least 40 % of them. */
export const MIN_SAME = 3;
/** A class-wide mistake: shared by this share of the class. */
export const CLASS_WIDE_SHARE = 0.4;

export interface ErrorSentence { studentId: string; code: string; label: string; fix: string; count: number; of: number; sentence: string }

const lowerFirst = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x);

/** Pure: the main mistake in a student's latest wrong answers (newest first), or null. */
export function errorSentenceFor(studentId: string, name: string, wrong: readonly Record<string, unknown>[]): ErrorSentence | null {
  const last = wrong.slice(0, LAST_WRONG);
  const counts = new Map<string, number>();
  for (const w of last) if (w.misconception) counts.set(s(w.misconception), (counts.get(s(w.misconception)) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (!top || top[1] < MIN_SAME || top[1] / last.length < 0.4) return null;
  const m = MISCONCEPTION_BY_CODE.get(top[0]);
  if (!m) return null;
  const first = name.trim().split(/\s+/)[0] || "The student";
  return { studentId, code: top[0], label: m.label, fix: m.fix, count: top[1], of: last.length, sentence: `${first} ${lowerFirst(m.label)} — ${top[1]} of the last ${last.length} wrong answers.` };
}

/** The codes a student shows (2+ of the last wrong answers): the base of the class-wide count. */
export function codesOf(wrong: readonly Record<string, unknown>[]): Set<string> {
  const c = new Map<string, number>();
  for (const w of wrong.slice(0, LAST_WRONG)) if (w.misconception) c.set(s(w.misconception), (c.get(s(w.misconception)) ?? 0) + 1);
  return new Set([...c].filter(([, n]) => n >= 2).map(([k]) => k));
}

export interface ClassPattern { code: string; label: string; fix: string; students: string[]; share: number; rootFamily: string | null }

/** Pure: mistakes shared by 40 %+ of the class (classSize = students in the class), most shared first. */
export function classWidePatterns(codesByStudent: Map<string, Set<string>>, classSize: number): ClassPattern[] {
  if (!classSize) return [];
  const by = new Map<string, string[]>();
  for (const [sid, codes] of codesByStudent) for (const c of codes) by.set(c, [...(by.get(c) ?? []), sid]);
  return [...by.entries()]
    .map(([code, students]) => ({ code, label: MISCONCEPTION_BY_CODE.get(code)?.label ?? code, fix: MISCONCEPTION_BY_CODE.get(code)?.fix ?? "", students, share: students.length / classSize, rootFamily: MISCONCEPTION_ROOT[code] ?? null }))
    .filter((p) => p.share >= CLASS_WIDE_SHARE && MISCONCEPTION_BY_CODE.has(p.code))
    .sort((a, b) => b.share - a.share || a.code.localeCompare(b.code));
}

/** The latest wrong answers of these students (60 days, newest first), grouped per student. One query. */
export async function latestWrong(repo: Repo, studentIds: string[], now = new Date()): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>(studentIds.map((id) => [id, []]));
  if (!studentIds.length) return out;
  const rows = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, isCorrect: false, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } }, {
    select: ["studentId", "skillId", "misconception", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: Math.min(6000, 60 * studentIds.length),
  });
  for (const r of rows) { const l = out.get(s(r.studentId)); if (l && l.length < LAST_WRONG) l.push(r); }
  return out;
}

export interface RootCause { skillId: string; skillName: string; prereqId: string; prereqName: string; prereqMastery: number | null; sentence: string }

/** Pure: for every skill the student struggles with, the weak prerequisite underneath (deepest first). */
export function rootCausesFrom(g: Graph, states: Map<string, SkillState>, limit = 3): RootCause[] {
  const out: RootCause[] = [];
  const seen = new Set<string>();
  const struggling = [...states.entries()].filter(([id]) => g.nodes.has(id)).sort((a, b) => a[1].mastery - b[1].mastery);
  for (const [skillId] of struggling) {
    const d = diagnose(g, states, skillId);
    if (d.verdict !== "PREREQUISITE" || !d.causes.length) continue;
    const c = d.causes[0];
    if (seen.has(`${c.skillId}|${skillId}`)) continue;
    seen.add(`${c.skillId}|${skillId}`);
    out.push({ skillId, skillName: d.skillName, prereqId: c.skillId, prereqName: c.name, prereqMastery: c.mastery,
      sentence: c.mastery !== null ? `The real gap is ${c.name} (${c.mastery}%), which ${d.skillName} depends on.` : `The real gap is ${c.name}, which ${d.skillName} depends on.` });
    if (out.length >= limit) break;
  }
  return out;
}

/** Skill states for the root-cause check from 2 reads (mastery rows + the latest answers), not one read per skill. */
export function statesFrom(mastery: Row[], recent: Row[]): Map<string, SkillState> {
  const per = new Map<string, Row[]>();
  for (const r of recent) { const l = per.get(s(r.skillId)) ?? []; if (l.length < 10) l.push(r); per.set(s(r.skillId), l); }
  const out = new Map<string, SkillState>();
  for (const m of mastery) {
    const id = s(m.skillId), l = per.get(id) ?? [], wrong = l.filter((r) => !(r.isCorrect === true || r.isCorrect === 1));
    const c = new Map<string, number>(); for (const w of wrong) if (w.misconception) c.set(s(w.misconception), (c.get(s(w.misconception)) ?? 0) + 1);
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    out.set(id, { mastery: Number(m.score ?? 0), attempts: Number(m.attempts ?? 0), theta: null, recentErrors: wrong.length, recentAnswers: l.length, misconception: top && top[1] >= 2 ? top[0] : null, isMastered: m.isMastered === true || m.isMastered === 1 });
  }
  return out;
}

/** The graph of the curricula of a grade (one or more books). 3 queries. */
export async function gradeGraph(repo: Repo, gradeId: string): Promise<Graph | null> {
  const curricula = gradeId ? await repo.findMany("Curriculum", { gradeId, deletedAt: null }, { select: ["id"] }) : [];
  if (!curricula.length) return null;
  const skills = await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => s(c.id)) }, deletedAt: null }, { select: ["id", "code", "name", "sequence", "category"] });
  const ids = skills.map((k) => s(k.id));
  const edges = ids.length ? await repo.findMany("SkillPrerequisite", { skillId: { in: ids } }) : [];
  return buildGraph(skills, edges);
}

/** One student's root causes (callers check access). */
export async function studentRootCauses(repo: Repo, studentId: string, limit = 3): Promise<RootCause[]> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await gradeGraph(repo, s(st.gradeId)) : null;
  if (!g) return [];
  const [mastery, recent] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "score", "attempts", "isMastered"] }),
    repo.findMany("QuestionAttempt", { studentId }, { select: ["skillId", "isCorrect", "misconception"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }),
  ]);
  return rootCausesFrom(g, statesFrom(mastery, recent), limit);
}

/** The Learn lesson / skill for a class-wide mistake: the grade's skill of the mistake's foundation family. */
export function rootSkillOf(g: Graph | null, code: string): { skillId: string; name: string } | null {
  const fam = MISCONCEPTION_ROOT[code];
  const id = fam && g ? g.byFamily.get(fam) : undefined;
  return id && g ? { skillId: id, name: g.nodes.get(id)!.name } : null;
}

// ------------------------------------------------------------------ the class view

export interface ClassRootGap { prereqId: string; prereqName: string; skillName: string; students: string[]; avgMastery: number | null }
export interface ClassErrors {
  classId: string; className: string; size: number;
  sentences: (ErrorSentence & { name: string })[];
  classWide: (ClassPattern & { lesson: { skillId: string; name: string } | null })[];
  gaps: ClassRootGap[];
  names: Map<string, string>;
}

/** A class's mistakes in plain words, the class-wide ones (40 %+), and the real gaps underneath, grouped. */
export async function classErrors(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassErrors> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const klass = await assertClassRead(repo, actor, classId);
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  const [students, wrongBy, g, mastery, recent] = await Promise.all([
    ids.length ? repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    latestWrong(repo, ids, now),
    gradeGraph(repo, s(klass.gradeId)),
    ids.length ? repo.findMany("StudentSkillMastery", { studentId: { in: ids } }, { select: ["studentId", "skillId", "score", "attempts", "isMastered"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } }, { select: ["studentId", "skillId", "isCorrect", "misconception"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 20000 }) : Promise.resolve([] as Row[]),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const userName = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const names = new Map(students.map((x) => [s(x.id), userName.get(s(x.userId)) || "Student"]));
  const sentences: ClassErrors["sentences"] = [];
  const codes = new Map<string, Set<string>>();
  for (const id of ids) {
    const w = wrongBy.get(id) ?? [];
    const e = errorSentenceFor(id, names.get(id) ?? "Student", w);
    if (e) sentences.push({ ...e, name: names.get(id) ?? "Student" });
    codes.set(id, codesOf(w));
  }
  const classWide = classWidePatterns(codes, ids.length).map((p) => ({ ...p, lesson: rootSkillOf(g, p.code) }));
  const gaps = new Map<string, ClassRootGap & { sum: number; n: number }>();
  if (g) {
    const mBy = new Map<string, Row[]>(), rBy = new Map<string, Row[]>();
    for (const m of mastery) { if (!g.nodes.has(s(m.skillId))) continue; const l = mBy.get(s(m.studentId)) ?? []; l.push(m); mBy.set(s(m.studentId), l); }
    for (const r of recent) { const l = rBy.get(s(r.studentId)) ?? []; if (l.length < 300) l.push(r); rBy.set(s(r.studentId), l); }
    for (const id of ids) {
      const c = rootCausesFrom(g, statesFrom(mBy.get(id) ?? [], rBy.get(id) ?? []), 1)[0];
      if (!c) continue;
      const e = gaps.get(c.prereqId) ?? { prereqId: c.prereqId, prereqName: c.prereqName, skillName: c.skillName, students: [], avgMastery: null, sum: 0, n: 0 };
      e.students.push(id);
      if (c.prereqMastery !== null) { e.sum += c.prereqMastery; e.n++; }
      gaps.set(c.prereqId, e);
    }
  }
  return {
    classId, className: s(klass.name), size: ids.length,
    sentences: sentences.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    classWide,
    gaps: [...gaps.values()].map(({ sum, n, ...x }) => ({ ...x, avgMastery: n ? Math.round(sum / n) : null })).sort((a, b) => b.students.length - a.students.length),
    names,
  };
}
