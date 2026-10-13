/**
 * 📦 The question packs (data/questions/sets) and the ONE way to load them, a few skill sets / map places at a time.
 * Used by Admin → Questions → Load new questions (src/server/admin/load-questions.ts: a short request per chunk,
 * progress kept per school) and by the terminal script scripts/skills/top-up-skills.ts (the same chunks in a loop).
 *
 *   gap      Gap skills — creates the missing skills (Grades 4–6) and adds their questions
 *   topup    Top-up to 25 — only what each skill under 25 is missing (Below / On / Above in turn)
 *   span     All-grades bank (30 per skill) — added to skills the school already has
 *   map      Curriculum Map — the Review places (map seed) first, then Concept Vocabulary / Review questions per place
 *   grammar  Grammar extras (grammar-extra-sets.json, same format as the skill sets) — skills the school already has
 *
 * A pack whose file is missing is skipped. Every loader skips a question that is already there, so a chunk can be
 * run again (stop / resume, a second run) without adding anything twice.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "../seeding/repo";
import { addSkillSets, loadSkillSetsFile, type SkillSet } from "./skill-sets";
import { addMapSets, loadMapSetsFile, type MapSetNode } from "./map-sets";
import { topUpSkills, thinSkills } from "./min-per-skill";
import { normalizeSkillName, schoolSkillIndex } from "./skill-questions";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { readCacheFor } from "../db/read-cache-repo";

const s = (v: unknown) => String(v ?? "");

export type PackKey = "gap" | "topup" | "span" | "map" | "grammar";
export interface PackDef {
  key: PackKey; title: string; hint: string; file: string; kind: "skills" | "topup" | "map";
  /** add only to skills the school already has (never create one) */
  onlyExisting?: boolean;
  /** at most so many skill sets / map places in one chunk */
  perChunk: number;
}

export const PACKS: readonly PackDef[] = [
  { key: "gap", title: "Gap skills", hint: "Adds the missing skills (Grades 4–6) with their questions.", file: "gap-skill-sets.json", kind: "skills", perChunk: 3 },
  { key: "topup", title: "Top-up to 25", hint: "Every skill with fewer than 25 questions gets only what it is missing.", file: "topup-skill-sets.json", kind: "topup", perChunk: 5 },
  { key: "span", title: "All-grades bank (30 per skill)", hint: "MAP-style questions for the skills the school already has.", file: "span-skill-sets.json", kind: "skills", onlyExisting: true, perChunk: 3 },
  { key: "map", title: "Curriculum Map: Review places + Concept Vocabulary / Review questions", hint: "Adds the Review places, then the questions of each selection (Grades 4–6).", file: "map-vocab-review-sets.json", kind: "map", perChunk: 3 },
  { key: "grammar", title: "Grammar extras", hint: "More grammar questions for the skills the school already has.", file: "grammar-extra-sets.json", kind: "skills", onlyExisting: true, perChunk: 3 },
];
export const packOf = (key: string): PackDef | undefined => PACKS.find((p) => p.key === key);

// ------------------------------------------------------------------ files

let packDir: string | null = null;
/** Where the pack files are (default data/questions/sets). Tests point it at small files. */
export function usePackDir(dir: string | null): void { packDir = dir; fileCache.clear(); }
const dirOf = () => packDir ?? join(process.cwd(), "data", "questions", "sets");

/** The file's signature (size + time): a changed file starts its pack again from the beginning. */
export function packSignature(def: PackDef): string | null {
  const f = join(dirOf(), def.file);
  if (!existsSync(f)) return null;
  const st = statSync(f);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
}

type Loaded = { sets: SkillSet[]; nodes?: undefined } | { nodes: MapSetNode[]; sets?: undefined };
const fileCache = new Map<string, { sig: string; p: Promise<Loaded> }>();
/** The pack's content (read once per file version, kept for the next chunks), or null when the file is missing. */
export async function loadPack(def: PackDef): Promise<Loaded | null> {
  const sig = packSignature(def);
  if (!sig) return null;
  const hit = fileCache.get(def.key);
  if (hit && hit.sig === sig) return hit.p;
  const rel = join(dirOf(), def.file);
  const p: Promise<Loaded> = def.kind === "map" ? loadMapSetsFile(rel).then((nodes) => ({ nodes })) : loadSkillSetsFile(rel).then((sets) => ({ sets }));
  remember(fileCache, def.key, { sig, p }, 6);
  p.catch(() => fileCache.delete(def.key));
  return p;
}

/** The chunk units of a pack: its skill sets, or (map) the map seed + one unit per map place. */
export function unitsOf(def: PackDef, loaded: Loaded): number {
  return loaded.nodes ? loaded.nodes.length + 1 : loaded.sets!.length;
}
export function questionsOf(loaded: Loaded): number {
  return (loaded.nodes ?? loaded.sets ?? []).reduce((n, x) => n + x.questions.length, 0);
}

// ------------------------------------------------------------------ one chunk

export interface ChunkWork { from: number; next: number; total: number; added: number; skipped: number; created: number; errors: string[]; notes: string[] }

/**
 * Loads units [from, …) of one pack for one school: at most `perChunk` units and stops early when `budgetMs` is spent
 * (a web request stays short). Returns where to go on from (`next`); `next === total` = the pack is done.
 */
export async function runPackChunk(repoIn: Repo, schoolId: string, def: PackDef, from: number, opts: { budgetMs?: number; maxUnits?: number; now?: Date } = {}): Promise<ChunkWork> {
  // ⚡ the reference rows every question of the chunk reads again (grades, skills, standards, areas, types …) are read
  // once per chunk; writes drop what they change (db/read-cache-repo.ts)
  const repo = readCacheFor(repoIn);
  repo.clear();
  try { return await runChunk(repo, schoolId, def, from, opts); } finally { repo.clear(); }
}

async function runChunk(repo: Repo, schoolId: string, def: PackDef, from: number, opts: { budgetMs?: number; maxUnits?: number; now?: Date }): Promise<ChunkWork> {
  const loaded = await loadPack(def);
  if (!loaded) return { from, next: 0, total: 0, added: 0, skipped: 0, created: 0, errors: [], notes: ["The file of this pack is not on the server yet."] };
  const total = unitsOf(def, loaded);
  const max = Math.max(1, opts.maxUnits ?? def.perChunk), budget = opts.budgetMs ?? 8_000, t0 = Date.now();
  const out: ChunkWork = { from, next: Math.max(0, Math.min(from, total)), total, added: 0, skipped: 0, created: 0, errors: [], notes: [] };
  let done = 0;
  if (def.kind === "map" && out.next < total && !(await repo.findMany("Grade", { schoolId, level: { in: [4, 5, 6] } }, { select: ["id"], take: 1 })).length) {
    out.notes.push("This school has no Grade 4–6: the Curriculum Map pack is not for it.");
    out.next = total;
  }
  while (out.next < total && done < max && (done === 0 || Date.now() - t0 < budget)) {
    if (def.kind === "map") {
      if (out.next === 0) {
        // the Review places (and any other missing map place) first
        const [{ parseCurriculumMap }, { seedCurriculumMap }, { clearMapCache }, { readFileSync }] = await Promise.all([import("../curriculum-map/source"), import("../curriculum-map/seed"), import("../curriculum-map/questions"), import("node:fs")]);
        const map = parseCurriculumMap(readFileSync(join(process.cwd(), "data", "curriculum-map", "source.txt"), "utf8"));
        const r = await seedCurriculumMap(repo, map, { schoolId }, opts.now);
        clearMapCache();
        out.notes.push(`Curriculum Map places: ${r.grades.reduce((n, g) => n + g.created, 0)} added.`);
      } else {
        const node = loaded.nodes![out.next - 1];
        for (const r of await addMapSets(repo, schoolId, [node], undefined, opts.now)) {
          out.added += r.added; out.skipped += r.skipped;
          out.errors.push(...r.errors.slice(0, 3).map((e) => `${r.code}: ${e}`));
        }
      }
    } else {
      const set = loaded.sets![out.next];
      if (def.kind === "topup") {
        const r = await topUpSkills(repo, schoolId, [set], undefined, { countAfter: false });
        out.added += r.added; out.errors.push(...r.errors);
      } else {
        for (const r of await addSkillSets(repo, schoolId, [set], undefined, opts.now ?? new Date(), { onlyExisting: def.onlyExisting })) {
          out.added += r.added; out.skipped += r.skipped; out.created += r.skillsCreated;
          // a skill this school does not have is not an error of the load (the pack is for every school)
          out.errors.push(...r.errors.filter((e) => !/not on this school's platform/.test(e)).slice(0, 3).map((e) => `${r.skill}: ${e}`));
        }
      }
    }
    out.next++; done++;
  }
  return out;
}

// ------------------------------------------------------------------ how much is in already

export interface PackCount { questions: number; inBank: number; left: number; units: number; applies: boolean }

const qkey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const countCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<PackCount> }>>();

/**
 * How many of the pack's questions are already in the school's bank and how many are left (an estimate by question
 * text, light: the texts are looked up 300 at a time, only the id / text / skill columns). For the top-up pack,
 * "left" is what the skills under 25 still miss. Cached per bank version (and at most 2 minutes).
 */
export function countPack(repo: Repo, schoolId: string, def: PackDef): Promise<PackCount | null> {
  const sig = packSignature(def);
  if (!sig) return Promise.resolve(null);
  let m = countCache.get(repo); if (!m) countCache.set(repo, (m = new Map()));
  const v = `${sig}|${modelVersion("Question", "Skill", "CurriculumMapNode")}`, k = `${schoolId}:${def.key}`, hit = m.get(k);
  if (hit && hit.v === v && Date.now() - hit.at < 120_000) return hit.p;
  const p = countPackNow(repo, schoolId, def);
  remember(m, k, { v, at: Date.now(), p }, 24);
  p.catch(() => m!.delete(k));
  return p;
}

/** a stored text equals a pack text as the database compares them (case and trailing spaces ignored) */
const stemKey = (t: string) => t.toLowerCase().trimEnd();
const stemCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<Map<string, string>> }>>();
/** The school's (not deleted) question texts: compare key → the stored text. Cached per bank version, ≤ 2 minutes. */
function schoolStems(repo: Repo, schoolId: string, skillIds: string[]): Promise<Map<string, string>> {
  let m = stemCache.get(repo); if (!m) stemCache.set(repo, (m = new Map()));
  const v = modelVersion("Question", "Skill", "Curriculum", "Grade"), hit = m.get(schoolId);
  if (hit && hit.v === v && Date.now() - hit.at < 120_000) return hit.p;
  const p = (async () => {
    const out = new Map<string, string>();
    for (let i = 0; i < skillIds.length; i += 400) {
      for (const r of await repo.findMany("Question", { skillId: { in: skillIds.slice(i, i + 400) }, deletedAt: null }, { select: ["stem"] })) { const st = s(r.stem); out.set(stemKey(st), st); }
    }
    return out;
  })();
  remember(m, schoolId, { v, at: Date.now(), p }, 4);
  p.catch(() => m!.delete(schoolId));
  return p;
}

async function countPackNow(repo: Repo, schoolId: string, def: PackDef): Promise<PackCount> {
  const loaded = (await loadPack(def))!;
  const idx = await schoolSkillIndex(repo, schoolId);
  const g46 = new Set([...idx.skillOf.values()].filter((k) => [4, 5, 6].includes(k.grade)).map((k) => normalizeSkillName(k.name)));
  const hasGrades = [...idx.skillOf.values()].some((k) => [4, 5, 6].includes(k.grade)) || (await repo.findMany("Grade", { schoolId, level: { in: [4, 5, 6] } }, { select: ["id"], take: 1 })).length > 0;
  // the questions this school can take (onlyExisting: skills it has; map / gap: a school with Grades 4–6)
  const groups = (loaded.nodes ?? loaded.sets ?? []) as { skill?: string; questions: SkillSet["questions"] }[];
  const usable = groups.filter((g) => def.onlyExisting ? g46.has(normalizeSkillName(s(g.skill))) : def.kind === "topup" ? true : hasGrades);
  const questions = usable.flatMap((g) => g.questions);
  // ⚡ the school's question texts are read ONCE (by skill, indexed) for every pack of the page, instead of looking the
  // pack's texts up 300 at a time (an unindexed text column: each lookup scanned the whole question table)
  const have = await schoolStems(repo, schoolId, [...idx.ids]);
  const found = new Set<string>();
  for (const q of questions) { const raw = stemKey(s(q.stem)); if (have.has(raw)) found.add(qkey(have.get(raw)!)); }
  const inBank = questions.filter((q) => found.has(qkey(s(q.stem)))).length;
  let left = questions.length - inBank;
  if (def.kind === "topup") {
    // only what the skills under 25 still miss (at most what the file has for them)
    const thin = await thinSkills(repo, schoolId);
    const missingOf = new Map<string, number>();
    for (const t of thin) for (const id of idx.members.get(idx.keyOf.get(t.id) ?? "") ?? [t.id]) { const n = normalizeSkillName(idx.skillOf.get(id)?.name ?? t.name); if (!missingOf.has(n)) missingOf.set(n, t.missing); }
    left = 0;
    for (const set of loaded.sets ?? []) {
      const n = normalizeSkillName(set.skill), miss = missingOf.get(n);
      if (!miss) continue;
      missingOf.delete(n);
      left += Math.min(miss, set.questions.filter((q) => !found.has(qkey(s(q.stem)))).length);
    }
  }
  return { questions: questions.length, inBank, left: Math.max(0, left), units: unitsOf(def, loaded), applies: usable.length > 0 };
}
