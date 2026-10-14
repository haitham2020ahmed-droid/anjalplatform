/**
 * ✍️ Genre writing (FAKE test data, FAKE AI provider — no real API is called): the genre rubrics and self-checks,
 * the staged plan → draft → revise → final flow, source-based research questions, AI trait feedback (parse, clamp,
 * approval gating, privacy, daily limit), reteach routing, the class's writing errors, teacher authorization, and
 * the Grammar workbook's error_correction / sentence_order / sentence_combine rows.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { consumeRateLimit } from "../src/server/auth/rate-limit";
import { setAiSettings } from "../src/server/ai/engine";
import type { AiProvider } from "../src/server/ai/question-generator";
import {
  CHECKLISTS, FREE_RUBRIC, GENRE_RUBRICS, GENRES, ORGANIZERS, REVISION_MOVES, checkChecklist, checkMoves, checkPlan, checklistRequired, movesForRubric, pickMoves, rubricFor,
} from "../src/server/writing/genres";
import { citesSource, cleanResearch, cleanSources, researchTotal, scoreResearch, studentView, teacherScoreResearch } from "../src/server/writing/research";
import { aiDraftValidator, aiPayload, schoolDay, WRITING_AI_PER_DAY } from "../src/server/writing/ai-feedback";
import { CODE_FAMILIES, WRITING_ERROR_CODES, familiesFor } from "../src/server/writing/reteach";
import { MISCONCEPTION_BY_CODE } from "../src/insights/misconceptions";
import * as W from "../src/server/teacher/writing";
import { grammarTable, type GrammarWorkbook } from "../src/server/grammar/grammar";
import { demoDatabase } from "./helpers/db";

const SAMPLE = "My favourite place is the desert near my house. First, we drive there with my father. Then we make a fire and drink tea. In the end we watch the stars and I feel happy.";
const all = (genre: keyof typeof CHECKLISTS) => Object.fromEntries(CHECKLISTS[genre].map((c) => [c.id, true]));

/** A fake AI that answers with a good (or a deliberately sloppy) draft for whatever rubric it is sent. */
function fakeAi(mode: "good" | "sloppy" | "broken" = "good"): { provider: AiProvider; calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  return {
    calls,
    provider: {
      async complete(system, user) {
        calls.push({ system, user });
        if (mode === "broken") return "I cannot help with that.";
        const u = JSON.parse(user) as { rubric: { key: string }[]; scale: { lowest: number; highest: number } };
        const traits = Object.fromEntries(u.rubric.map((t, i) => [t.key, { score: mode === "sloppy" ? (i === 0 ? 7 : "1.6") : (t.key === "organization" ? 2 : 3), strength: "You named the place clearly.", nextStep: "Add one more time word, like after that." }]));
        if (mode === "sloppy") (traits as Record<string, unknown>).bonus = { score: 4, strength: "x", nextStep: "y" };
        return "```json\n" + JSON.stringify({ traits, conventions: [{ code: "capitalization", example: "in the end we" }, { code: "L1_ARTICLE", example: "drink the tea" }, { code: "NOT_A_CODE", example: "?" }], summary: "You told a clear story. Next, add time words." }) + "\n```";
      },
    },
  };
}

describe("✍️ genre rubrics, self-checks and organizers", () => {
  test("every genre has a 4-trait rubric scored 1–4 with a descriptor per level; FREE keeps the 0–4 rubric", () => {
    for (const g of GENRES) {
      const r = rubricFor(g);
      assert.equal(r.traits.length, 4, g);
      if (g === "FREE") { assert.deepEqual([r.min, r.max], [0, 4]); assert.equal(r, FREE_RUBRIC); continue; }
      assert.deepEqual([r.min, r.max], [1, 4], g);
      assert.equal(new Set(r.traits.map((t) => t.key)).size, 4, `${g}: unique trait keys`);
      assert.equal(r.traits.at(-1)!.key, "conventions", `${g}: Conventions is a trait`);
      for (const t of r.traits) for (const lv of [1, 2, 3, 4]) assert.ok(t.levels[lv]?.length > 15, `${g}.${t.key} level ${lv}`);
    }
    assert.ok(GENRE_RUBRICS.RESEARCH.traits.some((t) => t.key === "evidence" && /source/i.test(t.what)), "Research Evidence expects citing sources");
    assert.equal(rubricFor("NOPE"), FREE_RUBRIC, "unknown or old data → the old rubric");
  });

  test("every genre has a self-check; it is required (all ticked) for every genre except FREE", () => {
    for (const g of GENRES) {
      assert.ok(CHECKLISTS[g].length >= 5, g);
      assert.equal(new Set(CHECKLISTS[g].map((c) => c.id)).size, CHECKLISTS[g].length);
      assert.equal(checklistRequired(g), g !== "FREE");
      assert.equal(checkChecklist(g, all(g)).ok, true);
      const missing = { ...all(g) }; delete missing[CHECKLISTS[g][2].id];
      const r = checkChecklist(g, missing);
      assert.equal(r.ok, false); assert.match((r as { error: string }).error, new RegExp(CHECKLISTS[g][2].text.slice(0, 12).replace(/[()?.*+]/g, ".")));
    }
    assert.equal(checkChecklist("OPINION", Object.fromEntries(CHECKLISTS.OPINION.map((c) => [c.id, "on"]))).ok, true, "form values count");
  });

  test("organizers: required fields block finishing the plan, but a partial plan can be saved", () => {
    for (const g of GENRES) assert.ok(ORGANIZERS[g].fields.length >= 2 && ORGANIZERS[g].frames.length >= 3, g);
    assert.equal(checkPlan("NARRATIVE", { characters: "Sara" }, false).ok, true);
    assert.match((checkPlan("NARRATIVE", { characters: "Sara" }, true) as { error: string }).error, /Setting/);
  });

  test("revision moves: 1–2 targeted moves from the lowest traits; teacher choices must fit the rubric", () => {
    const r = GENRE_RUBRICS.OPINION;
    assert.deepEqual(pickMoves(r, { focus: 4, organization: 2, evidence: 3, conventions: 4 }), [REVISION_MOVES.organization[0].id, REVISION_MOVES.evidence[0].id]);
    assert.deepEqual(pickMoves(r, { focus: 4, organization: 4, evidence: 2, conventions: 4 }), [REVISION_MOVES.evidence[0].id, REVISION_MOVES.evidence[1].id]);
    assert.equal(pickMoves(r, { focus: 4, organization: 4, evidence: 4, conventions: 4 }).length, 1, "always one step");
    assert.deepEqual(checkMoves(r, ["ev-2"]), ["ev-2"]);
    assert.throws(() => checkMoves(r, ["craft-1"]), /does not fit/);
    assert.throws(() => checkMoves(r, ["ev-1", "ev-2", "org-1"]), /one or two/);
    assert.ok(movesForRubric(GENRE_RUBRICS.NARRATIVE).some((m) => m.trait === "craft"));
  });
});

describe("📚 research questions", () => {
  const qs = cleanResearch([
    { q: "What do camels store in their humps?", kind: "MC", options: ["Water", "Fat", "Sand"], answer: 1 },
    { q: "Why can camels walk on sand?", kind: "SHORT" },
  ]);

  test("cleaning: at most 3 sources and 3 questions; MC needs 2–4 distinct choices and a key", () => {
    assert.throws(() => cleanSources([1, 2, 3, 4].map((i) => ({ title: `S${i}`, text: "A long enough source text about camels." }))), /at most 3/);
    assert.throws(() => cleanSources([{ title: "", text: "A long enough source text." }]), /title/);
    assert.throws(() => cleanResearch([1, 2, 3, 4].map(() => ({ q: "Why?", kind: "SHORT" }))), /at most 3/);
    assert.throws(() => cleanResearch([{ q: "Which?", kind: "MC", options: ["a", "A"], answer: 0 }]), /same/);
    assert.throws(() => cleanResearch([{ q: "Which?", kind: "MC", options: ["a", "b"], answer: 5 }]), /correct choice/);
    assert.equal("answer" in studentView(qs)[0], false, "the key never reaches the student");
  });

  test("MC is scored automatically (0–1); short answers wait for the teacher (0–2)", () => {
    assert.throws(() => scoreResearch(qs, { q1: 1 }, new Date()), /question 2/);
    assert.throws(() => scoreResearch(qs, { q1: 1, q2: "fat" }, new Date()), /full sentence/);
    const ra = scoreResearch(qs, { q1: 1, q2: "Their wide feet do not sink." }, new Date());
    assert.deepEqual(researchTotal(qs, ra), { points: 1, max: 3, pending: 1 });
    const scored = teacherScoreResearch(qs, ra, { q2: 2 });
    assert.deepEqual(researchTotal(qs, scored), { points: 3, max: 3, pending: 0 });
    assert.throws(() => teacherScoreResearch(qs, ra, { q2: 3 }), /0, 1 or 2/);
  });

  test("citing a source: its title or “according to …”", () => {
    const src = [{ title: "Ships of the Desert", text: "…" }];
    assert.equal(citesSource("In Ships of the Desert I read that camels store fat.", src), true);
    assert.equal(citesSource("According to the article, camels store fat.", src), true);
    assert.equal(citesSource("Camels store fat.", src), false);
  });
});

describe("🤖 AI draft: parse, clamp, privacy", () => {
  test("scores are rounded and clamped to the scale; unknown traits and codes are dropped; missing traits are refused", () => {
    const r = GENRE_RUBRICS.NARRATIVE;
    const v = aiDraftValidator(r);
    const base = Object.fromEntries(r.traits.map((t) => [t.key, { score: 3, strength: "Clear events.", nextStep: "Add dialogue." }]));
    const ok = v({ traits: { ...base, focus: { score: 9, strength: "Clear events.", nextStep: "Add dialogue." }, craft: { score: "1.4", strength: "Nice words.", nextStep: "Add feelings." }, extra: { score: 1 } }, conventions: [{ code: "spelling", example: "freind" }, { code: "BOGUS" }], summary: "A clear story." });
    assert.equal(ok.ok, true);
    const d = (ok as { value: { traits: Record<string, { score: number }>; conventions: { code: string }[] } }).value;
    assert.deepEqual([d.traits.focus.score, d.traits.craft.score], [4, 1]);
    assert.equal("extra" in d.traits, false);
    assert.deepEqual(d.conventions.map((c) => c.code), ["SPELLING"]);
    assert.equal(v({ traits: { focus: base.focus }, summary: "x x x x x" }).ok, false);
    assert.equal(v({ traits: { ...base, focus: { score: "high", strength: "Clear events.", nextStep: "Add dialogue." } }, summary: "A clear story." }).ok, false);
    assert.equal(aiDraftValidator(FREE_RUBRIC)({ traits: Object.fromEntries(FREE_RUBRIC.traits.map((t) => [t.key, { score: -2, strength: "Good ideas.", nextStep: "Add more." }])), summary: "Good work." }).ok, true);
  });

  test("only the text, the genre and the rubric are sent; error codes include the L1_* transfer codes", () => {
    const p = aiPayload("OPINION", GENRE_RUBRICS.OPINION, SAMPLE);
    assert.deepEqual(Object.keys(p).sort(), ["genre", "rubric", "scale", "writing"]);
    assert.ok(WRITING_ERROR_CODES.includes("L1_THIRD_PERSON_S") && WRITING_ERROR_CODES.includes("CAPITALIZATION"));
    assert.ok(!WRITING_ERROR_CODES.some((c) => MISCONCEPTION_BY_CODE.get(c)!.area === "READING"));
    assert.equal(schoolDay(new Date("2026-10-10T22:30:00Z")), "2026-10-11", "the school day is Saudi time");
  });

  test("reteach mapping: Organization → sequence / structure; Evidence → text evidence; Conventions → the grammar of the tagged codes", () => {
    assert.ok(familiesFor("organization", "NARRATIVE", []).includes("sequence"));
    assert.ok(familiesFor("organization", "NARRATIVE", []).includes("writing-narrative"));
    assert.equal(familiesFor("evidence", "RESEARCH", [])[0], "text-evidence");
    assert.deepEqual(familiesFor("conventions", "OPINION", ["L1_THIRD_PERSON_S", "CAPITALIZATION", "CAPITALIZATION"]).slice(0, 2), ["capitalization", "titles-abbreviations"]);
    for (const c of WRITING_ERROR_CODES) assert.ok(CODE_FAMILIES[c]?.length, `${c} maps to a skill family`);
  });
});

describe("✍️ genre writing end to end", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let classId = ""; let students: string[] = [];
  const now = new Date(Date.UTC(2026, 9, 12, 7));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const env = { GEMINI_API_KEY: "AIza-fake" };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    teacher = await actorFor("test.teacher.1");
    other = await actorFor("test.teacher.3");
    classId = String((await readableClasses(repo, teacher))[0].id);
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
  });

  test("creating: genre, staged, sources and research, AI toggle, skill link — validated; teachers only, own classes only", async () => {
    const base = { classId, kind: "WRITE" as const, title: "Camels", prompt: "Write a short report about camels." };
    await assert.rejects(W.createTask(repo, teacher, { ...base, genre: "POEM" }, now), /genre/);
    await assert.rejects(W.createTask(repo, teacher, { ...base, genre: "RESEARCH" }, now), /at least one source/);
    await assert.rejects(W.createTask(repo, teacher, { ...base, genre: "OPINION", research: [{ q: "Why?", kind: "SHORT" }] }, now), /need a source/);
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))!.level);
    const foreignSkill = (await repo.findMany("Skill", {}, { select: ["id", "code"] })).find((k) => /^G\d\./.test(String(k.code)) && !String(k.code).startsWith(`G${grade}.`));
    assert.ok(foreignSkill);
    if (foreignSkill) await assert.rejects(W.createTask(repo, teacher, { ...base, skillId: String(foreignSkill.id) }, now), /this class's curriculum/);
    await assert.rejects(W.createTask(repo, other, { ...base }, now), ForbiddenError);
    await assert.rejects(W.createTask(repo, await studentActor(students[0]), { ...base }, now), ForbiddenError);
    const curs = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true })).map((c) => c.id);
    const skill = (await repo.findMany("Skill", { code: `G${grade}.writing-informative`, curriculumId: { in: curs } }))[0];
    const id = await W.createTask(repo, teacher, { ...base, genre: "RESEARCH", staged: true, aiFeedback: true, skillId: String(skill.id), sources: [{ title: "Ships of the Desert", text: "Camels store fat in their humps. Their wide feet do not sink in sand." }], research: [{ q: "What is in a camel's hump?", kind: "MC", options: ["Water", "Fat"], answer: 1 }, { q: "Why do camels not sink?", kind: "SHORT" }] }, now);
    const v = await W.taskForTeacher(repo, teacher, id);
    assert.deepEqual([v.genre, v.staged, v.aiFeedback, v.skill?.id, v.sources.length, v.research.length, v.rubric.min, v.rubric.max], ["RESEARCH", true, true, String(skill.id), 1, 2, 1, 4]);
    await assert.rejects(W.taskForTeacher(repo, other, id), ForbiddenError);
    const ra = await W.createTask(repo, teacher, { classId, kind: "READ_ALOUD", title: "Poem", prompt: "Read it.", passage: "The wind is cold, the sky is grey today.", genre: "OPINION", staged: true, aiFeedback: true }, now);
    const rv = await W.taskForTeacher(repo, teacher, ra);
    assert.deepEqual([rv.genre, rv.staged, rv.aiFeedback, rv.rubric.traits.map((t) => t.key)], ["FREE", false, false, ["fluency", "accuracy", "expression"]]);
  });

  test("staged flow: research → plan → draft (self-check) → AI draft → teacher approves → revise (first draft kept, 1–2 steps) → final → scored", async () => {
    const id = (await W.classTasks(repo, teacher, classId)).find((t) => t.genre === "RESEARCH")!.id;
    const me = await studentActor(students[0]);
    const view0 = await W.taskForStudent(repo, me, id);
    assert.equal(view0.needsResearch, true);
    assert.equal(view0.mine.stage, "PLAN");
    assert.equal(view0.research.some((q) => "answer" in q), false);
    await assert.rejects(W.savePlan(repo, me, id, { question: "Camels?" }, false, now), /research questions first/);
    await assert.rejects(W.saveWriting(repo, me, id, SAMPLE, false, now), /research questions first/);
    assert.deepEqual(await W.submitResearch(repo, me, id, { q1: 1, q2: "Their wide feet do not sink in the sand." }, now), { points: 1, max: 3, pending: 1 });
    await assert.rejects(W.submitResearch(repo, me, id, { q1: 0, q2: "Again and again." }, now), /already answered/);
    await W.scoreResearchAnswers(repo, teacher, id, students[0], { q2: 2 });
    await assert.rejects(W.scoreResearchAnswers(repo, other, id, students[0], { q2: 2 }), ForbiddenError);

    await assert.rejects(W.saveWriting(repo, me, id, SAMPLE, false, now), /Finish your plan/);
    assert.equal(await W.savePlan(repo, me, id, { question: "How do camels live in the desert?" }, false, now), "PLAN");
    await assert.rejects(W.savePlan(repo, me, id, { question: "How do camels live in the desert?" }, true, now), /Notes from source 1/);
    assert.equal(await W.savePlan(repo, me, id, { question: "How do camels live in the desert?", source1: "fat in hump; wide feet", answer: "Their bodies help them." }, true, now), "DRAFT");
    await assert.rejects(W.savePlan(repo, me, id, { question: "x" }, false, now), /plan is finished/);

    const draft = "Camels live in the desert. According to Ships of the Desert, camels store fat in their humps. their feet are wide so they do not sink.";
    await assert.rejects(W.saveWriting(repo, me, id, draft, true, now), /Check your writing first/);
    const r1 = await W.saveWriting(repo, me, id, draft, true, now, { checklist: all("RESEARCH") });
    assert.deepEqual(r1, { ai: true, stage: "DRAFT" });

    // AI draft (fake provider): PENDING, hidden from the student
    const fake = fakeAi();
    const out = await W.draftForSubmission(repo, id, students[0], env, now, { gemini: () => fake.provider });
    assert.equal(out.outcome, "PENDING", String(out.reason));
    assert.equal(fake.calls.length, 1);
    const sent = JSON.parse(fake.calls[0].user) as Record<string, unknown>;
    assert.deepEqual(Object.keys(sent).sort(), ["genre", "rubric", "scale", "writing"]);
    assert.ok(!fake.calls[0].user.includes("Test Student") && !fake.calls[0].user.includes(students[0]), "no name or id is sent");
    let tv = await W.taskForTeacher(repo, teacher, id);
    let sub = tv.subs.find((x) => x.studentId === students[0])!;
    assert.equal(sub.aiStatus, "PENDING");
    assert.deepEqual(sub.ai!.conventions.map((c) => c.code), ["CAPITALIZATION", "L1_ARTICLE"], "the unknown code was dropped");
    assert.equal(sub.citesSource, true);
    assert.deepEqual(sub.researchScore, { points: 3, max: 3, pending: 0 });
    assert.equal((await W.taskForStudent(repo, me, id)).mine.ai, null, "the student never sees an unapproved draft");
    assert.equal((await W.classWritingErrors(repo, teacher, classId)).rows.length, 0, "pending drafts do not count yet");
    await assert.rejects(W.approveAiDraft(repo, other, id, students[0], { scores: {} }, now), ForbiddenError);
    await assert.rejects(W.approveAiDraft(repo, teacher, id, students[0], { scores: { focus: 5, organization: 2, evidence: 3, conventions: 3 } }, now), /1 to 4/);

    // the teacher edits and approves → the draft goes back for revision
    const res = await W.approveAiDraft(repo, teacher, id, students[0], { scores: { focus: 3, organization: 2, evidence: 3, conventions: 2 }, nextSteps: { organization: "Group the facts about the feet together." }, codes: ["CAPITALIZATION", "L1_THIRD_PERSON_S"] }, now);
    assert.equal(res, "REVISE");
    const mine = (await W.taskForStudent(repo, me, id)).mine;
    assert.deepEqual([mine.status, mine.stage, mine.firstDraft], ["DRAFT", "REVISE", draft]);
    assert.ok(mine.ai && mine.ai.traits.organization.nextStep.startsWith("Group the facts"), "approved feedback is shown with the teacher's edit");
    assert.deepEqual(mine.ai!.conventions.map((c) => c.code), ["CAPITALIZATION", "L1_THIRD_PERSON_S"]);
    assert.equal(mine.comment, "You told a clear story. Next, add time words.", "the summary becomes the comment");
    assert.deepEqual(mine.moves.map((m) => m.id), ["org-1", "conv-1"], "1–2 targeted steps from the two lowest traits");
    assert.equal(mine.checklist, null, "the self-check is ticked again for the final");

    // reteach: Organization and Conventions (≤ 2) → curriculum skills
    tv = await W.taskForTeacher(repo, teacher, id);
    sub = tv.subs.find((x) => x.studentId === students[0])!;
    assert.deepEqual(sub.reteach.map((r) => r.trait), ["organization", "conventions"]);
    assert.ok(sub.reteach[0].skills.some((k) => /\.(sequence|text-structure|compare-contrast)$/.test(k.code)), JSON.stringify(sub.reteach[0].skills));
    assert.ok(sub.reteach[1].skills.some((k) => /\.(capitalization|titles-abbreviations|subject-verb-agreement)$/.test(k.code)), JSON.stringify(sub.reteach[1].skills));
    const a = await W.assignReteach(repo, teacher, { taskId: id, skillId: sub.reteach[0].skills[0].id, studentIds: [students[0]], source: "CURRICULUM" }, now);
    assert.equal(a.students, 1);
    await assert.rejects(W.assignReteach(repo, other, { taskId: id, skillId: sub.reteach[0].skills[0].id, studentIds: [students[0]], source: "CURRICULUM" }, now), ForbiddenError);

    // the class's writing errors (approved feedback only)
    const errs = await W.classWritingErrors(repo, teacher, classId);
    assert.deepEqual(errs.rows.map((r) => r.code).sort(), ["CAPITALIZATION", "L1_THIRD_PERSON_S"]);
    assert.ok(errs.rows.find((r) => r.code === "L1_THIRD_PERSON_S")!.skills.some((k) => k.code.endsWith(".subject-verb-agreement")));

    // revise → final
    await assert.rejects(W.saveWriting(repo, me, id, draft + " Also, camels drink a lot.", true, now, { checklist: all("RESEARCH") }), /revision step/);
    await assert.rejects(W.saveWriting(repo, me, id, draft, true, now, { checklist: all("RESEARCH"), movesDone: ["org-1", "conv-1"] }), /same as your first draft/);
    const fin = "Camels live in the desert. First, according to Ships of the Desert, camels store fat in their humps. Also, their feet are wide, so they do not sink. Finally, these things help camels live in a hot place.";
    const r2 = await W.saveWriting(repo, me, id, fin, true, now, { checklist: all("RESEARCH"), movesDone: ["org-1", "conv-1"] });
    assert.deepEqual(r2, { ai: true, stage: "FINAL" });
    await assert.rejects(W.saveWriting(repo, me, id, fin, false, now), /already submitted/);
    assert.equal((await W.taskForStudent(repo, me, id)).mine.ai, null, "the old approved draft was cleared for the new submission");
    assert.equal(await W.scoreSubmission(repo, teacher, id, students[0], { focus: 4, organization: 3, evidence: 4, conventions: 3 }, "Much clearer!", now), "SCORED");
    const done = (await W.taskForStudent(repo, me, id)).mine;
    assert.deepEqual([done.status, done.stage, done.total, done.firstDraft], ["SCORED", "FINAL", 14, draft]);
    const list = await W.myTasks(repo, me);
    assert.equal(list.find((t) => t.id === id)!.max, 16);
  });

  test("approval gating, dismiss, a sloppy reply is clamped, a broken one fails softly, the daily limit", async () => {
    const id = await W.createTask(repo, teacher, { classId, kind: "WRITE", title: "My trip", prompt: "Tell a story about a trip.", genre: "NARRATIVE", aiFeedback: true }, now);
    const [s1, s2, s3] = students.slice(1, 4);
    for (const sid of [s1, s2, s3]) await W.saveWriting(repo, await studentActor(sid), id, SAMPLE, true, now, { checklist: all("NARRATIVE") });
    await assert.rejects(W.approveAiDraft(repo, teacher, id, s1, { scores: { focus: 3, organization: 3, craft: 3, conventions: 3 } }, now), /no AI draft/);
    const sloppy = fakeAi("sloppy");
    assert.equal((await W.draftForSubmission(repo, id, s1, env, now, { gemini: () => sloppy.provider })).outcome, "PENDING");
    const d = (await W.taskForTeacher(repo, teacher, id)).subs.find((x) => x.studentId === s1)!.ai!;
    assert.deepEqual(Object.values(d.traits).map((t) => t.score), [4, 2, 2, 2], "7 → 4, “1.6” → 2");
    await W.dismissAiDraft(repo, teacher, id, s1);
    assert.equal((await W.taskForStudent(repo, await studentActor(s1), id)).mine.ai, null);
    await assert.rejects(W.dismissAiDraft(repo, teacher, id, s1), /no AI draft/);

    const broken = fakeAi("broken");
    const b = await W.draftForSubmission(repo, id, s2, env, now, { gemini: () => broken.provider });
    assert.equal(b.outcome, "FAILED");
    assert.equal((await W.taskForTeacher(repo, teacher, id)).subs.find((x) => x.studentId === s2)!.aiStatus, "NONE", "the teacher scores by hand");
    assert.equal((await W.draftForSubmission(repo, id, s2, {}, now)).outcome, "OFF", "no key → off, never an error");
    // the teacher scores by hand and tags codes themself
    assert.equal(await W.scoreSubmission(repo, teacher, id, s2, { focus: 3, organization: 3, craft: 2, conventions: 2 }, null, now, null, { codes: ["SPELLING"] }), "SCORED");
    await assert.rejects(W.scoreSubmission(repo, teacher, id, s3, { focus: 3, organization: 3, craft: 2, conventions: 2 }, null, now, null, { codes: ["NOPE"] }), /Unknown error code/);

    // the per-school-day limit
    const day = `writing-ai:${String(teacher.schoolId)}:${schoolDay(now)}`;
    for (let i = 0; i < WRITING_AI_PER_DAY; i++) await consumeRateLimit(repo, day, WRITING_AI_PER_DAY, 86_400_000, now);
    const lim = await W.requestAiDraft(repo, teacher, id, s3, env, now, { gemini: () => fakeAi().provider });
    assert.equal(lim.outcome, "LIMIT");
    assert.match(String(lim.reason), /AI writing drafts are used/);
    const tomorrow = new Date(now.getTime() + 86_400_000);
    assert.equal((await W.requestAiDraft(repo, teacher, id, s3, env, tomorrow, { gemini: () => fakeAi().provider })).outcome, "PENDING");
    await assert.rejects(W.requestAiDraft(repo, teacher, id, s3, env, tomorrow, { gemini: () => fakeAi().provider }), /already waiting/);
  });

  test("FREE writing keeps the old 0–4 rubric, with no self-check and no stages", async () => {
    const id = await W.createTask(repo, teacher, { classId, kind: "WRITE", title: "Free", prompt: "Write anything you like." }, now);
    const me = await studentActor(students[4]);
    assert.deepEqual(await W.saveWriting(repo, me, id, SAMPLE, true, now), { ai: false, stage: null });
    await assert.rejects(W.scoreSubmission(repo, teacher, id, students[4], { ideas: 5, organization: 3, language: 3, conventions: 3 }, null, now), /0 to 4/);
    assert.equal(await W.scoreSubmission(repo, teacher, id, students[4], { ideas: 0, organization: 3, language: 3, conventions: 3 }, null, now), "SCORED");
    assert.equal((await W.taskForStudent(repo, me, id)).mine.total, 9);
    assert.deepEqual((await W.taskForTeacher(repo, teacher, id)).subs.find((x) => x.studentId === students[4])!.reteach.map((r) => r.trait), ["ideas"]);
  });
});

describe("🔤 Grammar workbook rows → the import table", () => {
  test("error_correction, sentence_order and sentence_combine rows get their own columns", () => {
    const row = { grade: 4, skillId: "G4-U1W1-S1", level: "On" as const, ccss: "L.4.1f", passage: "", options: ["", "", "", ""], letter: "", explanation: "", segments: "", errorIndex: "", correction: "", items: "", sentences: "", connector: "", accepted: "", answer: "" };
    const wb: GrammarWorkbook = {
      lessons: new Map(), skills: new Map([[4, [{ id: "G4-U1W1-S1", code: "G4.grammar.g4-u1w1-s1", lesson: "L", name: "Compound sentences", kind: "Grammar & Usage", ccss: ["L.4.1.F"], rule: "" }]]]),
      questions: [
        { ...row, questionId: "1", type: "error_correction", stem: "Find the mistake.", segments: "She | go | to school.", errorIndex: "2", correction: "goes" },
        { ...row, questionId: "2", type: "sentence_order", stem: "Put in order.", items: "First, wake up. | Then, eat. | Finally, go." },
        { ...row, questionId: "3", type: "sentence_combine", stem: "Join with but.", sentences: "It is hot. | The night is cold.", connector: "but", accepted: "It is hot, but the night is cold." },
      ],
    };
    const t = grammarTable(wb, 4);
    const c = (h: string) => t[0].indexOf(h);
    assert.deepEqual(t.slice(1).map((r) => r[c("Question Type")]), ["Error Correction", "Sentence Order", "Sentence Combining"]);
    assert.deepEqual([t[1][c("Sentence Parts")], t[1][c("Correct Answer")], t[1][c("Correction")]], ["She | go | to school.", "2", "goes"]);
    assert.equal(t[2][c("Order Items")], "First, wake up. | Then, eat. | Finally, go.");
    assert.deepEqual([t[3][c("Sentences to Combine")], t[3][c("Joining Word")], t[3][c("Correct Answer")]], ["It is hot. | The night is cold.", "but", "It is hot, but the night is cold."]);
  });
});
