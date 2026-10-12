/**
 * 🔊 Audio bytes for GET /api/tts/<key> with a memory cap (Update 46).
 *
 *   - iPhone/iPad Safari asks for the same file several times (Range requests: bytes=0-1, then the rest): the last
 *     few files stay in memory, so those requests do not read the whole recording from the database again. The
 *     cache is bounded by BYTES (CACHE_MAX_BYTES in all; a file bigger than CACHE_ITEM_MAX_BYTES is never kept).
 *   - At most READS_AT_ONCE recordings are read from the database at the same time; two requests for the same file
 *     share one read. Thirty students pressing ▶ together no longer hold thirty copies of a recording in memory.
 */
import type { Repo } from "../seeding/repo";
import { readAudio } from "./store";

type Audio = { id: string; mime: string; bytes: Uint8Array };

export const CACHE_MAX_BYTES = 24 * 1048576;
export const CACHE_ITEM_MAX_BYTES = 6 * 1048576;
export const READS_AT_ONCE = 3;
const CACHE_MS = 2 * 60_000; // a player's Range requests come within seconds

interface State { cache: Map<string, { a: Audio; at: number }>; bytes: number; inflight: Map<string, Promise<Audio | null>>; active: number; waiters: (() => void)[] }
const G = globalThis as unknown as { __ttsAudio?: State };
const st: State = (G.__ttsAudio ??= { cache: new Map(), bytes: 0, inflight: new Map(), active: 0, waiters: [] });

function drop(key: string): void {
  const hit = st.cache.get(key);
  if (!hit) return;
  st.cache.delete(key);
  st.bytes -= hit.a.bytes.length;
}

function keep(key: string, a: Audio): void {
  if (a.bytes.length > CACHE_ITEM_MAX_BYTES) return;
  drop(key);
  st.cache.set(key, { a, at: Date.now() });
  st.bytes += a.bytes.length;
  while (st.bytes > CACHE_MAX_BYTES && st.cache.size) drop(st.cache.keys().next().value as string);
}

async function slot(): Promise<() => void> {
  // a freed slot is handed straight to the next waiter (never more than READS_AT_ONCE reads)
  if (st.active >= READS_AT_ONCE) await new Promise<void>((r) => { st.waiters.push(() => r()); });
  else st.active++;
  return () => { const next = st.waiters.shift(); if (next) next(); else st.active--; };
}

/** The audio of `key` (same result as readAudio), read through the bounded cache. */
export async function readAudioCached(repo: Repo, key: string): Promise<Audio | null> {
  const hit = st.cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) { st.cache.delete(key); st.cache.set(key, hit); return hit.a; }
  if (hit) drop(key);
  const same = st.inflight.get(key);
  if (same) return same;
  const job = (async () => {
    const release = await slot();
    try {
      const a = await readAudio(repo, key);
      if (a) keep(key, a);
      return a;
    } finally { release(); st.inflight.delete(key); }
  })();
  st.inflight.set(key, job);
  return job;
}

/** Forget a key (its audio was replaced). */
export const forgetAudio = (key: string): void => drop(key);
