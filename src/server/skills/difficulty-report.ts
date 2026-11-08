/**
 * 🎚️ The skill page: where the students are stuck inside one skill (Easy / Medium / Hard), Nov 2026 — the bands and
 * rules are in ./difficulty.ts (pure). Read only.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { skillKeyIndex } from "./status";
import { loadQuestionItems } from "../practice/items";
import { BAND_ADVICE, BANDS, bandOf, bandScores, RECENT_PER_SKILL, stuckBand, type Band, type BandScore, type Where } from "./difficulty";


const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export interface StuckStudent { id: string; name: string; className: string; scores: Record<Band, BandScore> }
export interface StuckGroup { where: Band | "WELL"; advice: string; students: StuckStudent[]; sample: { questionId: string; stem: string; band: Band } | null }
export interface SkillDifficulty {
  /** EASY, MEDIUM, HARD, WELL — in that order (TOO_FEW is counted, not listed) */
  groups: StuckGroup[]; tooFew: number;
  /** published questions of the skill (every copy) in each band */
  questions: Record<Band, number>;
}

/**
 * The students of the actor's classes in the skill's grade (the skill page's own scope), grouped by where they are
 * stuck in the skill, from their last RECENT_PER_SKILL careful answers on it (every copy of the skill). Each group has
 * the question that shows it best (the most missed one of that band by the group) and the plain next step.
 */
export async function skillDifficulty(repo: Repo, actor: Actor, skillId: string): Promise<SkillDifficulty> {
  assertCan(actor, "reports:read");
  const k = await repo.findUnique("Skill", { id: skillId });
  if (!k || k.deletedAt) throw new ForbiddenError("Skill not found.");
  const cur = await repo.findUnique("Curriculum", { id: k.curriculumId });
  const g = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!g || str(g.schoolId) !== str(actor.schoolId)) throw new ForbiddenError("Skill not found.");
  const ix = await skillKeyIndex(repo, str(g.schoolId));
  const key = ix.keyOf.get(skillId);
  const skillIds = key ? ix.skillsOf.get(key) ?? [skillId] : [skillId];
  const classes = (await readableClasses(repo, actor)).filter((c) => str(c.gradeId) === str(g.id));
  const mem = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const ids = [...new Set(mem.map((m) => str(m.studentId)))];
  const [rows, qs, names] = await Promise.all([
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, skillId: { in: skillIds } }, {
      select: ["studentId", "questionId", "isCorrect", "difficultyB", "rapidGuess", "source"], orderBy: [{ field: "createdAt", dir: "desc" }], take: Math.min(12000, ids.length * RECENT_PER_SKILL * 2 + 200),
    }) : Promise.resolve([] as Row[]),
    repo.findMany("Question", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "irtB"] }),
    studentNames(repo, ids),
  ]);
  const questions: Record<Band, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const q of qs) questions[bandOf(Number(q.irtB))]++;
  // each student's newest careful answers (rows come newest first)
  const per = new Map<string, Row[]>();
  for (const r of rows) {
    if (str(r.source) === "GAME" || r.rapidGuess) continue;
    const l = per.get(str(r.studentId)) ?? [];
    if (l.length < RECENT_PER_SKILL) { l.push(r); per.set(str(r.studentId), l); }
  }
  const classOf = (id: string) => str(classes.find((c) => str(c.id) === str(mem.find((m) => str(m.studentId) === id)?.classId))?.name);
  const groups = new Map<Where, StuckStudent[]>();
  let tooFew = 0;
  for (const [id, list] of per) {
    const scores = bandScores(list.map((r) => ({ b: r.difficultyB === null || r.difficultyB === undefined ? null : Number(r.difficultyB), correct: Boolean(r.isCorrect) })));
    const where = stuckBand(scores);
    if (where === "TOO_FEW") { tooFew++; continue; }
    const l = groups.get(where) ?? []; l.push({ id, name: names.get(id)?.name ?? "Student", className: classOf(id), scores }); groups.set(where, l);
  }
  // the sample question of each stuck band: the one the group missed most (else any question of that band)
  const sampleIds = new Map<Band, string>();
  for (const band of BANDS) {
    const who = new Set((groups.get(band) ?? []).map((x) => x.id));
    if (!who.size) continue;
    const missed = new Map<string, Set<string>>();
    for (const [id, list] of per) if (who.has(id)) for (const r of list) if (!r.isCorrect && bandOf(Number(r.difficultyB)) === band) { const st = missed.get(str(r.questionId)) ?? new Set<string>(); st.add(id); missed.set(str(r.questionId), st); }
    const best = [...missed].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0]?.[0] ?? qs.find((q) => bandOf(Number(q.irtB)) === band)?.id;
    if (best) sampleIds.set(band, str(best));
  }
  const items = await loadQuestionItems(repo, [...new Set(sampleIds.values())]);
  const order: (Band | "WELL")[] = ["EASY", "MEDIUM", "HARD", "WELL"];
  return {
    groups: order.map((where) => {
      const qid = where !== "WELL" ? sampleIds.get(where) : undefined;
      const it = qid ? items.find((x) => x.questionId === qid) : undefined;
      return { where, advice: BAND_ADVICE[where], students: (groups.get(where) ?? []).sort((a, b) => a.name.localeCompare(b.name)), sample: it && where !== "WELL" ? { questionId: it.questionId, stem: it.stem, band: where } : null };
    }),
    tooFew, questions,
  };
}
