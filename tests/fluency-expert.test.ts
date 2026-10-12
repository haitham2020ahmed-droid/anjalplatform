/**
 * 🎙 Fluency Coach · expert update (FAKE data only — the Test School; the AI is a fake scorer / fake fetch, offline):
 *   - the live level meter: the room's noise floor from the first ~300 ms, an adaptive voice threshold, plain advice
 *     (louder / closer / noisy / too loud / keep going), noise suppression only in a noisy room; the file check uses
 *     the pre-roll as the room too;
 *   - word-level marking: self-corrections, repetitions and insertions are shown but never errors; the counts, the
 *     three words to practise, 2–3 next steps, the NAEP level and the growth on the same text;
 *   - remedial plans: different profiles → different, specific plans with numeric goals from the Hasbrouck & Tindal
 *     norms and the student's baseline; the adjustment rules (raise, change method, next area, easier text, check due);
 *   - through the coach: the plan and feedback come back with every reading; the AI gets the passage words and the
 *     measured seconds of voice only; a re-sent "heard but unclear" recording is listened to by another model first.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "../src/server/readmaster/service";
import { teacherRoster } from "../src/server/teacher/assign";
import { setAiSettings } from "../src/server/ai/engine";
import { coachHome, scoreReading, validateMarks, NotHeardError, silentWav, type AudioScorer, type ReadingMarks } from "../src/server/fluency/coach";
import { classFluencyView } from "../src/server/fluency/class-view";
import { countMiscues, feedbackSummary, growthSince, naepLevel, nextSteps, wordsToPractise, type MarkedWord } from "../src/server/fluency/feedback";
import { buildRemedialPlan, chooseFocus, goalLine, nextRemedialPlan, planBaseline, reviewPlan, weeklyGainFor, MAX_WEEKLY_GAIN, type PlanEvidence, type RemedialPlan } from "../src/server/fluency/remedial";
import { ABS_MIN_RMS, adaptiveThreshold, CALIBRATE_MS, levelVerdict, MAX_THRESHOLD_RMS, micFeedback, newLevelState, noiseFloorOf, pushLevel, wantsNoiseSuppression, type LevelState } from "../src/components/fluency/voice-level";
import { checkVoice } from "../src/components/fluency/audio-wav";
import { demoDatabase } from "./helpers/db";

// ------------------------------------------------------------------ the live level meter (pure)

/** frames of 50 ms: `ms` long at loudness rms (peak = 3 × rms unless given) */
const feed = (st: LevelState, ms: number, rms: number, peak = rms * 3) => { for (let t = 0; t < ms; t += 50) st = pushLevel(st, rms, peak, 50); return st; };

describe("🎚 live level: noise floor and adaptive threshold", () => {
  test("the threshold sits above the room, with an absolute minimum and a cap", () => {
    assert.equal(adaptiveThreshold(0), ABS_MIN_RMS, "a silent room: the absolute minimum (about -44 dBFS)");
    assert.equal(adaptiveThreshold(0.004), 0.01, "+8 dB over a quiet room");
    assert.equal(adaptiveThreshold(0.05), MAX_THRESHOLD_RMS, "a loud room never hides a normal voice");
    assert.ok(adaptiveThreshold(0) < 0.02, "lower than the old fixed bar (0.02): soft voices count");
    assert.equal(noiseFloorOf([0.002, 0.003, 0.2, 0.25, 0.3, 0.002]), 0.002, "the quieter half: a student who starts talking at once does not raise the room");
    assert.equal(noiseFloorOf([]), 0);
    assert.deepEqual([wantsNoiseSuppression(0.001), wantsNoiseSuppression(0.02)], [false, true], "noise suppression only in a noisy room");
  });

  test("a soft voice in a quiet room is heard (after the 300 ms room check); the advice is to speak a little louder", () => {
    let st = feed(newLevelState(), CALIBRATE_MS, 0.001);
    assert.ok(st.calibrated && st.floor <= 0.0011 && st.threshold === ABS_MIN_RMS);
    st = feed(st, 1000, 0.012);   // a soft child's voice: under the old 0.02 bar
    assert.equal(levelVerdict(st), "heard");
    assert.equal(micFeedback(st), "louder");
    st = feed(st, 1500, 0.08);
    assert.equal(micFeedback(st), "ok");
  });

  test("silence → move closer; a noisy room → its own advice; clipping → further away; a long stop → keep going", () => {
    const quiet = feed(newLevelState(), 4000, 0.001);
    assert.deepEqual([levelVerdict(quiet), micFeedback(quiet)], ["quiet", "closer"]);
    const noisy = feed(newLevelState(), 4000, 0.012);
    assert.ok(noisy.threshold > 0.012 * 2 && noisy.threshold <= MAX_THRESHOLD_RMS, "steady room noise is never counted as a voice");
    assert.equal(micFeedback(noisy), "noisy");
    const loud = feed(feed(newLevelState(), 300, 0.002), 1500, 0.4, 1);
    assert.equal(micFeedback(loud), "too-loud");
    let stop = feed(feed(newLevelState(), 300, 0.002), 1500, 0.1);
    stop = feed(stop, 5500, 0.002);
    assert.equal(micFeedback(stop), "keep-going", "reading has pauses: a gentle nudge, the recording never stops");
    assert.equal(micFeedback(feed(newLevelState(), 1000, 0.001)), "listening");
  });

  test("the file check after Stop takes the pre-roll as the room (a soft voice over a hum still passes)", () => {
    const rate = 16000, x = new Float32Array(rate * 4);
    for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = 0.002 * Math.sin(i) + (t > 0.5 && Math.floor(t * 2) % 2 === 0 ? 0.01 * Math.sin(2 * Math.PI * 200 * t) : 0); }
    const c = checkVoice(x, rate);
    assert.equal(c.verdict, "voice");
    assert.ok(c.threshold < 0.01);
  });
});

// ------------------------------------------------------------------ word marking and feedback (pure)

const W = (text: string, mark: MarkedWord["mark"] = "OK", heard = "", note?: MarkedWord["note"], inserted?: string): MarkedWord => ({ text, mark, heard, ...(note ? { note } : {}), ...(inserted ? { inserted } : {}) });

describe("🎯 word-level marking and the feedback summary", () => {
  test("the AI's notes: self-correction, repetition, insertion are kept as notes, never errors; an error wins", () => {
    const v = validateMarks({ lastWordIndex: 9, errors: [{ i: 1, kind: "SELF_CORRECTION", heard: "hous" }, { i: 4, kind: "SUBSTITUTED", heard: "cat" }], notes: [{ i: 2, kind: "repetition" }, { i: 6, kind: "INSERTION", heard: "very" }, { i: 4, kind: "SELF_CORRECTION" }, { i: 99, kind: "REPETITION" }] }, 10);
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.deepEqual(v.value.errors.map((e) => [e.i, e.kind]), [[4, "SUBSTITUTED"]]);
    assert.deepEqual(v.value.notes!.map((x) => [x.i, x.kind, x.heard]), [[1, "SELF_CORRECTION", "hous"], [2, "REPETITION", ""], [6, "INSERTION", "very"]]);
  });

  const words = [W("The"), W("station", "SUBSTITUTED", "stay"), W("was"), W("near", "OK", "", "SELF_CORRECTION"), W("the", "SKIPPED"), W("old"), W("bridge,", "HESITATION"), W("and"), W("the"), W("station.", "MISPRONOUNCED", "staton"), W("They", "OK", "", "REPETITION"), W("walked", "OK", "", "INSERTION", "slowly"), W("of", "SKIPPED"), W("home", "NOT_READ")];

  test("counts of each kind; the 3 words to practise: a changed word first, missed twice before once, little words last", () => {
    assert.deepEqual(countMiscues(words), { read: 13, correct: 8, substitution: 2, omission: 2, hesitation: 1, insertion: 1, selfCorrection: 1, repetition: 1, notRead: 1 });
    const p = wordsToPractise(words);
    assert.deepEqual(p.map((x) => x.word), ["station", "bridge", "the"]);
    assert.equal(p[0].why, "SUBSTITUTED");
    assert.equal(p.length, 3);
    assert.deepEqual(wordsToPractise([W("a", "SKIPPED"), W("elephant", "SKIPPED")]).map((x) => x.word), ["elephant", "a"], "little words only after real ones");
  });

  test("next steps are specific to the reading (2–3, plain words) and differ by profile", () => {
    const fb = feedbackSummary({ words, wcpm: 70, accuracy: 62, expression: 2, prosody: null, p25: 87, p50: 121 });
    assert.ok(fb.nextSteps.length >= 2 && fb.nextSteps.length <= 3);
    assert.deepEqual(fb.nextSteps.map((s) => s.code), ["ACCURACY", "WORDS", "SKIPS"]);
    assert.match(fb.nextSteps[1].text, /“station”, “bridge”, “the”/);
    // accurate but slow: speed and phrasing, plus praise for a self-correction
    const clean = Array.from({ length: 30 }, (_, i) => W(`word${i}`, "OK", "", i === 3 ? "SELF_CORRECTION" : undefined));
    const slow = nextSteps({ words: clean, wcpm: 60, accuracy: 100, expression: 2, prosody: null, p25: 87, p50: 121 }, countMiscues(clean), []);
    assert.deepEqual(slow.map((s) => s.code), ["RATE", "PHRASING", "SELF_CORRECT"]);
    // fast but careless
    const fast = Array.from({ length: 30 }, (_, i) => W(`w${i}`, i % 12 === 0 ? "SUBSTITUTED" : "OK"));
    const f2 = nextSteps({ words: fast, wcpm: 150, accuracy: 91, expression: 3, prosody: null, p25: 87, p50: 121 }, countMiscues(fast), wordsToPractise(fast));
    assert.ok(f2.some((s) => s.code === "TOO_FAST"));
    // a perfect reading still gets two clear steps
    const perfect = nextSteps({ words: clean.map((w) => ({ ...w, note: null })), wcpm: 140, accuracy: 100, expression: 4, prosody: null, p25: 87, p50: 121 }, countMiscues(clean.map((w) => ({ ...w, note: null }))), []);
    assert.equal(perfect.length, 2);
    assert.match(perfect[0].text, /beat 140/);
  });

  test("NAEP level (from the overall score or the traits); growth on the same text", () => {
    assert.equal(naepLevel(3, null).level, 3);
    assert.equal(naepLevel(null, { phrasing: { score: 1, reason: "" }, smoothness: { score: 2, reason: "" }, pace: { score: 2, reason: "" }, intonation: null }).level, 2);
    assert.equal(naepLevel(null, null).level, null);
    const g = growthSince({ wcpm: 80, accuracy: 92, date: "2026-10-01" }, { wcpm: 88, accuracy: 95 })!;
    assert.deepEqual([g.wcpmGain, g.accuracyGain], [8, 3]);
    assert.match(g.message, /8 more words correct per minute than last time/);
    assert.equal(growthSince(null, { wcpm: 1, accuracy: 1 }), null);
  });
});

// ------------------------------------------------------------------ remedial plans (pure)

const NOW = new Date("2026-10-12T09:00:00Z");   // fall · Grade 5: p25 87, p50 121, p75 153
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
const ev = (o: Partial<PlanEvidence> & { cold?: PlanEvidence["cold"] }): PlanEvidence => ({ grade: 5, cold: [], readings: [], words: ["station", "bridge"], patterns: ["-tion endings"], links: { same: "RM:a", easier: "RM:e", harder: "RM:h", another: "RM:b" }, ...o });
const cold = (days: number, wcpm: number, accuracy: number | null = 97) => ({ date: at(days), wcpm, accuracy });
const read = (days: number, wcpm: number, accuracy: number, prosody: number | null = 3, kind = "PASSAGE") => ({ date: at(days), kind, wcpm, accuracy, prosody });
const KID_FORBIDDEN = /\b(Below|Above|Tier|RTI|intervention)\b/;

describe("🧭 remedial plans: different profiles → different, specific plans with numeric goals", () => {
  test("decoding profile (85 %, 70 WCPM): accuracy first, easier passages, +2/week, word work + model-echo + repeated", () => {
    const p = buildRemedialPlan(ev({ cold: [cold(-20, 66, 84), cold(-10, 70, 85), cold(-1, 72, 86)], readings: [read(-1, 72, 85, 2)] }), NOW)!;
    assert.equal(p.focus, "ACCURACY"); assert.equal(p.secondary, "RATE"); assert.equal(p.easierText, true);
    assert.deepEqual([p.baseline.wcpm, p.baseline.accuracy, p.baseline.source], [70, 85, "CHECK"]);
    assert.deepEqual([p.goals.weeklyGain, p.weeks, p.goals.wcpm, p.goals.accuracy], [2, 6, 82, 95]);
    assert.deepEqual(p.daily.map((s) => s.method), ["WORD_WORK", "MODEL_ECHO", "REPEATED"]);
    assert.ok(p.daily.every((s) => s.minutes > 0) && p.minutesPerDay === p.daily.reduce((a, s) => a + s.minutes, 0));
    assert.match(p.daily[0].kid, /station, bridge/, "word work on the student's own words");
    assert.match(p.daily[2].href!, /key=RM%3Ae&mode=REPEATED/, "repeated reading of the easier passage");
    assert.equal(p.weekly.method, "COLD_READ"); assert.match(p.weekly.href!, /RM%3Ab.*MINUTE/, "the weekly cold read is a NEW passage");
    assert.equal(p.endsOn.slice(0, 10), "2026-11-23");
    assert.match(p.success[0].teacher, /82 WCPM .* by 2026-11-23 \(baseline 70, \+2 WCPM\/week\)/);
    assert.match(p.success[1].teacher, /Accuracy ≥ 95 %/);
  });

  test("rate profile (accurate, 95 WCPM): repeated reading first, +1.5/week", () => {
    const p = buildRemedialPlan(ev({ cold: [cold(-2, 95, 98)], readings: [read(-2, 95, 98, 3)] }), NOW)!;
    assert.deepEqual([p.focus, p.goals.weeklyGain, p.goals.wcpm, p.goals.accuracy], ["RATE", 1.5, 104, 98]);
    assert.deepEqual(p.daily.map((s) => s.method), ["REPEATED", "PARTNER_CHORAL", "WORD_WORK"]);
    assert.match(p.daily[0].teacher, /3–4 timed readings/);
  });

  test("prosody profile (accurate, near the 50th percentile, reads word by word): echo + phrase-cued, 4 weeks, NAEP goal 3", () => {
    const p = buildRemedialPlan(ev({ cold: [cold(-2, 125, 98)], readings: [read(-3, 120, 98, 2), read(-2, 125, 98, 1.8)] }), NOW)!;
    assert.deepEqual([p.focus, p.weeks, p.goals.weeklyGain, p.goals.prosody], ["PROSODY", 4, 1, 3]);
    assert.deepEqual(p.daily.map((s) => s.method), ["MODEL_ECHO", "PHRASE_CUED", "REPEATED"]);
    assert.ok(p.success.some((x) => /NAEP fluency scale ≥ 3/.test(x.teacher)));
  });

  test("strong reader: wide reading of harder texts; no evidence → no plan", () => {
    const p = buildRemedialPlan(ev({ cold: [cold(-2, 165, 99)], readings: [read(-2, 165, 99, 3.5)] }), NOW)!;
    assert.equal(p.focus, "ENRICH");
    assert.equal(p.daily[0].method, "WIDE_READING"); assert.match(p.daily[0].href!, /RM%3Ah/);
    assert.equal(buildRemedialPlan(ev({}), NOW), null);
    assert.equal(nextRemedialPlan(null, ev({}), NOW), null);
  });

  test("baseline: median of the last 3 cold reads; without one, first readings only (not repeated trials)", () => {
    assert.equal(planBaseline(ev({ cold: [cold(-30, 40), cold(-20, 90), cold(-10, 60), cold(-5, 70)] }))!.wcpm, 70);
    const b = planBaseline(ev({ readings: [read(-3, 60, 95), { ...read(-2, 120, 99, 3, "REPEATED"), trial: 3 }, read(-1, 64, 95, 3, "ECHO")] }))!;
    assert.deepEqual([b.wcpm, b.source], [60, "READING"]);
    assert.deepEqual(chooseFocus({ wcpm: 100, accuracy: 96, prosody: null, source: "CHECK" }, 121), { focus: "RATE", secondary: null });
    assert.deepEqual([weeklyGainFor("RATE", 80, 87, 121), weeklyGainFor("RATE", 100, 87, 121), weeklyGainFor("RATE", 130, 87, 121), weeklyGainFor("PROSODY", 80, 87, 121)], [2, 1.5, 1, 1]);
  });

  test("students see friendly words only (never Below/Above/Tier); teachers see methods and numbers", () => {
    for (const e of [ev({ cold: [cold(-1, 70, 85)] }), ev({ cold: [cold(-1, 95, 98)] }), ev({ cold: [cold(-1, 125, 98)], readings: [read(-1, 125, 98, 2)] }), ev({ cold: [cold(-1, 165, 99)] })]) {
      const p = buildRemedialPlan(e, NOW)!;
      const kid = [p.status.kid, ...p.daily.map((s) => `${s.kidTitle} ${s.kid}`), p.weekly.kid, ...p.success.map((x) => x.kid)].join(" ");
      assert.doesNotMatch(kid, KID_FORBIDDEN);
      assert.ok(p.success[0].kid.includes(String(p.goals.wcpm)));
    }
  });
});

describe("🧭 remedial plans: automatic adjustment from new readings", () => {
  const base = () => buildRemedialPlan(ev({ cold: [cold(0, 95, 98)], readings: [read(0, 95, 98, 3)] }), new Date(at(0.01)))!;   // RATE, +1.5/week from 95

  test("goal line met on 2 cold reads in a row → the goal is raised (+0.5/week), at most +2.5; not again without new reads", () => {
    const p = base();
    assert.equal(goalLine(p, at(7.01)), 97, "95 + 1.5 a week");
    const r = reviewPlan(p, ev({ cold: [cold(0, 95), cold(7, 99), cold(14, 101)] }), new Date(at(14.1)));
    assert.equal(r.status.decision, "RAISE");
    assert.deepEqual([r.goals.weeklyGain, r.goals.wcpm], [2, 107]);
    const again = reviewPlan(r, ev({ cold: [cold(0, 95), cold(7, 99), cold(14, 101)] }), new Date(at(15)));
    assert.equal(again.goals.weeklyGain, 2, "the same evidence never raises twice");
    let capped: RemedialPlan = { ...r, goals: { ...r.goals, weeklyGain: MAX_WEEKLY_GAIN } };
    capped = reviewPlan(capped, ev({ cold: [cold(0, 95), cold(7, 99), cold(14, 101), cold(15, 106)] }), new Date(at(15.1)));
    assert.equal(capped.goals.weeklyGain, MAX_WEEKLY_GAIN);
  });

  test("no growth after 2 weeks → Plan B (other methods), the clock restarts, the teacher is told; twice → check decoding", () => {
    const p = base();
    const r = reviewPlan(p, ev({ cold: [cold(0, 95), cold(7, 94), cold(15, 95)] }), new Date(at(15.1)));
    assert.equal(r.status.decision, "CHANGE_METHOD");
    assert.deepEqual([r.focus, r.methodSet, r.changes], ["RATE", "B", 1]);
    assert.notDeepEqual(r.daily.map((s) => s.method), p.daily.map((s) => s.method));
    assert.ok(r.startedAt > p.startedAt);
    assert.match(r.status.kid, /new way to practise/);
    const r2 = reviewPlan(r, ev({ cold: [cold(0, 95), cold(15, 95), cold(23, 94), cold(30, 95)] }), new Date(at(30.1)));
    assert.deepEqual([r2.status.decision, r2.methodSet, r2.changes], ["CHANGE_METHOD", "A", 2]);
    assert.match(r2.status.teacher, /Word Study screener/);
  });

  test("final goal met → a new plan from the new baseline; accuracy falls under 90 % twice → accuracy first, easier text", () => {
    const p = base();
    const n = reviewPlan(p, ev({ cold: [cold(0, 95), cold(20, 104), cold(27, 106), cold(34, 108)], readings: [read(34, 108, 98, 3)] }), new Date(at(34.1)));
    assert.equal(n.status.decision, "NEXT_FOCUS");
    assert.equal(n.baseline.wcpm, 106, "median of the last 3 cold reads");
    assert.ok(n.goals.wcpm > p.goals.wcpm);
    const e = reviewPlan(p, ev({ cold: [cold(0, 95)], readings: [read(3, 90, 86), read(4, 92, 88)] }), new Date(at(4.1)));
    assert.deepEqual([e.status.decision, e.focus, e.easierText], ["EASIER_TEXT", "ACCURACY", true]);
  });

  test("on track, under the line, a check due, a new cycle", () => {
    const p = base();
    assert.equal(reviewPlan(p, ev({ cold: [cold(0, 95), cold(7, 98)] }), new Date(at(7.1))).status.decision, "ON_TRACK");
    assert.equal(reviewPlan(p, ev({ cold: [cold(0, 95), cold(10, 95)] }), new Date(at(10.1))).status.decision, "KEEP_GOING");
    const due = reviewPlan(p, ev({ cold: [cold(0, 95)] }), new Date(at(8)));
    assert.deepEqual([due.status.decision, due.status.week], ["CHECK_DUE", 2]);
    assert.match(due.status.kid, /weekly 1-minute check/);
    assert.equal(reviewPlan(p, ev({ cold: [cold(0, 95), cold(41, 102)], readings: [read(41, 102, 98)] }), new Date(at(43))).status.decision, "NEW_CYCLE");
  });
});

// ------------------------------------------------------------------ through the coach (fake AI, Test School)

const TEXT = "The old station stood near the river. Every morning the train stopped there, and the children climbed aboard with their bags. They waved to the farmers in the fields and counted the cows on the hills. When the train crossed the bridge, everyone looked down at the shining water below. It was the best part of the journey to school.";
const ENV = { GEMINI_API_KEY: "AIzaTEST" };
const AUDIO = new Uint8Array(3000).fill(5);

describe("🎙 through the coach: feedback, plan and privacy", () => {
  let repo: SqliteRepo; let st: Actor; let teacher: Actor; let classId = ""; let key = "";
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const [admin, t1] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    teacher = t1;
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: r[0].students[0].id }))!.userId }))!);
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: st.studentId }))!.gradeId }))!.level);
    const art = await saveArticle(repo, admin, { code: "RM-TRAIN", title: "The School Train", grade });
    const v = await saveVersion(repo, admin, art, "ON", { lexile: 750, body: TEXT });
    await addVersionQuestion(repo, admin, v, { stem: "Where did the train cross?", whyCorrect: "The bridge.", options: [{ label: "A", text: "The bridge", correct: true }, { label: "B", text: "A road", correct: false, rationale: "No." }] });
    await setArticleStatus(repo, admin, art, "PUBLISHED");
    key = (await coachHome(repo, st, ENV)).passages.find((p) => p.title.startsWith("The School Train"))!.key;
  });

  test("a reading returns every word marked, notes that are not errors, 3 words, next steps and a numeric plan", async () => {
    const scorer: AudioScorer = async () => ({ lastWordIndex: 39, errors: [{ i: 2, kind: "SUBSTITUTED", heard: "stay" }, { i: 6, kind: "SKIPPED", heard: "" }, { i: 30, kind: "HESITATION", heard: "" }], notes: [{ i: 4, kind: "SELF_CORRECTION", heard: "neer" }, { i: 10, kind: "REPETITION", heard: "" }], expression: 2, patterns: ["-tion endings"] } as ReadingMarks);
    const r = await scoreReading(repo, st, { key, mode: "MINUTE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer });
    assert.ok(r.status === "OK");
    if (r.status !== "OK") return;
    const res = r.result;
    assert.deepEqual([res.wordsRead, res.wordsCorrect, res.wcpm], [40, 37, 37], "notes never lower the score");
    assert.deepEqual([res.words[2].mark, res.words[4].mark, res.words[4].note, res.words[10].note, res.words[45].mark], ["SUBSTITUTED", "OK", "SELF_CORRECTION", "REPETITION", "NOT_READ"]);
    const fb = res.feedback!;
    assert.deepEqual([fb.counts.substitution, fb.counts.omission, fb.counts.hesitation, fb.counts.selfCorrection, fb.counts.repetition], [1, 1, 1, 1, 1]);
    assert.equal(fb.practise[0].word, "station");
    assert.ok(fb.practise.length <= 3 && fb.nextSteps.length >= 2 && fb.nextSteps.length <= 3);
    assert.equal(fb.naep.level, 2);
    assert.equal(fb.growth, null, "first reading of this text");
    const plan = res.plan.remedial!;
    assert.ok(plan, "a remedial plan with every reading");
    assert.equal(plan.baseline.wcpm, 37);
    assert.ok(plan.goals.wcpm > 37 && plan.goals.weeklyGain >= 1 && plan.goals.weeklyGain <= 2.5);
    assert.ok(plan.daily.length >= 2 && plan.minutesPerDay >= 10);
    assert.ok(plan.words.includes("station"));
    // the plan is stored with the reading (no new table) and the home page shows it
    const home = await coachHome(repo, st, ENV);
    assert.equal(home.remedial!.goals.wcpm, plan.goals.wcpm);
    // the teacher sees the plan and the progress
    const v = await classFluencyView(repo, teacher, classId);
    const row = v.rows.find((x) => x.id === st.studentId)!;
    assert.equal(row.plan!.goals.wcpm, plan.goals.wcpm);
    assert.ok(row.plan!.focusName.length > 0 && row.plan!.daily[0].teacher.length > 0);
  });

  test("the second reading of the same text shows the growth and reviews the same plan (not a new one)", async () => {
    const before = (await coachHome(repo, st, ENV)).remedial!;
    const r = await scoreReading(repo, st, { key, mode: "PASSAGE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: async () => ({ lastWordIndex: 49, errors: [{ i: 2, kind: "SUBSTITUTED", heard: "stay" }], expression: 3, patterns: [] }) });
    assert.ok(r.status === "OK");
    if (r.status !== "OK") return;
    assert.ok(r.result.feedback!.growth);
    assert.equal(r.result.feedback!.growth!.previous.wcpm, 37);
    assert.equal(r.result.feedback!.growth!.wcpmGain, 49 - 37);
    assert.equal(r.result.plan.remedial!.startedAt, before.startedAt, "the plan keeps its start: it is reviewed, not replaced");
  });

  test("the AI gets the passage words and the measured voice only; a re-sent unclear recording starts with another model", async () => {
    const bodies: string[] = []; const models: string[] = [];
    const nothing = { candidates: [{ content: { parts: [{ text: JSON.stringify({ lastWordIndex: -1, heardWords: 0, errors: [], expression: null, prosody: null, patterns: [] }) }] }, finishReason: "STOP" }] };
    const f = (async (url: string, init: { body: string }) => { models.push(decodeURIComponent(/models\/([^:]+):/.exec(String(url))?.[1] ?? "")); bodies.push(String(init.body)); const text = JSON.stringify(nothing); return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) } as Response; }) as unknown as typeof fetch;
    await assert.rejects(scoreReading(repo, st, { key, mode: "PASSAGE", seconds: 20, voiced: 4, audio: silentWav(1), mime: "audio/wav" }, ENV, { fetchImpl: f }), (e: unknown) => e instanceof NotHeardError && e.code === "HEARD_UNCLEAR");
    const firstModel = models[0];
    for (const b of bodies) {
      assert.match(b, /deviceMeasuredVoiceSeconds/);
      assert.ok(!b.includes(st.studentId!) && !b.includes(st.userId) && !/displayName|username/i.test(b), "no student identifiers");
    }
    models.length = 0;
    await assert.rejects(scoreReading(repo, st, { key, mode: "PASSAGE", seconds: 20, voiced: 4, attempt: 1, audio: silentWav(1), mime: "audio/wav" }, ENV, { fetchImpl: f }), NotHeardError);
    assert.notEqual(models[0], firstModel, "the second analysis starts with another model");
    // no voice measured: the plain "could not hear" (record again)
    await assert.rejects(scoreReading(repo, st, { key, mode: "PASSAGE", seconds: 20, voiced: 0, audio: silentWav(1), mime: "audio/wav" }, ENV, { fetchImpl: f }), (e: unknown) => e instanceof NotHeardError && e.code === "NOT_HEARD");
  });
});
