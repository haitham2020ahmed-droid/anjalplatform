/**
 * ✍️ Locked writing, two improvements (FAKE data on the in-memory demo school, a STUBBED AI provider — no real API):
 *   A) stronger AI grading: rubric-anchored examiner prompt, grade level / word counts / time limit sent, richer output
 *      (evidence quotes validated, toNext, confidence, strengths, next steps, teacher note), two readings merged by the
 *      consistency check (lower level + "unsure", lowered confidence; one failed reading → the other), ONE use of the
 *      daily cap, the teacher's notes for AI grading (no student identifiers), the short-essay cap
 *   B) "Write or paste my rubric": the text / tab-separated table parser (formats + error messages) and task creation
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { setAiSettings } from "../src/server/ai/engine";
import { ValidationError } from "../src/server/curriculum-admin";
import type { AiProvider } from "../src/server/ai/question-generator";
import * as L from "../src/server/writing/locked";
import { parseRubricText, pointsIn, splitTsv } from "../src/server/writing/rubric-text";
import { findQuote } from "../src/server/writing/rich-text";
import { GradeForm } from "../src/components/writing/grade-form";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoDatabase } from "./helpers/db";

const TYPED = `Title: Opinion essay rubric
Ideas: A clear opinion with reasons
4 Exemplary - strong opinion, well-explained reasons
3 Proficient - opinion with two reasons
2 Developing - an opinion with one reason
1 Beginning - no clear opinion

Organization (Order and linking words)
- Beginning (0): no order
- Developing (2): some order
- 4 - Proficient: clear order with linking words

Conventions
Many errors 1 pt - errors make it hard to read
Few errors 3 pts - capitals and full stops are mostly right`;

describe("📝 Write or paste my rubric: the parser", () => {
  test("typed lines: criteria, descriptions, several level styles, levels ordered low → high, a title line", () => {
    const r = parseRubricText(TYPED);
    assert.deepEqual(r.errors, []);
    assert.equal(r.format, "lines");
    assert.equal(r.title, "Opinion essay rubric");
    assert.deepEqual(r.criteria.map((c) => [c.title, c.description]), [["Ideas", "A clear opinion with reasons"], ["Organization", "Order and linking words"], ["Conventions", ""]]);
    assert.deepEqual(r.criteria[0].levels.map((l) => [l.points, l.label]), [[1, "Beginning"], [2, "Developing"], [3, "Proficient"], [4, "Exemplary"]]);
    assert.equal(r.criteria[0].levels[3].description, "strong opinion, well-explained reasons");
    assert.deepEqual(r.criteria[1].levels.map((l) => [l.points, l.label, l.description]), [[0, "Beginning", "no order"], [2, "Developing", "some order"], [4, "Proficient", "clear order with linking words"]]);
    assert.deepEqual(r.criteria[2].levels.map((l) => [l.points, l.label]), [[1, "Many errors"], [3, "Few errors"]]);
    // the server turns it into the platform's rubric (validated by cleanRubric)
    const rubric = L.rubricFromText(TYPED);
    assert.equal(rubric.title, "Opinion essay rubric");
    assert.deepEqual(rubric.criteria.map((c) => c.key), ["c1", "c2", "c3"]);
    assert.equal(L.rubricMax(rubric), 4 + 4 + 3);
    assert.equal(L.rubricFromText(TYPED, "My title").title, "My title");
  });

  test("tolerant: Windows line breaks, extra blank lines and spaces, points at the end, a missing blank line before a “Name:” line", () => {
    const r = parseRubricText("\r\n\r\n  Voice:   personal and lively  \r\n1 Flat - no feeling\r\n\r\n\r\n2 Lively – shows feeling\r\nWord choice: precise words\r\nPlain - everyday words (1 pt)\r\nPrecise - vivid, exact words (3 pts)\r\n");
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.criteria.map((c) => [c.title, c.levels.map((l) => `${l.points} ${l.label}: ${l.description}`)]), [
      ["Voice", ["1 Flat: no feeling", "2 Lively: shows feeling"]],
      ["Word choice", ["1 Plain: everyday words", "3 Precise: vivid, exact words"]],
    ]);
  });

  test("a table pasted from Word / Excel / Google Docs (tabs; headers in several styles; Excel's quoted cells)", () => {
    const tsv = [
      "Opinion essay",
      "Criteria\tExemplary (4)\t3 - Proficient\tDeveloping 2 pts\tBeginning (1)",
      "Ideas (A clear opinion with reasons)\tStrong opinion, well-explained reasons\tOpinion with two reasons\tOne reason\tNo clear opinion",
      "\"Organization\nOrder and linking words\"\t\"Clear, with \"\"First\"\" and \"\"Then\"\"\"\tClear order\tSome order\tNo order",
      "",
      "Conventions\tAlmost no errors\tFew errors\tSome errors\t",
    ].join("\n");
    const r = parseRubricText(tsv);
    assert.deepEqual(r.errors, []);
    assert.equal(r.format, "table");
    assert.equal(r.title, "Opinion essay");
    assert.deepEqual(r.criteria.map((c) => [c.title, c.description]), [["Ideas", "A clear opinion with reasons"], ["Organization", "Order and linking words"], ["Conventions", ""]]);
    for (const c of r.criteria) assert.deepEqual(c.levels.map((l) => [l.points, l.label]), [[1, "Beginning"], [2, "Developing"], [3, "Proficient"], [4, "Exemplary"]]);
    assert.equal(r.criteria[1].levels[3].description, "Clear, with \"First\" and \"Then\"");
    assert.equal(r.criteria[2].levels[0].description, "", "an empty cell is an empty description");
    assert.equal(L.rubricFromText(tsv).criteria.length, 3);
    // headers: the points are found in each style
    assert.deepEqual(["Exemplary (4)", "4 - Exemplary", "Exemplary 4 pts", "4 points", "Exemplary 4", "Level 3", "2"].map((h) => { const p = pointsIn(h)!; return [p.points, p.label]; }),
      [[4, "Exemplary"], [4, "Exemplary"], [4, "Exemplary"], [4, "4 points"], [4, "Exemplary"], [3, "Level 3"], [2, "2"]]);
    assert.equal(pointsIn("Exemplary"), null);
    assert.deepEqual(splitTsv("a\tb\n\n\"x\ny\"\tz").map((x) => x.cells), [["a", "b"], ["x\ny", "z"]]);
  });

  test("clear error messages with the line (or row) and an example", () => {
    const msgs = (t: string) => parseRubricText(t).errors.map((e) => e.message);
    const bad = "Ideas: A clear opinion\n4 Exemplary - strong opinion\n3 Proficient - two reasons\n\nOrganization: order\n- Developing - some order\n3 Proficient - clear order";
    assert.deepEqual(msgs(bad), ["Line 6: a level needs points, e.g. 3 Proficient - opinion with two reasons."]);
    const e = parseRubricText(bad).errors[0];
    assert.deepEqual([e.line, e.key, e.vars], [6, "Line {line}: a level needs points, e.g. 3 Proficient - opinion with two reasons.", { line: 6 }], "a template + vars, so the page can translate it");
    assert.deepEqual(msgs(""), ["Paste a table or type your rubric first."]);
    assert.deepEqual(msgs("Ideas\n4 Exemplary - a\n150 Super - b"), ["Line 3: points must be a whole number from 0 to 100."]);
    assert.deepEqual(msgs("Ideas\n4 Exemplary - a\n3.5 Good - b"), ["Line 3: points must be a whole number from 0 to 100."]);
    assert.deepEqual(msgs("Ideas\n4 Exemplary - a"), ["Line 1: “Ideas” needs 2 to 6 levels (it has 1)."]);
    assert.deepEqual(msgs("Ideas: a clear opinion\n\nOrganization\n1 Low - x\n2 High - y"), ["Line 1: “Ideas” has no levels. Under it, write one level per line, e.g. 3 Proficient - opinion with two reasons."]);
    assert.deepEqual(msgs("Ideas\n4 the student gives a strong opinion with reasons\n1 Low - x"), ["Line 2: separate the level name from its description with “-” or “:”, e.g. 3 Proficient - opinion with two reasons."]);
    assert.deepEqual(msgs("4 Exemplary - a\n3 Proficient - b"), ["Line 1: start with the criterion's name, e.g. Ideas: A clear opinion with reasons.", "Line 2: start with the criterion's name, e.g. Ideas: A clear opinion with reasons."]);
    assert.deepEqual(msgs("Ideas\n1 Low - a\n0 None - b\n\nIdeas\n1 Low - a\n2 High - b"), ["Two criteria are both called “Ideas”."]);
    assert.deepEqual(msgs("Ideas\n0 Low - a\n0 None - b"), ["The rubric needs at least one level worth more than 0 points."]);
    assert.deepEqual(msgs(Array.from({ length: 11 }, (_, i) => `Criterion ${String.fromCharCode(65 + i)}\n1 Low - a\n2 High - b`).join("\n\n")), ["A rubric has at most 10 criteria (this one has 11)."]);
    // tables
    assert.deepEqual(msgs("\tExemplary\tProficient (3)\nIdeas\ta\tb"), ["Row 1: the level header “Exemplary” needs points, e.g. “Exemplary (4)” or “4 - Exemplary”."]);
    assert.deepEqual(msgs("\tHigh (2)\tLow (1)\n\ta\tb"), ["Row 2: write the criterion's name in the first column."]);
    assert.deepEqual(msgs("\tHigh (2)\tLow (1)"), ["Add a row for each criterion under the level headers."]);
    assert.deepEqual(msgs("\tHigh (2)\tLow (1)\nIdeas\ta\tb\tc"), ["Row 2: there is text in a column without a level header."]);
    assert.deepEqual(msgs("\tOnly (2)\nIdeas\ta\nVoice\tb"), ["Row 1: the first row needs 2 to 6 level headers with points, e.g. “Beginning (1)”, “Developing (2)”…"]);
    // the server reports the first problem (and how many more)
    assert.throws(() => L.rubricFromText(bad), (err: Error) => err instanceof ValidationError && /^Line 6: a level needs points/.test(err.message));
    assert.throws(() => L.rubricFromText("Ideas\n4 A - a\n150 B - b\n\nVoice\nnope"), /Line 3: points must be.*\(\+1 more\)/);
  });

  test("evidence quotes are found in the essay ignoring case, spacing and quotation marks", () => {
    const essay = "Our school should have a garden. I  think it's “great” for everyone.";
    assert.deepEqual(findQuote(essay, "our SCHOOL should"), [0, 17]);
    const at = findQuote(essay, "I think its great")!;
    assert.equal(essay.slice(at[0], at[1]), "I  think it's “great");
    assert.equal(findQuote(essay, "not in the essay"), null);
    assert.equal(findQuote(essay, "  "), null);
  });
});

describe("🤖 stronger AI grading (stubbed provider)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let classId = ""; let students: string[] = [];
  let taskId = ""; let studentName = ""; let studentNumber = "";
  const t0 = new Date(Date.UTC(2026, 9, 12, 7));
  const at = (sec: number) => new Date(t0.getTime() + sec * 1000);
  const env = { GEMINI_API_KEY: "AIza-fake" };
  const ESSAY = "Our school should have a garden. First, students can learn about plants. Second, fresh vegetables are healthy for everyone! In the end, a garden makes the school beautiful.";
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  /** Reading 1 and reading 2 disagree on Ideas (Exemplary vs Proficient); one quote is invented; Organization agrees. */
  function stub(fail2 = false): { provider: AiProvider; calls: { system: string; user: string }[] } {
    const calls: { system: string; user: string }[] = [];
    return {
      calls,
      provider: {
        async complete(system, user) {
          calls.push({ system, user });
          const reading = (JSON.parse(user) as { reading?: number }).reading;
          if (reading === 2 && fail2) throw new Error("socket hang up");
          return JSON.stringify({
            criteria: {
              c1: { level: reading === 1 ? 3 : 2, justification: "You give an opinion and two reasons.", evidence: ["Our school should have a garden.", "Gardens are the best thing ever invented"], toNext: "Explain each reason with an example from your school.", confidence: "high" },
              c2: { level: 1, justification: "Ideas follow an order with First and Second.", evidence: ["First, students can learn about plants."], toNext: "Add a closing sentence that links back to your opinion.", confidence: reading === 1 ? "high" : "medium" },
              c3: { level: 1, justification: "Capitals and full stops are mostly right.", evidence: [], toNext: "", confidence: "high" },
            },
            strengths: ["A clear opinion in the first sentence.", "Linking words: First, Second, In the end."],
            nextSteps: ["Explain each reason with an example.", "Add a closing sentence.", "Vary sentence starters.", "A fourth step that is dropped."],
            feedback: reading === 1 ? "You give a clear opinion and two reasons. Next, add an example to each reason." : "Good opinion! Now explain your reasons with examples.",
            teacherNote: "Ideas is borderline between Proficient and Exemplary.",
          });
        },
      },
    };
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    teacher = await actorFor("test.teacher.1");
    other = await actorFor("test.teacher.3");
    classId = String((await readableClasses(repo, teacher))[0].id);
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
    const st = (await repo.findUnique("Student", { id: students[0] }))!;
    const u = (await repo.findUnique("User", { id: st.userId }))!;
    studentName = String(u.displayName); studentNumber = String(st.studentNumber ?? u.username);
  });

  test("a task with the teacher's own rubric text and notes for AI grading (saved for later)", async () => {
    const before = (await L.listRubrics(repo, teacher)).length;
    const base = { classId, title: "School garden", promptHtml: "<p>Should our school have a <b>garden</b>? Give two reasons.</p>", gradeLevel: 5, minWords: 30, timeLimitMin: 30, dueAt: at(7 * 86400) };
    await assert.rejects(L.createLockedTask(repo, teacher, { ...base, rubricText: "Ideas\n4 Exemplary - a\nProficient - b" }, t0), /Line 3: a level needs points/);
    await assert.rejects(L.createLockedTask(repo, teacher, { ...base, rubricText: "" }, t0), /Paste a table or type your rubric first/);
    taskId = await L.createLockedTask(repo, teacher, { ...base, rubricText: TYPED, rubricTitle: "", saveRubric: true, aiNotes: `Focus on the thesis; this class just learned paragraphs. Be gentle with ${studentName}.` }, t0);
    const t = (await repo.findUnique("WritingTask", { id: taskId }))!;
    assert.equal(String(t.rubricText), TYPED, "the original text is kept on the task");
    assert.match(String(t.aiNotes), /^Focus on the thesis/);
    assert.deepEqual(L.rubricOf(t).criteria.map((c) => [c.key, c.title, c.levels.length]), [["c1", "Ideas", 4], ["c2", "Organization", 3], ["c3", "Conventions", 2]]);
    const saved = await L.listRubrics(repo, teacher);
    assert.equal(saved.length, before + 1, "“Save this rubric for later”");
    assert.equal(saved[0].title, "Opinion essay rubric");
    // the student writes and submits
    const me = await studentActor(students[0]);
    await L.startLocked(repo, me, taskId, at(10));
    await L.openLocked(repo, me, taskId, at(11));
    assert.equal((await L.submitLocked(repo, me, taskId, ESSAY, at(600))).status, "SUBMITTED");
    const g = await L.gradingView(repo, teacher, taskId, students[0], at(700));
    assert.deepEqual([g.task.ownRubric, g.task.gradeLevel], [true, 5]);
    assert.match(g.task.aiNotes, /this class just learned paragraphs/);
  });

  test("two readings → disagreement takes the lower level, marked unsure, lower confidence; invalid quotes dropped; one use of the cap", async () => {
    const fake = stub();
    const capKey = (await repo.findMany("RateLimitBucket", {})).filter((b) => String(b.key).startsWith("writing-ai-grade:"));
    assert.equal(capKey.length, 0);
    await assert.rejects(L.aiGradeLocked(repo, other, taskId, students[0], env, at(800), { gemini: () => fake.provider }), ForbiddenError);
    const r = await L.aiGradeLocked(repo, teacher, taskId, students[0], env, at(800), { gemini: () => fake.provider });
    assert.deepEqual([r.outcome, r.runs], ["READY", 2], String(r.reason));
    assert.equal(fake.calls.length, 2);
    // ONE use of the daily AI grading cap for the two readings
    const buckets = (await repo.findMany("RateLimitBucket", {})).filter((b) => String(b.key).startsWith("writing-ai-grade:"));
    assert.deepEqual(buckets.map((b) => Number(b.count)), [1]);

    // the request: rubric-anchored examiner procedure; the task context; the teacher's notes and wording; no identifiers
    assert.match(fake.calls[0].system, /expert ESL\/ELA writing examiner/);
    assert.match(fake.calls[0].system, /starting from the HIGHEST level/);
    assert.match(fake.calls[0].system, /choose the LOWER of the two/);
    assert.match(fake.calls[0].system, /Ignore spelling, punctuation and grammar for any criterion that is not about language/);
    assert.match(fake.calls[0].system, /Never reward length alone/);
    assert.match(fake.calls[0].system, /off-topic .* far too short/);
    const sent = fake.calls.map((c) => JSON.parse(c.user) as Record<string, unknown>);
    assert.deepEqual(sent.map((x) => x.reading), [1, 2]);
    assert.deepEqual([sent[0].gradeLevel, sent[0].minWords, sent[0].wordCount, sent[0].timeLimitMinutes], [5, 30, 28, 30]);
    assert.match(String(sent[0].teacherNotes), /^Focus on the thesis; this class just learned paragraphs\. Be gentle with the student\.$/, "the teacher's notes are sent (a typed student name is removed)");
    assert.equal(sent[0].teacherRubricWording, TYPED);
    const levels = (sent[0].rubric as { levelsHighestFirst: { level: number; points: number }[] }[])[0].levelsHighestFirst;
    assert.deepEqual(levels.map((l) => [l.level, l.points]), [[3, 4], [2, 3], [1, 2], [0, 1]], "levels listed from the highest down, with their index");
    const st = (await repo.findUnique("Student", { id: students[0] }))!;
    const user = (await repo.findUnique("User", { id: st.userId }))!;
    for (const c of fake.calls) for (const secret of [students[0], studentName, String(user.username), studentNumber, String(st.userId), classId, teacher.userId]) assert.ok(!c.user.includes(secret), `no identifier in the AI request: ${secret}`);

    // the merged suggestion
    const g = await L.gradingView(repo, teacher, taskId, students[0], at(900));
    const ai = g.ai!;
    assert.deepEqual([ai.runs, ai.unsure], [2, ["c1"]]);
    assert.deepEqual([ai.criteria.c1.level, ai.criteria.c1.points, ai.criteria.c1.unsure, ai.criteria.c1.confidence], [2, 3, [2, 3], "medium"], "lower level, “AI unsure between Proficient and Exemplary”, confidence lowered");
    assert.deepEqual(ai.criteria.c1.evidence, ["Our school should have a garden."], "a quote that is not in the essay is dropped");
    assert.equal(ai.criteria.c1.quote, "Our school should have a garden.");
    assert.equal(ai.criteria.c1.toNext, "Explain each reason with an example from your school.");
    assert.deepEqual([ai.criteria.c2.level, ai.criteria.c2.unsure, ai.criteria.c2.confidence], [1, null, "medium"], "agreement: the level stands, the lower confidence of the two");
    assert.deepEqual(ai.criteria.c2.evidence, ["First, students can learn about plants."]);
    assert.deepEqual([ai.criteria.c3.level, ai.criteria.c3.toNext, ai.criteria.c3.evidence], [1, "", []], "the top level needs nothing more");
    assert.equal(ai.strengths!.length, 2);
    assert.equal(ai.nextSteps!.length, 3, "at most three next steps");
    assert.equal(ai.feedback, "Good opinion! Now explain your reasons with examples.", "the overall comments of the reading with the lower total");
    assert.match(ai.teacherNote!, /borderline/);
    // the grading page shows it next to each criterion; nothing is filled in by itself
    const html = renderToStaticMarkup(React.createElement(GradeForm, { action: async () => {}, taskId, studentId: students[0], criteria: g.rubric.criteria, sentences: g.sentences, levels: {}, comment: "", notes: [], ai, canGrade: true, returned: false }));
    for (const s of ["AI unsure between Proficient and Exemplary", "Medium confidence", "To reach the next level:", "Explain each reason with an example from your school.", "“Our school should have a garden.”", "Use AI suggestion", "Use all AI suggestions", "Read twice for consistency: the two readings disagreed on 1 criteria", "Suggested feedback for the student", "Use feedback", "Top level of this criterion."]) assert.ok(html.includes(s), `grading page shows: ${s}`);
    assert.match(html, /<textarea name="comment"[^>]*><\/textarea>/, "the suggested feedback is not copied into the comment box by itself");
    assert.ok(!/type="radio"[^>]*checked/.test(html), "no level is chosen by itself");
    assert.equal(g.grading, null);
    const view = await L.lockedTaskForStudent(repo, await studentActor(students[0]), taskId, at(900));
    assert.equal(view.result, null);
    for (const secret of ["Good opinion!", "borderline", "Explain each reason", "justification"]) assert.ok(!JSON.stringify(view).includes(secret), `no AI output in the student's view: ${secret}`);
    // Approve & Return is unchanged: the teacher's choice is what counts
    const ok = await L.saveLockedGrade(repo, teacher, taskId, students[0], { levels: { c1: 2, c2: 2, c3: 1 }, comment: "Good opinion! Now explain your reasons with examples." }, true, at(1000));
    assert.deepEqual([ok.total, ok.max, ok.approved], [3 + 4 + 3, 11, true]);
  });

  test("one reading fails → the other is used (still one use of the cap); notes edited on the grading page are used", async () => {
    const me = await studentActor(students[1]);
    await L.startLocked(repo, me, taskId, at(10));
    await L.openLocked(repo, me, taskId, at(11));
    await L.submitLocked(repo, me, taskId, ESSAY, at(600));
    await assert.rejects(L.saveAiNotes(repo, other, taskId, "x"), ForbiddenError);
    await L.saveAiNotes(repo, teacher, taskId, "  Look for a clear thesis.\r\n\r\n\r\nThey just learned paragraphs.  ");
    assert.equal(String((await repo.findUnique("WritingTask", { id: taskId }))!.aiNotes), "Look for a clear thesis.\n\nThey just learned paragraphs.");
    const fake = stub(true);
    const r = await L.aiGradeLocked(repo, teacher, taskId, students[1], env, at(1200), { gemini: () => fake.provider });
    assert.deepEqual([r.outcome, r.runs], ["READY", 1]);
    assert.equal(JSON.parse(fake.calls[0].user).teacherNotes, "Look for a clear thesis.\n\nThey just learned paragraphs.");
    const ai = (await L.gradingView(repo, teacher, taskId, students[1], at(1300))).ai!;
    assert.deepEqual([ai.runs, ai.unsure, ai.criteria.c1.level, ai.criteria.c1.unsure, ai.criteria.c1.confidence], [1, [], 3, null, "high"], "reading 1 alone, as it is");
    const buckets = (await repo.findMany("RateLimitBucket", {})).filter((b) => String(b.key).startsWith("writing-ai-grade:"));
    assert.deepEqual(buckets.map((b) => Number(b.count)), [2], "two gradings → two uses");
    // both readings fail → FAILED, nothing saved over the old suggestion
    const down: AiProvider = { async complete() { throw new Error("socket hang up"); } };
    const f = await L.aiGradeLocked(repo, teacher, taskId, students[1], env, at(1400), { gemini: () => down });
    assert.equal(f.outcome, "FAILED");
    assert.equal((await L.gradingView(repo, teacher, taskId, students[1], at(1500))).ai!.runs, 1);
  });

  test("merge and cap rules (pure)", () => {
    const rubric = L.cleanRubric({ title: "R", criteria: [
      { title: "Ideas and development", levels: [{ label: "A", points: 1 }, { label: "B", points: 2 }, { label: "C", points: 3 }, { label: "D", points: 4 }] },
      { title: "Conventions", levels: [{ label: "Many", points: 1 }, { label: "Few", points: 3 }] },
    ] });
    const one = (c1: number, c2: number, conf: L.AiConfidence = "high"): L.AiSuggestion => ({
      criteria: {
        c1: { level: c1, points: rubric.criteria[0].levels[c1].points, justification: "j", quote: "", evidence: [], toNext: "t", confidence: conf, unsure: null },
        c2: { level: c2, points: rubric.criteria[1].levels[c2].points, justification: "j", quote: "", evidence: [], toNext: "", confidence: conf, unsure: null },
      }, feedback: `f${c1}${c2}`, strengths: [], nextSteps: [], teacherNote: "",
    });
    const far = L.mergeAiRuns(rubric, [one(3, 1), one(1, 1)]);
    assert.deepEqual([far.criteria.c1.level, far.criteria.c1.unsure, far.criteria.c1.confidence, far.feedback], [1, [1, 3], "low", "f11"], "two levels apart → low confidence");
    const near = L.mergeAiRuns(rubric, [one(2, 1, "medium"), one(3, 0, "high")]);
    assert.deepEqual([near.criteria.c1.level, near.criteria.c1.confidence, near.criteria.c2.level, near.criteria.c2.unsure], [2, "low", 0, [0, 1]]);
    assert.deepEqual(near.unsure, ["c1", "c2"]);
    // far too short (under half of the minimum words): ideas / development capped at the second-lowest level
    const capped = L.capShortEssay(rubric, one(3, 1), 12, 40);
    assert.deepEqual([capped.criteria.c1.level, capped.criteria.c1.capped, capped.criteria.c1.confidence, capped.criteria.c2.level], [1, true, "low", 1], "conventions are not capped");
    assert.equal(L.capShortEssay(rubric, one(3, 1), 25, 40).criteria.c1.level, 3, "not far too short");
    assert.equal(L.capShortEssay(rubric, one(3, 1), 5, null).criteria.c1.level, 3, "no minimum: left to the prompt");
  });

  test("the validator: labels / points instead of an index, an old-style single quote, confidence default, top level toNext", () => {
    const rubric = L.rubricFromText(TYPED);
    const v = L.lockedAiValidator(rubric, ESSAY)({
      criteria: {
        c1: { level: "Proficient", justification: "Two reasons are given.", quote: "“First, students can learn about plants.”", toNext: "Explain the reasons.", confidence: "VERY" },
        c2: { points: 4, justification: "Clear order with linking words.", evidence: "In the end, a garden makes the school beautiful.", toNext: "should be dropped at the top" },
        c3: { level: 0, justification: "Several errors.", evidence: ["a quote that is not there", "x"] },
      },
      feedback: "You give a clear opinion.", strengths: "One strength as a string",
    });
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.deepEqual([v.value.criteria.c1.level, v.value.criteria.c1.evidence, v.value.criteria.c1.confidence], [2, ["First, students can learn about plants."], "medium"]);
    assert.deepEqual([v.value.criteria.c2.level, v.value.criteria.c2.toNext, v.value.criteria.c2.evidence], [2, "", ["In the end, a garden makes the school beautiful."]]);
    assert.deepEqual(v.value.criteria.c3.evidence, []);
    assert.deepEqual(v.value.strengths, ["One strength as a string"]);
    assert.equal(L.lockedAiValidator(rubric, ESSAY)({ criteria: { c1: { level: 1, justification: "ok fine" } }, feedback: "Good work here." }).ok, false, "every criterion is needed");
  });
});
