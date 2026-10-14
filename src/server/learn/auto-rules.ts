/**
 * 📘 Automatic Learn lessons — the rules in ONE place (owner addition 3: "automatic assign ONLY for clear, strong
 * problems"). By default only the teacher assigns lessons; the platform sends one by itself only when it sees, with high
 * confidence, a clear problem on ONE specific skill:
 *   ACCURACY  ≥ AUTO_MIN_ANSWERS careful answers (rapid guesses excluded) on the skill in the last AUTO_WINDOW_DAYS days
 *             with accuracy ≤ AUTO_MAX_ACCURACY %;
 *   DROPS     the skill's careful accuracy fell AUTO_DROPS weeks in a row (each week ≥ AUTO_DROP_WEEK_ANSWERS answers,
 *             each fall ≥ AUTO_DROP_STEP points, the last week ≤ AUTO_DROP_END_MAX %);
 *   URGENT    the student is Urgent in the Early warning and this skill is their clearly weakest one (≥
 *             AUTO_URGENT_MIN_ANSWERS careful answers, accuracy ≤ AUTO_URGENT_MAX_ACCURACY %): the skill the Early
 *             warning's "Send a lesson" names.
 * AND the student has not had that lesson in the last AUTO_REPEAT_DAYS days, AND no teacher dismissed it (Undo / Change)
 * for that student, AND the student got no other automatic lesson in the last AUTO_STUDENT_DAYS days. Only strong
 * lesson ↔ skill links count (by skill name, family or the same standard). Pure functions: no database here.
 */

/** Days of careful answers read for a skill. */
export const AUTO_WINDOW_DAYS = 21;
/** ACCURACY: at least this many careful answers on the skill in the window … */
export const AUTO_MIN_ANSWERS = 10;
/** … with accuracy at most this (percent). */
export const AUTO_MAX_ACCURACY = 40;
/** DROPS: this many falls in a row (weekly accuracy, so AUTO_DROPS + 1 weeks inside the window). */
export const AUTO_DROPS = 2;
/** DROPS: careful answers needed in each week. */
export const AUTO_DROP_WEEK_ANSWERS = 4;
/** DROPS: each fall is at least this many points. */
export const AUTO_DROP_STEP = 10;
/** DROPS: the last week is at most this (a real problem, not a fall from 100 to 80). */
export const AUTO_DROP_END_MAX = 60;
/** URGENT: the weakest skill of an Urgent student needs at least this many careful answers … */
export const AUTO_URGENT_MIN_ANSWERS = 5;
/** … and accuracy at most this (percent). */
export const AUTO_URGENT_MAX_ACCURACY = 50;
/** Not the same lesson again within this many days (assigned, opened or worked on). */
export const AUTO_REPEAT_DAYS = 14;
/** At most AUTO_PER_STUDENT automatic lessons per student in this many days. */
export const AUTO_STUDENT_DAYS = 7;
export const AUTO_PER_STUDENT = 1;
/** At most this many automatic lessons in one scan of a school (a safety bound). */
export const AUTO_SCAN_MAX = 300;
/** The teacher's "Sent automatically" panel shows this many days. */
export const AUTO_PANEL_DAYS = 14;

const DAY = 86_400_000;
export type AutoTrigger = "ACCURACY" | "DROPS" | "URGENT";
export interface Answer { skillId: string; correct: boolean; at: number }
export interface SkillStat { skillId: string; total: number; correct: number; weeks: { n: number; c: number }[] }
export type Evidence =
  | { kind: "ACCURACY"; correct: number; total: number; days: number }
  | { kind: "DROPS"; weeks: number[]; answers: number[] }
  | { kind: "URGENT"; correct: number; total: number; days: number };
export interface Candidate { skillId: string; trigger: AutoTrigger; evidence: Evidence }

export const pct = (c: number, n: number) => (n > 0 ? Math.round((100 * c) / n) : 0);

/** Careful answers per skill: totals in the window and per week (oldest week first). */
export function skillStats(answers: readonly Answer[], now: number): Map<string, SkillStat> {
  const weeks = AUTO_DROPS + 1, from = now - AUTO_WINDOW_DAYS * DAY;
  const out = new Map<string, SkillStat>();
  for (const a of answers) {
    if (!(a.at >= from && a.at <= now)) continue;
    let st = out.get(a.skillId);
    if (!st) out.set(a.skillId, (st = { skillId: a.skillId, total: 0, correct: 0, weeks: Array.from({ length: weeks }, () => ({ n: 0, c: 0 })) }));
    st.total++; if (a.correct) st.correct++;
    const back = Math.floor((now - a.at) / (7 * DAY)); // 0 = the last 7 days
    if (back < weeks) { const w = st.weeks[weeks - 1 - back]; w.n++; if (a.correct) w.c++; }
  }
  return out;
}

/** The skill's weekly accuracy fell AUTO_DROPS times in a row (see the file comment); the weekly %s, or null. */
export function dropsOf(st: SkillStat): number[] | null {
  if (st.weeks.some((w) => w.n < AUTO_DROP_WEEK_ANSWERS)) return null;
  const p = st.weeks.map((w) => pct(w.c, w.n));
  for (let i = 1; i < p.length; i++) if (p[i - 1] - p[i] < AUTO_DROP_STEP) return null;
  return p[p.length - 1] <= AUTO_DROP_END_MAX ? p : null;
}

/** Every clear problem of one student, strongest first (ACCURACY by accuracy, then DROPS, then URGENT). */
export function detectProblems(stats: Map<string, SkillStat>, urgent: boolean): Candidate[] {
  const all = [...stats.values()];
  const acc = all.filter((st) => st.total >= AUTO_MIN_ANSWERS && pct(st.correct, st.total) <= AUTO_MAX_ACCURACY)
    .sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total) || b.total - a.total || a.skillId.localeCompare(b.skillId))
    .map((st): Candidate => ({ skillId: st.skillId, trigger: "ACCURACY", evidence: { kind: "ACCURACY", correct: st.correct, total: st.total, days: AUTO_WINDOW_DAYS } }));
  const drops = all.map((st) => ({ st, p: dropsOf(st) })).filter((x): x is { st: SkillStat; p: number[] } => x.p !== null)
    .sort((a, b) => a.p[a.p.length - 1] - b.p[b.p.length - 1] || a.st.skillId.localeCompare(b.st.skillId))
    .map(({ st, p }): Candidate => ({ skillId: st.skillId, trigger: "DROPS", evidence: { kind: "DROPS", weeks: p, answers: st.weeks.map((w) => w.n) } }));
  const out = [...acc, ...drops];
  if (urgent) {
    // the clearly weakest skill (one skill only)
    const weakest = all.filter((st) => st.total >= AUTO_URGENT_MIN_ANSWERS).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total) || b.total - a.total || a.skillId.localeCompare(b.skillId))[0];
    if (weakest && pct(weakest.correct, weakest.total) <= AUTO_URGENT_MAX_ACCURACY) out.push({ skillId: weakest.skillId, trigger: "URGENT", evidence: { kind: "URGENT", correct: weakest.correct, total: weakest.total, days: AUTO_WINDOW_DAYS } });
  }
  return out;
}

/** The reason as a translatable template + its values (pages: t(key, vars)). */
export function reasonParts(e: Evidence, skill: string): { key: string; vars: Record<string, string | number> } {
  if (e.kind === "ACCURACY") return { key: "{c} of {n} correct on {skill} in the last 3 weeks", vars: { c: e.correct, n: e.total, skill } };
  if (e.kind === "DROPS") return { key: "{skill} fell two weeks in a row: {weeks}", vars: { skill, weeks: e.weeks.map((x) => `${x}%`).join(" → ") } };
  return { key: "Early warning: urgent. Weakest skill: {skill} ({c} of {n} correct in the last 3 weeks)", vars: { c: e.correct, n: e.total, skill } };
}

/** The reason in plain English words (kept in the row, for the audit). */
export function reasonText(e: Evidence, skill: string): string {
  const { key, vars } = reasonParts(e, skill);
  return key.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")).slice(0, 300);
}
