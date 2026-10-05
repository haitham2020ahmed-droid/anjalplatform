/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Teacher screens preview: a DEMO class of 14 students (demo names) practising through
 * the real services, then rendered with the real teacher components.
 *   NODE_PATH=$(npm root -g) npx tsx scripts/preview/render-teacher.tsx
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { renderToStaticMarkup } from "react-dom/server";
import { probability } from "../../src/adaptive/irt";
import { ClassOverviewView } from "../../src/components/teacher/class-overview";
import { HeatMap } from "../../src/components/teacher/heat-map";
import { StudentDetailView } from "../../src/components/teacher/student-detail";
import { resolveActor } from "../../src/server/auth/actor";
import { hashPassword } from "../../src/server/auth/password";
import { startDiagnostic, submitDiagnosticAnswer } from "../../src/server/assessment/diagnostic";
import { loadItemsForSkills, loadSkillItems, type PracticeItem } from "../../src/server/practice/items";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { classAssignments, createAssignment } from "../../src/server/teacher/assignments";
import { scanInterventions } from "../../src/server/teacher/interventions";
import { classOverview, masteryGrid, studentDetail } from "../../src/server/teacher/queries";
import { ClassAnalyticsView } from "../../src/components/analytics/class-analytics";
import { StudentAnalyticsView } from "../../src/components/analytics/student-analytics";
import { resolvePeriod } from "../../src/analytics/periods";
import { loadCalendar } from "../../src/server/analytics/calendar";
import { classComparison, standardsReport, studentAnalytics } from "../../src/server/analytics/reports";
import { buildSnapshots } from "../../src/server/analytics/snapshots";
import { generateDDL, parseSchema } from "../db/schema-ddl";
import { SqliteRepo } from "../db/sqlite-repo";

const ROOT = join(__dirname, "..", "..");
let seed = 2026;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const NAMES = ["Lina Al-Harbi", "Omar Al-Qahtani", "Sara Al-Otaibi", "Yousef Al-Ghamdi", "Noura Al-Shehri", "Faisal Al-Dossary", "Reem Al-Mutairi", "Khalid Al-Zahrani", "Huda Al-Anazi", "Abdullah Al-Shammari", "Maha Al-Juhani", "Turki Al-Subaie", "Dana Al-Rashid", "Hamad Al-Harthi"];

function answer(it: PracticeItem, right: boolean): unknown {
  if (it.options) return it.type === "MULTI_SELECT" ? (right ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.map((o) => o.label)) : it.options.find((o) => o.correct === right)!.label;
  if (it.type === "TRUE_FALSE") return right ? it.answer : !it.answer;
  if (it.type === "FILL_BLANK") return right ? it.answers![0] : "zzz";
  if (it.type === "ERROR_CORRECTION") return right ? it.errorIndex : (it.errorIndex! + 1) % it.segments!.length;
  if (it.type === "MATCHING") return Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]));
  return right ? it.sequence : [...it.sequence!].reverse();
}

async function main() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  db.exec(generateDDL(schema, "sqlite"));
  const repo = new SqliteRepo(db, schema);
  await seedCurriculum(repo, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo International School"));
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  await seedDemoSchool(repo, { passwordHash: await hashPassword("preview-only-123"), classesPerGrade: 1, studentsPerClass: NAMES.length });
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
  await repo.updateMany("User", { username: "demo.teacher.4a" }, { displayName: "Miss Doaa Eskandrany" });

  const klass = (await repo.findMany("Class", { name: "DEMO 4A" }))[0];
  await repo.updateMany("Class", { id: klass.id }, { name: "4A" });
  const members = await repo.findMany("ClassMembership", { classId: klass.id });
  const students = await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } });
  students.sort((a, b) => String(a.studentNumber).localeCompare(String(b.studentNumber)));
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId }))[0];
  const unit3 = (await repo.findUnique("Unit", { curriculumId: cur.id, number: 3 }))!;
  const unitSkills = (await repo.findMany("UnitSkill", { unitId: unit3.id })).map((l) => String(l.skillId));
  const practisable: string[] = [];
  for (const s of unitSkills) if ((await loadSkillItems(repo, s)).length >= 3) practisable.push(s);
  const allSkillIds = (await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => String(k.id));
  const allItems = new Map((await loadItemsForSkills(repo, allSkillIds)).map((i) => [i.questionId, i]));

  const T0 = Date.parse("2026-09-14T07:30:00Z");
  let clock = 0;
  const at = (s = 35) => new Date(T0 + (clock += s) * 1000);
  const truths: number[] = [];
  for (const [i, st] of students.entries()) {
    await repo.updateMany("User", { id: st.userId }, { displayName: NAMES[i] });
    const truth = i === 1 ? -1.7 : i === 6 ? -1.1 : i === 0 ? 1.4 : gauss() * 0.8;
    truths.push(truth);
    const actor = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    if (i < 11) {
      let v = await startDiagnostic(repo, actor, at(0));
      let k = 0;
      while (v.question && k++ < 40) {
        const it = allItems.get(v.question.questionId)!;
        v = await submitDiagnosticAnswer(repo, actor, { sessionId: v.sessionId, questionId: it.questionId, response: answer(it, rand() < probability(truth, { a: it.irt.a, b: it.irt.b, c: 0 }, 2)) }, at());
      }
    }
    const skills = [...practisable].sort(() => rand() - 0.5).slice(0, i === 1 ? 3 : 5);
    // two sessions per skill, spread over the term (Sep–Dec); true ability grows ~0.04/week
    const DAYMS = 86_400_000;
    for (const [k, sk] of skills.entries()) {
      // max week 13 → mid-December; the two struggling students also practise their first skill again in December
      for (const week of [k * 2, 5 + k * 2, ...((i === 1 || i === 6) && k === 0 ? [13] : [])]) {
        const items = await loadSkillItems(repo, sk);
        const start = new Date(T0 + week * 7 * DAYMS + (i % 5) * DAYMS + 3_600_000 * (8 + (i % 6)));
        let tt = start.getTime();
        let view = await startPractice(repo, actor, sk, start, rand);
        const th = truth + 0.04 * week;
        for (let n = 0; n < 10 && view.question; n++) {
          const it = items.find((x) => x.questionId === view.question!.questionId)!;
          tt += (i === 1 ? 95 : 40) * 1000;
          ({ view } = await submitAnswer(repo, actor, { sessionId: view.sessionId, questionId: it.questionId, response: answer(it, rand() < probability(th, { a: it.irt.a, b: it.irt.b, c: 0 }, 2)) }, new Date(tt), rand));
        }
        if (!view.ended) await repo.updateMany("PracticeSession", { id: view.sessionId }, { endedAt: new Date(tt), endReason: "STUDENT_EXIT", currentQuestionId: null });
      }
    }
  }
  const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
  const now = new Date("2026-12-20T12:00:00Z");
  await scanInterventions(repo, students.map((s) => String(s.id)), now);
  const cc = (await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.context-clues" }))!;
  await createAssignment(repo, teacher, { classId: String(klass.id), title: "Context clues before the unit test", target: "SKILL", skillIds: [String(cc.id)], dueAt: new Date(now.getTime() + 5 * 86_400_000), targetMastery: 70 }, now);

  const o = await classOverview(repo, teacher, String(klass.id), { from: new Date(T0 - 86_400_000), to: new Date(now.getTime() + 86_400_000) });
  const grid = await masteryGrid(repo, teacher, String(klass.id), String(unit3.id));
  const assignments = await classAssignments(repo, teacher, String(klass.id), now);
  const struggling = await studentDetail(repo, teacher, String(students[1].id));
  const picker = `<nav aria-label="Choose unit" class="mb-3 flex flex-wrap gap-2">${[1, 2, 3, 4, 5, 6].map((n) => `<a href="#" class="rounded-lg px-3 py-1.5 text-sm font-medium ${n === 3 ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}">Unit ${n}</a>`).join("")}</nav>`;
  const overviewHtml = renderToStaticMarkup(<ClassOverviewView o={o} assignments={assignments} heatMap={<HeatMap grid={grid} studentHref={() => "#student"} />} />).replace('<div class="overflow-x-auto rounded-2xl', `${picker}<div class="overflow-x-auto rounded-2xl`);
  const period = resolvePeriod("TERM", await loadCalendar(repo, String(klass.schoolId)), now);
  await buildSnapshots(repo, students.map((x) => String(x.id)), period.from, period.to);
  const comparison = await classComparison(repo, teacher, String(klass.id), period);
  const stds = await standardsReport(repo, teacher, { classId: String(klass.id) }, period);
  const sa = await studentAnalytics(repo, teacher, String(students[1].id), period);
  const analyticsHtml = renderToStaticMarkup(<ClassAnalyticsView className="4A" classHref="#" period={period.label} periodKey="TERM" c={comparison} standards={stds.rows} notAssessed={stds.notAssessed} />);
  const detailHtml = renderToStaticMarkup(<><StudentDetailView d={struggling} classHref="#" /><StudentAnalyticsView a={sa} /></>);
  console.log(`growth: series ${comparison.classGrowth.series.map((p) => p.label + "=" + p.mastery).join(" ")}; mean ${comparison.classGrowth.meanGrowth}; standards ${stds.rows.length}; national: ${comparison.external[1].message}`);
  console.log(`class: ${o.kpis.students} students, ${o.kpis.questions} answers, accuracy ${o.kpis.accuracyPct}%, alerts ${o.alerts.length}, groups ${Object.entries(o.groups).map(([g, v]) => g + "=" + v.length).join(" ")}`);
  console.log(`alerts: ${o.alerts.map((a) => a.message).join(" | ")}`);

  const shell = (body: string) => `<header class="border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3"><a href="#" class="font-bold text-brand-navy">Al-Anjal English</a><div class="flex items-center gap-4 text-sm text-slate-600"><span>Miss Doaa Eskandrany</span><button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Sign out</button></div></div></header><main class="mx-auto max-w-7xl px-6 py-8">${body}</main>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Al-Anjal English — teacher screens preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com/3.4.16"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{navy:"#1f3a68",purple:"#5b3fa0",teal:"#1fa3a3",gold:"#f5b800"}},fontFamily:{sans:["Lexend","Segoe UI","system-ui","sans-serif"]}}}}</script>
<style>:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{background:#f6f8fb;color:#0f172a;font-family:Lexend,"Segoe UI",system-ui,sans-serif}
.tabs{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:#1f3a68;color:#fff}.tabs button{padding:.6rem 1rem;border-radius:.5rem;font-weight:600}.tabs button[aria-selected=true]{background:#fff;color:#1f3a68}.note{font-size:.875rem;color:#cbd5e1}</style></head><body>
<div class="tabs"><div class="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-2"><button id="t1" aria-selected="true" onclick="show(1)">Class 4A overview</button><button id="t3" aria-selected="false" onclick="show(3)">Progress and growth</button><button id="t2" aria-selected="false" onclick="show(2)">Student profile</button><span class="note ml-auto">Preview with demo students, rendered from the platform's real components</span></div></div>
<section id="v1">${shell(overviewHtml)}</section><section id="v2" hidden>${shell(detailHtml)}</section><section id="v3" hidden>${shell(analyticsHtml)}</section>
<script>function show(n){for(const i of [1,2,3]){document.getElementById('v'+i).hidden=i!==n;document.getElementById('t'+i).setAttribute('aria-selected',i===n)};window.scrollTo(0,0)}
document.querySelectorAll('a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();if(a.getAttribute('href')==='#student'||a.textContent.includes('${NAMES[1]}'))show(2);else if(a.textContent.includes('Back to class'))show(1);else if(a.textContent.includes('Progress and growth'))show(3)}))</script></body></html>`;
  mkdirSync(join(ROOT, "database/verify"), { recursive: true });
  writeFileSync(join(ROOT, "database/verify/teacher-preview.html"), html);
}
main().catch((e) => { console.error(e); process.exit(1); });
