/**
 * 📤 r82 (owner: "when it sends the plan it STOPS"): ONE batched send for every plan path — the plan editor's Send,
 * the program pages' Send (MAP / RTI / NAFS / Custom) and the Plans wizard.
 *
 * Before r82 every part of a plan was a full assignSkill (15–19 database calls: class, teacher, skill, curriculum,
 * grade, members, question count, students, a transaction with the assignment, links, notifications and audit),
 * then a SkillPlanItem, a skill read for its code… and, for parts with their lesson (the RTI "Struggling skills"
 * drafts: every part), one lesson invite per student and part (~8 calls each, one after another). An RTI draft for
 * 30 students × 10 skills was ~2 000 calls in a row: on Render (0.5 CPU, the database in another region) the Send
 * button spun for minutes and the request timed out.
 *
 * Now everything shared is read ONCE (the teacher, the school's skill index — cached —, the question counts of the
 * automatic parts, the teacher's picked questions, the students' accounts) and written in ONE transaction with
 * chunked createMany: the assignments (ids made here), their student links, the plan's items, one audit row per
 * assignment and ONE notification per student for the whole plan. Lessons: one read of the open runs, one
 * createMany of the new runs and their notifications. A 30 × 10 plan is a few dozen calls whatever its size.
 * Nothing half-made: the transaction is all or nothing.
 *
 * The rules are the ones assignSkill applies (same checks, same rows): skills of the school (any grade, active),
 * students of the class, dates, picked questions published and of the school (and, `familyOnly`, of that skill's
 * family), never a part with no questions. The adaptive engine, levels and mastery are not touched.
 */
import { randomBytes } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { AssignSource } from "../assign/source";
import { DEFAULT_TARGET_MASTERY, MAX_SET_QUESTIONS, NO_QUESTIONS_YET, programOrNull, type Track } from "../teacher/assign";
import { countQuestionsOfSkills, schoolSkillIndex } from "../questions/skill-questions";
import { hasLessons } from "../lessons/run";
import { withLock } from "../lib/key-lock";
import { log } from "../monitoring/log";
import type { Program } from "./program";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
/** A new row id (the batch needs the assignments' ids before they are written). */
export const newRowId = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
/** rows per INSERT (MySQL packet limit; PrismaRepo also splits at 500) */
const CHUNK = 400;

/**
 * r74 + owner r82: the source of a plan's work. A plan of a program is that program's work (RTI plan → RTI, NAFS →
 * NAFS, MAP → MAP, Curriculum → Curriculum) whatever was chosen; a custom plan needs the teacher's choice.
 */
export function planSource(program: Program | null, chosen: unknown): AssignSource | null {
  if (program) return program;
  const v = s(chosen).trim().toUpperCase();
  return (["MAP", "NAFS", "CURRICULUM", "GRAMMAR", "RTI"] as const).find((x) => x === v) ?? null;
}

export interface BatchPart {
  skillId: string;
  /** the part's students (all of them in the class; checked) */
  studentIds: string[];
  track: Track;
  /** the teacher's own questions (null / empty = the platform chooses at each student's level) */
  questionIds?: string[] | null;
  /** the assignment's title (default: the skill's name), e.g. a Curriculum Map lesson's name */
  title?: string | null;
  /** also open the skill's interactive lesson for the part's students */
  lesson?: boolean;
  /** the plan item (My Plans) */
  itemCode?: string | null;
  itemLabel: string;
  /** a paused plan's part starts "later" */
  startAt?: Date | null;
  /** the item's place in the plan (default: after the previous part) */
  order?: number;
}

export interface BatchInput {
  klass: Row;
  /** the class's current students */
  members: readonly string[];
  plan: { id: string; title: string };
  parts: BatchPart[];
  dueAt?: Date | null;
  startAt?: Date | null;
  /** the assignments' note (the teacher's note, or "<label>: <title>") */
  note?: string | null;
  program: Program | null;
  source: AssignSource;
  /** picked questions must be of the part's skill (any grade's copy) */
  familyOnly?: boolean;
  /** first item order (an edit after sending adds parts after the others) */
  order?: number;
  /** ONE notification per student for the plan (false: an edit after sending tells them itself) */
  notify?: boolean;
  /** lesson invites wait (a paused plan) */
  noLessons?: boolean;
}

export interface BatchResult { assignmentIds: string[]; students: Set<string>; byPart: { assignmentId: string; studentIds: string[] }[] }

/** Who the work is from: the teacher themself; for an admin, the class's teacher (as assignSkill). */
async function assigningTeacher(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  const own = await repo.findUnique("Teacher", { userId: actor.userId });
  if (own) return own;
  if (actor.role === "TEACHER") throw new ForbiddenError("Only teachers can assign skills.");
  const ct = (await repo.findMany("ClassTeacher", { classId }, { select: ["teacherId"] }))[0];
  const t = ct ? await repo.findUnique("Teacher", { id: ct.teacherId }) : null;
  if (!t) throw new ForbiddenError("This class has no teacher yet: add its teacher in Users first.");
  return t;
}

/** Sends every part of a plan in one batch (see the file header). The class access is the caller's (already checked). */
export async function sendPartsBatch(repo: Repo, actor: Actor, input: BatchInput, now = new Date()): Promise<BatchResult> {
  const klass = input.klass, schoolId = s(klass.schoolId), classId = s(klass.id);
  const members = new Set(input.members.map(s));
  if (!input.parts.length) throw new ValidationError("Choose at least one skill.");
  const startAt = d(input.startAt), dueAt = d(input.dueAt);
  if (dueAt && dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
  if (startAt && dueAt && dueAt <= startAt) throw new ValidationError("The due date must be after the start date.");
  for (const p of input.parts) {
    if (!p.studentIds.length) throw new ValidationError("Choose at least one student.");
    for (const id of p.studentIds) if (!members.has(s(id))) throw new ForbiddenError("You can only assign work to students in this class.");
  }
  // the shared reads, once: the teacher, the school's skills (cached index), counts, picks, the students' accounts
  const [teacher, idx] = await Promise.all([assigningTeacher(repo, actor, classId), schoolSkillIndex(repo, schoolId)]);
  for (const p of input.parts) {
    const k = idx.skillOf.get(s(p.skillId));
    if (!k || !k.isActive) throw new ValidationError("Choose an active skill.");
  }
  const picked = new Map<number, string[]>();
  input.parts.forEach((p, i) => { const want = [...new Set((p.questionIds ?? []).map(s).filter(Boolean))]; if (want.length) picked.set(i, want); });
  const auto = input.parts.map((p, i) => (picked.has(i) ? null : s(p.skillId))).filter((x): x is string => Boolean(x));
  const allPicked = [...new Set([...picked.values()].flat())];
  const recipients = [...new Set(input.parts.flatMap((p) => p.studentIds.map(s)))];
  const [counts, qs, students] = await Promise.all([
    auto.length ? countQuestionsOfSkills(repo, schoolId, [...new Set(auto)]) : Promise.resolve(new Map<string, number>()),
    allPicked.length ? repo.findMany("Question", { id: { in: allPicked } }, { select: ["id", "skillId", "status", "deletedAt"] }) : Promise.resolve([] as Row[]),
    repo.findMany("Student", { id: { in: recipients } }, { select: ["id", "userId"] }),
  ]);
  for (const id of auto) if (!(counts.get(id) ?? 0)) throw new ValidationError(NO_QUESTIONS_YET);
  if (allPicked.length) {
    const byId = new Map(qs.map((q) => [s(q.id), q]));
    for (const [i, want] of picked) {
      if (want.length > MAX_SET_QUESTIONS) throw new ValidationError(`Choose at most ${MAX_SET_QUESTIONS} questions at a time.`);
      const rows = want.map((id) => byId.get(id));
      if (rows.some((q) => !q || q.status !== "PUBLISHED" || q.deletedAt)) throw new ValidationError("Only published questions can be assigned.");
      if (rows.some((q) => !idx.ids.has(s(q!.skillId)))) throw new ForbiddenError("These questions belong to another school.");
      if (input.familyOnly) {
        const key = idx.keyOf.get(s(input.parts[i].skillId));
        if (rows.some((q) => idx.keyOf.get(s(q!.skillId)) !== key)) throw new ValidationError("Choose questions of this skill only.");
      }
    }
  }
  const userOf = new Map(students.map((x) => [s(x.id), s(x.userId)]));
  const note = s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
  const program = programOrNull(input.program);

  const assignments: Row[] = [], links: Row[] = [], items: Row[] = [], audits: Row[] = [];
  const byPart: BatchResult["byPart"] = [];
  let order = input.order ?? 0;
  input.parts.forEach((p, i) => {
    const k = idx.skillOf.get(s(p.skillId))!;
    const id = newRowId();
    const who = [...new Set(p.studentIds.map(s))].sort();
    const qIds = picked.get(i) ?? null;
    assignments.push({
      id, track: p.track, classId, createdById: teacher.id, title: s(p.title || k.name).slice(0, 191), target: "SKILL", skillId: k.id, skillIds: [k.id],
      startAt: p.startAt !== undefined ? p.startAt : startAt, dueAt, note, targetMastery: DEFAULT_TARGET_MASTERY, createdAt: now,
      ...(program ? { program } : {}), ...(qIds ? { questionIds: qIds } : {}), source: input.source,
    });
    for (const studentId of who) links.push({ assignmentId: id, studentId, status: "NOT_STARTED", progress: 0 });
    items.push({ planId: input.plan.id, code: s(p.itemCode || k.code || k.id).slice(0, 80), label: p.itemLabel.slice(0, 255), assignmentIds: [id], order: p.order ?? order++ });
    audits.push({ actorId: actor.userId, action: "assignment.assign_skill", entityType: "Assignment", entityId: id, before: null, after: { skillId: k.id, classId, students: who.length, scope: who.length === members.size ? "class" : "students", dueAt, planId: input.plan.id }, ip: null, createdAt: now });
    byPart.push({ assignmentId: id, studentIds: who });
  });
  const due = dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : "";
  const notes: Row[] = input.notify === false ? [] : recipients.filter((id) => userOf.has(id)).map((id) => {
    const mine = byPart.filter((b) => b.studentIds.includes(id)).length;
    return { userId: userOf.get(id), type: "NEW_ASSIGNMENT", title: "Your teacher sent you a new plan", body: `${input.plan.title}: ${mine} skill(s).${due}${note ? ` Note: ${note}` : ""}`.slice(0, 1000), link: `/student/plans/${input.plan.id}`, createdAt: now };
  });
  const many = async (tx: Repo, model: string, rows: Row[]) => { for (let i = 0; i < rows.length; i += CHUNK) await tx.createMany(model, rows.slice(i, i + CHUNK)); };
  await repo.transaction(async (tx) => {
    await many(tx, "Assignment", assignments);
    await many(tx, "AssignmentStudent", links);
    await many(tx, "SkillPlanItem", items);
    await many(tx, "AuditLog", audits);
    await many(tx, "Notification", notes);
  });
  const lessonParts = input.noLessons ? [] : input.parts.map((p, i) => ({ skillId: s(p.skillId), who: byPart[i].studentIds })).filter((_, i) => input.parts[i].lesson);
  if (lessonParts.length) {
    // best effort, as before (a lesson invite never undoes the plan), but batched
    await inviteLessonsBatch(repo, schoolId, lessonParts, userOf, now).catch((e) => log("warn", "plans.lessons.failed", { error: e instanceof Error ? e : String(e) }));
  }
  return { assignmentIds: byPart.map((b) => b.assignmentId), students: new Set(byPart.flatMap((b) => b.studentIds)), byPart };
}

/**
 * The lesson invites of a plan, batched (the same rows as lessons/run.ts inviteToLesson: an open run is never
 * started twice; one notification per new run): hasLessons (2 reads), the open runs (1 read), 2 createMany.
 */
async function inviteLessonsBatch(repo: Repo, schoolId: string, parts: { skillId: string; who: string[] }[], userOf: Map<string, string>, now: Date): Promise<number> {
  const has = await hasLessons(repo, parts.map((p) => p.skillId));
  const want = parts.filter((p) => has.get(p.skillId));
  if (!want.length) return 0;
  const studentIds = [...new Set(want.flatMap((p) => p.who))];
  const skillIds = [...new Set(want.map((p) => p.skillId))];
  const [open, names] = await Promise.all([
    repo.findMany("LessonRun", { studentId: { in: studentIds }, skillId: { in: skillIds } }, { select: ["studentId", "skillId", "phase"] }),
    repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] }),
  ]);
  const busy = new Set(open.filter((r) => s(r.phase) !== "DONE").map((r) => `${s(r.studentId)}|${s(r.skillId)}`));
  const nameOf = new Map(names.map((k) => [s(k.id), s(k.name)]));
  const runs: Row[] = [], notes: Row[] = [];
  for (const p of want) for (const sid of p.who) {
    const key = `${sid}|${p.skillId}`;
    if (busy.has(key)) continue;
    busy.add(key);
    runs.push({ id: newRowId(), studentId: sid, schoolId, skillId: p.skillId, source: "ASSIGNMENT", phase: "MODEL", attempts: 0, approach: 0, log: [], startedAt: now, updatedAt: now });
    if (userOf.has(sid)) notes.push({ userId: userOf.get(sid), type: "NEW_ASSIGNMENT", title: `🧩 A lesson for you: ${nameOf.get(p.skillId) ?? ""}`, body: "A short lesson with examples, hints and a quick check. Open it when you are ready.", link: `/student/lesson?skillId=${encodeURIComponent(p.skillId)}`, readAt: null, createdAt: now });
  }
  if (!runs.length) return 0;
  await repo.transaction(async (tx) => {
    for (let i = 0; i < runs.length; i += CHUNK) await tx.createMany("LessonRun", runs.slice(i, i + CHUNK));
    for (let i = 0; i < notes.length; i += CHUNK) await tx.createMany("Notification", notes.slice(i, i + CHUNK));
  });
  return runs.length;
}

// ------------------------------------------------------------------ Send twice = once

/** The (student, skill) pairs of a plan, as a stable key. */
export const pairsKey = (pairs: Iterable<[string, string]>) => [...new Set([...pairs].map(([a, b]) => `${a}|${b}`))].sort().join(",");

/**
 * A plan the same teacher sent to the same class with the same title and kind in the last two minutes whose work is
 * exactly these (student, skill) pairs — a second press of Send (or a reload that sent the form again). One read when
 * there is none (the usual case).
 */
export async function recentTwin(repo: Repo, actor: Actor, q: { classId: string; title: string; kind: string; pairs: string }, now = new Date()): Promise<{ planId: string; assignmentIds: string[]; students: number; skills: number } | null> {
  const rows = (await repo.findMany("SkillPlan", { classId: q.classId, createdById: actor.userId, title: q.title, kind: q.kind }, { select: ["id", "status", "createdAt"] }))
    .filter((p) => s(p.status ?? "SENT") === "SENT" && Math.abs(now.getTime() - (d(p.createdAt)?.getTime() ?? 0)) < 120_000);
  if (!rows.length) return null;
  const items = await repo.findMany("SkillPlanItem", { planId: { in: rows.map((p) => p.id) } }, { select: ["planId", "assignmentIds"] });
  const aids = items.flatMap((i) => (Array.isArray(i.assignmentIds) ? i.assignmentIds : JSON.parse(s(i.assignmentIds) || "[]")).map(s));
  if (!aids.length) return null;
  const [as, links] = await Promise.all([
    repo.findMany("Assignment", { id: { in: aids }, deletedAt: null }, { select: ["id", "skillId"] }),
    repo.findMany("AssignmentStudent", { assignmentId: { in: aids } }, { select: ["assignmentId", "studentId"] }),
  ]);
  const skillOf = new Map(as.map((a) => [s(a.id), s(a.skillId)]));
  for (const p of rows) {
    const mine = new Set(items.filter((i) => s(i.planId) === s(p.id)).flatMap((i) => (Array.isArray(i.assignmentIds) ? i.assignmentIds : JSON.parse(s(i.assignmentIds) || "[]")).map(s)));
    const pl = links.filter((l) => mine.has(s(l.assignmentId)) && skillOf.has(s(l.assignmentId)));
    if (pairsKey(pl.map((l) => [s(l.studentId), skillOf.get(s(l.assignmentId))!] as [string, string])) === q.pairs)
      return { planId: s(p.id), assignmentIds: [...mine].filter((a) => skillOf.has(a)), students: new Set(pl.map((l) => s(l.studentId))).size, skills: [...mine].filter((a) => skillOf.has(a)).length };
  }
  return null;
}

/** One send at a time per teacher and class in this server (a double press waits, then finds the first plan). */
export const sendLock = <T>(actor: Actor, classId: string, fn: () => Promise<T>) => withLock(`plan-send:${actor.userId}:${classId}`, fn);
