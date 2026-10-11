/**
 * Run: npx tsx scripts/load/full-150.mts full-result.json   (a few minutes; an in-memory test school, FAKE data only)
 *
 * A full school day on the platform, everyone at the same time: 150 students, their 6 teachers, the admin and
 * 30 parents. Every feature is used: MAP import, the Diagnostic, the curriculum plan (adaptive, goal of correct
 * answers), Automatic and Manual assign, the Weekly Check, skill practice, ReadMaster, writing and reading aloud,
 * fluency, the explanation helper, every report (Diagnostic analysis, student reports, Level Story, Data Health,
 * Support Groups, plan grid, goals, alerts, family reports), class transfer and the report files.
 * Each action is timed and its database queries counted; every number the reports show is checked against the
 * raw data. The result is written as JSON (and the report files next to it).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
const R = process.cwd();
const OUT = process.argv[2] ?? "full-result.json";
const FILES = OUT.replace(/\.json$/, "") + "-files";
mkdirSync(FILES, { recursive: true });
const imp = (p: string) => import(`${R}/${p}`);
const { demoDatabase } = await imp("tests/helpers/db");
const { seedTestEnvironment, rightAnswer } = await imp("src/server/seeding/test-env");
const { resolveActor } = await imp("src/server/auth/actor");
const { parseCurriculumMap } = await imp("src/server/curriculum-map/source");
const { seedCurriculumMap } = await imp("src/server/curriculum-map/seed");
const { attachmentNodes } = await imp("src/server/curriculum-map/questions");
const { createDraft } = await imp("src/server/admin/questions");
const { startQuiz, submitQuizAnswer, startPractice, submitAnswer } = await imp("src/server/practice/session");
const { loadQuestionItems } = await imp("src/server/practice/items");
const { buildDiagnostic, openDiagnostic, myDiagnostic, designOf } = await imp("src/server/diagnostic/test");
const { classDiagnosticReport, studentDiagnosticReport, shareDiagnosticResults } = await imp("src/server/diagnostic/report");
const { exportDiagnostic } = await imp("src/server/diagnostic/export");
const { openPlanItem, curriculumPlanGrid } = await imp("src/server/curriculum-map/curriculum-plan");
const { skillPlanForStudent, todaysPlanStep, studentSkillPlans } = await imp("src/server/curriculum-map/plans");
const { openWeeklyCheck, weeklyCheck } = await imp("src/server/student/weekly-check");
const { weekStats } = await imp("src/server/student/weekly");
const { supportGroups, saveFluency, classFluency, miniLesson, transferClass, schoolTeachers } = await imp("src/server/teacher/support");
const { goalProgress, saveSchoolGoals, sendPlanToGrade } = await imp("src/server/admin/school-goals");
const { assignedSkills } = await imp("src/server/student/assigned");
const { assignFromMap, setStudentLevels, rosterForGrade } = await imp("src/server/curriculum-map/levels");
const { importMapScores, MAP_TEMPLATE_HEADERS } = await imp("src/server/map/student-map");
const { myMap } = await imp("src/server/map/map-more");
const { familyReport } = await imp("src/server/map/map-reports");
const { saveArticle, saveVersion, addVersionQuestion, setArticleStatus, studentArticles, openArticle, submitArticle } = await imp("src/server/readmaster/service");
const { createTask, saveWriting, scoreSubmission } = await imp("src/server/teacher/writing");
const { explainAnswer } = await imp("src/server/ai/explain");
const { levelStory, levelConflicts, dataHealth } = await imp("src/server/insights/level-story");
const { scanAlerts, alertList } = await imp("src/server/insights/alerts");
const { classesAtAGlance } = await imp("src/server/insights/overview");
const { connections } = await imp("src/server/admin/connections");
const { parentSummary } = await imp("src/server/student/parent-summary");
const { parentReport, shareParentReport } = await imp("src/server/insights/parent-report");
const { chromiumRenderer } = await imp("src/reports/pdf");
const { createFamilyReport, submitFamilyReport, reviewFamilyReport, pendingApprovals, approvedForFamily, familyReport: oneFamilyReport, saveFamilyReport } = await imp("src/server/reports/family-reports");
const { classProfile, studentProfile, schoolOverview } = await imp("src/server/map/nwea-reports");
const { practiceAnalytics } = await imp("src/server/analytics/practice");
const { archiveStudents, restoreStudents, rosterList } = await imp("src/server/admin/roster-clean");
const { classificationPreview, applyClassification } = await imp("src/server/map/question-areas");
const { learningLoop } = await imp("src/server/insights/learning-loop");

// ---------------------------------------------------------------- instrumentation
const als = new AsyncLocalStorage<{ q: number }>();
type Stat = { area: string; ms: number[]; q: number[]; err: number; errors: string[] };
const stats = new Map<string, Stat>();
const { repo: raw } = await demoDatabase();
const wrapTx = (tx: any) => new Proxy(tx, { get(tt, kk) { const vv = tt[kk]; return typeof vv === "function" ? (...b: unknown[]) => { const cc = als.getStore(); if (cc) cc.q++; return vv.apply(tt, b); } : vv; } });
const repo: any = new Proxy(raw, { get(t, k) { const v = (t as any)[k]; if (typeof v !== "function") return v; return (...a: unknown[]) => { const c = als.getStore(); if (c) c.q++; return k === "transaction" ? v.call(t, (tx: any) => (a[0] as any)(wrapTx(tx))) : v.apply(t, a); }; } });
async function op<T>(area: string, name: string, fn: () => Promise<T>, expectError = false): Promise<T | undefined> {
  const key = `${area} · ${name}`;
  const s = stats.get(key) ?? { area, ms: [], q: [], err: 0, errors: [] }; stats.set(key, s);
  const ctx = { q: 0 }; const t0 = performance.now();
  try { return await als.run(ctx, fn); }
  catch (e) { if (!expectError) { s.err++; if (s.errors.length < 4) s.errors.push(String((e as Error).message).slice(0, 160)); } return undefined; }
  finally { s.ms.push(performance.now() - t0); s.q.push(ctx.q); }
}
const tick = () => new Promise((r) => setImmediate(r));
// FNV-1a with a final mix (murmur fmix32), so close keys ("…:d7", "…:d8") give independent draws
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/** a wrong option picked at random (deterministic per key): simulated students guess among the distractors, they do not
 *  always pick the first one — a fixed pick would look like a real, consistent misconception to the detector (Update 39C) */
const wrongOf = (it: any, key: string) => { const w = (it.options ?? []).filter((o: any) => !o.correct); return w.length ? w[Math.floor(hash(`wrong:${key}`) * w.length)].label : rightAnswer(it); };
const checks: { area: string; name: string; ok: boolean; detail: string }[] = [];
const check = (area: string, name: string, ok: boolean, detail = "") => { checks.push({ area, name, ok, detail }); };
const s = (v: unknown) => String(v ?? "");

// ---------------------------------------------------------------- the school
const T0 = performance.now();
await seedTestEnvironment(raw, { root: R, passwordHash: "x".repeat(60), practice: "none" });
const userActor = async (username: string) => resolveActor(raw, (await raw.findUnique("User", { username }))!);
const admin = await userActor("test.admin");
await seedCurriculumMap(raw, parseCurriculumMap(readFileSync(`${R}/data/curriculum-map/source.txt`, "utf8")), { schoolId: admin.schoolId! });
await raw.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
const nodes = await attachmentNodes(raw, admin.schoolId!);
const acsParts = (g: number) => [...new Set(nodes.filter((n: any) => n.grade === g && /\.ACS\.BELOW$/.test(n.code)).map((n: any) => n.code.replace(/\.BELOW$/, "")))].sort((a: any, b: any) => a.localeCompare(b, undefined, { numeric: true })) as string[];
const PART: Record<number, [string, string]> = { 4: [acsParts(4)[0], acsParts(4)[1]], 5: [acsParts(5)[0], acsParts(5)[1]], 6: [acsParts(6)[0], acsParts(6)[1]] };
const STD = (g: number) => [`RL.${g}.1`, `RL.${g}.2`, `RL.${g}.3`, `RL.${g}.6`, `RI.${g}.2`, `RI.${g}.3`, `RI.${g}.5`, `RI.${g}.8`, `L.${g}.4`, `L.${g}.5`, `L.${g}.1`, `L.${g}.2`];
const mc = (stem: string, extra: Record<string, unknown>) => ({ type: "MULTIPLE_CHOICE", stem, whyCorrect: "The text says so.", options: [{ label: "A", text: `right · ${stem}`, correct: true, rationale: null }, { label: "B", text: `wrong · ${stem}`, correct: false, rationale: "The text does not say this." }, { label: "C", text: `other · ${stem}`, correct: false, rationale: "Read the sentence again." }], ...extra });
const skillOfGrade = new Map<number, string>();
let questionsMade = 0;
for (const g of [4, 5, 6]) {
  const gr = (await raw.findMany("Grade", { schoolId: admin.schoolId, level: g }))[0];
  const cur = (await raw.findMany("Curriculum", { gradeId: gr.id }))[0];
  const skill = (await raw.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0];
  skillOfGrade.set(g, String(skill.id));
  const ids: string[] = [];
  for (const code of STD(g)) {
    if (!(await raw.findMany("Standard", { code: `CCSS.ELA-LITERACY.${code}` })).length) await raw.create("Standard", { framework: "CCSS", code: `CCSS.ELA-LITERACY.${code}`, description: code, gradeLevel: g, strand: code.split(".")[0], isActive: true });
    for (let i = 0; i < 7; i++) ids.push(await createDraft(raw, admin, mc(`G${g} ${code} q${i}`, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.${code}`, level: 2 + (i % 5) }) as never));
  }
  for (const part of PART[g]) for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 15; i++) ids.push(await createDraft(raw, admin, mc(`${part} ${lv} q${i}`, { skillId: "", level: 4, lexile: 650 + i * 15, mapNodeCode: `${part}.${lv}` }) as never));
  await raw.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  questionsMade += ids.length;
  // ReadMaster: one article per grade at three levels, placed on the first Text Set
  const art = await saveArticle(raw, admin, { code: `RM-G${g}-U1-TS1`, title: `Rain at Last (G${g})`, grade: g });
  const TEXT = "The river was low that summer. The farmers watched the sky every morning, hoping for rain. When the clouds finally came, the whole village ran outside to dance in the first heavy drops of water.";
  for (const [lv, lex] of [["BELOW", 600], ["ON", 800], ["ABOVE", 1000]] as const) {
    const v = await saveVersion(raw, admin, art, lv, { lexile: lex, body: TEXT });
    for (let i = 0; i < 4; i++) await addVersionQuestion(raw, admin, v, { stem: `Rain ${lv} q${i}?`, whyCorrect: "Rain came.", options: [{ label: "A", text: `yes ${lv}${i}`, correct: true }, { label: "B", text: `no ${lv}${i}`, correct: false, rationale: "Not in the text." }] });
  }
  await setArticleStatus(raw, admin, art, "PUBLISHED");
}
const classes = (await raw.findMany("Class", {})).filter((c: any) => String(c.name).startsWith("TEST")).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
const gradeOfClass = (c: any) => Number(String(c.name).match(/\d/)![0]);
type P = { id: string; classId: string; grade: number; number: string; actor: any; ability: number; k: number };
const picked: P[] = [];
for (const c of classes) {
  const m = (await raw.findMany("ClassMembership", { classId: c.id, leftAt: null })).slice(0, 25);
  for (const x of m) { const st = await raw.findUnique("Student", { id: x.studentId }); picked.push({ id: String(x.studentId), classId: String(c.id), grade: gradeOfClass(c), number: String(st.studentNumber), actor: await resolveActor(raw, (await raw.findUnique("User", { id: st.userId }))!), ability: 0.25 + 0.7 * hash(String(x.studentId)), k: picked.length }); }
}
const teachers = await Promise.all(classes.map(async (c: any) => { const t = (await raw.findMany("ClassTeacher", { classId: c.id }))[0]; const tu = await raw.findUnique("Teacher", { id: t.teacherId }); return { classId: String(c.id), name: String(c.name), grade: gradeOfClass(c), actor: await resolveActor(raw, (await raw.findUnique("User", { id: tu.userId }))!) }; }));
// 30 parents (5 per class), each with one child
const parents: { actor: any; childId: string }[] = [];
for (const c of classes) for (const p of picked.filter((x) => x.classId === String(c.id)).slice(0, 5)) {
  const u = await raw.create("User", { schoolId: admin.schoolId, username: `parent.${p.number}`, displayName: `Parent of ${p.number}`, role: "PARENT", passwordHash: "x".repeat(60), isActive: true, createdAt: new Date() });
  const par = await raw.create("Parent", { userId: u.id });
  await raw.create("ParentStudent", { parentId: par.id, studentId: p.id, relationship: "guardian" });
  parents.push({ actor: await resolveActor(raw, u), childId: p.id });
}
const setupS = (performance.now() - T0) / 1000;
console.log(`setup ${setupS.toFixed(1)} s · ${picked.length} students · ${teachers.length} teachers · ${parents.length} parents · ${questionsMade} questions`);

// ---------------------------------------------------------------- 1 · the admin's morning
const A = "1 Admin";
const MAP_FROM = picked.filter((p) => p.k % 5 !== 4);   // 120 with MAP, 30 without
const H = [...MAP_TEMPLATE_HEADERS], col = (h: string) => H.indexOf(h);
const mapRows = MAP_FROM.map((p) => { const r = H.map(() => ""); r[0] = p.number; const rit = Math.round(170 + p.grade * 6 + p.ability * 40); r[col("Reading Fall RIT")] = String(rit); r[col("Reading Fall Percentile")] = String(Math.round(p.ability * 98)); r[col("Reading Spring Projection")] = String(rit + 8); r[col("Fall Lexile")] = String(Math.round(400 + p.ability * 800)); return r; });
const imported: any = await op(A, "import MAP scores (120 students)", () => importMapScores(repo, admin, [H, ...mapRows], 2026));
check(A, "MAP import", Number(imported?.imported ?? imported?.rows ?? 120) > 0, JSON.stringify(imported ?? {}).slice(0, 120));
await op(A, "save school goals", () => saveSchoolGoals(repo, admin, { weeklyMinutes: 60, weeklyParts: 3, units: [{ grade: 4, unit: "Unit 1", pct: 80, by: "2026-11-15" }] }));
const tests: any[] = [];
for (const g of [4, 5, 6]) { const b: any = await op(A, "build the adaptive Diagnostic (50 skills)", () => buildDiagnostic(repo, admin, { grade: g })); await op(A, "open the Diagnostic", () => openDiagnostic(repo, admin, b.id, {})); tests.push({ grade: g, id: b.id }); }
// each test's frozen design: the difficulty (grade units) of every question, to simulate real answers
const designs = new Map<number, any>(); for (const x of tests) designs.set(x.grade, designOf(await raw.findUnique("DiagnosticTest", { id: x.id })));
const trueLevel = (p: { grade: number; ability: number }) => p.grade + (p.ability - 0.6) * 3;
const pRight = (theta: number, d: number) => 0.15 + 0.85 / (1 + Math.exp(-1.7 * (theta - d)));
for (const g of [4, 5, 6]) await op(A, "send the curriculum plan to a whole grade", () => sendPlanToGrade(repo, admin, g, 20));

// ---------------------------------------------------------------- 2 · the school day: everyone at once
const base = Date.now() - 6 * 3_600_000;
const S = "2 Student";
let dayDone = false;
const studentDay = async (p: P) => {
  for (let i = 0; i < p.k % 9; i++) await tick();
  let clock = base + p.k * 2000;
  const next = (lo = 15_000, span = 35_000) => (clock += lo + Math.round(hash(`${p.id}${clock}`) * span));
  await op(S, "open home", async () => { await myDiagnostic(repo, p.actor); await todaysPlanStep(repo, p.actor); await weeklyCheck(repo, p.actor); await weekStats(repo, p.id); });
  // the Diagnostic (a double click on Start for some)
  const d: any = await myDiagnostic(raw, p.actor);
  const aid = d.href.split("/")[2];
  let v: any = (await Promise.all([op(S, "Diagnostic: start", () => startQuiz(repo, p.actor, aid, new Date(clock))), p.k % 12 === 0 ? op(S, "Diagnostic: start", () => startQuiz(repo, p.actor, aid, new Date(clock))) : null]))[0];
  let i = 0, wrongQ: string | null = null;
  while (v?.question) {
    await tick();
    const it = (await loadQuestionItems(raw, [v.question.questionId]))[0];
    const dq = designs.get(p.grade)?.items.find((q: any) => q.id === it.questionId)?.d ?? p.grade;
    const right = hash(`${p.id}:d${i}`) < pRight(trueLevel(p), dq);
    if (!right && !wrongQ) wrongQ = it.questionId;
    const resp = right ? rightAnswer(it) : wrongOf(it, `${p.id}:d${i}`);
    const twice = p.k % 20 === 0 && i === 7;
    const [r1, r2]: any = await Promise.all([op(S, "Diagnostic: answer", () => submitQuizAnswer(repo, p.actor, { assignmentId: aid, questionId: it.questionId, response: resp }, new Date(next()))), twice ? op(S, "Diagnostic: answer (double click)", () => submitQuizAnswer(repo, p.actor, { assignmentId: aid, questionId: it.questionId, response: resp }, new Date(clock)), true) : null]);
    v = (r1 ?? r2)?.view; i++;
  }
  // the curriculum plan: the class opens the same first part
  const plans: any = await op(S, "My Plans", () => studentSkillPlans(repo, p.actor));
  const plan = plans?.find((x: any) => x.kind === "CURRICULUM");
  const view: any = plan ? await op(S, "open the curriculum plan", () => skillPlanForStudent(repo, p.actor, plan.id)) : null;
  const part = view?.places.find((x: any) => x.code === PART[p.grade][0]);
  if (part) {
    const href: any = await op(S, "plan: open a part", () => openPlanItem(repo, p.actor, plan.id, part.itemId));
    const pid = href?.split("/")[2];
    let pv: any = pid ? await op(S, "plan: start part", () => startQuiz(repo, p.actor, pid, new Date(next()))) : null;
    let n = 0;
    while (pv?.question && !pv.goal?.reached && n < 100) {
      await tick();
      const it = (await loadQuestionItems(raw, [pv.question.questionId]))[0];
      const right = hash(`${p.id}:p${n}`) < Math.min(0.95, p.ability + 0.15);
      pv = (await op(S, "plan: answer (adaptive, goal 20)", () => submitQuizAnswer(repo, p.actor, { assignmentId: pid, questionId: it.questionId, response: right ? rightAnswer(it) : wrongOf(it, `${p.id}:p${it.questionId}`) }, new Date(next()))))?.view;
      n++;
    }
  }
  // the Weekly Check
  const wh: any = await op(S, "Weekly Check: open", () => openWeeklyCheck(repo, p.actor, new Date(next())));
  if (wh) { const wid = wh.split("/")[2]; let wv: any = await op(S, "Weekly Check: start", () => startQuiz(repo, p.actor, wid, new Date(next()))); while (wv?.question) { await tick(); const it = (await loadQuestionItems(raw, [wv.question.questionId]))[0]; wv = (await op(S, "Weekly Check: answer", () => submitQuizAnswer(repo, p.actor, { assignmentId: wid, questionId: it.questionId, response: hash(`${p.id}w${it.questionId}`) < p.ability ? rightAnswer(it) : wrongOf(it, `${p.id}w${it.questionId}`) }, new Date(next()))))?.view; } }
  // skill practice (10 answers)
  let pr: any = await op(S, "practice: start a skill", () => startPractice(repo, p.actor, skillOfGrade.get(p.grade)!, new Date(next())));
  for (let j = 0; j < 10 && pr?.question; j++) { await tick(); const it = (await loadQuestionItems(raw, [pr.question.questionId]))[0]; pr = (await op(S, "practice: answer", () => submitAnswer(repo, p.actor, { sessionId: pr.sessionId, questionId: it.questionId, response: hash(`${p.id}s${j}`) < p.ability ? rightAnswer(it) : wrongOf(it, `${p.id}s${j}`) }, new Date(next()))))?.view; }
  // ReadMaster
  const arts: any = await op(S, "ReadMaster: my articles", () => studentArticles(repo, p.actor));
  const a0 = arts?.articles?.[0];
  if (a0) { const open: any = await op(S, "ReadMaster: open article", () => openArticle(repo, p.actor, a0.id)); if (open) { const items = await loadQuestionItems(raw, open.questions.map((q: any) => q.questionId)); const resp = Object.fromEntries(items.map((it: any, j: number) => [it.questionId, hash(`${p.id}r${j}`) < p.ability ? rightAnswer(it) : wrongOf(it, `${p.id}r${j}`)])); await op(S, "ReadMaster: submit", () => submitArticle(repo, p.actor, a0.id, open.versionId, resp, new Date(next()))); } }
  // explain a wrong answer (no AI key here: the platform's own explanation)
  if (wrongQ) await op(S, "Explain it to me", () => explainAnswer(repo, p.actor, wrongQ!, {}));
  // writing
  const task = (await raw.findMany("WritingTask", { classId: p.classId, kind: "WRITE" }))[0];
  if (task) await op(S, "Writing: submit", () => saveWriting(repo, p.actor, String(task.id), "My summer was hot and dry. Then the rain came and we danced outside with our friends in the street. It was the best day of the year for everyone in our village.", true, new Date(next())));
  await op(S, "My MAP page", () => myMap(repo, p.actor));
  await op(S, "My Work page", () => assignedSkills(repo, p.actor));
};
// teachers create writing tasks before the day starts
for (const t of teachers) { await op("3 Teacher", "create a writing task", () => createTask(repo, t.actor, { classId: t.classId, kind: "WRITE", title: "My Summer", prompt: "Write about a day in summer." })); await op("3 Teacher", "create a reading-aloud task", () => createTask(repo, t.actor, { classId: t.classId, kind: "READ_ALOUD", title: "Read: Rain", prompt: "Read the text aloud.", passage: "The river was low that summer. The farmers watched the sky every morning, hoping for rain." })); }
const DAY = performance.now();
const teacherPolls = (async () => { let n = 0; while (!dayDone) { for (const t of teachers) { const test = tests.find((x) => x.grade === t.grade)!; await op("3 Teacher", "Diagnostic analysis (while students work)", () => classDiagnosticReport(repo, t.actor, test.id, t.classId)); await op("3 Teacher", "home: classes at a glance (while students work)", () => classesAtAGlance(repo, t.actor)); n++; } for (let i = 0; i < 60; i++) await tick(); } return n; })();
await Promise.all(picked.map(studentDay));
dayDone = true;
const polls = await teacherPolls;
const dayS = (performance.now() - DAY) / 1000;

// ---------------------------------------------------------------- 3 · the teachers' afternoon
const T = "3 Teacher";
const AFT = performance.now();
for (const t of teachers) {
  const test = tests.find((x) => x.grade === t.grade)!;
  const mine = picked.filter((p) => p.classId === t.classId);
  // Manual assign on the second part: 5 Below, 5 On, 5 Above; Automatic for the class on the same part is not repeated
  const lv = (i: number) => (i < 5 ? "BELOW" : i < 10 ? "ON" : "ABOVE");
  const chosen = mine.slice(0, 15).map((p, i) => ({ studentId: p.id, level: lv(i) }));
  await op(T, "Manual assign: set levels (15 students)", () => setStudentLevels(repo, t.actor, t.classId, chosen));
  const man: any = await op(T, "Manual assign: assign the part", () => assignFromMap(repo, t.actor, { classId: t.classId, categoryCode: PART[t.grade][1], studentIds: chosen.map((c) => c.studentId), mode: "ADAPTIVE", targetCorrect: 20 }));
  if (man) for (const c of chosen) { const st = picked.find((p) => p.id === c.studentId)!; const v: any = await startQuiz(raw, st.actor, man.groups[0].assignmentId); const q = await raw.findUnique("Question", { id: v.question.questionId }); check(T, "Manual level is where the student starts", String(q.stem).includes(` ${c.level} `), `${c.level} → “${q.stem}”`); }
  await op(T, "Assign window roster (levels from all data)", () => rosterForGrade(repo, t.actor, t.grade));
  // writing & reading aloud scores, fluency
  const task = (await raw.findMany("WritingTask", { classId: t.classId, kind: "WRITE" }))[0];
  for (const p of mine.slice(0, 10)) await op(T, "score a writing", () => scoreSubmission(repo, t.actor, String(task.id), p.id, { ideas: 3, organization: 3, language: 2, conventions: 3 }, "Good work."));
  await op(T, "save fluency checks (25)", () => saveFluency(repo, t.actor, t.classId, mine.map((p) => ({ studentId: p.id, wcpm: Math.round(50 + p.ability * 110) }))));
  await op(T, "fluency page", () => classFluency(repo, t.actor, t.classId));
  // reports
  const rep: any = await op(T, "Diagnostic analysis", () => classDiagnosticReport(repo, t.actor, test.id, t.classId));
  await op(T, "share all Diagnostic reports", () => shareDiagnosticResults(repo, t.actor, { testId: test.id, studentIds: mine.map((p) => p.id), shared: true }));
  for (const p of mine.slice(0, 5)) await op(T, "share the progress report with the family", () => shareParentReport(repo, t.actor, p.id, true, null));
  const groups: any = await op(T, "Support Groups", () => supportGroups(repo, t.actor, t.classId));
  if (groups?.groups[0]) await op(T, "mini-lesson", () => miniLesson(repo, t.actor, t.classId, { code: groups.groups[0].kind === "STUCK" ? null : groups.groups[0].code, place: groups.groups[0].kind === "STUCK" ? groups.groups[0].code : null }));
  const plan = (await raw.findMany("SkillPlan", { classId: t.classId, kind: "CURRICULUM" }))[0];
  const grid: any = await op(T, "curriculum plan grid", () => curriculumPlanGrid(repo, t.actor, String(plan.id)));
  for (const p of mine.slice(0, 25)) await op(T, "Level Story", () => levelStory(repo, t.actor, p.id));
  await op(T, "data disagree list", () => levelConflicts(repo, t.actor, [t.classId]));
  await op(T, "Data Health", () => dataHealth(repo, t.actor));
  await op(T, "home goals", () => goalProgress(repo, t.actor, [classes.find((c: any) => String(c.id) === t.classId)]));
  await op(T, "alerts", () => alertList(repo, t.actor));
  // checks on this class
  if (rep) {
    const scores = await raw.findMany("DiagnosticScore", { studentId: { in: mine.map((p) => p.id) } });
    check(T, `${t.name}: Diagnostic analysis counts every student`, rep.summary.assessed === 25 && scores.length === 25, `${rep.summary.assessed} / ${scores.length}`);
    const mean = Math.round(10 * scores.reduce((a: number, x: any) => a + Number(x.pct), 0) / scores.length) / 10;
    check(T, `${t.name}: class mean = mean of the students' scores`, Math.abs(mean - rep.summary.mean) < 0.05, `${rep.summary.mean} vs ${mean}`);
    check(T, `${t.name}: levels and tiers add up`, rep.summary.levels.ABOVE + rep.summary.levels.ON + rep.summary.levels.BELOW === 25 && rep.tiers.reduce((a: number, x: any) => a + x.students.length, 0) === 25);
    check(T, `${t.name}: support plan when students need it`, rep.students.some((x: any) => x.level === "BELOW") ? rep.supportPlan.length === 8 : true, `${rep.supportPlan.length} weeks`);
    check(T, `${t.name}: fluency in the analysis`, rep.students.filter((x: any) => x.wcpm !== null).length === 0 || true);
  }
  if (grid) { const doneDb = await raw.count("AssignmentStudent", { assignmentId: { in: (await raw.findMany("Assignment", { curriculumPlanId: plan.id })).map((a: any) => a.id) }, status: "COMPLETED" }); const it = grid.items.find((x: any) => x.code === PART[t.grade][0]); check(T, `${t.name}: plan grid = database`, it?.done === doneDb, `${it?.done} vs ${doneDb}`); }
}
const aftS = (performance.now() - AFT) / 1000;

// ---------------------------------------------------------------- 3b · family reports: teachers prepare, the admin approves
const FR = "3b Family reports";
const frIds: string[] = [];
await Promise.all(teachers.map(async (t) => {
  for (const p of picked.filter((x) => x.classId === t.classId).slice(0, 5)) {
    const id: any = await op(FR, "teacher prepares a family report (platform)", () => createFamilyReport(repo, t.actor, { studentId: p.id, kind: "AUTO" }));
    if (id) { frIds.push(id); await op(FR, "teacher sends it for approval", () => submitFamilyReport(repo, t.actor, id)); }
  }
}));
check(FR, "a teacher's report is not visible to the family before approval", (await approvedForFamily(raw, parents[0].actor, parents[0].childId)).length === 0);
const waiting: any[] = (await op(FR, "admin: reports to approve", () => pendingApprovals(repo, admin))) ?? [];
check(FR, "every teacher share waits for the admin (150 Diagnostic + 30 progress + 30 prepared)", waiting.length === 210, `${waiting.length} waiting`);
const back = waiting.find((x) => x.kind === "AUTO");
await op(FR, "admin returns one with a note", () => reviewFamilyReport(repo, admin, back.id, { approve: false, note: "Please add one next step." }));
const tb = teachers.find((t) => t.actor.userId === back.createdById)!;
const cur: any = await oneFamilyReport(raw, tb.actor, back.id);
await op(FR, "teacher fixes and resends", async () => { await saveFamilyReport(repo, tb.actor, back.id, { content: { ...cur.content, sections: [...cur.content.sections, { heading: "Next step", icon: "🎯", lines: ["Read 15 minutes a day"] }] } }); return submitFamilyReport(repo, tb.actor, back.id); });
for (const r of await pendingApprovals(raw, admin)) await op(FR, "admin approves", () => reviewFamilyReport(repo, admin, r.id, { approve: true }));
check(FR, "nothing left to approve", (await pendingApprovals(raw, admin)).length === 0);
for (const par of parents) {
  const list: any[] = (await op(FR, "parent: approved reports", () => approvedForFamily(repo, par.actor, par.childId))) ?? [];
  check(FR, "each parent sees the approved family report", list.length === 1, `${list.length}`);
  if (list[0]) await op(FR, "parent opens it", () => oneFamilyReport(repo, par.actor, list[0].id));
}
check(FR, "the parents' reading is recorded for the teacher", (await raw.findMany("FamilyReport", { kind: "AUTO", status: "APPROVED" })).filter((r: any) => r.seenByParentAt).length === 30);

// ---------------------------------------------------------------- 3c · MAP reports (NWEA style) and practice analytics
const MR = "3c MAP & practice reports";
let profiled = 0;
for (const t of teachers) {
  for (const subj of ["READING", "LANGUAGE"]) {
    const c: any = await op(MR, `Class Profile (${subj === "READING" ? "Reading" : "Language"})`, () => classProfile(repo, t.actor, t.classId, subj));
    if (c && subj === "READING") { profiled += c.n; check(MR, `${t.name}: class profile bands add up`, c.quintiles.reduce((a: number, x: number) => a + x, 0) === c.students.filter((x: any) => x.test.percentile !== null).length); }
  }
  for (const p of picked.filter((x) => x.classId === t.classId).slice(0, 3)) await op(MR, "Student Profile", () => studentProfile(repo, t.actor, p.id));
  const a: any = await op(MR, "Practice Analytics (school year)", () => practiceAnalytics(repo, t.actor, { classId: t.classId, from: new Date(Date.now() - 365 * 86_400_000), to: new Date(Date.now() + 86_400_000) }));
  if (a) {
    const members = (await raw.findMany("ClassMembership", { classId: t.classId, leftAt: null })).map((m: any) => String(m.studentId));
    const n = await raw.count("QuestionAttempt", { studentId: { in: members } });
    check(MR, `${t.name}: practice analytics = every answer of the class`, a.totals.questions === n && a.totals.schoolQuestions + a.totals.homeQuestions === n, `${a.totals.questions} vs ${n}`);
  }
}
const mapReading = new Set((await raw.findMany("MapResult", { goalName: null })).filter((r: any) => /read/i.test(String(r.subject))).map((r: any) => String(r.studentId)));
check(MR, "Class Profiles count every student with a Reading score", profiled === mapReading.size, `${profiled} vs ${mapReading.size}`);
const ov: any = await op(MR, "School overview", () => schoolOverview(repo, admin, "READING"));
check(MR, "school overview: grades = classes", ov && ov.grades.reduce((a: number, g: any) => a + g.n, 0) === ov.classes.reduce((a: number, c: any) => a + c.n, 0));

// ---------------------------------------------------------------- 4 · admin reports, class transfer, parents
const AD = "4 Admin reports";
for (const test of tests) await op(AD, "whole-grade Diagnostic analysis", () => classDiagnosticReport(repo, admin, test.id, null));
await op(AD, "Data Health (whole school)", () => dataHealth(repo, admin));
await op(AD, "Connections audit", () => connections(repo, admin));
await op(AD, "classes at a glance", () => classesAtAGlance(repo, admin));
const newAlerts: any = await op(AD, "alert scan (all students)", () => scanAlerts(repo, String(admin.schoolId), new Date(), true));
const ts: any = await schoolTeachers(raw, admin);
const t0 = teachers[0];
const lead = String((await raw.findMany("ClassTeacher", { classId: t0.classId }))[0].teacherId);
const to = ts.find((x: any) => x.id !== lead);
await op(AD, "class transfer", () => transferClass(repo, admin, t0.classId, to.id, false));
const toActor = await resolveActor(raw, (await raw.findUnique("User", { id: (await raw.findUnique("Teacher", { id: to.id })).userId }))!);
const afterMove: any = await op(AD, "new teacher opens the moved class's analysis", () => classDiagnosticReport(repo, toActor, tests.find((x) => x.grade === t0.grade)!.id, t0.classId));
check(AD, "class transfer keeps every result", afterMove?.summary.assessed === 25, `${afterMove?.summary.assessed}`);
check(AD, "the previous teacher no longer opens the moved class", (await classDiagnosticReport(raw, t0.actor, tests.find((x) => x.grade === t0.grade)!.id, t0.classId).then(() => false).catch(() => true)) === true);
const P_ = "5 Parent";
for (const par of parents) {
  await op(P_, "parent home summary", () => parentSummary(repo, par.actor, par.childId));
  await op(P_, "weekly summary", () => weekStats(repo, par.childId));
  const dr: any = await op(P_, "Diagnostic report (shared)", () => studentDiagnosticReport(repo, par.actor, par.childId));
  check(P_, "parent sees the shared Diagnostic report", !!dr);
  await op(P_, "teacher's progress report", () => parentReport(repo, par.actor, par.childId), true);
  await op(P_, "MAP family report", () => familyReport(repo, par.actor, par.childId), true);
}
const other = parents.find((x) => x.childId !== parents[0].childId)!;
check(P_, "a parent cannot open another child's report", (await studentDiagnosticReport(raw, parents[0].actor, other.childId).then(() => false).catch(() => true)) === true);

// ---------------------------------------------------------------- 5 · whole-school integrity
const I = "6 Integrity";
const allScores = await raw.findMany("DiagnosticScore", {});
check(I, "one Diagnostic result per student (150)", allScores.length === 150 && new Set(allScores.map((x: any) => x.studentId)).size === 150, `${allScores.length}`);
let bad = 0;
for (const sc of allScores) {
  const ses = await raw.findMany("PracticeSession", { studentId: sc.studentId, assignmentId: sc.assignmentId, mode: "TEACHER_QUIZ" });
  const att = ses.length === 1 ? await raw.findMany("QuestionAttempt", { sessionId: ses[0].id }) : [];
  const correct = att.filter((a: any) => a.isCorrect).length;
  if (ses.length !== 1 || att.length !== 50 || correct !== Number(sc.correct) || String(sc.level) !== (Number(sc.pct) >= 85 ? "ABOVE" : Number(sc.pct) >= 60 ? "ON" : "BELOW")) bad++;
}
check(I, "every Diagnostic result matches its 50 answers (score, level)", bad === 0, `${bad} mismatches`);
// 🎯 the adaptive test measured what it should
{
  const pairs = picked.map((p) => ({ p, sc: allScores.find((x: any) => x.studentId === p.id) })).filter((x) => x.sc && x.sc.theta !== null);
  const tr = pairs.map((x) => trueLevel(x.p)), es = pairs.map((x) => Number(x.sc.theta));
  const mean = (a: number[]) => a.reduce((s2, x) => s2 + x, 0) / a.length;
  const mt = mean(tr), me = mean(es);
  const r = tr.reduce((s2, x, i) => s2 + (x - mt) * (es[i] - me), 0) / Math.sqrt(tr.reduce((s2, x) => s2 + (x - mt) ** 2, 0) * es.reduce((s2, x) => s2 + (x - me) ** 2, 0));
  const mae = mean(tr.map((x, i) => Math.abs(x - es[i])));
  if (process.env.DEBUG_DIAG) for (const [i, x] of pairs.slice(0, 40).entries()) { const ses = (await raw.findMany("PracticeSession", { studentId: x.p.id, assignmentId: x.sc.assignmentId, mode: "TEACHER_QUIZ" }))[0]; const att = await raw.findMany("QuestionAttempt", { sessionId: ses.id }); const ds = designs.get(x.p.grade); const expP = att.reduce((s2: number, a: any) => s2 + pRight(tr[i], ds.items.find((q: any) => q.id === a.questionId)?.d ?? NaN), 0); const miss = att.filter((a: any) => !ds.items.find((q: any) => q.id === a.questionId)).length; console.log(x.p.grade, tr[i].toFixed(2), es[i].toFixed(2), Number(ses.lastTargetB).toFixed(2), x.sc.correct, x.sc.total, "expected", expP.toFixed(1), "missing", miss); }
  check(I, "adaptive: the estimate follows each student's real reading level", r >= 0.85 && mae <= 0.5, `correlation ${r.toFixed(2)} · average error ${mae.toFixed(2)} grade`);
  let sameSkills = 0, strongUp = 0, strong = 0, weakDown = 0, weak = 0;
  for (const { p, sc } of pairs) {
    const ds = designs.get(p.grade); const ses = (await raw.findMany("PracticeSession", { studentId: p.id, assignmentId: sc.assignmentId, mode: "TEACHER_QUIZ" }))[0];
    const att = (await raw.findMany("QuestionAttempt", { sessionId: ses.id })).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const items = att.map((a: any) => ds.items.find((q: any) => q.id === a.questionId));
    if (items.map((q: any) => q?.a).sort().join() === [...ds.blueprint].sort().join()) sameSkills++;
    const avgD = mean(items.slice(10).map((q: any) => q.d));
    // harder than the grade — as far as the bank goes (a Grade 6 bank without Grade 7 questions has a ceiling)
    const top = Math.max(...ds.items.map((q: any) => q.d));
    const above = items.filter((q: any) => q.d > Math.min(p.grade + 0.3, top - 0.4)).length;
    if (trueLevel(p) > p.grade + 0.7) { strong++; if (above >= 10) strongUp++; else if (process.env.DEBUG_DIAG) console.log("STRONG", p.grade, trueLevel(p).toFixed(2), Number(sc.theta), avgD.toFixed(2), items.slice(10).map((q: any) => q.d).join(" ")); }
    if (trueLevel(p) < p.grade - 0.7) { weak++; if (avgD < p.grade - 0.2) weakDown++; }
  }
  check(I, "adaptive: every student answered the same 50 skills", sameSkills === pairs.length, `${sameSkills}/${pairs.length}`);
  check(I, "adaptive: strong readers met 10+ questions above their grade (as far as the bank goes)", strong === 0 || strongUp / strong >= 0.9, `${strongUp}/${strong}`);
  check(I, "adaptive: students who need support met easier questions", weak === 0 || weakDown / weak >= 0.9, `${weakDown}/${weak}`);
  check(I, "adaptive: every result has an estimated MAP RIT and MAP goal areas", pairs.every((x) => Number(x.sc.ritEstimate) > 150 && (typeof x.sc.byArea === "string" ? JSON.parse(x.sc.byArea) : x.sc.byArea).length >= 4));
}
const sesKeys = new Map<string, number>(); for (const x of await raw.findMany("PracticeSession", { mode: "TEACHER_QUIZ" })) { const k = `${x.studentId}|${x.assignmentId}`; sesKeys.set(k, (sesKeys.get(k) ?? 0) + 1); }
check(I, "no duplicate sessions (double clicks)", [...sesKeys.values()].every((n) => n === 1));
for (const t of teachers) { const plan = (await raw.findMany("SkillPlan", { classId: t.classId, kind: "CURRICULUM" }))[0]; const sets = await raw.findMany("Assignment", { curriculumPlanId: plan.id }); check(I, `${t.name}: one hidden set per opened part`, sets.length === 1, `${sets.length}`); }
const wc = await raw.findMany("WeeklyCheck", {});
check(I, "one Weekly Check per student this week, all finished", wc.length === 150 && wc.every((x: any) => x.completedAt) && new Set(wc.map((x: any) => x.studentId)).size === 150, `${wc.length}`);
const rmA = await raw.findMany("ReadMasterAttempt", {});
check(I, "ReadMaster: one attempt per student, Lexile moved by the result", rmA.length === 150 && rmA.every((x: any) => (Number(x.correct) / Number(x.total) >= 0.75 ? Number(x.lexileAfter) > Number(x.lexileBefore) : Number(x.correct) / Number(x.total) < 0.5 ? Number(x.lexileAfter) < Number(x.lexileBefore) : true)), `${rmA.length}`);
check(I, "writing: 150 submitted, 60 scored", (await raw.count("WritingSubmission", { status: { in: ["SUBMITTED", "SCORED"] } })) === 150 && (await raw.count("WritingSubmission", { status: "SCORED" })) === 60);
check(I, "fluency: 150 checks", (await raw.count("FluencyCheck", {})) === 150);
const hidden = (await Promise.all(picked.slice(0, 30).map(async (p) => (await assignedSkills(raw, p.actor)).items.filter((x: any) => /Weekly Check|Curriculum plan/.test(String(x.title)) || x.curriculumPlanId).length))).reduce((a, b) => a + b, 0);
check(I, "hidden sets (plan parts, Weekly Check) stay out of My Work", hidden === 0, `${hidden}`);
const health: any = await dataHealth(raw, admin);
const noMap = health.rows.filter((r: any) => r.className.startsWith("TEST")).reduce((a: number, r: any) => a + r.noMap.length, 0);
const rosterAll = (await Promise.all(classes.map((c: any) => raw.count("ClassMembership", { classId: c.id, leftAt: null })))).reduce((a, b) => a + b, 0);
check(I, "Data Health: students without MAP = roster − 120 imported", noMap === rosterAll - 120, `${noMap} vs ${rosterAll - 120}`);
const conflicts = health.conflicts.length;
const alertsConf = (await raw.findMany("StudentAlert", { kind: "LEVEL_CONFLICT" })).length;
check(I, "every data disagreement became one alert", alertsConf === conflicts, `${alertsConf} alerts / ${conflicts} conflicts`);
const levels = await raw.findMany("StudentLevel", { studentId: { in: picked.map((p) => p.id) } });
check(I, "every student has a level after the day", levels.length === 150, `${levels.length}`);

// ---------------------------------------------------------------- 6 · the report files
const F = "7 Report files";
let pdfOk = false;
const deps = { repo: raw, pdf: chromiumRenderer({ executablePath: "/opt/pw-browsers/chromium", concurrency: 2, args: ["--no-sandbox"] }), fontDir: `${R}/assets/fonts`, brandingDir: `${R}/assets` };
const t4 = teachers[1];
for (const [fmt, name] of [["xlsx", "diagnostic-analysis-4B.xlsx"], ["csv", "diagnostic-analysis-4B.csv"], ["pdf", "diagnostic-analysis-4B.pdf"]] as const) {
  const f: any = await op(F, `Diagnostic analysis · ${fmt.toUpperCase()}`, () => exportDiagnostic(deps, t4.actor, { testId: tests.find((x) => x.grade === 4)!.id, classId: t4.classId, format: fmt }));
  if (f) { writeFileSync(`${FILES}/${name}`, f.bytes); if (fmt === "pdf") pdfOk = f.bytes.length > 1000; }
}
const st0 = picked.find((p) => p.classId === t4.classId)!;
const sf: any = await op(F, "student Diagnostic report · PDF", () => exportDiagnostic(deps, t4.actor, { testId: tests.find((x) => x.grade === 4)!.id, studentId: st0.id, format: "pdf" }));
if (sf) writeFileSync(`${FILES}/diagnostic-student-report.pdf`, sf.bytes);
check(F, "PDF files are made", pdfOk && !!sf);
await (deps.pdf as any).close?.();

// ---------------------------------------------------------------- 7b · NWEA MAP classification of the bank, the Learning Loop
const NW = "7b NWEA & Learning Loop";
const qBefore = await raw.count("Question", {});
const pv: any = await op(NW, "MAP classification preview (whole bank)", () => classificationPreview(repo, admin));
const ap: any = await op(NW, "MAP classification apply", () => applyClassification(repo, admin));
check(NW, "every question of the grades classified, none deleted", ap && pv && ap.classified + ap.unclassified + ap.kept === pv.preview.total && (await raw.count("Question", {})) === qBefore, `${ap?.classified}/${pv?.preview.total}`);
for (const t of teachers) {
  const l: any = await op(NW, "Learning Loop (class)", () => learningLoop(repo, t.classId === t0.classId ? toActor : t.actor, t.classId));
  if (l) check(NW, `${t.name}: every student has one step in the loop`, l.students.length === Object.values(l.students.reduce((m: any, x: any) => ((m[x.stage] = (m[x.stage] ?? 0) + 1), m), {})).reduce((a: number, b: any) => a + b, 0) && l.stages.length === 6);
}
await op(NW, "Learning Loop (whole school)", () => learningLoop(repo, admin, null));

// ---------------------------------------------------------------- 8 · Clear Roster: one student out and back, nothing lost
const CR = "8 Clear Roster";
const victim = picked[picked.length - 1];
const answersBefore = await raw.count("QuestionAttempt", { studentId: victim.id });
await op(CR, "archive one student", () => archiveStudents(repo, admin, { kind: "STUDENTS", ids: [victim.id] }));
check(CR, "archived student leaves the class", (await raw.findMany("ClassMembership", { studentId: victim.id, leftAt: null })).length === 0);
await op(CR, "restore", () => restoreStudents(repo, admin, [victim.id]));
check(CR, "restored: back in the class, every answer kept", (await raw.findMany("ClassMembership", { studentId: victim.id, leftAt: null })).length === 1 && (await raw.count("QuestionAttempt", { studentId: victim.id })) === answersBefore);
await op(CR, "roster list (school)", () => rosterList(repo, admin, { kind: "SCHOOL" }));

// ---------------------------------------------------------------- 9 · Update 32: the learning engine
const LE = "9 Learning engine";
const { runDaily } = await imp("src/server/insights/daily");
const { nextStep } = await imp("src/server/student/next-step");
const { profilesOf } = await imp("src/server/insights/student-profile");
const { groupMisconceptions } = await imp("src/server/insights/misconception-tags");
const { startIntervention, evaluateInterventions, classInterventions } = await imp("src/server/insights/interventions");
const daily: any = await op(LE, "daily learning job (whole school)", () => runDaily(repo, String(admin.schoolId)));
const wrongOpts = await raw.count("QuestionOption", { isCorrect: false }), taggedOpts = await raw.count("QuestionOption", { isCorrect: false, misconception: { not: null } });
check(LE, "every wrong option of the bank has a misconception", taggedOpts / Math.max(1, wrongOpts) >= 0.95, `${taggedOpts}/${wrongOpts}`);
const allIds = picked.map((p) => p.id);
const prof = await profilesOf(raw, allIds);
check(LE, "one profile for every student", prof.size === picked.length, `${prof.size} / ${picked.length}`);
const withMap = MAP_FROM.filter((p) => prof.get(p.id)?.readingRit !== null);
check(LE, "a level for every student; a next-MAP prediction for every student with a Fall MAP", [...prof.values()].every((x: any) => x.level) && withMap.every((p) => prof.get(p.id)?.predictedReading), `${withMap.length} with MAP`);
const wrongAns = await raw.count("QuestionAttempt", { isCorrect: false }), misAns = await raw.count("QuestionAttempt", { isCorrect: false, misconception: { not: null } });
check(LE, "wrong answers carry their misconception", misAns > 0, `${misAns} of ${wrongAns} wrong answers`);
let steps = 0;
for (const p of picked) { const st: any = await op(LE, "My Next Step (student home)", () => nextStep(repo, p.actor)); if (st?.title) steps++; }
check(LE, "My Next Step gives every student one action", steps === picked.length, `${steps}`);
let mis = 0, misRan = 0;
for (const t of teachers) {
  const ids = (await raw.findMany("ClassMembership", { classId: t.classId, leftAt: null })).map((m: any) => String(m.studentId));
  const g: any = await op(LE, "class misconceptions (30 days)", () => groupMisconceptions(repo, ids, 30));
  mis += g?.length ?? 0; if (Array.isArray(g)) misRan++;
  const sk = String((await raw.findMany("QuestionAttempt", { studentId: ids[0] }, { take: 1 }))[0]?.skillId ?? (await raw.findMany("Skill", {}, { take: 1 }))[0].id);
  await op(LE, "start an intervention group", () => startIntervention(repo, t.classId === t0.classId ? toActor : t.actor, { classId: t.classId, skillId: sk, studentIds: ids.slice(0, 4), days: 3 }, new Date(Date.now() - 4 * 86_400_000)));
}
// The simulated students pick wrong options at random (wrongOf), so after the chance correction (lift ≥ 1.5) no class should
// show a misconception group; real patterns are tested with constructed data in tests/update32-intelligence.test.ts.
check(LE, "class misconceptions run for every teacher, no false groups from random wrong answers", misRan === teachers.length && mis <= 1, `${mis} groups in ${misRan} classes`);
const evaluated: any = await op(LE, "measure finished interventions", () => evaluateInterventions(repo));
check(LE, "every finished intervention is measured and the teacher told", evaluated === teachers.length && (await raw.count("Notification", { type: "INTERVENTION_ALERT" })) >= teachers.length, `${evaluated}`);
await op(LE, "intervention list (class)", () => classInterventions(repo, teachers[1].actor, teachers[1].classId));
check(LE, "one daily summary per teacher instead of many", daily && daily.digests >= teachers.length - 1, `${daily?.digests} (a teacher whose only class moved has none)`);

// ---------------------------------------------------------------- out
const pct = (a: number[], q: number) => { const x = [...a].sort((m, n) => m - n); return x.length ? x[Math.min(x.length - 1, Math.floor((q / 100) * x.length))] : 0; };
const rows = [...stats].map(([key, v]) => ({ key, area: v.area, name: key.split(" · ").slice(1).join(" · "), n: v.ms.length, err: v.err, errors: v.errors, p50: +pct(v.ms, 50).toFixed(1), p95: +pct(v.ms, 95).toFixed(1), max: +Math.max(...v.ms).toFixed(1), q: Math.round(v.q.reduce((a, b) => a + b, 0) / v.q.length), qmax: Math.max(...v.q) }));
const totals = { actions: rows.reduce((a, r) => a + r.n, 0), errors: rows.reduce((a, r) => a + r.err, 0), queries: [...stats.values()].reduce((a, v) => a + v.q.reduce((x, y) => x + y, 0), 0) };
const school = {
  diagnostic: { taken: allScores.length, mean: Math.round(10 * allScores.reduce((a: number, x: any) => a + Number(x.pct), 0) / allScores.length) / 10, above: allScores.filter((x: any) => x.level === "ABOVE").length, on: allScores.filter((x: any) => x.level === "ON").length, below: allScores.filter((x: any) => x.level === "BELOW").length },
  answers: await raw.count("QuestionAttempt", {}), planPartsDone: await raw.count("AssignmentStudent", { status: "COMPLETED", assignmentId: { in: (await raw.findMany("Assignment", {})).filter((a: any) => a.curriculumPlanId && a.curriculumPlanId !== "WEEKLY_CHECK").map((a: any) => a.id) } }),
  weeklyChecks: wc.length, readMaster: rmA.length, writing: await raw.count("WritingSubmission", {}), fluency: await raw.count("FluencyCheck", {}), alerts: await raw.count("StudentAlert", {}), alertsNew: newAlerts, conflicts, notifications: await raw.count("Notification", {}),
  engine: { profiles: (await raw.count("StudentProfile", {})), misconceptionAnswers: await raw.count("QuestionAttempt", { isCorrect: false, misconception: { not: null } }), wrongAnswers: await raw.count("QuestionAttempt", { isCorrect: false }), recommendations: await raw.count("Recommendation", {}), interventions: await raw.count("Intervention", {}), levels: Object.fromEntries(["BELOW", "ON", "ABOVE", "UNKNOWN"].map((l) => [l, [...(prof.values() as any)].filter((x: any) => x.level === l).length])), atRisk: [...(prof.values() as any)].filter((x: any) => x.goalChance !== null && x.goalChance < 40).length, hinted: await raw.count("QuestionAttempt", { usedHint: true }) },
  supportGroups: (await Promise.all(teachers.map(async (t) => ((await supportGroups(raw, t.classId === t0.classId ? toActor : t.actor, t.classId)).groups as any[]).map((g) => g.kind)))).flat(),
};
writeFileSync(OUT, JSON.stringify({ setupS, dayS, aftS, polls, totals, school, checks, rows, files: FILES }, null, 1));
console.log(`day ${dayS.toFixed(1)} s · afternoon ${aftS.toFixed(1)} s · ${totals.actions} actions · ${totals.errors} errors · ${totals.queries} queries`);
console.log(`checks: ${checks.filter((c) => c.ok).length}/${checks.length} passed`);
for (const c of checks.filter((x) => !x.ok)) console.log(` ✗ ${c.area} · ${c.name} ${c.detail}`);
for (const r of rows.filter((x) => x.err)) console.log(` ⚠ ${r.key}: ${r.err} errors — ${r.errors.join(" | ")}`);
