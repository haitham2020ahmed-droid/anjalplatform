/**
 * 📘 MAP Growth Learning Continuum on the platform: the school imports its continuum file once (one row per
 * instructional statement: subject, RIT band, goal area, sub-topic, statement, CCSS codes). Then, for any RIT:
 *   Reinforce = the band below · Develop = the student's band · Introduce = the band above,
 * and every statement is linked to the platform's own skills (with questions) through its CCSS codes:
 *   1. the same code (any grade the school teaches), 2. the parent code (L.4.1.b → L.4.1),
 *   3. the same anchor standard in the student's grade (RL.2.9 → RL.4.9) — for statements of earlier grades.
 * The continuum text stays in the school's database (it is imported, never shipped with the platform).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { groupPools, GROUPS, type GroupKey, type Subject } from "./map-plan";

const s = (v: unknown) => String(v ?? "");
export const CONTINUUM_HEADERS = ["Subject", "RIT Low", "RIT High", "Goal Area", "Sub-topic", "Statement", "Standards"] as const;
const CODE = /^(RL|RI|RF|L|W|SL)\.(K|\d{1,2})\.\d{1,2}(\.[a-z])?$/;

/** The platform's goal-area group of a continuum goal area. */
export function groupOfGoal(goalArea: string): GroupKey | null {
  const g = goalArea.toLowerCase();
  if (/literary/.test(g)) return "LIT";
  if (/informational/.test(g)) return "INFO";
  if (/vocab/.test(g)) return "VOCAB";
  if (/grammar|usage/.test(g) && !/mechanic/.test(g)) return "GRAMMAR";
  if (/mechanic/.test(g)) return "MECH";
  if (/writ/.test(g)) return "WRITING";
  return null;
}

/** Admin: replaces the continuum of the subjects in the file. Rows with problems are reported, nothing saved then. */
export async function importContinuum(repo: Repo, actor: Actor, table: string[][], now = new Date()): Promise<{ saved: number; bySubject: Record<string, number>; errors: { row: number; message: string }[] }> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only an admin can import the Learning Continuum.");
  assertCan(actor, "settings:school");
  const at = table.findIndex((r) => r.some((c) => s(c).trim()));
  if (at < 0) throw new ValidationError("The file is empty.");
  const head = table[at].map((h) => s(h).trim().toLowerCase().replace(/[\s_-]+/g, " "));
  const ix = (h: string) => head.indexOf(h.toLowerCase().replace(/[\s_-]+/g, " "));
  const col = Object.fromEntries(CONTINUUM_HEADERS.map((h) => [h, ix(h)])) as Record<(typeof CONTINUUM_HEADERS)[number], number>;
  const missing = CONTINUUM_HEADERS.filter((h) => col[h] < 0);
  if (missing.length) throw new ValidationError(`Missing column(s): ${missing.join(", ")}. Download the template.`);
  const rows: Row[] = [], errors: { row: number; message: string }[] = [];
  table.slice(at + 1).forEach((r, i) => {
    const line = at + i + 2, get = (h: (typeof CONTINUUM_HEADERS)[number]) => s(r[col[h]]).replace(/\s+/g, " ").trim();
    if (!r.some((c) => s(c).trim())) return;
    const subjRaw = get("Subject").toUpperCase();
    const subject = /READ/.test(subjRaw) ? "READING" : /LANG/.test(subjRaw) ? "LANGUAGE" : "";
    const low = Number(get("RIT Low")), high = Number(get("RIT High"));
    const goal = get("Goal Area"), topic = get("Sub-topic"), statement = get("Statement");
    const codes = get("Standards").split(/[\s,;]+/).filter(Boolean);
    const bad = (m: string) => errors.push({ row: line, message: m });
    if (!subject) return bad("Subject must be Reading or Language Usage.");
    if (!(Number.isInteger(low) && Number.isInteger(high) && low >= 100 && high <= 350 && low < high)) return bad("RIT Low / RIT High must be whole numbers from 100 to 350 (e.g. 191 and 200).");
    if (!groupOfGoal(goal)) return bad(`Goal Area “${goal}” is not a MAP goal area.`);
    if (!statement || statement.length > 2000) return bad("Write the statement (up to 2000 characters).");
    const wrong = codes.filter((c) => !CODE.test(c));
    if (wrong.length) return bad(`Standard code(s) not recognised: ${wrong.join(", ")} (e.g. RL.4.2, L.5.1.b).`);
    rows.push({ subject, ritLow: low, ritHigh: high, goalArea: goal.slice(0, 120), topic: (topic || goal).slice(0, 120), statement, standards: codes.join(" ").slice(0, 500), sortOrder: rows.length, importedAt: now });
  });
  if (errors.length) return { saved: 0, bySubject: {}, errors };
  if (!rows.length) throw new ValidationError("No statements in the file.");
  const subjects = [...new Set(rows.map((r) => s(r.subject)))];
  await repo.transaction(async (tx) => {
    await tx.deleteMany("LearningStatement", { subject: { in: subjects } });
    for (let i = 0; i < rows.length; i += 500) await tx.createMany("LearningStatement", rows.slice(i, i + 500));
  });
  const bySubject: Record<string, number> = {};
  for (const r of rows) bySubject[s(r.subject)] = (bySubject[s(r.subject)] ?? 0) + 1;
  await audit(repo, { actorId: actor.userId, action: "map.continuum.import", entityType: "LearningStatement", entityId: null, after: bySubject, at: now });
  return { saved: rows.length, bySubject, errors: [] };
}

export interface ContinuumStats { subject: Subject; bands: { low: number; high: number; n: number }[]; total: number }
export async function continuumStats(repo: Repo): Promise<ContinuumStats[]> {
  const rows = await repo.findMany("LearningStatement", {}, { select: ["subject", "ritLow", "ritHigh"] });
  return (["READING", "LANGUAGE"] as const).map((subject) => {
    const mine = rows.filter((r) => r.subject === subject);
    const m = new Map<string, { low: number; high: number; n: number }>();
    for (const r of mine) { const k = `${r.ritLow}`; const b = m.get(k) ?? { low: Number(r.ritLow), high: Number(r.ritHigh), n: 0 }; b.n++; m.set(k, b); }
    return { subject, bands: [...m.values()].sort((a, b) => a.low - b.low), total: mine.length };
  });
}

// ------------------------------------------------------------------ statements for a RIT, linked to skills

export interface LinkedSkill { id: string; name: string }
export interface Statement { id: string; topic: string; text: string; standards: string[]; skills: LinkedSkill[] }
export interface Stage { low: number; high: number; label: string; statements: Statement[] }
export interface ContinuumView { reinforce: Stage | null; develop: Stage | null; introduce: Stage | null }

/** All the statements of a subject, and the links of a grade's skills (by short CCSS code). Load once per report. */
export interface ContinuumIndex { rows: Row[]; skillsByCode: Map<string, LinkedSkill[]>; grade: number; groupOfSkill: Map<string, GroupKey> }
export async function continuumIndex(repo: Repo, schoolId: string, grade: number, subject: Subject): Promise<ContinuumIndex> {
  const [rows, pk] = await Promise.all([
    repo.findMany("LearningStatement", { subject }),
    groupPools(repo, schoolId, grade),
  ]);
  rows.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  const skillIds = [...pk.skills.keys()];
  const links = skillIds.length ? await repo.findMany("SkillStandard", { skillId: { in: skillIds } }, { select: ["skillId", "standardId"] }) : [];
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(stds.map((x) => [s(x.id), s(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "")]));
  const skillsByCode = new Map<string, LinkedSkill[]>();
  for (const l of links) {
    const code = codeOf.get(s(l.standardId)), k = pk.skills.get(s(l.skillId));
    if (!code || !k) continue;
    const list = skillsByCode.get(code) ?? [];
    if (!list.some((x) => x.id === k.id)) list.push({ id: k.id, name: k.name });
    skillsByCode.set(code, list);
  }
  return { rows, skillsByCode, grade, groupOfSkill: new Map([...pk.skills.values()].map((k) => [k.id, k.group])) };
}

const STOP = new Set(["the", "and", "with", "from", "that", "this", "text", "texts", "word", "words", "uses", "use", "using", "determines", "identifies", "understands", "understand", "in", "of", "a", "an", "or", "to", "for", "its", "their", "literary", "informational", "context", "meaning", "correct", "grade", "band"]);
const stem = (w: string) => w.replace(/(ing|ings|ed|es|s)$/, "");
const tokens = (v: string) => new Set(v.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };

/** The platform skills of a statement: same code → parent code → same anchor in the student's grade; within a
 *  level the skills whose names share words with the statement come first. */
export function skillsFor(ix: ContinuumIndex, codes: string[], group: GroupKey | null, max = 3, text = ""): LinkedSkill[] {
  const fits = (k: LinkedSkill) => !group || ix.groupOfSkill.get(k.id) === group;
  const levels: string[][] = [
    codes,
    codes.map((c) => c.replace(/\.[a-z]$/, "")),
    ix.grade ? codes.flatMap((c) => { const m = c.match(/^([A-Z]+)\.(K|\d+)\.(\d+)(\.[a-z])?$/); return m ? [`${m[1]}.${ix.grade}.${m[3]}${m[4] ?? ""}`, `${m[1]}.${ix.grade}.${m[3]}`] : []; }) : [],
  ];
  const want = tokens(text);
  for (const level of levels) {
    const cands: LinkedSkill[] = [];
    for (const c of level) for (const k of ix.skillsByCode.get(c) ?? []) if (fits(k) && !cands.some((x) => x.id === k.id)) cands.push(k);
    if (!cands.length) continue;
    const scored = cands.map((k) => ({ k, n: overlap(want, tokens(k.name)) })).sort((a, b) => b.n - a.n || a.k.name.localeCompare(b.k.name));
    const best = scored[0].n;
    return scored.filter((x) => x.n === best || x.n > 0).slice(0, best > 0 ? max : 2).map((x) => x.k);
  }
  return [];
}

/** Reinforce (band below), Develop (the RIT's band) and Introduce (band above) for one goal-area group. */
const viewCache = new WeakMap<ContinuumIndex, Map<string, ContinuumView>>();
export function continuumFor(ix: ContinuumIndex, group: GroupKey, rit: number): ContinuumView {
  const mine = ix.rows.filter((r) => groupOfGoal(s(r.goalArea)) === group);
  const bands = [...new Map(mine.map((r) => [Number(r.ritLow), { low: Number(r.ritLow), high: Number(r.ritHigh) }])).values()].sort((a, b) => a.low - b.low);
  if (!bands.length) return { reinforce: null, develop: null, introduce: null };
  let i = bands.findIndex((b) => rit >= b.low && rit <= b.high);
  if (i < 0) i = rit < bands[0].low ? 0 : bands.length - 1;
  // the same band of the same area is asked for every student of a class: built once per report
  let cache = viewCache.get(ix);
  if (!cache) viewCache.set(ix, (cache = new Map()));
  const hit = cache.get(`${group}|${i}`);
  if (hit) return hit;
  const stage = (b: { low: number; high: number } | undefined): Stage | null => b ? {
    low: b.low, high: b.high, label: `${b.low}–${b.high}`,
    statements: mine.filter((r) => Number(r.ritLow) === b.low).map((r) => { const codes = s(r.standards).split(/\s+/).filter(Boolean); return { id: s(r.id), topic: s(r.topic), text: s(r.statement), standards: codes, skills: skillsFor(ix, codes, group, 3, `${s(r.topic)} ${s(r.statement)}`) }; }),
  } : null;
  // a statement often spans several bands: Reinforce keeps the ones the student's band no longer lists
  // (they should be secure by now) and Introduce the ones that are new in the band above
  const develop = stage(bands[i]);
  const inDevelop = new Set((develop?.statements ?? []).map((x) => x.text.toLowerCase()));
  const only = (st: Stage | null): Stage | null => (st ? { ...st, statements: st.statements.filter((x) => !inDevelop.has(x.text.toLowerCase())) } : null);
  const view = { reinforce: only(stage(bands[i - 1])), develop, introduce: only(stage(bands[i + 1])) };
  cache.set(`${group}|${i}`, view);
  return view;
}

export const hasContinuum = async (repo: Repo, subject?: Subject) => (await repo.count("LearningStatement", subject ? { subject } : {})) > 0;
export const groupsOf = (subject: Subject) => GROUPS.filter((g) => g.subject === subject);
