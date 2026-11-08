/**
 * Read models for the student learning flow:
 *   grade → book → units (with progress) → skill cards.
 * Batched queries (one round trip per table, `in` filters) — no per-skill lookups.
 * All callers must check access first (assertStudentAccess / own student id).
 */
import { countGroups } from "../db/group-count";
import { starBook, starMastered, starNeedsReview } from "../skills/star-read";
import { DEFAULT_MASTERY } from "../../config/engine";
import { bandFor } from "../../mastery/mastery";
import { recommendSkills, type SkillSnapshot } from "../../recommendations/recommend";
import type { MasteryBandName } from "../../types/domain";
import type { Repo, Row } from "../seeding/repo";
import { assignedSkillsForStudent } from "../teacher/assignments";
import { weakMapGoalAreas } from "../analytics/map-compare";
import { skillEvidence } from "../insights/skill-snapshots";

export const BAND_LABEL: Record<MasteryBandName, string> = {
  BEGINNING: "Beginning",
  DEVELOPING: "Developing",
  APPROACHING: "Approaching",
  PROFICIENT: "Proficient",
  MASTERED: "Mastered",
};
export const BANDS: MasteryBandName[] = ["BEGINNING", "DEVELOPING", "APPROACHING", "PROFICIENT", "MASTERED"];

export const CATEGORY_LABEL: Record<string, string> = {
  LITERATURE: "Literature",
  INFORMATIONAL: "Informational text",
  COMPREHENSION: "Comprehension",
  VOCABULARY: "Vocabulary",
  WORD_STUDY: "Word study",
  GRAMMAR: "Grammar",
  MECHANICS: "Punctuation & capitals",
  PHONICS_WORD_STUDY: "Spelling",
  WRITING: "Writing",
};

export interface SkillCard {
  skillId: string;
  name: string;
  category: string;
  domain: string;
  mastery: number;
  band: MasteryBandName;
  bandLabel: string;
  attempts: number;
  accuracy: number | null; // % or null before any attempt
  isMastered: boolean;
  recommended: boolean;
  recommendedReason: string | null;
  availableQuestions: number;
  taughtIn: string[]; // lesson titles in this unit
  canPractice: boolean;
}

export interface UnitSummary {
  unitId: string;
  number: number;
  title: string;
  lessons: string[];
  skills: number;
  proficientOrBetter: number;
  mastered: number;
  progressPct: number;
  isCurrent: boolean;
}

export interface StudentCurriculum {
  studentId: string;
  grade: number;
  bookTitle: string;
  edition: string | null;
  units: UnitSummary[];
}

const num = (v: unknown) => Number(v ?? 0);

/** Students know lessons by the story they read ("A World of Change"), not "Text Set 1". */
export function lessonDisplayTitle(l: Row): string {
  const texts = (l.texts ?? null) as Record<string, string> | null;
  return texts?.shared_read ? texts.shared_read.replace(/^["“]|["”]$/g, "") : String(l.title);
}

async function studentContext(repo: Repo, studentId: string) {
  const student = await repo.findUnique("Student", { id: studentId });
  if (!student) throw new Error("Student not found");
  const [gradeRow, curricula] = await Promise.all([
    repo.findUnique("Grade", { id: student.gradeId }),
    repo.findMany("Curriculum", { gradeId: student.gradeId, isActive: true }),
  ]);
  const grade = gradeRow!;
  const curriculum = curricula[0];
  if (!curriculum) throw new Error(`No active curriculum for Grade ${grade.level}`);
  const book = (await repo.findUnique("Book", { id: curriculum.bookId }))!;
  return { student, grade, curriculum, book };
}

async function masteryMap(repo: Repo, studentId: string, skillIds: string[]) {
  const rows = skillIds.length ? await repo.findMany("StudentSkillMastery", { studentId, skillId: { in: skillIds } }) : [];
  return new Map(rows.map((r) => [String(r.skillId), r]));
}

/** "Current" unit = the lowest-numbered unit not yet mostly proficient; drives recommendations. */
function pickCurrent(units: UnitSummary[]): number {
  return units.find((u) => u.progressPct < 70)?.number ?? units[units.length - 1]?.number ?? 1;
}

export async function getStudentCurriculum(repo: Repo, studentId: string): Promise<StudentCurriculum> {
  // 🩹 platform audit (8 Nov 2026, live error log ×7): a grade with no curriculum (e.g. Grade 11) made the student's
  // file and reports crash — it is simply "no units yet" now
  const student0 = await repo.findUnique("Student", { id: studentId });
  if (student0 && !(await repo.count("Curriculum", { gradeId: student0.gradeId, isActive: true }))) {
    const g = await repo.findUnique("Grade", { id: student0.gradeId });
    return { studentId, grade: num(g?.level), bookTitle: "", edition: null, units: [] };
  }
  const { student, grade, curriculum, book } = await studentContext(repo, studentId);
  const units = (await repo.findMany("Unit", { curriculumId: curriculum.id, deletedAt: null })).sort((a, b) => num(a.number) - num(b.number));
  const unitIds = units.map((u) => String(u.id));
  const [links, lessons] = await Promise.all([
    unitIds.length ? repo.findMany("UnitSkill", { unitId: { in: unitIds } }) : Promise.resolve([]),
    unitIds.length ? repo.findMany("Lesson", { unitId: { in: unitIds }, deletedAt: null }) : Promise.resolve([]),
  ]);
  // ⭐ owner 1 Nov 2026: a unit's progress = its skills (by KEY: copies count once) with the student's ⭐ — the same
  // stars as My Skills; the old engine flags never decide it
  const stars = await starBook(repo, [studentId], student.schoolId ? String(student.schoolId) : null);
  const summaries: UnitSummary[] = units.map((u) => {
    const keys = [...new Set(links.filter((l) => l.unitId === u.id).map((l) => stars.keyOf(String(l.skillId))))];
    const sk = keys.map((k) => stars.ofKey(studentId, k));
    const mast = sk.filter((v) => starMastered(v)).length;
    const prof = mast;
    return {
      unitId: String(u.id),
      number: num(u.number),
      title: String(u.title),
      lessons: lessons.filter((l) => l.unitId === u.id).sort((a, b) => num(a.number) - num(b.number)).map(lessonDisplayTitle),
      skills: sk.length,
      proficientOrBetter: prof,
      mastered: mast,
      progressPct: sk.length ? Math.round((100 * prof) / sk.length) : 0,
      isCurrent: false,
    };
  });
  const current = pickCurrent(summaries);
  for (const s of summaries) s.isCurrent = s.number === current;
  return { studentId, grade: num(grade.level), bookTitle: String(book.title), edition: book.edition ? String(book.edition) : null, units: summaries };
}

export async function getUnitSkillCards(repo: Repo, studentId: string, unitId: string, now = new Date()): Promise<{ unit: UnitSummary; cards: SkillCard[] }> {
  const curriculum = await getStudentCurriculum(repo, studentId);
  const unit = curriculum.units.find((u) => u.unitId === unitId);
  if (!unit) throw new Error("This unit is not part of the student's curriculum.");
  const links = (await repo.findMany("UnitSkill", { unitId })).sort((a, b) => num(a.order) - num(b.order));
  const skillIds = links.map((l) => String(l.skillId));
  const skills = new Map((await repo.findMany("Skill", { id: { in: skillIds } })).map((s) => [String(s.id), s]));
  const m = await masteryMap(repo, studentId, skillIds);
  // ⚡ counted by the database (one row per skill), not read question by question
  const qCount = skillIds.length ? await countGroups(repo, "Question", "skillId", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null }) : new Map<string, number>();
  const lessons = await repo.findMany("Lesson", { unitId, deletedAt: null });
  const lessonSkills = lessons.length ? await repo.findMany("LessonSkill", { lessonId: { in: lessons.map((l) => l.id) } }) : [];
  const lessonTitle = new Map(lessons.map((l) => [String(l.id), lessonDisplayTitle(l)]));

  // prerequisite gaps: prerequisites of skills the student is working on but has not mastered
  const prereqs = skillIds.length ? await repo.findMany("SkillPrerequisite", { prerequisiteSkillId: { in: skillIds } }) : [];
  const working = new Set([...m.values()].filter((r) => num(r.attempts) > 0 && num(r.score) < 75).map((r) => String(r.skillId)));
  const gap = new Set(prereqs.filter((p) => working.has(String(p.skillId)) && num(m.get(String(p.prerequisiteSkillId))?.score) < num(p.minimumMastery)).map((p) => String(p.prerequisiteSkillId)));

  const assigned = await assignedSkillsForStudent(repo, studentId, now);
  const weakAreas = await weakMapGoalAreas(repo, studentId);
  const famRows = await repo.findMany("SkillFamily", { id: { in: [...new Set([...skills.values()].map((k) => k.familyId))] } });
  const areaRows = weakAreas.size ? await repo.findMany("MapGoalArea", { code: { in: [...weakAreas] } }) : [];
  const weakAreaIds = new Set(areaRows.map((a) => String(a.id)));
  const famWeak = new Map(famRows.map((f) => [String(f.id), f.mapGoalAreaId ? weakAreaIds.has(String(f.mapGoalAreaId)) : false]));
  const ev = await skillEvidence(repo, studentId, skillIds, now);
  // ⭐ the stars decide mastered / review due (any copy of each skill)
  const stars = await starBook(repo, [studentId]);
  const starOf = (id: string) => stars.of(studentId, id);
  const reviewDue = (id: string) => { const v = starOf(id); return starNeedsReview(v) || (starMastered(v) && Boolean(v.reviewDueAt) && new Date(String(v.reviewDueAt)).getTime() <= now.getTime()); };
  const snapshots: SkillSnapshot[] = skillIds.map((id, i) => {
    const r = m.get(id);
    const last = r?.lastPracticedAt ? new Date(String(r.lastPracticedAt instanceof Date ? r.lastPracticedAt.toISOString() : r.lastPracticedAt)) : null;
    return {
      skillId: id,
      name: String(skills.get(id)?.name ?? ""),
      sequence: i,
      unitNumber: unit.number,
      mastery: num(r?.score),
      attempts: num(r?.attempts),
      recentErrors: ev.get(id)?.recentErrors ?? 0,
      daysSincePractice: last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null,
      theta: ev.get(id)?.theta ?? 0,
      reviewDue: reviewDue(id),
      misconception: ev.get(id)?.misconception ?? null,
      assignedDueInDays: assigned.has(id) ? assigned.get(id)! : null,
      prerequisiteGap: gap.has(id),
      mapGoalAreaWeak: famWeak.get(String(skills.get(id)?.familyId)) ?? false,
    };
  });
  const recs = recommendSkills(snapshots.filter((s) => (qCount.get(s.skillId) ?? 0) > 0), unit.number, 3);
  const recBy = new Map(recs.map((r) => [r.skillId, r]));

  const cards: SkillCard[] = skillIds.map((id) => {
    const s = skills.get(id)!;
    const r = m.get(id);
    const v = starOf(id);
    // the star score and word (⭐ = Mastered); the engine's band only below ⭐
    const score = v.status === "NOT_STARTED" ? num(r?.score) : v.score;
    const band: MasteryBandName = starMastered(v) ? "MASTERED" : (() => { const b = bandFor(score, DEFAULT_MASTERY); return b === "MASTERED" ? "PROFICIENT" : b; })();
    const attempts = num(r?.attempts);
    const rec = recBy.get(id);
    return {
      skillId: id,
      name: String(s.name),
      category: CATEGORY_LABEL[String(s.category)] ?? String(s.category),
      domain: String(s.domain),
      mastery: Math.round(score),
      band,
      bandLabel: BAND_LABEL[band],
      attempts,
      accuracy: attempts ? Math.round((100 * num(r?.correct)) / attempts) : null,
      isMastered: starMastered(v),
      recommended: Boolean(rec),
      recommendedReason: rec ? rec.reasons.sort((a, b) => b.weight - a.weight)[0].detail : null,
      availableQuestions: qCount.get(id) ?? 0,
      taughtIn: [...new Set(lessonSkills.filter((ls) => ls.skillId === id).map((ls) => lessonTitle.get(String(ls.lessonId))!))],
      canPractice: (qCount.get(id) ?? 0) > 0,
    };
  });
  return { unit, cards };
}

export type { Row };
