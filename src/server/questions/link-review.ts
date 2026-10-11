/**
 * 📝 UI reorg Phase 1 — the “needs review” list: links the platform could not make confidently (it never guesses
 * silently). An admin approves the best guess, picks another skill, or dismisses the row. Moving a question to a skill
 * also moves its past answers and recomputes the students' mastery (the same engine path as the Update 39C remap).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { isHiddenSkill } from "../skills/master";
import { applyRemap, recomputeSkill } from "../curriculum-map/remap-skills";
import { schoolSkillIndex } from "./skill-questions";

const s = (v: unknown) => String(v ?? "");
export const REVIEW_KINDS = ["QUESTION", "FAMILY_NAFS", "FAMILY_MAP", "READRISE"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const KIND_LABEL: Record<ReviewKind, string> = { QUESTION: "Question → skill", FAMILY_NAFS: "Skill → NAFS area", FAMILY_MAP: "Skill → MAP goal area", READRISE: "ReadRise question kind → skill" };

function assertAdmin(actor: Actor): void {
  assertCan(actor, "curriculum:edit");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins review skill links.");
}

export interface ReviewRow { id: string; kind: ReviewKind; subjectId: string; excerpt: string; guessId: string | null; guessLabel: string | null; confidence: number; reason: string; status: string; grade: number | null; currentSkill: string | null }
export interface ReviewList { rows: ReviewRow[]; total: number; open: Record<string, number>; page: number; pages: number; skillsByGrade: Record<number, { id: string; name: string }[]> }

const PER = 50;
/** One page of review rows (OPEN by default) with the skills an admin may pick for each grade on the page. */
export async function listReviews(repo: Repo, actor: Actor, opts: { kind?: string; status?: string; page?: number } = {}): Promise<ReviewList> {
  assertAdmin(actor);
  const schoolId = s(actor.schoolId);
  const status = ["OPEN", "APPROVED", "DISMISSED"].includes(s(opts.status)) ? s(opts.status) : "OPEN";
  const kind = (REVIEW_KINDS as readonly string[]).includes(s(opts.kind)) ? s(opts.kind) : null;
  const where = { schoolId, status, ...(kind ? { kind } : {}) };
  const total = await repo.count("SkillLinkReview", where);
  const pages = Math.max(1, Math.ceil(total / PER)), page = Math.min(pages, Math.max(1, Math.floor(opts.page ?? 1)));
  const rows = await repo.findMany("SkillLinkReview", where, { orderBy: [{ field: "kind", dir: "desc" }, { field: "confidence", dir: "desc" }, { field: "id", dir: "asc" }], take: PER, skip: (page - 1) * PER });
  const open: Record<string, number> = {};
  for (const k of REVIEW_KINDS) open[k] = await repo.count("SkillLinkReview", { schoolId, status: "OPEN", kind: k });
  // the grade and current skill of each question on the page
  const idx = await schoolSkillIndex(repo, schoolId);
  const qIds = rows.filter((r) => r.kind === "QUESTION").map((r) => s(r.subjectId));
  const qs = qIds.length ? await repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "skillId"] }) : [];
  const skillIdsNeeded = [...new Set(qs.map((q) => s(q.skillId)))];
  const cur = skillIdsNeeded.length ? await repo.findMany("Skill", { id: { in: skillIdsNeeded } }, { select: ["id", "name", "code"] }) : [];
  const grades = [...new Set(qs.map((q) => idx.gradeOf.get(s(q.skillId)) ?? 0).filter(Boolean))];
  const skillsByGrade: ReviewList["skillsByGrade"] = {};
  if (grades.length) {
    const ids = [...idx.ids].filter((id) => grades.includes(idx.gradeOf.get(id) ?? 0));
    const all: Row[] = [];
    for (let i = 0; i < ids.length; i += 400) all.push(...(await repo.findMany("Skill", { id: { in: ids.slice(i, i + 400) } }, { select: ["id", "name", "code", "isActive"] })));
    for (const k of all) {
      if (isHiddenSkill(k.code) || k.isActive === false || k.isActive === 0) continue;
      const g = idx.gradeOf.get(s(k.id)) ?? 0;
      (skillsByGrade[g] ??= []).push({ id: s(k.id), name: s(k.name) });
    }
    for (const g of Object.keys(skillsByGrade)) skillsByGrade[Number(g)].sort((a, b) => a.name.localeCompare(b.name));
  }
  return {
    rows: rows.map((r) => {
      const q = qs.find((x) => x.id === r.subjectId);
      const k = q ? cur.find((x) => x.id === q.skillId) : undefined;
      return { id: s(r.id), kind: s(r.kind) as ReviewKind, subjectId: s(r.subjectId), excerpt: s(r.excerpt), guessId: r.guessId ? s(r.guessId) : null, guessLabel: r.guessLabel ? s(r.guessLabel) : null, confidence: Number(r.confidence ?? 0), reason: s(r.reason), status: s(r.status), grade: q ? idx.gradeOf.get(s(q.skillId)) ?? null : null, currentSkill: k ? (isHiddenSkill(k.code) ? "Unclassified" : s(k.name)) : null };
    }),
    total, open, page, pages, skillsByGrade,
  };
}

/** Moves one question to a skill of the same school (answers moved, mastery recomputed). Never deletes anything. */
export async function moveQuestionToSkill(repo: Repo, schoolId: string, questionId: string, toSkillId: string, actorId: string | null, now = new Date()): Promise<boolean> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const q = await repo.findUnique("Question", { id: questionId });
  if (!q || q.deletedAt || !idx.ids.has(s(q.skillId))) throw new ForbiddenError("Question not found.");
  if (!idx.ids.has(toSkillId)) throw new ValidationError("Choose a skill of this school.");
  const from = s(q.skillId);
  if (from === toSkillId) return false;
  const [fromSkill, toSkill] = await Promise.all([repo.findUnique("Skill", { id: from }), repo.findUnique("Skill", { id: toSkillId })]);
  if (!toSkill || isHiddenSkill(toSkill.code) || toSkill.isActive === false) throw new ValidationError("Choose an active skill.");
  if (fromSkill && isHiddenSkill(fromSkill.code)) {
    // the Update 39C path: answers on the hidden skill are moved and mastery recomputed
    await applyRemap(repo, schoolId, { actorId, now, questionIds: [questionId], plan: { items: [{ questionId, grade: idx.gradeOf.get(from) ?? 0, place: null, fromSkillId: from, toSkillId, toSkill: s(toSkill.name), via: null, detail: "chosen by an admin (needs review)", confidence: 1 }], mapped: 1, left: 0, attemptsToMove: 0 } });
    return true;
  }
  // a question on a real skill: same steps
  const clash = q.externalRef ? (await repo.findMany("Question", { skillId: toSkillId, externalRef: q.externalRef }, { select: ["id"] })).length > 0 : false;
  await repo.updateMany("Question", { id: questionId }, { skillId: toSkillId, ...(clash ? { externalRef: null } : {}), updatedAt: now });
  const rows = await repo.findMany("QuestionAttempt", { questionId, skillId: from }, { select: ["studentId"] });
  await repo.updateMany("QuestionAttempt", { questionId, skillId: from }, { skillId: toSkillId });
  for (const st of [...new Set(rows.map((r) => s(r.studentId)))]) { await recomputeSkill(repo, st, from, now); await recomputeSkill(repo, st, toSkillId, now); }
  await audit(repo, { actorId, action: "question.relink", entityType: "Question", entityId: questionId, before: { skillId: from }, after: { skillId: toSkillId, skill: s(toSkill.name), attempts: rows.length }, at: now });
  return true;
}

/** Approve the best guess (or the admin's choice) of one review row. */
export async function approveReview(repo: Repo, actor: Actor, reviewId: string, choice: string | null, now = new Date()): Promise<string> {
  assertAdmin(actor);
  const r = await repo.findUnique("SkillLinkReview", { id: reviewId });
  if (!r || s(r.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Review not found.");
  if (s(r.status) !== "OPEN") throw new ValidationError("This row was already reviewed.");
  const pick = choice || (r.guessId ? s(r.guessId) : "");
  if (!pick) throw new ValidationError("Choose a skill first.");
  let msg = "Saved.";
  if (r.kind === "QUESTION") {
    const moved = await moveQuestionToSkill(repo, s(actor.schoolId), s(r.subjectId), pick, actor.userId, now);
    msg = moved ? "The question now counts for the chosen skill." : "The question keeps its skill.";
  } else if (r.kind === "FAMILY_NAFS") {
    const { linkNafsFamily } = await import("../nafs/nafs-links");
    await linkNafsFamily(repo, actor, s(r.subjectId), pick, now);
    msg = "The skill is linked to the NAFS area.";
  } else if (r.kind === "FAMILY_MAP") {
    const { linkFamily } = await import("../map/map-more");
    await linkFamily(repo, actor, s(r.subjectId), pick, now);
    msg = "The skill is linked to the MAP goal area.";
  } else throw new ValidationError("Link ReadRise question kinds in the ReadRise library settings.");
  await repo.updateMany("SkillLinkReview", { id: reviewId }, { status: "APPROVED", guessId: pick.slice(0, 40), reviewedById: actor.userId, reviewedAt: now });
  await audit(repo, { actorId: actor.userId, action: "skill_link.review.approve", entityType: "SkillLinkReview", entityId: reviewId, after: { kind: r.kind, subjectId: r.subjectId, choice: pick }, at: now });
  return msg;
}

/** Leave it as it is (the row stays as a record; nothing is changed). */
export async function dismissReview(repo: Repo, actor: Actor, reviewId: string, now = new Date()): Promise<void> {
  assertAdmin(actor);
  const r = await repo.findUnique("SkillLinkReview", { id: reviewId });
  if (!r || s(r.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Review not found.");
  await repo.updateMany("SkillLinkReview", { id: reviewId }, { status: "DISMISSED", reviewedById: actor.userId, reviewedAt: now });
  await audit(repo, { actorId: actor.userId, action: "skill_link.review.dismiss", entityType: "SkillLinkReview", entityId: reviewId, after: { kind: r.kind, subjectId: r.subjectId }, at: now });
}
