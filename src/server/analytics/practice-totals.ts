/**
 * 📏 THE one definition of "Questions / Accuracy / Minutes" for every report (owner, 1 Nov 2026).
 *
 * Same rules as the Practice and time report (analytics/practice.ts), so every page shows the same numbers:
 *   - answers from every table (bank answers, NAFS practice, ReadRise), labelled by source;
 *   - by default only the sources that build the stars (skill practice, NAFS practice, ReadRise questions);
 *     tests, lessons, ReadMaster and reviews are counted apart in `bySource`;
 *   - accuracy = right answers / careful answers (a rapid guess counts for nothing);
 *   - minutes = time on each answer, at most 5 minutes per answer;
 *   - the hidden Curriculum Map holder skill (questions not linked to a skill yet) is left out;
 *   - skills are counted by shared skill key (copies of one skill = one skill).
 * Students are read 25 at a time and only totals are kept (512 MB server).
 */
import { effortFromCounts } from "../practice/guessing";
import type { Repo } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { skillKeyIndex } from "../skills/status";
import { loadAnswers, riyadhRange, STAR_SOURCES, type AnswerSource } from "./practice";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const PART = 25;

export interface PracticeTotals {
  /** answers of the chosen sources (default: the ones that build the stars) */
  questions: number;
  /** right careful answers */
  correct: number;
  /** answers that were not rapid guesses */
  careful: number;
  /** correct / careful, null when no careful answer */
  accuracy: number | null;
  /** at most 5 minutes per answer */
  minutes: number;
  /** answers with no time (ReadRise) */
  untimed: number;
  /** careful / all (percent), null when no answer */
  effort: number | null;
  /** shared skills practised (by key) */
  skills: number;
  /** every source, whatever was chosen */
  bySource: Record<AnswerSource, number>;
  /** the last answer (ms since epoch), null when none */
  lastAt: number | null;
}

export const emptyTotals = (): PracticeTotals => ({
  questions: 0, correct: 0, careful: 0, accuracy: null, minutes: 0, untimed: 0, effort: null, skills: 0,
  bySource: { PRACTICE: 0, NAFS: 0, READRISE: 0, TESTS: 0, OTHER: 0 }, lastAt: null,
});

/**
 * Questions / accuracy / minutes per student in a date range — the same numbers as Practice and time.
 * `sources` defaults to the star sources (PRACTICE, NAFS, READRISE). `days: true` for a report period (calendar days):
 * the days are read in Riyadh time, like the Practice and time page; leave it off for a rolling window ending now.
 */
export async function practiceTotals(
  repo: Repo, studentIds: readonly string[], from: Date, to: Date,
  opts: { schoolId?: string | null; sources?: readonly AnswerSource[]; days?: boolean } = {},
): Promise<Map<string, PracticeTotals>> {
  // a report period (calendar days, as periods.ts gives them) = the same days in Riyadh time, exactly as Practice and time
  if (opts.days) ({ from, to } = riyadhRange(from, to));
  const out = new Map<string, PracticeTotals>();
  const ids = [...new Set(studentIds.filter(Boolean))];
  for (const id of ids) out.set(id, emptyTotals());
  if (!ids.length) return out;
  const want = new Set<AnswerSource>(opts.sources ?? STAR_SOURCES);
  const schoolId = s(opts.schoolId) || s((await repo.findUnique("Student", { id: ids[0] }))?.schoolId);
  const ix = await skillKeyIndex(repo, schoolId);
  const keyOf = (id: string) => ix.keyOf.get(id) ?? `skill:${id}`;
  const hiddenOf = new Map<string, boolean>();
  const fromT = from.getTime(), toT = to.getTime();
  for (let i = 0; i < ids.length; i += PART) {
    const answers = (await loadAnswers(repo, ids.slice(i, i + PART), from, to)).filter((a) => a.at >= fromT && a.at <= toT);
    const unknown = [...new Set(answers.map((a) => a.skillId).filter((id) => id && !hiddenOf.has(id)))];
    for (let j = 0; j < unknown.length; j += 500) {
      for (const k of await repo.findMany("Skill", { id: { in: unknown.slice(j, j + 500) } }, { select: ["id", "code"] })) hiddenOf.set(s(k.id), isHiddenSkill(s(k.code)));
    }
    const ms = new Map<string, number>(), keys = new Map<string, Set<string>>();
    for (const a of answers) {
      if (!a.skillId || hiddenOf.get(a.skillId)) continue;
      const tot = out.get(a.studentId);
      if (!tot) continue;
      tot.bySource[a.source]++;
      if (!want.has(a.source)) continue;
      tot.questions++;
      if (!a.rapid) { tot.careful++; if (a.correct) tot.correct++; }
      if (a.ms === null) tot.untimed++; else ms.set(a.studentId, (ms.get(a.studentId) ?? 0) + a.ms);
      const k = keys.get(a.studentId) ?? new Set<string>(); k.add(keyOf(a.skillId)); keys.set(a.studentId, k);
      if (tot.lastAt === null || a.at > tot.lastAt) tot.lastAt = a.at;
    }
    for (const id of ids.slice(i, i + PART)) {
      const tot = out.get(id)!;
      tot.accuracy = pct(tot.correct, tot.careful);
      tot.minutes = Math.round((ms.get(id) ?? 0) / 60_000);
      tot.skills = keys.get(id)?.size ?? 0;
      tot.effort = effortFromCounts(tot.questions, tot.questions - tot.careful).effort;
    }
  }
  return out;
}

/** One student's totals (see practiceTotals). */
export async function practiceTotalsFor(repo: Repo, studentId: string, from: Date, to: Date, opts: { schoolId?: string | null; sources?: readonly AnswerSource[]; days?: boolean } = {}): Promise<PracticeTotals> {
  return (await practiceTotals(repo, [studentId], from, to, opts)).get(studentId) ?? emptyTotals();
}
