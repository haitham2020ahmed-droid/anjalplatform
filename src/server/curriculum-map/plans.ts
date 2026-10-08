/**
 * 🗂️ Skill plans: a teacher picks Curriculum Map places (a whole category = adaptive Below → On → Above,
 * or one level / Concept Vocabulary) and assigns them together. Each place becomes real assignments, so
 * statuses, notifications and reports work as usual; the plan groups them as a map the student opens.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { attachmentNodes } from "./questions";
import { assignFromMap } from "./levels";

const s = (v: unknown) => String(v ?? "");
const ids = (v: unknown): string[] => { const x = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v; return Array.isArray(x) ? x.map(String) : []; };

/** Places a plan can use: every category (Analyze Craft / Respond to Reading: adaptive) and every attachment node. */
export async function planPlaces(repo: Repo, schoolId: string, grade: number): Promise<{ unit: string; set: string; places: { code: string; label: string }[] }[]> {
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.grade === grade);
  const out: { unit: string; set: string; places: { code: string; label: string }[] }[] = [];
  for (const n of nodes) {
    let g = out.find((x) => x.unit === n.unitTitle && x.set === n.heading);
    if (!g) { g = { unit: n.unitTitle, set: n.heading, places: [] }; out.push(g); }
    const cat = n.categoryLabel.replace(/^\d+-\s*/, "");
    if (!n.level) g.places.push({ code: n.code, label: cat });
    else {
      const catCode = n.code.replace(/\.(ABOVE|ON|BELOW)$/, "");
      if (!g.places.some((p) => p.code === catCode)) g.places.push({ code: catCode, label: `${cat} (adaptive)` });
    }
  }
  return out;
}

export async function createSkillPlan(repo: Repo, actor: Actor, input: { classId: string; title: string; codes: string[]; studentIds?: string[]; maxQuestions?: number; dueAt?: Date | null; note?: string | null }, now = new Date()): Promise<{ planId: string; items: number; skipped: string[] }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const title = s(input.title).replace(/\s+/g, " ").trim();
  if (!title) throw new ValidationError("Give the plan a title.");
  const codes = [...new Set(input.codes.map((c) => s(c).trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) throw new ValidationError("Choose at least one place of the Curriculum Map.");
  if (codes.length > 40) throw new ValidationError("A plan can have at most 40 places.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const all = (await planPlaces(repo, actor.schoolId!, grade)).flatMap((g) => g.places.map((p) => ({ ...p, where: `${g.unit} · ${g.set}` })));
  const plan = await repo.create("SkillPlan", { schoolId: actor.schoolId, classId: input.classId, title: title.slice(0, 191), gradeLevel: grade, note: input.note ? s(input.note).slice(0, 1000) : null, createdById: actor.userId, createdAt: now });
  const skipped: string[] = [];
  let order = 0;
  for (const code of codes) {
    const place = all.find((p) => p.code === code);
    if (!place) { skipped.push(`${code}: not a place of Grade ${grade}`); continue; }
    try {
      const r = await assignFromMap(repo, actor, { classId: input.classId, categoryCode: code, studentIds: input.studentIds?.length ? input.studentIds : undefined, maxQuestions: input.maxQuestions, dueAt: input.dueAt ?? null, note: input.note ?? `Skill plan: ${title}`, mode: "ADAPTIVE" }, now);
      await repo.create("SkillPlanItem", { planId: plan.id, code, label: `${place.where} · ${place.label}`.slice(0, 255), assignmentIds: r.groups.map((g) => g.assignmentId), order: order++ });
    } catch (e) {
      if (e instanceof ValidationError) skipped.push(`${place.label} (${place.where}): ${e.message}`); else throw e;
    }
  }
  if (!order) { await repo.deleteMany("SkillPlan", { id: plan.id }); throw new ValidationError(`Nothing could be assigned. ${skipped.join(" · ")}`); }
  return { planId: s(plan.id), items: order, skipped };
}

export interface PlanSummary { id: string; title: string; className: string; grade: number; items: number; students: number; createdAt: string }
export async function listSkillPlans(repo: Repo, actor: Actor): Promise<PlanSummary[]> {
  assertCan(actor, "assignments:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Staff only.");
  const plans = (await repo.findMany("SkillPlan", { schoolId: actor.schoolId })).sort((a, b) => s(b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt).localeCompare(s(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt)));
  const out: PlanSummary[] = [];
  // batched: places, students and classes of all plans in three queries
  const allItems = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }) : [];
  const allAids = allItems.flatMap((i) => ids(i.assignmentIds));
  const allStudents = allAids.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: allAids } }, { select: ["assignmentId", "studentId"] }) : [];
  const classes = plans.length ? await repo.findMany("Class", { id: { in: [...new Set(plans.map((p) => s(p.classId)))] } }) : [];
  for (const p of plans) {
    try { await assertClassAccess(repo, actor, s(p.classId)); } catch { continue; }
    const items = allItems.filter((i) => i.planId === p.id);
    const aids = new Set(items.flatMap((i) => ids(i.assignmentIds)));
    const studs = new Set(allStudents.filter((x) => aids.has(s(x.assignmentId))).map((x) => s(x.studentId)));
    const klass = classes.find((c) => c.id === p.classId);
    out.push({ id: s(p.id), title: s(p.title), className: s(klass?.name), grade: Number(p.gradeLevel), items: items.length, students: studs.size, createdAt: s(p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt).slice(0, 10) });
  }
  return out;
}

export interface PlanPlace { code: string; label: string; unit: string; set: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | null; progress: number; href: string | null; students?: { done: number; total: number } }
export interface PlanView { id: string; title: string; className: string; grade: number; note: string | null; createdAt: string; places: PlanPlace[] }

async function planRows(repo: Repo, planId: string): Promise<{ plan: Row; items: Row[] }> {
  const plan = await repo.findUnique("SkillPlan", { id: planId });
  if (!plan) throw new ForbiddenError("Plan not found.");
  const items = (await repo.findMany("SkillPlanItem", { planId })).sort((a, b) => Number(a.order) - Number(b.order));
  return { plan, items };
}
const split = (label: string) => { const [unit = "", set = "", ...rest] = label.split(" · "); return { unit, set, place: rest.join(" · ") }; };

/** Staff view of a plan: each place with how many students finished it. */
export async function skillPlanForStaff(repo: Repo, actor: Actor, planId: string): Promise<PlanView> {
  const { plan, items } = await planRows(repo, planId);
  if (plan.schoolId !== actor.schoolId) throw new ForbiddenError("Plan not found.");
  const klass = await assertClassAccess(repo, actor, s(plan.classId));
  const places: PlanPlace[] = [];
  for (const it of items) {
    const rows = ids(it.assignmentIds).length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: ids(it.assignmentIds) } }, { select: ["status"] }) : [];
    const sp = split(s(it.label));
    places.push({ code: s(it.code), label: sp.place, unit: sp.unit, set: sp.set, status: null, progress: rows.length ? rows.filter((r) => r.status === "COMPLETED").length / rows.length : 0, href: null, students: { done: rows.filter((r) => r.status === "COMPLETED").length, total: rows.length } });
  }
  return { id: s(plan.id), title: s(plan.title), className: s(klass.name), grade: Number(plan.gradeLevel), note: plan.note ? s(plan.note) : null, createdAt: s(plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt).slice(0, 10), places };
}

/** The student's plans (only those with places assigned to them). */
export async function studentSkillPlans(repo: Repo, actor: Actor): Promise<{ id: string; title: string; places: number; done: number }[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const mine = await repo.findMany("AssignmentStudent", { studentId: actor.studentId }, { select: ["assignmentId", "status"] });
  const statusOf = new Map(mine.map((m) => [s(m.assignmentId), s(m.status)]));
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const plans = await repo.findMany("SkillPlan", { schoolId: st?.schoolId });
  const out: { id: string; title: string; places: number; done: number }[] = [];
  // all the plans' places in one query (not one per plan)
  const allItems = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }) : [];
  for (const p of plans) {
    const items = allItems.filter((i) => i.planId === p.id);
    const mineItems = items.filter((i) => ids(i.assignmentIds).some((a) => statusOf.has(a)));
    if (mineItems.length) out.push({ id: s(p.id), title: s(p.title), places: mineItems.length, done: mineItems.filter((i) => ids(i.assignmentIds).some((a) => statusOf.get(a) === "COMPLETED")).length });
  }
  return out;
}

/** The student's plan as a map: each place links straight to its questions. */
export async function skillPlanForStudent(repo: Repo, actor: Actor, planId: string): Promise<PlanView> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const { plan, items } = await planRows(repo, planId);
  const mine = await repo.findMany("AssignmentStudent", { studentId: actor.studentId }, { select: ["assignmentId", "status", "progress"] });
  const byId = new Map(mine.map((m) => [s(m.assignmentId), m]));
  const places: PlanPlace[] = [];
  for (const it of items) {
    const aid = ids(it.assignmentIds).find((a) => byId.has(a));
    if (!aid) continue;
    const row = byId.get(aid)!;
    const sp = split(s(it.label));
    places.push({ code: s(it.code), label: sp.place, unit: sp.unit, set: sp.set, status: s(row.status) as PlanPlace["status"], progress: Number(row.progress ?? 0), href: `/quiz/${aid}` });
  }
  if (!places.length) throw new ForbiddenError("This plan is not assigned to you.");
  const klass = await repo.findUnique("Class", { id: plan.classId });
  return { id: s(plan.id), title: s(plan.title), className: s(klass?.name), grade: Number(plan.gradeLevel), note: plan.note ? s(plan.note) : null, createdAt: s(plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt).slice(0, 10), places };
}
