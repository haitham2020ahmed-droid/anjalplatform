import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { questionOfTheDay } from "@/server/motivation/qotd";
import { syncRewards } from "@/server/motivation/sync";
import { QuestionOfTheDay } from "@/components/student/qotd";
import { hideLevels } from "@/lib/hide-levels";

/**
 * The Question of the Day strip on the student home (no level word reaches the student) (streamed in its own Suspense so the home never waits for
 * it). It also brings the student's rewards up to date (coins, badges, certificates) at most every 10 minutes.
 */
export async function QotdCard({ actor }: { actor: Actor }) {
  if (actor.studentId) await syncRewards(repo, actor.studentId).catch(() => null);
  const q = await questionOfTheDay(repo, actor).catch(() => null);
  if (!q) return null;
  return <QuestionOfTheDay q={q.question} area={hideLevels(q.area)} answered={q.answered} result={q.result} />;
}
