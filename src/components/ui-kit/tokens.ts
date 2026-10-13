/**
 * Design tokens shared by every page, report and table (no React here, so server code can use them too).
 * ONE colour per source everywhere: Curriculum = blue, MAP = green, RTI = orange, Grammar = purple, NAFS = teal.
 */
export type SourceKey = "CURRICULUM" | "MAP" | "RTI" | "GRAMMAR" | "NAFS" | "VOCABULARY" | "CUSTOM";
export type TestTypeKey = "NAFS" | "MAP" | "DIAGNOSTIC" | "WEEKLY_QUIZ" | "CHAPTER_TEST" | "REVIEW" | "CUSTOM" | "OTHER";
export type TagKey = SourceKey | TestTypeKey;

export interface TagStyle { label: string; icon: string; className: string; hex: string }

/** Tailwind classes (white-card friendly) + a hex for PDFs/Excel. Labels are English source strings for t(). */
export const TAG_STYLE: Record<TagKey, TagStyle> = {
  CURRICULUM: { label: "Curriculum", icon: "📘", className: "bg-blue-50 text-blue-800 ring-blue-200", hex: "#1d4ed8" },
  MAP: { label: "MAP", icon: "🗺️", className: "bg-green-50 text-green-800 ring-green-200", hex: "#15803d" },
  RTI: { label: "RTI", icon: "🛟", className: "bg-orange-50 text-orange-800 ring-orange-200", hex: "#c2410c" },
  GRAMMAR: { label: "Grammar", icon: "🔤", className: "bg-purple-50 text-purple-800 ring-purple-200", hex: "#7e22ce" },
  NAFS: { label: "NAFS", icon: "🎯", className: "bg-teal-50 text-teal-800 ring-teal-200", hex: "#0f766e" },
  VOCABULARY: { label: "Vocabulary", icon: "📒", className: "bg-indigo-50 text-indigo-800 ring-indigo-200", hex: "#4338ca" },
  DIAGNOSTIC: { label: "Diagnostic", icon: "🩺", className: "bg-rose-50 text-rose-800 ring-rose-200", hex: "#be123c" },
  WEEKLY_QUIZ: { label: "Weekly Quiz", icon: "📝", className: "bg-amber-50 text-amber-900 ring-amber-200", hex: "#b45309" },
  CHAPTER_TEST: { label: "Chapter Test", icon: "📗", className: "bg-sky-50 text-sky-800 ring-sky-200", hex: "#0369a1" },
  REVIEW: { label: "Review", icon: "🔁", className: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200", hex: "#a21caf" },
  CUSTOM: { label: "Custom", icon: "✳️", className: "bg-slate-100 text-slate-700 ring-slate-200", hex: "#475569" },
  OTHER: { label: "Other", icon: "✳️", className: "bg-slate-100 text-slate-700 ring-slate-200", hex: "#475569" },
};

/** Loose input ("map", "Weekly Quiz", "grammar") → the tag key; unknown names are custom tests. */
export function tagKey(v: string | null | undefined): TagKey {
  const k = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (k in TAG_STYLE) return k as TagKey;
  if (k === "CCSS" || k === "UNIT" || k === "LESSON") return "CURRICULUM";
  if (k === "QUIZ") return "WEEKLY_QUIZ";
  return "CUSTOM";
}

export type WorkStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";
export const STATUS_STYLE: Record<WorkStatus, { label: string; icon: string; className: string }> = {
  NOT_STARTED: { label: "Not started", icon: "○", className: "bg-slate-100 text-slate-700 ring-slate-200" },
  IN_PROGRESS: { label: "In progress", icon: "◐", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  DONE: { label: "Done", icon: "✓", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

/** Loose status input (COMPLETED, STARTED, ASSIGNED, …) → one of the three words students see. */
export function workStatus(v: string | null | undefined): WorkStatus {
  const k = String(v ?? "").toUpperCase();
  if (["DONE", "COMPLETED", "MASTERED", "SUBMITTED", "FINISHED"].includes(k)) return "DONE";
  if (["IN_PROGRESS", "STARTED", "ACTIVE", "PRACTISING", "PRACTICING"].includes(k)) return "IN_PROGRESS";
  return "NOT_STARTED";
}

/** Shared sizes: smaller, lighter buttons (14px text), still at least 40px tall for fingers on iPad / phone. */
export const BTN = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition hover:-translate-y-px active:translate-y-0 active:scale-[.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-teal motion-reduce:hover:translate-y-0";
/** the ONE main action of a page (navy, soft glow) */
export const BTN_PRIMARY = `${BTN} bg-brand-navy text-white shadow-btn hover:brightness-110`;
/** the saffron action on a navy card (the student home's Continue / Start): navy text on saffron, both day and night */
export const BTN_ACCENT = `${BTN} bg-accent text-on-accent font-bold shadow-sm hover:brightness-105`;
/** every other action: white with a thin outline */
export const BTN_SECONDARY = `${BTN} bg-surface text-ink shadow-sm ring-1 ring-line hover:bg-surface-2 hover:ring-brand-teal`;
export const CARD = "rounded-[1.25rem] bg-surface p-5 shadow-card ring-1 ring-line sm:p-6";
