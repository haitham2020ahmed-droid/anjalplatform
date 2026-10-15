/**
 * r75 (owner): Student Skills — the TREND ⬆️ ➖ ⬇️ (stars now against 2 weeks ago), the GUESSING flag ⚡ (≥ 20 % rapid
 * guesses) and the DATE filter (From – To, presets) on the three tabs. In-memory demo school, KNOWN data (today =
 * 2026-10-14, 2 weeks ago = 2026-09-30):
 *
 *   assigned 2026-09-20 (Curriculum): theme + inference → every student · 2026-10-05 (Grammar): commas → s0 s1
 *   s0  theme ◐ 09-21 → ⭐ 10-10 (history) · inference ◐ 09-21                         ⬆️  (1 star gained)
 *   s1  theme ◐ 09-21 · inference ◐ 09-21 (history, no change) · 10 rapid answers on an UNASSIGNED skill → no ⚡  ➖
 *   s2  theme ⭐ 09-25 → 🔄 10-12 (history)                                              ⬇️
 *   s3  theme: NO star row — recomputed from the answers: 10 careful answers 09-25 (◐ then), 25 more 10-08 + the
 *       engine's mastery 10-08 (⭐ now) · 3 rapid of 28 recent answers (11 %: under the threshold)  ⬆️  (1 star gained)
 *   s4  inference: 8 careful + 2 rapid answers 10-10 (exactly 20 %: ⚡) — ◐ now, ☆ then              ⬆️
 */
import { unhandled, renderPage } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { bench, routeOf, type Bench } from "./helpers/route-bench";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { skillKeyIndex } from "../src/server/skills/status";
import { classSkills, gridOf, studentTrend } from "../src/server/skills/skills-grid";
import { classReport, sourceCards } from "../src/server/skills/skills-report";
import { GUESS_MIN_ANSWERS, GUESS_RULE, GUESS_SHARE, GUESS_TIP, isGuessing, parseRange, rangeBounds, rangePresets, starFromHistory, TREND_RULE, TREND_WORD, trendOf } from "../src/server/skills/skills-trend";
import { UNRELIABLE_SHARE } from "../src/server/practice/guessing";
import { defaultCycle } from "../src/server/assessment-cycle/cycle";
import { assignSkill } from "../src/server/teacher/assign";
import { R, skillsClassSummary, skillsGridOneLine, skillsGridSummary, skillsReportOneLine, skillsSourceOneLine, skillsSourceSummary } from "../src/lib/report-summaries";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const D = (iso: string) => new Date(`${iso}T09:00:00Z`);
const has = (k: string) => { assert.ok((UI_STRINGS as readonly string[]).includes(k), `EN: ${k}`); assert.ok((ar as Record<string, string>)[k], `AR: ${k}`); };

describe("r75 ⭐ Student Skills: trend ⬆️➖⬇️, guessing ⚡, From – To", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let schoolId = ""; let ids: string[] = [];
  const g4 = new Map<string, string>();
  const now = D("2026-10-14");
  const links = { skill: (k: string) => `/skill/${k}`, plan: (x: string[]) => `/plan/${x.join(",")}`, student: (id: string) => `/student/${id}`, source: (x: string) => `/source/${x}`, assigned: "/assigned" };
  const key = async (code: string) => (await skillKeyIndex(repo, schoolId)).keyOf.get(g4.get(code)!)!;
  const star = async (sid: string, code: string, status: string, history: { at: string; status: string }[]) => repo.create("SkillStatus", {
    studentId: sid, skillKey: await key(code), level: 1, status, skillId: g4.get(code), answered: 34, correct: 30, score: 90, startedAt: D("2026-09-21"),
    masteredAt: status === "MASTERED" ? D(history.at(-1)!.at) : null, createdAt: D("2026-09-21"), updatedAt: now, history: history.map((h) => ({ at: D(h.at).toISOString(), status: h.status, why: "practice" })),
  });
  const answers = async (sid: string, code: string, day: string, n: number, rapid = 0) => {
    const sess = await repo.create("PracticeSession", { studentId: sid, skillId: g4.get(code), mode: "ADAPTIVE_PRACTICE", startedAt: D(day) });
    const q = (await repo.findMany("Question", { skillId: g4.get(code)! }, { select: ["id"], take: 1 }))[0];
    for (let i = 0; i < n; i++) await repo.create("QuestionAttempt", { studentId: sid, sessionId: sess.id, questionId: q.id, skillId: g4.get(code), response: "A", isCorrect: i % 2 === 0, responseMs: i < rapid ? 900 : 20_000, rapidGuess: i < rapid, difficultyB: 0, createdAt: new Date(D(day).getTime() + i * 1000) });
  };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    const tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id })) g4.set(s(k.code).replace(/^G4\./, ""), s(k.id));
    // known data only: no earlier practice of these students
    for (const m of ["QuestionAttempt", "SkillStatus", "StudentSkillMastery", "PracticeSession"]) await repo.deleteMany(m, { studentId: { in: ids } });
    const [s0, s1, s2, s3, s4] = ids;
    await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, source: "CURRICULUM" }, D("2026-09-20"));
    await assignSkill(repo, teacher, { classId, skillId: g4.get("inference")!, source: "CURRICULUM" }, D("2026-09-20"));
    await assignSkill(repo, teacher, { classId, skillId: g4.get("commas")!, studentIds: [s0, s1], source: "GRAMMAR" }, D("2026-10-05"));
    await star(s0, "theme", "MASTERED", [{ at: "2026-09-21", status: "IN_PROGRESS" }, { at: "2026-10-10", status: "MASTERED" }]);
    await star(s0, "inference", "IN_PROGRESS", [{ at: "2026-09-21", status: "IN_PROGRESS" }]);
    await star(s1, "theme", "IN_PROGRESS", [{ at: "2026-09-21", status: "IN_PROGRESS" }]);
    await star(s1, "inference", "IN_PROGRESS", [{ at: "2026-09-21", status: "IN_PROGRESS" }]);
    await answers(s1, "capitalization", "2026-10-11", 10, 10); // never assigned: no ⚡
    await star(s2, "theme", "NEEDS_REVIEW", [{ at: "2026-09-21", status: "IN_PROGRESS" }, { at: "2026-09-25", status: "MASTERED" }, { at: "2026-10-12", status: "NEEDS_REVIEW" }]);
    await answers(s3, "theme", "2026-09-25", 10);
    await answers(s3, "theme", "2026-10-08", 28, 3);
    await repo.create("StudentSkillMastery", { studentId: s3, skillId: g4.get("theme"), score: 92, isMastered: true, masteredAt: D("2026-10-08"), updatedAt: D("2026-10-08") });
    await answers(s4, "inference", "2026-10-10", 10, 2);
  });

  test("pure rules: the trend, ⚡ at / under the threshold, the history, the dates", () => {
    assert.deepEqual(trendOf([{ then: "IN_PROGRESS", now: "MASTERED" }, { then: "IN_PROGRESS", now: "IN_PROGRESS" }]), { trend: "UP", up: 1, down: 0, gained: 1 });
    assert.equal(trendOf([{ then: "MASTERED", now: "NEEDS_REVIEW" }]).trend, "DOWN");
    assert.equal(trendOf([{ then: "NOT_STARTED", now: "IN_PROGRESS" }, { then: "MASTERED", now: "NEEDS_REVIEW" }]).trend, "SAME", "one up, one down: no change overall");
    assert.equal(trendOf([{ then: "NOT_STARTED", now: "MASTERED" }, { then: "IN_PROGRESS", now: "NOT_STARTED" }]).trend, "SAME", "a net gain with a drop is not ⬆️");
    assert.equal(trendOf([{ then: "MASTERED", now: "IN_PROGRESS" }, { then: "IN_PROGRESS", now: "MASTERED" }, { then: "MASTERED", now: "NOT_STARTED" }]).trend, "DOWN", "net down");
    assert.equal(trendOf([{ then: "MASTERED", now: "NEXT_LEVEL" }]).trend, "SAME", "☆⬆ = mastered at the previous level: the same star level");
    assert.equal(GUESS_SHARE, UNRELIABLE_SHARE, "the platform's own effort threshold (20 %)");
    assert.equal(isGuessing({ answers: 10, rapid: 2 }), true, "exactly 20 %: ⚡");
    assert.equal(isGuessing({ answers: 10, rapid: 1 }), false, "10 %: no ⚡");
    assert.equal(isGuessing({ answers: GUESS_MIN_ANSWERS - 1, rapid: 2 }), false, "too few answers to tell");
    const h = [{ history: [{ at: "2026-09-21T00:00:00Z", status: "IN_PROGRESS" }, { at: "2026-10-10T00:00:00Z", status: "MASTERED" }] }];
    assert.equal(starFromHistory(h, Date.parse("2026-09-30")), "IN_PROGRESS");
    assert.equal(starFromHistory(h, Date.parse("2026-10-11")), "MASTERED");
    assert.equal(starFromHistory(h, Date.parse("2026-09-01")), "NOT_STARTED", "the row did not exist yet");
    assert.equal(starFromHistory([{ history: [] }], Date.now()), null, "no history: recompute from the answers");
    assert.equal(starFromHistory([{ history: [{ at: "2026-10-12T00:00:00Z", status: "MASTERED", why: "computed from earlier practice" }] }], Date.parse("2026-09-30")), null, "the migration's date is not the practice's");
    assert.deepEqual(parseRange("2026-10-31", "2026-10-01"), { from: "2026-10-01", to: "2026-10-31" }, "swapped");
    assert.deepEqual(parseRange("nope", undefined), { from: null, to: null }, "a wrong value is ignored: the whole year");
    const b = rangeBounds({ from: "2026-09-20", to: "2026-09-30" }, now);
    assert.deepEqual([b.on, b.past, new Date(b.start!).toISOString(), new Date(b.end).toISOString()], [true, true, "2026-09-20T00:00:00.000Z", "2026-09-30T23:59:59.999Z"]);
    assert.deepEqual([rangeBounds({ from: null, to: null }, now).on, rangeBounds({ from: null, to: "2026-12-31" }, now).end], [false, now.getTime()], "a To in the future ends now");
    const p = rangePresets(now, defaultCycle(now));
    assert.deepEqual(p.map((x) => [x.key, x.from, x.to]), [["month", "2026-10-01", "2026-10-31"], ["lastMonth", "2026-09-01", "2026-09-30"], ["term", "2026-08-23", "2027-01-09"]]);
    assert.deepEqual(rangePresets(D("2027-02-03"), defaultCycle(D("2027-02-03"))).find((x) => x.key === "term"), { key: "term", label: "This term", from: "2027-01-10", to: "2027-06-11" }, "the second term");
  });

  test("Skills grid: ⬆️ ➖ ⬇️ and ⚡ next to each name (history and recomputed stars)", async () => {
    const d = await classSkills(repo, teacher, { classId }, now);
    const [s0, s1, s2, s3, s4] = ids;
    assert.equal(d.trendSince, "2026-09-30");
    assert.equal(d.before![s0]["fam:theme"], "IN_PROGRESS"); assert.equal(d.stars[s0]["fam:theme"].status, "MASTERED");
    assert.equal(d.before![s3]["fam:theme"], "IN_PROGRESS", "recomputed: 10 answers by 09-30, no mastery yet");
    assert.equal(d.stars[s3]["fam:theme"].status, "MASTERED", "35 counted answers + the engine's mastery");
    const g = gridOf(d);
    const by = Object.fromEntries(g.students.map((x) => [x.id, x]));
    assert.deepEqual([s0, s1, s2, s3, s4].map((id) => by[id].trend), ["UP", "SAME", "DOWN", "UP", "UP"]);
    assert.deepEqual([s0, s1, s2, s3, s4].map((id) => by[id].guessing), [false, false, false, false, true], "s4 exactly 20 % ⚡ · s3 11 % · s1's fast answers are on a skill never assigned");
    assert.deepEqual(g.trendCounts, { up: 3, same: 1, down: 1 }); assert.equal(g.guessingCount, 1);
    assert.deepEqual([studentTrend(d, s0)?.gained, studentTrend(d, s3)?.gained], [1, 1]);
    // the summary + "In one line"
    const sm = skillsGridSummary({ totalStudents: 5, practising: g.practisingStudents ?? 0, skills: g.skills, trend: g.trendCounts, guessing: g.guessingCount }, { classId, skillHref: (k) => `/x?skill=${k}` });
    assert.ok(sm.lines.length >= 3 && sm.lines.length <= 5); assert.equal(sm.lines.at(-1)!.tone, "next");
    assert.ok(sm.lines.some((l) => l.key === R.sgGuess && l.vars?.n === 1), "⚡ line");
    const one = skillsGridOneLine({ won: g.starsWon ?? 0, stars: g.starsAll ?? 0, up: 3, fast: 1 });
    assert.deepEqual(one.vars, { m: 2, n: 12, up: 3, fast: 1 }, "2 of 12 stars won (theme s0 + s3)");
  });

  test("Class report: arrows in the table, the trend sentence, ⚡ count, 'not moving' and 'talk to them' action points", async () => {
    const d = await classSkills(repo, teacher, { classId }, now);
    const r = classReport(d, links, now);
    const [s0, s1, s2, s3, s4] = ids;
    const names = Object.fromEntries(d.students.map((x) => [x.id, x.name]));
    const row = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    assert.deepEqual([s0, s1, s2, s3, s4].map((id) => row[id].trend), ["UP", "SAME", "DOWN", "UP", "UP"]);
    assert.deepEqual([s0, s1, s2, s3, s4].map((id) => row[id].guessing), [false, false, false, false, true]);
    assert.deepEqual([r.trend.gained, r.trend.improved, r.trend.stalled.map((x) => x.id), r.trend.down], [2, 3, [s1], 1]);
    assert.deepEqual(r.guessing.map((x) => x.id), [s4]);
    const talk = r.actions.find((a) => a.kind === "GUESSING")!, still = r.actions.find((a) => a.kind === "STALLED")!;
    assert.equal(talk.vars.names, names[s4]); assert.equal(talk.href, `/student/${s4}`);
    assert.equal(still.vars.names, names[s1]); assert.equal(still.href, `/student/${s1}`);
    assert.ok(r.actions.indexOf(talk) < r.actions.indexOf(still), "talk to the fast answerers before anything else but a whole-class reteach");
    assert.ok(r.actions.length <= 5);
    for (const a of r.actions) { has(a.text); has(a.button); }
    // the summary at the end: "The class gained N stars in the last 2 weeks · X students improved · Y not moving"
    const sum = skillsClassSummary(r);
    const tr = sum.lines.find((l) => l.key === R.scTrend)!;
    assert.equal(R.scTrend, "The class gained {n} stars in the last 2 weeks · {x} students improved · {y} not moving");
    assert.deepEqual(tr.vars, { n: 2, x: 3, y: 1 });
    assert.ok(sum.lines.some((l) => l.key === R.scGuess && l.vars?.names === names[s4]));
    assert.ok(sum.lines.length >= 3 && sum.lines.length <= 5); assert.equal(sum.lines.at(-1)!.tone, "next");
    for (const l of sum.lines) has(l.key);
    assert.deepEqual(skillsReportOneLine({ on: r.onTrack, total: r.withWork, help: r.needSupport, gained: r.trend.gained }).vars, { on: 4, total: 5, help: 1, gained: 2 }, "s2 needs review: support");
  });

  test("the date filter on every tab: only the assignments and answers inside it; a past To = the stars of that day", async () => {
    const [s0, s1, s2, s3, s4] = ids;
    // This month (October): only commas was assigned inside it
    const oct = await classSkills(repo, teacher, { classId, range: { from: "2026-10-01", to: "2026-10-31" } }, now);
    assert.deepEqual(gridOf(oct).skills.map((k) => k.key), ["fam:commas"], "Skills grid");
    assert.deepEqual(sourceCards(oct).map((c) => c.source), ["GRAMMAR"], "By source");
    const ro = classReport(oct, links, now);
    assert.deepEqual([ro.skillsAssigned, ro.withWork, ro.guessing.length], [1, 2, 0], "Class report: commas for s0 s1; s4's fast answers are on a skill outside the dates");
    // 20–30 September: theme + inference; the stars as they were on the 30th; only those days' answers counted
    const sep = await classSkills(repo, teacher, { classId, range: { from: "2026-09-20", to: "2026-09-30" } }, now);
    const g = gridOf(sep);
    assert.deepEqual(new Set(g.skills.map((k) => k.key)), new Set(["fam:theme", "fam:inference"]));
    assert.deepEqual([sep.stars[s0]["fam:theme"].status, sep.stars[s2]["fam:theme"].status, sep.stars[s3]["fam:theme"].status], ["IN_PROGRESS", "MASTERED", "IN_PROGRESS"]);
    assert.deepEqual([sep.stars[s3]["fam:theme"].answered, sep.stars[s4]["fam:inference"].answered], [10, 0], "only the answers inside the dates");
    assert.equal(sep.trendSince, "2026-09-16", "the trend compares the To date with 2 weeks before it");
    assert.deepEqual([s0, s1, s2, s3, s4].map((id) => g.students.find((x) => x.id === id)!.trend), ["UP", "UP", "UP", "UP", "SAME"]);
    assert.equal(g.guessingCount, 0);
    const cards = sourceCards(sep);
    assert.deepEqual(cards.map((c) => [c.source, c.answered]), [["CURRICULUM", 10]], "By source: the answers inside the dates");
    assert.equal(classReport(sep, links, now).skillsAssigned, 2, "Class report");
    // the source summary + one line
    const ss = skillsSourceSummary(sourceCards(await classSkills(repo, teacher, { classId }, now)), { classId, sourceHref: (x) => `/source/${x}`, skillHref: (k) => `/skill/${k}` });
    assert.ok(ss.lines.length >= 2 && ss.lines.length <= 5); assert.equal(ss.lines.at(-1)!.tone, "next"); assert.ok(ss.actions.length >= 1);
    for (const l of ss.lines) has(l.key);
    for (const a of ss.actions) has(a.label);
    assert.equal(skillsSourceOneLine(cards)!.key, R.oneSourceOnly);
  });

  test("the page: dates on every tab (From – To + presets), arrows and ⚡ by the names, 'In one line' + summary on every tab; EN + AR", () => {
    const src = read("src/app/teacher/reports/skills-grid/page.tsx");
    for (const x of ["<DatePresets", "<DateInputs range={range} t={t} />", 'name="from"', 'name="to"', "Whole year", 'data-testid="one-line"', "In one line", "<StudentMarks trend={st.trend} guessing={st.guessing}", "<StudentMarks trend={x.trend} guessing={x.guessing}", "<InfoTip text={TREND_RULE} />", "<InfoTip text={GUESS_RULE} />", "skillsClassSummary(r)", "skillsSourceSummary(cards", "skillsGridSummary(", "parseRange(sp.from, sp.to)", 'data-testid="report-trend"']) assert.ok(src.includes(x), x);
    // r84: + the Plans tab (its one line; the summary of the opened plan)
    assert.equal(src.match(/<ReportSummary summary=\{/g)?.length, 4, "a summary at the end of each tab");
    assert.equal(src.match(/<OneLine l=\{/g)?.length, 4, "one line at the top of each tab");
    // the dates travel with every link and tab
    assert.match(src, /from: range\.from \?\? "", to: range\.to \?\? ""/);
    for (const k of [TREND_RULE, GUESS_RULE, GUESS_TIP, ...Object.values(TREND_WORD), "This month", "Last month", "This term", "Whole year", "From", "To", "Dates", "In one line", "Answering too fast: {n}", "{pct}% of stars won", R.scTrend, R.oneGrid, R.oneReport, R.oneSource]) has(k);
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
    assert.match(GUESS_TIP, /talk to the student about reading carefully before re-teaching/);
  });
});

describe("r75 the Student Skills page renders every tab, with and without dates", () => {
  let b: Bench;
  before(async () => { b = await bench(); });
  const file = "src/app/teacher/reports/skills-grid/page.tsx";
  const SUMMARY = "src/components/report-kit/report-summary.tsx#ReportSummary";
  for (const search of [{}, { tab: "source" }, { tab: "report" }, { from: "2026-09-01", to: "2026-09-30" }, { tab: "source", src: "CURRICULUM", from: "2026-10-01" }, { tab: "report", to: "2026-10-01" }] as Record<string, string>[]) {
    test(`renders ${new URLSearchParams(search)}`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const r = await renderPage(() => require(join(ROOT, file)) as Record<string, unknown>, { path: routeOf(file), cookies: b.cookies.teacher, params: {}, searchParams: search, collect: true });
      assert.equal(r.outcome, "ok", `${r.outcome} ${r.detail ?? ""}`);
      assert.ok((r.stats.seen ?? []).filter((x) => x.name === SUMMARY).length <= 1, "one summary");
    });
  }
  test("no stray rejected promise while rendering", () => { assert.deepEqual(unhandled, []); });
});
