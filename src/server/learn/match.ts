/**
 * 🔗 Lesson ↔ skill: which Learn lesson explains which platform skill (owner: "EVERY skill must be explained").
 *
 * For one skill the FIRST rule that finds a lesson wins:
 *   1 NAME      the lesson's skillNames has the skill's name (case, spaces and punctuation ignored)
 *   2 FAMILY    the lesson's families has the skill's taxonomy family (data/curriculum/taxonomy.json)
 *   3 STANDARD  a CCSS code of the lesson = a code of the skill (SkillStandard)
 *   4 PARENT    the same code without its letter (L.4.1.b → L.4.1)
 *   5 ANCHOR    the same standard in another grade (RI.4.2 ~ RI.5.2)
 * The lesson list is the catalogue (lesson files + the planned topics), so coverage works before every file exists.
 * The school's skills are the ONE master list (src/server/skills/master.ts) plus each skill's family code, read with a
 * fixed number of queries and kept a minute per school.
 */
import type { Repo } from "../seeding/repo";
import { masterSkills, type MasterSkill } from "../skills/master";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import type { LessonMeta } from "./files";

const s = (v: unknown) => String(v ?? "");
export type MatchRule = "NAME" | "FAMILY" | "STANDARD" | "PARENT" | "ANCHOR";
export const RULE_LABEL: Record<MatchRule, string> = { NAME: "by skill name", FAMILY: "by skill family", STANDARD: "by standard", PARENT: "by parent standard", ANCHOR: "by the same standard in another grade" };

export const normName = (n: string) => s(n).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** "CCSS.ELA-LITERACY.L.4.1.b" → "L.4.1.B" */
export const normStd = (c: string) => s(c).trim().replace(/^CCSS\.ELA-LITERACY\./i, "").replace(/^CCSS\./i, "").toUpperCase();
/** "L.4.1.B" → "L.4.1" (codes of 3 parts stay as they are) */
export const parentStd = (c: string) => { const p = normStd(c).split("."); return p.length > 3 ? p.slice(0, 3).join(".") : p.join("."); };
/** "RI.4.2" → "RI.*.2" (the same standard in any grade) */
export const anchorStd = (c: string) => { const p = parentStd(c).split("."); return p.length >= 3 ? `${p[0]}.*.${p.slice(2).join(".")}` : p.join("."); };

export interface SkillKey { name: string; family: string | null; standards: string[] }
export interface Match { rule: MatchRule; codes: string[] }

/** The lessons that explain one skill (first rule that finds any), or null. */
export function lessonsForSkill(k: SkillKey, lessons: readonly LessonMeta[]): Match | null {
  const name = normName(k.name);
  const stds = k.standards.map(normStd).filter(Boolean);
  const rules: [MatchRule, (l: LessonMeta) => boolean][] = [
    ["NAME", (l) => Boolean(name) && l.skillNames.some((n) => normName(n) === name)],
    ["FAMILY", (l) => Boolean(k.family) && l.families.includes(k.family!)],
    ["STANDARD", (l) => stds.length > 0 && l.standards.some((x) => stds.includes(normStd(x)))],
    ["PARENT", (l) => stds.length > 0 && l.standards.some((x) => stds.some((y) => parentStd(y) === parentStd(x)))],
    ["ANCHOR", (l) => stds.length > 0 && l.standards.some((x) => stds.some((y) => anchorStd(y) === anchorStd(x)))],
  ];
  for (const [rule, ok] of rules) {
    const codes = lessons.filter(ok).map((l) => l.code);
    if (codes.length) return { rule, codes };
  }
  return null;
}

// ------------------------------------------------------------------ the school's skills (master list + family codes)

export interface LearnSkill extends MasterSkill { family: string | null }
const cache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<LearnSkill[]> }>>();
/** Forget the cached skills (tests, after an import). */
export function clearLearnSkills(repo: Repo): void { cache.delete(repo); }

/** Every active skill of the school (the master list) with its taxonomy family code. Fixed number of queries. */
export function learnSkills(repo: Repo, schoolId: string): Promise<LearnSkill[]> {
  let m = cache.get(repo); if (!m) cache.set(repo, (m = new Map()));
  const v = modelVersion("Skill", "SkillFamily", "SkillStandard", "Grade", "Curriculum"), hit = m.get(schoolId);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const list = await masterSkills(repo, schoolId);
    if (!list.length) return [];
    const rows = await repo.findMany("Skill", { id: { in: list.map((k) => k.id) } }, { select: ["id", "familyId"] });
    const famIds = [...new Set(rows.map((r) => s(r.familyId)).filter(Boolean))];
    const fams = famIds.length ? await repo.findMany("SkillFamily", { id: { in: famIds } }, { select: ["id", "code"] }) : [];
    const codeOf = new Map(fams.map((f) => [s(f.id), s(f.code)]));
    const famOf = new Map(rows.map((r) => [s(r.id), codeOf.get(s(r.familyId)) ?? null]));
    return list.map((k) => ({ ...k, family: famOf.get(k.id) ?? null }));
  })();
  remember(m, schoolId, { v, at: Date.now(), p }, 16);
  p.catch(() => m!.delete(schoolId));
  return p;
}

/** For each skill id: its lesson match (or null). */
export function matchSkills(skills: readonly LearnSkill[], lessons: readonly LessonMeta[]): Map<string, Match | null> {
  return new Map(skills.map((k) => [k.id, lessonsForSkill({ name: k.name, family: k.family, standards: k.standards }, lessons)]));
}
/** The skills (ids) a lesson explains: every skill whose match lists the lesson. */
export function skillsOfLesson(code: string, matches: Map<string, Match | null>): string[] {
  return [...matches].filter(([, m]) => m?.codes.includes(code)).map(([id]) => id);
}
