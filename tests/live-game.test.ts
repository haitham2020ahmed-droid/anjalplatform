import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { answerGame, createGame, gameSkills, hostAction, hostView, joinGame, openGamesFor, playerView, pointsFor } from "../src/server/game/live";
import { loadQuestionItems } from "../src/server/practice/items";
import { qrMatrix } from "../src/lib/qr";
import { demoDatabase } from "./helpers/db";

describe("🎮 live games", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let a: Actor; let b: Actor; let outsider: Actor;
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  const right = async (gameId: string, ix: number, wrong = false) => {
    const g = (await repo.findUnique("LiveGame", { id: gameId }))!;
    const qid = (typeof g.questionIds === "string" ? JSON.parse(g.questionIds) : g.questionIds)[ix];
    const it = (await loadQuestionItems(repo, [qid]))[0];
    if (it.type === "TRUE_FALSE") return String(wrong ? !it.answer : it.answer);
    return it.options!.find((o) => (wrong ? !o.correct : o.correct))!.label;
  };
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    [a, b] = await Promise.all([studentActor(r[0].students[0].id), studentActor(r[0].students[1].id)]);
    // a student of the same school who is not in this class
    const inClass = new Set(r[0].students.map((x) => x.id));
    const sameSchool = await repo.findMany("Student", { schoolId: teacher.schoolId! });
    outsider = await studentActor(String(sameSchool.find((x) => !inClass.has(String(x.id)))!.id));
  });

  test("points: correctness first, speed second, streak bonus", () => {
    assert.equal(pointsFor(true, 0, 20000, 0), 1000);
    assert.equal(pointsFor(true, 20000, 20000, 0), 500);
    assert.equal(pointsFor(true, 10000, 20000, 2), 950);
    assert.equal(pointsFor(true, 0, 20000, 9), 1500, "streak bonus capped at +500");
    assert.equal(pointsFor(false, 0, 20000, 4), 0);
  });

  test("a whole game: join, start, answer, reveal, time up, podium", async () => {
    const skills = (await gameSkills(repo, teacher, 4)).slice(0, 3);
    assert.ok(skills.length && skills.every((k) => k.questions > 0));
    const g = await createGame(repo, teacher, { title: "Friday quiz", skillIds: skills.map((k) => k.id), classId, count: 3, seconds: 20 });
    assert.match(g.code, /^\d{6}$/);
    assert.ok(qrMatrix(`https://anjalplatform.onrender.com/play/${g.code}`).length >= 21);
    assert.deepEqual((await openGamesFor(repo, a)).map((x) => x.code), [g.code], "the student sees the open game");
    await assert.rejects(hostAction(repo, teacher, g.id, "start"), /at least one student/);
    await assert.rejects(joinGame(repo, a, "000000"), /No game with this code/);
    await assert.rejects(joinGame(repo, outsider, g.code), ForbiddenError, "a class game: other classes cannot join");
    assert.equal(await joinGame(repo, a, g.code), g.id);
    await joinGame(repo, a, g.code);  // joining twice is harmless
    await joinGame(repo, b, ` ${g.code.slice(0, 3)} ${g.code.slice(3)} `);
    assert.equal((await hostView(repo, teacher, g.id)).players.length, 2);
    await assert.rejects(hostView(repo, a, g.id), ForbiddenError, "students do not see the host screen");

    const t0 = new Date();
    await hostAction(repo, teacher, g.id, "start", t0);
    const pv = await playerView(repo, a, g.id, t0);
    assert.equal(pv.status, "QUESTION");
    assert.ok(pv.question!.options.every((o) => o.correct === undefined), "players never get the answer key");
    const ra = await answerGame(repo, a, g.id, 0, await right(g.id, 0), new Date(t0.getTime() + 2000));
    assert.equal(ra.correct, true); assert.equal(ra.points, 950);
    await assert.rejects(answerGame(repo, a, g.id, 0, await right(g.id, 0), new Date(t0.getTime() + 3000)), /already answered/);
    await answerGame(repo, b, g.id, 0, await right(g.id, 0, true), new Date(t0.getTime() + 3000));
    const hv = await hostView(repo, teacher, g.id, new Date(t0.getTime() + 4000));
    assert.equal(hv.status, "REVEAL", "everyone answered: the answer shows by itself");
    assert.equal(hv.question!.options.reduce((n, o) => n + (o.picks ?? 0), 0), 2);
    assert.deepEqual(hv.leaderboard.map((x) => x.score), [950, 0]);

    const t1 = new Date(t0.getTime() + 10000);
    await hostAction(repo, teacher, g.id, "next", t1);
    const late = new Date(t1.getTime() + 25000);
    await assert.rejects(answerGame(repo, b, g.id, 1, await right(g.id, 1), late), /Time is up|closed/);
    assert.equal((await playerView(repo, b, g.id, late)).status, "REVEAL", "time up: the answer shows by itself");
    await hostAction(repo, teacher, g.id, "next", late);
    await answerGame(repo, a, g.id, 2, await right(g.id, 2), new Date(late.getTime() + 1000));
    await hostAction(repo, teacher, g.id, "reveal");
    await hostAction(repo, teacher, g.id, "next");
    const fin = await playerView(repo, a, g.id);
    assert.equal(fin.status, "FINISHED");
    assert.deepEqual([fin.rank, fin.podium[0].nickname === (await hostView(repo, teacher, g.id)).leaderboard[0].nickname], [1, true]);
    assert.ok(fin.score > 1900, "two correct answers, the second with a streak bonus");
    assert.deepEqual(await openGamesFor(repo, a), [], "finished games are not open any more");
  });
});
