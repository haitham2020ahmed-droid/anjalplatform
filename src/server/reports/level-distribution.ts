/**
 * ⚖️ School-wide Below / On / Above distribution (Update 39C, readiness I-23 — was a one-line count from a different
 * source on two pages). ONE source: the confirmed overall level the daily job writes (StudentLevelState, Update 39B
 * hysteresis), the same level the Level Story and the tier rules use.
 *
 *   now            the confirmed level today; a student the daily job has not evaluated yet is “Not evaluated”
 *   a month ago    the level the student held 30 days ago, from the level history (AuditLog level.change, category
 *                  OVERALL): the newest change on or before that day; with no change since, the current level when it
 *                  was already set then; otherwise “Not evaluated”
 *   strands        the Curriculum-Map strands' own levels (StudentCategoryLevel: Concept Vocabulary, Analyze Craft and
 *                  Structure, Respond to Reading) with the same “a month ago” rule (their history rows carry the
 *                  strand code)
 *   tiers          StudentTier (Tier 1 includes “Not yet screened”)
 * Students = current members of the school's classes (each counted once, in their first class).
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { DAY, findIn, pct, reportSchool, s, time } from "./report-access";

export type Lv = "BELOW" | "ON" | "ABOVE";
export interface Dist { below: number; on: number; above: number; none: number; total: number }
export interface DistRow { now: Dist; before: Dist; change: { below: number; on: number; above: number }; pctNow: { below: number | null; on: number | null; above: number | null } }
export interface TierDist { tier1: number; tier2: number; tier3: number }
export interface SchoolLevels {
  asOf: string; monthAgo: string;
  overall: DistRow & { tiers: TierDist };
  grades: (DistRow & { grade: number; tiers: TierDist })[];
  classes: (DistRow & { classId: string; name: string; grade: number; tiers: TierDist })[];
  strands: (DistRow & { code: string; name: string; grade: number | null })[];
}
export const STRANDS: Record<string, string> = { CV: "Concept Vocabulary", ACS: "Analyze Craft and Structure", RTR: "Respond to Reading" };

const empty = (): Dist => ({ below: 0, on: 0, above: 0, none: 0, total: 0 });
function add(d: Dist, l: Lv | null) { d.total++; if (l === "BELOW") d.below++; else if (l === "ON") d.on++; else if (l === "ABOVE") d.above++; else d.none++; }
export function distRow(now: (Lv | null)[], before: (Lv | null)[]): DistRow {
  const a = empty(), b = empty();
  for (const l of now) add(a, l);
  for (const l of before) add(b, l);
  return { now: a, before: b, change: { below: a.below - b.below, on: a.on - b.on, above: a.above - b.above }, pctNow: { below: pct(a.below, a.total), on: pct(a.on, a.total), above: pct(a.above, a.total) } };
}
const tierDist = (ts: number[]): TierDist => ({ tier1: ts.filter((t) => t === 1).length, tier2: ts.filter((t) => t === 2).length, tier3: ts.filter((t) => t === 3).length });
const asLv = (v: unknown): Lv | null => (v === "BELOW" || v === "ON" || v === "ABOVE" ? v : null);
const json = (v: unknown): Record<string, unknown> => { if (!v) return {}; if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } } return v as Record<string, unknown>; };

/** Pure: the level held at `at` from the change history (oldest first) and the current row. */
export function levelAt(history: { at: number; level: Lv | null; from?: Lv | null }[], current: { level: Lv | null; since: number } | null, at: number): Lv | null {
  const before = history.filter((h) => h.at <= at);
  if (before.length) return before[before.length - 1].level;
  const later = history.find((h) => h.at > at);
  if (later) return later.from ?? null; // the first later change says what it changed from
  return current && current.since <= at ? current.level : null;
}

export async function schoolLevels(repo: Repo, actor: Actor, now = new Date()): Promise<SchoolLevels> {
  const schoolId = reportSchool(actor);
  const monthAgo = now.getTime() - 30 * DAY;
  const [classes, grades] = await Promise.all([repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "gradeId"] }), repo.findMany("Grade", { schoolId }, { select: ["id", "level"] })]);
  const gradeOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const members = classes.length ? await findIn(repo, "ClassMembership", "classId", classes.map((c) => s(c.id)), { leftAt: null }, ["classId", "studentId"]) : [];
  const classOf = new Map<string, string>();
  for (const m of members.sort((a, b) => s(a.classId).localeCompare(s(b.classId)))) if (!classOf.has(s(m.studentId))) classOf.set(s(m.studentId), s(m.classId));
  const ids = [...classOf.keys()];
  const [states, cats, tiers, logs] = ids.length ? await Promise.all([
    findIn(repo, "StudentLevelState", "studentId", ids, {}, ["studentId", "level", "since"]),
    findIn(repo, "StudentCategoryLevel", "studentId", ids, {}, ["studentId", "category", "level", "updatedAt"]),
    findIn(repo, "StudentTier", "studentId", ids, {}, ["studentId", "tier"]),
    findIn(repo, "AuditLog", "entityId", ids, { entityType: "Student", action: "level.change" }, ["entityId", "before", "after", "createdAt"]),
  ]) : [[], [], [], []] as Row[][];
  const hist = new Map<string, { at: number; level: Lv | null; from: Lv | null }[]>(); // key: studentId|OVERALL or studentId|CV …
  for (const l of logs.sort((a, b) => time(a.createdAt) - time(b.createdAt))) {
    const a = json(l.after); const cat = s(a.category || "");
    if (!cat) continue; // working-level changes (no category) are not the overall level
    const k = `${s(l.entityId)}|${cat}`; hist.set(k, [...(hist.get(k) ?? []), { at: time(l.createdAt), level: asLv(a.level), from: asLv(json(l.before).level) }]);
  }
  const stateOf = new Map(states.map((r) => [s(r.studentId), r]));
  const nowLv = (id: string) => asLv(stateOf.get(id)?.level);
  const beforeLv = (id: string) => { const st = stateOf.get(id); return levelAt(hist.get(`${id}|OVERALL`) ?? [], st ? { level: asLv(st.level), since: time(st.since) } : null, monthAgo); };
  const tierOf = new Map(tiers.map((t) => [s(t.studentId), Number(t.tier) === 3 ? 3 : Number(t.tier) === 2 ? 2 : 1]));
  const row = (list: string[]) => ({ ...distRow(list.map(nowLv), list.map(beforeLv)), tiers: tierDist(list.map((id) => tierOf.get(id) ?? 1)) });
  const gradeOfStudent = (id: string) => gradeOf.get(s(classes.find((c) => c.id === classOf.get(id))?.gradeId)) ?? 0;
  const gradeLevels = [...new Set(ids.map(gradeOfStudent))].filter(Boolean).sort((a, b) => a - b);
  const strands: SchoolLevels["strands"] = [];
  for (const code of Object.keys(STRANDS)) {
    const rows = cats.filter((c) => s(c.category) === code);
    if (!rows.length) continue;
    const curOf = new Map(rows.map((r) => [s(r.studentId), r]));
    const nowC = (id: string) => asLv(curOf.get(id)?.level);
    const befC = (id: string) => { const r = curOf.get(id); return levelAt(hist.get(`${id}|${code}`) ?? [], r ? { level: asLv(r.level), since: time(r.updatedAt) } : null, monthAgo); };
    strands.push({ code, name: STRANDS[code], grade: null, ...distRow(ids.map(nowC), ids.map(befC)) });
    for (const g of gradeLevels) { const l = ids.filter((id) => gradeOfStudent(id) === g); strands.push({ code, name: STRANDS[code], grade: g, ...distRow(l.map(nowC), l.map(befC)) }); }
  }
  return {
    asOf: now.toISOString().slice(0, 10), monthAgo: new Date(monthAgo).toISOString().slice(0, 10),
    overall: row(ids),
    grades: gradeLevels.map((g) => ({ grade: g, ...row(ids.filter((id) => gradeOfStudent(id) === g)) })),
    classes: classes.map((c) => ({ classId: s(c.id), name: s(c.name), grade: gradeOf.get(s(c.gradeId)) ?? 0, ...row(ids.filter((id) => classOf.get(id) === c.id)) })).filter((c) => c.now.total > 0).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)),
    strands,
  };
}
