/**
 * 📒 ReadRise key words → My Words.
 *
 *  carryKeyWords  when a FIRST-TRY reading reaches DONE, the band's 5 key words (RRPrompt.keyWords) go into the
 *                 student's word notebook (StudentWord) like a looked-up word: a new word starts its spaced review
 *                 tomorrow (step 0); a word already there only gets its lastAt moved. When the school's dictionary
 *                 has no entry for the word yet, the article's own definition is saved (so My Words and the weekly
 *                 word quiz can show a meaning). Idempotent: running it twice adds nothing new.
 *  wordWarmup     before the next reading: up to 2 "Which word means …?" questions on the key words of the student's
 *                 previous finished article (4 options from that article's key words). Never scored for the level.
 */
import { createHash } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { forgetSchoolWords } from "../vocabulary/meaning";
import { baseBand } from "./first-try";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const t = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() || 0 : 0);

export interface CarryWord { word: string; partOfSpeech: string; definition: string; example: string }

/** "Habitat," → "habitat"; a short phrase ("food chain") is kept; anything else → null. */
export function carryWord(raw: unknown): string | null {
  const w = s(raw).replace(/[‘’ʼ]/g, "'").trim().toLowerCase().replace(/\s+/g, " ").replace(/^[^a-z]+|[^a-z]+$/g, "");
  return /^[a-z](?:[a-z' -]{0,62}[a-z])?$/.test(w) ? w : null;
}

/** The key words of a stored RRPrompt.keyWords value (cleaned, unique). */
export function keyWordsOf(v: unknown): CarryWord[] {
  let o = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = []; } }
  const seen = new Set<string>();
  const out: CarryWord[] = [];
  for (const k of Array.isArray(o) ? o : []) {
    if (!k || typeof k !== "object") continue;
    const r = k as Record<string, unknown>;
    const word = carryWord(r.word);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push({ word, partOfSpeech: s(r.partOfSpeech).trim(), definition: s(r.definition).trim(), example: s(r.example).trim() });
  }
  return out;
}

async function promptWords(repo: Repo, articleId: string, band: string): Promise<CarryWord[]> {
  const row = await repo.findUnique("RRPrompt", { articleId, band: baseBand(band) }); // a stretch set (S-M) → MID
  return keyWordsOf(row?.keyWords);
}

/** The band's key words → the student's notebook. Returns how many words were NEW in the notebook. */
export async function carryKeyWords(repo: Repo, studentId: string, articleId: string, band: string, now = new Date()): Promise<number> {
  const words = await promptWords(repo, articleId, band);
  if (!words.length) return 0;
  const have = new Map((await repo.findMany("StudentWord", { studentId, word: { in: words.map((w) => w.word) } }, { select: ["word"] })).map((r) => [s(r.word), r]));
  let added = 0;
  for (const w of words) {
    if (have.has(w.word)) { await repo.updateMany("StudentWord", { studentId, word: w.word }, { lastAt: now }); continue; }
    try {
      await repo.create("StudentWord", { studentId, word: w.word, lookups: 1, firstAt: now, lastAt: now, quizRight: 0, quizWrong: 0, nextReviewAt: new Date(now.getTime() + DAY), reviewStep: 0 });
      added++;
    } catch { /* saved by a parallel request */ }
  }
  // the school's dictionary: the article's definition when the word has no entry yet (never overwrites one)
  const st = await repo.findUnique("Student", { id: studentId });
  const schoolId = st ? s(st.schoolId) : "";
  const withDef = words.filter((w) => w.definition);
  if (schoolId && withDef.length) {
    const known = new Set((await repo.findMany("WordEntry", { schoolId, word: { in: withDef.map((w) => w.word) } }, { select: ["word"] })).map((r) => s(r.word)));
    let wrote = false;
    for (const w of withDef) {
      if (known.has(w.word)) continue;
      try {
        await repo.create("WordEntry", { schoolId, word: w.word, phonetic: null, audioUrl: null, meanings: [{ partOfSpeech: w.partOfSpeech || "word", definition: w.definition.slice(0, 400), example: w.example.slice(0, 300) || null, synonyms: [], antonyms: [] }], source: "SCHOOL", isVocab: false, updatedAt: now });
        wrote = true;
      } catch { /* written by a parallel request */ }
    }
    if (wrote) forgetSchoolWords(repo, schoolId);
  }
  return added;
}

// ------------------------------------------------------------------ warm-up

export interface WarmupQ {
  /** the right word (also options[answer]) */
  word: string;
  options: string[];
  answer: number;
  /** the question: the key word's definition ("Which word means …?") */
  definition: string;
}

/** A deterministic shuffle (sha-256 seeded). */
function shuffle<T>(arr: readonly T[], seed: string): T[] {
  const out = [...arr];
  let h = BigInt("0x" + createHash("sha256").update(seed).digest("hex"));
  for (let i = out.length - 1; i > 0; i--) { const j = Number(h % BigInt(i + 1)); h /= BigInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Up to 2 warm-up questions on the key words of the student's previous finished article ([] when it has < 2 words). */
export async function wordWarmup(repo: Repo, studentId: string, now = new Date()): Promise<WarmupQ[]> {
  const runs = await repo.findMany("RRRun", { studentId, step: "DONE" }, { select: ["articleId", "band", "completedAt", "startedAt"], orderBy: [{ field: "completedAt", dir: "desc" }], take: 5 });
  const last = [...runs].sort((a: Row, b: Row) => (t(b.completedAt) || t(b.startedAt)) - (t(a.completedAt) || t(a.startedAt)))[0];
  if (!last) return [];
  const words = (await promptWords(repo, s(last.articleId), s(last.band))).filter((w) => w.definition);
  if (words.length < 2) return [];
  const day = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const seed = `${studentId}|${s(last.articleId)}|${day}`;
  return shuffle(words, seed).slice(0, 2).map((w) => {
    const others = shuffle(words.filter((x) => x.word !== w.word), `${seed}|${w.word}`).slice(0, 3).map((x) => x.word);
    const options = shuffle([w.word, ...others], `${seed}|${w.word}|o`);
    return { word: w.word, options, answer: options.indexOf(w.word), definition: w.definition };
  });
}
