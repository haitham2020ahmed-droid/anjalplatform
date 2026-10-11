/**
 * Run: npx tsx scripts/load/students-150.mts load-result.json   (about one minute; uses an in-memory test school)
 * Load & integrity test: 150 students at the same time (FAKE data only — the Test School).
 * Every student's actions run interleaved (all awaiting the same database), like simultaneous requests.
 * Measures each action's time and its number of database queries, then checks every number the reports show.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
const R = process.cwd();
const { demoDatabase } = await import(`${R}/tests/helpers/db`);
const { seedTestEnvironment, rightAnswer } = await import(`${R}/src/server/seeding/test-env`);
const { resolveActor } = await import(`${R}/src/server/auth/actor`);
const { parseCurriculumMap } = await import(`${R}/src/server/curriculum-map/source`);
const { seedCurriculumMap } = await import(`${R}/src/server/curriculum-map/seed`);
const { createDraft } = await import(`${R}/src/server/admin/questions`);
const { startQuiz, submitQuizAnswer } = await import(`${R}/src/server/practice/session`);
const { loadQuestionItems } = await import(`${R}/src/server/practice/items`);
const { buildDiagnostic, openDiagnostic, myDiagnostic } = await import(`${R}/src/server/diagnostic/test`);
const { classDiagnosticReport, studentDiagnosticReport, shareDiagnosticResults } = await import(`${R}/src/server/diagnostic/report`);
const { sendCurriculumPlan, openPlanItem, curriculumPlanGrid } = await import(`${R}/src/server/curriculum-map/curriculum-plan`);
const { skillPlanForStudent, todaysPlanStep } = await import(`${R}/src/server/curriculum-map/plans`);
const { openWeeklyCheck, weeklyCheck } = await import(`${R}/src/server/student/weekly-check`);
const { supportGroups } = await import(`${R}/src/server/teacher/support`);
const { goalProgress } = await import(`${R}/src/server/admin/school-goals`);
const { assignedSkills } = await import(`${R}/src/server/student/assigned`);
const { classDoc } = await import(`${R}/src/server/diagnostic/export`);
const { renderXlsx } = await import(`${R}/src/reports/xlsx`);
const { weekStats } = await import(`${R}/src/server/student/weekly`);

// ---------------------------------------------------------------- instrumentation
const als = new AsyncLocalStorage<{ q: number }>();
const stats = new Map<string, { ms: number[]; q: number[]; err: number; errors: string[] }>();
const { repo: raw } = await demoDatabase();
const repo: any = new Proxy(raw, { get(t, k) { const v = (t as any)[k]; if (typeof v !== "function") return v; return (...a: unknown[]) => { const c = als.getStore(); if (c) c.q++; return k === "transaction" ? v.call(t, (tx: any) => (a[0] as any)(new Proxy(tx, { get(tt, kk) { const vv = tt[kk]; return typeof vv === "function" ? (...b: unknown[]) => { const cc = als.getStore(); if (cc) cc.q++; return vv.apply(tt, b); } : vv; } }))) : v.apply(t, a); }; } });
async function op<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const s = stats.get(name) ?? { ms: [], q: [], err: 0, errors: [] }; stats.set(name, s);
  const ctx = { q: 0 }; const t0 = performance.now();
  try { return await als.run(ctx, fn); }
  catch (e) { s.err++; if (s.errors.length < 5) s.errors.push(String((e as Error).message).slice(0, 140)); return undefined; }
  finally { s.ms.push(performance.now() - t0); s.q.push(ctx.q); }
}
const tick = () => new Promise((r) => setImmediate(r));
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

// ---------------------------------------------------------------- setup
const T0 = performance.now();
await seedTestEnvironment(raw, { root: R, passwordHash: "x".repeat(60), practice: "none" });
const actorOf = async (u: string) => resolveActor(raw, (await raw.findUnique("User", { username: u }))!);
const admin = await actorOf("test.admin");
await seedCurriculumMap(raw, parseCurriculumMap(readFileSync(`${R}/data/curriculum-map/source.txt`, "utf8")), { schoolId: admin.schoolId! });
await raw.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
const { attachmentNodes } = await import(`${R}/src/server/curriculum-map/questions`);
const nodesAll = await attachmentNodes(raw, admin.schoolId!);
const FIRST: Record<number, string> = {};
for (const g of [4, 5, 6]) FIRST[g] = nodesAll.filter((n: any) => n.grade === g && /\.ACS\.BELOW$/.test(n.code)).sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }))[0].code.replace(/\.BELOW$/, "");
console.log("first parts", FIRST);
const STD = (g: number) => [`RL.${g}.1`, `RL.${g}.2`, `RL.${g}.3`, `RL.${g}.6`, `RI.${g}.2`, `RI.${g}.3`, `RI.${g}.5`, `RI.${g}.8`, `L.${g}.4`, `L.${g}.5`, `L.${g}.1`, `L.${g}.2`];
for (const g of [4, 5, 6]) {
  const gr = (await raw.findMany("Grade", { schoolId: admin.schoolId, level: g }))[0];
  const cur = (await raw.findMany("Curriculum", { gradeId: gr.id }))[0];
  const skill = (await raw.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0];
  const ids: string[] = [];
  for (const code of STD(g)) {
    if (!(await raw.findMany("Standard", { code: `CCSS.ELA-LITERACY.${code}` })).length) await raw.create("Standard", { framework: "CCSS", code: `CCSS.ELA-LITERACY.${code}`, description: code, gradeLevel: g, strand: code.split(".")[0], isActive: true });
    for (let i = 0; i < 6; i++) ids.push(await createDraft(raw, admin, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.${code}`, type: "MULTIPLE_CHOICE", stem: `G${g} ${code} question ${i} about the text`, level: 2 + (i % 5), whyCorrect: "Because.", options: [{ label: "A", text: `right ${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${i}`, correct: false, rationale: "No." }, { label: "C", text: `other ${i}`, correct: false, rationale: "No." }] } as never));
  }
  // the first part of the curriculum plan: 15 questions at each level
  for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 15; i++) ids.push(await createDraft(raw, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `G${g} map ${lv} question ${i}`, level: 4, whyCorrect: "Because.", lexile: 700 + i * 10, mapNodeCode: `${FIRST[g]}.${lv}`, options: [{ label: "A", text: `right ${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${lv}${i}`, correct: false, rationale: "No." }] } as never));
  await raw.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  const b = await buildDiagnostic(raw, admin, { grade: g, size: 50 });
  await openDiagnostic(raw, admin, b.id, {});
}
const tests = await raw.findMany("DiagnosticTest", {});
// 150 students: 25 from each of the 6 test classes
const classes = (await raw.findMany("Class", {})).filter((c: any) => String(c.name).startsWith("TEST")).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
const picked: { id: string; classId: string; actor: any; ability: number }[] = [];
for (const c of classes) {
  const m = (await raw.findMany("ClassMembership", { classId: c.id, leftAt: null })).slice(0, 25);
  for (const x of m) { const st = await raw.findUnique("Student", { id: x.studentId }); picked.push({ id: String(x.studentId), classId: String(c.id), actor: await resolveActor(raw, (await raw.findUnique("User", { id: st.userId }))!), ability: 0.25 + 0.7 * hash(String(x.studentId)) }); }
}
const teachers = await Promise.all(classes.map(async (c: any) => { const t = (await raw.findMany("ClassTeacher", { classId: c.id }))[0]; const tu = await raw.findUnique("Teacher", { id: t.teacherId }); return { classId: String(c.id), name: String(c.name), actor: await resolveActor(raw, (await raw.findUnique("User", { id: tu.userId }))!) }; }));
const setupS = (performance.now() - T0) / 1000;
console.log(`setup ${setupS.toFixed(1)} s · ${picked.length} students · ${classes.length} classes · ${tests.length} Diagnostic tests`);

// ---------------------------------------------------------------- phase 1: the Diagnostic, all at once
const base = Date.now() - 4 * 3_600_000;
const P1 = performance.now();
let diagRequests = 0;
let diagDone = false;
const teacherPolls = (async () => { let n = 0; while (!diagDone) { for (const t of teachers) { const testId = String(tests.find((x: any) => Number(x.grade) === Number(classes.find((c: any) => String(c.id) === t.classId).name.match(/\d/)[0]))!.id); await op("teacher: Diagnostic analysis (while students test)", () => classDiagnosticReport(repo, t.actor, testId, t.classId)); n++; } for (let i = 0; i < 40; i++) await tick(); } return n; })();
await Promise.all(picked.map(async (p, k) => {
  for (let i = 0; i < (k % 7); i++) await tick();
  const d = await op("student: open home (Diagnostic card)", () => myDiagnostic(repo, p.actor));
  if (!d) return;
  const aid = d.href.split("/")[2];
  let clock = base + k * 1000;
  // a double click on Start for every 10th student
  const [v1] = await Promise.all([op("student: start / resume test", () => startQuiz(repo, p.actor, aid, new Date(clock))), k % 10 === 0 ? op("student: start / resume test", () => startQuiz(repo, p.actor, aid, new Date(clock))) : Promise.resolve(undefined)]);
  let v: any = v1; let i = 0;
  while (v && v.question) {
    for (let j = 0; j < 1 + ((k + i) % 3); j++) await tick();
    const it = (await loadQuestionItems(raw, [v.question.questionId]))[0];
    const right = hash(`${p.id}:${i}`) < p.ability;
    const response = right ? rightAnswer(it) : it.options!.find((o: any) => !o.correct)!.label;
    clock += 20_000 + Math.round(hash(`${k}-${i}`) * 40_000);
    // a double submit for every 15th student on question 10
    const twice = k % 15 === 0 && i === 10;
    const [r1, r2] = await Promise.all([op("student: answer a question", () => submitQuizAnswer(repo, p.actor, { assignmentId: aid, questionId: it.questionId, response }, new Date(clock))), twice ? op("student: answer a question (double click)", () => submitQuizAnswer(repo, p.actor, { assignmentId: aid, questionId: it.questionId, response }, new Date(clock))) : Promise.resolve(undefined)]);
    diagRequests += twice ? 2 : 1;
    v = (r1 ?? r2)?.view ?? (await op("student: start / resume test", () => startQuiz(repo, p.actor, aid, new Date(clock))));
    i++;
  }
}));
diagDone = true;
const polls = await teacherPolls;
const p1s = (performance.now() - P1) / 1000;

// ---------------------------------------------------------------- phase 1 checks: every result against the raw answers
const scores = await raw.findMany("DiagnosticScore", {});
check(scores.length === 150, `Diagnostic results: ${scores.length} (expected 150)`);
check(new Set(scores.map((x: any) => `${x.diagnosticId}|${x.studentId}`)).size === scores.length, "duplicate Diagnostic results");
let recomputed = 0;
for (const sc of scores) {
  const ses = await raw.findMany("PracticeSession", { studentId: sc.studentId, assignmentId: sc.assignmentId, mode: "TEACHER_QUIZ" });
  check(ses.length === 1, `student ${sc.studentId}: ${ses.length} test sessions (expected 1)`);
  const att = await raw.findMany("QuestionAttempt", { sessionId: ses[0].id });
  const byQ = new Map<string, any>(); for (const a of att) if (!byQ.has(String(a.questionId))) byQ.set(String(a.questionId), a);
  check(att.length === 50, `student ${sc.studentId}: ${att.length} answers saved (expected exactly 50, double clicks must not count twice)`);
  const correct = [...byQ.values()].filter((a) => a.isCorrect).length;
  check(correct === Number(sc.correct), `student ${sc.studentId}: result says ${sc.correct} correct, answers say ${correct}`);
  const pct = Math.round(1000 * correct / 50) / 10;
  check(Math.abs(pct - Number(sc.pct)) < 0.01, `student ${sc.studentId}: % ${sc.pct} vs ${pct}`);
  const lv = pct >= 85 ? "ABOVE" : pct >= 65 ? "ON" : "BELOW";
  check(String(sc.level) === lv, `student ${sc.studentId}: level ${sc.level} vs ${lv}`);
  const std = typeof sc.byStandard === "string" ? JSON.parse(sc.byStandard) : sc.byStandard;
  check(std.reduce((t: number, x: any) => t + x.total, 0) === 50 && std.reduce((t: number, x: any) => t + x.correct, 0) === correct, `student ${sc.studentId}: standards do not add up`);
  const sl = await raw.findUnique("StudentLevel", { studentId: sc.studentId });
  check(sl && String(sl.level) === lv, `student ${sc.studentId}: platform level not set from the Diagnostic`);
  recomputed++;
}

// ---------------------------------------------------------------- phase 2: the curriculum plan — 150 students open the same part at once
const P2 = performance.now();
for (const t of teachers) await op("teacher: send full curriculum plan", () => sendCurriculumPlan(repo, t.actor, { classId: t.classId, targetCorrect: 20 }));
const plans = await raw.findMany("SkillPlan", { kind: "CURRICULUM" });
await Promise.all(picked.map(async (p, k) => {
  for (let i = 0; i < (k % 5); i++) await tick();
  const step = await op("student: open home (today's plan)", () => todaysPlanStep(repo, p.actor));
  const plan = plans.find((x: any) => String(x.classId) === p.classId);
  const view = await op("student: open My Plans (curriculum)", () => skillPlanForStudent(repo, p.actor, String(plan.id)));
  const g = Number(classes.find((c: any) => String(c.id) === p.classId).name.match(/\d/)[0]);
  const part = view?.places.find((x: any) => x.code === FIRST[g]);
  if (!part) { problems.push(`student ${p.id}: the first ACS part is missing from the plan`); return; }
  const href = await op("student: open a part (first time for the class)", () => openPlanItem(repo, p.actor, String(plan.id), part.itemId));
  if (!href) return;
  const aid = href.split("/")[2];
  let clock = base + 3_600_000 + k * 1000;
  let v: any = await op("student: start / resume part", () => startQuiz(repo, p.actor, aid, new Date(clock)));
  let n = 0;
  while (v && v.question && !(v.goal?.reached) && n < 100) {
    await tick();
    const it = (await loadQuestionItems(raw, [v.question.questionId]))[0];
    const right = hash(`${p.id}:p${n}`) < Math.min(0.95, p.ability + 0.1);
    clock += 15_000 + Math.round(hash(`${k}-p${n}`) * 30_000);
    const r = await op("student: answer a question (adaptive part)", () => submitQuizAnswer(repo, p.actor, { assignmentId: aid, questionId: it.questionId, response: right ? rightAnswer(it) : it.options!.find((o: any) => !o.correct)!.label }, new Date(clock)));
    v = r?.view; n++;
  }
  void step;
}));
const p2s = (performance.now() - P2) / 1000;
for (const plan of plans) {
  const items = await raw.findMany("SkillPlanItem", { planId: plan.id });
  const it = items.find((x: any) => Object.values(FIRST).includes(String(x.code)));
  const aids = typeof it.assignmentIds === "string" ? JSON.parse(it.assignmentIds) : it.assignmentIds;
  check(aids.length === 1, `plan ${plan.title} (${plan.classId}): ${aids.length} sets were made for the same part (expected 1 for the class)`);
  const sets = await raw.findMany("Assignment", { curriculumPlanId: plan.id });
  check(sets.length === 1, `plan of class ${plan.classId}: ${sets.length} hidden sets in the database (expected 1)`);
}
const sesDup = new Map<string, number>();
for (const s of await raw.findMany("PracticeSession", { mode: "TEACHER_QUIZ" })) { const key = `${s.studentId}|${s.assignmentId}`; sesDup.set(key, (sesDup.get(key) ?? 0) + 1); }
check([...sesDup.values()].every((n) => n === 1), `duplicate sessions: ${[...sesDup.values()].filter((n) => n > 1).length}`);
const goalRows = await raw.findMany("PracticeSession", { goalReachedAt: { not: null } });
for (const s of goalRows.slice(0, 200)) { const as = (await raw.findMany("AssignmentStudent", { assignmentId: s.assignmentId, studentId: s.studentId }))[0]; check(as && String(as.status) === "COMPLETED", `goal reached but status ${as?.status} (${s.studentId})`); }

// ---------------------------------------------------------------- phase 3: the Weekly Check — 150 open at once (some twice)
const P3 = performance.now();
await Promise.all(picked.map(async (p, k) => {
  const [h1, h2] = await Promise.all([op("student: open Weekly Check", () => openWeeklyCheck(repo, p.actor)), k % 6 === 0 ? op("student: open Weekly Check", () => openWeeklyCheck(repo, p.actor)) : Promise.resolve(undefined)]);
  const href = h1 ?? h2; if (!href) return;
  if (h1 && h2 && h1 !== h2) problems.push(`student ${p.id}: two different Weekly Checks opened by a double click`);
  const aid = href.split("/")[2]; let clock = base + 7_200_000 + k * 1000;
  let v: any = await op("student: start / resume part", () => startQuiz(repo, p.actor, aid, new Date(clock)));
  while (v && v.question) { await tick(); const it = (await loadQuestionItems(raw, [v.question.questionId]))[0]; clock += 25_000; v = (await op("student: answer a question (Weekly Check)", () => submitQuizAnswer(repo, p.actor, { assignmentId: aid, questionId: it.questionId, response: rightAnswer(it) }, new Date(clock))))?.view; }
}));
const p3s = (performance.now() - P3) / 1000;
const wc = await raw.findMany("WeeklyCheck", {});
check(new Set(wc.map((x: any) => `${x.studentId}|${x.week}`)).size === wc.length, "duplicate Weekly Checks");
check(wc.length === 150 || wc.length === 0, `Weekly Checks: ${wc.length}`);
check(wc.every((x: any) => x.completedAt), `${wc.filter((x: any) => !x.completedAt).length} Weekly Checks not marked done`);

// ---------------------------------------------------------------- phase 4: every report, checked against the raw data
const P4 = performance.now();
for (const t of teachers) {
  const g = Number(t.name.match(/\d/)![0]);
  const test = tests.find((x: any) => Number(x.grade) === g)!;
  const r: any = await op("teacher: Diagnostic analysis", () => classDiagnosticReport(repo, t.actor, String(test.id), t.classId));
  if (!r) { problems.push(`${t.name}: analysis failed`); continue; }
  const mine = scores.filter((x: any) => picked.some((p) => p.id === String(x.studentId) && p.classId === t.classId));
  check(r.summary.assessed === 25 && mine.length === 25, `${t.name}: assessed ${r.summary.assessed} (expected 25)`);
  check(r.summary.roster - r.summary.assessed === r.notTaken.length, `${t.name}: not-taken list ${r.notTaken.length} vs roster ${r.summary.roster} − 25`);
  const mean = Math.round(10 * mine.reduce((t2: number, x: any) => t2 + Number(x.pct), 0) / mine.length) / 10;
  check(Math.abs(mean - r.summary.mean) < 0.05, `${t.name}: mean ${r.summary.mean} vs ${mean}`);
  check(r.summary.levels.ABOVE + r.summary.levels.ON + r.summary.levels.BELOW === 25, `${t.name}: levels do not add to 25`);
  check(r.tiers.reduce((t2: number, x: any) => t2 + x.students.length, 0) === 25, `${t.name}: tiers do not add to 25`);
  check(r.students.every((x: any, i: number, a: any[]) => i === 0 || a[i - 1].pct >= x.pct), `${t.name}: master table not sorted`);
  check(r.students.every((x: any) => x.rank >= 1 && x.rank <= 99), `${t.name}: rank outside 1–99`);
  check(r.items.length === 50, `${t.name}: question analysis has ${r.items.length} rows`);
  // one item recomputed from the raw answers of the class
  const q0 = r.items[0]; const sesIds = (await raw.findMany("PracticeSession", { assignmentId: { in: mine.map((x: any) => x.assignmentId) } })).map((x: any) => x.id);
  const a0 = (await raw.findMany("QuestionAttempt", { questionId: q0.questionId, sessionId: { in: sesIds } }));
  const firsts = new Map<string, any>(); for (const a of a0) if (!firsts.has(String(a.sessionId))) firsts.set(String(a.sessionId), a);
  check(Math.abs(q0.pct - Math.round(1000 * [...firsts.values()].filter((a) => a.isCorrect).length / Math.max(1, firsts.size)) / 10) < 0.2, `${t.name}: question 1 analysis does not match the answers`);
  // standards: class average = mean of the students' standard %
  for (const s of r.standards.slice(0, 3)) { const vals = r.students.map((x: any) => x.standards[s.code]).filter((v: any) => v !== undefined); check(Math.abs(s.pct - Math.round(10 * vals.reduce((a: number, b: number) => a + b, 0) / vals.length) / 10) < 0.05, `${t.name}: ${s.code} average`); }
  const needSupport = r.students.filter((x: any) => x.level === "BELOW" || x.tier === "INTENSIVE" || x.tier === "APPROACHING").length;
  check(needSupport === 0 ? r.supportPlan.length === 0 : r.supportPlan.length === 8, `${t.name}: support plan has ${r.supportPlan.length} weeks for ${needSupport} students`);
  const doc = classDoc(r, { branding: { name: "Test School", nameAr: null, logo: null }, generatedAt: new Date(), generatedBy: "T" });
  await op("teacher: Excel file of the analysis", async () => renderXlsx(doc));
  await op("teacher: support groups", () => supportGroups(repo, t.actor, t.classId));
  const plan = plans.find((x: any) => String(x.classId) === t.classId);
  const grid: any = await op("teacher: curriculum plan progress grid", () => curriculumPlanGrid(repo, t.actor, String(plan.id)));
  const it = grid?.items.find((x: any) => Object.values(FIRST).includes(x.code));
  const doneDb = await raw.count("AssignmentStudent", { assignmentId: { in: (await raw.findMany("Assignment", { curriculumPlanId: plan.id })).map((a: any) => a.id) }, status: "COMPLETED" });
  check(it && it.done === doneDb, `${t.name}: grid says ${it?.done} finished the part, database says ${doneDb}`);
  await op("teacher: home goals", () => goalProgress(repo, t.actor, [classes.find((c: any) => String(c.id) === t.classId)]));
  await op("teacher: share all reports", () => shareDiagnosticResults(repo, t.actor, { testId: String(test.id), studentIds: mine.map((x: any) => String(x.studentId)), shared: true }));
}
await op("admin: whole-grade analysis (Grade 4)", () => classDiagnosticReport(repo, admin, String(tests.find((x: any) => Number(x.grade) === 4)!.id), null));
await Promise.all(picked.map(async (p) => {
  const r: any = await op("student: my Diagnostic report", () => studentDiagnosticReport(repo, p.actor, p.id));
  check(!!r, `student ${p.id}: report not visible after sharing`);
  await op("student: My Work page data", () => assignedSkills(repo, p.actor));
  await op("student: weekly stats", () => weekStats(repo, p.id));
}));
const p4s = (performance.now() - P4) / 1000;
const hidden = (await Promise.all(picked.slice(0, 20).map(async (p) => (await assignedSkills(raw, p.actor)).items.filter((x: any) => String(x.title).startsWith("Weekly Check") || x.title === "Curriculum plan").length))).reduce((a, b) => a + b, 0);
check(hidden === 0, `${hidden} hidden sets showed up in My Work`);

// ---------------------------------------------------------------- report
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const rows = [...stats].map(([name, s]) => ({ name, n: s.ms.length, err: s.err, errors: s.errors, p50: pct(s.ms, 50), p95: pct(s.ms, 95), max: Math.max(...s.ms), q: Math.round(s.q.reduce((a, b) => a + b, 0) / s.q.length), qmax: Math.max(...s.q) }));
const total = rows.reduce((t, r) => t + r.n, 0);
const out = { setupS, phases: { diagnostic: p1s, plan: p2s, weekly: p3s, reports: p4s }, totalRequests: total, teacherPolls: polls, recomputedResults: recomputed, problems, rows };
writeFileSync(process.argv[2] ?? "load-result.json", JSON.stringify(out, null, 1));
console.log(`phases (s): diagnostic ${p1s.toFixed(1)} · plan ${p2s.toFixed(1)} · weekly ${p3s.toFixed(1)} · reports ${p4s.toFixed(1)} · requests ${total}`);
for (const r of rows) console.log(`${r.name.padEnd(58)} n=${String(r.n).padStart(5)} err=${r.err} p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms max=${r.max.toFixed(0)}ms queries≈${r.q} (max ${r.qmax})${r.errors.length ? "  ⚠ " + r.errors.join(" | ") : ""}`);
console.log(`PROBLEMS (${problems.length}):`); for (const p of problems.slice(0, 40)) console.log(" - " + p);
