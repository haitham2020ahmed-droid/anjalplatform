/**
 * ⭐ The ReadMaster page update: ONE page for students, teachers and admin; every published article open to every
 * student (no assignment); grade tabs (the student's own grade first); articles grouped by Unit; Below | On | Above
 * buttons that open at the student's level; the counting rule (own level or higher counts, lower = Practice with no
 * level / mastery change); and the ReadMaster report scopes (teacher: own classes, admin: whole school, others refused).
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
import { afterResponseSettled } from "../src/server/lib/after-response";
import { loadQuestionItems } from "../src/server/practice/items";
import { addVersionQuestion, gradeSkills, openArticle, readingLexile, readingMinutes, readMasterHome, saveArticle, saveVersion, setArticleStatus, submitArticle, unitOfCode } from "../src/server/readmaster/service";
import { readMasterAnalytics, studentReadMasterReport } from "../src/server/reports/readmaster-report";
import { exportReport, parseReportRequest, type ReportDeps } from "../src/server/reports/service";
import { navItemsFor } from "../src/components/nav-items";
import { ADMIN_TOOLS } from "../src/components/admin-tools";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("⭐ ReadMaster: one page for everyone, open to all, counts only at own level or higher", () => {
  let repo: SqliteRepo; let admin: Actor; let t1: Actor; let t2: Actor; let t3: Actor;
  let g4u1 = "", g4other = "", g5 = "", classA = "", classB = "";
  const user = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const ON_BODY = `Rivers carry water from the hills down to the wide blue sea every day. ${"The water moves fast after rain and slow in the summer heat. ".repeat(20)}`;
  const mkArticle = async (code: string, title: string, grade: number) => {
    const skill = (await gradeSkills(repo, admin.schoolId!, grade))[0];
    const id = await saveArticle(repo, admin, { code, title, grade, skillId: skill?.id ?? null });
    for (const [lv, lx, body] of [["BELOW", 600, `Short text for ${title}. ${"Rivers are long and wet and they go to the sea. ".repeat(4)}`], ["ON", 820, ON_BODY], ["ABOVE", 960, `${ON_BODY} ${"Erosion slowly reshapes valleys over thousands of years. ".repeat(10)}`]] as const) {
      const vid = await saveVersion(repo, admin, id, lv, { lexile: lx, body });
      await addVersionQuestion(repo, admin, vid, { stem: `${title} ${lv}: what is the main idea?`, whyCorrect: "The text says so.", options: [{ label: "A", text: `right ${title} ${lv}`, correct: true }, { label: "B", text: `wrong ${title} ${lv}`, correct: false }, { label: "C", text: `other ${title} ${lv}`, correct: false }] });
    }
    await setArticleStatus(repo, admin, id, "PUBLISHED");
    return id;
  };
  const answerAll = async (s: Actor, aid: string, level: string | null, right: boolean) => {
    const o = await openArticle(repo, s, aid, { level });
    const items = await loadQuestionItems(repo, o.questions.map((q) => q.questionId));
    const resp = Object.fromEntries(items.map((i) => [i.questionId, (right ? i.options!.find((x) => x.correct) : i.options!.find((x) => !x.correct))!.label]));
    return { open: o, result: await submitArticle(repo, s, aid, o.versionId, resp) };
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    [admin, t1, t2, t3] = await Promise.all(["test.admin", "test.teacher.1", "test.teacher.2", "test.teacher.3"].map(user));
    const classes = await repo.findMany("Class", {});
    classA = String(classes.find((c) => c.name === "TEST 4A")!.id); classB = String(classes.find((c) => c.name === "TEST 4B")!.id);
    g4u1 = await mkArticle("RM-G4-U1-TS1-RIVERS", "Rivers", 4);
    g4other = await mkArticle("FREE-DESERTS", "Deserts", 4);
    g5 = await mkArticle("RM-G5-U2-TS1-STORMS", "Storms", 5);
    await saveArticle(repo, admin, { code: "DRAFT-G6", title: "Draft only", grade: 6 });   // a draft: no Grade 6 tab
  });

  test("grade tabs from published articles; the student's own grade opens first; units grouped (Other last); reading time; no assignment", async () => {
    assert.equal(unitOfCode("RM-G4-U1-TS1-RIVERS"), 1); assert.equal(unitOfCode("FREE-DESERTS"), null);
    const s4 = await user("test.student.001"), s5 = await user("test.student.080");
    const h4 = await readMasterHome(repo, s4);
    assert.deepEqual([h4.grades, h4.grade, h4.myGrade, h4.viewer, h4.canManage], [[4, 5], 4, 4, "STUDENT", false]);
    assert.deepEqual(h4.units.map((u) => u.unit), [1, null], "Unit 1, then Other");
    assert.equal(h4.units[1].title, "Other");
    assert.match(h4.units[0].title, /Unit 1|\w/);
    const rivers = h4.units[0].articles.find((a) => a.id === g4u1)!;
    assert.equal(rivers.minutes, readingMinutes(ON_BODY.trim().split(/\s+/).length), "reading time from the On version at 130 words a minute");
    assert.ok(rivers.minutes >= 2 && rivers.done === null && rivers.skill);
    const h5 = await readMasterHome(repo, s5);
    assert.equal(h5.grade, 5, "a Grade 5 student opens on Grade 5");
    assert.equal((await readMasterHome(repo, s4, { grade: 5 })).units[0].articles[0].id, g5, "the Grade 5 tab");
    assert.equal((await readMasterHome(repo, s4, { grade: 6 })).grade, 4, "an empty / unknown grade falls back to the student's grade");
    // open to every student of the school, any grade, with no assignment
    assert.equal(await repo.count("Assignment", { title: "Rivers" }), 0);
    assert.equal((await openArticle(repo, s5, g4u1)).articleId, g4u1);
    assert.equal((await openArticle(repo, s4, g5)).articleId, g5);
    const draft = (await repo.findMany("ReadMasterArticle", { code: "DRAFT-G6" }))[0];
    await assert.rejects(openArticle(repo, s4, String(draft.id)), ForbiddenError, "drafts stay closed");
  });

  test("staff see the same page: teacher's class grade first, admin the first grade + Manage; parents refused", async () => {
    const ht = await readMasterHome(repo, t3);
    assert.deepEqual([ht.viewer, ht.grade, ht.canManage], ["STAFF", 5, false], "teacher 3 teaches Grade 5");
    const ha = await readMasterHome(repo, admin);
    assert.deepEqual([ha.viewer, ha.grade, ha.canManage], ["STAFF", 4, true]);
    assert.ok(ha.units.flatMap((u) => u.articles).every((a) => a.done === null), "staff: no ✓");
    const o = await openArticle(repo, t1, g4u1);
    assert.deepEqual([o.viewer, o.level, o.ownLevel, o.practice, o.levels.map((l) => l.level)], ["STAFF", "ON", "ON", false, ["BELOW", "ON", "ABOVE"]]);
    await assert.rejects(submitArticle(repo, t1, g4u1, o.versionId, {}), ForbiddenError, "staff cannot answer");
    const parent = (await repo.findMany("User", { role: "PARENT" }))[0];
    if (parent) await assert.rejects(readMasterHome(repo, await resolveActor(repo, parent)), ForbiddenError);
  });

  test("Below | On | Above: opens at the student's level; switching allowed; lower = practice, higher = counts", async () => {
    const s = await user("test.student.002");                         // no MAP: 808L = On in the Grade 4 band
    const o = await openArticle(repo, s, g4u1);
    assert.deepEqual([o.level, o.ownLevel, o.practice], ["ON", "ON", false]);
    const below = await openArticle(repo, s, g4u1, { level: "BELOW" });
    assert.deepEqual([below.level, below.practice, below.lexile], ["BELOW", true, 600]);
    const above = await openArticle(repo, s, g4u1, { level: "above" });
    assert.deepEqual([above.level, above.practice], ["ABOVE", false]);
    assert.equal((await openArticle(repo, s, g4u1, { level: "NOPE" })).level, "ON", "an unknown level opens the student's own");
    // a Grade 4 reader opening a Grade 5 article: their 808L is below the Grade 5 On band → its Below version
    assert.equal((await openArticle(repo, s, g5)).ownLevel, "BELOW");
  });

  test("counting rule: a lower level is Practice (no Lexile, no mastery change); own level or higher counts once", async () => {
    const s = await user("test.student.003");
    const sid = s.studentId!;
    const before = await readingLexile(repo, sid);
    const p = await answerAll(s, g4u1, "BELOW", true);
    await afterResponseSettled();
    assert.deepEqual([p.result.practice, p.result.pct, p.result.lexileBefore, p.result.lexileAfter], [true, 100, before.lexile, before.lexile]);
    assert.deepEqual(await readingLexile(repo, sid), before, "the reading Lexile did not move");
    assert.equal(await repo.count("QuestionAttempt", { studentId: sid, source: "READMASTER" }), 0, "no skill evidence from a practice read");
    assert.equal(await repo.count("PracticeSession", { studentId: sid, endReason: "READMASTER" }), 0);
    const att = (await repo.findMany("ReadMasterAttempt", { studentId: sid }))[0];
    assert.ok(Boolean(att.practice), "saved as practice");
    let card = (await readMasterHome(repo, s)).units[0].articles.find((a) => a.id === g4u1)!;
    assert.deepEqual([card.done?.practice, card.done?.correct], [true, 1], "✓ shown as practice");
    // practice does not finish the article: reading at the own level counts
    const c = await answerAll(s, g4u1, null, true);
    await afterResponseSettled();
    assert.deepEqual([c.result.practice, c.result.lexileBefore, c.result.lexileAfter], [false, before.lexile, before.lexile + 30]);
    assert.equal((await readingLexile(repo, sid)).lexile, before.lexile + 30);
    assert.ok(await repo.count("QuestionAttempt", { studentId: sid, source: "READMASTER" }) > 0, "a counted read feeds skill mastery (39B)");
    card = (await readMasterHome(repo, s)).units[0].articles.find((a) => a.id === g4u1)!;
    assert.deepEqual([card.done?.practice, card.done?.pct], [false, 100], "✓ + score");
    await assert.rejects(answerAll(s, g4u1, "BELOW", true), /already finished/, "counts once; no more reads after");
    const again = await openArticle(repo, s, g4u1);
    assert.deepEqual([again.done, again.result?.correct], [true, 1], "the finished article still opens to read");
    // a higher level counts too
    const s2 = await user("test.student.004");
    const h = await answerAll(s2, g4other, "ABOVE", false);
    assert.deepEqual([h.result.practice, h.result.lexileAfter - h.result.lexileBefore], [false, -30]);
    const rep = await studentReadMasterReport(repo, t1, sid);
    assert.deepEqual(rep.articles.map((a) => a.practice), [true, false]);
  });

  test("reports: teacher = own classes, admin = whole school, another teacher / students refused (typed URLs too)", async () => {
    const s5 = await user("test.student.081");
    await answerAll(s5, g5, null, true);                               // a Grade 5 read (not in teacher 1's class)
    const mine = await readMasterAnalytics(repo, t1, { scope: "mine" });
    assert.equal(mine.label, "All my classes");
    const members = (await repo.findMany("ClassMembership", { classId: classA })).map((m) => String(m.studentId));
    assert.ok(mine.students.every((x) => members.includes(x.studentId)), "only teacher 1's students");
    assert.deepEqual([mine.summary.reads, mine.summary.counted, mine.summary.practice, mine.summary.readers], [3, 2, 1, 2]);
    assert.ok(mine.texts.some((x) => x.articleId === g4u1 && x.byLevel.BELOW.reads === 1 && x.byLevel.ON.reads >= 1));
    assert.ok(mine.skills.length >= 1 && mine.skills.every((k) => k.skill));
    const st3 = (await user("test.student.003")).studentId!;
    assert.deepEqual(mine.below.map((b) => [b.studentId, b.lower]), [[st3, 1]], "who chose lower versions");
    const row = mine.students.find((x) => x.studentId === st3)!;
    assert.deepEqual([row.texts, row.counted, row.practice, row.avgScore, row.change], [1, 1, 1, 100, 30]);
    const cls = await readMasterAnalytics(repo, t1, { scope: "class", classId: classA });
    assert.equal(cls.students.length, members.length, "a class lists every student, readers or not");
    const school = await readMasterAnalytics(repo, admin, { scope: "school" });
    assert.ok(school.summary.readers > mine.summary.readers && school.texts.some((x) => x.articleId === g5), "admin: the whole school");
    await assert.rejects(readMasterAnalytics(repo, t1, { scope: "school" }), ForbiddenError, "a teacher cannot see the school");
    await assert.rejects(readMasterAnalytics(repo, t2, { scope: "class", classId: classA }), ForbiddenError, "another teacher's class");
    await assert.rejects(readMasterAnalytics(repo, await user("test.student.001"), { scope: "mine" }), ForbiddenError, "students");
    const t2mine = await readMasterAnalytics(repo, t2, { scope: "mine" });
    assert.ok(t2mine.students.every((x) => !members.includes(x.studentId)), "teacher 2 sees none of class A");
    // exports: class (teacher) and school (admin only)
    const deps: ReportDeps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "rmp-")) };
    const exp = (a: Actor, q: Record<string, string>) => exportReport(deps, a, parseReportRequest(new URLSearchParams({ format: "csv", ...q })));
    const csv = Buffer.from((await exp(t1, { kind: "readmaster", classId: classA, days: "90" })).bytes).toString("utf8");
    assert.match(csv, /Student,Articles/); assert.match(csv, /Test Student 003,2,/);
    await assert.rejects(exp(t1, { kind: "readmaster", scope: "school" }), ForbiddenError);
    await assert.rejects(exp(t2, { kind: "readmaster", classId: classA }), ForbiddenError);
    const sx = Buffer.from((await exp(admin, { kind: "readmaster", scope: "school" })).bytes).toString("utf8");
    assert.match(sx, /Texts read/); assert.match(sx, /Test Student 081/);
    void classB;
  });

  test("nav: one ReadMaster entry per role → the shared page; editor kept behind Manage; pages open to staff", () => {
    for (const role of ["STUDENT", "TEACHER", "SCHOOL_ADMIN"]) {
      const rm = navItemsFor(role).filter((i) => i.label === "ReadMaster");
      assert.deepEqual(rm.map((i) => i.href), ["/student/readmaster"], role);
    }
    assert.ok(ADMIN_TOOLS.some((x) => x.href === "/admin/readmaster" && x.label === "Manage ReadMaster"), "the editor is still reachable");
    for (const f of ["src/app/student/readmaster/page.tsx", "src/app/student/readmaster/[articleId]/page.tsx"]) assert.match(read(f), /roles: \["STUDENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"\]/, f);
    const art = read("src/app/student/readmaster/[articleId]/page.tsx");
    assert.match(art, /<ListenButton/); assert.match(art, /<WordLookup>/); assert.match(art, /Practice: this won&apos;t change your level/);
    assert.match(read("src/app/student/readmaster/page.tsx"), /\/admin\/readmaster/, "Manage link (admins)");
  });
});
