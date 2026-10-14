/**
 * ✏️ Teachers' private question copies (owner's rule, Update 57).
 *
 * A teacher who edits a question of a test gets a COPY (src/server/tests/review.ts editQuestionCopy): a new published
 * question with tags.teacherCopyOf = the original. The copy is PRIVATE to that teacher (Question.privateToId = their
 * User id): it is never in the shared bank's lists, never picked by another teacher's builders, practice, adaptive,
 * MAP or NAFS pools, and never counted in bank totals. Only its creator sees and reuses it (Review test → "My edited
 * copies"); the admin sees every copy under Questions → "Teacher copies". Nothing is ever deleted.
 *
 * How it is enforced everywhere at once: every read of the Question table goes through the Repo, and the Repo adapters
 * (PrismaRepo, SqliteRepo) pass `where` through sharedBankWhere first. A read that does not name privateToId and is
 * not a read BY ID gets `privateToId: null` added — so every pool, list and count sees the shared bank only, while the
 * reads by id (a test's own questions, a student's answers, the copy itself) still find the copy. A read that wants
 * private copies says so (privateToId: <user id> · privateToId: { not: null }).
 */
import type { Repo, Where } from "../seeding/repo";

/**
 * 🗑 An admin's "Delete" of a question students already answered (src/server/admin/question-delete.ts): the row stays
 * (the answers point at it) but it is owned by nobody, so the same rule above hides it from every shared read — bank
 * lists and counts, practice / adaptive / MAP / NAFS / Learn pools, search — while reads by id (a student's history,
 * reports) still find it. Also marked deletedAt + ARCHIVED.
 */
export const DELETED_OWNER = "~deleted";

/** The Question-table `where` of a shared-bank read (see above). Other tables are returned unchanged. */
export function sharedBankWhere(model: string, where: Where | undefined): Where | undefined {
  if (model !== "Question") return where;
  const w = where ?? {};
  if (Object.prototype.hasOwnProperty.call(w, "privateToId")) return w;
  const id = (w as Record<string, unknown>).id;
  if (typeof id === "string" || (id !== null && typeof id === "object" && Array.isArray((id as { in?: unknown }).in))) return w;
  return { ...w, privateToId: null };
}

/** True when a database error is "the privateToId column does not exist" (the update's `prisma db push` has not run yet). */
export function isMissingPrivateColumn(e: unknown): boolean {
  return /privateToId/.test(String((e as { message?: unknown })?.message ?? e)) && /(does not exist|Unknown (column|argument|field)|no such column)/i.test(String((e as { message?: unknown })?.message ?? e));
}

const s = (v: unknown) => String(v ?? "");
const tagsOf = (v: unknown): Record<string, unknown> => {
  if (!v) return {};
  if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; } }
  return v as Record<string, unknown>;
};

/**
 * Copies made before this rule become private too (idempotent, bounded batches): every question with
 * tags.teacherCopyOf (their externalRef starts with TCOPY-) and no owner yet gets its creator as owner ("" when the
 * creator is unknown: then only the admin sees it). Returns how many were made private. Never deletes anything.
 */
export async function privatizeOldCopies(repo: Repo, batch = 500): Promise<number> {
  let n = 0, after = "";
  for (let round = 0; round < 1000; round++) {
    const rows = await repo.findMany("Question", { externalRef: { contains: "TCOPY-" }, privateToId: null, ...(after ? { id: { gt: after } } : {}) }, { select: ["id", "tags", "createdById"], orderBy: [{ field: "id", dir: "asc" }], take: batch });
    if (!rows.length) break;
    after = s(rows[rows.length - 1].id);
    // a row that only looks like a copy (TCOPY- inside an imported reference) stays shared
    const byOwner = new Map<string, string[]>();
    for (const q of rows) if (tagsOf(q.tags).teacherCopyOf) { const o = s(q.createdById); byOwner.set(o, [...(byOwner.get(o) ?? []), s(q.id)]); }
    for (const [owner, ids] of byOwner) n += await repo.updateMany("Question", { id: { in: ids } }, { privateToId: owner });
    if (rows.length < batch) break;
  }
  return n;
}

let started: Promise<number> | null = null;
/** Once per server process (instrumentation): make the old copies private in the background. Never throws. */
export function privatizeOldCopiesOnce(repo: Repo): Promise<number> {
  started ??= privatizeOldCopies(repo).catch(() => { started = null; return 0; });
  return started;
}
