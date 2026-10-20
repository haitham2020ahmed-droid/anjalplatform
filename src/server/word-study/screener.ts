/**
 * 🔤 Decoding screener (word study, Grades 4–6). The browser says a word; the student picks its spelling from 4
 * look-alike choices. 8 strands (src/server/word-study/strands.ts), 10 words each (5 real + 5 made-up).
 *
 * Branching
 *   - Grades 4–6 start at strand 3 (silent e).
 *   - A strand under 50 % sends the student DOWN to the strand before it (until one is 50 %+ or strand 1).
 *   - Going UP stops after two strands under 50 % (or after strand 8).
 * Scoring per strand: ≥ 80 % MASTERED · 60–79 % REVIEW · < 60 % RETEACH. A pattern missed more than once (both its
 * real and its made-up word) is listed to reteach, whatever the strand's status. Real and made-up words are reported
 * separately: made-up words show decoding itself (no memory of known words).
 *
 * Who takes it: a teacher asks (TEACHER), the daily job invites Tier 2/3 students whose fluency AND comprehension
 * evidence are low (TIER, see queueDecodingScreens), or the student starts it (SELF). An invitation is a screen row
 * with no items yet; the student's first answer starts it.
 */
import { createHash } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { studentNames } from "../insights/student-data";
import { encodeSpeech } from "./speech-code";
import { STRAND_BY_N, STRANDS, type Strand } from "./strands";

export const START_STRAND = 3;
export const SCREENER_PASS_PCT = 50;
export const MAX_FAILS_UP = 2;
/** a student may start the screener again by themselves only after this many days */
export const SELF_RETAKE_DAYS = 30;
/** the daily job never invites a student screened (or invited) in the last 90 days */
export const QUEUE_COOLDOWN_DAYS = 90;
const DAY = 86_400_000;

export type StrandStatus = "MASTERED" | "REVIEW" | "RETEACH";
export interface ScreenItem { word: string; real: boolean; pattern: string; choices: string[]; answer: string; picked: string | null; correct: boolean | null }
export interface ScreenStrand { strand: number; code: string; items: ScreenItem[] }
export interface Tally { correct: number; total: number; pct: number }
export interface StrandResult extends Tally { strand: number; code: string; name: string; status: StrandStatus; real: Tally; madeUp: Tally; reteach: string[]; missed: string[] }
export interface ScreenResult {
  start: number;
  order: number[];
  strands: Record<string, StrandResult>;
  real: Tally;
  madeUp: Tally;
  /** the first strand to teach (lowest strand that is not MASTERED), null when all tested strands are mastered */
  teachFrom: number | null;
  /** real words read much better than made-up ones (≥ 20 points): the student may be memorising words rather than decoding */
  decodingGap: boolean;
  /** strands below the start that were not tested because the start strand was passed (assumed secure) */
  assumed: number[];
}

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : new Date(s(v)));
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const tally = (xs: ScreenItem[]): Tally => { const c = xs.filter((x) => x.correct).length; return { correct: c, total: xs.length, pct: xs.length ? Math.round((c / xs.length) * 100) : 0 }; };

// --------------------------------------------------------------------------------------- pure rules

export const statusFor = (pct: number): StrandStatus => (pct >= 80 ? "MASTERED" : pct >= 60 ? "REVIEW" : "RETEACH");

/** Scores one finished strand: total, real vs made-up, status, patterns to reteach (missed more than once). */
export function scoreStrand(st: ScreenStrand): StrandResult {
  const def = STRAND_BY_N.get(st.strand)!;
  const all = tally(st.items);
  const misses = new Map<string, number>();
  for (const it of st.items) if (it.correct === false) misses.set(it.pattern, (misses.get(it.pattern) ?? 0) + 1);
  const reteach = def.patterns.filter((p) => (misses.get(p.code) ?? 0) > 1).map((p) => p.label);
  return {
    strand: st.strand, code: def.code, name: def.name, ...all, status: statusFor(all.pct),
    real: tally(st.items.filter((x) => x.real)), madeUp: tally(st.items.filter((x) => !x.real)), reteach,
    missed: st.items.filter((x) => x.correct === false).map((x) => x.word),
  };
}

/**
 * The next strand to give, from the strands done so far (in the order given), or null when the screen is over.
 *   - after a strand under 50 %: the strand before it, if not taken yet (drop down);
 *   - otherwise up from the highest strand taken, unless two strands were already under 50 % or strand 8 is done;
 *   - after a drop down that passed, the screen goes up again from the highest strand taken.
 */
export function nextStrand(done: { strand: number; pct: number }[], start = START_STRAND): number | null {
  if (!done.length) return start;
  const taken = new Set(done.map((x) => x.strand));
  const last = done[done.length - 1];
  if (last.pct < SCREENER_PASS_PCT && last.strand > 1 && !taken.has(last.strand - 1) && last.strand <= start) return last.strand - 1;
  const fails = done.filter((x) => x.pct < SCREENER_PASS_PCT).length;
  if (fails >= MAX_FAILS_UP) return null;
  const top = Math.max(...done.map((x) => x.strand));
  // a failed start strand that has been checked below continues upward too (one fail so far)
  return top < STRANDS.length ? top + 1 : null;
}

/** The whole screen's result, from its finished strands. */
export function summarize(strands: ScreenStrand[], start = START_STRAND): ScreenResult {
  const done = strands.filter((x) => x.items.length && x.items.every((i) => i.correct !== null));
  const res = Object.fromEntries(done.map((x) => [String(x.strand), scoreStrand(x)])) as Record<string, StrandResult>;
  const items = done.flatMap((x) => x.items);
  const real = tally(items.filter((x) => x.real)), madeUp = tally(items.filter((x) => !x.real));
  const tested = done.map((x) => x.strand).sort((a, b) => a - b);
  const lowest = tested[0] ?? start;
  const startPassed = (res[String(start)]?.pct ?? 0) >= SCREENER_PASS_PCT;
  const assumed = startPassed ? STRANDS.map((x) => x.n).filter((n) => n < lowest) : [];
  const notMastered = tested.filter((n) => res[String(n)].status !== "MASTERED");
  return {
    start, order: done.map((x) => x.strand), strands: res, real, madeUp,
    teachFrom: notMastered[0] ?? null,
    decodingGap: real.total >= 5 && madeUp.total >= 5 && real.pct - madeUp.pct >= 20,
    assumed,
  };
}

/** Deterministic order (by seed) so a reload shows the same choices. */
function shuffled<T>(xs: T[], seed: string): T[] {
  const out = [...xs];
  let h = BigInt("0x" + createHash("sha256").update(seed).digest("hex"));
  for (let i = out.length - 1; i > 0; i--) { const j = Number(h % BigInt(i + 1)); h /= BigInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** The 10 items of a strand for one screen: words in a mixed order (real and made-up), choices shuffled. */
export function strandItems(def: Strand, seed: string): ScreenItem[] {
  const words = def.patterns.flatMap((p) => p.words.map((w) => ({ ...w, pattern: p.code })));
  return shuffled(words, `${seed}:${def.n}:order`).map((w) => ({ word: w.word, real: w.real, pattern: w.pattern, choices: shuffled([...w.choices], `${seed}:${def.n}:${w.word}`), answer: w.word, picked: null, correct: null }));
}

// --------------------------------------------------------------------------------------- student

export interface ScreenQuestion {
  screenId: string;
  strand: { n: number; name: string; number: number };
  index: number;
  total: number;
  choices: string[];
  /** the word to say, scrambled (decodeSpeech(say, `${screenId}:${n}:${index}`)) */
  say: string;
  /** made-up word? (the student is told: "this is a made-up word") */
  madeUp: boolean;
}
export interface StudentScreenView {
  state: "NONE" | "INVITED" | "IN_PROGRESS" | "DONE";
  screenId: string | null;
  reason: string | null;
  question: ScreenQuestion | null;
  answered: number;
  result: ScreenResult | null;
  completedAt: string | null;
  /** may start a new screen by themselves now */
  canStart: boolean;
}

const sayKey = (screenId: string, n: number, index: number) => `${screenId}:${n}:${index}`;

function ownStudent(actor: Actor): string {
  assertCan(actor, "practice:take");
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students take the word check.");
  return actor.studentId;
}

async function latestScreens(repo: Repo, studentId: string, take = 5): Promise<Row[]> {
  return repo.findMany("DecodingScreen", { studentId }, { orderBy: [{ field: "startedAt", dir: "desc" }, { field: "id", dir: "desc" }], take });
}

function currentQuestion(screen: Row): ScreenQuestion | null {
  const strands = json<ScreenStrand[]>(screen.items, []);
  for (const st of strands) {
    const index = st.items.findIndex((i) => i.picked === null);
    if (index < 0) continue;
    const def = STRAND_BY_N.get(st.strand)!;
    const it = st.items[index];
    const id = s(screen.id);
    return { screenId: id, strand: { n: st.strand, name: def.name, number: strands.indexOf(st) + 1 }, index, total: st.items.length, choices: it.choices, say: encodeSpeech(it.word, sayKey(id, st.strand, index)), madeUp: !it.real };
  }
  return null;
}

/** What the student's page shows: an invitation, the current word, or the last result. */
export async function studentScreenView(repo: Repo, actor: Actor, now = new Date()): Promise<StudentScreenView> {
  const studentId = ownStudent(actor);
  const rows = await latestScreens(repo, studentId);
  const open = rows.find((r) => !r.completedAt);
  const last = rows.find((r) => r.completedAt);
  const lastAt = last ? d(last.completedAt) : null;
  const canStart = !open && (!lastAt || now.getTime() - lastAt.getTime() >= SELF_RETAKE_DAYS * DAY);
  if (open) {
    const strands = json<ScreenStrand[]>(open.items, []);
    const answered = strands.reduce((n, st) => n + st.items.filter((i) => i.picked !== null).length, 0);
    return { state: strands.length ? "IN_PROGRESS" : "INVITED", screenId: s(open.id), reason: s(open.reason), question: strands.length ? currentQuestion(open) : null, answered, result: null, completedAt: null, canStart: false };
  }
  if (last) return { state: "DONE", screenId: s(last.id), reason: s(last.reason), question: null, answered: 0, result: json<ScreenResult | null>(last.result, null), completedAt: lastAt!.toISOString(), canStart };
  return { state: "NONE", screenId: null, reason: null, question: null, answered: 0, result: null, completedAt: null, canStart: true };
}

/** Starts the screener: the open invitation, or a new screen the student asked for (SELF). Returns the first word. */
export async function startScreen(repo: Repo, actor: Actor, now = new Date()): Promise<ScreenQuestion> {
  const studentId = ownStudent(actor);
  const rows = await latestScreens(repo, studentId);
  let open = rows.find((r) => !r.completedAt);
  if (!open) {
    const last = rows.find((r) => r.completedAt);
    if (last && now.getTime() - d(last.completedAt).getTime() < SELF_RETAKE_DAYS * DAY) throw new ValidationError(`You took the word check recently. You can take it again after ${SELF_RETAKE_DAYS} days.`);
    open = await repo.create("DecodingScreen", { studentId, schoolId: actor.schoolId, reason: "SELF", items: [], result: null, startedAt: now, completedAt: null });
  }
  const strands = json<ScreenStrand[]>(open.items, []);
  if (!strands.length) {
    const first = STRAND_BY_N.get(START_STRAND)!;
    const items = [{ strand: first.n, code: first.code, items: strandItems(first, s(open.id)) }];
    await repo.updateMany("DecodingScreen", { id: open.id }, { items, startedAt: now });
    open = { ...open, items };
  }
  return currentQuestion(open)!;
}

/**
 * Records one answer (only for the word being asked, never twice). At the end of a strand, the branching rule
 * chooses the next strand or finishes the screen and stores its result.
 */
export async function answerScreen(repo: Repo, actor: Actor, input: { screenId: string; strand: number; index: number; picked: string }, now = new Date()): Promise<{ correct: boolean; next: ScreenQuestion | null; result: ScreenResult | null }> {
  const studentId = ownStudent(actor);
  return repo.transaction(async (tx) => {
    const screen = await tx.findUnique("DecodingScreen", { id: String(input.screenId ?? "") });
    if (!screen || s(screen.studentId) !== studentId) throw new ForbiddenError("Word check not found.");
    if (screen.completedAt) throw new ValidationError("This word check is finished.");
    const strands = json<ScreenStrand[]>(screen.items, []);
    const cur = currentQuestion(screen);
    if (!cur || cur.strand.n !== Number(input.strand) || cur.index !== Number(input.index)) throw new ValidationError("This word was already answered. Here is the next one.");
    const st = strands.find((x) => x.strand === cur.strand.n)!;
    const it = st.items[cur.index];
    if (typeof input.picked !== "string" || !it.choices.includes(input.picked)) throw new ValidationError("Choose one of the spellings.");
    it.picked = input.picked;
    it.correct = input.picked === it.answer;
    let result: ScreenResult | null = null;
    if (st.items.every((x) => x.picked !== null)) {
      const done = strands.map((x) => ({ strand: x.strand, pct: tally(x.items).pct }));
      const n = nextStrand(done);
      if (n === null) result = summarize(strands);
      else { const def = STRAND_BY_N.get(n)!; strands.push({ strand: n, code: def.code, items: strandItems(def, s(screen.id)) }); }
    }
    // inside the transaction, and only while the screen is still open (a finished screen is never changed)
    const changed = await tx.updateMany("DecodingScreen", { id: screen.id, completedAt: null }, { items: strands, ...(result ? { result, completedAt: now } : {}) });
    if (changed !== 1) throw new ValidationError("This word check changed. Please reload the page.");
    return { correct: it.correct, next: result ? null : currentQuestion({ ...screen, items: strands }), result };
  });
}

// --------------------------------------------------------------------------------------- teacher

export interface ProfileRow {
  id: string; name: string;
  state: "NONE" | "INVITED" | "IN_PROGRESS" | "DONE";
  completedAt: string | null;
  reason: string | null;
  /** strand number → its result (null = not tested) */
  strands: Record<number, { pct: number; status: StrandStatus; real: Tally; madeUp: Tally; reteach: string[]; missed: string[] } | null>;
  assumed: number[];
  real: Tally | null; madeUp: Tally | null;
  teachFrom: number | null;
  decodingGap: boolean;
}
export interface WordStudyGroup { key: string; title: string; why: string; students: { id: string; name: string }[] }
export interface ClassDecodingProfile {
  className: string;
  strands: { n: number; name: string; short: string }[];
  rows: ProfileRow[];
  /** pattern → students who missed it more than once */
  patterns: { strand: number; label: string; students: { id: string; name: string }[] }[];
  groups: WordStudyGroup[];
}

/** The class profile: strands × students, who needs which pattern, suggested word-study groups. */
export async function classDecodingProfile(repo: Repo, actor: Actor, classId: string): Promise<ClassDecodingProfile> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const [names, screens] = await Promise.all([
    studentNames(repo, ids),
    ids.length ? repo.findMany("DecodingScreen", { studentId: { in: ids } }, { select: ["id", "studentId", "reason", "items", "result", "startedAt", "completedAt"], orderBy: [{ field: "startedAt", dir: "desc" }], take: 5000 }) : Promise.resolve([] as Row[]),
  ]);
  const rows: ProfileRow[] = ids.map((id) => {
    const mine = screens.filter((x) => s(x.studentId) === id);
    const open = mine.find((x) => !x.completedAt);
    const done = mine.filter((x) => x.completedAt).sort((a, b) => d(b.completedAt).getTime() - d(a.completedAt).getTime())[0];
    const r = done ? json<ScreenResult | null>(done.result, null) : null;
    const strands: ProfileRow["strands"] = {};
    for (const st of STRANDS) { const x = r?.strands[String(st.n)]; strands[st.n] = x ? { pct: x.pct, status: x.status, real: x.real, madeUp: x.madeUp, reteach: x.reteach, missed: x.missed } : null; }
    const state: ProfileRow["state"] = open ? (json<unknown[]>(open.items, []).length ? "IN_PROGRESS" : "INVITED") : done ? "DONE" : "NONE";
    return {
      id, name: names.get(id)?.name ?? "Student", state, completedAt: done ? d(done.completedAt).toISOString() : null, reason: open ? s(open.reason) : done ? s(done.reason) : null,
      strands, assumed: r?.assumed ?? [], real: r?.real ?? null, madeUp: r?.madeUp ?? null, teachFrom: r?.teachFrom ?? null, decodingGap: Boolean(r?.decodingGap),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  // who needs which pattern (missed both of its words)
  const patterns: ClassDecodingProfile["patterns"] = [];
  for (const st of STRANDS) for (const p of st.patterns) {
    const who = rows.filter((r) => r.strands[st.n]?.reteach.includes(p.label)).map((r) => ({ id: r.id, name: r.name }));
    if (who.length) patterns.push({ strand: st.n, label: `${st.short}: ${p.label}`, students: who });
  }
  patterns.sort((a, b) => b.students.length - a.students.length || a.strand - b.strand);
  // word-study groups: by the first strand to teach; plus the "decoding gap" group
  const groups: WordStudyGroup[] = [];
  for (const st of STRANDS) {
    const who = rows.filter((r) => r.teachFrom === st.n);
    if (!who.length) continue;
    const reteach = who.filter((r) => r.strands[st.n]?.status === "RETEACH").length;
    groups.push({ key: `strand-${st.n}`, title: `Start at strand ${st.n}: ${st.name}`, why: reteach ? `${reteach} of them under 60 % here — reteach the pattern, then review the strands above it.` : "Under 80 % here — a short review, then move up to the next strand.", students: who.map((r) => ({ id: r.id, name: r.name })) });
  }
  const gap = rows.filter((r) => r.decodingGap);
  if (gap.length) groups.push({ key: "gap", title: "Reads known words, not new ones", why: "Real words are 20+ points better than made-up words: they may be guessing from memory. Practise sounding out new and made-up words.", students: gap.map((r) => ({ id: r.id, name: r.name })) });
  return { className: s(klass.name), strands: STRANDS.map((x) => ({ n: x.n, name: x.name, short: x.short })), rows, patterns, groups };
}

/** One student's screens (newest first) with every word, for the teacher's “results per student”. */
export async function studentScreenDetail(repo: Repo, actor: Actor, classId: string, studentId: string): Promise<{ name: string; screens: { id: string; reason: string; startedAt: string; completedAt: string | null; strands: (ScreenStrand & { name: string })[]; result: ScreenResult | null }[] }> {
  assertCan(actor, "reports:read");
  await assertClassAccess(repo, actor, classId);
  if (!(await repo.findUnique("ClassMembership", { classId, studentId }))) throw new ForbiddenError("Student not found in this class.");
  const [names, rows] = await Promise.all([studentNames(repo, [studentId]), latestScreens(repo, studentId, 10)]);
  return {
    name: names.get(studentId)?.name ?? "Student",
    screens: rows.map((r) => ({
      id: s(r.id), reason: s(r.reason), startedAt: d(r.startedAt).toISOString(), completedAt: r.completedAt ? d(r.completedAt).toISOString() : null,
      strands: json<ScreenStrand[]>(r.items, []).map((x) => ({ ...x, name: STRAND_BY_N.get(x.strand)?.name ?? "" })), result: json<ScreenResult | null>(r.result, null),
    })),
  };
}

const INVITE_TITLE = "🔤 Word check: listen and choose the spelling";
const INVITE_BODY = "Your teacher would like you to take a short word check. You will hear words and pick the right spelling. It takes about 10 minutes.";

/** Creates the invitations (screen rows) and notifies each student. Students who already have an open screen are skipped. */
async function invite(repo: Repo, schoolId: string, studentIds: string[], reason: "TEACHER" | "TIER", now: Date, body = INVITE_BODY): Promise<number> {
  if (!studentIds.length) return 0;
  const [open, students] = await Promise.all([
    repo.findMany("DecodingScreen", { studentId: { in: studentIds }, completedAt: null }, { select: ["studentId"] }),
    repo.findMany("Student", { id: { in: studentIds } }, { select: ["id", "userId"] }),
  ]);
  const busy = new Set(open.map((x) => s(x.studentId)));
  let n = 0;
  for (const st of students) {
    if (busy.has(s(st.id))) continue;
    await repo.create("DecodingScreen", { studentId: st.id, schoolId, reason, items: [], result: null, startedAt: now, completedAt: null });
    await repo.create("Notification", { userId: st.userId, type: "ASSESSMENT_AVAILABLE", title: INVITE_TITLE, body, link: "/student/decoding", readAt: null, createdAt: now });
    n++;
  }
  return n;
}

/** “Ask these students to take the screener”: the teacher's own class only. Returns how many were invited. */
export async function inviteToScreen(repo: Repo, actor: Actor, classId: string, studentIds: string[], now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, classId);
  const members = new Set((await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  const ids = [...new Set(studentIds.map(String))].filter((id) => members.has(id));
  if (!ids.length) throw new ValidationError("Choose at least one student of this class.");
  return invite(repo, s(klass.schoolId), ids, "TEACHER", now);
}

// --------------------------------------------------------------------------------------- daily queue

/** Fluency is low: the latest percentile is under 25, or the comprehension check after reading is under 60 %. */
export const FLUENCY_PERCENTILE_LOW = 25;
export const FLUENCY_COMPREHENSION_LOW = 60;
const LOW_PROFICIENCY = new Set(["Below grade level", "Approaching grade level"]);

/**
 * Daily: invites (reason TIER) the students of the school who
 *   - are in support Tier 2 or 3, AND
 *   - have low fluency evidence (latest percentile < 25, or latest fluency comprehension < 60 %), AND
 *   - have low comprehension evidence (latest Diagnostic below / approaching grade level, or profile level BELOW), AND
 *   - have no screener (taken or invited) in the last 90 days.
 * Bounded: one school, at most 2,000 tier rows, reads batched by 500 students.
 */
export async function queueDecodingScreens(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const tiers = await repo.findMany("StudentTier", { schoolId, tier: { in: [2, 3] } }, { select: ["studentId"], take: 2000 });
  const all = [...new Set(tiers.map((t) => s(t.studentId)))];
  const since = new Date(now.getTime() - QUEUE_COOLDOWN_DAYS * DAY);
  const chosen: string[] = [];
  for (let i = 0; i < all.length; i += 500) {
    const ids = all.slice(i, i + 500);
    const [recent, checks, coach, diags, profiles] = await Promise.all([
      repo.findMany("DecodingScreen", { studentId: { in: ids }, startedAt: { gte: since } }, { select: ["studentId"] }),
      repo.findMany("FluencyCheck", { studentId: { in: ids } }, { select: ["studentId", "percentile", "comprehension", "checkedAt"] }),
      repo.findMany("FluencyPractice", { studentId: { in: ids }, mode: "MINUTE" }, { select: ["studentId", "percentile", "comprehension", "createdAt"] }),
      repo.findMany("DiagnosticResult", { studentId: { in: ids } }, { select: ["studentId", "proficiency", "takenAt"] }),
      repo.findMany("StudentProfile", { studentId: { in: ids } }, { select: ["studentId", "level"] }),
    ]);
    const screened = new Set(recent.map((x) => s(x.studentId)));
    for (const id of ids) {
      if (screened.has(id)) continue;
      const flu = [
        ...checks.filter((c) => s(c.studentId) === id).map((c) => ({ at: d(c.checkedAt).getTime(), p: c.percentile, c: c.comprehension })),
        ...coach.filter((c) => s(c.studentId) === id).map((c) => ({ at: d(c.createdAt).getTime(), p: c.percentile, c: c.comprehension })),
      ].sort((a, b) => b.at - a.at);
      const latestP = flu.find((x) => x.p !== null && x.p !== undefined)?.p;
      const latestC = flu.find((x) => x.c !== null && x.c !== undefined)?.c;
      const fluencyLow = (latestP !== undefined && Number(latestP) < FLUENCY_PERCENTILE_LOW) || (latestC !== undefined && Number(latestC) < FLUENCY_COMPREHENSION_LOW);
      if (!fluencyLow) continue;
      const diag = diags.filter((x) => s(x.studentId) === id).sort((a, b) => d(b.takenAt).getTime() - d(a.takenAt).getTime())[0];
      const level = profiles.find((x) => s(x.studentId) === id)?.level;
      const comprehensionLow = (diag && LOW_PROFICIENCY.has(s(diag.proficiency))) || s(level) === "BELOW";
      if (comprehensionLow) chosen.push(id);
    }
  }
  return invite(repo, schoolId, chosen, "TIER", now, "Let's find the word patterns that will help your reading most. Take a short word check: you will hear words and pick the right spelling (about 10 minutes).");
}
