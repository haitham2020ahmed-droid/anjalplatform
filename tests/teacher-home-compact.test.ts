/**
 * 🏠 Teacher Home (owner r67 §§ 1–2): small shortcuts on top (‹ › when they do not fit), a compact Needs attention list
 * (5 rows, "Show all (N)"), then Find a skill, then the rest; every link of the list goes to a real page — "Open" on a
 * student who has not practised lands on the profile's "No practice yet — assign a skill" with an Assign button.
 * The admin home's Teacher follow-up uses the same compact rows. FAKE data only (in-memory Test School).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherHomeSummary } from "../src/server/teacher/needs-attention";
import { teacherStudentData } from "../src/server/teacher/page-data";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Teacher Home: shortcuts and a compact Needs attention", () => {
  const home = read("src/app/teacher/page.tsx");

  test("small shortcuts first: every tool the owner listed (NAFS only for Grade 6 teachers), ‹ › when they do not fit", () => {
    for (const [href, label] of [["/teacher/students", "My classes"], ["#find-skill", "Assign"], ["/teacher/progress", "Students' My Work"], ["/teacher/reports", "Reports"],
      ["/teacher/reports/early-warning", "Early warning"], ["/teacher/map-center", "MAP"], ["/teacher/learn", "Learn"], ["/teacher/nafs", "NAFS"], ["/teacher/assigned", "Assigned"]]) {
      assert.ok(home.includes(`{ href: "${href}", label: "${label}"`), `${label} → ${href}`);
    }
    assert.match(home, /\.\.\.\(nafs \? \[\{ href: "\/teacher\/nafs"/, "NAFS only when the teacher may see it");
    assert.match(home, /canSeeNafsCached\(repo, actor\)/, "the menu's request-cached NAFS answer (no extra read)");
    assert.match(home, /<ShortcutRow /);
    const row = read("src/components/teacher/home-shortcuts.tsx");
    assert.match(row, /^"use client";/);
    assert.match(row, /‹/); assert.match(row, /›/);
    assert.match(row, /overflow-x-auto/);
    assert.match(row, /!edge\.start &&/, "the arrows show only when there is more to scroll");
    assert.match(home, /h-9 shrink-0 items-center gap-1\.5 rounded-lg[^"]*text-sm/, "small chips");
    assert.match(home, /<LineIcon name=\{x\.line\} className="h-4 w-4" \/>/, "small line icons");
  });

  test("order: shortcuts → Needs attention → Find a skill → the numbers", () => {
    const at = (s: string) => { const i = home.indexOf(s); assert.ok(i > 0, s); return i; };
    assert.ok(at("<ShortcutRow") < at('id="needs-attention"'));
    assert.ok(at('id="needs-attention"') < at('id="find-skill"'));
    assert.ok(at('id="find-skill"') < at('aria-label={t("At a glance")}'));
  });

  test("compact Needs attention: one line per student (name · grade · reason · small button), 5 shown, Show all (N)", () => {
    assert.match(home, /const FIRST_ROWS = 5;/);
    assert.match(home, /ix >= FIRST_ROWS \? "hidden group-has-\[:checked\]\/na:flex" : "flex"/);
    assert.match(home, /sum\.list\.length > FIRST_ROWS && /);
    assert.match(home, /t\("Show all \(\{n\}\)", \{ n: sum\.list\.length \}\)/);
    assert.match(home, /px-3 py-1 text-\[13px\] leading-5/, "small rows");
    assert.match(home, /truncate/, "one line");
    assert.match(home, /t\("Grade \{n\}", \{ n: gradeOf\.get\(r\.classId\)! \}\)/, "the grade");
    assert.match(home, /const small = "inline-flex h-7 shrink-0[^"]*text-xs/, "small action button");
    assert.match(home, /role="region" aria-label=\{t\("Needs attention"\)\} tabIndex=\{0\} className="max-h-\[15rem\] overflow-y-auto/, "the open list scrolls");
  });

  test("every link of the list goes to a real page", () => {
    assert.match(home, /href=\{`\/teacher\/students\/\$\{r\.studentId\}\$\{r\.neverPractised \? "#start" : ""\}`\} className=\{small\}>\{t\("Open"\)\}/, "Open → the profile (its No practice yet part)");
    assert.match(home, /\/teacher\/plans\?\$\{new URLSearchParams\(\[\["tab", "custom"\], \["classId", r\.classId\], \["who", "student"\], \["sid", r\.studentId\]/, "Create Plan → Plans, this student, the skills filled in");
    assert.match(home, /href=\{`\/teacher\/students\/\$\{r\.studentId\}#skills`\}[^>]*>\{t\("\+\{n\} more"/, "+N more → the profile's skills");
    const profile = read("src/app/teacher/students/[studentId]/page.tsx");
    assert.match(profile, /id="start"/);
    assert.match(profile, /t\("No practice yet — assign a skill"\)/);
    assert.match(profile, /\["tab", "custom"\][^\n]*\["who", "student"\], \["sid", studentId\]\]\)\}`\}[^>]*>\{t\("Assign a skill"\)\}/, "an Assign button");
    assert.match(profile, /id="skills"/); assert.match(profile, /id="work"/);
    for (const p of ["src/app/teacher/plans/page.tsx", "src/app/teacher/students/[studentId]/page.tsx"]) assert.ok(read(p).length > 0, p);
  });

  test("the admin home's Teacher follow-up: the same compact rows (5, Show all), each opening Assigned for that teacher", () => {
    const admin = read("src/app/admin/page.tsx");
    assert.match(admin, /ix >= 5 \? "hidden group-has-\[:checked\]\/fu:flex" : "flex"/);
    assert.match(admin, /teachers\.length > 5 && /);
    assert.match(admin, /px-3 py-1 text-\[13px\] leading-5/);
    assert.match(admin, /\/teacher\/assigned\?teacher=\$\{encodeURIComponent\(r\.userId\)\}/);
    assert.match(admin, /href="\/teacher\/assigned" className=\{shortcut\}/, "Assigned among the admin shortcuts");
  });

  test("strings in English and Arabic", () => {
    for (const s of ["My classes", "Assign", "Students' My Work", "Early warning", "Assigned", "No practice yet — assign a skill", "Assign a skill", "Previous", "Next", "Shortcuts"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s), s);
      assert.ok(ar[s as (typeof UI_STRINGS)[number]] && ar[s as (typeof UI_STRINGS)[number]] !== s, `${s} in Arabic`);
    }
  });
});

describe("Needs attention → Open: the profile of a student with no practice", () => {
  let repo: SqliteRepo; let teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
  });

  test("a student who has not practised: the profile opens with no answers (the No practice yet part shows) and their class", async () => {
    const sum = await teacherHomeSummary(repo, teacher);
    const r = sum.list.find((x) => x.neverPractised);
    assert.ok(r, "a never-practised student is listed");
    const d = await teacherStudentData(repo, teacher, r.studentId);
    assert.equal(d.extras.answers.correct + d.extras.answers.incorrect, 0, "no answers → the No practice yet part");
    assert.equal(String(d.member?.classId), r.classId, "the Assign button opens Plans for this student's class");
  });
});
