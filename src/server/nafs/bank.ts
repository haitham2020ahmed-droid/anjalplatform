/**
 * 🇸🇦 The NAFS question bank (NAFS center /teacher/nafs): ONLY questions of the NAFS skills —
 *   - platform questions: published multiple-choice questions of ANY of the school's skills (every grade, every source:
 *     skill bank, Curriculum Map, MAP-style, grammar, review sets …) whose family is linked to a NAFS skill
 *     (NafsSkillFamily), tagged with the first linked NAFS skill and a PIRLS process. Inside the center nothing is
 *     shown or filtered by grade: each question carries a DIFFICULTY (Easy / Medium / Hard) instead — its own (model
 *     booklets, practice sets, the teacher), else its statistics (enough answers), else its authoring level
 *   - the NAFS model booklets (NB-…) and the NAFS practice sets (NP-…): platform content loaded per school
 *   - the school's own NAFS questions (NafsBankItem.own): made in the section, AI drafts, or the school copy of an
 *     edited platform question (editing never changes the original). They live on a hidden holding skill of Grade 6
 *     (inactive: never in practice or the adaptive engine) and are read here whatever their status.
 * A question is never deleted: it is hidden (NafsBankItem.hidden). Every function checks NAFS access (Grade 6 teachers
 * and admins) and the school. Reads are bounded (selected columns, batched `in`), the index is kept a minute per school.
 */
import { randomBytes } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertNafs, NAFS_GRADE } from "../teacher/nafs-access";
import { passageForText } from "../admin/passages";
import { CONTENT_SKILLS, difficultyOfLevel, difficultyOfStats, domainOf, ensureNafsFramework, isDifficulty, isMoeCode, isNafsCode, isProcess, LEVEL_OF_DIFFICULTY, MOE_STANDARDS, NAFS_SKILLS, SKILL_BY_CODE, SKILL_OF_PROCESS, STATS_MIN_ATTEMPTS, standardFor, textTypeOf, type Difficulty, type NafsDomain, type NafsProcess } from "./framework";
import { sweptWeakMap } from "../cache/idle";
import { modelVersion } from "../cache/bank-version";
import { heavyBuild } from "../monitoring/memory";

const s = (v: unknown) => String(v ?? "");
const on = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

export const HOLDING_FAMILY = "nafs-section";
/** The holding family of the NAFS model booklets' questions (platform content; never practised). */
export const BOOKLET_FAMILY = "nafs-booklets";
/** The holding family of the NAFS practice sets' questions (platform content; only the NAFS center uses them). */
export const PRACTICE_FAMILY = "nafs-practice";
export const HOLDING_FAMILIES = new Set([HOLDING_FAMILY, BOOKLET_FAMILY, PRACTICE_FAMILY]);
/** A practice set's code (NP-001); a model booklet's is NB-001. */
export const isPracticeSetCode = (c: unknown) => /^NP-/.test(s(c));
export const BANK_PAGE = 20;
export type NafsKind = "MCQ" | "WRITTEN";
/** The question type of short written answers (teacher-scored with the item's rubric, never auto-scored). */
export const WRITTEN_TYPE = "SHORT_ANSWER";
export async function writtenTypeId(repo: Repo): Promise<string> {
  const t = await repo.findUnique("QuestionType", { code: WRITTEN_TYPE });
  return t ? s(t.id) : s((await repo.create("QuestionType", { code: WRITTEN_TYPE, name: "short answer", isAutoScored: false })).id);
}

async function inBatches(ids: string[], size: number, fn: (chunk: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

export interface NafsEntry {
  id: string; nafsCode: string; process: NafsProcess; domain: NafsDomain; passageId: string | null;
  own: boolean; hidden: boolean; draft: boolean; copyOfId: string | null;
  /** literary / informational from the question's skill family (the passage's genre decides first) */
  cat: "LIT" | "INFO" | null;
  /** the Ministry standard (MOE.S01 … S13) or null when not sure (the teacher sets it) */
  standard: string | null;
  /** multiple choice A–D, or a short written answer (teacher-scored) */
  kind: NafsKind;
  /** a model booklet question: its booklet code and number */
  booklet: string | null; bookletN: number | null;
  /** a NAFS practice set question: its set code (NP-001) — bookletN is its number in the set */
  practiceSet: string | null;
  /** Easy / Medium / Hard (never a grade inside the NAFS center) */
  difficulty: Difficulty;
}

// ------------------------------------------------------------------ the index (cached a minute per school)

const seeded = new WeakSet<object>();
/**
 * ⚡ r78: the school's index is kept while the tables it is built from are unchanged in this process (their write
 * counters: any question / skill / NAFS tag edit, through ANY path, builds it again at the next read; nafsBankChanged
 * drops it at once) and at most INDEX_MS (other processes: the jobs worker's statistics). Before r78 it was kept one
 * minute, so nearly every click in the NAFS center read the whole linked bank again (~25 reads, ~10 000 rows).
 * Concurrent misses share one build; a few schools at most (swept by cache/idle).
 */
const cache = sweptWeakMap<{ at: number; v: string; entries: NafsEntry[] }>("nafs.bank.cache", 5 * 60_000);
const building = new WeakMap<object, Map<string, { v: string; p: Promise<NafsEntry[]> }>>();
const INDEX_MS = 5 * 60_000; // r81: 10 → 5 minutes (512 MB plan)
const MAX_SCHOOLS = 2; // r81: one school per server in practice (512 MB plan)
/** The tables the index is built from (their write counters key the cache). */
const INDEX_MODELS = ["Question", "Skill", "SkillFamily", "NafsSkillFamily", "NafsBankItem", "QuestionType", "Curriculum", "Grade"];
const indexVersion = () => modelVersion(...INDEX_MODELS);
/** Forget the school's index after a change (the next read builds it again). */
export function nafsBankChanged(repo: Repo, schoolId: string): void { cache.get(repo)?.delete(schoolId); building.get(repo)?.delete(schoolId); }

export async function ensureFramework(repo: Repo): Promise<void> {
  if (seeded.has(repo)) return;
  await ensureNafsFramework(repo);
  seeded.add(repo);
}

/** Every NAFS question of the school (hidden and drafts included, flagged). */
export async function nafsIndex(repo: Repo, schoolId: string, now = Date.now()): Promise<NafsEntry[]> {
  const v = indexVersion();
  const hit = cache.get(repo)?.get(schoolId);
  if (hit && hit.v === v && now - hit.at < INDEX_MS) return hit.entries;
  let b = building.get(repo);
  if (!b) { b = new Map(); building.set(repo, b); }
  const busy = b.get(schoolId);
  if (busy && busy.v === v) return busy.p;
  // r84: a big build — one at a time with the other big builds of this process (monitoring/memory.ts heavyBuild)
  const p: Promise<NafsEntry[]> = heavyBuild(() => buildIndex(repo, schoolId)).then((entries) => {
    let m = cache.get(repo);
    if (!m) { m = new Map(); cache.set(repo, m); }
    m.delete(schoolId);
    m.set(schoolId, { at: now, v, entries });
    while (m.size > MAX_SCHOOLS) m.delete(m.keys().next().value as string);
    return entries;
  }).finally(() => { if (b!.get(schoolId)?.p === p) b!.delete(schoolId); });
  b.set(schoolId, { v, p });
  return p;
}

/**
 * 🧠 r84 memory: the index is light — ids, codes, flags and numbers only (never a stem, an option or a passage: those
 * are read for the rows actually shown, loadNafsQuestions). The codes, processes, standards, set codes and passage ids
 * repeat thousands of times: one shared copy of each (the database driver makes a new string for every row).
 */
function interner(): (v: string | null) => string | null {
  const seen = new Map<string, string>();
  return (v) => { if (v === null) return null; const h = seen.get(v); if (h !== undefined) return h; seen.set(v, v); return v; };
}

async function buildIndex(repo: Repo, schoolId: string): Promise<NafsEntry[]> {
  await ensureFramework(repo);
  const one = interner();
  const shared = <T extends string | null>(v: T): T => one(v) as T;
  const [links, fams, mc, grades, items] = await Promise.all([
    repo.findMany("NafsSkillFamily", {}, { select: ["nafsCode", "familyId", "source"] }),
    repo.findMany("SkillFamily", {}, { select: ["id", "code", "category"] }),
    repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }),
    // every grade of the school: the center collects by the NAFS links, never by grade
    repo.findMany("Grade", { schoolId }, { select: ["id"] }),
    repo.findMany("NafsBankItem", { schoolId }, { select: ["questionId", "nafsCode", "process", "own", "hidden", "draft", "copyOfId", "standard", "booklet", "bookletN", "difficulty"] }),
  ]);
  const holding = new Set(fams.filter((f) => HOLDING_FAMILIES.has(s(f.code))).map((f) => s(f.id)));
  const written = await repo.findUnique("QuestionType", { code: WRITTEN_TYPE });
  const kindOf = (typeId: unknown): NafsKind => (written && s(typeId) === s(written.id) ? "WRITTEN" : "MCQ");
  const order = new Map(NAFS_SKILLS.map((k, i) => [k.code, i]));
  const codesOf = new Map<string, string[]>();
  for (const l of links) {
    if (s(l.source) === "OFF" || !isNafsCode(l.nafsCode) || holding.has(s(l.familyId))) continue;
    const list = codesOf.get(s(l.familyId)) ?? [];
    list.push(s(l.nafsCode));
    codesOf.set(s(l.familyId), list);
  }
  for (const list of codesOf.values()) list.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const catOf = new Map(fams.map((f) => [s(f.id), s(f.category) === "LITERATURE" ? "LIT" as const : s(f.category) === "INFORMATIONAL" ? "INFO" as const : null]));
  const itemOf = new Map(items.map((x) => [s(x.questionId), x]));
  const out: NafsEntry[] = [];
  // platform questions of the linked families
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => s(g.id)) } }, { select: ["id"] }) : [];
  const famIds = [...codesOf.keys()];
  // (every skill of every grade whose family is linked — switched-off skills too: their questions still measure the skill)
  const skills = curs.length && famIds.length ? await inBatches(famIds, 400, (c) => repo.findMany("Skill", { curriculumId: { in: curs.map((x) => s(x.id)) }, familyId: { in: c }, deletedAt: null }, { select: ["id", "familyId"] })) : [];
  const famOfSkill = new Map(skills.map((k) => [s(k.id), s(k.familyId)]));
  const qs = mc && famOfSkill.size ? await inBatches([...famOfSkill.keys()], 300, (c) => repo.findMany("Question", { skillId: { in: c }, status: "PUBLISHED", deletedAt: null, typeId: mc.id }, { select: ["id", "skillId", "passageId", "stem", "difficultyLevel"] })) : [];
  // difficulty from statistics where a question has enough answers (one bounded read per 400 questions)
  const stats = qs.length ? await inBatches(qs.map((q) => s(q.id)), 400, (c) => repo.findMany("QuestionStats", { questionId: { in: c }, attempts: { gte: STATS_MIN_ATTEMPTS } }, { select: ["questionId", "attempts", "pValue"] })) : [];
  const statOf = new Map(stats.map((x) => [s(x.questionId), difficultyOfStats(x.attempts, x.pValue)]));
  const diffOf = (it: Row | undefined, q: Row): Difficulty => (isDifficulty(Number(it?.difficulty)) ? (Number(it!.difficulty) as Difficulty) : statOf.get(s(q.id)) ?? difficultyOfLevel(q.difficultyLevel));
  for (const q of qs) {
    const it = itemOf.get(s(q.id));
    if (it && on(it.own)) continue; // (an own question on a real skill is listed below)
    const fam = famOfSkill.get(s(q.skillId)) ?? "";
    const codes = codesOf.get(fam) ?? [];
    const firstContent = codes.find((c) => domainOf(c) !== "PIRLS");
    const firstProcess = codes.find((c) => domainOf(c) === "PIRLS");
    const fromProcess = firstProcess ? (firstProcess.slice(5) as NafsProcess) : null;
    const code = isNafsCode(it?.nafsCode) && domainOf(s(it?.nafsCode)) !== "PIRLS" ? s(it?.nafsCode) : firstContent ?? (fromProcess ? SKILL_OF_PROCESS[fromProcess] : null);
    if (!code) continue;
    const process = isProcess(it?.process) ? (s(it?.process) as NafsProcess) : fromProcess ?? SKILL_BY_CODE.get(code)!.process;
    out.push({ id: s(q.id), nafsCode: shared(code), process: shared(process), domain: domainOf(code), passageId: shared(q.passageId ? s(q.passageId) : null), own: false, hidden: on(it?.hidden), draft: false, copyOfId: null, cat: catOf.get(fam) ?? null, standard: shared(standardFor(it?.standard, code, s(q.stem))), kind: "MCQ", booklet: null, bookletN: null, practiceSet: null, difficulty: diffOf(it, q) });
  }
  // the school's own questions and the NAFS model booklets' questions (platform content, loaded for the school)
  const own = items.filter((x) => on(x.own) || x.booklet);
  // (r78: 1000 ids a read — the ~4 500 booklet and practice-set questions in 5 reads, not 12)
  const ownQs = own.length ? await inBatches(own.map((x) => s(x.questionId)), 1000, (c) => repo.findMany("Question", { id: { in: c }, deletedAt: null }, { select: ["id", "passageId", "typeId", "stem", "difficultyLevel"] })) : [];
  const ownQ = new Map(ownQs.map((q) => [s(q.id), q]));
  for (const it of own) {
    const q = ownQ.get(s(it.questionId));
    if (!q) continue;
    const code = isNafsCode(it.nafsCode) && domainOf(s(it.nafsCode)) !== "PIRLS" ? s(it.nafsCode) : "NAFS.RC.MAIN";
    const from = !on(it.own) && it.booklet ? s(it.booklet) : null;
    const set = from && isPracticeSetCode(from) ? from : null;
    const booklet = from && !set ? from : null;
    out.push({
      id: s(q.id), nafsCode: shared(code), process: shared(isProcess(it.process) ? (s(it.process) as NafsProcess) : SKILL_BY_CODE.get(code)!.process), domain: domainOf(code), passageId: shared(q.passageId ? s(q.passageId) : null),
      own: !from, hidden: on(it.hidden), draft: on(it.draft), copyOfId: it.copyOfId ? s(it.copyOfId) : null, cat: null,
      standard: shared(standardFor(it.standard, code, s(q.stem))), kind: kindOf(q.typeId), booklet: shared(booklet), bookletN: from && it.bookletN !== null && it.bookletN !== undefined ? Number(it.bookletN) : null,
      practiceSet: shared(set), difficulty: isDifficulty(Number(it.difficulty)) ? (Number(it.difficulty) as Difficulty) : difficultyOfLevel(q.difficultyLevel),
    });
  }
  return out;
}

/** Usable in a test: not hidden, not a draft waiting for review. */
export const usable = (e: NafsEntry) => !e.hidden && !e.draft;
/** A question "belongs to" a NAFS code: its skill, or (PIRLS skills) its process. */
export const matchesCode = (e: NafsEntry, code: string) => e.nafsCode === code || `NAFS.${e.process}` === code;
/** A target of a test or a practice: a NAFS skill (or PIRLS process) code, or a Ministry standard (MOE.S01 …). */
export const matchesTarget = (e: NafsEntry, code: string) => (isMoeCode(code) ? e.standard === code : matchesCode(e, code));
export const isTargetCode = (c: unknown): c is string => isNafsCode(c) || isMoeCode(c);

function schoolOf(actor: Actor): string {
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  return actor.schoolId;
}

// ------------------------------------------------------------------ the Skills tab (counts) and the admin's links

export interface SkillCount { code: string; name: string; domain: NafsDomain; questions: number; own: number; families: { id: string; name: string; source: string }[] }
export async function nafsSkillCounts(repo: Repo, actor: Actor): Promise<SkillCount[]> {
  await assertNafs(repo, actor);
  const idx = (await nafsIndex(repo, schoolOf(actor))).filter(usable);
  const links = await repo.findMany("NafsSkillFamily", {}, { select: ["nafsCode", "familyId", "source"] });
  const live = links.filter((l) => s(l.source) !== "OFF");
  const fams = live.length ? await repo.findMany("SkillFamily", { id: { in: [...new Set(live.map((l) => s(l.familyId)))] } }, { select: ["id", "name"] }) : [];
  const nameOf = new Map(fams.map((f) => [s(f.id), s(f.name)]));
  return NAFS_SKILLS.map((k) => {
    const mine = idx.filter((e) => matchesCode(e, k.code));
    return {
      code: k.code, name: k.name, domain: k.domain, questions: mine.length, own: mine.filter((e) => e.own).length,
      families: live.filter((l) => s(l.nafsCode) === k.code && nameOf.has(s(l.familyId))).map((l) => ({ id: s(l.familyId), name: nameOf.get(s(l.familyId))!, source: s(l.source) })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

export interface StandardCount { code: string; short: string; text: string; area: string; questions: number; written: number; booklet: number }
/** The 13 Ministry standards with the number of usable NAFS questions of each (and how many are not set yet). */
export async function nafsStandardCounts(repo: Repo, actor: Actor): Promise<{ rows: StandardCount[]; notSet: number }> {
  await assertNafs(repo, actor);
  const idx = (await nafsIndex(repo, schoolOf(actor))).filter(usable);
  return {
    rows: MOE_STANDARDS.map((x) => {
      const mine = idx.filter((e) => e.standard === x.code);
      return { code: x.code, short: x.short, text: x.text, area: x.area, questions: mine.length, written: mine.filter((e) => e.kind === "WRITTEN").length, booklet: mine.filter((e) => e.booklet).length };
    }),
    notSet: idx.filter((e) => !e.standard).length,
  };
}

/** Admin: link (or unlink) a NAFS skill and a platform skill family. An unlinked AUTO link stays off (source OFF). */
export async function setNafsFamilyLink(repo: Repo, actor: Actor, input: { code: string; familyId: string; linked: boolean }, now = new Date()): Promise<void> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins change the NAFS skill links.");
  await assertNafs(repo, actor);
  if (!isNafsCode(input.code)) throw new ValidationError("Unknown NAFS skill.");
  const f = await repo.findUnique("SkillFamily", { id: s(input.familyId) });
  if (!f) throw new ValidationError("Skill not found.");
  const source = input.linked ? "ADMIN" : "OFF";
  await repo.upsert("NafsSkillFamily", { nafsCode: input.code, familyId: s(f.id) }, { source, updatedAt: now }, { source, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "nafs.skill_link", entityType: "SkillFamily", entityId: s(f.id), after: { code: input.code, linked: input.linked }, at: now });
  cache.delete(repo); // every school's index uses the links
}

/** The families an admin may link (A–Z, the holding family left out). */
export async function linkableFamilies(repo: Repo): Promise<{ id: string; name: string }[]> {
  return (await repo.findMany("SkillFamily", {}, { select: ["id", "code", "name"] })).filter((f) => !HOLDING_FAMILIES.has(s(f.code))).map((f) => ({ id: s(f.id), name: s(f.name) })).sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ question content (any status; MCQ A–D)

export interface NafsQuestion {
  id: string; stem: string; options: string[]; correct: number; explanation: string;
  passage: { id: string; title: string; text: string; type: "LIT" | "INFO" | null } | null;
  status: string;
  /** MCQ (options A–D, key `correct`) or WRITTEN (no options, correct −1; scored by the teacher with `rubric`) */
  kind: NafsKind; rubric: string[]; model: string;
}
const asObj = (v: unknown): Record<string, unknown> => { if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; } } return v && typeof v === "object" ? (v as Record<string, unknown>) : {}; };

/** The questions' text, options (A–D order), key, explanation and passage (one read per table). */
export async function loadNafsQuestions(repo: Repo, ids: string[]): Promise<NafsQuestion[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return [];
  const [qs, wt] = await Promise.all([
    inBatches(uniq, 400, (c) => repo.findMany("Question", { id: { in: c }, deletedAt: null }, { select: ["id", "stem", "passageId", "status", "typeId", "content"] })),
    repo.findUnique("QuestionType", { code: WRITTEN_TYPE }),
  ]);
  const qIds = qs.map((q) => s(q.id));
  const [opts, expl] = await Promise.all([
    inBatches(qIds, 400, (c) => repo.findMany("QuestionOption", { questionId: { in: c } }, { select: ["questionId", "text", "isCorrect", "order"] })),
    inBatches(qIds, 400, (c) => repo.findMany("QuestionExplanation", { questionId: { in: c }, kind: "WHY_CORRECT" }, { select: ["questionId", "body"] })),
  ]);
  const pIds = [...new Set(qs.map((q) => s(q.passageId)).filter(Boolean))];
  const passages = pIds.length ? await inBatches(pIds, 200, (c) => repo.findMany("ReadingPassage", { id: { in: c } }, { select: ["id", "title", "body", "genre"] })) : [];
  const byId = new Map(qs.map((q) => [s(q.id), q]));
  const out: NafsQuestion[] = [];
  for (const id of uniq) {
    const q = byId.get(id);
    if (!q) continue;
    const o = opts.filter((x) => s(x.questionId) === id).sort((a, b) => Number(a.order) - Number(b.order));
    const p = passages.find((x) => s(x.id) === s(q.passageId));
    const body = expl.find((x) => s(x.questionId) === id)?.body;
    const parsed = (typeof body === "string" ? (() => { try { return JSON.parse(body); } catch { return []; } })() : body) as { text?: string }[] | null;
    const written = Boolean(wt) && s(q.typeId) === s(wt!.id);
    const content = asObj(q.content);
    out.push({
      id, stem: s(q.stem), options: written ? [] : o.map((x) => s(x.text)), correct: written ? -1 : Math.max(0, o.findIndex((x) => on(x.isCorrect))), status: s(q.status),
      explanation: Array.isArray(parsed) ? parsed.map((b) => s(b?.text)).join(" ").trim() : "",
      passage: p ? passageOf(p) : null,
      kind: written ? "WRITTEN" : "MCQ", rubric: written && Array.isArray(content.rubric) ? (content.rubric as unknown[]).map(s).slice(0, 3) : [], model: written ? s(content.model) : "",
    });
  }
  return out;
}
const cleanTitle = (t: string) => (/^(passage|imported passage)\s*:/i.test(t) ? "" : t);
/** The passage's title and text (a text that starts with its title line does not repeat it). */
function passageOf(p: Row): NonNullable<NafsQuestion["passage"]> {
  const title = cleanTitle(s(p.title).trim());
  let text = s(p.body).replace(/\r\n/g, "\n").trim();
  if (title && text.split("\n")[0].trim() === title) text = text.slice(text.indexOf("\n") + 1).trim();
  return { id: s(p.id), title, text, type: textTypeOf(p.genre) };
}

// ------------------------------------------------------------------ the Question bank tab

export type BankSource = "ALL" | "PLATFORM" | "OWN" | "DRAFT" | "HIDDEN";
export interface BankFilter {
  domain?: string | null; code?: string | null; source?: BankSource | null; passage?: "WITH" | "WITHOUT" | null; q?: string | null; page?: number; standard?: string | null; kind?: NafsKind | null; difficulty?: number | string | null;
  /** any of these NAFS skills / Ministry standards (the checklists' "questions behind the selection") */
  targets?: string[] | null;
  /** one model booklet (NB-…) or practice set (NP-…) */
  set?: string | null;
  /** rows per page (default BANK_PAGE, at most 50) */
  size?: number | null;
}
export interface BankRow { id: string; stem: string; nafsCode: string; skill: string; process: NafsProcess; own: boolean; hidden: boolean; draft: boolean; copy: boolean; passageTitle: string | null; hasPassage: boolean; standard: string | null; kind: NafsKind; booklet: string | null; practiceSet: string | null; difficulty: Difficulty;
  /** the options A–D (empty for a short written answer) and the key — for the preview */
  options: string[]; correct: number }
export interface BankPage { rows: BankRow[]; total: number; page: number; pages: number }

export async function nafsBankPage(repo: Repo, actor: Actor, f: BankFilter = {}): Promise<BankPage> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  let list = await nafsIndex(repo, schoolId);
  const src = f.source ?? "ALL";
  list = list.filter((e) => (src === "HIDDEN" ? e.hidden : src === "DRAFT" ? e.draft && !e.hidden : !e.hidden && (src === "ALL" ? !e.draft : src === "OWN" ? e.own && !e.draft : !e.own)));
  if (f.domain) list = list.filter((e) => (f.domain === "PIRLS" ? true : e.domain === f.domain));
  if (f.code && isNafsCode(f.code)) list = list.filter((e) => matchesCode(e, f.code!));
  if (f.passage === "WITH") list = list.filter((e) => e.passageId); else if (f.passage === "WITHOUT") list = list.filter((e) => !e.passageId);
  if (f.standard === "NONE") list = list.filter((e) => !e.standard); else if (isMoeCode(f.standard)) list = list.filter((e) => e.standard === f.standard);
  if (f.kind === "MCQ" || f.kind === "WRITTEN") list = list.filter((e) => e.kind === f.kind);
  const targets = (Array.isArray(f.targets) ? f.targets : []).map(s).filter(isTargetCode);
  if (targets.length) list = list.filter((e) => targets.some((t) => matchesTarget(e, t)));
  const set = s(f.set).trim();
  if (/^N[BP]-[A-Za-z0-9-]{1,12}$/.test(set)) list = list.filter((e) => e.booklet === set || e.practiceSet === set);
  const dif = Number(f.difficulty);
  if (isDifficulty(dif)) list = list.filter((e) => e.difficulty === dif);
  const q = s(f.q).trim().slice(0, 80);
  if (q) {
    const hits = await inBatches(list.map((e) => e.id), 500, (c) => repo.findMany("Question", { id: { in: c }, stem: { contains: q } }, { select: ["id"] }));
    const set = new Set(hits.map((h) => s(h.id)));
    list = list.filter((e) => set.has(e.id));
  }
  // own questions first, then by skill
  const order = new Map(NAFS_SKILLS.map((k, i) => [k.code, i]));
  list = [...list].sort((a, b) => Number(b.own) - Number(a.own) || (order.get(a.nafsCode) ?? 0) - (order.get(b.nafsCode) ?? 0) || a.id.localeCompare(b.id));
  const size = Math.max(5, Math.min(50, Math.floor(Number(f.size) || BANK_PAGE)));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(f.page) || 1)));
  const slice = list.slice((page - 1) * size, page * size);
  const qs = await loadNafsQuestions(repo, slice.map((e) => e.id));
  return {
    total: list.length, page, pages,
    rows: slice.map((e) => {
      const x = qs.find((y) => y.id === e.id);
      return { id: e.id, stem: s(x?.stem).slice(0, 220), nafsCode: e.nafsCode, skill: SKILL_BY_CODE.get(e.nafsCode)?.name ?? "", process: e.process, own: e.own, hidden: e.hidden, draft: e.draft, copy: Boolean(e.copyOfId), passageTitle: x?.passage ? x.passage.title || null : null, hasPassage: Boolean(e.passageId), standard: e.standard, kind: e.kind, booklet: e.booklet, practiceSet: e.practiceSet, difficulty: e.difficulty, options: x?.options ?? [], correct: x?.correct ?? -1 };
    }),
  };
}

/** One NAFS question in full (the teacher's view: passage, options, key, explanation, tags). */
export async function nafsQuestionView(repo: Repo, actor: Actor, id: string): Promise<{ q: NafsQuestion; entry: NafsEntry }> {
  await assertNafs(repo, actor);
  const entry = (await nafsIndex(repo, schoolOf(actor))).find((e) => e.id === id);
  if (!entry) throw new ForbiddenError("This question is not in the NAFS bank.");
  const q = (await loadNafsQuestions(repo, [id]))[0];
  if (!q) throw new ForbiddenError("This question is not in the NAFS bank.");
  return { q, entry };
}

// ------------------------------------------------------------------ add / edit (edit a platform question = a copy) / hide

export interface NafsQuestionInput {
  /** empty = a new question; an own question is changed; a platform question gets a school copy */
  id?: string | null;
  nafsCode: string; process?: string | null;
  /** the Ministry standard (MOE.S01 … S13); empty = automatic where sure */
  standard?: string | null;
  /** MCQ (default) or WRITTEN (a short written answer scored by the teacher with the rubric 0/1/2) */
  kind?: NafsKind | null;
  stem: string; options: string[]; correct: number; explanation?: string | null;
  /** WRITTEN: a model answer and the rubric ("2 = …", "1 = …", "0 = …") */
  model?: string | null; rubric?: string[] | null;
  /** optional passage (empty = none); its title and kind */
  passageTitle?: string | null; passageText?: string | null; textType?: "LIT" | "INFO" | null;
  /** Easy 1 / Medium 2 / Hard 3 (empty = Medium) */
  difficulty?: number | null;
}
export interface CleanQuestion { code: string; process: NafsProcess | null; standard: string | null; kind: NafsKind; stem: string; options: string[]; correct: number; explanation: string; model: string; rubric: string[]; passage: { title: string; text: string; type: "LIT" | "INFO" | null } | null; difficulty: Difficulty | null }

/** The default rubric of a short written answer (the teacher changes it). */
export const DEFAULT_RUBRIC = ["2 = a complete, correct answer that fits the text", "1 = a partly correct or incomplete answer", "0 = no answer, or an answer that does not fit"];

export function cleanInput(i: NafsQuestionInput): CleanQuestion {
  if (!isNafsCode(i.nafsCode) || domainOf(i.nafsCode) === "PIRLS") throw new ValidationError("Choose the NAFS skill (Reading Comprehension, Inferring/Analyzing/Evaluating or Vocabulary).");
  const process = i.process ? (isProcess(i.process) ? (i.process as NafsProcess) : null) : null;
  if (i.process && !process) throw new ValidationError("Unknown reading process.");
  if (i.standard && !isMoeCode(i.standard)) throw new ValidationError("Unknown Ministry standard.");
  const kind: NafsKind = i.kind === "WRITTEN" ? "WRITTEN" : "MCQ";
  const one = (v: unknown) => s(v).replace(/\s+/g, " ").trim();
  const stem = one(i.stem);
  if (stem.length < 5) throw new ValidationError("Write the question.");
  if (stem.length > 1000) throw new ValidationError("The question is too long (1000 characters at most).");
  let options: string[] = [], correct = -1, model = "", rubric: string[] = [];
  if (kind === "MCQ") {
    options = (Array.isArray(i.options) ? i.options : []).map(one);
    if (options.length !== 4 || options.some((o) => !o)) throw new ValidationError("Write all four options (A–D).");
    if (options.some((o) => o.length > 300)) throw new ValidationError("An option is too long (300 characters at most).");
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) throw new ValidationError("The four options must be different.");
    correct = Math.floor(Number(i.correct));
    if (!(correct >= 0 && correct <= 3)) throw new ValidationError("Choose the correct option.");
  } else {
    model = one(i.model).slice(0, 1000);
    if (model.length < 2) throw new ValidationError("Write a model answer for the written question.");
    const r = (Array.isArray(i.rubric) ? i.rubric : []).map(one).filter(Boolean).slice(0, 3);
    rubric = r.length === 3 ? r.map((x) => x.slice(0, 300)) : DEFAULT_RUBRIC;
  }
  const text = s(i.passageText).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length > 8000) throw new ValidationError("The passage is too long (8000 characters at most).");
  if (text && text.length < 40) throw new ValidationError("The passage is too short.");
  const title = one(i.passageTitle).slice(0, 150);
  const dif = i.difficulty === null || i.difficulty === undefined || s(i.difficulty) === "" ? null : Number(i.difficulty);
  if (dif !== null && !isDifficulty(dif)) throw new ValidationError("Difficulty must be Easy, Medium or Hard.");
  return { code: i.nafsCode, process, standard: i.standard ? s(i.standard) : null, kind, stem, options, correct, model, rubric, explanation: one(i.explanation).slice(0, 1000), passage: text ? { title, text, type: i.textType === "LIT" || i.textType === "INFO" ? i.textType : null } : null, difficulty: dif as Difficulty | null };
}

/** The school's hidden holding skill for its own NAFS questions (Grade 6; inactive: never practised or assigned). */
export async function holdingSkill(repo: Repo, schoolId: string, family: string = HOLDING_FAMILY): Promise<string> {
  const grade = (await repo.findMany("Grade", { schoolId, level: NAFS_GRADE }, { select: ["id"] }))[0] ?? (await repo.findMany("Grade", { schoolId }, { select: ["id", "level"], orderBy: [{ field: "level", dir: "desc" }], take: 1 }))[0];
  if (!grade) throw new ValidationError("The school has no grades yet.");
  const cur = (await repo.findMany("Curriculum", { gradeId: grade.id }, { select: ["id"], take: 1 }))[0];
  if (!cur) throw new ValidationError("Grade 6 has no curriculum yet.");
  const code = `G${NAFS_GRADE}.${family}`;
  const have = await repo.findUnique("Skill", { curriculumId: cur.id, code });
  if (have) return s(have.id);
  const name = family === BOOKLET_FAMILY ? "NAFS model booklets" : family === PRACTICE_FAMILY ? "NAFS practice sets" : "NAFS section (school questions)";
  let fam = await repo.findUnique("SkillFamily", { code: family });
  if (!fam) fam = await repo.create("SkillFamily", { code: family, name, domain: "READING", category: "COMPREHENSION" });
  const about = family === BOOKLET_FAMILY ? "The NAFS model booklets' questions (NAFS section). Not practised." : family === PRACTICE_FAMILY ? "The NAFS practice sets' questions (NAFS center only). Not practised elsewhere." : "The school's own NAFS questions (NAFS section). Not practised.";
  const k = await repo.create("Skill", { curriculumId: cur.id, familyId: fam.id, code, name, description: about, domain: "READING", category: "COMPREHENSION", sequence: 9999, isActive: false });
  return s(k.id);
}

/**
 * The ids of this school's NAFS holding skills (model booklets / practice sets / the section's own-question skill)
 * that already exist — a pure lookup, never creating one (unlike holdingSkill above). Every Question filed under
 * one of these is platform/section content that was explicitly designed to never be practised directly by a
 * student; a bug could still leave a stray real-looking SkillStatus row on one of them (see syncNafsPracticeStars
 * and healHoldingSkillStatus below), and this is how both the leak-prevention and the self-heal recognise them.
 */
export async function existingHoldingSkillIds(repo: Repo, schoolId: string): Promise<Set<string>> {
  const grade = (await repo.findMany("Grade", { schoolId, level: NAFS_GRADE }, { select: ["id"] }))[0] ?? (await repo.findMany("Grade", { schoolId }, { select: ["id"], orderBy: [{ field: "level", dir: "desc" }], take: 1 }))[0];
  if (!grade) return new Set();
  const cur = (await repo.findMany("Curriculum", { gradeId: grade.id }, { select: ["id"], take: 1 }))[0];
  if (!cur) return new Set();
  const codes = [...HOLDING_FAMILIES].map((f) => `G${NAFS_GRADE}.${f}`);
  const rows = await repo.findMany("Skill", { curriculumId: cur.id, code: { in: codes } }, { select: ["id"] });
  return new Set(rows.map((r) => s(r.id)));
}

/**
 * Self-heal for the NAFS holding-skill leak (syncNafsPracticeStars used to call refreshSkillStatus directly on a
 * holding skill's id, creating a real-looking SkillStatus row on a skill that was designed to be invisible — see
 * that function and mapPracticeSkills). This sandbox has no connection to the production database, so there is no
 * one-off SQL/migration script to clean up rows that already exist there; instead, this runs lazily, for ONE
 * student at a time, wherever that student's own SkillStatus rows are naturally read (their Skills page, their MAP
 * page) — every normal visit quietly removes that student's own stray rows, with no bulk/global operation needed.
 * Conservative by design: it only ever deletes a row whose skillId is EXACTLY one of the holding ids above, never
 * any other skill, so it can never touch legitimate data even if called on every read.
 */
export async function healHoldingSkillStatus(repo: Repo, schoolId: string, rows: readonly Row[]): Promise<Row[]> {
  const holding = await existingHoldingSkillIds(repo, schoolId);
  if (!holding.size) return [...rows];
  const bad = rows.filter((r) => r.skillId && holding.has(s(r.skillId)));
  if (bad.length) await Promise.all(bad.map((r) => repo.deleteMany("SkillStatus", { id: r.id }).catch(() => undefined)));
  return rows.filter((r) => !(r.skillId && holding.has(s(r.skillId))));
}

/** Writes a question's content (new: on the holding skill; existing: in place). WRITTEN questions have no options. */
export async function writeQuestion(repo: Repo, actor: Actor, schoolId: string, c: CleanQuestion, opts: { id?: string; status: "PUBLISHED" | "DRAFT"; origin: "TEACHER_AUTHORED" | "AI_GENERATED" | "IMPORTED"; skillId?: string; externalRef?: string; passageId?: string | null }, now: Date): Promise<string> {
  let passageId: string | null = opts.passageId ?? null;
  if (!passageId && c.passage) {
    passageId = await passageForText(repo, c.passage.title && !c.passage.text.startsWith(c.passage.title) ? `${c.passage.title}\n${c.passage.text}` : c.passage.text, NAFS_GRADE, actor.userId, now);
    const p = await repo.findUnique("ReadingPassage", { id: passageId });
    if (p && !p.genre && c.passage.type) await repo.updateMany("ReadingPassage", { id: passageId }, { genre: c.passage.type === "LIT" ? "Literary" : "Informational" });
  }
  const typeId = c.kind === "WRITTEN" ? await writtenTypeId(repo) : s((await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))?.id) || s((await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true })).id);
  const content = c.kind === "WRITTEN" ? { model: c.model, rubric: c.rubric, maxScore: 2 } : {};
  let id = opts.id;
  if (id) {
    await repo.updateMany("Question", { id }, { stem: c.stem, passageId, typeId, content, status: opts.status, updatedAt: now, contentHash: null, ...(c.difficulty ? { difficultyLevel: LEVEL_OF_DIFFICULTY[c.difficulty] } : {}) });
    await repo.deleteMany("QuestionOption", { questionId: id });
    await repo.deleteMany("QuestionExplanation", { questionId: id });
  } else {
    const skillId = opts.skillId ?? (await holdingSkill(repo, schoolId));
    const q = await repo.create("Question", {
      externalRef: opts.externalRef ?? `NAFS-${randomBytes(5).toString("hex")}`, skillId, passageId, typeId, stem: c.stem, content, difficultyLevel: LEVEL_OF_DIFFICULTY[c.difficulty ?? 2], irtA: 1, irtB: c.difficulty ? c.difficulty - 2 : 0, irtC: 0,
      estimatedSeconds: c.kind === "WRITTEN" ? 180 : 75, status: opts.status, origin: opts.origin, aiStatus: opts.origin === "AI_GENERATED" ? "AI_GENERATED" : null, tags: { nafs: c.code, ...(c.standard ? { moe: c.standard } : {}) },
      createdById: actor.userId, publishedAt: opts.status === "PUBLISHED" ? now : null, createdAt: now, updatedAt: now,
    });
    id = s(q.id);
  }
  if (c.options.length) await repo.createMany("QuestionOption", c.options.map((text, i) => ({ questionId: id, label: "ABCD"[i], text, isCorrect: i === c.correct, rationale: null, order: i })));
  if (c.explanation) await repo.createMany("QuestionExplanation", [{ questionId: id, kind: "WHY_CORRECT", body: [{ type: "text", text: c.explanation }], order: 0 }]);
  return id;
}

/**
 * Add a question, or edit one. An own question changes in place; a PLATFORM question is never changed: the school gets
 * its own copy (copyOfId) and the original is hidden in this school's NAFS bank. Returns the saved question's id.
 */
export async function saveNafsQuestion(repo: Repo, actor: Actor, input: NafsQuestionInput, now = new Date()): Promise<{ id: string; copied: boolean }> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  const c = cleanInput(input);
  const editId = s(input.id);
  let copied = false, id: string;
  if (!editId) {
    id = await writeQuestion(repo, actor, schoolId, c, { status: "PUBLISHED", origin: "TEACHER_AUTHORED" }, now);
    await repo.create("NafsBankItem", { schoolId, questionId: id, nafsCode: c.code, process: c.process, standard: c.standard, difficulty: c.difficulty, own: true, hidden: false, draft: false, createdById: actor.userId, createdAt: now, updatedAt: now });
  } else {
    const entry = (await nafsIndex(repo, schoolId)).find((e) => e.id === editId);
    if (!entry) throw new ForbiddenError("This question is not in the NAFS bank.");
    if (entry.own) {
      id = editId;
      await writeQuestion(repo, actor, schoolId, c, { id, status: entry.draft ? "DRAFT" : "PUBLISHED", origin: "TEACHER_AUTHORED" }, now);
      await repo.updateMany("NafsBankItem", { schoolId, questionId: id }, { nafsCode: c.code, process: c.process, standard: c.standard, ...(c.difficulty ? { difficulty: c.difficulty } : {}), updatedAt: now });
    } else {
      copied = true;
      id = await writeQuestion(repo, actor, schoolId, c, { status: "PUBLISHED", origin: "TEACHER_AUTHORED" }, now);
      await repo.create("NafsBankItem", { schoolId, questionId: id, nafsCode: c.code, process: c.process, standard: c.standard ?? entry.standard, difficulty: c.difficulty ?? entry.difficulty, own: true, copyOfId: editId, hidden: false, draft: false, createdById: actor.userId, createdAt: now, updatedAt: now });
      await repo.upsert("NafsBankItem", { schoolId, questionId: editId }, { hidden: true, createdById: actor.userId, createdAt: now, updatedAt: now }, { hidden: true, updatedAt: now });
    }
  }
  nafsBankChanged(repo, schoolId);
  await audit(repo, { actorId: actor.userId, action: editId ? (copied ? "nafs.question.copy" : "nafs.question.update") : "nafs.question.create", entityType: "Question", entityId: id, after: { code: c.code, process: c.process, copyOf: copied ? editId : null }, at: now });
  return { id, copied };
}

/** Hide (or show again) a question in the school's NAFS bank. Nothing is deleted. */
export async function setNafsHidden(repo: Repo, actor: Actor, questionId: string, hidden: boolean, now = new Date()): Promise<void> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  if (!(await nafsIndex(repo, schoolId)).some((e) => e.id === questionId)) throw new ForbiddenError("This question is not in the NAFS bank.");
  await repo.upsert("NafsBankItem", { schoolId, questionId }, { hidden, createdById: actor.userId, createdAt: now, updatedAt: now }, { hidden, updatedAt: now });
  nafsBankChanged(repo, schoolId);
  await audit(repo, { actorId: actor.userId, action: hidden ? "nafs.question.hide" : "nafs.question.show", entityType: "Question", entityId: questionId, at: now });
}

/** Change a question's NAFS skill / reading process / Ministry standard for this school (the question itself is not changed). */
export async function retagNafsQuestion(repo: Repo, actor: Actor, questionId: string, code: string, process: string | null, now = new Date(), standard?: string | null): Promise<void> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  if (!isNafsCode(code) || domainOf(code) === "PIRLS") throw new ValidationError("Choose a NAFS skill.");
  if (process && !isProcess(process)) throw new ValidationError("Unknown reading process.");
  if (standard && !isMoeCode(standard)) throw new ValidationError("Unknown Ministry standard.");
  if (!(await nafsIndex(repo, schoolId)).some((e) => e.id === questionId)) throw new ForbiddenError("This question is not in the NAFS bank.");
  const st = standard === undefined ? {} : { standard: standard || null };
  await repo.upsert("NafsBankItem", { schoolId, questionId }, { nafsCode: code, process: process || null, ...st, createdById: actor.userId, createdAt: now, updatedAt: now }, { nafsCode: code, process: process || null, ...st, updatedAt: now });
  nafsBankChanged(repo, schoolId);
}

/** An AI draft the teacher reviewed: approved (usable in tests) or rejected (hidden, never deleted). */
export async function reviewNafsDraft(repo: Repo, actor: Actor, questionId: string, approve: boolean, now = new Date()): Promise<void> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  const e = (await nafsIndex(repo, schoolId)).find((x) => x.id === questionId);
  if (!e || !e.own || !e.draft) throw new ValidationError("This is not a draft waiting for review.");
  if (approve) {
    await repo.updateMany("Question", { id: questionId }, { status: "PUBLISHED", aiStatus: "APPROVED", reviewedById: actor.userId, publishedAt: now, updatedAt: now });
    await repo.updateMany("NafsBankItem", { schoolId, questionId }, { draft: false, updatedAt: now });
  } else {
    await repo.updateMany("Question", { id: questionId }, { aiStatus: "REJECTED", reviewedById: actor.userId, updatedAt: now });
    await repo.updateMany("NafsBankItem", { schoolId, questionId }, { hidden: true, updatedAt: now });
  }
  nafsBankChanged(repo, schoolId);
  await audit(repo, { actorId: actor.userId, action: approve ? "nafs.draft.approve" : "nafs.draft.reject", entityType: "Question", entityId: questionId, at: now });
}

/** Saves AI questions as drafts (own, draft) — used by ai.ts. */
export async function saveNafsDrafts(repo: Repo, actor: Actor, list: (Omit<NafsQuestionInput, "id">)[], now = new Date()): Promise<string[]> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  const ids: string[] = [];
  for (const one of list) {
    const c = cleanInput(one);
    const id = await writeQuestion(repo, actor, schoolId, c, { status: "DRAFT", origin: "AI_GENERATED" }, now);
    await repo.create("NafsBankItem", { schoolId, questionId: id, nafsCode: c.code, process: c.process, standard: c.standard, difficulty: c.difficulty, own: true, hidden: false, draft: true, createdById: actor.userId, createdAt: now, updatedAt: now });
    ids.push(id);
  }
  nafsBankChanged(repo, schoolId);
  return ids;
}

export { CONTENT_SKILLS };
