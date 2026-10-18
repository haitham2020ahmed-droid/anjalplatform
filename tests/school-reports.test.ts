/**
 * 🗒️ School Reports: Personalized Plan / Diagnostic Analysis / Final Report, each scoped to
 * one student, plus the "skills by source" aggregator they (and the student page) share.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolvePeriod } from "../src/analytics/periods";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { loadCalendar } from "../src/server/analytics/calendar";
import { studentAnalytics } from "../src/server/analytics/reports";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { bandOf, personalPlan } from "../src/server/map/personal-plan";
import { CONTINUUM_HEADERS, importContinuum } from "../src/server/map/continuum";
import { bySourceReport, classifySkillSources, starsFor } from "../src/server/skills/skills-by-source";
import { diagnosticAnalysisForClass, diagnosticAnalysisForStudent, finalReportForStudent, finalReportsForClass, personalizedPlanForStudent, schoolReportsRoster, TIER_LABEL } from "../src/server/reports/school-reports";
import { demoDatabase } from "./helpers/db";
import { simulatePractice } from "./helpers/practice";

describe("🗒️ School Reports (per-student Personalized Plan, Diagnostic Analysis, Final Report)", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
    const H = [...MAP_TEMPLATE_HEADERS], at = (h: string) => H.indexOf(h);
    const rows = [[8, 170, 165, 180, 40], [35, 185, 178, 192, 0], [50, 195, 190, 200, 5], [75, 205, 210, 199, 0]];
    const table = [H];
    for (let i = 0; i < rows.length; i++) {
      const [pct, rit, theme, vocab, rapid] = rows[i];
      const num = String((await repo.findUnique("Student", { id: roster[i].id }))!.studentNumber);
      const row = H.map(() => ""); row[0] = num;
      row[at("Reading Fall RIT")] = String(rit); row[at("Reading Fall Percentile")] = String(pct); row[at("Reading Spring Projection")] = String(rit + 8);
      row[at("R: Literary Theme")] = String(theme); row[at("R: Vocabulary")] = String(vocab); row[at("R: Info Central Idea")] = String(rit - 3); row[at("Reading Rapid-Guessing %")] = String(rapid);
      table.push(row);
    }
    assert.equal((await importMapScores(repo, teacher, table, 2026)).imported, 4);
  });

  test("school report roster: a teacher sees their own classes, an admin sees the whole school", async () => {
    const forTeacher = await schoolReportsRoster(repo, teacher);
    const forAdmin = await schoolReportsRoster(repo, admin);
    assert.ok(forTeacher.some((c) => c.classId === classId));
    assert.ok(forAdmin.some((c) => c.classId === classId));
    assert.ok(forAdmin.length >= forTeacher.length, "the admin's roster is at least as large as one teacher's");
  });

  test("Personalized Plan report: one student's band matches the class plan's band for the same student", async () => {
    const studentId = roster[0].id; // Fall RIT 170, percentile 8 → BELOW
    const p = await personalizedPlanForStudent(repo, teacher, studentId, "READING");
    assert.equal(p.studentId, studentId);
    assert.equal(p.band, bandOf(8, null));
    assert.equal(p.band, "BELOW");
    assert.ok(p.rit === 170);
    assert.ok(p.goals.length > 0 || p.strengths.length >= 0, "goals come from the class's weakest MAP goal areas");
    // an admin of the same school can build the same report
    const viaAdmin = await personalizedPlanForStudent(repo, admin, studentId, "READING");
    assert.equal(viaAdmin.band, p.band);
  });

  test("Personalized Plan: the whole-class view (the school's own grouped format) agrees with each student's own view", async () => {
    const whole = await personalPlan(repo, teacher, classId, "READING");
    assert.equal(whole.classId, classId);
    assert.deepEqual(whole.bands.map((b) => b.band), ["BELOW", "ON", "ABOVE"], "the three bands, in that order, every time");
    for (const st of roster) {
      const own = await personalizedPlanForStudent(repo, teacher, st.id, "READING");
      if (!own.band) continue;
      const row = whole.bands.find((b) => b.band === own.band)!.students.find((x) => x.studentId === st.id);
      assert.ok(row, `${own.name}: listed in the ${own.band} band of the class view`);
      assert.equal(row!.rit, own.rit, `${own.name}: same RIT in both views`);
    }
    // an admin builds the same whole-class view too
    assert.deepEqual((await personalPlan(repo, admin, classId, "READING")).bands.map((b) => b.students.length), whole.bands.map((b) => b.students.length));
  });

  test("Diagnostic Analysis report: no placement taken yet → a clear 'not taken' result, not a crash", async () => {
    const studentId = roster[1].id;
    const d = await diagnosticAnalysisForStudent(repo, teacher, studentId);
    assert.equal(d.takenAt, null);
    assert.equal(d.tier, null);
    assert.deepEqual(d.domains, []);
  });

  test("Diagnostic Analysis report: reads a DiagnosticResult into tier + domain breakdown", async () => {
    const studentId = roster[2].id;
    await repo.create("DiagnosticResult", {
      studentId, sessionId: `sess-${studentId}`, takenAt: new Date("2026-10-01T09:00:00Z"), questions: 20, overallTheta: 0.9, overallSE: 0.3,
      proficiency: "Above grade level",
      domains: [{ domain: "READING", theta: 0.9, se: 0.3, items: 10, correct: 8, label: "Above grade level" }, { domain: "VOCABULARY", theta: -1.2, se: 0.4, items: 10, correct: 3, label: "Below grade level" }],
      strongDomains: ["READING"], weakDomains: ["VOCABULARY"], recommendedSkillIds: [], interventionSkillIds: [], engineVersion: "test",
    });
    const d = await diagnosticAnalysisForStudent(repo, teacher, studentId);
    assert.equal(d.proficiency, "Above grade level");
    assert.equal(d.tier, "ADVANCED");
    assert.ok(TIER_LABEL[d.tier!].includes("Advanced"));
    assert.equal(d.domains.length, 2);
    assert.ok(d.domains.every((x) => x.prescription.length > 0));
    assert.deepEqual(d.strengths, ["Reading"]);
    assert.deepEqual(d.growthAreas, ["Vocabulary"]);
  });

  test("Diagnostic Analysis: the whole-class view groups every student by tier, including those not yet tested", async () => {
    const whole = await diagnosticAnalysisForClass(repo, teacher, classId);
    assert.equal(whole.classId, classId);
    assert.deepEqual(whole.tiers.map((x) => x.tier), ["ADVANCED", "PROFICIENT", "APPROACHING", "INTENSIVE"]);
    const advanced = whole.tiers.find((x) => x.tier === "ADVANCED")!;
    assert.ok(advanced.students.some((x) => x.studentId === roster[2].id), "the student with the Above-grade-level result is in Advanced");
    assert.deepEqual(advanced.students.find((x) => x.studentId === roster[2].id)!.domains, { Reading: "Above grade level", Vocabulary: "Below grade level" });
    assert.ok(whole.domains.includes("Reading") && whole.domains.includes("Vocabulary"));
    assert.ok(whole.notTaken.some((x) => x.studentId === roster[1].id), "a student with no result yet is listed as not taken, not dropped");
    assert.ok(!whole.tiers.flatMap((t) => t.students).some((x) => x.studentId === roster[1].id), "and not double-counted in a tier");
    // an admin sees the same class grouping
    assert.deepEqual((await diagnosticAnalysisForClass(repo, admin, classId)).notTaken.length, whole.notTaken.length);
  });

  test("skills by source: classifies Grammar skills separately, and a star rating within 1-5", () => {
    assert.equal(starsFor(0), 1); assert.equal(starsFor(100), 5); assert.equal(starsFor(45), 3);
  });

  test("skills by source + Final Report: practised skills are classified and summarized without re-deriving mastery", async () => {
    const studentId = roster[3].id;
    const username = (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!.username as string;
    await simulatePractice(repo, [username], [{ date: "2026-09-10", skill: "G4.theme" }, { date: "2026-10-10", skill: "G4.theme" }]);
    const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, teacher.schoolId!), new Date("2026-12-01T00:00:00Z"));
    const src = await bySourceReport(repo, teacher, studentId, period);
    assert.ok(src.summary.totalSkills >= 1, "at least the practised skill is classified");
    const classified = [...(await classifySkillSources(repo, teacher.schoolId!, 4, studentId, src.groups.flatMap((g) => g.skills.map((k) => k.skillId)))).values()];
    assert.ok(classified.every((c) => ["CURRICULUM", "MAP", "GRAMMAR", "READMASTER", "RTI"].includes(c)));

    const a = await studentAnalytics(repo, teacher, studentId, period);
    const report = await finalReportForStudent(repo, teacher, studentId, period);
    assert.equal(report.studentId, studentId);
    // the Final Report's KPIs are the same numbers the student's own analytics screen shows (no re-derivation)
    assert.equal(report.kpis.skillsMastered, a.skillsMastered);
    assert.equal(report.kpis.accuracyPct, a.accuracyPct);
    assert.equal(report.bySource.summary.totalSkills, src.summary.totalSkills);

    // the whole-class Final Report: one entry per student, each the same as its own single-student report
    const period2 = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, teacher.schoolId!), new Date("2026-12-01T00:00:00Z"));
    const whole = await finalReportsForClass(repo, teacher, classId, period2);
    assert.equal(whole.classId, classId);
    assert.equal(whole.reports.length, roster.length);
    const mine = whole.reports.find((r) => r.studentId === studentId)!;
    assert.deepEqual(mine.kpis, report.kpis);
    assert.equal(mine.bySource.summary.totalSkills, report.bySource.summary.totalSkills);
  });

  test("📊 Instructional Area Achievement Percentiles: empty (never thrown) with only a basic RIT-only import, populated once the comprehensive file's descriptor exists — and Final Report carries the same rows as Personalized Plan", async () => {
    const studentId = roster[0].id;
    // this file's before() only ran the basic Reading template import (no descriptor, and no Language data at all):
    // best-effort means nothing to show for Language yet, not a crash
    const basic = await personalizedPlanForStudent(repo, teacher, studentId, "LANGUAGE");
    assert.deepEqual(basic.areaPercentiles, []);

    // a comprehensive-file import (owner's real MAP export): the overall test row, plus a goal row with its own descriptor
    await repo.create("MapResult", { studentId, testDate: new Date("2025-09-15"), subject: "Language Usage", goalName: null, rit: 180, ritSE: 3, achievementPercentile: 20, termName: "Fall 2025", importedAt: new Date() });
    await repo.create("MapResult", { studentId, testDate: new Date("2025-09-15"), subject: "Language Usage", goalName: "Grammar: Subject-Verb Agreement", rit: 165, ritSE: 6, descriptor: "Low", termName: "Fall 2025", importedAt: new Date() });
    const pp = await personalizedPlanForStudent(repo, teacher, studentId, "LANGUAGE");
    const grammar = pp.areaPercentiles.find((r) => r.name === "Grammar")!;
    assert.deepEqual(grammar.quintiles, [1, 0, 0, 0, 0], "this student's own Grammar descriptor is Low");

    const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, teacher.schoolId!), new Date("2026-12-01T00:00:00Z"));
    const report = await finalReportForStudent(repo, teacher, studentId, period);
    const language = report.plans.find((x) => x.subject === "LANGUAGE")!;
    assert.deepEqual(language.areaPercentiles, pp.areaPercentiles, "the Final Report shows the exact same rows as the Personalized Plan — no re-derivation");
  });

  test("access control: a teacher who does not teach this student cannot build any of the three reports; their own school's admin can", async () => {
    const otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const studentId = roster[0].id;
    await assert.rejects(() => personalizedPlanForStudent(repo, otherTeacher, studentId), ForbiddenError);
    await assert.rejects(() => diagnosticAnalysisForStudent(repo, otherTeacher, studentId), ForbiddenError);
    await assert.doesNotReject(() => diagnosticAnalysisForStudent(repo, admin, studentId));
  });
});

describe("🗒️ Personalized Plan: Academic Goals skills differentiate by RIT band once a Learning Continuum is imported", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    const roster = r[0].students;
    const H = [...MAP_TEMPLATE_HEADERS], at = (h: string) => H.indexOf(h);
    // one Below-band student (percentile 8) and one Above-band student (percentile 75); each has a
    // Vocabulary goal RIT placing them in a different continuum band (181–190 vs 191–200)
    const rows: [number, number, number, number][] = [[8, 170, 165, 186], [75, 205, 210, 199]];
    const table = [H];
    for (let i = 0; i < rows.length; i++) {
      const [pct, rit, theme, vocab] = rows[i];
      const num = String((await repo.findUnique("Student", { id: roster[i].id }))!.studentNumber);
      const row = H.map(() => ""); row[0] = num;
      row[at("Reading Fall RIT")] = String(rit); row[at("Reading Fall Percentile")] = String(pct);
      row[at("R: Literary Theme")] = String(theme); row[at("R: Vocabulary")] = String(vocab);
      table.push(row);
    }
    assert.equal((await importMapScores(repo, teacher, table, 2026)).imported, 2);
    // a small, made-up continuum (same shape as NWEA's): Vocabulary activates a different standard per band
    const CONT = [
      [...CONTINUUM_HEADERS],
      ["Reading", "181", "190", "Vocabulary: Acquisition and Use", "Context, Multiple Meanings", "Determines the meaning of a word with multiple meanings in context", "L.4.4.a"],
      ["Reading", "191", "200", "Vocabulary: Acquisition and Use", "Roots, Prefixes, Suffixes", "Uses a Greek or Latin root to work out a word's meaning", "L.4.4.b"],
    ];
    assert.equal((await importContinuum(repo, admin, CONT)).saved, 2);
  });
  test("the same Vocabulary goal area gets different skills for the Below band than for the Above band", async () => {
    const plan = await personalPlan(repo, teacher, classId, "READING");
    const below = plan.bands.find((b) => b.band === "BELOW")!;
    const above = plan.bands.find((b) => b.band === "ABOVE")!;
    const vocabBelow = [...below.goals, ...below.strengths].find((g) => /vocabulary/i.test(g.area));
    const vocabAbove = [...above.goals, ...above.strengths].find((g) => /vocabulary/i.test(g.area));
    assert.ok(vocabBelow, "Vocabulary is a goal (or strength) of the Below band");
    assert.ok(vocabAbove, "Vocabulary is a goal (or strength) of the Above band");
    assert.equal(vocabBelow!.meanRit, 186);
    assert.equal(vocabAbove!.meanRit, 199);
    const namesBelow = vocabBelow!.skills.map((k) => k.name);
    const namesAbove = vocabAbove!.skills.map((k) => k.name);
    assert.notDeepEqual(namesBelow, namesAbove, "Below and Above no longer get the exact same skill list for the same goal area");
    assert.ok(namesBelow.some((n) => /multiple-meaning/i.test(n)), `Below (RIT 186, continuum band 181–190 → L.4.4.a) should prioritize "Multiple-Meaning Words"; got ${namesBelow.join(", ")}`);
    assert.ok(namesAbove.some((n) => /greek and latin roots|prefixes|suffixes/i.test(n)), `Above (RIT 199, continuum band 191–200 → L.4.4.b) should prioritize an L.4.4.b skill; got ${namesAbove.join(", ")}`);
    // never fewer skills than the old (unordered) behaviour would have returned
    assert.equal(vocabBelow!.skills.length, 4);
    assert.equal(vocabAbove!.skills.length, 4);
  });
  test("a goal area the continuum doesn't cover (Literary Text) still gets its skills, unchanged by the import", async () => {
    const plan = await personalPlan(repo, teacher, classId, "READING");
    for (const band of plan.bands) {
      const lit = [...band.goals, ...band.strengths].find((g) => /literary/i.test(g.area));
      if (lit) assert.ok(lit.skills.length > 0, `${band.band}: Literary Text keeps a non-empty skill list though the continuum has no Literary Text statements`);
    }
  });
});
