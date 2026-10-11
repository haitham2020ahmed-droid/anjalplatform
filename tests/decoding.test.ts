/**
 * Decoding screener: word lists, branching, scoring and status rules, real vs made-up report, the student flow,
 * the teacher's class profile and invitations, and the daily queue rule.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import {
  answerScreen, classDecodingProfile, inviteToScreen, nextStrand, queueDecodingScreens, scoreStrand, startScreen, statusFor, strandItems, studentScreenDetail, studentScreenView, summarize,
  type ScreenItem, type ScreenQuestion, type ScreenResult, type ScreenStrand,
} from "../src/server/word-study/screener";
import { STRAND_BY_N, STRANDS } from "../src/server/word-study/strands";
import { decodeSpeech } from "../src/server/word-study/speech-code";
import { demoDatabase, ROOT } from "./helpers/db";

/** A finished strand where the given words (by pattern + real/made-up) are wrong. */
function done(n: number, wrong: (it: ScreenItem) => boolean): ScreenStrand {
  const items = strandItems(STRAND_BY_N.get(n)!, "seed").map((it) => { const bad = wrong(it); return { ...it, picked: bad ? it.choices.find((c) => c !== it.answer)! : it.answer, correct: !bad }; });
  return { strand: n, code: STRAND_BY_N.get(n)!.code, items };
}
const missN = (k: number) => { let i = 0; return () => i++ < k; };

describe("word lists", () => {
  test("8 strands in teaching order, each 5 patterns × (1 real + 1 made-up) = 5 real + 5 made-up words", () => {
    assert.deepEqual(STRANDS.map((s) => s.code), ["SHORT_VOWELS", "DIGRAPHS_BLENDS", "SILENT_E", "VOWEL_TEAMS", "R_CONTROLLED", "DIPHTHONGS", "INFLECTIONS", "MULTISYLLABLE"]);
    const all: string[] = [];
    for (const s of STRANDS) {
      assert.equal(s.patterns.length, 5, s.code);
      const words = s.patterns.flatMap((p) => p.words);
      assert.deepEqual([words.filter((w) => w.real).length, words.filter((w) => !w.real).length], [5, 5], s.code);
      for (const w of words) {
        assert.equal(w.choices[0], w.word);
        assert.equal(new Set(w.choices).size, 4, `${w.word}: 4 different choices`);
        assert.ok(w.choices.every((c) => /^[a-z]+$/.test(c)), w.word);
        all.push(w.word);
      }
    }
    assert.equal(new Set(all).size, 80, "every word is used once");
  });

  test("made-up words are not common real words; Arabic-speaker confusions appear among the distractors", () => {
    const madeUp = STRANDS.flatMap((s) => s.patterns.flatMap((p) => p.words.filter((w) => !w.real).map((w) => w.word)));
    const common = new Set(["the", "rag", "pet", "lid", "mop", "bun", "fen", "dub", "spunk", "clay", "trail", "plain"]);
    assert.deepEqual(madeUp.filter((w) => common.has(w)), []);
    const choices = STRANDS.flatMap((s) => s.patterns.flatMap((p) => p.words.map((w) => [w.word, w.choices.slice(1)] as const)));
    const swap = (a: string, b: string) => choices.filter(([w, cs]) => cs.some((c) => c.length === w.length && [...c].every((ch, i) => ch === w[i] || (w[i] === a && ch === b) || (w[i] === b && ch === a)) && c !== w)).length;
    assert.ok(swap("p", "b") >= 10, "p/b swaps");
    assert.ok(swap("v", "f") >= 5, "v/f swaps");
  });
});

describe("branching", () => {
  test("starts at strand 3; passing goes up; stops after two strands under 50 %", () => {
    assert.equal(nextStrand([]), 3);
    assert.equal(nextStrand([{ strand: 3, pct: 90 }]), 4);
    assert.equal(nextStrand([{ strand: 3, pct: 90 }, { strand: 4, pct: 40 }]), 5, "one strand under 50 %: keep going up");
    assert.equal(nextStrand([{ strand: 3, pct: 90 }, { strand: 4, pct: 40 }, { strand: 5, pct: 60 }]), 6);
    assert.equal(nextStrand([{ strand: 3, pct: 90 }, { strand: 4, pct: 40 }, { strand: 5, pct: 30 }]), null, "second strand under 50 %: stop");
    const all = [3, 4, 5, 6, 7, 8].map((strand) => ({ strand, pct: 100 }));
    assert.equal(nextStrand(all.slice(0, 5)), 8);
    assert.equal(nextStrand(all), null, "after strand 8");
  });

  test("a strand under 50 % drops down to earlier strands", () => {
    assert.equal(nextStrand([{ strand: 3, pct: 40 }]), 2);
    assert.equal(nextStrand([{ strand: 3, pct: 40 }, { strand: 2, pct: 30 }]), 1, "keeps going down");
    assert.equal(nextStrand([{ strand: 3, pct: 40 }, { strand: 2, pct: 30 }, { strand: 1, pct: 20 }]), null);
    assert.equal(nextStrand([{ strand: 3, pct: 40 }, { strand: 2, pct: 90 }]), 4, "the earlier strand is secure: back up above the start");
    assert.equal(nextStrand([{ strand: 3, pct: 40 }, { strand: 2, pct: 90 }, { strand: 4, pct: 20 }]), null, "two under 50 %");
    assert.equal(nextStrand([{ strand: 3, pct: 50 }]), 4, "exactly 50 % is not under 50 %");
  });
});

describe("scoring and status rules", () => {
  test("≥ 80 % mastered, 60–79 % review, under 60 % reteach", () => {
    assert.deepEqual([100, 80, 79, 60, 59, 0].map(statusFor), ["MASTERED", "MASTERED", "REVIEW", "REVIEW", "RETEACH", "RETEACH"]);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((k) => { const r = scoreStrand(done(4, missN(k))); return [r.correct, r.pct, r.status]; }),
      [[10, 100, "MASTERED"], [9, 90, "MASTERED"], [8, 80, "MASTERED"], [7, 70, "REVIEW"], [6, 60, "REVIEW"], [5, 50, "RETEACH"]]);
  });

  test("more than one miss on a pattern → reteach that pattern, even when the strand is mastered", () => {
    const both = scoreStrand(done(4, (it) => it.pattern === "ea"));
    assert.deepEqual([both.pct, both.status, both.reteach], [80, "MASTERED", ["ea"]]);
    const spread = scoreStrand(done(4, (it) => (it.pattern === "ea" && it.real) || (it.pattern === "oa" && !it.real)));
    assert.deepEqual([spread.pct, spread.status, spread.reteach], [80, "MASTERED", []], "one miss each on two patterns: nothing to reteach");
    assert.deepEqual(scoreStrand(done(7, (it) => ["doubling", "y-to-i"].includes(it.pattern))).reteach, ["doubling before -ed / -ing", "y → i before -ed / -es"]);
  });

  test("real and made-up words are reported separately; a big gap flags memorising instead of decoding", () => {
    const strands = [done(3, (it) => !it.real), done(2, (it) => !it.real && it.pattern !== "sh"), done(4, (it) => !it.real)];
    const s3 = scoreStrand(strands[0]);
    assert.deepEqual([s3.real, s3.madeUp], [{ correct: 5, total: 5, pct: 100 }, { correct: 0, total: 5, pct: 0 }]);
    const r = summarize(strands);
    assert.deepEqual([r.real.pct, r.madeUp.pct, r.decodingGap], [100, 7, true]);
    assert.deepEqual(r.order, [3, 2, 4]);
    assert.equal(r.teachFrom, 2, "the first strand to teach is the lowest one not mastered");
    assert.deepEqual(r.assumed, [1], "the start strand was not under 50 %: strands below the lowest tested one are assumed secure");
    assert.deepEqual(summarize([done(3, () => true), done(2, () => true), done(4, () => true)]).assumed, [], "start strand under 50 %: nothing is assumed");
    const good = summarize([done(3, () => false), done(4, missN(3)), done(5, () => true), done(6, () => true)]);
    assert.deepEqual([good.decodingGap, good.teachFrom, good.assumed, good.strands["4"].status, good.strands["5"].status], [false, 4, [1, 2], "REVIEW", "RETEACH"]);
  });
});

describe("student flow, teacher profile, invitations and the daily queue", () => {
  let repo: SqliteRepo, teacher: Actor, otherTeacher: Actor, s1: Actor, s2: Actor, s3: Actor;
  const T0 = new Date("2026-11-10T08:00:00Z");
  const at = (min: number) => new Date(T0.getTime() + min * 60_000);
  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actorFor("demo.teacher.4a");
    otherTeacher = await actorFor("demo.teacher.4b");
    [s1, s2, s3] = await Promise.all(["demo.s1001", "demo.s1002", "demo.s1003"].map(actorFor));
  });
  const classOf = async (a: Actor) => String((await repo.findMany("ClassMembership", { studentId: a.studentId! }))[0].classId);
  /** answers the whole screen; `knows(strand, real)` decides right or wrong */
  async function take(a: Actor, knows: (strand: number, real: boolean, word: string) => boolean, start: Date) {
    let q: ScreenQuestion | null = await startScreen(repo, a, start);
    let k = 0;
    let result: ScreenResult | null = null;
    const order: number[] = [];
    while (q) {
      if (order[order.length - 1] !== q.strand.n) order.push(q.strand.n);
      const word: string = decodeSpeech<string>(q.say, `${q.screenId}:${q.strand.n}:${q.index}`)!;
      assert.ok(q.choices.includes(word), "the spoken word is one of the choices");
      const pick = knows(q.strand.n, !q.madeUp, word) ? word : q.choices.find((c) => c !== word)!;
      const r = await answerScreen(repo, a, { screenId: q.screenId, strand: q.strand.n, index: q.index, picked: pick }, new Date(start.getTime() + ++k * 5000));
      q = r.next;
      result = r.result;
    }
    return { order, result: result!, answered: k };
  }

  test("the student takes it: strand 3 first, words spoken from a scrambled payload, up until two strands under 50 %", async () => {
    assert.equal((await studentScreenView(repo, s1, T0)).state, "NONE");
    const q = await startScreen(repo, s1, T0);
    assert.deepEqual([q.strand.n, q.index, q.total, q.choices.length], [3, 0, 10, 4]);
    const word = decodeSpeech<string>(q.say, `${q.screenId}:3:0`)!;
    assert.ok(!q.say.includes(word));
    // the same word twice, or a spelling that is not offered, is refused
    await assert.rejects(answerScreen(repo, s1, { screenId: q.screenId, strand: 3, index: 1, picked: q.choices[0] }), /already answered/);
    await assert.rejects(answerScreen(repo, s1, { screenId: q.screenId, strand: 3, index: 0, picked: "zzz" }), /Choose one of the spellings/);
    await assert.rejects(answerScreen(repo, s2, { screenId: q.screenId, strand: 3, index: 0, picked: q.choices[0] }), /not found/);
    // knows strands 1–4, not 5 and 6
    const run = await take(s1, (n) => n <= 4, T0);
    assert.deepEqual(run.order, [3, 4, 5, 6]);
    assert.equal(run.answered, 40);
    assert.deepEqual(STRANDS.map((s) => run.result.strands[String(s.n)]?.status ?? null), [null, null, "MASTERED", "MASTERED", "RETEACH", "RETEACH", null, null]);
    assert.deepEqual([run.result.teachFrom, run.result.assumed], [5, [1, 2]]);
    const v = await studentScreenView(repo, s1, at(30));
    assert.deepEqual([v.state, v.canStart], ["DONE", false]);
    const row = (await repo.findMany("DecodingScreen", { studentId: s1.studentId! }))[0];
    assert.ok(row.completedAt && row.result, "the result is stored");
    assert.equal(row.reason, "SELF");
    await assert.rejects(startScreen(repo, s1, at(60)), /again after 30 days/);
  });

  test("drop down: strand 3 under 50 % → strand 2; made-up words wrong → decoding gap", async () => {
    // strand 3: nothing right; strand 2: all right; strand 4: real words only (but one), no made-up word
    const run = await take(s2, (n, real, word) => (n === 3 ? false : n === 2 ? true : real && word !== "toast"), T0);
    assert.deepEqual(run.order, [3, 2, 4], "3 fails → 2 (passed) → back up to 4 → second fail, stop");
    assert.deepEqual([run.result.strands["3"].status, run.result.strands["2"].status, run.result.strands["4"].pct], ["RETEACH", "MASTERED", 40]);
    assert.deepEqual([run.result.strands["4"].real.pct, run.result.strands["4"].madeUp.pct, run.result.strands["4"].reteach], [80, 0, ["oa"]]);
    assert.equal(run.result.decodingGap, true);
  });

  test("the teacher asks students to take it: invitation + notification; others' classes are refused", async () => {
    const classId = await classOf(s3);
    await assert.rejects(inviteToScreen(repo, otherTeacher, classId, [s3.studentId!]), /do not teach this class/);
    await assert.rejects(inviteToScreen(repo, teacher, classId, ["nobody"]), /at least one student/);
    assert.equal(await inviteToScreen(repo, teacher, classId, [s3.studentId!, s3.studentId!], at(1)), 1);
    assert.equal(await inviteToScreen(repo, teacher, classId, [s3.studentId!], at(2)), 0, "already waiting: not twice");
    const user = (await repo.findUnique("Student", { id: s3.studentId! }))!.userId;
    const notes = await repo.findMany("Notification", { userId: user });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].link, "/student/decoding");
    const v = await studentScreenView(repo, s3, at(3));
    assert.deepEqual([v.state, v.reason, v.question], ["INVITED", "TEACHER", null]);
    const run = await take(s3, () => true, at(5));
    assert.deepEqual(run.order, [3, 4, 5, 6, 7, 8]);
    assert.equal((await repo.findMany("DecodingScreen", { studentId: s3.studentId! })).length, 1, "the invitation itself was used");
    assert.equal(run.result.teachFrom, null);
  });

  test("class profile: strands × students, who needs which pattern, word-study groups, results per student", async () => {
    const classId = await classOf(s1);
    await assert.rejects(classDecodingProfile(repo, otherTeacher, classId), /do not teach this class/);
    const p = await classDecodingProfile(repo, teacher, classId);
    assert.equal(p.strands.length, 8);
    const row = (a: Actor) => p.rows.find((r) => r.id === a.studentId)!;
    assert.deepEqual([row(s1).state, row(s1).strands[5]?.status, row(s1).strands[1], row(s1).assumed, row(s1).teachFrom], ["DONE", "RETEACH", null, [1, 2], 5]);
    assert.deepEqual([row(s2).strands[3]?.status, row(s2).teachFrom, row(s2).decodingGap], ["RETEACH", 3, true]);
    assert.equal(row(s3).strands[8]?.status, "MASTERED");
    // s1 missed every word of strands 5 and 6: every pattern there needs reteaching
    assert.ok(p.patterns.some((x) => x.label === "R-controlled: ir" && x.students.some((s) => s.id === s1.studentId)));
    assert.ok(p.patterns.every((x) => x.students.length > 0));
    assert.deepEqual(p.groups.map((g) => g.key).sort(), ["gap", "strand-3", "strand-5"]);
    assert.deepEqual(p.groups.find((g) => g.key === "strand-5")!.students.map((s) => s.id), [s1.studentId]);
    const d = await studentScreenDetail(repo, teacher, classId, s2.studentId!);
    assert.deepEqual(d.screens[0].strands.map((x) => x.strand), [3, 2, 4]);
    assert.ok(d.screens[0].strands[0].items.every((i) => i.correct === false && i.picked !== i.answer));
    await assert.rejects(studentScreenDetail(repo, teacher, classId, "someone-else"), /not found/);
  });

  test("daily queue: Tier 2/3 + low fluency + low comprehension evidence + no screener in 90 days", async () => {
    const school = String(s1.schoolId);
    const students = (await repo.findMany("Student", { schoolId: school })).map((x) => String(x.id)).filter((id) => ![s1, s2, s3].some((a) => a.studentId === id));
    const [a, b, c, d, e, f] = students;
    const NOW = new Date("2027-03-01T08:00:00Z");
    const tier = (id: string, t: number) => repo.create("StudentTier", { studentId: id, schoolId: school, tier: t, reason: "test" });
    const check = (id: string, percentile: number | null, comprehension: number | null = null) => repo.create("FluencyCheck", { studentId: id, wcpm: 60, percentile, comprehension, checkedAt: new Date("2027-02-20T08:00:00Z") });
    let n = 0;
    const diag = (id: string, proficiency: string) => repo.create("DiagnosticResult", { studentId: id, sessionId: `s-${++n}`, questions: 20, overallTheta: -1, overallSE: 0.3, proficiency, domains: [], strongDomains: [], weakDomains: [], recommendedSkillIds: [], interventionSkillIds: [], engineVersion: "t", takenAt: new Date("2027-02-01T08:00:00Z") });
    // a: qualifies (percentile 10, Diagnostic below grade level)
    await tier(a, 2); await check(a, 10); await diag(a, "Below grade level");
    // b: low fluency but comprehension evidence is fine
    await tier(b, 3); await check(b, 10); await diag(b, "At grade level");
    // c: everything low, but Tier 1
    await tier(c, 1); await check(c, 5); await diag(c, "Below grade level");
    // d: qualifies, but screened 30 days ago
    await tier(d, 2); await check(d, 5); await diag(d, "Approaching grade level");
    await repo.create("DecodingScreen", { studentId: d, schoolId: school, reason: "TEACHER", items: [], result: null, startedAt: new Date("2027-01-30T08:00:00Z"), completedAt: new Date("2027-01-30T08:20:00Z") });
    // e: fast reader (percentile 60) whose comprehension after reading is low (Fluency Coach), profile BELOW
    await tier(e, 3);
    await repo.create("FluencyPractice", { studentId: e, mode: "MINUTE", passageKey: "RP:x", title: "t", wordsRead: 100, wordsCorrect: 98, seconds: 60, wcpm: 98, accuracy: 98, errors: [], percentile: 60, comprehension: 40, createdAt: new Date("2027-02-25T08:00:00Z") });
    await repo.create("StudentProfile", { studentId: e, schoolId: school, level: "BELOW", levelSource: "MAP" });
    // f: Tier 2, low comprehension evidence, fluency fine (percentile 70)
    await tier(f, 2); await check(f, 70, 90); await diag(f, "Below grade level");

    assert.equal(await queueDecodingScreens(repo, school, NOW), 2);
    const invited = await repo.findMany("DecodingScreen", { reason: "TIER" });
    assert.deepEqual(invited.map((x) => String(x.studentId)).sort(), [a, e].sort());
    assert.ok(invited.every((x) => !x.completedAt));
    const userA = (await repo.findUnique("Student", { id: a }))!.userId;
    assert.equal((await repo.findMany("Notification", { userId: userA, link: "/student/decoding" })).length, 1);
    assert.equal(await queueDecodingScreens(repo, school, new Date(NOW.getTime() + 86_400_000)), 0, "never twice");
    // the daily job calls it (one call, failures logged, never stopping the job)
    assert.match(readFileSync(join(ROOT, "src/server/insights/daily.ts"), "utf8"), /queueDecodingScreens\(repo, schoolId, now\)/);
  });
});
