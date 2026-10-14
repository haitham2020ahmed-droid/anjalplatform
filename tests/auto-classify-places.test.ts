/**
 * 🪄 Owner r68 (3): Auto-classify showed “0 classified · 2345 still without a skill” on the live site. The questions
 * left were the Curriculum Map pack's Review questions (every grade) and Grade 6's Concept Vocabulary questions: their
 * places carry no skill text (G6.U1.SEL1.CV, G4.U1.TS1.REV), so no rule matched. Now:
 *   - a Concept Vocabulary place → the grade's Concept Vocabulary skill (created when the grade has none; one of
 *     another grade is copied; one under another name is used)
 *   - a Review place → the selection's vocabulary (a question on its words) or its Analyze Craft and Structure skills
 *     (the one the wording names, else the lesson's main skill), from the map and the lesson details / readingSkills
 *   - an Analyze Craft and Structure place (G4.U1.TS1.ACS.ABOVE) → that lesson's skill, as before
 * In-memory SQLite only; the live data shape is rebuilt from the bundled map pack.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { createDraft } from "../src/server/admin/questions";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { autoClassify, unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { conceptVocabularyOf, decideSkill } from "../src/server/curriculum-map/remap-skills";
import { unclassifiedCount } from "../src/server/admin/stuck-questions";
import { addMapSets, loadMapSetsFile } from "../src/server/questions/map-sets";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

/** The live shape: questions loaded before r68 — on their grade's hidden skill, no standard, no Concept Vocabulary skill. */
async function toLiveShape(repo: SqliteRepo, schoolId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const link = (await repo.findMany("QuestionMapLink", { questionId: id }))[0];
    const node = (await repo.findUnique("CurriculumMapNode", { id: link.nodeId }))!;
    const hidden = await unclassifiedSkillId(repo, schoolId, Number(/^G(\d+)/.exec(s(node.code))![1]));
    await repo.updateMany("Question", { id }, { skillId: hidden, standardId: null });
  }
  const cv = await repo.findMany("Skill", { code: { contains: "concept-vocabulary" } }, { select: ["id"] });
  for (const k of cv) if (!(await repo.count("Question", { skillId: k.id }))) await repo.deleteMany("Skill", { id: k.id });
}

describe("🪄 Auto-classify: Curriculum Map places → the lesson's skill", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  const ids: Record<string, string> = {};
  const skillOf = async (id: string) => { const q = (await repo.findUnique("Question", { id }))!; return (await repo.findUnique("Skill", { id: q.skillId }))!; };

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    // like the map pack: no skill named, the place only
    const mc = (stem: string, place: string) => createDraft(repo, admin, { mapNodeCode: place, type: "MULTIPLE_CHOICE", stem, level: 4, whyCorrect: "Because it is.", options: [{ label: "A", text: `right ${stem.length}`, correct: true, rationale: null }, { label: "B", text: "wrong one", correct: false, rationale: "No." }] } as never);
    ids.acs = await mc("Which sentence tells how a volcano and an earthquake are alike?", "G4.U1.TS1.ACS.ABOVE");
    ids.cv6 = await mc("What does affect mean?", "G6.U1.SEL1.CV");
    ids.rev6theme = await mc("Which sentence best states the theme of a story about two friends who must compete?", "G6.U1.SEL1.REV");
    ids.rev6word = await mc("True or false: “Losing the first bout did not affect Yasir's confidence.” Here affect means to change.", "G6.U1.SEL1.REV");
    ids.rev6other = await mc("Put the steps in order.", "G6.U1.SEL1.REV");
    ids.rev4word = await mc("The tailor will alter the dress. Which word means the same as alter?", "G4.U1.TS1.REV");
    await toLiveShape(repo, admin.schoolId!, Object.values(ids));
  });

  test("bug reproduced: the old rules find nothing for a Grade 6 Concept Vocabulary or a Review place", () => {
    const skills = [{ id: "t", name: "Theme", family: "theme", category: "LITERATURE" }, { id: "e", name: "Cite Text Evidence", family: "text-evidence", category: "COMPREHENSION" }];
    assert.equal(decideSkill({ stem: "What does affect mean?", standardCandidates: [], category: "CONCEPT_VOCABULARY", skillsText: null }, skills), null);
    assert.equal(decideSkill({ stem: "Put the steps in order.", standardCandidates: [], category: "REVIEW", skillsText: null }, skills), null);
    // with the lesson (r68)
    const lesson = { readingPhrases: ["Determine Theme", "Text Evidence"], vocabularyPhrases: [], words: ["affect", "bout"] };
    const cv = { id: "cv", name: "Concept Vocabulary", family: "concept-vocabulary", category: "VOCABULARY" };
    assert.equal(decideSkill({ stem: "What does affect mean?", standardCandidates: [], category: "CONCEPT_VOCABULARY", skillsText: null, lesson, cvSkill: cv }, skills)?.skill.id, "cv");
    assert.equal(decideSkill({ stem: "Put the steps in order.", standardCandidates: [], category: "REVIEW", skillsText: null, lesson, cvSkill: cv }, skills)?.skill.id, "t", "the lesson's main skill");
    assert.equal(decideSkill({ stem: "Which detail is the best evidence?", standardCandidates: [], category: "REVIEW", skillsText: null, lesson, cvSkill: cv }, skills)?.skill.id, "e", "the lesson skill its wording names");
    assert.equal(decideSkill({ stem: "Losing the bout did not affect him. What does affect mean here?", standardCandidates: [], category: "REVIEW", skillsText: null, lesson, cvSkill: cv }, skills)?.skill.id, "cv", "a lesson word → the vocabulary");
  });

  test("a grade's Concept Vocabulary skill: by name, else one under another name", () => {
    assert.equal(conceptVocabularyOf([{ name: "Theme" }, { name: "Concept Vocabulary (Grade 6)" }])?.name, "Concept Vocabulary (Grade 6)");
    assert.equal(conceptVocabularyOf([{ name: "Context Clues" }, { name: "Selection Vocabulary" }])?.name, "Selection Vocabulary");
    assert.equal(conceptVocabularyOf([{ name: "Context Clues" }, { name: "Academic and Domain-Specific Vocabulary" }]), null);
  });

  test("Auto-classify puts each under its lesson's skill (was 0)", async () => {
    // another grade already has a Concept Vocabulary skill (an imported one): Grade 6 gets a copy of it (same family)
    const g4cur = (await repo.findMany("Curriculum", { gradeId: (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0].id }))[0];
    const fam = await repo.create("SkillFamily", { code: "school.cv", name: "Concept Vocabulary", domain: "VOCABULARY", category: "VOCABULARY" });
    await repo.create("Skill", { curriculumId: g4cur.id, familyId: fam.id, code: "G4.CV", name: "Concept Vocabulary", domain: "VOCABULARY", category: "VOCABULARY", sequence: 5 });
    const before = await unclassifiedCount(repo, admin.schoolId!);
    assert.equal(before, Object.keys(ids).length);
    const r = await autoClassify(repo, admin.schoolId!, admin.userId);
    assert.deepEqual(r, { classified: before, left: 0 });

    assert.equal((await skillOf(ids.acs)).code, "G4.compare-contrast", "G4.U1.TS1.ACS.ABOVE → Compare and Contrast (the lesson's focus skill)");
    const cv6 = await skillOf(ids.cv6);
    assert.equal(cv6.code, "G6.concept-vocabulary", "G6.U1.SEL1.CV → Grade 6 Concept Vocabulary");
    assert.equal(cv6.name, "Concept Vocabulary");
    assert.equal(cv6.familyId, fam.id, "the missing grade skill copied from the one of another grade");
    assert.equal((await skillOf(ids.rev6theme)).code, "G6.theme", "Review: the lesson's skill the wording names");
    assert.equal((await skillOf(ids.rev6word)).code, "G6.concept-vocabulary", "Review: a question on the lesson's words");
    assert.equal((await skillOf(ids.rev6other)).code, "G6.theme", "Review: else the lesson's main skill (Determine Theme)");
    assert.equal((await skillOf(ids.rev4word)).code, "G4.multiple-meaning", "Grade 4 Review vocabulary → the selection's vocabulary skill (Multiple-Meaning Words), like its Concept Vocabulary place");
    assert.ok(await repo.count("AuditLog", { action: "skill.create" }) >= 1, "the new skill is in the audit log");
    assert.equal((await autoClassify(repo, admin.schoolId!, admin.userId)).classified, 0, "idempotent");
  });
});

describe("🪄 Auto-classify on the live data shape (the whole bundled Curriculum Map pack)", () => {
  test("every Review and Grade 6 Concept Vocabulary question is classified; none left", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    await addMapSets(repo, admin.schoolId!, await loadMapSetsFile(), admin);
    const nodes = (await repo.findMany("CurriculumMapNode", {}, { select: ["id", "code"] })).filter((n) => /\.REV$|^G6\..*\.CV$/.test(s(n.code)));
    const qids: string[] = [];
    for (let i = 0; i < nodes.length; i += 50) qids.push(...(await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.slice(i, i + 50).map((n) => n.id) } }, { select: ["questionId"] })).map((l) => s(l.questionId)));
    for (const g of [4, 5, 6]) {
      const hidden = await unclassifiedSkillId(repo, admin.schoolId!, g);
      const mine = (await repo.findMany("QuestionMapLink", { questionId: { in: qids } }, { select: ["questionId", "nodeId"] })).filter((l) => nodes.find((n) => n.id === l.nodeId && s(n.code).startsWith(`G${g}.`))).map((l) => s(l.questionId));
      for (let i = 0; i < mine.length; i += 300) await repo.updateMany("Question", { id: { in: mine.slice(i, i + 300) } }, { skillId: hidden, standardId: null });
    }
    const cv = await repo.findMany("Skill", { code: { contains: "concept-vocabulary" } }, { select: ["id"] });
    if (cv.length) await repo.deleteMany("Skill", { id: { in: cv.map((k) => k.id) } });
    const before = await unclassifiedCount(repo, admin.schoolId!);
    const r = await autoClassify(repo, admin.schoolId!, admin.userId);
    console.log(`Live data shape: ${before} without a skill → ${r.classified} classified · ${r.left} left`);
    assert.ok(before > 2000, `the live shape (${before})`);
    assert.equal(r.classified, before);
    assert.equal(r.left, 0);
  });
});
