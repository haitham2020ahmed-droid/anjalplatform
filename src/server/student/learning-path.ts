/**
 * 🧭 A student's adaptive learning path, in one place: the working level (and where it came from), how it changed
 * over time (and why), the path through each recent adaptive set, and how carefully the student answers.
 */
import type { Repo } from "../seeding/repo";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { adaptiveNext } from "../curriculum-map/leveled-run";
import { CATEGORY_NAME, type Category } from "../curriculum-map/student-level";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : s(v));
export interface LearningPath {
  level: { level: string; source: string; at: string } | null;
  /** the level learned in each category's adaptive sets (where the next set of that category starts) */
  categories: { category: string; name: string; level: string; at: string }[];
  history: { at: string; from: string | null; to: string; source: string; outcome: string; reason: string | null; path: string[] | null; answers: number | null; category: string | null }[];
  journeys: { title: string; at: string; start: string; path: string[]; end: string; answers: number; correctPct: number; finished: boolean; reason: string | null }[];
  answers30: number; rapidPct30: number | null; accuracy30: number | null;
}

export async function studentLearningPath(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<LearningPath> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [lv, cats, logs, sessions, recent] = await Promise.all([
    repo.findUnique("StudentLevel", { studentId }),
    repo.findMany("StudentCategoryLevel", { studentId }),
    repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change" }),
    repo.findMany("PracticeSession", { studentId }, { select: ["id", "assessmentId", "assignmentId", "startedAt", "endedAt"] }),
    repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: since } }, { select: ["isCorrect", "rapidGuess"] }),
  ]);
  const history = logs.sort((a, b) => iso(b.createdAt).localeCompare(iso(a.createdAt))).slice(0, 12).map((l) => {
    const after = (l.after ?? {}) as Record<string, unknown>, before = (l.before ?? {}) as Record<string, unknown>;
    return { at: iso(l.createdAt), from: before.level ? s(before.level) : null, to: s(after.level), source: s(after.source), outcome: s(after.outcome), reason: after.reason ? s(after.reason) : null, path: Array.isArray(after.path) ? (after.path as string[]) : null, answers: typeof after.answers === "number" ? after.answers : null, category: after.category ? CATEGORY_NAME[s(after.category) as Category] ?? s(after.category) : null };
  });
  // the last 8 sessions of adaptive sets, replayed exactly as the engine decided them
  const sets = new Map<string, Record<string, unknown>>();
  const withSet = sessions.filter((x) => x.assessmentId).sort((a, b) => iso(b.startedAt).localeCompare(iso(a.startedAt)));
  const journeys: LearningPath["journeys"] = [];
  for (const x of withSet) {
    if (journeys.length >= 8) break;
    const id = s(x.assessmentId);
    if (!sets.has(id)) sets.set(id, (await repo.findUnique("Assessment", { id })) ?? {});
    const set = sets.get(id)!;
    if (!set.isAdaptive) continue;
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId: id })).map((q) => s(q.questionId));
    const atts = await repo.findMany("QuestionAttempt", { sessionId: x.id }, { select: ["isCorrect"] });
    if (!atts.length) continue;
    const stt = await adaptiveNext(repo, set, order, s(x.id), studentId);
    journeys.push({ title: s(set.title), at: iso(x.startedAt), start: stt.start, path: stt.decision.path, end: stt.decision.level, answers: atts.length,
      correctPct: Math.round((100 * atts.filter((a) => a.isCorrect).length) / atts.length), finished: stt.done, reason: stt.decision.reason });
  }
  return {
    level: lv ? { level: s(lv.level), source: s(lv.source), at: iso(lv.updatedAt) } : null,
    categories: cats.map((c) => ({ category: s(c.category), name: CATEGORY_NAME[s(c.category) as Category] ?? s(c.category), level: s(c.level), at: iso(c.updatedAt) })).sort((a, b) => a.name.localeCompare(b.name)),
    history, journeys, answers30: recent.length,
    rapidPct30: recent.length ? Math.round((100 * recent.filter((a) => a.rapidGuess).length) / recent.length) : null,
    accuracy30: recent.length ? Math.round((100 * recent.filter((a) => a.isCorrect).length) / recent.length) : null,
  };
}
