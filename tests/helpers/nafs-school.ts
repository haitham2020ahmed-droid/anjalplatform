/**
 * 🇸🇦 r78 NAFS speed fixture (fictional demo school, in-memory SQLite only — never a real database or real students):
 * the speed-test school (3 classes per grade × 25 students, the full question bank, 3 ms per database call) plus a
 * realistic NAFS center for the Grade 6 teacher: the Ministry model booklets and the NAFS practice sets loaded into
 * the bank, several NAFS tests handed in by every student of the class (and the other Grade 6 classes), and adaptive
 * practices with runs and answers. Used by tests/r78-nafs-speed.test.ts.
 */
import { bench, type Bench } from "./route-bench";
import { createSession } from "../../src/server/auth/sessions";
import { DEFAULT_AUTH } from "../../src/server/auth/config";
import type { Actor } from "../../src/server/auth/rbac";
import { ensureNafsFramework } from "../../src/server/nafs/framework";
import { loadNafsBooklets } from "../../src/server/nafs/booklets";
import { loadNafsPracticeSets } from "../../src/server/nafs/practice-sets";
import { nafsBankChanged, nafsIndex, usable } from "../../src/server/nafs/bank";
import { nafsClasses, saveNafsTest } from "../../src/server/nafs/tests";
import { createNafsPractice, newRunState } from "../../src/server/nafs/practice";

export interface NafsSchool { b: Bench; g6: Actor; cookie: Record<string, string>; classId: string; studentIds: string[]; tests: string[]; practices: string[] }

const DAY = 86_400_000;

export async function nafsSchool(): Promise<NafsSchool> {
  const b = await bench();
  const repo = b.S.repo;
  const g6 = await b.S.actorFor("demo.teacher.6a");
  const u = (await repo.findUnique("User", { id: g6.userId }))!;
  const { token } = await createSession(repo, u, { ...DEFAULT_AUTH, sessionTtlMinutes: 24 * 60, idleMinutes: 24 * 60 });
  const cookie = { ela_session: token };
  await ensureNafsFramework(repo);
  await loadNafsBooklets(repo, g6.schoolId!, g6.userId);
  await loadNafsPracticeSets(repo, g6.schoolId!, g6.userId);
  nafsBankChanged(repo, g6.schoolId!);
  const pool = (await nafsIndex(repo, g6.schoolId!)).filter((e) => usable(e) && e.kind === "MCQ" && e.standard);
  const classes = await nafsClasses(repo, g6);
  const klass = classes[0];
  const start = Date.UTC(2026, 8, 1);
  // 4 NAFS tests of 20 questions, handed in by every student of the teacher's Grade 6 class(es)
  const tests: string[] = [];
  for (let k = 0; k < 4; k++) {
    const ids = pool.slice(k * 20, k * 20 + 20).map((e) => e.id);
    const id = await saveNafsTest(repo, g6, { title: `Fixture NAFS test ${k + 1}`, mode: "MANUAL", questionIds: ids, timeLimitMin: 40 });
    tests.push(id);
    const at = new Date(start + k * 10 * DAY);
    for (const c of classes) {
      await repo.create("NafsTestClass", { testId: id, classId: c.id, openAt: at, createdById: g6.userId, createdAt: at });
      await repo.createMany("NafsResult", c.students.map((st, i) => {
        const answers = ids.map((_q, j) => ((i + j + k) % 3 === 0 ? 0 : (i + j) % 4));
        return { testId: id, classId: c.id, studentId: st.id, source: "ONLINE", answers, correct: 0, points: 0, maxPoints: ids.length, submittedAt: at, updatedAt: at };
      }));
    }
  }
  // 3 adaptive practices on weak standards with runs and 12 answers per student
  const codes = [...new Set(pool.map((e) => e.standard!))].slice(0, 6);
  const practices: string[] = [];
  for (let k = 0; k < 3; k++) {
    const targets = codes.slice(k * 2, k * 2 + 2);
    const p = await createNafsPractice(repo, g6, { title: `Fixture practice ${k + 1}`, targets, classId: klass.id });
    practices.push(p.id);
    const at = new Date(start + (5 + k * 10) * DAY);
    const qs = pool.filter((e) => targets.includes(e.standard!));
    for (const [i, st] of klass.students.entries()) {
      const run = await repo.create("NafsPracticeRun", { practiceId: p.id, studentId: st.id, classId: klass.id, state: newRunState(targets), asked: 12, correct: 7, seconds: 600, startedAt: at, updatedAt: at, finishedAt: at });
      await repo.createMany("NafsPracticeAnswer", Array.from({ length: 12 }, (_x, j) => ({ runId: run.id, practiceId: p.id, studentId: st.id, questionId: qs[(i + j) % qs.length].id, target: targets[j % targets.length], difficulty: (j % 3) + 1, choice: j % 4, correct: (i + j) % 3 !== 0, ms: 20_000, at: new Date(at.getTime() + j * 60_000) })));
    }
  }
  return { b, g6, cookie, classId: klass.id, studentIds: klass.students.map((x) => x.id), tests, practices };
}
