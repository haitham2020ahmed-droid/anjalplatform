/** Pre-generated read-aloud audio in the database (TtsAudio), looked up by the hash of the spoken text. */
import type { Repo } from "../seeding/repo";
import { isSpeechKey, type WordTimings } from "@/lib/tts/text";

export interface AudioMeta { id: string; mime: string; durationMs: number; size: number; voice: string; timings: WordTimings }

/** The audio's details (no bytes), or null when none was generated for this text. */
export async function findAudioMeta(repo: Repo, key: string): Promise<AudioMeta | null> {
  if (!isSpeechKey(key)) return null;
  const [r] = await repo.findMany("TtsAudio", { textHash: key }, { select: ["id", "mime", "durationMs", "size", "voice", "timings"], take: 1 });
  if (!r) return null;
  let timings: WordTimings = { v: 1, exact: false, words: [] };
  try { const t = JSON.parse(String(r.timings)) as WordTimings; if (Array.isArray(t.words)) timings = { v: 1, exact: Boolean(t.exact), words: t.words.map(Number) }; } catch { /* keep empty */ }
  return { id: String(r.id), mime: String(r.mime), durationMs: Number(r.durationMs), size: Number(r.size), voice: String(r.voice), timings };
}

/** The audio bytes, or null. */
export async function readAudio(repo: Repo, key: string): Promise<{ id: string; mime: string; bytes: Uint8Array } | null> {
  if (!isSpeechKey(key)) return null;
  const [r] = await repo.findMany("TtsAudio", { textHash: key }, { select: ["id", "mime", "bytes"], take: 1 });
  if (!r || !r.bytes) return null;
  return { id: String(r.id), mime: String(r.mime), bytes: r.bytes as Uint8Array };
}

/** Which of these keys already have audio, with the voice they were made with. */
export async function existingVoices(repo: Repo, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 300) {
    for (const r of await repo.findMany("TtsAudio", { textHash: { in: keys.slice(i, i + 300) } }, { select: ["textHash", "voice"] })) out.set(String(r.textHash), String(r.voice));
  }
  return out;
}

/** Parses an HTTP Range header ("bytes=a-b") for a body of `size` bytes; null = whole body, "bad" = 416. */
export function parseRange(h: string | null, size: number): { start: number; end: number } | null | "bad" {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) { const n = Number(m[2]); start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start > end || start >= size) return "bad";
  return { start, end };
}
