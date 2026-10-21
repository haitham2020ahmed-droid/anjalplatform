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
 *  Stretch   the same article one version higher (stretch = true): ≥ 75% counts toward goals; never lowers the level.
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
import { LIBRARY_LEVELS, bandOf, chooseVersion, stretchAbove, type MeasuredVersion, type RRBand } from "./level";
import { ENGINE, applyFirstTryScore, ensureRRStudent, goalStats, levelHistory, readRisePlaced, s, studentReadRiseSummary, toDate, yearEndFor, type GoalStats, type ReadRiseSummary } from "./engine";
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
  id: string; title: string; topic: string; summary: string; minutes: number; versionLevel: number;
  status: "NEW" | "IN_PROGRESS" | "DONE"; firstTryScore: number | null; canStretch: boolean; stretchDone: boolean;
  assigned: boolean; dueAt: string | null;
}
export interface Library { level: number; assigned: ArticleCard[]; recommended: ArticleCard[]; all: ArticleCard[]; topics: string[]; query: string; topic: string }

export async function studentLibrary(repo: Repo, actor: Actor, filter: { q?: string; topic?: string } = {}, now = new Date()): Promise<Library> {
  const { studentId, schoolId } = studentOf(actor);
  // independent reads in parallel; the article catalog is cached (the same for every student)
  const [rr, { arts, versions }, runs, mems] = await Promise.all([
    ensureRRStudent(repo, studentId, now),
    visibleCatalog(repo, schoolId),
    repo.findMany("RRRun", { studentId }, { select: ["articleId", "step", "score", "firstTry", "stretch", "completedAt", "startedAt", "unreliable"] }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  const level = Number(rr.level);
  const visible = new Set(arts.map((a) => s(a.id)));
  // the classes' assigned articles (few rows), kept to the visible ones: no list of every article id in the query
  const assignedRows = mems.length && arts.length ? (await repo.findMany("RRClassArticle", { classId: { in: mems.map((m) => s(m.classId)) } }, { select: ["articleId", "dueAt", "startAt"] })).filter((r) => visible.has(s(r.articleId)) && startedBy(r.startAt, now)) : [];
  const runsBy = new Map<string, Row[]>();
  for (const r of runs) { const l = runsBy.get(s(r.articleId)); if (l) l.push(r); else runsBy.set(s(r.articleId), [r]); }
  const due = new Map<string, Date | null>();
  for (const r of assignedRows) {
    const d = r.dueAt ? toDate(r.dueAt) : null, prev = due.get(s(r.articleId));
    due.set(s(r.articleId), prev === undefined ? d : prev && d ? (d < prev ? d : prev) : prev ?? d);
  }
  const cards: ArticleCard[] = [];
  for (const a of arts) {
    const vs = versions.get(s(a.id)) ?? [];
    if (!vs.length) continue;
    const vl = chooseVersion(level, vs.map((v) => ({ level: Number(v.level), estLevel: v.estLevel, officialLexile: v.officialLexile })));
    const v = vs.find((x) => Number(x.level) === vl)!;
    const mine = runsBy.get(s(a.id)) ?? [];
    const main = mine.filter((r) => r.stretch !== true);
    // r85 audit: don't show a score from an Unreliable (2+ rapid-guess) run on the library tile — it's excluded
    // from level/mastery/goal logic everywhere else (engine.ts's countsForLevel), so the tile shouldn't make it
    // look like a normal, counted result either. The article is still shown as DONE (below) since it was scored.
    const first = main.find((r) => r.firstTry === true && r.score !== null && r.score !== undefined && r.unreliable !== true);
    const open = mine.some((r) => r.step !== "DONE");
    const done = main.some((r) => r.step === "DONE");
    const stretchDone = mine.some((r) => r.stretch === true && r.step === "DONE");
    cards.push({
      id: s(a.id), title: s(v.title) || s(a.title), topic: s(a.topic), summary: s(a.summary), minutes: minutesFor(Number(v.wordCount) || 0), versionLevel: vl,
      status: open ? "IN_PROGRESS" : done ? "DONE" : "NEW", firstTryScore: first ? Number(first.score) : null,
      // ⬆ r## owner: Stretch only offered after a strong score (75%+, ENGINE.up) — matches the help text shown next
      // to the button ("75%+ counts toward your goal and can help you move up"). Before this, Stretch showed for
      // ANY completed reading regardless of score, including a reading that had JUST dropped the student's level.
      canStretch: done && !stretchDone && !open && first !== undefined && Number(first.score) >= ENGINE.up && vs.some((x) => Number(x.level) > vl), stretchDone,
      assigned: due.has(s(a.id)), dueAt: due.get(s(a.id))?.toISOString() ?? null,
    });
  }
  const topics = [...new Set(cards.map((c) => c.topic))].filter(Boolean).sort();
  const q = (filter.q ?? "").trim().toLowerCase(), topic = (filter.topic ?? "").trim();
  const titleOf = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const match = (c: ArticleCard) => (!topic || c.topic === topic) && (!q || `${c.title} ${c.topic} ${c.summary}`.toLowerCase().includes(q) || (titleOf.get(c.id) ?? "").toLowerCase().includes(q));
  const byTitle = (a: ArticleCard, b: ArticleCard) => a.title.localeCompare(b.title);
  const assigned = cards.filter((c) => c.assigned && match(c)).sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || byTitle(a, b));
  const recommended = recommend(cards.filter((c) => !c.assigned && c.status === "NEW" && match(c)), runs, arts, now);
  const all = cards.filter(match).sort((a, b) => ["IN_PROGRESS", "NEW", "DONE"].indexOf(a.status) - ["IN_PROGRESS", "NEW", "DONE"].indexOf(b.status) || byTitle(a, b));
  return { level, assigned, recommended, all, topics, query: filter.q ?? "", topic };
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
}
export interface RunView {
  runId: string; articleId: string; step: RunStep; stretch: boolean; firstTry: boolean; versionLevel: number; band: RRBand;
  title: string; topic: string; poll: string; prePoll: number | null; postPoll: number | null;
  body: string; keyWords: KeyWord[]; annotations: Annotation[]; readSeconds: number; listened: boolean;
  questions: QuestionView[]; score: number | null; answers: Record<string, string> | null; review: Review[] | null;
  prompt: string; checklist: string[]; writing: string; writingScore: number | null; writingComment: string | null;
  /** ✍️ owner r##: a curated model (strong) answer to the writing prompt — only sent once the student has
   * submitted their OWN writing (never before: showing it earlier would let a student just copy it instead of
   * thinking). null when the article has none yet, or the student has not written their answer. */
  modelAnswer: string | null;
  done: DoneView | null;
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

async function goalFor(repo: Repo, studentId: string, now: Date): Promise<GoalStats> {
  const rr = await repo.findUnique("RRStudent", { studentId });
  const runs = await repo.findMany("RRRun", { studentId, firstTry: true, score: { gte: ENGINE.up } }, { select: ["completedAt", "unreliable"] });
  // an Unreliable run (2+ rapid answers) never counts toward the goal
  return goalStats(runs.filter((r) => r.completedAt && r.unreliable !== true && r.unreliable !== 1).map((r) => toDate(r.completedAt)), Number(rr?.weeklyGoal ?? 2), now);
}

/** Everything the reader needs for one run (answers hidden until the activity is scored). */
export async function runView(repo: Repo, actor: Actor, runId: string, now = new Date()): Promise<RunView> {
  const run = await ownRun(repo, actor, runId);
  const articleId = s(run.articleId);
  const [art, ver, prompt, qs] = await Promise.all([
    repo.findUnique("RRArticle", { id: articleId }),
    repo.findUnique("RRVersion", { articleId, level: Number(run.versionLevel) }),
    repo.findUnique("RRPrompt", { articleId, band: s(run.band) }),
    questionsOf(repo, articleId, s(run.band)),
  ]);
  const version = ver, pr = prompt;
  const body = s(version?.body);
  const scored = run.score !== null && run.score !== undefined;
  const answers = scored && run.answers && typeof run.answers === "object" ? (run.answers as Record<string, string>) : null;
  let done: DoneView | null = null;
  const keyWords = keyWordsFor(repo, articleId, s(run.band), body); // read alongside the rest
  keyWords.catch(() => undefined); // (awaited below; never an unhandled rejection meanwhile)
  if (run.step === "DONE") {
    const studentId = s(run.studentId);
    const [vers, rr, others, goal] = await Promise.all([
      repo.findMany("RRVersion", { articleId }, { select: MEASURE_COLS }),
      ensureRRStudent(repo, studentId, now),
      repo.findMany("RRRun", { studentId, articleId, stretch: true }, { select: ["id"] }),
      goalFor(repo, studentId, now),
    ]);
    done = {
      score: scored ? Number(run.score) : null, firstTry: run.firstTry === true, stretch: run.stretch === true,
      levelBefore: Number(run.levelBefore), levelAfter: Number(run.levelAfter ?? run.levelBefore), goal,
      // ⬆ r## owner: same 75%+ guard as studentLibrary's canStretch — a reading that just scored low (and may have
      // just dropped the level) must not also offer a harder version right away.
      canStretch: run.stretch !== true && !others.length && scored && Number(run.score) >= ENGINE.up && stretchVersion(Number(rr.level), asMeasured(vers)) !== null,
      prePoll: run.prePoll === null || run.prePoll === undefined ? null : Number(run.prePoll), postPoll: run.postPoll === null || run.postPoll === undefined ? null : Number(run.postPoll),
      tooFast: run.unreliable === true || run.unreliable === 1,
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
    done,
  };
}

export interface ArticlePage { articleId: string; title: string; topic: string; summary: string; minutes: number; versionLevel: number; run: RunView | null; canStretch: boolean; hasRead: boolean; level: number }

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
  const stretchUsed = runs.some((r) => r.stretch === true);
  return {
    articleId, title: s(v.title) || s(art.title), topic: s(art.topic), summary: s(art.summary), minutes: minutesFor(Number(v.wordCount) || 0), versionLevel: vl, level: Number(rr.level),
    run: latest ? await runView(repo, actor, s(latest.id), now) : null,
    // ⬆ r## owner: same 75%+ guard — see studentLibrary's canStretch
    canStretch: !open && !stretchUsed && runs.some((r) => r.stretch !== true && r.step === "DONE" && Number(r.score ?? 0) >= ENGINE.up) && stretchVersion(Number(rr.level), asMeasured(vers)) !== null,
    hasRead: runs.some((r) => r.step === "DONE"),
  };
}

/** Starts a reading (or returns the open one). stretch = the same article one version higher (after reading it). */
export async function startRun(repo: Repo, actor: Actor, articleId: string, opts: { stretch?: boolean } = {}, now = new Date()): Promise<RunView> {
  const { studentId, schoolId } = studentOf(actor);
  await visibleArticle(repo, schoolId, articleId);
  const id = await repo.transaction(async (tx) => {
    const runs = await tx.findMany("RRRun", { studentId, articleId });
    const open = runs.find((r) => r.step !== "DONE");
    if (open) return s(open.id);
    const rr = await ensureRRStudent(tx, studentId, now);
    const level = Number(rr.level);
    const levels = asMeasured(await tx.findMany("RRVersion", { articleId }, { select: MEASURE_COLS }));
    if (!levels.length) throw new ForbiddenError("Article not found.");
    let versionLevel: number;
    if (opts.stretch) {
      if (!runs.some((r) => r.stretch !== true && r.step === "DONE")) throw new ValidationError("Read the article first, then stretch it.");
      // ⬆ r## owner: server-side copy of the 75%+ guard above (never trust the button being hidden client-side) —
      // a low score must not unlock a harder version right after it.
      if (!runs.some((r) => r.stretch !== true && r.step === "DONE" && Number(r.score ?? 0) >= ENGINE.up)) throw new ValidationError(`Score ${ENGINE.up}% or higher on this article first, then you can stretch it.`);
      if (runs.some((r) => r.stretch === true)) throw new ValidationError("You already stretched this article.");
      const up = stretchVersion(level, levels);
      if (up === null) throw new ValidationError("There is no higher version of this article.");
      versionLevel = up;
    } else versionLevel = chooseVersion(level, levels);
    const firstTry = !runs.some((r) => (r.stretch === true) === Boolean(opts.stretch));
    const row = await tx.create("RRRun", {
      studentId, schoolId, articleId, versionLevel, band: bandOf(versionLevel), step: "PREPOLL", levelBefore: level,
      firstTry, stretch: Boolean(opts.stretch), listened: false, startedAt: now,
    });
    return s(row.id);
  });
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
    // first try counts; a stretch below 75% is ignored by the level (never lowers it); an Unreliable run never counts
    if (run.firstTry === true && !fast.unreliable && (run.stretch !== true || pct >= ENGINE.up)) ({ levelBefore: before, levelAfter: after } = await applyFirstTryScore(tx, { ...run, score: pct, completedAt: now, unreliable: false }, now));
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
  await repo.updateMany("RRRun", { id: runId, step: "WRITE" }, { writing: t, step: "POSTPOLL" });
  // 🤖 draft an AI score + comment for the teacher's scoring screen (never shown to the student) — after the
  // response, so the student is never kept waiting on an AI call; silently skipped if AI is off/limited/fails
  runAfterResponse("readrise.writing_ai", async () => {
    const pr = await repo.findUnique("RRPrompt", { articleId: s(run.articleId), band: s(run.band) });
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
  await repo.updateMany("RRRun", { id: runId, step: "POSTPOLL" }, { postPoll: pollValue(value), step: "DONE" });
  return runView(repo, actor, runId, now);
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
}

/**
 * 🔒 ReadRise articles are locked until the student finished the placement (or a teacher set the level), as long as
 * the placement test is available (5+ passages). Without the test the articles stay open, with no level number shown.
 */
export async function readRiseAccess(repo: Repo, studentId: string, passages: PlacementPassage[] = loadPlacementPassages()): Promise<{ placed: boolean; locked: boolean }> {
  const [rr, done] = await Promise.all([repo.findUnique("RRStudent", { studentId }), repo.count("RRPlacement", { studentId, completedAt: { not: null } })]);
  const placed = readRisePlaced(rr, done > 0);
  return { placed, locked: !placed && passages.length >= 5 };
}

/** Everything /student/readrise shows: level, goal, streak, growth + projection, placement prompt and the library. */
export async function readRiseHome(repo: Repo, actor: Actor, filter: { q?: string; topic?: string } = {}, now = new Date(), passages: PlacementPassage[] = loadPlacementPassages()): Promise<ReadRiseHome> {
  const { studentId, schoolId } = studentOf(actor);
  const [library, yearEnd, pst, windows] = await Promise.all([
    studentLibrary(repo, actor, filter, now), // creates the RRStudent row on first use
    yearEndFor(repo, schoolId, now), placementStatus(repo, studentId, now), loadReadRiseWindows(repo, schoolId, now),
  ]);
  const [summary, hist, placements] = await Promise.all([
    studentReadRiseSummary(repo, studentId, now), levelHistory(repo, studentId),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null } }, { select: ["result", "period", "completedAt"], take: 50 }),
  ]);
  const ready = passages.length >= 5;
  const state = pst.open ? "OPEN" : !ready ? "NONE" : !pst.last ? "NEED" : pst.retake ? "RETAKE" : pst.due ? "CHECK" : "NONE";
  return {
    library, summary: summary!,
    growth: { points: hist.points.map((p) => ({ at: p.at.toISOString(), level: p.level })), projected: summary!.projected, yearEnd: yearEnd.toISOString() },
    placement: { state, result: pst.last ? Number(pst.last.result) : null, doneAt: pst.last?.completedAt ? new Date(pst.last.completedAt instanceof Date ? pst.last.completedAt.toISOString() : String(pst.last.completedAt)).toISOString() : null, ready, due: pst.due, checks: placementChecks(windows, placements) },
    placed: summary!.placed, locked: !summary!.placed && ready,
  };
}
