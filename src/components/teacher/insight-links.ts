/**
 * ⚡ The five action buttons next to every alert and insight (owner r67: "an action button next to every insight"),
 * the SAME everywhere: Create plan · Small group · Re-teach · Contact parent · Send a Learn lesson. Each opens the one
 * page that already does it (no second tool): Plans (a custom plan for the student or the class), Intervention Groups
 * (the students picked), the skill's practice to re-teach it (Assign), the student file's comments (the student and
 * the parent read them), and Learn → Assign (the skill's lesson). Pure (the component: insight-actions.tsx).
 */
export type InsightAction = "plan" | "group" | "reteach" | "parent" | "lesson";
export const INSIGHT_ACTIONS: readonly { key: InsightAction; label: string; icon: string }[] = [
  { key: "plan", label: "Create plan", icon: "🗂️" },
  { key: "group", label: "Small group", icon: "👥" },
  { key: "reteach", label: "Re-teach", icon: "🔁" },
  { key: "parent", label: "Contact parent", icon: "✉️" },
  { key: "lesson", label: "Send a Learn lesson", icon: "📘" },
];

export interface InsightTarget { classId: string | null; studentId?: string | null; studentIds?: string[]; skillId?: string | null }

/** Where each button goes (null = the button is not offered for this insight). */
export function insightHref(a: InsightAction, x: InsightTarget): string | null {
  const q = (o: Record<string, string | null | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
  const students = x.studentIds?.length ? x.studentIds : x.studentId ? [x.studentId] : [];
  switch (a) {
    case "plan": return `/teacher/plans?${q({ tab: "custom", classId: x.classId, ...(x.studentId ? { who: "student", sid: x.studentId } : {}) })}`;
    case "group": return x.classId ? `/teacher/intervention/groups?${q({ class: x.classId, students: students.join(",") })}` : null;
    case "reteach": return x.skillId ? `/teacher/skill-assign?${q({ skillId: x.skillId, classId: x.classId })}` : x.classId ? `/teacher/learning-loop?${q({ classId: x.classId })}` : null;
    case "parent": return x.studentId ? `/teacher/students/${encodeURIComponent(x.studentId)}#comments` : null;
    case "lesson": return x.skillId ? `/teacher/learn/assign?${q({ kind: "LESSON", skillId: x.skillId, classId: x.classId, studentId: x.studentId })}` : "/teacher/learn";
  }
}
