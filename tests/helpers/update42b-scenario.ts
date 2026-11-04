/**
 * Update 42B scenario: one student answers through practice, an assigned question set and an intervention lesson on
 * the demo school, with fixed times and a seeded random. It returns everything the student sees (feedback, next
 * screen) and what is saved (attempts, mastery, ability, XP, decision logs, statuses) WITHOUT ids, so the result of
 * the code before Update 42B (recorded in tests/fixtures/update42b-golden.json) and after can be compared exactly.
 * `load(path)` imports a module of the code base under test (the golden file was made with the base revision's code).
 */
type Load = (p: string) => Promise<any>;

const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);

export async function runScenario(load: Load) {
  const { demoDatabase, ROOT, seededRandom } = await load("tests/helpers/db.ts");
  const { DEMO_SCHOOL_CODE } = await load("src/server/seeding/demo.ts");
  const { loadBank } = await load("src/server/seeding/load-files.ts");
  const { seedQuestions } = await load("src/server/seeding/questions.ts");
  const { resolveActor } = await load("src/server/auth/actor.ts");
  const { loadSkillItems, loadQuestionItems } = await load("src/server/practice/items.ts");
  const P = await load("src/server/practice/session.ts");
  const L = await load("src/server/lessons/run.ts");
  const { assignQuestions } = await load("src/server/teacher/assign.ts");
  let settle: () => Promise<void> = P.assignmentUpdatesSettled;
  try { const a = await load("src/server/lib/after-response.ts"); settle = async () => { await a.afterResponseSettled(); await P.assignmentUpdatesSettled(); }; } catch { /* before Update 42B */ }

  const { repo } = await demoDatabase();
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q: any) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q: any) => q.id) } }, { status: "PUBLISHED" });
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const lina = await actorFor("demo.s1001");
  const st = (await repo.findUnique("Student", { id: lina.studentId }))!;
  const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
  const skills = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true, deletedAt: null })).sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));
  // the first skills with at least 6 auto-scored items
  const usable: any[] = [];
  for (const k of skills) if ((await loadSkillItems(repo, String(k.id))).length >= 6) usable.push(k);
  const skillCode = (id: string) => String(skills.find((k: any) => String(k.id) === String(id))?.code ?? "?");
  const stem = new Map<string, string>();
  const name = async (qid: string | null | undefined) => {
    if (!qid) return null;
    if (!stem.has(qid)) stem.set(qid, String((await repo.findUnique("Question", { id: qid }))?.externalRef ?? (await repo.findUnique("Question", { id: qid }))?.stem ?? "?"));
    return stem.get(qid)!;
  };
  const at = (s: number) => new Date(T0 + s * 1000);
  const answer = (item: any, right: boolean): unknown => {
    switch (item.type) {
      case "MULTIPLE_CHOICE": case "DROPDOWN": return item.options.find((o: any) => o.correct === right).label;
      case "MULTI_SELECT": return right ? item.options.filter((o: any) => o.correct).map((o: any) => o.label) : item.options.map((o: any) => o.label);
      case "TRUE_FALSE": return right ? item.answer : !item.answer;
      case "FILL_BLANK": return right ? item.answers[0] : "zzz";
      case "SENTENCE_ORDER": case "WORD_ORDER": return right ? item.sequence : [...item.sequence].reverse();
      case "ERROR_CORRECTION": return right ? item.errorIndex : (item.errorIndex + 1) % item.segments.length;
      case "MATCHING": return Object.fromEntries(item.pairs.map((p: any, i: number) => [p.left, right ? p.right : item.pairs[(i + 1) % item.pairs.length].right]));
      default: throw new Error(`no answer for ${item.type}`);
    }
  };
  const clean = async (fb: any) => fb && ({ ...fb, next: { ...fb.next, routeToSkillId: fb.next.routeToSkillId ? "<skill>" : null } });
  const cleanView = async (v: any) => v && ({ ...v, sessionId: undefined, runId: undefined, assignmentId: undefined, skillId: v.skillId ? skillCode(v.skillId) : undefined, question: v.question ? { questionId: await name(v.question.questionId), type: v.question.type, stem: v.question.stem, level: v.question.level } : null }); // option order is shuffled per session
  const log: unknown[] = [];
  const pattern = [true, true, false, true, false, false, true, true, true, false, true];
  let t = 0;

  // ---------------- 1. adaptive practice on two skills
  for (const k of usable.slice(0, 2)) {
    const rnd = seededRandom(777);
    let v = await P.startPractice(repo, lina, String(k.id), at((t += 30)), rnd);
    log.push({ start: await cleanView(v) });
    for (let i = 0; v.question && i < pattern.length; i++) {
      const it = (await loadSkillItems(repo, String(k.id))).find((x: any) => x.questionId === v.question.questionId);
      const r = await P.submitAnswer(repo, lina, { sessionId: v.sessionId, questionId: v.question.questionId, response: answer(it, pattern[i]) }, at((t += 9 + 7 * (i % 4))), rnd);
      log.push({ practice: await clean(r.feedback), view: await cleanView(r.view) });
      v = r.view;
      await settle();
    }
  }
  // ---------------- 2. an assigned question set (fixed order)
  const cm = (await repo.findMany("ClassMembership", { studentId: lina.studentId, leftAt: null }))[0];
  const ct = (await repo.findMany("ClassTeacher", { classId: cm.classId }))[0];
  const teacher = await actorFor(String((await repo.findUnique("User", { id: (await repo.findUnique("Teacher", { id: ct.teacherId }))!.userId }))!.username));
  const k2 = usable[2] ?? usable[0];
  const setItems = (await loadSkillItems(repo, String(k2.id))).sort((a: any, b: any) => a.level - b.level).slice(0, 5);
  const set = await assignQuestions(repo, teacher, { source: "CURRICULUM", classId: String(cm.classId), questionIds: setItems.map((x: any) => x.questionId), studentIds: [lina.studentId], title: "Scenario set" }, at((t += 60)));
  let q = await P.startQuiz(repo, lina, set.assignmentId, at((t += 30)));
  for (let i = 0; q.question && i < 10; i++) {
    const it = (await loadQuestionItems(repo, [q.question.questionId]))[0];
    const r = await P.submitQuizAnswer(repo, lina, { assignmentId: set.assignmentId, questionId: q.question.questionId, response: answer(it, pattern[i + 3]) }, at((t += 20)));
    log.push({ set: await clean(r.feedback), view: await cleanView(r.view) });
    q = r.view;
    await settle();
  }
  // ---------------- 3. an intervention lesson
  let lessonSkill: any = null;
  for (const k of usable) if (await L.hasLesson(repo, String(k.id))) { lessonSkill = k; break; }
  if (lessonSkill) {
    let lv = await L.openLesson(repo, lina, String(lessonSkill.id), at((t += 60)));
    lv = await L.answerModel(repo, lina, lv.runId, 0, at((t += 30)));
    lv = await L.beginGuided(repo, lina, lv.runId, at((t += 10)));
    for (let i = 0; lv.question && i < 8; i++) {
      if (lv.organizer?.required && !lv.organizer.value) break;
      const it = (await loadQuestionItems(repo, [lv.question.questionId]))[0];
      const r = await L.answerLesson(repo, lina, { runId: lv.runId, questionId: lv.question.questionId, response: answer(it, pattern[(i + 5) % pattern.length]) }, at((t += 25)));
      log.push({ lesson: await clean(r.feedback), credit: r.lessonCredit, phase: r.view.phase, q: await name(r.view.question?.questionId) });
      lv = r.view;
      await settle();
    }
  }
  await settle();

  // ---------------- what is saved
  const sid = lina.studentId;
  const attempts = await repo.findMany("QuestionAttempt", { studentId: sid, createdAt: { gte: new Date(T0) } }, { orderBy: [{ field: "createdAt", dir: "asc" }] });
  const logs = await repo.findMany("AdaptiveDecisionLog", { studentId: sid, createdAt: { gte: new Date(T0) } }, { orderBy: [{ field: "createdAt", dir: "asc" }] });
  const touched = [...new Set(attempts.map((a: any) => String(a.skillId)))];
  const mastery = await repo.findMany("StudentSkillMastery", { studentId: sid, skillId: { in: touched } });
  const ability = await repo.findMany("StudentAbility", { studentId: sid, scope: { in: touched.map((x) => `SKILL:${x}`) } });
  const code = new Map(skills.map((k: any) => [String(k.id), String(k.code)]));
  const r4 = (x: unknown) => (x === null || x === undefined ? null : Math.round(Number(x) * 1e4) / 1e4);
  const saved = {
    attempts: await Promise.all(attempts.map(async (a: any) => ({ q: await name(String(a.questionId)), correct: Boolean(a.isCorrect), credit: r4(a.partialCredit), ms: Number(a.responseMs), hint: Boolean(a.usedHint), rapid: Boolean(a.rapidGuess), b: r4(a.difficultyB), mis: a.misconception ?? null, source: a.source ?? null }))),
    logs: logs.map((l: any) => ({ code: l.reasonCode, prev: r4(l.previousTheta), next: r4(l.newTheta), se: r4(l.thetaSE), before: r4(l.masteryBefore), after: r4(l.masteryAfter), correct: l.responseCorrect ?? null, hasAttempt: Boolean(l.attemptId), hasNext: Boolean(l.nextQuestionId), reason: l.reason })).sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    mastery: mastery.map((m: any) => ({ skill: code.get(String(m.skillId)), score: r4(m.score), band: m.band, attempts: Number(m.attempts), correct: Number(m.correct), mastered: Boolean(m.isMastered), maxLevel: Number(m.maxLevelCorrect ?? 0) })).sort((a: any, b: any) => String(a.skill).localeCompare(String(b.skill))),
    ability: ability.map((a: any) => ({ scope: code.get(String(a.scope).slice(6)), theta: r4(a.theta), se: r4(a.thetaSE), n: Number(a.responses) })).sort((a: any, b: any) => String(a.scope).localeCompare(String(b.scope))),
    xp: (await repo.findMany("XpEvent", { studentId: sid, createdAt: { gte: new Date(T0) } })).map((x: any) => `${x.reason}:${x.points}`).sort(),
    sets: (await repo.findMany("AssignmentStudent", { studentId: sid, assignmentId: set.assignmentId })).map((x: any) => ({ status: x.status, progress: r4(x.progress) })),
    sessions: (await repo.findMany("PracticeSession", { studentId: sid, startedAt: { gte: new Date(T0) } }, { orderBy: [{ field: "startedAt", dir: "asc" }] })).map((x: any) => ({ mode: x.mode, n: Number(x.questionCount), correct: Number(x.correctCount), ms: Number(x.activeMs), end: x.endReason ?? null, ended: Boolean(x.endedAt) })),
  };
  return { log, saved };
}
