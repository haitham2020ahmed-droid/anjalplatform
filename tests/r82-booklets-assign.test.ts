/**
 * 🇸🇦 r82 Ministry booklets → ASSIGN (owner: "pressing Assign does nothing — let me assign from here, even several
 * booklets at once, and show the SOURCES"; fictional demo school, in-memory database):
 *  1. the list: every checkbox inside the assign form; ticking shows the sticky bar ("3 booklets selected · Assign",
 *     "Select all on this page", "Clear"); the panel: Source (NAFS preselected), class(es), whole class / chosen
 *     students, dates, time, Online / Paper; an opened booklet's Assign opens the same panel;
 *  2. the server: 1 and 3 booklets → work for the right students with source NAFS, listed on Assigned (and cancelled
 *     there = gone from the student's NAFS icon), students see it in NAFS; no class / no source → a message; a double
 *     press never gives twice; Paper → ready to print, nothing sent.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link → a plain <a>; the NAFS actions file → a no-op stand-in (static renders only)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) {
  const q = String(r);
  if (q === "next/link") return "stub:next/link";
  if (/nafs\/actions$/.test(q)) return "stub:actions";
  return orig.call(this, r, ...x);
};
const noop = async () => ({ ok: true, message: "" });
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
Module._cache["stub:actions"] = { id: "actions", filename: "actions", loaded: true, children: [], paths: [], exports: new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop) }) };
(globalThis as Record<string, unknown>).React ??= React;

import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { teacherRoster } from "../src/server/teacher/assign";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsClasses } from "../src/server/nafs/tests";
import { loadNafsBooklets, useBookletDir } from "../src/server/nafs/booklets";
import { assignBookletsTo, bookletSourceOf, MAX_ASSIGN_BOOKLETS } from "../src/server/nafs/booklet-center";
import { myNafsTests } from "../src/server/nafs/student";
import { assignedList, cancelAssignment } from "../src/server/teacher/assigned";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const s = (v: unknown) => String(v ?? "");
/** the <input> tags of the html that carry every given attribute (any order) */
const tags = (html: string, ...attrs: string[]) => (html.match(/<input[^>]*>/g) ?? []).filter((x) => attrs.every((a) => x.includes(a)));
let repo: SqliteRepo;
let g6: Actor, admin: Actor;
let klass: { id: string; name: string; students: { id: string; name: string }[] };
let asStudent: (studentId: string) => Promise<Actor>;
let ui: typeof import("../src/components/nafs/booklet-assign");

before(async () => {
  ({ repo } = await demoDatabase());
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  admin = await as("demo.admin");
  const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
  const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
  let i = grades.findIndex((g) => g.includes(6));
  if (i < 0) {
    i = 0;
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
    const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
    await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
  }
  g6 = teachers[i];
  klass = (await nafsClasses(repo, g6))[0];
  assert.ok(klass.students.length >= 3, "the Grade 6 class has students");
  asStudent = async (studentId) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  await ensureNafsFramework(repo);
  // three fixture booklets (NB-903 = a copy of NB-901 with its own code)
  const dir = mkdtempSync(join(tmpdir(), "r82-booklets-"));
  for (const f of ["NB-901.json", "NB-902.json"]) copyFileSync(join(ROOT, "tests", "fixtures", "nafs-booklets", f), join(dir, f));
  const b3 = JSON.parse(read("tests/fixtures/nafs-booklets/NB-901.json"));
  writeFileSync(join(dir, "NB-903.json"), JSON.stringify({ ...b3, code: "NB-903", title: `${b3.title} (copy)` }));
  useBookletDir(dir);
  await loadNafsBooklets(repo, admin.schoolId!, admin.userId);
  ui = await import("../src/components/nafs/booklet-assign");
});
after(() => useBookletDir(null));

const ROWS = ["NB-901", "NB-902", "NB-903"].map((code) => ({ code, title: `Booklet ${code}`, meta: "35 questions", openHref: `/teacher/nafs?tab=booklets&book=${code}`, reportHref: null }));

describe("1. the teacher's screen", () => {
  test("the list: checkboxes INSIDE the assign form; ticking shows the sticky bar", () => {
    const html = renderToStaticMarkup(React.createElement(ui.BookletPicker, { rows: ROWS, classes: [klass], minutes: 45, max: MAX_ASSIGN_BOOKLETS, initialTicked: ["NB-901", "NB-902", "NB-903"] }));
    const form = html.slice(html.indexOf('data-testid="booklet-form"'), html.lastIndexOf("</form>"));
    assert.equal(tags(form, 'type="checkbox"', 'name="b"').length, 3, "every booklet checkbox is inside the form");
    assert.match(html, /data-testid="booklet-bar"/);
    assert.match(html, /3 booklets selected/);
    assert.match(html, /Select all on this page/);
    assert.match(html, />Clear</);
    assert.match(html, /data-testid="bar-assign"[^>]*>Assign</);
    // nothing ticked: no bar
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(ui.BookletPicker, { rows: ROWS, classes: [klass], minutes: 45, max: MAX_ASSIGN_BOOKLETS })), /data-testid="booklet-bar"/);
  });

  test("the panel: Source (NAFS preselected, required), class, whole class / chosen students, dates, time, Online / Paper", () => {
    const html = renderToStaticMarkup(React.createElement(ui.BookletPicker, { rows: ROWS, classes: [klass], minutes: 45, max: MAX_ASSIGN_BOOKLETS, initialTicked: ["NB-901", "NB-902"], initialOpen: true }));
    const panel = html.slice(html.indexOf('data-testid="assign-panel"'));
    assert.ok(html.indexOf('data-testid="assign-panel"') < html.lastIndexOf("</form>"), "the panel is inside the same form as the checkboxes");
    assert.match(panel, /<select name="source" required=""/);
    assert.match(panel, /<option value="NAFS" selected="">/, "NAFS preselected in the NAFS center");
    for (const k of ["MAP", "CURRICULUM", "GRAMMAR", "RTI"]) assert.match(panel, new RegExp(`<option value="${k}"`), k);
    assert.equal(tags(panel, 'name="classId"', `value="${klass.id}"`, 'checked=""').length, 1, "the only class is chosen");
    assert.equal(tags(panel, 'name="who"', 'value="class"', 'checked=""').length, 1);
    assert.equal(tags(panel, 'name="who"', 'value="some"').length, 1);
    assert.match(panel, /name="openAt"/); assert.match(panel, /name="dueAt"/);
    assert.equal(tags(panel, 'name="minutes"', 'value="45"').length, 1);
    assert.equal(tags(panel, 'name="mode"', 'value="ONLINE"', 'checked=""').length, 1); assert.equal(tags(panel, 'name="mode"', 'value="PAPER"').length, 1);
    assert.equal(tags(panel, 'name="token"').length, 1);
    assert.match(panel, /data-testid="assign-submit"[^>]*>💻 Assign</);
  });

  test("an opened booklet's Assign opens the same panel for that booklet", () => {
    const html = renderToStaticMarkup(React.createElement(ui.OpenBookletAssign, { code: "NB-902", classes: [klass], minutes: 45, initialOpen: true }));
    assert.match(html, /data-testid="open-assign"/);
    assert.equal(tags(html, 'type="hidden"', 'name="b"', 'value="NB-902"').length, 1);
    assert.match(html, /data-testid="assign-panel"/);
    assert.match(html, /<option value="NAFS" selected="">/);
  });

  test("the tab uses the picker and the opened booklet's button (no anchor-only Assign); new words are translated", () => {
    const tab = read("src/components/nafs/booklets-tab.tsx");
    assert.match(tab, /<BookletPicker /);
    assert.match(tab, /<OpenBookletAssign /);
    assert.doesNotMatch(tab, /href="#assign"/);
    const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
    for (const x of ["Select all on this page", "{n} booklets selected", "Clear", "Assign", "Online", "Paper", "The whole class", "Chosen students", "Given to {n} students — in their NAFS icon.", "Assigning…", "Choose a class.", "Source"]) assert.ok(hasAr(x), x);
    // the action answers in the panel, never a redirect far from the button
    const act = read("src/app/teacher/nafs/actions.ts");
    const fn = act.slice(act.indexOf("export async function assignBookletsNowAction"), act.indexOf("/** One assignment's time"));
    assert.doesNotMatch(fn, /redirect\(/);
    assert.match(fn, /Choose a class\./);
  });
});

describe("2. the server", () => {
  const T0 = new Date("2026-10-15T08:00:00Z");
  let oneId = "";
  test("ONE booklet → the whole class, source NAFS; the students see it in their NAFS icon; listed on Assigned", async () => {
    const r = await assignBookletsTo(repo, g6, { codes: ["NB-901"], classIds: [klass.id], source: "NAFS", mode: "ONLINE", token: "one" }, T0);
    assert.equal(r.booklets, 1); assert.equal(r.students, klass.students.length); assert.equal(r.source, "NAFS");
    const t = await repo.findUnique("NafsTest", { id: r.tests[0].testId });
    assert.equal(bookletSourceOf(t!.settings, klass.id), "NAFS");
    const mine = await myNafsTests(repo, await asStudent(klass.students[0].id), T0);
    assert.ok(mine.some((x) => x.title.includes("NB-901")), "in the student's NAFS area");
    const v = await assignedList(repo, g6, { kind: "NAFS_TEST" }, T0);
    const row = v.items.find((x) => x.title.includes("NB-901"));
    assert.ok(row, "listed on the Assigned page");
    assert.equal(row!.detail, "NAFS", "with its source");
    assert.equal(row!.recipients, klass.students.length);
    oneId = row!.id;
  });

  test("cancelled on Assigned = gone from the student's NAFS icon; given again = back", async () => {
    const sid = klass.students[2].id;
    const has = async () => (await myNafsTests(repo, await asStudent(sid), T0)).some((x) => x.title.includes("NB-901"));
    assert.ok(await has());
    await cancelAssignment(repo, g6, "NAFS_TEST", oneId, null, T0);
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(!(await has()), "cancelled: hidden in NAFS");
    await assignBookletsTo(repo, g6, { codes: ["NB-901"], classIds: [klass.id], source: "NAFS", mode: "ONLINE", token: "again" }, T0);
    assert.ok(await has(), "given again: back");
    const n = await repo.count("AssignmentCancel", { kind: "NAFS_TEST", refId: oneId, restoredAt: null });
    assert.equal(n, 0);
    assert.equal(s((await assignedList(repo, g6, { kind: "NAFS_TEST" }, T0)).items.find((x) => x.id === oneId)?.status), "OPEN");
  });

  test("THREE booklets → chosen students only, one batch of notifications, all on Assigned", async () => {
    const [a, b] = klass.students;
    const before = await repo.count("Notification", {});
    const r = await assignBookletsTo(repo, g6, { codes: ["NB-901", "NB-902", "NB-903"], classIds: [klass.id], studentIds: [a.id, b.id], source: "NAFS", mode: "ONLINE", minutes: 50, token: "three" }, T0);
    assert.equal(r.booklets, 3); assert.equal(r.students, 2);
    assert.equal(await repo.count("Notification", {}) - before, 2, "one notification per student for the three booklets");
    const v = await assignedList(repo, g6, { kind: "NAFS_TEST" }, T0);
    for (const code of ["NB-901", "NB-902", "NB-903"]) {
      const row = v.items.find((x) => x.title.includes(code));
      assert.ok(row, code);
      assert.equal(row!.scope, "students"); assert.equal(row!.recipients, 2);
    }
    const third = klass.students[2];
    const seen = await myNafsTests(repo, await asStudent(third.id), T0);
    assert.ok(!seen.some((x) => x.title.includes("NB-903")), "a student who was not chosen does not get it");
    const got = await myNafsTests(repo, await asStudent(a.id), T0);
    for (const code of ["NB-901", "NB-902", "NB-903"]) assert.ok(got.some((x) => x.title.includes(code)), code);
    assert.equal(got.find((x) => x.title.includes("NB-902"))!.minutes, 50);
  });

  test("a double press never gives twice (same token: the first answer; two at once: one test, one row)", async () => {
    const tests0 = await repo.count("NafsTest", {});
    const rows0 = await repo.count("NafsTestClass", {});
    const n0 = await repo.count("Notification", {});
    const input = { codes: ["NB-902"], classIds: [klass.id], source: "NAFS", mode: "ONLINE" as const, token: "double-1" };
    const [x, y] = await Promise.all([assignBookletsTo(repo, g6, input, T0), assignBookletsTo(repo, g6, input, T0)]);
    assert.deepEqual(x, y);
    assert.equal(await repo.count("NafsTest", {}), tests0, "no second test of the booklet");
    assert.equal(await repo.count("NafsTestClass", {}), rows0, "the class row is the same one");
    assert.equal(await repo.count("Notification", {}) - n0, klass.students.length, "the students are told once");
  });

  test("refusals come back as readable messages: no class, no source, too many booklets, students of another class", async () => {
    await assert.rejects(assignBookletsTo(repo, g6, { codes: ["NB-901"], classIds: [], source: "NAFS", mode: "ONLINE" }), (e: Error) => e instanceof ValidationError && e.message === "Choose a class.");
    await assert.rejects(assignBookletsTo(repo, g6, { codes: ["NB-901"], classIds: [klass.id], source: "", mode: "ONLINE" }), (e: Error) => e instanceof ValidationError && /Choose the source/.test(e.message));
    await assert.rejects(assignBookletsTo(repo, g6, { codes: Array.from({ length: MAX_ASSIGN_BOOKLETS + 1 }, (_x, i) => `NB-${800 + i}`), classIds: [klass.id], source: "NAFS", mode: "ONLINE" }), ValidationError);
    await assert.rejects(assignBookletsTo(repo, g6, { codes: ["NB-901"], classIds: [klass.id], studentIds: ["not-a-student"], source: "NAFS", mode: "ONLINE" }), ValidationError);
    await assert.rejects(assignBookletsTo(repo, g6, { codes: [], classIds: [klass.id], source: "NAFS", mode: "ONLINE" }), ValidationError);
  });

  test("another source chosen by the teacher is kept (Assigned shows it)", async () => {
    await assignBookletsTo(repo, g6, { codes: ["NB-903"], classIds: [klass.id], source: "CURRICULUM", mode: "ONLINE", token: "cur" }, T0);
    const v = await assignedList(repo, g6, { kind: "NAFS_TEST" }, T0);
    assert.equal(v.items.find((x) => x.title.includes("NB-903"))!.detail, "Curriculum");
  });

  test("Paper: ready to print (the tests exist), nothing sent to the students", async () => {
    const n0 = await repo.count("Notification", {});
    const r = await assignBookletsTo(repo, g6, { codes: ["NB-901", "NB-902"], classIds: [], source: "NAFS", mode: "PAPER" }, T0);
    assert.equal(r.mode, "PAPER"); assert.equal(r.tests.length, 2); assert.equal(r.students, 0);
    assert.equal(await repo.count("Notification", {}), n0);
  });

});
