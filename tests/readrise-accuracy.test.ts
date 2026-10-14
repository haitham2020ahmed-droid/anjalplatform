/**
 * 🎯 ReadRise accuracy (owner r69 item 3): rapid guesses (the practice rules) make a run Unreliable — it never moves
 * the level, the goal or the skills; question types feed the skill stars through the skill-status hook after the
 * response; a ReadRise level far from the MAP reading level alerts the teacher once; question types are tagged.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { setLevelByTeacher, studentReadRiseSummary } from "../src/server/readrise/engine";
import { finishReading, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { MAP_GAP, RR_UNRELIABLE_RAPID, alertMapGap, firstAnswerThresholdMs, inferQuestionType, mapGap, normalizeQuestionType, QUESTION_TYPES, rapidAnswers } from "../src/server/readrise/accuracy";
import { validateArticle } from "../src/server/readrise/import";
import { countedAnswers, readRisePracticeAnswers } from "../src/server/skills/status";
import { gradeSkillFamilies } from "../src/server/practice/skill-evidence";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z");
const at = (d: number, h = 0, m = 0) => new Date(T0.getTime() + d * DAY + h * 3_600_000 + m * 60_000);
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
const SKILLS = ["central-idea", "detail", "inference", "vocabulary", "text-structure", "author-purpose", "cause-effect", "inference"];
/** careful answer times: one every 20 s */
const careful = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 20_000 * (i + 1)]));
/** 4 answers in the same second at the end */
const rushed = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < 4 ? 20_000 * (i + 1) : 80_000 + 500 * (i - 3)]));

async function makeArticle(repo: SqliteRepo, code: string): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body: `Bees ${"make honey ".repeat(150)}`, wordCount: 301, estLevel: level });
  for (const band of ["LOW", "MID", "HIGH"]) for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `Q${n}?`, options: ["r", "w", "w", "w"], answer: "A", skill: SKILLS[n - 1] });
  return id;
}

describe("🎯 ReadRise accuracy", () => {
  test("rapid answers (pure): the first against the text's reading time, the others under 3 s; 2+ = Unreliable", () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
    // 301 words at 150 wpm ≈ 120 s; a third ≈ 40 s
    assert.equal(firstAnswerThresholdMs(301), Math.round(120_400 / 3));
    const ok = rapidAnswers({ at: careful(), numbers, readSeconds: 120, words: 301 });
    assert.deepEqual([ok.rapid, ok.unreliable, ok.ms["1"], ok.ms["8"]], [[], false, 20_000, 20_000]);
    const bad = rapidAnswers({ at: rushed(), numbers, readSeconds: 120, words: 301 });
    assert.deepEqual([bad.rapid, bad.unreliable], [[5, 6, 7, 8], true], "4 answers 0.5 s apart");
    // the first answer after skipping the reading: 5 s on the article + 2 s → under a third of the reading time
    const skim = rapidAnswers({ at: { ...careful(), 1: 2_000 }, numbers, readSeconds: 5, words: 301 });
    assert.deepEqual([skim.rapid, skim.unreliable], [[1], false], "one rapid answer alone is not Unreliable");
    assert.equal(RR_UNRELIABLE_RAPID, 2);
    // the client cannot claim more time than the server saw: 160 s claimed, 10 s seen → every answer ~1.25 s apart
    const fake = rapidAnswers({ at: careful(), numbers, readSeconds: 120, words: 301, serverMs: 10_000 });
    assert.ok(fake.unreliable && fake.rapid.length >= 7, `scaled: ${fake.rapid}`);
    // no answer times (an older page): only the reading time, at most one rapid answer
    assert.deepEqual(rapidAnswers({ at: null, numbers, readSeconds: 5, words: 301 }).rapid, [1]);
    assert.deepEqual(rapidAnswers({ at: null, numbers, readSeconds: 120, words: 301 }).rapid, []);
    // junk times are ignored
    assert.deepEqual(rapidAnswers({ at: { 1: "x", 2: -5, 3: 1e12 }, numbers, readSeconds: 120, words: 301 }).rapid, []);
  });

  test("question types: every library and placement question is tagged; a missing type comes from the stem (deterministic)", () => {
    const dir = join(process.cwd(), "data/readrise/articles");
    let total = 0, untagged = 0;
    for (const f of readdirSync(dir)) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      for (const b of Object.values(d.bands) as { questions: { skill?: string }[] }[]) for (const q of b.questions) { total++; if (!normalizeQuestionType(q.skill)) untagged++; }
    }
    const pl = JSON.parse(readFileSync(join(process.cwd(), "data/readrise/placement.json"), "utf8")) as { passages: { questions: { skill?: string }[] }[] };
    for (const p of pl.passages) for (const q of p.questions) { total++; if (!normalizeQuestionType(q.skill)) untagged++; }
    assert.ok(total >= 4800);
    assert.equal(untagged, 0, "every ReadRise question has a type");
    const cases: [string, string][] = [
      ["What is the main idea of the article?", "central-idea"], ["What is this article mostly about?", "central-idea"],
      ["In the article, what does observe mean?", "vocabulary"], ["How is the article mainly organized?", "text-structure"],
      ["Why did the author write this article?", "author-purpose"], ["Which event happens FIRST in the life of a glacier?", "sequence"],
      ["How are bees and wasps alike?", "compare"], ["What can the reader infer from this?", "inference"],
      ["Why does a caterpillar need to molt?", "cause-effect"], ["How many legs does a spider have?", "detail"],
    ];
    for (const [stem, want] of cases) assert.equal(inferQuestionType(stem), want, stem);
    assert.equal(inferQuestionType("What is the main idea?"), inferQuestionType("What is the main idea?"), "deterministic");
    assert.ok(QUESTION_TYPES.includes(inferQuestionType("anything at all")));
    assert.deepEqual([normalizeQuestionType("Main Idea"), normalizeQuestionType("author's purpose"), normalizeQuestionType("nonsense")], ["central-idea", "author-purpose", null]);
  });

  test("import: a question without a skill is tagged from its stem (with a warning), a known spelling is accepted", () => {
    const art = JSON.parse(readFileSync(join(process.cwd(), "data/readrise/articles/RR-001.json"), "utf8"));
    const q0 = art.bands.LOW.questions[0], q1 = art.bands.LOW.questions[1];
    const before = q1.skill;
    q0.skill = ""; q1.skill = before === "central-idea" ? "Main Idea" : before.replace(/-/g, " ");
    const r = validateArticle(art);
    assert.deepEqual(r.errors, [], "still valid");
    assert.equal(r.article!.bands.LOW.questions[0].skill, inferQuestionType(q0.stem));
    assert.equal(r.article!.bands.LOW.questions[1].skill, before);
    assert.ok(r.warnings.some((w) => /No skill given: set to “[a-z-]+” from the question/.test(w.message)));
  });

  test("MAP gap (pure)", () => {
    assert.equal(MAP_GAP, 250);
    assert.equal(mapGap(1000, 700), 300);
    assert.equal(mapGap(700, 1000), -300);
    assert.equal(mapGap(900, 700), null, "200 apart is fine");
    assert.equal(mapGap(900, null), null);
  });

  describe("end to end", () => {
    let repo: SqliteRepo; let teacher: Actor; let st: Actor[]; let arts: string[];
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const lvl = async (s: Actor) => Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level);

    /** the routine; `at` = the reader's answer times */
    async function read(s: Actor, articleId: string, right: number, now: Date, times: Record<string, number> | null) {
      const v = await startRun(repo, s, articleId, {}, now);
      await submitPrePoll(repo, s, v.runId, 1, now);
      await finishReading(repo, s, v.runId, { readSeconds: 150 }, now);
      const quizEnd = new Date(now.getTime() + 5 * 60_000);
      const q = await submitActivity(repo, s, v.runId, answers(right), quizEnd, { at: times });
      await submitWriting(repo, s, v.runId, WRITING, quizEnd);
      const d = await submitPostPoll(repo, s, v.runId, 2, quizEnd);
      return { runId: v.runId, quiz: q, done: d };
    }

    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      teacher = await actorOf("test.teacher.1");
      st = await Promise.all(["001", "002", "003"].map((t) => actorOf(`test.student.${t}`)));
      arts = [];
      for (let i = 0; i < 6; i++) arts.push(await makeArticle(repo, `AC-${i}`));
    });

    test("an Unreliable run: stored for the teacher, never moves the level, the goal or the skills", async () => {
      const s = st[0];
      await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
      const r = await read(s, arts[0], 0, at(1), rushed()); // 0% — would be −100 if it counted
      await afterResponseSettled();
      const run = (await repo.findUnique("RRRun", { id: r.runId }))!;
      assert.deepEqual([run.unreliable, Number(run.rapidCount)], [true, 4]);
      assert.deepEqual((run.answerMs as { rapid: number[] }).rapid, [5, 6, 7, 8]);
      assert.equal(await lvl(s), 800, "the level did not move");
      assert.equal(r.done.done!.tooFast, true, "the student gets a gentle 'take your time'");
      assert.deepEqual([r.done.done!.levelBefore, r.done.done!.levelAfter], [800, 800]);
      assert.equal((await repo.findMany("SkillEvidence", { studentId: s.studentId, source: "READRISE" })).length, 0, "no skill evidence");
      // a 100% unreliable run does not count toward the goal or the average either
      await read(s, arts[1], 8, at(1, 2), rushed());
      const sum = (await studentReadRiseSummary(repo, s.studentId!, at(1, 3)))!;
      assert.deepEqual([sum.thisWeek, sum.firstTryAvg, sum.runs], [0, null, 0]);
      assert.equal(Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.articlesDone), 0);
    });

    test("a careful run counts: the level rule, skill evidence by question type and the skill stars (after the response)", async () => {
      const s = st[1];
      await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
      const r = await read(s, arts[0], 1, at(1), careful()); // 13% → −100
      assert.equal(await lvl(s), 700);
      await afterResponseSettled();
      const run = (await repo.findUnique("RRRun", { id: r.runId }))!;
      assert.deepEqual([run.unreliable, Number(run.rapidCount)], [false, 0]);
      const ev = await repo.findMany("SkillEvidence", { studentId: s.studentId, source: "READRISE" });
      assert.ok(ev.length >= 4, `evidence by question type: ${ev.length}`);
      const fam = (await gradeSkillFamilies(repo, s.studentId!)).family;
      const inference = fam.get("inference")!;
      assert.ok(inference && ev.some((e) => e.skillId === inference));
      // the star path counts them as practice (countedAnswers ← readRisePracticeAnswers)
      const rr = await readRisePracticeAnswers(repo, s.studentId!, [inference]);
      assert.equal(rr.answered, 2, "two inference questions");
      assert.ok((await countedAnswers(repo, s.studentId!, [inference])).answered >= 2);
      const star = await repo.findMany("SkillStatus", { studentId: s.studentId });
      assert.ok(star.length >= 1 && star.every((x) => x.status === "IN_PROGRESS"), "the skill-status hook ran after the response");
      // one rapid answer in a careful run: left out of the evidence, the run still counts
      const skim = await read(s, arts[1], 8, at(2), { ...careful(), 8: 141_000 });
      await afterResponseSettled();
      const run2 = (await repo.findUnique("RRRun", { id: skim.runId }))!;
      assert.deepEqual([run2.unreliable, Number(run2.rapidCount)], [false, 1]);
      const ev2 = (await repo.findMany("SkillEvidence", { studentId: s.studentId, source: "READRISE" })).filter((e) => String(e.refId).startsWith(skim.runId));
      assert.ok(ev2.length > 0 && !ev2.some((e) => String(e.refId) === `${skim.runId}:8`), "the rapid answer is left out");
    });

    test("ReadRise vs MAP more than 250 apart → one alert for the teacher (once a school year)", async () => {
      const s = st[2];
      await repo.create("MapResult", { studentId: s.studentId, testDate: at(-20), subject: "Reading", rit: 200, lexile: 600 });
      await setLevelByTeacher(repo, teacher, s.studentId!, 1000, "", at(0));
      assert.equal(await alertMapGap(repo, s.studentId!, at(0, 1)), true);
      assert.equal(await alertMapGap(repo, s.studentId!, at(0, 2)), false, "once");
      const al = await repo.findMany("StudentAlert", { studentId: s.studentId, kind: "RR_MAP_GAP" });
      assert.equal(al.length, 1);
      assert.match(String(al[0].detail), /ReadRise level 1000 and the MAP reading level 600 are 400 points apart/);
      assert.ok(!/Lexile/.test(String(al[0].detail)), "never called a Lexile");
      // the level moving in an article run checks it after the response (no second alert)
      await read(s, arts[2], 0, at(1), careful());
      await afterResponseSettled();
      assert.equal((await repo.findMany("StudentAlert", { studentId: s.studentId, kind: "RR_MAP_GAP" })).length, 1);
      // a student without a real level (no placement, no teacher level) is never alerted
      const fresh = await actorOf("test.student.004");
      await repo.create("MapResult", { studentId: fresh.studentId, testDate: at(-20), subject: "Reading", rit: 180, lexile: 300 });
      await repo.create("RRStudent", { studentId: fresh.studentId, schoolId: fresh.schoolId, level: 950, startLevel: 950, source: "DEFAULT", placedAt: at(0) });
      assert.equal(await alertMapGap(repo, fresh.studentId!, at(1)), false);
    });
  });
});
