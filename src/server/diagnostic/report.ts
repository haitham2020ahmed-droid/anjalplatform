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
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { diagnosticPool } from "./test";
import { prescriptionFor, standardLevel, STRAND_LABEL, tierOf, TIERS, WCPM_BENCHMARK, type Strand } from "./standards";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const pctOf = (c: number, t: number) => (t ? Math.round((1000 * c) / t) / 10 : 0);
const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round(5 * (a[m - 1] + a[m])) / 10; };

type StdCell = { code: string; label: string; strand: Strand; anchor: string; correct: number; total: number };
export interface StudentRow {
  id: string; name: string; number: string; className: string; correct: number; total: number; pct: number; rank: number; level: "ABOVE" | "ON" | "BELOW"; tier: string;
  standards: Record<string, number>; strands: Record<string, number>; minutes: number; rapid: number; rit: number | null; wcpm: number | null; shared: boolean; resultId: string;
}
export interface ClassDiagnosticReport {
  testId: string; title: string; grade: number; year: string; scope: string; classId: string | null; date: string; bands: { above: number; on: number };
  classes: { id: string; name: string }[];
  summary: { roster: number; assessed: number; inProgress: number; notStarted: number; mean: number; median: number; min: number; max: number; minutes: number; rapidFlags: number; best: { code: string; label: string; pct: number } | null; focus: { code: string; label: string; pct: number }[]; levels: { ABOVE: number; ON: number; BELOW: number } };
  standards: { code: string; label: string; strand: Strand; questions: number; pct: number; level: string; below50: number; objective: string; activities: string[] }[];
  strands: { strand: Strand; label: string; pct: number }[];
  students: StudentRow[];
  notTaken: { id: string; name: string; className: string; status: "Not started" | "In progress"; answered: number; action: string }[];
  tiers: { key: string; name: string; sub: string; band: string; strategy: string; students: { id: string; name: string; pct: number }[] }[];
  supportPlan: { week: number; code: string; label: string; objective: string; activities: string[]; students: { id: string; name: string; pct: number }[] }[];
  fluency: { benchmark: number; checked: number; below: { id: string; name: string; wcpm: number }[] };
  items: { n: number; questionId: string; code: string; label: string; pct: number; answered: number; stem: string }[];
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
  const rankOf = (p: number) => (pcts.length ? Math.max(1, Math.min(99, Math.round((100 * (pcts.filter((x) => x < p).length + 0.5 * pcts.filter((x) => x === p).length)) / pcts.length))) : 0);
  const students: StudentRow[] = res.map((r) => {
    const id = s(r.studentId), stds = json<StdCell[]>(r.byStandard, []), strs = json<{ strand: Strand; correct: number; total: number }[]>(r.byStrand, []);
    const pct = Number(r.pct);
    return {
      id, name: names.get(id)?.name ?? "Student", number: names.get(id)?.number ?? "", className: classOf.get(id) ?? "", correct: Number(r.correct), total: Number(r.total), pct, rank: rankOf(pct),
      level: s(r.level) as StudentRow["level"], tier: tierOf(pct).key, standards: Object.fromEntries(stds.map((x) => [x.code, pctOf(x.correct, x.total)])), strands: Object.fromEntries(strs.map((x) => [x.strand, pctOf(x.correct, x.total)])),
      minutes: Number(r.minutes), rapid: Number(r.rapid), rit: ritOf(id), wcpm: wcpmOf(id), shared: Boolean(r.sharedAt), resultId: s(r.id),
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

  // item analysis
  const qs = aqs.length ? await repo.findMany("Question", { id: { in: aqs.map((q) => s(q.questionId)) } }, { select: ["id", "stem"] }) : [];
  const areaByQ = new Map<string, { code: string; label: string }>();
  // the area of each question comes from the result rows' standards order: read it from the pool once
  for (const p of await diagnosticPool(repo, s(t.schoolId), grade)) areaByQ.set(p.id, { code: p.area.code, label: p.area.label });
  const items = aqs.sort((a, b) => Number(a.order) - Number(b.order)).map((q, i) => {
    const mineA = attempts.filter((a) => s(a.questionId) === s(q.questionId));
    const area = areaByQ.get(s(q.questionId)) ?? { code: "", label: "" };
    return { n: i + 1, questionId: s(q.questionId), code: area.code, label: area.label, pct: pctOf(mineA.filter((a) => a.isCorrect).length, mineA.length), answered: mineA.length, stem: s(qs.find((x) => x.id === q.questionId)?.stem).replace(/\s+/g, " ").slice(0, 120) };
  });

  const bench = WCPM_BENCHMARK[grade] ?? 120;
  const withW = students.filter((st) => st.wcpm !== null);
  return {
    testId: s(t.id), title: s(t.title), grade, year: s(t.year), scope: whole ? `Grade ${grade} · all classes` : s(scopeClasses[0].name), classId: whole ? null : s(scopeClasses[0].id), date: now.toISOString().slice(0, 10), bands: B,
    classes: mine.map((c) => ({ id: s(c.id), name: s(c.name) })),
    summary: {
      roster: ids.length, assessed: res.length, inProgress: notTaken.filter((x) => x.status === "In progress").length, notStarted: notTaken.filter((x) => x.status === "Not started").length,
      mean: avg(pcts), median: median(pcts), min: pcts[0] ?? 0, max: pcts[pcts.length - 1] ?? 0, minutes: Math.round(avg(students.map((x) => x.minutes))), rapidFlags: students.filter((x) => x.rapid >= x.total * 0.3).length,
      best: ranked.length ? { code: ranked[ranked.length - 1].code, label: ranked[ranked.length - 1].label, pct: ranked[ranked.length - 1].pct } : null,
      focus: ranked.slice(0, 2).map((x) => ({ code: x.code, label: x.label, pct: x.pct })),
      levels: { ABOVE: students.filter((x) => x.level === "ABOVE").length, ON: students.filter((x) => x.level === "ON").length, BELOW: students.filter((x) => x.level === "BELOW").length },
    },
    standards, strands, students, notTaken, tiers, supportPlan,
    fluency: { benchmark: bench, checked: withW.length, below: withW.filter((x) => x.wcpm! < bench * 0.75).map((x) => ({ id: x.id, name: x.name, wcpm: x.wcpm! })).sort((a, b) => a.wcpm - b.wcpm) },
    items,
  };
}

export interface StudentDiagnosticReport {
  resultId: string; testId: string; title: string; grade: number; year: string; date: string; student: { id: string; name: string; number: string; className: string };
  correct: number; total: number; pct: number; level: "ABOVE" | "ON" | "BELOW"; tier: { name: string; sub: string }; bands: { above: number; on: number };
  strands: { strand: Strand; label: string; pct: number; classPct: number | null }[];
  standards: { code: string; label: string; correct: number; total: number; pct: number; classPct: number | null; status: "Strength" | "Developing" | "Needs support" }[];
  strengths: string[]; needs: { code: string; label: string; pct: number; objective: string; tip: string }[];
  rit: number | null; wcpm: { value: number; benchmark: number } | null; minutes: number; rapid: number; shared: boolean; sharedAt: string | null; note: string | null;
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
  const classStd = (code: string) => { const v = classRes.map((x) => json<StdCell[]>(x.byStandard, []).find((y) => y.code === code)).filter((y): y is StdCell => !!y); return v.length ? avg(v.map((y) => pctOf(y.correct, y.total))) : null; };
  const classStrand = (k: string) => { const v = classRes.map((x) => json<{ strand: string; correct: number; total: number }[]>(x.byStrand, []).find((y) => y.strand === k)).filter(Boolean) as { correct: number; total: number }[]; return v.length ? avg(v.map((y) => pctOf(y.correct, y.total))) : null; };
  const names = await studentNames(repo, [studentId]);
  const stds = json<StdCell[]>(r.byStandard, []);
  const standards = stds.map((x) => { const pct = pctOf(x.correct, x.total); return { code: x.code, label: x.label, correct: x.correct, total: x.total, pct, classPct: classStd(x.code), status: (pct >= 75 ? "Strength" : pct >= 50 ? "Developing" : "Needs support") as "Strength" | "Developing" | "Needs support", anchor: x.anchor }; }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const pct = Number(r.pct);
  const tier = tierOf(pct);
  const maps = await repo.findMany("MapResult", { studentId }, { select: ["subject", "goalName", "rit", "testDate"] });
  const reading = maps.filter((x) => !x.goalName && /read/i.test(s(x.subject))).sort((a, b) => (d(a.testDate)?.getTime() ?? 0) - (d(b.testDate)?.getTime() ?? 0))[0];
  const flu = (await repo.findMany("FluencyCheck", { studentId })).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0];
  const grade = Number(t?.grade ?? 0);
  const bands = json<{ above?: number; on?: number }>(t?.bands, {});
  return {
    resultId: s(r.id), testId: s(r.diagnosticId), title: s(t?.title), grade, year: s(t?.year), date: (d(r.completedAt) ?? new Date()).toISOString().slice(0, 10),
    student: { id: studentId, name: names.get(studentId)?.name ?? "Student", number: names.get(studentId)?.number ?? "", className: s(klass?.name) },
    correct: Number(r.correct), total: Number(r.total), pct, level: s(r.level) as "ABOVE" | "ON" | "BELOW", tier: { name: tier.name, sub: tier.sub }, bands: { above: Number(bands.above) || 85, on: Number(bands.on) || 65 },
    strands: json<{ strand: Strand; correct: number; total: number }[]>(r.byStrand, []).map((x) => ({ strand: x.strand, label: STRAND_LABEL[x.strand], pct: pctOf(x.correct, x.total), classPct: classStrand(x.strand) })),
    standards: standards.map(({ anchor: _a, ...x }) => x),
    strengths: standards.filter((x) => x.pct >= 75).sort((a, b) => b.pct - a.pct).slice(0, 4).map((x) => `${x.label} (${x.code})`),
    needs: standards.filter((x) => x.pct < 60).sort((a, b) => a.pct - b.pct).slice(0, 4).map((x) => { const p = prescriptionFor(x.anchor); return { code: x.code, label: x.label, pct: x.pct, objective: p.objective, tip: p.activities[0] }; }),
    rit: reading ? Number(reading.rit) : null, wcpm: flu ? { value: Number(flu.wcpm), benchmark: WCPM_BENCHMARK[grade] ?? 120 } : null,
    minutes: Number(r.minutes), rapid: Number(r.rapid), shared: Boolean(r.sharedAt), sharedAt: d(r.sharedAt)?.toISOString().slice(0, 10) ?? null, note: r.teacherNote ? s(r.teacherNote) : null,
  };
}

/** 📤 Share (or stop sharing) results with the students and their families, with an optional note for one student. */
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
