/**
 * Phase 2 offline database verification.
 *
 *   npx tsx scripts/db/verify.ts [--students-per-class=25] [--scale=300000]
 *
 * 1. Builds a SQLite database from the DDL generated from prisma/schema.prisma.
 * 2. Seeds the REAL curriculum + question bank through the production seeders.
 * 3. Re-runs every seeder and proves nothing changes (idempotency).
 * 4. Seeds the DEMO school and checks school isolation.
 * 5. Simulates a term of practice for every demo student with the REAL adaptive
 *    engine (IRT-generated answers), writing attempts, decision logs, abilities,
 *    mastery, XP and weekly snapshots.
 * 6. Runs the nightly rollups, then every dashboard query (timing + query plan),
 *    optionally after scaling QuestionAttempt to a year's volume.
 * 7. Writes database/verify/REPORT.md. Exits non-zero if any check fails.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY, ENGINE_VERSION } from "../../src/config/engine";
import { processAnswer, type SkillState } from "../../src/adaptive/engine";
import { probability } from "../../src/adaptive/irt";
import { classSkillDailyRollupSql, studentDailyRollupSql } from "../../src/analytics/rollups";
import { hashPassword } from "../../src/server/auth/password";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import type { CandidateItem, ResponseEvidence } from "../../src/types/domain";
import { generateDDL, parseSchema } from "./schema-ddl";
import { SqliteRepo } from "./sqlite-repo";

const ROOT = join(__dirname, "..", "..");
const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const STUDENTS_PER_CLASS = arg("students-per-class", 25);
const CLASSES_PER_GRADE = arg("classes-per-grade", 4);
const SCALE = arg("scale", 300_000);

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
let seed = 20261004;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

async function main() {
  const t0 = Date.now();
  const outDir = join(ROOT, "database/verify");
  mkdirSync(outDir, { recursive: true });
  const dbPath = join(outDir, "verify.db");
  rmSync(dbPath, { force: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = OFF;");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  db.exec(generateDDL(schema, "sqlite"));
  const repo = new SqliteRepo(db, schema);
  const tables = [...schema.models.keys()];
  const counts = () => Object.fromEntries(tables.map((t) => [t, Number((db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get() as { n: number }).n)]));
  check("schema applied", tables.length === Number((db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get() as { n: number }).n), `${tables.length} tables`);

  // ---------------- 2–3. real school: seed twice
  const curInput = loadCurriculumInput(ROOT, "ALANJAL", "Al-Anjal Private Schools");
  const bank = loadBank(ROOT);
  const c1 = await seedCurriculum(repo, curInput);
  const q1 = await seedQuestions(repo, { schoolCode: "ALANJAL", bank });
  const after1 = counts();
  await seedCurriculum(repo, curInput);
  const q2 = await seedQuestions(repo, { schoolCode: "ALANJAL", bank });
  const after2 = counts();
  const diff = tables.filter((t) => after1[t] !== after2[t]);
  check("curriculum seeded", c1.units === 18 && c1.lessons === 78 && c1.standards === Object.keys(curInput.officialStandards).length, `${c1.units} units, ${c1.lessons} lessons, ${c1.skills} skills, ${c1.subskills} subskills, ${c1.lessonSkills} lesson-skill links, ${c1.prerequisites} prerequisites, ${c1.standards} standards, ${c1.ixlRefs} IXL refs`);
  check("question bank seeded", q1.created === bank.items.length && q1.passages === bank.passages.length, `${q1.created} questions, ${q1.passages} passages`);
  check("re-running every seeder changes nothing (idempotent)", diff.length === 0 && q2.created === 0, diff.length ? `changed: ${diff.join(", ")}` : `${q2.skipped} questions skipped as existing`);
  const gradeOf = db.prepare(`SELECT g.level FROM "Skill" s JOIN "Curriculum" c ON c.id = s.curriculumId JOIN "Grade" g ON g.id = c.gradeId WHERE s.id = ?`);
  const qRows = db.prepare(`SELECT q.id, q.skillId, q.externalRef FROM "Question" q`).all() as { id: string; skillId: string; externalRef: string }[];
  const wrongGrade = qRows.filter((r) => !r.externalRef.startsWith("DEMO") && Number((gradeOf.get(r.skillId) as { level: number }).level) !== Number(r.externalRef.slice(1, 2)));
  check("every question is attached to a skill of its own grade", wrongGrade.length === 0, `${qRows.length} checked`);
  const stdText = db.prepare(`SELECT COUNT(*) n FROM "Standard" WHERE description IS NULL OR description = ''`).get() as { n: number };
  check("every standard carries its official CCSS wording", stdText.n === 0);

  // ---------------- 4. demo school + isolation
  await seedCurriculum(repo, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo International School"));
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank });
  const demo = await seedDemoSchool(repo, { passwordHash: await hashPassword("verify-only-123"), classesPerGrade: CLASSES_PER_GRADE, studentsPerClass: STUDENTS_PER_CLASS });
  check("demo school seeded", demo.students === 3 * CLASSES_PER_GRADE * STUDENTS_PER_CLASS, `${demo.classes} classes, ${demo.teachers} teachers, ${demo.students} students, ${demo.parents} parents, ${demo.demoQuestions} [DEMO] questions`);
  const flag = db.prepare(`SELECT isDemo FROM "School" WHERE code = ?`).get(DEMO_SCHOOL_CODE) as { isDemo: number };
  check("demo school is flagged isDemo", flag.isDemo === 1);
  const crossLinks = db.prepare(`
    SELECT COUNT(*) n FROM "Question" q
    JOIN "Skill" s ON s.id = q.skillId JOIN "Curriculum" c ON c.id = s.curriculumId JOIN "Grade" g ON g.id = c.gradeId
    JOIN "Lesson" l ON l.id = q.lessonId JOIN "Unit" u ON u.id = l.unitId JOIN "Curriculum" c2 ON c2.id = u.curriculumId JOIN "Grade" g2 ON g2.id = c2.gradeId
    WHERE g.schoolId <> g2.schoolId`).get() as { n: number };
  const perSchool = db.prepare(`SELECT sc.code, COUNT(*) n FROM "Skill" s JOIN "Curriculum" c ON c.id = s.curriculumId JOIN "Grade" g ON g.id = c.gradeId JOIN "School" sc ON sc.id = g.schoolId GROUP BY sc.code`).all() as { code: string; n: number }[];
  check("two schools hold separate, equal curricula (multi-school isolation)", perSchool.length === 2 && perSchool[0].n === perSchool[1].n && crossLinks.n === 0, perSchool.map((p) => `${p.code}: ${p.n} skills`).join(", "));

  // ---------------- 5. simulate a term with the real adaptive engine
  const school = db.prepare(`SELECT id FROM "School" WHERE code = ?`).get(DEMO_SCHOOL_CODE) as { id: string };
  const students = db.prepare(`SELECT st.id, g.level FROM "Student" st JOIN "Grade" g ON g.id = st.gradeId WHERE st.schoolId = ?`).all(school.id) as { id: string; level: number }[];
  const items = db.prepare(`
    SELECT q.id, q.skillId, q.difficultyLevel level, q.irtA a, q.irtB b, q.irtC c, q.estimatedSeconds est, g.level grade
    FROM "Question" q JOIN "Skill" s ON s.id = q.skillId JOIN "Curriculum" cu ON cu.id = s.curriculumId JOIN "Grade" g ON g.id = cu.gradeId
    WHERE g.schoolId = ?`).all(school.id) as { id: string; skillId: string; level: number; a: number; b: number; c: number; est: number; grade: number }[];
  const optionRows = db.prepare(`SELECT o.questionId, o.label, o.isCorrect FROM "QuestionOption" o`).all() as { questionId: string; label: string; isCorrect: number }[];
  const options = new Map<string, { label: string; isCorrect: number }[]>();
  for (const o of optionRows) (options.get(o.questionId) ?? options.set(o.questionId, []).get(o.questionId)!).push(o);
  const pools = new Map<string, CandidateItem[]>();
  for (const it of items) (pools.get(it.skillId) ?? pools.set(it.skillId, []).get(it.skillId)!).push({ id: it.id, skillId: it.skillId, level: it.level, a: it.a, b: it.b, c: it.c, estimatedSeconds: it.est });
  const skillsByGrade = new Map<number, string[]>();
  for (const it of items) {
    const l = skillsByGrade.get(it.grade) ?? [];
    if (!l.includes(it.skillId) && (pools.get(it.skillId)?.length ?? 0) >= 3) l.push(it.skillId);
    skillsByGrade.set(it.grade, l);
  }

  // real prerequisite graph + running mastery, so the engine can route weak students
  const prereqRows = db.prepare(`SELECT p.skillId, p.prerequisiteSkillId, p.weight, p.minimumMastery, s.name FROM "SkillPrerequisite" p JOIN "Skill" s ON s.id = p.prerequisiteSkillId`).all() as { skillId: string; prerequisiteSkillId: string; weight: number; minimumMastery: number; name: string }[];
  const prereqOf = new Map<string, typeof prereqRows>();
  for (const r of prereqRows) (prereqOf.get(r.skillId) ?? prereqOf.set(r.skillId, []).get(r.skillId)!).push(r);
  const masteryNow = new Map<string, number>(); // studentId|skillId -> score
  const insAttempt = db.prepare(`INSERT INTO "QuestionAttempt" (sessionId, studentId, questionId, skillId, response, isCorrect, responseMs, usedHint, rapidGuess, difficultyB, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insLog = db.prepare(`INSERT INTO "AdaptiveDecisionLog" (studentId, sessionId, attemptId, questionId, skillId, previousTheta, newTheta, thetaSE, questionDifficulty, responseCorrect, responseMs, masteryBefore, masteryAfter, nextQuestionId, nextTargetB, reason, reasonCode, engineVersion, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const termStart = Date.parse("2026-09-07T07:30:00Z");
  const WEEKS = 14;
  const trueTheta = new Map<string, number>();
  const finalEst: { truth: number; est: number; mastery: number }[] = [];
  const weekly = new Map<string, { week: number; theta: number; mastery: number }[]>();
  let attempts = 0;
  let sessions = 0;
  let rapid = 0;
  let prereqRoutes = 0;

  db.exec("BEGIN");
  for (const st of students) {
    const base = gauss() * 0.9;
    trueTheta.set(st.id, base);
    const skills = [...(skillsByGrade.get(st.level) ?? [])].sort(() => rand() - 0.5).slice(0, 8);
    for (const [k, skillId] of skills.entries()) {
      // two sessions per skill, weeks apart, true ability grows slowly over the term
      let state: SkillState = {
        studentId: st.id, skillId, sessionId: "", mode: "PRACTICE", ability: { theta: 0, se: 1 }, prior: { mean: 0, sd: 1 },
        history: [], previousTargetB: null, candidates: pools.get(skillId)!,
        prerequisites: (prereqOf.get(skillId) ?? []).map((p) => ({
          skillId: p.prerequisiteSkillId, name: p.name, weight: p.weight, minimumMastery: p.minimumMastery,
          mastery: masteryNow.get(`${st.id}|${p.prerequisiteSkillId}`) ?? 0,
        })),
      };
      let current: CandidateItem | null = pools.get(skillId)!.reduce((best, c) => (Math.abs(c.b) < Math.abs(best.b) ? c : best));
      let mastery = null as ReturnType<typeof processAnswer>["mastery"] | null;
      for (let s = 0; s < 2; s++) {
        const week = Math.min(WEEKS - 1, Math.floor((k / skills.length) * (WEEKS - 2)) + s * 2);
        let clock = termStart + week * 7 * 86_400_000 + Math.floor(rand() * 4) * 86_400_000 + Math.floor(rand() * 5) * 3_600_000;
        const truth = base + 0.025 * week;
        const sess = await repo.create("PracticeSession", { studentId: st.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(clock) });
        state = { ...state, sessionId: String(sess.id), history: state.history.slice(-30) };
        let qCount = 0;
        let correctCount = 0;
        if (s === 1) current = pools.get(skillId)!.find((c) => !state.history.slice(-DEFAULT_ADAPTIVE.noRepeatWindow).some((h) => h.itemId === c.id)) ?? null;
        while (current && qCount < 12) {
          const guess = rand() < 0.03;
          const correct = guess ? rand() < 0.25 : rand() < probability(truth, current, 2);
          const ms = guess ? 800 + Math.floor(rand() * 1200) : Math.floor(current.estimatedSeconds * 1000 * (0.6 + rand() * 0.9));
          const opts = options.get(current.id);
          const label = opts ? (correct ? opts.find((o) => o.isCorrect)!.label : opts.filter((o) => !o.isCorrect)[Math.floor(rand() * Math.max(1, opts.filter((o) => !o.isCorrect).length))]?.label ?? "A") : null;
          const r: ResponseEvidence = { itemId: current.id, correct, level: current.level, a: current.a, b: current.b, c: current.c, responseMs: ms, estimatedSeconds: current.estimatedSeconds, usedHint: false, at: new Date(clock).toISOString() };
          const step = processAnswer(state, r, { adaptive: DEFAULT_ADAPTIVE, mastery: DEFAULT_MASTERY }, new Date(clock), rand);
          const res = insAttempt.run(sess.id as string, st.id, current.id, skillId, JSON.stringify(label ? { label } : { value: correct }), correct ? 1 : 0, ms, 0, step.rapidGuess ? 1 : 0, current.b, new Date(clock).toISOString());
          const L = step.log;
          insLog.run(st.id, String(sess.id), Number(res.lastInsertRowid), L.questionId, skillId, L.previousTheta, L.newTheta, L.thetaSE, L.questionDifficulty, L.responseCorrect ? 1 : 0, L.responseMs, L.masteryBefore, L.masteryAfter, L.nextQuestionId, L.nextTargetB, L.reason, L.reasonCode, ENGINE_VERSION, new Date(clock).toISOString());
          if (step.xp > 0) await repo.create("XpEvent", { studentId: st.id, points: step.xp, reason: "practice", createdAt: new Date(clock) });
          attempts++;
          qCount++;
          if (correct) correctCount++;
          if (step.rapidGuess) rapid++;
          if (step.next.reasonCode === "PREREQ_ROUTE") prereqRoutes++;
          mastery = step.mastery;
          state = { ...state, ability: step.ability, history: [...state.history, r], previousTargetB: step.next.targetB };
          current = step.next.itemId ? state.candidates.find((c) => c.id === step.next.itemId) ?? null : null;
          clock += ms + 4000;
        }
        await repo.upsert("PracticeSession", { id: sess.id }, {}, { endedAt: new Date(clock), questionCount: qCount, correctCount, activeMs: clock - Number(new Date(String(sess.startedAt))) });
        sessions++;
        const wk = weekly.get(st.id) ?? [];
        wk.push({ week, theta: state.ability.theta, mastery: mastery?.score ?? 0 });
        weekly.set(st.id, wk);
      }
      await repo.upsert("StudentAbility", { studentId: st.id, scope: `SKILL:${skillId}` }, { skillId, theta: state.ability.theta, thetaSE: state.ability.se, responses: state.history.length });
      if (mastery)
        await repo.upsert("StudentSkillMastery", { studentId: st.id, skillId }, {
          score: mastery.score, band: mastery.band, attempts: state.history.length, correct: state.history.filter((h) => h.correct).length,
          maxLevelCorrect: mastery.components.maxLevelCorrect, isMastered: mastery.isMastered, lastPracticedAt: new Date(state.history.at(-1)!.at), components: mastery.components,
        });
      if (mastery) masteryNow.set(`${st.id}|${skillId}`, mastery.score);
      finalEst.push({ truth: base + 0.025 * WEEKS, est: state.ability.theta, mastery: mastery?.score ?? 0 });
    }
  }
  // weekly GLOBAL snapshots (mean of the student's skill estimates so far)
  for (const [studentId, rows] of weekly) {
    for (let w = 0; w < WEEKS; w++) {
      const sofar = rows.filter((r) => r.week <= w);
      if (!sofar.length) continue;
      const day = new Date(termStart + w * 7 * 86_400_000 + 5 * 86_400_000);
      await repo.upsert("AbilitySnapshot", { studentId, scope: "GLOBAL", takenOn: day }, {
        theta: sofar.reduce((a, r) => a + r.theta, 0) / sofar.length, mastery: sofar.reduce((a, r) => a + r.mastery, 0) / sofar.length,
      });
    }
  }
  db.exec("COMMIT");
  check("simulated a term of adaptive practice", attempts > 0, `${students.length} students, ${sessions} sessions, ${attempts} answers, ${rapid} rapid guesses detected, ${prereqRoutes} prerequisite routes`);

  // engine quality on real (small) item pools
  const corr = (xs: number[], ys: number[]) => {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const cov = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
    return cov / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0));
  };
  const rTheta = corr(finalEst.map((f) => f.truth), finalEst.map((f) => f.est));
  const rMastery = corr(finalEst.map((f) => f.truth), finalEst.map((f) => f.mastery));
  check("engine estimates track true ability on the real bank", rTheta > 0.5, `r(true θ, estimated θ) = ${rTheta.toFixed(2)}; r(true θ, mastery) = ${rMastery.toFixed(2)} (small pools: 3–10 items per skill)`);
  const logs = Number((db.prepare(`SELECT COUNT(*) n FROM "AdaptiveDecisionLog"`).get() as { n: number }).n);
  const unexplained = Number((db.prepare(`SELECT COUNT(*) n FROM "AdaptiveDecisionLog" WHERE reason IS NULL OR length(reason) < 15`).get() as { n: number }).n);
  check("every answer has a traceable, explained adaptive decision", logs === attempts && unexplained === 0, `${logs} decision-log rows`);
  const reasons = db.prepare(`SELECT reasonCode, COUNT(*) n FROM "AdaptiveDecisionLog" GROUP BY reasonCode ORDER BY n DESC`).all() as { reasonCode: string; n: number }[];

  // ---------------- 6. rollups + scale + queries
  const from = "2026-09-01T00:00:00.000Z";
  const to = "2027-01-01T00:00:00.000Z";
  db.prepare(studentDailyRollupSql("sqlite")).run(from, to);
  db.prepare(classSkillDailyRollupSql("sqlite")).run(from, to);
  const sda = Number((db.prepare(`SELECT COUNT(*) n FROM "StudentDailyActivity"`).get() as { n: number }).n);
  const sdaQ = Number((db.prepare(`SELECT SUM(questions) n FROM "StudentDailyActivity"`).get() as { n: number }).n);
  db.prepare(studentDailyRollupSql("sqlite")).run(from, to);
  const sdaQ2 = Number((db.prepare(`SELECT SUM(questions) n FROM "StudentDailyActivity"`).get() as { n: number }).n);
  check("daily rollups match raw attempts and are safe to re-run", sdaQ === attempts && sdaQ2 === attempts, `${sda} student-day rows, ${Number((db.prepare(`SELECT COUNT(*) n FROM "ClassSkillDaily"`).get() as { n: number }).n)} class-skill-day rows`);

  if (SCALE > 0) {
    // SYNTHETIC rows (verification DB only) to time queries at roughly a year's volume
    const src = db.prepare(`SELECT sessionId, studentId, questionId, skillId, response, isCorrect, responseMs, difficultyB FROM "QuestionAttempt"`).all() as Record<string, unknown>[];
    const ins = db.prepare(`INSERT INTO "QuestionAttempt" (sessionId, studentId, questionId, skillId, response, isCorrect, responseMs, usedHint, rapidGuess, difficultyB, createdAt) VALUES (?,?,?,?,?,?,?,0,0,?,?)`);
    db.exec("BEGIN");
    for (let i = 0; i < SCALE; i++) {
      const r = src[i % src.length];
      ins.run(r.sessionId as string, r.studentId as string, r.questionId as string, r.skillId as string, r.response as string, r.isCorrect as number, r.responseMs as number, r.difficultyB as number, new Date(Date.parse("2026-01-10T08:00:00Z") + (i % 230) * 86_400_000).toISOString());
    }
    db.exec("COMMIT");
    db.exec("ANALYZE");
  }
  const totalAttempts = Number((db.prepare(`SELECT COUNT(*) n FROM "QuestionAttempt"`).get() as { n: number }).n);

  const klass = db.prepare(`SELECT c.id FROM "Class" c WHERE c.schoolId = ? LIMIT 1`).get(school.id) as { id: string };
  const someStudent = students[0].id;
  const someSkill = (db.prepare(`SELECT skillId FROM "QuestionAttempt" GROUP BY skillId ORDER BY COUNT(*) DESC LIMIT 1`).get() as { skillId: string }).skillId;
  const someQuestion = (db.prepare(`SELECT questionId FROM "QuestionAttempt" WHERE skillId = ? LIMIT 1`).get(someSkill) as { questionId: string }).questionId;
  const params: Record<string, unknown[]> = {
    "01_class_overview.sql": ["2026-09-01", "2026-12-31", klass.id],
    "02_class_mastery_distribution.sql": [klass.id],
    "03_intervention_candidates.sql": ["2026-09-01T00:00:00.000Z", klass.id],
    "04_item_analysis.sql": [someSkill],
    "05_distractor_counts.sql": [someQuestion],
    "06_student_growth.sql": [someStudent],
    "07_adaptive_audit_trail.sql": [someStudent],
    "08_weak_standards.sql": ["2026-09-01T00:00:00.000Z", klass.id],
    "09_school_kpis.sql": [school.id, school.id, school.id, "2026-09-01"],
  };
  const qDir = join(ROOT, "database/sql/analytics");
  const queryRows: string[] = [];
  let slow = 0;
  let fullScans = 0;
  for (const f of readdirSync(qDir).sort()) {
    const sql = readFileSync(join(qDir, f), "utf8");
    const stmt = db.prepare(sql);
    const p = (params[f] ?? []) as never[];
    stmt.all(...p); // warm
    const runs = 5;
    const start = performance.now();
    let rows = 0;
    for (let i = 0; i < runs; i++) rows = stmt.all(...p).length;
    const ms = (performance.now() - start) / runs;
    const plan = (db.prepare("EXPLAIN QUERY PLAN " + sql).all(...p) as { detail: string }[]).map((r) => r.detail);
    const scansAttempts = plan.some((d) => /^SCAN (a|QuestionAttempt)\b/.test(d) && !/USING (COVERING )?INDEX/.test(d));
    if (scansAttempts) fullScans++;
    if (ms > 250) slow++;
    queryRows.push(`| ${f} | ${rows} | ${ms.toFixed(1)} | ${scansAttempts ? "**full scan of QuestionAttempt**" : "indexed"} |`);
    console.log(`  ${f.padEnd(36)} ${ms.toFixed(1).padStart(7)} ms  rows=${rows}  ${scansAttempts ? "FULL SCAN" : "indexed"}`);
  }
  check("no dashboard query full-scans QuestionAttempt", fullScans === 0, `${totalAttempts.toLocaleString()} attempt rows`);
  check("every dashboard query runs under 250 ms", slow === 0);

  // ---------------- integrity
  const fk = db.prepare("PRAGMA foreign_key_check").all();
  const integ = (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
  check("foreign keys: no orphan rows", fk.length === 0, `${fk.length} violations`);
  check("database integrity check", integ === "ok");

  // ---------------- report
  const final = counts();
  const failed = checks.filter((c) => !c.ok);
  const report = `# Phase 2 — database verification report

Generated by \`scripts/db/verify.ts\` on ${new Date().toISOString().slice(0, 10)} (engine ${ENGINE_VERSION}).
Database: SQLite ${String((db.prepare("select sqlite_version() v").get() as { v: string }).v)} built from the DDL generated from \`prisma/schema.prisma\`
(same tables, keys, unique constraints and foreign keys as the MySQL schema). Runtime: ${((Date.now() - t0) / 1000).toFixed(1)} s.

**Result: ${failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`}** (${checks.length - failed.length}/${checks.length})

## Checks

| Check | Result | Detail |
|---|---|---|
${checks.map((c) => `| ${c.name} | ${c.ok ? "✅ pass" : "❌ fail"} | ${c.detail.replace(/\|/g, "/")} |`).join("\n")}

## Dashboard query benchmark (${totalAttempts.toLocaleString()} QuestionAttempt rows; includes ${SCALE.toLocaleString()} synthetic rows)

| Query | Rows | Avg ms (5 runs) | Plan on QuestionAttempt |
|---|---|---|---|
${queryRows.join("\n")}

## Adaptive decisions by reason (simulation)

| Reason code | Decisions |
|---|---|
${reasons.map((r) => `| ${r.reasonCode} | ${r.n} |`).join("\n")}

## Row counts after seeding and simulation

| Table | Rows |
|---|---|
${Object.entries(final).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([t, n]) => `| ${t} | ${n.toLocaleString()} |`).join("\n")}

> The demo school, its students and all simulated answers exist only in this verification database.
> Synthetic rows used for timing are copies of simulated answers spread over the year.
`;
  writeFileSync(join(outDir, "REPORT.md"), report);
  db.close();
  console.log(`\n${failed.length === 0 ? "ALL CHECKS PASSED" : "FAILED"} — report: database/verify/REPORT.md`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
