import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS, chooseVersion, fitOf, measuredLevel, stretchAbove, versionFor } from "../src/server/readrise/level";
import { ensureRRStudent, type LevelPoint } from "../src/server/readrise/engine";
import {
  confidenceText, fillLine, gradePosition, growthConfidence, keyOf, projectionRange, scoreTrend, skillBreakdown, storyLines, stretchSuccess, strongerSkills, type AnswerKey,
} from "../src/server/readrise/growth";
import { classGrowth, levelJourney, myGrowthStory, studentGrowthReport } from "../src/server/readrise/growth-report";
import { cacheMeasuredLevels } from "../src/server/readrise/seed";
import { finishReading, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { hasLevelWords } from "../src/server/reports/family-words";
import { exportReport, parseReportRequest } from "../src/server/reports/service";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const SKILLS = ["central-idea", "central-idea", "inference", "inference", "vocabulary", "vocabulary", "detail", "detail"];

/** 12 versions (estLevel = level + offset), 8 questions per band (answer "A"; skills: 2 each of central idea, inference, vocabulary, detail). */
async function makeArticle(repo: SqliteRepo, code: string, offset = 0): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) {
    const body = `${code} at ${level}. ${"Bees make honey and the hive grows. ".repeat(4)}`;
    await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body, wordCount: 100, estLevel: level + offset });
  }
  for (const band of ["LOW", "MID", "HIGH"]) {
    for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `Q${n}?`, options: ["right", "w1", "w2", "w3"], answer: "A", skill: SKILLS[n - 1], rationale: { why: "because" } });
    await repo.create("RRPrompt", { articleId: id, band, prompt: "Explain.", checklist: ["Use evidence"], keyWords: [] });
  }
  return id;
}
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
async function read(repo: SqliteRepo, s: Actor, articleId: string, right: number, now: Date) {
  const v = await startRun(repo, s, articleId, {}, now);
  await submitPrePoll(repo, s, v.runId, 1, now);
  await finishReading(repo, s, v.runId, { readSeconds: 120 }, now);
  await submitActivity(repo, s, v.runId, answers(right), now);
  await submitWriting(repo, s, v.runId, WRITING, now);
  await submitPostPoll(repo, s, v.runId, 2, now);
  return v;
}

// ------------------------------------------------------------------ pure parts

describe("🚀 ReadRise growth evidence (pure)", () => {
  test("version fit and measured-level version choice", () => {
    assert.equal(measuredLevel({ level: 900, estLevel: 980 }), 980);
    assert.equal(measuredLevel({ level: 900, estLevel: 980, officialLexile: 910 }), 910, "an official measure wins");
    assert.equal(measuredLevel({ level: 900, estLevel: 0 }), 900, "no cached estimate → the nominal level");
    assert.deepEqual([fitOf(900, 880), fitOf(1000, 880), fitOf(780, 880), fitOf(955, 880), fitOf(805, 880)], ["EXACT", "STRETCH", "EASY", "EXACT", "EXACT"]);
    // when every text measures at its target, the choice is exactly the old rule
    const exact = RR_LEVELS.map((l) => ({ level: l, estLevel: l }));
    for (let lvl = 100; lvl <= 1500; lvl += 10) assert.equal(chooseVersion(lvl, exact), versionFor(lvl, [...RR_LEVELS]), `level ${lvl}`);
    // texts that read 120 harder: a student at 850 gets the 800 version (measures 920) instead of 900 (measures 1020)
    const hard = RR_LEVELS.map((l) => ({ level: l, estLevel: l + 120 }));
    assert.equal(chooseVersion(850, hard), 800);
    // texts that read 120 easier: the student at 850 gets 1000 (measures 880) instead of 900 (measures 780)
    assert.equal(chooseVersion(850, RR_LEVELS.map((l) => ({ level: l, estLevel: l - 120 }))), 1000);
    // never more than one version from the nominal pick, even with a wild estimate
    assert.equal(chooseVersion(850, RR_LEVELS.map((l) => ({ level: l, estLevel: l === 400 ? 850 : l + 400 }))), 800);
    assert.equal(stretchAbove(800, [...RR_LEVELS]), 900);
    assert.equal(stretchAbove(1400, [...RR_LEVELS]), null);
  });

  test("growth confidence counts the readings that support the current level", () => {
    const placed = 0;
    // three 80s moved the level up at t=3; then two readings at 60 and 90 → 3 (lead-in) + 2 = 5
    const r = [1, 2, 3, 4, 5].map((t, i) => ({ at: t, score: [80, 80, 80, 60, 90][i] }));
    const up = [{ at: 3, from: 800, to: 850, reason: "Up 50: 3 of the last 3 …" }];
    const c = growthConfidence(r, up, placed);
    assert.equal(c.readings, 5); assert.equal(c.against, 0); assert.equal(c.label, "CONFIRMED");
    assert.equal(confidenceText(c), "Level confirmed by 5 readings");
    // nothing since the placement
    const none = growthConfidence([], [], placed);
    assert.equal(none.label, "NONE"); assert.match(confidenceText(none), /Not confirmed yet/);
    // a teacher change gives no lead-in: only readings after it count
    const teacher = growthConfidence(r, [{ at: 3, from: 800, to: 900, reason: "Teacher set the level: MAP" }], placed);
    assert.equal(teacher.readings, 2); assert.equal(teacher.label, "EMERGING");
    // six steady readings after placement → STRONG
    assert.equal(growthConfidence([1, 2, 3, 4, 5, 6].map((t) => ({ at: t, score: 70 })), [], placed).label, "STRONG");
    // low scores at the level → MIXED
    const mixed = growthConfidence([1, 2, 3].map((t, i) => ({ at: t, score: [40, 45, 70][i] })), [], placed);
    assert.deepEqual([mixed.readings, mixed.against, mixed.label], [1, 2, "MIXED"]);
  });

  test("skill breakdown, stronger skills, trend, stretch and the grade range", () => {
    const key: AnswerKey = new Map();
    SKILLS.forEach((sk, i) => key.set(keyOf("a1", "MID", i + 1), { answer: "A", skill: sk }));
    const run = (right: number) => ({ articleId: "a1", band: "MID", answers: JSON.stringify(answers(right)) });
    const b = skillBreakdown([run(6), run(8)], key);
    assert.deepEqual(b.map((k) => k.skill), ["central-idea", "detail", "inference", "vocabulary"], "known skills in a fixed order");
    assert.deepEqual(b.find((k) => k.skill === "detail"), { skill: "detail", correct: 2, total: 4, pct: 50 });
    assert.equal(b.find((k) => k.skill === "central-idea")!.pct, 100);
    // detail: wrong in the first 4 readings, right in the last 4 → getting stronger
    const runs = [6, 6, 6, 6, 8, 8, 8, 8].map(run);
    assert.deepEqual(strongerSkills(runs, key), [{ skill: "detail", early: 0, recent: 100 }]);
    assert.deepEqual(strongerSkills(runs.slice(0, 3), key), [], "too few answers to tell");
    assert.deepEqual(scoreTrend([50, 50, 50, 60, 60, 80, 80, 90, 90, 100]), { recentAvg: 88, earlierAvg: 54, delta: 34 });
    assert.deepEqual(scoreTrend([70, 80]), { recentAvg: 75, earlierAvg: null, delta: null });
    assert.deepEqual(stretchSuccess([80, 60, 100]), { tried: 3, succeeded: 2, pct: 67 });
    assert.deepEqual([gradePosition(700, { low: 740, high: 1010 }), gradePosition(900, { low: 740, high: 1010 }), gradePosition(1100, { low: 740, high: 1010 })], ["BELOW", "WITHIN", "ABOVE"]);
  });

  test("projection with an honest range", () => {
    const now = at(28), yearEnd = at(28 + 10 * 7);
    const points: LevelPoint[] = [{ at: at(0), level: 800 }, { at: at(14), level: 850 }];
    const times = (n: number) => Array.from({ length: n }, (_, i) => at(1 + Math.floor((i * 25) / n)).getTime());
    assert.equal(projectionRange(points, times(3), now, yearEnd), null, "under 4 readings: no projection");
    assert.equal(projectionRange(points, [at(1), at(2), at(3), at(4)].map((d) => d.getTime()), now, yearEnd), null, "readings within 2 weeks: no projection");
    const few = projectionRange(points, times(4), now, yearEnd)!, many = projectionRange(points, times(25), now, yearEnd)!;
    for (const p of [few, many]) {
      assert.ok(p.low <= p.mid && p.mid <= p.high, JSON.stringify(p));
      assert.ok(p.low >= 300 && p.high <= 1400);
      assert.ok(p.high - p.low >= 100, "never a single number");
    }
    assert.ok(few.high - few.low > many.high - many.low, "fewer readings → a wider range");
    assert.equal(few.mid, many.mid, "the middle is the engine's projection");
    // a flat level near the end of the year: a narrow range and high confidence
    const flat = projectionRange([{ at: at(0), level: 900 }], times(25), now, at(35))!;
    assert.deepEqual([flat.mid, flat.confidence], [900, "HIGH"]);
  });

  test("the student's story uses encouraging words only", () => {
    const cases = [
      { level: 950, startLevel: 800, movesUp: 3, streak: 4, weeksMet: 6, articles: 20, words: 6400, stronger: ["inference"], stretchWins: 2, scoreDelta: 12 },
      { level: 700, startLevel: 800, movesUp: 0, streak: 0, weeksMet: 0, articles: 5, words: 600, stronger: [], stretchWins: 0, scoreDelta: -10 },
      { level: 800, startLevel: 800, movesUp: 1, streak: 1, weeksMet: 1, articles: 2, words: 200, stronger: [], stretchWins: 0, scoreDelta: null },
      { level: 800, startLevel: 800, movesUp: 0, streak: 0, weeksMet: 0, articles: 0, words: 0, stronger: [], stretchWins: 0, scoreDelta: null },
    ];
    for (const c of cases) {
      const text = storyLines(c).map((l) => fillLine(l)).join(" ");
      assert.ok(text.length > 10);
      assert.equal(hasLevelWords(text), false, text);
      assert.doesNotMatch(text, /\b(below|above|tier|rti|band|range|expected|behind|down|lower|dropped|fell)\b/i, text);
    }
    const story = storyLines(cases[0]).map((l) => fillLine(l));
    assert.ok(story.includes("Your level grew 150 points: from 800 to 950."));
    assert.ok(story.includes("You met your weekly goal 4 weeks in a row."));
    assert.ok(story.includes("You read 20 articles and 6,400 words."));
    assert.ok(story.includes("Getting stronger: inference."));
    // a lower level is told as building habits, never as a drop
    assert.ok(storyLines(cases[1]).map((l) => fillLine(l)).includes("You are building strong reading habits at level 700."));
  });

  test("level journey: placement then every change with its reason", () => {
    const j = levelJourney({ startLevel: 800, placedAt: 10, source: "PLACEMENT" }, [
      { at: 10, from: 850, to: 800, reason: "Placement: 6 passages, result 800" },
      { at: 20, from: 800, to: 850, reason: "Up 50: 3 of the last 4 …" },
      { at: 30, from: 850, to: 900, reason: "Teacher set the level: MAP 900" },
    ]);
    assert.deepEqual(j.events.map((e) => [e.kind, e.level, e.from]), [["PLACEMENT", 800, null], ["UP", 850, 800], ["TEACHER", 900, 850]]);
    assert.equal(j.events[0].reason, "Placement: 6 passages, result 800");
    assert.equal(j.points.length, 3);
  });
});

// ------------------------------------------------------------------ with the database

describe("🚀 ReadRise growth reports (demo school)", () => {
  let repo: SqliteRepo; let admin: Actor; let A: Actor; let B: Actor; let classId: string; let members: string[];
  let arts: string[]; let hardArt: string;
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    A = await actorOf("test.student.001");
    const m = (await repo.findMany("ClassMembership", { studentId: A.studentId!, leftAt: null }))[0];
    classId = String(m.classId);
    members = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((x) => String(x.studentId));
    const other = members.find((id) => id !== A.studentId)!;
    const u = await repo.findUnique("Student", { id: other });
    B = await resolveActor(repo, (await repo.findUnique("User", { id: u!.userId }))!);
    arts = [];
    for (let i = 1; i <= 8; i++) arts.push(await makeArticle(repo, `G-${i}`));
    hardArt = await makeArticle(repo, "G-HARD", 120);
    for (const s of [A, B]) {
      await ensureRRStudent(repo, s.studentId!, T0);
      await repo.updateMany("RRStudent", { studentId: s.studentId! }, { level: 850, startLevel: 850, source: "PLACEMENT", placedAt: T0 });
    }
    // A: five first tries at 75% (detail always wrong) over 15 days → up 50 after the third
    for (const [i, d] of [1, 4, 7, 10, 15].entries()) await read(repo, A, arts[i], 6, at(d));
    // B: one reading 20 days ago, nothing since → "not reading"
    await read(repo, B, arts[0], 8, at(1));
  });

  test("the version is chosen by the text's measured level, and the teacher sees its fit", async () => {
    const v = await startRun(repo, A, hardArt, {}, at(16));
    // A is at 900 now: nominal 900 measures 1020 (too hard) → 800 (measures 920)
    assert.equal(Number((await repo.findUnique("RRStudent", { studentId: A.studentId! }))!.level), 900);
    assert.equal(v.versionLevel, 800);
    assert.equal(v.band, "MID");
    await submitPrePoll(repo, A, v.runId, 1, at(16));
    await finishReading(repo, A, v.runId, {}, at(16));
    await submitActivity(repo, A, v.runId, answers(5), at(16)); // 63%: the level holds
    const g = await studentGrowthReport(repo, admin, classId, A.studentId!, at(17));
    const last = g.recent[0];
    assert.deepEqual([last.versionLevel, last.textLevel, last.studentLevel, last.fit], [800, 920, 900, "EXACT"]);
    assert.ok(g.recent.slice(1).every((r) => r.fit === "EXACT"), "the other texts measure at their target");
  });

  test("one student's growth evidence", async () => {
    const g = await studentGrowthReport(repo, admin, classId, A.studentId!, at(17));
    assert.equal(g.placed, true);
    assert.equal(g.level, 900);
    assert.deepEqual(g.history.map((e) => e.kind), ["PLACEMENT", "UP"]);
    assert.match(g.history[1].reason, /^Up 50: 3 of the last 3 first-try scores were 75% or higher/);
    assert.equal(g.firstTries, 6);
    assert.equal(g.wordsRead, 600);
    assert.equal(g.trend.length, 6);
    // 3 readings moved it up + 3 at the new level (50%+) support it
    assert.equal(g.confidence!.readings, 6);
    assert.equal(g.confidenceText, "Level confirmed by 6 readings");
    assert.equal(g.skills.find((k) => k.skill === "detail")!.pct, 0);
    assert.equal(g.skills.find((k) => k.skill === "central-idea")!.pct, 100);
    assert.ok(g.projection, "6 readings over 16 days → a projection");
    assert.ok(g.projection!.low < g.projection!.mid || g.projection!.mid < g.projection!.high);
    assert.ok(g.position !== null, "teachers see the grade range");
    assert.equal(g.perWeek.reduce((a, b) => a + b, 0) <= 6, true);
    // a student is not a teacher
    await assert.rejects(studentGrowthReport(repo, A, classId, A.studentId!, at(17)), ForbiddenError);
  });

  test("class aggregates: distribution, growth this term, not reading, weak skills with suggestions", async () => {
    const g = await classGrowth(repo, admin, classId, at(17));
    assert.equal(g.term.placed, 2);
    assert.equal(g.term.movedUp, 1);
    assert.equal(g.students.find((x) => x.studentId === A.studentId)!.growthTerm, 50);
    assert.equal(g.distribution.reduce((a, b) => a + b.count, 0), 2);
    const nr = new Set(g.notReading.map((x) => x.studentId));
    assert.ok(nr.has(B.studentId!), "B has not read for 16 days");
    assert.ok(!nr.has(A.studentId!));
    for (const id of members) if (id !== A.studentId && id !== B.studentId) assert.ok(nr.has(id), "students who never started are listed");
    const detail = g.weaknesses.find((w) => w.skill === "detail")!;
    assert.ok(detail, JSON.stringify(g.skills));
    assert.ok(detail.cell.pct! < 70);
    assert.deepEqual(detail.struggling.map((x) => x.studentId), [A.studentId]);
    assert.ok(detail.suggested.length > 0 && detail.suggested.length <= 3);
    assert.ok(detail.suggested.every((a) => a.questions === 2));
    assert.ok(!g.weaknesses.some((w) => w.skill === "central-idea"));
    const ev = g.students.find((x) => x.studentId === A.studentId)!;
    assert.equal(ev.confirmedBy, 6);
  });

  test("the student's own story: encouraging words, no level words", async () => {
    const story = (await myGrowthStory(repo, A, at(17)))!;
    assert.equal(story.level, 900);
    assert.deepEqual(story.journey.map((j) => j.level), [850, 900]);
    const text = story.lines.map((l) => fillLine(l)).join(" ");
    assert.equal(hasLevelWords(text), false, text);
    assert.match(text, /Your level grew 50 points/);
    assert.ok(story.strengths.includes("central-idea"));
    await assert.rejects(myGrowthStory(repo, admin, at(17)), ForbiddenError);
  });

  test("measured levels are cached for versions that have none", async () => {
    const id = await makeArticle(repo, "G-OLD");
    await repo.updateMany("RRVersion", { articleId: id }, { estLevel: 0 });
    assert.equal(await cacheMeasuredLevels(repo), 12);
    const vs = await repo.findMany("RRVersion", { articleId: id });
    assert.ok(vs.every((v) => Number(v.estLevel) > 0));
    assert.equal(await cacheMeasuredLevels(repo), 0);
  });

  test("downloads: the student's growth evidence and the class growth tables (CSV)", async () => {
    const deps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "rrg-")), now: () => at(17) };
    const exp = (a: Actor, q: Record<string, string>) => exportReport(deps, a, parseReportRequest(new URLSearchParams({ format: "csv", kind: "readrise", period: "TERM", ...q })));
    const oneFile = await exp(admin, { classId, studentId: A.studentId! });
    const one = Buffer.from(oneFile.bytes).toString("utf8");
    assert.match(one, /Date,From,Level,Reason/);
    assert.match(one, /,850,900,Up 50: 3 of the last 3/);
    const tableIds = (d: typeof oneFile.doc) => d.sections.flatMap((x) => (x.type === "table" ? [x.id] : []));
    assert.deepEqual(tableIds(oneFile.doc), ["history", "trend", "skills", "readings"]);
    const readings = oneFile.doc.sections.find((x) => x.type === "table" && x.id === "readings");
    assert.ok(readings && readings.type === "table" && readings.rows.some((r) => r.text === 920 && r.student === 900 && r.fit === "exact"));
    const clsFile = await exp(admin, { classId });
    assert.match(Buffer.from(clsFile.bytes).toString("utf8").split("\n")[0], /Growth this term,Confirmed by \(readings\),Projected end of year \(range\)/);
    assert.deepEqual(tableIds(clsFile.doc), ["students", "distribution", "notreading", "skills", "weak"]);
    const x = await exp(admin, { classId, studentId: A.studentId!, format: "xlsx" });
    assert.ok(x.bytes.length > 1000 && x.filename.endsWith(".xlsx"));
    await assert.rejects(exp(A, { classId, studentId: A.studentId! }), ForbiddenError);
  });
});
