/**
 * Placement check (diagnostic assessment) for a student's own grade.
 * Same protections as practice: own session only, answers accepted only for the
 * current question, server-side timing, response validation, no answer data sent.
 * Differences: no right/wrong feedback during the check, and no mastery changes —
 * it measures a starting point; mastery is earned through practice.
 */
import { DEFAULT_DIAGNOSTIC, domainEstimates, isDiagnosticComplete, nextDiagnosticItem, overallEstimate, proficiencyLabel, type DiagnosticItem, type DiagnosticResponse } from "../../adaptive/diagnostic";
import { isRapidGuess } from "../../adaptive/evidence";
import { ENGINE_VERSION, resolveEngineConfig } from "../../config/engine";
import { scoreResponse } from "../../imports/questions/validate";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { loadItemsForSkills, toClientQuestion, type ClientQuestion, type PracticeItem } from "../practice/items";
import { normalizeResponse } from "../practice/session";
import { getStudentCurriculum } from "../queries/student-curriculum";
import type { Repo, Row } from "../seeding/repo";

export const DOMAIN_LABEL: Record<string, string> = {
  READING: "Reading",
  VOCABULARY: "Vocabulary",
  GRAMMAR: "Grammar",
  LANGUAGE: "Punctuation & capitals",
  WORD_STUDY: "Spelling & word study",
  WRITING: "Writing",
};
const MIN_ITEMS_TO_MEASURE = 4;

export interface DiagnosticView {
  sessionId: string;
  question: ClientQuestion | null;
  answered: number;
  maxQuestions: number;
  finished: boolean;
  result: DiagnosticSummary | null;
}

export interface DiagnosticSummary {
  takenAt: string;
  questions: number;
  proficiency: string;
  domains: { domain: string; label: string; level: string; theta: number; se: number; items: number }[];
  strong: string[];
  growth: string[];
  startWith: { skillId: string; name: string }[];
  support: { skillId: string; name: string }[];
  notMeasured: string[];
}

const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

async function ownStudent(repo: Repo, actor: Actor): Promise<Row> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can take the placement check.");
  return (await repo.findUnique("Student", { id: actor.studentId }))!;
}

/** All published items of the student's curriculum, tagged with their domain. */
async function diagnosticPool(repo: Repo, student: Row) {
  const cur = (await repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true }))[0];
  const skills = await repo.findMany("Skill", { curriculumId: cur.id, isActive: true, deletedAt: null });
  const domainOf = new Map(skills.map((s) => [String(s.id), String(s.domain)]));
  const items = await loadItemsForSkills(repo, skills.map((s) => String(s.id)));
  const counts = new Map<string, number>();
  for (const it of items) counts.set(domainOf.get(it.skillKey)!, (counts.get(domainOf.get(it.skillKey)!) ?? 0) + 1);
  const measurable = new Set([...counts].filter(([, n]) => n >= MIN_ITEMS_TO_MEASURE).map(([dmn]) => dmn));
  const notMeasured = [...new Set(skills.map((s) => String(s.domain)))].filter((x) => !measurable.has(x));
  const usable = items.filter((i) => measurable.has(domainOf.get(i.skillKey)!));
  const pool: DiagnosticItem[] = usable.map((i) => ({ id: i.questionId, skillId: i.skillKey, level: i.level, a: i.irt.a, b: i.irt.b, c: i.irt.c, estimatedSeconds: i.estimatedSeconds, domain: domainOf.get(i.skillKey)! }));
  return { pool, items: new Map(usable.map((i) => [i.questionId, i])), skills, notMeasured };
}

async function sessionState(repo: Repo, session: Row, pool: DiagnosticItem[]) {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const attempts = (await repo.findMany("QuestionAttempt", { sessionId: session.id })).sort((a, b) => d(a.createdAt).getTime() - d(b.createdAt).getTime());
  const responses: DiagnosticResponse[] = attempts.filter((a) => byId.has(String(a.questionId))).map((a) => {
    const it = byId.get(String(a.questionId))!;
    return { itemId: it.id, domain: it.domain, skillId: it.skillId, correct: Boolean(a.isCorrect), a: it.a, b: Number(a.difficultyB), c: it.c, weight: a.rapidGuess ? 0.2 : 1 };
  });
  const logs = (await repo.findMany("AdaptiveDecisionLog", { sessionId: session.id })).sort((a, b) => d(a.createdAt).getTime() - d(b.createdAt).getTime());
  const lastTarget: Record<string, number> = {};
  for (const l of logs) {
    const it = l.nextQuestionId ? byId.get(String(l.nextQuestionId)) : undefined;
    if (it && l.nextTargetB !== null && l.nextTargetB !== undefined) lastTarget[it.domain] = Number(l.nextTargetB);
  }
  return { responses, lastTarget };
}

async function viewOf(repo: Repo, session: Row, items: Map<string, PracticeItem>): Promise<DiagnosticView> {
  const answered = await repo.count("QuestionAttempt", { sessionId: session.id });
  const result = await repo.findUnique("DiagnosticResult", { sessionId: session.id });
  const item = session.currentQuestionId ? items.get(String(session.currentQuestionId)) : undefined;
  return {
    sessionId: String(session.id),
    question: item && !session.endedAt ? toClientQuestion(item, `${session.id}:${item.questionId}`) : null,
    answered, maxQuestions: DEFAULT_DIAGNOSTIC.maxItems, finished: Boolean(session.endedAt),
    result: result ? await summarize(repo, result) : null,
  };
}

export async function startDiagnostic(repo: Repo, actor: Actor, now = new Date()): Promise<DiagnosticView> {
  const student = await ownStudent(repo, actor);
  const { pool, items } = await diagnosticPool(repo, student);
  if (pool.length < 8) throw new ValidationError("The placement check needs more approved questions. Ask your teacher.");
  const open = (await repo.findMany("PracticeSession", { studentId: student.id, mode: "DIAGNOSTIC", endedAt: null }))
    .filter((s) => now.getTime() - d(s.startedAt).getTime() < 2 * 3_600_000 && s.currentQuestionId);
  if (open.length) return viewOf(repo, open[0], items);

  const cfg = resolveEngineConfig();
  const first = nextDiagnosticItem(pool, [], {}, cfg.adaptive);
  const session = await repo.create("PracticeSession", {
    studentId: student.id, mode: "DIAGNOSTIC", startedAt: now, currentQuestionId: first.item!.id, currentServedAt: now, lastTargetB: first.targetB,
  });
  await repo.create("AdaptiveDecisionLog", {
    studentId: student.id, sessionId: session.id, skillId: first.item!.skillId, previousTheta: 0, newTheta: 0, thetaSE: 1,
    nextQuestionId: first.item!.id, nextTargetB: first.targetB, reason: first.reason, reasonCode: "MAX_INFORMATION", engineVersion: ENGINE_VERSION, createdAt: now,
  });
  return viewOf(repo, session, items);
}

export async function submitDiagnosticAnswer(repo: Repo, actor: Actor, input: { sessionId: string; questionId: string; response: unknown }, now = new Date()): Promise<DiagnosticView> {
  const student = await ownStudent(repo, actor);
  const { pool, items, skills, notMeasured } = await diagnosticPool(repo, student);
  await repo.transaction(async (tx) => {
    const s = await tx.findUnique("PracticeSession", { id: input.sessionId });
    if (!s || s.studentId !== student.id || s.mode !== "DIAGNOSTIC") throw new ForbiddenError("This placement check is not yours.");
    if (s.endedAt) throw new ValidationError("This placement check is finished.");
    if (s.currentQuestionId !== input.questionId) throw new ValidationError("This question was already answered. Here is your next one.");
    const item = items.get(input.questionId);
    if (!item) throw new ValidationError("This question is no longer available.");
    const response = normalizeResponse(item, input.response);
    const cfg = resolveEngineConfig();
    const responseMs = Math.max(0, Math.min(30 * 60_000, now.getTime() - d(s.currentServedAt ?? now).getTime()));
    const credit = scoreResponse(item, response);
    const rapid = isRapidGuess({ responseMs, estimatedSeconds: item.estimatedSeconds }, cfg.adaptive);
    const attempt = await tx.create("QuestionAttempt", {
      sessionId: s.id, studentId: student.id, questionId: item.questionId, skillId: item.skillKey, response: { value: response },
      isCorrect: credit >= 1, partialCredit: credit > 0 && credit < 1 ? credit : null, responseMs, usedHint: false, rapidGuess: rapid, difficultyB: item.irt.b, createdAt: now,
    });
    const { responses, lastTarget } = await sessionState(tx, s, pool);
    const domains = [...new Set(pool.map((p) => p.domain))].sort();
    const done = isDiagnosticComplete(domains, responses, cfg.adaptive);
    const next = done ? null : nextDiagnosticItem(pool, responses, lastTarget, cfg.adaptive);
    const thisDomain = pool.find((p) => p.id === item.questionId)!.domain;
    // previousTheta = estimate BEFORE this answer (needed for unbiased item calibration)
    const before = domainEstimates([thisDomain], responses.slice(0, -1), cfg.adaptive)[0];
    const est = domainEstimates([thisDomain], responses, cfg.adaptive)[0];
    await tx.create("AdaptiveDecisionLog", {
      studentId: student.id, sessionId: s.id, attemptId: attempt.id, questionId: item.questionId, skillId: item.skillKey,
      previousTheta: before.theta, newTheta: est.theta, thetaSE: est.se, questionDifficulty: item.irt.b, responseCorrect: credit >= 1, responseMs,
      nextQuestionId: next?.item?.id ?? null, nextTargetB: next?.targetB ?? null,
      reason: next?.item ? next.reason : "Placement complete: every area measured precisely enough (or question limit reached).",
      reasonCode: next?.item ? "MAX_INFORMATION" : "DIAGNOSTIC_COMPLETE", engineVersion: ENGINE_VERSION, createdAt: now,
    });
    if (next?.item) {
      await tx.updateMany("PracticeSession", { id: s.id }, { questionCount: responses.length, currentQuestionId: next.item.id, currentServedAt: now, lastTargetB: next.targetB });
      return;
    }
    // ---- finish: estimates, seeds for practice, recommendations
    const per = domainEstimates(domains, responses, cfg.adaptive);
    const overall = overallEstimate(responses, cfg.adaptive);
    for (const e of per)
      await tx.upsert("StudentAbility", { studentId: student.id, scope: `DOMAIN:${e.domain}` }, { domain: e.domain, theta: e.theta, thetaSE: e.se, responses: e.items },
        { theta: e.theta, thetaSE: e.se, responses: e.items });
    await tx.upsert("StudentAbility", { studentId: student.id, scope: "GLOBAL" }, { theta: overall.theta, thetaSE: overall.se, responses: responses.length },
      { theta: overall.theta, thetaSE: overall.se, responses: responses.length });

    const strong = per.filter((e) => e.theta >= 0.5).map((e) => e.domain);
    const weak = per.filter((e) => e.theta <= -0.35).sort((a, b) => a.theta - b.theta).map((e) => e.domain);
    const curriculum = await getStudentCurriculum(tx, String(student.id));
    const current = curriculum.units.find((u) => u.isCurrent)!;
    const unitSkillIds = new Set((await tx.findMany("UnitSkill", { unitId: current.unitId })).map((l) => String(l.skillId)));
    const practisable = new Set(pool.map((p) => p.skillId));
    const lowestFirst = [...per].sort((a, b) => a.theta - b.theta).map((e) => e.domain);
    const startWith = lowestFirst.flatMap((dm) => skills.filter((k) => k.domain === dm && unitSkillIds.has(String(k.id)) && practisable.has(String(k.id)))).slice(0, 3);
    const supportDomains = per.filter((e) => e.theta < -1).map((e) => e.domain);
    const prereqTargets = new Set((await tx.findMany("SkillPrerequisite", { skillId: { in: skills.map((k) => k.id) } })).map((p) => String(p.prerequisiteSkillId)));
    const support = skills
      .filter((k) => supportDomains.includes(String(k.domain)) && prereqTargets.has(String(k.id)) && practisable.has(String(k.id)))
      .sort((a, b) => Number(a.sequence) - Number(b.sequence)).slice(0, 3);
    await tx.create("DiagnosticResult", {
      studentId: student.id, sessionId: s.id, takenAt: now, questions: responses.length, overallTheta: overall.theta, overallSE: overall.se,
      proficiency: proficiencyLabel(overall.theta),
      domains: [...per.map((e) => ({ ...e, label: proficiencyLabel(e.theta) })), ...notMeasured.map((dm) => ({ domain: dm, notMeasured: true }))],
      strongDomains: strong, weakDomains: weak,
      recommendedSkillIds: startWith.map((k) => String(k.id)), interventionSkillIds: support.map((k) => String(k.id)), engineVersion: ENGINE_VERSION,
    });
    await tx.updateMany("PracticeSession", { id: s.id }, { questionCount: responses.length, currentQuestionId: null, currentServedAt: null, endedAt: now, endReason: "COMPLETED" });
  });
  const fresh = (await repo.findUnique("PracticeSession", { id: input.sessionId }))!;
  return viewOf(repo, fresh, items);
}

async function summarize(repo: Repo, r: Row): Promise<DiagnosticSummary> {
  const domains = (r.domains as { domain: string; theta?: number; se?: number; items?: number; label?: string; notMeasured?: boolean }[]);
  const ids = [...(r.recommendedSkillIds as string[]), ...(r.interventionSkillIds as string[])];
  const names = new Map((ids.length ? await repo.findMany("Skill", { id: { in: ids } }) : []).map((k) => [String(k.id), String(k.name)]));
  return {
    takenAt: d(r.takenAt).toISOString(),
    questions: Number(r.questions),
    proficiency: String(r.proficiency),
    domains: domains.filter((x) => !x.notMeasured).map((x) => ({ domain: x.domain, label: DOMAIN_LABEL[x.domain] ?? x.domain, level: x.label!, theta: x.theta!, se: x.se!, items: x.items! })),
    strong: (r.strongDomains as string[]).map((x) => DOMAIN_LABEL[x] ?? x),
    growth: (r.weakDomains as string[]).map((x) => DOMAIN_LABEL[x] ?? x),
    startWith: (r.recommendedSkillIds as string[]).map((id) => ({ skillId: id, name: names.get(id) ?? "" })),
    support: (r.interventionSkillIds as string[]).map((id) => ({ skillId: id, name: names.get(id) ?? "" })),
    notMeasured: domains.filter((x) => x.notMeasured).map((x) => DOMAIN_LABEL[x.domain] ?? x.domain),
  };
}

/** Latest placement result for a student (own record, or a teacher/parent with access checked by the caller). */
export async function latestDiagnostic(repo: Repo, studentId: string): Promise<DiagnosticSummary | null> {
  const all = (await repo.findMany("DiagnosticResult", { studentId })).sort((a, b) => d(b.takenAt).getTime() - d(a.takenAt).getTime());
  return all.length ? summarize(repo, all[0]) : null;
}
