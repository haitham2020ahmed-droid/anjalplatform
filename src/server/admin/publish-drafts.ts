/**
 * 📢 Publish the draft questions (an admin's decision, one button, in small batches): every DRAFT or UNDER_REVIEW
 * question of the school that sits under a real skill (not the hidden "Unclassified" ones) and has a correct answer
 * (a correct option or an answer value). Questions without a skill or without an answer stay drafts. Every change is
 * written to the audit log. Memory-light: 200 ids at a time.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";

const s = (v: unknown) => String(v ?? "");
const BATCH = 200;

export interface PublishBatch { published: number; skipped: number; next: string | null; done: boolean }

async function realSkillIds(repo: Repo, schoolId: string): Promise<string[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code"] }) : [];
  return skills.filter((k) => !s(k.code).endsWith("curriculum-map-unclassified")).map((k) => s(k.id));
}

/** How many drafts one press would publish (and how many would stay: no skill or no answer is checked per batch). */
export async function draftCount(repo: Repo, actor: Actor): Promise<number> {
  if (!actor.schoolId) return 0;
  const ids = await realSkillIds(repo, actor.schoolId);
  let n = 0;
  for (let i = 0; i < ids.length; i += 500) n += await repo.count("Question", { skillId: { in: ids.slice(i, i + 500) }, deletedAt: null, status: { in: ["DRAFT", "UNDER_REVIEW"] } });
  return n;
}

/** One batch (the page calls it again with `next` until done). */
export async function publishDraftBatch(repo: Repo, actor: Actor, after: string | null, now = new Date()): Promise<PublishBatch> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can publish questions.");
  assertCan(actor, "questions:publish");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const skillIds = await realSkillIds(repo, actor.schoolId);
  if (!skillIds.length) return { published: 0, skipped: 0, next: null, done: true };
  const where: Record<string, unknown> = { skillId: { in: skillIds }, deletedAt: null, status: { in: ["DRAFT", "UNDER_REVIEW"] } };
  if (after) where.id = { gt: after };
  const rows = await repo.findMany("Question", where, { select: ["id", "status"], orderBy: [{ field: "id", dir: "asc" }], take: BATCH });
  if (!rows.length) return { published: 0, skipped: 0, next: null, done: true };
  const ids = rows.map((r) => s(r.id));
  const [opts, answers] = await Promise.all([
    repo.findMany("QuestionOption", { questionId: { in: ids }, isCorrect: true }, { select: ["questionId"] }),
    repo.findMany("QuestionAnswer", { questionId: { in: ids } }, { select: ["questionId"] }),
  ]);
  const ok = new Set([...opts, ...answers].map((r: Row) => s(r.questionId)));
  const good = rows.filter((r) => ok.has(s(r.id)));
  if (good.length) {
    await repo.transaction(async (tx) => {
      await tx.updateMany("Question", { id: { in: good.map((r) => r.id) } }, { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId, updatedAt: now });
      await tx.createMany("AuditLog", good.map((q) => ({ actorId: actor.userId, action: "question.publish", entityType: "Question", entityId: s(q.id), before: { status: q.status }, after: { status: "PUBLISHED", via: "publish-drafts" }, createdAt: now })));
    });
  }
  const last = ids[ids.length - 1];
  return { published: good.length, skipped: rows.length - good.length, next: rows.length < BATCH ? null : last, done: rows.length < BATCH };
}
