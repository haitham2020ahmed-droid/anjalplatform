/**
 * 🧵 AI jobs: a queue of small batches that survives interruptions. A job (Quality Check, Auto-Tag, Reading Level)
 * lists its items; each “tick” sends ONE batch when the rate limits allow, validates the reply, saves the results
 * as AI-suggested, and marks items done (or failed after 3 tries, with the reason). Closing the page simply
 * pauses it: opening the AI tools again continues where it stopped.
 * Review: Approve / Reject one by one or Approve all; nothing in the bank changes before approval.
 */
import { randomBytes } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { bumpBankVersion } from "../cache/bank-version";
import { masterSkills } from "../skills/master";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Picked } from "./engine";
import { codeChecks, findDuplicates, formulaLevel, qualityPrompt, qualityValidator, questionContent, readingPrompt, readingValidator, SEVERITY, tagContext, tagPrompt, tagValidator, type PItem } from "./tools";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export type Tool = "QUALITY" | "TAG" | "READING";
export const TOOL_NAME: Record<Tool | "DUPLICATE" | "GAP", string> = { QUALITY: "Quality Check", TAG: "Auto-Tag", READING: "Reading Level Estimate", DUPLICATE: "Duplicate Finder", GAP: "Gap Report" };
const MAX_TRIES = 3;
export interface Scope { grade?: number; skillId?: string; section?: string; new?: boolean }

function assertAdmin(actor: Actor) {
  assertCan(actor, "questions:publish");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins use the AI tools.");
}
const tagsOf = (q: Row): Record<string, unknown> => { let t: unknown = q.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } } return t && typeof t === "object" ? (t as Record<string, unknown>) : {}; };

// ------------------------------------------------------------------ scope → questions / passages

export async function scopeQuestionIds(repo: Repo, schoolId: string, scope: Scope): Promise<string[]> {
  if (scope.new) return newQuestionIds(repo, schoolId);
  const skills = await masterSkills(repo, schoolId, scope.grade ? { grade: scope.grade } : {});
  const skillIds = scope.skillId ? skills.filter((k) => k.id === scope.skillId).map((k) => k.id) : skills.map((k) => k.id);
  if (!skillIds.length) return [];
  let ids = (await repo.findMany("Question", { skillId: { in: skillIds }, deletedAt: null }, { select: ["id", "status"] })).filter((q) => q.status !== "ARCHIVED").map((q) => s(q.id));
  if (scope.section && ids.length) {
    const nodes = await repo.findMany("CurriculumMapNode", { categoryType: scope.section }, { select: ["id"] });
    const parentIds = nodes.map((n) => n.id);
    const children = parentIds.length ? await repo.findMany("CurriculumMapNode", { parentId: { in: parentIds } }, { select: ["id"] }) : [];
    const ok = new Set((await repo.findMany("QuestionMapLink", { nodeId: { in: [...parentIds, ...children.map((c) => c.id)] } }, { select: ["questionId"] })).map((l) => s(l.questionId)));
    ids = ids.filter((id) => ok.has(id));
  }
  return ids;
}

/** Passages used by the questions of this scope. */
export async function scopePassages(repo: Repo, schoolId: string, scope: Scope): Promise<string[]> {
  const ids = await scopeQuestionIds(repo, schoolId, scope);
  if (!ids.length) return [];
  return [...new Set((await repo.findMany("Question", { id: { in: ids } }, { select: ["passageId"] })).map((q) => s(q.passageId)).filter(Boolean))];
}

/** “New” = added after the AI tools were switched on and not yet checked + tagged. */
export async function newQuestionIds(repo: Repo, schoolId: string): Promise<string[]> {
  const since = await aiSince(repo, schoolId);
  const skills = await masterSkills(repo, schoolId);
  if (!skills.length) return [];
  const qs = await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, deletedAt: null }, { select: ["id", "status", "tags", "createdAt"] });
  return qs.filter((q) => q.status !== "ARCHIVED" && time(q.createdAt) >= since && !((tagsOf(q).ai as Record<string, unknown> | undefined)?.quality && (tagsOf(q).ai as Record<string, unknown> | undefined)?.tag)).map((q) => s(q.id));
}

async function setting(repo: Repo, schoolId: string, key: string): Promise<Record<string, unknown>> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}
async function saveSetting(repo: Repo, schoolId: string, key: string, value: Record<string, unknown>, by: string | null, now = new Date()) {
  await repo.upsert("SchoolSetting", { schoolId, key }, { value, updatedById: by, updatedAt: now }, { value, updatedById: by, updatedAt: now });
}
/** The moment the AI tools were first opened (questions added after it are “New”). */
export async function aiSince(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const v = await setting(repo, schoolId, "ai.since");
  if (v.at) return time(v.at);
  await saveSetting(repo, schoolId, "ai.since", { at: now.toISOString() }, null, now);
  return now.getTime();
}

// ------------------------------------------------------------------ jobs

export async function createJob(repo: Repo, actor: Actor, tool: Tool, scope: Scope, now = new Date()): Promise<{ id: string; total: number }> {
  assertAdmin(actor);
  const ids = tool === "READING" ? await scopePassages(repo, actor.schoolId!, scope) : await scopeQuestionIds(repo, actor.schoolId!, scope);
  if (!ids.length) throw new ValidationError(tool === "READING" ? "No passages in this selection." : "No questions in this selection.");
  const job = await repo.create("AiJob", { schoolId: actor.schoolId!, tool, scope, status: "QUEUED", total: ids.length, done: 0, failed: 0, createdById: actor.userId, createdAt: now, updatedAt: now });
  await repo.createMany("AiJobItem", ids.map((targetId) => ({ id: `${s(job.id).slice(0, 12)}${randomBytes(6).toString("hex")}${targetId.slice(-6)}`, jobId: job.id, targetId, status: "PENDING", attempts: 0, error: null, updatedAt: now })));
  await audit(repo, { actorId: actor.userId, action: "ai.job.create", entityType: "AiJob", entityId: s(job.id), after: { tool, scope, total: ids.length }, at: now });
  return { id: s(job.id), total: ids.length };
}

export interface JobView { id: string; tool: Tool; toolName: string; scope: Scope; status: string; total: number; done: number; failed: number; createdAt: string; note: string | null }
const view = (j: Row): JobView => ({ id: s(j.id), tool: s(j.tool) as Tool, toolName: TOOL_NAME[s(j.tool) as Tool] ?? s(j.tool), scope: (j.scope ?? {}) as Scope, status: s(j.status), total: Number(j.total), done: Number(j.done), failed: Number(j.failed), createdAt: new Date(time(j.createdAt)).toISOString(), note: j.note ? s(j.note) : null });

export async function listJobs(repo: Repo, actor: Actor, limit = 20): Promise<JobView[]> {
  assertAdmin(actor);
  return (await repo.findMany("AiJob", { schoolId: actor.schoolId })).sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, limit).map(view);
}
export async function getJob(repo: Repo, actor: Actor, id: string): Promise<JobView> {
  assertAdmin(actor);
  const j = await repo.findUnique("AiJob", { id });
  if (!j || s(j.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  return view(j);
}
export async function stopJob(repo: Repo, actor: Actor, id: string): Promise<void> {
  await getJob(repo, actor, id);
  await repo.updateMany("AiJob", { id }, { status: "STOPPED", updatedAt: new Date() });
}

export interface TickResult { job: JobView | null; waitMs: number; message: string | null; idle: boolean }

/** One step of the queue: the oldest unfinished job (or the one asked for) gets ONE batch, if the limits allow. */
export async function tick(repo: Repo, actor: Actor, env: EnvLike, opts: { jobId?: string; now?: Date; picked?: Picked } = {}): Promise<TickResult> {
  assertAdmin(actor);
  const now = opts.now ?? new Date();
  const jobs = (await repo.findMany("AiJob", { schoolId: actor.schoolId })).filter((j) => (opts.jobId ? j.id === opts.jobId : true) && (j.status === "QUEUED" || j.status === "RUNNING")).sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const j = jobs[0];
  if (!j) return { job: opts.jobId ? await getJob(repo, actor, opts.jobId) : null, waitMs: 0, message: null, idle: true };
  const settings = await aiSettings(repo, actor.schoolId);
  const picked = opts.picked ?? pickProvider(env, settings);
  if (!picked.ok) return { job: view(j), waitMs: 0, message: picked.reason, idle: true };
  const rate = await rateState(repo, actor.schoolId!, settings, now);
  if (rate.waitMs > 0) return { job: view(j), waitMs: Math.min(rate.waitMs, 3_600_000), message: rate.reason ?? `Waiting ${Math.ceil(rate.waitMs / 1000)} s (free-tier limit: ${settings.perMinute} requests a minute).`, idle: false };
  const pending = (await repo.findMany("AiJobItem", { jobId: j.id, status: "PENDING" })).slice(0, s(j.tool) === "READING" ? Math.min(3, settings.batch) : settings.batch);
  if (!pending.length) {
    await repo.updateMany("AiJob", { id: j.id }, { status: "DONE", finishedAt: now, updatedAt: now });
    return { job: view((await repo.findUnique("AiJob", { id: j.id }))!), waitMs: 0, message: null, idle: false };
  }
  if (j.status === "QUEUED") await repo.updateMany("AiJob", { id: j.id }, { status: "RUNNING", updatedAt: now });
  const r = await runBatch(repo, actor, j, pending, picked, now);
  const items = await repo.findMany("AiJobItem", { jobId: j.id }, { select: ["status"] });
  await repo.updateMany("AiJob", { id: j.id }, { done: items.filter((x) => x.status === "DONE").length, failed: items.filter((x) => x.status === "FAILED").length, note: r.message, updatedAt: now });
  return { job: view((await repo.findUnique("AiJob", { id: j.id }))!), waitMs: r.stop ? 60_000 : 0, message: r.message, idle: false };
}

async function itemFailed(repo: Repo, it: Row, reason: string, now: Date) {
  const tries = Number(it.attempts ?? 0) + 1;
  await repo.updateMany("AiJobItem", { id: it.id }, { attempts: tries, status: tries >= MAX_TRIES ? "FAILED" : "PENDING", error: reason.slice(0, 500), updatedAt: now });
}

async function runBatch(repo: Repo, actor: Actor, j: Row, items: Row[], picked: Extract<Picked, { ok: true }>, now: Date): Promise<{ stop: boolean; message: string | null }> {
  const schoolId = actor.schoolId!, tool = s(j.tool) as Tool, scope = (j.scope ?? {}) as Scope;
  const ctx = { schoolId, tool, picked, items: items.length };
  if (tool === "READING") {
    const ps: PItem[] = (await repo.findMany("ReadingPassage", { id: { in: items.map((i) => s(i.targetId)) } }, { select: ["id", "title", "body", "genre"] })).map((p) => ({ id: s(p.id), title: s(p.title), text: s(p.body), genre: p.genre ? s(p.genre) : null }));
    const grade = scope.grade ?? 5;
    const { system, user } = readingPrompt(grade, ps);
    const r = await callJson(repo, ctx, system, user, readingValidator(ps));
    if (!r.ok) { if (!r.stop) for (const it of items) await itemFailed(repo, it, r.error, now); return { stop: r.stop, message: r.error }; }
    for (const it of items) {
      const p = ps.find((x) => x.id === it.targetId), res = r.value.find((x) => x.id === it.targetId);
      if (!p || !res) { await itemFailed(repo, it, "No answer for this passage.", now); continue; }
      const f = formulaLevel(p.text, grade);
      await repo.create("AiSuggestion", { schoolId, jobId: j.id, tool, kind: "READING_LEVEL", passageId: p.id, questionId: null, severity: 3, detail: `Estimated reading level: Grade ${res.gradeLevel} (${res.band.toLowerCase()} level) by AI · Grade ${f.gradeLevel} by formula. ${res.reason}`, data: { ai: res, formula: f, combined: Math.round(((res.gradeLevel + f.gradeLevel) / 2) * 10) / 10 }, status: "SUGGESTED", createdAt: now });
      await repo.updateMany("AiJobItem", { id: it.id }, { status: "DONE", attempts: Number(it.attempts ?? 0) + 1, error: null, updatedAt: now });
    }
    return { stop: false, message: null };
  }
  const qs = await questionContent(repo, items.map((i) => s(i.targetId)));
  for (const it of items) if (!qs.some((q) => q.id === it.targetId)) await repo.updateMany("AiJobItem", { id: it.id }, { status: "FAILED", error: "The question was archived or deleted.", updatedAt: now });
  if (!qs.length) return { stop: false, message: null };
  const grades = await skillGrades(repo, qs.map((q) => q.skillId));
  const grade = scope.grade ?? grades.get(qs[0].skillId) ?? 5;
  if (tool === "QUALITY") {
    const { system, user } = qualityPrompt(grade, qs);
    const r = await callJson(repo, ctx, system, user, qualityValidator(qs));
    if (!r.ok) { if (!r.stop) for (const it of items) await itemFailed(repo, it, r.error, now); return { stop: r.stop, message: r.error }; }
    for (const q of qs) {
      const it = items.find((x) => x.targetId === q.id)!, res = r.value.find((x) => x.id === q.id);
      if (!res) { await itemFailed(repo, it, "No answer for this question.", now); continue; }
      const findings = codeChecks(q);
      const keyed = q.options.filter((o) => o.correct).map((o) => o.label).sort().join(",");
      if (!res.keyIsCorrect && q.options.length && res.correctLabels.sort().join(",") !== keyed && !findings.some((f) => f.kind === "KEY_ERROR")) findings.push({ kind: "KEY_ERROR", severity: 1, detail: `The keyed answer ${keyed || "—"} looks wrong; the AI thinks the answer is ${res.correctLabels.join(", ") || "none of the options"}.`, data: { by: "ai", correctLabels: res.correctLabels } });
      if (res.correctLabels.length > 1 && (q.type === "MULTIPLE_CHOICE" || q.type === "DROPDOWN") && !findings.some((f) => f.kind === "MULTIPLE_CORRECT")) findings.push({ kind: "MULTIPLE_CORRECT", severity: 1, detail: `More than one option could be correct: ${res.correctLabels.join(", ")}.`, data: { by: "ai", correctLabels: res.correctLabels } });
      for (const i of res.issues) if (!findings.some((f) => f.kind === i.type)) findings.push({ kind: i.type, severity: SEVERITY[i.type], detail: i.detail, data: { by: "ai", suggestion: i.suggestion } });
      for (const f of findings) await repo.create("AiSuggestion", { schoolId, jobId: j.id, tool, kind: f.kind, questionId: q.id, passageId: null, severity: f.severity, detail: f.detail, data: f.data, status: "SUGGESTED", createdAt: now });
      await markChecked(repo, q.id, "quality", now);
      await repo.updateMany("AiJobItem", { id: it.id }, { status: "DONE", attempts: Number(it.attempts ?? 0) + 1, error: null, updatedAt: now });
    }
    return { stop: false, message: null };
  }
  // TAG
  const { ctx: tctx, skills } = await tagContext(repo, schoolId, grade);
  const stdRows = await repo.findMany("Standard", { id: { in: [...new Set(qs.map((q) => s(q.standardId)).filter(Boolean))] } }, { select: ["id", "code"] });
  const withCurrent = qs.map((q) => ({ ...q, currentSkill: skills.find((k) => k.id === q.skillId)?.code ?? "", currentStandard: stdRows.find((x) => x.id === q.standardId) ? s(stdRows.find((x) => x.id === q.standardId)!.code).replace(/^CCSS\.ELA-LITERACY\./, "") : null }));
  const { system, user } = tagPrompt(tctx, withCurrent);
  const r = await callJson(repo, ctx, system, user, tagValidator(tctx, qs));
  if (!r.ok) { if (!r.stop) for (const it of items) await itemFailed(repo, it, r.error, now); return { stop: r.stop, message: r.error }; }
  for (const q of withCurrent) {
    const it = items.find((x) => x.targetId === q.id)!, res = r.value.find((x) => x.id === q.id);
    if (!res) { await itemFailed(repo, it, "No answer for this question.", now); continue; }
    const changes = [res.skillCode !== q.currentSkill && `skill → ${skills.find((k) => k.code === res.skillCode)?.name ?? res.skillCode}`, res.standard !== q.currentStandard && `standard → ${res.standard}`, res.difficulty !== q.difficulty && `difficulty ${q.difficulty} → ${res.difficulty}`].filter(Boolean);
    await repo.create("AiSuggestion", { schoolId, jobId: j.id, tool, kind: "TAG", questionId: q.id, passageId: null, severity: changes.length ? 3 : 5, detail: `${res.level.toLowerCase()} level · ${res.standard} · ${res.goalArea}${changes.length ? ` · changes: ${changes.join("; ")}` : " · no change"} (confidence ${Math.round(res.confidence * 100)}%)`, data: { ...res, skillId: skills.find((k) => k.code === res.skillCode)?.id ?? null, from: { skill: q.currentSkill, standard: q.currentStandard, difficulty: q.difficulty } }, status: "SUGGESTED", createdAt: now });
    await markChecked(repo, q.id, "tag", now);
    await repo.updateMany("AiJobItem", { id: it.id }, { status: "DONE", attempts: Number(it.attempts ?? 0) + 1, error: null, updatedAt: now });
  }
  return { stop: false, message: null };
}

async function skillGrades(repo: Repo, skillIds: string[]): Promise<Map<string, number>> {
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: [...new Set(skillIds)] } }, { select: ["id", "curriculumId"] }) : [];
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }) : [];
  return new Map(skills.map((k) => [s(k.id), Number(grades.find((g) => g.id === curs.find((c) => c.id === k.curriculumId)?.gradeId)?.level ?? 5)]));
}

async function markChecked(repo: Repo, questionId: string, what: "quality" | "tag", now: Date) {
  const q = await repo.findUnique("Question", { id: questionId });
  if (!q) return;
  const t = tagsOf(q);
  await repo.updateMany("Question", { id: questionId }, { tags: { ...t, ai: { ...((t.ai as Record<string, unknown>) ?? {}), [what]: now.toISOString() } } });
}

// ------------------------------------------------------------------ Duplicate Finder (instant, code)

export async function runDuplicates(repo: Repo, actor: Actor, scope: Scope, now = new Date()): Promise<number> {
  assertAdmin(actor);
  const ids = await scopeQuestionIds(repo, actor.schoolId!, scope.skillId ? { grade: scope.grade } : scope);   // across sections of the grade
  const pairs = (await findDuplicates(repo, ids)).filter((p) => !scope.skillId || ids.length);
  const skillOf = new Map((await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId", "createdAt"] })).map((q) => [s(q.id), q]));
  const relevant = scope.skillId ? pairs.filter((p) => s(skillOf.get(p.a)?.skillId) === scope.skillId || s(skillOf.get(p.b)?.skillId) === scope.skillId) : pairs;
  const open = await repo.findMany("AiSuggestion", { schoolId: actor.schoolId, tool: "DUPLICATE", status: "SUGGESTED" }, { select: ["data"] });
  const seen = new Set(open.map((o) => { const d = o.data as Record<string, unknown>; return `${s(d.keep)}|${s(d.remove)}`; }));
  let n = 0;
  for (const p of relevant) {
    const older = time(skillOf.get(p.a)?.createdAt) <= time(skillOf.get(p.b)?.createdAt);
    const keep = older ? p.a : p.b, remove = older ? p.b : p.a;
    if (seen.has(`${keep}|${remove}`)) continue;
    await repo.create("AiSuggestion", { schoolId: actor.schoolId!, jobId: null, tool: "DUPLICATE", kind: "DUPLICATE", questionId: remove, passageId: null, severity: p.score >= 0.99 ? 2 : 3, detail: `${Math.round(p.score * 100)}% the same as another question. Approve = archive this copy (the older one stays).`, data: { keep, remove, score: p.score, keepStem: older ? p.stemA : p.stemB, removeStem: older ? p.stemB : p.stemA }, status: "SUGGESTED", createdAt: now });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ review

export interface SuggestionView { id: string; tool: string; kind: string; severity: number; detail: string; questionId: string | null; passageId: string | null; stem: string | null; status: string; data: Record<string, unknown>; createdAt: string }

export async function suggestions(repo: Repo, actor: Actor, filter: { tool?: string; jobId?: string; skillId?: string; status?: string; limit?: number }): Promise<SuggestionView[]> {
  assertAdmin(actor);
  let rows = await repo.findMany("AiSuggestion", { schoolId: actor.schoolId, ...(filter.tool ? { tool: filter.tool } : {}), status: filter.status ?? "SUGGESTED", ...(filter.jobId ? { jobId: filter.jobId } : {}) });
  if (filter.skillId) {
    const ids = new Set((await repo.findMany("Question", { skillId: filter.skillId }, { select: ["id"] })).map((q) => s(q.id)));
    const pIds = new Set((await repo.findMany("Question", { skillId: filter.skillId }, { select: ["passageId"] })).map((q) => s(q.passageId)).filter(Boolean));
    rows = rows.filter((r) => (r.questionId && ids.has(s(r.questionId))) || (r.passageId && pIds.has(s(r.passageId))));
  }
  rows.sort((a, b) => Number(a.severity) - Number(b.severity) || time(b.createdAt) - time(a.createdAt));
  rows = rows.slice(0, filter.limit ?? 300);
  const qs = rows.some((r) => r.questionId) ? await repo.findMany("Question", { id: { in: [...new Set(rows.map((r) => s(r.questionId)).filter(Boolean))] } }, { select: ["id", "stem"] }) : [];
  const ps = rows.some((r) => r.passageId) ? await repo.findMany("ReadingPassage", { id: { in: [...new Set(rows.map((r) => s(r.passageId)).filter(Boolean))] } }, { select: ["id", "title"] }) : [];
  return rows.map((r) => ({ id: s(r.id), tool: s(r.tool), kind: s(r.kind), severity: Number(r.severity), detail: s(r.detail), questionId: r.questionId ? s(r.questionId) : null, passageId: r.passageId ? s(r.passageId) : null, stem: r.questionId ? s(qs.find((q) => q.id === r.questionId)?.stem).slice(0, 220) : r.passageId ? `📖 ${s(ps.find((p) => p.id === r.passageId)?.title)}` : null, status: s(r.status), data: (r.data ?? {}) as Record<string, unknown>, createdAt: new Date(time(r.createdAt)).toISOString() }));
}

/** Approve: apply what can be applied safely (tags, a single corrected key, reading level, archive a duplicate); otherwise it marks the problem as acknowledged (fix it in the editor). */
export async function reviewSuggestion(repo: Repo, actor: Actor, id: string, decision: "APPROVE" | "REJECT", now = new Date()): Promise<void> {
  assertAdmin(actor);
  const sg = await repo.findUnique("AiSuggestion", { id });
  if (!sg || s(sg.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  if (sg.status !== "SUGGESTED") return;
  if (decision === "APPROVE") await apply(repo, actor, sg, now);
  await repo.updateMany("AiSuggestion", { id }, { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedById: actor.userId, reviewedAt: now });
}

export async function reviewMany(repo: Repo, actor: Actor, ids: string[], decision: "APPROVE" | "REJECT", now = new Date()): Promise<number> {
  let n = 0;
  for (const id of ids.slice(0, 1000)) { await reviewSuggestion(repo, actor, id, decision, now); n++; }
  return n;
}

async function apply(repo: Repo, actor: Actor, sg: Row, now: Date): Promise<void> {
  const d = (sg.data ?? {}) as Record<string, unknown>;
  const qid = sg.questionId ? s(sg.questionId) : null;
  if (s(sg.kind) === "TAG" && qid) {
    const q = await repo.findUnique("Question", { id: qid });
    if (!q) return;
    const std = (await repo.findMany("Standard", {}, { select: ["id", "code"] })).find((x) => s(x.code).replace(/^CCSS\.ELA-LITERACY\./, "") === s(d.standard));
    const t = tagsOf(q);
    const skillOk = d.skillId && (await masterSkills(repo, actor.schoolId!)).some((k) => k.id === d.skillId);
    await repo.updateMany("Question", { id: qid }, {
      ...(skillOk ? { skillId: s(d.skillId) } : {}), ...(std ? { standardId: std.id } : {}), difficultyLevel: Number(d.difficulty),
      tags: { ...t, mapGoalArea: d.goalArea, aiLevel: d.level, review: { status: "VERIFIED", by: actor.userId, at: now.toISOString(), via: "AI tag approved" } },
    });
    bumpBankVersion();
  } else if (s(sg.kind) === "KEY_ERROR" && qid && Array.isArray(d.correctLabels) && d.correctLabels.length === 1) {
    const label = s(d.correctLabels[0]);
    const opts = await repo.findMany("QuestionOption", { questionId: qid });
    if (opts.some((o) => o.label === label)) {
      for (const o of opts) await repo.updateMany("QuestionOption", { id: o.id }, { isCorrect: o.label === label });
      bumpBankVersion();
    }
  } else if (s(sg.kind) === "READING_LEVEL" && sg.passageId) {
    const combined = Number(d.combined);
    if (Number.isFinite(combined)) await repo.updateMany("ReadingPassage", { id: s(sg.passageId) }, { gradeLevel: Math.round(combined) });
  } else if (s(sg.kind) === "DUPLICATE" && d.remove) {
    const { archiveQuestions } = await import("../admin/question-delete");
    await archiveQuestions(repo, actor, [s(d.remove)], `Duplicate of ${s(d.keep)} (Duplicate Finder)`, now);
  }
  await audit(repo, { actorId: actor.userId, action: "ai.suggestion.approve", entityType: "AiSuggestion", entityId: s(sg.id), after: { kind: s(sg.kind), questionId: qid }, at: now });
}

// ------------------------------------------------------------------ weekly routine

export async function weeklyState(repo: Repo, schoolId: string): Promise<{ lastRun: string | null; due: boolean; newQuestions: number }> {
  const v = await setting(repo, schoolId, "ai.weekly");
  const last = v.at ? time(v.at) : 0;
  return { lastRun: last ? new Date(last).toISOString() : null, due: Date.now() - last >= 7 * 86_400_000, newQuestions: (await newQuestionIds(repo, schoolId)).length };
}

/** Queues Quality Check, then Auto-Tag, for every “New” question (weekly, or “Run now”). */
export async function runWeekly(repo: Repo, actor: Actor, now = new Date()): Promise<{ queued: number }> {
  assertAdmin(actor);
  const ids = await newQuestionIds(repo, actor.schoolId!);
  await saveSetting(repo, actor.schoolId!, "ai.weekly", { at: now.toISOString() }, actor.userId, now);
  if (!ids.length) return { queued: 0 };
  await createJob(repo, actor, "QUALITY", { new: true }, now);
  await createJob(repo, actor, "TAG", { new: true }, new Date(now.getTime() + 1));
  return { queued: ids.length };
}

/** Error rate of the AI requests (last N days), for the admin and the test report. */
export async function aiLogSummary(repo: Repo, actor: Actor, days = 7, now = new Date()): Promise<{ requests: number; ok: number; invalid: number; rate: number; down: number; other: number; errorPct: number | null; recent: { at: string; tool: string; ok: boolean; error: string | null; ms: number }[] }> {
  assertAdmin(actor);
  const rows = (await repo.findMany("AiRequestLog", { schoolId: actor.schoolId })).filter((r) => time(r.createdAt) >= now.getTime() - days * 86_400_000).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const e = (re: RegExp) => rows.filter((r) => !r.ok && re.test(s(r.error))).length;
  const ok = rows.filter((r) => r.ok).length;
  return { requests: rows.length, ok, invalid: e(/^INVALID/), rate: e(/^RATE_LIMIT/), down: e(/^DOWN/), other: rows.length - ok - e(/^INVALID/) - e(/^RATE_LIMIT/) - e(/^DOWN/), errorPct: rows.length ? Math.round(((rows.length - ok) / rows.length) * 100) : null,
    recent: rows.slice(0, 30).map((r) => ({ at: new Date(time(r.createdAt)).toISOString(), tool: s(r.tool), ok: Boolean(r.ok), error: r.error ? s(r.error) : null, ms: Number(r.ms) })) };
}
