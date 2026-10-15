/**
 * ⭐ The ASSIGNED skills of a class or of one student (owner r74: "Student Skills shows ONLY skills the teacher has
 * assigned"): skill key → its sources (MAP · NAFS · Curriculum · Grammar · RTI, from Assignment.source; older rows:
 * inferred once, lib/assign-source.ts) and student → key → sources. A skill nobody practised yet is still assigned (☆);
 * a skill practised but never assigned is NOT here, so it is on no tab, number or report of Student Skills.
 *
 * What counts as assigning a skill: every live (not cancelled) assignment of the class that is skill work — but never a
 * TEST or a CHECK (teacher tests, Weekly Check, Diagnostic, placement / MAP practice tests, MAP checks, the star review
 * checks, RTI re-checks, progress checks, NAFS tests and booklets): those measure, they do not assign a skill.
 *
 * r78: the assignments are EXACTLY the live rows of the Assigned page (teacher/assigned.ts assignedWorkOfClasses):
 * cancelled there (for everyone or for one student) = gone from Student Skills; never sent = never here.
 *
 * r82 (owner, after r78: "Student Skills STILL shows ALL skills"): the real causes, fixed here —
 *   1. a set of questions counted EVERY skill of its questions (up to 20 a set): a Curriculum Map place holds questions
 *      of many skills, so a few sends made nearly every skill a column. Now an assignment counts only the skill(s) the
 *      teacher CHOSE (chosen-skills.ts: its skill, the plan section's skill, the skills the map place declares, the
 *      MAP plan area's skills, a one-skill set's skill) — never skills inferred from a mix of questions;
 *   2. the class's skills counted EVERY teacher's work in the class (a co-teacher, last year's teacher, another subject
 *      teacher): now a teacher's Student Skills reads THEIR Assigned page only (viewerCreators); the school admin and a
 *      coordinator who does not teach the class see every teacher's.
 * And NAFS adaptive practice the teacher gave (Assigned kind NAFS_PRACTICE) is assigned work of source NAFS: one column
 * per target standard / NAFS skill (nafs-skills.ts).
 *
 * r84 (owner: "plans make the Skills Grid too crowded"): every assigned pair is still here (By source and the Class report
 * count it once), but each pair also says WHERE it came from:
 *   a column (cols)  a single-skill assign (Search, MAP, NAFS, Grammar, ☆, the skill dialog), a Curriculum Map section
 *                    assign (its 2–3 named skills), a NAFS adaptive practice on exactly ONE standard / NAFS skill
 *   a plan (plans)   a plan SENT from the Plans pages (SkillPlan: RTI / MAP / Custom / Curriculum, editor or wizard), a
 *                    MAP study plan set ("MAP plan · …", grouped per send), a MAP group set ("MAP group · …"), the MAP
 *                    Year plan sent to the students, and a NAFS adaptive practice on 2 or more standards / NAFS skills
 * A pair can be both (a skill assigned on its own AND in a plan): it is still ONE pair.
 *
 * Light (512 MB): the Assigned page's bounded reads (kinds SKILL + PLAN + NAFS_PRACTICE), the Assignment rows of those (at
 * most ASSIGNED_TAKE, selected columns), then chosen-skills.ts's bounded reads; r84: + the sent plans' rows (one read),
 * the MAP study plans of MAP plan sets (one bounded read) and the class's Year plan (one row).
 */
import type { Repo, Row } from "../seeding/repo";
import type { SkillKeyIndex } from "./status";
import { ASSIGN_SOURCES, sourceOfAssignment, type AssignSource } from "../../lib/assign-source";
import { assignedList, assignedWorkOfClasses, type AssignedItem, type AssignedKind, type LiveAssigned } from "../teacher/assigned";
import { liveAssignmentWhere } from "../student/cancelled-work";
import { chosenSkills, type Chosen } from "./chosen-skills";
import { nafsKey, practiceTargets } from "./nafs-skills";
import type { Actor } from "../auth/rbac";
import { modelVersion } from "../cache/bank-version";
import { sweptMap } from "../cache/idle";

/** the Assigned page's kinds that can assign a skill (r82: + NAFS adaptive practice) */
const SKILL_KINDS: readonly AssignedKind[] = ["SKILL", "PLAN", "NAFS_PRACTICE"];

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ms = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);

/** at most this many assignments of a class are read (newest first) */
export const ASSIGNED_TAKE = 800;

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
  /** key → a skill id of the assignment (for names / codes / links); a NAFS key has none */
  skillIdOf: Map<string, string>;
  /** student → key → the sources it was assigned from */
  byStudent: Map<string, Map<string, Set<AssignSource>>>;
  /** r82: the live NAFS practices counted (their answers give the NAFS columns' stars) */
  nafsPractices?: string[];
  /** r84: student → the keys that are Skills Grid COLUMNS (single assigns, Curriculum sections, one-standard NAFS practice) */
  cols?: Map<string, Map<string, Set<AssignSource>>>;
  /** r84: the live plans (a plan's pairs are in byStudent too; never Skills Grid columns) */
  plans?: AssignedPlan[];
}

/** r84: the kind of a plan (its badge) */
export type PlanType = "RTI" | "MAP" | "CUSTOM" | "CURRICULUM" | "NAFS";
export const PLAN_TYPES: readonly PlanType[] = ["RTI", "MAP", "CUSTOM", "CURRICULUM", "NAFS"];
export const PLAN_TYPE_LABEL: Record<PlanType, string> = { RTI: "RTI", MAP: "MAP", CUSTOM: "Custom", CURRICULUM: "Curriculum", NAFS: "NAFS" };
/** r84: one live plan of the class — its card id ("plan:…", "mapplan:…", "asg:…", "nafs:…", "year:…"), and student → its keys */
export interface AssignedPlan { id: string; title: string; type: PlanType; sentAt: number; createdById: string; byStudent: Map<string, Set<string>> }

/** Pure (r84): a sent SkillPlan's badge — its program, else its kind (UNIT / PLACES = Curriculum; CUSTOM or none = Custom). */
export function planTypeOf(program: unknown, kind: unknown): PlanType {
  const p = s(program).toUpperCase(), k = s(kind).toUpperCase();
  if (p === "RTI" || p === "MAP" || p === "NAFS" || p === "CURRICULUM") return p;
  if (k === "RTI" || k === "MAP" || k === "NAFS") return k;
  if (k === "UNIT" || k === "PLACES" || k === "CURRICULUM") return "CURRICULUM";
  return "CUSTOM";
}
/** Pure (r84): a NAFS adaptive practice on 2 or more standards / NAFS skills is a PLAN; on one, a Skills Grid column. */
export const isNafsPlan = (targets: readonly string[]): boolean => new Set(targets).size >= 2;
/** Pure (r84): a MAP study plan set or a MAP group set (map-plan.ts titles) — part of a plan, never a column. */
export const isMapPlanSet = (title: unknown): "PLAN" | "GROUP" | null => (s(title).startsWith("MAP plan · ") ? "PLAN" : s(title).startsWith("MAP group · ") ? "GROUP" : null);

const ordered = (set: Iterable<AssignSource>): AssignSource[] => { const x = new Set(set); return ASSIGN_SOURCES.filter((k) => x.has(k)); };

/** Pure core (r82): live assignments + the skills the teacher chose for each + their student links → the assigned skills. */
export function buildAssigned(assignments: readonly Row[], chosen: ReadonlyMap<string, Pick<Chosen, "keys">>, links: readonly Row[], members?: ReadonlySet<string>): AssignedSkills {
  const keysOfA = new Map<string, { keys: ReadonlyMap<string, string>; source: AssignSource }>();
  for (const a of assignments) {
    if (!isSkillWork(a)) continue;
    const keys = chosen.get(s(a.id))?.keys;
    if (keys?.size) keysOfA.set(s(a.id), { keys, source: sourceOfAssignment(a) });
  }
  const out: AssignedSkills = { sourcesOf: new Map(), skillIdOf: new Map(), byStudent: new Map() };
  const sources = new Map<string, Set<AssignSource>>();
  for (const l of links) {
    const st = s(l.studentId), a = keysOfA.get(s(l.assignmentId));
    if (!a || (members && !members.has(st))) continue;
    for (const [k, id] of a.keys) add(out, sources, st, k, a.source, id);
  }
  out.sourcesOf = new Map([...sources].map(([k, v]) => [k, ordered(v)]));
  return out;
}

function add(out: AssignedSkills, sources: Map<string, Set<AssignSource>>, st: string, k: string, src: AssignSource, skillId: string | null): void {
  const mine = out.byStudent.get(st) ?? new Map<string, Set<AssignSource>>();
  (mine.get(k) ?? mine.set(k, new Set()).get(k)!).add(src);
  out.byStudent.set(st, mine);
  (sources.get(k) ?? sources.set(k, new Set()).get(k)!).add(src);
  if (skillId && !out.skillIdOf.has(k)) out.skillIdOf.set(k, skillId);
}

const COLS = ["id", "classId", "skillId", "skillIds", "assessmentId", "testId", "curriculumPlanId", "title", "note", "track", "program", "source", "createdAt", "deletedAt"];

/** Does a live row of Assigned assign skills? (SKILL; a sent plan's places — not the whole-grade Curriculum plan; r82: NAFS practice) Pure. */
export function countsAsAssigning(w: Pick<LiveAssigned, "kind" | "detail">): boolean {
  return w.kind === "SKILL" || w.kind === "NAFS_PRACTICE" || (w.kind === "PLAN" && s(w.detail) !== "CURRICULUM");
}

/**
 * r78 / r82: the skill work of the live rows of the Assigned page:
 *   SKILL          a skill / a set of questions sent — counted by the skill(s) the teacher CHOSE (chosen-skills.ts)
 *   PLAN           the places of a plan the teacher SENT (never the whole-grade Curriculum plan: a STUDENT opens its places)
 *   NAFS_PRACTICE  each target standard / NAFS skill, source NAFS
 * Nothing else: drafts never sent, a cancelled or removed row, and — even when listed — a test or a check.
 */
async function assignedOfWork(repo: Repo, schoolId: string, work: readonly LiveAssigned[], ix: SkillKeyIndex, members: ReadonlySet<string> | undefined, range?: { since: number | null; until: number | null }, scope?: { classIds: readonly string[]; creators?: string[] | null }): Promise<AssignedSkills> {
  const items = work.filter((w) => countsAsAssigning(w) && w.kind !== "NAFS_PRACTICE");
  const aids = [...new Set(items.flatMap((w) => w.aids))].slice(0, ASSIGNED_TAKE);
  const rows: Row[] = [];
  for (let i = 0; i < aids.length; i += 400) rows.push(...(await repo.findMany("Assignment", liveAssignmentWhere({ id: { in: aids.slice(i, i + 400) } }), { select: COLS })));
  const inRange = (at: number) => !range || ((!range.since || at >= range.since) && (!range.until || at <= range.until));
  const live = rows.filter((a) => isSkillWork(a) && inRange(ms(a.createdAt))).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const liveIds = new Set(live.map((a) => s(a.id)));
  const links = items.flatMap((w) => w.links.filter((l) => liveIds.has(s(l.assignmentId))));
  const planOf = new Map<string, string>();
  for (const w of items) if (w.kind === "PLAN") for (const aid of w.aids) planOf.set(aid, w.id);
  const chosen = await chosenSkills(repo, schoolId, live, ix, planOf);
  const out = buildAssigned(live, chosen, links, members);
  // r84: which plan each live assignment belongs to (none = a Skills Grid column) — the same chosen skills, split by origin
  const cards = await planCards(repo, items, live);
  const keysOf = (by: AssignedSkills["byStudent"]) => new Map([...by].map(([st, m]) => [st, new Set(m.keys())] as const));
  out.cols = buildAssigned(live, chosen, links.filter((l) => !cards.of.has(s(l.assignmentId))), members).byStudent;
  const plans: AssignedPlan[] = cards.list.map((c) => ({ ...c, byStudent: keysOf(buildAssigned(live, chosen, links.filter((l) => cards.of.get(s(l.assignmentId)) === c.id), members).byStudent) }));
  const sources = new Map<string, Set<AssignSource>>([...out.sourcesOf].map(([k, v]) => [k, new Set(v)]));
  const put = (m: Map<string, Set<string>>, st: string, k: string) => (m.get(st) ?? m.set(st, new Set()).get(st)!).add(k);
  // r82: NAFS adaptive practice (source NAFS): each target → a pair, for the students it reaches now
  // r84: one target → a Skills Grid column; 2 or more → a plan (its own card on the Plans tab)
  const nafs = work.filter((w) => w.kind === "NAFS_PRACTICE");
  if (nafs.length) {
    const targets = await practiceTargets(repo, nafs.map((w) => w.id));
    const used: string[] = [];
    for (const w of nafs) {
      const p = targets.get(w.id);
      if (!p || !p.targets.length || !inRange(p.createdAt)) continue;
      used.push(w.id);
      const plan: AssignedPlan | null = isNafsPlan(p.targets) ? { id: `nafs:${w.id}`, title: w.title, type: "NAFS", sentAt: p.createdAt, createdById: w.createdById, byStudent: new Map() } : null;
      for (const st of w.students) {
        if (members && !members.has(st)) continue;
        for (const t of p.targets) {
          add(out, sources, st, nafsKey(t), "NAFS", null);
          if (plan) put(plan.byStudent, st, nafsKey(t));
          else { const m = out.cols!.get(st) ?? out.cols!.set(st, new Map()).get(st)!; (m.get(nafsKey(t)) ?? m.set(nafsKey(t), new Set()).get(nafsKey(t))!).add("NAFS"); }
        }
      }
      if (plan) plans.push(plan);
    }
    out.nafsPractices = used;
  }
  // r84: the MAP Year plan sent to the class's students — a plan of source MAP (its skills, not the review weeks)
  if (scope?.classIds.length) for (const y of await yearPlans(repo, scope.classIds, scope.creators ?? null, ix)) {
    if (!inRange(y.sentAt)) continue;
    const plan: AssignedPlan = { id: y.id, title: y.title, type: "MAP", sentAt: y.sentAt, createdById: y.createdById, byStudent: new Map() };
    for (const st of y.students) {
      if (members && !members.has(st)) continue;
      for (const [k, id] of y.keys) { add(out, sources, st, k, "MAP", id); put(plan.byStudent, st, k); }
    }
    plans.push(plan);
  }
  out.sourcesOf = new Map([...sources].map(([k, v]) => [k, ordered(v)]));
  out.plans = plans.filter((p) => [...p.byStudent.values()].some((x) => x.size > 0)).sort((a, b) => b.sentAt - a.sentAt || a.title.localeCompare(b.title));
  return out;
}

const idsOf = (v: unknown): string[] => { let x: unknown = v; if (typeof v === "string") { try { x = JSON.parse(v); } catch { x = []; } } return Array.isArray(x) ? x.map(s).filter(Boolean) : []; };

/**
 * r84: the plan cards of the live skill work — assignment id → card id, and each card (title, type, sent date, who sent it):
 *   a sent SkillPlan (its places)                   → "plan:<id>"     type from its program / kind
 *   MAP study plan sets sent together               → "mapplan:<id>"  (MapPlan rows of one send: same teacher, subject, minute)
 *   a MAP plan set with no MapPlan row, a MAP group  → "asg:<id>"      type MAP
 * One read of the sent plans' rows; one bounded read of the classes' sent MAP study plans (only when a MAP plan set is live).
 */
async function planCards(repo: Repo, items: readonly LiveAssigned[], live: readonly Row[]): Promise<{ of: Map<string, string>; list: Omit<AssignedPlan, "byStudent">[] }> {
  const of = new Map<string, string>();
  const list: Omit<AssignedPlan, "byStudent">[] = [];
  const liveIds = new Set(live.map((a) => s(a.id)));
  const planItems = items.filter((w) => w.kind === "PLAN");
  if (planItems.length) {
    const meta = new Map((await repo.findMany("SkillPlan", { id: { in: planItems.map((w) => w.id) } }, { select: ["id", "program", "kind", "sentAt", "createdAt"] }).catch(() => [] as Row[])).map((p) => [s(p.id), p]));
    for (const w of planItems) {
      const m = meta.get(w.id), id = `plan:${w.id}`;
      const mine = w.aids.filter((aid) => liveIds.has(aid));
      for (const aid of mine) of.set(aid, id);
      if (mine.length) list.push({ id, title: w.title, type: planTypeOf(m?.program, m?.kind ?? w.detail), sentAt: ms(m?.sentAt) || ms(m?.createdAt) || ms(w.createdAt), createdById: w.createdById });
    }
  }
  const sets = live.filter((a) => !of.has(s(a.id)) && isMapPlanSet(a.title));
  if (!sets.length) return { of, list };
  const study = sets.filter((a) => isMapPlanSet(a.title) === "PLAN");
  const classIds = [...new Set(study.map((a) => s(a.classId)))];
  const mp = classIds.length ? await repo.findMany("MapPlan", { classId: { in: classIds }, status: "SENT" }, { select: ["id", "subject", "term", "assignmentIds", "sentAt", "createdAt", "createdById"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 2000 }).catch(() => [] as Row[]) : [];
  const want = new Set(study.map((a) => s(a.id)));
  const groups = new Map<string, { id: string; title: string; sentAt: number; createdById: string; aids: string[] }>();
  for (const p of mp) {
    const mine = idsOf(p.assignmentIds).filter((x) => want.has(x));
    if (!mine.length) continue;
    const at = ms(p.sentAt) || ms(p.createdAt);
    const g = `${s(p.createdById)}|${s(p.subject)}|${Math.floor(at / 60_000)}`;
    const cur = groups.get(g) ?? { id: `mapplan:${s(p.id)}`, title: `MAP plan · ${s(p.subject) === "LANGUAGE" ? "Language" : "Reading"}${p.term ? ` · ${s(p.term)}` : ""}`, sentAt: at, createdById: s(p.createdById), aids: [] };
    if (`mapplan:${s(p.id)}` < cur.id) cur.id = `mapplan:${s(p.id)}`;
    cur.aids.push(...mine);
    groups.set(g, cur);
  }
  for (const g of groups.values()) { for (const aid of g.aids) of.set(aid, g.id); list.push({ id: g.id, title: g.title, type: "MAP", sentAt: g.sentAt, createdById: g.createdById }); }
  for (const a of sets) if (!of.has(s(a.id))) { of.set(s(a.id), `asg:${s(a.id)}`); list.push({ id: `asg:${s(a.id)}`, title: s(a.title), type: "MAP", sentAt: ms(a.createdAt), createdById: s(a.createdById) }); }
  return { of, list };
}

const yearCache = sweptMap<string, { v: string; at: number; rows: Promise<Row[]> }>("skills.assigned.yearPlans", 2 * 60_000, 300);
/** r84: the MAP Year plans SENT to these classes' students (one row a class): its skills (not the review weeks) as keys. */
async function yearPlans(repo: Repo, classIds: readonly string[], creators: readonly string[] | null, ix: SkillKeyIndex): Promise<{ id: string; title: string; sentAt: number; createdById: string; keys: Map<string, string>; students: string[] }[]> {
  // kept in memory while no Year plan is written in this process (and at most a minute): no extra read on a warm page
  const key = [...classIds].sort().join(","), v = modelVersion("MapYearPlan"), at = Date.now();
  const mine = yearCache;
  const hit = mine.get(key);
  const rows = hit && hit.v === v && at - hit.at < 60_000 && at >= hit.at ? await hit.rows : await (() => {
    const p = repo.findMany("MapYearPlan", { classId: { in: [...classIds] } }, { select: ["id", "classId", "weeks", "sentAt", "sentById", "createdById"], take: 10 }).then((r) => r.filter((x) => x.sentAt)).catch(() => [] as Row[]);
    mine.set(key, { v, at, rows: p });
    return p;
  })();
  const out: { id: string; title: string; sentAt: number; createdById: string; keys: Map<string, string>; students: string[] }[] = [];
  for (const r of rows) {
    if (!r.sentAt) continue;
    const by = s(r.sentById) || s(r.createdById);
    if (creators && !creators.includes(by)) continue;
    let weeks: unknown = r.weeks;
    if (typeof weeks === "string") { try { weeks = JSON.parse(weeks); } catch { weeks = []; } }
    const keys = new Map<string, string>();
    for (const w of Array.isArray(weeks) ? (weeks as { skills?: { skillId?: unknown; review?: boolean }[] }[]) : []) for (const k of w?.skills ?? []) {
      if (k.review) continue;
      const key = ix.keyOf.get(s(k.skillId));
      if (key && !keys.has(key)) keys.set(key, s(k.skillId));
    }
    if (!keys.size) continue;
    const students = (await repo.findMany("ClassMembership", { classId: s(r.classId), leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
    out.push({ id: `year:${s(r.id)}`, title: "MAP Year plan", sentAt: ms(r.sentAt), createdById: by, keys, students });
  }
  return out;
}

const EMPTY = (): AssignedSkills => ({ sourcesOf: new Map(), skillIdOf: new Map(), byStudent: new Map() });

/**
 * The class's assigned skills (its current members only); r75: with dates, only the assignments made inside them (ms).
 * r82: `creators` = whose work (viewerCreators: a teacher's own Assigned page); null / absent = every teacher's.
 */
export async function classAssignedSkills(repo: Repo, classId: string, memberIds: readonly string[], ix: SkillKeyIndex, range?: { since: number | null; until: number | null }, creators?: string[] | null): Promise<AssignedSkills> {
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass) return EMPTY();
  const work = await assignedWorkOfClasses(repo, s(klass.schoolId), [classId], { kinds: SKILL_KINDS, creators });
  return assignedOfWork(repo, s(klass.schoolId), work, ix, new Set(memberIds), range, { classIds: [classId], creators });
}

/** One student's assigned skills: what is live for them on the Assigned rows of their current classes (r82: `creators`' rows). */
export async function studentAssignedSkills(repo: Repo, studentId: string, ix: SkillKeyIndex, creators?: string[] | null): Promise<AssignedSkills> {
  const [st, mem] = await Promise.all([repo.findUnique("Student", { id: studentId }), repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })]);
  if (!st || !mem.length) return EMPTY();
  const work = await assignedWorkOfClasses(repo, s(st.schoolId), mem.map((m) => s(m.classId)), { kinds: SKILL_KINDS, studentId, creators });
  return assignedOfWork(repo, s(st.schoolId), work, ix, new Set([studentId]), undefined, { classIds: mem.map((m) => s(m.classId)), creators });
}

/**
 * r82 guard: the skills LISTED on the actor's Assigned page for one class (Status = active; its own reads: assignedList),
 * by kind — SKILL rows (each the skill(s) chosen for it), the places of the PLANs listed (not the whole-grade
 * Curriculum plan), the targets of the NAFS practices listed. Tests and checks never. Student Skills' columns must be
 * exactly this set (tests/r82-assigned-skills.test.ts).
 */
export async function assignedPageSkills(repo: Repo, actor: Actor, classId: string, ix: SkillKeyIndex): Promise<{ byKind: Record<"SKILL" | "PLAN" | "NAFS_PRACTICE", Set<string>>; items: AssignedItem[]; /** r84: the Skills Grid columns by the plan rule (SKILL rows that are not MAP plan / group sets + one-target NAFS practice) */ columns: Set<string> }> {
  const v = await assignedList(repo, actor, { classId });
  const byKind = { SKILL: new Set<string>(), PLAN: new Set<string>(), NAFS_PRACTICE: new Set<string>() };
  const skillIds = v.items.filter((x) => x.kind === "SKILL").map((x) => x.id);
  const plans = v.items.filter((x) => x.kind === "PLAN" && x.detail !== "CURRICULUM");
  const items = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }, { select: ["planId", "assignmentIds"] }) : [];
  const planOf = new Map<string, string>();
  for (const it of items) for (const aid of (typeof it.assignmentIds === "string" ? JSON.parse(it.assignmentIds) : it.assignmentIds ?? []) as unknown[]) planOf.set(s(aid), s(it.planId));
  const all = [...new Set([...skillIds, ...planOf.keys()])];
  const rows: Row[] = [];
  for (let i = 0; i < all.length; i += 400) rows.push(...(await repo.findMany("Assignment", liveAssignmentWhere({ id: { in: all.slice(i, i + 400) } }), { select: COLS })));
  const work = rows.filter(isSkillWork);
  const chosen = await chosenSkills(repo, s(actor.schoolId), work, ix, planOf);
  const columns = new Set<string>();
  for (const a of work) for (const k of chosen.get(s(a.id))?.keys.keys() ?? []) {
    byKind[planOf.has(s(a.id)) ? "PLAN" : "SKILL"].add(k);
    if (!planOf.has(s(a.id)) && !isMapPlanSet(a.title)) columns.add(k);
  }
  const nafs = v.items.filter((x) => x.kind === "NAFS_PRACTICE");
  for (const p of (await practiceTargets(repo, nafs.map((x) => x.id))).values()) for (const t of p.targets) { byKind.NAFS_PRACTICE.add(nafsKey(t)); if (!isNafsPlan(p.targets)) columns.add(nafsKey(t)); }
  return { byKind, items: v.items, columns };
}
