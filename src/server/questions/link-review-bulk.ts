/**
 * 📝 Bulk tools for the “needs review” list (QUESTION rows only). Every link is still made by approveReview (answers
 * moved, mastery recomputed), in small batches called one by one from the page, so the server never holds the bank:
 *   - improveGuessesBatch   asks the school's AI (same provider, limits and checks as the other AI tools) for the best
 *                           skill of ~15 questions; only the question text, its options and the candidate skill names
 *                           are sent (never student data). A reply naming a skill outside the candidates is ignored.
 *   - acceptConfidentBatch  approves the rows whose best guess is sure (≥ 0.8)
 *   - reviewGroups / reviewGroupRows / acceptGroup   the “By suggested skill” view
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { isHiddenSkill } from "../skills/master";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Picked } from "../ai/engine";
import { approveReview } from "./link-review";
import { schoolSkillIndex } from "./skill-questions";
import { memoryHigh } from "../monitoring/memory";

const s = (v: unknown) => String(v ?? "");
export const CONFIDENT = 0.8;
export const AI_REASON = "AI suggestion";
export const AI_BATCH = 15;
export const ACCEPT_BATCH = 25;
export const GROUP_PAGE = 100;
// 🛑 fix (Oct 2026, production OOM): "Accept all confident guesses" / "Accept every guess" used to call their batch
// action back-to-back in a tight loop (up to 2000 batches of 25 rows, each row doing a real per-student mastery
// recompute via approveReview → moveQuestionToSkill), with no pause and no server-side backpressure at all — on a
// large backlog this sustained an allocation rate the instance's 512MB could not keep up with and the process was
// OOM-killed by Render twice in one day (confirmed from the memory.jump log: "/admin/skill-links" hit 160+ times in
// under a minute, while every named in-process cache stayed near zero, ruling out a cache leak — this loop is the
// cause). The fix: before doing any work, each batch checks memoryHigh() (≥78% of the plan's RAM) and, if the
// instance is already under pressure, does nothing and asks the client to pause BUSY_WAIT_MS before retrying the
// same cursor position — giving GC a chance to catch up instead of piling more allocation on top of a high baseline.
export const BUSY_WAIT_MS = 4_000;
const OPEN_Q = (schoolId: string) => ({ schoolId, status: "OPEN", kind: "QUESTION" });

function assertAdmin(actor: Actor): void {
  assertCan(actor, "curriculum:edit");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins review skill links.");
}
const cursor = (after: string | null | undefined) => (typeof after === "string" && after ? { id: { gt: after.slice(0, 64) } } : {});

type Index = Awaited<ReturnType<typeof schoolSkillIndex>>;
/** The skills an admin (or the AI) may pick for a grade: active, not hidden, by name. */
function skillsOfGrade(idx: Index, grade: number): { id: string; name: string }[] {
  return [...idx.skillOf.values()].filter((k) => k.grade === grade && k.isActive && !isHiddenSkill(k.code)).map((k) => ({ id: k.id, name: k.name })).sort((a, b) => a.name.localeCompare(b.name));
}
async function gradesOf(repo: Repo, idx: Index, questionIds: string[]): Promise<Map<string, number>> {
  const qs = questionIds.length ? await repo.findMany("Question", { id: { in: questionIds } }, { select: ["id", "skillId"] }) : [];
  return new Map(qs.map((q) => [s(q.id), idx.gradeOf.get(s(q.skillId)) ?? 0]));
}

// ------------------------------------------------------------------ 1. improve the guesses with AI

export interface AiProgress { total: number; improved: number }
/** Open question rows, and how many of them the AI already improved. */
export async function aiProgress(repo: Repo, actor: Actor): Promise<AiProgress> {
  assertAdmin(actor);
  const schoolId = s(actor.schoolId);
  return { total: await repo.count("SkillLinkReview", OPEN_Q(schoolId)), improved: await repo.count("SkillLinkReview", { ...OPEN_Q(schoolId), reason: AI_REASON }) };
}

export interface AiBatchResult { processed: number; improved: number; next: string | null; done: boolean; waitMs: number; message: string | null; stop: boolean }

interface AiQuestion { key: string; reviewId: string; grade: number; stem: string; options: string[] }
interface AiPick { key: string; skillId: string; label: string; confidence: number }

/** The prompt: question text and options, plus the candidate skills (names with short keys) of each grade. */
export function improvePrompt(qs: AiQuestion[], candidates: Map<number, { id: string; name: string }[]>): { system: string; user: Record<string, unknown>; keyOf: Map<string, { grade: number; id: string; name: string }> } {
  const keyOf = new Map<string, { grade: number; id: string; name: string }>();
  const skills: Record<string, { key: string; skill: string }[]> = {};
  for (const [g, list] of candidates) skills[`grade${g}`] = list.map((k, i) => { const key = `${g}.${i + 1}`; keyOf.set(key, { grade: g, ...k }); return { key, skill: k.name }; });
  return {
    keyOf,
    system: [
      "You sort English Language Arts questions (Grades 4–12) under the skill each one really tests.",
      'For every question choose ONE skill key from candidateSkills of the question\'s grade (e.g. grade 4 → candidateSkills.grade4). An idiom or figurative-language question is not "Make Predictions"; a question asking what a word means from the sentence around it is "Context Clues" unless it is about a word with several meanings.',
      'Give "confidence" from 0 to 1 (how sure you are). Never invent keys.',
      'Return ONLY JSON: {"results":[{"q":"q1","skill":"4.12","confidence":0.9}]} — one result for every question.',
    ].join(" "),
    user: { task: "Choose the skill of each question", candidateSkills: skills, questions: qs.map((q) => ({ q: q.key, grade: q.grade, stem: q.stem, options: q.options })) },
  };
}

/** Strict check of the AI reply: a skill key outside the question's grade candidates is ignored (the row keeps its guess). */
export function improveValidator(qs: AiQuestion[], keyOf: Map<string, { grade: number; id: string; name: string }>) {
  return (data: unknown): { ok: true; value: AiPick[] } | { ok: false; error: string } => {
    const list = (data as { results?: unknown } | null)?.results;
    if (!Array.isArray(list)) return { ok: false, error: "missing the “results” list" };
    const out: AiPick[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const q = qs.find((x) => x.key === s(r.q));
      const k = keyOf.get(s(r.skill).trim());
      const c = Number(r.confidence);
      if (!q || !k || k.grade !== q.grade || !Number.isFinite(c) || out.some((o) => o.key === q.key)) continue;
      out.push({ key: q.key, skillId: k.id, label: k.name, confidence: Math.max(0, Math.min(1, c)) });
    }
    return { ok: true, value: out };
  };
}

/** One AI request for the next ~15 open question rows not yet improved by AI (after the cursor). */
export async function improveGuessesBatch(repo: Repo, actor: Actor, env: EnvLike, opts: { after?: string | null; picked?: Picked; now?: Date; size?: number } = {}): Promise<AiBatchResult> {
  assertAdmin(actor);
  const schoolId = s(actor.schoolId), now = opts.now ?? new Date();
  const res = (x: Partial<AiBatchResult>): AiBatchResult => ({ processed: 0, improved: 0, next: opts.after ?? null, done: false, waitMs: 0, message: null, stop: false, ...x });
  const settings = await aiSettings(repo, schoolId);
  const picked = opts.picked ?? pickProvider(env, settings);
  if (!picked.ok) return res({ stop: true, message: picked.reason });
  const rate = await rateState(repo, schoolId, settings, now);
  if (rate.waitMs > 0) {
    // a day limit is not waited for in the page: it stops, and continues tomorrow from here
    if (rate.waitMs > 120_000) return res({ stop: true, message: rate.reason });
    return res({ waitMs: rate.waitMs, message: rate.reason });
  }
  const rows = await repo.findMany("SkillLinkReview", { ...OPEN_Q(schoolId), reason: { not: AI_REASON }, ...cursor(opts.after) }, { select: ["id", "subjectId"], orderBy: [{ field: "id", dir: "asc" }], take: Math.max(1, Math.min(AI_BATCH, opts.size ?? AI_BATCH)) });
  if (!rows.length) return res({ done: true, next: null });
  const next = s(rows[rows.length - 1].id);
  const idx = await schoolSkillIndex(repo, schoolId);
  const grades = await gradesOf(repo, idx, rows.map((r) => s(r.subjectId)));
  const ids = rows.map((r) => s(r.subjectId));
  const [qs, opts2] = await Promise.all([
    repo.findMany("Question", { id: { in: ids }, deletedAt: null }, { select: ["id", "stem"] }),
    repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "label", "text", "order"] }),
  ]);
  const candidates = new Map<number, { id: string; name: string }[]>();
  const items: AiQuestion[] = [];
  rows.forEach((r) => {
    const g = grades.get(s(r.subjectId)) ?? 0, q = qs.find((x) => x.id === r.subjectId);
    if (!g || !q) return;
    if (!candidates.has(g)) candidates.set(g, skillsOfGrade(idx, g));
    if (!candidates.get(g)!.length) return;
    const options = opts2.filter((o) => o.questionId === q.id).sort((a, b) => Number(a.order) - Number(b.order)).map((o) => `${s(o.label)}. ${s(o.text)}`.slice(0, 200));
    items.push({ key: `q${items.length + 1}`, reviewId: s(r.id), grade: g, stem: s(q.stem).slice(0, 600), options });
  });
  if (!items.length) return res({ processed: rows.length, next });
  for (const g of [...candidates.keys()]) if (!items.some((q) => q.grade === g)) candidates.delete(g);
  const { system, user, keyOf } = improvePrompt(items, candidates);
  const r = await callJson(repo, { schoolId, tool: "SKILL_LINK", picked, items: items.length }, system, user, improveValidator(items, keyOf), 1);
  if (!r.ok) {
    if (r.stop && /limit/i.test(r.error)) return res({ waitMs: 60_000, message: r.error });
    if (r.stop) return res({ stop: true, message: r.error });
    // the reply could not be used: these rows keep their guesses, the next batch goes on
    return res({ processed: rows.length, next, message: r.error });
  }
  for (const p of r.value) {
    const q = items.find((x) => x.key === p.key)!;
    await repo.updateMany("SkillLinkReview", { id: q.reviewId, status: "OPEN" }, { guessId: p.skillId.slice(0, 40), guessLabel: p.label.slice(0, 160), confidence: p.confidence, reason: AI_REASON });
  }
  return res({ processed: rows.length, improved: r.value.length, next });
}

// ------------------------------------------------------------------ 2. accept every confident guess

/** How many open question rows have a sure best guess (≥ 0.8). */
export async function confidentCount(repo: Repo, actor: Actor): Promise<number> {
  assertAdmin(actor);
  return repo.count("SkillLinkReview", { ...OPEN_Q(s(actor.schoolId)), confidence: { gte: CONFIDENT }, guessId: { not: null } });
}

export interface AcceptBatchResult { linked: number; failed: number; next: string | null; done: boolean; waitMs: number }
/** Approves the next ~25 confident rows (after the cursor) with their best guess. A row that fails stays open. */
export async function acceptConfidentBatch(repo: Repo, actor: Actor, after: string | null, now = new Date()): Promise<AcceptBatchResult> {
  assertAdmin(actor);
  // 🛑 fix (Oct 2026): pause this batch (same cursor, nothing done) when the instance is already low on memory —
  // see BUSY_WAIT_MS above.
  if (memoryHigh()) return { linked: 0, failed: 0, next: after, done: false, waitMs: BUSY_WAIT_MS };
  const rows = await repo.findMany("SkillLinkReview", { ...OPEN_Q(s(actor.schoolId)), confidence: { gte: CONFIDENT }, guessId: { not: null }, ...cursor(after) }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: ACCEPT_BATCH });
  if (!rows.length) return { linked: 0, failed: 0, next: null, done: true, waitMs: 0 };
  const r = await approveMany(repo, actor, rows.map((x) => s(x.id)), now);
  return { ...r, next: s(rows[rows.length - 1].id), done: rows.length < ACCEPT_BATCH, waitMs: 0 };
}

// ------------------------------------------------------------------ 2b. accept EVERY guess, any confidence
// (the owner asked for a one-click "approve all" instead of Save/Leave on each row one by one — this is the same
// accept path as acceptConfidentBatch, just without the ≥80% floor, so a row like "sure: 60%" is included too)

/** How many open question rows have a best guess at all (any confidence, not just ≥ 0.8). */
export async function guessedCount(repo: Repo, actor: Actor): Promise<number> {
  assertAdmin(actor);
  return repo.count("SkillLinkReview", { ...OPEN_Q(s(actor.schoolId)), guessId: { not: null } });
}

/** Approves the next ~25 rows with a best guess (after the cursor), whatever their confidence. A row that fails stays open. */
export async function acceptAllGuessesBatch(repo: Repo, actor: Actor, after: string | null, now = new Date()): Promise<AcceptBatchResult> {
  assertAdmin(actor);
  // 🛑 fix (Oct 2026): same memory circuit-breaker as acceptConfidentBatch above.
  if (memoryHigh()) return { linked: 0, failed: 0, next: after, done: false, waitMs: BUSY_WAIT_MS };
  const rows = await repo.findMany("SkillLinkReview", { ...OPEN_Q(s(actor.schoolId)), guessId: { not: null }, ...cursor(after) }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: ACCEPT_BATCH });
  if (!rows.length) return { linked: 0, failed: 0, next: null, done: true, waitMs: 0 };
  const r = await approveMany(repo, actor, rows.map((x) => s(x.id)), now);
  return { ...r, next: s(rows[rows.length - 1].id), done: rows.length < ACCEPT_BATCH, waitMs: 0 };
}

async function approveMany(repo: Repo, actor: Actor, ids: string[], now: Date): Promise<{ linked: number; failed: number }> {
  let linked = 0, failed = 0;
  for (const id of ids) {
    try { await approveReview(repo, actor, id, null, now); linked++; } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) failed++; else throw e; }
  }
  return { linked, failed };
}

// ------------------------------------------------------------------ 3. “By suggested skill”

export interface ReviewGroup { label: string; count: number; ai: number }
/** The open question rows grouped by their best guess (counts only; rows load when a group is opened). */
export async function reviewGroups(repo: Repo, actor: Actor): Promise<ReviewGroup[]> {
  assertAdmin(actor);
  const where = OPEN_Q(s(actor.schoolId));
  const map = new Map<string, ReviewGroup>();
  for (let skip = 0; ; skip += 2000) {
    const part = await repo.findMany("SkillLinkReview", where, { select: ["guessLabel", "reason"], orderBy: [{ field: "id", dir: "asc" }], take: 2000, skip });
    for (const r of part) {
      const label = s(r.guessLabel);
      const g = map.get(label) ?? map.set(label, { label, count: 0, ai: 0 }).get(label)!;
      g.count++; if (r.reason === AI_REASON) g.ai++;
    }
    if (part.length < 2000) break;
  }
  return [...map.values()].sort((a, b) => (a.label === "" ? 1 : b.label === "" ? -1 : b.count - a.count || a.label.localeCompare(b.label)));
}

export interface GroupRow { id: string; excerpt: string; confidence: number; grade: number | null; guessId: string | null; reason: string }
export interface GroupPage { rows: GroupRow[]; total: number; page: number; pages: number; skillsByGrade: Record<number, { id: string; name: string }[]> }
/** One page (100) of a group's rows, with the skills of their grades for “Move to…”. */
export async function reviewGroupRows(repo: Repo, actor: Actor, label: string, page = 1): Promise<GroupPage> {
  assertAdmin(actor);
  const where = { ...OPEN_Q(s(actor.schoolId)), guessLabel: label ? label.slice(0, 160) : null };
  const total = await repo.count("SkillLinkReview", where);
  const pages = Math.max(1, Math.ceil(total / GROUP_PAGE)), p = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const rows: Row[] = await repo.findMany("SkillLinkReview", where, { select: ["id", "subjectId", "excerpt", "confidence", "guessId", "reason"], orderBy: [{ field: "confidence", dir: "desc" }, { field: "id", dir: "asc" }], take: GROUP_PAGE, skip: (p - 1) * GROUP_PAGE });
  const idx = await schoolSkillIndex(repo, s(actor.schoolId));
  const grades = await gradesOf(repo, idx, rows.map((r) => s(r.subjectId)));
  const skillsByGrade: GroupPage["skillsByGrade"] = {};
  for (const g of new Set(grades.values())) if (g) skillsByGrade[g] = skillsOfGrade(idx, g);
  return {
    rows: rows.map((r) => ({ id: s(r.id), excerpt: s(r.excerpt), confidence: Number(r.confidence ?? 0), grade: grades.get(s(r.subjectId)) || null, guessId: r.guessId ? s(r.guessId) : null, reason: s(r.reason) })),
    total, page: p, pages, skillsByGrade,
  };
}

/** “Accept the ticked ones”: approves these rows with their best guess (at most one page at a time). */
export async function acceptGroup(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<{ linked: number; failed: number }> {
  assertAdmin(actor);
  const list = [...new Set(ids.map(s).filter(Boolean))].slice(0, GROUP_PAGE);
  return approveMany(repo, actor, list, now);
}
