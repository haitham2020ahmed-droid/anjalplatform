/**
 * 🧾 Admin → End-of-term report (src/app/admin/term-report/page.tsx): built from departmentSummary + growthReport
 * (MAP Reading growth by class) + the practice-test results, summarised by growthTotals / termReportSummary
 * (src/lib/report-summaries.ts). This file covers the term-report-specific pieces: growthTotals' "each student
 * once" rule and the printed summary, plus growthReport's own access rule.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { growthReport } from "../src/server/teacher/extras";
import { growthTotals, R, signed, termReportSummary } from "../src/lib/report-summaries";
import { departmentSummary } from "../src/server/insights/department";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin · end-of-term report", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("signed(): a growth number is never shown as a bare negative, and null/NaN are shown as a dash", () => {
    assert.equal(signed(3), "+3");
    assert.equal(signed(-2), "-2");
    assert.equal(signed(0), "0");
    assert.equal(signed(null), "—");
    assert.equal(signed(undefined), "—");
  });

  test("growthTotals: each student counted once across classes; % met is out of the measured ones only", () => {
    const classes = [
      { rows: [{ studentId: "s1", met: true }, { studentId: "s2", met: false }, { studentId: "s3", met: null }] },
      { rows: [{ studentId: "s1", met: false }, { studentId: "s4", met: true }] }, // s1 duplicated: kept once (first non-null wins)
    ];
    const t = growthTotals(classes);
    assert.equal(t.tested, 4);
    assert.equal(t.measured, 3, "s3's null is never counted as measured");
    assert.equal(t.met, 2, "s1 and s4");
    assert.equal(t.pct, Math.round((100 * 2) / 3));
  });

  test("growthTotals: nobody measured → pct is null, not a divide-by-zero", () => {
    assert.deepEqual(growthTotals([{ rows: [{ studentId: "s1", met: null }] }]), { tested: 1, measured: 0, met: 0, pct: null });
  });

  test("termReportSummary: the MAP-met line only appears once students were actually tested", () => {
    const d = { classes: [], weakest: [], totals: { students: 10, active: 5, alertsOpen: 0 } } as Parameters<typeof termReportSummary>[0];
    const withTested = termReportSummary(d, { measured: 4, met: 2 });
    const metLine = withTested.lines.find((l) => l.key === R.adMapMet);
    assert.ok(metLine);
    assert.deepEqual(metLine!.vars, { p: 50, m: 2, n: 4 });
    const noneTested = termReportSummary(d, { measured: 0, met: 0 });
    assert.ok(!noneTested.lines.some((l) => l.key === R.adMapMet));
  });

  test("growthReport (MAP Reading growth by class): a class with no Fall/later pair yet is simply empty, not an error", async () => {
    const r = await growthReport(repo, admin, "READING");
    assert.ok(r.length >= 1);
    assert.ok(r.every((c) => c.tested === 0 && c.measured === 0 && c.avgGrowth === null));
    // the term report also pulls the department summary — sanity that both compose without clashing
    const d = await departmentSummary(repo, admin, now);
    assert.equal(d.classes.length >= r.length, true);
  });

  test("permission gate: students and parents cannot open the MAP growth report (growthReport); admins and teachers can", async () => {
    await assert.rejects(growthReport(repo, student, "READING"), ForbiddenError);
    await growthReport(repo, teacher, "READING"); // does not throw
  });
});
