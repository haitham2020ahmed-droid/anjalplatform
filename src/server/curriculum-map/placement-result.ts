/**
 * When a student finishes: an adaptive set (curriculum or Placement) sets their level to the level they reached;
 * a fixed Placement test sets it from the score (80%+ Above, 50–79% On, under 50% Below).
 */
import type { Repo } from "../seeding/repo";
import { adaptiveNext } from "./leveled-run";

export async function applyPlacementResult(repo: Repo, assessmentId: string, sessionId: string, studentId: string, now = new Date()): Promise<"ABOVE" | "ON" | "BELOW" | null> {
  const set = await repo.findUnique("Assessment", { id: assessmentId });
  if (!set) return null;
  let level: "ABOVE" | "ON" | "BELOW" | null = null;
  if (set.isAdaptive) {
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId })).map((x) => String(x.questionId));
    const st = await adaptiveNext(repo, set, order, sessionId, studentId);
    if (!st.done) return null;
    level = st.decision.level;
  } else {
    if (String(set.type) !== "PLACEMENT") return null;
    const total = await repo.count("AssessmentQuestion", { assessmentId });
    const attempts = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["isCorrect"] });
    if (!total || attempts.length < total) return null;
    const pct = Math.round((100 * attempts.filter((a) => a.isCorrect).length) / total);
    level = pct >= 80 ? "ABOVE" : pct >= 50 ? "ON" : "BELOW";
  }
  const source = String(set.type) === "PLACEMENT" ? "PLACEMENT" : "ADAPTIVE";
  await repo.upsert("StudentLevel", { studentId }, { level, source, setById: null, updatedAt: now }, { level, source, setById: null, updatedAt: now });
  return level;
}
