/**
 * 🔁 Review tests (Assessments → New test → type "Review"): one test that mixes SEVERAL selections.
 *
 *   - from the curriculum: any number of units / text sets (weeks) / lessons (sections) of the Curriculum Map, skills
 *     and standards — each selection has its own number of questions;
 *   - from the question bank: search and filter (skill, type, level, passage / no passage, words) and add questions
 *     one by one (bankSearch).
 *
 * "Suggest for me" (suggestReview) fills every selection with its number of questions: new to the class first, never
 * the same content twice (also across selections and with what is already in the test), passage questions kept
 * together, easy → hard — the same planner as "Make the test for me" (generate.ts / planTest), one selection at a time.
 *
 * Full access afterwards: the builder's selected list views, replaces (same skill and level: generate.ts
 * replaceQuestion), removes, reorders and gives points; ✏️ Edit makes a TEACHER COPY (editQuestionCopy): the shared
 * original is never changed or deleted, the copy (a new published question on the same skill, tags.teacherCopyOf)
 * takes its place in the test. The copy is PRIVATE to its teacher (Question.privateToId — src/server/questions/
 * private-copies.ts): never in the shared bank, other teachers' builders or pools, or bank totals; its teacher finds it
 * again in the bank search under "My edited copies" (bankSearch `mine`).
 *
 * Bounded reads: at most MAX_SELECTIONS selections, CANDIDATES per selection, one page (BANK_PAGE) of bank results,
 * chunked `in` queries.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { loadQuestionItems } from "../practice/items";
import { contentKeysForIds } from "../questions/fresh";
import { schoolSkillIndex } from "../questions/skill-questions";
import { questionsOfSkill, type QLevel } from "./question-source";
import { allowedNodes, describePicks, usableLinks, type MapSourceQuestion } from "./map-source";
import { classHistory, levelTargets, planTest, type GenCandidate, type LevelChoice } from "./generate";
import { MAX_TEST_QUESTIONS } from "./assessments";

const s = (v: unknown) => String(v ?? "");
export const MAX_SELECTIONS = 30;
export const MAX_PER_SELECTION = 20;
export const BANK_PAGE = 20;
const CANDIDATES = 150;
const LEVEL_RANGE: Record<QLevel, number[]> = { BELOW: [1, 2, 3], ON: [4], ABOVE: [5, 6, 7] };

export type SelectionKind = "LESSON" | "SKILL" | "STANDARD";
export interface ReviewSelection { kind: SelectionKind; ref: string; label: string; count: number }
export interface ReviewGroup { key: string; label: string; kind: SelectionKind; asked: number; questions: MapSourceQuestion[] }
export interface ReviewSuggestion { groups: ReviewGroup[]; notes: string[] }

function staff(actor: Actor): void {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can build tests.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  assertCan(actor, "questions:read");
}
async function inChunks(ids: string[], size: number, fn: (c: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

/** The selections, cleaned: known kinds, a reference, 1–20 questions each, no selection twice, at most 30. */
export function cleanSelections(list: unknown): ReviewSelection[] {
  const out: ReviewSelection[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(list) ? list : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    const kind = (["LESSON", "SKILL", "STANDARD"].includes(s(r.kind)) ? s(r.kind) : "") as SelectionKind | "";
    const ref = s(r.ref).trim().slice(0, 191);
    if (!kind || !ref || seen.has(`${kind}:${ref.toUpperCase()}`)) continue;
    seen.add(`${kind}:${ref.toUpperCase()}`);
    out.push({ kind, ref, label: s(r.label).trim().slice(0, 200) || ref, count: Math.max(1, Math.min(MAX_PER_SELECTION, Math.round(Number(r.count) || 5))) });
  }
  if (!out.length) throw new ValidationError("Add at least one selection: a unit, week, lesson, skill or standard.");
  if (out.length > MAX_SELECTIONS) throw new ValidationError(`Choose at most ${MAX_SELECTIONS} selections.`);
  return out;
}

/** Question ids (with level) of one selection (bounded). */
async function selectionPool(repo: Repo, actor: Actor, sel: ReviewSelection, nodes: Awaited<ReturnType<typeof allowedNodes>> | null): Promise<{ id: string; level: QLevel }[]> {
  if (sel.kind === "LESSON") {
    const c = sel.ref.toUpperCase();
    const mine = (nodes ?? []).filter((n) => n.code.toUpperCase() === c || n.code.toUpperCase().startsWith(`${c}.`));
    if (!mine.length) throw new ForbiddenError("A chosen lesson is not on the Curriculum Map of your classes' grades.");
    const levelOf = new Map(mine.map((n) => [n.id, n.level]));
    return (await usableLinks(repo, mine.map((n) => n.id))).map((l) => ({ id: s(l.q.id), level: (levelOf.get(l.nodeId) ?? fromDifficulty(Number(l.q.difficultyLevel ?? 4))) as QLevel }));
  }
  if (sel.kind === "SKILL") return (await questionsOfSkill(repo, actor.schoolId!, sel.ref)).map((q) => ({ id: q.id, level: q.level }));
  // a standard: questions tagged with it, and the questions of the skills linked to it (this school only)
  const std = (await repo.findMany("Standard", { code: sel.ref }, { select: ["id"], take: 5 })).map((x) => s(x.id));
  if (!std.length) throw new ValidationError(`The standard ${sel.ref} was not found.`);
  const idx = await schoolSkillIndex(repo, actor.schoolId!);
  const direct = (await repo.findMany("Question", { standardId: { in: std }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "difficultyLevel"], take: 400 }))
    .filter((q) => idx.ids.has(s(q.skillId))).map((q) => ({ id: s(q.id), level: fromDifficulty(Number(q.difficultyLevel ?? 4)) as QLevel }));
  const linked = (await repo.findMany("SkillStandard", { standardId: { in: std } }, { select: ["skillId"], take: 400 })).map((x) => s(x.skillId)).filter((id) => idx.ids.has(id)).slice(0, 8);
  const viaSkills: { id: string; level: QLevel }[] = [];
  for (const k of linked) viaSkills.push(...(await questionsOfSkill(repo, actor.schoolId!, k, { take: 200 })));
  return [...direct, ...viaSkills];
}

/** Candidate rows for the planner (type, passage, difficulty, copy keys), published and auto-marked only. */
async function toCandidates(repo: Repo, raw: { id: string; level: QLevel }[], bucket: string, seen: Set<string>): Promise<GenCandidate[]> {
  const first = new Map<string, QLevel>();
  for (const r of raw) if (!first.has(r.id)) first.set(r.id, r.level);
  // unseen first, then a stable order; at most CANDIDATES
  const ids = [...first.keys()].sort((a, b) => Number(seen.has(a)) - Number(seen.has(b))).slice(0, CANDIDATES);
  if (!ids.length) return [];
  const qs = await inChunks(ids, 500, (c) => repo.findMany("Question", { id: { in: c }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId", "passageId", "difficultyLevel"] }));
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] }) : [];
  const auto = new Map(types.filter((t) => t.code !== "SHORT_ANSWER" && t.isAutoScored !== false && t.isAutoScored !== 0).map((t) => [s(t.id), s(t.code)]));
  const keys = await contentKeysForIds(repo, qs.map((q) => s(q.id)));
  return qs.filter((q) => auto.has(s(q.typeId))).map((q) => ({
    id: s(q.id), bucket, level: first.get(s(q.id)) ?? "ON", type: auto.get(s(q.typeId)) ?? "", passage: q.passageId ? s(q.passageId) : null,
    keys: keys.get(s(q.id)) ?? [], seen: seen.has(s(q.id)), difficulty: Number(q.difficultyLevel ?? 4),
  }));
}

/**
 * ✨ Suggest for me: each selection gets its own number of questions (one selection at a time, in the teacher's
 * order), never repeating a question already in the test (`exclude`) or in an earlier selection (same id or a copy).
 */
export async function suggestReview(repo: Repo, actor: Actor, input: { selections: unknown; level?: string | null; classId?: string | null; exclude?: string[]; seed?: string }, now = new Date()): Promise<ReviewSuggestion> {
  staff(actor);
  assertCan(actor, "assignments:create");
  const selections = cleanSelections(input?.selections);
  const exclude = [...new Set((Array.isArray(input?.exclude) ? input.exclude : []).map(s).filter(Boolean))].slice(0, MAX_TEST_QUESTIONS);
  const asked = selections.reduce((a, x) => a + x.count, 0);
  if (asked + exclude.length > MAX_TEST_QUESTIONS) throw new ValidationError(`A test can have at most ${MAX_TEST_QUESTIONS} questions — lower the numbers.`);
  const level = (["BELOW", "ON", "ABOVE", "MIXED"].includes(s(input?.level)) ? s(input?.level) : "MIXED") as LevelChoice;
  const history = await classHistory(repo, actor, input?.classId ? s(input.classId) : null, now);
  const nodes = selections.some((x) => x.kind === "LESSON") ? await allowedNodes(repo, actor) : null;
  const usedIds = new Set(exclude);
  const usedKeys = new Set([...(await contentKeysForIds(repo, exclude)).values()].flat());
  const seed = s(input?.seed) || String(now.getTime());
  const notes: string[] = [];
  const groups: ReviewGroup[] = [];
  for (const [n, sel] of selections.entries()) {
    const key = `${sel.kind}:${sel.ref}`;
    const pool = await selectionPool(repo, actor, sel, nodes);
    const cands = (await toCandidates(repo, pool, key, history.seen)).filter((c) => !usedIds.has(c.id) && !c.keys.some((k) => usedKeys.has(k)));
    if (!cands.length) { notes.push(`${sel.label}: no new questions are available.`); groups.push({ key, label: sel.label, kind: sel.kind, asked: sel.count, questions: [] }); continue; }
    // a question the test cannot show is left out and the plan made again (as in Make the test for me)
    let pool2 = cands;
    let plan = planTest(pool2, [key], { count: sel.count, levels: levelTargets(level, sel.count), seed: `${seed}:${n}` });
    for (let round = 0; round < 3; round++) {
      const ok = new Set((await loadQuestionItems(repo, plan.ids)).map((it) => it.questionId));
      const bad = plan.ids.filter((id) => !ok.has(id));
      if (!bad.length) break;
      pool2 = pool2.filter((c) => !bad.includes(c.id));
      plan = planTest(pool2, [key], { count: sel.count, levels: levelTargets(level, sel.count), seed: `${seed}:${n}` });
    }
    for (const id of plan.ids) { usedIds.add(id); for (const k of cands.find((c) => c.id === id)?.keys ?? []) usedKeys.add(k); }
    if (plan.ids.length < sel.count) notes.push(`${sel.label}: only ${plan.ids.length} question(s) are available.`);
    const rows = (await describePicks(repo, actor, plan.ids)).map((r) => ({ ...r, section: `${sel.label}${r.section ? ` · ${r.section}` : ""}` }));
    groups.push({ key, label: sel.label, kind: sel.kind, asked: sel.count, questions: rows });
  }
  return { groups, notes: [...new Set(notes)] };
}

// ------------------------------------------------------------------ the question bank: search and filter

export interface BankFilter { skillId?: string | null; type?: string | null; level?: string | null; passage?: "WITH" | "WITHOUT" | "" | null; q?: string | null; page?: number; /** ✏️ only this teacher's own edited copies */ mine?: boolean }
export interface BankResults { rows: MapSourceQuestion[]; total: number; page: number; pages: number }

/**
 * One page (20) of the school's published questions matching the filters (every question type, unless `f.type`
 * narrows it). A skill or 3+ letters is needed (the shared bank); with `mine`, the teacher's own private edited
 * copies (no skill or words needed).
 */
export async function bankSearch(repo: Repo, actor: Actor, f: BankFilter = {}): Promise<BankResults> {
  staff(actor);
  const idx = await schoolSkillIndex(repo, actor.schoolId!);
  const q = s(f.q).replace(/\s+/g, " ").trim().slice(0, 80);
  const skillId = s(f.skillId);
  const mine = f.mine === true;
  if (!mine && !skillId && q.length < 3) throw new ValidationError("Choose a skill or type at least 3 letters to search the bank.");
  let skillIds: string[];
  if (skillId) {
    if (!idx.ids.has(skillId)) throw new ForbiddenError("Skill not found.");
    skillIds = idx.members.get(idx.keyOf.get(skillId)!) ?? [skillId];
  } else skillIds = [...idx.ids];
  // 🐛 fix (audit finding, Oct 2026): this used to default to auto-scored types only (silently dropping, e.g.,
  // SHORT_ANSWER questions from every search that didn't ask for a type by name) — "From the bank" must show every
  // published question a skill actually has, same as the skill picker/"browse by skill" panel below does, which
  // reads with no type filter at all. An explicit `f.type` still narrows to just that one type.
  const types = await repo.findMany("QuestionType", {}, { select: ["id", "code", "isAutoScored"] });
  const typeIds = (f.type ? types.filter((t) => s(t.code) === s(f.type).toUpperCase()) : types).map((t) => s(t.id));
  if (!typeIds.length) return { rows: [], total: 0, page: 1, pages: 1 };
  const lv = s(f.level).toUpperCase() as QLevel;
  const where: Record<string, unknown> = {
    skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null, typeId: { in: typeIds },
    ...(LEVEL_RANGE[lv] ? { difficultyLevel: { in: LEVEL_RANGE[lv] } } : {}),
    ...(f.passage === "WITH" ? { passageId: { not: null } } : f.passage === "WITHOUT" ? { passageId: null } : {}),
    ...(q ? { stem: { contains: q } } : {}),
    // ✏️ the shared bank is read with privateToId: null by the repo; "My edited copies" names the owner
    ...(mine ? { privateToId: actor.userId } : {}),
  };
  const total = await repo.count("Question", where);
  const pages = Math.max(1, Math.ceil(total / BANK_PAGE));
  const page = Math.max(1, Math.min(pages, Math.round(Number(f.page) || 1)));
  const ids = (await repo.findMany("Question", where, { select: ["id"], orderBy: [{ field: "difficultyLevel", dir: "asc" }, { field: "id", dir: "asc" }], take: BANK_PAGE, skip: (page - 1) * BANK_PAGE })).map((r) => s(r.id));
  return { rows: await describePicks(repo, actor, ids), total, page, pages };
}

/** Standards to choose from (code or words), at most 30. */
export async function reviewStandards(repo: Repo, actor: Actor, q: string): Promise<{ code: string; text: string }[]> {
  staff(actor);
  const w = s(q).trim().slice(0, 40);
  if (w.length < 2) return [];
  const rows = await repo.findMany("Standard", { code: { contains: w }, isActive: true }, { select: ["code", "description"], orderBy: [{ field: "code", dir: "asc" }], take: 30 });
  return [...new Map(rows.map((r) => [s(r.code), { code: s(r.code), text: s(r.description).slice(0, 160) }])).values()];
}

// ------------------------------------------------------------------ ✏️ edit = a teacher copy (never the original)

export interface CopyEdit {
  questionId: string;
  stem: string;
  /** option-based types: the same options, new texts and the right answer(s) */
  options?: { label: string; text: string; correct: boolean }[] | null;
  /** true / false */
  answer?: boolean | null;
  /** fill in the blank: the accepted answers */
  answers?: string[] | null;
}
const OPTION_TYPES = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"]);
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };

/**
 * ✏️ The teacher's change to a question of the test: a NEW published question (a copy on the same skill, level,
 * passage and type, tags.teacherCopyOf = the shared original) with the teacher's text, options and answer, PRIVATE to
 * this teacher (privateToId). The original is never edited or deleted (it stays in the shared bank for everyone).
 * Returns the copy's row for the builder.
 */
export async function editQuestionCopy(repo: Repo, actor: Actor, input: CopyEdit, now = new Date()): Promise<MapSourceQuestion> {
  staff(actor);
  assertCan(actor, "questions:edit");
  const id = s(input?.questionId);
  const q = await repo.findUnique("Question", { id });
  if (!q || q.deletedAt || q.status !== "PUBLISHED") throw new ValidationError("That question was not found.");
  const idx = await schoolSkillIndex(repo, actor.schoolId!);
  if (!idx.ids.has(s(q.skillId))) throw new ForbiddenError("That question was not found.");
  // another teacher's private copy is not this teacher's to copy (they never see it in the first place)
  if (q.privateToId !== null && q.privateToId !== undefined && s(q.privateToId) !== actor.userId && actor.role === "TEACHER") throw new ForbiddenError("That question was not found.");
  const type = s((await repo.findUnique("QuestionType", { id: q.typeId }))?.code);
  const stem = s(input?.stem).replace(/\r\n/g, "\n").trim().slice(0, 4000);
  if (!stem) throw new ValidationError("The question text cannot be empty.");
  const [opts, answers, expl] = await Promise.all([
    repo.findMany("QuestionOption", { questionId: id }), repo.findMany("QuestionAnswer", { questionId: id }), repo.findMany("QuestionExplanation", { questionId: id }),
  ]);
  opts.sort((a, b) => Number(a.order) - Number(b.order));
  let newOpts = opts.map((o) => ({ label: s(o.label), text: s(o.text), isCorrect: Boolean(o.isCorrect), rationale: o.rationale ?? null, order: Number(o.order), misconception: o.misconception ?? null, misconceptionSource: o.misconceptionSource ?? null }));
  if (OPTION_TYPES.has(type) && Array.isArray(input?.options)) {
    if (input.options.length !== opts.length) throw new ValidationError("Keep the same number of answer choices.");
    newOpts = newOpts.map((o, i) => ({ ...o, text: s(input.options![i]?.text).trim().slice(0, 1000), isCorrect: Boolean(input.options![i]?.correct) }));
    if (newOpts.some((o) => !o.text)) throw new ValidationError("Every answer choice needs a text.");
    const right = newOpts.filter((o) => o.isCorrect).length;
    if (!right) throw new ValidationError("Mark the correct answer.");
    if (type !== "MULTI_SELECT" && right > 1) throw new ValidationError("This question has one correct answer.");
  }
  let newAnswers = answers.map((a) => ({ value: json<unknown>(a.value, null), isPrimary: a.isPrimary !== false && a.isPrimary !== 0 }));
  if (type === "TRUE_FALSE" && typeof input?.answer === "boolean") newAnswers = [{ value: input.answer, isPrimary: true }];
  if (type === "FILL_BLANK" && Array.isArray(input?.answers)) {
    const list = [...new Set(input.answers.map((x) => s(x).trim()).filter(Boolean))].slice(0, 10);
    if (!list.length) throw new ValidationError("Type at least one accepted answer.");
    newAnswers = list.map((v, i) => ({ value: v, isPrimary: i === 0 }));
  }
  const same = stem === s(q.stem).trim()
    && JSON.stringify(newOpts.map((o) => [o.text, o.isCorrect])) === JSON.stringify(opts.map((o) => [s(o.text), Boolean(o.isCorrect)]))
    && JSON.stringify(newAnswers.map((a) => a.value)) === JSON.stringify(answers.map((a) => json<unknown>(a.value, null)));
  if (same) throw new ValidationError("Nothing was changed.");
  const tags = { ...json<Record<string, unknown>>(q.tags, {}) };
  delete tags.editRequest; delete tags.editLog;
  const copy = await repo.create("Question", {
    externalRef: `TCOPY-${id.slice(-8)}-${now.getTime().toString(36)}`, skillId: q.skillId, subskillId: q.subskillId ?? null, lessonId: q.lessonId ?? null, passageId: q.passageId ?? null,
    imageId: q.imageId ?? null, standardId: q.standardId ?? null, typeId: q.typeId, stem, content: json<unknown>(q.content, {}), hint: q.hint ?? null,
    difficultyLevel: q.difficultyLevel, irtA: q.irtA ?? 1, irtB: q.irtB ?? 0, irtC: q.irtC ?? 0, estimatedSeconds: q.estimatedSeconds ?? 45,
    tags: { ...tags, teacherCopyOf: s(tags.teacherCopyOf) || id }, status: "PUBLISHED", origin: "TEACHER_AUTHORED", createdById: actor.userId, publishedAt: now, createdAt: now, updatedAt: now,
    privateToId: actor.userId, // ✏️ private to this teacher (src/server/questions/private-copies.ts)
  });
  const cid = s(copy.id);
  if (newOpts.length) await repo.createMany("QuestionOption", newOpts.map((o) => ({ questionId: cid, ...o })));
  if (newAnswers.length) await repo.createMany("QuestionAnswer", newAnswers.map((a) => ({ questionId: cid, value: a.value as never, isPrimary: a.isPrimary })));
  if (expl.length) await repo.createMany("QuestionExplanation", expl.map((e) => ({ questionId: cid, kind: s(e.kind), body: json<unknown>(e.body, []) as never, order: Number(e.order ?? 0) })));
  await audit(repo, { actorId: actor.userId, action: "question.teacher_copy", entityType: "Question", entityId: cid, after: { copyOf: id } });
  const [row] = await describePicks(repo, actor, [cid]);
  if (!row) throw new ValidationError("The copy could not be read.");
  return { ...row, section: `✏️ ${row.section || row.skill || ""}`.trim() };
}
