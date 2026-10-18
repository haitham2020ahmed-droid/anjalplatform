/**
 * 🔤 Grammar: the school's grammar bank, organized Grade → Unit → Week (lesson) → Skill → Below / On / Above.
 *
 *   readGrammarWorkbook   → reads the Grammar bank Excel file (sheets Questions, Skills, Lessons)
 *   ensureGrammarSkills   → one platform Skill per grammar skill (code G4.grammar.g4-u1w1-s1), linked to its
 *                           Common Core standards and to a MAP Language goal area, plus the lesson catalog
 *   grammarTable          → the questions of one grade in the Question Bank template's columns, so the normal
 *                           import (preview, duplicates, progress) adds them to the bank
 *   grammarView           → what the 🔤 Grammar page shows (question counts per level, open assignments)
 *
 * Every grammar skill is a normal Skill: ⭐ Assign, the student's assigned work, adaptive practice, mastery,
 * MAP goal areas and the analytics all work on it exactly as on the other skills.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { listXlsxSheets, readXlsx } from "../../imports/xlsx";
import { normHeader, shortStandard, TEMPLATE_COLUMNS, TEMPLATE_HEADERS, type ColumnKey } from "../../imports/questions/template";
import { accessibleClasses } from "../teacher/assign";
import { cancelIndex, liveAssignmentWhere } from "../student/cancelled-work";

const s = (v: unknown) => String(v ?? "").trim();
export const GRAMMAR_PREFIX = ".grammar.";
export const isGrammarCode = (code: unknown) => s(code).toLowerCase().includes(GRAMMAR_PREFIX);
export const grammarCode = (grade: number, skillId: string) => `G${grade}${GRAMMAR_PREFIX}${s(skillId).toLowerCase()}`;
const settingKey = (grade: number) => `grammar.catalog.${grade}`;

export type GrammarKind = "Grammar & Usage" | "Mechanics" | "Writing / Revision";
/** Each kind of grammar skill: its family (and so its MAP Language goal area). */
const KINDS: Record<string, { family: string; name: string; domain: string; category: string; goal: string; icon: string }> = {
  "grammar & usage": { family: "gr.grammar-usage", name: "Grammar & Usage", domain: "GRAMMAR", category: "GRAMMAR", goal: "LANG_GRAMMAR", icon: "🧩" },
  mechanics: { family: "gr.mechanics", name: "Mechanics", domain: "GRAMMAR", category: "MECHANICS", goal: "LANG_MECHANICS", icon: "✏️" },
  "writing / revision": { family: "gr.writing-revision", name: "Writing / Revision", domain: "WRITING", category: "WRITING", goal: "WRITING_STYLE", icon: "📝" },
};
const kindOf = (k: string) => KINDS[s(k).toLowerCase()] ?? KINDS["grammar & usage"];
export const kindIcon = (k: string) => kindOf(k).icon;

export interface GrammarLesson { id: string; unit: number; week: number; /** StudySync (Grade 6): lessons are numbered, with no unit or week */ number: number; title: string; rule: string }
export interface GrammarSkillInfo { id: string; code: string; lesson: string; name: string; kind: string; ccss: string[]; rule: string }
export interface GrammarQuestionRow {
  grade: number; skillId: string; questionId: string; level: "Below" | "On" | "Above"; type: string; ccss: string; passage: string;
  stem: string; options: string[]; answer: string; letter: string; accepted: string; explanation: string;
  /** error_correction: the sentence parts (| separated), the part number(s) with the mistake (1-based, or “No error”), the fix(es) */
  segments: string; errorIndex: string; correction: string;
  /** sentence_order: the items in the correct order (| separated) */
  items: string;
  /** sentence_combine: the short sentences (| separated) and the joining word; the accepted answers are accepted_answers (or answer) */
  sentences: string; connector: string;
}
export interface GrammarWorkbook {
  lessons: Map<number, GrammarLesson[]>; skills: Map<number, GrammarSkillInfo[]>; questions: GrammarQuestionRow[];
  /**
   * "strict": the original 3-sheet file (Lessons, Skills, Questions) — new Skill/LessonSkill/UnitSkill rows are
   * created from it (ensureGrammarSkills), placed on the Curriculum Map by grammarMapPlacement.
   * "simple": the school's real file — just a Questions sheet (Question Bank template columns, "Skill" holding
   * a coarse name such as "Grade 4 Action Verbs") and, usually, an informational Curriculum sheet. NO new skill
   * or map placement is ever created for this format: every row's Skill is matched to an EXISTING, already
   * placed grammar skill of that grade by the normal importer (see grammarSimpleTable), or left for its safe
   * Unclassified-style fallback — never guessed onto a new unit/week.
   */
  format: "strict" | "simple";
  /** "simple" format only: the Questions sheet, header row first, with "Grade N " stripped off every Skill cell. */
  simpleRows?: string[][];
  /** "simple" format only: the column index of Grade in simpleRows (-1 if the sheet has none). */
  simpleGradeCol?: number;
}

/** "Grade 4 Action Verbs" → "Action Verbs" (the real file's Skill column prefixes every name with its own grade). */
const GRADE_PREFIX = /^grade\s*\d+\s*[:-]?\s*/i;
const stripGradePrefix = (v: string) => s(v).replace(GRADE_PREFIX, "").trim();

/** The column of one template field in a raw header row (same aliases as the Question Bank template). */
function templateCol(header: string[], key: ColumnKey): number {
  const spec = TEMPLATE_COLUMNS.find((c) => c.key === key)!;
  return header.findIndex((h) => { const n = normHeader(h); return spec.aliases.includes(n) || normHeader(spec.header) === n; });
}

/**
 * Reads the "simple" format: just a Questions sheet in the Question Bank template's columns (Question Text,
 * Question Type, Option A-D, Correct Answer, Explanation, Grade, Skill, Standard, Difficulty Level, Cognitive
 * Level, Passage/Text, Lexile, MAP Test, MAP Instructional Area, Use…), and usually an informational
 * Curriculum sheet (an export of the school's EXISTING skill catalog — read by nobody: it only helps a human
 * compare; the real source of truth is the live Skill rows the normal importer already matches against).
 */
function readSimpleGrammarWorkbook(buf: Buffer): GrammarWorkbook {
  let rows: string[][];
  try { rows = readXlsx(buf, { sheet: "Questions" }); } catch (e) { throw new ValidationError(`The Grammar file could not be read: ${(e as Error).message}`); }
  if (!rows.length) throw new ValidationError("The Questions sheet of the Grammar file is empty.");
  const header = rows[0].map((h) => s(h));
  if (templateCol(header, "stem") < 0) throw new ValidationError("The Questions sheet of the Grammar file is missing the column: Question Text.");
  const skillCol = templateCol(header, "skill");
  const gradeCol = templateCol(header, "grade");
  const body = rows.slice(1).map((r) => { const row = [...r]; if (skillCol >= 0) row[skillCol] = stripGradePrefix(row[skillCol] ?? ""); return row; });
  return { lessons: new Map(), skills: new Map(), questions: [], format: "simple", simpleRows: [header, ...body], simpleGradeCol: gradeCol };
}

/** "simple" format only: the grade's rows (Questions sheet columns), ready for the normal Question Bank import. */
export function grammarSimpleTable(wb: GrammarWorkbook, grade: number): string[][] {
  if (wb.format !== "simple" || !wb.simpleRows?.length) return [];
  const [header, ...rows] = wb.simpleRows;
  const gradeCol = wb.simpleGradeCol ?? -1;
  const filtered = gradeCol >= 0 ? rows.filter((r) => Number(s(r[gradeCol]).match(/\d+/)?.[0]) === grade) : rows;
  return [header, ...filtered];
}

/** Splits "L.4.1f, W.4.5" into platform codes ("L.4.1.F", "W.4.5"). */
const ccssList = (v: string) => s(v).split(/[,;]+/).map((x) => shortStandard(x)).filter(Boolean);

function sheet(buf: Buffer, name: string, needed: string[]): { rows: string[][]; col: (h: string) => number } {
  let rows: string[][];
  try { rows = readXlsx(buf, { sheet: name }); } catch (e) { throw new ValidationError(`The Grammar file could not be read: ${(e as Error).message}`); }
  const head = (rows[0] ?? []).map((h) => s(h).toLowerCase());
  const missing = needed.filter((h) => !head.includes(h));
  if (missing.length) throw new ValidationError(`The ${name} sheet of the Grammar file is missing the column(s): ${missing.join(", ")}.`);
  return { rows: rows.slice(1).filter((r) => r.some((c) => s(c))), col: (h) => head.indexOf(h) };
}

/**
 * Reads the Grammar bank workbook, in either of two accepted formats (detected from its sheet names,
 * never a mode the admin has to pick):
 *   strict  → sheets Questions, Skills and Lessons (the original format: new skills, placed on the map)
 *   simple  → just a Questions sheet (the school's real files: existing skills only, see readSimpleGrammarWorkbook)
 */
export function readGrammarWorkbook(bytes: Uint8Array): GrammarWorkbook {
  const buf = Buffer.from(bytes);
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new ValidationError("The Grammar bank must be the Excel (.xlsx) file with the sheets Questions, Skills and Lessons (or just a Questions sheet).");
  const sheetNames = new Set(listXlsxSheets(buf).map((n) => n.trim().toLowerCase()));
  if (!(sheetNames.has("lessons") && sheetNames.has("skills"))) {
    if (!sheetNames.has("questions")) throw new ValidationError("The Grammar file has no Questions sheet.");
    return readSimpleGrammarWorkbook(buf);
  }
  const L = sheet(buf, "Lessons", ["grade", "lesson_id", "unit", "week", "title"]);
  const K = sheet(buf, "Skills", ["grade", "lesson_id", "skill_id", "skill", "skill_kind", "ccss"]);
  const Q = sheet(buf, "Questions", ["grade", "skill_id", "question_id", "level", "type", "ccss", "question", "option_a", "option_b", "answer", "explanation"]);
  const lessons = new Map<number, GrammarLesson[]>(), skills = new Map<number, GrammarSkillInfo[]>();
  for (const r of L.rows) {
    const g = Number(r[L.col("grade")]);
    if (!lessons.has(g)) lessons.set(g, []);
    lessons.get(g)!.push({ id: s(r[L.col("lesson_id")]), unit: Number(r[L.col("unit")]) || 0, week: Number(r[L.col("week")]) || 0, number: L.col("lesson_number") >= 0 ? Number(r[L.col("lesson_number")]) || 0 : 0, title: s(r[L.col("title")]), rule: L.col("rule_summary") >= 0 ? s(r[L.col("rule_summary")]) : "" });
  }
  for (const r of K.rows) {
    const g = Number(r[K.col("grade")]);
    if (!skills.has(g)) skills.set(g, []);
    const id = s(r[K.col("skill_id")]);
    skills.get(g)!.push({ id, code: grammarCode(g, id), lesson: s(r[K.col("lesson_id")]), name: s(r[K.col("skill")]), kind: kindOf(s(r[K.col("skill_kind")])).name, ccss: ccssList(r[K.col("ccss")]), rule: K.col("rule_summary") >= 0 ? s(r[K.col("rule_summary")]) : "" });
  }
  const at = (r: string[], h: string) => (Q.col(h) >= 0 ? s(r[Q.col(h)]) : "");
  const LV: Record<string, GrammarQuestionRow["level"]> = { below: "Below", on: "On", above: "Above" };
  const questions = Q.rows.map((r) => ({
    grade: Number(at(r, "grade")), skillId: at(r, "skill_id"), questionId: at(r, "question_id"), level: LV[at(r, "level").toLowerCase()] ?? "On",
    type: at(r, "type").toLowerCase(), ccss: at(r, "ccss"), passage: at(r, "passage"), stem: at(r, "question"),
    options: ["option_a", "option_b", "option_c", "option_d"].map((h) => at(r, h)), answer: at(r, "answer"), letter: at(r, "answer_letter").toUpperCase(),
    accepted: at(r, "accepted_answers"), explanation: at(r, "explanation"),
    segments: at(r, "segments") || at(r, "sentence_parts"), errorIndex: at(r, "error_index") || at(r, "error_indexes"), correction: at(r, "correction") || at(r, "corrections"),
    items: at(r, "items") || at(r, "order_items"), sentences: at(r, "sentences") || at(r, "sentences_to_combine"), connector: at(r, "connector") || at(r, "joining_word"),
  }));
  return { lessons, skills, questions, format: "strict" };
}

async function gradeCurriculum(repo: Repo, schoolId: string, grade: number): Promise<Row> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) throw new ValidationError(`Grade ${grade} is not set up for this school.`);
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id, isActive: true }))[0];
  if (!cur) throw new ValidationError(`Grade ${grade} has no curriculum yet: load the curriculum first.`);
  return cur;
}

const json = <T,>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

interface GrammarPlacement { lessonId: string; unitId: string; order: number }

/**
 * Where each grammar lesson's skills land on the Curriculum Map, in the book's own unit order (owner request:
 * "link the Grammar bank into the Curriculum Map itself, per grade, matching unit order"):
 *   unit + week known (Wonders, Grades 4–5)  → the Text Set of that unit whose weeks include that week
 *                                               (falls back to spreading evenly over the unit's Text Sets
 *                                               when no week is given or none matches)
 *   no unit/week (StudySync, Grade 6: lessons are only numbered in sequence) → the same relative position
 *     among the grade's selections, in unit order (lesson 1 of N → selection 1 of M, lesson N → selection M)
 * A grammar lesson with no curriculum Unit/Lesson to land on (an empty grade) is simply left off the map;
 * the skill itself, its standards and its questions are unaffected either way.
 */
async function grammarMapPlacement(repo: Repo, curriculumId: string, wb: GrammarWorkbook, grade: number): Promise<Map<string, GrammarPlacement>> {
  const out = new Map<string, GrammarPlacement>();
  const gLessons = wb.lessons.get(grade) ?? [];
  if (!gLessons.length) return out;
  const units = (await repo.findMany("Unit", { curriculumId }, { select: ["id", "number", "isActive", "deletedAt"] }))
    .filter((u) => u.isActive !== false && !u.deletedAt).sort((a, b) => Number(a.number) - Number(b.number));
  if (!units.length) return out;
  const lessons = (await repo.findMany("Lesson", { unitId: { in: units.map((u) => s(u.id)) } }, { select: ["id", "unitId", "number", "weeks", "deletedAt"] })).filter((l) => !l.deletedAt);
  const byUnit = new Map<string, Row[]>();
  for (const u of units) byUnit.set(s(u.id), lessons.filter((l) => s(l.unitId) === s(u.id)).sort((a, b) => Number(a.number) - Number(b.number)));
  const flat = units.flatMap((u) => byUnit.get(s(u.id)) ?? []); // every Text Set / selection, in unit order
  if (!flat.length) return out;
  const unitIdByNumber = new Map(units.map((u) => [Number(u.number), s(u.id)]));
  const place = (row: Row, order: number): GrammarPlacement => ({ lessonId: s(row.id), unitId: s(row.unitId), order });

  // Grades with a known unit + week (Wonders): the Text Set of that unit covering that week.
  const withUnit = gLessons.filter((l) => l.unit > 0).sort((a, b) => a.unit - b.unit || a.week - b.week || a.number - b.number);
  for (const [i, l] of withUnit.entries()) {
    const unitLessons = byUnit.get(unitIdByNumber.get(l.unit) ?? "") ?? [];
    if (!unitLessons.length) continue;
    const byWeek = l.week > 0 ? unitLessons.find((x) => json<number[]>(x.weeks, []).includes(l.week)) : undefined;
    out.set(l.id, place(byWeek ?? unitLessons[i % unitLessons.length], i));
  }

  // No unit/week at all (StudySync): the same position among the grade's selections, in unit order.
  const noUnit = gLessons.filter((l) => !l.unit).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  for (const [i, l] of noUnit.entries()) out.set(l.id, place(flat[Math.min(flat.length - 1, Math.floor((i * flat.length) / noUnit.length))], i));
  return out;
}

/**
 * One Skill per grammar skill of the grade (created or updated, never deleted), each linked to its Common
 * Core standards (the skill's and its questions') and to a MAP Language goal area; the lesson catalog is saved.
 */
export async function ensureGrammarSkills(repo: Repo, actor: Actor, wb: GrammarWorkbook, grade: number, now = new Date()): Promise<{ created: number; updated: number; skills: number }> {
  assertCan(actor, "questions:publish");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const list = wb.skills.get(grade) ?? [];
  if (!list.length) throw new ValidationError(`The Grammar file has no Grade ${grade} skills.`);
  const cur = await gradeCurriculum(repo, actor.schoolId, grade);
  const placeOnMap = await grammarMapPlacement(repo, s(cur.id), wb, grade);
  // families → MAP goal areas
  const goals = new Map((await repo.findMany("MapGoalArea", {})).map((a) => [s(a.code), s(a.id)]));
  const familyId = new Map<string, string>();
  for (const k of Object.values(KINDS)) {
    const data = { name: k.name, domain: k.domain, category: k.category, mapGoalAreaId: goals.get(k.goal) ?? null };
    familyId.set(k.name, s((await repo.upsert("SkillFamily", { code: k.family }, data, data)).id));
  }
  // standards of the grade (and any grade the file cites), by their short code
  const stdId = new Map((await repo.findMany("Standard", {}, { select: ["id", "code"] })).map((x) => [shortStandard(s(x.code)), s(x.id)]));
  const qStd = new Map<string, string[]>();
  for (const q of wb.questions) if (q.grade === grade) { const l = qStd.get(q.skillId) ?? []; for (const c of ccssList(q.ccss)) if (!l.includes(c)) l.push(c); qStd.set(q.skillId, l); }
  const existing = new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).toLowerCase(), k]));
  const order = new Map((wb.lessons.get(grade) ?? []).map((l, i) => [l.id, i]));
  let created = 0, updated = 0;
  for (const [i, k] of list.entries()) {
    const fam = kindOf(k.kind);
    const sequence = 5000 + (order.get(k.lesson) ?? 0) * 10 + i % 10;
    const data = { familyId: familyId.get(fam.name)!, name: k.name.slice(0, 191), description: k.rule || null, domain: fam.domain, category: fam.category, sequence, isActive: true, deletedAt: null };
    const before = existing.get(k.code.toLowerCase());
    const row = await repo.upsert("Skill", { curriculumId: cur.id, code: k.code }, data, data);
    if (before) updated++; else created++;
    const codes = [...k.ccss, ...(qStd.get(k.id) ?? []).filter((c) => !k.ccss.includes(c))];
    for (const [j, c] of codes.entries()) {
      const sid = stdId.get(c);
      if (sid) await repo.upsert("SkillStandard", { skillId: row.id, standardId: sid }, { isPrimary: j === 0 }, { isPrimary: j === 0 });
    }
    const place = placeOnMap.get(k.lesson);
    if (place) {
      await repo.upsert("LessonSkill", { lessonId: place.lessonId, skillId: row.id, label: k.name.slice(0, 191) }, { role: "GRAMMAR" }, { role: "GRAMMAR" });
      await repo.upsert("UnitSkill", { unitId: place.unitId, skillId: row.id }, { order: place.order }, { order: place.order });
    }
  }
  const catalog = { lessons: wb.lessons.get(grade) ?? [], skills: list.map(({ id, code, lesson, kind, rule }) => ({ id, code, lesson, kind, rule })) };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: settingKey(grade) }, { value: catalog, updatedBy: actor.userId, updatedAt: now }, { value: catalog, updatedBy: actor.userId, updatedAt: now });
  return { created, updated, skills: list.length };
}

const COGNITIVE: Record<string, string> = { Below: "Understand", On: "Apply", Above: "Analyze" };
/** Columns added to the template's for the grammar types read from their own columns (see template.ts). */
export const GRAMMAR_EXTRA_HEADERS = ["Sentence Parts", "Correction", "Order Items", "Sentences to Combine", "Joining Word"] as const;
const DIFFICULTY: Record<string, number> = { Below: 3, On: 4, Above: 5 };
const LETTERS = ["A", "B", "C", "D"];

/**
 * The grade's questions in the Question Bank template's columns. Multiple-choice answers are moved so the
 * correct letter is spread evenly over A–D in each skill, in a shuffled order (never a fixed A-B-C-D pattern).
 */
/** A small seeded random generator (the same file always gives the same order). */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6d2b79f5) | 0; let x = Math.imul(h ^ (h >>> 15), 1 | h); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

export function grammarTable(wb: GrammarWorkbook, grade: number): string[][] {
  const codeOf = new Map((wb.skills.get(grade) ?? []).map((k) => [k.id, k.code]));
  // per skill and number of choices: a shuffled bag of positions (each letter once per bag, random order)
  const bags = new Map<string, { rnd: () => number; bag: number[]; last: number[] }>();
  const nextPosition = (key: string, n: number) => {
    const b = bags.get(key) ?? { rnd: seeded(key), bag: [], last: [] };
    bags.set(key, b);
    if (!b.bag.length) {
      b.bag = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(b.rnd() * (i + 1)); [b.bag[i], b.bag[j]] = [b.bag[j], b.bag[i]]; }
      // no three in a row across two bags
      if (b.last.length === 2 && b.last[0] === b.last[1] && b.bag[0] === b.last[1] && n > 1) b.bag.push(b.bag.shift()!);
    }
    const p = b.bag.shift()!;
    b.last = [...b.last, p].slice(-2);
    return p;
  };
  // the template's columns, plus the own columns of error correction, sentence order and sentence combining
  const HEAD = [...TEMPLATE_HEADERS, ...GRAMMAR_EXTRA_HEADERS];
  const rows: string[][] = [HEAD];
  const col = (h: string) => HEAD.indexOf(h);
  for (const q of wb.questions) {
    if (q.grade !== grade || !q.stem) continue;
    const r = HEAD.map(() => "");
    let opts = q.options.filter(Boolean);
    let type: string, answer: string;
    const extra: Record<string, string> = {};
    if (q.type === "true_false") { type = "True/False"; answer = /^t/i.test(q.answer) ? "True" : "False"; opts = []; }
    else if (/^error[_ ]?correction/.test(q.type)) {
      type = /type/.test(q.type) ? "Error Correction (type the fix)" : "Error Correction";
      answer = /^no\s*error$/i.test(q.errorIndex || q.answer) ? "No error" : q.errorIndex || q.answer;
      extra["Sentence Parts"] = q.segments; extra["Correction"] = q.correction; opts = [];
    } else if (/^sentence[_ ]?order/.test(q.type)) {
      type = "Sentence Order"; answer = "";
      // the items in order: their own column, else the option columns in order
      extra["Order Items"] = q.items || opts.join(" | "); opts = [];
    } else if (/^sentence[_ ]?combin/.test(q.type)) {
      type = "Sentence Combining"; answer = q.accepted || q.answer;
      extra["Sentences to Combine"] = q.sentences; extra["Joining Word"] = q.connector; opts = [];
    }
    else if (/^(multi[-_ ]?select|multiple[-_ ]?answer|select[-_ ]?all)/.test(q.type)) {
      type = "Multi Select";
      // the correct letters: answer_letter (several letters), else matched by text against the options
      let letters = (q.letter.match(/[A-D]/g) ?? []) as string[];
      if (!letters.length && q.answer) {
        letters = q.answer.split(/[|,]/).map((p) => p.trim()).filter(Boolean)
          .map((p) => { const i = opts.findIndex((o) => o.toLowerCase() === p.toLowerCase()); return i >= 0 ? LETTERS[i] : ""; }).filter(Boolean);
      }
      answer = [...new Set(letters)].join(", ");
    }
    else if (opts.length >= 2) {
      type = "Multiple Choice";
      let at = LETTERS.indexOf(q.letter);
      if (at < 0 || at >= opts.length) at = opts.findIndex((o) => o === q.answer);
      if (at < 0) at = 0;
      // spread the correct letter evenly, in a random order (no A-B-C-D pattern)
      const want = nextPosition(`${grade}|${q.skillId}|${opts.length}`, opts.length);
      if (want !== at) { const t = opts[want]; opts[want] = opts[at]; opts[at] = t; at = want; }
      answer = LETTERS[at];
    } else { type = "Fill in the Blank"; answer = q.accepted || q.answer; opts = []; }
    const put = (h: string, v: string) => { const i = col(h); if (i >= 0) r[i] = v; };
    put("Question Text", q.stem); put("Question Type", type);
    LETTERS.forEach((l, i) => put(`Option ${l}`, opts[i] ?? ""));
    put("Correct Answer", answer); put("Explanation", q.explanation || "Check the grammar rule of this skill.");
    put("Grade", String(grade)); put("Skill", codeOf.get(q.skillId) ?? grammarCode(grade, q.skillId));
    put("Standard", ccssList(q.ccss)[0] ?? ""); put("Difficulty Level", String(DIFFICULTY[q.level])); put("Cognitive Level", COGNITIVE[q.level]);
    put("Passage/Text", q.passage);
    for (const [h, v] of Object.entries(extra)) put(h, v);
    rows.push(r);
  }
  return rows;
}

// ------------------------------------------------------------------ the 🔤 Grammar page

export interface GrammarSkillRow { id: string; name: string; kind: string; icon: string; standards: string[]; rule: string; counts: { below: number; on: number; above: number; total: number }; openAssignments: number; /** published questions per item type (code → number) */ types: Record<string, number> }
export interface GrammarView {
  grade: number; grades: number[];
  classes: { id: string; name: string; grade: number }[]; classId: string | null;
  students: { id: string; name: string }[];
  /** unit 0 = lessons without a unit (Grade 6 StudySync lessons, or skills outside the catalog) */
  units: { unit: number; weeks: { lesson: string; week: number; number: number; title: string; skills: GrammarSkillRow[] }[] }[];
  totals: { skills: number; questions: number; below: number; on: number; above: number };
  loaded: boolean;
}

/** Grade → Unit → Week → Skill, with the questions of each level and (for a teacher) the class to assign to. */
export async function grammarView(repo: Repo, actor: Actor, opts: { grade?: number; classId?: string; browse?: boolean } = {}): Promise<GrammarView> {
  assertCan(actor, "questions:read");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const isTeacher = actor.role === "TEACHER" && !opts.browse;
  const allGrades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => g.isActive !== false);
  const levelOf = new Map(allGrades.map((g) => [s(g.id), Number(g.level)]));
  let classes: { id: string; name: string; grade: number }[] = [];
  let klass: { id: string; name: string; grade: number } | undefined;
  if (isTeacher) {
    classes = (await accessibleClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
    // a chosen grade shows its class (if the teacher has one there); otherwise the chosen / first class.
    // Access rules (UI reorg): any grade's grammar may be assigned to any of the teacher's OWN classes.
    klass = opts.classId ? classes.find((c) => c.id === opts.classId) : (opts.grade ? classes.find((c) => c.grade === opts.grade) : undefined) ?? classes[0];
    if (opts.classId && !klass) throw new ForbiddenError("You do not teach this class.");
  }
  // every teacher can browse the Grammar of every grade that has it (4–6)
  const grades = [...new Set(allGrades.map((g) => Number(g.level)))].filter((g) => g >= 4 && g <= 6).sort();
  const grade = opts.grade && grades.includes(opts.grade) ? opts.grade : klass && grades.includes(klass.grade) ? klass.grade : grades[0] ?? 4;
  const empty: GrammarView = { grade, grades, classes, classId: klass?.id ?? null, students: [], units: [], totals: { skills: 0, questions: 0, below: 0, on: 0, above: 0 }, loaded: false };
  const g = allGrades.find((x) => Number(x.level) === grade);
  if (!g) return empty;
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id, isActive: true }))[0];
  if (!cur) return empty;
  const skills = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "code", "name", "description", "sequence", "isActive"] })).filter((k) => isGrammarCode(k.code) && k.isActive !== false);
  const setting = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: settingKey(grade) }))[0];
  const catalog = (setting?.value ?? {}) as { lessons?: GrammarLesson[]; skills?: { code: string; lesson: string; kind: string; rule: string }[] };
  const ids = skills.map((k) => s(k.id));
  const [qs, links, allAssignments, members, ix] = await Promise.all([
    ids.length ? repo.findMany("Question", { skillId: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "difficultyLevel", "typeId"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("SkillStandard", { skillId: { in: ids } }) : Promise.resolve([] as Row[]),
    klass ? repo.findMany("Assignment", liveAssignmentWhere({ classId: klass.id }), { select: ["id", "skillId", "testId", "curriculumPlanId"] }) : Promise.resolve([] as Row[]),
    klass ? repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }) : Promise.resolve([] as Row[]),
    cancelIndex(repo, actor.schoolId),
  ]);
  // r78: cancelled on Assigned = not "assigned" on the grammar page
  const assignments = allAssignments.filter((a) => ix.live(a));
  const [stds, open, studs] = await Promise.all([
    links.length ? repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : Promise.resolve([] as Row[]),
    assignments.length ? repo.findMany("AssignmentStudent", { assignmentId: { in: assignments.map((a) => a.id) }, status: { in: ["NOT_STARTED", "IN_PROGRESS", "OVERDUE"] } }, { select: ["assignmentId"] }) : Promise.resolve([] as Row[]),
    members.length ? repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
  ]);
  const users = studs.length ? await repo.findMany("User", { id: { in: studs.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const stdCode = new Map(stds.map((x) => [s(x.id), shortStandard(s(x.code))]));
  const typeIds = [...new Set(qs.map((q) => s(q.typeId)).filter(Boolean))];
  const typeCode = new Map((typeIds.length ? await repo.findMany("QuestionType", { id: { in: typeIds } }, { select: ["id", "code"] }) : []).map((t) => [s(t.id), s(t.code)]));
  const typesBySkill = new Map<string, Record<string, number>>();
  for (const q of qs) { const m = typesBySkill.get(s(q.skillId)) ?? {}; const c = typeCode.get(s(q.typeId)) ?? "OTHER"; m[c] = (m[c] ?? 0) + 1; typesBySkill.set(s(q.skillId), m); }
  const counts = new Map<string, GrammarSkillRow["counts"]>();
  for (const q of qs) {
    const c = counts.get(s(q.skillId)) ?? { below: 0, on: 0, above: 0, total: 0 };
    const lv = Number(q.difficultyLevel);
    if (lv <= 3) c.below++; else if (lv >= 5) c.above++; else c.on++;
    c.total++; counts.set(s(q.skillId), c);
  }
  const openBySkill = new Map<string, number>();
  const skillOfAssignment = new Map(assignments.map((a) => [s(a.id), s(a.skillId)]));
  for (const o of open) { const k = skillOfAssignment.get(s(o.assignmentId)); if (k) openBySkill.set(k, (openBySkill.get(k) ?? 0) + 1); }
  const info = new Map((catalog.skills ?? []).map((k) => [s(k.code).toLowerCase(), k]));
  const lessons = new Map((catalog.lessons ?? []).map((l) => [l.id, l]));
  const units = new Map<number, Map<string, { lesson: string; week: number; number: number; title: string; skills: GrammarSkillRow[] }>>();
  const lessonOrder = new Map((catalog.lessons ?? []).map((l, i) => [l.id, i]));
  for (const k of skills.sort((a, b) => Number(a.sequence) - Number(b.sequence) || s(a.code).localeCompare(s(b.code)))) {
    const c = info.get(s(k.code).toLowerCase());
    const l = c ? lessons.get(c.lesson) : undefined;
    const unit = l?.unit ?? 0, lessonId = l?.id ?? "other";
    if (!units.has(unit)) units.set(unit, new Map());
    const u = units.get(unit)!;
    if (!u.has(lessonId)) u.set(lessonId, { lesson: lessonId, week: l?.week ?? 0, number: l?.number ?? 0, title: l?.title ?? "Other grammar skills", skills: [] });
    const kind = c?.kind ?? "Grammar & Usage";
    u.get(lessonId)!.skills.push({
      id: s(k.id), name: s(k.name), kind, icon: kindIcon(kind),
      standards: links.filter((x) => x.skillId === k.id).sort((p, q) => Number(q.isPrimary) - Number(p.isPrimary)).map((x) => stdCode.get(s(x.standardId)) ?? "").filter(Boolean),
      rule: c?.rule || s(k.description), counts: counts.get(s(k.id)) ?? { below: 0, on: 0, above: 0, total: 0 }, openAssignments: openBySkill.get(s(k.id)) ?? 0, types: typesBySkill.get(s(k.id)) ?? {},
    });
  }
  const all = [...counts.values()];
  return {
    ...empty,
    students: studs.map((x) => ({ id: s(x.id), name: s(users.find((u) => u.id === x.userId)?.displayName ?? "Student") })).sort((a, b) => a.name.localeCompare(b.name)),
    units: [...units.entries()].sort((a, b) => (a[0] || 99) - (b[0] || 99)).map(([unit, m]) => ({ unit, weeks: [...m.values()].sort((a, b) => (lessonOrder.get(a.lesson) ?? 999) - (lessonOrder.get(b.lesson) ?? 999)) })),
    totals: { skills: skills.length, questions: all.reduce((n, c) => n + c.total, 0), below: all.reduce((n, c) => n + c.below, 0), on: all.reduce((n, c) => n + c.on, 0), above: all.reduce((n, c) => n + c.above, 0) },
    loaded: skills.length > 0,
  };
}

// ------------------------------------------------------------------ 🔤 one Grammar library for every teacher

export interface GrammarLesson2 { id: string; name: string; kind: string; icon: string; lesson: string; grade: number; standards: string[]; rule: string; counts: GrammarSkillRow["counts"]; types: Record<string, number> }
/**
 * Every grammar lesson of the school in one list (no grades, units or weeks): the same list for every teacher,
 * searched by skill name. Any lesson can be assigned to any class.
 */
export async function grammarLibrary(repo: Repo, actor: Actor): Promise<{ lessons: GrammarLesson2[]; totals: GrammarView["totals"]; grades: number[] }> {
  assertCan(actor, "questions:read");
  const first = await grammarView(repo, actor, { browse: true });
  const lessons: GrammarLesson2[] = [];
  const totals = { skills: 0, questions: 0, below: 0, on: 0, above: 0 };
  for (const g of first.grades) {
    const v = g === first.grade ? first : await grammarView(repo, actor, { grade: g, browse: true });
    for (const u of v.units) for (const w of u.weeks) for (const k of w.skills) lessons.push({ id: k.id, name: k.name, kind: k.kind, icon: k.icon, lesson: w.title, grade: g, standards: k.standards, rule: k.rule, counts: k.counts, types: k.types });
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += v.totals[key];
  }
  return { lessons: lessons.sort((a, b) => a.name.localeCompare(b.name) || a.grade - b.grade), totals, grades: first.grades };
}
