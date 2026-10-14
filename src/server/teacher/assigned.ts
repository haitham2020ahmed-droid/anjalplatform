/**
 * 📌 "Assigned" (owner request r67 § 3): ONE place to see and cancel everything a teacher assigned —
 *
 *   SKILL           skills and sets of questions (Assignment), curriculum sets included
 *   PROGRESS_CHECK  progress checks (ProgressCheck → its Assignment)
 *   TEST            Assessments tests of every type, Review included (TeacherTest → its sets)
 *   MAP_TEST        MAP Tests (MapSimWindow)
 *   NAFS_TEST       NAFS tests given online (NafsTestClass)      NAFS_PRACTICE  NAFS practice (NafsPractice)
 *   LEARN / WORDS   Learn lessons and curriculum words (LearnAssign → LearnAssignee)
 *   READRISE        ReadRise articles (RRClassArticle)
 *   WRITING         writing tasks (WritingTask WRITE)           FLUENCY        reading aloud (WritingTask READ_ALOUD)
 *   EXIT_TICKET     exit tickets                                RESPOND        Respond to Reading
 *   PLAN            plans sent to students (SkillPlan: its places are its Assignments, listed with the plan)
 *   LESSON          short lessons the teacher sent one student (LessonRun, source TEACHER)
 *
 * Each row: who it went to (class / chosen students), the due date, progress x / y and its status. Cancel = a SOFT
 * cancel (AssignmentCancel, for everyone or for one student): My Work, the home badge, the menu numbers and My Tests'
 * to-do list hide it at once (src/server/student/cancelled-work.ts) and NOTHING is deleted — answers and results stay;
 * Undo (restoreAssignment) brings it back. A teacher sees what they assigned (and may cancel what they assigned or
 * what is in a class they teach); the school admin sees every teacher's (filter by teacher).
 * Reads are bounded (the newest rows of each kind) and each kind goes through safeIfBehind (older database: no rows).
 */
import { statusesOfSkills, type StarStatus } from "../skills/status";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { safeIfBehind } from "../db/schema-errors";
import { accessibleClasses } from "./assign";
import { studentNames } from "../insights/student-data";
import { TEST_MARK } from "../tests/runtime";
import { activeCancels } from "../student/cancelled-work";

export const ASSIGNED_KINDS = ["SKILL", "PROGRESS_CHECK", "TEST", "MAP_TEST", "NAFS_TEST", "NAFS_PRACTICE", "LEARN", "WORDS", "READRISE", "WRITING", "FLUENCY", "EXIT_TICKET", "RESPOND", "PLAN", "LESSON"] as const;
export type AssignedKind = (typeof ASSIGNED_KINDS)[number];
/** The kind names (English source strings, translated on the page). */
export const ASSIGNED_KIND_LABEL: Record<AssignedKind, string> = {
  SKILL: "Skill or question set", PROGRESS_CHECK: "Progress check", TEST: "Test", MAP_TEST: "MAP Test", NAFS_TEST: "NAFS test",
  NAFS_PRACTICE: "NAFS practice", LEARN: "Learn lesson", WORDS: "Words", READRISE: "ReadRise article", WRITING: "Writing",
  FLUENCY: "Fluency (reading aloud)", EXIT_TICKET: "Exit ticket", RESPOND: "Respond to Reading", PLAN: "Plan", LESSON: "Short lesson",
};
export const isAssignedKind = (k: unknown): k is AssignedKind => (ASSIGNED_KINDS as readonly string[]).includes(String(k));

export type AssignedStatus = "SCHEDULED" | "OPEN" | "LATE" | "DONE" | "CANCELLED";
/** SCHEDULED: its start date is still ahead (students see it from that day) */
export const ASSIGNED_STATUS_LABEL: Record<AssignedStatus, string> = { SCHEDULED: "Scheduled", OPEN: "Open", LATE: "Late", DONE: "Done", CANCELLED: "Cancelled" };

export interface AssignedItem {
  kind: AssignedKind; id: string; title: string;
  /** a test's type (Weekly Quiz, Review …) or a plan's kind: a small tag */
  detail: string | null;
  classIds: string[]; classNames: string[];
  /** the teacher who assigned it (null: an automatic or older row) */
  teacher: { id: string; name: string } | null;
  /** "class" = the whole class; "students" = chosen students */
  scope: "class" | "students";
  /** students it reaches now (students removed one by one are not counted) and how many finished */
  recipients: number; done: number; removed: number;
  createdAt: string | null; dueAt: string | null;
  /** when the students see it (null: at once) — owner r68 §D start + end dates */
  startAt?: string | null;
  /** "Unit 1" when the title names a unit (the Assigned page's "Select unit" smart select) */
  unit?: string | null;
  status: AssignedStatus; cancelled: boolean;
}
export interface AssignedStudent { id: string; name: string; done: boolean; removed: boolean; /** ⭐ the student's ONE status of the assigned skill (skill work only) */ star?: StarStatus }

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const iso = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : (v instanceof Date ? v : new Date(s(v))).toISOString());
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
const idList = (v: unknown): string[] => { const a = json<unknown>(v, null); return Array.isArray(a) ? a.map(s).filter(Boolean) : []; };
const CHUNK = 400;
async function inChunks<T>(ids: string[], f: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  const u = [...new Set(ids)];
  for (let i = 0; i < u.length; i += CHUNK) out.push(...(await f(u.slice(i, i + CHUNK))));
  return out;
}
/** Newest rows of each kind read for the list. */
const TAKE = 200;

// ------------------------------------------------------------------ who may see / cancel

interface Scope {
  schoolId: string;
  admin: boolean;
  /** the classes in reach (teacher: own classes; admin: the school's) */
  classes: Row[];
  /** the teacher's own ids (createdById holds the User id, or the Teacher id for Assignment / Respond) */
  mine: string[];
}

async function scopeOf(repo: Repo, actor: Actor): Promise<Scope> {
  assertCan(actor, "assignments:read");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can see assigned work.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const admin = actor.role !== "TEACHER";
  const [classes, t] = await Promise.all([accessibleClasses(repo, actor), admin ? Promise.resolve(null) : repo.findUnique("Teacher", { userId: actor.userId })]);
  return { schoolId: actor.schoolId, admin, classes, mine: [actor.userId, ...(t ? [s(t.id)] : [])] };
}

// ------------------------------------------------------------------ reading every kind

/** One assigned thing before the cancels are applied: its students (done or not) and the My Work keys it shows as. */
interface Raw {
  kind: AssignedKind; id: string; title: string; detail: string | null; classIds: string[]; createdById: string;
  scope: "class" | "students"; createdAt: string | null; dueAt: string | null; startAt?: string | null;
  students: Map<string, boolean>; keys: string[];
}
interface ReadOpts { kinds: Set<AssignedKind>; only?: string; creators: string[] | null }

async function collect(repo: Repo, sc: Scope, o: ReadOpts): Promise<Raw[]> {
  const classIds = sc.classes.map((c) => s(c.id));
  if (!classIds.length) return [];
  const want = (k: AssignedKind) => o.kinds.has(k);
  const by = (field = "createdById", extra: string[] = []): Record<string, unknown> => (o.creators ? { [field]: { in: [...o.creators, ...extra] } } : {});
  const one = (): Record<string, unknown> => (o.only ? { id: o.only } : {});
  const newest = { orderBy: [{ field: "createdAt", dir: "desc" as const }], take: o.only ? 1 : TAKE };
  const members = await (classIds.length ? inChunks(classIds, (part) => repo.findMany("ClassMembership", { classId: { in: part }, leftAt: null }, { select: ["classId", "studentId"] })) : Promise.resolve([] as Row[]));
  const ofClass = new Map<string, string[]>();
  for (const m of members) ofClass.set(s(m.classId), [...(ofClass.get(s(m.classId)) ?? []), s(m.studentId)]);
  const inReach = new Set(members.map((m) => s(m.studentId)));
  const mapOf = (ids: string[], done: (sid: string) => boolean) => new Map(ids.map((id) => [id, done(id)] as const));
  const out: Raw[] = [];
  const none = [] as Raw[];

  // 1. Assignment-based: skills / question sets, progress checks, tests (their sets), plans (their places)
  const assignmentKinds = async (): Promise<Raw[]> => {
    if (!want("SKILL") && !want("PROGRESS_CHECK") && !want("TEST") && !want("PLAN")) return [];
    const onlyKind = o.only ? [...o.kinds][0] : null;
    const [plain, tests, plans] = await Promise.all([
      want("SKILL") || want("PROGRESS_CHECK") ? repo.findMany("Assignment", { classId: { in: classIds }, deletedAt: null, ...by(), ...one() }, { select: ["id", "classId", "createdById", "title", "testId", "curriculumPlanId", "createdAt", "dueAt", "startAt"], ...newest, take: o.only ? 1 : TAKE * 2 }) : Promise.resolve([] as Row[]),
      want("TEST") ? safeIfBehind("assigned.tests", () => repo.findMany("TeacherTest", { classId: { in: classIds }, deletedAt: null, ...by("createdById", []), ...one() }, { select: ["id", "classId", "createdById", "title", "testType", "createdAt", "dueAt", "openAt"], ...newest }), [] as Row[]) : Promise.resolve([] as Row[]),
      want("PLAN") ? safeIfBehind("assigned.plans", () => repo.findMany("SkillPlan", { classId: { in: classIds }, ...by(), ...one() }, { select: ["id", "classId", "createdById", "title", "kind", "status", "createdAt", "dueAt", "startAt", "studentIds"], ...newest }), [] as Row[]) : Promise.resolve([] as Row[]),
    ]);
    const sentPlans = plans.filter((p) => !p.status || s(p.status) === "SENT");
    const [sets, items, checks] = await Promise.all([
      tests.length ? repo.findMany("Assignment", { testId: { in: tests.map((t) => s(t.id)) }, deletedAt: null }, { select: ["id", "testId", "startAt", "dueAt"] }) : Promise.resolve([] as Row[]),
      sentPlans.length ? repo.findMany("SkillPlanItem", { planId: { in: sentPlans.map((p) => s(p.id)) } }, { select: ["planId", "assignmentIds"] }) : Promise.resolve([] as Row[]),
      plain.length ? safeIfBehind("assigned.checks", () => repo.findMany("ProgressCheck", { assignmentId: { in: plain.map((a) => s(a.id)) } }, { select: ["assignmentId"] }), [] as Row[]) : Promise.resolve([] as Row[]),
    ]);
    const placesOf = new Map<string, string[][]>();
    for (const i of items) placesOf.set(s(i.planId), [...(placesOf.get(s(i.planId)) ?? []), idList(i.assignmentIds)]);
    const inPlan = new Set([...placesOf.values()].flat(2));
    const checkIds = new Set(checks.map((c) => s(c.assignmentId)));
    // single rows: not a test set, not a place of a listed plan
    const single = plain.filter((a) => !a.testId && s(a.curriculumPlanId) !== TEST_MARK && (onlyKind ? true : !inPlan.has(s(a.id))))
      .filter((a) => (checkIds.has(s(a.id)) ? want("PROGRESS_CHECK") : want("SKILL")));
    const aids = [...single.map((a) => s(a.id)), ...sets.map((a) => s(a.id)), ...inPlan];
    const rows = aids.length ? await inChunks(aids, (part) => repo.findMany("AssignmentStudent", { assignmentId: { in: part } }, { select: ["assignmentId", "studentId", "status"] })) : [];
    const byA = new Map<string, Row[]>();
    for (const r of rows) byA.set(s(r.assignmentId), [...(byA.get(s(r.assignmentId)) ?? []), r]);
    const res: Raw[] = [];
    for (const a of single) {
      const st = byA.get(s(a.id)) ?? [];
      const kind: AssignedKind = checkIds.has(s(a.id)) ? "PROGRESS_CHECK" : "SKILL";
      const cls = ofClass.get(s(a.classId)) ?? [];
      res.push({ kind, id: s(a.id), title: s(a.title), detail: null, classIds: [s(a.classId)], createdById: s(a.createdById), scope: st.length < cls.length ? "students" : "class",
        createdAt: iso(a.createdAt), dueAt: iso(a.dueAt), startAt: iso(a.startAt), students: new Map(st.map((r) => [s(r.studentId), s(r.status) === "COMPLETED"] as const)), keys: [s(a.id)] });
    }
    for (const t of tests) {
      const mineSets = sets.filter((x) => s(x.testId) === s(t.id));
      const st = mineSets.flatMap((x) => byA.get(s(x.id)) ?? []);
      const students = new Map<string, boolean>();
      for (const r of st) students.set(s(r.studentId), (students.get(s(r.studentId)) ?? false) || s(r.status) === "COMPLETED");
      const cls = ofClass.get(s(t.classId)) ?? [];
      res.push({ kind: "TEST", id: s(t.id), title: s(t.title), detail: s(t.testType) || null, classIds: [s(t.classId)], createdById: s(t.createdById), scope: students.size < cls.length ? "students" : "class",
        createdAt: iso(t.createdAt), dueAt: iso(t.dueAt ?? mineSets[0]?.dueAt), startAt: iso(t.openAt ?? mineSets[0]?.startAt), students, keys: mineSets.flatMap((x) => [`test:${s(x.id)}`, s(x.id)]) });
    }
    for (const p of sentPlans) {
      const places = placesOf.get(s(p.id)) ?? [];
      const doneCount = new Map<string, number>();
      const who = new Set<string>();
      for (const place of places) {
        const st = place.flatMap((aid) => byA.get(aid) ?? []);
        const finished = new Set(st.filter((r) => s(r.status) === "COMPLETED").map((r) => s(r.studentId)));
        for (const r of st) who.add(s(r.studentId));
        for (const sid of finished) doneCount.set(sid, (doneCount.get(sid) ?? 0) + 1);
      }
      const chosen = idList(p.studentIds);
      const ids = s(p.kind) === "CURRICULUM" ? ofClass.get(s(p.classId)) ?? [...who] : chosen.length ? chosen : [...who];
      res.push({ kind: "PLAN", id: s(p.id), title: s(p.title), detail: s(p.kind) || null, classIds: [s(p.classId)], createdById: s(p.createdById), scope: chosen.length ? "students" : "class",
        createdAt: iso(p.createdAt), dueAt: iso(p.dueAt), startAt: iso(p.startAt), students: mapOf(ids, (sid) => places.length > 0 && (doneCount.get(sid) ?? 0) >= places.length), keys: [`plan:${s(p.id)}`, ...places.flat()] });
    }
    return res;
  };

  // 2. MAP Tests (a test may reach several classes or chosen students)
  const mapTests = async (): Promise<Raw[]> => {
    if (!want("MAP_TEST")) return [];
    const wins = (await repo.findMany("MapSimWindow", { schoolId: sc.schoolId, ...by(), ...one() }, { select: ["id", "title", "subjects", "classIds", "studentIds", "grade", "draft", "createdById", "createdAt", "opensAt", "closesAt"], ...newest }))
      .filter((w) => !w.draft);
    const mineW = wins.filter((w) => { const c = idList(w.classIds); return sc.admin || o.creators !== null || !c.length || c.some((x) => classIds.includes(x)); });
    if (!mineW.length) return [];
    const levelOf = new Map((await repo.findMany("Grade", { id: { in: [...new Set(sc.classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] })).map((g) => [s(g.id), Number(g.level)]));
    const sessions = await repo.findMany("MapSimSession", { windowId: { in: mineW.map((w) => s(w.id)) }, status: "DONE" }, { select: ["windowId", "studentId", "subject"] });
    return mineW.map((w) => {
      const subjects = idList(w.subjects);
      const chosen = idList(w.studentIds);
      const cls = idList(w.classIds);
      const ids = chosen.length ? chosen : cls.length ? cls.flatMap((c) => ofClass.get(c) ?? [])
        : sc.classes.filter((c) => w.grade === null || w.grade === undefined || levelOf.get(s(c.gradeId)) === Number(w.grade)).flatMap((c) => ofClass.get(s(c.id)) ?? []);
      const done = (sid: string) => subjects.every((sub) => sessions.some((x) => s(x.windowId) === s(w.id) && s(x.studentId) === sid && s(x.subject) === sub));
      return { kind: "MAP_TEST" as const, id: s(w.id), title: s(w.title), detail: subjects.join(" · ") || null, classIds: cls.length ? cls : [], createdById: s(w.createdById), scope: chosen.length ? "students" as const : "class" as const,
        createdAt: iso(w.createdAt), dueAt: iso(w.closesAt), startAt: iso(w.opensAt), students: mapOf([...new Set(ids)], done), keys: subjects.map((sub) => `map_test:${s(w.id)}:${sub}`) };
    });
  };

  // 3. NAFS tests (given online) and NAFS practice
  const nafsTests = async (): Promise<Raw[]> => {
    if (!want("NAFS_TEST")) return [];
    const given = await repo.findMany("NafsTestClass", { classId: { in: classIds }, ...by(), ...one() }, { select: ["id", "testId", "classId", "dueAt", "openAt", "studentIds", "createdById", "createdAt"], ...newest });
    if (!given.length) return [];
    const ids = [...new Set(given.map((g) => s(g.testId)))];
    const [tests, results] = await Promise.all([
      repo.findMany("NafsTest", { id: { in: ids }, deletedAt: null }, { select: ["id", "title"] }),
      repo.findMany("NafsResult", { testId: { in: ids }, classId: { in: [...new Set(given.map((g) => s(g.classId)))] } }, { select: ["testId", "classId", "studentId", "submittedAt"] }),
    ]);
    return given.filter((g) => tests.some((t) => t.id === g.testId)).map((g) => {
      const chosen = idList(g.studentIds);
      const who = chosen.length ? chosen : ofClass.get(s(g.classId)) ?? [];
      return { kind: "NAFS_TEST" as const, id: s(g.id), title: s(tests.find((t) => t.id === g.testId)?.title), detail: null, classIds: [s(g.classId)], createdById: s(g.createdById), scope: chosen.length ? "students" as const : "class" as const,
        createdAt: iso(g.createdAt), dueAt: iso(g.dueAt), startAt: iso(g.openAt), students: mapOf(who, (sid) => results.some((r) => r.testId === g.testId && s(r.classId) === s(g.classId) && s(r.studentId) === sid && r.submittedAt)), keys: [`nafs_test:${s(g.id)}`] };
    });
  };
  const nafsPractice = async (): Promise<Raw[]> => {
    if (!want("NAFS_PRACTICE")) return [];
    const rows = await repo.findMany("NafsPractice", { classId: { in: classIds }, deletedAt: null, ...by(), ...one() }, { select: ["id", "title", "classId", "studentIds", "dueAt", "createdById", "createdAt"], ...newest });
    if (!rows.length) return [];
    const runs = await repo.findMany("NafsPracticeRun", { practiceId: { in: rows.map((p) => s(p.id)) } }, { select: ["practiceId", "studentId", "finishedAt"] });
    return rows.map((p) => {
      const chosen = idList(p.studentIds);
      return { kind: "NAFS_PRACTICE" as const, id: s(p.id), title: s(p.title), detail: null, classIds: [s(p.classId)], createdById: s(p.createdById), scope: chosen.length ? "students" as const : "class" as const,
        createdAt: iso(p.createdAt), dueAt: iso(p.dueAt), students: mapOf(chosen.length ? chosen : ofClass.get(s(p.classId)) ?? [], (sid) => runs.some((r) => r.practiceId === p.id && s(r.studentId) === sid && r.finishedAt)), keys: [`nafs_practice:${s(p.id)}`] };
    });
  };

  // 4. Learn lessons and words (one LearnAssign → its LearnAssignee rows)
  const learn = async (): Promise<Raw[]> => {
    if (!want("LEARN") && !want("WORDS")) return [];
    const kinds = [...(want("LEARN") ? ["LESSON"] : []), ...(want("WORDS") ? ["WORDS"] : [])];
    const rows = (await repo.findMany("LearnAssign", { schoolId: sc.schoolId, deletedAt: null, kind: { in: kinds }, ...by(), ...one() }, { select: ["id", "kind", "ref", "title", "classId", "target", "dueAt", "startAt", "createdById", "createdAt"], ...newest }))
      .filter((a) => sc.admin || o.creators !== null || !a.classId || classIds.includes(s(a.classId)));
    if (!rows.length) return [];
    const who = await inChunks(rows.map((a) => s(a.id)), (part) => repo.findMany("LearnAssignee", { assignId: { in: part } }, { select: ["assignId", "studentId", "status"] }));
    return rows.map((a) => {
      const st = who.filter((w) => w.assignId === a.id);
      return { kind: (s(a.kind) === "WORDS" ? "WORDS" : "LEARN") as AssignedKind, id: s(a.id), title: s(a.title), detail: null, classIds: a.classId ? [s(a.classId)] : [], createdById: s(a.createdById), scope: s(a.target) === "CLASS" ? "class" as const : "students" as const,
        createdAt: iso(a.createdAt), dueAt: iso(a.dueAt), startAt: iso(a.startAt), students: new Map(st.map((w) => [s(w.studentId), s(w.status) === "DONE"] as const)), keys: [`learn:${s(a.kind)}:${s(a.ref)}`] };
    });
  };

  // 5. ReadRise articles given to a class
  const readrise = async (): Promise<Raw[]> => {
    if (!want("READRISE")) return [];
    const given = await repo.findMany("RRClassArticle", { classId: { in: classIds }, ...by("assignedById"), ...one() }, { select: ["id", "classId", "articleId", "assignedById", "dueAt", "startAt", "createdAt"], ...newest });
    if (!given.length) return [];
    const ids = [...new Set(given.map((g) => s(g.articleId)))];
    const [arts, runs] = await Promise.all([
      repo.findMany("RRArticle", { id: { in: ids }, deletedAt: null }, { select: ["id", "title"] }),
      inReach.size ? inChunks([...inReach], (part) => repo.findMany("RRRun", { articleId: { in: ids }, studentId: { in: part } }, { select: ["articleId", "studentId", "step", "completedAt"] })) : Promise.resolve([] as Row[]),
    ]);
    return given.filter((g) => arts.some((a) => a.id === g.articleId)).map((g) => ({
      kind: "READRISE" as const, id: s(g.id), title: s(arts.find((a) => a.id === g.articleId)?.title), detail: null, classIds: [s(g.classId)], createdById: s(g.assignedById), scope: "class" as const,
      createdAt: iso(g.createdAt), dueAt: iso(g.dueAt), startAt: iso(g.startAt), students: mapOf(ofClass.get(s(g.classId)) ?? [], (sid) => runs.some((r) => r.articleId === g.articleId && s(r.studentId) === sid && (r.completedAt || r.step === "DONE"))), keys: [`readrise:${s(g.articleId)}`],
    }));
  };

  // 6. Writing and reading-aloud (fluency) tasks
  const writing = async (): Promise<Raw[]> => {
    if (!want("WRITING") && !want("FLUENCY")) return [];
    const kinds = [...(want("WRITING") ? ["WRITE"] : []), ...(want("FLUENCY") ? ["READ_ALOUD"] : [])];
    const tasks = await repo.findMany("WritingTask", { classId: { in: classIds }, deletedAt: null, kind: { in: kinds }, ...by(), ...one() }, { select: ["id", "kind", "title", "classId", "studentIds", "dueAt", "startAt", "createdById", "createdAt"], ...newest });
    if (!tasks.length) return [];
    const subs = await inChunks(tasks.map((t) => s(t.id)), (part) => repo.findMany("WritingSubmission", { taskId: { in: part } }, { select: ["taskId", "studentId", "status"] }));
    return tasks.map((t) => {
      const chosen = json<unknown>(t.studentIds, null);
      const list = Array.isArray(chosen) ? chosen.map(s) : ofClass.get(s(t.classId)) ?? [];
      const aloud = s(t.kind) === "READ_ALOUD";
      return { kind: (aloud ? "FLUENCY" : "WRITING") as AssignedKind, id: s(t.id), title: s(t.title), detail: null, classIds: [s(t.classId)], createdById: s(t.createdById), scope: Array.isArray(chosen) ? "students" as const : "class" as const,
        createdAt: iso(t.createdAt), dueAt: iso(t.dueAt), startAt: iso(t.startAt), students: mapOf(list, (sid) => subs.some((x) => x.taskId === t.id && s(x.studentId) === sid && s(x.status) !== "DRAFT")), keys: [`${aloud ? "read_aloud" : "writing"}:${s(t.id)}`] };
    });
  };

  // 7. Exit tickets and Respond to Reading
  const exits = async (): Promise<Raw[]> => {
    if (!want("EXIT_TICKET")) return [];
    const rows = await repo.findMany("ExitTicket", { classId: { in: classIds }, ...by(), ...one() }, { select: ["id", "title", "classId", "status", "createdById", "createdAt"], ...newest });
    if (!rows.length) return [];
    const answers = await inChunks(rows.map((t) => s(t.id)), (part) => repo.findMany("ExitTicketAnswer", { ticketId: { in: part } }, { select: ["ticketId", "studentId"] }));
    return rows.map((t) => ({
      kind: "EXIT_TICKET" as const, id: s(t.id), title: s(t.title), detail: s(t.status) === "OPEN" ? null : s(t.status), classIds: [s(t.classId)], createdById: s(t.createdById), scope: "class" as const,
      createdAt: iso(t.createdAt), dueAt: null, students: mapOf(ofClass.get(s(t.classId)) ?? [], (sid) => answers.some((a) => a.ticketId === t.id && s(a.studentId) === sid)), keys: [`exit_ticket:${s(t.id)}`],
    }));
  };
  const respond = async (): Promise<Raw[]> => {
    if (!want("RESPOND")) return [];
    const rows = await repo.findMany("RespondAssignment", { classId: { in: classIds }, deletedAt: null, ...by(), ...one() }, { select: ["id", "title", "classId", "dueAt", "startAt", "createdById", "createdAt"], ...newest });
    if (!rows.length) return [];
    const st = await inChunks(rows.map((r) => s(r.id)), (part) => repo.findMany("RespondAssignmentStudent", { assignmentId: { in: part } }, { select: ["assignmentId", "studentId", "finishedAt"] }));
    return rows.map((r) => {
      const mine = st.filter((x) => x.assignmentId === r.id);
      return { kind: "RESPOND" as const, id: s(r.id), title: s(r.title), detail: null, classIds: [s(r.classId)], createdById: s(r.createdById), scope: mine.length < (ofClass.get(s(r.classId)) ?? []).length ? "students" as const : "class" as const,
        createdAt: iso(r.createdAt), dueAt: iso(r.dueAt), startAt: iso(r.startAt), students: new Map(mine.map((x) => [s(x.studentId), Boolean(x.finishedAt)] as const)), keys: [`respond:${s(r.id)}`] };
    });
  };

  // 8. Short lessons sent to one student (no "who sent it" on the row: the teacher's own students)
  const lessons = async (): Promise<Raw[]> => {
    if (!want("LESSON") || (o.creators && sc.admin)) return [];
    const ids = [...inReach];
    if (!ids.length) return [];
    const runs = o.only
      ? (await repo.findMany("LessonRun", { id: o.only, source: "TEACHER" }, { select: ["id", "studentId", "skillId", "finishedAt", "startedAt"] })).filter((r) => inReach.has(s(r.studentId)))
      : (await inChunks(ids, (part) => repo.findMany("LessonRun", { studentId: { in: part }, source: "TEACHER" }, { select: ["id", "studentId", "skillId", "finishedAt", "startedAt"], orderBy: [{ field: "startedAt", dir: "desc" }], take: TAKE }))).slice(0, TAKE);
    if (!runs.length) return [];
    const skills = await repo.findMany("Skill", { id: { in: [...new Set(runs.map((r) => s(r.skillId)))] } }, { select: ["id", "name"] });
    const classOf = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
    return runs.map((r) => ({
      kind: "LESSON" as const, id: s(r.id), title: `Lesson — ${s(skills.find((k) => k.id === r.skillId)?.name) || "Skill"}`, detail: null, classIds: classOf.has(s(r.studentId)) ? [classOf.get(s(r.studentId))!] : [], createdById: "", scope: "students" as const,
      createdAt: iso(r.startedAt), dueAt: null, students: new Map([[s(r.studentId), Boolean(r.finishedAt)]]), keys: [`lesson:${s(r.id)}`],
    }));
  };

  const lists = await Promise.all([
    safeIfBehind("assigned.assignments", assignmentKinds, none),
    safeIfBehind("assigned.map", mapTests, none),
    safeIfBehind("assigned.nafs-tests", nafsTests, none),
    safeIfBehind("assigned.nafs-practice", nafsPractice, none),
    safeIfBehind("assigned.learn", learn, none),
    safeIfBehind("assigned.readrise", readrise, none),
    safeIfBehind("assigned.writing", writing, none),
    safeIfBehind("assigned.exit", exits, none),
    safeIfBehind("assigned.respond", respond, none),
    safeIfBehind("assigned.lessons", lessons, none),
  ]);
  for (const l of lists) out.push(...l);
  // only what is in reach: a teacher's own classes (a MAP Test of the whole grade: the students of those classes)
  if (!sc.admin) for (const r of out) for (const sid of [...r.students.keys()]) if (!inReach.has(sid)) r.students.delete(sid);
  return out;
}

// ------------------------------------------------------------------ the list

/** "Unit 1 · Selection 1: Amigo Brothers · Review" → "Unit 1" (the smart select "by unit"); null when no unit is named. */
export function unitOfTitle(title: string): string | null {
  const m = /\bunit\s*(\d{1,2})\b/i.exec(s(title));
  return m ? `Unit ${Number(m[1])}` : null;
}

export interface AssignedFilters { classId?: string | null; kind?: string | null; status?: string | null; from?: string | null; to?: string | null; teacher?: string | null }
export interface AssignedView {
  items: AssignedItem[];
  classes: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  admin: boolean;
}

const cancelState = (cancels: Row[], kind: string, id: string) => {
  const mine = cancels.filter((c) => s(c.kind) === kind && s(c.refId) === id);
  return { all: mine.some((c) => !c.studentId), removed: new Set(mine.filter((c) => c.studentId).map((c) => s(c.studentId))) };
};

function statusOf(r: Raw, cancelled: boolean, recipients: number, done: number, now: Date): AssignedStatus {
  if (cancelled) return "CANCELLED";
  if (recipients > 0 && done >= recipients) return "DONE";
  if (r.startAt && Date.parse(r.startAt) > now.getTime()) return "SCHEDULED";
  if (r.dueAt && Date.parse(r.dueAt) < now.getTime()) return "LATE";
  return "OPEN";
}

/**
 * Everything the teacher assigned (admin: every teacher of the school, or one with `teacher` = their User id), newest
 * first, with the filters (class, kind, status, date from / to on the day it was assigned).
 */
export async function assignedList(repo: Repo, actor: Actor, f: AssignedFilters = {}, now = new Date()): Promise<AssignedView> {
  const sc = await scopeOf(repo, actor);
  const kinds = new Set<AssignedKind>(isAssignedKind(f.kind) ? [f.kind] : ASSIGNED_KINDS);
  // the school's teachers (names; the admin's filter): one read each
  const teachers = await repo.findMany("Teacher", { schoolId: sc.schoolId }, { select: ["id", "userId"] });
  const users = teachers.length ? await repo.findMany("User", { id: { in: teachers.map((t) => s(t.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOfUser = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const teacherOf = new Map<string, { id: string; name: string }>();
  for (const t of teachers) { const v = { id: s(t.userId), name: nameOfUser.get(s(t.userId)) ?? "Teacher" }; teacherOf.set(s(t.id), v); teacherOf.set(s(t.userId), v); }
  let creators: string[] | null = sc.admin ? null : sc.mine;
  if (sc.admin && f.teacher) { const t = teachers.find((x) => s(x.userId) === f.teacher); creators = t ? [s(t.userId), s(t.id)] : [s(f.teacher)]; }
  const [raw, cancels] = await Promise.all([collect(repo, sc, { kinds, creators }), activeCancels(repo, sc.schoolId)]);
  const className = new Map(sc.classes.map((c) => [s(c.id), s(c.name)]));
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? Date.parse(`${f.from}T00:00:00Z`) : null;
  const to = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? Date.parse(`${f.to}T23:59:59Z`) : null;
  const items: AssignedItem[] = [];
  for (const r of raw) {
    if (f.classId && !r.classIds.includes(f.classId)) continue;
    const at = r.createdAt ? Date.parse(r.createdAt) : null;
    if (from !== null && (at === null || at < from)) continue;
    if (to !== null && (at === null || at > to)) continue;
    const c = cancelState(cancels, r.kind, r.id);
    const live = [...r.students].filter(([sid]) => !c.removed.has(sid));
    const done = live.filter(([, d]) => d).length;
    const status = statusOf(r, c.all, live.length, done, now);
    // owner r68: a cancelled item DISAPPEARS from the list — it shows only with Status = "Cancelled" (or "All")
    const want = f.status || "ACTIVE";
    if (want !== "ALL" && (want === "ACTIVE" ? status === "CANCELLED" : status !== want)) continue;
    items.push({
      kind: r.kind, id: r.id, title: r.title, detail: r.detail, classIds: r.classIds, classNames: r.classIds.map((x) => className.get(x) ?? "").filter(Boolean),
      teacher: teacherOf.get(r.createdById) ?? null, scope: r.scope, recipients: live.length, done, removed: [...c.removed].filter((sid) => r.students.has(sid)).length,
      createdAt: r.createdAt, dueAt: r.dueAt, startAt: r.startAt ?? null, unit: unitOfTitle(r.title), status, cancelled: c.all,
    });
  }
  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return {
    items,
    classes: sc.classes.map((c) => ({ id: s(c.id), name: s(c.name) })).sort((a, b) => a.name.localeCompare(b.name)),
    teachers: sc.admin ? teachers.map((t) => ({ id: s(t.userId), name: nameOfUser.get(s(t.userId)) ?? "Teacher" })).sort((a, b) => a.name.localeCompare(b.name)) : [],
    admin: sc.admin,
  };
}

// ------------------------------------------------------------------ one item: its students, cancel, undo

/** One assigned thing the actor may manage (teacher: assigned it, or it is in a class they teach; admin: the school). */
async function manageable(repo: Repo, actor: Actor, kind: AssignedKind, id: string): Promise<{ sc: Scope; item: Raw }> {
  const sc = await scopeOf(repo, actor);
  if (!isAssignedKind(kind)) throw new ValidationError("Unknown kind of work.");
  const found = (await collect(repo, sc, { kinds: new Set([kind]), only: s(id), creators: null })).find((r) => r.id === s(id) && r.kind === kind);
  if (!found) throw new ForbiddenError("Not found, or not in your classes.");
  if (!sc.admin) {
    const own = sc.mine.includes(found.createdById);
    const mineClass = found.classIds.length > 0 && found.classIds.every((c) => sc.classes.some((k) => s(k.id) === c));
    if (!own && !mineClass) throw new ForbiddenError("Only the teacher who assigned it (or a teacher of the class) can change it.");
  }
  return { sc, item: found };
}

/** The students one assigned thing went to: done or not, and removed one by one. */
export async function assignedStudents(repo: Repo, actor: Actor, kind: AssignedKind, id: string): Promise<{ item: AssignedItem; students: AssignedStudent[] }> {
  const { sc, item: r } = await manageable(repo, actor, kind, id);
  const [names, cancels] = await Promise.all([studentNames(repo, [...r.students.keys()]), activeCancels(repo, sc.schoolId)]);
  const c = cancelState(cancels, r.kind, r.id);
  const students: AssignedStudent[] = [...r.students].map(([sid, done]) => ({ id: sid, name: names.get(sid)?.name ?? "Student", done, removed: c.removed.has(sid) })).sort((a, b) => a.name.localeCompare(b.name));
  // ⭐ skill work: each student's star of the skill (one read)
  if (kind === "SKILL" && students.length) {
    const a = await repo.findUnique("Assignment", { id: r.id });
    if (a?.skillId) {
      const by = await safeIfBehind("assigned.stars", () => statusesOfSkills(repo, sc.schoolId, students.map((x) => x.id), [s(a.skillId)]), new Map());
      for (const x of students) x.star = by.get(x.id)?.get(s(a.skillId))?.status ?? "NOT_STARTED";
    }
  }
  const live = students.filter((x) => !x.removed);
  const className = new Map(sc.classes.map((k) => [s(k.id), s(k.name)]));
  return {
    item: { kind: r.kind, id: r.id, title: r.title, detail: r.detail, classIds: r.classIds, classNames: r.classIds.map((x) => className.get(x) ?? "").filter(Boolean), teacher: null, scope: r.scope,
      recipients: live.length, done: live.filter((x) => x.done).length, removed: students.length - live.length, createdAt: r.createdAt, dueAt: r.dueAt,
      status: statusOf(r, c.all, live.length, live.filter((x) => x.done).length, new Date()), cancelled: c.all },
    students,
  };
}

/**
 * Cancel something the teacher assigned — for everyone (no studentId) or for one student. A SOFT cancel: one
 * AssignmentCancel row with the My Work keys it hides; no answer, result or assignment row is changed or deleted.
 * Cancelling twice is harmless (the same active row is kept). Returns the cancel row's id.
 */
export async function cancelAssignment(repo: Repo, actor: Actor, kind: AssignedKind, id: string, studentId?: string | null, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  const { sc, item } = await manageable(repo, actor, kind, id);
  const sid = studentId ? s(studentId) : null;
  if (sid && !item.students.has(sid)) throw new ValidationError("This student did not get this work.");
  const same = await repo.findMany("AssignmentCancel", { kind, refId: item.id, restoredAt: null }, { select: ["id", "studentId"] });
  const hit = same.find((c) => s(c.studentId) === s(sid));
  if (hit) return s(hit.id);
  const row = await repo.create("AssignmentCancel", {
    schoolId: sc.schoolId, kind, refId: item.id, classId: item.classIds.length === 1 ? item.classIds[0] : null, studentId: sid,
    keys: item.keys, title: item.title.slice(0, 191) || ASSIGNED_KIND_LABEL[kind], cancelledById: actor.userId, cancelledAt: now, restoredAt: null, restoredById: null,
  });
  await audit(repo, { actorId: actor.userId, action: sid ? "assignment.cancel.student" : "assignment.cancel", entityType: kind, entityId: item.id, after: { studentId: sid, title: item.title }, at: now }).catch(() => undefined);
  return s(row.id);
}

/** Undo a cancel (for everyone, or for one student): the work is back in My Work at once, answers as they were. */
export async function restoreAssignment(repo: Repo, actor: Actor, kind: AssignedKind, id: string, studentId?: string | null, now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  const { item } = await manageable(repo, actor, kind, id);
  const sid = studentId ? s(studentId) : null;
  const rows = (await repo.findMany("AssignmentCancel", { kind, refId: item.id, restoredAt: null }, { select: ["id", "studentId"] })).filter((c) => s(c.studentId) === s(sid));
  if (!rows.length) return 0;
  const n = await repo.updateMany("AssignmentCancel", { id: { in: rows.map((r) => s(r.id)) } }, { restoredAt: now, restoredById: actor.userId });
  await audit(repo, { actorId: actor.userId, action: sid ? "assignment.restore.student" : "assignment.restore", entityType: kind, entityId: item.id, after: { studentId: sid }, at: now }).catch(() => undefined);
  return n;
}

// ------------------------------------------------------------------ several at once (owner r68 §8 / §E)

export interface BulkRef { kind: AssignedKind; id: string }
export interface BulkResult { done: BulkRef[]; failed: { kind: string; id: string; message: string }[] }
/** at most this many in one press */
export const BULK_MAX = 300;

/** "SKILL:abc" → { kind, id } (the Assigned page's checkbox values); unknown kinds and repeats are dropped. */
export function parseBulkRefs(values: readonly string[]): BulkRef[] {
  const out: BulkRef[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const at = s(v).indexOf(":");
    if (at < 1) continue;
    const kind = s(v).slice(0, at), id = s(v).slice(at + 1);
    if (!isAssignedKind(kind) || !id || seen.has(`${kind}:${id}`)) continue;
    seen.add(`${kind}:${id}`);
    out.push({ kind, id });
  }
  return out.slice(0, BULK_MAX);
}

/**
 * 🚫 Cancel several things at once (one confirm on the page). Each one is checked like a single cancel (the teacher's
 * own work or a class they teach); the reads are shared: ONE collect of the kinds asked, then each item (an item older
 * than the newest rows read is checked on its own). Soft, like cancelAssignment: nothing is deleted.
 */
export function cancelMany(repo: Repo, actor: Actor, refs: readonly BulkRef[], now = new Date()): Promise<BulkResult> {
  return bulk(repo, actor, refs, now, "cancel");
}
/** ↩ Undo several cancels at once (the toast's Undo, or "Undo selected" with Status = Cancelled). */
export function restoreMany(repo: Repo, actor: Actor, refs: readonly BulkRef[], now = new Date()): Promise<BulkResult> {
  return bulk(repo, actor, refs, now, "restore");
}

async function bulk(repo: Repo, actor: Actor, refs: readonly BulkRef[], now: Date, op: "cancel" | "restore"): Promise<BulkResult> {
  assertCan(actor, "assignments:create");
  const list = parseBulkRefs(refs.map((r) => `${r.kind}:${r.id}`));
  const out: BulkResult = { done: [], failed: [] };
  if (!list.length) return out;
  const sc = await scopeOf(repo, actor);
  const found = await collect(repo, sc, { kinds: new Set(list.map((r) => r.kind)), creators: null });
  const byRef = new Map(found.map((r) => [`${r.kind}:${r.id}`, r]));
  const active = await inChunks(list.map((r) => r.id), (part) => repo.findMany("AssignmentCancel", { schoolId: sc.schoolId, restoredAt: null, refId: { in: part } }, { select: ["id", "kind", "refId", "studentId"] }));
  for (const ref of list) {
    try {
      let item = byRef.get(`${ref.kind}:${ref.id}`) ?? null;
      if (!item) item = (await manageable(repo, actor, ref.kind, ref.id)).item;
      else if (!sc.admin) {
        const own = sc.mine.includes(item.createdById);
        const mineClass = item.classIds.length > 0 && item.classIds.every((c) => sc.classes.some((k) => s(k.id) === c));
        if (!own && !mineClass) throw new ForbiddenError("Only the teacher who assigned it (or a teacher of the class) can change it.");
      }
      const it = item;
      const mine = active.filter((c) => s(c.kind) === ref.kind && s(c.refId) === it.id && !c.studentId);
      if (op === "cancel") {
        if (!mine.length) await repo.create("AssignmentCancel", {
          schoolId: sc.schoolId, kind: ref.kind, refId: it.id, classId: it.classIds.length === 1 ? it.classIds[0] : null, studentId: null,
          keys: it.keys, title: it.title.slice(0, 191) || ASSIGNED_KIND_LABEL[ref.kind], cancelledById: actor.userId, cancelledAt: now, restoredAt: null, restoredById: null,
        });
      } else if (mine.length) await repo.updateMany("AssignmentCancel", { id: { in: mine.map((c) => s(c.id)) } }, { restoredAt: now, restoredById: actor.userId });
      out.done.push(ref);
    } catch (e) {
      if (e instanceof ForbiddenError || e instanceof ValidationError) out.failed.push({ ...ref, message: e.message });
      else throw e;
    }
  }
  if (out.done.length) await audit(repo, { actorId: actor.userId, action: op === "cancel" ? "assignment.cancel.bulk" : "assignment.restore.bulk", entityType: "Assigned", entityId: String(out.done.length), after: { items: out.done.slice(0, 50) }, at: now }).catch(() => undefined);
  return out;
}
