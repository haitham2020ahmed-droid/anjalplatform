/**
 * 🚀 ReadRise for students: the article library and the 5-step routine (Achieve3000-like).
 *
 *  Library   published articles of the platform library (schoolId null) + the student's own school, minus the
 *            school's hidden list (SchoolSetting "readrise.hidden"). Teacher-assigned (RRClassArticle of the
 *            student's classes) first, then "Recommended for you" (topics not read lately, a variety of topics).
 *  Routine   one RRRun per reading: PREPOLL → READ → QUIZ → WRITE → POSTPOLL → DONE, strictly in order, resumable.
 *            The version is chooseVersion(level, versions): the version whose MEASURED level (official measure, else
 *            the cached estimate RRVersion.estLevel) best fits the student's level; its question band is bandOf(version).
 *  Scoring   on the server. FIRST-TRY rule: only the first scored reading of an article counts (score, level,
 *            goals); later re-reads have firstTry = false. After submitting, every answer's "why" is shown and a
 *            practice pass is allowed that never changes the score.
 *  Stretch   the same article one version higher (stretch = true): never lowers the level. Round 4 (owner): ONLY the
 *            first try counts — a re-read is practice (never the level, goal, window or stars). Round 5 (owner): after a
 *            RELIABLE first try of 75%+ a stretch is ALWAYS offered while a higher version exists (stretchOffer below):
 *            with the article's stretch set ("S-L/M/H", 4 new questions) or in a new band it counts fully; in the same
 *            band without a set it is practice (weekly goal only — one credit per article).
 *  Status    ONE article status (first-try.ts articleStatus): New / In progress / Finish steps 4–5 / Done.
 *  completedAt = when the activity (step 3) was scored — the moment the reading "counts". step = DONE when all
 *  5 steps are finished.
 *  Accuracy  owner r69 (accuracy.ts): the reader sends when each question was first answered; 2+ rapid guesses make
 *            the run Unreliable (teacher-only): it never moves the level, never counts toward the goal and never feeds
 *            the skills. Careful answers feed the skill stars through the skill-status hook, after the response.
 */
import { feedReadRise, safeFeed } from "../practice/skill-evidence";
import { runAfterResponse } from "../lib/after-response";
import { aiEnv } from "../ai/env";
import { draftReadRiseWritingScore } from "./writing-ai";
import { onSkillAnswer } from "../skills/status";
import { alertMapGap, alertStuckUnreliable, rapidAnswers } from "./accuracy";
import { loadReadRiseWindows, placementChecks, type RRPeriod } from "./windows";
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { LIBRARY_LEVELS, bandOf, chooseVersion, measuredLevel, stretchAbove, type MeasuredVersion, type RRBand } from "./level";
import { ENGINE, applyFirstTryScore, ensureRRStudent, goalDates, goalStats, levelHistory, levelWindow, readRisePlaced, readsToMoveUp, s, studentReadRiseSummary, toDate, yearEndFor, type GoalStats, type ReadRiseSummary } from "./engine";
import { articleStatus, baseBand, firstTryRun, isFirst, isStretch, isUnreliableRun, rapidRead, stretchCountsFully, stretchSetBand, type ArticleStatus } from "./first-try";
import { activeCancels } from "../student/cancelled-work";
import { readNext, recommendFor, type RecommendReason } from "./recommend";
import { getInterests } from "./interests";
import { carryKeyWords, wordWarmup, type WarmupQ } from "./words-carry";
import { placementStatus } from "./placement";
import { loadPlacementPassages, type PlacementPassage } from "./content-loader";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { cleanAnnotations, keyWordFor, minutesFor, tokenize, type Annotation, type KeyWord } from "../../components/readrise/text";
import { sweptWeakMap } from "../cache/idle";
import { startedBy } from "../../lib/assign-dates";

export const STEPS = ["PREPOLL", "READ", "QUIZ", "WRITE", "POSTPOLL", "DONE"] as const;
export type RunStep = (typeof STEPS)[number];
export const MIN_WRITING_WORDS = 30;
const LETTERS = ["A", "B", "C", "D"];
const DAY = 86_400_000;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function studentOf(actor: Actor): { studentId: string; schoolId: string } {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Only students read in ReadRise.");
  return { studentId: actor.studentId, schoolId: actor.schoolId };
}

// ------------------------------------------------------------------ visibility

/** Article ids a school has hidden (SchoolSetting "readrise.hidden": [ids] or { ids: [ids] }). */
export async function hiddenArticleIds(repo: Repo, schoolId: string): Promise<Set<string>> {
  const row = await repo.findUnique("SchoolSetting", { schoolId, key: "readrise.hidden" });
  const v = row?.value as unknown;
  const ids = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { ids?: unknown }).ids) ? (v as { ids: unknown[] }).ids : [];
  return new Set(ids.map(String));
}

/** the article columns students' lists use (not the poll text) and the version columns a card needs (not the text) */
const CARD_ARTICLE_COLS = ["id", "schoolId", "code", "title", "topic", "summary", "status"];
const CARD_VERSION_COLS = ["articleId", "level", "title", "wordCount", "estLevel", "officialLexile"];
interface Catalog { arts: Row[]; versions: Map<string, Row[]> }
const catalogCache = sweptWeakMap<{ v: string; at: number; p: Promise<Catalog> }>("readrise.student.catalogCache", 2 * 60_000);
const CATALOG_MODELS = ["RRArticle", "RRVersion"];

/**
 * ⚡ The published articles of the platform library (schoolId null) or of one school, with their versions' card
 * columns. The same for every student, so it is kept in memory per data source until a write to RRArticle /
 * RRVersion in this process (import, publish, delete, a new library file) and for at most a minute (another
 * process may change them). Rows are shared: callers never change them.
 */
function publishedCatalog(repo: Repo, schoolId: string | null): Promise<Catalog> {
  let m = catalogCache.get(repo); if (!m) catalogCache.set(repo, (m = new Map()));
  const key = schoolId ?? "", v = modelVersion(...CATALOG_MODELS), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async (): Promise<Catalog> => {
    const arts = await repo.findMany("RRArticle", { schoolId, status: "PUBLISHED", deletedAt: null }, { select: CARD_ARTICLE_COLS });
    const versions = new Map<string, Row[]>();
    if (arts.length) for (const r of await repo.findMany("RRVersion", { articleId: { in: arts.map((a) => s(a.id)) } }, { select: CARD_VERSION_COLS })) {
      const l = versions.get(s(r.articleId)); if (l) l.push(r); else versions.set(s(r.articleId), [r]);
    }
    return { arts, versions };
  })();
  remember(m, key, { v, at: Date.now(), p }, 64);
  p.catch(() => m!.delete(key));
  return p;
}

/** Published articles a school's students can read (minus the school's hidden ones), with their versions. */
async function visibleCatalog(repo: Repo, schoolId: string): Promise<Catalog> {
  const [lib, own, hidden] = await Promise.all([publishedCatalog(repo, null), publishedCatalog(repo, schoolId), hiddenArticleIds(repo, schoolId)]);
  const arts = [...lib.arts, ...own.arts].filter((a) => !hidden.has(s(a.id)));
  return { arts, versions: new Map([...lib.versions, ...own.versions]) };
}

/** Published, not deleted articles a school's students can read (list columns: id, code, title, topic, summary). */
export async function visibleArticles(repo: Repo, schoolId: string): Promise<Row[]> {
  return (await visibleCatalog(repo, schoolId)).arts.map((a) => ({ ...a }));
}

async function visibleArticle(repo: Repo, schoolId: string, articleId: string): Promise<Row> {
  const a = await repo.findUnique("RRArticle", { id: articleId });
  if (!a || a.deletedAt || a.status !== "PUBLISHED" || (a.schoolId !== null && a.schoolId !== undefined && a.schoolId !== schoolId) || (await hiddenArticleIds(repo, schoolId)).has(articleId)) throw new ForbiddenError("Article not found.");
  return a;
}

// ------------------------------------------------------------------ library

export interface ArticleCard {
  id: string; title: string; topic: string; summary: string; minutes: number;
  /** the version the student reads now (chooseVersion) */
  versionLevel: number;
  /** round 5: that version's MEASURED difficulty (shown small: "text ≈1390") */
  textLevel?: number;
  /** round 5: the version the first try actually READ (a finished card shows it), null before a first try */
  readLevel?: number | null;
  /** round 5: the ONE article status (first-try.ts articleStatus) */
  status: ArticleStatus; firstTryScore: number | null; canStretch: boolean; stretchDone: boolean;
  assigned: boolean; dueAt: string | null;
  /** round 5: when the first try's activity was scored (the Finished shelf, newest first) */
  finishedAt?: string | null;
  /** round 5: why it is recommended (recommend.ts: show it with reasonLabel) */
  reason?: RecommendReason | null;
}
export interface Library {
  level: number;
  /** ⏳ the first try is open (IN_PROGRESS / FINISH_STEPS) */
  continueReading: ArticleCard[];
  /** 📌 assigned by the teacher (started, not cancelled), not done */
  assigned: ArticleCard[];
  /** ✨ recommend.ts recommendFor (never a future-start assigned article) */
  recommended: ArticleCard[];
  /** ✅ DONE, newest first */
  finished: ArticleCard[];
  /** 📚 every visible article matching the search / topic — one page (LIBRARY_PAGE_SIZE) */
  all: ArticleCard[];
  /** matching articles in all (every page) */
  total: number; page: number; pages: number;
  topics: string[]; query: string; topic: string;
}
export const LIBRARY_PAGE_SIZE = 24;
export interface LibraryFilter { q?: string; topic?: string; page?: number }

/**
 * The RRClassArticle ids cancelled for this student (Assigned page: AssignmentCancel kind READRISE, refId = the
 * class-article row, for everyone or for this one student, not restored). By ROW, so a cancel in one class never
 * hides the same article given in another class.
 */
async function cancelledClassArticles(repo: Repo, studentId: string, schoolId: string): Promise<Set<string>> {
  const rows = (await activeCancels(repo, schoolId)).filter((r) => r.kind === "READRISE" && (!r.studentId || s(r.studentId) === studentId));
  return new Set(rows.map((r) => s(r.refId)));
}

const iso = (v: unknown): string | null => { if (!v) return null; const d = toDate(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };

export async function studentLibrary(repo: Repo, actor: Actor, filter: LibraryFilter = {}, now = new Date()): Promise<Library> {
  const { studentId, schoolId } = studentOf(actor);
  // independent reads in parallel; the article catalog is cached (the same for every student)
  const [rr, { arts, versions }, runs, mems, cancelled] = await Promise.all([
    ensureRRStudent(repo, studentId, now),
    visibleCatalog(repo, schoolId),
    repo.findMany("RRRun", { studentId }, { select: ["articleId", "band", "versionLevel", "step", "score", "firstTry", "stretch", "completedAt", "startedAt", "unreliable", "readSeconds"] }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
    cancelledClassArticles(repo, studentId, schoolId).catch(() => new Set<string>()),
  ]);
  const level = Number(rr.level);
  const visible = new Set(arts.map((a) => s(a.id)));
  // the classes' assigned articles (few rows), kept to the visible ones: no list of every article id in the query.
  // Round 5: a cancelled class-article ROW (Assigned page: AssignmentCancel.refId = RRClassArticle.id, for everyone
  // or for this student) is not assigned any more — the same article still open in another class stays; one that starts
  // later is not shown (and never recommended) before its start date
  const given = mems.length && arts.length ? (await repo.findMany("RRClassArticle", { classId: { in: mems.map((m) => s(m.classId)) } }, { select: ["id", "articleId", "dueAt", "startAt"] })).filter((r) => visible.has(s(r.articleId)) && !cancelled.has(s(r.id))) : [];
  const assignedRows = given.filter((r) => startedBy(r.startAt, now));
  const future = new Set(given.filter((r) => !startedBy(r.startAt, now)).map((r) => s(r.articleId)));
  for (const r of assignedRows) future.delete(s(r.articleId)); // also given (started) in another class: it is assigned now
  const runsBy = new Map<string, Row[]>();
  for (const r of runs) { const l = runsBy.get(s(r.articleId)); if (l) l.push(r); else runsBy.set(s(r.articleId), [r]); }
  const due = new Map<string, Date | null>();
  for (const r of assignedRows) {
    const d = r.dueAt ? toDate(r.dueAt) : null, prev = due.get(s(r.articleId));
    due.set(s(r.articleId), prev === undefined ? d : prev && d ? (d < prev ? d : prev) : prev ?? d);
  }
  const cards: ArticleCard[] = [];
  const startedAt = new Map<string, number>();
  for (const a of arts) {
    const vs = versions.get(s(a.id)) ?? [];
    if (!vs.length) continue;
    const vl = chooseVersion(level, asMeasured(vs));
    const v = vs.find((x) => Number(x.level) === vl)!;
    const mine = runsBy.get(s(a.id)) ?? [];
    // round 5: ONE status (first-try.ts articleStatus) — from the first try only; re-reads and stretches never change it
    const status = articleStatus(mine);
    const first = firstTryRun(mine);
    if (first) startedAt.set(s(a.id), toDate(first.startedAt).getTime() || 0);
    // r85 audit: no score from an Unreliable (2+ rapid-guess) run on the tile
    const scored = first && first.score !== null && first.score !== undefined && !isUnreliableRun(first) ? first : null;
    const open = mine.some((r) => r.step !== "DONE");
    const stretchDone = mine.some((r) => isStretch(r) && r.step === "DONE");
    const offer = stretchOffer(mine, level, asMeasured(vs));
    const readV = first ? vs.find((x) => Number(x.level) === Number(first.versionLevel)) : null;
    cards.push({
      id: s(a.id), title: s((status === "DONE" && readV ? readV : v).title) || s(a.title), topic: s(a.topic), summary: s(a.summary),
      minutes: minutesFor(Number((status === "DONE" && readV ? readV : v).wordCount) || 0), versionLevel: vl,
      textLevel: Math.round(measuredLevel({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile }) / 10) * 10,
      readLevel: first ? Number(first.versionLevel) || null : null,
      status, firstTryScore: scored ? Number(scored.score) : null,
      // round 5: the one stretch rule (stretchOffer): a reliable first try of 75%+ → always, while a higher version exists
      canStretch: status === "DONE" && !stretchDone && !open && offer.ok, stretchDone,
      assigned: due.has(s(a.id)), dueAt: due.get(s(a.id))?.toISOString() ?? null,
      finishedAt: status === "DONE" && first ? iso(first.completedAt) : null,
    });
  }
  const topics = [...new Set(cards.map((c) => c.topic))].filter(Boolean).sort();
  const q = (filter.q ?? "").trim().toLowerCase(), topic = (filter.topic ?? "").trim();
  const titleOf = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const match = (c: ArticleCard) => (!topic || c.topic === topic) && (!q || `${c.title} ${c.topic} ${c.summary}`.toLowerCase().includes(q) || (titleOf.get(c.id) ?? "").toLowerCase().includes(q));
  const byTitle = (a: ArticleCard, b: ArticleCard) => a.title.localeCompare(b.title);
  const filtered = Boolean(q || topic);
  const continueReading = cards.filter((c) => (c.status === "IN_PROGRESS" || c.status === "FINISH_STEPS") && match(c)).sort((a, b) => (startedAt.get(b.id) ?? 0) - (startedAt.get(a.id) ?? 0) || byTitle(a, b));
  const assigned = cards.filter((c) => c.assigned && c.status !== "DONE" && match(c)).sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || byTitle(a, b));
  const finished = cards.filter((c) => c.status === "DONE" && match(c)).sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "") || byTitle(a, b));
  const recommended = filtered ? [] : await recommendedCards(repo, studentId, schoolId, cards.filter((c) => !future.has(c.id)), runs, arts, now);
  const ORDER: ArticleStatus[] = ["IN_PROGRESS", "FINISH_STEPS", "NEW", "DONE"];
  const every = cards.filter(match).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || byTitle(a, b));
  const pages = Math.max(1, Math.ceil(every.length / LIBRARY_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(filter.page) || 1)));
  const all = every.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE);
  return { level, continueReading, assigned, recommended, finished, all, total: every.length, page, pages, topics, query: filter.q ?? "", topic };
}

/**
 * ✨ "Recommended for you" through recommend.ts recommendFor (each card with its reason); when it cannot answer, the
 * simple local rule (unread, topics not read lately). `cards` never holds a future-start assigned article.
 */
async function recommendedCards(repo: Repo, studentId: string, schoolId: string, cards: ArticleCard[], runs: Row[], arts: Row[], now: Date, take = 6): Promise<ArticleCard[]> {
  const byId = new Map(cards.map((c) => [c.id, c]));
  try {
    const picks = await recommendFor(repo, studentId, schoolId, cards.map((c) => ({ id: c.id, topic: c.topic, status: c.status === "FINISH_STEPS" ? "IN_PROGRESS" as const : c.status, assigned: c.assigned, dueAt: c.dueAt })), now, take);
    const out: ArticleCard[] = [];
    for (const p of picks) { const c = byId.get(s(p.articleId)); if (c && !out.some((x) => x.id === c.id)) out.push({ ...c, reason: p.reason ?? null }); }
    return out.slice(0, take);
  } catch {
    return recommend(cards.filter((c) => !c.assigned && c.status === "NEW"), runs, arts, now, take);
  }
}

/** "Recommended for you": unread articles, topics not read in the last 30 days first, one topic at a time. */
export function recommend(unread: ArticleCard[], runs: Row[], arts: Row[], now: Date, take = 6): ArticleCard[] {
  const topicOf = new Map(arts.map((a) => [s(a.id), s(a.topic)]));
  const recent = new Map<string, number>();
  for (const r of runs) {
    if (now.getTime() - toDate(r.startedAt).getTime() > 30 * DAY) continue;
    const t = topicOf.get(s(r.articleId)) ?? "";
    recent.set(t, (recent.get(t) ?? 0) + 1);
  }
  const byTopic = new Map<string, ArticleCard[]>();
  for (const c of [...unread].sort((a, b) => a.title.localeCompare(b.title))) byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c]);
  const order = [...byTopic.keys()].sort((a, b) => (recent.get(a) ?? 0) - (recent.get(b) ?? 0) || a.localeCompare(b));
  const out: ArticleCard[] = [];
  while (out.length < take && order.some((t) => byTopic.get(t)!.length)) for (const t of order) { const c = byTopic.get(t)!.shift(); if (c && out.length < take) out.push(c); }
  return out;
}

// ------------------------------------------------------------------ the routine

export interface QuestionView { number: number; stem: string; options: string[]; skill: string }
export interface Review { number: number; chosen: string | null; answer: string; correct: boolean; why: string; wrongWhy: string | null }
export interface DoneView {
  score: number | null; firstTry: boolean; stretch: boolean; levelBefore: number; levelAfter: number; goal: GoalStats; canStretch: boolean; prePoll: number | null; postPoll: number | null;
  /** owner r69: some answers were too fast to be read, so this reading did not count (a gentle "take your time") */
  tooFast?: boolean;
  /** round 4: why there is no stretch for this article; null = it can stretch */
  stretchWhy?: string | null;
  /** round 5: which reading this was — the first try, a practice re-read or the stretch (the heading) */
  kind?: "FIRST" | "REREAD" | "STRETCH";
  /** round 5: read faster than RR_MIN_READ_SECONDS: it did not count (goal, articles read, level) */
  readTooFast?: boolean;
  /** round 5: how the offered stretch counts (FULL = new questions, PRACTICE = weekly goal only) */
  stretchMode?: StretchMode | null;
  /** round 5: for a stretch run — how THIS stretch counted */
  stretchCounted?: StretchMode | null;
  /** round 5: 📖 the next article to read (recommend.ts readNext) */
  readNext?: { articleId: string; title: string; reason: RecommendReason; stretch: boolean } | null;
  /** round 5: 🗂 key words saved to My Words when the first try was finished (only right after the last step) */
  wordsSaved?: number | null;
}
export interface RunView {
  runId: string; articleId: string; step: RunStep; stretch: boolean; firstTry: boolean; versionLevel: number; /** the question band — round 5: a stretch run may use a stretch set ("S-L" / "S-M" / "S-H") */ band: RRBand | string;
  title: string; topic: string; poll: string; prePoll: number | null; postPoll: number | null;
  body: string; keyWords: KeyWord[]; annotations: Annotation[]; readSeconds: number; listened: boolean;
  questions: QuestionView[]; score: number | null; answers: Record<string, string> | null; review: Review[] | null;
  prompt: string; checklist: string[]; writing: string; writingScore: number | null; writingComment: string | null;
  /** ✍️ owner r##: a curated model (strong) answer to the writing prompt — only sent once the student has
   * submitted their OWN writing (never before: showing it earlier would let a student just copy it instead of
   * thinking). null when the article has none yet, or the student has not written their answer. */
  modelAnswer: string | null;
  done: DoneView | null;
  /** round 5: an optional, unscored word warm-up (2 quick questions) before reading — only on the key-words step */
  warmup?: WarmupQ[];
}

const asKeyWords = (v: unknown): KeyWord[] => (Array.isArray(v) ? v : []).filter((k) => k && typeof k === "object" && (k as KeyWord).word).map((k) => ({ word: s((k as KeyWord).word), partOfSpeech: s((k as KeyWord).partOfSpeech), definition: s((k as KeyWord).definition), example: s((k as KeyWord).example) }));

/** The band's key words; when the band has none, other bands' key words that appear in this text. */
export async function keyWordsFor(repo: Repo, articleId: string, band: string, body: string): Promise<KeyWord[]> {
  const prompts = await repo.findMany("RRPrompt", { articleId });
  const own = asKeyWords(prompts.find((p) => p.band === band)?.keyWords);
  if (own.length) return own;
  const tokens = tokenize(body).flat().map((t) => t.text);
  const seen = new Set<string>();
  return prompts.flatMap((p) => asKeyWords(p.keyWords)).filter((k) => !seen.has(k.word.toLowerCase()) && (seen.add(k.word.toLowerCase()), tokens.some((t) => keyWordFor(t, [k]))));
}

async function questionsOf(repo: Repo, articleId: string, band: string): Promise<Row[]> {
  return (await repo.findMany("RRQuestion", { articleId, band })).sort((a, b) => Number(a.number) - Number(b.number));
}

function explain(q: Row, chosen: string | null): { why: string; wrongWhy: string | null } {
  const r = (q.rationale && typeof q.rationale === "object" ? q.rationale : {}) as Record<string, unknown>;
  const answer = s(q.answer);
  const wrong = (r.wrong && typeof r.wrong === "object" ? r.wrong : {}) as Record<string, unknown>;
  const why = s(r[answer] ?? r.why ?? "");
  const wrongWhy = chosen && chosen !== answer ? s(r[chosen] ?? wrong[chosen] ?? "") || null : null;
  return { why, wrongWhy };
}

/** Scores answers on the server (questions in number order). */
export function scoreAnswers(questions: Row[], answers: Record<string, string>): { correct: number; total: number; pct: number; review: Review[] } {
  const review = questions.map((q) => {
    const chosen = answers[String(q.number)] ? String(answers[String(q.number)]).toUpperCase() : null;
    const ok = chosen === s(q.answer);
    return { number: Number(q.number), chosen, answer: s(q.answer), correct: ok, ...explain(q, chosen) };
  });
  const correct = review.filter((r) => r.correct).length;
  return { correct, total: questions.length, pct: questions.length ? Math.round((100 * correct) / questions.length) : 0, review };
}

function cleanAnswers(raw: Record<string, unknown>, questions: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const v = String(raw?.[String(q.number)] ?? "").trim().toUpperCase();
    if (!LETTERS.includes(v)) throw new ValidationError("Answer every question first.");
    out[String(q.number)] = v;
  }
  return out;
}

async function ownRun(repo: Repo, actor: Actor, runId: string): Promise<Row> {
  const { studentId } = studentOf(actor);
  const r = await repo.findUnique("RRRun", { id: runId });
  if (!r || r.studentId !== studentId) throw new ForbiddenError("Reading not found.");
  return r;
}

function expectStep(run: Row, step: RunStep): void {
  if (run.step !== step) throw new ValidationError("Please finish the steps in order. Reload the page to continue where you left off.");
}

/** The stretch version for a level: the next version above the student's version, or null. */
export function stretchVersion(level: number, available: (number | MeasuredVersion)[]): number | null {
  const vs = available.map((v) => (typeof v === "number" ? { level: v } : v));
  return stretchAbove(chooseVersion(level, vs), vs.map((v) => Number(v.level)));
}
const asMeasured = (rows: Row[]): MeasuredVersion[] => rows.map((v) => ({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile }));
const MEASURE_COLS = ["level", "estLevel", "officialLexile"];

/** How a stretch counts (round 5): FULL = new questions (a stretch set, or a new band); PRACTICE = the same questions. */
export type StretchMode = "FULL" | "PRACTICE";
export interface StretchOfferResult {
  ok: boolean; up: number | null; why: string | null;
  /** the question band the stretch run uses: a stretch set ("S-H" …) or the version's band */
  band?: string | null;
  mode?: StretchMode | null;
}

/**
 * 🎯 Round 5 (owner): may this article be stretched now? The same rule for the library card, the article page, the
 * done screen and the server (startRun). After a RELIABLE first try (not a re-read, not Unreliable) of 75%+, once,
 * a stretch is ALWAYS offered when a higher version exists. How it counts:
 *   - the article has a stretch set for the higher version's band (`stretchBands` holds "S-L" / "S-M" / "S-H") →
 *     the stretch uses those 4 NEW questions and counts fully (level window, weekly goal, stars);
 *   - else a band different from the first read's → that band's questions, counts fully (the round 4 rule);
 *   - else (same band, no set) → the band's questions again, as PRACTICE: the weekly goal only (one credit per
 *     article: first-try.ts goalRuns), never the level or the stars.
 * `runs` = the student's runs of this article (columns: band, versionLevel, step, score, firstTry, stretch, unreliable).
 */
export function stretchOffer(runs: readonly Row[], level: number, versions: MeasuredVersion[], stretchBands: ReadonlySet<string> = new Set()): StretchOfferResult {
  const no = (why: string): StretchOfferResult => ({ ok: false, up: null, why, band: null, mode: null });
  if (runs.some((r) => isStretch(r))) return no("You already stretched this article.");
  const first = firstTryRun(runs);
  if (!first || !isFirst(first) || first.step !== "DONE" || first.score === null || first.score === undefined) return no("Read the article first, then stretch it.");
  if (isUnreliableRun(first)) return no("Your first reading did not count (some answers came too fast), so it cannot unlock a stretch. Try a new article.");
  if (Number(first.score) < ENGINE.up) return no(`Score ${ENGINE.up}% or higher on this article first, then you can stretch it.`);
  // the stretch is one version above the HIGHER of today's version and the version the first try READ (after a level
  // drop, today's version may be lower: a "stretch" must never be the same or an easier text)
  const read = Number(first.versionLevel);
  const base = Math.max(chooseVersion(level, versions), Number.isFinite(read) && read > 0 ? read : 0);
  const up = stretchAbove(base, versions.map((v) => Number(v.level)));
  if (up === null) return no("There is no higher version of this article.");
  const vb = bandOf(up), set = stretchSetBand(vb);
  if (stretchBands.has(set)) return { ok: true, up, why: null, band: set, mode: "FULL" };
  return { ok: true, up, why: null, band: vb, mode: stretchCountsFully(s(first.band), vb) ? "FULL" : "PRACTICE" };
}

/** The stretch-set bands ("S-L" / "S-M" / "S-H") an article has questions for. */
export async function stretchBandsOf(repo: Repo, articleId: string): Promise<Set<string>> {
  const rows = await repo.findMany("RRQuestion", { articleId, band: { in: ["S-L", "S-M", "S-H"] } }, { select: ["band"] });
  return new Set(rows.map((r) => s(r.band)));
}

async function goalFor(repo: Repo, studentId: string, now: Date): Promise<GoalStats> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  const runs = await repo.findMany("RRRun", { studentId, firstTry: true, score: { not: null } }, { select: ["studentId", "articleId", "band", "firstTry", "stretch", "score", "completedAt", "unreliable", "readSeconds"] });
  // round 5: one credit per article (its first try OR its stretch), never a re-read, an Unreliable or a too-fast run
  return goalStats(goalDates(runs), Number(rr?.weeklyGoal ?? 2), now);
}

/** Everything the reader needs for one run (answers hidden until the activity is scored). */
export async function runView(repo: Repo, actor: Actor, runId: string, now = new Date(), extra: { wordsSaved?: number | null } = {}): Promise<RunView> {
  const run = await ownRun(repo, actor, runId);
  const articleId = s(run.articleId);
  // round 5: a stretch run may use the article's stretch set ("S-H" …): its questions by the run's band, its prompt
  // and key words by the band it belongs to (first-try.ts baseBand)
  const band = baseBand(run.band);
  const [art, ver, prompt, qs] = await Promise.all([
    repo.findUnique("RRArticle", { id: articleId }),
    repo.findUnique("RRVersion", { articleId, level: Number(run.versionLevel) }),
    repo.findUnique("RRPrompt", { articleId, band }),
    questionsOf(repo, articleId, s(run.band)),
  ]);
  const version = ver, pr = prompt;
  const body = s(version?.body);
  const scored = run.score !== null && run.score !== undefined;
  const answers = scored && run.answers && typeof run.answers === "object" ? (run.answers as Record<string, string>) : null;
  let done: DoneView | null = null;
  const keyWords = keyWordsFor(repo, articleId, band, body); // read alongside the rest
  keyWords.catch(() => undefined); // (awaited below; never an unhandled rejection meanwhile)
  // 🔤 round 5: the optional word warm-up, only before reading starts (the key-words step), never scored
  const warmup: Promise<WarmupQ[]> = run.step === "READ" && !Number(run.readSeconds ?? 0)
    ? wordWarmup(repo, s(run.studentId), now).then((w) => (Array.isArray(w) ? w.slice(0, 2) : [])).catch(() => [])
    : Promise.resolve([]);
  if (run.step === "DONE") {
    const studentId = s(run.studentId);
    const [vers, rr, mine, goal, sets] = await Promise.all([
      repo.findMany("RRVersion", { articleId }, { select: MEASURE_COLS }),
      ensureRRStudent(repo, studentId, now),
      repo.findMany("RRRun", { studentId, articleId }, { select: ["id", "band", "versionLevel", "step", "score", "firstTry", "stretch", "unreliable", "startedAt"] }),
      goalFor(repo, studentId, now),
      stretchBandsOf(repo, articleId),
    ]);
    const isStretchRun = run.stretch === true;
    const offer: StretchOfferResult = isStretchRun ? { ok: false, up: null, why: null } : stretchOffer(mine, Number(rr.level), asMeasured(vers), sets);
    const firstBand = mine.find((r) => isFirst(r) && !isStretch(r))?.band;
    const kind: DoneView["kind"] = isStretchRun ? "STRETCH" : run.firstTry === true ? "FIRST" : "REREAD";
    let next: DoneView["readNext"] = null;
    try {
      const n = await readNext(repo, studentId, s(run.schoolId), { articleId, score: scored ? Number(run.score) : 0, firstTry: run.firstTry === true, stretch: isStretchRun, band: s(run.band), canStretch: offer.ok }, now);
      next = n ? { articleId: s(n.articleId), title: s(n.title), reason: n.reason, stretch: Boolean(n.stretch) } : null;
    } catch { next = null; }
    done = {
      score: scored ? Number(run.score) : null, firstTry: run.firstTry === true, stretch: isStretchRun,
      levelBefore: Number(run.levelBefore), levelAfter: Number(run.levelAfter ?? run.levelBefore), goal,
      // ⬆ round 5: the one stretch rule (stretchOffer): a reliable first try of 75%+ → always, while a higher version exists
      canStretch: offer.ok, stretchWhy: offer.ok ? null : offer.why, stretchMode: offer.ok ? offer.mode ?? null : null,
      stretchCounted: isStretchRun ? (stretchCountsFully(firstBand ? s(firstBand) : null, s(run.band)) ? "FULL" : "PRACTICE") : null,
      prePoll: run.prePoll === null || run.prePoll === undefined ? null : Number(run.prePoll), postPoll: run.postPoll === null || run.postPoll === undefined ? null : Number(run.postPoll),
      tooFast: run.unreliable === true || run.unreliable === 1,
      kind, readTooFast: rapidRead(run), readNext: next, wordsSaved: extra.wordsSaved ?? null,
    };
  }
  return {
    runId: s(run.id), articleId, step: s(run.step) as RunStep, stretch: run.stretch === true, firstTry: run.firstTry === true,
    versionLevel: Number(run.versionLevel), band: s(run.band) as RRBand, title: s(version?.title) || s(art?.title), topic: s(art?.topic), poll: s(art?.pollStatement),
    prePoll: run.prePoll === null || run.prePoll === undefined ? null : Number(run.prePoll), postPoll: run.postPoll === null || run.postPoll === undefined ? null : Number(run.postPoll),
    body, keyWords: await keyWords, annotations: cleanAnnotations(run.annotations, tokenize(body).flat().length),
    readSeconds: Number(run.readSeconds ?? 0), listened: run.listened === true,
    questions: qs.map((q) => ({ number: Number(q.number), stem: s(q.stem), options: Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [], skill: s(q.skill) })),
    score: scored ? Number(run.score) : null, answers, review: answers ? scoreAnswers(qs, answers).review : null,
    prompt: s(pr?.prompt), checklist: Array.isArray(pr?.checklist) ? (pr!.checklist as unknown[]).map(String) : [],
    writing: s(run.writing), writingScore: run.writingScore === null || run.writingScore === undefined ? null : Number(run.writingScore), writingComment: run.writingComment ? s(run.writingComment) : null,
    // ✍️ only once the student submitted their OWN writing (run.writing is set) — never before, so it cannot be copied
    modelAnswer: s(run.writing).trim() && pr?.modelAnswer ? s(pr.modelAnswer) : null,
    done, warmup: await warmup,
  };
}

export interface ArticlePage {
  articleId: string; title: string; topic: string; summary: string; minutes: number; versionLevel: number; run: RunView | null; canStretch: boolean; hasRead: boolean; level: number;
  /** round 5: the ONE article status (first-try.ts articleStatus) */
  status?: ArticleStatus;
  /** round 5: the version's measured difficulty ("text ≈1390") */
  textLevel?: number;
  /** round 5: the first try's score and the version it READ (null before a first try) */
  firstTryScore?: number | null; readLevel?: number | null;
}

/** The article page: the open run (resume), else the latest finished run (done screen), else the start screen. */
export async function articlePage(repo: Repo, actor: Actor, articleId: string, now = new Date()): Promise<ArticlePage> {
  const { studentId, schoolId } = studentOf(actor);
  const art = await visibleArticle(repo, schoolId, articleId);
  // independent reads in parallel (after the visibility check)
  const [rr, vers, allRuns] = await Promise.all([
    ensureRRStudent(repo, studentId, now),
    repo.findMany("RRVersion", { articleId }, { select: [...MEASURE_COLS, "title", "wordCount"] }),
    repo.findMany("RRRun", { studentId, articleId }),
  ]);
  if (!vers.length) throw new ForbiddenError("Article not found.");
  const vl = chooseVersion(Number(rr.level), asMeasured(vers));
  const v = vers.find((x) => Number(x.level) === vl)!;
  const runs = allRuns.sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());
  const open = runs.find((r) => r.step !== "DONE");
  const latest = open ?? runs[0];
  const offer = stretchOffer(runs, Number(rr.level), asMeasured(vers));
  const first = firstTryRun(runs);
  return {
    articleId, title: s(v.title) || s(art.title), topic: s(art.topic), summary: s(art.summary), minutes: minutesFor(Number(v.wordCount) || 0), versionLevel: vl, level: Number(rr.level),
    run: latest ? await runView(repo, actor, s(latest.id), now) : null,
    // ⬆ round 5: the one stretch rule (stretchOffer)
    canStretch: !open && offer.ok,
    hasRead: runs.some((r) => r.step === "DONE"),
    status: articleStatus(runs),
    textLevel: Math.round(measuredLevel({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile }) / 10) * 10,
    firstTryScore: first && first.score !== null && first.score !== undefined && !isUnreliableRun(first) ? Number(first.score) : null,
    readLevel: first ? Number(first.versionLevel) || null : null,
  };
}

/**
 * 🔒 Round 5: one start at a time per student × article in this server process (a double tap / two tabs: the second
 * waits, then finds the run the first created). The RRStudent row lock in startRun covers other processes.
 */
const startQueue = new Map<string, Promise<unknown>>();
function oneAtATime<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = startQueue.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const tail = next.catch(() => undefined);
  startQueue.set(key, tail);
  void tail.then(() => { if (startQueue.get(key) === tail) startQueue.delete(key); });
  return next;
}

/** Starts a reading (or returns the open one). stretch = the same article one version higher (after reading it). */
export async function startRun(repo: Repo, actor: Actor, articleId: string, opts: { stretch?: boolean } = {}, now = new Date()): Promise<RunView> {
  const { studentId, schoolId } = studentOf(actor);
  await visibleArticle(repo, schoolId, articleId);
  await ensureRRStudent(repo, studentId, now);
  const id = await oneAtATime(`${studentId}|${articleId}`, () => repo.transaction(async (tx) => {
    // 🔒 round 5: serialise starts per student — the FIRST statement takes the RRStudent row lock, so a double tap or
    // a second tab waits here and then sees the run the first request created (never two stretch / first-try runs)
    await tx.updateMany("RRStudent", { studentId }, { updatedAt: now });
    const runs = await tx.findMany("RRRun", { studentId, articleId });
    const open = runs.find((r) => r.step !== "DONE");
    if (open) return s(open.id);
    const rr = await ensureRRStudent(tx, studentId, now);
    const level = Number(rr.level);
    const levels = asMeasured(await tx.findMany("RRVersion", { articleId }, { select: MEASURE_COLS }));
    if (!levels.length) throw new ForbiddenError("Article not found.");
    let versionLevel: number, band: string;
    if (opts.stretch) {
      // ⬆ round 5: the server's copy of the one stretch rule (never trust the button being hidden client-side): a
      // reliable first try of 75%+, once, while a higher version exists. The run's band = the questions it uses: the
      // article's stretch set ("S-H" …) when it has one for that band, else the version's band
      const offer = stretchOffer(runs, level, levels, await stretchBandsOf(tx, articleId));
      if (!offer.ok || offer.up === null) throw new ValidationError(offer.why ?? "This article cannot be stretched.");
      versionLevel = offer.up;
      band = offer.band ?? bandOf(versionLevel);
    } else { versionLevel = chooseVersion(level, levels); band = bandOf(versionLevel); }
    const firstTry = !runs.some((r) => (r.stretch === true) === Boolean(opts.stretch));
    const row = await tx.create("RRRun", {
      studentId, schoolId, articleId, versionLevel, band, step: "PREPOLL", levelBefore: level,
      firstTry, stretch: Boolean(opts.stretch), listened: false, startedAt: now,
    });
    return s(row.id);
  }));
  return runView(repo, actor, id, now);
}

const pollValue = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 3) throw new ValidationError("Choose one answer."); return n; };

/** Step 1: the before-reading poll. */
export async function submitPrePoll(repo: Repo, actor: Actor, runId: string, value: number, now = new Date()): Promise<RunView> {
  const run = await ownRun(repo, actor, runId);
  expectStep(run, "PREPOLL");
  await repo.updateMany("RRRun", { id: runId, step: "PREPOLL" }, { prePoll: pollValue(value), step: "READ" });
  return runView(repo, actor, runId, now);
}

export interface ReadingProgress { readSeconds?: number; listened?: boolean; annotations?: unknown }

async function readingPatch(repo: Repo, run: Row, p: ReadingProgress): Promise<Row> {
  const patch: Row = {};
  if (p.readSeconds !== undefined) patch.readSeconds = Math.max(Number(run.readSeconds ?? 0), Math.min(3 * 3600, Math.max(0, Math.round(Number(p.readSeconds) || 0))));
  if (p.listened) patch.listened = true;
  if (p.annotations !== undefined) {
    const ver = await repo.findUnique("RRVersion", { articleId: s(run.articleId), level: Number(run.versionLevel) });
    patch.annotations = cleanAnnotations(p.annotations, tokenize(s(ver?.body)).flat().length);
  }
  return patch;
}

/** Saves highlights/notes, reading time and read-aloud use (any step before DONE). */
export async function saveReading(repo: Repo, actor: Actor, runId: string, p: ReadingProgress): Promise<{ ok: true }> {
  const run = await ownRun(repo, actor, runId);
  if (run.step === "PREPOLL" || run.step === "DONE") throw new ValidationError("Reading is not open.");
  const patch = await readingPatch(repo, run, p);
  if (Object.keys(patch).length) await repo.updateMany("RRRun", { id: runId }, patch);
  return { ok: true };
}

/** Step 2 done: on to the activity. */
export async function finishReading(repo: Repo, actor: Actor, runId: string, p: ReadingProgress, now = new Date()): Promise<RunView> {
  const run = await ownRun(repo, actor, runId);
  expectStep(run, "READ");
  // quizAt: when the questions opened (the server's clock for the answer times, accuracy.ts)
  await repo.updateMany("RRRun", { id: runId, step: "READ" }, { ...(await readingPatch(repo, run, p)), step: "QUIZ", quizAt: now });
  return runView(repo, actor, runId, now);
}

/** The reader's answer times: question number → ms after the questions opened when it was first answered. */
export interface ActivityTiming { at?: Record<string, unknown> | null }

/**
 * Step 3: scores the 8 questions on the server. The first scored reading of an article moves the level — unless 2+
 * answers were rapid guesses (an Unreliable run: accuracy.ts), which never moves it.
 */
export async function submitActivity(repo: Repo, actor: Actor, runId: string, raw: Record<string, unknown>, now = new Date(), timing: ActivityTiming = {}): Promise<RunView> {
  let moved = false, studentId = "";
  await repo.transaction(async (tx) => {
    const run = await ownRun(tx, actor, runId);
    expectStep(run, "QUIZ");
    studentId = s(run.studentId);
    const [qs, ver] = await Promise.all([
      questionsOf(tx, s(run.articleId), s(run.band)),
      tx.findMany("RRVersion", { articleId: s(run.articleId), level: Number(run.versionLevel) }, { select: ["wordCount"], take: 1 }).then((r) => r[0]),
    ]);
    if (!qs.length) throw new ValidationError("This article has no questions yet.");
    const answers = cleanAnswers(raw, qs);
    const { pct } = scoreAnswers(qs, answers);
    // 🎯 rapid guesses (the practice rules): the first answer against the text's reading time, the others under 3 s
    const quizAt = run.quizAt ? toDate(run.quizAt).getTime() : NaN;
    const words = Number(ver?.wordCount) || 0;
    const fast = rapidAnswers({ at: timing?.at ?? null, numbers: qs.map((q) => Number(q.number)), readSeconds: Number(run.readSeconds ?? 0), words, serverMs: Number.isFinite(quizAt) ? now.getTime() - quizAt : null });
    const changed = await tx.updateMany("RRRun", { id: runId, step: "QUIZ" }, {
      answers, score: pct, completedAt: now, step: "WRITE",
      answerMs: { ms: fast.ms, rapid: fast.rapid }, rapidCount: fast.rapid.length, unreliable: fast.unreliable,
    });
    if (!changed) throw new ValidationError("Already submitted. Reload the page.");
    const rr = await ensureRRStudent(tx, s(run.studentId), now);
    let before = Number(rr.level), after = before;
    // first try counts; a stretch below 75% is ignored by the level (never lowers it); an Unreliable run never counts.
    // Round 4: a re-read never counts; a run read faster than RR_MIN_READ_SECONDS never counts (the skill-evidence
    // rule). Round 5: a stretch counts for the level only with NEW questions — its stretch set ("S-…") or a band
    // different from the first read's (first-try.ts stretchCountsFully); a same-band practice stretch: weekly goal only
    let counts = run.firstTry === true && !fast.unreliable && !rapidRead(run) && (run.stretch !== true || pct >= ENGINE.up);
    if (counts && run.stretch === true) {
      const base = (await tx.findMany("RRRun", { studentId: s(run.studentId), articleId: s(run.articleId), stretch: false, firstTry: true }, { select: ["band"], take: 1 }))[0];
      counts = stretchCountsFully(base ? s(base.band) : null, s(run.band));
    }
    if (counts) ({ levelBefore: before, levelAfter: after } = await applyFirstTryScore(tx, { ...run, score: pct, completedAt: now, unreliable: false }, now));
    moved = after !== before;
    await tx.updateMany("RRRun", { id: runId }, { levelBefore: before, levelAfter: after });
  });
  // 🔗 the careful answers also feed the skills they measure (main idea, inference, vocabulary in context …) and then
  // the skill stars through the skill-status hook — all after the response: the score and level are saved above
  runAfterResponse("readrise.skill_feed", () => safeFeed("readrise", async () => {
    const skills: string[] = [];
    await feedReadRise(repo, runId, now, (ids) => skills.push(...ids));
    for (const skillId of new Set(skills)) runAfterResponse("skills.status", () => onSkillAnswer(repo, studentId, skillId, now), { key: `skills.status|${studentId}|${skillId}` });
  }));
  // ⚖️ the level moved: ReadRise vs MAP far apart → one alert for the teacher
  if (moved) runAfterResponse("readrise.map_gap", () => alertMapGap(repo, studentId, now).catch(() => false), { key: `readrise.map_gap|${studentId}` });
  // 🚩 whether or not the level moved this time: a streak of runs that never counted → one alert for the teacher
  runAfterResponse("readrise.stuck", () => alertStuckUnreliable(repo, studentId, now).catch(() => false), { key: `readrise.stuck|${studentId}` });
  return runView(repo, actor, runId, now);
}

/** "Try again": a practice pass after scoring — shows what is right, never changes the score. */
export async function practiceActivity(repo: Repo, actor: Actor, runId: string, raw: Record<string, unknown>): Promise<{ correct: number; total: number; review: Review[] }> {
  const run = await ownRun(repo, actor, runId);
  if (run.score === null || run.score === undefined) throw new ValidationError("Submit the activity first.");
  const qs = await questionsOf(repo, s(run.articleId), s(run.band));
  const { correct, total, review } = scoreAnswers(qs, cleanAnswers(raw, qs));
  return { correct, total, review };
}

const cleanWriting = (t: string) => String(t ?? "").replace(/\r\n/g, "\n").slice(0, 6000);

/** Step 4 autosave. */
export async function saveWritingDraft(repo: Repo, actor: Actor, runId: string, text: string): Promise<{ ok: true }> {
  const run = await ownRun(repo, actor, runId);
  expectStep(run, "WRITE");
  await repo.updateMany("RRRun", { id: runId, step: "WRITE" }, { writing: cleanWriting(text) });
  return { ok: true };
}

/** Step 4: the thought question (at least 30 words), sent to the teacher for a 0–4 score. */
export async function submitWriting(repo: Repo, actor: Actor, runId: string, text: string, now = new Date()): Promise<RunView> {
  const run = await ownRun(repo, actor, runId);
  expectStep(run, "WRITE");
  const t = cleanWriting(text).trim();
  if (words(t) < MIN_WRITING_WORDS) throw new ValidationError(`Write at least ${MIN_WRITING_WORDS} words (you have ${words(t)}).`);
  // round 4: check-and-set — only the request that moves the run from WRITE wins; a second, concurrent submit gets
  // "Already submitted" and never queues a second AI draft
  const changed = await repo.updateMany("RRRun", { id: runId, step: "WRITE" }, { writing: t, step: "POSTPOLL" });
  if (!changed) throw new ValidationError("Already submitted. Reload the page.");
  // 🤖 draft an AI score + comment for the teacher's scoring screen (never shown to the student) — after the
  // response, so the student is never kept waiting on an AI call; silently skipped if AI is off/limited/fails.
  // Round 4: only for a first try (a re-read is practice: no AI draft is spent on it)
  if (run.firstTry === true) runAfterResponse("readrise.writing_ai", async () => {
    const pr = await repo.findUnique("RRPrompt", { articleId: s(run.articleId), band: baseBand(run.band) });
    await draftReadRiseWritingScore(
      repo, { schoolId: s(run.schoolId), runId, prompt: s(pr?.prompt), checklist: (pr?.checklist ?? []) as string[], text: t }, aiEnv(),
    ).catch(() => undefined);
  }, { key: `readrise.writing_ai|${runId}` });
  return runView(repo, actor, runId, now);
}

/** Step 5: the after-reading poll → DONE. */
export async function submitPostPoll(repo: Repo, actor: Actor, runId: string, value: number, now = new Date()): Promise<RunView> {
  const run = await ownRun(repo, actor, runId);
  expectStep(run, "POSTPOLL");
  const changed = await repo.updateMany("RRRun", { id: runId, step: "POSTPOLL" }, { postPoll: pollValue(value), step: "DONE" });
  // 🗂 round 5: a reliable, careful first try finished all 5 steps → its key words go to My Words (words-carry.ts)
  let wordsSaved: number | null = null;
  if (changed && run.firstTry === true && run.stretch !== true && !isUnreliableRun(run) && !rapidRead(run) && run.score !== null && run.score !== undefined) {
    try { wordsSaved = Number(await carryKeyWords(repo, s(run.studentId), s(run.articleId), baseBand(run.band), now)) || 0; } catch { wordsSaved = null; }
  }
  return runView(repo, actor, runId, now, { wordsSaved });
}

/** Levels a student can see ARTICLE versions for (for labels) — the library's full 300–1600 range (see level.ts). */
export const VERSION_LEVELS = LIBRARY_LEVELS;

// ------------------------------------------------------------------ the ReadRise home page

export interface ReadRiseHome {
  library: Library; summary: ReadRiseSummary;
  growth: { points: { at: string; level: number }[]; projected: number | null; yearEnd: string };
  /**
   * NEED = never placed and the test is ready; RETAKE = a teacher allowed a retake; OPEN = a test is half done;
   * CHECK = the middle / end of year reading check is open (owner r69: "Check your reading level").
   */
  placement: {
    state: "NONE" | "NEED" | "OPEN" | "RETAKE" | "CHECK"; result: number | null; /** r68: when the last placement was finished (the Placement test tab) */ doneAt?: string | null; /** the test's passages are on this server */ ready?: boolean;
    /** the reading check that is open now */
    due?: RRPeriod | null;
    /** this school year's reading checks: start → middle → end (null = not taken) */
    checks?: Record<RRPeriod, { level: number; at: string } | null>;
  };
  /** a real level (readRisePlaced): until then no level number is shown anywhere (the summary's level is a working start) */
  placed: boolean;
  /** not placed and the placement test is available: the articles stay locked until the placement is finished */
  locked: boolean;
  /**
   * round 5: the progress strip on the Articles tab — strong reads (75%+, counted) still needed to move up +50 (the
   * level window's 3-of-4 rule), the student's chosen topics (interests.ts) and every library topic (the picker)
   */
  progress?: { toMoveUp: number | null; step: number; interests: string[]; topics: string[] };
}

/**
 * 🔒 ReadRise articles are locked until the student finished the placement (or a teacher set the level), as long as
 * the placement test is available (5+ passages). Without the test the articles stay open, with no level number shown.
 */
export async function readRiseAccess(repo: Repo, studentId: string, passages: PlacementPassage[] = loadPlacementPassages()): Promise<{ placed: boolean; locked: boolean }> {
  const [rr, done] = await Promise.all([repo.findUnique("RRStudent", { studentId }), repo.count("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } })]);
  const placed = readRisePlaced(rr, done > 0);
  return { placed, locked: !placed && passages.length >= 5 };
}

/** Everything /student/readrise shows: level, goal, streak, growth + projection, placement prompt and the library. */
export async function readRiseHome(repo: Repo, actor: Actor, filter: LibraryFilter = {}, now = new Date(), passages: PlacementPassage[] = loadPlacementPassages()): Promise<ReadRiseHome> {
  const { studentId, schoolId } = studentOf(actor);
  const [library, yearEnd, pst, windows, win, interests] = await Promise.all([
    studentLibrary(repo, actor, filter, now), // creates the RRStudent row on first use
    yearEndFor(repo, schoolId, now), placementStatus(repo, studentId, now), loadReadRiseWindows(repo, schoolId, now),
    levelWindow(repo, studentId).catch(() => [] as number[]),
    Promise.resolve().then(() => getInterests(repo, studentId)).catch(() => [] as string[]),
  ]);
  const [summary, hist, placements] = await Promise.all([
    studentReadRiseSummary(repo, studentId, now), levelHistory(repo, studentId),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } }, { select: ["result", "period", "completedAt"], take: 50 }),
  ]);
  const ready = passages.length >= 5;
  const state = pst.open ? "OPEN" : !ready ? "NONE" : !pst.last ? "NEED" : pst.retake ? "RETAKE" : pst.due ? "CHECK" : "NONE";
  return {
    library, summary: summary!,
    growth: { points: hist.points.map((p) => ({ at: p.at.toISOString(), level: p.level })), projected: summary!.projected, yearEnd: yearEnd.toISOString() },
    placement: { state, result: pst.last ? Number(pst.last.result) : null, doneAt: pst.last?.completedAt ? new Date(pst.last.completedAt instanceof Date ? pst.last.completedAt.toISOString() : String(pst.last.completedAt)).toISOString() : null, ready, due: pst.due, checks: placementChecks(windows, placements) },
    placed: summary!.placed, locked: !summary!.placed && ready,
    progress: { toMoveUp: readsToMoveUp(win, library.level), step: ENGINE.step, interests: Array.isArray(interests) ? interests.map(String) : [], topics: library.topics },
  };
}
