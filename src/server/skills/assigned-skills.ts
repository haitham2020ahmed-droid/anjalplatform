/**
 * ⭐ The ASSIGNED skills of a class or of one student (owner r74: "Student Skills shows ONLY skills the teacher has
 * assigned"): skill key → its sources (MAP · NAFS · Curriculum · Grammar · RTI, from Assignment.source; older rows:
 * inferred once, lib/assign-source.ts) and student → key → sources. A skill nobody practised yet is still assigned (☆);
 * a skill practised but never assigned is NOT here, so it is on no tab, number or report of Student Skills.
 *
 * What counts as assigning a skill: every live (not cancelled) assignment of the class that is skill work — a skill
 * assignment (skillId / skillIds) or a set of questions (its questions' skills) — but never a TEST or a CHECK (teacher
 * tests, Weekly Check, Diagnostic, placement / MAP practice tests, MAP checks, the star review checks, RTI re-checks,
 * progress checks): those measure, they do not assign a skill.
 *
 * r78: the assignments are EXACTLY the live rows of the Assigned page (teacher/assigned.ts assignedWorkOfClasses):
 * cancelled there (for everyone or for one student) = gone from Student Skills; never sent = never here.
 *
 * Light (512 MB): the Assigned page's bounded reads (kinds SKILL + PLAN only), the Assignment rows of those (at most
 * ASSIGNED_TAKE, selected columns) and the questions of their sets in batches; a set's skills are capped at SET_SKILLS_CAP.
 */
import type { Repo, Row } from "../seeding/repo";
import type { SkillKeyIndex } from "./status";
import { ASSIGN_SOURCES, sourceOfAssignment, type AssignSource } from "../../lib/assign-source";
import { assignedWorkOfClasses, type AssignedKind, type LiveAssigned } from "../teacher/assigned";
import { liveAssignmentWhere } from "../student/cancelled-work";

/** the Assigned page's kinds that can assign a skill */
const SKILL_KINDS: readonly AssignedKind[] = ["SKILL", "PLAN"];

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
const ms = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);

/** at most this many assignments of a class are read (newest first) */
export const ASSIGNED_TAKE = 800;
/** at most this many skills are taken from one set of questions */
export const SET_SKILLS_CAP = 20;
/** at most this many set questions are read in all */
const SET_QUESTIONS_TAKE = 20000;

const TEST_MARKS = new Set(["TEST", "WEEKLY_CHECK"]);
const CHECK_TITLES = ["Re-check: ", "Review check: ", "Monthly mixed review", "Progress Check: ", "Placement test · ", "MAP practice test · ", "MAP check · ", "Weekly Check", "Diagnostic Test"];

/** Is this assignment skill WORK (not a test or a check)? Pure. */
export function isSkillWork(a: Row): boolean {
  if (a.testId || TEST_MARKS.has(s(a.curriculumPlanId))) return false;
  const title = s(a.title), note = s(a.note);
  if (CHECK_TITLES.some((p) => title.startsWith(p))) return false;
  if (/Diagnostic Test$/.test(note)) return false;
  return true;
}

export interface AssignedSkills {
  /** key → its sources (in the ASSIGN_SOURCES order) */
  sourcesOf: Map<string, AssignSource[]>;
  /** key → a skill id of the assignment (for names / codes / links) */
  skillIdOf: Map<string, string>;
  /** student → key → the sources it was assigned to them from */
  byStudent: Map<string, Map<string, Set<AssignSource>>>;
}

const ordered = (set: Iterable<AssignSource>): AssignSource[] => { const x = new Set(set); return ASSIGN_SOURCES.filter((k) => x.has(k)); };

/** Pure core: assignments (+ the skills of their sets) and their students → the assigned skills. */
export function buildAssigned(assignments: readonly Row[], setSkills: ReadonlyMap<string, readonly string[]>, links: readonly Row[], keyOf: ReadonlyMap<string, string>, members?: ReadonlySet<string>): AssignedSkills {
  const keysOfA = new Map<string, { keys: Map<string, string>; source: AssignSource }>();
  for (const a of assignments) {
    if (!isSkillWork(a)) continue;
    const ids = [...new Set([...(a.skillId ? [s(a.skillId)] : []), ...json<unknown[]>(a.skillIds, []).map(s), ...(a.assessmentId ? setSkills.get(s(a.assessmentId)) ?? [] : [])])].filter(Boolean);
    const keys = new Map<string, string>();
    for (const id of ids) { const k = keyOf.get(id); if (k && !keys.has(k)) keys.set(k, id); }
    if (keys.size) keysOfA.set(s(a.id), { keys, source: sourceOfAssignment(a) });
  }
  const byStudent = new Map<string, Map<string, Set<AssignSource>>>();
  const sources = new Map<string, Set<AssignSource>>(), skillIdOf = new Map<string, string>();
  for (const l of links) {
    const st = s(l.studentId), a = keysOfA.get(s(l.assignmentId));
    if (!a || (members && !members.has(st))) continue;
    const mine = byStudent.get(st) ?? new Map<string, Set<AssignSource>>();
    for (const [k, id] of a.keys) {
      (mine.get(k) ?? mine.set(k, new Set()).get(k)!).add(a.source);
      (sources.get(k) ?? sources.set(k, new Set()).get(k)!).add(a.source);
      if (!skillIdOf.has(k)) skillIdOf.set(k, id);
    }
    byStudent.set(st, mine);
  }
  return { sourcesOf: new Map([...sources].map(([k, v]) => [k, ordered(v)])), skillIdOf, byStudent };
}

/** The skills of some sets of questions (assessment id → distinct skill ids, capped). Bounded batched reads. */
async function skillsOfSets(repo: Repo, assessmentIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!assessmentIds.length) return out;
  const aq: Row[] = [];
  for (let i = 0; i < assessmentIds.length && aq.length < SET_QUESTIONS_TAKE; i += 300) aq.push(...(await repo.findMany("AssessmentQuestion", { assessmentId: { in: assessmentIds.slice(i, i + 300) } }, { select: ["assessmentId", "questionId"], take: SET_QUESTIONS_TAKE - aq.length })));
  const qids = [...new Set(aq.map((x) => s(x.questionId)))];
  const skillOfQ = new Map<string, string>();
  for (let i = 0; i < qids.length; i += 1000) for (const q of await repo.findMany("Question", { id: { in: qids.slice(i, i + 1000) } }, { select: ["id", "skillId"] })) skillOfQ.set(s(q.id), s(q.skillId));
  for (const x of aq) {
    const sk = skillOfQ.get(s(x.questionId)); if (!sk) continue;
    const list = out.get(s(x.assessmentId)) ?? [];
    if (!list.includes(sk) && list.length < SET_SKILLS_CAP) list.push(sk);
    out.set(s(x.assessmentId), list);
  }
  return out;
}

const COLS = ["id", "skillId", "skillIds", "assessmentId", "testId", "curriculumPlanId", "title", "note", "track", "program", "source", "createdAt", "deletedAt"];

/**
 * r78 (owner: "only what the teacher ASSIGNS — exactly the Assigned page"): the skill work of the live rows of the
 * Assigned page (teacher/assigned.ts assignedWorkOfClasses — the SAME reads and the SAME cancels as the page):
 *   SKILL  a skill / a set of questions sent (Assign, Curriculum Map Assign, MAP plan sets, Year plan ☆, RTI …)
 *   PLAN   the places of a plan the teacher SENT (Curriculum Map send, unit plans) — but never the whole-grade
 *          Curriculum plan (kind CURRICULUM): its places open when a STUDENT starts one (made for the whole class,
 *          silently) — the teacher assigned no skill
 * Nothing else: plans / drafts never sent (no row), a cancelled or removed row (gone from Assigned), and — even when
 * listed — a test or a check (isSkillWork).
 */
async function assignedOfWork(repo: Repo, work: readonly LiveAssigned[], ix: SkillKeyIndex, members: ReadonlySet<string> | undefined, range?: { since: number | null; until: number | null }): Promise<AssignedSkills> {
  const items = work.filter(countsAsAssigning);
  const aids = [...new Set(items.flatMap((w) => w.aids))].slice(0, ASSIGNED_TAKE);
  const rows: Row[] = [];
  for (let i = 0; i < aids.length; i += 400) rows.push(...(await repo.findMany("Assignment", liveAssignmentWhere({ id: { in: aids.slice(i, i + 400) } }), { select: COLS })));
  const inRange = (a: Row) => !range || ((!range.since || ms(a.createdAt) >= range.since) && (!range.until || ms(a.createdAt) <= range.until));
  const live = rows.filter((a) => isSkillWork(a) && inRange(a)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const liveIds = new Set(live.map((a) => s(a.id)));
  const links = items.flatMap((w) => w.links.filter((l) => liveIds.has(s(l.assignmentId))));
  const sets = [...new Set(live.filter((a) => a.assessmentId && !a.skillId && !json<unknown[]>(a.skillIds, []).length).map((a) => s(a.assessmentId)))];
  return buildAssigned(live, await skillsOfSets(repo, sets), links, ix.keyOf, members);
}

/** Does a live row of Assigned assign skills? (SKILL; a sent plan's places — not the whole-grade Curriculum plan) Pure. */
export function countsAsAssigning(w: Pick<LiveAssigned, "kind" | "detail">): boolean {
  return w.kind === "SKILL" || (w.kind === "PLAN" && s(w.detail) !== "CURRICULUM");
}

const EMPTY = (): AssignedSkills => ({ sourcesOf: new Map(), skillIdOf: new Map(), byStudent: new Map() });

/** The class's assigned skills (its current members only); r75: with dates, only the assignments made inside them (ms). */
export async function classAssignedSkills(repo: Repo, classId: string, memberIds: readonly string[], ix: SkillKeyIndex, range?: { since: number | null; until: number | null }): Promise<AssignedSkills> {
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass) return EMPTY();
  const work = await assignedWorkOfClasses(repo, s(klass.schoolId), [classId], { kinds: SKILL_KINDS });
  return assignedOfWork(repo, work, ix, new Set(memberIds), range);
}

/** One student's assigned skills: what is live for them on the Assigned rows of their current classes. */
export async function studentAssignedSkills(repo: Repo, studentId: string, ix: SkillKeyIndex): Promise<AssignedSkills> {
  const [st, mem] = await Promise.all([repo.findUnique("Student", { id: studentId }), repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })]);
  if (!st || !mem.length) return EMPTY();
  const work = await assignedWorkOfClasses(repo, s(st.schoolId), mem.map((m) => s(m.classId)), { kinds: SKILL_KINDS, studentId });
  return assignedOfWork(repo, work, ix, new Set([studentId]));
}
