/**
 * ▶ My Next Step: ONE thing for the student to do now, chosen by the platform, with the reason.
 *
 *   1. the Diagnostic Test, if not finished
 *   2. this week's Weekly Check, if open
 *   3. the teacher's plan: today's part
 *   4. a mastered skill whose spaced review is due
 *   5. the recommended skill (real ability, recent errors, misconceptions, MAP weakest area, teacher work)
 *   6. else the first open skill of My Work
 *
 * Skill suggestions (4–6) are ONLY skills the teacher assigned to the student; with none, there is no next step
 * (href null: the section is hidden).
 *
 * The recommendation shown is saved (Recommendation) and checked a week later (recommendation-log.ts).
 */
import { runAfterResponse } from "../lib/after-response";
import type { Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { myDiagnostic } from "../diagnostic/test";
import { weeklyCheck } from "./weekly-check";
import { todaysPlanStep } from "../curriculum-map/plans";
import { getStudentCurriculum, getUnitSkillCards } from "../queries/student-curriculum";
import { logRecommendations } from "../insights/recommendation-log";
import { misconceptionLabel } from "../../insights/misconceptions";
import { planPath } from "../graph/learning-path";
import { skillOfAssignment } from "../practice/completion";

export interface NextStep {
  kind: "DIAGNOSTIC" | "WEEKLY_CHECK" | "PLAN" | "REVIEW" | "PRACTICE" | "DONE";
  title: string;
  why: string;
  href: string | null;
  cta: string;
  /** the next steps of the personal learning path (student wording) */
  path?: { name: string; action: string; href: string }[];
}

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));

/**
 * The skills the teacher assigned to the student (started, not deleted): every skill id, and the open ones in My
 * Work order (most urgent first). Two bounded reads (the student's own rows).
 */
export async function assignedSkillIds(repo: Repo, studentId: string, now = new Date()): Promise<{ all: Set<string>; open: string[] }> {
  const rows = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId", "status", "completedAt"] });
  if (!rows.length) return { all: new Set(), open: [] };
  const list = await repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "skillId", "skillIds", "startAt", "dueAt", "assessmentId"] });
  const all = new Set<string>();
  const open: { id: string; due: number; overdue: boolean }[] = [];
  for (const a of list) {
    const k = a.assessmentId ? null : skillOfAssignment(a);
    if (!k || (d(a.startAt) && d(a.startAt)! > now)) continue;
    all.add(k);
    const r = rows.find((x) => x.assignmentId === a.id);
    if (r && r.status !== "COMPLETED" && !d(r.completedAt)) open.push({ id: k, due: d(a.dueAt)?.getTime() ?? Infinity, overdue: r.status === "OVERDUE" });
  }
  open.sort((x, y) => Number(y.overdue) - Number(x.overdue) || x.due - y.due);
  return { all, open: [...new Set(open.map((x) => x.id))] };
}

/**
 * `known` (Update 42B): a page that already asks for the Diagnostic, the Weekly Check and today's plan step (the
 * student home) passes its own requests, so they are read once and at the same time instead of again, one by one.
 */
export async function nextStep(repo: Repo, actor: Actor, now = new Date(), known?: { diag: ReturnType<typeof myDiagnostic>; check: ReturnType<typeof weeklyCheck>; plan: ReturnType<typeof todaysPlanStep> }): Promise<NextStep> {
  if (actor.role !== "STUDENT" || !actor.studentId) return { kind: "DONE", title: "", why: "", href: null, cta: "" };
  const studentId = actor.studentId;
  const diag = await (known?.diag ?? myDiagnostic(repo, actor, now));
  if (diag && diag.status !== "DONE") return { kind: "DIAGNOSTIC", title: diag.status === "STARTED" ? "Finish your Diagnostic Test" : "Take your Diagnostic Test", why: "It shows your strengths and what to learn next.", href: diag.href, cta: diag.status === "STARTED" ? "Continue" : "Start" };
  const check = await (known?.check ?? weeklyCheck(repo, actor, now));
  if (check && check.status !== "DONE") return { kind: "WEEKLY_CHECK", title: "This week's Weekly Check", why: "A short check that updates your level.", href: check.href, cta: check.status === "STARTED" ? "Continue" : "Start" };
  const plan = await (known?.plan ?? todaysPlanStep(repo, actor));
  if (plan) return { kind: "PLAN", title: `${plan.title}: ${plan.label}`, why: "The next part of your teacher's plan.", href: plan.href, cta: plan.inProgress ? "Continue" : "Start" };

  // from here on: only skills the teacher assigned to this student (none → no suggestion, the section is hidden)
  const mine = await assignedSkillIds(repo, studentId, now);
  if (!mine.all.size) return { kind: "DONE", title: "", why: "", href: null, cta: "" };
  const assigned = [...mine.all];
  // a mastered skill that is due for its spaced review
  const due = await repo.findMany("StudentSkillMastery", { studentId, skillId: { in: assigned }, isMastered: true, nextReviewAt: { lte: now } }, { select: ["skillId"], orderBy: [{ field: "nextReviewAt", dir: "asc" }], take: 1 });
  if (due.length) {
    const sk = await repo.findUnique("Skill", { id: s(due[0].skillId) });
    if (sk && !sk.deletedAt) return { kind: "REVIEW", title: `Review: ${s(sk.name)}`, why: "You mastered this skill. A quick review keeps it strong.", href: `/practice/${s(sk.id)}`, cta: "Review" };
  }

  // 🧭 the personal learning path (knowledge graph, ability, misconceptions, MAP area, progress speed)
  const fullPath = await planPath(repo, studentId, now, 5).catch(() => null);
  const path = fullPath ? { ...fullPath, steps: fullPath.steps.filter((x) => mine.all.has(x.skillId)) } : null;
  const first = path?.steps.find((x) => x.action !== "REVIEW") ?? path?.steps[0];
  if (path && first) {
    const states = new Map(path.steps.map((x) => [x.skillId, 0]));
    const m = await repo.findMany("StudentSkillMastery", { studentId, skillId: { in: path.steps.map((x) => x.skillId) } }, { select: ["skillId", "score"] });
    for (const r of m) states.set(String(r.skillId), Number(r.score));
    // the recommendation log (outcome tracking) is written after the page is sent (Update 42B)
    runAfterResponse("next_step.recommendations", () => logRecommendations(repo, studentId, path.steps.map((x, i) => ({ skillId: x.skillId, name: x.name, score: path.steps.length - i, targetLevel: x.level, reasons: [{ code: x.action, detail: x.why.join(" · "), weight: x.score }] })), "PATH", states, now).catch(() => 0));
    const why = first.action === "FOUNDATION" ? `This skill is underneath ${first.forSkill?.name ?? "your next skill"}: building it first makes the next one easier.` : first.action === "STRETCH" ? "You are ready for a challenge." : first.why[0] ? `${first.why.slice(0, 2).join(". ")}.` : "The next step in your learning path.";
    return { kind: "PRACTICE", title: first.action === "FOUNDATION" ? `Build up: ${first.name}` : first.name, why, href: `/practice/${first.skillId}`, cta: "Start", path: path.steps.map((x) => ({ name: x.name, action: x.action, href: `/practice/${x.skillId}` })) };
  }
  // fallback: the recommended skill of the current unit
  const cur = await getStudentCurriculum(repo, studentId);
  const unit = cur.units.find((u) => u.isCurrent) ?? cur.units[0];
  if (unit) {
    const { cards } = await getUnitSkillCards(repo, studentId, unit.unitId, now);
    const recs = cards.filter((c) => c.recommended && c.canPractice && mine.all.has(c.skillId));
    const pick = recs[0] ?? cards.find((c) => c.canPractice && !c.isMastered && mine.all.has(c.skillId));
    if (pick) {
      if (recs.length) {
        const mastery = new Map(cards.map((c) => [c.skillId, c.mastery]));
        runAfterResponse("next_step.recommendations", () => logRecommendations(repo, studentId, recs.map((r, i) => ({ skillId: r.skillId, name: r.name, score: recs.length - i, targetLevel: 4, reasons: [{ code: "NEXT_STEP", detail: r.recommendedReason ?? "", weight: 0 }] })), "NEXT_STEP", mastery, now).catch(() => 0));
      }
      const mis = await topMisconception(repo, studentId, pick.skillId);
      const why = mis ? `${pick.recommendedReason ?? "Recommended for you"}. Watch out: ${misconceptionLabel(mis).toLowerCase()}.` : pick.recommendedReason ?? "The next skill in your unit.";
      return { kind: "PRACTICE", title: pick.name, why, href: `/practice/${pick.skillId}`, cta: pick.attempts ? "Practise" : "Start" };
    }
  }
  // the first open skill of My Work
  if (mine.open.length) {
    const sk = await repo.findUnique("Skill", { id: mine.open[0] });
    if (sk && !sk.deletedAt) return { kind: "PRACTICE", title: s(sk.name), why: "Work from your teacher.", href: `/practice/${s(sk.id)}`, cta: "Start" };
  }
  return { kind: "DONE", title: "", why: "", href: null, cta: "" };
}

async function topMisconception(repo: Repo, studentId: string, skillId: string): Promise<string | null> {
  const rows = await repo.findMany("QuestionAttempt", { studentId, skillId, isCorrect: false }, { select: ["misconception"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 10 });
  const c = new Map<string, number>();
  for (const r of rows) if (r.misconception) c.set(s(r.misconception), (c.get(s(r.misconception)) ?? 0) + 1);
  const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 ? top[0] : null;
}
