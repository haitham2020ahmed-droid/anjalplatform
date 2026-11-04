/**
 * ⭐👁️🕒 Daily-reports consolidation, part 2 (Oct 2026): per-teacher favourite reports (TeacherReportFavorite),
 * a student watchlist (StudentWatch) and the "hasn't opened Early warning" follow-up warning — FAKE data only
 * (in-memory Test School).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { favoriteReportsFor, toggleFavoriteReport } from "../src/server/teacher/favorites";
import { toggleWatchStudent, watchedStudentsFor } from "../src/server/teacher/watchlist";
import { EARLY_WARNING_CHECKIN_DAYS, recordEarlyWarningView, teacherFollowup } from "../src/server/insights/teacher-followup";
import { isReportKey, parseReportKey, REPORT_KEYS } from "../src/lib/report-keys";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;

describe("⭐ Favourite reports", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher2: Actor;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await actorFor("test.teacher.1"); teacher2 = await actorFor("test.teacher.2");
  });

  test("report-keys: the small enum parses/guards correctly", () => {
    for (const k of REPORT_KEYS) { assert.ok(isReportKey(k)); assert.equal(parseReportKey(k.toLowerCase()), k); }
    for (const bad of [null, undefined, "", "CUSTOM", 42]) { assert.equal(isReportKey(bad), false); assert.equal(parseReportKey(bad), null); }
  });

  test("toggle: favourite, then un-favourite, is idempotent and per-teacher", async () => {
    assert.deepEqual(await favoriteReportsFor(repo, teacher), []);
    const r1 = await toggleFavoriteReport(repo, teacher, "EARLY_WARNING");
    assert.equal(r1.favorited, true);
    assert.deepEqual(await favoriteReportsFor(repo, teacher), ["EARLY_WARNING"]);
    assert.deepEqual(await favoriteReportsFor(repo, teacher2), [], "another teacher's favourites are separate");
    const r2 = await toggleFavoriteReport(repo, teacher, "EARLY_WARNING");
    assert.equal(r2.favorited, false);
    assert.deepEqual(await favoriteReportsFor(repo, teacher), []);
  });

  test("rejects an unknown report key", async () => {
    await assert.rejects(toggleFavoriteReport(repo, teacher, "NOT_A_REPORT"));
  });
});

describe("👁️ Student watchlist", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher2: Actor; let studentId = "";

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    teacher2 = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const c = (await readableClasses(repo, teacher))[0];
    studentId = String((await repo.findMany("ClassMembership", { classId: c.id, leftAt: null }))[0].studentId);
  });

  test("toggle: watch, then un-watch, with an optional note", async () => {
    assert.deepEqual(await watchedStudentsFor(repo, teacher), []);
    const r1 = await toggleWatchStudent(repo, teacher, studentId, "A bit worried this term.");
    assert.equal(r1.watching, true);
    const list = await watchedStudentsFor(repo, teacher);
    assert.equal(list.length, 1);
    assert.equal(list[0].studentId, studentId);
    assert.equal(list[0].note, "A bit worried this term.");
    const r2 = await toggleWatchStudent(repo, teacher, studentId);
    assert.equal(r2.watching, false);
    assert.deepEqual(await watchedStudentsFor(repo, teacher), []);
  });

  test("a teacher cannot watch a student outside their own classes", async () => {
    await assert.rejects(toggleWatchStudent(repo, teacher2, studentId));
  });

  test("a note longer than 200 chars is trimmed, not rejected", async () => {
    const long = "x".repeat(250);
    await toggleWatchStudent(repo, teacher, studentId, long);
    const list = await watchedStudentsFor(repo, teacher);
    assert.equal(list[0].note?.length, 200);
    await toggleWatchStudent(repo, teacher, studentId); // clean up (un-watch)
  });
});

describe("🕒 Early warning check-in follow-up", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor;
  const now = new Date(Date.UTC(2026, 10, 27, 8));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
  });

  test("recordEarlyWarningView writes one AuditLog row for a teacher, none for a non-teacher", async () => {
    const before = (await repo.findMany("AuditLog", { action: "early_warning.view" })).length;
    await recordEarlyWarningView(repo, teacher, now);
    assert.equal((await repo.findMany("AuditLog", { action: "early_warning.view" })).length, before + 1);
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!).catch(() => null);
    if (admin) { await recordEarlyWarningView(repo, admin, now); assert.equal((await repo.findMany("AuditLog", { action: "early_warning.view" })).length, before + 1, "non-teacher: no-op"); }
  });

  test("EARLY_WARNING_CHECKIN_DAYS is a small, sane threshold", () => {
    assert.ok(EARLY_WARNING_CHECKIN_DAYS >= 1 && EARLY_WARNING_CHECKIN_DAYS <= 14);
  });

  test("teacherFollowup still returns rows and warnings as an array for every teacher (shape, not exact content — content depends on seeded demo data)", async () => {
    const { rows } = await teacherFollowup(repo, admin, now);
    assert.ok(Array.isArray(rows));
    for (const r of rows) assert.ok(Array.isArray(r.warnings));
  });
});

describe("i18n coverage (new strings)", () => {
  test("no duplicate interface strings, and the new strings this update added are translated", () => {
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
    for (const k of ["Pinned", "Pin reports to the top", "Watchlist", "Add to watchlist", "Note (optional)", "Student"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok((ar as Record<string, string>)[k], k);
    }
  });
});
