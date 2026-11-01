/**
 * ⭐ Skills "by source": which program produced the skill a student practised — the grade's
 * book Curriculum, MAP Growth goal areas, Grammar, RTI/Intervention, ReadMaster (the
 * school's NAFS-style reading-comprehension articles), or Enrichment (a plan built from the
 * Enrichment source) — each skill with its ⭐ star (the ONE star system, src/server/skills/star-read.ts: one row per
 * skill KEY, the Student Skills name, ⭐ Mastered · ◐ In progress · 🔄 Needs review · ☆ Not started, the star score),
 * a progress-direction arrow per skill (↑/→/↓ = the STAR change in the period: the skill's star at the period start →
 * its star at the end, skills/star-read.ts starPairs — round 2: never the engine's score change, and never ↓ on a
 * ⭐ skill), a "practice score" sparkline (the engine's own monthly score, shown without a verdict), and a
 * cross-source summary counted by key.
 *
 * A skill is placed in exactly one source, by priority (most specific first): Grammar
 * (Skill.domain) → Enrichment (the student was assigned it from an Enrichment plan — the one
 * place ENRICHMENT, lib/assign-source.ts, is read outside the Assign dropdown it is deliberately
 * left out of) → ReadMaster (the skill is a ReadMasterArticle's target skill) → RTI (an
 * InterventionAlert was raised on it for this student) → MAP (it belongs to one of the
 * grade's MAP Growth goal areas) → Curriculum (the grade's book units, the default).
 */
import type { Period } from "../../analytics/periods";
import { studentGrowth, type SeriesPoint } from "../analytics/growth";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { gradeAreaSkills } from "../map/recommend";
import type { Repo, Row } from "../seeding/repo";
import { studentAssignedSkills } from "./assigned-skills";
import { skillKeyIndex, type StarStatus } from "./status";
import { starBook, starLearning, starMastered, starNeedsHelp, starPairs, starWord } from "./star-read";
import { STAR_RANK } from "./skills-trend";
import { hiddenStarKeys, starCell, type StarCell } from "../teacher/queries";

const s = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);

export type SkillSource = "CURRICULUM" | "MAP" | "GRAMMAR" | "READMASTER" | "RTI" | "ENRICHMENT";
export const SOURCE_LABEL: Record<SkillSource, string> = {
  CURRICULUM: "Curriculum",
  MAP: "MAP Growth",
  GRAMMAR: "Grammar",
  READMASTER: "ReadMaster (NAFS-style)",
  RTI: "RTI / Intervention",
  ENRICHMENT: "Enrichment",
};
export const SOURCE_ORDER: SkillSource[] = ["CURRICULUM", "MAP", "GRAMMAR", "READMASTER", "RTI", "ENRICHMENT"];

export type Trend = "UP" | "DOWN" | "FLAT";
export interface SourceSkillRow {
  /** a skill id of the key (links); key = the skill (copies are one); name = the Student Skills name */
  skillId: string; key: string; name: string;
  /** ⭐ the star: status, star score (0–100), the star word; attempts / accuracy = the answers that count for the star */
  status: StarStatus; star: StarCell; score: number; band: string; attempts: number; accuracyPct: number;
  /** 📈 the star change in the period: UP / FLAT / DOWN = the star level (☆ 0 · ◐/🔄 1 · ⭐ 2) at the period end
   *  against the start; null = never started by the period end. Never DOWN on a ⭐ skill. */
  trend: Trend | null;
  /** the star level change (−2 … +2), null with trend null */
  trendValue: number | null;
  /** the star at the period start / end (null = never started) */
  starThen: StarStatus | null; starNow: StarStatus | null;
  /** "practice score": the engine's own mastery by month end of the period — a sparkline only, never a verdict.
   *  Copied straight from SkillGrowth.series; null-filled months draw as a gap. */
  series: SeriesPoint[];
}
export interface SourceGroup {
  /** avgMastery = the average star score of the started skills; mastered = ⭐, developing = ◐ (not needing support),
   *  needsSupport = 🔄 or ◐ needing support — all counted by skill key */
  source: SkillSource; label: string; skills: SourceSkillRow[]; avgMastery: number | null;
  mastered: number; developing: number; needsSupport: number;
}
export interface BySourceReport {
  studentId: string;
  groups: SourceGroup[];
  summary: { totalSkills: number; avgMastery: number | null; mastered: number; developing: number; needsSupport: number; up: number; down: number; flat: number };
}

/** One source per skill, by priority. `skillIds` are the skills to classify (usually: the ones the student has mastery rows for). */
export async function classifySkillSources(repo: Repo, schoolId: string, grade: number, studentId: string, skillIds: string[]): Promise<Map<string, SkillSource>> {
  const out = new Map<string, SkillSource>();
  if (!skillIds.length) return out;
  const ix = await skillKeyIndex(repo, schoolId);
  const [skills, mapAreas, rti, nafs, assigned] = await Promise.all([
    repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "domain"] }),
    gradeAreaSkills(repo, schoolId, grade, true),
    repo.findMany("InterventionAlert", { studentId, skillId: { in: skillIds } }, { select: ["skillId"] }),
    repo.findMany("ReadMasterArticle", { skillId: { in: skillIds } }, { select: ["skillId"] }),
    studentAssignedSkills(repo, studentId, ix, null),
  ]);
  const mapSet = new Set(mapAreas.flatMap((a) => a.skills.map((k) => k.id)));
  const rtiSet = new Set(rti.map((r) => s(r.skillId)));
  const nafsSet = new Set(nafs.map((r) => s(r.skillId)));
  // ⚡ Enrichment (r?? owner): a skill the student was assigned from an Enrichment plan (the key → its sources, from
  // Assignment.source) is classified Enrichment regardless of where else it also appears, same priority spirit as Grammar.
  const keyOfSkill = new Map([...assigned.skillIdOf].map(([key, id]) => [id, key]));
  const studentSources = assigned.byStudent.get(studentId);
  const enrichedSet = new Set(
    skillIds.filter((id) => { const key = keyOfSkill.get(id); return Boolean(key && studentSources?.get(key)?.has("ENRICHMENT")); }),
  );
  for (const k of skills) {
    const id = s(k.id);
    if (s(k.domain) === "GRAMMAR") out.set(id, "GRAMMAR");
    else if (enrichedSet.has(id)) out.set(id, "ENRICHMENT");
    else if (nafsSet.has(id)) out.set(id, "READMASTER");
    else if (rtiSet.has(id)) out.set(id, "RTI");
    else if (mapSet.has(id)) out.set(id, "MAP");
    else out.set(id, "CURRICULUM");
  }
  return out;
}

/** Most specific source first (the order classifySkillSources follows). */
const SOURCE_PRIORITY: SkillSource[] = ["GRAMMAR", "ENRICHMENT", "READMASTER", "RTI", "MAP", "CURRICULUM"];

export async function bySourceReport(repo: Repo, actor: Actor, studentId: string, period: Period): Promise<BySourceReport> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  const grade = Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0);
  // the skills the student practised (engine rows with answers) and every skill KEY with a star; one row per key
  const [mastery, book] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "attempts"] }).then((l) => l.filter((m) => num(m.attempts) > 0)),
    starBook(repo, [studentId], s(st.schoolId)),
  ]);
  const hidden = await hiddenStarKeys(repo, book);
  const idsOfKey = new Map<string, Set<string>>();
  const add = (key: string, id: string | null) => { if (hidden.has(key)) return; const l = idsOfKey.get(key) ?? idsOfKey.set(key, new Set()).get(key)!; if (id) l.add(id); };
  for (const m of mastery) add(book.keyOf(s(m.skillId)), s(m.skillId));
  for (const v of book.byKey.get(studentId)?.values() ?? []) if (v.status !== "NOT_STARTED") add(v.key, v.skillId ?? book.ix.skillsOf.get(v.key)?.[0] ?? null);
  const skillIds = [...new Set([...idsOfKey.values()].flatMap((l) => [...l]))];
  const [sourceOf, growth, pairsOf] = await Promise.all([
    classifySkillSources(repo, s(st.schoolId), grade, studentId, skillIds),
    // the engine's monthly score: ONLY for the "practice score" sparkline (no arrow, no verdict comes from it)
    studentGrowth(repo, studentId, period, { perSkillSeries: true }),
    starPairs(repo, [studentId], period.from, period.to),
  ]);
  const growthOf = new Map(growth.skills.map((g) => [g.skillId, g]));
  const pairOf = new Map((pairsOf.get(studentId) ?? []).map((p) => [p.key, p]));
  const rowsAll: (SourceSkillRow & { source: SkillSource })[] = [...idsOfKey].filter(([, ids]) => ids.size > 0).map(([key, idSet]) => {
    const ids = [...idSet];
    const v = book.ofKey(studentId, key);
    // the key's source: the most specific source of any of its copies
    const source = SOURCE_PRIORITY.find((src) => ids.some((id) => sourceOf.get(id) === src)) ?? "CURRICULUM";
    const gs = ids.map((id) => growthOf.get(id)).filter((g): g is NonNullable<typeof g> => Boolean(g));
    // 📈 the arrow = the star then → now (a ⭐ skill is never shown going down)
    const p = pairOf.get(key);
    const d = p ? STAR_RANK[p.now] - STAR_RANK[p.then] : null;
    const trend: Trend | null = d === null ? null : d > 0 ? "UP" : d < 0 && !starMastered(v) ? "DOWN" : "FLAT";
    const growthV = d === null ? null : trend === "FLAT" ? 0 : d;
    return {
      source, skillId: v.skillId && idSet.has(v.skillId) ? v.skillId : ids[0], key, name: book.nameOf(key), status: v.status, star: starCell(v), score: v.score, band: starWord(v),
      attempts: v.answered, accuracyPct: v.answered ? Math.round((100 * v.correct) / v.answered) : 0,
      trend, trendValue: growthV, starThen: p?.then ?? null, starNow: p?.now ?? null, series: gs[0]?.series ?? [],
    };
  });
  const isMastered = (r: SourceSkillRow) => starMastered(r.star);
  const isDeveloping = (r: SourceSkillRow) => starLearning(r.star) && !r.star.needsSupport;
  const isNeed = (r: SourceSkillRow) => starNeedsHelp(r.star);
  const started = (rows: SourceSkillRow[]) => rows.filter((r) => r.status !== "NOT_STARTED");
  const avgOf = (rows: SourceSkillRow[]) => { const l = started(rows); return l.length ? Math.round(l.reduce((t, r) => t + r.score, 0) / l.length) : null; };
  // 🔄 first, then ◐ needing support, then the lowest star score; ⭐ last
  const order = (r: SourceSkillRow) => (r.status === "NEEDS_REVIEW" ? 0 : r.star.needsSupport ? 1 : isMastered(r) ? 4 : r.status === "NOT_STARTED" ? 3 : 2);
  const groups: SourceGroup[] = SOURCE_ORDER.map((source) => {
    const rows: SourceSkillRow[] = rowsAll.filter((r) => r.source === source).map(({ source: _s, ...r }) => r)
      .sort((a, b) => order(a) - order(b) || a.score - b.score || a.name.localeCompare(b.name));
    return {
      source, label: SOURCE_LABEL[source], skills: rows, avgMastery: avgOf(rows),
      mastered: rows.filter(isMastered).length, developing: rows.filter(isDeveloping).length, needsSupport: rows.filter(isNeed).length,
    };
  }).filter((g) => g.skills.length > 0);
  const all = groups.flatMap((g) => g.skills);
  return {
    studentId,
    groups,
    summary: {
      totalSkills: all.length, avgMastery: avgOf(all),
      mastered: all.filter(isMastered).length, developing: all.filter(isDeveloping).length, needsSupport: all.filter(isNeed).length,
      up: all.filter((r) => r.trend === "UP").length, down: all.filter((r) => r.trend === "DOWN").length, flat: all.filter((r) => r.trend === "FLAT").length,
    },
  };
}
