/**
 * “Sort questions under their skills”: the link pass of scripts/db/link-bank-skills.ts (linkBank), run in small
 * batches so the 512 MB server never holds the bank in memory.
 *
 *   sortBatch   one batch of ~200 unclassified questions (on a grade's hidden “Unclassified” skill), from a cursor.
 *               apply = false → a preview (nothing written); apply = true → sure links are made, the rest is filed
 *               under “Skill links: needs review”. The page calls it in a loop with a progress bar.
 *   nightlySort the scheduled job: new unclassified questions since the last run, once per day per school.
 *
 * Never deletes a question and never changes a question's status (nothing is published). Admins only.
 */
import { ForbiddenError, assertCan, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { linkBank } from "./link-bank";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const SORT_BATCH = 200;
/** Review items returned per batch (the page shows the first few hundred, the full list is on /admin/skill-links). */
const REVIEW_CAP = 200;

export interface SortReviewItem { questionId: string; grade: number; excerpt: string; guess: string | null; reason: string }
export interface SortBatchResult { total: number; processed: number; linked: number; review: number; next: string | null; done: boolean; reviewItems: SortReviewItem[] }

function adminSchool(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can do this.");
  assertCan(actor, "curriculum:edit");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

/** The ids of this school's hidden “Unclassified (Curriculum Map)” skills (one per grade at most). */
export async function hiddenSkillIds(repo: Repo, schoolId: string): Promise<string[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  if (!curs.length) return [];
  const skills = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, code: { contains: "curriculum-map-unclassified" } }, { select: ["id", "code"] });
  return skills.filter((k) => isHiddenSkill(k.code)).map((k) => s(k.id));
}

/** How many questions are still unclassified (not deleted). */
export async function countUnclassified(repo: Repo, schoolId: string, since?: Date | null): Promise<number> {
  const hidden = await hiddenSkillIds(repo, schoolId);
  return hidden.length ? repo.count("Question", { skillId: { in: hidden }, deletedAt: null, ...(since ? { createdAt: { gte: since } } : {}) }) : 0;
}

async function runBatch(repo: Repo, schoolId: string, opts: { after: string | null; apply: boolean; actorId: string | null; since?: Date | null; size?: number; now?: Date; withTotal?: boolean }): Promise<SortBatchResult> {
  const hidden = await hiddenSkillIds(repo, schoolId);
  const size = Math.max(1, Math.min(SORT_BATCH, Math.floor(opts.size ?? SORT_BATCH)));
  const where = { skillId: { in: hidden }, deletedAt: null, ...(opts.since ? { createdAt: { gte: opts.since } } : {}) };
  const total = opts.withTotal && hidden.length ? await repo.count("Question", where) : 0;
  const page = hidden.length ? await repo.findMany("Question", { ...where, ...(opts.after ? { id: { gt: opts.after } } : {}) }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: size }) : [];
  if (!page.length) return { total, processed: 0, linked: 0, review: 0, next: null, done: true, reviewItems: [] };
  const ids = page.map((q) => s(q.id));
  const r = await linkBank(repo, schoolId, { apply: opts.apply, actorId: opts.actorId, now: opts.now, questionIds: ids, families: false, listCap: REVIEW_CAP });
  return {
    total, processed: ids.length, linked: r.summary.linked, review: r.summary.needsReview,
    next: ids[ids.length - 1], done: ids.length < size,
    reviewItems: r.review.slice(0, REVIEW_CAP).map((d) => ({ questionId: d.questionId, grade: d.grade, excerpt: d.excerpt.slice(0, 160), guess: d.toSkill, reason: d.detail.slice(0, 200) })),
  };
}

/**
 * One batch for the admin page. `after` is the cursor from the previous batch (null = start; the first batch also
 * returns `total` for the progress bar). Preview (apply = false) writes nothing.
 */
export async function sortBatch(repo: Repo, actor: Actor, input: { after: string | null; apply: boolean }, now = new Date()): Promise<SortBatchResult> {
  const schoolId = adminSchool(actor);
  return runBatch(repo, schoolId, { after: input.after ? s(input.after).slice(0, 191) : null, apply: Boolean(input.apply), actorId: actor.userId, now, withTotal: !input.after });
}

const LAST_RUN_KEY = "sort.questions.lastRun";
const dayKey = (now: Date) => `sort.questions.run.${new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10)}`;

/**
 * The nightly job (scripts/jobs/sort-questions.ts): questions that arrived unclassified since the last run are sorted
 * (sure links only; the rest goes to review). Claims the day first, so it runs at most once per day per school.
 */
export async function nightlySort(repo: Repo, schoolId: string, now = new Date()): Promise<{ ran: boolean; linked: number; review: number; processed: number }> {
  const claimed = await (await import("../jobs/runner")).claimSetting(repo, schoolId, dayKey(now), { startedAt: now.toISOString() });
  if (!claimed) return { ran: false, linked: 0, review: 0, processed: 0 };
  const last = (await repo.findMany("SchoolSetting", { schoolId, key: LAST_RUN_KEY }))[0];
  const raw = last ? (typeof last.value === "string" ? JSON.parse(last.value) : last.value) as { at?: string } | null : null;
  const since = raw?.at ? new Date(raw.at) : null;
  const out = { ran: true, linked: 0, review: 0, processed: 0 };
  let after: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const r = await runBatch(repo, schoolId, { after, apply: true, actorId: null, since, now });
    out.linked += r.linked; out.review += r.review; out.processed += r.processed;
    if (r.done || !r.next) break;
    after = r.next;
  }
  await repo.upsert("SchoolSetting", { schoolId, key: LAST_RUN_KEY }, { value: { at: now.toISOString() }, updatedBy: null }, { value: { at: now.toISOString() } });
  await repo.upsert("SchoolSetting", { schoolId, key: dayKey(now) }, { value: out }, { value: out });
  return out;
}
