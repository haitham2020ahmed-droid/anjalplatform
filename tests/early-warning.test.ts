/**
 * 🚨 Early warning (Reports, teacher AND admin) — demo school in memory, never a real database:
 *   patterns (rise / drop / sudden drop / swinging / flat …), severity rules, the reason in plain words,
 *   the class view, handled students leave the list, ONE notification per new Urgent (the alert scan),
 *   the admin's school view (filters, urgent not handled 7+ days), Excel + PDF downloads, staff only, and a
 *   fixed number of queries per round of students.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import type { Repo } from "../src/server/seeding/repo";
import {
  DAY, FLAT_WEEKS, INVALID_REPEAT, MEASURES, NO_PRACTICE_URGENT_DAYS, SWING_CHANGES, detectPattern, directionChanges, judge, measurePhrase, sentence,
  type MeasureFinding, type MeasureKey, type Point,
} from "../src/server/insights/early-warning-rules";
import { clearEarlyWarningCache, earlyWarning, EW_KIND, handleEarlyWarning, schoolEarlyWarning, urgentUnhandledCount } from "../src/server/insights/early-warning";
import { alertList, scanAlerts } from "../src/server/insights/alerts";
import { exportReport, parseReportRequest } from "../src/server/reports/service";
import type { PdfRenderer } from "../src/reports/pdf";
import { tableById } from "../src/reports/model";
import { REPORTS } from "../src/components/teacher/report-catalog";
import { ADMIN_TOOLS } from "../src/components/admin-tools";
import { isUiString } from "../src/i18n";

const s = (v: unknown) => String(v ?? "");
const NOW = Date.UTC(2026, 9, 13, 8);
const pts = (vals: number[], everyDays = 7, end = NOW) => vals.map((v, i) => ({ at: end - (vals.length - 1 - i) * everyDays * DAY, v }));
const find = (key: MeasureKey, points: Point[], now = NOW): MeasureFinding => ({ key, points, result: detectPattern(points, MEASURES[key], now) });
const calm = { daysSincePractice: 1, mapRisk: false, declining: false, invalidTests: 0 };

describe("🚨 Early warning — the rules (pure)", () => {
  test("patterns: steady rise, steady drop, sudden drop, swinging, flat, single drop / rise, back on track", () => {
    assert.equal(detectPattern(pts([600, 700, 800]), MEASURES.READRISE, NOW).pattern, "BIG_RISE", "ReadRise up 2 levels = a big rise");
    assert.equal(detectPattern(pts([60, 70, 80]), MEASURES.WEEKLY, NOW).pattern, "BIG_RISE");
    assert.equal(detectPattern(pts([60, 61, 72, 83]), { ...MEASURES.WEEKLY, big: 99 }, NOW).pattern, "STEADY_RISE");
    const down = detectPattern(pts([800, 700, 600]), MEASURES.READRISE, NOW);
    assert.equal(down.pattern, "STEADY_DROP");
    assert.equal(down.change, -200);
    assert.equal(down.direction, "DOWN");
    assert.equal(detectPattern(pts([80, 78, 55]), MEASURES.SKILLS, NOW).pattern, "SUDDEN_DROP", "−23 in one week ≥ the big step");
    assert.equal(detectPattern(pts([80, 70]), MEASURES.WEEKLY, NOW).pattern, "DROP");
    assert.equal(detectPattern(pts([70, 80]), MEASURES.WEEKLY, NOW).pattern, "RISE");
    assert.equal(detectPattern(pts([80, 60, 80]), { ...MEASURES.WEEKLY, big: 99 }, NOW).pattern, "BACK_ON_TRACK");
    const swing = detectPattern(pts([50, 80, 50, 80, 50]), MEASURES.WEEKLY, NOW);
    assert.equal(swing.pattern, "SWINGING");
    assert.ok(swing.swings >= SWING_CHANGES);
    assert.equal(directionChanges([50, 80, 50, 80, 50], 10), 3);
    assert.equal(directionChanges([50, 52, 49, 51, 50], 10), 0, "noise under one step is not a swing");
    const flat = detectPattern(pts([90, 92, 91, 90, 91], 7), MEASURES.FLUENCY, NOW);
    assert.equal(flat.pattern, "FLAT");
    assert.ok(flat.flatWeeks >= FLAT_WEEKS);
    assert.equal(detectPattern(pts([90, 92, 91, 90, 91], 7), MEASURES.WEEKLY, NOW).pattern, "STABLE", "flat is checked only where growth is expected");
    assert.equal(detectPattern([{ at: NOW - 30 * DAY, v: 800 }], MEASURES.READRISE, NOW, { active: true, flatSince: NOW - 40 * DAY }).pattern, "FLAT", "ReadRise: the same level for weeks while reading");
    assert.equal(detectPattern([{ at: NOW - 30 * DAY, v: 800 }], MEASURES.READRISE, NOW, { active: false, flatSince: NOW - 40 * DAY }).pattern, "STABLE", "not reading: not flat");
    assert.equal(detectPattern(pts([80, 40], 7, NOW - 200 * DAY), MEASURES.WEEKLY, NOW).pattern, "STABLE", "an old drop no longer counts");
  });

  test("severity: Urgent / Watch / Good news by the named rules", () => {
    const sudden = find("SKILLS", pts([80, 78, 55]));
    const drop = find("WEEKLY", pts([80, 70]));
    const drop2 = find("FLUENCY", pts([90, 80]));
    const swing = find("WEEKLY", pts([50, 80, 50, 80, 50]));
    const rise = find("READRISE", pts([600, 700, 800]));
    assert.equal(judge([sudden], calm, NOW).severity, "URGENT", "a sudden big drop");
    assert.deepEqual(judge([drop, drop2], calm, NOW).rules, ["MULTI_DROP"], "drops on 2 measures at the same time");
    assert.equal(judge([drop], calm, NOW).severity, "WATCH", "a single drop");
    assert.equal(judge([swing], calm, NOW).severity, "WATCH", "swinging");
    assert.equal(judge([rise], calm, NOW).severity, "GOOD", "a big rise");
    assert.equal(judge([], calm, NOW).severity, null, "nothing moved: not on the list");
    assert.equal(judge([drop], { ...calm, daysSincePractice: NO_PRACTICE_URGENT_DAYS }, NOW).severity, "URGENT", "no practice 14+ days with a falling level");
    assert.equal(judge([], { ...calm, daysSincePractice: 30 }, NOW).severity, null, "no practice alone is the NO_PRACTICE alert's job");
    assert.equal(judge([drop], { ...calm, daysSincePractice: 30, isNew: true }, NOW).severity, "WATCH", "a new student is not 'without practice'");
    assert.equal(judge([drop], { ...calm, mapRisk: true }, NOW).severity, "URGENT", "MAP at risk + declining");
    assert.equal(judge([], { ...calm, mapRisk: true, declining: true }, NOW).severity, "URGENT", "MAP at risk + the daily level check's decline");
    assert.equal(judge([], { ...calm, invalidTests: INVALID_REPEAT }, NOW).severity, "URGENT", "invalid tests repeatedly");
    assert.equal(judge([rise, drop], calm, NOW).severity, "WATCH", "a drop wins over good news");
    assert.notEqual(judge([drop], calm, NOW).signature, judge([drop, drop2], calm, NOW).signature, "another situation, another signature");
    assert.equal(judge([drop], calm, NOW).signature, judge([find("WEEKLY", pts([82, 70]))], calm, NOW).signature, "the same situation keeps its signature");
  });

  test("the reason in plain words", () => {
    const rr = find("READRISE", pts([800, 700, 600], 10));
    const sk = find("SKILLS", pts([78, 60], 21));
    const v = judge([rr, sk], calm, NOW);
    assert.equal(v.severity, "URGENT");
    assert.match(v.reason, /ReadRise level down 2 levels in 3 weeks/);
    assert.match(v.reason, /skill average −18% in 3 weeks/i);
    assert.match(v.reason, / and /);
    assert.equal(measurePhrase("MAP", { pattern: "DROP", direction: "DOWN", change: -7, days: 84 * DAY, swings: 0, flatWeeks: 0 }), "MAP RIT −7 in 12 weeks");
    assert.match(measurePhrase("WEEKLY", detectPattern(pts([50, 80, 50, 80, 50]), MEASURES.WEEKLY, NOW)), /swinging up and down \(3 changes/);
    assert.match(measurePhrase("FLUENCY", detectPattern(pts([90, 92, 91, 90, 91]), MEASURES.FLUENCY, NOW)), /fluency flat for \d weeks/);
    assert.equal(sentence(["a", "b", "c"]), "A, b and c.");
    assert.match(judge([find("WEEKLY", pts([80, 70]))], { ...calm, daysSincePractice: 20 }, NOW).reason, /no practice for 20 days/);
    assert.match(judge([], { ...calm, invalidTests: 3 }, NOW).reason, /3 invalid tests/);
  });
});

describe("🚨 Early warning — teacher and admin (demo school)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let student: Actor;
  let classId = ""; let otherClass = ""; let A = "", B = "", C = "", D = "", E = "";
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * DAY);

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 5 }));
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actor("demo.admin"); teacher = await actor("demo.teacher.4a"); other = await actor("demo.teacher.5a");
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    const t2 = await repo.findUnique("Teacher", { userId: other.userId });
    otherClass = s((await repo.findMany("ClassTeacher", { teacherId: t2!.id }))[0].classId);
    const ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    [A, B, C, D, E] = ids;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: A }))!.userId }))!);
    const schoolId = admin.schoolId!;
    // A: ReadRise down 2 levels (steady) and fluency −20 WCPM (sudden) → Urgent
    await repo.create("RRStudent", { studentId: A, schoolId, level: 600, startLevel: 800, source: "PLACEMENT", placedAt: ago(60), updatedAt: now });
    await repo.create("RRLevelChange", { studentId: A, schoolId, fromLevel: 800, toLevel: 700, reason: "below 50%", createdAt: ago(20) });
    await repo.create("RRLevelChange", { studentId: A, schoolId, fromLevel: 700, toLevel: 600, reason: "below 50%", createdAt: ago(5) });
    await repo.create("FluencyCheck", { studentId: A, wcpm: 90, checkedAt: ago(30) });
    await repo.create("FluencyCheck", { studentId: A, wcpm: 70, checkedAt: ago(3) });
    // B: weekly checks swing up and down → Watch
    for (const [i, pct] of [50, 80, 50, 80, 50].entries()) await repo.create("WeeklyCheck", { studentId: B, week: ago(35 - i * 7).toISOString().slice(0, 10), assignmentId: `a${i}`, correct: pct / 10, total: 10, completedAt: ago(35 - i * 7) });
    // C: writing score up 25 points → Good news
    for (const [i, pct] of [50, 75].entries()) {
      const task = await repo.create("WritingTask", { schoolId, classId, title: `Essay ${i}`, prompt: "Write.", createdById: teacher.userId, createdAt: ago(40 - i * 20) });
      await repo.create("WritingSubmission", { taskId: s(task.id), studentId: C, status: "SCORED", scorePct: pct, returnedAt: ago(40 - i * 20), updatedAt: now });
    }
    // E: no practice for 20 days (an old account) and a falling weekly check → Urgent
    await repo.updateMany("Student", { id: E }, { createdAt: ago(90) });
    for (const [i, pct] of [80, 65].entries()) await repo.create("WeeklyCheck", { studentId: E, week: ago(20 - i * 7).toISOString().slice(0, 10), assignmentId: `e${i}`, correct: pct / 5, total: 20, completedAt: ago(20 - i * 7) });
    const sk = (await repo.findMany("Skill", {}, { select: ["id"], take: 1 }))[0];
    await repo.create("StudentSkillMastery", { studentId: E, skillId: sk.id, score: 30, attempts: 10, lastPracticedAt: ago(20), updatedAt: ago(20) });
    clearEarlyWarningCache(repo);
  });

  test("class view: Urgent first, why in plain words, a sparkline per measure", async () => {
    const v = await earlyWarning(repo, teacher, { classId }, now);
    assert.equal(v.classId, classId);
    assert.equal(v.isAdmin, false);
    const by = new Map(v.rows.map((r) => [r.studentId, r]));
    assert.equal(by.get(A)?.severity, "URGENT");
    assert.match(by.get(A)!.reason, /ReadRise level down 2 levels/);
    assert.match(by.get(A)!.reason, /fluency −20 words per minute/i);
    assert.deepEqual(by.get(A)!.measures.find((m) => m.key === "READRISE")!.points.map((p) => p.v), [800, 700, 600], "the ReadRise line: placement, then each change");
    assert.equal(by.get(B)?.severity, "WATCH");
    assert.match(by.get(B)!.reason, /weekly checks swinging up and down/i);
    assert.equal(by.get(C)?.severity, "GOOD");
    assert.equal(by.get(E)?.severity, "URGENT");
    assert.match(by.get(E)!.reason, /no practice for 20 days/);
    const order = v.rows.map((r) => r.severity);
    assert.deepEqual(order, [...order].sort((a, b) => ["URGENT", "WATCH", "GOOD"].indexOf(a) - ["URGENT", "WATCH", "GOOD"].indexOf(b)), "Urgent first");
    assert.ok(v.counts.URGENT >= 2 && v.counts.WATCH >= 1 && v.counts.GOOD >= 1);
    assert.ok(v.dropping.some((d) => d.key === "READRISE"), "which measures drop most");
    assert.ok(v.rows.every((r) => r.classId === classId), "own class only");
    assert.deepEqual(v.unhandled, [], "the admin's list is not shown to a teacher");
  });

  test("ONE notification per new Urgent (the alert scan); no spam on the next scan", async () => {
    await scanAlerts(repo, admin.schoolId!, now, true);
    const open = await repo.findMany("StudentAlert", { studentId: A, kind: EW_KIND, status: "OPEN" });
    assert.equal(open.length, 1, "one open early-warning alert for the urgent student");
    const notes = async () => (await repo.findMany("Notification", { userId: teacher.userId })).filter((n) => s(n.link).includes("early-warning"));
    assert.equal((await notes()).length, 1);
    assert.match(s((await notes())[0].title), /urgent/);
    await scanAlerts(repo, admin.schoolId!, new Date(now.getTime() + 3_600_000), true);
    assert.equal((await notes()).length, 1, "still one: the open alert is refreshed, not raised again");
    assert.equal((await repo.findMany("StudentAlert", { studentId: A, kind: EW_KIND })).length, 1);
    assert.ok((await alertList(repo, teacher, { status: "OPEN" }, now)).some((a) => a.kind === EW_KIND && a.studentId === A), "it is an alert like the others");
  });

  test("handled students leave the list (the alert follow-up); a changed situation brings them back", async () => {
    await assert.rejects(handleEarlyWarning(repo, teacher, A, "x", now), /few words/);
    await handleEarlyWarning(repo, teacher, A, "Called the parent", now);
    const a = (await repo.findMany("StudentAlert", { studentId: A, kind: EW_KIND }))[0];
    assert.equal(a.status, "HANDLED");
    assert.equal(a.action, "Called the parent");
    await handleEarlyWarning(repo, teacher, B, "Talked with the student", now); // a Watch student: an alert is made and handled
    const v = await earlyWarning(repo, teacher, { classId }, now);
    assert.ok(!v.rows.some((r) => r.studentId === A || r.studentId === B));
    assert.ok(v.handledHidden >= 2);
    const c = v.rows.find((r) => r.studentId === C)!;
    assert.equal(c.lastAction, null);
    // the situation changes (now the weekly checks drop too): A is back, with the last teacher action
    for (const [i, pct] of [90, 60].entries()) await repo.create("WeeklyCheck", { studentId: A, week: ago(10 - i * 7).toISOString().slice(0, 10), assignmentId: `w${i}`, correct: pct / 10, total: 10, completedAt: ago(10 - i * 7) });
    clearEarlyWarningCache(repo);
    const back = (await earlyWarning(repo, teacher, { classId }, now)).rows.find((r) => r.studentId === A);
    assert.ok(back, "back on the list");
    assert.equal(back!.lastAction?.text, "Called the parent");
  });

  test("admin: the whole school, filters by grade / class / teacher, urgent not handled 7+ days", async () => {
    // D: an urgent alert left open for 9 days (the scan would close it: D is not urgent now — so it is made after the scans)
    await repo.create("StudentAlert", { schoolId: admin.schoolId, classId, studentId: D, kind: EW_KIND, key: `${EW_KIND}|URGENT|old|2026-W01`, detail: "🔴 Urgent: old.", status: "OPEN", createdAt: ago(9) });
    const v = await earlyWarning(repo, admin, {}, now);
    assert.equal(v.isAdmin, true);
    assert.ok(v.classes.length >= 4);
    assert.ok(v.byClass.some((c) => c.classId === classId && c.urgent >= 1));
    assert.ok(v.unhandled.some((u) => u.studentId === D && u.days >= 7), "urgent not handled for 7+ days");
    assert.ok((await urgentUnhandledCount(repo, admin.schoolId!, now)) >= 1);
    const g5 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 5 }))[0];
    const five = await earlyWarning(repo, admin, { gradeId: s(g5.id) }, now);
    assert.ok(!five.rows.some((r) => r.classId === classId) && !five.unhandled.some((u) => u.studentId === D), "grade filter");
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    const mine = await earlyWarning(repo, admin, { teacherId: s(t!.id) }, now);
    assert.ok(mine.rows.length > 0 && mine.rows.every((r) => r.classId === classId), "teacher filter");
    const one = await earlyWarning(repo, admin, { classId }, now);
    assert.equal(one.classId, classId);
  });

  test("staff only: students never; a teacher never sees another class", async () => {
    await assert.rejects(earlyWarning(repo, student, {}, now), ForbiddenError);
    await assert.rejects(earlyWarning(repo, teacher, { classId: otherClass }, now), ForbiddenError);
    await assert.rejects(handleEarlyWarning(repo, other, C, "Talked with the student", now), ForbiddenError);
    await assert.rejects(handleEarlyWarning(repo, student, C, "Talked with the student", now), ForbiddenError);
  });

  test("downloads: Excel and PDF for a class; the school file for the admin only", async () => {
    let html = "";
    const pdf: PdfRenderer = { render: async (h) => { html = h; return new TextEncoder().encode("%PDF-fake"); }, close: async () => {} };
    const deps = { repo, pdf, fontDir: join(ROOT, "assets/fonts"), brandingDir: tmpdir(), now: () => now };
    const xl = await exportReport(deps, teacher, parseReportRequest(new URLSearchParams({ kind: "warning", format: "xlsx", scope: "class", classId })));
    assert.ok(xl.bytes.length > 1000);
    assert.equal(xl.doc.title, "Early Warning");
    const rows = tableById(xl.doc, "students")!.rows;
    assert.ok(rows.some((r) => r.severity === "Urgent"), "Urgent rows in the file");
    assert.ok(rows.every((r) => typeof r.reason === "string" && s(r.reason).length > 0));
    const p = await exportReport(deps, teacher, parseReportRequest(new URLSearchParams({ kind: "warning", format: "pdf", scope: "class", classId })));
    assert.equal(p.contentType, "application/pdf");
    assert.match(html, /Early Warning/);
    const sch = await exportReport(deps, admin, parseReportRequest(new URLSearchParams({ kind: "warning", format: "xlsx", scope: "school" })));
    assert.ok(tableById(sch.doc, "unhandled")!.rows.length >= 1);
    await assert.rejects(exportReport(deps, teacher, parseReportRequest(new URLSearchParams({ kind: "warning", format: "xlsx", scope: "school" }))), ForbiddenError);
    await assert.rejects(exportReport(deps, teacher, parseReportRequest(new URLSearchParams({ kind: "warning", format: "xlsx", scope: "class", classId: otherClass }))), ForbiddenError);
    await assert.rejects(exportReport(deps, student, parseReportRequest(new URLSearchParams({ kind: "warning", format: "xlsx", scope: "class", classId }))));
  });

  test("a fixed number of queries per round of students (no query per student)", async () => {
    const count = async () => {
      let n = 0;
      const counting = new Proxy(repo as unknown as Repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); if (typeof v !== "function") return v; return (...args: unknown[]) => { if (["findMany", "findUnique", "count", "groupCount"].includes(String(prop))) n++; return (v as (...a: unknown[]) => unknown).apply(target, args); }; } });
      await schoolEarlyWarning(counting, admin.schoolId!, now, true);
      return n;
    };
    const before = await count();
    // more data for more students does not mean more queries
    for (const id of [B, C, D]) for (const [i, w] of [90, 60].entries()) await repo.create("FluencyCheck", { studentId: id, wcpm: w, checkedAt: ago(20 - i * 10) });
    const after = await count();
    assert.equal(after, before, `queries: ${before} → ${after}`);
    assert.ok(before <= 60, `bounded: ${before} queries for the demo school (one round)`);
  });

  test("Reports tile, admin tool, translations, page files", () => {
    const r = REPORTS.find((x) => x.key === "early-warning")!;
    assert.equal(r.title, "🚨 Early warning");
    assert.ok(isUiString(r.title) && isUiString(r.hint));
    assert.ok(r.files!({ classId: "c1", period: "term", scope: "class" }).some((f) => /format=pdf/.test(f.href)) && r.files!({ classId: "c1", period: "term", scope: "class" }).some((f) => /format=xlsx/.test(f.href)));
    assert.ok(ADMIN_TOOLS.some((x) => x.href === "/teacher/reports"), "the admin opens it from Reports");
    for (const k of ["Urgent", "Watch", "Good news", "Mark handled", "Make a plan", "Assign practice", "Last teacher action", "Skill average", "ReadRise level"]) assert.ok(isUiString(k), k);
    const page = readFileSync(join(ROOT, "src/app/teacher/reports/early-warning/page.tsx"), "utf8");
    assert.deepEqual(page.split("\n").filter((l) => l.startsWith("export ")).map((l) => l.split("(")[0].split(" =")[0]), ["export const metadata", "export default async function EarlyWarningPage"], "a page exports only Next page fields");
    assert.match(page, /requireActor\(\{ roles: \["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"\]/, "staff only");
    const home = readFileSync(join(ROOT, "src/app/admin/page.tsx"), "utf8");
    assert.match(home, /href="\/teacher\/reports\/early-warning"/, "a shortcut on the admin home");
    assert.match(home, /Urgent students not handled for 7\+ days/, "and a 'needs your attention' card when urgent students wait 7+ days");
  });

  // r87: a class with no trend data yet (the usual demo-school state: structure but no activity) used to render
  // as a grid of zero tiles, read as broken. The page now tells the teacher/admin plainly that nothing is flagged,
  // distinct from "you do not teach any class yet".
  test("a class with no rows, drops, moves or (for admins) unhandled list reads as 'nothing flagged', not a wall of zeros", () => {
    const page = readFileSync(join(ROOT, "src/app/teacher/reports/early-warning/page.tsx"), "utf8");
    assert.match(page, /nothingFlagged/, "a dedicated empty-but-taught case, not folded into the no-class case");
    assert.match(page, /No students currently flagged/);
    assert.ok(isUiString("No students currently flagged"));
    assert.ok(isUiString("Nothing to show yet. A pattern needs at least two results over time (MAP, checks, tests or practice) for a measure — it will fill in as the class takes tests and practises on the platform."));
  });
});
