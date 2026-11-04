/**
 * 🔍 "Why can't a student see their work?" (owner, 3 Nov 2026: "for ONE teacher the students see nothing in My Work
 * although the teacher's Assigned page shows the work Open"). One student at a time:
 *
 *   1. every assigned thing of every class the student is in — read by the SAME collect the Assigned page uses
 *      (assignedRawOfClasses, teacher/assigned.ts: every kind, every teacher, cancelled ones included), plus the
 *      ReadRise articles / NAFS tests whose library row was deleted (the Assigned page drops those silently);
 *   2. the student's real My Work — allWorkItems (student/all-work.ts) run AS the student (previewStudentFor, the
 *      same "view as student" actor the preview pages use);
 *   3. for each thing ONE reason: ✅ shown (and in which section) — or why not.
 *
 * "Link now" / "Link all missing for this class" create the missing AssignmentStudent rows (NOT_STARTED) of single
 * skill / question-set Assignment rows only (never a test's set, never a plan's place), never for a student the
 * teacher removed (an AssignmentCancel for that student) — audit-logged. Reads are bounded (one student, their
 * classes); nothing else is written.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { safeIfBehind } from "../db/schema-errors";
import { accessibleClasses } from "../teacher/assign";
import { ASSIGNED_KIND_LABEL, assignedRawOfClasses, type AssignedKind, type AssignedRaw } from "../teacher/assigned";
import { allWorkItems } from "../student/all-work";
import { previewStudentFor } from "../student/preview-as";
import { skillOfAssignment } from "../practice/completion";
import { TEST_MARK } from "../tests/runtime";
import { SECTION_LABEL, sectionOf } from "../../lib/my-work-groups";
import { WORK_TAB_LABEL } from "../../lib/work-tab";
import type { MyWorkItem } from "../plans/wizard";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const iso = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : (v instanceof Date ? v : new Date(s(v))).toISOString());
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const CHUNK = 400;
async function inChunks<T>(ids: string[], f: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  const u = [...new Set(ids)];
  for (let i = 0; i < u.length; i += CHUNK) out.push(...(await f(u.slice(i, i + CHUNK))));
  return out;
}
/** Kinds whose missing link "Link now" may create: one plain Assignment row each. */
const LINKABLE: ReadonlySet<AssignedKind> = new Set<AssignedKind>(["SKILL", "PROGRESS_CHECK"]);
/** at most this many links in one press */
export const LINK_MAX = 5000;

export type VisReason = "SHOWN" | "CHOSEN_ONLY" | "CANCELLED_ALL" | "REMOVED" | "STARTS_LATER" | "PLAN_PLACE" | "DELETED" | "DIAGNOSTIC" | "NOT_LINKED" | "LEARN_PAGE" | "CLOSED" | "OTHER";
export const VIS_ICON: Record<VisReason, string> = {
  SHOWN: "✅", CHOSEN_ONLY: "🚫", CANCELLED_ALL: "❌", REMOVED: "❌", STARTS_LATER: "📅", PLAN_PLACE: "📋", DELETED: "🗑", DIAGNOSTIC: "🩺",
  NOT_LINKED: "⚠️", LEARN_PAGE: "📘", CLOSED: "🔒", OTHER: "❓",
};

export interface VisRow {
  kind: AssignedKind; kindLabel: string; id: string; title: string; classNames: string[]; teacher: string | null;
  createdAt: string | null; startAt: string | null; dueAt: string | null;
  reason: VisReason; icon: string;
  /** the one clear sentence shown on the page */
  text: string;
  /** ✅ rows: the My Work section (This week / Needs Catch-up / Extra Practice / Done) */
  section: string | null;
  /** ⚠️ rows that "Link now" can fix (a single skill / question-set Assignment row) */
  linkable: boolean; classId: string | null;
  /** the raw facts (ids, dates, cancel rows) — so the owner can report an unexplained row */
  facts: [string, string][];
}
export interface VisClass { id: string; name: string; joinedAt: string | null; teacherNames: string[]; missing: number }
export interface VisView {
  student: { id: string; name: string; number: string };
  classes: VisClass[];
  rows: VisRow[];
  /** how many rows the student's My Work has (everything, not only these classes) */
  myWork: number;
}

interface Pair { assignmentId: string; studentId: string }

/** The classes of the student this viewer may check (admin: all of them; teacher: the ones they teach). */
async function classesInReach(repo: Repo, actor: Actor, studentId: string): Promise<{ members: Row[]; classes: Row[] }> {
  const members = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId", "joinedAt"], take: 50 });
  const reach = new Map((await accessibleClasses(repo, actor)).map((c) => [s(c.id), c]));
  const classes = members.map((m) => reach.get(s(m.classId))).filter((c): c is Row => Boolean(c));
  return { members: members.filter((m) => reach.has(s(m.classId))), classes };
}

/** Active cancels of these refs, with who / when (the Assigned page's cancel rows, read for display). */
async function cancelsOf(repo: Repo, schoolId: string, refIds: string[]): Promise<Row[]> {
  if (!refIds.length) return [];
  return safeIfBehind("work-visibility.cancels", () => inChunks(refIds, (part) => repo.findMany("AssignmentCancel", { schoolId, restoredAt: null, refId: { in: part } }, { select: ["id", "kind", "refId", "classId", "studentId", "cancelledById", "cancelledAt"] })), [] as Row[]);
}

/**
 * Pure: the links "Link all missing for this class" creates — single skill / question-set rows (no plan place, no test
 * set, not deleted, not cancelled for everyone) × students who joined the class AFTER the assignment was created and
 * have no link, never one the teacher removed (an active per-student cancel).
 */
export function missingLinks(raw: readonly AssignedRaw[], assignments: ReadonlyMap<string, Row>, members: readonly Row[], cancels: readonly Row[]): Pair[] {
  const out: Pair[] = [];
  const cancelledAll = new Set(cancels.filter((c) => !c.studentId).map((c) => `${s(c.kind)}|${s(c.refId)}`));
  for (const r of raw) {
    if (!LINKABLE.has(r.kind) || cancelledAll.has(`${r.kind}|${r.id}`)) continue;
    const a = assignments.get(r.id);
    if (!a || a.deletedAt || a.testId || a.curriculumPlanId) continue;
    const w = sentTo(r, s(a.classId), iso(a.createdAt), members, cancels);
    // only work sent to the WHOLE class: a chosen-students send never gains a newcomer
    if (!w.wholeClass) continue;
    for (const sid of w.joinedAfter) if (!r.students.has(sid) && !w.removed.has(sid)) out.push({ assignmentId: r.id, studentId: sid });
  }
  return out;
}

/**
 * Who was in the class when the work was sent: `wholeClass` = at least one current member was already there and every
 * one of them got it (or was removed later by the teacher) — so a student who joined AFTER simply missed it.
 * `joinedAfter` = current members who joined after it was created. Pure.
 */
export function sentTo(r: AssignedRaw, classId: string, createdAt: string | null, members: readonly Row[], cancels: readonly Row[]): { wholeClass: boolean; joinedAfter: Set<string>; removed: Set<string> } {
  const removed = new Set(cancels.filter((c) => c.studentId && s(c.kind) === r.kind && s(c.refId) === r.id).map((c) => s(c.studentId)));
  const created = Date.parse(createdAt ?? "");
  const before: string[] = [], after = new Set<string>();
  if (!Number.isFinite(created)) return { wholeClass: false, joinedAfter: after, removed };
  for (const m of members) {
    if (s(m.classId) !== classId || m.leftAt) continue;
    const joined = Date.parse(iso(m.joinedAt) ?? "");
    if (Number.isFinite(joined) && joined > created) after.add(s(m.studentId)); else before.push(s(m.studentId));
  }
  return { wholeClass: before.length > 0 && before.every((x) => r.students.has(x) || removed.has(x)), joinedAfter: after, removed };
}

/** The Assignment rows behind the skill / question-set / progress-check items (plan place, test set, skill, set). */
async function assignmentRows(repo: Repo, ids: string[]): Promise<Map<string, Row>> {
  if (!ids.length) return new Map();
  const rows = await inChunks(ids, (part) => repo.findMany("Assignment", { id: { in: part } }, { select: ["id", "classId", "skillId", "skillIds", "assessmentId", "curriculumPlanId", "testId", "createdAt", "deletedAt"] }));
  return new Map(rows.map((a) => [s(a.id), a]));
}

/** 🗑 Assigned things whose library row is gone (the Assigned page drops them, so does My Work). */
async function deletedFromLibrary(repo: Repo, classIds: string[], have: Set<string>): Promise<{ kind: AssignedKind; id: string; title: string; classId: string; createdById: string; createdAt: string | null; startAt: string | null; dueAt: string | null; detail: string }[]> {
  const out: Awaited<ReturnType<typeof deletedFromLibrary>> = [];
  const rr = await safeIfBehind("work-visibility.rr", () => repo.findMany("RRClassArticle", { classId: { in: classIds } }, { select: ["id", "classId", "articleId", "assignedById", "createdAt", "startAt", "dueAt"], take: 2000 }), [] as Row[]);
  const rrLeft = rr.filter((g) => !have.has(`READRISE:${s(g.id)}`));
  if (rrLeft.length) {
    const arts = new Map((await inChunks(rrLeft.map((g) => s(g.articleId)), (part) => repo.findMany("RRArticle", { id: { in: part } }, { select: ["id", "title", "deletedAt"] }))).map((a) => [s(a.id), a]));
    for (const g of rrLeft) {
      const a = arts.get(s(g.articleId));
      if (a && !a.deletedAt) continue;
      out.push({ kind: "READRISE", id: s(g.id), title: s(a?.title) || "(article no longer exists)", classId: s(g.classId), createdById: s(g.assignedById), createdAt: iso(g.createdAt), startAt: iso(g.startAt), dueAt: iso(g.dueAt), detail: `article ${s(g.articleId)} ${a ? `deleted ${day(iso(a.deletedAt))}` : "missing"}` });
    }
  }
  const nt = await safeIfBehind("work-visibility.nafs", () => repo.findMany("NafsTestClass", { classId: { in: classIds } }, { select: ["id", "classId", "testId", "createdById", "createdAt", "openAt", "dueAt"], take: 500 }), [] as Row[]);
  const ntLeft = nt.filter((g) => !have.has(`NAFS_TEST:${s(g.id)}`));
  if (ntLeft.length) {
    const tests = new Map((await inChunks(ntLeft.map((g) => s(g.testId)), (part) => repo.findMany("NafsTest", { id: { in: part } }, { select: ["id", "title", "deletedAt"] }))).map((t) => [s(t.id), t]));
    for (const g of ntLeft) {
      const t = tests.get(s(g.testId));
      if (t && !t.deletedAt) continue;
      out.push({ kind: "NAFS_TEST", id: s(g.id), title: s(t?.title) || "(test no longer exists)", classId: s(g.classId), createdById: s(g.createdById), createdAt: iso(g.createdAt), startAt: iso(g.openAt), dueAt: iso(g.dueAt), detail: `NAFS test ${s(g.testId)} ${t ? `deleted ${day(iso(t.deletedAt))}` : "missing"}` });
    }
  }
  return out;
}

/** The section of My Work a shown row sits in. */
function sectionLabel(row: MyWorkItem, now: Date): string {
  if (row.tab) return WORK_TAB_LABEL[row.tab];
  return SECTION_LABEL[sectionOf(row, now)];
}

/**
 * The check for one student: every assigned thing of their classes and, for each, what their My Work does with it.
 * Admin: any student of the school; teacher: students of their own classes (only those classes are listed).
 */
export async function workVisibility(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<VisView> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Only teachers and admins can use this check.");
  assertCan(actor, "assignments:read");
  const schoolId = s(actor.schoolId);
  // the student as an actor (same school; a teacher: one of their own classes) — the "view as student" actor
  const as = await previewStudentFor(repo, actor, s(studentId));
  const sid = as.studentId;
  const [{ members, classes }, st] = await Promise.all([classesInReach(repo, actor, sid), repo.findUnique("Student", { id: sid })]);
  const classIds = classes.map((c) => s(c.id));
  const classSet = new Set(classIds);
  const className = new Map(classes.map((c) => [s(c.id), s(c.name)]));
  const joinedAt = new Map(members.map((m) => [s(m.classId), iso(m.joinedAt)]));

  const [rawAll, work] = await Promise.all([
    assignedRawOfClasses(repo, schoolId, classIds),
    allWorkItems(repo, as.actor, now),
  ]);
  // what concerns this student: their classes' work (a whole-grade MAP Test reaching them; their own short lessons)
  const raw = rawAll.filter((r) => (r.kind === "LESSON" ? r.students.has(sid) : r.students.has(sid) || r.classIds.some((c) => classSet.has(c))));
  const have = new Set(raw.map((r) => `${r.kind}:${r.id}`));
  const gone = classIds.length ? await deletedFromLibrary(repo, classIds, have) : [];
  const assignIds = raw.filter((r) => r.kind === "SKILL" || r.kind === "PROGRESS_CHECK").map((r) => r.id);
  const [assignments, cancels, classMembers] = await Promise.all([
    assignmentRows(repo, assignIds),
    cancelsOf(repo, schoolId, [...raw.map((r) => r.id), ...gone.map((g) => g.id)]),
    classIds.length ? repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId", "joinedAt", "leftAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const assessmentIds = [...new Set([...assignments.values()].map((a) => s(a.assessmentId)).filter(Boolean))];
  const diagnostic = new Set(assessmentIds.length ? (await safeIfBehind("work-visibility.diag", () => repo.findMany("DiagnosticTest", { assessmentId: { in: assessmentIds } }, { select: ["assessmentId"] }), [] as Row[])).map((d) => s(d.assessmentId)) : []);
  // names: the teachers who assigned (User or Teacher id) and who cancelled (User id)
  const teacherRows = await repo.findMany("Teacher", { schoolId }, { select: ["id", "userId"] });
  const userIds = [...new Set([...teacherRows.map((t) => s(t.userId)), ...cancels.map((c) => s(c.cancelledById))].filter(Boolean))];
  const users = new Map((userIds.length ? await inChunks(userIds, (part) => repo.findMany("User", { id: { in: part } }, { select: ["id", "displayName"] })) : []).map((u) => [s(u.id), s(u.displayName)]));
  const nameOf = (id: string): string | null => {
    if (!id) return null;
    if (users.has(id)) return users.get(id) || "Teacher";
    const t = teacherRows.find((x) => s(x.id) === id);
    return t ? users.get(s(t.userId)) || "Teacher" : null;
  };
  const workByKey = new Map(work.map((w) => [w.assignmentId, w]));
  const workBySkill = new Map(work.filter((w) => w.skillId).map((w) => [s(w.skillId), w]));

  const rows: VisRow[] = [];
  for (const r of raw) {
    const mine = cancels.filter((c) => s(c.kind) === r.kind && s(c.refId) === r.id);
    const all = mine.find((c) => !c.studentId);
    const removed = mine.find((c) => s(c.studentId) === sid);
    const a = assignments.get(r.id);
    const cid = r.classIds.find((c) => classSet.has(c)) ?? null;
    const facts: [string, string][] = [["kind", r.kind], ["id", r.id], ["class ids", r.classIds.join(", ") || "—"], ["created", r.createdAt ?? "—"], ["startAt", r.startAt ?? "—"], ["dueAt", r.dueAt ?? "—"],
      ["linked to this student", r.students.has(sid) ? "yes" : "no"], ["students linked", String(r.students.size)], ["My Work keys", r.keys.slice(0, 6).join(", ") || "—"],
      ["cancel rows", mine.map((c) => `${s(c.id)} (${c.studentId ? `student ${s(c.studentId)}` : "everyone"}, ${day(iso(c.cancelledAt))})`).join("; ") || "none"]];
    if (a) facts.push(["assignment", `skill ${skillOfAssignment(a) ?? "—"} · assessment ${s(a.assessmentId) || "—"} · plan ${s(a.curriculumPlanId) || "—"} · test ${s(a.testId) || "—"}`]);
    if (cid) facts.push(["student joined class", joinedAt.get(cid) ?? "—"]);
    const base = { kind: r.kind, kindLabel: ASSIGNED_KIND_LABEL[r.kind], id: r.id, title: r.title || ASSIGNED_KIND_LABEL[r.kind], classNames: r.classIds.map((c) => className.get(c) ?? "").filter(Boolean),
      teacher: nameOf(r.createdById), createdAt: r.createdAt, startAt: r.startAt ?? null, dueAt: r.dueAt, section: null, linkable: false, classId: cid, facts };
    const put = (reason: VisReason, text: string, extra: Partial<VisRow> = {}) => rows.push({ ...base, reason, icon: VIS_ICON[reason], text, ...extra });

    // ✅ in My Work? (its own key; a plan: its plan row; a skill: also merged with another assignment of the same skill)
    const keys = r.kind === "PLAN" ? [`plan:${r.id}`] : r.keys;
    let shown = keys.map((k) => workByKey.get(k)).find(Boolean);
    let merged = false;
    if (!shown && a && LINKABLE.has(r.kind) && r.students.has(sid) && !all && !removed) {
      const sk = skillOfAssignment(a);
      const w = sk ? workBySkill.get(sk) : undefined;
      if (w) { shown = w; merged = true; }
    }
    if (shown) {
      const sec = sectionLabel(shown, now);
      put("SHOWN", `Shown in My Work — ${sec}${merged ? " (as one row with another assignment of the same skill)" : ""}.${all || removed ? " Note: a cancel row exists for it — please report this." : ""}`, { section: sec });
      continue;
    }
    if (all) { put("CANCELLED_ALL", `Cancelled for everyone on ${day(iso(all.cancelledAt))} by ${nameOf(s(all.cancelledById)) ?? "someone"}.`); continue; }
    if (removed) { put("REMOVED", `Removed for this student on ${day(iso(removed.cancelledAt))} by ${nameOf(s(removed.cancelledById)) ?? "someone"}.`); continue; }
    if (!r.students.has(sid)) {
      const joined = cid ? joinedAt.get(cid) ?? null : null;
      const w = cid ? sentTo(r, cid, r.createdAt, classMembers, cancels) : null;
      const joinedAfter = Boolean(w?.joinedAfter.has(sid));
      const linkable = Boolean(a && cid && LINKABLE.has(r.kind) && !a.deletedAt && !a.testId && !a.curriculumPlanId);
      if ((joinedAfter && (w?.wholeClass || r.scope === "class")) || r.students.size === 0) {
        put("NOT_LINKED", `Not linked to this student — the class has it, but there is no student row for them${joinedAfter ? ` (they joined the class on ${day(joined)}, after it was sent on ${day(r.createdAt)})` : " (it is linked to no student at all)"}.${linkable ? "" : " Link now is only for single skills and question sets."}`, { linkable });
      } else if (r.scope === "students") {
        put("CHOSEN_ONLY", `Sent to chosen students only — this student is not one of them (${r.students.size} student${r.students.size === 1 ? "" : "s"}).`);
      } else {
        put("NOT_LINKED", "Not linked to this student — the class has it, but they are not among its students.", { linkable });
      }
      continue;
    }
    if (r.startAt && Date.parse(r.startAt) > now.getTime()) { put("STARTS_LATER", `Starts on ${day(r.startAt)} (not open yet).`); continue; }
    if (a && a.curriculumPlanId && s(a.curriculumPlanId) !== TEST_MARK) { put("PLAN_PLACE", "Part of a curriculum plan — it is in My Plans, not My Work."); continue; }
    if (r.kind === "PLAN") { put("PLAN_PLACE", "A plan — it is in My Plans, not My Work."); continue; }
    if (a && a.assessmentId && diagnostic.has(s(a.assessmentId))) { put("DIAGNOSTIC", "Diagnostic — shown only while the admin has the Diagnostic window open for this grade (and not finished this year)."); continue; }
    if (r.kind === "LEARN" || r.kind === "WORDS") { put("LEARN_PAGE", "Learn lessons and words are never listed in My Work (owner decision) — the student finds them on the Learn page."); continue; }
    if (r.kind === "EXIT_TICKET" && r.detail) { put("CLOSED", `The exit ticket is ${r.detail.toLowerCase()} — only open exit tickets are in My Work.`); continue; }
    if (r.kind === "MAP_TEST" && r.dueAt && Date.parse(r.dueAt) < now.getTime()) { put("CLOSED", `The MAP Test closed on ${day(r.dueAt)} and this student did not finish it.`); continue; }
    put("OTHER", "Not shown for another reason — please report the facts below.");
  }
  for (const g of gone) {
    const mine = cancels.filter((c) => s(c.kind) === g.kind && s(c.refId) === g.id);
    rows.push({
      kind: g.kind, kindLabel: ASSIGNED_KIND_LABEL[g.kind], id: g.id, title: g.title, classNames: [className.get(g.classId) ?? ""].filter(Boolean), teacher: nameOf(g.createdById),
      createdAt: g.createdAt, startAt: g.startAt, dueAt: g.dueAt, reason: "DELETED", icon: VIS_ICON.DELETED,
      text: g.kind === "READRISE" ? "The article was deleted from the library." : "The test was deleted.", section: null, linkable: false, classId: g.classId,
      facts: [["kind", g.kind], ["id", g.id], ["detail", g.detail], ["cancel rows", mine.map((c) => s(c.id)).join(", ") || "none"]],
    });
  }
  const order = (r: VisRow) => (r.reason === "SHOWN" ? 1 : 0);
  rows.sort((x, y) => order(x) - order(y) || (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));

  // per class: how many links "Link all missing for this class" would create, and who teaches it
  const teachersOf = await safeIfBehind("work-visibility.teachers", () => repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId"] }), [] as Row[]).catch(() => [] as Row[]);
  const missing = missingLinks(raw, assignments, classMembers, cancels);
  const vclasses: VisClass[] = classes.map((c) => ({
    id: s(c.id), name: s(c.name), joinedAt: joinedAt.get(s(c.id)) ?? null,
    teacherNames: [...new Set(teachersOf.filter((x) => s(x.classId) === s(c.id)).map((x) => nameOf(s(x.teacherId))).filter((n): n is string => Boolean(n)))],
    missing: missing.filter((p) => s(assignments.get(p.assignmentId)?.classId) === s(c.id)).length,
  }));
  return { student: { id: sid, name: as.name, number: s(st?.studentNumber) }, classes: vclasses, rows, myWork: work.length };
}

// ------------------------------------------------------------------ the fixes (audit-logged)

/** A class the viewer may change (teacher: one they teach; admin: the school's). */
async function classForWrite(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Only teachers and admins can link work.");
  assertCan(actor, "assignments:create");
  const c = (await accessibleClasses(repo, actor)).find((k) => s(k.id) === s(classId));
  if (!c) throw new ForbiddenError("Not found, or not in your classes.");
  return c;
}

/**
 * ⚠️ → ✅ "Link now": the one missing AssignmentStudent row (NOT_STARTED) of a single skill / question-set Assignment
 * for a current member of its class. Refused for a test's set, a plan's place, a deleted or cancelled assignment, and a
 * student the teacher removed from it.
 */
export async function linkStudentNow(repo: Repo, actor: Actor, assignmentId: string, studentId: string, now = new Date()): Promise<number> {
  const a = await repo.findUnique("Assignment", { id: s(assignmentId) });
  if (!a) throw new ValidationError("This assignment no longer exists.");
  await classForWrite(repo, actor, s(a.classId));
  if (a.deletedAt) throw new ValidationError("This assignment was deleted.");
  if (a.testId || a.curriculumPlanId) throw new ValidationError("Only single skills and question sets can be linked here (not a test or a plan's place).");
  const sid = s(studentId);
  const member = (await repo.findMany("ClassMembership", { classId: s(a.classId), studentId: sid, leftAt: null }, { select: ["studentId"], take: 1 }))[0];
  if (!member) throw new ValidationError("The student is not in this class.");
  if ((await repo.findMany("AssignmentStudent", { assignmentId: s(a.id), studentId: sid }, { select: ["studentId"], take: 1 })).length) return 0;
  const cancels = await cancelsOf(repo, s(actor.schoolId), [s(a.id)]);
  if (cancels.some((c) => !c.studentId)) throw new ValidationError("This assignment is cancelled for everyone. Undo the cancel on the Assigned page first.");
  if (cancels.some((c) => s(c.studentId) === sid)) throw new ValidationError("The teacher removed this student from it. Undo that on the Assigned page instead.");
  await repo.create("AssignmentStudent", { assignmentId: s(a.id), studentId: sid, status: "NOT_STARTED", progress: 0 });
  await audit(repo, { actorId: actor.userId, action: "assignment.link_student", entityType: "Assignment", entityId: s(a.id), after: { studentId: sid, classId: s(a.classId) }, at: now }).catch(() => undefined);
  return 1;
}

/**
 * "Link all missing for this class": every link missingLinks finds (students who joined after the assignment was
 * created; never one left out on purpose or removed by the teacher), NOT_STARTED, at most LINK_MAX in one press.
 */
export async function linkMissingForClass(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<number> {
  const c = await classForWrite(repo, actor, classId);
  const schoolId = s(actor.schoolId);
  const raw = await assignedRawOfClasses(repo, schoolId, [s(c.id)], { kinds: ["SKILL", "PROGRESS_CHECK"] });
  const [assignments, members, cancels] = await Promise.all([
    assignmentRows(repo, raw.map((r) => r.id)),
    repo.findMany("ClassMembership", { classId: s(c.id), leftAt: null }, { select: ["classId", "studentId", "joinedAt", "leftAt"] }),
    cancelsOf(repo, schoolId, raw.map((r) => r.id)),
  ]);
  const pairs = missingLinks(raw, assignments, members, cancels).slice(0, LINK_MAX);
  if (!pairs.length) return 0;
  for (let i = 0; i < pairs.length; i += 500) await repo.createMany("AssignmentStudent", pairs.slice(i, i + 500).map((p) => ({ ...p, status: "NOT_STARTED", progress: 0 })));
  await audit(repo, { actorId: actor.userId, action: "assignment.link_missing", entityType: "Class", entityId: s(c.id), after: { count: pairs.length, pairs: pairs.slice(0, 50) }, at: now }).catch(() => undefined);
  return pairs.length;
}
