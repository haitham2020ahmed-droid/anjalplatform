/**
 * ✏️ Teacher edits wait for the admin (Update 55, owner decision on item 30):
 *   - a teacher may edit ANY question of the bank (not only their own drafts); the change is saved as a request on
 *     the question (tags.editRequest) and students keep seeing the current version until an admin approves it;
 *   - the admin sees each request (before → after) and approves (the change applies for everyone) or rejects it;
 *     a published question students already answered gets a new version (their history keeps the old wording);
 *   - every applied change is kept in an edit log (tags.editLog: who, when, the version before) with Restore.
 * A teacher's own drafts are still edited directly (they are not live yet).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { getQuestion, reviewQuestion, reviseQuestion, submitForReview, updateDraft, validateEditorInput, type EditorInput } from "./questions";
import { questionOfSchool, requestRows, schoolSkillIds, tagsOf } from "./question-requests";

const s = (v: unknown) => String(v ?? "");
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const EDIT_LOG_MAX = 20;

export interface EditRequest { input: EditorInput; by: string; byName: string; at: string; stemBefore: string; note: string | null }
export interface EditLogEntry { at: string; by: string; byName: string; approvedBy: string; approvedByName: string; kind: "EDIT" | "RESTORE"; stemBefore: string; stemAfter: string; before: EditorInput; fromId: string }

export function editRequestOf(q: Row | null | undefined): EditRequest | null {
  if (!q) return null;
  const r = tagsOf(q).editRequest as EditRequest | undefined;
  return r && typeof r === "object" && r.input ? r : null;
}
export function editLogOf(q: Row | null | undefined): EditLogEntry[] {
  const l = q ? tagsOf(q).editLog : null;
  return Array.isArray(l) ? (l as EditLogEntry[]) : [];
}

/** Does this save go to the admin (a teacher changing a question that is not their own unpublished draft)? */
export function editNeedsApproval(actor: Actor, q: Row): boolean {
  if (actor.role !== "TEACHER") return false;
  const ownDraft = q.createdById === actor.userId && (q.status === "DRAFT" || q.status === "UNDER_REVIEW");
  return !ownDraft;
}

async function nameOf(repo: Repo, userId: string): Promise<string> {
  return s((await repo.findUnique("User", { id: userId }))?.displayName ?? "Teacher");
}

/** A teacher's change, kept for the admin (checked with the bank rules now, applied only when approved). */
export async function requestEdit(repo: Repo, actor: Actor, id: string, input: EditorInput, note: string | null = null, now = new Date()): Promise<void> {
  if (actor.role !== "TEACHER") throw new ForbiddenError("Only teachers send edit requests.");
  const q = await questionOfSchool(repo, actor, id);
  if (q.status === "ARCHIVED") throw new ValidationError("This question is archived.");
  const waiting = editRequestOf(q);
  if (waiting && waiting.by !== actor.userId) throw new ValidationError(`Another change of this question (by ${waiting.byName}) is waiting for the admin.`);
  await validateEditorInput(repo, actor, input, s(q.externalRef ?? id));
  const request: EditRequest = { input, by: actor.userId, byName: await nameOf(repo, actor.userId), at: now.toISOString(), stemBefore: s(q.stem).slice(0, 500), note: note ? note.slice(0, 500) : null };
  await repo.updateMany("Question", { id }, { tags: { ...tagsOf(q), editRequest: request } });
  await repo.create("AuditLog", { actorId: actor.userId, action: "question.edit.request", entityType: "Question", entityId: id, after: { stem: s(input.stem).slice(0, 300) }, createdAt: now });
}

export interface EditRequestRow { id: string; status: string; skill: string; stemBefore: string; stemAfter: string; levelBefore: number; levelAfter: number; changes: string[]; request: EditRequest }

/** What changed between the current question and the request, in a few words (shown to the admin). */
function changesOf(cur: EditorInput, next: EditorInput): string[] {
  const out: string[] = [];
  const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (!eq(cur.stem, next.stem)) out.push("Question text");
  if (!eq(cur.options?.map((o) => [o.text, o.correct]), next.options?.map((o) => [o.text, o.correct]))) out.push("Choices / correct answer");
  if (!eq(cur.whyCorrect, next.whyCorrect) || !eq(cur.tip, next.tip)) out.push("Explanation");
  if (!eq(cur.level, next.level)) out.push("Level");
  if (!eq(cur.skillId, next.skillId)) out.push("Skill");
  if (!eq(cur.passageText ?? null, next.passageText ?? null) && next.passageText !== undefined) out.push("Passage");
  if (!eq(cur.hint, next.hint)) out.push("Hint");
  return out.length ? out : ["Other details"];
}

export async function listEditRequests(repo: Repo, actor: Actor): Promise<EditRequestRow[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("Only admins see edit requests.");
  // ⚡ from the one kept scan of the school's questions with a teacher request (src/server/admin/question-requests.ts)
  const qs = (await requestRows(repo, actor.schoolId!)).filter((q) => editRequestOf(q));
  const names = new Map((qs.length ? await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "name"] }) : []).map((k) => [s(k.id), s(k.name)]));
  const rows: EditRequestRow[] = [];
  for (const q of qs) {
    const r = editRequestOf(q)!;
    const cur = (await getQuestion(repo, actor, s(q.id))).input;
    rows.push({ id: s(q.id), status: s(q.status), skill: names.get(s(q.skillId)) ?? "", stemBefore: s(q.stem), stemAfter: s(r.input.stem), levelBefore: Number(q.difficultyLevel), levelAfter: Number(r.input.level), changes: changesOf(cur, r.input), request: r });
  }
  return rows.sort((a, b) => a.request.at.localeCompare(b.request.at));
}

export async function countEditRequests(repo: Repo, actor: Actor): Promise<number> {
  if (!isAdmin(actor)) return 0;
  const skills = await schoolSkillIds(repo, actor.schoolId!);
  if (!skills.length) return 0;
  return (await repo.findMany("Question", { skillId: { in: skills }, deletedAt: null }, { select: ["id", "tags"] })).filter((q) => editRequestOf(q)).length;
}

/**
 * Applies a version of the question for everyone (admin): in place, or — when students already answered the
 * published question — as a new version that replaces it. The version before is kept in the edit log.
 */
async function applyVersion(repo: Repo, admin: Actor, id: string, input: EditorInput, entry: Omit<EditLogEntry, "before" | "stemBefore" | "stemAfter" | "fromId" | "approvedBy" | "approvedByName">, now: Date): Promise<string> {
  const q = await questionOfSchool(repo, admin, id);
  const before = (await getQuestion(repo, admin, id)).input;
  const answered = q.status === "PUBLISHED" && (await repo.count("QuestionAttempt", { questionId: id })) > 0;
  let target = id;
  if (answered) {
    target = await reviseQuestion(repo, admin, id, now);
    await updateDraft(repo, admin, target, input, now);
    await submitForReview(repo, admin, target, now);
    await reviewQuestion(repo, admin, target, "approve", "Teacher change approved", now);
  } else await updateDraft(repo, admin, id, input, now);
  const log: EditLogEntry = { ...entry, approvedBy: admin.userId, approvedByName: await nameOf(repo, admin.userId), stemBefore: s(q.stem).slice(0, 500), stemAfter: s(input.stem).slice(0, 500), before, fromId: id };
  const t = await repo.findUnique("Question", { id: target });
  const { editRequest: _drop, ...rest } = tagsOf(t!);
  void _drop;
  await repo.updateMany("Question", { id: target }, { tags: { ...rest, editLog: [log, ...editLogOf(t).filter((x) => x.at !== log.at)].slice(0, EDIT_LOG_MAX) } });
  if (target !== id) {
    const { editRequest: _old, ...oldRest } = tagsOf(q);
    void _old;
    await repo.updateMany("Question", { id }, { tags: oldRest });
  }
  return target;
}

/** Admin decision on a teacher's change: approve (applies for everyone) or reject (the question stays). */
export async function decideEdit(repo: Repo, admin: Actor, id: string, approve: boolean, note: string | null = null, now = new Date()): Promise<{ result: "applied" | "rejected"; id: string }> {
  if (!isAdmin(admin)) throw new ForbiddenError("Only admins approve changes.");
  const q = await questionOfSchool(repo, admin, id);
  const r = editRequestOf(q);
  if (!r) throw new ValidationError("There is no change waiting for this question.");
  if (!approve) {
    const { editRequest: _drop, ...rest } = tagsOf(q);
    void _drop;
    await repo.updateMany("Question", { id }, { tags: rest });
    await repo.create("Notification", { userId: r.by, type: "TEACHER_FEEDBACK", title: "Your question change was not approved", body: note?.trim() || "The admin kept the current version.", link: `/admin/questions/${id}`, createdAt: now });
    await repo.create("AuditLog", { actorId: admin.userId, action: "question.edit.reject", entityType: "Question", entityId: id, after: { by: r.by, note: note ?? null }, createdAt: now });
    return { result: "rejected", id };
  }
  const target = await applyVersion(repo, admin, id, r.input, { at: now.toISOString(), by: r.by, byName: r.byName, kind: "EDIT" }, now);
  await repo.create("Notification", { userId: r.by, type: "TEACHER_FEEDBACK", title: "Your question change was approved", body: "It now applies for every student.", link: `/admin/questions/${target}`, createdAt: now });
  await repo.create("AuditLog", { actorId: admin.userId, action: "question.edit.approve", entityType: "Question", entityId: target, after: { by: r.by, from: id }, createdAt: now });
  return { result: "applied", id: target };
}

/** ↩ Restore the version before one change of the edit log (admin; it is logged as a change too). */
export async function restoreEdit(repo: Repo, admin: Actor, id: string, at: string, now = new Date()): Promise<string> {
  if (!isAdmin(admin)) throw new ForbiddenError("Only admins restore a version.");
  const q = await questionOfSchool(repo, admin, id);
  const e = editLogOf(q).find((x) => x.at === at);
  if (!e) throw new ValidationError("That change is not in this question's log.");
  const target = await applyVersion(repo, admin, id, e.before, { at: now.toISOString(), by: admin.userId, byName: await nameOf(repo, admin.userId), kind: "RESTORE" }, now);
  await repo.create("AuditLog", { actorId: admin.userId, action: "question.edit.restore", entityType: "Question", entityId: target, after: { restoredFrom: at }, createdAt: now });
  return target;
}
