/** ⚡ Counts per group done by the database (GROUP BY) instead of reading every row. */
import type { Repo, Where } from "../seeding/repo";

/**
 * How many rows of `model` match `where`, per value of `by` (one GROUP BY instead of reading every row). Uses the
 * repo's groupCount when it has one (Prisma, SQLite), else reads just the `by` column.
 */
export async function countGroups(repo: Repo, model: string, by: string, where?: Where): Promise<Map<string, number>> {
  if (typeof repo.groupCount === "function") return repo.groupCount(model, by, where);
  const out = new Map<string, number>();
  for (const r of await repo.findMany(model, where, { select: [by] })) { const k = String(r[by] ?? ""); out.set(k, (out.get(k) ?? 0) + 1); }
  return out;
}
