import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { decideTier, nextCheckAt, MONITOR_EVERY_DAYS, REFER_TEXT, type TierEvidenceInput } from "../src/server/tiers/rules";
import { computeTiers, setTierManually, unlockTier } from "../src/server/tiers/tiers";
import { classTiers, schoolTierSummary, studentTierProgress } from "../src/server/tiers/views";
import { dataMeetingSnapshot, listDataMeetings, saveDataMeeting } from "../src/server/tiers/data-meeting";
import { evidenceLevels, withFluency } from "../src/server/curriculum-map/evidence-level";
import { suggestedSections } from "../src/server/plans/start";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const NOW = new Date("2026-10-10T08:00:00Z");
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);
const base = (over: Partial<TierEvidenceInput> = {}): TierEvidenceInput => ({
  current: null, diagnostic: null, map: null, checks: [], practice: { avgMastery: 70, skills: 3, weakSkill: null },
  risk: 20, riskHistory: [], fluency: null, interventions: [], ...over,
});
const chk = (n: number, pct: number) => ({ at: ago(n), pct, kind: "WEEKLY" as const });
// Update 39B: a check read from its answers (ability θ on the grade scale, 8 items)
const chkT = (n: number, theta: number, items = 8) => ({ at: ago(n), pct: 50, kind: "WEEKLY" as const, theta, se: 0.6, items });

describe("🧭 tier rules (pure)", () => {
  test("Tier 3 paths: MAP ≤ 10th, two very low checks, low fluency with low comprehension, no gain after 2 interventions (+ referral)", () => {
    assert.equal(decideTier(base({ map: { percentile: 8, at: ago(20) } }), NOW).tier, 3);
    // Update 39B: % correct of a check without readable answers: very low = under 40%, low = under 60%
    const two = decideTier(base({ checks: [chk(14, 30), chk(7, 20)] }), NOW);
    assert.deepEqual([two.tier, two.triggers.includes("T3_CHECKS")], [3, true]);
    const flu = decideTier(base({ fluency: { percentile: 6, wcpm: 50, at: ago(3) }, diagnostic: { pct: 40, level: "BELOW", at: ago(30) } }), NOW);
    assert.deepEqual([flu.tier, flu.triggers.includes("T3_FLUENCY")], [3, true]);
    assert.equal(decideTier(base({ fluency: { percentile: 6, wcpm: 50, at: ago(3) } }), NOW).tier, 2, "low fluency alone (comprehension fine) = Tier 2");
    const ref = decideTier(base({ interventions: [{ endedAt: ago(40), skillId: "a", gain: 1 }, { endedAt: ago(10), skillId: "b", gain: 0 }] }), NOW);
    assert.deepEqual([ref.tier, ref.refer], [3, true]);
    assert.match(ref.reason, new RegExp(REFER_TEXT));
    assert.equal(decideTier(base({ interventions: [{ endedAt: ago(40), skillId: "a", gain: 1 }, { endedAt: ago(10), skillId: "b", gain: 9 }] }), NOW).refer, false, "the last one worked");
  });

  test("Tier 2 paths and Tier 1", () => {
    // Update 39B: an early-warning risk or ONE Diagnostic moves a tier only with an academic source agreeing
    assert.equal(decideTier(base({ risk: 70 }), NOW).tier, 1, "risk alone is noted");
    assert.equal(decideTier(base({ risk: 70, map: { percentile: 35, at: ago(20) } }), NOW).tier, 2);
    assert.equal(decideTier(base({ map: { percentile: 22, at: ago(20) } }), NOW).tier, 2);
    assert.equal(decideTier(base({ fluency: { percentile: 20, wcpm: 80, at: ago(3) } }), NOW).tier, 2);
    assert.equal(decideTier(base({ diagnostic: { pct: 45, level: "BELOW", at: ago(30) } }), NOW).tier, 1, "one Diagnostic alone is noted");
    assert.equal(decideTier(base({ diagnostic: { pct: 45, level: "BELOW", at: ago(30) }, map: { percentile: 35, at: ago(40) } }), NOW).tier, 2);
    // Update 39B: one short check never moves a tier; two low checks in a row do
    assert.equal(decideTier(base({ checks: [chk(7, 55)] }), NOW).tier, 1, "one 5-item check alone");
    const last = decideTier(base({ checks: [chkT(14, -0.8), chkT(7, -0.9)], practice: { avgMastery: 50, skills: 2, weakSkill: { skillId: "sk", mastery: 30 } } }), NOW);
    assert.deepEqual([last.tier, last.focusSkillId], [2, "sk"]);
    assert.match(last.reason, /two checks in a row below grade level/);
    const one = decideTier(base({ map: { percentile: 55, at: ago(20) }, checks: [chk(7, 90)] }), NOW);
    assert.deepEqual([one.tier, one.focusSkillId, one.monitorEveryDays], [1, null, 0]);
  });

  test("hysteresis: down only after 2 checks ≥ 80% in a row, or low risk for 4+ weeks (one tier at a time, 14+ days in a tier)", () => {
    const cur = { tier: 2 as const, since: ago(30) };
    const held = decideTier(base({ current: cur, checks: [chk(14, 70), chk(7, 85)] }), NOW);
    assert.deepEqual([held.tier, held.held], [2, true]);
    assert.match(held.reason, /Stays in Tier 2/);
    const out = decideTier(base({ current: cur, checks: [chk(14, 85), chk(7, 90)] }), NOW);
    assert.deepEqual([out.tier, out.held], [1, false]);
    assert.match(out.reason, /Back to Tier 1/);
    const hist = Array.from({ length: 30 }, (_, k) => ({ at: ago(k), score: 30 }));
    assert.equal(decideTier(base({ current: cur, risk: 30, riskHistory: hist }), NOW).tier, 1, "risk < 40 for 4+ weeks");
    assert.equal(decideTier(base({ current: cur, risk: 30, riskHistory: hist.slice(0, 10) }), NOW).tier, 2, "only 10 days of low risk");
    // two recent strong checks outweigh an older MAP result
    assert.equal(decideTier(base({ current: cur, map: { percentile: 20, at: ago(60) }, checks: [chk(14, 85), chk(7, 90)] }), NOW).tier, 1);
    // moving up after 14+ days in the tier (or at once when two sources agree)
    assert.equal(decideTier(base({ current: { tier: 1, since: ago(90) }, map: { percentile: 5, at: ago(1) } }), NOW).tier, 3);
    assert.equal(decideTier(base({ current: { tier: 1, since: ago(3) }, map: { percentile: 5, at: ago(1) } }), NOW).tier, 1, "one source within 14 days waits");
    assert.equal(decideTier(base({ current: { tier: 1, since: ago(3) }, map: { percentile: 5, at: ago(1) }, fluency: { percentile: 5, wcpm: 40, at: ago(1) } }), NOW).tier, 3, "two sources agree");
  });

  test("monitoring cadence: Tier 1 three times a year, Tier 2 every 14 days, Tier 3 every 7", () => {
    assert.deepEqual(MONITOR_EVERY_DAYS, { 1: 0, 2: 14, 3: 7 });
    assert.equal(nextCheckAt(1, NOW, null), null);
    assert.equal(nextCheckAt(2, ago(20), ago(3))!.toISOString(), new Date(ago(3).getTime() + 14 * DAY).toISOString());
    assert.equal(nextCheckAt(3, NOW, null)!.toISOString(), new Date(NOW.getTime() + 7 * DAY).toISOString());
  });

  test("placement: comprehension × fluency", () => {
    const low = { percentile: 12, wcpm: 70, at: "2026-10-01", below: true }, ok = { percentile: 50, wcpm: 120, at: "2026-10-01", below: false };
    assert.equal(withFluency("ON", "MAP", false, ok).level, "ON");
    assert.equal(withFluency("ABOVE", "MAP", false, ok).level, "ABOVE");
    const noted = withFluency("ON", "MAP", false, low);
    assert.deepEqual([noted.level, /fluency below/.test(noted.note!)], ["ON", true]);
    assert.equal(withFluency("ON", "MAP", true, low).level, "BELOW", "borderline comprehension + weak fluency");
    assert.equal(withFluency("BELOW", "PLATFORM", false, low).level, "BELOW");
    assert.equal(withFluency("ABOVE", "LEXILE", false, low).level, "ON");
    assert.equal(withFluency("ABOVE", "TEACHER", false, low).level, "ABOVE", "the teacher's choice is not changed");
  });
});

describe("🧭 support tiers on the Test School", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let otherTeacher: Actor; let foreignTeacher: Actor;
  let classId: string; let ids: string[]; let schoolId: string;
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    schoolId = String(admin.schoolId);
    teacher = await actorOf("test.teacher.1");
    const t1 = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t1.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    for (let n = 2; n <= 6; n++) {
      const a = await actorOf(`test.teacher.${n}`);
      const t = (await repo.findUnique("Teacher", { userId: a.userId }))!;
      if (!(await repo.findUnique("ClassTeacher", { classId, teacherId: t.id }))) { otherTeacher = a; break; }
    }
    const foreign = (await repo.findMany("User", { role: "TEACHER" })).find((u) => u.schoolId !== schoolId)!;
    foreignTeacher = await resolveActor(repo, foreign);
  });

  test("computeTiers writes tiers, changes and one TIER_CHANGE notice per teacher; idempotent", async () => {
    const [a, b] = ids;
    await repo.create("MapResult", { studentId: a, testDate: ago(10), subject: "Reading", goalName: null, rit: 170, achievementPercentile: 6, termName: "Fall 2026", importedAt: NOW });
    // Update 39B: two low checks in a row (one short check alone never moves a tier)
    await repo.create("WeeklyCheck", { studentId: b, week: "2026-09-27", assignmentId: "wk-b0", correct: 4, total: 10, completedAt: ago(12), createdAt: ago(12) });
    await repo.create("WeeklyCheck", { studentId: b, week: "2026-10-04", assignmentId: "wk-b", correct: 5, total: 10, completedAt: ago(5), createdAt: ago(5) });
    const r = await computeTiers(repo, schoolId, NOW);
    assert.equal(r.students, 200);
    assert.ok(r.changed >= 2, JSON.stringify(r));
    const ta = (await repo.findUnique("StudentTier", { studentId: a }))!, tb = (await repo.findUnique("StudentTier", { studentId: b }))!;
    assert.deepEqual([Number(ta.tier), Number(tb.tier), Number(ta.monitorEveryDays), String(ta.source)], [3, 2, 7, "AUTO"]);
    assert.match(String(ta.reason), /Fall MAP \(\d{4}-\d\d-\d\d\): Reading at the 6th percentile/);
    assert.match(String(ta.reason), /^Provisional \(from Fall MAP/, "Update 39B: a MAP-only tier is provisional");
    const change = (await repo.findMany("TierChange", { studentId: a, source: "AUTO" }))[0];
    assert.deepEqual([Number(change.fromTier), Number(change.toTier)], [1, 3]);
    const notes = await repo.findMany("Notification", { userId: teacher.userId, type: "TIER_CHANGE" });
    assert.equal(notes.length, 1, "one summary for the teacher");
    // plain words for the teacher, the Tier term kept in brackets
    assert.match(String(notes[0].body), /needs more help — now needs strong support \(Tier 3\)/);
    const again = await computeTiers(repo, schoolId, NOW);
    assert.equal(again.changed, 0, "nothing moves on a second run");
    assert.equal(await repo.count("Notification", { userId: teacher.userId, type: "TIER_CHANGE" }), 1);
    const view = await classTiers(repo, teacher, classId, NOW);
    assert.equal(view.rows[0].studentId, a, "Tier 3 first");
    assert.equal(view.counts[1] + view.counts[2] + view.counts[3], view.total);
    const sum = await schoolTierSummary(repo, admin, NOW);
    assert.equal(sum.grades.reduce((t, g) => t + g.students, 0), 200);
    await assert.rejects(schoolTierSummary(repo, teacher), ForbiddenError);
  });

  test("the teacher's override locks the tier; other teachers and other schools are refused; unlock lets the rules decide", async () => {
    const a = ids[0];
    await assert.rejects(setTierManually(repo, foreignTeacher, { studentId: a, tier: 1, reason: "Doing fine in class" }), ForbiddenError);
    if (otherTeacher) await assert.rejects(setTierManually(repo, otherTeacher, { studentId: a, tier: 1, reason: "Doing fine in class" }), ForbiddenError);
    await assert.rejects(setTierManually(repo, teacher, { studentId: a, tier: 1, reason: "" }), /reason/);
    await setTierManually(repo, teacher, { studentId: a, tier: 1, reason: "Doing fine in class" }, NOW);
    let row = (await repo.findUnique("StudentTier", { studentId: a }))!;
    assert.deepEqual([Number(row.tier), String(row.source), Boolean(row.locked)], [1, "TEACHER", true]);
    const r = await computeTiers(repo, schoolId, new Date(NOW.getTime() + DAY));
    assert.ok(r.locked >= 1);
    assert.equal(Number((await repo.findUnique("StudentTier", { studentId: a }))!.tier), 1, "the rules leave a locked tier");
    await unlockTier(repo, teacher, a, new Date(NOW.getTime() + DAY));
    row = (await repo.findUnique("StudentTier", { studentId: a }))!;
    assert.deepEqual([Number(row.tier), String(row.source), Boolean(row.locked)], [3, "AUTO", false]);
    const p = await studentTierProgress(repo, teacher, a, NOW);
    assert.ok(p.history.some((h) => h.source === "TEACHER" && h.by), "the override is in the history");
    await assert.rejects(studentTierProgress(repo, foreignTeacher, a, NOW), ForbiddenError);
  });

  test("reteach: the focus skill is assigned with an 8-question re-check, once; the re-check result is recorded", async () => {
    const sid = ids[2];
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    const types = new Set((await repo.findMany("QuestionType", {})).filter((t) => t.isAutoScored !== false && t.code !== "SHORT_ANSWER").map((t) => String(t.id)));
    let skill = skills[0];
    for (const k of skills) { const q = await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED", deletedAt: null }); if (q.filter((x) => types.has(String(x.typeId))).length >= 8) { skill = k; break; } }
    await repo.create("StudentSkillMastery", { studentId: sid, skillId: skill.id, score: 30, attempts: 8, correct: 2, lastPracticedAt: ago(2), band: "BEGINNING" });
    // in Tier 1 for a month (Update 39B: a tier changes at most every 14 days unless two sources agree)
    await repo.updateMany("StudentTier", { studentId: sid }, { since: ago(30) });
    await repo.create("WeeklyCheck", { studentId: sid, week: "2026-09-27", assignmentId: "wk-c0", correct: 5, total: 10, completedAt: ago(12), createdAt: ago(12) });
    await repo.create("WeeklyCheck", { studentId: sid, week: "2026-10-04", assignmentId: "wk-c", correct: 5, total: 10, completedAt: ago(5), createdAt: ago(5) });
    const r = await computeTiers(repo, schoolId, NOW);
    assert.ok(r.routed >= 1, JSON.stringify(r));
    const route = (await repo.findMany("TierChange", { studentId: sid, source: "RETEACH" }));
    assert.equal(route.length, 1);
    const ev = (typeof route[0].evidence === "string" ? JSON.parse(route[0].evidence) : route[0].evidence) as { skillId: string; assignmentId: string; recheck: { assignmentId: string } };
    assert.equal(ev.skillId, skill.id);
    assert.ok(await repo.findUnique("AssignmentStudent", { assignmentId: ev.assignmentId, studentId: sid }), "the skill is assigned to the student");
    const set = (await repo.findUnique("Assignment", { id: ev.recheck.assignmentId }))!;
    assert.match(String(set.title), /^Re-check: /);
    const avail = (await repo.findMany("Question", { skillId: skill.id, status: "PUBLISHED", deletedAt: null })).filter((x) => types.has(String(x.typeId))).length;
    assert.equal(await repo.count("AssessmentQuestion", { assessmentId: set.assessmentId }), Math.min(8, avail), "Update 39B: 8 items (fewer only when the skill has fewer)");
    await computeTiers(repo, schoolId, NOW);
    assert.equal(await repo.count("TierChange", { studentId: sid, source: "RETEACH" }), 1, "idempotent");
    // the student takes the re-check: 5 of 5
    const later = new Date(NOW.getTime() + 11 * DAY);
    await repo.create("PracticeSession", { studentId: sid, assignmentId: set.id, assessmentId: set.assessmentId, mode: "TEACHER_QUIZ", startedAt: later, endedAt: later, questionCount: 5, correctCount: 5 });
    await repo.updateMany("AssignmentStudent", { assignmentId: set.id, studentId: sid }, { status: "COMPLETED", completedAt: later });
    const r2 = await computeTiers(repo, schoolId, new Date(later.getTime() + 3_600_000));
    assert.ok(r2.rechecksEvaluated >= 1);
    const done = (await repo.findMany("TierChange", { studentId: sid, source: "RETEACH" }))[0];
    const out = ((typeof done.evidence === "string" ? JSON.parse(done.evidence) : done.evidence) as { outcome: { pct: number; passed: boolean } }).outcome;
    assert.deepEqual([out.pct, out.passed], [100, true]);
    const p = await studentTierProgress(repo, teacher, sid, later);
    assert.ok(p.points.some((x) => x.sets === 100) && p.points.some((x) => x.weekly === 50));
    // r86: the teacher is told right away that the re-check came back (and passed) — they don't have to come back
    // to the Support plan page on their own to notice.
    assert.ok(r2.recheckOutcomesNotified >= 1, JSON.stringify(r2));
    const notes = await repo.findMany("Notification", { userId: teacher.userId, type: "TIER_CHANGE", createdAt: { gte: new Date(later.getTime() + 3_600_000 - 1000) } });
    const outcomeNote = notes.find((n) => String(n.body).includes("passed the re-check"));
    assert.ok(outcomeNote, "a re-check-outcome notification was created");
    assert.match(String(outcomeNote!.link), /^\/teacher\/plans\/support/);
  });

  test("reteach outcome: a missed (never taken) re-check still notifies the teacher, worded as a check-in, not a pass/fail", async () => {
    const sid = ids[3] ?? ids[0];
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    const types = new Set((await repo.findMany("QuestionType", {})).filter((t) => t.isAutoScored !== false && t.code !== "SHORT_ANSWER").map((t) => String(t.id)));
    let skill = skills[1] ?? skills[0];
    for (const k of skills) { const q = await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED", deletedAt: null }); if (q.filter((x) => types.has(String(x.typeId))).length >= 8) { skill = k; break; } }
    await repo.create("StudentSkillMastery", { studentId: sid, skillId: skill.id, score: 25, attempts: 8, correct: 2, lastPracticedAt: ago(2), band: "BEGINNING" });
    await repo.updateMany("StudentTier", { studentId: sid }, { since: ago(30) });
    await repo.create("WeeklyCheck", { studentId: sid, week: "2026-09-27", assignmentId: "wk-m0", correct: 4, total: 10, completedAt: ago(12), createdAt: ago(12) });
    await repo.create("WeeklyCheck", { studentId: sid, week: "2026-10-04", assignmentId: "wk-m", correct: 4, total: 10, completedAt: ago(5), createdAt: ago(5) });
    const r = await computeTiers(repo, schoolId, NOW);
    assert.ok(r.routed >= 1, JSON.stringify(r));
    // let the re-check's due date pass with no attempt at all
    const route = (await repo.findMany("TierChange", { studentId: sid, source: "RETEACH" }))[0];
    const ev = (typeof route.evidence === "string" ? JSON.parse(route.evidence) : route.evidence) as { recheck: { dueAt: string } };
    const wayLater = new Date(new Date(ev.recheck.dueAt).getTime() + DAY);
    const r2 = await computeTiers(repo, schoolId, wayLater);
    assert.ok(r2.rechecksEvaluated >= 1);
    const done = (await repo.findMany("TierChange", { studentId: sid, source: "RETEACH" }))[0];
    const out = ((typeof done.evidence === "string" ? JSON.parse(done.evidence) : done.evidence) as { outcome: { missed: boolean } }).outcome;
    assert.equal(out.missed, true);
    assert.ok(r2.recheckOutcomesNotified >= 1, JSON.stringify(r2));
    const notes = await repo.findMany("Notification", { userId: teacher.userId, type: "TIER_CHANGE", createdAt: { gte: new Date(wayLater.getTime() - 1000) } });
    const missedNote = notes.find((n) => String(n.body).includes("didn't take the re-check"));
    assert.ok(missedNote, "a missed-recheck notification was created, worded as a check-in rather than a failing grade");
  });

  test("placement with fluency: borderline On + weak fluency → Below; strong fluency keeps the level; `why` lists the sources", async () => {
    const [x, y, z] = ids.slice(5, 8);
    const grade = (await classTiers(repo, teacher, classId, NOW)).grade;
    for (const [sid, p] of [[x, 43], [y, 55], [z, 43]] as const) await repo.create("MapResult", { studentId: sid, testDate: ago(20), subject: "Reading", goalName: null, rit: 200, achievementPercentile: p, termName: "Fall 2026", importedAt: NOW });
    // Update 39B: fluency adjusts a level only with 2+ checks (median)
    for (const sid of [x, y]) for (const n of [3, 10]) await repo.create("FluencyCheck", { studentId: sid, wcpm: 40, checkedAt: ago(n), source: "TEACHER" });
    const ev = await evidenceLevels(repo, schoolId, [x, y, z], grade, {}, NOW);
    assert.deepEqual([ev.get(x)!.level, ev.get(x)!.from], ["BELOW", "MAP"]);
    assert.ok(ev.get(x)!.fluency!.percentile! < 25, "percentile computed from WCPM and the grade");
    assert.match(ev.get(x)!.why, /MAP score: .*Fluency \(median of 2 checks.*borderline/);
    assert.equal(ev.get(y)!.level, "ON");
    assert.match(ev.get(y)!.reason, /fluency below/i);
    assert.equal(ev.get(z)!.level, "ON");
    assert.match(ev.get(z)!.why, /No fluency check yet/);
  });

  test("data meetings: snapshot since the last one, decisions saved and listed within the school only", async () => {
    const snap = await dataMeetingSnapshot(repo, teacher, { classId }, NOW);
    assert.ok(snap.tierMoves.length >= 1 && snap.students === ids.length);
    assert.equal(snap.tiers[1] + snap.tiers[2] + snap.tiers[3], ids.length);
    await assert.rejects(saveDataMeeting(repo, teacher, { classId, decisions: [] }), /decision or a note/);
    if (otherTeacher) await assert.rejects(saveDataMeeting(repo, otherTeacher, { classId, decisions: [{ who: "Tier 3", what: "Daily small group" }] }), ForbiddenError);
    await assert.rejects(saveDataMeeting(repo, foreignTeacher, { classId, decisions: [{ who: "x", what: "y" }] }), ForbiddenError);
    const id = await saveDataMeeting(repo, teacher, { classId, heldOn: "2026-10-10", notes: "Good progress.", decisions: [{ who: "Tier 3 students", what: "Daily small group on the focus skill", how: "15 minutes, guided reading", owner: "Class teacher", reviewOn: "2026-10-24" }, { who: "", what: "", how: "" }] }, NOW);
    const mine = await listDataMeetings(repo, teacher);
    assert.equal(mine[0].id, id);
    assert.equal(mine[0].decisions.length, 1, "empty rows dropped");
    assert.equal(mine[0].decisions[0].reviewOn, "2026-10-24");
    assert.equal((await listDataMeetings(repo, admin)).length, 1);
    assert.equal((await listDataMeetings(repo, foreignTeacher)).length, 0, "another school sees nothing");
    const next = await dataMeetingSnapshot(repo, teacher, { classId }, new Date(NOW.getTime() + DAY));
    assert.equal(next.since, "2026-10-10", "the next snapshot starts at the last meeting");
    const grade = (await classTiers(repo, teacher, classId, NOW)).grade;
    const team = await dataMeetingSnapshot(repo, admin, { gradeLevel: grade }, NOW);
    assert.ok(team.students > ids.length);
  });

  test("an RTI plan suggestion uses each Tier 2/3 student's real focus skill (the support-tier rules), never a bare mastery dip for a confirmed Tier 1", async () => {
    const [t1, t2, unscreened] = ids.slice(8, 11);
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    const [skillA, skillB, skillC] = skills;
    // confirmed Tier 1 by the real rules (locked out from matching the RTI suggestion), even though a mastery score
    // alone would look like "struggling" — a single dip should not override evidence-based clearance
    await repo.upsert("StudentTier", { studentId: t1 }, { studentId: t1, schoolId, tier: 1, source: "AUTO", locked: false, reason: "Tier 1: on track.", focusSkillId: null, since: ago(20), reviewAt: null, monitorEveryDays: 0 }, { tier: 1, source: "AUTO", locked: false, reason: "Tier 1: on track.", focusSkillId: null, since: ago(20), reviewAt: null, monitorEveryDays: 0 });
    await repo.create("StudentSkillMastery", { studentId: t1, skillId: skillA.id, score: 30, attempts: 8, correct: 2, lastPracticedAt: ago(2), band: "BEGINNING" });
    // confirmed Tier 2, with its own focus skill from the real rules
    await repo.upsert("StudentTier", { studentId: t2 }, { studentId: t2, schoolId, tier: 2, source: "AUTO", locked: false, reason: "Tier 2: low fluency.", focusSkillId: skillB.id, since: ago(20), reviewAt: null, monitorEveryDays: 14 }, { tier: 2, source: "AUTO", locked: false, reason: "Tier 2: low fluency.", focusSkillId: skillB.id, since: ago(20), reviewAt: null, monitorEveryDays: 14 });
    // not yet screened at all (no StudentTier row): the platform struggling-skills read is the only signal there is
    // (an earlier test in this file already ran computeTiers for the whole school, so clear the row it wrote)
    await repo.deleteMany("StudentTier", { studentId: unscreened });
    await repo.create("StudentSkillMastery", { studentId: unscreened, skillId: skillC.id, score: 35, attempts: 6, correct: 2, lastPracticedAt: ago(2), band: "BEGINNING" });
    const sug = await suggestedSections(repo, teacher, { classId, program: "RTI", studentIds: [t1, t2, unscreened], mode: "suggested" });
    assert.ok(sug.sections.some((k) => k.skillId === skillB.id && (k.studentIds ?? []).includes(t2)), "Tier 2's own focus skill is suggested");
    assert.ok(sug.sections.some((k) => k.skillId === skillC.id && (k.studentIds ?? []).includes(unscreened)), "not-yet-screened falls back to the platform struggling-skills read");
    assert.ok(!sug.sections.some((k) => (k.studentIds ?? []).includes(t1)), "a confirmed Tier 1 is never suggested, even with a low mastery score");
    assert.ok(sug.source?.sources.includes("Tiers"), "the suggestion names the support-tier rules as a source");
  });
});
