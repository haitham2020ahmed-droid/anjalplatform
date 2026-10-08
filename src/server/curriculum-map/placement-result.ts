/**
 * When a student finishes: an adaptive set (curriculum or Placement) sets their level to the level they reached;
 * a fixed Placement test sets it from the score (80%+ Above, 50–79% On, under 50% Below).
 */
import type { Repo } from "../seeding/repo";
import { adaptiveNext } from "./leveled-run";
import { categoryOfQuestions, notifyTeachers, recordLevel } from "./student-level";

export async function applyPlacementResult(repo: Repo, assessmentId: string, sessionId: string, studentId: string, now = new Date()): Promise<"ABOVE" | "ON" | "BELOW" | null> {
  const set = await repo.findUnique("Assessment", { id: assessmentId });
  if (!set) return null;
  let level: "ABOVE" | "ON" | "BELOW" | null = null;
  let reason: string | null = null, path: string[] | null = null;
  // the evidence is the careful answers: rapid guesses say nothing about the level
  const answers = await repo.count("QuestionAttempt", { sessionId, rapidGuess: false });
  const allAnswers = await repo.count("QuestionAttempt", { sessionId });
  if (set.isAdaptive) {
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId })).map((x) => String(x.questionId));
    const st = await adaptiveNext(repo, set, order, sessionId, studentId);
    if (!st.done) return null;
    // 🚀 beyond Above (the next grade's text) → Above; 🛟 below Below (the previous grade's text) → Below
    level = st.decision.level === "CHALLENGE" ? "ABOVE" : st.decision.level === "SUPPORT" ? "BELOW" : st.decision.level;
    reason = st.decision.reason; path = st.decision.path;
  } else {
    if (String(set.type) !== "PLACEMENT") return null;
    const total = await repo.count("AssessmentQuestion", { assessmentId });
    const attempts = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["isCorrect"] });
    if (!total || attempts.length < total) return null;
    const pct = Math.round((100 * attempts.filter((a) => a.isCorrect).length) / total);
    level = pct >= 80 ? "ABOVE" : pct >= 50 ? "ON" : "BELOW";
  }
  const source = String(set.type) === "PLACEMENT" ? "PLACEMENT" : "ADAPTIVE";
  // an adaptive set needs enough answers, and a teacher's recent choice is respected (kept as a suggestion)
  const category = source === "ADAPTIVE" ? await categoryOfQuestions(repo, (await repo.findMany("AssessmentQuestion", { assessmentId }, { select: ["questionId"] })).map((x) => String(x.questionId))) : null;
  const outcome = await recordLevel(repo, { studentId, level, source, reason: reason ?? (source === "PLACEMENT" ? "placement test" : null), path, answers, now, category });
  // 🔔 answered too fast to have read: tell the teacher (once per set)
  const rapid = await repo.count("QuestionAttempt", { sessionId, rapidGuess: true });
  if (allAnswers >= 8 && rapid / allAnswers >= 0.3) {
    const name = String((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))?.userId }))?.displayName ?? "A student");
    await notifyTeachers(repo, studentId, `⚡ ${name} answered too fast`, `${Math.round((100 * rapid) / allAnswers)}% of ${allAnswers} answers in “${String(set.title)}” were rapid guesses: the result may be lower than their real level.`, now);
  }
  return outcome === "CHANGED" || outcome === "SAME" ? level : null;
}
