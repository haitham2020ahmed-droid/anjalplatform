/**
 * 🏫 A large synthetic school for the background-job memory tests (r68): ≥ 3,000 students, ≥ 20,000 questions and
 * ≥ 300,000 answers in the in-memory SQLite test database (never a real database or real students), written with raw
 * prepared statements (seconds). Each student practised 2 skills of their grade (50 answers each) and has the engine's
 * mastery rows; `copies` questions are old teacher copies (TCOPY- with tags.teacherCopyOf, not private yet).
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";
import { addBigBank } from "./big-bank";
import { demoDatabase } from "./db";

const id = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
const s = (v: unknown) => String(v ?? "");

export interface BigSchool { db: DatabaseSync; repo: SqliteRepo; schoolId: string; students: number; questions: number; answers: number; copies: number; teacherUserId: string }

export async function bigSchool(opts: { students?: number; questions?: number; answersPerSkill?: number; copies?: number } = {}): Promise<BigSchool> {
  const nStudents = opts.students ?? 3000, nQuestions = opts.questions ?? 20_000, per = opts.answersPerSkill ?? 50, nCopies = opts.copies ?? 400;
  const { db, repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
  await addBigBank(db, repo, { n: nQuestions });
  const school = (await repo.findMany("School", {}, { select: ["id"] }))[0];
  const schoolId = s(school.id);
  const teacher = (await repo.findMany("User", { role: "TEACHER" }, { select: ["id"] }))[0];
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  // the skills of each grade with their (published) questions
  const byGrade = new Map<string, { skillId: string; questions: string[] }[]>();
  for (const g of grades) {
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] }))[0];
    if (!cur) continue;
    const list: { skillId: string; questions: string[] }[] = [];
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id"] })) {
      const qs = (await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED" }, { select: ["id"], take: per })).map((q) => s(q.id));
      if (qs.length >= 10) list.push({ skillId: s(k.id), questions: qs });
      if (list.length >= 12) break;
    }
    if (list.length >= 2) byGrade.set(s(g.id), list);
  }
  const gradeIds = [...byGrade.keys()];
  const now = new Date(Date.UTC(2026, 8, 1)).toISOString();
  const u = db.prepare(`INSERT INTO "User" ("id","username","displayName","role","schoolId","isActive","sessionVersion","mustChangePassword","failedLogins","createdAt","updatedAt") VALUES (?,?,?,?,?,1,0,0,0,?,?)`);
  const st = db.prepare(`INSERT INTO "Student" ("id","userId","schoolId","gradeId","studentNumber","createdAt") VALUES (?,?,?,?,?,?)`);
  const se = db.prepare(`INSERT INTO "PracticeSession" ("id","studentId","skillId","mode","startedAt","questionCount","correctCount","activeMs") VALUES (?,?,?,?,?,?,?,?)`);
  const at = db.prepare(`INSERT INTO "QuestionAttempt" ("sessionId","studentId","questionId","skillId","response","isCorrect","responseMs","usedHint","rapidGuess","difficultyB","createdAt") VALUES (?,?,?,?,?,?,?,0,0,0,?)`);
  const ms = db.prepare(`INSERT INTO "StudentSkillMastery" ("studentId","skillId","score","band","attempts","correct","maxLevelCorrect","isMastered","lastPracticedAt","updatedAt") VALUES (?,?,?,?,?,?,0,?,?,?)`);
  let answers = 0;
  db.exec("BEGIN");
  try {
    for (let i = 0; i < nStudents; i++) {
      const uid = id(), sid = id(), gradeId = gradeIds[i % gradeIds.length];
      u.run(uid, `big.s${i}`, `Student ${i}`, "STUDENT", schoolId, now, now);
      st.run(sid, uid, schoolId, gradeId, `B${i}`, now);
      const skills = byGrade.get(gradeId)!;
      for (let k = 0; k < 2; k++) {
        const sk = skills[(i + k * 5) % skills.length];
        const sess = id();
        const n = per; // a question may be answered again in a later sitting
        let right = 0;
        for (let j = 0; j < n; j++) if ((i + j) % 4 !== 0) right++;
        se.run(sess, sid, sk.skillId, "ADAPTIVE_PRACTICE", now, n, right, n * 30_000);
        for (let j = 0; j < n; j++) {
          at.run(sess, sid, sk.questions[j % sk.questions.length], sk.skillId, "{}", (i + j) % 4 !== 0 ? 1 : 0, 30_000, new Date(Date.UTC(2026, 8, 1) + (i * 100 + j) * 60_000).toISOString());
          answers++;
        }
        const score = Math.round((100 * right) / Math.max(1, n));
        ms.run(sid, sk.skillId, score, score >= 85 ? "MASTERED" : "DEVELOPING", n, right, score >= 85 && n >= 30 ? 1 : 0, now, now);
      }
    }
    // old teacher copies (before the private-copy rule): TCOPY- references with tags.teacherCopyOf, no owner yet
    const pick = db.prepare(`SELECT "id" FROM "Question" WHERE "externalRef" LIKE 'BIG-%' ORDER BY "id" LIMIT ?`).all(nCopies) as { id: string }[];
    const up = db.prepare(`UPDATE "Question" SET "externalRef" = ?, "tags" = ?, "createdById" = ?, "privateToId" = NULL WHERE "id" = ?`);
    pick.forEach((q, i) => up.run(`TCOPY-${i}-${q.id.slice(-6)}`, JSON.stringify({ teacherCopyOf: q.id }), s(teacher?.id), q.id));
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  const questions = (db.prepare(`SELECT COUNT(*) AS n FROM "Question"`).get() as { n: number }).n;
  return { db, repo, schoolId, students: nStudents, questions, answers, copies: nCopies, teacherUserId: s(teacher?.id) };
}
