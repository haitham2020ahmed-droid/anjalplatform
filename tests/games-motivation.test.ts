/**
 * Games Part 3 — Motivation (in-memory Demo School; invented students only):
 *  coins (earn, idempotent per event, daily game cap) · Avatar Shop (fixed prices, not enough coins, badge-locked items)
 *  · teacher bonus (own class only) · badges (automatic, favorite emblem, avatar unlocks, Live Challenge hooks)
 *  · Question of the Day (one level above, one attempt, no level / mastery change, a new one every day)
 *  · certificates (automatic on level up and plan completion, manual by the teacher, listed in Reports)
 *  · the top bar stays cheap (one cached read) · interface text in English and Arabic.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo, Row } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { assignPlan } from "../src/server/plans/wizard";
import { loadQuestionItems, type PracticeItem } from "../src/server/practice/items";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { awardCoins, emblemsFor, GAME_DAILY_CAP, giveBonusCoins, rewardChip, COINS, ksaDay } from "../src/server/motivation/coins";
import { buyItem, equipAvatar, ownedItems, shopView } from "../src/server/motivation/shop";
import { evaluateBadges, recordLiveChallengePlayed, recordLiveChallengeWin, setFavoriteBadge } from "../src/server/motivation/badges";
import { answerQuestionOfTheDay, questionOfTheDay, qotdTarget } from "../src/server/motivation/qotd";
import { certificateFor, certificateHtml, listCertificates, manualCertificate } from "../src/server/motivation/certificates";
import { syncRewards } from "../src/server/motivation/sync";
import { SHOP_ITEMS, toAvatar } from "../src/lib/avatar";
import { BADGES } from "../src/lib/badge-catalog";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2027-01-10T08:00:00Z");
const DAY = 86_400_000;
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

function counting(repo: Repo): { repo: Repo; calls: () => number } {
  let n = 0;
  const r = new Proxy(repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === "function" ? (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(target, a); } : v; } });
  return { repo: r as Repo, calls: () => n };
}

/** a right (or wrong) answer for the auto-marked types */
function answerFor(it: PracticeItem, right: boolean): unknown {
  if (it.options) {
    if (it.type === "MULTI_SELECT") return right ? it.options.filter((o) => o.correct).map((o) => o.label) : [it.options.find((o) => !o.correct)!.label];
    return (it.options.find((o) => o.correct === right) ?? it.options[0]).label;
  }
  if (it.type === "TRUE_FALSE") return right ? it.answer : !it.answer;
  if (it.type === "FILL_BLANK") return right ? it.answers![0] : "zzzz";
  if (it.sequence) return right ? it.sequence : [...it.sequence].reverse();
  return null;
}

describe("Games Part 3: motivation", () => {
  let repo: SqliteRepo;
  let t4: Actor, t4b: Actor;
  let class4 = "", class4b = "";
  let a = "", b = "", c = "", other = "";
  let A: Actor, B: Actor, C: Actor;
  let skill = "";
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id }))!.userId) }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", {})).filter((q) => /^G4-/.test(String(q.externalRef)));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    t4 = await actorFor("demo.teacher.4a"); t4b = await actorFor("demo.teacher.4b");
    const cur = (await teacherCurriculum(repo, t4))!;
    class4 = cur.classId;
    class4b = (await teacherCurriculum(repo, t4b))!.classId;
    [a, b, c] = (await repo.findMany("ClassMembership", { classId: class4, leftAt: null })).map((m) => String(m.studentId)).sort();
    other = String((await repo.findMany("ClassMembership", { classId: class4b, leftAt: null }))[0].studentId);
    A = await studentActor(a); B = await studentActor(b); C = await studentActor(c);
    // one Grade 4 skill with a multiple-choice question, copied to levels 4, 5 and 6 (3 each) so every target exists
    const mcType = String((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const ids = new Set(cur.units.flatMap((u) => u.skills).map((k) => k.id));
    const mc = g4.find((q) => ids.has(String(q.skillId)) && String(q.typeId) === mcType)!;
    skill = String(mc.skillId);
    const { id: _id, ...rest } = (await repo.findUnique("Question", { id: mc.id }))!; void _id;
    const [opts, answers, expl] = await Promise.all(["QuestionOption", "QuestionAnswer", "QuestionExplanation"].map((m) => repo.findMany(m, { questionId: mc.id })));
    for (const lv of [4, 5, 6]) for (let i = 0; i < 3; i++) {
      const q = await repo.create("Question", { ...rest, externalRef: `MOTIV-${lv}-${i}`, stem: `${String(rest.stem)} (L${lv}.${i})`, difficultyLevel: lv });
      for (const [m, rows] of [["QuestionOption", opts], ["QuestionAnswer", answers], ["QuestionExplanation", expl]] as const) for (const r of rows) { const { id: _x, ...copy } = r; void _x; await repo.create(m, { ...copy, questionId: q.id }); }
    }
    await assignSkill(repo, t4, { classId: class4, skillId: skill }, NOW);
    await repo.upsert("StudentLevel", { studentId: a }, { studentId: a, level: "BELOW", source: "TEACHER", setById: null }, { level: "BELOW" });
    await repo.upsert("StudentLevel", { studentId: b }, { studentId: b, level: "ON", source: "TEACHER", setById: null }, { level: "ON" });
    await repo.upsert("StudentLevel", { studentId: c }, { studentId: c, level: "ABOVE", source: "TEACHER", setById: null }, { level: "ABOVE" });
  });

  test("coins: earned once per event (idempotent), games capped per day, unknown reasons refused", async () => {
    const r1 = await awardCoins(repo, a, "work", 10, "asg-test-1", { now: NOW });
    const r2 = await awardCoins(repo, a, "work", 10, "asg-test-1", { now: NOW });
    assert.equal(r1.awarded, 10); assert.equal(r2.awarded, 0); assert.ok(r2.duplicate);
    assert.equal(await repo.count("CoinLedger", { studentId: a, reason: "work", refId: "asg-test-1" }), 1, "one ledger row per event");
    // games and Live Challenge pay fewer coins: a shared daily cap
    const g1 = await awardCoins(repo, a, "game", 20, "game-1", { now: NOW });
    const g2 = await awardCoins(repo, a, "game", 20, "game-2", { now: NOW });
    const g3 = await awardCoins(repo, a, "live", 3, "live-x", { now: NOW });
    assert.equal(g1.awarded + g2.awarded + g3.awarded, GAME_DAILY_CAP);
    assert.equal(g3.awarded, 0); assert.equal(await repo.count("CoinLedger", { studentId: a, reason: "live", refId: "live-x" }), 1, "still recorded (0 coins) for the badges");
    assert.equal((await awardCoins(repo, a, "game", 3, "game-next-day", { now: new Date(NOW.getTime() + DAY) })).awarded, 3, "a new day, new game coins");
    await assert.rejects(awardCoins(repo, a, "shop" as never, 5, "x"), /Unknown reason/);
    await assert.rejects(awardCoins(repo, a, "work", 0, "y"), /positive/);
    assert.equal((await rewardChip(repo, a)).coins, 10 + GAME_DAILY_CAP + 3);
  });

  test("Avatar Shop: fixed prices, not enough coins refused, never twice, badge items cannot be bought, wear owned only", async () => {
    await awardCoins(repo, a, "mastered", 30, "skill-test-1", { now: NOW });
    const fox = SHOP_ITEMS.find((i) => i.code === "fox")!, panda = SHOP_ITEMS.find((i) => i.code === "panda")!;
    const before = (await rewardChip(repo, a)).coins;
    assert.ok(before >= fox.price && before < fox.price + panda.price);
    assert.equal((await buyItem(repo, A, "fox", NOW)).coins, before - fox.price, "the fixed price is taken");
    await assert.rejects(buyItem(repo, A, "fox", NOW), /already have/);
    await assert.rejects(buyItem(repo, A, "panda", NOW), /Not enough coins/);
    assert.equal((await rewardChip(repo, a)).coins, before - fox.price, "a refused purchase costs nothing");
    await assert.rejects(buyItem(repo, A, "crown", NOW), /badge/, "badge items are earned, not bought");
    await assert.rejects(buyItem(repo, A, "mystery-box", NOW), /not in the shop/);
    await assert.rejects(buyItem(repo, t4, "fox", NOW), ForbiddenError);
    await assert.rejects(equipAvatar(repo, A, { base: "panda", color: "sky", hat: null, glasses: null }), /Buy this item first/);
    const worn = await equipAvatar(repo, A, { base: "fox", color: "teal", hat: null, glasses: null });
    assert.equal(worn.base, "fox");
    assert.equal((await rewardChip(repo, a)).avatar.base, "fox", "the top bar shows the new avatar at once");
    const v = await shopView(repo, A);
    assert.ok(v.items.find((i) => i.code === "fox")!.owned && v.items.find((i) => i.code === "cat")!.owned, "free + bought");
    assert.equal(v.items.find((i) => i.code === "crown")!.lockedBy, "game-champion");
    assert.ok(SHOP_ITEMS.every((i) => Number.isInteger(i.price) && i.price >= 0), "fixed whole-coin prices, no random items");
  });

  test("teacher bonus coins: a student or the whole class — own class only", async () => {
    const c0 = (await rewardChip(repo, c)).coins;
    const r = await giveBonusCoins(repo, t4, { classId: class4, studentIds: [c], amount: 15, note: "Great reading" }, NOW);
    assert.deepEqual(r, { students: 1, amount: 15 });
    assert.equal((await rewardChip(repo, c)).coins, c0 + 15);
    const whole = await giveBonusCoins(repo, t4, { classId: class4, amount: 5 }, NOW);
    assert.equal(whole.students, 3);
    assert.equal(await repo.count("CoinLedger", { reason: "bonus", studentId: b }), 1);
    await assert.rejects(giveBonusCoins(repo, t4, { classId: class4b, amount: 5 }, NOW), ForbiddenError, "another teacher's class");
    await assert.rejects(giveBonusCoins(repo, t4, { classId: class4, studentIds: [other], amount: 5 }, NOW), ForbiddenError, "a student of another class");
    await assert.rejects(giveBonusCoins(repo, t4, { classId: class4, amount: 500 }, NOW), /between 1 and 50/);
    await assert.rejects(giveBonusCoins(repo, A, { classId: class4, amount: 5 }, NOW), ForbiddenError);
    assert.ok(await repo.count("AuditLog", { action: "coins.bonus" }) >= 2, "audited");
  });

  test("Question of the Day: ONE level above (Below→On, On→Above, Above→hardest), the same all day", async () => {
    assert.deepEqual(qotdTarget("BELOW").tag, "ON"); assert.deepEqual(qotdTarget("ON").tag, "ABOVE"); assert.deepEqual(qotdTarget("ABOVE").tag, "HARDEST"); assert.equal(qotdTarget(null).tag, "ABOVE");
    const lv = async (who: Actor) => { const q = (await questionOfTheDay(repo, who, NOW))!; return { q, d: Number((await repo.findUnique("Question", { id: q.question.questionId }))!.difficultyLevel), skill: String((await repo.findUnique("Question", { id: q.question.questionId }))!.skillId) }; };
    const qa = await lv(A), qb = await lv(B), qc = await lv(C);
    assert.equal(qa.d, 4, "Below Level student → an On Level question"); assert.equal(qa.q.level, "ON");
    assert.ok(qb.d >= 5, "On Level student → an Above Level question"); assert.equal(qb.q.level, "ABOVE");
    assert.equal(qc.d, 6, "Above Level student → the hardest Above questions"); assert.equal(qc.q.level, "HARDEST");
    assert.equal(qa.skill, skill, "from a skill of My Work");
    assert.equal((await questionOfTheDay(repo, A, new Date(NOW.getTime() + 3_600_000)))!.question.questionId, qa.q.question.questionId, "the same question all day");
    assert.ok(!qa.q.answered && qa.q.result === null);
  });

  test("Question of the Day: one attempt, big reward when right, answer + explanation when wrong, never changes levels or mastery", async () => {
    const snap = async (sid: string) => JSON.stringify([await repo.findUnique("StudentLevel", { studentId: sid }), await repo.findMany("StudentSkillMastery", { studentId: sid }), await repo.count("QuestionAttempt", { studentId: sid }), await repo.count("AuditLog", { entityType: "Student", entityId: sid, action: { in: ["level.change", "level.pending"] } })].map((x) => (x && typeof x === "object" && "updatedAt" in (x as Row) ? { ...(x as Row), updatedAt: null } : x)));
    const beforeA = await snap(a), beforeB = await snap(b);
    const qa = (await questionOfTheDay(repo, A, NOW))!, qb = (await questionOfTheDay(repo, B, NOW))!;
    const [ia] = await loadQuestionItems(repo, [qa.question.questionId]);
    const [ib] = await loadQuestionItems(repo, [qb.question.questionId]);
    const coinsA = (await rewardChip(repo, a)).coins, coinsB = (await rewardChip(repo, b)).coins;
    const ra = await answerQuestionOfTheDay(repo, A, qa.question.questionId, answerFor(ia, true), NOW);
    assert.equal(ra.correct, 1); assert.equal(ra.coins, COINS.qotdRight);
    assert.equal((await rewardChip(repo, a)).coins, coinsA + COINS.qotdRight, "correct = a big coin reward");
    await assert.rejects(answerQuestionOfTheDay(repo, A, qa.question.questionId, answerFor(ia, true), NOW), /already answered/, "one attempt");
    const rb = await answerQuestionOfTheDay(repo, B, qb.question.questionId, answerFor(ib, false), NOW);
    assert.equal(rb.correct, 0); assert.equal(rb.coins, COINS.qotdTry, "effort counts a little");
    assert.ok(rb.review[0].correctAnswer.length > 0, "wrong = the correct answer is shown");
    const after = (await questionOfTheDay(repo, B, NOW))!;
    assert.ok(after.answered && after.result && !after.result.correct && after.result.correctAnswer, "after answering: one line with the answer and explanation");
    assert.equal((await rewardChip(repo, b)).coins, coinsB + COINS.qotdTry);
    assert.equal(await snap(a), beforeA, "levels, mastery, attempts and level history unchanged");
    assert.equal(await snap(b), beforeB);
    assert.equal(await repo.count("QotdAnswer", { studentId: a, day: ksaDay(NOW) }), 1);
  });

  test("Question of the Day: a new question every day (Saudi days)", async () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 5; d++) {
      const q = (await questionOfTheDay(repo, A, new Date(NOW.getTime() + d * DAY)))!;
      assert.ok(!q.answered, `day ${d} is open again`);
      seen.add(q.question.questionId);
    }
    assert.ok(seen.size >= 2, "the question changes from day to day");
  });

  test("badges: earned automatically, Quiz Whiz unlocks Gold, favorite emblem; Live Challenge hooks (Game Champion → crown)", async () => {
    for (let d = 1; d <= 10; d++) await repo.create("QotdAnswer", { studentId: a, day: `2026-12-${String(d).padStart(2, "0")}`, questionId: "q", skillId: null, level: "ON", correct: true, createdAt: new Date(NOW.getTime() - d * DAY) });
    assert.ok(!(await ownedItems(repo, a)).owned.has("gold"));
    await assert.rejects(setFavoriteBadge(repo, A, "quiz-whiz"), /Earn this badge first/);
    const got = await evaluateBadges(repo, a, NOW);
    assert.ok(got.includes("quiz-whiz") && got.includes("daily-thinker"), `new badges: ${got.join(",")}`);
    assert.deepEqual(await evaluateBadges(repo, a, new Date(NOW.getTime() + 1000)), [], "earned once");
    assert.ok((await ownedItems(repo, a)).owned.has("gold"), "the badge unlocks a special item");
    await equipAvatar(repo, A, { base: "fox", color: "gold", hat: null, glasses: null });
    await setFavoriteBadge(repo, A, "quiz-whiz");
    const chip = await rewardChip(repo, a);
    assert.equal(chip.favoriteBadge, "quiz-whiz"); assert.equal(chip.avatar.color, "gold");
    await assert.rejects(setFavoriteBadge(repo, A, "game-champion"), /Earn this badge first/);
    await assert.rejects(setFavoriteBadge(repo, t4, "quiz-whiz"), ForbiddenError);
    // Live Challenge (GFOUND calls these)
    const win = await recordLiveChallengeWin(repo, b, "live-game-1", NOW);
    assert.ok(win.badges.includes("game-champion"));
    assert.deepEqual((await recordLiveChallengeWin(repo, b, "live-game-1", NOW)).coins, 0, "once per game");
    assert.ok((await ownedItems(repo, b)).owned.has("crown"));
    assert.equal((await recordLiveChallengePlayed(repo, c, "live-game-1", NOW)).coins, COINS.live);
    // the emblem for the Live Board and the teacher's class list: one read for many students
    const cnt = counting(repo);
    const m = await emblemsFor(cnt.repo, [a, b, c]);
    assert.equal(cnt.calls(), 1);
    assert.equal(m.get(a)!.badge, "quiz-whiz"); assert.equal(m.get(a)!.avatar.color, "gold"); assert.equal(m.get(c)!.badge, null);
  });

  test("certificates: automatic on level up and plan completion (once), manual for own students, listed in Reports", async () => {
    await repo.create("AuditLog", { actorId: null, action: "level.change", entityType: "Student", entityId: a, before: { level: "BELOW" }, after: { level: "ON", source: "ADAPTIVE", outcome: "CHANGED", category: "ACS" }, createdAt: new Date(NOW.getTime() - 3_600_000) });
    const coins0 = (await rewardChip(repo, a)).coins;
    const s1 = (await syncRewards(repo, a, NOW, { force: true }))!;
    assert.ok(s1.certificates >= 1);
    const certs = await listCertificates(repo, A);
    const up = certs.find((x) => x.kind === "LEVEL_UP")!;
    assert.match(up.title, /Moved up to On Level/);
    assert.ok((await rewardChip(repo, a)).coins >= coins0 + COINS.levelup, "moving up pays coins");
    const s2 = (await syncRewards(repo, a, new Date(NOW.getTime() + 1000), { force: true }))!;
    assert.equal(s2.certificates, 0); assert.equal(s2.newCoins, 0, "never twice");
    assert.equal(await syncRewards(repo, a, new Date(NOW.getTime() + 2000)), null, "throttled between events");
    // a plan finished
    const plan = await assignPlan(repo, t4, { classId: class4, studentIds: [b], type: "CUSTOM", skillIds: [skill], title: "Bridge plan" }, NOW);
    await repo.updateMany("AssignmentStudent", { studentId: b, assignmentId: { in: plan.assignmentIds } }, { status: "COMPLETED", progress: 1, completedAt: NOW });
    const sb = (await syncRewards(repo, b, NOW, { force: true }))!;
    assert.ok(sb.certificates >= 1 && sb.newCoins >= COINS.plan + COINS.work);
    assert.ok((await listCertificates(repo, B)).some((x) => x.kind === "PLAN" && /Bridge plan/.test(x.title)));
    // manual, own students only
    const id = await manualCertificate(repo, t4, { studentId: a, title: "Star reader of the month" }, NOW);
    await assert.rejects(manualCertificate(repo, t4b, { studentId: a, title: "Nope" }, NOW), ForbiddenError);
    await assert.rejects(manualCertificate(repo, t4, { studentId: a, title: "x" }, NOW), /3–120/);
    assert.ok((await listCertificates(repo, A)).some((x) => x.id === id && x.byTeacher));
    assert.ok((await listCertificates(repo, t4, a)).length >= 2, "the teacher sees them on the student page");
    await assert.rejects(certificateFor(repo, B, id), ForbiddenError, "another student cannot open it");
    await assert.rejects(listCertificates(repo, t4b, a), ForbiddenError);
    // the printable page: name, achievement, date, school name; Arabic version too
    const d = await certificateFor(repo, A, id);
    const branding = { name: "Demo International School", nameAr: null, logo: null };
    const en = certificateHtml(d, branding, "en", { css: "", stack: "sans-serif" });
    for (const x of ["Certificate of Achievement", d.studentName, "Star reader of the month", "Demo International School", "@page{size:A4 landscape"]) assert.ok(en.includes(x), x);
    assert.doesNotMatch(en, /<script/i);
    const arHtml = certificateHtml(await certificateFor(repo, A, up.id), branding, "ar", { css: "", stack: "sans-serif" });
    assert.match(arHtml, /dir="rtl"/); assert.ok(arHtml.includes(ar["Certificate of Achievement"])); assert.ok(arHtml.includes(ar["On Level"]));
    // Reports lists them
    assert.match(read("src/app/student/reports/page.tsx"), /listCertificates\(repo, actor\)[\s\S]*<CertificateList/);
  });

  test("the top bar: avatar + coins + emblem in one cached read; Question of the Day under the welcome line; no new tiles", async () => {
    const cnt = counting(repo);
    await rewardChip(cnt.repo, other);
    await rewardChip(cnt.repo, other);
    assert.equal(cnt.calls(), 1, "one read, then cached");
    const shell = read("src/components/app-shell.tsx");
    assert.match(shell, /<RewardChip studentId=/);
    const page = read("src/app/student/page.tsx");
    const welcome = page.indexOf('data-testid="welcome"'), qotd = page.indexOf("<QotdCard"), work = page.indexOf('id="my-work"');
    assert.ok(welcome > 0 && qotd > welcome && qotd < work, "the card sits under the welcome line");
    assert.equal((page.match(/<BigTile /g) ?? []).length, 8, "no new tiles on the student home");
    assert.equal(toAvatar("not json").base, "cat"); assert.equal(toAvatar({ base: "nope", hat: "crown" }).hat, "crown");
  });

  test("interface text in English and Arabic; original names only", () => {
    const en = new Set<string>(UI_STRINGS);
    for (const b of BADGES) { assert.ok(en.has(b.name) && en.has(b.description), b.code); assert.ok(ar[b.name as keyof typeof ar], b.code); }
    for (const i of SHOP_ITEMS) assert.ok(en.has(i.name) && ar[i.name as keyof typeof ar], i.code);
    for (const s of ["Avatar Shop", "Question of the Day", "My Certificates", "Give bonus coins", "Certificate of Achievement"]) assert.ok(/[؀-ۿ]/.test(ar[s as keyof typeof ar]), s);
    assert.match(read("src/i18n/en.ts"), /\/\/ ---- motivation \(part 3\)/);
    assert.match(read("src/i18n/ar.ts"), /\/\/ ---- motivation \(part 3\)/);
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
    const motiv = ["src/components/motivation/avatar.tsx", "src/components/motivation/avatar-shop.tsx", "src/components/motivation/reward-chip.tsx", "src/components/student/qotd.tsx", "src/server/motivation/qotd.ts", "src/server/motivation/certificates.ts"].map(read).join("\n");
    assert.doesNotMatch(motiv, /Lexile|Kahoot|Blooket|Pok[eé]mon|Minecraft|Roblox|Mario/i);
    assert.doesNotMatch(read("src/components/motivation/avatar.tsx"), /<image|href=|\.png|\.jpg/, "code-drawn, no images");
  });
});
