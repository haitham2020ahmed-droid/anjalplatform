/**
 * 🧭 The student's language profile (student file): the seven language strands — Reading Literature, Reading
 * Informational, Vocabulary, Grammar & Usage, Mechanics, Writing, Fluency — each with
 *   level     BELOW / ON / ABOVE from the average STAR score of the strand's started skills (TEACHER-FACING ONLY:
 *             never shown to students or families)
 *   mastered  skills mastered x of y, both counted by skill KEY (copies of a skill — two grades, a lesson name — are
 *             ONE skill): x = the ⭐ keys (src/server/reports/mastered-count.ts, the ONE star system), y = the keys of
 *             the strand's skills of the student's grade + any other skill practised
 *   trend     ↑ → ↓ over the last 4 weeks (the last 2 weeks' accuracy against the 2 weeks before)
 *   next      the main next step: a started skill without ⭐ (🔄 first, then needing support, then the lowest score),
 *             else the first not started — never a ⭐ skill
 * Fluency comes from the Fluency Coach one-minute readings (words correct per minute and their level); Writing from
 * the Writing skills and, when there are none, the graded writing (rubric %).
 * Bounded: 6 queries for one student (the grade's skills, mastery, 4 weeks of answers, fluency, writing).
 */
import type { Repo, Row } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { masteredSkills } from "../reports/mastered-count";
import { safeIfBehind } from "../db/schema-errors";
import { starBook, starMastered, starNeedsReview } from "../skills/star-read";
import type { StarView } from "../skills/status";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const DAY = 86_400_000;

export type StrandKey = "RL" | "RI" | "VOC" | "GRAM" | "MECH" | "WRIT" | "FLU";
export type StrandLevel = "BELOW" | "ON" | "ABOVE";
export type Trend = "up" | "flat" | "down";
export const STRANDS: readonly { key: StrandKey; label: string; icon: string }[] = [
  { key: "RL", label: "Reading Literature", icon: "📖" },
  { key: "RI", label: "Reading Informational", icon: "📰" },
  { key: "VOC", label: "Vocabulary", icon: "🔤" },
  { key: "GRAM", label: "Grammar & Usage", icon: "🧱" },
  { key: "MECH", label: "Mechanics", icon: "✏️" },
  { key: "WRIT", label: "Writing", icon: "🖊" },
  { key: "FLU", label: "Fluency", icon: "🎙️" },
];
export const TREND_ARROW: Record<Trend, string> = { up: "↑", flat: "→", down: "↓" };

/** Story words in a comprehension skill's code: it belongs to Reading Literature. */
const LITERARY = /theme|character|plot|story|poem|poetry|drama|narrat|point-of-view|setting|myth|fable|folk|stanza|dialogue|flashback|foreshadow/i;

/** The strand of a skill (null: not a language skill shown in the profile). */
export function strandOfSkill(k: { code?: unknown; category?: unknown; domain?: unknown } | Record<string, unknown>): StrandKey | null {
  const cat = s(k.category), dom = s(k.domain), code = s(k.code);
  if (cat === "LITERATURE") return "RL";
  if (cat === "INFORMATIONAL") return "RI";
  if (cat === "COMPREHENSION") return LITERARY.test(code) ? "RL" : "RI";
  if (cat === "VOCABULARY" || cat === "WORD_STUDY" || cat === "PHONICS_WORD_STUDY") return "VOC";
  if (cat === "GRAMMAR") return "GRAM";
  if (cat === "MECHANICS") return "MECH";
  if (cat === "WRITING") return "WRIT";
  if (dom === "READING") return LITERARY.test(code) ? "RL" : "RI";
  if (dom === "VOCABULARY" || dom === "WORD_STUDY") return "VOC";
  if (dom === "GRAMMAR" || dom === "LANGUAGE") return "GRAM";
  if (dom === "WRITING") return "WRIT";
  return null;
}

/** The strand's level from the average mastery of its practised skills (teacher-facing). */
export function strandLevel(avg: number | null): StrandLevel | null {
  if (avg === null) return null;
  return avg >= 80 ? "ABOVE" : avg >= 55 ? "ON" : "BELOW";
}

/** ↑ → ↓: the last 2 weeks against the 2 weeks before (4+ answers in each; 8 points of accuracy make a change). */
export function trendOf(recent: { n: number; ok: number }, earlier: { n: number; ok: number }): Trend {
  if (recent.n < 4 || earlier.n < 4) return "flat";
  const d = (100 * recent.ok) / recent.n - (100 * earlier.ok) / earlier.n;
  return d >= 8 ? "up" : d <= -8 ? "down" : "flat";
}

export interface StrandRow {
  key: StrandKey; label: string; icon: string;
  level: StrandLevel | null;
  /** null for Fluency (no skills to count) */
  mastered: number | null; total: number | null;
  trend: Trend;
  /** the main next step (a skill to practise), or a plain line for Fluency / Writing */
  next: { skillId: string | null; text: string } | null;
  /** answers in the last 4 weeks */
  answers: number;
  /** Fluency: the latest words correct per minute */
  wcpm?: number | null;
}

interface SkillRow { id: string; name: string; code: string; category: string; domain: string; sequence: number }

/**
 * Pure: builds the seven rows from the loaded data (exported for the tests). With `stars` (the ONE star system), the
 * skills are counted by KEY (`stars.keyOf`), the level comes from the star scores and the next step skips ⭐; without
 * it each skill id is its own key and the engine score orders (the pure tests).
 */
export function buildStrands(input: {
  skills: SkillRow[]; mastery: Row[]; mastered: Set<string>; attempts: Row[]; fluency: Row[]; writing: Row[]; now: Date;
  stars?: { keyOf: (skillId: string) => string; ofKey: (key: string) => StarView; nameOf: (key: string) => string };
}): StrandRow[] {
  const { skills, mastery, mastered, attempts, fluency, writing, now, stars } = input;
  const keyOf = (id: string) => (stars ? stars.keyOf(id) : id);
  const strandOf = new Map(skills.map((k) => [k.id, strandOfSkill(k)]));
  const byId = new Map(skills.map((k) => [k.id, k]));
  const m = new Map(mastery.map((r) => [s(r.skillId), r]));
  const cut2 = now.getTime() - 14 * DAY, cut4 = now.getTime() - 28 * DAY;
  return STRANDS.map(({ key, label, icon }): StrandRow => {
    if (key === "FLU") {
      const mins = fluency.filter((r) => s(r.mode) === "MINUTE" && r.wcpm !== null && r.wcpm !== undefined).sort((a, b) => time(b.createdAt) - time(a.createdAt));
      const latest = mins[0];
      const before = mins.find((r) => time(r.createdAt) < cut4) ?? mins[mins.length - 1];
      const recent = mins.filter((r) => time(r.createdAt) >= cut4);
      const lv = latest ? s(latest.level) : "";
      const delta = latest && before && before !== latest ? Number(latest.wcpm) - Number(before.wcpm) : 0;
      return {
        key, label, icon, mastered: null, total: null, answers: recent.length, wcpm: latest ? Number(latest.wcpm) : null,
        level: lv === "BELOW" || lv === "ON" || lv === "ABOVE" ? lv : null,
        trend: recent.length && delta >= 5 ? "up" : recent.length && delta <= -5 ? "down" : "flat",
        next: latest ? { skillId: null, text: lv === "BELOW" ? "Read aloud daily with the Fluency Coach" : "Keep a weekly one-minute reading" } : { skillId: null, text: "Record a first one-minute reading" },
      };
    }
    const mine = skills.filter((k) => strandOf.get(k.id) === key);
    const ids = new Set(mine.map((k) => k.id));
    // one entry per skill KEY (the first copy, curriculum order, stands for it)
    const keys = new Map<string, SkillRow[]>();
    for (const k of [...mine].sort((a, b) => a.sequence - b.sequence)) { const kk = keyOf(k.id); keys.set(kk, [...(keys.get(kk) ?? []), k]); }
    const engineScore = (list: SkillRow[]) => Math.max(0, ...list.map((k) => Number(m.get(k.id)?.score ?? 0)));
    const isMastered = (kk: string, list: SkillRow[]) => (stars ? starMastered(stars.ofKey(kk)) : false) || list.some((k) => mastered.has(k.id));
    const isStarted = (kk: string, list: SkillRow[]) => (stars ? stars.ofKey(kk).status !== "NOT_STARTED" : list.some((k) => Number(m.get(k.id)?.attempts ?? 0) > 0));
    const scoreOf = (kk: string, list: SkillRow[]) => (stars ? stars.ofKey(kk).score : engineScore(list));
    const practisedKeys = [...keys].filter(([kk, list]) => isStarted(kk, list));
    const avg = practisedKeys.length ? practisedKeys.reduce((t, [kk, list]) => t + scoreOf(kk, list), 0) / practisedKeys.length : null;
    const recent = { n: 0, ok: 0 }, earlier = { n: 0, ok: 0 };
    let answers = 0;
    for (const a of attempts) {
      if (!ids.has(s(a.skillId)) || a.rapidGuess === true || a.rapidGuess === 1) continue;
      const t = time(a.createdAt);
      if (t < cut4) continue;
      answers++;
      const bucket = t >= cut2 ? recent : earlier;
      bucket.n++; if (a.isCorrect === true || a.isCorrect === 1) bucket.ok++;
    }
    // never a ⭐ skill: 🔄 first, then ◐ needing support, then the lowest score; else the first not started
    const rank = (kk: string) => (stars ? (starNeedsReview(stars.ofKey(kk)) ? 0 : stars.ofKey(kk).needsSupport ? 1 : 2) : 2);
    const open = practisedKeys.filter(([kk, list]) => !isMastered(kk, list)).sort(([ka, la], [kb, lb]) => rank(ka) - rank(kb) || scoreOf(ka, la) - scoreOf(kb, lb));
    const fresh = [...keys].filter(([kk, list]) => !isMastered(kk, list) && !isStarted(kk, list));
    const pick = open[0] ?? fresh[0];
    let level = strandLevel(avg);
    if (key === "WRIT" && level === null) {
      const pcts = writing.map((w) => Number(w.scorePct)).filter((x) => Number.isFinite(x) && x > 0);
      if (pcts.length) level = strandLevel(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    }
    return {
      key, label, icon, level, mastered: [...keys].filter(([kk, list]) => isMastered(kk, list)).length, total: keys.size, answers,
      trend: trendOf(recent, earlier),
      next: pick ? { skillId: pick[1][0].id, text: stars ? stars.nameOf(pick[0]) : byId.get(pick[1][0].id)!.name } : null,
    };
  });
}

/** One student's language profile (callers check access). */
export async function languageStrands(repo: Repo, studentId: string, now = new Date()): Promise<StrandRow[]> {
  const st = await repo.findUnique("Student", { id: studentId });
  const curricula = st?.gradeId ? await repo.findMany("Curriculum", { gradeId: s(st.gradeId), deletedAt: null }, { select: ["id"] }) : [];
  const [gradeSkills, mastery, attempts, fluency, writing] = await Promise.all([
    curricula.length ? repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => s(c.id)) }, deletedAt: null }, { select: ["id", "name", "code", "category", "domain", "sequence", "isActive"] }) : Promise.resolve([] as Row[]),
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "score", "attempts", "isMastered"] }),
    repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: new Date(now.getTime() - 28 * DAY) } }, { select: ["skillId", "isCorrect", "rapidGuess", "createdAt"], take: 3000 }),
    repo.findMany("FluencyPractice", { studentId }, { select: ["mode", "wcpm", "level", "createdAt"] }).catch(() => [] as Row[]),
    safeIfBehind("strands.writing", repo.findMany("WritingSubmission", { studentId, status: "SCORED" }, { select: ["scorePct"] }), [] as Row[]),
  ]);
  // the grade's skills + any other skill the student practised (an assignment from another grade)
  const known = new Set(gradeSkills.map((k) => s(k.id)));
  const extraIds = [...new Set([...mastery.map((r) => s(r.skillId)), ...attempts.map((a) => s(a.skillId))])].filter((id) => !known.has(id));
  const extra = extraIds.length ? await repo.findMany("Skill", { id: { in: extraIds } }, { select: ["id", "name", "code", "category", "domain", "sequence", "isActive"] }) : [];
  const skills: SkillRow[] = [...gradeSkills, ...extra].filter((k) => k.isActive !== false && k.isActive !== 0 && !isHiddenSkill(k.code))
    .map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code), category: s(k.category), domain: s(k.domain), sequence: Number(k.sequence ?? 0) }));
  const [masteredMap, book] = await Promise.all([masteredSkills(repo, [studentId], skills.map((k) => k.id)), starBook(repo, [studentId], st ? s(st.schoolId) : null)]);
  const mastered = masteredMap.get(studentId) ?? new Set<string>();
  return buildStrands({ skills, mastery, mastered, attempts, fluency, writing, now, stars: strandStars(book, studentId) });
}

/** The star reader buildStrands counts by (one star book per page). */
export function strandStars(book: Awaited<ReturnType<typeof starBook>>, studentId: string) {
  return { keyOf: book.keyOf, ofKey: (key: string) => book.ofKey(studentId, key), nameOf: book.nameOf };
}
