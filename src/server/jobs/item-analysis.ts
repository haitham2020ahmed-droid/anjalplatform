/**
 * Nightly item-analysis job: QuestionStats (with quality flags) for every answered question, then calibration of
 * questions with enough responses. Every difficulty change is audited (old → new).
 *
 * Built for large banks: questions are processed in pages of 200 (only their answers of the last 365 days are read).
 * Ability for each response = the engine's estimate BEFORE that answer (decision log — practice, the placement check
 * and assigned sets all write one). Answers without a decision log are left out of discrimination and calibration:
 * the student's current ability already includes the answer (future data) and would bias the item.
 * Calibration uses the engine's configured IRT model (2PL by default), the same model scoring and selection use.
 * Prior for calibration = the authored level blended with the text-based estimate (src/questions/intelligence.ts).
 */
import { DEFAULT_ADAPTIVE, LEVEL_TO_B } from "../../config/engine";
import { calibrateItem, computeItemStats, DEFAULT_CALIBRATION, type CalibrationOptions, type ItemMeta, type ItemResponse } from "../../analytics/item-analysis";
import { audit } from "../audit";
import type { Repo, Row } from "../seeding/repo";

export interface ItemAnalysisReport {
  analysed: number;
  flagged: number;
  calibrated: number;
  flags: Record<string, number>;
}

const PAGE = 200;
const s = (v: unknown) => String(v ?? "");

export async function runItemAnalysis(repo: Repo, opts: Partial<CalibrationOptions> = {}, now = new Date()): Promise<ItemAnalysisReport> {
  const o = { ...DEFAULT_CALIBRATION, model: DEFAULT_ADAPTIVE.model, ...opts };
  const rep: ItemAnalysisReport = { analysed: 0, flagged: 0, calibrated: 0, flags: {} };
  const since = new Date(now.getTime() - 365 * 86_400_000);
  for (let skip = 0; ; skip += PAGE) {
    const questions = await repo.findMany("Question", { deletedAt: null }, { orderBy: [{ field: "id" }], skip, take: PAGE });
    if (!questions.length) break;
    const ids = questions.map((q) => s(q.id));
    const attempts = await repo.findMany("QuestionAttempt", { questionId: { in: ids }, createdAt: { gte: since } }, { select: ["id", "questionId", "studentId", "skillId", "isCorrect", "responseMs", "rapidGuess", "response"] });
    if (!attempts.length) continue;
    const [options, logs] = await Promise.all([
      repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "label", "isCorrect"] }),
      repo.findMany("AdaptiveDecisionLog", { attemptId: { in: attempts.map((a) => a.id) } }, { select: ["attemptId", "previousTheta"] }),
    ]);
    const thetaByAttempt = new Map(logs.filter((l) => l.previousTheta !== null && l.previousTheta !== undefined).map((l) => [s(l.attemptId), Number(l.previousTheta)]));
    const byQ = new Map<string, Row[]>();
    for (const a of attempts) byQ.set(s(a.questionId), [...(byQ.get(s(a.questionId)) ?? []), a]);
    for (const q of questions) {
      const id = s(q.id);
      const rows = byQ.get(id);
      if (!rows) continue;
      const opts2 = options.filter((x) => x.questionId === q.id);
      const authored = LEVEL_TO_B[Number(q.difficultyLevel)] ?? Number(q.irtB);
      const prior = q.estimatedB !== null && q.estimatedB !== undefined && q.difficultySource !== "ESTIMATE" ? (2 * authored + Number(q.estimatedB)) / 3 : authored;
      const meta: ItemMeta = {
        questionId: id, estimatedSeconds: Number(q.estimatedSeconds),
        optionLabels: opts2.map((x) => s(x.label)), keyLabels: opts2.filter((x) => x.isCorrect).map((x) => s(x.label)),
        a: Number(q.irtA), b: Number(q.irtB), c: Number(q.irtC), authoredB: prior,
      };
      const rs: ItemResponse[] = rows.map((a) => {
        const v = (a.response as { value?: unknown } | null)?.value;
        return {
          questionId: id, correct: Boolean(a.isCorrect), responseMs: Number(a.responseMs), rapid: Boolean(a.rapidGuess),
          chosen: typeof v === "string" && meta.optionLabels.includes(v) ? v : null,
          ability: thetaByAttempt.get(s(a.id)) ?? null, // no pre-answer θ: not used for discrimination/calibration
        };
      });
      const st = computeItemStats(meta, rs);
      const stats = { attempts: st.attempts, correct: st.correct, pValue: st.pValue, pointBiserial: st.pointBiserial, avgResponseMs: st.avgResponseMs === null ? null : Math.round(st.avgResponseMs), distractorCounts: st.distractorCounts, flags: st.flags };
      await repo.upsert("QuestionStats", { questionId: id }, stats, stats);
      rep.analysed++;
      if (st.flags.length) rep.flagged++;
      for (const f of st.flags) rep.flags[f] = (rep.flags[f] ?? 0) + 1;

      const cal = calibrateItem(meta, rs, o);
      if (cal.calibrated && (Math.abs(cal.newB - cal.oldB) >= 0.01 || Math.abs(cal.newA - cal.oldA) >= 0.01)) {
        // a level a person set stays marked as theirs (src/server/questions/reclassify.ts only suggests for it)
        await repo.updateMany("Question", { id }, { irtB: cal.newB, irtA: cal.newA, calibrated: true, difficultySource: q.difficultySource === "MANUAL" || q.difficultySource === "TEACHER" ? q.difficultySource : "CALIBRATED" });
        await audit(repo, { actorId: null, action: "question.calibrate", entityType: "Question", entityId: id, before: { b: cal.oldB, a: cal.oldA }, after: { b: cal.newB, a: cal.newA, n: cal.n, reason: cal.reason }, at: now });
        rep.calibrated++;
      }
    }
  }
  return rep;
}
