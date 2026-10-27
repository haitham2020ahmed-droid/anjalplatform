/**
 * 🧺 The questions of a plan: which questions the platform puts in a plan section, a "similar one" for Replace,
 * the bank search of the plan editor (skill + level + type) and the questions of a Curriculum Map lesson.
 *
 * Rules (the school's): only published, auto-marked questions; never two copies of the same content in ONE plan
 * (same id or the same content keys — questions/fresh.ts); for the plan's students, never-seen questions first, then
 * the ones seen longest ago (seenIndex → freshOrder). Reads are bounded (≤ 1000 pool ids, batched by fresh.ts).
 * Nothing here changes levels, ability or mastery.
 */
import type { Repo, Row } from "../seeding/repo";
import { contentKeysForIds, freshOrder, seenIndexAny, Sitting } from "../questions/fresh";
import { LEVEL_OF, questionsOfSkill, type SkillQuestion } from "../questions/skill-questions";
import { attachmentNodes } from "../curriculum-map/questions";

const s = (v: unknown) => String(v ?? "");
export type PlanLevel = "BELOW" | "ON" | "ABOVE";
export const PLAN_LEVELS: readonly PlanLevel[] = ["BELOW", "ON", "ABOVE"];
export const isPlanLevel = (v: unknown): v is PlanLevel => (PLAN_LEVELS as readonly unknown[]).includes(v);
/** most questions in one plan section (one assignment: assign.ts MAX_SET_QUESTIONS). Raised from 50 → 200
 *  (Oct 2026, "خليه مفتوح") — keep in sync with assign.ts MAX_SET_QUESTIONS and skill-picker/helpers.ts MAX_PICKED. */
export const MAX_SECTION_QUESTIONS = 200;
/** at most this many students' histories are read for the fresh order (a class) */
const MAX_SEEN_STUDENTS = 40;

/** Question types the platform marks itself (a plan's questions are answered in practice: no teacher marking). */
export async function autoTypes(repo: Repo): Promise<Map<string, string>> {
  const rows = await repo.findMany("QuestionType", {}, { select: ["id", "code", "isAutoScored"] });
  return new Map(rows.filter((t) => t.isAutoScored !== false && s(t.code) !== "SHORT_ANSWER").map((t) => [s(t.id), s(t.code)]));
}

/** The content keys of what is already in the plan (ids + fingerprints), to keep every question once. */
export async function planSitting(repo: Repo, questionIds: string[]): Promise<Sitting> {
  const sit = new Sitting();
  const keys = await contentKeysForIds(repo, questionIds);
  for (const id of questionIds) sit.add(id, keys.get(id) ?? []);
  return sit;
}

/** A level order that starts at the wanted level and moves out (On → Below → Above …). */
const levelRank = (want: PlanLevel | null, d: number): number => {
  if (!want) return 0;
  const order: Record<PlanLevel, PlanLevel[]> = { BELOW: ["BELOW", "ON", "ABOVE"], ON: ["ON", "BELOW", "ABOVE"], ABOVE: ["ABOVE", "ON", "BELOW"] };
  return order[want].indexOf(LEVEL_OF(d));
};

export interface PickOpts {
  /** preferred level (the others fill in when it runs out); strict = only this level */
  level?: PlanLevel | null;
  strictLevel?: boolean;
  /** QuestionType code (e.g. MULTIPLE_CHOICE) */
  type?: string | null;
  /** the plan's students: never-seen questions first for them */
  studentIds?: string[];
  /** already in the plan (ids); their copies are left out too */
  exclude?: string[];
  /** a fixed pool instead of the skill's bank (a Curriculum Map lesson) */
  pool?: string[];
}

/** Candidate questions of a skill (or a fixed pool): published, auto-marked, at most 1000, in the plan's fresh order. */
export async function candidates(repo: Repo, schoolId: string, skillId: string | null, opts: PickOpts = {}): Promise<SkillQuestion[]> {
  const types = await autoTypes(repo);
  let rows: SkillQuestion[];
  if (opts.pool) {
    const ids = [...new Set(opts.pool.map(s))].slice(0, 1000);
    rows = ids.length ? (await repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "difficultyLevel", "typeId", "standardId", "passageId", "status"] }))
      .map((q) => ({ id: s(q.id), skillId: s(q.skillId), difficultyLevel: Number(q.difficultyLevel ?? 4), typeId: s(q.typeId), standardId: q.standardId ? s(q.standardId) : null, passageId: q.passageId ? s(q.passageId) : null, status: s(q.status) })) : [];
  } else rows = skillId ? await questionsOfSkill(repo, schoolId, skillId, { take: 1000 }) : [];
  rows = rows.filter((q) => types.has(q.typeId) && (!opts.type || types.get(q.typeId) === opts.type));
  if (opts.level && opts.strictLevel) rows = rows.filter((q) => LEVEL_OF(q.difficultyLevel) === opts.level);
  if (!rows.length) return [];
  // one copy per content, and nothing already in the plan (or a copy of it)
  const keys = await contentKeysForIds(repo, rows.map((q) => q.id));
  const sit = await planSitting(repo, opts.exclude ?? []);
  const unique: SkillQuestion[] = [];
  for (const q of rows) { const k = keys.get(q.id) ?? []; if (sit.has(q.id, k)) continue; sit.add(q.id, k); unique.push(q); }
  // the students' histories: a question counts as seen when ANY of them saw it (or a copy of it)
  const who = [...new Set(opts.studentIds ?? [])].slice(0, MAX_SEEN_STUDENTS);
  const pool = unique.map((q) => ({ id: q.id, keys: keys.get(q.id) ?? [] }));
  // ⚡ one index for the whole group (= the latest of each student's own), not one set of reads per student
  const seen = await seenIndexAny(repo, who, pool);
  const lastSeen = new Map(pool.map((p) => [p.id, Math.max(0, seen.lastSeen(p.id, p.keys))]));
  // wanted level first (then the nearest), and inside each level: never seen first, then seen longest ago
  const byLevel = [...unique].sort((a, b) => levelRank(opts.level ?? null, a.difficultyLevel) - levelRank(opts.level ?? null, b.difficultyLevel));
  const groups = new Map<number, SkillQuestion[]>();
  for (const q of byLevel) { const r = levelRank(opts.level ?? null, q.difficultyLevel); const l = groups.get(r); if (l) l.push(q); else groups.set(r, [q]); }
  return [...groups.keys()].sort((a, b) => a - b).flatMap((r) => freshOrder(groups.get(r)!, (q) => lastSeen.get(q.id) ?? 0));
}

/** The `n` questions the platform puts in a section (fresh for the students, no copies of the plan's others). */
export async function pickQuestions(repo: Repo, schoolId: string, skillId: string | null, n: number, opts: PickOpts = {}): Promise<string[]> {
  const want = Math.max(1, Math.min(MAX_SECTION_QUESTIONS, Math.round(n)));
  return (await candidates(repo, schoolId, skillId, opts)).slice(0, want).map((q) => q.id);
}

/** A question like this one (same skill, same type, the nearest level) that is not in the plan yet; null when none. */
export async function similarQuestion(repo: Repo, schoolId: string, skillId: string, questionId: string, opts: { exclude: string[]; studentIds?: string[]; pool?: string[] }): Promise<string | null> {
  const q = await repo.findUnique("Question", { id: questionId });
  if (!q) return null;
  const types = await autoTypes(repo);
  const level = LEVEL_OF(Number(q.difficultyLevel ?? 4));
  const base = { level, studentIds: opts.studentIds, exclude: [...opts.exclude, questionId], pool: opts.pool };
  const sameType = await candidates(repo, schoolId, skillId, { ...base, type: types.get(s(q.typeId)) ?? null });
  const pick = sameType.find((c) => LEVEL_OF(c.difficultyLevel) === level) ?? sameType[0];
  if (pick) return pick.id;
  return (await candidates(repo, schoolId, skillId, base))[0]?.id ?? null;
}

// ------------------------------------------------------------------ what the teacher reads about each question

export interface QuestionLine {
  id: string; stem: string; type: string; level: PlanLevel; difficultyLevel: number;
  skillId: string; skillName: string; passageId: string | null; passageTitle: string | null; published: boolean;
}

/** One line per question (stem, type, level, skill, passage title), in the given order. Bounded: ids of one plan. */
export async function questionLines(repo: Repo, ids: string[]): Promise<Map<string, QuestionLine>> {
  const want = [...new Set(ids.map(s).filter(Boolean))];
  const out = new Map<string, QuestionLine>();
  for (let i = 0; i < want.length; i += 500) {
    const part = want.slice(i, i + 500);
    const qs = await repo.findMany("Question", { id: { in: part } }, { select: ["id", "stem", "typeId", "difficultyLevel", "skillId", "passageId", "status", "deletedAt"] });
    const [types, skills, passages] = await Promise.all([
      repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "name"] }),
      repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "name"] }),
      qs.some((q) => q.passageId) ? repo.findMany("ReadingPassage", { id: { in: [...new Set(qs.filter((q) => q.passageId).map((q) => s(q.passageId)))] } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
    ]);
    const typeName = new Map(types.map((t) => [s(t.id), s(t.name || t.code)]));
    const skillName = new Map(skills.map((k) => [s(k.id), s(k.name)]));
    const passageTitle = new Map(passages.map((p) => [s(p.id), s(p.title)]));
    for (const q of qs) out.set(s(q.id), {
      id: s(q.id), stem: s(q.stem), type: typeName.get(s(q.typeId)) ?? "", difficultyLevel: Number(q.difficultyLevel ?? 4), level: LEVEL_OF(Number(q.difficultyLevel ?? 4)),
      skillId: s(q.skillId), skillName: skillName.get(s(q.skillId)) ?? "", passageId: q.passageId ? s(q.passageId) : null,
      passageTitle: q.passageId ? passageTitle.get(s(q.passageId)) ?? null : null, published: s(q.status) === "PUBLISHED" && !q.deletedAt,
    });
  }
  return out;
}

/** The question types a teacher can filter on (auto-marked ones): code → name. */
export async function typeChoices(repo: Repo): Promise<{ code: string; name: string }[]> {
  const rows = await repo.findMany("QuestionType", {}, { select: ["code", "name", "isAutoScored"] });
  return rows.filter((t) => t.isAutoScored !== false && s(t.code) !== "SHORT_ANSWER").map((t) => ({ code: s(t.code), name: s(t.name || t.code) })).sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ one question in full (teacher)

export interface FullQuestion { id: string; stem: string; type: string; level: PlanLevel; skillName: string; passage: { title: string; text: string } | null; choices: { label: string; text: string; correct: boolean }[]; answer: string; hint: string | null }

/** A question of the school in full (passage, choices, the correct answer) for a teacher; null when not of the school. */
export async function fullQuestion(repo: Repo, schoolId: string, questionId: string): Promise<FullQuestion | null> {
  const { schoolSkillIndex } = await import("../questions/skill-questions");
  const { loadQuestionItems, correctAnswerText } = await import("../practice/items");
  const q = await repo.findUnique("Question", { id: s(questionId) });
  if (!q || q.deletedAt) return null;
  const idx = await schoolSkillIndex(repo, schoolId);
  if (!idx.ids.has(s(q.skillId))) return null;
  const [item] = await loadQuestionItems(repo, [s(q.id)]);
  const line = (await questionLines(repo, [s(q.id)])).get(s(q.id))!;
  if (!item) return { id: s(q.id), stem: s(q.stem), type: line.type, level: line.level, skillName: line.skillName, passage: null, choices: [], answer: "", hint: q.hint ? s(q.hint) : null };
  let answer = "";
  try { answer = correctAnswerText(item); } catch { answer = ""; }
  return {
    id: s(q.id), stem: item.stem, type: line.type, level: line.level, skillName: line.skillName,
    passage: item.passageText ? { title: s(item.passageTitle), text: s(item.passageText) } : null,
    choices: (item.options ?? []).map((o) => ({ label: s(o.label), text: s(o.text), correct: Boolean(o.correct) })), answer, hint: item.hint,
  };
}

// ------------------------------------------------------------------ Curriculum Map lessons

export interface MapLesson { code: string; label: string; where: string }

/** The Curriculum Map places of one grade a plan can add (each category; a level-split category once). */
export async function mapLessons(repo: Repo, schoolId: string, grade: number): Promise<MapLesson[]> {
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.grade === grade);
  const out: MapLesson[] = [];
  for (const n of nodes) {
    const code = n.code.replace(/\.(ABOVE|ON|BELOW)$/, "");
    if (out.some((x) => x.code === code)) continue;
    out.push({ code, label: `${n.setTitle || n.heading} · ${n.categoryLabel.replace(/^\d+-\s*/, "")}`, where: n.unitTitle });
  }
  return out;
}

/** The published questions linked to a Curriculum Map place (its levels too) and the skill most of them are on. */
export async function mapLessonQuestions(repo: Repo, schoolId: string, code: string): Promise<{ lesson: MapLesson & { grade: number }; questionIds: string[]; skillId: string | null }> {
  const want = s(code).trim().toUpperCase();
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.code === want || n.code.startsWith(`${want}.`));
  if (!nodes.length) return { lesson: { code: want, label: want, where: "", grade: 0 }, questionIds: [], skillId: null };
  const links = await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId"] });
  const ids = [...new Set(links.map((l) => s(l.questionId)))].slice(0, 1000);
  const qs = ids.length ? await repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId"] }) : [];
  const count = new Map<string, number>();
  for (const q of qs) count.set(s(q.skillId), (count.get(s(q.skillId)) ?? 0) + 1);
  const skillId = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const n = nodes[0];
  return { lesson: { code: want, label: `${n.setTitle || n.heading} · ${n.categoryLabel.replace(/^\d+-\s*/, "")}`, where: n.unitTitle, grade: n.grade }, questionIds: qs.map((q) => s(q.id)), skillId };
}
