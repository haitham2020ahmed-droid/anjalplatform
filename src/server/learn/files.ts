/**
 * 📘 Learn content files, read at run time and kept in memory (re-read only when a file changes on disk):
 *
 *   data/learn/lessons/LN-*.json  the lessons (one topic, 4 levels) — checked by src/lib/learn/format.ts checkLesson;
 *                                 an invalid file is skipped as a whole and reported (file + problems)
 *   data/learn/topics.json        the 222 planned topics (code, title, standards, families, skillNames …): coverage
 *                                 works from it even before every lesson file exists
 *   data/learn/continuum.json     the MAP continuum statements (id, subject, goal area, sub-topic, RIT band, CCSS)
 *   data/learn/words/G*.json      the Curriculum Map vocabulary explained (checked per word card: a bad card is
 *                                 skipped, the rest of the file is used)
 *
 * A page reads ONE lesson / ONE selection from these maps; nothing here touches the database.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { asLesson, checkLesson, checkWordCard, type LessonFile, type WordCard } from "../../lib/learn/format";
import { allLessonDetails } from "../curriculum-map/lesson-details";
import { IdleBox, sweptMap } from "../cache/idle";

export const LESSON_FILE = /^LN-[A-Za-z0-9-]{1,12}\.json$/;
const s = (v: unknown) => String(v ?? "");

let rootOverride: string | null = null;
let packDirHint: string | null = null;
/** Tests: read the Learn files from another folder (it has lessons/, words/, topics.json …); null = data/learn. */
export function useLearnDir(dir: string | null): void { rootOverride = dir; lessonCache.clear(); oneLesson.clear(); wordCache.clear(); topicCache.clear(); contCache.clear(); }
/** load-packs: when the packs read from another folder (tests), the lessons are its "learn-lessons" sub-folder. */
export function learnPackDir(dir: string | null): void { packDirHint = dir; lessonCache.clear(); oneLesson.clear(); }
export const learnDir = () => rootOverride ?? join(process.cwd(), "data", "learn");
const lessonsDir = () => (!rootOverride && packDirHint ? join(packDirHint, "learn-lessons") : join(learnDir(), "lessons"));

// ------------------------------------------------------------------ lessons

export interface LessonRead { valid: Map<string, LessonFile & { file: string; hash: string }>; invalid: { file: string; problems: string[] }[]; files: string[]; sig: string; dir: string }
// r68 memory: the parsed lessons (222 topics × 4 levels) are kept while used and released after 5 idle minutes; a student
// opening ONE lesson reads that one file only (oneLesson, a few kept)
const lessonCache = new IdleBox<LessonRead>("learn.lessons");
const oneLesson = sweptMap<string, { at: number; sig: string; lesson: (LessonFile & { file: string; hash: string }) | null }>("learn.lesson", 10 * 60_000, 40);

export function lessonFiles(dir = lessonsDir()): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir).filter((f) => LESSON_FILE.test(f)).sort(); } catch { return []; }
}
/** The lessons folder's signature (every file's name, size and time); "" when it is empty. */
export function lessonSignature(dir = lessonsDir()): string {
  return lessonFiles(dir).map((f) => { try { const st = statSync(join(dir, f)); return `${f}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return f; } }).join("|");
}

/** Every lesson file, checked (kept in memory until a file changes). */
export function readLessons(): LessonRead {
  const dir = lessonsDir();
  const sig = lessonSignature(dir);
  const kept = lessonCache.get();
  if (kept && kept.sig === sig && kept.dir === dir) return kept;
  const files = lessonFiles(dir);
  const out: LessonRead = { valid: new Map(), invalid: [], files, sig, dir };
  for (const f of files) {
    let text = "", raw: unknown;
    try { text = readFileSync(join(dir, f), "utf8"); raw = JSON.parse(text); } catch (e) { out.invalid.push({ file: f, problems: [`invalid JSON: ${(e as Error).message.slice(0, 120)}`] }); continue; }
    const problems = checkLesson(raw);
    const code = s((raw as { code?: unknown })?.code).trim();
    if (!problems.length && f.replace(/\.json$/, "") !== code) problems.push(`code ${code} does not match the file name`);
    if (!problems.length && out.valid.has(code)) problems.push(`code ${code} used by another file`);
    if (problems.length) { out.invalid.push({ file: f, problems: problems.slice(0, 20) }); continue; }
    out.valid.set(code, { ...asLesson(raw as Record<string, unknown>), file: f, hash: createHash("sha1").update(text).digest("hex") });
  }
  return lessonCache.set(out);
}
/** One lesson from the files (null when there is no valid file with that code): its own file only, unless every
 *  lesson is in memory already. */
export function lessonFile(code: string): (LessonFile & { file: string; hash: string }) | null {
  const c = s(code).trim();
  const dir = lessonsDir();
  const all = lessonCache.get();
  if (all && all.dir === dir) {
    const f = `${c}.json`;
    const st = (() => { try { return statSync(join(dir, f)); } catch { return null; } })();
    const sig = st ? `${f}:${st.size}:${Math.round(st.mtimeMs)}` : "";
    // the kept read is still current for this file: use it (a changed file is read again below)
    if (!st ? !all.valid.has(c) : all.sig.split("|").includes(sig)) return all.valid.get(c) ?? null;
  }
  const f = `${c}.json`;
  if (!LESSON_FILE.test(f)) return null;
  const path = join(dir, f);
  let st;
  try { st = statSync(path); } catch { return null; }
  const sig = `${dir}|${st.size}:${Math.round(st.mtimeMs)}`;
  const hit = oneLesson.get(c);
  if (hit && hit.sig === sig) { hit.at = Date.now(); return hit.lesson; }
  let lesson: (LessonFile & { file: string; hash: string }) | null = null;
  try {
    const text = readFileSync(path, "utf8");
    const raw = JSON.parse(text) as unknown;
    const code2 = s((raw as { code?: unknown })?.code).trim();
    if (!checkLesson(raw).length && code2 === c) lesson = { ...asLesson(raw as Record<string, unknown>), file: f, hash: createHash("sha1").update(text).digest("hex") };
  } catch { lesson = null; }
  oneLesson.set(c, { at: Date.now(), sig, lesson });
  return lesson;
}

// ------------------------------------------------------------------ topics + continuum

export interface Topic { code: string; title: string; subject: "READING" | "LANGUAGE"; goalArea: string; subtopic: string; standards: string[]; families: string[]; skillNames: string[]; ritMin: number; ritMax: number; statementIds: string[]; summary: string }
export interface Statement { id: string; subject: string; goalArea: string; subtopic: string; ritLow: number; ritHigh: number; standards: string[] }

const topicCache = new IdleBox<{ sig: string; topics: Topic[] }>("learn.topics");
const contCache = new IdleBox<{ sig: string; rows: Statement[] }>("learn.continuum");
const fileSig = (f: string) => { try { const st = statSync(f); return `${st.size}:${Math.round(st.mtimeMs)}`; } catch { return ""; } };

/** The planned topics (data/learn/topics.json; [] when missing). */
export function readTopics(): Topic[] {
  const f = join(learnDir(), "topics.json"), sig = fileSig(f);
  const kt = topicCache.get();
  if (kt && kt.sig === sig) return kt.topics;
  let topics: Topic[] = [];
  try {
    const raw = JSON.parse(readFileSync(f, "utf8")) as unknown;
    topics = (Array.isArray(raw) ? raw : []).filter((t) => t && typeof t === "object" && s((t as Topic).code)).map((t) => {
      const x = t as Topic;
      const list = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
      return { code: s(x.code), title: s(x.title), subject: x.subject === "LANGUAGE" ? "LANGUAGE" : "READING", goalArea: s(x.goalArea), subtopic: s(x.subtopic), standards: list(x.standards), families: list(x.families), skillNames: list(x.skillNames), ritMin: Number(x.ritMin) || 0, ritMax: Number(x.ritMax) || 0, statementIds: list(x.statementIds), summary: s(x.summary) };
    });
  } catch { topics = []; }
  topicCache.set({ sig, topics });
  return topics;
}

/** The continuum statements (data/learn/continuum.json; [] when missing). */
export function readContinuum(): Statement[] {
  const f = join(learnDir(), "continuum.json"), sig = fileSig(f);
  const kc = contCache.get();
  if (kc && kc.sig === sig) return kc.rows;
  let rows: Statement[] = [];
  try { const raw = JSON.parse(readFileSync(f, "utf8")) as unknown; rows = Array.isArray(raw) ? (raw as Statement[]).filter((r) => r && r.id) : []; } catch { rows = []; }
  contCache.set({ sig, rows });
  return rows;
}

// ------------------------------------------------------------------ the lesson list (files first, then the planned topics)

export interface LessonMeta { code: string; title: string; subject: "READING" | "LANGUAGE"; goalArea: string; subtopic: string; standards: string[]; families: string[]; skillNames: string[]; summary: string; ready: boolean }
/** Every lesson the platform knows: a valid file (ready) or a planned topic without a file yet (not ready). */
export function lessonCatalog(): LessonMeta[] {
  const files = readLessons().valid, topics = readTopics();
  const out = new Map<string, LessonMeta>();
  for (const l of files.values()) {
    const t = topics.find((x) => x.code === l.code);
    out.set(l.code, { code: l.code, title: l.title, subject: l.subject, goalArea: l.goalArea, subtopic: l.subtopic, standards: l.standards, families: l.families, skillNames: l.skillNames.length ? l.skillNames : t?.skillNames ?? [], summary: t?.summary ?? "", ready: true });
  }
  for (const t of topics) if (!out.has(t.code)) out.set(t.code, { code: t.code, title: t.title, subject: t.subject, goalArea: t.goalArea, subtopic: t.subtopic, standards: t.standards, families: t.families, skillNames: t.skillNames, summary: t.summary, ready: false });
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// ------------------------------------------------------------------ curriculum words

export interface SelectionRef { grade: number; unit: number; number: number; name: string; key: string; vocabulary: string[]; textIdea: string | null }
export const selectionKey = (grade: number, unit: number, number: number) => `${grade}|${unit}|${number}`;
export const wordKey = (sel: string, word: string) => `${sel}|${word.trim().toLowerCase()}`;
/** "Grade 4 · Unit 1 · A World of Change" */
export const selectionLabel = (x: { grade: number; unit: number; name: string }) => `Grade ${x.grade} · Unit ${x.unit} · ${x.name}`;

/** Every Curriculum Map selection (Grades 4–6) with its vocabulary words, in book order. */
export function curriculumSelections(): SelectionRef[] {
  const out: SelectionRef[] = [];
  for (const [g, list] of Object.entries(allLessonDetails())) {
    for (const d of Object.values(list)) out.push({ grade: Number(g), unit: d.unit, number: d.number, name: d.name, key: selectionKey(Number(g), d.unit, d.number), vocabulary: d.vocabulary ?? [], textIdea: d.textIdea ?? null });
  }
  return out.sort((a, b) => a.grade - b.grade || a.unit - b.unit || a.number - b.number);
}

interface WordRead { sig: string; cards: Map<string, WordCard>; invalid: { file: string; problems: string[] }[] }
const wordCache = new IdleBox<WordRead>("learn.words");
/** The explained words of every data/learn/words/G*.json, by word key "<grade>|<unit>|<number>|<word>". */
export function readWordFiles(): WordRead {
  const dir = join(learnDir(), "words");
  let files: string[] = [];
  try { files = existsSync(dir) ? readdirSync(dir).filter((f) => /^G\d{1,2}\.json$/.test(f)).sort() : []; } catch { files = []; }
  const sig = files.map((f) => `${f}:${fileSig(join(dir, f))}`).join("|");
  const kw = wordCache.get();
  if (kw && kw.sig === sig) return kw;
  const out: WordRead = { sig, cards: new Map(), invalid: [] };
  for (const f of files) {
    let raw: { grade?: unknown; selections?: unknown };
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as typeof raw; } catch (e) { out.invalid.push({ file: f, problems: [`invalid JSON: ${(e as Error).message.slice(0, 120)}`] }); continue; }
    const grade = Number(raw?.grade);
    const problems: string[] = [];
    for (const sel of Array.isArray(raw?.selections) ? (raw.selections as Record<string, unknown>[]) : []) {
      const key = selectionKey(grade, Number(sel.unit), Number(sel.number));
      for (const w of Array.isArray(sel.words) ? (sel.words as Record<string, unknown>[]) : []) {
        const p = checkWordCard(w, `${key} ${s(w?.word)}`);
        if (p.length) { problems.push(...p); continue; }
        const card: WordCard = { word: s(w.word).trim(), pos: s(w.pos).trim(), meaning: s(w.meaning).trim(), example: s(w.example).trim(), arabic: s(w.arabic).trim(), synonyms: (w.synonyms as unknown[]).map(s), antonyms: (w.antonyms as unknown[]).map(s), family: (w.family as unknown[]).map(s), check: w.check as WordCard["check"] };
        out.cards.set(wordKey(key, card.word), card);
      }
    }
    if (problems.length) out.invalid.push({ file: f, problems: problems.slice(0, 20) });
  }
  return wordCache.set(out);
}
