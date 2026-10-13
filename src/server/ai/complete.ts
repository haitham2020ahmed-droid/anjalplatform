/**
 * ✨ AI completion of imported questions. A file may leave columns empty (answer, explanation, skill, standard,
 * grade); the import fills what rules can decide and marks the rest on the question (tags.aiNeeds). This job asks
 * the platform's AI (Gemini, through the same engine, limits and checks as the other AI tools) to complete them:
 *   answer       the correct choice(s) — the question stays a DRAFT marked “AI filled · check” until someone
 *                approves it (a wrong key must never reach students)
 *   explanation  why the answer is correct (students see it after answering)
 *   skill        one of the grade's skills (codes only from the list)
 *   standard     one of the grade's CCSS standards (codes only from the list)
 * Then the question's MAP test and instructional area are decided again. No student data is ever sent.
 */
import { randomBytes } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { bumpBankVersion } from "../cache/bank-version";
import { audit } from "../audit";
import { callJson, type Picked, type Validator } from "./engine";
import { questionContent, tagContext, type QItem } from "./tools";
import { GENERIC_WRONG_FEEDBACK } from "../../imports/questions/template";

const s = (v: unknown) => String(v ?? "");
const tagsOf = (q: Row): Record<string, unknown> => { let t: unknown = q.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } } return t && typeof t === "object" ? { ...(t as Record<string, unknown>) } : {}; };
export const NEED_FIELDS = ["answer", "explanation", "skill", "standard", "grade"] as const;
const needsOf = (q: Row) => { const n = tagsOf(q).aiNeeds; return Array.isArray(n) ? n.map(String).filter((x) => (NEED_FIELDS as readonly string[]).includes(x)) : []; };

/** After an import: one COMPLETE job for its questions that still have gaps (picked up by the AI queue). */
export async function queueCompletion(repo: Repo, actor: Actor, importJobId: string, now = new Date()): Promise<{ id: string; total: number } | null> {
  const schoolId = s(actor.schoolId);
  const logs = await repo.findMany("ImportedQuestionLog", { jobId: importJobId }, { select: ["questionId"] });
  const ids = logs.map((l) => s(l.questionId)).filter(Boolean);
  if (!ids.length) return null;
  const qs = (await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "tags"] })).filter((q) => needsOf(q).length);
  if (!qs.length) return null;
  // one open job per import: questions already queued are not queued again
  // ⚡ only the open jobs are read (not every completion job the school ever ran)
  const open = (await repo.findMany("AiJob", { schoolId, tool: "COMPLETE", status: { in: ["QUEUED", "RUNNING"] } }, { select: ["id", "status", "scope"] })).filter((j) => (j.status === "QUEUED" || j.status === "RUNNING") && s((j.scope as Record<string, unknown> | null)?.importJob) === importJobId);
  const queued = open.length ? new Set((await repo.findMany("AiJobItem", { jobId: { in: open.map((j) => j.id) } }, { select: ["targetId"] })).map((i) => s(i.targetId))) : new Set<string>();
  const fresh = qs.filter((q) => !queued.has(s(q.id)));
  if (!fresh.length) return null;
  const job = await repo.create("AiJob", { schoolId, tool: "COMPLETE", scope: { importJob: importJobId }, status: "QUEUED", total: fresh.length, done: 0, failed: 0, createdById: actor.userId, createdAt: now, updatedAt: now });
  await repo.createMany("AiJobItem", fresh.map((q) => ({ id: `${s(job.id).slice(0, 12)}${randomBytes(6).toString("hex")}${s(q.id).slice(-6)}`, jobId: job.id, targetId: s(q.id), status: "PENDING", attempts: 0, error: null, updatedAt: now })));
  await audit(repo, { actorId: actor.userId, action: "ai.job.create", entityType: "AiJob", entityId: s(job.id), after: { tool: "COMPLETE", importJob: importJobId, total: fresh.length }, at: now });
  return { id: s(job.id), total: fresh.length };
}

// ------------------------------------------------------------------ prompt and checks

export interface CompleteResult { id: string; correctLabels?: string[]; answerText?: string; trueFalse?: boolean; explanation?: string; skillCode?: string; standard?: string }
type Ctx = Awaited<ReturnType<typeof tagContext>>["ctx"];

export function completePrompt(c: Ctx, qs: (QItem & { needs: string[] })[]): { system: string; user: Record<string, unknown> } {
  return {
    system: [
      `You complete Grade ${c.grade} English Language Arts questions that were imported with empty fields. For each question fill ONLY the fields listed in "needs":`,
      'answer → "correctLabels" (the letter(s) of the correct option(s); one letter unless type is MULTI_SELECT), or "trueFalse" (true/false) for TRUE_FALSE, or "answerText" for FILL_BLANK;',
      'explanation → "explanation" (one or two short sentences a student understands: why the answer is correct);',
      'skill → "skillCode" (ONLY from allowed.skills); standard → "standard" (ONLY from allowed.standards, e.g. RL.4.2); grade → choose skillCode and standard of this grade.',
      "Read the passage when there is one. Never invent codes.",
      'Return ONLY JSON: {"results":[{"id":"…","correctLabels":["B"],"explanation":"…","skillCode":"…","standard":"RL.4.2"}]} — one result for EVERY question id.',
    ].join(" "),
    user: {
      task: "Complete imported questions", grade: c.grade, allowed: { skills: c.skills, standards: c.standards },
      questions: qs.map((q) => ({ id: q.id, type: q.type, stem: q.stem, options: q.options.map((o) => ({ label: o.label, text: o.text })), passage: q.passage, needs: q.needs })),
    },
  };
}

export function completeValidator(c: Ctx, qs: (QItem & { needs: string[] })[]): Validator<CompleteResult[]> {
  const skills = new Set(c.skills.map((k) => k.code)), stds = new Set(c.standards.map((x) => x.code));
  return (data) => {
    const list = (data as { results?: unknown })?.results;
    if (!Array.isArray(list)) return { ok: false, error: "missing the “results” list" };
    const out: CompleteResult[] = [];
    for (const raw of list) {
      const r = raw as Record<string, unknown>, q = qs.find((x) => x.id === s(r.id));
      if (!q) return { ok: false, error: `unknown id “${s(r.id)}”` };
      const res: CompleteResult = { id: q.id };
      if (q.needs.includes("answer")) {
        if (q.type === "TRUE_FALSE") { if (typeof r.trueFalse !== "boolean") return { ok: false, error: `question ${q.id}: trueFalse must be true or false` }; res.trueFalse = r.trueFalse; }
        else if (q.type === "FILL_BLANK") { if (!s(r.answerText).trim()) return { ok: false, error: `question ${q.id}: answerText is empty` }; res.answerText = s(r.answerText).trim().slice(0, 200); }
        else if (q.options.length) {
          const labels = Array.isArray(r.correctLabels) ? r.correctLabels.map((x) => s(x).trim().toUpperCase()) : [];
          if (!labels.length || labels.some((l) => !q.options.some((o) => o.label === l))) return { ok: false, error: `question ${q.id}: correctLabels must be letters of its options` };
          if (q.type !== "MULTI_SELECT" && labels.length !== 1) return { ok: false, error: `question ${q.id}: exactly one correct label` };
          res.correctLabels = [...new Set(labels)];
        }
      }
      if (q.needs.includes("explanation")) { const e = s(r.explanation).trim(); if (!e) return { ok: false, error: `question ${q.id}: explanation is empty` }; res.explanation = e.slice(0, 1000); }
      if (q.needs.includes("skill") || q.needs.includes("grade")) { if (!skills.has(s(r.skillCode))) return { ok: false, error: `question ${q.id}: skillCode “${s(r.skillCode)}” is not in allowed.skills` }; res.skillCode = s(r.skillCode); }
      if (q.needs.includes("standard") || q.needs.includes("grade")) { const st = s(r.standard).replace(/^CCSS\.ELA-LITERACY\./, ""); if (!stds.has(st)) return { ok: false, error: `question ${q.id}: standard “${st}” is not in allowed.standards` }; res.standard = st; }
      out.push(res);
    }
    if (out.length !== qs.length) return { ok: false, error: "one result is needed for every question" };
    return { ok: true, value: out };
  };
}

// ------------------------------------------------------------------ one batch (called by the AI queue)

/** Saves what the AI completed on one question (pure database writes, also used by the tests). */
export async function saveCompletion(repo: Repo, schoolId: string, q: QItem, needs: string[], r: CompleteResult, skills: { id: string; code: string }[], now: Date): Promise<string[]> {
  const filled: string[] = [];
  if (r.correctLabels) {
    for (const o of await repo.findMany("QuestionOption", { questionId: q.id })) {
      const correct = r.correctLabels.includes(s(o.label));
      await repo.updateMany("QuestionOption", { id: o.id }, { isCorrect: correct, rationale: correct ? null : o.rationale ?? GENERIC_WRONG_FEEDBACK });
    }
    filled.push("answer");
  }
  if (r.trueFalse !== undefined || r.answerText) {
    await repo.deleteMany("QuestionAnswer", { questionId: q.id });
    await repo.create("QuestionAnswer", { questionId: q.id, value: r.trueFalse !== undefined ? r.trueFalse : r.answerText!, isPrimary: true });
    filled.push("answer");
  }
  if (r.explanation) {
    await repo.deleteMany("QuestionExplanation", { questionId: q.id, kind: "WHY_CORRECT" });
    await repo.create("QuestionExplanation", { questionId: q.id, kind: "WHY_CORRECT", body: [{ type: "text", text: r.explanation }], order: 0 });
    filled.push("explanation");
  }
  const patch: Record<string, unknown> = {};
  if (r.skillCode) { const sk = skills.find((k) => k.code === r.skillCode); if (sk && sk.id !== q.skillId) patch.skillId = sk.id; filled.push("skill"); }
  if (r.standard) {
    const all = await repo.findMany("Standard", { framework: "CCSS_ELA" }, { select: ["id", "code"] });
    const hit = all.find((x) => s(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase() === r.standard!.toUpperCase());
    if (hit) { patch.standardId = hit.id; filled.push("standard"); }
  }
  if (needs.includes("grade") && (r.skillCode || r.standard)) filled.push("grade");
  const row = await repo.findUnique("Question", { id: q.id });
  const t = row ? tagsOf(row) : {};
  const left = needs.filter((n) => !filled.includes(n));
  const prev = (t.aiFilled as { fields?: string[] } | undefined)?.fields ?? [];
  t.aiFilled = { fields: [...new Set([...prev, ...filled])], at: now.toISOString(), review: filled.includes("answer") || Boolean((t.aiFilled as { review?: boolean } | undefined)?.review) };
  if (left.length) t.aiNeeds = left; else delete t.aiNeeds;
  await repo.updateMany("Question", { id: q.id }, { ...patch, tags: t, updatedAt: now });
  const { autoClassify } = await import("../map/question-areas");
  await autoClassify(repo, schoolId, [q.id], now);
  bumpBankVersion();
  return filled;
}

export async function runCompletionBatch(repo: Repo, schoolId: string, j: Row, items: Row[], picked: Extract<Picked, { ok: true }>, now: Date, failed: (it: Row, reason: string) => Promise<void>): Promise<{ stop: boolean; message: string | null }> {
  const qs = await questionContent(repo, items.map((i) => s(i.targetId)));
  for (const it of items) if (!qs.some((q) => q.id === it.targetId)) await repo.updateMany("AiJobItem", { id: it.id }, { status: "FAILED", error: "The question was archived or deleted.", updatedAt: now });
  if (!qs.length) return { stop: false, message: null };
  const rows = await repo.findMany("Question", { id: { in: qs.map((q) => q.id) } }, { select: ["id", "tags"] });
  const withNeeds = qs.map((q) => ({ ...q, needs: needsOf(rows.find((r) => r.id === q.id) ?? {}) }));
  const done = withNeeds.filter((q) => !q.needs.length);
  for (const q of done) { const it = items.find((x) => x.targetId === q.id)!; await repo.updateMany("AiJobItem", { id: it.id }, { status: "DONE", updatedAt: now }); }
  const todo = withNeeds.filter((q) => q.needs.length);
  if (!todo.length) return { stop: false, message: null };
  // one grade per call: the first question's grade (the rest wait for their own batch)
  const grades = await skillGrade(repo, todo.map((q) => q.skillId));
  const grade = grades.get(todo[0].skillId) ?? 5;
  const batch = todo.filter((q) => (grades.get(q.skillId) ?? 5) === grade);
  const { ctx, skills } = await tagContext(repo, schoolId, grade);
  const { system, user } = completePrompt(ctx, batch);
  const r = await callJson(repo, { schoolId, tool: "COMPLETE", picked, items: batch.length }, system, user, completeValidator(ctx, batch));
  if (!r.ok) { if (!r.stop) for (const q of batch) await failed(items.find((x) => x.targetId === q.id)!, r.error); return { stop: r.stop, message: r.error }; }
  for (const q of batch) {
    const it = items.find((x) => x.targetId === q.id)!, res = r.value.find((x) => x.id === q.id)!;
    await saveCompletion(repo, schoolId, q, q.needs, res, skills.map((k) => ({ id: k.id, code: k.code })), now);
    await repo.updateMany("AiJobItem", { id: it.id }, { status: "DONE", attempts: Number(it.attempts ?? 0) + 1, error: null, updatedAt: now });
  }
  return { stop: false, message: null };
}

async function skillGrade(repo: Repo, skillIds: string[]): Promise<Map<string, number>> {
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: [...new Set(skillIds)] } }, { select: ["id", "curriculumId"] }) : [];
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }) : [];
  return new Map(skills.map((k) => [s(k.id), Number(grades.find((g) => g.id === curs.find((c) => c.id === k.curriculumId)?.gradeId)?.level ?? 5)]));
}

/** Questions the AI completed whose answer must still be checked (bank filter “AI filled · check”). */
export function needsAnswerCheck(tags: unknown): boolean {
  let t: unknown = tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
  const f = (t as { aiFilled?: { review?: boolean } } | null)?.aiFilled;
  return Boolean(f?.review);
}
