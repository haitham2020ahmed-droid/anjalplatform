/**
 * Nightly item-analysis job: QuestionStats (with quality flags) for every answered
 * question, then calibration of questions with enough responses. Every difficulty
 * change is audited (old → new) so teachers/admins can see why an item moved.
 * Ability for each response = the engine's estimate BEFORE that answer (decision log).
 */
import { LEVEL_TO_B } from "../../config/engine";
import { calibrateItem, computeItemStats, DEFAULT_CALIBRATION, type CalibrationOptions, type ItemMeta, type ItemResponse } from "../../analytics/item-analysis";
import { audit } from "../audit";
import type { Repo } from "../seeding/repo";

export interface ItemAnalysisReport {
  analysed: number;
  flagged: number;
  calibrated: number;
  flags: Record<string, number>;
}

export async function runItemAnalysis(repo: Repo, opts: Partial<CalibrationOptions> = {}, now = new Date()): Promise<ItemAnalysisReport> {
  const o = { ...DEFAULT_CALIBRATION, ...opts };
  const attempts = await repo.findMany("QuestionAttempt");
  const byQ = new Map<string, typeof attempts>();
  for (const a of attempts) (byQ.get(String(a.questionId)) ?? byQ.set(String(a.questionId), []).get(String(a.questionId))!).push(a);
  const qIds = [...byQ.keys()];
  if (!qIds.length) return { analysed: 0, flagged: 0, calibrated: 0, flags: {} };
  const [questions, options, logs] = await Promise.all([
    repo.findMany("Question", { id: { in: qIds } }),
    repo.findMany("QuestionOption", { questionId: { in: qIds } }),
    repo.findMany("AdaptiveDecisionLog", { questionId: { in: qIds } }),
  ]);
  const thetaByAttempt = new Map(logs.filter((l) => l.attemptId !== null && l.attemptId !== undefined).map((l) => [String(l.attemptId), Number(l.previousTheta)]));
  const rep: ItemAnalysisReport = { analysed: 0, flagged: 0, calibrated: 0, flags: {} };

  for (const q of questions) {
    const id = String(q.id);
    const opts2 = options.filter((x) => x.questionId === q.id);
    const meta: ItemMeta = {
      questionId: id, estimatedSeconds: Number(q.estimatedSeconds),
      optionLabels: opts2.map((x) => String(x.label)), keyLabels: opts2.filter((x) => x.isCorrect).map((x) => String(x.label)),
      a: Number(q.irtA), b: Number(q.irtB), c: Number(q.irtC), authoredB: LEVEL_TO_B[Number(q.difficultyLevel)] ?? Number(q.irtB),
    };
    const rs: ItemResponse[] = byQ.get(id)!.map((a) => {
      const v = (a.response as { value?: unknown } | null)?.value;
      return {
        questionId: id, correct: Boolean(a.isCorrect), responseMs: Number(a.responseMs), rapid: Boolean(a.rapidGuess),
        chosen: typeof v === "string" && meta.optionLabels.includes(v) ? v : null,
        ability: thetaByAttempt.get(String(a.id)) ?? 0,
      };
    });
    const st = computeItemStats(meta, rs);
    await repo.upsert("QuestionStats", { questionId: id }, {
      attempts: st.attempts, correct: st.correct, pValue: st.pValue, pointBiserial: st.pointBiserial,
      avgResponseMs: st.avgResponseMs === null ? null : Math.round(st.avgResponseMs), distractorCounts: st.distractorCounts, flags: st.flags,
    }, {
      attempts: st.attempts, correct: st.correct, pValue: st.pValue, pointBiserial: st.pointBiserial,
      avgResponseMs: st.avgResponseMs === null ? null : Math.round(st.avgResponseMs), distractorCounts: st.distractorCounts, flags: st.flags,
    });
    rep.analysed++;
    if (st.flags.length) rep.flagged++;
    for (const f of st.flags) rep.flags[f] = (rep.flags[f] ?? 0) + 1;

    const cal = calibrateItem(meta, rs, o);
    if (cal.calibrated && (Math.abs(cal.newB - cal.oldB) >= 0.01 || Math.abs(cal.newA - cal.oldA) >= 0.01)) {
      await repo.updateMany("Question", { id }, { irtB: cal.newB, irtA: cal.newA, calibrated: true });
      await audit(repo, { actorId: null, action: "question.calibrate", entityType: "Question", entityId: id, before: { b: cal.oldB, a: cal.oldA }, after: { b: cal.newB, a: cal.newA, n: cal.n, reason: cal.reason }, at: now });
      rep.calibrated++;
    }
  }
  return rep;
}
