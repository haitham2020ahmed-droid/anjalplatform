/**
 * 🇸🇦 NAFS Reports (teacher-facing only): one place for online answers, bubble sheets and typed answers, classifying
 * EVERY skill:
 *   - per test and across tests; per class, per student, per Ministry standard (S01–S13), per NAFS skill, per PIRLS
 *     process, per content area (Vocabulary / Comprehension and analysis / Evaluation), per text type
 *   - student × standard heat map (percent + the number of items behind each cell, colour AND text)
 *   - each student per standard: Mastered / Developing / Needs support with the teacher's cut-offs (defaults 80 / 50),
 *     "Not enough questions" under 2 items (teacher-facing words — students never see them)
 *   - item analysis: % correct, discrimination (upper vs lower 27%), the most chosen distractor, flags to review
 *   - class summary: strongest / weakest standards, ready-made groups needing support per standard (→ a NAFS plan),
 *     classes compared on the same test, the trend across tests
 *   - Excel (a sheet per view) / PDF through the report engine (src/reports)
 * Short written answers count only once the teacher has scored them (rubric 0 / 1 / 2 = 0, ½, 1 of the item).
 * Rounding: every percentage is computed from the exact counts and rounded to the nearest whole number (halves up) at
 * the end; the level of a student on a standard uses the exact (unrounded) value.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertNafs } from "../teacher/nafs-access";
import type { Column, ReportDoc, Section, TableRow } from "../../reports/model";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import { renderXlsx } from "../../reports/xlsx";
import { audit } from "../audit";
import { consumeRateLimit } from "../auth/rate-limit";
import { CONTENT_TYPES, loadBranding, RateLimitedError, REPORT_RATE, type ReportDeps } from "../reports/service";
import { areaOfStandard, CONTENT_SKILLS, MOE_AREAS, MOE_BY_CODE, MOE_STANDARDS, NAFS_DOMAINS, PROCESS_NAME, PROCESSES, SKILL_BY_CODE, type MoeArea, type NafsDomain, type NafsProcess } from "./framework";
import { loadNafsQuestions, nafsIndex, type NafsEntry, type NafsKind, type NafsQuestion } from "./bank";
import { cleanScores, getNafsTest, gradeAnswers, json, markOf, nafsClasses, type Answer, type NafsClass } from "./tests";
import { GRACE_MS } from "./student";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
/** Exact → whole percent (halves up). */
export const roundPct = (sum: number, n: number): number | null => (n ? Math.floor((100 * sum) / n + 0.5 + 1e-9) : null);
const pct = (a: number, b: number) => roundPct(a, b);
/** Under this a skill is one to practise / reteach (also the NAFS plan's threshold). */
export const MASTERY_PCT = 70;
export const ROUNDING_RULE = "Percentages are computed from the exact counts and rounded to the nearest whole number (halves up) at the end; a student's level on a standard uses the exact value.";

// ------------------------------------------------------------------ levels (teacher-facing only)

export type Level = "MASTERED" | "DEVELOPING" | "SUPPORT" | "FEW";
export const LEVELS: Level[] = ["MASTERED", "DEVELOPING", "SUPPORT", "FEW"];
export const LEVEL_NAME: Record<Level, string> = { MASTERED: "Mastered", DEVELOPING: "Developing", SUPPORT: "Needs support", FEW: "Not enough questions" };
/** A mark that prints in black and white next to the colour. */
export const LEVEL_MARK: Record<Level, string> = { MASTERED: "●", DEVELOPING: "◐", SUPPORT: "○", FEW: "·" };
/** Fewer scored items than this on a standard → "Not enough questions". */
export const MIN_ITEMS = 2;
export interface Cuts { hi: number; lo: number }
export const DEFAULT_CUTS: Cuts = { hi: 80, lo: 50 };
/** The teacher's cut-offs (whole percents): Mastered from `hi`, Developing from `lo` (lo < hi). */
export function cleanCuts(hi: unknown, lo: unknown): Cuts {
  const n = (v: unknown, def: number, min: number, max: number) => { const x = Math.round(Number(v)); return v === null || v === undefined || v === "" || !Number.isFinite(x) ? def : Math.max(min, Math.min(max, x)); };
  const h = n(hi, DEFAULT_CUTS.hi, 1, 100);
  const l = n(lo, DEFAULT_CUTS.lo, 0, 100);
  return { hi: h, lo: Math.min(l, h - 1) };
}
/** A student's level on a standard from the exact percent and the number of scored items behind it. */
export function classify(exactPct: number | null, items: number, cuts: Cuts = DEFAULT_CUTS): Level {
  if (items < MIN_ITEMS || exactPct === null) return "FEW";
  if (exactPct >= cuts.hi) return "MASTERED";
  if (exactPct >= cuts.lo) return "DEVELOPING";
  return "SUPPORT";
}

// ------------------------------------------------------------------ discrimination (upper vs lower 27%)

/**
 * Item discrimination: students who have a score on the item are ranked by their total; the top and bottom 27%
 * (at least 1 each: round(0.27 × N)) are compared — D = p(upper) − p(lower), from −1 to 1. Null with fewer than 2.
 */
export function discrimination(totals: number[], credit: (number | null | undefined)[]): { d: number | null; upper: number | null; lower: number | null; group: number } {
  const rows = totals.map((t, i) => ({ t, c: credit[i] })).filter((x): x is { t: number; c: number } => typeof x.c === "number");
  const n = rows.length;
  if (n < 2) return { d: null, upper: null, lower: null, group: 0 };
  const g = Math.max(1, Math.round(0.27 * n));
  const sorted = rows.map((x, i) => ({ ...x, i })).sort((a, b) => b.t - a.t || a.i - b.i);
  const mean = (l: { c: number }[]) => l.reduce((a, x) => a + x.c, 0) / l.length;
  const upper = mean(sorted.slice(0, g)), lower = mean(sorted.slice(n - g));
  return { d: Math.round((upper - lower) * 100) / 100, upper: Math.round(upper * 100) / 100, lower: Math.round(lower * 100) / 100, group: g };
}
export const FLAG = {
  HARD: "Very hard: under 30% correct",
  EASY: "Very easy: over 95% correct",
  NEG: "Negative discrimination: check the key",
  LOW: "Low discrimination (under 0.20)",
  DISTRACTOR: "A wrong option was chosen more than the key",
  BLANKS: "Many blanks (a quarter or more)",
} as const;
export function itemFlags(x: { pct: number | null; d: number | null; counts: number[]; key: number; blank: number; answered: number; kind: NafsKind }): string[] {
  const out: string[] = [];
  if (x.pct !== null && x.pct < 30) out.push(FLAG.HARD);
  if (x.pct !== null && x.pct > 95 && x.answered >= 5) out.push(FLAG.EASY);
  if (x.d !== null && x.d < 0) out.push(FLAG.NEG);
  else if (x.d !== null && x.d < 0.2) out.push(FLAG.LOW);
  if (x.kind === "MCQ" && x.key >= 0 && x.counts.some((c, k) => k !== x.key && c > x.counts[x.key])) out.push(FLAG.DISTRACTOR);
  if (x.kind === "MCQ" && x.answered && x.blank / x.answered >= 0.25) out.push(FLAG.BLANKS);
  return out;
}

// ------------------------------------------------------------------ the shared model: items, responses, summaries

export type TextType = "INFO" | "LIT" | "NONE";
export const TEXT_NAME: Record<TextType, string> = { INFO: "Informational", LIT: "Literary", NONE: "No passage / not set" };
export interface ItemMeta { key: string; id: string; testId: string; n: number; code: string; process: NafsProcess; standard: string | null; area: MoeArea | null; text: TextType; domain: NafsDomain; kind: NafsKind; answerKey: number; mark: number; stem: string }
interface Resp { studentId: string; classId: string; credit: Map<string, number | null> }

function itemsOf(testId: string, ids: string[], qs: NafsQuestion[], idx: Map<string, NafsEntry>, marks: Record<string, number> | null): ItemMeta[] {
  return ids.map((id, i) => {
    const e = idx.get(id), q = qs.find((x) => x.id === id);
    const code = e?.nafsCode ?? "NAFS.RC.MAIN";
    const text: TextType = q?.passage ? (q.passage.type ?? e?.cat ?? "NONE") : "NONE";
    return { key: `${testId}:${i}`, id, testId, n: i + 1, code, process: e?.process ?? "P1", standard: e?.standard ?? null, area: areaOfStandard(e?.standard), text, domain: SKILL_BY_CODE.get(code)?.domain ?? "RC", kind: q?.kind ?? e?.kind ?? "MCQ", answerKey: q?.correct ?? -1, mark: markOf(marks, id), stem: s(q?.stem).slice(0, 200) };
  });
}

export interface Exact { pct: number | null; exact: number | null; n: number }
const exactOf = (sum: number, n: number): Exact => ({ pct: roundPct(sum, n), exact: n ? (100 * sum) / n : null, n });
/** Pooled credit of a student (or the class) over the items a function groups. */
function byDim(items: ItemMeta[], resp: Resp[], dim: (x: ItemMeta) => string): { student: Map<string, Map<string, Exact>>; pooled: Map<string, Exact & { questions: number }> } {
  const student = new Map<string, Map<string, Exact>>();
  const tot = new Map<string, { sum: number; n: number; q: Set<string> }>();
  for (const r of resp) {
    const per = new Map<string, { sum: number; n: number }>();
    for (const it of items) {
      if (!r.credit.has(it.key)) continue;
      const c = r.credit.get(it.key);
      const k = dim(it);
      const t = tot.get(k) ?? { sum: 0, n: 0, q: new Set<string>() }; t.q.add(it.key);
      if (c !== null && c !== undefined) { const b = per.get(k) ?? { sum: 0, n: 0 }; b.sum += c; b.n++; per.set(k, b); t.sum += c; t.n++; }
      tot.set(k, t);
    }
    const prev = student.get(r.studentId) ?? new Map<string, Exact>();
    for (const [k, b] of per) {
      const p = prev.get(k);
      // (across tests a student can have several responses: pooled)
      const sum = b.sum + (p?.exact !== null && p ? (p.exact! * p.n) / 100 : 0), n = b.n + (p?.n ?? 0);
      prev.set(k, exactOf(sum, n));
    }
    student.set(r.studentId, prev);
  }
  // every item of a group counts as a question even if nobody answered
  for (const it of items) { const k = dim(it); const t = tot.get(k) ?? { sum: 0, n: 0, q: new Set<string>() }; t.q.add(it.key); tot.set(k, t); }
  return { student, pooled: new Map([...tot].map(([k, t]) => [k, { ...exactOf(t.sum, t.n), questions: t.q.size }])) };
}

export interface DimRow { key: string; name: string; questions: number; pct: number | null; n: number }
export interface StandardRow extends DimRow { short: string; text: string; area: MoeArea | null; counts: Record<Level, number> }
export interface StudentStd { pct: number | null; n: number; level: Level }
export interface Summary {
  standards: StandardRow[]; areas: DimRow[]; texts: DimRow[]; skillRows: DimRow[]; processRows: DimRow[];
  /** student id → standard code → cell */
  cells: Record<string, Record<string, StudentStd>>;
  studentDims: Record<string, { skills: Record<string, number | null>; processes: Record<NafsProcess, number | null>; domains: Partial<Record<NafsDomain, number | null>>; areas: Record<string, number | null>; texts: Record<string, number | null>; overall: Exact }>;
  strongest: string[]; weakest: string[];
  groups: { code: string; short: string; text: string; classes: { classId: string; className: string; support: { id: string; name: string }[]; developing: { id: string; name: string }[]; planHref: string }[] }[];
  classCompare: { classId: string; name: string; taken: number; pct: number | null; standards: Record<string, number | null> }[];
  cuts: Cuts; notSet: number;
}

function summarize(items: ItemMeta[], resp: Resp[], classes: NafsClass[], cuts: Cuts, planSkills: Map<string, string[]>): Summary {
  const nameOf = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, x.name] as const)));
  const st = byDim(items, resp, (x) => x.standard ?? "NONE");
  const ar = byDim(items, resp, (x) => x.area ?? "NONE");
  const tx = byDim(items, resp, (x) => x.text);
  const sk = byDim(items, resp, (x) => x.code);
  const pr = byDim(items, resp, (x) => x.process);
  const dm = byDim(items, resp, (x) => x.domain);
  const all = byDim(items, resp, () => "ALL");
  const students = [...new Set(resp.map((r) => r.studentId))];
  const cells: Summary["cells"] = {};
  for (const id of students) {
    cells[id] = {};
    for (const x of MOE_STANDARDS) { const c = st.student.get(id)?.get(x.code); if (!st.pooled.has(x.code)) continue; cells[id][x.code] = { pct: c?.pct ?? null, n: c?.n ?? 0, level: classify(c?.exact ?? null, c?.n ?? 0, cuts) }; }
  }
  const counts = (code: string) => { const o = { MASTERED: 0, DEVELOPING: 0, SUPPORT: 0, FEW: 0 } as Record<Level, number>; for (const id of students) { const c = cells[id][code]; if (c) o[c.level]++; } return o; };
  const standards: StandardRow[] = MOE_STANDARDS.filter((x) => st.pooled.has(x.code)).map((x) => { const p = st.pooled.get(x.code)!; return { key: x.code, name: `${x.short} ${x.text}`, short: x.short, text: x.text, area: x.area, questions: p.questions, pct: p.pct, n: p.n, counts: counts(x.code) }; });
  const dimRows = (m: Map<string, Exact & { questions: number }>, keys: string[], name: (k: string) => string): DimRow[] => keys.filter((k) => m.has(k)).map((k) => ({ key: k, name: name(k), questions: m.get(k)!.questions, pct: m.get(k)!.pct, n: m.get(k)!.n }));
  const ranked = standards.filter((x) => x.pct !== null && x.n > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || a.short.localeCompare(b.short));
  const pick = (l: StandardRow[]) => l.slice(0, Math.min(3, Math.max(1, Math.floor(l.length / 2)))).map((x) => x.key);
  const studentDims: Summary["studentDims"] = {};
  for (const id of students) {
    const o = (m: Map<string, Map<string, Exact>>) => Object.fromEntries([...(m.get(id) ?? new Map<string, Exact>())].map(([k, v]) => [k, v.pct]));
    studentDims[id] = { skills: o(sk.student), processes: Object.fromEntries(PROCESSES.map((p) => [p, pr.student.get(id)?.get(p)?.pct ?? null])) as Record<NafsProcess, number | null>, domains: o(dm.student), areas: o(ar.student), texts: o(tx.student), overall: all.student.get(id)?.get("ALL") ?? { pct: null, exact: null, n: 0 } };
  }
  const groups: Summary["groups"] = standards.map((x) => ({
    code: x.key, short: x.short, text: x.text,
    classes: classes.map((c) => {
      const mine = students.filter((id) => resp.some((r) => r.studentId === id && r.classId === c.id));
      const support = mine.filter((id) => cells[id][x.key]?.level === "SUPPORT").map((id) => ({ id, name: nameOf.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
      const developing = mine.filter((id) => cells[id][x.key]?.level === "DEVELOPING").map((id) => ({ id, name: nameOf.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
      const skills = [...new Set((MOE_BY_CODE.get(x.key)?.nafs ?? []).flatMap((code) => planSkills.get(code) ?? []))].slice(0, 20);
      const q = new URLSearchParams({ tab: "nafs", classId: c.id, who: "group" });
      for (const st0 of support) q.append("sid", st0.id);
      for (const k of skills) q.append("add", k);
      return { classId: c.id, className: c.name, support, developing, planHref: `/teacher/plans?${q}` };
    }).filter((g) => g.support.length || g.developing.length),
  })).filter((g) => g.classes.length);
  const classCompare = classes.map((c) => {
    const r = resp.filter((x) => x.classId === c.id);
    if (!r.length) return null;
    const one = byDim(items, r, (x) => x.standard ?? "NONE"), tot = byDim(items, r, () => "ALL");
    return { classId: c.id, name: c.name, taken: new Set(r.map((x) => x.studentId)).size, pct: tot.pooled.get("ALL")?.pct ?? null, standards: Object.fromEntries(standards.map((x) => [x.key, one.pooled.get(x.key)?.pct ?? null])) };
  }).filter((x): x is NonNullable<typeof x> => Boolean(x));
  return {
    standards, cells, studentDims, cuts, classCompare, groups,
    areas: dimRows(ar.pooled, [...MOE_AREAS.map((a) => a.code), "NONE"], (k) => (k === "NONE" ? "Standard not set" : MOE_AREAS.find((a) => a.code === k)!.name)),
    texts: dimRows(tx.pooled, ["INFO", "LIT", "NONE"], (k) => TEXT_NAME[k as TextType]),
    skillRows: dimRows(sk.pooled, CONTENT_SKILLS.map((k) => k.code), (k) => SKILL_BY_CODE.get(k)!.name),
    processRows: dimRows(pr.pooled, PROCESSES, (k) => PROCESS_NAME[k as NafsProcess]),
    strongest: pick(ranked), weakest: pick([...ranked].reverse()),
    notSet: items.filter((x) => !x.standard).length,
  };
}

/** NAFS skill → the school's Grade 6 skills linked to it (for "Make a NAFS plan for this group"). */
async function planSkillMap(repo: Repo, schoolId: string): Promise<Map<string, string[]>> {
  const links = (await repo.findMany("NafsSkillFamily", {}, { select: ["nafsCode", "familyId", "source"] })).filter((l) => s(l.source) !== "OFF");
  if (!links.length) return new Map();
  const grades = await repo.findMany("Grade", { schoolId, level: 6 }, { select: ["id"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => s(g.id)) } }, { select: ["id"] }) : [];
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => s(c.id)) }, familyId: { in: [...new Set(links.map((l) => s(l.familyId)))] }, deletedAt: null, isActive: true }, { select: ["id", "familyId"] }) : [];
  const out = new Map<string, string[]>();
  for (const l of links) for (const k of skills) if (s(k.familyId) === s(l.familyId)) { const list = out.get(s(l.nafsCode)) ?? []; if (list.length < 5) list.push(s(k.id)); out.set(s(l.nafsCode), list); }
  return out;
}

// ------------------------------------------------------------------ one test

export interface ItemRow { n: number; id: string; stem: string; skill: string; code: string; process: NafsProcess; standard: string | null; kind: NafsKind; key: number; counts: number[]; blank: number; answered: number; pct: number | null; topWrong: number | null; topWrongCount: number; d: number | null; upper: number | null; lower: number | null; pending: number; flags: string[] }
export interface StudentRow {
  id: string; name: string; className: string; classId: string; source: string; correct: number; total: number; pct: number; points: number; maxPoints: number; pending: number;
  domains: Partial<Record<NafsDomain, number | null>>; skills: Record<string, number | null>; processes: Record<NafsProcess, number | null>; blanks: number;
  standards: Record<string, StudentStd>; areas: Record<string, number | null>; texts: Record<string, number | null>;
}
export interface NafsReport {
  test: { id: string; title: string; questions: number; minutes: number | null };
  classes: { id: string; name: string }[]; classId: string | null;
  taken: number; roster: number; avgPct: number | null; avgPoints: number | null; maxPoints: number; pending: number;
  domains: { code: NafsDomain; name: string; pct: number | null }[];
  skills: { code: string; name: string; domain: NafsDomain; questions: number; pct: number | null; below: string[] }[];
  processes: { code: NafsProcess; name: string; questions: number; pct: number | null }[];
  students: StudentRow[]; notTaken: { id: string; name: string; className: string }[];
  items: ItemRow[];
  summary: Summary;
}

/** Online answers past the time (+ grace) that were never handed in are graded as they are. */
async function finishLate(repo: Repo, rows: Row[], t: { questionIds: string[]; timeLimitMin: number | null }, key: number[], marks: number[], minutesOf: (r: Row) => number | null, now: Date): Promise<void> {
  for (const r of rows) {
    const minutes = minutesOf(r) ?? t.timeLimitMin;
    if (!minutes || r.submittedAt || s(r.source) !== "ONLINE" || !d(r.startedAt)) continue;
    if (now.getTime() <= d(r.startedAt)!.getTime() + minutes * 60_000 + GRACE_MS) continue;
    const answers = json<Answer[]>(r.answers, []);
    const g = gradeAnswers(key, marks, t.questionIds.map((_x, i) => answers[i] ?? null), {});
    await repo.updateMany("NafsResult", { id: r.id }, { correct: g.correct, points: g.points, maxPoints: g.maxPoints, writtenScores: {}, submittedAt: now, updatedAt: now });
    r.submittedAt = now; r.correct = g.correct; r.points = g.points; r.maxPoints = g.maxPoints; r.writtenScores = {};
  }
}

export async function nafsTestReport(repo: Repo, actor: Actor, testId: string, classId?: string | null, now = new Date(), cutsIn?: Partial<Cuts> | null): Promise<NafsReport> {
  await assertNafs(repo, actor);
  const cuts = cleanCuts(cutsIn?.hi, cutsIn?.lo);
  const t = await getNafsTest(repo, actor, testId);
  const all = await nafsClasses(repo, actor);
  const classes = classId ? all.filter((c) => c.id === classId) : all;
  if (classId && !classes.length) throw new ForbiddenError("Class not found.");
  const [idxList, qs, planSkills] = await Promise.all([nafsIndex(repo, actor.schoolId!), loadNafsQuestions(repo, t.questionIds), planSkillMap(repo, actor.schoolId!)]);
  const idx = new Map(idxList.map((e) => [e.id, e]));
  const items = itemsOf(t.id, t.questionIds, qs, idx, t.marks);
  const key = items.map((x) => x.answerKey), marks = items.map((x) => x.mark);
  const [rows, given] = classes.length ? await Promise.all([
    repo.findMany("NafsResult", { testId: t.id, classId: { in: classes.map((c) => c.id) } }),
    repo.findMany("NafsTestClass", { testId: t.id, classId: { in: classes.map((c) => c.id) } }, { select: ["classId", "timeLimitMin", "studentIds"] }),
  ]) : [[], []] as Row[][];
  await finishLate(repo, rows, t, key, marks, (r) => { const g = given.find((x) => x.classId === r.classId); return g?.timeLimitMin ? Number(g.timeLimitMin) : null; }, now);
  const done = rows.filter((r) => r.submittedAt);
  const n = t.questionIds.length;
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const nameOf = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, x.name] as const)));
  const graded = done.map((r) => { const a = json<Answer[]>(r.answers, []); return { r, a, g: gradeAnswers(key, marks, t.questionIds.map((_x, i) => a[i] ?? null), cleanScores(r.writtenScores, key)) }; });
  const resp: Resp[] = graded.map(({ r, g }) => ({ studentId: s(r.studentId), classId: s(r.classId), credit: new Map(items.map((it, i) => [it.key, g.credit[i]])) }));
  const sum = summarize(items, resp, classes, cuts, planSkills);
  const students: StudentRow[] = graded.map(({ r, a, g }) => {
    const id = s(r.studentId), dims = sum.studentDims[id];
    return {
      id, name: nameOf.get(id) ?? "Student", className: className.get(s(r.classId)) ?? "", classId: s(r.classId), source: s(r.source),
      correct: g.correct, total: n, pct: dims?.overall.pct ?? 0, points: g.points, maxPoints: g.maxPoints, pending: g.pending,
      blanks: key.filter((k, i) => k >= 0 && (a[i] === null || a[i] === undefined)).length,
      skills: dims?.skills ?? {}, processes: dims?.processes ?? ({ P1: null, P2: null, P3: null, P4: null }), domains: dims?.domains ?? {},
      standards: sum.cells[id] ?? {}, areas: dims?.areas ?? {}, texts: dims?.texts ?? {},
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const avg = (vals: (number | null | undefined)[]) => { const v = vals.filter((x): x is number => typeof x === "number"); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const totals = graded.map(({ g }) => g.credit.reduce<number>((a, c) => a + (c ?? 0), 0));
  const itemRows: ItemRow[] = items.map((it, i) => {
    const counts = [0, 0, 0, 0];
    let blank = 0, right = 0, scored = 0, pending = 0;
    for (const { a, g } of graded) {
      if (it.kind === "WRITTEN") { const c = g.credit[i]; if (c === null) pending++; else { scored++; right += c; } continue; }
      const x = a[i];
      scored++;
      if (x === null || x === undefined) blank++; else { counts[x]++; if (x === it.answerKey) right++; }
    }
    const wrong = counts.map((c, k) => (k === it.answerKey ? -1 : c));
    const top = Math.max(...wrong);
    const disc = discrimination(totals, graded.map(({ g }) => g.credit[i]));
    const p = pct(right, scored);
    const row = { n: it.n, id: it.id, stem: it.stem, skill: SKILL_BY_CODE.get(it.code)?.name ?? "", code: it.code, process: it.process, standard: it.standard, kind: it.kind, key: it.answerKey, counts, blank, answered: done.length, pct: p, topWrong: it.kind === "MCQ" && top > 0 ? wrong.indexOf(top) : null, topWrongCount: Math.max(0, top), d: disc.d, upper: disc.upper, lower: disc.lower, pending, flags: [] as string[] };
    row.flags = itemFlags({ pct: p, d: disc.d, counts, key: it.answerKey, blank, answered: scored, kind: it.kind });
    return row;
  });
  const roster = classes.reduce((a, c) => { const g = given.find((x) => x.classId === c.id); const who = json<unknown>(g?.studentIds, null); return a + (Array.isArray(who) && who.length ? who.length : c.students.length); }, 0);
  const codes = [...new Set(items.map((x) => x.code))];
  return {
    test: { id: t.id, title: t.title, questions: n, minutes: t.timeLimitMin }, classes: all.map((c) => ({ id: c.id, name: c.name })), classId: classId ?? null,
    taken: students.length, roster, avgPct: avg(students.map((x) => x.pct)), avgPoints: students.length ? Math.round((100 * students.reduce((a, x) => a + x.points, 0)) / students.length) / 100 : null, maxPoints: Math.round(marks.reduce((a, b) => a + b, 0) * 100) / 100,
    pending: students.reduce((a, x) => a + x.pending, 0),
    domains: NAFS_DOMAINS.filter((x) => x.code !== "PIRLS").map((x) => ({ code: x.code, name: x.name, pct: sum.studentDims ? avg(students.map((st) => st.domains[x.code])) : null })).filter((x) => codes.some((c) => SKILL_BY_CODE.get(c)?.domain === x.code)),
    skills: CONTENT_SKILLS.filter((k) => codes.includes(k.code)).map((k) => ({ code: k.code, name: k.name, domain: k.domain, questions: items.filter((x) => x.code === k.code).length, pct: sum.skillRows.find((x) => x.key === k.code)?.pct ?? null, below: students.filter((st) => (st.skills[k.code] ?? 100) < MASTERY_PCT).map((st) => st.name) })),
    processes: PROCESSES.map((p) => ({ code: p, name: PROCESS_NAME[p], questions: items.filter((x) => x.process === p).length, pct: sum.processRows.find((x) => x.key === p)?.pct ?? null })),
    students,
    notTaken: classes.flatMap((c) => { const g = given.find((x) => x.classId === c.id); const who = json<unknown>(g?.studentIds, null); const list = Array.isArray(who) && who.length ? c.students.filter((x) => (who as unknown[]).map(s).includes(x.id)) : c.students; return list.filter((x) => !students.some((st) => st.id === x.id)).map((x) => ({ id: x.id, name: x.name, className: c.name })); }),
    items: itemRows, summary: sum,
  };
}

// ------------------------------------------------------------------ across tests

export interface AcrossReport {
  classes: { id: string; name: string }[]; classId: string | null;
  tests: { id: string; title: string; date: string; taken: number; pct: number | null; questions: number }[];
  students: { id: string; name: string; className: string; tests: number; pct: number | null; n: number; standards: Record<string, StudentStd>; skills: Record<string, number | null>; processes: Record<NafsProcess, number | null>; areas: Record<string, number | null>; texts: Record<string, number | null> }[];
  summary: Summary; pending: number;
}
/** Every NAFS result of the classes (the last 40 tests at most) together: the same views as one test, pooled. */
export async function nafsAcrossReport(repo: Repo, actor: Actor, classId?: string | null, cutsIn?: Partial<Cuts> | null): Promise<AcrossReport> {
  await assertNafs(repo, actor);
  const cuts = cleanCuts(cutsIn?.hi, cutsIn?.lo);
  const all = await nafsClasses(repo, actor);
  const classes = classId ? all.filter((c) => c.id === classId) : all;
  if (classId && !classes.length) throw new ForbiddenError("Class not found.");
  const empty = (): AcrossReport => ({ classes: all.map((c) => ({ id: c.id, name: c.name })), classId: classId ?? null, tests: [], students: [], summary: summarize([], [], classes, cuts, new Map()), pending: 0 });
  if (!classes.length) return empty();
  const rows = await repo.findMany("NafsResult", { classId: { in: classes.map((c) => c.id) }, submittedAt: { not: null } }, { select: ["testId", "classId", "studentId", "answers", "writtenScores", "submittedAt"], orderBy: [{ field: "submittedAt", dir: "desc" }], take: 5000 });
  const testIds = [...new Set(rows.map((r) => s(r.testId)))].slice(0, 40);
  if (!testIds.length) return empty();
  const tests = await repo.findMany("NafsTest", { id: { in: testIds }, schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "title", "questionIds", "marks"] });
  const [idxList, qs, planSkills] = await Promise.all([nafsIndex(repo, actor.schoolId!), loadNafsQuestions(repo, [...new Set(tests.flatMap((t) => json<string[]>(t.questionIds, [])))]), planSkillMap(repo, actor.schoolId!)]);
  const idx = new Map(idxList.map((e) => [e.id, e]));
  const items: ItemMeta[] = [];
  const resp: Resp[] = [];
  let pending = 0;
  const testRows: AcrossReport["tests"] = [];
  for (const t of tests) {
    const ids = json<string[]>(t.questionIds, []);
    const its = itemsOf(s(t.id), ids, qs, idx, json<Record<string, number> | null>(t.marks, null));
    items.push(...its);
    const key = its.map((x) => x.answerKey), marks = its.map((x) => x.mark);
    const mine = rows.filter((r) => r.testId === t.id);
    let sum = 0, n = 0;
    for (const r of mine) {
      const g = gradeAnswers(key, marks, json<Answer[]>(r.answers, []), cleanScores(r.writtenScores, key));
      pending += g.pending;
      resp.push({ studentId: s(r.studentId), classId: s(r.classId), credit: new Map(its.map((it, i) => [it.key, g.credit[i]])) });
      for (const c of g.credit) if (c !== null) { sum += c; n++; }
    }
    const first = mine.map((r) => d(r.submittedAt)!.getTime()).sort((a, b) => a - b)[0];
    testRows.push({ id: s(t.id), title: s(t.title), date: new Date(first).toISOString(), taken: mine.length, pct: roundPct(sum, n), questions: ids.length });
  }
  const sum = summarize(items, resp, classes, cuts, planSkills);
  const nameOf = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, { name: x.name, className: c.name }] as const)));
  const students = [...new Set(resp.map((r) => r.studentId))].map((id) => {
    const dims = sum.studentDims[id];
    return { id, name: nameOf.get(id)?.name ?? "Student", className: nameOf.get(id)?.className ?? "", tests: new Set(rows.filter((r) => s(r.studentId) === id).map((r) => s(r.testId))).size, pct: dims?.overall.pct ?? null, n: dims?.overall.n ?? 0, standards: sum.cells[id] ?? {}, skills: dims?.skills ?? {}, processes: dims?.processes ?? ({ P1: null, P2: null, P3: null, P4: null }), areas: dims?.areas ?? {}, texts: dims?.texts ?? {} };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { classes: all.map((c) => ({ id: c.id, name: c.name })), classId: classId ?? null, tests: testRows.sort((a, b) => a.date.localeCompare(b.date)), students, summary: sum, pending };
}

// ------------------------------------------------------------------ trend and per student

export interface TrendPoint { testId: string; title: string; date: string; taken: number; pct: number | null; processes: Record<NafsProcess, number | null>; standards: Record<string, number | null> }
/** The class across its NAFS tests (oldest first; at most 20 tests). */
export async function nafsTrend(repo: Repo, actor: Actor, classId: string): Promise<TrendPoint[]> {
  await assertNafs(repo, actor);
  const klass = (await nafsClasses(repo, actor)).find((c) => c.id === classId);
  if (!klass) throw new ForbiddenError("Class not found.");
  const rows = await repo.findMany("NafsResult", { classId, submittedAt: { not: null } }, { select: ["testId", "answers", "writtenScores", "submittedAt"], take: 5000 });
  const testIds = [...new Set(rows.map((r) => s(r.testId)))];
  if (!testIds.length) return [];
  const tests = await repo.findMany("NafsTest", { id: { in: testIds }, schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "title", "questionIds", "marks"] });
  const idx = new Map((await nafsIndex(repo, actor.schoolId!)).map((e) => [e.id, e]));
  const allQ = await loadNafsQuestions(repo, [...new Set(tests.flatMap((t) => json<string[]>(t.questionIds, [])))]);
  const out: TrendPoint[] = tests.map((t) => {
    const ids = json<string[]>(t.questionIds, []);
    const its = itemsOf(s(t.id), ids, allQ, idx, json<Record<string, number> | null>(t.marks, null));
    const key = its.map((x) => x.answerKey), marks = its.map((x) => x.mark);
    const mine = rows.filter((r) => r.testId === t.id);
    const first = mine.map((r) => d(r.submittedAt)!.getTime()).sort((a, b) => a - b)[0];
    const resp: Resp[] = mine.map((r) => { const g = gradeAnswers(key, marks, json<Answer[]>(r.answers, []), cleanScores(r.writtenScores, key)); return { studentId: "x", classId, credit: new Map(its.map((it, i) => [it.key, g.credit[i]])) }; });
    const tot = byDim(its, resp, () => "ALL").pooled.get("ALL");
    const pr = byDim(its, resp, (x) => x.process).pooled, st = byDim(its, resp, (x) => x.standard ?? "NONE").pooled;
    return { testId: s(t.id), title: s(t.title), date: new Date(first).toISOString(), taken: mine.length, pct: tot?.pct ?? null, processes: Object.fromEntries(PROCESSES.map((p) => [p, pr.get(p)?.pct ?? null])) as Record<NafsProcess, number | null>, standards: Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, st.get(x.code)?.pct ?? null])) };
  });
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
}

export interface StudentHistory { name: string; className: string; tests: { testId: string; title: string; date: string; pct: number; source: string; pending: number }[]; skills: { code: string; name: string; pct: number | null; questions: number }[]; standards: { code: string; short: string; text: string; pct: number | null; n: number; level: Level }[] }
/** One student's NAFS tests, skills and Ministry standards (all tests together). */
export async function nafsStudentHistory(repo: Repo, actor: Actor, studentId: string, cutsIn?: Partial<Cuts> | null): Promise<StudentHistory> {
  await assertNafs(repo, actor);
  const cuts = cleanCuts(cutsIn?.hi, cutsIn?.lo);
  const klass = (await nafsClasses(repo, actor)).find((c) => c.students.some((x) => x.id === studentId));
  if (!klass) throw new ForbiddenError("This student is not in one of your Grade 6 classes.");
  const rows = await repo.findMany("NafsResult", { studentId, submittedAt: { not: null } }, { select: ["testId", "classId", "answers", "writtenScores", "submittedAt", "source"], take: 200 });
  const tests = rows.length ? await repo.findMany("NafsTest", { id: { in: rows.map((r) => s(r.testId)) }, schoolId: actor.schoolId }, { select: ["id", "title", "questionIds", "marks"] }) : [];
  const idx = new Map((await nafsIndex(repo, actor.schoolId!)).map((e) => [e.id, e]));
  const qs = await loadNafsQuestions(repo, [...new Set(tests.flatMap((t) => json<string[]>(t.questionIds, [])))]);
  const items: ItemMeta[] = [], resp: Resp[] = [];
  const list = rows.flatMap((r) => {
    const t = tests.find((x) => x.id === r.testId);
    if (!t) return [];
    const ids = json<string[]>(t.questionIds, []);
    const its = itemsOf(s(t.id), ids, qs, idx, json<Record<string, number> | null>(t.marks, null));
    items.push(...its);
    const key = its.map((x) => x.answerKey);
    const g = gradeAnswers(key, its.map((x) => x.mark), json<Answer[]>(r.answers, []), cleanScores(r.writtenScores, key));
    resp.push({ studentId, classId: klass.id, credit: new Map(its.map((it, i) => [it.key, g.credit[i]])) });
    const scored = g.credit.filter((c): c is number => c !== null);
    return [{ testId: s(t.id), title: s(t.title), date: d(r.submittedAt)!.toISOString(), pct: roundPct(scored.reduce((a, c) => a + c, 0), scored.length) ?? 0, source: s(r.source), pending: g.pending }];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const sk = byDim(items, resp, (x) => x.code).student.get(studentId) ?? new Map<string, Exact>();
  const st = byDim(items, resp, (x) => x.standard ?? "NONE").student.get(studentId) ?? new Map<string, Exact>();
  return {
    name: klass.students.find((x) => x.id === studentId)!.name, className: klass.name, tests: list,
    skills: CONTENT_SKILLS.filter((k) => sk.has(k.code)).map((k) => ({ code: k.code, name: k.name, pct: sk.get(k.code)!.pct, questions: sk.get(k.code)!.n })),
    standards: MOE_STANDARDS.filter((x) => items.some((i) => i.standard === x.code)).map((x) => { const c = st.get(x.code); return { code: x.code, short: x.short, text: x.text, pct: c?.pct ?? null, n: c?.n ?? 0, level: classify(c?.exact ?? null, c?.n ?? 0, cuts) }; }),
  };
}

// ------------------------------------------------------------------ Excel / PDF (the report engine)

export type ExportView = "test" | "across";
/** The report as a file (xlsx: a sheet per view; pdf: printable): same access as the page; rate-limited and audited. */
export async function exportNafsReport(deps: ReportDeps, actor: Actor, req: { testId?: string | null; classId?: string | null; format: "pdf" | "xlsx"; view?: ExportView; hi?: unknown; lo?: unknown }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  const cuts = cleanCuts(req.hi, req.lo);
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  const me = await repo.findUnique("User", { id: actor.userId });
  const base = { branding, generatedAt: now, generatedBy: String(me?.displayName ?? "") };
  let doc: ReportDoc;
  if (req.view === "across") doc = nafsAcrossDoc(await nafsAcrossReport(repo, actor, req.classId ?? null, cuts), base);
  else {
    if (!req.testId) throw new ForbiddenError("Test not found.");
    doc = nafsReportDoc(await nafsTestReport(repo, actor, req.testId, req.classId ?? null, now, cuts), base);
  }
  let bytes: Uint8Array;
  if (req.format === "pdf") {
    if (!deps.pdf) throw new Error("PDF rendering is not configured.");
    const fonts = loadFonts(deps.fontDir);
    bytes = await deps.pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  } else bytes = renderXlsx(doc);
  await audit(repo, { actorId: actor.userId, action: "report.export", entityType: "NafsTest", entityId: req.testId ?? "across", after: { kind: "nafs", view: req.view ?? "test", format: req.format, classId: req.classId ?? null, bytes: bytes.length }, at: now });
  return { bytes, contentType: CONTENT_TYPES[req.format], filename: `${doc.fileStem}.${req.format}` };
}

const LETTERS = ["A", "B", "C", "D"];
const LEVEL_TONES = { [LEVEL_NAME.MASTERED]: "good", [LEVEL_NAME.DEVELOPING]: "warn", [LEVEL_NAME.SUPPORT]: "bad", [LEVEL_NAME.FEW]: "neutral" } as const;
const cellText = (c: StudentStd | undefined) => (!c ? "—" : c.pct === null ? `— (${c.n})` : `${c.pct}% (${c.n}) ${LEVEL_MARK[c.level]}`);
const slug = (x: string) => x.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "nafs";

/** The views shared by one test and across tests: a sheet each. */
function summarySections(sum: Summary, students: { id: string; name: string; className: string; standards: Record<string, StudentStd> }[]): Section[] {
  const stdCols = sum.standards.map((x) => x.key);
  const notes = [
    ROUNDING_RULE,
    `Levels (teacher-facing only): ${LEVEL_MARK.MASTERED} Mastered from ${sum.cuts.hi}% · ${LEVEL_MARK.DEVELOPING} Developing from ${sum.cuts.lo}% · ${LEVEL_MARK.SUPPORT} Needs support under ${sum.cuts.lo}% · ${LEVEL_MARK.FEW} Not enough questions (fewer than ${MIN_ITEMS} items). Students never see these words.`,
    "Heat map cells: percent correct (number of items behind it) and the level mark — readable in black and white.",
    "Short written answers count once the teacher has scored them with the rubric (2 = full, 1 = half, 0 = none).",
    `Standards: Ministry of Education — NAFS target skills guide (S01–S13).${sum.notSet ? ` ${sum.notSet} question(s) have no standard yet (set it in the Question bank).` : ""}`,
  ];
  return [
    { type: "table", id: "standards", title: "Ministry standards (S01–S13)", sheet: "Standards", empty: "No standard yet.",
      columns: [{ key: "short", label: "Standard", kind: "latin", nowrap: true }, { key: "text", label: "What it measures", kind: "text", width: 3 }, { key: "area", label: "Content area", kind: "text" }, { key: "questions", label: "Questions", kind: "int" }, { key: "pct", label: "Class %", kind: "pct" }, { key: "m", label: "Mastered", kind: "int" }, { key: "dv", label: "Developing", kind: "int" }, { key: "sp", label: "Needs support", kind: "int" }, { key: "few", label: "Not enough questions", kind: "int" }],
      rows: sum.standards.map((x) => ({ short: x.short, text: x.text, area: x.area ? MOE_AREAS.find((a) => a.code === x.area)!.name : "—", questions: x.questions, pct: x.pct, m: x.counts.MASTERED, dv: x.counts.DEVELOPING, sp: x.counts.SUPPORT, few: x.counts.FEW })) },
    { type: "table", id: "heat", title: "Student × standard heat map", sheet: "Heat map", empty: "No results yet.", note: "percent (items) and the level mark",
      columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, ...stdCols.map((c) => ({ key: c, label: MOE_BY_CODE.get(c)!.short, kind: "text" as const, nowrap: true }))],
      rows: students.map((x) => ({ name: x.name, className: x.className, ...Object.fromEntries(stdCols.map((c) => [c, cellText(x.standards[c])])) })) },
    { type: "table", id: "levels", title: "Each student per standard", sheet: "Levels", empty: "No results yet.",
      columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, ...stdCols.map((c) => ({ key: c, label: MOE_BY_CODE.get(c)!.short, kind: "text" as const, tones: LEVEL_TONES as Column["tones"] }))],
      rows: students.map((x) => ({ name: x.name, className: x.className, ...Object.fromEntries(stdCols.map((c) => [c, x.standards[c] ? LEVEL_NAME[x.standards[c].level] : "—"])) })) },
    { type: "table", id: "areas", title: "Content areas", sheet: "Content areas", empty: "—", columns: [{ key: "name", label: "Content area", kind: "text", width: 2 }, { key: "questions", label: "Questions", kind: "int" }, { key: "pct", label: "Class %", kind: "pct" }], rows: sum.areas.map((x) => ({ name: x.name, questions: x.questions, pct: x.pct })) },
    { type: "table", id: "texts", title: "Text types", sheet: "Text types", empty: "—", columns: [{ key: "name", label: "Text type", kind: "text", width: 2 }, { key: "questions", label: "Questions", kind: "int" }, { key: "pct", label: "Class %", kind: "pct" }], rows: sum.texts.map((x) => ({ name: x.name, questions: x.questions, pct: x.pct })) },
    { type: "table", id: "skills", title: "NAFS skills", sheet: "NAFS skills", empty: "—", columns: [{ key: "name", label: "Skill", kind: "text", width: 2 }, { key: "questions", label: "Questions", kind: "int" }, { key: "pct", label: "Class %", kind: "pct" }], rows: sum.skillRows.map((x) => ({ name: x.name, questions: x.questions, pct: x.pct })) },
    { type: "table", id: "processes", title: "PIRLS reading processes", sheet: "PIRLS", empty: "—", columns: [{ key: "code", label: "Process", kind: "latin", nowrap: true }, { key: "name", label: "Name", kind: "text", width: 2 }, { key: "questions", label: "Questions", kind: "int" }, { key: "pct", label: "Class %", kind: "pct" }], rows: sum.processRows.map((x) => ({ code: x.key, name: x.name, questions: x.questions, pct: x.pct })) },
    { type: "table", id: "groups", title: "Groups needing support per standard", sheet: "Groups", empty: "No student needs support on a standard.",
      columns: [{ key: "short", label: "Standard", kind: "latin", nowrap: true }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "support", label: "Needs support", kind: "text", width: 3 }, { key: "developing", label: "Developing", kind: "text", width: 3 }],
      rows: sum.groups.flatMap((g) => g.classes.map((c) => ({ short: g.short, className: c.className, support: c.support.map((x) => x.name).join(", ") || "—", developing: c.developing.map((x) => x.name).join(", ") || "—" }))) },
    { type: "table", id: "compare", title: "Classes compared", sheet: "Classes", empty: "—",
      columns: [{ key: "name", label: "Class", kind: "latin", nowrap: true }, { key: "taken", label: "Students", kind: "int" }, { key: "pct", label: "Overall", kind: "pct" }, ...stdCols.map((c) => ({ key: c, label: MOE_BY_CODE.get(c)!.short, kind: "pct" as const, nowrap: true }))],
      rows: sum.classCompare.map((c) => ({ name: c.name, taken: c.taken, pct: c.pct, ...c.standards })) },
    { type: "notes", title: "How to read this report", items: notes },
  ];
}

export function nafsReportDoc(r: NafsReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const scope = r.classId ? r.classes.find((c) => c.id === r.classId)?.name ?? "" : "All my Grade 6 classes";
  const sum = r.summary;
  const name = (code: string) => MOE_BY_CODE.get(code)?.short ?? code;
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "nafs", title: `${r.test.title} — NAFS results`, subtitle: scope, primaryTable: "students", fileStem: `nafs_${slug(r.test.title)}_${slug(scope)}`,
    meta: [{ label: "Test", value: r.test.title, isolate: "auto" }, { label: "Group", value: scope, isolate: "auto" }, { label: "Questions", value: String(r.test.questions) }, { label: "Cut-offs", value: `${sum.cuts.hi}% / ${sum.cuts.lo}%` }],
    sections: [
      { type: "kpis", title: "Summary", items: [
        { label: "Taken", value: `${r.taken} / ${r.roster}`, kind: "latin", glance: true }, { label: "Average", value: r.avgPct, kind: "pct", glance: true, hint: "share of questions answered correctly" },
        { label: "Average marks", value: r.avgPoints === null ? "—" : `${r.avgPoints} / ${r.maxPoints}`, kind: "latin" },
        { label: "Strongest standards", value: sum.strongest.map(name).join(" · ") || "—", kind: "latin", glance: true }, { label: "Weakest standards", value: sum.weakest.map(name).join(" · ") || "—", kind: "latin", glance: true },
        { label: "Written answers to mark", value: r.pending, kind: "int" },
      ] },
      { type: "bars", title: "Ministry standards", items: sum.standards.map((x) => ({ label: x.short, value: x.pct ?? 0, isolate: "latin" as const })), max: 100, kind: "pct" },
      { type: "table", id: "students", title: "Students", sheet: "Students", empty: "No results yet.",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2.2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "pct", label: "Score", kind: "pct" }, { key: "marks", label: "Marks", kind: "latin", nowrap: true }, { key: "pending", label: "To mark", kind: "int" },
          ...PROCESSES.map((p) => ({ key: p, label: p, kind: "pct" as const, nowrap: true })), ...MOE_AREAS.map((a) => ({ key: `area_${a.code}`, label: a.name, kind: "pct" as const })), { key: "INFO", label: "Informational", kind: "pct" as const }, { key: "LIT", label: "Literary", kind: "pct" as const }, { key: "source", label: "From", kind: "text" as const }],
        rows: r.students.map((x) => ({ name: x.name, className: x.className, pct: x.pct, marks: `${x.points} / ${x.maxPoints}`, pending: x.pending, ...x.processes, ...Object.fromEntries(MOE_AREAS.map((a) => [`area_${a.code}`, x.areas[a.code] ?? null])), INFO: x.texts.INFO ?? null, LIT: x.texts.LIT ?? null, source: x.source === "ONLINE" ? "Online" : x.source === "SHEET" ? "Bubble sheet" : "Typed" })) },
      ...summarySections(sum, r.students),
      { type: "table", id: "items", title: "Item analysis", sheet: "Items", empty: "—", note: "% correct, discrimination D = upper 27% − lower 27%, the most chosen wrong option, flags to review.",
        columns: [{ key: "n", label: "#", kind: "int", width: 0.4 }, { key: "standard", label: "Standard", kind: "latin", nowrap: true }, { key: "skill", label: "Skill", kind: "text" }, { key: "process", label: "Process", kind: "latin" }, { key: "key", label: "Key", kind: "latin" }, { key: "pct", label: "Correct", kind: "pct" }, { key: "d", label: "D", kind: "dec" }, { key: "A", label: "A", kind: "int" }, { key: "B", label: "B", kind: "int" }, { key: "C", label: "C", kind: "int" }, { key: "D", label: "D (option)", kind: "int" }, { key: "blank", label: "Blank", kind: "int" }, { key: "top", label: "Most chosen wrong", kind: "latin" }, { key: "flags", label: "Review", kind: "text", width: 2.5 }, { key: "stem", label: "Question", kind: "text", width: 3 }],
        rows: r.items.map((x): TableRow => ({ n: x.n, standard: x.standard ? name(x.standard) : "—", skill: x.skill, process: x.process, key: x.kind === "WRITTEN" ? "Written" : LETTERS[x.key] ?? "—", pct: x.pct, d: x.d, A: x.counts[0], B: x.counts[1], C: x.counts[2], D: x.counts[3], blank: x.blank, top: x.topWrong === null ? "—" : `${LETTERS[x.topWrong]} (${x.topWrongCount})`, flags: x.flags.join("; ") || "—", stem: x.stem })) },
      { type: "table", id: "missing", title: "Not taken yet", sheet: "Not taken", empty: "Everyone has taken the test.", columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin" }], rows: r.notTaken.map((x) => ({ name: x.name, className: x.className })) },
    ],
  };
}

export function nafsAcrossDoc(r: AcrossReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const scope = r.classId ? r.classes.find((c) => c.id === r.classId)?.name ?? "" : "All my Grade 6 classes";
  const sum = r.summary;
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "nafs", title: "NAFS results across tests", subtitle: scope, primaryTable: "students", fileStem: `nafs_across_${slug(scope)}`,
    meta: [{ label: "Group", value: scope, isolate: "auto" }, { label: "Tests", value: String(r.tests.length) }, { label: "Cut-offs", value: `${sum.cuts.hi}% / ${sum.cuts.lo}%` }],
    sections: [
      { type: "table", id: "tests", title: "Trend across tests", sheet: "Trend", empty: "No results yet.", columns: [{ key: "title", label: "Test", kind: "text", width: 2.5 }, { key: "date", label: "Date", kind: "date" }, { key: "taken", label: "Taken", kind: "int" }, { key: "questions", label: "Questions", kind: "int" }, { key: "pct", label: "Class %", kind: "pct" }], rows: r.tests.map((x) => ({ title: x.title, date: x.date.slice(0, 10), taken: x.taken, questions: x.questions, pct: x.pct })) },
      { type: "table", id: "students", title: "Students (all tests)", sheet: "Students", empty: "No results yet.",
        columns: [{ key: "name", label: "Student", kind: "name", width: 2.2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "tests", label: "Tests", kind: "int" }, { key: "pct", label: "Overall", kind: "pct" }, { key: "n", label: "Items", kind: "int" }, ...PROCESSES.map((p) => ({ key: p, label: p, kind: "pct" as const, nowrap: true })), ...MOE_AREAS.map((a) => ({ key: `area_${a.code}`, label: a.name, kind: "pct" as const })), { key: "INFO", label: "Informational", kind: "pct" as const }, { key: "LIT", label: "Literary", kind: "pct" as const }],
        rows: r.students.map((x) => ({ name: x.name, className: x.className, tests: x.tests, pct: x.pct, n: x.n, ...x.processes, ...Object.fromEntries(MOE_AREAS.map((a) => [`area_${a.code}`, x.areas[a.code] ?? null])), INFO: x.texts.INFO ?? null, LIT: x.texts.LIT ?? null })) },
      ...summarySections(sum, r.students),
    ],
  };
}

export type { NafsClass };
