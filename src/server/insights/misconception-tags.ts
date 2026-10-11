/**
 * Misconceptions in the database:
 *   tagOptions        gives every wrong option without a code its misconception (rules: rationale + skill family).
 *                     Runs after a question import, from the admin page, and in the daily job (backfill, bounded).
 *   groupMisconceptions the most common misconceptions of a group of students (last N days), with who has them.
 */
import { classifyMisconception, MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");

/** Tags wrong options that have no misconception yet (or only the given questions). Returns how many were tagged. */
export async function tagOptions(repo: Repo, opts: { questionIds?: string[]; limit?: number } = {}): Promise<number> {
  const where: Record<string, unknown> = { isCorrect: false, misconception: null };
  if (opts.questionIds) { if (!opts.questionIds.length) return 0; where.questionId = { in: opts.questionIds }; }
  const options = await repo.findMany("QuestionOption", where, { select: ["id", "questionId", "rationale"], take: opts.limit ?? 5000 });
  if (!options.length) return 0;
  const qs = await repo.findMany("Question", { id: { in: [...new Set(options.map((o) => s(o.questionId)))] } }, { select: ["id", "skillId"] });
  const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "code", "familyId", "category"] });
  const fams = new Map((await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "code"] })).map((f) => [s(f.id), s(f.code)]));
  const skillInfo = new Map(skills.map((k) => [s(k.id), { code: s(k.code), familyCode: fams.get(s(k.familyId)), category: s(k.category) }]));
  const qSkill = new Map(qs.map((q) => [s(q.id), skillInfo.get(s(q.skillId)) ?? { code: "", familyCode: undefined, category: "" }]));
  const byCode = new Map<string, string[]>();
  for (const o of options) {
    const k = qSkill.get(s(o.questionId));
    const code = classifyMisconception(k?.code ?? "", o.rationale ? s(o.rationale) : null, { familyCode: k?.familyCode, category: k?.category });
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), s(o.id)]);
  }
  let n = 0;
  for (const [code, ids] of byCode) for (let i = 0; i < ids.length; i += 500) n += await repo.updateMany("QuestionOption", { id: { in: ids.slice(i, i + 500) } }, { misconception: code, misconceptionSource: "RULE" });
  return n;
}

export interface GroupMisconception { code: string; label: string; fix: string; answers: number; students: { id: string; count: number }[]; skills: string[] }

/**
 * The most common misconceptions of these students over the last `days`: only students who chose it clearly more often
 * than chance (detectMisconceptions: 3+ times, lift 1.5+), so the group a teacher pulls really has the mistake.
 */
export async function groupMisconceptions(repo: Repo, studentIds: string[], days = 30, now = new Date(), top = 5): Promise<GroupMisconception[]> {
  if (!studentIds.length) return [];
  const since = new Date(now.getTime() - days * 86_400_000);
  const detected = await detectMisconceptions(repo, studentIds, since);
  const by = new Map<string, { answers: number; students: { id: string; count: number }[] }>();
  for (const [sid, list] of detected) for (const d of list) { const g = by.get(d.code) ?? { answers: 0, students: [] }; g.answers += d.count; g.students.push({ id: sid, count: d.count }); by.set(d.code, g); }
  if (!by.size) return [];
  const rows = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, isCorrect: false, createdAt: { gte: since }, misconception: { in: [...by.keys()] } }, { select: ["skillId", "misconception"] });
  const skillsOf = new Map<string, Set<string>>();
  for (const r of rows) { const set = skillsOf.get(s(r.misconception)) ?? new Set(); set.add(s(r.skillId)); skillsOf.set(s(r.misconception), set); }
  const skillIds = [...new Set(rows.map((r) => s(r.skillId)))];
  const names = new Map((skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] }) : []).map((k) => [s(k.id), s(k.name)]));
  return [...by.entries()]
    .map(([code, g]) => ({ code, label: MISCONCEPTION_BY_CODE.get(code)?.label ?? code, fix: MISCONCEPTION_BY_CODE.get(code)?.fix ?? "", answers: g.answers, students: g.students.sort((a, b) => b.count - a.count), skills: [...(skillsOf.get(code) ?? [])].map((id) => names.get(id) ?? "").filter(Boolean).slice(0, 4) }))
    .sort((a, b) => b.students.length - a.students.length || b.answers - a.answers)
    .slice(0, top);
}

export interface DetectedMisconception { code: string; count: number; chances: number; lift: number }

/**
 * A student's real misconceptions, corrected for chance: a wrong answer can only show a misconception that one of
 * the wrong options carries, and a random wrong pick lands on it sometimes anyway. For every code:
 *   chances = wrong answers where an option with that code was there · count = times the student chose it
 *   lift    = count ÷ the count expected from random wrong picks
 * Kept: chosen 3+ times with a lift of 1.5+ (chosen clearly more often than chance), strongest first — and (Update
 * 39C) only when chance alone would rarely give that many: the probability of at least `count` picks from random wrong
 * answers (each chance with its own share of options carrying the code, a Poisson-binomial tail) must be ≤ 1 % (5 %
 * shared over the several codes tested for each student, Bonferroni). With few wrong answers 3 of 4 picks on a
 * two-distractor item happens by chance a third of the time; 5 of 5 on a three-distractor item almost never (0.4 %).
 */
export const MISCONCEPTION_MAX_P = 0.01;
/** P(X ≥ k) for X = the number of successes of independent trials with probabilities ps (exact, by recursion). */
export function chanceAtLeast(ps: number[], k: number): number {
  if (k <= 0) return 1;
  let dist = [1];
  for (const p of ps) {
    const next = new Array(Math.min(dist.length + 1, k + 1)).fill(0);
    for (let j = 0; j < dist.length; j++) {
      next[Math.min(j, k)] += dist[j] * (1 - p);
      next[Math.min(j + 1, k)] += dist[j] * p;
    }
    dist = next;
  }
  return dist[k] ?? 0;
}
export async function detectMisconceptions(repo: Repo, studentIds: string[], since: Date): Promise<Map<string, DetectedMisconception[]>> {
  const out = new Map<string, DetectedMisconception[]>();
  if (!studentIds.length) return out;
  const wrong = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, isCorrect: false, createdAt: { gte: since } }, { select: ["studentId", "questionId", "misconception"] });
  const qIds = [...new Set(wrong.map((w) => s(w.questionId)))];
  const opts = qIds.length ? await repo.findMany("QuestionOption", { questionId: { in: qIds }, isCorrect: false }, { select: ["questionId", "misconception"] }) : [];
  const byQ = new Map<string, string[]>();
  for (const o of opts) byQ.set(s(o.questionId), [...(byQ.get(s(o.questionId)) ?? []), s(o.misconception)]);
  const acc = new Map<string, Map<string, { count: number; chances: number; expected: number; ps: number[] }>>();
  for (const w of wrong) {
    const codes = byQ.get(s(w.questionId));
    if (!codes || !codes.length) continue;
    const m = acc.get(s(w.studentId)) ?? new Map();
    for (const code of new Set(codes.filter(Boolean))) {
      const e = m.get(code) ?? { count: 0, chances: 0, expected: 0, ps: [] as number[] };
      const share = codes.filter((c) => c === code).length / codes.length;
      e.chances++; e.expected += share; e.ps.push(share);
      if (s(w.misconception) === code) e.count++;
      m.set(code, e);
    }
    acc.set(s(w.studentId), m);
  }
  for (const [sid, m] of acc) {
    const list = [...m.entries()].map(([code, e]) => ({ code, count: e.count, chances: e.chances, lift: e.expected ? Math.round((e.count / e.expected) * 100) / 100 : 0 }))
      .filter((x) => x.count >= 3 && x.lift >= 1.5 && chanceAtLeast(m.get(x.code)!.ps, x.count) <= MISCONCEPTION_MAX_P).sort((a, b) => b.lift * b.count - a.lift * a.count);
    out.set(sid, list.slice(0, 3));
  }
  return out;
}
