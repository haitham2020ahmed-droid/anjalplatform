/**
 * 🗓 RTI weekly plan (Update 39C, readiness I-23): for one class, this week's Tier 2 and Tier 3 groups — who, which
 * focus skill, which intervention lesson (or what to use when the skill has none), how many minutes, when each
 * student's progress check is due, what the last checks said, and the decision the school's rules point to.
 * Read-only (the tiers themselves are set by the daily job and by teachers on the Support Tiers page).
 *
 * Groups: one per tier × focus skill; groups larger than the usual RTI size (Tier 2: 6, Tier 3: 3) are split.
 * Last checks: the student's last two completed Weekly Checks and reteach re-checks (8 weeks), each read from its own
 * answers (rapid guesses left out, ability θ with its ± error — tiers/tiers.ts checkDetails), so the plan shows the
 * same evidence the tier rules use.
 * Decision (a suggestion for the teacher; the rules in tiers/rules.ts decide the tier):
 *   EXIT        two checks in a row strong (80 %+ or ability at grade level) → ready to step down one tier
 *   INTENSIFY   two checks in a row low (or one very low long check) → more time / smaller group / another approach
 *   REFER       Tier 3 flagged “Refer for further evaluation” (two interventions without gain)
 *   RETEST      the last check was invalid (30 %+ rapid guesses)
 *   CHECK       no valid check yet, or the check is overdue
 *   STAY        otherwise: continue the plan and check on the date shown
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { lessonForSkill } from "../lessons/content";
import { isInvalidResult } from "../curriculum-map/level-evidence";
import { checkDetails } from "./tiers";
import { tierRows, type TierRow } from "./views";
import { checkSignal, MONITOR_EVERY_DAYS, TIER_RULES, type CheckPoint, type CheckSignal } from "./rules";
import { DAY, reportClass, s, time } from "../reports/report-access";

export const GROUP_SIZE: Record<2 | 3, number> = { 2: 6, 3: 3 };
export const MINUTES: Record<2 | 3, { sessions: number; minutes: number; text: string }> = {
  2: { sessions: 3, minutes: 30, text: "3 sessions × 30 min this week, small group (3–6), in addition to core instruction" },
  3: { sessions: 5, minutes: 30, text: "5 sessions × 30 min this week (daily), very small group (1–3), in addition to core instruction" },
};
export type Decision = "EXIT" | "INTENSIFY" | "REFER" | "RETEST" | "CHECK" | "STAY";
export const DECISION_TEXT: Record<Decision, string> = {
  EXIT: "Exit candidate: two strong checks in a row — ready to step down one tier",
  INTENSIFY: "Intensify: low on two checks — more minutes, a smaller group or the second re-teach approach",
  REFER: "Refer for further evaluation (two interventions without gain)",
  RETEST: "Re-test: the last check was answered too fast to count",
  CHECK: "Check now: no valid progress check yet, or the check is overdue",
  STAY: "Stay: continue the plan; check on the date shown",
};
export const DECISION_RULES: string[] = [
  `Check every ${MONITOR_EVERY_DAYS[2]} days in Tier 2 and every ${MONITOR_EVERY_DAYS[3]} days in Tier 3 (8-item checks; rapid guesses are left out).`,
  `Exit: two checks in a row at ${TIER_RULES.EXIT_CHECK_PCT}% or more (or ability at grade level) — one tier at a time, after at least ${TIER_RULES.MIN_DWELL_DAYS} days in the tier.`,
  `Stay: checks in between — keep the group, the skill and the minutes.`,
  `Intensify: two checks in a row low (ability ${TIER_RULES.CHECK_LOW_THETA} or lower, or under ${TIER_RULES.T2_CHECK_PCT}%) — Tier 2 moves to Tier 3 when it continues; in Tier 3 change the approach (re-teach approach 2), add minutes.`,
  `Refer: Tier 3 with ${TIER_RULES.T3_FAILED_INTERVENTIONS} interventions in a row without a gain of ${TIER_RULES.INTERVENTION_GAIN}+ mastery points (judged on ${TIER_RULES.INTERVENTION_MIN_ANSWERS}+ careful answers).`,
  "A check with 30% or more rapid guesses is invalid: re-test before any decision.",
];

export interface PlanCheck { date: string; kind: "WEEKLY" | "RECHECK"; pct: number; items: number | null; theta: number | null; se: number | null; signal: CheckSignal | "INVALID" }
export interface PlanStudent extends Pick<TierRow, "studentId" | "name" | "since" | "reason" | "locked" | "source" | "refer"> {
  tier: 2 | 3; nextCheck: string | null; overdue: boolean; checkThisWeek: boolean; checks: PlanCheck[]; decision: Decision; decisionText: string;
}
export interface PlanGroup {
  key: string; label: string; tier: 2 | 3; focusSkillId: string | null; focusSkill: string; students: PlanStudent[];
  lesson: { name: string; href: string; approaches: string[]; warmUp: string } | null; fallback: string | null; assignHref: string | null;
  minutes: string; checkEvery: number; checkDates: string[];
}
export interface RtiWeeklyPlan {
  classId: string; className: string; grade: number; weekOf: string; weekEnd: string;
  counts: { students: number; tier1: number; tier2: number; tier3: number };
  groups: PlanGroup[]; rules: string[];
}

/** Monday of the week (UTC) of `now`. */
export function weekBounds(now: Date): { start: Date; end: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  const start = new Date(d.getTime() - dow * DAY);
  return { start, end: new Date(start.getTime() + 7 * DAY - 1) };
}

/** Pure: the suggestion for one student from the last checks (oldest first). */
export function decideWeek(tier: 2 | 3, checks: PlanCheck[], opts: { refer: boolean; overdue: boolean }): Decision {
  if (opts.refer && tier === 3) return "REFER";
  const last = checks[checks.length - 1];
  if (last?.signal === "INVALID") return "RETEST";
  const valid = checks.filter((c) => c.signal !== "INVALID");
  if (!valid.length) return "CHECK";
  const [a, b] = valid.slice(-2);
  const strong = (c?: PlanCheck) => c?.signal === "STRONG";
  const low = (c?: PlanCheck) => c?.signal === "LOW" || c?.signal === "VERY_LOW";
  if (b && strong(a) && strong(b)) return "EXIT";
  if ((b && low(a) && low(b)) || (valid.length === 1 && a.signal === "VERY_LOW" && (a.items ?? 0) >= TIER_RULES.MIN_ITEMS_ALONE)) return "INTENSIFY";
  if (opts.overdue) return "CHECK";
  return "STAY";
}

async function lastChecks(repo: Repo, ids: string[], now: Date): Promise<Map<string, PlanCheck[]>> {
  const out = new Map<string, PlanCheck[]>();
  if (!ids.length) return out;
  const from = new Date(now.getTime() - 56 * DAY);
  const [weekly, reteach] = await Promise.all([
    repo.findMany("WeeklyCheck", { studentId: { in: ids }, completedAt: { gte: from } }, { select: ["studentId", "correct", "total", "completedAt", "assignmentId"] }),
    repo.findMany("TierChange", { studentId: { in: ids }, source: "RETEACH", createdAt: { gte: from } }, { select: ["studentId", "evidence"] }),
  ]);
  const raw: { sid: string; at: number; pct: number; kind: "WEEKLY" | "RECHECK"; aid: string | null }[] = [];
  for (const w of weekly) if (Number(w.total) > 0 && w.completedAt) raw.push({ sid: s(w.studentId), at: time(w.completedAt), pct: (100 * Number(w.correct)) / Number(w.total), kind: "WEEKLY", aid: w.assignmentId ? s(w.assignmentId) : null });
  for (const r of reteach) {
    const ev = (typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence ?? {}) as { recheck?: { assignmentId?: string }; outcome?: { pct?: number; at?: string; missed?: boolean } };
    if (ev.outcome && typeof ev.outcome.pct === "number" && ev.outcome.at && !ev.outcome.missed) raw.push({ sid: s(r.studentId), at: time(ev.outcome.at), pct: ev.outcome.pct, kind: "RECHECK", aid: ev.recheck?.assignmentId ? s(ev.recheck.assignmentId) : null });
  }
  const recent = new Map<string, typeof raw>();
  for (const r of raw.sort((a, b) => a.at - b.at)) recent.set(r.sid, [...(recent.get(r.sid) ?? []), r].slice(-2));
  const pairs = [...recent.values()].flat().filter((r) => r.aid).map((r) => ({ assignmentId: r.aid!, studentId: r.sid }));
  const det = await checkDetails(repo, pairs);
  for (const [sid, list] of recent) {
    out.set(sid, list.map((r) => {
      const x = r.aid ? det.get(`${r.aid}|${sid}`) : undefined;
      const invalid = x ? isInvalidResult(x.rapid, x.items + x.rapid) : false;
      const cp: CheckPoint = x && x.items ? { at: new Date(r.at), pct: (100 * x.correct) / x.items, kind: r.kind, items: x.items, theta: x.theta, se: x.se } : { at: new Date(r.at), pct: r.pct, kind: r.kind };
      return { date: new Date(r.at).toISOString().slice(0, 10), kind: r.kind, pct: Math.round(cp.pct), items: cp.items ?? null, theta: cp.theta ?? null, se: cp.se ?? null, signal: invalid ? "INVALID" : checkSignal(cp) };
    }));
  }
  return out;
}

/** The class's RTI plan for the week of `now` (teacher of the class, grade coordinator, school admin). */
export async function rtiWeeklyPlan(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<RtiWeeklyPlan> {
  const { klass, grade, ids } = await reportClass(repo, actor, classId);
  const { start, end } = weekBounds(now);
  const rows = await tierRows(repo, ids, now);
  const support = rows.filter((r) => r.tier >= 2);
  const checks = await lastChecks(repo, support.map((r) => r.studentId), now);
  const tierRowsDb = support.length ? await repo.findMany("StudentTier", { studentId: { in: support.map((r) => r.studentId) } }, { select: ["studentId", "focusSkillId"] }) : [];
  const focusOf = new Map(tierRowsDb.map((r) => [s(r.studentId), r.focusSkillId ? s(r.focusSkillId) : null]));
  const skillIds = [...new Set([...focusOf.values()].filter((v): v is string => Boolean(v)))];
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "code", "familyId"] }) : [];
  const fams = skills.length ? await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "code"] }) : [];
  const groups = new Map<string, PlanStudent[]>();
  for (const r of support) {
    const tier = r.tier as 2 | 3;
    const list = checks.get(r.studentId) ?? [];
    const next = r.nextCheck;
    const checkThisWeek = Boolean(next && time(next) >= start.getTime() && time(next) <= end.getTime());
    const decision = decideWeek(tier, list, { refer: r.refer, overdue: r.overdue });
    const st: PlanStudent = { studentId: r.studentId, name: r.name, since: r.since, reason: r.reason, locked: r.locked, source: r.source, refer: r.refer, tier, nextCheck: next, overdue: r.overdue, checkThisWeek, checks: list, decision, decisionText: DECISION_TEXT[decision] };
    const key = `${tier}|${focusOf.get(r.studentId) ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), st]);
  }
  const out: PlanGroup[] = [];
  for (const [key, students] of [...groups].sort((a, b) => Number(b[0][0]) - Number(a[0][0]) || b[1].length - a[1].length)) {
    const [tierS, skillId] = key.split("|");
    const tier = Number(tierS) as 2 | 3;
    const k = skills.find((x) => x.id === skillId);
    const lesson = k ? lessonForSkill({ familyCode: s(fams.find((f) => f.id === k.familyId)?.code), code: s(k.code), name: s(k.name) }) : null;
    const size = GROUP_SIZE[tier];
    const sorted = students.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < sorted.length; i += size) {
      const part = sorted.slice(i, i + size);
      const sub = sorted.length > size ? ` · group ${String.fromCharCode(65 + i / size)}` : "";
      const dates = [...new Set(part.map((p) => p.nextCheck).filter((d): d is string => Boolean(d) && time(d) <= end.getTime()))].sort();
      out.push({
        key: `${key}|${i / size}`, label: `Tier ${tier} · ${k ? s(k.name) : "No focus skill yet"}${sub}`, tier, focusSkillId: skillId || null, focusSkill: k ? s(k.name) : "No focus skill yet", students: part,
        lesson: lesson && k ? { name: lesson.name, href: `/teacher/lessons?class=${classId}&skill=${s(k.id)}`, approaches: tier === 3 ? lesson.reteach.map((r) => `${r.title}: ${r.how}`) : [lesson.reteach[0].title + ": " + lesson.reteach[0].how], warmUp: lesson.warmUp } : null,
        fallback: lesson ? null : k ? `No intervention lesson for ${s(k.name)} yet: teach it in the small group with the skill's practice set (assign below) and the class's grammar or vocabulary materials.` : "The tier has no focus skill yet: look at the student's weakest skills on the Support Tiers page and choose one.",
        assignHref: k ? `/teacher/skill-assign?classId=${classId}&skillId=${s(k.id)}` : null,
        minutes: MINUTES[tier].text, checkEvery: MONITOR_EVERY_DAYS[tier], checkDates: dates,
      });
    }
  }
  return {
    classId, className: s(klass.name), grade, weekOf: start.toISOString().slice(0, 10), weekEnd: new Date(end.getTime()).toISOString().slice(0, 10),
    counts: { students: rows.length, tier1: rows.filter((r) => r.tier === 1).length, tier2: rows.filter((r) => r.tier === 2).length, tier3: rows.filter((r) => r.tier === 3).length },
    groups: out, rules: DECISION_RULES,
  };
}
