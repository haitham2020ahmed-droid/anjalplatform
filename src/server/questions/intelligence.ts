/**
 * 🧠 Question Intelligence Layer (database side).
 *
 *   analyzeQuestions   every question becomes a learning object: DOK, difficulty estimated before student data,
 *                      text complexity, misconception tags on wrong options. Missing values are filled with their
 *                      source (RULE); values a person set are never overwritten — a disagreement becomes a
 *                      suggestion for review (AiSuggestion, tool INTEL) instead.
 *   intelligenceOverview  totals: complete, auto-completed (awaiting confirmation), missing per field, needs review
 *   missingList        the questions missing a field (to fix in the editor)
 *   coverage           per skill: easy / medium / hard, DOK 1–4, and what is insufficient or badly distributed
 *   findDuplicateGroups exact copies, near copies and the same objective in other words (inverted index: fast at 8,000+)
 *   confirmMetadata    a teacher/admin confirms the automatic metadata of a skill's questions
 *
 * Workflow: rule/AI suggestion → teacher/admin review → approved metadata → (separately) published question.
 * Nothing here publishes a question.
 */
import { estimateDifficulty, estimateDok, estimateLiteracyTags, isSpellingItem, mergeLiteracyTags, metadataGaps, textLevel, META_FIELDS, type LiteracyTag, type MetaField } from "../../questions/intelligence";
import { LEVEL_TO_B } from "../../config/engine";
import { masterSkills } from "../skills/master";
import { tagOptions } from "../insights/misconception-tags";
import { bumpBankVersion } from "../cache/bank-version";
import { audit } from "../audit";
import type { Actor } from "../auth/rbac";
import { assertCan, ForbiddenError } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { eachLimit } from "../db/parallel";
import { BANK_MODELS, keptWhileUnchanged } from "../cache/kept";

const s = (v: unknown) => String(v ?? "");
const tagsOf = (q: Row): Record<string, unknown> => { let t: unknown = q.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } } return t && typeof t === "object" ? (t as Record<string, unknown>) : {}; };
const bandOf = (level: number) => (level <= 2 ? "easy" : level <= 5 ? "medium" : "hard") as "easy" | "medium" | "hard";
/** an authored level this far from the text-based estimate (and no student data yet) is sent for review */
export const DISAGREE_LEVELS = 3;

type SchoolSkill = Awaited<ReturnType<typeof masterSkills>>[number] & { category: string };
async function schoolQuestionRows(repo: Repo, schoolId: string, grade?: number): Promise<{ skills: SchoolSkill[]; questions: Row[] }> {
  const master = await masterSkills(repo, schoolId, grade ? { grade } : {});
  if (!master.length) return { skills: [], questions: [] };
  const cat = new Map((await repo.findMany("Skill", { id: { in: master.map((k) => k.id) } }, { select: ["id", "category"] })).map((k) => [s(k.id), s(k.category)]));
  const skills: SchoolSkill[] = master.map((k) => ({ ...k, category: cat.get(k.id) ?? "" }));
  const questions = (await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, deletedAt: null })).filter((q) => q.status !== "ARCHIVED");
  return { skills, questions };
}

async function passageText(repo: Repo, qs: Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(qs.map((q) => s(q.passageId)).filter(Boolean))];
  return new Map((ids.length ? await repo.findMany("ReadingPassage", { id: { in: ids } }, { select: ["id", "body"] }) : []).map((p) => [s(p.id), s(p.body)]));
}

/**
 * Analyses questions not analysed yet (or the given ones). Returns what was filled and how many suggestions were made.
 * Bounded: `limit` questions per run (the daily job and the admin button repeat it).
 */
export async function analyzeQuestions(repo: Repo, schoolId: string, opts: { questionIds?: string[]; limit?: number; force?: boolean } = {}, now = new Date()): Promise<{ analysed: number; dokFilled: number; suggestions: number; misconceptions: number; literacyTagged?: number }> {
  let skills: SchoolSkill[], questions: Row[];
  if (opts.questionIds) {
    // only these questions (an edit or an import): never read the whole bank
    if (!opts.questionIds.length) return { analysed: 0, dokFilled: 0, suggestions: 0, misconceptions: 0 };
    questions = await repo.findMany("Question", { id: { in: opts.questionIds.slice(0, 5000) }, deletedAt: null });
    const master = await masterSkills(repo, schoolId);
    const cat = new Map((await repo.findMany("Skill", { id: { in: [...new Set(questions.map((q) => s(q.skillId)))] } }, { select: ["id", "category"] })).map((k) => [s(k.id), s(k.category)]));
    skills = master.filter((k) => cat.has(k.id)).map((k) => ({ ...k, category: cat.get(k.id) ?? "" }));
    const mine = new Set(skills.map((k) => k.id));
    questions = questions.filter((q) => mine.has(s(q.skillId)));
  } else ({ skills, questions } = await schoolQuestionRows(repo, schoolId));
  const pick = questions.filter((q) => (opts.questionIds ? true : opts.force || !q.intelligenceAt)).slice(0, opts.limit ?? 3000);
  if (!pick.length) return { analysed: 0, dokFilled: 0, suggestions: 0, misconceptions: 0 };
  const ids = pick.map((q) => s(q.id));
  const skillOf = new Map(skills.map((k) => [k.id, k]));
  // accepted answers are only needed to find the spelling pattern of spelling items
  const spellIds = pick.filter((q) => isSpellingItem(skillOf.get(s(q.skillId))?.code ?? "")).map((q) => s(q.id));
  const [options, types, passages, answers] = await Promise.all([
    repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "text", "isCorrect"] }),
    repo.findMany("QuestionType", {}, { select: ["id", "code"] }),
    passageText(repo, pick),
    spellIds.length ? repo.findMany("QuestionAnswer", { questionId: { in: spellIds } }, { select: ["questionId", "value"] }) : Promise.resolve([] as Row[]),
  ]);
  const answersBy = new Map<string, string[]>();
  for (const a of answers) { let v: unknown = a.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* plain text */ } } const list = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "string" || typeof x === "number").map(String); answersBy.set(s(a.questionId), [...(answersBy.get(s(a.questionId)) ?? []), ...list]); }
  let literacyTagged = 0;
  const typeCode = new Map(types.map((t) => [s(t.id), s(t.code)]));
  const optsBy = new Map<string, { text: string; correct: boolean }[]>();
  for (const o of options) optsBy.set(s(o.questionId), [...(optsBy.get(s(o.questionId)) ?? []), { text: s(o.text), correct: Boolean(o.isCorrect) }]);
  const open = await repo.findMany("AiSuggestion", { schoolId, tool: "INTEL", status: "SUGGESTED" }, { select: ["questionId"] });
  const pending = new Set(open.map((o) => s(o.questionId)));
  let dokFilled = 0, suggestions = 0;
  // ⚡ the values are computed first, then saved a few at a time and the suggestions in one insert
  const updates: [string, Row][] = [];
  const newSuggestions: Row[] = [];
  for (const q of pick) {
    const k = skillOf.get(s(q.skillId));
    const t = tagsOf(q);
    // DOK: the imported value when there is one, else the rule (never over a person's value)
    const imported = Number(String(t.dok ?? "").replace(/[^0-9]/g, ""));
    let dok = q.dok === null || q.dok === undefined ? null : Number(q.dok), dokSource = q.dokSource ? s(q.dokSource) : null;
    if (dok === null) {
      if (imported >= 1 && imported <= 4) { dok = imported; dokSource = "IMPORT"; } else { dok = estimateDok(k?.code ?? "", s(q.stem), s(k?.category)); dokSource = "RULE"; }
      dokFilled++;
    }
    const passage = q.passageId ? passages.get(s(q.passageId)) ?? null : null;
    const est = estimateDifficulty({ stem: s(q.stem), type: typeCode.get(s(q.typeId)) ?? "MULTIPLE_CHOICE", passage, options: optsBy.get(s(q.id)), dok, grade: k?.grade });
    const calibrated = Boolean(q.calibrated);
    // reading / word-study tags (QAR, level of thinking, context-clue type, spelling pattern): rules fill what is
    // missing; an imported or a person's value is never replaced
    const lit = estimateLiteracyTags({ skillCode: k?.code ?? "", category: k?.category, stem: s(q.stem), passage, options: optsBy.get(s(q.id)), answers: answersBy.get(s(q.id)) });
    const merged = mergeLiteracyTags(t, lit, "RULE");
    if (merged.changed.length) literacyTagged++;
    updates.push([s(q.id), {
      dok, dokSource, estimatedLevel: est.level, estimatedB: est.b, difficultyFactors: est.factors, textLevel: textLevel(s(q.stem), passage),
      // a level a person set (MANUAL/TEACHER) or the data set (DATA, src/server/questions/reclassify.ts) keeps its source
      difficultySource: ["MANUAL", "TEACHER", "DATA"].includes(s(q.difficultySource)) ? s(q.difficultySource) : calibrated ? "CALIBRATED" : q.difficultySource === "ESTIMATE" ? "ESTIMATE" : "AUTHORED", intelligenceAt: now,
      ...(merged.changed.length ? { tags: merged.tags } : {}),
    }]);
    // an authored level far from the estimate (and no student data to settle it): ask a person
    const authored = Number(q.difficultyLevel);
    if (!calibrated && Number.isFinite(authored) && Math.abs(authored - est.level) >= DISAGREE_LEVELS && !pending.has(s(q.id))) {
      const why = Object.entries(est.factors).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f, v]) => `${f} ${Math.round(v * 100)}%`).join(", ");
      newSuggestions.push({
        schoolId, jobId: null, tool: "INTEL", kind: "DIFFICULTY", questionId: q.id, passageId: null, severity: 3,
        detail: `Authored level ${authored}, but the question looks like level ${est.level} (${why}). Approve = use level ${est.level} until student data calibrates it.`,
        data: { from: authored, to: est.level, b: LEVEL_TO_B[est.level], factors: est.factors }, status: "SUGGESTED", createdAt: now,
      });
      pending.add(s(q.id));
      suggestions++;
    }
  }
  await eachLimit(updates, ([id, data]) => repo.updateMany("Question", { id }, data));
  if (newSuggestions.length) await repo.createMany("AiSuggestion", newSuggestions);
  const misconceptions = await tagOptions(repo, { questionIds: ids });
  bumpBankVersion();
  return { analysed: pick.length, dokFilled, suggestions, misconceptions, literacyTagged };
}

/** The skill family / category of a question, so metadataGaps only asks for the literacy tags that apply. */
const metaContext = (skills: SchoolSkill[]) => {
  const by = new Map(skills.map((k) => [k.id, k]));
  return (q: Row) => { const k = by.get(s(q.skillId)); return { family: k?.code ?? "", category: k?.category ?? "", hasPassage: Boolean(q.passageId), stem: s(q.stem) }; };
};

export interface IntelligenceOverview {
  total: number; published: number;
  complete: number; autoCompleted: number; missingAny: number; needsReview: number;
  missing: Record<MetaField, number>;
  sources: { dok: Record<string, number>; difficulty: Record<string, number> };
  openSuggestions: number; notAnalysed: number;
  estimateAgreement: { compared: number; within1: number } ;
}

/** The dashboard numbers (one pass over the school's questions). */
/** ⚡ The overview reads every question of the school with its options and explanations: kept while they are unchanged. */
export function intelligenceOverview(repo: Repo, schoolId: string, grade?: number): Promise<IntelligenceOverview> {
  return keptWhileUnchanged(repo, `qi.overview|${schoolId}|${grade ?? ""}`, INTEL_MODELS, KEEP_MS, () => buildOverview(repo, schoolId, grade));
}
const INTEL_MODELS = [...BANK_MODELS, "QuestionStats", "AiSuggestion"];
const KEEP_MS = 5 * 60_000;

async function buildOverview(repo: Repo, schoolId: string, grade?: number): Promise<IntelligenceOverview> {
  const { skills, questions } = await schoolQuestionRows(repo, schoolId, grade);
  const ctxOf = metaContext(skills);
  const ids = questions.map((q) => s(q.id));
  const [wrong, expl, stats, open] = await Promise.all([
    ids.length ? repo.findMany("QuestionOption", { questionId: { in: ids }, isCorrect: false }, { select: ["questionId", "misconception"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionExplanation", { questionId: { in: ids } }, { select: ["questionId"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionStats", { questionId: { in: ids } }, { select: ["questionId", "flags"] }) : Promise.resolve([] as Row[]),
    repo.findMany("AiSuggestion", { schoolId, status: "SUGGESTED" }, { select: ["questionId"] }),
  ]);
  const wrongBy = new Map<string, Row[]>();
  for (const o of wrong) wrongBy.set(s(o.questionId), [...(wrongBy.get(s(o.questionId)) ?? []), o]);
  const hasExpl = new Set(expl.map((e) => s(e.questionId)));
  const flagged = new Set(stats.filter((x) => { const f = typeof x.flags === "string" ? JSON.parse(x.flags) : x.flags; return Array.isArray(f) && f.length > 0; }).map((x) => s(x.questionId)));
  const suggested = new Set(open.map((o) => s(o.questionId)).filter(Boolean));
  const missing = Object.fromEntries(META_FIELDS.map((f) => [f.key, 0])) as Record<MetaField, number>;
  const out: IntelligenceOverview = { total: questions.length, published: 0, complete: 0, autoCompleted: 0, missingAny: 0, needsReview: 0, missing, sources: { dok: {}, difficulty: {} }, openSuggestions: 0, notAnalysed: 0, estimateAgreement: { compared: 0, within1: 0 } };
  for (const q of questions) {
    const id = s(q.id);
    if (q.status === "PUBLISHED") out.published++;
    const gaps = metadataGaps(q, wrongBy.get(id) ?? [], hasExpl.has(id), ctxOf(q));
    for (const g of gaps) out.missing[g]++;
    if (gaps.length) out.missingAny++;
    else if (!q.metaReviewedAt && (q.dokSource === "RULE" || q.dokSource === "AI")) out.autoCompleted++;
    else out.complete++;
    const review = q.status === "UNDER_REVIEW" || q.status === "DRAFT" || suggested.has(id) || flagged.has(id) || Array.isArray(tagsOf(q).aiNeeds);
    if (review) out.needsReview++;
    if (suggested.has(id)) out.openSuggestions++;
    if (!q.intelligenceAt) out.notAnalysed++;
    const ds = s(q.dokSource || "—"), fs = s(q.difficultySource || "—");
    out.sources.dok[ds] = (out.sources.dok[ds] ?? 0) + 1;
    out.sources.difficulty[fs] = (out.sources.difficulty[fs] ?? 0) + 1;
    if (q.estimatedLevel !== null && q.estimatedLevel !== undefined) { out.estimateAgreement.compared++; if (Math.abs(Number(q.estimatedLevel) - Number(q.difficultyLevel)) <= 1) out.estimateAgreement.within1++; }
  }
  return out;
}

/** Questions missing one field (newest first), for the fix-it list. */
export function missingList(repo: Repo, schoolId: string, field: MetaField, limit = 200): Promise<{ id: string; stem: string; skill: string; status: string; gaps: MetaField[] }[]> {
  return keptWhileUnchanged(repo, `qi.missing|${schoolId}|${field}|${limit}`, INTEL_MODELS, KEEP_MS, () => buildMissingList(repo, schoolId, field, limit));
}
async function buildMissingList(repo: Repo, schoolId: string, field: MetaField, limit = 200): Promise<{ id: string; stem: string; skill: string; status: string; gaps: MetaField[] }[]> {
  const { skills, questions } = await schoolQuestionRows(repo, schoolId);
  const ids = questions.map((q) => s(q.id));
  const [wrong, expl] = await Promise.all([
    ids.length ? repo.findMany("QuestionOption", { questionId: { in: ids }, isCorrect: false }, { select: ["questionId", "misconception"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("QuestionExplanation", { questionId: { in: ids } }, { select: ["questionId"] }) : Promise.resolve([] as Row[]),
  ]);
  const hasExpl = new Set(expl.map((e) => s(e.questionId)));
  const name = new Map(skills.map((k) => [k.id, k.name]));
  const ctxOf = metaContext(skills);
  const out: { id: string; stem: string; skill: string; status: string; gaps: MetaField[] }[] = [];
  for (const q of questions) {
    const gaps = metadataGaps(q, wrong.filter((o) => s(o.questionId) === s(q.id)), hasExpl.has(s(q.id)), ctxOf(q));
    if (gaps.includes(field)) out.push({ id: s(q.id), stem: s(q.stem).slice(0, 160), skill: name.get(s(q.skillId)) ?? "—", status: s(q.status), gaps });
    if (out.length >= limit) break;
  }
  return out;
}

export interface CoverageRow { skillId: string; code: string; name: string; grade: number; total: number; easy: number; medium: number; hard: number; dok: [number, number, number, number]; flags: ("INSUFFICIENT" | "NEEDS_ADVANCED" | "POOR_DISTRIBUTION" | "LOW_DOK")[] }
export const COVERAGE_TARGET = 20;

/** Coverage of published questions per skill: difficulty bands, DOK, and what is wrong with it. */
export function coverage(repo: Repo, schoolId: string, grade?: number): Promise<CoverageRow[]> {
  return keptWhileUnchanged(repo, `qi.coverage|${schoolId}|${grade ?? ""}`, INTEL_MODELS, KEEP_MS, () => buildCoverage(repo, schoolId, grade));
}
async function buildCoverage(repo: Repo, schoolId: string, grade?: number): Promise<CoverageRow[]> {
  const { skills, questions } = await schoolQuestionRows(repo, schoolId, grade);
  const pub = questions.filter((q) => q.status === "PUBLISHED");
  return skills.map((k) => {
    const qs = pub.filter((q) => s(q.skillId) === k.id);
    const b = { easy: 0, medium: 0, hard: 0 }; const dok: [number, number, number, number] = [0, 0, 0, 0];
    for (const q of qs) { b[bandOf(Number(q.difficultyLevel))]++; const d = Number(q.dok ?? 0); if (d >= 1 && d <= 4) dok[d - 1]++; }
    const flags: CoverageRow["flags"] = [];
    if (qs.length < COVERAGE_TARGET) flags.push("INSUFFICIENT");
    if (b.hard < 3) flags.push("NEEDS_ADVANCED");
    if (qs.length >= 6 && (Math.max(b.easy, b.medium, b.hard) / qs.length > 0.7 || !b.easy || !b.hard)) flags.push("POOR_DISTRIBUTION");
    if (qs.length >= 6 && dok[2] + dok[3] === 0 && !["GRAMMAR", "MECHANICS", "PHONICS_WORD_STUDY", "WORD_STUDY"].includes(k.category)) flags.push("LOW_DOK");
    return { skillId: k.id, code: k.code, name: k.name, grade: k.grade, total: qs.length, ...b, dok, flags };
  });
}

// ------------------------------------------------------------------ duplicates

const norm = (t: string) => t.toLowerCase().replace(/[“”"’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["the", "and", "which", "what", "this", "that", "with", "from", "best", "word", "sentence", "does", "for", "are", "was", "his", "her", "they", "their", "you", "your", "will", "how", "why", "who", "when", "where", "into", "about"]);
const toks = (t: string) => new Set(norm(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));

export interface DuplicateGroup { kind: "EXACT" | "SIMILAR" | "SAME_OBJECTIVE"; keep: string; remove: string; score: number; keepStem: string; removeStem: string }

/**
 * Duplicate candidates among a school's questions: EXACT (same words), SIMILAR (≥ 80% of the content words),
 * SAME_OBJECTIVE (same skill and standard, same correct answer, ≥ 45% of the stem words). Candidates come from an
 * inverted index of rare words, so it stays fast with thousands of questions.
 */
export async function findDuplicateGroups(repo: Repo, schoolId: string): Promise<DuplicateGroup[]> {
  const { questions } = await schoolQuestionRows(repo, schoolId);
  const ids = questions.map((q) => s(q.id));
  const opts = ids.length ? await repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "text", "isCorrect"] }) : [];
  const optBy = new Map<string, Row[]>();
  for (const o of opts) optBy.set(s(o.questionId), [...(optBy.get(s(o.questionId)) ?? []), o]);
  const items = questions.map((q) => {
    const o = optBy.get(s(q.id)) ?? [];
    // the type-specific content (sentence parts, word order, pairs) is part of the question: "Tap the error" × 20 are not copies
    const content = typeof q.content === "string" ? q.content : JSON.stringify(q.content ?? {});
    const contentText = content.replace(/[{}\[\]":,]+/g, " ");
    const full = `${s(q.stem)} ${o.map((x) => s(x.text)).join(" ")} ${contentText}`;
    return { q, exact: `${norm(s(q.stem))}|${s(q.passageId)}|${o.map((x) => norm(s(x.text))).sort().join("|")}|${norm(contentText)}`, set: toks(full), stem: toks(`${s(q.stem)} ${contentText}`), key: o.filter((x) => x.isCorrect).map((x) => norm(s(x.text))).sort().join("|") };
  });
  const df = new Map<string, number>();
  for (const it of items) for (const w of it.set) df.set(w, (df.get(w) ?? 0) + 1);
  const index = new Map<string, number[]>();
  items.forEach((it, i) => { const rare = [...it.set].sort((a, b) => (df.get(a)! - df.get(b)!)).slice(0, 4); for (const w of rare) index.set(w, [...(index.get(w) ?? []), i]); });
  const seen = new Set<string>(), out: DuplicateGroup[] = [];
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const jac = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return a.size + b.size ? n / (a.size + b.size - n) : 0; };
  items.forEach((x, i) => {
    const cands = new Set<number>();
    for (const w of x.set) for (const j of index.get(w) ?? []) if (j > i) cands.add(j);
    for (const j of cands) {
      const y = items[j];
      const pair = `${i}|${j}`; if (seen.has(pair)) continue; seen.add(pair);
      let kind: DuplicateGroup["kind"] | null = null, score = 0;
      if (x.exact === y.exact) { kind = "EXACT"; score = 1; }
      else if (s(x.q.passageId) === s(y.q.passageId) && (score = jac(x.set, y.set)) >= 0.8) kind = "SIMILAR";
      else if (s(x.q.skillId) === s(y.q.skillId) && s(x.q.standardId) === s(y.q.standardId) && x.key && x.key === y.key && (score = jac(x.stem, y.stem)) >= 0.45) kind = "SAME_OBJECTIVE";
      if (!kind) continue;
      const older = t(x.q.createdAt) <= t(y.q.createdAt);
      const [k, r] = older ? [x, y] : [y, x];
      out.push({ kind, keep: s(k.q.id), remove: s(r.q.id), score: Math.round(score * 100) / 100, keepStem: s(k.q.stem).slice(0, 200), removeStem: s(r.q.stem).slice(0, 200) });
    }
  });
  const order = { EXACT: 0, SIMILAR: 1, SAME_OBJECTIVE: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || b.score - a.score);
}

/** Puts the duplicate candidates in the admin review queue (approve = archive the newer copy). Returns how many are new. */
export async function queueDuplicates(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const groups = await findDuplicateGroups(repo, schoolId);
  const open = await repo.findMany("AiSuggestion", { schoolId, tool: "DUPLICATE" }, { select: ["data"] });
  const seen = new Set(open.map((o) => { const d = (typeof o.data === "string" ? JSON.parse(o.data) : o.data ?? {}) as Record<string, unknown>; return `${s(d.keep)}|${s(d.remove)}`; }));
  const label = { EXACT: "An exact copy of another question", SIMILAR: "Almost the same as another question", SAME_OBJECTIVE: "Tests the same thing as another question in other words" };
  let n = 0;
  for (const g of groups) {
    if (seen.has(`${g.keep}|${g.remove}`)) continue;
    await repo.create("AiSuggestion", { schoolId, jobId: null, tool: "DUPLICATE", kind: "DUPLICATE", questionId: g.remove, passageId: null, severity: g.kind === "EXACT" ? 2 : g.kind === "SIMILAR" ? 3 : 4, detail: `${label[g.kind]} (${Math.round(g.score * 100)}%). Approve = archive this copy (the older one stays). Reject = keep both.`, data: { ...g }, status: "SUGGESTED", createdAt: now });
    n++;
  }
  return n;
}

/** A teacher/admin confirms the automatic metadata (DOK, misconceptions, estimate) of these questions. */
export async function confirmMetadata(repo: Repo, actor: Actor, questionIds: string[], now = new Date()): Promise<number> {
  assertCan(actor, "questions:review");
  if (!questionIds.length || !actor.schoolId) return 0;
  // only questions whose skill belongs to the actor's school (ids may come from a form)
  const mine = new Set(await skillIdsOfSchool(repo, actor.schoolId));
  const rows = await repo.findMany("Question", { id: { in: questionIds.slice(0, 2000) } }, { select: ["id", "skillId"] });
  const ids = rows.filter((q) => mine.has(String(q.skillId))).map((q) => String(q.id));
  if (!ids.length) return 0;
  const n = await repo.updateMany("Question", { id: { in: ids } }, { metaReviewedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.metadata.confirm", entityType: "Question", entityId: ids[0], after: { count: n }, at: now });
  return n;
}

/** Ids of every skill in this school (Grade → Curriculum → Skill). */
export async function skillIdsOfSchool(repo: Repo, schoolId: string): Promise<string[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  return curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id"] })).map((k) => String(k.id)) : [];
}

/** Confirms the metadata of one skill's questions; refuses a skill of another school. */
export async function confirmSkillMetadata(repo: Repo, actor: Actor, skillId: string, now = new Date()): Promise<number> {
  assertCan(actor, "questions:review");
  if (!actor.schoolId || !(await skillIdsOfSchool(repo, actor.schoolId)).includes(skillId)) throw new ForbiddenError("Skill not found in this school.");
  const ids = (await repo.findMany("Question", { skillId, deletedAt: null }, { select: ["id"] })).map((q) => String(q.id));
  return confirmMetadata(repo, actor, ids, now);
}

// ------------------------------------------------------------------ accuracy by literacy tag

export interface TagAccuracy { value: string; answers: number; correct: number; accuracy: number; students: number }

/**
 * Accuracy of these students per value of one literacy tag (e.g. per QAR type: Right There 82%, Author and Me 54%),
 * from their (careful) answers in the last `days`. Questions without the tag are left out. For teacher reports.
 */
export async function accuracyByTag(repo: Repo, studentIds: string[], tag: LiteracyTag, opts: { days?: number; now?: Date; skillIds?: string[] } = {}): Promise<TagAccuracy[]> {
  if (!studentIds.length) return [];
  const where: Record<string, unknown> = { studentId: { in: studentIds } };
  if (opts.days) where.createdAt = { gte: new Date((opts.now ?? new Date()).getTime() - opts.days * 86_400_000) };
  if (opts.skillIds?.length) where.skillId = { in: opts.skillIds };
  const attempts = (await repo.findMany("QuestionAttempt", where, { select: ["studentId", "questionId", "isCorrect", "rapidGuess"] })).filter((a) => !a.rapidGuess);
  const qIds = [...new Set(attempts.map((a) => s(a.questionId)))];
  if (!qIds.length) return [];
  const valueOf = new Map<string, string>();
  for (let i = 0; i < qIds.length; i += 1000) {
    for (const q of await repo.findMany("Question", { id: { in: qIds.slice(i, i + 1000) } }, { select: ["id", "tags"] })) {
      const v = tagsOf(q)[tag];
      if (typeof v === "string" && v) valueOf.set(s(q.id), v);
    }
  }
  const acc = new Map<string, { answers: number; correct: number; students: Set<string> }>();
  for (const a of attempts) {
    const v = valueOf.get(s(a.questionId));
    if (!v) continue;
    const r = acc.get(v) ?? { answers: 0, correct: 0, students: new Set<string>() };
    r.answers++; if (a.isCorrect) r.correct++; r.students.add(s(a.studentId));
    acc.set(v, r);
  }
  return [...acc.entries()]
    .map(([value, r]) => ({ value, answers: r.answers, correct: r.correct, accuracy: Math.round((r.correct / r.answers) * 100), students: r.students.size }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answers - a.answers);
}
