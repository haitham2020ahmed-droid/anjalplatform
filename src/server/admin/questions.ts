/**
 * Question editor workflow (Phase 11).
 *
 *   DRAFT ──submit──▶ UNDER_REVIEW ──approve──▶ PUBLISHED ──archive──▶ ARCHIVED
 *     ▲                    │
 *     └──────reject────────┘ (with a note; the author is notified)
 *
 *  - Authors (questions:edit) create and edit drafts. Teachers edit only their own;
 *    reviewers (questions:publish) may edit any unpublished item.
 *  - Four-eyes rule: a teacher with publish rights cannot approve their own item.
 *    School admins may (small schools), and it is audited either way.
 *  - Only PUBLISHED items reach students (the practice engine reads PUBLISHED only).
 *  - Published items are never edited in place: their answers and statistics belong to
 *    that exact wording. "Revise" makes a new DRAFT (version + 1); when the revision is
 *    approved, the original is archived in the same step, so the pool never has a gap.
 *  - AI-drafted items (origin AI_GENERATED) carry aiStatus and must pass the same review.
 *  - Every item is checked with the Phase 1 bank validator before it can be submitted.
 *  - All items belong to the actor's school (via skill → curriculum → grade).
 */
import { randomBytes } from "node:crypto";
import { LEVEL_LABELS, LEVEL_TO_B } from "../../config/engine";
import { answerValues, contentPayload, QUESTION_TYPES, validateItem, type BankItem, type BankOption, type QuestionTypeCode } from "../../imports/questions/validate";
import { audit } from "../audit";
import { assertCan, can, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { schoolOf } from "./users";
import { cleanPassage, passageForText } from "./passages";
import { needsPassage, possibleMissingPassage } from "../../lib/passage-detect";
import { cleanAlt, removeUnusedImages } from "./question-images";
import { attachmentNodes, placesOf, setQuestionMapNode, setQuestionUses, unclassifiedSkillId, type QuestionUseKind } from "../curriculum-map/questions";

export type QuestionStatus = "DRAFT" | "UNDER_REVIEW" | "PUBLISHED" | "ARCHIVED";
export const STATUSES: readonly QuestionStatus[] = ["DRAFT", "UNDER_REVIEW", "PUBLISHED", "ARCHIVED"];

export interface EditorInput {
  skillId: string;
  type: QuestionTypeCode;
  stem: string;
  level: number;
  standardCode?: string | null;
  passageId?: string | null;
  /**
   * Optional passage/story/poem shown before the question. When present (even ""), it decides the
   * passage: text → the passage with that text (found or created), "" → no passage.
   */
  passageText?: string | null;
  /**
   * Curriculum Map place (an attachment node's ID, e.g. G4.U1.TS1.ACS.ON): the question is then on the
   * map AND in the bank. null = bank only. Leave out = unchanged. Without a skill, the question gets
   * its grade's “Unclassified (Curriculum Map)” skill.
   */
  mapNodeCode?: string | null;
  /** Placement / MAP test uses (both allowed). Leave out = unchanged. */
  uses?: QuestionUseKind[];
  /** Lexile of the question/passage (e.g. 820). null = none; leave out = unchanged. */
  lexile?: number | null;
  /** optional QuestionImage id (null = no image; leave out = unchanged) and its description */
  imageId?: string | null;
  imageAlt?: string | null;
  hint?: string | null;
  whyCorrect: string;
  tip?: string | null;
  estimatedSeconds?: number;
  options?: BankOption[];
  answer?: boolean;
  answers?: string[];
  sequence?: string[];
  segments?: string[];
  errorIndex?: number;
  correction?: string;
  pairs?: { left: string; right: string }[];
  /** AI-drafted items must be marked so (they go through the same review). */
  aiDrafted?: boolean;
  /** Lesson the question belongs to (optional; must teach the skill). */
  lessonId?: string | null;
  /** Bloom's cognitive level, e.g. Understand, Analyze (stored in tags). */
  cognitiveLevel?: string | null;
  /** AI generation batch id (stored in tags). */
  batch?: string | null;
  /** Created by the question-bank importer (origin IMPORTED; import job id stored in tags). */
  imported?: boolean;
}

const num = (v: unknown) => Number(v ?? 0);
const text = (v: unknown, label: string, max: number, required = true) => {
  const s = String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !s) throw new ValidationError(`${label} is required.`);
  if (s.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return s;
};

// --------------------------------------------------------------- scoping

async function skillInSchool(repo: Repo, actor: Actor, skillId: string): Promise<{ skill: Row; grade: number }> {
  const skill = await repo.findUnique("Skill", { id: skillId });
  const cur = skill ? await repo.findUnique("Curriculum", { id: skill.curriculumId }) : null;
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!skill || !grade || grade.schoolId !== schoolOf(actor)) throw new ValidationError("Skill not found in this school.");
  return { skill, grade: num(grade.level) };
}

async function questionInSchool(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const q = await repo.findUnique("Question", { id });
  if (!q || q.deletedAt) throw new ForbiddenError("Question not found.");
  try {
    await skillInSchool(repo, actor, String(q.skillId));
  } catch {
    throw new ForbiddenError("Question not found.");
  }
  return q;
}

const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/**
 * Editing rule. Drafts and items under review: as before. PUBLISHED: may be edited directly by
 * someone who can publish, but ONLY while no student has answered it (its statistics would no longer
 * match its wording); after that, “Make a new version”. Archived: never.
 */
async function mayEditQuestion(repo: Repo, actor: Actor, q: Row): Promise<void> {
  if (q.status !== "PUBLISHED") return assertMayEdit(actor, q);
  assertCan(actor, "questions:edit");
  if (!can(actor, "questions:publish") && !isAdmin(actor)) throw new ForbiddenError("Only reviewers and admins can edit a published question directly. Use “Revise” to make a new version.");
  if (await repo.count("QuestionAttempt", { questionId: q.id })) throw new ValidationError("Students have already answered this question, so it cannot be changed. Use “Revise” to make a new version.");
}

function assertMayEdit(actor: Actor, q: Row) {
  assertCan(actor, "questions:edit");
  if (q.status === "PUBLISHED" || q.status === "ARCHIVED") throw new ValidationError("Published and archived questions cannot be edited. Use “Revise” to make a new version.");
  const aiReviewer = q.origin === "AI_GENERATED" && can(actor, "questions:review");
  if (q.createdById !== actor.userId && !can(actor, "questions:publish") && !isAdmin(actor) && !aiReviewer) throw new ForbiddenError("You can edit only your own drafts.");
}

// ------------------------------------------------------------ validation

/**
 * Pure part of the bank validation: builds the BankItem from editor input and checks it with the
 * Phase 1 validator. No database access, so the importer can validate thousands of rows quickly.
 * Throws ValidationError with every problem found.
 */
export function buildBankItem(input: EditorInput, ctx: { ref: string; grade: number; skillCode: string; standardCode: string | null; passageRef: string | null; /** Curriculum Map questions may have no standard */ allowNoStandard?: boolean }): BankItem {
  if (!(QUESTION_TYPES as readonly string[]).includes(input.type)) throw new ValidationError("Choose a question type.");
  const item: BankItem = {
    ref: ctx.ref, grade: ctx.grade, family: "", skillKey: ctx.skillCode, standard: ctx.standardCode || "(none)",
    level: Math.round(num(input.level)), type: input.type,
    stem: text(input.stem, "Question", 2000), passage: ctx.passageRef, subskill: null,
    explanation: { whyCorrect: text(input.whyCorrect, "Explanation", 1000), tip: text(input.tip, "Tip", 500, false) },
    estimatedSeconds: Math.min(600, Math.max(10, Math.round(num(input.estimatedSeconds ?? 45)))),
    irt: { a: 1, b: LEVEL_TO_B[Math.round(num(input.level))] ?? 0, c: 0 },
    options: input.options?.map((o, i) => ({ label: o.label?.trim() || "ABCDEFGH"[i], text: text(o.text, `Option ${i + 1}`, 500), correct: Boolean(o.correct), rationale: o.rationale ? text(o.rationale, `Feedback for option ${i + 1}`, 500) : null })),
    answer: input.answer, // auto-marked answers stay short; a teacher-scored Short Answer keeps its full model answer (read by the teacher)
    answers: input.answers?.map((a) => (input.type === "SHORT_ANSWER" ? text(a, "Model answer", 2000) : text(a, "Accepted answer", 200))).filter(Boolean),
    sequence: input.sequence?.map((s) => text(s, "Item", 300)), segments: input.segments?.map((s) => text(s, "Segment", 300)),
    errorIndex: input.errorIndex === undefined ? undefined : num(input.errorIndex), correction: input.correction ? text(input.correction, "Correction", 300) : undefined,
    pairs: input.pairs?.map((p) => ({ left: text(p.left, "Left", 200), right: text(p.right, "Right", 200) })),
  };
  const passages = new Set(item.passage ? [item.passage] : []);
  const noStandardOk = !ctx.standardCode && ctx.allowNoStandard;
  const issues = validateItem(item, { skillKeys: new Set([item.skillKey]), standards: new Set(ctx.standardCode ? [ctx.standardCode] : noStandardOk ? [item.standard] : []), passages });
  if (issues.length) throw new ValidationError(issues.map((i) => i.message.replace(/^unknown standard.*/, "Choose the standard this question assesses.")).join("; "));
  return item;
}

async function toBankItem(repo: Repo, actor: Actor, input: EditorInput, ref: string): Promise<{ item: BankItem; grade: number; standardId: string | null; passageId: string | null }> {
  const { skill, grade } = await skillInSchool(repo, actor, input.skillId);
  if (!(QUESTION_TYPES as readonly string[]).includes(input.type)) throw new ValidationError("Choose a question type.");
  let standardCode = input.standardCode ? String(input.standardCode).trim() : "";
  if (!standardCode) {
    const link = (await repo.findMany("SkillStandard", { skillId: skill.id }))[0];
    const std = link ? await repo.findUnique("Standard", { id: link.standardId }) : null;
    standardCode = std ? String(std.code) : "";
  }
  const std = standardCode ? (await repo.findMany("Standard", { code: standardCode }))[0] : null;
  const passage = input.passageId ? await repo.findUnique("ReadingPassage", { id: input.passageId }) : null;
  if (input.passageId && !passage) throw new ValidationError("Reading passage not found.");
  const item = buildBankItem(input, {
    ref, grade, skillCode: String(skill.code), standardCode: std ? String(std.code) : null,
    passageRef: passage ? String(passage.externalRef ?? passage.id) : null,
    allowNoStandard: Boolean(input.mapNodeCode) || String(skill.code).endsWith(".curriculum-map-unclassified"),
  });
  return { item, grade, standardId: std ? String(std.id) : null, passageId: passage ? String(passage.id) : null };
}

async function typeIdFor(repo: Repo, code: string): Promise<string> {
  const t = await repo.findUnique("QuestionType", { code });
  if (t) return String(t.id);
  return String((await repo.create("QuestionType", { code, name: code.replace(/_/g, " ").toLowerCase(), isAutoScored: code !== "SHORT_ANSWER" })).id);
}

async function writeParts(tx: Repo, questionId: string, item: BankItem): Promise<void> {
  await tx.deleteMany("QuestionOption", { questionId });
  await tx.deleteMany("QuestionAnswer", { questionId });
  await tx.deleteMany("QuestionExplanation", { questionId });
  for (const [i, o] of (item.options ?? []).entries()) await tx.create("QuestionOption", { questionId, label: o.label, text: o.text, isCorrect: o.correct, rationale: o.rationale, order: i });
  for (const [i, v] of answerValues(item).entries()) await tx.create("QuestionAnswer", { questionId, value: v as object, isPrimary: i === 0 });
  await tx.create("QuestionExplanation", { questionId, kind: "WHY_CORRECT", body: [{ type: "text", text: item.explanation.whyCorrect }], order: 0 });
  if (item.explanation.tip) await tx.create("QuestionExplanation", { questionId, kind: "TIP", body: [{ type: "text", text: item.explanation.tip }], order: 1 });
}

function tagsFor(input: EditorInput, existing: unknown): Record<string, unknown> | null {
  const t: Record<string, unknown> = { ...((typeof existing === "string" ? JSON.parse(existing) : existing) ?? {}) as Record<string, unknown> };
  if (input.cognitiveLevel !== undefined) t.cognitiveLevel = input.cognitiveLevel ? text(input.cognitiveLevel, "Cognitive level", 20) : undefined;
  if (input.batch) t[input.imported ? "importJob" : "aiBatch"] = input.batch;
  for (const k of Object.keys(t)) if (t[k] === undefined) delete t[k];
  return Object.keys(t).length ? t : null;
}

// ------------------------------------------------------------- workflow

/** Dry run of the full bank validation (used by the importer's preview). Returns the problems, or []. */
export async function checkQuestion(repo: Repo, actor: Actor, input: EditorInput): Promise<string[]> {
  try {
    await toBankItem(repo, actor, input, "preview");
    return [];
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message.split(/;\s+|\n/).map((x) => x.trim()).filter(Boolean);
    throw e;
  }
}

/** The image a question points to must exist; its description is updated when given. */
async function checkedImage(repo: Repo, input: EditorInput): Promise<string | null> {
  if (!input.imageId) return null;
  const img = await repo.findUnique("QuestionImage", { id: input.imageId });
  if (!img) throw new ValidationError("The image was not found. Upload it again.");
  if (input.imageAlt !== undefined) await repo.updateMany("QuestionImage", { id: img.id }, { altText: cleanAlt(input.imageAlt) });
  return String(img.id);
}

/** Resolves the Curriculum Map place: the node to link, and the skill (Unclassified when none is given). */
async function placeOnMap(repo: Repo, actor: Actor, input: EditorInput): Promise<{ input: EditorInput; nodeId: string | null | undefined }> {
  if (input.mapNodeCode === undefined) return { input, nodeId: undefined };
  const code = String(input.mapNodeCode ?? "").trim();
  if (!code) return { input, nodeId: null };
  if (code === "?") throw new ValidationError("Finish choosing the Curriculum Map place: Grade → Unit → Text Set → Category → Level.");
  const node = (await attachmentNodes(repo, schoolOf(actor))).find((n) => n.code.toUpperCase() === code.toUpperCase());
  if (!node) throw new ValidationError(`The Curriculum Map place “${code}” does not exist or does not accept questions.`);
  if (!input.skillId) return { input: { ...input, skillId: await unclassifiedSkillId(repo, schoolOf(actor), node.grade) }, nodeId: node.id };
  const { grade } = await skillInSchool(repo, actor, input.skillId);
  if (grade !== node.grade) throw new ValidationError(`The skill is in Grade ${grade}, but the Curriculum Map place is in Grade ${node.grade}.`);
  return { input, nodeId: node.id };
}

/** A Lexile is a whole number from 0 to 2000 (“820L” is accepted); empty = none. */
export function cleanLexile(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim().replace(/l$/i, ""));
  if (!Number.isInteger(n) || n < 0 || n > 2000) throw new ValidationError(`Lexile “${v}” must be a whole number from 0 to 2000 (e.g. 820 or 820L).`);
  return n;
}

export async function createDraft(repo: Repo, actor: Actor, inputIn: EditorInput, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const placed = await placeOnMap(repo, actor, inputIn);
  const input = placed.input;
  const ref = `T${(await skillInSchool(repo, actor, input.skillId)).grade}-${randomBytes(4).toString("hex")}`;
  const passageText = input.passageText === undefined ? undefined : cleanPassage(input.passageText);
  const { item, standardId, passageId: givenPassage, grade } = await toBankItem(repo, actor, passageText === undefined ? input : { ...input, passageId: null }, ref);
  const typeId = await typeIdFor(repo, item.type);
  const id = await repo.transaction(async (tx) => {
    const passageId = passageText === undefined ? givenPassage : passageText ? await passageForText(tx, passageText, grade, actor.userId, now) : null;
    const q = await tx.create("Question", {
      externalRef: ref, skillId: input.skillId, standardId, passageId, typeId, stem: item.stem, content: contentPayload(item), hint: input.hint ? text(input.hint, "Hint", 500) : null,
      difficultyLevel: item.level, irtA: 1, irtB: item.irt.b, irtC: 0, estimatedSeconds: item.estimatedSeconds,
      status: "DRAFT", origin: input.imported ? "IMPORTED" : input.aiDrafted ? "AI_GENERATED" : "TEACHER_AUTHORED", aiStatus: input.aiDrafted && !input.imported ? "AI_GENERATED" : null,
      lessonId: input.lessonId ?? null, tags: tagsFor(input, null), imageId: input.imageId ? await checkedImage(tx, input) : null, lexile: cleanLexile(input.lexile),
      createdById: actor.userId, createdAt: now, updatedAt: now,
    });
    await writeParts(tx, String(q.id), item);
    return String(q.id);
  });
  if (placed.nodeId) await setQuestionMapNode(repo, id, placed.nodeId, actor.userId);
  if (input.uses?.length) await setQuestionUses(repo, id, input.uses);
  await audit(repo, { actorId: actor.userId, action: "question.create", entityType: "Question", entityId: id, after: { ref, skillId: input.skillId, type: item.type, level: item.level, aiDrafted: !!input.aiDrafted }, at: now });
  return id;
}

export async function updateDraft(repo: Repo, actor: Actor, id: string, inputIn: EditorInput, now = new Date()): Promise<void> {
  const q = await questionInSchool(repo, actor, id);
  await mayEditQuestion(repo, actor, q);
  const placed = await placeOnMap(repo, actor, inputIn);
  const input = placed.input;
  const passageText = input.passageText === undefined ? undefined : cleanPassage(input.passageText);
  const { item, standardId, passageId: givenPassage, grade } = await toBankItem(repo, actor, passageText === undefined ? input : { ...input, passageId: null }, String(q.externalRef ?? id));
  const byAuthor = q.createdById === actor.userId;
  // an author's change to an item under review sends it back to draft; a reviewer's fix does not
  const status = q.status === "UNDER_REVIEW" && byAuthor ? "DRAFT" : String(q.status);
  await repo.transaction(async (tx) => {
    const passageId = passageText === undefined ? givenPassage : passageText ? await passageForText(tx, passageText, grade, actor.userId, now) : null;
    await tx.updateMany("Question", { id }, {
      skillId: input.skillId, standardId, passageId, typeId: await typeIdFor(tx, item.type), stem: item.stem, content: contentPayload(item),
      hint: input.hint ? text(input.hint, "Hint", 500) : null, difficultyLevel: item.level, estimatedSeconds: item.estimatedSeconds,
      ...(q.calibrated ? {} : { irtB: item.irt.b }), status, updatedAt: now,
      ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}), tags: tagsFor(input, q.tags),
      ...(input.imageId !== undefined ? { imageId: await checkedImage(tx, input) } : {}),
      ...(input.lexile !== undefined ? { lexile: cleanLexile(input.lexile) } : {}),
    });
    await writeParts(tx, id, item);
  });
  if (input.imageId !== undefined && q.imageId && q.imageId !== (input.imageId || null)) await removeUnusedImages(repo, [String(q.imageId)]);
  if (placed.nodeId !== undefined) await setQuestionMapNode(repo, id, placed.nodeId, actor.userId);
  if (input.uses !== undefined) await setQuestionUses(repo, id, input.uses);
  await audit(repo, { actorId: actor.userId, action: q.status === "PUBLISHED" ? "question.update_published" : "question.update", entityType: "Question", entityId: id, before: { stem: q.stem, level: q.difficultyLevel, status: q.status, passageId: q.passageId ?? null }, after: { stem: item.stem, level: item.level, status, passage: passageText === undefined ? "unchanged" : passageText ? "set" : "removed" }, at: now });
}

export async function submitForReview(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const q = await questionInSchool(repo, actor, id);
  assertMayEdit(actor, q);
  if (q.status !== "DRAFT") throw new ValidationError("Only drafts can be sent for review.");
  await repo.updateMany("Question", { id }, { status: "UNDER_REVIEW", aiStatus: q.origin === "AI_GENERATED" ? "UNDER_REVIEW" : q.aiStatus ?? null, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.submit", entityType: "Question", entityId: id, before: { status: "DRAFT" }, after: { status: "UNDER_REVIEW" }, at: now });
}

export async function reviewQuestion(repo: Repo, actor: Actor, id: string, decision: "approve" | "reject", note: string | null, now = new Date()): Promise<void> {
  assertCan(actor, "questions:publish");
  const q = await questionInSchool(repo, actor, id);
  if (q.status !== "UNDER_REVIEW") throw new ValidationError("Only questions under review can be approved or sent back.");
  if (q.createdById === actor.userId && !isAdmin(actor)) throw new ForbiddenError("Another reviewer must approve your own question.");
  const n = note ? text(note, "Review note", 1000, false) : "";
  if (decision === "reject") {
    if (!n) throw new ValidationError("Say what needs to change when sending a question back.");
    await repo.updateMany("Question", { id }, { status: "DRAFT", reviewedById: actor.userId, aiStatus: q.origin === "AI_GENERATED" ? "REJECTED" : q.aiStatus ?? null, updatedAt: now });
    if (q.createdById) await repo.create("Notification", { userId: q.createdById, type: "TEACHER_FEEDBACK", title: "Question sent back for changes", body: n, link: `/admin/questions/${id}`, createdAt: now });
    await audit(repo, { actorId: actor.userId, action: "question.reject", entityType: "Question", entityId: id, before: { status: "UNDER_REVIEW" }, after: { status: "DRAFT", note: n }, at: now });
    return;
  }
  await publishChecked(repo, actor, q, now, { note: n || null });
}

/**
 * Shared publish step (single review approval and bulk publishing): validates the stored item
 * again, publishes it, archives the version it revises, and writes the audit entry.
 */
async function publishChecked(repo: Repo, actor: Actor, q: Row, now: Date, extra: { note?: string | null; bulk?: boolean }): Promise<void> {
  const id = String(q.id);
  // validate the stored item again before it can reach students
  const form = await getQuestion(repo, actor, id);
  await toBankItem(repo, actor, form.input, String(q.externalRef ?? id));
  const revisionOf = (q.tags as { revisionOf?: string } | null)?.revisionOf;
  await repo.transaction(async (tx) => {
    await tx.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId, aiStatus: q.origin === "AI_GENERATED" ? "APPROVED" : q.aiStatus ?? null, updatedAt: now });
    if (revisionOf) await tx.updateMany("Question", { id: revisionOf, status: "PUBLISHED" }, { status: "ARCHIVED", updatedAt: now });
  });
  await audit(repo, {
    actorId: actor.userId, action: "question.publish", entityType: "Question", entityId: id, before: { status: String(q.status) },
    after: { status: "PUBLISHED", note: extra.note ?? null, replaces: revisionOf ?? null, selfApproved: q.createdById === actor.userId, ...(extra.bulk ? { bulk: true } : {}) }, at: now,
  });
}

// ------------------------------------------------------------- bulk publish

/** Statuses that bulk publishing accepts (published and archived questions are never touched). */
export const PUBLISHABLE: readonly QuestionStatus[] = ["DRAFT", "UNDER_REVIEW"];
export const BULK_PUBLISH_MAX = 100;

export interface BulkPublishResult {
  published: string[];
  skipped: { id: string; stem: string; reason: string }[];
}

/**
 * Publish several questions directly (admins with questions:publish), without the review step.
 * Each question goes through the same publish step as a single approval: it is validated again,
 * and a question that fails validation is reported, not published.
 */
export async function publishQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<BulkPublishResult> {
  assertCan(actor, "questions:publish");
  const unique = [...new Set(ids)];
  if (unique.length > BULK_PUBLISH_MAX) throw new ValidationError(`Publish at most ${BULK_PUBLISH_MAX} questions at a time.`);
  const out: BulkPublishResult = { published: [], skipped: [] };
  for (const id of unique) {
    let q: Row;
    try {
      q = await questionInSchool(repo, actor, id);
    } catch {
      out.skipped.push({ id, stem: "", reason: "not found" });
      continue;
    }
    const stem = String(q.stem).slice(0, 120);
    if (!PUBLISHABLE.includes(String(q.status) as QuestionStatus)) {
      out.skipped.push({ id, stem, reason: q.status === "PUBLISHED" ? "already published" : "archived questions are never published" });
      continue;
    }
    try {
      await publishChecked(repo, actor, q, now, { bulk: true });
      out.published.push(id);
    } catch (e) {
      if (!(e instanceof ValidationError) && !(e instanceof ForbiddenError)) throw e;
      out.skipped.push({ id, stem, reason: e.message });
    }
  }
  return out;
}

/** Ids of every publishable question that matches the list filters (for “Publish All”). */
export async function publishableIds(repo: Repo, actor: Actor, filter: Parameters<typeof listQuestions>[2] = {}): Promise<string[]> {
  assertCan(actor, "questions:publish");
  const { items } = await listQuestions(repo, actor, filter);
  return items.filter((q) => PUBLISHABLE.includes(q.status)).map((q) => q.id);
}

/** Every question matching the filters that is not archived yet (“Archive All”, e.g. every Short Answer). */
export async function archivableIds(repo: Repo, actor: Actor, filter: Parameters<typeof listQuestions>[2] = {}): Promise<string[]> {
  assertCan(actor, "questions:publish");
  const { items } = await listQuestions(repo, actor, filter);
  return items.filter((q) => q.status !== "ARCHIVED").map((q) => q.id);
}

export async function archiveQuestion(repo: Repo, actor: Actor, id: string, reason: string, now = new Date()): Promise<void> {
  assertCan(actor, "questions:publish");
  const q = await questionInSchool(repo, actor, id);
  if (q.status === "ARCHIVED") return;
  const r = text(reason, "Reason", 500);
  await repo.updateMany("Question", { id }, { status: "ARCHIVED", updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.archive", entityType: "Question", entityId: id, before: { status: q.status }, after: { status: "ARCHIVED", reason: r }, at: now });
}

/** New DRAFT version of a published question; the original stays live until the revision is approved. */
export async function reviseQuestion(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const q = await questionInSchool(repo, actor, id);
  if (q.status !== "PUBLISHED") throw new ValidationError("Only published questions are revised; edit drafts directly.");
  const open = (await repo.findMany("Question", { skillId: q.skillId, status: { in: ["DRAFT", "UNDER_REVIEW"] } })).find((x) => (x.tags as { revisionOf?: string } | null)?.revisionOf === id);
  if (open) return String(open.id);
  const form = await getQuestion(repo, actor, id);
  const version = num(q.version) + 1;
  const ref = `${String(q.externalRef ?? id).replace(/\.v\d+$/, "")}.v${version}`;
  const { item, standardId, passageId } = await toBankItem(repo, actor, form.input, ref);
  const newId = await repo.transaction(async (tx) => {
    const n = await tx.create("Question", {
      externalRef: ref, skillId: q.skillId, standardId, passageId, typeId: q.typeId, stem: item.stem, content: contentPayload(item), hint: q.hint ?? null,
      difficultyLevel: item.level, irtA: q.irtA, irtB: q.irtB, irtC: q.irtC, calibrated: q.calibrated, estimatedSeconds: item.estimatedSeconds,
      tags: { ...((q.tags as Record<string, unknown> | null) ?? {}), revisionOf: id }, status: "DRAFT", origin: q.origin, aiStatus: q.aiStatus ?? null,
      version, createdById: actor.userId, createdAt: now, updatedAt: now,
    });
    await writeParts(tx, String(n.id), item);
    return String(n.id);
  });
  const kept = (await placesOf(repo, [id])).get(id)!;
  if (kept.code) { const node = (await repo.findMany("QuestionMapLink", { questionId: id }))[0]; if (node) await setQuestionMapNode(repo, newId, String(node.nodeId), actor.userId); }
  if (kept.uses.length) await setQuestionUses(repo, newId, kept.uses);
  await audit(repo, { actorId: actor.userId, action: "question.revise", entityType: "Question", entityId: newId, after: { revisionOf: id, version }, at: now });
  return newId;
}

// --------------------------------------------------------------- reading

export interface QuestionListItem {
  id: string;
  ref: string;
  stem: string;
  skill: string;
  grade: number;
  type: string;
  level: number;
  levelLabel: string;
  status: QuestionStatus;
  origin: string;
  mine: boolean;
  updatedAt: string;
  hasPassage: boolean;
  hasImage: boolean;
  /** no passage, but the wording seems to need one (warning only) */
  possibleMissingPassage: boolean;
  /** the skill (for grouping the bank by skill) */
  skillId?: string;
  /** its place on the Curriculum Map (null = Question Bank only) and Placement / MAP test uses */
  mapCode?: string | null;
  uses?: string[];
}

export interface QuestionFilter {
  /** only ReadMaster questions (they are regular bank questions with their passage) */
  readMaster?: boolean;
  status?: QuestionStatus; gradeLevel?: number; skillId?: string; q?: string; mine?: boolean; aiOnly?: boolean;
  /** only skills placed in this unit */
  unitId?: string;
  /** e.g. RL.4.1 or the full CCSS code */
  standardCode?: string;
  /** question type code, e.g. MULTIPLE_CHOICE */
  typeCode?: string;
  /** has = with a passage; none = without; missing = without, but the wording seems to need one */
  passage?: "has" | "none" | "missing";
  image?: "has" | "none";
  /** Question Bank filters: subject = the skill's domain (READING, GRAMMAR…), difficulty 1–6, source = origin */
  subject?: string;
  difficulty?: number;
  source?: string;
  /** map = on the Curriculum Map; bank = Question Bank only (not on the map) */
  onMap?: "map" | "bank";
  /** one place on the Curriculum Map (its ID, e.g. G4.U1.TS1.ACS.ON) */
  mapCode?: string;
  /** marked for Placement or MAP tests */
  use?: "PLACEMENT" | "MAP_TEST";
  /** page size (the list page uses 100) and 1-based page number */
  limit?: number;
  page?: number;
}

/**
 * The question list. Filtering, search, sorting, counting and paging happen in the database, and only
 * the columns the list shows are read. `total` is always the full number of matches. The one
 * exception is “possible missing passage”, a wording check that runs on the candidates' text.
 */
/** Curriculum Map / use filters as an id condition (one or two small queries). */
async function placeFilter(repo: Repo, schoolId: string, filter: QuestionFilter): Promise<Record<string, unknown>> {
  if (!filter.onMap && !filter.mapCode && !filter.use && !filter.readMaster) return {};
  let allow: Set<string> | null = null;
  const keep = (ids: string[]) => { const n = new Set(ids); allow = allow ? new Set([...allow].filter((x) => n.has(x))) : n; };
  if (filter.mapCode) {
    const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
    // a place and everything under it: a category's code also covers its Above / On / Below levels
    const code = filter.mapCode.trim().toUpperCase();
    const nodes = grades.length ? (await repo.findMany("CurriculumMapNode", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "code"] })).filter((n) => String(n.code) === code || String(n.code).startsWith(`${code}.`)) : [];
    keep(nodes.length ? (await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId"] })).map((l) => String(l.questionId)) : []);
  }
  if (filter.readMaster) keep((await repo.findMany("ReadMasterQuestion", {}, { select: ["questionId"] })).map((u) => String(u.questionId)));
  if (filter.use) keep((await repo.findMany("QuestionUse", { use: filter.use }, { select: ["questionId"] })).map((u) => String(u.questionId)));
  const linked = filter.onMap ? (await repo.findMany("QuestionMapLink", {}, { select: ["questionId"] })).map((l) => String(l.questionId)) : [];
  if (filter.onMap === "map") keep(linked);
  if (filter.onMap === "bank") {
    if (allow) { const off = new Set(linked); return { id: { in: [...(allow as Set<string>)].filter((x) => !off.has(x)) } }; }
    return { id: { notIn: linked } };
  }
  return { id: { in: [...(allow ?? new Set<string>())] } };
}

export async function listQuestions(repo: Repo, actor: Actor, filter: QuestionFilter = {}): Promise<{ items: QuestionListItem[]; total: number; counts: Record<QuestionStatus, number>; aiPending: number }> {
  assertCan(actor, "questions:read");
  const schoolId = schoolOf(actor);
  const grades = (await repo.findMany("Grade", { schoolId })).filter((g) => !filter.gradeLevel || num(g.level) === filter.gradeLevel);
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
  const skills = curricula.length ? await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } }, { select: ["id", "name", "curriculumId", "domain"] }) : [];
  let skillIds = filter.skillId ? skills.filter((s) => s.id === filter.skillId).map((s) => s.id) : skills.map((s) => s.id);
  if (filter.subject) skillIds = skillIds.filter((id) => String(skills.find((k) => k.id === id)?.domain) === filter.subject);
  if (filter.unitId) {
    const inUnit = new Set((await repo.findMany("UnitSkill", { unitId: filter.unitId }, { select: ["skillId"] })).map((x) => String(x.skillId)));
    skillIds = skillIds.filter((id) => inUnit.has(String(id)));
  }
  const empty = { items: [], total: 0, counts: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<QuestionStatus, number>, aiPending: 0 };
  if (!skillIds.length) return empty;

  const base = { skillId: { in: skillIds }, deletedAt: null };
  const [standardIds, typeIds] = await Promise.all([
    filter.standardCode ? repo.findMany("Standard", {}, { select: ["id", "code"] }).then((all) => {
      const want = filter.standardCode!.trim().replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase();
      return all.filter((x) => String(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase() === want).map((x) => x.id);
    }) : Promise.resolve(null),
    filter.typeCode ? repo.findMany("QuestionType", { code: filter.typeCode }, { select: ["id"] }).then((r) => r.map((x) => x.id)) : Promise.resolve(null),
  ]);
  if ((standardIds && !standardIds.length) || (typeIds && !typeIds.length)) {
    const counts = Object.fromEntries(await Promise.all(STATUSES.map(async (st) => [st, await repo.count("Question", { ...base, status: st })]))) as Record<QuestionStatus, number>;
    return { ...empty, counts };
  }
  const where = {
    ...base,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.mine ? { createdById: actor.userId } : {}),
    ...(filter.source ? { origin: filter.source } : filter.aiOnly ? { origin: "AI_GENERATED" } : {}),
    ...(filter.difficulty ? { difficultyLevel: filter.difficulty } : {}),
    ...(await placeFilter(repo, schoolId, filter)),
    ...(standardIds ? { standardId: { in: standardIds } } : {}),
    ...(typeIds ? { typeId: { in: typeIds } } : {}),
    ...(filter.passage === "has" ? { passageId: { not: null } } : filter.passage ? { passageId: null } : {}),
    ...(filter.image === "has" ? { imageId: { not: null } } : filter.image === "none" ? { imageId: null } : {}),
  };
  const needle = (filter.q ?? "").trim();
  const limit = filter.limit, page = Math.max(1, Math.floor(filter.page ?? 1));
  const COLS = ["id", "externalRef", "stem", "skillId", "typeId", "difficultyLevel", "status", "origin", "createdById", "updatedAt", "passageId", "imageId"];
  const ORDER = [{ field: "updatedAt", dir: "desc" as const }, { field: "id", dir: "asc" as const }];
  const read = (w: Record<string, unknown>, take?: number, skip?: number) => repo.findMany("Question", w, { select: COLS, orderBy: ORDER, ...(take !== undefined ? { take } : {}), ...(skip ? { skip } : {}) });
  // in JavaScript only when needed: text search (two fields) and the wording check
  const inMemory = Boolean(needle) || filter.passage === "missing";
  const [statusCounts, aiPending, types, rows, total] = await Promise.all([
    Promise.all(STATUSES.map((st) => repo.count("Question", { ...base, status: st }))),
    repo.count("Question", { ...base, origin: "AI_GENERATED", status: { in: ["DRAFT", "UNDER_REVIEW"] } }),
    repo.findMany("QuestionType", {}, { select: ["id", "code"] }),
    inMemory
      ? (needle
          ? (() => {
              // the text also matches skill names: “main idea” finds every question of “Central Idea / Main Idea” skills
              const lower = needle.toLowerCase();
              const named = skills.filter((k) => String(k.name).toLowerCase().includes(lower) && skillIds.includes(k.id)).map((k) => k.id);
              return Promise.all([
                read({ ...where, stem: { contains: needle } }), read({ ...where, externalRef: { contains: needle } }),
                named.length ? read({ ...where, skillId: { in: named } }) : Promise.resolve([] as Row[]),
              ]).then((lists) => {
                const seen = new Set<unknown>();
                return lists.flat().filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
              });
            })()
          : read(where)).then((r) => (filter.passage === "missing" ? r.filter((q) => needsPassage(String(q.stem))) : r))
      : limit === 0 ? Promise.resolve([] as Row[]) : read(where, limit, limit ? (page - 1) * limit : undefined),
    inMemory || limit === undefined ? Promise.resolve(-1) : repo.count("Question", where),
  ]);
  const counts = Object.fromEntries(STATUSES.map((st, i) => [st, statusCounts[i]])) as Record<QuestionStatus, number>;
  const skillById = new Map(skills.map((x) => [String(x.id), x]));
  const gradeOfCurriculum = new Map(curricula.map((c) => [String(c.id), num(grades.find((g) => g.id === c.gradeId)?.level)]));
  const typeCode = new Map(types.map((t) => [String(t.id), String(t.code)]));
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();
  const all = rows
    .map((q) => {
      const sk = skillById.get(String(q.skillId));
      const hasPassage = Boolean(q.passageId);
      return {
        id: String(q.id), ref: String(q.externalRef ?? ""), stem: String(q.stem).slice(0, 160), skill: String(sk?.name ?? ""), skillId: String(q.skillId), grade: num(sk ? gradeOfCurriculum.get(String(sk.curriculumId)) : 0),
        type: typeCode.get(String(q.typeId)) ?? "", level: num(q.difficultyLevel), levelLabel: LEVEL_LABELS[num(q.difficultyLevel)] ?? "",
        status: String(q.status) as QuestionStatus, origin: String(q.origin), mine: q.createdById === actor.userId,
        updatedAt: iso(q.updatedAt), hasPassage, hasImage: Boolean(q.imageId), possibleMissingPassage: possibleMissingPassage(String(q.stem), hasPassage),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const items: QuestionListItem[] = inMemory && limit !== undefined ? all.slice((page - 1) * limit, (page - 1) * limit + limit) : all;
  // map places and uses (one query each), so every list item has the same shape
  const places = await placesOf(repo, items.map((x) => x.id));
  for (const it of items) { const p = places.get(it.id); it.mapCode = p?.code ?? null; it.uses = p?.uses ?? []; }
  return { items, total: total >= 0 ? total : all.length, counts, aiPending };
}

export interface QuestionDetail {
  id: string;
  ref: string;
  status: QuestionStatus;
  origin: string;
  version: number;
  mine: boolean;
  canEdit: boolean;
  canReview: boolean;
  /** May approve or reject this AI-drafted question (teachers and admins with questions:review). */
  canReviewAi: boolean;
  revisionOf: string | null;
  input: EditorInput;
  history: { at: string; action: string; by: string; note: string | null }[];
}

export async function getQuestion(repo: Repo, actor: Actor, id: string): Promise<QuestionDetail> {
  assertCan(actor, "questions:read");
  const q = await questionInSchool(repo, actor, id);
  const [type, options, answers, expl, std, logs] = await Promise.all([
    repo.findUnique("QuestionType", { id: q.typeId }),
    repo.findMany("QuestionOption", { questionId: id }),
    repo.findMany("QuestionAnswer", { questionId: id }),
    repo.findMany("QuestionExplanation", { questionId: id }),
    q.standardId ? repo.findUnique("Standard", { id: q.standardId }) : Promise.resolve(null),
    repo.findMany("AuditLog", { entityType: "Question", entityId: id }),
  ]);
  const code = String(type?.code) as QuestionTypeCode;
  const content = (typeof q.content === "string" ? JSON.parse(q.content) : q.content ?? {}) as Record<string, unknown>;
  const val = (a: Row) => (typeof a.value === "string" ? (() => { try { return JSON.parse(a.value as string); } catch { return a.value; } })() : a.value);
  const primary = answers.find((a) => a.isPrimary) ?? answers[0];
  const explText = (kind: string) => {
    const e = expl.find((x) => x.kind === kind);
    const body = (typeof e?.body === "string" ? JSON.parse(e.body) : e?.body) as { text?: string }[] | undefined;
    return body?.map((b) => b.text ?? "").join(" ") ?? "";
  };
  const passageRow = q.passageId ? await repo.findUnique("ReadingPassage", { id: q.passageId }) : null;
  const imageRow = q.imageId ? (await repo.findMany("QuestionImage", { id: q.imageId }, { select: ["id", "altText"] }))[0] : null;
  const input: EditorInput = {
    skillId: String(q.skillId), type: code, stem: String(q.stem), level: num(q.difficultyLevel), standardCode: std ? String(std.code) : null,
    passageId: q.passageId ? String(q.passageId) : null, passageText: passageRow ? String(passageRow.body) : "", imageId: imageRow ? String(imageRow.id) : null, imageAlt: imageRow?.altText ? String(imageRow.altText) : "", hint: q.hint ? String(q.hint) : null,
    whyCorrect: explText("WHY_CORRECT"), tip: explText("TIP") || null, estimatedSeconds: num(q.estimatedSeconds),
    aiDrafted: q.origin === "AI_GENERATED",
    lessonId: q.lessonId ? String(q.lessonId) : null,
    cognitiveLevel: ((typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags) as { cognitiveLevel?: string } | null)?.cognitiveLevel ?? null,
  };
  if (options.length) input.options = options.sort((a, b) => num(a.order) - num(b.order)).map((o) => ({ label: String(o.label), text: String(o.text), correct: Boolean(o.isCorrect), rationale: o.rationale ? String(o.rationale) : null }));
  if (code === "TRUE_FALSE" && primary) input.answer = Boolean(val(primary));
  if (code === "FILL_BLANK") input.answers = answers.map((a) => String(val(a)));
  if ((code === "SENTENCE_ORDER" || code === "WORD_ORDER") && primary) input.sequence = (val(primary) as string[]) ?? (content.elements as string[]);
  if (code === "ERROR_CORRECTION" && primary) {
    const v = val(primary) as { errorIndex: number; correction: string };
    input.segments = content.segments as string[];
    input.errorIndex = v.errorIndex;
    input.correction = v.correction;
  }
  // its Curriculum Map place and Placement / MAP test uses
  const place = (await placesOf(repo, [String(q.id)])).get(String(q.id))!;
  input.mapNodeCode = place.code;
  input.uses = place.uses;
  input.lexile = q.lexile === null || q.lexile === undefined ? null : Number(q.lexile);
  if (code === "MATCHING" && primary) input.pairs = val(primary) as { left: string; right: string }[];
  const users = logs.length ? await repo.findMany("User", { id: { in: [...new Set(logs.map((l) => l.actorId).filter(Boolean))] } }, { select: ["id", "displayName"] }) : [];
  const after = (l: Row) => (typeof l.after === "string" ? JSON.parse(l.after) : l.after ?? {}) as { note?: string; reason?: string };
  const editable = await mayEditQuestion(repo, actor, q).then(() => true, () => false);
  return {
    id, ref: String(q.externalRef ?? ""), status: String(q.status) as QuestionStatus, origin: String(q.origin), version: num(q.version), mine: q.createdById === actor.userId,
    canEdit: editable, canReview: q.status === "UNDER_REVIEW" && can(actor, "questions:publish") && (q.createdById !== actor.userId || isAdmin(actor)),
    canReviewAi: q.origin === "AI_GENERATED" && (q.status === "DRAFT" || q.status === "UNDER_REVIEW") && can(actor, "questions:review") && (q.createdById !== actor.userId || isAdmin(actor)),
    revisionOf: (q.tags as { revisionOf?: string } | null)?.revisionOf ?? null, input,
    history: logs
      .map((l) => ({ at: (l.createdAt instanceof Date ? l.createdAt : new Date(String(l.createdAt))).toISOString(), action: String(l.action), by: String(users.find((u) => u.id === l.actorId)?.displayName ?? ""), note: after(l).note ?? after(l).reason ?? null }))
      .sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export { LEVEL_LABELS, QUESTION_TYPES };

// ------------------------------------------------------ AI-drafted questions

/**
 * Approve an AI-drafted question: it is validated again, then PUBLISHED, which is the only
 * status the adaptive engine (practice and placement) ever reads. Teachers and admins with
 * questions:review may approve; nobody but a school admin may approve a batch they requested.
 */
export async function approveAiDraft(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  assertCan(actor, "questions:review");
  const q = await questionInSchool(repo, actor, id);
  if (q.origin !== "AI_GENERATED") throw new ValidationError("Only AI-drafted questions are approved here; other questions use the normal review.");
  if (q.status !== "DRAFT" && q.status !== "UNDER_REVIEW") throw new ValidationError("This question has already been reviewed.");
  if (q.createdById === actor.userId && !isAdmin(actor)) throw new ForbiddenError("Another reviewer must approve questions you requested.");
  const form = await getQuestion(repo, actor, id);
  await toBankItem(repo, actor, form.input, String(q.externalRef ?? id));
  await repo.updateMany("Question", { id }, { status: "PUBLISHED", aiStatus: "APPROVED", publishedAt: now, reviewedById: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.ai.approve", entityType: "Question", entityId: id, before: { status: q.status }, after: { status: "PUBLISHED" }, at: now });
}

/** Reject an AI-drafted question (a reason is required). It is archived and never reaches students. */
export async function rejectAiDraft(repo: Repo, actor: Actor, id: string, reason: string, now = new Date()): Promise<void> {
  assertCan(actor, "questions:review");
  const q = await questionInSchool(repo, actor, id);
  if (q.origin !== "AI_GENERATED") throw new ValidationError("Only AI-drafted questions are rejected here.");
  if (q.status !== "DRAFT" && q.status !== "UNDER_REVIEW") throw new ValidationError("This question has already been reviewed.");
  const r = text(reason, "Reason", 500);
  await repo.updateMany("Question", { id }, { status: "ARCHIVED", aiStatus: "REJECTED", reviewedById: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.ai.reject", entityType: "Question", entityId: id, before: { status: q.status }, after: { status: "ARCHIVED", reason: r }, at: now });
}

