import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { toCsv } from "../src/imports/csv";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { classifyQuestion, areaFromName, parseCcss, ccssExists, MAP_AREAS } from "../src/server/map/nwea-area";
import { applyClassification, classificationBackup, classificationPreview, reviewStandardFix, savedCounts, setQuestionArea, standardFixes } from "../src/server/map/question-areas";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { completeValidator, runCompletionBatch, saveCompletion } from "../src/server/ai/complete";
import { questionContent, tagContext } from "../src/server/ai/tools";
import { listQuestions } from "../src/server/admin/questions";
import { groupPools } from "../src/server/map/map-plan";
import { weakestArea } from "../src/server/student/weekly-check";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const enc = (s: string) => new TextEncoder().encode(s);
const C = (o: Partial<Parameters<typeof classifyQuestion>[0]>) => classifyQuestion({ grade: 4, standard: null, skillName: null, stem: "", ...o });

describe("🧭 NWEA MAP classification of one question (pure)", () => {
  test("CCSS → area, as in NWEA's Learning Continuum", () => {
    const area = (std: string, grade = 4) => C({ standard: std, grade }).name;
    assert.equal(area("RL.4.2"), "Literary Text");
    assert.equal(area("RL.4.4"), "Vocabulary", "word meaning in a text is Vocabulary");
    assert.equal(area("RI.5.3", 5), "Informational Text");
    assert.equal(area("RI.5.4", 5), "Vocabulary");
    assert.equal(area("L.4.5"), "Vocabulary");
    assert.equal(area("L.4.1"), "Language: Understand, Edit for Grammar, Usage");
    assert.equal(area("L.4.2"), "Language: Understand, Edit for Mechanics");
    assert.equal(area("L.6.3", 6), "Writing: Write, Revise Texts for Purpose and Audience");
    assert.equal(area("W.4.2"), "Writing: Write, Revise Texts for Purpose and Audience");
    assert.equal(area("RF.4.3"), "Vocabulary");
    assert.equal(C({ standard: "RF.4.3", stem: "Which word is spelled correctly?" }).name, "Language: Understand, Edit for Mechanics");
    assert.equal(area("CCSS.ELA-LITERACY.RL.4.2"), "Literary Text");
    assert.deepEqual(MAP_AREAS.map((a) => a.test), ["Reading", "Reading", "Reading", "Language Usage", "Language Usage", "Language Usage"]);
  });

  test("Mechanics skills, wrong grade and non-existent standards are fixed; the wording only suggests", () => {
    const contr = C({ standard: "L.4.1", skillName: "Contractions" });
    assert.deepEqual([contr.area, contr.source, contr.standard?.to, contr.standard?.sure], ["MECH", "SKILL", "L.4.2", true]);
    const homo = C({ standard: "L.4.2", skillName: "Homophones" });
    assert.deepEqual([homo.area, homo.standard], ["MECH", null], "already right: nothing to fix");
    const g = C({ standard: "RL.3.2", grade: 5 });
    assert.deepEqual([g.area, g.standard?.to, g.standard?.sure], ["LIT", "RL.5.2", true]);
    assert.equal(ccssExists(parseCcss("RL.4.8")!), false);
    const nope = C({ standard: "RL.4.8", skillStandards: ["RI.4.8"] });
    assert.deepEqual([nope.area, nope.standard?.to, nope.standard?.sure], ["INFO", "RI.4.8", true]);
    const words = C({ stem: "Which word is spelled correctly?", options: ["becuase", "because", "becaus", "beacause"] });
    assert.deepEqual([words.area, words.source, words.standard?.to, words.standard?.sure], ["MECH", "TEXT", "L.4.2", false]);
    const vocab = C({ stem: "What does the word “ancient” mean as it is used in paragraph 2?", passage: "The ancient city was built long ago. ".repeat(20) });
    assert.equal(vocab.area, "VOCAB");
    const lit = C({ stem: "How does the main character feel at the end of the story?" });
    assert.deepEqual([lit.area, lit.standard?.to], ["LIT", "RL.4.3"]);
    assert.deepEqual([C({ importArea: "Mechanics", standard: "RL.4.2" }).area, C({ importArea: "Mechanics", standard: "RL.4.2" }).source], ["MECH", "IMPORT"], "the file's own MAP column wins");
    assert.equal(C({}).area, null);
    assert.equal(areaFromName("Language: Understand, Edit for Grammar, Usage"), "GRAMMAR");
    assert.equal(areaFromName("Writing: Write, Revise Texts for Purpose and Audience"), "WRITING");
  });
});

describe("🧭 the whole bank on NWEA MAP (database, fake school)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("demo.admin"); teacher = await as("demo.teacher.4a");
  });

  test("preview saves nothing; backup lists every question; apply classifies without deleting; apply again changes nothing", async () => {
    await assert.rejects(classificationPreview(repo, teacher), ForbiddenError);
    const before = await repo.count("Question", {});
    const { preview, rows } = await classificationPreview(repo, admin);
    assert.ok(preview.total > 20);
    assert.equal(Object.values(preview.counts).reduce((t, c) => t + Object.values(c).reduce((a, b) => a + b, 0), 0), preview.total);
    assert.equal(await repo.count("Question", { mapInstructionalArea: { not: null } }), 0, "nothing saved by the preview");
    const backup = await classificationBackup(repo, admin);
    assert.equal(backup.length, rows.length + 1);
    const r = await applyClassification(repo, admin);
    assert.equal(r.classified + r.unclassified + r.kept, preview.total);
    assert.equal(await repo.count("Question", {}), before, "no question deleted or added");
    const saved = await savedCounts(repo, admin);
    assert.equal(saved.reduce((t, x) => t + x.n, 0), preview.total);
    const again = await applyClassification(repo, admin);
    assert.deepEqual([again.fixed, again.suggested], [0, 0], "a second run fixes and suggests nothing new");
    const q = (await repo.findMany("Question", { mapInstructionalArea: { not: null } }))[0];
    assert.ok(["Reading", "Language Usage"].includes(String(q.mapTest)));
  });

  test("an admin's area is kept; the bank filters by area; suggestions are approved or rejected", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED" }))[0];
    await setQuestionArea(repo, admin, [String(q.id)], "MECH");
    await applyClassification(repo, admin);
    const after = (await repo.findUnique("Question", { id: q.id }))!;
    assert.deepEqual([after.mapInstructionalArea, after.mapAreaSource], ["Language: Understand, Edit for Mechanics", "ADMIN"]);
    const list = await listQuestions(repo, teacher, { status: "PUBLISHED", mapArea: "MECH", gradeLevel: 4 });
    assert.ok(list.items.some((x) => x.id === q.id) && list.items.every((x) => x.mapArea === "Language: Understand, Edit for Mechanics"));
    // the MAP pools follow the question's own area
    const pk = await groupPools(repo, String(admin.schoolId), 4);
    assert.ok((pk.pools.get("MECH") ?? []).some((x) => x.id === q.id), "the question joins the Mechanics pool");
    // a suggestion from the wording: approve
    const sk = (await repo.findMany("Skill", { id: q.skillId }))[0];
    const n = await repo.create("Question", { skillId: sk.id, standardId: null, typeId: q.typeId, stem: "Which word is spelled correctly?", content: {}, difficultyLevel: 4, irtB: 0, status: "DRAFT", origin: "TEACHER_AUTHORED", createdAt: new Date(), updatedAt: new Date() });
    await repo.updateMany("SkillStandard", { skillId: sk.id }, { isPrimary: false });
    const fixes0 = (await standardFixes(repo, admin, "SUGGESTED")).total;
    const { autoClassify } = await import("../src/server/map/question-areas");
    await repo.deleteMany("SkillStandard", { skillId: "none" });
    await autoClassify(repo, String(admin.schoolId), [String(n.id)]);
    const nq = (await repo.findUnique("Question", { id: n.id }))!;
    assert.ok(nq.mapInstructionalArea, "a new question is classified as soon as it is saved");
    const sugg = await standardFixes(repo, admin, "SUGGESTED");
    if (sugg.total > fixes0) {
      const mine = sugg.rows.find((x) => x.questionId === n.id)!;
      await reviewStandardFix(repo, admin, [mine.id], true);
      assert.ok((await repo.findUnique("Question", { id: n.id }))!.standardId);
    }
  });

  test("import with empty columns: accepted, completed by rules, the rest by the AI (answer stays a draft to check)", async () => {
    const H = ["Grade", "Domain", "Skill", "CCSS Standard", "Level", "DOK", "Passage Title", "Passage", "Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer", "Explanation", "MAP Test", "MAP Instructional Area"];
    const rows = [
      ["4", "Language", "", "", "On", "1", "", "", "Choose the word that is spelled correctly in this sentence: We stayed inside ___ it rained.", "becuase", "because", "becaus", "beacause", "", "", "", ""],
      ["", "Reading Literature", "", "RL.4.2", "Below", "2", "The Kite", "Lina found a kite in the park and gave it back to the boy who lost it. She smiled when he thanked her.", "What is the theme of the story?", "Honesty matters", "Kites are fun", "Parks are big", "Boys run fast", "A", "Lina returns the kite, so the story is about honesty.", "Reading", "Literary Text"],
    ];
    const jobId = await analyzeImport(repo, admin, { fileName: "gaps.csv", bytes: enc(toCsv([H, ...rows])) });
    const job = await getImportJob(repo, admin, jobId);
    assert.deepEqual(job.rows.map((r) => r.status), ["VALID", "VALID"], JSON.stringify(job.rows.map((r) => r.errors)));
    assert.match(job.rows[0].warnings.join(" "), /Question Type was empty: read as Multiple Choice/);
    assert.match(job.rows[0].warnings.join(" "), /Correct Answer is empty/);
    assert.match(job.rows[1].warnings.join(" "), /Grade was empty: Grade 4/);
    let last; do { last = await commitImportChunk(repo, admin, jobId, { publish: true }); } while (!last.done);
    const done = await getImportJob(repo, admin, jobId);
    const [a, b] = await Promise.all(done.rows.map((r) => repo.findUnique("Question", { id: r.questionId! })));
    assert.equal(a!.status, "DRAFT", "the AI must choose the answer: a draft until checked");
    assert.deepEqual((a!.tags as { aiNeeds?: string[] }).aiNeeds?.includes("answer"), true);
    assert.equal(a!.mapInstructionalArea, "Language: Understand, Edit for Mechanics");
    assert.deepEqual([b!.status, b!.mapInstructionalArea, b!.mapAreaSource, (b!.tags as { dok?: string }).dok], ["PUBLISHED", "Literary Text", "IMPORT", "2"]);
    assert.equal(b!.difficultyLevel, 3, "Below → 3");
    assert.equal(String((await repo.findUnique("ReadingPassage", { id: b!.passageId }))!.title), "The Kite");
    const ai = (await repo.findMany("AiJob", { tool: "COMPLETE" }));
    assert.equal(ai.length, 1, "the AI completion is queued");
    // the AI's reply (a fake provider): checked against the options, then saved
    const fake = { ok: true as const, name: "gemini" as const, model: "test", provider: { complete: async (_s: string, body: string) => { const u = JSON.parse(body) as { questions: { id: string; needs: string[] }[] }; return JSON.stringify({ results: u.questions.map((q) => ({ id: q.id, correctLabels: ["B"], explanation: "“because” is the correct spelling.", skillCode: "x", standard: "L.4.2" })) }); } } };
    const items = await repo.findMany("AiJobItem", { jobId: ai[0].id });
    const ctx = await tagContext(repo, String(admin.schoolId), 4);
    const qi = await questionContent(repo, [String(a!.id)]);
    assert.equal(completeValidator(ctx.ctx, qi.map((q) => ({ ...q, needs: ["answer"] })))({ results: [{ id: a!.id, correctLabels: ["Z"] }] }).ok, false, "a letter that is not an option is refused");
    const okSkill = ctx.skills[0].code;
    const fake2 = { ...fake, provider: { complete: async (_s: string, body: string) => { const u = JSON.parse(body) as { questions: { id: string }[] }; return JSON.stringify({ results: u.questions.map((q) => ({ id: q.id, correctLabels: ["B"], explanation: "“because” is the correct spelling.", skillCode: okSkill, standard: ctx.ctx.standards.find((s) => s.code === "L.4.2")?.code ?? ctx.ctx.standards[0].code })) }); } } };
    void fake;
    const r = await runCompletionBatch(repo, String(admin.schoolId), ai[0], items, fake2 as never, new Date(), async () => {});
    assert.equal(r.stop, false, String(r.message));
    const opts = (await repo.findMany("QuestionOption", { questionId: a!.id })).sort((x, y) => Number(x.order) - Number(y.order));
    assert.deepEqual(opts.map((o) => Boolean(o.isCorrect)), [false, true, false, false]);
    const filled = (await repo.findUnique("Question", { id: a!.id }))!;
    assert.equal((filled.tags as { aiNeeds?: string[] }).aiNeeds, undefined);
    assert.equal((filled.tags as { aiFilled?: { review?: boolean } }).aiFilled?.review, true, "marked “AI filled · check”");
    assert.equal(filled.status, "DRAFT");
    const check = await listQuestions(repo, admin, { status: "DRAFT", aiCheck: true });
    assert.ok(check.items.some((x) => x.id === a!.id && x.aiCheck));
    assert.match(String((await repo.findMany("QuestionExplanation", { questionId: a!.id }))[0].body ? JSON.stringify((await repo.findMany("QuestionExplanation", { questionId: a!.id }))[0].body) : ""), /correct spelling/);
    void saveCompletion;
  });

  test("the Weekly Check aims at the student's weakest MAP area", async () => {
    const st = (await repo.findMany("Student", {}))[0];
    const d = new Date("2026-09-15");
    for (const [goal, rit] of [["Literary Text", 205], ["Informational Text", 188], ["Vocabulary", 199]] as const) await repo.create("MapResult", { studentId: st.id, testDate: d, subject: "Reading", goalName: goal, rit, termName: "Fall 2026", importedAt: d });
    assert.deepEqual(await weakestArea(repo, String(st.id)), { key: "INFO", rit: 188 });
  });
});
