/**
 * 📝 The Diagnostic Test, three times a year — BOY · MOY · EOY (placement, diagnosis and growth): a fixed set of ~50 questions per
 * grade covering every strand (Literature, Informational, Vocabulary, Grammar & Conventions) and every standard the
 * bank has, mixed in difficulty. The admin builds it, reviews it (swap any question), opens it for a window; every
 * student of the grade takes the same test, without feedback. When a student finishes, the result is analysed by
 * standard and strand, and it sets their level (Above / On / Below) — the starting point of everything adaptive.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes } from "../curriculum-map/questions";
import { notifyTeachers, recordLevel } from "../curriculum-map/student-level";
import { isInvalidResult } from "../curriculum-map/level-evidence";
import { withLock } from "../lib/key-lock";
import { areaOfCategory, areaOfStandard, foundationalArea, STRAND_QUOTA, WORD_STUDY_FAMILIES, type Area, type Strand } from "./standards";
import { BLUEPRINT_SIZE, difficultyOf, effectiveBlueprint, estimate, focusBlueprint, gradeLabel, nextItem, replay, scoreOf, strandOfAnchor, type Design, type DesignItem } from "./adaptive";
import { ensureNationalNorms, nationalNorm } from "../map/rit";
import { DEFAULT_ADAPTIVE, LEVEL_TO_B } from "../../config/engine";

const STRAND_NAME: Record<string, string> = { LIT: "Literature", INFO: "Informational Text", VOCAB: "Vocabulary", LANG: "Grammar & Conventions", FOUND: "Foundational Skills" };
const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
export const DIAGNOSTIC_SIZE = 50;
export const DEFAULT_BANDS = { above: 85, on: 65 };
/** adaptive tests: the score is on the grade scale (On grade level = 60–84) */
export const ADAPTIVE_BANDS = { above: 85, on: 60 };
const MANUAL = new Set(["SHORT_ANSWER"]);

// ------------------------------------------------------------------ three times a year: BOY · MOY · EOY

export type Period = "BOY" | "MOY" | "EOY";
export const PERIODS: Period[] = ["BOY", "MOY", "EOY"];
export const PERIOD_LABEL: Record<Period, string> = { BOY: "Beginning of Year", MOY: "Middle of Year", EOY: "End of Year" };
/** The window of the date: Aug–Nov BOY · Dec–Feb MOY · Mar–Jul EOY. */
export function periodOf(now = new Date()): Period {
  const m = now.getUTCMonth();
  return m >= 7 && m <= 10 ? "BOY" : m === 11 || m <= 1 ? "MOY" : "EOY";
}
export const asPeriod = (v: unknown): Period => (PERIODS.includes(String(v ?? "").toUpperCase() as Period) ? (String(v).toUpperCase() as Period) : "BOY");
/** The first day of the period window the date is in (Aug 1 · Dec 1 · Mar 1, UTC). */
export function periodStart(now = new Date()): Date {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), p = periodOf(now);
  if (p === "BOY") return new Date(Date.UTC(y, 7, 1));
  if (p === "MOY") return new Date(Date.UTC(m === 11 ? y : y - 1, 11, 1));
  return new Date(Date.UTC(y, 2, 1));
}

/** "2026-2027" from August on, else "2025-2026". */
export const schoolYear = (now = new Date()) => { const y = now.getUTCFullYear(); return now.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const bandsOf = (t: Row | null) => { const b = (typeof t?.bands === "string" ? JSON.parse(s(t.bands)) : t?.bands) as { above?: number; on?: number } | null; return { above: Number(b?.above) || DEFAULT_BANDS.above, on: Number(b?.on) || DEFAULT_BANDS.on }; };
export const levelForPct = (pct: number, bands = DEFAULT_BANDS): "ABOVE" | "ON" | "BELOW" => (pct >= bands.above ? "ABOVE" : pct >= bands.on ? "ON" : "BELOW");
/** a stable pseudo-random order (no Math.random): the same pool gives the same test */
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

async function gradeRow(repo: Repo, schoolId: string, grade: number): Promise<Row> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) throw new ValidationError(`Grade ${grade} does not exist.`);
  return g;
}

export interface PoolQuestion { id: string; area: Area; level: number; passageId: string | null; placement: boolean }

/** Every published, auto-marked question of the grade (its curriculum skills and its Curriculum Map), with its reporting area. */
export async function diagnosticPool(repo: Repo, schoolId: string, grade: number): Promise<PoolQuestion[]> {
  const g = await gradeRow(repo, schoolId, grade);
  const curs = await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] });
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "category", "code", "familyId"] }) : [];
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.grade === grade);
  const links = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId", "nodeId"] }) : [];
  const nodeOf = new Map(links.map((l) => [s(l.questionId), nodes.find((n) => n.id === l.nodeId)]));
  const bySkill = skills.length ? await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "standardId", "typeId", "difficultyLevel", "passageId"] }) : [];
  const onMap = links.length ? await repo.findMany("Question", { id: { in: [...new Set(links.map((l) => s(l.questionId)))] }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "standardId", "typeId", "difficultyLevel", "passageId"] }) : [];
  const all = new Map<string, Row>(); for (const q of [...bySkill, ...onMap]) all.set(s(q.id), q);
  const qs = [...all.values()];
  if (!qs.length) return [];
  const types = await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] });
  const manual = new Set(types.filter((t) => MANUAL.has(s(t.code)) || t.isAutoScored === false || t.isAutoScored === 0).map((t) => s(t.id)));
  const skillIds = [...new Set(qs.map((q) => s(q.skillId)))];
  const [allSkills, stdLinks, uses] = await Promise.all([
    repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "category", "code", "familyId"] }),
    repo.findMany("SkillStandard", { skillId: { in: skillIds } }, { select: ["skillId", "standardId"] }),
    repo.findMany("QuestionUse", { questionId: { in: qs.map((q) => s(q.id)) }, use: "PLACEMENT" }, { select: ["questionId"] }),
  ]);
  const stdIds = [...new Set([...qs.map((q) => s(q.standardId)).filter(Boolean), ...stdLinks.map((l) => s(l.standardId))])];
  const stds = stdIds.length ? await repo.findMany("Standard", { id: { in: stdIds } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(stds.map((x) => [s(x.id), s(x.code)]));
  const placement = new Set(uses.map((u) => s(u.questionId)));
  // word-study skills (prefixes, suffixes, roots, spelling, homographs) report under Foundational Skills (RF.3)
  const famIds = [...new Set(allSkills.map((k) => s(k.familyId)).filter(Boolean))];
  const fams = famIds.length ? await repo.findMany("SkillFamily", { id: { in: famIds } }, { select: ["id", "code"] }) : [];
  const wordStudyFam = new Set(fams.filter((f) => WORD_STUDY_FAMILIES.has(s(f.code))).map((f) => s(f.id)));
  const out: PoolQuestion[] = [];
  for (const q of qs) {
    if (manual.has(s(q.typeId))) continue;
    const node = nodeOf.get(s(q.id));
    const sk = allSkills.find((k) => k.id === q.skillId);
    // the question's own standard, else its skill's (of this grade first), else the category / the map place
    const own = q.standardId ? areaOfStandard(codeOf.get(s(q.standardId)) ?? "") : null;
    const viaSkill = own ? null : stdLinks.filter((l) => l.skillId === q.skillId).map((l) => areaOfStandard(codeOf.get(s(l.standardId)) ?? "")).filter((a): a is Area => !!a).sort((a, b) => Number(b.code.split(".")[1] === String(grade)) - Number(a.code.split(".")[1] === String(grade)))[0];
    // a word-study skill's question is Foundational unless its own standard is a reading or grammar one
    const wordStudy = !!sk && wordStudyFam.has(s(sk.familyId)) && (!own || own.strand === "VOCAB" || own.strand === "FOUND" || own.anchor === "L.2");
    const area = wordStudy ? foundationalArea(grade) : own ?? viaSkill ?? (node ? areaOfCategory(node.category === "CONCEPT_VOCABULARY" ? "VOCABULARY" : "READING", grade, `${node.genre ?? ""} ${node.heading}`) : areaOfCategory(s(sk?.category), grade));
    if (area.strand === "WRITE") continue;
    out.push({ id: s(q.id), area, level: Number(q.difficultyLevel) || 4, passageId: q.passageId ? s(q.passageId) : null, placement: placement.has(s(q.id)) });
  }
  return out;
}

/**
 * Picks the test: each strand gets its share, spread over its standards in turn, each standard over a mix of
 * difficulty (On level most, then easier and harder). Questions marked “Placement” are preferred. Questions of the
 * same passage stay together; the order is Literature → Informational → Vocabulary → Grammar & Conventions.
 */
export function pickDiagnostic(pool: PoolQuestion[], size = DIAGNOSTIC_SIZE, seed = "diagnostic"): string[] {
  const strands: Strand[] = ["LIT", "INFO", "VOCAB", "LANG", "FOUND"];
  const total = Object.values(STRAND_QUOTA).reduce((a, b) => a + b, 0);
  const quota = new Map<Strand, number>(strands.map((st) => [st, Math.round((STRAND_QUOTA[st] / total) * size)]));
  const avail = (st: Strand) => pool.filter((q) => q.area.strand === st).length;
  // a strand without enough questions gives its places to the others
  let spare = 0;
  for (const st of strands) { const q = quota.get(st)!; if (avail(st) < q) { spare += q - avail(st); quota.set(st, avail(st)); } }
  while (spare > 0) { const more = strands.filter((st) => avail(st) > quota.get(st)!); if (!more.length) break; for (const st of more) { if (!spare) break; quota.set(st, quota.get(st)! + 1); spare--; } }
  const LEVEL_ORDER = [4, 3, 5, 4, 2, 6, 4, 3, 5, 1, 7];
  const chosen: PoolQuestion[] = [];
  for (const st of strands) {
    const want = quota.get(st)!;
    const inStrand = pool.filter((q) => q.area.strand === st);
    const byStd = new Map<string, PoolQuestion[]>();
    for (const q of inStrand.sort((a, b) => Number(b.placement) - Number(a.placement) || hash(seed + a.id) - hash(seed + b.id))) byStd.set(q.area.code, [...(byStd.get(q.area.code) ?? []), q]);
    const codes = [...byStd.keys()].sort();
    const used = new Map<string, number>();
    let picked = 0, guard = 0;
    while (picked < want && guard++ < want * 20) {
      for (const code of codes) {
        if (picked >= want) break;
        const list = byStd.get(code)!; if (!list.length) continue;
        const k = used.get(code) ?? 0; used.set(code, k + 1);
        const target = LEVEL_ORDER[k % LEVEL_ORDER.length];
        const best = list.reduce((b, q) => (Math.abs(q.level - target) < Math.abs(b.level - target) || (Math.abs(q.level - target) === Math.abs(b.level - target) && Number(q.placement) > Number(b.placement)) ? q : b), list[0]);
        list.splice(list.indexOf(best), 1); chosen.push(best); picked++;
      }
      if (codes.every((c) => !byStd.get(c)!.length)) break;
    }
  }
  // passages together, strands in order, easier first inside a strand
  const order = new Map(strands.map((st, i) => [st, i]));
  const passageRank = new Map<string, number>();
  for (const q of chosen) if (q.passageId) passageRank.set(q.passageId, Math.min(passageRank.get(q.passageId) ?? 99, q.level));
  return chosen.sort((a, b) => order.get(a.area.strand)! - order.get(b.area.strand)!
    || (a.passageId ? passageRank.get(a.passageId)! : a.level) - (b.passageId ? passageRank.get(b.passageId)! : b.level)
    || s(a.passageId).localeCompare(s(b.passageId)) || a.level - b.level || a.id.localeCompare(b.id)).map((q) => q.id);
}

function assertAdmin(actor: Actor) {
  assertCan(actor, "assignments:create");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the school admin builds and opens the Diagnostic Test.");
}

/** frozen designs of open tests, by assessment (a draft is read fresh) */
const designCache = new Map<string, { t: Row; design: Design }>();
async function adaptiveTestOf(repo: Repo, assessmentId: string): Promise<{ t: Row; design: Design } | null> {
  const hit = designCache.get(assessmentId);
  if (hit) return hit;
  const t = (await repo.findMany("DiagnosticTest", { assessmentId }))[0] ?? null;
  const design = isAdaptive(t) ? designOf(t) : null;
  if (!t || !design) return null;
  const v = { t, design };
  if (s(t.status) !== "DRAFT") { if (designCache.size > 50) designCache.clear(); designCache.set(assessmentId, v); }
  return v;
}

async function answersOf(repo: Repo, sessionId: string): Promise<{ id: string; correct: boolean; rapid: boolean; ms: number; at: number }[]> {
  const rows = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["id", "questionId", "isCorrect", "rapidGuess", "responseMs", "createdAt"] });
  const seen = new Set<string>(); const out: { id: string; correct: boolean; rapid: boolean; ms: number; at: number }[] = [];
  for (const r of rows.sort((a, b) => (d(a.createdAt)?.getTime() ?? 0) - (d(b.createdAt)?.getTime() ?? 0) || s(a.id).localeCompare(s(b.id)))) {
    if (seen.has(s(r.questionId))) continue; seen.add(s(r.questionId));
    out.push({ id: s(r.questionId), correct: Boolean(r.isCorrect), rapid: Boolean(r.rapidGuess), ms: Number(r.responseMs ?? 0), at: d(r.createdAt)?.getTime() ?? 0 });
  }
  return out;
}

/**
 * Where the student starts (grade units), kept on the session: their latest MAP Reading RIT, else the platform's
 * level (Below −0.6 / On / Above +0.6 of their grade), else their grade.
 */
async function startOf(repo: Repo, t: Row, sessionId: string, studentId: string): Promise<number> {
  const ses = await repo.findUnique("PracticeSession", { id: sessionId });
  if (ses && ses.lastTargetB !== null && ses.lastTargetB !== undefined && Number.isFinite(Number(ses.lastTargetB))) return Number(ses.lastTargetB);
  const grade = Number(t.grade);
  let start = grade;
  const maps = (await repo.findMany("MapResult", { studentId }, { select: ["subject", "goalName", "rit", "testDate"] })).filter((m) => !m.goalName && /read/i.test(s(m.subject))).sort((a, b) => (d(b.testDate)?.getTime() ?? 0) - (d(a.testDate)?.getTime() ?? 0));
  const fromMap = maps[0] ? (await ritScale(repo)).toGrade(Number(maps[0].rit)) : null;
  if (fromMap !== null) start = fromMap;
  else {
    const { evidenceLevels } = await import("../curriculum-map/evidence-level");
    const lv = (await evidenceLevels(repo, s(t.schoolId), [studentId], grade, {})).get(studentId);
    if (lv && lv.from !== "NO_DATA") start = grade + (lv.level === "BELOW" ? -0.6 : lv.level === "ABOVE" ? 0.6 : 0);
  }
  start = Math.round(Math.max(grade - 1.5, Math.min(grade + 1.5, start)) * 100) / 100;
  if (ses) await repo.updateMany("PracticeSession", { id: sessionId }, { lastTargetB: start });
  return start;
}

/** The adaptive Diagnostic's next question for this session (nextId null when finished); null when the set is not adaptive. */
export async function diagnosticNext(repo: Repo, assessmentId: string, sessionId: string, studentId: string): Promise<{ nextId: string | null; total: number } | null> {
  const x = await adaptiveTestOf(repo, assessmentId);
  if (!x) return null;
  const answers = await answersOf(repo, sessionId);
  const start = await startOf(repo, x.t, sessionId, studentId);
  const design = await studentDesign(repo, x.t, x.design, studentId);
  return { nextId: nextItem(design, answers, start, studentId), total: design.blueprint.length };
}

/** The questions of an adaptive test a student will answer (their blueprint's length), or null for a fixed test. */
export async function adaptiveLength(repo: Repo, assessmentId: string, studentId?: string): Promise<number | null> {
  const x = await adaptiveTestOf(repo, assessmentId);
  if (!x) return null;
  return (studentId ? await studentDesign(repo, x.t, x.design, studentId) : x.design).blueprint.length;
}

/**
 * The student's earlier Diagnostic result this year (same grade): BOY first, else the latest earlier period. Used by
 * the focus form (and the growth reports).
 */
export async function priorScore(repo: Repo, t: Row, studentId: string): Promise<{ score: Row; test: Row } | null> {
  const mine = asPeriod(t.period);
  const earlier = (await repo.findMany("DiagnosticTest", { schoolId: t.schoolId, grade: t.grade, year: t.year }))
    .filter((x) => PERIODS.indexOf(asPeriod(x.period)) < PERIODS.indexOf(mine))
    .sort((a, b) => PERIODS.indexOf(asPeriod(a.period)) - PERIODS.indexOf(asPeriod(b.period)));
  for (const x of earlier) {
    const r = (await repo.findMany("DiagnosticScore", { diagnosticId: x.id, studentId }))[0];
    if (r) return { score: r, test: x };
  }
  return null;
}

const focusCache = new Map<string, Design>();
/**
 * The design one student answers: the test's own blueprint, or — for a MOY / EOY focus form — their focus blueprint
 * (only the strands / standards still Below or borderline in their earlier result, weighted toward the weakest).
 * A student without an earlier result takes the full form.
 */
export async function studentDesign(repo: Repo, t: Row, design: Design, studentId: string): Promise<Design> {
  if (design.form !== "focus" || asPeriod(t.period) === "BOY") return design;
  const key = `${s(t.id)}:${studentId}`;
  const hit = focusCache.get(key);
  if (hit) return hit;
  const prior = await priorScore(repo, t, studentId);
  if (!prior) return design;
  const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
  const cell = (x: { correct: number; total: number; score?: number }) => (typeof x.score === "number" ? x.score : x.total ? (100 * x.correct) / x.total : 0);
  const raw = (x: { correct: number; total: number; score?: number }) => (typeof x.score === "number" && x.total ? (100 * x.correct) / x.total : undefined);
  const strands = (json<{ strand: Strand; correct: number; total: number; score?: number; carried?: boolean }[]>(prior.score.byStrand) ?? []).map((x) => ({ strand: x.strand, score: cell(x), raw: raw(x) }));
  const anchors = (json<{ anchor: string; correct: number; total: number; score?: number }[]>(prior.score.byStandard) ?? []).filter((x) => x.anchor).map((x) => ({ anchor: x.anchor, score: cell(x), raw: raw(x) }));
  const f = focusBlueprint(design.blueprint, design.items, { strands, anchors, on: bandsOf(prior.test).on });
  const out: Design = { ...design, blueprint: f.blueprint };
  if (s(t.status) !== "DRAFT") { if (focusCache.size > 2000) focusCache.clear(); focusCache.set(key, out); }
  return out;
}

// ------------------------------------------------------------------ the adaptive test (one blueprint, every grade)

/** FALL national RIT means by grade → a RIT ↔ grade-units conversion (both ways). */
async function ritScale(repo: Repo): Promise<{ toGrade: (rit: number) => number | null; toRit: (theta: number) => number | null }> {
  await ensureNationalNorms(repo);
  const pts: [number, number][] = [];
  for (let g = 0; g <= 12; g++) { const n = await nationalNorm(repo, g, "FALL"); if (n) pts.push([g, n.mean]); }
  if (pts.length < 2) return { toGrade: () => null, toRit: () => null };
  const lerp = (x: number, a: [number, number][], from: 0 | 1) => {
    const to = from ? 0 : 1;
    const seg = a.findIndex((p, i) => i < a.length - 1 && x <= a[i + 1][from]);
    const i = seg < 0 ? a.length - 2 : seg;
    const [p, q] = [a[i], a[i + 1]];
    return p[to] + ((x - p[from]) * (q[to] - p[to])) / ((q[from] - p[from]) || 1);
  };
  return { toGrade: (rit) => Math.round(lerp(rit, pts, 1) * 100) / 100, toRit: (theta) => Math.round(lerp(theta, pts, 0)) };
}

const anchorLabel = (a: string) => areaOfStandard(a.replace(".", ".4."))?.label ?? a;
/** the anchor as the code of the student's grade: RL.2 → RL.4.2 */
export const codeFor = (anchor: string, grade: number) => anchor.replace(".", `.${grade}.`);
async function activeGrades(repo: Repo, schoolId: string): Promise<number[]> {
  return (await repo.findMany("Grade", { schoolId })).filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
}

/**
 * The adaptive pool of a grade: the questions of the school's grades from two below to two above (same skills,
 * every difficulty), each placed on the grade scale — its calibrated RIT when it has one, else its grade and level.
 */
export async function adaptivePool(repo: Repo, schoolId: string, grade: number): Promise<DesignItem[]> {
  const grades = (await activeGrades(repo, schoolId)).filter((g) => Math.abs(g - grade) <= 2);
  const seen = new Set<string>();
  const raw: { q: PoolQuestion; g: number }[] = [];
  for (const g of grades) for (const q of await diagnosticPool(repo, schoolId, g)) if (!seen.has(q.id) && (q.area.strand === "LIT" || q.area.strand === "INFO" || q.area.strand === "VOCAB" || q.area.strand === "LANG" || q.area.strand === "FOUND")) { seen.add(q.id); raw.push({ q, g }); }
  if (!raw.length) return [];
  const scale = await ritScale(repo);
  const tags = await repo.findMany("Question", { id: { in: raw.map((x) => x.q.id) } }, { select: ["id", "tags"] });
  const calOf = new Map(tags.map((r) => { let x: unknown = r.tags; if (typeof x === "string") { try { x = JSON.parse(x); } catch { x = null; } } const v = Number((x as { rit?: { value?: number } } | null)?.rit?.value); return [s(r.id), Number.isFinite(v) && v > 100 ? v : null] as const; }));
  return raw.map(({ q, g }) => {
    const cal = calOf.get(q.id); const byRit = cal ? scale.toGrade(cal) : null;
    return { id: q.id, a: q.area.anchor, st: q.area.strand, d: byRit ?? difficultyOf(g, q.level), p: q.passageId, g };
  }).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
}

export const designOf = (t: Row | null): Design | null => { const v = t?.design; if (!v) return null; const o = (typeof v === "string" ? JSON.parse(v) : v) as Design; return Array.isArray(o?.blueprint) && Array.isArray(o?.items) ? o : null; };
const isAdaptive = (t: Row | null) => Boolean(t?.adaptive) && !!designOf(t);

export interface ReadinessRow { grade: number; pool: number; ready: boolean; strong: boolean; short: string[]; anchors: { anchor: string; slots: number; easier: number; on: number; harder: number }[] }
/**
 * Is the Question Bank ready for the adaptive test? For every grade: the questions of each skill slot, easier / on /
 * harder than the grade. Ready = every slot can be filled; Strong = every skill has 3 questions per slot spread
 * over the three difficulties (a precise test for the weakest and the strongest students).
 */
export async function diagnosticReadiness(repo: Repo, actor: Actor): Promise<{ blueprint: { anchor: string; label: string; strand: Strand; slots: number }[]; grades: ReadinessRow[] }> {
  assertCan(actor, "reports:read");
  const schoolId = s(actor.schoolId);
  const grades = await activeGrades(repo, schoolId);
  const pools = new Map<number, DesignItem[]>();
  for (const g of grades) pools.set(g, await adaptivePool(repo, schoolId, g));
  const usable = grades.filter((g) => pools.get(g)!.length >= BLUEPRINT_SIZE);
  const bp = effectiveBlueprint((usable.length ? usable : grades).map((g) => pools.get(g)!));
  const slots = new Map<string, number>(); for (const a of bp) slots.set(a, (slots.get(a) ?? 0) + 1);
  const blueprint = [...slots].map(([anchor, n]) => ({ anchor, label: anchorLabel(anchor), strand: strandOfAnchor(anchor), slots: n }));
  const rows: ReadinessRow[] = grades.map((g) => {
    const pool = pools.get(g)!;
    const anchors = blueprint.map((b) => { const mine = pool.filter((q) => q.a === b.anchor); return { anchor: b.anchor, slots: b.slots, easier: mine.filter((q) => q.d < g - 0.4).length, on: mine.filter((q) => Math.abs(q.d - g) <= 0.4).length, harder: mine.filter((q) => q.d > g + 0.4).length }; });
    const strandNeed = (st: Strand) => blueprint.filter((b) => b.strand === st).reduce((t2, b) => t2 + b.slots, 0);
    const short = (["LIT", "INFO", "VOCAB", "LANG"] as Strand[]).filter((st) => pool.filter((q) => q.st === st).length < strandNeed(st)).map((st) => `${STRAND_NAME[st]} ${pool.filter((q) => q.st === st).length}/${strandNeed(st)}`);
    const ready = pool.length >= BLUEPRINT_SIZE && !short.length;
    const strong = ready && anchors.every((x) => x.easier + x.on + x.harder >= 3 * x.slots && x.easier >= 1 && x.on >= 1 && x.harder >= 1);
    return { grade: g, pool: pool.length, ready, strong, short, anchors };
  });
  return { blueprint, grades: rows };
}

/**
 * Builds (or rebuilds, while still a draft) the grade's adaptive Diagnostic for this school year: the shared
 * 50-slot blueprint (the same skills for every grade) and the frozen pool of questions it adapts over.
 */
export async function buildDiagnostic(repo: Repo, actor: Actor, input: { grade: number; size?: number; period?: Period | string | null; form?: "full" | "focus" | string | null }, now = new Date()): Promise<{ id: string; questions: number; pool: number; byStrand: Record<string, number>; period: Period; form: "full" | "focus" }> {
  assertAdmin(actor);
  const schoolId = s(actor.schoolId);
  const year = schoolYear(now);
  void input.size;
  const period: Period = input.period ? asPeriod(input.period) : periodOf(now);
  // BOY is always the full test; MOY / EOY may be a focus form (each student re-tests their weak strands)
  const form: "full" | "focus" = period !== "BOY" && input.form === "focus" ? "focus" : "full";
  const existing = (await repo.findMany("DiagnosticTest", { schoolId, grade: input.grade, year })).find((x) => asPeriod(x.period) === period);
  if (existing && s(existing.status) !== "DRAFT") throw new ValidationError(`This year’s ${PERIOD_LABEL[period]} Diagnostic is already open or closed; it cannot be rebuilt.`);
  await gradeRow(repo, schoolId, input.grade);
  const grades = await activeGrades(repo, schoolId);
  const pools = new Map<number, DesignItem[]>();
  for (const g of grades) pools.set(g, await adaptivePool(repo, schoolId, g));
  const pool = pools.get(input.grade) ?? [];
  // the same skills for every grade: the blueprint comes from every grade whose bank can carry the test
  const usable = grades.filter((g) => g === input.grade || (pools.get(g)?.length ?? 0) >= BLUEPRINT_SIZE);
  const blueprint = effectiveBlueprint(usable.map((g) => pools.get(g)!).filter((p) => p.length));
  const need = (st: Strand) => blueprint.filter((a) => strandOfAnchor(a) === st).length;
  const short = (["LIT", "INFO", "VOCAB", "LANG"] as Strand[]).filter((st) => pool.filter((q) => q.st === st).length < need(st)).map((st) => `${STRAND_NAME[st]} ${pool.filter((q) => q.st === st).length}/${need(st)}`);
  if (pool.length < BLUEPRINT_SIZE || short.length) throw new ValidationError(`Grade ${input.grade} has ${pool.length} questions the test can use (published, marked by the platform, Grades ${input.grade - 2}–${input.grade + 2}); it needs at least ${BLUEPRINT_SIZE}${short.length ? `. Add: ${short.join(" · ")}` : ""}.`);
  const design: Design = { blueprint, items: pool, ...(form === "focus" ? { form } : {}) };
  const title = `Diagnostic Test · ${period} (${PERIOD_LABEL[period]}${form === "focus" ? ", focus form" : ""}) · Grade ${input.grade} · ${year}`;
  const rows = (assessmentId: unknown) => pool.map((q, order) => ({ assessmentId, questionId: q.id, order, points: 1 }));
  let id: string;
  if (existing) {
    id = s(existing.id);
    await repo.deleteMany("AssessmentQuestion", { assessmentId: existing.assessmentId });
    await repo.createMany("AssessmentQuestion", rows(existing.assessmentId));
    await repo.updateMany("Assessment", { id: existing.assessmentId }, { maxQuestions: BLUEPRINT_SIZE, isAdaptive: false });
    await repo.updateMany("DiagnosticTest", { id }, { adaptive: true, design, bands: ADAPTIVE_BANDS, title });
    await repo.updateMany("Assessment", { id: existing.assessmentId }, { title });
  } else {
    const set = await repo.create("Assessment", { title, type: "DIAGNOSTIC", isAdaptive: false, maxQuestions: BLUEPRINT_SIZE, status: "PUBLISHED", createdById: actor.userId, createdAt: now });
    await repo.createMany("AssessmentQuestion", rows(set.id));
    id = s((await repo.create("DiagnosticTest", { schoolId, grade: input.grade, year, title, assessmentId: set.id, status: "DRAFT", bands: ADAPTIVE_BANDS, adaptive: true, design, period, createdById: actor.userId, createdAt: now })).id);
  }
  designCache.clear(); focusCache.clear();
  const byStrand: Record<string, number> = {};
  for (const a of blueprint) byStrand[strandOfAnchor(a)] = (byStrand[strandOfAnchor(a)] ?? 0) + 1;
  return { id, questions: blueprint.length, pool: pool.length, byStrand, period, form };
}

/** Builds the test of every grade at once (the same skills for all). Grades whose bank is short are reported. */
export async function buildAllDiagnostics(repo: Repo, actor: Actor, now = new Date(), opts: { period?: Period | string | null; form?: "full" | "focus" | string | null } = {}): Promise<{ built: { grade: number; id: string; pool: number }[]; skipped: { grade: number; reason: string }[] }> {
  assertAdmin(actor);
  const out = { built: [] as { grade: number; id: string; pool: number }[], skipped: [] as { grade: number; reason: string }[] };
  const schoolId = s(actor.schoolId);
  for (const g of await activeGrades(repo, schoolId)) {
    const classes = await repo.count("Class", { schoolId, gradeId: (await gradeRow(repo, schoolId, g)).id, deletedAt: null });
    if (!classes) continue;
    try { const r = await buildDiagnostic(repo, actor, { grade: g, period: opts.period, form: opts.form }, now); out.built.push({ grade: g, id: r.id, pool: r.pool }); }
    catch (e) { if (e instanceof ValidationError) out.skipped.push({ grade: g, reason: e.message }); else throw e; }
  }
  return out;
}

async function testRow(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const t = await repo.findUnique("DiagnosticTest", { id });
  if (!t || s(t.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Diagnostic not found.");
  return t;
}

/** Swaps one question for another of the same standard (else the same strand) that is not in the test yet. */
export async function swapDiagnosticQuestion(repo: Repo, actor: Actor, id: string, questionId: string): Promise<string> {
  assertAdmin(actor);
  const t = await testRow(repo, actor, id);
  if (s(t.status) !== "DRAFT") throw new ValidationError("The test is open: questions can no longer change.");
  const rows = await repo.findMany("AssessmentQuestion", { assessmentId: t.assessmentId });
  const row = rows.find((r) => s(r.questionId) === questionId);
  if (!row) throw new ValidationError("This question is not in the test.");
  const ds = designOf(t);
  if (ds) {
    // adaptive: the question is left out of the pool (the rest of its skill still fills the slots)
    const me = ds.items.find((q) => q.id === questionId);
    const items = ds.items.filter((q) => q.id !== questionId);
    if (me && items.filter((q) => q.st === me.st).length < ds.blueprint.filter((a) => strandOfAnchor(a) === me.st).length) throw new ValidationError("This strand would have too few questions left. Add questions to the bank first.");
    await repo.deleteMany("AssessmentQuestion", { assessmentId: t.assessmentId, questionId });
    await repo.updateMany("DiagnosticTest", { id }, { design: { blueprint: ds.blueprint, items } });
    designCache.clear(); focusCache.clear();
    return "";
  }
  const pool = await diagnosticPool(repo, s(t.schoolId), Number(t.grade));
  const inTest = new Set(rows.map((r) => s(r.questionId)));
  const me = pool.find((p) => p.id === questionId);
  const free = pool.filter((p) => !inTest.has(p.id));
  const next = free.filter((p) => me && p.area.code === me.area.code).sort((a, b) => Math.abs(a.level - (me?.level ?? 4)) - Math.abs(b.level - (me?.level ?? 4)) || a.id.localeCompare(b.id))[0]
    ?? free.filter((p) => me && p.area.strand === me.area.strand).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) throw new ValidationError("No other question of this standard is free. Add questions to the bank first.");
  await repo.updateMany("AssessmentQuestion", { assessmentId: t.assessmentId, questionId }, { questionId: next.id });
  return next.id;
}

/** Opens the test for every class of the grade (one assignment per class, all with the same questions). */
export async function openDiagnostic(repo: Repo, actor: Actor, id: string, input: { opensAt?: Date | null; closesAt?: Date | null; above?: number; on?: number } = {}, now = new Date()): Promise<{ classes: number; students: number }> {
  assertAdmin(actor);
  const t = await testRow(repo, actor, id);
  if (s(t.status) === "CLOSED") throw new ValidationError("This test is closed.");
  const above = Math.max(50, Math.min(100, Math.round(input.above ?? bandsOf(t).above))), on = Math.max(20, Math.min(above - 1, Math.round(input.on ?? bandsOf(t).on)));
  const g = await gradeRow(repo, s(t.schoolId), Number(t.grade));
  const classes = await repo.findMany("Class", { schoolId: t.schoolId, gradeId: g.id, deletedAt: null });
  let students = 0, made = 0;
  for (const c of classes) {
    if (await ensureClassAssignment(repo, t, c, actor.userId, input.opensAt ?? null, input.closesAt ?? null, now)) made++;
    students += await repo.count("ClassMembership", { classId: c.id, leftAt: null });
  }
  await repo.updateMany("DiagnosticTest", { id }, { status: "OPEN", opensAt: input.opensAt ?? now, closesAt: input.closesAt ?? null, bands: { above, on } });
  // 🗓️ the grade's window follows: dates → AUTO, else open now (MANUAL); /admin/diagnostic changes it afterwards
  const { writeWindow } = await import("./window");
  const auto = Boolean(input.opensAt || input.closesAt);
  await writeWindow(repo, s(t.schoolId), Number(t.grade), s(t.year), { mode: auto ? "AUTO" : "MANUAL", isOpen: !auto, opensAt: auto ? input.opensAt ?? now : null, closesAt: auto ? input.closesAt ?? null : null }, actor.userId ?? null, now);
  // dates of the class assignments follow the test
  const aids = (await repo.findMany("Assignment", { assessmentId: t.assessmentId }, { select: ["id"] })).map((a) => a.id);
  if (aids.length) await repo.updateMany("Assignment", { id: { in: aids } }, { startAt: input.opensAt ?? null, dueAt: input.closesAt ?? null });
  return { classes: made, students };
}

/** The class's assignment of the test (made once); new students are added. Returns true when it was made now. */
function ensureClassAssignment(repo: Repo, t: Row, klass: Row, actorUserId: string | null, opensAt: Date | null, closesAt: Date | null, now: Date): Promise<boolean> {
  return withLock(`diagnostic:${s(t.id)}:${s(klass.id)}`, () => ensureClassAssignmentUnlocked(repo, t, klass, actorUserId, opensAt, closesAt, now));
}
async function ensureClassAssignmentUnlocked(repo: Repo, t: Row, klass: Row, actorUserId: string | null, opensAt: Date | null, closesAt: Date | null, now: Date): Promise<boolean> {
  const existing = (await repo.findMany("Assignment", { classId: klass.id, assessmentId: t.assessmentId, deletedAt: null }))[0];
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  if (existing) {
    const have = new Set((await repo.findMany("AssignmentStudent", { assignmentId: existing.id }, { select: ["studentId"] })).map((x) => s(x.studentId)));
    const add = members.filter((m) => !have.has(m));
    if (add.length) await repo.createMany("AssignmentStudent", add.map((studentId) => ({ assignmentId: existing.id, studentId, status: "NOT_STARTED", progress: 0 })));
    return false;
  }
  const lead = (await repo.findMany("ClassTeacher", { classId: klass.id }, { select: ["teacherId", "isLead"] })).sort((a, b) => Number(Boolean(b.isLead)) - Number(Boolean(a.isLead)))[0];
  if (!lead || !members.length) return false;
  const a = await repo.create("Assignment", { classId: klass.id, createdById: lead.teacherId, title: s(t.title), target: "ASSESSMENT", track: "CURRICULUM", assessmentId: t.assessmentId, startAt: opensAt, dueAt: closesAt, note: `${PERIOD_LABEL[asPeriod(t.period)]} Diagnostic Test`, createdAt: now });
  await repo.createMany("AssignmentStudent", members.map((studentId) => ({ assignmentId: a.id, studentId, status: "NOT_STARTED", progress: 0 })));
  const users = await repo.findMany("Student", { id: { in: members } }, { select: ["userId"] });
  await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "NEW_ASSIGNMENT", title: "📝 Your Diagnostic Test is ready", body: `${s(t.title)}: about ${DIAGNOSTIC_SIZE} questions. Take your time and do your best — there is no score shown until your teacher shares your report.`, link: `/quiz/${s(a.id)}`, readAt: null, createdAt: now })));
  void actorUserId;
  return true;
}

export async function closeDiagnostic(repo: Repo, actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  const t = await testRow(repo, actor, id);
  await repo.updateMany("DiagnosticTest", { id }, { status: "CLOSED" });
  // 🗓️ closing the test closes the grade's window (students keep their answers), unless another test of the year is open
  const { writeWindow } = await import("./window");
  if (!(await repo.count("DiagnosticTest", { schoolId: t.schoolId, grade: t.grade, year: t.year, status: "OPEN" }))) await writeWindow(repo, s(t.schoolId), Number(t.grade), s(t.year), { mode: "MANUAL", isOpen: false, opensAt: null, closesAt: null }, actor.userId ?? null);
}

export interface DiagnosticSummary { id: string; grade: number; year: string; period: Period; form: "full" | "focus"; title: string; status: string; questions: number; adaptive: boolean; pool: number; opensAt: string | null; closesAt: string | null; bands: { above: number; on: number }; students: number; finished: number }

/** The school's Diagnostic tests (admin: all; teacher: their grades). */
export async function listDiagnostics(repo: Repo, actor: Actor): Promise<DiagnosticSummary[]> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const tests = await repo.findMany("DiagnosticTest", { schoolId: actor.schoolId });
  const out: DiagnosticSummary[] = [];
  for (const t of tests.sort((a, b) => s(b.year).localeCompare(s(a.year)) || Number(a.grade) - Number(b.grade) || PERIODS.indexOf(asPeriod(a.period)) - PERIODS.indexOf(asPeriod(b.period)))) {
    const aids = (await repo.findMany("Assignment", { assessmentId: t.assessmentId, deletedAt: null }, { select: ["id"] })).map((a) => a.id);
    const students = aids.length ? await repo.count("AssignmentStudent", { assignmentId: { in: aids } }) : 0;
    out.push({ id: s(t.id), grade: Number(t.grade), year: s(t.year), period: asPeriod(t.period), form: designOf(t)?.form === "focus" ? "focus" : "full", title: s(t.title), status: s(t.status), questions: designOf(t)?.blueprint.length ?? await repo.count("AssessmentQuestion", { assessmentId: t.assessmentId }), adaptive: isAdaptive(t), pool: designOf(t)?.items.length ?? 0, opensAt: d(t.opensAt)?.toISOString().slice(0, 10) ?? null, closesAt: d(t.closesAt)?.toISOString().slice(0, 10) ?? null, bands: bandsOf(t), students, finished: await repo.count("DiagnosticScore", { diagnosticId: t.id }) });
  }
  return out;
}

export interface ReviewQuestion { id: string; n: number; stem: string; area: Area; level: number; type: string; d?: number; g?: number }
/** The questions of the test for the admin to review, with their standard and level. */
export async function diagnosticQuestions(repo: Repo, actor: Actor, id: string): Promise<{ test: DiagnosticSummary; questions: ReviewQuestion[]; byStrand: { strand: Strand; n: number }[]; byStandard: { code: string; label: string; n: number }[]; slots?: { code: string; label: string; strand: Strand; slots: number; easier: number; on: number; harder: number }[] }> {
  assertCan(actor, "reports:read");
  const t = await testRow(repo, actor, id);
  const test = (await listDiagnostics(repo, actor)).find((x) => x.id === id)!;
  const ds = designOf(t);
  if (ds) {
    // adaptive: the 50 skill slots and the pool each slot adapts over (easier / on / harder than the grade)
    const grade = Number(t.grade);
    const qs = await repo.findMany("Question", { id: { in: ds.items.map((q) => q.id) } }, { select: ["id", "stem", "typeId"] });
    const types = await repo.findMany("QuestionType", {}, { select: ["id", "name"] });
    const areaOf = (a: string) => areaOfStandard(codeFor(a, grade)) ?? areaOfCategory("READING", grade);
    const questions = ds.items.map((q, i) => { const r = qs.find((x) => x.id === q.id); return { id: q.id, n: i + 1, stem: s(r?.stem).replace(/\s+/g, " ").slice(0, 160), area: areaOf(q.a), level: q.d < grade - 0.4 ? 3 : q.d > grade + 0.4 ? 5 : 4, type: s(types.find((x) => x.id === r?.typeId)?.name ?? ""), d: q.d, g: q.g }; })
      .sort((a, b) => a.area.code.localeCompare(b.area.code, undefined, { numeric: true }) || a.d - b.d);
    const slotN = new Map<string, number>(); for (const a of ds.blueprint) slotN.set(a, (slotN.get(a) ?? 0) + 1);
    const strandCount = new Map<Strand, number>(); for (const a of ds.blueprint) strandCount.set(strandOfAnchor(a), (strandCount.get(strandOfAnchor(a)) ?? 0) + 1);
    const slots = [...slotN].map(([a, n]) => { const mine = ds.items.filter((q) => q.a === a); return { code: codeFor(a, grade), label: areaOf(a).label, strand: strandOfAnchor(a), slots: n, easier: mine.filter((q) => q.d < grade - 0.4).length, on: mine.filter((q) => Math.abs(q.d - grade) <= 0.4).length, harder: mine.filter((q) => q.d > grade + 0.4).length }; });
    return { test, questions, byStrand: [...strandCount].map(([strand, n]) => ({ strand, n })), byStandard: slots.map((x) => ({ code: x.code, label: x.label, n: x.slots })), slots };
  }
  const rows = (await repo.findMany("AssessmentQuestion", { assessmentId: t.assessmentId })).sort((a, b) => Number(a.order) - Number(b.order));
  const pool = new Map((await diagnosticPool(repo, s(t.schoolId), Number(t.grade))).map((p) => [p.id, p]));
  const qs = rows.length ? await repo.findMany("Question", { id: { in: rows.map((r) => s(r.questionId)) } }, { select: ["id", "stem", "typeId", "difficultyLevel"] }) : [];
  const types = await repo.findMany("QuestionType", {}, { select: ["id", "name", "code"] });
  const questions = rows.map((r, i) => {
    const q = qs.find((x) => x.id === r.questionId);
    const p = pool.get(s(r.questionId));
    return { id: s(r.questionId), n: i + 1, stem: s(q?.stem).replace(/\s+/g, " ").slice(0, 160), area: p?.area ?? areaOfCategory("READING", Number(t.grade)), level: Number(q?.difficultyLevel ?? 4), type: s(types.find((x) => x.id === q?.typeId)?.name ?? "") };
  });
  const strandCount = new Map<Strand, number>(); const stdCount = new Map<string, { label: string; n: number }>();
  for (const q of questions) { strandCount.set(q.area.strand, (strandCount.get(q.area.strand) ?? 0) + 1); const x = stdCount.get(q.area.code) ?? { label: q.area.label, n: 0 }; x.n++; stdCount.set(q.area.code, x); }
  return { test, questions, byStrand: [...strandCount].map(([strand, n]) => ({ strand, n })), byStandard: [...stdCount].map(([code, v]) => ({ code, ...v })).sort((a, b) => a.code.localeCompare(b.code)) };
}

/** The open Diagnostic of the student's grade: their assignment (added if they joined late) and whether they finished. */
export async function myDiagnostic(repo: Repo, actor: Actor, now = new Date()): Promise<{ id: string; title: string; href: string; status: "TODO" | "STARTED" | "DONE"; answered: number; total: number; shared: boolean } | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) return null;
  const m = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const g = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  if (!klass || !g) return null;
  // this school year's test only (each year has its own test, window and results)
  const t = (await repo.findMany("DiagnosticTest", { schoolId: klass.schoolId, grade: Number(g.level), status: "OPEN", year: schoolYear(now) })).sort((a, b) => s(b.year).localeCompare(s(a.year)) || PERIODS.indexOf(asPeriod(b.period)) - PERIODS.indexOf(asPeriod(a.period)))[0];
  if (!t) return null;
  // 🗓️ only while the admin has it open for the grade, once per school year (window.ts); a finished student sees DONE
  const { diagnosticAccess } = await import("./window");
  const access = await diagnosticAccess(repo, actor.studentId, t, now);
  if (access !== "OPEN" && !(access === "DONE" && (await repo.count("DiagnosticScore", { diagnosticId: t.id, studentId: actor.studentId })))) return null;
  // independent reads together (Update 42B)
  const [scores] = await Promise.all([
    repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId: actor.studentId }),
    ensureClassAssignment(repo, t, klass, null, d(t.opensAt), d(t.closesAt), now),
  ]);
  const res = scores[0];
  const a = (await repo.findMany("Assignment", { classId: klass.id, assessmentId: t.assessmentId, deletedAt: null }))[0];
  if (!a) return null;
  const ds = designOf(t);
  const [total, sessions] = await Promise.all([
    ds ? studentDesign(repo, t, ds, actor.studentId).then((x) => x.blueprint.length) : repo.count("AssessmentQuestion", { assessmentId: t.assessmentId }),
    repo.findMany("PracticeSession", { studentId: actor.studentId, assignmentId: a.id, mode: "TEACHER_QUIZ" }),
  ]);
  const ses = sessions[0];
  const answered = ses ? await repo.count("QuestionAttempt", { sessionId: ses.id }) : 0;
  return { id: s(t.id), title: s(t.title), href: `/quiz/${s(a.id)}`, status: res ? "DONE" : answered ? "STARTED" : "TODO", answered, total, shared: Boolean(res?.sharedAt) };
}

/**
 * Called when a student answers the last question of a Diagnostic: scores it by standard and strand, writes the
 * result, sets the student's level (source PLACEMENT) and tells the teacher. Safe to call twice.
 */
export async function recordDiagnosticResult(repo: Repo, assessmentId: string, assignmentId: string, studentId: string, sessionId: string, now = new Date()): Promise<Row | null> {
  const t = (await repo.findMany("DiagnosticTest", { assessmentId }))[0];
  if (!t) return null;
  const done = (await repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId }))[0];
  if (done) return done;
  if (isAdaptive(t)) return recordAdaptiveResult(repo, t, assignmentId, studentId, sessionId, now);
  const order = (await repo.findMany("AssessmentQuestion", { assessmentId })).map((r) => s(r.questionId));
  const attempts = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId", "isCorrect", "rapidGuess", "responseMs", "createdAt"] });
  const answered = new Map<string, Row>(); for (const a of attempts) if (!answered.has(s(a.questionId))) answered.set(s(a.questionId), a);
  if (order.some((id) => !answered.has(id))) return null;
  const pool = new Map((await diagnosticPool(repo, s(t.schoolId), Number(t.grade))).map((p) => [p.id, p]));
  const stdMap = new Map<string, { code: string; label: string; strand: Strand; anchor: string; correct: number; total: number }>();
  const strandMap = new Map<Strand, { correct: number; total: number }>();
  let correct = 0;
  for (const id of order) {
    const ok = Boolean(answered.get(id)!.isCorrect); if (ok) correct++;
    const area = pool.get(id)?.area ?? areaOfCategory("READING", Number(t.grade));
    const x = stdMap.get(area.code) ?? { ...area, correct: 0, total: 0 }; x.total++; if (ok) x.correct++; stdMap.set(area.code, x);
    const y = strandMap.get(area.strand) ?? { correct: 0, total: 0 }; y.total++; if (ok) y.correct++; strandMap.set(area.strand, y);
  }
  const pct = Math.round((1000 * correct) / Math.max(1, order.length)) / 10;
  const level = levelForPct(pct, bandsOf(t));
  const times = attempts.map((a) => d(a.createdAt)!.getTime());
  const minutes = Math.round(attempts.reduce((m, a) => m + Math.min(Number(a.responseMs ?? 0), 300_000), 0) / 60_000) || Math.round((Math.max(...times) - Math.min(...times)) / 60_000);
  const rapid = attempts.filter((a) => a.rapidGuess).length;
  const row = await repo.create("DiagnosticScore", {
    diagnosticId: t.id, studentId, assignmentId, correct, total: order.length, pct, level,
    byStandard: [...stdMap.values()].sort((a, b) => a.code.localeCompare(b.code)), byStrand: [...strandMap].map(([strand, v]) => ({ strand, ...v })),
    rapid, minutes, completedAt: now, sharedAt: null, teacherNote: null,
  });
  // Update 39B: a result with 30%+ rapid guesses is INVALID — it never sets the level, the practice priors or a tier;
  // the teacher is told to re-test (and the daily alert scan raises an INVALID_TEST alert)
  const invalid = isInvalidResult(rapid, order.length);
  const grade = Number(t.grade);
  if (!invalid) {
    await recordLevel(repo, { studentId, level, source: "PLACEMENT", reason: `Diagnostic Test ${pct}%`, answers: order.length, now });
    // practice priors by domain (estimated from the answers and the questions' levels)
    const scored = order.map((id) => { const q = pool.get(id); const area = q?.area ?? areaOfCategory("READING", grade); return { anchor: area.anchor, strand: area.strand, d: difficultyOf(grade, q?.level ?? 4), correct: Boolean(answered.get(id)!.isCorrect) }; });
    await writeDomainAbilities(repo, studentId, grade, scored, estimate(scored, grade).theta);
  }
  const name = s((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))?.userId }))?.displayName) || "A student";
  await notifyTeachers(repo, studentId, invalid ? `⚡ ${name}'s Diagnostic is invalid — re-test` : `📝 ${name} finished the Diagnostic`, invalid ? `${rapid} of ${order.length} answers were rapid guesses (too fast to read). The result (${pct}%) is not used for the level or the support tier. Talk with the student and re-test.` : `${correct}/${order.length} (${pct}%) · ${level.charAt(0)}${level.slice(1).toLowerCase()} Level.${rapid >= order.length * 0.2 ? ` ⚡ ${rapid} answers were too fast — the result may be lower than their real level.` : ""}`, now);
  return row;
}

/** The practice domain (Skill.domain) a Diagnostic anchor measures. */
export function domainOfAnchor(anchor: string, strand: Strand): string {
  if (strand === "LIT" || strand === "INFO") return "READING";
  if (strand === "VOCAB") return "VOCABULARY";
  if (strand === "FOUND") return "WORD_STUDY";
  if (strand === "LANG") return anchor === "L.2" ? "LANGUAGE" : "GRAMMAR";
  return "WRITING";
}

/**
 * Diagnostic θ (grade units: item d = grade + (level − 4) / 3) → the practice engine's θ scale, where an item of
 * authoring level L has b = LEVEL_TO_B[L] (0 at grade level, 0.75 per level). So θ = 0.75 × 3 × (θ_grade − grade),
 * clamped to the engine's range — the same scale the legacy placement check writes.
 */
export function toPracticeTheta(thetaGrade: number, grade: number): number {
  const perLevel = LEVEL_TO_B[5] - LEVEL_TO_B[4];
  const x = LEVEL_TO_B[4] + perLevel * 3 * (thetaGrade - grade);
  return Math.round(Math.max(DEFAULT_ADAPTIVE.thetaMin, Math.min(DEFAULT_ADAPTIVE.thetaMax, x)) * 1000) / 1000;
}

/**
 * Seeds practice: one StudentAbility DOMAIN:<domain> row per area the Diagnostic measured (the prior practice starts
 * from), on the practice θ scale. Like the legacy placement check, the newest placement replaces the domain estimate
 * (practice itself never writes DOMAIN rows; it keeps its own SKILL rows).
 */
export async function writeDomainAbilities(repo: Repo, studentId: string, grade: number, rows: { anchor: string; strand: Strand; d: number; correct: boolean }[], overallTheta: number): Promise<void> {
  const byDomain = new Map<string, { d: number; correct: boolean }[]>();
  for (const r of rows) { const k = domainOfAnchor(r.anchor, r.strand); if (k === "WRITING") continue; byDomain.set(k, [...(byDomain.get(k) ?? []), { d: r.d, correct: r.correct }]); }
  const scale = (LEVEL_TO_B[5] - LEVEL_TO_B[4]) * 3;
  for (const [domain, list] of byDomain) {
    const e = estimate(list, overallTheta, 0.6); // leans on the overall estimate when the area has few answers
    const theta = toPracticeTheta(e.theta, grade);
    const se = Math.round(Math.min(DEFAULT_ADAPTIVE.priorSD * 1.5, e.se * scale) * 1000) / 1000;
    await repo.upsert("StudentAbility", { studentId, scope: `DOMAIN:${domain}` }, { domain, theta, thetaSE: se, responses: list.length }, { theta, thetaSE: se, responses: list.length });
  }
}

/** The assessment id when this set is a Diagnostic Test (else null). */
export async function diagnosticOfAssessment(repo: Repo, assessmentId: string): Promise<string | null> {
  if (!assessmentId) return null;
  return (await repo.findMany("DiagnosticTest", { assessmentId }, { select: ["id"] })).length ? assessmentId : null;
}

/**
 * The adaptive result: ability on the grade scale (overall, by skill, by strand and by MAP goal area, each skill's
 * estimate leaning on the overall one when it has few answers), the 0–100 score against the student's grade, the
 * level, and the estimated MAP Reading RIT.
 */
async function recordAdaptiveResult(repo: Repo, t: Row, assignmentId: string, studentId: string, sessionId: string, now: Date): Promise<Row | null> {
  const design = await studentDesign(repo, t, designOf(t)!, studentId);
  const answers = await answersOf(repo, sessionId);
  const start = await startOf(repo, t, sessionId, studentId);
  if (replay(design, answers).open.length && nextItem(design, answers, start, studentId)) return null;
  const grade = Number(t.grade);
  const byId = new Map(design.items.map((q) => [q.id, q]));
  const rows = answers.filter((a) => byId.has(a.id)).map((a) => ({ ...a, q: byId.get(a.id)! }));
  const overall = estimate(rows.map((r) => ({ d: r.q.d, correct: r.correct })), start);
  const part = (list: typeof rows) => { const e = estimate(list.map((r) => ({ d: r.q.d, correct: r.correct })), overall.theta, 0.6); return { correct: list.filter((r) => r.correct).length, total: list.length, theta: e.theta, score: scoreOf(e.theta, grade), gl: gradeLabel(e.theta) }; };
  const anchors = [...new Set(rows.map((r) => r.q.a))];
  const byStandard = anchors.map((a) => { const area = areaOfStandard(codeFor(a, grade)) ?? areaOfCategory("READING", grade); return { code: codeFor(a, grade), label: area.label, strand: area.strand, anchor: a, ...part(rows.filter((r) => r.q.a === a)) }; }).sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
  const byStrand = (["LIT", "INFO", "VOCAB", "LANG", "FOUND"] as Strand[]).filter((st) => rows.some((r) => r.q.st === st)).map((st) => ({ strand: st, ...part(rows.filter((r) => r.q.st === st)) }));
  // MAP goal areas (the same reading of the standards the Question Bank uses)
  const { areaForStandard } = await import("../map/map-more");
  const { GROUPS } = await import("../map/map-plan");
  const groupOfAnchor = (a: string) => { const code = areaForStandard(codeFor(a, grade)); return GROUPS.find((g) => code && g.codes.includes(code)) ?? null; };
  const byArea = GROUPS.filter((g) => g.key !== "WRITING").map((g) => ({ g, list: rows.filter((r) => groupOfAnchor(r.q.a)?.key === g.key) })).filter((x) => x.list.length).map((x) => ({ group: x.g.key, name: x.g.name, subject: x.g.subject, ...part(x.list) }));
  let pct = scoreOf(overall.theta, grade);
  // focus form: the strands not re-tested carry their earlier result, and the overall score weighs every strand by
  // its share of the full test — so it compares with the full BOY score (growth) instead of only the weak strands
  const full = designOf(t)!;
  if (full.form === "focus" && design.blueprint !== full.blueprint) {
    const prior = await priorScore(repo, t, studentId);
    const before = prior ? (typeof prior.score.byStrand === "string" ? JSON.parse(s(prior.score.byStrand)) : prior.score.byStrand) as { strand: Strand; correct: number; total: number; score?: number }[] : [];
    const cell0 = (x: { correct: number; total: number; score?: number }) => (typeof x.score === "number" ? x.score : x.total ? Math.round((1000 * x.correct) / x.total) / 10 : 0);
    for (const b of before ?? []) if (!byStrand.some((x) => x.strand === b.strand)) (byStrand as unknown as Record<string, unknown>[]).push({ ...b, score: cell0(b), carried: true });
    const share = new Map<Strand, number>(); for (const a of full.blueprint) share.set(strandOfAnchor(a), (share.get(strandOfAnchor(a)) ?? 0) + 1);
    const cell = (x: { correct: number; total: number; score?: number }) => (typeof x.score === "number" ? x.score : x.total ? (100 * x.correct) / x.total : 0);
    const w = byStrand.filter((x) => share.has(x.strand));
    const W = w.reduce((n, x) => n + share.get(x.strand)!, 0);
    if (W) pct = Math.round((10 * w.reduce((n, x) => n + share.get(x.strand)! * cell(x), 0)) / W) / 10;
  }
  const level = levelForPct(pct, bandsOf(t));
  const rit = (await ritScale(repo)).toRit(overall.theta);
  const correct = rows.filter((r) => r.correct).length;
  const minutes = Math.round(answers.reduce((m, a) => m + Math.min(a.ms, 300_000), 0) / 60_000) || Math.round((Math.max(...answers.map((a) => a.at)) - Math.min(...answers.map((a) => a.at))) / 60_000);
  const rapid = answers.filter((a) => a.rapid).length;
  const row = await repo.create("DiagnosticScore", {
    diagnosticId: t.id, studentId, assignmentId, correct, total: rows.length, pct, level, byStandard, byStrand, rapid, minutes,
    theta: overall.theta, thetaSE: overall.se, ritEstimate: rit, byArea, completedAt: now, sharedAt: null, teacherNote: null,
  });
  // Update 39B: 30%+ rapid guesses → invalid: no level, no practice priors, no tier; the teacher is told to re-test
  const invalid = isInvalidResult(rapid, rows.length);
  if (!invalid) {
    await recordLevel(repo, { studentId, level, source: "PLACEMENT", reason: `Diagnostic Test · reading at ${gradeLabel(overall.theta)} (score ${pct})`, answers: rows.length, now });
    // practice priors by domain, on the practice θ scale
    await writeDomainAbilities(repo, studentId, grade, rows.map((r) => ({ anchor: r.q.a, strand: r.q.st, d: r.q.d, correct: r.correct })), overall.theta);
  }
  const name = s((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))?.userId }))?.displayName) || "A student";
  await notifyTeachers(repo, studentId, invalid ? `⚡ ${name}'s Diagnostic is invalid — re-test` : `📝 ${name} finished the Diagnostic`, invalid ? `${rapid} of ${rows.length} answers were rapid guesses (too fast to read). The result (score ${pct}) is not used for the level or the support tier. Talk with the student and re-test.` : `Reading at ${gradeLabel(overall.theta)} · score ${pct} · ${level.charAt(0)}${level.slice(1).toLowerCase()} Level${rit ? ` · about RIT ${rit}` : ""}.${rapid >= rows.length * 0.2 ? ` ⚡ ${rapid} answers were too fast — the result may be lower than their real level.` : ""}`, now);
  return row;
}
