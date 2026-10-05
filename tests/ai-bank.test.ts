import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { loadSkillItems } from "../src/server/practice/items";
import { buildPrompt, type AiProvider } from "../src/server/ai/question-generator";
import { approveAiDraft, getQuestion, rejectAiDraft, updateDraft } from "../src/server/admin/questions";
import { bandOf, bandTargets, curriculumTree, generateMissing, generateQuestions, planSlots, skillCoverage, validateGenerated } from "../src/server/admin/ai-bank";
import { demoDatabase, ROOT } from "./helpers/db";

const now = new Date("2026-10-06T08:00:00Z");

/** Fake AI: answers each slot with a distinct, well-formed question (or a chosen defect). */
const VOCAB = ("amber anchor apricot atlas badge bamboo basket beacon blossom bracelet breeze bridge brook cabin camel canyon caravan cedar chalk cliff clover comet compass coral cotton crater crystal dagger desert dolphin dune eagle ember falcon feather fig flute fossil fountain galaxy garden glacier globe granite harbor hawk hedge helmet honey horizon island ivory jasmine jungle kettle kite lagoon lantern lemon lily lizard magnet maple marble meadow melon meteor mint mirror moss nectar oasis olive orbit orchard otter palace palm parrot pearl pebble pepper pine planet plum pond prairie quartz quill rabbit raven reef ribbon river robin saffron sail sapphire scarf shell silver sparrow spice spruce statue stream summit tablet thistle thunder tiger timber torch tulip valley velvet violet volcano walnut whale willow window yarn zebra").split(" ");
let seed = 20261006;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (n: number) => { const pool = [...VOCAB]; return Array.from({ length: n }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]); };
function fakeAi(skillCode: string, standardCode: string, defect: (slot: number) => string | null = () => null): AiProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async complete(system, user) {
      prompts.push(system + "\n" + user);
      const req = JSON.parse(user) as { slots: { slot: number; level: number }[] };
      return JSON.stringify({ questions: req.slots.map((s) => {
        const w = pick(16);
        const q = {
          slot: s.slot, level: s.level, cognitiveLevel: "Understand", skillCode, standardCode,
          stem: `${w.slice(0, 10).join(" ")}: which lesson fits best?`,
          options: [
            { text: w.slice(10, 12).join(" "), correct: true, rationale: null as string | null },
            { text: w.slice(12, 13).join(" "), correct: false, rationale: "A detail, not a lesson." as string | null },
            { text: w.slice(13, 14).join(" "), correct: false, rationale: "A detail, not a lesson." as string | null },
            { text: w.slice(14, 16).join(" "), correct: false, rationale: "A detail, not a lesson." as string | null },
          ],
          explanation: "The character changes by learning patience.", tip: "Look at how the character changes.",
        };
        const d = defect(s.slot);
        if (d === "two-correct") q.options[1].correct = true;
        if (d === "no-rationale") q.options[2].rationale = null;
        if (d === "wrong-skill") q.skillCode = "G4.some-other-skill";
        if (d === "wrong-standard") q.standardCode = "RI.4.9";
        if (d === "wrong-level") q.level = s.level === 7 ? 1 : s.level + 1;
        if (d === "three-options") q.options.pop();
        if (d === "no-explanation") q.explanation = "";
        return q;
      }) });
    },
  };
}

describe("AI-assisted question bank", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  let skillId: string, standardId: string, lessonId: string, skillCode: string, stdCode: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    student = await actorFor("demo.s1001");
    const tree = await curriculumTree(repo, admin);
    const g4 = tree.find((g) => g.level === 4)!;
    const lesson = g4.books.flatMap((bk) => bk.units).flatMap((u) => u.lessons).find((l) => l.skills.some((s) => s.code === "G4.theme"))!;
    const skill = lesson.skills.find((s) => s.code === "G4.theme")!;
    skillId = skill.id; standardId = skill.standards[0].id; lessonId = lesson.id; skillCode = skill.code; stdCode = skill.standards[0].code;
  });

  test("curriculum tree: Grade → Book → Unit → Lesson → Skill → Standard (admins only)", async () => {
    const tree = await curriculumTree(repo, admin);
    assert.deepEqual(tree.map((g) => g.level), [4, 5, 6]);
    const lessons = tree[0].books.flatMap((bk) => bk.units).flatMap((u) => u.lessons);
    assert.ok(lessons.length > 0 && lessons.some((l) => l.skills.some((sk) => sk.standards.length > 0)));
    await assert.rejects(curriculumTree(repo, teacher), ForbiddenError);
  });

  test("the prompt contains curriculum data only, never student data", async () => {
    const ai = fakeAi(skillCode, stdCode);
    await generateQuestions(repo, admin, ai, { skillId, standardId, lessonId, count: 4 }, now);
    const prompt = ai.prompts.join("\n");
    const students = await repo.findMany("Student", {});
    const users = await repo.findMany("User", {});
    for (const s of students) assert.ok(!prompt.includes(String(s.studentNumber)), `student number ${s.studentNumber} leaked`);
    for (const u of users) {
      assert.ok(!prompt.includes(String(u.username)), `username ${u.username} leaked`);
      assert.ok(!prompt.includes(String(u.displayName)), `name ${u.displayName} leaked`);
    }
    assert.ok(prompt.includes(skillCode) && prompt.includes(stdCode));
  });

  test("the AI module cannot reach student data: it imports nothing from the database layer", () => {
    const src = readFileSync(join(ROOT, "src/server/ai/question-generator.ts"), "utf8");
    assert.deepEqual([...src.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]), []);
    assert.ok(!/repo|Student|User|Attempt/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  });

  test("valid questions are saved as AI DRAFTS with grade, unit, lesson, skill, standard, level, cognitive level", async () => {
    const r = await generateQuestions(repo, admin, fakeAi(skillCode, stdCode, () => null), { skillId, standardId, lessonId, count: 8 }, now);
    assert.equal(r.saved.length, 8);
    assert.deepEqual(r.balance.saved, bandTargets(8));
    for (const s of r.saved) {
      const q = (await repo.findUnique("Question", { id: s.id }))!;
      assert.deepEqual([q.status, q.origin, q.aiStatus, q.skillId, q.lessonId], ["DRAFT", "AI_GENERATED", "AI_GENERATED", skillId, lessonId]);
      assert.ok(q.standardId);
      const d = await getQuestion(repo, teacher, s.id);
      assert.equal(d.input.cognitiveLevel, "Understand");
      assert.ok(d.input.options!.filter((o) => o.correct).length === 1 && d.input.whyCorrect);
    }
    assert.ok(!(await loadSkillItems(repo, skillId)).some((i) => r.saved.some((s) => s.id === i.questionId)), "drafts never reach students");
  });

  test("automatic validation rejects malformed answers, wrong mapping and wrong difficulty, with reasons", async () => {
    const defects = ["two-correct", "no-rationale", "wrong-skill", "wrong-standard", "wrong-level", "three-options", "no-explanation", null];
    const r = await generateQuestions(repo, admin, fakeAi(skillCode, stdCode, (slot) => defects[slot - 1] ?? null), { skillId, standardId, lessonId, byBand: { easy: 2, medium: 4, hard: 2 } }, now);
    assert.equal(r.saved.length, 1);
    const reasons = r.rejected.map((x) => x.reasons.join("; "));
    for (const re of [/exactly one correct/, /no rationale/, /wrong skill/, /wrong standard/, /does not match the requested level/, /exactly 4 answer choices/, /explanation missing/])
      assert.ok(reasons.some((x) => re.test(x)), `missing reason ${re}`);
    assert.ok(r.balance.warnings.length > 0, "difficulty balance warning when a band is short");
  });

  test("duplicates are rejected: against existing questions and within one batch", () => {
    const slots = planSlots({ easy: 0, medium: 2, hard: 0 });
    const good = (stem: string, slot: number) => ({ slot, level: slots[slot - 1].level, cognitiveLevel: "Apply", skillCode: "G4.theme", standardCode: "RL.4.2", stem,
      options: [{ text: "Honesty matters", correct: true, rationale: null }, { text: "Rain", correct: false, rationale: "x" }, { text: "Farms", correct: false, rationale: "x" }, { text: "Cars", correct: false, rationale: "x" }], explanation: "e", tip: null });
    const stem = "What lesson does the farmer learn when he returns the lost purse to its owner?";
    const v = validateGenerated([good(stem, 1), good(stem, 2)], { skillCode: "G4.theme", standardCodes: ["RL.4.2"], requestedStandard: "RL.4.2", slots }, []);
    assert.deepEqual(v.checks.map((c) => c.ok), [true, false]);
    const v2 = validateGenerated([good(stem, 1)], { skillCode: "G4.theme", standardCodes: ["RL.4.2"], requestedStandard: "RL.4.2", slots: slots.slice(0, 1) }, [{ stem, correct: "Honesty matters", options: ["Honesty matters", "Rain", "Farms", "Cars"] }]);
    assert.match(v2.checks[0].reasons.join(), /duplicate/);
  });

  test("a standard not linked to the skill, or a lesson that does not teach it, is refused before calling the AI", async () => {
    const other = (await repo.findMany("Standard", {})).find((s) => !String(s.code).includes(".4."))!;
    await assert.rejects(generateQuestions(repo, admin, fakeAi(skillCode, stdCode), { skillId, standardId: String(other.id), count: 2 }), /linked to this skill/);
    const lessons = await repo.findMany("Lesson", {});
    const links = await repo.findMany("LessonSkill", { skillId });
    const bad = lessons.find((l) => !links.some((k) => k.lessonId === l.id))!;
    await assert.rejects(generateQuestions(repo, admin, fakeAi(skillCode, stdCode), { skillId, standardId, lessonId: String(bad.id), count: 2 }), /does not teach/);
    await assert.rejects(generateQuestions(repo, admin, fakeAi(skillCode, stdCode), { skillId, standardId, count: 21 }), /between 1 and 20/);
  });

  test("teachers review, edit, approve and reject; only approved questions reach the adaptive engine", async () => {
    await assert.rejects(generateQuestions(repo, teacher, fakeAi(skillCode, stdCode), { skillId, standardId, count: 2 }), ForbiddenError);
    const r = await generateQuestions(repo, admin, fakeAi(skillCode, stdCode, () => null), { skillId, standardId, lessonId, count: 3 }, now);
    const [a, b, c] = r.saved.map((s) => s.id);
    // edit by a teacher who did not create it
    const form = (await getQuestion(repo, teacher, a)).input;
    await updateDraft(repo, teacher, a, { ...form, stem: form.stem + " (edited by teacher)" }, now);
    assert.ok((await getQuestion(repo, teacher, a)).canReviewAi);
    await approveAiDraft(repo, teacher, a, now);
    await assert.rejects(rejectAiDraft(repo, teacher, b, ""), /Reason/);
    await rejectAiDraft(repo, teacher, b, "Distractors are too easy.", now);
    await assert.rejects(approveAiDraft(repo, student, c), (e: Error) => e instanceof ForbiddenError && /questions:review/.test(e.message), "refused by the review permission itself");
    const live = (await loadSkillItems(repo, skillId)).map((i) => i.questionId);
    assert.ok(live.includes(a), "approved question is used by the engine");
    assert.ok(!live.includes(b) && !live.includes(c), "rejected and pending questions are not");
    assert.deepEqual([(await repo.findUnique("Question", { id: b }))!.status, (await repo.findUnique("Question", { id: b }))!.aiStatus], ["ARCHIVED", "REJECTED"]);
    await assert.rejects(approveAiDraft(repo, teacher, b), /already been reviewed/);
  });

  test("coverage shows approved counts by difficulty and what is still needed; Generate Missing makes exactly that", async () => {
    const before = (await skillCoverage(repo, admin, 4)).find((x) => x.skillId === skillId)!;
    assert.equal(before.target, 12);
    assert.equal(before.approvedByBand.easy + before.approvedByBand.medium + before.approvedByBand.hard, before.approved);
    // another skill with nothing pending: needed equals target minus approved per band
    const rows = await skillCoverage(repo, admin, 4);
    const row = rows.find((x) => x.needed > 0 && x.pendingReview === 0 && x.skillId !== skillId)!;
    assert.ok(row, "a skill that still needs questions");
    const t = bandTargets(12);
    for (const b of ["easy", "medium", "hard"] as const) assert.equal(row.neededByBand[b], Math.max(0, t[b] - row.approvedByBand[b] - 0), b);
    const stdC = (await repo.findMany("Standard", { id: (await repo.findMany("SkillStandard", { skillId: row.skillId }))[0].standardId }))[0];
    const res = await generateMissing(repo, admin, fakeAi(row.code, String(stdC.code).replace(/^CCSS\.ELA-LITERACY\./, "")), row.skillId, 12, now);
    assert.ok(!("nothingNeeded" in res));
    if (!("nothingNeeded" in res)) assert.equal(res.requested, Math.min(20, row.needed));
    const after = (await skillCoverage(repo, admin, 4)).find((x) => x.skillId === row.skillId)!;
    assert.equal(after.needed, 0, "pending drafts count toward the target, so nothing more is generated");
    assert.deepEqual(await generateMissing(repo, admin, fakeAi(row.code, "x"), row.skillId, 12, now), { nothingNeeded: true });
  });

  test("difficulty bands and prompt plan", () => {
    assert.deepEqual([1, 2, 3, 5, 6, 7].map(bandOf), ["easy", "easy", "medium", "medium", "hard", "hard"]);
    assert.deepEqual(bandTargets(12), { easy: 3, medium: 6, hard: 3 });
    const p = buildPrompt({ grade: 4, book: "Wonders", unit: null, lesson: null, skill: { code: "G4.theme", name: "Theme", description: null, domain: "READING" }, standard: { code: "RL.4.2", description: null }, slots: planSlots({ easy: 1, medium: 1, hard: 1 }), avoid: [] });
    assert.match(p.user, /"requiredStandardCode": "RL.4.2"/);
  });
});
