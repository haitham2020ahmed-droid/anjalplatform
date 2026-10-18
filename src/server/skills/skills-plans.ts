/**
 * 🗂️ Student Skills → "Plans" tab (owner r84: "plans make the Skills Grid too crowded"). A plan = anything sent from the
 * Plans pages (RTI / MAP / Custom / Curriculum plans, the plan editor and wizard, MAP study / group plans, the MAP Year
 * plan) and a NAFS adaptive practice on 2 or more standards / NAFS skills (assigned-skills.ts decides). Its skills are
 * NOT Skills Grid columns; each live plan of the class is one card here:
 *
 *   title · type badge · sent date · for whom (whole class / group of N / one student) · number of skills
 *   class achievement %   the mean over the plan's students of (skills mastered ÷ the plan's skills for them), on the
 *                         shared star rule (⭐ or ☆⬆; a NAFS standard: the NAFS practice's own rule, nafs-skills.ts)
 *   ⭐ finished all · ⚠️ need support · ⏳ not started · last activity · status Active / Finished
 *
 * A card opens the plan's own star grid (only its students × its skills). "Close plan" keeps a teacher-side flag in one
 * SchoolSetting row per class (closedPlansKey): the card moves to the collapsed "Finished plans" section; Reopen undoes.
 * PURE (except setPlanClosed): everything is computed from the class data read once (skills-grid.ts classSkills).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { audit } from "../audit";
import type { StarView } from "./status";
import { closedPlans, closedPlansKey, isMasteredStar, isPractised, isSupportStar, masteredPct, studentGuess, studentTrend, type ClassPlan, type ClassSkills, type GridSkill } from "./skills-grid";
import { isGuessing, type Trend } from "./skills-trend";
import type { ActionPoint } from "./skills-report";
import type { PlanType } from "./assigned-skills";

const DAY = 86_400_000;

export type PlanStatus = "ACTIVE" | "FINISHED";
/** a student in a plan: finished all its skills · needs support · not started · working on it */
export type PlanStudentState = "FINISHED" | "SUPPORT" | "NOT_STARTED" | "WORKING";
export const PLAN_RULE = "Class achievement: for each student of the plan, the skills mastered (⭐ or ☆⬆) out of the plan's skills; then the average of the students.";

export interface PlanCard {
  id: string; title: string; type: PlanType; sentAt: string; closed: boolean; status: PlanStatus;
  /** who it went to: the whole class, a group of `students`, or one student */
  scope: "class" | "group" | "student"; students: number; skills: number;
  /** class achievement (0–100) */
  pct: number;
  finished: number; support: number; notStarted: number;
  /** the newest practice on the plan's skills (ISO), null = nobody started */
  lastActivity: string | null;
}
export interface PlanStudentRow { id: string; name: string; mastered: number; of: number; pct: number; state: PlanStudentState; trend: Trend | null; guessing: boolean }
export interface PlanGridView {
  card: PlanCard;
  /** the plan's skills (in the class's column order), each counted over the plan's students it went to */
  skills: (GridSkill & { strand?: string })[];
  rows: PlanStudentRow[];
  cells: Record<string, Record<string, StarView>>;
  /** student → key → true when the skill of the plan went to that student */
  assigned: Record<string, Record<string, true>>;
}

const stateOf = (stars: readonly StarView[]): PlanStudentState =>
  stars.length && stars.every(isMasteredStar) ? "FINISHED" : stars.some(isSupportStar) ? "SUPPORT" : !stars.some(isPractised) ? "NOT_STARTED" : "WORKING";

function starsOf(d: ClassSkills, p: ClassPlan, st: string): StarView[] {
  return (p.students[st] ?? []).map((k) => d.stars[st]?.[k]).filter((v): v is StarView => Boolean(v));
}

/** Pure: one card per live plan of the class (newest first). */
export function planCards(d: ClassSkills): PlanCard[] {
  const size = d.students.length;
  const known = new Set(d.students.map((x) => x.id));
  return (d.plans ?? []).map((p) => {
    const ids = Object.keys(p.students).filter((st) => known.has(st));
    let sum = 0, finished = 0, support = 0, notStarted = 0, last = 0;
    const keys = new Set<string>();
    for (const st of ids) {
      const vs = starsOf(d, p, st);
      for (const k of p.students[st]) keys.add(k);
      sum += vs.length ? vs.filter(isMasteredStar).length / vs.length : 0;
      const state = stateOf(vs);
      if (state === "FINISHED") finished++; else if (state === "SUPPORT") support++; else if (state === "NOT_STARTED") notStarted++;
      for (const v of vs) if (isPractised(v) && v.updatedAt) last = Math.max(last, Date.parse(v.updatedAt) || 0);
    }
    const pct = ids.length ? Math.round((100 * sum) / ids.length) : 0;
    const scope: PlanCard["scope"] = ids.length === 1 && size > 1 ? "student" : ids.length >= size ? "class" : "group";
    const status: PlanStatus = p.closed || (ids.length > 0 && finished === ids.length) ? "FINISHED" : "ACTIVE";
    return { id: p.id, title: p.title, type: p.type, sentAt: p.sentAt, closed: p.closed, status, scope, students: ids.length, skills: keys.size, pct, finished, support, notStarted, lastActivity: last ? new Date(last).toISOString() : null };
  }).filter((c) => c.students > 0);
}

/** Pure: "today" / "yesterday" / "{n} days ago" (the words are interface strings; n in vars). */
export function agoOf(iso: string | null, now = new Date()): { key: string; vars?: Record<string, number> } {
  if (!iso) return { key: "Not started yet" };
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY));
  return days === 0 ? { key: "Today" } : days === 1 ? { key: "Yesterday" } : { key: "{n} days ago", vars: { n: days } };
}

/** Pure: the opened plan's star grid — only its students × its skills, "x of y · %" per student, the column counts. */
export function planGrid(d: ClassSkills, id: string): PlanGridView | null {
  const p = (d.plans ?? []).find((x) => x.id === id);
  const card = planCards(d).find((x) => x.id === id);
  if (!p || !card) return null;
  const students = d.students.filter((st) => p.students[st.id]?.length);
  const keys = new Set(students.flatMap((st) => p.students[st.id]));
  const meta = d.skills.filter((k) => keys.has(k.key));
  const cells: PlanGridView["cells"] = {}, assigned: PlanGridView["assigned"] = {};
  for (const st of students) {
    cells[st.id] = {}; assigned[st.id] = {};
    for (const k of p.students[st.id]) if (d.stars[st.id]?.[k]) { cells[st.id][k] = d.stars[st.id][k]; assigned[st.id][k] = true; }
  }
  const skills = meta.map((k) => {
    const vs = students.map((st) => cells[st.id][k.key]).filter((v): v is StarView => Boolean(v));
    const mastered = vs.filter(isMasteredStar).length, started = vs.filter(isPractised).length;
    return {
      key: k.key, name: k.name, skillId: k.skillId, strand: k.strand, code: k.code, short: k.short, sources: k.sources,
      mastered, started, total: vs.length, support: vs.filter((v) => v.needsSupport).length, review: vs.filter((v) => v.status === "NEEDS_REVIEW").length, pct: masteredPct(mastered, vs.length),
      answered: vs.reduce((n, v) => n + Number(v.answered || 0), 0), correct: vs.reduce((n, v) => n + Number(v.correct || 0), 0), notStarted: vs.length - started,
    };
  });
  const view: ClassSkills = { ...d, stars: cells };
  const rows: PlanStudentRow[] = students.map((st) => {
    const vs = Object.values(cells[st.id]);
    const mastered = vs.filter(isMasteredStar).length;
    return { id: st.id, name: st.name, mastered, of: vs.length, pct: masteredPct(mastered, vs.length), state: stateOf(vs), trend: studentTrend(view, st.id)?.trend ?? null, guessing: isGuessing(studentGuess(view, st.id)) };
  });
  return { card, skills, rows, cells, assigned };
}

export interface PlanLinks { skill: (key: string) => string; plan: (studentIds: string[]) => string; student: (id: string) => string; assigned: string }

/**
 * Pure: the opened plan's action plan (≤ 4 points, each with a button to an existing page): who has not started →
 * follow up; the weakest skill → reteach; students needing support → a small group; finished → the next level.
 */
export function planActions(v: PlanGridView, links: PlanLinks): ActionPoint[] {
  const names = (list: { name: string }[], max = 4) => list.slice(0, max).map((x) => x.name).join(", ") + (list.length > max ? ` +${list.length - max}` : "");
  const out: ActionPoint[] = [];
  const idle = v.rows.filter((r) => r.state === "NOT_STARTED");
  if (idle.length) out.push({ kind: "FOLLOW_UP", text: "Follow up ({n}): {names} have not started this plan.", vars: { n: idle.length, names: names(idle) }, href: idle.length === 1 ? links.student(idle[0].id) : links.assigned, button: idle.length === 1 ? "Open the student" : "Open Assigned" });
  const weak = [...v.skills].filter((k) => k.total > 0 && k.mastered < k.total).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.total - a.total || a.name.localeCompare(b.name))[0];
  if (weak) out.push({ kind: "RETEACH", text: "Reteach {skill}: {n} of {total} students of this plan have not mastered it.", vars: { skill: weak.name, n: weak.total - weak.mastered, total: weak.total }, href: links.skill(weak.key), button: "Reteach" });
  const help = v.rows.filter((r) => r.state === "SUPPORT");
  if (help.length) out.push({ kind: "SMALL_GROUP", text: "Small group for {names}: they need support in this plan.", vars: { names: names(help) }, href: links.plan(help.map((x) => x.id)), button: "Create small group" });
  const done = v.rows.filter((r) => r.state === "FINISHED");
  if (done.length) out.push({ kind: "NEXT_LEVEL", text: "Move to the next level ({n}): {names} finished every skill of this plan.", vars: { n: done.length, names: names(done) }, href: links.plan(done.map((x) => x.id)), button: "Create Plan" });
  return out.slice(0, 4);
}

/** "Close plan" (closed = true) or "Reopen" (false): a teacher-side flag, one SchoolSetting row per class. Nothing else changes. */
export async function setPlanClosed(repo: Repo, actor: Actor, classId: string, planId: string, closed: boolean, now = new Date()): Promise<void> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const id = String(planId ?? "").trim();
  if (!/^(plan|mapplan|asg|nafs|year):[\w-]{1,64}$/.test(id)) throw new ValidationError("Choose a plan.");
  const schoolId = String(klass.schoolId);
  const cur = await closedPlans(repo, schoolId, classId);
  if (closed) cur[id] = now.toISOString(); else delete cur[id];
  // bounded: the newest 300 closed plans of the class
  const value = Object.fromEntries(Object.entries(cur).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 300));
  await repo.upsert("SchoolSetting", { schoolId, key: closedPlansKey(classId) }, { schoolId, key: closedPlansKey(classId), value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: closed ? "skills.plan.close" : "skills.plan.reopen", entityType: "Class", entityId: classId, after: { planId: id }, at: now }).catch(() => undefined);
}
