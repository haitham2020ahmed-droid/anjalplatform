/**
 * 🇸🇦 "Complete NAFS test (all standards)" (owner request; fictional demo school only, in-memory database):
 *  - every one of the 13 Ministry standards is covered for 13 / 20 / 35 / 70 questions, never below one per standard
 *    (the guide's proportions: 35 = 3 per standard, 1 for S11 and S12; 70 = twice the guide);
 *  - only questions WITH a Ministry standard cover a standard; no duplicates; passage questions together; an
 *    informational and a literary text; balanced difficulty; the four PIRLS processes; unseen questions first;
 *  - a warning (how many are missing) when the bank lacks a standard;
 *  - practice mode is limited to the 13 standards; saving with an uncovered standard needs the teacher's confirmation;
 *  - the teacher's edits (remove / add / replace / counts) update the coverage table.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { teacherRoster } from "../src/server/teacher/assign";
import { GUIDE_BOOKLET_SIZE, MOE_CODES, MOE_STANDARDS, PROCESSES, type Difficulty, type NafsProcess } from "../src/server/nafs/framework";
import { nafsBankChanged, nafsIndex, saveNafsQuestion, type NafsEntry } from "../src/server/nafs/bank";
import { buildFull, buildNafsFull, cleanFull, createFullNafsPractice, moreForStandard, orderFull, replaceNafsQuestion, saveFullNafsTest } from "../src/server/nafs/build";
import { fullCoverage, fullDistribution, FULL_MIN_QUESTIONS } from "../src/server/nafs/coverage";
import { getNafsTest, nafsClasses } from "../src/server/nafs/tests";
import { practicePool } from "../src/server/nafs/practice";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ a synthetic bank (pure tests)

let uid = 0;
function entry(p: Partial<NafsEntry>): NafsEntry {
  return { id: `q${++uid}`, nafsCode: "NAFS.RC.DETAIL", process: "P1", domain: "RC", passageId: null, own: true, hidden: false, draft: false, copyOfId: null, cat: null, standard: null, kind: "MCQ", booklet: null, bookletN: null, practiceSet: null, difficulty: 2, ...p };
}
/** 4 texts (2 informational, 2 literary) × 13 standards × 3 questions (Easy / Medium / Hard, processes varied) + solo items + questions without a standard. */
function richBank(opts: { skip?: string[]; only?: Record<string, number> } = {}): { pool: NafsEntry[]; types: Map<string, "LIT" | "INFO" | null> } {
  const pool: NafsEntry[] = [];
  const types = new Map<string, "LIT" | "INFO" | null>([["T-INFO-1", "INFO"], ["T-LIT-1", "LIT"], ["T-INFO-2", "INFO"], ["T-LIT-2", "LIT"]]);
  let k = 0;
  for (const pid of types.keys()) for (const x of MOE_STANDARDS) {
    if (opts.skip?.includes(x.code)) continue;
    for (let i = 0; i < 3; i++) {
      if (opts.only && opts.only[x.code] !== undefined && pool.filter((e) => e.standard === x.code).length >= opts.only[x.code]) continue;
      pool.push(entry({ passageId: pid, standard: x.code, difficulty: ((i % 3) + 1) as Difficulty, process: PROCESSES[(k++) % 4], kind: (x.code === "MOE.S03" || x.code === "MOE.S13") && i === 2 && pid === "T-LIT-1" ? "WRITTEN" : "MCQ" }));
    }
  }
  // questions WITHOUT a Ministry standard (never used to cover one), hidden and drafts (never used)
  for (let i = 0; i < 40; i++) pool.push(entry({ standard: null, process: PROCESSES[i % 4], passageId: i % 2 ? "T-INFO-1" : null }));
  pool.push(entry({ standard: "MOE.S11", hidden: true }), entry({ standard: "MOE.S12", draft: true }));
  return { pool, types };
}
const settings = (n: number, written = false) => cleanFull({ questions: n, written });
const byId = (pool: NafsEntry[]) => new Map(pool.map((e) => [e.id, e]));

describe("the guide's proportions, never below one per standard", () => {
  test("13 / 20 / 35 / 70 questions: every standard ≥ 1 and the counts add up", () => {
    for (const n of [13, 20, 35, 70]) {
      const d = fullDistribution(n);
      assert.equal(sum(d), n, `${n} questions in all`);
      for (const c of MOE_CODES) assert.ok(d[c] >= 1, `${c} has at least one of ${n}`);
    }
    const d35 = fullDistribution(35);
    for (const x of MOE_STANDARDS) assert.equal(d35[x.code], x.perBooklet, `35 = the guide (${x.short})`);
    const d70 = fullDistribution(70);
    for (const x of MOE_STANDARDS) assert.equal(d70[x.code], 2 * x.perBooklet, `70 = twice the guide (${x.short})`);
    assert.equal(GUIDE_BOOKLET_SIZE, 35);
  });
  test("fewer than 13 asked → still one per standard (13)", () => {
    for (const n of [1, 5, 12]) { const d = fullDistribution(n); assert.equal(sum(d), FULL_MIN_QUESTIONS); assert.ok(MOE_CODES.every((c) => d[c] === 1)); }
    assert.equal(cleanFull({ questions: 5 }).questions, 13);
    // the teacher's own counts: each at least one
    const st = cleanFull({ questions: 20, counts: { "MOE.S01": 0, "MOE.S02": 5 } });
    assert.equal(st.counts["MOE.S01"], 1); assert.equal(st.counts["MOE.S02"], 5);
    assert.equal(st.questions, sum(st.counts));
  });
});

describe("buildFull: every standard covered, precisely", () => {
  for (const n of [13, 20, 35, 70]) {
    test(`${n} questions: all 13 standards with the planned counts; no duplicates; only standard questions`, () => {
      const { pool, types } = richBank();
      const idx = byId(pool);
      const b = buildFull(pool, types, new Set(), settings(n), `seed-${n}`);
      assert.equal(b.questionIds.length, n);
      assert.equal(new Set(b.questionIds).size, n, "no duplicates");
      const got = b.questionIds.map((id) => idx.get(id)!);
      assert.ok(got.every((e) => e.standard && !e.hidden && !e.draft), "only usable questions with a Ministry standard");
      const want = fullDistribution(n);
      for (const c of MOE_CODES) assert.equal(got.filter((e) => e.standard === c).length, want[c], `${c} for ${n}`);
      assert.deepEqual(b.shortage, {});
      const cov = fullCoverage(got.map((e) => ({ ...e, textType: e.passageId ? types.get(e.passageId) ?? null : null })), b.counts, b.available);
      assert.deepEqual(cov.uncovered, []);
      assert.equal(cov.noStandard, 0);
      // an informational and a literary text
      assert.ok(cov.texts.INFO >= 1 && cov.texts.LIT >= 1, "at least one informational and one literary text");
      // the four PIRLS processes and every difficulty (balanced)
      if (n >= 20) {
        assert.deepEqual(cov.missingProcesses, [], "all four PIRLS processes");
        for (const k of [1, 2, 3] as const) assert.ok(cov.byDifficulty[k] >= Math.floor(n * 0.2), `difficulty ${k} represented (${cov.byDifficulty[k]} of ${n})`);
      }
      // passage questions together
      const seenP: string[] = [];
      for (const e of got) if (e.passageId && seenP[seenP.length - 1] !== e.passageId) { assert.ok(!seenP.includes(e.passageId), "a passage's questions are together"); seenP.push(e.passageId); }
    });
  }

  test("the written items only when asked (S03, S13)", () => {
    const { pool, types } = richBank();
    const idx = byId(pool);
    const off = buildFull(pool, types, new Set(), settings(35, false), "w0").questionIds.map((id) => idx.get(id)!);
    assert.ok(off.every((e) => e.kind === "MCQ"));
    const on = buildFull(pool, types, new Set(), settings(35, true), "w1").questionIds.map((id) => idx.get(id)!);
    for (const c of ["MOE.S03", "MOE.S13"]) assert.equal(on.filter((e) => e.standard === c && e.kind === "WRITTEN").length, 1, `${c}: one written answer`);
  });

  test("questions the class has not seen come first", () => {
    const { pool, types } = richBank();
    const seen = new Set(pool.filter((_, i) => i % 2 === 0).map((e) => e.id));
    const b = buildFull(pool, types, seen, settings(20), "unseen");
    assert.ok(b.questionIds.every((id) => !seen.has(id)), "the bank has enough unseen questions for every standard");
  });

  test("the bank lacks a standard: a warning with how many are missing; the others still covered", () => {
    const { pool, types } = richBank({ skip: ["MOE.S11"], only: { "MOE.S05": 1 } });
    const b = buildFull(pool, types, new Set(), settings(35), "short");
    assert.deepEqual(b.shortage, { "MOE.S11": 1, "MOE.S05": 2 });
    assert.equal(b.available["MOE.S11"], 0, "the hidden S11 question does not count");
    assert.ok(b.notes.some((x) => /S11: the bank has 0 question\(s\) for this standard — 1 missing/.test(x)));
    assert.ok(b.notes.some((x) => /S05: the bank has 1 question\(s\) for this standard — 2 missing/.test(x)));
    assert.ok(b.notes.some((x) => /Not covered: S11/.test(x)));
    const idx = byId(pool);
    const cov = fullCoverage(b.questionIds.map((id) => idx.get(id)!), b.counts, b.available);
    assert.deepEqual(cov.uncovered, ["MOE.S11"]);
    const s11 = cov.rows.find((r) => r.code === "MOE.S11")!;
    assert.equal(s11.missing, 1); assert.equal(s11.covered, false);
    assert.equal(cov.rows.find((r) => r.code === "MOE.S05")!.missing, 2);
    // every other standard is covered
    assert.equal(cov.rows.filter((r) => r.covered).length, 12);
  });

  test("questions without a Ministry standard never cover a standard", () => {
    const { pool, types } = richBank({ skip: ["MOE.S04"] });
    // many S04-looking questions, but with no standard set
    for (let i = 0; i < 10; i++) pool.push(entry({ nafsCode: "NAFS.RC.MAIN", standard: null, passageId: "T-LIT-1" }));
    const idx = byId(pool);
    const b = buildFull(pool, types, new Set(), settings(35), "nostd");
    assert.ok(b.questionIds.every((id) => idx.get(id)!.standard), "none without a standard");
    assert.equal(b.shortage["MOE.S04"], 3);
  });

  test("the booklet order: informational text first, each text by standard", () => {
    const { pool, types } = richBank();
    const idx = byId(pool);
    const ids = orderFull([...pool].filter((e) => e.standard && e.passageId).slice(0, 60).reverse(), types);
    const first = idx.get(ids[0])!;
    assert.equal(types.get(first.passageId!), "INFO");
  });
});

describe("teacher edits update the coverage", () => {
  test("remove → uncovered; add back → covered; a question without a standard covers nothing; duplicates counted", () => {
    const { pool, types } = richBank();
    const idx = byId(pool);
    const b = buildFull(pool, types, new Set(), settings(20), "edit");
    let list = b.questionIds.map((id) => idx.get(id)!);
    assert.deepEqual(fullCoverage(list, b.counts).uncovered, []);
    const s07 = list.filter((e) => e.standard === "MOE.S07");
    list = list.filter((e) => e.standard !== "MOE.S07");
    let cov = fullCoverage(list, b.counts);
    assert.deepEqual(cov.uncovered, ["MOE.S07"], "removing every S07 question leaves S07 uncovered");
    assert.equal(cov.total, 20 - s07.length);
    list = [...list, entry({ standard: null, process: "P2" })];
    cov = fullCoverage(list, b.counts);
    assert.deepEqual(cov.uncovered, ["MOE.S07"], "a question without a standard does not cover S07");
    assert.equal(cov.noStandard, 1);
    list = [...list, s07[0]];
    cov = fullCoverage(list, b.counts);
    assert.deepEqual(cov.uncovered, []);
    assert.deepEqual(cov.short, s07.length > 1 ? ["MOE.S07"] : [], "fewer than planned is shown");
    // the teacher lowers the count: no longer short
    cov = fullCoverage(list, { ...b.counts, "MOE.S07": 1 });
    assert.deepEqual(cov.short, []);
    assert.equal(fullCoverage([...list, list[0]], b.counts).duplicates, 1);
    // difficulty and processes per standard
    const r = fullCoverage(list, b.counts).rows.find((x) => x.code === "MOE.S01")!;
    assert.equal(r.byDifficulty[1] + r.byDifficulty[2] + r.byDifficulty[3], r.got);
    assert.ok(r.processes.length >= 1 && r.processes.every((p: NafsProcess) => PROCESSES.includes(p)));
  });
});

// ------------------------------------------------------------------ the school's center (in-memory demo database)

let repo: SqliteRepo;
let g6: Actor;
let klassId = "";
const made: Record<string, string[]> = {};

before(async () => {
  ({ repo } = await demoDatabase());
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
  const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
  let i = grades.findIndex((g) => g.includes(6));
  if (i < 0) {
    i = 0;
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
    const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
    await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
  }
  g6 = teachers[i];
  klassId = (await nafsClasses(repo, g6))[0].id;
  // the school's own questions: every standard, an informational and a literary text, Easy / Medium / Hard
  const texts = { INFO: "Canned Food\n\nCanned food was invented to feed soldiers on long journeys.\n\nToday cans keep food safe for years.", LIT: "The Little Guest\n\n\"Who is at the door?\" asked my mother.\n\nA small cat looked up at us and stayed for dinner." } as const;
  for (const x of MOE_STANDARDS) {
    made[x.code] = [];
    for (let k = 0; k < 4; k++) {
      const kind = k % 2 ? "LIT" : "INFO";
      const r = await saveNafsQuestion(repo, g6, { nafsCode: x.nafs.find((c) => !c.startsWith("NAFS.P")) ?? "NAFS.IAE.EVAL", standard: x.code, process: x.pirls[k % x.pirls.length], difficulty: (k % 3) + 1, stem: `${x.short} full-test question ${k + 1}?`, options: [`a ${x.short}${k}`, `b ${x.short}${k}`, `c ${x.short}${k}`, `d ${x.short}${k}`], correct: 1, passageTitle: texts[kind].split("\n")[0], passageText: texts[kind], textType: kind });
      made[x.code].push(r.id);
    }
  }
  nafsBankChanged(repo, g6.schoolId!);
});

describe("in the school's NAFS center", () => {
  test("buildNafsFull covers every standard for 13 / 20 / 35 questions, with both texts", async () => {
    const idx = new Map((await nafsIndex(repo, g6.schoolId!)).map((e) => [e.id, e]));
    for (const n of [13, 20, 35]) {
      const b = await buildNafsFull(repo, g6, { settings: { questions: n, written: false }, classId: klassId, seed: `db-${n}` });
      assert.equal(b.questionIds.length, n);
      const list = b.questionIds.map((id) => idx.get(id)!);
      for (const c of MOE_CODES) assert.ok(list.some((e) => e.standard === c), `${c} covered (${n})`);
      assert.ok(list.every((e) => e.standard), "only questions with a Ministry standard");
      assert.equal(new Set(b.questionIds).size, n);
      assert.ok(b.texts.some((x) => x.type === "INFO") && b.texts.some((x) => x.type === "LIT"), `an informational and a literary text (${n})`);
    }
    // the practice preview is multiple choice only
    const p = await buildNafsFull(repo, g6, { settings: { questions: 13, written: true }, practice: true });
    assert.ok(p.questionIds.every((id) => idx.get(id)!.kind === "MCQ"));
    assert.equal(p.settings.written, false);
    // a saved test holds at most a bubble sheet's questions
    await assert.rejects(buildNafsFull(repo, g6, { settings: { questions: 70 } }), ValidationError);
  });

  test("more questions for one standard, and replace inside the same standard", async () => {
    const b = await buildNafsFull(repo, g6, { settings: { questions: 13, written: false }, seed: "more" });
    const more = await moreForStandard(repo, g6, { standard: "MOE.S08", n: 2, current: b.questionIds });
    assert.equal(more.length, 2);
    assert.ok(more.every((id) => !b.questionIds.includes(id)), "never a question already in the test");
    const idx = new Map((await nafsIndex(repo, g6.schoolId!)).map((e) => [e.id, e]));
    assert.ok(more.every((id) => idx.get(id)!.standard === "MOE.S08"));
    const s09 = b.questionIds.find((id) => idx.get(id)!.standard === "MOE.S09")!;
    const other = await replaceNafsQuestion(repo, g6, { questionId: s09, current: b.questionIds, sameStandard: true, seed: "r" });
    assert.equal(idx.get(other)!.standard, "MOE.S09", "the replacement keeps the standard covered");
  });

  test("saving: an uncovered standard needs the teacher's confirmation; the test is saved as a complete NAFS test", async () => {
    const b = await buildNafsFull(repo, g6, { settings: { questions: 20, written: false }, seed: "save" });
    const idx = new Map((await nafsIndex(repo, g6.schoolId!)).map((e) => [e.id, e]));
    const without = b.questionIds.filter((id) => idx.get(id)!.standard !== "MOE.S12");
    await assert.rejects(saveFullNafsTest(repo, g6, { title: "Full", questionIds: without, timeLimitMin: 30 }), (e: Error) => e instanceof ValidationError && /S12/.test(e.message));
    const id = await saveFullNafsTest(repo, g6, { title: "Full (confirmed)", questionIds: without, timeLimitMin: 30, confirmUncovered: true });
    assert.ok(id);
    const ok = await saveFullNafsTest(repo, g6, { title: "Complete NAFS test", questionIds: b.questionIds, timeLimitMin: 30, settings: { counts: b.counts } });
    const t = await getNafsTest(repo, g6, ok);
    assert.equal(t.mode, "FULL");
    assert.deepEqual(t.questionIds, b.questionIds);
  });

  test("practice mode is limited to the 13 standards", async () => {
    const b = await buildNafsFull(repo, g6, { settings: { questions: 13 }, practice: true, seed: "prac" });
    const r = await createFullNafsPractice(repo, g6, { title: "Complete NAFS practice", classId: klassId, questionIds: b.questionIds, maxQuestions: 13 });
    const row = await repo.findUnique("NafsPractice", { id: r.id });
    const targets = typeof row!.targets === "string" ? JSON.parse(String(row!.targets)) : row!.targets;
    assert.deepEqual([...targets].sort(), [...MOE_CODES].sort(), "exactly the 13 Ministry standards");
    // the whole bank: only multiple-choice questions WITH a Ministry standard
    const w = await createFullNafsPractice(repo, g6, { title: "Whole bank", classId: klassId, wholeBank: true });
    const wr = await repo.findUnique("NafsPractice", { id: w.id });
    assert.equal(wr!.questionIds ?? null, null);
    const pool = await practicePool(repo, g6.schoolId!, { targets: [...MOE_CODES], questionIds: null });
    assert.ok(pool.length > 0 && pool.every((e) => e.standard && MOE_CODES.includes(e.standard) && e.kind === "MCQ"));
    // an uncovered standard: refused until confirmed; a question without a standard: refused
    const idx = new Map((await nafsIndex(repo, g6.schoolId!)).map((e) => [e.id, e]));
    const less = b.questionIds.filter((id) => idx.get(id)!.standard !== "MOE.S01");
    await assert.rejects(createFullNafsPractice(repo, g6, { title: "x", classId: klassId, questionIds: less }), ValidationError);
    assert.ok((await createFullNafsPractice(repo, g6, { title: "x", classId: klassId, questionIds: less, confirmUncovered: true })).id);
    const noStd = [...idx.values()].find((e) => !e.standard && e.kind === "MCQ" && !e.hidden && !e.draft);
    if (noStd) await assert.rejects(createFullNafsPractice(repo, g6, { title: "x", classId: klassId, questionIds: [...b.questionIds, noStd.id] }), ValidationError);
  });
});

describe("the tile and the builder", () => {
  test("the complete test is the builder's start: All 13 standards (owner r67: one builder, no second tile)", () => {
    const tests = read("src/components/nafs/tests-tab.tsx");
    assert.match(tests, /STARTS\.map/);
    const starts = read("src/components/nafs/builder-starts.ts");
    assert.match(starts, /key: "ALL", icon: "★", title: "All 13 standards — complete test"/);
    assert.match(read("src/app/teacher/nafs/tests/new/page.tsx"), /"ALL"/);
    // the old ?mode=FULL links open it
    assert.match(read("src/server/nafs/center.ts"), /FULL: \{ start: "ALL" \}/);
  });
  test("the new strings have Arabic", () => {
    for (const x of ["Complete NAFS test (all standards)", "Summary to check before saving", "Use fewer for this standard", "Every one of the 13 standards is covered.", "Not covered", "Texts used", "PIRLS processes", "By standard", "Test order", "Purpose", "Build the complete test"]) assert.ok(hasAr(x), `Arabic for "${x}"`);
  });
});
