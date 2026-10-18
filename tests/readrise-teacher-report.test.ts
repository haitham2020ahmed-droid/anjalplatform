/**
 * 📋 The teacher's ReadRise report (owner r69 item 4): each student's level line (placements + changes) with the
 * end-of-year ESTIMATE, the three reading checks, "Stuck" and "Rising fast", class accuracy by question type,
 * unreliable runs, downloads; the reports hub "Programs → ReadRise" opens it; never called a Lexile.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { ensureRRStudent } from "../src/server/readrise/engine";
import { finishReading, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { RISING_GAIN, STUCK_DAYS, accuracyByType, levelOn, movement, readRiseTeacherReport } from "../src/server/readrise/teacher-report";
import { HUB_LINKS } from "../src/components/teacher/report-catalog";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { exportReport, parseReportRequest } from "../src/server/reports/service";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z");
const at = (d: number, h = 0) => new Date(T0.getTime() + d * DAY + h * 3_600_000);
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
const SKILLS = ["central-idea", "detail", "inference", "vocabulary", "text-structure", "author-purpose", "cause-effect", "detail"];
const careful = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 20_000 * (i + 1)]));
const rushed = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 20_000 + 400 * i]));
const ROOT = process.cwd();

async function makeArticle(repo: SqliteRepo, code: string): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body: `Bees ${"make honey ".repeat(150)}`, wordCount: 301, estLevel: level });
  for (const band of ["LOW", "MID", "HIGH"]) for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `Q${n}?`, options: ["r", "w", "w", "w"], answer: "A", skill: SKILLS[n - 1] });
  return id;
}

describe("📋 ReadRise teacher report", () => {
  test("pure: level on a day, stuck / rising, accuracy by question type without rapid answers", () => {
    const pts = [{ at: at(0).toISOString(), level: 700, kind: "PLACEMENT" as const }, { at: at(10).toISOString(), level: 750, kind: "UP" as const }, { at: at(30).toISOString(), level: 850, kind: "PLACEMENT" as const }];
    assert.equal(levelOn(pts, at(-1).getTime()), null);
    assert.equal(levelOn(pts, at(12).getTime()), 750);
    assert.deepEqual(movement(pts, at(40)), { lastChangeAt: pts[2].at, daysSinceChange: 10, gain4w: 100 }, "rising: +100 in 4 weeks");
    assert.equal(movement(pts, at(70)).daysSinceChange, 40, "stuck after 28+ days");
    assert.deepEqual([STUCK_DAYS, RISING_GAIN], [28, 100]);
    const key = new Map([["a1", [{ band: "MID", number: 1, answer: "A", skill: "inference" }, { band: "MID", number: 2, answer: "B", skill: "Main Idea" }, { band: "LOW", number: 1, answer: "A", skill: "detail" }]]]);
    const acc = accuracyByType([{ articleId: "a1", band: "MID", answers: { 1: "A", 2: "A" }, rapid: [] }, { articleId: "a1", band: "MID", answers: JSON.stringify({ 1: "B", 2: "B" }), rapid: [2] }], key);
    assert.deepEqual(acc.map((x) => [x.type, x.correct, x.total, x.pct]), [["central-idea", 0, 1, 0], ["inference", 1, 2, 50]], "the rapid answer is left out");
  });

  describe("demo school", () => {
    let repo: SqliteRepo; let admin: Actor; let st: Actor[]; let classId: string; let arts: string[];
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    async function read(s: Actor, articleId: string, right: number, now: Date, times = careful()) {
      const v = await startRun(repo, s, articleId, {}, now);
      await submitPrePoll(repo, s, v.runId, 1, now);
      await finishReading(repo, s, v.runId, { readSeconds: 150 }, now);
      const end = new Date(now.getTime() + 5 * 60_000);
      await submitActivity(repo, s, v.runId, answers(right), end, { at: times });
      await submitWriting(repo, s, v.runId, WRITING, end);
      await submitPostPoll(repo, s, v.runId, 2, end);
    }

    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
      admin = await actorOf("test.admin");
      const A = await actorOf("test.student.001");
      classId = String((await repo.findMany("ClassMembership", { studentId: A.studentId!, leftAt: null }))[0].classId);
      const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
      st = [];
      for (const id of ids.slice(0, 3)) { const u = await repo.findUnique("Student", { id }); st.push(await resolveActor(repo, (await repo.findUnique("User", { id: u!.userId }))!)); }
      assert.ok(st.length >= 3, "three students in the class");
      arts = [];
      for (let i = 0; i < 8; i++) arts.push(await makeArticle(repo, `TR-${i}`));
      for (const s of st) {
        await ensureRRStudent(repo, s.studentId!, at(0));
        await repo.updateMany("RRStudent", { studentId: s.studentId! }, { level: 800, startLevel: 800, source: "PLACEMENT", placedAt: at(0) });
        await repo.create("RRPlacement", { studentId: s.studentId!, schoolId: s.schoolId, startLevel: 800, steps: [], result: 800, period: "BOY", startedAt: at(0), completedAt: at(0) });
      }
      // st[0]: rising fast — three 100% readings → +50, three more → +50 (in the last 4 weeks)
      for (const [i, d] of [18, 19, 20, 30, 31, 32].entries()) await read(st[0], arts[i], 8, at(d));
      // st[1]: stuck — two middling readings early, nothing changes for 40 days
      await read(st[1], arts[0], 5, at(1));
      await read(st[1], arts[1], 5, at(2));
      // st[2]: one unreliable run (would have been −100) and one careful 50% run
      await read(st[2], arts[0], 0, at(5), rushed());
      await read(st[2], arts[1], 4, at(6));
      await afterResponseSettled();
    });

    test("one page: level lines, checks, estimate, stuck / rising, accuracy by type, unreliable runs", async () => {
      const r = await readRiseTeacherReport(repo, admin, classId, at(40));
      assert.equal(r.summary.placed, 3);
      const a = r.students.find((x) => x.studentId === st[0].studentId)!;
      assert.equal(a.level, 900);
      assert.deepEqual(a.points.map((p) => [p.level, p.kind]), [[800, "PLACEMENT"], [850, "UP"], [900, "UP"]], "placements and changes");
      assert.equal(a.checks.BOY?.level, 800);
      assert.ok(a.projected && a.projected.mid >= 900, "an end-of-year estimate from the trend");
      assert.deepEqual(r.rising.map((x) => x.studentId), [st[0].studentId], `rising: ${JSON.stringify(r.rising)}`);
      assert.ok(r.stuck.some((x) => x.studentId === st[1].studentId && x.days >= STUCK_DAYS), "stuck");
      assert.ok(!r.stuck.some((x) => x.studentId === st[0].studentId));
      const types = new Map(r.byType.map((x) => [x.type, x]));
      for (const k of ["central-idea", "detail", "inference", "vocabulary"]) assert.ok(types.has(k as never), k);
      assert.ok(r.byType.every((x) => x.total > 0 && x.pct !== null && x.pct >= 0 && x.pct <= 100));
      // the unreliable run is listed and left out of the accuracy (its 0% would pull everything down)
      assert.equal(r.unreliable.length, 1);
      assert.deepEqual([r.unreliable[0].studentId, r.unreliable[0].rapid >= 2], [st[2].studentId, true]);
      assert.equal(r.summary.unreliable, 1);
      const c = r.students.find((x) => x.studentId === st[2].studentId)!;
      assert.deepEqual([c.level, c.unreliableRuns], [800, 1], "the unreliable 0% did not move the level");
      await assert.rejects(readRiseTeacherReport(repo, st[0], classId, at(40)), ForbiddenError);
    });

    test("downloads: the class export has the reading checks, question types and unreliable readings", async () => {
      const deps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "rrtr-")), now: () => at(40) };
      const out = await exportReport(deps, admin, parseReportRequest(new URLSearchParams({ format: "csv", kind: "readrise", period: "TERM", classId })));
      const ids = out.doc.sections.flatMap((x) => (x.type === "table" ? [x.id] : []));
      for (const id of ["checks", "types", "unreliable"]) assert.ok(ids.includes(id), id);
      const checks = out.doc.sections.find((x) => x.type === "table" && x.id === "checks");
      assert.ok(checks && checks.type === "table" && checks.rows.some((r) => r.boy === 800 && r.status === "rising fast"));
      const text = Buffer.from(out.bytes).toString("utf8");
      assert.ok(!/Lexile/.test(text), "never called a Lexile");
    });
  });

  test("the page, the hub card and the tab; never 'Lexile'; translated", () => {
    const card = HUB_LINKS.find((c) => c.key === "readrise-growth");
    assert.ok(card && card.category === "Programs", "Programs → ReadRise");
    assert.equal(card!.href("c1"), "/teacher/readrise/report?class=c1");
    assert.equal(card!.title, "ReadRise report");
    assert.match(readFileSync(join(ROOT, "src/app/admin/readrise/_components/tabs.tsx"), "utf8"), /\{ href: "\/teacher\/readrise\/report", label: "📋 Report" \}/, "the ReadRise tab");
    const page = readFileSync(join(ROOT, "src/app/teacher/readrise/report/page.tsx"), "utf8");
    for (const id of ["rr-report-lines", "rr-report-stuck", "rr-report-rising", "rr-report-types", "rr-report-unreliable"]) assert.ok(page.includes(`data-testid="${id}"`), id);
    assert.match(page, /exportsOf\(\{ kind: "readrise"/, "downloads");
    for (const f of ["src/app/teacher/readrise/report/page.tsx", "src/app/student/readrise/page.tsx", "src/server/readrise/teacher-report.ts", "src/server/readrise/windows.ts"]) assert.ok(!/Lexile/.test(readFileSync(join(ROOT, f), "utf8")), `${f}: never "Lexile"`);
    const hasAr = (s: string) => (UI_STRINGS as readonly string[]).includes(s) && Boolean((ar as Record<string, string>)[s]);
    for (const s of ["ReadRise report", "Stuck", "Rising fast", "Unreliable readings", "Class accuracy by question type", "Projected end of year (estimate)", "Check your reading level", "Start of year", "Middle of year", "End of year"]) assert.ok(hasAr(s), s);
  });
});
