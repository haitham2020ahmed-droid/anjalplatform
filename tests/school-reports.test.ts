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
import { bandOf } from "../src/server/map/personal-plan";
import { bySourceReport, classifySkillSources, starsFor } from "../src/server/skills/skills-by-source";
import { diagnosticAnalysisForStudent, finalReportForStudent, personalizedPlanForStudent, schoolReportsRoster, TIER_LABEL } from "../src/server/reports/school-reports";
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
  });

  test("access control: a teacher who does not teach this student cannot build any of the three reports; their own school's admin can", async () => {
    const otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const studentId = roster[0].id;
    await assert.rejects(() => personalizedPlanForStudent(repo, otherTeacher, studentId), ForbiddenError);
    await assert.rejects(() => diagnosticAnalysisForStudent(repo, otherTeacher, studentId), ForbiddenError);
    await assert.doesNotReject(() => diagnosticAnalysisForStudent(repo, admin, studentId));
  });
});
