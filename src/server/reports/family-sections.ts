/**
 * 👪 The newer parts of the family report the platform writes (AUTO): Writing, Reading level (ReadRise) and the
 * Fluency Coach plan — and the friendly words every family-facing report uses for a level.
 *
 * The family report is seen by the student, so it never says Below / On / Above, Tier or RTI about them: a level is
 * told as "Growing toward the grade goal", "Meeting the grade goal" or "Reading faster than the grade goal".
 *
 * Writing: only grades the teacher approved and returned (the `approved` snapshot of a locked rubric task) — never
 * the AI's suggestion and never a draft grade the teacher has not approved. ReadRise: the ReadRise Level (never called
 * "Lexile"). Every query is bounded (one student, selected columns, `take`).
 */
import type { Repo, Row } from "../seeding/repo";
import type { ReportSection } from "./family-reports";
import { isLocked } from "../writing/locked";
import { hasLevelWords } from "./family-words";
export { fluencyGoalWords, gradeGoalWords, hasLevelWords } from "./family-words";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const time = (v: unknown): number => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : NaN);
const json = <T>(v: unknown): T | null => { if (v === null || v === undefined || v === "") return null; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } } return v as T; };
/** "23 Nov" */
export const shortDate = (v: unknown): string => { const t = time(v); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : ""; };

// ------------------------------------------------------------------ ✍️ Writing (approved rubric grades only)

interface Approved { levels: Record<string, number>; points: Record<string, number>; comment: string; pct: number; at: string }
interface Criterion { key: string; title: string; levels: { label: string; points: number }[] }

/** A rubric level in friendly words, from its share of the criterion's top points (never the rubric's own label). */
export function criterionWords(points: number, max: number): string {
  const r = max > 0 ? points / max : 0;
  return r >= 0.9 ? "Excellent" : r >= 0.7 ? "Strong" : r >= 0.4 ? "Growing" : "Just starting";
}

const STRENGTH = /\b(good|great|well|strong|excellent|nice|clear|love|loved|liked|wonderful|super|impressive|creative|careful|proud)\b/i;
const NEXT = /\b(next|try|work on|need|needs|should|remember|add|could|focus|practi[cs]e|don't forget|do not forget|improve|check|use more)\b/i;
const sentences = (text: string) => text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 2 && !hasLevelWords(x));

/** One strength and one next step from the teacher's approved comment (sentences with level words are left out). */
export function commentParts(comment: string): { strength: string | null; next: string | null } {
  const list = sentences(comment).map((x) => x.slice(0, 200));
  const next = list.find((x) => NEXT.test(x)) ?? null;
  const strength = list.find((x) => x !== next && STRENGTH.test(x) && !NEXT.test(x)) ?? list.find((x) => x !== next) ?? null;
  return { strength, next };
}

/** The latest graded (approved and returned) locked rubric pieces: title, date, score %, criteria in friendly words. */
export async function writingSection(repo: Repo, studentId: string, take = 3): Promise<ReportSection | null> {
  const subs = await repo.findMany("WritingSubmission", { studentId, status: "SCORED", returnedAt: { not: null } },
    { select: ["taskId", "grading", "returnedAt"], orderBy: [{ field: "returnedAt", dir: "desc" }], take: 12 });
  const graded = subs.map((x) => ({ taskId: s(x.taskId), a: json<{ approved?: Approved | null }>(x.grading)?.approved ?? null })).filter((x): x is { taskId: string; a: Approved } => !!x.a && Number.isFinite(Number(x.a.pct)));
  if (!graded.length) return null;
  const tasks = await repo.findMany("WritingTask", { id: { in: graded.map((x) => x.taskId) }, deletedAt: null }, { select: ["id", "title", "locked", "rubric"] });
  const byId = new Map(tasks.filter((t) => isLocked(t)).map((t) => [s(t.id), t]));
  const pieces = graded.filter((x) => byId.has(x.taskId)).sort((a, b) => time(b.a.at) - time(a.a.at)).slice(0, take);
  if (!pieces.length) return null;
  const lines: string[] = [];
  let parts: { strength: string | null; next: string | null } = { strength: null, next: null };
  let best: { title: string; r: number } | null = null, weakest: { title: string; r: number } | null = null;
  pieces.forEach((p, i) => {
    const t = byId.get(p.taskId) as Row;
    const criteria = (json<{ criteria?: Criterion[] }>(t.rubric)?.criteria ?? []).filter((c) => c && Array.isArray(c.levels));
    const words = criteria.filter((c) => p.a.levels?.[c.key] !== undefined).map((c) => {
      const max = Math.max(0, ...c.levels.map((l) => Number(l.points) || 0));
      const pts = Number(p.a.points?.[c.key] ?? c.levels[p.a.levels[c.key]]?.points ?? 0);
      if (i === 0 && max > 0) {
        const r = pts / max;
        if (!best || r > best.r) best = { title: s(c.title), r };
        if (!weakest || r < weakest.r) weakest = { title: s(c.title), r };
      }
      return `${s(c.title)}: ${criterionWords(pts, max)}`;
    });
    lines.push(`“${s(t.title).slice(0, 120)}” (${shortDate(p.a.at)}): ${Math.round(Number(p.a.pct))}%${words.length ? ` — ${words.join(" · ")}` : ""}.`);
    if (!parts.strength && !parts.next && s(p.a.comment).trim()) parts = commentParts(s(p.a.comment));
  });
  const b = best as { title: string; r: number } | null, w = weakest as { title: string; r: number } | null;
  const strength = parts.strength ?? (b ? `${b.title} is a strong part of the latest piece.` : null);
  const next = parts.next ?? (w && b && w.title !== b.title ? `Next, work on ${w.title.toLowerCase()} in the next piece of writing.` : null);
  if (strength) lines.push(`Strength: ${strength}`);
  if (next) lines.push(`Next step: ${next}`);
  return { heading: "Writing", icon: "✍️", lines };
}

// ------------------------------------------------------------------ 🚀 Reading level (ReadRise)

/** Start of the current term (else the school year, else 120 days ago). */
export async function termStart(repo: Repo, schoolId: string, now: Date): Promise<Date> {
  const year = (await repo.findMany("AcademicYear", { schoolId, isCurrent: true }, { select: ["id", "startDate"], take: 1 }))[0];
  if (year) {
    const terms = await repo.findMany("Term", { academicYearId: year.id }, { select: ["startDate", "endDate"], take: 12 });
    const cur = terms.find((t) => time(t.startDate) <= now.getTime() && time(t.endDate) >= now.getTime());
    if (cur) return new Date(time(cur.startDate));
    if (time(year.startDate) <= now.getTime()) return new Date(time(year.startDate));
  }
  return new Date(now.getTime() - 120 * DAY);
}

/** The ReadRise Level now, growth since placement (or the start), articles finished this term, the weekly goal streak. */
export async function readRiseSection(repo: Repo, studentId: string, now = new Date()): Promise<ReportSection | null> {
  const { studentReadRiseSummary } = await import("../readrise/engine");
  const rr = await studentReadRiseSummary(repo, studentId, now);
  if (!rr) return null;
  // 🎯 no level before the placement test (the first visit's working start is not a level)
  if (!rr.placed) return { heading: "Reading level (ReadRise)", icon: "🚀", lines: ["No placement yet: the ReadRise placement test finds the reading level."] };
  const st = await repo.findUnique("Student", { id: studentId });
  const from = await termStart(repo, s(st?.schoolId), now);
  const done = await repo.findMany("RRRun", { studentId, completedAt: { gte: from } }, { select: ["articleId"], take: 500 });
  const term = new Set(done.map((r) => s(r.articleId))).size;
  const since = rr.source === "PLACEMENT" || rr.placed ? "since the placement" : "since the start";
  const growth = rr.growth > 0 ? `up ${rr.growth} ${since}` : rr.growth === 0 ? `the same as ${since.replace("since ", "")}` : `${rr.growth} ${since} — the level adjusts as more articles are read`;
  const lines = [
    `ReadRise Level: ${rr.level} (started at ${rr.startLevel} · ${growth}).`,
    `Articles finished this term: ${term}.`,
    rr.streak > 0
      ? `Weekly goal (${rr.weeklyGoal} articles a week at 75%+ on the first try): met ${rr.streak} week${rr.streak === 1 ? "" : "s"} in a row.`
      : `Weekly goal: ${rr.weeklyGoal} articles a week at 75%+ on the first try · this week: ${Math.min(rr.thisWeek, rr.weeklyGoal)} of ${rr.weeklyGoal}.`,
  ];
  return { heading: "Reading level (ReadRise)", icon: "🚀", lines };
}

// ------------------------------------------------------------------ 🎙️ Fluency Coach plan

export type HomeFocus = "ACCURACY" | "RATE" | "PROSODY" | "ENRICH";
const FOCUS_WORDS: Record<HomeFocus, string> = {
  ACCURACY: "reading every word correctly",
  RATE: "reading smoothly and a little faster",
  PROSODY: "reading with expression",
  ENRICH: "reading new, harder texts",
};
/** Two concrete things the family can do at home for the plan's focus (accuracy / rate / expression / wider reading). */
export function homeTips(focus: HomeFocus, words: string[] = []): string[] {
  const w = words.filter(Boolean).slice(0, 5);
  switch (focus) {
    case "ACCURACY": return [
      "Listen as your child reads a short page aloud and points to each word; when a word is missed, say it together and read the sentence again.",
      w.length ? `Make word cards for ${w.join(", ")} and practise them together for 2 minutes a day.` : "Make 5 word cards from words your child found hard and practise them together for 2 minutes a day.",
    ];
    case "RATE": return [
      "Time a 1-minute reading of the same page three times this week and celebrate each new number.",
      "Read a page together at the same time, then let your child read it alone, a little smoother each time.",
    ];
    case "PROSODY": return [
      "Read one sentence with expression, then let your child read it back the same way (echo reading).",
      "Read a short dialogue or poem like a play: a different voice for each character, pausing at commas and full stops.",
    ];
    default: return [
      "Visit the library together and let your child choose a slightly harder book or article.",
      "After reading, ask your child to tell you what it was about in 3 sentences.",
    ];
  }
}

/** The current Fluency Coach goal in friendly words, the progress toward it and two things to do at home. */
export async function fluencyPlanSection(repo: Repo, studentId: string, grade: number, now = new Date()): Promise<ReportSection | null> {
  const { latestRemedial, readingEvidence, coldReads } = await import("../fluency/coach");
  const { reviewPlan } = await import("../fluency/remedial");
  // 🐛 fix (audit finding, Oct 2026): this used to cap at the latest 30 FluencyPractice rows. A remedial plan is only
  // ever stored on a passage-type reading (never on an ECHO/DRILL row), so a student doing a lot of echo/drill
  // practice between passage reads could push the last plan-carrying row past this window — the parent would then
  // see a stale/missing plan while the student's and teacher's (unbounded) views already showed the real one. Now
  // unbounded, matching coachHome (coach.ts) and classFluencyView (class-view.ts).
  const [rows, checks] = await Promise.all([
    repo.findMany("FluencyPractice", { studentId }, { select: ["mode", "practiceKind", "wcpm", "accuracy", "plan", "createdAt", "prosody", "expression", "trial"], orderBy: [{ field: "createdAt", dir: "desc" }] }),
    repo.findMany("FluencyCheck", { studentId }, { select: ["wcpm", "accuracy", "checkedAt"], orderBy: [{ field: "checkedAt", dir: "desc" }] }),
  ]);
  if (!rows.length) return null;
  const stored = latestRemedial(rows);
  if (stored) {
    // words/patterns omitted (undefined): a status-only re-check, not a fresh reading — keep the stored list.
    const p = reviewPlan(stored, { grade, cold: coldReads(checks), readings: readingEvidence(rows) }, now);
    const latest = p.status.latest ?? p.baseline.wcpm;
    const left = p.goals.wcpm - latest;
    const lines = [
      `Goal: read ${p.goals.wcpm} words correctly per minute by ${shortDate(p.endsOn)}.`,
      `Focus: ${FOCUS_WORDS[p.focus]}${p.focus === "ACCURACY" ? ` (goal: ${p.goals.accuracy}% of the words read correctly)` : ""}.`,
      left <= 0
        ? `Progress: from ${p.baseline.wcpm} to ${latest} words correctly per minute — the goal is reached!`
        : `Progress: from ${p.baseline.wcpm} to ${latest} words correctly per minute (week ${p.status.week} of ${p.weeks}) · ${left} more to reach the goal.`,
      ...homeTips(p.focus, p.words).map((x) => `At home: ${x}`),
    ];
    return { heading: "Fluency Coach plan", icon: "🎯", lines };
  }
  // an older coach plan (no remedial plan yet): its goal and the next check
  const plan = rows.map((r) => json<{ goal?: number; nextCheck?: string; level?: string; words?: string[]; steps?: unknown[] }>(r.plan)).find((x) => x && Array.isArray(x.steps) && Number(x.goal) > 0);
  if (!plan) return null;
  const minute = rows.find((r) => s(r.mode) === "MINUTE");
  const focus: HomeFocus = plan.level === "ABOVE" ? "ENRICH" : plan.level === "ON" ? "PROSODY" : "RATE";
  return { heading: "Fluency Coach plan", icon: "🎯", lines: [
    `Goal: read ${Number(plan.goal)} words correctly per minute by ${shortDate(plan.nextCheck)}.`,
    ...(minute ? [`Progress: the latest 1-minute reading was ${Number(minute.wcpm)} words correctly per minute${Number(plan.goal) - Number(minute.wcpm) > 0 ? ` · ${Number(plan.goal) - Number(minute.wcpm)} more to reach the goal` : " — the goal is reached!"}.`] : []),
    ...homeTips(focus, Array.isArray(plan.words) ? plan.words : []).map((x) => `At home: ${x}`),
  ] };
}
