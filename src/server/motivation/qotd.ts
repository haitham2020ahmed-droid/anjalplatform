/**
 * ☀️ Question of the Day (Games Part 3 — reworks the Update 20 one in place; extras.ts re-exports these).
 *
 *   - ONE question a day, ONE level ABOVE the student's working level, from the bank (questionsOfSkill):
 *     Below → an On Level question · On → an Above Level question · Above → the hardest Above questions (level 6).
 *   - from a skill of the student's My Work (else a skill of their grade), a different skill and question each day
 *     (Saudi days); the same question all day. When no skill question fits, the old pick (MAP goal area) is used.
 *   - one attempt (QotdAnswer is unique per student and day). Right = a big coin reward; wrong = a few coins for the
 *     effort + the correct answer and a short explanation.
 *   - NEVER changes levels, mastery, scores or reports: the answer is graded here and saved only as QotdAnswer,
 *     XpEvent (its few points, as before) and coins.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { TtlCache } from "../lib/ttl-cache";
import { bankVersion, modelVersion } from "../cache/bank-version";
import { correctAnswerText, loadQuestionItems, toClientQuestion, type ClientQuestion } from "../practice/items";
import { gradeItems, type Graded } from "../teacher/worksheet";
import { groupPools, GROUPS, mapProfiles } from "../map/map-plan";
import { questionsOfSkill, schoolSkillIndex, type SkillLevel } from "../questions/skill-questions";
import { awardCoins, COINS, ksaDay } from "./coins";
import { evaluateBadges } from "./badges";
import { freshOrder, seenIndex } from "../questions/fresh";

const s = (v: unknown) => String(v ?? "");
/** question types the platform cannot mark on its own: never a Question of the Day */
const MANUAL = new Set(["SHORT_ANSWER"]);

export type QotdLevel = "ON" | "ABOVE" | "HARDEST";
/** One level above the student's working level (no level = On Level). */
export function qotdTarget(level: string | null | undefined): { tag: QotdLevel; levels: SkillLevel[] } {
  if (level === "BELOW") return { tag: "ON", levels: ["ON"] };
  if (level === "ABOVE") return { tag: "HARDEST", levels: [[6], [5]] };   // the hardest first, then the rest of Above
  return { tag: "ABOVE", levels: ["ABOVE"] };
}

const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface Pick { id: string; area: string; skillId: string | null; level: QotdLevel | null }
/** today's pick per student, kept 10 minutes (and dropped when the bank, levels or assignments change) */
const pickCache = new TtlCache<{ v: string; pick: Pick | null }>(10 * 60_000, 5000);
const pickVersion = () => `${bankVersion()}|${modelVersion("StudentLevel", "Student", "Grade", "Question", "Skill", "AssignmentStudent", "MapResult", "QuestionMapLink")}`;

/** A question one level above, from the student's skills (My Work first, then the grade). */
async function pickFromSkills(repo: Repo, studentId: string, schoolId: string, day: string): Promise<Pick | null> {
  const [st, lv, mine] = await Promise.all([
    repo.findUnique("Student", { id: studentId }),
    repo.findUnique("StudentLevel", { studentId }),
    repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"], take: 300 }),
  ]);
  if (!st) return null;
  const target = qotdTarget(lv ? s(lv.level) : null);
  const [asg, grade, idx] = await Promise.all([
    mine.length ? repo.findMany("Assignment", { id: { in: mine.map((m) => m.assignmentId) }, deletedAt: null }, { select: ["skillId"] }) : Promise.resolve([]),
    st.gradeId ? repo.findUnique("Grade", { id: st.gradeId }) : Promise.resolve(null),
    schoolSkillIndex(repo, schoolId),
  ]);
  const work = [...new Set(asg.map((a) => s(a.skillId)).filter((id) => id && idx.ids.has(id)))].sort();
  const g = Number(grade?.level ?? 0);
  const gradeSkills = [...idx.gradeOf.entries()].filter(([, lvl]) => lvl === g).map(([id]) => id).filter((id) => !work.includes(id)).sort();
  const seed = hash(`${studentId}|${day}`);
  const rotate = (xs: string[]) => (xs.length ? [...xs.slice(seed % xs.length), ...xs.slice(0, seed % xs.length)] : xs);
  const candidates = [...rotate(work), ...rotate(gradeSkills)].slice(0, 8);   // bounded: at most 8 skills tried
  for (const skillId of candidates) {
    for (const level of target.levels) {
      const qs = await questionsOfSkill(repo, schoolId, skillId, { level, take: 80 });
      if (!qs.length) continue;
      // 🆕 a question the student never attempted first (then the one seen longest ago): questions/fresh.ts
      const seen = await seenIndex(repo, studentId, qs.map((q) => ({ id: q.id })));
      const ordered = freshOrder(qs.map((_, k) => qs[(seed + k * 7) % qs.length]).filter((q, i, a) => a.indexOf(q) === i), (q) => seen.lastSeen(q.id));
      // up to 3 tries in this skill (a question the platform cannot mark is skipped)
      for (let k = 0; k < Math.min(3, ordered.length); k++) {
        const q = ordered[k];
        const [item] = await loadQuestionItems(repo, [q.id]);
        if (item && !MANUAL.has(s(item.type))) {
          const skill = await repo.findUnique("Skill", { id: skillId });
          return { id: q.id, area: s(skill?.name) || "English", skillId, level: target.tag };
        }
      }
    }
  }
  return null;
}

/** The Update 20 pick (weakest MAP goal area of the grade's pool), kept as the fallback. */
async function pickFromMapPools(repo: Repo, actor: Actor, studentId: string, day: string): Promise<Pick | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  if (!grade) return null;
  const [pk, profiles] = await Promise.all([groupPools(repo, actor.schoolId!, grade), mapProfiles(repo, actor.schoolId!, [studentId], "READING")]);
  const p = profiles.get(studentId);
  const weakest = p?.areas.filter((a) => a.rit !== null).sort((a, b) => a.rit! - b.rit!)[0];
  const group = weakest?.group ?? GROUPS[(Number(day.slice(8)) % GROUPS.length)].key;
  const pool = pk.pools.get(group) ?? [];
  if (!pool.length) return null;
  const target = weakest?.rit ?? null;
  const sorted = [...pool].sort((a, b) => (target === null ? 0 : Math.abs(a.rit - target) - Math.abs(b.rit - target)) || a.id.localeCompare(b.id));
  const near = sorted.slice(0, Math.max(5, Math.ceil(sorted.length / 3)));
  return { id: near[hash(`${studentId}${day}`) % near.length].id, area: GROUPS.find((x) => x.key === group)!.name, skillId: null, level: null };
}

export interface QotdView {
  question: ClientQuestion; area: string; answered: boolean;
  /** the level the question is asked at (one above the student's) */
  level: QotdLevel | null;
  /** today's result once answered */
  result: { correct: boolean; coins: number; correctAnswer: string; why: string } | null;
}

export async function questionOfTheDay(repo: Repo, actor: Actor, now = new Date()): Promise<QotdView | null> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) return null;
  const studentId = actor.studentId, schoolId = actor.schoolId;
  const day = ksaDay(now);
  const key = `${studentId}|${day}`, v = pickVersion();
  const hit = pickCache.get(key, now.getTime());
  const [answer, legacy, pick] = await Promise.all([
    repo.findMany("QotdAnswer", { studentId, day }, { select: ["questionId", "correct", "skillId", "level"], take: 1 }).then((r) => r[0] ?? null),
    repo.count("XpEvent", { studentId, reason: `qotd:${day}` }),
    hit && hit.v === v ? Promise.resolve(hit.pick) : (async () => {
      const p = (await pickFromSkills(repo, studentId, schoolId, day)) ?? (await pickFromMapPools(repo, actor, studentId, day));
      pickCache.set(key, { v, pick: p }, now.getTime());
      return p;
    })(),
  ]);
  // once answered, the card keeps showing the question that was answered (even if the bank changed since)
  const id = answer ? s(answer.questionId) : pick?.id;
  if (!id) return null;
  const [item] = await loadQuestionItems(repo, [id]);
  if (!item) return null;
  const correct = answer ? Boolean(answer.correct) : false;
  return {
    question: toClientQuestion(item, `qotd:${day}:${studentId}`), area: pick?.area ?? "English",
    answered: Boolean(answer) || legacy > 0, level: answer ? (s(answer.level) as QotdLevel) || null : pick?.level ?? null,
    result: answer ? { correct, coins: correct ? COINS.qotdRight : COINS.qotdTry, correctAnswer: correctAnswerText(item), why: s(item.explanation?.whyCorrect) } : null,
  };
}

/** One attempt: grades, saves the answer (never levels or mastery), pays coins and re-checks badges. */
export async function answerQuestionOfTheDay(repo: Repo, actor: Actor, questionId: string, response: unknown, now = new Date()): Promise<{ correct: number; total: number; review: Graded[]; coins: number; badges: string[] }> {
  const q = await questionOfTheDay(repo, actor, now);
  if (!q || q.question.questionId !== questionId) throw new ValidationError("Today's question has changed. Reload the page.");
  if (q.answered) throw new ValidationError("You already answered today's question. Come back tomorrow!");
  const studentId = actor.studentId!, day = ksaDay(now);
  const review = gradeItems(await loadQuestionItems(repo, [questionId]), { [questionId]: response });
  const ok = review[0]?.correct ?? false;
  const skill = (await repo.findUnique("Question", { id: questionId }))?.skillId ?? null;
  try {
    await repo.create("QotdAnswer", { studentId, day, questionId, skillId: skill ? s(skill) : null, level: q.level ?? "ON", correct: ok, createdAt: now });
  } catch {
    throw new ValidationError("You already answered today's question. Come back tomorrow!");   // the unique key: one attempt a day
  }
  await repo.create("XpEvent", { studentId, points: ok ? 5 : 1, reason: `qotd:${day}`, createdAt: now });
  const paid = await awardCoins(repo, studentId, "qotd", ok ? COINS.qotdRight : COINS.qotdTry, day, { now, note: ok ? "Question of the Day" : "Question of the Day (try)" });
  const badges = await evaluateBadges(repo, studentId, now).catch(() => [] as string[]);
  return { correct: ok ? 1 : 0, total: 1, review, coins: paid.awarded, badges };
}
