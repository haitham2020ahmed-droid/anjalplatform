/**
 * Teachers change the bank only through admin approval:
 *   - new questions and edits of published ones are drafts / revisions an admin publishes (existing flow);
 *   - removing a question is a request (with a reason) kept on the question (tags.deletionRequest); an admin
 *     approves it (deleted; once answered it is removed from the whole platform while students' answers stay —
 *     question-delete.ts) or rejects it.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { archiveQuestions, deleteQuestions } from "./question-delete";
import { keptWhileUnchanged } from "../cache/kept";

const s = (v: unknown) => String(v ?? "");
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
export interface DeletionRequest { reason: string; by: string; byName: string; at: string }

export const tagsOf = (q: Row): Record<string, unknown> => {
  const t = q.tags;
  if (t && typeof t === "object") return t as Record<string, unknown>;
  if (typeof t === "string") { try { return JSON.parse(t) as Record<string, unknown>; } catch { return {}; } }
  return {};
};

/** The pending deletion request stored on a question (or null). */
export function deletionRequestOf(q: Row | null | undefined): DeletionRequest | null {
  if (!q) return null;
  const r = tagsOf(q).deletionRequest as DeletionRequest | undefined;
  return r && typeof r === "object" && r.reason ? r : null;
}

export async function schoolSkillIds(repo: Repo, schoolId: string): Promise<string[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  return curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id"] })).map((k) => s(k.id)) : [];
}

export async function questionOfSchool(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const q = await repo.findUnique("Question", { id });
  if (!q || q.deletedAt) throw new ForbiddenError("Question not found.");
  if (!(await schoolSkillIds(repo, actor.schoolId!)).includes(s(q.skillId))) throw new ForbiddenError("Question not found.");
  return q;
}

export async function requestDeletion(repo: Repo, actor: Actor, questionId: string, reason: string, now = new Date()): Promise<void> {
  assertCan(actor, "questions:edit");
  const q = await questionOfSchool(repo, actor, questionId);
  const r = s(reason).replace(/\s+/g, " ").trim();
  if (r.length < 5) throw new ValidationError("Write the reason (at least a few words).");
  if (q.status === "ARCHIVED") throw new ValidationError("This question is already archived.");
  if (deletionRequestOf(q)) throw new ValidationError("A deletion request for this question is already waiting for an admin.");
  const me = await repo.findUnique("User", { id: actor.userId });
  const request: DeletionRequest = { reason: r.slice(0, 500), by: actor.userId, byName: s(me?.displayName ?? "Teacher"), at: now.toISOString() };
  await repo.updateMany("Question", { id: questionId }, { tags: { ...tagsOf(q), deletionRequest: request } });
  await repo.create("AuditLog", { actorId: actor.userId, action: "question.deletion.request", entityType: "Question", entityId: questionId, after: { reason: request.reason }, createdAt: now });
}

export interface DeletionRequestRow { id: string; stem: string; status: string; request: DeletionRequest }

const hasEditRequest = (q: Row) => Boolean((tagsOf(q).editRequest as { input?: unknown } | undefined)?.input);

/**
 * ⚡ The school's questions that carry a teacher request (a deletion or a change waiting). Finding them means reading the
 * tags of every question of the school (15,000+ rows): one scan, kept while the bank is unchanged (any write to a
 * question bumps the counters, so a new request or a decision is seen at once), shared by the Requests page, the
 * Questions page badge and the admin home.
 */
export function requestRows(repo: Repo, schoolId: string): Promise<Row[]> {
  return keptWhileUnchanged(repo, `qrequests|${schoolId}`, ["Question", "Skill", "Curriculum", "Grade"], 5 * 60_000, async () => {
    const skills = await schoolSkillIds(repo, schoolId);
    if (!skills.length) return [];
    const qs = await repo.findMany("Question", { skillId: { in: skills }, deletedAt: null }, { select: ["id", "stem", "status", "tags", "skillId", "difficultyLevel"] });
    return qs.filter((q) => deletionRequestOf(q) || hasEditRequest(q));
  });
}

async function pendingRows(repo: Repo, schoolId: string): Promise<Row[]> {
  return (await requestRows(repo, schoolId)).filter((q) => deletionRequestOf(q) && q.status !== "ARCHIVED");
}

export async function listDeletionRequests(repo: Repo, actor: Actor): Promise<DeletionRequestRow[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("Only admins see deletion requests.");
  return (await pendingRows(repo, actor.schoolId!)).map((q) => ({ id: s(q.id), stem: s(q.stem).slice(0, 200), status: s(q.status), request: deletionRequestOf(q)! }))
    .sort((a, b) => a.request.at.localeCompare(b.request.at));
}

/** For badges: admins see how many requests wait (others: 0). */
export async function countDeletionRequests(repo: Repo, actor: Actor): Promise<number> {
  if (!isAdmin(actor)) return 0;
  // one kept scan for both kinds of teacher requests: deletions and ✏️ changes waiting
  const qs = await requestRows(repo, actor.schoolId!);
  return qs.filter((q) => (deletionRequestOf(q) && q.status !== "ARCHIVED") || hasEditRequest(q)).length;
}

export async function decideDeletion(repo: Repo, actor: Actor, questionId: string, approve: boolean, now = new Date()): Promise<"deleted" | "archived" | "rejected"> {
  if (!isAdmin(actor)) throw new ForbiddenError("Only admins decide deletion requests.");
  const q = await questionOfSchool(repo, actor, questionId);
  const req = deletionRequestOf(q);
  if (!req) throw new ValidationError("There is no deletion request for this question.");
  const { deletionRequest: _drop, ...rest } = tagsOf(q); void _drop;
  if (!approve) {
    await repo.updateMany("Question", { id: questionId }, { tags: rest });
    await repo.create("AuditLog", { actorId: actor.userId, action: "question.deletion.reject", entityType: "Question", entityId: questionId, after: { reason: req.reason }, createdAt: now });
    return "rejected";
  }
  // never answered → deleted; answered by students → removed from the platform, their answers and reports intact
  // (r67: the admin's delete). The archive below is only for a question the delete could not take.
  const res = await deleteQuestions(repo, actor, [questionId], now);
  if (res.deleted) return "deleted";
  await repo.updateMany("Question", { id: questionId }, { tags: rest });
  await archiveQuestions(repo, actor, [questionId], `Deletion approved: ${req.reason}`.slice(0, 500), now);
  return "archived";
}
