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
import { readXlsx } from "../../imports/xlsx";
import { shortStandard, TEMPLATE_HEADERS } from "../../imports/questions/template";
import { accessibleClasses } from "../teacher/assign";

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
}
export interface GrammarWorkbook { lessons: Map<number, GrammarLesson[]>; skills: Map<number, GrammarSkillInfo[]>; questions: GrammarQuestionRow[] }

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

/** Reads the Grammar bank workbook (sheets Questions, Skills and Lessons). */
export function readGrammarWorkbook(bytes: Uint8Array): GrammarWorkbook {
  const buf = Buffer.from(bytes);
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new ValidationError("The Grammar bank must be the Excel (.xlsx) file with the sheets Questions, Skills and Lessons.");
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
  }));
  return { lessons, skills, questions };
}

async function gradeCurriculum(repo: Repo, schoolId: string, grade: number): Promise<Row> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) throw new ValidationError(`Grade ${grade} is not set up for this school.`);
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id, isActive: true }))[0];
  if (!cur) throw new ValidationError(`Grade ${grade} has no curriculum yet: load the curriculum first.`);
  return cur;
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
  }
  const catalog = { lessons: wb.lessons.get(grade) ?? [], skills: list.map(({ id, code, lesson, kind, rule }) => ({ id, code, lesson, kind, rule })) };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: settingKey(grade) }, { value: catalog, updatedBy: actor.userId, updatedAt: now }, { value: catalog, updatedBy: actor.userId, updatedAt: now });
  return { created, updated, skills: list.length };
}

const COGNITIVE: Record<string, string> = { Below: "Understand", On: "Apply", Above: "Analyze" };
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
  const rows: string[][] = [[...TEMPLATE_HEADERS]];
  const col = (h: string) => TEMPLATE_HEADERS.indexOf(h as (typeof TEMPLATE_HEADERS)[number]);
  for (const q of wb.questions) {
    if (q.grade !== grade || !q.stem) continue;
    const r = TEMPLATE_HEADERS.map(() => "");
    let opts = q.options.filter(Boolean);
    let type: string, answer: string;
    if (q.type === "true_false") { type = "True/False"; answer = /^t/i.test(q.answer) ? "True" : "False"; opts = []; }
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
    rows.push(r);
  }
  return rows;
}

// ------------------------------------------------------------------ the 🔤 Grammar page

export interface GrammarSkillRow { id: string; name: string; kind: string; icon: string; standards: string[]; rule: string; counts: { below: number; on: number; above: number; total: number }; openAssignments: number }
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
export async function grammarView(repo: Repo, actor: Actor, opts: { grade?: number; classId?: string } = {}): Promise<GrammarView> {
  assertCan(actor, "questions:read");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const isTeacher = actor.role === "TEACHER";
  const allGrades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => g.isActive !== false);
  const levelOf = new Map(allGrades.map((g) => [s(g.id), Number(g.level)]));
  let classes: { id: string; name: string; grade: number }[] = [];
  let klass: { id: string; name: string; grade: number } | undefined;
  if (isTeacher) {
    classes = (await accessibleClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
    klass = opts.classId ? classes.find((c) => c.id === opts.classId) : classes.find((c) => !opts.grade || c.grade === opts.grade) ?? classes[0];
    if (opts.classId && !klass) throw new ForbiddenError("You do not teach this class.");
  }
  const grades = [...new Set((isTeacher ? classes.map((c) => c.grade) : allGrades.map((g) => Number(g.level))))].filter((g) => g >= 4 && g <= 6).sort();
  const grade = klass?.grade ?? (opts.grade && grades.includes(opts.grade) ? opts.grade : grades[0] ?? 4);
  const empty: GrammarView = { grade, grades, classes, classId: klass?.id ?? null, students: [], units: [], totals: { skills: 0, questions: 0, below: 0, on: 0, above: 0 }, loaded: false };
  const g = allGrades.find((x) => Number(x.level) === grade);
  if (!g) return empty;
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id, isActive: true }))[0];
  if (!cur) return empty;
  const skills = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "code", "name", "description", "sequence", "isActive"] })).filter((k) => isGrammarCode(k.code) && k.isActive !== false);
  const setting = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: settingKey(grade) }))[0];
  const catalog = (setting?.value ?? {}) as { lessons?: GrammarLesson[]; skills?: { code: string; lesson: string; kind: string; rule: string }[] };
  const ids = skills.map((k) => s(k.id));
  const [qs, links, assignments, members] = await Promise.all([
    ids.length ? repo.findMany("Question", { skillId: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "difficultyLevel"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("SkillStandard", { skillId: { in: ids } }) : Promise.resolve([] as Row[]),
    klass ? repo.findMany("Assignment", { classId: klass.id, deletedAt: null }, { select: ["id", "skillId"] }) : Promise.resolve([] as Row[]),
    klass ? repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }) : Promise.resolve([] as Row[]),
  ]);
  const [stds, open, studs] = await Promise.all([
    links.length ? repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : Promise.resolve([] as Row[]),
    assignments.length ? repo.findMany("AssignmentStudent", { assignmentId: { in: assignments.map((a) => a.id) }, status: { in: ["NOT_STARTED", "IN_PROGRESS", "OVERDUE"] } }, { select: ["assignmentId"] }) : Promise.resolve([] as Row[]),
    members.length ? repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
  ]);
  const users = studs.length ? await repo.findMany("User", { id: { in: studs.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const stdCode = new Map(stds.map((x) => [s(x.id), shortStandard(s(x.code))]));
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
      rule: c?.rule || s(k.description), counts: counts.get(s(k.id)) ?? { below: 0, on: 0, above: 0, total: 0 }, openAssignments: openBySkill.get(s(k.id)) ?? 0,
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
