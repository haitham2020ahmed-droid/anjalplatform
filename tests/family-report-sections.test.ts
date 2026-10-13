/**
 * 👪 Family reports (AUTO): the Writing section (approved rubric grades only, never the AI's suggestion or a draft
 * grade), the Reading level (ReadRise) section, the Fluency Coach plan with two home ideas — and no Below / On level /
 * Above / Tier wording anywhere a family (and so the student) can read. The approval flow is unchanged.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { approvedForFamily, autoContent, createFamilyReport, familyReport, reviewFamilyReport, submitFamilyReport, type FamilyContent } from "../src/server/reports/family-reports";
import { commentParts, criterionWords, fluencyGoalWords, gradeGoalWords, hasLevelWords, homeTips } from "../src/server/reports/family-sections";
import { buildRemedialPlan } from "../src/server/fluency/remedial";
import * as L from "../src/server/writing/locked";
import { demoDatabase } from "./helpers/db";

const RUBRIC = {
  title: "Opinion essay",
  criteria: [
    { title: "Ideas", description: "", levels: [{ label: "Below Standard", points: 1, description: "" }, { label: "Approaching", points: 2, description: "" }, { label: "Meets", points: 3, description: "" }, { label: "Above Standard", points: 4, description: "" }] },
    { title: "Organization", description: "", levels: [{ label: "Beginning", points: 0, description: "" }, { label: "Developing", points: 2, description: "" }, { label: "Proficient", points: 4, description: "" }] },
  ],
};
const DAY = 86_400_000;
const NOW = new Date("2026-10-12T09:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const all = (c: FamilyContent) => [c.summary, c.message, ...c.sections.flatMap((x) => [x.heading, ...x.lines])].join("\n");
/** the words a student must never read about themselves */
const FORBIDDEN = /\bBelow\b|\bAbove\b|\bOn level\b|\bOn grade level\b|\bTier\b|\bRTI\b|grade benchmark/;

describe("👪 Family report: Writing, ReadRise, Fluency Coach plan — friendly words only", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let sid = ""; let classId = "";
  let approvedTask = ""; let draftTask = ""; let aiTask = "";

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1");
    classId = String((await readableClasses(repo, teacher))[0].id);
    sid = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    const st = await repo.findUnique("Student", { id: sid });
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st!.userId }))!);
    const schoolId = String(admin.schoolId);

    // ✍️ three locked rubric tasks: approved & returned / graded but not approved / an AI suggestion only
    const base = { classId, promptHtml: "<p>Should our school have a garden?</p>", minWords: null, timeLimitMin: null, dueAt: new Date(NOW.getTime() + 7 * DAY), rubric: RUBRIC, assignTo: "STUDENTS" as const, studentIds: [sid] };
    const essay = "Our school should have a garden. First, we can learn about plants. Also, fresh food is good for us.";
    const make = async (title: string, at: Date) => { const id = await L.createLockedTask(repo, teacher, { ...base, title }, at); await L.startLocked(repo, student, id, at); await L.submitLocked(repo, student, id, essay, new Date(at.getTime() + 60_000)); return id; };
    approvedTask = await make("School garden", ago(10));
    draftTask = await make("Pets at school", ago(6));
    aiTask = await make("Longer holidays", ago(5));
    await L.saveLockedGrade(repo, teacher, approvedTask, sid, { levels: { c1: 3, c2: 1 }, comment: "Great opinion with two clear reasons. You are above grade level. Next, add linking words like first and because." }, true, ago(8));
    // a later draft regrade (not approved) must not leak: the family sees the approved one
    await L.saveLockedGrade(repo, teacher, approvedTask, sid, { levels: { c1: 0, c2: 0 }, comment: "draft regrade" }, false, ago(7));
    await L.saveLockedGrade(repo, teacher, draftTask, sid, { levels: { c1: 2, c2: 2 }, comment: "Not approved yet." }, false, ago(4));
    await repo.updateMany("WritingSubmission", { taskId: aiTask, studentId: sid }, { aiGrade: { criteria: { c1: { level: 3 } }, pct: 99, at: ago(4).toISOString() } });
    // even a row marked SCORED without the teacher's approval (old data) is left out
    await repo.updateMany("WritingSubmission", { taskId: draftTask, studentId: sid }, { status: "SCORED", scorePct: 61, returnedAt: ago(4) });

    // 🚀 ReadRise: placed 60 days ago at 760, now 820; 2 qualifying articles this week and last week
    await repo.create("RRStudent", { studentId: sid, schoolId, level: 820, startLevel: 760, source: "PLACEMENT", placedAt: ago(60), articlesDone: 5, weeklyGoal: 2, updatedAt: NOW });
    await repo.create("RRPlacement", { studentId: sid, schoolId, startLevel: 760, steps: [], startedAt: ago(60), completedAt: ago(60), result: 760 }).catch(() => null);
    for (const [i, days] of [1, 1.1, 3, 4, 200].entries()) {
      await repo.create("RRRun", { studentId: sid, schoolId, articleId: `art${i}`, versionLevel: 800, band: "MID", step: "DONE", score: 88, levelBefore: 800, levelAfter: 820, firstTry: true, stretch: false, listened: false, startedAt: ago(days), completedAt: ago(days) });
    }

    // 🎙️ Fluency: a 1-minute reading with a remedial plan (rate focus)
    const remedial = buildRemedialPlan({ grade: 5, cold: [{ date: ago(14).toISOString(), wcpm: 70, accuracy: 97 }], readings: [{ date: ago(14).toISOString(), kind: "MINUTE", wcpm: 70, accuracy: 97, prosody: 3 }], words: ["through", "enough"], patterns: [] }, ago(14));
    assert.ok(remedial, "a plan from the evidence");
    await repo.create("FluencyCheck", { studentId: sid, wcpm: 70, accuracy: 97, source: "COACH", checkedAt: ago(14) });
    await repo.create("FluencyCheck", { studentId: sid, wcpm: 76, accuracy: 97, source: "COACH", checkedAt: ago(3) });
    await repo.create("FluencyPractice", { studentId: sid, mode: "MINUTE", passageKey: "RP:x", title: "A walk", wordsRead: 80, wordsCorrect: 76, seconds: 60, wcpm: 76, accuracy: 97, level: "BELOW", errors: [], practiceKind: "MINUTE",
      plan: { level: "BELOW", goal: 80, nextCheck: "2026-10-19", perWeek: 3, steps: [{ icon: "⏱", text: "check" }], words: [], patterns: [], nextPassageKey: null, remedial }, createdAt: ago(3) });
  });

  test("the AUTO report has Writing (approved only), ReadRise and the Fluency Coach plan", async () => {
    const c = await autoContent(repo, teacher, sid, NOW);
    const sec = (h: string) => c.sections.find((x) => x.heading === h);
    const heads = c.sections.map((x) => x.heading);
    for (const h of ["Writing", "Reading level (ReadRise)", "Fluency Coach plan", "Reading fluency"]) assert.ok(heads.includes(h), `${h} in ${heads.join(", ")}`);

    // ✍️ only the approved & returned piece, with its approved levels (not the later draft), in friendly words
    const w = sec("Writing")!.lines.join("\n");
    assert.match(w, /“School garden” \(4 Oct\): 75% — Ideas: Excellent · Organization: Growing\./, w);
    assert.ok(!/Pets at school|Longer holidays|99%|61%|draft regrade|Not approved/.test(w), "no AI-only or unapproved grade");
    assert.ok(!/Below Standard|Above Standard|Meets/.test(w), "never the rubric's own level labels");
    assert.match(w, /Strength: Great opinion with two clear reasons\./);
    assert.match(w, /Next step: Next, add linking words like first and because\./);
    assert.ok(!/above grade level/i.test(w), "a comment sentence with level wording is left out");

    // 🚀 ReadRise Level, growth, this term, streak — never "Lexile"
    const r = sec("Reading level (ReadRise)")!.lines.join("\n");
    assert.match(r, /ReadRise Level: 820 \(started at 760 · up 60 since the placement\)/);
    assert.match(r, /Articles finished this term: 4\./, "the run from 200 days ago is another term");
    assert.match(r, /met 2 weeks in a row/);
    assert.ok(!/lexile/i.test(all(c)), "never called Lexile");

    // 🎙️ goal in friendly words, progress, two home ideas matching the focus
    const f = sec("Fluency Coach plan")!.lines;
    assert.match(f[0], /^Goal: read \d+ words correctly per minute by \d{1,2} [A-Z][a-z]{2}\.$/);
    assert.match(f.join("\n"), /Progress: from 70 to 76 words correctly per minute/);
    assert.equal(f.filter((x) => x.startsWith("At home: ")).length, 2);
    assert.match(sec("Reading fluency")!.lines[0], /76 words correct per minute \(.*\) · Growing toward the grade goal\./);
  });

  test("no Below / On level / Above / Tier wording in any family-facing report; the approval flow is unchanged", async () => {
    const id = await createFamilyReport(repo, teacher, { studentId: sid, kind: "AUTO" }, NOW);
    const draft = await familyReport(repo, teacher, id);
    assert.ok(!FORBIDDEN.test(all(draft.content)), all(draft.content));
    assert.equal((await approvedForFamily(repo, student, sid)).length, 0, "nothing before approval");
    assert.equal(await submitFamilyReport(repo, teacher, id, NOW), "PENDING");
    await reviewFamilyReport(repo, admin, id, { approve: true }, NOW);
    const seen = await approvedForFamily(repo, student, sid);
    assert.equal(seen.length, 1);
    for (const r of seen) assert.ok(!FORBIDDEN.test(all(r.content)), all(r.content));
  });

  test("friendly words and helpers", () => {
    assert.equal(fluencyGoalWords("ABOVE"), "Reading faster than the grade goal");
    assert.equal(fluencyGoalWords("ON"), "Meeting the grade goal");
    assert.equal(fluencyGoalWords("BELOW"), "Growing toward the grade goal");
    for (const l of ["ABOVE", "ON", "BELOW"]) assert.ok(!FORBIDDEN.test(fluencyGoalWords(l) + gradeGoalWords(l)));
    assert.ok(hasLevelWords("Above the grade benchmark") && hasLevelWords("Tier 2 support") && hasLevelWords("reading on level") && !hasLevelWords("practice on the skills below"));
    assert.deepEqual([criterionWords(4, 4), criterionWords(3, 4), criterionWords(2, 4), criterionWords(1, 4)], ["Excellent", "Strong", "Growing", "Just starting"]);
    assert.deepEqual(commentParts("Nice hook! Try to add a closing sentence."), { strength: "Nice hook!", next: "Try to add a closing sentence." });
    for (const fo of ["ACCURACY", "RATE", "PROSODY", "ENRICH"] as const) assert.equal(homeTips(fo).length, 2);
    assert.match(homeTips("ACCURACY", ["through"])[1], /through/);
  });
});
