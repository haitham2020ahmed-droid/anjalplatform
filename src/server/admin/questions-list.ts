/**
 * 📚 The Questions list (/admin/questions), built for a bank of ~14,000 questions on a 512 MB server.
 *
 *   - one page of 50 rows per request: filtering, search, sort, paging and the count all run in the database
 *     (indexed columns: skillId, status, typeId, difficultyLevel, updatedAt), and only the columns the list shows
 *     are read. Details (choices, passage, key) are loaded only when a row is opened.
 *   - filters: search, skill family (the same skill in every grade), type, status, level; sort.
 *   - the status counts and the banners are cached per bank version (30 s).
 *   - bulk work goes by ids in batches (the page loops with a progress bar): publish, unpublish, move to a skill,
 *     flag for review, archive, delete. "All matching" ids are read id-only, 500 at a time.
 */
import { LEVEL_LABELS } from "../../config/engine";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { schoolSkillIndex } from "../questions/skill-questions";
import { STATUSES, type QuestionStatus } from "./questions";
import { schoolOf } from "./users";

const s = (v: unknown) => String(v ?? "");
export const PER_PAGE = 50;
/** ids per bulk call */
export const BULK_BATCH = 100;
/** “all matching” is capped (the page then asks to narrow the filters) */
export const MATCH_MAX = 5000;
const UNCLASSIFIED = ".curriculum-map-unclassified";

export type SortKey = "new" | "old" | "easy" | "hard";
export const SORTS: readonly SortKey[] = ["new", "old", "easy", "hard"];

export interface BankListFilter {
  q?: string;
  /** skill family key (familyKeyOf): the same skill in every grade */
  family?: string;
  /** one exact skill (links from a skill page) */
  skillId?: string;
  type?: string;
  status?: QuestionStatus | "ALL";
  level?: number;
  sort?: SortKey;
  page?: number;
  per?: number;
  /** kept for links from other pages: one Curriculum Map place, AI-drafted, MAP area, grade */
  mapCode?: string;
  ai?: boolean;
  mapArea?: string;
  grade?: number;
}

export interface BankListRow {
  id: string; stem: string; skill: string; skillId: string; grade: number; type: string; level: number; levelLabel: string;
  status: QuestionStatus; origin: string; updatedAt: string; hasPassage: boolean; hasImage: boolean; mine: boolean;
}

const typeCache = new WeakMap<object, { v: string; p: Promise<Map<string, string>> }>();
/** QuestionType code ↔ id (a tiny table, cached per write version). */
function typeMap(repo: Repo): Promise<Map<string, string>> {
  const v = modelVersion("QuestionType"), hit = typeCache.get(repo);
  if (hit && hit.v === v) return hit.p;
  const p = repo.findMany("QuestionType", {}, { select: ["id", "code"] }).then((r) => new Map(r.map((t) => [s(t.id), s(t.code)])));
  typeCache.set(repo, { v, p });
  return p;
}

/** The database condition of a filter (status excluded when `withStatus` is false); null = nothing can match. */
async function whereOf(repo: Repo, actor: Actor, f: BankListFilter, withStatus = true): Promise<Record<string, unknown> | null> {
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  let skills = [...idx.ids];
  if (f.family) skills = idx.members.get(f.family) ?? [];
  if (f.skillId) skills = skills.filter((k) => k === f.skillId);
  if (f.grade) skills = skills.filter((k) => idx.gradeOf.get(k) === f.grade);
  if (!skills.length) return null;
  const w: Record<string, unknown> = { skillId: { in: skills }, deletedAt: null };
  if (withStatus && f.status && f.status !== "ALL") w.status = f.status;
  if (f.level) w.difficultyLevel = f.level;
  if (f.ai) w.origin = "AI_GENERATED";
  if (f.type) {
    const id = [...(await typeMap(repo)).entries()].find(([, c]) => c === f.type)?.[0];
    if (!id) return null;
    w.typeId = id;
  }
  if (f.mapArea) {
    const { MAP_AREAS } = await import("../map/nwea-area");
    w.mapInstructionalArea = f.mapArea === "NONE" ? null : MAP_AREAS.find((a) => a.key === f.mapArea)?.name ?? "—";
  }
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) {
    // a question id or reference is found directly (indexed); otherwise the words are searched in the question text
    if (/^c[a-z0-9]{20,30}$/i.test(q)) w.id = q;
    else w.stem = { contains: q };
  }
  if (f.mapCode) {
    const code = f.mapCode.trim().toUpperCase();
    const grades = await repo.findMany("Grade", { schoolId: schoolOf(actor) }, { select: ["id"] });
    const nodes = grades.length ? (await repo.findMany("CurriculumMapNode", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "code"] })).filter((n) => s(n.code) === code || s(n.code).startsWith(`${code}.`)) : [];
    const ids = nodes.length ? (await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId"] })).map((l) => s(l.questionId)) : [];
    if (!ids.length) return null;
    w.id = w.id ? (ids.includes(s(w.id)) ? w.id : "-") : { in: ids.slice(0, MATCH_MAX) };
  }
  return w;
}

const ORDER: Record<SortKey, { field: string; dir: "asc" | "desc" }[]> = {
  new: [{ field: "updatedAt", dir: "desc" }, { field: "id", dir: "asc" }],
  old: [{ field: "createdAt", dir: "asc" }, { field: "id", dir: "asc" }],
  easy: [{ field: "difficultyLevel", dir: "asc" }, { field: "updatedAt", dir: "desc" }, { field: "id", dir: "asc" }],
  hard: [{ field: "difficultyLevel", dir: "desc" }, { field: "updatedAt", dir: "desc" }, { field: "id", dir: "asc" }],
};
const COLUMNS = ["id", "stem", "skillId", "typeId", "difficultyLevel", "status", "origin", "updatedAt", "passageId", "imageId", "createdById"] as const;

/** One page of the list (50 rows) and the number of matching questions. */
export async function listBankPage(repo: Repo, actor: Actor, f: BankListFilter): Promise<{ rows: BankListRow[]; total: number; page: number; pages: number; per: number }> {
  assertCan(actor, "questions:read");
  const per = Math.min(100, Math.max(10, Math.floor(f.per ?? PER_PAGE)));
  const where = await whereOf(repo, actor, f);
  if (!where) return { rows: [], total: 0, page: 1, pages: 1, per };
  const total = await repo.count("Question", where);
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pages, Math.max(1, Math.floor(f.page ?? 1)));
  const found = total ? await repo.findMany("Question", where, { select: COLUMNS, orderBy: ORDER[f.sort ?? "new"] ?? ORDER.new, take: per, skip: (page - 1) * per }) : [];
  const [idx, types] = await Promise.all([schoolSkillIndex(repo, schoolOf(actor)), typeMap(repo)]);
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(s(v))).toISOString();
  const rows = found.map((q): BankListRow => {
    const sk = idx.skillOf.get(s(q.skillId));
    const level = Number(q.difficultyLevel ?? 0);
    return {
      id: s(q.id), stem: s(q.stem).replace(/\s+/g, " ").slice(0, 200), skill: sk?.name ?? "", skillId: s(q.skillId), grade: sk?.grade ?? 0,
      type: types.get(s(q.typeId)) ?? "", level, levelLabel: LEVEL_LABELS[level] ?? "", status: s(q.status) as QuestionStatus, origin: s(q.origin),
      updatedAt: iso(q.updatedAt), hasPassage: Boolean(q.passageId), hasImage: Boolean(q.imageId), mine: q.createdById === actor.userId,
    };
  });
  return { rows, total, page, pages, per };
}

const countCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<Record<string, number>> }>>();
function cached(repo: Repo, key: string, fn: () => Promise<Record<string, number>>): Promise<Record<string, number>> {
  let m = countCache.get(repo); if (!m) countCache.set(repo, (m = new Map()));
  const v = modelVersion("Question", "Skill", "QuestionFlag"), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 30_000) return hit.p;
  const p = fn().catch((e) => { m!.delete(key); throw e; });
  remember(m, key, { v, at: Date.now(), p }, 64);
  return p;
}

/** How many questions of each status match the other filters (for the status tabs). */
export async function bankStatusCounts(repo: Repo, actor: Actor, f: BankListFilter): Promise<Record<QuestionStatus | "ALL", number>> {
  assertCan(actor, "questions:read");
  const key = JSON.stringify([schoolOf(actor), f.q ?? "", f.family ?? "", f.skillId ?? "", f.type ?? "", f.level ?? 0, f.mapCode ?? "", f.ai ?? false, f.mapArea ?? "", f.grade ?? 0]);
  return cached(repo, `status:${key}`, async () => {
    const where = await whereOf(repo, actor, f, false);
    const n = where ? await Promise.all(STATUSES.map((st) => repo.count("Question", { ...where, status: st }))) : STATUSES.map(() => 0);
    return { ...Object.fromEntries(STATUSES.map((st, i) => [st, n[i]])), ALL: n.reduce((a, b) => a + b, 0) };
  }) as Promise<Record<QuestionStatus | "ALL", number>>;
}

/**
 * The two banners at the top: questions not under a real skill (on a hidden “Unclassified” skill) and drafts.
 */
export async function bankBanners(repo: Repo, actor: Actor): Promise<{ unclassified: number; drafts: number }> {
  assertCan(actor, "questions:read");
  const schoolId = schoolOf(actor);
  return cached(repo, `banners:${schoolId}`, async () => {
    const idx = await schoolSkillIndex(repo, schoolId);
    const hidden = [...idx.skillOf.values()].filter((k) => k.code.endsWith(UNCLASSIFIED)).map((k) => k.id);
    const [unclassified, drafts] = await Promise.all([
      hidden.length ? repo.count("Question", { skillId: { in: hidden }, deletedAt: null, status: { in: ["DRAFT", "UNDER_REVIEW", "PUBLISHED"] } }) : Promise.resolve(0),
      repo.count("Question", { skillId: { in: [...idx.ids] }, deletedAt: null, status: "DRAFT" }),
    ]);
    return { unclassified, drafts };
  }) as Promise<{ unclassified: number; drafts: number }>;
}

export interface FamilyOption { key: string; name: string; grades: number[] }

/** The skill families of the school (one entry per skill, whatever the grade), for the filter. */
export async function familyOptions(repo: Repo, actor: Actor): Promise<FamilyOption[]> {
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  const out: FamilyOption[] = [];
  for (const [key, ids] of idx.members) {
    const list = ids.map((id) => idx.skillOf.get(id)!).filter(Boolean);
    if (!list.length || list.every((k) => k.code.endsWith(UNCLASSIFIED))) continue;
    out.push({ key, name: list[0].name, grades: [...new Set(list.map((k) => k.grade))].sort((a, b) => a - b) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.grades[0] - b.grades[0]);
}

/** Skill families whose name contains the search words (shown as quick links above the list). */
export async function familiesMatching(repo: Repo, actor: Actor, q: string, max = 8): Promise<FamilyOption[]> {
  const words = q.trim().toLowerCase();
  if (words.length < 3) return [];
  return (await familyOptions(repo, actor)).filter((f) => f.name.toLowerCase().includes(words)).slice(0, max);
}

/** The skills of the school (for “Move to skill”), grade then name. */
export async function moveTargets(repo: Repo, actor: Actor): Promise<{ id: string; name: string; grade: number }[]> {
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  return [...idx.skillOf.values()].filter((k) => k.isActive && !k.code.endsWith(UNCLASSIFIED)).map((k) => ({ id: k.id, name: k.name, grade: k.grade })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

/** Ids of every question matching the filter (id only, 500 at a time; at most MATCH_MAX), e.g. “Publish all matching”. */
export async function matchingIds(repo: Repo, actor: Actor, f: BankListFilter, opts: { statuses?: QuestionStatus[]; max?: number } = {}): Promise<{ ids: string[]; capped: boolean }> {
  assertCan(actor, "questions:read");
  const where = await whereOf(repo, actor, f);
  if (!where) return { ids: [], capped: false };
  const max = opts.max ?? MATCH_MAX;
  if (opts.statuses) {
    const want = f.status && f.status !== "ALL" ? (opts.statuses.includes(f.status) ? [f.status] : []) : opts.statuses;
    if (!want.length) return { ids: [], capped: false };
    where.status = { in: want };
  }
  const ids: string[] = [];
  if (where.id) {
    // already limited to a list of ids (one map place, or one question)
    for (const r of await repo.findMany("Question", where, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: max + 1 })) ids.push(s(r.id));
  } else {
    let after = "";
    while (ids.length <= max) {
      const page = await repo.findMany("Question", after ? { ...where, id: { gt: after } } : where, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: 500 });
      for (const r of page) ids.push(s(r.id));
      if (page.length < 500) break;
      after = s(page[page.length - 1].id);
    }
  }
  return { ids: ids.slice(0, max), capped: ids.length > max };
}

// ------------------------------------------------------------------ bulk actions

/** The questions (≤ BULK_BATCH) of this school, with the columns asked for. */
async function ownQuestions(repo: Repo, actor: Actor, ids: string[], cols: string[]): Promise<Row[]> {
  const unique = [...new Set(ids.map(s).filter(Boolean))];
  if (!unique.length) throw new ValidationError("Choose at least one question.");
  if (unique.length > BULK_BATCH) throw new ValidationError(`Choose at most ${BULK_BATCH} questions at a time.`);
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  const rows = await repo.findMany("Question", { id: { in: unique } }, { select: ["id", "skillId", "status", "deletedAt", ...cols] });
  if (rows.some((q) => !idx.ids.has(s(q.skillId)))) throw new ForbiddenError("Some of these questions belong to another school.");
  return rows.filter((q) => !q.deletedAt);
}

/** Published → draft: out of practice at once (students' answers are kept). */
export async function unpublishQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<{ unpublished: number; skipped: number }> {
  assertCan(actor, "questions:publish");
  const rows = await ownQuestions(repo, actor, ids, []);
  const todo = rows.filter((q) => q.status === "PUBLISHED");
  if (todo.length) await repo.transaction(async (tx) => {
    await tx.updateMany("Question", { id: { in: todo.map((q) => q.id) } }, { status: "DRAFT", updatedAt: now });
    await tx.createMany("AuditLog", todo.map((q) => ({ actorId: actor.userId, action: "question.unpublish", entityType: "Question", entityId: s(q.id), before: { status: "PUBLISHED" }, after: { status: "DRAFT" }, createdAt: now })));
  });
  return { unpublished: todo.length, skipped: rows.length - todo.length };
}

/** Moves questions to another skill of the school (e.g. out of “Unclassified”). Students' past answers stay as they were. */
export async function moveQuestionsToSkill(repo: Repo, actor: Actor, ids: string[], skillId: string, now = new Date()): Promise<{ moved: number }> {
  assertCan(actor, "questions:publish");
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  const target = idx.skillOf.get(s(skillId));
  if (!target) throw new ValidationError("Choose a skill of this school.");
  const rows = (await ownQuestions(repo, actor, ids, ["externalRef"])).filter((q) => s(q.skillId) !== target.id);
  if (!rows.length) return { moved: 0 };
  // the reference must stay unique within the skill: a clash gets a suffix
  const refs = rows.map((q) => q.externalRef).filter(Boolean).map(s);
  const taken = new Set(refs.length ? (await repo.findMany("Question", { skillId: target.id, externalRef: { in: refs } }, { select: ["externalRef"] })).map((q) => s(q.externalRef)) : []);
  await repo.transaction(async (tx) => {
    const plain = rows.filter((q) => !q.externalRef || !taken.has(s(q.externalRef)));
    if (plain.length) await tx.updateMany("Question", { id: { in: plain.map((q) => q.id) } }, { skillId: target.id, updatedAt: now });
    for (const q of rows.filter((x) => x.externalRef && taken.has(s(x.externalRef)))) await tx.updateMany("Question", { id: q.id }, { skillId: target.id, externalRef: `${s(q.externalRef).slice(0, 150)}.m${s(q.id).slice(-6)}`, updatedAt: now });
    await tx.createMany("AuditLog", rows.map((q) => ({ actorId: actor.userId, action: "question.move_skill", entityType: "Question", entityId: s(q.id), before: { skillId: q.skillId }, after: { skillId: target.id }, createdAt: now })));
  });
  return { moved: rows.length };
}

/** 🚩 Flags questions for review: they appear on “Flagged Questions” with the note (one flag per person and question). */
export async function flagQuestionsForReview(repo: Repo, actor: Actor, ids: string[], note: string, now = new Date()): Promise<{ flagged: number }> {
  assertCan(actor, "questions:read");
  const text = s(note).replace(/\s+/g, " ").trim().slice(0, 450);
  const rows = await ownQuestions(repo, actor, ids, []);
  const have = new Set((await repo.findMany("QuestionFlag", { questionId: { in: rows.map((q) => q.id) }, studentId: actor.userId }, { select: ["questionId"] })).map((f) => s(f.questionId)));
  const body = `Flagged by staff${text ? `: ${text}` : ""}`;
  await repo.transaction(async (tx) => {
    const fresh = rows.filter((q) => !have.has(s(q.id)));
    if (fresh.length) await tx.createMany("QuestionFlag", fresh.map((q) => ({ schoolId: schoolOf(actor), questionId: s(q.id), studentId: actor.userId, reason: "OTHER", note: body, status: "OPEN", createdAt: now })));
    const again = rows.filter((q) => have.has(s(q.id)));
    if (again.length) await tx.updateMany("QuestionFlag", { questionId: { in: again.map((q) => q.id) }, studentId: actor.userId }, { status: "OPEN", note: body, createdAt: now, resolvedAt: null, resolvedById: null });
  });
  return { flagged: rows.length };
}
