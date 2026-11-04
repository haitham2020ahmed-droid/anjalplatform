/**
 * ✏️ The plan editor — every plan (individual, group, class; MAP, Custom, Support, Curriculum, NAFS) is ONE row of
 * SkillPlan that the teacher can see and change completely, before and after sending:
 *
 *   doc       the plan: sections, one per skill (or Curriculum Map lesson), each with ITS questions in order (or
 *             "the platform chooses at each student's level"), the students it is for, and the skill's lesson
 *   baseline  the platform's version (the suggestion), so the teacher sees what they changed
 *   status    DRAFT (nothing reaches students) → SENT → PAUSED / WITHDRAWN
 *
 * Sending makes each section a normal skill assignment (assignSkill: My Work, practice, statuses, notifications,
 * reports) with the teacher's questions (Assignment.questionIds) and a SkillPlanItem (the student's My Plans).
 * An edit after sending updates those assignments in place: added / removed questions, students and sections reach
 * the students; answers already given stay in their record (attempts are never touched; a removed section is
 * cancelled the usual way, cancelAssignment). Pause hides the work for now (start date far ahead); Withdraw cancels it.
 *
 * Rules: a teacher works on plans of their OWN classes only (assertClassAccess; a school admin any class of the
 * school); students must be in the class; skills and questions of the school only (published, auto-marked);
 * never the same question (or a copy) twice in one plan; the platform's picks follow the no-repeat rule
 * (question-pick.ts → questions/fresh.ts); NAFS plans are for Grade 6 classes only. Nothing is ever sent by itself.
 */
import type { Repo, Row } from "../seeding/repo";
import { safeIfBehind } from "../db/schema-errors";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { sourceOfAssignment } from "../../lib/assign-source";
import { isGrammarCode } from "../grammar/grammar";
import { assertSchoolSkill, cancelAssignment, pickedQuestionIds } from "../teacher/assign";
import { SOURCE_REQUIRED, type AssignSource } from "../assign/source";
import { planSource, sendPartsBatch, type BatchPart } from "./batch-send";
import { assertClassAccess } from "../teacher/assignments";
import { contentKeysForIds, Sitting } from "../questions/fresh";
import { schoolSkillIndex } from "../questions/skill-questions";
import { inviteToLesson } from "../lessons/run";
import { isProgram, planKindOf, programOfPlanKind, trackOfProgram, type Program } from "./program";
import { mapLessonQuestions, pickQuestions, similarQuestion, MAX_SECTION_QUESTIONS, isPlanLevel, type PlanLevel } from "./question-pick";

const s = (v: unknown) => String(v ?? "");
const json = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };
const jsonIds = (v: unknown): string[] => { const x = json(v); return Array.isArray(x) ? [...new Set(x.map(s).filter(Boolean))] : []; };
const d = (v: unknown): Date | null => (v ? new Date(v instanceof Date ? v.getTime() : s(v)) : null);
const day = (v: unknown): string | null => { const x = d(v); return x && !Number.isNaN(x.getTime()) ? x.toISOString().slice(0, 10) : null; };

export type PlanStatus = "DRAFT" | "SENT" | "PAUSED" | "WITHDRAWN";
export const PLAN_STATUSES: readonly PlanStatus[] = ["DRAFT", "SENT", "PAUSED", "WITHDRAWN"];
const statusOf = (v: unknown): PlanStatus => ((PLAN_STATUSES as readonly unknown[]).includes(v) ? (v as PlanStatus) : "SENT");
/** most sections in one plan (each becomes one assignment) */
export const MAX_SECTIONS = 40;
/** questions in a new section when the teacher does not say */
export const DEFAULT_COUNT = 10;
/** a paused plan's work starts "later" (students do not see it) */
export const PAUSE_UNTIL = new Date("2999-12-31T00:00:00.000Z");
/** the grade NAFS plans are for */
export const NAFS_GRADE = 6;

export interface PlanSection {
  /** stable within the plan (s1, s2…) */
  key: string;
  skillId: string;
  skillName: string;
  /** a Curriculum Map lesson: its place code and name */
  placeCode: string | null;
  label: string | null;
  /** why it is in the plan (the suggestion's reason, or "Added by you") */
  reason: string | null;
  /** true = the platform chooses at each student's level (no list); false = exactly these questions, in order */
  auto: boolean;
  questionIds: string[];
  /** the section's students (null = everyone in the plan) */
  studentIds: string[] | null;
  /** also open the skill's interactive lesson for the students */
  lesson: boolean;
  /** the level the platform picks at (the teacher may change it); questions of other levels may still be added */
  level: PlanLevel | null;
  /** after sending */
  assignmentId: string | null;
  /** an older plan's question set (its questions are the set's) */
  assessmentId: string | null;
}
export interface PlanDoc { v: 1; sections: PlanSection[] }
/** A sentence with its values, translated where it is shown: t(x.t, x.v). fmt() gives the English text. */
export interface Txt { t: string; v?: Record<string, string | number> }
export const fmt = (x: Txt | string): string => (typeof x === "string" ? x : x.t.replace(/\{(\w+)\}/g, (_, k: string) => String(x.v?.[k] ?? `{${k}}`)));
const isTxt = (x: unknown): x is Txt => !!x && typeof x === "object" && typeof (x as Txt).t === "string";
export interface PlanSource { reason: string; reasonT?: Txt | null; sources: string[]; rows: { name: string; lines: (string | Txt)[] }[] }

const cleanSection = (x: Record<string, unknown>, i: number): PlanSection => ({
  key: s(x.key) || `s${i + 1}`, skillId: s(x.skillId), skillName: s(x.skillName), placeCode: x.placeCode ? s(x.placeCode) : null, label: x.label ? s(x.label) : null,
  reason: x.reason ? s(x.reason) : null, auto: Boolean(x.auto), questionIds: jsonIds(x.questionIds), studentIds: x.studentIds == null ? null : jsonIds(x.studentIds),
  lesson: Boolean(x.lesson), level: isPlanLevel(x.level) ? x.level : null, assignmentId: x.assignmentId ? s(x.assignmentId) : null, assessmentId: x.assessmentId ? s(x.assessmentId) : null,
});
export function parseDoc(v: unknown): PlanDoc {
  const x = json(v) as { sections?: unknown } | null;
  const list = x && Array.isArray(x.sections) ? x.sections : [];
  return { v: 1, sections: list.filter((y): y is Record<string, unknown> => !!y && typeof y === "object").map(cleanSection) };
}
export function parseSource(v: unknown): PlanSource | null {
  const x = json(v) as PlanSource | null;
  if (!x || typeof x !== "object" || !x.reason) return null;
  const line = (l: unknown): string | Txt => (isTxt(l) ? { t: s(l.t), v: l.v && typeof l.v === "object" ? l.v : undefined } : s(l));
  return { reason: s(x.reason), reasonT: isTxt(x.reasonT) ? x.reasonT : null, sources: Array.isArray(x.sources) ? x.sources.map(s) : [], rows: Array.isArray(x.rows) ? x.rows.slice(0, 60).map((r) => ({ name: s(r?.name), lines: Array.isArray(r?.lines) ? r.lines.map(line).slice(0, 12) : [] })) : [] };
}
const nextKey = (doc: PlanDoc) => `s${Math.max(0, ...doc.sections.map((x) => Number(x.key.replace(/\D/g, "")) || 0)) + 1}`;
const planQuestionIds = (doc: PlanDoc, except?: string) => doc.sections.filter((x) => x.key !== except).flatMap((x) => x.questionIds);

// ------------------------------------------------------------------ access

export interface LoadedPlan { row: Row; klass: Row; grade: number; doc: PlanDoc; status: PlanStatus; program: Program | null; members: string[]; planStudents: string[] }

async function classGrade(repo: Repo, klass: Row): Promise<number> { return Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0); }
async function classMembers(repo: Repo, classId: string): Promise<string[]> {
  return (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
}

/** NAFS plans are for Grade 6 classes only. */
export function assertProgramFitsGrade(program: Program | null, grade: number): void {
  if (program === "NAFS" && grade !== NAFS_GRADE) throw new ValidationError("NAFS plans are for Grade 6 classes only.");
}

function staffOnly(actor: Actor) {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can open plans.");
}

/** A plan the actor may open: a teacher's own class (any teacher of the class), an admin's school. */
export async function loadPlan(repo: Repo, actor: Actor, planId: string): Promise<LoadedPlan> {
  assertCan(actor, "assignments:read");
  staffOnly(actor);
  const row = await repo.findUnique("SkillPlan", { id: s(planId) });
  if (!row || (actor.role !== "SUPER_ADMIN" && s(row.schoolId) !== s(actor.schoolId))) throw new ForbiddenError("Plan not found.");
  if (s(row.kind) === "CURRICULUM") throw new ValidationError("The full curriculum plan is edited on its own page.");
  const klass = await assertClassAccess(repo, actor, s(row.classId));
  const [grade, members] = await Promise.all([classGrade(repo, klass), classMembers(repo, s(klass.id))]);
  let doc = row.doc ? parseDoc(row.doc) : null;
  const program: Program | null = isProgram(row.program) ? row.program : programOfPlanKind(row.kind);
  if (!doc) {
    // a plan sent before the editor: its sections are read from its assignments once, then kept
    doc = await docFromAssignments(repo, row, members);
    const ids = new Set(doc.sections.flatMap((x) => x.studentIds ?? members));
    const studentIds = ids.size && [...ids].length < members.length ? [...ids].sort() : null;
    const first = doc.sections[0]?.assignmentId ? await repo.findUnique("Assignment", { id: doc.sections[0].assignmentId }) : null;
    await repo.updateMany("SkillPlan", { id: row.id }, { doc, program, studentIds, dueAt: first?.dueAt ?? null, startAt: first?.startAt ?? null, sentAt: row.createdAt, updatedAt: row.createdAt });
    Object.assign(row, { doc, program, studentIds, dueAt: first?.dueAt ?? null, startAt: first?.startAt ?? null, sentAt: row.createdAt });
  }
  const chosen = row.studentIds == null ? null : jsonIds(row.studentIds);
  return { row, klass, grade, doc, status: statusOf(row.status), program, members, planStudents: chosen && chosen.length ? chosen.filter((id) => members.includes(id)) : members };
}

/** An older plan's sections, from its items' assignments (bounded: one plan). */
async function docFromAssignments(repo: Repo, row: Row, members: string[]): Promise<PlanDoc> {
  const items = (await repo.findMany("SkillPlanItem", { planId: row.id }, { select: ["id", "code", "label", "assignmentIds", "order"] })).sort((a, b) => Number(a.order) - Number(b.order));
  const aids = items.flatMap((i) => jsonIds(i.assignmentIds));
  if (!aids.length) return { v: 1, sections: [] };
  const [as, links] = await Promise.all([
    repo.findMany("Assignment", { id: { in: aids } }, { select: ["id", "skillId", "assessmentId", "questionIds", "deletedAt", "title"] }),
    repo.findMany("AssignmentStudent", { assignmentId: { in: aids } }, { select: ["assignmentId", "studentId"] }),
  ]);
  const setQs = as.some((a) => a.assessmentId) ? await repo.findMany("AssessmentQuestion", { assessmentId: { in: as.filter((a) => a.assessmentId).map((a) => s(a.assessmentId)) } }, { select: ["assessmentId", "questionId", "order"] }) : [];
  const setSkills = setQs.length ? new Map((await repo.findMany("Question", { id: { in: [...new Set(setQs.map((q) => s(q.questionId)))] } }, { select: ["id", "skillId"] })).map((q) => [s(q.id), s(q.skillId)])) : new Map<string, string>();
  const skillIds = [...new Set([...as.map((a) => s(a.skillId)).filter(Boolean), ...setSkills.values()])];
  const names = skillIds.length ? new Map((await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] })).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  const sections: PlanSection[] = [];
  for (const it of items) {
    for (const aid of jsonIds(it.assignmentIds)) {
      const a = as.find((x) => s(x.id) === aid);
      if (!a || a.deletedAt) continue;
      const who = [...new Set(links.filter((l) => s(l.assignmentId) === aid).map((l) => s(l.studentId)))].sort();
      const qs = a.assessmentId ? setQs.filter((q) => s(q.assessmentId) === s(a.assessmentId)).sort((x, y) => Number(x.order) - Number(y.order)).map((q) => s(q.questionId)) : jsonIds(a.questionIds);
      const count = new Map<string, number>();
      for (const q of qs) { const k = setSkills.get(q); if (k) count.set(k, (count.get(k) ?? 0) + 1); }
      const skillId = a.skillId ? s(a.skillId) : [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
      const label = s(it.label).split(" · ").slice(2).join(" · ") || s(a.title);
      sections.push({
        key: `s${sections.length + 1}`, skillId, skillName: names.get(skillId) || label, placeCode: a.assessmentId ? s(it.code) : null, label: a.assessmentId ? label : null,
        reason: null, auto: !qs.length, questionIds: qs, studentIds: who.length >= members.length && members.every((m) => who.includes(m)) ? null : who, lesson: false, level: null,
        assignmentId: aid, assessmentId: a.assessmentId ? s(a.assessmentId) : null,
      });
    }
  }
  return { v: 1, sections };
}

// ------------------------------------------------------------------ new plans (drafts)

export interface SectionSpec {
  skillId?: string | null;
  /** a Curriculum Map lesson instead of a bank skill */
  placeCode?: string | null;
  count?: number | null;
  level?: PlanLevel | null;
  type?: string | null;
  questionIds?: string[] | null;
  auto?: boolean;
  studentIds?: string[] | null;
  lesson?: boolean;
  reason?: string | null;
  /** a lesson's name (copies) */
  label?: string | null;
}
export interface CreateDraftInput {
  classId: string;
  program: Program | null;
  /** empty / undefined = the whole class */
  studentIds?: string[] | null;
  title?: string | null;
  note?: string | null;
  goals?: string | null;
  dueAt?: Date | null;
  startAt?: Date | null;
  sections: SectionSpec[];
  /** the sections are the platform's suggestion: kept as the baseline to compare with */
  suggested?: boolean;
  source?: PlanSource | null;
  /** ⚡ additive: an Enrichment plan (kind "ENRICHMENT" instead of "CUSTOM") — program stays null, same safe bucket. */
  enrichment?: boolean;
}

const LABEL: Record<string, string> = { MAP: "MAP Plan", RTI: "Support Plan", NAFS: "NAFS Plan", CURRICULUM: "Curriculum Plan", CUSTOM: "Custom Plan" };
export const editorPlanLabel = (p: Program | null) => LABEL[p ?? "CUSTOM"];

function checkStudents(ids: string[] | null | undefined, members: string[]): string[] | null {
  const list = [...new Set((ids ?? []).map(s).filter(Boolean))];
  if (!list.length) return null;
  for (const id of list) if (!members.includes(id)) throw new ForbiddenError("You can only plan for students in this class.");
  return list.length === members.length ? null : list.sort();
}

/** One new section, its questions chosen (fresh for its students, nothing already in the plan). */
async function buildSection(repo: Repo, schoolId: string, doc: PlanDoc, spec: SectionSpec, planStudents: string[], members: string[]): Promise<PlanSection> {
  const studentIds = spec.studentIds ? checkStudents(spec.studentIds, members) : null;
  const who = studentIds ?? planStudents;
  const level = isPlanLevel(spec.level) ? spec.level : null;
  const count = Math.max(1, Math.min(MAX_SECTION_QUESTIONS, Math.round(Number(spec.count) || DEFAULT_COUNT)));
  let skillId = s(spec.skillId), placeCode: string | null = null, label: string | null = null, pool: string[] | undefined;
  if (spec.placeCode && spec.questionIds?.length) {
    // a copied lesson keeps its questions and name
    placeCode = s(spec.placeCode); label = spec.label ? s(spec.label) : placeCode;
  } else if (spec.placeCode) {
    const m = await mapLessonQuestions(repo, schoolId, s(spec.placeCode));
    if (!m.questionIds.length || !m.skillId) throw new ValidationError("This lesson of the Curriculum Map has no questions yet.");
    placeCode = m.lesson.code; label = m.lesson.label; pool = m.questionIds; skillId = skillId || m.skillId;
  }
  if (!skillId) throw new ValidationError("Choose a skill.");
  const skill = await assertSchoolSkill(repo, schoolId, skillId);
  await assertNewSkill(repo, schoolId, doc, skillId, placeCode);
  const exclude = planQuestionIds(doc);
  let questionIds: string[] = [];
  const auto = Boolean(spec.auto) && !pool;
  if (!auto) {
    if (spec.questionIds?.length) questionIds = await checkQuestions(repo, schoolId, doc, spec.questionIds, null);
    else questionIds = await pickQuestions(repo, schoolId, pool ? null : skillId, count, { level, type: spec.type ?? null, studentIds: who, exclude, pool });
    if (!questionIds.length) throw new ValidationError(`${s(skill.name)}: no questions to add (all of them are in the plan already, or none match).`);
  }
  return {
    key: nextKey(doc), skillId: s(skill.id), skillName: s(skill.name), placeCode, label, reason: spec.reason ? s(spec.reason).slice(0, 300) : null,
    auto, questionIds, studentIds, lesson: Boolean(spec.lesson), level, assignmentId: null, assessmentId: null,
  };
}

/** Never the same skill twice (a skill's questions belong in one section; Curriculum Map lessons may share a skill). */
async function assertNewSkill(repo: Repo, schoolId: string, doc: PlanDoc, skillId: string, placeCode: string | null): Promise<void> {
  if (placeCode) {
    if (doc.sections.some((x) => x.placeCode === placeCode)) throw new ValidationError("This lesson is already in the plan.");
    return;
  }
  const idx = await schoolSkillIndex(repo, schoolId);
  const key = idx.keyOf.get(skillId) ?? skillId;
  if (doc.sections.some((x) => !x.placeCode && (idx.keyOf.get(x.skillId) ?? x.skillId) === key)) throw new ValidationError("This skill is already in the plan: add questions to it instead.");
}

/**
 * The teacher's own questions for a section, checked: published, auto-marked, of the school; never one that is
 * already in the plan (or a copy of it, or twice in the list). Order kept.
 */
async function checkQuestions(repo: Repo, schoolId: string, doc: PlanDoc, ids: string[], sectionKey: string | null): Promise<string[]> {
  const want = [...new Set(ids.map(s).filter(Boolean))];
  if (!want.length) return [];
  await pickedQuestionIds(repo, schoolId, want.slice(0, MAX_SECTION_QUESTIONS));
  const types = await repo.findMany("QuestionType", {}, { select: ["id", "code", "isAutoScored"] });
  const manual = new Set(types.filter((t) => t.isAutoScored === false || s(t.code) === "SHORT_ANSWER").map((t) => s(t.id)));
  const rows = await repo.findMany("Question", { id: { in: want } }, { select: ["id", "typeId"] });
  if (rows.some((q) => manual.has(s(q.typeId)))) throw new ValidationError("Short answers need a teacher to mark them, so they cannot go into a plan.");
  const others = doc.sections.filter((x) => x.key !== sectionKey).flatMap((x) => x.questionIds);
  const own = sectionKey ? doc.sections.find((x) => x.key === sectionKey)?.questionIds ?? [] : [];
  const keys = await contentKeysForIds(repo, [...others, ...own, ...want]);
  const sit = new Sitting();
  for (const id of [...others, ...own]) sit.add(id, keys.get(id) ?? []);
  const out: string[] = [];
  for (const id of want) { const k = keys.get(id) ?? []; if (sit.has(id, k)) continue; sit.add(id, k); out.push(id); }
  return out;
}

/** ✏️ A new draft plan (nothing reaches students). Returns its id. */
export async function createDraft(repo: Repo, actor: Actor, input: CreateDraftInput, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  staffOnly(actor);
  if (!input.classId) throw new ValidationError("Choose a class.");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const program = isProgram(input.program) ? input.program : null;
  const [grade, members] = await Promise.all([classGrade(repo, klass), classMembers(repo, s(klass.id))]);
  assertProgramFitsGrade(program, grade);
  if (!members.length) throw new ValidationError("This class has no students yet.");
  const studentIds = checkStudents(input.studentIds, members);
  const planStudents = studentIds ?? members;
  const schoolId = s(klass.schoolId);
  const doc: PlanDoc = { v: 1, sections: [] };
  const notes: string[] = [];
  for (const spec of input.sections.slice(0, MAX_SECTIONS)) {
    try { doc.sections.push(await buildSection(repo, schoolId, doc, spec, planStudents, members)); }
    catch (e) { if (e instanceof ValidationError) notes.push(e.message); else throw e; }
  }
  if (input.sections.length && !doc.sections.length) throw new ValidationError(notes[0] ?? "Nothing could be added to the plan.");
  const title = (s(input.title).replace(/\s+/g, " ").trim() || `${editorPlanLabel(program)} · ${s(klass.name)}`).slice(0, 191);
  const row = await repo.create("SkillPlan", {
    schoolId, classId: klass.id, title, kind: input.enrichment ? "ENRICHMENT" : planKindOf(program), targetCorrect: null, gradeLevel: grade, note: s(input.note).trim().slice(0, 1000) || null,
    createdById: actor.userId, createdAt: now, updatedAt: now, status: "DRAFT", program, doc, baseline: input.suggested ? doc : null,
    source: input.source ?? null, studentIds, goals: s(input.goals).trim().slice(0, 1000) || null, dueAt: input.dueAt ?? null, startAt: input.startAt ?? null,
  });
  await audit(repo, { actorId: actor.userId, action: "plan.draft", entityType: "SkillPlan", entityId: s(row.id), after: { classId: s(klass.id), program, sections: doc.sections.length, suggested: Boolean(input.suggested) }, at: now });
  return s(row.id);
}

// ------------------------------------------------------------------ edits (before and after sending)

export type PlanEdit =
  | { kind: "details"; title?: string | null; note?: string | null; goals?: string | null; dueAt?: Date | null; startAt?: Date | null }
  | { kind: "students"; studentIds: string[] }
  | { kind: "addSection"; spec: SectionSpec }
  | { kind: "removeSection"; key: string }
  | { kind: "moveSection"; key: string; dir: -1 | 1 }
  | { kind: "count"; key: string; count: number }
  | { kind: "level"; key: string; level: PlanLevel | null }
  | { kind: "sectionStudents"; key: string; studentIds: string[] | null }
  | { kind: "lesson"; key: string; on: boolean }
  | { kind: "pickMyself"; key: string; count?: number }
  | { kind: "auto"; key: string }
  | { kind: "addQuestions"; key: string; questionIds: string[] }
  | { kind: "removeQuestion"; key: string; questionId: string }
  | { kind: "replaceQuestion"; key: string; questionId: string }
  | { kind: "moveQuestion"; key: string; questionId: string; dir: -1 | 1 };

export interface EditResult { planId: string; status: PlanStatus; message: string; messageT: Txt; notified: number }

const sectionOf = (doc: PlanDoc, key: string): PlanSection => {
  const x = doc.sections.find((y) => y.key === key);
  if (!x) throw new ValidationError("This part of the plan was removed. Reload the page.");
  return x;
};
const move = <T,>(list: T[], i: number, dir: number): T[] => { const j = i + dir; if (i < 0 || j < 0 || j >= list.length) return list; const out = [...list]; [out[i], out[j]] = [out[j], out[i]]; return out; };

/** Applies one edit to a plan (a draft, or a sent plan: the students get the update). */
export async function editPlan(repo: Repo, actor: Actor, planId: string, edit: PlanEdit, now = new Date()): Promise<EditResult> {
  assertCan(actor, "assignments:create");
  const p = await loadPlan(repo, actor, planId);
  if (p.status === "WITHDRAWN") throw new ValidationError("This plan was withdrawn. Duplicate it to use it again.");
  const before: PlanDoc = JSON.parse(JSON.stringify(p.doc));
  const doc: PlanDoc = JSON.parse(JSON.stringify(p.doc));
  const schoolId = s(p.klass.schoolId);
  const patch: Row = {};
  let message: Txt | string = "Saved.";
  switch (edit.kind) {
    case "details": {
      if (edit.title !== undefined) { const t = s(edit.title).replace(/\s+/g, " ").trim(); if (!t) throw new ValidationError("Give the plan a name."); patch.title = t.slice(0, 191); }
      if (edit.note !== undefined) patch.note = s(edit.note).trim().slice(0, 1000) || null;
      if (edit.goals !== undefined) patch.goals = s(edit.goals).trim().slice(0, 1000) || null;
      if (edit.dueAt !== undefined) patch.dueAt = edit.dueAt;
      if (edit.startAt !== undefined) patch.startAt = edit.startAt;
      const due = edit.dueAt !== undefined ? edit.dueAt : d(p.row.dueAt), start = edit.startAt !== undefined ? edit.startAt : d(p.row.startAt);
      if (edit.dueAt && edit.dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
      if (due && start && due <= start) throw new ValidationError("The due date must be after the start date.");
      message = "Plan details saved.";
      break;
    }
    case "students": {
      if (edit.studentIds.filter(Boolean).length === 0) throw new ValidationError("Choose at least one student.");
      const ids = checkStudents(edit.studentIds, p.members);
      patch.studentIds = ids;
      const keep = new Set(ids ?? p.members);
      for (const x of doc.sections) if (x.studentIds) { x.studentIds = x.studentIds.filter((id) => keep.has(id)); if (!x.studentIds.length) x.studentIds = null; }
      message = "Students saved.";
      break;
    }
    case "addSection": {
      if (doc.sections.length >= MAX_SECTIONS) throw new ValidationError(`A plan can have at most ${MAX_SECTIONS} parts.`);
      const x = await buildSection(repo, schoolId, doc, { reason: "Added by you", ...edit.spec }, p.planStudents, p.members);
      doc.sections.push(x);
      message = x.auto ? "Skill added." : { t: "Added: {name} ({n} questions).", v: { name: x.label ?? x.skillName, n: x.questionIds.length } };
      break;
    }
    case "removeSection": {
      sectionOf(doc, edit.key);
      doc.sections = doc.sections.filter((x) => x.key !== edit.key);
      message = "Removed from the plan.";
      break;
    }
    case "moveSection": {
      doc.sections = move(doc.sections, doc.sections.findIndex((x) => x.key === edit.key), edit.dir);
      message = "Order saved.";
      break;
    }
    case "count": {
      const x = sectionOf(doc, edit.key);
      const n = Math.max(1, Math.min(MAX_SECTION_QUESTIONS, Math.round(Number(edit.count) || 0)));
      if (x.auto) { x.auto = false; x.questionIds = []; }
      if (n < x.questionIds.length) x.questionIds = x.questionIds.slice(0, n);
      else if (n > x.questionIds.length) {
        const pool = x.placeCode ? (await mapLessonQuestions(repo, schoolId, x.placeCode)).questionIds : undefined;
        const more = await pickQuestions(repo, schoolId, pool ? null : x.skillId, n - x.questionIds.length, { level: x.level, studentIds: x.studentIds ?? p.planStudents, exclude: planQuestionIds(doc), pool });
        x.questionIds.push(...more);
      }
      if (!x.questionIds.length) throw new ValidationError("No questions to add (all of them are in the plan already).");
      message = { t: x.questionIds.length < n ? "Only {n} questions are available for {name}." : "{name}: {n} questions.", v: { name: x.label ?? x.skillName, n: x.questionIds.length } };
      break;
    }
    case "level": {
      sectionOf(doc, edit.key).level = isPlanLevel(edit.level) ? edit.level : null;
      message = "Level saved. New and replaced questions follow it.";
      break;
    }
    case "sectionStudents": {
      const x = sectionOf(doc, edit.key);
      const ids = edit.studentIds ? checkStudents(edit.studentIds, p.planStudents) : null;
      if (edit.studentIds && !edit.studentIds.filter(Boolean).length) throw new ValidationError("Choose at least one student.");
      x.studentIds = ids && ids.length < p.planStudents.length ? ids : null;
      message = "Students of this part saved.";
      break;
    }
    case "lesson": {
      sectionOf(doc, edit.key).lesson = Boolean(edit.on);
      message = edit.on ? "The lesson is part of the plan." : "The lesson was taken out.";
      break;
    }
    case "pickMyself": {
      const x = sectionOf(doc, edit.key);
      if (!x.auto) break;
      x.questionIds = await pickQuestions(repo, schoolId, x.skillId, edit.count ?? DEFAULT_COUNT, { level: x.level, studentIds: x.studentIds ?? p.planStudents, exclude: planQuestionIds(doc) });
      if (!x.questionIds.length) throw new ValidationError("No questions to add (all of them are in the plan already).");
      x.auto = false;
      message = { t: "{name}: {n} questions you can now see and change.", v: { name: x.skillName, n: x.questionIds.length } };
      break;
    }
    case "auto": {
      const x = sectionOf(doc, edit.key);
      if (x.assessmentId || x.placeCode) throw new ValidationError("This part keeps its own questions.");
      x.auto = true; x.questionIds = [];
      message = "The platform will choose at each student's level.";
      break;
    }
    case "addQuestions": {
      const x = sectionOf(doc, edit.key);
      const add = await checkQuestions(repo, schoolId, doc, edit.questionIds, x.key);
      if (!add.length) throw new ValidationError("These questions are in the plan already.");
      if (x.questionIds.length + add.length > MAX_SECTION_QUESTIONS) throw new ValidationError(`One part can have at most ${MAX_SECTION_QUESTIONS} questions.`);
      x.questionIds = [...(x.auto ? [] : x.questionIds), ...add]; x.auto = false;
      message = { t: add.length < edit.questionIds.length ? "{n} question(s) added. Questions already in the plan were skipped." : "{n} question(s) added.", v: { n: add.length } };
      break;
    }
    case "removeQuestion": {
      const x = sectionOf(doc, edit.key);
      if (!x.questionIds.includes(edit.questionId)) throw new ValidationError("This question is not in the plan.");
      if (x.questionIds.length === 1) throw new ValidationError("A part needs at least one question: remove the part instead.");
      x.questionIds = x.questionIds.filter((id) => id !== edit.questionId);
      message = "Question removed.";
      break;
    }
    case "replaceQuestion": {
      const x = sectionOf(doc, edit.key);
      const i = x.questionIds.indexOf(edit.questionId);
      if (i < 0) throw new ValidationError("This question is not in the plan.");
      const pool = x.placeCode ? (await mapLessonQuestions(repo, schoolId, x.placeCode)).questionIds : undefined;
      const other = await similarQuestion(repo, schoolId, x.skillId, edit.questionId, { exclude: planQuestionIds(doc), studentIds: x.studentIds ?? p.planStudents, pool });
      if (!other) throw new ValidationError("No similar question is left for this skill.");
      x.questionIds[i] = other;
      message = "Replaced with a similar question.";
      break;
    }
    case "moveQuestion": {
      const x = sectionOf(doc, edit.key);
      x.questionIds = move(x.questionIds, x.questionIds.indexOf(edit.questionId), edit.dir);
      message = "Order saved.";
      break;
    }
  }
  let notified = 0;
  const sent = p.status === "SENT" || p.status === "PAUSED";
  if (sent) {
    if (!doc.sections.length) throw new ValidationError("A sent plan needs at least one part. To stop it, use Withdraw.");
    const next = { ...p, row: { ...p.row, ...patch }, planStudents: patch.studentIds !== undefined ? ((patch.studentIds as string[] | null) ?? p.members) : p.planStudents };
    notified = await syncSent(repo, actor, next, before, doc, now);
  }
  await repo.updateMany("SkillPlan", { id: p.row.id }, { ...patch, doc, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "plan.edit", entityType: "SkillPlan", entityId: s(p.row.id), after: { edit: edit.kind, status: p.status, notified }, at: now });
  const messageT: Txt = typeof message === "string" ? { t: message } : message;
  return { planId: s(p.row.id), status: p.status, message: fmt(messageT) + (sent && notified ? " The students got the update." : ""), messageT, notified };
}

// ------------------------------------------------------------------ send, after sending

const LONG_LABEL = (program: Program | null, grade: number, name: string) => `${editorPlanLabel(program)} · Grade ${grade} · ${name}`.slice(0, 255);

/** A section → one part of the batched send (plans/batch-send.ts): its students, questions, lesson and plan item. */
function partOf(p: LoadedPlan, x: PlanSection, grammar: boolean, paused: boolean, order?: number): BatchPart {
  const who = (x.studentIds ?? p.planStudents).filter((id) => p.members.includes(id)).sort();
  if (!who.length) throw new ValidationError(`${x.label ?? x.skillName}: none of its students is in the class now.`);
  return {
    skillId: x.skillId, studentIds: who, track: trackOfProgram(p.program, grammar), questionIds: x.auto ? null : x.questionIds, title: x.label,
    lesson: x.lesson && !paused, itemCode: x.placeCode, itemLabel: LONG_LABEL(p.program, p.grade, x.label ?? x.skillName), ...(paused ? { startAt: PAUSE_UNTIL } : {}),
    ...(order !== undefined ? { order } : {}),
  };
}

/** Sends sections in ONE batch (r82): every part's assignment, students, plan item and lesson together. Sets x.assignmentId. */
async function sendSections(repo: Repo, actor: Actor, p: LoadedPlan, xs: { x: PlanSection; order?: number }[], now: Date, paused: boolean, source: AssignSource, notify: boolean): Promise<Set<string>> {
  if (!xs.length) return new Set();
  const idx = await schoolSkillIndex(repo, s(p.klass.schoolId));
  const parts = xs.map(({ x, order }) => partOf(p, x, isGrammarCode(s(idx.skillOf.get(x.skillId)?.code)), paused, order));
  const r = await sendPartsBatch(repo, actor, {
    klass: p.klass, members: p.members, plan: { id: s(p.row.id), title: s(p.row.title) }, parts, dueAt: d(p.row.dueAt), startAt: paused ? null : d(p.row.startAt),
    note: s(p.row.note) || `${editorPlanLabel(p.program)}: ${s(p.row.title)}`, program: p.program, source, notify, noLessons: paused,
  }, now);
  xs.forEach(({ x }, i) => { x.assignmentId = r.byPart[i].assignmentId; });
  return r.students;
}

/**
 * ▶ Sends a draft: every section to its students, in one batch (r82). Nothing half-made on an error. Pressing Send
 * twice (or two presses at once) sends once: the draft is claimed first (one conditional write), the second press
 * is told the plan is on its way / sent.
 */
export async function sendPlan(repo: Repo, actor: Actor, planId: string, now = new Date(), /** r74: the Source chosen next to Send (a program plan: its program) */ sourceIn?: string | null): Promise<{ planId: string; sections: number; students: number }> {
  assertCan(actor, "assignments:create");
  // r74 + owner r82: a program plan's work is that program's (RTI → RTI, NAFS → NAFS, MAP → MAP, Curriculum →
  // Curriculum); a custom plan needs the teacher's choice
  const head = await repo.findUnique("SkillPlan", { id: String(planId ?? "") });
  const program: Program | null = !head ? null : isProgram(head.program) ? head.program : programOfPlanKind(head.kind);
  // ⚡ an Enrichment plan's source is "Enrichment" — shown, not asked, exactly like a program plan's own program.
  const source: AssignSource | null = s(head?.kind) === "ENRICHMENT" ? "ENRICHMENT" : planSource(program, sourceIn);
  if (!source) throw new ValidationError(SOURCE_REQUIRED);
  const p = await loadPlan(repo, actor, planId);
  if (p.status !== "DRAFT") throw new ValidationError("This plan was sent already. Your changes reach the students as you make them.");
  assertProgramFitsGrade(p.program, p.grade);
  if (!p.doc.sections.length) throw new ValidationError("Add at least one skill or lesson to the plan.");
  const due = d(p.row.dueAt);
  if (due && due.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
  // every listed question once in the whole plan (checked again here; published / of the school: in the batch)
  const all = planQuestionIds(p.doc);
  if (all.length) {
    const keys = await contentKeysForIds(repo, all);
    const sit = new Sitting();
    for (const id of all) { if (sit.has(id, keys.get(id) ?? [])) throw new ValidationError("The same question is in the plan twice. Remove one copy."); sit.add(id, keys.get(id) ?? []); }
  }
  // 🔒 claim the draft (one conditional write): a second press finds it claimed and sends nothing
  let claimed = await repo.updateMany("SkillPlan", { id: p.row.id, status: "DRAFT", sentAt: null }, { sentAt: now });
  const was = d(p.row.sentAt);
  if (!claimed && was && now.getTime() - was.getTime() > SEND_CLAIM_MS) claimed = await repo.updateMany("SkillPlan", { id: p.row.id, status: "DRAFT", sentAt: was }, { sentAt: now });
  if (!claimed) throw new ValidationError("This plan is being sent. Wait a moment, then open it again.");
  const doc: PlanDoc = JSON.parse(JSON.stringify(p.doc));
  let students: Set<string>;
  try {
    students = await sendSections(repo, actor, p, doc.sections.map((x) => ({ x })), now, false, source, true);
  } catch (e) {
    await repo.updateMany("SkillPlan", { id: p.row.id, status: "DRAFT" }, { sentAt: null }).catch(() => 0);
    throw e;
  }
  await repo.updateMany("SkillPlan", { id: p.row.id }, { status: "SENT", doc, sentAt: now, updatedAt: now, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "plan.send", entityType: "SkillPlan", entityId: s(p.row.id), after: { program: p.program, sections: doc.sections.length, students: students.size, source }, at: now });
  return { planId: s(p.row.id), sections: doc.sections.length, students: students.size };
}
/** a claim older than this (the server stopped in the middle of a send) may be taken again */
const SEND_CLAIM_MS = 3 * 60_000;

/**
 * After an edit of a sent plan: the assignments follow the plan. New sections are sent, removed ones cancelled
 * (answers kept), changed ones updated in place (questions, students, dates, note). Returns how many students were
 * told about the change.
 */
/** r74: the source of a sent plan = the source of its first sent part (older parts: inferred from the row); else its program. */
async function sentPlanSource(repo: Repo, p: LoadedPlan, before: PlanDoc): Promise<string> {
  const first = before.sections.find((x) => x.assignmentId)?.assignmentId;
  const row = first ? await repo.findUnique("Assignment", { id: first }) : null;
  return sourceOfAssignment(row ?? { program: p.program });
}

async function syncSent(repo: Repo, actor: Actor, p: LoadedPlan, before: PlanDoc, after: PlanDoc, now: Date): Promise<number> {
  const paused = p.status === "PAUSED";
  const touched = new Set<string>();
  const live = new Set(after.sections.map((x) => x.assignmentId).filter(Boolean) as string[]);
  for (const x of before.sections) {
    if (!x.assignmentId || live.has(x.assignmentId)) continue;
    try { await cancelAssignment(repo, actor, x.assignmentId, now); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
    for (const it of await repo.findMany("SkillPlanItem", { planId: p.row.id }, { select: ["id", "assignmentIds"] })) if (jsonIds(it.assignmentIds).includes(x.assignmentId)) await repo.deleteMany("SkillPlanItem", { id: it.id });
    for (const l of await repo.findMany("AssignmentStudent", { assignmentId: x.assignmentId }, { select: ["studentId"] })) touched.add(s(l.studentId));
  }
  let order = 0;
  // r74: a part added to a SENT plan keeps the plan's source (the one chosen at Send; older plans: inferred); r82: batched
  const fresh = after.sections.map((x, i) => ({ x, order: i })).filter(({ x }) => !x.assignmentId);
  if (fresh.length) for (const id of await sendSections(repo, actor, p, fresh, now, paused, (await sentPlanSource(repo, p, before)) as AssignSource, false)) touched.add(id);
  const isFresh = new Set(fresh.map(({ x }) => x.key));
  for (const x of after.sections) {
    if (isFresh.has(x.key) || !x.assignmentId) { order++; continue; }
    const old = before.sections.find((y) => y.assignmentId === x.assignmentId);
    const who = (x.studentIds ?? p.planStudents).filter((id) => p.members.includes(id));
    const rows = await repo.findMany("AssignmentStudent", { assignmentId: x.assignmentId }, { select: ["studentId"] });
    const had = new Set(rows.map((r) => s(r.studentId)));
    const add = who.filter((id) => !had.has(id)), drop = [...had].filter((id) => !who.includes(id));
    if (add.length) await repo.createMany("AssignmentStudent", add.map((studentId) => ({ assignmentId: x.assignmentId, studentId, status: "NOT_STARTED", progress: 0 })));
    // the student keeps every answer given (attempts are never touched); the work leaves their list
    if (drop.length) await repo.deleteMany("AssignmentStudent", { assignmentId: x.assignmentId, studentId: { in: drop } });
    for (const id of [...add, ...drop]) touched.add(id);
    const qChanged = !old || old.auto !== x.auto || old.questionIds.join(",") !== x.questionIds.join(",");
    if (qChanged) {
      if (x.assessmentId) {
        await repo.deleteMany("AssessmentQuestion", { assessmentId: x.assessmentId });
        if (x.questionIds.length) await repo.createMany("AssessmentQuestion", x.questionIds.map((questionId, i) => ({ assessmentId: x.assessmentId, questionId, order: i, points: 1 })));
      } else await repo.updateMany("Assignment", { id: x.assignmentId }, { questionIds: x.auto ? null : x.questionIds });
      for (const id of who) touched.add(id);
    }
    await repo.updateMany("Assignment", { id: x.assignmentId }, { dueAt: d(p.row.dueAt), startAt: paused ? PAUSE_UNTIL : d(p.row.startAt), note: s(p.row.note) || `${editorPlanLabel(p.program)}: ${s(p.row.title)}` });
    if (x.lesson && !old?.lesson && !paused) for (const id of who) await inviteToLesson(repo, id, x.skillId, "ASSIGNMENT", now).catch(() => false);
    for (const it of await repo.findMany("SkillPlanItem", { planId: p.row.id }, { select: ["id", "assignmentIds"] })) if (jsonIds(it.assignmentIds).includes(x.assignmentId)) await repo.updateMany("SkillPlanItem", { id: it.id }, { order: order, label: LONG_LABEL(p.program, p.grade, x.label ?? x.skillName) });
    order++;
  }
  if (touched.size && !paused) {
    const st = await repo.findMany("Student", { id: { in: [...touched].slice(0, 400) } }, { select: ["id", "userId"] });
    await repo.createMany("Notification", st.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "Your plan was updated", body: s(p.row.title), link: `/student/plans/${s(p.row.id)}`, createdAt: now })));
  }
  return paused ? 0 : touched.size;
}

const liveAssignments = (doc: PlanDoc) => doc.sections.map((x) => x.assignmentId).filter(Boolean) as string[];

/** ⏸ Pause: the work leaves the students' lists for now (answers kept). ▶ Resume brings it back. */
export async function pausePlan(repo: Repo, actor: Actor, planId: string, pause: boolean, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const p = await loadPlan(repo, actor, planId);
  if (pause && p.status !== "SENT") throw new ValidationError("Only a sent plan can be paused.");
  if (!pause && p.status !== "PAUSED") throw new ValidationError("This plan is not paused.");
  const ids = liveAssignments(p.doc);
  if (ids.length) await repo.updateMany("Assignment", { id: { in: ids }, deletedAt: null }, { startAt: pause ? PAUSE_UNTIL : d(p.row.startAt) });
  await repo.updateMany("SkillPlan", { id: p.row.id }, { status: pause ? "PAUSED" : "SENT", updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: pause ? "plan.pause" : "plan.resume", entityType: "SkillPlan", entityId: s(p.row.id), at: now });
}

/** ↩ Withdraw: every assignment of the plan is cancelled (answers already given are kept); the plan leaves My Plans. */
export async function withdrawPlan(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<{ cancelled: number }> {
  assertCan(actor, "assignments:create");
  const p = await loadPlan(repo, actor, planId);
  if (p.status !== "SENT" && p.status !== "PAUSED") throw new ValidationError("Only a sent plan can be withdrawn.");
  let cancelled = 0;
  for (const id of liveAssignments(p.doc)) { try { await cancelAssignment(repo, actor, id, now); cancelled++; } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  await repo.deleteMany("SkillPlanItem", { planId: p.row.id });
  await repo.updateMany("SkillPlan", { id: p.row.id }, { status: "WITHDRAWN", updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "plan.withdraw", entityType: "SkillPlan", entityId: s(p.row.id), after: { cancelled }, at: now });
  return { cancelled };
}

/** 🗑 Deletes a draft (never a sent plan). */
export async function deleteDraft(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const p = await loadPlan(repo, actor, planId);
  if (p.status !== "DRAFT") throw new ValidationError("Only a draft can be deleted. Withdraw a sent plan instead.");
  await repo.deleteMany("SkillPlanItem", { planId: p.row.id });
  await repo.deleteMany("SkillPlan", { id: p.row.id });
  await audit(repo, { actorId: actor.userId, action: "plan.delete_draft", entityType: "SkillPlan", entityId: s(p.row.id), at: now });
}

/**
 * 🗑 r87 (owner: "اداه حذف للمعلم لو عايز يلغيها... الغاء نهائى او تظل محفوظه حسب اختيار المعلم"): the teacher's
 * other, PERMANENT choice next to "withdraw" (stays saved, reversible-by-support, kept in Finished). This one
 * removes the SkillPlan row itself — gone from My Plans and Assigned for good, no Undo. It never touches a
 * student's answers: a sent/paused plan is withdrawn first (the exact same `cancelAssignment` + `deletedAt`-style
 * hide every other cancel in this codebase uses), which only hides the Assignment rows; their AssignmentStudent
 * links and every answer the students already gave stay in the database untouched, just no longer reachable
 * through this plan. A draft (nothing ever sent) goes through the existing `deleteDraft` path, which has nothing
 * to withdraw.
 */
export async function deletePlanPermanently(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const p = await loadPlan(repo, actor, planId);
  if (p.status === "DRAFT") return deleteDraft(repo, actor, planId, now);
  if (p.status === "SENT" || p.status === "PAUSED") await withdrawPlan(repo, actor, planId, now);
  await repo.deleteMany("SkillPlanItem", { planId: p.row.id });
  await repo.deleteMany("SkillPlan", { id: p.row.id });
  await audit(repo, { actorId: actor.userId, action: "plan.delete_permanent", entityType: "SkillPlan", entityId: s(p.row.id), at: now });
}

/**
 * ⧉ Duplicate: a new DRAFT with the same parts and questions (and details), for the same class or another of the
 * teacher's classes and the chosen students. Nothing is sent.
 */
export async function duplicatePlan(repo: Repo, actor: Actor, planId: string, input: { classId?: string | null; studentIds?: string[] | null } = {}, now = new Date()): Promise<string> {
  const p = await loadPlan(repo, actor, planId);
  const classId = input.classId || s(p.klass.id);
  const sameClass = classId === s(p.klass.id);
  const sections: SectionSpec[] = p.doc.sections.map((x) => ({
    skillId: x.skillId, placeCode: x.placeCode, label: x.label, auto: x.auto, questionIds: x.auto ? null : x.questionIds, count: x.questionIds.length || DEFAULT_COUNT,
    studentIds: sameClass && !input.studentIds?.length ? x.studentIds : null, lesson: x.lesson, level: x.level, reason: x.reason,
  }));
  const id = await createDraft(repo, actor, {
    classId, program: p.program, studentIds: input.studentIds?.length ? input.studentIds : sameClass ? (p.row.studentIds == null ? null : jsonIds(p.row.studentIds)) : null,
    title: `${s(p.row.title)} (copy)`.slice(0, 191), note: s(p.row.note), goals: s(p.row.goals), dueAt: null, startAt: null, sections, suggested: false, source: parseSource(p.row.source),
  }, now);
  if (p.row.baseline) await repo.updateMany("SkillPlan", { id }, { baseline: p.row.baseline });
  return id;
}

// ------------------------------------------------------------------ one edit, several plans

export type BulkOp =
  | { kind: "dueAt"; dueAt: Date | null }
  | { kind: "note"; note: string }
  | { kind: "goals"; goals: string }
  | { kind: "addSkill"; skillId: string; count: number; lesson?: boolean }
  | { kind: "removeSkill"; skillId: string }
  | { kind: "count"; skillId: string; count: number };

/**
 * Applies one edit to several plans at once (e.g. the individual plans of several students). Each plan is checked
 * on its own (the teacher's own classes only); a plan where the edit does not fit is listed with the reason.
 */
export async function bulkEdit(repo: Repo, actor: Actor, planIds: string[], op: BulkOp, now = new Date()): Promise<{ done: number; skipped: { planId: string; title: string; reason: string }[] }> {
  assertCan(actor, "assignments:create");
  const ids = [...new Set(planIds.map(s).filter(Boolean))].slice(0, 60);
  if (!ids.length) throw new ValidationError("Choose at least one plan.");
  let done = 0;
  const skipped: { planId: string; title: string; reason: string }[] = [];
  const idx = await schoolSkillIndex(repo, s(actor.schoolId));
  const fam = (id: string) => idx.keyOf.get(id) ?? id;
  for (const id of ids) {
    let title = "";
    try {
      const p = await loadPlan(repo, actor, id);
      title = s(p.row.title);
      const sec = op.kind === "removeSkill" || op.kind === "count" ? p.doc.sections.find((x) => !x.placeCode && fam(x.skillId) === fam(op.skillId)) : null;
      let edit: PlanEdit;
      if (op.kind === "dueAt") edit = { kind: "details", dueAt: op.dueAt };
      else if (op.kind === "note") edit = { kind: "details", note: op.note };
      else if (op.kind === "goals") edit = { kind: "details", goals: op.goals };
      else if (op.kind === "addSkill") edit = { kind: "addSection", spec: { skillId: op.skillId, count: op.count, lesson: op.lesson } };
      else if (!sec) throw new ValidationError("This skill is not in the plan.");
      else edit = op.kind === "removeSkill" ? { kind: "removeSection", key: sec.key } : { kind: "count", key: sec.key, count: op.count };
      await editPlan(repo, actor, id, edit, now);
      done++;
    } catch (e) {
      if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
      skipped.push({ planId: id, title, reason: e.message });
    }
  }
  return { done, skipped };
}

// ------------------------------------------------------------------ what changed from the platform's version

export interface PlanChange { kind: "ADDED" | "REMOVED" | "CHANGED"; name: string; detail: Txt[] }

/** The teacher's changes against the platform's version (by skill / lesson). Pure. */
export function planDiff(baseline: PlanDoc | null, doc: PlanDoc): PlanChange[] {
  if (!baseline) return [];
  const id = (x: PlanSection) => x.placeCode ?? x.skillId;
  const out: PlanChange[] = [];
  for (const x of doc.sections) {
    const b = baseline.sections.find((y) => id(y) === id(x));
    if (!b) { out.push({ kind: "ADDED", name: x.label ?? x.skillName, detail: [x.auto ? { t: "the platform chooses" } : { t: "{n} question(s)", v: { n: x.questionIds.length } }] }); continue; }
    const detail: Txt[] = [];
    const added = x.questionIds.filter((q) => !b.questionIds.includes(q)).length, removed = b.questionIds.filter((q) => !x.questionIds.includes(q)).length;
    if (b.auto !== x.auto) detail.push({ t: x.auto ? "the platform chooses now" : "you picked the questions" });
    if (added) detail.push({ t: "{n} question(s) added", v: { n: added } });
    if (removed) detail.push({ t: "{n} question(s) removed", v: { n: removed } });
    if (!added && !removed && b.questionIds.join(",") !== x.questionIds.join(",")) detail.push({ t: "order changed" });
    if (b.questionIds.length !== x.questionIds.length && !x.auto && !b.auto) detail.push({ t: "{a} → {b} questions", v: { a: b.questionIds.length, b: x.questionIds.length } });
    if ((b.studentIds ?? []).join(",") !== (x.studentIds ?? []).join(",")) detail.push({ t: "students changed" });
    if (b.lesson !== x.lesson) detail.push({ t: x.lesson ? "lesson added" : "lesson removed" });
    if (detail.length) out.push({ kind: "CHANGED", name: x.label ?? x.skillName, detail });
  }
  for (const b of baseline.sections) if (!doc.sections.some((x) => id(x) === id(b))) out.push({ kind: "REMOVED", name: b.label ?? b.skillName, detail: [] });
  const order = (l: PlanSection[]) => l.map(id).filter((k) => baseline.sections.some((b) => id(b) === k) && doc.sections.some((x) => id(x) === k)).join(",");
  if (order(doc.sections) !== order(baseline.sections)) out.push({ kind: "CHANGED", name: "Order of the parts", detail: [{ t: "moved" }] });
  return out;
}

// ------------------------------------------------------------------ the plans list

export type PlanBucket = "DRAFTS" | "SENT" | "ACTIVE" | "FINISHED";
export interface PlanListRow {
  id: string; title: string; status: PlanStatus; finished: boolean; program: Program | null; kind: string; classId: string; className: string;
  students: number; scope: "CLASS" | "GROUP" | "STUDENT"; sections: number; questions: number; progress: number; dueAt: string | null; date: string; href: string;
  /** did it work? accuracy on the plan's own skills, before it was sent vs. since (null = not enough data either side). */
  effect: { before: number; after: number } | null;
  /** a sent plan going nowhere (0% progress, sent 7+ days ago) or a draft forgotten for 14+ days. */
  stale: boolean;
}

/**
 * The plans of the teacher's own classes (an admin: the school's), newest first, with their progress.
 * Buckets: Drafts · Sent (all sent) · Active (sent or paused, not finished) · Finished (done by all, past due, or withdrawn).
 * Bounded: the newest `limit` plans; progress in two batched reads.
 */
export async function plansOverview(repo: Repo, actor: Actor, opts: { classId?: string | null; bucket?: PlanBucket | null; limit?: number } = {}, now = new Date()): Promise<PlanListRow[]> {
  assertCan(actor, "assignments:read");
  staffOnly(actor);
  const { accessibleClasses } = await import("../teacher/assign");
  const classes = (await accessibleClasses(repo, actor)).filter((c) => !opts.classId || s(c.id) === opts.classId);
  if (!classes.length) return [];
  const rows = (await safeIfBehind("plans.overview", repo.findMany("SkillPlan", { classId: { in: classes.map((c) => s(c.id)) } }, { select: ["id", "title", "kind", "classId", "status", "program", "doc", "studentIds", "dueAt", "createdAt", "updatedAt", "sentAt"] }), [] as Row[]))
    .filter((p) => s(p.kind) !== "CURRICULUM")
    .sort((a, b) => (d(b.updatedAt ?? b.createdAt)?.getTime() ?? 0) - (d(a.updatedAt ?? a.createdAt)?.getTime() ?? 0)).slice(0, Math.max(1, Math.min(200, opts.limit ?? 100)));
  const items = rows.length ? await repo.findMany("SkillPlanItem", { planId: { in: rows.map((p) => s(p.id)) } }, { select: ["planId", "assignmentIds"] }) : [];
  const aids = [...new Set(items.flatMap((i) => jsonIds(i.assignmentIds)))];
  const links = aids.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: aids } }, { select: ["assignmentId", "studentId", "status", "progress"] }) : [];
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] });
  const size = new Map<string, number>();
  for (const m of members) size.set(s(m.classId), (size.get(s(m.classId)) ?? 0) + 1);
  // ⚡ "did it work?": one bounded read of the attempts of every sent plan's own skills and students (180 days,
  // 20 000 rows — the same bound perf-suggest.ts uses), split per plan by its own sentAt into before / since. A
  // plan's own skills may well have been practised through OTHER work too; this is a fair, cheap proxy, not a
  // controlled trial — EFFECT_MIN answers are required on each side, else effect stays null (never a misleading 0%).
  const EFFECT_MIN = 5;
  const sentRows = rows.filter((p) => s(p.status) !== "DRAFT" && p.sentAt);
  const docOf = new Map<string, PlanDoc | null>(sentRows.map((p) => [s(p.id), p.doc ? parseDoc(p.doc) : null]));
  const studentsOf = new Map<string, string[]>(sentRows.map((p) => {
    const chosen = p.studentIds == null ? null : jsonIds(p.studentIds);
    return [s(p.id), chosen?.length ? chosen : members.filter((m) => s(m.classId) === s(p.classId)).map((m) => s(m.studentId))];
  }));
  const effectSkillIds = [...new Set(sentRows.flatMap((p) => docOf.get(s(p.id))?.sections.map((x) => x.skillId) ?? []))];
  const effectStudentIds = [...new Set(sentRows.flatMap((p) => studentsOf.get(s(p.id)) ?? []))];
  const since = new Date(now.getTime() - 180 * 86_400_000);
  const effectAttempts = effectSkillIds.length && effectStudentIds.length
    ? await repo.findMany("QuestionAttempt", { studentId: { in: effectStudentIds }, skillId: { in: effectSkillIds }, createdAt: { gte: since } },
        { select: ["studentId", "skillId", "isCorrect", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 20000 })
    : [];
  const effectOf = (p: Row): { before: number; after: number } | null => {
    const doc = docOf.get(s(p.id)); const sentAt = d(p.sentAt)?.getTime() ?? 0;
    if (!doc || !sentAt) return null;
    const skillIds = new Set(doc.sections.map((x) => x.skillId));
    const studentIds = new Set(studentsOf.get(s(p.id)) ?? []);
    if (!skillIds.size || !studentIds.size) return null;
    let beforeN = 0, beforeC = 0, afterN = 0, afterC = 0;
    for (const a of effectAttempts) {
      if (!skillIds.has(s(a.skillId)) || !studentIds.has(s(a.studentId))) continue;
      const t = d(a.createdAt)?.getTime() ?? 0;
      if (t < sentAt) { beforeN++; if (a.isCorrect) beforeC++; } else { afterN++; if (a.isCorrect) afterC++; }
    }
    if (beforeN < EFFECT_MIN || afterN < EFFECT_MIN) return null;
    return { before: Math.round((100 * beforeC) / beforeN), after: Math.round((100 * afterC) / afterN) };
  };
  const out: PlanListRow[] = rows.map((p) => {
    const status = statusOf(p.status);
    const doc = p.doc ? parseDoc(p.doc) : null;
    const mine = new Set(items.filter((i) => s(i.planId) === s(p.id)).flatMap((i) => jsonIds(i.assignmentIds)));
    const l = links.filter((x) => mine.has(s(x.assignmentId)));
    const progress = l.length ? Math.round((100 * l.reduce((t, x) => t + (x.status === "COMPLETED" ? 1 : Math.max(0, Math.min(1, Number(x.progress) || 0))), 0)) / l.length) : 0;
    const chosen = p.studentIds == null ? null : jsonIds(p.studentIds);
    const students = status === "DRAFT" || !l.length ? (chosen?.length ? chosen.length : size.get(s(p.classId)) ?? 0) : new Set(l.map((x) => s(x.studentId))).size;
    const due = d(p.dueAt);
    const finished = status === "WITHDRAWN" || (status !== "DRAFT" && ((l.length > 0 && l.every((x) => x.status === "COMPLETED")) || (!!due && due.getTime() < now.getTime())));
    const klass = classes.find((c) => s(c.id) === s(p.classId));
    // ⚡ stale: a draft nobody opened again in 14+ days, or a plan sent 7+ days ago that is still at 0% and not finished.
    const stale = status === "DRAFT"
      ? (now.getTime() - (d(p.updatedAt ?? p.createdAt)?.getTime() ?? now.getTime())) > 14 * 86_400_000
      : !finished && progress === 0 && (now.getTime() - (d(p.sentAt)?.getTime() ?? now.getTime())) > 7 * 86_400_000;
    return {
      id: s(p.id), title: s(p.title), status, finished, program: isProgram(p.program) ? p.program : programOfPlanKind(p.kind), kind: s(p.kind), classId: s(p.classId), className: s(klass?.name),
      students, scope: students <= 1 ? "STUDENT" : students >= (size.get(s(p.classId)) ?? 0) ? "CLASS" : "GROUP",
      effect: effectOf(p), stale,
      sections: doc ? doc.sections.length : items.filter((i) => s(i.planId) === s(p.id)).length, questions: doc ? doc.sections.reduce((t, x) => t + x.questionIds.length, 0) : 0,
      progress, dueAt: day(p.dueAt), date: day(status === "DRAFT" ? p.updatedAt ?? p.createdAt : p.sentAt ?? p.createdAt) ?? "", href: `/teacher/plans/${s(p.id)}`,
    };
  });
  const b = opts.bucket;
  return out.filter((r) => !b || (b === "DRAFTS" ? r.status === "DRAFT" : b === "SENT" ? r.status !== "DRAFT" : b === "ACTIVE" ? (r.status === "SENT" || r.status === "PAUSED") && !r.finished : r.status !== "DRAFT" && r.finished));
}

// ------------------------------------------------------------------ the editor page

export interface EditorQuestion { id: string; stem: string; type: string; level: PlanLevel; skillName: string; passageId: string | null; passageTitle: string | null; published: boolean; answeredBy: number }
export interface EditorSection extends PlanSection { questions: EditorQuestion[]; students: { id: string; name: string }[]; done: number; total: number; poolSize: number | null }
export interface PlanEditorView {
  id: string; title: string; status: PlanStatus; program: Program | null; kind: string; classId: string; className: string; grade: number;
  note: string | null; goals: string | null; dueAt: string | null; startAt: string | null; sentAt: string | null;
  classStudents: { id: string; name: string }[]; planStudentIds: string[]; wholeClass: boolean;
  sections: EditorSection[]; changes: PlanChange[]; hasBaseline: boolean; source: PlanSource | null; progress: number; finished: boolean;
}

export async function studentNames(repo: Repo, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const st = await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nm = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  return new Map(st.map((x) => [s(x.id), nm.get(s(x.userId)) || "Student"]));
}

/** Everything the editor shows: each part's questions (stem, type, level, skill, passage) and, once sent, progress. */
export async function planEditorView(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<PlanEditorView> {
  const p = await loadPlan(repo, actor, planId);
  const { questionLines } = await import("./question-pick");
  const { countQuestionsOfSkills } = await import("../questions/skill-questions");
  const [lines, names, pools] = await Promise.all([
    questionLines(repo, planQuestionIds(p.doc)),
    studentNames(repo, p.members),
    p.doc.sections.some((x) => x.auto) ? countQuestionsOfSkills(repo, s(p.klass.schoolId), p.doc.sections.filter((x) => x.auto).map((x) => x.skillId)) : Promise.resolve(new Map<string, number>()),
  ]);
  const aids = liveAssignments(p.doc);
  const [links, sessions] = aids.length ? await Promise.all([
    repo.findMany("AssignmentStudent", { assignmentId: { in: aids } }, { select: ["assignmentId", "studentId", "status", "progress"] }),
    repo.findMany("PracticeSession", { assignmentId: { in: aids } }, { select: ["id", "assignmentId"] }),
  ]) : [[] as Row[], [] as Row[]];
  const attempts = sessions.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessions.map((x) => s(x.id)).slice(0, 2000) } }, { select: ["questionId", "studentId", "sessionId"] }) : [];
  const answered = new Map<string, Set<string>>();
  const aidOfSession = new Map(sessions.map((x) => [s(x.id), s(x.assignmentId)]));
  for (const a of attempts) { const k = `${aidOfSession.get(s(a.sessionId))}|${s(a.questionId)}`; const set = answered.get(k) ?? new Set(); set.add(s(a.studentId)); answered.set(k, set); }
  const sections: EditorSection[] = p.doc.sections.map((x) => {
    const l = links.filter((y) => s(y.assignmentId) === x.assignmentId);
    return {
      ...x,
      questions: x.questionIds.map((id) => { const q = lines.get(id); return { id, stem: q?.stem ?? "", type: q?.type ?? "", level: q?.level ?? "ON", skillName: q?.skillName ?? "", passageId: q?.passageId ?? null, passageTitle: q?.passageTitle ?? null, published: q?.published ?? false, answeredBy: answered.get(`${x.assignmentId}|${id}`)?.size ?? 0 }; }),
      students: (x.studentIds ?? p.planStudents).map((id) => ({ id, name: names.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
      done: l.filter((y) => y.status === "COMPLETED").length, total: l.length, poolSize: x.auto ? pools.get(x.skillId) ?? 0 : null,
    };
  });
  const progress = links.length ? Math.round((100 * links.reduce((t, x) => t + (x.status === "COMPLETED" ? 1 : Math.max(0, Math.min(1, Number(x.progress) || 0))), 0)) / links.length) : 0;
  const due = d(p.row.dueAt);
  return {
    id: s(p.row.id), title: s(p.row.title), status: p.status, program: p.program, kind: s(p.row.kind), classId: s(p.klass.id), className: s(p.klass.name), grade: p.grade,
    note: p.row.note ? s(p.row.note) : null, goals: p.row.goals ? s(p.row.goals) : null, dueAt: day(p.row.dueAt), startAt: day(p.row.startAt), sentAt: day(p.row.sentAt),
    classStudents: p.members.map((id) => ({ id, name: names.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
    planStudentIds: p.planStudents, wholeClass: p.row.studentIds == null || jsonIds(p.row.studentIds).length === 0,
    sections, changes: planDiff(p.row.baseline ? parseDoc(p.row.baseline) : null, p.doc), hasBaseline: Boolean(p.row.baseline), source: parseSource(p.row.source),
    progress, finished: p.status === "WITHDRAWN" || (p.status !== "DRAFT" && ((links.length > 0 && links.every((x) => x.status === "COMPLETED")) || (!!due && due.getTime() < now.getTime()))),
  };
}
