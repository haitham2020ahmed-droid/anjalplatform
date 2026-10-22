/**
 * 🛠 “Fix stuck questions” (owner, r67): ONE admin action for every question that is stuck in the bank — not under a
 * skill, a draft, or waiting for review. It runs on the school's own database in small batches (the page shows the
 * progress; the server never holds the bank in memory), never erases anything, and is idempotent (a second run
 * finds nothing new to do). Phases:
 *
 *   0. passages  (r68) every question whose wording needs a passage / story / poem / chart / picture that is not
 *                attached is removed from the platform: a SOFT delete by the admin delete rule (hidden everywhere,
 *                students' answers kept; src/server/admin/missing-passage.ts). Listed in the report.
 *   1. classify  every question on a grade's hidden “Unclassified (Curriculum Map)” skill gets its real skill, by the
 *                platform's own link pass (src/server/questions/link-bank.ts — the same rules as Sort Questions):
 *                the skill named in the import file / tags, the question's standard → the same-grade skill linked to
 *                it, the ReadMaster article's skill, the Curriculum Map place → that lesson's skill, Respond to
 *                Reading; then (here) the MAP goal / sub-topic in its tags → the skill it names. A guess from the
 *                wording alone is never applied: the question stays, with the reason, and is listed for review.
 *                Students' answers move with the question and their mastery is recomputed (applyRemap).
 *   2. repair    what can be repaired without a person: a missing answer key that the stored data still holds (a key
 *                letter or answer text in the answer rows or the import tags), blank and duplicate choices removed
 *                and the choices relabelled, a missing / invalid difficulty from the question's RIT or estimated
 *                level, a missing question type from its parts, a missing explanation and missing feedback for the
 *                wrong choices written from the key (never an answer that is not in the stored data).
 *   3. publish   every draft / waiting question that now passes the platform's own publish validation — the very
 *                same step as the editor's Publish (publishQuestions → publishChecked). A question still not under a
 *                skill and not on the Curriculum Map is not published.
 *   4. report    what still cannot be published, each with a plain reason and a link to its editor.
 *
 * Also runs once in the background after an update (instrumentation-node.ts → fixStuckOnce); the admin sees that
 * report on System check.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { LEVEL_TO_B } from "../../config/engine";
import { isHiddenSkill } from "../skills/master";
import { ritOf } from "../questions/bank-scope";
import type { JobDef } from "../jobs/runner";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const tagsOf = (v: unknown): Record<string, unknown> => {
  if (!v) return {};
  if (typeof v === "string") { try { return (JSON.parse(v) ?? {}) as Record<string, unknown>; } catch { return {}; } }
  return v as Record<string, unknown>;
};
const valueOf = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };
const norm = (t: unknown) => s(t).replace(/\s+/g, " ").trim();

export const CLASSIFY_BATCH = 100;
export const PUBLISH_BATCH = 40;
const LIST_CAP = 200;
/** decisions at or above this are applied (standard, map place, import / tags, Respond to Reading); wording guesses (0.5) are not */
export const FIX_LINK_THRESHOLD = 0.6;
const REPORT_KEY = "questions.fixStuck.report";
/** bump when the rules change: the background run happens once per version */
export const AUTO_RUN_KEY = "questions.fixStuck.auto.r68";

export type Phase = "passages" | "classify" | "repair" | "done";
export interface Cursor { phase: Phase; after: string | null }
export interface StuckItem { id: string; stem: string; reason: string }
export interface StuckCounts { unclassified: number; drafts: number; waiting: number }
export interface FixReport {
  startedAt: string; finishedAt: string | null; by: "admin" | "auto";
  before: StuckCounts; after: StuckCounts | null;
  classified: number; byVia: Record<string, number>;
  /** still not under a skill after the run, with the reason (first LIST_CAP) */
  left: StuckItem[]; leftCount: number;
  repaired: Record<string, number>; repairedQuestions: number;
  published: number;
  notPublished: StuckItem[]; notPublishedCount: number;
  /** r68: removed because they need a passage / picture that is not attached (soft delete; first LIST_CAP) */
  removedNoPassage?: number; removedList?: StuckItem[];
  /** 🔧 fix (Oct 2026): a question's answer key was corrected here after students had already answered it under the
   *  old (missing) key — surfaced so an admin notices their past scores were not retroactively changed. */
  warnings?: string[];
}
export interface StepResult { cursor: Cursor; processed: number; report: FixReport }

function adminOnly(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can fix the question bank.");
  assertCan(actor, "questions:publish");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

interface SchoolSkills { all: Row[]; hidden: string[]; real: string[]; gradeOf: Map<string, number>; codeOf: Map<string, string> }
async function schoolSkills(repo: Repo, schoolId: string): Promise<SchoolSkills> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const all = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name", "curriculumId", "isActive", "category"] }) : [];
  const levelOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const gradeOf = new Map(all.map((k) => [s(k.id), levelOfCur.get(s(k.curriculumId)) ?? 0]));
  return { all, hidden: all.filter((k) => isHiddenSkill(k.code)).map((k) => s(k.id)), real: all.filter((k) => !isHiddenSkill(k.code)).map((k) => s(k.id)), gradeOf, codeOf: new Map(all.map((k) => [s(k.id), s(k.code)])) };
}

const LIVE = ["DRAFT", "UNDER_REVIEW", "PUBLISHED"];

/**
 * The ONE count of “questions not under a skill” (the Question Bank banner, Classify Curriculum Questions, Data
 * Cleanup and this page all show it): live questions (draft, waiting or published — archived ones are out of use) on
 * a grade's hidden skill.
 */
export async function unclassifiedCount(repo: Repo, schoolId: string): Promise<number> {
  // the school's skills from the shared, cached index (the same skills as schoolSkills: not deleted)
  const { schoolSkillIndex } = await import("../questions/skill-questions");
  const idx = await schoolSkillIndex(repo, schoolId);
  const hidden = [...idx.skillOf.values()].filter((k) => isHiddenSkill(k.code)).map((k) => k.id);
  return hidden.length ? repo.count("Question", { skillId: { in: hidden }, deletedAt: null, status: { in: LIVE } }) : 0;
}

export async function stuckCounts(repo: Repo, schoolId: string): Promise<StuckCounts> {
  const sk = await schoolSkills(repo, schoolId);
  const ids = [...sk.hidden, ...sk.real];
  let drafts = 0, waiting = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    drafts += await repo.count("Question", { skillId: { in: part }, deletedAt: null, status: "DRAFT" });
    waiting += await repo.count("Question", { skillId: { in: part }, deletedAt: null, status: "UNDER_REVIEW" });
  }
  return { unclassified: sk.hidden.length ? await repo.count("Question", { skillId: { in: sk.hidden }, deletedAt: null, status: { in: LIVE } }) : 0, drafts, waiting };
}

// ------------------------------------------------------------------ 1. classify

/** MAP goal / sub-topic phrases kept with an imported question (tags), most specific first. */
function goalPhrases(tags: Record<string, unknown>): string[] {
  const raw = [tags.subTopic, tags.subtopic, tags.mapSubTopic, tags.mapGoal, tags.goal, tags.domain].map(s).filter(Boolean);
  const out: string[] = [];
  for (const r of raw) for (const part of [r, ...r.split(/[:/>|–-]/)]) { const p = norm(part); if (p.length >= 4 && !out.includes(p)) out.push(p); }
  return out;
}

async function classifyPage(repo: Repo, schoolId: string, actorId: string | null, sk: SchoolSkills, after: string | null, report: FixReport, now: Date): Promise<{ next: string | null; processed: number }> {
  if (!sk.hidden.length) return { next: null, processed: 0 };
  const page = await repo.findMany("Question", { skillId: { in: sk.hidden }, deletedAt: null, ...(after ? { id: { gt: after } } : {}) }, { select: ["id", "skillId", "stem", "tags"], orderBy: [{ field: "id", dir: "asc" }], take: CLASSIFY_BATCH });
  if (!page.length) return { next: null, processed: 0 };
  const ids = page.map((q) => s(q.id));
  const { linkBank } = await import("../questions/link-bank");
  const r = await linkBank(repo, schoolId, { apply: true, actorId, now, questionIds: ids, families: false, threshold: FIX_LINK_THRESHOLD, listCap: CLASSIFY_BATCH });
  report.classified += r.summary.linked;
  for (const [k, n] of Object.entries(r.summary.byVia)) report.byVia[k] = (report.byVia[k] ?? 0) + n;
  // the MAP goal / sub-topic in the tags names the skill (only for those the link pass left)
  const still = new Set(r.review.map((d) => d.questionId));
  const { skillForPhrase, applyRemap } = await import("../curriculum-map/remap-skills");
  const items: { questionId: string; grade: number; place: string | null; fromSkillId: string; toSkillId: string; toSkill: string; via: "TAGS"; detail: string; confidence: number }[] = [];
  for (const q of page.filter((x) => still.has(s(x.id)))) {
    const grade = sk.gradeOf.get(s(q.skillId)) ?? 0;
    const gradeSkills = sk.all.filter((k) => sk.gradeOf.get(s(k.id)) === grade && !isHiddenSkill(k.code) && k.isActive !== false && k.isActive !== 0)
      .map((k) => ({ id: s(k.id), name: s(k.name), family: s(k.code).toLowerCase().match(/^g\d+\.([a-z0-9-]+)$/)?.[1] ?? "", category: s(k.category) })).filter((k) => k.family);
    for (const ph of goalPhrases(tagsOf(q.tags))) {
      const hit = skillForPhrase(ph, gradeSkills, null);
      if (hit && hit.how === "alias") { items.push({ questionId: s(q.id), grade, place: null, fromSkillId: s(q.skillId), toSkillId: hit.skill.id, toSkill: hit.skill.name, via: "TAGS", detail: `the MAP goal “${ph}”`, confidence: 0.85 }); break; }
    }
  }
  if (items.length) {
    await applyRemap(repo, schoolId, { actorId, now, questionIds: items.map((x) => x.questionId), plan: { items, mapped: items.length, left: 0, attemptsToMove: 0 } });
    report.classified += items.length;
    report.byVia.MAP_GOAL = (report.byVia.MAP_GOAL ?? 0) + items.length;
    const { settleReview } = await import("../nafs/nafs-links");
    for (const x of items) await settleReview(repo, schoolId, "QUESTION", x.questionId, "APPROVED", actorId, now);
  }
  const done = new Set(items.map((x) => x.questionId));
  for (const d of r.review) {
    if (done.has(d.questionId) || !ids.includes(d.questionId)) continue;
    report.leftCount++;
    if (report.left.length < LIST_CAP) report.left.push({ id: d.questionId, stem: d.excerpt.slice(0, 140), reason: d.toSkill ? `Only a guess (${d.toSkill}, from ${d.detail}): choose the skill.` : `No standard, map place or MAP goal names a skill (${d.detail}).` });
  }
  return { next: page.length < CLASSIFY_BATCH ? null : ids[ids.length - 1], processed: page.length };
}

/**
 * 🪄 One batch of classifying only (Classify Curriculum Questions → “Auto-classify”, with a progress bar): the same
 * rules as phase 1. Returns the cursor, how many were classified, those left with the reason, and how many remain.
 */
export async function classifyStep(repo: Repo, schoolId: string, actorId: string | null, after: string | null, now = new Date()): Promise<{ next: string | null; processed: number; classified: number; left: StuckItem[]; remaining: number }> {
  const sk = await schoolSkills(repo, schoolId);
  const report = emptyReport("admin", { unclassified: 0, drafts: 0, waiting: 0 }, now);
  const r = await classifyPage(repo, schoolId, actorId, sk, after, report, now);
  return { next: r.next, processed: r.processed, classified: report.classified, left: report.left, remaining: await unclassifiedCount(repo, schoolId) };
}

// ------------------------------------------------------------------ 2. repair

export interface RepairResult {
  fixes: string[]; problem: string | null;
  /** 🔧 fix (Oct 2026): set when the "answer key" fix below actually flipped which choice is correct and students
   *  had already answered this question under the old (missing) key — the number of those existing attempts, so
   *  the caller can warn an admin that past scores were not retroactively changed. */
  priorAttempts?: number;
}

const CHOICE = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"]);

/** The key letters / texts a question's stored data still holds (answer rows, import tags). */
function storedKeys(answers: Row[], tags: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const a of answers) {
    const v = valueOf(a.value);
    if (Array.isArray(v)) out.push(...v.map(s)); else if (v !== null && v !== undefined && typeof v !== "object") out.push(s(v));
  }
  for (const k of ["correct", "correctAnswer", "answer", "key"]) if (tags[k] !== undefined && tags[k] !== null && typeof tags[k] !== "object") out.push(s(tags[k]));
  return out.map(norm).filter(Boolean);
}

/**
 * Repairs one question's stored parts where the fix is certain (never guesses an answer). Returns what was fixed, or
 * the problem a person must solve. Writes go through `tx`.
 */
export async function repairQuestion(tx: Repo, q: Row, ctx: { typeCode: string | null; typeIds: Map<string, string>; grade: number }, now = new Date()): Promise<RepairResult> {
  const fixes: string[] = [];
  const id = s(q.id);
  const tags = tagsOf(q.tags);
  const [options, answers, expl] = await Promise.all([
    tx.findMany("QuestionOption", { questionId: id }, { orderBy: [{ field: "order", dir: "asc" }] }),
    tx.findMany("QuestionAnswer", { questionId: id }),
    tx.findMany("QuestionExplanation", { questionId: id }, { select: ["id", "kind"] }),
  ]);
  const patch: Record<string, unknown> = {};
  let priorAttempts: number | undefined;

  // the type: from the parts when it is missing
  let type = ctx.typeCode;
  if (!type) {
    const texts = options.map((o) => norm(o.text).toLowerCase());
    type = options.length === 2 && texts.includes("true") && texts.includes("false") ? "TRUE_FALSE"
      : options.length >= 2 ? (options.filter((o) => o.isCorrect).length > 1 ? "MULTI_SELECT" : "MULTIPLE_CHOICE")
      : answers.length ? "FILL_BLANK" : null;
    if (!type || !ctx.typeIds.get(type)) return { fixes, problem: "The question type is missing and cannot be read from its parts." };
    patch.typeId = ctx.typeIds.get(type);
    fixes.push("type");
  }

  // choices: blank and duplicate ones removed, labels A, B, C … again; a missing key from the stored data
  let opts = options;
  if (CHOICE.has(type)) {
    const keep: Row[] = [];
    for (const o of options) {
      const t = norm(o.text);
      if (!t) { fixes.push("blank choice removed"); continue; }
      const same = keep.find((k) => norm(k.text) === t);
      if (same) { if (o.isCorrect && !same.isCorrect) same.isCorrect = true; fixes.push("duplicate choice removed"); continue; }
      keep.push({ ...o, text: t });
    }
    if (!keep.some((o) => o.isCorrect)) {
      const keys = storedKeys(answers, tags);
      const want = new Set<number>();
      for (const k of keys) {
        const letters = /^[A-H](\s*[,;&]?\s*[A-H])*$/i.test(k) ? k.toUpperCase().replace(/[^A-H]/g, "").split("") : [];
        if (letters.length) for (const L of letters) { const byLabel = options.findIndex((o) => s(o.label).toUpperCase() === L); const i = byLabel >= 0 ? keep.indexOf(keep.find((x) => x.id === options[byLabel].id)!) : L.charCodeAt(0) - 65; if (i >= 0 && i < keep.length) want.add(i); }
        else { const i = keep.findIndex((o) => norm(o.text).toLowerCase() === k.toLowerCase()); if (i >= 0) want.add(i); }
      }
      if (want.size && (type !== "MULTIPLE_CHOICE" && type !== "DROPDOWN" || want.size === 1)) {
        for (const i of want) keep[i].isCorrect = true;
        fixes.push("answer key");
        // 🔧 fix (Oct 2026): students may already have answered this question while it had no correct choice marked
        // — count their attempts so the admin is warned that the key changed under them (their past scores are
        // not changed by this repair).
        const n = await tx.count("QuestionAttempt", { questionId: id });
        if (n > 0) priorAttempts = n;
      }
    }
    // a wrong choice without feedback: the platform's publish check asks for one — written from the key
    const right = keep.filter((o) => o.isCorrect);
    let feedback = false;
    if (right.length) for (const o of keep) if (!o.isCorrect && !norm(o.rationale)) { o.rationale = `Not this one. The correct answer is “${norm(right[0].text)}”.`.slice(0, 500); feedback = true; }
    if (feedback) fixes.push("feedback for wrong choices");
    const relabel = keep.some((o, i) => s(o.label) !== "ABCDEFGH"[i] || Number(o.order) !== i || o.text !== options.find((x) => x.id === o.id)?.text);
    if (keep.length !== options.length || relabel || feedback || fixes.includes("answer key") || keep.some((o) => o.isCorrect !== options.find((x) => x.id === o.id)?.isCorrect)) {
      await tx.deleteMany("QuestionOption", { questionId: id });
      opts = keep.map((o, i) => ({ questionId: id, label: "ABCDEFGH"[i], text: s(o.text), isCorrect: Boolean(o.isCorrect), rationale: o.rationale ?? null, order: i }));
      if (opts.length) await tx.createMany("QuestionOption", opts);
      if (relabel && !fixes.length) fixes.push("choices relabelled");
    }
  }
  if (type === "TRUE_FALSE" && !answers.length) {
    const right = options.find((o) => o.isCorrect);
    const keys = storedKeys([], tags).map((k) => k.toLowerCase());
    const v = right ? /^true$/i.test(norm(right.text)) : keys.includes("true") ? true : keys.includes("false") ? false : null;
    if (v !== null) { await tx.createMany("QuestionAnswer", [{ questionId: id, value: v as unknown as object, isPrimary: true }]); fixes.push("answer key"); }
  }

  // difficulty: 1–7 from the RIT kept with the question, else its Below / On / Above, else the estimated level
  const lvl = Number(q.difficultyLevel);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > 7) {
    const rit = Number(tags.rit ?? tags.RIT ?? tags.ritScore);
    const band = s(tags.level ?? tags.mapLevel).toUpperCase();
    const est = Number(q.estimatedLevel);
    const level = Number.isFinite(rit) && rit > 100 ? Math.max(1, Math.min(7, Math.round(4 + (3 * (rit - ritOf(4, ctx.grade || 5))) / 15)))
      : band.startsWith("BELOW") ? 3 : band.startsWith("ON") ? 4 : band.startsWith("ABOVE") ? 5
      : est >= 1 && est <= 7 ? Math.round(est) : null;
    if (level) { patch.difficultyLevel = level; if (!q.calibrated) patch.irtB = LEVEL_TO_B[level]; fixes.push("difficulty"); }
  }

  // the explanation, written from the key when there is none
  if (!expl.some((e) => e.kind === "WHY_CORRECT")) {
    const right = (CHOICE.has(type) ? opts : []).filter((o) => o.isCorrect);
    const text = right.length ? `The correct answer is ${right.map((o) => `${s(o.label)}: “${norm(o.text)}”`).join(" and ")}.` : null;
    if (text) { await tx.createMany("QuestionExplanation", [{ questionId: id, kind: "WHY_CORRECT", body: [{ type: "text", text }], order: 0 }]); fixes.push("explanation from the key"); }
  }

  if (Object.keys(patch).length) await tx.updateMany("Question", { id }, { ...patch, updatedAt: now });
  // 🆕 feature (Oct 2026): record priorAttempts on the audit entry too (not just the return value) when the answer
  // key changed under already-answered students — so the admin audit trail itself shows how many students were
  // affected, without needing to cross-reference QuestionAttempt separately.
  if (fixes.length) await tx.create("AuditLog", { actorId: null, action: "question.repair", entityType: "Question", entityId: id, after: { fixes: [...new Set(fixes)], via: "fix-stuck-questions", ...(priorAttempts !== undefined ? { priorAttempts } : {}) }, createdAt: now });
  return { fixes: [...new Set(fixes)], problem: null, priorAttempts };
}

/** The editor's words for a publish problem, made plain. */
function plainReason(msg: string): string {
  const m = msg.replace(/^Validation failed:?\s*/i, "").trim();
  if (/correct/i.test(m) && /option|answer/i.test(m)) return `The correct answer is missing or unclear: ${m}`;
  if (/Explanation is required/i.test(m)) return "The explanation is missing and cannot be written from the key.";
  if (/standard/i.test(m)) return "Choose the standard this question assesses (its skill has none).";
  return m.slice(0, 300);
}

async function repairPublishPage(repo: Repo, actor: Actor, schoolId: string, sk: SchoolSkills, after: string | null, report: FixReport, now: Date): Promise<{ next: string | null; processed: number }> {
  const skillIds = [...sk.hidden, ...sk.real];
  if (!skillIds.length) return { next: null, processed: 0 };
  const page = await repo.findMany("Question", { skillId: { in: skillIds }, deletedAt: null, status: { in: ["DRAFT", "UNDER_REVIEW"] }, ...(after ? { id: { gt: after } } : {}) },
    { select: ["id", "skillId", "stem", "tags", "typeId", "difficultyLevel", "estimatedLevel", "calibrated", "status"], orderBy: [{ field: "id", dir: "asc" }], take: PUBLISH_BATCH });
  if (!page.length) return { next: null, processed: 0 };
  const types = await repo.findMany("QuestionType", {}, { select: ["id", "code"] });
  const codeOfType = new Map(types.map((t) => [s(t.id), s(t.code)]));
  const typeIds = new Map(types.map((t) => [s(t.code), s(t.id)]));
  const onMap = new Set((await repo.findMany("QuestionMapLink", { questionId: { in: page.map((q) => q.id) } }, { select: ["questionId"] })).map((l) => s(l.questionId)));
  const toPublish: string[] = [];
  const no = (q: Row, reason: string) => { report.notPublishedCount++; if (report.notPublished.length < LIST_CAP) report.notPublished.push({ id: s(q.id), stem: norm(q.stem).slice(0, 140), reason }); };
  for (const q of page) {
    const r = await repo.transaction((tx) => repairQuestion(tx, q, { typeCode: codeOfType.get(s(q.typeId)) ?? null, typeIds, grade: sk.gradeOf.get(s(q.skillId)) ?? 0 }, now));
    if (r.fixes.length) { report.repairedQuestions++; for (const f of r.fixes) report.repaired[f] = (report.repaired[f] ?? 0) + 1; }
    // 🔧 fix (Oct 2026): admin-visible warning when this repair changed the correct answer out from under students
    // who had already answered the question (their past scores were not changed).
    if (r.priorAttempts) { report.warnings = report.warnings ?? []; report.warnings.push(`Question ${s(q.id)}'s answer key was corrected after ${r.priorAttempts} student(s) had already answered it under the old key — their past scores were not changed.`); }
    if (r.problem) { no(q, r.problem); continue; }
    if (sk.hidden.includes(s(q.skillId)) && !onMap.has(s(q.id))) { no(q, "Not under a skill yet and not on the Curriculum Map: choose its skill first."); continue; }
    toPublish.push(s(q.id));
  }
  if (toPublish.length) {
    // the very same step as the editor's Publish: validated again, then published (a revision replaces its original)
    const { publishQuestions } = await import("./questions");
    const r = await publishQuestions(repo, actor, toPublish, now);
    report.published += r.published.length;
    for (const x of r.skipped) no({ id: x.id, stem: x.stem }, plainReason(x.reason));
  }
  return { next: page.length < PUBLISH_BATCH ? null : s(page[page.length - 1].id), processed: page.length };
}

// ------------------------------------------------------------------ the run

const emptyReport = (by: "admin" | "auto", before: StuckCounts, now: Date): FixReport => ({ startedAt: now.toISOString(), finishedAt: null, by, before, after: null, classified: 0, byVia: {}, left: [], leftCount: 0, repaired: {}, repairedQuestions: 0, published: 0, notPublished: [], notPublishedCount: 0, removedNoPassage: 0, removedList: [], warnings: [] });

// ------------------------------------------------------------------ 0. passages

/** One batch: the questions of this page that need a missing passage are soft-deleted (the admin delete rule). */
async function passagesPage(repo: Repo, actor: Actor, schoolId: string, after: string | null, report: FixReport, now: Date): Promise<{ next: string | null; processed: number }> {
  const { missingPassagePage, removeMissingPassage } = await import("./missing-passage");
  const r = await missingPassagePage(repo, schoolId, after);
  if (r.items.length) {
    const done = await removeMissingPassage(repo, actor, r.items.map((x) => x.id), now);
    report.removedNoPassage = (report.removedNoPassage ?? 0) + done.removed;
    report.removedList = report.removedList ?? [];
    for (const x of r.items) if (report.removedList.length < LIST_CAP) report.removedList.push({ id: x.id, stem: x.stem.slice(0, 140), reason: x.reason });
  }
  return { next: r.next, processed: r.processed };
}

export async function lastFixReport(repo: Repo, schoolId: string): Promise<FixReport | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: REPORT_KEY }, { take: 1 }))[0];
  const v = row ? valueOf(row.value) : null;
  return v && typeof v === "object" ? (v as FixReport) : null;
}
async function saveReport(repo: Repo, schoolId: string, r: FixReport, by: string | null): Promise<void> {
  await repo.upsert("SchoolSetting", { schoolId, key: REPORT_KEY }, { value: r as unknown as object, updatedBy: by }, { value: r as unknown as object, updatedBy: by });
}

/**
 * One step of the run (the page calls it again with the returned cursor until the phase is "done"). The first step
 * (cursor null) starts a fresh report; each step adds to it; the last one counts what is left.
 */
export async function fixStuckStep(repo: Repo, actor: Actor, cursor: Cursor | null, opts: { by?: "admin" | "auto"; now?: Date } = {}): Promise<StepResult> {
  const schoolId = adminOnly(actor);
  const now = opts.now ?? new Date();
  const sk = await schoolSkills(repo, schoolId);
  let report = cursor ? await lastFixReport(repo, schoolId) : null;
  if (!report || !cursor) report = emptyReport(opts.by ?? "admin", await stuckCounts(repo, schoolId), now);
  let cur: Cursor = cursor ?? { phase: "passages", after: null };
  let processed = 0;
  if (cur.phase === "passages") {
    const r = await passagesPage(repo, actor, schoolId, cur.after, report, now);
    processed = r.processed;
    cur = r.next ? { phase: "passages", after: r.next } : { phase: "classify", after: null };
    // reports already open on a removed question leave Flagged Questions too
    if (!r.next) { const { sweepRemovedFlags } = await import("../questions/flags-removed"); await sweepRemovedFlags(repo, schoolId, now); }
  } else if (cur.phase === "classify") {
    const r = await classifyPage(repo, schoolId, opts.by === "auto" ? null : actor.userId, sk, cur.after, report, now);
    processed = r.processed;
    cur = r.next ? { phase: "classify", after: r.next } : { phase: "repair", after: null };
  } else if (cur.phase === "repair") {
    const r = await repairPublishPage(repo, actor, schoolId, sk, cur.after, report, now);
    processed = r.processed;
    cur = r.next ? { phase: "repair", after: r.next } : { phase: "done", after: null };
  }
  if (cur.phase === "done") { report.after = await stuckCounts(repo, schoolId); report.finishedAt = now.toISOString(); }
  await saveReport(repo, schoolId, report, opts.by === "auto" ? null : actor.userId);
  return { cursor: cur, processed, report };
}

/** The whole run at once (the background job and tests). */
export async function fixStuckQuestions(repo: Repo, actor: Actor, opts: { by?: "admin" | "auto"; now?: Date } = {}): Promise<FixReport> {
  let cursor: Cursor | null = null;
  for (let guard = 0; guard < 5000; guard++) {
    const r: StepResult = await fixStuckStep(repo, actor, cursor, opts);
    if (r.cursor.phase === "done") return r.report;
    cursor = r.cursor;
  }
  throw new Error("The run did not finish.");
}

/**
 * Once per update (AUTO_RUN_KEY), for every school with an admin: the same run in the background, acting as the
 * school's first admin (its report is on System check). Claims the key first, so it runs once even with two servers.
 */
export async function fixStuckOnce(repo: Repo, now = new Date()): Promise<number> {
  const { runJobEverywhere } = await import("../jobs/runner");
  return (await runJobEverywhere(repo, FIX_STUCK_JOB, { now })).filter((o) => o.ran).length;
}

const firstAdmin = async (repo: Repo, schoolId: string): Promise<string | null> =>
  s((await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true, deletedAt: null }, { select: ["id"], orderBy: [{ field: "createdAt", dir: "asc" }], take: 1 }))[0]?.id) || null;

/**
 * 🛠 The same run as a light background job (src/server/jobs/runner.ts): one batch per step (100 to classify, 40 to
 * repair and publish), the cursor saved after each, so a restart resumes; once per update (AUTO_RUN_KEY is its
 * checkpoint row, claimed per school, so two servers never run it twice). Acts as the school's first admin; schools
 * without an admin are left for a later start (as before).
 */
export const FIX_STUCK_JOB: JobDef<Cursor> = {
  name: "fix-stuck",
  version: AUTO_RUN_KEY,
  stateKey: AUTO_RUN_KEY,
  async schools(repo) {
    const out: string[] = [];
    for (const sc of await repo.findMany("School", {}, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }] })) if (await firstAdmin(repo, s(sc.id))) out.push(s(sc.id));
    return out;
  },
  async skip(repo, schoolId) {
    // finished before the runner existed (the old mark: { finishedAt, published, classified })
    const row = await repo.findUnique("SchoolSetting", { schoolId, key: AUTO_RUN_KEY });
    const v = row ? (valueOf(row.value) as Record<string, unknown> | null) : null;
    return Boolean(v && typeof v === "object" && v.finishedAt && v.version === undefined);
  },
  async step(repo, schoolId, cursor, _state, now) {
    const admin = await firstAdmin(repo, schoolId);
    if (!admin) return { cursor, done: true };
    const r = await fixStuckStep(repo, { userId: admin, role: "SCHOOL_ADMIN", schoolId }, cursor, { by: "auto", now });
    return { cursor: r.cursor.phase === "done" ? null : r.cursor, done: r.cursor.phase === "done", progress: { processed: r.processed } };
  },
  async finish(repo, schoolId) {
    const r = await lastFixReport(repo, schoolId);
    return { finishedAt: new Date().toISOString(), published: r?.published ?? 0, classified: r?.classified ?? 0 };
  },
};

/** Once per server process (instrumentation): in the background, never throws. */
export function fixStuckOnceInBackground(repo: Repo): Promise<number> {
  return fixStuckOnce(repo).catch(() => 0);
}
