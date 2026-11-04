/**
 * 🧭 ReadRise "Recommended for you" and "Read next" (Achieve3000-style), each pick with a short reason.
 *
 *  recommendFor  6 NEW, not-assigned articles: 2 for the student's weakest reading skills (the question types where
 *                their careful first-try accuracy is lowest — first-try.ts tallyRuns + tallyAnswers; the article whose
 *                questions in the student's band have that skill most), 2 from the topics they like (interests.ts),
 *                2 from topics not read in the last 30 days; gaps are filled from the rest. The order inside every
 *                group is a DAILY shuffle (seed = student + Riyadh day): the same all day, new the next day.
 *  readNext      after a reading: a teacher's article not done yet (earliest due) → the same article one level up
 *                (75%+ and a stretch is allowed) → a new topic (75%+) → the skill missed most in THIS reading
 *                (50–74%) → a topic they like at their level (< 50%). Never an article already done or open, never a
 *                hidden / unpublished article (student.ts visibleArticles), never a cancelled one (hiddenWorkKeys).
 * Bounded reads: the student's own runs (needed columns), the answer keys (cached, question-key.ts), one settings row.
 */
import { createHash } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { riyadhDay, s, toDate } from "./engine";
import { baseBand, keyRowsLookup, normalisedSkill, tallyAnswers, tallyBy, tallyRuns } from "./first-try";
import { QUESTION_TYPES, QUESTION_TYPE_NAME, normalizeQuestionType, type QuestionType } from "./question-type";
import { questionKeys } from "./question-key";
import { bandOf, RR_MIN } from "./level";
import { getInterests } from "./interests";
import { visibleArticles } from "./student";
import { hiddenWorkKeys } from "../student/cancelled-work";
import { startedBy } from "../../lib/assign-dates";
import type { TFn } from "../../i18n";

const DAY = 86_400_000;
/** a topic read (started) in this many days is not "new" */
export const RECENT_DAYS = 30;
/** a skill needs this many careful answers before it can be called weak */
export const WEAK_MIN_ANSWERS = 3;
/** a skill at or above this accuracy is not weak */
export const WEAK_BELOW = 80;
export const GOOD_SCORE = 75, OK_SCORE = 50;

export interface RecommendReason {
  kind: "TEACHER" | "SKILL" | "INTEREST" | "NEW_TOPIC" | "STRETCH" | "EASIER";
  /** English text with its emoji (translate with reasonLabel) */
  label: string;
  /** SKILL: the question type (central-idea, detail …) */
  skill?: string;
  /** INTEREST / NEW_TOPIC: the topic */
  topic?: string;
  /** TEACHER: the due date (ISO), when there is one */
  due?: string | null;
}
export interface CardLite { id: string; topic: string; status: "NEW" | "IN_PROGRESS" | "DONE"; assigned: boolean; dueAt: string | null }

// ------------------------------------------------------------------ labels

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dueDay = (iso: string) => { const d = riyadhDay(iso); return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`; };
const skillName = (skill: string) => QUESTION_TYPE_NAME[(normalizeQuestionType(skill) ?? "detail") as QuestionType];

export const reasons = {
  teacher: (due: string | null): RecommendReason => ({ kind: "TEACHER", label: due ? `📌 From your teacher · due ${dueDay(due)}` : "📌 From your teacher", due }),
  skill: (skill: string): RecommendReason => ({ kind: "SKILL", label: `🎯 Practise: ${skillName(skill)}`, skill }),
  interest: (topic: string): RecommendReason => ({ kind: "INTEREST", label: `❤️ You like: ${topic}`, topic }),
  newTopic: (topic: string): RecommendReason => ({ kind: "NEW_TOPIC", label: "🌍 New topic for you", topic }),
  more: (topic: string): RecommendReason => ({ kind: "NEW_TOPIC", label: "📚 A good read for you", topic }),
  stretch: (): RecommendReason => ({ kind: "STRETCH", label: "⬆ Great! Try it one level up" }),
  easier: (): RecommendReason => ({ kind: "EASIER", label: "💪 Another one to build your skill" }),
};

/** The reason in the reader's language (every template and skill name is in the UI strings). */
export function reasonLabel(r: RecommendReason, t: TFn): string {
  switch (r.kind) {
    case "TEACHER": {
      if (!r.due) return t("📌 From your teacher");
      const d = riyadhDay(r.due);
      return t("📌 From your teacher · due {day}", { day: `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` });
    }
    case "SKILL": return t("🎯 Practise: {skill}", { skill: t(skillName(r.skill ?? "")) });
    case "INTEREST": return t("❤️ You like: {topic}", { topic: t(r.topic ?? "") });
    case "NEW_TOPIC": return r.label.startsWith("🌍") ? t("🌍 New topic for you") : t("📚 A good read for you");
    case "STRETCH": return t("⬆ Great! Try it one level up");
    default: return t("💪 Another one to build your skill");
  }
}

// ------------------------------------------------------------------ helpers (pure)

/** A deterministic shuffle (sha-256 seeded). */
export function seededOrder<T>(arr: readonly T[], seed: string): T[] {
  const out = [...arr];
  let h = BigInt("0x" + createHash("sha256").update(seed).digest("hex"));
  for (let i = out.length - 1; i > 0; i--) { const j = Number(h % BigInt(i + 1)); h /= BigInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** The daily seed: the same all (Riyadh) day for a student, another one tomorrow. */
export const dailySeed = (studentId: string, now: Date) => `${studentId}|${riyadhDay(now)}`;

/** How many questions of each type an article has in a band (from the answer keys). */
function skillCount(key: Map<string, { band: string; skill: string }[]>, articleId: string, band: string, skill: string): number {
  return (key.get(articleId) ?? []).filter((q) => q.band === band && normalisedSkill(q.skill) === skill).length;
}

/** The weakest question types (lowest careful first-try accuracy, enough answers, under WEAK_BELOW), weakest first. */
export function weakSkills(tally: Map<string, [number, number]>, take = 2): string[] {
  return [...tally.entries()]
    .filter(([, [, n]]) => n >= WEAK_MIN_ANSWERS)
    .map(([k, [c, n]]) => ({ k, pct: (100 * c) / n, n }))
    .filter((x) => x.pct < WEAK_BELOW)
    .sort((a, b) => a.pct - b.pct || b.n - a.n || QUESTION_TYPES.indexOf(a.k as QuestionType) - QUESTION_TYPES.indexOf(b.k as QuestionType))
    .slice(0, take).map((x) => x.k);
}

/** at most this many pool articles get their answer keys read for a skill pick (the daily order's first ones) */
export const SKILL_CANDIDATES = 60;
/** the weak skills come from the student's most recent counted first tries (at most this many) */
export const WEAK_RUNS = 60;

/**
 * ⚡ Answer keys with single-flight: concurrent visits asking for the same articles share ONE read (questionKeys has
 * its own short cache but no in-flight sharing — 30 students opening the library after it expires would each read).
 */
const inflight = new WeakMap<object, Map<string, Promise<Map<string, { band: string; number: number; answer: string; skill: string }[]>>>>();
export function sharedKeys(repo: Repo, articleIds: readonly string[]): ReturnType<typeof questionKeys> {
  const ids = [...new Set(articleIds.map(String))].sort();
  if (!ids.length) return Promise.resolve(new Map());
  let m = inflight.get(repo); if (!m) inflight.set(repo, (m = new Map()));
  const k = createHash("sha1").update(ids.join(",")).digest("hex");
  const have = m.get(k);
  if (have) return have;
  const p = questionKeys(repo, ids).finally(() => m!.delete(k));
  m.set(k, p);
  return p;
}

const RUN_COLS = ["studentId", "articleId", "band", "step", "answers", "answerMs", "score", "firstTry", "stretch", "completedAt", "startedAt", "unreliable", "readSeconds"];

async function studentBand(repo: Repo, studentId: string, fallback?: string): Promise<string> {
  if (fallback) return fallback;
  const rr = await repo.findUnique("RRStudent", { studentId });
  return bandOf(rr ? Number(rr.level) : RR_MIN + 400);
}

// ------------------------------------------------------------------ recommendFor

/**
 * `pre` = rows the caller already read (the student's RRRun rows with RUN_COLS-like columns: studentId, articleId,
 * band, answers, answerMs, score, firstTry, stretch, completedAt, startedAt, unreliable, readSeconds; their interests)
 * so a library visit reads them once.
 */
export async function recommendFor(repo: Repo, studentId: string, schoolId: string, cards: readonly CardLite[], now = new Date(), take = 6, pre?: { runs?: Row[]; interests?: string[] }): Promise<{ articleId: string; reason: RecommendReason }[]> {
  const pool = cards.filter((c) => c.status === "NEW" && !c.assigned);
  if (!pool.length || take <= 0) return [];
  void schoolId; // the cards are already the school's visible articles
  const [runs, interests, band] = await Promise.all([
    pre?.runs ? Promise.resolve(pre.runs) : repo.findMany("RRRun", { studentId }, { select: RUN_COLS }),
    pre?.interests ? Promise.resolve(pre.interests) : getInterests(repo, studentId),
    studentBand(repo, studentId),
  ]);
  const topicOf = new Map(cards.map((c) => [c.id, c.topic]));
  const recent = new Set(runs.filter((r) => now.getTime() - toDate(r.startedAt).getTime() <= RECENT_DAYS * DAY).map((r) => topicOf.get(s(r.articleId)) ?? "").filter(Boolean));
  // the weak skills: careful answers of counted, reliable first tries
  // (the student's own keys first; the pool's keys only when there is a weak skill, for a bounded candidate set)
  const counted = tallyRuns(runs).sort((a, b) => toDate(b.completedAt).getTime() - toDate(a.completedAt).getTime()).slice(0, WEAK_RUNS);
  const own = counted.length ? await sharedKeys(repo, counted.map((r) => s(r.articleId))) : new Map();
  const weak = weakSkills(tallyBy(tallyAnswers(counted, keyRowsLookup(own)), (a) => a.type));

  const order = seededOrder(pool, dailySeed(studentId, now));
  // articles outside the candidate set have no keys here: skillCount() is 0 for them (never a skill pick)
  const key = weak.length ? await sharedKeys(repo, order.slice(0, SKILL_CANDIDATES).map((c) => c.id)) : new Map<string, { band: string; skill: string }[]>();
  const used = new Set<string>(), usedTopics = new Map<string, number>();
  const take1 = (c: CardLite) => { used.add(c.id); usedTopics.set(c.topic, (usedTopics.get(c.topic) ?? 0) + 1); return c; };
  const free = () => order.filter((c) => !used.has(c.id));
  /** among the free cards that pass, the first with the fewest picks of its topic so far (variety), else none */
  const pick = (ok: (c: CardLite) => boolean, score: (c: CardLite) => number = () => 0): CardLite | null => {
    const xs = free().filter(ok);
    if (!xs.length) return null;
    return take1(xs.reduce((best, c) => (score(c) > score(best) || (score(c) === score(best) && (usedTopics.get(c.topic) ?? 0) < (usedTopics.get(best.topic) ?? 0)) ? c : best), xs[0]));
  };

  const skillPicks: { articleId: string; reason: RecommendReason }[] = [];
  for (let i = 0; skillPicks.length < 2 && weak.length && i < 2; i++) {
    const skill = weak[i % weak.length];
    const c = pick((x) => skillCount(key, x.id, band, skill) > 0, (x) => skillCount(key, x.id, band, skill));
    if (c) skillPicks.push({ articleId: c.id, reason: reasons.skill(skill) });
  }
  const liked = new Set(interests);
  const interestPicks: { articleId: string; reason: RecommendReason }[] = [];
  for (let i = 0; interestPicks.length < 2 && i < 2; i++) {
    // a different liked topic each time when possible
    const c = pick((x) => liked.has(x.topic), (x) => -(usedTopics.get(x.topic) ?? 0));
    if (c) interestPicks.push({ articleId: c.id, reason: reasons.interest(c.topic) });
  }
  const newPicks: { articleId: string; reason: RecommendReason }[] = [];
  for (let i = 0; newPicks.length < 2 && i < 2; i++) {
    const c = pick((x) => !recent.has(x.topic) && !usedTopics.has(x.topic)) ?? pick((x) => !recent.has(x.topic));
    if (c) newPicks.push({ articleId: c.id, reason: reasons.newTopic(c.topic) });
  }
  // interleave the groups (variety at the top), then fill the gaps
  const out: { articleId: string; reason: RecommendReason }[] = [];
  for (let i = 0; i < 2; i++) for (const g of [skillPicks, interestPicks, newPicks]) if (g[i]) out.push(g[i]);
  while (out.length < take) {
    const c = pick(() => true, (x) => -(usedTopics.get(x.topic) ?? 0));
    if (!c) break;
    const skill = weak.find((k) => skillCount(key, c.id, band, k) > 0);
    out.push({ articleId: c.id, reason: liked.has(c.topic) ? reasons.interest(c.topic) : !recent.has(c.topic) ? reasons.newTopic(c.topic) : skill ? reasons.skill(skill) : reasons.more(c.topic) });
  }
  return out.slice(0, take);
}

// ------------------------------------------------------------------ readNext

export interface FinishedRun { articleId: string; score: number | null; firstTry: boolean; stretch: boolean; band: string; canStretch: boolean }

/** The question type missed most in one run's answers (ties: the list order), null when nothing was missed. */
export function mostMissed(answers: unknown, questions: readonly { number: number; answer: string; skill: string }[]): string | null {
  const tally = tallyBy(tallyAnswers([{ articleId: "a", band: "b", answers, rapid: [] }], () => questions), (a) => a.type);
  let best: string | null = null, miss = 0;
  for (const k of QUESTION_TYPES) { const c = tally.get(k); const m = c ? c[1] - c[0] : 0; if (m > miss) { miss = m; best = k; } }
  return best;
}

export async function readNext(repo: Repo, studentId: string, schoolId: string, finished: FinishedRun, now = new Date()): Promise<{ articleId: string; title: string; reason: RecommendReason; stretch: boolean } | null> {
  const [arts, runs, mems, hidden, interests] = await Promise.all([
    visibleArticles(repo, schoolId),
    repo.findMany("RRRun", { studentId }, { select: RUN_COLS }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
    hiddenWorkKeys(repo, studentId, schoolId),
    getInterests(repo, studentId),
  ]);
  const byId = new Map(arts.map((a) => [s(a.id), a]));
  const touched = new Set([finished.articleId, ...runs.map((r) => s(r.articleId))]); // done or open: never offered
  const titleOf = (id: string) => s(byId.get(id)?.title);
  const fresh = arts.filter((a) => !touched.has(s(a.id)) && !hidden.has(`readrise:${s(a.id)}`));

  // 1. the teacher's articles not read yet, earliest due first (no due date last)
  if (mems.length) {
    const rows = (await repo.findMany("RRClassArticle", { classId: { in: mems.map((m) => s(m.classId)) } }, { select: ["articleId", "dueAt", "startAt"] }))
      .filter((r) => startedBy(r.startAt, now) && byId.has(s(r.articleId)) && !touched.has(s(r.articleId)) && !hidden.has(`readrise:${s(r.articleId)}`));
    const due = new Map<string, number>();
    for (const r of rows) { const d = r.dueAt ? toDate(r.dueAt).getTime() : Infinity; const id = s(r.articleId); due.set(id, Math.min(due.get(id) ?? Infinity, d)); }
    const first = [...due.entries()].sort((a, b) => a[1] - b[1] || titleOf(a[0]).localeCompare(titleOf(b[0])))[0];
    if (first) return { articleId: first[0], title: titleOf(first[0]), reason: reasons.teacher(Number.isFinite(first[1]) ? new Date(first[1]).toISOString() : null), stretch: false };
  }
  const score = finished.score;
  // 2. a strong reading: the same article one level up
  if (score !== null && score >= GOOD_SCORE && finished.canStretch && byId.has(finished.articleId) && !hidden.has(`readrise:${finished.articleId}`)) {
    const open = runs.some((r) => s(r.articleId) === finished.articleId && r.step !== "DONE");
    if (!open) return { articleId: finished.articleId, title: titleOf(finished.articleId), reason: reasons.stretch(), stretch: true };
  }
  if (!fresh.length) return null;
  const order = seededOrder(fresh, `${dailySeed(studentId, now)}|${finished.articleId}`);
  const out = (a: Row, reason: RecommendReason) => ({ articleId: s(a.id), title: s(a.title), reason, stretch: false });
  const topicOfRun = new Map(arts.map((a) => [s(a.id), s(a.topic)]));
  const recent = new Set(runs.filter((r) => now.getTime() - toDate(r.startedAt).getTime() <= RECENT_DAYS * DAY).map((r) => topicOfRun.get(s(r.articleId)) ?? "").filter(Boolean));
  const thisTopic = topicOfRun.get(finished.articleId) ?? "";
  const newTopic = () => {
    const a = order.find((x) => !recent.has(s(x.topic)) && s(x.topic) !== thisTopic) ?? order.find((x) => s(x.topic) !== thisTopic) ?? order[0];
    return out(a, reasons.newTopic(s(a.topic)));
  };
  // 3. 75%+ (or no score): a new topic
  if (score === null || score >= GOOD_SCORE) return newTopic();
  // 4. 50–74%: the skill missed most in THIS reading
  if (score >= OK_SCORE) {
    const run = runs.filter((r) => s(r.articleId) === finished.articleId && (r.stretch === true) === finished.stretch && r.completedAt)
      .sort((a, b) => toDate(b.completedAt).getTime() - toDate(a.completedAt).getTime())[0];
    const mine = run ? await sharedKeys(repo, [finished.articleId]) : new Map();
    const skill = run ? mostMissed(run.answers, (mine.get(finished.articleId) ?? []).filter((q: { band: string }) => q.band === finished.band)) : null;
    if (skill) {
      const key = await sharedKeys(repo, order.slice(0, SKILL_CANDIDATES).map((a) => s(a.id)));
      let best: Row | null = null, n = 0;
      for (const a of order) { const c = skillCount(key, s(a.id), baseBand(finished.band), skill); /* another article: its own band's questions */ if (c > n) { n = c; best = a; } }
      if (best) return out(best, reasons.skill(skill));
    }
    return newTopic();
  }
  // 5. under 50%: a topic they like, at their level (every article is read at the student's own level)
  const liked = new Set(interests);
  const a = order.find((x) => liked.has(s(x.topic))) ?? order.find((x) => s(x.topic) === thisTopic) ?? order[0];
  return out(a, reasons.easier());
}
