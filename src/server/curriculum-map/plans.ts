/**
 * 🗂️ Skill plans: a teacher picks Curriculum Map places (a whole category = adaptive Below → On → Above,
 * or one level / Concept Vocabulary) and assigns them together. Each place becomes real assignments, so
 * statuses, notifications and reports work as usual; the plan groups them as a map the student opens.
 */
import type { Repo, Row } from "../seeding/repo";
import { safeIfBehind } from "../db/schema-errors";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { attachmentNodes, mapEpoch } from "./questions";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { assignFromMap } from "./levels";
import { DEFAULT_TARGET_CORRECT } from "../teacher/assign";
import { withLock } from "../lib/key-lock";

const s = (v: unknown) => String(v ?? "");
/**
 * Plan kinds made by the Plans wizard (src/server/plans/wizard.ts): each item is ONE skill assigned as adaptive
 * practice (the student opens it at their level). UNIT = a Curriculum Plan built from the curriculum lessons.
 */
export const SKILL_PLAN_KINDS = ["MAP", "NAFS", "UNIT", "RTI", "CUSTOM"] as const;
export type SkillPlanKind = (typeof SKILL_PLAN_KINDS)[number];
export const isSkillPlanKind = (k: unknown): k is SkillPlanKind => (SKILL_PLAN_KINDS as readonly unknown[]).includes(k);
/** CURRICULUM (full year) · PLACES (Curriculum Map places) · or a wizard kind */
const kindOf = (k: unknown): string => (s(k) === "CURRICULUM" ? "CURRICULUM" : isSkillPlanKind(s(k)) ? s(k) : "PLACES");
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

export async function createSkillPlan(repo: Repo, actor: Actor, input: { classId: string; title: string; codes: string[]; studentIds?: string[]; maxQuestions?: number; targetCorrect?: number; dueAt?: Date | null; note?: string | null }, now = new Date()): Promise<{ planId: string; items: number; skipped: string[] }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const title = s(input.title).replace(/\s+/g, " ").trim();
  if (!title) throw new ValidationError("Give the plan a title.");
  const codes = [...new Set(input.codes.map((c) => s(c).trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) throw new ValidationError("Choose at least one place of the Curriculum Map.");
  if (codes.length > 40) throw new ValidationError("A plan can have at most 40 places.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const all = (await planPlaces(repo, actor.schoolId!, grade)).flatMap((g) => g.places.map((p) => ({ ...p, where: `${g.unit} · ${g.set}` })));
  const plan = await repo.create("SkillPlan", { schoolId: actor.schoolId, classId: input.classId, title: title.slice(0, 191), kind: "PLACES", targetCorrect: input.targetCorrect ?? DEFAULT_TARGET_CORRECT, gradeLevel: grade, note: input.note ? s(input.note).slice(0, 1000) : null, createdById: actor.userId, createdAt: now });
  const skipped: string[] = [];
  let order = 0;
  for (const code of codes) {
    const place = all.find((p) => p.code === code);
    if (!place) { skipped.push(`${code}: not a place of Grade ${grade}`); continue; }
    try {
      const r = await assignFromMap(repo, actor, { classId: input.classId, categoryCode: code, studentIds: input.studentIds?.length ? input.studentIds : undefined, maxQuestions: input.maxQuestions, targetCorrect: input.targetCorrect ?? DEFAULT_TARGET_CORRECT, dueAt: input.dueAt ?? null, note: input.note ?? `Skill plan: ${title}`, mode: "ADAPTIVE" }, now);
      await repo.create("SkillPlanItem", { planId: plan.id, code, label: `${place.where} · ${place.label}`.slice(0, 255), assignmentIds: r.groups.map((g) => g.assignmentId), order: order++ });
    } catch (e) {
      if (e instanceof ValidationError) skipped.push(`${place.label} (${place.where}): ${e.message}`); else throw e;
    }
  }
  if (!order) { await repo.deleteMany("SkillPlan", { id: plan.id }); throw new ValidationError(`Nothing could be assigned. ${skipped.join(" · ")}`); }
  return { planId: s(plan.id), items: order, skipped };
}

export interface PlanSummary { id: string; kind: string; classId: string; title: string; className: string; grade: number; items: number; students: number; createdAt: string }
export async function listSkillPlans(repo: Repo, actor: Actor): Promise<PlanSummary[]> {
  assertCan(actor, "assignments:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Staff only.");
  const plans = (await safeIfBehind("plans.list", repo.findMany("SkillPlan", { schoolId: actor.schoolId }), [] as Row[])).sort((a, b) => s(b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt).localeCompare(s(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt)));
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
    const curriculum = s(p.kind) === "CURRICULUM";
    out.push({ id: s(p.id), kind: kindOf(p.kind), classId: s(p.classId), title: s(p.title), className: s(klass?.name), grade: Number(p.gradeLevel), items: items.length, students: curriculum ? Number(klass ? (await repo.count("ClassMembership", { classId: klass.id, leftAt: null })) : 0) : studs.size, createdAt: s(p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt).slice(0, 10) });
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
  // ⚡ every place's students in one read (was one read per place)
  const allAids = [...new Set(items.flatMap((it) => ids(it.assignmentIds)))];
  const byAid = new Map<string, Row[]>();
  for (let i = 0; i < allAids.length; i += 1000) {
    for (const r of await repo.findMany("AssignmentStudent", { assignmentId: { in: allAids.slice(i, i + 1000) } }, { select: ["assignmentId", "status"] })) { const k = s(r.assignmentId); const l = byAid.get(k); if (l) l.push(r); else byAid.set(k, [r]); }
  }
  for (const it of items) {
    const rows = [...new Set(ids(it.assignmentIds))].flatMap((a) => byAid.get(a) ?? []);
    const sp = split(s(it.label));
    places.push({ code: s(it.code), label: sp.place, unit: sp.unit, set: sp.set, status: null, progress: rows.length ? rows.filter((r) => r.status === "COMPLETED").length / rows.length : 0, href: null, students: { done: rows.filter((r) => r.status === "COMPLETED").length, total: rows.length } });
  }
  return { id: s(plan.id), title: s(plan.title), className: s(klass.name), grade: Number(plan.gradeLevel), note: plan.note ? s(plan.note) : null, createdAt: s(plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt).slice(0, 10), places };
}

/** A plan students see: sent (rows from before the plan editor have no status). Drafts, paused and withdrawn plans are hidden. */
export const visibleToStudents = (plan: Row): boolean => !plan.status || s(plan.status) === "SENT";

/** The student's plans: those with places assigned to them, and their class's full-curriculum plan. */
export interface StudentPlanSummary { id: string; title: string; places: number; done: number; kind: string; grade: number; createdAt: string }
export async function studentSkillPlans(repo: Repo, actor: Actor): Promise<StudentPlanSummary[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const mine = await repo.findMany("AssignmentStudent", { studentId: actor.studentId }, { select: ["assignmentId", "status"] });
  const statusOf = new Map(mine.map((m) => [s(m.assignmentId), s(m.status)]));
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const myClasses = new Set((await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId)));
  // drafts, paused and withdrawn plans are not shown to students (plan editor)
  const plans = (await safeIfBehind("plans.student", repo.findMany("SkillPlan", { schoolId: st?.schoolId }), [] as Row[])).filter((p) => visibleToStudents(p));
  const out: StudentPlanSummary[] = [];
  // all the plans' places in one query (not one per plan)
  const allItems = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }) : [];
  for (const p of plans) {
    const items = allItems.filter((i) => i.planId === p.id);
    const curriculum = s(p.kind) === "CURRICULUM";
    if (curriculum && !myClasses.has(s(p.classId))) continue;
    const mineItems = curriculum ? items : items.filter((i) => ids(i.assignmentIds).some((a) => statusOf.has(a)));
    if (mineItems.length) out.push({ id: s(p.id), title: s(p.title), kind: kindOf(p.kind), grade: Number(p.gradeLevel) || 0, createdAt: iso(p.createdAt), places: mineItems.length, done: mineItems.filter((i) => ids(i.assignmentIds).some((a) => statusOf.get(a) === "COMPLETED")).length });
  }
  // the curriculum plan first
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "CURRICULUM" ? -1 : 1));
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : s(v));

/** Plan kinds that are a study plan from the Curriculum Map (the student's "Curriculum Map" page). */
export const STUDY_PLAN_KINDS = ["CURRICULUM", "UNIT", "PLACES"] as const;

/**
 * 📘 The student's Curriculum Map = their own study plan(s): only plans sent to this student (their class's
 * curriculum plan, or plans with parts assigned to them), newest first. The default is the newest plan of the
 * student's own grade (else the newest one).
 */
export async function studentStudyPlans(repo: Repo, actor: Actor): Promise<{ grade: number | null; plans: StudentPlanSummary[]; defaultId: string | null }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const [all, st] = await Promise.all([studentSkillPlans(repo, actor), repo.findUnique("Student", { id: actor.studentId })]);
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  const grade = g ? Number(g.level) : null;
  const plans = all.filter((p) => (STUDY_PLAN_KINDS as readonly string[]).includes(p.kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const def = plans.find((p) => grade !== null && p.grade === grade) ?? plans[0] ?? null;
  return { grade, plans, defaultId: def?.id ?? null };
}

/**
 * Parts added to the Curriculum Map after a curriculum plan was sent (e.g. the 🔁 Review section of every
 * selection) join the plan the next time it is opened, so the student's plan always shows every section.
 * Returns how many parts were added (0 = nothing to do).
 */
export function addMissingCurriculumParts(repo: Repo, plan: Row): Promise<number> {
  if (s(plan.kind) !== "CURRICULUM") return Promise.resolve(0);
  return withLock(`plan-parts:${s(plan.id)}`, async () => {
    const groups = await planPlaces(repo, s(plan.schoolId), Number(plan.gradeLevel));
    const places = groups.flatMap((g) => g.places.map((p) => ({ code: p.code, label: `${g.unit} · ${g.set} · ${p.label.replace(/ \(adaptive\)$/, "")}` })));
    if (!places.length) return 0;
    const have = await repo.findMany("SkillPlanItem", { planId: plan.id }, { select: ["code", "order"] });
    const codes = new Set(have.map((i) => s(i.code)));
    const missing = places.filter((p) => !codes.has(p.code));
    if (!missing.length) return 0;
    let order = have.reduce((m, i) => Math.max(m, Number(i.order) || 0), -1) + 1;
    await repo.createMany("SkillPlanItem", missing.map((p) => ({ planId: plan.id, code: p.code, label: p.label.slice(0, 255), assignmentIds: [], order: order++ })));
    return missing.length;
  });
}

export interface StudentPlanView extends PlanView { kind: string; target: number; places: (PlanPlace & { itemId: string; locked: boolean; empty: boolean; skills: string | null; correct: number })[] }

/** The student's plan as a map: each place links straight to its questions (a curriculum place opens on first use). */
export async function skillPlanForStudent(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<StudentPlanView> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const loaded = await planRows(repo, planId);
  const plan = loaded.plan;
  let items = loaded.items;
  if (!visibleToStudents(plan)) throw new ForbiddenError("This plan is not assigned to you.");
  const curriculum = s(plan.kind) === "CURRICULUM";
  if (curriculum) {
    const m = await repo.findUnique("ClassMembership", { classId: plan.classId, studentId: actor.studentId });
    if (!m || m.leftAt) throw new ForbiddenError("This plan is not assigned to you.");
    // sections added to the map later (Review) join the plan
    if (await addMissingCurriculumParts(repo, plan)) items = (await planRows(repo, planId)).items;
  }
  const mine = await repo.findMany("AssignmentStudent", { studentId: actor.studentId }, { select: ["assignmentId", "status", "progress"] });
  const byId = new Map(mine.map((m) => [s(m.assignmentId), m]));
  const sessions = await repo.findMany("PracticeSession", { studentId: actor.studentId, mode: "TEACHER_QUIZ" }, { select: ["assignmentId", "correctCount"] });
  const correctOf = new Map(sessions.map((x) => [s(x.assignmentId), Number(x.correctCount ?? 0)]));
  const skillKind = isSkillPlanKind(s(plan.kind));
  const skills = skillKind ? new Map<string, string>() : await placeSkills(repo, s(plan.schoolId));
  const ready = curriculum ? await partsWithQuestions(repo, s(plan.schoolId), Number(plan.gradeLevel)) : null;
  // wizard plans: each item is a skill assignment → it opens adaptive practice of that skill at the student's level
  const mineAids = items.flatMap((it) => ids(it.assignmentIds)).filter((a) => byId.has(a));
  const skillOfAid = skillKind && mineAids.length ? new Map((await repo.findMany("Assignment", { id: { in: mineAids } }, { select: ["id", "skillId"] })).map((a) => [s(a.id), a.skillId ? s(a.skillId) : ""])) : new Map<string, string>();
  const places: StudentPlanView["places"] = [];
  for (const it of items) {
    const aid = ids(it.assignmentIds).find((a) => byId.has(a));
    if (!aid && !curriculum) continue;
    const row = aid ? byId.get(aid)! : null;
    const sp = split(s(it.label));
    const locked = curriculum && !isUnitOpen(plan, sp.unit, now);
    const empty = !aid && !!ready && !ready.has(s(it.code));
    places.push({
      itemId: s(it.id), code: s(it.code), label: sp.place, unit: sp.unit, set: sp.set,
      status: row ? (s(row.status) as PlanPlace["status"]) : "NOT_STARTED", progress: Number(row?.progress ?? 0),
      href: locked || empty ? null : aid ? (skillOfAid.get(aid) ? `/practice/${skillOfAid.get(aid)}` : `/quiz/${aid}`) : `/student/plans/${s(plan.id)}/open/${s(it.id)}`,
      locked, empty, skills: skills.get(s(it.code)) ?? null, correct: !aid ? 0 : row?.status === "COMPLETED" ? Math.max(correctOf.get(aid) ?? 0, Number(plan.targetCorrect) || DEFAULT_TARGET_CORRECT) : Math.min(correctOf.get(aid) ?? 0, (Number(plan.targetCorrect) || DEFAULT_TARGET_CORRECT) - 1),
    });
  }
  if (!places.length) throw new ForbiddenError("This plan is not assigned to you.");
  const klass = await repo.findUnique("Class", { id: plan.classId });
  return { id: s(plan.id), kind: kindOf(plan.kind), target: Number(plan.targetCorrect) || DEFAULT_TARGET_CORRECT, title: s(plan.title), className: s(klass?.name), grade: Number(plan.gradeLevel), note: plan.note ? s(plan.note) : null, createdAt: s(plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt).slice(0, 10), places };
}

/** ⭐ Today's plan: the next part of the student's curriculum plan (the one in progress, else the first not done). */
export async function todaysPlanStep(repo: Repo, actor: Actor): Promise<{ planId: string; title: string; unit: string; set: string; label: string; href: string; done: number; total: number; correct: number; target: number; inProgress: boolean } | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) return null;
  const plans = (await studentSkillPlans(repo, actor)).filter((p) => p.kind === "CURRICULUM");
  if (!plans.length) return null;
  const v = await skillPlanForStudent(repo, actor, plans[0].id);
  const open = v.places.filter((p) => !p.locked && p.href);
  const next = open.find((p) => p.status === "IN_PROGRESS") ?? open.find((p) => p.status !== "COMPLETED");
  if (!next) return null;
  return { planId: v.id, title: v.title, unit: next.unit, set: next.set, label: next.label, href: next.href!, done: v.places.filter((p) => p.status === "COMPLETED").length, total: v.places.length, correct: next.correct, target: v.target, inProgress: next.status === "IN_PROGRESS" };
}

/** For the plan pages: the skills written on each place of the map (e.g. “Reread / Compare and Contrast”). */
export async function placeSkills(repo: Repo, schoolId: string): Promise<Map<string, string>> {
  const nodes = await attachmentNodes(repo, schoolId);
  const out = new Map<string, string>();
  for (const n of nodes) { const cat = n.code.replace(/\.(ABOVE|ON|BELOW)$/, ""); if (n.skills && !out.has(cat)) out.set(cat, n.skills); if (n.skills && !out.has(n.code)) out.set(n.code, n.skills); }
  return out;
}

const json = (v: unknown): unknown => { if (v === null || v === undefined || v === "") return null; if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };
/** Units a curriculum plan opened by hand (null = not set). */
export const openUnitsOf = (plan: Row): string[] | null => { const x = json(plan.openUnits); return Array.isArray(x) ? x.map(String) : null; };
/** The unit calendar of a curriculum plan: unit → yyyy-mm-dd. */
export const unitDatesOf = (plan: Row): Record<string, string> => { const x = json(plan.unitDates); return x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, d]) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))).map(([k, d]) => [k, String(d)])) : {}; };
/** A unit is open when nothing was set (all open), when the teacher opened it, or when its date on the calendar has come. */
export function isUnitOpen(plan: Row, unit: string, now = new Date()): boolean {
  const open = openUnitsOf(plan), dates = unitDatesOf(plan);
  if (!open && !Object.keys(dates).length) return true;
  if (open?.includes(unit)) return true;
  const d = dates[unit];
  return !!d && d <= now.toISOString().slice(0, 10);
}

/** The parts of a grade's map (a category, or a place without levels) that have published questions. */
export function partsWithQuestions(repo: Repo, schoolId: string, grade: number): Promise<Set<string>> {
  // ⚡ every student's map and home page asks this: cached per school + grade until a question, a map link or the
  // map changes (and at most a minute); callers get their own copy
  let m = partsCache.get(repo); if (!m) partsCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${grade}`, v = `${modelVersion("Question", "QuestionMapLink", "CurriculumMapNode")}|${mapEpoch()}`, hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p.then((x) => new Set(x));
  const p = partsWithQuestionsNow(repo, schoolId, grade);
  remember(m, key, { v, at: Date.now(), p }, 16);
  p.catch(() => m!.delete(key));
  return p.then((x) => new Set(x));
}
const partsCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<Set<string>> }>>();

async function partsWithQuestionsNow(repo: Repo, schoolId: string, grade: number): Promise<Set<string>> {
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.grade === grade);
  const links = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId", "nodeId"] }) : [];
  const qids = [...new Set(links.map((l) => s(l.questionId)))];
  const pub = new Set<string>();
  for (let i = 0; i < qids.length; i += 1000) for (const q of await repo.findMany("Question", { id: { in: qids.slice(i, i + 1000) }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })) pub.add(s(q.id));
  const nodeOf = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  for (const l of links) {
    if (!pub.has(s(l.questionId))) continue;
    const n = nodeOf.get(s(l.nodeId));
    if (n) { out.add(n.code); out.add(n.code.replace(/\.(ABOVE|ON|BELOW)$/, "")); }
  }
  return out;
}
