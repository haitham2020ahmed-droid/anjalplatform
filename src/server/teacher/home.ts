/**
 * 🏠 Teacher Home (UI reorg Phase 3): the selected class only.
 *
 *   teacherHomeData     the teacher's classes (selector), the chosen class (grade, students), whether its grade has a
 *                       curriculum, and up to 3 "Needs your attention" cards — bounded reads, independent ones together
 *   attentionList       the list a card opens (students who have not started their work / suggested for RTI)
 *   findSkillFamilies   "Find a skill and assign it": ONE result per skill (a skill taught in several grades is one
 *                       family with grade tags), from the shared Phase 1 search (skillsMatching = the MAP/NAFS counts)
 *
 * Access: own classes only (admin: the school's) via accessibleClasses / assertClassAccess.
 */
import type { Actor } from "../auth/rbac";
import { ForbiddenError } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { accessibleClasses, NO_CURRICULUM_MESSAGE } from "./assign";
import { assertClassAccess } from "./assignments";
import { studentNames } from "../insights/student-data";
import { skillsMatching } from "../questions/skill-questions";
import { meaningKey } from "../skills/master";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const time = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : String(v)).getTime() : 0);
const CHUNK = 400;
async function inChunks<T>(ids: string[], f: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await f(ids.slice(i, i + CHUNK))));
  return out;
}

export interface HomeClass { id: string; name: string; grade: number; students: number }
export type AttentionKind = "not-started" | "tests" | "rti";
export interface AttentionCard { kind: AttentionKind; icon: string; title: string; text: string; count: number; href: string }
export interface TeacherHomeData {
  classes: HomeClass[];
  klass: HomeClass | null;
  students: { id: string; name: string }[];
  noCurriculum: boolean;
  noCurriculumMessage: string;
  attention: AttentionCard[];
}

/** Days after which a "Not started" assignment counts as needing attention (work assigned today is not late yet). */
export const NOT_STARTED_AFTER_DAYS = 2;
/** Test results newer than this are "new". */
export const NEW_RESULTS_DAYS = 7;

export async function teacherHomeData(repo: Repo, actor: Actor, classId?: string | null, now = new Date()): Promise<TeacherHomeData> {
  const rows = await accessibleClasses(repo, actor);
  const empty: TeacherHomeData = { classes: [], klass: null, students: [], noCurriculum: false, noCurriculumMessage: NO_CURRICULUM_MESSAGE, attention: [] };
  if (!rows.length) return empty;
  const [grades, members] = await Promise.all([
    repo.findMany("Grade", { id: { in: [...new Set(rows.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }),
    repo.findMany("ClassMembership", { classId: { in: rows.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] }),
  ]);
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const count = new Map<string, number>();
  for (const m of members) count.set(s(m.classId), (count.get(s(m.classId)) ?? 0) + 1);
  const classes = rows.map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0, students: count.get(s(c.id)) ?? 0, gradeId: s(c.gradeId) }))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  if (classId && !classes.some((c) => c.id === classId)) throw new ForbiddenError("You do not teach this class.");
  const chosen = classes.find((c) => c.id === classId) ?? classes[0];
  const ids = members.filter((m) => s(m.classId) === chosen.id).map((m) => s(m.studentId));
  const [names, noCurriculum, attention] = await Promise.all([
    studentNames(repo, ids),
    gradeHasNoCurriculum(repo, chosen.gradeId),
    attentionCards(repo, actor, chosen.id, ids, now),
  ]);
  const students = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  const strip = ({ gradeId: _g, ...c }: (typeof classes)[number]) => c;
  return { classes: classes.map(strip), klass: strip(chosen), students, noCurriculum, noCurriculumMessage: NO_CURRICULUM_MESSAGE, attention };
}

/** A grade whose curriculum has no units yet (e.g. a new Grade 11). */
async function gradeHasNoCurriculum(repo: Repo, gradeId: string): Promise<boolean> {
  const curs = await repo.findMany("Curriculum", { gradeId, isActive: true }, { select: ["id"] });
  if (!curs.length) return true;
  return (await repo.findMany("Unit", { curriculumId: { in: curs.map((c) => s(c.id)) } }, { select: ["id"], take: 1 })).length === 0;
}

// ------------------------------------------------------------------ Needs your attention

interface Lists { notStarted: Map<string, string[]>; rti: Map<string, { tier: number; reason: string }>; tests: { id: string; title: string; fresh: number }[] }

async function lists(repo: Repo, actor: Actor, classId: string, ids: string[], now: Date): Promise<Lists> {
  const since = now.getTime() - NOT_STARTED_AFTER_DAYS * 86_400_000;
  const [work, tiers, tests] = await Promise.all([
    repo.findMany("Assignment", { classId, deletedAt: null }, { select: ["id", "title", "startAt", "createdAt", "testId", "curriculumPlanId"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }),
    ids.length ? inChunks(ids, (part) => repo.findMany("StudentTier", { studentId: { in: part }, tier: { gte: 2 } }, { select: ["studentId", "tier", "reason"] })) : Promise.resolve([] as Row[]),
    repo.findMany("TeacherTest", { classId, deletedAt: null }, { select: ["id", "title"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 50 }),
  ]);
  // work that should have been started: assigned at least 2 days ago (and already open), not a test (tests have their own card)
  const open = work.filter((a) => !a.testId && s(a.curriculumPlanId) !== "TEST" && time(a.createdAt) <= since && (!a.startAt || time(a.startAt) <= now.getTime()));
  const title = new Map(open.map((a) => [s(a.id), s(a.title)]));
  const idSet = new Set(ids);
  const waiting = open.length ? await inChunks(open.map((a) => s(a.id)), (part) => repo.findMany("AssignmentStudent", { assignmentId: { in: part }, status: { in: ["NOT_STARTED", "OVERDUE"] } }, { select: ["studentId", "assignmentId", "progress"] })) : [];
  const notStarted = new Map<string, string[]>();
  for (const r of waiting) {
    if (Number(r.progress ?? 0) > 0 || !idSet.has(s(r.studentId))) continue;
    notStarted.set(s(r.studentId), [...(notStarted.get(s(r.studentId)) ?? []), title.get(s(r.assignmentId)) ?? ""]);
  }
  const rti = new Map(tiers.map((t) => [s(t.studentId), { tier: Number(t.tier), reason: s(t.reason) }]));
  // tests with new results: someone finished in the last 7 days
  let fresh: { id: string; title: string; fresh: number }[] = [];
  if (tests.length) {
    const sets = await repo.findMany("Assignment", { testId: { in: tests.map((t) => s(t.id)) }, deletedAt: null }, { select: ["id", "testId"] });
    const testOf = new Map(sets.map((x) => [s(x.id), s(x.testId)]));
    const done = sets.length ? await inChunks(sets.map((x) => s(x.id)), (part) => repo.findMany("AssignmentStudent", { assignmentId: { in: part }, status: "COMPLETED", completedAt: { gte: new Date(now.getTime() - NEW_RESULTS_DAYS * 86_400_000) } }, { select: ["assignmentId"] })) : [];
    const n = new Map<string, number>();
    for (const d of done) { const t = testOf.get(s(d.assignmentId)); if (t) n.set(t, (n.get(t) ?? 0) + 1); }
    fresh = tests.filter((t) => n.has(s(t.id))).map((t) => ({ id: s(t.id), title: s(t.title), fresh: n.get(s(t.id))! }));
  }
  void actor;
  return { notStarted, rti, tests: fresh };
}

async function attentionCards(repo: Repo, actor: Actor, classId: string, ids: string[], now: Date): Promise<AttentionCard[]> {
  const l = await lists(repo, actor, classId, ids, now);
  const out: AttentionCard[] = [];
  if (l.notStarted.size) out.push({ kind: "not-started", icon: "⏰", title: "Have not started their work", text: "{n} students", count: l.notStarted.size, href: `/teacher/attention?kind=not-started&classId=${classId}` });
  if (l.tests.length) out.push({ kind: "tests", icon: "📝", title: "Tests with new results", text: "{n} tests", count: l.tests.length, href: l.tests.length === 1 ? `/teacher/assessments/${l.tests[0].id}` : `/teacher/assessments?classId=${classId}` });
  if (l.rti.size) out.push({ kind: "rti", icon: "🛟", title: "Suggested for RTI", text: "{n} students", count: l.rti.size, href: `/teacher/attention?kind=rti&classId=${classId}` });
  return out.slice(0, 3);
}

export interface AttentionRow { studentId: string; name: string; detail: string }
/** The list an attention card opens (own class only). */
export async function attentionList(repo: Repo, actor: Actor, classId: string, kind: AttentionKind, now = new Date()): Promise<{ className: string; rows: AttentionRow[]; tests: { id: string; title: string; fresh: number }[] }> {
  const klass = await assertClassAccess(repo, actor, classId);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const [l, names] = await Promise.all([lists(repo, actor, classId, ids, now), studentNames(repo, ids)]);
  const nameOf = (id: string) => names.get(id)?.name ?? "Student";
  let rows: AttentionRow[] = [];
  if (kind === "not-started") rows = [...l.notStarted].map(([id, titles]) => ({ studentId: id, name: nameOf(id), detail: titles.filter(Boolean).slice(0, 3).join(" · ") + (titles.length > 3 ? ` (+${titles.length - 3})` : "") }));
  if (kind === "rti") rows = [...l.rti].map(([id, t]) => ({ studentId: id, name: nameOf(id), detail: `Tier ${t.tier} · ${t.reason}`.slice(0, 200) }));
  return { className: s(klass.name), rows: rows.sort((a, b) => a.name.localeCompare(b.name)), tests: l.tests };
}

// ------------------------------------------------------------------ Find a skill and assign it

export interface FamilySkill { id: string; grade: number; questions: number; grammar: boolean }
export interface SkillFamily { key: string; name: string; grades: number[]; pick: FamilySkill; skills: FamilySkill[]; questions: number }

/**
 * Skill names only, one result per skill: the same skill in Grades 4, 5 and 6 is ONE family with grade tags.
 * The skill picked for Assign is the one of the class's grade when there is one, else the nearest grade with
 * questions. Any grade's skill can be assigned to the teacher's own class (access rules).
 */
export async function findSkillFamilies(repo: Repo, actor: Actor, q: string, classGrade?: number | null): Promise<SkillFamily[]> {
  if (!actor.schoolId) return [];
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Teachers only.");
  const hits = await skillsMatching(repo, actor.schoolId, q);
  if (!hits.length) return [];
  const codes = new Map((await repo.findMany("Skill", { id: { in: hits.map((h) => h.id) } }, { select: ["id", "code"] })).map((k) => [s(k.id), s(k.code)]));
  const fam = new Map<string, { name: string; skills: FamilySkill[] }>();
  for (const h of hits) {
    const key = meaningKey(h.name.replace(/\s*\((?:G|Grade )\d+\)\s*$/i, "")) || h.name.toLowerCase();
    const f = fam.get(key) ?? { name: h.name.replace(/\s*\((?:G|Grade )\d+\)\s*$/i, ""), skills: [] };
    f.skills.push({ id: h.id, grade: h.grade, questions: h.questions, grammar: codes.get(h.id)?.includes(".grammar.") ?? false });
    fam.set(key, f);
  }
  const g = Number(classGrade ?? 0);
  return [...fam].map(([key, f]) => {
    const skills = f.skills.sort((a, b) => a.grade - b.grade);
    const withQ = skills.filter((k) => k.questions > 0);
    const pool = withQ.length ? withQ : skills;
    const pick = pool.find((k) => k.grade === g) ?? [...pool].sort((a, b) => Math.abs(a.grade - g) - Math.abs(b.grade - g) || a.grade - b.grade)[0];
    return { key, name: f.name, grades: [...new Set(skills.map((k) => k.grade))], pick, skills, questions: skills.reduce((n, k) => n + k.questions, 0) };
  }).sort((a, b) => Number(b.questions > 0) - Number(a.questions > 0) || a.name.localeCompare(b.name)).slice(0, 12);
}
