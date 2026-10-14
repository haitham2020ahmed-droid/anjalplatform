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
import { answerValues, contentPayload, QUESTION_TYPES, storedParts, validateItem, type BankItem, type BankOption, type Combine, type Dictation, type Grid, type HotText, type QuestionTypeCode, type TwoPart } from "../../imports/questions/validate";
import { audit } from "../audit";
import { assertCan, can, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { schoolOf } from "./users";
import { cleanPassage, passageForText } from "./passages";
import { needsPassage, possibleMissingPassage } from "../../lib/passage-detect";
import { cleanAlt, removeUnusedImages } from "./question-images";
import { attachmentNodes, placesOf, setQuestionMapNode, setQuestionUses, unclassifiedSkillId, type QuestionUseKind } from "../curriculum-map/questions";
import { hashOfItem } from "../questions/dedupe-hash";

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
  /** ERROR_CORRECTION, newer form: several errors (one correction each), a “No error” choice, a typed fix, the kind of mistake */
  errorIndexes?: number[];
  corrections?: string[];
  noErrorOption?: boolean;
  typeCorrection?: boolean;
  errorKind?: string | null;
  /** TWO_PART (Part A / Part B), GRID (table match), HOT_TEXT (select sentences) */
  twoPart?: TwoPart;
  grid?: Grid;
  hotText?: HotText;
  /** DICTATION: the word the player says (and an optional sentence that uses it) */
  dictation?: Dictation;
  /** SENTENCE_COMBINE: the short sentences, the joining word, a hint and the accepted combined sentences */
  combine?: Combine;
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
  /** NWEA MAP: the test and the instructional area given by the import file or set by an admin (else automatic). */
  mapTest?: string | null;
  mapArea?: string | null;
  /** extra columns of an import file (kept in tags): Depth of Knowledge, domain, passage title */
  dok?: string | null;
  domain?: string | null;
  passageTitle?: string | null;
  /** fields the import could not fill: the platform's AI completes them after saving (answer, explanation, skill, standard, grade) */
  aiNeeds?: string[];
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
/** A question's tags as an object (stored as JSON; older rows may hold a string). */
const tagsOf = (v: unknown): Record<string, unknown> => {
  if (!v) return {};
  if (typeof v === "string") { try { return (JSON.parse(v) ?? {}) as Record<string, unknown>; } catch { return {}; } }
  return v as Record<string, unknown>;
};

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
    ...newTypeFields(input),
  };
  const passages = new Set(item.passage ? [item.passage] : []);
  const noStandardOk = !ctx.standardCode && ctx.allowNoStandard;
  const issues = validateItem(item, { skillKeys: new Set([item.skillKey]), standards: new Set(ctx.standardCode ? [ctx.standardCode] : noStandardOk ? [item.standard] : []), passages });
  if (issues.length) throw new ValidationError(issues.map((i) => i.message.replace(/^unknown standard.*/, "Choose the standard this question assesses.")).join("; "));
  return item;
}

const shortId = (v: unknown, fallback: string) => String(v ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || fallback;

/** The fields of the newer types (and of the upgraded error correction), cleaned: only those of the chosen type. */
function newTypeFields(input: EditorInput): Partial<BankItem> {
  const opt = (o: Partial<BankOption> | undefined, i: number, part: string): BankOption => ({
    label: String(o?.label ?? "").trim().slice(0, 4) || "ABCDEFGH"[i], text: text(o?.text, `${part} option ${i + 1}`, 500), correct: Boolean(o?.correct),
    rationale: o?.rationale ? text(o.rationale, `${part} feedback for option ${i + 1}`, 500) : null, ...(o?.misconception ? { misconception: String(o.misconception).slice(0, 40) } : {}),
  });
  switch (input.type) {
    case "ERROR_CORRECTION": {
      const out: Partial<BankItem> = {};
      if (Array.isArray(input.errorIndexes)) {
        out.errorIndexes = input.errorIndexes.slice(0, 20).map((x) => Math.round(num(x)));
        out.corrections = (input.corrections ?? []).slice(0, 20).map((c) => text(c, "Correction", 300, false));
        // the old fields follow the first error (older readers of the item keep working)
        out.errorIndex = out.errorIndexes[0];
        out.correction = out.corrections[0] || undefined;
      }
      if (input.noErrorOption) out.noErrorOption = true;
      if (input.typeCorrection) out.typeCorrection = true;
      if (input.errorKind) out.errorKind = String(input.errorKind).trim().slice(0, 40);
      return out;
    }
    case "TWO_PART": {
      const tp = input.twoPart;
      if (!tp) return {};
      return { options: undefined, twoPart: {
        partA: { stem: text(tp.partA?.stem, "Part A question", 1000), options: (tp.partA?.options ?? []).slice(0, 8).map((o, i) => opt(o, i, "Part A")) },
        partB: { stem: text(tp.partB?.stem, "Part B question", 1000), options: (tp.partB?.options ?? []).slice(0, 8).map((o, i) => opt(o, i, "Part B")), multiple: Boolean(tp.partB?.multiple) },
      } };
    }
    case "GRID": {
      const g = input.grid;
      if (!g) return {};
      const rows = (g.rows ?? []).slice(0, 12).map((r, i) => ({ id: shortId(r?.id, `r${i + 1}`), text: text(r?.text, `Row ${i + 1}`, 300) }));
      const columns = (g.columns ?? []).slice(0, 6).map((c, i) => ({ id: shortId(c?.id, `c${i + 1}`), text: text(c?.text, `Column ${i + 1}`, 120) }));
      const answer = Object.fromEntries(Object.entries(g.answer ?? {}).filter(([, v]) => v).map(([k, v]) => [shortId(k, k), shortId(v, String(v))]));
      return { grid: { rows, columns, answer } };
    }
    case "HOT_TEXT": {
      const h = input.hotText;
      if (!h) return {};
      const segments = (h.segments ?? []).slice(0, 20).map((x, i) => ({ id: shortId(x?.id, `s${i + 1}`), text: text(x?.text, `Sentence ${i + 1}`, 500) }));
      const correct = [...new Set((h.correct ?? []).map((c) => shortId(c, String(c))))];
      return { hotText: { segments, correct, maxSelect: Math.round(num(h.maxSelect || correct.length)) } };
    }
    case "DICTATION": {
      const d = input.dictation;
      if (!d) return {};
      return { options: undefined, dictation: { word: text(d.word, "Dictation word", 40), sentence: text(d.sentence, "Dictation sentence", 300, false) || null } };
    }
    case "SENTENCE_COMBINE": {
      const c = input.combine;
      if (!c) return {};
      return { options: undefined, combine: {
        sentences: (c.sentences ?? []).slice(0, 6).map((x, i) => text(x, `Sentence ${i + 1}`, 300, false)).filter(Boolean),
        connector: text(c.connector, "Joining word", 30, false) || null, hint: text(c.hint, "Hint", 300, false) || null,
        accepted: (c.accepted ?? []).slice(0, 10).map((x, i) => text(x, `Accepted answer ${i + 1}`, 400, false)).filter(Boolean),
      } };
    }
    default:
      return {};
  }
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

/** The options / answers / explanations of a question (replaced). `fresh`: a question just created has none to clear. */
async function writeParts(tx: Repo, questionId: string, item: BankItem, fresh = false): Promise<void> {
  if (!fresh) {
    await tx.deleteMany("QuestionOption", { questionId });
    await tx.deleteMany("QuestionAnswer", { questionId });
    await tx.deleteMany("QuestionExplanation", { questionId });
  }
  // one insert per table (was one per row)
  const options = (item.options ?? []).map((o, i) => ({ questionId, label: o.label, text: o.text, isCorrect: o.correct, rationale: o.rationale, order: i }));
  if (options.length) await tx.createMany("QuestionOption", options);
  const answers = answerValues(item).map((v, i) => ({ questionId, value: v as object, isPrimary: i === 0 }));
  if (answers.length) await tx.createMany("QuestionAnswer", answers);
  await tx.createMany("QuestionExplanation", [
    { questionId, kind: "WHY_CORRECT", body: [{ type: "text", text: item.explanation.whyCorrect }], order: 0 },
    ...(item.explanation.tip ? [{ questionId, kind: "TIP", body: [{ type: "text", text: item.explanation.tip }], order: 1 }] : []),
  ]);
}

function tagsFor(input: EditorInput, existing: unknown): Record<string, unknown> | null {
  const t: Record<string, unknown> = { ...((typeof existing === "string" ? JSON.parse(existing) : existing) ?? {}) as Record<string, unknown> };
  if (input.cognitiveLevel !== undefined) t.cognitiveLevel = input.cognitiveLevel ? text(input.cognitiveLevel, "Cognitive level", 20) : undefined;
  if (input.batch) t[input.imported ? "importJob" : "aiBatch"] = input.batch;
  if (input.dok) t.dok = String(input.dok).slice(0, 20);
  if (input.domain) t.domain = String(input.domain).slice(0, 80);
  if (input.passageTitle) t.passageTitle = String(input.passageTitle).slice(0, 190);
  if (input.aiNeeds?.length) t.aiNeeds = input.aiNeeds;
  for (const k of Object.keys(t)) if (t[k] === undefined) delete t[k];
  return Object.keys(t).length ? t : null;
}

/**
 * 🧭 NWEA MAP area: the one the import file or the admin gave (kept), else decided automatically from the standard,
 * the skill and the wording (and a clearly wrong standard is fixed). See map/question-areas.ts.
 */
export async function saveMapArea(repo: Repo, schoolId: string, ids: string[], input: Pick<EditorInput, "mapArea" | "mapTest" | "imported">, now = new Date()): Promise<void> {
  const { areaFromName, areaByKey, testFromName } = await import("../map/nwea-area");
  const key = input.mapArea !== undefined ? areaFromName(input.mapArea) : null;
  if (key && (!input.mapTest || testFromName(input.mapTest) === areaByKey(key).test)) {
    await repo.updateMany("Question", { id: { in: ids } }, { mapTest: areaByKey(key).test, mapInstructionalArea: areaByKey(key).name, mapAreaSource: input.imported ? "IMPORT" : "ADMIN" });
  } else if (input.mapArea === null || (input.mapArea !== undefined && !key)) {
    // cleared in the editor: back to the automatic area
    await repo.updateMany("Question", { id: { in: ids }, mapAreaSource: { in: ["ADMIN", "IMPORT"] } }, { mapAreaSource: null });
  }
  const { autoClassify } = await import("../map/question-areas");
  await autoClassify(repo, schoolId, ids, now);
  // 🧭 a Curriculum-Map question saved without a skill gets its real skill from the map place (Update 39C)
  { const { remapNewQuestions } = await import("../curriculum-map/remap-skills"); await remapNewQuestions(repo, schoolId, ids, null, now).catch(() => 0); }
  { const { tagOptions } = await import("../insights/misconception-tags"); await tagOptions(repo, { questionIds: ids }).catch(() => 0); }
  // 🧠 the edited questions are analysed again (DOK, difficulty estimate, text level); a person's values are kept
  { const { analyzeQuestions } = await import("../questions/intelligence"); await analyzeQuestions(repo, schoolId, { questionIds: ids }, now).catch(() => null); }
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

/** 👯 The content fingerprint of the item as it is saved (dedupe-hash.ts): the passage TEXT counts, not its id. */
async function hashForSave(repo: Repo, item: BankItem, passageText: string | null | undefined, passageId: string | null, imageId: string | null): Promise<string> {
  const body = passageText !== undefined ? passageText || null : passageId ? String((await repo.findMany("ReadingPassage", { id: passageId }, { select: ["body"] }))[0]?.body ?? "") || null : null;
  return hashOfItem(item, body, imageId);
}

/**
 * 👯 “This question already exists”: an exact duplicate (same fingerprint) in the same skill family of this school, other
 * than the question itself and its revisions. null when there is none, or when the input is not valid yet (the save
 * then reports the problems).
 */
export async function duplicateOfInput(repo: Repo, actor: Actor, inputIn: EditorInput, selfId?: string | null): Promise<{ id: string; stem: string; status: string } | null> {
  let built: Awaited<ReturnType<typeof toBankItem>>;
  const self = selfId ? await repo.findUnique("Question", { id: selfId }) : null;
  const passageText = inputIn.passageText === undefined ? undefined : cleanPassage(inputIn.passageText);
  let skillId = String(inputIn.skillId ?? "");
  try {
    const input = (await placeOnMap(repo, actor, inputIn)).input;
    skillId = String(input.skillId);
    built = await toBankItem(repo, actor, passageText === undefined ? input : { ...input, passageId: null }, "dup-check");
  } catch { return null; }
  const imageId = inputIn.imageId !== undefined ? inputIn.imageId || null : self?.imageId ? String(self.imageId) : null;
  const hash = await hashForSave(repo, built.item, passageText, built.passageId, imageId);
  const hits = (await repo.findMany("Question", { contentHash: hash }, { select: ["id", "skillId", "stem", "status", "tags", "deletedAt"], take: 50 })).filter((h) => !h.deletedAt && String(h.id) !== String(selfId ?? ""));
  if (!hits.length) return null;
  const { schoolSkillIndex } = await import("../questions/skill-questions");
  const idx = await schoolSkillIndex(repo, schoolOf(actor));
  const family = idx.keyOf.get(skillId);
  const revisionOf = (t: unknown) => ((typeof t === "string" ? JSON.parse(t) : t) as { revisionOf?: string } | null)?.revisionOf ?? null;
  const mine = self ? revisionOf(self.tags) : null;
  const hit = hits.find((h) => idx.ids.has(String(h.skillId)) && idx.keyOf.get(String(h.skillId)) === family && String(h.id) !== mine && revisionOf(h.tags) !== String(selfId ?? "-"));
  return hit ? { id: String(hit.id), stem: String(hit.stem).slice(0, 200), status: String(hit.status) } : null;
}

/**
 * `deferAnalysis` (bulk loaders only): the area / skill / tag / intelligence pass (saveMapArea) is left to the caller,
 * which runs it ONCE for all the questions it created (same result, a fraction of the database calls).
 */
export async function createDraft(repo: Repo, actor: Actor, inputIn: EditorInput, now = new Date(), opts: { deferAnalysis?: boolean } = {}): Promise<string> {
  assertCan(actor, "questions:edit");
  const placed = await placeOnMap(repo, actor, inputIn);
  const input = placed.input;
  const ref = `T${(await skillInSchool(repo, actor, input.skillId)).grade}-${randomBytes(4).toString("hex")}`;
  const passageText = input.passageText === undefined ? undefined : cleanPassage(input.passageText);
  const { item, standardId, passageId: givenPassage, grade } = await toBankItem(repo, actor, passageText === undefined ? input : { ...input, passageId: null }, ref);
  const typeId = await typeIdFor(repo, item.type);
  const id = await repo.transaction(async (tx) => {
    const passageId = passageText === undefined ? givenPassage : passageText ? await passageForText(tx, passageText, grade, actor.userId, now) : null;
    const contentHash = await hashForSave(tx, item, passageText, passageId, input.imageId ?? null);
    const q = await tx.create("Question", {
      contentHash,
      externalRef: ref, skillId: input.skillId, standardId, passageId, typeId, stem: item.stem, content: contentPayload(item), hint: input.hint ? text(input.hint, "Hint", 500) : null,
      difficultyLevel: item.level, irtA: 1, irtB: item.irt.b, irtC: 0, estimatedSeconds: item.estimatedSeconds,
      status: "DRAFT", origin: input.imported ? "IMPORTED" : input.aiDrafted ? "AI_GENERATED" : "TEACHER_AUTHORED", aiStatus: input.aiDrafted && !input.imported ? "AI_GENERATED" : null,
      lessonId: input.lessonId ?? null, tags: tagsFor(input, null), imageId: input.imageId ? await checkedImage(tx, input) : null, lexile: cleanLexile(input.lexile),
      createdById: actor.userId, createdAt: now, updatedAt: now,
    });
    await writeParts(tx, String(q.id), item, true);
    return String(q.id);
  });
  if (placed.nodeId) await setQuestionMapNode(repo, id, placed.nodeId, actor.userId);
  if (input.uses?.length) await setQuestionUses(repo, id, input.uses);
  if (!opts.deferAnalysis) await saveMapArea(repo, schoolOf(actor), [id], input, now);
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
    const contentHash = await hashForSave(tx, item, passageText, passageId, input.imageId !== undefined ? input.imageId || null : q.imageId ? String(q.imageId) : null);
    await tx.updateMany("Question", { id }, {
      contentHash,
      skillId: input.skillId, standardId, passageId, typeId: await typeIdFor(tx, item.type), stem: item.stem, content: contentPayload(item),
      hint: input.hint ? text(input.hint, "Hint", 500) : null, difficultyLevel: item.level, estimatedSeconds: item.estimatedSeconds,
      ...(q.calibrated ? {} : { irtB: item.irt.b }), status, updatedAt: now,
      // a person chose a new level: automatic re-classification only suggests for this question from now on
      ...(Number(q.difficultyLevel) !== item.level ? { difficultySource: "MANUAL" } : {}),
      ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}), tags: tagsFor(input, q.tags),
      ...(input.imageId !== undefined ? { imageId: await checkedImage(tx, input) } : {}),
      ...(input.lexile !== undefined ? { lexile: cleanLexile(input.lexile) } : {}),
    });
    await writeParts(tx, id, item);
  });
  if (input.imageId !== undefined && q.imageId && q.imageId !== (input.imageId || null)) await removeUnusedImages(repo, [String(q.imageId)]);
  if (placed.nodeId !== undefined) await setQuestionMapNode(repo, id, placed.nodeId, actor.userId);
  if (input.uses !== undefined) await setQuestionUses(repo, id, input.uses);
  await saveMapArea(repo, schoolOf(actor), [id], input, now);
  // (again after the analysis saveMapArea runs, which writes its own difficultySource)
  if (Number(q.difficultyLevel) !== item.level) await repo.updateMany("Question", { id }, { difficultySource: "MANUAL" });
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
  const revisionOf = tagsOf(q.tags).revisionOf as string | undefined;
  const old = revisionOf ? await repo.findUnique("Question", { id: revisionOf }) : null;
  await repo.transaction(async (tx) => {
    await tx.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId, aiStatus: q.origin === "AI_GENERATED" ? "APPROVED" : q.aiStatus ?? null, updatedAt: now });
    // the old version is archived and points at the one that replaced it
    if (old && old.status === "PUBLISHED") await tx.updateMany("Question", { id: revisionOf!, status: "PUBLISHED" }, { status: "ARCHIVED", tags: { ...tagsOf(old.tags), replacedBy: id }, updatedAt: now });
  });
  // r67: the new version takes the old one's place everywhere (map place, uses, ReadMaster, NAFS bank, sets not started)
  if (old && old.status === "PUBLISHED") {
    const { swapInSets } = await import("../questions/question-sets");
    await swapInSets(repo, schoolOf(actor), new Map([[String(revisionOf), id]]), now);
  }
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

/**
 * The open new version (DRAFT / UNDER_REVIEW) of a published question, or null. Found by its reference (“<ref>.vN”,
 * indexed) and its tags.revisionOf — not by skill: a draft moved to another skill is still found.
 */
export async function openRevisionOf(repo: Repo, id: string): Promise<string | null> {
  const q = await repo.findUnique("Question", { id });
  if (!q) return null;
  const base = String(q.externalRef ?? id).replace(/\.v\d+$/, "");
  const rows = await repo.findMany("Question", { externalRef: { contains: `${base}.v` }, status: { in: ["DRAFT", "UNDER_REVIEW"] }, deletedAt: null }, { select: ["id", "tags"], take: 20 });
  return rows.map((r) => (tagsOf(r.tags).revisionOf === id ? String(r.id) : null)).find(Boolean) ?? null;
}

/**
 * ✏️ An admin's “Edit anyway” of a published question students have answered (owner, r67): the change is saved as a
 * new version behind the scenes and published at once — the old version (whose answers belong to its wording) is
 * archived and the new one takes its place everywhere (publishChecked). Returns the new version's id.
 */
export async function editPublishedAsNewVersion(repo: Repo, actor: Actor, id: string, input: EditorInput, now = new Date()): Promise<string> {
  assertCan(actor, "questions:publish");
  if (!isAdmin(actor)) throw new ForbiddenError("Only an admin can change a question students have answered.");
  const q = await questionInSchool(repo, actor, id);
  if (q.status !== "PUBLISHED") throw new ValidationError("Only a published question is changed this way.");
  const newId = await reviseQuestion(repo, actor, id, now);
  await updateDraft(repo, actor, newId, input, now);
  const fresh = (await repo.findUnique("Question", { id: newId }))!;
  await publishChecked(repo, actor, fresh, now, { note: "Edit anyway: the change of an answered question, published as a new version" });
  return newId;
}

/** New DRAFT version of a published question; the original stays live until the revision is approved. */
export async function reviseQuestion(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const q = await questionInSchool(repo, actor, id);
  if (q.status !== "PUBLISHED") throw new ValidationError("Only published questions are revised; edit drafts directly.");
  const open = await openRevisionOf(repo, id);
  if (open) return open;
  const form = await getQuestion(repo, actor, id);
  const version = num(q.version) + 1;
  const ref = `${String(q.externalRef ?? id).replace(/\.v\d+$/, "")}.v${version}`;
  const { item, standardId, passageId } = await toBankItem(repo, actor, form.input, ref);
  const newId = await repo.transaction(async (tx) => {
    const n = await tx.create("Question", {
      externalRef: ref, skillId: q.skillId, standardId, passageId, typeId: q.typeId, stem: item.stem, content: contentPayload(item), hint: q.hint ?? null,
      difficultyLevel: item.level, irtA: q.irtA, irtB: q.irtB, irtC: q.irtC, calibrated: q.calibrated, estimatedSeconds: item.estimatedSeconds,
      tags: { ...Object.fromEntries(Object.entries(tagsOf(q.tags)).filter(([k]) => k !== "replacedBy")), revisionOf: id }, status: "DRAFT", origin: q.origin, aiStatus: q.aiStatus ?? null, contentHash: q.contentHash ?? null, imageId: q.imageId ?? null,
      mapTest: q.mapTest ?? null, mapInstructionalArea: q.mapInstructionalArea ?? null, mapAreaSource: q.mapAreaSource ?? null,
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
  /** NWEA MAP instructional area (short label) and whether the AI filled the answer (to check) */
  mapArea?: string | null;
  aiCheck?: boolean;
}

export interface QuestionFilter {
  /** NWEA MAP instructional area: an area key (LIT, INFO, VOCAB, GRAMMAR, MECH, WRITING) or NONE (not classified) */
  mapArea?: string;
  /** imported questions whose answer the AI chose (or that still wait for the AI) */
  aiCheck?: boolean;
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
    ...(await mapAreaFilter(repo, base, filter)),
  };
  const needle = (filter.q ?? "").trim();
  const limit = filter.limit, page = Math.max(1, Math.floor(filter.page ?? 1));
  const COLS = ["id", "externalRef", "stem", "skillId", "typeId", "difficultyLevel", "status", "origin", "createdById", "updatedAt", "passageId", "imageId", "mapInstructionalArea", "tags"];
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
              // UI reorg Phase 1: also the skills the words name (“main inference” → Make Inferences), as the search does
              return import("../questions/skill-questions").then(({ skillsMatching }) => skillsMatching(repo, schoolId, needle, { grade: filter.gradeLevel })).then((matched) => {
              const named = [...new Set([...skills.filter((k) => String(k.name).toLowerCase().includes(lower) && skillIds.includes(k.id)).map((k) => k.id), ...matched.flatMap((m) => m.familySkillIds ?? [m.id]).filter((id) => skillIds.includes(id))])];
              return Promise.all([
                read({ ...where, stem: { contains: needle } }), read({ ...where, externalRef: { contains: needle } }),
                named.length ? read({ ...where, skillId: { in: named } }) : Promise.resolve([] as Row[]),
              ]).then((lists) => {
                const seen = new Set<unknown>();
                return lists.flat().filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
              });
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
        mapArea: q.mapInstructionalArea ? String(q.mapInstructionalArea) : null, aiCheck: aiCheckOf(q.tags),
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
  /** a published question's new version being edited (draft / waiting for review), if any */
  openRevision: string | null;
  /** students have answered it (its wording is then changed only through a new version) */
  answered: boolean;
  /** an archived old version: the question that replaced it */
  replacedBy: string | null;
  /** an admin may change this published, answered question anyway: the change is saved as a new version and published */
  canEditAnyway: boolean;
  input: EditorInput;
  /** NWEA MAP: the saved area and how it was decided (STANDARD, SKILL, TEXT, IMPORT, ADMIN, AI …) */
  map: { test: string | null; area: string | null; source: string | null };
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
  // error correction (old and new form) and the newer types: the stored content + key, read back the same way practice reads them
  if ((code === "ERROR_CORRECTION" || code === "TWO_PART" || code === "GRID" || code === "HOT_TEXT" || code === "DICTATION" || code === "SENTENCE_COMBINE") && primary) Object.assign(input, storedParts(code, content, val(primary)) as Partial<EditorInput>);
  // its Curriculum Map place and Placement / MAP test uses
  const place = (await placesOf(repo, [String(q.id)])).get(String(q.id))!;
  input.mapNodeCode = place.code;
  input.uses = place.uses;
  input.lexile = q.lexile === null || q.lexile === undefined ? null : Number(q.lexile);
  // an area set by hand or by the import file shows in the editor; the automatic one stays automatic
  if (q.mapAreaSource === "ADMIN" || q.mapAreaSource === "IMPORT") input.mapArea = q.mapInstructionalArea ? String(q.mapInstructionalArea) : null;
  if (code === "MATCHING" && primary) input.pairs = val(primary) as { left: string; right: string }[];
  const users = logs.length ? await repo.findMany("User", { id: { in: [...new Set(logs.map((l) => l.actorId).filter(Boolean))] } }, { select: ["id", "displayName"] }) : [];
  const after = (l: Row) => (typeof l.after === "string" ? JSON.parse(l.after) : l.after ?? {}) as { note?: string; reason?: string };
  const editable = await mayEditQuestion(repo, actor, q).then(() => true, () => false);
  const [openRevision, answered] = await Promise.all([
    q.status === "PUBLISHED" ? openRevisionOf(repo, id) : Promise.resolve(null),
    q.status === "PUBLISHED" ? repo.findMany("QuestionAttempt", { questionId: id }, { select: ["questionId"], take: 1 }).then((r) => r.length > 0) : Promise.resolve(false),
  ]);
  return {
    id, ref: String(q.externalRef ?? ""), status: String(q.status) as QuestionStatus, origin: String(q.origin), version: num(q.version), mine: q.createdById === actor.userId,
    canEdit: editable, canReview: q.status === "UNDER_REVIEW" && can(actor, "questions:publish") && (q.createdById !== actor.userId || isAdmin(actor)),
    canReviewAi: q.origin === "AI_GENERATED" && (q.status === "DRAFT" || q.status === "UNDER_REVIEW") && can(actor, "questions:review") && (q.createdById !== actor.userId || isAdmin(actor)),
    revisionOf: (tagsOf(q.tags).revisionOf as string | undefined) ?? null, input,
    openRevision, answered, replacedBy: (tagsOf(q.tags).replacedBy as string | undefined) ?? null,
    canEditAnyway: q.status === "PUBLISHED" && !editable && isAdmin(actor) && can(actor, "questions:publish"),
    map: { test: q.mapTest ? String(q.mapTest) : null, area: q.mapInstructionalArea ? String(q.mapInstructionalArea) : null, source: q.mapAreaSource ? String(q.mapAreaSource) : null },
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


/** “AI filled · check”: the AI chose the answer (or the import still waits for it). */
function aiCheckOf(tags: unknown): boolean {
  let t: unknown = tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
  const o = (t ?? {}) as { aiFilled?: { review?: boolean }; aiNeeds?: unknown[] };
  return Boolean(o.aiFilled?.review) || (Array.isArray(o.aiNeeds) && o.aiNeeds.includes("answer"));
}
/** The MAP area filter (and “AI filled · check”, read from the tags). */
async function mapAreaFilter(repo: Repo, base: Record<string, unknown>, filter: QuestionFilter): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (filter.mapArea) {
    const { MAP_AREAS } = await import("../map/nwea-area");
    const a = MAP_AREAS.find((x) => x.key === filter.mapArea);
    out.mapInstructionalArea = filter.mapArea === "NONE" ? null : a ? a.name : "—";
  }
  if (filter.aiCheck) {
    const rows = await repo.findMany("Question", base, { select: ["id", "tags"] });
    out.id = { in: rows.filter((q) => aiCheckOf(q.tags)).map((q) => String(q.id)) };
  }
  return out;
}

/** Checks an editor input with the bank rules without saving anything (teacher edit requests). */
export async function validateEditorInput(repo: Repo, actor: Actor, input: EditorInput, ref: string): Promise<void> {
  await toBankItem(repo, actor, input, ref);
}
