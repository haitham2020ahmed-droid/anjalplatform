/**
 * UI reorg Phase 1 — the question bank linked to skills, MAP areas and NAFS areas (demo school, in memory; no real data):
 *   - ONE shared count: search (skill results and the Question Bank's “skills matching”) = MAP section = NAFS section
 *     = master list = Bank ↔ MAP / NAFS, for the same skill
 *   - the NAFS rule (category / domain / MAP area / standards) and the admin-editable NAFS area list
 *   - the link pass: deterministic rules applied, unsure decisions listed for review (never guessed), idempotent,
 *     no question deleted; the review list moves a question with its answers
 *   - admin-only pages and functions (a teacher is refused)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { seedQuestions } from "../src/server/seeding/questions";
import { loadBank } from "../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { searchEverything } from "../src/server/search/everything";
import { listQuestions } from "../src/server/admin/questions";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { masterSkills } from "../src/server/skills/master";
import { mapLinks } from "../src/server/map/map-more";
import { countQuestionsOfSkill, countQuestionsOfSkills, questionAreas, questionsOfNafsArea, questionsOfSkill, skillAreas, skillsMatching } from "../src/server/questions/skill-questions";
import { linkBank } from "../src/server/questions/link-bank";
import { approveReview, dismissReview, listReviews } from "../src/server/questions/link-review";
import { ensureNafsAreas, linkNafsFamily, NAFS_DEFAULT_AREAS, nafsAreas, nafsLinks, nafsRuleForFamily, saveNafsArea, seedNafsLinks, setQuestionNafsArea } from "../src/server/nafs/nafs-links";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("UI reorg Phase 1 · question bank ↔ skills, MAP and NAFS", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId: string; let g4Class: string;
  let linkResult: Awaited<ReturnType<typeof linkBank>>;
  const ids: Record<string, string> = {};

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = s(admin.schoolId);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId });
    // the demo bank is published (the owner publishes the bank)
    await repo.updateMany("Question", { deletedAt: null }, { status: "PUBLISHED" });
    const t4 = (await repo.findUnique("User", { username: "demo.teacher.4a" }))!;
    teacher = await resolveActor(repo, t4);
    const tr = (await repo.findUnique("Teacher", { userId: t4.id }))!;
    g4Class = s((await repo.findMany("ClassTeacher", { teacherId: tr.id }))[0].classId);
    // three questions without a real skill (Grade 4's hidden “Unclassified” skill)
    const hidden = await unclassifiedSkillId(repo, schoolId, 4);
    const mc = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const g4Skills = new Set((await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }, { select: ["id"] })).map((k) => s(k.id)));
    // a standard linked to exactly one Grade 4 skill → a deterministic link
    const links = (await repo.findMany("SkillStandard", {})).filter((l) => g4Skills.has(s(l.skillId)));
    const per = new Map<string, string[]>(); for (const l of links) per.set(s(l.standardId), [...(per.get(s(l.standardId)) ?? []), s(l.skillId)]);
    const [stdId, [stdSkill]] = [...per.entries()].find(([, v]) => v.length === 1)!;
    ids.stdSkill = stdSkill;
    const mk = async (stem: string, standardId: string | null) => {
      const q = await repo.create("Question", { skillId: hidden, typeId: mc.id, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", standardId, createdAt: new Date(), updatedAt: new Date() });
      for (const [i, o] of ["A", "B"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Option ${o}`, isCorrect: i === 0, order: i });
      return s(q.id);
    };
    ids.sure = await mk("TEST P1 Which choice is correct about the passage?", stdId);
    ids.wording = await mk("TEST P1 What is the theme of the story about the lost kite?", null);
    ids.none = await mk("TEST P1 question about rain clouds?", null);
    ids.hidden = hidden;
  });

  test("the NAFS rule: category / domain first, then the MAP goal area, then the standards; unsure is not decided", () => {
    const r = (o: Partial<Parameters<typeof nafsRuleForFamily>[0]>) => nafsRuleForFamily({ code: "x", name: "x", domain: "READING", category: "COMPREHENSION", mapArea: null, standards: [], ...o });
    assert.equal(r({ domain: "GRAMMAR", category: "GRAMMAR" }).area, "GRAMMAR");
    assert.equal(r({ domain: "LANGUAGE", category: "MECHANICS" }).area, "WRITING");
    assert.equal(r({ domain: "WRITING", category: "WRITING" }).area, "WRITING");
    assert.equal(r({ domain: "VOCABULARY", category: "VOCABULARY" }).area, "VOCAB");
    assert.equal(r({ category: "LITERATURE" }).area, "RC_LIT");
    assert.equal(r({ category: "INFORMATIONAL" }).area, "RC_INFO");
    assert.equal(r({ mapArea: "LIT_THEME" }).area, "RC_LIT");
    assert.equal(r({ mapArea: "INFO_STRUCTURE" }).area, "RC_INFO");
    assert.equal(r({ standards: ["RI.4.8"] }).area, "RC_INFO");
    const both = r({ standards: ["RL.4.1", "RI.4.1"] });
    assert.ok(both.confidence < 0.8, "RL and RI without a MAP area: not sure");
    assert.equal(r({}).area, null);
    assert.equal(NAFS_DEFAULT_AREAS.map((a) => a.name).join(" | "), "Reading Comprehension: Literary | Reading Comprehension: Informational | Vocabulary | Grammar & Language Use | Writing & Mechanics");
  });

  test("dry run writes nothing; --apply links what is sure, lists the rest for review, and never deletes a question", async () => {
    const questionsBefore = await repo.count("Question", {});
    const dry = await linkBank(repo, schoolId, { apply: false });
    assert.equal(await repo.count("SkillLinkReview", {}), 0, "dry run: no review rows");
    assert.equal(await repo.count("NafsSkillLink", {}), 0, "dry run: no NAFS links");
    assert.equal(s((await repo.findUnique("Question", { id: ids.sure }))!.skillId), ids.hidden, "dry run: nothing moved");
    assert.ok(dry.summary.linked >= 1 && dry.summary.familiesNafsLinked > 0);
    linkResult = await linkBank(repo, schoolId, { apply: true, actorId: admin.userId });
    assert.equal(s((await repo.findUnique("Question", { id: ids.sure }))!.skillId), ids.stdSkill, "standard → its only skill");
    assert.equal(s((await repo.findUnique("Question", { id: ids.wording }))!.skillId), ids.hidden, "a wording guess is not applied");
    assert.equal(s((await repo.findUnique("Question", { id: ids.none }))!.skillId), ids.hidden);
    const rev = await repo.findMany("SkillLinkReview", { schoolId, kind: "QUESTION" });
    const w = rev.find((r) => r.subjectId === ids.wording)!;
    assert.ok(w && w.status === "OPEN" && w.guessId && /Theme/.test(s(w.guessLabel)) && Number(w.confidence) < 0.8, "listed with its best guess and why");
    assert.ok(rev.some((r) => r.subjectId === ids.none && !r.guessId), "no guess at all: listed with the reason");
    assert.ok((await repo.findMany("AuditLog", { action: "question.remap", entityId: ids.sure })).length === 1, "audit row");
    assert.ok(await repo.count("NafsSkillLink", {}) > 0 && (await nafsAreas(repo)).length === 5, "NAFS areas seeded as data; families linked");
    // idempotent
    const again = await linkBank(repo, schoolId, { apply: true });
    assert.equal(again.summary.linked, 0);
    assert.equal(again.summary.familiesNafsLinked, 0);
    assert.equal(await repo.count("SkillLinkReview", { schoolId }), rev.length + (await repo.count("SkillLinkReview", { schoolId, kind: { not: "QUESTION" } })), "no duplicate review rows");
    assert.equal(await repo.count("Question", {}), questionsBefore, "no question deleted");
  });

  test("search = MAP section = NAFS section = master list for the same skill (3 skills)", async () => {
    const view = (await teacherCurriculum(repo, teacher, g4Class))!;
    const master = await masterSkills(repo, schoolId, { grade: 4 });
    for (const name of ["Make Inferences", "Theme", "Context Clues"]) {
      const k = master.find((x) => x.name === name)!;
      assert.ok(k, name);
      const shared = await countQuestionsOfSkill(repo, schoolId, k.id);
      assert.ok(shared > 0, `${name} has questions`);
      const mapRow = view.mapAreas.flatMap((a) => a.skills).find((x) => x.id === k.id)!;
      const nafsRow = (view.nafsAreas ?? []).flatMap((a) => a.skills).find((x) => x.id === k.id)!;
      const ev = await searchEverything(repo, teacher, name);
      const hit = ev.groups.find((g) => g.kind === "SKILL")!.hits.find((h) => h.id === k.id)!;
      const matched = (await skillsMatching(repo, schoolId, name, { grade: 4 })).find((m) => m.id === k.id)!;
      const bank = await listQuestions(repo, teacher, { status: "PUBLISHED", skillId: k.id, gradeLevel: 4, limit: 0 });
      assert.equal(mapRow.questions, shared, `${name}: MAP section`);
      assert.equal(nafsRow.questions, shared, `${name}: NAFS section`);
      assert.match(hit.sub, new RegExp(`· ${shared} questions$`), `${name}: search`);
      assert.equal(matched.questions, shared, `${name}: Question Bank “skills matching”`);
      assert.equal(k.questions, shared, `${name}: master list`);
      // one question bank: the count is the family's pool; the Question Bank list of one grade's row shows its own questions
      assert.equal(bank.total, (await countQuestionsOfSkills(repo, schoolId, [k.id], { own: true })).get(k.id), `${name}: Question Bank list of the skill`);
      assert.ok(shared >= bank.total, `${name}: the pooled count includes the row's own questions`);
    }
    // “main inference” names Make Inferences in both searches
    const mi = await skillsMatching(repo, schoolId, "main inference");
    assert.ok(mi.some((m) => m.name === "Make Inferences" && m.map && m.nafs?.code === "RC_LIT"), JSON.stringify(mi));
    const qb = await listQuestions(repo, teacher, { status: "PUBLISHED", q: "main inference" });
    const miTotal = [...(await countQuestionsOfSkills(repo, schoolId, mi.map((m) => m.id))).values()].reduce((x, y) => x + y, 0);
    assert.ok(miTotal > 0 && qb.total >= miTotal, `the Question Bank finds the skill's questions too (${qb.total} ≥ ${miTotal})`);
    // Bank ↔ MAP shows the same per-family total
    const fam = (await mapLinks(repo, admin)).rows.find((r) => r.family === "Make Inferences" || r.skills.includes("Make Inferences"))!;
    const all = (await masterSkills(repo, schoolId)).filter((k) => k.name === "Make Inferences");
    // one question bank: every grade's row shows the pooled count; the family total adds the rows' own questions once
    const own = await countQuestionsOfSkills(repo, schoolId, all.map((k) => k.id), { own: true });
    assert.equal(fam.questions, all.reduce((t, k) => t + (own.get(k.id) ?? 0), 0));
  });

  test("questions of a skill: level and status filters, bounded pages, other schools refused; areas from the skill unless overridden", async () => {
    const k = (await masterSkills(repo, schoolId, { grade: 4 })).find((x) => x.name === "Theme")!;
    const all = await questionsOfSkill(repo, schoolId, k.id, { take: 1000 });
    assert.equal(all.length, k.questions);
    const on = await questionsOfSkill(repo, schoolId, k.id, { level: "ON" });
    assert.ok(on.every((q) => q.difficultyLevel === 4));
    assert.equal((await questionsOfSkill(repo, schoolId, k.id, { take: 2 })).length, Math.min(2, all.length));
    assert.deepEqual(await questionsOfSkill(repo, "another-school", k.id), []);
    assert.equal((await countQuestionsOfSkills(repo, "another-school", [k.id])).get(k.id), 0);
    const areas = (await skillAreas(repo, [k.id])).get(k.id)!;
    assert.equal(areas.nafs?.code, "RC_LIT");
    assert.ok(areas.map, "Theme has a MAP goal area");
    const q = all[0].id;
    assert.equal((await questionAreas(repo, [q])).get(q)!.nafsFrom, "SKILL");
    await setQuestionNafsArea(repo, admin, q, "VOCAB");
    const qa = (await questionAreas(repo, [q])).get(q)!;
    assert.deepEqual([qa.nafs, qa.nafsFrom], ["VOCAB", "QUESTION"]);
    assert.ok((await questionsOfNafsArea(repo, schoolId, "VOCAB", { grade: 4, take: 1000 })).some((x) => x.id === q), "the override moves it into the area");
    assert.ok(!(await questionsOfNafsArea(repo, schoolId, "RC_LIT", { grade: 4, take: 1000 })).some((x) => x.id === q), "and out of the skill's area");
    await setQuestionNafsArea(repo, admin, q, null);
  });

  test("the review list: approve the best guess (answers move), dismiss; admins only", async () => {
    const v = await listReviews(repo, admin, { kind: "QUESTION" });
    const row = v.rows.find((r) => r.subjectId === ids.wording)!;
    assert.ok(row && row.grade === 4 && row.currentSkill === "Unclassified" && (v.skillsByGrade[4] ?? []).length > 10);
    await assert.rejects(listReviews(repo, teacher), ForbiddenError);
    await assert.rejects(approveReview(repo, teacher, row.id, null), ForbiddenError);
    await approveReview(repo, admin, row.id, null);
    assert.equal(s((await repo.findUnique("Question", { id: ids.wording }))!.skillId), s(row.guessId));
    assert.equal(s((await repo.findUnique("SkillLinkReview", { id: row.id }))!.status), "APPROVED");
    await assert.rejects(approveReview(repo, admin, row.id, null), /already reviewed/);
    const none = v.rows.find((r) => r.subjectId === ids.none)!;
    await dismissReview(repo, admin, none.id);
    assert.equal(s((await repo.findUnique("Question", { id: ids.none }))!.skillId), ids.hidden, "dismiss changes nothing");
    // a later run does not reopen it
    await linkBank(repo, schoolId, { apply: true });
    assert.equal(s((await repo.findUnique("SkillLinkReview", { id: none.id }))!.status), "DISMISSED");
  });

  test("Bank ↔ NAFS: admin sets an area (kept by later runs), edits the area list; a teacher is refused", async () => {
    await ensureNafsAreas(repo);
    await assert.rejects(nafsLinks(repo, teacher), ForbiddenError);
    const v = await nafsLinks(repo, admin);
    assert.ok(v.rows.length > 20 && v.rows.every((r) => r.questions >= 0));
    const fam = v.rows.find((r) => r.areaCode === "RC_LIT")!;
    await linkNafsFamily(repo, admin, fam.familyId, "VOCAB");
    await seedNafsLinks(repo, schoolId, { apply: true });
    const link = (await repo.findUnique("NafsSkillLink", { familyId: fam.familyId }))!;
    assert.deepEqual([s(link.source)], ["ADMIN"]);
    assert.equal(s((await repo.findUnique("NafsArea", { id: link.areaId }))!.code), "VOCAB", "an admin link is never changed automatically");
    await linkNafsFamily(repo, admin, fam.familyId, "RC_LIT");
    await assert.rejects(linkNafsFamily(repo, teacher, fam.familyId, "RC_LIT"), ForbiddenError);
    const id = await saveNafsArea(repo, admin, { name: "Listening" });
    assert.ok((await nafsAreas(repo)).some((a) => a.id === id && a.code === "LISTENING"));
    await saveNafsArea(repo, admin, { id, name: "Listening", isActive: false });
    assert.ok(!(await nafsAreas(repo, { activeOnly: true })).some((a) => a.id === id), "switched off, not deleted");
    await assert.rejects(saveNafsArea(repo, teacher, { name: "X" }), ForbiddenError);
  });

  test("the link result reports MAP / NAFS families and ReadRise kinds", () => {
    const m = linkResult.summary;
    assert.ok(m.questions > 1000 && m.onHiddenBefore >= 3);
    assert.ok(m.familiesNafsLinked > 50, String(m.familiesNafsLinked));
    assert.equal(typeof m.readRise.questions, "number");
  });
});
