/**
 * 🖨 The print kit: one design for every printed / exported document. Checks the kit (header band, colours kept,
 * tables that never split rows), the class accounts sheet (every row, QR, cut lines), the sign-in cards (8 a page),
 * the accounts Excel (one sheet per class, same columns), the certificate (name, landscape, seal, no dir on SVG)
 * and the weekly family summary (plain words, one page per student, the class teacher and the admin only).
 * Fake names only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { PRINT_CSS, PrintHeader, PrintSection, PrintTable } from "../src/components/print/print-kit";
import { AccountSheet, SignInCards, type AccountEntry } from "../src/components/print/accounts";
import { certificateDocument, sealSvg } from "../src/components/print/certificate";
import { WeeklySummaryPage } from "../src/components/print/weekly-summary-sheet";
import { SOURCE_COLORS } from "../src/components/print/tokens";
import { ACCENTS } from "../src/reports/html";
import { weeklySummaries, snapshotOf, tipFor } from "../src/reports/weekly-summary";
import { accountsWorkbookXlsx, sheetName, type ClassAccounts } from "../src/server/teacher/class-accounts";
import { readXlsx } from "../src/imports/xlsx";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { translate } from "../src/i18n";
import { demoDatabase } from "./helpers/db";

const h = React.createElement;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const count = (s: string, needle: string) => s.split(needle).length - 1;
const fake = (n: number, cls = "4A"): AccountEntry[] => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, name: i === 1 ? "سارة أحمد" : `Test Pupil ${i + 1}`, username: `pupil.${i + 1}`, number: "", password: i === 2 ? null : `pupil.${i + 1}`, className: cls, grade: 4 }));

describe("🖨 print kit", () => {
  test("the header band: Al-Anjal, the school, the title and the date; source colours below", () => {
    const out = html(h(PrintHeader, { title: "Class accounts", school: "Demo School", date: new Date("2026-10-11T10:00:00Z") }));
    for (const x of ["pk-head", "Al-<i>Anjal</i>", "Demo School", "Class accounts", "11 Oct 2026"]) assert.ok(out.includes(x), x);
    for (const c of Object.values(SOURCE_COLORS)) assert.ok(out.includes(c), c);
    assert.deepEqual(ACCENTS, SOURCE_COLORS, "the PDF reports use the same source colours");
  });

  test("colours print, rows never split, header row repeats, A4 pages, rounded coloured section headers", () => {
    for (const r of [/print-color-adjust:exact/, /-webkit-print-color-adjust:exact/, /\.pk-table tr\{break-inside:avoid/, /thead\{display:table-header-group\}/, /\.pk-page\+\.pk-page\{break-before:page/, /\.pk-sec-h\{[^}]*border-radius:12px/, /@page pk-landscape\{size:A4 landscape/]) assert.match(PRINT_CSS, r);
    const sec = html(h(PrintSection, { title: "Badges", accent: "map", children: h(PrintTable, { cols: [{ key: "a", label: "A" }], rows: [{ id: "1", cells: { a: "x" } }, { id: "2", cells: { a: "y" } }] }) }));
    assert.ok(sec.includes(SOURCE_COLORS.map) && sec.includes("<thead>") && count(sec, "<tr>") === 3);
    const css = read("src/app/globals.css");
    const print = css.slice(css.indexOf("/* paper: no menus"));
    assert.match(print, /@page \{ size: A4 portrait;[^}]*@bottom-right \{ content: counter\(page\)/, "page numbers where supported");
    assert.match(print, /aside, nav, dialog, \[role="dialog"\], header\.sticky[^{]*button[^{]*\{ display: none !important; \}/, "no menus or buttons on paper");
  });
});

describe("🪪 accounts sheet and sign-in cards", () => {
  test("the class sheet: class, teacher, grade at the top; every row with #, name (dir=auto), username, password, QR", () => {
    const rows = fake(15);
    const out = html(h(AccountSheet, { classes: [{ className: "4A", grade: 4, teacher: "Ms Test Teacher", rows }], school: "Demo School", base: "https://anjal.example" }));
    assert.equal(count(out, 'data-pk="account-row"'), 15, "all rows");
    for (const r of rows) assert.ok(out.includes(r.username), r.username);
    for (const x of ["Ms Test Teacher", "4A", "Grade", "ask your teacher", "anjal.example"]) assert.ok(out.includes(x), x);
    assert.ok(out.includes('dir="auto"><bdi>سارة أحمد</bdi>'), "Arabic names keep their direction");
    assert.equal(count(out, "<svg"), 15, "one QR per student");
    assert.doesNotMatch(out, /<svg[^>]*\sdir=/, "never dir on svg");
    assert.ok(!out.includes("pk-cutrows"));
    const cut = html(h(AccountSheet, { classes: [{ className: "4A", grade: 4, rows }], school: "S", base: "https://x.example", cut: true }));
    assert.ok(cut.includes("pk-cutrows") && cut.includes("Cut here"));
  });

  test("sign-in cards: 8 per page, name, class, username, password, QR, website", () => {
    const out = html(h(SignInCards, { cards: fake(10), school: "Demo School", base: "https://anjal.example" }));
    assert.equal(count(out, 'data-pk="card"'), 10);
    assert.equal(count(out, 'data-pk="page"'), 2, "8 + 2");
    for (const x of ["Test Pupil 1", "pupil.10", "Website", "anjal.example", "Grade 4", "pk-cardcell"]) assert.ok(out.includes(x), x);
    assert.doesNotMatch(out, /<svg[^>]*\sdir=/);
  });

  test("Excel: one sheet per class, the same three columns, safe sheet names", () => {
    const a = (name: string, n: number): ClassAccounts => ({ classId: name, className: name, grade: 4, schoolName: "S", rows: Array.from({ length: n }, (_, i) => ({ userId: `${name}${i}`, studentId: `${name}s${i}`, name: `Pupil ${i}`, username: `${name.toLowerCase()}.${i}`, number: "", password: i ? `${name.toLowerCase()}.${i}` : null })) });
    const buf = Buffer.from(accountsWorkbookXlsx([a("4A", 3), a("4B", 2)]));
    const s1 = readXlsx(buf, { sheet: "4A" }), s2 = readXlsx(buf, { sheet: "4B" });
    assert.deepEqual(s1[0], ["Student Name", "Username", "Password"]);
    assert.equal(s1.length, 4); assert.equal(s2.length, 3);
    assert.equal(s1[1][2], "set by admin / reset to show");
    const used = new Set<string>();
    assert.equal(sheetName("5/B: [x]", used), "5 B x");
    assert.equal(sheetName("5/B: [x]", used), "5 B x (2)");
    assert.ok(sheetName("x".repeat(50), used).length <= 31);
  });

  test("both account pages use the kit (not the old cards)", () => {
    for (const f of ["src/app/teacher/accounts/page.tsx", "src/app/admin/student-cards/page.tsx"]) {
      const src = read(f);
      assert.match(src, /<AccountSheet/); assert.match(src, /<SignInCards/); assert.doesNotMatch(src, /<LoginCards/);
    }
  });
});

describe("📜 certificate", () => {
  test("landscape A4 with the name, the achievement, the date, the school, a signature line and an SVG seal", () => {
    const doc = certificateDocument({ lang: "en", title: "Certificate of Achievement", presented: "This certificate is proudly presented to", forWord: "for", studentName: "Test <Pupil> One", achievement: "Star reader", date: "11 October 2026", dateLabel: "Date", signLabel: "Teacher's signature", school: "Demo School" }, { css: "", stack: "sans-serif" });
    for (const x of ["@page{size:A4 landscape", "Test &lt;Pupil&gt; One", "Star reader", "11 October 2026", "Demo School", "Teacher&#39;s signature", 'class="seal"', "Al-<i>Anjal</i>"]) assert.ok(doc.includes(x), x);
    assert.doesNotMatch(doc, /<script/i);
    assert.doesNotMatch(doc, /<svg[^>]*\sdir=/);
    assert.doesNotMatch(sealSvg(), /\sdir=/);
  });
});

describe("👪 weekly family summary", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let student: Actor;
  let myClass: string; let otherClass: string; let mine: string; let notMine: string;
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher, other] = await Promise.all(["test.admin", "test.teacher.1", "test.teacher.2"].map(as));
    const t1 = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    const t2 = (await repo.findUnique("Teacher", { userId: other.userId }))!;
    const c1 = (await repo.findMany("ClassTeacher", { teacherId: t1.id })).map((x) => String(x.classId));
    const c2 = (await repo.findMany("ClassTeacher", { teacherId: t2.id })).map((x) => String(x.classId)).filter((c) => !c1.includes(c));
    myClass = c1[0]; otherClass = c2[0];
    mine = String((await repo.findMany("ClassMembership", { classId: myClass, leftAt: null }))[0].studentId);
    notMine = String((await repo.findMany("ClassMembership", { classId: otherClass, leftAt: null }))[0].studentId);
    const st = (await repo.findUnique("Student", { id: mine }))!;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    const now = new Date();
    await repo.create("PracticeSession", { studentId: mine, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(now.getTime() - 86_400_000), activeMs: 25 * 60_000 });
    const badge = await repo.upsert("Badge", { code: "first-steps" }, { code: "first-steps", name: "First Steps", description: "x", criteria: {} });
    await repo.create("StudentBadge", { studentId: mine, badgeId: badge.id, awardedAt: now });
  });

  test("the class teacher and the admin only; other teachers and students cannot open it (server check)", async () => {
    const one = await weeklySummaries(repo, teacher, { studentId: mine });
    assert.equal(one.items.length, 1);
    assert.equal(one.items[0].minutes, 25);
    assert.deepEqual(one.items[0].badges.map((b) => b.name), ["First Steps"]);
    assert.ok((await weeklySummaries(repo, admin, { studentId: mine })).items.length === 1);
    await assert.rejects(weeklySummaries(repo, teacher, { studentId: notMine }), ForbiddenError);
    await assert.rejects(weeklySummaries(repo, teacher, { classId: otherClass }), ForbiddenError);
    await assert.rejects(weeklySummaries(repo, student, { studentId: mine }), ForbiddenError);
    const t2 = (await repo.findUnique("Teacher", { userId: other.userId }))!;
    if (!(await repo.findUnique("ClassTeacher", { classId: myClass, teacherId: t2.id }))) await assert.rejects(weeklySummaries(repo, other, { studentId: mine }), ForbiddenError);
  });

  test("batch print: the whole class, one page per student", async () => {
    const batch = await weeklySummaries(repo, teacher, { classId: myClass });
    const members = await repo.count("ClassMembership", { classId: myClass, leftAt: null });
    assert.equal(batch.items.length, members);
    const out = batch.items.map((w) => html(h(WeeklySummaryPage, { w, batch }))).join("");
    assert.equal(count(out, 'data-pk="page"'), members);
  });

  test("plain words: growing / on track / strong, never level names; English and Arabic", async () => {
    assert.equal(snapshotOf(85), "Strong"); assert.equal(snapshotOf(65), "On track"); assert.equal(snapshotOf(40), "Growing"); assert.equal(snapshotOf(null), "Not this week");
    const batch = await weeklySummaries(repo, teacher, { studentId: mine });
    const en = html(h(WeeklySummaryPage, { w: batch.items[0], batch }));
    for (const x of ["Weekly family summary", "Minutes practised", "Reading snapshot", "One tip for home", "First Steps", "Al-<i>Anjal</i>"]) assert.ok(en.includes(x), x);
    assert.doesNotMatch(en, /Below|Above|On Level/);
    const t = (x: string, v?: Record<string, string | number>) => translate("ar", x, v);
    const arOut = html(h(WeeklySummaryPage, { w: batch.items[0], batch, t }));
    assert.ok(arOut.includes(ar["Weekly family summary"]) && arOut.includes(ar["One tip for home"]));
    assert.equal(tipFor({ minutes: 5, fluency: { wcpm: null, readings: 0, word: "Not this week", date: null }, readrise: { done: 0, avg: null, word: "Not this week" }, readmaster: { done: 0, avg: null, word: "Not this week" } }, null).text.startsWith("Choose a short practice time"), true);
  });

  test("every new interface word has an Arabic translation", () => {
    for (const k of ["Class accounts", "Sign-in cards", "Cut here", "Weekly family summary", "Teacher's signature", "Moved up to the next level", "Strong", "On track", "Growing"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok(ar[k as keyof typeof ar], k);
    }
    assert.match(read("src/app/teacher/family-reports/weekly/page.tsx"), /weeklySummaries\(repo, actor/);
  });
});
