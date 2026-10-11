/**
 * 📋 Progress checks — scoring from the students' answers (bounded queries, no per-student loops over the DB).
 * Used by the results views and by the support tiers (completed checks are check points of kind PROGRESS).
 */
import type { Repo, Row } from "../seeding/repo";
import { passed } from "./select";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
export const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };

export type CheckStatus = "NOT_ASSIGNED" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
export interface CheckScore {
  status: CheckStatus;
  answered: number;
  total: number;
  /** % of the check (unanswered items count as wrong), only once completed */
  pct: number | null;
  comprehension: number | null;
  vocabulary: number | null;
  pass: boolean;
  /** skills of the items answered wrong (or left out), most missed first */
  missedSkills: { skillId: string; missed: number }[];
  completedAt: Date | null;
}

const pctOf = (got: number, of: number) => (of > 0 ? Math.round((100 * got) / of) : null);

/** Scores every (check, student) pair: key `${checkId}|${studentId}`. */
export async function scoreChecks(repo: Repo, checks: Row[], studentIds: string[]): Promise<Map<string, CheckScore>> {
  const out = new Map<string, CheckScore>();
  if (!checks.length || !studentIds.length) return out;
  const aids = checks.map((c) => s(c.assignmentId));
  const [links, sessions] = await Promise.all([
    repo.findMany("AssignmentStudent", { assignmentId: { in: aids }, studentId: { in: studentIds } }, { select: ["assignmentId", "studentId", "status", "completedAt"] }),
    repo.findMany("PracticeSession", { assignmentId: { in: aids }, studentId: { in: studentIds } }, { select: ["id", "assignmentId", "studentId", "endedAt"] }),
  ]);
  const attempts = sessions.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessions.map((x) => s(x.id)) } }, { select: ["sessionId", "questionId", "skillId", "isCorrect", "partialCredit", "createdAt"] }) : [];
  const sessionOf = new Map(sessions.map((x) => [s(x.id), x]));
  // latest answer per (assignment, student, question)
  const latest = new Map<string, Row>();
  for (const a of attempts) {
    const ses = sessionOf.get(s(a.sessionId)); if (!ses) continue;
    const k = `${s(ses.assignmentId)}|${s(ses.studentId)}|${s(a.questionId)}`;
    const prev = latest.get(k);
    if (!prev || (d(a.createdAt)?.getTime() ?? 0) >= (d(prev.createdAt)?.getTime() ?? 0)) latest.set(k, a);
  }
  const ended = new Map<string, Date>();
  for (const x of sessions) { const e = d(x.endedAt); if (e) { const k = `${s(x.assignmentId)}|${s(x.studentId)}`; if (!ended.has(k) || ended.get(k)! < e) ended.set(k, e); } }
  const link = new Map(links.map((l) => [`${s(l.assignmentId)}|${s(l.studentId)}`, l]));
  // the skill of each item (from the answers; items nobody answered: looked up once)
  const skillOf = new Map<string, string>();
  for (const a of attempts) skillOf.set(s(a.questionId), s(a.skillId));
  const allQ = [...new Set(checks.flatMap((c) => Object.keys(json<Record<string, string>>(c.categories, {}))))].filter((id) => !skillOf.has(id));
  if (allQ.length) for (const q of await repo.findMany("Question", { id: { in: allQ } }, { select: ["id", "skillId"] })) skillOf.set(s(q.id), s(q.skillId));

  for (const c of checks) {
    const cats = json<Record<string, string>>(c.categories, {});
    const items = Object.keys(cats);
    for (const sid of studentIds) {
      const l = link.get(`${s(c.assignmentId)}|${sid}`);
      if (!l) { out.set(`${s(c.id)}|${sid}`, { status: "NOT_ASSIGNED", answered: 0, total: items.length, pct: null, comprehension: null, vocabulary: null, pass: false, missedSkills: [], completedAt: null }); continue; }
      let answered = 0, got = 0;
      const sub = { COMPREHENSION: { got: 0, of: 0 }, VOCABULARY: { got: 0, of: 0 } };
      const missed = new Map<string, number>();
      for (const q of items) {
        const a = latest.get(`${s(c.assignmentId)}|${sid}|${q}`);
        const credit = a ? (a.partialCredit !== null && a.partialCredit !== undefined ? Math.max(0, Math.min(1, Number(a.partialCredit))) : a.isCorrect ? 1 : 0) : 0;
        if (a) answered++;
        got += credit;
        const cat = cats[q] === "VOCABULARY" ? "VOCABULARY" : cats[q] === "COMPREHENSION" ? "COMPREHENSION" : null;
        if (cat) { sub[cat].of++; sub[cat].got += credit; }
        if (credit < 1) { const sk = skillOf.get(q); if (sk) missed.set(sk, (missed.get(sk) ?? 0) + 1); }
      }
      const linkStatus = s(l.status);
      const completed = linkStatus === "COMPLETED" || (items.length > 0 && answered >= items.length) || ended.has(`${s(c.assignmentId)}|${sid}`);
      const status: CheckStatus = completed ? "COMPLETED" : linkStatus === "OVERDUE" ? "OVERDUE" : answered > 0 ? "IN_PROGRESS" : "NOT_STARTED";
      const pct = completed ? pctOf(got, items.length) : null;
      out.set(`${s(c.id)}|${sid}`, {
        status, answered, total: items.length, pct,
        comprehension: completed ? pctOf(sub.COMPREHENSION.got, sub.COMPREHENSION.of) : null,
        vocabulary: completed ? pctOf(sub.VOCABULARY.got, sub.VOCABULARY.of) : null,
        pass: passed(pct),
        missedSkills: completed ? [...missed].map(([skillId, n]) => ({ skillId, missed: n })).sort((a, b) => b.missed - a.missed || a.skillId.localeCompare(b.skillId)) : [],
        completedAt: completed ? d(l.completedAt) ?? ended.get(`${s(c.assignmentId)}|${sid}`) ?? null : null,
      });
    }
  }
  return out;
}

/** Completed progress checks of these students since a date, as tier check points (kind PROGRESS). */
export async function progressCheckPoints(repo: Repo, schoolId: string, studentIds: string[], since: Date, now: Date): Promise<Map<string, { at: Date; pct: number; kind: "PROGRESS"; assignmentId: string }[]>> {
  const out = new Map<string, { at: Date; pct: number; kind: "PROGRESS"; assignmentId: string }[]>();
  if (!studentIds.length) return out;
  const checks = await repo.findMany("ProgressCheck", { schoolId, createdAt: { gte: since } }, { select: ["id", "assignmentId", "categories", "createdAt"] });
  if (!checks.length) return out;
  // only the checks these students were given
  const given = await repo.findMany("AssignmentStudent", { assignmentId: { in: checks.map((c) => s(c.assignmentId)) }, studentId: { in: studentIds } }, { select: ["assignmentId", "studentId"] });
  if (!given.length) return out;
  const want = new Set(given.map((g) => s(g.assignmentId)));
  const mine = checks.filter((c) => want.has(s(c.assignmentId)));
  const who = [...new Set(given.map((g) => s(g.studentId)))];
  const scores = await scoreChecks(repo, mine, who);
  for (const c of mine) for (const sid of who) {
    const x = scores.get(`${s(c.id)}|${sid}`);
    if (!x || x.status !== "COMPLETED" || x.pct === null) continue;
    const l = out.get(sid) ?? [];
    l.push({ at: x.completedAt ?? d(c.createdAt) ?? now, pct: x.pct, kind: "PROGRESS", assignmentId: s(c.assignmentId) });
    out.set(sid, l);
  }
  return out;
}
