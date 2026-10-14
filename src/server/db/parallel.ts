/**
 * ⚡ Many small independent writes (one row each, e.g. a value computed per question) without waiting for each
 * round trip in turn: at most `limit` run at once, so they share the connection pool (5 by default, src/lib/db-url.ts)
 * with the rest of the server instead of taking all of it. Never use it inside repo.transaction() (one connection).
 * The first error is thrown after the running writes finish; writes not started yet are not started.
 */
export const WRITE_PARALLEL = 4;

/** Reads for many items (e.g. one report per student) at most `limit` at a time; results in the items' order. */
export const READ_PARALLEL = 6;
export async function mapLimit<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>, limit = READ_PARALLEL): Promise<R[]> {
  const out = new Array<R>(items.length);
  await eachLimit(items, async (x, i) => { out[i] = await fn(x, i); }, limit);
  return out;
}

export async function eachLimit<T>(items: readonly T[], fn: (item: T, index: number) => Promise<unknown>, limit = WRITE_PARALLEL): Promise<void> {
  let next = 0;
  let failed: { e: unknown } | null = null;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try { await fn(items[i], i); } catch (e) { failed ??= { e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  if (failed) throw (failed as { e: unknown }).e;
}
