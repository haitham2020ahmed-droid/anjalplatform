/**
 * 👩‍🏫 The teacher's fluency view of a class: each student's WCPM on the season's norms (percentile, band), prosody
 * traits, comprehension, the trend of the last 5 checks, the "needs fluency work" flag (more than 10 WCPM under the
 * 50th percentile), the patterns the class misses most, and suggested small groups:
 *   DRILL group per pattern · PHRASED group for low phrasing · comprehension group for "fast but not understanding"
 *   · repeated-reading group for students who need fluency work.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { classFluency } from "../teacher/support";
import { fluencySeason, norm50, type Season } from "./norms";
import { PATTERN_BY_CODE, patternForError } from "./drill-words";
import { COMPREHENSION_FLAG } from "./comprehension";
import { coldReads, PROSODY_TRAITS, readingEvidence, type ProsodyTrait } from "./coach";
import { asRemedialPlan, buildRemedialPlan, FOCUS_TEACHER, goalLine, reviewPlan, type RemedialPlan } from "./remedial";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };

export interface ClassFluencyRow {
  id: string; name: string;
  wcpm: number | null; percentile: number | null; band: "BELOW" | "ON" | "ABOVE" | null; season: Season | null; text: string | null; date: string | null; source: string | null;
  prosody: Record<ProsodyTrait, number | null> | null; comprehension: number | null;
  trend: number[]; direction: "UP" | "DOWN" | "FLAT" | null;
  needsWork: boolean; fastNotUnderstanding: boolean; practices: number; expression: number | null;
  /** the student's remedial plan reviewed today (decision, goal line, latest cold read), or null */
  plan: (RemedialPlan & { focusName: string; onLine: number }) | null;
}
export interface FluencyGroup { key: string; kind: "DRILL" | "PHRASED" | "COMPREHENSION" | "REPEATED"; title: string; why: string; students: { id: string; name: string; detail: string }[] }
export interface ClassFluencyView {
  className: string; grade: number; season: Season; rubric: string; p50: number | null;
  rows: ClassFluencyRow[];
  patterns: { code: string; label: string; students: number; words: string[] }[];
  missed: { word: string; students: number }[];
  groups: FluencyGroup[];
}

/** UP / DOWN / FLAT from the first and last of the recent checks (±3 WCPM counts as flat). */
export function trendDirection(xs: number[]): "UP" | "DOWN" | "FLAT" | null {
  if (xs.length < 2) return null;
  const diff = xs[xs.length - 1] - xs[0];
  return diff > 3 ? "UP" : diff < -3 ? "DOWN" : "FLAT";
}

export async function classFluencyView(repo: Repo, actor: Actor, classId: string): Promise<ClassFluencyView> {
  const base = await classFluency(repo, actor, classId);   // checks the teacher's access
  const ids = base.rows.map((r) => r.id);
  const practice = ids.length ? await repo.findMany("FluencyPractice", { studentId: { in: ids } }, { select: ["studentId", "errors", "patterns", "prosody", "comprehension", "practiceKind", "mode", "wcpm", "accuracy", "expression", "trial", "createdAt"] }) : [];
  const checks = ids.length ? await repo.findMany("FluencyCheck", { studentId: { in: ids } }, { select: ["studentId", "wcpm", "accuracy", "checkedAt", "season"] }) : [];
  const season = fluencySeason();
  const now = new Date();
  const rows: ClassFluencyRow[] = base.rows.map((r) => {
    const pr = practice.filter((x) => s(x.studentId) === r.id).sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0));
    const proRow = pr.find((x) => x.prosody && s(x.practiceKind) !== "DRILL");
    const pj = r.latest?.prosody ?? json<Record<string, number> | null>(proRow?.prosody, null);
    const prosody = pj ? (Object.fromEntries(PROSODY_TRAITS.map((t) => [t, typeof pj[t] === "number" ? pj[t] : null])) as Record<ProsodyTrait, number | null>) : null;
    const compRow = pr.find((x) => x.comprehension !== null && x.comprehension !== undefined);
    const comprehension = r.latest?.comprehension ?? (compRow ? Number(compRow.comprehension) : null);
    const trend = checks.filter((c) => s(c.studentId) === r.id).sort((a, b) => (d(a.checkedAt)?.getTime() ?? 0) - (d(b.checkedAt)?.getTime() ?? 0)).slice(-5).map((c) => Number(c.wcpm));
    const p50 = r.latest ? norm50(base.grade, r.latest.season) : null;
    const fast = !!(r.latest && p50 !== null && r.latest.wcpm >= p50 && comprehension !== null && comprehension < COMPREHENSION_FLAG);
    // the remedial plan as it stands today: reviewed with every cold read and reading (a check due, raise, change…)
    const stored = asRemedialPlan(r.coach.remedial);
    const mineChecks = checks.filter((c) => s(c.studentId) === r.id);
    const ev = { grade: base.grade, cold: coldReads(mineChecks), readings: readingEvidence(pr), words: [], patterns: [] };
    // no coach plan yet (e.g. only the teacher's own checks): the plan the evidence suggests
    const reviewed = stored ? reviewPlan(stored, ev, now) : buildRemedialPlan(ev, now);
    const plan = reviewed ? { ...reviewed, focusName: FOCUS_TEACHER[reviewed.focus], onLine: goalLine(reviewed, now.toISOString()) } : null;
    return {
      plan,
      id: r.id, name: r.name, wcpm: r.latest?.wcpm ?? null, percentile: r.latest?.percentile ?? null, band: r.latest?.level ?? null, season: r.latest?.season ?? null, text: r.latest?.text ?? null, date: r.latest?.date ?? null, source: r.latest?.source ?? null,
      prosody, comprehension, trend, direction: trendDirection(trend), needsWork: !!r.latest?.needsWork, fastNotUnderstanding: fast, practices: r.coach.practices, expression: r.coach.expression,
    };
  });
  // the patterns behind the class's missed words (one count per student), and the drill rows to reteach
  const byPattern = new Map<string, { students: Set<string>; words: Map<string, number> }>();
  const add = (code: string | null, student: string, word?: string) => {
    if (!code || !PATTERN_BY_CODE.has(code)) return;
    if (!byPattern.has(code)) byPattern.set(code, { students: new Set(), words: new Map() });
    const g = byPattern.get(code)!; g.students.add(student); if (word) g.words.set(word, (g.words.get(word) ?? 0) + 1);
  };
  for (const x of practice) {
    const notes = json<string[]>(x.patterns, []);
    for (const e of json<{ word?: string; pattern?: string | null }[]>(x.errors, [])) { const w = s(e.word); if (w.length < 2) continue; add(e.pattern ?? patternForError(w, notes), s(x.studentId), w); }
    if (s(x.practiceKind) === "DRILL") for (const c of notes) add(c, s(x.studentId));
  }
  const patterns = [...byPattern].map(([code, g]) => ({ code, label: PATTERN_BY_CODE.get(code)!.label, students: g.students.size, words: [...g.words].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 6), ids: [...g.students] }))
    .sort((a, b) => b.students - a.students || a.code.localeCompare(b.code));
  const nm = new Map(rows.map((r) => [r.id, r.name]));
  const groups: FluencyGroup[] = [];
  for (const p of patterns.filter((x) => x.students >= 2).slice(0, 4)) groups.push({ key: `drill-${p.code}`, kind: "DRILL", title: `Speed drill: ${p.label}`, why: `${p.students} students miss words with this pattern (${p.words.slice(0, 4).join(", ")}). Teach the pattern, then a 1-minute word drill.`, students: p.ids.map((id) => ({ id, name: nm.get(id) ?? "Student", detail: "" })).sort((a, b) => a.name.localeCompare(b.name)) });
  const lowPhr = rows.filter((r) => r.prosody?.phrasing !== null && r.prosody?.phrasing !== undefined && r.prosody.phrasing <= 2);
  if (lowPhr.length) groups.push({ key: "phrased", kind: "PHRASED", title: "Phrased reading", why: "Phrasing 1–2 of 4: reads word by word or in two-word groups. Practise with phrase-marked passages (/ and //) and echo reading.", students: lowPhr.map((r) => ({ id: r.id, name: r.name, detail: `phrasing ${r.prosody!.phrasing}/4` })) });
  const fast = rows.filter((r) => r.fastNotUnderstanding);
  if (fast.length) groups.push({ key: "comprehension", kind: "COMPREHENSION", title: "Fast but not understanding", why: `At or above the 50th percentile for speed, but under ${COMPREHENSION_FLAG}% on the questions after reading. Slow down: stop after each paragraph, retell, and answer questions.`, students: fast.map((r) => ({ id: r.id, name: r.name, detail: `${r.wcpm} WCPM · ${r.comprehension}%` })) });
  const work = rows.filter((r) => r.needsWork);
  if (work.length) groups.push({ key: "repeated", kind: "REPEATED", title: "Needs fluency work", why: "More than 10 WCPM under the 50th percentile for the season. Repeated reading of one passage (3–5 times) with a stretch goal, plus the word drill.", students: work.map((r) => ({ id: r.id, name: r.name, detail: r.text ?? "" })) });
  return {
    className: base.className, grade: base.grade, season, rubric: base.rubric, p50: norm50(base.grade, season), rows,
    patterns: patterns.map(({ ids: _i, ...p }) => p).slice(0, 10), missed: base.missed, groups,
  };
}
