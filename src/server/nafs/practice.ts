/**
 * 🇸🇦 NAFS center — Tool 1: ADAPTIVE NAFS PRACTICE.
 *
 * The teacher picks NAFS skills and / or Ministry standards (or specific questions), a Grade 6 class or chosen students
 * of it, and optionally the number of questions per student, a time limit and a due date. Each student then practises
 * one question at a time and the next question ADAPTS like the platform's adaptive practice does (step up after a right
 * answer, step down after a wrong one), within the chosen targets:
 *   - every target starts at Medium; right → one step harder, wrong → one step easier (Easy · Medium · Hard);
 *   - the target practised next is the open one with the fewest answers (balanced over the chosen targets);
 *   - a target is shown MASTERY when 4 of its last 5 answers are right with at least 2 of those right answers at
 *     Medium or Hard; the practice stops when every target shows it, at the number of questions, at the time limit,
 *     or when the center has no new question left;
 *   - passage questions come with their passage (the same passage is kept while it fits); never the same question
 *     twice in a practice; questions the student answered in NAFS practice in the last 30 days come last.
 * Everything is stored in the NAFS tables ONLY (NafsPractice, NafsPracticeRun, NafsPracticeAnswer): the platform's
 * attempts, mastery, abilities and levels are never read or written here (the adaptive engine stays untouched).
 * The teacher sees per student and target: the difficulty reached, accuracy, mastery and time spent. Students never
 * see level words.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertNafs } from "../teacher/nafs-access";
import { seededShuffle } from "../practice/items";
import { hideLevels } from "../../lib/hide-levels";
import { DIFFICULTIES, DIFFICULTY_NAME, domainOf, isAdaptiveChoice, MAX_NAFS_MINUTES, MOE_BY_CODE, SKILL_BY_CODE, type Difficulty, type DifficultyMix } from "./framework";
import { isTargetCode, loadNafsQuestions, matchesTarget, nafsIndex, usable, type NafsEntry } from "./bank";
import { assignedTo, grade6Class, json, nafsClasses } from "./tests";
import { paragraphsOf } from "./student";
import { isRapidGuess } from "../practice/guessing";
import { cellOf, classLine, roundPct, strengthsWeaknesses, type ClassLine, type NoneWhy } from "./strengths";
import { nafsRemoved } from "./removed";
import { cancelIndex } from "../student/cancelled-work";
import { synAntFeedback } from "../../lib/syn-ant-feedback";
import { dueVocabQuestionIds, type VocabAttempt } from "../../lib/vocab-review-schedule";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const iso = (v: unknown) => d(v)?.toISOString() ?? null;

export const DEFAULT_PRACTICE_QUESTIONS = 20;
export const MAX_PRACTICE_QUESTIONS = 60;
export const MAX_TARGETS = 13;
/** Mastery: RIGHT of the last WINDOW answers right, with at least HARDER of those right answers at Medium or Hard. */
export const MASTERY = { WINDOW: 5, RIGHT: 4, HARDER: 2 } as const;
export const START_LEVEL: Difficulty = 2;
export const RECENT_DAYS = 30;
/** One answer counts at most this long towards the time spent (a left-open tab is not practice time). */
const MAX_ANSWER_MS = 10 * 60_000;
/** Spaced-repetition vocabulary review (src/lib/vocab-review-schedule.ts): at most this many previously-missed,
 *  now-due vocabulary questions are slipped into one practice run. */
export const MAX_VOCAB_REVIEW_PER_RUN = 3;

export const targetName = (code: string): string => SKILL_BY_CODE.get(code)?.name ?? MOE_BY_CODE.get(code)?.text ?? code;
export const targetShort = (code: string): string => MOE_BY_CODE.get(code)?.short ?? SKILL_BY_CODE.get(code)?.name ?? code;

// ------------------------------------------------------------------ the adaptive core (pure)

export interface TargetState {
  /** the difficulty the next question of this target aims at */
  level: Difficulty;
  n: number; right: number;
  /** the last answers (oldest first): [difficulty, 1 right / 0 wrong] */
  last: [Difficulty, 0 | 1][];
  mastered: boolean;
  /** the hardest difficulty answered right (0 = none yet) */
  reached: Difficulty | 0;
  ms: number;
}
export interface RunState {
  targets: Record<string, TargetState>;
  /** the question on screen now */
  cur: { questionId: string; target: string; difficulty: Difficulty; at: string } | null;
  /** every question shown in this practice (never twice) */
  used: string[];
  /** why it ended: every target mastered · the number of questions · the time · no new question */
  end?: "MASTERED" | "COUNT" | "TIME" | "EMPTY";
}

export function newRunState(targets: string[]): RunState {
  return { targets: Object.fromEntries(targets.map((t) => [t, { level: START_LEVEL, n: 0, right: 0, last: [], mastered: false, reached: 0, ms: 0 }])), cur: null, used: [] };
}

/** 4 of the last 5 right, with at least 2 of the right ones at Medium or Hard. */
export function isMastered(last: [Difficulty, 0 | 1][]): boolean {
  const w = last.slice(-MASTERY.WINDOW);
  if (w.length < MASTERY.WINDOW) return false;
  const right = w.filter(([, r]) => r === 1);
  return right.length >= MASTERY.RIGHT && right.filter(([dif]) => dif >= 2).length >= MASTERY.HARDER;
}

/** The state after one answer: harder after a right answer, easier after a wrong one (Easy ↔ Hard bounds). */
export function afterAnswer(state: RunState, target: string, difficulty: Difficulty, correct: boolean, ms = 0): RunState {
  const prev = state.targets[target] ?? { level: START_LEVEL, n: 0, right: 0, last: [], mastered: false, reached: 0, ms: 0 };
  const last = [...prev.last, [difficulty, correct ? 1 : 0] as [Difficulty, 0 | 1]].slice(-MASTERY.WINDOW);
  const level = (correct ? Math.min(3, difficulty + 1) : Math.max(1, difficulty - 1)) as Difficulty;
  const next: TargetState = {
    level, n: prev.n + 1, right: prev.right + (correct ? 1 : 0), last, ms: prev.ms + Math.max(0, ms),
    reached: correct && difficulty > prev.reached ? difficulty : prev.reached,
    mastered: prev.mastered || isMastered(last),
  };
  return { ...state, targets: { ...state.targets, [target]: next }, cur: null };
}

export interface NextPick { target: string; entry: NafsEntry }
/**
 * The next question: the open target (not mastered, a question left) with the fewest answers, then its question
 * nearest to the target's level — not used in this practice; not answered recently; the same passage as the last
 * question first; a fair (seeded) order between equals. null = nothing left (the reason is in `why`).
 */
export function pickNext(pool: NafsEntry[], order: string[], state: RunState, opts: { recent: Set<string>; seed: string; prevPassage?: string | null }): { pick: NextPick | null; why: RunState["end"] | null } {
  const used = new Set(state.used);
  const cands = new Map(order.map((t) => [t, pool.filter((e) => !used.has(e.id) && matchesTarget(e, t))]));
  const open = order.filter((t) => !state.targets[t]?.mastered);
  if (!open.length) return { pick: null, why: "MASTERED" };
  const withQs = open.filter((t) => (cands.get(t) ?? []).length > 0);
  if (!withQs.length) return { pick: null, why: "EMPTY" };
  const target = [...withQs].sort((a, b) => (state.targets[a]?.n ?? 0) - (state.targets[b]?.n ?? 0) || order.indexOf(a) - order.indexOf(b))[0];
  const level = state.targets[target]?.level ?? START_LEVEL;
  const list = seededShuffle(cands.get(target)!, `${opts.seed}:${target}:${state.used.length}`);
  list.sort((a, b) => Math.abs(a.difficulty - level) - Math.abs(b.difficulty - level)
    || Number(opts.recent.has(a.id)) - Number(opts.recent.has(b.id))
    || Number(Boolean(opts.prevPassage && b.passageId === opts.prevPassage)) - Number(Boolean(opts.prevPassage && a.passageId === opts.prevPassage)));
  return { pick: { target, entry: list[0] }, why: null };
}

// ------------------------------------------------------------------ the teacher: give, list, remove

function schoolOf(actor: Actor): string { if (!actor.schoolId) throw new ForbiddenError("No school."); return actor.schoolId; }
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

export interface PracticeInput { title: string; targets: string[]; questionIds?: string[] | null; classId: string; studentIds?: string[] | null; maxQuestions?: number | null; timeLimitMin?: number | null; dueAt?: Date | null;
  /** the teacher's difficulty: Adaptive / Any (default: the engine moves over Easy · Medium · Hard), one level, or a mix */
  difficulty?: unknown }

/** The practice's difficulty: null = adaptive over every level; else one level (100) or a mix of percentages. */
export function practiceMix(v: unknown): DifficultyMix | null {
  if (v === null || v === undefined || v === "" || v === "ANY" || isAdaptiveChoice(v)) return null;
  if (v === 1 || v === 2 || v === 3 || v === "1" || v === "2" || v === "3") { const k = Number(v) as Difficulty; return { 1: 0, 2: 0, 3: 0, [k]: 100 } as DifficultyMix; }
  let o: unknown = v;
  if (typeof v === "string") { try { o = JSON.parse(v); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const pct = (x: unknown) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; };
  const mix = { 1: pct(r[1] ?? r["1"]), 2: pct(r[2] ?? r["2"]), 3: pct(r[3] ?? r["3"]) } as DifficultyMix;
  return mix[1] + mix[2] + mix[3] > 0 ? mix : null;
}

/**
 * The questions of a practice with a fixed difficulty: at most `cap`, shared over the levels by the mix (largest
 * remainder) and over the targets (round robin), passage questions of a chosen passage first; levels the center lacks
 * are filled from the nearest level. Pure.
 */
export function questionsForMix(pool: NafsEntry[], targets: string[], mix: DifficultyMix, cap: number, seed: string): string[] {
  const sum = DIFFICULTIES.reduce((a, k) => a + mix[k], 0) || 1;
  const raw = DIFFICULTIES.map((k) => ({ k, v: (cap * mix[k]) / sum }));
  const want = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.v)])) as Record<Difficulty, number>;
  let left = cap - raw.reduce((a, r) => a + Math.floor(r.v), 0);
  for (const r of [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) { if (left <= 0) break; if (mix[r.k] > 0) { want[r.k]++; left--; } }
  const taken = new Set<string>();
  const out: string[] = [];
  const order = targets.length ? targets : ["*"];
  for (const k of DIFFICULTIES) {
    if (!want[k]) continue;
    const queues = order.map((t) => seededShuffle(pool.filter((e) => e.difficulty === k && (t === "*" || matchesTarget(e, t))), `${seed}:${t}:${k}`));
    let n = 0, moved = true;
    while (n < want[k] && moved) {
      moved = false;
      for (const q of queues) {
        const e = q.find((x) => !taken.has(x.id));
        if (!e || n >= want[k]) continue;
        taken.add(e.id); out.push(e.id); n++; moved = true;
      }
    }
  }
  // the center lacks some level: the nearest levels fill the rest (a single level stays strict)
  const one = DIFFICULTIES.filter((k) => mix[k] > 0);
  if (out.length < cap && one.length > 1) for (const e of seededShuffle(pool, `${seed}:fill`)) { if (out.length >= cap) break; if (!taken.has(e.id) && mix[e.difficulty] > 0) { taken.add(e.id); out.push(e.id); } }
  return out;
}

/** The pool a practice draws from: usable multiple-choice questions of the center, of its targets or its chosen ids. */
export async function practicePool(repo: Repo, schoolId: string, p: { targets: string[]; questionIds: string[] | null }): Promise<NafsEntry[]> {
  const all = (await nafsIndex(repo, schoolId)).filter((e) => usable(e) && e.kind === "MCQ");
  if (p.questionIds?.length) { const ids = new Set(p.questionIds); return all.filter((e) => ids.has(e.id)); }
  return all.filter((e) => p.targets.some((t) => matchesTarget(e, t)));
}

/** "Give adaptive practice": a Grade 6 class or chosen students of it. Students find it in their NAFS icon. */
export async function createNafsPractice(repo: Repo, actor: Actor, input: PracticeInput, now = new Date()): Promise<{ id: string; students: number }> {
  await assertNafs(repo, actor);
  const schoolId = schoolOf(actor);
  const title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 150);
  if (!title) throw new ValidationError("Give the practice a name.");
  let targets = [...new Set((Array.isArray(input.targets) ? input.targets : []).map(s).filter(isTargetCode))].slice(0, MAX_TARGETS);
  const picked = [...new Set((Array.isArray(input.questionIds) ? input.questionIds : []).map(s).filter(Boolean))].slice(0, MAX_PRACTICE_QUESTIONS * 2);
  let questionIds: string[] | null = null;
  if (picked.length) {
    const idx = new Map((await nafsIndex(repo, schoolId)).filter((e) => usable(e) && e.kind === "MCQ").map((e) => [e.id, e]));
    if (picked.some((id) => !idx.has(id))) throw new ValidationError("A chosen question is not a multiple-choice question of the NAFS center.");
    questionIds = picked;
    // the targets of chosen questions: their NAFS skills (unless the teacher chose targets that cover them)
    if (!targets.length) targets = [...new Set(picked.map((id) => idx.get(id)!.nafsCode))].slice(0, MAX_TARGETS);
    else if (picked.some((id) => !targets.some((t) => matchesTarget(idx.get(id)!, t)))) throw new ValidationError("Each chosen question must belong to a chosen skill or standard.");
  }
  if (!targets.length) throw new ValidationError("Choose at least one NAFS skill or Ministry standard.");
  const klass = await grade6Class(repo, actor, s(input.classId));
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const chosen = Array.isArray(input.studentIds) && input.studentIds.length ? [...new Set(input.studentIds.map(s))] : null;
  if (chosen && chosen.some((x) => !members.includes(x))) throw new ValidationError("Choose students of this class.");
  const num = (v: unknown, max: number, what: string): number | null => {
    if (v === null || v === undefined || s(v) === "") return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 1 || n > max) throw new ValidationError(`${what} must be 1 to ${max}.`);
    return n;
  };
  const maxQuestions = num(input.maxQuestions, MAX_PRACTICE_QUESTIONS, "The number of questions");
  const timeLimitMin = num(input.timeLimitMin, MAX_NAFS_MINUTES, "The time (minutes)");
  const dueAt = d(input.dueAt);
  if (dueAt && dueAt <= now) throw new ValidationError("The due date must be in the future.");
  let pool = await practicePool(repo, schoolId, { targets, questionIds });
  // a fixed difficulty (one level or a mix): the practice adapts inside the questions of that difficulty
  const mix = practiceMix(input.difficulty);
  if (mix && pool.length) {
    const ids = questionsForMix(pool, targets, mix, MAX_PRACTICE_QUESTIONS * 2, `${title}:${klass.id}`);
    if (!ids.length) throw new ValidationError("The NAFS center has no question of this difficulty for these skills yet.");
    questionIds = ids;
    const keep = new Set(ids);
    pool = pool.filter((e) => keep.has(e.id));
  }
  if (!pool.length) throw new ValidationError("The NAFS center has no multiple-choice question for these skills yet.");
  const p = await repo.create("NafsPractice", { schoolId, createdById: actor.userId, title, targets, questionIds, classId: klass.id, studentIds: chosen, maxQuestions, timeLimitMin, dueAt, createdAt: now });
  const who = chosen ?? members;
  const st = who.length ? await repo.findMany("Student", { id: { in: who } }, { select: ["userId"] }) : [];
  if (st.length) await repo.createMany("Notification", st.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "New NAFS practice", body: `${title}.${dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : ""}`, link: "/student/nafs?part=practice", createdAt: now })));
  await audit(repo, { actorId: actor.userId, action: "nafs.practice.create", entityType: "NafsPractice", entityId: s(p.id), after: { targets, questions: questionIds?.length ?? null, classId: klass.id, students: who.length, difficulty: mix ?? "ADAPTIVE" }, at: now });
  return { id: s(p.id), students: who.length };
}

async function ownPractice(repo: Repo, actor: Actor, id: string, edit = false): Promise<Row> {
  await assertNafs(repo, actor);
  const p = await repo.findUnique("NafsPractice", { id });
  if (!p || p.deletedAt || s(p.schoolId) !== schoolOf(actor)) throw new ForbiddenError("Practice not found.");
  if (!isAdmin(actor) && !(await nafsClasses(repo, actor)).some((c) => c.id === s(p.classId))) throw new ForbiddenError("Practice not found.");
  if (edit && !isAdmin(actor) && s(p.createdById) !== actor.userId) throw new ForbiddenError("Only the teacher who gave this practice (or an admin) can change it.");
  return p;
}

/** Removes a practice (kept in the database: deletedAt). */
export async function deleteNafsPractice(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const p = await ownPractice(repo, actor, id, true);
  await repo.updateMany("NafsPractice", { id: p.id }, { deletedAt: now });
  nafsRemoved();
  await audit(repo, { actorId: actor.userId, action: "nafs.practice.delete", entityType: "NafsPractice", entityId: id, at: now });
}

export interface PracticeRow { id: string; title: string; targets: string[]; classId: string; className: string; students: number; started: number; finished: number; allMastered: number; maxQuestions: number; minutes: number | null; dueAt: string | null; open: boolean; createdAt: string; mine: boolean }
/** The practices of the actor's Grade 6 classes, newest first (at most 100). Runs counted with one read. */
export async function listNafsPractice(repo: Repo, actor: Actor, now = new Date()): Promise<PracticeRow[]> {
  await assertNafs(repo, actor);
  const classes = await nafsClasses(repo, actor);
  if (!classes.length) return [];
  const cx = await cancelIndex(repo, schoolOf(actor));
  // r82: a practice cancelled for everyone on the Assigned page is gone from the list too (Undo there brings it back)
  const rows = (await repo.findMany("NafsPractice", { schoolId: schoolOf(actor), classId: { in: classes.map((c) => c.id) }, deletedAt: null }, { select: ["id", "title", "targets", "classId", "studentIds", "maxQuestions", "timeLimitMin", "dueAt", "createdAt", "createdById"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 }))
    .filter((p) => cx.liveRef("NAFS_PRACTICE", s(p.id)));
  if (!rows.length) return [];
  const runs = await repo.findMany("NafsPracticeRun", { practiceId: { in: rows.map((r) => s(r.id)) } }, { select: ["practiceId", "state", "finishedAt"] });
  return rows.map((p) => {
    const c = classes.find((x) => x.id === s(p.classId))!;
    const mine = runs.filter((r) => s(r.practiceId) === s(p.id));
    const due = d(p.dueAt);
    return {
      id: s(p.id), title: s(p.title), targets: json<string[]>(p.targets, []), classId: c.id, className: c.name, students: assignedTo(p)?.length ?? c.students.length,
      started: mine.length, finished: mine.filter((r) => r.finishedAt).length,
      allMastered: mine.filter((r) => { const st = json<RunState | null>(r.state, null); return st ? Object.values(st.targets).every((t) => t.mastered) : false; }).length,
      maxQuestions: p.maxQuestions ? Number(p.maxQuestions) : DEFAULT_PRACTICE_QUESTIONS, minutes: p.timeLimitMin ? Number(p.timeLimitMin) : null,
      dueAt: iso(p.dueAt), open: !due || due > now, createdAt: iso(p.createdAt) ?? "", mine: s(p.createdById) === actor.userId,
    };
  });
}

export interface PracticeCell { n: number; right: number; pct: number | null; reached: Difficulty | 0; level: Difficulty; mastered: boolean; seconds: number }
/** r70: each student's score, right, wrong (= asked − right), finished, top strength / weakness (strengths.ts). */
export interface PracticeStudent { id: string; name: string; status: "NOT_STARTED" | "IN_PROGRESS" | "DONE"; asked: number; correct: number; right: number; wrong: number; finished: boolean; pct: number | null; seconds: number; end: RunState["end"] | null; cells: Record<string, PracticeCell>; strength: string | null; weakness: string | null; strengthWhy: NoneWhy | null; weaknessWhy: NoneWhy | null }
export interface PracticeReport {
  id: string; title: string; className: string; targets: { code: string; short: string; name: string }[]; maxQuestions: number; minutes: number | null; dueAt: string | null;
  students: PracticeStudent[];
  /** r70: the class line (average of the students who answered, finished of those it was given to, strongest / weakest target) */
  cls: ClassLine;
}
/** The report from the practice's runs (pure: the tests build it from rows). */
export function practiceReportOf(meta: Omit<PracticeReport, "students" | "cls" | "targets">, targets: string[], students: { id: string; name: string }[], runs: Row[]): PracticeReport {
  const rows: PracticeStudent[] = students.map((x) => {
    const r = runs.find((y) => s(y.studentId) === x.id);
    const st = r ? json<RunState | null>(r.state, null) : null;
    const asked = Number(r?.asked ?? 0), correct = Number(r?.correct ?? 0);
    const cells: Record<string, PracticeCell> = Object.fromEntries(targets.map((code) => {
      const t = st?.targets[code];
      return [code, { n: t?.n ?? 0, right: t?.right ?? 0, pct: t?.n ? roundPct(t.right, t.n) : null, reached: t?.reached ?? 0, level: t?.level ?? START_LEVEL, mastered: Boolean(t?.mastered), seconds: Math.round((t?.ms ?? 0) / 1000) }];
    }));
    const sw = strengthsWeaknesses(Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, { pct: c.pct, n: c.n }])));
    const status = !r ? "NOT_STARTED" as const : r.finishedAt ? "DONE" as const : "IN_PROGRESS" as const;
    return {
      id: x.id, name: x.name, status, asked, correct, right: correct, wrong: asked - correct, finished: status === "DONE",
      pct: roundPct(correct, asked), seconds: Number(r?.seconds ?? 0), end: st?.end ?? null, cells,
      strength: sw.top, weakness: sw.weak, strengthWhy: sw.topWhy, weaknessWhy: sw.weakWhy,
    };
  });
  const pooled = Object.fromEntries(targets.map((code) => { const right = rows.reduce((a, x) => a + x.cells[code].right, 0), n = rows.reduce((a, x) => a + x.cells[code].n, 0); return [code, cellOf(right, n)]; }));
  return { ...meta, targets: targets.map((code) => ({ code, short: targetShort(code), name: targetName(code) })), students: rows, cls: classLine(rows.map((x) => ({ pct: x.pct, finished: x.finished })), pooled, rows.length) };
}
/** Per student per target: the difficulty reached, accuracy, mastered or not, time spent (teacher-facing). */
export async function nafsPracticeReport(repo: Repo, actor: Actor, id: string): Promise<PracticeReport> {
  const p = await ownPractice(repo, actor, id);
  const klass = (await nafsClasses(repo, actor)).find((c) => c.id === s(p.classId));
  const targets = json<string[]>(p.targets, []);
  const who = assignedTo(p);
  const students = (klass?.students ?? []).filter((x) => !who || who.includes(x.id));
  const runs = students.length ? await repo.findMany("NafsPracticeRun", { practiceId: s(p.id), studentId: { in: students.map((x) => x.id) } }, { select: ["studentId", "state", "asked", "correct", "seconds", "finishedAt"] }) : [];
  return practiceReportOf({ id: s(p.id), title: s(p.title), className: klass?.name ?? "", maxQuestions: p.maxQuestions ? Number(p.maxQuestions) : DEFAULT_PRACTICE_QUESTIONS, minutes: p.timeLimitMin ? Number(p.timeLimitMin) : null, dueAt: iso(p.dueAt) }, targets, students, runs);
}

// ------------------------------------------------------------------ the student: my practice, the next question, an answer

function studentOf(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students practise.");
  return actor.studentId;
}

/** The practices given to the student (their class, or chosen), newest first. */
async function myPracticeRows(repo: Repo, studentId: string): Promise<Row[]> {
  const classes = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
  if (!classes.length) return [];
  const rows = await repo.findMany("NafsPractice", { classId: { in: classes }, deletedAt: null }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 });
  // r82: cancelled on the teacher's Assigned page (for everyone or for this student) = gone from the student's NAFS too
  const cx = rows.length ? await cancelIndex(repo, s(rows[0].schoolId)) : null;
  return rows.filter((p) => { const who = assignedTo(p); return (!who || who.includes(studentId)) && (!cx || cx.liveRef("NAFS_PRACTICE", s(p.id), studentId)); });
}

export interface MyPractice { id: string; title: string; skills: string[]; asked: number; correct: number; max: number; minutes: number | null; dueAt: string | null; status: "TODO" | "IN_PROGRESS" | "DONE" }
export async function myNafsPractice(repo: Repo, actor: Actor): Promise<MyPractice[]> {
  const studentId = studentOf(actor);
  const rows = await myPracticeRows(repo, studentId);
  if (!rows.length) return [];
  const runs = await repo.findMany("NafsPracticeRun", { studentId, practiceId: { in: rows.map((p) => s(p.id)) } }, { select: ["practiceId", "asked", "correct", "finishedAt"] });
  return rows.map((p) => {
    const r = runs.find((x) => s(x.practiceId) === s(p.id));
    return {
      id: s(p.id), title: hideLevels(s(p.title)), skills: json<string[]>(p.targets, []).map(targetName), asked: Number(r?.asked ?? 0), correct: Number(r?.correct ?? 0),
      max: p.maxQuestions ? Number(p.maxQuestions) : DEFAULT_PRACTICE_QUESTIONS, minutes: p.timeLimitMin ? Number(p.timeLimitMin) : null, dueAt: iso(p.dueAt),
      status: !r ? "TODO" : r.finishedAt ? "DONE" : "IN_PROGRESS",
    };
  });
}

export interface NafsHistoryPoint { label: string; pct: number }
/**
 * 🆕 feature (Oct 2026): "My practice score over time" — one point per FINISHED adaptive NAFS practice run (any
 * practice, any target mix), oldest first, score = correct ÷ asked of that run. NAFS has one skill area (reading),
 * so one overall trend line is the natural shape here (unlike MAP's per-subject chart) — mirrors the same simple
 * inline-SVG LineChart (src/components/nafs/charts.tsx) already used elsewhere in the NAFS section. At most the
 * last 12 runs, so the chart stays readable; empty before a student's third-ever finished run would read as noise,
 * so the page only renders it once there is something to show (2+ points).
 */
export async function nafsPracticeHistory(repo: Repo, studentId: string): Promise<NafsHistoryPoint[]> {
  const rows = await repo.findMany("NafsPracticeRun", { studentId, finishedAt: { not: null } },
    { select: ["asked", "correct", "finishedAt"], orderBy: [{ field: "finishedAt", dir: "desc" }], take: 12 });
  return rows.map((r) => ({ asked: Number(r.asked ?? 0), correct: Number(r.correct ?? 0), finishedAt: new Date(String(r.finishedAt)) }))
    .filter((r) => r.asked > 0).reverse()
    .map((r) => ({ label: r.finishedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), pct: Math.round((r.correct / r.asked) * 100) }));
}

/** The practices not finished yet (the home NAFS card). */
export async function nafsPracticeToDo(repo: Repo, actor: Actor): Promise<number> {
  if (actor.role !== "STUDENT" || !actor.studentId) return 0;
  return (await myNafsPractice(repo, actor)).filter((x) => x.status !== "DONE").length;
}

async function myPractice(repo: Repo, actor: Actor, id: string): Promise<{ p: Row; studentId: string }> {
  const studentId = studentOf(actor);
  const p = await repo.findUnique("NafsPractice", { id });
  if (!p || p.deletedAt) throw new ForbiddenError("Practice not found.");
  const member = await repo.findUnique("ClassMembership", { classId: p.classId, studentId });
  if (!member || member.leftAt) throw new ForbiddenError("Practice not found.");
  const who = assignedTo(p);
  if (who && !who.includes(studentId)) throw new ForbiddenError("Practice not found.");
  if (!(await cancelIndex(repo, s(p.schoolId))).liveRef("NAFS_PRACTICE", s(p.id), studentId)) throw new ForbiddenError("Your teacher cancelled this practice.");
  return { p, studentId };
}

export interface PracticeView {
  id: string; title: string; n: number; max: number; done: boolean; asked: number; correct: number; end: RunState["end"] | null;
  minutesLeft: number | null;
  question: { id: string; skill: string; stem: string; options: string[]; passage: { title: string; paragraphs: string[] } | null } | null;
}

async function recentOf(repo: Repo, studentId: string, now: Date): Promise<Set<string>> {
  const rows = await repo.findMany("NafsPracticeAnswer", { studentId, at: { gte: new Date(now.getTime() - RECENT_DAYS * 86_400_000) } }, { select: ["questionId"], orderBy: [{ field: "at", dir: "desc" }], take: 1000 });
  return new Set(rows.map((r) => s(r.questionId)));
}

/**
 * 🔁 Spaced-repetition vocabulary review (no new schema — src/lib/vocab-review-schedule.ts holds the pure
 * scheduling math). Reads this student's full NAFS answer history for the VOCABULARY-domain ("V") questions that
 * are actually in `pool` (so a review pick is always one the student could legitimately be given in this practice
 * anyway — same targets, same usable/MCQ rules), then asks the pure function which of them are due right now.
 * Returns an empty set (no behaviour change) when the student has no missed vocabulary question in this pool.
 */
async function dueVocabInPool(repo: Repo, studentId: string, pool: NafsEntry[], now: Date): Promise<Set<string>> {
  const vocabIds = [...new Set(pool.filter((e) => domainOf(e.nafsCode) === "V").map((e) => e.id))];
  if (!vocabIds.length) return new Set();
  const rows = await repo.findMany("NafsPracticeAnswer", { studentId, questionId: { in: vocabIds } }, { select: ["questionId", "correct", "at"] });
  const attempts: VocabAttempt[] = rows.map((r) => ({ questionId: s(r.questionId), correct: Boolean(r.correct), at: d(r.at)?.getTime() ?? 0 }));
  return dueVocabQuestionIds(attempts, now.getTime());
}

const finish = async (repo: Repo, runId: unknown, state: RunState, why: NonNullable<RunState["end"]>, now: Date) => {
  const st = { ...state, cur: null, end: why };
  await repo.updateMany("NafsPracticeRun", { id: runId }, { state: st, finishedAt: now, updatedAt: now });
  return st;
};

/**
 * The question on screen (the same one until it is answered), else the next adaptive question; finishes the practice
 * when a stop rule is met. Writes the NAFS run only. No key, no explanation before the answer.
 */
export async function nafsPracticeView(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<PracticeView> {
  const { p, studentId } = await myPractice(repo, actor, id);
  const targets = json<string[]>(p.targets, []);
  const max = p.maxQuestions ? Number(p.maxQuestions) : DEFAULT_PRACTICE_QUESTIONS;
  const limit = p.timeLimitMin ? Number(p.timeLimitMin) * 60 : null;
  let r = (await repo.findMany("NafsPracticeRun", { practiceId: s(p.id), studentId }))[0];
  if (!r) r = await repo.create("NafsPracticeRun", { practiceId: s(p.id), studentId, classId: s(p.classId), state: newRunState(targets), asked: 0, correct: 0, seconds: 0, startedAt: now, updatedAt: now });
  let state = json<RunState>(r.state, newRunState(targets));
  const asked = Number(r.asked ?? 0), correct = Number(r.correct ?? 0), seconds = Number(r.seconds ?? 0);
  const base = { id: s(p.id), title: hideLevels(s(p.title)), max, asked, correct, minutesLeft: limit ? Math.max(0, Math.ceil((limit - seconds) / 60)) : null };
  if (r.finishedAt) return { ...base, n: asked, done: true, end: state.end ?? null, question: null };
  if (!state.cur) {
    let why: RunState["end"] | null = null;
    if (asked >= max) why = "COUNT";
    else if (limit && seconds >= limit) why = "TIME";
    let pick: NextPick | null = null;
    if (!why) {
      const [pool, recent] = await Promise.all([practicePool(repo, s(p.schoolId), { targets, questionIds: json<string[] | null>(p.questionIds, null) }), recentOf(repo, studentId, now)]);
      // 🔁 spaced-repetition vocabulary review: try a due, previously-missed vocabulary question first (up to
      // MAX_VOCAB_REVIEW_PER_RUN per run — `state.used` already carries every review question injected earlier in
      // THIS run, so counting how many of those are in `due` self-limits with no extra state to store).
      const due = await dueVocabInPool(repo, studentId, pool, now);
      if (due.size) {
        const injectedSoFar = state.used.filter((id) => due.has(id)).length;
        if (injectedSoFar < MAX_VOCAB_REVIEW_PER_RUN) {
          const entry = pool.find((e) => due.has(e.id) && !state.used.includes(e.id));
          if (entry) pick = { target: entry.nafsCode, entry };
        }
      }
      if (!pick) {
        const prevId = state.used[state.used.length - 1];
        const prev = prevId ? pool.find((e) => e.id === prevId) : undefined;
        const res = pickNext(pool, targets, state, { recent, seed: `${s(p.id)}:${studentId}`, prevPassage: prev?.passageId ?? null });
        pick = res.pick; why = res.why;
      }
    }
    if (!pick) { state = await finish(repo, r.id, state, why ?? "EMPTY", now); return { ...base, n: asked, done: true, end: state.end ?? null, question: null }; }
    state = { ...state, cur: { questionId: pick.entry.id, target: pick.target, difficulty: pick.entry.difficulty, at: now.toISOString() }, used: [...state.used, pick.entry.id] };
    await repo.updateMany("NafsPracticeRun", { id: r.id }, { state, updatedAt: now });
  }
  const q = (await loadNafsQuestions(repo, [state.cur!.questionId]))[0];
  if (!q) { // (a question removed meanwhile: skip it)
    state = { ...state, cur: null };
    await repo.updateMany("NafsPracticeRun", { id: r.id }, { state, updatedAt: now });
    return nafsPracticeView(repo, actor, id, now);
  }
  return {
    ...base, n: asked + 1, done: false, end: null,
    question: { id: q.id, skill: targetName(state.cur!.target), stem: q.stem, options: q.options, passage: q.passage ? { title: q.passage.title, paragraphs: paragraphsOf(q.passage.text) } : null },
  };
}

export interface PracticeFeedback { correct: boolean; answer: number; explanation: string; done: boolean; hint?: string }

/**
 * The rationale authored for one option of a question (QuestionOption.rationale — every wrong option in this bank
 * is required to have one; see data/questions/src/qb.py). Null when the option has none or does not exist.
 * Used by the synonym/antonym feedback heuristic (src/lib/syn-ant-feedback.ts) to corroborate the specific mistake.
 */
async function optionRationale(repo: Repo, questionId: string, choiceIndex: number): Promise<string | null> {
  const opts = await repo.findMany("QuestionOption", { questionId }, { select: ["rationale", "order"] });
  const sorted = [...opts].sort((a, b) => Number(a.order) - Number(b.order));
  const o = sorted[choiceIndex];
  return o && o.rationale !== null && o.rationale !== undefined && s(o.rationale) !== "" ? s(o.rationale) : null;
}

/**
 * The student's answer to the question on screen: right or wrong, the next difficulty, mastery — stored in the NAFS
 * tables only (NafsPracticeAnswer + NafsPracticeRun). Returns the right option and its explanation (practice feedback).
 */
export async function answerNafsPractice(repo: Repo, actor: Actor, input: { id: string; questionId: string; choice: unknown }, now = new Date()): Promise<PracticeFeedback> {
  const { p, studentId } = await myPractice(repo, actor, s(input.id));
  const r = (await repo.findMany("NafsPracticeRun", { practiceId: s(p.id), studentId }))[0];
  const targets = json<string[]>(p.targets, []);
  const state = json<RunState>(r?.state, newRunState(targets));
  // r68: the same answer sent again (the reply was lost on a busy server, the player retried): its saved result, nothing written
  if (r && (r.finishedAt || !state.cur || state.cur.questionId !== s(input.questionId))) {
    const replay = await savedNafsAnswer(repo, s(r.id), s(input.questionId), Boolean(r.finishedAt));
    if (replay) return replay;
  }
  if (!r || r.finishedAt) throw new ValidationError("This practice is finished.");
  if (!state.cur || state.cur.questionId !== s(input.questionId)) throw new ValidationError("This question is not on your screen any more. Open the practice again.");
  const choice = input.choice === null || input.choice === undefined || s(input.choice) === "" ? null : Number(input.choice);
  if (choice === null || !Number.isInteger(choice) || choice < 0 || choice > 3) throw new ValidationError("Choose an answer.");
  const q = (await loadNafsQuestions(repo, [state.cur.questionId]))[0];
  if (!q) throw new ValidationError("This question is not available. Open the practice again.");
  const correct = choice === q.correct;
  const started = d(state.cur.at);
  const ms = started ? Math.min(MAX_ANSWER_MS, Math.max(0, now.getTime() - started.getTime())) : 0;
  const answerRow = { runId: s(r.id), practiceId: s(p.id), studentId, questionId: q.id, target: state.cur.target, difficulty: state.cur.difficulty, choice, correct, ms, at: now };
  // 🎲 r67: a rapid guess (under 3 s) is only logged (the answer row above) — it counts for nothing: no level move,
  // no mastery, not toward the question count or accuracy
  const rapid = started !== null && isRapidGuess(ms);
  let next = rapid ? { ...state, cur: null } : afterAnswer(state, state.cur.target, state.cur.difficulty, correct, ms);
  const asked = Number(r.asked ?? 0) + (rapid ? 0 : 1), right = Number(r.correct ?? 0) + (correct && !rapid ? 1 : 0), seconds = Number(r.seconds ?? 0) + Math.round(ms / 1000);
  const max = p.maxQuestions ? Number(p.maxQuestions) : DEFAULT_PRACTICE_QUESTIONS;
  const limit = p.timeLimitMin ? Number(p.timeLimitMin) * 60 : null;
  const why: RunState["end"] | null = targets.every((t) => next.targets[t]?.mastered) ? "MASTERED" : asked >= max ? "COUNT" : limit && seconds >= limit ? "TIME" : null;
  if (why) next = { ...next, end: why };
  // r68: guarded (the run moves once): two copies of the same answer at the same moment write it once; the loser gets
  // the saved result
  const moved = await repo.transaction(async (tx) => {
    const n = await tx.updateMany("NafsPracticeRun", { id: r.id, asked: r.asked ?? 0, updatedAt: r.updatedAt, finishedAt: null }, { state: next, asked, correct: right, seconds, updatedAt: now, ...(why ? { finishedAt: now } : {}) });
    if (n !== 1) return false;
    await tx.create("NafsPracticeAnswer", answerRow);
    return true;
  });
  if (!moved) {
    const replay = await savedNafsAnswer(repo, s(r.id), q.id, false);
    if (replay) return replay;
    throw new ValidationError("This question is not on your screen any more. Open the practice again.");
  }
  // 📖 synonym/antonym error-pattern feedback (src/lib/syn-ant-feedback.ts): only for a genuine wrong answer (not a
  // rapid guess the student did not really attempt), and only when the heuristic is confident enough to say
  // something (see that file for exactly what it requires — it returns null far more often than not).
  let hint: string | undefined;
  if (!correct && !rapid) {
    const rationale = await optionRationale(repo, q.id, choice);
    const h = synAntFeedback({ nafsTarget: state.cur.target, stem: q.stem, correct: false, chosenRationale: rationale });
    if (h) hint = h.message;
  }
  return { correct, answer: q.correct, explanation: q.explanation, done: Boolean(why), ...(hint ? { hint } : {}) };
}

/** The saved result when this question is the run's LAST answer (a retry after a lost reply); null otherwise. */
async function savedNafsAnswer(repo: Repo, runId: string, questionId: string, finished: boolean): Promise<PracticeFeedback | null> {
  const last = (await repo.findMany("NafsPracticeAnswer", { runId }, { select: ["correct", "questionId", "choice", "target"], orderBy: [{ field: "at", dir: "desc" }], take: 1 }))[0];
  if (!last || String(last.questionId) !== questionId) return null;
  const q = (await loadNafsQuestions(repo, [questionId]))[0];
  if (!q) return null;
  const correct = Boolean(last.correct);
  let hint: string | undefined;
  if (!correct && last.choice !== null && last.choice !== undefined) {
    const rationale = await optionRationale(repo, questionId, Number(last.choice));
    const h = synAntFeedback({ nafsTarget: last.target ? s(last.target) : null, stem: q.stem, correct: false, chosenRationale: rationale });
    if (h) hint = h.message;
  }
  return { correct, answer: q.correct, explanation: q.explanation, done: finished, ...(hint ? { hint } : {}) };
}

/** The difficulty's English name (teacher-facing; translated in the page). */
export const reachedName = (x: Difficulty | 0) => (x ? DIFFICULTY_NAME[x] : "—");
