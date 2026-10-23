/**
 * 📊 Internal item-analysis: the NAFS bank questions students most often get WRONG, from the NAFS center's own
 * adaptive practice answers (NafsPracticeAnswer — the one table that records a single question × student × right-or-
 * wrong, scoped by NafsPractice.schoolId). Teacher (Grade 6) / admin only, the same NAFS access as the NAFS center
 * itself (assertNafs): for curriculum review of the question bank, never shown to students or parents, and never
 * changes what a student sees or practises.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertNafs } from "../teacher/nafs-access";
import { loadNafsQuestions, nafsIndex } from "./bank";
import { SKILL_BY_CODE } from "./framework";
import { MIN_ANSWERS } from "./strengths";

const s = (v: unknown) => String(v ?? "");

/** "Enough answers to mean something": the same minimum the rest of NAFS reporting already uses for a cell. */
export const MIN_ITEM_ATTEMPTS = MIN_ANSWERS;
/** At most this many rows are returned (worst first). */
export const MAX_ROWS = 100;

export interface MissedQuestionRow {
  id: string; stem: string; nafsCode: string; skill: string; attempts: number; wrong: number;
  /** wrong ÷ attempts, whole percent */
  missRate: number;
}

function schoolOf(actor: Actor): string {
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  return actor.schoolId;
}

/**
 * The NAFS bank questions with the highest miss rate across every student who attempted them in the NAFS center's
 * adaptive practice, worst-first. Only questions with at least `minAttempts` recorded answers are counted (a question
 * answered once or twice tells nothing). Bounded: the school's practice ids, then their answers in batches of 400.
 */
export async function mostMissedNafsQuestions(repo: Repo, actor: Actor, opts: { limit?: number; minAttempts?: number } = {}): Promise<MissedQuestionRow[]> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  const practices = await repo.findMany("NafsPractice", { schoolId }, { select: ["id"] });
  if (!practices.length) return [];
  const practiceIds = practices.map((p) => s(p.id));
  const byQ = new Map<string, { attempts: number; wrong: number }>();
  for (let i = 0; i < practiceIds.length; i += 400) {
    const chunk = await repo.findMany(
      "NafsPracticeAnswer",
      { practiceId: { in: practiceIds.slice(i, i + 400) } },
      { select: ["questionId", "correct"], take: 20_000 },
    );
    for (const a of chunk) {
      const qid = s(a.questionId);
      const x = byQ.get(qid) ?? { attempts: 0, wrong: 0 };
      x.attempts++;
      if (a.correct !== true) x.wrong++;
      byQ.set(qid, x);
    }
  }
  if (!byQ.size) return [];
  const minAttempts = Math.max(1, opts.minAttempts ?? MIN_ITEM_ATTEMPTS);
  const ids = [...byQ.keys()].filter((id) => byQ.get(id)!.attempts >= minAttempts);
  if (!ids.length) return [];
  const [idx, qs] = await Promise.all([nafsIndex(repo, schoolId), loadNafsQuestions(repo, ids)]);
  const entryOf = new Map(idx.map((e) => [e.id, e]));
  const stemOf = new Map(qs.map((q) => [q.id, q.stem]));
  const rows: MissedQuestionRow[] = ids.map((id) => {
    const x = byQ.get(id)!;
    const code = entryOf.get(id)?.nafsCode ?? "";
    return {
      id, stem: stemOf.get(id) ?? "", nafsCode: code, skill: code ? (SKILL_BY_CODE.get(code)?.name ?? code) : "—",
      attempts: x.attempts, wrong: x.wrong, missRate: Math.round((100 * x.wrong) / x.attempts),
    };
  });
  rows.sort((a, b) => b.missRate - a.missRate || b.attempts - a.attempts || a.stem.localeCompare(b.stem));
  const limit = Math.max(1, Math.min(MAX_ROWS, opts.limit ?? 50));
  return rows.slice(0, limit);
}
