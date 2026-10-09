/**
 * 📘 The full-curriculum plan of a class: the whole grade's Curriculum Map (unit → text set → category) as one
 * plan in every student's My Plans. Nothing is assigned up front: a place opens the first time a student starts
 * it (one adaptive set for the class, made silently, goal = correct answers), so My Work keeps only the
 * teacher's own assignments. The teacher chooses which units are open; the rest show 🔒.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { resolveActor } from "../auth/actor";
import { assertClassAccess } from "../teacher/assignments";
import { DEFAULT_TARGET_CORRECT } from "../teacher/assign";
import { assignFromMap } from "./levels";
import { planPlaces, isUnitOpen, openUnitsOf, unitDatesOf } from "./plans";

const s = (v: unknown) => String(v ?? "");
const ids = (v: unknown): string[] => { const x = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v; return Array.isArray(x) ? x.map(String) : []; };

/** Sends (or updates) the class's curriculum plan. */
export async function sendCurriculumPlan(repo: Repo, actor: Actor, input: { classId: string; targetCorrect?: number; openUnits?: string[] | null }, now = new Date()): Promise<{ planId: string; places: number; created: boolean }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const target = Math.max(5, Math.min(50, Math.round(input.targetCorrect ?? DEFAULT_TARGET_CORRECT)));
  const groups = await planPlaces(repo, actor.schoolId!, grade);
  const places = groups.flatMap((g) => g.places.map((p) => ({ code: p.code, label: `${g.unit} · ${g.set} · ${p.label.replace(/ \(adaptive\)$/, "")}` })));
  if (!places.length) throw new ValidationError(`Grade ${grade} has no Curriculum Map places with questions yet.`);
  const open = input.openUnits && input.openUnits.length ? input.openUnits : null;
  const existing = (await repo.findMany("SkillPlan", { classId: input.classId, kind: "CURRICULUM" }))[0];
  if (existing) {
    await repo.updateMany("SkillPlan", { id: existing.id }, { targetCorrect: target, openUnits: open });
    // new places on the map join the plan
    const have = new Set((await repo.findMany("SkillPlanItem", { planId: existing.id }, { select: ["code"] })).map((i) => s(i.code)));
    let order = have.size;
    for (const p of places.filter((x) => !have.has(x.code))) await repo.create("SkillPlanItem", { planId: existing.id, code: p.code, label: p.label.slice(0, 255), assignmentIds: [], order: order++ });
    return { planId: s(existing.id), places: places.length, created: false };
  }
  const plan = await repo.create("SkillPlan", { schoolId: actor.schoolId, classId: input.classId, title: `Grade ${grade} Curriculum`, kind: "CURRICULUM", targetCorrect: target, openUnits: open, gradeLevel: grade, note: null, createdById: actor.userId, createdAt: now });
  await repo.createMany("SkillPlanItem", places.map((p, i) => ({ planId: plan.id, code: p.code, label: p.label.slice(0, 255), assignmentIds: [], order: i })));
  const members = await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] });
  const sts = members.length ? await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["userId"] }) : [];
  if (sts.length) await repo.createMany("Notification", sts.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "📘 Your curriculum plan is ready", body: `Every unit of Grade ${grade}: open My Plans and tap any part to practise it. ${target} correct answers finish a part.`, link: `/student/plans/${s(plan.id)}`, readAt: null, createdAt: now })));
  return { planId: s(plan.id), places: places.length, created: true };
}

/** Which units of the plan are open (null = all), and the unit calendar (a unit opens by itself on its date). */
export async function setOpenUnits(repo: Repo, actor: Actor, planId: string, open: string[] | null, dates?: Record<string, string>): Promise<void> {
  assertCan(actor, "assignments:create");
  const plan = await repo.findUnique("SkillPlan", { id: planId });
  if (!plan || s(plan.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Plan not found.");
  await assertClassAccess(repo, actor, s(plan.classId));
  const cal = Object.fromEntries(Object.entries(dates ?? {}).filter(([, d]) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  await repo.updateMany("SkillPlan", { id: planId }, { openUnits: open, unitDates: Object.keys(cal).length ? cal : null });
}

export const unitOfLabel = (label: string) => label.split(" · ")[0] ?? "";
export { isUnitOpen };

/**
 * A student opens a place of a plan: their set if they have one; else the class's set for this place (they
 * are added to it if they joined later); else it is made now for the whole class (silently).
 */
export async function openPlanItem(repo: Repo, actor: Actor, planId: string, itemId: string, now = new Date()): Promise<string> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const [plan, item] = await Promise.all([repo.findUnique("SkillPlan", { id: planId }), repo.findUnique("SkillPlanItem", { id: itemId })]);
  if (!plan || !item || s(item.planId) !== s(plan.id)) throw new ForbiddenError("This part of the plan was not found.");
  const member = await repo.findUnique("ClassMembership", { classId: plan.classId, studentId: actor.studentId });
  if (!member || member.leftAt) throw new ForbiddenError("This plan is for another class.");
  if (plan.kind === "CURRICULUM" && !isUnitOpen(plan, unitOfLabel(s(item.label)), now)) throw new ValidationError("Your teacher has not opened this unit yet.");
  const aids = ids(item.assignmentIds);
  if (aids.length) {
    const mine = await repo.findMany("AssignmentStudent", { assignmentId: { in: aids }, studentId: actor.studentId }, { select: ["assignmentId"] });
    if (mine.length) return `/quiz/${s(mine[0].assignmentId)}`;
    if (plan.kind === "CURRICULUM") {
      // a student who joined the class later: added to the class's set
      await repo.create("AssignmentStudent", { assignmentId: aids[0], studentId: actor.studentId, status: "NOT_STARTED", progress: 0 });
      return `/quiz/${aids[0]}`;
    }
    throw new ForbiddenError("This part of the plan was not assigned to you.");
  }
  if (plan.kind !== "CURRICULUM") throw new ForbiddenError("This part of the plan was not assigned to you.");
  // made now for the class, as from the teacher who sent the plan
  const creator = plan.createdById ? await repo.findUnique("User", { id: plan.createdById }) : null;
  const teacher = creator ? await resolveActor(repo, creator) : null;
  if (!teacher) throw new ValidationError("Ask your teacher to send the plan again.");
  const r = await assignFromMap(repo, teacher, { classId: s(plan.classId), categoryCode: s(item.code), mode: "ADAPTIVE", targetCorrect: Number(plan.targetCorrect) || DEFAULT_TARGET_CORRECT, silent: true, curriculumPlanId: s(plan.id), note: "Curriculum plan" }, now);
  const made = r.groups.map((g) => g.assignmentId);
  await repo.updateMany("SkillPlanItem", { id: item.id }, { assignmentIds: made });
  const mine = await repo.findMany("AssignmentStudent", { assignmentId: { in: made }, studentId: actor.studentId }, { select: ["assignmentId"] });
  return `/quiz/${s(mine[0]?.assignmentId ?? made[0])}`;
}

export type CellStatus = "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "STUCK";
export interface PlanGrid {
  planId: string; title: string; className: string; target: number; openUnits: string[] | null; unitDates: Record<string, string>; unitOpen: Record<string, boolean>; units: string[];
  items: { id: string; code: string; unit: string; set: string; category: string; done: number; started: number }[];
  students: { id: string; name: string; done: number; cells: Record<string, { status: CellStatus; correct: number }> }[];
}

/** 🟩 Teacher: every student × every part of the plan (done / working / stuck / not started). */
export async function curriculumPlanGrid(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<PlanGrid> {
  assertCan(actor, "reports:read");
  const plan = await repo.findUnique("SkillPlan", { id: planId });
  if (!plan || s(plan.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Plan not found.");
  const klass = await assertClassAccess(repo, actor, s(plan.classId));
  const items = (await repo.findMany("SkillPlanItem", { planId })).sort((a, b) => Number(a.order) - Number(b.order));
  const members = await repo.findMany("ClassMembership", { classId: plan.classId, leftAt: null }, { select: ["studentId"] });
  const sids = members.map((m) => s(m.studentId));
  const aids = items.flatMap((i) => ids(i.assignmentIds));
  const [rows, sessions, sts] = await Promise.all([
    aids.length ? repo.findMany("AssignmentStudent", { assignmentId: { in: aids } }, { select: ["assignmentId", "studentId", "status"] }) : Promise.resolve([] as Row[]),
    aids.length ? repo.findMany("PracticeSession", { assignmentId: { in: aids }, mode: "TEACHER_QUIZ" }, { select: ["assignmentId", "studentId", "correctCount", "questionCount"] }) : Promise.resolve([] as Row[]),
    sids.length ? repo.findMany("Student", { id: { in: sids } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
  ]);
  const users = sts.length ? await repo.findMany("User", { id: { in: sts.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = (id: string) => s(users.find((u) => u.id === sts.find((x) => x.id === id)?.userId)?.displayName) || "Student";
  const target = Number(plan.targetCorrect) || DEFAULT_TARGET_CORRECT;
  const out: PlanGrid["students"] = sids.map((id) => ({ id, name: nameOf(id), done: 0, cells: {} }));
  const itemRows = items.map((it) => {
    const [unit = "", set = "", category = ""] = s(it.label).split(" · ");
    const mine = new Set(ids(it.assignmentIds));
    let done = 0, started = 0;
    for (const st of out) {
      const r = rows.find((x) => mine.has(s(x.assignmentId)) && s(x.studentId) === st.id);
      const ses = sessions.find((x) => mine.has(s(x.assignmentId)) && s(x.studentId) === st.id);
      const answered = Number(ses?.questionCount ?? 0), correct = Number(ses?.correctCount ?? 0);
      const status: CellStatus = r?.status === "COMPLETED" ? "COMPLETED" : answered >= 40 && correct < target ? "STUCK" : answered > 0 ? "IN_PROGRESS" : "NOT_STARTED";
      st.cells[s(it.id)] = { status, correct: status === "COMPLETED" ? Math.max(correct, target) : Math.min(correct, target - 1) };
      if (status === "COMPLETED") { done++; st.done++; }
      if (status !== "NOT_STARTED") started++;
    }
    return { id: s(it.id), code: s(it.code), unit, set, category, done, started };
  });
  const unitList = [...new Set(itemRows.map((i) => i.unit))];
  return { planId, title: s(plan.title), className: s(klass.name), target, openUnits: openUnitsOf(plan), unitDates: unitDatesOf(plan), unitOpen: Object.fromEntries(unitList.map((u) => [u, isUnitOpen(plan, u, now)])), units: unitList, items: itemRows, students: out.sort((a, b) => a.name.localeCompare(b.name)) };
}

export { placeSkills } from "./plans";
