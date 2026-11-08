/**
 * 📐 Standards (CCSS) for a class (Nov 2026, IXL "Standards Proficiency"): every Common Core standard of the class's
 * grade that the platform's skills are linked to (SkillStandard), with how far the class is on it — from the SAME
 * stars every page shows (SkillStatus): for each student, the average star score of the standard's skills they have
 * started (a ⭐ counts 100):
 *   MET    80 % or more   (green)
 *   NEAR   60–79 %        (yellow)
 *   BELOW  under 60 %     (red)
 *   NONE   no skill of the standard started yet
 * One standard opens its skills and the students who still need it. Read only. Access: a class the actor can read.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { skillKeyIndex, skillStatusesFor, type StarView } from "../skills/status";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export type StdBand = "MET" | "NEAR" | "BELOW" | "NONE";
export const MET_AT = 80;
export const NEAR_AT = 60;

export interface StdStudent { id: string; name: string; band: StdBand; avg: number | null; started: number; of: number }
export interface StdSkill { key: string; skillId: string; name: string; mastered: number; practising: number; notStarted: number }
export interface StdRow {
  id: string; code: string; strand: string; description: string;
  counts: Record<StdBand, number>;
  /** MET among the students who started a skill of it (null: nobody started) */
  pctMet: number | null;
  skills: StdSkill[];
}
export interface StandardsReport {
  classId: string; className: string; grade: number; students: number;
  rows: StdRow[];
  /** the opened standard: every student of the class, the ones who need it first */
  open: (StdRow & { byStudent: StdStudent[] }) | null;
}

const done = (v: StarView | undefined) => v?.status === "MASTERED" || v?.status === "NEXT_LEVEL";
/** The band of one student on one standard (pure): the average star score of the started skills, a ⭐ = 100. */
export function standardBand(views: readonly (StarView | undefined)[]): { band: StdBand; avg: number | null; started: number } {
  const started = views.filter((v) => v && v.status !== "NOT_STARTED");
  if (!started.length) return { band: "NONE", avg: null, started: 0 };
  const avg = Math.round(started.reduce((x, v) => x + (done(v) ? 100 : Math.max(0, Math.min(100, Number(v!.score) || 0))), 0) / started.length);
  return { band: avg >= MET_AT ? "MET" : avg >= NEAR_AT ? "NEAR" : "BELOW", avg, started: started.length };
}
/** "RL.5.2" → "RL" (the strand when the standard row has none). */
export const strandOf = (code: string, strand?: string | null) => (s(strand).trim() || code.split(".")[0] || "Other");
const cleanCode = (c: string) => c.replace(/^CCSS\.ELA-LITERACY\./i, "");
/** natural order: RL.5.2 before RL.5.10 */
const byCode = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export async function standardsReport(repo: Repo, actor: Actor, classId: string, openId?: string | null): Promise<StandardsReport> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => s(c.id) === s(classId));
  if (!klass) throw new ForbiddenError("Class not found.");
  const grade = await repo.findUnique("Grade", { id: klass.gradeId });
  const curricula = grade ? await repo.findMany("Curriculum", { gradeId: grade.id }, { select: ["id"] }) : [];
  const skills = curricula.length ? (await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "isActive"] })).filter((k) => k.isActive !== false) : [];
  const links: Row[] = [];
  for (let i = 0; i < skills.length; i += 500) links.push(...(await repo.findMany("SkillStandard", { skillId: { in: skills.slice(i, i + 500).map((k) => k.id) } }, { select: ["skillId", "standardId"] })));
  const stdIds = [...new Set(links.map((l) => s(l.standardId)))];
  const stds: Row[] = [];
  for (let i = 0; i < stdIds.length; i += 500) stds.push(...(await repo.findMany("Standard", { id: { in: stdIds.slice(i, i + 500) }, framework: "CCSS_ELA" }, { select: ["id", "code", "description", "strand", "isActive"] })));
  const ids = await classMembers(repo, s(classId));
  const [ix, names] = await Promise.all([skillKeyIndex(repo, s(klass.schoolId) || s(actor.schoolId)), studentNames(repo, ids)]);

  // standard → its skill keys (every copy of a skill is one key)
  const keysOf = new Map<string, Map<string, { skillId: string; name: string }>>();
  const skillName = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  for (const l of links) {
    const sid = s(l.skillId), key = ix.keyOf.get(sid) ?? `skill:${sid}`;
    const m = keysOf.get(s(l.standardId)) ?? new Map(); if (!m.has(key)) m.set(key, { skillId: sid, name: ix.nameOf.get(key) ?? skillName.get(sid) ?? "Skill" }); keysOf.set(s(l.standardId), m);
  }
  const allKeys = [...new Set([...keysOf.values()].flatMap((m) => [...m.keys()]))];
  const stars = ids.length && allKeys.length ? await skillStatusesFor(repo, ids, allKeys) : new Map<string, Map<string, StarView>>();

  const rowOf = (std: Row): StdRow & { byStudent: StdStudent[] } => {
    const keys = keysOf.get(s(std.id)) ?? new Map();
    const counts: Record<StdBand, number> = { MET: 0, NEAR: 0, BELOW: 0, NONE: 0 };
    const byStudent: StdStudent[] = ids.map((id) => {
      const b = standardBand([...keys.keys()].map((k) => stars.get(id)?.get(k)));
      counts[b.band]++;
      return { id, name: names.get(id)?.name ?? "Student", band: b.band, avg: b.avg, started: b.started, of: keys.size };
    });
    const startedN = counts.MET + counts.NEAR + counts.BELOW;
    const skillsOut: StdSkill[] = [...keys].map(([key, k]) => {
      let mastered = 0, practising = 0, notStarted = 0;
      for (const id of ids) { const v = stars.get(id)?.get(key); if (done(v)) mastered++; else if (v && v.status !== "NOT_STARTED") practising++; else notStarted++; }
      return { key, skillId: k.skillId, name: k.name, mastered, practising, notStarted };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const code = cleanCode(s(std.code));
    const rank: Record<StdBand, number> = { BELOW: 0, NEAR: 1, NONE: 2, MET: 3 };
    return {
      id: s(std.id), code, strand: strandOf(code, s(std.strand) || null), description: s(std.description),
      counts, pctMet: startedN ? Math.round((100 * counts.MET) / startedN) : null, skills: skillsOut,
      byStudent: byStudent.sort((a, b) => rank[a.band] - rank[b.band] || (a.avg ?? 101) - (b.avg ?? 101) || a.name.localeCompare(b.name)),
    };
  };
  const all = stds.filter((x) => x.isActive !== false).map(rowOf).sort((a, b) => byCode(a.code, b.code));
  const opened = openId ? all.find((r) => r.id === openId) ?? null : null;
  return {
    classId: s(klass.id), className: s(klass.name), grade: Number(grade?.level ?? 0), students: ids.length,
    rows: all.map(({ byStudent: _b, ...r }) => r), open: opened,
  };
}
