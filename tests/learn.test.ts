/**
 * 📘 Learn (owner-approved plan) — FAKE data only (in-memory demo school): the lesson files and their check (same rules
 * as the content writers' check.py), the loader (idempotent, invalid files skipped and reported, the admin pack), the
 * level chosen from MAP RIT / the platform level, "Lessons for you", lesson ↔ skill matching and the coverage counts,
 * the player's rules (3 checks marked on the server, ≥ 2 = done, "again"), assigning to a student / group / class and
 * My Work (each lesson once), the teacher's private edit → admin proposal → approve / reject / restore (the file never
 * changes), report + hide, Early warning → "Send a lesson", no level words for students, bounded queries.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import type { Repo } from "../src/server/seeding/repo";
import { ValidationError } from "../src/server/curriculum-admin";
import { checkLesson, levelFromBand, levelFromRit, LEVEL_WORDS, textsOf, wordDiff, type LessonFile } from "../src/lib/learn/format";
import { lessonCatalog, readLessons, readTopics, useLearnDir } from "../src/server/learn/files";
import { ensureLearnLessons, loadLearnLessons, resetLearnEnsure } from "../src/server/learn/load";
import { anchorStd, learnSkills, lessonsForSkill, matchSkills, parentStd } from "../src/server/learn/match";
import { chooseLevel, openLesson, studentLearnHome, studentLesson, submitLessonChecks } from "../src/server/learn/student";
import { assignLearn, learnCoverage, learnResults, lessonForSkill, teacherLessons, teacherLessonView } from "../src/server/learn/teacher";
import { classTeacherIds, decideEdit, lessonLevelFor, openReports, proposals, reportProblem, restoreOriginal, saveLessonEdit, setLessonHidden } from "../src/server/learn/edits";
import { extraWorkItems } from "../src/server/student/all-work";
import { packOf, runPackChunk } from "../src/server/questions/load-packs";
import { navItemsFor, searchablePagesFor } from "../src/components/nav-items";
import { UI_STRINGS } from "../src/i18n/en";

const NOW = new Date("2026-10-13T08:00:00Z");
const SAMPLE = join(ROOT, "data/learn/lessons/LN-000.json");
const sample = () => JSON.parse(readFileSync(SAMPLE, "utf8")) as LessonFile;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Counts every database call (a call = one round trip). */
function counting(repo: Repo): { repo: Repo; calls: () => number } {
  let n = 0;
  const r = new Proxy(repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === "function" ? (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(target, a); } : v; } });
  return { repo: r as Repo, calls: () => n };
}

describe("Learn: lesson files and their check", () => {
  test("LN-000 (Main idea) passes the check; level 2 is the prototype's content", () => {
    assert.deepEqual(checkLesson(sample()), []);
    const l = sample();
    assert.equal(l.code, "LN-000");
    assert.equal(l.title, "Main idea");
    assert.match(l.levels["2"].together.passage, /^Every Thursday, students at our school work in the garden\./);
    assert.match(l.levels["2"].example.sentences[0].t, /Camels are well suited/);
    assert.deepEqual(l.levels["2"].checks.map((c) => c.answer), [1, 2, 3]);
    assert.deepEqual(Object.keys(l.levels).sort(), ["1", "2", "3", "4"]);
    // original, harder levels: longer passages level by level
    const words = (["1", "2", "3", "4"] as const).map((n) => l.levels[n].together.passage.split(/\s+/).length);
    assert.ok(words.every((w, i) => i === 0 || w >= words[i - 1]), `passages grow: ${words}`);
  });

  test("the rules of check.py: levels, slides, checks, evidence indexes, options, balance, level words", () => {
    const bad = (f: (l: LessonFile) => void) => { const l = sample(); f(l); return checkLesson(l); };
    assert.ok(bad((l) => { delete (l.levels as Record<string, unknown>)["4"]; }).includes("levels must be exactly 1,2,3,4"));
    assert.ok(bad((l) => { l.levels["2"].checks.pop(); }).includes("L2: exactly 3 checks"));
    assert.ok(bad((l) => { l.levels["1"].slides = l.levels["1"].slides.slice(0, 2); }).includes("L1: 3-4 slides"));
    assert.ok(bad((l) => { l.levels["1"].evidence.proof = [0, 1, 2, 3]; }).includes("L1 evidence: some sentences must NOT be proof"));
    assert.ok(bad((l) => { l.levels["3"].evidence.proof = [9]; }).includes("L3 evidence: proof indexes"));
    assert.ok(bad((l) => { l.levels["1"].together.options[1] = l.levels["1"].together.options[0]; }).includes("L1 together: 4 different options"));
    assert.ok(bad((l) => { l.levels["4"].checks[0].answer = 7; }).includes("L4 check 1: answer must be 0-3"));
    assert.ok(bad((l) => { l.levels["2"].together.passage = "Too short."; }).some((p) => /L2 together passage 2 words/.test(p)));
    assert.ok(bad((l) => { (l as { subject: string }).subject = "MATH"; }).includes("subject"));
    assert.ok(bad((l) => { l.levels["3"].slides[0].text += " You are Approaching it."; }).includes("level word 'Approaching' in student text"));
    const unbalanced = bad((l) => { for (const n of ["1", "2", "3", "4"] as const) { l.levels[n].together.answer = 0; for (const c of l.levels[n].checks) { c.answer = 0; c.options[0] += " and a great many more words to make it long"; } } });
    assert.ok(unbalanced.includes("answers unbalanced {0: 16}"), unbalanced.join("|"));
    assert.ok(unbalanced.includes("correct option clearly longest in 12 questions"));
  });

  test("scripts/learn/check.mts prints ✓ / ✗ per file and exits 1 on a problem", () => {
    const dir = mkdtempSync(join(tmpdir(), "learn-check-"));
    try {
      const broken = sample(); broken.levels["2"].checks.pop();
      writeFileSync(join(dir, "LN-901.json"), JSON.stringify(broken));
      const ok = spawnSync("npx", ["tsx", "scripts/learn/check.mts", SAMPLE], { cwd: ROOT, encoding: "utf8" });
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /^✓ .*LN-000\.json/m);
      const no = spawnSync("npx", ["tsx", "scripts/learn/check.mts", SAMPLE, join(dir, "LN-901.json")], { cwd: ROOT, encoding: "utf8" });
      assert.equal(no.status, 1);
      assert.match(no.stdout, /^✗ .*LN-901\.json\n {4}L2: exactly 3 checks/m);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("the level from MAP RIT: ≤190 → 1, 191–210 → 2, 211–225 → 3, ≥226 → 4; mastery band lowest → 1 … highest → 4", () => {
    assert.deepEqual([150, 190, 191, 210, 211, 225, 226, 260].map(levelFromRit), [1, 1, 2, 2, 3, 3, 4, 4]);
    assert.deepEqual(["BEGINNING", "DEVELOPING", "APPROACHING", "PROFICIENT", "MASTERED", "x"].map(levelFromBand), [1, 2, 2, 3, 4, null]);
  });

  test("lesson ↔ skill: name → family → standard → parent code → same standard in another grade", () => {
    const lessons = lessonCatalog();
    assert.equal(lessonsForSkill({ name: "central idea & relevant details", family: null, standards: [] }, lessons)?.rule, "NAME");
    assert.equal(lessonsForSkill({ name: "Something else", family: "central-idea", standards: [] }, lessons)?.rule, "FAMILY");
    assert.equal(parentStd("CCSS.ELA-LITERACY.L.4.1.b"), "L.4.1");
    assert.equal(anchorStd("RI.4.2"), anchorStd("RI.5.2"));
    const fake = [{ ...lessons[0], code: "LN-X", skillNames: [], families: [], standards: ["L.4.1.b", "RI.5.2"] }];
    assert.equal(lessonsForSkill({ name: "n", family: null, standards: ["CCSS.ELA-LITERACY.L.4.1.b"] }, fake)?.rule, "STANDARD");
    assert.equal(lessonsForSkill({ name: "n", family: null, standards: ["L.4.1.c"] }, fake)?.rule, "PARENT");
    assert.equal(lessonsForSkill({ name: "n", family: null, standards: ["RI.4.2"] }, fake)?.rule, "ANCHOR");
    assert.equal(lessonsForSkill({ name: "n", family: null, standards: ["W.4.3"] }, fake), null);
  });

  test("the planned topics explain every taxonomy family and every skill name of data/questions", () => {
    const topics = readTopics();
    assert.equal(topics.length, 222);
    const tax = JSON.parse(read("data/curriculum/taxonomy.json")) as { families: { code: string }[] };
    const fams = new Set(topics.flatMap((t) => t.families));
    for (const f of tax.families) assert.ok(fams.has(f.code), `a topic for family ${f.code}`);
    const names = new Set(topics.flatMap((t) => t.skillNames.map((n) => n.toLowerCase())));
    for (const n of skillNamesOfQuestions()) assert.ok(names.has(n.toLowerCase()), `a topic for skill ${n}`);
  });

  test("once the content is loaded: every taxonomy family and every skill name of data/questions has a LESSON", (t) => {
    const r = readLessons();
    if (r.valid.size < 2) { t.skip(`only the sample lesson is in data/learn/lessons (${r.valid.size} file) — the content writers add LN-001…LN-222`); return; }
    const files = [...r.valid.values()];
    const tax = JSON.parse(read("data/curriculum/taxonomy.json")) as { families: { code: string }[] };
    for (const f of tax.families) assert.ok(files.some((l) => l.families.includes(f.code)), `a lesson for family ${f.code}`);
    const catalog = lessonCatalog().filter((l) => l.ready);
    for (const n of skillNamesOfQuestions()) assert.ok(lessonsForSkill({ name: n, family: null, standards: [] }, catalog), `a lesson for skill ${n}`);
  });

  test("word-level diff for the admin", () => {
    assert.deepEqual(wordDiff("the big dog", "the small dog").filter((p) => p.op !== "same").map((p) => `${p.op}:${p.t.trim()}`), ["del:big", "add:small"]);
  });
});

function skillNamesOfQuestions(): string[] {
  const out = new Set<string>();
  for (const f of ["gap-skill-sets.json", "topup-skill-sets.json", "span-skill-sets.json", "grammar-extra-sets.json", "map-skill-sets.json"]) {
    try { for (const s of (JSON.parse(read(`data/questions/sets/${f}`)) as { sets?: { skill?: string }[] }).sets ?? []) if (s.skill) out.add(s.skill); } catch { /* missing pack */ }
  }
  return [...out];
}

describe("Learn in a school (demo data)", () => {
  let repo: SqliteRepo;
  let schoolId = "";
  let admin: Actor, t4a: Actor, t4b: Actor, s1: Actor, s2: Actor, other: Actor;
  let class4a = "", class4b = "";
  let skillId = "";
  let dir = "";
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (sid: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id: sid }))!.userId) }))!);

  before(async () => {
    // a Learn folder of its own: the real topics + continuum, the sample lesson and two broken files
    dir = mkdtempSync(join(tmpdir(), "learn-"));
    mkdirSync(join(dir, "lessons")); mkdirSync(join(dir, "words"));
    cpSync(join(ROOT, "data/learn/topics.json"), join(dir, "topics.json"));
    cpSync(join(ROOT, "data/learn/continuum.json"), join(dir, "continuum.json"));
    cpSync(SAMPLE, join(dir, "lessons/LN-000.json"));
    writeFileSync(join(dir, "lessons/LN-998.json"), "{ not json");
    writeFileSync(join(dir, "lessons/LN-997.json"), JSON.stringify({ ...sample(), code: "LN-996" }));
    useLearnDir(dir);
    resetLearnEnsure();
    ({ repo } = await demoDatabase());
    admin = await actorFor("demo.admin");
    t4a = await actorFor("demo.teacher.4a");
    t4b = await actorFor("demo.teacher.4b");
    schoolId = String(admin.schoolId);
    const classes = await repo.findMany("Class", { schoolId });
    class4a = String(classes.find((c) => c.name === "DEMO 4A")!.id);
    class4b = String(classes.find((c) => c.name === "DEMO 4B")!.id);
    const m4a = (await repo.findMany("ClassMembership", { classId: class4a })).map((m) => String(m.studentId)).sort();
    const m4b = (await repo.findMany("ClassMembership", { classId: class4b })).map((m) => String(m.studentId)).sort();
    s1 = await studentActor(m4a[0]); s2 = await studentActor(m4a[1]); other = await studentActor(m4b[0]);
    const skills = await learnSkills(repo, schoolId);
    const m = matchSkills(skills, lessonCatalog());
    const k = skills.find((x) => x.grade === 4 && m.get(x.id)?.codes.includes("LN-000") && ["NAME", "FAMILY"].includes(m.get(x.id)!.rule));
    assert.ok(k, "a Grade 4 central-idea skill in the demo curriculum");
    skillId = k!.id;
  });
  after(() => { useLearnDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("loader: idempotent, a changed file updates its row, invalid files skipped and reported; the admin pack", async () => {
    const r1 = await loadLearnLessons(repo, schoolId, null, NOW);
    assert.equal(r1.lessons, 1);
    assert.equal(r1.added, 1);
    assert.deepEqual(r1.invalid.map((x) => x.file).sort(), ["LN-997.json", "LN-998.json"]);
    assert.match(r1.invalid.find((x) => x.file === "LN-997.json")!.problems[0], /does not match the file name/);
    const r2 = await loadLearnLessons(repo, schoolId, null, NOW);
    assert.equal(r2.added, 0); assert.equal(r2.updated, 0); assert.equal(r2.skipped, 1);
    assert.equal(await repo.count("LearnLesson", { schoolId }), 1);
    // the pack in Admin → Load new questions
    const def = packOf("learn")!;
    assert.equal(def.title, "Learn lessons");
    assert.ok((UI_STRINGS as readonly string[]).includes(def.title) && (UI_STRINGS as readonly string[]).includes(def.hint));
    const w = await runPackChunk(repo, schoolId, def, 0, { now: NOW });
    assert.equal(w.total, 1); assert.equal(w.next, 1); assert.equal(w.added, 0);
    assert.equal(w.errors.length, 2, "the two broken files are reported");
    // background ensure: nothing to do once loaded (no second write)
    resetLearnEnsure();
    assert.equal(await ensureLearnLessons(repo, schoolId), null);
    assert.equal(await repo.count("LearnLesson", { schoolId }), 1);
  });

  test("the level for a student: the teacher's choice → MAP RIT of the subject → the platform level of the skill → 2", async () => {
    const sid = String(s2.studentId);
    assert.equal(await chooseLevel(repo, sid, "READING", [skillId]), 2, "no data: 2");
    await repo.create("StudentSkillMastery", { studentId: sid, skillId, score: 20, band: "BEGINNING", attempts: 5, correct: 1 });
    assert.equal(await chooseLevel(repo, sid, "READING", [skillId]), 1, "platform level, lowest → 1");
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-09-01"), subject: "READING", goalName: null, rit: 218 });
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-05-01"), subject: "READING", goalName: null, rit: 180 });
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-09-02"), subject: "LANGUAGE_USAGE", goalName: null, rit: 230 });
    assert.equal(await chooseLevel(repo, sid, "READING", [skillId]), 3, "the latest Reading RIT 218");
    assert.equal(await chooseLevel(repo, sid, "LANGUAGE", []), 4, "Language Usage RIT 230");
    assert.equal(await chooseLevel(repo, sid, "READING", [skillId], 1), 1, "the teacher's choice wins");
    const v = await studentLesson(repo, s2, "LN-000");
    assert.equal(v!.level, 3);
    assert.deepEqual(v!.content, sample().levels["3"], "the level-3 content of the file");
    assert.match(v!.practiceHref, /^\/practice\/[^/]+$|^\/student\/work$/, "Practise in My Work opens a skill's practice");
  });

  test("Lessons for you: assigned first, then lessons for my weakest skills; browse by area", async () => {
    const sid = String(s1.studentId);
    await repo.create("StudentSkillMastery", { studentId: sid, skillId, score: 30, band: "DEVELOPING", attempts: 6, correct: 2 });
    let h = await studentLearnHome(repo, s1);
    assert.deepEqual(h.forYou.map((x) => [x.code, x.assigned]), [["LN-000", false]], "suggested from the weakest skill");
    assert.ok(h.areas.some((a) => a.goalArea === "Informational Text" && a.lessons.some((l) => l.code === "LN-000")));
    await assignLearn(repo, t4a, { kind: "LESSON", ref: "LN-000", classId: class4a, target: "STUDENTS", studentIds: [sid], dueAt: new Date("2026-10-20") }, NOW);
    h = await studentLearnHome(repo, s1);
    assert.deepEqual(h.forYou.map((x) => [x.code, x.assigned]), [["LN-000", true]], "assigned (listed once)");
    assert.equal(h.forYou[0].dueAt?.slice(0, 10), "2026-10-20");
  });

  test("assign to a student, a group and the class → My Work lists the lesson ONCE; checks: ≥ 2 = done, fewer = again", async () => {
    const sid = String(s1.studentId);
    // a level group of the class
    await repo.create("StudentLevelState", { studentId: sid, schoolId, level: "BELOW", source: "PLATFORM", reason: "test", since: NOW, evaluatedAt: NOW });
    const g = await assignLearn(repo, t4a, { kind: "LESSON", ref: "LN-000", classId: class4a, target: "GROUP", groupLevel: "BELOW" }, NOW);
    assert.equal(g.students, 0); assert.equal(g.already, 1, "already has it open");
    const c = await assignLearn(repo, t4a, { kind: "LESSON", ref: "LN-000", classId: class4a, target: "CLASS", level: 2 }, NOW);
    assert.ok(c.students >= 2);
    await assert.rejects(assignLearn(repo, t4b, { kind: "LESSON", ref: "LN-000", classId: class4a, target: "CLASS" }, NOW), /Not your class/);
    let rows = (await extraWorkItems(repo, s1, NOW)).filter((r) => r.kind === "LEARN");
    assert.equal(rows.length, 1, "once");
    assert.equal(rows[0].href, "/student/learn/LN-000");
    assert.equal(rows[0].status, "Not started");
    assert.match(rows[0].skill, /^Learn — Main idea$/);
    await openLesson(repo, s1, "LN-000", NOW);
    rows = (await extraWorkItems(repo, s1, NOW)).filter((r) => r.kind === "LEARN");
    assert.equal(rows[0].status, "In progress");
    // the 3 checks, marked on the server
    const v = (await studentLesson(repo, s1, "LN-000"))!;
    const right = v.content.checks.map((q) => q.answer), wrong = right.map((a) => (a + 1) % 4);
    await assert.rejects(submitLessonChecks(repo, s1, "LN-000", [0], {}, NOW), ValidationError);
    const r1 = await submitLessonChecks(repo, s1, "LN-000", [right[0], wrong[1], wrong[2]], { seconds: 120 }, NOW);
    assert.deepEqual([r1.score, r1.passed], [1, false]);
    let p = (await repo.findMany("LearnProgress", { studentId: sid, kind: "LESSON", ref: "LN-000" }))[0];
    assert.equal(p.finishedAt, null); assert.ok(p.neededAgain, "fewer than 2: the again explanation");
    const r2 = await submitLessonChecks(repo, s1, "LN-000", [right[0], right[1], wrong[2]], { again: true, seconds: 60 }, NOW);
    assert.deepEqual([r2.score, r2.passed], [2, true]);
    p = (await repo.findMany("LearnProgress", { studentId: sid, kind: "LESSON", ref: "LN-000" }))[0];
    assert.ok(p.finishedAt); assert.equal(Number(p.attempts), 2); assert.equal(Number(p.seconds), 180);
    rows = (await extraWorkItems(repo, s1, NOW)).filter((r) => r.kind === "LEARN");
    assert.deepEqual([rows.length, rows[0].status], [1, "Done"]);
    // the teacher's results
    const res = await learnResults(repo, t4a, "LESSON", "LN-000");
    const me = res.rows.find((r) => r.studentId === sid)!;
    assert.deepEqual([me.score, me.best, me.again, me.attempts, me.minutes, Boolean(me.finished)], [2, 2, true, 2, 3, true]);
    assert.ok(res.counts.assigned >= 2 && res.counts.finished === 1);
    assert.equal((await learnResults(repo, t4b, "LESSON", "LN-000")).rows.length, 0, "another teacher: only their students");
  });

  test("teacher edit: private at once for their classes + a proposal; approve / reject / restore; the file never changes", async () => {
    const hash = () => createHash("sha1").update(readFileSync(join(dir, "lessons/LN-000.json"))).digest("hex");
    const before0 = hash();
    const mtime = statSync(join(dir, "lessons/LN-000.json")).mtimeMs;
    const t4aId = String((await repo.findUnique("Teacher", { userId: t4a.userId }))!.id);
    const base = (await lessonLevelFor(repo, schoolId, "LN-000", "2", [t4aId], t4aId))!;
    assert.equal(base.source, "FILE");
    const edited = structuredClone(base.level);
    edited.slides[0].title = "The big idea";
    await assert.rejects(saveLessonEdit(repo, t4a, "LN-000", "2", { ...edited, checks: edited.checks.slice(0, 2) }, NOW), /exactly 3 checks/);
    const r = await saveLessonEdit(repo, t4a, "LN-000", "2", edited, NOW);
    assert.equal(r.status, "PENDING");
    const seen = async (a: Actor) => classTeacherIds(repo, String(a.studentId)).then((ids) => lessonLevelFor(repo, schoolId, "LN-000", "2", ids));
    assert.equal((await seen(s1))!.level.slides[0].title, "The big idea", "the teacher's class sees it at once");
    assert.equal((await seen(other))!.level.slides[0].title, "Main idea", "another class still sees the original");
    assert.equal((await teacherLessonView(repo, t4a, "LN-000", "2"))!.version.source, "MINE");
    assert.equal((await teacherLessonView(repo, t4b, "LN-000", "2"))!.version.source, "FILE");
    // the admin's list: a word-level diff
    const props = await proposals(repo, admin);
    assert.equal(props.length, 1);
    assert.deepEqual(props[0].changes, [{ path: "slides.0.title", old: "Main idea", now: "The big idea" }]);
    await assert.rejects(proposals(repo, t4a), /Only the admin/);
    // reject: stays the teacher's own
    await decideEdit(repo, admin, props[0].id, false, null, NOW);
    assert.equal((await seen(s1))!.level.slides[0].title, "The big idea");
    assert.equal((await seen(other))!.level.slides[0].title, "Main idea");
    // a new edit, approved: the school's version for everyone
    edited.slides[0].title = "The main idea";
    await saveLessonEdit(repo, t4a, "LN-000", "2", edited, NOW);
    const p2 = (await proposals(repo, admin))[0];
    await decideEdit(repo, admin, p2.id, true, null, NOW);
    await assert.rejects(decideEdit(repo, admin, p2.id, true, null, NOW), /already decided/);
    assert.equal((await seen(other))!.level.slides[0].title, "The main idea");
    assert.equal((await teacherLessonView(repo, t4b, "LN-000", "2"))!.version.source, "SCHOOL");
    // restore: the admin retires the school version → the file again
    assert.equal(await restoreOriginal(repo, admin, "LESSON", "LN-000", 2, NOW), 1);
    assert.equal((await seen(other))!.level.slides[0].title, "Main idea");
    // a teacher's restore only withdraws their own version
    edited.slides[0].title = "Mine again";
    await saveLessonEdit(repo, t4a, "LN-000", "2", edited, NOW);
    assert.equal(await restoreOriginal(repo, t4b, "LESSON", "LN-000", 2, NOW), 0);
    assert.equal(await restoreOriginal(repo, t4a, "LESSON", "LN-000", 2, NOW), 1);
    assert.equal((await seen(s1))!.level.slides[0].title, "Main idea");
    assert.equal(hash(), before0, "the lesson file is never changed");
    assert.equal(statSync(join(dir, "lessons/LN-000.json")).mtimeMs, mtime);
  });

  test("report a problem → the admin's list; Hide (never delete) until fixed, then show again", async () => {
    await reportProblem(repo, t4a, "LESSON", "LN-000", 2, "Check 2 has two right answers.", NOW);
    await assert.rejects(reportProblem(repo, t4a, "LESSON", "LN-000", 2, "no", NOW), ValidationError);
    const reps = await openReports(repo, admin);
    assert.equal(reps[0].text, "Check 2 has two right answers.");
    await assert.rejects(setLessonHidden(repo, t4a, "LN-000", true), /Only the admin/);
    await setLessonHidden(repo, admin, "LN-000", true, "fixing", NOW);
    assert.equal(await studentLesson(repo, s1, "LN-000"), null);
    assert.ok(!(await studentLearnHome(repo, s1)).forYou.some((x) => x.code === "LN-000"));
    assert.ok(!(await teacherLessons(repo, t4a)).lessons.some((l) => l.code === "LN-000"), "teachers do not see it");
    assert.ok((await teacherLessons(repo, admin)).lessons.find((l) => l.code === "LN-000")!.hidden, "the admin sees it marked");
    await assert.rejects(assignLearn(repo, t4a, { kind: "LESSON", ref: "LN-000", classId: class4a, target: "CLASS" }, NOW), /hidden/);
    assert.equal(await repo.count("LearnLesson", { schoolId, code: "LN-000" }), 1, "never deleted");
    await setLessonHidden(repo, admin, "LN-000", false, null, NOW);
    assert.ok(await studentLesson(repo, s1, "LN-000"));
  });

  test("teacher list filters; coverage: every skill with its lesson(s) and the counts", async () => {
    assert.equal((await teacherLessons(repo, t4a, { area: "Informational Text" })).lessons.length, 1);
    assert.equal((await teacherLessons(repo, t4a, { area: "Mechanics" })).lessons.length, 0);
    assert.equal((await teacherLessons(repo, t4a, { standard: "RI.4.2" })).lessons.length, 1);
    assert.equal((await teacherLessons(repo, t4a, { standard: "RI.4" })).lessons.length, 1, "a code prefix");
    assert.equal((await teacherLessons(repo, t4a, { q: "main idea" })).lessons.length, 1);
    const c = await learnCoverage(repo, t4a);
    const skills = await learnSkills(repo, schoolId);
    assert.equal(c.total, skills.length, "every active skill of the master list");
    assert.equal(c.withLesson, c.skills.filter((k) => k.lessons.length).length);
    assert.ok(c.withLesson > 0 && c.withLesson <= c.total);
    assert.equal(c.lessonsReady, 1);
    assert.equal(c.lessonsPlanned, 223, "222 topics + the sample");
    assert.ok(c.skills.find((k) => k.id === skillId)!.lessons.some((l) => l.code === "LN-000" && l.ready));
    assert.ok(c.groups.length >= 10 && c.groups.every((g) => g.covered <= g.statements));
    assert.ok(c.families.some((f) => f.code === "central-idea" && f.lessons >= 2));
  });

  test("Early warning → Send a lesson: the lesson linked to the student's weak skill, on the assign page", async () => {
    assert.equal(await lessonForSkill(repo, t4a, skillId), "LN-000");
    const page = read("src/app/teacher/reports/early-warning/page.tsx");
    assert.match(page, /\/teacher\/learn\/assign\?\$\{new URLSearchParams\(\{ kind: "LESSON", skillId: r\.practiceSkillId, classId: r\.classId, studentId: r\.studentId \}\)\}/);
    assert.match(page, /Send a lesson/);
    assert.match(read("src/app/teacher/learn/assign/page.tsx"), /lessonForSkill\(repo, actor, sp\.skillId\)/);
  });

  test("students never see a level: no number, no level word in the player or the student pages", () => {
    for (const f of ["src/components/learn/lesson-player.tsx", "src/components/learn/student-cards.tsx", "src/components/learn/word-cards.tsx", "src/app/student/learn/page.tsx", "src/app/student/learn/[code]/page.tsx", "src/app/student/learn/words/page.tsx", "src/app/student/words/page.tsx"]) {
      const src = read(f);
      for (const m of src.matchAll(/"([^"\n]{3,})"/g)) assert.doesNotMatch(m[1], LEVEL_WORDS, `${f}: ${m[1]}`);
      assert.doesNotMatch(src, /\blevel=\{|v\.level\b|\.level\}/, `${f} never passes the level to the screen`);
    }
    for (const s of textsOf(sample().levels)) assert.doesNotMatch(s, LEVEL_WORDS);
  });

  test("menus: Learn for students (after ReadRise) and teachers; the admin finds Learn by name", () => {
    // My Words (the curriculum words moved there) and Fluency have their own entries (owner's request) (r68: ⭐ My Skills after My Work)
    assert.deepEqual(navItemsFor("STUDENT", { nafs: true }).map((i) => i.label), ["Home", "My Work", "My Skills", "My Tests", "MAP", "ReadMaster / ReadRise", "Learn", "My Words", "Fluency", "NAFS"]);
    assert.ok(navItemsFor("TEACHER").some((i) => i.href === "/teacher/learn" && i.line));
    const admin = searchablePagesFor("SCHOOL_ADMIN").map((i) => i.href);
    for (const h of ["/teacher/learn", "/teacher/learn/review", "/teacher/learn/coverage"]) assert.ok(admin.includes(h), h);
    assert.ok((UI_STRINGS as readonly string[]).includes("Learn"));
  });

  test("speed: Learn pages and My Work use a bounded number of queries (one lesson / one read per source)", async (t) => {
    // the second request (as on a running server: the school's skills list is cached per database and school)
    const measure = async (fn: (r: Repo) => Promise<unknown>) => { const c = counting(repo); await fn(c.repo); const first = c.calls(); await fn(c.repo); return c.calls() - first; };
    const home = await measure((r) => studentLearnHome(r, s1));
    const lesson = await measure((r) => studentLesson(r, s1, "LN-000"));
    const preview = await measure((r) => teacherLessonView(r, t4a, "LN-000", "3"));
    const list = await measure((r) => teacherLessons(r, t4a));
    t.diagnostic(`Learn home ${home} · a lesson ${lesson} · teacher preview ${preview} · teacher list ${list} database calls`);
    assert.ok(home <= 8, `Learn home: ${home} calls`);
    assert.ok(lesson <= 12, `a lesson: ${lesson} calls`);
    assert.ok(preview <= 14, `teacher preview: ${preview} calls`);
    assert.ok(list <= 2, `teacher list: ${list} calls`);
    // My Work: Learn adds ONE read (LearnAssignee) to the student's home / My Work
    const c = counting(repo);
    await extraWorkItems(c.repo, other, NOW);
    const withLearn = c.calls();
    const src = read("src/server/student/all-work.ts");
    assert.equal((src.match(/"LearnAssignee"/g) ?? []).length, 1, "one read of the Learn rows");
    assert.ok(withLearn > 0);
    // the lesson text is never read from the database
    for (const f of ["src/server/learn/student.ts", "src/server/learn/teacher.ts"]) assert.doesNotMatch(read(f), /findMany\("LearnLesson", \{[^}]*\}, \{ select: \[[^\]]*"levels"/);
  });
});
