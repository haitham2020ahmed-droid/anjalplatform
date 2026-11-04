/**
 * 🗺️ Student MAP page → "Your MAP practice" (owner r68 §B): never "Nothing here yet". EVERY skill the student has
 * practised on the platform (any source: Curriculum Map, assigned work, plans, free practice — its ONE status exists)
 * that is linked to MAP, grouped by MAP goal area (Literary · Informational · Vocabulary · Grammar & Usage · Mechanics ·
 * Writing), each with its star and a Practise button. No question counts. Students never see level words.
 *
 * The goal area of a skill: the MAP goal area of its family on the student's grade bank (map-plan.ts groupPools, kept
 * in memory) — any copy of the skill counts (one skill key, skills/status.ts); else its strand (Literature → Literary,
 * Informational → Informational, Vocabulary, Grammar → Grammar & Usage or Mechanics, Writing). One read of the student's
 * statuses; the rest is cached.
 */
import type { Repo } from "../seeding/repo";
import { currentRows, skillKeyIndex, studentSchool, type StarStatus } from "../skills/status";
import { schoolSkillIndex } from "../questions/skill-questions";
import { strandOf, tabOf, type MySkillsTab } from "../skills/my-skills";
import { GROUPS, groupPools, type GroupKey } from "../map/map-plan";
import { healHoldingSkillStatus } from "../nafs/bank";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** mechanics families (capitals, punctuation, spelling): MAP's Mechanics goal area */
const MECH = new Set(["capitalization", "commas", "quotations-dialogue", "titles-abbreviations", "apostrophes-contractions", "spelling"]);

export interface MapPracticeSkill { key: string; name: string; skillId: string; status: StarStatus; tab: MySkillsTab; href: string }
export interface MapPracticeArea { key: GroupKey; name: string; icon: string; skills: MapPracticeSkill[] }
export interface MapPracticeView { areas: MapPracticeArea[]; total: number; counts: Record<MySkillsTab, number> }

/** The goal area of a skill key from its strand (pure; when the grade bank does not name one). */
export function areaOfStrand(key: string, skill: { category?: string; domain?: string } | null): GroupKey {
  if (key.startsWith("fam:") && MECH.has(key.slice(4))) return "MECH";
  const st = strandOf(key, skill);
  return st === "LITERATURE" ? "LIT" : st === "INFORMATIONAL" ? "INFO" : st === "VOCABULARY" ? "VOCAB" : st === "WRITING" ? "WRITING" : s(skill?.category).toUpperCase() === "MECHANICS" ? "MECH" : "GRAMMAR";
}

export async function mapPracticeSkills(repo: Repo, studentId: string): Promise<MapPracticeView> {
  const schoolId = await studentSchool(repo, studentId);
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  const [rowsRaw, ix, idx, pk] = await Promise.all([
    repo.findMany("SkillStatus", { studentId }, { select: ["id", "skillKey", "level", "status", "skillId"] }),
    skillKeyIndex(repo, schoolId), schoolSkillIndex(repo, schoolId),
    g ? groupPools(repo, schoolId, Number(g.level)).catch(() => null) : Promise.resolve(null),
  ]);
  // self-heal: quietly drop (and delete) any stray SkillStatus row left on a NAFS holding skill — see bank.ts healHoldingSkillStatus
  const rows = await healHoldingSkillStatus(repo, schoolId, rowsRaw).catch(() => rowsRaw);
  const areaOfKey = new Map<string, GroupKey>();
  for (const k of pk?.skills.values() ?? []) { const key = ix.keyOf.get(k.id); if (key && !areaOfKey.has(key)) areaOfKey.set(key, k.group); }
  const counts: Record<MySkillsTab, number> = { MASTERED: 0, LEARNING: 0, REVIEW: 0, NOT_STARTED: 0 };
  const by = new Map<GroupKey, MapPracticeSkill[]>();
  for (const [key, r] of currentRows(rows)) {
    const status = (s(r.status) || "NOT_STARTED") as StarStatus;
    if (status === "NOT_STARTED") continue; // practised only
    const skillId = s(r.skillId) || ix.skillsOf.get(key)?.[0] || "";
    if (!skillId) continue;
    const sk = idx.skillOf.get(skillId) ?? null;
    if (sk && sk.isActive === false) continue; // defensive: never show an inactive (e.g. NAFS holding) skill here
    const area = areaOfKey.get(key) ?? areaOfStrand(key, sk);
    const tab = tabOf(status);
    counts[tab]++;
    by.set(area, [...(by.get(area) ?? []), { key, name: ix.nameOf.get(key) ?? sk?.name ?? "Skill", skillId, status, tab, href: `/practice/${encodeURIComponent(skillId)}?from=map` }]);
  }
  const areas = GROUPS.filter((x) => by.has(x.key)).map((x) => ({ key: x.key, name: x.name, icon: x.icon, skills: by.get(x.key)!.sort((a, b) => a.name.localeCompare(b.name)) }));
  return { areas, total: areas.reduce((n, a) => n + a.skills.length, 0), counts };
}
