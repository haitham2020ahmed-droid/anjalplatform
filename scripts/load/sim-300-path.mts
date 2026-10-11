/**
 * Run: npx tsx scripts/load/sim-300-path.mts out.json [weeks]     (an in-memory test school, FAKE students only)
 *
 * 300 fictional students, each with a hidden "true" profile the platform never sees:
 *   ability (Below / On / Above), a different strength per skill, 0–2 weak FOUNDATION skills that drag down the skills
 *   built on them (the knowledge graph), 1–2 misconceptions (when wrong, they pick the option with that mistake),
 *   a behaviour (diligent · irregular · guesser) and a growth rate.
 * The same 300 students study for N weeks twice, on two copies of the platform:
 *   A · GENERIC        the old path: the first unmastered skill in curriculum order
 *   B · PERSONALIZED   Update 33: knowledge graph + ability + misconceptions + MAP area + progress speed
 * Every answer goes through the real adaptive engine. Learning is simulated: practice raises the true ability of the
 * skill (most when the question is at the right level); repairing a foundation also lifts the skills built on it.
 * Measured with the hidden truth: learning gain, gaps repaired, time on the real cause, time wasted on strong skills,
 * question targeting, path diversity, and whether the platform's diagnosis, level and misconception reports are right.
 */
import { writeFileSync } from "node:fs";
const R = process.cwd();
const OUT = process.argv[2] ?? "sim-300.json";
const WEEKS = Number(process.argv[3] ?? 4);
const imp = (p: string) => import(`${R}/${p}`);
const { demoDatabase } = await imp("tests/helpers/db");
const { seedTestEnvironment, rightAnswer } = await imp("src/server/seeding/test-env");
const { resolveActor } = await imp("src/server/auth/actor");
const { startPractice, submitAnswer, endPractice } = await imp("src/server/practice/session");
const { loadSkillItems } = await imp("src/server/practice/items");
const { ensurePrerequisites } = await imp("src/server/skills/auto-prerequisites");
const { tagOptions } = await imp("src/server/insights/misconception-tags");
const { loadGraph, skillStates, rootGaps, buildGraph } = await imp("src/server/graph/knowledge-graph");
const { pathContext, planFromContext, genericPath } = await imp("src/server/graph/learning-path");
const { buildProfiles, profilesOf } = await imp("src/server/insights/student-profile");

const N = 300;
const DAY = 86_400_000;
// deterministic random numbers (the same student gets the same profile and the same luck in both arms)
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const FOUNDATIONS = ["context-clues", "text-evidence", "central-idea", "sequence", "character", "sentences", "verbs", "commas", "plural-nouns", "prefixes"];
const MISC = ["DETAIL_NOT_MAIN", "NOT_SUPPORTED", "CONTEXT_IGNORED", "LITERAL_MEANING", "SEQUENCE_TIME", "CAUSE_EFFECT", "APOSTROPHE", "COMMA_PUNCT", "VERB_FORM", "SENTENCE_BOUNDARY"];
const family = (code: string) => code.slice(code.indexOf(".") + 1);

interface Latent { band: "BELOW" | "ON" | "ABOVE"; theta0: number; offset: Map<string, number>; gaps: Set<string>; misconceptions: string[]; behaviour: "DILIGENT" | "IRREGULAR" | "GUESSER"; lr: number }
function latentFor(i: number, families: string[]): Latent {
  const r = rng(1000 + i);
  const u = r(); const band = u < 0.3 ? "BELOW" : u < 0.7 ? "ON" : "ABOVE";
  const theta0 = (band === "BELOW" ? -1.1 : band === "ON" ? 0 : 1.1) + 0.35 * gauss(r);
  const offset = new Map(families.map((f) => [f, 0.4 * gauss(r)]));
  const nGaps = band === "BELOW" ? 2 : band === "ON" ? (r() < 0.6 ? 1 : 0) : (r() < 0.25 ? 1 : 0);
  const gaps = new Set<string>(); while (gaps.size < nGaps) gaps.add(FOUNDATIONS[Math.floor(r() * FOUNDATIONS.length)]);
  for (const g of gaps) offset.set(g, -1.4 + 0.2 * gauss(r));
  const misconceptions = [MISC[Math.floor(r() * MISC.length)]]; if (r() < 0.5) misconceptions.push(MISC[Math.floor(r() * MISC.length)]);
  const b = r(); const behaviour = b < 0.55 ? "DILIGENT" : b < 0.85 ? "IRREGULAR" : "GUESSER";
  return { band, theta0, offset, gaps, misconceptions, behaviour, lr: 0.015 + 0.03 * r() };
}

async function school() {
  const { repo } = await demoDatabase();
  await seedTestEnvironment(repo, { root: R, passwordHash: "x".repeat(60), practice: "none" });
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
  // 100 more fictional students, spread over the test classes (FAKE names only)
  const classes = (await repo.findMany("Class", { schoolId: admin.schoolId })).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  for (let k = 0; k < 100; k++) {
    const c = classes[k % classes.length];
    const tag = String(201 + k).padStart(3, "0");
    const u = await repo.create("User", { username: `test.student.${tag}`, displayName: `Test Student ${tag}`, role: "STUDENT", schoolId: admin.schoolId, passwordHash: "x".repeat(60), mustChangePassword: false });
    const st = await repo.create("Student", { userId: u.id, schoolId: admin.schoolId, gradeId: c.gradeId, studentNumber: `TEST-${tag}` });
    await repo.create("ClassMembership", { classId: c.id, studentId: st.id });
  }
  await ensurePrerequisites(repo);
  await tagOptions(repo);
  const users = (await repo.findMany("User", { role: "STUDENT", schoolId: admin.schoolId })).filter((u: any) => /^test\.student\./.test(String(u.username))).sort((a: any, b: any) => String(a.username).localeCompare(String(b.username))).slice(0, N);
  const students = [];
  for (const u of users) { const actor = await resolveActor(repo, u); const st = await repo.findUnique("Student", { id: actor.studentId }); students.push({ actor, id: String(actor.studentId), gradeId: String(st.gradeId) }); }
  return { repo, admin, students };
}

async function runArm(arm: "GENERIC" | "PERSONALIZED") {
  const t0 = performance.now();
  const { repo, admin, students } = await school();
  // the grade graphs and the true ability per skill
  const graphs = new Map<string, any>();
  const curOf = new Map<string, string>();
  for (const st of students) if (!curOf.has(st.gradeId)) { const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0]; curOf.set(st.gradeId, String(cur.id)); graphs.set(st.gradeId, await loadGraph(repo, String(cur.id))); }
  const allFamilies = [...new Set([...graphs.values()].flatMap((g: any) => [...g.nodes.values()].map((n: any) => n.family)))];
  const lat = students.map((_, i) => latentFor(i, allFamilies));
  // effective ability on a skill = own strength − half of what its weak prerequisites are missing (recursive, depth ≤ 3)
  const own = students.map((_, i) => new Map(allFamilies.map((f) => [f, lat[i].theta0 + (lat[i].offset.get(f) ?? 0)])));
  const eff = (i: number, g: any, skillId: string, depth = 0): number => {
    const n = g.nodes.get(skillId); const base = own[i].get(n.family)!;
    if (depth >= 3) return base;
    let drag = 0;
    for (const e of g.prereqs.get(skillId) ?? []) drag += 0.5 * Math.max(0, lat[i].theta0 - eff(i, g, e.prerequisiteSkillId, depth + 1));
    return base - drag;
  };
  const meanEff = (i: number) => { const g = graphs.get(students[i].gradeId); const ids = [...g.nodes.keys()]; return ids.reduce((a, id) => a + eff(i, g, id), 0) / ids.length; };
  const start = students.map((_, i) => meanEff(i));
  const gapStart = students.map((_, i) => [...lat[i].gaps].map((f) => own[i].get(f)!));
  const m = { answers: 0, productive: 0, absGap: 0, sessions: 0, onCause: 0, sessionsWithGaps: 0, onStrong: 0, firstThree: new Set<string>() };
  const clock0 = Date.UTC(2026, 9, 4, 6, 0, 0);
  for (let w = 0; w < WEEKS; w++) {
    for (let i = 0; i < students.length; i++) {
      const L = lat[i], st = students[i], g = graphs.get(st.gradeId), r = rng(50_000 + i * 97 + w);
      const sessions = L.behaviour === "DILIGENT" ? 4 : L.behaviour === "IRREGULAR" ? (r() < 0.5 ? 1 : 2) : 3;
      for (let sN = 0; sN < sessions; sN++) {
        const now = new Date(clock0 + (w * 7 + sN * 1.5) * DAY + i * 60_000);
        const ctx = await pathContext(repo, st.id, now);
        if (!ctx) continue;
        const steps = arm === "GENERIC" ? genericPath(ctx, 3) : planFromContext(ctx, 3).steps;
        if (!steps.length) continue;
        if (w === WEEKS - 1 && sN === 0) m.firstThree.add(steps.map((x: any) => x.skillId).join(">"));
        const skillId = steps[0].skillId, fam = g.nodes.get(skillId).family;
        m.sessions++;
        // on the real cause: a latent gap, or a skill whose weakness comes from a latent gap underneath
        if (L.gaps.size) { m.sessionsWithGaps++; if (L.gaps.has(fam)) m.onCause++; }
        if (eff(i, g, skillId) >= L.theta0 + 0.6 && eff(i, g, skillId) >= 0.8) m.onStrong++;
        let v: any;
        try { v = await startPractice(repo, st.actor, skillId, now); } catch { continue; }
        const items = new Map((await loadSkillItems(repo, skillId)).map((it: any) => [it.questionId, it]));
        let t = now.getTime();
        for (let q = 0; q < 10 && v?.question; q++) {
          const it: any = items.get(v.question.questionId);
          const th = eff(i, g, skillId);
          const guess = L.behaviour === "GUESSER" && r() < 0.3;
          const c = it.options && it.type !== "MULTI_SELECT" ? 1 / it.options.length : 0.05;
          const p = guess ? c : c + (1 - c) / (1 + Math.exp(-1.7 * (th - it.irt.b)));
          const correct = r() < p;
          let response: unknown = rightAnswer(it);
          if (!correct) {
            if (it.options && (it.type === "MULTIPLE_CHOICE" || it.type === "DROPDOWN")) {
              const wrong = it.options.filter((o: any) => !o.correct);
              const mine = wrong.find((o: any) => L.misconceptions.includes(o.misconception));
              response = (mine && r() < 0.8 ? mine : wrong[Math.floor(r() * wrong.length)]).label;
            } else if (it.type === "MULTI_SELECT") response = [it.options.find((o: any) => !o.correct).label];
            else if (it.type === "TRUE_FALSE") response = !it.answer;
            else if (it.type === "ERROR_CORRECTION") response = (it.errorIndex + 1) % it.segments.length;
            else if (it.type === "FILL_BLANK") response = "zzz";
            else if (it.sequence) response = [...it.sequence].reverse();
            else if (it.pairs) response = Object.fromEntries(it.pairs.map((x: any, k: number, a: any[]) => [x.left, a[(k + 1) % a.length].right]));
          }
          t += guess ? 3_000 : 25_000 + Math.floor(r() * 20_000);
          m.answers++; const pTrue = 1 / (1 + Math.exp(-1.7 * (th - it.irt.b)));
          if (pTrue >= 0.5 && pTrue <= 0.85) m.productive++;
          m.absGap += Math.abs(th - it.irt.b);
          // learning: practice raises the skill's own strength, most in the productive zone; guessing teaches little
          const zone = pTrue >= 0.45 && pTrue <= 0.9 ? 1 : 0.35;
          own[i].set(fam, own[i].get(fam)! + (guess ? 0.1 : 1) * L.lr * zone);
          try { v = (await submitAnswer(repo, st.actor, { sessionId: v.sessionId, questionId: it.questionId, response }, new Date(t))).view; } catch { break; }
        }
        if (v && !v.ended) await endPractice(repo, st.actor, v.sessionId, new Date(t)).catch(() => null);
      }
    }
    console.log(`${arm}: week ${w + 1}/${WEEKS} · ${m.answers} answers · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  }
  const end = students.map((_, i) => meanEff(i));
  const gapEnd = students.map((_, i) => [...lat[i].gaps].map((f) => own[i].get(f)!));
  // the platform's view at the end vs the hidden truth
  const endNow = new Date(clock0 + WEEKS * 7 * DAY);
  await buildProfiles(repo, String(admin.schoolId), endNow);
  const prof = await profilesOf(repo, students.map((s) => s.id));
  let diagHit = 0, diagN = 0, levelOk = 0, levelN = 0, misOk = 0, misN = 0;
  for (let i = 0; i < students.length; i++) {
    const g = graphs.get(students[i].gradeId);
    const states = await skillStates(repo, students[i].id, [...g.nodes.keys()]);
    const gaps = rootGaps(g, states).slice(0, 3).map((x: any) => g.nodes.get(x.skillId).family);
    const testedGaps = [...lat[i].gaps].filter((f) => { const id = g.byFamily.get(f); return id && (states.get(id)?.attempts ?? 0) >= 3; });
    if (testedGaps.length) { diagN += testedGaps.length; diagHit += testedGaps.filter((f) => gaps.includes(f)).length; }
    const p = prof.get(students[i].id);
    if (p && p.levelSource === "PLATFORM") { levelN++; const truth = meanEff(i) <= -0.6 ? "BELOW" : meanEff(i) >= 0.6 ? "ABOVE" : "ON"; if (p.level === truth) levelOk++; }
    if (p && p.misconceptions.length) { misN++; if (lat[i].misconceptions.includes(p.misconceptions[0].code)) misOk++; }
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const byBand = (band: string) => avg(students.map((_, i) => i).filter((i) => lat[i].band === band).map((i) => end[i] - start[i]));
  const gapsAll = gapStart.flat().length;
  const repaired = students.reduce((a, _, i) => a + gapEnd[i].filter((x) => x >= lat[i].theta0 - 0.5).length, 0);
  return {
    arm, seconds: Math.round((performance.now() - t0) / 1000), students: students.length, weeks: WEEKS, answers: m.answers, sessions: m.sessions,
    learningGain: +avg(end.map((e, i) => e - start[i])).toFixed(3),
    gainByBand: { BELOW: +byBand("BELOW").toFixed(3), ON: +byBand("ON").toFixed(3), ABOVE: +byBand("ABOVE").toFixed(3) },
    gapsRepairedPct: Math.round((100 * repaired) / Math.max(1, gapsAll)), latentGaps: gapsAll,
    gapRise: +avg(students.flatMap((_, i) => gapEnd[i].map((x, k) => x - gapStart[i][k]))).toFixed(3),
    sessionsOnTrueGapPct: Math.round((100 * m.onCause) / Math.max(1, m.sessionsWithGaps)),
    sessionsOnStrongSkillsPct: Math.round((100 * m.onStrong) / Math.max(1, m.sessions)),
    productiveAnswersPct: Math.round((100 * m.productive) / Math.max(1, m.answers)), meanDistanceItemToAbility: +(m.absGap / Math.max(1, m.answers)).toFixed(3),
    distinctFirstPaths: m.firstThree.size,
    diagnosisRecallPct: Math.round((100 * diagHit) / Math.max(1, diagN)), diagnosisChecked: diagN,
    levelAgreementPct: Math.round((100 * levelOk) / Math.max(1, levelN)), levelChecked: levelN,
    misconceptionDetectedPct: Math.round((100 * misOk) / Math.max(1, misN)), misconceptionChecked: misN,
    bands: { BELOW: lat.filter((x) => x.band === "BELOW").length, ON: lat.filter((x) => x.band === "ON").length, ABOVE: lat.filter((x) => x.band === "ABOVE").length },
    behaviours: { DILIGENT: lat.filter((x) => x.behaviour === "DILIGENT").length, IRREGULAR: lat.filter((x) => x.behaviour === "IRREGULAR").length, GUESSER: lat.filter((x) => x.behaviour === "GUESSER").length },
  };
}

const A = await runArm("GENERIC");
console.log(JSON.stringify(A));
const B = await runArm("PERSONALIZED");
console.log(JSON.stringify(B));
writeFileSync(OUT, JSON.stringify({ generic: A, personalized: B }, null, 1));
void buildGraph;
