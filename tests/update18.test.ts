/**
 * Update 18 (FAKE test data only — the Test School): MAP as NWEA reports it — RIT bands, the six goal-area groups,
 * descriptors and statuses, draft plans the teacher edits and sends, small groups, the mid-unit check, the
 * student's My MAP, the ASG (projection) PDF parser and the bank ↔ MAP linking.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { asgToTable, parseAsg } from "../src/server/map/asg";
import { bandSettings, classPlans, DEFAULT_BANDS, estimateRit, mapProfiles, pickBand, ritBand, sendPlans, sendToGroup, setBandSettings, smallGroups, updatePlan } from "../src/server/map/map-plan";
import { applyLinkSuggestions, areaForStandard, classMatrix, linkFamily, mapLinks, myMap, planDoc, sendCheck, sentPlans } from "../src/server/map/map-more";
import { demoDatabase } from "./helpers/db";

describe("Update 18 · MAP", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor;
  let classId = ""; let students: string[] = [];
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const area = async (code: string) => String((await repo.findUnique("MapGoalArea", { code }))!.id);
  const fall = new Date(Date.UTC(2026, 8, 15));

  /** Fall Reading: overall + goal areas (LIT, INFO, VOCAB) for one student. */
  async function reading(id: string, overall: number, lit: number, info: number, vocab: number, extra: Record<string, unknown> = {}) {
    await repo.create("MapResult", { studentId: id, testDate: fall, subject: "Reading", goalName: null, rit: overall, achievementPercentile: null, projectedGrowth: 9, termName: "Fall 2026", importedAt: fall, ...extra });
    for (const [code, rit] of [["LIT_STRUCTURE", lit], ["LIT_THEME", lit], ["INFO_STRUCTURE", info], ["INFO_CENTRAL_IDEA", info], ["VOCAB", vocab]] as const)
      await repo.create("MapResult", { studentId: id, testDate: fall, subject: "Reading", goalName: code, goalAreaId: await area(code), rit, termName: "Fall 2026", importedAt: fall });
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await actorFor(`test.teacher.${i}`);
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      const g = Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level);
      if (g === 4 && !classId) { teacher = t; classId = String(c.id); } else if (!other) other = t;
    }
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    // fake scores: two weak in Literary Text (same band), one strong reader, one with rapid guessing
    await reading(students[0], 188, 178, 190, 192);
    await reading(students[1], 190, 176, 193, 195);
    await reading(students[2], 214, 216, 220, 212);
    await reading(students[3], 180, 181, 179, 175, { rapidGuessPct: 41 });
  });

  test("RIT bands of 10 (editable): 185 → 181–190, ends open", async () => {
    assert.equal(ritBand(185).label, "181–190");
    assert.equal(ritBand(191).label, "191–200");
    assert.equal(ritBand(200).label, "191–200");
    assert.equal(ritBand(155).label, "160 or below");
    assert.equal(ritBand(248).label, "241 and above");
    await assert.rejects(setBandSettings(repo, teacher, { size: 5, min: 150, max: 250 }), ForbiddenError);
    await assert.rejects(setBandSettings(repo, admin, { size: 50, min: 150, max: 250 }), /5 to 20/);
    await setBandSettings(repo, admin, { size: 5, min: 150, max: 250 });
    assert.equal(ritBand(185, await bandSettings(repo, admin.schoolId)).label, "181–185");
    await setBandSettings(repo, admin, DEFAULT_BANDS);
  });

  test("profiles: six NWEA groups, descriptor by grade norms, FOCUS / MAINTAIN / EXTEND", async () => {
    const p = (await mapProfiles(repo, admin.schoolId!, [students[0], students[2]], "READING"));
    const weak = p.get(students[0])!, strong = p.get(students[2])!;
    assert.equal(weak.term, "Fall 2026");
    assert.deepEqual(weak.areas.map((a) => a.group), ["LIT", "INFO", "VOCAB"]);
    const lit = weak.areas.find((a) => a.group === "LIT")!;
    assert.equal(lit.band, "171–180");
    assert.equal(lit.status, "FOCUS", "10 under the overall RIT");
    assert.equal(weak.fall?.projection, 197, "Fall + projected growth");
    assert.ok(strong.areas.some((a) => a.status === "EXTEND" || a.status === "MAINTAIN"));
    assert.ok(["Low", "LoAvg"].includes(String(lit.descriptor)), `G4 Fall 178 is low (got ${lit.descriptor})`);
  });

  test("questions of the band and the band above, widened when there are too few", () => {
    const pool = [170, 175, 183, 185, 188, 192, 199, 205, 230].map((rit, i) => ({ id: `q${i}`, skillId: "k", rit }));
    const p = pickBand(pool, 181, 190, 10, null, 3);
    assert.deepEqual(p.ids, ["q2", "q3", "q4", "q5", "q6"], "181–200");
    const wide = pickBand(pool, 181, 190, 10, null, 8);
    assert.ok(wide.ids.length >= 8 && wide.from < 181);
  });

  test("draft plans: teacher previews, edits (areas, skills, count, due, note) and sends; the student is notified", async () => {
    const v = await classPlans(repo, teacher, classId, "READING");
    assert.equal(v.plans.length, 4, "a draft for every student with scores");
    assert.ok(v.noScores.length > 0);
    const p0 = v.plans.find((p) => p.studentId === students[0])!;
    assert.equal(p0.status, "DRAFT");
    assert.equal(p0.items[0].group, "LIT", "the weakest FOCUS area first");
    assert.ok(p0.items[0].questions > 0);
    await assert.rejects(updatePlan(repo, other, p0.id, { items: [] }), ForbiddenError);
    const skill = p0.items[0].allSkills[0].id;
    await updatePlan(repo, teacher, p0.id, { items: p0.items.map((i) => ({ group: i.group, skillIds: i.group === "LIT" ? [skill] : i.skillIds, count: 12, keep: true })), addGroup: "VOCAB", note: "Read slowly.", dueAt: new Date(Date.UTC(2026, 9, 30)) });
    const edited = (await classPlans(repo, teacher, classId, "READING")).plans.find((p) => p.id === p0.id)!;
    assert.ok(edited.items.some((i) => i.group === "VOCAB"));
    assert.deepEqual(edited.items.find((i) => i.group === "LIT")!.skills.map((k) => k.id), [skill]);
    assert.equal(edited.note, "Read slowly.");
    // preview as the student: not visible before sending
    await assert.rejects(planDoc(repo, await studentActor(students[0]), p0.id), ForbiddenError);
    const r = await sendPlans(repo, teacher, [p0.id]);
    assert.equal(r.sent, 1);
    assert.ok(r.sets >= 2);
    const doc = await planDoc(repo, await studentActor(students[0]), p0.id);
    assert.equal(doc.status, "SENT");
    assert.ok(doc.items.every((i) => i.assignmentId), "each area is a MAP set");
    const n = await repo.findMany("Notification", { userId: (await repo.findUnique("Student", { id: students[0] }))!.userId });
    assert.ok(n.some((x) => /MAP plan is ready/.test(String(x.title))));
    const a = await repo.findMany("Assignment", { id: { in: doc.items.map((i) => i.assignmentId!) } });
    assert.ok(a.every((x) => x.track === "MAP"));
    // send the rest of the class at once
    const all = await sendPlans(repo, teacher, (await classPlans(repo, teacher, classId, "READING")).plans.map((p) => p.id));
    assert.equal(all.sent, 3);
    assert.equal((await sentPlans(repo, students[1])).length, 1);
  });

  test("matrix: bands per area, counts per group, retest flag from rapid guessing; other teachers cannot read it", async () => {
    const m = await classMatrix(repo, teacher, classId, "READING");
    assert.equal(m.rows.length, 4);
    assert.equal(m.rows[0].studentId, students[3], "lowest RIT first");
    assert.equal(m.rows[0].retest, true);
    assert.ok(m.groups.find((g) => g.key === "LIT")!.focus >= 2);
    await assert.rejects(classMatrix(repo, other, classId, "READING"), ForbiddenError);
  });

  test("small groups: same FOCUS area + same band; one set for the group", async () => {
    const g = await smallGroups(repo, teacher, classId, "READING");
    const lit = g.find((x) => x.group === "LIT" && x.band === "171–180")!;
    assert.deepEqual(lit.students.map((x) => x.id).sort(), [students[0], students[1]].sort());
    const r = await sendToGroup(repo, teacher, classId, { group: "LIT", low: lit.low, high: lit.high, studentIds: lit.students.map((x) => x.id) });
    assert.ok(r.questions >= 3);
  });

  test("mid-unit check and the RIT estimate", async () => {
    const r = await sendCheck(repo, teacher, classId, "READING");
    assert.ok(r.sets >= 2 && r.students === 4);
    assert.equal(await estimateRit(repo, admin.schoolId!, students[0], "READING"), null, "needs 15 careful answers");
  });

  test("My MAP: Fall results, goal counter, areas by MAP scores (by practice before scores), the plan", async () => {
    const me = await myMap(repo, await studentActor(students[0]));
    const r = me.subjects.find((x) => x.subject === "READING")!;
    assert.equal(r.orderedBy, "MAP");
    assert.equal(r.areas[0].group, "LIT", "weakest MAP area first");
    assert.equal(r.goal?.target, 197);
    assert.equal(r.goal?.left, 9);
    assert.equal(me.plans.length, 1);
    const l = me.subjects.find((x) => x.subject === "LANGUAGE")!;
    assert.equal(l.orderedBy, "PRACTICE", "no Language scores yet → by practice");
    await assert.rejects(myMap(repo, teacher), ForbiddenError);
  });

  test("ASG PDF lines → scores with the Spring projection (fake rows)", () => {
    const p = parseAsg([
      "Term Tested: Fall 2026-2027", "Norms Reference Data: 2025 Norms", "Language Arts: Reading",
      "9900001 Doe, Jane 4 9/10/2026 193-   197   -201 45-  53  -61 205 8",
      "9900002 Roe, Sam Lee 4 9/10/2026 170-174-178 9-13-18 186 12",
      "Language Arts: Language Usage",
      "9900001 Doe, Jane 4 9/11/2026 188-192-196 30-38-46 200 8",
    ]);
    assert.equal(p.term, "Fall 2026-2027");
    assert.equal(p.norms, "2025 Norms");
    assert.equal(p.season, "FALL");
    assert.equal(p.rows.length, 3);
    assert.deepEqual([p.rows[0].rit, p.rows[0].percentile, p.rows[0].projectedRit, p.rows[0].projectedGrowth], [197, 53, 205, 8]);
    assert.equal(p.rows[1].name, "Roe, Sam Lee");
    assert.equal(p.rows[2].subject, "LANGUAGE");
    const t = asgToTable(p);
    assert.equal(t.length, 3, "header + 2 students");
  });

  test("bank ↔ MAP goal areas: suggestion from the CCSS standard, admin applies or changes it", async () => {
    assert.equal(areaForStandard("CCSS.ELA-LITERACY.L.4.1a"), "LANG_GRAMMAR");
    assert.equal(areaForStandard("L.5.2"), "LANG_MECHANICS");
    assert.equal(areaForStandard("RL.4.2"), "LIT_THEME");
    assert.equal(areaForStandard("RI.6.5"), "INFO_STRUCTURE");
    assert.equal(areaForStandard("RI.4.4"), "VOCAB");
    assert.equal(areaForStandard("W.4.2"), "WRITING_ORG");
    assert.equal(areaForStandard("SL.4.1"), null);
    await assert.rejects(mapLinks(repo, teacher), ForbiddenError);
    const v = await mapLinks(repo, admin);
    assert.ok(v.rows.length > 10 && v.areas.length === 10);
    const f = v.rows.find((r) => r.areaCode && r.suggested)!;
    await linkFamily(repo, admin, f.familyId, null);
    assert.equal((await mapLinks(repo, admin)).rows[0].familyId, f.familyId, "unlinked first");
    assert.ok((await applyLinkSuggestions(repo, admin)) >= 1);
    assert.ok((await mapLinks(repo, admin)).rows.find((r) => r.familyId === f.familyId)!.areaCode);
  });
});
