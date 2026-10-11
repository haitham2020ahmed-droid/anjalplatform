import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";
import { classifyMisconception, chosenMisconception, MISCONCEPTIONS } from "../src/insights/misconceptions";
import { isRecentRepeat, markRepeats, evidenceWeight } from "../src/adaptive/evidence";
import { DEFAULT_ADAPTIVE, resolveEngineConfig } from "../src/config/engine";
import { nextReview, REVIEW_DAYS } from "../src/mastery/review";
import { recommendSkills, type SkillSnapshot } from "../src/recommendations/recommend";
import { tagOptions, groupMisconceptions } from "../src/server/insights/misconception-tags";
import { loadSkillItems } from "../src/server/practice/items";
import { practiceHint, startPractice, submitAnswer } from "../src/server/practice/session";
import { skillEvidence } from "../src/server/insights/skill-snapshots";
import { decaySweep, decayFactorFor, maybeRunDaily, runDaily, riyadhDay } from "../src/server/insights/daily";
import { predictNext, buildProfiles, profilesOf } from "../src/server/insights/student-profile";
import { classInterventions, evaluateInterventions, startIntervention } from "../src/server/insights/interventions";
import { evaluateRecommendations, logRecommendations, recommendationStats } from "../src/server/insights/recommendation-log";
import { ensurePrerequisites } from "../src/server/skills/auto-prerequisites";
import { nextStep } from "../src/server/student/next-step";
import { evidenceLevels } from "../src/server/curriculum-map/evidence-level";
import type { MapSummary } from "../src/server/insights/student-data";

const DAY = 86_400_000;

describe("🧠 Update 32: misconceptions, repeats, review, decay (pure rules)", () => {
  test("every wrong option gets a misconception from its rationale, else the skill family's usual error", () => {
    assert.equal(classifyMisconception("G4.theme", "This is a detail about wind, not the lesson of the story."), "DETAIL_NOT_MAIN");
    assert.equal(classifyMisconception("G5.context-clues", "Height is not mentioned."), "CONTEXT_IGNORED", "vocabulary keeps its own family error");
    assert.equal(classifyMisconception("inference", "Nothing suggests a game."), "NOT_SUPPORTED");
    assert.equal(classifyMisconception("plural-nouns", "An apostrophe does not form a plural."), "APOSTROPHE", "cross-skill cue");
    assert.equal(classifyMisconception("idioms-adages", "A piece of cake means the opposite."), "LITERAL_MEANING");
    assert.equal(classifyMisconception("unknown-family", null), null);
    assert.ok(MISCONCEPTIONS.every((m) => m.label && m.fix), "every misconception has a label and a teaching move");
    const opts = [{ label: "A", correct: true, misconception: null }, { label: "B", correct: false, misconception: "DETAIL_NOT_MAIN" }];
    assert.equal(chosenMisconception("MULTIPLE_CHOICE", opts, "B"), "DETAIL_NOT_MAIN");
    assert.equal(chosenMisconception("MULTIPLE_CHOICE", opts, "A"), null);
    assert.equal(chosenMisconception("MULTI_SELECT", opts, ["A", "B"]), "DETAIL_NOT_MAIN");
  });

  test("a question met again within 10 answers or 2 days counts half; after a longer gap it counts in full", () => {
    const at = (d: number) => new Date(Date.UTC(2026, 9, 1) + d * DAY).toISOString();
    const h = markRepeats([{ itemId: "q1", at: at(0) }, { itemId: "q2", at: at(0) }, { itemId: "q1", at: at(1) }, { itemId: "q1", at: at(9) }]);
    assert.deepEqual(h.map((x) => Boolean((x as { repeat?: boolean }).repeat)), [false, false, true, true], "within 10 answers");
    const spaced = Array.from({ length: 12 }, (_, i) => ({ itemId: `x${i}`, at: at(i * 0.1) }));
    assert.equal(isRecentRepeat([{ itemId: "q1", at: at(0) }, ...spaced], "q1", at(5)), false, "12 answers and 5 days later: retention, counts in full");
    assert.equal(isRecentRepeat([{ itemId: "q1", at: at(0) }], "q1", at(1)), true);
    const ev = { itemId: "q", correct: true, level: 4, a: 1, b: 0, c: 0, responseMs: 30_000, estimatedSeconds: 45, usedHint: false, at: at(0) };
    assert.equal(evidenceWeight({ ...ev, repeat: true }, DEFAULT_ADAPTIVE), 0.5);
    assert.equal(evidenceWeight({ ...ev, usedHint: true }, DEFAULT_ADAPTIVE), 0.5);
    assert.equal(evidenceWeight(ev, DEFAULT_ADAPTIVE), 1);
  });

  test("spaced review: 2 weeks after mastery, then 6, then 12; a wrong review keeps it due; losing mastery clears it", () => {
    const now = new Date(Date.UTC(2026, 9, 1));
    const first = nextReview(null, true, true, now);
    assert.equal((first.nextReviewAt!.getTime() - now.getTime()) / DAY, REVIEW_DAYS[0]);
    const later = new Date(first.nextReviewAt!.getTime() + DAY);
    const ok = nextReview({ isMastered: true, ...first }, true, true, later);
    assert.deepEqual([ok.reviewStep, (ok.nextReviewAt!.getTime() - later.getTime()) / DAY], [1, 42]);
    assert.equal(nextReview({ isMastered: true, ...first }, true, false, later).nextReviewAt!.getTime(), first.nextReviewAt!.getTime(), "still due");
    assert.deepEqual(nextReview({ isMastered: true, ...first }, false, false, later), { nextReviewAt: null, reviewStep: 0 });
  });

  test("recommendations use the real ability and review dates", () => {
    const base: SkillSnapshot = { skillId: "a", name: "A", sequence: 0, unitNumber: 1, mastery: 50, attempts: 8, recentErrors: 0, daysSincePractice: 1, theta: -1.4, assignedDueInDays: null, prerequisiteGap: false, mapGoalAreaWeak: false };
    const r = recommendSkills([base, { ...base, skillId: "b", name: "B", mastery: 95, reviewDue: true, theta: 1.8 }], 1);
    assert.ok(r.find((x) => x.skillId === "a")!.reasons.some((x) => x.code === "LOW_ABILITY"));
    assert.ok(r.find((x) => x.skillId === "b")!.reasons.some((x) => x.code === "REVIEW_DUE"));
    assert.equal(r.find((x) => x.skillId === "b")!.targetLevel, 6, "target level from the real θ");
  });

  test("decay factor follows the engine rule", () => {
    const t = resolveEngineConfig().mastery;
    assert.equal(decayFactorFor(20, t), 1);
    assert.ok(decayFactorFor(60, t) < 1 && decayFactorFor(60, t) >= t.decayFloor);
    assert.equal(decayFactorFor(1000, t), t.decayFloor);
  });

  test("Spring prediction: the student's own evidence (Fall, Weekly Checks, practice) → the chance of the goal", () => {
    const now = 10 * 7 * DAY; // 10 weeks after the Fall test
    const m = { fall: { rit: 200, term: "Fall 2026", season: "FALL", date: 0, percentile: 50, growth: 8 }, latest: { rit: 200, term: "Fall 2026", season: "FALL", date: 0, percentile: 50 }, springTarget: 208, springActual: null, gap: 8, goals: [], lexile: null, band: "ON", status: "ON_TRACK", statusWhy: "" } as unknown as MapSummary;
    const p = predictNext(m, 4, null, 5, { now })!;
    assert.deepEqual([p.term, p.rit, p.goal], ["Spring", 208, 208]);
    assert.ok(p.chance! >= 45 && p.chance! <= 55, "Fall only, average practice: about 50%");
    const strong = predictNext(m, 4, 212, 5, { now, weeklyAt: now })!;
    assert.ok(strong.rit > p.rit && strong.chance! > p.chance!, "a higher Weekly Check estimate raises the prediction");
    const quiet = predictNext(m, 4, null, 0, { now })!;
    assert.ok(quiet.rit < p.rit && quiet.chance! < p.chance!, "no practice in 14 days lowers it");
    assert.equal(predictNext({ ...m, latest: { ...m.latest!, season: "SPRING" } } as MapSummary, 4, null, 5), null, "after Spring: next school year");
  });
});

describe("🧠 Update 32: the learning engine on the test school", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let student: Actor; let classId: string; let ids: string[]; let skillId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1"); other = await as("test.teacher.3"); student = await as("test.student.001");
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    assert.ok(ids.includes(student.studentId!));
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    for (const k of skills) { const items = await loadSkillItems(repo, String(k.id)); if (items.filter((i) => i.type === "MULTIPLE_CHOICE").length >= 3) { skillId = String(k.id); break; } }
    assert.ok(skillId, "a skill with multiple-choice questions");
  });

  test("the bank's wrong options are tagged, and a wrong answer records the chosen misconception", async () => {
    const n = await tagOptions(repo);
    assert.ok(n > 0);
    assert.equal(await tagOptions(repo), 0, "idempotent");
    const wrong = await repo.count("QuestionOption", { isCorrect: false });
    const tagged = await repo.count("QuestionOption", { isCorrect: false, misconception: { not: null } });
    assert.ok(tagged / wrong > 0.95, `${tagged}/${wrong} wrong options tagged`);
    // answer wrong on purpose until a multiple-choice question comes
    let v = await startPractice(repo, student, skillId);
    const items = new Map((await loadSkillItems(repo, skillId)).map((i) => [i.questionId, i]));
    let recorded = false;
    for (let i = 0; i < 12 && v.question; i++) {
      const it = items.get(v.question.questionId)!;
      const response = it.options ? (it.type === "MULTI_SELECT" ? [it.options.find((o) => !o.correct)!.label] : it.options.find((o) => !o.correct)!.label) : it.type === "TRUE_FALSE" ? !it.answer : it.type === "ERROR_CORRECTION" ? (it.errorIndex! + 1) % it.segments!.length : it.type === "FILL_BLANK" ? "zzz" : it.sequence ? [...it.sequence].reverse() : Object.fromEntries(it.pairs!.map((p, k, a) => [p.left, a[(k + 1) % a.length].right]));
      const res = await submitAnswer(repo, student, { sessionId: v.sessionId, questionId: it.questionId, response });
      v = res.view;
      if (it.type === "MULTIPLE_CHOICE") {
        const last = (await repo.findMany("QuestionAttempt", { studentId: student.studentId!, questionId: it.questionId }, { orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }], take: 1 }))[0];
        assert.equal(last.isCorrect, false);
        assert.ok(last.misconception, "misconception copied to the attempt");
        recorded = true;
      }
    }
    assert.ok(recorded);
  });

  test("💡 a hint is recorded by the server and the answer counts as hinted; only for the question on screen", async () => {
    // a fresh session with a question on screen (earlier tests may have ended theirs)
    let v = await startPractice(repo, student, skillId);
    for (let k = 1; k <= 3 && !v.question; k++) v = await startPractice(repo, student, skillId, new Date(Date.now() + k * 3 * 3_600_000));
    const q = v.question!;
    await assert.rejects(practiceHint(repo, student, v.sessionId, "not-this-one"), /no longer open/);
    const h = await practiceHint(repo, student, v.sessionId, q.questionId);
    assert.ok(h.hint.length > 3);
    const it = (await loadSkillItems(repo, skillId)).find((i) => i.questionId === q.questionId)!;
    const right = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.find((o) => o.correct)!.label) : it.type === "TRUE_FALSE" ? it.answer : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p) => [p.left, p.right])) : it.answers?.[0] ?? it.sequence ?? it.errorIndex;
    await submitAnswer(repo, student, { sessionId: v.sessionId, questionId: q.questionId, response: right });
    // the newest answer to it (a small pool may have shown this question earlier in the same session)
    const att = (await repo.findMany("QuestionAttempt", { sessionId: v.sessionId, questionId: q.questionId }, { orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }] }))[0];
    assert.equal(att.usedHint, true, "the browser cannot hide hint use");
    assert.equal((await repo.findUnique("PracticeSession", { id: v.sessionId }))!.hintQuestionId, null, "cleared for the next question");
  });

  test("the recommendation engine sees the student's real ability and recent errors", async () => {
    const ev = (await skillEvidence(repo, student.studentId!, [skillId])).get(skillId)!;
    assert.notEqual(ev.theta, 0, "θ from StudentAbility, not a constant 0");
    assert.ok(ev.recentErrors >= 3, "the wrong answers above");
    assert.ok(ev.misconception, "the misconception behind them");
  });

  test("▶ My Next Step chooses one action and saves the recommendation; a week later it is checked", async () => {
    const step = await nextStep(repo, student);
    assert.ok(["DIAGNOSTIC", "WEEKLY_CHECK", "PLAN", "REVIEW", "PRACTICE", "DONE"].includes(step.kind));
    assert.ok(step.title);
    // a recommendation made 8 days ago, followed by practice: checked and given an outcome
    const old = new Date(Date.now() - 8 * DAY);
    await logRecommendations(repo, student.studentId!, [{ skillId, name: "x", score: 1, targetLevel: 4, reasons: [] }], "TEST", new Map([[skillId, 0]]), old);
    const r = await evaluateRecommendations(repo);
    assert.ok(r.evaluated >= 1 && r.followed >= 1);
    const row = (await repo.findMany("Recommendation", { studentId: student.studentId!, source: "TEST" }))[0];
    assert.ok(row.evaluatedAt && row.followedAt && ["IMPROVED", "SAME", "DROPPED"].includes(String(row.outcome)));
    const stats = await recommendationStats(repo, [student.studentId!]);
    assert.ok(stats.evaluated >= 1 && stats.followedPct !== null);
  });

  test("🔍 the class's common misconceptions name the students who have them", async () => {
    // a student who keeps choosing the option with one misconception, when other wrong options carry other ones
    const q = (await repo.findMany("Question", { skillId }))[0];
    const wrong = await repo.findMany("QuestionOption", { questionId: q.id, isCorrect: false });
    for (const [k, o] of wrong.entries()) await repo.updateMany("QuestionOption", { id: o.id }, { misconception: ["DETAIL_NOT_MAIN", "NOT_SUPPORTED", "CONTEXT_IGNORED"][k % 3] });
    const ses = await repo.create("PracticeSession", { studentId: ids[2], mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    for (let i = 0; i < 5; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[2], questionId: q.id, skillId, response: {}, isCorrect: false, misconception: "DETAIL_NOT_MAIN", responseMs: 30_000, difficultyB: 0, createdAt: new Date() });
    const g = await groupMisconceptions(repo, ids, 30);
    const d = g.find((x) => x.code === "DETAIL_NOT_MAIN")!;
    assert.ok(d && d.students.some((x) => x.id === ids[2]), "the student who keeps making it");
    assert.ok(d.fix.length > 10);
  });

  test("retention decay: an idle skill fades, a lost mastery leaves the review list; running twice changes nothing more", async () => {
    const sid = ids[3];
    const longAgo = new Date(Date.now() - 120 * DAY);
    await repo.upsert("StudentSkillMastery", { studentId: sid, skillId }, { score: 92, band: "MASTERED", attempts: 20, correct: 18, isMastered: true, masteredAt: longAgo, lastPracticedAt: longAgo, components: { decayFactor: 1 }, nextReviewAt: longAgo, reviewStep: 0 });
    assert.equal(await decaySweep(repo, [sid]), 1);
    const m = (await repo.findUnique("StudentSkillMastery", { studentId: sid, skillId }))!;
    assert.ok(Number(m.score) < 90 && m.isMastered === false && m.nextReviewAt === null, JSON.stringify(m));
    assert.equal(await decaySweep(repo, [sid]), 0, "the earned score is kept: no compounding");
  });

  test("🎯 an intervention measures before → after and tells the teacher at the end", async () => {
    await assert.rejects(startIntervention(repo, other, { classId, skillId, studentIds: ids.slice(0, 2) }), ForbiddenError);
    await assert.rejects(startIntervention(repo, teacher, { classId, skillId, studentIds: ["someone-else"] }), /at least one student/);
    const t0 = new Date(Date.now() - 20 * DAY);
    const id = await startIntervention(repo, teacher, { classId, skillId, studentIds: ids.slice(4, 6), days: 14 }, t0);
    await repo.upsert("StudentSkillMastery", { studentId: ids[4], skillId }, { score: 70, band: "APPROACHING", attempts: 10, correct: 8 }, { score: 70 });
    const live = (await classInterventions(repo, teacher, classId)).find((x) => x.id === id)!;
    assert.equal(live.students.find((x) => x.id === ids[4])!.change, 70);
    assert.ok((await evaluateInterventions(repo)) >= 1);
    const done = (await classInterventions(repo, teacher, classId)).find((x) => x.id === id)!;
    assert.deepEqual([done.status, done.improved, done.total], ["DONE", 1, 2]);
    const n = (await repo.findMany("Notification", { userId: teacher.userId, type: "INTERVENTION_ALERT" }))[0];
    assert.match(String(n.title), /Intervention result/);
  });

  test("prerequisites between skills of a grade are added once", async () => {
    const n = await ensurePrerequisites(repo);
    assert.ok(n > 0);
    assert.equal(await ensurePrerequisites(repo), 0);
  });

  test("🧠 profiles: one level with its source, MAP, prediction, misconceptions", async () => {
    const d = new Date(Date.now() - 30 * DAY);
    await repo.create("MapResult", { studentId: ids[0], testDate: d, subject: "Reading", goalName: null, rit: 198, achievementPercentile: 45, projectedGrowth: 9, termName: "Fall 2026", importedAt: d });
    await repo.create("MapResult", { studentId: ids[0], testDate: d, subject: "Reading", goalName: "Informational Text", rit: 190, termName: "Fall 2026", importedAt: d });
    const n = await buildProfiles(repo, String(admin.schoolId));
    assert.ok(n >= ids.length);
    const p = (await profilesOf(repo, [ids[0], student.studentId!]));
    const a = p.get(ids[0])!;
    assert.deepEqual([a.readingRit, a.predictedTerm, a.weakestArea], [198, "Spring", "INFO"]);
    assert.ok(a.predictedReading! > 198 && a.goalChance !== null && a.goalReading === 207);
    // (Update 33: a profile misconception must be chosen clearly more often than chance — tested in update33-graph-path)
    assert.ok(Array.isArray(p.get(student.studentId!)!.misconceptions));
  });

  test("the level comes from the ability reached (θ), not raw accuracy", async () => {
    const sid = ids[7];
    await repo.upsert("StudentAbility", { studentId: sid, scope: `SKILL:${skillId}` }, { skillId, theta: 1.4, thetaSE: 0.3, responses: 30 }, { theta: 1.4 });
    const ses = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    const q = (await loadSkillItems(repo, skillId))[0];
    for (let i = 0; i < 12; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q.questionId, skillId, response: {}, isCorrect: i % 4 !== 0, responseMs: 30_000, difficultyB: 1.5, createdAt: new Date() });
    const st = (await repo.findUnique("Student", { id: sid }))!;
    const g = Number((await repo.findUnique("Grade", { id: st.gradeId }))!.level);
    const e = (await evidenceLevels(repo, String(admin.schoolId), [sid], g)).get(sid)!;
    assert.deepEqual([e.from, e.level], ["PLATFORM", "ABOVE"], "75% correct at hard items = Above Level");
    // Update 39B: one ability from the answers themselves (pooled, guessing floor, recency-weighted), not the stored skill θ
    assert.match(e.reason, /Ability \+1\.\d ± \d\.\d on 12 answers/);
  });

  test("🌙 the daily job runs every step, once per school per day", async () => {
    const r = await runDaily(repo, String(admin.schoolId));
    assert.ok(r.profiles > 0 && r.digests > 0, JSON.stringify(r));
    const digest = (await repo.findMany("Notification", { userId: teacher.userId, type: "DAILY_DIGEST" }))[0];
    assert.match(String(digest.body), /student|attention|risk/i);
    const day = new Date(Date.now() + 5 * DAY);
    assert.equal(await maybeRunDaily(repo, String(admin.schoolId), day), true);
    assert.equal(await maybeRunDaily(repo, String(admin.schoolId), day), false, "claimed for the day");
    assert.ok(await repo.findUnique("SchoolSetting", { schoolId: admin.schoolId, key: `daily.run.${riyadhDay(day)}` }));
    await new Promise((ok) => setTimeout(ok, 50));
  });
});
