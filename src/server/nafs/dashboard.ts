/**
 * 🇸🇦 NAFS DASHBOARD (teacher and admin, inside the NAFS center only): a tool to follow up and improve every student.
 * Data = the NAFS tables ONLY (NafsTest / NafsResult / NafsPractice / NafsPracticeAnswer / NafsPracticeRun) — never
 * ReadRise, never the platform's mastery or levels; no grade split.
 *   1. overview: students, tests taken, practice sessions, average score, the change from the previous test, written
 *      answers waiting for marking
 *   2. skills analysis for each Ministry standard (S01–S13), NAFS skill and PIRLS process: % correct in tests and in
 *      practice, items answered, the trend attempt by attempt, by difficulty (Easy / Medium / Hard), the most-missed
 *      question and its most-chosen wrong option; the students × standards heat map
 *   3. attempt-to-attempt comparison (class and student): every test and practice in date order, the score per standard
 *      on each, the change from the previous attempt and from the first; tests vs practice ("did practice on a standard
 *      improve the next test on it?")
 *   4. student groups (TEACHER-FACING words only, cut-offs in NAFS_GROUPS) from each student's latest test, groups by
 *      weakest standard, one-click actions (adaptive practice / a test on these standards, prefilled) and movement
 *   5. one student's drill-down; 6. Excel / PDF; 7. the admin's school view (classes compared on every standard)
 * Fast: a fixed number of bounded reads (results, tests, practices, practice answers, question keys in batches of
 * 400) — never one read per student; every read of a NAFS table goes through safeIfBehind (an update not pushed
 * shows an empty dashboard, not an error).
 * Percentages: exact counts, rounded at the end (halves up) — the same rule as NAFS Reports.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertNafs } from "../teacher/nafs-access";
import { safeIfBehind } from "../db/schema-errors";
import type { ReportDoc, Section } from "../../reports/model";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import { renderXlsx } from "../../reports/xlsx";
import { audit } from "../audit";
import { sweptMap } from "../cache/idle";
import { consumeRateLimit } from "../auth/rate-limit";
import { CONTENT_TYPES, loadBranding, RateLimitedError, REPORT_RATE, type ReportDeps } from "../reports/service";
import { CONTENT_SKILLS, DIFFICULTIES, DIFFICULTY_NAME, isMoeCode, isNafsCode, MOE_BY_CODE, MOE_STANDARDS, PROCESS_NAME, PROCESSES, SKILL_BY_CODE, type Difficulty, type NafsProcess } from "./framework";
import { nafsIndex, WRITTEN_TYPE, type NafsEntry } from "./bank";
import { cleanScores, gradeAnswers, json, markOf, nafsClasses, type Answer, type NafsClass } from "./tests";
import { roundPct } from "./reports";
import type { RunState } from "./practice";

const s = (v: unknown) => String(v ?? "");
const ms = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const t = (v instanceof Date ? v : new Date(String(v))).getTime(); return Number.isFinite(t) ? t : null; };

// ------------------------------------------------------------------ the teacher-facing groups (ONE place to change)

export type GroupKey = "EXCEEDING" | "MEETING" | "APPROACHING" | "SUPPORT";
/**
 * Student groups by overall NAFS performance on the latest test (whole percents): Exceeding ≥ 85 · Meeting 65–84 ·
 * Approaching 45–64 · Needs support < 45. TEACHER-FACING words only — students never see them. Highest first.
 */
export const NAFS_GROUPS: { key: GroupKey; name: string; min: number }[] = [
  { key: "EXCEEDING", name: "Exceeding", min: 85 },
  { key: "MEETING", name: "Meeting", min: 65 },
  { key: "APPROACHING", name: "Approaching", min: 45 },
  { key: "SUPPORT", name: "Needs support", min: 0 },
];
export const GROUP_NAME = Object.fromEntries(NAFS_GROUPS.map((g) => [g.key, g.name])) as Record<GroupKey, string>;
/** A standard under this (the Meeting cut-off) is a weak standard of the student. */
export const WEAK_BELOW = NAFS_GROUPS.find((g) => g.key === "MEETING")!.min;
/** Fewer answered items than this on a standard: not enough to call it weak or strong. */
export const MIN_STD_ITEMS = 2;
const RANK: Record<GroupKey, number> = Object.fromEntries(NAFS_GROUPS.map((g, i) => [g.key, NAFS_GROUPS.length - i])) as Record<GroupKey, number>;
export function groupOf(pct: number | null | undefined): GroupKey | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  for (const g of NAFS_GROUPS) if (pct >= g.min) return g.key;
  return "SUPPORT";
}
/** +1 moved up a group, −1 down, 0 the same (or nothing to compare). */
export const movementOf = (from: GroupKey | null, to: GroupKey | null): -1 | 0 | 1 => (!from || !to ? 0 : Math.sign(RANK[to] - RANK[from]) as -1 | 0 | 1);

// ------------------------------------------------------------------ the date range

export interface Range { from: string | null; to: string | null }
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** YYYY-MM-DD dates (both optional, inclusive); swapped when the wrong way round; anything else ignored. */
export function cleanRange(from: unknown, to: unknown): Range {
  const f = DAY.test(s(from)) && Number.isFinite(Date.parse(s(from))) ? s(from) : null;
  const t = DAY.test(s(to)) && Number.isFinite(Date.parse(s(to))) ? s(to) : null;
  return f && t && f > t ? { from: t, to: f } : { from: f, to: t };
}
const inRange = (r: Range) => { const lo = r.from ? Date.parse(`${r.from}T00:00:00Z`) : -Infinity, hi = r.to ? Date.parse(`${r.to}T00:00:00Z`) + 86_400_000 : Infinity; return (t: number) => t >= lo && t < hi; };

// ------------------------------------------------------------------ prefilled actions

const many = (k: string, list: string[]) => list.map((v) => [k, v] as [string, string]);
/** "Assign adaptive practice on these standards": the Adaptive tab (Practice), prefilled (class, standards, students). */
export function practiceHref(classId: string, codes: string[], studentIds: string[] = []): string {
  return `/teacher/nafs?${new URLSearchParams([["tab", "adaptive"], ["class", classId], ...many("target", codes), ...many("sid", studentIds)])}#give`;
}
/** "Make a test on these standards": the ONE test builder (start: standards I choose), prefilled with them and the class. */
export function testHref(classId: string, codes: string[]): string {
  return `/teacher/nafs/tests/new?${new URLSearchParams([["start", "CHOOSE"], ["class", classId], ["codes", codes.join(",")]])}`;
}
export const studentHref = (studentId: string, r?: Range | null) => `/teacher/nafs/students/${encodeURIComponent(studentId)}${r && (r.from || r.to) ? `?${new URLSearchParams([...(r.from ? [["from", r.from]] : []), ...(r.to ? [["to", r.to]] : [])])}` : ""}`;

// ------------------------------------------------------------------ the raw observations (one per answered item)

export type Kind = "TEST" | "PRACTICE";
interface Obs { sid: string; cid: string; kind: Kind; aid: string; qid: string; std: string | null; skill: string; proc: NafsProcess; dif: Difficulty; credit: number | null; wrong: number | null; at: number }
interface Acc { sum: number; n: number }
const pctOf = (a: Acc | undefined) => (a ? roundPct(a.sum, a.n) : null);
const addTo = (m: Map<string, Acc>, k: string, c: number) => { const a = m.get(k) ?? { sum: 0, n: 0 }; a.sum += c; a.n++; m.set(k, a); };

/** Caps: the newest results / practice answers / tests (a school year of a big school fits easily). */
export const MAX_RESULTS = 3000;
export const MAX_ANSWERS = 20000;
export const MAX_TESTS = 40;
export const MAX_PRACTICES = 300;

interface Loaded {
  obs: Obs[]; titles: Map<string, string>; stems: Map<string, string>; waiting: number;
  /** per student: the practice runs (state, seconds) — the drill-down only */
  runs: Row[];
}

/** Keys (A–D index, −1 written), stems: Question + QuestionOption in batches of 400. */
async function keysOf(repo: Repo, ids: string[]): Promise<{ key: Map<string, number>; stem: Map<string, string> }> {
  const key = new Map<string, number>(), stem = new Map<string, string>();
  if (!ids.length) return { key, stem };
  const written = await repo.findUnique("QuestionType", { code: WRITTEN_TYPE });
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const [qs, opts] = await Promise.all([
      repo.findMany("Question", { id: { in: chunk } }, { select: ["id", "stem", "typeId"] }),
      repo.findMany("QuestionOption", { questionId: { in: chunk } }, { select: ["questionId", "isCorrect", "order"] }),
    ]);
    const byQ = new Map<string, Row[]>();
    for (const o of opts) { const l = byQ.get(s(o.questionId)) ?? []; l.push(o); byQ.set(s(o.questionId), l); }
    for (const q of qs) {
      const id = s(q.id);
      stem.set(id, s(q.stem).replace(/\s+/g, " ").trim().slice(0, 160));
      if (written && s(q.typeId) === s(written.id)) { key.set(id, -1); continue; }
      const o = (byQ.get(id) ?? []).sort((a, b) => Number(a.order) - Number(b.order));
      key.set(id, Math.max(0, o.findIndex((x) => x.isCorrect === true || x.isCorrect === 1 || x.isCorrect === "1" || x.isCorrect === "true")));
    }
  }
  return { key, stem };
}

async function load(repo: Repo, schoolId: string, classIds: string[], range: Range, studentId: string | null): Promise<Loaded> {
  const empty: Loaded = { obs: [], titles: new Map(), stems: new Map(), waiting: 0, runs: [] };
  if (!classIds.length) return empty;
  const ok = inRange(range);
  const who = studentId ? { studentId } : {};
  const [results, practices] = await Promise.all([
    safeIfBehind("nafs.dashboard", repo.findMany("NafsResult", { classId: { in: classIds }, submittedAt: { not: null }, ...who }, { select: ["testId", "classId", "studentId", "answers", "writtenScores", "submittedAt"], orderBy: [{ field: "submittedAt", dir: "desc" }], take: MAX_RESULTS }), [] as Row[]),
    safeIfBehind("nafs.dashboard", repo.findMany("NafsPractice", { schoolId, classId: { in: classIds }, deletedAt: null }, { select: ["id", "title", "classId", "targets"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_PRACTICES }), [] as Row[]),
  ]);
  const testIds = [...new Set(results.map((r) => s(r.testId)))].slice(0, MAX_TESTS);
  const pIds = practices.map((p) => s(p.id));
  const [tests, answers, idxList, runs] = await Promise.all([
    testIds.length ? safeIfBehind("nafs.dashboard", repo.findMany("NafsTest", { id: { in: testIds }, schoolId, deletedAt: null }, { select: ["id", "title", "questionIds", "marks"] }), [] as Row[]) : Promise.resolve([] as Row[]),
    pIds.length ? safeIfBehind("nafs.dashboard", repo.findMany("NafsPracticeAnswer", { practiceId: { in: pIds }, ...who }, { select: ["practiceId", "studentId", "questionId", "target", "difficulty", "choice", "correct", "at"], orderBy: [{ field: "at", dir: "desc" }], take: MAX_ANSWERS }), [] as Row[]) : Promise.resolve([] as Row[]),
    nafsIndex(repo, schoolId).catch(() => [] as NafsEntry[]),
    studentId && pIds.length ? safeIfBehind("nafs.dashboard", repo.findMany("NafsPracticeRun", { practiceId: { in: pIds }, studentId }, { select: ["practiceId", "state", "asked", "correct", "seconds", "startedAt", "finishedAt"] }), [] as Row[]) : Promise.resolve([] as Row[]),
  ]);
  const idx = new Map(idxList.map((e) => [e.id, e]));
  const testQ = [...new Set(tests.flatMap((t) => json<string[]>(t.questionIds, [])))];
  const { key: keys, stem: stems } = await keysOf(repo, testQ);
  const titles = new Map<string, string>([...tests.map((t) => [`TEST:${s(t.id)}`, s(t.title)] as [string, string]), ...practices.map((p) => [`PRACTICE:${s(p.id)}`, s(p.title)] as [string, string])]);
  const obs: Obs[] = [];
  let waiting = 0;
  const meta = (qid: string, fallback: string | null) => {
    const e = idx.get(qid);
    const t = fallback ?? "";
    const skill = e?.nafsCode ?? (isNafsCode(t) ? t : "NAFS.RC.MAIN");
    return { std: e?.standard ?? (isMoeCode(t) ? t : null), skill, proc: e?.process ?? SKILL_BY_CODE.get(skill)?.process ?? "P1", dif: e?.difficulty ?? 2 as Difficulty };
  };
  const byTest = new Map(tests.map((t) => [s(t.id), t]));
  for (const r of results) {
    const t = byTest.get(s(r.testId));
    if (!t) continue;
    const ids = json<string[]>(t.questionIds, []);
    const marks = json<Record<string, number> | null>(t.marks, null);
    const key = ids.map((id) => keys.get(id) ?? 0);
    const a = json<Answer[]>(r.answers, []);
    const g = gradeAnswers(key, ids.map((id) => markOf(marks, id)), ids.map((_x, i) => a[i] ?? null), cleanScores(r.writtenScores, key));
    waiting += g.pending;
    const at = ms(r.submittedAt);
    if (at === null || !ok(at)) continue;
    ids.forEach((qid, i) => {
      const m = meta(qid, null);
      const ch = a[i];
      obs.push({ sid: s(r.studentId), cid: s(r.classId), kind: "TEST", aid: s(t.id), qid, ...m, credit: g.credit[i], wrong: key[i] >= 0 && ch !== null && ch !== undefined && ch !== key[i] ? ch : null, at });
    });
  }
  const pClass = new Map(practices.map((p) => [s(p.id), s(p.classId)]));
  for (const x of answers) {
    const at = ms(x.at);
    if (at === null || !ok(at)) continue;
    const right = x.correct === true || x.correct === 1 || x.correct === "1" || x.correct === "true";
    const qid = s(x.questionId);
    const m = meta(qid, s(x.target));
    const dif = [1, 2, 3].includes(Number(x.difficulty)) ? (Number(x.difficulty) as Difficulty) : m.dif;
    const ch = x.choice === null || x.choice === undefined || x.choice === "" ? null : Number(x.choice);
    obs.push({ sid: s(x.studentId), cid: pClass.get(s(x.practiceId)) ?? "", kind: "PRACTICE", aid: s(x.practiceId), qid, ...m, dif, credit: right ? 1 : 0, wrong: !right && ch !== null && Number.isInteger(ch) && ch >= 0 && ch <= 3 ? ch : null, at });
  }
  // stems of practice questions only for the most-missed lists (filled lazily below)
  return { obs, titles, stems, waiting, runs };
}

/** Stems of practice questions that made a most-missed list (one bounded read). */
async function fillStems(repo: Repo, stems: Map<string, string>, ids: string[]): Promise<void> {
  const need = [...new Set(ids)].filter((id) => !stems.has(id)).slice(0, 400);
  if (!need.length) return;
  for (const q of await repo.findMany("Question", { id: { in: need } }, { select: ["id", "stem"] })) stems.set(s(q.id), s(q.stem).replace(/\s+/g, " ").trim().slice(0, 160));
}

// ------------------------------------------------------------------ attempts (a test result / a practice of one student)

export interface AttemptRow {
  kind: Kind; id: string; title: string; date: string; students: number; pct: number | null; n: number;
  standards: Record<string, number | null>;
  /** change of the overall % from the previous attempt / the first (null for the first) */
  dPrev: number | null; dFirst: number | null;
  stdPrev: Record<string, number | null>; stdFirst: Record<string, number | null>;
}
interface AttemptAcc { kind: Kind; aid: string; at: number; all: Acc; std: Map<string, Acc>; students: Set<string> }
function attemptsOf(obs: Obs[], titles: Map<string, string>, keyOf: (o: Obs) => string): AttemptRow[] {
  const m = new Map<string, AttemptAcc>();
  for (const o of obs) {
    if (o.credit === null) continue;
    const k = keyOf(o);
    const a = m.get(k) ?? { kind: o.kind, aid: o.aid, at: o.at, all: { sum: 0, n: 0 }, std: new Map(), students: new Set() };
    a.at = Math.min(a.at, o.at); a.all.sum += o.credit; a.all.n++; a.students.add(o.sid);
    if (o.std) addTo(a.std, o.std, o.credit);
    m.set(k, a);
  }
  const list = [...m.values()].sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
  const rows: AttemptRow[] = list.map((a) => ({
    kind: a.kind, id: a.aid, title: titles.get(`${a.kind}:${a.aid}`) ?? "", date: new Date(a.at).toISOString(), students: a.students.size, pct: pctOf(a.all), n: a.all.n,
    standards: Object.fromEntries(MOE_STANDARDS.filter((x) => a.std.has(x.code)).map((x) => [x.code, pctOf(a.std.get(x.code))])), dPrev: null, dFirst: null, stdPrev: {}, stdFirst: {},
  }));
  const diff = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || b === null || b === undefined ? null : a - b);
  rows.forEach((r, i) => {
    if (i === 0) return;
    r.dPrev = diff(r.pct, rows[i - 1].pct); r.dFirst = diff(r.pct, rows[0].pct);
    for (const code of Object.keys(r.standards)) {
      // per standard: the previous / first attempt that had this standard
      const prev = [...rows.slice(0, i)].reverse().find((x) => x.standards[code] !== undefined);
      const first = rows.slice(0, i).find((x) => x.standards[code] !== undefined);
      r.stdPrev[code] = prev ? diff(r.standards[code], prev.standards[code]) : null;
      r.stdFirst[code] = first ? diff(r.standards[code], first.standards[code]) : null;
    }
  });
  return rows;
}

// ------------------------------------------------------------------ skills analysis

export type DimKind = "STANDARD" | "SKILL" | "PROCESS";
export interface Missed { id: string; stem: string; answered: number; pct: number | null; topWrong: number | null; topWrongCount: number; standard: string | null; kinds: Kind[] }
export interface SkillRow {
  kind: DimKind; key: string; short: string; name: string;
  testPct: number | null; testN: number; practicePct: number | null; practiceN: number; pct: number | null; items: number;
  byDifficulty: Record<Difficulty, { pct: number | null; n: number }>;
  /** the class attempt by attempt (date order; only the attempts that had this standard / skill / process) */
  trend: { kind: Kind; title: string; date: string; pct: number | null }[];
  missed: Missed | null;
}
function missedOf(obs: Obs[], stems: Map<string, string>): Missed[] {
  const m = new Map<string, { acc: Acc; wrong: number[]; std: string | null; kinds: Set<Kind> }>();
  for (const o of obs) {
    if (o.credit === null) continue;
    const x = m.get(o.qid) ?? { acc: { sum: 0, n: 0 }, wrong: [0, 0, 0, 0], std: o.std, kinds: new Set<Kind>() };
    x.acc.sum += o.credit; x.acc.n++; x.kinds.add(o.kind);
    if (o.wrong !== null) x.wrong[o.wrong]++;
    m.set(o.qid, x);
  }
  return [...m].filter(([, x]) => x.acc.n >= 2 && x.acc.sum < x.acc.n).map(([id, x]) => {
    const top = Math.max(...x.wrong);
    return { id, stem: stems.get(id) ?? "", answered: x.acc.n, pct: pctOf(x.acc), topWrong: top > 0 ? x.wrong.indexOf(top) : null, topWrongCount: top, standard: x.std, kinds: [...x.kinds].sort() };
  }).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.answered - a.answered || a.id.localeCompare(b.id));
}
function skillRows(kind: DimKind, keys: { key: string; short: string; name: string }[], dim: (o: Obs) => string | null, obs: Obs[], classAttempts: { kind: Kind; aid: string; title: string; date: string }[], stems: Map<string, string>): SkillRow[] {
  const by = new Map<string, Obs[]>();
  for (const o of obs) { const k = dim(o); if (!k || o.credit === null) continue; const l = by.get(k) ?? []; l.push(o); by.set(k, l); }
  return keys.filter((k) => by.has(k.key)).map((k) => {
    const list = by.get(k.key)!;
    const t: Acc = { sum: 0, n: 0 }, p: Acc = { sum: 0, n: 0 };
    const dif = new Map<string, Acc>(), att = new Map<string, Acc>();
    for (const o of list) {
      const a = o.kind === "TEST" ? t : p; a.sum += o.credit!; a.n++;
      addTo(dif, String(o.dif), o.credit!); addTo(att, `${o.kind}:${o.aid}`, o.credit!);
    }
    return {
      kind, key: k.key, short: k.short, name: k.name, testPct: pctOf(t), testN: t.n, practicePct: pctOf(p), practiceN: p.n, pct: roundPct(t.sum + p.sum, t.n + p.n), items: t.n + p.n,
      byDifficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, { pct: pctOf(dif.get(String(d))), n: dif.get(String(d))?.n ?? 0 }])) as SkillRow["byDifficulty"],
      trend: classAttempts.filter((a) => att.has(`${a.kind}:${a.aid}`)).map((a) => ({ kind: a.kind, title: a.title, date: a.date, pct: pctOf(att.get(`${a.kind}:${a.aid}`)) })),
      missed: missedOf(list, stems)[0] ?? null,
    };
  });
}
const STD_KEYS = MOE_STANDARDS.map((x) => ({ key: x.code, short: x.short, name: x.text }));
const SKILL_KEYS = CONTENT_SKILLS.map((k) => ({ key: k.code, short: k.name, name: k.name }));
const PROC_KEYS = PROCESSES.map((p) => ({ key: p, short: p, name: PROCESS_NAME[p] }));

// ------------------------------------------------------------------ per student

interface StudentAgg { all: Acc; std: Map<string, Acc>; tests: AttemptRow[]; attempts: AttemptRow[] }
function perStudent(obs: Obs[], titles: Map<string, string>): Map<string, StudentAgg> {
  const by = new Map<string, Obs[]>();
  for (const o of obs) { const l = by.get(o.sid) ?? []; l.push(o); by.set(o.sid, l); }
  const out = new Map<string, StudentAgg>();
  for (const [sid, list] of by) {
    const all: Acc = { sum: 0, n: 0 }, std = new Map<string, Acc>();
    for (const o of list) { if (o.credit === null) continue; all.sum += o.credit; all.n++; if (o.std) addTo(std, o.std, o.credit); }
    const attempts = attemptsOf(list, titles, (o) => `${o.kind}:${o.aid}`);
    out.set(sid, { all, std, attempts, tests: attempts.filter((a) => a.kind === "TEST") });
  }
  return out;
}
/** The student's weak standards (under WEAK_BELOW with enough items), weakest first. */
const weakOf = (a: StudentAgg | undefined): string[] => (a ? [...a.std].filter(([, x]) => x.n >= MIN_STD_ITEMS && (roundPct(x.sum, x.n) ?? 100) < WEAK_BELOW).sort((x, y) => x[1].sum / x[1].n - y[1].sum / y[1].n || x[0].localeCompare(y[0])).map(([k]) => k) : []);
/** What to work on: the weak standards, or (none weak) the two lowest with enough items. */
const focusOf = (a: StudentAgg | undefined): string[] => { const w = weakOf(a); if (w.length || !a) return w; return [...a.std].filter(([, x]) => x.n >= MIN_STD_ITEMS).sort((x, y) => x[1].sum / x[1].n - y[1].sum / y[1].n || x[0].localeCompare(y[0])).slice(0, 2).map(([k]) => k); };
const topCodes = (lists: string[][], n = 4) => { const c = new Map<string, number>(); for (const l of lists) for (const k of l) c.set(k, (c.get(k) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k); };

// ------------------------------------------------------------------ the dashboard

export interface GroupStudent { id: string; name: string; pct: number | null; prevPct: number | null; move: -1 | 0 | 1; weak: string[] }
export interface DashGroup { key: GroupKey; name: string; min: number; max: number | null; count: number; classes: { classId: string; className: string; students: GroupStudent[]; weak: string[]; practiceHref: string; testHref: string }[] }
export interface Dashboard {
  scope: { classId: string | null; classes: { id: string; name: string; students: number }[]; range: Range; admin: boolean };
  overview: { students: number; tested: number; testsTaken: number; tests: number; practiceSessions: number; practiceAnswers: number; avgScore: number | null; practicePct: number | null; trend: { delta: number; latest: { title: string; pct: number | null }; previous: { title: string; pct: number | null } } | null; waiting: number };
  standards: SkillRow[]; skills: SkillRow[]; processes: SkillRow[];
  missed: Missed[];
  heat: { codes: string[]; students: { id: string; name: string; className: string; pct: number | null; n: number; cells: Record<string, { pct: number | null; n: number }> }[] };
  attempts: AttemptRow[];
  practiceEffect: { code: string; short: string; practised: { delta: number | null; pairs: number }; notPractised: { delta: number | null; pairs: number } }[];
  students: { id: string; name: string; className: string; attempts: number; first: number | null; prev: number | null; latest: number | null; dPrev: number | null; dFirst: number | null }[];
  groups: DashGroup[];
  noTest: { id: string; name: string; className: string }[];
  weakest: { code: string; short: string; text: string; count: number; classes: { classId: string; className: string; students: { id: string; name: string; pct: number | null }[]; practiceHref: string; testHref: string }[] }[];
  movement: { up: { id: string; name: string; className: string; from: GroupKey; to: GroupKey; fromPct: number | null; toPct: number | null }[]; down: { id: string; name: string; className: string; from: GroupKey; to: GroupKey; fromPct: number | null; toPct: number | null }[]; same: number };
  school: { classes: { id: string; name: string; students: number; tested: number; testPct: number | null; practicePct: number | null; standards: Record<string, { test: number | null; practice: number | null }>; members: { id: string; name: string; latest: number | null; group: GroupKey | null; practiceN: number }[] }[] };
}

const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/** The NAFS dashboard of one Grade 6 class or all the actor's Grade 6 classes (an admin: the whole school). */
export async function nafsDashboard(repo: Repo, actor: Actor, opts: { classId?: string | null; from?: unknown; to?: unknown } = {}): Promise<Dashboard> {
  await assertNafs(repo, actor);
  const range = cleanRange(opts.from, opts.to);
  const all = await nafsClasses(repo, actor);
  const classes = opts.classId ? all.filter((c) => c.id === opts.classId) : all;
  if (opts.classId && !classes.length) throw new ForbiddenError("Class not found.");
  const data = await load(repo, actor.schoolId ?? "", classes.map((c) => c.id), range, null);
  return buildDashboard(data, classes, all, range, opts.classId ?? null, isAdmin(actor), repo);
}

async function buildDashboard(data: Loaded, classes: NafsClass[], all: NafsClass[], range: Range, classId: string | null, admin: boolean, repo: Repo): Promise<Dashboard> {
  const roster = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, { name: x.name, classId: c.id, className: c.name }] as const)));
  // only the students on the roster now (a student who left the class is not counted here)
  const obs = data.obs.filter((o) => roster.has(o.sid));
  const classAttempts = attemptsOf(obs, data.titles, (o) => `${o.kind}:${o.aid}`);
  const ca = classAttempts.map((a) => ({ kind: a.kind, aid: a.id, title: a.title, date: a.date }));
  const missedAll = missedOf(obs, data.stems).slice(0, 10);
  const standards = skillRows("STANDARD", STD_KEYS, (o) => o.std, obs, ca, data.stems);
  const skills = skillRows("SKILL", SKILL_KEYS, (o) => (SKILL_BY_CODE.get(o.skill)?.domain === "PIRLS" ? null : o.skill), obs, ca, data.stems);
  const processes = skillRows("PROCESS", PROC_KEYS, (o) => o.proc, obs, ca, data.stems);
  await fillStems(repo, data.stems, [...missedAll, ...standards, ...skills, ...processes].map((x) => ("missed" in x ? x.missed?.id : x.id)).filter((x): x is string => Boolean(x)));
  for (const m of [...missedAll, ...[...standards, ...skills, ...processes].map((x) => x.missed).filter((x): x is Missed => Boolean(x))]) m.stem = data.stems.get(m.id) ?? m.stem;
  const per = perStudent(obs, data.titles);

  // 1. overview
  const tests = classAttempts.filter((a) => a.kind === "TEST");
  const resultPcts = [...per.values()].flatMap((a) => a.tests.map((x) => x.pct)).filter((x): x is number => x !== null);
  const pAcc = obs.filter((o) => o.kind === "PRACTICE").reduce((a, o) => ({ sum: a.sum + (o.credit ?? 0), n: a.n + 1 }), { sum: 0, n: 0 });
  const last = tests[tests.length - 1], prev = tests[tests.length - 2];
  const overview: Dashboard["overview"] = {
    students: roster.size, tested: [...per.values()].filter((a) => a.tests.length).length,
    testsTaken: [...per.values()].reduce((a, x) => a + x.tests.length, 0), tests: tests.length,
    practiceSessions: new Set(obs.filter((o) => o.kind === "PRACTICE").map((o) => `${o.aid}:${o.sid}`)).size, practiceAnswers: pAcc.n,
    avgScore: resultPcts.length ? Math.round(resultPcts.reduce((a, b) => a + b, 0) / resultPcts.length) : null, practicePct: roundPct(pAcc.sum, pAcc.n),
    trend: last && prev && last.pct !== null && prev.pct !== null ? { delta: last.pct - prev.pct, latest: { title: last.title, pct: last.pct }, previous: { title: prev.title, pct: prev.pct } } : null,
    waiting: data.waiting,
  };

  // 2. heat map (tests and practice together)
  const codes = standards.map((x) => x.key);
  const heat: Dashboard["heat"] = {
    codes,
    students: [...per].map(([id, a]) => ({ id, name: roster.get(id)!.name, className: roster.get(id)!.className, pct: pctOf(a.all), n: a.all.n, cells: Object.fromEntries(codes.filter((c) => a.std.has(c)).map((c) => [c, { pct: pctOf(a.std.get(c)), n: a.std.get(c)!.n }])) }))
      .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name)),
  };

  // 3. tests vs practice: between two tests on a standard, did practising it move the next test?
  const eff = new Map<string, { p: number[]; np: number[] }>();
  const pTimes = new Map<string, number[]>();
  for (const o of obs) if (o.kind === "PRACTICE" && o.std) { const k = `${o.sid}|${o.std}`; const l = pTimes.get(k) ?? []; l.push(o.at); pTimes.set(k, l); }
  for (const [sid, a] of per) {
    for (const code of codes) {
      const seq = a.tests.filter((t) => t.standards[code] !== undefined && t.standards[code] !== null);
      for (let i = 1; i < seq.length; i++) {
        const t0 = Date.parse(seq[i - 1].date), t1 = Date.parse(seq[i].date);
        const practised = (pTimes.get(`${sid}|${code}`) ?? []).some((t) => t > t0 && t < t1);
        const e = eff.get(code) ?? { p: [], np: [] };
        (practised ? e.p : e.np).push(seq[i].standards[code]! - seq[i - 1].standards[code]!);
        eff.set(code, e);
      }
    }
  }
  const mean = (l: number[]) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
  const practiceEffect = codes.filter((c) => eff.has(c)).map((c) => ({ code: c, short: MOE_BY_CODE.get(c)!.short, practised: { delta: mean(eff.get(c)!.p), pairs: eff.get(c)!.p.length }, notPractised: { delta: mean(eff.get(c)!.np), pairs: eff.get(c)!.np.length } }));
  const students: Dashboard["students"] = [...per].map(([id, a]) => {
    const l = a.attempts, n = l.length;
    return { id, name: roster.get(id)!.name, className: roster.get(id)!.className, attempts: n, first: l[0]?.pct ?? null, prev: n > 1 ? l[n - 2].pct : null, latest: l[n - 1]?.pct ?? null, dPrev: n > 1 ? l[n - 1].dPrev : null, dFirst: n > 1 ? l[n - 1].dFirst : null };
  }).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));

  // 4. groups (the latest test), movement (since the previous test), groups by weakest standard
  const groupRows = new Map<GroupKey, Map<string, GroupStudent[]>>();
  const movement: Dashboard["movement"] = { up: [], down: [], same: 0 };
  const noTest: Dashboard["noTest"] = [];
  for (const c of classes) for (const x of c.students) {
    const a = per.get(x.id);
    const tl = a?.tests ?? [];
    const latest = tl[tl.length - 1]?.pct ?? null, before = tl.length > 1 ? tl[tl.length - 2].pct : null;
    const g = groupOf(latest);
    if (!g) { noTest.push({ id: x.id, name: x.name, className: c.name }); continue; }
    const pg = groupOf(before), move = movementOf(pg, g);
    if (pg) { if (move > 0) movement.up.push({ id: x.id, name: x.name, className: c.name, from: pg, to: g, fromPct: before, toPct: latest }); else if (move < 0) movement.down.push({ id: x.id, name: x.name, className: c.name, from: pg, to: g, fromPct: before, toPct: latest }); else movement.same++; }
    const byClass = groupRows.get(g) ?? new Map<string, GroupStudent[]>();
    const l = byClass.get(c.id) ?? [];
    l.push({ id: x.id, name: x.name, pct: latest, prevPct: before, move, weak: focusOf(a) });
    byClass.set(c.id, l); groupRows.set(g, byClass);
  }
  const groups: DashGroup[] = NAFS_GROUPS.map((g, i) => {
    const byClass = groupRows.get(g.key) ?? new Map<string, GroupStudent[]>();
    const cl = classes.filter((c) => byClass.has(c.id)).map((c) => {
      const st = byClass.get(c.id)!.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || a.name.localeCompare(b.name));
      const weak = topCodes(st.map((x) => x.weak));
      return { classId: c.id, className: c.name, students: st, weak, practiceHref: practiceHref(c.id, weak, st.map((x) => x.id)), testHref: testHref(c.id, weak) };
    });
    return { key: g.key, name: g.name, min: g.min, max: i === 0 ? null : NAFS_GROUPS[i - 1].min - 1, count: cl.reduce((a, c) => a + c.students.length, 0), classes: cl };
  });
  const weakestMap = new Map<string, Map<string, { id: string; name: string; pct: number | null }[]>>();
  for (const c of classes) for (const x of c.students) {
    const a = per.get(x.id); const w = weakOf(a)[0];
    if (!w) continue;
    const m = weakestMap.get(w) ?? new Map(); const l = m.get(c.id) ?? []; l.push({ id: x.id, name: x.name, pct: pctOf(a!.std.get(w)) }); m.set(c.id, l); weakestMap.set(w, m);
  }
  const weakest: Dashboard["weakest"] = MOE_STANDARDS.filter((x) => weakestMap.has(x.code)).map((x) => {
    const m = weakestMap.get(x.code)!;
    const cl = classes.filter((c) => m.has(c.id)).map((c) => { const st = m.get(c.id)!.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || a.name.localeCompare(b.name)); return { classId: c.id, className: c.name, students: st, practiceHref: practiceHref(c.id, [x.code], st.map((y) => y.id)), testHref: testHref(c.id, [x.code]) }; });
    return { code: x.code, short: x.short, text: x.text, count: cl.reduce((a, c) => a + c.students.length, 0), classes: cl };
  }).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  // 7. the school view: classes compared on every standard (tests / practice), class → students
  const school: Dashboard["school"] = {
    classes: classes.map((c) => {
      const mine = obs.filter((o) => o.cid === c.id);
      const t: Acc = { sum: 0, n: 0 }, p: Acc = { sum: 0, n: 0 }, st = new Map<string, Acc>(), sp = new Map<string, Acc>();
      for (const o of mine) { if (o.credit === null) continue; const a = o.kind === "TEST" ? t : p; a.sum += o.credit; a.n++; if (o.std) addTo(o.kind === "TEST" ? st : sp, o.std, o.credit); }
      return {
        id: c.id, name: c.name, students: c.students.length, tested: c.students.filter((x) => per.get(x.id)?.tests.length).length, testPct: pctOf(t), practicePct: pctOf(p),
        standards: Object.fromEntries(codes.map((code) => [code, { test: pctOf(st.get(code)), practice: pctOf(sp.get(code)) }])),
        members: c.students.map((x) => { const a = per.get(x.id); const tl = a?.tests ?? []; const latest = tl[tl.length - 1]?.pct ?? null; return { id: x.id, name: x.name, latest, group: groupOf(latest), practiceN: a?.attempts.filter((y) => y.kind === "PRACTICE").length ?? 0 }; }),
      };
    }),
  };

  return {
    scope: { classId, classes: all.map((c) => ({ id: c.id, name: c.name, students: c.students.length })), range, admin },
    overview, standards, skills, processes, missed: missedAll, heat, attempts: classAttempts, practiceEffect, students, groups, noTest, weakest, movement, school,
  };
}

/**
 * r69: the Reports and Suggested plan tabs read the same dashboard — kept one minute per teacher and filter (a swept,
 * bounded cache: 20 entries at most, given back by the sweeper), so moving between the two tabs computes it once.
 */
const dashCache = sweptMap<string, { at: number; d: Promise<Dashboard> }>("nafs.dashboard", 60_000, 20);
export function nafsDashboardCached(repo: Repo, actor: Actor, opts: { classId?: string | null; from?: unknown; to?: unknown } = {}, now = Date.now()): Promise<Dashboard> {
  const r = cleanRange(opts.from, opts.to);
  const key = `${actor.userId}|${actor.role}|${opts.classId ?? ""}|${r.from ?? ""}|${r.to ?? ""}`;
  const had = dashCache.get(key);
  if (had && now - had.at < 60_000) return had.d;
  const d = nafsDashboard(repo, actor, opts);
  dashCache.set(key, { at: now, d });
  d.catch(() => dashCache.delete(key));
  return d;
}

// ------------------------------------------------------------------ 5. one student's drill-down

export interface StudentDashboard {
  id: string; name: string; classId: string; className: string; range: Range;
  attempts: AttemptRow[];
  standards: { code: string; short: string; text: string; testPct: number | null; testN: number; practicePct: number | null; practiceN: number; pct: number | null; n: number; first: number | null; latest: number | null; change: number | null; trend: { kind: Kind; title: string; date: string; pct: number | null }[] }[];
  strengths: string[]; weaknesses: string[];
  practice: { id: string; title: string; date: string; asked: number; correct: number; pct: number | null; seconds: number; finished: boolean; targets: { code: string; short: string; n: number; pct: number | null; reached: Difficulty | 0; mastered: boolean }[] }[];
  recommended: { code: string; short: string; text: string; why: "WEAK" | "NOT_YET" }[];
  practiceHref: string; testHref: string;
  group: GroupKey | null; prevGroup: GroupKey | null; latest: number | null;
}

export async function nafsStudentDashboard(repo: Repo, actor: Actor, studentId: string, opts: { from?: unknown; to?: unknown } = {}): Promise<StudentDashboard> {
  await assertNafs(repo, actor);
  const range = cleanRange(opts.from, opts.to);
  const klass = (await nafsClasses(repo, actor)).find((c) => c.students.some((x) => x.id === studentId));
  if (!klass) throw new ForbiddenError("This student is not in one of your Grade 6 classes.");
  const data = await load(repo, actor.schoolId ?? "", [klass.id], range, studentId);
  const obs = data.obs.filter((o) => o.sid === studentId);
  const attempts = attemptsOf(obs, data.titles, (o) => `${o.kind}:${o.aid}`);
  const agg = perStudent(obs, data.titles).get(studentId);
  const standards = MOE_STANDARDS.filter((x) => obs.some((o) => o.std === x.code && o.credit !== null)).map((x) => {
    const mine = obs.filter((o) => o.std === x.code && o.credit !== null);
    const t: Acc = { sum: 0, n: 0 }, p: Acc = { sum: 0, n: 0 };
    for (const o of mine) { const a = o.kind === "TEST" ? t : p; a.sum += o.credit!; a.n++; }
    const trend = attempts.filter((a) => a.standards[x.code] !== undefined).map((a) => ({ kind: a.kind, title: a.title, date: a.date, pct: a.standards[x.code] }));
    const first = trend[0]?.pct ?? null, latest = trend[trend.length - 1]?.pct ?? null;
    return { code: x.code, short: x.short, text: x.text, testPct: pctOf(t), testN: t.n, practicePct: pctOf(p), practiceN: p.n, pct: roundPct(t.sum + p.sum, t.n + p.n), n: t.n + p.n, first, latest, change: trend.length > 1 && first !== null && latest !== null ? latest - first : null, trend };
  });
  const enough = standards.filter((x) => x.n >= MIN_STD_ITEMS && x.pct !== null);
  const strengths = [...enough].filter((x) => x.pct! >= WEAK_BELOW).sort((a, b) => b.pct! - a.pct! || a.code.localeCompare(b.code)).slice(0, 3).map((x) => x.code);
  const weaknesses = [...enough].filter((x) => x.pct! < WEAK_BELOW).sort((a, b) => a.pct! - b.pct! || a.code.localeCompare(b.code)).slice(0, 3).map((x) => x.code);
  // practice history (newest first) with each target's state from the run
  const runOf = new Map(data.runs.map((r) => [s(r.practiceId), r]));
  const pAtt = attempts.filter((a) => a.kind === "PRACTICE");
  const practice: StudentDashboard["practice"] = pAtt.map((a) => {
    const r = runOf.get(a.id);
    const st = r ? json<RunState | null>(r.state, null) : null;
    const mine = obs.filter((o) => o.kind === "PRACTICE" && o.aid === a.id);
    const right = mine.filter((o) => o.credit === 1).length;
    return {
      id: a.id, title: a.title, date: a.date, asked: mine.length, correct: right, pct: roundPct(right, mine.length), seconds: Number(r?.seconds ?? 0), finished: Boolean(r?.finishedAt),
      targets: Object.entries(st?.targets ?? {}).map(([code, x]) => ({ code, short: MOE_BY_CODE.get(code)?.short ?? SKILL_BY_CODE.get(code)?.name ?? code, n: x.n, pct: x.n ? roundPct(x.right, x.n) : null, reached: x.reached, mastered: Boolean(x.mastered) })),
    };
  }).reverse();
  // recommended next: the weak standards (not mastered in practice since), then standards not assessed yet
  const masteredSince = new Set(practice.flatMap((p) => p.targets.filter((t) => t.mastered && isMoeCode(t.code)).map((t) => t.code)));
  const weakAll = [...enough].filter((x) => x.pct! < WEAK_BELOW).sort((a, b) => a.pct! - b.pct! || a.code.localeCompare(b.code));
  const rec: StudentDashboard["recommended"] = [];
  for (const x of [...weakAll.filter((w) => !masteredSince.has(w.code)), ...weakAll.filter((w) => masteredSince.has(w.code))]) if (rec.length < 3) rec.push({ code: x.code, short: x.short, text: x.text, why: "WEAK" });
  for (const x of MOE_STANDARDS) if (rec.length < 3 && !standards.some((y) => y.code === x.code && y.n >= MIN_STD_ITEMS)) rec.push({ code: x.code, short: x.short, text: x.text, why: "NOT_YET" });
  const tl = agg?.tests ?? [];
  const latest = tl[tl.length - 1]?.pct ?? null;
  const name = klass.students.find((x) => x.id === studentId)!.name;
  return {
    id: studentId, name, classId: klass.id, className: klass.name, range, attempts, standards, strengths, weaknesses, practice, recommended: rec,
    practiceHref: practiceHref(klass.id, rec.map((x) => x.code), [studentId]), testHref: testHref(klass.id, rec.map((x) => x.code)),
    group: groupOf(latest), prevGroup: groupOf(tl.length > 1 ? tl[tl.length - 2].pct : null), latest,
  };
}

// ------------------------------------------------------------------ 6. Excel / PDF

const LETTERS = ["A", "B", "C", "D"];
const slug = (x: string) => x.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "nafs";
const shortOf = (code: string | null) => (code ? MOE_BY_CODE.get(code)?.short ?? code : "—");
const GROUP_TONES = { Exceeding: "good", Meeting: "info", Approaching: "warn", "Needs support": "bad" } as const;

export function dashboardDoc(d: Dashboard, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const scope = d.scope.classId ? d.scope.classes.find((c) => c.id === d.scope.classId)?.name ?? "" : d.scope.admin ? "All Grade 6 classes" : "All my Grade 6 classes";
  const range = d.scope.range.from || d.scope.range.to ? `${d.scope.range.from ?? "…"} → ${d.scope.range.to ?? "…"}` : "All dates";
  const o = d.overview;
  const dimTable = (id: string, title: string, sheet: string, rows: SkillRow[]): Section => ({
    type: "table", id, title, sheet, empty: "No results yet.",
    columns: [{ key: "short", label: "Code", kind: "latin", nowrap: true }, { key: "name", label: "Name", kind: "text", width: 2.5 }, { key: "test", label: "Tests %", kind: "pct" }, { key: "testN", label: "Test items", kind: "int" }, { key: "practice", label: "Practice %", kind: "pct" }, { key: "practiceN", label: "Practice items", kind: "int" },
      ...DIFFICULTIES.map((x) => ({ key: `d${x}`, label: DIFFICULTY_NAME[x], kind: "pct" as const })), { key: "trend", label: "Trend (attempt by attempt)", kind: "latin" as const, width: 2 }, { key: "missed", label: "Most missed", kind: "text" as const, width: 2.5 }],
    rows: rows.map((x) => ({ short: x.kind === "SKILL" ? "" : x.short, name: x.name, test: x.testPct, testN: x.testN, practice: x.practicePct, practiceN: x.practiceN, ...Object.fromEntries(DIFFICULTIES.map((k) => [`d${k}`, x.byDifficulty[k].pct])), trend: x.trend.map((t) => (t.pct === null ? "—" : `${t.pct}`)).join(" → ") || "—", missed: x.missed ? `${x.missed.stem} (${x.missed.pct ?? "—"}%${x.missed.topWrong !== null ? `, ${LETTERS[x.missed.topWrong]}` : ""})` : "—" })),
  });
  const sections: Section[] = [
    { type: "kpis", title: "Overview", items: [
      { label: "Students", value: o.students, kind: "int", glance: true }, { label: "Tests taken", value: o.testsTaken, kind: "int", glance: true }, { label: "Practice sessions", value: o.practiceSessions, kind: "int", glance: true },
      { label: "Average score", value: o.avgScore, kind: "pct", glance: true, hint: "the mean of every test result" }, { label: "Practice % correct", value: o.practicePct, kind: "pct" },
      { label: "Change from the previous test", value: o.trend ? o.trend.delta : null, kind: "signed", tone: o.trend ? (o.trend.delta > 0 ? "good" : o.trend.delta < 0 ? "bad" : "neutral") : "neutral" },
      { label: "Written answers waiting for marking", value: o.waiting, kind: "int" },
    ] },
    { type: "bars", title: "Ministry standards (tests and practice)", items: d.standards.map((x) => ({ label: x.short, value: x.pct ?? 0, isolate: "latin" as const })), max: 100, kind: "pct" },
    dimTable("standards", "Ministry standards (S01–S13)", "Standards", d.standards),
    dimTable("skills", "NAFS skills", "NAFS skills", d.skills),
    dimTable("processes", "PIRLS reading processes", "PIRLS", d.processes),
    { type: "table", id: "missed", title: "Most-missed questions", sheet: "Most missed", empty: "No results yet.",
      columns: [{ key: "stem", label: "Question", kind: "text", width: 3 }, { key: "standard", label: "Standard", kind: "latin", nowrap: true }, { key: "answered", label: "Answered", kind: "int" }, { key: "pct", label: "Correct", kind: "pct" }, { key: "top", label: "Most chosen wrong", kind: "latin" }, { key: "from", label: "From", kind: "text" }],
      rows: d.missed.map((x) => ({ stem: x.stem, standard: shortOf(x.standard), answered: x.answered, pct: x.pct, top: x.topWrong === null ? "—" : `${LETTERS[x.topWrong]} (${x.topWrongCount})`, from: x.kinds.map((k) => (k === "TEST" ? "Tests" : "Practice")).join(" + ") })) },
    { type: "table", id: "heat", title: "Students × standards heat map", sheet: "Heat map", empty: "No results yet.", note: "percent correct (items), tests and practice together",
      columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "pct", label: "Overall", kind: "pct" }, ...d.heat.codes.map((c) => ({ key: c, label: shortOf(c), kind: "latin" as const, nowrap: true }))],
      rows: d.heat.students.map((x) => ({ name: x.name, className: x.className, pct: x.pct, ...Object.fromEntries(d.heat.codes.map((c) => [c, x.cells[c] ? `${x.cells[c].pct ?? "—"}% (${x.cells[c].n})` : "—"])) })) },
    { type: "table", id: "attempts", title: "Attempt by attempt (class)", sheet: "Attempts", empty: "No results yet.",
      columns: [{ key: "date", label: "Date", kind: "date" }, { key: "kind", label: "Type", kind: "text" }, { key: "title", label: "Title", kind: "text", width: 2.5 }, { key: "students", label: "Students", kind: "int" }, { key: "pct", label: "Score", kind: "pct" }, { key: "dPrev", label: "Change from previous", kind: "signed" }, { key: "dFirst", label: "Change from first", kind: "signed" }, ...d.heat.codes.map((c) => ({ key: c, label: shortOf(c), kind: "pct" as const, nowrap: true }))],
      rows: d.attempts.map((a) => ({ date: a.date.slice(0, 10), kind: a.kind === "TEST" ? "Test" : "Practice", title: a.title, students: a.students, pct: a.pct, dPrev: a.dPrev, dFirst: a.dFirst, ...Object.fromEntries(d.heat.codes.map((c) => [c, a.standards[c] ?? null])) })) },
    { type: "table", id: "effect", title: "Tests and practice: the change in the next test on a standard", sheet: "Practice effect", empty: "Not enough tests yet (two tests on the same standard are needed).",
      columns: [{ key: "short", label: "Standard", kind: "latin", nowrap: true }, { key: "p", label: "Practised in between", kind: "signed" }, { key: "pn", label: "Pairs", kind: "int" }, { key: "np", label: "Not practised", kind: "signed" }, { key: "npn", label: "Pairs", kind: "int" }],
      rows: d.practiceEffect.map((x) => ({ short: x.short, p: x.practised.delta, pn: x.practised.pairs, np: x.notPractised.delta, npn: x.notPractised.pairs })) },
    { type: "table", id: "students", title: "Students: first, previous and latest attempt", sheet: "Students", empty: "No results yet.",
      columns: [{ key: "name", label: "Student", kind: "name", width: 2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "attempts", label: "Attempts", kind: "int" }, { key: "first", label: "First", kind: "pct" }, { key: "prev", label: "Previous", kind: "pct" }, { key: "latest", label: "Latest", kind: "pct" }, { key: "dPrev", label: "Change from previous", kind: "signed" }, { key: "dFirst", label: "Change from first", kind: "signed" }],
      rows: d.students.map((x) => ({ name: x.name, className: x.className, attempts: x.attempts, first: x.first, prev: x.prev, latest: x.latest, dPrev: x.dPrev, dFirst: x.dFirst })) },
    { type: "table", id: "groups", title: "Student groups (latest test)", sheet: "Groups", empty: "No test results yet.", note: `Teacher-facing only: ${NAFS_GROUPS.map((g, i) => `${g.name} ${i === 0 ? `≥ ${g.min}` : g.key === "SUPPORT" ? `< ${NAFS_GROUPS[i - 1].min}` : `${g.min}–${NAFS_GROUPS[i - 1].min - 1}`}%`).join(" · ")}. Students never see these words.`,
      columns: [{ key: "group", label: "Group", kind: "text", tones: GROUP_TONES }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "name", label: "Student", kind: "name", width: 2 }, { key: "pct", label: "Latest test", kind: "pct" }, { key: "prev", label: "Previous test", kind: "pct" }, { key: "move", label: "Movement", kind: "text" }, { key: "weak", label: "Standards to work on", kind: "latin", width: 2 }],
      rows: d.groups.flatMap((g) => g.classes.flatMap((c) => c.students.map((x) => ({ group: g.name, className: c.className, name: x.name, pct: x.pct, prev: x.prevPct, move: x.move > 0 ? "Up" : x.move < 0 ? "Down" : "—", weak: x.weak.map(shortOf).join(", ") || "—" })))) },
    { type: "table", id: "weakest", title: "Groups by weakest standard", sheet: "Weakest standard", empty: "No student has a weak standard.",
      columns: [{ key: "short", label: "Standard", kind: "latin", nowrap: true }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "students", label: "Students", kind: "text", width: 3 }],
      rows: d.weakest.flatMap((w) => w.classes.map((c) => ({ short: w.short, className: c.className, students: c.students.map((x) => `${x.name} (${x.pct ?? "—"}%)`).join(", ") }))) },
    { type: "table", id: "compare", title: "Classes compared (tests / practice)", sheet: "Classes", empty: "—",
      columns: [{ key: "name", label: "Class", kind: "latin", nowrap: true }, { key: "students", label: "Students", kind: "int" }, { key: "tested", label: "Tested", kind: "int" }, { key: "test", label: "Tests %", kind: "pct" }, { key: "practice", label: "Practice %", kind: "pct" }, ...d.heat.codes.map((c) => ({ key: c, label: shortOf(c), kind: "latin" as const, nowrap: true }))],
      rows: d.school.classes.map((c) => ({ name: c.name, students: c.students, tested: c.tested, test: c.testPct, practice: c.practicePct, ...Object.fromEntries(d.heat.codes.map((code) => [code, `${c.standards[code]?.test ?? "—"} / ${c.standards[code]?.practice ?? "—"}`])) })) },
    { type: "notes", title: "How to read this dashboard", items: [
      "Data: NAFS tests and NAFS adaptive practice only (never the platform's levels or ReadRise).",
      "Percentages are computed from the exact counts and rounded to the nearest whole number at the end.",
      "Groups use each student's latest NAFS test; movement compares it with the previous test.",
      "Short written answers count once the teacher has scored them.",
    ] },
  ];
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "nafs", title: "NAFS dashboard", subtitle: scope, primaryTable: "standards", fileStem: `nafs_dashboard_${slug(scope)}`,
    meta: [{ label: "Group", value: scope, isolate: "auto" }, { label: "Dates", value: range, isolate: "latin" }, { label: "Students", value: String(o.students) }],
    sections,
  };
}

/** The dashboard as a file (xlsx: a sheet per view; pdf: printable): same access as the page; rate-limited, audited. */
export async function exportNafsDashboard(deps: ReportDeps, actor: Actor, req: { classId?: string | null; from?: unknown; to?: unknown; format: "pdf" | "xlsx" }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  const d = await nafsDashboard(repo, actor, { classId: req.classId ?? null, from: req.from, to: req.to });
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  const me = await repo.findUnique("User", { id: actor.userId });
  const doc = dashboardDoc(d, { branding, generatedAt: now, generatedBy: String(me?.displayName ?? "") });
  let bytes: Uint8Array;
  if (req.format === "pdf") {
    if (!deps.pdf) throw new Error("PDF rendering is not configured.");
    const fonts = loadFonts(deps.fontDir);
    bytes = await deps.pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  } else bytes = renderXlsx(doc);
  await audit(repo, { actorId: actor.userId, action: "report.export", entityType: "NafsDashboard", entityId: req.classId ?? "all", after: { kind: "nafs-dashboard", format: req.format, classId: req.classId ?? null, from: d.scope.range.from, to: d.scope.range.to, bytes: bytes.length }, at: now });
  return { bytes, contentType: CONTENT_TYPES[req.format], filename: `${doc.fileStem}.${req.format}` };
}

/** The download links of the dashboard (Excel / PDF) for the same class and dates. */
export function dashboardDownload(format: "xlsx" | "pdf", classId: string | null, r: Range): string {
  return `/api/nafs/dashboard?${new URLSearchParams([["format", format], ...(classId ? [["classId", classId]] : []), ...(r.from ? [["from", r.from]] : []), ...(r.to ? [["to", r.to]] : [])])}`;
}

