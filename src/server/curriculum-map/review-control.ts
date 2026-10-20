/**
 * 🔁 Curriculum Map → Review (owner r67): the teacher controls the Review of each text set / selection.
 *
 *   - ✏️ Edit a question → a PRIVATE teacher copy (src/server/tests/review.ts editQuestionCopy; Question.privateToId):
 *     the shared original is never edited or deleted, the copy takes its place in this teacher's Review;
 *   - ➕ Add: write a new question (multiple choice, private to the teacher), pick one from the bank, or ✨ AI draft —
 *     a draft only, shown for the teacher to check and edit before it is added;
 *   - ➖ Remove (hide) a question from the Review — the shared question stays on the map for everyone else — and put
 *     it back; ↕ reorder;
 *   - 🔢 HOW MANY questions the Review has: the students answer exactly that many (the first ones, in the teacher's
 *     order) — the teacher sees how many are available and how many are chosen.
 * Saved per teacher and place (TeacherReviewSet); with no set the Review is the place's shared questions as before.
 * ⭐ Assign on the Review place (curriculum-map/levels.ts assignFromMap) uses the teacher's set.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { safeIfBehind } from "../db/schema-errors";
import { attachmentNodes, unclassifiedSkillId, type AttachmentNode } from "./questions";
import { lessonAt } from "./lesson-details";
import { skillPlanData } from "./skill-plan";
import { describePicks, type MapSourceQuestion } from "../tests/map-source";
import { bankSearch, editQuestionCopy, type BankFilter, type BankResults, type CopyEdit } from "../tests/review";
import { loadQuestionItems } from "../practice/items";
import { questionsOfSkill, schoolSkillIndex } from "../questions/skill-questions";
import { anthropicProvider, buildPrompt, chooseAiProvider, geminiProvider, parseGenerated, type AiProvider } from "../ai/question-generator";
import { aiEnv } from "../ai/env";
import { assignQuestions } from "../teacher/assign";

const s = (v: unknown) => String(v ?? "");
// 🔓 r90 ("خليه بدون حد"): no practical cap any more, on a single Text Set's Review or the multi-Set Review Builder
// below — kept as a number (not removed) only as a sane technical ceiling so one runaway click can't write an
// unbounded JSON blob; no real classroom Review gets anywhere near it.
export const MAX_REVIEW = 1000;
type Level = "ABOVE" | "ON" | "BELOW";
type LevelFilter = Level | "ANY";
/** the Review's number of questions when the teacher has not chosen one */
export const DEFAULT_COUNT = 10;
const json = <T,>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

function teacherOnly(actor: Actor): void {
  if (actor.role !== "TEACHER") throw new ForbiddenError("Only teachers can change their Review.");
  assertCan(actor, "assignments:create");
}

/** The Review place of this code (G4.U1.TS1.REV), of any grade of the school. */
export async function reviewPlace(repo: Repo, schoolId: string, code: string): Promise<AttachmentNode> {
  const c = s(code).trim().toUpperCase();
  const n = (await attachmentNodes(repo, schoolId)).find((x) => x.code.toUpperCase() === c);
  if (!n || n.category !== "REVIEW") throw new ValidationError("That Review is not on the Curriculum Map.");
  return n;
}

/** The place's shared questions the platform can mark (published, not short answers), in map order. */
async function sharedQuestions(repo: Repo, nodeId: string): Promise<string[]> {
  const links = await repo.findMany("QuestionMapLink", { nodeId }, { select: ["questionId", "createdAt"] });
  if (!links.length) return [];
  links.sort((a, b) => s(a.createdAt).localeCompare(s(b.createdAt)) || s(a.questionId).localeCompare(s(b.questionId)));
  const ids = links.map((l) => s(l.questionId));
  const qs = await repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId"] });
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] }) : [];
  const manual = new Set(types.filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false || t.isAutoScored === 0).map((t) => s(t.id)));
  const ok = new Set(qs.filter((q) => !manual.has(s(q.typeId))).map((q) => s(q.id)));
  return ids.filter((id) => ok.has(id));
}

/**
 * 🤖 r89 ("عايز Review يرتبط بكل أسئلة نفس الـ Text Set أوتوماتيك"): the published, auto-marked questions of this
 * Review's own Concept Vocabulary and Analyze Craft and Structure (every level of it) — same grade, unit and Text
 * Set/Selection number as the Review node itself. A one-time pull the teacher triggers (op "addSet"), not a live
 * link: it does not notice a question added to Vocabulary/Analyze Craft later, the same way "pick from bank" or
 * "write a question" do not either — pressing it again picks up anything new.
 */
async function sameSetSiblingIds(repo: Repo, schoolId: string, node: AttachmentNode, level: LevelFilter = "ANY"): Promise<string[]> {
  const nodes = await attachmentNodes(repo, schoolId);
  const siblings = nodes.filter((n) => n.grade === node.grade && n.unit === node.unit && n.setNumber === node.setNumber
    && (n.category === "CONCEPT_VOCABULARY" || n.category === "ANALYZE_CRAFT_AND_STRUCTURE")
    && (n.category !== "ANALYZE_CRAFT_AND_STRUCTURE" || level === "ANY" || n.level === level));
  const seen = new Set<string>();
  for (const n of siblings) for (const id of await sharedQuestions(repo, n.id)) seen.add(id);
  return [...seen];
}

/** 🤖 r89/r90 "Language" tab: a skill's own published, auto-marked questions (optionally one level only), not
 * already private to another teacher. */
async function skillAddableIds(repo: Repo, actor: Actor, skillId: string, level: LevelFilter = "ANY"): Promise<string[]> {
  const qs = await questionsOfSkill(repo, actor.schoolId!, skillId, { status: "PUBLISHED", ...(level === "ANY" ? {} : { level }) });
  if (!qs.length) return [];
  const typeIds = [...new Set(qs.map((q) => q.typeId))];
  const types = await repo.findMany("QuestionType", { id: { in: typeIds } }, { select: ["id", "code", "isAutoScored"] });
  const manual = new Set(types.filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false || t.isAutoScored === 0).map((t) => s(t.id)));
  const ok = qs.filter((q) => !manual.has(s(q.typeId)));
  if (!ok.length) return [];
  const owners = await repo.findMany("Question", { id: { in: ok.map((q) => q.id) } }, { select: ["id", "privateToId"] });
  const mine = new Set(owners.filter((q) => !q.privateToId || s(q.privateToId) === actor.userId).map((q) => s(q.id)));
  return ok.filter((q) => mine.has(q.id)).map((q) => q.id);
}

/**
 * 🔁 r90 Review Builder: the published, auto-marked questions of chosen (unit, Text Set, categories) picks of ONE
 * grade — any units, any number of Sets at once, each with its own category tick-list (Vocabulary / Analyze
 * Craft / that Set's own Review). `level` narrows Analyze Craft and Structure to one level only — Vocabulary and
 * Review have no levels, so it never excludes them.
 */
async function setsQuestionIds(repo: Repo, schoolId: string, grade: number,
  picks: { unit: number; setNumber: number; categories: ("CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW")[] }[], level: LevelFilter): Promise<string[]> {
  const nodes = await attachmentNodes(repo, schoolId);
  const seen = new Set<string>();
  for (const p of picks) {
    const cats = new Set<string>(p.categories);
    const matching = nodes.filter((n) => n.grade === grade && n.unit === p.unit && n.setNumber === p.setNumber && cats.has(n.category)
      && (n.category !== "ANALYZE_CRAFT_AND_STRUCTURE" || level === "ANY" || n.level === level));
    for (const n of matching) for (const id of await sharedQuestions(repo, n.id)) seen.add(id);
  }
  return [...seen];
}

/** 🔁 r90 Review Builder's 👁 preview: the first few question stems of a skill, so the teacher can judge it before ticking it. */
export async function skillQuestionPreview(repo: Repo, actor: Actor, skillId: string, level: LevelFilter = "ANY"): Promise<string[]> {
  teacherOnly(actor);
  const ids = (await skillAddableIds(repo, actor, s(skillId), level)).slice(0, 5);
  if (!ids.length) return [];
  return (await describePicks(repo, actor, ids)).map((r) => r.stem);
}

/** 🗂️ r91 Review Builder's 👁 preview for the "Text Sets" tab: the first few question stems of one Text Set's
 * category (Vocabulary / Analyze Craft / that Set's own Review), so the teacher can judge it before ticking it. */
export async function setQuestionPreview(repo: Repo, actor: Actor, grade: number, unit: number, setNumber: number,
  category: "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW", level: LevelFilter = "ANY"): Promise<string[]> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  const ids = (await setsQuestionIds(repo, actor.schoolId!, g, [{ unit: Math.trunc(Number(unit)), setNumber: Math.trunc(Number(setNumber)), categories: [category] }], level)).slice(0, 5);
  if (!ids.length) return [];
  return (await describePicks(repo, actor, ids)).map((r) => r.stem);
}

interface SetState { questionIds: string[]; hiddenIds: string[]; count: number; custom: boolean }

async function setRow(repo: Repo, userId: string, code: string): Promise<Row | null> {
  return safeIfBehind("review.set", async () => (await repo.findMany("TeacherReviewSet", { teacherUserId: userId, code }, { take: 1 }))[0] ?? null, null);
}

/** The teacher's Review (or the place's shared questions when they have not changed it), cleaned of questions gone. */
async function stateOf(repo: Repo, actor: Actor, node: AttachmentNode): Promise<SetState & { shared: string[] }> {
  const shared = await sharedQuestions(repo, node.id);
  const row = actor.role === "TEACHER" ? await setRow(repo, actor.userId, node.code) : null;
  if (!row) return { questionIds: shared.slice(0, MAX_REVIEW), hiddenIds: [], count: Math.min(DEFAULT_COUNT, shared.length), custom: false, shared };
  const hidden = json<string[]>(row.hiddenIds, []).map(s);
  const listed = json<string[]>(row.questionIds, []).map(s);
  // still published (shared, or this teacher's own private questions)
  const alive = listed.length ? new Set((await repo.findMany("Question", { id: { in: listed }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "privateToId"] }))
    .filter((q) => q.privateToId === null || q.privateToId === undefined || s(q.privateToId) === actor.userId).map((q) => s(q.id))) : new Set<string>();
  const questionIds = listed.filter((id) => alive.has(id));
  return { questionIds, hiddenIds: hidden, count: Math.max(0, Math.min(Number(row.count) || 0, questionIds.length)), custom: true, shared };
}

async function write(repo: Repo, actor: Actor, code: string, st: SetState, now: Date): Promise<void> {
  const data = { questionIds: [...new Set(st.questionIds)].slice(0, MAX_REVIEW), hiddenIds: [...new Set(st.hiddenIds)], count: Math.max(1, Math.min(st.count, st.questionIds.length || 1)), updatedAt: now };
  const row = (await repo.findMany("TeacherReviewSet", { teacherUserId: actor.userId, code }, { take: 1 }))[0];
  if (row) await repo.updateMany("TeacherReviewSet", { id: row.id }, data);
  else await repo.create("TeacherReviewSet", { schoolId: actor.schoolId!, teacherUserId: actor.userId, code, createdAt: now, ...data });
}

export interface ReviewControlView {
  code: string; title: string; grade: number; custom: boolean; canEdit: boolean;
  /** available = the place's shared questions (not removed) + the teacher's own in the Review; chosen = in the Review */
  available: number; chosen: number; count: number;
  questions: (MapSourceQuestion & { own: boolean; shared: boolean })[];
  hidden: MapSourceQuestion[];
}

/** The Review place as this teacher has it: the questions in order, how many students answer, what was removed. */
export async function reviewControlView(repo: Repo, actor: Actor, code: string): Promise<ReviewControlView> {
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Teachers only.");
  assertCan(actor, "questions:read");
  const node = await reviewPlace(repo, actor.schoolId!, code);
  const st = await stateOf(repo, actor, node);
  const sharedSet = new Set(st.shared);
  const rows = await describePicks(repo, actor, st.questionIds);
  const hiddenRows = await describePicks(repo, actor, st.hiddenIds.filter((id) => sharedSet.has(id) && !st.questionIds.includes(id)));
  const owner = rows.length ? new Map((await repo.findMany("Question", { id: { in: rows.map((r) => r.id) } }, { select: ["id", "privateToId"] })).map((q) => [s(q.id), q.privateToId ? s(q.privateToId) : ""])) : new Map<string, string>();
  const available = new Set([...st.shared.filter((id) => !st.hiddenIds.includes(id)), ...st.questionIds]).size;
  return {
    code: node.code, title: node.path.split(" › ").slice(1, 3).join(" · "), grade: node.grade, custom: st.custom, canEdit: actor.role === "TEACHER",
    available, chosen: st.questionIds.length, count: st.count,
    questions: rows.map((r) => ({ ...r, own: owner.get(r.id) === actor.userId, shared: sharedSet.has(r.id) })),
    hidden: hiddenRows,
  };
}

export type ReviewChange =
  | { op: "remove"; questionId: string }
  | { op: "restore"; questionId: string }
  | { op: "order"; questionIds: string[] }
  | { op: "count"; count: number }
  | { op: "addBank"; questionId: string }
  /** 🤖 r89: pull in this Text Set's Concept Vocabulary + Analyze Craft and Structure questions, once
   * (🔓 r91: an optional level narrows Analyze Craft and Structure only — Vocabulary has no levels) */
  | { op: "addSet"; level?: LevelFilter }
  /** 🤖 r89 "Language" tab: pull in one or more platform Skills' own questions (any unit of the plan), once */
  | { op: "addSkills"; skillIds: string[]; level?: LevelFilter }
  | { op: "reset" };

/** One change to the teacher's Review (see the header). */
export async function changeReview(repo: Repo, actor: Actor, code: string, c: ReviewChange, now = new Date()): Promise<ReviewControlView> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  if (c.op === "reset") {
    await repo.deleteMany("TeacherReviewSet", { teacherUserId: actor.userId, code: node.code });
    return reviewControlView(repo, actor, node.code);
  }
  const st = await stateOf(repo, actor, node);
  const id = s((c as { questionId?: string }).questionId);
  if (c.op === "remove") {
    if (!st.questionIds.includes(id)) throw new ValidationError("That question is not in your Review.");
    st.questionIds = st.questionIds.filter((x) => x !== id);
    if (st.shared.includes(id)) st.hiddenIds.push(id);
  } else if (c.op === "restore") {
    if (!st.shared.includes(id)) throw new ValidationError("That question is not on this Review place.");
    st.hiddenIds = st.hiddenIds.filter((x) => x !== id);
    if (!st.questionIds.includes(id)) st.questionIds.push(id);
  } else if (c.op === "order") {
    const next = (Array.isArray(c.questionIds) ? c.questionIds : []).map(s);
    if (next.length !== st.questionIds.length || new Set(next).size !== next.length || next.some((x) => !st.questionIds.includes(x))) throw new ValidationError("The new order must hold the same questions.");
    st.questionIds = next;
  } else if (c.op === "count") {
    const n = Math.round(Number(c.count));
    if (!(n >= 1 && n <= st.questionIds.length)) throw new ValidationError(`Choose from 1 to ${st.questionIds.length} questions.`);
    st.count = n;
  } else if (c.op === "addBank") {
    await assertAddable(repo, actor, id);
    if (st.questionIds.includes(id)) throw new ValidationError("That question is already in your Review.");
    if (st.questionIds.length >= MAX_REVIEW) throw new ValidationError(`A Review has at most ${MAX_REVIEW} questions.`);
    st.questionIds.push(id);
    st.hiddenIds = st.hiddenIds.filter((x) => x !== id);
    if (!st.custom) st.count = Math.min(st.count + 1, st.questionIds.length);
  } else if (c.op === "addSet") {
    const level: LevelFilter = c.level && c.level !== "ANY" ? c.level : "ANY";
    const extra = await sameSetSiblingIds(repo, actor.schoolId!, node, level);
    let added = 0;
    for (const qid of extra) {
      if (st.questionIds.includes(qid) || st.questionIds.length >= MAX_REVIEW) continue;
      st.questionIds.push(qid); st.hiddenIds = st.hiddenIds.filter((x) => x !== qid); added++;
    }
    if (!added) throw new ValidationError("Nothing new to add — every Vocabulary and Analyze Craft question here is already in your Review.");
    if (!st.custom) st.count = Math.min(st.count + added, st.questionIds.length);
  } else if (c.op === "addSkills") {
    const skillIds = [...new Set((Array.isArray(c.skillIds) ? c.skillIds : []).map(s).filter(Boolean))].slice(0, 20);
    if (!skillIds.length) throw new ValidationError("Choose at least one skill.");
    const level: LevelFilter = c.level && c.level !== "ANY" ? c.level : "ANY";
    let added = 0;
    for (const skillId of skillIds) {
      for (const qid of await skillAddableIds(repo, actor, skillId, level)) {
        if (st.questionIds.includes(qid) || st.questionIds.length >= MAX_REVIEW) continue;
        st.questionIds.push(qid); st.hiddenIds = st.hiddenIds.filter((x) => x !== qid); added++;
      }
    }
    if (!added) throw new ValidationError("Nothing new to add from those skills.");
    if (!st.custom) st.count = Math.min(st.count + added, st.questionIds.length);
  }
  if (!st.questionIds.length) throw new ValidationError("Keep at least one question in the Review (or press Reset).");
  await write(repo, actor, node.code, st, now);
  return reviewControlView(repo, actor, node.code);
}

/** A question the teacher may put in a Review: published, auto-marked, of the school's skills, shared or their own. */
async function assertAddable(repo: Repo, actor: Actor, id: string): Promise<void> {
  const q = await repo.findUnique("Question", { id });
  if (!q || q.deletedAt || q.status !== "PUBLISHED") throw new ValidationError("That question was not found.");
  if (q.privateToId && s(q.privateToId) !== actor.userId) throw new ForbiddenError("That question was not found.");
  const idx = await schoolSkillIndex(repo, actor.schoolId!);
  if (!idx.ids.has(s(q.skillId))) throw new ForbiddenError("That question was not found.");
  const t = await repo.findUnique("QuestionType", { id: q.typeId });
  if (!t || t.code === "SHORT_ANSWER" || t.isAutoScored === false) throw new ValidationError("Short answers need a teacher to mark them: choose another question.");
}

/** ✏️ Edit = a private copy of the question; the copy takes the original's place in this teacher's Review. */
export async function editReviewQuestion(repo: Repo, actor: Actor, code: string, edit: CopyEdit, now = new Date()): Promise<ReviewControlView> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  const st = await stateOf(repo, actor, node);
  const id = s(edit?.questionId);
  if (!st.questionIds.includes(id)) throw new ValidationError("That question is not in your Review.");
  const copy = await editQuestionCopy(repo, actor, edit, now);
  st.questionIds = st.questionIds.map((x) => (x === id ? copy.id : x));
  if (st.shared.includes(id)) st.hiddenIds.push(id);
  await write(repo, actor, node.code, st, now);
  return reviewControlView(repo, actor, node.code);
}

export interface WrittenQuestion { stem: string; options: string[]; correct: number; explanation?: string | null }

/** ➕ Write a question: multiple choice (2–6 choices, one correct), PRIVATE to the teacher, added to their Review. */
export async function writeReviewQuestion(repo: Repo, actor: Actor, code: string, w: WrittenQuestion, now = new Date()): Promise<ReviewControlView> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  const stem = s(w?.stem).replace(/\r\n/g, "\n").trim().slice(0, 4000);
  const options = (Array.isArray(w?.options) ? w.options : []).map((o) => s(o).trim().slice(0, 1000)).filter(Boolean);
  const correct = Math.trunc(Number(w?.correct));
  if (!stem) throw new ValidationError("Write the question.");
  if (options.length < 2 || options.length > 6) throw new ValidationError("Write from 2 to 6 answer choices.");
  if (!(correct >= 0 && correct < options.length)) throw new ValidationError("Mark the correct answer.");
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new ValidationError("Two answer choices are the same.");
  const st = await stateOf(repo, actor, node);
  if (st.questionIds.length >= MAX_REVIEW) throw new ValidationError(`A Review has at most ${MAX_REVIEW} questions.`);
  // the skill of the place's questions (most common), else the grade's holding skill for map questions
  const skillOfShared = st.shared.length ? (await repo.findMany("Question", { id: { in: st.shared } }, { select: ["skillId"] })).map((q) => s(q.skillId)) : [];
  const tally = new Map<string, number>(); for (const k of skillOfShared) tally.set(k, (tally.get(k) ?? 0) + 1);
  const skillId = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? await unclassifiedSkillId(repo, actor.schoolId!, node.grade);
  const mc = await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" });
  if (!mc) throw new ValidationError("Multiple choice is not set up.");
  const L = "ABCDEF";
  const q = await repo.create("Question", {
    externalRef: `TREV-${node.code}-${now.getTime().toString(36)}`.slice(0, 180), skillId, typeId: mc.id, stem, content: {}, hint: null,
    difficultyLevel: 4, irtA: 1, irtB: 0, irtC: 0.25, estimatedSeconds: 45, tags: { teacherReview: node.code }, status: "PUBLISHED", origin: "TEACHER_AUTHORED",
    createdById: actor.userId, publishedAt: now, createdAt: now, updatedAt: now,
    privateToId: actor.userId, // private to this teacher (src/server/questions/private-copies.ts)
  });
  const qid = s(q.id);
  await repo.createMany("QuestionOption", options.map((text, i) => ({ questionId: qid, label: L[i], text, isCorrect: i === correct, rationale: null, order: i })));
  await repo.createMany("QuestionExplanation", [{ questionId: qid, kind: "WHY_CORRECT", body: [{ type: "text", text: s(w.explanation).trim().slice(0, 1000) || `The answer is ${L[correct]}: ${options[correct]}.` }] as never, order: 0 }]);
  await audit(repo, { actorId: actor.userId, action: "question.teacher_review_write", entityType: "Question", entityId: qid, after: { code: node.code }, at: now });
  st.questionIds.push(qid);
  if (!st.custom) st.count = Math.min(st.count + 1, st.questionIds.length);
  await write(repo, actor, node.code, st, now);
  return reviewControlView(repo, actor, node.code);
}

export interface ReviewSkillChoice { id: string; name: string; group: string }
export interface ReviewSkillUnit { number: number; title: string; skills: ReviewSkillChoice[] }

/**
 * 🤖 r89 "Language" tab ("كل مهارات المنهج مش بس بتاعة الدرس ده"): every platform Skill of this Review's GRADE
 * (the whole plan, every unit — not just this Text Set), grouped by unit, for the teacher to tick which ones to
 * pull questions from.
 */
export async function reviewSkillChoices(repo: Repo, actor: Actor, code: string): Promise<ReviewSkillUnit[]> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  const plan = await skillPlanData(repo, actor, node.grade);
  if (!plan) return [];
  return plan.units.map((u) => {
    const seen = new Set<string>();
    const skills: ReviewSkillChoice[] = [];
    for (const sec of u.sections) for (const k of sec.skills) if (!seen.has(k.id)) { seen.add(k.id); skills.push({ id: k.id, name: k.name, group: k.group }); }
    for (const k of u.writing) if (!seen.has(k.id)) { seen.add(k.id); skills.push({ id: k.id, name: k.name, group: k.group }); }
    return { number: u.number, title: u.title, skills };
  }).filter((u) => u.skills.length > 0);
}

/** 🔎 The bank, to pick a question for the Review (the Review test's search: skill or words, or my edited copies). */
export async function reviewBankSearch(repo: Repo, actor: Actor, f: BankFilter): Promise<BankResults> {
  teacherOnly(actor);
  return bankSearch(repo, actor, f);
}

/** ✏️ A question of the Review with its choices (for the Edit form). */
export async function reviewQuestionDetail(repo: Repo, actor: Actor, code: string, questionId: string): Promise<{ id: string; type: string; stem: string; options: { label: string; text: string; correct: boolean }[]; answer: boolean | null; answers: string[] }> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  const st = await stateOf(repo, actor, node);
  if (!st.questionIds.includes(s(questionId))) throw new ValidationError("That question is not in your Review.");
  const [it] = await loadQuestionItems(repo, [s(questionId)]);
  if (!it) throw new ValidationError("That question was not found.");
  const x = it as unknown as { type: string; stem: string; options?: { label: string; text: string; correct: boolean }[]; answer?: unknown; answers?: unknown[] };
  return { id: s(questionId), type: x.type, stem: x.stem, options: (x.options ?? []).map((o) => ({ label: o.label, text: o.text, correct: Boolean(o.correct) })), answer: typeof x.answer === "boolean" ? x.answer : null, answers: Array.isArray(x.answers) ? x.answers.map(s) : [] };
}

/**
 * ✨ AI draft for the Review: ONE multiple-choice question about the lesson (curriculum content only — never student
 * data). It is NOT saved: the teacher reads it, edits it and adds it with Write (writeReviewQuestion).
 */
export async function draftReviewQuestion(repo: Repo, actor: Actor, code: string, provider?: AiProvider): Promise<WrittenQuestion> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  let ai = provider;
  if (!ai) {
    const c = chooseAiProvider(aiEnv());
    if ("error" in c) throw new ValidationError("AI drafts are not set up on this server. Write the question yourself.");
    ai = c.provider === "gemini" ? geminiProvider({ apiKey: c.apiKey, model: c.model }) : anthropicProvider({ apiKey: c.apiKey, model: c.model });
  }
  const lesson = lessonAt(node.grade, node.unitTitle, node.heading);
  const st = await stateOf(repo, actor, node);
  const avoid = (await describePicks(repo, actor, st.questionIds.slice(0, 30))).map((r) => r.stem);
  const p = buildPrompt({
    grade: node.grade, book: "Curriculum Map", unit: { number: node.unit, title: node.unitTitle }, lesson: { code: node.code, title: lesson?.name ?? node.heading, genre: node.genre },
    skill: { code: node.code, name: `Review of ${lesson?.name ?? node.heading}`, description: [lesson?.vocabularySkill, ...(lesson?.readingSkills ?? [])].filter(Boolean).join("; ") || null, domain: "READING" },
    standard: { code: `RL.${node.grade}.1`, description: null }, slots: [{ slot: 1, level: 4 }], avoid,
  });
  let list: unknown[];
  try { list = parseGenerated(await ai.complete(p.system, p.user)); } catch (e) { throw new ValidationError(`The AI draft did not work: ${(e as Error).message}`); }
  const q = (list[0] ?? {}) as { stem?: unknown; options?: { text?: unknown; correct?: unknown }[]; explanation?: unknown };
  const options = (Array.isArray(q.options) ? q.options : []).map((o) => s(o?.text).trim()).filter(Boolean).slice(0, 6);
  const correct = (Array.isArray(q.options) ? q.options : []).findIndex((o) => o?.correct === true);
  if (!s(q.stem).trim() || options.length < 2 || correct < 0 || correct >= options.length) throw new ValidationError("The AI draft was not usable. Try again, or write the question yourself.");
  return { stem: s(q.stem).trim(), options, correct, explanation: s(q.explanation).trim() || null };
}

/**
 * ⭐ Assign: the teacher's Review questions for this place, exactly `count` of them in the teacher's order (null: the
 * teacher has not changed this Review — the place's shared questions as before).
 */
export async function teacherReviewQuestions(repo: Repo, actor: Actor, node: AttachmentNode): Promise<string[] | null> {
  if (actor.role !== "TEACHER" || node.category !== "REVIEW") return null;
  const row = await setRow(repo, actor.userId, node.code);
  if (!row) return null;
  const st = await stateOf(repo, actor, node);
  return st.questionIds.slice(0, st.count);
}

/**
 * ⭐ r91 Assign My Review directly (not through the shared ⭐ Assign window / assignFromMap, to avoid touching
 * that window's behaviour for every other place on the map): **Fixed** (the default — exactly the teacher's chosen
 * count and order, same for every student, as always) or **Adaptive** (new — each student answers from the whole
 * Review pool until they reach a target number of correct answers, moving at their own pace).
 */
export async function reviewAssign(repo: Repo, actor: Actor, code: string, input: {
  classId: string; studentIds?: string[]; title?: string; source: string | null | undefined;
  adaptive?: { maxQuestions: number; targetCorrect?: number | null } | null;
}, now = new Date()): Promise<{ assignmentId: string; students: number; questions: number }> {
  teacherOnly(actor);
  const node = await reviewPlace(repo, actor.schoolId!, code);
  const st = await stateOf(repo, actor, node);
  if (!st.questionIds.length) throw new ValidationError("Your Review has no questions: add some first.");
  const ids = input.adaptive ? st.questionIds : st.questionIds.slice(0, st.count);
  if (!ids.length) throw new ValidationError("Your Review has no questions: add some first.");
  const title = (input.title || `${node.unitTitle} · ${node.heading} · ${node.categoryLabel.replace(/^\d+-\s*/, "")}`).slice(0, 150);
  return assignQuestions(repo, actor, {
    classId: input.classId, studentIds: input.studentIds, questionIds: ids, track: "CURRICULUM", exactTitle: true, source: input.source, title,
    ...(input.adaptive ? { adaptive: input.adaptive } : { test: true }),
  }, now);
}

/* =========================================================================================================
 * 🔁 r90 Review Builder ("عايز أضيف كمان كلمه review تكون موجوده اعلي الخطه اقدر احدد دروس معينه من الخطه
 * بالكامل"): a SECOND, separate Review, not tied to one Text Set — the teacher picks any number of Text
 * Sets/Selections from ANY unit of the whole grade (each with its own ☐ Vocabulary / ☐ Analyze Craft / ☐ Review
 * tick-list), or any platform Skills from the "Language" tab, with an optional level filter, and no cap.
 * Stored in the SAME TeacherReviewSet table as the per-Set Review above, keyed by a synthetic code
 * (CUSTOM.G{grade} — one per teacher per grade), since that column carries no foreign key to the Curriculum Map:
 * reusing it needs no schema change. Deliberately narrower than the per-Set Review: remove / reorder / how-many
 * only — no private-copy Edit, no Write-a-question, no ✨ AI draft (those stay on the per-Set page).
 * ========================================================================================================= */

interface CustomState { questionIds: string[]; hiddenIds: string[]; count: number }

const customCode = (grade: number): string => `CUSTOM.G${Math.trunc(grade)}`;

async function customRow(repo: Repo, userId: string, grade: number): Promise<Row | null> {
  return safeIfBehind("review.custom", async () => (await repo.findMany("TeacherReviewSet", { teacherUserId: userId, code: customCode(grade) }, { take: 1 }))[0] ?? null, null);
}

async function customStateOf(repo: Repo, actor: Actor, grade: number): Promise<CustomState> {
  const row = await customRow(repo, actor.userId, grade);
  if (!row) return { questionIds: [], hiddenIds: [], count: 0 };
  const listed = json<string[]>(row.questionIds, []).map(s);
  const hiddenListed = json<string[]>(row.hiddenIds, []).map(s);
  const all = [...new Set([...listed, ...hiddenListed])];
  const alive = all.length ? new Set((await repo.findMany("Question", { id: { in: all }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "privateToId"] }))
    .filter((q) => q.privateToId === null || q.privateToId === undefined || s(q.privateToId) === actor.userId).map((q) => s(q.id))) : new Set<string>();
  const questionIds = listed.filter((id) => alive.has(id));
  const hiddenIds = hiddenListed.filter((id) => alive.has(id) && !questionIds.includes(id));
  return { questionIds, hiddenIds, count: Math.max(0, Math.min(Number(row.count) || 0, questionIds.length)) };
}

async function writeCustom(repo: Repo, actor: Actor, grade: number, st: CustomState, now: Date): Promise<void> {
  const code = customCode(grade);
  const ids = [...new Set(st.questionIds)].slice(0, MAX_REVIEW);
  const data = { questionIds: ids, hiddenIds: [...new Set(st.hiddenIds)], count: ids.length ? Math.max(1, Math.min(st.count, ids.length)) : 0, updatedAt: now };
  const row = (await repo.findMany("TeacherReviewSet", { teacherUserId: actor.userId, code }, { take: 1 }))[0];
  if (row) await repo.updateMany("TeacherReviewSet", { id: row.id }, data);
  else await repo.create("TeacherReviewSet", { schoolId: actor.schoolId!, teacherUserId: actor.userId, code, createdAt: now, ...data });
}

export interface CustomReviewView {
  grade: number; chosen: number; count: number;
  questions: (MapSourceQuestion & { own: boolean })[];
  hidden: MapSourceQuestion[];
}

/** The teacher's whole-grade Review Builder as they have it: the questions in order, how many students answer. */
export async function customReviewView(repo: Repo, actor: Actor, grade: number): Promise<CustomReviewView> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  const st = await customStateOf(repo, actor, g);
  const rows = await describePicks(repo, actor, st.questionIds);
  const hiddenRows = await describePicks(repo, actor, st.hiddenIds);
  const owner = rows.length ? new Map((await repo.findMany("Question", { id: { in: rows.map((r) => r.id) } }, { select: ["id", "privateToId"] })).map((q) => [s(q.id), q.privateToId ? s(q.privateToId) : ""])) : new Map<string, string>();
  return { grade: g, chosen: st.questionIds.length, count: st.count, questions: rows.map((r) => ({ ...r, own: owner.get(r.id) === actor.userId })), hidden: hiddenRows };
}

export type CustomReviewChange =
  | { op: "remove"; questionId: string }
  | { op: "restore"; questionId: string }
  | { op: "order"; questionIds: string[] }
  | { op: "count"; count: number }
  | { op: "addBank"; questionId: string }
  /** 🤖 "Text Sets" tab: pull in the ticked categories of the ticked Text Sets/Selections */
  | { op: "addSets"; picks: { unit: number; setNumber: number; categories: ("CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW")[] }[]; level?: LevelFilter }
  /** 🤖 "Language" tab: pull in one or more platform Skills' own questions, any unit of the grade's plan */
  | { op: "addSkills"; skillIds: string[]; level?: LevelFilter }
  | { op: "reset" };

/** One change to the teacher's whole-grade Review Builder (see the header above). */
export async function changeCustomReview(repo: Repo, actor: Actor, grade: number, c: CustomReviewChange, now = new Date()): Promise<CustomReviewView> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  if (!(g >= 1)) throw new ValidationError("Choose a grade.");
  if (c.op === "reset") {
    await repo.deleteMany("TeacherReviewSet", { teacherUserId: actor.userId, code: customCode(g) });
    return customReviewView(repo, actor, g);
  }
  const st = await customStateOf(repo, actor, g);
  if (c.op === "remove") {
    const id = s(c.questionId);
    if (!st.questionIds.includes(id)) throw new ValidationError("That question is not in this Review.");
    st.questionIds = st.questionIds.filter((x) => x !== id);
    if (!st.hiddenIds.includes(id)) st.hiddenIds.push(id);
  } else if (c.op === "restore") {
    const id = s(c.questionId);
    if (!st.hiddenIds.includes(id)) throw new ValidationError("That question is not removed.");
    st.hiddenIds = st.hiddenIds.filter((x) => x !== id);
    if (!st.questionIds.includes(id)) { st.questionIds.push(id); st.count = Math.min(st.count + 1, st.questionIds.length) || 1; }
    await writeCustom(repo, actor, g, st, now);
    return customReviewView(repo, actor, g);
  } else if (c.op === "order") {
    const next = (Array.isArray(c.questionIds) ? c.questionIds : []).map(s);
    if (next.length !== st.questionIds.length || new Set(next).size !== next.length || next.some((x) => !st.questionIds.includes(x))) throw new ValidationError("The new order must hold the same questions.");
    st.questionIds = next;
  } else if (c.op === "count") {
    const n = Math.round(Number(c.count));
    if (!(n >= 1 && n <= st.questionIds.length)) throw new ValidationError(`Choose from 1 to ${st.questionIds.length} questions.`);
    st.count = n;
  } else if (c.op === "addBank") {
    const id = s(c.questionId);
    await assertAddable(repo, actor, id);
    if (st.questionIds.includes(id)) throw new ValidationError("That question is already in this Review.");
    if (st.questionIds.length >= MAX_REVIEW) throw new ValidationError(`A Review has at most ${MAX_REVIEW} questions.`);
    st.questionIds.push(id);
    st.count = Math.min(st.count + 1, st.questionIds.length);
  } else if (c.op === "addSets") {
    const picks = (Array.isArray(c.picks) ? c.picks : []).map((p) => ({
      unit: Math.trunc(Number(p.unit)), setNumber: Math.trunc(Number(p.setNumber)),
      categories: (Array.isArray(p.categories) ? p.categories : []).filter((x): x is "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW" =>
        x === "CONCEPT_VOCABULARY" || x === "ANALYZE_CRAFT_AND_STRUCTURE" || x === "REVIEW"),
    })).filter((p) => p.unit > 0 && p.setNumber > 0 && p.categories.length > 0);
    if (!picks.length) throw new ValidationError("Choose at least one Text Set and category.");
    const level: LevelFilter = c.level && c.level !== "ANY" ? c.level : "ANY";
    const extra = await setsQuestionIds(repo, actor.schoolId!, g, picks, level);
    let added = 0;
    for (const qid of extra) {
      if (st.questionIds.includes(qid) || st.questionIds.length >= MAX_REVIEW) continue;
      st.questionIds.push(qid); added++;
    }
    if (!added) throw new ValidationError("Nothing new to add from those Text Sets.");
    st.count = Math.min(st.count + added, st.questionIds.length);
  } else if (c.op === "addSkills") {
    const skillIds = [...new Set((Array.isArray(c.skillIds) ? c.skillIds : []).map(s).filter(Boolean))].slice(0, 20);
    if (!skillIds.length) throw new ValidationError("Choose at least one skill.");
    const level: LevelFilter = c.level && c.level !== "ANY" ? c.level : "ANY";
    let added = 0;
    for (const skillId of skillIds) {
      for (const qid of await skillAddableIds(repo, actor, skillId, level)) {
        if (st.questionIds.includes(qid) || st.questionIds.length >= MAX_REVIEW) continue;
        st.questionIds.push(qid); added++;
      }
    }
    if (!added) throw new ValidationError("Nothing new to add from those skills.");
    st.count = Math.min(st.count + added, st.questionIds.length);
  }
  if (!st.questionIds.length) throw new ValidationError("Add at least one question (or press Reset).");
  await writeCustom(repo, actor, g, st, now);
  return customReviewView(repo, actor, g);
}

/** ✏️ A question of the Review Builder with its choices (for the Edit form). */
export async function customQuestionDetail(repo: Repo, actor: Actor, grade: number, questionId: string): Promise<{ id: string; type: string; stem: string; options: { label: string; text: string; correct: boolean }[]; answer: boolean | null; answers: string[] }> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  const st = await customStateOf(repo, actor, g);
  if (!st.questionIds.includes(s(questionId))) throw new ValidationError("That question is not in this Review.");
  const [it] = await loadQuestionItems(repo, [s(questionId)]);
  if (!it) throw new ValidationError("That question was not found.");
  const x = it as unknown as { type: string; stem: string; options?: { label: string; text: string; correct: boolean }[]; answer?: unknown; answers?: unknown[] };
  return { id: s(questionId), type: x.type, stem: x.stem, options: (x.options ?? []).map((o) => ({ label: o.label, text: o.text, correct: Boolean(o.correct) })), answer: typeof x.answer === "boolean" ? x.answer : null, answers: Array.isArray(x.answers) ? x.answers.map(s) : [] };
}

/** ✏️ Edit = a private copy of the question; the copy takes the original's place in the Review Builder. */
export async function customEditQuestion(repo: Repo, actor: Actor, grade: number, edit: CopyEdit, now = new Date()): Promise<CustomReviewView> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  const st = await customStateOf(repo, actor, g);
  const id = s(edit?.questionId);
  if (!st.questionIds.includes(id)) throw new ValidationError("That question is not in this Review.");
  const copy = await editQuestionCopy(repo, actor, edit, now);
  st.questionIds = st.questionIds.map((x) => (x === id ? copy.id : x));
  if (!st.hiddenIds.includes(id)) st.hiddenIds.push(id);
  await writeCustom(repo, actor, g, st, now);
  return customReviewView(repo, actor, g);
}

/** ➕ Write a question (multiple choice, private to the teacher) straight into the Review Builder. */
export async function customWriteQuestion(repo: Repo, actor: Actor, grade: number, w: WrittenQuestion, now = new Date()): Promise<CustomReviewView> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  const stem = s(w?.stem).replace(/\r\n/g, "\n").trim().slice(0, 4000);
  const options = (Array.isArray(w?.options) ? w.options : []).map((o) => s(o).trim().slice(0, 1000)).filter(Boolean);
  const correct = Math.trunc(Number(w?.correct));
  if (!stem) throw new ValidationError("Write the question.");
  if (options.length < 2 || options.length > 6) throw new ValidationError("Write from 2 to 6 answer choices.");
  if (!(correct >= 0 && correct < options.length)) throw new ValidationError("Mark the correct answer.");
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new ValidationError("Two answer choices are the same.");
  const st = await customStateOf(repo, actor, g);
  if (st.questionIds.length >= MAX_REVIEW) throw new ValidationError(`A Review has at most ${MAX_REVIEW} questions.`);
  const skillId = await unclassifiedSkillId(repo, actor.schoolId!, g);
  const mc = await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" });
  if (!mc) throw new ValidationError("Multiple choice is not set up.");
  const L = "ABCDEF";
  const q = await repo.create("Question", {
    externalRef: `TREV-${customCode(g)}-${now.getTime().toString(36)}`.slice(0, 180), skillId, typeId: mc.id, stem, content: {}, hint: null,
    difficultyLevel: 4, irtA: 1, irtB: 0, irtC: 0.25, estimatedSeconds: 45, tags: { teacherReview: customCode(g) }, status: "PUBLISHED", origin: "TEACHER_AUTHORED",
    createdById: actor.userId, publishedAt: now, createdAt: now, updatedAt: now,
    privateToId: actor.userId,
  });
  const qid = s(q.id);
  await repo.createMany("QuestionOption", options.map((text, i) => ({ questionId: qid, label: L[i], text, isCorrect: i === correct, rationale: null, order: i })));
  await repo.createMany("QuestionExplanation", [{ questionId: qid, kind: "WHY_CORRECT", body: [{ type: "text", text: s(w.explanation).trim().slice(0, 1000) || `The answer is ${L[correct]}: ${options[correct]}.` }] as never, order: 0 }]);
  await audit(repo, { actorId: actor.userId, action: "question.teacher_review_write", entityType: "Question", entityId: qid, after: { code: customCode(g) }, at: now });
  st.questionIds.push(qid);
  st.count = Math.min(st.count + 1, st.questionIds.length) || 1;
  await writeCustom(repo, actor, g, st, now);
  return customReviewView(repo, actor, g);
}

/** ✨ AI draft for the Review Builder: ONE multiple-choice question for this grade (curriculum content only — never
 * student data). NOT saved: the teacher checks and edits it, then adds it with customWriteQuestion. */
export async function customDraftQuestion(repo: Repo, actor: Actor, grade: number, provider?: AiProvider): Promise<WrittenQuestion> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  let ai = provider;
  if (!ai) {
    const c = chooseAiProvider(aiEnv());
    if ("error" in c) throw new ValidationError("AI drafts are not set up on this server. Write the question yourself.");
    ai = c.provider === "gemini" ? geminiProvider({ apiKey: c.apiKey, model: c.model }) : anthropicProvider({ apiKey: c.apiKey, model: c.model });
  }
  const st = await customStateOf(repo, actor, g);
  const avoid = (await describePicks(repo, actor, st.questionIds.slice(0, 30))).map((r) => r.stem);
  const p = buildPrompt({
    grade: g, book: "Curriculum Map", unit: null, lesson: null,
    skill: { code: customCode(g), name: `Review of Grade ${g}`, description: null, domain: "READING" },
    standard: { code: `RL.${g}.1`, description: null }, slots: [{ slot: 1, level: 4 }], avoid,
  });
  let list: unknown[];
  try { list = parseGenerated(await ai.complete(p.system, p.user)); } catch (e) { throw new ValidationError(`The AI draft did not work: ${(e as Error).message}`); }
  const q = (list[0] ?? {}) as { stem?: unknown; options?: { text?: unknown; correct?: unknown }[]; explanation?: unknown };
  const options = (Array.isArray(q.options) ? q.options : []).map((o) => s(o?.text).trim()).filter(Boolean).slice(0, 6);
  const correct = (Array.isArray(q.options) ? q.options : []).findIndex((o) => o?.correct === true);
  if (!s(q.stem).trim() || options.length < 2 || correct < 0 || correct >= options.length) throw new ValidationError("The AI draft was not usable. Try again, or write the question yourself.");
  return { stem: s(q.stem).trim(), options, correct, explanation: s(q.explanation).trim() || null };
}

/** 🗣️ Review Builder "Language" tab: every platform Skill of this grade, grouped by unit — same shape as
 * reviewSkillChoices above, but not tied to any one Text Set's Review place. */
export async function customSkillChoices(repo: Repo, actor: Actor, grade: number): Promise<ReviewSkillUnit[]> {
  teacherOnly(actor);
  const plan = await skillPlanData(repo, actor, Math.trunc(Number(grade)));
  if (!plan) return [];
  return plan.units.map((u) => {
    const seen = new Set<string>();
    const skills: ReviewSkillChoice[] = [];
    for (const sec of u.sections) for (const k of sec.skills) if (!seen.has(k.id)) { seen.add(k.id); skills.push({ id: k.id, name: k.name, group: k.group }); }
    for (const k of u.writing) if (!seen.has(k.id)) { seen.add(k.id); skills.push({ id: k.id, name: k.name, group: k.group }); }
    return { number: u.number, title: u.title, skills };
  }).filter((u) => u.skills.length > 0);
}

export interface ReviewSetChoice { unit: number; setNumber: number; title: string; heading: string; categories: ("CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW")[] }
export interface ReviewSetUnit { unit: number; unitTitle: string; sets: ReviewSetChoice[] }

/** 🗂️ Review Builder "Text Sets" tab: every Text Set/Selection of this grade, grouped by unit, each with which
 * categories (Vocabulary / Analyze Craft / that Set's own Review) it actually has to tick. */
export async function customSetChoices(repo: Repo, actor: Actor, grade: number): Promise<ReviewSetUnit[]> {
  teacherOnly(actor);
  const g = Math.trunc(Number(grade));
  const nodes = (await attachmentNodes(repo, actor.schoolId!)).filter((n) => n.grade === g
    && (n.category === "CONCEPT_VOCABULARY" || n.category === "ANALYZE_CRAFT_AND_STRUCTURE" || n.category === "REVIEW"));
  const byUnit = new Map<number, Map<number, ReviewSetChoice>>();
  for (const n of nodes) {
    if (!byUnit.has(n.unit)) byUnit.set(n.unit, new Map());
    const sets = byUnit.get(n.unit)!;
    if (!sets.has(n.setNumber)) sets.set(n.setNumber, { unit: n.unit, setNumber: n.setNumber, title: n.setTitle || n.heading, heading: n.heading, categories: [] });
    const set = sets.get(n.setNumber)!;
    const cat = n.category as "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW";
    if (!set.categories.includes(cat)) set.categories.push(cat);
  }
  return [...byUnit.entries()].sort((a, b) => a[0] - b[0]).map(([unit, sets]) => ({
    unit, unitTitle: nodes.find((n) => n.unit === unit)?.unitTitle ?? `Unit ${unit}`,
    sets: [...sets.values()].sort((a, b) => a.setNumber - b.setNumber),
  }));
}
