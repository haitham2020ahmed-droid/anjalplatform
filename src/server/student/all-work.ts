/**
 * 📋 My Work = EVERYTHING the teacher gave the student (owner, MAP Test plan § 5 / 5b): besides the skills and sets of
 * questions (myWorkItems), every other assigned thing is a My Work row too, so the student never forgets one —
 *
 *   TEST           Assessments tests of any type (TeacherTest: Weekly Quiz, Chapter Test, MAP, NAFS, Review, Other …
 *                  whatever its testType string)
 *   MAP_TEST       MAP Tests (automatic or manual, MapSimWindow), one row per subject
 *   NAFS_TEST      NAFS tests given online (NafsTestClass)
 *   NAFS_PRACTICE  NAFS practice (NafsPractice)
 *   READRISE       ReadRise articles the teacher assigned to the class (RRClassArticle)
 *   WRITING        writing tasks (WritingTask WRITE, locked writing included)
 *   READ_ALOUD     reading-aloud / fluency tasks (WritingTask READ_ALOUD)
 *   EXIT_TICKET    open exit tickets of the class
 *   RESPOND        Respond to Reading tasks
 *   LESSON         short lessons the teacher sent (LessonRun, source TEACHER)
 *   PLAN           study plans from the Curriculum Map (their places live in the plan, not as single rows)
 *   SURVEY         the Reading Strategy Survey the teacher opened for the class
 *   LEARN          Learn lessons and curriculum words the teacher assigned (LearnAssignee, one read)
 *
 * Each row has its title, its kind, its due / close date, Start / Continue opening the same player as its own icon
 * (which keeps it too), and Done when finished. Each row is listed ONCE (tests are not skill rows: their sets are kept
 * out of myWorkItems), so the home "to do" badge counts it once. Each source is a bounded read (one query, plus one
 * or two for its details only when it has rows) wrapped in safeIfBehind: a table missing from an older database gives
 * no rows for that source, never a broken My Work. Students never see level words (teacher titles go through hideLevels).
 */
import type { Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { safeIfBehind } from "../db/schema-errors";
import { hideLevels } from "../../lib/hide-levels";
import { SOURCE_LABEL, sourceOfPlanKind, type SourceKey } from "../../lib/source-tags";
import type { WorkKind } from "../../lib/work-kinds";
import { myWorkItems, type MyWorkItem, type WorkStatus } from "../plans/wizard";
import { myTests as mapTestsOf, type MyTests as MapTests } from "../map/sim";
import { TEST_MARK } from "../tests/runtime";
import { myTasks } from "../teacher/writing";
import { studentRespondWork, type StudentRespondTask } from "../curriculum-map/respond-assign";
import { STUDY_PLAN_KINDS } from "../curriculum-map/plans";
import { myStrategySurvey, OPEN_KEY, surveyTerm } from "../surveys/strategy";
import { hiddenWorkKeys, placeCancelled, withoutCancelled } from "./cancelled-work";
import { startedBy } from "../../lib/assign-dates";

export { WORK_KIND_LABEL as KIND_LABEL, WORK_KINDS } from "../../lib/work-kinds";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : (v instanceof Date ? v : new Date(s(v))).toISOString());
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
const forMe = (row: Row, sid: string) => { const who = json<unknown>(row.studentIds, null); return !Array.isArray(who) || !who.length || who.map(s).includes(sid); };
const SUBJECT: Record<string, string> = { READING: "Reading", LANGUAGE: "Language Usage" };

type Tasks = Awaited<ReturnType<typeof myTasks>>;
/** Reads the home page already does (passed in so they are not read twice). */
export interface Prefetched { map?: Promise<MapTests>; respond?: Promise<StudentRespondTask[]>; writing?: Promise<Tasks>; /** the cancelled keys (a plan's cancelled place leaves its count) */ hidden?: Promise<Set<string>> }

function row(kind: WorkKind, key: string, title: string, status: WorkStatus, href: string, opts: { source?: SourceKey; dueAt?: string | null; overdue?: boolean; doneHref?: string } = {}): MyWorkItem {
  const source = opts.source ?? "CURRICULUM";
  return {
    assignmentId: `${kind.toLowerCase()}:${key}`, skillId: null, skill: title, source: SOURCE_LABEL[source], sourceKey: source, status,
    overdue: Boolean(opts.overdue && status !== "Done"), dueAt: opts.dueAt ?? null, href: status === "Done" ? opts.doneHref ?? href : href,
    action: status === "Done" ? "Review" : status === "Not started" ? "Start" : "Continue", note: null, kind,
  };
}
const late = (due: string | null, now: Date) => Boolean(due && Date.parse(due) < now.getTime());
const statusOf = (st: unknown): WorkStatus => (s(st) === "COMPLETED" ? "Done" : s(st) === "IN_PROGRESS" ? "In progress" : "Not started");

/**
 * Teacher tests — every TeacherTest, whatever its testType (Weekly Quiz, Chapter Test, MAP, NAFS, Review, Other …):
 * the same sets as My Tests, opened in the same quiz player.
 */
async function testRows(repo: Repo, mine: Row[], now: Date): Promise<MyWorkItem[]> {
  if (!mine.length) return [];
  const sets = (await repo.findMany("Assignment", { id: { in: mine.map((r) => s(r.assignmentId)) }, curriculumPlanId: TEST_MARK, deletedAt: null }, { select: ["id", "title", "testId", "assessmentId", "startAt", "dueAt", "deletedAt"], take: 500 })).filter((a) => a.testId);
  if (!sets.length) return [];
  // (the quiz player writes the status with each answer and at hand-in: nothing to refresh here)
  const tests = await repo.findMany("TeacherTest", { id: { in: [...new Set(sets.map((a) => s(a.testId)))] } }, { select: ["id", "title", "testType", "deletedAt"] });
  const out: MyWorkItem[] = [];
  for (const a of sets) {
    const t = tests.find((x) => x.id === a.testId);
    if (!t || t.deletedAt) continue;
    if (a.startAt && Date.parse(iso(a.startAt)!) > now.getTime()) continue;   // opens later: not yet
    const st = statusOf(mine.find((r) => r.assignmentId === a.id)?.status);
    const type = s(t.testType).toUpperCase();
    const due = iso(a.dueAt);
    out.push(row("TEST", s(a.id), hideLevels(s(t.title) || s(a.title)), st, `/quiz/${s(a.id)}`, { source: type === "MAP" ? "MAP" : type === "NAFS" ? "NAFS" : "CURRICULUM", dueAt: due, overdue: late(due, now), doneHref: `/student/tests/${s(a.id)}` }));
  }
  return out;
}

/** MAP Tests: one row per subject of each test that is open now (or finished). */
function mapRows(m: MapTests): MyWorkItem[] {
  const out: MyWorkItem[] = [];
  for (const w of m.windows) for (const x of w.sessions) {
    if (!w.open && x.status !== "DONE") continue;
    const status: WorkStatus = x.status === "DONE" ? "Done" : x.status === "IN_PROGRESS" ? "In progress" : "Not started";
    out.push(row("MAP_TEST", `${w.id}:${x.subject}`, `MAP Test — ${SUBJECT[x.subject] ?? x.subject} · ${w.title}`, status, `/student/map-test/run?windowId=${encodeURIComponent(w.id)}&subject=${x.subject}`, { source: "MAP", dueAt: w.closesAt, doneHref: "/student/map-test" }));
  }
  return out;
}

/** NAFS tests given to my class (or to me), online: Done once handed in. */
async function nafsTestRows(repo: Repo, sid: string, classIds: string[], now: Date): Promise<MyWorkItem[]> {
  if (!classIds.length) return [];
  const given = (await repo.findMany("NafsTestClass", { classId: { in: classIds } }, { select: ["id", "testId", "openAt", "dueAt", "studentIds"], take: 200 })).filter((g) => forMe(g, sid) && !(g.openAt && Date.parse(iso(g.openAt)!) > now.getTime()));
  if (!given.length) return [];
  const ids = [...new Set(given.map((g) => s(g.testId)))];
  const [tests, results] = await Promise.all([
    repo.findMany("NafsTest", { id: { in: ids }, deletedAt: null }, { select: ["id", "title"] }),
    repo.findMany("NafsResult", { studentId: sid, testId: { in: ids } }, { select: ["testId", "submittedAt"] }),
  ]);
  return given.filter((g) => tests.some((t) => t.id === g.testId)).map((g) => {
    const r = results.find((x) => x.testId === g.testId);
    const due = iso(g.dueAt);
    return row("NAFS_TEST", s(g.id), `NAFS test — ${hideLevels(s(tests.find((t) => t.id === g.testId)?.title))}`, r?.submittedAt ? "Done" : r ? "In progress" : "Not started", `/student/nafs/sim/${s(g.id)}`, { source: "NAFS", dueAt: due, overdue: late(due, now), doneHref: "/student/nafs?part=results" });
  });
}

/** NAFS practice given to my class (or to me): Done when the practice run is finished. */
async function nafsPracticeRows(repo: Repo, sid: string, classIds: string[], now: Date): Promise<MyWorkItem[]> {
  if (!classIds.length) return [];
  const rows = (await repo.findMany("NafsPractice", { classId: { in: classIds }, deletedAt: null }, { select: ["id", "title", "dueAt", "studentIds"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 })).filter((p) => forMe(p, sid));
  if (!rows.length) return [];
  const runs = await repo.findMany("NafsPracticeRun", { studentId: sid, practiceId: { in: rows.map((p) => s(p.id)) } }, { select: ["practiceId", "finishedAt"] });
  return rows.map((p) => {
    const r = runs.find((x) => x.practiceId === p.id);
    const due = iso(p.dueAt);
    return row("NAFS_PRACTICE", s(p.id), `NAFS practice — ${hideLevels(s(p.title))}`, !r ? "Not started" : r.finishedAt ? "Done" : "In progress", `/student/nafs/practice/${s(p.id)}`, { source: "NAFS", dueAt: due, overdue: late(due, now) });
  });
}

function writingRows(list: Tasks, now: Date): MyWorkItem[] {
  return list.map((x) => {
    const status: WorkStatus = x.status === "SUBMITTED" || x.status === "SCORED" ? "Done" : x.status === "DRAFT" ? "In progress" : "Not started";
    return row(x.kind === "READ_ALOUD" ? "READ_ALOUD" : "WRITING", x.id, hideLevels(x.title), status, `/student/writing/${x.id}`, { dueAt: x.dueAt, overdue: late(x.dueAt, now) });
  });
}

function respondRows(list: StudentRespondTask[], now: Date): MyWorkItem[] {
  return list.map((x) => row("RESPOND", x.assignmentId, `Respond to Reading — ${x.heading}`, x.finishedAt ? "Done" : "Not started", `/student/respond/${encodeURIComponent(x.setCode)}`, { dueAt: x.dueAt, overdue: late(x.dueAt, now) }));
}

/**
 * Study plans from the Curriculum Map sent to my class (their places are kept out of the single rows): the class's
 * curriculum plan counts all its places; a unit / chosen-places plan the places assigned to me. Done = every place done.
 */
async function planRows(repo: Repo, classIds: string[], mine: Row[], hidden: Set<string> = new Set()): Promise<MyWorkItem[]> {
  if (!classIds.length) return [];
  const plans = (await repo.findMany("SkillPlan", { classId: { in: classIds }, kind: { in: [...STUDY_PLAN_KINDS] } }, { select: ["id", "title", "kind", "status"], take: 50 })).filter((p) => !p.status || s(p.status) === "SENT");
  if (!plans.length) return [];
  const items = await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => s(p.id)) } }, { select: ["planId", "assignmentIds"] });
  const statusOfA = new Map(mine.map((r) => [s(r.assignmentId), s(r.status)]));
  const out: MyWorkItem[] = [];
  for (const p of plans) {
    // 🚫 a place the teacher cancelled (its assignment, for everyone or for me) is not counted (owner r68)
    const all = items.filter((i) => i.planId === p.id).map((i) => json<unknown[]>(i.assignmentIds, []).map(s)).filter((ids) => !placeCancelled(ids, ids.filter((a) => statusOfA.has(a)), hidden));
    const places = s(p.kind) === "CURRICULUM" ? all : all.filter((ids) => ids.some((a) => statusOfA.has(a)));
    if (!places.length) continue;
    const done = places.filter((ids) => ids.some((a) => statusOfA.get(a) === "COMPLETED")).length;
    out.push(row("PLAN", s(p.id), hideLevels(s(p.title)), done >= places.length ? "Done" : done > 0 ? "In progress" : "Not started", `/student/plans/${s(p.id)}`, { source: sourceOfPlanKind(p.kind) }));
  }
  return out;
}

/** ReadRise articles the teacher assigned to my classes: Done when my reading of it is finished. */
async function readRiseRows(repo: Repo, sid: string, classIds: string[], now: Date): Promise<MyWorkItem[]> {
  if (!classIds.length) return [];
  // r68: an article assigned for later (its start date) is not in My Work before that day
  const given = (await repo.findMany("RRClassArticle", { classId: { in: classIds } }, { select: ["articleId", "dueAt", "startAt", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 })).filter((g) => startedBy(g.startAt, now));
  if (!given.length) return [];
  const ids = [...new Set(given.map((g) => s(g.articleId)))];
  const [arts, runs] = await Promise.all([
    repo.findMany("RRArticle", { id: { in: ids }, deletedAt: null }, { select: ["id", "title"] }),
    repo.findMany("RRRun", { studentId: sid, articleId: { in: ids } }, { select: ["articleId", "step", "completedAt"] }),
  ]);
  return ids.filter((id) => arts.some((a) => a.id === id)).map((id) => {
    const g = given.find((x) => s(x.articleId) === id)!;
    const mineRuns = runs.filter((r) => s(r.articleId) === id);
    const status: WorkStatus = mineRuns.some((r) => r.completedAt || r.step === "DONE") ? "Done" : mineRuns.length ? "In progress" : "Not started";
    const due = iso(g.dueAt);
    return row("READRISE", id, `ReadRise — ${s(arts.find((a) => a.id === id)?.title)}`, status, `/student/readrise/${encodeURIComponent(id)}`, { dueAt: due, overdue: late(due, now) });
  });
}

/** Open exit tickets of my classes: Done once I answered. */
async function exitRows(repo: Repo, sid: string, classIds: string[]): Promise<MyWorkItem[]> {
  if (!classIds.length) return [];
  const open = await repo.findMany("ExitTicket", { classId: { in: classIds }, status: "OPEN" }, { select: ["id", "title", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 20 });
  if (!open.length) return [];
  const answered = new Set((await repo.findMany("ExitTicketAnswer", { studentId: sid, ticketId: { in: open.map((t) => s(t.id)) } }, { select: ["ticketId"] })).map((a) => s(a.ticketId)));
  return open.map((t) => row("EXIT_TICKET", s(t.id), `Exit ticket — ${hideLevels(s(t.title))}`, answered.has(s(t.id)) ? "Done" : "Not started", `/student/exit/${s(t.id)}`));
}

/** Short lessons the teacher sent me. */
async function lessonRows(repo: Repo, sid: string): Promise<MyWorkItem[]> {
  const runs = await repo.findMany("LessonRun", { studentId: sid, source: "TEACHER" }, { select: ["id", "skillId", "finishedAt", "attempts", "phase"], orderBy: [{ field: "updatedAt", dir: "desc" }], take: 50 });
  if (!runs.length) return [];
  const skills = await repo.findMany("Skill", { id: { in: [...new Set(runs.map((r) => s(r.skillId)))] } }, { select: ["id", "name"] });
  return runs.map((r) => row("LESSON", s(r.id), `Lesson — ${s(skills.find((k) => k.id === r.skillId)?.name) || "Skill"}`, r.finishedAt ? "Done" : Number(r.attempts ?? 0) > 0 || s(r.phase) !== "MODEL" ? "In progress" : "Not started", `/student/lesson?skillId=${encodeURIComponent(s(r.skillId))}`));
}

/**
 * Learn lessons and curriculum words the teacher assigned me (LearnAssignee: ONE read, title / due date kept on the
 * row). The same lesson or selection given twice is one row (the latest due date).
 */
async function learnRows(repo: Repo, sid: string, now: Date): Promise<MyWorkItem[]> {
  // r68: a lesson / words assigned for later (start date) wait until that day
  const rows = (await repo.findMany("LearnAssignee", { studentId: sid }, { select: ["kind", "ref", "title", "dueAt", "startAt", "status", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 })).filter((r) => startedBy(r.startAt, now));
  const seen = new Set<string>();
  const out: MyWorkItem[] = [];
  for (const r of rows) {
    const k = `${s(r.kind)}:${s(r.ref)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const due = iso(r.dueAt);
    const words = s(r.kind) === "WORDS";
    const href = words ? `/student/words?sel=${encodeURIComponent(s(r.ref))}` : `/student/learn/${encodeURIComponent(s(r.ref))}`;
    out.push(row("LEARN", k, `${words ? "Words" : "Learn"} — ${hideLevels(s(r.title))}`, statusOf(s(r.status) === "DONE" ? "COMPLETED" : r.status), href, { dueAt: due, overdue: late(due, now) }));
  }
  return out;
}

/** The Reading Strategy Survey, when the teacher opened it for my class this term (Done once I took it). */
async function surveyRows(repo: Repo, actor: Actor, classIds: string[], now: Date): Promise<MyWorkItem[]> {
  const set = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: OPEN_KEY }, { select: ["value"], take: 1 }))[0];
  const open = json<Record<string, { term?: string }>>(set?.value, {});
  if (!classIds.some((c) => open[c]?.term === surveyTerm(now))) return [];
  const mine = await myStrategySurvey(repo, actor, now);
  return mine.openedByTeacher ? [row("SURVEY", "strategy", "Reading Strategy Survey", mine.taken ? "Done" : "Not started", "/student/strategy-survey")] : [];
}

/**
 * The rows of My Work that are not skills or sets of questions (see the list above), each source read once (bounded)
 * and through safeIfBehind. Reads only.
 */
export async function extraWorkItems(repo: Repo, actor: Actor, now = new Date(), pre: Prefetched = {}): Promise<MyWorkItem[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) return [];
  const sid = actor.studentId;
  const [classIds, mine] = await Promise.all([
    repo.findMany("ClassMembership", { studentId: sid, leftAt: null }, { select: ["classId"] }).then((m) => m.map((x) => s(x.classId))),
    repo.findMany("AssignmentStudent", { studentId: sid }, { select: ["assignmentId", "status"] }),
  ]);
  const none = [] as MyWorkItem[];
  const lists = await Promise.all([
    safeIfBehind("work.tests", () => testRows(repo, mine, now), none),
    safeIfBehind("work.map-test", () => (pre.map ?? mapTestsOf(repo, actor, now)).then(mapRows), none),
    safeIfBehind("work.nafs-tests", () => nafsTestRows(repo, sid, classIds, now), none),
    safeIfBehind("work.nafs-practice", () => nafsPracticeRows(repo, sid, classIds, now), none),
    safeIfBehind("work.readrise", () => readRiseRows(repo, sid, classIds, now), none),
    safeIfBehind("work.writing", () => (pre.writing ?? myTasks(repo, actor)).then((x) => writingRows(x, now)), none),
    safeIfBehind("work.respond", () => (pre.respond ?? studentRespondWork(repo, actor)).then((x) => respondRows(x, now)), none),
    safeIfBehind("work.exit", () => exitRows(repo, sid, classIds), none),
    safeIfBehind("work.lessons", () => lessonRows(repo, sid), none),
    safeIfBehind("work.plans", async () => planRows(repo, classIds, mine, await (pre.hidden ?? Promise.resolve(new Set<string>()))), none),
    safeIfBehind("work.survey", () => surveyRows(repo, actor, classIds, now), none),
    safeIfBehind("work.learn", () => learnRows(repo, sid, now), none),
  ]);
  return lists.flat();
}

const RANK: Record<WorkStatus, number> = { "In progress": 1, "Not started": 2, Done: 3 };
/** My Work order: late first, then in progress, not started, done; sooner due first (a stable sort keeps the rest). */
export function sortWork<T extends Pick<MyWorkItem, "status" | "overdue" | "dueAt">>(rows: T[]): T[] {
  const rank = (r: T) => (r.overdue && r.status !== "Done" ? 0 : RANK[r.status]);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
}

/**
 * Everything in My Work: the skill / question-set rows and every other assigned thing, each once, in My Work order.
 * Work the teacher cancelled (for everyone or for me — "Assigned") is left out; its answers are kept.
 */
export async function allWorkItems(repo: Repo, actor: Actor, now = new Date(), pre: Prefetched = {}): Promise<MyWorkItem[]> {
  const hiddenP = actor.studentId ? hiddenWorkKeys(repo, actor.studentId, actor.schoolId) : Promise.resolve(new Set<string>());
  const [skills, extra, hidden] = await Promise.all([myWorkItems(repo, actor, now), extraWorkItems(repo, actor, now, { ...pre, hidden: hiddenP }), hiddenP]);
  const seen = new Set<string>();
  return sortWork(withoutCancelled([...skills, ...extra], hidden).filter((r) => (seen.has(r.assignmentId) ? false : (seen.add(r.assignmentId), true))));
}
