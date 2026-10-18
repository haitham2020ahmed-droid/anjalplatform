/**
 * ⭐ Skill stars — the words (client-safe, no server imports). One place for the five statuses' names, for teachers
 * and for students, and the plain-words tooltip every icon shows ("Mastered 5 days ago after 34 questions · review in
 * 16 days"). Students never see level words or "failed".
 */
export type StarStatus = "NOT_STARTED" | "IN_PROGRESS" | "MASTERED" | "NEXT_LEVEL" | "NEEDS_REVIEW";
export const STAR_ORDER: readonly StarStatus[] = ["NOT_STARTED", "IN_PROGRESS", "MASTERED", "NEXT_LEVEL", "NEEDS_REVIEW"];
export type Audience = "teacher" | "student";

export const TEACHER_WORD: Record<StarStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", MASTERED: "Mastered", NEXT_LEVEL: "Next level", NEEDS_REVIEW: "Needs review" };
export const STUDENT_WORD: Record<StarStatus, string> = { NOT_STARTED: "Not started yet", IN_PROGRESS: "Learning", MASTERED: "Mastered 🎉", NEXT_LEVEL: "New challenge", NEEDS_REVIEW: "Review time" };
/** the symbol of each status in plain text (PDF footers, CSV, the System check counts) */
export const STAR_SYMBOL: Record<StarStatus, string> = { NOT_STARTED: "☆", IN_PROGRESS: "◐", MASTERED: "⭐", NEXT_LEVEL: "☆⬆", NEEDS_REVIEW: "🔄" };
export const wordOf = (st: StarStatus, who: Audience): string => (who === "student" ? STUDENT_WORD : TEACHER_WORD)[st];
/** The teacher's short level word of a star (the word next to the icon): "Needs support" when flagged, else TEACHER_WORD. */
export const teacherWordOf = (x: { status: StarStatus; needsSupport?: boolean }): string => (x.needsSupport ? "Needs support" : TEACHER_WORD[x.status]);

/** What each status means (teacher legend and guide). */
export const TEACHER_MEANING: Record<StarStatus, string> = {
  NOT_STARTED: "No skill practice yet.",
  IN_PROGRESS: "Practising: the star comes after at least 30 questions with mastery.",
  MASTERED: "At least 30 questions and the engine's mastery. A review check comes 3 weeks later.",
  NEXT_LEVEL: "Mastered at the previous level; a new challenge at the new level.",
  NEEDS_REVIEW: "Missed the review check: the skill is back in the plan until it is mastered again.",
};
export const STUDENT_MEANING: Record<StarStatus, string> = {
  NOT_STARTED: "You have not started this skill yet.",
  IN_PROGRESS: "You are learning this skill. Keep going!",
  MASTERED: "You mastered this skill!",
  NEXT_LEVEL: "A new challenge is ready for this skill.",
  NEEDS_REVIEW: "Time to review this skill and win the star back.",
};

export interface StarInfo {
  status: StarStatus; level?: number; answered?: number; score?: number; masteredAt?: string | null; reviewDueAt?: string | null; needsSupport?: boolean;
}
type T = (text: string, vars?: Record<string, string | number>) => string;
const plain: T = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : text);
const daysBetween = (a: number, b: number) => Math.max(0, Math.round((b - a) / 86_400_000));

/** The tooltip of an icon: what it means, when, and the next step (plain words). */
export function starTooltip(x: StarInfo, who: Audience, t: T = plain, now = Date.now()): string {
  const n = x.answered ?? 0;
  if (who === "student") {
    if (x.status === "MASTERED") return t("You mastered this skill!");
    if (x.status === "IN_PROGRESS") return t("You are learning this skill. Keep going!");
    return t(STUDENT_MEANING[x.status]);
  }
  switch (x.status) {
    case "NOT_STARTED": return `${t("Not started")} · ${t("No skill practice yet.")} ${t("Next: assign it or practise it from a plan.")}`;
    case "IN_PROGRESS":
      if (x.needsSupport) return `${t("Needs support")} · ${t("{n} questions without mastery", { n })} · ${t("Next: the RTI plan suggests this skill.")}`;
      return `${t("In progress")} · ${t("{n} questions answered, mastery {score}%", { n, score: x.score ?? 0 })} · ${t("The star comes after at least 30 questions with mastery.")}`;
    case "MASTERED": {
      const ago = x.masteredAt ? daysBetween(Date.parse(x.masteredAt), now) : null;
      const due = x.reviewDueAt ? Math.round((Date.parse(x.reviewDueAt) - now) / 86_400_000) : null;
      const head = ago === null ? t("Mastered") : ago === 0 ? t("Mastered today after {n} questions", { n }) : t("Mastered {d} days ago after {n} questions", { d: ago, n });
      return due === null ? head : due > 0 ? `${head} · ${t("review in {d} days", { d: due })}` : `${head} · ${t("review check due now")}`;
    }
    case "NEXT_LEVEL": return `${t("Next level")} · ${t("Mastered at the previous level; a new challenge at the new level.")}`;
    case "NEEDS_REVIEW": return `${t("Needs review")} · ${t("Missed the review check.")} ${t("Next: practise it again to win the star back.")}`;
  }
}
