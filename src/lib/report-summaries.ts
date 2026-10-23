/**
 * 🧾 One PURE summary function per report (owner r70): each takes the data its page ALREADY loaded (structural
 * inputs — no database, no new query) and returns the summary sentences + the action plan (src/lib/report-summary.ts
 * has the shared rules: ≥ 80 % doing well, < 60 % needs help, the weakest skill, the next step and its buttons).
 * Every function is tested with a fixture of known numbers in tests/report-summary.test.ts.
 */
import {
  act, A, classSummary, fit, S, hrefs, line, listLine, mean, mostCommon, nameList, schoolSummary, studentSummary, weakestSkill,
  type Line, type Named, type PlanAction, type Scored, type SkillScore, type Summary,
} from "./report-summary";

const q = (o: Record<string, string | null | undefined>) => new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/** Report-specific sentences and buttons (interface strings: en.ts + ar.ts). */
export const R = {
  // reports hub
  hubWeek: "This week {active} of {students} students practised ({minutes} minutes in all).",
  hubStars: "{n} new stars this week.",
  hubStars0: "No new star this week yet.",
  hubReview: "{n} students have skills to review.",
  hubReview0: "No skill is waiting for review.",
  hubWeak: "Weakest skill this week: {skill}.",
  hubNextRemind: "Next step: remind the class to practise this week.",
  hubNextReteach: "Next step: re-teach {skill}, then check Mistakes and root causes.",
  hubAdmin: "Pick a report above: each one ends with its own summary and action plan.",
  hubAdminNext: "Next step: open Early warning to see who needs help first.",
  openErrors: "Open Mistakes and root causes",
  openWarning: "Open Early warning",
  openDepartment: "Open the department week",
  // class progress
  monthLine: "This month: {stars} new stars and {answers} answers (last month: {stars0} and {answers0}).",
  // students (progress)
  atRisk: "At risk (needs help first): {names}.",
  late: "{n} students have late work.",
  // mistakes
  errNone: "No student has a repeated mistake right now.",
  errCount: "{n} of {size} students have a repeated mistake.",
  errShared: "Shared by much of the class: {mistake} ({n} of {size} students).",
  errGap: "The real gap underneath: {skill}, needed for {target}.",
  errHelp: "Needs help first: {names}.",
  errNextShared: "Next step: re-teach this mistake to the whole class with the Learn lesson.",
  errNextGap: "Next step: assign {skill} to the students who need it.",
  errNextGroup: "Next step: meet these students in a small group.",
  assignSkill: "Assign {skill}",
  // early warning
  ewCounts: "{u} urgent, {w} to watch and {g} with good news.",
  ewUrgent: "Act now: {names}.",
  ewUrgent0: "Nobody is urgent right now.",
  ewGood: "Good news: {names}.",
  ewUnhandled: "{n} urgent students were not handled for 7+ days.",
  ewNextUrgent: "Next step: open each urgent student, act, then mark it handled.",
  ewNextWatch: "Next step: check the students to watch this week.",
  makePlanFor: "Make a plan for {name}",
  // ReadMaster
  rmBelow: "{n} students chose a lower level at least once.",
  // games
  gmNoPlay: "Did not play: {names}.",
  gmPlays: "{n} plays in the last {days} days; most played: {game}.",
  gmNone: "No game was played in this window.",
  gmHard: "Hardest game right now: {game} ({pct}% correct).",
  gmNext: "Next step: start a Live Challenge on the weakest skill.",
  gmNextNone: "Next step: start a Live Challenge with the class.",
  startGame: "Start a Live Challenge",
  // ReadRise
  rrPlaced: "{n} of {total} students are placed.",
  rrRising: "Rising fast: {names}.",
  rrRising0: "Nobody is rising fast yet.",
  rrStuck: "Stuck (no level change for a while): {names}.",
  rrStuck0: "Nobody is stuck.",
  rrWeak: "Weakest question type: {type} ({pct}%).",
  rrNextPlace: "Next step: ask the students without a placement to take the placement reading.",
  rrNextStuck: "Next step: talk with the stuck students and check their articles.",
  openReadRise: "Open ReadRise",
  // Learn results
  lnFinished: "{f} of {a} students finished it; {o} opened it.",
  lnFull: "Full marks: {names}.",
  lnAgain: "Needed it again: {names}.",
  lnNotOpened: "Not opened yet: {names}.",
  lnNextRemind: "Next step: remind the students who have not opened it.",
  lnNextAgain: "Next step: go over it again with the students who needed it.",
  assignAgain: "Assign it again",
  // writing
  wrWeakTask: "Weakest task: {task} ({pct}%).",
  // fluency
  flChecked: "{n} of {total} students have a fluency check.",
  flWell: "At or above the benchmark: {names}.",
  flWell0: "Nobody is above the benchmark yet.",
  flHelp: "Needs fluency work: {names}.",
  flHelp0: "Nobody needs fluency work right now.",
  flFast: "Fast but not understanding: {names}.",
  flNextGroup: "Next step: start the suggested group: {group}.",
  flNextNone: "Next step: listen to each student read for one minute, or ask them to use the Fluency Coach.",
  // family reports
  frCounts: "{d} drafts, {p} waiting for approval, {r} returned, {a} approved.",
  frUnread: "{n} approved reports are not read by the family yet.",
  frNextReturned: "Next step: fix the returned reports and send them again.",
  frNextDrafts: "Next step: finish the drafts and send them for approval.",
  frNextNew: "Next step: prepare this month's reports.",
  openReturned: "Open the returned reports",
  openDrafts: "Open the drafts",
  thisWeek: "Family reports this week",
  fwActive: "{n} of {total} students practised this week ({minutes} minutes in all).",
  fwNone: "Did not practise this week: {names}.",
  fwNone0: "Every student practised this week.",
  fwNotes: "{n} students have your note this week.",
  fwNext: "Next step: send these families this week's page and ask them to encourage practice.",
  fwNextKeep: "Next step: download the class PDF and send it to the families.",
  downloadAll: "Download all (one PDF)",
  // student file
  stLate: "{n} pieces of work are late.",
  // MAP
  mpScores: "{n} of {total} students have a MAP score; average RIT {avg}.",
  mpNoScores: "No MAP score yet for this class.",
  mpMet: "Met their growth: {names}.",
  mpMet0: "Nobody has met the expected growth yet.",
  mpNotMet: "Not yet at their expected growth: {names}.",
  mpLow: "Lowest RIT: {names}.",
  mpArea: "Weakest area: {area} (focus for {n} students).",
  mpNextPlan: "Next step: make a MAP plan for the students who have not met their growth.",
  mpNextLow: "Next step: make a MAP plan from the lowest sub-areas.",
  mpNextUpload: "Next step: upload the class's MAP scores.",
  makeMapPlan: "Make a MAP plan",
  uploadMap: "Upload MAP Scores",
  ovTested: "{n} students tested in {c} classes.",
  ovNone: "No MAP scores yet for these classes.",
  ovBelow: "Below the national mean: {names}.",
  ovBelow0: "No class is below the national mean.",
  ovAbove: "At or above the national mean: {names}.",
  ovFlags: "{n} tests to check (retest flags).",
  ovNext: "Next step: plan support for the classes below the national mean.",
  // Student Skills grid (r72: only the practised skills)
  sgNone: "No skill has been assigned to this class yet.",
  sgOverview: "{k} skills assigned · {n} of {total} students have started.",
  sgBest: "Most mastered: {skill} ({pct}% of the students).",
  sgWeak: "Least mastered: {skill} ({pct}% of the students).",
  sgSupport: "{n} skills have students who need support.",
  sgNextReteach: "Next step: open {skill} and re-teach it to the students who have not mastered it.",
  openSkill: "Open {skill}",
  // r75 Student Skills: the trend (2 weeks), ⚡ answering too fast, the By source and Class report summaries, "In one line"
  sgTrend: "Last 2 weeks: {up} students improved, {same} not moving, {down} going down.",
  sgGuess: "{n} students answer too fast ⚡: talk to them before re-teaching.",
  scGroups: "{on} of {total} students are on track; {help} need support.",
  scTrend: "The class gained {n} stars in the last 2 weeks · {x} students improved · {y} not moving",
  scGuess: "Answering too fast ⚡: {names}.",
  scWeak: "Hardest skill for the class: {skill} ({pct}% mastered).",
  scNextGuess: "Next step: talk to the students who answer too fast, then re-teach.",
  scNextReteach: "Next step: re-teach {skill} to the whole class.",
  scNextStalled: "Next step: follow up with the students who are not moving.",
  scNextPlan: "Next step: follow the action plan below, point by point.",
  ssOverview: "{k} sources · {n} skills assigned.",
  ssBest: "Best source: {source} ({pct}% mastered).",
  ssWeak: "Weakest source: {source} ({pct}% mastered); its hardest skill: {skill}.",
  ssSupport: "{n} students need support in {source}.",
  ssNext: "Next step: open {source} and re-teach {skill}.",
  openSource: "Open {source}",
  oneGrid: "{m} of {n} stars won · {up} students moving up · {fast} answering too fast.",
  oneSource: "Weakest source: {source} ({pct}% of its stars won).",
  oneSourceOnly: "All the work comes from {source}: {pct}% of its stars won.",
  oneReport: "{on} of {total} students on track · {help} need support · {gained} new stars in 2 weeks.",
  // r84 Student Skills → Plans: "In one line" and the opened plan's summary
  onePlans: "{n} plans running · average achievement {pct}% · {idle} students have not started their plan.",
  onePlansDone: "Every plan is finished: open Finished plans below to see them.",
  plOverview: "{done} of {n} students finished every skill of this plan; the plan is {pct}% achieved.",
  plWeak: "Hardest skill in this plan: {skill} ({pct}% mastered).",
  plSupport: "{n} students need support in this plan.",
  plIdle: "{n} students have not started this plan yet.",
  plNextFollow: "Next step: follow up with the students who have not started.",
  plNextReteach: "Next step: reteach {skill} to the students of this plan.",
  plNextLevel: "Next step: move the students who finished to the next level.",
  // admin
  adActive: "{a} of {s} students practised this week.",
  adAlerts: "{n} alerts are not handled yet.",
  adMapMet: "{p}% of the tested students met their MAP growth ({m} of {n}).",
  // r72: the printable MAP pages (/map-report/*)
  mrScores: "Latest MAP scores (RIT): {scores}.",
  mrNone: "{name} has no MAP score yet.",
  mrStrong: "Relative strengths: {areas}.",
  mrFocus: "Areas to focus on: {areas}.",
  mrFocus0: "No goal area is clearly below the overall score.",
  mrMet: "Met the expected growth in {subjects}.",
  mrNotMet: "Not yet at the expected growth in {subjects}.",
  mrNextFocus: "Next step: open the study plan and assign practice in {area}.",
  mrNextKeep: "Next step: keep the study plan going and offer harder texts.",
  mrNextNone: "Next step: enter the MAP scores, or use the Diagnostic and practice to find where to start.",
  openStudyPlan: "Open the study plan",
  // family report (parents read it: plain words, no teacher buttons)
  fmScores: "{first}'s latest MAP scores: {scores}.",
  fmNone: "{first} has no MAP score yet.",
  fmGrowth: "Since {from}, {first}'s {subject} score changed by {g} points.",
  fmStrong: "Strongest area: {area}.",
  fmWork: "Area to work on at home: {area}.",
  fmPractice: "In the last 30 days {first} practised on {days} days and answered {answers} questions ({acc}% right).",
  fmPracticeNoAcc: "In the last 30 days {first} practised on {days} days and answered {answers} questions.",
  fmPractice0: "{first} has not practised on the platform in the last 30 days.",
  fmNextArea: "Next step at home: 15–20 minutes of practice, 4 days a week, with extra reading on {area}.",
  fmNext: "Next step at home: 15–20 minutes of practice, 4 days a week, and reading together every day.",
  seeStudyPlan: "See the study plan",
  seeFamilyReport: "See the family report",
  // the class's family reports (cover page)
  cfScores: "{n} of {total} students have a MAP score.",
  cfMost: "Practised most (last 30 days): {names}.",
  cfNone: "No practice in the last 30 days: {names}.",
  cfNone0: "Every student practised in the last 30 days.",
  cfNext: "Next step: share each family's report, then contact the families of the students who did not practise.",
  cfNextKeep: "Next step: share each family's report with the family.",
  shareFamily: "Share the reports with families",
  // study plans
  spMastered: "{name} has mastered {n} of {total} skills in this plan.",
  spBest: "Most progress: {area} ({n} of {total} skills).",
  spFocus: "Focus areas: {areas}.",
  spReady: "Ready to learn next: {skills}.",
  spNextStaff: "Next step: assign practice on {skill} (ready to learn now), then check again.",
  spNextHome: "Next step: practise {skill} for 15–20 minutes, 4 days a week.",
  spNextDone: "Next step: keep practising and try the next skills in the plan.",
  practiseSkill: "Practise {skill}",
  csPlans: "{n} students have a study plan; on average {avg}% of their plan's skills are mastered.",
  csMost: "Most skills mastered: {names}.",
  csFewest: "Fewest skills mastered: {names}.",
  csFocus: "Most common focus area: {area} ({n} students).",
  csNextGroup: "Next step: make a small group for {area} and assign its ready-to-learn skills.",
  openGroupPlan: "Open the Group Study Plan",
  // class profile
  cpTested: "{n} of {total} students tested; class mean RIT {mean} (national mean {national}).",
  cpTestedNoNat: "{n} of {total} students tested; class mean RIT {mean}.",
  cpHigh: "Highest RIT: {names}.",
  cpLow: "Lowest RIT: {names}.",
  cpArea: "Weakest goal area for the class: {area} (mean RIT {rit}).",
  cpGrowth: "{p}% met their projected growth.",
  cpNext: "Next step: open the Group Study Plan and give each group its skills.",
  // review reports
  rvSent: "{n} Review(s) sent to this class so far.",
  rvOverdue: "{n} student(s) overdue on at least one Review: {names}.",
  rvNone: "No Review has been sent to this class yet.",
} as const;

// ── Reports hub ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface WeekIn { newStars: number; needReview: number; weakest: string | null; minutes: number; active: number; students: number }
export function hubSummary(week: WeekIn | null, o: { classId: string | null; admin: boolean }): Summary {
  const cid = o.classId;
  const warning = act("open", R.openWarning, `/teacher/reports/early-warning${cid && !o.admin ? `?${q({ classId: cid })}` : ""}`);
  if (!week) {
    return { lines: [line(R.hubAdmin, "info"), line(R.hubAdminNext, "next")], actions: [warning, ...(o.admin ? [act("open", R.openDepartment, "/admin/department"), act("followup", A.followup, hrefs.followup())] : [])] };
  }
  const quiet = week.students > 0 && week.active * 2 < week.students;
  const lines: Line[] = [
    line(R.hubWeek, "info", { active: week.active, students: week.students, minutes: week.minutes }),
    week.newStars ? line(R.hubStars, "good", { n: week.newStars }) : line(R.hubStars0, "good"),
    week.needReview ? line(R.hubReview, "help", { n: week.needReview }) : line(R.hubReview0, "help"),
    ...(week.weakest ? [line(R.hubWeak, "skill", { skill: week.weakest })] : []),
    quiet ? line(R.hubNextRemind, "next") : week.weakest ? line(R.hubNextReteach, "next", { skill: week.weakest }) : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [];
  if (quiet) actions.push(act("practice", A.practice, hrefs.practice(cid)));
  if (week.weakest) actions.push(act("reteach", A.reteach, hrefs.reteach(cid)));
  actions.push(act("open", R.openErrors, `/teacher/reports/errors${cid ? `?${q({ classId: cid })}` : ""}`), warning);
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

// ── Class progress (this month vs last month, each student against the class) ───────────────────────────────────────
export interface MonthIn { newStars: number; answers: number }
export function classCompareSummary(m: { thisMonth: MonthIn; lastMonth: MonthIn; weak: { skillId: string; name: string; accuracy: number; answers: number }[] }, peers: { rows: { studentId: string; name: string; average: number | null }[] }, classId: string): Summary {
  return classSummary({
    rows: peers.rows.map((r) => ({ id: r.studentId, name: r.name, pct: r.average })),
    skills: m.weak.map((k) => ({ id: k.skillId, name: k.name, pct: k.accuracy, n: k.answers })),
    classId,
    extra: [line(R.monthLine, "info", { stars: m.thisMonth.newStars, answers: m.thisMonth.answers, stars0: m.lastMonth.newStars, answers0: m.lastMonth.answers })],
  });
}

// ── Students (class progress table) ──────────────────────────────────────────────────────────────────────────────
export interface ProgressIn { studentId: string; name: string; status: string; practice: { accuracy: number | null }; work: { late: number }; weakest: string[] }
export function progressSummary(rows: readonly ProgressIn[], classId: string, admin = false): Summary {
  const common = mostCommon(rows.map((r) => r.weakest));
  const risk = rows.filter((r) => r.status === "AT_RISK" || r.status === "MISSED").sort(byName);
  const late = rows.filter((r) => r.work.late > 0).length;
  return classSummary({
    rows: rows.map((r) => ({ id: r.studentId, name: r.name, pct: r.practice.accuracy })),
    weak: common ? { name: common.name, pct: null } : null,
    classId, admin,
    extra: [risk.length ? line(R.atRisk, "info", { names: nameList(risk) }) : null, late ? line(R.late, "info", { n: late }) : null],
  });
}

// ── Mistakes and root causes ─────────────────────────────────────────────────────────────────────────────────────
export interface ErrorsIn {
  classId: string; size: number;
  classWide: { label: string; students: string[]; lesson: { skillId: string; name: string } | null }[];
  gaps: { prereqId: string; prereqName: string; skillName: string; students: string[] }[];
  sentences: { studentId: string; name: string; count: number }[];
}
export function errorsSummary(v: ErrorsIn, admin = false): Summary {
  const help = [...v.sentences].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((s) => ({ id: s.studentId, name: s.name }));
  const shared = v.classWide[0] ?? null, gap = v.gaps[0] ?? null;
  const lower = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x);
  const lines: (Line | null)[] = [
    help.length ? line(R.errCount, "info", { n: help.length, size: v.size }) : line(R.errNone, "info"),
    shared ? line(R.errShared, "skill", { mistake: lower(shared.label), n: shared.students.length, size: v.size }) : null,
    gap ? line(R.errGap, "skill", { skill: gap.prereqName, target: gap.skillName }) : null,
    help.length ? line(R.errHelp, "help", { names: nameList(help) }) : null,
  ];
  const actions: PlanAction[] = [];
  let next: Line;
  if (shared) {
    next = line(R.errNextShared, "next");
    actions.push(act("reteach", A.reteach, hrefs.reteach(v.classId, shared.lesson?.skillId)), act("lesson", A.lesson, hrefs.lesson(v.classId, shared.lesson?.skillId)));
  } else if (gap) {
    next = line(R.errNextGap, "next", { skill: gap.prereqName });
    actions.push(act("practice", R.assignSkill, hrefs.practice(v.classId, gap.prereqId), { skill: gap.prereqName }), act("group", A.group, hrefs.group(v.classId, gap.students), { n: gap.students.length }));
  } else if (help.length) {
    next = line(R.errNextGroup, "next");
    actions.push(act("group", A.group, hrefs.group(v.classId, help.map((h) => h.id)), { n: help.length }));
  } else {
    next = line(S.nextKeep, "next");
    actions.push(act("practice", A.practice, hrefs.practice(v.classId)));
  }
  if (help.length) actions.push(act("parent", A.parent, hrefs.parent(help[0].id), { name: help[0].name }));
  if (admin) actions.push(act("followup", A.followup, hrefs.followup()));
  return { lines: fit([...lines, next]), actions: actions.slice(0, 4) };
}

// ── Early warning ────────────────────────────────────────────────────────────────────────────────────────────────
export interface EwIn {
  isAdmin: boolean; classId: string | null;
  counts: { URGENT: number; WATCH: number; GOOD: number };
  rows: { studentId: string; name: string; severity: string; classId: string; practiceSkillId: string | null }[];
  unhandled: unknown[];
}
export function earlyWarningSummary(v: EwIn): Summary {
  const urgent = v.rows.filter((r) => r.severity === "URGENT");
  const good = v.rows.filter((r) => r.severity === "GOOD");
  const lines: (Line | null)[] = [
    line(R.ewCounts, "info", { u: v.counts.URGENT, w: v.counts.WATCH, g: v.counts.GOOD }),
    v.isAdmin && v.unhandled.length ? line(R.ewUnhandled, "info", { n: v.unhandled.length }) : null,
    good.length ? line(R.ewGood, "good", { names: nameList(good) }) : null,
    urgent.length ? line(R.ewUrgent, "help", { names: nameList(urgent) }) : line(R.ewUrgent0, "help"),
    urgent.length ? line(R.ewNextUrgent, "next") : v.counts.WATCH ? line(R.ewNextWatch, "next") : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [];
  const first = urgent[0] ?? v.rows.find((r) => r.severity === "WATCH") ?? null;
  if (first) {
    actions.push(act("plan", R.makePlanFor, hrefs.plan(first.classId, first.studentId), { name: first.name }));
    if (first.practiceSkillId) actions.push(act("practice", A.practice, hrefs.practice(first.classId, first.practiceSkillId)));
    actions.push(act("parent", A.parent, hrefs.parent(first.studentId), { name: first.name }));
    const sameClass = urgent.filter((r) => r.classId === first.classId);
    if (sameClass.length >= 2) actions.push(act("group", A.group, hrefs.group(first.classId, sameClass.map((r) => r.studentId)), { n: sameClass.length }));
  } else actions.push(act("practice", A.practice, hrefs.practice(v.classId)));
  if (v.isAdmin) actions.unshift(act("followup", A.followup, hrefs.followup()));
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

// ── Grammar ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface GrammarClassIn { students: { studentId: string; name: string; accuracy: number | null }[]; skills: { skillId: string; name: string; accuracy: number | null; answers: number }[] }
export const grammarClassSummary = (r: GrammarClassIn, classId: string, admin = false): Summary =>
  classSummary({ rows: r.students.map((s) => ({ id: s.studentId, name: s.name, pct: s.accuracy })), skills: r.skills.map((k) => ({ id: k.skillId, name: k.name, pct: k.accuracy, n: k.answers })), classId, admin });
export const grammarSchoolSummary = (rows: readonly { classId: string; name: string; accuracy: number | null }[], href: (classId: string) => string): Summary =>
  schoolSummary({ units: rows.map((r) => ({ id: r.classId, name: r.name, pct: r.accuracy, href: href(r.classId) })) });
export const grammarStudentSummary = (r: { name: string; summary: { accuracy: number | null }; skills: { skillId: string; name: string; accuracy: number | null; answers: number }[] }, studentId: string, classId: string | null): Summary =>
  studentSummary({ studentId, name: r.name, classId, pct: r.summary.accuracy, skills: r.skills.map((k) => ({ id: k.skillId, name: k.name, pct: k.accuracy, n: k.answers })) });

// ── ReadMaster ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface RmIn { students: { studentId: string; name: string; texts: number; avgScore: number | null }[]; skills: { skill: string; accuracy: number | null; counted: number }[]; below: unknown[] }
export const readMasterSummary = (r: RmIn, classId: string | null, admin = false): Summary =>
  classSummary({
    rows: r.students.map((s) => ({ id: s.studentId, name: s.name, pct: s.texts ? s.avgScore : null })),
    skills: r.skills.map((k) => ({ id: null, name: k.skill, pct: k.accuracy, n: k.counted })), classId, admin,
    extra: [r.below.length ? line(R.rmBelow, "info", { n: r.below.length }) : null],
  });
export const readMasterStudentSummary = (r: { name: string; row: { accuracy: number | null }; types: { name: string; accuracy: number | null; answers: number }[] }, studentId: string, classId: string | null): Summary =>
  studentSummary({ studentId, name: r.name, classId, pct: r.row.accuracy, skills: r.types.map((k) => ({ id: null, name: k.name, pct: k.accuracy, n: k.answers })) });

// ── Live games ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface GamesIn { games: unknown[]; students: { studentId: string; name: string; games: number; accuracy: number | null }[]; skills: { skillId: string; name: string; accuracy: number | null; answers: number }[] }
export function gamesSummary(r: GamesIn, classId: string): Summary {
  const absent = r.games.length ? r.students.filter((s) => !s.games).sort(byName) : [];
  return classSummary({
    rows: r.students.map((s) => ({ id: s.studentId, name: s.name, pct: s.games ? s.accuracy : null })),
    skills: r.skills.map((k) => ({ id: k.skillId, name: k.name, pct: k.accuracy, n: k.answers })), classId,
    extra: [absent.length ? line(R.gmNoPlay, "info", { names: nameList(absent) }) : null],
  });
}
export function gamesUsageSummary(rows: readonly { name: string; plays: number; correctPct: number | null }[], days: number): Summary {
  const played = rows.filter((g) => g.plays > 0);
  const plays = played.reduce((n, g) => n + g.plays, 0);
  const most = [...played].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))[0];
  const hard = weakestSkill(played.map((g) => ({ name: g.name, pct: g.correctPct })));
  const lines: (Line | null)[] = played.length ? [
    line(R.gmPlays, "info", { n: plays, days, game: most.name }),
    hard ? line(R.gmHard, "skill", { game: hard.name, pct: hard.pct as number }) : null,
    line(R.gmNext, "next"),
  ] : [line(R.gmNone, "info"), line(R.gmNextNone, "next")];
  return { lines: fit(lines), actions: [act("open", R.startGame, "/teacher/games"), act("practice", A.practice, hrefs.practice(null))] };
}

// ── ReadRise ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RrIn {
  students: { studentId: string; name: string; placed: boolean }[];
  stuck: { studentId: string; name: string }[]; rising: { studentId: string; name: string }[];
  byType: { name: string; pct: number | null; total: number }[];
}
export function readRiseSummary(r: RrIn, classId: string): Summary {
  const placed = r.students.filter((s) => s.placed).length, notPlaced = r.students.filter((s) => !s.placed);
  const weak = weakestSkill(r.byType.map((k) => ({ name: k.name, pct: k.pct, n: k.total })), 5);
  const lines: (Line | null)[] = [
    line(R.rrPlaced, "info", { n: placed, total: r.students.length }),
    listLine(R.rrRising, R.rrRising0, r.rising, "good"),
    listLine(R.rrStuck, R.rrStuck0, r.stuck, "help"),
    weak ? line(R.rrWeak, "skill", { type: weak.name, pct: weak.pct as number }) : null,
    notPlaced.length ? line(R.rrNextPlace, "next") : r.stuck.length ? line(R.rrNextStuck, "next") : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [act("open", R.openReadRise, `/teacher/readrise?${q({ class: classId })}`)];
  if (r.stuck.length >= 2) actions.push(act("group", A.group, hrefs.group(classId, r.stuck.map((s) => s.studentId)), { n: r.stuck.length }));
  if (r.stuck.length) actions.push(act("parent", A.parent, hrefs.parent(r.stuck[0].studentId), { name: r.stuck[0].name }));
  return { lines: fit(lines), actions };
}

// ── Learn results (one lesson / one selection's words) ─────────────────────────────────────────────────────────────
export interface LearnIn { counts: { assigned: number; opened: number; finished: number; again: number }; rows: { studentId: string; name: string; assigned: boolean; opened: string | null; finished: string | null; score: number | null; again: boolean }[] }
export function learnResultsSummary(r: LearnIn, o: { kind: "LESSON" | "WORDS"; code: string; classId: string | null }): Summary {
  const full = o.kind === "LESSON" ? r.rows.filter((x) => x.finished && x.score === 3).sort(byName) : [];
  const again = r.rows.filter((x) => x.again).sort(byName);
  const notOpened = r.rows.filter((x) => x.assigned && !x.opened).sort(byName);
  const lines: (Line | null)[] = [
    // r72 audit: "{f} of {a}" is out of the students listed (given it OR opened it) — out of "assigned", a student who
    // opened it on their own made "5 of 3 finished"
    line(R.lnFinished, "info", { f: r.counts.finished, a: r.rows.length, o: r.counts.opened }),
    full.length ? line(R.lnFull, "good", { names: nameList(full) }) : null,
    again.length ? line(R.lnAgain, "help", { names: nameList(again) }) : null,
    notOpened.length ? line(R.lnNotOpened, "help", { names: nameList(notOpened) }) : null,
    notOpened.length ? line(R.lnNextRemind, "next") : again.length ? line(R.lnNextAgain, "next") : line(S.nextKeep, "next"),
  ];
  const who = again[0] ?? notOpened[0] ?? null;
  const actions: PlanAction[] = [act("lesson", R.assignAgain, `/teacher/learn/assign?${q({ kind: o.kind, ref: o.code, classId: o.classId, studentId: who?.studentId })}`)];
  if (who) actions.push(act("parent", A.parent, hrefs.parent(who.studentId), { name: who.name }));
  return { lines: fit(lines), actions };
}

// ── Writing results ──────────────────────────────────────────────────────────────────────────────────────────────
export interface WritingIn { tasks: { id: string; title: string }[]; rows: { studentId: string; name: string; pct: Record<string, number>; average: number | null }[] }
export function writingSummary(res: WritingIn, classId: string, admin = false): Summary {
  const tasks: SkillScore[] = res.tasks.map((k) => { const v = res.rows.map((r) => r.pct[k.id]).filter((x) => x !== undefined); return { id: null, name: k.title, pct: mean(v), n: v.length }; });
  const w = weakestSkill(tasks, 1);
  const s = classSummary({ rows: res.rows.map((r) => ({ id: r.studentId, name: r.name, pct: r.average })), weak: null, classId, admin, extra: [] });
  // the weakest TASK (not a skill): before the next step
  if (w) s.lines.splice(s.lines.length - 1, 0, line(R.wrWeakTask, "skill", { task: w.name, pct: w.pct as number }));
  return { lines: fit(s.lines), actions: s.actions };
}

// ── Reading fluency ──────────────────────────────────────────────────────────────────────────────────────────────
export interface FluencyIn { rows: { id: string; name: string; wcpm: number | null; band: string | null; needsWork: boolean; fastNotUnderstanding: boolean }[]; groups: { title: string; students: { id: string }[] }[] }
export function fluencySummary(v: FluencyIn, classId: string): Summary {
  const checked = v.rows.filter((r) => r.wcpm !== null);
  const well = checked.filter((r) => (r.band === "ON" || r.band === "ABOVE") && !r.needsWork).sort(byName);
  const help = v.rows.filter((r) => r.needsWork).sort(byName);
  const fast = v.rows.filter((r) => r.fastNotUnderstanding).sort(byName);
  const g = v.groups[0] ?? null;
  const lines: (Line | null)[] = [
    line(R.flChecked, "info", { n: checked.length, total: v.rows.length }),
    checked.length ? listLine(R.flWell, R.flWell0, well, "good") : null,
    checked.length ? listLine(R.flHelp, R.flHelp0, help, "help") : null,
    fast.length ? line(R.flFast, "skill", { names: nameList(fast) }) : null,
    !checked.length ? line(R.flNextNone, "next") : g ? line(R.flNextGroup, "next", { group: g.title }) : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [];
  const groupIds = g ? g.students.map((x) => x.id) : help.map((h) => h.id);
  if (groupIds.length) actions.push(act("group", A.group, hrefs.group(classId, groupIds), { n: groupIds.length }));
  if (help[0]) actions.push(act("parent", A.parent, hrefs.parent(help[0].id), { name: help[0].name }));
  actions.push(act("plan", A.plan, hrefs.plan(classId)));
  return { lines: fit(lines), actions };
}

// ── Family reports ───────────────────────────────────────────────────────────────────────────────────────────────
export function familyReportsSummary(reports: readonly { status: string; seenByParentAt?: string | null }[], classId: string | null): Summary {
  const n = (s: string) => reports.filter((r) => r.status === s).length;
  const d = n("DRAFT"), p = n("PENDING"), r = n("RETURNED"), a = n("APPROVED");
  const unread = reports.filter((x) => x.status === "APPROVED" && !x.seenByParentAt).length;
  const lines: (Line | null)[] = [
    line(R.frCounts, "info", { d, p, r, a }),
    unread ? line(R.frUnread, "help", { n: unread }) : null,
    r ? line(R.frNextReturned, "next") : d ? line(R.frNextDrafts, "next") : line(R.frNextNew, "next"),
  ];
  const actions: PlanAction[] = [];
  if (r) actions.push(act("open", R.openReturned, "/teacher/family-reports?status=RETURNED"));
  if (d) actions.push(act("open", R.openDrafts, "/teacher/family-reports?status=DRAFT"));
  actions.push(act("open", R.thisWeek, `/teacher/family-reports/this-week${classId ? `?${q({ classId })}` : ""}`));
  return { lines: fit(lines), actions };
}
export function familyWeekSummary(items: readonly { studentId: string; name: string; minutes: number; note: string | null }[], classId: string): Summary {
  const active = items.filter((w) => w.minutes > 0), none = items.filter((w) => w.minutes <= 0).sort(byName);
  const notes = items.filter((w) => w.note).length;
  const lines: (Line | null)[] = [
    line(R.fwActive, "info", { n: active.length, total: items.length, minutes: active.reduce((m, w) => m + w.minutes, 0) }),
    listLine(R.fwNone, R.fwNone0, none, "help"),
    line(R.fwNotes, "good", { n: notes }),
    none.length ? line(R.fwNext, "next") : line(R.fwNextKeep, "next"),
  ];
  const actions: PlanAction[] = [act("open", R.downloadAll, `/api/family-week?${q({ classId, lang: "ar" })}`)];
  if (none[0]) actions.push(act("parent", A.parent, hrefs.parent(none[0].studentId), { name: none[0].name }));
  actions.push(act("practice", A.practice, hrefs.practice(classId)));
  return { lines: fit(lines), actions };
}

// ── Student file ─────────────────────────────────────────────────────────────────────────────────────────────────
export function studentFileSummary(o: { studentId: string; name: string; classId: string | null; accuracy: number | null; skills: readonly { skillId: string; name: string; score: number }[]; late: number }): Summary {
  return studentSummary({
    studentId: o.studentId, name: o.name, classId: o.classId, pct: o.accuracy,
    skills: o.skills.map((k) => ({ id: k.skillId, name: k.name, pct: k.score })),
    extra: [o.late ? line(R.stLate, "info", { n: o.late }) : null],
  });
}
/** The read-only coordinator summary (/admin/student-file): its strong / weak skill lists (pct, answers). */
export function studentFileLiteSummary(f: { id: string; name: string; classId: string | null; practice: { accuracy: number | null }; skills: { strong: { name: string; pct: number; answers: number }[]; weak: { name: string; pct: number; answers: number }[] }; work: { late: number } }): Summary {
  return studentSummary({
    studentId: f.id, name: f.name, classId: f.classId, pct: f.practice.accuracy,
    skills: [...f.skills.strong, ...f.skills.weak].map((k) => ({ id: null, name: k.name, pct: k.pct, n: k.answers })),
    extra: [f.work.late ? line(R.stLate, "info", { n: f.work.late }) : null],
  });
}

// ── MAP ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const mapPlanHref = (classId: string, subject: string) => `/teacher/map-center?${q({ tab: "plan", classId, subject })}`;
export function mapGrowthSummary(students: readonly { id: string; name: string; reading: number | null; language: number | null }[], g: { rows: { studentId: string; name: string; met: boolean | null }[] } | null, o: { classId: string; subject: "READING" | "LANGUAGE"; admin?: boolean }): Summary {
  const rit = (s: (typeof students)[number]) => (o.subject === "READING" ? s.reading : s.language);
  const scored = students.filter((s) => rit(s) !== null);
  const actions: PlanAction[] = [];
  if (!scored.length) {
    actions.push(act("open", R.uploadMap, `/teacher/map-entry?${q({ classId: o.classId })}`));
    return { lines: [line(R.mpNoScores, "info"), line(R.mpNextUpload, "next")], actions };
  }
  const lines: (Line | null)[] = [line(R.mpScores, "info", { n: scored.length, total: students.length, avg: mean(scored.map(rit)) as number })];
  const met = (g?.rows ?? []).filter((r) => r.met === true).map((r) => ({ id: r.studentId, name: r.name })).sort(byName);
  const notMet = (g?.rows ?? []).filter((r) => r.met === false).map((r) => ({ id: r.studentId, name: r.name })).sort(byName);
  const lowest = [...scored].sort((a, b) => (rit(a) as number) - (rit(b) as number) || a.name.localeCompare(b.name)).slice(0, 3);
  if (g && g.rows.some((r) => r.met !== null)) {
    lines.push(listLine(R.mpMet, R.mpMet0, met, "good"), notMet.length ? line(R.mpNotMet, "help", { names: nameList(notMet) }) : null);
  }
  lines.push(line(R.mpLow, "help", { names: lowest.map((s) => `${s.name} (${rit(s)})`).join(", ") }));
  lines.push(notMet.length ? line(R.mpNextPlan, "next") : line(R.mpNextLow, "next"));
  actions.push(act("plan", R.makeMapPlan, mapPlanHref(o.classId, o.subject)));
  const group = notMet.length ? notMet : lowest.map((s) => ({ id: s.id, name: s.name }));
  if (group.length >= 2) actions.push(act("group", A.group, hrefs.group(o.classId, group.map((x) => x.id)), { n: group.length }));
  actions.push(act("parent", A.parent, hrefs.parent(group[0].id), { name: group[0].name }));
  if (o.admin) actions.push(act("followup", A.followup, hrefs.followup()));
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}
export function mapResultsSummary(rows: readonly { studentId: string; name: string; profile: { overall?: { rit?: number | null } | null; areas: { name?: string; group: string; status?: string | null }[] } }[], o: { classId: string; subject: "READING" | "LANGUAGE"; areaName: (group: string) => string; total: number }): Summary {
  const scored = rows.filter((r) => typeof r.profile.overall?.rit === "number");
  if (!scored.length) return { lines: [line(R.mpNoScores, "info"), line(R.mpNextUpload, "next")], actions: [act("open", R.uploadMap, `/teacher/map-entry?${q({ classId: o.classId })}`)] };
  const ritOf = (r: (typeof rows)[number]) => r.profile.overall?.rit as number;
  const focus = mostCommon(scored.map((r) => r.profile.areas.filter((a) => a.status === "FOCUS").map((a) => a.group)));
  const lowest = [...scored].sort((a, b) => ritOf(a) - ritOf(b) || a.name.localeCompare(b.name)).slice(0, 3);
  const lines: (Line | null)[] = [
    line(R.mpScores, "info", { n: scored.length, total: o.total, avg: mean(scored.map(ritOf)) as number }),
    line(R.mpLow, "help", { names: lowest.map((s) => `${s.name} (${ritOf(s)})`).join(", ") }),
    focus ? line(R.mpArea, "skill", { area: o.areaName(focus.name), n: focus.count }) : null,
    line(R.mpNextLow, "next"),
  ];
  const actions: PlanAction[] = [act("plan", R.makeMapPlan, mapPlanHref(o.classId, o.subject))];
  if (lowest.length >= 2) actions.push(act("group", A.group, hrefs.group(o.classId, lowest.map((s) => s.studentId)), { n: lowest.length }));
  actions.push(act("parent", A.parent, hrefs.parent(lowest[0].studentId), { name: lowest[0].name }));
  return { lines: fit(lines), actions };
}
export function mapOverviewSummary(d: { classes: readonly { classId: string | null; className: string; n: number; meanRit: number | null; national: number | null; flagged: number }[]; grades?: readonly { n: number; flagged: number }[] }, o: { admin: boolean; classId: string; subject: "READING" | "LANGUAGE" }): Summary {
  const withMean = d.classes.filter((c) => c.meanRit !== null && c.national !== null);
  const below = withMean.filter((c) => (c.meanRit as number) < (c.national as number)).map((c) => ({ id: c.classId ?? c.className, name: c.className }));
  const above = withMean.filter((c) => (c.meanRit as number) >= (c.national as number)).map((c) => ({ id: c.classId ?? c.className, name: c.className }));
  // r72 audit: each student once — the grade rows (a student in two classes of a grade counts once), as the tiles show
  const whole = d.grades?.length ? d.grades : d.classes;
  const tested = whole.reduce((n, c) => n + c.n, 0), flags = whole.reduce((n, c) => n + c.flagged, 0);
  if (!tested) return { lines: [line(R.ovNone, "info"), line(R.mpNextUpload, "next")], actions: [act("open", R.uploadMap, `/teacher/map-entry?${q({ classId: o.classId })}`)] };
  const lines: (Line | null)[] = [
    line(R.ovTested, "info", { n: tested, c: d.classes.length }),
    above.length ? line(R.ovAbove, "good", { names: nameList(above) }) : null,
    below.length ? line(R.ovBelow, "help", { names: nameList(below) }) : line(R.ovBelow0, "help"),
    flags ? line(R.ovFlags, "info", { n: flags }) : null,
    below.length ? line(R.ovNext, "next") : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [act("plan", R.makeMapPlan, mapPlanHref(o.classId, o.subject))];
  if (o.admin) actions.push(act("followup", A.followup, hrefs.followup()), act("message", A.message, hrefs.message()));
  return { lines: fit(lines), actions };
}

// ── Admin: School Analytics, the department week, the end-of-term report ─────────────────────────────────────────────
export interface DashIn { kpis: { students: number; activeWeek: number }; classes: { classId: string; name: string; grade: number; accuracy: number | null }[]; grades: { grade: number; accuracy: number | null }[]; standards: { short: string; accuracy: number }[] }
export const analyticsSummary = (d: DashIn): Summary =>
  schoolSummary({
    units: d.classes.map((c) => ({ id: c.classId, name: `G${c.grade} · ${c.name}`, pct: c.accuracy, href: `/teacher/classes/${encodeURIComponent(c.classId)}/analytics?period=SCHOOL_YEAR` })),
    grades: d.grades.map((g) => ({ grade: g.grade, pct: g.accuracy })),
    weak: d.standards[0] ? { name: d.standards[0].short, pct: d.standards[0].accuracy } : null,
    extra: [line(R.adActive, "info", { a: d.kpis.activeWeek, s: d.kpis.students })],
  });
export interface DeptIn { classes: { classId: string; className: string; grade: number; accuracy: number | null; alertsOpen: number }[]; weakest: { grade: number; skills: { skillId: string; name: string; accuracy: number }[] }[]; totals: { students: number; active: number; alertsOpen: number } }
const deptWeak = (d: DeptIn): SkillScore | null => weakestSkill(d.weakest.flatMap((g) => g.skills.map((k) => ({ id: k.skillId, name: k.name, pct: k.accuracy }))));
export const departmentWeekSummary = (d: DeptIn): Summary =>
  schoolSummary({
    units: d.classes.map((c) => ({ id: c.classId, name: `G${c.grade} · ${c.className}`, pct: c.accuracy, href: `/teacher/classes/${encodeURIComponent(c.classId)}/analytics?period=SCHOOL_YEAR` })),
    weak: deptWeak(d),
    extra: [line(R.adActive, "info", { a: d.totals.active, s: d.totals.students }), d.totals.alertsOpen ? line(R.adAlerts, "info", { n: d.totals.alertsOpen }) : null],
  });
/** r72: `growth` = growthTotals(…) — each student once, "% met" out of the students with an expected growth. */
export function termReportSummary(d: DeptIn, growth: { measured: number; met: number }): Summary {
  const tested = growth.measured, met = growth.met;
  return schoolSummary({
    units: d.classes.map((c) => ({ id: c.classId, name: `G${c.grade} · ${c.className}`, pct: c.accuracy, href: `/teacher/classes/${encodeURIComponent(c.classId)}/analytics?period=SCHOOL_YEAR` })),
    weak: deptWeak(d),
    extra: [tested ? line(R.adMapMet, "info", { p: Math.round((100 * met) / tested), m: met, n: tested }) : null],
  });
}


// ── r72 audit helpers: numbers counted once, signs shown right ────────────────────────────────────────────────────
/** "+3", "-2", "0" ("—" when unknown): a growth is never shown as "+-2". */
export const signed = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v}`);

/**
 * MAP growth of several classes, each student ONCE (a student in two classes was counted twice): tested = with a Fall
 * and a later score, measured = of them with an expected growth, met = grew at least as expected; pct = met / measured.
 */
export function growthTotals(classes: readonly { rows: readonly { studentId: string; met: boolean | null }[] }[]): { tested: number; measured: number; met: number; pct: number | null } {
  const by = new Map<string, boolean | null>();
  for (const c of classes) for (const r of c.rows) if (!by.has(r.studentId) || by.get(r.studentId) === null) by.set(r.studentId, r.met);
  const v = [...by.values()];
  const measured = v.filter((x) => x !== null).length, met = v.filter((x) => x === true).length;
  return { tested: v.length, measured, met, pct: measured ? Math.round((100 * met) / measured) : null };
}

// ── The printable MAP pages (/map-report/*) ────────────────────────────────────────────────────────────────────────
const plan = (id: string, subject?: string | null) => `/map-report/study-plan/${encodeURIComponent(id)}${subject ? `?${q({ subject })}` : ""}`;
const joinNames = (xs: readonly string[], max = 3) => nameList(xs.map((name) => ({ name })), max);

/** 🧑‍🎓 Student Profile (staff): latest RIT per subject, relative strengths / focus areas, growth met, the next step. */
export interface ProfileIn {
  student: { id: string; name: string; classId: string | null };
  subjects: readonly { subject: string; name: string; latest: { rit: number; percentile: number | null; met: boolean | null }; areas: readonly { name: string; rit: number; relative: "STRENGTH" | "FOCUS" | null }[] }[];
}
export function mapProfileSummary(d: ProfileIn): Summary {
  const { id, name, classId } = d.student;
  if (!d.subjects.length) {
    return { lines: [line(R.mrNone, "info", { name }), line(R.mrNextNone, "next")], actions: [act("open", R.uploadMap, `/teacher/map-entry${classId ? `?${q({ classId })}` : ""}`), act("parent", A.parent, hrefs.parent(id), { name })] };
  }
  const scores = d.subjects.map((x) => `${x.name} ${x.latest.rit}`).join(", ");
  const strong = d.subjects.flatMap((x) => x.areas.filter((a) => a.relative === "STRENGTH").map((a) => a.name));
  // focus: lowest area first across the subjects
  const focusAreas = d.subjects.flatMap((x) => x.areas.filter((a) => a.relative === "FOCUS").map((a) => ({ subject: x.subject, name: a.name, rit: a.rit })))
    .sort((a, b) => a.rit - b.rit || a.name.localeCompare(b.name));
  const met = d.subjects.filter((x) => x.latest.met === true).map((x) => x.name), notMet = d.subjects.filter((x) => x.latest.met === false).map((x) => x.name);
  const lines: (Line | null)[] = [
    line(R.mrScores, "info", { scores }),
    notMet.length ? line(R.mrNotMet, "help", { subjects: notMet.join(", ") }) : met.length ? line(R.mrMet, "good", { subjects: met.join(", ") }) : null,
    strong.length ? line(R.mrStrong, "good", { areas: joinNames(strong) }) : null,
    focusAreas.length ? line(R.mrFocus, "help", { areas: joinNames(focusAreas.map((a) => a.name)) }) : line(R.mrFocus0, "help"),
    focusAreas.length ? line(R.mrNextFocus, "next", { area: focusAreas[0].name }) : line(R.mrNextKeep, "next"),
  ];
  const subject = focusAreas[0]?.subject ?? d.subjects[0].subject;
  const actions: PlanAction[] = [act("plan", R.openStudyPlan, plan(id, subject)), act("practice", A.practice, hrefs.practice(classId)), act("lesson", A.lesson, hrefs.lesson(classId, null, id)), act("parent", A.parent, hrefs.parent(id), { name })];
  return { lines: fit(lines), actions };
}

/**
 * 👪 Family Report — read by PARENTS (and the student): plain sentences, no level words (no "Low / Average"), and
 * no teacher button: the only button opens the student's own study plan (the same share rule as this report).
 */
export interface FamilyIn {
  student: { id: string; first: string };
  subjects: readonly { subject: string; name: string; latest: { rit: number } | null; growth: { from: string; rit: number } | null; areas: readonly { name: string; rit: number }[] }[];
  practice: { answers: number; accuracy: number | null; days: number };
}
export function mapFamilySummary(d: FamilyIn): Summary {
  const first = d.student.first;
  const tested = d.subjects.filter((x) => x.latest);
  const areas = d.subjects.flatMap((x) => x.areas.map((a) => ({ ...a, subject: x.subject }))).sort((a, b) => b.rit - a.rit || a.name.localeCompare(b.name));
  const best = areas[0] ?? null, worst = areas.length > 1 ? areas[areas.length - 1] : null;
  const grown = d.subjects.find((x) => x.growth);
  const p = d.practice;
  const lines: (Line | null)[] = [
    tested.length ? line(R.fmScores, "info", { first, scores: tested.map((x) => `${x.name} ${x.latest!.rit}`).join(", ") }) : line(R.fmNone, "info", { first }),
    grown ? line(R.fmGrowth, "info", { from: grown.growth!.from, first, subject: grown.name, g: signed(grown.growth!.rit) }) : null,
    best && worst && best.name !== worst.name ? line(R.fmStrong, "good", { area: best.name }) : null,
    worst && worst.rit < (best?.rit ?? 0) ? line(R.fmWork, "skill", { area: worst.name }) : null,
    p.days > 0 ? (p.accuracy !== null ? line(R.fmPractice, "good", { first, days: p.days, answers: p.answers, acc: p.accuracy }) : line(R.fmPracticeNoAcc, "good", { first, days: p.days, answers: p.answers })) : line(R.fmPractice0, "help", { first }),
    worst && worst.rit < (best?.rit ?? 0) ? line(R.fmNextArea, "next", { area: worst.name }) : line(R.fmNext, "next"),
  ];
  const subject = worst?.subject ?? tested[0]?.subject ?? null;
  return { lines: fit(lines), actions: tested.length ? [act("plan", R.seeStudyPlan, plan(d.student.id, subject))] : [] };
}

/** 👪 The class's family reports (the teacher's cover page): who has a score, who practised, the next step. */
export function classFamilySummary(docs: readonly (FamilyIn & { student: { id: string; first: string; name: string } })[], classId: string): Summary {
  const rows = docs.map((d) => ({ id: d.student.id, name: d.student.name, days: d.practice.days, scored: d.subjects.some((x) => x.latest) }));
  const most = rows.filter((r) => r.days > 0).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)).slice(0, 3);
  const none = rows.filter((r) => r.days <= 0).sort(byName);
  const lines: (Line | null)[] = [
    line(R.cfScores, "info", { n: rows.filter((r) => r.scored).length, total: rows.length }),
    most.length ? line(R.cfMost, "good", { names: nameList(most) }) : null,
    listLine(R.cfNone, R.cfNone0, none, "help"),
    none.length ? line(R.cfNext, "next") : line(R.cfNextKeep, "next"),
  ];
  const actions: PlanAction[] = [act("open", R.shareFamily, `/teacher/family-reports?${q({ classId })}`)];
  if (none[0]) actions.push(act("parent", A.parent, hrefs.parent(none[0].id), { name: none[0].name }));
  if (none.length >= 2) actions.push(act("group", A.group, hrefs.group(classId, none.map((r) => r.id)), { n: none.length }));
  actions.push(act("practice", A.practice, hrefs.practice(classId)));
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

/** 🧭 A Personal Study Plan: how much of the plan is mastered, the focus areas, the skills ready to learn next. */
export interface PlanIn {
  student: { id: string; name: string; classId: string | null };
  subject: string;
  counts: { mastered: number; total: number };
  areas: readonly { name: string; focus: boolean; skillsMastered: number; skillsLinked: number; stages: readonly { key: string; topics: readonly { statements: readonly { skills: readonly { id: string; name: string; status: string }[] }[] }[] }[] }[];
}
/** The skills ready to learn now (Develop, not mastered), focus areas first, each skill once. */
export function readySkills(d: Pick<PlanIn, "areas">, max = 3): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const a of [...d.areas].sort((x, y) => Number(y.focus) - Number(x.focus))) {
    for (const st of a.stages.filter((x) => x.key === "DEVELOP")) for (const tp of st.topics) for (const s of tp.statements) for (const k of s.skills) {
      if (k.status === "MASTERED" || seen.has(k.id)) continue;
      seen.add(k.id); out.push({ id: k.id, name: k.name });
    }
  }
  return out.slice(0, max);
}
export function studyPlanSummary(d: PlanIn, viewer: "staff" | "student" | "parent"): Summary {
  const { id, name, classId } = d.student;
  const ready = readySkills(d);
  const linked = d.areas.filter((a) => a.skillsLinked > 0 && a.skillsMastered > 0).sort((a, b) => b.skillsMastered / b.skillsLinked - a.skillsMastered / a.skillsLinked || a.name.localeCompare(b.name));
  const focus = d.areas.filter((a) => a.focus).map((a) => a.name);
  const next = ready[0] ?? null;
  const lines: (Line | null)[] = [
    line(R.spMastered, "info", { name, n: d.counts.mastered, total: d.counts.total }),
    linked[0] ? line(R.spBest, "good", { area: linked[0].name, n: linked[0].skillsMastered, total: linked[0].skillsLinked }) : null,
    focus.length ? line(R.spFocus, "help", { areas: joinNames(focus) }) : null,
    ready.length ? line(R.spReady, "skill", { skills: nameList(ready) }) : null,
    !next ? line(R.spNextDone, "next") : viewer === "staff" ? line(R.spNextStaff, "next", { skill: next.name }) : line(R.spNextHome, "next", { skill: next.name }),
  ];
  const actions: PlanAction[] = [];
  if (viewer === "staff") {
    if (next) actions.push(act("practice", A.practiceSkill, hrefs.practice(classId, next.id), { skill: next.name }), act("lesson", A.lesson, hrefs.lesson(classId, next.id, id)));
    else actions.push(act("practice", A.practice, hrefs.practice(classId)));
    actions.push(act("parent", A.parent, hrefs.parent(id), { name }));
  } else if (viewer === "student") {
    if (next) actions.push(act("practice", R.practiseSkill, `/practice/${encodeURIComponent(next.id)}?from=map`, { skill: next.name }));
  } else actions.push(act("open", R.seeFamilyReport, `/map-report/family/${encodeURIComponent(id)}`));
  return { lines: fit(lines), actions };
}

/** 🧭 Every study plan of a class: the mean share of skills mastered (each student once), most / fewest, the common focus. */
export function classStudyPlansSummary(docs: readonly PlanIn[], classId: string, subject: string): Summary {
  const rows = docs.map((d) => ({ id: d.student.id, name: d.student.name, pct: d.counts.total ? Math.round((100 * d.counts.mastered) / d.counts.total) : null, focus: d.areas.filter((a) => a.focus).map((a) => a.name) }));
  const scored = rows.filter((r) => r.pct !== null) as { id: string; name: string; pct: number; focus: string[] }[];
  const most = [...scored].filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name)).slice(0, 3);
  const fewest = [...scored].filter((r) => !most.some((m) => m.id === r.id)).sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name)).slice(0, 3);
  const common = mostCommon(rows.map((r) => r.focus));
  const groupIds = common ? rows.filter((r) => r.focus.includes(common.name)).map((r) => r.id) : [];
  const lines: (Line | null)[] = [
    line(R.csPlans, "info", { n: rows.length, avg: mean(scored.map((r) => r.pct)) ?? 0 }),
    most.length ? line(R.csMost, "good", { names: nameList(most) }) : null,
    fewest.length ? line(R.csFewest, "help", { names: nameList(fewest) }) : null,
    common ? line(R.csFocus, "skill", { area: common.name, n: common.count }) : null,
    common && groupIds.length >= 2 ? line(R.csNextGroup, "next", { area: common.name }) : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [act("plan", R.openGroupPlan, `/map-report/class/${encodeURIComponent(classId)}/groups?${q({ subject })}`)];
  if (groupIds.length >= 2) actions.push(act("group", A.group, hrefs.group(classId, groupIds), { n: groupIds.length }));
  actions.push(act("practice", A.practice, hrefs.practice(classId)));
  if (fewest[0]) actions.push(act("parent", A.parent, hrefs.parent(fewest[0].id), { name: fewest[0].name }));
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

/** 👥 Class Profile: tested, the class mean against the national mean, highest / lowest, weakest area, growth met. */
export interface ClassProfileIn {
  classId: string; subject: string; n: number; notTested: readonly unknown[]; meanRit: number | null; national: number | null;
  students: readonly { id: string; name: string; test: { rit: number } }[];
  areas: readonly { name: string; mean: number | null }[];
  growth: { pctMet: number | null; enough: boolean };
}
export function classProfileSummary(d: ClassProfileIn): Summary {
  const total = d.n + d.notTested.length;
  if (!d.n) return { lines: [line(R.mpNoScores, "info"), line(R.mpNextUpload, "next")], actions: [act("open", R.uploadMap, `/teacher/map-entry?${q({ classId: d.classId })}`)] };
  const byRit = [...d.students].sort((a, b) => a.test.rit - b.test.rit || a.name.localeCompare(b.name));
  const low = byRit.slice(0, 3), high = byRit.slice(-3).reverse().filter((x) => !low.some((l) => l.id === x.id));
  const area = [...d.areas].filter((a) => a.mean !== null).sort((a, b) => (a.mean as number) - (b.mean as number) || a.name.localeCompare(b.name))[0] ?? null;
  const lines: (Line | null)[] = [
    d.national !== null ? line(R.cpTested, "info", { n: d.n, total, mean: d.meanRit ?? "—", national: d.national }) : line(R.cpTestedNoNat, "info", { n: d.n, total, mean: d.meanRit ?? "—" }),
    d.growth.enough && d.growth.pctMet !== null ? line(R.cpGrowth, "info", { p: d.growth.pctMet }) : null,
    high.length ? line(R.cpHigh, "good", { names: high.map((x) => `${x.name} (${x.test.rit})`).join(", ") }) : null,
    line(R.cpLow, "help", { names: low.map((x) => `${x.name} (${x.test.rit})`).join(", ") }),
    area ? line(R.cpArea, "skill", { area: area.name, rit: area.mean as number }) : null,
    line(R.cpNext, "next"),
  ];
  const actions: PlanAction[] = [act("plan", R.openGroupPlan, `/map-report/class/${encodeURIComponent(d.classId)}/groups?${q({ subject: d.subject })}`)];
  if (low.length >= 2) actions.push(act("group", A.group, hrefs.group(d.classId, low.map((x) => x.id)), { n: low.length }));
  actions.push(act("parent", A.parent, hrefs.parent(low[0].id), { name: low[0].name }), act("practice", A.practice, hrefs.practice(d.classId)));
  return { lines: fit(lines), actions: actions.slice(0, 4) };
}

// ── Student Skills grid (r72; r74: the ASSIGNED skills only — `practising` = students who started one of them) ───────────────────────────────────────────────────────────────────────────────────
export interface SkillsGridIn {
  totalStudents: number; practising: number; skills: readonly { key: string; name: string; skillId: string | null; mastered: number; total: number; support?: number }[];
  /** r75: students ⬆️ ➖ ⬇️ in the last 2 weeks, and how many answer too fast (⚡) */
  trend?: { up: number; same: number; down: number }; guessing?: number;
}
/** The grid's summary: who practised, the most / least mastered skill (% of the class with ⭐), support, the next step. */
export function skillsGridSummary(g: SkillsGridIn, o: { classId: string; skillHref: (key: string) => string }): Summary {
  if (!g.skills.length) return { lines: [line(R.sgNone, "info"), line(S.nextNone, "next")], actions: [act("practice", A.practice, hrefs.practice(o.classId))] };
  const pct = (k: SkillsGridIn["skills"][number]) => (k.total > 0 ? Math.round((100 * k.mastered) / k.total) : 0);
  const order = [...g.skills].sort((a, b) => pct(b) - pct(a) || byName(a, b));
  const best = pct(order[0]) > 0 ? order[0] : null;
  const weak = [...g.skills].sort((a, b) => pct(a) - pct(b) || byName(a, b))[0];
  const support = g.skills.filter((k) => (k.support ?? 0) > 0).length;
  const lines: (Line | null)[] = [
    line(R.sgOverview, "info", { n: g.practising, total: g.totalStudents, k: g.skills.length }),
    best ? line(R.sgBest, "good", { skill: best.name, pct: pct(best) }) : null,
    weak && weak !== best ? line(R.sgWeak, "skill", { skill: weak.name, pct: pct(weak) }) : null,
    support ? line(R.sgSupport, "help", { n: support }) : null,
    g.trend ? line(R.sgTrend, g.trend.down > g.trend.up ? "help" : "info", g.trend) : null,
    g.guessing ? line(R.sgGuess, "help", { n: g.guessing }) : null,
  ];
  const actions: PlanAction[] = [];
  if (weak && pct(weak) < 50) {
    lines.push(line(R.sgNextReteach, "next", { skill: weak.name }));
    actions.push(act("open", R.openSkill, o.skillHref(weak.key), { skill: weak.name }), act("reteach", A.reteach, hrefs.reteach(o.classId, weak.skillId)));
  } else {
    lines.push(line(S.nextKeep, "next"));
    actions.push(act("practice", A.practice, hrefs.practice(o.classId)));
  }
  return { lines: fit(lines), actions };
}

// ── Student Skills → By source (r75) ──────────────────────────────────────────────────────────────────────────────────
export interface SourcesIn { source: string; label: string; skills: number; stars: Record<string, number>; needSupport: number; weakest: { key: string; name: string; pct: number } | null }
/** Pure: % of a source's stars won (⭐ or ☆⬆) over its assigned pairs. */
export const sourcePct = (c: Pick<SourcesIn, "stars">): number => { const n = Object.values(c.stars).reduce((a, b) => a + b, 0); return n ? Math.round((100 * ((c.stars.MASTERED ?? 0) + (c.stars.NEXT_LEVEL ?? 0))) / n) : 0; };
const weakestSource = (cards: readonly SourcesIn[]) => [...cards].sort((a, b) => sourcePct(a) - sourcePct(b) || a.label.localeCompare(b.label));
/** The By-source summary: how many sources, the best and the weakest (with its hardest skill), support, the next step. */
export function skillsSourceSummary(cards: readonly SourcesIn[], o: { classId: string; sourceHref: (source: string) => string; skillHref: (key: string) => string }): Summary {
  if (!cards.length) return { lines: [line(R.sgNone, "info"), line(S.nextNone, "next")], actions: [act("practice", A.practice, hrefs.practice(o.classId))] };
  const sorted = weakestSource(cards);
  const weak = sorted[0], best = cards.length > 1 ? sorted[sorted.length - 1] : null;
  const help = [...cards].sort((a, b) => b.needSupport - a.needSupport)[0];
  const lines: (Line | null)[] = [
    line(R.ssOverview, "info", { k: cards.length, n: cards.reduce((a, c) => a + c.skills, 0) }),
    best && sourcePct(best) > sourcePct(weak) ? line(R.ssBest, "good", { source: best.label, pct: sourcePct(best) }) : null,
    line(R.ssWeak, "skill", { source: weak.label, pct: sourcePct(weak), skill: weak.weakest?.name ?? "—" }),
    help.needSupport ? line(R.ssSupport, "help", { n: help.needSupport, source: help.label }) : null,
    weak.weakest ? line(R.ssNext, "next", { source: weak.label, skill: weak.weakest.name }) : line(S.nextKeep, "next"),
  ];
  const actions: PlanAction[] = [act("open", R.openSource, o.sourceHref(weak.source), { source: weak.label })];
  if (weak.weakest) actions.push(act("open", R.openSkill, o.skillHref(weak.weakest.key), { skill: weak.weakest.name }));
  return { lines: fit(lines), actions };
}

// ── Student Skills → Class report (r75) ───────────────────────────────────────────────────────────────────────────────
export interface ClassSkillsIn {
  onTrack: number; needSupport: number; withWork: number; weakest: { name: string; pct: number } | null;
  trend: { gained: number; improved: number; stalled: readonly { name: string }[]; down: number }; guessing: readonly { name: string }[];
  actions: readonly { kind: string; vars: Record<string, string | number> }[];
}
/**
 * The Class report summary (3–5 sentences): the groups, "The class gained N stars in the last 2 weeks · X students
 * improved · Y not moving", who answers too fast, the hardest skill, the next step. Its action plan is the report's
 * own numbered list (with names and buttons), drawn right after it.
 */
export function skillsClassSummary(r: ClassSkillsIn): Summary {
  if (!r.withWork) return { lines: [line(R.sgNone, "info"), line(S.nextNone, "next")], actions: [] };
  const first = r.actions[0]?.kind;
  const next = first === "RETEACH" ? line(R.scNextReteach, "next", { skill: String(r.actions[0].vars.skill ?? "") })
    : first === "GUESSING" ? line(R.scNextGuess, "next")
    : first === "STALLED" ? line(R.scNextStalled, "next")
    : r.actions.length ? line(R.scNextPlan, "next") : line(S.nextKeep, "next");
  return {
    lines: fit([
      line(R.scGroups, "info", { on: r.onTrack, total: r.withWork, help: r.needSupport }),
      line(R.scTrend, r.trend.improved ? "good" : "info", { n: r.trend.gained, x: r.trend.improved, y: r.trend.stalled.length }),
      r.guessing.length ? line(R.scGuess, "help", { names: nameList(r.guessing, 4) }) : null,
      r.weakest ? line(R.scWeak, "skill", { skill: r.weakest.name, pct: r.weakest.pct }) : null,
      next,
    ]),
    actions: [],
  };
}

/** "In one line" (r75): the plain sentence at the top of the Skills grid tab. */
export const skillsGridOneLine = (v: { won: number; stars: number; up: number; fast: number }): Line => line(R.oneGrid, "info", { m: v.won, n: v.stars, up: v.up, fast: v.fast });
/** "In one line" (r75): the By source tab — the weakest source (or the only one). */
export function skillsSourceOneLine(cards: readonly SourcesIn[]): Line | null {
  if (!cards.length) return null;
  const weak = weakestSource(cards)[0];
  return line(cards.length === 1 ? R.oneSourceOnly : R.oneSource, "info", { source: weak.label, pct: sourcePct(weak) });
}
/** "In one line" (r75): the Class report tab. */
export const skillsReportOneLine = (v: { on: number; total: number; help: number; gained: number }): Line => line(R.oneReport, "info", v);

// ── Student Skills → Plans (r84) ──────────────────────────────────────────────────────────────────────────────────────
export interface SkillsPlansIn { status: string; pct: number; notStarted: number }
/** "In one line" (r84): the Plans tab — the active plans, their average achievement, who has not started. */
export function skillsPlansOneLine(cards: readonly SkillsPlansIn[]): Line | null {
  if (!cards.length) return null;
  const on = cards.filter((c) => c.status !== "FINISHED");
  if (!on.length) return line(R.onePlansDone, "info");
  return line(R.onePlans, "info", { n: on.length, pct: Math.round(on.reduce((a, c) => a + c.pct, 0) / on.length), idle: on.reduce((a, c) => a + c.notStarted, 0) });
}
export interface SkillsPlanIn { card: { pct: number }; rows: readonly { state: string }[]; skills: readonly { name: string; pct?: number; mastered: number; total: number }[] }
/** The opened plan's summary (3–5 sentences); its action plan is the page's numbered list right after it. */
export function skillsPlanSummary(v: SkillsPlanIn): Summary {
  const n = v.rows.length, done = v.rows.filter((r) => r.state === "FINISHED").length;
  const help = v.rows.filter((r) => r.state === "SUPPORT").length, idle = v.rows.filter((r) => r.state === "NOT_STARTED").length;
  const weak = [...v.skills].filter((k) => k.total > 0 && k.mastered < k.total).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || byName(a, b))[0];
  const next = idle ? line(R.plNextFollow, "next") : weak ? line(R.plNextReteach, "next", { skill: weak.name }) : done ? line(R.plNextLevel, "next") : line(S.nextKeep, "next");
  return {
    lines: fit([
      line(R.plOverview, done === n && n > 0 ? "good" : "info", { done, n, pct: v.card.pct }),
      weak ? line(R.plWeak, "skill", { skill: weak.name, pct: weak.pct ?? 0 }) : null,
      help ? line(R.plSupport, "help", { n: help }) : null,
      idle ? line(R.plIdle, "help", { n: idle }) : null,
      next,
    ]),
    actions: [],
  };
}

// ── Review Reports (r+1, Oct 2026) ──────────────────────────────────────────────────────────────────────────────
export interface ReviewReportsIn {
  reviews: readonly {
    students: readonly { studentId: string; name: string; status: string; answered: number; correct: number }[];
    skills: readonly { skillId: string; name: string; answered: number; correct: number }[];
  }[];
}
/**
 * Review Reports' summary: how many Reviews were sent, every student's OVERALL accuracy across every one of them
 * (answers summed across all their sent Reviews — classSummary's usual well/help split and weakest-skill/next-step
 * rules, same as every other report), and who is overdue on at least one Review. Pure: totals every number this
 * page already loaded, no extra read.
 */
export function reviewReportsSummary(v: ReviewReportsIn, classId: string | null): Summary {
  if (!v.reviews.length) return { lines: [line(R.rvNone, "info")], actions: [] };
  const totals = new Map<string, { name: string; answered: number; correct: number }>();
  const overdue = new Map<string, string>();
  for (const r of v.reviews) {
    for (const st of r.students) {
      const cur = totals.get(st.studentId) ?? { name: st.name, answered: 0, correct: 0 };
      cur.answered += st.answered; cur.correct += st.correct;
      totals.set(st.studentId, cur);
      if (st.status === "OVERDUE") overdue.set(st.studentId, st.name);
    }
  }
  const rows: Scored[] = [...totals].map(([id, t]) => ({ id, name: t.name, pct: t.answered ? Math.round((100 * t.correct) / t.answered) : null }));
  const skillAgg = new Map<string, { name: string; answered: number; correct: number }>();
  for (const r of v.reviews) for (const k of r.skills) {
    const cur = skillAgg.get(k.skillId) ?? { name: k.name, answered: 0, correct: 0 };
    cur.answered += k.answered; cur.correct += k.correct;
    skillAgg.set(k.skillId, cur);
  }
  const skills: SkillScore[] = [...skillAgg].map(([id, s]) => ({ id, name: s.name, pct: s.answered ? Math.round((100 * s.correct) / s.answered) : null, n: s.answered }));
  const overdueList = [...overdue.values()].sort((a, b) => a.localeCompare(b)).map((name) => ({ name }));
  const extra: (Line | null)[] = [
    line(R.rvSent, "info", { n: v.reviews.length }),
    overdueList.length ? line(R.rvOverdue, "help", { n: overdueList.length, names: nameList(overdueList) }) : null,
  ];
  return classSummary({ rows, skills, classId, extra });
}

export type { Named, Scored };
/** Every report-specific sentence and label (each must be in en.ts and ar.ts). */
export const REPORT_SUMMARY_KEYS: readonly string[] = Object.values(R);
