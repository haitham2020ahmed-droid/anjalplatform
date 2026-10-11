/**
 * 🔒 One at a time per key (in this server process): a student's double click, or 25 students opening the same
 * plan part at the same second, run one after the other instead of together — so a session, an answer or a
 * class set is never created twice. Different keys still run in parallel.
 */
const tails = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
