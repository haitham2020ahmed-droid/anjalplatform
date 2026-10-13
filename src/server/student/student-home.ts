/**
 * 🏠 Student Home (UI reorg Phase 2): everything the new home page needs, in a few bounded round trips.
 *
 *   A  welcome counts (skills to work on, tests waiting) + "Continue where you left off" (lastActivity)
 *   B  My Work — one row per skill with its source tag (myWorkItems, Phase 4); ALL grammar work is here
 *   C  Reading tiles (ReadMaster: every published article of the grade; ReadRise: the whole library) — no assignment
 *   D  My Progress tiles (My Tests with the to-do badge, My Reports hub); MAP is a program page (/student/map)
 *   E  Programs tiles (Curriculum Map of the grade; RTI Program ONLY for students in Tier 2/3)
 *   +  "Also for you": work that is not a skill (Diagnostic Test, live game, exit ticket, MAP practice test,
 *      Respond to Reading, writing tasks, new teacher comments) — only when there is some.
 *
 * Every read is bounded (one student's rows, a page of at most a few rows, or one grade's map). Reuses:
 * myWorkItems (plans/wizard.ts), testsToDoCount (tests/assessments.ts), myDiagnostic, openGamesFor, myExitTicket,
 * map practice tests (map/sim.ts), studentRespondWork, myTasks. The adaptive engine is not touched.
 */
import type { Actor } from "../auth/rbac";
import { ForbiddenError } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { myWorkItems, type MyWorkItem } from "../plans/wizard";
import { testsToDoCount } from "../tests/assessments";
import { myDiagnostic } from "../diagnostic/test";
import { openGamesFor } from "../game/live";
import { myExitTicket } from "../teacher/classroom";
import { myTests as mapPracticeTests } from "../map/sim";
import { studentRespondWork } from "../curriculum-map/respond-assign";
import { myTasks } from "../teacher/writing";
import { MINUTES } from "../tiers/weekly-plan";
import type { MyMap } from "../map/map-more";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown): number => (v instanceof Date ? v.getTime() : v ? new Date(String(v)).getTime() : 0);
const DAY = 86_400_000;
/** an open activity older than this is not "where you left off" any more */
export const LAST_ACTIVITY_DAYS = 30;

function studentIdOf(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students have a student home.");
  return actor.studentId;
}

// ------------------------------------------------------------------ A. continue where you left off

export type ActivityKind = "PRACTICE" | "TEST" | "QUESTIONS" | "LESSON" | "READRISE";
export interface LastActivity { kind: ActivityKind; title: string; href: string; at: string }

/**
 * The last activity the student left unfinished: a practice session (skill or a set of questions), a test in
 * progress, an intervention lesson, or a ReadRise article. One round trip of three one-row reads (newest first,
 * take 1), then one name lookup. Null when nothing is open (the page then offers the first My Work row).
 */
export async function lastActivity(repo: Repo, actor: Actor, now = new Date()): Promise<LastActivity | null> {
  const sid = studentIdOf(actor);
  const since = new Date(now.getTime() - LAST_ACTIVITY_DAYS * DAY);
  const one = { take: 1 } as const;
  const [ps, lr, rr] = await Promise.all([
    repo.findMany("PracticeSession", { studentId: sid, endedAt: null, startedAt: { gte: since } }, { select: ["id", "skillId", "assignmentId", "startedAt"], orderBy: [{ field: "startedAt", dir: "desc" }], ...one }),
    repo.findMany("LessonRun", { studentId: sid, finishedAt: null, updatedAt: { gte: since } }, { select: ["id", "skillId", "updatedAt"], orderBy: [{ field: "updatedAt", dir: "desc" }], ...one }),
    repo.findMany("RRRun", { studentId: sid, step: { not: "DONE" }, startedAt: { gte: since } }, { select: ["id", "articleId", "startedAt"], orderBy: [{ field: "startedAt", dir: "desc" }], ...one }),
  ]);
  type Cand = { kind: ActivityKind; at: number; row: Row };
  const cands: Cand[] = [];
  // a skill practice (assigned or not) reopens the practice; a set of questions or a test reopens the quiz player
  if (ps[0] && (ps[0].skillId || ps[0].assignmentId)) cands.push({ kind: ps[0].skillId ? "PRACTICE" : "QUESTIONS", at: time(ps[0].startedAt), row: ps[0] });
  if (lr[0]) cands.push({ kind: "LESSON", at: time(lr[0].updatedAt), row: lr[0] });
  if (rr[0]) cands.push({ kind: "READRISE", at: time(rr[0].startedAt), row: rr[0] });
  const best = cands.sort((a, b) => b.at - a.at)[0];
  if (!best) return null;
  const at = new Date(best.at).toISOString();
  if (best.kind === "READRISE") {
    const a = await repo.findUnique("RRArticle", { id: s(best.row.articleId) });
    return { kind: "READRISE", title: s(a?.title) || "ReadRise", href: `/student/readrise/${s(best.row.articleId)}`, at };
  }
  if (best.kind === "QUESTIONS") {
    const a = await repo.findUnique("Assignment", { id: s(best.row.assignmentId) });
    return a && !a.deletedAt ? { kind: a.testId ? "TEST" : "QUESTIONS", title: s(a.title), href: `/quiz/${s(a.id)}`, at } : null;
  }
  const skill = await repo.findUnique("Skill", { id: s(best.row.skillId) });
  const name = s(skill?.name) || "Practice";
  return best.kind === "LESSON"
    ? { kind: "LESSON", title: name, href: `/student/lesson?skillId=${encodeURIComponent(s(best.row.skillId))}`, at }
    : { kind: "PRACTICE", title: name, href: `/practice/${encodeURIComponent(s(best.row.skillId))}`, at };
}

// ------------------------------------------------------------------ E. RTI (Tier 2 / 3 only)

export interface RtiStatus { tier: 2 | 3; focusSkillId: string | null }
/** The student's RTI status: only Tier 2 and Tier 3 students are "in the RTI program" (tiers module). */
export async function rtiStatus(repo: Repo, studentId: string): Promise<RtiStatus | null> {
  const row = await repo.findUnique("StudentTier", { studentId });
  const tier = Number(row?.tier ?? 1);
  return tier === 2 || tier === 3 ? { tier, focusSkillId: row?.focusSkillId ? s(row.focusSkillId) : null } : null;
}

export interface RtiProgram { tier: 2 | 3; sessions: number; minutes: number; focus: { skillId: string; name: string } | null; skills: MyWorkItem[] }
/** 🛟 My RTI Program: this week's skills from the teacher (RTI work in My Work + the focus skill). Null = not in RTI. */
export async function studentRtiProgram(repo: Repo, actor: Actor, now = new Date()): Promise<RtiProgram | null> {
  const sid = studentIdOf(actor);
  const [rti, work] = await Promise.all([rtiStatus(repo, sid), myWorkItems(repo, actor, now)]);
  if (!rti) return null;
  const focus = rti.focusSkillId ? await repo.findUnique("Skill", { id: rti.focusSkillId }) : null;
  const m = MINUTES[rti.tier];
  return {
    tier: rti.tier, sessions: m.sessions, minutes: m.minutes,
    focus: focus ? { skillId: s(focus.id), name: s(focus.name) } : null,
    skills: work.filter((w) => w.sourceKey === "RTI"),
  };
}

// ------------------------------------------------------------------ the home page

export interface HomeNotice { key: string; icon: string; text: string; vars?: Record<string, string | number>; href: string; cta: string; urgent?: boolean }
export interface StudentHome {
  work: (MyWorkItem & { reteach: boolean })[];
  /** skills to work on (rows not done) — the badge on My Work and the X of the welcome line */
  toDo: number;
  testsToDo: number;
  /** writing tasks not handed in yet (the badge on the Writing tile) */
  writingToDo: number;
  last: LastActivity | null;
  rti: RtiStatus | null;
  readRiseLevel: number | null;
  notices: HomeNotice[];
}

/**
 * Everything the Student Home shows, in three waves: (1) My Work + tests + last activity + the small reads, each of
 * them bounded; (2)–(3) inside those functions. ~30 queries for a student with work (measured in
 * tests/uiro-shome.test.ts).
 */
export async function studentHome(repo: Repo, actor: Actor, now = new Date()): Promise<StudentHome> {
  const sid = studentIdOf(actor);
  const [work, testsToDo, last, rti, rr, diag, games, exit, mapTests, respond, writing, comments] = await Promise.all([
    myWorkItems(repo, actor, now), testsToDoCount(repo, actor, now), lastActivity(repo, actor, now), rtiStatus(repo, sid),
    repo.findUnique("RRStudent", { studentId: sid }),
    myDiagnostic(repo, actor, now).catch(() => null), openGamesFor(repo, actor).catch(() => []), myExitTicket(repo, actor).catch(() => null),
    mapPracticeTests(repo, actor, now).catch(() => ({ windows: [], warmupDone: false })), studentRespondWork(repo, actor).catch(() => []),
    myTasks(repo, actor).catch(() => []),
    repo.count("WorkComment", { studentId: sid, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }),
  ]);
  const rows = work.map((w) => ({ ...w, reteach: /^Reteach:/i.test(s(w.note)) }));
  const notices: HomeNotice[] = [];
  if (diag && diag.status !== "DONE") notices.push({ key: "diagnostic", icon: "🩺", text: diag.status === "STARTED" ? "Finish your Diagnostic Test" : "Take your Diagnostic Test", href: diag.href, cta: diag.status === "STARTED" ? "Continue" : "Start", urgent: true });
  // 🗓️ no self-start: the Diagnostic shows only while the school admin has it open for the grade (myDiagnostic)
  for (const g of games) notices.push({ key: `game-${g.code}`, icon: "🎮", text: "A live game is open: {title}", vars: { title: g.title }, href: `/play/${g.code}`, cta: "Join a Game", urgent: true });
  if (exit) notices.push({ key: "exit", icon: "🎟️", text: "Exit ticket: 3 quick questions", href: `/student/exit/${exit.id}`, cta: "Start" });
  const mapTodo = mapTests.windows.filter((w) => w.open).reduce((n, w) => n + w.sessions.filter((x) => x.status !== "DONE").length, 0);
  if (mapTodo > 0) notices.push({ key: "map-test", icon: "🧭", text: "MAP practice test is open", href: "/student/map-test", cta: "Start" });
  const respondTodo = respond.filter((r) => !r.finishedAt);
  if (respondTodo.length) notices.push({ key: "respond", icon: "✍️", text: "Respond to Reading: {n} to write", vars: { n: respondTodo.length }, href: respondTodo[0]?.setCode ? `/student/respond/${respondTodo[0].setCode}` : "/student/respond", cta: "Open" });
  const writingTodo = writing.filter((w) => w.status === "NOT_STARTED" || w.status === "DRAFT").length;
  // writing tasks: the number sits on the home's Writing tile (no second link to the same page)
  if (comments) notices.push({ key: "comments", icon: "💬", text: "New comments from your teacher: {n}", vars: { n: comments }, href: "/student/comments", cta: "Open" });
  return {
    work: rows, toDo: rows.filter((r) => r.status !== "Done").length, testsToDo, writingToDo: writingTodo, last, rti,
    readRiseLevel: rr ? Number(rr.level) : null, notices,
  };
}

// ------------------------------------------------------------------ E. Curriculum Map (student, own grade, read only)

export interface StudentMapUnit { id: string; title: string; sets: { id: string; title: string; kind: "TEXT_SET" | "SELECTION"; sharedRead: string | null; genre: string | null }[] }
export interface StudentCurriculum { grade: number | null; units: StudentMapUnit[] }
/**
 * 🧭 The Curriculum Map of the student's own grade: Units → Text Sets / Selections (titles only; no question counts).
 * Bounded: one grade's map nodes, only the unit / text-set / selection rows and the few columns shown.
 */
export async function studentCurriculum(repo: Repo, actor: Actor): Promise<StudentCurriculum> {
  const sid = studentIdOf(actor);
  const st = await repo.findUnique("Student", { id: sid });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  if (!g) return { grade: null, units: [] };
  const nodes = await repo.findMany("CurriculumMapNode", { gradeId: g.id, kind: { in: ["UNIT", "TEXT_SET", "SELECTION"] } }, { select: ["id", "parentId", "kind", "title", "heading", "sharedRead", "genre", "sortOrder", "number"] });
  const ord = (a: Row, b: Row) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || Number(a.number ?? 0) - Number(b.number ?? 0);
  const units = nodes.filter((n) => n.kind === "UNIT").sort(ord).map((u) => ({
    id: s(u.id), title: s(u.heading) || s(u.title),
    sets: nodes.filter((n) => n.parentId === u.id && (n.kind === "TEXT_SET" || n.kind === "SELECTION")).sort(ord).map((n) => ({
      id: s(n.id), title: s(n.heading) || s(n.title), kind: n.kind as "TEXT_SET" | "SELECTION",
      sharedRead: n.sharedRead ? s(n.sharedRead) : null, genre: n.genre ? s(n.genre) : null,
    })),
  }));
  return { grade: Number(g.level), units };
}

// ------------------------------------------------------------------ D. My Reports hub (a few big cards)

export interface ReportLink { href: string; icon: string; label: string; hint: string }
/**
 * My Reports: a few big cards, one icon and ONE line each (every link is the student's own data). The old Progress
 * Report, My Skills and Family Report pages live inside "My progress" and "For my family" now; reading reports are
 * a "My report" tab inside ReadMaster, ReadRise and Fluency Coach.
 */
export function reportCards(): ReportLink[] {
  return [
    { href: "/student/reports?view=progress", icon: "📈", label: "My progress", hint: "How I am doing and what to learn next" },
    { href: "/student/reports?view=family", icon: "👪", label: "For my family", hint: "Reports to show at home, in English or Arabic" },
    { href: "/student/tests", icon: "📝", label: "My Tests", hint: "Scores of finished tests — open one to review your answers" },
    { href: "/student/certificates", icon: "📜", label: "My Certificates", hint: "Certificates I earned, ready to print" },
  ];
}
/** Where each reading program keeps "My report". */
export const READING_REPORT_LINKS: ReportLink[] = [
  { href: "/student/readmaster?tab=report", icon: "⭐", label: "ReadMaster", hint: "My report" },
  { href: "/student/readrise?tab=report", icon: "🚀", label: "ReadRise", hint: "My report" },
  { href: "/student/fluency-coach#my-report", icon: "🎙️", label: "Fluency Coach", hint: "My report" },
];

// ------------------------------------------------------------------ MAP dashboard data (teachers' view of a student's MAP; the
// student page uses studentMapCards in ./map-dashboard.ts, which never shows a descriptor)

/** MAP achievement descriptor → plain words for students and parents. */
const LEVEL: Record<string, string> = { Low: "Low", LoAvg: "Low average", Avg: "Average", HiAvg: "High average", High: "High" };
export const MAP_SUBJECT_NAME: Record<string, string> = { READING: "Reading", LANGUAGE: "Language Usage" };

export interface MapDashboardData { subjects: { subject: string; term: string | null; rit: number; level: string | null; percentile: number | null; lexile: number | null; goal: number | null; strengths: string[]; needsWork: { name: string; href: string | null }[] }[] }

/** The dashboard numbers from My MAP (myMap): RIT, level, strengths (highest areas) and skills needing work (lowest). */
export function mapDashboardData(m: MyMap): MapDashboardData {
  return {
    subjects: m.subjects.filter((x) => x.profile.overall).map((x) => {
      const o = x.profile.overall!;
      const scored = x.areas.filter((a) => a.rit !== null).sort((a, b) => Number(b.rit) - Number(a.rit));
      const strengths = scored.filter((a) => a.status === "EXTEND").map((a) => a.name);
      const focus = x.areas.filter((a) => a.status === "FOCUS");
      const weak = focus.length ? focus : scored.slice(-2).reverse();
      return {
        subject: x.subject, term: x.profile.term, rit: o.rit, level: o.descriptor ? LEVEL[o.descriptor] ?? o.descriptor : null, percentile: o.percentile, lexile: o.lexile,
        goal: x.goal?.target ?? null,
        strengths: (strengths.length ? strengths : scored.slice(0, 2).map((a) => a.name)).filter((n) => !weak.some((w) => w.name === n)),
        needsWork: weak.map((a) => ({ name: a.name, href: a.next ? `/practice/${a.next}?from=map` : null })),
      };
    }),
  };
}

