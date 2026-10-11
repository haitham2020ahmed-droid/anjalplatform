/**
 * The advanced Fluency Coach (FAKE data only — the Test School; the AI scorer and provider are fakes, offline):
 * seasonal norms, the 3-second rule and prosody traits, the phrase chunker, the speed drill, repeated reading,
 * two-read averaging, the comprehension check, Arabic-speaker tips and the teacher's class view.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "../src/server/readmaster/service";
import { teacherRoster } from "../src/server/teacher/assign";
import { coachHome, coachSession, drillFor, scoreReading, trialGoal, validateMarks, averageReads, repeatedOffered, type AudioScorer, type ReadingMarks } from "../src/server/fluency/coach";
import { bandEdges, normView, norm50, wcpmPercentile, fluencySeason, weeklyGoal, ordinal } from "../src/server/fluency/norms";
import { FLUENCY_RUBRIC, WCPM_BENCHMARK, fluencyBands, fluencyLevel, fluencyRubricSeasonText, fluencyRubricText, wcpmBenchmark } from "../src/server/diagnostic/standards";
import { chunkPassage, marksForTrial, phrases, sentences } from "../src/server/fluency/phrasing";
import { buildDrill, gridWords, scoreDrill, validateGrid } from "../src/server/fluency/drill";
import { DRILL_PATTERNS, patternForError, patternsOfWord } from "../src/server/fluency/drill-words";
import { arabicTags, tipsFor } from "../src/server/fluency/arabic";
import { answerComprehension, basicQuestions, fastButNotUnderstanding, quizValidator, startComprehension } from "../src/server/fluency/comprehension";
import { classFluencyView, trendDirection } from "../src/server/fluency/class-view";
import { saveFluency } from "../src/server/teacher/support";
import { setAiSettings } from "../src/server/ai/engine";
import { demoDatabase } from "./helpers/db";

const TEXT = "The river was low that summer. The farmers watched the sky every morning, hoping for rain. When the clouds finally came, the whole village ran outside to dance in the first heavy drops of water. Children laughed and splashed in the puddles while their parents smiled. That night everyone slept well, listening to the steady sound of the rain on the roofs. In the morning the fields were green again and the river was full.";
const OTHER = "A small fox lived at the edge of a quiet wood. Every evening it walked to the stream to drink. One night it saw a bright light between the trees. The fox was curious, so it crept closer and closer. It was only the moon, shining on the water. The fox drank, looked at the moon for a long time, and went home happy.";
const ENV = { GEMINI_API_KEY: "AIzaTEST" };
const AUDIO = new Uint8Array(3000).fill(5);
const fixed = (m: Partial<ReadingMarks> & { lastWordIndex: number }): AudioScorer => async () => ({ errors: [], expression: 3, patterns: [], ...m });

describe("Fluency Coach · advanced", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string; let students: Actor[]; let grade: number;
  let onKey: string; let otherKey: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });   // many fake readings in one minute
    students = [];
    for (const st of r[0].students.slice(0, 6)) students.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: students[0].studentId }))!.gradeId }))!.level);
    const art = await saveArticle(repo, admin, { code: "RM-RAIN2", title: "Rain at Last", grade });
    for (const [lv, lex] of [["BELOW", 600], ["ON", 800], ["ABOVE", 1000]] as const) {
      const v = await saveVersion(repo, admin, art, lv, { lexile: lex, body: TEXT });
      await addVersionQuestion(repo, admin, v, { stem: `Why was the village happy (${lv})?`, whyCorrect: "Rain came.", options: [{ label: "A", text: "Rain came at last.", correct: true }, { label: "B", text: "There was a party.", correct: false, rationale: "Not in the text." }, { label: "C", text: "The river was full of fish.", correct: false, rationale: "Not in the text." }] });
      if (lv === "ON") await addVersionQuestion(repo, admin, v, { stem: "When did the clouds come?", whyCorrect: "After a dry summer.", options: [{ label: "A", text: "After a dry summer.", correct: true }, { label: "B", text: "In the winter snow.", correct: false, rationale: "No." }, { label: "C", text: "Never.", correct: false, rationale: "No." }] });
    }
    await setArticleStatus(repo, admin, art, "PUBLISHED");
    const fox = await saveArticle(repo, admin, { code: "RM-FOX", title: "The Fox and the Moon", grade });
    const fv = await saveVersion(repo, admin, fox, "ON", { lexile: 700, body: OTHER });
    await addVersionQuestion(repo, admin, fv, { stem: "What did the fox see?", whyCorrect: "The moon.", options: [{ label: "A", text: "The moon", correct: true }, { label: "B", text: "A dog", correct: false, rationale: "No." }] });
    await setArticleStatus(repo, admin, fox, "PUBLISHED");
    const home = await coachHome(repo, students[0], ENV);
    onKey = home.passages.find((p) => p.title.startsWith("Rain at Last") && p.level === "ON")!.key;
    otherKey = home.passages.find((p) => p.title.startsWith("The Fox"))!.key;
  });

  test("norms: percentile and bands by season; the sentence for students and teachers", () => {
    assert.equal(wcpmPercentile(5, 109, "WINTER"), 25);
    assert.equal(wcpmPercentile(5, 133, "WINTER"), 50);
    assert.equal(wcpmPercentile(5, 92, "WINTER"), 15);
    assert.ok(wcpmPercentile(5, 92, "FALL")! > wcpmPercentile(5, 92, "SPRING")!, "the same score is a higher percentile in the fall");
    const v = normView(5, 92, "WINTER");
    assert.equal(v.text, "92 WCPM = 15th percentile (winter, Grade 5)");
    assert.match(v.kid, /faster than about 15 of every 100 Grade 5 readers in the winter/);
    assert.equal(v.band, "BELOW"); assert.equal(v.needsWork, true);
    assert.deepEqual([ordinal(1), ordinal(2), ordinal(3), ordinal(11), ordinal(23)], ["1st", "2nd", "3rd", "11th", "23rd"]);
    assert.deepEqual(bandEdges(4, "SPRING"), { below: 105, above: 160, p50: 133 });
    // the goal: next week's WCPM on the way to the next season's 50th percentile
    const g = weeklyGoal(4, 80, new Date("2026-10-10T00:00:00Z"))!;
    assert.equal(g.target, 120); assert.equal(g.season, "WINTER"); assert.ok(g.weeks >= 13 && g.weeks <= 15);
    assert.equal(g.nextGoal, 80 + Math.ceil(g.perWeek));
    assert.equal(weeklyGoal(4, 150, new Date("2026-10-10T00:00:00Z"))!.reached, true);
  });

  test("standards.ts uses the seasonal norms", () => {
    assert.deepEqual(fluencyBands(4, "FALL"), { below: 75, above: 125 });
    assert.deepEqual(fluencyBands(5, "WINTER"), { below: 109, above: 160 });
    assert.deepEqual(fluencyBands(6, "SPRING"), { below: 122, above: 171 });
    assert.deepEqual([fluencyLevel(100, 5, "FALL"), fluencyLevel(100, 5, "WINTER")], ["ON", "BELOW"]);
    assert.equal(fluencyRubricText(5, "WINTER"), "Grade 5: Below ≤ 109 · On 110–160 · Above > 160 WCPM");
    assert.equal(fluencyRubricSeasonText(5, "WINTER"), "Grade 5 · winter: Below ≤ 109 · On 110–160 · Above > 160 WCPM");
    const now = fluencySeason();
    assert.equal(WCPM_BENCHMARK[5], norm50(5, now)); assert.equal(wcpmBenchmark(6, "WINTER"), 145);
    assert.deepEqual(FLUENCY_RUBRIC[4], fluencyBands(4, now));
    assert.equal(WCPM_BENCHMARK[2], 84, "grades outside the norms keep their benchmark");
  });

  test("scoring: the 3-second rule and the four prosody traits (validated and clamped)", async () => {
    const v = validateMarks({ lastWordIndex: 20, errors: [{ i: 2, kind: "SKIPPED" }], hesitations: [2, 7, { i: 9 }, 40], expression: 2.6, prosody: { phrasing: { score: 7, reason: "Reads in long, natural groups." }, smoothness: { score: "2", reason: "Some restarts." }, pace: { score: 0, reason: "x".repeat(400) }, intonation: null }, patterns: [] }, 30);
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.deepEqual(v.value.hesitations, [2, 7, 9], "only words read; 40 is out of range");
    assert.deepEqual(v.value.errors.map((e) => `${e.i}:${e.kind}`), ["2:SKIPPED", "7:HESITATION", "9:HESITATION"], "a hesitation over 3 s is an error; one mark per word");
    assert.equal(v.value.expression, 3);
    assert.deepEqual([v.value.prosody!.phrasing!.score, v.value.prosody!.smoothness!.score, v.value.prosody!.pace!.score, v.value.prosody!.intonation], [4, 2, 1, null]);
    assert.equal(v.value.prosody!.pace!.reason.length, 140);
    // no expression, but prosody: the overall scale comes from the traits
    const v2 = validateMarks({ lastWordIndex: 5, errors: [], prosody: { phrasing: 2, smoothness: 2, pace: 3, intonation: 1 } }, 10);
    assert.ok(v2.ok && v2.value.expression === 2);
    // through the coach: hesitations count as errors, prosody and hesitations are stored, audio is not
    const st = students[0];
    let task = "";
    const scorer: AudioScorer = async (x) => { task = x.task ?? ""; return { lastWordIndex: 49, errors: [{ i: 3, kind: "MISPRONOUNCED", heard: "lo" }], hesitations: [10, 11], expression: 2, patterns: ["-ed endings"], prosody: { phrasing: { score: 2, reason: "Two words at a time." }, smoothness: { score: 3, reason: "A few breaks." }, pace: { score: 2, reason: "Slow." }, intonation: { score: 2, reason: "Flat voice." } } }; };
    const r = await scoreReading(repo, st, { key: onKey, mode: "PASSAGE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer });
    assert.ok(r.status === "OK");
    if (r.status !== "OK") return;
    assert.equal(task, "READ");
    assert.deepEqual([r.result.wordsCorrect, r.result.hesitations, r.result.words[10].mark], [47, 2, "HESITATION"]);
    assert.equal(r.result.prosody!.phrasing!.score, 2);
    const row = (await repo.findMany("FluencyPractice", { studentId: st.studentId }))[0];
    const pj = typeof row.prosody === "string" ? JSON.parse(row.prosody) : row.prosody;
    assert.deepEqual([pj.phrasing, pj.smoothness, pj.pace, pj.intonation, Number(row.hesitations), String(row.practiceKind)], [2, 3, 2, 2, 2, "PASSAGE"]);
    assert.ok(!Object.keys(row).some((k) => /audio/i.test(k)));
  });

  test("phrase chunker: punctuation, conjunctions, prepositions, subject | verb; marks fade over trials", () => {
    const words = TEXT.split(" ");
    const marks = chunkPassage(words);
    const ph = phrases(words, marks);
    assert.equal(marks[words.indexOf("summer.")], "//");
    assert.equal(marks[words.indexOf("morning,")], "/");
    assert.ok(ph.includes("The farmers") || ph.some((p) => p.startsWith("The farmers") && p.split(" ").length <= 6));
    assert.ok(ph.every((p) => p.split(" ").length <= 7), "short phrases");
    assert.ok(ph.some((p) => /^(in|to|while|when)\b/i.test(p)), "a phrase starts at a preposition or conjunction");
    assert.equal(marks[marks.length - 1], "", "no mark after the last word");
    const sv = chunkPassage("The tall old farmer watched the sky.".split(" "));
    assert.equal(phrases("The tall old farmer watched the sky.".split(" "), sv)[0], "The tall old farmer", "subject | predicate");
    assert.deepEqual(phrases("I ran to the shop and bought some bread.".split(" ")), ["I ran to the shop", "and bought some bread."], "a pause before and");
    // fading
    assert.ok(marksForTrial(marks, 1).includes("/") && marksForTrial(marks, 1).includes("//"));
    assert.ok(!marksForTrial(marks, 2).includes("/") && marksForTrial(marks, 2).includes("//"));
    assert.ok(marksForTrial(marks, 3).every((m) => m === ""));
    assert.equal(sentences(words).length, 6);
    assert.deepEqual(chunkPassage(words), marks, "deterministic");
  });

  test("speed drill: the word bank, the grid from the student's own errors, the reteach rule", async () => {
    assert.ok(DRILL_PATTERNS.length >= 15);
    for (const p of DRILL_PATTERNS) {
      assert.ok(p.words.length >= 20, `${p.code} has 20+ words`);
      assert.equal(new Set(p.words).size, p.words.length, `${p.code}: no repeats`);
      const misfit = p.words.filter((w) => !p.test.test(w));
      assert.deepEqual(misfit, [], `${p.code}: every word has the pattern`);
    }
    assert.ok(patternsOfWord("station").includes("TION"));
    assert.equal(patternForError("jumped", ["-ed endings"]), "ED");
    assert.equal(patternForError("knight", []), "SILENT");
    const g = buildDrill({ errorWords: ["station", "nation", "night", "jumped", "Thursday"], notes: ["-tion endings"], seed: "s1" });
    assert.equal(g.rows.length, 5);
    assert.equal(g.rows[0].pattern, "TION", "the student's most-missed pattern first");
    assert.ok(g.rows[0].words.includes("station") && g.rows[0].words.includes("nation"), "own words in the row");
    assert.ok(g.rows.every((r) => r.words.length === 6));
    assert.equal(new Set(gridWords(g)).size, 30, "no word twice");
    assert.deepEqual(buildDrill({ errorWords: ["station", "nation", "night", "jumped", "Thursday"], notes: ["-tion endings"], seed: "s1" }), g, "same seed, same grid");
    // the grid sent back is checked
    assert.ok(validateGrid(g, ["station", "nation", "night", "jumped", "thursday"]));
    assert.equal(validateGrid({ rows: [{ pattern: "TION", words: ["hacker"] }] }, []), null);
    assert.equal(validateGrid({ rows: [{ pattern: "NOPE", words: ["nation"] }] }, []), null);
    // scoring: WCPM over the grid; a row with more than one miss → reteach
    const res = scoreDrill(g, { lastWordIndex: 20, errors: [{ i: 0 }, { i: 3 }, { i: 7 }, { i: 25 }] }, 60);
    assert.deepEqual([res.wordsRead, res.wordsCorrect, res.wcpm], [21, 18, 18]);
    assert.deepEqual(res.rows.map((r) => r.misses), [2, 1, 0, 0, 0], "index 25 was not reached");
    assert.deepEqual(res.reteach, [g.rows[0].pattern]);
    // through the coach: the drill of the student's own errors, scored and stored
    const st = students[0];
    const grid = await drillFor(repo, st);
    assert.ok(grid.rows.some((r) => r.words.includes("lo") || r.pattern), "a grid");
    const words = gridWords(grid);
    let task = "";
    const r = await scoreReading(repo, st, { key: "DRILL", mode: "PASSAGE", kind: "DRILL", grid, seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: async (x) => { task = x.task!; assert.deepEqual(x.words, words); return { lastWordIndex: 11, errors: [{ i: 0, kind: "MISPRONOUNCED", heard: "x" }, { i: 1, kind: "SKIPPED", heard: "" }], expression: 3, patterns: [] }; } });
    assert.ok(r.status === "OK" && r.result.drill);
    if (r.status !== "OK") return;
    assert.equal(task, "DRILL");
    assert.deepEqual([r.result.wcpm, r.result.expression, r.result.drill!.reteach], [10, null, [grid.rows[0].pattern]]);
    await assert.rejects(scoreReading(repo, st, { key: "DRILL", mode: "PASSAGE", kind: "DRILL", grid: { rows: [{ pattern: "TION", words: ["secret"] }] }, seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 1 }) }), ValidationError);
    assert.equal((await repo.findMany("FluencyCheck", { studentId: st.studentId })).length, 0, "drills are practice");
  });

  test("echo reading: one sentence at a time, compared with the model", async () => {
    const st = students[5];
    const s = await coachSession(repo, st, onKey, "ECHO");
    assert.equal(s.sentences!.length, 6);
    let sent: string[] = []; let task = "";
    const r = await scoreReading(repo, st, { key: onKey, mode: "PASSAGE", kind: "ECHO", sentence: 1, seconds: 4, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: async (x) => { sent = x.words; task = x.task!; return { lastWordIndex: x.words.length - 1, errors: [], expression: 3, patterns: [], prosody: { phrasing: { score: 3, reason: "Pause at the comma after morning." }, smoothness: 3, pace: 3, intonation: 2 } as never }; } });
    assert.equal(sent.join(" "), "The farmers watched the sky every morning, hoping for rain.");
    assert.equal(task, "ECHO");
    assert.ok(r.status === "OK" && r.result.echo!.sentence === 1 && r.result.prosody!.phrasing!.reason.includes("comma"));
    await assert.rejects(scoreReading(repo, st, { key: onKey, mode: "PASSAGE", kind: "ECHO", sentence: 99, seconds: 4, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 1 }) }), ValidationError);
  });

  test("repeated reading: up to 5 trials with a stretch goal; not offered to students already Above", async () => {
    assert.equal(trialGoal(80, 133), 88, "+10%");
    assert.equal(trialGoal(128, 133), 133, "capped at the 50th percentile while under it");
    assert.equal(trialGoal(140, 133), 154);
    assert.deepEqual([repeatedOffered("ABOVE"), repeatedOffered("ON"), repeatedOffered(null)], [false, true, true]);
    const st = students[1];
    const s0 = await coachSession(repo, st, onKey, "REPEATED");
    assert.deepEqual([s0.offered, s0.trial, s0.goal], [true, 1, null]);
    for (const [k, last] of [39, 44, 49, 54, 59].entries()) {
      const r = await scoreReading(repo, st, { key: onKey, mode: "PASSAGE", kind: "REPEATED", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: last }) });
      assert.ok(r.status === "OK" && r.result.trial === k + 1);
      if (r.status === "OK" && k === 1) { assert.deepEqual(r.result.trials.map((t) => t.wcpm), [40, 45]); assert.equal(r.result.trials[1].goal, 44); assert.equal(r.result.nextGoal, 50); }
    }
    const done = await coachSession(repo, st, onKey, "REPEATED");
    assert.equal(done.offered, false);
    await assert.rejects(scoreReading(repo, st, { key: onKey, mode: "PASSAGE", kind: "REPEATED", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 30 }) }), /5 times/);
    // a student whose latest official check is Above: wider reading instead
    const above = students[2];
    await saveFluency(repo, teacher, classId, [{ studentId: above.studentId!, wcpm: 210 }]);
    const s1 = await coachSession(repo, above, onKey, "REPEATED");
    assert.equal(s1.offered, false); assert.match(s1.reason!, /Wider reading/i);
    assert.equal((await coachHome(repo, above, ENV)).repeatedOffered, false);
    await assert.rejects(scoreReading(repo, above, { key: onKey, mode: "PASSAGE", kind: "REPEATED", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 30 }) }), /above your grade level/);
    // phrased reading: the trials fade the marks
    const p1 = await coachSession(repo, above, onKey, "PHRASED");
    assert.ok(p1.marks!.includes("/"));
    await scoreReading(repo, above, { key: onKey, mode: "PASSAGE", kind: "PHRASED", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 30 }) });
    const p2 = await coachSession(repo, above, onKey, "PHRASED");
    assert.deepEqual([p2.trial, p2.marks!.includes("/"), p2.marks!.includes("//")], [2, false, true]);
  });

  test("official 1-minute check: season + percentile stored; two cold reads the same day are averaged", async () => {
    assert.equal(averageReads([88, 95]), 92);
    const st = students[3];
    const now = new Date();
    const r1 = await scoreReading(repo, st, { key: onKey, mode: "MINUTE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 59 }) }, now);
    assert.ok(r1.status === "OK" && r1.result.official && r1.result.average === null);
    let checks = await repo.findMany("FluencyCheck", { studentId: st.studentId });
    assert.equal(checks.length, 1);
    assert.deepEqual([String(checks[0].season), Number(checks[0].percentile)], [fluencySeason(now), normView(grade, 60, fluencySeason(now)).percentile]);
    const r2 = await scoreReading(repo, st, { key: otherKey, mode: "MINUTE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 63 }) }, new Date(now.getTime() + 60_000));
    assert.ok(r2.status === "OK");
    if (r2.status !== "OK") return;
    assert.deepEqual(r2.result.average, { reads: [60, 64], wcpm: 62 });
    assert.match(r2.result.norm.text, /^62 WCPM = \d+(st|nd|rd|th) percentile \((fall|winter|spring), Grade \d\)$/);
    checks = await repo.findMany("FluencyCheck", { studentId: st.studentId });
    assert.equal(checks.length, 1, "one official check for the day");
    assert.deepEqual([Number(checks[0].wcpm), Number(checks[0].percentile)], [62, normView(grade, 62, fluencySeason(now)).percentile]);
    assert.match(String(checks[0].note), /average of 2 cold reads \(60 and 64 WCPM\)/);
    assert.equal((await repo.findMany("FluencyPractice", { studentId: st.studentId, mode: "MINUTE" })).length, 2, "both reads recorded");
    const home = await coachHome(repo, st, ENV);
    assert.equal(home.norm!.wcpm, 62); assert.equal(home.progress.length, 1); assert.ok(home.goal);
  });

  test("comprehension: linked questions, AI questions (text only), the basic fallback; the fast-but-not-understanding flag", async () => {
    assert.equal(fastButNotUnderstanding(5, 140, 50, "WINTER"), true);
    assert.equal(fastButNotUnderstanding(5, 140, 60, "WINTER"), false);
    assert.equal(fastButNotUnderstanding(5, 120, 20, "WINTER"), false, "not fast");
    assert.equal(quizValidator({ questions: [{ stem: "a", options: ["x", "y", "z"], answer: 3 }, { stem: "b", options: ["x", "y", "z"], answer: 0 }] }).ok, false);
    const st = students[4];
    // 1. the passage's own ReadMaster questions
    const r = await scoreReading(repo, st, { key: onKey, mode: "MINUTE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 74 }) });
    assert.ok(r.status === "OK");
    if (r.status !== "OK") return;
    const q = await startComprehension(repo, st, r.result.id, {});
    assert.equal(q.source, "BANK"); assert.equal(q.questions.length, 2);
    assert.ok(!JSON.stringify(q).includes("\"answer\""), "the answers stay on the server");
    const right = q.questions.map((x) => x.options.findIndex((o) => /Rain came|dry summer/.test(o)));
    const res = await answerComprehension(repo, st, r.result.id, [right[0], (right[1] + 1) % 3]);
    assert.deepEqual([res.correct, res.total, res.pct], [1, 2, 50]);
    const check = (await repo.findMany("FluencyCheck", { studentId: st.studentId }))[0];
    assert.equal(Number(check.comprehension), 50, "the official check gets the comprehension");
    await assert.rejects(answerComprehension(repo, st, r.result.id, [0, 0]), ValidationError);
    await assert.rejects(startComprehension(repo, students[0], r.result.id, {}), /not found/);
    // 2. no linked questions → the AI writes them from the passage text only
    let sentUser = "";
    const make = { gemini: (() => ({ complete: async (_sys: string, user: string) => { sentUser = user; return JSON.stringify({ questions: [{ stem: "Where did the fox go every evening?", options: ["To the stream", "To the city", "To school"], answer: 0 }, { stem: "What was the light?", options: ["A fire", "The moon", "A lamp"], answer: 1 }] }); } })) as never };
    const r2 = await scoreReading(repo, st, { key: otherKey, mode: "PASSAGE", seconds: 30, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 60 }) });
    assert.ok(r2.status === "OK");
    if (r2.status !== "OK") return;
    const q2 = await startComprehension(repo, st, r2.result.id, ENV, { make });
    assert.equal(q2.source, "AI");
    assert.ok(sentUser.includes("small fox") && !sentUser.includes(st.studentId!) && !/student/i.test(sentUser), "only the passage text is sent");
    const res2 = await answerComprehension(repo, st, r2.result.id, [0, 1]);
    assert.equal(res2.pct, 100);
    // 3. AI off → the basic main-idea / retell questions
    const r3 = await scoreReading(repo, st, { key: otherKey, mode: "PASSAGE", seconds: 30, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 60 }) });
    const q3 = await startComprehension(repo, st, r3.status === "OK" ? r3.result.id : "", {});
    assert.equal(q3.source, "BASIC"); assert.ok(q3.questions.length >= 2);
    const b = basicQuestions({ title: "The Fox and the Moon", body: OTHER }, [{ title: "Rain at Last · On", body: TEXT }, { title: "Desert Night", body: "The desert was cold at night and very quiet. Stars filled the sky above the tents." }], "seed");
    assert.equal(b[0].options[b[0].answer], "The Fox and the Moon");
    assert.ok(OTHER.includes(b[1].options[b[1].answer]));
  });

  test("Arabic-speaker support: tags for tips only, never for scores", () => {
    assert.deepEqual(arabicTags("park", "bark"), ["PB"]);
    assert.ok(arabicTags("very", "fery").includes("VF"));
    assert.ok(arabicTags("think", "sink").includes("TH"));
    assert.ok(arabicTags("jumped", "jumpid").includes("ED"));
    assert.ok(arabicTags("street", "istreet").includes("CLUSTER"));
    assert.ok(arabicTags("knee", "kanee").includes("SILENT"));
    assert.ok(arabicTags("bit", "bet").includes("SHORT_VOWEL"));
    assert.deepEqual(arabicTags("a", "b"), []);
    const tips = tipsFor([{ word: "park", heard: "bark" }, { word: "pen", heard: "ben" }, { word: "think", heard: "sink" }]);
    assert.equal(tips[0].code, "PB"); assert.deepEqual(tips[0].words, ["park", "pen"]);
  });

  test("teacher: class view with percentile, band, prosody, comprehension, trend, flags, patterns and groups", async () => {
    assert.deepEqual([trendDirection([50, 55, 61]), trendDirection([70, 69]), trendDirection([80, 60]), trendDirection([1])], ["UP", "FLAT", "DOWN", null]);
    // a fast reader who did not understand
    const st = students[0];
    await saveFluency(repo, teacher, classId, [{ studentId: st.studentId!, wcpm: 200 }]);
    const r = await scoreReading(repo, st, { key: otherKey, mode: "PASSAGE", seconds: 30, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 60 }) });
    const q = await startComprehension(repo, st, r.status === "OK" ? r.result.id : "", {});
    await answerComprehension(repo, st, r.status === "OK" ? r.result.id : "", q.questions.map(() => 99));
    // two students missing -ed words → a drill group
    for (const s of [students[5], students[3]]) await scoreReading(repo, s, { key: onKey, mode: "PASSAGE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 40, errors: [{ i: 8, kind: "MISPRONOUNCED", heard: "watch-ed" }], patterns: ["-ed endings"], prosody: { phrasing: { score: 1, reason: "Word by word." }, smoothness: null, pace: null, intonation: null } }) });
    const v = await classFluencyView(repo, teacher, classId);
    const me = v.rows.find((x) => x.id === st.studentId)!;
    assert.equal(me.wcpm, 200); assert.equal(me.band, "ABOVE"); assert.ok(me.percentile! >= 90);
    assert.equal(me.fastNotUnderstanding, true);
    assert.ok(v.groups.some((g) => g.kind === "COMPREHENSION" && g.students.some((x) => x.id === st.studentId)));
    assert.equal(v.patterns[0].code, "ED"); assert.ok(v.patterns[0].words.includes("watched"));
    assert.ok(v.groups.some((g) => g.kind === "DRILL" && g.key === "drill-ED" && g.students.length >= 2));
    assert.ok(v.groups.some((g) => g.kind === "PHRASED" && g.students.some((x) => x.id === students[5].studentId)));
    const low = v.rows.find((x) => x.id === students[3].studentId)!;
    assert.equal(low.needsWork, true); assert.equal(low.trend.length, 1);
    assert.ok(v.groups.some((g) => g.kind === "REPEATED" && g.students.some((x) => x.id === students[3].studentId)));
    const saved = (await repo.findMany("FluencyCheck", { studentId: st.studentId, source: "TEACHER" }))[0];
    assert.ok(saved.season && saved.percentile !== null, "teacher checks keep season and percentile too");
  });
});
