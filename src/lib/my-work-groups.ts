/**
 * 📋 My Work, organised (owner r67): the rows of My Work in three time groups — Due this week · Later · Done — and, in
 * each, small type groups (Skills, Tests, Reading, Learn, Writing, MAP, NAFS, Other). At most SHOW_FIRST rows of a
 * type group are shown at once (the rest under "Show all"); Done is folded. Pure and client-safe: the page passes the
 * rows it already has (student/all-work.ts is not read again).
 */
import type { WorkKind } from "./work-kinds";

export const SHOW_FIRST = 6;
export type WorkType = "SKILLS" | "TESTS" | "READING" | "LEARN" | "WRITING" | "MAP" | "NAFS" | "OTHER";
export const TYPE_ORDER: WorkType[] = ["SKILLS", "TESTS", "READING", "LEARN", "WRITING", "MAP", "NAFS", "OTHER"];
export const TYPE_LABEL: Record<WorkType, { label: string; icon: string }> = {
  SKILLS: { label: "Skills", icon: "🧩" }, TESTS: { label: "Tests", icon: "📝" }, READING: { label: "Reading", icon: "📖" }, LEARN: { label: "Learn", icon: "📘" },
  WRITING: { label: "Writing", icon: "✍️" }, MAP: { label: "MAP", icon: "🗺️" }, NAFS: { label: "NAFS", icon: "🇸🇦" }, OTHER: { label: "Other", icon: "📌" },
};
export type TimeGroup = "WEEK" | "LATER" | "DONE";
export const TIME_LABEL: Record<TimeGroup, string> = { WEEK: "Due this week", LATER: "Later", DONE: "Done" };

export interface WorkRowLike {
  assignmentId: string; status: "Not started" | "In progress" | "Done"; overdue: boolean; dueAt: string | null; sourceKey: string; kind?: WorkKind | null;
  /** the title shown on the card — used only by searchWork, optional so other callers of the time/type helpers need not supply it */
  skill?: string;
  /** the skill star, when the row is a skill already being learned — used only by byPriority */
  star?: { status?: string; score?: number | null } | null;
}

/** The type of a row: its kind (tests, reading, Learn …), else its program (a MAP / NAFS skill set), else Skills. */
export function typeOf(r: WorkRowLike): WorkType {
  switch (r.kind) {
    case "TEST": return r.sourceKey === "MAP" ? "MAP" : r.sourceKey === "NAFS" ? "NAFS" : "TESTS";
    case "MAP_TEST": return "MAP";
    case "NAFS_TEST": case "NAFS_PRACTICE": return "NAFS";
    case "READRISE": case "READ_ALOUD": return "READING";
    case "WRITING": case "RESPOND": return "WRITING";
    case "LEARN": case "LESSON": return "LEARN";
    case "PLAN": case "EXIT_TICKET": case "SURVEY": return "OTHER";
    default: return r.sourceKey === "MAP" ? "MAP" : r.sourceKey === "NAFS" ? "NAFS" : "SKILLS";
  }
}

const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;
/** The end of this school week (Saturday 23:59 Riyadh): work due by then is "this week". */
export function weekEnd(now: Date): number {
  const local = now.getTime() + RIYADH;
  const dow = new Date(local).getUTCDay(); // 0 Sunday … 6 Saturday
  const midnight = local - (local % DAY);
  return midnight + (7 - dow) * DAY - RIYADH - 1;
}

export function timeOf(r: WorkRowLike, now: Date): TimeGroup {
  if (r.status === "Done") return "DONE";
  if (r.overdue) return "WEEK";
  if (r.dueAt && Date.parse(r.dueAt) <= weekEnd(now)) return "WEEK";
  return "LATER";
}

export interface TypeGroup<T> { type: WorkType; label: string; icon: string; rows: T[]; first: T[]; more: T[] }
export interface WorkGroups<T> { time: TimeGroup; label: string; total: number; types: TypeGroup<T>[] }

/**
 * 🔎 Needier rows first within a group: overdue-and-not-done, then an in-progress skill whose mastery score is
 * still low (it needs more review); everything else keeps its own My Work order (a stable sort — ties never
 * reshuffle, so a school with only a few items in each group sees no change at all).
 */
const NEEDS_REVIEW_BELOW = 60;
export function byPriority<T extends WorkRowLike>(rows: readonly T[]): T[] {
  const rank = (r: T): number => {
    if (r.overdue && r.status !== "Done") return 0;
    const score = r.star && typeof r.star.score === "number" ? r.star.score : null;
    if (score !== null && r.star?.status === "IN_PROGRESS" && score < NEEDS_REVIEW_BELOW) return 1;
    return 2;
  };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}

/** Rows whose title matches the search text (case-insensitive substring); every row when the query is blank. */
export function searchWork<T extends WorkRowLike>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => String(r.skill ?? "").toLowerCase().includes(q)) : (rows as T[]);
}

/** Due this week · Later · Done, each split by type (the rows keep their My Work order inside a group). */
export function groupMyWork<T extends WorkRowLike>(rows: readonly T[], now = new Date(), cap = SHOW_FIRST): WorkGroups<T>[] {
  const out: WorkGroups<T>[] = [];
  for (const time of ["WEEK", "LATER", "DONE"] as TimeGroup[]) {
    const mine = rows.filter((r) => timeOf(r, now) === time);
    const types: TypeGroup<T>[] = [];
    for (const type of TYPE_ORDER) {
      const list = mine.filter((r) => typeOf(r) === type);
      if (list.length) types.push({ type, label: TYPE_LABEL[type].label, icon: TYPE_LABEL[type].icon, rows: list, first: list.slice(0, cap), more: list.slice(cap) });
    }
    out.push({ time, label: TIME_LABEL[time], total: mine.length, types });
  }
  return out;
}
