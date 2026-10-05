/**
 * Unique-key contract shared by both Repo implementations (Phase 12).
 *
 * findUnique / upsert must name exactly one unique key of the model: its @id,
 * a single @unique field, or a composite @@id / @@unique, in any key order.
 * PrismaRepo turns a composite into Prisma's name (fields joined by "_" in SCHEMA
 * order); SqliteRepo enforces the same rule, so every test exercises the contract
 * production uses. UNIQUE_KEYS is generated from prisma/schema.prisma
 * (scripts/db/gen-unique-keys.ts); a test fails if it drifts from the schema.
 */
import { UNIQUE_KEYS } from "./unique-keys.generated";

export { UNIQUE_KEYS };

export class UniqueKeyError extends Error {}

/** The model's unique key whose fields are exactly `keys` (any order), in schema order. */
export function matchUniqueKey(keysByModel: Record<string, readonly (readonly string[])[]>, model: string, keys: string[]): readonly string[] {
  const candidates = keysByModel[model];
  if (!candidates) throw new UniqueKeyError(`Unknown model ${model}.`);
  const set = new Set(keys);
  const hit = candidates.find((k) => k.length === set.size && k.every((f) => set.has(f)));
  if (!hit) throw new UniqueKeyError(`${model}: {${keys.join(", ")}} is not a unique key. Unique keys: ${candidates.map((k) => `{${k.join(", ")}}`).join(" ")}. Use findMany for non-unique lookups.`);
  return hit;
}

/** Prisma `where` for a unique lookup, independent of the key order in the call. */
export function prismaUniqueWhere(model: string, where: Record<string, unknown>, keysByModel = UNIQUE_KEYS): Record<string, unknown> {
  const key = matchUniqueKey(keysByModel, model, Object.keys(where));
  if (key.length === 1) return { [key[0]]: where[key[0]] };
  return { [key.join("_")]: Object.fromEntries(key.map((f) => [f, where[f]])) };
}
