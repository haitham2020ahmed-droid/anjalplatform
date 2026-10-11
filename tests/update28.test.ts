/**
 * Update 28 (FAKE data only — the Test School): the one-list Grammar library, the search for staff, and the
 * Fluency Coach (1-minute check and whole passage, the rubric, the plan, the audio never stored).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "../src/server/readmaster/service";
import { matchScore, searchEverything } from "../src/server/search/everything";
import { coachHome, coachPassage, coachSummary, countReading, makePlan, passageWords, scoreReading, setCoachSettings, validateMarks, type AudioScorer } from "../src/server/fluency/coach";
import { fluencyLevel, fluencyRubricText } from "../src/server/diagnostic/standards";
import { classFluency, supportGroups } from "../src/server/teacher/support";
import { teacherRoster } from "../src/server/teacher/assign";
import { changeOf, consistencyOf, distribution, percentRank, spreadNote, stdev, trendOf } from "../src/server/insights/stats";
import { classProgress } from "../src/server/insights/progress";
import { demoDatabase } from "./helpers/db";

const TEXT = "The river was low that summer. The farmers watched the sky every morning, hoping for rain. When the clouds finally came, the whole village ran outside to dance in the first heavy drops of water. Children laughed and splashed in the puddles while their parents smiled. That night everyone slept well, listening to the steady sound of the rain on the roofs. In the morning the fields were green again and the river was full.";

describe("Update 28 · search, grammar, Fluency Coach", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let classId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: r[0].students[0].id }))!.userId }))!);
    const g = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: student.studentId }))!.gradeId }))!.level);
    const art = await saveArticle(repo, admin, { code: "RM-RAIN", title: "Rain at Last", grade: g });
    for (const [lv, lex] of [["BELOW", 600], ["ON", 800], ["ABOVE", 1000]] as const) { const v = await saveVersion(repo, admin, art, lv, { lexile: lex, body: TEXT }); await addVersionQuestion(repo, admin, v, { stem: `Why was the village happy (${lv})?`, whyCorrect: "Rain came.", options: [{ label: "A", text: `rain ${lv}`, correct: true }, { label: "B", text: `party ${lv}`, correct: false, rationale: "Not in the text." }] }); }
    await setArticleStatus(repo, admin, art, "PUBLISHED");
  });

  test("search: words, typos and standard codes; every result opens; skills can be assigned", async () => {
    assert.ok(matchScore(["noun"], "Nouns and Pronouns") > 0);
    assert.ok(matchScore(["nouns"], "Common Nouns") > matchScore(["nouns"], "x", "nouns in the text"), "a title hit ranks higher");
    assert.ok(matchScore(["nouns"], "Nouns") > 0 && matchScore(["nowns"], "Nouns") > 0, "a small typo still finds it");
    assert.equal(matchScore(["zebra"], "Nouns"), 0);
    const r = await searchEverything(repo, teacher, "rain");
    assert.ok(r.groups.some((g) => g.kind === "ARTICLE" && g.hits.some((h) => h.title === "Rain at Last")), "ReadMaster article found");
    const pages = await searchEverything(repo, teacher, "alerts");
    assert.ok(pages.groups.find((g) => g.kind === "PAGE")?.hits.some((h) => h.href === "/teacher/alerts"), "a page of the platform");
    const any = await searchEverything(repo, teacher, "main idea");
    const skill = any.groups.find((g) => g.kind === "SKILL")?.hits[0];
    if (skill && skill.sub.includes("questions") && !skill.sub.endsWith(" 0 questions")) assert.match(skill.assignHref ?? "", /^\/teacher\/skill-assign\?skillId=/);
    assert.equal((await searchEverything(repo, teacher, "  ")).total, 0);
  });

  test("rubric: the school's WCPM bands for Grades 4–6", () => {
    assert.deepEqual([fluencyLevel(75, 4, "FALL"), fluencyLevel(76, 4, "FALL"), fluencyLevel(125, 4, "FALL"), fluencyLevel(126, 4, "FALL")], ["BELOW", "ON", "ON", "ABOVE"]);
    assert.deepEqual([fluencyLevel(87, 5, "FALL"), fluencyLevel(88, 5, "FALL"), fluencyLevel(153, 5, "FALL"), fluencyLevel(154, 5, "FALL")], ["BELOW", "ON", "ON", "ABOVE"]);
    assert.deepEqual([fluencyLevel(112, 6, "FALL"), fluencyLevel(113, 6, "FALL"), fluencyLevel(159, 6, "FALL"), fluencyLevel(160, 6, "FALL")], ["BELOW", "ON", "ON", "ABOVE"]);
    assert.equal(fluencyRubricText(5), "Grade 5: Below ≤ 87 · On 88–153 · Above > 153 WCPM");
  });

  test("counting: the platform counts, the AI only marks words", () => {
    const words = passageWords(TEXT, "MINUTE");
    assert.equal(words.length, TEXT.split(" ").length);
    const marks = { lastWordIndex: 49, errors: [{ i: 3, kind: "MISPRONOUNCED" as const, heard: "lo" }, { i: 10, kind: "SKIPPED" as const, heard: "" }, { i: 70, kind: "SKIPPED" as const, heard: "" }], expression: 3, patterns: [] };
    assert.deepEqual(countReading(words, marks, 60, "MINUTE"), { wordsRead: 50, wordsCorrect: 48, seconds: 60, wcpm: 48, accuracy: 96 });
    assert.equal(countReading(words, marks, 30, "MINUTE").wcpm, 96, "finished in 30 s: the minute is prorated");
    assert.equal(countReading(words, marks, 400, "MINUTE").seconds, 60, "never more than one minute");
    // the AI's reply is checked against the passage
    assert.equal(validateMarks({ lastWordIndex: 200, errors: [] }, 50).ok, false);
    assert.equal(validateMarks({ lastWordIndex: 10, errors: [{ i: 3, kind: "WRONG" }] }, 50).ok, false);
    const v = validateMarks({ lastWordIndex: 10, errors: [{ i: 3, kind: "mispronounced", heard: "x" }, { i: 3, kind: "SKIPPED" }, { i: 20, kind: "SKIPPED" }], expression: 9, patterns: ["-tion"] }, 50);
    assert.ok(v.ok && v.value.errors.length === 1 && v.value.expression === null, "one mark per word, only words read, expression 1–4");
    // the plan: by level, with a goal and the next check a week later
    const below = makePlan({ level: "BELOW", wcpm: 60, expression: 2, grade: 4, words: ["summer"], patterns: ["-er endings"], passageKey: "K", nextKey: { same: "K", harder: "H", another: "A" } }, new Date("2026-10-10T08:00:00Z"));
    assert.deepEqual([below.goal, below.nextCheck, below.perWeek, below.nextPassageKey], [70, "2026-10-17", 3, "K"]);
    assert.ok(below.steps.some((s) => /repeated reading/.test(s.text)) && below.steps.some((s) => /storyteller/.test(s.text)));
    assert.equal(makePlan({ level: "ABOVE", wcpm: 140, expression: 4, grade: 4, words: [], patterns: [], passageKey: "K", nextKey: { same: "K", harder: "H", another: "A" } }).nextPassageKey, "H");
  });

  test("Fluency Coach: 1-minute check is official, whole passage is practice, audio never stored", async () => {
    const home = await coachHome(repo, student, { GEMINI_API_KEY: "AIzaTEST" });
    assert.ok(home.enabled && home.ready && home.recommended);
    assert.equal(home.passages.filter((x) => x.source === "READMASTER").length, 3, "the three versions of the article");
    const key = home.passages.find((p) => p.source === "READMASTER" && p.level === "ON")!.key;
    const p = await coachPassage(repo, student, key, "MINUTE");
    let sent: { words: string[]; audio: Uint8Array; mime: string } | null = null;
    const scorer: AudioScorer = async (x) => { sent = x; return { lastWordIndex: 59, errors: [{ i: 5, kind: "MISPRONOUNCED", heard: "sumer" }, { i: 12, kind: "SKIPPED", heard: "" }], expression: 2, patterns: ["-ed endings"] }; };
    const audio = new Uint8Array(4000).fill(7);
    const r = await scoreReading(repo, student, { key, mode: "MINUTE", seconds: 60, audio, mime: "audio/wav" }, { GEMINI_API_KEY: "AIzaTEST" }, { scorer });
    assert.equal(r.status, "OK");
    if (r.status !== "OK") return;
    assert.deepEqual([r.result.wcpm, r.result.accuracy, r.result.official], [58, 97, true]);
    assert.equal(r.result.level, fluencyLevel(58, home.grade));
    assert.deepEqual(r.result.practise, ["summer", "morning"]);
    assert.equal(r.result.words[5].mark, "MISPRONOUNCED"); assert.equal(r.result.words[70].mark, "NOT_READ");
    assert.deepEqual(sent!.words, p.words, "only the passage text and the audio are sent");
    // stored: the reading without any audio; the official check joins Reading Fluency
    const rows = await repo.findMany("FluencyPractice", { studentId: student.studentId });
    assert.equal(rows.length, 1);
    assert.ok(!Object.keys(rows[0]).some((k) => /audio/i.test(k)), "no audio column");
    const check = (await repo.findMany("FluencyCheck", { studentId: student.studentId }))[0];
    assert.deepEqual([Number(check.wcpm), String(check.source)], [58, "COACH"]);
    // whole passage = practice: no official check
    const r2 = await scoreReading(repo, student, { key, mode: "PASSAGE", seconds: 90, audio, mime: "audio/wav" }, { GEMINI_API_KEY: "AIzaTEST" }, { scorer: async () => ({ lastWordIndex: 59, errors: [], expression: 4, patterns: [] }) });
    assert.ok(r2.status === "OK" && !r2.result.official && r2.result.wcpm === 40);
    assert.equal((await repo.findMany("FluencyCheck", { studentId: student.studentId })).length, 1);
    // the teacher sees it, and the family summary has the plan
    const fl = await classFluency(repo, teacher, classId);
    const me = fl.rows.find((x) => x.id === student.studentId)!;
    assert.deepEqual([me.latest?.wcpm, me.latest?.source, me.coach.practices], [58, "COACH", 2]);
    assert.ok((await coachSummary(repo, student.studentId!)).plan);
    if (me.latest?.level === "BELOW") assert.ok((await supportGroups(repo, teacher, classId)).groups.some((g) => g.kind === "FLUENCY"));
  });

  test("Fluency Coach: guards — silence, other passages, the admin's switch, the queue", async () => {
    const home = await coachHome(repo, student, { GEMINI_API_KEY: "AIzaTEST" });
    const key = home.passages[0].key;
    const audio = new Uint8Array(100).fill(1);
    await assert.rejects(scoreReading(repo, student, { key, mode: "MINUTE", seconds: 20, audio, mime: "audio/wav" }, {}, { scorer: async () => ({ lastWordIndex: -1, errors: [], expression: null, patterns: [] }) }), ValidationError, "nothing heard");
    await assert.rejects(scoreReading(repo, student, { key: "RP:someone-else", mode: "MINUTE", seconds: 20, audio, mime: "audio/wav" }, {}, { scorer: async () => ({ lastWordIndex: 1, errors: [], expression: null, patterns: [] }) }), ForbiddenError);
    await assert.rejects(scoreReading(repo, student, { key, mode: "MINUTE", seconds: 20, audio, mime: "text/plain" }, {}, { scorer: async () => ({ lastWordIndex: 1, errors: [], expression: null, patterns: [] }) }), ValidationError);
    await assert.rejects(scoreReading(repo, teacher, { key, mode: "MINUTE", seconds: 20, audio, mime: "audio/wav" }, {}, {}), ForbiddenError);
    // many requests this minute (the school's AI limit): the student waits in the queue
    for (let i = 0; i < 10; i++) await repo.create("AiRequestLog", { schoolId: admin.schoolId, tool: "fluency", provider: "gemini", model: "x", ok: true, items: 1, ms: 1, error: null, createdAt: new Date() });
    const w = await scoreReading(repo, student, { key, mode: "MINUTE", seconds: 30, audio, mime: "audio/wav" }, {}, { scorer: async () => ({ lastWordIndex: 1, errors: [], expression: null, patterns: [] }) });
    assert.equal(w.status, "WAIT");
    await assert.rejects(setCoachSettings(repo, teacher, false), ForbiddenError);
    await setCoachSettings(repo, admin, false);
    await assert.rejects(scoreReading(repo, student, { key, mode: "MINUTE", seconds: 30, audio, mime: "audio/wav" }, {}, { scorer: async () => ({ lastWordIndex: 1, errors: [], expression: null, patterns: [] }) }), /switched off/);
    assert.equal((await coachHome(repo, student, {})).enabled, false);
  });

  test("statistics: the workbook formulas (STDEV.S, PERCENTRANK.INC, trend, consistency, change, distribution)", async () => {
    assert.equal(stdev([7, 6, 4, 6, 7]), 1.2);
    assert.equal(stdev([5]), null);
    assert.deepEqual([percentRank([10, 20, 30, 40, 50], 30), percentRank([10, 20, 30, 40, 50], 10), percentRank([10, 20, 30, 40, 50], 50), percentRank([10, 20, 30, 40, 50], 35)], [50, 0, 100, 63]);
    assert.equal(trendOf([50, 55, 61, 66, 72])!.trend, "UP");
    assert.equal(trendOf([70, 69, 71, 70])!.trend, "FLAT");
    assert.equal(trendOf([80, null, 60, 45])!.trend, "DOWN");
    assert.equal(consistencyOf([40, 90, 35, 95])!.label, "Uneven");
    assert.equal(consistencyOf([70, 72, 69, 71])!.label, "Steady");
    assert.deepEqual(changeOf(15, 17), { from: 15, to: 17, diff: 2, pct: 13.3, label: "Improved" });
    assert.equal(changeOf(15, 15)!.label, "Maintained");
    assert.deepEqual(distribution(["ON", "ON", "BELOW", "ABOVE"], ["ABOVE", "ON", "BELOW"] as const).map((x) => x.pct), [25, 50, 25]);
    assert.match(spreadNote(25), /three level groups/);
    const v = await classProgress(repo, teacher, classId);
    assert.ok(v.stats && Object.keys(v.trends).length === v.rows.length, "every student has a trend entry");
  });
});
