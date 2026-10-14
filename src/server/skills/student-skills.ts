/**
 * ⭐ TEACHER Reports → "Student Skills" (owner r68 spec C), beside the Skills Grid (skills-grid.ts):
 *   skill page    one skill for the class: four name lists (⭐ Mastered · ◐ Learning · 🔄 Review · ☆ Not started), the
 *                 most-missed questions, and one-press actions — "Assign to students not mastered", "Create small group"
 *                 (Learning + Review: the skill assigned to just them) and "Reteach to whole class" when 40 %+ struggle
 *   student view  the student's My Skills, read-only, a summary line and "Create Plan" prefilled with the Learning +
 *                 Review skills (the Plans flow: Who → What → Preview → Send)
 *   family        "Send to the family": the colourful My Skills page goes to the admin for approval first (FamilyReport)
 * Reads are bounded (one class; answers of the last 120 days of one skill family).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { requireSource } from "../assign/source";
import { readableClasses, assertClassRead } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { skillKeyIndex, skillStatusesFor, type StarStatus, type StarView } from "./status";
import { mySkills, MY_SKILLS_TABS, STRAND_LABEL, STRANDS, strandOf, summaryLine, tabOf, type MySkills, type MySkillsTab, type Strand } from "./my-skills";
import { studentAssignedSkills } from "./assigned-skills";
import { ASSIGN_SOURCES, type AssignSource } from "../../lib/assign-source";
import { byCode, skillCode } from "./skills-grid";
import { fallbackStars, starsMigrated } from "./grid-fallback";
import { schoolSkillIndex } from "../questions/skill-questions";
import { shortStandard } from "../../lib/report-columns";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const DAY = 86_400_000;
/** "Reteach to whole class" is offered when at least this share of the class struggles (Learning + Review) */
export const RETEACH_SHARE = 0.4;

export interface SkillPageList { tab: MySkillsTab; students: { id: string; name: string; status: StarStatus }[] }
export interface MissedQuestion { id: string; stem: string; wrong: number; answered: number }
export interface SkillPage {
  classId: string; className: string; key: string; name: string; skillId: string | null; total: number;
  lists: Record<MySkillsTab, SkillPageList["students"]>; struggling: number; reteach: boolean; missed: MissedQuestion[];
}

/** Does this share of struggling students call for a whole-class reteach (pure)? */
export const needsReteach = (struggling: number, total: number): boolean => total > 0 && struggling / total >= RETEACH_SHARE;

/** The skill page of one class (teacher of the class, a coordinator or the admin). */
export async function skillPage(repo: Repo, actor: Actor, classId: string, key: string, now = new Date()): Promise<SkillPage> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  const schoolId = s(klass.schoolId);
  const [ids, ix] = await Promise.all([classMembers(repo, classId), skillKeyIndex(repo, schoolId)]);
  const skillIds = ix.skillsOf.get(key) ?? [];
  if (!skillIds.length && !key.startsWith("fam:")) throw new ValidationError("That skill is not in this school.");
  const [names, stars] = await Promise.all([studentNames(repo, ids), skillStatusesFor(repo, ids, [key])]);
  const lists: SkillPage["lists"] = { MASTERED: [], LEARNING: [], REVIEW: [], NOT_STARTED: [] };
  for (const id of ids) {
    const st = stars.get(id)?.get(key)?.status ?? "NOT_STARTED";
    lists[tabOf(st)].push({ id, name: names.get(id)?.name ?? "Student", status: st });
  }
  for (const l of Object.values(lists)) l.sort((a, b) => a.name.localeCompare(b.name));
  const struggling = lists.LEARNING.length + lists.REVIEW.length;
  // the most-missed questions of this skill (any copy) by this class, last 120 days, careful answers only
  const missed: MissedQuestion[] = [];
  if (ids.length && skillIds.length) {
    const rows: Row[] = [];
    for (let i = 0; i < ids.length; i += 200) rows.push(...(await repo.findMany("QuestionAttempt", { studentId: { in: ids.slice(i, i + 200) }, skillId: { in: skillIds.slice(0, 300) }, rapidGuess: false, createdAt: { gte: new Date(now.getTime() - 120 * DAY) } }, { select: ["questionId", "isCorrect"], take: 5000 })));
    const by = new Map<string, { wrong: number; answered: number }>();
    for (const r of rows) { const x = by.get(s(r.questionId)) ?? { wrong: 0, answered: 0 }; x.answered++; if (!r.isCorrect) x.wrong++; by.set(s(r.questionId), x); }
    const top = [...by].filter(([, x]) => x.wrong > 0).sort((a, b) => b[1].wrong - a[1].wrong || b[1].answered - a[1].answered).slice(0, 5);
    const qs = top.length ? await repo.findMany("Question", { id: { in: top.map(([id]) => id) } }, { select: ["id", "stem"] }) : [];
    for (const [id, x] of top) missed.push({ id, stem: s(qs.find((q) => s(q.id) === id)?.stem).slice(0, 300), ...x });
  }
  return {
    classId, className: s(klass.name), key, name: ix.nameOf.get(key) ?? "Skill", skillId: skillIds[0] ?? null, total: ids.length,
    lists, struggling, reteach: needsReteach(struggling, ids.length), missed,
  };
}

export type SkillAction = "NOT_MASTERED" | "SMALL_GROUP" | "RETEACH";
/**
 * One press on the skill page: the skill assigned (the usual assignSkill: My Work, Assigned, stars) to — the students not
 * mastered (Learning + Review + Not started) · a small group (Learning + Review) · the whole class ("Reteach:" note).
 */
export async function skillPageAction(repo: Repo, actor: Actor, classId: string, key: string, action: SkillAction, now = new Date(), /** r74: REQUIRED source */ sourceIn?: string | null): Promise<{ assignmentId: string; students: number }> {
  assertCan(actor, "assignments:create");
  const source = requireSource(sourceIn);
  const p = await skillPage(repo, actor, classId, key, now);
  if (!p.skillId) throw new ValidationError("This skill has no questions to assign yet.");
  const { assignSkill } = await import("../teacher/assign");
  const ids = action === "RETEACH" ? [] : action === "SMALL_GROUP" ? [...p.lists.LEARNING, ...p.lists.REVIEW].map((x) => x.id) : [...p.lists.LEARNING, ...p.lists.REVIEW, ...p.lists.NOT_STARTED].map((x) => x.id);
  if (action !== "RETEACH" && !ids.length) throw new ValidationError(action === "SMALL_GROUP" ? "No student is learning or reviewing this skill right now." : "Every student already mastered this skill.");
  const note = action === "RETEACH" ? `Reteach: ${p.name}` : action === "SMALL_GROUP" ? `Small group: ${p.name}` : null;
  return assignSkill(repo, actor, { classId, skillId: p.skillId, studentIds: ids.length ? ids : undefined, note, source }, now);
}

/** r72: one skill the student practised (the teacher's per-student view): code + short name, the star and its level */
export interface PractisedSkill { key: string; name: string; code: string; short: string; strand: Strand; status: StarStatus; needsSupport: boolean; answered: number; score: number; /** r74: the sources it was assigned from (badges) */ sources: AssignSource[] }
export interface PractisedSkills { groups: { strand: Strand; label: string; rows: PractisedSkill[] }[]; total: number; counts: Record<MySkillsTab, number> }
export interface StudentSkillsView {
  studentId: string; name: string; className: string; classId: string | null; skills: MySkills; summary: string; planHref: string | null;
  /** r74: ONLY the skills assigned to this student (practised or not yet: ☆), grouped by strand, sorted by code, with their sources */
  assigned: PractisedSkills;
}

/** One assigned skill not in the student's My Skills rows yet (e.g. only a set of its questions was assigned). */
export interface AssignedMeta { name: string; skillId: string | null; strand: Strand }
/**
 * Pure (r74): the ASSIGNED skills of a My Skills view — a practised skill that was never assigned is left out; an
 * assigned skill not practised yet is ☆ — grouped by strand and sorted by code, each with its sources.
 */
export function assignedOf(v: MySkills, assigned: ReadonlyMap<string, AssignSource[]>, codeOf: (key: string, skillId: string | null) => string, metaOf: (key: string) => AssignedMeta): PractisedSkills {
  const seen = new Map(MY_SKILLS_TABS.flatMap((tab) => v.groups[tab].flatMap((g) => g.rows)).map((r) => [r.key, r]));
  const rows: PractisedSkill[] = [...assigned].map(([key, sources]) => {
    const r = seen.get(key), m = r ? { name: r.name, skillId: r.skillId, strand: r.strand } : metaOf(key);
    const code = codeOf(key, m.skillId);
    return { key, name: m.name, code, short: shortStandard(code, m.name, 4).short, strand: m.strand, status: r?.status ?? "NOT_STARTED", needsSupport: Boolean(r?.needsSupport), answered: r?.answered ?? 0, score: r?.score ?? 0, sources };
  });
  const counts: Record<MySkillsTab, number> = { MASTERED: 0, LEARNING: 0, REVIEW: 0, NOT_STARTED: 0 };
  for (const r of rows) counts[tabOf(r.status)]++;
  const groups = STRANDS.map((strand) => ({ strand, label: STRAND_LABEL[strand], rows: rows.filter((r) => r.strand === strand).sort(byCode) })).filter((g) => g.rows.length);
  return { groups, total: rows.length, counts };
}

/** The student's My Skills, read-only for the teacher (their class), with the summary and a prefilled Create Plan link. */
export async function studentSkillsForTeacher(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<StudentSkillsView> {
  assertCan(actor, "reports:read");
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  const mine = (await readableClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name) }));
  const klass = mine.find((c) => m.some((x) => s(x.classId) === c.id)) ?? null;
  if (actor.role === "TEACHER" && !klass) throw new ForbiddenError("This student is not in your classes.");
  // r72: before the school's star migration, the practice with no star row yet is counted from the raw answers
  const schoolId = s(st.schoolId);
  const [ix, sidx, migrated] = await Promise.all([skillKeyIndex(repo, schoolId), schoolSkillIndex(repo, schoolId), starsMigrated(repo, schoolId)]);
  const extra = migrated ? undefined : (await fallbackStars(repo, [studentId], ix).catch(() => new Map<string, Map<string, StarView>>())).get(studentId);
  const [skills, names] = await Promise.all([mySkills(repo, studentId, now, { href: false, extra }), studentNames(repo, [studentId])]);
  // r74: only the skills ASSIGNED to the student (with their sources)
  const given = await studentAssignedSkills(repo, studentId, ix);
  const assigned = assignedOf(skills, new Map([...given.byStudent.get(studentId) ?? []].map(([k, set]) => [k, ASSIGN_SOURCES.filter((x) => set.has(x))])),
    (key, skillId) => { const id = skillId ?? ix.skillsOf.get(key)?.[0] ?? null; const row = id ? sidx.skillOf.get(id) ?? null : null; return skillCode(key, row?.code, id ? ix.gradeOf.get(id) ?? row?.grade : null); },
    (key) => { const id = given.skillIdOf.get(key) ?? ix.skillsOf.get(key)?.[0] ?? null; const row = id ? sidx.skillOf.get(id) ?? null : null; return { name: ix.nameOf.get(key) ?? row?.name ?? "Skill", skillId: id, strand: strandOf(key, row) }; });
  const add = [...skills.groups.LEARNING, ...skills.groups.REVIEW].flatMap((g) => g.rows.map((r) => r.skillId)).filter((x): x is string => Boolean(x)).slice(0, 20);
  const planHref = klass && add.length ? `/teacher/plans?${new URLSearchParams([["tab", "new"], ["classId", klass.id], ["who", "student"], ["sid", studentId], ...add.map((id) => ["add", id] as [string, string])])}` : null;
  return { studentId, name: names.get(studentId)?.name ?? "Student", className: klass?.name ?? "", classId: klass?.id ?? null, skills, summary: summaryLine(skills.counts), planHref, assigned };
}

/**
 * 📨 "Send to the family": the student's My Skills as a family report — it goes to the school admin for approval first
 * (FamilyReport PENDING; the admin's Report approvals). One open request per student (sent again: updated).
 */
export async function sendSkillsToFamily(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  const v = await studentSkillsForTeacher(repo, actor, studentId, now);
  const line = (tab: MySkillsTab) => v.skills.groups[tab].flatMap((g) => g.rows.map((r) => `${r.name}${tab === "MASTERED" && r.masteredAt ? ` (${r.masteredAt})` : ""}`));
  const content = {
    summary: `${v.name}: ${v.summary}.`, message: "",
    sections: [
      { heading: "Mastered", icon: "⭐", lines: line("MASTERED").slice(0, 12) },
      { heading: "Learning now", icon: "◐", lines: line("LEARNING").slice(0, 12) },
      { heading: "To review", icon: "🔄", lines: line("REVIEW").slice(0, 12) },
      { heading: "How to help at home", icon: "🏡", lines: ["Ask your child to show you one skill they are learning and practise 10 minutes together.", "Celebrate each new star!"] },
    ].filter((x) => x.lines.length),
  };
  const title = `My Skills · ${v.name}`;
  const open = (await repo.findMany("FamilyReport", { studentId, kind: "PROGRESS", status: "PENDING" })).find((x) => s(x.refId) === "skills");
  if (open) { await repo.updateMany("FamilyReport", { id: open.id }, { content, title, createdById: actor.userId, updatedAt: now, submittedAt: now }); return s(open.id); }
  const row = await repo.create("FamilyReport", { schoolId: s(actor.schoolId), studentId, kind: "PROGRESS", title, content, refId: "skills", status: "DRAFT", createdById: actor.userId, createdAt: now, updatedAt: now });
  const { submitFamilyReport } = await import("../reports/family-reports");
  await submitFamilyReport(repo, actor, s(row.id), now);
  return s(row.id);
}
