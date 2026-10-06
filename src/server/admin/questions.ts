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

export type QuestionStatus = "DRAFT" | "UNDER_REVIEW" | "PUBLISHED" | "ARCHIVED";
export const STATUSES: readonly QuestionStatus[] = ["DRAFT", "UNDER_REVIEW", "PUBLISHED", "ARCHIVED"];

export interface EditorInput {
  skillId: string;
  type: QuestionTypeCode;
  stem: string;
  level: number;
  standardCode?: string | null;
  passageId?: string | null;
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

function assertMayEdit(actor: Actor, q: Row) {
  assertCan(actor, "questions:edit");
  if (q.status === "PUBLISHED" || q.status === "ARCHIVED") throw new ValidationError("Published and archived questions cannot be edited. Use “Revise” to make a new version.");
  if (q.createdById !== actor.userId && !can(actor, "questions:publish") && !isAdmin(actor)) throw new ForbiddenError("You can edit only your own drafts.");
}

// ------------------------------------------------------------ validation

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
  const item: BankItem = {
    ref, grade, family: "", skillKey: String(skill.code), standard: std ? String(std.code) : standardCode || "(none)",
    level: Math.round(num(input.level)), type: input.type,
    stem: text(input.stem, "Question", 2000), passage: passage ? String(passage.externalRef ?? passage.id) : null, subskill: null,
    explanation: { whyCorrect: text(input.whyCorrect, "Explanation", 1000), tip: text(input.tip, "Tip", 500, false) },
    estimatedSeconds: Math.min(600, Math.max(10, Math.round(num(input.estimatedSeconds ?? 45)))),
    irt: { a: 1, b: LEVEL_TO_B[Math.round(num(input.level))] ?? 0, c: 0 },
    options: input.options?.map((o, i) => ({ label: o.label?.trim() || "ABCDEFGH"[i], text: text(o.text, `Option ${i + 1}`, 500), correct: Boolean(o.correct), rationale: o.rationale ? text(o.rationale, `Feedback for option ${i + 1}`, 500) : null })),
    answer: input.answer, answers: input.answers?.map((a) => text(a, "Accepted answer", 200)).filter(Boolean),
    sequence: input.sequence?.map((s) => text(s, "Item", 300)), segments: input.segments?.map((s) => text(s, "Segment", 300)),
    errorIndex: input.errorIndex === undefined ? undefined : num(input.errorIndex), correction: input.correction ? text(input.correction, "Correction", 300) : undefined,
    pairs: input.pairs?.map((p) => ({ left: text(p.left, "Left", 200), right: text(p.right, "Right", 200) })),
  };
  const passages = new Set(item.passage ? [item.passage] : []);
  const issues = validateItem(item, { skillKeys: new Set([item.skillKey]), standards: new Set(std ? [String(std.code)] : []), passages });
  if (issues.length) throw new ValidationError(issues.map((i) => i.message.replace(/^unknown standard.*/, "Choose the standard this question assesses.")).join("; "));
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

// ------------------------------------------------------------- workflow

export async function createDraft(repo: Repo, actor: Actor, input: EditorInput, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const ref = `T${(await skillInSchool(repo, actor, input.skillId)).grade}-${randomBytes(4).toString("hex")}`;
  const { item, standardId, passageId } = await toBankItem(repo, actor, input, ref);
  const typeId = await typeIdFor(repo, item.type);
  const id = await repo.transaction(async (tx) => {
    const q = await tx.create("Question", {
      externalRef: ref, skillId: input.skillId, standardId, passageId, typeId, stem: item.stem, content: contentPayload(item), hint: input.hint ? text(input.hint, "Hint", 500) : null,
      difficultyLevel: item.level, irtA: 1, irtB: item.irt.b, irtC: 0, estimatedSeconds: item.estimatedSeconds,
      status: "DRAFT", origin: input.aiDrafted ? "AI_GENERATED" : "TEACHER_AUTHORED", aiStatus: input.aiDrafted ? "AI_GENERATED" : null,
      createdById: actor.userId, createdAt: now, updatedAt: now,
    });
    await writeParts(tx, String(q.id), item);
    return String(q.id);
  });
  await audit(repo, { actorId: actor.userId, action: "question.create", entityType: "Question", entityId: id, after: { ref, skillId: input.skillId, type: item.type, level: item.level, aiDrafted: !!input.aiDrafted }, at: now });
  return id;
}

export async function updateDraft(repo: Repo, actor: Actor, id: string, input: EditorInput, now = new Date()): Promise<void> {
  const q = await questionInSchool(repo, actor, id);
  assertMayEdit(actor, q);
  const { item, standardId, passageId } = await toBankItem(repo, actor, input, String(q.externalRef ?? id));
  const byAuthor = q.createdById === actor.userId;
  // an author's change to an item under review sends it back to draft; a reviewer's fix does not
  const status = q.status === "UNDER_REVIEW" && byAuthor ? "DRAFT" : String(q.status);
  await repo.transaction(async (tx) => {
    await tx.updateMany("Question", { id }, {
      skillId: input.skillId, standardId, passageId, typeId: await typeIdFor(tx, item.type), stem: item.stem, content: contentPayload(item),
      hint: input.hint ? text(input.hint, "Hint", 500) : null, difficultyLevel: item.level, estimatedSeconds: item.estimatedSeconds,
      ...(q.calibrated ? {} : { irtB: item.irt.b }), status, updatedAt: now,
    });
    await writeParts(tx, id, item);
  });
  await audit(repo, { actorId: actor.userId, action: "question.update", entityType: "Question", entityId: id, before: { stem: q.stem, level: q.difficultyLevel, status: q.status }, after: { stem: item.stem, level: item.level, status }, at: now });
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
  // validate the stored item again before it can reach students
  const form = await getQuestion(repo, actor, id);
  await toBankItem(repo, actor, form.input, String(q.externalRef ?? id));
  const revisionOf = (q.tags as { revisionOf?: string } | null)?.revisionOf;
  await repo.transaction(async (tx) => {
    await tx.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId, aiStatus: q.origin === "AI_GENERATED" ? "APPROVED" : q.aiStatus ?? null, updatedAt: now });
    if (revisionOf) await tx.updateMany("Question", { id: revisionOf, status: "PUBLISHED" }, { status: "ARCHIVED", updatedAt: now });
  });
  await audit(repo, { actorId: actor.userId, action: "question.publish", entityType: "Question", entityId: id, before: { status: "UNDER_REVIEW" }, after: { status: "PUBLISHED", note: n || null, replaces: revisionOf ?? null, selfApproved: q.createdById === actor.userId }, at: now });
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
}

export async function listQuestions(repo: Repo, actor: Actor, filter: { status?: QuestionStatus; gradeLevel?: number; skillId?: string; q?: string; mine?: boolean } = {}): Promise<{ items: QuestionListItem[]; counts: Record<QuestionStatus, number> }> {
  assertCan(actor, "questions:read");
  const schoolId = schoolOf(actor);
  const grades = (await repo.findMany("Grade", { schoolId })).filter((g) => !filter.gradeLevel || num(g.level) === filter.gradeLevel);
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
  const skills = curricula.length ? await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } }) : [];
  const skillIds = filter.skillId ? skills.filter((s) => s.id === filter.skillId).map((s) => s.id) : skills.map((s) => s.id);
  const all = skillIds.length ? (await repo.findMany("Question", { skillId: { in: skillIds } })).filter((q) => !q.deletedAt) : [];
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((q) => q.status === s).length])) as Record<QuestionStatus, number>;
  const types = await repo.findMany("QuestionType", {});
  const needle = (filter.q ?? "").trim().toLowerCase();
  const gradeOfSkill = (sid: unknown) => {
    const s = skills.find((x) => x.id === sid);
    const c = curricula.find((x) => x.id === s?.curriculumId);
    return num(grades.find((g) => g.id === c?.gradeId)?.level);
  };
  const items = all
    .filter((q) => (!filter.status || q.status === filter.status) && (!filter.mine || q.createdById === actor.userId))
    .filter((q) => !needle || [q.stem, q.externalRef].some((v) => String(v ?? "").toLowerCase().includes(needle)))
    .map((q) => ({
      id: String(q.id), ref: String(q.externalRef ?? ""), stem: String(q.stem).slice(0, 160), skill: String(skills.find((s) => s.id === q.skillId)?.name ?? ""), grade: gradeOfSkill(q.skillId),
      type: String(types.find((t) => t.id === q.typeId)?.code ?? ""), level: num(q.difficultyLevel), levelLabel: LEVEL_LABELS[num(q.difficultyLevel)] ?? "",
      status: String(q.status) as QuestionStatus, origin: String(q.origin), mine: q.createdById === actor.userId,
      updatedAt: (q.updatedAt instanceof Date ? q.updatedAt : new Date(String(q.updatedAt))).toISOString(),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items, counts };
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
  const input: EditorInput = {
    skillId: String(q.skillId), type: code, stem: String(q.stem), level: num(q.difficultyLevel), standardCode: std ? String(std.code) : null,
    passageId: q.passageId ? String(q.passageId) : null, hint: q.hint ? String(q.hint) : null,
    whyCorrect: explText("WHY_CORRECT"), tip: explText("TIP") || null, estimatedSeconds: num(q.estimatedSeconds),
    aiDrafted: q.origin === "AI_GENERATED",
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
  if (code === "MATCHING" && primary) input.pairs = val(primary) as { left: string; right: string }[];
  const users = logs.length ? await repo.findMany("User", { id: { in: [...new Set(logs.map((l) => l.actorId).filter(Boolean))] } }) : [];
  const after = (l: Row) => (typeof l.after === "string" ? JSON.parse(l.after) : l.after ?? {}) as { note?: string; reason?: string };
  const editable = (() => {
    try { assertMayEdit(actor, q); return true; } catch { return false; }
  })();
  return {
    id, ref: String(q.externalRef ?? ""), status: String(q.status) as QuestionStatus, origin: String(q.origin), version: num(q.version), mine: q.createdById === actor.userId,
    canEdit: editable, canReview: q.status === "UNDER_REVIEW" && can(actor, "questions:publish") && (q.createdById !== actor.userId || isAdmin(actor)),
    revisionOf: (q.tags as { revisionOf?: string } | null)?.revisionOf ?? null, input,
    history: logs
      .map((l) => ({ at: (l.createdAt instanceof Date ? l.createdAt : new Date(String(l.createdAt))).toISOString(), action: String(l.action), by: String(users.find((u) => u.id === l.actorId)?.displayName ?? ""), note: after(l).note ?? after(l).reason ?? null }))
      .sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export { LEVEL_LABELS, QUESTION_TYPES };
