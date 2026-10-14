/**
 * 🗓️ MAP Year plan (owner r67): one class, 40 school weeks, 2–3 skills a week — the skills the class's students SHARE
 * as needs, taught that week and practised on the platform. COVERAGE is the priority: every shared need that suits the
 * class's level is in the plan.
 *
 * How the skills are chosen (classNeeds → chooseYearSkills):
 *   1. each student with MAP scores, in each goal area of Reading and Language Usage: their area RIT (else their
 *      overall RIT) → the skills of the Reinforce band (the band below) and the Develop band (their own band) of the
 *      MAP Learning Continuum, linked to the platform's skills by CCSS code; a goal area without continuum statements:
 *      the grade's skills whose questions sit in those two bands (the skill's median question RIT);
 *   2. a skill is SHARED when most of the tested students need it: at least half of them and never fewer than 3
 *      (a class of 1–2 tested students: all of them) — a skill only one or two students need is never in the plan;
 *   3. a skill SUITS the class when its RIT lies inside the class's RIT range in that goal area (10th–90th percentile
 *      of the students' RITs) widened by one RIT band — nothing far above or below the class;
 *   4. only the grade's own skills that have questions (the curriculum's skills: practice is possible at once).
 * How they are ordered (orderYearSkills): foundational first — lower skill RIT first inside every goal area — and the
 * goal areas mixed: the next skill comes from another area than the one before when its RIT is within MIX_RIT of the
 * lowest one left; ties go to the class's most common weak (FOCUS) area, then the curriculum order.
 * How they are spread (spreadWeeks): 40 weeks of 2 skills; when there are more than 80 shared needs, the extra ones
 * make 3-skill weeks spread evenly over the year (up to 120); with fewer than 80, the new skills are spread over the
 * year and every week is filled to 2 with a review of a skill taught before (spiral review).
 *
 * The teacher moves / swaps / replaces / adds / removes skills and can make the plan again; ☆ assigns a skill
 * (src/server/assign/star.ts). The admin (and a coordinator) sees every class's plan, read-only.
 */
import { statusesOfSkills } from "../skills/status";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { classMembers } from "../insights/student-data";
import { safeIfBehind } from "../db/schema-errors";
import { bandSettings, groupOf, groupPools, GROUPS, mapProfiles, ritBand, type GroupKey, type Subject } from "./map-plan";
import { continuumFor, continuumIndex, groupOfGoal, hasContinuum } from "./continuum";
import { masterSkills } from "../skills/master";
import { lessonCatalog } from "../learn/files";
import { learnSkills, matchSkills } from "../learn/match";
import { hiddenCodes } from "../learn/edits";
import { endOfSchoolWeek, starAssign, starredSkills } from "../assign/star";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;
export const WEEKS = 40;
export const PER_WEEK = 2;
export const MAX_AUTO_PER_WEEK = 3;
/** the teacher may add more to a week, up to this */
export const MAX_PER_WEEK = 6;
/** a skill is shared when at least this share of the tested students need it (and at least MIN_STUDENTS) */
export const SHARE = 0.5;
export const MIN_STUDENTS = 3;
/** the next skill comes from another goal area when it is at most this many RIT above the lowest one left */
export const MIX_RIT = 5;

// ------------------------------------------------------------------ types

export interface Need {
  skillId: string; code: string; name: string; group: GroupKey; subject: Subject;
  /** students who need it · students tested in that subject */
  need: number; of: number;
  /** the skill's RIT (median of its questions) */
  rit: number;
  /** curriculum order (Skill.sequence) */
  seq: number;
  shared: boolean; suitable: boolean;
}
export interface YearSkill { skillId: string; code: string; name: string; group: GroupKey; need: number; of: number; rit: number; review?: boolean; added?: boolean }
export interface YearWeek { week: number; skills: YearSkill[] }
export interface ClassNeeds { needs: Need[]; tested: Record<Subject, number>; students: number; ranges: Partial<Record<GroupKey, { low: number; high: number; median: number }>>; weakAreas: GroupKey[]; medianRit: Partial<Record<Subject, number>> }

// ------------------------------------------------------------------ pure parts (tested directly)

/** Shared: most of the tested students (≥ half, ≥ 3; 1–2 tested → all). */
export function isShared(need: number, of: number): boolean {
  if (of <= 0) return false;
  if (of < MIN_STUDENTS) return need >= of;
  return need >= Math.max(MIN_STUDENTS, Math.ceil(of * SHARE));
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
/** The class's RIT range of a goal area: 10th–90th percentile of its students' RITs (and the median). */
export function ritRange(rits: number[]): { low: number; high: number; median: number } | null {
  if (!rits.length) return null;
  const a = [...rits].sort((x, y) => x - y);
  return { low: pct(a, 0.1), high: pct(a, 0.9), median: pct(a, 0.5) };
}

/** The skills of the year: shared AND suitable; at most WEEKS × MAX_AUTO_PER_WEEK (the most shared kept first). */
export function chooseYearSkills(needs: Need[]): { chosen: Need[]; leftOut: number } {
  const ok = needs.filter((n) => n.shared && n.suitable);
  const cap = WEEKS * MAX_AUTO_PER_WEEK;
  if (ok.length <= cap) return { chosen: ok, leftOut: 0 };
  const kept = [...ok].sort((a, b) => b.need / Math.max(1, b.of) - a.need / Math.max(1, a.of) || a.rit - b.rit || a.name.localeCompare(b.name)).slice(0, cap);
  return { chosen: kept, leftOut: ok.length - cap };
}

/** Foundational first (lower RIT inside every area), goal areas mixed (see the header). */
export function orderYearSkills<T extends { group: GroupKey; rit: number; seq?: number; name: string }>(list: T[], weakAreas: GroupKey[] = []): T[] {
  const rank = (g: GroupKey) => { const i = weakAreas.indexOf(g); return i < 0 ? weakAreas.length + GROUPS.findIndex((x) => x.key === g) : i; };
  const queues = new Map<GroupKey, T[]>();
  for (const k of list) queues.set(k.group, [...(queues.get(k.group) ?? []), k]);
  for (const q of queues.values()) q.sort((a, b) => a.rit - b.rit || (a.seq ?? 0) - (b.seq ?? 0) || a.name.localeCompare(b.name));
  const out: T[] = [];
  let last: GroupKey | null = null;
  while (out.length < list.length) {
    const heads = [...queues.entries()].filter(([, q]) => q.length).map(([g, q]) => ({ g, k: q[0] }));
    heads.sort((a, b) => a.k.rit - b.k.rit || rank(a.g) - rank(b.g) || (a.k.seq ?? 0) - (b.k.seq ?? 0));
    const low = heads[0];
    const other = heads.find((h) => h.g !== last && h.k.rit <= low.k.rit + MIX_RIT);
    const pick = other ?? low;
    out.push(queues.get(pick.g)!.shift()!);
    last = pick.g;
  }
  return out;
}

const toYear = (n: Need | YearSkill, extra: Partial<YearSkill> = {}): YearSkill => ({ skillId: n.skillId, code: n.code, name: n.name, group: n.group, need: n.need, of: n.of, rit: n.rit, ...extra });
/** how many of `total` items go to slot i of `slots` (as evenly as possible) */
const share = (total: number, slots: number, i: number) => Math.floor(((i + 1) * total) / slots) - Math.floor((i * total) / slots);

/** 40 weeks of 2 skills (3 when needed to cover every shared need; see the header). */
export function spreadWeeks(ordered: (Need | YearSkill)[], weeks = WEEKS): YearWeek[] {
  const out: YearWeek[] = Array.from({ length: weeks }, (_, i) => ({ week: i + 1, skills: [] }));
  const n = ordered.length;
  if (!n) return out;
  if (n >= weeks * PER_WEEK) {
    const extra = Math.min(n - weeks * PER_WEEK, weeks * (MAX_AUTO_PER_WEEK - PER_WEEK));
    let at = 0;
    for (let w = 0; w < weeks; w++) { const k = PER_WEEK + share(extra, weeks, w); out[w].skills = ordered.slice(at, at + k).map((x) => toYear(x)); at += k; }
    return out;
  }
  // fewer than 80: week 1 starts with two new skills, the rest spread over the year; every week filled with review
  const first = Math.min(PER_WEEK, n);
  const rest = n - first;
  let at = 0;
  const taught: (Need | YearSkill)[] = [];
  let cursor = 0;
  for (let w = 0; w < weeks; w++) {
    const k = w === 0 ? first : share(rest, weeks - 1, w - 1);
    const fresh = ordered.slice(at, at + k); at += k;
    out[w].skills = fresh.map((x) => toYear(x));
    taught.push(...fresh);
    // spiral review: the skills taught longest ago come back first, never twice in one week
    for (let guard = 0; out[w].skills.length < PER_WEEK && guard < taught.length; guard++) {
      const pick = taught[cursor % taught.length]; cursor++;
      if (out[w].skills.some((x) => x.skillId === pick.skillId)) continue;
      out[w].skills.push(toYear(pick, { review: true }));
    }
  }
  return out;
}

/** The plan's week dates: Sunday → Thursday (Riyadh). */
export function weekDates(start: Date, week: number): { from: string; to: string } {
  const from = new Date(start.getTime() + (week - 1) * 7 * DAY);
  return { from: new Date(from.getTime() + RIYADH).toISOString().slice(0, 10), to: new Date(from.getTime() + RIYADH + 4 * DAY).toISOString().slice(0, 10) };
}

/** The first Sunday (Riyadh midnight) on or after the date. */
export function firstSunday(d: Date): Date {
  const local = new Date(d.getTime() + RIYADH);
  const mid = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const dow = new Date(mid).getUTCDay();
  return new Date(mid + ((7 - dow) % 7) * DAY - RIYADH);
}

// ------------------------------------------------------------------ the class's needs (database)

const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; };

/** Every skill any tested student of the class needs, with how many need it, its RIT and whether it is shared / suitable. */
export async function classNeeds(repo: Repo, schoolId: string, classId: string, grade: number): Promise<ClassNeeds> {
  const ids = await classMembers(repo, classId);
  const [pk, bands] = await Promise.all([groupPools(repo, schoolId, grade), bandSettings(repo, schoolId)]);
  // each skill's RIT: the median of its questions' RITs
  const ritsOf = new Map<string, number[]>();
  for (const list of pk.pools.values()) for (const q of list) ritsOf.set(q.skillId, [...(ritsOf.get(q.skillId) ?? []), q.rit]);
  const skillRit = new Map([...ritsOf].map(([k, v]) => [k, median(v)]));
  const counts = new Map<string, number>();
  const tested: Record<Subject, number> = { READING: 0, LANGUAGE: 0 };
  const areaRits = new Map<GroupKey, number[]>();
  const focus = new Map<GroupKey, number>();
  const medianRit: Partial<Record<Subject, number>> = {};
  for (const subject of ["READING", "LANGUAGE"] as const) {
    const profiles = await mapProfiles(repo, schoolId, ids, subject);
    const ix = (await hasContinuum(repo, subject)) ? await continuumIndex(repo, schoolId, grade, subject) : null;
    const withScores = ids.filter((id) => profiles.get(id)?.overall);
    tested[subject] = withScores.length;
    if (withScores.length) medianRit[subject] = median(withScores.map((id) => profiles.get(id)!.overall!.rit));
    for (const id of withScores) {
      const p = profiles.get(id)!;
      for (const g of GROUPS.filter((x) => x.subject === subject)) {
        const a = p.areas.find((x) => x.group === g.key);
        const rit = a?.rit ?? p.overall!.rit;
        areaRits.set(g.key, [...(areaRits.get(g.key) ?? []), rit]);
        if (a?.status === "FOCUS") focus.set(g.key, (focus.get(g.key) ?? 0) + 1);
        const mine = new Set<string>();
        if (ix && ix.rows.some((r) => groupOfGoal(s(r.goalArea)) === g.key)) {
          const v = continuumFor(ix, g.key, rit);
          for (const st of [v.reinforce, v.develop]) for (const x of st?.statements ?? []) for (const k of x.skills) if (pk.skills.has(k.id)) mine.add(k.id);
        }
        if (!mine.size) {
          // no continuum for this area: the grade's skills whose questions sit in the Reinforce + Develop bands
          const b = ritBand(rit, bands);
          for (const k of pk.skills.values()) {
            if (k.group !== g.key) continue;
            const r = skillRit.get(k.id);
            if (r !== undefined && r >= b.low - bands.size && r <= b.high) mine.add(k.id);
          }
        }
        for (const k of mine) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  const ranges: ClassNeeds["ranges"] = {};
  for (const [g, rits] of areaRits) { const r = ritRange(rits); if (r) ranges[g] = r; }
  const skillRows = counts.size ? await repo.findMany("Skill", { id: { in: [...counts.keys()] } }, { select: ["id", "code", "name", "sequence"] }) : [];
  const rowOf = new Map(skillRows.map((r) => [s(r.id), r]));
  const needs: Need[] = [];
  for (const [id, need] of counts) {
    const k = pk.skills.get(id);
    if (!k) continue;
    const subject = groupOf(k.group).subject;
    const of = tested[subject];
    const rit = skillRit.get(id) ?? ranges[k.group]?.median ?? 200;
    const range = ranges[k.group];
    const suitable = Boolean(range) && rit >= range!.low - bands.size && rit <= range!.high + bands.size;
    needs.push({ skillId: id, code: s(rowOf.get(id)?.code), name: k.name, group: k.group, subject, need, of, rit, seq: Number(rowOf.get(id)?.sequence ?? 0), shared: isShared(need, of), suitable });
  }
  needs.sort((a, b) => b.need - a.need || a.rit - b.rit || a.name.localeCompare(b.name));
  const weakAreas = [...focus].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  return { needs, tested, students: ids.length, ranges, weakAreas, medianRit };
}

/** Builds the 40 weeks from the class's needs. */
export function buildYearWeeks(c: Pick<ClassNeeds, "needs" | "weakAreas">): { weeks: YearWeek[]; chosen: number; leftOut: number } {
  const { chosen, leftOut } = chooseYearSkills(c.needs);
  return { weeks: spreadWeeks(orderYearSkills(chosen, c.weakAreas)), chosen: chosen.length, leftOut };
}

// ------------------------------------------------------------------ the saved plan

async function classAndGrade(repo: Repo, actor: Actor, classId: string): Promise<{ klass: Row; grade: number; canEdit: boolean }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  let canEdit = actor.role === "TEACHER";
  if (canEdit) { try { await assertClassAccess(repo, actor, classId); } catch { canEdit = false; } }
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  return { klass, grade, canEdit };
}

/** The class's school year start: the first Sunday on or after its academic year's start (else 1 September). */
async function yearStart(repo: Repo, klass: Row, now: Date): Promise<Date> {
  const y = klass.academicYearId ? await repo.findUnique("AcademicYear", { id: klass.academicYearId }) : null;
  if (y?.startDate) return firstSunday(new Date(y.startDate instanceof Date ? y.startDate.toISOString() : s(y.startDate)));
  const yr = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return firstSunday(new Date(Date.UTC(yr, 8, 1)));
}

const json = <T,>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

async function makePlan(repo: Repo, actor: Actor, klass: Row, grade: number, now: Date): Promise<{ weeks: YearWeek[]; needs: Need[]; startDate: Date; notes: string[] }> {
  const c = await classNeeds(repo, actor.schoolId!, s(klass.id), grade);
  const built = buildYearWeeks(c);
  const notes: string[] = [];
  if (!c.tested.READING && !c.tested.LANGUAGE) notes.push("No MAP scores yet for this class: enter or import them, then make the plan again.");
  else if (!built.chosen) notes.push("No skill is shared by most of the class yet.");
  if (built.leftOut) notes.push(`${built.leftOut} more shared skill(s) did not fit in 40 weeks of 3: add them to a week by hand.`);
  return { weeks: built.weeks, needs: c.needs, startDate: await yearStart(repo, klass, now), notes };
}

async function savedRow(repo: Repo, classId: string): Promise<Row | null> {
  return safeIfBehind("map.year-plan", async () => (await repo.findMany("MapYearPlan", { classId }, { take: 1 }))[0] ?? null, null);
}

async function save(repo: Repo, actor: Actor, classId: string, data: { weeks: YearWeek[]; needs?: Need[]; startDate?: Date; generated?: boolean }, now: Date): Promise<void> {
  const row = await repo.findMany("MapYearPlan", { classId }, { take: 1 });
  const base = { weeks: data.weeks as unknown as object, updatedAt: now, ...(data.needs ? { needs: data.needs as unknown as object } : {}), ...(data.startDate ? { startDate: data.startDate } : {}), ...(data.generated ? { generatedAt: now, createdById: actor.userId } : {}) };
  if (row[0]) await repo.updateMany("MapYearPlan", { id: row[0].id }, base);
  else await repo.create("MapYearPlan", { schoolId: actor.schoolId!, classId, startDate: data.startDate ?? now, weeks: data.weeks as unknown as object, needs: (data.needs ?? []) as unknown as object, createdById: actor.userId, generatedAt: now, updatedAt: now });
}

export interface YearPlanView {
  classId: string; className: string; grade: number; canEdit: boolean; saved: boolean;
  weeks: (Omit<YearWeek, "skills"> & { from: string; to: string; due: string; current: boolean; skills: (YearSkill & { assignedId: string | null; lesson: { code: string; title: string } | null; /** ⭐ students of the class with the star */ mastered?: number })[] })[];
  summary: { shared: number; covered: number; inPlan: number; students: number; tested: Record<Subject, number>; weakAreas: { key: GroupKey; name: string; icon: string }[]; leftOut: number };
  candidates: Need[]; notes: string[];
}

/** The Year plan of a class: made (and kept) the first time its teacher opens it; the admin sees it read-only. */
export async function yearPlanView(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<YearPlanView> {
  const { klass, grade, canEdit } = await classAndGrade(repo, actor, classId);
  let row = await savedRow(repo, classId);
  let notes: string[] = [];
  let weeks: YearWeek[], needs: Need[], startDate: Date;
  if (row) {
    weeks = json<YearWeek[]>(row.weeks, []); needs = json<Need[]>(row.needs, []);
    startDate = new Date(row.startDate instanceof Date ? row.startDate.toISOString() : s(row.startDate));
  } else {
    const p = await makePlan(repo, actor, klass, grade, now);
    ({ weeks, needs, startDate, notes } = p);
    if (canEdit && weeks.some((w) => w.skills.length)) {
      await safeIfBehind("map.year-plan.save", () => save(repo, actor, classId, { weeks, needs, startDate, generated: true }, now), undefined);
      row = await savedRow(repo, classId);
    }
  }
  const ids = [...new Set(weeks.flatMap((w) => w.skills.map((k) => k.skillId)))];
  const [stars, lessons, members] = await Promise.all([starredSkills(repo, classId, ids), lessonLinks(repo, actor.schoolId!, ids), classMembers(repo, classId)]);
  // ⭐ how many students of the class already mastered each skill (one read; the ONE status, skills/status.ts)
  const masteredOf = new Map<string, number>();
  if (ids.length && members.length) {
    const by = await safeIfBehind("map.year-plan.stars", () => statusesOfSkills(repo, actor.schoolId!, members, ids), new Map());
    for (const id of ids) masteredOf.set(id, [...by.values()].filter((m) => m.get(id)?.status === "MASTERED").length);
  }
  const shared = needs.filter((n) => n.shared && n.suitable);
  const inPlan = new Set(weeks.flatMap((w) => w.skills.filter((k) => !k.review).map((k) => k.skillId)));
  const today = now.getTime();
  const tested = { READING: 0, LANGUAGE: 0 } as Record<Subject, number>;
  for (const n of needs) tested[n.subject] = Math.max(tested[n.subject], n.of);
  const focus = new Map<GroupKey, number>();
  for (const n of shared) focus.set(n.group, (focus.get(n.group) ?? 0) + n.need);
  const view: YearPlanView = {
    classId, className: s(klass.name), grade, canEdit, saved: Boolean(row),
    weeks: weeks.map((w) => {
      const d = weekDates(startDate, w.week);
      return { ...w, ...d, due: d.to, current: today >= Date.parse(`${d.from}T00:00:00Z`) - RIYADH && today < Date.parse(`${d.to}T00:00:00Z`) - RIYADH + 3 * DAY,
        skills: w.skills.map((k) => ({ ...k, assignedId: stars.get(k.skillId) ?? null, lesson: lessons.get(k.skillId) ?? null, mastered: masteredOf.get(k.skillId) ?? 0 })) };
    }),
    summary: {
      shared: shared.length, covered: shared.filter((n) => inPlan.has(n.skillId)).length, inPlan: inPlan.size, students: members.length, tested,
      weakAreas: [...focus].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => ({ key: g, name: groupOf(g).name, icon: groupOf(g).icon })),
      leftOut: Math.max(0, shared.length - shared.filter((n) => inPlan.has(n.skillId)).length),
    },
    candidates: needs.slice(0, 80), notes,
  };
  return view;
}

/** Each skill's Learn lesson (the first ready, not hidden lesson that explains it). */
async function lessonLinks(repo: Repo, schoolId: string, skillIds: string[]): Promise<Map<string, { code: string; title: string }>> {
  if (!skillIds.length) return new Map();
  const want = new Set(skillIds);
  const [skills, hidden] = await Promise.all([learnSkills(repo, schoolId), safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>())]);
  const ready = lessonCatalog().filter((l) => l.ready && !hidden.has(l.code));
  const byCode = new Map(ready.map((l) => [l.code, l]));
  const m = matchSkills(skills.filter((k) => want.has(k.id)), ready);
  const out = new Map<string, { code: string; title: string }>();
  for (const [id, match] of m) { const l = match?.codes.map((c) => byCode.get(c)).find(Boolean); if (l) out.set(id, { code: l.code, title: l.title }); }
  return out;
}

// ------------------------------------------------------------------ the teacher's changes

export interface Pos { week: number; index: number }
export type YearEdit =
  | { op: "move"; from: Pos; to: Pos }
  | { op: "swap"; a: Pos; b: Pos }
  | { op: "replace"; at: Pos; skillId: string }
  | { op: "add"; week: number; skillId: string }
  | { op: "remove"; at: Pos }
  | { op: "regenerate" };

/** Applies one change to the weeks (pure; throws on a position or week that does not exist). */
export function applyYearEdit(weeks: YearWeek[], e: Exclude<YearEdit, { op: "regenerate" }>, skillOf: (id: string) => YearSkill | null): YearWeek[] {
  const w = weeks.map((x) => ({ week: x.week, skills: [...x.skills] }));
  const wk = (n: number) => { const x = w.find((y) => y.week === Math.trunc(Number(n))); if (!x) throw new ValidationError("That week is not in the plan."); return x; };
  const at = (p: Pos) => { const x = wk(p.week); const i = Math.trunc(Number(p.index)); if (!(i >= 0 && i < x.skills.length)) throw new ValidationError("That skill is not in this week."); return { x, i }; };
  const fresh = (id: string) => { const k = skillOf(id); if (!k) throw new ValidationError("Choose a skill of this grade."); return { ...k, review: false, added: true }; };
  const full = (x: YearWeek) => { if (x.skills.length >= MAX_PER_WEEK) throw new ValidationError(`A week has at most ${MAX_PER_WEEK} skills.`); };
  if (e.op === "move") {
    const a = at(e.from), to = wk(e.to.week);
    if (to !== a.x) full(to);
    const [k] = a.x.skills.splice(a.i, 1);
    to.skills.splice(Math.max(0, Math.min(to.skills.length, Math.trunc(Number(e.to.index)))), 0, k);
  } else if (e.op === "swap") {
    const a = at(e.a), b = at(e.b);
    const k = a.x.skills[a.i]; a.x.skills[a.i] = b.x.skills[b.i]; b.x.skills[b.i] = k;
  } else if (e.op === "replace") {
    const a = at(e.at);
    a.x.skills[a.i] = fresh(e.skillId);
  } else if (e.op === "add") {
    const x = wk(e.week); full(x);
    if (x.skills.some((k) => k.skillId === e.skillId)) throw new ValidationError("This skill is already in this week.");
    x.skills.push(fresh(e.skillId));
  } else if (e.op === "remove") {
    const a = at(e.at);
    a.x.skills.splice(a.i, 1);
  }
  return w;
}

/** The teacher changes the plan (or makes it again). Only the class's teacher. */
export async function editYearPlan(repo: Repo, actor: Actor, classId: string, e: YearEdit, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const { klass, grade, canEdit } = await classAndGrade(repo, actor, classId);
  if (!canEdit) throw new ForbiddenError("Only the class teacher can change the Year plan.");
  if (e.op === "regenerate") {
    const p = await makePlan(repo, actor, klass, grade, now);
    await save(repo, actor, classId, { weeks: p.weeks, needs: p.needs, startDate: p.startDate, generated: true }, now);
    await audit(repo, { actorId: actor.userId, action: "map.year_plan.make", entityType: "MapYearPlan", entityId: classId, after: { skills: p.weeks.reduce((t, w) => t + w.skills.length, 0) }, at: now });
    return;
  }
  let row = await savedRow(repo, classId);
  if (!row) { const p = await makePlan(repo, actor, klass, grade, now); await save(repo, actor, classId, { weeks: p.weeks, needs: p.needs, startDate: p.startDate, generated: true }, now); row = await savedRow(repo, classId); }
  const weeks = json<YearWeek[]>(row!.weeks, []);
  const needs = json<Need[]>(row!.needs, []);
  let master: Map<string, { id: string; code: string; name: string }> | null = null;
  const pk = await groupPools(repo, actor.schoolId!, grade);
  if (e.op === "replace" || e.op === "add") master = new Map((await masterSkills(repo, actor.schoolId!)).map((k) => [k.id, k]));
  const skillOf = (id: string): YearSkill | null => {
    const n = needs.find((x) => x.skillId === id);
    if (n) return toYear(n);
    const k = master?.get(id);
    if (!k) return null;
    const g = pk.skills.get(id)?.group ?? "LIT";
    return { skillId: id, code: k.code, name: k.name, group: g, need: 0, of: 0, rit: 0 };
  };
  const next = applyYearEdit(weeks, e, skillOf);
  await save(repo, actor, classId, { weeks: next }, now);
}

/** "Assign this week": ☆ every skill of the week not assigned yet (due the end of that week). */
export async function assignYearWeek(repo: Repo, actor: Actor, classId: string, week: number, now = new Date(), opts: { excludeMastered?: boolean } = {}): Promise<{ assigned: number; skipped: string[] }> {
  const v = await yearPlanView(repo, actor, classId, now);
  if (!v.canEdit) throw new ForbiddenError("Only the class teacher can assign.");
  const w = v.weeks.find((x) => x.week === Math.trunc(Number(week)));
  if (!w) throw new ValidationError("That week is not in the plan.");
  let assigned = 0; const skipped: string[] = [];
  const seen = new Set<string>();
  for (const k of w.skills) {
    if (k.assignedId || seen.has(k.skillId)) continue;
    seen.add(k.skillId);
    try { const r = await starAssign(repo, actor, { kind: "SKILL", ref: k.skillId, classId, dueAt: w.due < endOfSchoolWeek(now) ? endOfSchoolWeek(now) : w.due, track: "MAP", excludeMastered: opts.excludeMastered && (k.mastered ?? 0) > 0 }, now); if (!r.already) assigned++; }
    catch (e) { if (e instanceof ValidationError) skipped.push(`${k.name}: ${e.message}`); else throw e; }
  }
  return { assigned, skipped };
}
