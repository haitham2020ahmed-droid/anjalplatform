/**
 * 🚀 ReadRise placement (LevelSet-like): a short adaptive test of passages, 3 questions each.
 *
 *  Start   latest MAP Lexile (clamped 300–1600 → nearest version level), else the grade's default level.
 *  Step    3/3 → +200 · 2/3 → +100 · 1/3 → −100 · 0/3 → −200 (clamped 300–1600); from 1200 up a 2/3 is not a pass and stays at the same level
 *          for another passage (4 Nov 2026). After the first reversal
 *          (the direction changes) every move is ±100. A passage is never shown twice.
 *  Stop    after 8 passages, or after two reversals once at least 5 passages were read.
 *  Result  the highest level read with a PASS (passBar below) that is not above a level failed twice; rounded to
 *          10. The pass bar is 2 of 3 below 1200, 3 of 3 from 1200 up (passBar, below) — a weak reader cannot
 *          "luck" past 1200 into a result that reads as advanced on a single lucky guess.
 *          MAP check: when a MAP Lexile exists and the result differs from it by more than 250, the result is the
 *          average of both (the reason says so).
 *  Then    RRStudent { level = startLevel = result, source PLACEMENT } and an RRLevelChange "Placement".
 *  Retake  once per term, when a teacher (of the student) or a school admin allows it (teacherResetPlacement). The
 *          level stays until the new test finishes.
 *  Checks  owner r69: THREE times a year (windows.ts): the first placement is the start of the year; in the middle
 *          and end windows a placed student may take it again ("Check your reading level"). A check sets the level
 *          (source PLACEMENT) but keeps the year's start (startLevel / placedAt), so growth runs start → middle → end;
 *          every finished test stores its period (RRPlacement.period).
 *          Round 4 (owner): a check starts from the student's CURRENT ReadRise level (not the MAP / grade start) and
 *          never shows a passage the student saw in an earlier placement test (testPool); when none is left at the
 *          target level, the nearest unseen passage is used (placementPlan).
 *  Rapid   round 4 (owner, the Diagnostic rule): every passage's answer time is recorded (the server's clock, and the
 *          page's when it sends one — the smaller wins). A passage answered faster than its minimum reading time
 *          (passageMinMs: at least 15 s, or a third of the passage's expected reading time when longer) does not
 *          count (no move, no result); 2+ such passages make the test "Not valid — retake": it is closed with no
 *          result (result null), the level is NOT changed, and the student can take it again at once.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { RR_MAX, RR_MIN } from "./level";
import { loadPlacementPassages, type PlacementPassage } from "./content-loader";
import { RETAKE_REASON, assertStaffForStudent, ensureRRStudent, initialLevel, latestMapLexile, recordLevelChange, s, toDate } from "./engine";
import { firstAnswerThresholdMs } from "./accuracy";
import { dueCheck, loadReadRiseWindows, periodOf, RR_PERIOD_NAME, type RRPeriod } from "./windows";
import { alertMapGap } from "./accuracy";
import { runAfterResponse } from "../lib/after-response";
import { ADMIN_RESET_TAG } from "./placement-reset";

export { setLevelByTeacher } from "./engine";

export const PLACEMENT = { maxPassages: 8, minPassages: 5, reversals: 2, mapGap: 250 } as const;
/**
 * 🐛 fix (audit finding, Oct 2026): a 4-option multiple-choice question has real guessing odds, so the ordinary pass
 * bar (2 of 3 correct) let a student "pass" the TOP level on a lucky guess — and since nothing could out-level the
 * old ceiling (1400), that single lucky pass became their final result, with no way to tell a genuinely advanced
 * reader from a guess. Two things now address this together: the scale itself gained two harder rungs (1500, 1600 —
 * see level.ts), giving a strong reader real headroom; and near whatever the TOP of the scale is a pass now requires
 * a clean 3 of 3 — a student who only gets 2 of 3 up there counts as a (soft) fail, which can trigger the normal
 * two-reversal ceiling-finding logic below instead of locking in immediately.
 * 🐛 fix (2nd audit finding, Oct 2026): TOP_TIER was 1500, so the same lucky-guess problem the paragraph above
 * describes was still wide open for levels 1100–1400 — a school reported a student well below grade level
 * (a struggling Grade 11 reader) reaching a final placement of 1400 purely by stringing together a few 2-of-3
 * passes (each one has real odds on a 4-option question) before the test ever reversed. Lowered to 1200 so the
 * harder 3-of-3 bar covers the whole upper quarter of the scale (1200–1600), not just its last two rungs — a
 * weak reader can no longer "luck" past 1200 into a result that reads as advanced. Levels at/below 1100 keep the
 * ordinary 2-of-3 bar (unchanged; covered by existing tests), since that part of the scale has plenty of room
 * left for the normal reversal logic to catch a one-off guess before it could ever become the final result.
 */
const TOP_TIER = 1200;
const passBar = (level: number) => (level >= TOP_TIER ? 3 : 2);
export interface PlacementStep {
  level: number; passageId: string; answers: string[]; correct: number;
  /** round 4: how long the passage + its questions took (ms), when it was recorded */
  ms?: number;
  /** round 4: answered faster than the passage's minimum reading time — the step does not count */
  rapid?: boolean;
  /** when it was answered (ISO) — the server's clock for the next passage's time */
  at?: string;
}
/** round 4: this many rapid passages make the test "Not valid — retake" (the level is not changed) */
export const PLACEMENT_RAPID_INVALID = 2;
/** round 4: the shortest time a passage and its 3 questions can be read in */
export const PLACEMENT_MIN_MS = 15_000;
const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
/** The minimum reading time of a placement passage (ms): 15 s, or a third of its expected reading time when longer. */
export const passageMinMs = (text: string): number => Math.max(PLACEMENT_MIN_MS, firstAnswerThresholdMs(wordsOf(text)));
/** The text shown for a placement test that was not valid. */
export const PLACEMENT_INVALID_TEXT = "Not valid — retake";

const clampP = (l: number) => Math.min(RR_MAX, Math.max(RR_MIN, l));
const BIG: Record<number, number> = { 3: 200, 2: 100, 1: -100, 0: -200 };

// ------------------------------------------------------------------ the algorithm (pure)

export interface PlacementPlan { done: boolean; nextLevel: number | null; passage: PlacementPassage | null; reversals: number }

/** Where the test goes next from the steps so far (deterministic: the same steps always give the same passage). */
export function placementPlan(startLevel: number, steps: PlacementStep[], passages: PlacementPassage[]): PlacementPlan {
  let level = clampP(startLevel), lastSign = 0, reversals = 0;
  // round 4: a rapid passage does not count (no move); its passage is still never shown again
  const counted = steps.filter((x) => !x.rapid);
  for (const st of counted) {
    // 🐛 fix (owner, 4 Nov 2026): from TOP_TIER up a 2 of 3 is NOT a pass (passBar), so it must not move the test UP
    // either (it used to: +100/+200, pushing a weak reader higher before the result logic caught it). It now stays
    // at the same level for another passage (a second 2 of 3 there = failed twice = the ceiling); not a reversal.
    const soft = st.correct >= 2 && st.correct < passBar(st.level);
    const big = soft ? 0 : BIG[Math.max(0, Math.min(3, st.correct))];
    const sign = Math.sign(big);
    if (sign !== 0) {
      if (lastSign && sign !== lastSign) reversals++;
      lastSign = sign;
    }
    level = clampP(st.level + (reversals > 0 ? sign * 100 : big));
  }
  if (counted.length >= PLACEMENT.maxPassages || (reversals >= PLACEMENT.reversals && counted.length >= PLACEMENT.minPassages)) return { done: true, nextLevel: null, passage: null, reversals };
  const used = new Set(steps.map((x) => x.passageId));
  const free = passages.filter((p) => !used.has(p.id));
  if (!free.length) return { done: true, nextLevel: null, passage: null, reversals };
  // the target level; else the nearest level that still has a passage (ties: the direction of travel)
  const pick = [...free].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || (lastSign >= 0 ? b.level - a.level : a.level - b.level) || a.id.localeCompare(b.id))[0];
  return { done: false, nextLevel: pick.level, passage: pick, reversals };
}

/** The placement result from the steps (before the MAP check). */
export function placementResult(all: PlacementStep[], startLevel: number): number {
  const steps = all.filter((x) => !x.rapid); // round 4: a rapid passage does not count
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

const stepsOf = (p: Row): PlacementStep[] => {
  const v = typeof p.steps === "string" ? (() => { try { return JSON.parse(p.steps as string) as unknown; } catch { return []; } })() : p.steps;
  return Array.isArray(v) ? (v as PlacementStep[]) : [];
};
/** a finished test with a result (a "Not valid" test is closed with result null) */
const validDone = (r: Row) => !!r.completedAt && r.result !== null && r.result !== undefined;

/**
 * 🎯 Round 4: the passages a test may use — every passage minus the ones the student saw in any OTHER placement test
 * (the same set for the whole test: earlier tests never change). When too few unseen passages are left for a test
 * (under PLACEMENT.minPassages), all the passages are used rather than no test.
 */
export async function testPool(repo: Repo, p: Row, passages: PlacementPassage[]): Promise<PlacementPassage[]> {
  const others = (await repo.findMany("RRPlacement", { studentId: s(p.studentId) }, { select: ["id", "steps"] })).filter((r) => s(r.id) !== s(p.id));
  if (!others.length) return passages;
  const seen = new Set(others.flatMap((r) => stepsOf(r).map((x) => s(x.passageId))));
  const unseen = passages.filter((x) => !seen.has(x.id));
  return unseen.length >= PLACEMENT.minPassages ? unseen : passages;
}

export interface PlacementStatus {
  open: Row | null; last: Row | null; canStart: boolean;
  /** a teacher allowed a retake after the last test */
  retake: boolean;
  /** the reading check that is open now (middle / end of year), else null */
  due: RRPeriod | null;
  /** round 4: the latest test was "Not valid" (too many fast answers): the student takes it again */
  invalid?: boolean;
}

export async function placementStatus(repo: Repo, studentId: string, now = new Date()): Promise<PlacementStatus> {
  const rows = (await repo.findMany("RRPlacement", { studentId })).sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());
  const open = rows.find((r) => !r.completedAt) ?? null;
  // round 4: a "Not valid" test (closed with no result) is not a placement: it never sets "last" or a check as done
  const last = rows.find(validDone) ?? null;
  const latest = rows.find((r) => r.completedAt) ?? null;
  const invalid = !!latest && !validDone(latest);
  if (open) return { open, last, canStart: false, retake: false, due: null };
  if (!last) return { open, last, canStart: true, retake: false, due: null, invalid };
  const done = toDate(last.completedAt).getTime();
  const allowed = (await repo.findMany("RRLevelChange", { studentId })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && toDate(c.createdAt).getTime() > done);
  // 🗓️ the middle / end of year reading check (windows.ts): open while its window is and it is not done yet
  const due = allowed ? null : dueCheck(await loadReadRiseWindows(repo, s(last.schoolId), now), now, rows.filter(validDone).map((r) => toDate(r.completedAt)));
  return { open, last, canStart: allowed || due !== null, retake: allowed, due, invalid };
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
  /** round 4: the last test was "Not valid" (too many fast answers) — take it again */
  invalid?: boolean;
}

/** What the student's placement page shows. Passages are injectable (tests). */
export async function placementView(repo: Repo, actor: Actor, passages: PlacementPassage[] = loadPlacementPassages(), now = new Date()): Promise<PlacementView> {
  const studentId = student(actor);
  const st = await placementStatus(repo, studentId, now);
  const base = { placementId: null, stepNumber: 0, maxSteps: PLACEMENT.maxPassages, passage: null, result: st.last ? Number(st.last.result) : null, retake: Boolean(st.last), check: st.due, invalid: Boolean(st.invalid) };
  if (st.open) {
    const steps = stepsOf(st.open);
    const plan = placementPlan(Number(st.open.startLevel), steps, await testPool(repo, st.open, passages));
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
    return { ...base, invalid: false, state: "IN_PROGRESS", placementId: s(st.open.id), stepNumber: steps.length + 1, passage: { id: p.id, title: p.title, text: p.text, questions: p.questions.map((q) => ({ stem: q.stem, options: q.options })) } };
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
  // round 4: a middle / end of year check starts from the CURRENT ReadRise level (the first test: MAP / grade start)
  const startLevel = st.due ? Number((await ensureRRStudent(repo, studentId, now)).level) : (await initialLevel(repo, studentId)).level;
  const row = await repo.create("RRPlacement", { studentId, schoolId: actor.schoolId, startLevel, steps: [], startedAt: now, period: st.due });
  return s(row.id);
}

export interface PlacementAnswer {
  done: boolean; correct: number; result: number | null; note: string | null;
  /** round 4: 2+ passages answered too fast — the test is "Not valid — retake" and the level did not change */
  invalid?: boolean;
  /** round 4: this passage was answered too fast to count */
  rapid?: boolean;
}

/** Scores one passage (3 answers A–D) and moves on; finishes the test when the rules say so. */
export async function answerPlacement(repo: Repo, actor: Actor, placementId: string, passageId: string, answers: string[], passages: PlacementPassage[] = loadPlacementPassages(), now = new Date(), timing: { ms?: number | null } = {}): Promise<PlacementAnswer> {
  const studentId = student(actor);
  const res = await repo.transaction(async (tx): Promise<PlacementAnswer> => {
    const p = await tx.findUnique("RRPlacement", { id: placementId });
    if (!p || p.studentId !== studentId) throw new ForbiddenError("Placement not found.");
    if (p.completedAt) throw new ValidationError("This placement is finished.");
    const steps = stepsOf(p);
    const pool = await testPool(tx, p, passages);
    const plan = placementPlan(Number(p.startLevel), steps, pool);
    if (!plan.passage || plan.passage.id !== passageId) throw new ValidationError("This passage is no longer the current one. Reload the page.");
    const clean = answers.map((a) => String(a ?? "").trim().toUpperCase());
    if (clean.length !== 3 || clean.some((a) => !/^[ABCD]$/.test(a))) throw new ValidationError("Answer all 3 questions.");
    const correct = plan.passage.questions.filter((q, i) => q.answer === clean[i]).length;
    // ⏱ round 4: the passage's time — the server's (since the last answer, else the test's start) and the page's
    // when it sent one; the smaller wins (a page can never claim more time than the server saw)
    const prevAt = steps.length && steps[steps.length - 1].at ? toDate(steps[steps.length - 1].at).getTime() : toDate(p.startedAt).getTime();
    const serverMs = Number.isFinite(prevAt) ? Math.max(0, now.getTime() - prevAt) : null;
    const pageMs = timing?.ms === null || timing?.ms === undefined || !Number.isFinite(Number(timing.ms)) ? null : Math.max(0, Number(timing.ms));
    const ms = serverMs === null ? pageMs : pageMs === null ? serverMs : Math.min(serverMs, pageMs);
    const rapid = ms !== null && ms < passageMinMs(plan.passage.text);
    const next: PlacementStep[] = [...steps, { level: plan.passage.level, passageId, answers: clean, correct, ...(ms !== null ? { ms: Math.round(ms) } : {}), rapid, at: now.toISOString() }];
    // 🚫 2+ rapid passages: "Not valid — retake" (the Diagnostic rule) — closed with NO result, the level unchanged
    if (next.filter((x) => x.rapid).length >= PLACEMENT_RAPID_INVALID) {
      await tx.updateMany("RRPlacement", { id: placementId }, { steps: next, completedAt: now, result: null });
      return { done: true, correct, result: null, note: PLACEMENT_INVALID_TEXT, invalid: true, rapid };
    }
    await tx.updateMany("RRPlacement", { id: placementId }, { steps: next });
    const after = placementPlan(Number(p.startLevel), next, pool);
    if (!after.done) return { done: false, correct, result: null, note: null, rapid };
    const fin = await finishPlacement(tx, { ...p, steps: next }, now);
    return { done: true, correct, result: fin.level, note: fin.note, rapid };
  });
  if (res.done && !res.invalid) afterPlacement(repo, studentId, now);
  return res;
}

async function finishPlacement(repo: Repo, p: Row, now: Date): Promise<{ level: number; note: string | null }> {
  const steps = stepsOf(p);
  const studentId = s(p.studentId);
  const raw = placementResult(steps, Number(p.startLevel));
  const { level, note } = blendWithMap(raw, await latestMapLexile(repo, studentId));
  const [windows, earlier] = await Promise.all([
    loadReadRiseWindows(repo, s(p.schoolId), now),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } }, { select: ["id", "completedAt"] }),
  ]);
  const period = periodOf(windows, now);
  // 🔄 an admin reset (placement-reset.ts) after the last finished test: the old result was wrong, so the new one
  // replaces the year's start level too (a fresh start, not a "check")
  const prevDone = Math.max(0, ...earlier.filter((r) => s(r.id) !== s(p.id)).map((r) => toDate(r.completedAt).getTime()));
  const adminReset = (await repo.findMany("RRLevelChange", { studentId }, { select: ["reason", "createdAt"] })).some((c) => s(c.reason).includes(ADMIN_RESET_TAG) && toDate(c.createdAt).getTime() > prevDone);
  // 🗓️ a middle / end of year check keeps the year's start (growth start → middle → end); the first test (or a
  // retake at the start of the year) sets the start
  const recheck = !adminReset && earlier.some((r) => s(r.id) !== s(p.id)) && period !== "BOY";
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
  // an admin reset (placement-reset.ts) never uses up the teacher's retake of the term
  const used = (await repo.findMany("RRLevelChange", { studentId })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && !s(c.reason).includes(ADMIN_RESET_TAG) && toDate(c.createdAt).getTime() >= from);
  if (used) throw new ValidationError("A placement retake was already allowed this term.");
  const rr = await ensureRRStudent(repo, studentId, now);
  await recordLevelChange(repo, { studentId, schoolId: s(st.schoolId), from: Number(rr.level), to: Number(rr.level), reason: `${RETAKE_REASON} by a teacher${reason.trim() ? `: ${reason.trim()}` : ""}`, now });
  return { allowedAt: now };
}
