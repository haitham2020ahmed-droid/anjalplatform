/**
 * Update 23 (FAKE data only — the Test School and a small made-up continuum): Learning Continuum import and
 * links to skills, Personal Study Plans, Family Reports, Group Study Plans, and who may open them.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { CONTINUUM_HEADERS, continuumFor, continuumIndex, groupOfGoal, importContinuum, skillsFor } from "../src/server/map/continuum";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { assignGroupSkills, familyReport, groupStudyPlan, pickBalanced, studyPlan } from "../src/server/map/map-reports";
import { demoDatabase } from "./helpers/db";

// a made-up continuum: three Literary bands and one Language band (statements invented for the test)
const CONT = [
  [...CONTINUUM_HEADERS],
  ["Reading", "181", "190", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Finds the lesson in a short fable", "RL.3.2"],
  ["Reading", "181", "190", "Literary Text", "Analyze Point of View, Features, and Structure", "Tells who is telling a story", "RL.3.6"],
  ["Reading", "191", "200", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Finds the lesson in a short fable", "RL.3.2"],
  ["Reading", "191", "200", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Summarizes the plot of a story", "RL.4.2"],
  ["Reading", "201", "210", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Summarizes the plot of a story", "RL.4.2"],
  ["Reading", "201", "210", "Literary Text", "Analyze Theme and Literary Elements; Summarize", "Compares the themes of two stories", "RL.5.9"],
  ["Language Usage", "191", "200", "Language: Understand, Edit for Mechanics", "Punctuation", "Uses commas in a list", "L.4.2"],
];

describe("Update 23 · Learning Continuum", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
  });
  test("goal areas map to the platform's groups", () => {
    assert.equal(groupOfGoal("Literary Text"), "LIT");
    assert.equal(groupOfGoal("Language: Understand, Edit for Grammar, Usage"), "GRAMMAR");
    assert.equal(groupOfGoal("Language: Understand, Edit for Mechanics"), "MECH");
    assert.equal(groupOfGoal("Writing: Write, Revise Texts for Purpose and Audience"), "WRITING");
  });
  test("only an admin imports; a bad row stops the whole file", async () => {
    await assert.rejects(importContinuum(repo, teacher, CONT), ForbiddenError);
    const bad = await importContinuum(repo, admin, [...CONT, ["Reading", "300", "200", "Literary Text", "x", "y", "RL.4.2"], ["Reading", "191", "200", "Space", "x", "y", "Q.1"]]);
    assert.equal(bad.saved, 0); assert.equal(bad.errors.length, 2);
    const ok = await importContinuum(repo, admin, CONT);
    assert.deepEqual(ok.bySubject, { READING: 6, LANGUAGE: 1 });
    // importing again replaces, never doubles
    await importContinuum(repo, admin, CONT);
    assert.equal(await repo.count("LearningStatement", {}), 7);
  });
  test("Reinforce · Develop · Introduce around a RIT; repeated statements are not repeated", async () => {
    const ix = await continuumIndex(repo, admin.schoolId!, 4, "READING");
    const v = continuumFor(ix, "LIT", 195);
    assert.equal(v.develop?.label, "191–200");
    assert.deepEqual(v.develop?.statements.map((x) => x.text), ["Finds the lesson in a short fable", "Summarizes the plot of a story"]);
    assert.deepEqual(v.reinforce?.statements.map((x) => x.text), ["Tells who is telling a story"]);
    assert.deepEqual(v.introduce?.statements.map((x) => x.text), ["Compares the themes of two stories"]);
    // below the lowest band: the lowest band is developed
    assert.equal(continuumFor(ix, "LIT", 150).develop?.label, "181–190");
  });
  test("statements link to the grade's skills by code, then by the same anchor in the student's grade", async () => {
    const ix = await continuumIndex(repo, admin.schoolId!, 4, "READING");
    const anyCode = [...ix.skillsByCode.keys()].find((c) => /^RL\.4\.\d+$/.test(c))!;
    assert.ok(skillsFor(ix, [anyCode], "LIT").length > 0);
    const n = anyCode.split(".")[2];
    assert.deepEqual(skillsFor(ix, [`RL.2.${n}`], "LIT").map((k) => k.id).sort(), skillsFor(ix, [anyCode], "LIT").map((k) => k.id).sort(), "grade 2 code → the grade 4 anchor");
    assert.deepEqual(skillsFor(ix, ["RL.4.99"], "LIT"), []);
  });
  test("balanced picking takes every topic in turn", () => {
    const list = ["a", "a", "a", "b", "c"].map((topic, i) => ({ topic, i }));
    assert.deepEqual([...pickBalanced(list, (x) => x.topic, () => 0, 3)].sort(), [0, 3, 4]);
  });
});

describe("Update 23 · study plans, family reports, group plans", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let otherTeacher: Actor; let classId = ""; let ids: string[] = [];
  const now = new Date(Date.UTC(2026, 9, 9));
  const H = [...MAP_TEMPLATE_HEADERS], c = (h: string) => H.indexOf(h);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!);
    const t = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    const sts = await repo.findMany("Student", { id: { in: ids } });
    const sheet = (f: (i: number) => number, proj: boolean) => [H, ...sts.map((st, i) => { const r = H.map(() => ""); r[0] = String(st.studentNumber); r[c("Reading Fall RIT")] = String(f(i)); if (proj) r[c("Reading Spring Projection")] = String(f(i) + 9); return r; })];
    await importMapScores(repo, admin, sheet((i) => 180 + (i % 20), true), 2025, new Date(Date.UTC(2025, 9, 1)), { term: { name: "Fall 2025", date: new Date(Date.UTC(2025, 8, 15)) } });
    await importMapScores(repo, admin, sheet((i) => 186 + (i % 20), false), 2026, new Date(Date.UTC(2026, 3, 20)), { term: { name: "Spring 2026", date: new Date(Date.UTC(2026, 3, 15)) } });
    await importMapScores(repo, admin, sheet((i) => 188 + (i % 22), true), 2026, now, { term: { name: "Fall 2026", date: new Date(Date.UTC(2026, 8, 15)) } });
  });

  test("without a continuum, the study plan lists the platform skills of the student's RIT range", async () => {
    const d = await studyPlan(repo, teacher, ids[0], "READING");
    assert.equal(d.source, "SKILLS");
    assert.equal(d.areas.length, 3);
    assert.ok(d.areas.every((a) => a.stages.length === 1 && a.stages[0].key === "DEVELOP"));
  });

  test("with a continuum: three stages, skills with the student's status, short and full versions", async () => {
    await importContinuum(repo, admin, CONT);
    const d = await studyPlan(repo, teacher, ids[0], "READING");
    assert.equal(d.source, "CONTINUUM");
    const lit = d.areas.find((a) => a.group === "LIT")!;
    assert.ok(lit.stages.some((x) => x.key === "DEVELOP"));
    assert.equal(d.overall?.projection, d.overall!.rit + 9);
    const full = await studyPlan(repo, teacher, ids[0], "READING", { full: true });
    assert.ok(full.areas.every((a) => a.stages.every((s) => s.shown === s.total)));
  });

  test("family report: history with the grade at the time, the national average, growth since the last Fall", async () => {
    const d = await familyReport(repo, teacher, ids[0], now);
    const r = d.subjects.find((x) => x.subject === "READING")!;
    assert.deepEqual(r.points.map((p) => p.label), ["Fall '25", "Spring '26", "Fall '26"]);
    assert.deepEqual(r.points.map((p) => p.grade), [3, 3, 4]);
    assert.ok(r.points.every((p) => p.national !== null));
    assert.equal(r.growth?.from, "Fall 2025"); assert.equal(r.growth?.to, "Fall 2026"); assert.equal(r.growth?.rit, 8);
    assert.ok(r.growth!.percentile >= 1 && r.growth!.percentile <= 99);
    assert.equal(r.goal?.target, 188 + 9);
    assert.equal(r.latest?.grade, 4);
  });

  test("group plan: every scored student is in exactly one band per goal area; the teacher sends a band its practice", async () => {
    const d = await groupStudyPlan(repo, teacher, classId, "READING");
    for (const a of d.areas) assert.equal(a.bands.reduce((t, b) => t + b.students.length, 0), ids.length);
    const b = d.areas.find((a) => a.group === "LIT")!.bands.find((x) => x.skillIds.length)!;
    const r = await assignGroupSkills(repo, teacher, { classId, group: "LIT", low: b.low, high: b.high, skillIds: b.skillIds, studentIds: b.students.map((x) => x.id) }, now);
    assert.equal(r.students, b.students.length);
    await assert.rejects(assignGroupSkills(repo, otherTeacher, { classId, group: "LIT", low: b.low, high: b.high, skillIds: b.skillIds, studentIds: b.students.map((x) => x.id) }, now), ForbiddenError);
  });

  test("who may open a student's reports", async () => {
    await assert.rejects(studyPlan(repo, otherTeacher, ids[0], "READING"), ForbiddenError);
    await assert.rejects(groupStudyPlan(repo, otherTeacher, classId, "READING"), ForbiddenError);
    const st = await repo.findUnique("Student", { id: ids[0] });
    const me = await resolveActor(repo, (await repo.findUnique("User", { id: st!.userId }))!);
    assert.equal((await studyPlan(repo, me, ids[0], "READING")).student.id, ids[0]);
    await assert.rejects(familyReport(repo, me, ids[1], now), ForbiddenError);
  });
});
