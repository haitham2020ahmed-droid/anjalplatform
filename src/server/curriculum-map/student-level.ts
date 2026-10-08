/**
 * The ONE place a student's working level (Below / On / Above) changes — from MAP, the teacher, a placement test
 * or an adaptive set — and every change is kept as history (“level.change” in the audit log: from, to, source,
 * and for adaptive sets the path and why the set ended). The next assignment starts from this level.
 */
import type { Repo } from "../seeding/repo";

export type Level = "ABOVE" | "ON" | "BELOW";
export type LevelSource = "MAP_RIT" | "TEACHER" | "PLACEMENT" | "ADAPTIVE";
/** An adaptive set changes the level only with enough evidence… */
export const MIN_ADAPTIVE_ANSWERS = 6;
/** …and never overrides a level a teacher chose in the last 30 days (it is kept as a suggestion instead). */
export const TEACHER_LEVEL_DAYS = 30;

export type Category = "CV" | "ACS" | "RTR";
export const CATEGORY_NAME: Record<Category, string> = { CV: "Concept Vocabulary", ACS: "Analyze Craft and Structure", RTR: "Respond to Reading" };
export interface LevelEvent { studentId: string; level: Level; source: LevelSource; setById?: string | null; reason?: string | null; path?: string[] | null; answers?: number | null; now?: Date;
  /** an adaptive set's category: its result sets the level of THAT category only */
  category?: Category | null }

/** The Curriculum Map category most of these questions are placed in (from their place IDs …TS1.ACS.ON). */
export async function categoryOfQuestions(repo: Repo, questionIds: string[]): Promise<Category | null> {
  if (!questionIds.length) return null;
  const links = await repo.findMany("QuestionMapLink", { questionId: { in: questionIds.slice(0, 60) } }, { select: ["nodeId"] });
  if (!links.length) return null;
  const nodes = await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => String(l.nodeId)))] } }, { select: ["id", "code"] });
  const codeOf = new Map(nodes.map((n) => [String(n.id), String(n.code)]));
  const votes: Record<string, number> = {};
  for (const l of links) { const m = (codeOf.get(String(l.nodeId)) ?? "").match(/\.(CV|ACS|RTR)(\.|$)/); if (m) votes[m[1]] = (votes[m[1]] ?? 0) + 1; }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return best ? (best[0] as Category) : null;
}

/** 🔔 Tells the student's teachers (in-app notification). */
export async function notifyTeachers(repo: Repo, studentId: string, title: string, body: string, now = new Date()): Promise<number> {
  const classIds = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => String(m.classId));
  const teacherIds = classIds.length ? (await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["teacherId"] })).map((t) => String(t.teacherId)) : [];
  const users = teacherIds.length ? (await repo.findMany("Teacher", { id: { in: [...new Set(teacherIds)] } }, { select: ["userId"] })).map((t) => String(t.userId)) : [];
  for (const userId of new Set(users)) await repo.create("Notification", { userId, type: "INTERVENTION_ALERT", title, body, link: `/teacher/students/${studentId}`, readAt: null, createdAt: now });
  return new Set(users).size;
}

/** Sets the level (when allowed) and records the event. Returns what happened. */
export async function recordLevel(repo: Repo, e: LevelEvent): Promise<"CHANGED" | "SAME" | "KEPT_TEACHER" | "TOO_FEW_ANSWERS"> {
  const now = e.now ?? new Date();
  if (e.category) {
    // an adaptive set of one category: that category's level (the teacher's recent overall choice still wins at start)
    const prev = (await repo.findMany("StudentCategoryLevel", { studentId: e.studentId, category: e.category }))[0] ?? null;
    const from = prev ? String(prev.level) : null;
    const outcome = (e.answers ?? 0) < MIN_ADAPTIVE_ANSWERS ? "TOO_FEW_ANSWERS" : from === e.level ? "SAME" : "CHANGED";
    if (outcome !== "TOO_FEW_ANSWERS") {
      if (prev) await repo.updateMany("StudentCategoryLevel", { studentId: e.studentId, category: e.category }, { level: e.level, source: e.source, updatedAt: now });
      else await repo.create("StudentCategoryLevel", { studentId: e.studentId, category: e.category, level: e.level, source: e.source, updatedAt: now });
    }
    if (outcome !== "SAME") {
      // the previous change of this category, read BEFORE this one is recorded (no ordering doubt)
      const tsOf = (l: Record<string, unknown>) => String(l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt);
      const prevChange = (await repo.findMany("AuditLog", { entityType: "Student", entityId: e.studentId, action: "level.change" }))
        .map((l, i) => ({ l, i }))   // equal times: the one recorded later wins
        .filter(({ l }) => (l.after as Record<string, unknown>)?.category === e.category && (l.after as Record<string, unknown>)?.outcome === "CHANGED")
        .sort((x, y) => tsOf(y.l).localeCompare(tsOf(x.l)) || y.i - x.i)[0]?.l;
      await repo.create("AuditLog", { actorId: e.setById ?? null, action: "level.change", entityType: "Student", entityId: e.studentId, before: from ? { level: from } : null,
        after: { level: e.level, source: e.source, outcome, category: e.category, reason: e.reason ?? null, path: e.path ?? null, answers: e.answers ?? null }, createdAt: now });
      // 🔔 a second drop in a row in the same category: tell the teacher
      const RANK: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
      if (outcome === "CHANGED" && from && RANK[e.level] < RANK[from]) {
        const pb = prevChange ? String(((prevChange.before ?? {}) as Record<string, unknown>).level ?? "") : "";
        const pa = prevChange ? String(((prevChange.after ?? {}) as Record<string, unknown>).level ?? "") : "";
        if (pb && pa && RANK[pa] < RANK[pb]) {
          const name = String((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: e.studentId }))?.userId }))?.displayName ?? "A student");
          await notifyTeachers(repo, e.studentId, `📉 ${name} dropped twice in ${CATEGORY_NAME[e.category]}`, `Now at ${e.level.charAt(0) + e.level.slice(1).toLowerCase()} Level after two adaptive sets in a row. Consider small-group re-teaching.`, now);
        }
      }
    }
    return outcome;
  }
  const prev = await repo.findUnique("StudentLevel", { studentId: e.studentId });
  const from = prev ? String(prev.level) : null;
  let outcome: "CHANGED" | "SAME" | "KEPT_TEACHER" | "TOO_FEW_ANSWERS" = from === e.level ? "SAME" : "CHANGED";
  if (e.source === "ADAPTIVE") {
    const teacherAt = prev && String(prev.source) === "TEACHER" ? new Date(String(prev.updatedAt instanceof Date ? prev.updatedAt.toISOString() : prev.updatedAt)).getTime() : 0;
    if ((e.answers ?? 0) < MIN_ADAPTIVE_ANSWERS) outcome = "TOO_FEW_ANSWERS";
    else if (teacherAt && now.getTime() - teacherAt < TEACHER_LEVEL_DAYS * 86_400_000 && from !== e.level) outcome = "KEPT_TEACHER";
  }
  if (outcome === "CHANGED" || outcome === "SAME")
    await repo.upsert("StudentLevel", { studentId: e.studentId }, { level: e.level, source: e.source, setById: e.setById ?? null, updatedAt: now }, { level: e.level, source: e.source, setById: e.setById ?? null, updatedAt: now });
  if (outcome !== "SAME")
    await repo.create("AuditLog", { actorId: e.setById ?? null, action: "level.change", entityType: "Student", entityId: e.studentId, before: from ? { level: from } : null,
      after: { level: e.level, source: e.source, outcome, reason: e.reason ?? null, path: e.path ?? null, answers: e.answers ?? null }, createdAt: now });
  return outcome;
}
