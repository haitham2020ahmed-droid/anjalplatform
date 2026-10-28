/**
 * 📋 My Work, organised (Oct 2026 restructure, owner r67 → this update): exactly 3 sections — This week · Needs
 * Catch-up · Extra Practice — plus a small, low-prominence "Done" footer, each split into small type groups
 * (Skills, Tests, Reading, Learn, Writing, MAP, NAFS, Other). At most SHOW_FIRST rows of a type group are shown at
 * once (the rest under "Show all"). Pure and client-safe: the page passes the rows it already has (student/
 * all-work.ts is not read again).
 *
 * This replaces the old Due this week / Later / Done time split: "This week" now holds every untagged, not-yet-done
 * row regardless of due date (no more separate "Later" bucket). "Needs Catch-up" is new: an untagged, not-done row
 * that has gone CATCHUP_DAYS or more without being finished. "Extra Practice" is the old per-tab sections (Extra
 * Practice / Review / Previous Term) collapsed into one (see lib/work-tab.ts) — still computed by tabGroups below,
 * unchanged in shape, just down to a single tab value now.
 */
import type { WorkKind } from "./work-kinds";
import { WORK_TABS, WORK_TAB_LABEL, type WorkTab } from "./work-tab";

export const SHOW_FIRST = 6;
export type WorkType = "SKILLS" | "TESTS" | "READING" | "LEARN" | "WRITING" | "MAP" | "NAFS" | "OTHER";
export const TYPE_ORDER: WorkType[] = ["SKILLS", "TESTS", "READING", "LEARN", "WRITING", "MAP", "NAFS", "OTHER"];
export const TYPE_LABEL: Record<WorkType, { label: string; icon: string }> = {
  SKILLS: { label: "Skills", icon: "🧩" }, TESTS: { label: "Tests", icon: "📝" }, READING: { label: "Reading", icon: "📖" }, LEARN: { label: "Learn", icon: "📘" },
  WRITING: { label: "Writing", icon: "✍️" }, MAP: { label: "MAP", icon: "🗺️" }, NAFS: { label: "NAFS", icon: "🇸🇦" }, OTHER: { label: "Other", icon: "📌" },
};

/** the 3 main sections of My Work (a 4th, Done, is shown separately as a minimal footer — not a peer section) */
export type Section = "THIS_WEEK" | "CATCHUP" | "DONE";
export const SECTION_LABEL: Record<Section, string> = { THIS_WEEK: "This week", CATCHUP: "Needs Catch-up", DONE: "Done" };

export interface WorkRowLike {
  assignmentId: string; status: "Not started" | "In progress" | "Done"; overdue: boolean; dueAt: string | null; sourceKey: string; kind?: WorkKind | null;
  /** the title shown on the card — used only by searchWork, optional so other callers of the time/type helpers need not supply it */
  skill?: string;
  /** the skill star, when the row is a skill already being learned — used only by byPriority */
  star?: { status?: string; score?: number | null } | null;
  /** the My Work tab this row is filed under (e.g. "Extra Practice"); set = hidden from the normal 3-section
   * grouping (groupMyWork) and shown under its own tab section instead (tabGroups) */
  tab?: WorkTab | null;
  /**
   * Needs Catch-up: when this row was assigned (its own, or its merged group's leading row's, createdAt — see
   * server/plans/wizard.ts MyWorkItem.assignedAt). startAt (below) wins when it is set — it is only ever set for a
   * scheduled-start assignment, and by the time a row reaches My Work it is already in the past. A row with
   * neither date (most non-skill work: tests, writing, reading-aloud, lessons, surveys, exit tickets, …) is never
   * eligible for Needs Catch-up — there is no reliable "assigned since" date for it — and always counts as This
   * week while not done.
   */
  assignedAt?: string | null;
  startAt?: string | null;
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
/** Needs Catch-up threshold: an untagged, not-done row ages out of "This week" once it has gone this many days
 * since it was assigned (see WorkRowLike.assignedAt above) without being finished. Mirrors the "days since X" idle
 * check server/teacher/needs-attention.ts already uses for idleDays. */
export const CATCHUP_DAYS = 10;

/** Which of the 3 main sections a row belongs to. Tabbed rows never reach this (groupMyWork filters them out first
 * — they are handled by tabGroups instead, see below). */
export function sectionOf(r: WorkRowLike, now: Date): Section {
  if (r.status === "Done") return "DONE";
  const since = r.startAt ?? r.assignedAt ?? null;
  if (since && Math.floor((now.getTime() - Date.parse(since)) / DAY) >= CATCHUP_DAYS) return "CATCHUP";
  return "THIS_WEEK";
}

export interface TypeGroup<T> { type: WorkType; label: string; icon: string; rows: T[]; first: T[]; more: T[] }
export interface WorkGroups<T> { section: Section; label: string; total: number; types: TypeGroup<T>[] }

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

/**
 * This week · Needs Catch-up · Done (in that order), each split by type (the rows keep their My Work order inside
 * a group). A row filed under a My Work tab (r.tab set) is left out here — it shows under Extra Practice instead
 * (tabGroups), never in both places.
 */
export function groupMyWork<T extends WorkRowLike>(rows: readonly T[], now = new Date(), cap = SHOW_FIRST): WorkGroups<T>[] {
  const untabbed = rows.filter((r) => !r.tab);
  const out: WorkGroups<T>[] = [];
  for (const section of ["THIS_WEEK", "CATCHUP", "DONE"] as Section[]) {
    const mine = untabbed.filter((r) => sectionOf(r, now) === section);
    const types: TypeGroup<T>[] = [];
    for (const type of TYPE_ORDER) {
      const list = mine.filter((r) => typeOf(r) === type);
      if (list.length) types.push({ type, label: TYPE_LABEL[type].label, icon: TYPE_LABEL[type].icon, rows: list, first: list.slice(0, cap), more: list.slice(cap) });
    }
    out.push({ section, label: SECTION_LABEL[section], total: mine.length, types });
  }
  return out;
}

export interface TabGroup<T> { tab: WorkTab; label: string; rows: T[] }

/**
 * 📂 My Work tab sections (today just "Extra Practice"): every row filed under a tab (r.tab set), one section per
 * tab in WORK_TABS order — always present, even with 0 rows (the section stays visible with its count so a
 * student/teacher can see it exists, rather than disappearing when nothing is tagged yet). A tabbed row never also
 * appears in groupMyWork's 3 sections — the two functions partition the same rows, they never overlap.
 */
export function tabGroups<T extends WorkRowLike>(rows: readonly T[]): TabGroup<T>[] {
  return WORK_TABS.map((tab) => ({ tab, label: WORK_TAB_LABEL[tab], rows: rows.filter((r) => r.tab === tab) }));
}
