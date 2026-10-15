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
 * student must be in that class, skills may come from any grade of the school (plans/batch-send.ts checks both, and
 * sends every skill in one batch — r82).
 * Nothing changes the adaptive engine, levels or mastery.
 */
import type { Repo } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { SOURCE_REQUIRED } from "../assign/source";
import { isGrammarCode } from "../grammar/grammar";
import { schoolSkillIndex } from "../questions/skill-questions";
import { newRowId, pairsKey, planSource, recentTwin, sendLock, sendPartsBatch, type BatchPart } from "./batch-send";
import { assertClassAccess } from "../teacher/assignments";
import { planKindOf, programOfPlanKind, trackOfProgram, type Program } from "./program";
import { masteredBySkill } from "../skills/status-extras";

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
  /** r74: REQUIRED — the Source chosen in the window */
  source?: string | null;
  title?: string | null;
  picks: PlanPick[];
  dueAt?: Date | null;
  /** r68: students see the plan's work from this day */
  startAt?: Date | null;
  note?: string | null;
  /**
   * The questions the teacher picked for a skill ("I'll pick the questions"), by skill id; a skill not listed (or
   * an empty list) = the platform chooses at each student's level. Stored on that skill's Assignment.questionIds.
   */
  questionIds?: Record<string, string[] | null | undefined> | null;
  /** ⭐ leave out each skill's students who already mastered it (the teacher answered Yes) */
  excludeMastered?: boolean;
}
export interface SendPlanResult { planId: string; skills: number; students: number; assignmentIds: string[] }

/**
 * Sends one plan: each skill to the students it is for, tagged with the program — in ONE batch (r82: a 30 × 10 plan
 * is a few dozen database calls, not one full assign per skill). Nothing half-made on an error. The same Send twice
 * (a double press, a reload) gives back the first plan instead of a second copy.
 */
export async function sendProgramPlan(repo: Repo, actor: Actor, input: SendPlanInput, now = new Date()): Promise<SendPlanResult> {
  assertCan(actor, "assignments:create");
  if (!input.classId) throw new ValidationError("Choose a class.");
  // r74 + owner r82: a program plan's work is that program's (RTI → RTI, NAFS → NAFS, MAP → MAP, Curriculum →
  // Curriculum); a custom plan needs the teacher's choice
  const source = planSource(input.program, input.source);
  if (!source) throw new ValidationError(SOURCE_REQUIRED);
  const klass = await assertClassAccess(repo, actor, input.classId); // a teacher: their own class only
  return sendLock(actor, s(klass.id), async () => {
    const [memberRows, gradeRow, idx] = await Promise.all([
      repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }),
      repo.findUnique("Grade", { id: klass.gradeId }),
      schoolSkillIndex(repo, s(klass.schoolId)),
    ]);
    const members = new Set(memberRows.map((m) => s(m.studentId)));
    const bySkill = new Map<string, Set<string>>();
    for (const p of input.picks ?? []) {
      if (!p?.studentId || !p?.skillId) continue;
      if (!members.has(s(p.studentId))) throw new ForbiddenError("You can only send work to students in this class.");
      bySkill.set(s(p.skillId), (bySkill.get(s(p.skillId)) ?? new Set()).add(s(p.studentId)));
    }
    if (!bySkill.size) throw new ValidationError("Choose at least one skill.");
    // ⭐ "N students already mastered this skill — exclude them?" → Yes: a student never repeats a mastered skill
    if (input.excludeMastered) {
      const mastered = await masteredBySkill(repo, s(klass.schoolId), [...members], [...bySkill.keys()]);
      for (const [skillId, who] of bySkill) { for (const id of mastered.get(skillId) ?? []) who.delete(id); if (!who.size) bySkill.delete(skillId); }
      if (!bySkill.size) throw new ValidationError("Every student already mastered these skills.");
    }
    if (bySkill.size > MAX_SEND_SKILLS) throw new ValidationError(`A plan can have at most ${MAX_SEND_SKILLS} skills.`);
    for (const id of bySkill.keys()) if (!idx.skillOf.get(id)?.isActive) throw new ValidationError("Choose an active skill.");
    const classGrade = Number(gradeRow?.level ?? 0);
    if (input.program === "NAFS" && classGrade !== 6) throw new ValidationError("NAFS plans are for Grade 6 classes only.");
    const label = planLabel(input.program);
    const title = (s(input.title).replace(/\s+/g, " ").trim() || `${label} · ${s(klass.name)}`).slice(0, 191);
    const note = s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
    const kind = planKindOf(input.program);
    // Send twice = once
    const twin = await recentTwin(repo, actor, { classId: s(klass.id), title, kind, pairs: pairsKey([...bySkill].flatMap(([k, who]) => [...who].map((st) => [st, k] as [string, string]))) }, now);
    if (twin) return { planId: twin.planId, skills: twin.skills, students: twin.students, assignmentIds: twin.assignmentIds };
    const planId = newRowId();
    const parts: BatchPart[] = [...bySkill].map(([skillId, who]) => {
      const k = idx.skillOf.get(skillId)!;
      return { skillId, studentIds: [...who].sort(), track: trackOfProgram(input.program, isGrammarCode(k.code)), questionIds: input.questionIds?.[skillId] ?? null, itemCode: k.code, itemLabel: `${label} · Grade ${k.grade} · ${k.name}` };
    });
    // the plan row first (its id is in the items and notifications); removed again if the batch fails
    await repo.create("SkillPlan", { id: planId, schoolId: klass.schoolId, classId: klass.id, title, kind, targetCorrect: null, gradeLevel: classGrade, note, createdById: actor.userId, createdAt: now,
      status: "SENT", program: input.program ?? null, dueAt: input.dueAt ?? null, ...(input.startAt ? { startAt: input.startAt } : {}), sentAt: now, updatedAt: now });
    let r;
    try {
      r = await sendPartsBatch(repo, actor, { klass, members: [...members], plan: { id: planId, title }, parts, dueAt: input.dueAt ?? null, startAt: input.startAt ?? null, note: note ?? `${label}: ${title}`, program: input.program, source, familyOnly: true }, now);
    } catch (e) {
      await repo.deleteMany("SkillPlan", { id: planId }).catch(() => 0);
      throw e;
    }
    await audit(repo, { actorId: actor.userId, action: "plan.send", entityType: "SkillPlan", entityId: planId, after: { program: input.program, classId: s(klass.id), skills: r.assignmentIds.length, students: r.students.size, source }, at: now });
    return { planId, skills: r.assignmentIds.length, students: r.students.size, assignmentIds: r.assignmentIds };
  });
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
