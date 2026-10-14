/**
 * 🧭 The MAP plan grouped BY SKILL (owner r67 §6, fixes the crowded plan): each skill ONCE in a goal area (with its star,
 * one Practise button, the MAP statements it covers folded, standard codes small) instead of every statement repeating
 * its skills. A skill linked to statements of several stages is listed in the first stage (Develop, then Reinforce, then
 * Introduce). Statements without a platform skill are kept, folded, at the end of their stage. Pure and client-safe.
 */
import type { StarInfo } from "./skill-stars";

export interface PlanRefLike { id: string; name: string; key?: string; star?: StarInfo; status?: string }
export interface StatementLike { text: string; standards: string[]; skills: PlanRefLike[] }
export interface StageLike { key: string; topics: { name: string; statements: StatementLike[] }[] }
export interface SkillGroup { key: string; skill: PlanRefLike; star: StarInfo; statements: { text: string; standards: string[]; topic: string }[]; standards: string[]; topics: string[] }
export interface GroupedStage { key: string; skills: SkillGroup[]; unlinked: { text: string; standards: string[]; topic: string }[] }

const ORDER = ["DEVELOP", "REINFORCE", "INTRODUCE"];
export const NOT_STARTED_STAR: StarInfo = { status: "NOT_STARTED" };

/** The stages of one goal area, each skill listed once (in its first stage). */
export function groupStagesBySkill(stages: readonly StageLike[]): GroupedStage[] {
  const sorted = [...stages].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const placed = new Map<string, SkillGroup>();
  const out: GroupedStage[] = [];
  for (const st of sorted) {
    const g: GroupedStage = { key: st.key, skills: [], unlinked: [] };
    for (const t of st.topics) for (const x of t.statements) {
      const line = { text: x.text, standards: x.standards, topic: t.name };
      if (!x.skills.length) { g.unlinked.push(line); continue; }
      for (const k of x.skills) {
        const key = k.key ?? k.id;
        let sg = placed.get(key);
        if (!sg) { sg = { key, skill: k, star: k.star ?? NOT_STARTED_STAR, statements: [], standards: [], topics: [] }; placed.set(key, sg); g.skills.push(sg); }
        if (!sg.statements.some((y) => y.text === line.text)) sg.statements.push(line);
        for (const c of x.standards) if (!sg.standards.includes(c)) sg.standards.push(c);
        if (!sg.topics.includes(t.name)) sg.topics.push(t.name);
      }
    }
    out.push(g);
  }
  return out;
}

/** "8 of 20 skills mastered" over a whole plan (each skill once). */
export function planStarCount(areas: readonly { stages: readonly StageLike[] }[]): { mastered: number; total: number } {
  const seen = new Map<string, StarInfo>();
  for (const a of areas) for (const st of a.stages) for (const t of st.topics) for (const x of t.statements) for (const k of x.skills) if (!seen.has(k.key ?? k.id)) seen.set(k.key ?? k.id, k.star ?? NOT_STARTED_STAR);
  return { mastered: [...seen.values()].filter((v) => v.status === "MASTERED").length, total: seen.size };
}
