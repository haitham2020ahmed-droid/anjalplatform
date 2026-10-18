/**
 * 🧾 The SUMMARY box at the end of every report (owner r70: "I am not a data person — simple, clear, CORRECT") and
 * its ACTION PLAN: 3–5 plain sentences (who is doing well, who needs help, the weakest skill, what to do next) and the
 * buttons that do it (assign practice / a lesson, a small group, contact the parent, re-teach to the class; admins:
 * follow up with the teacher). Everything here is PURE: it reads the numbers the page already loaded (no database
 * call), so a report never costs more because of its summary, and each rule is unit-tested
 * (tests/report-summary.test.ts). Sentences are interface strings (English keys + {vars}); the component translates
 * them (src/components/report-kit/report-summary.tsx). Staff pages only: students never see level words.
 */
import { insightHref } from "@/components/teacher/insight-links";

export type Vars = Record<string, string | number>;
export type LineTone = "info" | "good" | "help" | "skill" | "next";
export interface Line { key: string; vars?: Vars; tone: LineTone }
export type ActionKind = "practice" | "lesson" | "group" | "parent" | "reteach" | "plan" | "followup" | "message" | "open";
export interface PlanAction { kind: ActionKind; label: string; vars?: Vars; href: string }
export interface Summary { lines: Line[]; actions: PlanAction[] }

/** "Doing well" from this score up; "needs help" under this one (the same rule in every report). */
export const WELL_AT = 80;
export const HELP_BELOW = 60;

export interface Named { id: string; name: string }
export interface Scored extends Named { pct: number | null }
export interface SkillScore { id?: string | null; name: string; pct: number | null; n?: number }

export const line = (key: string, tone: LineTone, vars?: Vars): Line => (vars ? { key, tone, vars } : { key, tone });
export const act = (kind: ActionKind, label: string, href: string, vars?: Vars): PlanAction => (vars ? { kind, label, href, vars } : { kind, label, href });

/** "Ali, Sara, Omar +2": the first `max` names (in the given order) and how many more. */
export function nameList(list: readonly { name: string }[], max = 3): string {
  const shown = list.slice(0, max).map((x) => x.name).join(", ");
  return list.length > max ? `${shown} +${list.length - max}` : shown;
}

/** The rounded mean of the known values (null when there is none). */
export function mean(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** Splits scored people: with results, without, doing well (≥ 80, best first), needing help (< 60, lowest first). */
export function splitScores<T extends Scored>(rows: readonly T[]) {
  const scored = rows.filter((r) => r.pct !== null && Number.isFinite(r.pct));
  const noData = rows.filter((r) => r.pct === null || !Number.isFinite(r.pct));
  const well = scored.filter((r) => (r.pct as number) >= WELL_AT).sort((a, b) => (b.pct as number) - (a.pct as number) || a.name.localeCompare(b.name));
  const help = scored.filter((r) => (r.pct as number) < HELP_BELOW).sort((a, b) => (a.pct as number) - (b.pct as number) || a.name.localeCompare(b.name));
  return { scored, noData, well, help, avg: mean(scored.map((r) => r.pct)) };
}

/** The weakest skill: the lowest score among skills with enough answers (n ≥ 2 when known); ties → name order. */
export function weakestSkill<T extends SkillScore>(skills: readonly T[] | undefined, minN = 2): T | null {
  const ok = (skills ?? []).filter((k) => k.pct !== null && Number.isFinite(k.pct) && (k.n === undefined || k.n >= minN));
  return ok.sort((a, b) => (a.pct as number) - (b.pct as number) || a.name.localeCompare(b.name))[0] ?? null;
}

/** The most frequent name in a list of lists (e.g. each student's weakest skills), ties → name order. */
export function mostCommon(lists: readonly (readonly string[])[]): { name: string; count: number } | null {
  const n = new Map<string, number>();
  for (const l of lists) for (const x of new Set(l)) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  const best = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? { name: best[0], count: best[1] } : null;
}

// ── sentences (keys are interface strings: src/i18n/en.ts + ar.ts) ─────────────────────────────────────────────
export const S = {
  classOverview: "{n} of {total} students have results; the average is {avg}%.",
  classOverviewNoAvg: "{n} of {total} students have results.",
  none: "No results yet in this report.",
  noData: "{n} students have no results yet: {names}.",
  well: "Doing well (80% or more): {names}.",
  well0: "Nobody is at 80% or more yet.",
  help: "Needs help (below 60%): {names}.",
  help0: "Nobody is below 60% right now.",
  weak: "Weakest skill: {skill} ({pct}%).",
  weakNoPct: "Weakest skill: {skill}.",
  nextNone: "Next step: assign practice so results appear here.",
  nextReteachSkill: "Next step: re-teach {skill} to the whole class, then check again.",
  nextReteach: "Next step: re-teach to the whole class, then check again.",
  nextGroupSkill: "Next step: meet the {n} students who need help in a small group on {skill}.",
  nextGroup: "Next step: meet the {n} students who need help in a small group.",
  nextKeep: "Next step: keep the practice going and give the strongest students a challenge.",
  // one student
  stOverview: "{name}'s overall score is {pct}%.",
  stNone: "{name} has no results yet.",
  stStrong: "Strongest: {skills}.",
  stStrong0: "No skill at 80% or more yet.",
  stWeak: "Needs help with: {skills}.",
  stWeak0: "No skill below 60% right now.",
  stNextWeak: "Next step: assign practice on {skill} and send the Learn lesson.",
  stNextNone: "Next step: assign a first skill so results appear.",
  stNextKeep: "Next step: keep going and add a harder challenge.",
  // school / grade (admins)
  scOverview: "{n} classes have results; the school average is {avg}%.",
  scNone: "No class has results yet.",
  scWell: "Classes doing well (80% or more): {names}.",
  scWell0: "No class is at 80% or more yet.",
  scHelp: "Classes that need help (below 60%): {names}.",
  scHelp0: "No class is below 60%.",
  scGrade: "Weakest grade: Grade {grade} ({pct}%).",
  scNextHelp: "Next step: follow up with the teachers of {names}.",
  scNextKeep: "Next step: share what works in {name} with the other classes.",
  scNextNone: "Next step: ask the teachers to start the weekly practice.",
} as const;

export const A = {
  practice: "Assign practice",
  practiceSkill: "Assign practice on {skill}",
  lesson: "Send a Learn lesson",
  group: "Make a small group ({n})",
  parent: "Contact {name}'s parent",
  reteach: "Re-teach to the class",
  plan: "Create plan",
  followup: "Follow up with the teacher",
  followupOf: "Follow up: {name}",
  message: "Message the teachers",
  openStudent: "Open {name}",
} as const;

// ── hrefs (the pages that already do each thing: src/components/teacher/insight-links.ts) ────────────────────────
const q = (o: Record<string, string | null | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
export const hrefs = {
  practice: (classId: string | null, skillId?: string | null) => (skillId ? insightHref("reteach", { classId, skillId })! : `/teacher/assignments${classId ? `?${q({ classId })}` : ""}`),
  lesson: (classId: string | null, skillId?: string | null, studentId?: string | null) => insightHref("lesson", { classId, skillId: skillId ?? null, studentId: studentId ?? null })!,
  group: (classId: string, studentIds: string[]) => insightHref("group", { classId, studentIds })!,
  parent: (studentId: string) => insightHref("parent", { classId: null, studentId })!,
  reteach: (classId: string | null, skillId?: string | null) => insightHref("reteach", { classId, skillId: skillId ?? null }) ?? "/teacher/learning-loop",
  plan: (classId: string | null, studentId?: string | null) => insightHref("plan", { classId, studentId: studentId ?? null })!,
  followup: () => "/admin/teachers",
  message: () => "/admin/messages",
};

/** List line: "{label}: names" or the empty sentence. */
export const listLine = (key: string, emptyKey: string, people: readonly { name: string }[], tone: LineTone, max = 3): Line =>
  people.length ? line(key, tone, { names: nameList(people, max) }) : line(emptyKey, tone);

export const weakLine = (w: SkillScore | null): Line | null => (!w ? null : w.pct === null ? line(S.weakNoPct, "skill", { skill: w.name }) : line(S.weak, "skill", { skill: w.name, pct: Math.round(w.pct) }));

/**
 * The next step and the action plan of a class: nobody has results → assign practice; half or more need help →
 * re-teach to the whole class (+ the lesson); some need help → a small group, their parent, practice on the weakest
 * skill; nobody needs help → keep going. Admins also get "Follow up with the teacher". At most 4 buttons.
 */
export function classNext(o: { classId: string | null; scored: number; help: readonly Named[]; weak: SkillScore | null; admin?: boolean }): { next: Line; actions: PlanAction[] } {
  const { classId, help, weak } = o;
  const skillId = weak?.id ?? null;
  const actions: PlanAction[] = [];
  let next: Line;
  if (!o.scored) {
    next = line(S.nextNone, "next");
    actions.push(act("practice", A.practice, hrefs.practice(classId)));
  } else if (help.length >= 2 && help.length * 2 >= o.scored) {
    next = weak ? line(S.nextReteachSkill, "next", { skill: weak.name }) : line(S.nextReteach, "next");
    actions.push(act("reteach", A.reteach, hrefs.reteach(classId, skillId)), act("lesson", A.lesson, hrefs.lesson(classId, skillId)));
    if (classId) actions.push(act("group", A.group, hrefs.group(classId, help.map((h) => h.id)), { n: help.length }));
  } else if (help.length) {
    next = weak ? line(S.nextGroupSkill, "next", { n: help.length, skill: weak.name }) : line(S.nextGroup, "next", { n: help.length });
    if (classId) actions.push(act("group", A.group, hrefs.group(classId, help.map((h) => h.id)), { n: help.length }));
    actions.push(weak ? act("practice", A.practiceSkill, hrefs.practice(classId, skillId), { skill: weak.name }) : act("practice", A.practice, hrefs.practice(classId)));
    actions.push(act("parent", A.parent, hrefs.parent(help[0].id), { name: help[0].name }));
  } else {
    next = line(S.nextKeep, "next");
    actions.push(weak ? act("practice", A.practiceSkill, hrefs.practice(classId, skillId), { skill: weak.name }) : act("practice", A.practice, hrefs.practice(classId)));
    actions.push(act("plan", A.plan, hrefs.plan(classId)));
  }
  if (o.admin) actions.push(act("followup", A.followup, hrefs.followup()));
  return { next, actions: actions.slice(0, 4) };
}

/**
 * The summary of a class (or a group of students) from one score per student (0–100, null = no result yet) and the
 * skills' scores: overview, doing well, needs help, weakest skill, next step (+ `extra` report lines after the
 * overview; at most 5 lines in all).
 */
export function classSummary(o: { rows: readonly Scored[]; skills?: readonly SkillScore[]; weak?: SkillScore | null; classId: string | null; admin?: boolean; extra?: (Line | null)[] }): Summary {
  const sp = splitScores(o.rows);
  const weak = o.weak !== undefined ? o.weak : weakestSkill(o.skills);
  const { next, actions } = classNext({ classId: o.classId, scored: sp.scored.length, help: sp.help, weak, admin: o.admin });
  if (!sp.scored.length) {
    return { lines: [line(S.none, "info"), ...(o.extra ?? []).filter((x): x is Line => !!x), next].slice(0, 5), actions };
  }
  const extra = (o.extra ?? []).filter((x): x is Line => !!x);
  // over 5 lines: the weakest-skill line gives way first when the next step already names that skill
  const weakL = extra.length > 0 && weak && next.vars?.skill === weak.name ? null : weakLine(weak);
  const lines: (Line | null)[] = [
    sp.avg === null ? line(S.classOverviewNoAvg, "info", { n: sp.scored.length, total: o.rows.length }) : line(S.classOverview, "info", { n: sp.scored.length, total: o.rows.length, avg: sp.avg }),
    ...extra,
    listLine(S.well, S.well0, sp.well, "good"),
    listLine(S.help, S.help0, sp.help, "help"),
    weakL,
    next,
  ];
  return { lines: fit(lines), actions };
}

/** "Nobody …" sentences: the first to give way when a summary is too long. */
const EMPTY = new Set<string>([S.well0, S.help0, S.stStrong0, S.stWeak0, S.scWell0, S.scHelp0]);
/**
 * At most 5 lines, the next step always last: over that, the "Nobody …" sentences give way first (last one first),
 * then the extra "info" lines after the first, then whatever comes just before the next step.
 */
export function fit(lines: (Line | null | undefined)[], max = 5): Line[] {
  const l = lines.filter((x): x is Line => !!x);
  if (l.length <= max) return l;
  const last = l[l.length - 1];
  const keep = l.slice(0, -1);
  const dropLast = (ok: (x: Line, i: number) => boolean) => { for (let i = keep.length - 1; i >= 0; i--) if (ok(keep[i], i)) { keep.splice(i, 1); return true; } return false; };
  while (keep.length + 1 > max) {
    if (dropLast((x) => EMPTY.has(x.key))) continue;
    if (dropLast((x, i) => i > 0 && x.tone === "info")) continue;
    keep.splice(keep.length - 1, 1);
  }
  return [...keep, last];
}

/** One student: overall score, strongest and weakest skills, next step; buttons: practice, lesson, parent, plan. */
export function studentSummary(o: { studentId: string; name: string; classId: string | null; pct: number | null; skills: readonly SkillScore[]; extra?: (Line | null)[] }): Summary {
  const known = o.skills.filter((k) => k.pct !== null && Number.isFinite(k.pct) && (k.n === undefined || k.n >= 2));
  const strong = known.filter((k) => (k.pct as number) >= WELL_AT).sort((a, b) => (b.pct as number) - (a.pct as number) || a.name.localeCompare(b.name));
  const weakList = known.filter((k) => (k.pct as number) < HELP_BELOW).sort((a, b) => (a.pct as number) - (b.pct as number) || a.name.localeCompare(b.name));
  const weak = weakList[0] ?? null;
  const actions: PlanAction[] = [];
  let next: Line;
  if (o.pct === null && !known.length) {
    next = line(S.stNextNone, "next");
    actions.push(act("plan", A.plan, hrefs.plan(o.classId, o.studentId)));
  } else if (weak) {
    next = line(S.stNextWeak, "next", { skill: weak.name });
    actions.push(act("practice", A.practiceSkill, hrefs.practice(o.classId, weak.id), { skill: weak.name }), act("lesson", A.lesson, hrefs.lesson(o.classId, weak.id, o.studentId)));
  } else {
    next = line(S.stNextKeep, "next");
    actions.push(act("plan", A.plan, hrefs.plan(o.classId, o.studentId)));
  }
  actions.push(act("parent", A.parent, hrefs.parent(o.studentId), { name: o.name }));
  const lines: (Line | null)[] = [
    o.pct === null ? line(S.stNone, "info", { name: o.name }) : line(S.stOverview, "info", { name: o.name, pct: Math.round(o.pct) }),
    ...(o.extra ?? []),
    strong.length ? line(S.stStrong, "good", { skills: nameList(strong) }) : line(S.stStrong0, "good"),
    weakList.length ? line(S.stWeak, "help", { skills: nameList(weakList) }) : line(S.stWeak0, "help"),
    next,
  ];
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

/** Admin: the school (or a grade) from one score per class; the next step is a follow-up with the teachers. */
export function schoolSummary(o: { units: readonly (Scored & { href?: string })[]; skills?: readonly SkillScore[]; weak?: SkillScore | null; grades?: readonly { grade: number; pct: number | null }[]; extra?: (Line | null)[] }): Summary {
  const sp = splitScores(o.units);
  const weak = o.weak !== undefined ? o.weak : weakestSkill(o.skills);
  const g = (o.grades ?? []).filter((x) => x.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number) || a.grade - b.grade);
  const weakGrade = g.length > 1 ? g[0] : null;
  const actions: PlanAction[] = [];
  let next: Line;
  if (!sp.scored.length) {
    next = line(S.scNextNone, "next");
    actions.push(act("message", A.message, hrefs.message()));
  } else if (sp.help.length) {
    next = line(S.scNextHelp, "next", { names: nameList(sp.help) });
    actions.push(act("followup", A.followup, hrefs.followup()));
    for (const u of sp.help.slice(0, 2)) if (u.href) actions.push(act("open", A.followupOf, u.href, { name: u.name }));
    actions.push(act("message", A.message, hrefs.message()));
  } else {
    const best = sp.well[0] ?? [...sp.scored].sort((a, b) => (b.pct as number) - (a.pct as number))[0];
    next = line(S.scNextKeep, "next", { name: best.name });
    actions.push(act("message", A.message, hrefs.message()), act("followup", A.followup, hrefs.followup()));
  }
  const lines: (Line | null)[] = sp.scored.length ? [
    line(S.scOverview, "info", { n: sp.scored.length, avg: sp.avg ?? 0 }),
    ...(o.extra ?? []),
    listLine(S.scWell, S.scWell0, sp.well, "good"),
    listLine(S.scHelp, S.scHelp0, sp.help, "help"),
    weakGrade ? line(S.scGrade, "skill", { grade: weakGrade.grade, pct: Math.round(weakGrade.pct as number) }) : weakLine(weak),
    next,
  ] : [line(S.scNone, "info"), ...(o.extra ?? []), next];
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

/** Every sentence and button label of the shared rules (each must be in en.ts and ar.ts). */
export const SUMMARY_KEYS: readonly string[] = [...Object.values(S), ...Object.values(A)];
