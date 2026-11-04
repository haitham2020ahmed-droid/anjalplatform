/**
 * 📊 Practice and time on the shared skill system (owner, 31 Oct 2026): one row per skill (every copy of a skill is
 * one row with the Student Skills name), NAFS practice counted, the hidden Curriculum Map holder skill shown apart.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { practiceAnalytics } from "../src/server/analytics/practice";
import { clearSkillKeys, skillKeyIndex } from "../src/server/skills/status";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("📊 Practice and time — shared skills, NAFS, unlinked questions", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let ids: string[]; let copies: string[]; let key: string; let hiddenId: string;
  const range = () => ({ classId, from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T23:59:59Z") });
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    const schoolId = s((await repo.findUnique("Student", { id: ids[0] }))!.schoolId);
    // a key with two skill rows that both have published questions (e.g. the Grade 4 and Grade 5 copy)
    const ix = await skillKeyIndex(repo, schoolId);
    const qs = await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["id", "skillId"] });
    const withQ = new Set(qs.map((q) => s(q.skillId)));
    const pick = [...ix.skillsOf].find(([k, list]) => k.startsWith("fam:") && list.filter((id) => withQ.has(id)).length >= 2)!;
    key = pick[0]; copies = pick[1].filter((id) => withQ.has(id)).slice(0, 2);
    const qOf = (sk: string) => qs.find((q) => s(q.skillId) === sk)!;
    const answer = async (sid: string, sk: string, at: string, ok: boolean) => {
      const ses = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(at) });
      await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: qOf(sk).id, skillId: sk, response: {}, isCorrect: ok, responseMs: 30_000, difficultyB: 0, createdAt: new Date(at) });
    };
    await answer(ids[0], copies[0], "2026-10-04T06:00:00Z", true);
    await answer(ids[1], copies[1], "2026-10-04T06:10:00Z", false);
    // NAFS practice on the first copy's question
    await repo.create("NafsPracticeAnswer", { runId: "run-1", practiceId: "p-1", studentId: ids[2], questionId: qOf(copies[0]).id, target: "T1", difficulty: 1, correct: true, ms: 40_000, at: new Date("2026-10-05T07:00:00Z") });
    // the hidden Curriculum Map holder skill (map questions not linked to a skill yet)
    const real = (await repo.findUnique("Skill", { id: copies[0] }))!;
    const hidden = await repo.create("Skill", { curriculumId: real.curriculumId, familyId: real.familyId, code: "G4.curriculum-map-unclassified", name: "Curriculum Map questions", domain: real.domain, category: real.category });
    hiddenId = s(hidden.id);
    clearSkillKeys(repo);
    const hq = await repo.create("Question", { ...Object.fromEntries(Object.entries((await repo.findUnique("Question", { id: qOf(copies[0]).id }))!).filter(([k]) => k !== "id")), skillId: hiddenId });
    const ses = await repo.create("PracticeSession", { studentId: ids[3], mode: "ADAPTIVE_PRACTICE", startedAt: new Date("2026-10-05T08:00:00Z") });
    await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[3], questionId: hq.id, skillId: hiddenId, response: {}, isCorrect: true, responseMs: 30_000, difficultyB: 0, createdAt: new Date("2026-10-05T08:00:00Z") });
  });

  test("two copies of one skill are ONE row, with the shared name", async () => {
    const a = await practiceAnalytics(repo, teacher, range());
    const rows = a.skills.filter((k) => k.key === key);
    assert.equal(rows.length, 1, "one row for the key");
    assert.equal(rows[0].questions, 3, "both copies + the NAFS answer");
    assert.equal(rows[0].students, 3);
    assert.ok(!a.skills.some((k) => copies.includes(k.key)), "never keyed by a raw skill id");
  });

  test("NAFS practice is counted and labelled", async () => {
    const a = await practiceAnalytics(repo, teacher, range());
    assert.equal(a.sources.find((x) => x.source === "NAFS")!.questions, 1);
    assert.equal(a.skills.find((k) => k.key === key)!.bySource.NAFS, 1);
    const st = a.students.find((x) => x.id === ids[2])!;
    assert.equal(st.questions, 1, "a student who only did NAFS practice is active");
  });

  test("the hidden holder skill is never a skill row: it is the unlinked line", async () => {
    const a = await practiceAnalytics(repo, teacher, range());
    assert.ok(!a.skills.some((k) => k.skillId === hiddenId));
    assert.deepEqual(a.unlinked, { questions: 1, students: 1 });
  });
});

describe("🧾 Practice and time summary (pure)", async () => {
  const { practiceSummary, practiceWeakSkill, R } = await import("../src/lib/report-summaries");
  const base = {
    classId: "c1", unlinked: { questions: 0 },
    totals: { questions: 100, accuracy: 72, minutes: 95, activeStudents: 3, students: 4, schoolQuestions: 60 },
    students: [
      { id: "a", name: "Ali", questions: 50, accuracy: 85, unreliable: 0, newStars: 2 },
      { id: "b", name: "Sara", questions: 30, accuracy: 55, unreliable: 1, newStars: 0 },
      { id: "c", name: "Omar", questions: 20, accuracy: 70, unreliable: 0, newStars: 1 },
      { id: "d", name: "Huda", questions: 0, accuracy: null, unreliable: 0, newStars: 0 },
    ],
    skills: [{ key: "fam:main-idea", skillId: "s1", name: "Main Idea", questions: 40, accuracy: 45 }, { key: "fam:theme", skillId: "s2", name: "Theme", questions: 60, accuracy: 90 }],
  };
  const o = { skillsHref: (k?: string) => `/grid${k ? `#${k}` : ""}`, attentionHref: "/na" };
  test("overview, stars, who needs help, school share, the next step and its buttons", () => {
    const sm = practiceSummary(base, o);
    assert.deepEqual(sm.lines[0], { key: R.ptOverview, tone: "info", vars: { n: 3, total: 4, q: 100, time: "1h 35m", acc: 72 } });
    assert.deepEqual(sm.lines[1].vars, { n: 3, names: "Ali, Omar" });
    assert.ok(sm.lines.some((l) => l.key === R.ptIdle && l.vars?.names === "Huda"));
    assert.equal(sm.lines.at(-1)!.key, R.ptNextReteach);
    assert.equal(sm.actions[0].href, "/grid#fam:main-idea");
    assert.ok(sm.actions.some((a) => a.href === "/na"));
  });
  test("a weak skill needs 5+ answers and under 60%", () => {
    assert.equal(practiceWeakSkill([{ key: "k", skillId: "s", name: "X", questions: 4, accuracy: 10 }]), null);
    assert.equal(practiceWeakSkill(base.skills)!.name, "Main Idea");
  });
  test("no practice: the empty summary", () => {
    const sm = practiceSummary({ ...base, totals: { ...base.totals, questions: 0 } }, o);
    assert.equal(sm.lines[0].key, R.ptNone);
  });
});
