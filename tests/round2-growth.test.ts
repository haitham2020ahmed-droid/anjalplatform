/**
 * Round 2 · growth group: every growth / progress report reads the ONE definition —
 *  - questions / accuracy / minutes = practiceTotals (the Practice and time numbers, rapid guesses left out);
 *  - growth = the change of the STARS in the period (starChange / starPairs), never the engine's score change;
 *  - a ⭐ skill is never shown going down; "completed this week" = ⭐ earned this week by key.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Period } from "../src/analytics/periods";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { classComparison, studentAnalytics } from "../src/server/analytics/reports";
import { practiceTotalsFor } from "../src/server/analytics/practice-totals";
import { clearSkillKeys, skillKeyIndex } from "../src/server/skills/status";
import { starChange, starChangeOf, starPairs } from "../src/server/skills/star-read";
import { bySourceReport } from "../src/server/skills/skills-by-source";
import { weeklySummaries } from "../src/reports/weekly-summary";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

describe("round 2 · growth = stars, numbers = practiceTotals", () => {
  let repo: SqliteRepo; let admin: Actor; let classId = ""; let s1 = ""; let s2 = ""; let schoolId = "";
  const keys: { key: string; skillId: string; name: string }[] = [];
  const week: Period = { name: "CUSTOM", label: "Last 7 days", from: ago(7), to: new Date() } as Period;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const id = async (u: string) => s((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: u }))!.id }))!.id);
    s1 = await id("demo.s1001"); s2 = await id("demo.s1002");
    classId = s((await repo.findMany("ClassMembership", { studentId: s1 }))[0].classId);
    schoolId = s((await repo.findUnique("Student", { id: s2 }))!.schoolId);
    // s1 practises (real answers through the practice service) inside the week
    await simulatePractice(repo, ["demo.s1001"], [{ date: ago(3).toISOString().slice(0, 10), skill: "G4.theme" }]);
    // one rapid guess: counted as a question, never in the accuracy
    const one = (await repo.findMany("QuestionAttempt", { studentId: s1 }))[0];
    await repo.updateMany("QuestionAttempt", { id: one.id }, { rapidGuess: true });
    // s2: hand-made stars (by key)
    clearSkillKeys(repo);
    const ix = await skillKeyIndex(repo, schoolId);
    for (const [key, list] of ix.skillsOf) { if (!key.startsWith("solo:") && list.length && keys.length < 4) keys.push({ key, skillId: list[0], name: ix.nameOf.get(key) ?? "" }); }
    const h = (...e: [number, string][]) => JSON.stringify(e.map(([d, status]) => ({ at: ago(d).toISOString(), status, why: "practice" })));
    const row = (k: (typeof keys)[number], status: string, started: number, mastered: number | null, history?: string) =>
      repo.create("SkillStatus", { studentId: s2, skillKey: k.key, level: 1, status, skillId: k.skillId, answered: 30, correct: 26, score: 90, startedAt: ago(started), masteredAt: mastered === null ? null : ago(mastered), updatedAt: new Date(), ...(history ? { history } : {}) });
    await row(keys[0], "MASTERED", 30, 3);                                                          // ⭐ earned this week
    await row(keys[1], "MASTERED", 40, 20);                                                         // ⭐ long ago: same
    await row(keys[2], "NEEDS_REVIEW", 30, null, h([30, "IN_PROGRESS"], [25, "MASTERED"], [2, "NEEDS_REVIEW"])); // ⭐ → 🔄
    await row(keys[3], "MASTERED", 30, 5, h([30, "IN_PROGRESS"], [20, "MASTERED"], [12, "IN_PROGRESS"], [5, "MASTERED"]));
    // the engine's old flag this week WITHOUT a star must not be "completed"
    await repo.create("StudentSkillMastery", { studentId: s2, skillId: keys[1].skillId, score: 99, attempts: 30, correct: 29, isMastered: true, masteredAt: ago(1), updatedAt: new Date() });
  });

  test("starPairs + starChangeOf give exactly starChange", async () => {
    const [pairs, change] = await Promise.all([starPairs(repo, [s1, s2], week.from, week.to), starChange(repo, [s1, s2], week.from, week.to)]);
    for (const id of [s1, s2]) assert.deepEqual(starChangeOf(pairs.get(id)!), change.get(id));
    const c2 = change.get(s2)!;
    assert.equal(c2.toReview, 1);
  });

  test("student analytics: questions / accuracy / minutes = practiceTotals; growth = the stars", async () => {
    const a = await studentAnalytics(repo, admin, s1, week);
    const tot = await practiceTotalsFor(repo, s1, week.from, week.to, { days: true });
    assert.ok(tot.questions > 0);
    assert.deepEqual([a.questions, a.accuracyPct, a.minutes, a.bySource], [tot.questions, tot.accuracy, tot.minutes, tot.bySource]);
    // Nov 2026 redesign: the "rapid guess" marked on this answer is well above the misclick floor (a real, timed
    // answer), so it now counts in full toward correct/incorrect like any other answer — only a literal instant
    // misclick counts as neither any more
    assert.equal(a.correct + a.incorrect, a.questions, "a merely fast answer is no longer neither right nor wrong");
    assert.ok(!("growth" in a), "no engine growth object");

    const b = await studentAnalytics(repo, admin, s2, week);
    const want = (await starChange(repo, [s2], week.from, week.to)).get(s2)!;
    assert.deepEqual(b.starChange, want);
    assert.equal(b.starChange.gained, 2, "keys[0] and keys[3] (◐ at the week start) earned ⭐ this week");
    assert.deepEqual(new Set(b.starSkills.slice(0, 2).map((x) => x.key)), new Set([keys[0].key, keys[3].key]), "the ⭐ earned this period come first");
    assert.ok(b.starSkills.slice(0, 2).every((x) => x.then === "IN_PROGRESS" && x.now === "MASTERED"));
    for (const f of ["questions", "accuracyPct", "minutes", "starChange", "bySource", "skillsMastered", "skillsDeveloping", "skillsNeedingIntervention", "curriculumProgressPct", "importedMap"]) assert.ok(f in b, f);
  });

  test("class comparison: star change per student, no engine growth", async () => {
    const c = await classComparison(repo, admin, classId, week);
    const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId));
    const ch = await starChange(repo, ids, week.from, week.to);
    const gained = [...ch.values()].reduce((t, x) => t + x.gained, 0);
    assert.equal(c.classStars.gained, gained);
    assert.equal(c.rows[0].starsGained, gained);
    assert.ok(c.classStars.skills.some((k) => k.key === keys[0].key && k.gained >= 1));
    assert.ok(!("meanGrowth" in c.rows[0]) && !("classGrowth" in c));
  });

  test("skills by source: the arrow is the star then → now; never ↓ on a ⭐ skill", async () => {
    const past: Period = { name: "CUSTOM", label: "x", from: ago(15), to: ago(10) } as Period;
    const r = await bySourceReport(repo, admin, s2, past);
    const row = (k: string) => r.groups.flatMap((g) => g.skills).find((x) => x.key === k)!;
    // keys[3]: ⭐ at the start, ◐ at the end of that past period — but ⭐ now: never shown going down
    assert.deepEqual([row(keys[3].key).starThen, row(keys[3].key).starNow], ["MASTERED", "IN_PROGRESS"]);
    assert.equal(row(keys[3].key).trend, "FLAT");
    const now = await bySourceReport(repo, admin, s2, week);
    const rows = now.groups.flatMap((g) => g.skills);
    assert.equal(rows.find((x) => x.key === keys[0].key)!.trend, "UP");
    assert.equal(rows.find((x) => x.key === keys[2].key)!.trend, "DOWN", "⭐ → 🔄 (not ⭐ now) is a star going down");
    assert.ok(rows.every((x) => !(x.trend === "DOWN" && (x.status === "MASTERED" || x.status === "NEXT_LEVEL"))));
  });

  test("weekly family summary: completed = ⭐ earned this week by key (not the engine flag)", async () => {
    const b = await weeklySummaries(repo, admin, { studentId: s2 });
    const me = b.items[0];
    assert.ok(me.completed.includes(keys[0].name), JSON.stringify(me.completed));
    assert.ok(me.completed.includes(keys[3].name), "⭐ again 5 days ago");
    assert.ok(!me.completed.includes(keys[1].name), "the old isMastered of this week without a new ⭐ is not completed");
  });

  test("the growth views: translated, no engine-score growth verdict", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    for (const f of ["src/components/analytics/student-analytics.tsx", "src/components/analytics/class-analytics.tsx", "src/components/skills/by-source-view.tsx"]) {
      const src = read(f);
      assert.match(src, /makeT\(lang\)/, `${f} takes a lang`);
      assert.match(src, /await getT\(\)/, `${f} falls back to the cookie language`);
      assert.doesNotMatch(src, /meanGrowth|medianGrowth|\.growth\b|"declining"|"improving"|Average growth|Mastery by Month/, f);
    }
    const builders = read("src/server/reports/builders.ts");
    assert.doesNotMatch(builders, /pairedGrowth|meanGrowth|a\.growth/);
    assert.doesNotMatch(read("src/reports/weekly-summary.ts"), /StudentSkillMastery/);
  });
});
