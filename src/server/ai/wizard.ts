/**
 * 🪄 “Prepare a Skill”: one skill at a time, in a fixed order —
 *   1 Gap Report → 2 Quality Check (fix wrong keys / several correct answers first) → 3 Duplicate Finder →
 *   4 Auto-Tag (review a random sample of 10, then Approve all) → 5 Reading Level (only with passages) → 6 Gap Report again.
 * Auto-Tag cannot start before the Quality Check has finished and its serious problems are reviewed.
 * Each skill: Not started / In progress / Ready. Skills are listed by priority: upcoming lessons first,
 * then where students are weakest (platform mastery and MAP goal areas).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { masterSkills, type MasterSkill } from "../skills/master";
import { createJob, runDuplicates, scopePassages, scopeQuestionIds, type Tool } from "./jobs";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export const STEPS = [
  { key: "gap1", title: "Gap Report", what: "Counts this skill's questions at each level and shows what is missing." },
  { key: "quality", title: "Quality Check", what: "Finds wrong answer keys, several correct answers, weak options, spelling and unclear questions." },
  { key: "duplicates", title: "Duplicate Finder", what: "Finds identical or very similar questions, also in other sections." },
  { key: "tag", title: "Auto-Tag", what: "Suggests skill, standard, MAP goal area, level and difficulty for every question." },
  { key: "reading", title: "Reading Level Estimate", what: "Estimates the reading level of the skill's passages (formula + AI). Not a Lexile." },
  { key: "gap2", title: "Gap Report again", what: "Shows what is still missing after the clean-up." },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export type WizardStatus = "NOT_STARTED" | "IN_PROGRESS" | "READY";
interface Saved { done: StepKey[]; jobs: Partial<Record<StepKey, string>> }

const KEY = (skillId: string) => `ai.wizard.${skillId}`;
async function load(repo: Repo, schoolId: string, skillId: string): Promise<Saved> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY(skillId) }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Partial<Saved>;
  return { done: Array.isArray(o.done) ? (o.done as StepKey[]) : [], jobs: (o.jobs ?? {}) as Saved["jobs"] };
}
async function save(repo: Repo, actor: Actor, skillId: string, v: Saved, now = new Date()) {
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY(skillId) }, { value: v, updatedById: actor.userId, updatedAt: now }, { value: v, updatedById: actor.userId, updatedAt: now });
}
function assertAdmin(actor: Actor) { if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins use the AI tools."); }

export interface WizardStep { key: StepKey; title: string; what: string; done: boolean; jobId: string | null; jobStatus: string | null; progress: { done: number; total: number; failed: number } | null; blocked: string | null; skipped: boolean; openSerious: number }
export interface WizardView { skill: MasterSkill; status: WizardStatus; steps: WizardStep[]; current: StepKey | null; questions: number; passages: number }

export async function wizard(repo: Repo, actor: Actor, skillId: string): Promise<WizardView> {
  assertAdmin(actor);
  const skill = (await masterSkills(repo, actor.schoolId!)).find((k) => k.id === skillId);
  if (!skill) throw new ValidationError("Skill not found.");
  const saved = await load(repo, actor.schoolId!, skillId);
  const [qIds, pIds] = await Promise.all([scopeQuestionIds(repo, actor.schoolId!, { skillId, grade: skill.grade }), scopePassages(repo, actor.schoolId!, { skillId, grade: skill.grade })]);
  const jobs = new Map<string, Row>();
  for (const id of Object.values(saved.jobs)) if (id) { const j = await repo.findUnique("AiJob", { id }); if (j) jobs.set(id, j); }
  const serious = qIds.length ? (await repo.findMany("AiSuggestion", { schoolId: actor.schoolId, tool: "QUALITY", status: "SUGGESTED" })).filter((x) => qIds.includes(s(x.questionId)) && Number(x.severity) === 1).length : 0;
  const steps: WizardStep[] = STEPS.map((st) => {
    const jobId = saved.jobs[st.key] ?? null, j = jobId ? jobs.get(jobId) : undefined;
    const skipped = st.key === "reading" && !pIds.length;
    let blocked: string | null = null;
    if (st.key === "tag" && !saved.done.includes("quality")) blocked = "Finish the Quality Check first.";
    else if (st.key === "tag" && serious > 0) blocked = `Fix or reject the ${serious} serious problem(s) of the Quality Check first (wrong keys, several correct answers).`;
    return { key: st.key, title: st.title, what: st.what, done: saved.done.includes(st.key) || skipped, jobId, jobStatus: j ? s(j.status) : null, progress: j ? { done: Number(j.done), total: Number(j.total), failed: Number(j.failed) } : null, blocked, skipped, openSerious: st.key === "quality" ? serious : 0 };
  });
  const current = steps.find((x) => !x.done)?.key ?? null;
  const status: WizardStatus = !saved.done.length && !Object.keys(saved.jobs).length ? "NOT_STARTED" : current ? "IN_PROGRESS" : "READY";
  return { skill, status, steps, current, questions: qIds.length, passages: pIds.length };
}

/** Start the current step (AI steps create a job; code steps run at once). */
export async function startStep(repo: Repo, actor: Actor, skillId: string, step: StepKey, now = new Date()): Promise<string | null> {
  const w = await wizard(repo, actor, skillId);
  const st = w.steps.find((x) => x.key === step)!;
  const before = w.steps.slice(0, w.steps.indexOf(st)).find((x) => !x.done);
  if (before) throw new ValidationError(`Do “${before.title}” first.`);
  if (st.blocked) throw new ValidationError(st.blocked);
  const saved = await load(repo, actor.schoolId!, skillId);
  const scope = { skillId, grade: w.skill.grade };
  const tool: Tool | null = step === "quality" ? "QUALITY" : step === "tag" ? "TAG" : step === "reading" ? "READING" : null;
  if (tool) {
    const j = await createJob(repo, actor, tool, scope, now);
    saved.jobs[step] = j.id;
    await save(repo, actor, skillId, saved, now);
    return j.id;
  }
  if (step === "duplicates") await runDuplicates(repo, actor, scope, now);
  return null;
}

/** “Next step”: marks the step done (AI steps only once their job has finished). */
export async function finishStep(repo: Repo, actor: Actor, skillId: string, step: StepKey, now = new Date()): Promise<void> {
  const w = await wizard(repo, actor, skillId);
  const st = w.steps.find((x) => x.key === step)!;
  if ((step === "quality" || step === "tag" || step === "reading") && !st.skipped && st.jobStatus !== "DONE") throw new ValidationError("Wait until this step has finished.");
  if (step === "quality" && st.openSerious > 0) throw new ValidationError(`Review the ${st.openSerious} serious problem(s) first (wrong keys, several correct answers).`);
  const saved = await load(repo, actor.schoolId!, skillId);
  if (!saved.done.includes(step)) saved.done.push(step);
  await save(repo, actor, skillId, saved, now);
}

export async function resetWizard(repo: Repo, actor: Actor, skillId: string): Promise<void> {
  assertAdmin(actor);
  await save(repo, actor, skillId, { done: [], jobs: {} });
}

/** Skills of a grade by priority, with their wizard status. */
export async function wizardList(repo: Repo, actor: Actor, grade: number): Promise<{ skill: MasterSkill; status: WizardStatus; why: string; unitNo: number | null; weakness: number | null }[]> {
  assertAdmin(actor);
  const skills = await masterSkills(repo, actor.schoolId!, { grade, withQuestionsOnly: true });
  if (!skills.length) return [];
  const ids = skills.map((k) => k.id);
  const [unitSkills, mastery, settings, assignments] = await Promise.all([
    repo.findMany("UnitSkill", { skillId: { in: ids } }, { select: ["unitId", "skillId"] }),
    repo.findMany("StudentSkillMastery", { skillId: { in: ids } }, { select: ["skillId", "attempts", "correct"] }),
    repo.findMany("SchoolSetting", { schoolId: actor.schoolId }, { select: ["key", "value"] }),
    repo.findMany("Assignment", { skillId: { in: ids }, deletedAt: null }, { select: ["skillId", "dueAt"] }),
  ]);
  const units = unitSkills.length ? await repo.findMany("Unit", { id: { in: [...new Set(unitSkills.map((u) => s(u.unitId)))] } }, { select: ["id", "number"] }) : [];
  const now = Date.now();
  return skills.map((k) => {
    const unitNo = Math.min(...unitSkills.filter((u) => u.skillId === k.id).map((u) => Number(units.find((x) => x.id === u.unitId)?.number ?? 99)), 99);
    const m = mastery.filter((x) => x.skillId === k.id && Number(x.attempts) >= 3);
    const weakness = m.length ? Math.round((m.reduce((t, x) => t + Number(x.correct) / Math.max(1, Number(x.attempts)), 0) / m.length) * 100) : null;
    const upcoming = assignments.some((a) => a.skillId === k.id && a.dueAt && time(a.dueAt) >= now);
    const row = settings.find((x) => x.key === KEY(k.id));
    let v: unknown = row?.value ?? null; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
    const done = Array.isArray((v as Saved | null)?.done) ? (v as Saved).done : [];
    const status: WizardStatus = !row ? "NOT_STARTED" : done.includes("gap2") ? "READY" : "IN_PROGRESS";
    const why = upcoming ? "Assigned work is coming up" : unitNo < 99 ? `Unit ${unitNo}` : "Not in a unit";
    return { skill: k, status, why: weakness !== null ? `${why} · students ${weakness}% correct` : why, unitNo: unitNo < 99 ? unitNo : null, weakness, upcoming };
  }).sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || (a.unitNo ?? 99) - (b.unitNo ?? 99) || (a.weakness ?? 101) - (b.weakness ?? 101) || a.skill.name.localeCompare(b.skill.name)).map(({ upcoming: _u, ...x }) => x);
}
