/**
 * 🧩 UI reorg Phase 1 — THE one answer to “which questions belong to skill X?”.
 *
 * Every place that shows or uses the questions of a skill reads them here: the search (skill results and the
 * Question Bank's “skills matching”), the MAP section, the NAFS section, the master skills list, the skill hub,
 * Bank ↔ MAP / Bank ↔ NAFS, and (after the merge) Plans and Assessments. So the same skill shows the same count
 * everywhere.
 *
 * A question belongs to skill X when Question.skillId = X (the link the import, the editor and the link script set),
 * it is not deleted and it has the asked status (PUBLISHED by default). Nothing else: a question of another skill
 * that merely MENTIONS the word (“Which detail supports the inference …” is a Cite Text Evidence question) is found by
 * the text search, never counted for the skill.
 *
 * MAP and NAFS area of a question: its skill's area (skill → family → MapGoalArea / NafsSkillLink), unless the
 * question has its own explicit area (MAP: an area set by an admin or the import file; NAFS: NafsQuestionArea).
 *
 * Reads are bounded: ids in chunks, only the needed columns, `take` capped; counts are cached per bank version.
 */
import type { Repo, Row } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";

const s = (v: unknown) => String(v ?? "");
const CHUNK = 400;
const MAX_TAKE = 1000;

export type SkillQuestionStatus = "PUBLISHED" | "DRAFT" | "UNDER_REVIEW" | "ARCHIVED" | "ANY";
/** Below = levels 1–3, On = 4, Above = 5–6 (the platform's three practice levels), or exact difficulty levels. */
export type SkillLevel = "BELOW" | "ON" | "ABOVE" | number | number[];
export interface SkillQuestionOpts { level?: SkillLevel; status?: SkillQuestionStatus; take?: number; skip?: number }
export interface SkillQuestion { id: string; skillId: string; difficultyLevel: number; typeId: string; standardId: string | null; passageId: string | null; status: string }

export const LEVEL_OF = (d: number): "BELOW" | "ON" | "ABOVE" => (d <= 3 ? "BELOW" : d === 4 ? "ON" : "ABOVE");
function levelWhere(level: SkillLevel | undefined): Record<string, unknown> {
  if (level === undefined || level === null) return {};
  if (Array.isArray(level)) return { difficultyLevel: { in: level.map(Number) } };
  if (typeof level === "number") return { difficultyLevel: level };
  return { difficultyLevel: { in: level === "BELOW" ? [1, 2, 3] : level === "ON" ? [4] : [5, 6] } };
}
function statusWhere(status: SkillQuestionStatus | undefined): Record<string, unknown> {
  const st = status ?? "PUBLISHED";
  return st === "ANY" ? { deletedAt: null } : { status: st, deletedAt: null };
}

// ------------------------------------------------------------------ the school's skills

interface SchoolSkills { ids: Set<string>; gradeOf: Map<string, number>; familyOf: Map<string, string> }
const skillCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<SchoolSkills> }>>();
/** Every skill (also inactive / hidden ones: their questions still exist) of the school's grades, with its grade. */
export function schoolSkillIndex(repo: Repo, schoolId: string): Promise<SchoolSkills> {
  let m = skillCache.get(repo); if (!m) skillCache.set(repo, (m = new Map()));
  const v = modelVersion("Skill", "Curriculum", "Grade"), hit = m.get(schoolId);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
    const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
    const lv = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
    const gradeOfCur = new Map(curs.map((c) => [s(c.id), lv.get(s(c.gradeId)) ?? 0]));
    const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "curriculumId", "familyId"] }) : [];
    return { ids: new Set(skills.map((k) => s(k.id))), gradeOf: new Map(skills.map((k) => [s(k.id), gradeOfCur.get(s(k.curriculumId)) ?? 0])), familyOf: new Map(skills.map((k) => [s(k.id), s(k.familyId)])) };
  })().catch((e) => { m!.delete(schoolId); throw e; });
  remember(m, schoolId, { v, at: Date.now(), p }, 16);
  return p;
}

// ------------------------------------------------------------------ questions and counts

/**
 * The questions of one skill (published by default), optionally at one level, a page at a time (take ≤ 1000).
 * Returns [] for a skill of another school. Ordered by level, then id (stable pages).
 */
export async function questionsOfSkill(repo: Repo, schoolId: string, skillId: string, opts: SkillQuestionOpts = {}): Promise<SkillQuestion[]> {
  const idx = await schoolSkillIndex(repo, schoolId);
  if (!idx.ids.has(s(skillId))) return [];
  const take = Math.max(1, Math.min(MAX_TAKE, Math.floor(opts.take ?? 200)));
  const rows = await repo.findMany("Question", { skillId: s(skillId), ...statusWhere(opts.status), ...levelWhere(opts.level) }, {
    select: ["id", "skillId", "difficultyLevel", "typeId", "standardId", "passageId", "status"],
    orderBy: [{ field: "difficultyLevel", dir: "asc" }, { field: "id", dir: "asc" }], take, ...(opts.skip ? { skip: Math.max(0, Math.floor(opts.skip)) } : {}),
  });
  return rows.map((q) => ({ id: s(q.id), skillId: s(q.skillId), difficultyLevel: Number(q.difficultyLevel ?? 4), typeId: s(q.typeId), standardId: q.standardId ? s(q.standardId) : null, passageId: q.passageId ? s(q.passageId) : null, status: s(q.status) }));
}

const countCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<Map<string, number>> }>>();
/**
 * How many questions each skill has (published by default; a level narrows it). One small read per 400 skills;
 * cached until the bank changes (and at most a minute). Skills of other schools count 0.
 */
export async function countQuestionsOfSkills(repo: Repo, schoolId: string, skillIds: readonly string[], opts: Omit<SkillQuestionOpts, "take" | "skip"> = {}): Promise<Map<string, number>> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const want = [...new Set(skillIds.map(s))];
  const mine = want.filter((id) => idx.ids.has(id));
  const out = new Map<string, number>(want.map((id) => [id, 0]));
  if (!mine.length) return out;
  // the whole school's counts for this status/level are cached (one entry), then picked
  let m = countCache.get(repo); if (!m) countCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${opts.status ?? "PUBLISHED"}|${JSON.stringify(opts.level ?? null)}`;
  const v = modelVersion("Question", "Skill", "Curriculum", "Grade"), hit = m.get(key);
  let all: Promise<Map<string, number>>;
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) all = hit.p;
  else {
    all = (async () => {
      const ids = [...idx.ids], counts = new Map<string, number>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        for (const q of await repo.findMany("Question", { skillId: { in: ids.slice(i, i + CHUNK) }, ...statusWhere(opts.status), ...levelWhere(opts.level) }, { select: ["skillId"] })) counts.set(s(q.skillId), (counts.get(s(q.skillId)) ?? 0) + 1);
      }
      return counts;
    })().catch((e) => { m!.delete(key); throw e; });
    remember(m, key, { v, at: Date.now(), p: all }, 24);
  }
  const counts = await all;
  for (const id of mine) out.set(id, counts.get(id) ?? 0);
  return out;
}

/** The count of one skill (same rules). */
export async function countQuestionsOfSkill(repo: Repo, schoolId: string, skillId: string, opts: Omit<SkillQuestionOpts, "take" | "skip"> = {}): Promise<number> {
  return (await countQuestionsOfSkills(repo, schoolId, [skillId], opts)).get(s(skillId)) ?? 0;
}

// ------------------------------------------------------------------ MAP and NAFS areas

export interface AreaRef { code: string; name: string }
export interface SkillAreas { map: AreaRef | null; nafs: AreaRef | null }

/** Each skill's MAP goal area and NAFS area (through its skill family). */
export async function skillAreas(repo: Repo, skillIds: readonly string[]): Promise<Map<string, SkillAreas>> {
  const ids = [...new Set(skillIds.map(s))];
  const out = new Map<string, SkillAreas>(ids.map((id) => [id, { map: null, nafs: null }]));
  if (!ids.length) return out;
  const skills: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) skills.push(...(await repo.findMany("Skill", { id: { in: ids.slice(i, i + CHUNK) } }, { select: ["id", "familyId"] })));
  const famIds = [...new Set(skills.map((k) => s(k.familyId)).filter(Boolean))];
  if (!famIds.length) return out;
  const [fams, mapAreas, nafsLinks, nafsAreas] = await Promise.all([
    repo.findMany("SkillFamily", { id: { in: famIds } }, { select: ["id", "mapGoalAreaId"] }),
    repo.findMany("MapGoalArea", {}, { select: ["id", "code", "name"] }),
    repo.findMany("NafsSkillLink", { familyId: { in: famIds } }, { select: ["familyId", "areaId"] }),
    repo.findMany("NafsArea", {}, { select: ["id", "code", "name", "isActive"] }),
  ]);
  const mapOf = new Map(fams.map((f) => [s(f.id), mapAreas.find((a) => a.id === f.mapGoalAreaId)]));
  const nafsOf = new Map(nafsLinks.map((l) => [s(l.familyId), nafsAreas.find((a) => a.id === l.areaId && a.isActive !== false && a.isActive !== 0)]));
  for (const k of skills) {
    const ma = mapOf.get(s(k.familyId)), na = nafsOf.get(s(k.familyId));
    out.set(s(k.id), { map: ma ? { code: s(ma.code), name: s(ma.name) } : null, nafs: na ? { code: s(na.code), name: s(na.name) } : null });
  }
  return out;
}

/** MAP sources that are an explicit choice for the question (not an automatic guess from its standard or text). */
export const EXPLICIT_MAP_SOURCES = new Set(["ADMIN", "IMPORT"]);

export interface QuestionAreas { map: string | null; mapFrom: "SKILL" | "QUESTION" | null; nafs: string | null; nafsFrom: "SKILL" | "QUESTION" | null }
/**
 * Each question's MAP area (goal-area NAME, e.g. “Literary Text: Language, Craft, and Structure”, or the NWEA
 * instructional area the admin / import chose) and NAFS area CODE: the skill's, unless the question has its own.
 */
export async function questionAreas(repo: Repo, questionIds: readonly string[]): Promise<Map<string, QuestionAreas>> {
  const ids = [...new Set(questionIds.map(s))];
  const out = new Map<string, QuestionAreas>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const [qs, own, nafsAreas] = await Promise.all([
      repo.findMany("Question", { id: { in: part } }, { select: ["id", "skillId", "mapInstructionalArea", "mapAreaSource"] }),
      repo.findMany("NafsQuestionArea", { questionId: { in: part } }, { select: ["questionId", "areaId"] }),
      repo.findMany("NafsArea", {}, { select: ["id", "code"] }),
    ]);
    const bySkill = await skillAreas(repo, qs.map((q) => s(q.skillId)));
    for (const q of qs) {
      const sk = bySkill.get(s(q.skillId));
      const ownMap = q.mapInstructionalArea && EXPLICIT_MAP_SOURCES.has(s(q.mapAreaSource)) ? s(q.mapInstructionalArea) : null;
      const ownNafs = own.find((o) => o.questionId === q.id);
      const ownNafsCode = ownNafs ? s(nafsAreas.find((a) => a.id === ownNafs.areaId)?.code) || null : null;
      out.set(s(q.id), {
        map: ownMap ?? sk?.map?.name ?? null, mapFrom: ownMap ? "QUESTION" : sk?.map ? "SKILL" : null,
        nafs: ownNafsCode ?? sk?.nafs?.code ?? null, nafsFrom: ownNafsCode ? "QUESTION" : sk?.nafs ? "SKILL" : null,
      });
    }
  }
  return out;
}

/**
 * The questions of one NAFS area (published by default) for a grade: the questions of every skill whose family is in
 * the area, minus those moved out by their own area, plus those moved in. A page at a time (take ≤ 1000).
 */
export async function questionsOfNafsArea(repo: Repo, schoolId: string, areaCode: string, opts: SkillQuestionOpts & { grade?: number } = {}): Promise<SkillQuestion[]> {
  const area = (await repo.findMany("NafsArea", { code: areaCode }, { select: ["id"] }))[0];
  if (!area) return [];
  const idx = await schoolSkillIndex(repo, schoolId);
  const links = await repo.findMany("NafsSkillLink", { areaId: area.id }, { select: ["familyId"] });
  const fams = new Set(links.map((l) => s(l.familyId)));
  const skillIds = [...idx.ids].filter((id) => fams.has(idx.familyOf.get(id) ?? "") && (!opts.grade || idx.gradeOf.get(id) === opts.grade));
  const take = Math.max(1, Math.min(MAX_TAKE, Math.floor(opts.take ?? 200)));
  const sel = { select: ["id", "skillId", "difficultyLevel", "typeId", "standardId", "passageId", "status"], orderBy: [{ field: "id", dir: "asc" as const }] };
  const [movedIn, movedOutRows] = await Promise.all([
    repo.findMany("NafsQuestionArea", { areaId: area.id }, { select: ["questionId"], take: 5000 }),
    repo.findMany("NafsQuestionArea", { areaId: { not: area.id } }, { select: ["questionId"], take: 5000 }),
  ]);
  const movedOut = new Set(movedOutRows.map((r) => s(r.questionId)));
  const rows: Row[] = [];
  for (let i = 0; i < skillIds.length && rows.length < take + (opts.skip ?? 0); i += CHUNK) {
    rows.push(...(await repo.findMany("Question", { skillId: { in: skillIds.slice(i, i + CHUNK) }, ...statusWhere(opts.status), ...levelWhere(opts.level) }, { ...sel, take: take + (opts.skip ?? 0) + movedOut.size })).filter((q) => !movedOut.has(s(q.id))));
  }
  const inIds = movedIn.map((r) => s(r.questionId)).filter((id) => !rows.some((q) => q.id === id));
  for (let i = 0; i < inIds.length; i += CHUNK) {
    rows.push(...(await repo.findMany("Question", { id: { in: inIds.slice(i, i + CHUNK) }, ...statusWhere(opts.status), ...levelWhere(opts.level) }, sel)).filter((q) => idx.ids.has(s(q.skillId)) && (!opts.grade || idx.gradeOf.get(s(q.skillId)) === opts.grade)));
  }
  return rows.slice(opts.skip ?? 0, (opts.skip ?? 0) + take).map((q) => ({ id: s(q.id), skillId: s(q.skillId), difficultyLevel: Number(q.difficultyLevel ?? 4), typeId: s(q.typeId), standardId: q.standardId ? s(q.standardId) : null, passageId: q.passageId ? s(q.passageId) : null, status: s(q.status) }));
}

// ------------------------------------------------------------------ search: the skills a query names

/** Teachers' words for the same skill (shared with the search page). */
export const SKILL_SYNONYMS: [string, string][] = [["main inference", "make inferences"], ["main idea", "central idea"], ["central idea", "main idea"], ["inferences", "make inferences"], ["inference", "make inferences"], ["context clues", "word meaning"], ["text features", "text structure"], ["author's purpose", "point of view"], ["cause and effect", "text structure"], ["compare and contrast", "text structure"], ["capital letters", "capitalization"], ["capitalization", "capital letters"], ["vocab", "vocabulary"], ["grammar", "usage"]];

export interface SkillMatch { id: string; name: string; grade: number; questions: number; map: AreaRef | null; nafs: AreaRef | null }
const words = (x: string) => x.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3);
const stemW = (w: string) => w.replace(/(ies)$/, "y").replace(/(ences|ence|ing|ed|es|s)$/, "");

/**
 * The skills a search names (every meaningful word is in the skill name, after simple stemming, or a teacher's
 * synonym names it: “main idea” → Central Idea, “inference” → Make Inferences), with the shared count. Used by the
 * Question Bank search so its “skills matching” show exactly the MAP / NAFS section numbers.
 */
export async function skillsMatching(repo: Repo, schoolId: string, q: string, opts: { grade?: number; status?: SkillQuestionStatus } = {}): Promise<SkillMatch[]> {
  const raw = s(q).toLowerCase().trim().slice(0, 80);
  if (raw.length < 3) return [];
  const idx = await schoolSkillIndex(repo, schoolId);
  const ids = [...idx.ids].filter((id) => !opts.grade || idx.gradeOf.get(id) === opts.grade);
  const skills: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) skills.push(...(await repo.findMany("Skill", { id: { in: ids.slice(i, i + CHUNK) } }, { select: ["id", "name", "code", "isActive"] })));
  const queries = [raw, ...SKILL_SYNONYMS.filter(([a]) => raw.includes(a)).map(([a, b]) => raw.replace(a, b))];
  const hit = skills.filter((k) => {
    if (k.isActive === false || k.isActive === 0 || s(k.code).endsWith(".curriculum-map-unclassified")) return false;
    const kw = new Set(words(s(k.name)).map(stemW));
    return queries.some((qq) => { const qw = words(qq).map(stemW).filter((w) => !["and", "the", "skill", "skills"].includes(w)); return qw.length > 0 && qw.every((w) => kw.has(w) || [...kw].some((x) => x.startsWith(w) && w.length >= 4)); });
  });
  if (!hit.length) return [];
  const [counts, areas] = await Promise.all([countQuestionsOfSkills(repo, schoolId, hit.map((k) => s(k.id)), { status: opts.status }), skillAreas(repo, hit.map((k) => s(k.id)))]);
  return hit.map((k) => ({ id: s(k.id), name: s(k.name), grade: idx.gradeOf.get(s(k.id)) ?? 0, questions: counts.get(s(k.id)) ?? 0, map: areas.get(s(k.id))?.map ?? null, nafs: areas.get(s(k.id))?.nafs ?? null }))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)).slice(0, 30);
}
