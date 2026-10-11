/**
 * Update 39C — reports + Curriculum-Map skills (FAKE data only: the demo school + the Test School).
 *   each new report's numbers recomputed from the raw rows (grammar, live games, RTI weekly plan, Below/On/Above,
 *   ReadMaster, ReadRise export)
 *   access isolation for each new page loader and export: another teacher, a student, another school's admin
 *   the Curriculum-Map remap: real skills from the map place, answers moved, mastery recomputed, idempotent,
 *   unmappable questions stay hidden, no question deleted
 *   small items: ReadMaster per-question time (rapid guesses), levels lacking items, one reading-level label
 */
import { before, describe, test } from "node:test";
import { afterResponseSettled } from "../src/server/lib/after-response";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { unclassifiedSkillId, setQuestionMapNode } from "../src/server/curriculum-map/questions";
import { applyRemap, decideSkill, placePhrases, planRemap, skillForPhrase, type GradeSkill } from "../src/server/curriculum-map/remap-skills";
import { classGrammarReport, schoolGrammarReport, studentGrammarReport, RETEACH_PCT } from "../src/server/reports/grammar-report";
import { classGamesReport } from "../src/server/reports/games-report";
import { decideWeek, rtiWeeklyPlan, weekBounds } from "../src/server/tiers/weekly-plan";
import { levelAt, schoolLevels } from "../src/server/reports/level-distribution";
import { classReadMasterReport, studentReadMasterReport } from "../src/server/reports/readmaster-report";
import { classReport as readRiseClass } from "../src/server/readrise/dashboards";
import { exportReport, parseReportRequest, type ReportDeps } from "../src/server/reports/service";
import { reportHref } from "../src/reports/links";
import { addVersionQuestion, cleanTiming, saveArticle, saveVersion, setArticleStatus, submitArticle } from "../src/server/readmaster/service";
import { levelGaps, MIN_PER_LEVEL } from "../src/server/map/bank-gaps";
import { READING_SCALE_NAME } from "../src/components/reading-level";
import { chanceAtLeast, MISCONCEPTION_MAX_P } from "../src/server/insights/misconception-tags";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const ROOT = process.cwd();
const NOW = new Date(Date.UTC(2026, 9, 14, 9));
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);
const s = (v: unknown) => String(v ?? "");
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : null);

describe("Update 39C · pure rules", () => {
  test("map place phrases: focus skill first (G4–5), lesson order (G6); aliases name the literacy skill", () => {
    assert.deepEqual(placePhrases("Reread / Diagrams and Headings \\ Compare and Contrast"), ["Compare and Contrast", "Diagrams and Headings", "Reread"]);
    assert.deepEqual(placePhrases("Determine Theme \\ Text Evidence"), ["Determine Theme", "Text Evidence"]);
    const sk = (family: string, category: string, name = family): GradeSkill => ({ id: family, name, family, category });
    const skills = [sk("compare-contrast", "INFORMATIONAL", "Text Structure: Compare and Contrast"), sk("theme", "LITERATURE"), sk("multiple-meaning", "VOCABULARY", "Multiple-Meaning Words"), sk("idioms-adages", "VOCABULARY", "Idioms, Adages and Proverbs"), sk("text-evidence", "COMPREHENSION", "Cite Text Evidence"), sk("context-clues", "VOCABULARY", "Context Clues"), sk("figurative-language", "VOCABULARY", "Figurative Language")];
    assert.equal(skillForPhrase("Compare and Contrast", skills, "ANALYZE_CRAFT_AND_STRUCTURE")?.skill.family, "compare-contrast");
    assert.equal(skillForPhrase("Proverbs and Adages", skills, "CONCEPT_VOCABULARY")?.skill.family, "idioms-adages");
    assert.equal(skillForPhrase("Similes and Metaphors", skills, "CONCEPT_VOCABULARY")?.skill.family, "figurative-language");
    assert.equal(skillForPhrase("Determine Theme", skills, null)?.skill.family, "theme");
    assert.equal(decideSkill({ stem: "x", standardCandidates: [], category: "RESPOND_TO_READING", skillsText: null }, skills)?.via, "CATEGORY");
    assert.equal(decideSkill({ stem: "What does the word bright mean in sentence 2?", standardCandidates: [], category: "CONCEPT_VOCABULARY", skillsText: null }, skills)?.skill.family, "context-clues");
    assert.equal(decideSkill({ stem: "TEST question about rain?", standardCandidates: [], category: null, skillsText: null }, skills), null, "no cue: never guessed");
  });

  test("RTI decisions: two strong → exit, two low → intensify, invalid → re-test, none → check, refer wins in Tier 3", () => {
    const c = (signal: "STRONG" | "LOW" | "VERY_LOW" | "OK" | "INVALID", items = 8) => ({ date: "2026-10-01", kind: "WEEKLY" as const, pct: 50, items, theta: null, se: null, signal });
    assert.equal(decideWeek(2, [c("STRONG"), c("STRONG")], { refer: false, overdue: false }), "EXIT");
    assert.equal(decideWeek(2, [c("LOW"), c("VERY_LOW")], { refer: false, overdue: false }), "INTENSIFY");
    assert.equal(decideWeek(2, [c("OK"), c("INVALID")], { refer: false, overdue: false }), "RETEST");
    assert.equal(decideWeek(3, [], { refer: false, overdue: false }), "CHECK");
    assert.equal(decideWeek(3, [c("LOW"), c("LOW")], { refer: true, overdue: false }), "REFER");
    assert.equal(decideWeek(2, [c("OK"), c("STRONG")], { refer: false, overdue: false }), "STAY");
    assert.equal(decideWeek(2, [c("VERY_LOW", 12)], { refer: false, overdue: false }), "INTENSIFY", "one long very-low check");
    assert.equal(weekBounds(NOW).start.toISOString().slice(0, 10), "2026-10-12", "the week starts on Monday");
  });

  test("level a month ago: from the history, else the current level when it was set then, else not evaluated", () => {
    const at = 100;
    assert.equal(levelAt([], { level: "ON", since: 50 }, at), "ON");
    assert.equal(levelAt([], { level: "ON", since: 150 }, at), null);
    assert.equal(levelAt([{ at: 120, level: "ON", from: "BELOW" }], { level: "ON", since: 120 }, at), "BELOW");
    assert.equal(levelAt([{ at: 80, level: "ABOVE", from: "ON" }, { at: 120, level: "ON", from: "ABOVE" }], null, at), "ABOVE");
  });

  test("misconceptions: chance alone must rarely explain the picks (exact tail, ≤ 1 %)", () => {
    assert.equal(chanceAtLeast([0.5, 0.5, 0.5, 0.5], 3), 5 / 16, "3 of 4 picks of one of two distractors: a third of the time by chance");
    assert.ok(chanceAtLeast([0.5, 0.5, 0.5, 0.5], 3) > MISCONCEPTION_MAX_P);
    assert.ok(chanceAtLeast(Array(5).fill(1 / 3), 5) < MISCONCEPTION_MAX_P, "always the same of three distractors: real");
    assert.equal(chanceAtLeast([0.2], 0), 1);
    assert.equal(chanceAtLeast([0.5, 0.5], 3), 0);
  });

  test("ReadMaster timing input is cleaned (untrusted numbers, capped)", () => {
    const t = cleanTiming({ elapsedMs: 125_000, perQuestion: { a: 900, b: "x", c: 99 * 60_000, d: -5 } }, ["a", "b", "c", "d"]);
    assert.equal(t.seconds, 125);
    assert.deepEqual([...t.perQuestion.entries()], [["a", 900], ["c", 30 * 60_000]]);
    assert.equal(cleanTiming(null, ["a"]).seconds, null);
  });

  test("one reading-level label: ReadRise is never called a Lexile; exports name it ReadRise Level (estimate)", () => {
    assert.equal(READING_SCALE_NAME.READRISE, "ReadRise Level (estimate)");
    assert.doesNotMatch(READING_SCALE_NAME.READRISE, /Lexile/);
    assert.equal(READING_SCALE_NAME.READMASTER, "ReadMaster reading Lexile", "ReadMaster keeps its own name");
    const src = readFileSync(join(ROOT, "src/server/reports/builders-extra.ts"), "utf8");
    for (const m of src.matchAll(/col\("[a-zA-Z]+", "([^"]*ReadRise[^"]*)"/g)) assert.doesNotMatch(m[1], /Lexile/, m[1]);
  });
});

describe("Update 39C · reports, exports and the remap (Test School)", () => {
  let repo: SqliteRepo, admin: Actor, t1: Actor, t2: Actor, student: Actor, oadmin: Actor, oteacher: Actor;
  let schoolId = "", classA = "", gradeA = 0, studentsA: string[] = [], deps: ReportDeps;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  let sessionN = 0;
  async function att(studentId: string, skillId: string, questionId: string, isCorrect: boolean, o: { rapid?: boolean; mis?: string | null; at?: Date; source?: string | null } = {}) {
    const sess = await repo.create("PracticeSession", { studentId, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: o.at ?? ago(2) });
    sessionN++;
    await repo.create("QuestionAttempt", { sessionId: sess.id, studentId, questionId, skillId, response: { value: "A" }, isCorrect, responseMs: o.rapid ? 900 : 25_000, rapidGuess: Boolean(o.rapid), difficultyB: 0, misconception: isCorrect ? null : (o.mis ?? null), source: o.source ?? null, createdAt: o.at ?? ago(2) });
  }
  const gradeSkill = async (level: number, where: (k: Record<string, unknown>) => boolean) => {
    const g = (await repo.findMany("Grade", { schoolId, level }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    return (await repo.findMany("Skill", { curriculumId: cur.id })).filter(where);
  };
  const exp = (a: Actor, q: Record<string, string>) => exportReport(deps, a, parseReportRequest(new URLSearchParams({ format: "csv", ...q })));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    schoolId = String(admin.schoolId);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId });
    t1 = await actorFor("test.teacher.1"); t2 = await actorFor("test.teacher.2");
    const c = (await readableClasses(repo, t1))[0];
    classA = String(c.id); gradeA = Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level);
    assert.ok(!(await readableClasses(repo, t2)).some((k) => k.id === classA), "teacher 2 does not teach class A");
    studentsA = (await repo.findMany("ClassMembership", { classId: classA, leftAt: null })).map((m) => String(m.studentId)).sort();
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentsA[0] }))!.userId }))!);
    oadmin = await actorFor("demo.admin"); oteacher = await actorFor("demo.teacher.4a");
    deps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "b39c-")), now: () => NOW };
  });

  test("grammar results: every number recomputed from the raw answers and mastery rows; export = page", async () => {
    const skills = await gradeSkill(gradeA, (k) => s(k.category) === "GRAMMAR" && k.isActive !== false && !s(k.code).includes(".grammar."));
    const [g1, g2] = skills;
    const q1 = (await repo.findMany("Question", { skillId: g1.id }))[0], q2 = (await repo.findMany("Question", { skillId: g2.id }))[0];
    const [a, b, c] = studentsA;
    // a: 5 careful (1 right) + 2 rapid on g1 → reteach; b: 5/5 on g1 (mastery 85); c: 2 careful on g2 (too few to judge)
    // + one 40-day-old answer (outside 30 days); d: 5 careful, 3 right (60%) with mastery 30 → reteach (under 70 with low mastery)
    for (const ok of [true, false, false, false, false]) await att(a, s(g1.id), s(q1.id), ok, { mis: "VERB_FORM" });
    for (const _ of [1, 2]) await att(a, s(g1.id), s(q1.id), true, { rapid: true });
    for (const _ of [1, 2, 3, 4, 5]) await att(b, s(g1.id), s(q1.id), true);
    await att(c, s(g2.id), s(q2.id), false, { mis: "AGREEMENT" }); await att(c, s(g2.id), s(q2.id), true);
    await att(c, s(g2.id), s(q2.id), false, { at: ago(40), mis: "AGREEMENT" });
    const d = studentsA[3];
    for (const ok of [true, true, true, false, false]) await att(d, s(g2.id), s(q2.id), ok);
    for (const [st, sk, score] of [[a, g1.id, 30], [b, g1.id, 85], [c, g2.id, 55], [d, g2.id, 30]] as const) await repo.create("StudentSkillMastery", { studentId: st, skillId: sk, score, band: score >= 80 ? "PROFICIENT" : "DEVELOPING", attempts: 1, correct: 1 });
    const r = await classGrammarReport(repo, t1, classA, { days: 30, now: NOW });
    // raw recomputation
    const ids = (await repo.findMany("Skill", { id: { in: skills.map((k) => k.id) } })).map((k) => s(k.id));
    const raw = (await repo.findMany("QuestionAttempt", { studentId: { in: studentsA }, skillId: { in: ids } })).filter((x) => new Date(s(x.createdAt instanceof Date ? x.createdAt.toISOString() : x.createdAt)).getTime() >= ago(30).getTime());
    const careful = raw.filter((x) => !x.rapidGuess);
    assert.equal(r.summary.answers, raw.length);
    assert.equal(r.summary.rapid, raw.length - careful.length);
    assert.equal(r.summary.accuracy, pct(careful.filter((x) => x.isCorrect).length, careful.length));
    const ra = r.students.find((x) => x.studentId === a)!;
    assert.equal(ra.answers, 7); assert.equal(ra.accuracy, 20); assert.equal(ra.reteach, 1);
    assert.equal(r.cells[d][s(g2.id)].reteach, true, "60% while mastery is under 40");
    assert.equal(r.cells[a][s(g1.id)].rapid, 2);
    assert.equal(r.cells[b][s(g1.id)].reteach, false);
    assert.equal(r.cells[c][s(g2.id)].reteach, false, "2 careful answers: too few to judge");
    const row1 = r.skills.find((k) => k.skillId === s(g1.id))!;
    assert.deepEqual(row1.reteach, [a]);
    assert.equal(row1.avgMastery, Math.round((30 + 85) / 2));
    assert.equal(row1.topError?.code, "VERB_FORM");
    assert.ok(r.reteach.some((x) => x.skillId === s(g1.id) && x.move), "1 of 2 practising students (50%) needs reteach: recommended, with a teaching move");
    assert.equal(RETEACH_PCT, 60);
    assert.equal(r.errors.find((e) => e.code === "AGREEMENT")?.count, 1, "the 40-day-old answer is outside the window");
    const st = await studentGrammarReport(repo, t1, a, { days: 30, now: NOW });
    assert.equal(st.summary.answers, 7); assert.equal(st.summary.rapid, 2); assert.equal(st.skills[0].skillId, s(g1.id));
    const school = await schoolGrammarReport(repo, admin, { days: 30, now: NOW });
    assert.equal(school.find((x) => x.classId === classA)?.answers, r.summary.answers, "school view = class report");
    const file = await exp(t1, { kind: "grammar", classId: classA, days: "30" });
    const csv = Buffer.from(file.bytes).toString("utf8");
    const nameA = (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: a }))!.userId }))!.displayName;
    assert.ok(csv.split("\n").some((l) => l.includes(String(nameA)) && /,7,20,30,1,1,/.test(l)), String(csv.split("\n").find((l) => l.includes(String(nameA)))));
  });

  test("live games: participation, accuracy without rapid guesses, rapid %, by skill and most missed — from the raw rows", async () => {
    const skill = (await gradeSkill(gradeA, (k) => s(k.category) === "VOCABULARY"))[0];
    const qs = (await repo.findMany("Question", { skillId: skill.id })).slice(0, 2);
    const g = await repo.create("LiveGame", { schoolId, classId: classA, hostId: t1.userId, code: "391234", title: "TEST game", questionIds: qs.map((q) => s(q.id)), status: "FINISHED", currentIndex: 1, secondsPerQuestion: 20, createdAt: ago(3) });
    const [a, b, c] = studentsA;
    const players = [];
    for (const [i, st] of [a, b, c].entries()) players.push(await repo.create("LiveGamePlayer", { gameId: g.id, studentId: st, nickname: `P${i}`, score: 100 * i, joinedAt: ago(3) }));
    // a: 2 careful right; b: 1 right + 1 rapid (500 ms) wrong "B"; c: 2 careful wrong "C"
    const ans = [[0, 0, true, 8000, "A"], [0, 1, true, 9000, "A"], [1, 0, true, 7000, "A"], [1, 1, false, 500, "B"], [2, 0, false, 6000, "C"], [2, 1, false, 6000, "C"]] as const;
    for (const [p, qi, ok, ms, ch] of ans) await repo.create("LiveGameAnswer", { gameId: g.id, playerId: players[p].id, questionIndex: qi, choice: ch, correct: ok, points: ok ? 100 : 0, ms, createdAt: ago(3) });
    const r = await classGamesReport(repo, t1, classA, { days: 30, now: NOW });
    assert.equal(r.summary.games, 1);
    assert.equal(r.summary.joined, 3);
    assert.equal(r.summary.participation, pct(3, studentsA.length));
    assert.equal(r.summary.answers, 6);
    assert.equal(r.summary.rapidPct, pct(1, 6));
    assert.equal(r.summary.accuracy, pct(3, 5), "3 right of 5 careful answers");
    assert.equal(r.students.find((x) => x.studentId === b)?.rapidPct, 50);
    assert.equal(r.skills[0].answers, 6);
    assert.equal(r.missed[0].questionId, s(qs[1].id), "question 2: 1 right of 3 careful");
    assert.match(String(r.missed[0].commonWrong), /^C/);
    const csv = Buffer.from((await exp(t1, { kind: "games", classId: classA, days: "30" })).bytes).toString("utf8");
    assert.match(csv.split("\n")[0], /Student,Games,Answers,Accuracy/);
  });

  test("RTI weekly plan: groups by tier and focus skill, the lesson, the checks and the decisions", async () => {
    const focus = (await gradeSkill(gradeA, (k) => s(k.code).endsWith(".theme")))[0];
    const [x, y, z] = studentsA.slice(5, 8);
    for (const [st, tier, f] of [[x, 2, focus.id], [y, 2, focus.id], [z, 3, null]] as const) await repo.upsert("StudentTier", { studentId: st }, { schoolId, tier, source: "AUTO", reason: "TEST reason", focusSkillId: f, since: ago(20), reviewAt: ago(-2), monitorEveryDays: tier === 3 ? 7 : 14 });
    for (const [st, pcts] of [[x, [90, 88]], [y, [30, 25]]] as const) for (const [i, p] of pcts.entries()) await repo.create("WeeklyCheck", { studentId: st, week: `2026-09-${10 + i * 7}`, assignmentId: `a-${st}-${i}`, correct: Math.round((p / 100) * 8), total: 8, completedAt: ago(14 - i * 7) });
    const p = await rtiWeeklyPlan(repo, t1, classA, NOW);
    const raw = await repo.findMany("StudentTier", { studentId: { in: studentsA } });
    assert.equal(p.counts.tier2, raw.filter((r) => Number(r.tier) === 2).length);
    assert.equal(p.counts.tier3, raw.filter((r) => Number(r.tier) === 3).length);
    const g2 = p.groups.find((g) => g.tier === 2 && g.focusSkillId === s(focus.id))!;
    assert.deepEqual(g2.students.map((st) => st.studentId).sort(), [x, y].sort());
    assert.ok(g2.lesson && /lessons\?class=/.test(g2.lesson.href), "Theme has an intervention lesson");
    assert.match(g2.minutes, /3 sessions × 30 min/);
    assert.equal(g2.students.find((st) => st.studentId === x)!.decision, "EXIT");
    assert.equal(g2.students.find((st) => st.studentId === y)!.decision, "INTENSIFY");
    assert.equal(g2.students.find((st) => st.studentId === x)!.checkThisWeek, true, "review date in 2 days");
    const g3 = p.groups.find((g) => g.tier === 3)!;
    assert.equal(g3.students[0].decision, "CHECK");
    assert.equal(g3.lesson, null); assert.match(String(g3.fallback), /no focus skill/i);
    const csv = Buffer.from((await exp(t1, { kind: "rti", classId: classA })).bytes).toString("utf8");
    assert.ok(csv.includes("Exit candidate") && csv.includes("Intensify"), csv.slice(0, 400));
  });

  test("Below/On/Above: counts and the change since last month from the raw state and history rows; tiers; strands", async () => {
    const [p, q, r3] = studentsA.slice(10, 13);
    await repo.create("StudentLevelState", { studentId: p, schoolId, level: "BELOW", source: "PLATFORM", reason: "x", since: ago(60), evaluatedAt: ago(1) });
    await repo.create("StudentLevelState", { studentId: q, schoolId, level: "ON", source: "PLATFORM", reason: "x", since: ago(5), evaluatedAt: ago(1) });
    await repo.create("AuditLog", { actorId: null, action: "level.change", entityType: "Student", entityId: q, before: null, after: { level: "BELOW", category: "OVERALL" }, createdAt: ago(50) });
    await repo.create("AuditLog", { actorId: null, action: "level.change", entityType: "Student", entityId: q, before: { level: "BELOW" }, after: { level: "ON", category: "OVERALL" }, createdAt: ago(5) });
    await repo.create("StudentLevelState", { studentId: r3, schoolId, level: "ABOVE", source: "PLATFORM", reason: "x", since: ago(3), evaluatedAt: ago(1) });
    await repo.create("AuditLog", { actorId: null, action: "level.change", entityType: "Student", entityId: r3, before: null, after: { level: "ABOVE", category: "OVERALL" }, createdAt: ago(3) });
    await repo.create("StudentCategoryLevel", { studentId: p, category: "CV", level: "BELOW", source: "SET", updatedAt: ago(40) });
    await repo.create("AuditLog", { actorId: null, action: "level.change", entityType: "Student", entityId: p, before: null, after: { level: "BELOW", category: "CV" }, createdAt: ago(40) });
    const L = await schoolLevels(repo, admin, NOW);
    const members = new Set((await repo.findMany("ClassMembership", { leftAt: null })).map((m) => s(m.studentId)));
    const states = (await repo.findMany("StudentLevelState", { schoolId })).filter((x) => members.has(s(x.studentId)));
    assert.equal(L.overall.now.below, states.filter((x) => x.level === "BELOW").length);
    assert.equal(L.overall.now.on, states.filter((x) => x.level === "ON").length);
    assert.equal(L.overall.now.above, states.filter((x) => x.level === "ABOVE").length);
    const cls = L.classes.find((c) => c.classId === classA)!;
    assert.equal(cls.now.total, studentsA.length);
    assert.deepEqual([cls.before.below, cls.before.on, cls.before.above], [2, 0, 0], "p was Below, q was Below a month ago; r3 was not evaluated");
    assert.deepEqual(cls.change, { below: -1, on: 1, above: 1 });
    const tiers = await repo.findMany("StudentTier", { studentId: { in: studentsA } });
    assert.equal(cls.tiers.tier2, tiers.filter((t) => Number(t.tier) === 2).length);
    const cv = L.strands.find((x) => x.code === "CV" && x.grade === null)!;
    assert.equal(cv.now.below, 1); assert.equal(cv.before.below, 1);
    const csv = Buffer.from((await exp(admin, { kind: "levels" })).bytes).toString("utf8");
    const cname = String((await repo.findUnique("Class", { id: classA }))!.name);
    assert.ok(csv.split("\n").some((l) => l.startsWith(`${cname},`)), csv.slice(0, 300));
  });

  test("ReadMaster: per-question times are stored and rapid answers counted; the class and student reports match the rows", async () => {
    const skill = (await gradeSkill(gradeA, (k) => s(k.code).endsWith(".central-idea")))[0];
    const aid = await saveArticle(repo, admin, { title: "TEST article", grade: gradeA, skillId: s(skill.id) }, NOW);
    const vers: string[] = [];
    for (const lv of ["BELOW", "ON", "ABOVE"] as const) vers.push(await saveVersion(repo, admin, aid, lv, { lexile: lv === "BELOW" ? 600 : lv === "ON" ? 800 : 1000, body: "TEST body. ".repeat(40) }));
    for (const v of vers) for (const n of [1, 2, 3, 4]) await addVersionQuestion(repo, admin, v, { stem: `TEST question ${n}: what is the central idea?`, options: [{ label: "A", text: "The right one", correct: true }, { label: "B", text: "A detail", correct: false, rationale: "Only a detail." }], whyCorrect: "It covers the whole text." });
    await setArticleStatus(repo, admin, aid, "PUBLISHED");
    const sid = studentsA[15];
    const stActor = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const { openArticle } = await import("../src/server/readmaster/service");
    const open = await openArticle(repo, stActor, aid);
    const responses = Object.fromEntries(open.questions.map((q, i) => [q.questionId, i < 3 ? "A" : "B"]));
    const per = Object.fromEntries(open.questions.map((q, i) => [q.questionId, i === 0 ? 120_000 : 800]));   // 3 answers in under a second
    const res = await submitArticle(repo, stActor, aid, open.versionId, responses, ago(1), { elapsedMs: 150_000, perQuestion: per });
    assert.equal(res.correct, 3);
    const row = (await repo.findMany("ReadMasterAttempt", { studentId: sid }))[0];
    assert.equal(Number(row.seconds), 150); assert.equal(Number(row.rapid), 3);
    await afterResponseSettled(); // the article's answers feed the skills after the response (Update 42B)
    const engine = await repo.findMany("QuestionAttempt", { studentId: sid, source: "READMASTER" });
    assert.equal(engine.filter((x) => x.rapidGuess).length, 3, "rapid detection now applies to ReadMaster answers");
    const r = await classReadMasterReport(repo, t1, classA, { days: 90, now: NOW });
    const mine = r.students.find((x) => x.studentId === sid)!;
    assert.equal(mine.articles, 1); assert.equal(mine.accuracy, 75); assert.equal(mine.minutes, Math.round(150 / 60)); assert.equal(mine.rapid, 3);
    assert.equal(mine.lexileStart, Number(row.lexileBefore)); assert.equal(mine.lexileNow, Number((await repo.findUnique("StudentReadingLexile", { studentId: sid }))!.lexile));
    assert.equal(r.types[0].answers, engine.length); assert.equal(r.types[0].rapid, 3);
    assert.equal(r.types[0].accuracy, pct(engine.filter((x) => !x.rapidGuess && x.isCorrect).length, engine.filter((x) => !x.rapidGuess).length));
    const one = await studentReadMasterReport(repo, t1, sid, { now: NOW });
    assert.equal(one.articles.length, 1); assert.equal(one.articles[0].correct, 3);
    const csv = Buffer.from((await exp(t1, { kind: "readmaster", classId: classA, days: "90" })).bytes).toString("utf8");
    assert.match(csv.split("\n")[0], /Reading Lexile start/);
  });

  test("ReadRise export: start / now / growth, readings, first-try accuracy and goals — never called a Lexile", async () => {
    const [a, b] = studentsA.slice(20, 22);
    for (const [st, start, lvl] of [[a, 700, 760], [b, 800, 780]] as const) await repo.create("RRStudent", { studentId: st, schoolId, level: lvl, startLevel: start, source: "PLACEMENT", placedAt: ago(30), articlesDone: 2, weeklyGoal: 2 });
    const art = (await repo.findMany("RRArticle", {}))[0];
    for (const [i, sc] of [80, 60].entries()) await repo.create("RRRun", { studentId: a, schoolId, articleId: art ? art.id : `art-${i}`, versionLevel: 700, band: "ON", step: "DONE", score: sc, levelBefore: 700, levelAfter: 700, firstTry: i === 0, startedAt: ago(5 - i), completedAt: ago(5 - i) });
    const r = await readRiseClass(repo, t1, classA, NOW);
    const ra = r.students.find((x) => x.studentId === a)!;
    assert.equal(ra.growth, 60); assert.equal(ra.runs, 2); assert.equal(ra.firstTryAvg, 80);
    const csv = Buffer.from((await exp(t1, { kind: "readrise", classId: classA })).bytes).toString("utf8");
    const head = csv.split("\n")[0];
    assert.match(head, /ReadRise Level start \(estimate\)/);
    assert.doesNotMatch(head, /Lexile/);
    const nm = String((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: a }))!.userId }))!.displayName);
    const line = csv.split("\n").find((l) => l.includes(nm))!;
    assert.match(line, /,700,760,60,2,/);
    const school = Buffer.from((await exp(admin, { kind: "readrise", scope: "school" })).bytes).toString("utf8");
    assert.match(school.split("\n")[0], /Median ReadRise Level \(estimate\)/);
    const x = await exp(t1, { kind: "readrise", classId: classA, format: "xlsx" });
    assert.ok(x.bytes.length > 1000 && x.filename.endsWith(".xlsx"));
  });

  test("access isolation: another teacher, a student and another school's staff are refused on every new page loader and export", async () => {
    const sA = studentsA[0];
    const pages: [string, (a: Actor) => Promise<unknown>][] = [
      ["grammar class", (a) => classGrammarReport(repo, a, classA, { now: NOW })],
      ["grammar student", (a) => studentGrammarReport(repo, a, sA, { now: NOW })],
      ["games", (a) => classGamesReport(repo, a, classA, { now: NOW })],
      ["rti", (a) => rtiWeeklyPlan(repo, a, classA, NOW)],
      ["readmaster class", (a) => classReadMasterReport(repo, a, classA, { now: NOW })],
      ["readmaster student", (a) => studentReadMasterReport(repo, a, sA, { now: NOW })],
      ["readrise class", (a) => readRiseClass(repo, a, classA, NOW)],
    ];
    for (const [name, f] of pages) for (const a of [t2, student, oteacher, oadmin]) await assert.rejects(f(a) as Promise<unknown>, ForbiddenError, `${name} for ${a.role} ${a.userId}`);
    for (const [name, f] of pages) await f(t1).then(() => f(admin)).catch((e) => assert.fail(`${name}: ${String(e)}`));
    // school views: analytics:school only, and only the admin's own school
    for (const a of [t1, student]) { await assert.rejects(schoolLevels(repo, a, NOW), ForbiddenError); await assert.rejects(schoolGrammarReport(repo, a, { now: NOW }), ForbiddenError); }
    const other = await schoolLevels(repo, oadmin, NOW);
    assert.ok(!other.classes.some((c) => c.classId === classA), "another school's admin sees none of the Test School");
    // exports: same rules (a refusal looks like not found)
    const ok = [{ kind: "grammar", classId: classA }, { kind: "games", classId: classA }, { kind: "rti", classId: classA }, { kind: "readmaster", classId: classA }, { kind: "readrise", classId: classA }];
    for (const q of ok) for (const a of [t2, student, oteacher, oadmin]) await assert.rejects(exp(a, q), ForbiddenError, `${q.kind} export for ${a.role}`);
    for (const q of [{ kind: "levels" }, { kind: "grammar", scope: "school" }, { kind: "readrise", scope: "school" }] as Record<string, string>[]) for (const a of [t1, student]) await assert.rejects(exp(a, q), ForbiddenError, `${q.kind} school export for ${a.role}`);
    // the links the pages build parse back to the same request
    assert.equal(parseReportRequest(new URL(`http://x${reportHref({ kind: "grammar", classId: classA, days: 90, format: "pdf", locale: "en" })}`).searchParams).days, 90);
    // every new page checks the role in its own body (students and parents are sent home)
    for (const f of ["src/app/teacher/reports/grammar/page.tsx", "src/app/teacher/reports/grammar/[studentId]/page.tsx", "src/app/teacher/reports/games/page.tsx", "src/app/teacher/rti-plan/page.tsx", "src/app/teacher/reports/readmaster/page.tsx", "src/app/teacher/reports/readmaster/[studentId]/page.tsx", "src/app/admin/levels/page.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      assert.match(src, /requireActor\(\{ roles: \[(?:"TEACHER", )?"SCHOOL_ADMIN", "SUPER_ADMIN"\]/, f);
      assert.doesNotMatch(src, /"STUDENT"|"PARENT"/, f);
    }
  });

  test("Curriculum-Map remap: real skills from the place, answers moved, mastery recomputed, idempotent, nothing deleted", async () => {
    const hidden = await unclassifiedSkillId(repo, schoolId, 4);
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const node = async (code: string) => (await repo.findMany("CurriculumMapNode", { gradeId: g4.id, code }))[0];
    const mc = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const mk = async (stem: string, code: string | null) => {
      const q = await repo.create("Question", { skillId: hidden, typeId: mc.id, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: ago(30), updatedAt: ago(30) });
      for (const [i, o] of ["A", "B"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Option ${o}`, isCorrect: i === 0, order: i });
      if (code) { const n = await node(code); assert.ok(n, code); await setQuestionMapNode(repo, s(q.id), s(n.id), null); }
      return s(q.id);
    };
    const qCV = await mk("TEST What does the word mean in sentence 1?", "G4.U1.TS1.CV");
    const qACS = await mk("TEST Why did the author use this structure?", "G4.U1.TS1.ACS.ON");
    const qRTR = await mk("TEST Write about the text.", "G4.U1.TS1.RTR.ON");
    const qNone = await mk("TEST question about rain?", null);
    const [s1, s2] = studentsA.slice(23, 25);
    for (const q of [qCV, qACS, qRTR]) { await att(s1, hidden, q, true); await att(s2, hidden, q, false); }
    await att(s1, hidden, qNone, true);
    await repo.create("StudentSkillMastery", { studentId: s2, skillId: hidden, score: 20, band: "BEGINNING", attempts: 3, correct: 0 });
    const questionsBefore = await repo.count("Question", {});
    const idsBefore = (await repo.findMany("Question", {}, { select: ["id"] })).map((q) => s(q.id)).sort();
    const plan = await planRemap(repo, schoolId);
    const byQ = new Map(plan.items.map((i) => [i.questionId, i]));
    const fam = async (id: string | null) => s((await repo.findUnique("Skill", { id: s(id) }))?.code).replace(/^G\d+\./, "");
    assert.equal(await fam(byQ.get(qCV)!.toSkillId), "multiple-meaning");
    assert.equal(await fam(byQ.get(qACS)!.toSkillId), "compare-contrast");
    assert.equal(byQ.get(qACS)!.via, "MAP_PLACE");
    assert.equal(await fam(byQ.get(qRTR)!.toSkillId), "text-evidence");
    assert.equal(byQ.get(qNone)!.toSkillId, null, "no place, no cue: stays hidden");
    const res = await applyRemap(repo, schoolId, { actorId: admin.userId, now: NOW });
    assert.ok(res.questions >= 3 && res.attempts >= 6, JSON.stringify(res));
    assert.equal(s((await repo.findUnique("Question", { id: qNone }))!.skillId), hidden);
    for (const q of [qCV, qACS, qRTR]) {
      const real = s((await repo.findUnique("Question", { id: q }))!.skillId);
      assert.notEqual(real, hidden);
      const moved = await repo.findMany("QuestionAttempt", { questionId: q });
      assert.ok(moved.length === 2 && moved.every((a) => s(a.skillId) === real), "past answers moved to the real skill");
      const m = (await repo.findUnique("StudentSkillMastery", { studentId: s2, skillId: real }))!;
      assert.ok(m, "mastery recomputed for the real skill");
      assert.equal(Number(m.attempts), await repo.count("QuestionAttempt", { studentId: s2, skillId: real }));
    }
    assert.equal(await repo.findUnique("StudentSkillMastery", { studentId: s2, skillId: hidden }), null, "no answer left on the hidden skill: its derived row is gone");
    assert.equal(Number((await repo.findUnique("StudentSkillMastery", { studentId: s1, skillId: hidden }))!.attempts), 1, "s1 keeps one hidden answer (unmappable question)");
    assert.equal((await repo.findMany("AuditLog", { action: "question.remap" })).filter((a) => [qCV, qACS, qRTR].includes(s(a.entityId))).length, 3);
    // idempotent; no question deleted
    const again = await applyRemap(repo, schoolId, { now: NOW });
    assert.deepEqual([again.questions, again.attempts, again.recomputed], [0, 0, 0]);
    assert.equal(await repo.count("Question", {}), questionsBefore);
    assert.deepEqual((await repo.findMany("Question", {}, { select: ["id"] })).map((q) => s(q.id)).sort(), idsBefore);
    // new answers now go to the real skill: the question set reads Question.skillId
    assert.notEqual(s((await repo.findUnique("Question", { id: qCV }))!.skillId), hidden);
  });

  test("question bank: levels lacking items are listed per skill (Below / On / Above)", async () => {
    const rows = await levelGaps(repo, admin);
    assert.ok(rows.length > 0);
    const r = rows[0];
    const qs = await repo.findMany("Question", { skillId: r.skillId, status: "PUBLISHED", deletedAt: null });
    const n = (f: (d: number) => boolean) => qs.filter((q) => f(Number(q.difficultyLevel))).length;
    assert.deepEqual([r.below, r.on, r.above], [n((d) => d <= 3), n((d) => d === 4), n((d) => d >= 5)]);
    assert.ok(r.missing.length > 0 && [r.below, r.on, r.above].some((v) => v < MIN_PER_LEVEL));
    assert.ok(!rows.some((x) => /Unclassified/.test(x.skill)));
  });
});
