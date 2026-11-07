/**
 * 🧭 ReadRise recommendations with reasons, "Read next", interests, key words → My Words, the word warm-up and the
 * teacher's split "Stuck" signals (🔴 not reading · 🟠 reading below 75% · 📉 weekly goal missed 2 weeks in a row).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { ensureRRStudent } from "../src/server/readrise/engine";
import { dailySeed, mostMissed, sharedKeys, readNext, reasonLabel, recommendFor, seededOrder, weakSkills, type CardLite } from "../src/server/readrise/recommend";
import { getInterests, setInterests } from "../src/server/readrise/interests";
import { carryKeyWords, keyWordsOf, wordWarmup } from "../src/server/readrise/words-carry";
import { readingSignals } from "../src/server/readrise/dashboards";
import { readRiseTeacherReport } from "../src/server/readrise/teacher-report";
import { makeT } from "../src/i18n";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const NOW = new Date("2026-11-04T08:00:00Z"); // a Wednesday
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ROOT = process.cwd();
const LEVELS = [500, 800, 1200];
const DEFAULT_SKILLS = ["central-idea", "detail", "detail", "detail", "cause-effect", "detail", "sequence", "detail"];

async function makeArticle(repo: SqliteRepo, code: string, topic: string, skills: string[] = DEFAULT_SKILLS, keyWords?: unknown[]): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic, summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of LEVELS) await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body: "Bees make honey. ".repeat(40), wordCount: 120, estLevel: level });
  for (const band of ["LOW", "MID", "HIGH"]) for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `Q${n}?`, options: ["r", "w", "w", "w"], answer: "A", skill: skills[n - 1] ?? "detail" });
  if (keyWords) await repo.create("RRPrompt", { articleId: id, band: "MID", prompt: "Write.", keyWords });
  return id;
}

let runN = 0;
async function addRun(repo: SqliteRepo, st: Actor, articleId: string, o: { right?: number[]; score?: number; at?: Date; step?: string; firstTry?: boolean; stretch?: boolean } = {}): Promise<void> {
  const answers = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), (o.right ?? [1, 2, 3, 4, 5, 6, 7, 8]).includes(i + 1) ? "A" : "B"]));
  const at = o.at ?? ago(1);
  await repo.create("RRRun", {
    id: `run-${++runN}`, studentId: st.studentId!, schoolId: st.schoolId!, articleId, versionLevel: 800, band: "MID", step: o.step ?? "DONE", answers,
    score: o.score ?? Math.round(((o.right ?? [1, 2, 3, 4, 5, 6, 7, 8]).length / 8) * 100), firstTry: o.firstTry ?? true, stretch: o.stretch ?? false,
    levelBefore: 800, startedAt: at, completedAt: o.step && o.step !== "DONE" ? null : at, readSeconds: 200,
  });
}

describe("🧭 ReadRise recommendations", () => {
  let repo: SqliteRepo; let st: Actor[]; let classId: string;
  const A: Record<string, string> = {};
  let cards: CardLite[] = [];
  const card = (id: string, topic: string, extra: Partial<CardLite> = {}): CardLite => ({ id, topic, status: "NEW", assigned: false, dueAt: null, ...extra });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const first = await actorOf("test.student.001");
    classId = String((await repo.findMany("ClassMembership", { studentId: first.studentId!, leftAt: null }))[0].classId);
    const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    st = [];
    for (const id of ids.slice(0, 3)) { const u = await repo.findUnique("Student", { id }); st.push(await resolveActor(repo, (await repo.findUnique("User", { id: u!.userId }))!)); }
    for (const s of st) {
      await ensureRRStudent(repo, s.studentId!, ago(60));
      await repo.updateMany("RRStudent", { studentId: s.studentId! }, { level: 930, startLevel: 930, source: "PLACEMENT", placedAt: ago(60) }); // round 8: Achieve3000 scale — 930L reads the 800 version
    }
    A.readSci = await makeArticle(repo, "READ-SCI", "Science", ["central-idea", "inference", "inference", "inference", "detail", "detail", "vocabulary", "vocabulary"]);
    A.inf = await makeArticle(repo, "INF", "Space", ["inference", "inference", "inference", "inference", "inference", "detail", "detail", "detail"]);
    A.inf2 = await makeArticle(repo, "INF2", "Sports", ["inference", "inference", "detail", "detail", "detail", "detail", "detail", "detail"]);
    A.vocab = await makeArticle(repo, "VOC", "History", ["vocabulary", "vocabulary", "vocabulary", "vocabulary", "detail", "detail", "detail", "detail"]);
    A.ani1 = await makeArticle(repo, "ANI1", "Animals");
    A.ani2 = await makeArticle(repo, "ANI2", "Animals");
    A.sci2 = await makeArticle(repo, "SCI2", "Science");
    A.ocean = await makeArticle(repo, "OCEAN", "Oceans");
    A.food = await makeArticle(repo, "FOOD", "Food");
    A.art = await makeArticle(repo, "ART", "Art");
    cards = [
      card(A.readSci, "Science", { status: "DONE" }), card(A.inf, "Space"), card(A.inf2, "Sports"), card(A.vocab, "History"), card(A.ani1, "Animals"), card(A.ani2, "Animals"),
      card(A.sci2, "Science"), card(A.ocean, "Oceans"), card(A.food, "Food"), card(A.art, "Art"),
    ];
    // st[0] read a Science article: inference all wrong (3 answers), the rest right → weak skill = inference
    await addRun(repo, st[0], A.readSci, { right: [1, 5, 6, 7, 8], at: ago(3) });
  });

  test("pure: weak skills need evidence and are weakest first; the daily seed", () => {
    const tally = new Map<string, [number, number]>([["inference", [0, 3]], ["vocabulary", [1, 4]], ["detail", [2, 2]], ["sequence", [0, 1]]]);
    assert.deepEqual(weakSkills(tally), ["inference", "vocabulary"], "sequence has too few answers; detail is strong");
    assert.equal(dailySeed("s1", new Date("2026-11-04T20:59:00Z")), "s1|2026-11-04");
    assert.equal(dailySeed("s1", new Date("2026-11-04T21:00:00Z")), "s1|2026-11-05", "a new Riyadh day at 21:00 UTC");
    assert.equal(mostMissed({ 1: "B", 2: "B", 3: "A" }, [{ number: 1, answer: "A", skill: "vocabulary" }, { number: 2, answer: "A", skill: "vocabulary" }, { number: 3, answer: "A", skill: "detail" }]), "vocabulary");
  });

  test("weak-skill pick: the article with the most questions of the weakest skill, with a reason", async () => {
    const recs = await recommendFor(repo, st[0].studentId!, st[0].schoolId!, cards, NOW);
    assert.equal(recs.length, 6);
    assert.ok(!recs.some((r) => r.articleId === A.readSci), "never a done article");
    assert.equal(new Set(recs.map((r) => r.articleId)).size, 6, "no duplicates");
    const skill = recs.filter((r) => r.reason.kind === "SKILL");
    assert.ok(skill.length >= 1, JSON.stringify(recs));
    assert.equal(skill[0].reason.skill, "inference");
    assert.equal(skill[0].articleId, A.inf, "INF has 5 inference questions in the MID band");
    assert.equal(skill[0].reason.label, "🎯 Practise: Inference");
    const nt = recs.filter((r) => r.reason.kind === "NEW_TOPIC" && r.reason.label === "🌍 New topic for you");
    assert.ok(nt.length >= 2 && nt.every((r) => r.reason.topic !== "Science"), "Science was read lately: not a new topic");
    // the caller's pre-read rows give the same list (one read per visit)
    const runs = await repo.findMany("RRRun", { studentId: st[0].studentId! });
    assert.deepEqual(await recommendFor(repo, st[0].studentId!, st[0].schoolId!, cards, NOW, 6, { runs, interests: [] }), recs);
    // single-flight: concurrent key reads share one promise
    const p1 = sharedKeys(repo, [A.inf, A.vocab]), p2 = sharedKeys(repo, [A.vocab, A.inf]);
    assert.equal(p1, p2);
    assert.equal((await p1).get(A.inf)?.length, 24);
    const t = makeT("ar");
    assert.ok(reasonLabel(skill[0].reason, t).length > 0);
  });

  test("interests: saved (max 3, real topics only) and picked with a reason", async () => {
    assert.deepEqual(await getInterests(repo, st[1].studentId!), []);
    await assert.rejects(setInterests(repo, st[1], ["Animals", "Food", "Art", "Space"]), /up to 3/);
    await assert.rejects(setInterests(repo, st[1], ["Dragons"]), /from the list/);
    await setInterests(repo, st[1], ["animals", "Food"]);
    assert.deepEqual(await getInterests(repo, st[1].studentId!), ["Animals", "Food"], "stored with the article topic's own spelling");
    const recs = await recommendFor(repo, st[1].studentId!, st[1].schoolId!, cards, NOW);
    const liked = recs.filter((r) => r.reason.kind === "INTEREST");
    assert.ok(liked.length >= 2, JSON.stringify(recs));
    assert.ok(liked.every((r) => ["Animals", "Food"].includes(r.reason.topic!)));
    assert.deepEqual(new Set(liked.slice(0, 2).map((r) => r.reason.topic)), new Set(["Animals", "Food"]), "two different liked topics first");
    assert.match(liked[0].reason.label, /^❤️ You like: /);
    assert.ok(!recs.some((r) => r.reason.kind === "SKILL"), "no reading yet: no weak skill");
  });

  test("daily shuffle: the same all day, different across days", async () => {
    const id = st[2].studentId!;
    const a = await recommendFor(repo, id, st[2].schoolId!, cards, NOW);
    const b = await recommendFor(repo, id, st[2].schoolId!, cards, new Date(NOW.getTime() + 6 * 3_600_000));
    assert.deepEqual(a, b, "same Riyadh day: same list");
    const orders = new Set<string>();
    for (let d = 0; d < 6; d++) orders.add((await recommendFor(repo, id, st[2].schoolId!, cards, new Date(NOW.getTime() + d * DAY))).map((r) => r.articleId).join(","));
    assert.ok(orders.size > 1, "another day: another order");
    const ids = cards.map((c) => c.id);
    assert.deepEqual(seededOrder(ids, "x|2026-11-04"), seededOrder(ids, "x|2026-11-04"));
    assert.notDeepEqual(ids.slice().sort(), seededOrder(ids, "x|2026-11-04"), "not alphabetical");
  });

  test("readNext priorities: teacher > new topic > skill > liked / same topic; never an article already run", async () => {
    const s = st[2];
    const base = { articleId: A.ocean, score: 90, firstTry: true, stretch: false, band: "MID", canStretch: true };
    await addRun(repo, s, A.ocean, { score: 90 });
    // teacher first (earliest due)
    const due = new Date(NOW.getTime() + 3 * DAY);
    await repo.create("RRClassArticle", { classId, articleId: A.art, assignedById: s.userId, dueAt: due });
    await repo.create("RRClassArticle", { classId, articleId: A.food, assignedById: s.userId, dueAt: new Date(NOW.getTime() + 9 * DAY) });
    const t1 = await readNext(repo, s.studentId!, s.schoolId!, base, NOW);
    assert.deepEqual([t1?.articleId, t1?.reason.kind, t1?.stretch], [A.art, "TEACHER", false]);
    assert.equal(t1?.reason.label, "📌 From your teacher · due Nov 7");
    assert.equal(t1?.title, "ART (800)", "round 7: the title of the version the student will read (their level)");
    // the teacher's article already done → the next one
    await addRun(repo, s, A.art, { score: 80 });
    assert.equal((await readNext(repo, s.studentId!, s.schoolId!, base, NOW))?.articleId, A.food);
    await repo.deleteMany("RRClassArticle", { classId });
    // round 7: never the same article "one level up" (the done screen's Stretch does that), even with a stretch allowed
    const t2 = await readNext(repo, s.studentId!, s.schoolId!, base, NOW);
    assert.ok(t2 && t2.articleId !== A.ocean && t2.articleId !== A.art && t2.stretch === false, JSON.stringify(t2));
    assert.equal(t2?.reason.kind, "NEW_TOPIC");
    assert.ok(!/one level up/.test(t2!.reason.label));
    // 75%+ without a stretch → a new topic (not Oceans, not Art: read lately)
    const t3 = await readNext(repo, s.studentId!, s.schoolId!, { ...base, canStretch: false }, NOW);
    assert.equal(t3?.reason.kind, "NEW_TOPIC");
    assert.ok(t3 && ![A.ocean, A.art].includes(t3.articleId) && t3.stretch === false);
    // 50–74%: the skill missed most in THIS reading (vocabulary) → the article with the most vocabulary questions
    await addRun(repo, s, A.readSci, { right: [1, 2, 3, 4, 5, 6], at: ago(0.5) }); // 7, 8 (vocabulary) wrong
    const t4 = await readNext(repo, s.studentId!, s.schoolId!, { ...base, articleId: A.readSci, score: 63, canStretch: false }, NOW);
    assert.deepEqual([t4?.articleId, t4?.reason.kind, t4?.reason.skill], [A.vocab, "SKILL", "vocabulary"]);
    // never an open article
    await addRun(repo, s, A.vocab, { step: "QUIZ" });
    const t5 = await readNext(repo, s.studentId!, s.schoolId!, { ...base, articleId: A.readSci, score: 63, canStretch: false }, NOW);
    assert.ok(t5 && t5.articleId !== A.vocab);
    // < 50%: a topic they like at their level (round 7: the "You like" reason); a hidden article is never offered
    await setInterests(repo, s, ["Animals"]);
    const t6 = await readNext(repo, s.studentId!, s.schoolId!, { ...base, score: 30, canStretch: false }, NOW);
    assert.deepEqual([t6?.reason.kind, t6?.reason.topic], ["INTEREST", "Animals"]);
    assert.ok([A.ani1, A.ani2].includes(t6!.articleId));
    await repo.create("SchoolSetting", { schoolId: s.schoolId!, key: "readrise.hidden", value: [A.ani1, A.ani2] });
    const t7 = await readNext(repo, s.studentId!, s.schoolId!, { ...base, score: 30, canStretch: false }, NOW);
    assert.ok(t7 && ![A.ani1, A.ani2].includes(t7.articleId), "hidden articles are never offered");
    await repo.deleteMany("SchoolSetting", { schoolId: s.schoolId!, key: "readrise.hidden" });
  });

  test("key words → My Words (idempotent) and the warm-up", async () => {
    const kw = ["habitat", "migrate", "predator", "Shelter,", "food chain"].map((w, i) => ({ word: w, partOfSpeech: "noun", definition: `definition ${i}`, example: `example ${i}` }));
    const id = await makeArticle(repo, "KW", "Nature", DEFAULT_SKILLS, [...kw, { word: "habitat" }, { word: "!!" }]);
    assert.deepEqual(keyWordsOf(kw).map((k) => k.word), ["habitat", "migrate", "predator", "shelter", "food chain"]);
    const s = st[1];
    await repo.create("StudentWord", { studentId: s.studentId!, word: "predator", lookups: 3, firstAt: ago(20), lastAt: ago(20), quizRight: 0, quizWrong: 0 });
    assert.equal(await carryKeyWords(repo, s.studentId!, id, "MID", NOW), 4, "predator was already there");
    assert.equal(await carryKeyWords(repo, s.studentId!, id, "MID", NOW), 0, "idempotent");
    const rows = await repo.findMany("StudentWord", { studentId: s.studentId! });
    const hab = rows.find((r) => r.word === "habitat")!;
    assert.equal(Number(hab.lookups), 1);
    assert.equal(new Date(String(hab.nextReviewAt instanceof Date ? hab.nextReviewAt.toISOString() : hab.nextReviewAt)).getTime(), NOW.getTime() + DAY);
    const pred = rows.find((r) => r.word === "predator")!;
    assert.equal(Number(pred.lookups), 3, "an existing word keeps its lookups");
    assert.equal(new Date(String(pred.lastAt instanceof Date ? pred.lastAt.toISOString() : pred.lastAt)).getTime(), NOW.getTime(), "…and gets a new lastAt");
    assert.ok(await repo.findUnique("WordEntry", { schoolId: s.schoolId!, word: "habitat" }), "the definition is in the school's dictionary for My Words");
    assert.equal(await carryKeyWords(repo, s.studentId!, id, "HIGH", NOW), 0, "no key words in that band");
    // warm-up from the previous finished article
    await addRun(repo, s, id, { at: ago(0.2) });
    const qs = await wordWarmup(repo, s.studentId!, NOW);
    assert.equal(qs.length, 2);
    for (const q of qs) {
      assert.equal(q.options.length, 4);
      assert.equal(q.options[q.answer], q.word);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(q.definition, kw.find((k) => k.word.toLowerCase().replace(/,$/, "") === q.word)!.definition);
    }
    assert.deepEqual(await wordWarmup(repo, s.studentId!, NOW), qs, "stable");
    assert.deepEqual(await wordWarmup(repo, "nobody", NOW), []);
  });

  test("teacher signals: 🔴 not reading · 🟠 reading below 75% · 📉 goal missed 2 weeks in a row", async () => {
    const now = NOW.getTime();
    const run = (d: number, score: number, i: number) => ({ studentId: "s", articleId: `a${i}`, band: "MID", firstTry: true, stretch: false, score, completedAt: ago(d), unreliable: false });
    const st0 = { placedAt: now - 60 * DAY, weeklyGoal: 2 };
    // not reading: the last counted reading 20 days ago; a re-read or an unreliable run does not count
    const a = readingSignals([run(20, 90, 1), { ...run(2, 90, 1), firstTry: false }, { ...run(1, 90, 3), unreliable: true }], st0, [], now);
    assert.deepEqual([a.notReading, a.daysSinceReading], [true, 20]);
    assert.equal(readingSignals([run(3, 90, 1)], st0, [], now).notReading, false);
    assert.equal(readingSignals([], { ...st0, placedAt: now - 3 * DAY }, [], now).notReading, false, "just placed");
    // reading, below 75%: 4 tries in 28 days, none at 75%+, no level change
    const low = [run(2, 60, 1), run(5, 50, 2), run(9, 70, 3), run(20, 62, 4)];
    assert.equal(readingSignals(low, st0, [], now).belowGoal, true);
    assert.equal(readingSignals(low.slice(0, 3), st0, [], now).belowGoal, false, "only 3 tries");
    assert.equal(readingSignals([...low, run(4, 80, 5)], st0, [], now).belowGoal, false, "one at 75%+");
    assert.equal(readingSignals(low, st0, [now - 10 * DAY], now).belowGoal, false, "the level moved");
    // the weekly goal (engine goalDates): missed in both of the last two full weeks
    const m = readingSignals(low, st0, [], now);
    assert.equal(m.missedGoal2w, true);
    assert.deepEqual(m.lastWeeks, [0, 0]);
    // last week (Sun 26 Oct – Sat 1 Nov) met with two 75%+ first tries
    const met = readingSignals([run(5, 80, 7), run(6, 90, 8)], st0, [], now);
    assert.deepEqual([met.missedGoal2w, met.lastWeeks[1]], [false, 2]);
    assert.equal(readingSignals([], { ...st0, placedAt: now - 8 * DAY }, [], now).missedGoal2w, false, "not placed for two full weeks yet");

    // the class report lists them
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const r = await readRiseTeacherReport(repo, admin, classId, NOW);
    const nr = new Set(r.notReading.map((x) => x.studentId));
    assert.ok(!nr.has(st[2].studentId!) && !nr.has(st[0].studentId!), "read lately");
    assert.equal(r.summary.notReading, r.notReading.length);
    assert.ok(r.missedGoal.some((x) => x.studentId === st[0].studentId), "st[0]: no week at the goal");
    assert.ok(r.students.every((x) => !x.placed || x.signals));
  });
});
