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
 * ONE question bank (no grade split): skill X reads the questions of every skill of its FAMILY — the same skill in
 * the other grades (familyKeyOf: same normalized name + kind). Concept Vocabulary stays with its grade. The level
 * filter applies as before; mastery and attempts stay on the skill row the student opened or was assigned.
 *
 * MAP and NAFS area of a question: its skill's area (skill → family → MapGoalArea / NafsSkillLink), unless the
 * question has its own explicit area (MAP: an area set by an admin or the import file; NAFS: NafsQuestionArea).
 *
 * Reads are bounded: ids in chunks, only the needed columns, `take` capped; counts are cached per bank version.
 */
import type { Repo, Row } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";
import { mapLinkedQuestionIds } from "./bank-scope";
import { remember } from "../cache/lru";
import { countGroups } from "../db/group-count";

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

/** The few skill columns the one bank needs (names for the family key, the hidden flag, the search). */
export interface IndexedSkill { id: string; name: string; code: string; domain: string; category: string; isActive: boolean; grade: number }
interface SchoolSkills {
  ids: Set<string>; gradeOf: Map<string, number>; familyOf: Map<string, string>;
  /** one question bank: each skill's family key and the members (same skill, every grade) of each key */
  skillOf: Map<string, IndexedSkill>; keyOf: Map<string, string>; members: Map<string, string[]>;
}
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
    const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "curriculumId", "familyId", "name", "code", "domain", "category", "isActive"] }) : [];
    const skillOf = new Map<string, IndexedSkill>(), keyOf = new Map<string, string>(), members = new Map<string, string[]>();
    for (const k of skills) {
      const sk: IndexedSkill = { id: s(k.id), name: s(k.name), code: s(k.code), domain: s(k.domain), category: s(k.category), isActive: k.isActive !== false && k.isActive !== 0, grade: gradeOfCur.get(s(k.curriculumId)) ?? 0 };
      const key = familyKeyOf(sk);
      skillOf.set(sk.id, sk); keyOf.set(sk.id, key);
      const list = members.get(key); if (list) list.push(sk.id); else members.set(key, [sk.id]);
    }
    for (const list of members.values()) list.sort((a, b) => (skillOf.get(a)!.grade - skillOf.get(b)!.grade) || (a < b ? -1 : a > b ? 1 : 0));
    return { ids: new Set(skillOf.keys()), gradeOf: new Map([...skillOf.values()].map((k) => [k.id, k.grade])), familyOf: new Map(skills.map((k) => [s(k.id), s(k.familyId)])), skillOf, keyOf, members };
  })().catch((e) => { m!.delete(schoolId); throw e; });
  remember(m, schoolId, { v, at: Date.now(), p }, 4); // Update 46: one index per school, few schools per server
  return p;
}

// ------------------------------------------------------------------ one question bank: skill families across grades

/**
 * The same skill is stored once per grade (“Central Idea” of Grade 4, of Grade 5 …). They form one FAMILY: the same
 * name (ignoring case, spaces, punctuation and a “Grade 4” / “G4” tag) and the same kind (reading · vocabulary ·
 * grammar · writing). The family's questions are ONE pool: every skill of the family reads all of them. Mastery,
 * attempts and results stay on the student's own skill row (the one assigned or opened).
 *
 * Grade-bound skills (never pooled; their own family): Concept Vocabulary / text-set vocabulary (the words of one
 * grade's texts) and the hidden “Unclassified (Curriculum Map)” skills.
 */
export function normalizeSkillName(name: string): string {
  return s(name).toLowerCase().replace(/&/g, " and ").replace(/[’'`]/g, "")
    .replace(/\(\s*(?:grade|gr\.?|g)\s*\d{1,2}\s*\)/g, " ").replace(/\b(?:grade|gr)\s*\d{1,2}\b/g, " ").replace(/\bg\d{1,2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
/** reading · vocabulary · grammar · writing (the skill's domain, grouped as teachers see it). */
export function skillKindOf(domain: string): string {
  const d = s(domain).toUpperCase();
  return d === "VOCABULARY" || d === "WORD_STUDY" ? "vocabulary" : d === "GRAMMAR" || d === "LANGUAGE" ? "grammar" : d === "WRITING" ? "writing" : d === "READING" ? "reading" : d.toLowerCase() || "reading";
}
/** Concept Vocabulary / text-set vocabulary and the hidden Curriculum Map skills belong to one grade's texts. */
export function isGradeBoundSkill(skill: { name?: unknown; code?: unknown }): boolean {
  const name = s(skill.name), code = s(skill.code), both = `${code} ${name}`;
  if (code.endsWith("curriculum-map-unclassified")) return true;
  if (/concept[\s._-]*vocab/i.test(both) || /\bcv\b/i.test(code.replace(/^g\d+\./i, ""))) return true;
  return /vocab/i.test(both) && /text[\s._-]*set|\bselection\b|\bweek\s*\d|\bunit\s*\d/i.test(both);
}
/** The family key of a skill: “kind:normalized name”, or “solo:<id>” for a grade-bound skill. */
/**
 * The same skill under different names in different grades / imports (“Main Idea”, “Main Idea and Key Details”,
 * “Central Idea and Relevant Details”) → one canonical name, so they form ONE family (one question pool).
 */
const CANON: [RegExp, string][] = [
  [/^(?:identify |determine |find |finding )?(?:the )?(?:main|central) ideas?(?: (?:and|with) (?:the )?(?:key|relevant|supporting) details?)?$/, "central idea"],
  [/^(?:key|supporting|relevant) details?$/, "central idea"],
  [/^(?:make |making |draw |drawing )?inferences?(?: (?:and|or) (?:draw(?:ing)? )?conclusions?)?$/, "make inferences"],
  [/^(?:identify |determine )?(?:the )?authors? purpose(?: and point of view)?$/, "authors purpose"],
  [/^(?:identify |determine |find )?(?:the )?theme(?:s)?$/, "theme"],
  [/^(?:use |using )?context clues?$/, "context clues"],
  [/^(?:summarize|summarizing|summary|summarise|summarising)(?: (?:a )?(?:text|story))?$/, "summarize"],
  [/^(?:identify )?text structures?$/, "text structure"],
  [/^(?:identify )?cause (?:and )?effect$/, "cause and effect"],
  [/^compare (?:and )?contrast$/, "compare and contrast"],
  [/^points? of view$/, "point of view"],
  [/^(?:identify )?text features?$/, "text features"],
  [/^(?:sequence|sequencing|sequence of events)$/, "sequence"],
  [/^(?:fact (?:and|or|vs) opinion)$/, "fact and opinion"],
  [/^(?:prefixes (?:and )?suffixes|prefix(?:es)?|suffix(?:es)?)$/, "prefixes and suffixes"],
  [/^(?:synonyms (?:and )?antonyms|synonyms|antonyms)$/, "synonyms and antonyms"],
  [/^(?:figurative language|similes? (?:and )?metaphors?)$/, "figurative language"],
];
export function canonicalSkillName(name: string): string {
  const n = normalizeSkillName(name).replace(/\b(?:skills?|reading skill)\b/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, to] of CANON) if (re.test(n)) return to;
  return n;
}
export function familyKeyOf(skill: { id?: unknown; name?: unknown; code?: unknown; domain?: unknown }): string {
  if (isGradeBoundSkill(skill)) return `solo:${s(skill.id) || s(skill.code)}`;
  const n = canonicalSkillName(s(skill.name));
  return n ? `${skillKindOf(s(skill.domain))}:${n}` : `solo:${s(skill.id) || s(skill.code)}`;
}

/** The family members (this skill first) of a skill of this school; [] for a skill of another school. */
export async function familyIdsInSchool(repo: Repo, schoolId: string, skillId: string): Promise<string[]> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const id = s(skillId);
  if (!idx.ids.has(id)) return [];
  return [id, ...(idx.members.get(idx.keyOf.get(id)!) ?? []).filter((x) => x !== id)];
}

const schoolOfSkill = new WeakMap<object, Map<string, string>>();
/** The school of a skill (skill → curriculum → grade), memoised: a skill never changes school. */
async function schoolOf(repo: Repo, skillId: string): Promise<string | null> {
  let m = schoolOfSkill.get(repo); if (!m) schoolOfSkill.set(repo, (m = new Map()));
  const hit = m.get(skillId); if (hit) return hit;
  const sk = await repo.findUnique("Skill", { id: skillId });
  const cur = sk?.curriculumId ? await repo.findUnique("Curriculum", { id: sk.curriculumId }) : null;
  const gr = cur?.gradeId ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!gr?.schoolId) return null;
  remember(m, skillId, s(gr.schoolId), 5000);
  return s(gr.schoolId);
}

/**
 * Every skill id of a skill's family (the skill itself first, then the other grades). A skill without a school, a
 * deleted or a grade-bound one is alone: [skillId]. Memoised (the school's skill index is cached per version).
 */
const familyMemo = new Map<string, { v: string; at: number; ids: string[] }>();
export async function skillFamilyIds(repo: Repo, skillId: string): Promise<string[]> {
  const id = s(skillId);
  if (!id) return [];
  // memoised per skill (ids are unique): a warm practice answer resolves the family without a read
  const v = modelVersion("Skill", "Curriculum", "Grade"), hit = familyMemo.get(id);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return [...hit.ids];
  const school = await schoolOf(repo, id);
  const found = school ? await familyIdsInSchool(repo, school, id) : [];
  const ids = found.length ? found : [id];
  remember(familyMemo, id, { v, at: Date.now(), ids }, 5000);
  return [...ids];
}

const studentGrade = new Map<string, { at: number; grade: number }>();
/**
 * The student's OWN row of a question's skill: a question taken from another grade's copy of the skill (one bank)
 * counts for the copy of the student's grade, when the family has one; otherwise the question's own skill. So a
 * Grade 4 student's answers to a pooled Grade 5 “Central Idea” question stay on their Grade 4 “Central Idea”.
 * A helper for callers that choose to use it: question sets (TEACHER_QUIZ) still record on the question's own row,
 * because the assessment system's level evidence reads those rows (left unchanged).
 */
export async function ownSkillIdForStudent(repo: Repo, schoolId: string, studentId: string, questionSkillId: string): Promise<string> {
  const id = s(questionSkillId);
  if (!schoolId || !studentId || !id) return id;
  const idx = await schoolSkillIndex(repo, schoolId);
  if (!idx.ids.has(id)) return id;
  const fam = idx.members.get(idx.keyOf.get(id)!) ?? [id];
  if (fam.length < 2) return id;
  let g = studentGrade.get(studentId);
  if (!g || Date.now() - g.at > 600_000) {
    const st = await repo.findUnique("Student", { id: studentId });
    const gr = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
    g = remember(studentGrade, studentId, { at: Date.now(), grade: Number(gr?.level ?? 0) }, 5000);
  }
  if (!g.grade || idx.gradeOf.get(id) === g.grade) return id;
  return fam.find((x) => idx.gradeOf.get(x) === g!.grade) ?? id;
}

/**
 * For results by skill (one bank): each question skill → the first family member listed in `prefer.ids` (the skills a
 * teacher picked or a test lists, in priority order), else the copy of `prefer.grade` (the class's grade), else itself. Unknown skills map to
 * themselves.
 */
export async function familyRepresentatives(repo: Repo, schoolId: string, skillIds: readonly string[], prefer: { ids?: readonly string[]; grade?: number } = {}): Promise<Map<string, string>> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const rank = new Map<string, number>();
  (prefer.ids ?? []).forEach((x, i) => { if (!rank.has(s(x))) rank.set(s(x), i); });
  const out = new Map<string, string>();
  for (const raw of skillIds) {
    const id = s(raw);
    if (out.has(id)) continue;
    if (!idx.ids.has(id)) { out.set(id, id); continue; }
    const fam = idx.members.get(idx.keyOf.get(id)!) ?? [id];
    // the first of `prefer.ids` (in its order) that is in the family, else the grade's copy, else the skill itself
    const ranked = fam.filter((x) => rank.has(x)).sort((a, b) => rank.get(a)! - rank.get(b)!)[0];
    out.set(id, ranked ?? (prefer.grade ? fam.find((x) => idx.gradeOf.get(x) === prefer.grade) : undefined) ?? id);
  }
  return out;
}

/** Every family member of several skills of a school (deduplicated; skills of other schools are dropped). */
export async function expandToFamilies(repo: Repo, schoolId: string, skillIds: readonly string[]): Promise<string[]> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const out = new Set<string>();
  for (const raw of skillIds) { const id = s(raw); if (!idx.ids.has(id)) continue; for (const x of idx.members.get(idx.keyOf.get(id)!) ?? [id]) out.add(x); }
  return [...out];
}

// ------------------------------------------------------------------ questions and counts

/**
 * The questions of one skill (published by default), optionally at one level, a page at a time (take ≤ 1000).
 * Returns [] for a skill of another school. Ordered by level, then id (stable pages).
 */
export async function questionsOfSkill(repo: Repo, schoolId: string, skillId: string, opts: SkillQuestionOpts = {}): Promise<SkillQuestion[]> {
  // one question bank: the questions of every grade's copy of the skill (Concept Vocabulary stays alone)
  const fam = await familyIdsInSchool(repo, schoolId, skillId);
  if (!fam.length) return [];
  const take = Math.max(1, Math.min(MAX_TAKE, Math.floor(opts.take ?? 200)));
  // the bank only (Curriculum Map questions stay with their lesson)
  const onMap = [...(await mapLinkedQuestionIds(repo))];
  const rows = await repo.findMany("Question", { skillId: fam.length === 1 ? fam[0] : { in: fam }, ...statusWhere(opts.status), ...levelWhere(opts.level), ...(onMap.length ? { id: { notIn: onMap } } : {}) }, {
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
export async function countQuestionsOfSkills(repo: Repo, schoolId: string, skillIds: readonly string[], opts: Omit<SkillQuestionOpts, "take" | "skip"> & { own?: boolean } = {}): Promise<Map<string, number>> {
  // one question bank: a skill's count is its family's (every grade's copy); `own` = the skill row's own questions
  if (opts.own) return countOwnQuestionsOfSkills(repo, schoolId, skillIds, opts);
  const idx = await schoolSkillIndex(repo, schoolId);
  const want = [...new Set(skillIds.map(s))];
  const fam = new Map(want.map((id) => [id, idx.ids.has(id) ? idx.members.get(idx.keyOf.get(id)!) ?? [id] : []]));
  const own = await countOwnQuestionsOfSkills(repo, schoolId, [...new Set([...fam.values()].flat())], opts);
  return new Map(want.map((id) => [id, fam.get(id)!.reduce((t, x) => t + (own.get(x) ?? 0), 0)]));
}

/** How many questions each skill ROW has itself (not pooled) — for reports that add rows up (no double counting). */
export async function countOwnQuestionsOfSkills(repo: Repo, schoolId: string, skillIds: readonly string[], opts: Omit<SkillQuestionOpts, "take" | "skip"> = {}): Promise<Map<string, number>> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const want = [...new Set(skillIds.map(s))];
  const mine = want.filter((id) => idx.ids.has(id));
  const out = new Map<string, number>(want.map((id) => [id, 0]));
  if (!mine.length) return out;
  // the whole school's counts for this status/level are cached (one entry), then picked
  let m = countCache.get(repo); if (!m) countCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${opts.status ?? "PUBLISHED"}|${JSON.stringify(opts.level ?? null)}`;
  const v = modelVersion("Question", "Skill", "Curriculum", "Grade", "QuestionMapLink"), hit = m.get(key);
  let all: Promise<Map<string, number>>;
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) all = hit.p;
  else {
    all = (async () => {
      const ids = [...idx.ids], counts = new Map<string, number>();
      const where = { ...statusWhere(opts.status), ...levelWhere(opts.level) };
      // ⚡ counted by the database (GROUP BY skill: one row per skill, not one per question), the parts in parallel
      const parts = (list: string[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
      // the bank only: Curriculum Map questions belong to their lesson, not to the bank's counts (Update 54) — their
      // counts per skill are taken away (read at the same time)
      const onMap = [...(await mapLinkedQuestionIds(repo))];
      const [all, linked] = await Promise.all([
        Promise.all(parts(ids, CHUNK).map((c) => countGroups(repo, "Question", "skillId", { skillId: { in: c }, ...where }))),
        Promise.all(parts(onMap, 1000).map((c) => countGroups(repo, "Question", "skillId", { id: { in: c }, ...where }))),
      ]);
      for (const part of all) for (const [k, n] of part) counts.set(k, (counts.get(k) ?? 0) + n);
      for (const part of linked) for (const [k, n] of part) if (counts.has(k)) counts.set(k, counts.get(k)! - n);
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
  // one question bank: the grade's skills of the area, with every grade's copy of each (same pool as the skill)
  const skillIds = await expandToFamilies(repo, schoolId, [...idx.ids].filter((id) => fams.has(idx.familyOf.get(id) ?? "") && (!opts.grade || idx.gradeOf.get(id) === opts.grade)));
  const allowed = new Set(skillIds);
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
    rows.push(...(await repo.findMany("Question", { id: { in: inIds.slice(i, i + CHUNK) }, ...statusWhere(opts.status), ...levelWhere(opts.level) }, sel)).filter((q) => idx.ids.has(s(q.skillId)) && (!opts.grade || allowed.has(s(q.skillId)) || idx.gradeOf.get(s(q.skillId)) === opts.grade)));
  }
  return rows.slice(opts.skip ?? 0, (opts.skip ?? 0) + take).map((q) => ({ id: s(q.id), skillId: s(q.skillId), difficultyLevel: Number(q.difficultyLevel ?? 4), typeId: s(q.typeId), standardId: q.standardId ? s(q.standardId) : null, passageId: q.passageId ? s(q.passageId) : null, status: s(q.status) }));
}

// ------------------------------------------------------------------ search: the skills a query names

/** Teachers' words for the same skill (shared with the search page). */
export const SKILL_SYNONYMS: [string, string][] = [["main inference", "make inferences"], ["main idea", "central idea"], ["central idea", "main idea"], ["inferences", "make inferences"], ["inference", "make inferences"], ["context clues", "word meaning"], ["text features", "text structure"], ["author's purpose", "point of view"], ["cause and effect", "text structure"], ["compare and contrast", "text structure"], ["capital letters", "capitalization"], ["capitalization", "capital letters"], ["vocab", "vocabulary"], ["grammar", "usage"]];

export interface SkillMatch {
  id: string; name: string; grade: number; questions: number; map: AreaRef | null; nafs: AreaRef | null;
  /** one question bank: the family (every grade's copy of this skill) this entry stands for */
  familyKey?: string; familySkillIds?: string[];
}
const words = (x: string) => x.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3);
const stemW = (w: string) => w.replace(/(ies)$/, "y").replace(/(ences|ence|ing|ed|es|s)$/, "");

/**
 * The skills a search names (every meaningful word is in the skill name, after simple stemming, or a teacher's
 * synonym names it: “main idea” → Central Idea, “inference” → Make Inferences), with the shared count. Used by the
 * Question Bank search so its “skills matching” show exactly the MAP / NAFS section numbers.
 *
 * One question bank: ONE entry per skill family. It stands for the asked grade's copy, else the nearest grade's copy
 * that has questions of its own (the lowest grade when none is asked); the count is the family's pooled count.
 * Grade-bound skills (Concept Vocabulary) are still shown for their own grade only.
 */
export async function skillsMatching(repo: Repo, schoolId: string, q: string, opts: { grade?: number; status?: SkillQuestionStatus } = {}): Promise<SkillMatch[]> {
  const raw = s(q).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  if (!raw) return [];
  const idx = await schoolSkillIndex(repo, schoolId);
  const usable = (k: IndexedSkill) => k.isActive && !k.code.endsWith(".curriculum-map-unclassified") && !(opts.grade && k.grade !== opts.grade && idx.keyOf.get(k.id)!.startsWith("solo:"));
  let hit: IndexedSkill[];
  if (raw.length < 3) {
    // type-ahead from the first letters: any word of the skill name starting with them
    const pre = raw.replace(/[^a-z0-9 ]/g, "");
    hit = pre ? [...idx.skillOf.values()].filter((k) => usable(k) && (k.name.toLowerCase().startsWith(pre) || k.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(pre)))) : [];
  } else {
    const queries = [raw, ...SKILL_SYNONYMS.filter(([a]) => raw.includes(a)).map(([a, b]) => raw.replace(a, b))];
    const qws = queries.map((qq) => words(qq).map(stemW).filter((w) => !["and", "the", "skill", "skills"].includes(w)));
    hit = [...idx.skillOf.values()].filter((k) => {
      if (!usable(k)) return false;
      const kw = new Set([...words(k.name), ...words(k.code.replace(/^g\d+\./i, "").replace(/[-_.]/g, " "))].map(stemW));
      return qws.some((qw) => qw.length > 0 && qw.every((w) => kw.has(w) || [...kw].some((x) => x.startsWith(w) && w.length >= 3)));
    });
    // the whole bank: the skills of questions whose text has the words (bounded, ids only)
    if (hit.length < 12) {
      const seen = new Set(hit.map((k) => k.id));
      const rows = await repo.findMany("Question", { stem: { contains: s(q).trim().slice(0, 80) }, deletedAt: null, ...statusWhere(opts.status) }, { select: ["skillId"], take: 400 }).catch(() => [] as Row[]);
      const byFamily = new Set(hit.map((k) => idx.keyOf.get(k.id)));
      for (const r of rows) {
        const k = idx.skillOf.get(s(r.skillId));
        if (!k || seen.has(k.id) || !usable(k) || byFamily.has(idx.keyOf.get(k.id))) continue;
        seen.add(k.id); byFamily.add(idx.keyOf.get(k.id)); hit.push(k);
      }
    }
  }
  if (!hit.length) return [];
  const byKey = new Map<string, IndexedSkill[]>();
  for (const k of hit) { const key = idx.keyOf.get(k.id)!; const l = byKey.get(key); if (l) l.push(k); else byKey.set(key, [k]); }
  const own = await countOwnQuestionsOfSkills(repo, schoolId, hit.map((k) => k.id), { status: opts.status });
  const target = opts.grade ?? 0;
  const reps = [...byKey.values()].map((list) => {
    const exact = opts.grade ? list.find((k) => k.grade === opts.grade) : undefined;
    if (exact) return exact;
    const withQ = list.filter((k) => (own.get(k.id) ?? 0) > 0);
    const pool = withQ.length ? withQ : list;
    return [...pool].sort((a, b) => Math.abs(a.grade - target) - Math.abs(b.grade - target) || a.grade - b.grade || a.id.localeCompare(b.id))[0];
  });
  const [counts, areas] = await Promise.all([countQuestionsOfSkills(repo, schoolId, reps.map((k) => k.id), { status: opts.status }), skillAreas(repo, reps.map((k) => k.id))]);
  return reps.map((k) => {
    const familyKey = idx.keyOf.get(k.id)!;
    return { id: k.id, name: k.name, grade: k.grade, questions: counts.get(k.id) ?? 0, map: areas.get(k.id)?.map ?? null, nafs: areas.get(k.id)?.nafs ?? null, familyKey, familySkillIds: [...(idx.members.get(familyKey) ?? [k.id])] };
  }).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)).slice(0, 30);
}

// ------------------------------------------------------------------ chosen questions or the automatic pool

/** A Json list of ids (array, or a JSON string of one) → the ids; anything else → []. */
function jsonIds(v: unknown): string[] {
  let x: unknown = v;
  if (typeof x === "string") { try { x = JSON.parse(x); } catch { return []; } }
  return Array.isArray(x) ? [...new Set(x.map(s).filter(Boolean))] : [];
}

export interface SelectSkillQuestionOpts extends SkillQuestionOpts {
  /**
   * The questions the teacher chose (e.g. in the question picker). When given, ONLY these are used, in this order
   * (missing, deleted or other-school ids are skipped; the level filter does not apply). Otherwise the skill's
   * family pool at the level (automatic selection).
   */
  questionIds?: string[];
}

/** The questions an assignment or a practice uses for a skill: the chosen ones, else the family pool at the level. */
export async function selectSkillQuestions(repo: Repo, schoolId: string, skillId: string, opts: SelectSkillQuestionOpts = {}): Promise<SkillQuestion[]> {
  const chosen = [...new Set((opts.questionIds ?? []).map(s).filter(Boolean))].slice(0, MAX_TAKE);
  if (!chosen.length) return questionsOfSkill(repo, schoolId, skillId, opts);
  const idx = await schoolSkillIndex(repo, schoolId);
  if (!idx.ids.has(s(skillId))) return [];
  const rows: Row[] = [];
  for (let i = 0; i < chosen.length; i += CHUNK) rows.push(...(await repo.findMany("Question", { id: { in: chosen.slice(i, i + CHUNK) }, ...statusWhere(opts.status) }, { select: ["id", "skillId", "difficultyLevel", "typeId", "standardId", "passageId", "status"] })));
  const byId = new Map(rows.filter((q) => idx.ids.has(s(q.skillId))).map((q) => [s(q.id), q]));
  return chosen.filter((id) => byId.has(id)).map((id) => { const q = byId.get(id)!; return { id, skillId: s(q.skillId), difficultyLevel: Number(q.difficultyLevel ?? 4), typeId: s(q.typeId), standardId: q.standardId ? s(q.standardId) : null, passageId: q.passageId ? s(q.passageId) : null, status: s(q.status) }; });
}

/**
 * The questions a teacher chose for an assignment, in order, or null when it uses automatic selection. A skill
 * assignment keeps the teacher's picks in Assignment.questionIds ("I'll pick the questions": assignSkill, plans);
 * a question set keeps them as its questions (Assignment.assessmentId → AssessmentQuestion.order, assignQuestions).
 * A skill assignment without picks is automatic (the platform chooses at each student's level).
 */
export async function chosenQuestionIdsOfAssignment(repo: Repo, assignmentId: string): Promise<string[] | null> {
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a) return null;
  const own = jsonIds(a.questionIds);
  if (own.length) return own.slice(0, MAX_TAKE);
  if (!a.assessmentId) return null;
  const rows = await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId }, { select: ["questionId", "order"], orderBy: [{ field: "order", dir: "asc" }], take: MAX_TAKE });
  return rows.length ? rows.map((r) => s(r.questionId)) : null;
}

// ------------------------------------------------------------------ admin report (read only)

export interface FamilyReportSkill { id: string; name: string; code: string; grade: number; questions: number }
export interface SkillFamilyReport {
  /** families whose members' names are not written exactly the same (e.g. “Author's Purpose” / “Authors Purpose”) */
  nameVariants: { schoolId: string; familyKey: string; names: string[]; skills: FamilyReportSkill[] }[];
  /** skills with no questions of their own while their family has some (they now read the family's pool) */
  emptyInFamily: { schoolId: string; familyKey: string; skill: FamilyReportSkill; familyQuestions: number }[];
}

/**
 * Read-only report of the one bank's families, for an admin page: name variants inside a family and skills with no
 * questions whose family has questions. Nothing is renamed or moved. Counts are the published questions.
 */
export async function skillFamilyReport(repo: Repo, schoolId?: string): Promise<SkillFamilyReport> {
  const schools = schoolId ? [schoolId] : (await repo.findMany("School", {}, { select: ["id"], take: 200 })).map((x) => s(x.id));
  const out: SkillFamilyReport = { nameVariants: [], emptyInFamily: [] };
  for (const sid of schools) {
    const idx = await schoolSkillIndex(repo, sid);
    const own = await countOwnQuestionsOfSkills(repo, sid, [...idx.ids]);
    for (const [key, ids] of idx.members) {
      if (key.startsWith("solo:")) continue;
      const skills = ids.map((id) => { const k = idx.skillOf.get(id)!; return { id, name: k.name, code: k.code, grade: k.grade, questions: own.get(id) ?? 0 }; });
      const names = [...new Set(skills.map((k) => k.name.trim()))];
      if (names.length > 1) out.nameVariants.push({ schoolId: sid, familyKey: key, names, skills });
      const total = skills.reduce((t, k) => t + k.questions, 0);
      if (total > 0) for (const k of skills) if (!k.questions && idx.skillOf.get(k.id)!.isActive) out.emptyInFamily.push({ schoolId: sid, familyKey: key, skill: k, familyQuestions: total });
    }
  }
  out.nameVariants.sort((a, b) => a.familyKey.localeCompare(b.familyKey));
  out.emptyInFamily.sort((a, b) => a.familyKey.localeCompare(b.familyKey) || a.skill.grade - b.skill.grade);
  return out;
}
