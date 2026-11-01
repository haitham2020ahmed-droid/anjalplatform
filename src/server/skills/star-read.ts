/**
 * ⭐ ONE way to read "mastered / learning / needs review" anywhere on the platform (owner, 1 Nov 2026: "make
 * everything identical"). Every page, report, export, alert, suggestion, badge, coin and assignment rule that used the
 * OLD engine table (StudentSkillMastery isMastered / band / score / nextReviewAt) for a STATUS reads it from here
 * instead — the same SkillStatus stars as My Skills, Student Skills and Practice and time:
 *   ☆ NOT_STARTED · ◐ IN_PROGRESS (+ needsSupport) · ⭐ MASTERED / NEXT_LEVEL · 🔄 NEEDS_REVIEW
 * Rules (skills/status.ts): one status per student × skill KEY (every copy of a skill — Grade 4 / Grade 5 rows, a
 * Curriculum Map lesson name, a MAP statement's skill — is ONE skill); ⭐ only after ≥ 30 practice answers + mastery;
 * tests, lessons, ReadMaster and games never count; 🔄 after a failed review check.
 * The engine's own score (StudentSkillMastery.score) stays the adaptive engine's INPUT (item difficulty, ordering the
 * weakest of the not-mastered skills); it never decides or shows a status.
 * Reads are batched (skillStatusesFor: 400 students per query; the key index is cached).
 */
import type { Repo } from "../seeding/repo";
import { NOT_STARTED_VIEW, skillKeyIndex, skillStatusesFor, studentSchool, type SkillKeyIndex, type StarView } from "./status";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const t = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);

/**
 * Owner (1 Nov 2026): nobody is left out of an assignment. Students who already mastered the skill get the work as a
 * 20-question REVIEW (practice/completion.ts). The old "exclude them?" paths stay behind this switch, OFF.
 */
export const EXCLUDE_MASTERED_STUDENTS = false;

/** ⭐ mastered (including mastered and ready for the next level). */
export const starMastered = (v: Pick<StarView, "status"> | null | undefined): boolean => v?.status === "MASTERED" || v?.status === "NEXT_LEVEL";
/** 🔄 needs review. */
export const starNeedsReview = (v: Pick<StarView, "status"> | null | undefined): boolean => v?.status === "NEEDS_REVIEW";
/** ◐ started, not mastered (needs review excluded). */
export const starLearning = (v: Pick<StarView, "status"> | null | undefined): boolean => v?.status === "IN_PROGRESS";
/** ☆ never started (no row). */
export const starNotStarted = (v: Pick<StarView, "status"> | null | undefined): boolean => !v || v.status === "NOT_STARTED";
/** Needs the teacher: 🔄, or ◐ flagged "needs support" (50 answers without mastery). */
export const starNeedsHelp = (v: Pick<StarView, "status" | "needsSupport"> | null | undefined): boolean => starNeedsReview(v) || (starLearning(v) && Boolean(v?.needsSupport));
/** The word a staff report shows for a star (interface strings already in en.ts / ar.ts). */
export const starWord = (v: Pick<StarView, "status"> | null | undefined): "Mastered" | "Needs review" | "In progress" | "Not started" =>
  starMastered(v) ? "Mastered" : starNeedsReview(v) ? "Needs review" : starLearning(v) ? "In progress" : "Not started";

/** The school of these students (the first that has one). */
export async function schoolOfStudents(repo: Repo, studentIds: readonly string[]): Promise<string> {
  for (const id of studentIds.slice(0, 5)) { const sc = await studentSchool(repo, s(id)); if (sc) return sc; }
  return "";
}

export interface StarBook {
  /** the school's key index (skill id → key, key → ids, key → name) */
  ix: SkillKeyIndex;
  /** student → key → star (only started keys; ☆ = absent) */
  byKey: Map<string, Map<string, StarView>>;
  /** the key of a skill id ("skill:<id>" for an unknown id) */
  keyOf: (skillId: string) => string;
  /** the shared display name of a key */
  nameOf: (key: string) => string;
  /** a student's star of a SKILL ID (through its key); ☆ when none */
  of: (studentId: string, skillId: string) => StarView;
  /** a student's star of a KEY; ☆ when none */
  ofKey: (studentId: string, key: string) => StarView;
  /** the keys a student has ⭐ */
  masteredKeys: (studentId: string) => Set<string>;
  /** ⭐ earned in [from, to] (distinct keys) */
  newStars: (studentId: string, from: Date | number, to: Date | number) => number;
}

/**
 * Read the stars of these students ONCE for a page (one batched query + the cached key index). `schoolId` is found
 * from the students when omitted.
 */
export async function starBook(repo: Repo, studentIds: readonly string[], schoolId?: string | null): Promise<StarBook> {
  const ids = [...new Set(studentIds.map(s).filter(Boolean))];
  const school = s(schoolId) || (ids.length ? await schoolOfStudents(repo, ids) : "");
  const ix: SkillKeyIndex = school ? await skillKeyIndex(repo, school) : { keyOf: new Map(), skillsOf: new Map(), nameOf: new Map(), gradeOf: new Map() };
  const byKey = ids.length ? await skillStatusesFor(repo, ids) : new Map<string, Map<string, StarView>>();
  const keyOf = (skillId: string) => ix.keyOf.get(s(skillId)) ?? `skill:${s(skillId)}`;
  const ofKey = (studentId: string, key: string) => byKey.get(s(studentId))?.get(key) ?? NOT_STARTED_VIEW(key);
  return {
    ix, byKey, keyOf, ofKey,
    nameOf: (key) => ix.nameOf.get(key) ?? "Skill",
    of: (studentId, skillId) => ofKey(studentId, keyOf(skillId)),
    masteredKeys: (studentId) => new Set([...(byKey.get(s(studentId)) ?? new Map<string, StarView>())].filter(([, v]) => starMastered(v)).map(([k]) => k)),
    newStars: (studentId, from, to) => {
      const a = t(from), b = t(to);
      let n = 0;
      for (const v of (byKey.get(s(studentId)) ?? new Map<string, StarView>()).values()) if (starMastered(v) && v.masteredAt && t(v.masteredAt) >= a && t(v.masteredAt) <= b) n++;
      return n;
    },
  };
}

/** Count the distinct KEYS of some skill ids that satisfy `pred` for a student (copies of one skill count once). */
export function countKeys(book: StarBook, studentId: string, skillIds: readonly string[], pred: (v: StarView) => boolean): number {
  const keys = new Set(skillIds.map((id) => book.keyOf(id)));
  let n = 0;
  for (const k of keys) if (pred(book.ofKey(studentId, k))) n++;
  return n;
}
