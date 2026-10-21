/**
 * 🚀 ReadRise placement (LevelSet-like): a short adaptive test of passages, 3 questions each.
 *
 *  Start   latest MAP Lexile (clamped 300–1400 → nearest version level), else the grade's default level.
 *  Step    3/3 → +200 · 2/3 → +100 · 1/3 → −100 · 0/3 → −200 (clamped 300–1400). After the first reversal
 *          (the direction changes) every move is ±100. A passage is never shown twice.
 *  Stop    after 8 passages, or after two reversals once at least 5 passages were read.
 *  Result  the highest level read with 2+/3 correct that is not above a level failed (0–1/3) twice; rounded to 10.
 *          MAP check: when a MAP Lexile exists and the result differs from it by more than 250, the result is the
 *          average of both (the reason says so).
 *  Then    RRStudent { level = startLevel = result, source PLACEMENT } and an RRLevelChange "Placement".
 *  Retake  once per term, when a teacher (of the student) or a school admin allows it (teacherResetPlacement). The
 *          level stays until the new test finishes.
 *  Checks  owner r69: THREE times a year (windows.ts): the first placement is the start of the year; in the middle
 *          and end windows a placed student may take it again ("Check your reading level"). A check sets the level
 *          (source PLACEMENT) but keeps the year's start (startLevel / placedAt), so growth runs start → middle → end;
 *          every finished test stores its period (RRPlacement.period).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { RR_MAX, RR_MIN } from "./level";
import { loadPlacementPassages, type PlacementPassage } from "./content-loader";
import { RETAKE_REASON, assertStaffForStudent, ensureRRStudent, initialLevel, latestMapLexile, recordLevelChange, s, toDate } from "./engine";
import { dueCheck, loadReadRiseWindows, periodOf, RR_PERIOD_NAME, type RRPeriod } from "./windows";
import { alertMapGap } from "./accuracy";
import { runAfterResponse } from "../lib/after-response";

export { setLevelByTeacher } from "./engine";

export const PLACEMENT = { maxPassages: 8, minPassages: 5, reversals: 2, mapGap: 250 } as const;
/**
 * 🐛 fix (audit finding, Oct 2026): a 4-option multiple-choice question has real guessing odds, so the ordinary pass
 * bar (2 of 3 correct) let a student "pass" the TOP level on a lucky guess — and since nothing could out-level the
 * old ceiling (1400), that single lucky pass became their final result, with no way to tell a genuinely advanced
 * reader from a guess. Two things now address this together: the scale itself gained two harder rungs (1500, 1600 —
 * see level.ts), giving a strong reader real headroom; and near whatever the TOP of the scale is (the top two rungs)
 * a pass now requires a clean 3 of 3 — a student who only gets 2 of 3 up there counts as a (soft) fail, which can
 * trigger the normal two-reversal ceiling-finding logic below instead of locking in immediately.
 */
const TOP_TIER = 1500;
const passBar = (level: number) => (level >= TOP_TIER ? 3 : 2);
export interface PlacementStep { level: number; passageId: string; answers: string[]; correct: number }

const clampP = (l: number) => Math.min(RR_MAX, Math.max(RR_MIN, l));
const BIG: Record<number, number> = { 3: 200, 2: 100, 1: -100, 0: -200 };

// ------------------------------------------------------------------ the algorithm (pure)

export interface PlacementPlan { done: boolean; nextLevel: number | null; passage: PlacementPassage | null; reversals: number }

/** Where the test goes next from the steps so far (deterministic: the same steps always give the same passage). */
export function placementPlan(startLevel: number, steps: PlacementStep[], passages: PlacementPassage[]): PlacementPlan {
  let level = clampP(startLevel), lastSign = 0, reversals = 0;
  for (const st of steps) {
    const big = BIG[Math.max(0, Math.min(3, st.correct))];
    const sign = Math.sign(big);
    if (lastSign && sign !== lastSign) reversals++;
    lastSign = sign;
    level = clampP(st.level + (reversals > 0 ? sign * 100 : big));
  }
  if (steps.length >= PLACEMENT.maxPassages || (reversals >= PLACEMENT.reversals && steps.length >= PLACEMENT.minPassages)) return { done: true, nextLevel: null, passage: null, reversals };
  const used = new Set(steps.map((x) => x.passageId));
  const free = passages.filter((p) => !used.has(p.id));
  if (!free.length) return { done: true, nextLevel: null, passage: null, reversals };
  // the target level; else the nearest level that still has a passage (ties: the direction of travel)
  const pick = [...free].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || (lastSign >= 0 ? b.level - a.level : a.level - b.level) || a.id.localeCompare(b.id))[0];
  return { done: false, nextLevel: pick.level, passage: pick, reversals };
}

/** The placement result from the steps (before the MAP check). */
export function placementResult(steps: PlacementStep[], startLevel: number): number {
  if (!steps.length) return clampP(Math.round(startLevel / 10) * 10);
  const by = new Map<number, { pass: number; fail: number }>();
  for (const st of steps) {
    const e = by.get(st.level) ?? { pass: 0, fail: 0 };
    if (st.correct >= passBar(st.level)) e.pass++; else e.fail++;
    by.set(st.level, e);
  }
  const failedTwice = [...by.entries()].filter(([, e]) => e.fail >= 2).map(([l]) => l);
  const ceiling = failedTwice.length ? Math.min(...failedTwice) : Infinity;
  const ok = [...by.entries()].filter(([l, e]) => e.pass >= 1 && (l < ceiling || (l === ceiling && e.pass > e.fail))).map(([l]) => l);
  const r = ok.length ? Math.max(...ok) : Math.min(...steps.map((x) => x.level)) - 100;
  return clampP(Math.round(r / 10) * 10);
}

/** The MAP check: averages with the MAP Lexile when they are more than 250 apart. */
export function blendWithMap(result: number, mapLexile: number | null): { level: number; note: string | null } {
  if (mapLexile === null) return { level: result, note: null };
  const m = clampP(mapLexile);
  if (Math.abs(result - m) <= PLACEMENT.mapGap) return { level: result, note: null };
  const level = Math.round((result + m) / 2 / 10) * 10;
  return { level, note: `the test result ${result} was more than ${PLACEMENT.mapGap} from the MAP Lexile ${mapLexile}, so both were averaged` };
}

// ------------------------------------------------------------------ state

const stepsOf = (p: Row): PlacementStep[] => (Array.isArray(p.steps) ? (p.steps as PlacementStep[]) : []);

export interface PlacementStatus {
  open: Row | null; last: Row | null; canStart: boolean;
  /** a teacher allowed a retake after the last test */
  retake: boolean;
  /** the reading check that is open now (middle / end of year), else null */
  due: RRPeriod | null;
}

export async function placementStatus(repo: Repo, studentId: string, now = new Date()): Promise<PlacementStatus> {
  const rows = (await repo.findMany("RRPlacement", { studentId })).sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());
  const open = rows.find((r) => !r.completedAt) ?? null;
  const last = rows.find((r) => r.completedAt) ?? null;
  if (open) return { open, last, canStart: false, retake: false, due: null };
  if (!last) return { open, last, canStart: true, retake: false, due: null };
  const done = toDate(last.completedAt).getTime();
  const allowed = (await repo.findMany("RRLevelChange", { studentId })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && toDate(c.createdAt).getTime() > done);
  // 🗓️ the middle / end of year reading check (windows.ts): open while its window is and it is not done yet
  const due = allowed ? null : dueCheck(await loadReadRiseWindows(repo, s(last.schoolId), now), now, rows.filter((r) => r.completedAt).map((r) => toDate(r.completedAt)));
  return { open, last, canStart: allowed || due !== null, retake: allowed, due };
}

function student(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take the placement.");
  return actor.studentId;
}

export interface PlacementView {
  state: "NOT_AVAILABLE" | "READY" | "IN_PROGRESS" | "DONE";
  placementId: string | null; stepNumber: number; maxSteps: number;
  passage: { id: string; title: string; text: string; questions: { stem: string; options: string[] }[] } | null;
  result: number | null; retake: boolean;
  /** owner r69: the middle / end of year reading check that is open (null: the first placement or a retake) */
  check?: RRPeriod | null;
}

/** What the student's placement page shows. Passages are injectable (tests). */
export async function placementView(repo: Repo, actor: Actor, passages: PlacementPassage[] = loadPlacementPassages(), now = new Date()): Promise<PlacementView> {
  const studentId = student(actor);
  const st = await placementStatus(repo, studentId, now);
  const base = { placementId: null, stepNumber: 0, maxSteps: PLACEMENT.maxPassages, passage: null, result: st.last ? Number(st.last.result) : null, retake: Boolean(st.last), check: st.due };
  if (st.open) {
    const steps = stepsOf(st.open);
    const plan = placementPlan(Number(st.open.startLevel), steps, passages);
    if (!plan.passage) {
      // the passages ran out (or the file changed) after some answers: finish with what we have
      if (plan.done && steps.length) {
        const fin = await finishPlacement(repo, st.open, now);
        afterPlacement(repo, studentId, now);
        return { ...base, state: "DONE", result: fin.level, retake: false };
      }
      return { ...base, state: "NOT_AVAILABLE", placementId: s(st.open.id) };
    }
    const p = plan.passage;
    return { ...base, state: "IN_PROGRESS", placementId: s(st.open.id), stepNumber: steps.length + 1, passage: { id: p.id, title: p.title, text: p.text, questions: p.questions.map((q) => ({ stem: q.stem, options: q.options })) } };
  }
  if (passages.length < 5) return { ...base, state: "NOT_AVAILABLE" };
  return { ...base, state: st.canStart ? "READY" : "DONE" };
}

/** Starts (or returns the open) placement. */
export async function startPlacement(repo: Repo, actor: Actor, now = new Date()): Promise<string> {
  const studentId = student(actor);
  const st = await placementStatus(repo, studentId, now);
  if (st.open) return s(st.open.id);
  if (!st.canStart) throw new ValidationError("You already have a ReadRise Level. Your teacher can let you take the placement again.");
  const init = await initialLevel(repo, studentId);
  const row = await repo.create("RRPlacement", { studentId, schoolId: actor.schoolId, startLevel: init.level, steps: [], startedAt: now, period: st.due });
  return s(row.id);
}

export interface PlacementAnswer { done: boolean; correct: number; result: number | null; note: string | null }

/** Scores one passage (3 answers A–D) and moves on; finishes the test when the rules say so. */
export async function answerPlacement(repo: Repo, actor: Actor, placementId: string, passageId: string, answers: string[], passages: PlacementPassage[] = loadPlacementPassages(), now = new Date()): Promise<PlacementAnswer> {
  const studentId = student(actor);
  const res = await repo.transaction(async (tx): Promise<PlacementAnswer> => {
    const p = await tx.findUnique("RRPlacement", { id: placementId });
    if (!p || p.studentId !== studentId) throw new ForbiddenError("Placement not found.");
    if (p.completedAt) throw new ValidationError("This placement is finished.");
    const steps = stepsOf(p);
    const plan = placementPlan(Number(p.startLevel), steps, passages);
    if (!plan.passage || plan.passage.id !== passageId) throw new ValidationError("This passage is no longer the current one. Reload the page.");
    const clean = answers.map((a) => String(a ?? "").trim().toUpperCase());
    if (clean.length !== 3 || clean.some((a) => !/^[ABCD]$/.test(a))) throw new ValidationError("Answer all 3 questions.");
    const correct = plan.passage.questions.filter((q, i) => q.answer === clean[i]).length;
    const next = [...steps, { level: plan.passage.level, passageId, answers: clean, correct }];
    await tx.updateMany("RRPlacement", { id: placementId }, { steps: next });
    const after = placementPlan(Number(p.startLevel), next, passages);
    if (!after.done) return { done: false, correct, result: null, note: null };
    const fin = await finishPlacement(tx, { ...p, steps: next }, now);
    return { done: true, correct, result: fin.level, note: fin.note };
  });
  if (res.done) afterPlacement(repo, studentId, now);
  return res;
}

async function finishPlacement(repo: Repo, p: Row, now: Date): Promise<{ level: number; note: string | null }> {
  const steps = stepsOf(p);
  const studentId = s(p.studentId);
  const raw = placementResult(steps, Number(p.startLevel));
  const { level, note } = blendWithMap(raw, await latestMapLexile(repo, studentId));
  const [windows, earlier] = await Promise.all([
    loadReadRiseWindows(repo, s(p.schoolId), now),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null } }, { select: ["id"] }),
  ]);
  const period = periodOf(windows, now);
  // 🗓️ a middle / end of year check keeps the year's start (growth start → middle → end); the first test (or a
  // retake at the start of the year) sets the start
  const recheck = earlier.some((r) => s(r.id) !== s(p.id)) && period !== "BOY";
  await repo.updateMany("RRPlacement", { id: p.id }, { result: level, completedAt: now, period });
  const rr = await ensureRRStudent(repo, studentId, now);
  await repo.updateMany("RRStudent", { studentId }, recheck ? { level, source: "PLACEMENT" } : { level, startLevel: level, source: "PLACEMENT", placedAt: now });
  const what = recheck ? `Placement (${RR_PERIOD_NAME[period].toLowerCase()} reading check)` : "Placement";
  await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: Number(rr.level), to: level, reason: `${what}: ${steps.length} passages, result ${level}${note ? ` (${note})` : ""}`, now });
  return { level, note };
}

/** ⚖️ ReadRise vs MAP after a finished placement: one alert for the teacher when they are far apart (after the response). */
function afterPlacement(repo: Repo, studentId: string, now: Date): void {
  runAfterResponse("readrise.map_gap", () => alertMapGap(repo, studentId, now).catch(() => false), { key: `readrise.map_gap|${studentId}` });
}

/**
 * 👩‍🏫 Lets a student take the placement again — once per term (for the teacher pages). A test the student started
 * and did not finish is restarted instead (any time). A student never placed can take the test at any time.
 */
export async function teacherResetPlacement(repo: Repo, actor: Actor, studentId: string, reason = "", now = new Date()): Promise<{ allowedAt: Date; restarted?: boolean }> {
  const st = await assertStaffForStudent(repo, actor, studentId);
  const status = await placementStatus(repo, studentId, now);
  // a test started and not finished: the teacher restarts it from the first passage (the answers so far are cleared;
  // the row stays, no level is set)
  if (status.open) {
    await repo.updateMany("RRPlacement", { id: s(status.open.id) }, { steps: [], startedAt: now });
    return { allowedAt: now, restarted: true };
  }
  if (!status.last) throw new ValidationError("The student has not taken the placement yet.");
  if (status.retake) throw new ValidationError("A retake is already allowed.");
  if (status.due) throw new ValidationError(`The ${RR_PERIOD_NAME[status.due].toLowerCase()} reading check is open: the student can take the placement now (a retake is already allowed).`);
  // this term (the current academic year's term that contains today), else the last 120 days
  const year = (await repo.findMany("AcademicYear", { schoolId: s(st.schoolId), isCurrent: true }))[0];
  const terms = year ? await repo.findMany("Term", { academicYearId: s(year.id) }) : [];
  const term = terms.find((t) => toDate(t.startDate).getTime() <= now.getTime() && toDate(t.endDate).getTime() >= now.getTime());
  const from = term ? toDate(term.startDate).getTime() : now.getTime() - 120 * 86_400_000;
  const used = (await repo.findMany("RRLevelChange", { studentId })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && toDate(c.createdAt).getTime() >= from);
  if (used) throw new ValidationError("A placement retake was already allowed this term.");
  const rr = await ensureRRStudent(repo, studentId, now);
  await recordLevelChange(repo, { studentId, schoolId: s(st.schoolId), from: Number(rr.level), to: Number(rr.level), reason: `${RETAKE_REASON} by a teacher${reason.trim() ? `: ${reason.trim()}` : ""}`, now });
  return { allowedAt: now };
}
