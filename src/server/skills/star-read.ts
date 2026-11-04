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
import type { Repo, Row } from "../seeding/repo";
import { LEVEL_ROW, NOT_STARTED_VIEW, skillKeyIndex, skillStatusesFor, studentSchool, type SkillKeyIndex, type StarStatus, type StarView } from "./status";
import { starFromHistory, trendOf, type Trend } from "./skills-trend";

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

// ------------------------------------------------------------------ the change of the stars in a period

/**
 * 📈 "Growth" on the star system (owner, 1 Nov 2026): what changed in a student's stars between `from` and `to` —
 * the ONLY growth verdict a report may show (the engine's score change is not a status). Each skill KEY once:
 *   gained   ⭐ earned in the period (not ⭐ at the start, ⭐ at the end)
 *   toReview became 🔄 Needs review in the period
 *   up/down  skills whose star level (☆ 0 · ◐/🔄 1 · ⭐ 2) went up / down
 *   trend    UP = at least one up and none down · DOWN = more levels lost than won · SAME otherwise (skills-trend.ts)
 * The star at a date comes from the star's stored history; without one, from startedAt / masteredAt.
 */
export interface StarChange { gained: number; toReview: number; up: number; down: number; practised: number; trend: Trend }
export const NO_STAR_CHANGE: StarChange = { gained: 0, toReview: 0, up: 0, down: 0, practised: 0, trend: "SAME" };

export async function starChange(repo: Repo, studentIds: readonly string[], from: Date | number, to: Date | number): Promise<Map<string, StarChange>> {
  const pairs = await starPairs(repo, studentIds, from, to);
  return new Map([...pairs].map(([sid, list]) => [sid, starChangeOf(list)]));
}

const MASTERED_NOW = (st: StarStatus) => st === "MASTERED" || st === "NEXT_LEVEL";
/**
 * Pure: one student × key's star then → now from its rows (every level). The star at a date = the stored history;
 * without one: ☆ before startedAt, ⭐ from masteredAt on (whatever the star is now — a later 🔄 is a real drop), ◐ between.
 * A level-up is never a drop: working on the next level (◐ / ☆ on a higher-level row while a lower level is ⭐) counts
 * as ☆⬆ (NEXT_LEVEL, same rank as ⭐).
 */
export function pairOfRows(list: readonly Row[], a: number, b: number, live: boolean): { then: StarStatus; now: StarStatus } | null {
  const rows = [...list].sort((x, y) => Number(y.level ?? 1) - Number(x.level ?? 1));
  const cur = rows[0];
  const curStatus = (s(cur.status) || "NOT_STARTED") as StarStatus;
  const starts = rows.map((r) => t(r.startedAt)).filter((x) => x > 0);
  const started = starts.length ? Math.min(...starts) : 0;
  const masteredAts = rows.map((r) => t(r.masteredAt)).filter((x) => x > 0);
  const mastered = masteredAts.length ? Math.min(...masteredAts) : 0;
  const guess = (at: number): StarStatus => (!started || started > at ? "NOT_STARTED" : mastered && mastered <= at ? (curStatus === "NEXT_LEVEL" ? "NEXT_LEVEL" : "MASTERED") : "IN_PROGRESS");
  const lowerStar = rows.slice(1).some((r) => MASTERED_NOW((s(r.status) || "NOT_STARTED") as StarStatus) || t(r.masteredAt) > 0);
  const lift = (st: StarStatus): StarStatus => (lowerStar && (st === "IN_PROGRESS" || st === "NOT_STARTED") ? "NEXT_LEVEL" : st);
  const then = starFromHistory(list, a) ?? guess(a);
  const now = lift(live ? curStatus : starFromHistory(list, b) ?? guess(b));
  if (then === now && now === "NOT_STARTED") return null;
  return { then, now };
}

// ------------------------------------------------------------------ each skill's star then → now (round 2, growth)

/** One skill KEY's star at the period start (`then`) and end (`now`) — the pieces starChange is counted from. */
export interface StarPair { key: string; then: StarStatus; now: StarStatus }

/**
 * Each student's skills (by KEY) with their star at `from` and at `to` — the SAME reading as starChange (stored star
 * history; without one, startedAt / masteredAt; the live star when `to` is now). Keys never started by `to` are left
 * out. For the "star then → star now" lists of the growth reports; `starChangeOf(pairs)` gives the starChange numbers.
 */
export async function starPairs(repo: Repo, studentIds: readonly string[], from: Date | number, to: Date | number): Promise<Map<string, StarPair[]>> {
  const ids = [...new Set(studentIds.map(s).filter(Boolean))];
  const out = new Map<string, StarPair[]>(ids.map((id) => [id, []]));
  const a = t(from), b = t(to), live = b >= Date.now() - 60_000;
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await repo.findMany("SkillStatus", { studentId: { in: ids.slice(i, i + 200) } }, { select: ["studentId", "skillKey", "level", "status", "startedAt", "masteredAt", "history"] });
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      if (s(r.skillKey) === LEVEL_ROW) continue;
      const k = `${s(r.studentId)}|${s(r.skillKey)}`;
      const g = groups.get(k); if (g) g.push(r); else groups.set(k, [r]);
    }
    for (const [k, list] of groups) {
      const cut = k.indexOf("|");
      const sid = k.slice(0, cut), key = k.slice(cut + 1);
      const p = pairOfRows(list, a, b, live);
      if (p) out.get(sid)?.push({ key, ...p });
    }
  }
  return out;
}

/** Pure: the starChange numbers of a list of then → now pairs (identical to starChange for the same pairs). */
export function starChangeOf(pairs: readonly { then: StarStatus; now: StarStatus }[]): StarChange {
  if (!pairs.length) return { ...NO_STAR_CHANGE };
  const tr = trendOf(pairs);
  return {
    gained: tr.gained, up: tr.up, down: tr.down, trend: tr.trend,
    toReview: pairs.filter((x) => x.now === "NEEDS_REVIEW" && x.then !== "NEEDS_REVIEW").length,
    practised: pairs.filter((x) => x.now !== "NOT_STARTED").length,
  };
}
