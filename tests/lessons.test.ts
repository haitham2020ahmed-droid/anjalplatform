/** 🧩 Interactive intervention lessons: content, engine (pass / fail / approaches), hint ladder, organizers, teacher views, tiers. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { LESSONS, LESSON_BY_FAMILY, ORGANIZERS, lessonFor } from "../src/server/lessons/content";
import { answerLesson, answerModel, beginGuided, cleanOrganizer, inviteToLesson, lessonHint, lessonsForStudent, logOf, modelSentences, openLesson, organizerCompleteness, pickItems, saveOrganizer, LESSON_SESSION_MARK, type LessonView } from "../src/server/lessons/run";
import { assignLesson, classLessonProgress, interpretQar, lessonRunDetail, qarReport, scriptCard } from "../src/server/lessons/teacher";
import { evidenceForItem, strategyStepFor } from "../src/server/lessons/hints";
import { creditAfterHints, hintLadderStep, pickEvidenceSentence, passageParagraphs } from "../src/tutor/tutor";
import { loadSkillItems, type PracticeItem } from "../src/server/practice/items";
import { practiceHint, startPractice, submitAnswer } from "../src/server/practice/session";
import { routeReteach } from "../src/server/tiers/tiers";
import { demoDatabase } from "./helpers/db";
import { afterResponseSettled } from "../src/server/lib/after-response";

const NOW = new Date("2026-10-10T08:00:00Z");
let clock = NOW.getTime();
const tick = () => new Date((clock += 30_000));

function right(it: PracticeItem): unknown {
  switch (it.type) {
    case "MULTIPLE_CHOICE": case "DROPDOWN": return it.options!.find((o) => o.correct)!.label;
    case "MULTI_SELECT": return it.options!.filter((o) => o.correct).map((o) => o.label);
    case "TRUE_FALSE": return it.answer;
    case "FILL_BLANK": return it.answers![0];
    case "SENTENCE_ORDER": case "WORD_ORDER": return it.sequence;
    case "MATCHING": return Object.fromEntries(it.pairs!.map((p) => [p.left, p.right]));
    case "TWO_PART": return { a: it.twoPart!.partA.options.find((o) => o.correct)!.label, b: it.twoPart!.partB.multiple ? it.twoPart!.partB.options.filter((o) => o.correct).map((o) => o.label) : it.twoPart!.partB.options.find((o) => o.correct)!.label };
    case "HOT_TEXT": return it.hotText!.correct;
    case "GRID": return it.grid!.answer;
    default: return it.errorIndex;
  }
}
function wrong(it: PracticeItem): unknown {
  switch (it.type) {
    case "MULTIPLE_CHOICE": case "DROPDOWN": return it.options!.find((o) => !o.correct)!.label;
    case "MULTI_SELECT": return [it.options!.find((o) => !o.correct)!.label];
    case "TRUE_FALSE": return !it.answer;
    case "FILL_BLANK": return "qqqq";
    case "SENTENCE_ORDER": case "WORD_ORDER": return [...it.sequence!].reverse();
    case "TWO_PART": return { a: it.twoPart!.partA.options.find((o) => !o.correct)!.label, b: it.twoPart!.partB.multiple ? [it.twoPart!.partB.options.find((o) => !o.correct)!.label] : it.twoPart!.partB.options.find((o) => !o.correct)!.label };
    case "HOT_TEXT": return [it.hotText!.segments.find((x) => !it.hotText!.correct.includes(x.id))!.id];
    case "MATCHING": return Object.fromEntries(it.pairs!.map((p, k) => [p.left, it.pairs![(k + 1) % it.pairs!.length].right]));
    default: throw new Error(`no wrong answer for ${it.type}`);
  }
}

describe("🧩 lesson content", () => {
  test("every reading and vocabulary family of the curriculum has a complete, original lesson", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    const fams = (await repo.findMany("SkillFamily", {})).filter((f) => f.domain === "READING" || f.domain === "VOCABULARY");
    assert.ok(fams.length >= 40);
    const missing = fams.filter((f) => !LESSON_BY_FAMILY.has(String(f.code))).map((f) => String(f.code));
    assert.deepEqual(missing, [], "families without a lesson");
    for (const l of LESSONS) {
      const where = `lesson ${l.family}`;
      assert.ok(l.definition.length > 30 && l.steps.length >= 3 && l.steps.length <= 5, where);
      assert.ok(l.thinkAloud.length >= 4 && l.thinkAloud.length <= 6, `${where}: think-aloud`);
      assert.ok(l.signalWords.length >= 3, where);
      const words = l.passage.text.split(/\s+/).length;
      assert.ok(words >= 70 && words <= 170, `${where}: passage of ${words} words`);
      assert.ok(l.passage.clues.length >= 1 && l.passage.clues.every((c) => l.passage.text.includes(c)), `${where}: clues are sentences of the passage`);
      assert.ok(modelSentences(l).some((s) => l.passage.clues.some((c) => c.includes(s) || s.includes(c))), `${where}: the worked example has a right choice`);
      assert.ok(l.worked.question && l.worked.answer && l.worked.why, where);
      assert.ok(l.organizer === "NONE" || ORGANIZERS[l.organizer], where);
      assert.equal(l.reteach.length, 2);
      assert.notEqual(l.reteach[0].title, l.reteach[1].title, `${where}: two different re-teach approaches`);
      assert.ok(l.frames.every((f) => f.includes("___")), `${where}: sentence frames`);
      assert.ok(l.warmUp.length > 20, where);
    }
    const structure = ["cause-effect", "compare-contrast", "sequence", "problem-solution", "central-idea", "plot-setting", "character", "author-claim", "context-clues", "prefixes"];
    assert.deepEqual(structure.map((f) => lessonFor(f)!.organizer), ["CAUSE_EFFECT", "COMPARE", "SEQUENCE", "PROBLEM_SOLUTION", "CENTRAL_IDEA_DETAILS", "PLOT_MAP", "CHARACTER_TRAITS", "CLAIM_EVIDENCE", "CONTEXT_CLUE", "WORD_PARTS"]);
  });
});

describe("💡 hint ladder, evidence picker, organizers, item choice (pure)", () => {
  test("the evidence sentence has the best word overlap with the answer; ties go to the earlier sentence", () => {
    const theme = lessonFor("theme")!;
    const ev = pickEvidenceSentence(theme.passage.text, [theme.worked.answer, theme.worked.why])!;
    assert.equal(ev.paragraph, 3);
    assert.match(ev.sentence, /^She realized that slow and careful work/);
    assert.deepEqual(pickEvidenceSentence(theme.passage.text, [theme.worked.answer, theme.worked.why]), ev, "deterministic");
    assert.equal(pickEvidenceSentence("Cats nap.\n\nDogs nap.", ["nap"])!.paragraph, 1, "tie → first");
    assert.equal(pickEvidenceSentence("Nothing here.", ["zebra"]), null);
    assert.equal(passageParagraphs("## Head\n\nOne.\nstill one.\n\nTwo.").length, 2, "headings are not numbered");
  });

  test("ladder: 1 = QAR + strategy step, 2 = paragraph, 3 = clue sentence; credit drops with each hint", () => {
    const ctx = { qar: "THINK_AND_SEARCH", strategyStep: "Find the effect first.", passage: "A.\n\nB is here.", evidence: { paragraph: 2, sentence: "B is here.", score: 1 }, itemHint: null, correctTexts: ["B"] };
    const h1 = hintLadderStep(1, ctx), h2 = hintLadderStep(2, ctx), h3 = hintLadderStep(3, ctx);
    assert.match(h1.text, /Think and Search/); assert.match(h1.text, /Find the effect first/);
    assert.equal(h2.paragraph, 2); assert.match(h2.text, /paragraph 2/); assert.equal(h2.sentence, null);
    assert.equal(h3.sentence, "B is here."); assert.match(h3.text, /B is here/);
    assert.equal(hintLadderStep(9, ctx).level, 3);
    assert.deepEqual([0, 1, 2, 3].map((n) => creditAfterHints(1, n)), [1, 0.75, 0.5, 0.25]);
    const noPassage = hintLadderStep(2, { ...ctx, passage: null, evidence: null, itemHint: "Look at the prefix." });
    assert.equal(noPassage.text, "Look at the prefix.");
    assert.match(strategyStepFor("cause-effect", "What caused the flood?")!, /\w/);
  });

  test("organizer completeness and cleaning", () => {
    const spec = ORGANIZERS.CAUSE_EFFECT;
    const v = cleanOrganizer(spec, { rows: [["Rain fell", "The river rose"], ["  ", "x"]], extra: "<b>" });
    assert.equal(v.rows.length, 3);
    const c = organizerCompleteness(spec, v);
    assert.equal(c.complete, false); assert.match(c.missing[0], /1 more complete row/);
    assert.equal(organizerCompleteness(spec, cleanOrganizer(spec, { rows: [["Rain fell", "The river rose"], ["Wind blew", "Trees fell"]] })).complete, true);
    const wp = ORGANIZERS.WORD_PARTS;
    assert.deepEqual(organizerCompleteness(wp, { head: "", rows: [], foot: "" }).missing.length, 3, "head, rows and foot");
  });

  test("items: at/below the level first, unused first, approach 2 = easiest first, never twice in a run (no-repeat rule)", () => {
    const items = [{ questionId: "a", b: -1 }, { questionId: "b", b: 0 }, { questionId: "c", b: 0.2 }, { questionId: "d", b: 1.5 }, { questionId: "e", b: -2 }];
    assert.deepEqual(pickItems(items, 0, 3, new Map(), 0), ["c", "b", "a"]);
    assert.deepEqual(pickItems(items, 0, 3, new Map([["c", 1]]), 0), ["b", "a", "e"]);
    assert.deepEqual(pickItems(items, 0, 3, new Map(), 2), ["e", "a", "b"], "easier items");
    // a small pool gives a shorter set: never the same item twice in one set, never an item already used in the run
    assert.deepEqual(pickItems(items.slice(0, 2), 0, 5, new Map(), 0), ["b", "a"]);
    assert.deepEqual(pickItems(items, 0, 3, new Map([["a", 1], ["b", 1], ["c", 1], ["e", 1]]), 0), ["d"]);
    // copies of one content count as the same item; items the student never attempted come first
    const withCopy = [...items, { questionId: "c2", b: 0.1, keys: ["s:c"] }].map((i) => (i.questionId === "c" ? { ...i, keys: ["s:c"] } : i));
    assert.deepEqual(pickItems(withCopy, 0, 3, new Map([["c", 1]]), 0), ["b", "a", "e"], "the copy of a used item is not used");
    assert.deepEqual(pickItems(items, 0, 3, new Map(), 0, (id) => (id === "c" ? 5 : 0)), ["b", "a", "e"], "unseen first");
    // the whole bank used in this run: least used first, still never twice in a set
    assert.deepEqual(pickItems(items.slice(0, 2), 0, 3, new Map([["a", 2], ["b", 1]]), 0), ["b", "a"]);
  });
});

describe("🧩 lesson runs (Test School)", () => {
  let repo: SqliteRepo;
  let s1: Actor, s2: Actor, s3: Actor, t1: Actor, t2: Actor;
  let skillId: string, classId: string;
  let items: Map<string, PracticeItem>;
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [s1, s2, s3, t1, t2] = await Promise.all(["test.student.001", "test.student.002", "test.student.003", "test.teacher.1", "test.teacher.2"].map(a));
    assert.ok(t1.teacherStudentIds!.has(s1.studentId!) && t1.teacherStudentIds!.has(s2.studentId!), "student 001/002 are in teacher 1's class");
    classId = String((await repo.findMany("ClassMembership", { studentId: s1.studentId!, leftAt: null }))[0].classId);
    const st = (await repo.findUnique("Student", { id: s1.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const fam = (await repo.findMany("SkillFamily", { code: "cause-effect" }))[0];
    skillId = String((await repo.findMany("Skill", { curriculumId: cur.id, familyId: fam.id }))[0].id);
    items = new Map((await loadSkillItems(repo, skillId)).map((i) => [i.questionId, i]));
    assert.ok(items.size >= 3 && [...items.values()].some((i) => i.passageText));
  });

  const answer = async (actor: Actor, v: LessonView, ok: boolean) => {
    const it = items.get(v.question!.questionId)!;
    return answerLesson(repo, actor, { runId: v.runId, questionId: it.questionId, response: ok ? right(it) : wrong(it) }, tick());
  };

  test("pass path: model → guided with the hint ladder → independent → quick check 5/5 → DONE; attempts and mastery recorded", async () => {
    let v = await openLesson(repo, s1, skillId, tick());
    assert.equal(v.phase, "MODEL");
    assert.equal((await openLesson(repo, s1, skillId, tick())).runId, v.runId, "resumes the open run");
    await assert.rejects(beginGuided(repo, s1, v.runId, tick()), /worked example first/);
    const clue = v.model.sentences.findIndex((x) => v.content.passage.clues.some((c) => c.includes(x)));
    v = await answerModel(repo, s1, v.runId, clue, tick());
    assert.deepEqual([v.model.correct, Boolean(v.model.answer)], [true, true]);
    v = await beginGuided(repo, s1, v.runId, tick());
    assert.equal(v.phase, "GUIDED"); assert.equal(v.progress!.total, 3);
    await assert.rejects(lessonHint(repo, s2, v.runId, v.question!.questionId, tick()), ForbiddenError, "not your lesson");
    await assert.rejects(lessonHint(repo, s1, v.runId, "other", tick()), /no longer open/);
    const levels: number[] = [];
    for (let k = 0; k < 3; k++) { const h = await lessonHint(repo, s1, v.runId, v.question!.questionId, tick()); levels.push(h.hint.level); v = h.view; }
    assert.deepEqual(levels, [1, 2, 3]);
    assert.equal(v.hints.length, 3); assert.equal(v.canHint, false);
    const it = items.get(v.question!.questionId)!;
    if (it.passageText) { assert.ok(v.hints[1].paragraph); assert.equal(v.hints[2].sentence, evidenceForItem(it)!.sentence, "level 3 = the evidence sentence"); }
    await assert.rejects(lessonHint(repo, s1, v.runId, v.question!.questionId, tick()), /every hint/);
    let r = await answer(s1, v, true);
    assert.equal(r.feedback.correct, true); assert.equal(r.lessonCredit, 0.25, "3 hints → a quarter of the credit");
    const ses = (await repo.findMany("PracticeSession", { studentId: s1.studentId!, skillId, endReason: LESSON_SESSION_MARK }))[0];
    assert.ok(ses, "answers live in the run's session");
    assert.equal((await repo.findMany("QuestionAttempt", { sessionId: ses.id }))[0].usedHint, true);
    v = r.view;
    while (v.phase === "GUIDED") v = (await answer(s1, v, true)).view;
    assert.equal(v.phase, "INDEPENDENT");
    await assert.rejects(lessonHint(repo, s1, v.runId, v.question!.questionId, tick()), /guided practice only/);
    while (v.phase === "INDEPENDENT") v = (await answer(s1, v, true)).view;
    assert.equal(v.phase, "CHECK"); assert.equal(v.progress!.total, 5);
    while (v.phase === "CHECK") { r = await answer(s1, v, true); v = r.view; }
    assert.deepEqual([v.phase, v.passed, v.checkPct, v.attempts, v.approach, v.outcome], ["DONE", true, 100, 1, 0, "PASSED"]);
    assert.equal(await repo.count("QuestionAttempt", { sessionId: ses.id }), 11);
    const m = (await repo.findUnique("StudentSkillMastery", { studentId: s1.studentId!, skillId }))!;
    assert.ok(Number(m.attempts) >= 11 && Number(m.score) > 0, "mastery updated like practice");
    assert.ok((await repo.findUnique("PracticeSession", { id: ses.id }))!.endedAt, "session closed with the run");
    const pv = await startPractice(repo, s1, skillId, tick());
    assert.notEqual(pv.sessionId, ses.id, "normal practice never resumes a lesson session");
    assert.equal((await openLesson(repo, s1, skillId, tick())).outcome, "PASSED", "the result stays until the student starts again");
    assert.equal((await openLesson(repo, s1, skillId, tick(), { again: true })).phase, "MODEL");
  });

  test("fail path: each miss goes back one phase with a NEW approach (organizer first, then easier items + frames); then the teacher is told", async () => {
    let v = await openLesson(repo, s2, skillId, tick());
    v = await answerModel(repo, s2, v.runId, 0, tick());
    v = await beginGuided(repo, s2, v.runId, tick());
    while (v.phase === "GUIDED") v = (await answer(s2, v, true)).view;
    while (v.phase === "INDEPENDENT" && v.approach === 0) v = (await answer(s2, v, false)).view;
    assert.deepEqual([v.phase, v.approach], ["GUIDED", 1], "independent missed → guided, approach 1");
    assert.equal(v.lastResult!.passed, false);
    assert.ok(v.reteach && v.organizer?.required);
    await assert.rejects(answer(s2, v, true), /Finish the organizer first/);
    const half = await saveOrganizer(repo, s2, v.runId, { rows: [["Heavy rain", "The river rose"]] }, tick());
    assert.equal(half.complete, false);
    const full = await saveOrganizer(repo, s2, v.runId, { rows: [["Heavy rain", "The river rose"], ["The river rose", "Roads closed"]] }, tick());
    assert.equal(full.complete, true);
    v = full.view;
    while (v.phase === "GUIDED") v = (await answer(s2, v, true)).view;
    while (v.phase === "INDEPENDENT") v = (await answer(s2, v, true)).view;
    assert.equal(v.phase, "CHECK");
    while (v.phase === "CHECK" && v.approach === 1) v = (await answer(s2, v, false)).view;
    assert.deepEqual([v.phase, v.approach, v.attempts, v.checkPct, v.showFrames], ["INDEPENDENT", 2, 1, 0, true], "check missed → independent, approach 2 with frames");
    while (v.phase === "INDEPENDENT") v = (await answer(s2, v, true)).view;
    while (v.phase === "CHECK") v = (await answer(s2, v, false)).view;
    assert.deepEqual([v.phase, v.passed, v.attempts, v.outcome], ["DONE", false, 2, "NEEDS_TEACHER"]);
    const run = (await repo.findUnique("LessonRun", { id: v.runId }))!;
    const approaches = logOf(run).filter((e) => e.t === "SET").map((e) => (e as { approach: number }).approach);
    assert.deepEqual([...new Set(approaches)], [0, 1, 2], "an approach is never repeated after it failed");
    const tUser = t1.userId;
    await afterResponseSettled(); // the teachers are told after the answer's response (Update 42B)
    assert.ok((await repo.findMany("Notification", { userId: tUser, type: "INTERVENTION_ALERT" })).some((n) => String(n.link) === `/teacher/lessons/${v.runId}`));
  });

  test("teacher: assign (notification, idempotent), progress, run detail and script card are scoped; QAR report", async () => {
    const r = await assignLesson(repo, t1, { classId, skillId, studentIds: [s3.studentId!] }, tick());
    assert.deepEqual(r, { assigned: 1, already: 0 });
    assert.deepEqual(await assignLesson(repo, t1, { classId, skillId, studentIds: [s3.studentId!] }, tick()), { assigned: 0, already: 1 });
    const u3 = (await repo.findUnique("Student", { id: s3.studentId! }))!.userId;
    const note = (await repo.findMany("Notification", { userId: u3, type: "NEW_ASSIGNMENT" })).find((n) => String(n.link).startsWith("/student/lesson?skillId="));
    assert.ok(note, "the student is told, with a link");
    const list = await lessonsForStudent(repo, s3);
    assert.ok(list.open.some((x) => x.skillId === skillId && x.source === "TEACHER"));
    await assert.rejects(assignLesson(repo, t2, { classId, skillId }, tick()), ForbiddenError);
    await assert.rejects(assignLesson(repo, s1, { classId, skillId }, tick()), ForbiddenError);
    const rows = await classLessonProgress(repo, t1, classId);
    const r2 = rows.find((x) => x.studentId === s2.studentId)!;
    assert.deepEqual([r2.phase, r2.passed, r2.attempts, r2.approach, r2.organizer], ["DONE", false, 2, 2, "COMPLETE"]);
    assert.ok(rows.some((x) => x.studentId === s1.studentId && x.passed === true && x.checkPct === 100));
    await assert.rejects(classLessonProgress(repo, t2, classId), ForbiddenError);
    const det = await lessonRunDetail(repo, t1, r2.runId);
    assert.equal(det.organizer!.complete, true); assert.ok(det.steps.some((e) => e.t === "RESULT"));
    await assert.rejects(lessonRunDetail(repo, t2, r2.runId), ForbiddenError);
    await assert.rejects(lessonRunDetail(repo, s1, r2.runId), ForbiddenError);
    const card = await scriptCard(repo, t1, classId, skillId);
    assert.deepEqual(card.minutes, { warmUp: 2, model: 4, guided: 5, check: 4 });
    assert.ok(card.warmUp && card.model.thinkAloud.length && card.guided.frames.length === 2 && card.check.reteach.length === 2);
    const wrongCodes = (await repo.findMany("QuestionAttempt", { studentId: s2.studentId!, skillId, isCorrect: false })).filter((x) => x.misconception);
    if (wrongCodes.length) assert.ok(card.misconceptions.length >= 1, "the class's common mistakes come from its wrong answers");
    // QAR: tag the questions the class answered, then read the report
    const qIds = [...new Set((await repo.findMany("QuestionAttempt", { studentId: { in: [s1.studentId!, s2.studentId!] } })).map((x) => String(x.questionId)))];
    for (const [k, id] of qIds.entries()) await repo.updateMany("Question", { id }, { tags: { qar: k % 2 ? "RIGHT_THERE" : "AUTHOR_AND_ME" } });
    const q = await qarReport(repo, t1, classId, { now: new Date(clock) });
    assert.ok(q.rows.length >= 1 && q.rows.every((x) => x.name && x.accuracy >= 0));
    assert.ok(q.interpretation.length > 20);
    await assert.rejects(qarReport(repo, t2, classId), ForbiddenError);
    assert.match(interpretQar([{ value: "RIGHT_THERE", accuracy: 85, answers: 20 }, { value: "AUTHOR_AND_ME", accuracy: 50, answers: 20 }]), /weakest on Author and Me \(50%\)/);
    assert.match(interpretQar([]), /Not enough/);
  });

  test("tiers: reteach routing also invites the student to the lesson for the focus skill, once", async () => {
    const st = (await repo.findUnique("User", { username: "test.student.004" }))!;
    const sid = String((await repo.findUnique("Student", { userId: st.id }))!.id);
    const school = String((await repo.findUnique("Student", { id: sid }))!.schoolId);
    const n = await routeReteach(repo, school, [{ studentId: sid, tier: 2, skillId }], NOW);
    assert.equal(n, 1);
    const runs = await repo.findMany("LessonRun", { studentId: sid, skillId });
    assert.deepEqual(runs.map((x) => String(x.source)), ["TIER"]);
    assert.equal((await repo.findMany("Notification", { userId: st.id })).filter((x) => String(x.link) === `/student/lesson?skillId=${encodeURIComponent(skillId)}`).length, 1);
    assert.equal(await routeReteach(repo, school, [{ studentId: sid, tier: 2, skillId }], NOW), 0);
    assert.equal(await inviteToLesson(repo, sid, skillId, "TIER", NOW), false, "an open run is not invited again");
    assert.equal(await repo.count("LessonRun", { studentId: sid, skillId }), 1);
  });

  test("practice: repeated hint requests step through the 3 levels; the answer is recorded as hinted", async () => {
    const actor = await resolveActor(repo, (await repo.findUnique("User", { username: "test.student.005" }))!);
    const v = await startPractice(repo, actor, skillId, tick());
    const q = v.question!;
    const levels: number[] = [];
    for (let k = 0; k < 4; k++) levels.push((await practiceHint(repo, actor, v.sessionId, q.questionId)).level);
    assert.deepEqual(levels, [1, 2, 3, 3]);
    const it = items.get(q.questionId)!;
    const r = await submitAnswer(repo, actor, { sessionId: v.sessionId, questionId: q.questionId, response: right(it) }, tick());
    assert.equal((await repo.findMany("QuestionAttempt", { sessionId: v.sessionId }))[0].usedHint, true);
    if (r.view.question) assert.equal((await practiceHint(repo, actor, v.sessionId, r.view.question.questionId)).level, 1, "a new question starts the ladder again");
  });

  test("students: only their own curriculum and lessons", async () => {
    await assert.rejects(openLesson(repo, t1, skillId), ForbiddenError);
    const st = (await repo.findUnique("Student", { id: s1.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const foreign = (await repo.findMany("Skill", {})).find((k) => k.curriculumId !== cur.id)!;
    await assert.rejects(openLesson(repo, s1, String(foreign.id)), ForbiddenError);
  });
});
