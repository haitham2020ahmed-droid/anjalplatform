/**
 * NAFS areas for the general NAFS preparation plan — read from Phase 1's shared NAFS data:
 *
 *   NafsArea       the admin-edited list (/admin/nafs-links: rename, reorder, switch off, add) — only active areas
 *   NafsSkillLink  skill family → area (AUTO from the link script, or ADMIN); a family the admin has not linked yet
 *                  gets the same deterministic rule the link script uses (nafsRuleForFamily), only when it is sure
 *                  (≥ 0.8) — never a silent guess, and nothing is written here
 *   counts         countQuestionsOfSkills — the one shared count (same number as search, MAP and NAFS sections)
 *
 * Bounded: the areas list, one grade's skills, their families, links and standards (ids in chunks of 400).
 */
import type { Repo, Row } from "../seeding/repo";
import { countQuestionsOfSkills } from "../questions/skill-questions";
import { ensureNafsAreas, LINK_CONFIDENCE, nafsAreas, nafsRuleForFamily } from "../nafs/nafs-links";

const s = (v: unknown) => String(v ?? "");
const CHUNK = 400;

export interface NafsAreaRef { code: string; name: string }

/** The active NAFS areas in the admin's order (the starting five are created once if the list is still empty). */
export async function nafsAreaList(repo: Repo): Promise<NafsAreaRef[]> {
  let rows = await nafsAreas(repo, { activeOnly: true });
  if (!rows.length && !(await repo.findMany("NafsArea", {}, { select: ["id"], take: 1 })).length) {
    await ensureNafsAreas(repo);
    rows = await nafsAreas(repo, { activeOnly: true });
  }
  return rows.map((a) => ({ code: a.code, name: a.name }));
}

export interface NafsAreaSkills { code: string; name: string; skills: { id: string; name: string; code: string; questions: number }[] }

async function inChunks(ids: string[], read: (part: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await read(ids.slice(i, i + CHUNK))));
  return out;
}

/**
 * The skills of each NAFS area in one grade (skills with published questions first, then curriculum order).
 * `areaCodes` narrows the areas (default: every active area).
 */
export async function nafsAreaSkills(repo: Repo, schoolId: string, curriculumIds: string[], areaCodes?: string[] | null): Promise<NafsAreaSkills[]> {
  const all = await nafsAreaList(repo);
  const areas = all.filter((a) => !areaCodes?.length || areaCodes.includes(a.code));
  if (!curriculumIds.length || !areas.length) return areas.map((a) => ({ ...a, skills: [] }));
  const skills = (await repo.findMany("Skill", { curriculumId: { in: curriculumIds }, deletedAt: null, isActive: true }, { select: ["id", "name", "code", "sequence", "familyId"] }))
    .filter((k) => !s(k.code).endsWith(".curriculum-map-unclassified"));
  if (!skills.length) return areas.map((a) => ({ ...a, skills: [] }));
  const famIds = [...new Set(skills.map((k) => s(k.familyId)).filter(Boolean))];
  const [areaRows, links, fams, mapAreas] = await Promise.all([
    repo.findMany("NafsArea", {}, { select: ["id", "code"] }),
    inChunks(famIds, (part) => repo.findMany("NafsSkillLink", { familyId: { in: part } }, { select: ["familyId", "areaId"] })),
    inChunks(famIds, (part) => repo.findMany("SkillFamily", { id: { in: part } }, { select: ["id", "code", "name", "domain", "category", "mapGoalAreaId"] })),
    repo.findMany("MapGoalArea", {}, { select: ["id", "code"] }),
  ]);
  const codeOfArea = new Map(areaRows.map((a) => [s(a.id), s(a.code)]));
  const areaOfFamily = new Map<string, string>();
  for (const l of links) { const c = codeOfArea.get(s(l.areaId)); if (c) areaOfFamily.set(s(l.familyId), c); }
  // families not linked yet: the link script's own rule, applied only when it is sure (nothing is stored)
  const unlinked = fams.filter((f) => !areaOfFamily.has(s(f.id)));
  if (unlinked.length) {
    const ids = skills.filter((k) => unlinked.some((f) => s(f.id) === s(k.familyId))).map((k) => s(k.id));
    const stdLinks = await inChunks(ids, (part) => repo.findMany("SkillStandard", { skillId: { in: part } }, { select: ["skillId", "standardId"] }));
    const stds = stdLinks.length ? await inChunks([...new Set(stdLinks.map((l) => s(l.standardId)))], (part) => repo.findMany("Standard", { id: { in: part } }, { select: ["id", "code"] })) : [];
    const stdCode = new Map(stds.map((x) => [s(x.id), s(x.code)]));
    for (const f of unlinked) {
      const mine = new Set(skills.filter((k) => s(k.familyId) === s(f.id)).map((k) => s(k.id)));
      const d = nafsRuleForFamily({
        code: s(f.code), name: s(f.name), domain: s(f.domain), category: s(f.category),
        mapArea: s(mapAreas.find((a) => a.id === f.mapGoalAreaId)?.code) || null,
        standards: [...new Set(stdLinks.filter((l) => mine.has(s(l.skillId))).map((l) => stdCode.get(s(l.standardId)) ?? "").filter(Boolean))],
      });
      if (d.area && d.confidence >= LINK_CONFIDENCE) areaOfFamily.set(s(f.id), d.area);
    }
  }
  const counts = await countQuestionsOfSkills(repo, schoolId, skills.map((k) => s(k.id)));
  return areas.map((a) => {
    const mine = skills.filter((k) => areaOfFamily.get(s(k.familyId)) === a.code)
      .sort((x, y) => Number((counts.get(s(y.id)) ?? 0) > 0) - Number((counts.get(s(x.id)) ?? 0) > 0) || Number(x.sequence ?? 0) - Number(y.sequence ?? 0) || s(x.name).localeCompare(s(y.name)));
    return { code: a.code, name: a.name, skills: mine.map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code), questions: counts.get(s(k.id)) ?? 0 })) };
  });
}

/** Published question counts per skill — the shared count (Phase 1), so the wizard shows the bank's own numbers. */
export async function publishedQuestionCounts(repo: Repo, schoolId: string, skillIds: string[]): Promise<Map<string, number>> {
  return countQuestionsOfSkills(repo, schoolId, skillIds);
}
