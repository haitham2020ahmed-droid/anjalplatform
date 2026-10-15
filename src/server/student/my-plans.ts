/**
 * 📋 r82 (owner): the student's Plans page — "any plan the teacher makes and sends to the student goes there,
 * organised by type". Every LIVE plan sent to THIS student (their class, a group they are in, or only them):
 *
 *   Curriculum Map   plans from the Curriculum Map (unit / places / full curriculum plan) + the Full curriculum map
 *                    PDF the teacher sent (r79)
 *   MAP plan         MAP plans from the plan pages, the per-student MAP plans (MapPlan) and the class's MAP Year plan
 *   Custom plan      the teacher's own plans
 *   Extra practice   RTI plans — shown to students as "Extra practice plan", never "RTI" / "Tier" / level words
 *   NAFS plan        NAFS plans + the NAFS adaptive practices (from the NAFS Suggested plan)
 *   Other            anything else
 *
 * Only live plans (r78 cancel rules): drafts, paused and withdrawn plans, cancelled plans / parts (AssignmentCancel)
 * and removed work never show. Progress: "x of y done" — a part is done when its work is completed, or (the shared
 * star rule of My Skills / the Year plan) when the student mastered its skill. "Continue" opens the next step.
 *
 * Light: one read per source, all batched (the student's classes, their plans and items, their own links, the
 * assignments, the star statuses of the plans' skills, the teachers' names), whatever the number of plans.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { safeIfBehind } from "../db/schema-errors";
import { hideLevels } from "../../lib/hide-levels";
import { hiddenWorkKeys, placeCancelled } from "./cancelled-work";
import { visibleToStudents } from "../curriculum-map/plans";
import { isProgram, programOfPlanKind } from "../plans/program";
import { statusesOfSkills } from "../skills/status";
import { curriculumMapPdfHref, sharedMapGradesForStudent } from "../curriculum-map/map-pdf";
import { studentYearPlan } from "../map/year-plan-share";

const s = (v: unknown) => String(v ?? "");
const json = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };
const ids = (v: unknown): string[] => { const a = json(v); return Array.isArray(a) ? a.map(s).filter(Boolean) : []; };
const ms = (v: unknown): number => { if (!v) return 0; const t = v instanceof Date ? v.getTime() : Date.parse(s(v)); return Number.isFinite(t) ? t : 0; };
const day = (v: unknown): string | null => (ms(v) ? new Date(ms(v)).toISOString().slice(0, 10) : null);

export type StudentPlanType = "CURRICULUM" | "MAP" | "CUSTOM" | "RTI" | "NAFS" | "OTHER";
/** the page's order of the groups */
export const STUDENT_PLAN_TYPES: readonly StudentPlanType[] = ["CURRICULUM", "MAP", "CUSTOM", "RTI", "NAFS", "OTHER"];
/** What the student reads for each type (EN source strings; never "RTI" / "Tier"). */
export const STUDENT_PLAN_LABEL: Record<StudentPlanType, string> = {
  CURRICULUM: "Curriculum Map", MAP: "MAP plan", CUSTOM: "Custom plan", RTI: "Extra practice plan", NAFS: "NAFS plan", OTHER: "Other plans",
};
export const STUDENT_PLAN_ICON: Record<StudentPlanType, string> = { CURRICULUM: "🧭", MAP: "🗺️", CUSTOM: "✏️", RTI: "💪", NAFS: "🇸🇦", OTHER: "📋" };

export interface StudentPlanCard {
  key: string;
  type: StudentPlanType;
  /** the title: a UI string to translate when `tr` (with `vars`), else the teacher's own words */
  title: string;
  tr?: boolean;
  vars?: Record<string, string | number>;
  /** shown after the title, as is (a class name, a MAP term) */
  suffix?: string | null;
  teacher: string | null;
  /** when it was sent (YYYY-MM-DD) */
  date: string | null;
  dueAt: string | null;
  done: number;
  total: number;
  /** the next step (null when everything is done: then `href` opens the plan) */
  continueHref: string | null;
  /** the plan itself */
  href: string;
  /** a downloadable / printable PDF of the plan, when there is one */
  pdfHref: string | null;
}
export interface StudentPlanGroup { type: StudentPlanType; label: string; icon: string; plans: StudentPlanCard[] }

/**
 * A plan title as the student reads it: no level words (hideLevels), and an RTI / Support plan's own words replaced
 * ("RTI Plan · 4A" → "Extra practice plan · 4A"; "Tier 2" never shown).
 */
export function studentPlanTitle(title: string): string {
  const t = hideLevels(title)
    .replace(/\b(?:RTI|Support)\s+Plan\b/gi, "Extra practice plan")
    .replace(/\s*[·•|:-]?\s*\bTier\s*[123]\b/gi, "")
    .replace(/\bRTI\b/g, "Extra practice")
    .replace(/\s{2,}/g, " ").replace(/^[\s·•|:-]+|[\s·•|:-]+$/g, "").trim();
  return t || "Extra practice plan";
}

/** The type of a SkillPlan (its program; older rows: from the kind). */
export function planTypeOfRow(p: Row): StudentPlanType {
  const kind = s(p.kind);
  const prog = isProgram(p.program) ? p.program : null;
  if (prog) return prog;
  if (kind === "CUSTOM") return "CUSTOM";
  if (["MAP", "RTI", "NAFS"].includes(kind)) return kind as StudentPlanType;
  if (["CURRICULUM", "UNIT", "PLACES"].includes(kind)) return "CURRICULUM";
  return programOfPlanKind(kind) === null ? "CUSTOM" : "OTHER";
}

/** A plan's default title ("RTI Plan · 4A") → the student's words for its type + the class; else the title as is. */
export function cardTitle(title: string, type: StudentPlanType): Pick<StudentPlanCard, "title" | "tr" | "suffix"> {
  const m = /^(?:MAP|RTI|NAFS|Curriculum|Custom|Support) Plan\s*·\s*(.+)$/i.exec(title.trim());
  if (m) return { title: STUDENT_PLAN_LABEL[type], tr: true, suffix: hideLevels(m[1]) };
  return { title: type === "RTI" ? studentPlanTitle(title) : hideLevels(title), tr: false };
}

/** Every live plan sent to this student, grouped by type (groups with no plan are left out). */
export async function studentPlans(repo: Repo, actor: Actor, opts: { lang?: "en" | "ar" } = {}, now = new Date()): Promise<StudentPlanGroup[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const sid = actor.studentId;
  const st = await repo.findUnique("Student", { id: sid });
  const schoolId = s(st?.schoolId ?? actor.schoolId);
  const classIds = (await repo.findMany("ClassMembership", { studentId: sid, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
  const [plans0, mapPlans, practices, hidden, sharedMaps, year] = await Promise.all([
    classIds.length ? safeIfBehind("student.plans", () => repo.findMany("SkillPlan", { classId: { in: classIds } }, { select: ["id", "title", "kind", "program", "status", "classId", "createdById", "createdAt", "sentAt", "dueAt"] }), [] as Row[]) : Promise.resolve([] as Row[]),
    safeIfBehind("student.plans.map", () => repo.findMany("MapPlan", { studentId: sid, status: "SENT" }, { select: ["id", "subject", "term", "items", "assignmentIds", "dueAt", "sentAt", "createdById", "createdAt"], take: 50 }), [] as Row[]),
    classIds.length ? safeIfBehind("student.plans.nafs", () => repo.findMany("NafsPractice", { classId: { in: classIds }, deletedAt: null }, { select: ["id", "title", "studentIds", "dueAt", "createdAt", "createdById"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 }), [] as Row[]) : Promise.resolve([] as Row[]),
    hiddenWorkKeys(repo, sid, schoolId).catch(() => new Set<string>()),
    sharedMapGradesForStudent(repo, actor).catch(() => [] as number[]),
    safeIfBehind("student.plans.year", () => studentYearPlan(repo, actor, {}, now), null),
  ]);
  // live plans only: sent (never a draft, paused or withdrawn one), not cancelled as a whole
  const plans = plans0.filter((p) => visibleToStudents(p) && !hidden.has(`plan:${s(p.id)}`));
  const items = plans.length ? await repo.findMany("SkillPlanItem", { planId: { in: plans.map((p) => p.id) } }, { select: ["id", "planId", "label", "assignmentIds", "order"] }) : [];
  const mapAids = mapPlans.flatMap((m) => ids(m.assignmentIds));
  const allAids = [...new Set([...items.flatMap((i) => ids(i.assignmentIds)), ...mapAids])];
  const myPractices = practices.filter((p) => { const who = ids(p.studentIds); return (!who.length || who.includes(sid)) && !hidden.has(`nafs_practice:${s(p.id)}`); });
  const [links, assignments, runs] = await Promise.all([
    allAids.length ? repo.findMany("AssignmentStudent", { studentId: sid, assignmentId: { in: allAids } }, { select: ["assignmentId", "status"] }) : Promise.resolve([] as Row[]),
    allAids.length ? repo.findMany("Assignment", { id: { in: allAids } }, { select: ["id", "skillId", "deletedAt", "startAt", "dueAt"] }) : Promise.resolve([] as Row[]),
    myPractices.length ? safeIfBehind("student.plans.nafs.runs", () => repo.findMany("NafsPracticeRun", { practiceId: { in: myPractices.map((p) => s(p.id)) }, studentId: sid }, { select: ["practiceId", "finishedAt"] }), [] as Row[]) : Promise.resolve([] as Row[]),
  ]);
  const statusOf = new Map(links.map((l) => [s(l.assignmentId), s(l.status)]));
  const aRow = new Map(assignments.map((a) => [s(a.id), a]));
  /** an assignment of mine that is live now (not removed, not cancelled for me, started) */
  const liveMine = (aid: string) => { const a = aRow.get(aid); return statusOf.has(aid) && !!a && !a.deletedAt && !hidden.has(aid) && !(ms(a.startAt) > now.getTime()); };
  // the shared star rule: a part is done when its skill is mastered (My Skills / Year plan), or its work is completed
  const skillIds = [...new Set(assignments.map((a) => s(a.skillId)).filter(Boolean))];
  const stars = skillIds.length ? (await statusesOfSkills(repo, schoolId, [sid], skillIds).catch(() => new Map())).get(sid) ?? new Map() : new Map();
  const mastered = (skillId: string) => stars.get(skillId)?.status === "MASTERED";
  const doneAid = (aid: string) => statusOf.get(aid) === "COMPLETED" || mastered(s(aRow.get(aid)?.skillId));
  const workHref = (aid: string) => { const a = aRow.get(aid); return a?.skillId ? `/practice/${encodeURIComponent(s(a.skillId))}` : `/quiz/${encodeURIComponent(aid)}`; };
  // the teachers' names (createdById = their user id)
  const userIds = [...new Set([...plans.map((p) => s(p.createdById)), ...mapPlans.map((m) => s(m.createdById))].filter(Boolean))];
  const teacherRows = myPractices.length ? await repo.findMany("Teacher", { id: { in: [...new Set(myPractices.map((p) => s(p.createdById)))] } }, { select: ["id", "userId"] }) : [];
  const users = userIds.length || teacherRows.length ? await repo.findMany("User", { id: { in: [...new Set([...userIds, ...teacherRows.map((t) => s(t.userId))])] } }, { select: ["id", "displayName"] }) : [];
  const nameOfUser = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const nameOfTeacher = (id: string) => nameOfUser.get(s(teacherRows.find((t) => s(t.id) === id || s(t.userId) === id)?.userId ?? id)) ?? null;

  const cards: StudentPlanCard[] = [];
  for (const p of plans) {
    const curriculum = s(p.kind) === "CURRICULUM";
    const mine = items.filter((i) => s(i.planId) === s(p.id)).sort((a, b) => Number(a.order) - Number(b.order))
      .filter((i) => { const a = ids(i.assignmentIds); return !placeCancelled(a, a.filter((x) => statusOf.has(x)), hidden); })
      .filter((i) => curriculum || ids(i.assignmentIds).some(liveMine));
    if (!mine.length) continue;
    const done = mine.filter((i) => ids(i.assignmentIds).filter((x) => statusOf.has(x)).some(doneAid)).length;
    const next = mine.find((i) => !ids(i.assignmentIds).filter((x) => statusOf.has(x)).some(doneAid));
    const href = curriculum ? `/student/curriculum?plan=${encodeURIComponent(s(p.id))}` : `/student/plans/${encodeURIComponent(s(p.id))}`;
    const type = planTypeOfRow(p);
    cards.push({
      key: `plan:${s(p.id)}`, type, ...cardTitle(s(p.title), type), teacher: nameOfUser.get(s(p.createdById)) ?? null,
      date: day(p.sentAt ?? p.createdAt), dueAt: day(p.dueAt), done, total: mine.length,
      continueHref: next ? `/student/plans/${encodeURIComponent(s(p.id))}/open/${encodeURIComponent(s(next.id))}` : null, href,
      pdfHref: `/student/plans/${encodeURIComponent(s(p.id))}?print=1`,
    });
  }
  // MAP plans for me (Reading / Language Usage): their work, the newest per subject first
  for (const m of [...mapPlans].sort((a, b) => ms(b.sentAt) - ms(a.sentAt))) {
    const aids = ids(m.assignmentIds).filter((x) => aRow.has(x));
    const live = aids.filter(liveMine);
    if (aids.length && !live.length) continue; // every part cancelled / removed
    const areas = (Array.isArray(json(m.items)) ? (json(m.items) as Row[]) : []);
    const total = live.length || areas.length;
    const done = live.filter(doneAid).length;
    const next = live.find((x) => !doneAid(x));
    cards.push({
      key: `mapplan:${s(m.id)}`, type: "MAP", title: s(m.subject) === "LANGUAGE" ? "Language Usage" : "Reading", tr: true, suffix: s(m.term), teacher: nameOfUser.get(s(m.createdById)) ?? null,
      date: day(m.sentAt ?? m.createdAt), dueAt: day(m.dueAt), done, total, continueHref: next ? workHref(next) : null, href: "/student/map",
      pdfHref: `/map-plan/${encodeURIComponent(s(m.id))}?print=1`,
    });
  }
  // the class's MAP Year plan (once the teacher sent it)
  if (year && year.total > 0) {
    const next = year.weeks.find((w) => w.current)?.skills.find((k) => k.status !== "MASTERED") ?? year.weeks.flatMap((w) => w.skills).find((k) => k.status !== "MASTERED");
    cards.push({ key: `year:${year.classId}`, type: "MAP", title: "Year plan", tr: true, teacher: null, date: day(year.sentAt), dueAt: null, done: year.mastered, total: year.total, continueHref: next?.href ?? null, href: "/student/map?tab=year", pdfHref: null });
  }
  // the Full curriculum map my teacher sent (r79): a PDF with every skill clickable
  for (const g of sharedMaps) {
    cards.push({ key: `map-pdf:${g}`, type: "CURRICULUM", title: "Full curriculum map · Grade {n}", tr: true, vars: { n: g }, teacher: null, date: null, dueAt: null, done: 0, total: 0, continueHref: "/student/curriculum", href: "/student/curriculum", pdfHref: curriculumMapPdfHref(g, "student", opts.lang ?? "en") });
  }
  // NAFS adaptive practices given to me (the NAFS Suggested plan's practices)
  for (const p of myPractices) {
    const finished = runs.some((r) => s(r.practiceId) === s(p.id) && r.finishedAt);
    cards.push({
      key: `nafs:${s(p.id)}`, type: "NAFS", title: hideLevels(s(p.title)), teacher: nameOfTeacher(s(p.createdById)), date: day(p.createdAt), dueAt: day(p.dueAt),
      done: finished ? 1 : 0, total: 1, continueHref: finished ? null : `/student/nafs/practice/${encodeURIComponent(s(p.id))}`, href: "/student/nafs", pdfHref: null,
    });
  }
  return STUDENT_PLAN_TYPES.map((type) => ({
    type, label: STUDENT_PLAN_LABEL[type], icon: STUDENT_PLAN_ICON[type],
    plans: cards.filter((c) => c.type === type).sort((a, b) => s(b.date).localeCompare(s(a.date)) || a.title.localeCompare(b.title)),
  })).filter((g) => g.plans.length > 0);
}
