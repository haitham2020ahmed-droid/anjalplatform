/**
 * ⭐ r82 (owner, live site after r78: "Student Skills STILL shows ALL skills, not only what was assigned"): the skill(s)
 * the teacher actually CHOSE for one assignment — never the skills found in its questions.
 *
 * The r78 cause: a set of questions (a Curriculum Map send, a MAP plan / MAP group set, a hand-picked set) counted EVERY
 * skill of its questions (up to 20 per set). A Curriculum Map place (e.g. "Analyze Craft and Structure") holds questions
 * of a dozen skills, so two or three sends — plus a co-teacher's work in the same class — made almost every skill of the
 * grade a column. Now one assignment counts:
 *
 *   1. its own skill: Assignment.skillId / skillIds (Assign, Year plan ☆, Plans, RTI, MAP recommendations …);
 *   2. a section of a Plan (SkillPlan.doc): the section's skill;
 *   3. a Curriculum Map place (a plan's place by its item code, or a direct Curriculum Map send by its title): the
 *      skills the MAP PLACE DECLARES ("Reread / Diagrams and Headings \ Compare and Contrast" → their skill families);
 *   4. a MAP plan set ("MAP plan · Literary Text"): the skills the MAP plan's area names (MapPlan.items[].skillIds);
 *   5. a set built on ONE skill (every question of the same skill: the adaptive / ready set of a skill the teacher
 *      picked): that skill;
 *   6. anything else (a MAP goal-area group, a mix of questions with no chosen skill): NO skill.
 *
 * Light: the plans and MAP plans of the sets in two bounded reads, the Curriculum Map places from the shared 60 s node
 * cache, the set questions only for the sets still unresolved (batched).
 */
import type { Repo, Row } from "../seeding/repo";
import { keysOfPlaceText, type SkillKeyIndex } from "./status";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
const ids = (v: unknown): string[] => { const a = json<unknown>(v, null); return Array.isArray(a) ? a.map(s).filter(Boolean) : []; };

/** at most this many set questions are read in all (only sets with no chosen skill) */
const SET_QUESTIONS_TAKE = 20000;
/** "Unit 1 · Text Set 1 · Analyze Craft and Structure (Meeting)" → the place part before a level / adaptive tag */
const placeTitle = (title: string) => s(title).replace(/\s*\((?:adaptive|Exceeding|Meeting|Approaching)[^)]*\)\s*$/i, "").replace(/\s*\(\d+ questions?\)\s*$/i, "").trim();

/** How the skills of one assignment were found (for the tests and the guard). */
export type ChosenBy = "SKILL" | "PLAN_SECTION" | "MAP_PLACE" | "MAP_PLAN" | "ONE_SKILL_SET" | "NONE";
export interface Chosen { keys: Map<string, string>; by: ChosenBy }

/** Pure: the skill ids → key → a skill id (unknown ids dropped). */
function keysOfIds(skillIds: readonly string[], ix: Pick<SkillKeyIndex, "keyOf">): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of skillIds) { const k = ix.keyOf.get(s(id)); if (k && !out.has(k)) out.set(k, s(id)); }
  return out;
}
/** Pure: the family keys a place's text names → key → its first skill id of the school (keys the school lacks dropped). */
export function keysOfDeclared(text: string | null | undefined, ix: Pick<SkillKeyIndex, "skillsOf">): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of keysOfPlaceText(text)) { const id = ix.skillsOf.get(k)?.[0]; if (id) out.set(k, id); }
  return out;
}

/**
 * The chosen skills of each assignment (id → key → skill id, and how). `planOf`: assignment id → the plan it is a place
 * of (from the Assigned page's PLAN rows); rows also carry curriculumPlanId.
 */
export async function chosenSkills(repo: Repo, schoolId: string, rows: readonly Row[], ix: SkillKeyIndex, planOf: ReadonlyMap<string, string> = new Map()): Promise<Map<string, Chosen>> {
  const out = new Map<string, Chosen>();
  const open: Row[] = [];
  for (const a of rows) {
    const own = keysOfIds([...(a.skillId ? [s(a.skillId)] : []), ...ids(a.skillIds)], ix);
    if (own.size) out.set(s(a.id), { keys: own, by: "SKILL" });
    else if (a.assessmentId) open.push(a);
    else out.set(s(a.id), { keys: new Map(), by: "NONE" });
  }
  if (!open.length) return out;
  // 2 + 3a: the places of plans — the plan's section skill, else the map place's declared skills (by the item's code)
  const planIds = [...new Set(open.map((a) => planOf.get(s(a.id)) ?? s(a.curriculumPlanId)).filter((x) => x && !x.includes("_") && x !== "TEST"))].slice(0, 400);
  const [plans, items] = planIds.length ? await Promise.all([
    repo.findMany("SkillPlan", { id: { in: planIds } }, { select: ["id", "doc"] }).catch(() => [] as Row[]),
    repo.findMany("SkillPlanItem", { planId: { in: planIds } }, { select: ["planId", "code", "assignmentIds"] }),
  ]) : [[] as Row[], [] as Row[]];
  const sectionSkill = new Map<string, string>();
  for (const p of plans) for (const sec of json<{ sections?: { skillId?: unknown; assignmentId?: unknown; assignmentIds?: unknown }[] }>(p.doc, {}).sections ?? []) {
    if (!sec?.skillId) continue;
    for (const aid of [s(sec.assignmentId), ...ids(sec.assignmentIds)].filter(Boolean)) sectionSkill.set(aid, s(sec.skillId));
  }
  const codeOf = new Map<string, string>();
  for (const it of items) for (const aid of ids(it.assignmentIds)) codeOf.set(aid, s(it.code));
  // the Curriculum Map places (cached): code → declared skills; "Unit · Set · Category" title → declared skills
  let declaredByCode = new Map<string, string>(), declaredByTitle = new Map<string, string>();
  const needMap = open.some((a) => !sectionSkill.has(s(a.id)));
  if (needMap) {
    try {
      const { attachmentNodes } = await import("../curriculum-map/questions");
      for (const n of await attachmentNodes(repo, schoolId)) {
        if (!n.skills) continue;
        const cat = n.code.replace(/\.(ABOVE|ON|BELOW)$/, "");
        if (!declaredByCode.has(cat)) declaredByCode.set(cat, n.skills);
        if (!declaredByCode.has(n.code)) declaredByCode.set(n.code, n.skills);
        const t = `${n.unitTitle} · ${n.heading} · ${n.categoryLabel.replace(/^\d+-\s*/, "")}`;
        if (!declaredByTitle.has(t)) declaredByTitle.set(t, n.skills);
      }
    } catch { declaredByCode = new Map(); declaredByTitle = new Map(); }
  }
  // 4: MAP plan sets — the area's skills (one bounded read of the classes' sent MAP plans)
  const mapSets = open.filter((a) => s(a.title).startsWith("MAP plan · "));
  const mapSkills = new Map<string, string[]>();
  if (mapSets.length) {
    const classIds = [...new Set(mapSets.map((a) => s(a.classId)).filter(Boolean))];
    const mp = classIds.length ? await repo.findMany("MapPlan", { classId: { in: classIds }, status: "SENT" }, { select: ["items", "assignmentIds"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 2000 }).catch(() => [] as Row[]) : [];
    const want = new Set(mapSets.map((a) => s(a.id)));
    const { groupOf } = await import("../map/map-plan");
    for (const p of mp) {
      const aids = ids(p.assignmentIds).filter((x) => want.has(x));
      if (!aids.length) continue;
      const areas = json<{ group?: string; skillIds?: unknown }[]>(p.items, []);
      for (const aid of aids) {
        const name = s(mapSets.find((a) => s(a.id) === aid)?.title).slice("MAP plan · ".length);
        const area = areas.find((x) => { try { return groupOf(s(x.group))?.name === name; } catch { return false; } });
        if (area) mapSkills.set(aid, ids(area.skillIds));
      }
    }
  }
  const rest: Row[] = [];
  for (const a of open) {
    const id = s(a.id);
    const sec = sectionSkill.get(id);
    if (sec) { const k = keysOfIds([sec], ix); if (k.size) { out.set(id, { keys: k, by: "PLAN_SECTION" }); continue; } }
    const declared = codeOf.has(id) ? declaredByCode.get(codeOf.get(id)!) : declaredByTitle.get(placeTitle(s(a.title)));
    if (declared) { const k = keysOfDeclared(declared, ix); if (k.size) { out.set(id, { keys: k, by: "MAP_PLACE" }); continue; } }
    const mk = mapSkills.get(id);
    if (mk?.length) { const k = keysOfIds(mk, ix); if (k.size) { out.set(id, { keys: k, by: "MAP_PLAN" }); continue; } }
    rest.push(a);
  }
  // 5: a set built on ONE skill → that skill; else nothing
  const one = await oneSkillOfSets(repo, [...new Set(rest.map((a) => s(a.assessmentId)))], ix);
  for (const a of rest) {
    const k = one.get(s(a.assessmentId));
    out.set(s(a.id), k ? { keys: new Map([k]), by: "ONE_SKILL_SET" } : { keys: new Map(), by: "NONE" });
  }
  return out;
}

/** Sets whose questions are ALL of one skill (key): set id → [key, skill id]. Bounded, batched reads. */
async function oneSkillOfSets(repo: Repo, assessmentIds: readonly string[], ix: SkillKeyIndex): Promise<Map<string, [string, string]>> {
  const out = new Map<string, [string, string]>();
  if (!assessmentIds.length) return out;
  const aq: Row[] = [];
  for (let i = 0; i < assessmentIds.length && aq.length < SET_QUESTIONS_TAKE; i += 300) aq.push(...(await repo.findMany("AssessmentQuestion", { assessmentId: { in: assessmentIds.slice(i, i + 300) } }, { select: ["assessmentId", "questionId"], take: SET_QUESTIONS_TAKE - aq.length })));
  const qids = [...new Set(aq.map((x) => s(x.questionId)))];
  const skillOfQ = new Map<string, string>();
  for (let i = 0; i < qids.length; i += 1000) for (const q of await repo.findMany("Question", { id: { in: qids.slice(i, i + 1000) } }, { select: ["id", "skillId"] })) skillOfQ.set(s(q.id), s(q.skillId));
  const keysOf = new Map<string, Map<string, string>>();
  for (const x of aq) {
    const sk = skillOfQ.get(s(x.questionId)), k = sk ? ix.keyOf.get(sk) : undefined;
    const m = keysOf.get(s(x.assessmentId)) ?? new Map<string, string>();
    m.set(k ?? `?${s(x.questionId)}`, sk ?? "");
    keysOf.set(s(x.assessmentId), m);
  }
  for (const [set, m] of keysOf) if (m.size === 1) { const [[k, id]] = [...m]; if (!k.startsWith("?")) out.set(set, [k, id]); }
  return out;
}
