/**
 * Student pages (b1) — in-memory Demo School; invented students only:
 *  - the MAP dashboard data never shows a descriptor or Below / On / Above; points-to-goal math
 *  - programWork: the program's rows of My Work (MAP / RTI / NAFS / Curriculum)
 *  - studentMenuFlags: RTI only for Tier 2/3, NAFS only with NAFS work
 *  - My Plans, Progress Report, My Skills and Family Report redirect; the new pages exist
 *  - My Certificates: own certificates only
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { giveQuestion } from "./helpers/give-question";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import type { MyMap } from "../src/server/map/map-more";
import { FORBIDDEN_LEVEL_WORDS, pointsToGoal, studentMapCards } from "../src/server/student/map-dashboard";
import { filterProgramWork, programWork, workProgress } from "../src/server/student/program-work";
import { studentMenuFlags } from "../src/server/student/menu-flags";
import { friendlyCertificateTitle, studentCertificates } from "../src/server/student/certificates";
import { autoCertificate, listCertificates } from "../src/server/motivation/certificates";
import { readMasterMyReport, fluencyMyReport } from "../src/server/student/reading-report";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2027-01-10T08:00:00Z");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** A My MAP with every descriptor and status a real import can produce. */
function sampleMap(): MyMap {
  const area = (group: string, name: string, rit: number | null, descriptor: string | null, status: string | null) => ({ group, name, icon: "📚", rit, band: rit ? `${rit - 5}–${rit + 4}` : null, low: null, high: null, percentile: 40, descriptor, status, accuracy: null, next: rit ? `skill-${group}` : null });
  const profile = (subject: string, rit: number, descriptor: string) => ({
    studentId: "s1", subject, term: "Fall 2026", season: "FALL", grade: 4,
    overall: { rit, percentile: 22, descriptor, band: "190–199", lexile: 640, rapidGuessPct: null },
    fall: { rit, term: "Fall 2026", projection: rit + 6, growth: 6 }, history: [], areas: [], hasGoals: true,
  });
  return {
    subjects: [
      { subject: "READING", profile: profile("READING", 209, "Low"), orderedBy: "MAP", estimate: null,
        goal: { target: 215, from: 209, now: 209, nowIsEstimate: false, left: 6, reached: false },
        areas: [area("LIT", "Literary Text", 199, "Low", "FOCUS"), area("INFO", "Informational Text", 214, "HiAvg", "EXTEND"), area("VOCAB", "Vocabulary", 207, "Avg", "MAINTAIN")] },
      { subject: "LANGUAGE", profile: profile("LANGUAGE", 221, "High"), orderedBy: "MAP", estimate: null,
        goal: { target: 220, from: 214, now: 221, nowIsEstimate: false, left: 0, reached: true },
        areas: [area("GRAMMAR", "Grammar & Usage", 225, "High", "EXTEND"), area("MECH", "Mechanics", 212, "LoAvg", "MAINTAIN"), area("WRITING", "Writing", 205, "Low", "FOCUS")] },
    ],
    plans: [],
  } as unknown as MyMap;
}

describe("student pages (b1): pure rules", () => {
  test("points to goal: never negative; missing numbers give no line", () => {
    assert.equal(pointsToGoal(209, 215), 6);
    assert.equal(pointsToGoal(221, 220), 0, "goal passed → 0, never -1");
    assert.equal(pointsToGoal(215, 215), 0);
    assert.equal(pointsToGoal(null, 215), null);
    assert.equal(pointsToGoal(209, null), null);
    assert.equal(pointsToGoal(Number.NaN, 215), null);
  });

  test("MAP dashboard cards: numbers, goal, strengths and things to grow — no Low / Below / Above / Avg words", () => {
    const cards = studentMapCards(sampleMap());
    assert.deepEqual(cards.map((c) => c.subject), ["READING", "LANGUAGE"]);
    const [r, l] = cards;
    assert.equal(r.rit, 209); assert.equal(r.goal, 215); assert.equal(r.toGoal, 6); assert.equal(r.reached, false);
    assert.equal(l.toGoal, 0); assert.equal(l.reached, true);
    assert.deepEqual(r.grow.map((g) => g.name), ["Literary Text"], "the focus area is the thing to grow");
    assert.ok(r.strengths.includes("Informational Text"));
    for (const c of cards) {
      assert.ok(!c.strengths.some((s) => c.grow.some((g) => g.name === s)), "a strength is never also a thing to grow");
      assert.ok(c.strengths.length <= 3 && c.grow.length <= 3);
      assert.ok(c.areas.every((a) => a.pct >= 0 && a.pct <= 100));
    }
    const json = JSON.stringify(cards);
    assert.doesNotMatch(json, FORBIDDEN_LEVEL_WORDS, "no descriptor reaches the student");
    for (const w of ["Low", "LoAvg", "Avg", "HiAvg", "High", "Below", "Above"]) assert.ok(!json.includes(`"${w}"`), w);
    // a student with no MAP scores: two friendly empty cards
    const empty = studentMapCards({ subjects: [], plans: [] });
    assert.equal(empty.length, 2); assert.ok(empty.every((c) => c.rit === null && c.toGoal === null));
    // the dashboard component and page never print a descriptor either
    for (const f of ["src/components/student/map-dashboard.tsx", "src/app/student/map/page.tsx"]) {
      const src = read(f);
      assert.doesNotMatch(src, /descriptor|DESC_STYLE|percentile/i, f);
      assert.doesNotMatch(src, /\/quiz\/|QuestionPlayer/, `${f}: no questions on the MAP page`);
    }
    assert.match(read("src/app/student/map/page.tsx"), /programWork\(repo, sid, "MAP"\)/, "Your MAP practice = the MAP rows of My Work");
  });

  test("programWork filtering and the progress line", () => {
    const rows = [{ sourceKey: "MAP", status: "Done" }, { sourceKey: "RTI", status: "Not started" }, { sourceKey: "MAP", status: "In progress" }, { sourceKey: "CURRICULUM", status: "Done" }] as const;
    assert.equal(filterProgramWork(rows, "MAP").length, 2);
    assert.equal(filterProgramWork(rows, "map").length, 2, "case does not matter");
    assert.equal(filterProgramWork(rows, "RTI").length, 1);
    assert.equal(filterProgramWork(rows, "NAFS").length, 0);
    assert.equal(filterProgramWork(rows, "nonsense").length, 0);
    assert.deepEqual(workProgress(rows), { done: 2, total: 4, pct: 50 });
    assert.deepEqual(workProgress([]), { done: 0, total: 0, pct: 0 });
  });

  test("certificate titles never say Below / On / Above to the student", () => {
    assert.equal(friendlyCertificateTitle({ kind: "LEVEL_UP", title: "Moved up to On Level" }), "You moved up a level!");
    assert.doesNotMatch(friendlyCertificateTitle({ kind: "LEVEL_UP", title: "Moved up to Above Level" }), FORBIDDEN_LEVEL_WORDS);
    assert.equal(friendlyCertificateTitle({ kind: "PLAN", title: "Finished the plan: Unit 1" }), "Finished: Unit 1");
    assert.equal(friendlyCertificateTitle({ kind: "MANUAL", title: "Star reader" }), "Star reader");
  });

  test("redirects: My Plans → My Work; Progress Report, My Skills and Family Report → My Reports", () => {
    assert.match(read("src/app/student/plans/page.tsx"), /redirect\("\/student"\)/);
    assert.match(read("src/app/student/insights/page.tsx"), /redirect\("\/student\/reports/);
    assert.match(read("src/app/student/skills/page.tsx"), /redirect\("\/student\/reports/);
    assert.match(read("src/app/student/family/page.tsx"), /redirect\("\/student\/reports\?view=family"\)/);
    // the student menu's routes all exist
    for (const r of ["", "/map", "/curriculum", "/rti", "/nafs", "/readmaster", "/readrise", "/fluency-coach", "/tests", "/certificates", "/badges", "/reports"]) {
      assert.ok(existsSync(join(ROOT, `src/app/student${r}/page.tsx`)), `/student${r}`);
    }
    // nothing valuable lost: the old pages' loaders live in My Reports now; reading pages have "My report"
    const reports = read("src/app/student/reports/page.tsx");
    for (const l of ["profilesOf", "risksOf", "nextStep", "mySkills", "studentWeek", "streakAndPoints", "approvedForFamily", "isReportShared", "studentDiagnosticReport", "coachSummary", "weekStats"]) assert.match(reports, new RegExp(`\\b${l}\\(`), l);
    assert.match(reports, /<LangSwitch/, "For my family has the English | العربية switch");
    assert.match(read("src/app/student/readmaster/page.tsx"), /readMasterMyReport\(/);
    assert.match(read("src/app/student/readrise/page.tsx"), /tab=report/);
    assert.match(read("src/components/student/fluency-my-report.tsx"), /fluencyMyReport\(/);
  });

  test("My Work: one goal, one primary button (Continue), progress bar, chips; Join Live and Question of the Day kept", () => {
    // owner's spec (Update 53): one big "Today" card with Start / Continue, the progress bar and the next tasks
    const page = read("src/app/student/page.tsx");
    assert.match(page, /t\("Today"\)/);
    // Literise D1: the one main button is the saffron Start / Continue on the navy hero card
    assert.equal((page.match(/BTN_ACCENT/g) ?? []).length, 2, "imported once, used once: Start / Continue");
    assert.match(page, /t\("Continue"\)/);
    assert.match(page, /"\{done\} of \{total\} done"/);
    assert.match(read("src/components/student/my-work-list.tsx"), /<SourceTag source=\{r\.sourceKey\}/);
    assert.match(page, /<JoinLive/); assert.match(page, /<QotdCard/);
    assert.match(page, /<LatestCertificate/);
    assert.doesNotMatch(page, /\/student\/plans|"My Plans"/);
  });

  test("every new interface string has an Arabic version", () => {
    const en = new Set<string>(UI_STRINGS);
    for (const s of ["Your work for today", "{done} of {total} done", "Your goal: {n}", "You need +{n} points to reach your goal", "You're strong at…", "Let's practice…", "My progress", "For my family", "My report", "You moved up a level!", "Your MAP practice", "Your NAFS work"]) {
      assert.ok(en.has(s), s);
      assert.ok(/[؀-ۿ]/.test(ar[s as keyof typeof ar]), s);
    }
    assert.equal(en.size, UI_STRINGS.length, "no duplicate interface strings");
  });
});

describe("student pages (b1): data and access", () => {
  let repo: SqliteRepo;
  let t4: Actor, A: Actor, B: Actor;
  let a: string, b: string, classId: string;
  let skills: string[];
  const actorFor = async (username: string) => resolveActor(repo, (await repo.findUnique("User", { username }))!);
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id: studentId }))!.userId) }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    t4 = await actorFor("demo.teacher.4a");
    const cur = (await teacherCurriculum(repo, t4))!;
    classId = cur.classId;
    [a, b] = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    A = await studentActor(a); B = await studentActor(b);
    skills = cur.units.flatMap((u) => u.skills).map((k) => k.id).slice(0, 4);
    // a skill with no questions cannot be assigned: each test skill gets one
    for (const k of cur.units.flatMap((u) => u.skills).slice(0, 4)) if (!k.questions) await giveQuestion(repo, k.id);
    assert.equal(skills.length, 4);
  });

  test("programWork: a MAP item is in My Work AND in the MAP section; each program sees only its own", async () => {
    await assignSkill(repo, t4, { classId, skillId: skills[0] }, NOW);
    await assignSkill(repo, t4, { classId, skillId: skills[1], track: "MAP", studentIds: [a] }, NOW);
    await assignSkill(repo, t4, { classId, skillId: skills[2], track: "NAFS", studentIds: [a] }, NOW);
    await assignSkill(repo, t4, { classId, skillId: skills[3], track: "RTI", studentIds: [b] }, NOW);
    const map = await programWork(repo, a, "MAP", NOW);
    assert.deepEqual(map.map((w) => w.skillId), [skills[1]]);
    assert.deepEqual((await programWork(repo, a, "NAFS", NOW)).map((w) => w.skillId), [skills[2]]);
    assert.deepEqual((await programWork(repo, a, "CURRICULUM", NOW)).map((w) => w.skillId), [skills[0]]);
    assert.equal((await programWork(repo, a, "RTI", NOW)).length, 0, "another student's RTI work is not mine");
    assert.deepEqual((await programWork(repo, b, "RTI", NOW)).map((w) => w.skillId), [skills[3]]);
    assert.equal((await programWork(repo, b, "MAP", NOW)).length, 0);
  });

  test("studentMenuFlags: RTI only for Tier 2/3; NAFS only with NAFS work", async () => {
    const fl = async (id: string) => { const f = await studentMenuFlags(repo, id); return { rti: f.rti, nafs: f.nafs }; };
    assert.deepEqual(await fl(a), { rti: false, nafs: true });
    assert.deepEqual(await fl(b), { rti: false, nafs: false });
    await repo.create("StudentTier", { studentId: b, schoolId: t4.schoolId, tier: 3, source: "TEACHER", locked: false, reason: "Test", focusSkillId: skills[3], since: NOW, monitorEveryDays: 14, updatedAt: NOW });
    assert.deepEqual(await fl(b), { rti: true, nafs: false });
    await repo.create("StudentTier", { studentId: a, schoolId: t4.schoolId, tier: 1, source: "TEACHER", locked: false, reason: "Test", focusSkillId: null, since: NOW, monitorEveryDays: 14, updatedAt: NOW });
    assert.equal((await studentMenuFlags(repo, a)).rti, false, "Tier 1 is not RTI");
  });

  test("My Certificates: a student sees only their own", async () => {
    const schoolId = String(t4.schoolId);
    assert.ok(await autoCertificate(repo, { schoolId, studentId: a, kind: "LEVEL_UP", refId: "up-a-1", title: "Moved up to On Level", detail: "Concept Vocabulary", now: NOW }));
    assert.ok(await autoCertificate(repo, { schoolId, studentId: b, kind: "PLAN", refId: "plan-b-1", title: "Finished the plan: Unit 2", now: NOW }));
    const mine = await studentCertificates(repo, A);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].title, "You moved up a level!");
    assert.doesNotMatch(JSON.stringify(mine), /Below|On Level|Above/);
    assert.match(mine[0].viewHref, /^\/api\/certificates\/[^?]+\?format=html/);
    assert.deepEqual((await studentCertificates(repo, B)).map((c) => c.title), ["Finished: Unit 2"]);
    await assert.rejects(listCertificates(repo, A, b), ForbiddenError, "another student's certificates are hidden");
    await assert.rejects(studentCertificates(repo, t4), ForbiddenError, "the student page is for students");
  });

  test("reading reports: own numbers, empty when nothing read", async () => {
    const rm = await readMasterMyReport(repo, a);
    assert.deepEqual([rm.articles, rm.avgPct, rm.recent.length], [0, null, 0]);
    const fl = await fluencyMyReport(repo, a, NOW);
    assert.deepEqual([fl.checks.length, fl.latest, fl.growth], [0, null, null]);
  });
});
