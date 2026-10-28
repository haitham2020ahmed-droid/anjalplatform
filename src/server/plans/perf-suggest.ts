/**
 * 💡 Suggested plans — built from what the students REALLY did on the platform, never sent by themselves:
 *
 *   accuracy per skill   the last 30 days of answers (5+ answers), else the skill's mastery record (5+ answers)
 *   mastery              StudentSkillMastery (score, last practised)
 *   Diagnostic           the latest Diagnostic's "suggested support" skills
 *   MAP                  the lowest MAP sub-area of each student (when MAP scores exist; suggestMapPlan)
 *   missed questions     wrong answers of the last 30 days not answered right since (they wait in Second Chance)
 *   fluency              the latest fluency check (words correct per minute, percentile) — shown with the reasons
 *
 * Each suggestion says WHY ("5 students weak in Central Idea (48%)"), shows the data per student and what the plan
 * would hold ("12 questions + lesson"). The teacher opens it as a draft, edits anything, previews, then sends.
 * Reads are bounded: one class, the last 30 days of answers (newest MAX_ATTEMPTS), batched by ids.
 */
import { createHash } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { isHiddenSkill } from "../skills/master";
import { hasLesson, hasLessons } from "../lessons/run";
import { TtlCache } from "../lib/ttl-cache";
import type { Program } from "./program";
import type { SectionSpec, PlanSource, Txt } from "./editor";
import { fmt, studentNames } from "./editor";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.getTime() : s(v)).getTime() || 0;
/** under this accuracy a skill is "weak" for a student */
export const WEAK_PCT = 60;
/** at or above this accuracy a skill is "excelling" for a student (Enrichment) */
export const STRONG_PCT = 90;
/** answers needed before a skill is judged (weak-skill side: Diagnostic/support, group & individual plans) */
export const MIN_ANSWERS = 5;
/** answers needed before a skill counts as "excelling" for Enrichment — higher than MIN_ANSWERS so a lucky short
 * streak doesn't read as mastery; Stat.answers already carries the true count, so this is just a stricter re-check
 * on top of the (lower) MIN_ANSWERS used to populate `stats` in the first place. */
export const MIN_ANSWERS_STRONG = 12;
/** students weak in the same skill for a group plan */
export const GROUP_MIN = 3;
export const LOOKBACK_DAYS = 30;
const MAX_ATTEMPTS = 20000;

export type SuggestionScope = "CLASS" | "GROUP" | "STUDENT";
export interface SuggestedPlan {
  id: string;
  scope: SuggestionScope;
  program: Program | null;
  title: string;
  /** e.g. "5 students weak in Central Idea (48%)" */
  reason: string;
  reasonT: Txt;
  /** e.g. "Group plan: 12 questions + lesson" */
  summary: string;
  summaryT: Txt;
  /** where the data comes from: Practice · Mastery · Diagnostic · MAP · Second Chance · Fluency */
  sources: string[];
  studentIds: string[];
  rows: { studentId: string; name: string; lines: Txt[] }[];
  sections: (SectionSpec & { skillId: string; skillName: string; count: number; lesson: boolean })[];
}

interface Stat { answers: number; correct: number; recent: boolean }
const pct = (st: Stat) => Math.round((100 * st.correct) / Math.max(1, st.answers));

/** Short stable id of a suggestion (scope + skills + students): the action finds it again on the server. */
const sid = (parts: string[]) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);

export interface PerfData {
  members: string[];
  names: Map<string, string>;
  skillName: Map<string, string>;
  /** student → skill → accuracy stat */
  stats: Map<string, Map<string, Stat>>;
  mastery: Map<string, Map<string, { score: number; last: string | null }>>;
  missed: Map<string, Map<string, number>>;
  diag: Map<string, Set<string>>;
  fluency: Map<string, { wcpm: number; percentile: number | null; date: string }>;
  map: Map<string, { area: string; rit: number | null }>;
}

/** Reads the class's performance (bounded). */
export async function classPerformance(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<PerfData & { klass: Row; grade: number }> {
  assertCan(actor, "assignments:read");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can see suggestions.");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)).slice(0, 400);
  const empty: PerfData = { members, names: new Map(), skillName: new Map(), stats: new Map(), mastery: new Map(), missed: new Map(), diag: new Map(), fluency: new Map(), map: new Map() };
  if (!members.length) return { ...empty, klass, grade };
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const [names, mastery, attempts, diag, fluency, chances] = await Promise.all([
    studentNames(repo, members),
    repo.findMany("StudentSkillMastery", { studentId: { in: members } }, { select: ["studentId", "skillId", "score", "attempts", "correct", "lastPracticedAt"] }),
    repo.findMany("QuestionAttempt", { studentId: { in: members }, createdAt: { gte: since } }, { select: ["studentId", "skillId", "questionId", "isCorrect", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ATTEMPTS }),
    repo.findMany("DiagnosticResult", { studentId: { in: members } }, { select: ["studentId", "takenAt", "interventionSkillIds"] }),
    repo.findMany("FluencyCheck", { studentId: { in: members } }, { select: ["studentId", "wcpm", "percentile", "checkedAt"] }),
    repo.findMany("SecondChanceAnswer", { studentId: { in: members }, correct: true, createdAt: { gte: since } }, { select: ["studentId", "questionId"] }),
  ]);
  const stats = new Map<string, Map<string, Stat>>();
  const put = (st: string, k: string, v: Stat) => { const m = stats.get(st) ?? new Map(); m.set(k, v); stats.set(st, m); };
  // recent answers first
  const recent = new Map<string, Stat>();
  for (const a of attempts) { const key = `${s(a.studentId)}|${s(a.skillId)}`; const x = recent.get(key) ?? { answers: 0, correct: 0, recent: true }; x.answers++; if (a.isCorrect) x.correct++; recent.set(key, x); }
  for (const [key, x] of recent) if (x.answers >= MIN_ANSWERS) { const [st, k] = key.split("|"); put(st, k, x); }
  const mast = new Map<string, Map<string, { score: number; last: string | null }>>();
  for (const m of mastery) {
    const st = s(m.studentId), k = s(m.skillId);
    const mm = mast.get(st) ?? new Map(); mm.set(k, { score: Math.round(Number(m.score ?? 0)), last: m.lastPracticedAt ? new Date(time(m.lastPracticedAt)).toISOString().slice(0, 10) : null }); mast.set(st, mm);
    if (!stats.get(st)?.has(k) && Number(m.attempts ?? 0) >= MIN_ANSWERS) put(st, k, { answers: Number(m.attempts), correct: Number(m.correct ?? 0), recent: false });
  }
  // missed questions not answered right since (by the student, in practice or in Second Chance)
  const rightLater = new Set(chances.map((c) => `${s(c.studentId)}|${s(c.questionId)}`));
  const lastRight = new Map<string, number>();
  for (const a of attempts) if (a.isCorrect) { const k = `${s(a.studentId)}|${s(a.questionId)}`; lastRight.set(k, Math.max(lastRight.get(k) ?? 0, time(a.createdAt))); }
  const missed = new Map<string, Map<string, number>>();
  const counted = new Set<string>();
  for (const a of attempts) {
    if (a.isCorrect) continue;
    const k = `${s(a.studentId)}|${s(a.questionId)}`;
    if (counted.has(k) || rightLater.has(k) || (lastRight.get(k) ?? 0) > time(a.createdAt)) continue;
    counted.add(k);
    const m = missed.get(s(a.studentId)) ?? new Map(); m.set(s(a.skillId), (m.get(s(a.skillId)) ?? 0) + 1); missed.set(s(a.studentId), m);
  }
  const diagMap = new Map<string, Set<string>>();
  for (const r of [...diag].sort((a, b) => time(b.takenAt) - time(a.takenAt))) {
    if (diagMap.has(s(r.studentId))) continue;
    const list = (() => { const v = typeof r.interventionSkillIds === "string" ? (() => { try { return JSON.parse(r.interventionSkillIds as string); } catch { return []; } })() : r.interventionSkillIds; return Array.isArray(v) ? v.map(s) : []; })();
    diagMap.set(s(r.studentId), new Set(list));
  }
  const flu = new Map<string, { wcpm: number; percentile: number | null; date: string }>();
  for (const f of [...fluency].sort((a, b) => time(b.checkedAt) - time(a.checkedAt))) if (!flu.has(s(f.studentId))) flu.set(s(f.studentId), { wcpm: Number(f.wcpm), percentile: f.percentile == null ? null : Number(f.percentile), date: new Date(time(f.checkedAt)).toISOString().slice(0, 10) });
  // MAP: each student's lowest sub-area of the latest test (any subject), when MAP scores exist
  const mapRows = await repo.findMany("MapResult", { studentId: { in: members } }, { select: ["studentId", "goalName", "rit", "testDate", "termName"] });
  const map = new Map<string, { area: string; rit: number | null }>();
  for (const st of members) {
    const mine = mapRows.filter((r) => s(r.studentId) === st && r.goalName).sort((a, b) => time(b.testDate) - time(a.testDate));
    if (!mine.length) continue;
    const term = s(mine[0].termName);
    const low = mine.filter((r) => s(r.termName) === term).sort((a, b) => Number(a.rit) - Number(b.rit))[0];
    map.set(st, { area: s(low.goalName), rit: Number(low.rit) });
  }
  const skillIds = [...new Set([...[...stats.values()].flatMap((m) => [...m.keys()]), ...[...diagMap.values()].flatMap((x) => [...x]), ...[...missed.values()].flatMap((m) => [...m.keys()])])];
  const skillRows: Row[] = [];
  for (let i = 0; i < skillIds.length; i += 500) skillRows.push(...(await repo.findMany("Skill", { id: { in: skillIds.slice(i, i + 500) }, deletedAt: null }, { select: ["id", "name", "code", "isActive"] })));
  const skillName = new Map(skillRows.filter((k) => k.isActive !== false && !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)]));
  return { klass, grade, members, names, skillName, stats, mastery: mast, missed, diag: diagMap, fluency: flu, map };
}

/** What the teacher reads about one student and some skills: one line per fact, with its values. */
function lines(d: PerfData, st: string, skillIds: string[]): { lines: Txt[]; sources: Set<string> } {
  const out: Txt[] = [];
  const src = new Set<string>();
  for (const k of skillIds) {
    const x = d.stats.get(st)?.get(k), m = d.mastery.get(st)?.get(k), miss = d.missed.get(st)?.get(k) ?? 0;
    const skill = d.skillName.get(k) ?? "";
    if (x) { out.push({ t: x.recent ? "{skill}: {pct}% right ({correct}/{answers}, last 30 days)" : "{skill}: {pct}% right ({correct}/{answers})", v: { skill, pct: pct(x), correct: x.correct, answers: x.answers } }); src.add(x.recent ? "Practice" : "Mastery"); }
    if (m) { out.push(m.last ? { t: "{skill}: mastery {score}, last practised {date}", v: { skill, score: m.score, date: m.last } } : { t: "{skill}: mastery {score}", v: { skill, score: m.score } }); src.add("Mastery"); }
    if (miss) { out.push({ t: "{skill}: {n} missed question(s) waiting in Second Chance", v: { skill, n: miss } }); src.add("Second Chance"); }
    if (d.diag.get(st)?.has(k)) { out.push({ t: "{skill}: suggested by the Diagnostic", v: { skill } }); src.add("Diagnostic"); }
  }
  const mp = d.map.get(st);
  if (mp) { out.push(mp.rit ? { t: "MAP: lowest area {area} (RIT {rit})", v: { area: mp.area, rit: mp.rit } } : { t: "MAP: lowest area {area}", v: { area: mp.area } }); src.add("MAP"); }
  const f = d.fluency.get(st);
  if (f) { out.push(f.percentile != null ? { t: "Fluency: {wcpm} words correct per minute (percentile {p}) on {date}", v: { wcpm: f.wcpm, p: f.percentile, date: f.date } } : { t: "Fluency: {wcpm} words correct per minute on {date}", v: { wcpm: f.wcpm, date: f.date } }); src.add("Fluency"); }
  return { lines: out, sources: src };
}

/**
 * The suggested plans of one class (the teacher's own; admins any class of the school), strongest first:
 * group / class plans for skills several students are weak in, then individual plans for the students who need
 * the most help. Nothing is created or sent here.
 */
export async function suggestPlans(repo: Repo, actor: Actor, classId: string, now = new Date(), opts: { maxGroups?: number; maxStudents?: number } = {}): Promise<SuggestedPlan[]> {
  const d = await classPerformance(repo, actor, classId, now);
  if (!d.members.length) return [];
  const known = (k: string) => d.skillName.has(k);
  // weak students per skill (accuracy under WEAK_PCT), and Diagnostic support skills
  const weak = new Map<string, { st: string; acc: number }[]>();
  for (const st of d.members) {
    for (const [k, x] of d.stats.get(st) ?? []) if (known(k) && pct(x) < WEAK_PCT) { const l = weak.get(k) ?? []; l.push({ st, acc: pct(x) }); weak.set(k, l); }
    for (const k of d.diag.get(st) ?? []) if (known(k) && !(weak.get(k) ?? []).some((w) => w.st === st) && !(d.stats.get(st)?.get(k) && pct(d.stats.get(st)!.get(k)!) >= WEAK_PCT)) {
      const l = weak.get(k) ?? []; l.push({ st, acc: d.stats.get(st)?.get(k) ? pct(d.stats.get(st)!.get(k)!) : -1 }); weak.set(k, l);
    }
  }
  const out: SuggestedPlan[] = [];
  const lessonOf = new Map<string, boolean>();
  const withLesson = async (k: string) => { if (!lessonOf.has(k)) lessonOf.set(k, await hasLesson(repo, k)); return lessonOf.get(k)!; };
  // ⚡ the lessons of every skill about to be shown, read together (not one skill after another)
  const prefetch = async (ks: string[]) => { const miss = ks.filter((k) => !lessonOf.has(k)); if (miss.length) for (const [k, v] of await hasLessons(repo, miss)) lessonOf.set(k, v); };
  const groups = [...weak].filter(([, l]) => l.length >= GROUP_MIN)
    .map(([k, l]) => { const scored = l.filter((x) => x.acc >= 0); return { k, l, avg: scored.length ? Math.round(scored.reduce((t, x) => t + x.acc, 0) / scored.length) : null }; })
    .sort((a, b) => b.l.length - a.l.length || (a.avg ?? 100) - (b.avg ?? 100) || (d.skillName.get(a.k) ?? "").localeCompare(d.skillName.get(b.k) ?? ""))
    .slice(0, opts.maxGroups ?? 4);
  const covered = new Map<string, Set<string>>();
  await prefetch(groups.map((g) => g.k));
  for (const g of groups) {
    const name = d.skillName.get(g.k)!;
    const ids = g.l.map((x) => x.st).sort();
    const scope: SuggestionScope = ids.length >= Math.ceil(0.7 * d.members.length) ? "CLASS" : "GROUP";
    const lesson = await withLesson(g.k);
    const count = 12;
    const src = new Set<string>();
    const rows = ids.map((st) => { const r = lines(d, st, [g.k]); r.sources.forEach((x) => src.add(x)); return { studentId: st, name: d.names.get(st) ?? "Student", lines: r.lines }; }).sort((a, b) => a.name.localeCompare(b.name));
    for (const st of ids) { const c = covered.get(st) ?? new Set(); c.add(g.k); covered.set(st, c); }
    out.push({
      id: sid([scope, g.k, ...ids]), scope, program: null, title: `${name} · ${scope === "CLASS" ? "class plan" : "group plan"}`,
      ...said(g.avg != null ? { t: "{n} students weak in {skill} ({pct}%)", v: { n: ids.length, skill: name, pct: g.avg } } : { t: "{n} students weak in {skill}", v: { n: ids.length, skill: name } },
        { t: `${scope === "CLASS" ? "Class plan" : "Group plan"}: {n} questions${lesson ? " + lesson" : ""}`, v: { n: count } }),
      sources: [...src], studentIds: scope === "CLASS" ? [] : ids, rows,
      sections: [{ skillId: g.k, skillName: name, count, lesson, level: g.avg != null && g.avg < 45 ? "BELOW" : "ON", reason: "Weak skill of the group" }],
    });
  }
  // individual plans: the students with the most weak skills (and missed questions) not already in a group for them
  const need = d.members.map((st) => {
    const ks = [...(d.stats.get(st) ?? [])].filter(([k, x]) => known(k) && pct(x) < WEAK_PCT).sort((a, b) => pct(a[1]) - pct(b[1])).map(([k]) => k);
    const missedSkills = [...(d.missed.get(st) ?? [])].filter(([k, n]) => known(k) && n >= 3 && !ks.includes(k)).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const diag = [...(d.diag.get(st) ?? [])].filter((k) => known(k) && !ks.includes(k) && !missedSkills.includes(k));
    const all = [...ks, ...missedSkills, ...diag].filter((k) => !covered.get(st)?.has(k)).slice(0, 3);
    const weight = ks.length * 2 + missedSkills.length + diag.length + (d.fluency.get(st)?.percentile != null && d.fluency.get(st)!.percentile! < 25 ? 1 : 0);
    return { st, all, weight, ks };
  }).filter((x) => x.all.length > 0).sort((a, b) => b.weight - a.weight || (d.names.get(a.st) ?? "").localeCompare(d.names.get(b.st) ?? "")).slice(0, opts.maxStudents ?? 6);
  await prefetch(need.flatMap((n) => n.all));
  for (const n of need) {
    const name = d.names.get(n.st) ?? "Student";
    const r = lines(d, n.st, n.all);
    const sections = [];
    for (const k of n.all) {
      const x = d.stats.get(n.st)?.get(k);
      sections.push({ skillId: k, skillName: d.skillName.get(k)!, count: 8, lesson: await withLesson(k), level: (x && pct(x) < 45 ? "BELOW" : "ON") as "BELOW" | "ON", reason: x ? "Weak skill" : d.missed.get(n.st)?.get(k) ? "Missed questions" : "Suggested by the Diagnostic" });
    }
    const first = d.stats.get(n.st)?.get(n.all[0]);
    out.push({
      id: sid(["STUDENT", n.st, ...n.all]), scope: "STUDENT", program: null, title: `${name} · individual plan`,
      ...said(first ? (n.all.length > 1 ? { t: "{name}: {skill} ({pct}% right) and {n} more skill(s)", v: { name, skill: d.skillName.get(n.all[0])!, pct: pct(first), n: n.all.length - 1 } } : { t: "{name}: {skill} ({pct}% right)", v: { name, skill: d.skillName.get(n.all[0])!, pct: pct(first) } })
        : { t: "{name}: weak in {skills}", v: { name, skills: n.all.map((k) => d.skillName.get(k)).join(", ") } },
        { t: `Individual plan: {k} skill(s), {n} questions${sections.some((x) => x.lesson) ? " + lesson" : ""}`, v: { k: sections.length, n: sections.reduce((t, x) => t + x.count, 0) } }),
      sources: [...r.sources], studentIds: [n.st], rows: [{ studentId: n.st, name, lines: r.lines }], sections,
    });
  }
  return out;
}

/** The strongest skills of some students (manual "suggest for these students", Enrichment): up to `n`, most students first. */
export async function excellingSkillsFor(repo: Repo, actor: Actor, classId: string, studentIds: string[], n = 4, now = new Date()): Promise<{ sections: SuggestedPlan["sections"]; source: PlanSource | null }> {
  const d = await classPerformance(repo, actor, classId, now);
  const who = studentIds.length ? studentIds.filter((id) => d.members.includes(id)) : d.members;
  const count = new Map<string, { n: number; sum: number }>();
  for (const st of who) for (const [k, x] of d.stats.get(st) ?? []) if (d.skillName.has(k) && pct(x) >= STRONG_PCT && x.answers >= MIN_ANSWERS_STRONG) { const c = count.get(k) ?? { n: 0, sum: 0 }; c.n++; c.sum += pct(x); count.set(k, c); }
  const top = [...count].sort((a, b) => b[1].n - a[1].n || b[1].sum / b[1].n - a[1].sum / a[1].n).slice(0, n);
  if (!top.length) return { sections: [], source: null };
  const sections: SuggestedPlan["sections"] = [];
  for (const [k] of top) sections.push({ skillId: k, skillName: d.skillName.get(k)!, count: who.length === 1 ? 8 : 12, lesson: false, level: "ABOVE", reason: "Excelling skill" });
  const src = new Set<string>();
  const rows = who.map((st) => { const r = lines(d, st, top.map(([k]) => k)); r.sources.forEach((x) => src.add(x)); return { name: d.names.get(st) ?? "Student", lines: r.lines }; }).filter((r) => r.lines.length).slice(0, 40);
  const reasonT: Txt = { t: who.length === 1 ? "Strongest skills of {name}: {list}" : "Strongest skills of these {n} students: {list}", v: { name: d.names.get(who[0]) ?? "", n: who.length, list: top.map(([k, c]) => `${d.skillName.get(k)} (${Math.round(c.sum / c.n)}%)`).join(", ") } };
  return { sections, source: { reason: fmt(reasonT), reasonT, sources: [...src], rows } };
}

/** 🆕 r90 (multi-expert audit, Oct 2026): one student's recent accuracy on one skill, reusing classPerformance's
 * already-bounded per-skill Stat — null when there isn't enough data to judge (same MIN_ANSWERS bar as everywhere
 * else). Used only to WARN a teacher who manually picks Enrichment as Source for a student who isn't (by this same
 * data) actually excelling yet — never to block the assignment. */
export async function studentSkillAccuracy(repo: Repo, actor: Actor, classId: string, studentId: string, skillId: string, now = new Date()): Promise<number | null> {
  const d = await classPerformance(repo, actor, classId, now);
  const x = d.stats.get(studentId)?.get(skillId);
  return x ? pct(x) : null;
}

// 🩹 r94-follow-up (perf-budgets fix, Oct 2026): classPerformance is ~9 DB calls (batched, but not free). The Teacher
// Home page calls excellingStudentCount on EVERY render (cold or warm) to fill the "Enrichment opportunities" tile,
// which was pushing /teacher over its DB-call budget on both the first and the cached ("next") render. A short TTL
// cache (same 15s pattern as week-plan.ts's navCache/weekSuggestionsCache) makes repeat renders within a few
// seconds free, matching how the rest of this page's "at a glance" numbers already behave.
const excellingCountCache = new TtlCache<number>(15_000, 2000);

/** 🏠 Teacher Home's "Enrichment opportunities" tile: how many of the class's students have at least one skill
 * currently excelling (STRONG_PCT, MIN_ANSWERS_STRONG) — the Enrichment-ready counterpart of "Needs attention".
 * Cheap: reuses classPerformance's already-bounded reads, no plan text is built; cached 15s per class. */
export async function excellingStudentCount(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<number> {
  // keyed by actor+class (not class alone): classPerformance's own assertClassAccess runs only inside the loader,
  // so a shared-by-class-only cache could hand a cached count to a teacher who was never checked against this class.
  return excellingCountCache.getOrLoad(`${actor.userId}:${classId}`, async () => {
    const d = await classPerformance(repo, actor, classId, now);
    let n = 0;
    for (const st of d.members) {
      for (const [k, x] of d.stats.get(st) ?? []) {
        if (d.skillName.has(k) && pct(x) >= STRONG_PCT && x.answers >= MIN_ANSWERS_STRONG) { n++; break; }
      }
    }
    return n;
  }, now.getTime());
}

/** The plan source saved with a draft made from a suggestion (shown in the editor). */
export const sourceOf = (x: SuggestedPlan): PlanSource => ({ reason: x.reason, reasonT: x.reasonT, sources: x.sources, rows: x.rows.map((r) => ({ name: r.name, lines: r.lines })) });
/** The reason and the summary, as English text and as sentences to translate. */
const said = (reason: Txt, summary: Txt) => ({ reason: fmt(reason), reasonT: reason, summary: fmt(summary), summaryT: summary });

/** The weakest skills of some students (manual "suggest for these students"): up to `n`, most students first. */
export async function weakestSkillsFor(repo: Repo, actor: Actor, classId: string, studentIds: string[], n = 4, now = new Date()): Promise<{ sections: SuggestedPlan["sections"]; source: PlanSource | null }> {
  const d = await classPerformance(repo, actor, classId, now);
  const who = studentIds.length ? studentIds.filter((id) => d.members.includes(id)) : d.members;
  const count = new Map<string, { n: number; sum: number }>();
  for (const st of who) for (const [k, x] of d.stats.get(st) ?? []) if (d.skillName.has(k) && pct(x) < WEAK_PCT) { const c = count.get(k) ?? { n: 0, sum: 0 }; c.n++; c.sum += pct(x); count.set(k, c); }
  const top = [...count].sort((a, b) => b[1].n - a[1].n || a[1].sum / a[1].n - b[1].sum / b[1].n).slice(0, n);
  if (!top.length) return { sections: [], source: null };
  const sections: SuggestedPlan["sections"] = [];
  for (const [k, c] of top) sections.push({ skillId: k, skillName: d.skillName.get(k)!, count: who.length === 1 ? 8 : 12, lesson: await hasLesson(repo, k), level: c.sum / c.n < 45 ? "BELOW" : "ON", reason: "Weak skill" });
  const src = new Set<string>();
  const rows = who.map((st) => { const r = lines(d, st, top.map(([k]) => k)); r.sources.forEach((x) => src.add(x)); return { name: d.names.get(st) ?? "Student", lines: r.lines }; }).filter((r) => r.lines.length).slice(0, 40);
  const reasonT: Txt = { t: who.length === 1 ? "Weakest skills of {name}: {list}" : "Weakest skills of these {n} students: {list}", v: { name: d.names.get(who[0]) ?? "", n: who.length, list: top.map(([k, c]) => `${d.skillName.get(k)} (${Math.round(c.sum / c.n)}%)`).join(", ") } };
  return { sections, source: { reason: fmt(reasonT), reasonT, sources: [...src], rows } };
}
