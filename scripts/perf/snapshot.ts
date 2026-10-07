/**
 * Equivalence check for performance work: dumps what every page's data function returns, so the
 * output of the optimized code can be compared with the original on the SAME database.
 *
 *   npx tsx scripts/perf/snapshot.ts build <db-file>        build the demo school once
 *   npx tsx scripts/perf/snapshot.ts dump <db-file> <out>   run every page function, write JSON
 *
 * dump works on a temporary copy of the database (some pages write, e.g. alerts), with a fixed "now".
 */
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { generateDDL, parseSchema } from "../db/schema-ddl";
import { SqliteRepo } from "../db/sqlite-repo";
import { ROOT, demoDatabase } from "../../tests/helpers/db";
import { simulatePractice } from "../../tests/helpers/practice";
import { resolveActor } from "../../src/server/auth/actor";
import { seedQuestions } from "../../src/server/seeding/questions";
import { loadBank } from "../../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { listQuestions, getQuestion } from "../../src/server/admin/questions";
import { skillCoverage } from "../../src/server/admin/ai-bank";
import { listUsers } from "../../src/server/admin/users";
import { listImportJobs } from "../../src/server/admin/question-import";
import { classOverview, masteryGrid, teacherClasses, studentDetail } from "../../src/server/teacher/queries";
import { scanInterventions } from "../../src/server/teacher/interventions";
import { classAssignments } from "../../src/server/teacher/assignments";
import { standardsReport, studentAnalytics, classComparison } from "../../src/server/analytics/reports";
import { mapComparison } from "../../src/server/analytics/map-compare";
import { loadCalendar } from "../../src/server/analytics/calendar";
import { resolvePeriod } from "../../src/analytics/periods";
import { getStudentCurriculum } from "../../src/server/queries/student-curriculum";
import { latestDiagnostic } from "../../src/server/assessment/diagnostic";
import { parentChildren } from "../../src/server/queries/parent";
import { loadSkillItems } from "../../src/server/practice/items";
import { editorOptions } from "../../src/app/admin/questions/editor-data";

const [mode, dbFile, out] = process.argv.slice(2);

async function build() {
  const { db, repo } = await demoDatabase({ classesPerGrade: 3, studentsPerClass: 25 });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const pending = await repo.findMany("Question", { status: "UNDER_REVIEW" });
  await repo.updateMany("Question", { id: { in: pending.slice(0, 900).map((q) => q.id) } }, { status: "PUBLISHED" });
  const users = (await repo.findMany("User", { role: "STUDENT" })).map((u) => String(u.username)).filter((u) => u.startsWith("demo.s1"));
  const cur4 = (await repo.findMany("Curriculum", {})).find((c) => String(c.name).startsWith("Grade 4"))!;
  const skills4 = await repo.findMany("Skill", { curriculumId: cur4.id });
  const codes: string[] = [];
  for (const s of skills4) if ((await loadSkillItems(repo, String(s.id))).length >= 10) codes.push(String(s.code));
  const months = Array.from({ length: 10 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 3 + i * 11)).toISOString().slice(0, 10), skill: codes[i % codes.length] }));
  await simulatePractice(repo, users.slice(0, 50), months, 8);
  db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
  console.log("built", dbFile, { attempts: await repo.count("QuestionAttempt", {}) });
}

/** Stable JSON: sets → sorted arrays, dates → ISO, keys sorted. */
function stable(v: unknown): unknown {
  if (v instanceof Set) return [...v].map(stable).sort();
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), stable(x)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  if (typeof v === "number" && !Number.isInteger(v)) return Math.round(v * 1e9) / 1e9;
  return v;
}

async function dump() {
  const tmp = `${dbFile}.run-${process.pid}`;
  copyFileSync(dbFile, tmp);
  const db = new DatabaseSync(tmp);
  db.exec("PRAGMA foreign_keys = ON");
  const repo = new SqliteRepo(db, parseSchema(join(ROOT, "prisma/schema.prisma")));
  void generateDDL;
  const now = new Date("2026-12-20T12:00:00Z");
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const admin = await actorFor("demo.admin");
  const teacher = await actorFor("demo.teacher.4a");
  const studentUser = (await repo.findMany("User", { role: "STUDENT" })).map((u) => String(u.username)).filter((u) => u.startsWith("demo.s1")).sort()[0];
  const student = await actorFor(studentUser);
  const parent = await actorFor("demo.p1001");
  const classId = String((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: teacher.userId }))!.id }))[0].classId);
  const cal = await loadCalendar(repo, admin.schoolId!);
  const periods = (["SCHOOL_YEAR", "TERM", "LAST_30_DAYS"] as const).map((p) => resolvePeriod(p, cal, now));
  const range = { from: new Date("2026-09-01"), to: new Date("2026-12-31") };
  const cur4 = (await repo.findMany("Curriculum", {})).find((c) => String(c.name).startsWith("Grade 4"))!;
  const units = (await repo.findMany("Unit", { curriculumId: cur4.id })).map((u) => String(u.id)).sort();
  const skills4 = (await repo.findMany("Skill", { curriculumId: cur4.id })).map((s) => String(s.id)).sort();
  const qIds = (await repo.findMany("Question", { skillId: skills4[3] })).map((q) => String(q.id)).sort();
  const studentId = student.studentId!;

  const r: Record<string, unknown> = {};
  const run = async (k: string, f: () => Promise<unknown>) => { try { r[k] = await f(); } catch (e) { r[k] = { error: String((e as Error).message) }; } };
  await run("actor.admin", async () => admin);
  await run("actor.teacher", async () => teacher);
  await run("actor.student", async () => student);
  await run("actor.parent", async () => parent);
  for (const status of ["DRAFT", "UNDER_REVIEW", "PUBLISHED", "ARCHIVED"] as const) await run(`listQuestions.${status}`, () => listQuestions(repo, admin, { status }));
  await run("listQuestions.search", () => listQuestions(repo, admin, { status: "PUBLISHED", q: "main idea" }));
  await run("listQuestions.grade5", () => listQuestions(repo, admin, { status: "PUBLISHED", gradeLevel: 5 }));
  await run("listQuestions.ai", () => listQuestions(repo, admin, { aiOnly: true }));
  await run("listQuestions.teacher.mine", () => listQuestions(repo, teacher, { status: "DRAFT", mine: true }));
  for (const g of [4, 5, 6]) await run(`skillCoverage.${g}`, () => skillCoverage(repo, admin, g));
  for (const id of qIds.slice(0, 3)) await run(`getQuestion.${id}`, () => getQuestion(repo, admin, id));
  await run("editorOptions", () => editorOptions(repo, admin.schoolId!));
  await run("listUsers", () => listUsers(repo, admin, {}));
  await run("listUsers.students", () => listUsers(repo, admin, { role: "STUDENT" }));
  await run("listImportJobs", () => listImportJobs(repo, admin));
  await run("teacherClasses.teacher", () => teacherClasses(repo, teacher));
  await run("teacherClasses.admin", () => teacherClasses(repo, admin));
  await run("classOverview", () => classOverview(repo, teacher, classId, range));
  for (const u of units.slice(0, 3)) await run(`masteryGrid.${u}`, () => masteryGrid(repo, teacher, classId, u));
  await run("classAssignments", () => classAssignments(repo, teacher, classId));
  for (const [i, p] of periods.entries()) {
    await run(`classComparison.${i}`, () => classComparison(repo, teacher, classId, p));
    await run(`standardsReport.class.${i}`, () => standardsReport(repo, teacher, { classId }, p));
    await run(`standardsReport.school.${i}`, () => standardsReport(repo, admin, { school: true }, p));
    await run(`studentAnalytics.${i}`, () => studentAnalytics(repo, teacher, studentId, p));
  }
  await run("studentDetail", () => studentDetail(repo, teacher, studentId));
  await run("mapComparison", () => mapComparison(repo, teacher, studentId));
  await run("studentCurriculum", () => getStudentCurriculum(repo, studentId));
  await run("latestDiagnostic", () => latestDiagnostic(repo, studentId));
  await run("parentChildren", () => parentChildren(repo, parent));
  for (const s of skills4) await run(`items.${s}`, () => loadSkillItems(repo, s));
  // intervention scan writes alerts: record what it created
  const ids = ((r.classOverview as { students?: { studentId: string }[] })?.students ?? []).map((s) => s.studentId);
  await run("scanInterventions", async () => {
    const n = await scanInterventions(repo, ids, now);
    const alerts = (await repo.findMany("InterventionAlert", { studentId: { in: ids } })).map((a) => ({ studentId: a.studentId, skillId: a.skillId, ruleCode: a.ruleCode, message: a.message }));
    return { n, alerts: alerts.sort((a, b) => `${a.studentId}${a.skillId}`.localeCompare(`${b.studentId}${b.skillId}`)) };
  });
  await run("classOverview.afterScan", () => classOverview(repo, teacher, classId, range));
  writeFileSync(out, JSON.stringify(stable(r), null, 1));
  db.close();
  const { unlinkSync } = await import("node:fs");
  unlinkSync(tmp);
  console.log("dumped", Object.keys(r).length, "results to", out);
}

(mode === "build" ? build() : dump()).catch((e) => { console.error(e); process.exit(1); });
