/** Readiness C-2 repair: wrap old Review-my-mistakes answers (raw value) in the practice shape { value }. */
import type { Repo } from "../seeding/repo";

const wrapped = (r: unknown) => Boolean(r && typeof r === "object" && !Array.isArray(r) && "value" in (r as Record<string, unknown>));

export async function wrapReviewResponses(repo: Repo, apply: boolean): Promise<{ sessions: number; attempts: number; fixed: number }> {
  const sessions = await repo.findMany("PracticeSession", { endReason: "REVIEW" }, { select: ["id"] });
  let attempts = 0, fixed = 0;
  for (let i = 0; i < sessions.length; i += 200) {
    const ids = sessions.slice(i, i + 200).map((x) => x.id);
    const rows = await repo.findMany("QuestionAttempt", { sessionId: { in: ids } }, { select: ["id", "response"] });
    attempts += rows.length;
    for (const r of rows) {
      if (wrapped(r.response)) continue;
      fixed++;
      // an empty object was stored for a missing answer: keep it as "no answer"
      const v = r.response && typeof r.response === "object" && !Array.isArray(r.response) && !Object.keys(r.response as object).length ? null : r.response;
      if (apply) await repo.updateMany("QuestionAttempt", { id: r.id }, { response: { value: v } });
    }
  }
  return { sessions: sessions.length, attempts, fixed };
}
