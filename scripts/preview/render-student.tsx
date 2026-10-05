/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Renders a static preview of the student curriculum screens from REAL components
 * and a simulated Grade 4 student (demo data, verification DB only).
 *   NODE_PATH=$(npm root -g) npx tsx --tsconfig tsconfig.preview.json scripts/preview/render-student.tsx
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY } from "../../src/config/engine";
import { processAnswer, type SkillState } from "../../src/adaptive/engine";
import { probability } from "../../src/adaptive/irt";
import { UnitList } from "../../src/components/curriculum/unit-list";
import { UnitSkills } from "../../src/components/curriculum/unit-skills";
import { PracticeFrame } from "../../src/components/practice/practice-frame";
import { resolveActor } from "../../src/server/auth/actor";
import { loadSkillItems } from "../../src/server/practice/items";
import { startPractice, submitAnswer } from "../../src/server/practice/session";
import { startDiagnostic, submitDiagnosticAnswer } from "../../src/server/assessment/diagnostic";
import { loadItemsForSkills } from "../../src/server/practice/items";
import { PlacementFrame } from "../../src/components/placement/placement-frame";
import { PlacementResult } from "../../src/components/placement/placement-result";
import { seedQuestions } from "../../src/server/seeding/questions";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { loadBank } from "../../src/server/seeding/load-files";
import { getStudentCurriculum, getUnitSkillCards } from "../../src/server/queries/student-curriculum";
import type { CandidateItem, ResponseEvidence } from "../../src/types/domain";
import { demoDatabase, ROOT } from "../../tests/helpers/db";

let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

async function main() {
  const { repo } = await demoDatabase();
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
  const user = (await repo.findUnique("User", { username: "demo.s1001" }))!;
  await repo.updateMany("User", { id: user.id }, { displayName: "Lina Al-Harbi" });
  const student = (await repo.findUnique("Student", { userId: user.id }))!;
  const studentId = String(student.id);
  const cur = await getStudentCurriculum(repo, studentId);

  // ---- placement check first (mixed strengths: strong grammar, weaker punctuation)
  const pActor = await resolveActor(repo, (await repo.findUnique("User", { id: user.id }))!);
  const truthBy: Record<string, number> = { GRAMMAR: 1.1, READING: 0.5, VOCABULARY: -0.2, LANGUAGE: -1.3, WORD_STUDY: 0, WRITING: 0 };
  const allSkills = await repo.findMany("Skill", {});
  const domainOfSkill = new Map(allSkills.map((k) => [String(k.id), String(k.domain)]));
  const dItems = new Map((await loadItemsForSkills(repo, allSkills.map((k) => String(k.id)))).map((i) => [i.questionId, i]));
  const t0 = new Date("2026-09-14T08:00:00Z");
  let dv = await startDiagnostic(repo, pActor, t0);
  const placementFirst = renderToStaticMarkup(<PlacementFrame q={dv.question!} answered={0} max={dv.maxQuestions} value={null} onChange={() => {}} ready={false} pending={false} error={null} onNext={() => {}} />);
  let k = 0;
  while (dv.question && k++ < 40) {
    const it = dItems.get(dv.question.questionId)!;
    const right = rand() < probability(truthBy[domainOfSkill.get(it.skillKey)!] ?? 0, { a: it.irt.a, b: it.irt.b, c: 0 }, 2);
    const resp = it.options ? (it.type === "MULTI_SELECT" ? (right ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.map((o) => o.label)) : it.options.find((o) => o.correct === right)!.label)
      : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer) : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
      : it.type === "ERROR_CORRECTION" ? (right ? it.errorIndex : (it.errorIndex! + 1) % it.segments!.length)
      : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]))
      : right ? it.sequence : [...it.sequence!].reverse();
    dv = await submitDiagnosticAnswer(repo, pActor, { sessionId: dv.sessionId, questionId: dv.question.questionId, response: resp }, new Date(t0.getTime() + k * 40_000));
  }
  const placementResult = renderToStaticMarkup(<PlacementResult r={dv.result!} firstName="Lina" />);
  console.log(`placement: ${dv.answered} questions, ${dv.result!.proficiency}; areas ${dv.result!.domains.map((d) => d.label + "=" + d.level).join("; ")}`);

  // simulate practice in Units 1 and 2 with the real engine (varied true ability per skill)
  const now = new Date("2026-11-20T09:00:00Z");
  for (const unit of cur.units.slice(0, 2)) {
    const { cards } = await getUnitSkillCards(repo, studentId, unit.unitId, now);
    for (const [i, card] of cards.filter((c) => c.canPractice).entries()) {
      if (unit.number === 2 && i > 2) break; // Unit 2 only partly started
      const qs = await repo.findMany("Question", { skillId: card.skillId, status: "PUBLISHED" });
      const pool: CandidateItem[] = qs.map((q) => ({ id: String(q.id), skillId: card.skillId, level: Number(q.difficultyLevel), a: Number(q.irtA), b: Number(q.irtB), c: Number(q.irtC), estimatedSeconds: Number(q.estimatedSeconds) }));
      const truth = [1.9, 0.6, -0.6, 1.2, 0.1, 2.2, -1.2, 0.9][i % 8];
      let st: SkillState = { studentId, skillId: card.skillId, sessionId: "preview", mode: "PRACTICE", ability: { theta: 0, se: 1 }, prior: { mean: 0, sd: 1 }, history: [], previousTargetB: null, candidates: pool, prerequisites: [] };
      let item: CandidateItem | null = pool[0];
      let last = null as ReturnType<typeof processAnswer> | null;
      for (let n = 0; n < 18 && item; n++) {
        const t = new Date(now.getTime() - (20 - n) * 3_600_000);
        const r: ResponseEvidence = { itemId: item.id, correct: rand() < probability(truth, item, 2), level: item.level, a: item.a, b: item.b, c: item.c, responseMs: 35_000, estimatedSeconds: item.estimatedSeconds, usedHint: false, at: t.toISOString() };
        last = processAnswer(st, r, { adaptive: DEFAULT_ADAPTIVE, mastery: DEFAULT_MASTERY }, t, rand);
        st = { ...st, ability: last.ability, history: [...st.history, r], previousTargetB: last.next.targetB };
        // PREVIEW ONLY: today's bank has 3–10 items per skill, so allow repeats to show realistic card states
        item = last.next.itemId ? pool.find((p) => p.id === last!.next.itemId)! : pool[n % pool.length];
      }
      if (last) await repo.upsert("StudentSkillMastery", { studentId, skillId: card.skillId }, {
        score: last.mastery.score, band: last.mastery.band, attempts: st.history.length, correct: st.history.filter((h) => h.correct).length,
        isMastered: last.mastery.isMastered, maxLevelCorrect: last.mastery.components.maxLevelCorrect, lastPracticedAt: now,
      });
    }
  }

  const curriculum = await getStudentCurriculum(repo, studentId);
  const unit = curriculum.units.find((u) => u.isCurrent)!;
  const { cards } = await getUnitSkillCards(repo, studentId, unit.unitId, now);
  const overview = renderToStaticMarkup(<UnitList curriculum={curriculum} firstName="Lina" />);
  const unitPage = renderToStaticMarkup(<UnitSkills unit={unit} cards={cards} grade={curriculum.grade} bookTitle={curriculum.bookTitle} />);

  // ---- practice states from a REAL session (figurative language: passage-based questions)
  const actor = await resolveActor(repo, (await repo.findUnique("User", { id: user.id }))!);
  const figId = String((await repo.findMany("Skill", { code: "G4.figurative-language", curriculumId: (await repo.findMany("Curriculum", { gradeId: student.gradeId }))[0].id }))[0].id);
  const pnow = new Date("2026-11-21T09:00:00Z");
  let view = await startPractice(repo, actor, figId, pnow);
  // make sure the first shown item has a passage (serve order is adaptive; skip forward if needed)
  const items = await loadSkillItems(repo, figId);
  let guard = 0;
  while (view.question && !view.question.passage && guard++ < 6) {
    const it = items.find((i) => i.questionId === view.question!.questionId)!;
    ({ view } = await submitAnswer(repo, actor, { sessionId: view.sessionId, questionId: it.questionId, response: it.options ? it.options.find((o) => o.correct)!.label : it.answer }, new Date(pnow.getTime() + guard * 40_000)));
  }
  const q1 = view.question!;
  const it1 = items.find((i) => i.questionId === q1.questionId)!;
  const wrong = it1.options!.find((o) => !o.correct)!.label;
  const noop = () => {};
  const frame = (props: Partial<Parameters<typeof PracticeFrame>[0]>) => renderToStaticMarkup(
    <PracticeFrame view={view} shownQuestion={q1} value={null} onChange={noop} feedback={null} ready={false} pending={false} error={null} onCheck={noop} onNext={noop} unitHref="#" {...props} />,
  );
  const practiceQuestion = frame({ value: wrong, ready: true });
  const r1 = await submitAnswer(repo, actor, { sessionId: view.sessionId, questionId: q1.questionId, response: wrong }, new Date(pnow.getTime() + 600_000));
  const practiceWrong = frame({ view: r1.view, value: wrong, feedback: r1.feedback });
  const q2 = r1.view.question!;
  const it2 = items.find((i) => i.questionId === q2.questionId)!;
  const right = it2.options ? it2.options.find((o) => o.correct)!.label : it2.type === "TRUE_FALSE" ? it2.answer! : null;
  const r2 = await submitAnswer(repo, actor, { sessionId: r1.view.sessionId, questionId: q2.questionId, response: right }, new Date(pnow.getTime() + 650_000));
  const practiceRight = frame({ view: r2.view, shownQuestion: q2, value: right as string, feedback: r2.feedback });

  const shell = (body: string) => `<header class="border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3"><a href="#" class="font-bold text-brand-navy">Al-Anjal English</a><div class="flex items-center gap-4 text-sm text-slate-600"><span>Lina Al-Harbi</span><button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Sign out</button></div></div></header><main class="mx-auto max-w-6xl px-6 py-8">${body}</main>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Al-Anjal English — student screens preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com/3.4.16"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{navy:"#1f3a68",purple:"#5b3fa0",teal:"#1fa3a3",gold:"#f5b800"}},fontFamily:{sans:["Lexend","Segoe UI","system-ui","sans-serif"]}}}}</script>
<style>
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
body{background:#f6f8fb;color:#0f172a;font-family:Lexend,"Segoe UI",system-ui,sans-serif}
.tabs{position:sticky;top:env(safe-area-inset-top,0px);z-index:10;background:#1f3a68;color:#fff}
.tabs button{padding:.6rem 1rem;border-radius:.5rem;font-weight:600}
.tabs button[aria-selected=true]{background:#fff;color:#1f3a68}
.note{font-size:.875rem;color:#cbd5e1}
</style></head><body>
<div class="tabs"><div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-6 py-2">
<button id="t6" aria-selected="false" onclick="show(6)">Placement: question</button>
<button id="t7" aria-selected="false" onclick="show(7)">Placement: results</button>
<button id="t1" aria-selected="true" onclick="show(1)">Grade overview</button>
<button id="t2" aria-selected="false" onclick="show(2)">Unit ${unit.number} skills</button>
<button id="t3" aria-selected="false" onclick="show(3)">Practice: question</button>
<button id="t4" aria-selected="false" onclick="show(4)">Practice: not quite</button>
<button id="t5" aria-selected="false" onclick="show(5)">Practice: correct</button>
<span class="note ml-auto">Preview with demo data, rendered from the platform's real components</span></div></div>
<section id="v1">${shell(overview)}</section>
<section id="v2" hidden>${shell(unitPage)}</section>
<section id="v3" hidden>${shell(practiceQuestion)}</section>
<section id="v4" hidden>${shell(practiceWrong)}</section>
<section id="v5" hidden>${shell(practiceRight)}</section>
<section id="v6" hidden>${shell(placementFirst)}</section>
<section id="v7" hidden>${shell(placementResult)}</section>
<script>function show(n){for(const i of [1,2,3,4,5,6,7]){document.getElementById('v'+i).hidden=i!==n;document.getElementById('t'+i).setAttribute('aria-selected',i===n)};window.scrollTo(0,0)}
document.querySelectorAll('a[href^="/"]').forEach(a=>{if(a.getAttribute('href').startsWith('/student/unit/')){a.addEventListener('click',e=>{e.preventDefault();show(2)})}else if(a.getAttribute('href')==='/student'){a.addEventListener('click',e=>{e.preventDefault();show(1)})}else{a.addEventListener('click',e=>e.preventDefault())}})</script>
</body></html>`;
  const out = join(ROOT, "database/verify");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "student-preview.html"), html);
  console.log(`practice: q1 ${it1.type} passage=${!!q1.passage}, q2 ${it2.type}, fb1 correct=${r1.feedback.correct}, fb2 correct=${r2.feedback.correct}`);
  console.log(`units ${curriculum.units.length}, current unit ${unit.number}, cards ${cards.length}, recommended ${cards.filter((c) => c.recommended).length}, mastered ${cards.filter((c) => c.isMastered).length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
