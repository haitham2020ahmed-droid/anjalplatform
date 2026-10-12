/**
 * 🏦 The Question Bank is classified by SKILL + LEVEL only (owner's rule, Update 54):
 *   - every bank question has an absolute level on the MAP RIT scale (its authored Below / On / Above, read at the
 *     grade it was written for, or its calibrated RIT), so any student of any grade gets the questions of a skill
 *     that match HIS level — a weak Grade 6 student practising Main Idea meets Grade 4 Main Idea questions, a strong
 *     Grade 4 student meets Grade 6 ones;
 *   - Curriculum Map questions are the one exception: they stay Grade → Unit → Lesson (they belong to one text of the
 *     book) and are never part of the bank's pools or counts.
 *
 *   mapLinkedQuestionIds   the Curriculum Map questions (cached per write of QuestionMapLink, at most a minute)
 *   RIT_MEAN / thetaShift  how far one grade's "On level" sits from another's on the engine's ability scale
 *   skillGrades            the grade a skill row belongs to (to read its questions' levels)
 *   ritOf / levelFor       a question's absolute RIT and its Below / On / Above for a student of a given grade
 */
import type { Repo } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";

const s = (v: unknown) => String(v ?? "");

/** National Fall reading RIT means by grade (rounded; NWEA norms) — the absolute scale every level is read on. */
export const RIT_MEAN: Record<number, number> = { 0: 140, 1: 160, 2: 175, 3: 188, 4: 199, 5: 206, 6: 211, 7: 214, 8: 217, 9: 219, 10: 221, 11: 223, 12: 224 };
/** one authored level (1–7) = 0.75 on the engine's scale = about a third of a standard deviation (≈ 5 RIT) */
export const THETA_PER_RIT = 0.15;
export const RIT_SD = 15;
const mean = (g: number) => RIT_MEAN[Math.max(0, Math.min(12, Math.round(g)))] ?? 205;

/** The ability-scale distance between "On level" in grade `from` and in grade `to` (+ = harder for `to`). */
export function thetaShift(from: number, to: number): number {
  if (!from || !to || from === to) return 0;
  return Math.round((mean(from) - mean(to)) * THETA_PER_RIT * 100) / 100;
}

/** A question's absolute RIT: its calibrated value, else its authored level read at the grade it was written for. */
export function ritOf(difficultyLevel: number, grade: number, calibratedRit?: number | null): number {
  if (calibratedRit && Number.isFinite(calibratedRit)) return Math.round(calibratedRit);
  return Math.round(mean(grade) + ((Math.max(1, Math.min(7, difficultyLevel)) - 4) / 3) * RIT_SD);
}

/** Below / On / Above of a question for a student of `studentGrade` (±5 RIT around the grade's mean is On). */
export function levelFor(rit: number, studentGrade: number): "BELOW" | "ON" | "ABOVE" {
  const m = mean(studentGrade);
  return rit < m - 5 ? "BELOW" : rit > m + 5 ? "ABOVE" : "ON";
}

/** "201–210" */
export const ritBand = (rit: number) => { const lo = Math.floor((rit - 1) / 10) * 10 + 1; return `${lo}–${lo + 9}`; };

const mapCache = new WeakMap<object, { v: string; at: number; p: Promise<Set<string>> }>();
/** Every Curriculum Map question id (never part of the bank's level classification). */
export function mapLinkedQuestionIds(repo: Repo): Promise<Set<string>> {
  const v = modelVersion("QuestionMapLink"), hit = mapCache.get(repo);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = repo.findMany("QuestionMapLink", {}, { select: ["questionId"] }).then((rows) => new Set(rows.map((r) => s(r.questionId)))).catch((e) => { mapCache.delete(repo); throw e; });
  mapCache.set(repo, { v, at: Date.now(), p });
  return p;
}

const gradeCache = new WeakMap<object, { v: string; at: number; m: Map<string, number> }>();
/** The grade of each skill row (0 when unknown). Cached per write of Skill / Curriculum / Grade. */
export async function skillGrades(repo: Repo, skillIds: readonly string[]): Promise<Map<string, number>> {
  const v = modelVersion("Skill", "Curriculum", "Grade");
  let c = gradeCache.get(repo);
  if (!c || c.v !== v || Date.now() - c.at > 300_000) { c = { v, at: Date.now(), m: new Map() }; gradeCache.set(repo, c); }
  const want = [...new Set(skillIds.map(s))].filter((id) => !c!.m.has(id));
  if (want.length) {
    const skills = await repo.findMany("Skill", { id: { in: want } }, { select: ["id", "curriculumId"] });
    const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
    const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] }) : [];
    const lvl = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
    const curGrade = new Map(curs.map((x) => [s(x.id), lvl.get(s(x.gradeId)) ?? 0]));
    for (const k of skills) c.m.set(s(k.id), curGrade.get(s(k.curriculumId)) ?? 0);
    for (const id of want) if (!c.m.has(id)) c.m.set(id, 0);
  }
  return new Map(skillIds.map((id) => [s(id), c!.m.get(s(id)) ?? 0]));
}
