/**
 * 🧭 Remedial fluency plans (pure functions, tested in Node) — a specific, measurable, time-bound plan made from the
 * student's own readings, the way a reading specialist writes an intervention plan:
 *
 * 1. Baseline: the median of the last (up to) 3 cold reads (official 1-minute checks: the coach's or the teacher's);
 *    without one, the median of the last 3 first readings. Accuracy and prosody (NAEP 1–4) from the recent readings.
 * 2. The main area, in the order a specialist works: ACCURACY (under 95 % — decoding first; under 90 % the practice
 *    text is made easier) → RATE (more than 10 WCPM under the 50th percentile, Hasbrouck & Tindal 2017) → PROSODY
 *    (expression under 2.5 of 4) → ENRICH (on track: wide reading of harder texts + comprehension).
 * 3. Goals: WCPM = baseline + a weekly gain × weeks. The weekly gain follows the intervention literature for Grades
 *    4–6 (Fuchs et al. 1993; Hasbrouck & Tindal): +2/week under the 25th percentile, +1.5 under the 50th, else +1.
 *    Accuracy goal 95 % (from under 90 %) or 97–98 %; prosody one NAEP level up (at least 3).
 * 4. A daily routine of proven methods chosen by the area (with minutes): word work on the student's own missed words,
 *    model-then-echo reading, repeated reading (3–4 timed reads of one passage), phrase-cued reading, partner/choral
 *    reading, wide reading — and a weekly COLD READ on a new passage to measure transfer (the number the plan is
 *    judged on). Each area has a Plan A and a Plan B (other methods) for when Plan A does not work.
 * 5. Automatic adjustment from new cold reads (reviewPlan):
 *      final goal met                         → NEXT_FOCUS (a new plan from the new baseline)
 *      the last 2 cold reads above the goal line → RAISE (+0.5 WCPM/week, at most +2.5)
 *      no growth after 2 weeks (< +1 WCPM)    → CHANGE_METHOD (Plan B; the teacher is alerted)
 *      2 readings under 90 % accuracy         → EASIER_TEXT (accuracy first, easier passages)
 *      no cold read for a week                → CHECK_DUE;  the weeks are over → NEW_CYCLE
 *    otherwise ON_TRACK (at/above the goal line) or KEEP_GOING (growing, under the line).
 * Teachers see the methods, numbers and decisions; students see the same plan in friendly words — never
 * Below/On/Above or tier wording.
 */
import { bandEdges, fluencySeason, nextSeason, norm50, type Season } from "./norms";

export type FocusArea = "ACCURACY" | "RATE" | "PROSODY" | "ENRICH";
export type PlanMethod = "WORD_WORK" | "MODEL_ECHO" | "REPEATED" | "PHRASE_CUED" | "PARTNER_CHORAL" | "WIDE_READING" | "COLD_READ";
export type PlanDecision = "NEW" | "ON_TRACK" | "KEEP_GOING" | "RAISE" | "NEXT_FOCUS" | "CHANGE_METHOD" | "EASIER_TEXT" | "CHECK_DUE" | "NEW_CYCLE";

/** an official 1-minute cold read (date: ISO time) */
export interface ColdRead { date: string; wcpm: number; accuracy: number | null }
/** any scored reading (kind: MINUTE | PASSAGE | REPEATED | PHRASED | ECHO | DRILL) */
export interface ReadingEvidence { date: string; kind: string; wcpm: number; accuracy: number; prosody: number | null; trial?: number | null }
export interface PlanLinks { same?: string | null; easier?: string | null; harder?: string | null; another?: string | null }
export interface PlanEvidence { grade: number; cold: ColdRead[]; readings: ReadingEvidence[]; words: string[]; patterns: string[]; links?: PlanLinks }

export interface PlanStep { method: PlanMethod; minutes: number; when: "DAILY" | "WEEKLY"; title: string; kidTitle: string; teacher: string; kid: string; href?: string }
export interface PlanStatus { decision: PlanDecision; week: number; expected: number; latest: number | null; reviewedThrough: string | null; teacher: string; kid: string }
export interface RemedialPlan {
  v: 1;
  focus: FocusArea; secondary: FocusArea | null; methodSet: "A" | "B"; changes: number; easierText: boolean;
  startedAt: string; weeks: number; endsOn: string; daysPerWeek: number; minutesPerDay: number;
  baseline: { wcpm: number; accuracy: number; prosody: number | null; source: "CHECK" | "READING" };
  goals: { wcpm: number; weeklyGain: number; accuracy: number; prosody: number | null };
  norm: { grade: number; season: Season; p25: number | null; p50: number | null; target: number | null };
  daily: PlanStep[]; weekly: PlanStep;
  success: { teacher: string; kid: string }[];
  rules: string[];
  words: string[]; patterns: string[];
  status: PlanStatus;
}

export const FOCUS_TEACHER: Record<FocusArea, string> = {
  ACCURACY: "Accuracy (decoding)",
  RATE: "Rate (automaticity)",
  PROSODY: "Prosody (phrasing and expression)",
  ENRICH: "Maintain and extend (wide reading, comprehension)",
};
/** the student's words for the area (never Below/On/Above or tier wording) */
export const FOCUS_KID: Record<FocusArea, string> = {
  ACCURACY: "Reading every word right",
  RATE: "Reading smoothly and a little faster",
  PROSODY: "Reading with expression",
  ENRICH: "Reading new, harder texts",
};
const WEEKS: Record<FocusArea, number> = { ACCURACY: 6, RATE: 6, PROSODY: 4, ENRICH: 4 };
export const MAX_WEEKLY_GAIN = 2.5;
const DAY = 86_400_000;

const median = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ymd = (iso: string) => iso.slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString();
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;
const byDate = <T extends { date: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date));
/** first readings of a text (a repeated trial after the first, an echo sentence or a drill would inflate the rate) */
const isFirstRead = (r: ReadingEvidence) => (r.kind === "MINUTE" || r.kind === "PASSAGE" || (r.kind === "REPEATED" && (r.trial ?? 1) <= 1));
const isText = (r: ReadingEvidence) => r.kind !== "ECHO" && r.kind !== "DRILL";

/** The student's starting point: WCPM, accuracy and prosody (null when there is nothing to go on yet). */
export function planBaseline(ev: PlanEvidence): RemedialPlan["baseline"] | null {
  const cold = byDate(ev.cold).slice(-3);
  const reads = byDate(ev.readings);
  const firsts = reads.filter(isFirstRead).slice(-3);
  const wcpm = cold.length ? median(cold.map((c) => c.wcpm)) : firsts.length ? median(firsts.map((r) => r.wcpm)) : NaN;
  if (!Number.isFinite(wcpm)) return null;
  const accs = [...cold.filter((c) => c.accuracy !== null).map((c) => ({ date: c.date, a: c.accuracy! })), ...reads.filter(isText).map((r) => ({ date: r.date, a: r.accuracy }))].sort((a, b) => a.date.localeCompare(b.date)).slice(-3).map((x) => x.a);
  const pros = reads.filter((r) => isText(r) && r.prosody !== null).slice(-3).map((r) => r.prosody!);
  return { wcpm: Math.round(wcpm), accuracy: accs.length ? Math.round(median(accs)) : 95, prosody: pros.length ? Math.round((pros.reduce((a, b) => a + b, 0) / pros.length) * 10) / 10 : null, source: cold.length ? "CHECK" : "READING" };
}

/** The main area and a second one to keep an eye on (see the order above). */
export function chooseFocus(b: RemedialPlan["baseline"], p50: number | null): { focus: FocusArea; secondary: FocusArea | null } {
  const slow = p50 !== null && b.wcpm < p50 - 10;
  const flat = b.prosody !== null && b.prosody < 2.5;
  if (b.accuracy < 95) return { focus: "ACCURACY", secondary: slow ? "RATE" : flat ? "PROSODY" : null };
  if (slow) return { focus: "RATE", secondary: flat ? "PROSODY" : null };
  if (flat) return { focus: "PROSODY", secondary: null };
  return { focus: "ENRICH", secondary: null };
}

/** WCPM growth a week for the area and the student's place on the norms (+1 to +2). */
export function weeklyGainFor(focus: FocusArea, wcpm: number, p25: number | null, p50: number | null): number {
  if (focus === "ACCURACY" || focus === "RATE") return p25 !== null && wcpm < p25 ? 2 : p50 !== null && wcpm < p50 ? 1.5 : 1;
  return 1;
}

const href = (key: string | null | undefined, kind: string) => (key ? `/student/fluency-coach?key=${encodeURIComponent(key)}&mode=${kind}` : `/student/fluency-coach?mode=${kind}`);

/** The daily routine for an area (Plan A or B), with minutes, in teacher and student words. */
export function routineFor(focus: FocusArea, set: "A" | "B", ctx: { words: string[]; patterns: string[]; links: PlanLinks; easierText: boolean; secondary: FocusArea | null; firstGoal: number }): PlanStep[] {
  const w = ctx.words.slice(0, 5), wl = w.length ? w.join(", ") : "the words you missed";
  const practiceKey = ctx.easierText ? ctx.links.easier ?? ctx.links.same : ctx.links.same;
  const S: Record<string, PlanStep> = {
    word: { method: "WORD_WORK", minutes: 5, when: "DAILY", title: "Word work", kidTitle: "My words",
      teacher: `Word work on the student's missed words (${w.join(", ") || "from the latest reading"}${ctx.patterns.length ? `; patterns: ${ctx.patterns.join(", ")}` : ""}): model, student repeats, segment into sounds/syllables, read the word in its phrase.`,
      kid: `Listen to each of your words (${wl}), say it 3 times, clap its parts, then read it in its sentence.` },
    drill: { method: "WORD_WORK", minutes: 3, when: "DAILY", title: "Speed drill (word level)", kidTitle: "1-minute word drill",
      teacher: `1-minute speed drill of the student's patterns${ctx.patterns.length ? ` (${ctx.patterns.join(", ")})` : ""} for automatic word recognition.`,
      kid: "Do the 1-minute word drill. Try to beat your last score!", href: "/student/fluency-coach?mode=DRILL" },
    echo: { method: "MODEL_ECHO", minutes: 5, when: "DAILY", title: "Model-then-echo reading", kidTitle: "Listen, then read",
      teacher: "Model-then-echo reading: the student listens to a fluent model of each sentence while following the text, then reads it back copying the phrasing and expression.",
      kid: "Listen to each sentence 🔊, then say it back the same way — same pauses, same voice.", href: href(practiceKey, "ECHO") },
    repeated: { method: "REPEATED", minutes: ctx.easierText ? 7 : 10, when: "DAILY", title: "Repeated reading", kidTitle: "Read it again",
      teacher: `Repeated reading: 3–4 timed readings of the same ${ctx.easierText ? "easier (instructional-level, 93 %+ accuracy) " : ""}passage with feedback after each; chart WCPM; first goal ${ctx.firstGoal} WCPM.`,
      kid: `Read the same passage 3 times. Each time, try for a few more words — your first goal is ${ctx.firstGoal}.`, href: href(practiceKey, "REPEATED") },
    phrased: { method: "PHRASE_CUED", minutes: 7, when: "DAILY", title: "Phrase-cued reading", kidTitle: "Read in word groups",
      teacher: "Phrase-cued reading: passage marked with / (short) and // (long) pauses; the marks fade over the trials so the student phrases independently.",
      kid: "Read the passage with the / and // marks. Join the words between the marks, and pause at each mark.", href: href(ctx.links.same, "PHRASED") },
    partner: { method: "PARTNER_CHORAL", minutes: 5, when: "DAILY", title: "Partner / choral reading", kidTitle: "Read with a partner",
      teacher: "Partner or choral reading: read a paragraph together (choral), then the student reads it alone; partner gives one compliment and one tip.",
      kid: "Read a paragraph together with a partner (or your teacher), then read it alone. Ask for one tip." },
    wide: { method: "WIDE_READING", minutes: 12, when: "DAILY", title: "Wide reading + comprehension", kidTitle: "Read something new",
      teacher: "Wide reading of new, slightly harder texts with the comprehension questions after each; retell in 3 sentences.",
      kid: "Read a new, harder passage and answer its questions. Then tell someone what it was about in 3 sentences.", href: href(ctx.links.harder ?? ctx.links.another, "PASSAGE") },
    expressive: { method: "REPEATED", minutes: 5, when: "DAILY", title: "Expressive re-reading", kidTitle: "Read like a storyteller",
      teacher: "Expressive re-reading (readers' theatre style): re-read one paragraph focusing on punctuation, dialogue and emphasis.",
      kid: "Read one paragraph again like a storyteller: voice up at ?, excited at !, a different voice for each person.", href: href(ctx.links.same, "PASSAGE") },
  };
  const plans: Record<FocusArea, Record<"A" | "B", PlanStep[]>> = {
    ACCURACY: { A: [S.word, S.echo, S.repeated], B: [{ ...S.word, minutes: 4 }, S.drill, S.partner, { ...S.phrased, minutes: 6 }] },
    RATE: { A: [S.repeated, S.partner, S.drill], B: [S.echo, S.phrased, { ...S.repeated, minutes: 5 }] },
    PROSODY: { A: [S.echo, S.phrased, S.expressive], B: [{ ...S.partner, minutes: 6 }, { ...S.expressive, minutes: 6 }, S.echo] },
    ENRICH: { A: [S.wide, S.expressive], B: [{ ...S.wide, minutes: 10 }, { ...S.phrased, minutes: 5 }, S.partner] },
  };
  const steps = plans[focus][set].map((x) => ({ ...x }));
  // a second area gets one short step of its own when the routine has none for it
  if (ctx.secondary === "PROSODY" && !steps.some((x) => x.method === "PHRASE_CUED" || x.method === "MODEL_ECHO")) steps.push({ ...S.phrased, minutes: 4 });
  if (ctx.secondary === "RATE" && !steps.some((x) => x.method === "REPEATED")) steps.push({ ...S.repeated, minutes: 5 });
  return steps;
}

const decisionText: Record<PlanDecision, { teacher: string; kid: string }> = {
  NEW: { teacher: "New plan from the latest readings.", kid: "Here is your new reading plan!" },
  ON_TRACK: { teacher: "On track: the latest cold read is at or above the goal line.", kid: "You are on track — keep going!" },
  KEEP_GOING: { teacher: "Growing, but under the goal line: keep the routine, check that it is done daily.", kid: "You are growing! A little practice every day will get you there." },
  RAISE: { teacher: "Goal line met on 2 cold reads in a row: weekly goal raised by +0.5 WCPM.", kid: "🚀 You beat your goal twice! Your goal is now a little higher." },
  NEXT_FOCUS: { teacher: "Final goal met: a new plan was made from the new baseline.", kid: "🎉 You reached your goal! Here is your next challenge." },
  CHANGE_METHOD: { teacher: "No growth after 2 weeks: methods changed (Plan B).", kid: "Let's try a new way to practise — it may work even better for you." },
  EASIER_TEXT: { teacher: "Accuracy under 90 % on 2 readings: accuracy first, with easier passages.", kid: "Let's practise with passages that feel a little easier, so every word is right." },
  CHECK_DUE: { teacher: "No cold read for a week: a 1-minute check on a new passage is due.", kid: "Time for your weekly 1-minute check!" },
  NEW_CYCLE: { teacher: "The plan's weeks are over: a new cycle was made from the latest readings.", kid: "A new plan for the next weeks — you have grown!" },
};

/** The goal line: where the student should be on a date (baseline + weekly gain × weeks since the start). */
export const goalLine = (p: Pick<RemedialPlan, "baseline" | "goals" | "startedAt">, date: string) => Math.round(p.baseline.wcpm + (p.goals.weeklyGain * Math.max(0, daysBetween(p.startedAt, date))) / 7);

/** A new plan from the evidence (null when there is no reading yet). */
export function buildRemedialPlan(ev: PlanEvidence, now: Date = new Date(), opts: { force?: FocusArea; methodSet?: "A" | "B"; changes?: number; decision?: PlanDecision; easierText?: boolean } = {}): RemedialPlan | null {
  const b = planBaseline(ev);
  if (!b) return null;
  const season = fluencySeason(now);
  const e = bandEdges(ev.grade, season);
  const p25 = e?.below ?? null, p50 = e?.p50 ?? null;
  const chosen = chooseFocus(b, p50);
  const focus = opts.force ?? chosen.focus;
  const secondary = chosen.focus !== focus ? chosen.focus : chosen.secondary;
  const easierText = opts.easierText ?? (focus === "ACCURACY" && b.accuracy < 90);
  const weeks = WEEKS[focus];
  const weeklyGain = weeklyGainFor(focus, b.wcpm, p25, p50);
  const goalWcpm = Math.round(b.wcpm + weeklyGain * weeks);
  const accGoal = focus === "ACCURACY" ? (b.accuracy < 90 ? 95 : 97) : b.accuracy >= 97 ? 98 : 97;
  const prosodyGoal = b.prosody === null ? 3 : Math.min(4, Math.max(3, Math.floor(b.prosody) + 1));
  const startedAt = now.toISOString();
  const links = ev.links ?? {};
  const set = opts.methodSet ?? "A";
  const firstGoal = Math.max(b.wcpm + 3, Math.round(b.wcpm * 1.1));
  const daily = routineFor(focus, set, { words: ev.words, patterns: ev.patterns, links, easierText, secondary, firstGoal });
  const weekly: PlanStep = { method: "COLD_READ", minutes: 2, when: "WEEKLY", title: "Weekly cold read", kidTitle: "Friday check",
    teacher: "Weekly cold read: one 1-minute reading of a NEW grade-level passage (never practised) — measures transfer; the plan is judged on it.",
    kid: "Once a week, read a NEW passage for 1 minute. It shows how much you have grown!", href: href(links.another ?? links.same, "MINUTE") };
  const endsOn = addDays(startedAt, weeks * 7);
  const target = norm50(ev.grade, nextSeason(season));
  const success: RemedialPlan["success"] = [
    { teacher: `${goalWcpm} WCPM on a grade-level cold read by ${ymd(endsOn)} (baseline ${b.wcpm}, +${weeklyGain} WCPM/week)`, kid: `Read ${goalWcpm} words correctly in 1 minute by ${ymd(endsOn)}.` },
    { teacher: `Accuracy ≥ ${accGoal} % on 2 cold reads in a row (baseline ${b.accuracy} %)`, kid: `Get ${accGoal} of every 100 words right.` },
  ];
  if (daily.some((x) => x.method === "REPEATED")) success.push({ teacher: "Repeated reading: by the 3rd read of a passage, at least +15 % WCPM over the 1st read at ≥ 97 % accuracy", kid: "When you read a passage 3 times, beat your first time by a few words each time." });
  if (focus === "PROSODY" || secondary === "PROSODY" || focus === "ENRICH") success.push({ teacher: `NAEP fluency scale ≥ ${prosodyGoal} on 2 readings in a row (baseline ${b.prosody ?? "—"})`, kid: `Sound smooth and expressive: ${prosodyGoal} out of 4 on “How your reading sounded”.` });
  const rules = [
    "Goal line met on the last 2 cold reads → weekly goal raised by +0.5 WCPM (at most +2.5).",
    "Final goal met → a new plan for the next area (accuracy → rate → expression → wider reading).",
    "No growth after 2 weeks (under +1 WCPM) → change methods (Plan B) and review in a small group.",
    "Accuracy under 90 % on 2 readings → easier passages and word work first.",
  ];
  const decision = opts.decision ?? "NEW";
  const plan: RemedialPlan = {
    v: 1, focus, secondary, methodSet: set, changes: opts.changes ?? 0, easierText,
    startedAt, weeks, endsOn, daysPerWeek: 5, minutesPerDay: daily.reduce((a, s) => a + s.minutes, 0),
    baseline: b, goals: { wcpm: goalWcpm, weeklyGain, accuracy: accGoal, prosody: focus === "PROSODY" || secondary === "PROSODY" ? prosodyGoal : b.prosody === null ? null : prosodyGoal },
    norm: { grade: ev.grade, season, p25, p50, target },
    daily, weekly, success, rules, words: ev.words.slice(0, 8), patterns: ev.patterns.slice(0, 3),
    status: { decision, week: 1, expected: b.wcpm, latest: null, reviewedThrough: byDate(ev.cold).at(-1)?.date ?? null, ...decisionText[decision] },
  };
  if (decision === "CHANGE_METHOD" && plan.changes >= 2) plan.status.teacher += " Two method changes without growth: check decoding (Word Study screener) and plan teacher-led small-group instruction.";
  return plan;
}

/**
 * The plan after new evidence (see the rules at the top). The plan's state is kept (start, gain, Plan A/B); a new
 * plan is made only when a rule says so. The words and links are refreshed from the latest reading.
 */
export function reviewPlan(plan: RemedialPlan, ev: PlanEvidence, now: Date = new Date()): RemedialPlan {
  const today = now.toISOString();
  const days = daysBetween(plan.startedAt, today);
  const week = Math.max(1, Math.floor(days / 7) + 1);
  const cold = byDate(ev.cold);
  const since = cold.filter((c) => c.date > plan.startedAt);
  const fresh = since.filter((c) => !plan.status.reviewedThrough || c.date > plan.status.reviewedThrough);
  const latest = since.at(-1) ?? null;
  const through = latest?.date ?? plan.status.reviewedThrough;
  const keep = (decision: PlanDecision, extra: Partial<RemedialPlan> = {}): RemedialPlan => {
    const p: RemedialPlan = { ...plan, ...extra };
    const words = ev.words.length ? ev.words.slice(0, 8) : p.words;
    const firstGoal = Math.max(p.baseline.wcpm + 3, Math.round(p.baseline.wcpm * 1.1));
    const daily = routineFor(p.focus, p.methodSet, { words, patterns: ev.patterns.length ? ev.patterns : p.patterns, links: ev.links ?? {}, easierText: p.easierText, secondary: p.secondary, firstGoal });
    return { ...p, words, daily: ev.links || ev.words.length ? daily : p.daily, minutesPerDay: (ev.links || ev.words.length ? daily : p.daily).reduce((a, s) => a + s.minutes, 0),
      status: { decision, week, expected: goalLine(p, today), latest: latest?.wcpm ?? null, reviewedThrough: through, ...decisionText[decision] } };
  };
  const rebuild = (decision: PlanDecision, opts: Parameters<typeof buildRemedialPlan>[2] = {}) => buildRemedialPlan(ev, now, { ...opts, decision }) ?? keep(plan.status.decision);

  // accuracy fell apart on the last 2 readings: accuracy first, with easier passages
  const recent = byDate(ev.readings).filter((r) => isText(r) && r.date > plan.startedAt).slice(-2);
  if (recent.length === 2 && recent.every((r) => r.accuracy < 90) && !(plan.focus === "ACCURACY" && plan.easierText)) return rebuild("EASIER_TEXT", { force: "ACCURACY", easierText: true, changes: plan.changes });

  if (!fresh.length) {
    if (days >= plan.weeks * 7) return rebuild("NEW_CYCLE", { changes: plan.changes });
    const lastCold = (since.at(-1) ?? cold.at(-1))?.date ?? plan.startedAt;
    if (daysBetween(lastCold > plan.startedAt ? lastCold : plan.startedAt, today) >= 7) return keep("CHECK_DUE");
    return keep(plan.status.decision === "CHECK_DUE" ? "ON_TRACK" : plan.status.decision);
  }
  const accOk = latest!.accuracy === null || latest!.accuracy >= plan.goals.accuracy - 2;
  if (latest!.wcpm >= plan.goals.wcpm && accOk) return rebuild("NEXT_FOCUS");
  const last2 = since.slice(-2);
  if (last2.length === 2 && accOk && last2.every((c) => c.wcpm >= goalLine(plan, c.date) + 1) && plan.goals.weeklyGain < MAX_WEEKLY_GAIN) {
    const weeklyGain = Math.min(MAX_WEEKLY_GAIN, plan.goals.weeklyGain + 0.5);
    return keep("RAISE", { goals: { ...plan.goals, weeklyGain, wcpm: Math.round(plan.baseline.wcpm + weeklyGain * plan.weeks) } });
  }
  if (days >= 14 && latest!.wcpm < plan.baseline.wcpm + 1) {
    return rebuild("CHANGE_METHOD", { force: plan.focus, methodSet: plan.methodSet === "A" ? "B" : "A", changes: plan.changes + 1, easierText: plan.easierText });
  }
  if (days >= plan.weeks * 7) return rebuild("NEW_CYCLE", { changes: plan.changes });
  return keep(latest!.wcpm >= goalLine(plan, latest!.date) - 1 ? "ON_TRACK" : "KEEP_GOING");
}

/** The next plan: the previous one reviewed with the new evidence, or a new one. */
export function nextRemedialPlan(prev: RemedialPlan | null | undefined, ev: PlanEvidence, now: Date = new Date()): RemedialPlan | null {
  return prev && prev.v === 1 && prev.status ? reviewPlan(prev, ev, now) : buildRemedialPlan(ev, now);
}

/** A stored plan read back (null when it is not a plan of this shape). */
export function asRemedialPlan(v: unknown): RemedialPlan | null {
  const p = v as RemedialPlan | null;
  return p && typeof p === "object" && p.v === 1 && typeof p.focus === "string" && p.baseline && p.goals && Array.isArray(p.daily) && p.status ? p : null;
}
