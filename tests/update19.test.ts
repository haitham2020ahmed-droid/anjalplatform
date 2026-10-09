/**
 * Update 19 (FAKE test data only — the Test School): alerts with follow-up (teacher + head of department), the
 * department summary, worksheets (passage once, key, versions A/B, kept and shared), the click-a-word dictionary and
 * the word notebook, review of mistakes (spaced), comments, unclear-question flags, weekly goals and rhythm, exit
 * tickets, the suggested week plan, the first-week checklist and the numbers on the navigation icons.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { alertList, findAlerts, handleAlert, openAlertCount, scanAlerts, weekKey } from "../src/server/insights/alerts";
import { departmentSummary } from "../src/server/insights/department";
import { deleteWorksheet, openWorksheet, saveWorksheet, worksheetList, worksheetView } from "../src/server/teacher/worksheet";
import { cleanWord, lookupWord, notebook, parseDictionary, saveDefinition, submitWordQuiz, wordQuiz, type Fetcher } from "../src/server/student/words";
import { addComment, classWeek, commentsFor, createExitTicket, dueMistakes, exitTicketResults, flagList, flagQuestion, myExitTicket, resolveFlags, reviewSet, setClassGoal, setClassRhythm, setStudentGoal, studentWeek, submitExitTicket, submitReview, weekStart } from "../src/server/teacher/classroom";
import { hideOnboarding, navCounts, onboarding, planNextWeek, weekSuggestions } from "../src/server/teacher/week-plan";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;

describe("Update 19", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor;
  let classId = ""; let students: string[] = []; let skillId = ""; let qids: string[] = [];
  const now = new Date(Date.UTC(2026, 9, 14, 9));   // a Wednesday
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  /** fake answers for a student: n answers on a skill, `ok` of them correct, `daysAgo` */
  async function answers(studentId: string, ids: string[], ok: boolean[], daysAgo: number, rapid = false) {
    const at = new Date(now.getTime() - daysAgo * DAY);
    const sess = await repo.create("PracticeSession", { studentId, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: at });
    for (let i = 0; i < ids.length; i++) await repo.create("QuestionAttempt", { sessionId: sess.id, studentId, questionId: ids[i], skillId, response: {}, isCorrect: ok[i], responseMs: rapid ? 900 : 25_000, rapidGuess: rapid, difficultyB: 0, createdAt: at });
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await actorFor(`test.teacher.${i}`);
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      const g = Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level);
      if (g === 4 && !classId) { teacher = t; classId = String(c.id); } else if (!other) other = t;
    }
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    // a Grade 4 skill with auto-scored questions
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id });
    for (const k of skills) { const items = await loadQuestionItems(repo, (await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED" })).map((q) => String(q.id))); if (items.length >= 5 && items.every((i) => i.type !== "SHORT_ANSWER")) { skillId = String(k.id); qids = items.map((i) => i.questionId); break; } }
    assert.ok(skillId, "a skill with questions");
    // students are older than a week
    await repo.updateMany("Student", { id: { in: students } }, { createdAt: new Date(now.getTime() - 60 * DAY) });
    // student 0: weak in the skill (2 of 10), recent; student 1: rapid guessing; student 2: practised long ago only
    const ten = Array.from({ length: 10 }, (_, i) => qids[i % qids.length]);
    await answers(students[0], ten, ten.map((_, i) => i < 2), 2);
    await repo.upsert("StudentSkillMastery", { studentId: students[0], skillId }, { studentId: students[0], skillId, score: 15, attempts: 10, correct: 2, lastPracticedAt: new Date(now.getTime() - 2 * DAY), updatedAt: now }, { attempts: 10, correct: 2 });
    const twenty = Array.from({ length: 24 }, (_, i) => qids[i % qids.length]);
    await answers(students[1], twenty, twenty.map(() => false), 1, true);
    await answers(students[2], [qids[0]], [true], 20);
    const twelve = Array.from({ length: 12 }, (_, i) => qids[i % qids.length]);
    await answers(students[4], twelve, twelve.map((_, i) => i < 3), 3);
    await repo.create("MapResult", { studentId: students[3], testDate: new Date(Date.UTC(2026, 8, 15)), subject: "Reading", goalName: null, rit: 160, achievementPercentile: 3, termName: "Fall 2026", rapidGuessPct: 35, importedAt: now });
  });

  test("alerts: found from real data, kept once per week, teacher + admin notified once", async () => {
    assert.equal(weekKey(now), "2026-W42");
    const f = await findAlerts(repo, admin.schoolId!, now);
    const kinds = (id: string) => f.filter((x) => x.studentId === id).map((x) => x.kind);
    assert.ok(kinds(students[0]).includes("WEAK_SKILL"));
    assert.ok(kinds(students[1]).includes("RAPID_GUESS"));
    assert.ok(kinds(students[2]).includes("NO_PRACTICE"));
    assert.ok(kinds(students[3]).includes("MAP_RISK") && kinds(students[3]).includes("RAPID_GUESS"), "MAP Low + retest");
    const n = await scanAlerts(repo, admin.schoolId!, now, true);
    assert.ok(n >= 5);
    assert.equal(await scanAlerts(repo, admin.schoolId!, now, true), 0, "not raised twice the same week");
    const tUser = teacher.userId;
    const notes = await repo.findMany("Notification", { userId: tUser, type: "INTERVENTION_ALERT" });
    assert.equal(notes.length, 1, "one notification per scan");
    assert.equal((await repo.findMany("Notification", { userId: admin.userId, type: "INTERVENTION_ALERT" })).length, 1);
  });

  test("alerts: teacher sees own classes and records the action; admin sees everything and what is not handled", async () => {
    const mine = await alertList(repo, teacher, { status: "OPEN" }, now);
    assert.ok(mine.length >= 5 && mine.every((a) => a.classId === classId));
    assert.equal((await alertList(repo, other, { status: "OPEN" }, now)).filter((a) => a.classId === classId).length, 0);
    await assert.rejects(handleAlert(repo, other, mine[0].id, "Talked"), ForbiddenError);
    await assert.rejects(handleAlert(repo, teacher, mine[0].id, ""), /what you did/);
    await handleAlert(repo, teacher, mine[0].id, "Talked with the student", false, now);
    const all = await alertList(repo, admin, { status: "ALL" }, now);
    const h = all.find((a) => a.id === mine[0].id)!;
    assert.equal(h.status, "HANDLED");
    assert.equal(h.action, "Talked with the student");
    assert.ok(h.handledBy);
    assert.equal(await openAlertCount(repo, teacher), mine.length - 1);
  });

  test("department summary: classes side by side, weakest skills per grade, alerts", async () => {
    const d = await departmentSummary(repo, admin, now);
    assert.ok(d.classes.length >= 6);
    const c = d.classes.find((x) => x.classId === classId)!;
    assert.ok(c.alertsOpen >= 4 && c.alertsHandled === 1);
    assert.ok(d.weakest.find((g) => g.grade === 4)!.skills.some((k) => k.skillId === skillId));
    await assert.rejects(departmentSummary(repo, teacher, now), ForbiddenError);
  });

  test("worksheet: questions in order, a passage once, key on its own, version B shuffled", async () => {
    const withPassage = (await repo.findMany("Question", { status: "PUBLISHED" })).filter((q) => q.passageId);
    const pid = withPassage[0]?.passageId;
    const pq = withPassage.filter((q) => q.passageId === pid).slice(0, 2).map((q) => String(q.id));
    const ids = [qids[0], ...pq, qids[1]];
    const a = await worksheetView(repo, teacher, { ids, title: "Practice (Below Level)" });
    assert.equal(a.title, "Practice", "level names hidden");
    assert.equal(a.count, ids.length);
    assert.equal(a.key.length, ids.length);
    if (pq.length === 2) assert.equal(a.blocks.filter((b) => b.passage).length, 1, "the passage is printed once");
    const b = await worksheetView(repo, teacher, { ids, version: "B" });
    assert.equal(b.count, a.count);
    assert.notDeepEqual(b.key.map((k) => k.answer), a.key.map((k) => k.answer), "version B differs");
    await assert.rejects(worksheetView(repo, await studentActor(students[0]), { ids }), ForbiddenError);
    const id = await saveWorksheet(repo, teacher, { title: "Commas", ids, shared: true });
    assert.equal((await worksheetList(repo, other)).filter((w) => w.id === id).length, 1, "shared with colleagues");
    await assert.rejects(deleteWorksheet(repo, other, id), ForbiddenError);
    assert.deepEqual((await openWorksheet(repo, other, id)).ids, ids);
  });

  test("dictionary: API answer parsed and cached; school definitions first; notebook + weekly quiz", async () => {
    assert.equal(cleanWord("“Running,”"), "running");
    assert.equal(cleanWord("two words"), null);
    const api = [{ word: "brave", phonetic: "/breɪv/", phonetics: [{ text: "/breɪv/", audio: "https://example.org/brave.mp3" }], meanings: [{ partOfSpeech: "adjective", synonyms: ["bold"], antonyms: ["afraid"], definitions: [{ definition: "Ready to face danger.", example: "a brave girl", synonyms: ["courageous"] }] }] }];
    const p = parseDictionary(api);
    assert.deepEqual([p.phonetic, p.meanings[0].partOfSpeech, p.meanings[0].synonyms, p.meanings[0].antonyms], ["/breɪv/", "adjective", ["bold", "courageous"], ["afraid"]]);
    let calls = 0;
    const fake: Fetcher = async (url) => { calls++; const w = decodeURIComponent(url.split("/").pop()!); return { ok: true, status: 200, json: async () => [{ word: w, meanings: [{ partOfSpeech: "noun", definitions: [{ definition: `The meaning of ${w}.` }] }] }] }; };
    const me = await studentActor(students[4]);
    const v = await lookupWord(repo, me, "Brave!", now, fake);
    assert.equal(v.word, "brave");
    await lookupWord(repo, me, "brave", now, fake);
    assert.equal(calls, 1, "cached after the first time");
    await saveDefinition(repo, teacher, "brave", { partOfSpeech: "adjective", definition: "Not afraid to do hard things.", synonyms: "bold, fearless" });
    const again = await lookupWord(repo, me, "brave", now, fake);
    assert.equal(again.source, "SCHOOL");
    assert.equal(again.meanings[0].definition, "Not afraid to do hard things.");
    await assert.rejects(saveDefinition(repo, me, "brave", { partOfSpeech: "x", definition: "yyy" }), ForbiddenError);
    for (const w of ["river", "mountain", "forest", "desert"]) await lookupWord(repo, me, w, now, fake);
    const nb = await notebook(repo, me);
    assert.equal(nb.length, 5);
    assert.equal(nb.find((w) => w.word === "brave")!.lookups, 3);
    const quiz = await wordQuiz(repo, me, now);
    assert.equal(quiz.length, 5);
    assert.ok(quiz.every((q) => q.choices.length === 4 && q.choices.includes(q.word)));
    const r = await submitWordQuiz(repo, me, Object.fromEntries(quiz.map((q) => [q.word, q.word])), now);
    assert.equal(r.correct, 5);
  });

  test("review my mistakes: wrong answers come back after 1, 3, 7 days; three right = learned", async () => {
    const me = await studentActor(students[0]);
    const d = await dueMistakes(repo, students[0], now);
    assert.ok(d.due.length >= 1, "mistakes 2 days ago are due");
    const set = await reviewSet(repo, me, now);
    assert.ok(set.questions.length >= 1 && set.questions.length <= 8);
    const r = await submitReview(repo, me, Object.fromEntries(set.questions.map((q) => [q.questionId, null])), now);
    assert.equal(r.total, set.questions.length);
    assert.ok((await dueMistakes(repo, students[0], now)).waiting >= 1, "answered today: waits for the next review");
  });

  test("comments on work: the teacher writes, the student and the parent read; others cannot", async () => {
    await addComment(repo, teacher, students[0], "Great effort on commas!", null, now);
    await assert.rejects(addComment(repo, other, students[0], "Hi"), ForbiddenError);
    const seen = await commentsFor(repo, await studentActor(students[0]), students[0]);
    assert.equal(seen[0].body, "Great effort on commas!");
    await assert.rejects(commentsFor(repo, await studentActor(students[1]), students[0]), ForbiddenError);
    const n = await repo.findMany("Notification", { userId: (await repo.findUnique("Student", { id: students[0] }))!.userId, type: "TEACHER_FEEDBACK" });
    assert.equal(n.length, 1);
  });

  test("unclear question: students flag it, the admin sees it grouped and resolves it", async () => {
    await flagQuestion(repo, await studentActor(students[0]), qids[0], "UNCLEAR", "I do not understand the word", now);
    await flagQuestion(repo, await studentActor(students[1]), qids[0], "WRONG_ANSWER", "", now);
    await assert.rejects(flagQuestion(repo, await studentActor(students[1]), qids[0], "BAD"), /reason/);
    await assert.rejects(flagList(repo, teacher), ForbiddenError);
    const l = await flagList(repo, admin);
    assert.equal(l[0].count, 2);
    assert.equal(await resolveFlags(repo, admin, qids[0], "FIXED", now), 2);
    assert.equal((await flagList(repo, admin)).length, 0);
  });

  test("weekly goals and rhythm: the student's goal, the class goal, a reminder from Wednesday", async () => {
    const me = await studentActor(students[5]);
    await assert.rejects(setStudentGoal(repo, me, "ANSWERS", 2, now), /from 5/);
    await setStudentGoal(repo, me, "ANSWERS", 30, now);
    await setClassGoal(repo, teacher, classId, { kind: "ANSWERS", target: 200, title: "200 answers together" }, now);
    await assert.rejects(setClassGoal(repo, other, classId, { kind: "ANSWERS", target: 200 }, now), ForbiddenError);
    await setClassRhythm(repo, teacher, classId, { days: 3, minutes: 15 }, now);
    const w = await studentWeek(repo, me, now);
    assert.equal(w.mine?.target, 30);
    assert.equal(w.klass?.title, "200 answers together");
    assert.equal(w.rhythm?.days, 3);
    const n = await repo.findMany("Notification", { userId: me.userId, title: "📅 Practice reminder" });
    assert.equal(n.length, 1, "behind on Wednesday → one reminder");
    await studentWeek(repo, me, now);
    assert.equal((await repo.findMany("Notification", { userId: me.userId, title: "📅 Practice reminder" })).length, 1, "once a week");
    const cw = await classWeek(repo, teacher, classId, now);
    assert.equal(cw.goal?.target, 200);
    assert.equal(weekStart(now).toISOString().slice(0, 10), "2026-10-12");
  });

  test("exit ticket: 3 questions, students answer once, live results for the teacher", async () => {
    const id = await createExitTicket(repo, teacher, classId, { skillId }, now);
    const me = await studentActor(students[0]);
    const t = await myExitTicket(repo, me);
    assert.equal(t?.id, id);
    assert.equal(t!.questions.length, 3);
    const r = await submitExitTicket(repo, me, id, {}, now);
    assert.equal(r.total, 3);
    assert.equal(await myExitTicket(repo, me), null, "answered once");
    await assert.rejects(submitExitTicket(repo, me, id, {}, now), /already/);
    const res = await exitTicketResults(repo, teacher, id);
    assert.equal(res.answered, 1);
    assert.equal(res.questions.length, 3);
    await assert.rejects(exitTicketResults(repo, other, id), ForbiddenError);
  });

  test("week plan: suggestions per class and “Plan next week” in one click", async () => {
    const s = await weekSuggestions(repo, teacher, now);
    const mine = s.find((x) => x.classId === classId)!;
    assert.ok(mine.weak.some((w) => w.skillId === skillId));
    assert.ok(mine.suggestions.some((x) => x.kind === "ALERTS"));
    const r = await planNextWeek(repo, teacher, classId, now);
    assert.ok(r.assigned.length >= 1);
  });

  test("first-week checklist and the numbers on the icons", async () => {
    const o = await onboarding(repo, teacher);
    assert.equal(o.steps.length, 7);
    assert.ok(o.steps.find((x) => x.key === "rhythm")!.done && o.steps.find((x) => x.key === "exit")!.done && o.steps.find((x) => x.key === "assign")!.done);
    await hideOnboarding(repo, teacher, true);
    assert.equal((await onboarding(repo, teacher)).hidden, true);
    const c = await navCounts(repo, await studentActor(students[0]), new Date(now.getTime() + 7 * DAY));
    assert.ok((c["/student"]?.count ?? 0) >= 1, "the planned skills are to do");
    const t = await navCounts(repo, teacher, now);
    assert.ok(t["/teacher/alerts"].count >= 1 && t["/teacher/alerts"].alert);
  });
});
