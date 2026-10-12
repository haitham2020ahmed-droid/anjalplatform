/**
 * 📝 Review & Send (Update 55): a teacher can save a skill assignment as a DRAFT (nothing reaches students), send
 * it later with one click, or ↩ withdraw work right after sending it. Drafts are kept as the teacher's own rows of
 * TestTemplate (testType "ASSIGN_DRAFT"), so no database change is needed; they never show among test templates.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assignSkillToClasses, cancelAssignment, type Track } from "./assign";

export const ASSIGN_DRAFT = "ASSIGN_DRAFT";
const s = (v: unknown) => String(v ?? "");

export interface AssignDraftSpec {
  skillId: string; skillName: string; classIds: string[]; studentIds: string[];
  track: Track; program: string | null; questionIds: string[] | null;
  startAt: string | null; dueAt: string | null; note: string;
}
export interface AssignDraftRow { id: string; title: string; spec: AssignDraftSpec; updatedAt: string }

const parse = (v: unknown): AssignDraftSpec => (typeof v === "string" ? JSON.parse(v) : v) as AssignDraftSpec;

function teacherOnly(actor: Actor) {
  if (actor.role !== "TEACHER") throw new ForbiddenError("Only teachers keep drafts.");
}

export async function saveAssignDraft(repo: Repo, actor: Actor, spec: AssignDraftSpec, now = new Date()): Promise<string> {
  teacherOnly(actor);
  if (!spec.skillId) throw new ValidationError("Choose a skill.");
  if (!spec.classIds.length) throw new ValidationError("Choose at least one class.");
  const mine = (await repo.findMany("TestTemplate", { schoolId: actor.schoolId, createdById: actor.userId, deletedAt: null }, { select: ["id", "testType"] })).filter((t) => t.testType === ASSIGN_DRAFT);
  if (mine.length >= 50) throw new ValidationError("You have 50 drafts. Send or delete some first.");
  const row = await repo.create("TestTemplate", { schoolId: actor.schoolId, createdById: actor.userId, title: spec.skillName.slice(0, 191) || "Draft", testType: ASSIGN_DRAFT, spec, createdAt: now, updatedAt: now });
  return s(row.id);
}

export async function listAssignDrafts(repo: Repo, actor: Actor): Promise<AssignDraftRow[]> {
  if (actor.role !== "TEACHER") return [];
  const rows = await repo.findMany("TestTemplate", { schoolId: actor.schoolId, createdById: actor.userId, deletedAt: null }, { orderBy: [{ field: "updatedAt", dir: "desc" }], take: 100 });
  return rows.filter((t) => t.testType === ASSIGN_DRAFT).map((t) => ({ id: s(t.id), title: s(t.title), spec: parse(t.spec), updatedAt: new Date(t.updatedAt as string).toISOString() }));
}

async function ownDraft(repo: Repo, actor: Actor, id: string): Promise<Row> {
  teacherOnly(actor);
  const t = await repo.findUnique("TestTemplate", { id });
  if (!t || t.deletedAt || t.testType !== ASSIGN_DRAFT || s(t.createdById) !== actor.userId) throw new ForbiddenError("Draft not found.");
  return t;
}

/** ▶ Send a draft now (the same checks as Assign: the teacher's own classes and students only). */
export async function sendAssignDraft(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<{ assignmentIds: string[]; students: number }> {
  const t = await ownDraft(repo, actor, id);
  const sp = parse(t.spec);
  const day = (v: string | null, end: boolean) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`) : null);
  const r = await assignSkillToClasses(repo, actor, { track: sp.track, classIds: sp.classIds, skillId: sp.skillId, studentIds: sp.studentIds, startAt: day(sp.startAt, false), dueAt: day(sp.dueAt, true), note: sp.note, program: sp.program as never, questionIds: sp.questionIds ?? undefined } as never, now);
  await repo.updateMany("TestTemplate", { id: t.id }, { deletedAt: now });
  return { assignmentIds: r.assignmentIds, students: r.students };
}

export async function deleteAssignDraft(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const t = await ownDraft(repo, actor, id);
  await repo.updateMany("TestTemplate", { id: t.id }, { deletedAt: now });
}

/** ↩ Withdraw work just sent (each assignment: the class's teacher only; answers already given are kept). */
export async function withdrawAssignments(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<number> {
  let n = 0;
  for (const id of [...new Set(ids.map(s).filter(Boolean))].slice(0, 20)) { await cancelAssignment(repo, actor, id, now); n++; }
  return n;
}
