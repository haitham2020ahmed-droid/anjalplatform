/**
 * 📊 Diagnostic analysis: the class (or whole grade) report and each student's report.
 *
 * Class report: executive summary, the master table (every student × every standard, percentile rank, level, MAP
 * RIT, fluency), who has not taken it, levels (Below / On / Above), four performance tiers with their strategy,
 * strands and standards with a teaching prescription, an 8-week support plan for the students who need it most,
 * a fluency check, and an item analysis (questions most students missed — often a question to review).
 *
 * Student report: score and level, strands and standards against the class, strengths, needs, the next steps
 * (with links to practise), fluency, and the teacher's note. Students and families see it once it is shared.
 */
import { percentRank, spreadNote, stdev } from "../insights/stats";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { codeFor, designOf, diagnosticPool } from "./test";
import { gradeLabel } from "./adaptive";
import { fluencyLevel, fluencyRubricText, prescriptionFor, standardLevel, STRAND_LABEL, bandFor, TIERS, WCPM_BENCHMARK, type Strand } from "./standards";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const pctOf = (c: number, t: number) => (t ? Math.round((1000 * c) / t) / 10 : 0);
const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round(5 * (a[m - 1] + a[m])) / 10; };

type StdCell = { code: string; label: string; strand: Strand; anchor: string; correct: number; total: number; score?: number; gl?: string; theta?: number };
/** a cell's result: the adaptive score (0–100 on the grade scale) when there is one, else % correct */
const cellPct = (x: { correct: number; total: number; score?: number }) => (typeof x.score === "number" ? x.score : pctOf(x.correct, x.total));
export interface StudentRow {
  id: string; name: string; number: string; className: string; correct: number; total: number; pct: number; rank: number; level: "ABOVE" | "ON" | "BELOW"; tier: string;
  standards: Record<string, number>; strands: Record<string, number>; minutes: number; rapid: number; rit: number | null; wcpm: number | null; shared: boolean; resultId: string;
  /** adaptive tests: reading level (“Grade 5.3”) and the estimated MAP Reading RIT */
  readingLevel: string | null; ritEstimate: number | null; theta: number | null;
}
export interface GrowthRow { id: string; name: string; start: number; calibrated: number; maps: { term: string; date: string; rit: number }[]; growth: number | null }
export interface ClassDiagnosticReport {
  testId: string; title: string; grade: number; year: string; scope: string; classId: string | null; date: string; bands: { above: number; on: number };
  classes: { id: string; name: string }[];
  summary: { roster: number; assessed: number; inProgress: number; notStarted: number; mean: number; median: number; min: number; max: number; sd: number | null; spread: string; minutes: number; rapidFlags: number; best: { code: string; label: string; pct: number } | null; focus: { code: string; label: string; pct: number }[]; levels: { ABOVE: number; ON: number; BELOW: number } };
  standards: { code: string; label: string; strand: Strand; questions: number; pct: number; level: string; below50: number; objective: string; activities: string[] }[];
  strands: { strand: Strand; label: string; pct: number }[];
  students: StudentRow[];
  notTaken: { id: string; name: string; className: string; status: "Not started" | "In progress"; answered: number; action: string }[];
  tiers: { key: string; name: string; sub: string; band: string; strategy: string; students: { id: string; name: string; pct: number }[] }[];
  supportPlan: { week: number; code: string; label: string; objective: string; activities: string[]; students: { id: string; name: string; pct: number }[] }[];
  fluency: { benchmark: number; rubric?: string; checked: number; below: { id: string; name: string; wcpm: number }[] };
  items: { n: number; questionId: string; code: string; label: string; pct: number; answered: number; stem: string }[];
  /** adaptive: one score scale for every grade; growth from the Diagnostic to the MAP tests that followed it */
  adaptive: boolean;
  growth: { offset: number | null; pairs: number; rows: GrowthRow[] } | null;
}

async function testRow(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const t = await repo.findUnique("DiagnosticTest", { id });
  if (!t || s(t.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Diagnostic not found.");
  return t;
}

/** The class report (a class of the teacher, or — for admins and coordinators — the whole grade when classId is empty). */
export async function classDiagnosticReport(repo: Repo, actor: Actor, testId: string, classId?: string | null, now = new Date()): Promise<ClassDiagnosticReport> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const t = await testRow(repo, actor, testId);
  const grade = Number(t.grade);
  const gradeRow = (await repo.findMany("Grade", { schoolId: t.schoolId, level: grade }))[0];
  const mine = (await readableClasses(repo, actor)).filter((c) => gradeRow && s(c.gradeId) === s(gradeRow.id) && !c.deletedAt).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (!mine.length) throw new ForbiddenError("You have no class in this grade.");
  const whole = !classId && actor.role !== "TEACHER";
  const scopeClasses = classId ? mine.filter((c) => c.id === classId) : whole ? mine : [mine[0]];
  if (!scopeClasses.length) throw new ForbiddenError("This class is not yours.");
  const classIds = scopeClasses.map((c) => s(c.id));
  const members = await repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["studentId", "classId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const classOf = new Map(members.map((m) => [s(m.studentId), s(scopeClasses.find((c) => c.id === m.classId)?.name)]));
  const [names, results, assigns, aqs] = await Promise.all([
    studentNames(repo, ids),
    ids.length ? repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    repo.findMany("Assignment", { assessmentId: t.assessmentId, classId: { in: classIds }, deletedAt: null }, { select: ["id"] }),
    repo.findMany("AssessmentQuestion", { assessmentId: t.assessmentId }),
  ]);
  const sessions = assigns.length && ids.length ? await repo.findMany("PracticeSession", { assignmentId: { in: assigns.map((a) => a.id) }, studentId: { in: ids }, mode: "TEACHER_QUIZ" }, { select: ["id", "studentId"] }) : [];
  const attempts = sessions.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessions.map((x) => x.id) } }, { select: ["sessionId", "questionId", "isCorrect"] }) : [];
  // MAP Reading (Fall) and the latest fluency check of each student
  const [maps, flu] = await Promise.all([
    ids.length ? repo.findMany("MapResult", { studentId: { in: ids } }, { select: ["studentId", "subject", "goalName", "rit", "termName", "testDate"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("FluencyCheck", { studentId: { in: ids } }, { select: ["studentId", "wcpm", "checkedAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const ritOf = (id: string) => { const r = maps.filter((m) => s(m.studentId) === id && !m.goalName && /read/i.test(s(m.subject))).sort((a, b) => (d(b.testDate)?.getTime() ?? 0) - (d(a.testDate)?.getTime() ?? 0)); return r.length ? Number(r[r.length - 1].rit) : null; };
  const wcpmOf = (id: string) => { const r = flu.filter((f) => s(f.studentId) === id).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0]; return r ? Number(r.wcpm) : null; };
  const bands = json<{ above?: number; on?: number }>(t.bands, {});
  const B = { above: Number(bands.above) || 85, on: Number(bands.on) || 65 };

  const res = results.filter((r) => ids.includes(s(r.studentId)));
  const pcts = res.map((r) => Number(r.pct)).sort((a, b) => a - b);
  // percentile rank among those assessed (share of students scoring lower, + half the ties)
  // percentile rank in the group (Excel PERCENTRANK.INC, as in the school's workbooks)
  const rankOf = (p: number) => percentRank(pcts, p) ?? 50;
  const students: StudentRow[] = res.map((r) => {
    const id = s(r.studentId), stds = json<StdCell[]>(r.byStandard, []), strs = json<{ strand: Strand; correct: number; total: number }[]>(r.byStrand, []);
    const pct = Number(r.pct);
    return {
      id, name: names.get(id)?.name ?? "Student", number: names.get(id)?.number ?? "", className: classOf.get(id) ?? "", correct: Number(r.correct), total: Number(r.total), pct, rank: rankOf(pct),
      level: s(r.level) as StudentRow["level"], tier: bandFor(pct, s(r.level)).key, standards: Object.fromEntries(stds.map((x) => [x.code, cellPct(x)])), strands: Object.fromEntries(strs.map((x) => [x.strand, cellPct(x)])),
      minutes: Number(r.minutes), rapid: Number(r.rapid), rit: ritOf(id), wcpm: wcpmOf(id), shared: Boolean(r.sharedAt), resultId: s(r.id),
      readingLevel: r.theta !== null && r.theta !== undefined ? gradeLabel(Number(r.theta)) : null, ritEstimate: r.ritEstimate !== null && r.ritEstimate !== undefined ? Number(r.ritEstimate) : null, theta: r.theta !== null && r.theta !== undefined ? Number(r.theta) : null,
    };
  }).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

  // standards of the test, in code order, with the class average
  const stdInfo = new Map<string, { code: string; label: string; strand: Strand; anchor: string; questions: number }>();
  for (const r of res) for (const x of json<StdCell[]>(r.byStandard, [])) if (!stdInfo.has(x.code)) stdInfo.set(x.code, { code: x.code, label: x.label, strand: x.strand, anchor: x.anchor, questions: x.total });
  const standards = [...stdInfo.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map((x) => {
    const vals = students.map((st) => st.standards[x.code]).filter((v): v is number => v !== undefined);
    const pct = avg(vals); const p = prescriptionFor(x.anchor);
    return { code: x.code, label: x.label, strand: x.strand, questions: x.questions, pct, level: standardLevel(pct), below50: vals.filter((v) => v < 50).length, objective: p.objective, activities: p.activities };
  });
  const strandKeys = [...new Set(standards.map((x) => x.strand))];
  const strands = strandKeys.map((k) => ({ strand: k, label: STRAND_LABEL[k], pct: avg(students.map((st) => st.strands[k]).filter((v): v is number => v !== undefined)) }));
  const ranked = [...standards].sort((a, b) => a.pct - b.pct);

  // not taken: never started, or started and not finished
  const done = new Set(res.map((r) => s(r.studentId)));
  const answeredOf = new Map<string, number>(); for (const ses of sessions) answeredOf.set(s(ses.studentId), new Set(attempts.filter((a) => a.sessionId === ses.id).map((a) => s(a.questionId))).size);
  const notTaken = ids.filter((id) => !done.has(id)).map((id) => {
    const answered = answeredOf.get(id) ?? 0;
    return { id, name: names.get(id)?.name ?? "Student", className: classOf.get(id) ?? "", status: (answered ? "In progress" : "Not started") as "In progress" | "Not started", answered, action: answered ? "Remind the student to finish (answers are saved)" : "Schedule a make-up session in the computer lab" };
  }).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));

  const tiers = TIERS.map((tr, i) => ({ key: tr.key, name: tr.name, sub: tr.sub, band: i === 0 ? `${tr.min}% – 100%` : `${tr.min}% – ${TIERS[i - 1].min - 0.1}%`, strategy: tr.strategy, students: students.filter((st) => st.tier === tr.key).map((st) => ({ id: st.id, name: st.name, pct: st.pct })) }));

  // 🛟 8-week support plan: the weakest standards of the students who need support (Below level or Tier 3–4)
  const support = students.filter((st) => st.level === "BELOW" || st.tier === "INTENSIVE" || st.tier === "APPROACHING");
  const supportStd = standards.map((x) => ({ x, pct: avg(support.map((st) => st.standards[x.code]).filter((v): v is number => v !== undefined)) })).filter((y) => support.length).sort((a, b) => a.pct - b.pct);
  const supportPlan: ClassDiagnosticReport["supportPlan"] = [];
  const order = supportStd.length ? supportStd : [];
  for (let w = 0; w < 8 && order.length; w++) {
    if (w === 7) { supportPlan.push({ week: 8, code: "REVIEW", label: "Review & re-check", objective: "Students review the weeks’ skills and take a short check; regroup by the results.", activities: ["Mixed review of the focus standards (short texts).", "Weekly Check on the platform.", "Regroup: who is ready to leave the support group?"], students: support.map((st) => ({ id: st.id, name: st.name, pct: st.pct })) }); break; }
    const y = order[w % order.length];
    const group = support.filter((st) => (st.standards[y.x.code] ?? 100) < 60);
    supportPlan.push({ week: w + 1, code: y.x.code, label: y.x.label, objective: y.x.objective, activities: y.x.activities, students: (group.length ? group : support).map((st) => ({ id: st.id, name: st.name, pct: st.standards[y.x.code] ?? st.pct })) });
  }

  // item analysis (adaptive: the questions students actually met)
  const design = designOf(t);
  if (design) {
    const met = [...new Set(attempts.map((a) => s(a.questionId)))];
    const qrows = met.length ? await repo.findMany("Question", { id: { in: met } }, { select: ["id", "stem"] }) : [];
    const byId = new Map(design.items.map((q) => [q.id, q]));
    const list = met.map((qid) => { const mineA = attempts.filter((a) => s(a.questionId) === qid); const q = byId.get(qid); const code = q ? codeFor(q.a, grade) : ""; return { questionId: qid, code, label: q ? `Difficulty: ${gradeLabel(q.d)}` : "", pct: pctOf(mineA.filter((a) => a.isCorrect).length, mineA.length), answered: mineA.length, stem: s(qrows.find((x) => x.id === qid)?.stem).replace(/\s+/g, " ").slice(0, 120) }; })
      .sort((a, b) => b.answered - a.answered || a.code.localeCompare(b.code, undefined, { numeric: true })).slice(0, 80).map((x, i) => ({ n: i + 1, ...x }));
    return finish(list);
  }
  const qs = aqs.length ? await repo.findMany("Question", { id: { in: aqs.map((q) => s(q.questionId)) } }, { select: ["id", "stem"] }) : [];
  const areaByQ = new Map<string, { code: string; label: string }>();
  // the area of each question comes from the result rows' standards order: read it from the pool once
  for (const p of await diagnosticPool(repo, s(t.schoolId), grade)) areaByQ.set(p.id, { code: p.area.code, label: p.area.label });
  const items = aqs.sort((a, b) => Number(a.order) - Number(b.order)).map((q, i) => {
    const mineA = attempts.filter((a) => s(a.questionId) === s(q.questionId));
    const area = areaByQ.get(s(q.questionId)) ?? { code: "", label: "" };
    return { n: i + 1, questionId: s(q.questionId), code: area.code, label: area.label, pct: pctOf(mineA.filter((a) => a.isCorrect).length, mineA.length), answered: mineA.length, stem: s(qs.find((x) => x.id === q.questionId)?.stem).replace(/\s+/g, " ").slice(0, 120) };
  });

  return finish(items);

  async function finish(items: ClassDiagnosticReport["items"]): Promise<ClassDiagnosticReport> {
  const bench = WCPM_BENCHMARK[grade] ?? 120;
  const withW = students.filter((st) => st.wcpm !== null);
  const growth = design ? await growthOf() : null;
  return {
    testId: s(t.id), title: s(t.title), grade, year: s(t.year), scope: whole ? `Grade ${grade} · all classes` : s(scopeClasses[0].name), classId: whole ? null : s(scopeClasses[0].id), date: now.toISOString().slice(0, 10), bands: B,
    classes: mine.map((c) => ({ id: s(c.id), name: s(c.name) })),
    summary: {
      roster: ids.length, assessed: res.length, inProgress: notTaken.filter((x) => x.status === "In progress").length, notStarted: notTaken.filter((x) => x.status === "Not started").length,
      mean: avg(pcts), median: median(pcts), min: pcts[0] ?? 0, max: pcts[pcts.length - 1] ?? 0, sd: stdev(pcts), spread: spreadNote(stdev(pcts)), minutes: Math.round(avg(students.map((x) => x.minutes))), rapidFlags: students.filter((x) => x.rapid >= x.total * 0.3).length,
      best: ranked.length ? { code: ranked[ranked.length - 1].code, label: ranked[ranked.length - 1].label, pct: ranked[ranked.length - 1].pct } : null,
      focus: ranked.slice(0, 2).map((x) => ({ code: x.code, label: x.label, pct: x.pct })),
      levels: { ABOVE: students.filter((x) => x.level === "ABOVE").length, ON: students.filter((x) => x.level === "ON").length, BELOW: students.filter((x) => x.level === "BELOW").length },
    },
    standards, strands, students, notTaken, tiers, supportPlan,
    fluency: { benchmark: bench, rubric: fluencyRubricText(grade), checked: withW.length, below: withW.filter((x) => fluencyLevel(x.wcpm!, grade) === "BELOW").map((x) => ({ id: x.id, name: x.name, wcpm: x.wcpm! })).sort((a, b) => a.wcpm - b.wcpm) },
    items, adaptive: Boolean(design), growth,
  };
  }

  /**
   * Diagnostic → MAP: every assessed student's estimated RIT, then the MAP Reading tests taken after the Diagnostic.
   * The school-wide gap between the estimate and the first MAP after it (median) calibrates the starting point,
   * so the growth shown is real growth, not the difference between two scales.
   */
  async function growthOf(): Promise<ClassDiagnosticReport["growth"]> {
    const all = await repo.findMany("DiagnosticScore", { diagnosticId: t.id }, { select: ["studentId", "ritEstimate", "completedAt"] });
    const est = all.filter((r) => r.ritEstimate !== null && r.ritEstimate !== undefined);
    const allMaps = est.length ? await repo.findMany("MapResult", { studentId: { in: est.map((r) => s(r.studentId)) } }, { select: ["studentId", "subject", "goalName", "rit", "termName", "testDate"] }) : [];
    const after = (id: string, from: Date | null) => allMaps.filter((m) => s(m.studentId) === id && !m.goalName && /read/i.test(s(m.subject)) && (d(m.testDate)?.getTime() ?? 0) > (from?.getTime() ?? 0)).sort((a, b) => (d(a.testDate)?.getTime() ?? 0) - (d(b.testDate)?.getTime() ?? 0));
    const diffs = est.map((r) => { const m = after(s(r.studentId), d(r.completedAt))[0]; return m ? Number(m.rit) - Number(r.ritEstimate) : null; }).filter((x): x is number => x !== null);
    const offset = diffs.length >= 5 ? Math.round(median(diffs)) : null;
    const rows: GrowthRow[] = students.filter((st) => st.ritEstimate !== null).map((st) => {
      const r = est.find((x) => s(x.studentId) === st.id);
      const maps = after(st.id, d(r?.completedAt)).map((m) => ({ term: s(m.termName) || "MAP", date: (d(m.testDate) ?? new Date()).toISOString().slice(0, 10), rit: Number(m.rit) }));
      const calibrated = st.ritEstimate! + (offset ?? 0);
      return { id: st.id, name: st.name, start: st.ritEstimate!, calibrated, maps, growth: maps.length ? maps[maps.length - 1].rit - calibrated : null };
    });
    return { offset, pairs: diffs.length, rows };
  }
}


export interface StudentDiagnosticReport {
  resultId: string; testId: string; title: string; grade: number; year: string; date: string; student: { id: string; name: string; number: string; className: string };
  correct: number; total: number; pct: number; level: "ABOVE" | "ON" | "BELOW"; tier: { name: string; sub: string }; bands: { above: number; on: number };
  strands: { strand: Strand; label: string; pct: number; readingLevel: string | null; classPct: number | null }[];
  standards: { code: string; label: string; correct: number; total: number; pct: number; readingLevel: string | null; classPct: number | null; status: "Strength" | "Developing" | "Needs support" }[];
  strengths: string[]; needs: { code: string; label: string; pct: number; objective: string; tip: string }[];
  rit: number | null; wcpm: { value: number; benchmark: number } | null; minutes: number; rapid: number; shared: boolean; sharedAt: string | null; note: string | null;
  /** adaptive: overall reading level, the estimated MAP Reading RIT, and the result by MAP goal area */
  adaptive: boolean; readingLevel: string | null; ritEstimate: number | null; areas: { name: string; score: number; readingLevel: string }[];
}

/** One student's report: staff of their class; the student or their parent once it is shared. */
export async function studentDiagnosticReport(repo: Repo, actor: Actor, studentId: string, testId?: string | null): Promise<StudentDiagnosticReport | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const results = (await repo.findMany("DiagnosticScore", { studentId })).sort((a, b) => (d(b.completedAt)?.getTime() ?? 0) - (d(a.completedAt)?.getTime() ?? 0));
  const r = testId ? results.find((x) => s(x.diagnosticId) === testId) : results[0];
  const family = actor.role === "STUDENT" || actor.role === "PARENT";
  if (actor.role === "STUDENT" && actor.studentId !== studentId) throw new ForbiddenError("Student not found.");
  if (actor.role === "PARENT" && !actor.parentChildIds?.has(studentId)) throw new ForbiddenError("Student not found.");
  if (!family) {
    assertCan(actor, "reports:read");
    const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
    if (actor.role === "TEACHER" && !(await readableClasses(repo, actor)).some((c) => m && c.id === m.classId)) throw new ForbiddenError("This student is not in your classes.");
  }
  if (!r) return null;
  if (family && !r.sharedAt) return null;
  const t = await repo.findUnique("DiagnosticTest", { id: r.diagnosticId });
  // the class averages (same test, same class)
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const mates = klass ? (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((x) => s(x.studentId)) : [];
  const classRes = mates.length ? await repo.findMany("DiagnosticScore", { diagnosticId: r.diagnosticId, studentId: { in: mates } }) : [];
  const classStd = (code: string) => { const v = classRes.map((x) => json<StdCell[]>(x.byStandard, []).find((y) => y.code === code)).filter((y): y is StdCell => !!y); return v.length ? avg(v.map((y) => cellPct(y))) : null; };
  const classStrand = (k: string) => { const v = classRes.map((x) => json<{ strand: string; correct: number; total: number; score?: number }[]>(x.byStrand, []).find((y) => y.strand === k)).filter(Boolean) as { correct: number; total: number; score?: number }[]; return v.length ? avg(v.map((y) => cellPct(y))) : null; };
  const names = await studentNames(repo, [studentId]);
  const stds = json<StdCell[]>(r.byStandard, []);
  const standards = stds.map((x) => { const pct = cellPct(x); return { code: x.code, label: x.label, correct: x.correct, total: x.total, pct, readingLevel: x.gl ?? null, classPct: classStd(x.code), status: (pct >= 75 ? "Strength" : pct >= 50 ? "Developing" : "Needs support") as "Strength" | "Developing" | "Needs support", anchor: x.anchor }; }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const pct = Number(r.pct);
  const tier = bandFor(pct, s(r.level));
  const maps = await repo.findMany("MapResult", { studentId }, { select: ["subject", "goalName", "rit", "testDate"] });
  const reading = maps.filter((x) => !x.goalName && /read/i.test(s(x.subject))).sort((a, b) => (d(a.testDate)?.getTime() ?? 0) - (d(b.testDate)?.getTime() ?? 0))[0];
  const flu = (await repo.findMany("FluencyCheck", { studentId })).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0];
  const grade = Number(t?.grade ?? 0);
  const bands = json<{ above?: number; on?: number }>(t?.bands, {});
  return {
    resultId: s(r.id), testId: s(r.diagnosticId), title: s(t?.title), grade, year: s(t?.year), date: (d(r.completedAt) ?? new Date()).toISOString().slice(0, 10),
    student: { id: studentId, name: names.get(studentId)?.name ?? "Student", number: names.get(studentId)?.number ?? "", className: s(klass?.name) },
    correct: Number(r.correct), total: Number(r.total), pct, level: s(r.level) as "ABOVE" | "ON" | "BELOW", tier: { name: tier.name, sub: tier.sub }, bands: { above: Number(bands.above) || 85, on: Number(bands.on) || 65 },
    strands: json<{ strand: Strand; correct: number; total: number; score?: number; gl?: string }[]>(r.byStrand, []).map((x) => ({ strand: x.strand, label: STRAND_LABEL[x.strand], pct: cellPct(x), readingLevel: x.gl ?? null, classPct: classStrand(x.strand) })),
    standards: standards.map(({ anchor: _a, ...x }) => x),
    strengths: standards.filter((x) => x.pct >= 75).sort((a, b) => b.pct - a.pct).slice(0, 4).map((x) => `${x.label} (${x.code})`),
    needs: standards.filter((x) => x.pct < 60).sort((a, b) => a.pct - b.pct).slice(0, 4).map((x) => { const p = prescriptionFor(x.anchor); return { code: x.code, label: x.label, pct: x.pct, objective: p.objective, tip: p.activities[0] }; }),
    rit: reading ? Number(reading.rit) : null, wcpm: flu ? { value: Number(flu.wcpm), benchmark: WCPM_BENCHMARK[grade] ?? 120 } : null,
    minutes: Number(r.minutes), rapid: Number(r.rapid), shared: Boolean(r.sharedAt), sharedAt: d(r.sharedAt)?.toISOString().slice(0, 10) ?? null, note: r.teacherNote ? s(r.teacherNote) : null,
    adaptive: r.theta !== null && r.theta !== undefined, readingLevel: r.theta !== null && r.theta !== undefined ? gradeLabel(Number(r.theta)) : null,
    ritEstimate: r.ritEstimate !== null && r.ritEstimate !== undefined ? Number(r.ritEstimate) : null,
    areas: json<{ name: string; score: number; gl: string }[]>(r.byArea, []).map((x) => ({ name: x.name, score: x.score, readingLevel: x.gl })),
  };
}

/** 📤 Share (or stop sharing) results with the students and their families, with an optional note for one student. A teacher's share goes to the school admins for approval first. */
export async function shareDiagnosticResults(repo: Repo, actor: Actor, input: { testId: string; studentIds: string[]; shared: boolean; note?: string | null }, now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  const t = await testRow(repo, actor, input.testId);
  if (!input.studentIds.length) throw new ValidationError("Choose at least one student.");
  const allowed = new Set<string>();
  const classes = await readableClasses(repo, actor);
  const mem = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId"] }) : [];
  for (const m of mem) allowed.add(s(m.studentId));
  const ids = input.studentIds.filter((id) => allowed.has(id));
  if (!ids.length) throw new ForbiddenError("These students are not in your classes.");
  const rows = await repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId: { in: ids } });
  // a teacher's share waits for a school admin's approval (👪 family reports); stopping is immediate
  if (input.shared && actor.role === "TEACHER") {
    const { requestShareApproval } = await import("../reports/family-reports");
    for (const r of rows) await requestShareApproval(repo, actor, { studentId: s(r.studentId), kind: "DIAGNOSTIC", refId: s(t.id), note: input.note !== undefined && ids.length === 1 ? input.note : undefined }, now);
    return rows.length;
  }
  for (const r of rows) {
    const patch: Record<string, unknown> = { sharedAt: input.shared ? now : null };
    if (input.note !== undefined && ids.length === 1) patch.teacherNote = input.note ? s(input.note).slice(0, 1000) : null;
    await repo.updateMany("DiagnosticScore", { id: r.id }, patch);
  }
  if (input.shared) {
    const sts = await repo.findMany("Student", { id: { in: rows.map((r) => s(r.studentId)) } }, { select: ["id", "userId"] });
    if (sts.length) await repo.createMany("Notification", sts.map((x) => ({ userId: x.userId, type: "PARENT_PROGRESS", title: "📊 Your Diagnostic report is ready", body: "Open Family Report to see your strengths and what to work on next. Show it to your family!", link: "/student/family/diagnostic", readAt: null, createdAt: now })));
  }
  return rows.length;
}

// ------------------------------------------------------------------ benchmark-style categories (80% target)

export type BenchKey = "LIT_COMP" | "INFO_COMP" | "VOCAB" | "LANG" | "RESEARCH" | "FOUND";
export const BENCH_ORDER: BenchKey[] = ["LIT_COMP", "INFO_COMP", "VOCAB", "LANG", "RESEARCH", "FOUND"];
export const BENCH_LABEL: Record<BenchKey, string> = {
  LIT_COMP: "Comprehension · Literary", INFO_COMP: "Comprehension · Informational", VOCAB: "Vocabulary", LANG: "Language & Conventions", RESEARCH: "Research & Text Features", FOUND: "Foundational Skills (Word Study)",
};
/** the benchmark target per category (% correct) */
export const BENCH_TARGET = 80;
/** charts, diagrams, visuals and integrating sources report as Research & Text Features */
const RESEARCH_ANCHORS = new Set(["RI.7", "RI.9", "W.7", "W.8", "W.9"]);

/** The benchmark category of a reporting area (null: writing, not reported here). */
export function benchCategoryOf(anchor: string, strand: Strand): BenchKey | null {
  if (RESEARCH_ANCHORS.has(anchor)) return "RESEARCH";
  return strand === "LIT" ? "LIT_COMP" : strand === "INFO" ? "INFO_COMP" : strand === "VOCAB" ? "VOCAB" : strand === "LANG" ? "LANG" : strand === "FOUND" ? "FOUND" : null;
}
export interface BenchCell { key: BenchKey; label: string; correct: number; total: number; pct: number; met: boolean }
/** One result's categories (raw + %, against the 80% target), in a fixed order; only the categories the test had. */
export function benchmarkCategories(byStandard: { anchor: string; strand: Strand; correct: number; total: number }[], target = BENCH_TARGET): BenchCell[] {
  const sum = new Map<BenchKey, { correct: number; total: number }>();
  for (const x of byStandard) {
    const k = benchCategoryOf(s(x.anchor), x.strand); if (!k) continue;
    const v = sum.get(k) ?? { correct: 0, total: 0 }; v.correct += Number(x.correct) || 0; v.total += Number(x.total) || 0; sum.set(k, v);
  }
  return BENCH_ORDER.filter((k) => (sum.get(k)?.total ?? 0) > 0).map((k) => { const v = sum.get(k)!; const pct = pctOf(v.correct, v.total); return { key: k, label: BENCH_LABEL[k], correct: v.correct, total: v.total, pct, met: pct >= target }; });
}

export interface ReteachSkill { skillId: string; name: string; anchor: string; href: string }
export interface ClassBenchmark {
  testId: string; title: string; grade: number; scope: string; classId: string | null; target: number;
  categories: (BenchCell & { students: number; belowTarget: number; weakest: { anchor: string; code: string; label: string; pct: number }[]; reteach: ReteachSkill[] })[];
  students: { id: string; name: string; categories: Partial<Record<BenchKey, BenchCell>> }[];
}

/**
 * The skills to reteach for a category: the grade's skills linked to its weakest standards (Foundational: the
 * word-study skill families), each opening the skill-assign bank panel.
 */
async function reteachSkills(repo: Repo, schoolId: string, grade: number, key: BenchKey, anchors: string[], classId: string | null, max = 3): Promise<ReteachSkill[]> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) return [];
  const curs = await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] });
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "familyId", "sequence"] }) : [];
  if (!skills.length) return [];
  const href = (id: string) => `/teacher/skill-assign?skillId=${encodeURIComponent(id)}${classId ? `&classId=${encodeURIComponent(classId)}` : ""}`;
  const bySeq = (a: Row, b: Row) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0) || s(a.name).localeCompare(s(b.name));
  if (key === "FOUND") {
    const { WORD_STUDY_FAMILIES } = await import("./standards");
    const fams = await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "code"] });
    const ws = new Set(fams.filter((f) => WORD_STUDY_FAMILIES.has(s(f.code))).map((f) => s(f.id)));
    return skills.filter((k) => ws.has(s(k.familyId))).sort(bySeq).slice(0, max).map((k) => ({ skillId: s(k.id), name: s(k.name), anchor: "RF.3", href: href(s(k.id)) }));
  }
  const links = await repo.findMany("SkillStandard", { skillId: { in: skills.map((k) => k.id) } }, { select: ["skillId", "standardId"] });
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : [];
  const { areaOfStandard } = await import("./standards");
  const anchorOfStd = new Map(stds.map((x) => { const a = areaOfStandard(s(x.code)); return [s(x.id), a && a.code.split(".")[1] === String(grade) ? a.anchor : null] as const; }));
  const out: ReteachSkill[] = [];
  for (const anchor of anchors) {
    const ids = new Set(links.filter((l) => anchorOfStd.get(s(l.standardId)) === anchor).map((l) => s(l.skillId)));
    for (const k of skills.filter((x) => ids.has(s(x.id))).sort(bySeq)) {
      if (out.length >= max) return out;
      if (!out.some((o) => o.skillId === s(k.id))) out.push({ skillId: s(k.id), name: s(k.name), anchor, href: href(s(k.id)) });
    }
  }
  return out;
}

/** The class (or grade) benchmark report of one test: every category raw + %, the 80% flags, and what to reteach. */
export async function classBenchmarkReport(repo: Repo, actor: Actor, testId: string, classId?: string | null): Promise<ClassBenchmark> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const t = await testRow(repo, actor, testId);
  const grade = Number(t.grade);
  const gradeRow = (await repo.findMany("Grade", { schoolId: t.schoolId, level: grade }))[0];
  const mine = (await readableClasses(repo, actor)).filter((c) => gradeRow && s(c.gradeId) === s(gradeRow.id) && !c.deletedAt).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (!mine.length) throw new ForbiddenError("You have no class in this grade.");
  const whole = !classId && actor.role !== "TEACHER";
  const scope = classId ? mine.filter((c) => c.id === classId) : whole ? mine : [mine[0]];
  if (!scope.length) throw new ForbiddenError("This class is not yours.");
  const members = await repo.findMany("ClassMembership", { classId: { in: scope.map((c) => s(c.id)) }, leftAt: null }, { select: ["studentId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const [names, results] = await Promise.all([studentNames(repo, ids), ids.length ? repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId: { in: ids } }) : Promise.resolve([] as Row[])]);
  const students = results.map((r) => ({ id: s(r.studentId), name: names.get(s(r.studentId))?.name ?? "Student", stds: json<StdCell[]>(r.byStandard, []) }))
    .map((x) => ({ id: x.id, name: x.name, stds: x.stds, categories: Object.fromEntries(benchmarkCategories(x.stds).map((c) => [c.key, c])) as Partial<Record<BenchKey, BenchCell>> }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const all = benchmarkCategories(students.flatMap((x) => x.stds));
  const oneClass = whole ? null : s(scope[0].id);
  const categories: ClassBenchmark["categories"] = [];
  for (const c of all) {
    const anchors = new Map<string, { code: string; label: string; correct: number; total: number }>();
    for (const st of students) for (const x of st.stds) if (benchCategoryOf(s(x.anchor), x.strand) === c.key) { const v = anchors.get(x.anchor) ?? { code: x.code, label: x.label, correct: 0, total: 0 }; v.correct += Number(x.correct) || 0; v.total += Number(x.total) || 0; anchors.set(x.anchor, v); }
    const weakest = [...anchors].map(([anchor, v]) => ({ anchor, code: v.code, label: v.label, pct: pctOf(v.correct, v.total) })).sort((a, b) => a.pct - b.pct || a.code.localeCompare(b.code, undefined, { numeric: true }));
    const weak = weakest.filter((x) => x.pct < BENCH_TARGET).slice(0, 2);
    const scored = students.filter((st) => st.categories[c.key]);
    categories.push({ ...c, students: scored.length, belowTarget: scored.filter((st) => !st.categories[c.key]!.met).length, weakest: weakest.slice(0, 3), reteach: c.met ? [] : await reteachSkills(repo, s(t.schoolId), grade, c.key, (weak.length ? weak : weakest.slice(0, 1)).map((x) => x.anchor), oneClass) });
  }
  return { testId: s(t.id), title: s(t.title), grade, scope: whole ? `Grade ${grade} · all classes` : s(scope[0].name), classId: oneClass, target: BENCH_TARGET, categories, students: students.map(({ stds: _s, ...x }) => x) };
}

/** One student's categories for a test (same access as their report: staff of their class, the family once shared). */
export async function studentBenchmark(repo: Repo, actor: Actor, studentId: string, testId: string): Promise<BenchCell[] | null> {
  const rep = await studentDiagnosticReport(repo, actor, studentId, testId);
  if (!rep) return null;
  const r = await repo.findUnique("DiagnosticScore", { id: rep.resultId });
  return r ? benchmarkCategories(json<StdCell[]>(r.byStandard, [])) : null;
}
