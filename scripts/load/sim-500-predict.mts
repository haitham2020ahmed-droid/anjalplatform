/**
 * Run: npx tsx scripts/load/sim-500-predict.mts out.json   (an in-memory test school, FAKE students only)
 *
 * Tests Update 34's intelligence against a hidden truth, with 500 fictional students:
 *   abilities (Below / On / Above) · behaviours (diligent, irregular, guessing, DECLINING after week 3, LATE START) ·
 *   weak foundation skills · misconceptions · growth rates · a Fall MAP score.
 * Weeks 1–6: they study on the platform (real engine, personal learning path, the tutor after wrong answers).
 * End of week 6: the platform predicts who will MISS the Spring MAP goal (early warning).
 * Weeks 7–16 are then played out from each student's hidden learning (their practice pattern continues) and the
 * Spring score decides who really missed the goal. Measured: prediction accuracy (AUC, precision of the top 20%,
 * calibration), the learned model vs the expert model on students it never saw, the tutor (names the mistake, never
 * gives the answer, simpler for Below Level), and the Copilot (are its groups the students who really need them?).
 */
import { writeFileSync } from "node:fs";
const R = process.cwd();
const OUT = process.argv[2] ?? "sim-500.json";
const imp = (p: string) => import(`${R}/${p}`);
const { demoDatabase } = await imp("tests/helpers/db");
const { seedTestEnvironment, rightAnswer } = await imp("src/server/seeding/test-env");
const { resolveActor } = await imp("src/server/auth/actor");
const { startPractice, submitAnswer, endPractice } = await imp("src/server/practice/session");
const { loadSkillItems } = await imp("src/server/practice/items");
const { ensurePrerequisites } = await imp("src/server/skills/auto-prerequisites");
const { tagOptions } = await imp("src/server/insights/misconception-tags");
const { loadGraph } = await imp("src/server/graph/knowledge-graph");
const { pathContext, planFromContext } = await imp("src/server/graph/learning-path");
const { buildProfiles } = await imp("src/server/insights/student-profile");
const { computeRisks, auc, fitLogistic, riskProbability, EXPERT_WEIGHTS } = await imp("src/server/predict/risk");
const { tutorLeaksAnswer } = await imp("src/tutor/tutor");
const { classIntelligence, copilotAnswer } = await imp("src/server/copilot/copilot");
const { analyzeText } = await imp("src/reading/prl");

const N = Number(process.env.SIMN ?? 500), WEEKS = Number(process.env.SIMW ?? 6), TERM = 16, DAY = 86_400_000;
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const FOUNDATIONS = ["context-clues", "text-evidence", "central-idea", "sequence", "character", "sentences", "verbs", "commas", "plural-nouns", "prefixes"];
const MISC = ["DETAIL_NOT_MAIN", "NOT_SUPPORTED", "CONTEXT_IGNORED", "LITERAL_MEANING", "SEQUENCE_TIME", "CAUSE_EFFECT", "APOSTROPHE", "COMMA_PUNCT", "VERB_FORM", "SENTENCE_BOUNDARY"];
type Behaviour = "DILIGENT" | "IRREGULAR" | "GUESSER" | "DECLINING" | "LATE_START";
const sessionsFor = (b: Behaviour, w: number, r: () => number) => b === "DILIGENT" ? 4 : b === "IRREGULAR" ? (r() < 0.5 ? 1 : 2) : b === "GUESSER" ? 3 : b === "DECLINING" ? (w < 3 ? 4 : w < 4 ? 1 : 0) : (w < 3 ? 0 : 4);

const { repo } = await demoDatabase();
await seedTestEnvironment(repo, { root: R, passwordHash: "x".repeat(60), practice: "none" });
const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
const classes = (await repo.findMany("Class", { schoolId: admin.schoolId })).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
for (let k = 0; k < N - 200; k++) {
  const c = classes[k % classes.length]; const tag = String(201 + k).padStart(3, "0");
  const u = await repo.create("User", { username: `test.student.${tag}`, displayName: `Test Student ${tag}`, role: "STUDENT", schoolId: admin.schoolId, passwordHash: "x".repeat(60), mustChangePassword: false });
  const st = await repo.create("Student", { userId: u.id, schoolId: admin.schoolId, gradeId: c.gradeId, studentNumber: `TEST-${tag}` });
  await repo.create("ClassMembership", { classId: c.id, studentId: st.id });
}
await ensurePrerequisites(repo); await tagOptions(repo);
const users = (await repo.findMany("User", { role: "STUDENT", schoolId: admin.schoolId })).filter((u: any) => /^test\.student\./.test(String(u.username))).sort((a: any, b: any) => String(a.username).localeCompare(String(b.username))).slice(0, N);
const S: any[] = [];
for (const u of users) { const actor = await resolveActor(repo, u); const st = await repo.findUnique("Student", { id: actor.studentId }); S.push({ actor, id: String(actor.studentId), gradeId: String(st.gradeId) }); }
const graphs = new Map<string, any>();
for (const st of S) if (!graphs.has(st.gradeId)) { const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0]; graphs.set(st.gradeId, await loadGraph(repo, String(cur.id))); }
const fams = [...new Set([...graphs.values()].flatMap((g: any) => [...g.nodes.values()].map((n: any) => n.family)))];
const L = S.map((_, i) => {
  const r = rng(7000 + i); const u = r();
  const band = u < 0.3 ? "BELOW" : u < 0.7 ? "ON" : "ABOVE";
  const theta0 = (band === "BELOW" ? -1.1 : band === "ON" ? 0 : 1.1) + 0.35 * gauss(r);
  const offset = new Map(fams.map((f) => [f, 0.4 * gauss(r)]));
  const gaps = new Set<string>(); const ng = band === "BELOW" ? 2 : band === "ON" ? (r() < 0.6 ? 1 : 0) : (r() < 0.25 ? 1 : 0);
  while (gaps.size < ng) gaps.add(FOUNDATIONS[Math.floor(r() * FOUNDATIONS.length)]);
  for (const g of gaps) offset.set(g, -1.4 + 0.2 * gauss(r));
  const b = r(); const behaviour: Behaviour = b < 0.4 ? "DILIGENT" : b < 0.6 ? "IRREGULAR" : b < 0.72 ? "GUESSER" : b < 0.86 ? "DECLINING" : "LATE_START";
  return { band, theta0, offset, gaps, mis: [MISC[Math.floor(r() * MISC.length)]], behaviour, lr: 0.015 + 0.03 * r(), fall: Math.round(200 + 10 * theta0 + 3 * gauss(r)) };
});
const own = S.map((_, i) => new Map(fams.map((f) => [f, L[i].theta0 + (L[i].offset.get(f) ?? 0)])));
const eff = (i: number, g: any, id: string, d = 0): number => { const n = g.nodes.get(id); const b0 = own[i].get(n.family)!; if (d >= 3) return b0; let drag = 0; for (const e of g.prereqs.get(id) ?? []) drag += 0.5 * Math.max(0, L[i].theta0 - eff(i, g, e.prerequisiteSkillId, d + 1)); return b0 - drag; };
const meanEff = (i: number) => { const g = graphs.get(S[i].gradeId); const ids = [...g.nodes.keys()]; return ids.reduce((a, id) => a + eff(i, g, id), 0) / ids.length; };
const start = S.map((_, i) => meanEff(i));
const clock0 = Date.UTC(2026, 8, 13, 6);
// Fall MAP for everyone (goal = Fall + 7, NWEA-style projected growth)
for (let i = 0; i < N; i++) await repo.create("MapResult", { studentId: S[i].id, testDate: new Date(clock0 - 3 * DAY), subject: "Reading", goalName: null, rit: L[i].fall, projectedGrowth: 7, termName: "Fall 2026", importedAt: new Date(clock0) });
const tutorStats = { wrong: 0, withTutor: 0, named: 0, leaks: 0, belowWords: [] as number[], onWords: [] as number[] };
const gainLast2 = S.map(() => 0);
const careful = S.map(() => [] as number[]); // careful (non-guess) answers per week
const t0 = performance.now();
for (let w = 0; w < WEEKS; w++) {
  for (let i = 0; i < N; i++) {
    const st = S[i], g = graphs.get(st.gradeId), r = rng(90_000 + i * 131 + w), Li = L[i];
    const before = meanEff(i);
    for (let sN = 0; sN < sessionsFor(Li.behaviour, w, r); sN++) {
      const now = new Date(clock0 + (w * 7 + sN * 1.5) * DAY + i * 60_000);
      const ctx = await pathContext(repo, st.id, now); if (!ctx) continue;
      const step = planFromContext(ctx, 3).steps[0]; if (!step) continue;
      const fam = g.nodes.get(step.skillId).family;
      let v: any; try { v = await startPractice(repo, st.actor, step.skillId, now); } catch { continue; }
      const items = new Map((await loadSkillItems(repo, step.skillId)).map((it: any) => [it.questionId, it]));
      let t = now.getTime();
      for (let q = 0; q < 10 && v?.question; q++) {
        const it: any = items.get(v.question.questionId); const th = eff(i, g, step.skillId);
        const guess = Li.behaviour === "GUESSER" && r() < 0.35;
        const c = it.options && it.type !== "MULTI_SELECT" ? 1 / it.options.length : 0.05;
        const correct = r() < (guess ? c : c + (1 - c) / (1 + Math.exp(-1.7 * (th - it.irt.b))));
        let response: unknown = rightAnswer(it);
        if (!correct) {
          if (it.options && (it.type === "MULTIPLE_CHOICE" || it.type === "DROPDOWN")) { const wr = it.options.filter((o: any) => !o.correct); const mine = wr.find((o: any) => Li.mis.includes(o.misconception)); response = (mine && r() < 0.8 ? mine : wr[Math.floor(r() * wr.length)]).label; }
          else if (it.type === "MULTI_SELECT") response = [it.options.find((o: any) => !o.correct).label];
          else if (it.type === "TRUE_FALSE") response = !it.answer;
          else if (it.type === "ERROR_CORRECTION") response = (it.errorIndex + 1) % it.segments.length;
          else if (it.type === "FILL_BLANK") response = "zzz";
          else if (it.sequence) response = [...it.sequence].reverse();
          else if (it.pairs) response = Object.fromEntries(it.pairs.map((x: any, k: number, a: any[]) => [x.left, a[(k + 1) % a.length].right]));
        }
        t += guess ? 3_000 : 25_000 + Math.floor(r() * 20_000);
        if (!guess) careful[i][w] = (careful[i][w] ?? 0) + 1;
        const pTrue = 1 / (1 + Math.exp(-1.7 * (th - it.irt.b)));
        own[i].set(fam, own[i].get(fam)! + (guess ? 0.1 : 1) * Li.lr * (pTrue >= 0.45 && pTrue <= 0.9 ? 1 : 0.35));
        let res: any; try { res = await submitAnswer(repo, st.actor, { sessionId: v.sessionId, questionId: it.questionId, response }, new Date(t)); } catch { break; }
        if (!res.feedback.correct) {
          tutorStats.wrong++;
          const tu = res.feedback.tutor;
          if (tu) {
            tutorStats.withTutor++;
            if (tu.misconception) tutorStats.named++;
            if (tutorLeaksAnswer(tu, [res.feedback.correctAnswer, ...(it.options ?? []).filter((o: any) => o.correct).map((o: any) => o.text)])) { tutorStats.leaks++; if (process.env.DBG) console.log("LEAK", JSON.stringify({ q: it.questionId, ans: res.feedback.correctAnswer, tu })); }
            const words = analyzeText(tu.message).avgSentenceLength;
            (eff(i, g, step.skillId) <= -0.75 ? tutorStats.belowWords : tutorStats.onWords).push(words);
          }
        }
        v = res.view;
      }
      if (v && !v.ended) await endPractice(repo, st.actor, v.sessionId, new Date(t)).catch(() => null);
    }
    if (w >= WEEKS - 2) gainLast2[i] += meanEff(i) - before;
  }
  console.log(`week ${w + 1}/${WEEKS} · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}
// end of week 6: the platform's prediction
const at6 = new Date(clock0 + WEEKS * 7 * DAY);
await buildProfiles(repo, String(admin.schoolId), at6);
await computeRisks(repo, String(admin.schoolId), at6);
const prof = new Map((await repo.findMany("StudentProfile", { studentId: { in: S.map((s) => s.id) } })).map((p: any) => [String(p.studentId), p]));
const snaps = new Map((await repo.findMany("RiskSnapshot", { studentId: { in: S.map((s) => s.id) } })).map((p: any) => [String(p.studentId), p]));
// weeks 7–16 played out from the hidden learning: the last two weeks' pace continues; Spring decides
const missed: boolean[] = [], score: number[] = [], feats: any[] = [];
for (let i = 0; i < N; i++) {
  const r = rng(555_000 + i);
  // NWEA-style growth: maturation + careful practice (the pace of the last two weeks continues to week 16) − weak
  // foundations still unrepaired (the hidden gaps, measured on the true ability) + test-day noise
  const done = careful[i].reduce((a, x) => a + (x ?? 0), 0);
  const recentPerWeek = ((careful[i][WEEKS - 1] ?? 0) + (careful[i][WEEKS - 2] ?? 0)) / 2;
  const g = graphs.get(S[i].gradeId);
  const unrepaired = [...L[i].gaps].filter((f) => { const id = g.byFamily.get(f); return id && eff(i, g, id) < L[i].theta0 - 0.8; }).length;
  const spring = L[i].fall + 3 + 0.012 * (done + recentPerWeek * (TERM - WEEKS)) - 1.5 * unrepaired + 3 * gauss(r);
  missed.push(spring < L[i].fall + 6); // goal = typical projected growth; tuned so about half to two-thirds miss, as in NWEA norms
  score.push(Number(prof.get(S[i].id)?.riskScore ?? 50) / 100);
  const sn = snaps.get(S[i].id); feats.push(typeof sn?.features === "string" ? JSON.parse(sn.features) : sn?.features);
}
const order = S.map((_, i) => i).sort((a, b) => score[b] - score[a]);
const top20 = order.slice(0, Math.round(N * 0.2));
const brier = score.reduce((a, p, i) => a + (p - (missed[i] ? 1 : 0)) ** 2, 0) / N;
const deciles = [0, 1, 2, 3, 4].map((k) => { const idx = order.slice(Math.floor((k * N) / 5), Math.floor(((k + 1) * N) / 5)); return { predicted: Math.round(100 * idx.reduce((a, i) => a + score[i], 0) / idx.length), actual: Math.round(100 * idx.filter((i) => missed[i]).length / idx.length) }; });
// the learned model: fit on half, test on the other half
const half = S.map((_, i) => i).filter((i) => i % 2 === 0), other = S.map((_, i) => i).filter((i) => i % 2 === 1);
const learned = fitLogistic(half.map((i) => feats[i]), half.map((i) => missed[i]), EXPERT_WEIGHTS, 0.02, 1200, 0.2);
const aucExpertTest = auc(other.map((i) => riskProbability(feats[i])), other.map((i) => missed[i]));
const aucLearnedTest = auc(other.map((i) => riskProbability(feats[i], learned)), other.map((i) => missed[i]));
const brierOf = (w?: any) => other.reduce((a, i) => a + (riskProbability(feats[i], w) - (missed[i] ? 1 : 0)) ** 2, 0) / other.length;
const brierExpertTest = brierOf(), brierLearnedTest = brierOf(learned);
// the Copilot: does its foundation group hold students who really have that weak foundation?
let grpHit = 0, grpN = 0, misHit = 0, misN = 0;
for (const c of classes) {
  const teacherLink = (await repo.findMany("ClassTeacher", { classId: c.id }))[0];
  const tUser = (await repo.findUnique("Teacher", { id: teacherLink.teacherId }))!.userId;
  const actor = await resolveActor(repo, (await repo.findUnique("User", { id: tUser }))!);
  const intel = await classIntelligence(repo, actor, String(c.id), at6);
  const a = await copilotAnswer(repo, intel, "GROUPS");
  for (const gr of a.groups) {
    if (gr.name.startsWith("🧱")) { const g = graphs.get(String(c.gradeId)); const fam = gr.skillId ? g.nodes.get(gr.skillId)?.family : null; for (const sid of gr.studentIds) { const i = S.findIndex((s) => s.id === sid); if (i < 0) continue; grpN++; const famIds = fam ? [g.byFamily.get(fam)] : []; const tr = famIds[0] ? eff(i, g, famIds[0]) : 0; const hit = (fam && L[i].gaps.has(fam)) || (famIds[0] && (tr < L[i].theta0 - 0.5 || tr <= -0.6)); if (hit) grpHit++; if (process.env.DBG && grpN < 40) { const ab = await repo.findUnique("StudentAbility", { studentId: sid, scope: `SKILL:${famIds[0]}` }); const ms = await repo.findUnique("StudentSkillMastery", { studentId: sid, skillId: famIds[0] }); console.log("DBG", fam, hit, "true", tr.toFixed(2), "theta0", L[i].theta0.toFixed(2), "measured", ab?.theta, ab?.thetaSE, ab?.responses, "mastery", ms?.score, ms?.attempts); } } }
    if (gr.name.startsWith("🔍")) for (const sid of gr.studentIds) { const i = S.findIndex((s) => s.id === sid); if (i < 0) continue; misN++; if (L[i].mis.some((m: string) => intel.misconceptions[0]?.code === m)) misHit++; }
  }
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const behaviourMiss: Record<string, { n: number; missed: number; avgRisk: number }> = {};
for (let i = 0; i < N; i++) { const b = L[i].behaviour; const e = behaviourMiss[b] ?? { n: 0, missed: 0, avgRisk: 0 }; e.n++; if (missed[i]) e.missed++; e.avgRisk += score[i] * 100; behaviourMiss[b] = e; }
for (const e of Object.values(behaviourMiss)) e.avgRisk = Math.round(e.avgRisk / e.n);
const result = {
  students: N, weeks: WEEKS, seconds: Math.round((performance.now() - t0) / 1000),
  missedGoal: missed.filter(Boolean).length,
  prediction: { auc: +auc(score, missed).toFixed(3), brier: +brier.toFixed(3), top20Precision: Math.round(100 * top20.filter((i) => missed[i]).length / top20.length), baseRate: Math.round(100 * missed.filter(Boolean).length / N), byFifth: deciles },
  learnedModel: { aucExpertOnUnseen: +aucExpertTest.toFixed(3), aucLearnedOnUnseen: +aucLearnedTest.toFixed(3), brierExpertOnUnseen: +brierExpertTest.toFixed(3), brierLearnedOnUnseen: +brierLearnedTest.toFixed(3), weights: learned },
  byBehaviour: behaviourMiss,
  tutor: { wrongAnswers: tutorStats.wrong, withTutor: tutorStats.withTutor, namedMistakePct: Math.round(100 * tutorStats.named / Math.max(1, tutorStats.withTutor)), answerLeaks: tutorStats.leaks, wordsPerSentenceBelow: +avg(tutorStats.belowWords).toFixed(1), wordsPerSentenceOthers: +avg(tutorStats.onWords).toFixed(1) },
  copilot: { foundationGroupCorrectPct: Math.round(100 * grpHit / Math.max(1, grpN)), foundationGroupStudents: grpN, misconceptionGroupCorrectPct: Math.round(100 * misHit / Math.max(1, misN)), misconceptionGroupStudents: misN },
};
console.log(JSON.stringify(result, null, 1));
writeFileSync(OUT, JSON.stringify(result, null, 1));
