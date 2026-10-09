/**
 * 🤖 Automatic placement: Below / On / Above for every student of a class, from their own data, the most
 * direct and recent evidence first:
 *   1. their level in this category (CV / ACS / RTR), learned from their own adaptive work
 *   2. platform performance: accuracy of their last 30 days (at least 10 careful answers)
 *   3. the Placement test
 *   4. MAP: Lexile (Reading) against the grade's Lexile bands
 *   5. MAP: RIT percentile (Below < 41st · On 41st–60th · Above > 60th)
 *   6. no data → On Level (the teacher is told)
 * The teacher sees each suggestion with its reason and can move any student before saving or sending.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { lexileBands, levelForLexile } from "./lexile";
import { ladderSettings } from "./ladder-settings";
import { classMembers, levelsOf, mapSummaries, practiceStats, studentNames, type Level } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "");
export type Evidence = "CATEGORY" | "PLATFORM" | "PLACEMENT" | "LEXILE" | "MAP" | "NO_DATA";
export const EVIDENCE_NAME: Record<Evidence, string> = { CATEGORY: "Their work in this section", PLATFORM: "Platform results (last 30 days)", PLACEMENT: "Placement test", LEXILE: "MAP Lexile", MAP: "MAP score", NO_DATA: "No data yet" };

export interface Suggestion { studentId: string; name: string; current: Level | null; currentSource: string | null; suggested: Level; from: Evidence; reason: string }

export async function suggestLevels(repo: Repo, actor: Actor, classId: string, opts: { category?: "CV" | "ACS" | "RTR" | null; subject?: "READING" | "LANGUAGE" } = {}): Promise<{ className: string; grade: number; rows: Suggestion[]; noData: number }> {
  assertCan(actor, "students:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const subject = opts.subject ?? "READING";
  const [names, levels, practice, rules] = await Promise.all([studentNames(repo, ids), levelsOf(repo, ids), practiceStats(repo, ids), ladderSettings(repo, actor.schoolId)]);
  const maps = await mapSummaries(repo, ids, subject, new Map(ids.map((id) => [id, grade])));
  const band = (await lexileBands(repo, actor.schoolId))[grade];
  const rows: Suggestion[] = ids.map((id) => {
    const lv = levels.get(id)!, p = practice.get(id)!, m = maps.get(id);
    const base = { studentId: id, name: names.get(id)?.name ?? "Student", current: lv.level, currentSource: lv.source };
    const cat = opts.category ? lv.categories[opts.category] : undefined;
    if (cat) return { ...base, suggested: cat, from: "CATEGORY" as const, reason: `Reached ${cat.toLowerCase()} level in their own work here.` };
    if (p.recentAnswers >= 10 && p.recentAccuracy !== null) {
      const l: Level = p.recentAccuracy >= rules.upPct ? "ABOVE" : p.recentAccuracy < 50 ? "BELOW" : "ON";
      return { ...base, suggested: l, from: "PLATFORM" as const, reason: `${p.recentAccuracy}% correct on ${p.recentAnswers} answers (last 30 days).` };
    }
    if (lv.level && lv.source === "PLACEMENT") return { ...base, suggested: lv.level, from: "PLACEMENT" as const, reason: "From the Placement test." };
    const lexLevel = subject === "READING" ? levelForLexile(band, m?.lexile ?? null) : null;
    if (lexLevel) return { ...base, suggested: lexLevel, from: "LEXILE" as const, reason: `Lexile ${m!.lexile}L (On Level ${band.onMin}–${band.onMax}L).` };
    if (m?.band && m.latest) return { ...base, suggested: m.band, from: "MAP" as const, reason: `MAP ${m.latest.term}: RIT ${m.latest.rit}${m.latest.percentile !== null ? `, ${m.latest.percentile}th percentile` : ""}.` };
    return { ...base, suggested: "ON" as const, from: "NO_DATA" as const, reason: "No results yet: starts at On Level." };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { className: s(klass.name), grade, rows, noData: rows.filter((r) => r.from === "NO_DATA").length };
}
