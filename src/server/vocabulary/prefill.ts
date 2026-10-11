/** 📖 The dictionary prefill (Update 42C): see scripts/vocab/prefill-dictionary.ts. */
import type { Repo } from "../seeding/repo";
import { aiSettings, type EnvLike } from "../ai/engine";
import { vocabWords } from "../student/words";
import { isProperNoun, lemmaTiers, normalizeWord } from "./lemma";
import { AI_WORD_BATCH, aiRoom, defineWordsWithAi, resolvedWords, wordProvider } from "./meaning";

const s = (v: unknown) => String(v ?? "");
const PAGE = 50;
const MAX_WORDS = 30_000; // distinct words kept in memory (with one short sentence each)
const STOP = new Set("a an the and or but if of to in on at by for with from as is are was were be been am i you he she it we they me him her us them my your his its our their this that these those there here not no yes do does did so than then too very can will just".split(" "));

/** Words of a text → (word, its sentence); names (capitalized in the middle of a sentence anywhere) are skipped. */
export function wordsOf(text: string, into: Map<string, string>, max = MAX_WORDS, names: Set<string> = new Set()): void {
  const clean = s(text).replace(/<[^>]+>/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const found: [string, string][] = [];
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    for (const m of sentence.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
      const w = normalizeWord(m[0]);
      if (!w || w.length < 3 || STOP.has(w)) continue;
      if (isProperNoun(m[0], sentence)) { if (names.size < max) names.add(w); into.delete(w); continue; }
      found.push([w, sentence]);
    }
  }
  for (const [w, sentence] of found) if (!names.has(w) && !into.has(w) && into.size < max) into.set(w, sentence.slice(0, 200));
}

async function scan(repo: Repo, model: string, where: Record<string, unknown>, into: Map<string, string>, names: Set<string>): Promise<number> {
  let n = 0;
  for (let skip = 0; ; skip += PAGE) {
    const rows = await repo.findMany(model, where, { select: ["id", "body"], orderBy: [{ field: "id" }], take: PAGE, skip });
    for (const r of rows) wordsOf(s(r.body), into, MAX_WORDS, names);
    n += rows.length;
    if (rows.length < PAGE || into.size >= MAX_WORDS) return n;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function prefill(repo: Repo, env: EnvLike, o: { apply: boolean; school?: string; limit: number; log?: (m: string) => void; wait?: (ms: number) => Promise<void>; fetchImpl?: typeof fetch }): Promise<{ school: string; words: number; missing: number; added: number }[]> {
  const log = o.log ?? console.log, wait = o.wait ?? sleep;
  const schools = (await repo.findMany("School", o.school ? { id: o.school } : {}, { select: ["id", "name"] }));
  const out: { school: string; words: number; missing: number; added: number }[] = [];
  // passages shared by every school
  const shared = new Map<string, string>();
  const names = new Set<string>();
  const rp = await scan(repo, "ReadingPassage", { deletedAt: null }, shared, names);
  const libArts = (await repo.findMany("RRArticle", { schoolId: null, deletedAt: null }, { select: ["id"] })).map((a) => s(a.id));
  let rr = 0; for (let i = 0; i < libArts.length; i += 100) rr += await scan(repo, "RRVersion", { articleId: { in: libArts.slice(i, i + 100) } }, shared, names);
  log(`shared passages: ${rp} question-bank passages, ${rr} ReadRise library versions → ${shared.size} words`);
  for (const sc of schools) {
    const schoolId = s(sc.id);
    const all = new Map(shared);
    const own = (await repo.findMany("RRArticle", { schoolId, deletedAt: null }, { select: ["id"] })).map((a) => s(a.id));
    for (let i = 0; i < own.length; i += 100) await scan(repo, "RRVersion", { articleId: { in: own.slice(i, i + 100) } }, all, names);
    const rm = (await repo.findMany("ReadMasterArticle", { schoolId }, { select: ["id"] })).map((a) => s(a.id));
    for (let i = 0; i < rm.length; i += 100) await scan(repo, "ReadMasterVersion", { articleId: { in: rm.slice(i, i + 100) } }, all, names);
    // which words have no meaning yet (checked 300 at a time: one query each)
    const list = [...all.keys()].filter((w) => !names.has(w));
    const missing: string[] = [];
    for (let i = 0; i < list.length; i += 300) { const chunk = list.slice(i, i + 300); const done = await resolvedWords(repo, schoolId, chunk); for (const w of chunk) if (!done.has(w)) missing.push(w); }
    // one request per base word (stopped and stops → one “stop”)
    const missSet = new Set(missing);
    const todo = missing.filter((w) => !lemmaTiers(w).safe.slice(1).some((b) => missSet.has(b)));
    const pick = todo.slice(0, o.limit);
    log(`school ${s(sc.name)} (${schoolId}): ${all.size} words in passages, ${missing.length} without a meaning, ${pick.length} to write${o.apply ? "" : " (dry run: add --apply)"}`);
    if (missing.length) log(`  e.g. ${pick.slice(0, 15).join(", ")}`);
    let added = 0;
    if (o.apply && pick.length) {
      const settings = await aiSettings(repo, schoolId);
      const picked = wordProvider(env, settings, { timeoutMs: 60_000, fetchImpl: o.fetchImpl });
      if (!picked.ok) { log(`  AI not available: ${picked.reason}`); out.push({ school: schoolId, words: all.size, missing: missing.length, added }); continue; }
      const vocab = await vocabWords(repo, schoolId);
      const gap = Math.ceil(60_000 / settings.perMinute);
      for (let i = 0; i < pick.length; i += AI_WORD_BATCH) {
        let room = await aiRoom(repo, schoolId, settings);
        for (let tries = 0; !room.ok && /minute/.test(room.reason ?? "") && tries < 5; tries++) { await wait(60_000); room = await aiRoom(repo, schoolId, settings); }
        if (!room.ok) { log(`  stopped: ${room.reason}`); break; }
        const batch = pick.slice(i, i + AI_WORD_BATCH).map((w) => ({ word: w, sentence: all.get(w) ?? null }));
        const r = await defineWordsWithAi(repo, schoolId, batch, picked, new Date(), vocab);
        added += r.saved.length;
        log(`  batch ${i / AI_WORD_BATCH + 1}: ${r.saved.length}/${batch.length} saved${r.error ? ` (${r.error})` : ""}`);
        if (r.stop) break;
        if (i + AI_WORD_BATCH < pick.length) await wait(gap);
      }
    }
    out.push({ school: schoolId, words: all.size, missing: missing.length, added });
  }
  return out;
}
