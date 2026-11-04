/**
 * Round 3 · reports group: every Diagnostic page shows the SAME result for the same student / test —
 * one tier rule (bandFor), one cell rule (cellPct), invalid results (30%+ rapid guesses) never give a level / tier /
 * class mean, only this school year's results for the current grade, bands from the test, shared-first for families,
 * any class of the student for its teachers, the newest valid result per growth period, the right MAP RIT.
 */
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { latestDiagnostic, latestDiagnosticState } from "../src/server/assessment/diagnostic";
import { classDiagnosticReport, readingRitAt, studentDiagnosticReport } from "../src/server/diagnostic/report";
import { classGrowth } from "../src/server/diagnostic/growth";
import { bandFor, cellPct, testBands, tierBandText } from "../src/server/diagnostic/standards";
import { diagnosticAnalysisForClass, diagnosticAnalysisForStudent, INVALID_ACTION } from "../src/server/reports/school-reports";
import { word } from "../src/i18n/school-reports";
import { skillKeyIndex } from "../src/server/skills/status";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");

describe("round 3 · Diagnostic reports agree on every page", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher2: Actor; let schoolId = ""; let ids: string[] = []; let classA = ""; let classB = "";
  let T0 = "", T1 = "", T3 = "";
  const now = new Date();
  const std = (anchor: string, code: string, correct: number, total: number, score?: number) => ({ code, label: anchor, strand: anchor.startsWith("RL") ? "LIT" : "INFO", anchor, correct, total, ...(score !== undefined ? { score } : {}) });
  const score = (diagnosticId: string, studentId: string, o: Record<string, unknown>) => repo.create("DiagnosticScore", {
    diagnosticId, studentId, assignmentId: "x", correct: 10, total: 40, pct: 50, level: "BELOW", byStandard: [], byStrand: [], rapid: 0, minutes: 30, completedAt: now, ...o,
  });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    teacher2 = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const r = await teacherRoster(repo, teacher); classA = r[0].id; ids = r[0].students.map((x) => x.id);
    classB = (await teacherRoster(repo, teacher2))[0].id;
    schoolId = s(teacher.schoolId);
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: classA }))!.gradeId }))!.level);
    const mk = async (o: Record<string, unknown>) => s((await repo.create("DiagnosticTest", { schoolId, grade, year: "2026-2027", period: "BOY", title: "BOY", assessmentId: "none", status: "OPEN", bands: { above: 80, on: 55 }, createdAt: now, ...o }) as { id: string }).id);
    T0 = await mk({ title: "BOY first" });
    T1 = await mk({ title: "BOY second" });
    T3 = await mk({ grade: grade - 1, title: "last year's grade" });
    // s0: 32% Below → Intensive on every page
    await score(T1, ids[0], { correct: 13, total: 40, pct: 32, level: "BELOW", byStrand: [{ strand: "LIT", correct: 3, total: 10 }], byStandard: [std("RL.2", "RL.4.2", 2, 10)] });
    // s1: 90% Above
    await score(T1, ids[1], { correct: 36, total: 40, pct: 90, level: "ABOVE", byStrand: [{ strand: "LIT", correct: 9, total: 10 }] });
    // s2: an older valid result (T0, 60 On), then a newer one NOT valid (T1, 20 of 40 rapid)
    await score(T0, ids[2], { pct: 60, level: "ON", completedAt: new Date(now.getTime() - 5 * DAY), byStrand: [{ strand: "INFO", correct: 6, total: 10 }] });
    await score(T1, ids[2], { pct: 95, level: "ABOVE", rapid: 20, total: 40 });
    // s3: adaptive — the strand's score (70) wins over correct/total (1/10)
    await score(T1, ids[3], { pct: 70, level: "ON", theta: 4.2, byStrand: [{ strand: "INFO", correct: 1, total: 10, score: 70 }], byStandard: [std("RI.2", "RI.4.2", 1, 10, 70)] });
    // s4: only stale results (last year's grade; and an in-grade result from 400 days ago)
    await score(T3, ids[4], { pct: 90, level: "ABOVE" });
    await score(T0, ids[4], { pct: 90, level: "ABOVE", completedAt: new Date(now.getTime() - 400 * DAY) });
    // s5: older result shared, newer one not shared
    await score(T0, ids[5], { pct: 50, level: "BELOW", completedAt: new Date(now.getTime() - 3 * DAY), sharedAt: now });
    await score(T1, ids[5], { pct: 70, level: "ON" });
    // s0 is also in teacher 2's class
    await repo.create("ClassMembership", { classId: classB, studentId: ids[0] });
  });

  test("1 · one tier rule: a 32% Below student is Intensive on the Diagnostic report, its class view and the Diagnostic Analysis", async () => {
    assert.equal(bandFor(32, "BELOW").key, "INTENSIVE");
    const cls = await classDiagnosticReport(repo, teacher, T1, classA, now);
    assert.equal(cls.students.find((x) => x.id === ids[0])!.tier, "INTENSIVE");
    assert.equal((await diagnosticAnalysisForStudent(repo, teacher, ids[0])).tier, "INTENSIVE");
    const whole = await diagnosticAnalysisForClass(repo, teacher, classA);
    assert.ok(whole.tiers.find((g) => g.tier === "INTENSIVE")!.students.some((x) => x.studentId === ids[0]));
    assert.equal((await studentDiagnosticReport(repo, teacher, ids[0], T1))!.tier.name, "Intensive Support");
  });

  test("2 · one cell rule: the adaptive score wins, no “%” for a 0–100 score", async () => {
    assert.equal(cellPct({ correct: 1, total: 10, score: 70 }), 70);
    assert.equal(cellPct({ correct: 1, total: 8 }), 12.5);
    const d = (await latestDiagnostic(repo, ids[3], now))!;
    assert.equal(d.domains[0].pct, 70);
    assert.equal(d.domains[0].level, "Developing (70)");
    assert.doesNotMatch(d.proficiency, /%/);
    assert.match(d.proficiency, /Diagnostic score 70 \(0–100\)/);
    const a = await diagnosticAnalysisForStudent(repo, teacher, ids[3]);
    assert.equal(a.adaptive, true);
    assert.equal(a.thetaMeasured, false, "θ hidden: the Diagnostic Test does not measure it per domain");
    const rep = (await studentDiagnosticReport(repo, teacher, ids[3], T1))!;
    assert.equal(rep.strands[0].pct, a.domains[0].percentLike, "same number on the Diagnostic report and the Analysis");
    // non-adaptive keeps “%”
    assert.match((await latestDiagnostic(repo, ids[0], now))!.domains[0].level, /^Needs support \(30%\)$/);
  });

  test("3 · an invalid result never gives a level, tier or class mean; the previous valid one is used", async () => {
    const st = await latestDiagnosticState(repo, ids[2], now);
    assert.equal(st.summary!.overallPct, 60, "falls back to the previous valid result");
    assert.ok(st.invalidNewer, "and says a newer one was not valid");
    const a = await diagnosticAnalysisForStudent(repo, teacher, ids[2]);
    assert.equal(a.tier, "PROFICIENT");
    assert.ok(a.invalidNewer);
    const cls = await classDiagnosticReport(repo, teacher, T1, classA, now);
    assert.ok(!cls.students.some((x) => x.id === ids[2]), "not in the master table / levels / tiers");
    const row = cls.notTaken.find((x) => x.id === ids[2])!;
    assert.equal(row.status, "Not valid");
    assert.equal(row.action, INVALID_ACTION);
    assert.equal(cls.summary.invalid, 1);
    assert.ok(cls.summary.max < 95, "the 95 never reaches the class numbers");
    const staff = (await studentDiagnosticReport(repo, teacher, ids[2], T1))!;
    assert.equal(staff.invalid, true);
    assert.equal(staff.tier.name, "Not valid");
    assert.deepEqual(staff.needs, []);
    assert.equal((await studentDiagnosticReport(repo, teacher, ids[2]))!.testId, T0, "without a test: the newest VALID result");
  });

  test("4 · only this school year's results for the student's current grade", async () => {
    assert.equal(await latestDiagnostic(repo, ids[4], now), null);
    const a = await diagnosticAnalysisForStudent(repo, teacher, ids[4]);
    assert.equal(a.takenAt, null);
    assert.equal(a.tier, null);
  });

  test("5 · the tier bands come from the test's real bands", async () => {
    const B = testBands({ above: 80, on: 55 });
    assert.equal(tierBandText("ADVANCED", B), "80% – 100%");
    assert.equal(tierBandText("PROFICIENT", B), "55% – 79.9%");
    assert.equal(tierBandText("APPROACHING", B), "40% – 54.9%");
    assert.equal(tierBandText("INTENSIVE", B), "0% – 39.9%");
    assert.deepEqual(testBands(null), { above: 85, on: 65 });
    const cls = await classDiagnosticReport(repo, teacher, T1, classA, now);
    assert.deepEqual(cls.tiers.map((t) => t.band), ["80% – 100%", "55% – 79.9%", "40% – 54.9%", "0% – 39.9%"]);
  });

  test("6 · families: the newest SHARED result, not null when the newest one is not shared", async () => {
    const u = (await repo.findUnique("Student", { id: ids[5] }))!;
    const me = await resolveActor(repo, (await repo.findUnique("User", { id: u.userId }))!);
    const r = await studentDiagnosticReport(repo, me, ids[5]);
    assert.ok(r, "the older shared report is kept");
    assert.equal(r!.testId, T0);
  });

  test("7 · a teacher of the student's second class can open it; the class average is that class's", async () => {
    const r = (await studentDiagnosticReport(repo, teacher2, ids[0], T1, classB))!;
    assert.ok(r);
    assert.equal(r.classId, classB);
    const viaA = (await studentDiagnosticReport(repo, teacher, ids[0], T1, classA))!;
    assert.equal(viaA.classId, classA);
    assert.notEqual(viaA.strands[0].classPct, null);
  });

  test("8 · the Final Report has one level list (the Diagnostic section) — no “Placement domains”", () => {
    const src = readFileSync("src/server/reports/school-reports.ts", "utf8");
    const fr = src.slice(src.indexOf("export interface FinalReport {"), src.indexOf("export interface FinalMapSubject"));
    assert.doesNotMatch(fr, /\bdomains:/);
    assert.doesNotMatch(readFileSync("src/app/school-reports/final-report/page.tsx", "utf8"), /finalReport\.domains/);
  });

  test("9 · suggested skills: never a skill with a ⭐ now, never the hidden holder skill", async () => {
    const ix = await skillKeyIndex(repo, schoolId);
    const skills = (await repo.findMany("Skill", { deletedAt: null }, { select: ["id", "code", "name"] })).filter((k) => ix.keyOf.has(s(k.id))).slice(0, 2);
    assert.equal(skills.length, 2);
    const sid = ids[6];
    await repo.create("DiagnosticResult", { studentId: sid, sessionId: `sess-${sid}`, takenAt: now, questions: 20, overallTheta: 0, overallSE: 0.3, proficiency: "At grade level", domains: [], strongDomains: [], weakDomains: [], recommendedSkillIds: skills.map((k) => s(k.id)), interventionSkillIds: [], engineVersion: "test" });
    await repo.create("SkillStatus", { studentId: sid, skillKey: ix.keyOf.get(s(skills[0].id))!, level: 1, status: "MASTERED", skillId: s(skills[0].id), answered: 30, correct: 28, score: 95, startedAt: now, masteredAt: now, createdAt: now, updatedAt: now, history: [] });
    const a = await diagnosticAnalysisForStudent(repo, teacher, sid);
    assert.deepEqual(a.recommendedSkills.map((k) => k.skillId), [s(skills[1].id)], "the ⭐ skill is left out");
  });

  test("10 · MAP Reading RIT: the most recent on or before the Diagnostic (never the oldest)", () => {
    const maps = [
      { subject: "Reading", goalName: null, rit: 180, testDate: "2025-09-10" },
      { subject: "Reading", goalName: null, rit: 200, testDate: "2026-09-10" },
      { subject: "Reading", goalName: null, rit: 210, testDate: "2026-12-10" },
      { subject: "Reading", goalName: "Vocabulary", rit: 150, testDate: "2026-09-10" },
    ];
    assert.equal(readingRitAt(maps, new Date("2026-10-01")), 200);
    assert.equal(readingRitAt(maps, new Date("2020-01-01")), 210, "none before: the most recent");
    assert.equal(readingRitAt([], new Date()), null);
  });

  test("12 · growth keeps the newest VALID result per period", async () => {
    const g = await classGrowth(repo, teacher, { grade: Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: classA }))!.gradeId }))!.level), classId: classA, year: "2026-2027" });
    assert.equal(g.students.find((x) => x.id === ids[5])!.scores.BOY!.pct, 70, "two valid BOY results: the newest");
    assert.equal(g.students.find((x) => x.id === ids[2])!.scores.BOY!.pct, 60, "the newer invalid one is skipped");
    assert.deepEqual(g.bands, { above: 80, on: 55 });
  });

  test("11 · Arabic words for the Diagnostic sentences and strands", () => {
    assert.equal(word("ar", "Literature"), "الأدب");
    assert.equal(word("ar", "Foundational Skills"), "المهارات الأساسية");
    assert.match(word("ar", "Meeting the standard · 72% correct on the Diagnostic Test"), /يحقّق المعيار · 72% /);
    assert.match(word("ar", "Developing (70)"), /^قيد التطور \(70\)$/);
    assert.equal(word("en", "Literature"), "Literature");
  });
});
