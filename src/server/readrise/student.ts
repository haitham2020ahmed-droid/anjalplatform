/**
 * 🚀 ReadRise for students: the article library and the 5-step routine (Achieve3000-like).
 *
 *  Library   published articles of the platform library (schoolId null) + the student's own school, minus the
 *            school's hidden list (SchoolSetting "readrise.hidden"). Teacher-assigned (RRClassArticle of the
 *            student's classes) first, then "Recommended for you" (topics not read lately, a variety of topics).
 *  Routine   one RRRun per reading, strictly in order, resumable. Round 6 (owner, "exactly like Achieve3000"): the steps
 *            are Ready → Read → Respond → Reflect → Write = PREPOLL → READ → QUIZ → POSTPOLL → WRITE → DONE (a run
 *            left in WRITE/POSTPOLL by the old order finishes the old way). Respond is ONE question per screen with a
 *            second try (answerQuestion); the SCORE is the first tries only (RRRun.answers), the second tries go to
 *            RRRun.annotations.secondTry. A version below 400 shows 4 of the band's 8 questions (question-type.ts
 *            pickShownQuestions). Ready / Reflect explanations, the Article Rating, drafts and notes live in
 *            RRRun.annotations (text.ts readAnnotations / withRunExtras: { marks, …extras }).
 *            The version is chooseVersion(level, versions): the version whose MEASURED level (official measure, else
 *            the cached estimate RRVersion.estLevel) best fits the student's level; its question band is bandOf(version).
 *  Scoring   on the server. FIRST-TRY rule: only the first scored reading of an article counts (score, level,
 *            goals); later re-reads have firstTry = false. After submitting, every answer's "why" is shown and a
 *            practice pass is allowed that never changes the score.
 *  Stretch   round 6: the same article at the GRADE-LEVEL version (benchmarks.ts gradeLevelVersion; the next version up
 *            when that is not above the student's), steps Stretch Read → Stretch Respond only, PRACTICE ONLY (never the
 *            level, the goal, the window, the stars): offered after a RELIABLE first try of 75%+ (stretchOffer below).
 *            Round 4: ONLY the first try counts — a re-read is practice.
 *  Status    ONE article status (first-try.ts articleStatus): New / In progress / Finish steps 4–5 / Done.
 *  completedAt = when the activity (step 3) was scored — the moment the reading "counts". step = DONE when all
 *  5 steps are finished.
 *  Accuracy  owner r69 (accuracy.ts): the reader sends when each question was first answered; 2+ rapid guesses make
 *            the run Unreliable (teacher-only): it never moves the level, never counts toward the goal and never feeds
 *            the skills. Careful answers feed the skill stars through the skill-status hook, after the response.
 */
import { toAchieve } from "./achieve-scale";
import { feedReadRise, safeFeed } from "../practice/skill-evidence";
import { runAfterResponse } from "../lib/after-response";
import { aiEnv } from "../ai/env";
import { draftReadRiseWritingScore } from "./writing-ai";
import { onSkillAnswer } from "../skills/status";
import { alertMapGap, alertStuckUnreliable, notifyLevelDown, rapidAnswers } from "./accuracy";
import { loadReadRiseWindows, placementChecks, type RRPeriod } from "./windows";
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { LIBRARY_LEVELS, bandOf, chooseVersion, measuredLevel, stretchAbove, type MeasuredVersion, type RRBand } from "./level";
import { ENGINE, applyFirstTryScore, ensureRRStudent, goalDates, goalStats, levelHistory, levelWindowState, readRisePlaced, readsToMoveUp, s, studentReadRiseSummary, toDate, yearEndFor, type GoalStats, type ReadRiseSummary } from "./engine";
import { articleStatus, baseBand, firstTryRun, isFirst, isStretch, isUnreliableRun, rapidRead, stretchSetBand, type ArticleStatus } from "./first-try";
import { QUESTION_TYPE_NAME, pickShownQuestions, questionTypeOf } from "./question-type";
import { gradeLevelVersion } from "./benchmarks";
import { POINTS, TEACHER_BADGES, celebrationsOn, earnsActivityPoints, forgetStudentPoints, scoreBonus, teacherBadgesOf, writingPoints as writingPointsFor } from "./points";
import { activeCancels } from "../student/cancelled-work";
import { readNext, recommendFor, type RecommendReason } from "./recommend";
import { getInterests } from "./interests";
import { carryKeyWords, wordWarmup, type WarmupQ } from "./words-carry";
import { placementStatus } from "./placement";
import { loadPlacementPassages, type PlacementPassage } from "./content-loader";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { cleanAnnotations, keyWordFor, minutesFor, pollSide, readAnnotations, tokenize, withRunExtras, type Annotation, type KeyWord, type RunExtras } from "../../components/readrise/text";
import { sweptWeakMap } from "../cache/idle";
import { startedBy } from "../../lib/assign-dates";

/** round 6: the Achieve order — Ready, Read, Respond, Reflect, Write (the values are the stored RRRun.step words) */
export const STEPS = ["PREPOLL", "READ", "QUIZ", "POSTPOLL", "WRITE", "DONE"] as const;
export const STEP_TITLE: Record<Exclude<RunStep, "DONE">, string> = { PREPOLL: "Ready", READ: "Read", QUIZ: "Respond", POSTPOLL: "Reflect", WRITE: "Write" };
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
      textLevel: Math.round(toAchieve(measuredLevel({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile })) / 10) * 10, // round 8: Achieve3000 scale
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
export interface Review {
  number: number; chosen: string | null; answer: string; correct: boolean; why: string; wrongWhy: string | null;
  /** round 6: the question type's name ("Main idea" …) for the Results Table */
  skillName?: string;
  /** round 6: the second try (only after a wrong first try), null when there was none */
  second?: string | null; secondCorrect?: boolean | null;
}
/** Round 6 (Achieve, points.ts POINTS): 2 points for a right first try, 1 for a right second try. */
export const RR_POINTS = { first: POINTS.firstTryRight, second: POINTS.secondTryRight } as const;
/** The Respond step's points from its review (first + second tries) and the first-try score's bonus (points.ts scoreBonus). */
export function activityPoints(review: readonly Review[], score: number | null): { earned: number; bonus: number; secondPct: number } {
  const earned = review.reduce((n, r) => n + (r.correct ? RR_POINTS.first : r.secondCorrect ? RR_POINTS.second : 0), 0);
  const right = review.filter((r) => r.correct || r.secondCorrect).length;
  return { earned, bonus: score !== null ? scoreBonus(score) : 0, secondPct: review.length ? Math.round((100 * right) / review.length) : 0 };
}
/**
 * annotations.secondTry (the shape points.ts secondTryRight reads): question number → { letter, correct }. Older
 * shapes (a bare letter) are read too.
 */
export type SecondTries = Record<string, { letter: string; correct: boolean }>;
function secondLetters(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const l = typeof x === "string" ? x : x && typeof x === "object" ? (x as { letter?: unknown }).letter : null;
    if (typeof l === "string" && l) out[k] = l.toUpperCase();
  }
  return out;
}
/** One question's state while Respond is open (the answer is only given once the question is finished). */
export interface QuizProgress { number: number; first: string | null; firstCorrect: boolean | null; second: string | null; secondCorrect: boolean | null; done: boolean; answer: string | null }
/** What answerQuestion returns: the feedback for the try just made. */
export interface QuestionFeedback { number: number; try: 1 | 2; correct: boolean; points: number; done: boolean; answer: string | null; why: string | null; allDone: boolean }
/** The Reflect results: % Agree / Disagree before and after reading across ALL the platform's students (this article). */
export interface PollStats { before: { agree: number; disagree: number; n: number }; after: { agree: number; disagree: number; n: number } }
/** One classmate's Reflect explanation (initials only). */
export interface FeedItem { initials: string; why: string; side: "AGREE" | "DISAGREE" | null; at: string; mine: boolean }
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
  // ---------------------------------------------------------------- round 6 (Achieve-like steps)
  /** Ready / Reflect: the vote (0–3 scale) and the explanation */
  ready?: { vote: number; why: string } | null;
  reflect?: { vote: number; why: string } | null;
  /** the Article Rating popup's answer (null = not asked yet) */
  rating?: RunExtras["rating"] | null;
  /** Respond in progress: each shown question's state (null outside the QUIZ step) */
  quiz?: QuizProgress[] | null;
  /** Reflect results: platform-wide % before / after (from the Reflect step on) */
  pollStats?: PollStats | null;
  /** classmates' Reflect explanations (initials only); null = the class feed is off or not open yet */
  feed?: FeedItem[] | null;
  /** Write: the drafts and the open one; the Notes tab text */
  drafts?: string[]; draft?: number; notesText?: string;
  /** after scoring: points earned (first + second tries), the bonus and the second-try % */
  points?: { earned: number; bonus: number; secondPct: number } | null;
  /** the student's own ReadRise level (may be below 300: "BR120L" / "95L" while reading the 300 version) */
  level?: number;
  /** points.ts celebrationsOn: false when a class of the student turned celebrations off (no "Great work!" popup) */
  celebrate?: boolean;
  /** the Grading Center: badges the teacher gave this writing (names + points) and the writing's points */
  teacherBadges?: { name: string; points: number }[];
  writingPoints?: number | null;
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
/** Round 6: the questions a run SHOWS (and scores): 4 below the 400 version, else all (question-type.ts). */
/**
 * The questions a run shows: pickShownQuestions (4 below the 400 version, else all) — but a scored run keeps the
 * questions it was scored on: an older run (scored on 8 before the 4-question rule) still shows its 8 stored answers.
 */
export function runQuestions<T extends Record<string, unknown>>(all: readonly T[], run: Row): T[] {
  const shown = pickShownQuestions(all, Number(run.versionLevel));
  const raw = run.score !== null && run.score !== undefined ? run.answers : null;
  let a: unknown = raw;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = null; } }
  const keys = a && typeof a === "object" && !Array.isArray(a) ? new Set(Object.keys(a as Record<string, unknown>)) : null;
  if (!keys || keys.size <= shown.length) return shown;
  const stored = [...all].filter((q) => keys.has(String(q.number))).sort((x, y) => Number(x.number) - Number(y.number));
  return stored.length > shown.length ? stored : shown;
}

async function shownQuestionsOf(repo: Repo, run: Row): Promise<Row[]> {
  return runQuestions(await questionsOf(repo, s(run.articleId), s(run.band)), run);
}
const LETTER_OK = (v: unknown) => { const l = String(v ?? "").trim().toUpperCase(); return LETTERS.includes(l) ? l : null; };
const extrasOf = (run: Row): RunExtras => readAnnotations(run.annotations).extras;
const asNote = (v: unknown): { vote: number; why: string } | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const vote = Number(o.vote);
  return Number.isInteger(vote) ? { vote, why: s(o.why) } : null;
};
const cleanWhy = (t: unknown) => String(t ?? "").replace(/\r\n/g, "\n").trim().slice(0, 1500);

function explain(q: Row, chosen: string | null): { why: string; wrongWhy: string | null } {
  const r = (q.rationale && typeof q.rationale === "object" ? q.rationale : {}) as Record<string, unknown>;
  const answer = s(q.answer);
  const wrong = (r.wrong && typeof r.wrong === "object" ? r.wrong : {}) as Record<string, unknown>;
  const why = s(r[answer] ?? r.why ?? "");
  const wrongWhy = chosen && chosen !== answer ? s(r[chosen] ?? wrong[chosen] ?? "") || null : null;
  return { why, wrongWhy };
}

/** Scores answers on the server (questions in number order). `second` = the second tries (round 6, never scored). */
export function scoreAnswers(questions: Row[], answers: Record<string, string>, second: Record<string, string> = {}): { correct: number; total: number; pct: number; review: Review[] } {
  const review = questions.map((q) => {
    const chosen = answers[String(q.number)] ? String(answers[String(q.number)]).toUpperCase() : null;
    const ok = chosen === s(q.answer);
    const sec = !ok && second[String(q.number)] ? String(second[String(q.number)]).toUpperCase() : null;
    return { number: Number(q.number), chosen, answer: s(q.answer), correct: ok, ...explain(q, chosen), skillName: QUESTION_TYPE_NAME[questionTypeOf(q)], second: sec, secondCorrect: sec === null ? null : sec === s(q.answer) };
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
 * 🎯 May this article be stretched now? The same rule for the library card, the article page, the done screen and the
 * server (startRun). After a RELIABLE first try (not a re-read, not Unreliable) of 75%+, once, while a higher version
 * exists. Round 6 (owner, like Achieve3000): the Stretch text is the GRADE-LEVEL version for the student's `grade`
 * (benchmarks.ts gradeLevelVersion); when that is not above the version the student reads (or read), the next version
 * up. It is PRACTICE ONLY (mode always "PRACTICE": never the level, the goal, the window or the stars). Its questions:
 *   - a band different from the first read's → that band's questions (8 new questions);
 *   - else the article's stretch set for the band (`stretchBands` holds "S-L" / "S-M" / "S-H": 4 new questions);
 *   - else the band's questions again.
 * `runs` = the student's runs of this article (columns: band, versionLevel, step, score, firstTry, stretch, unreliable).
 */
export function stretchOffer(runs: readonly Row[], level: number, versions: MeasuredVersion[], stretchBands: ReadonlySet<string> = new Set(), grade: number | null = null): StretchOfferResult {
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
  const nums = versions.map((v) => Number(v.level));
  const gl = grade !== null && Number.isFinite(Number(grade)) && Number(grade) > 0 ? gradeLevelVersion(Number(grade), nums) : null;
  const up = gl !== null && gl > base ? gl : stretchAbove(base, nums);
  if (up === null) return no("There is no higher version of this article.");
  const vb = bandOf(up), set = stretchSetBand(vb);
  const band = s(first.band) && s(first.band) !== vb ? vb : stretchBands.has(set) ? set : vb;
  return { ok: true, up, why: null, band, mode: "PRACTICE" };
}

/** The student's grade number (Student.gradeId → Grade.level), null when unknown. */
export async function studentGrade(repo: Repo, studentId: string): Promise<number | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: s(st.gradeId) }) : null;
  const n = Number(g?.level);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------------ Reflect: platform-wide poll results + class feed

/** % Agree / Disagree before and after reading, across every student of the platform who answered (this article). */
export async function pollStatsFor(repo: Repo, articleId: string): Promise<PollStats> {
  const [ba, bd, aa, ad] = await Promise.all([
    repo.count("RRRun", { articleId, prePoll: { in: [0, 1] } }), repo.count("RRRun", { articleId, prePoll: { in: [2, 3] } }),
    repo.count("RRRun", { articleId, postPoll: { in: [0, 1] } }), repo.count("RRRun", { articleId, postPoll: { in: [2, 3] } }),
  ]);
  const pct = (a: number, d: number) => { const n = a + d; return { agree: n ? Math.round((100 * a) / n) : 0, disagree: n ? 100 - Math.round((100 * a) / n) : 0, n }; };
  return { before: pct(ba, bd), after: pct(aa, ad) };
}

/** The SchoolSetting key that turns a class's Reflect comment feed off (value "1"; the teacher's toggle). */
export const feedOffKey = (classId: string) => `readrise.feedOff:${classId}`;
/** A class toggle's stored value is on: "1" / 1 / true / "true" / { on: true } (teacher.ts classSettings writes the last). */
const isOn = (v: unknown): boolean => {
  let x = v;
  if (typeof x === "string") { try { x = JSON.parse(x); } catch { /* plain text */ } }
  if (x && typeof x === "object") return (x as { on?: unknown }).on === true;
  return x === "1" || x === 1 || x === true || x === "true";
};
/** The badgesOff key (teacher.ts classSettingKey("badgesOff", classId)): no celebration messages for that class. */
const badgesOffKey = (classId: string) => `readrise.badgesOff:${classId}`;

/** The student's classes and their ReadRise toggles (the Reflect feed, the celebrations). */
export async function classToggles(repo: Repo, studentId: string, schoolId: string): Promise<{ classIds: string[]; feedOff: Set<string>; badgesOff: boolean }> {
  const mine = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  const classIds = [...new Set(mine.map((m) => s(m.classId)))].slice(0, 20);
  if (!classIds.length) return { classIds, feedOff: new Set(), badgesOff: false };
  const rows = await repo.findMany("SchoolSetting", { schoolId, key: { in: [...classIds.map(feedOffKey), ...classIds.map(badgesOffKey)] } }, { select: ["key", "value"] });
  const on = new Set(rows.filter((r) => isOn(r.value)).map((r) => s(r.key)));
  return { classIds, feedOff: new Set(classIds.filter((c) => on.has(feedOffKey(c)))), badgesOff: classIds.some((c) => on.has(badgesOffKey(c))) };
}
/** "Jana Ahmed" → "J.A." (at most two letters). */
export const initialsOf = (name: string): string => s(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => `${Array.from(w)[0]?.toUpperCase() ?? ""}.`).join("") || "?";
export const FEED_MAX = 30;

/**
 * 💬 The class comment feed: the Reflect explanations of this article by students of the reader's classes (initials
 * only, newest first, at most FEED_MAX). A class whose teacher turned the feed off (feedOffKey = "1") is left out;
 * null when every class of the student has it off (or the student is in no class).
 */
export async function classFeed(repo: Repo, studentId: string, schoolId: string, articleId: string): Promise<FeedItem[] | null> {
  const { classIds, feedOff } = await classToggles(repo, studentId, schoolId);
  if (!classIds.length) return null;
  const open = classIds.filter((c) => !feedOff.has(c));
  if (!open.length) return null;
  const mates = [...new Set((await repo.findMany("ClassMembership", { classId: { in: open }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))].slice(0, 400);
  if (!mates.length) return [];
  const runs = (await repo.findMany("RRRun", { articleId, studentId: { in: mates }, postPoll: { not: null } }, { select: ["studentId", "annotations", "postPoll", "startedAt"] }))
    .map((r) => ({ r, note: asNote(readAnnotations(r.annotations).extras.reflect), at: s((readAnnotations(r.annotations).extras.reflect as { at?: unknown } | undefined)?.at) }))
    .filter((x) => x.note && x.note.why.trim())
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEED_MAX);
  if (!runs.length) return [];
  const ids = [...new Set(runs.map((x) => s(x.r.studentId)))];
  const studs = await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] });
  const users = studs.length ? await repo.findMany("User", { id: { in: studs.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(studs.map((x) => [s(x.id), s(users.find((u) => s(u.id) === s(x.userId))?.displayName)]));
  return runs.map((x) => ({ initials: initialsOf(nameOf.get(s(x.r.studentId)) ?? ""), why: x.note!.why.slice(0, 600), side: pollSide(x.note!.vote), at: x.at, mine: s(x.r.studentId) === studentId }));
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
  const step = s(run.step) as RunStep;
  const [art, ver, prompt, allQs, rr] = await Promise.all([
    repo.findUnique("RRArticle", { id: articleId }),
    repo.findUnique("RRVersion", { articleId, level: Number(run.versionLevel) }),
    repo.findUnique("RRPrompt", { articleId, band }),
    questionsOf(repo, articleId, s(run.band)),
    repo.findUnique("RRStudent", { studentId: s(run.studentId) }),
  ]);
  // round 6: only the questions this version SHOWS (4 below the 400 version, else all)
  const qs = runQuestions(allQs, run); // an old run keeps the questions it was scored on
  const version = ver, pr = prompt;
  const body = s(version?.body);
  const ex = extrasOf(run);
  const scored = run.score !== null && run.score !== undefined;
  const stored = scored && run.answers && typeof run.answers === "object" ? (run.answers as Record<string, string>) : null;
  const answers = stored;
  const second = secondLetters(ex.secondTry);
  const review = answers ? scoreAnswers(qs, answers, second).review : null;
  let done: DoneView | null = null;
  const keyWords = keyWordsFor(repo, articleId, band, body); // read alongside the rest
  keyWords.catch(() => undefined); // (awaited below; never an unhandled rejection meanwhile)
  // 🔤 round 5: the optional word warm-up, only before reading starts (the key-words step), never scored
  const warmup: Promise<WarmupQ[]> = run.step === "READ" && !Number(run.readSeconds ?? 0)
    ? wordWarmup(repo, s(run.studentId), now).then((w) => (Array.isArray(w) ? w.slice(0, 2) : [])).catch(() => [])
    : Promise.resolve([]);
  // 🗳 round 6: Reflect results (platform-wide %) and the class feed — once the student has voted after reading
  const reflected = run.postPoll !== null && run.postPoll !== undefined && run.stretch !== true;
  const stats: Promise<PollStats | null> = reflected ? pollStatsFor(repo, articleId).catch(() => null) : Promise.resolve(null);
  const feed: Promise<FeedItem[] | null> = reflected ? classFeed(repo, s(run.studentId), s(run.schoolId), articleId).catch(() => null) : Promise.resolve(null);
  stats.catch(() => undefined); feed.catch(() => undefined);
  if (run.step === "DONE") {
    const studentId = s(run.studentId);
    const [vers, rrow, mine, goal, sets, grade] = await Promise.all([
      repo.findMany("RRVersion", { articleId }, { select: MEASURE_COLS }),
      ensureRRStudent(repo, studentId, now),
      repo.findMany("RRRun", { studentId, articleId }, { select: ["id", "band", "versionLevel", "step", "score", "firstTry", "stretch", "unreliable", "startedAt"] }),
      goalFor(repo, studentId, now),
      stretchBandsOf(repo, articleId),
      studentGrade(repo, studentId).catch(() => null),
    ]);
    const isStretchRun = run.stretch === true;
    const offer: StretchOfferResult = isStretchRun ? { ok: false, up: null, why: null } : stretchOffer(mine, Number(rrow.level), asMeasured(vers), sets, grade);
    const kind: DoneView["kind"] = isStretchRun ? "STRETCH" : run.firstTry === true ? "FIRST" : "REREAD";
    let next: DoneView["readNext"] = null;
    try {
      const n = await readNext(repo, studentId, s(run.schoolId), { articleId, score: scored ? Number(run.score) : 0, firstTry: run.firstTry === true, stretch: isStretchRun, band: s(run.band), canStretch: offer.ok }, now);
      next = n ? { articleId: s(n.articleId), title: s(n.title), reason: n.reason, stretch: Boolean(n.stretch) } : null;
    } catch { next = null; }
    done = {
      score: scored ? Number(run.score) : null, firstTry: run.firstTry === true, stretch: isStretchRun,
      levelBefore: Number(run.levelBefore), levelAfter: Number(run.levelAfter ?? run.levelBefore), goal,
      // ⬆ the one stretch rule (stretchOffer): a reliable first try of 75%+ → always, while a higher version exists
      canStretch: offer.ok, stretchWhy: offer.ok ? null : offer.why, stretchMode: offer.ok ? offer.mode ?? null : null,
      // round 6: a stretch is always practice
      stretchCounted: isStretchRun ? "PRACTICE" : null,
      prePoll: run.prePoll === null || run.prePoll === undefined ? null : Number(run.prePoll), postPoll: run.postPoll === null || run.postPoll === undefined ? null : Number(run.postPoll),
      tooFast: run.unreliable === true || run.unreliable === 1,
      kind, readTooFast: rapidRead(run), readNext: next, wordsSaved: extra.wordsSaved ?? null,
    };
  }
  // ✍️ Write: the drafts (Draft 1, Draft 2 …); an old run's draft is its writing
  const drafts = Array.isArray(ex.drafts) ? (ex.drafts as unknown[]).map((x) => s(x).slice(0, 6000)).slice(0, MAX_DRAFTS) : [];
  const draft = Math.min(Math.max(0, Math.floor(Number(ex.draft) || 0)), Math.max(0, drafts.length - 1));
  // submitted = the run moved past Write with a text (new order: WRITE → DONE; old order: WRITE → POSTPOLL → DONE)
  const submitted = s(run.writing).trim().length > 0 && (step === "DONE" || step === "POSTPOLL");
  // 🎯 Respond in progress: each shown question's state (the answer only once the question is finished)
  let quiz: QuizProgress[] | null = null;
  if (step === "QUIZ") {
    const q0 = ex.quiz ?? { first: {}, second: {}, at: {} };
    quiz = qs.map((q) => {
      const n = String(q.number), f = q0.first?.[n] ?? null, sc = q0.second?.[n] ?? null;
      const fc = f === null ? null : f === s(q.answer), scc = sc === null ? null : sc === s(q.answer);
      const fin = fc === true || sc !== null;
      return { number: Number(q.number), first: f, firstCorrect: fc, second: sc, secondCorrect: scc, done: fin, answer: fin ? s(q.answer) : null };
    });
  }
  return {
    runId: s(run.id), articleId, step, stretch: run.stretch === true, firstTry: run.firstTry === true,
    versionLevel: Number(run.versionLevel), band: s(run.band) as RRBand, title: s(version?.title) || s(art?.title), topic: s(art?.topic), poll: s(art?.pollStatement),
    prePoll: run.prePoll === null || run.prePoll === undefined ? null : Number(run.prePoll), postPoll: run.postPoll === null || run.postPoll === undefined ? null : Number(run.postPoll),
    body, keyWords: await keyWords, annotations: cleanAnnotations(run.annotations, tokenize(body).flat().length),
    readSeconds: Number(run.readSeconds ?? 0), listened: run.listened === true,
    questions: qs.map((q) => ({ number: Number(q.number), stem: s(q.stem), options: Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [], skill: s(q.skill) })),
    score: scored ? Number(run.score) : null, answers, review,
    prompt: s(pr?.prompt), checklist: Array.isArray(pr?.checklist) ? (pr!.checklist as unknown[]).map(String) : [],
    writing: step === "WRITE" && drafts.length ? drafts[draft] ?? "" : s(run.writing),
    writingScore: run.writingScore === null || run.writingScore === undefined ? null : Number(run.writingScore), writingComment: run.writingComment ? s(run.writingComment) : null,
    // ✍️ only once the student submitted their OWN writing — never before, so it cannot be copied
    modelAnswer: submitted && pr?.modelAnswer ? s(pr.modelAnswer) : null,
    done, warmup: await warmup,
    ready: asNote(ex.ready), reflect: asNote(ex.reflect), rating: ex.rating ?? null, quiz,
    pollStats: await stats, feed: await feed,
    drafts, draft, notesText: s(ex.notesText),
    // the ONE points rule (points.ts earnsActivityPoints — the total and the school board use it too): a first try,
    // a Stretch first try included, reliable and read carefully; else 0 points (the second-try % is still shown)
    points: review ? (earnsActivityPoints(run) ? activityPoints(review, scored ? Number(run.score) : null) : { ...activityPoints(review, null), earned: 0 }) : null,
    celebrate: scored ? await celebrateFor(repo, s(run.studentId), s(run.schoolId)) : true,
    teacherBadges: teacherBadgesOf(run.annotations).map((b) => TEACHER_BADGES.find((x) => x.code === b.code)).filter((b): b is { code: string; name: string; points: number } => !!b).map((b) => ({ name: b.name, points: b.points })),
    writingPoints: Number.isFinite(Number((ex as { writingPoints?: unknown }).writingPoints)) && (ex as { writingPoints?: unknown }).writingPoints !== null && (ex as { writingPoints?: unknown }).writingPoints !== undefined
      ? Number((ex as { writingPoints?: unknown }).writingPoints)
      : run.writingScore === null || run.writingScore === undefined ? null : writingPointsFor(run.writingScore),
    level: rr ? Number(rr.level) : undefined,
  };
}
/** Celebrations on: points.ts celebrationsOn and no class of the student with badgesOff on (either storage form). */
async function celebrateFor(repo: Repo, studentId: string, schoolId: string): Promise<boolean> {
  try {
    const [p, mine] = await Promise.all([celebrationsOn(repo, studentId, schoolId), classToggles(repo, studentId, schoolId)]);
    return p && !mine.badgesOff;
  } catch { return true; }
}
/** Write: at most this many drafts. */
export const MAX_DRAFTS = 5;

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
    textLevel: Math.round(toAchieve(measuredLevel({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile })) / 10) * 10, // round 8: Achieve3000 scale
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
      const offer = stretchOffer(runs, level, levels, await stretchBandsOf(tx, articleId), await studentGrade(tx, studentId).catch(() => null));
      if (!offer.ok || offer.up === null) throw new ValidationError(offer.why ?? "This article cannot be stretched.");
      versionLevel = offer.up;
      band = offer.band ?? bandOf(versionLevel);
    } else { versionLevel = chooseVersion(level, levels); band = bandOf(versionLevel); }
    const firstTry = !runs.some((r) => (r.stretch === true) === Boolean(opts.stretch));
    // round 6: a stretch has only Stretch Read → Stretch Respond (no Ready / Reflect / Write)
    const row = await tx.create("RRRun", {
      studentId, schoolId, articleId, versionLevel, band, step: opts.stretch ? "READ" : "PREPOLL", levelBefore: level,
      firstTry, stretch: Boolean(opts.stretch), listened: false, startedAt: now,
    });
    return s(row.id);
  }));
  return runView(repo, actor, id, now);
}

const pollValue = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 3) throw new ValidationError("Choose one answer."); return n; };

/** Step 1 · Ready: the before-reading vote (Agree / Disagree) and "Explain why you voted the way you did". */
export async function submitPrePoll(repo: Repo, actor: Actor, runId: string, value: number, now = new Date(), why = ""): Promise<RunView> {
  const vote = pollValue(value);
  const run = await lockedRun(repo, actor, runId, async (tx, r) => {
    expectStep(r, "PREPOLL");
    await tx.updateMany("RRRun", { id: runId, step: "PREPOLL" }, { prePoll: vote, step: "READ", annotations: withRunExtras(r.annotations, { ready: { vote, why: cleanWhy(why), at: now.toISOString() } }) });
    return r;
  });
  forgetStudentPoints(repo, s(run.studentId)); // a vote earns points (points.ts)
  return runView(repo, actor, runId, now);
}

export interface ReadingProgress { readSeconds?: number; listened?: boolean; annotations?: unknown; /** round 6: the Notes tab text */ notesText?: string }

async function readingPatch(repo: Repo, run: Row, p: ReadingProgress): Promise<Row> {
  const patch: Row = {};
  if (p.readSeconds !== undefined) patch.readSeconds = Math.max(Number(run.readSeconds ?? 0), Math.min(3 * 3600, Math.max(0, Math.round(Number(p.readSeconds) || 0))));
  if (p.listened) patch.listened = true;
  let marks: unknown[] | undefined;
  if (p.annotations !== undefined) {
    const ver = await repo.findUnique("RRVersion", { articleId: s(run.articleId), level: Number(run.versionLevel) });
    marks = cleanAnnotations(p.annotations, tokenize(s(ver?.body)).flat().length);
  }
  // round 6: the highlights live in annotations.marks beside the step data (an old array becomes { marks })
  // the notes are dropped once the writing is sent (submitWriting): a late autosave never stores them again
  const notes = p.notesText !== undefined && !s(run.writing).trim();
  if (marks !== undefined || notes) {
    patch.annotations = withRunExtras(run.annotations, notes ? { notesText: String(p.notesText ?? "").slice(0, 4000) } : {}, marks);
  }
  return patch;
}

/** Saves highlights/notes, reading time and read-aloud use (any step before DONE). */
export async function saveReading(repo: Repo, actor: Actor, runId: string, p: ReadingProgress): Promise<{ ok: true }> {
  await lockedRun(repo, actor, runId, async (tx, run) => {
    if (run.step === "PREPOLL" || run.step === "DONE") throw new ValidationError("Reading is not open.");
    const patch = await readingPatch(tx, run, p);
    if (Object.keys(patch).length) await tx.updateMany("RRRun", { id: runId }, patch);
  });
  return { ok: true };
}

/**
 * 🔒 Round 6: RRRun.annotations is one JSON value written by several steps (notes autosave, a Respond answer, the
 * rating, drafts) — every read-modify-write runs here: the FIRST statement locks the run's row (a no-op update), then
 * the row is read again, so two requests never overwrite each other's keys.
 */
async function lockedRun<T>(repo: Repo, actor: Actor, runId: string, fn: (tx: Repo, run: Row) => Promise<T>): Promise<T> {
  const { studentId } = studentOf(actor);
  return repo.transaction(async (tx) => {
    const locked = await tx.updateMany("RRRun", { id: runId, studentId }, { studentId });
    if (!locked) throw new ForbiddenError("Reading not found.");
    return fn(tx, await ownRun(tx, actor, runId));
  });
}

/** Step 2 done: on to the activity. */
export async function finishReading(repo: Repo, actor: Actor, runId: string, p: ReadingProgress, now = new Date()): Promise<RunView> {
  await lockedRun(repo, actor, runId, async (tx, run) => {
    expectStep(run, "READ");
    // quizAt: when the questions opened (the server's clock for the answer times, accuracy.ts)
    await tx.updateMany("RRRun", { id: runId, step: "READ" }, { ...(await readingPatch(tx, run, p)), step: "QUIZ", quizAt: now });
  });
  return runView(repo, actor, runId, now);
}

/** Round 6 · the Article Rating popup after Read (1–4 stars + how the student got the article; skippable). */
export async function rateArticle(repo: Repo, actor: Actor, runId: string, input: { stars?: number | null; access?: string | null; skipped?: boolean }, now = new Date()): Promise<{ ok: true }> {
  await lockedRun(repo, actor, runId, async (tx, run) => {
    if (run.step === "PREPOLL" || run.step === "READ") throw new ValidationError("Read the article first.");
    const n = Number(input?.stars);
    const stars = Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
    const access = input?.access === "SELF" || input?.access === "TEACHER" ? input.access : null;
    const skipped = Boolean(input?.skipped) || (stars === null && access === null);
    await tx.updateMany("RRRun", { id: runId }, { annotations: withRunExtras(run.annotations, { rating: { stars, access, ...(skipped ? { skipped: true } : {}), at: now.toISOString() } }) });
  });
  return { ok: true };
}

/**
 * Round 6 · Respond, ONE question at a time: the first try (right → 2 points, the question is done; wrong → a second
 * try), then the second try (right → 1 point; wrong → the right answer is shown and the student moves on). Only the
 * FIRST tries make the score (submitActivity). The first try's time is worked out on the SERVER (the rapid-guess rule,
 * accuracy.ts, uses the first answers only): the time since the previous first answer was saved (annotations.quiz.ts),
 * else since the questions opened (RRRun.quizAt). `ms` = the page's time for this question (since it opened the
 * question or saved the previous answer) — it can only make the server's time SMALLER, never larger (a reload or a
 * wrong page clock can never make answers look slower, nor — the server's own clock — faster than they were).
 */
export async function answerQuestion(repo: Repo, actor: Actor, runId: string, number: number, letter: string, ms?: number | null, now = new Date()): Promise<QuestionFeedback> {
  return lockedRun(repo, actor, runId, async (tx, run) => {
    expectStep(run, "QUIZ");
    const qs = await shownQuestionsOf(tx, run);
    const q = qs.find((x) => Number(x.number) === Number(number));
    if (!q) throw new ValidationError("This question is not in the activity.");
    const l = LETTER_OK(letter);
    if (!l) throw new ValidationError("Choose one answer.");
    const ex = extrasOf(run);
    const quiz = { first: { ...(ex.quiz?.first ?? {}) }, second: { ...(ex.quiz?.second ?? {}) }, at: { ...(ex.quiz?.at ?? {}) }, ts: { ...(ex.quiz?.ts ?? {}) } };
    const n = String(q.number), right = s(q.answer);
    let fb: Omit<QuestionFeedback, "allDone">;
    if (quiz.first[n] === undefined) {
      quiz.first[n] = l;
      const timed = answerTime({ quizAt: run.quizAt, ts: quiz.ts, at: quiz.at, now: now.getTime(), ms });
      quiz.ts[n] = now.getTime();
      if (timed !== null) quiz.at[n] = timed;
      const ok = l === right;
      fb = { number: Number(n), try: 1, correct: ok, points: ok ? RR_POINTS.first : 0, done: ok, answer: ok ? right : null, why: ok ? explain(q, l).why || null : null };
    } else if (quiz.first[n] !== right && quiz.second[n] === undefined) {
      quiz.second[n] = l;
      const ok = l === right;
      fb = { number: Number(n), try: 2, correct: ok, points: ok ? RR_POINTS.second : 0, done: true, answer: right, why: explain(q, l).why || null };
    } else throw new ValidationError("You already answered this question.");
    await tx.updateMany("RRRun", { id: runId, step: "QUIZ" }, { annotations: withRunExtras(run.annotations, { quiz }) });
    const allDone = qs.every((x) => { const k = String(x.number); return quiz.first[k] !== undefined && (quiz.first[k] === s(x.answer) || quiz.second[k] !== undefined); });
    return { ...fb, allDone };
  });
}

/**
 * 🎯 The server's time of a first answer (pure): ms after the questions opened, as the previous first answer's time +
 * the gap since it was saved (else since RRRun.quizAt). The page's `ms` (its own gap for this question) only makes the
 * gap smaller. null when neither clock is known.
 */
export function answerTime(i: { quizAt: unknown; ts: Record<string, unknown>; at: Record<string, unknown>; now: number; ms?: number | null }): number | null {
  const nums = (o: Record<string, unknown>) => Object.values(o).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  const q0 = i.quizAt ? toDate(i.quizAt).getTime() : NaN;
  const prevTs = Math.max(...nums(i.ts), Number.isFinite(q0) ? q0 : -Infinity);
  const prevAt = Math.max(0, ...nums(i.at));
  const server = Number.isFinite(prevTs) && i.now >= prevTs ? i.now - prevTs : null;
  const c = Number(i.ms);
  const client = i.ms !== null && i.ms !== undefined && Number.isFinite(c) && c >= 0 ? c : null;
  const gap = server === null ? client : client === null ? server : Math.min(server, client);
  return gap === null ? null : Math.round(prevAt + gap);
}

/** The reader's answer times: question number → ms after the questions opened when it was first answered. */
export interface ActivityTiming { at?: Record<string, unknown> | null }

/**
 * Step 3 · Respond: scores the SHOWN questions (8, or 4 below the 400 version) on the server — the FIRST tries only.
 * Round 6: the first tries given one by one (answerQuestion, stored in annotations.quiz) win over `raw` (an older page
 * sends every answer at once in `raw`); the second tries go to annotations.secondTry. The first scored reading of an
 * article moves the level — unless 2+ answers were rapid guesses (an Unreliable run: accuracy.ts), which never moves
 * it. A stretch is practice: it never moves the level and ends the run (Stretch Read → Stretch Respond → done).
 */
export async function submitActivity(repo: Repo, actor: Actor, runId: string, raw: Record<string, unknown>, now = new Date(), timing: ActivityTiming = {}): Promise<RunView> {
  let moved = false, studentId = "", drop: { from: number; to: number; reason: string } | null = null;
  await repo.transaction(async (tx) => {
    // 🔒 lock the run's row first (annotations.quiz is written by answerQuestion)
    await tx.updateMany("RRRun", { id: runId, step: "QUIZ" }, { step: "QUIZ" });
    const run = await ownRun(tx, actor, runId);
    expectStep(run, "QUIZ");
    studentId = s(run.studentId);
    const [qs, ver] = await Promise.all([
      shownQuestionsOf(tx, run),
      tx.findMany("RRVersion", { articleId: s(run.articleId), level: Number(run.versionLevel) }, { select: ["wordCount"], take: 1 }).then((r) => r[0]),
    ]);
    if (!qs.length) throw new ValidationError("This article has no questions yet.");
    const quiz = extrasOf(run).quiz;
    const answers = cleanAnswers({ ...(raw ?? {}), ...(quiz?.first ?? {}) }, qs);
    const { pct } = scoreAnswers(qs, answers);
    const second: SecondTries = {};
    for (const q of qs) { const v = LETTER_OK(quiz?.second?.[String(q.number)]); if (v && answers[String(q.number)] !== s(q.answer)) second[String(q.number)] = { letter: v, correct: v === s(q.answer) }; }
    // 🎯 rapid guesses (the practice rules): the first answer against the text's reading time, the others under 3 s —
    // the FIRST answers' times (answerQuestion's, else the page's)
    // one clock only: the server's times of the one-by-one answers (answerQuestion), else an older page's own times
    const at: Record<string, unknown> = quiz?.at && Object.keys(quiz.at).length ? { ...quiz.at } : { ...(timing?.at ?? {}) };
    const quizAt = run.quizAt ? toDate(run.quizAt).getTime() : NaN;
    const words = Number(ver?.wordCount) || 0;
    const fast = rapidAnswers({ at: Object.keys(at).length ? at : null, numbers: qs.map((q) => Number(q.number)), readSeconds: Number(run.readSeconds ?? 0), words, serverMs: Number.isFinite(quizAt) ? now.getTime() - quizAt : null });
    const changed = await tx.updateMany("RRRun", { id: runId, step: "QUIZ" }, {
      // round 6: Respond → Reflect (a stretch ends here)
      answers, score: pct, completedAt: now, step: run.stretch === true ? "DONE" : "POSTPOLL",
      answerMs: { ms: fast.ms, rapid: fast.rapid }, rapidCount: fast.rapid.length, unreliable: fast.unreliable,
      annotations: withRunExtras(run.annotations, { quiz: undefined, secondTry: second }),
    });
    if (!changed) throw new ValidationError("Already submitted. Reload the page.");
    const rr = await ensureRRStudent(tx, s(run.studentId), now);
    let before = Number(rr.level), after = before;
    // first try counts; an Unreliable run never counts. Round 4: a re-read never counts; a run read faster than
    // RR_MIN_READ_SECONDS never counts (the skill-evidence rule). Round 6 (owner): a stretch NEVER counts (practice +
    // points only — first-try.ts stretchCountsFully is always false)
    const counts = run.firstTry === true && run.stretch !== true && !fast.unreliable && !rapidRead(run);
    let why: string | null = null;
    if (counts) ({ levelBefore: before, levelAfter: after, reason: why } = await applyFirstTryScore(tx, { ...run, score: pct, completedAt: now, unreliable: false }, now));
    moved = after !== before;
    drop = after < before ? { from: before, to: after, reason: why ?? "" } : null;
    await tx.updateMany("RRRun", { id: runId }, { levelBefore: before, levelAfter: after });
  });
  forgetStudentPoints(repo, studentId); // points.ts: the student's points cache is stale now
  // 🔗 the careful answers also feed the skills they measure (main idea, inference, vocabulary in context …) and then
  // the skill stars through the skill-status hook — all after the response: the score and level are saved above
  runAfterResponse("readrise.skill_feed", () => safeFeed("readrise", async () => {
    const skills: string[] = [];
    await feedReadRise(repo, runId, now, (ids) => skills.push(...ids));
    for (const skillId of new Set(skills)) runAfterResponse("skills.status", () => onSkillAnswer(repo, studentId, skillId, now), { key: `skills.status|${studentId}|${skillId}` });
  }));
  // 📉 round 9: an automatic drop → the class teachers get a notification (information only, nothing to approve)
  const down = drop as { from: number; to: number; reason: string } | null;
  if (down) runAfterResponse("readrise.level_down", () => notifyLevelDown(repo, studentId, down.from, down.to, down.reason, now).catch(() => false), { key: `readrise.level_down|${studentId}` });
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
  const qs = await shownQuestionsOf(repo, run);
  const { correct, total, review } = scoreAnswers(qs, cleanAnswers(raw, qs));
  return { correct, total, review };
}

const cleanWriting = (t: string) => String(t ?? "").replace(/\r\n/g, "\n").slice(0, 6000);

/**
 * Step 5 · Write autosave / "Save for later". Round 6: the drafts (Draft 1, Draft 2 …, at most MAX_DRAFTS) are kept in
 * RRRun.annotations.drafts — RRRun.writing is only set when the student submits (so the teacher's queue never shows
 * an unsent draft). `text` is the open draft's text; `opts` may send every draft and the open one.
 */
export async function saveWritingDraft(repo: Repo, actor: Actor, runId: string, text: string, opts: { drafts?: string[]; draft?: number } = {}): Promise<{ ok: true }> {
  await lockedRun(repo, actor, runId, async (tx, run) => {
    expectStep(run, "WRITE");
    const ex = extrasOf(run);
    const drafts = (Array.isArray(opts.drafts) ? opts.drafts : Array.isArray(ex.drafts) ? (ex.drafts as unknown[]) : []).map((d) => cleanWriting(String(d ?? ""))).slice(0, MAX_DRAFTS);
    const i = Math.min(MAX_DRAFTS - 1, Math.max(0, Math.floor(Number(opts.draft ?? ex.draft ?? 0) || 0)));
    while (drafts.length <= i) drafts.push("");
    drafts[i] = cleanWriting(text);
    await tx.updateMany("RRRun", { id: runId, step: "WRITE" }, { annotations: withRunExtras(run.annotations, { drafts, draft: i }) });
  });
  return { ok: true };
}

/**
 * Step 5 · Write: the thought question (at least 30 words), sent to the teacher for a 0–4 score. Round 6: Write is the
 * LAST step (→ DONE); a run left by the old order (Write before the after-poll) goes on to POSTPOLL.
 */
export async function submitWriting(repo: Repo, actor: Actor, runId: string, text: string, now = new Date()): Promise<RunView> {
  const t = cleanWriting(text).trim();
  if (words(t) < MIN_WRITING_WORDS) throw new ValidationError(`Write at least ${MIN_WRITING_WORDS} words (you have ${words(t)}).`);
  // 🔒 the row lock (lockedRun) + check-and-set: only the request that moves the run from WRITE wins; a second,
  // concurrent submit gets an error and never queues a second AI draft. The drafts and the Notes text are dropped
  // from annotations now (the sent text is RRRun.writing) — the run row stays small for the points and the reports
  const run = await lockedRun(repo, actor, runId, async (tx, r) => {
    expectStep(r, "WRITE");
    const oldOrder = r.postPoll === null || r.postPoll === undefined;
    const changed = await tx.updateMany("RRRun", { id: runId, step: "WRITE" }, {
      writing: t, step: oldOrder ? "POSTPOLL" : "DONE",
      annotations: withRunExtras(r.annotations, { drafts: undefined, draft: undefined, notesText: undefined }),
    });
    if (!changed) throw new ValidationError("Already submitted. Reload the page.");
    return r;
  });
  const oldOrder = run.postPoll === null || run.postPoll === undefined;
  forgetStudentPoints(repo, s(run.studentId)); // a sent writing is an achievement step (points.ts)
  // 🤖 draft an AI score + comment for the teacher's scoring screen (never shown to the student) — after the
  // response, so the student is never kept waiting on an AI call; silently skipped if AI is off/limited/fails.
  // Round 4: only for a first try (a re-read is practice: no AI draft is spent on it)
  if (run.firstTry === true) runAfterResponse("readrise.writing_ai", async () => {
    const pr = await repo.findUnique("RRPrompt", { articleId: s(run.articleId), band: baseBand(run.band) });
    await draftReadRiseWritingScore(
      repo, { schoolId: s(run.schoolId), runId, prompt: s(pr?.prompt), checklist: (pr?.checklist ?? []) as string[], text: t }, aiEnv(),
    ).catch(() => undefined);
  }, { key: `readrise.writing_ai|${runId}` });
  return runView(repo, actor, runId, now, { wordsSaved: oldOrder ? null : await finishedWords(repo, run, now) });
}

/** 🗂 round 5: a reliable, careful first try finished every step → its key words go to My Words (words-carry.ts). */
async function finishedWords(repo: Repo, run: Row, now: Date): Promise<number | null> {
  if (run.firstTry !== true || run.stretch === true || isUnreliableRun(run) || rapidRead(run) || run.score === null || run.score === undefined) return null;
  try { return Number(await carryKeyWords(repo, s(run.studentId), s(run.articleId), baseBand(run.band), now)) || 0; } catch { return null; }
}

/**
 * Step 4 · Reflect: the after-reading vote and its explanation (→ Write). The view then carries the Before / After
 * results, the platform-wide % and the class feed. A run left by the old order (Write already done) ends here.
 */
export async function submitPostPoll(repo: Repo, actor: Actor, runId: string, value: number, now = new Date(), why = ""): Promise<RunView> {
  const vote = pollValue(value);
  // 🔒 annotations is read-modify-written under the row lock (lockedRun), like every other writer
  const { run, changed } = await lockedRun(repo, actor, runId, async (tx, r) => {
    expectStep(r, "POSTPOLL");
    const n = await tx.updateMany("RRRun", { id: runId, step: "POSTPOLL" }, {
      postPoll: vote, step: s(r.writing).trim().length > 0 ? "DONE" : "WRITE",
      annotations: withRunExtras(r.annotations, { reflect: { vote, why: cleanWhy(why), at: now.toISOString() } }),
    });
    return { run: r, changed: n };
  });
  const oldOrder = s(run.writing).trim().length > 0;
  forgetStudentPoints(repo, s(run.studentId)); // a vote earns points (points.ts)
  const wordsSaved = changed && oldOrder ? await finishedWords(repo, run, now) : null;
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
    levelWindowState(repo, studentId).catch(() => ({ scores: [] as number[], afterDrop: false })), // round 9
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
    progress: { toMoveUp: readsToMoveUp(win.scores, library.level, win.afterDrop), step: ENGINE.step, interests: Array.isArray(interests) ? interests.map(String) : [], topics: library.topics },
  };
}
