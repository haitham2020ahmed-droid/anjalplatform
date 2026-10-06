/**
 * Renders sample reports (English + Arabic, PDF/XLSX/CSV) from an in-memory demo
 * database with simulated practice, for visual review:
 *   tsx scripts/preview/render-reports.ts ./out
 * Uses demo data only. One student is renamed with an Arabic name, and the demo
 * school gets an Arabic name, to exercise mixed-direction text.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveActor } from "../../src/server/auth/actor";
import { chromiumRenderer } from "../../src/reports/pdf";
import { BRANDING_KEY, exportReport, type ReportRequest } from "../../src/server/reports/service";
import { demoDatabase, ROOT } from "../../tests/helpers/db";
import { publishGrade4Bank, simulatePractice } from "../../tests/helpers/practice";

async function main() {
  const out = process.argv[2] ?? "./report-preview";
  mkdirSync(out, { recursive: true });
  const { repo } = await demoDatabase();
  await publishGrade4Bank(repo);
  await simulatePractice(repo, ["demo.s1001", "demo.s1002", "demo.s1003"], [
    { date: "2026-09-15", skill: "G4.theme" }, { date: "2026-10-15", skill: "G4.context-clues" }, { date: "2026-11-15", skill: "G4.central-idea" }, { date: "2026-12-01", skill: "G4.theme" },
  ]);
  const s1User = (await repo.findUnique("User", { username: "demo.s1001" }))!;
  await repo.updateMany("User", { id: s1User.id }, { displayName: "[DEMO] ليان أحمد" });
  // demo MAP results, as a Phase 9 import would store them (official values, unchanged)
  const s1 = (await repo.findUnique("Student", { userId: s1User.id }))!;
  const area = (await repo.findMany("MapGoalArea", {}))[0];
  await repo.create("MapResult", { studentId: s1.id, testDate: new Date("2026-10-05T00:00:00Z"), subject: "Reading", rit: 204, ritSE: 3.1, achievementPercentile: 58, termName: "Fall 2026-2027" });
  if (area) await repo.create("MapResult", { studentId: s1.id, testDate: new Date("2026-10-05T00:00:00Z"), subject: "Reading", goalName: String(area.name), goalAreaId: area.id, rit: 198, ritSE: 4.2, termName: "Fall 2026-2027" });
  const school = (await repo.findMany("School", {}))[0];
  await repo.create("SchoolSetting", { schoolId: school.id, key: BRANDING_KEY, value: { nameAr: "مدرسة العرض التجريبية الدولية" } });
  if (process.env.PREVIEW_LOGO) await repo.updateMany("School", { id: school.id }, { logoUrl: process.env.PREVIEW_LOGO });

  const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  const studentId = String((await repo.findUnique("Student", { userId: s1User.id }))!.id);
  const classId = String((await repo.findMany("ClassMembership", { studentId }))[0].classId);

  const pdf = chromiumRenderer({ executablePath: process.env.REPORT_CHROMIUM_PATH });
  const deps = { repo, pdf, fontDir: join(ROOT, "assets/fonts"), brandingDir: process.env.PREVIEW_BRANDING_DIR ?? join(ROOT, "storage/branding"), now: () => new Date("2026-12-20T09:30:00Z") };
  const jobs: [typeof teacher, Omit<ReportRequest, "format" | "locale">][] = [
    [teacher, { kind: "student", period: "TERM", studentId }],
    [teacher, { kind: "class", period: "TERM", classId }],
    [admin, { kind: "school", period: "SCHOOL_YEAR" }],
    [admin, { kind: "standards", period: "TERM", scope: "school" }],
  ];
  try {
    for (const [actor, r] of jobs)
      for (const locale of ["en", "ar"] as const)
        for (const format of ["pdf", "xlsx", "csv"] as const) {
          const f = await exportReport(deps, actor, { ...r, locale, format });
          writeFileSync(join(out, f.filename), f.bytes);
          console.log(`${f.filename}  ${f.bytes.length} bytes`);
        }
  } finally {
    await pdf.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
