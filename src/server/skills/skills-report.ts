/**
 * ⭐ Student Skills → "By source" and "Class report" (owner r74). PURE: computed from the class data the page already
 * read once (skills-grid.ts classSkills) — no extra query. Covers ONLY assigned skills; one star per student × skill
 * (the same star in every source). The groups come from the existing star scale (no new thresholds):
 *
 *   Ready for next level  every skill assigned to the student is mastered (⭐, or ☆⬆ mastered at the previous level)
 *   Need support          at least one assigned skill is ◐ flagged "Needs support" or 🔄 Needs review
 *   On track              everyone else (practising, or not started yet — "not started" is shown beside the name)
 *
 * The action plan (≤ 5 short points) is generated from the same numbers, each with a button to an existing action.
 */
import type { StarStatus } from "./status";
import { gridOf, isMasteredStar, isPractised, isSupportStar, isWeakForClass, masteredPct, onlySource, skillCounts, studentGuess, studentTrend, type ClassSkills, type GridSkill } from "./skills-grid";
import { isGuessing, type Trend } from "./skills-trend";
import { ASSIGN_SOURCES, ASSIGN_SOURCE_LABEL, type AssignSource } from "../../lib/assign-source";

export type StudentGroup = "SUPPORT" | "ON_TRACK" | "NEXT_LEVEL";
export const GROUP_ORDER: readonly StudentGroup[] = ["SUPPORT", "ON_TRACK", "NEXT_LEVEL"];
export const GROUP_LABEL: Record<StudentGroup, string> = { SUPPORT: "Need support", ON_TRACK: "On track", NEXT_LEVEL: "Ready for next level" };
/** the rule, stated in the ⓘ tooltip */
export const GROUP_RULE = "Ready for next level: every assigned skill is mastered (⭐ or ☆⬆). Need support: at least one assigned skill is “Needs support” or 🔄 Needs review. On track: everyone else.";
/** "trend": stars won in the last TREND_DAYS days */
export const TREND_DAYS = 14;
const DAY = 86_400_000;

/** The group of one student from the stars of their assigned skills (pure; null = nothing assigned). */
export function groupOf(stars: readonly { status: StarStatus; needsSupport?: boolean }[]): StudentGroup | null {
  if (!stars.length) return null;
  if (stars.some(isSupportStar)) return "SUPPORT";
  if (stars.every(isMasteredStar)) return "NEXT_LEVEL";
  return "ON_TRACK";
}

const pctOf = (correct: number, answered: number): number | null => (answered > 0 ? Math.round((100 * correct) / answered) : null);
const STAR_KEYS: readonly StarStatus[] = ["MASTERED", "NEXT_LEVEL", "IN_PROGRESS", "NEEDS_REVIEW", "NOT_STARTED"];

// ------------------------------------------------------------------ By source

export interface SourceCard {
  source: AssignSource; label: string; skills: number; answered: number; accuracy: number | null;
  /** ⭐ ☆⬆ ◐ 🔄 ☆ counts over the source's assigned pairs (one star per pair) */
  stars: Record<StarStatus, number>;
  /** students with a support star among this source's skills */
  needSupport: number;
  weakest: { key: string; name: string; pct: number } | null;
}

/** One card per source that has assigned skills (MAP · NAFS · Curriculum · Grammar · RTI order). */
export function sourceCards(d: ClassSkills): SourceCard[] {
  const out: SourceCard[] = [];
  for (const src of ASSIGN_SOURCES) {
    const v = onlySource(d, src);
    if (!v.skills.length) continue;
    const stars = Object.fromEntries(STAR_KEYS.map((k) => [k, 0])) as Record<StarStatus, number>;
    let answered = 0, correct = 0;
    const support = new Set<string>();
    for (const st of v.students) for (const sv of Object.values(v.stars[st.id] ?? {})) {
      stars[sv.status]++; answered += Number(sv.answered || 0); correct += Number(sv.correct || 0);
      if (isSupportStar(sv)) support.add(st.id);
    }
    const counts = v.skills.map((k) => ({ key: k.key, name: k.name, ...skillCounts(v, k.key) }));
    const weak = [...counts].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || (pctOf(a.correct ?? 0, a.answered ?? 0) ?? 101) - (pctOf(b.correct ?? 0, b.answered ?? 0) ?? 101) || a.name.localeCompare(b.name))[0];
    out.push({ source: src, label: ASSIGN_SOURCE_LABEL[src], skills: v.skills.length, answered, accuracy: pctOf(correct, answered), stars, needSupport: support.size, weakest: weak ? { key: weak.key, name: weak.name, pct: weak.pct ?? 0 } : null });
  }
  return out;
}

// ------------------------------------------------------------------ Class report

export interface ReportRow {
  id: string; name: string; group: StudentGroup; mastered: number; of: number; accuracy: number | null; notStarted: boolean; started: number;
  /** r75: ⬆️ ➖ ⬇️ against 2 weeks before · ⚡ answering too fast */
  trend: Trend | null; guessing: boolean;
}
export interface ActionPoint { kind: "RETEACH" | "GUESSING" | "SMALL_GROUP" | "STALLED" | "NEXT_LEVEL" | "FOLLOW_UP" | "SOURCE"; text: string; vars: Record<string, string | number>; href: string; button: string }
export interface ClassReport {
  /** the 4 numbers */
  masteryPct: number; skillsAssigned: number; onTrack: number; needSupport: number;
  /** one line */
  strongest: { name: string; pct: number } | null; weakest: { name: string; pct: number } | null; weakestSource: { source: AssignSource; label: string; pct: number } | null;
  groups: Record<StudentGroup, { id: string; name: string; notStarted: boolean }[]>;
  actions: ActionPoint[];
  rows: ReportRow[];
  /** extras: students who have not started any assigned skill; stars won in the last TREND_DAYS days; students with skills */
  notStarted: number; newStars: number; withWork: number;
  /**
   * r75: the last 2 weeks — stars gained (⭐ now that were not ⭐ 2 weeks before), students improved (⬆️), not moving
   * (➖: started, not every skill mastered yet), going down (⬇️); the students answering too fast (⚡)
   */
  trend: { gained: number; improved: number; stalled: { id: string; name: string }[]; down: number };
  guessing: { id: string; name: string }[];
}

export interface ReportLinks { skill: (key: string) => string; plan: (studentIds: string[]) => string; student: (id: string) => string; source: (src: AssignSource) => string; assigned: string }

/** The class report (pure). */
export function classReport(d: ClassSkills, links: ReportLinks, now = new Date()): ClassReport {
  const g = gridOf(d, { page: 1 });
  const skills = g.skills;
  const rows: ReportRow[] = [];
  let pairs = 0, masteredPairs = 0, newStars = 0, gained = 0;
  const since = now.getTime() - TREND_DAYS * DAY;
  for (const st of d.students) {
    const mine = Object.values(d.stars[st.id] ?? {});
    if (!mine.length) continue;
    const answered = mine.reduce((n, v) => n + Number(v.answered || 0), 0), correct = mine.reduce((n, v) => n + Number(v.correct || 0), 0);
    const mastered = mine.filter(isMasteredStar).length, started = mine.filter(isPractised).length;
    pairs += mine.length; masteredPairs += mastered;
    newStars += mine.filter((v) => isMasteredStar(v) && v.masteredAt && Date.parse(v.masteredAt) >= since).length;
    const tr = studentTrend(d, st.id);
    gained += tr?.gained ?? 0;
    rows.push({ id: st.id, name: st.name, group: groupOf(mine)!, mastered, of: mine.length, accuracy: pctOf(correct, answered), notStarted: started === 0, started, trend: tr?.trend ?? null, guessing: isGuessing(studentGuess(d, st.id)) });
  }
  const groups: ClassReport["groups"] = { SUPPORT: [], ON_TRACK: [], NEXT_LEVEL: [] };
  for (const r of rows) groups[r.group].push({ id: r.id, name: r.name, notStarted: r.notStarted });
  const byPct = (a: GridSkill, b: GridSkill) => (a.pct ?? 0) - (b.pct ?? 0) || a.name.localeCompare(b.name);
  const weakest = skills.length ? [...skills].sort(byPct)[0] : null;
  const strongest = skills.length ? [...skills].sort((a, b) => byPct(b, a))[0] : null;
  const strong = strongest && (strongest.pct ?? 0) > 0 ? { name: strongest.name, pct: strongest.pct ?? 0 } : null;
  const bySource = ASSIGN_SOURCES.map((src) => {
    const v = onlySource(d, src);
    let n = 0, m = 0;
    for (const st of v.students) for (const sv of Object.values(v.stars[st.id] ?? {})) { n++; if (isMasteredStar(sv)) m++; }
    return { source: src, label: ASSIGN_SOURCE_LABEL[src], n, pct: masteredPct(m, n) };
  }).filter((x) => x.n > 0);
  const weakestSource = bySource.length > 1 ? [...bySource].sort((a, b) => a.pct - b.pct || ASSIGN_SOURCES.indexOf(a.source) - ASSIGN_SOURCES.indexOf(b.source))[0] : null;

  // the action plan: at most 5 short points, each with a button to an existing action
  const actions: ActionPoint[] = [];
  const names = (list: { name: string }[], max = 4) => list.slice(0, max).map((x) => x.name).join(", ") + (list.length > max ? ` +${list.length - max}` : "");
  const started = skills.filter((k) => k.total > 0);
  const whole = [...started].filter((k) => isWeakForClass(k.mastered, k.total)).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.total - a.total || a.name.localeCompare(b.name))[0];
  if (whole) actions.push({ kind: "RETEACH", text: "Reteach {skill} to the whole class: {n} of {total} have not mastered it.", vars: { skill: whole.name, n: whole.total - whole.mastered, total: whole.total }, href: links.skill(whole.key), button: "Reteach to whole class" });
  // r75 ⚡: answering too fast → talk to them first (before re-teaching)
  const guessing = rows.filter((r) => r.guessing);
  if (guessing.length) actions.push({ kind: "GUESSING", text: "Talk to {names} ({n}): they answer too fast. Ask them to read carefully.", vars: { n: guessing.length, names: names(guessing) }, href: links.student(guessing[0].id), button: "Open the student" });
  // a few students struggle (support stars) on a skill most of the class is fine with → a small group, with names
  const few = skills.filter((k) => k.key !== whole?.key && !isWeakForClass(k.mastered, k.total))
    .map((k) => ({ k, who: d.students.filter((st) => isSupportStar(d.stars[st.id]?.[k.key])) }))
    .filter((x) => x.who.length > 0 && x.who.length * 2 <= x.k.total).sort((a, b) => b.who.length - a.who.length || a.k.name.localeCompare(b.k.name))[0];
  if (few) actions.push({ kind: "SMALL_GROUP", text: "Small group for {skill}: {names}.", vars: { skill: few.k.name, names: names(few.who) }, href: links.skill(few.k.key), button: "Create small group" });
  // r75: not moving for 2 weeks (started, not everything mastered) → follow up
  const stalled = rows.filter((r) => r.trend === "SAME" && !r.notStarted && r.group !== "NEXT_LEVEL");
  if (stalled.length) actions.push({ kind: "STALLED", text: "Not moving for 2 weeks ({n}): {names}. Follow up with them.", vars: { n: stalled.length, names: names(stalled) }, href: stalled.length === 1 ? links.student(stalled[0].id) : links.plan(stalled.map((x) => x.id)), button: stalled.length === 1 ? "Open the student" : "Create Plan" });
  if (groups.NEXT_LEVEL.length) actions.push({ kind: "NEXT_LEVEL", text: "Move to the next level ({n}): {names} mastered every assigned skill.", vars: { n: groups.NEXT_LEVEL.length, names: names(groups.NEXT_LEVEL) }, href: links.plan(groups.NEXT_LEVEL.map((x) => x.id)), button: "Create Plan" });
  const idle = rows.filter((r) => r.notStarted);
  if (idle.length) actions.push({ kind: "FOLLOW_UP", text: "Follow up ({n}): {names} have not started their assigned skills.", vars: { n: idle.length, names: names(idle) }, href: idle.length === 1 ? links.student(idle[0].id) : links.assigned, button: idle.length === 1 ? "Open the student" : "Open Assigned" });
  if (weakestSource && actions.length < 5) actions.push({ kind: "SOURCE", text: "Weakest source: {source} ({pct}% mastered). Check its skills.", vars: { source: weakestSource.label, pct: weakestSource.pct }, href: links.source(weakestSource.source), button: "Open by source" });
  return {
    masteryPct: masteredPct(masteredPairs, pairs), skillsAssigned: d.skills.length, onTrack: groups.ON_TRACK.length + groups.NEXT_LEVEL.length, needSupport: groups.SUPPORT.length,
    strongest: strong,
    weakest: weakest && (!strong || weakest.key !== strongest?.key) ? { name: weakest.name, pct: weakest.pct ?? 0 } : null,
    weakestSource: weakestSource ? { source: weakestSource.source, label: weakestSource.label, pct: weakestSource.pct } : null,
    groups, actions: actions.slice(0, 5),
    rows: rows.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name)),
    notStarted: idle.length, newStars, withWork: rows.length,
    trend: { gained, improved: rows.filter((r) => r.trend === "UP").length, stalled: stalled.map((x) => ({ id: x.id, name: x.name })), down: rows.filter((r) => r.trend === "DOWN").length },
    guessing: guessing.map((x) => ({ id: x.id, name: x.name })),
  };
}
