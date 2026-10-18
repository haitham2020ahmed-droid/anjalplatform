/**
 * r82 reproduction fixture (owner: "for teacher Elrefaie, Student Skills STILL shows ALL skills"): the live data shapes
 * r78's fixture did not have, in one Grade 4 class of the in-memory demo school. The viewing teacher ("Elrefaie" =
 * demo.teacher.4a) assigned SIX things; everything else in the class must stay out of their Student Skills.
 *
 *   Elrefaie's own work (her Assigned page)                                   → the skills she CHOSE
 *     theme              Assign a skill (Curriculum)                         → fam:theme
 *     Curriculum Map     "Send plan" of Unit 1 · Text Set 1 · Analyze Craft    → the place's declared skills:
 *                        and Structure — its questions span 15 skills          fam:reread, fam:text-features, fam:compare-contrast
 *     Curriculum Map     the same section assigned directly (Assign)           → the same three
 *     summarize          a hand-picked set of ONE skill's questions           → fam:summarize
 *     MAP plan           "MAP plan · Literary Text" set (questions of 10 skills; the area's skillIds = [inference])
 *                                                                              → fam:inference
 *     MAP group          "MAP group · Literary Text" (12 skills, no chosen skill) → nothing
 *     commas             Assign (Grammar) — later removed for ONE student      → fam:commas (that student: —)
 *     a unit assignment  (target UNIT, no skill)                                → nothing
 *     Weekly Check, a "Review check: …", a withdrawn plan's place, a cancelled skill (cause-effect) → nothing
 *   NOT hers                                                                    → nothing for her (all for the admin)
 *     a co-teacher's work in the same class: Assign "capitalization" + a 20-skill set
 *     last year's teacher (no longer teaching the class): Assign "point-of-view"
 *   practised but never assigned: figurative-language (answers + a ◐ star)    → nothing
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./db";
import { publishGrade4Bank } from "./practice";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { parseCurriculumMap } from "../../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../../src/server/curriculum-map/seed";
import { sendMapPlan } from "../../src/server/curriculum-map/send-plan";
import { assignFromMap } from "../../src/server/curriculum-map/levels";
import { clearMapCache } from "../../src/server/curriculum-map/questions";
import { assignQuestions, assignSkill } from "../../src/server/teacher/assign";
import { cancelAssignment } from "../../src/server/teacher/assigned";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

export interface R82 {
  repo: SqliteRepo; teacher: Actor; admin: Actor; coTeacher: Actor; schoolId: string; classId: string; ids: string[]; tid: string;
  g4: Map<string, string>; now: Date;
  /** Elrefaie's columns (by kind of her Assigned page) */
  mine: { SKILL: string[]; PLAN: string[] };
  /** the admin also sees these */
  others: string[];
  /** the set spanning 15 skills (r78 counted them all) */
  mixedSkills: string[];
  commas: string; cancelled: string;
}

export async function r82Fixture(): Promise<R82> {
  const now = new Date("2026-10-15T09:00:00Z");
  const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 });
  await publishGrade4Bank(repo);
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const teacher = await as("demo.teacher.4a"), admin = await as("demo.admin");
  const schoolId = teacher.schoolId!;
  const tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
  const classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
  const ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
  const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
  const g4 = new Map<string, string>();
  for (const k of await repo.findMany("Skill", { curriculumId: cur.id })) g4.set(s(k.code).replace(/^G4\./, ""), s(k.id));
  const qs = async (code: string, n = 2) => (await repo.findMany("Question", { skillId: g4.get(code)!, status: "PUBLISHED" }, { select: ["id"], take: n })).map((q) => s(q.id));
  const link = async (aid: unknown, who: string[]) => { for (const st of who) await repo.create("AssignmentStudent", { assignmentId: aid, studentId: st, status: "NOT_STARTED", progress: 0 }); };

  // a co-teacher of the class and last year's teacher (not teaching it any more)
  const mkTeacher = async (username: string, teach: boolean) => {
    const u = await repo.create("User", { username, displayName: username, role: "TEACHER", schoolId, passwordHash: "x" });
    const t = await repo.create("Teacher", { userId: u.id, schoolId });
    if (teach) await repo.create("ClassTeacher", { classId, teacherId: t.id, isLead: false });
    return { actor: await resolveActor(repo, u), tid: s(t.id) };
  };
  const co = await mkTeacher("demo.coteacher.4a", true);
  const old = await mkTeacher("demo.lastyear.4a", false);

  // the Curriculum Map, with the questions of 15 skills on Unit 1 · Text Set 1 · Analyze Craft and Structure
  await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId });
  const MIXED = ["reread", "text-features", "compare-contrast", "theme", "central-idea", "character", "inference", "sequence", "cause-effect", "author-purpose", "plot-events", "summarize", "point-of-view", "make-predictions", "text-evidence"];
  const nodes = await repo.findMany("CurriculumMapNode", { code: { in: ["G4.U1.TS1.ACS.ABOVE", "G4.U1.TS1.ACS.ON", "G4.U1.TS1.ACS.BELOW"] } });
  for (const n of nodes) for (const code of MIXED) for (const q of await qs(code, 2)) await repo.create("QuestionMapLink", { questionId: q, nodeId: n.id, createdAt: now });
  clearMapCache();

  // ✅ Elrefaie's own work
  await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, source: "CURRICULUM", dueAt: new Date(now.getTime() + 5 * DAY) }, now);
  await sendMapPlan(repo, teacher, { grade: 4, classId, codes: ["G4.U1.TS1.ACS"], source: "CURRICULUM" }, now);
  await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS1.ACS", mode: "ADAPTIVE", source: "CURRICULUM" }, now);
  await assignQuestions(repo, teacher, { classId, questionIds: await qs("summarize", 4), title: "Summarize practice", source: "CURRICULUM" }, now);
  const mapQs = (await Promise.all(["theme", "character", "inference", "plot-events", "sequence", "point-of-view", "make-predictions", "imagery", "poetry-elements", "drama-elements"].map((c) => qs(c, 2)))).flat();
  const mp = await assignQuestions(repo, teacher, { classId, studentIds: [ids[0]], questionIds: mapQs, title: "MAP plan · Literary Text", exactTitle: true, track: "MAP", adaptive: { maxQuestions: 15 }, source: "MAP" }, now);
  await repo.create("MapPlan", { schoolId, classId, studentId: ids[0], subject: "READING", term: "Fall 2026", status: "SENT", items: [{ group: "LIT", rit: 200, low: 195, high: 205, status: "FOCUS", skillIds: [g4.get("inference")], count: 15 }], assignmentIds: [mp.assignmentId], createdById: teacher.userId, createdAt: now, updatedAt: now, sentAt: now });
  await assignQuestions(repo, teacher, { classId, questionIds: [...mapQs, ...(await qs("cause-effect")), ...(await qs("description"))], title: "MAP group · Literary Text", exactTitle: true, track: "MAP", adaptive: { maxQuestions: 15 }, source: "MAP" }, now);
  const commas = (await assignSkill(repo, teacher, { classId, skillId: g4.get("commas")!, source: "GRAMMAR" }, now)).assignmentId;
  await cancelAssignment(repo, teacher, "SKILL", commas, ids[1], now);
  const unit = await repo.create("Assignment", { classId, createdById: tid, title: "Unit 1", target: "UNIT", unitId: null, source: "CURRICULUM", createdAt: now });
  await link(unit.id, ids);
  // ❌ hers, but never an assigned skill: a Weekly Check, a review check, a withdrawn plan's place, a cancelled skill
  const wk = await repo.create("Assignment", { classId, createdById: tid, title: "Weekly Check · 2026-W42", target: "ASSESSMENT", skillId: g4.get("adjectives"), curriculumPlanId: "WEEKLY_CHECK", note: "Weekly Check", source: "MAP", createdAt: now });
  await link(wk.id, ids);
  const rc = await repo.create("Assignment", { classId, createdById: tid, title: "Review check: Adverbs", target: "SKILL", skillId: g4.get("adverbs"), source: "CURRICULUM", createdAt: now });
  await link(rc.id, ids);
  const withdrawn = await repo.create("SkillPlan", { schoolId, classId, title: "Old plan", kind: "PLACES", gradeLevel: 4, status: "WITHDRAWN", createdById: teacher.userId, createdAt: now });
  const wp = await repo.create("Assignment", { classId, createdById: tid, title: "Nouns", target: "SKILL", skillId: g4.get("nouns"), curriculumPlanId: withdrawn.id, source: "CURRICULUM", createdAt: now });
  await link(wp.id, ids);
  await repo.create("SkillPlanItem", { planId: withdrawn.id, code: "G4.NOUNS", label: "Nouns", assignmentIds: [wp.id], order: 0 });
  const cancelled = (await assignSkill(repo, teacher, { classId, skillId: g4.get("cause-effect")!, source: "RTI" }, now)).assignmentId;
  await cancelAssignment(repo, teacher, "SKILL", cancelled, null, now);

  // ❌ not hers: the co-teacher's skill and a 20-skill set; last year's teacher's skill
  await assignSkill(repo, co.actor, { classId, skillId: g4.get("capitalization")!, source: "GRAMMAR" }, now);
  const twenty = (await Promise.all(["adjectives", "adverbs", "nouns", "verbs", "pronouns", "prepositions", "spelling", "sentences", "suffixes", "prefixes", "idioms-adages", "connotation", "multiple-meaning", "synonyms-antonyms", "greek-latin-roots", "homographs-homophones", "plural-nouns", "possessive-nouns", "verb-tenses", "negatives"].map((c) => qs(c, 1)))).flat();
  await assignQuestions(repo, co.actor, { classId, questionIds: twenty, title: "Grammar & vocabulary mix", source: "GRAMMAR" }, now);
  const ly = await repo.create("Assignment", { classId, createdById: old.tid, title: "Point of view", target: "SKILL", skillId: g4.get("point-of-view"), skillIds: [g4.get("point-of-view")], source: "CURRICULUM", createdAt: new Date(now.getTime() - 300 * DAY) });
  await link(ly.id, ids);

  // ❌ practised but never assigned: answers + a ◐ star on figurative language
  const fig = g4.get("figurative-language")!;
  const sess = await repo.create("PracticeSession", { studentId: ids[0], mode: "ADAPTIVE_PRACTICE", skillId: fig, startedAt: now, questionCount: 3, correctCount: 2 });
  for (const q of await qs("figurative-language", 3)) await repo.create("QuestionAttempt", { studentId: ids[0], sessionId: sess.id, questionId: q, skillId: fig, response: {}, isCorrect: true, responseMs: 9000, rapidGuess: false, difficultyB: 0, createdAt: now });
  await repo.create("SkillStatus", { studentId: ids[0], skillKey: "fam:figurative-language", level: 1, status: "IN_PROGRESS", skillId: fig, answered: 3, correct: 2, score: 40, startedAt: now, updatedAt: now });

  return {
    repo, teacher, admin, coTeacher: co.actor, schoolId, classId, ids, tid, g4, now,
    mine: { SKILL: ["fam:commas", "fam:compare-contrast", "fam:inference", "fam:reread", "fam:summarize", "fam:text-features", "fam:theme"], PLAN: ["fam:compare-contrast", "fam:reread", "fam:text-features"] },
    others: ["fam:capitalization", "fam:point-of-view"],
    mixedSkills: MIXED.map((c) => `fam:${c}`),
    commas, cancelled,
  };
}
