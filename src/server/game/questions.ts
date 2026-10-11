/**
 * 🎲 Games Part 1 — the question provider. Every game is filled AUTOMATICALLY from the skill's questions in the bank
 * (the shared questionsOfSkill), at the student's level, using only the question types that fit the game. Nothing
 * is copied or stored: a round is built from the bank each time it is played.
 *
 *   level      the student's level (the platform's evidence levels, read only — games never change it)
 *   fitting    the game's types (registry), published, not deleted, auto-scored; the game's own `fits` check
 *   top-up     the student's level first, then On Level, then the other levels (so short banks still play)
 *   "Soon"     fewer fitting questions than the game's minQuestions (at all levels together)
 *
 * Reads are bounded (one page of ≤ 1000 ids per skill, then only the round's items) and cached briefly.
 * One question bank: a skill's questions are its family's (questionsOfSkill pools every grade's copy of the skill).
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { questionsOfSkill, schoolSkillIndex } from "../questions/skill-questions";
import { loadQuestionItems, type PracticeItem } from "../practice/items";
import { evidenceLevels } from "../curriculum-map/evidence-level";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { hideLevels } from "../../lib/hide-levels";
import { GAMES, gameMeta } from "../../games/registry";
import type { BankType, GameMeta, PlayLevel, PlayQuestion } from "../../games/types";
import { randomInt } from "node:crypto";

const s = (v: unknown) => String(v ?? "");
const LEVEL_RANGE: Record<PlayLevel, number[]> = { BELOW: [1, 2, 3], ON: [4], ABOVE: [5, 6, 7] };
const levelOfDifficulty = (d: number): PlayLevel => (d <= 3 ? "BELOW" : d === 4 ? "ON" : "ABOVE");
/** the order levels are drawn in when the student's own level runs short */
const TOP_UP: Record<PlayLevel, PlayLevel[]> = { BELOW: ["BELOW", "ON", "ABOVE"], ON: ["ON", "BELOW", "ABOVE"], ABOVE: ["ABOVE", "ON", "BELOW"] };

function shuffle<T>(arr: T[], rnd?: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd ? Math.floor(rnd() * (i + 1)) : randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ------------------------------------------------------------------ bank item → game question

/** A bank item as a game question (with the key — solo games check answers in the browser). */
export function toPlayQuestion(it: PracticeItem): PlayQuestion | null {
  const base = { id: it.questionId, skillId: s(it.skillKey), type: it.type as BankType, stem: it.stem, level: Number(it.level) || 4, passage: it.passageText ? { title: s(it.passageTitle), text: s(it.passageText) } : null, hint: it.hint ?? null, explain: it.explanation?.whyCorrect || null };
  switch (it.type) {
    case "MULTIPLE_CHOICE": case "DROPDOWN": case "MULTI_SELECT":
      if (!it.options?.length || !it.options.some((o) => o.correct)) return null;
      return { ...base, options: it.options.map((o) => ({ label: o.label, text: o.text, correct: !!o.correct })) };
    case "TRUE_FALSE":
      if (typeof it.answer !== "boolean") return null;
      return { ...base, answer: it.answer, options: [{ label: "true", text: "True", correct: it.answer === true }, { label: "false", text: "False", correct: it.answer === false }] };
    case "WORD_ORDER": case "SENTENCE_ORDER":
      return it.sequence?.length ? { ...base, sequence: [...it.sequence] } : null;
    case "MATCHING":
      return it.pairs?.length ? { ...base, pairs: it.pairs.map((p) => ({ ...p })) } : null;
    case "FILL_BLANK":
      return it.answers?.length ? { ...base, answers: [...it.answers] } : null;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ the fitting questions of a skill (ids only)

interface Fitting { id: string; level: PlayLevel; type: BankType }
const fitCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<Fitting[]> }>>();

/** Every published, auto-scored question of the skill with a type some game can use (cached per bank version). */
async function playableOfSkill(repo: Repo, schoolId: string, skillId: string): Promise<Fitting[]> {
  let m = fitCache.get(repo); if (!m) fitCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${skillId}`, v = modelVersion("Question", "QuestionType", "Skill"), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const rows = await questionsOfSkill(repo, schoolId, skillId, { take: 1000 });
    if (!rows.length) return [];
    const types = await repo.findMany("QuestionType", { id: { in: [...new Set(rows.map((q) => q.typeId))] } }, { select: ["id", "code", "isAutoScored"] });
    const code = new Map(types.filter((t) => t.isAutoScored !== false).map((t) => [s(t.id), s(t.code) as BankType]));
    const usable = new Set<string>(GAMES.flatMap((g) => g.types));
    return rows.filter((q) => usable.has(s(code.get(q.typeId)))).map((q) => ({ id: q.id, level: levelOfDifficulty(q.difficultyLevel), type: code.get(q.typeId)! }));
  })().catch((e) => { m!.delete(key); throw e; });
  remember(m, key, { v, at: Date.now(), p }, 300);
  return p;
}

export interface Picked { item: PracticeItem; q: PlayQuestion }
/** Load and convert, keeping only questions the game can really use (its types and its own `fits`). */
async function fillItems(repo: Repo, meta: GameMeta, ids: string[]): Promise<Picked[]> {
  if (!ids.length) return [];
  const items = await loadQuestionItems(repo, ids);
  const out: Picked[] = [];
  for (const item of items) { const q = toPlayQuestion(item); if (q && meta.types.includes(q.type) && (!meta.fits || meta.fits(q))) out.push({ item, q }); }
  return out;
}
const fillFor = async (repo: Repo, meta: GameMeta, ids: string[]): Promise<PlayQuestion[]> => (await fillItems(repo, meta, ids)).map((x) => x.q);

// ------------------------------------------------------------------ availability ("Soon")

export interface GameAvailability { id: string; ready: boolean; status: "PLAY" | "SOON"; fitting: number }

/**
 * Which games can be played for a skill: a game needs its minQuestions fitting questions (all levels together);
 * games that are not built yet are "Soon" too.
 */
export async function gameAvailability(repo: Repo, schoolId: string, skillId: string): Promise<GameAvailability[]> {
  const all = await playableOfSkill(repo, schoolId, skillId);
  const out: GameAvailability[] = [];
  for (const g of GAMES) {
    let ids = all.filter((q) => g.types.includes(q.type)).map((q) => q.id);
    // a game with its own finer check counts what really fits (at most 200 items read)
    if (g.fits && ids.length >= g.minQuestions) ids = (await fillFor(repo, g, ids.slice(0, 200))).map((q) => q.id);
    out.push({ id: g.id, ready: g.ready, status: g.ready && ids.length >= g.minQuestions ? "PLAY" : "SOON", fitting: ids.length });
  }
  return out;
}

// ------------------------------------------------------------------ the student's level (read only)

const levelCache = new Map<string, { at: number; level: PlayLevel }>();
/** The student's level as the platform already shows it (On Level without data). Read only, cached 10 minutes. */
export async function studentPlayLevel(repo: Repo, schoolId: string, studentId: string, now = new Date()): Promise<PlayLevel> {
  const hit = levelCache.get(studentId);
  if (hit && Date.now() - hit.at < 600_000) return hit.level;
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = st?.gradeId ? Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0) : 0;
  let level: PlayLevel = "ON";
  try { const lv = (await evidenceLevels(repo, schoolId, [studentId], grade, {}, now)).get(studentId)?.level; if (lv === "BELOW" || lv === "ON" || lv === "ABOVE") level = lv; } catch { /* no data: On Level */ }
  remember(levelCache, studentId, { at: Date.now(), level }, 2000);
  return level;
}

/** Many students at once (Live Challenge "each student's level"). */
export async function studentsPlayLevels(repo: Repo, schoolId: string, studentIds: string[], grade: number, now = new Date()): Promise<Map<string, PlayLevel>> {
  const out = new Map<string, PlayLevel>(studentIds.map((id) => [id, "ON" as PlayLevel]));
  if (!studentIds.length) return out;
  try {
    const lv = await evidenceLevels(repo, schoolId, studentIds, grade, {}, now);
    for (const id of studentIds) { const l = lv.get(id)?.level; if (l === "BELOW" || l === "ON" || l === "ABOVE") out.set(id, l); }
  } catch { /* On Level for everyone */ }
  return out;
}

// ------------------------------------------------------------------ pick questions at a level

/**
 * `count` fitting questions of a skill for a game: the level first, topped up from the nearest levels. Returns
 * fewer when the bank is short. Pure on top of playableOfSkill + loadQuestionItems.
 */
export async function pickItems(repo: Repo, schoolId: string, skillId: string, meta: GameMeta, level: PlayLevel, count: number, opts: { exclude?: Set<string>; rnd?: () => number } = {}): Promise<Picked[]> {
  const all = (await playableOfSkill(repo, schoolId, skillId)).filter((q) => meta.types.includes(q.type) && !opts.exclude?.has(q.id));
  const ordered: string[] = [];
  for (const l of TOP_UP[level]) ordered.push(...shuffle(all.filter((q) => q.level === l).map((q) => q.id), opts.rnd));
  const out: Picked[] = [];
  // read a little more than needed (a few items may not fit the game's own check)
  for (let i = 0; i < ordered.length && out.length < count; i += count + 4) out.push(...(await fillItems(repo, meta, ordered.slice(i, i + count + 4))));
  // one question bank: a question from another grade's copy of the skill counts for the skill played (results by skill)
  for (const x of out) { x.item.skillKey = skillId; x.q.skillId = skillId; }
  return out.slice(0, count);
}

export async function pickQuestions(repo: Repo, schoolId: string, skillId: string, meta: GameMeta, level: PlayLevel, count: number, opts: { exclude?: Set<string>; rnd?: () => number } = {}): Promise<PlayQuestion[]> {
  return (await pickItems(repo, schoolId, skillId, meta, level, count, opts)).map((x) => x.q);
}

/** How many questions of each skill fit a game (any level) — one small read for many skills, cached briefly. */
export async function fittingCounts(repo: Repo, schoolId: string, skillIds: string[], meta: GameMeta): Promise<Map<string, number>> {
  const out = new Map<string, number>(skillIds.map((id) => [id, 0]));
  if (!skillIds.length) return out;
  let m = countCache.get(repo); if (!m) countCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${meta.id}`, v = modelVersion("Question", "QuestionType", "Skill"), hit = m.get(key);
  let all: Promise<Map<string, number>>;
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) all = hit.p;
  else {
    all = (async () => {
      const idx = await schoolSkillIndex(repo, schoolId);
      const types = await repo.findMany("QuestionType", { code: { in: meta.types } }, { select: ["id", "isAutoScored"] });
      const typeIds = types.filter((t) => t.isAutoScored !== false).map((t) => t.id);
      const counts = new Map<string, number>();
      if (!typeIds.length) return counts;
      const ids = [...idx.ids];
      for (let i = 0; i < ids.length; i += 400) {
        for (const q of await repo.findMany("Question", { skillId: { in: ids.slice(i, i + 400) }, status: "PUBLISHED", deletedAt: null, typeId: { in: typeIds } }, { select: ["skillId"] })) counts.set(s(q.skillId), (counts.get(s(q.skillId)) ?? 0) + 1);
      }
      return counts;
    })().catch((e) => { m!.delete(key); throw e; });
    remember(m, key, { v, at: Date.now(), p: all }, 40);
  }
  const counts = await all;
  // one question bank: a skill's games read its whole family (every grade's copy), so the count is the family's
  const idx = await schoolSkillIndex(repo, schoolId);
  for (const id of skillIds) out.set(id, (idx.ids.has(id) ? idx.members.get(idx.keyOf.get(id)!) ?? [id] : [id]).reduce((t, x) => t + (counts.get(x) ?? 0), 0));
  return out;
}
const countCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<Map<string, number>> }>>();

// ------------------------------------------------------------------ solo play access + a round

/** A student may play a skill of their school that is in their My Work (any grade) or of their own grade. */
export async function canPlayGameSkill(repo: Repo, actor: Actor, skillId: string): Promise<boolean> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) return false;
  const idx = await schoolSkillIndex(repo, actor.schoolId);
  if (!idx.ids.has(s(skillId))) return false;
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const grade = st?.gradeId ? Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0) : 0;
  if (grade && idx.gradeOf.get(s(skillId)) === grade) return true;
  const mine = await repo.findMany("AssignmentStudent", { studentId: actor.studentId }, { select: ["assignmentId"] });
  if (!mine.length) return false;
  return (await repo.count("Assignment", { id: { in: mine.map((r) => r.assignmentId) }, skillId: s(skillId), deletedAt: null })) > 0;
}

export interface SoloRound { roundId: string; gameId: string; skillId: string; skillName: string; level: PlayLevel; questions: PlayQuestion[]; roundSeconds: number }

/** Rounds handed out (in memory, single use): a result row is only accepted for a round really served. */
const rounds = new Map<string, { studentId: string; gameId: string; skillId: string; n: number; at: number }>();
const ROUND_TTL = 45 * 60_000;
export function takeRound(roundId: string, studentId: string): { gameId: string; skillId: string; n: number } | null {
  const r = rounds.get(roundId);
  if (!r || r.studentId !== studentId || Date.now() - r.at > ROUND_TTL) return null;
  rounds.delete(roundId);
  return r;
}

export async function soloRound(repo: Repo, actor: Actor, gameId: string, skillId: string, now = new Date()): Promise<SoloRound> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students play games.");
  const meta = gameMeta(gameId);
  if (!meta || !meta.ready) throw new ValidationError("This game is coming soon.");
  if (!(await canPlayGameSkill(repo, actor, skillId))) throw new ForbiddenError("This skill is not in your work.");
  const level = await studentPlayLevel(repo, actor.schoolId, actor.studentId, now);
  const questions = await pickQuestions(repo, actor.schoolId, skillId, meta, level, meta.roundSize);
  if (questions.length < meta.minQuestions) throw new ValidationError("This game is coming soon for this skill.");
  const skill = await repo.findUnique("Skill", { id: skillId });
  const roundId = `${Date.now().toString(36)}${randomInt(1e9).toString(36)}`;
  for (const [k, r] of rounds) if (Date.now() - r.at > ROUND_TTL) rounds.delete(k);
  if (rounds.size > 20_000) rounds.delete(rounds.keys().next().value as string);
  rounds.set(roundId, { studentId: actor.studentId, gameId, skillId, n: questions.length, at: Date.now() });
  return { roundId, gameId, skillId, skillName: hideLevels(s(skill?.name)), level, questions, roundSeconds: meta.roundSeconds };
}
