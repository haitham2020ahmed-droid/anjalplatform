/**
 * ⭐ The student's stars on their own pages (My Work, My MAP plan) — ONE read of the student's statuses and one of the
 * week's goal, then everything is derived: the "8 of 20 skills mastered" counts, the light celebration of a new star
 * (once), the self-check question after a finished skill, the weekly goal's progress, and which My Work rows are skills
 * already mastered (a plan never asks for a mastered skill again). Students never see level words.
 */
import type { Repo, Row } from "../seeding/repo";
import { currentRows, ms, skillKeyIndex, studentSchool, viewOf, type StarView } from "./status";
import { goalWeekStart, GOAL_SCOPE, type SkillGoal } from "./status-extras";
import { isReviewWork } from "../practice/completion";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const DAY = 86_400_000;

export interface StudentStars {
  /** key → status (current level) */
  byKey: Map<string, StarView>;
  mastered: number;
  started: number;
  /** names of new stars to celebrate now (each once) */
  celebrate: string[];
  /** the skill to ask "Do you feel you understood it?" about */
  selfCheck: { key: string; skill: string } | null;
  goal: SkillGoal | null;
}

export async function studentStarsSummary(repo: Repo, studentId: string, now = new Date(), opts: { celebrate?: boolean } = {}): Promise<StudentStars> {
  const ws = goalWeekStart(now);
  const [rows, goals] = await Promise.all([
    repo.findMany("SkillStatus", { studentId }),
    repo.findMany("WeeklyGoal", { scope: GOAL_SCOPE, ownerId: studentId, weekStart: ws }, { select: ["target", "title"] }),
  ]);
  const cur = currentRows(rows);
  const byKey = new Map([...cur].map(([k, r]) => [k, viewOf(r)]));
  const list = [...cur.values()];
  const recent = (r: Row) => ms(r.masteredAt) >= now.getTime() - 14 * DAY;
  const fresh = opts.celebrate === false ? [] : list.filter((r) => s(r.status) === "MASTERED" && !r.celebratedAt && recent(r));
  const ask = list.filter((r) => !r.selfCheck && ((s(r.status) === "MASTERED" && recent(r)) || (r.needsSupportAt && ms(r.needsSupportAt) >= now.getTime() - 14 * DAY))).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))[0];
  const needNames = fresh.length > 0 || Boolean(ask);
  const ix = needNames ? await skillKeyIndex(repo, await studentSchool(repo, studentId)) : null;
  const nameOf = (k: string) => ix?.nameOf.get(k) ?? "a skill";
  if (fresh.length) await repo.updateMany("SkillStatus", { id: { in: fresh.map((r) => r.id) } }, { celebratedAt: now });
  const g = goals[0];
  const weekStars = list.filter((r) => s(r.status) === "MASTERED" && ms(r.masteredAt) >= ws.getTime()).length;
  return {
    byKey,
    mastered: list.filter((r) => s(r.status) === "MASTERED").length,
    started: list.filter((r) => s(r.status) !== "NOT_STARTED").length,
    celebrate: fresh.map((r) => nameOf(s(r.skillKey))),
    selfCheck: ask ? { key: s(ask.skillKey), skill: nameOf(s(ask.skillKey)) } : null,
    goal: g ? { target: Number(g.target), mastered: weekStars, done: weekStars >= Number(g.target), setBy: s(g.title) === "TEACHER" ? "TEACHER" : "STUDENT" } : null,
  };
}

/**
 * My Work: a skill row whose skill was already ⭐ when the work was set is a REVIEW (20 questions, 16 right to pass):
 * flagged `review` for its label; it stays open until the review is done (never "Done" by itself any more).
 */
export async function markMasteredWork<T extends { skillId: string | null; sourceKey: string; status: string; assignedAt?: string }>(repo: Repo, studentId: string, rows: T[], byKey: Map<string, StarView>): Promise<T[]> {
  // owner 1 Nov 2026: a skill mastered BEFORE the work was set is never marked Done here any more — it is a 20-question
  // REVIEW (practice/completion.ts): the row stays open with a "Review · 20 questions" label until the review is done
  const open = rows.filter((r) => r.skillId && r.status !== "Done");
  if (!open.length || ![...byKey.values()].some((v) => v.status === "MASTERED" || v.status === "NEXT_LEVEL")) return rows;
  const ix = await skillKeyIndex(repo, await studentSchool(repo, studentId));
  return rows.map((r) => {
    if (!open.includes(r)) return r;
    const v = byKey.get(ix.keyOf.get(s(r.skillId)) ?? "");
    return isReviewWork(v ? { status: v.status, masteredAt: v.masteredAt } : null, r.assignedAt) ? ({ ...r, review: true } as T) : r;
  });
}
