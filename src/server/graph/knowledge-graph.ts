/**
 * 🕸️ The knowledge graph: skills → prerequisites → questions → student performance → recommendations.
 *
 *   loadGraph          the skills of a curriculum with their prerequisite edges (SkillPrerequisite), depth, dependents
 *   skillStates        what one student shows on every skill (mastery, answers, ability θ, recent errors, misconception)
 *   diagnose           when a student struggles with a skill: is the problem the skill itself, a weak prerequisite,
 *                      or a prerequisite never checked? Misconceptions point to the foundation skill they belong to
 *                      (e.g. "chooses an idea the text does not support" → Cite Text Evidence).
 *   rootGaps           the student's weak foundations: weak skills whose own prerequisites are fine, ranked by how
 *                      many later skills they block
 *   classGaps          the same for a class: which foundation to reteach, to whom, and what it unblocks
 *
 * Every function reads in a fixed number of queries; the graph walk is in memory and cycle-safe.
 */
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const family = (code: string) => (code.includes(".") ? code.slice(code.indexOf(".") + 1) : code);

/** The foundation skill family a misconception belongs to (where the mistaken idea is taught). */
export const MISCONCEPTION_ROOT: Record<string, string> = {
  NOT_SUPPORTED: "text-evidence", DETAIL_NOT_MAIN: "central-idea", CONTEXT_IGNORED: "context-clues", LITERAL_MEANING: "figurative-language",
  SEQUENCE_TIME: "sequence", CAUSE_EFFECT: "cause-effect", CHARACTER_PERSPECTIVE: "character", WORD_PARTS: "prefixes",
  WORD_RELATIONSHIP: "synonyms-antonyms", PART_OF_SPEECH: "nouns", VERB_FORM: "verb-tenses", AGREEMENT: "subject-verb-agreement",
  PRONOUN_REFERENCE: "pronouns", SENTENCE_BOUNDARY: "sentences", WORD_FORM: "plural-nouns", APOSTROPHE: "possessive-nouns",
  COMMA_PUNCT: "commas", CAPITALIZATION: "capitalization", HOMOPHONE: "homographs-homophones", SPELLING: "spelling",
  CONTRADICTS_TEXT: "text-evidence", AUTHOR_PURPOSE: "author-purpose", TEXT_STRUCTURE: "text-features",
};

export interface GraphNode { id: string; code: string; family: string; name: string; sequence: number; category: string; depth: number }
export interface Edge { skillId: string; prerequisiteSkillId: string; minimumMastery: number; weight: number }
export interface Graph { nodes: Map<string, GraphNode>; prereqs: Map<string, Edge[]>; dependents: Map<string, string[]>; byFamily: Map<string, string> }

/** The graph of one curriculum (a grade). */
export async function loadGraph(repo: Repo, curriculumId: string): Promise<Graph> {
  const skills = await repo.findMany("Skill", { curriculumId, deletedAt: null }, { select: ["id", "code", "name", "sequence", "category"] });
  const ids = skills.map((k) => s(k.id));
  const edges = ids.length ? await repo.findMany("SkillPrerequisite", { skillId: { in: ids } }) : [];
  return buildGraph(skills, edges);
}

/** Pure: builds the graph (depth = longest chain of prerequisites under a skill; 0 = foundation). */
export function buildGraph(skills: Row[], edges: Row[]): Graph {
  const nodes = new Map<string, GraphNode>(skills.map((k) => [s(k.id), { id: s(k.id), code: s(k.code), family: family(s(k.code)), name: s(k.name), sequence: Number(k.sequence ?? 0), category: s(k.category), depth: 0 }]));
  const prereqs = new Map<string, Edge[]>(), dependents = new Map<string, string[]>();
  for (const e of edges) {
    const a = s(e.skillId), b = s(e.prerequisiteSkillId);
    if (!nodes.has(a) || !nodes.has(b) || a === b) continue;
    prereqs.set(a, [...(prereqs.get(a) ?? []), { skillId: a, prerequisiteSkillId: b, minimumMastery: Number(e.minimumMastery ?? 60), weight: Number(e.weight ?? 0.5) }]);
    dependents.set(b, [...(dependents.get(b) ?? []), a]);
  }
  const memo = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0; // a cycle an admin made: cut it
    seen.add(id);
    const d = Math.max(0, ...(prereqs.get(id) ?? []).map((e) => 1 + depth(e.prerequisiteSkillId, seen)));
    seen.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const n of nodes.values()) n.depth = depth(n.id, new Set());
  const byFamily = new Map([...nodes.values()].map((n) => [n.family, n.id]));
  return { nodes, prereqs, dependents, byFamily };
}

/** All prerequisites under a skill (nearest first), cycle-safe. */
export function ancestors(g: Graph, skillId: string, maxDepth = 3): { id: string; distance: number }[] {
  const out: { id: string; distance: number }[] = [], seen = new Set([skillId]);
  let frontier = [skillId];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const e of g.prereqs.get(id) ?? []) if (!seen.has(e.prerequisiteSkillId)) { seen.add(e.prerequisiteSkillId); out.push({ id: e.prerequisiteSkillId, distance: d }); next.push(e.prerequisiteSkillId); }
    frontier = next;
  }
  return out;
}

/** Every skill that depends on this one, directly or not. */
export function descendants(g: Graph, skillId: string): string[] {
  const out = new Set<string>(), stack = [skillId];
  while (stack.length) for (const d of g.dependents.get(stack.pop()!) ?? []) if (!out.has(d) && d !== skillId) { out.add(d); stack.push(d); }
  return [...out];
}

export interface SkillState { mastery: number; attempts: number; theta: number | null; recentErrors: number; recentAnswers: number; misconception: string | null; isMastered: boolean }

/** Recent answers read per skill (the last RECENT_PER_SKILL of each); per-skill queries run this many at a time. */
const RECENT_PER_SKILL = 10;
const RECENT_BATCH = 25;

/**
 * What a student shows on these skills. Mastery and ability in 2 queries; then the last 10 answers of EACH practised
 * skill (one small indexed query per skill with answers, in parallel batches), so a heavily practised skill never
 * crowds the others out of a shared window. Skills without a mastery row have no counted answers and need none.
 */
export async function skillStates(repo: Repo, studentId: string, skillIds: string[]): Promise<Map<string, SkillState>> {
  const out = new Map<string, SkillState>();
  if (!skillIds.length) return out;
  const [mastery, abil] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId, skillId: { in: skillIds } }, { select: ["skillId", "score", "attempts", "isMastered"] }),
    repo.findMany("StudentAbility", { studentId, scope: { in: skillIds.map((id) => `SKILL:${id}`) } }, { select: ["skillId", "theta"] }),
  ]);
  const practised = [...new Set(mastery.filter((r) => Number(r.attempts ?? 0) > 0).map((r) => s(r.skillId)))];
  const recent: Row[] = [];
  for (let i = 0; i < practised.length; i += RECENT_BATCH) {
    const parts = await Promise.all(practised.slice(i, i + RECENT_BATCH).map((skillId) => repo.findMany("QuestionAttempt", { studentId, skillId }, {
      select: ["skillId", "isCorrect", "misconception"], orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }], take: RECENT_PER_SKILL,
    })));
    for (const p of parts) recent.push(...p);
  }
  const m = new Map(mastery.map((r) => [s(r.skillId), r])), th = new Map(abil.map((r) => [s(r.skillId), Number(r.theta)]));
  const rec = new Map<string, Row[]>();
  for (const r of recent) { const l = rec.get(s(r.skillId)) ?? []; if (l.length < RECENT_PER_SKILL) l.push(r); rec.set(s(r.skillId), l); }
  for (const id of skillIds) {
    const l = rec.get(id) ?? [], wrong = l.filter((r) => !r.isCorrect);
    const c = new Map<string, number>(); for (const w of wrong) if (w.misconception) c.set(s(w.misconception), (c.get(s(w.misconception)) ?? 0) + 1);
    const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    out.set(id, { mastery: Number(m.get(id)?.score ?? 0), attempts: Number(m.get(id)?.attempts ?? 0), theta: th.has(id) ? th.get(id)! : null, recentErrors: wrong.length, recentAnswers: l.length, misconception: top && top[1] >= 2 ? top[0] : null, isMastered: Boolean(m.get(id)?.isMastered) });
  }
  return out;
}

const UNKNOWN: SkillState = { mastery: 0, attempts: 0, theta: null, recentErrors: 0, recentAnswers: 0, misconception: null, isMastered: false };
/** A skill the student has shown enough of to judge. */
export const tested = (st: SkillState) => st.attempts >= 3;
/**
 * Weak on the skill. Mastery is held low until there is enough evidence (a few answers always look "low"), so:
 * with an ability estimate from 5+ answers, weak = ability clearly below grade level (θ ≤ −0.6); otherwise weak =
 * mastery below the needed level after 12+ answers; with no ability estimate (older data), mastery after 3+ answers.
 */
export const weak = (st: SkillState, min = 60, strict = false) => {
  if (!tested(st)) return false;
  // strict (a teacher's small group): low mastery alone is not enough when the ability estimate is near grade level —
  // fewer students in the wrong group; the student's own path keeps the wider rule so no real gap is missed
  if (st.theta !== null && st.attempts >= 5) return st.theta <= -0.6 || (st.attempts >= 12 && st.mastery < min && (!strict || st.theta <= -0.3));
  if (st.theta !== null) return false;
  return st.mastery < min;
};
/** Struggling now: enough answers and low mastery or many recent errors. */
export const struggling = (st: SkillState) => st.attempts >= 5 && (st.mastery < 60 || (st.recentAnswers >= 5 && st.recentErrors / st.recentAnswers >= 0.5));

export interface Diagnosis {
  skillId: string; skillName: string;
  verdict: "NOT_STRUGGLING" | "SKILL_ITSELF" | "PREREQUISITE" | "UNTESTED_PREREQUISITE";
  causes: { skillId: string; name: string; why: string; mastery: number | null }[];
  explanation: string;
}

/** Why a student struggles with a skill (pure: graph + states). */
export function diagnose(g: Graph, states: Map<string, SkillState>, skillId: string): Diagnosis {
  const node = g.nodes.get(skillId);
  const st = states.get(skillId) ?? UNKNOWN;
  const name = node?.name ?? "this skill";
  const base = { skillId, skillName: name };
  if (!struggling(st)) return { ...base, verdict: "NOT_STRUGGLING", causes: [], explanation: `No sign of difficulty with ${name}.` };
  const anc = ancestors(g, skillId);
  const minOf = (id: string) => (g.prereqs.get(skillId) ?? []).find((e) => e.prerequisiteSkillId === id)?.minimumMastery ?? 60;
  const weakOnes = anc.filter((a) => weak(states.get(a.id) ?? UNKNOWN, minOf(a.id)));
  // the deepest weak foundation first: fixing it also helps the ones above it
  weakOnes.sort((a, b) => (g.nodes.get(a.id)!.depth - g.nodes.get(b.id)!.depth) || a.distance - b.distance);
  const causes: Diagnosis["causes"] = weakOnes.map((a) => ({ skillId: a.id, name: g.nodes.get(a.id)!.name, why: `Mastery ${Math.round((states.get(a.id) ?? UNKNOWN).mastery)} (needs ${minOf(a.id)})`, mastery: Math.round((states.get(a.id) ?? UNKNOWN).mastery) }));
  // the misconception points to a foundation skill
  const rootFam = st.misconception ? MISCONCEPTION_ROOT[st.misconception] : undefined;
  const rootId = rootFam ? g.byFamily.get(rootFam) : undefined;
  if (rootId && rootId !== skillId && !causes.some((c) => c.skillId === rootId)) {
    const rs = states.get(rootId) ?? UNKNOWN;
    if (!rs.isMastered) causes.push({ skillId: rootId, name: g.nodes.get(rootId)!.name, why: "Their wrong answers show a mistake taught in this skill", mastery: tested(rs) ? Math.round(rs.mastery) : null });
  }
  if (causes.length) return { ...base, verdict: "PREREQUISITE", causes, explanation: `The difficulty with ${name} likely comes from ${causes.map((c) => c.name).join(" and ")}: build ${causes.length > 1 ? "these" : "this"} first.` };
  const untested = anc.filter((a) => a.distance === 1 && !tested(states.get(a.id) ?? UNKNOWN)).map((a) => ({ skillId: a.id, name: g.nodes.get(a.id)!.name, why: "Not practised yet: check it quickly", mastery: null }));
  if (untested.length) return { ...base, verdict: "UNTESTED_PREREQUISITE", causes: untested, explanation: `${name} is hard and ${untested.map((u) => u.name).join(", ")} ha${untested.length > 1 ? "ve" : "s"} not been checked yet: a short check shows whether the gap is underneath.` };
  return { ...base, verdict: "SKILL_ITSELF", causes: [], explanation: `The foundations of ${name} are in place: the difficulty is the skill itself — reteach it with a model and guided practice.` };
}

export interface RootGap { skillId: string; name: string; mastery: number; blocks: { skillId: string; name: string }[]; impact: number }

/** The student's weak foundations: weak skills whose prerequisites are fine, by how many weak later skills they block. */
export function rootGaps(g: Graph, states: Map<string, SkillState>, strict = false): RootGap[] {
  const out: RootGap[] = [];
  for (const n of g.nodes.values()) {
    const st = states.get(n.id) ?? UNKNOWN;
    if (!weak(st, 60, strict)) continue;
    const prereqWeak = (g.prereqs.get(n.id) ?? []).some((e) => weak(states.get(e.prerequisiteSkillId) ?? UNKNOWN, e.minimumMastery, strict));
    if (prereqWeak) continue; // not a root: something under it is weak too
    const blocked = descendants(g, n.id).filter((d) => { const ds = states.get(d) ?? UNKNOWN; return !ds.isMastered; });
    out.push({ skillId: n.id, name: n.name, mastery: Math.round(st.mastery), blocks: blocked.slice(0, 8).map((d) => ({ skillId: d, name: g.nodes.get(d)!.name })), impact: blocked.length + (100 - st.mastery) / 100 });
  }
  return out.sort((a, b) => b.impact - a.impact);
}

export interface ClassGap { skillId: string; name: string; students: string[]; unblocks: string[]; avgMastery: number }

/** A class's foundation gaps: the skills to reteach, to whom, and what they unblock. */
export async function classGaps(repo: Repo, studentIds: string[], curriculumId: string): Promise<{ graph: Graph; gaps: ClassGap[]; diagnoses: Map<string, RootGap[]> }> {
  const graph = await loadGraph(repo, curriculumId);
  const ids = [...graph.nodes.keys()];
  const diagnoses = new Map<string, RootGap[]>();
  const by = new Map<string, { students: string[]; unblocks: Set<string>; sum: number }>();
  for (const sid of studentIds) {
    const st = await skillStates(repo, sid, ids);
    const gaps = rootGaps(graph, st, true); // class groups: the strict rule
    diagnoses.set(sid, gaps);
    for (const gp of gaps.slice(0, 3)) {
      const e = by.get(gp.skillId) ?? { students: [], unblocks: new Set<string>(), sum: 0 };
      e.students.push(sid); e.sum += gp.mastery; for (const b of gp.blocks) e.unblocks.add(b.name);
      by.set(gp.skillId, e);
    }
  }
  const gaps = [...by.entries()].map(([id, e]) => ({ skillId: id, name: graph.nodes.get(id)!.name, students: e.students, unblocks: [...e.unblocks].slice(0, 6), avgMastery: Math.round(e.sum / e.students.length) }))
    .sort((a, b) => b.students.length - a.students.length || b.unblocks.length - a.unblocks.length);
  return { graph, gaps, diagnoses };
}
