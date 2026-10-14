/**
 * ⭐ Skill stars (owner r67): ONE status per student per skill, the same everywhere — in-memory demo school only
 * (never a real database or real students).
 *   identity across places · one status everywhere · any practice source updates it · the 30 rule + cap 99 · tests
 *   never change it · level up (hard / stable lists) · needs support at 50 → alert + RTI plan · review check pass /
 *   fail / guessing · monthly mixed review · migration counts (idempotent)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import {
  applyLevelUp, clearSkillKeys, decideStatus, displayScore, familyOfName, familyOfStandards, getsHarderWithLevel, LEVEL_HARD_FAMILIES, LEVEL_STABLE_FAMILIES,
  refreshSkillStatus, skillKeyIndex, skillKeyOfRow, skillStatusesFor, statusCounts, statusesOfSkills, syncLevelUps, STAR_MIN_ANSWERS, isTaxonomyFamily,
} from "../src/server/skills/status";
import { ensureReviewChecks, evaluateMixed, evaluateReview, settleReviewChecks, monthOf } from "../src/server/skills/status-review";
import { migrateSchool, migrationReport, countsLine, needsSupportPairs } from "../src/server/skills/status-extras";
import { proposePlan } from "../src/server/plans/wizard";
import { myWorkItems } from "../src/server/plans/wizard";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

describe("⭐ skill status — one status per skill, everywhere", () => {
  let repo: SqliteRepo; let schoolId = ""; let teacher: Actor; let student: Actor; let sid = ""; let classId = "";
  let g4: Map<string, string>; let g5: Map<string, string>;
  let clock = Date.parse("2026-09-01T08:00:00Z");
  const at = () => new Date((clock += 60_000));

  /** n synthetic answers in one session (real questions of the skill): mode, an assignment, rapid guesses, source. */
  async function answers(skillId: string, n: number, o: { correct?: boolean; mode?: string; assignmentId?: string | null; rapid?: boolean; source?: string | null; end?: boolean } = {}): Promise<string> {
    const qs = await repo.findMany("Question", { skillId, status: "PUBLISHED" }, { select: ["id"], take: 50 });
    const q = qs.length ? qs : await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["id"], take: 50 });
    const ses = await repo.create("PracticeSession", { studentId: sid, skillId, mode: o.mode ?? "ADAPTIVE_PRACTICE", assignmentId: o.assignmentId ?? null, startedAt: at(), questionCount: n, correctCount: 0, activeMs: 0, ...(o.end ? { endedAt: at(), endReason: "COMPLETED" } : {}) });
    for (let i = 0; i < n; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q[i % q.length].id, skillId, response: { value: "x" }, isCorrect: o.correct ?? true, responseMs: o.rapid ? 900 : 9000, rapidGuess: Boolean(o.rapid), difficultyB: 0, createdAt: at(), source: o.source ?? null });
    return s(ses.id);
  }
  async function mastery(skillId: string, mastered: boolean, score = mastered ? 100 : 55) {
    const data = { score, band: mastered ? "MASTERED" : "DEVELOPING", isMastered: mastered, attempts: 30, correct: 25, lastPracticedAt: new Date(clock) };
    await repo.upsert("StudentSkillMastery", { studentId: sid, skillId }, { studentId: sid, skillId, ...data }, data);
  }
  const statusOf = async (skillId: string) => (await statusesOfSkills(repo, schoolId, [sid], [skillId])).get(sid)!.get(skillId)!;

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    const m = (await repo.findMany("ClassMembership", { classId }))[0];
    sid = s(m.studentId);
    const st = await repo.findUnique("Student", { id: sid });
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st!.userId }))!);
    const byGrade = async (level: number) => {
      const g = (await repo.findMany("Grade", { schoolId, level }))[0];
      const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
      return new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).replace(/^G\d\./, ""), s(k.id)]));
    };
    g4 = await byGrade(4); g5 = await byGrade(5);
  });

  test("🧩 skill identity: Grade 4/5 copies, a Curriculum Map lesson skill, a MAP plan name and a standards-only skill are one key", async () => {
    // the Curriculum Map lesson "The Talent Show" teaches "Character" — a teacher-made skill in a generic family
    const g4grade = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4grade.id }))[0];
    const fam = await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" });
    const cmSkill = await repo.create("Skill", { curriculumId: cur.id, familyId: fam.id, code: "G4.cm-character", name: "Character", domain: "READING", category: "COMPREHENSION" });
    const mech = await repo.create("Skill", { curriculumId: cur.id, familyId: fam.id, code: "G4.mech-a", name: "Mechanics Check A", domain: "LANGUAGE", category: "MECHANICS" });
    const std = await repo.upsert("Standard", { framework: "CCSS_ELA", code: "CCSS.ELA-LITERACY.L.4.2.a" }, { framework: "CCSS_ELA", code: "CCSS.ELA-LITERACY.L.4.2.a" });
    await repo.upsert("SkillStandard", { skillId: mech.id, standardId: std.id }, { skillId: mech.id, standardId: std.id, isPrimary: true });
    const unit = (await repo.findMany("Unit", { curriculumId: cur.id }))[0];
    const lesson = (await repo.findMany("Lesson", { unitId: unit.id }))[0];
    await repo.create("LessonSkill", { lessonId: lesson.id, skillId: cmSkill.id, role: "COMPREHENSION_SKILL", label: "Character" });
    clearSkillKeys(repo);
    const ix = await skillKeyIndex(repo, schoolId);
    const key = ix.keyOf.get(g4.get("character")!);
    assert.equal(key, "fam:character");
    assert.equal(ix.keyOf.get(g5.get("character")!), key, "the Grade 5 copy is the same skill");
    assert.equal(ix.keyOf.get(s(cmSkill.id)), key, "the Curriculum Map lesson's “Character” is the same skill");
    assert.equal(familyOfName("Character Traits"), "character", "the MAP plan's “Character Traits” is the same skill");
    assert.equal(familyOfName("Main Idea and Key Details"), "central-idea");
    assert.equal(familyOfName("Find the theme"), "theme");
    assert.equal(ix.keyOf.get(s(mech.id)), "fam:capitalization", "standards only (L.4.2.a) → Capitalization");
    assert.equal(familyOfStandards(["RL.4.2"], "Story message"), null, "two families share RL.x.2 and the name matches neither: never guessed");
    assert.match(skillKeyOfRow({ id: "x1", name: "Concept Vocabulary: Unit 1", code: "G4.cv.u1", domain: "VOCABULARY" }), /^solo:/, "grade-bound vocabulary stays alone");
    assert.match(skillKeyOfRow({ id: "x2", name: "Totally New Skill", code: "G4.new", domain: "READING" }), /^name:reading:/);
    assert.ok(ix.skillsOf.get("fam:character")!.length >= 3);
  });

  test("👀 one status everywhere: every copy shows the same status; any practice source updates it", async () => {
    // real practice through the practice service (the hook runs after each answer)
    const u = s((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!.username);
    await simulatePractice(repo, [u], [{ date: "2026-09-02", skill: "G4.character" }], 4);
    const a = await statusOf(g4.get("character")!), b = await statusOf(g5.get("character")!);
    assert.equal(a.status, "IN_PROGRESS");
    assert.deepEqual(a, b, "Grade 4 and Grade 5 copies: one status");
    assert.ok(a.answered >= 4);
    // a Curriculum Map question set (TEACHER_QUIZ) counts; a test, a Learn lesson / check, rapid guesses never do
    const before = a.answered;
    await answers(g5.get("character")!, 3, { mode: "TEACHER_QUIZ" });
    await refreshSkillStatus(repo, sid, g5.get("character")!, at());
    assert.equal((await statusOf(g4.get("character")!)).answered, before + 3, "a question set on another grade's copy counts");
    const test = await repo.create("Assignment", { classId, createdById: s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id), title: "Unit test", target: "ASSESSMENT", testId: "t1", curriculumPlanId: "TEST", createdAt: at() });
    await answers(g4.get("character")!, 5, { mode: "TEACHER_QUIZ", assignmentId: s(test.id) });
    await answers(g4.get("character")!, 5, { source: "LESSON" });
    await answers(g4.get("character")!, 5, { rapid: true });
    await answers(g4.get("character")!, 5, { mode: "DIAGNOSTIC" });
    await refreshSkillStatus(repo, sid, g4.get("character")!, at());
    assert.equal((await statusOf(g4.get("character")!)).answered, before + 3, "tests, lessons, guesses and the Diagnostic never count");
    const all = (await skillStatusesFor(repo, [sid])).get(sid)!;
    assert.equal([...all.keys()].filter((k) => k === "fam:character").length, 1, "one row per skill (current level)");
  });

  test("🎯 the 30 rule: ⭐ only with 30+ counted answers AND the engine's mastery; the score is capped at 99 before 30; tests never change it", async () => {
    assert.equal(displayScore(100, 29), 99);
    assert.equal(displayScore(100, 30), 100);
    assert.equal(decideStatus(null, 29, true).status, "IN_PROGRESS");
    assert.equal(decideStatus(null, 30, false).status, "IN_PROGRESS");
    assert.deepEqual(decideStatus("IN_PROGRESS", 30, true), { status: "MASTERED", justMastered: true, justNeedsSupport: false });
    assert.equal(decideStatus("MASTERED", 30, false).status, "MASTERED", "a star is not lost by practice");
    const theme = g4.get("theme")!;
    await answers(theme, 29);
    await mastery(theme, true);
    let r = await refreshSkillStatus(repo, sid, theme, at());
    assert.equal(r!.status, "IN_PROGRESS");
    assert.equal((await statusOf(theme)).score, 99, "100 % shown as 99 before the 30th answer");
    const coinsBefore = await repo.count("CoinLedger", { studentId: sid });
    await answers(theme, 1);
    r = await refreshSkillStatus(repo, sid, theme, at());
    assert.equal(r!.status, "MASTERED"); assert.equal(r!.justMastered, true);
    const v = await statusOf(theme);
    assert.equal(v.score, 100); assert.ok(v.masteredAt && v.reviewDueAt);
    assert.equal(Date.parse(v.reviewDueAt!) - Date.parse(v.masteredAt!), 21 * DAY, "the review check 3 weeks later");
    assert.equal(await repo.count("CoinLedger", { studentId: sid }), coinsBefore + 1, "coins once (existing coins)");
    await refreshSkillStatus(repo, sid, theme, at());
    assert.equal(await repo.count("CoinLedger", { studentId: sid }), coinsBefore + 1, "never twice");
    // a test after ⭐: wrong answers and a lower engine score never change the star
    const test = await repo.create("Assignment", { classId, createdById: s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id), title: "Quiz", target: "ASSESSMENT", testId: "t2", createdAt: at() });
    await answers(theme, 10, { mode: "TEACHER_QUIZ", assignmentId: s(test.id), correct: false });
    await mastery(theme, false, 40);
    await refreshSkillStatus(repo, sid, theme, at());
    assert.equal((await statusOf(theme)).status, "MASTERED");
    assert.equal((await statusOf(theme)).answered, 30);
  });

  test("⬆ level up: harder skills become ☆⬆ at the new level, stable ones stay ⭐, history kept", async () => {
    assert.ok(LEVEL_HARD_FAMILIES.includes("inference") && LEVEL_HARD_FAMILIES.includes("context-clues") && LEVEL_HARD_FAMILIES.includes("theme"));
    assert.ok(LEVEL_STABLE_FAMILIES.includes("capitalization") && LEVEL_STABLE_FAMILIES.includes("spelling") && LEVEL_STABLE_FAMILIES.includes("commas"));
    for (const c of [...LEVEL_HARD_FAMILIES, ...LEVEL_STABLE_FAMILIES]) assert.ok(isTaxonomyFamily(c), `${c} is a taxonomy family`);
    assert.equal(LEVEL_HARD_FAMILIES.filter((c) => LEVEL_STABLE_FAMILIES.includes(c)).length, 0);
    assert.equal(getsHarderWithLevel("fam:theme"), true); assert.equal(getsHarderWithLevel("fam:capitalization"), false);
    const cap = g4.get("capitalization")!;
    await answers(cap, 30); await mastery(cap, true);
    await refreshSkillStatus(repo, sid, cap, at());
    assert.equal((await statusOf(cap)).status, "MASTERED");
    // a MAP result moved the student up (the level change the platform records)
    await repo.create("AuditLog", { action: "level.change", entityType: "Student", entityId: sid, before: { level: "ON" }, after: { level: "ABOVE", outcome: "CHANGED", category: "OVERALL" }, createdAt: at() });
    assert.equal(await syncLevelUps(repo, sid, at()), 1, "one harder ⭐ skill (Theme) → ☆⬆");
    assert.equal(await syncLevelUps(repo, sid, at()), 0, "applied once");
    const theme = await statusOf(g4.get("theme")!);
    assert.equal(theme.status, "NEXT_LEVEL"); assert.equal(theme.level, 2);
    assert.equal((await statusOf(cap)).status, "MASTERED", "Capitalization stays ⭐");
    const rows = await repo.findMany("SkillStatus", { studentId: sid, skillKey: "fam:theme" });
    assert.equal(rows.length, 2, "the level-1 ⭐ row is kept as history");
    // the new level counts its own answers: ⭐ again only with 30 new ones
    await answers(g4.get("theme")!, 10); await mastery(g4.get("theme")!, true);
    await refreshSkillStatus(repo, sid, g4.get("theme")!, at());
    assert.equal((await statusOf(g4.get("theme")!)).status, "IN_PROGRESS");
    await answers(g4.get("theme")!, 20);
    await refreshSkillStatus(repo, sid, g4.get("theme")!, at());
    const again = await statusOf(g4.get("theme")!);
    assert.equal(again.status, "MASTERED"); assert.equal(again.level, 2, "⭐² (mastered at the higher level)");
    assert.equal(await applyLevelUp(repo, sid, "audit-x", at()) >= 0, true);
  });

  test("🛟 50 questions without mastery: Needs support for the teacher (◐ for the student), one alert, RTI plan", async () => {
    const inf = g4.get("inference")!;
    await answers(inf, 50, { correct: false }); await mastery(inf, false, 30);
    const r = await refreshSkillStatus(repo, sid, inf, at());
    assert.equal(r!.status, "IN_PROGRESS"); assert.equal(r!.justNeedsSupport, true);
    const v = await statusOf(inf);
    assert.equal(v.status, "IN_PROGRESS"); assert.equal(v.needsSupport, true);
    assert.equal(await repo.count("InterventionAlert", { studentId: sid, ruleCode: "NEEDS_SUPPORT" }), 1);
    await refreshSkillStatus(repo, sid, inf, at());
    assert.equal(await repo.count("InterventionAlert", { studentId: sid, ruleCode: "NEEDS_SUPPORT" }), 1, "one alert");
    assert.ok(await repo.count("Notification", { type: "INTERVENTION_ALERT" }) >= 1);
    assert.deepEqual((await needsSupportPairs(repo, [sid])).map((p) => p.key), ["fam:inference"]);
    const p = await proposePlan(repo, teacher, { classId, type: "RTI", studentIds: [sid] });
    const k = p.skills.find((x) => x.studentIds.includes(sid) && x.reason.startsWith("Needs support"));
    assert.ok(k, "the RTI plan suggests the student + skill (existing RTI flow)");
    assert.equal(k!.id, inf);
    assert.ok(!p.notes.some((n) => n.startsWith("Not in RTI")), "not left out");
  });

  test("🔄 review check: 3 weeks after ⭐, 5 questions in My Work; pass keeps ⭐, guessing is offered again, fail → 🔄", async () => {
    assert.equal(evaluateReview([1, 1, 1, 1, 0].map((c) => ({ correct: Boolean(c), rapidGuess: false }))).outcome, "PASS");
    assert.equal(evaluateReview([1, 1, 1, 0, 0].map((c) => ({ correct: Boolean(c), rapidGuess: false }))).outcome, "FAIL");
    assert.equal(evaluateReview([1, 1, 1, 1, 1].map((c, i) => ({ correct: Boolean(c), rapidGuess: i < 2 }))).outcome, "GUESSING");
    const cap = g4.get("capitalization")!;
    const due = new Date(Date.parse((await statusOf(cap)).reviewDueAt!) + 60_000);
    clock = due.getTime();
    assert.ok((await ensureReviewChecks(repo, sid, at())) >= 1);
    const checks = await repo.findMany("SkillReviewCheck", { studentId: sid, kind: "REVIEW" });
    const capCheck = checks.find((c) => (c.skillKeys as string[]).includes("fam:capitalization"))!;
    assert.ok(capCheck.assignmentId);
    assert.equal(await repo.count("AssessmentQuestion", { assessmentId: (await repo.findUnique("Assignment", { id: capCheck.assignmentId }))!.assessmentId }), 5);
    assert.equal(await ensureReviewChecks(repo, sid, at()), 0, "not twice");
    const work = await myWorkItems(repo, student, at());
    assert.ok(work.some((w) => w.assignmentId === capCheck.assignmentId && /Review check/.test(w.skill)), "in My Work automatically");
    const answeredBefore = (await statusOf(cap)).answered;
    // guessing: does not count, offered again
    await answers(cap, 5, { mode: "TEACHER_QUIZ", assignmentId: s(capCheck.assignmentId), rapid: true, end: true });
    let out = await settleReviewChecks(repo, sid, at());
    assert.equal(out.find((x) => x.checkId === s(capCheck.id))!.outcome, "GUESSING");
    assert.equal((await statusOf(cap)).status, "MASTERED");
    assert.ok((await ensureReviewChecks(repo, sid, at())) >= 1, "offered again");
    const again = (await repo.findMany("SkillReviewCheck", { studentId: sid, kind: "REVIEW", settledAt: null })).find((c) => (c.skillKeys as string[]).includes("fam:capitalization"))!;
    // pass (4 of 5): stays ⭐, the next review about 8 weeks later; review answers are not in the 30 rule
    await answers(cap, 4, { mode: "TEACHER_QUIZ", assignmentId: s(again.assignmentId) });
    await answers(cap, 1, { mode: "TEACHER_QUIZ", assignmentId: s(again.assignmentId), correct: false, end: true });
    await repo.updateMany("PracticeSession", { assignmentId: s(again.assignmentId) }, { endedAt: at() });
    out = await settleReviewChecks(repo, sid, at());
    assert.equal(out.find((x) => x.checkId === s(again.id))!.outcome, "PASS");
    const kept = await statusOf(cap);
    assert.equal(kept.status, "MASTERED");
    assert.ok(Date.parse(kept.reviewDueAt!) - clock > 50 * DAY);
    await refreshSkillStatus(repo, sid, cap, at());
    assert.equal((await statusOf(cap)).answered, answeredBefore, "review answers never count in the 30 rule");
    // fail: 🔄, back in the plan; mastering it again (10 new answers + mastery) → ⭐
    clock = Date.parse(kept.reviewDueAt!) + 60_000;
    await ensureReviewChecks(repo, sid, at());
    const third = (await repo.findMany("SkillReviewCheck", { studentId: sid, kind: "REVIEW", settledAt: null })).find((c) => (c.skillKeys as string[]).includes("fam:capitalization"))!;
    await answers(cap, 5, { mode: "TEACHER_QUIZ", assignmentId: s(third.assignmentId), correct: false, end: true });
    await settleReviewChecks(repo, sid, at());
    assert.equal((await statusOf(cap)).status, "NEEDS_REVIEW");
    await answers(cap, 10); await mastery(cap, true);
    await refreshSkillStatus(repo, sid, cap, at());
    assert.equal((await statusOf(cap)).status, "MASTERED", "mastered again → ⭐");
  });

  test("🗓️ monthly mixed review: 10 questions from several ⭐ skills; a skill failing it twice → 🔄", async () => {
    assert.equal(evaluateMixed([{ correct: false, rapidGuess: false, key: "a" }, { correct: false, rapidGuess: false, key: "a" }, { correct: true, rapidGuess: false, key: "b" }]).failed.join(), "a");
    assert.equal(evaluateMixed(Array.from({ length: 10 }, (_, i) => ({ correct: true, rapidGuess: i < 4, key: "a" }))).outcome, "GUESSING");
    // a third ⭐ skill so the mix has several
    const cc = g4.get("context-clues")!;
    await answers(cc, 30); await mastery(cc, true); await refreshSkillStatus(repo, sid, cc, at());
    for (const month of ["2026-12-05", "2027-01-05"]) {
      clock = Date.parse(`${month}T08:00:00Z`);
      await ensureReviewChecks(repo, sid, at());
      const mixed = (await repo.findMany("SkillReviewCheck", { studentId: sid, kind: "MIXED", periodKey: monthOf(new Date(clock)) }))[0];
      assert.ok(mixed?.assignmentId, `a mixed check for ${month}`);
      assert.ok((mixed.skillKeys as string[]).length >= 2, "several ⭐ skills");
      const a = (await repo.findUnique("Assignment", { id: mixed.assignmentId }))!;
      const qs = await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId }, { select: ["questionId"] });
      assert.ok(qs.length <= 10 && qs.length >= 4);
      // Context Clues questions all wrong, the rest right
      const ses = await repo.create("PracticeSession", { studentId: sid, mode: "TEACHER_QUIZ", assignmentId: a.id, startedAt: at(), endedAt: at(), questionCount: qs.length, correctCount: 0, activeMs: 0 });
      for (const q of qs) { const qq = (await repo.findUnique("Question", { id: q.questionId }))!; const ix = await skillKeyIndex(repo, schoolId); await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q.questionId, skillId: qq.skillId, response: { value: "x" }, isCorrect: ix.keyOf.get(s(qq.skillId)) !== "fam:context-clues", responseMs: 9000, rapidGuess: false, difficultyB: 0, createdAt: at() }); }
      await settleReviewChecks(repo, sid, at());
      if (!(mixed.skillKeys as string[]).includes("fam:context-clues")) assert.fail("context clues should be in the mix (3 stars, up to 5 are mixed)");
    }
    assert.equal((await statusOf(cc)).status, "NEEDS_REVIEW", "failed twice in the mixed review → 🔄");
  });

  test("📦 migration: computed from existing practice, idempotent, counts per status kept for System check", async () => {
    // wipe the stored statuses: everything is computed again from the practice data
    const before = await statusCounts(repo, [sid]);
    const r1 = await migrateSchool(repo, schoolId, at());
    assert.ok(r1.students > 0 && r1.universe > 0);
    const r2 = await migrateSchool(repo, schoolId, at());
    assert.equal(r2.written, 0, "a second run writes nothing");
    assert.deepEqual(r2.counts, r1.counts, "same counts");
    assert.deepEqual((await migrationReport(repo, schoolId))!.counts, r2.counts);
    assert.match(countsLine(r2.counts), /^☆ \d+ · ◐ \d+ · ⭐ \d+ · ☆⬆ \d+ · 🔄 \d+$/);
    const after = await statusCounts(repo, [sid]);
    assert.deepEqual(after, before, "the migration agrees with the live statuses");
    // a fresh copy of the data with no statuses: ⭐ only when 30 + mastery were truly met
    await repo.deleteMany("SkillStatus", { studentId: sid });
    const r3 = await migrateSchool(repo, schoolId, at());
    assert.ok(r3.written > 0);
    const v = (await skillStatusesFor(repo, [sid])).get(sid)!;
    assert.equal(v.get("fam:character")?.status, "IN_PROGRESS", "under 30 answers: ◐");
    assert.equal(v.get("fam:inference")?.status, "IN_PROGRESS");
    assert.equal(v.get("fam:inference")?.needsSupport, true);
    assert.ok([...v.values()].filter((x) => x.status === "MASTERED").every((x) => x.answered >= STAR_MIN_ANSWERS), "⭐ only with 30+");
    console.log(`  migration counts on the test data: ${countsLine(r3.counts)} (students ${r3.students}, skills ${r3.universe})`);
  });
});
