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
import { mapLinkedQuestionIds, ritBand, ritOf } from "../questions/bank-scope";
import { LEVEL_LABELS } from "../../config/engine";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { normalizeSkillName, schoolSkillIndex } from "../questions/skill-questions";
import { STATUSES, type QuestionStatus } from "./questions";
import { schoolOf } from "./users";
import { sweptWeakMap } from "../cache/idle";

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
  /**
   * 🏦 the Question Bank (default: skill + level, no grade) or the Curriculum Map's own questions (grade → unit → lesson);
   * ✏️ COPIES: teachers' private edited copies (src/server/questions/private-copies.ts) — every copy for the admin, a
   * teacher's own copies for a teacher. They are in no other list.
   */
  source?: "BANK" | "MAP" | "ALL" | "COPIES";
}

export interface BankListRow {
  id: string; stem: string; skill: string; skillId: string; grade: number; type: string; level: number; levelLabel: string;
  /** a Curriculum Map question (shown with its grade); bank questions show their RIT band instead */
  onMap: boolean; ritBand: string;
  status: QuestionStatus; origin: string; updatedAt: string; hasPassage: boolean; hasImage: boolean; mine: boolean;
  /** open flags (students' "not clear" reports, teachers' problem reports, staff flags) */
  flags?: number;
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
    else {
      // 🔎 a skill's name (e.g. "Formal and Informal English") lists that skill's questions; other words search the text
      // names match whatever the case, "&" / "and" or the apostrophe ("Character Traits & Development", "A Speaker’s …");
      // the exact name first (its whole family: one question pool), else every skill whose name contains the words
      const words = normalizeSkillName(q);
      const nameOf = (k: string) => normalizeSkillName(idx.skillOf.get(k)?.name ?? "");
      const exactKeys = words.length >= 3 ? new Set(skills.filter((k) => nameOf(k) === words).map((k) => idx.keyOf.get(k))) : new Set();
      const named = exactKeys.size ? skills.filter((k) => exactKeys.has(idx.keyOf.get(k)))
        : words.length >= 4 ? skills.filter((k) => nameOf(k).includes(words)) : [];
      if (named.length) w.skillId = { in: named };
      else w.stem = { contains: q };
    }
  }
  // 🏦 bank or Curriculum Map (a map place or a question id already narrows it)
  const source = f.source ?? (f.mapCode ? "MAP" : "BANK");
  // ✏️ private copies: only under COPIES (named explicitly, so a search by id never shows another teacher's copy)
  const admin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  w.privateToId = source === "COPIES" ? (admin ? { not: null } : actor.userId) : null;
  if (source !== "ALL" && source !== "COPIES" && !f.mapCode && !w.id) {
    const onMap = [...(await mapLinkedQuestionIds(repo))];
    if (source === "MAP") { if (!onMap.length) return null; w.id = { in: onMap.slice(0, MATCH_MAX) }; }
    else if (onMap.length) w.id = { notIn: onMap };
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
  const [idx, types, onMap, flagRows] = await Promise.all([schoolSkillIndex(repo, schoolOf(actor)), typeMap(repo), mapLinkedQuestionIds(repo),
    found.length ? repo.findMany("QuestionFlag", { questionId: { in: found.map((q) => s(q.id)) }, status: "OPEN" }, { select: ["questionId"] }) : Promise.resolve([] as Row[])]);
  const flagsOf = new Map<string, number>();
  for (const f of flagRows) flagsOf.set(s(f.questionId), (flagsOf.get(s(f.questionId)) ?? 0) + 1);
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(s(v))).toISOString();
  const rows = found.map((q): BankListRow => {
    const sk = idx.skillOf.get(s(q.skillId));
    const level = Number(q.difficultyLevel ?? 0);
    return {
      id: s(q.id), stem: s(q.stem).replace(/\s+/g, " ").slice(0, 200), skill: sk?.name ?? "", skillId: s(q.skillId), grade: sk?.grade ?? 0,
      type: types.get(s(q.typeId)) ?? "", level, levelLabel: LEVEL_LABELS[level] ?? "", status: s(q.status) as QuestionStatus, origin: s(q.origin),
      updatedAt: iso(q.updatedAt), hasPassage: Boolean(q.passageId), hasImage: Boolean(q.imageId), mine: q.createdById === actor.userId,
      onMap: onMap.has(s(q.id)), ritBand: ritBand(ritOf(level || 4, sk?.grade ?? 0)), flags: flagsOf.get(s(q.id)) ?? 0,
    };
  });
  return { rows, total, page, pages, per };
}

const countCache = sweptWeakMap<{ v: string; at: number; p: Promise<Record<string, number>> }>("admin.questions-list.countCache", 2 * 60_000);
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
  const key = JSON.stringify([schoolOf(actor), f.q ?? "", f.family ?? "", f.skillId ?? "", f.type ?? "", f.level ?? 0, f.mapCode ?? "", f.ai ?? false, f.mapArea ?? "", f.grade ?? 0, f.source ?? ""]);
  return cached(repo, `status:${key}`, async () => {
    const where = await whereOf(repo, actor, f, false);
    const n = where ? await Promise.all(STATUSES.map((st) => repo.count("Question", { ...where, status: st }))) : STATUSES.map(() => 0);
    return { ...Object.fromEntries(STATUSES.map((st, i) => [st, n[i]])), ALL: n.reduce((a, b) => a + b, 0) };
  }) as Promise<Record<QuestionStatus | "ALL", number>>;
}

/**
 * The two banners at the top: questions not under a real skill (on a hidden “Unclassified” skill) and drafts.
 */
export async function bankBanners(repo: Repo, actor: Actor): Promise<{ unclassified: number; drafts: number; waiting: number }> {
  assertCan(actor, "questions:read");
  const schoolId = schoolOf(actor);
  return cached(repo, `banners:${schoolId}`, async () => {
    const idx = await schoolSkillIndex(repo, schoolId);
    // the ONE count of questions not under a skill (the Classify page and Data Cleanup show the same number)
    const { unclassifiedCount } = await import("./stuck-questions");
    const [unclassified, drafts, waiting] = await Promise.all([
      unclassifiedCount(repo, schoolId),
      repo.count("Question", { skillId: { in: [...idx.ids] }, deletedAt: null, status: "DRAFT" }),
      repo.count("Question", { skillId: { in: [...idx.ids] }, deletedAt: null, status: "UNDER_REVIEW" }),
    ]);
    return { unclassified, drafts, waiting };
  }) as Promise<{ unclassified: number; drafts: number; waiting: number }>;
}

export interface FamilyOption {
  key: string; name: string; grades: number[];
  /** every name the family's skills have ("Prefixes", "Suffixes" share one pool): each one is findable in the filter */
  names: string[];
}

/** The skill families of the school (one entry per skill, whatever the grade), for the filter. */
export async function familyOptions(repo: Repo, actor: Actor): Promise<FamilyOption[]> {
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  const out: FamilyOption[] = [];
  for (const [key, ids] of idx.members) {
    const list = ids.map((id) => idx.skillOf.get(id)!).filter((k) => k && !k.code.endsWith(UNCLASSIFIED));
    if (!list.length) continue;
    // the family is named by its most common name; its other names are shown with it ("Suffixes / Prefixes")
    const common = new Map<string, number>(), first = new Map<string, string>();
    for (const k of list) { const n = normalizeSkillName(k.name); common.set(n, (common.get(n) ?? 0) + 1); if (!first.has(n)) first.set(n, k.name); }
    const names = [...first.entries()].sort((a, b) => (common.get(b[0]) ?? 0) - (common.get(a[0]) ?? 0) || a[1].localeCompare(b[1])).map(([, v]) => v);
    out.push({ key, name: names.join(" / "), names, grades: [...new Set(list.map((k) => k.grade))].sort((a, b) => a - b) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.grades[0] - b.grades[0]);
}

/** Skill families with a name that contains the search words (shown as quick links above the list), exact name first. */
export async function familiesMatching(repo: Repo, actor: Actor, q: string, max = 8): Promise<FamilyOption[]> {
  const words = normalizeSkillName(q);
  if (words.length < 3) return [];
  const exact = (f: FamilyOption) => Number(f.names.some((n) => normalizeSkillName(n) === words));
  return (await familyOptions(repo, actor)).filter((f) => f.names.some((n) => normalizeSkillName(n).includes(words))).sort((a, b) => exact(b) - exact(a)).slice(0, max);
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

/** 🏳️ Unflag: every open flag of these questions is cleared (marked "not a problem", who and when kept). Admins / reviewers. */
export async function unflagQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<{ cleared: number }> {
  assertCan(actor, "questions:publish");
  const rows = await ownQuestions(repo, actor, ids, []);
  if (!rows.length) return { cleared: 0 };
  const open = await repo.findMany("QuestionFlag", { questionId: { in: rows.map((q) => s(q.id)) }, status: "OPEN" }, { select: ["id", "questionId"] });
  if (!open.length) return { cleared: 0 };
  await repo.transaction(async (tx) => {
    await tx.updateMany("QuestionFlag", { id: { in: open.map((f) => f.id) } }, { status: "DISMISSED", resolvedById: actor.userId, resolvedAt: now });
    const qids = [...new Set(open.map((f) => s(f.questionId)))];
    await tx.createMany("AuditLog", qids.map((id) => ({ actorId: actor.userId, action: "question.unflag", entityType: "Question", entityId: id, after: { cleared: open.filter((f) => s(f.questionId) === id).length }, createdAt: now })));
  });
  return { cleared: new Set(open.map((f) => s(f.questionId))).size };
}

export interface FlagDetail { id: string; by: string; role: string; reason: string; note: string | null; at: string; status: string }

/** 🚩 Who flagged a question and why (newest first): students, teachers and staff. */
export async function flagsOfQuestion(repo: Repo, actor: Actor, questionId: string): Promise<FlagDetail[]> {
  assertCan(actor, "questions:read");
  const rows = await repo.findMany("QuestionFlag", { questionId }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 50 });
  if (!rows.length) return [];
  // a student's flag keeps the Student id; a teacher's / staff flag keeps the User id
  const ids = [...new Set(rows.map((r) => s(r.studentId)))];
  const [students, users0] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("User", { id: { in: ids } }, { select: ["id", "displayName", "role"] }),
  ]);
  const studentUser = new Map(students.map((x) => [s(x.id), s(x.userId)]));
  const users1 = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName", "role"] }) : [];
  const user = new Map([...users0, ...users1].map((u) => [s(u.id), u]));
  const { FLAG_REASONS } = await import("../teacher/classroom");
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(s(v))).toISOString();
  return rows.map((r) => {
    const u = user.get(studentUser.get(s(r.studentId)) ?? s(r.studentId));
    const reason = s(r.reason);
    return { id: s(r.id), by: s(u?.displayName) || "—", role: s(u?.role) || (studentUser.has(s(r.studentId)) ? "STUDENT" : ""), reason: (FLAG_REASONS as Record<string, string>)[reason] ?? reason, note: r.note ? s(r.note) : null, at: iso(r.createdAt), status: s(r.status) };
  });
}
