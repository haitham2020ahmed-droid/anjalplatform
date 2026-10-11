/**
 * 📘 Send a curriculum plan from the Curriculum Map: the whole grade, or one unit, to a class, a group of its
 * students, or one student. Each part (Concept Vocabulary, Analyze Craft and Structure, Respond to Reading) is
 * assigned exactly like the per-section Assign (assignFromMap: adaptive, goal = correct answers), grouped in one
 * plan the student opens in My Plans (the parts stay out of the work list, like the full-curriculum plan).
 * Every assignment it makes is marked program = "CURRICULUM" (grammar skills of the curriculum included).
 * The engine (levels, mastery, movement) is not touched: this only creates assignments.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { accessibleClasses, DEFAULT_TARGET_CORRECT } from "../teacher/assign";
import { assignFromMap } from "./levels";
import { planPlaces } from "./plans";

const s = (v: unknown) => String(v ?? "");
export const CURRICULUM_PROGRAM = "CURRICULUM";

export interface SendMapPlanInput { grade: number; unitCode?: string | null; classId: string; studentIds?: string[] | null }
export interface SendMapPlanResult { planId: string; parts: number; students: number; skipped: string[] }

/** "G4.U2" → 2 */
const unitNumberOf = (code: string): number | null => { const m = /^G\d+\.U(\d+)$/i.exec(code.trim()); return m ? Number(m[1]) : null; };

export async function sendMapPlan(repo: Repo, actor: Actor, input: SendMapPlanInput, now = new Date()): Promise<SendMapPlanResult> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can send plans.");
  // the teacher's own classes only (admins: any class of the school)
  const klass = await assertClassAccess(repo, actor, s(input.classId));
  const grade = Math.round(Number(input.grade));
  if (!Number.isFinite(grade) || grade <= 0) throw new ValidationError("Choose a grade.");
  const members = await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] });
  const inClass = new Set(members.map((m) => s(m.studentId)));
  const chosen = [...new Set((input.studentIds ?? []).map(s).filter(Boolean))];
  if (chosen.some((id) => !inClass.has(id))) throw new ForbiddenError("You can only send plans to students in your own class.");
  const recipients = chosen.length ? chosen : [...inClass];
  if (!recipients.length) throw new ValidationError("This class has no students yet.");

  const unitNo = input.unitCode ? unitNumberOf(s(input.unitCode)) : null;
  if (input.unitCode && unitNo === null) throw new ValidationError("That unit is not on the Curriculum Map.");
  const groups = (await planPlaces(repo, actor.schoolId!, grade)).filter((g) => unitNo === null || g.unit.split(":")[0].trim() === `Unit ${unitNo}`);
  const places = groups.flatMap((g) => g.places.map((p) => ({ code: p.code, label: `${g.unit} · ${g.set} · ${p.label.replace(/ \(adaptive\)$/, "")}` })));
  if (!places.length) throw new ValidationError(unitNo ? `Unit ${unitNo} of Grade ${grade} is not on the Curriculum Map.` : `Grade ${grade} is not on the Curriculum Map.`);

  const title = unitNo ? `Grade ${grade} · Unit ${unitNo} plan` : `Grade ${grade} Curriculum plan`;
  const plan = await repo.create("SkillPlan", { schoolId: actor.schoolId, classId: klass.id, title, kind: "UNIT", targetCorrect: DEFAULT_TARGET_CORRECT, gradeLevel: grade, note: null, createdById: actor.userId, createdAt: now });
  const skipped: string[] = [];
  const made: string[] = [];
  let order = 0;
  for (const p of places) {
    try {
      const r = await assignFromMap(repo, actor, { classId: s(klass.id), categoryCode: p.code, studentIds: chosen.length ? chosen : undefined, mode: "ADAPTIVE", targetCorrect: DEFAULT_TARGET_CORRECT, silent: true, curriculumPlanId: s(plan.id), note: title }, now);
      const aids = r.groups.map((g) => g.assignmentId);
      made.push(...aids);
      await repo.create("SkillPlanItem", { planId: plan.id, code: p.code, label: p.label.slice(0, 255), assignmentIds: aids, order: order++ });
    } catch (e) {
      if (e instanceof ValidationError) skipped.push(p.label); else throw e;
    }
  }
  if (!order) {
    await repo.deleteMany("SkillPlan", { id: plan.id });
    throw new ValidationError("Nothing could be sent yet: these lessons have no published questions.");
  }
  if (made.length) await repo.updateMany("Assignment", { id: { in: made } }, { program: CURRICULUM_PROGRAM });
  // one message per student (the parts themselves were made silently)
  const sts = await repo.findMany("Student", { id: { in: recipients } }, { select: ["userId"] });
  if (sts.length) await repo.createMany("Notification", sts.map((x: Row) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: `📘 ${title}`, body: "Your teacher sent you a plan. Open My Plans to start.", link: `/student/plans/${s(plan.id)}`, readAt: null, createdAt: now })));
  return { planId: s(plan.id), parts: order, students: recipients.length, skipped };
}

/** The classes the actor may send to (teacher: own classes; admin: every class of the school), with student names. */
export interface SendClass { id: string; name: string; students: { id: string; name: string }[] }
export async function sendTargets(repo: Repo, actor: Actor): Promise<SendClass[]> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") return [];
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (!classes.length) return [];
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] });
  const sts = members.length ? await repo.findMany("Student", { id: { in: [...new Set(members.map((m) => s(m.studentId)))] } }, { select: ["id", "userId"] }) : [];
  const users = sts.length ? await repo.findMany("User", { id: { in: sts.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const userName = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const nameOf = new Map(sts.map((x) => [s(x.id), userName.get(s(x.userId)) || "Student"]));
  return classes.map((c) => ({
    id: s(c.id), name: s(c.name),
    students: members.filter((m) => m.classId === c.id).map((m) => ({ id: s(m.studentId), name: nameOf.get(s(m.studentId)) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
