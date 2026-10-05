import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADAPTIVE, LEVEL_TO_B } from "../src/config/engine";
import { domainEstimates, isDiagnosticComplete, nextDiagnosticItem, overallEstimate, type DiagnosticItem, type DiagnosticResponse } from "../src/adaptive/diagnostic";
import { probability } from "../src/adaptive/irt";
import { calibrateItem, computeItemStats, type ItemMeta, type ItemResponse } from "../src/analytics/item-analysis";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { latestDiagnostic, startDiagnostic, submitDiagnosticAnswer } from "../src/server/assessment/diagnostic";
import { runItemAnalysis } from "../src/server/jobs/item-analysis";
import { loadItemsForSkills, type PracticeItem } from "../src/server/practice/items";
import { startPractice } from "../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { demoDatabase, ROOT } from "./helpers/db";

let s = 99;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const corr = (x: number[], y: number[]) => {
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  const c = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
  return c / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
};

describe("placement algorithm (simulated students with known abilities)", () => {
  const DOMAINS = ["GRAMMAR", "LANGUAGE", "READING", "VOCABULARY"];
  const pool: DiagnosticItem[] = DOMAINS.flatMap((d) =>
    Array.from({ length: 40 }, (_, i) => {
      const level = 1 + (i % 7);
      return { id: `${d}-${i}`, skillId: `${d}-skill-${i % 5}`, domain: d, level, a: 0.9 + rand() * 0.5, b: LEVEL_TO_B[level] + (rand() - 0.5) * 0.5, c: 0, estimatedSeconds: 40 };
    }),
  );

  function run(truth: Record<string, number>) {
    const responses: DiagnosticResponse[] = [];
    const last: Record<string, number> = {};
    const targets: Record<string, number[]> = {};
    while (!isDiagnosticComplete(DOMAINS, responses, DEFAULT_ADAPTIVE)) {
      const p = nextDiagnosticItem(pool, responses, last, DEFAULT_ADAPTIVE);
      if (!p.item) break;
      last[p.domain!] = p.targetB;
      (targets[p.domain!] ??= []).push(p.targetB);
      responses.push({ itemId: p.item.id, domain: p.item.domain, skillId: p.item.skillId, correct: rand() < probability(truth[p.item.domain], p.item, 2), a: p.item.a, b: p.item.b, c: 0, weight: 1 });
    }
    return { responses, targets };
  }

  test("recovers each area's level and the overall level in ≤ 24 questions", () => {
    const truths: Record<string, number>[] = [];
    const ests: Record<string, number>[] = [];
    const overallT: number[] = [], overallE: number[] = [];
    let maxLen = 0;
    for (let i = 0; i < 200; i++) {
      const g = gauss();
      const t = Object.fromEntries(DOMAINS.map((d) => [d, g * 0.8 + gauss() * 0.6]));
      const { responses } = run(t);
      maxLen = Math.max(maxLen, responses.length);
      truths.push(t);
      ests.push(Object.fromEntries(domainEstimates(DOMAINS, responses, DEFAULT_ADAPTIVE).map((e) => [e.domain, e.theta])));
      overallT.push(DOMAINS.reduce((a, d) => a + t[d], 0) / DOMAINS.length);
      overallE.push(overallEstimate(responses, DEFAULT_ADAPTIVE).theta);
    }
    const rd = DOMAINS.map((d) => corr(truths.map((t) => t[d]), ests.map((e) => e[d])));
    const ro = corr(overallT, overallE);
    console.log(`  placement study: per-area r = ${rd.map((r) => r.toFixed(2)).join(", ")}; overall r = ${ro.toFixed(2)}; max questions ${maxLen}`);
    assert.ok(maxLen <= 24);
    assert.ok(rd.every((r) => r > 0.65), rd.join(","));
    assert.ok(ro > 0.85, String(ro));
  });

  test("covers every area with ≥ 4 questions and never jumps difficulty within an area", () => {
    const { responses, targets } = run({ GRAMMAR: 2, LANGUAGE: -2, READING: 0, VOCABULARY: 1 });
    for (const d of DOMAINS) assert.ok(responses.filter((r) => r.domain === d).length >= 4, d);
    for (const ts of Object.values(targets))
      for (let i = 1; i < ts.length; i++) assert.ok(Math.abs(ts[i] - ts[i - 1]) <= DEFAULT_ADAPTIVE.maxTargetStep + 1e-9);
  });
});

describe("item statistics and quality flags", () => {
  const meta = (o: Partial<ItemMeta> = {}): ItemMeta => ({ questionId: "q", estimatedSeconds: 40, optionLabels: ["A", "B", "C", "D"], keyLabels: ["A"], a: 1, b: 0, c: 0, authoredB: 0, ...o });
  const respond = (n: number, f: (theta: number) => { correct: boolean; chosen: string }) =>
    Array.from({ length: n }, () => {
      const theta = gauss();
      const r = f(theta);
      return { questionId: "q", correct: r.correct, chosen: r.chosen, responseMs: 30_000, rapid: false, ability: theta } as ItemResponse;
    });

  test("a healthy item has no flags and positive discrimination", () => {
    const st = computeItemStats(meta(), respond(200, (t) => {
      const c = rand() < probability(t, { a: 1.2, b: 0, c: 0 }, 2);
      return { correct: c, chosen: c ? "A" : ["B", "C", "D"][Math.floor(rand() * 3)] };
    }));
    assert.deepEqual(st.flags, []);
    assert.ok(st.pointBiserial! > 0.3);
  });

  test("flags too-easy items and never-chosen distractors", () => {
    const st = computeItemStats(meta(), respond(120, () => ({ correct: rand() < 0.98, chosen: rand() < 0.98 ? "A" : "B" })));
    assert.ok(st.flags.includes("TOO_EASY"));
    assert.ok(st.flags.includes("DISTRACTOR_NEVER_CHOSEN"));
  });

  test("detects a likely wrong answer key: strong students choose a distractor", () => {
    // the key says A, but the truly correct option is C
    const st = computeItemStats(meta(), respond(150, (t) => {
      const knows = rand() < probability(t, { a: 1.5, b: 0, c: 0 }, 2);
      const chosen = knows ? "C" : ["A", "B", "D"][Math.floor(rand() * 3)];
      return { correct: chosen === "A", chosen };
    }));
    assert.ok(st.flags.includes("POSSIBLE_KEY_ERROR"), st.flags.join(","));
    assert.ok(st.flags.includes("NEGATIVE_DISCRIMINATION"));
  });

  test("rapid guesses are excluded and a high rate is flagged", () => {
    const rs = respond(60, () => ({ correct: true, chosen: "A" })).map((r, i) => ({ ...r, rapid: i % 2 === 0 }));
    const st = computeItemStats(meta(), rs);
    assert.equal(st.attempts, 30);
    assert.ok(st.flags.includes("HIGH_RAPID_GUESSING"));
  });
});

describe("calibration", () => {
  const sim = (trueB: number, n: number): ItemResponse[] =>
    Array.from({ length: n }, () => {
      const theta = gauss();
      return { questionId: "q", correct: rand() < probability(theta, { a: 1, b: trueB, c: 0 }, 2), chosen: null, responseMs: 30_000, rapid: false, ability: theta };
    });

  test("an item authored one level too hard is pulled toward its true difficulty (step-limited)", () => {
    const authoredB = 0.75; // written as Level 5…
    const trueB = -0.25; //   …but really about Level 4
    let meta: ItemMeta = { questionId: "q", estimatedSeconds: 40, optionLabels: [], keyLabels: [], a: 1, b: authoredB, c: 0, authoredB };
    const rs = sim(trueB, 600);
    const r1 = calibrateItem(meta, rs);
    assert.ok(Math.abs(r1.newB - r1.oldB) <= 0.5 + 1e-9, "one run moves at most 0.5");
    meta = { ...meta, b: r1.newB, a: r1.newA };
    const r2 = calibrateItem(meta, rs);
    console.log(`  calibration: authored ${authoredB}, true ${trueB}, after run 1 ${r1.newB}, run 2 ${r2.newB}, a=${r2.newA}`);
    assert.ok(Math.abs(r2.newB - trueB) < 0.25, `b=${r2.newB}`);
    assert.ok(Math.abs(r2.newB - trueB) < Math.abs(authoredB - trueB));
  });

  test("too little data leaves the item untouched", () => {
    const meta: ItemMeta = { questionId: "q", estimatedSeconds: 40, optionLabels: [], keyLabels: [], a: 1, b: 0.75, c: 0, authoredB: 0.75 };
    const r = calibrateItem(meta, sim(-1, 50));
    assert.equal(r.calibrated, false);
    assert.equal(r.newB, 0.75);
  });
});

describe("placement check and item analysis on the database", () => {
  let repo: SqliteRepo;
  let lina: Actor, omar: Actor;
  const T0 = new Date("2026-09-14T07:30:00Z");
  let t = 0;
  const at = (sec = 35) => new Date(T0.getTime() + (t += sec) * 1000);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    lina = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1001" }))!);
    omar = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1002" }))!);
  });

  async function takeCheck(actor: Actor, truth: number) {
    let view = await startDiagnostic(repo, actor, at(0));
    const curSkills = await repo.findMany("Skill", {});
    const items = new Map((await loadItemsForSkills(repo, curSkills.map((k) => String(k.id)))).map((i) => [i.questionId, i]));
    let n = 0;
    while (view.question && n++ < 40) {
      const it = items.get(view.question.questionId)! as PracticeItem;
      const right = rand() < probability(truth, { a: it.irt.a, b: it.irt.b, c: 0 }, 2);
      const resp = it.options ? (it.type === "MULTI_SELECT" ? (right ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.map((o) => o.label)) : it.options.find((o) => o.correct === right)!.label)
        : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer)
        : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
        : it.type === "ERROR_CORRECTION" ? (right ? it.errorIndex : (it.errorIndex! + 1) % it.segments!.length)
        : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]))
        : right ? it.sequence : [...it.sequence!].reverse();
      view = await submitDiagnosticAnswer(repo, actor, { sessionId: view.sessionId, questionId: view.question.questionId, response: resp }, at());
    }
    return view;
  }

  test("the check sends no answer data, finishes in ≤ 24 questions, and stores a result", async () => {
    const first = await startDiagnostic(repo, lina, at(0));
    assert.ok(!JSON.stringify(first.question).match(/"(correct|rationale|whyCorrect|answers|errorIndex|pairs|sequence)"/));
    const view = await takeCheck(lina, 1.6);
    assert.equal(view.finished, true);
    assert.ok(view.answered <= 24 && view.answered >= 8, `answered ${view.answered}`);
    const r = view.result!;
    assert.ok(r.domains.length >= 3);
    assert.ok(["At grade level", "Above grade level"].includes(r.proficiency), r.proficiency);
    assert.ok(await repo.findUnique("StudentAbility", { studentId: lina.studentId, scope: "GLOBAL" }));
    assert.equal((await latestDiagnostic(repo, lina.studentId!))!.proficiency, r.proficiency);
  });

  test("a weaker student gets a lower placement, support skills, and easier first practice questions", async () => {
    const view = await takeCheck(omar, -1.8);
    const r = view.result!;
    assert.ok(["Below grade level", "Approaching grade level"].includes(r.proficiency), r.proficiency);
    assert.ok(r.growth.length >= 1);
    assert.ok(r.startWith.length >= 1, "recommends where to start");
    // practice in the same skill starts lower for the weaker student
    const skill = (await repo.findMany("Skill", { code: "G4.context-clues" })).find((k) => true)!;
    const pl = await startPractice(repo, lina, String(skill.id), at());
    const po = await startPractice(repo, omar, String(skill.id), at());
    const items = await loadItemsForSkills(repo, [String(skill.id)]);
    const bOf = (q: string) => items.find((i) => i.questionId === q)!.irt.b;
    assert.ok(bOf(po.question!.questionId) < bOf(pl.question!.questionId), "first practice item is easier for the weaker student");
  });

  test("the check does not change mastery, and nobody else can answer in it", async () => {
    assert.equal(await repo.count("StudentSkillMastery", { studentId: omar.studentId }), 0);
    const other = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1003" }))!);
    const v = await startDiagnostic(repo, other, at(0));
    await assert.rejects(submitDiagnosticAnswer(repo, lina, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, at()), /not yours/);
    const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    await assert.rejects(startDiagnostic(repo, teacher), /Only students/);
  });

  test("item analysis writes statistics for answered questions and audits calibrations", async () => {
    const rep = await runItemAnalysis(repo, { minResponses: 2 });
    assert.ok(rep.analysed > 10);
    assert.ok((await repo.count("QuestionStats")) === rep.analysed);
    if (rep.calibrated) assert.ok((await repo.count("AuditLog", { action: "question.calibrate" })) === rep.calibrated);
    const cal = await repo.findMany("Question", { calibrated: true });
    assert.equal(cal.length, rep.calibrated);
  });
});
