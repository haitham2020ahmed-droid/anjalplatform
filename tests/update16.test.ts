/**
 * Update 16 (FAKE test data only — the Test School): the master skills list (+ merge / undo), skill games and
 * QR joins, “My skills”, section statuses, badges, the parent report (teacher shares), teacher follow-up.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { readableClasses } from "../src/server/teacher/coordinators";
import { duplicateSkills, masterSkills, meaningKey, mergeSkills, undoMerge } from "../src/server/skills/master";
import { gameSkills } from "../src/server/game/live";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { canPlaySkill, mySkills, qrJoins, recordGameJoin } from "../src/server/game/skill-games";
import { sectionStatuses } from "../src/server/curriculum-map/status";
import { assignFromMap } from "../src/server/curriculum-map/levels";
import { studentBadges } from "../src/server/student/badges";
import { parentReport, shareParentReport } from "../src/server/insights/parent-report";
import { teacherFollowup, setFollowupRules } from "../src/server/insights/teacher-followup";
import { createDraft } from "../src/server/admin/questions";
import { demoDatabase } from "./helpers/db";

describe("Update 16", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId = ""; let students: string[] = []; let grade4 = "";
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    grade4 = String((await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0].id);
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await actorFor(`test.teacher.${i}`);
      const c = (await readableClasses(repo, t)).find((x) => String(x.gradeId) === grade4);
      if (c) { teacher = t; classId = String(c.id); break; }
    }
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
  });

  test("meaning keys: same meaning, different spelling", () => {
    assert.equal(meaningKey("Author’s Perspective"), meaningKey("Author's Perspective"));
    assert.equal(meaningKey("Compare and Contrast"), meaningKey("Compare and Contrast Texts"));
    assert.notEqual(meaningKey("Cause and Effect"), meaningKey("Compare and Contrast"));
  });

  test("one master list feeds every list; a new skill appears everywhere; duplicates are merged only on request and can be undone", async () => {
    const before = await masterSkills(repo, admin.schoolId!, { grade: 4 });
    assert.ok(before.length > 10);
    assert.ok(before.every((k) => !k.code.endsWith(".curriculum-map-unclassified")));
    // a skill outside every unit (like Grammar or an imported bank), with a question
    const base = before.find((k) => /compare and contrast/i.test(k.name)) ?? before[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: grade4 }))[0];
    const fam = (await repo.findUnique("Skill", { id: base.id }))!;
    const dup = await repo.create("Skill", { curriculumId: cur.id, familyId: fam.familyId, code: "G4.bank.dup-test", name: `${base.name}’s`.replace(/’s$/, " Texts"), domain: fam.domain, category: fam.category, sequence: 999, isActive: true });
    for (const l of await repo.findMany("SkillStandard", { skillId: base.id })) await repo.create("SkillStandard", { skillId: dup.id, standardId: l.standardId, isPrimary: l.isPrimary });
    const qid = await createDraft(repo, admin, { skillId: String(dup.id), type: "MULTIPLE_CHOICE", stem: "Which detail shows how the two animals are different from each other?", level: 4, whyCorrect: "Because.", options: [{ label: "A", text: "Only one can fly", correct: true, rationale: null }, { label: "B", text: "Both have wings", correct: false, rationale: "No." }] });
    await repo.updateMany("Question", { id: qid }, { status: "PUBLISHED" });
    const after = await masterSkills(repo, admin.schoolId!, { grade: 4 });
    assert.ok(after.some((k) => k.id === String(dup.id) && !k.inUnit && k.questions === 1));
    const tc = await teacherCurriculum(repo, teacher, classId);
    assert.ok(tc!.units.some((u) => u.id === "more" && u.skills.some((k) => k.id === String(dup.id))), "teacher Curriculum lists skills outside units");
    assert.ok((await gameSkills(repo, teacher, 4)).some((k) => k.id === String(dup.id)), "games read the master list");
    const groups = await duplicateSkills(repo, admin);
    const g = groups.find((x) => x.skills.some((k) => k.id === String(dup.id)));
    assert.ok(g, "found as a possible duplicate");
    await assert.rejects(mergeSkills(repo, teacher, base.id, String(dup.id)), ForbiddenError);
    const keep = g!.skills.find((k) => k.id !== String(dup.id))!.id;
    const r = await mergeSkills(repo, admin, keep, String(dup.id));
    assert.equal(r.questions, 1);
    assert.equal(String((await repo.findUnique("Question", { id: qid }))!.skillId), keep);
    assert.ok(!(await masterSkills(repo, admin.schoolId!, { grade: 4 })).some((k) => k.id === String(dup.id)), "switched off, not deleted");
    assert.ok(await repo.findUnique("Skill", { id: String(dup.id) }));
    await undoMerge(repo, admin, String(dup.id));
    assert.equal(String((await repo.findUnique("Question", { id: qid }))!.skillId), String(dup.id));
    assert.ok((await masterSkills(repo, admin.schoolId!, { grade: 4 })).some((k) => k.id === String(dup.id)));
  });

  test("skill games: own grade only, joins by QR are recorded for the teacher; “My skills” lists assigned first", async () => {
    const st = await studentActor(students[0]);
    const g4 = (await masterSkills(repo, admin.schoolId!, { grade: 4, withQuestionsOnly: true }))[0];
    const g5 = (await masterSkills(repo, admin.schoolId!, { grade: 5, withQuestionsOnly: true }))[0];
    assert.equal(await canPlaySkill(repo, st, g4.id), true);
    assert.equal(await canPlaySkill(repo, st, g5.id), false);
    assert.equal(await canPlaySkill(repo, teacher, g4.id), false);
    await recordGameJoin(repo, st, g4.id, "QR");
    const joins = await qrJoins(repo, teacher, classId);
    assert.ok(joins.some((j) => j.via === "QR" && j.skill === g4.name));
    const mine = await mySkills(repo, st);
    assert.ok(mine.free.length > 0);
    assert.ok(mine.free.flatMap((x) => x.skills).every((k) => !mine.assigned.some((a) => a.id === k.id)));
  });

  test("section status for the class: not assigned → in progress / needs help", async () => {
    const code = "G4.U1.TS2.ACS";
    const ids: string[] = [];
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 2; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${lv} status question ${i} about the plot of the story`, level: 4, whyCorrect: "Because.", mapNodeCode: `${code}.${lv}`, options: [{ label: "A", text: `right ${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${lv}${i}`, correct: false, rationale: "No." }] }));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    assert.equal((await sectionStatuses(repo, teacher, classId)).get(code), undefined);
    await assignFromMap(repo, teacher, { classId, categoryCode: code, dueAt: new Date(Date.now() + 86_400_000) });
    const s1 = (await sectionStatuses(repo, teacher, classId)).get(code)!;
    assert.equal(s1.state, "IN_PROGRESS");
    assert.equal(s1.total, students.length);
  });

  test("badges: earned from real work, saved once; only the student's own", async () => {
    const sid = students[1];
    const st = await studentActor(sid);
    let b = await studentBadges(repo, sid);
    assert.equal(b.find((x) => x.code === "level-up")!.earned, false);
    await repo.create("AuditLog", { actorId: st.userId, action: "level.change", entityType: "Student", entityId: sid, before: { level: "BELOW" }, after: { level: "ON", source: "ADAPTIVE", outcome: "CHANGED", category: "ACS" }, createdAt: new Date() });
    b = await studentBadges(repo, sid);
    const up = b.find((x) => x.code === "level-up")!;
    assert.equal(up.earned, true);
    assert.ok(up.earnedAt);
    await studentBadges(repo, sid);
    assert.equal(await repo.count("StudentBadge", { studentId: sid }), b.filter((x) => x.earned).length, "saved once");
  });

  test("parent report: teacher previews and shares; the parent sees it only after sharing", async () => {
    const sid = students[2];
    const pu = await repo.create("User", { username: "test.parent.u16", displayName: "Test Parent", role: "PARENT", schoolId: admin.schoolId, isActive: true });
    const p = await repo.create("Parent", { userId: pu.id });
    await repo.create("ParentStudent", { parentId: p.id, studentId: sid, relationship: "father" });
    const parent = await resolveActor(repo, pu);
    const r = await parentReport(repo, teacher, sid);
    assert.equal(r.studentId, sid);
    assert.ok(r.summary.en && r.summary.ar);
    await assert.rejects(parentReport(repo, parent, sid), /not shared/);
    await shareParentReport(repo, teacher, sid, true, "Great effort this month!");
    const seen = await parentReport(repo, parent, sid);
    assert.equal(seen.share.note, "Great effort this month!");
    assert.ok(await repo.count("Notification", { userId: pu.id }));
    await assert.rejects(parentReport(repo, parent, students[3]), ForbiddenError, "another child");
    await shareParentReport(repo, teacher, sid, false, null);
    await assert.rejects(parentReport(repo, parent, sid), /not shared/);
  });

  test("teacher follow-up: warnings by the school's rules, with context; teachers cannot open it", async () => {
    await assert.rejects(teacherFollowup(repo, teacher), ForbiddenError);
    await setFollowupRules(repo, admin, { noLoginDays: 3 });
    const v = await teacherFollowup(repo, admin);
    assert.equal(v.rules.noLoginDays, 3);
    const me = v.rows.find((r) => r.userId === teacher.userId)!;
    assert.ok(me.students > 0);
    assert.ok(me.warnings.some((w) => /No sign-in/.test(w) && /class/.test(w)), "never signed in (test data)");
    await assert.rejects(setFollowupRules(repo, admin, { noLoginDays: 0 }), /1 to 90/);
  });
});
