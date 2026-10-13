/**
 * Suggest → the teacher decides → Preview → Send, shared by the program pages (MAP page, RTI page, Plans page).
 *
 *   applyEdits      the suggestion + the teacher's ticks (keep) + skills the teacher added (for every chosen student)
 *   sendProgramPlan one plan (SkillPlan, shown in the student's My Plans) whose skills are normal skill assignments
 *                   (My Work, adaptive practice, statuses, reports), each sent ONLY to the students it is for, and
 *                   tagged with the program of the page it was sent from (Assignment.program)
 *   sentPlans       every plan the teacher sent (any program), with its program, students and progress
 *
 * Access: the class must be the teacher's own (assertClassAccess; a school admin any class of the school), every
 * student must be in that class, skills may come from any grade of the school (assignSkill checks both again).
 * Nothing changes the adaptive engine, levels or mastery.
 */
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { isGrammarCode } from "../grammar/grammar";
import { assignSkill } from "../teacher/assign";
import { familyIdsInSchool } from "../questions/skill-questions";
import { assertClassAccess } from "../teacher/assignments";
import { planKindOf, programOfPlanKind, tagProgram, trackOfProgram, type Program } from "./program";

const s = (v: unknown) => String(v ?? "");
/** most skills one plan may send at once (each is one assignment) */
export const MAX_SEND_SKILLS = 40;

/** One suggested (or chosen) skill and the students it is for. */
export interface PlanSkill { id: string; name: string; reason: string; studentIds: string[]; grade?: number | null; questions?: number | null }
export interface PlanPick { studentId: string; skillId: string }

/**
 * The plan after the teacher's edits: suggested skills that are kept (keep = null → all), then the added skills
 * for every chosen student (a skill already in the plan is not added twice). Capped at MAX_SEND_SKILLS.
 */
export function applyEdits(suggested: PlanSkill[], keep: string[] | null, added: { id: string; name: string; grade?: number | null; questions?: number | null }[], studentIds: string[]): PlanSkill[] {
  const k = keep ? new Set(keep) : null;
  const out = suggested.filter((x) => !k || k.has(x.id));
  for (const a of added) if (!out.some((x) => x.id === a.id)) out.push({ id: a.id, name: a.name, reason: "Added by you", studentIds: [...studentIds], grade: a.grade ?? null, questions: a.questions ?? null });
  return out.slice(0, MAX_SEND_SKILLS);
}

/** (student, skill) pairs of a plan. */
export const picksOf = (skills: PlanSkill[]): PlanPick[] => skills.flatMap((k) => k.studentIds.map((studentId) => ({ studentId, skillId: k.id })));

const LABEL: Record<string, string> = { MAP: "MAP Plan", RTI: "RTI Plan", NAFS: "NAFS Plan", CURRICULUM: "Curriculum Plan", CUSTOM: "Custom Plan" };
export const planLabel = (p: Program | null) => LABEL[p ?? "CUSTOM"];

export interface SendPlanInput {
  classId: string;
  /** the page it is sent from (null = a custom plan) */
  program: Program | null;
  title?: string | null;
  picks: PlanPick[];
  dueAt?: Date | null;
  note?: string | null;
  /**
   * The questions the teacher picked for a skill ("I'll pick the questions"), by skill id; a skill not listed (or
   * an empty list) = the platform chooses at each student's level. Stored on that skill's Assignment.questionIds.
   */
  questionIds?: Record<string, string[] | null | undefined> | null;
}
export interface SendPlanResult { planId: string; skills: number; students: number; assignmentIds: string[] }

/** Sends one plan: each skill to the students it is for, tagged with the program. Nothing half-made on an error. */
export async function sendProgramPlan(repo: Repo, actor: Actor, input: SendPlanInput, now = new Date()): Promise<SendPlanResult> {
  assertCan(actor, "assignments:create");
  if (!input.classId) throw new ValidationError("Choose a class.");
  const klass = await assertClassAccess(repo, actor, input.classId); // a teacher: their own class only
  const members = new Set((await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  const bySkill = new Map<string, Set<string>>();
  for (const p of input.picks ?? []) {
    if (!p?.studentId || !p?.skillId) continue;
    if (!members.has(s(p.studentId))) throw new ForbiddenError("You can only send work to students in this class.");
    bySkill.set(s(p.skillId), (bySkill.get(s(p.skillId)) ?? new Set()).add(s(p.studentId)));
  }
  if (!bySkill.size) throw new ValidationError("Choose at least one skill.");
  if (bySkill.size > MAX_SEND_SKILLS) throw new ValidationError(`A plan can have at most ${MAX_SEND_SKILLS} skills.`);
  const skillRows = await repo.findMany("Skill", { id: { in: [...bySkill.keys()] } }, { select: ["id", "name", "code", "curriculumId"] });
  const curs = skillRows.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skillRows.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const gradeOf = (k: Row) => Number(grades.find((g) => g.id === curs.find((c) => c.id === k.curriculumId)?.gradeId)?.level ?? 0);
  const classGrade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  if (input.program === "NAFS" && classGrade !== 6) throw new ValidationError("NAFS plans are for Grade 6 classes only.");
  const classSize = members.size;
  const label = planLabel(input.program);
  const title = (s(input.title).replace(/\s+/g, " ").trim() || `${label} · ${s(klass.name)}`).slice(0, 191);
  const note = s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
  const plan = await repo.create("SkillPlan", { schoolId: klass.schoolId, classId: klass.id, title, kind: planKindOf(input.program), targetCorrect: null, gradeLevel: classGrade, note, createdById: actor.userId, createdAt: now,
    status: "SENT", program: input.program ?? null, dueAt: input.dueAt ?? null, sentAt: now, updatedAt: now });
  const assignmentIds: string[] = [];
  const students = new Set<string>();
  try {
    let order = 0;
    for (const [skillId, who] of bySkill) {
      const k = skillRows.find((x) => s(x.id) === skillId);
      if (!k) throw new ValidationError("Choose an active skill.");
      const ids = [...who].sort();
      const picked = await pickedOfSkill(repo, s(klass.schoolId), skillId, input.questionIds?.[skillId]);
      const r = await assignSkill(repo, actor, {
        classId: s(klass.id), skillId, studentIds: ids.length === classSize ? undefined : ids, track: trackOfProgram(input.program, isGrammarCode(k.code)), dueAt: input.dueAt ?? null, note: note ?? `${label}: ${title}`,
        program: input.program ?? null, questionIds: picked?.length ? picked : null,
      }, now);
      assignmentIds.push(r.assignmentId);
      for (const id of ids) students.add(id);
      await repo.create("SkillPlanItem", { planId: plan.id, code: s(k.code).slice(0, 80), label: `${label} · Grade ${gradeOf(k)} · ${s(k.name)}`.slice(0, 255), assignmentIds: [r.assignmentId], order: order++ });
    }
    await tagProgram(repo, assignmentIds, input.program);
  } catch (e) {
    if (assignmentIds.length) await repo.updateMany("Assignment", { id: { in: assignmentIds } }, { deletedAt: now });
    await repo.deleteMany("SkillPlanItem", { planId: plan.id });
    await repo.deleteMany("SkillPlan", { id: plan.id });
    throw e;
  }
  await audit(repo, { actorId: actor.userId, action: "plan.send", entityType: "SkillPlan", entityId: s(plan.id), after: { program: input.program, classId: s(klass.id), skills: assignmentIds.length, students: students.size }, at: now });
  return { planId: s(plan.id), skills: assignmentIds.length, students: students.size, assignmentIds };
}

/** The teacher's picks for one skill: only questions of that skill (any grade's copy of it); none = null (automatic). */
async function pickedOfSkill(repo: Repo, schoolId: string, skillId: string, ids: string[] | null | undefined): Promise<string[] | null> {
  const want = [...new Set((ids ?? []).map(s).filter(Boolean))];
  if (!want.length) return null;
  const fam = new Set(await familyIdsInSchool(repo, schoolId, skillId));
  const rows = await repo.findMany("Question", { id: { in: want } }, { select: ["id", "skillId"] });
  const ok = new Set(rows.filter((q) => fam.has(s(q.skillId))).map((q) => s(q.id)));
  if (want.some((id) => !ok.has(id))) throw new ValidationError("Choose questions of this skill only.");
  return want;
}

// ------------------------------------------------------------------ All plans sent

export interface SentPlan { id: string; title: string; program: Program | null; className: string; students: number; skills: number; progress: number; sentAt: string; href: string }

const ids = (v: unknown): string[] => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const day = (v: unknown) => (v instanceof Date ? v.toISOString() : s(v)).slice(0, 10);

/**
 * Every plan the teacher sent (a school admin: every plan of the school), newest first: plans from the program
 * pages and the Curriculum Map (SkillPlan) and the older per-student MAP plans (MapPlan, one row per class,
 * subject and term). Progress = the students' average progress on the plan's work. Bounded (newest `limit`).
 */
export async function sentPlans(repo: Repo, actor: Actor, limit = 40): Promise<SentPlan[]> {
  assertCan(actor, "assignments:read");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const mine = actor.role === "TEACHER" ? { createdById: actor.userId } : { schoolId: actor.schoolId };
  const plans = (await repo.findMany("SkillPlan", mine, { select: ["id", "title", "kind", "classId", "createdAt"] }))
    .sort((a, b) => day(b.createdAt).localeCompare(day(a.createdAt)) || s(b.id).localeCompare(s(a.id))).slice(0, limit);
  const mapPlans = (await repo.findMany("MapPlan", { ...mine, status: "SENT" }, { select: ["classId", "subject", "term", "assignmentIds", "sentAt"] }));
  const items = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }, { select: ["planId", "assignmentIds"] }) : [];
  const groups = new Map<string, { classId: string; subject: string; term: string; assignmentIds: string[]; sentAt: string }>();
  for (const m of mapPlans) {
    const key = `${s(m.classId)}|${s(m.subject)}|${s(m.term)}`;
    const g = groups.get(key) ?? { classId: s(m.classId), subject: s(m.subject), term: s(m.term), assignmentIds: [], sentAt: "" };
    g.assignmentIds.push(...ids(m.assignmentIds));
    if (day(m.sentAt) > g.sentAt) g.sentAt = day(m.sentAt);
    groups.set(key, g);
  }
  const planAssignments = new Map(plans.map((p) => [s(p.id), items.filter((i) => s(i.planId) === s(p.id)).flatMap((i) => ids(i.assignmentIds))]));
  const allIds = [...new Set([...[...planAssignments.values()].flat(), ...[...groups.values()].flatMap((g) => g.assignmentIds)])];
  const links = allIds.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: allIds } }, { select: ["assignmentId", "studentId", "status", "progress"] }) : [];
  const classIds = [...new Set([...plans.map((p) => s(p.classId)), ...[...groups.values()].map((g) => g.classId)])];
  const classes = classIds.length ? await repo.findMany("Class", { id: { in: classIds } }, { select: ["id", "name"] }) : [];
  const nameOf = (id: string) => s(classes.find((c) => s(c.id) === id)?.name ?? "");
  const stats = (aIds: string[]) => {
    const set = new Set(aIds);
    const mineLinks = links.filter((l) => set.has(s(l.assignmentId)));
    const progress = mineLinks.length ? Math.round((100 * mineLinks.reduce((t, l) => t + (l.status === "COMPLETED" ? 1 : Math.max(0, Math.min(1, Number(l.progress) || 0))), 0)) / mineLinks.length) : 0;
    return { students: new Set(mineLinks.map((l) => s(l.studentId))).size, progress };
  };
  const out: SentPlan[] = plans.map((p) => {
    const a = planAssignments.get(s(p.id)) ?? [];
    return { id: s(p.id), title: s(p.title), program: programOfPlanKind(p.kind), className: nameOf(s(p.classId)), skills: a.length, ...stats(a), sentAt: day(p.createdAt), href: `/teacher/plans/${s(p.id)}` };
  });
  for (const [key, g] of groups) {
    out.push({ id: `map:${key}`, title: `MAP plans · ${g.subject === "LANGUAGE" ? "Language Usage" : "Reading"} · ${g.term}`, program: "MAP", className: nameOf(g.classId), skills: g.assignmentIds.length, ...stats(g.assignmentIds), sentAt: g.sentAt,
      href: `/teacher/map-plans/print?${new URLSearchParams({ classId: g.classId, subject: g.subject })}` });
  }
  return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt) || a.title.localeCompare(b.title)).slice(0, limit);
}
