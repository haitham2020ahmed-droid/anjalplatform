/**
 * 👯 Removing EXACT duplicate questions (approved by the owner: exact duplicates only — never anything else).
 *
 *   find   scans the school's questions in batches (BATCH ids, needed columns only), refreshes each fingerprint
 *          (dedupe-hash.ts) and groups them: the same fingerprint AND the same skill family (familyKeyOf: the same
 *          skill in any grade). Concept Vocabulary of different grades' text sets is grade-bound (its own family), so
 *          it is never a duplicate. The same fingerprint in DIFFERENT families, and the same wording with other choices
 *          or another key ("similar"), are only listed for review.
 *   keep   one per group: PUBLISHED first, then the most student answers, then the oldest.
 *   apply  per batch of groups (the page loops with a progress bar; the CLI loops too): everything is checked again
 *          on the server (school, fingerprint, family, keeper), every reference to a duplicate is moved to the kept
 *          copy (tables with a questionId, JSON id lists such as Assignment.questionIds), unique keys are respected
 *          (a row the kept copy already has is merged or dropped, never duplicated), then the duplicates and their
 *          own parts (choices, answers, explanations) are deleted, with one AuditLog entry per batch.
 *
 * An open revision (a draft made with “Revise” of a published question) is identical to its original on purpose:
 * it is never treated as a duplicate.
 */
import type { Repo, Row } from "../seeding/repo";
import { purgeQuestionRows } from "../admin/question-delete";
import { schoolSkillIndex } from "./skill-questions";
import { BATCH, HASH_COLUMNS, hashQuestions, saveHashes, typeCodes, type HashedQuestion } from "./dedupe-hash";

const s = (v: unknown) => String(v ?? "");
const chunks = <T,>(xs: T[], n = BATCH) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** ids per apply call (all groups together) */
export const APPLY_MAX_IDS = 500;

// ------------------------------------------------------------------ the references to a question

/** Columns that point at a question (no unique key involved): moved to the kept copy with one update per group. */
export const SIMPLE_REFS: readonly (readonly [string, string])[] = [
  ["QuestionAttempt", "questionId"], ["AdaptiveDecisionLog", "questionId"], ["AdaptiveDecisionLog", "nextQuestionId"],
  ["PracticeSession", "currentQuestionId"], ["PracticeSession", "hintQuestionId"], ["MapSimSession", "servedQuestionId"],
  ["ImportedQuestionLog", "questionId"], ["ImportedQuestionLog", "duplicateOfId"], ["AiSuggestion", "questionId"],
  ["QuestionStandardFix", "questionId"], ["QuestionLevelChange", "questionId"], ["MapSimAnswer", "questionId"],
  ["SecondChanceAnswer", "questionId"], ["QotdAnswer", "questionId"],
];
/**
 * Tables where the question is part of a unique key (with `key`): a row the kept copy already has is merged (`merge`)
 * or dropped; otherwise the row is moved. `id` = the row's own id column when it has one.
 */
export const KEYED_REFS: readonly { table: string; key: readonly string[]; id?: string; merge?: readonly string[] }[] = [
  { table: "AssessmentQuestion", key: ["assessmentId"] },
  { table: "QuestionMapLink", key: ["nodeId"] },
  { table: "QuestionUse", key: ["use"] },
  { table: "ReadMasterQuestion", key: ["versionId"] },
  { table: "QuestionFlag", key: ["studentId"], id: "id" },
  { table: "ExitTicketAnswer", key: ["ticketId", "studentId"] },
  { table: "QuestionGradeStat", key: ["grade"], id: "id", merge: ["responses", "correct"] },
  { table: "QuestionAlert", key: ["grade", "kind"], id: "id" },
  { table: "QuestionStats", key: [], merge: ["attempts", "correct"] },
  { table: "NafsQuestionArea", key: [] },
];
/** JSON columns holding question ids (lists, or objects keyed by question id, or logs with questionId fields). */
export const JSON_REFS: readonly (readonly [string, string])[] = [
  ["Assignment", "questionIds"], ["LiveGame", "questionIds"], ["ExitTicket", "questionIds"], ["Worksheet", "questionIds"],
  ["ProgressCheck", "categories"], ["LessonRun", "log"],
];

/** Every id of `map` replaced by its kept copy, anywhere in a JSON value; repeated ids in a list are kept once. */
export function rewriteIds(v: unknown, map: ReadonlyMap<string, string>): { value: unknown; changed: boolean } {
  let changed = false;
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") { const to = map.get(x); if (to) { changed = true; return to; } return x; }
    if (Array.isArray(x)) {
      const out = x.map(walk);
      // a list of ids: the kept copy once (the first place it appears)
      if (out.every((e) => typeof e === "string") && x.some((e) => typeof e === "string" && map.has(e))) {
        const seen = new Set<unknown>();
        return out.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
      }
      return out;
    }
    if (x && typeof x === "object" && !(x instanceof Date)) {
      const out: Record<string, unknown> = {};
      const entries = Object.entries(x as Record<string, unknown>);
      for (const [k, val] of entries) {
        const nk = map.get(k);
        if (nk) { changed = true; if (!(nk in (x as object)) && !(nk in out)) out[nk] = walk(val); continue; }
        out[k] = walk(val);
      }
      return out;
    }
    return x;
  };
  const value = walk(v);
  return { value, changed };
}

export interface RepointCounts { [table: string]: number }

/** Moves every reference of the duplicates (map: duplicate id → kept id) to the kept copies. Inside the caller's transaction. */
export async function repointReferences(tx: Repo, map: ReadonlyMap<string, string>): Promise<{ moved: RepointCounts; merged: RepointCounts }> {
  const moved: RepointCounts = {}, merged: RepointCounts = {};
  const dups = [...map.keys()];
  if (!dups.length) return { moved, merged };
  const byKeep = new Map<string, string[]>();
  for (const [d, k] of map) { const l = byKeep.get(k); if (l) l.push(d); else byKeep.set(k, [d]); }
  const add = (o: RepointCounts, k: string, n: number) => { if (n) o[k] = (o[k] ?? 0) + n; };

  for (const [table, col] of SIMPLE_REFS) {
    if (!(await tx.count(table, { [col]: { in: dups } }))) continue;
    for (const [keep, list] of byKeep) add(moved, `${table}.${col}`, await tx.updateMany(table, { [col]: { in: list } }, { [col]: keep }));
  }

  for (const ref of KEYED_REFS) {
    const cols = ["questionId", ...ref.key, ...(ref.id ? [ref.id] : []), ...(ref.merge ?? [])];
    const rows = await tx.findMany(ref.table, { questionId: { in: dups } }, { select: cols });
    if (!rows.length) continue;
    const keeps = [...new Set(rows.map((r) => map.get(s(r.questionId))!))];
    const have = new Map<string, Row>();
    for (const r of await tx.findMany(ref.table, { questionId: { in: keeps } }, { select: cols })) have.set([s(r.questionId), ...ref.key.map((k) => s(r[k]))].join("|"), r);
    for (const r of rows) {
      const keep = map.get(s(r.questionId))!;
      const k = [keep, ...ref.key.map((c) => s(r[c]))].join("|");
      const where: Record<string, unknown> = ref.id ? { [ref.id]: r[ref.id] } : { questionId: r.questionId, ...Object.fromEntries(ref.key.map((c) => [c, r[c]])) };
      const into = have.get(k);
      if (into) {
        // the kept copy already has this row: counters are added up, then the duplicate's row goes
        if (ref.merge?.length) {
          const sum: Row = Object.fromEntries(ref.merge.map((c) => [c, Number(into[c] ?? 0) + Number(r[c] ?? 0)]));
          for (const c of ref.merge) into[c] = sum[c];
          const intoWhere: Record<string, unknown> = ref.id ? { [ref.id]: into[ref.id] } : { questionId: keep, ...Object.fromEntries(ref.key.map((c) => [c, into[c]])) };
          const extra: Row = ref.table === "QuestionStats" ? { pValue: Number(sum.attempts) ? Number(sum.correct) / Number(sum.attempts) : null } : ref.table === "QuestionGradeStat" ? { pct: Number(sum.responses) ? Number(sum.correct) / Number(sum.responses) : 0 } : {};
          await tx.updateMany(ref.table, intoWhere, { ...sum, ...extra });
        }
        await tx.deleteMany(ref.table, where);
        add(merged, ref.table, 1);
      } else {
        await tx.updateMany(ref.table, where, { questionId: keep });
        have.set(k, { ...r, questionId: keep });
        add(moved, ref.table, 1);
      }
    }
  }

  for (const [table, col] of JSON_REFS) {
    let after = "";
    for (;;) {
      const page = await tx.findMany(table, after ? { id: { gt: after } } : {}, { select: ["id", col], orderBy: [{ field: "id", dir: "asc" }], take: BATCH });
      if (!page.length) break;
      after = s(page[page.length - 1].id);
      for (const r of page) {
        const raw = r[col];
        if (raw === null || raw === undefined) continue;
        const v = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
        const { value, changed } = rewriteIds(v, map);
        if (changed) { await tx.updateMany(table, { id: r.id }, { [col]: value as object }); add(moved, `${table}.${col}`, 1); }
      }
      if (page.length < BATCH) break;
    }
  }
  return { moved, merged };
}

// ------------------------------------------------------------------ find

export interface DupMember { id: string; skillId: string; skill: string; grade: number; status: string; attempts: number; createdAt: string }
export interface DuplicateGroup { keep: DupMember; remove: DupMember[]; stem: string; type: string }
export interface ReviewGroup { stem: string; type: string; reason: "OTHER_FAMILY" | "SIMILAR"; questions: { id: string; skill: string; grade: number; status: string }[] }
export interface DuplicatePlan {
  scanned: number;
  /** fingerprints filled or refreshed during the scan */
  refreshed: number;
  groups: DuplicateGroup[];
  toRemove: number;
  /** student answers (QuestionAttempt rows) on the copies that go: they move to the kept copy */
  answersToMove: number;
  bySkill: { skill: string; grade: number; n: number }[];
  review: ReviewGroup[];
}

const isOpenRevision = (q: HashedQuestion) => (q.status === "DRAFT" || q.status === "UNDER_REVIEW") && Boolean((q.tags as { revisionOf?: string } | null)?.revisionOf);
const RANK: Record<string, number> = { PUBLISHED: 0, UNDER_REVIEW: 1, DRAFT: 2, ARCHIVED: 3 };

/** The copy to keep: PUBLISHED first, then the most student answers, then the oldest (then the smallest id). */
export function chooseKeeper<T extends { id: string; status: string; attempts: number; createdAt: string }>(list: T[]): T {
  return [...list].sort((a, b) => (a.status === "PUBLISHED" ? 0 : 1) - (b.status === "PUBLISHED" ? 0 : 1) || b.attempts - a.attempts || a.createdAt.localeCompare(b.createdAt) || (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

async function attemptCounts(repo: Repo, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const part of chunks(ids, 25)) {
    const n = await Promise.all(part.map((id) => repo.count("QuestionAttempt", { questionId: id })));
    part.forEach((id, i) => out.set(id, n[i]));
  }
  return out;
}

/** The school's question ids are read by skill (the school's own skills), page by page in id order. */
async function* schoolQuestionPages(repo: Repo, skillIds: string[]): AsyncGenerator<Row[]> {
  for (const skills of chunks(skillIds, 400)) {
    let after = "";
    for (;;) {
      const page = await repo.findMany("Question", { skillId: { in: skills }, ...(after ? { id: { gt: after } } : {}) }, { select: HASH_COLUMNS, orderBy: [{ field: "id", dir: "asc" }], take: BATCH });
      if (!page.length) break;
      after = s(page[page.length - 1].id);
      yield page.filter((q) => !q.deletedAt);
      if (page.length < BATCH) break;
    }
  }
}

interface Slim { id: string; skillId: string; status: string; createdAt: string; family: string; stem: string; type: string; stemKey: string }

/** Finds the exact duplicates of one school (see the file header). Memory: a few small fields per question. */
export async function findDuplicates(repo: Repo, schoolId: string, opts: { reviewMax?: number } = {}): Promise<DuplicatePlan> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const types = await typeCodes(repo);
  const byHash = new Map<string, Slim[]>();
  const stemHashes = new Map<string, Set<string>>();
  let scanned = 0, refreshed = 0;
  for await (const page of schoolQuestionPages(repo, [...idx.ids])) {
    const hashed = await hashQuestions(repo, page.map((q) => s(q.id)), types, page);
    refreshed += await saveHashes(repo, hashed);
    scanned += hashed.length;
    for (const q of hashed) {
      if (isOpenRevision(q)) continue;
      const slim: Slim = { id: q.id, skillId: q.skillId, status: q.status, createdAt: q.createdAt, family: idx.keyOf.get(q.skillId) ?? `solo:${q.skillId}`, stem: q.stem.slice(0, 160), type: q.type, stemKey: q.stemKey };
      const l = byHash.get(q.hash); if (l) l.push(slim); else byHash.set(q.hash, [slim]);
      const h = stemHashes.get(q.stemKey); if (h) h.add(q.hash); else stemHashes.set(q.stemKey, new Set([q.hash]));
    }
  }
  const skillName = (id: string) => idx.skillOf.get(id)?.name ?? "";
  const gradeOf = (id: string) => idx.skillOf.get(id)?.grade ?? 0;
  const raw: Slim[][] = [];
  const review: ReviewGroup[] = [];
  const reviewMax = opts.reviewMax ?? 200;
  const view = (q: Slim) => ({ id: q.id, skill: skillName(q.skillId), grade: gradeOf(q.skillId), status: q.status });
  for (const list of byHash.values()) {
    if (list.length < 2) continue;
    const fam = new Map<string, Slim[]>();
    for (const q of list) { const l = fam.get(q.family); if (l) l.push(q); else fam.set(q.family, [q]); }
    for (const g of fam.values()) if (g.length > 1) raw.push(g);
    // the same question under different skill families: for a person to decide (grade-bound vocabulary excepted)
    if (fam.size > 1 && ![...fam.keys()].every((k) => k.startsWith("solo:")) && review.length < reviewMax) review.push({ stem: list[0].stem, type: list[0].type, reason: "OTHER_FAMILY", questions: list.map(view) });
  }
  // similar but not identical: the same wording (same type and passage) with other choices or another key
  for (const [key, hashes] of stemHashes) {
    if (hashes.size < 2 || review.length >= reviewMax) continue;
    const qs = [...hashes].flatMap((h) => (byHash.get(h) ?? []).filter((q) => q.stemKey === key));
    review.push({ stem: qs[0].stem, type: qs[0].type, reason: "SIMILAR", questions: qs.slice(0, 12).map(view) });
  }
  byHash.clear(); stemHashes.clear();
  const counts = await attemptCounts(repo, raw.flat().map((q) => q.id));
  const member = (q: Slim): DupMember => ({ id: q.id, skillId: q.skillId, skill: skillName(q.skillId), grade: gradeOf(q.skillId), status: q.status, attempts: counts.get(q.id) ?? 0, createdAt: q.createdAt });
  const groups: DuplicateGroup[] = raw.map((g) => {
    const ms = g.map(member);
    const keep = chooseKeeper(ms);
    return { keep, remove: ms.filter((m) => m.id !== keep.id), stem: g[0].stem, type: g[0].type };
  }).sort((a, b) => a.keep.grade - b.keep.grade || a.keep.skill.localeCompare(b.keep.skill) || a.stem.localeCompare(b.stem));
  const by = new Map<string, { skill: string; grade: number; n: number }>();
  for (const g of groups) { const k = `${g.keep.grade}|${g.keep.skill}`; const e = by.get(k) ?? { skill: g.keep.skill, grade: g.keep.grade, n: 0 }; e.n += g.remove.length; by.set(k, e); }
  return {
    scanned, refreshed, groups, toRemove: groups.reduce((n, g) => n + g.remove.length, 0),
    answersToMove: groups.reduce((n, g) => n + g.remove.reduce((m, r) => m + r.attempts, 0), 0),
    bySkill: [...by.values()].sort((a, b) => b.n - a.n || a.grade - b.grade), review,
  };
}

// ------------------------------------------------------------------ apply

export interface RemovedRow { removedId: string; keptId: string; skill: string; grade: number; stem: string; status: string; answersMoved: number }
export interface ApplyResult { removed: number; movedAnswers: number; bySkill: Record<string, number>; rows: RemovedRow[]; moved: RepointCounts; merged: RepointCounts; skippedGroups: number }

/**
 * Removes the duplicates of these groups (each group = candidate ids; the page and the CLI send what `findDuplicates`
 * returned). Nothing from the caller is trusted: the questions must belong to the school, and the fingerprint, the
 * family and the copy to keep are worked out again here. One transaction and one AuditLog entry per call.
 */
export async function applyDuplicateGroups(repo: Repo, ctx: { schoolId: string; actorId: string | null }, groups: string[][], now = new Date()): Promise<ApplyResult> {
  const ids = [...new Set(groups.flat().map(s).filter(Boolean))];
  const empty: ApplyResult = { removed: 0, movedAnswers: 0, bySkill: {}, rows: [], moved: {}, merged: {}, skippedGroups: 0 };
  if (!ids.length) return empty;
  if (ids.length > APPLY_MAX_IDS) throw new Error(`At most ${APPLY_MAX_IDS} questions per batch.`);
  const idx = await schoolSkillIndex(repo, ctx.schoolId);
  const rows = (await repo.findMany("Question", { id: { in: ids } }, { select: HASH_COLUMNS })).filter((q) => !q.deletedAt && idx.ids.has(s(q.skillId)));
  const hashed = new Map((await hashQuestions(repo, rows.map((q) => s(q.id)), undefined, rows)).map((q) => [q.id, q]));
  const counts = await attemptCounts(repo, [...hashed.keys()]);
  const map = new Map<string, string>();
  const info: RemovedRow[] = [];
  let skippedGroups = 0;
  for (const g of groups) {
    const qs = [...new Set(g.map(s))].map((id) => hashed.get(id)).filter((q): q is HashedQuestion => Boolean(q) && !isOpenRevision(q!)).filter((q) => !map.has(q.id));
    // regrouped here: same fingerprint and same family
    const sub = new Map<string, HashedQuestion[]>();
    for (const q of qs) { const k = `${q.hash}|${idx.keyOf.get(q.skillId) ?? `solo:${q.skillId}`}`; const l = sub.get(k); if (l) l.push(q); else sub.set(k, [q]); }
    let any = false;
    for (const list of sub.values()) {
      if (list.length < 2) continue;
      any = true;
      const keep = chooseKeeper(list.map((q) => ({ id: q.id, status: q.status, attempts: counts.get(q.id) ?? 0, createdAt: q.createdAt })));
      for (const q of list) if (q.id !== keep.id && !map.has(keep.id)) {
        map.set(q.id, keep.id);
        const sk = idx.skillOf.get(q.skillId);
        info.push({ removedId: q.id, keptId: keep.id, skill: sk?.name ?? "", grade: sk?.grade ?? 0, stem: q.stem.slice(0, 200), status: q.status, answersMoved: counts.get(q.id) ?? 0 });
      }
    }
    if (!any) skippedGroups++;
  }
  if (!map.size) return { ...empty, skippedGroups };
  const dupRows = rows.filter((q) => map.has(s(q.id)));
  const r = await repo.transaction(async (tx) => {
    const moved = await repointReferences(tx, map);
    await purgeQuestionRows(tx, dupRows);
    await tx.create("AuditLog", {
      actorId: ctx.actorId, action: "question.dedupe", entityType: "Question", entityId: `DEDUPE-${now.toISOString().slice(0, 10)}`,
      before: { removed: info.map((x) => ({ id: x.removedId, keptId: x.keptId, status: x.status, stem: x.stem.slice(0, 80) })) },
      after: { removed: info.length, moved: moved.moved, merged: moved.merged }, createdAt: now,
    });
    return moved;
  });
  const bySkill: Record<string, number> = {};
  for (const x of info) { const k = `G${x.grade} · ${x.skill}`; bySkill[k] = (bySkill[k] ?? 0) + 1; }
  return { removed: info.length, movedAnswers: r.moved["QuestionAttempt.questionId"] ?? 0, bySkill, rows: info, moved: r.moved, merged: r.merged, skippedGroups };
}

/** Group lists of a plan in batches for `applyDuplicateGroups` (≤ APPLY_MAX_IDS ids each). */
export function planBatches(groups: DuplicateGroup[], maxIds = APPLY_MAX_IDS): string[][][] {
  const out: string[][][] = [];
  let cur: string[][] = [], n = 0;
  for (const g of groups) {
    const ids = [g.keep.id, ...g.remove.map((r) => r.id)];
    if (n + ids.length > maxIds && cur.length) { out.push(cur); cur = []; n = 0; }
    cur.push(ids); n += ids.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Report rows as CSV (Excel-friendly). */
export function removedCsv(rows: RemovedRow[]): string {
  const cell = (v: unknown) => `"${s(v).replace(/"/g, '""')}"`;
  return "﻿" + [["Removed question", "Kept question", "Grade", "Skill", "Status of removed", "Student answers moved", "Question"], ...rows.map((r) => [r.removedId, r.keptId, r.grade, r.skill, r.status, r.answersMoved, r.stem])].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Every school that has questions (for the command-line tool). */
export async function schoolIds(repo: Repo): Promise<string[]> {
  return (await repo.findMany("School", {}, { select: ["id"] })).map((x) => s(x.id));
}

// ------------------------------------------------------------------ command line (scripts/db/dedupe-questions.ts)

/** Dry run by default; `--apply` removes; `--school <id>` one school; `--list` prints every group. */
export async function runDedupe(repo: Repo, argv: string[], out: (line: string) => void = console.log): Promise<{ removed: number; movedAnswers: number; rows: RemovedRow[] }> {
  const apply = argv.includes("--apply"), list = argv.includes("--list");
  const at = argv.indexOf("--school");
  const schools = at >= 0 && argv[at + 1] ? [argv[at + 1]] : await schoolIds(repo);
  let removed = 0, movedAnswers = 0;
  const rows: RemovedRow[] = [];
  for (const schoolId of schools) {
    const t0 = Date.now();
    const plan = await findDuplicates(repo, schoolId);
    out(`School ${schoolId}: ${plan.scanned} questions checked (${plan.refreshed} fingerprints updated) in ${Date.now() - t0} ms → ${plan.groups.length} duplicate group(s), ${plan.toRemove} question(s) to remove, ${plan.answersToMove} student answer(s) to move; ${plan.review.length} group(s) to review (not removed).`);
    for (const b of plan.bySkill.slice(0, 50)) out(`  G${b.grade} · ${b.skill}: ${b.n}`);
    if (list) for (const g of plan.groups) out(`  keep ${g.keep.id} (${g.keep.status}, ${g.keep.attempts} answers) ← remove ${g.remove.map((r) => `${r.id} (${r.status}, ${r.attempts})`).join(", ")} · ${g.stem.slice(0, 80)}`);
    if (!apply || !plan.groups.length) continue;
    const batches = planBatches(plan.groups);
    for (const [i, b] of batches.entries()) {
      const r = await applyDuplicateGroups(repo, { schoolId, actorId: null }, b);
      removed += r.removed; movedAnswers += r.movedAnswers; rows.push(...r.rows);
      out(`  batch ${i + 1}/${batches.length}: removed ${r.removed}, moved ${r.movedAnswers} answer(s)`);
    }
  }
  out(apply ? `Removed ${removed} duplicate question(s), moved ${movedAnswers} student answer(s).` : "Dry run: nothing was written. Take a database backup, then run again with --apply.");
  return { removed, movedAnswers, rows };
}
