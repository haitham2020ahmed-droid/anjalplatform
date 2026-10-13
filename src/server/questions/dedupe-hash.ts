/**
 * 👯 Content fingerprint of a question (Question.contentHash, indexed).
 *
 * Two questions are EXACT duplicates when they have the same type, the same stem, the same set of answer choices, the
 * same correct answer and (when they are tied to one) the same passage text — after normalizing: trim, collapse
 * whitespace, ignore case, ignore trailing punctuation, unify curly and straight quotes. Choice order does not matter.
 *
 * The same fingerprint is computed from a bank item (editor, importer: before saving) and from the stored rows
 * (backfill, duplicate finder), so the importer and the editor find duplicates with one indexed lookup instead of
 * reading the bank. Reads here are always batched (BATCH ids) and only the needed columns are selected.
 */
import { createHash } from "node:crypto";
import { answerValues, contentPayload, type BankItem } from "../../imports/questions/validate";
import type { Repo, Row } from "../seeding/repo";
import { eachLimit } from "../db/parallel";

const s = (v: unknown) => String(v ?? "");
export const HASH_VERSION = "v1";
/** ids per read: ~500 questions with their choices stay a few hundred KB */
export const BATCH = 500;

/** trim, collapse whitespace, lower case, unify quotes, drop trailing punctuation */
export function normalizeText(v: unknown): string {
  return s(v)
    .normalize("NFKC")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s.?!,;:…]+$/u, "")
    .trim();
}

/**
 * Gentle form (case and end punctuation KEPT): for answer choices that differ only in capital letters or punctuation
 * (“Which sentence uses capital letters correctly?”), and for the type-specific content and answer keys.
 */
export function softText(v: unknown): string {
  return s(v).normalize("NFKC").replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'").replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"').replace(/\s+/g, " ").trim();
}

/** Deep copy with every string normalized, object keys sorted, and per-choice feedback (not part of the content) dropped. */
function normalizeValue(v: unknown): unknown {
  if (typeof v === "string") return softText(v);
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (k === "rationale" || k === "misconception") continue;
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined || x === null) continue;
      out[k] = normalizeValue(x);
    }
    return out;
  }
  return v ?? null;
}

const parseJ = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

export interface HashParts {
  type: string;
  stem: string;
  /** the passage TEXT (not its id): the same words about the same text, wherever the text is stored */
  passage: string | null;
  /** the picture (identical pictures are stored once, so the same picture has the same id) */
  image?: string | null;
  options: { text: string; correct: boolean }[];
  answers: unknown[];
  content: unknown;
}

export function contentHashOf(p: HashParts): string {
  // choices that only differ in case or punctuation keep them (otherwise two different keys could look the same)
  const strict = p.options.map((o) => normalizeText(o.text));
  const norm = new Set(strict).size === strict.length ? strict : p.options.map((o) => softText(o.text));
  const options = p.options.map((o, i) => `${o.correct ? 1 : 0}|${norm[i]}`).sort();
  // several answer rows only exist for accepted variants (fill in the blank): their order does not matter
  const answers = p.answers.filter((a) => a !== undefined && a !== null).map((a) => JSON.stringify(normalizeValue(parseJ(a)))).sort();
  const content = normalizeValue(parseJ(p.content) ?? {});
  const passage = p.passage ? createHash("sha256").update(normalizeText(p.passage)).digest("hex") : "";
  const key = JSON.stringify([HASH_VERSION, s(p.type), normalizeText(p.stem), passage, p.image ? s(p.image) : "", options, answers, content]);
  return createHash("sha256").update(key).digest("hex");
}

/** The fingerprint of a bank item as it will be stored (options, answerValues, contentPayload). */
export function hashOfItem(item: BankItem, passageText: string | null, imageId: string | null, answers?: unknown[]): string {
  return contentHashOf({
    type: item.type, stem: item.stem, passage: passageText, image: imageId,
    options: (item.options ?? []).map((o) => ({ text: o.text, correct: Boolean(o.correct) })),
    answers: answers ?? answerValues(item), content: contentPayload(item),
  });
}

/** A short key of the stem alone (with the passage and type): questions that share it but not the fingerprint are “similar”. */
export function stemKeyOf(type: string, stem: unknown, passage: string | null): string {
  return createHash("sha1").update(JSON.stringify([s(type), normalizeText(stem), passage ? normalizeText(passage).slice(0, 2000) : ""])).digest("hex").slice(0, 20);
}

const chunks = <T,>(xs: T[], n = BATCH) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Question type id → code (a small table). */
export async function typeCodes(repo: Repo): Promise<Map<string, string>> {
  return new Map((await repo.findMany("QuestionType", {}, { select: ["id", "code"] })).map((t) => [s(t.id), s(t.code)]));
}

export interface HashedQuestion { id: string; skillId: string; status: string; createdAt: string; tags: unknown; stem: string; type: string; hash: string; stemKey: string; stored: string | null }

/**
 * Fingerprints of these questions computed from the stored rows (≤ BATCH ids per read, needed columns only).
 * `rows` may be passed when the Question columns were already read (id, skillId, status, createdAt, tags, stem, typeId,
 * passageId, content, contentHash).
 */
export async function hashQuestions(repo: Repo, ids: string[], types?: Map<string, string>, rows?: Row[]): Promise<HashedQuestion[]> {
  const codes = types ?? (await typeCodes(repo));
  const out: HashedQuestion[] = [];
  for (const part of chunks([...new Set(ids)])) {
    const qs = rows ? rows.filter((r) => part.includes(s(r.id))) : await repo.findMany("Question", { id: { in: part } }, { select: HASH_COLUMNS });
    if (!qs.length) continue;
    const qids = qs.map((q) => s(q.id));
    const passageIds = [...new Set(qs.map((q) => q.passageId).filter(Boolean).map(s))];
    const [opts, ans, passages] = await Promise.all([
      repo.findMany("QuestionOption", { questionId: { in: qids } }, { select: ["questionId", "text", "isCorrect"] }),
      repo.findMany("QuestionAnswer", { questionId: { in: qids } }, { select: ["questionId", "value", "isPrimary"] }),
      passageIds.length ? repo.findMany("ReadingPassage", { id: { in: passageIds } }, { select: ["id", "body"] }) : Promise.resolve([] as Row[]),
    ]);
    const optsOf = new Map<string, Row[]>(), ansOf = new Map<string, Row[]>();
    for (const o of opts) { const k = s(o.questionId); const l = optsOf.get(k); if (l) l.push(o); else optsOf.set(k, [o]); }
    for (const a of ans) { const k = s(a.questionId); const l = ansOf.get(k); if (l) l.push(a); else ansOf.set(k, [a]); }
    const body = new Map(passages.map((p) => [s(p.id), s(p.body)]));
    for (const q of qs) {
      const id = s(q.id);
      const type = codes.get(s(q.typeId)) ?? s(q.typeId);
      const passage = q.passageId ? body.get(s(q.passageId)) ?? `#${s(q.passageId)}` : null;
      // the primary answer first (the order they were written in)
      const answers = (ansOf.get(id) ?? []).sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))).map((a) => a.value);
      const hash = contentHashOf({ type, stem: s(q.stem), passage, image: q.imageId ? s(q.imageId) : null, options: (optsOf.get(id) ?? []).map((o) => ({ text: s(o.text), correct: Boolean(o.isCorrect) })), answers, content: q.content });
      const created = q.createdAt instanceof Date ? q.createdAt.toISOString() : s(q.createdAt);
      out.push({ id, skillId: s(q.skillId), status: s(q.status), createdAt: created, tags: parseJ(q.tags), stem: s(q.stem), type, hash, stemKey: stemKeyOf(type, q.stem, passage), stored: q.contentHash ? s(q.contentHash) : null });
    }
  }
  return out;
}

export const HASH_COLUMNS = ["id", "skillId", "status", "createdAt", "tags", "stem", "typeId", "passageId", "content", "contentHash", "deletedAt", "imageId"] as const;

/**
 * Saves fingerprints that changed (only those that differ). Questions that share a fingerprint are saved by one
 * statement; the others, one statement each, a few at a time (⚡ src/server/db/parallel.ts).
 */
export async function saveHashes(repo: Repo, list: HashedQuestion[]): Promise<number> {
  const byHash = new Map<string, HashedQuestion[]>();
  for (const q of list) if (q.stored !== q.hash) { const l = byHash.get(q.hash); if (l) l.push(q); else byHash.set(q.hash, [q]); }
  let n = 0;
  await eachLimit([...byHash.values()], async (qs) => {
    await repo.updateMany("Question", qs.length === 1 ? { id: qs[0].id } : { id: { in: qs.map((q) => q.id) } }, { contentHash: qs[0].hash });
    for (const q of qs) q.stored = q.hash;
    n += qs.length;
  });
  return n;
}

/**
 * Fills the fingerprint of questions that have none (new rows from paths that do not compute it), in batches of BATCH
 * by id. Returns how many were filled. `max` bounds one call (the rest is done by the next call).
 */
export async function backfillContentHashes(repo: Repo, opts: { max?: number } = {}): Promise<number> {
  const types = await typeCodes(repo);
  let after = "", done = 0;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  while (done < max) {
    const page = await repo.findMany("Question", { contentHash: null, ...(after ? { id: { gt: after } } : {}) }, { select: HASH_COLUMNS, orderBy: [{ field: "id", dir: "asc" }], take: BATCH });
    if (!page.length) break;
    after = s(page[page.length - 1].id);
    done += await saveHashes(repo, await hashQuestions(repo, page.map((q) => s(q.id)), types, page));
    if (page.length < BATCH) break;
  }
  return done;
}
