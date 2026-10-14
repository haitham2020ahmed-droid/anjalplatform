/**
 * ⭐ Reports → Skills grid (owner r67 §6): students × skills with the five star icons, for one class. Filters: the plan
 * the skills come from (all · MAP plan · Curriculum · Year plan · custom plans) and "skills most of the class hasn't
 * mastered". A cell opens its detail (dates, questions, accuracy, reviews, the student's self-check and a mismatch).
 * Fast: a fixed number of reads whatever the size (members, names, the class's assignments, one read of every status).
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { assertCan, ForbiddenError } from "../auth/rbac";
import { readableClasses, assertClassRead } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { currentRows, historyOf, keysOfPlaceText, ms, NOT_STARTED_VIEW, skillKeyIndex, skillStatusesFor, viewOf, type StarView } from "./status";
import { classSkillGoals, MISMATCH_TEXT, selfCheckMismatch, type SkillGoal } from "./status-extras";
import { STRANDS, strandOf, type Strand } from "./my-skills";
import { schoolSkillIndex } from "../questions/skill-questions";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

export type GridPlan = "ALL" | "MAP" | "CURRICULUM" | "NAFS" | "GRAMMAR" | "YEAR" | "CUSTOM";
/** the source filter (owner r68: Curriculum · MAP · NAFS · Grammar · All; the Year plan and custom plans kept) */
export const GRID_PLANS: { key: GridPlan; label: string }[] = [
  { key: "ALL", label: "All skills" }, { key: "CURRICULUM", label: "Curriculum" }, { key: "MAP", label: "MAP plan" }, { key: "NAFS", label: "NAFS" }, { key: "GRAMMAR", label: "Grammar" },
  { key: "YEAR", label: "Year plan" }, { key: "CUSTOM", label: "Custom plans" },
];
/** students per grid page (the grid is paginated: light on a big class) */
export const GRID_PAGE = 40;
export const isStrand = (v: unknown): v is Strand => (STRANDS as readonly string[]).includes(String(v));
export const isGridPlan = (v: unknown): v is GridPlan => GRID_PLANS.some((p) => p.key === v);
/** "most of the class hasn't mastered": fewer than half of the students have ⭐ */
export const isWeakForClass = (mastered: number, total: number): boolean => total > 0 && mastered * 2 < total;

export interface GridSkill { key: string; name: string; skillId: string | null; mastered: number; started: number; total: number; strand?: Strand }
export interface GridStudent { id: string; name: string; goal: SkillGoal | null }
export interface SkillsGrid {
  classes: { id: string; name: string }[]; classId: string | null; className: string; plan: GridPlan; weakOnly: boolean;
  students: GridStudent[]; skills: GridSkill[]; cells: Record<string, Record<string, StarView>>;
  /** r68: the strand filter, and the page of students shown (GRID_PAGE a page) */
  strand?: Strand | null; page?: number; pages?: number; totalStudents?: number;
}

/** The class's skills for a plan filter: keys from its assignments (by program), its Curriculum Map plans and its Year plan. */
async function planKeys(repo: Repo, schoolId: string, classId: string, plan: GridPlan, statusKeys: Set<string>): Promise<Map<string, string | null>> {
  const ix = await skillKeyIndex(repo, schoolId);
  const out = new Map<string, string | null>();
  const add = (key: string | undefined, skillId: string | null) => { if (key && !out.has(key)) out.set(key, skillId); };
  if (plan === "ALL") for (const k of statusKeys) add(k, ix.skillsOf.get(k)?.[0] ?? null);
  if (plan !== "YEAR") {
    const as = await repo.findMany("Assignment", { classId, deletedAt: null }, { select: ["skillId", "skillIds", "program", "track", "curriculumPlanId"], take: 3000 });
    for (const a of as) {
      const ids = [...new Set([...(a.skillId ? [s(a.skillId)] : []), ...json<unknown[]>(a.skillIds, []).map(String)])].filter(Boolean);
      const prog = s(a.program) || (s(a.track) === "MAP" ? "MAP" : s(a.track) === "NAFS" ? "NAFS" : "");
      const fits = plan === "ALL" || (plan === "MAP" && prog === "MAP") || (plan === "NAFS" && prog === "NAFS") || (plan === "GRAMMAR" && s(a.track) === "GRAMMAR")
        || (plan === "CURRICULUM" && (prog === "CURRICULUM" || Boolean(a.curriculumPlanId) && !["TEST", "WEEKLY_CHECK"].includes(s(a.curriculumPlanId)))) || (plan === "CUSTOM" && !prog && !a.curriculumPlanId && s(a.track) !== "GRAMMAR");
      if (fits) for (const id of ids) add(ix.keyOf.get(id), id);
    }
  }
  if (plan === "CURRICULUM" || plan === "ALL") {
    const plans = await repo.findMany("SkillPlan", { classId, kind: "CURRICULUM" }, { select: ["id"] }).catch(() => [] as Row[]);
    if (plans.length) for (const it of await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => s(p.id)) } }, { select: ["label"] })) for (const k of keysOfPlaceText(s(it.label).split("·").pop())) add(k, ix.skillsOf.get(k)?.[0] ?? null);
  }
  if (plan === "YEAR" || plan === "ALL") {
    const y = (await repo.findMany("MapYearPlan", { classId }, { select: ["weeks"], take: 1 }).catch(() => [] as Row[]))[0];
    for (const w of json<{ skills?: { skillId: string }[] }[]>(y?.weeks, [])) for (const k of w.skills ?? []) add(ix.keyOf.get(s(k.skillId)), s(k.skillId));
  }
  // Grammar: also every grammar skill the class has a star on (practised outside an assignment)
  if (plan === "GRAMMAR") {
    const idx = await schoolSkillIndex(repo, schoolId);
    for (const k of statusKeys) { const sk = ix.skillsOf.get(k)?.[0]; const row = sk ? idx.skillOf.get(sk) ?? null : null; if (strandOf(k, row) === "GRAMMAR") add(k, sk ?? null); }
  }
  return out;
}

export async function skillsGrid(repo: Repo, actor: Actor, opts: { classId?: string | null; plan?: GridPlan; weakOnly?: boolean; strand?: Strand | null; page?: number } = {}, now = new Date()): Promise<SkillsGrid> {
  assertCan(actor, "reports:read");
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: s(c.id), name: s(c.name) }));
  const plan: GridPlan = opts.plan ?? "ALL";
  const classId = opts.classId && classes.some((c) => c.id === opts.classId) ? opts.classId : classes[0]?.id ?? null;
  const empty: SkillsGrid = { classes, classId, className: "", plan, weakOnly: Boolean(opts.weakOnly), students: [], skills: [], cells: {} };
  if (!classId) return empty;
  const klass = await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  if (!ids.length) return { ...empty, className: s(klass.name) };
  const [names, all, goals] = await Promise.all([studentNames(repo, ids), skillStatusesFor(repo, ids), classSkillGoals(repo, ids, now).catch(() => new Map<string, SkillGoal>())]);
  const statusKeys = new Set([...all.values()].flatMap((m) => [...m.keys()]));
  const keys = await planKeys(repo, s(klass.schoolId), classId, plan, statusKeys);
  const ix = await skillKeyIndex(repo, s(klass.schoolId));
  const cells: Record<string, Record<string, StarView>> = {};
  for (const id of ids) { const m = all.get(id) ?? new Map(); cells[id] = Object.fromEntries([...keys.keys()].map((k) => [k, m.get(k) ?? NOT_STARTED_VIEW(k)])); }
  const sidx = await schoolSkillIndex(repo, s(klass.schoolId));
  let skills: GridSkill[] = [...keys].map(([key, skillId]) => {
    const vs = ids.map((id) => cells[id][key]);
    const row = (skillId ?? ix.skillsOf.get(key)?.[0]) ? sidx.skillOf.get((skillId ?? ix.skillsOf.get(key)?.[0])!) ?? null : null;
    return { key, name: ix.nameOf.get(key) ?? key, skillId, mastered: vs.filter((v) => v.status === "MASTERED").length, started: vs.filter((v) => v.status !== "NOT_STARTED").length, total: ids.length, strand: strandOf(key, row) };
  });
  if (opts.strand) skills = skills.filter((k) => k.strand === opts.strand);
  if (opts.weakOnly) skills = skills.filter((k) => isWeakForClass(k.mastered, k.total)).sort((a, b) => a.mastered - b.mastered || a.name.localeCompare(b.name));
  else skills.sort((a, b) => b.started - a.started || a.name.localeCompare(b.name));
  skills = skills.slice(0, 60);
  const everyone = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student", goal: goals.get(id) ?? null })).sort((a, b) => a.name.localeCompare(b.name));
  // r68: paginated (GRID_PAGE students a page); the column counts ("12 of 20 mastered") stay for the whole class
  const pages = Math.max(1, Math.ceil(everyone.length / GRID_PAGE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(opts.page) || 1)));
  const students = everyone.slice((page - 1) * GRID_PAGE, page * GRID_PAGE);
  const shown = new Set(students.map((x) => x.id));
  for (const id of Object.keys(cells)) if (!shown.has(id)) delete cells[id];
  return { classes, classId, className: s(klass.name), plan, weakOnly: Boolean(opts.weakOnly), students, skills, cells, strand: opts.strand ?? null, page, pages, totalStudents: everyone.length };
}

export interface CellDetail {
  student: string; skill: string; key: string; view: StarView; accuracy: number | null; progressAt: string | null;
  reviews: { at: string; outcome: string; right?: number; of?: number }[]; history: { at: string; status: string; why: string }[];
  mismatch: string | null;
}
/** One cell's detail (the teacher clicked it): one read of the student's rows of that skill. */
export async function cellDetail(repo: Repo, actor: Actor, studentId: string, key: string): Promise<CellDetail | null> {
  assertCan(actor, "reports:read");
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  if (actor.role === "TEACHER") {
    const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
    const mine = new Set((await readableClasses(repo, actor)).map((c) => s(c.id)));
    if (!m.some((x) => mine.has(s(x.classId)))) throw new ForbiddenError("This student is not in your classes.");
  }
  const rows = await repo.findMany("SkillStatus", { studentId, skillKey: key });
  const r = currentRows(rows).get(key);
  const ix = await skillKeyIndex(repo, s(st.schoolId));
  const name = (await studentNames(repo, [studentId])).get(studentId)?.name ?? "Student";
  if (!r) return { student: name, skill: ix.nameOf.get(key) ?? key, key, view: NOT_STARTED_VIEW(key), accuracy: null, progressAt: null, reviews: [], history: [], mismatch: null };
  const v = viewOf(r);
  const h = rows.flatMap((x) => historyOf(x.history)).sort((a, b) => ms(a.at) - ms(b.at));
  const mm = selfCheckMismatch(v);
  return {
    student: name, skill: ix.nameOf.get(key) ?? key, key, view: v, accuracy: v.answered ? Math.round((100 * v.correct) / v.answered) : null,
    progressAt: r.progressAt ? new Date(ms(r.progressAt)).toISOString() : null,
    reviews: h.filter((x) => x.review || x.mixedFail).map((x) => ({ at: s(x.at), outcome: x.review ? s(x.review) : "MIXED_MISS", right: x.right === undefined ? undefined : Number(x.right), of: x.of === undefined ? undefined : Number(x.of) })),
    history: h.filter((x) => x.status).map((x) => ({ at: s(x.at), status: s(x.status), why: s(x.why) })),
    mismatch: mm ? MISMATCH_TEXT[mm] : null,
  };
}
