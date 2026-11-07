/**
 * Practice and time · the IXL gaps (Nov 2026): every day of the range (empty days as 0, weeks over 92 days), the
 * session's clock time / minutes / accuracy, the quick ranges (today, yesterday, this week), the mastery % at the
 * start and end of the range ("improved in N skills"), and the answers by area (Reading, Grammar, …).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { fillDays, practiceAnalytics, riyadhMinute, scoreSpan, sortStudentUse, type StudentUse } from "../src/server/analytics/practice";
import { quickRange, resolvePeriod } from "../src/analytics/periods";
import { AreaDonut, DayBars } from "../src/components/analytics/practice-charts";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoDatabase } from "./helpers/db";

const day = (d: string, q = 0) => ({ day: d, questions: q, school: q, home: 0, minutes: q });

describe("Practice and time · pure rules", () => {
  test("every day of the range is listed, the empty ones as 0", () => {
    const r = fillDays([day("2026-10-06", 4)], Date.parse("2026-10-04T00:00:00Z") - 3 * 3_600_000, Date.parse("2026-10-08T23:59:59Z") - 3 * 3_600_000, Date.parse("2026-11-01T00:00:00Z"));
    assert.equal(r.unit, "day");
    assert.deepEqual(r.days.map((d) => [d.day, d.questions]), [["2026-10-04", 0], ["2026-10-05", 0], ["2026-10-06", 4], ["2026-10-07", 0], ["2026-10-08", 0]]);
  });

  test("never past today, but a later day with answers is kept", () => {
    const now = Date.parse("2026-10-05T09:00:00Z");
    const r = fillDays([], Date.parse("2026-10-03T21:00:00Z"), Date.parse("2026-10-10T20:59:59Z"), now);
    assert.deepEqual(r.days.map((d) => d.day), ["2026-10-04", "2026-10-05"]);
    const k = fillDays([day("2026-10-07", 2)], Date.parse("2026-10-03T21:00:00Z"), Date.parse("2026-10-10T20:59:59Z"), now);
    assert.equal(k.days[k.days.length - 1].day, "2026-10-07");
  });

  test("a range over 92 days is drawn by week (Sunday to Saturday), the numbers unchanged", () => {
    const used = [day("2026-09-01", 3), day("2026-09-02", 2), day("2026-11-01", 5)];
    const r = fillDays(used, Date.parse("2026-08-23T00:00:00Z") - 3 * 3_600_000, Date.parse("2026-12-31T00:00:00Z"), Date.parse("2026-12-01T12:00:00Z"));
    assert.equal(r.unit, "week");
    for (const w of r.days) assert.equal(new Date(`${w.day}T00:00:00Z`).getUTCDay(), 0, `${w.day} is a Sunday`);
    assert.equal(r.days.reduce((x, w) => x + w.questions, 0), 10);
    assert.equal(r.days.find((w) => w.day === "2026-08-30")!.questions, 5, "Tue 1 + Wed 2 Sep are in the week of Sun 30 Aug");
    assert.equal(r.days.find((w) => w.day === "2026-11-01")!.questions, 5);
  });

  test("the score at the start and end of the range comes from the first 'before' and the last 'after'", () => {
    assert.equal(scoreSpan([]), null);
    assert.deepEqual(scoreSpan([{ at: 3, before: 50, after: 62.4 }, { at: 1, before: null, after: 20 }, { at: 2, before: 20, after: 50 }]), { from: 0, to: 62 });
    assert.deepEqual(scoreSpan([{ at: 1, before: 70, after: 64 }]), { from: 70, to: 64 }, "a drop is kept as a drop");
  });

  test("quick ranges: today, yesterday, this week from Sunday", () => {
    const now = new Date("2026-11-04T10:00:00Z"); // a Wednesday
    const iso = (x: { from: Date; to: Date }) => [x.from.toISOString().slice(0, 10), x.to.toISOString().slice(0, 10)];
    assert.deepEqual(iso(quickRange("TODAY", now)), ["2026-11-04", "2026-11-04"]);
    assert.deepEqual(iso(quickRange("YESTERDAY", now)), ["2026-11-03", "2026-11-03"]);
    assert.deepEqual(iso(quickRange("THIS_WEEK", now)), ["2026-11-01", "2026-11-04"]);
    assert.deepEqual(iso(quickRange("THIS_WEEK", new Date("2026-11-01T08:00:00Z"))), ["2026-11-01", "2026-11-01"], "on Sunday the week is one day");
    const p = resolvePeriod("CUSTOM", { year: null, terms: [] }, now, quickRange("TODAY", now));
    assert.equal(p.to.getTime() - p.from.getTime(), 86_400_000 - 1, "the whole day");
  });

  test("Riyadh clock minutes", () => assert.equal(riyadhMinute("2026-10-04T14:38:00Z"), 17 * 60 + 38));

  test("the student list: sort by name, lowest accuracy (no answers last), most improved", () => {
    const st = (name: string, questions: number, accuracy: number | null, improved: number): StudentUse => ({ id: name, name, questions, minutes: questions, accuracy, skills: 1, effort: null, unreliable: 0, stars: { mastered: 0, inProgress: 0, needsReview: 0, notStarted: 0 }, newStars: 0, improved, schoolPct: null, lastActive: null, detail: [] });
    const list = [st("Omar", 40, 90, 1), st("Ali", 10, 50, 3), st("Zaid", 0, null, 0)];
    assert.deepEqual(sortStudentUse(list, "questions").map((x) => x.name), ["Omar", "Ali", "Zaid"]);
    assert.deepEqual(sortStudentUse(list, "name").map((x) => x.name), ["Ali", "Omar", "Zaid"]);
    assert.deepEqual(sortStudentUse(list, "accuracy").map((x) => x.name), ["Ali", "Omar", "Zaid"]);
    assert.deepEqual(sortStudentUse(list, "improved").map((x) => x.name), ["Ali", "Omar", "Zaid"]);
  });
});

describe("Practice and time · the charts and the words", () => {
  const h = React.createElement;
  // the chart file is compiled with the classic JSX transform here (as tests/helpers/page-render.ts does)
  (globalThis as Record<string, unknown>).React ??= React;
  test("By day: an empty school day is an empty slot with a grey mark, counted under the chart", () => {
    // Sun 4 Oct: 6 answers · Mon 5, Tue 6: nothing · Fri 9, Sat 10: weekend, nothing
    const days = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map((d, i) => ({ day: d, questions: [6, 0, 0, 2, 1, 0, 0][i], school: [6, 0, 0, 2, 1, 0, 0][i], home: 0, minutes: 1 }));
    const html = renderToStaticMarkup(h(DayBars, { days }));
    assert.equal((html.match(/data-day=/g) ?? []).length, 7, "every day is a slot");
    assert.match(html, /data-day="2026-10-05" data-questions="0"/);
    assert.match(html, /data-empty-days="2"/, "Mon and Tue — the weekend is not counted");
    assert.match(renderToStaticMarkup(h(DayBars, { days: days.map((d) => ({ ...d, questions: 0, school: 0 })) })), /No practice in this range/);
    assert.match(renderToStaticMarkup(h(DayBars, { days: [days[0]], unit: "week" })), /Week of 2026-10-04/);
  });

  test("By area: one slice per area with its share and number of skills", () => {
    const html = renderToStaticMarkup(h(AreaDonut, { areas: [{ domain: "GRAMMAR", label: "Grammar", questions: 30, skills: 3 }, { domain: "READING", label: "Reading", questions: 10, skills: 1 }] }));
    assert.match(html, /Grammar/); assert.match(html, /75%/); assert.match(html, /3 skills/); assert.match(html, /1 skill/);
  });

  test("every new word is in the word list with Arabic", () => {
    const words = ["Most questions", "Lowest accuracy", "Most time", "Most improved", "AM", "PM", "Friday", "Saturday", "By week", "By area", "Sort by", "📈 {n} improved", "Score: start → end", "{n} school days without practice", "No practice that day", "Questions per area", "Punctuation & capitals", "Spelling & word study"];
    for (const w of words) { assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok((ar as Record<string, string>)[w], w); }
    // the page uses them
    const page = readFileSync(join(process.cwd(), "src/app/teacher/practice-analytics/page.tsx"), "utf8");
    for (const w of ["Score: start → end", "By area", "Sort by", "Find a student"]) assert.ok(page.includes(`"${w}"`), w);
    for (const k of ["TODAY", "YESTERDAY", "THIS_WEEK"]) assert.ok(page.includes(`"${k}"`), k);
  });
});

describe("Practice and time · sessions, score start → end, areas", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let sid: string; let skill: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; sid = r[0].students[0].id;
    const qs = (await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["id", "skillId"] }));
    skill = String(qs[0].skillId);
    const mine = qs.filter((q) => q.skillId === skill).slice(0, 3);
    // one session on Sunday 2026-10-04 at home: 17:38, 17:50, 18:02 Riyadh, a minute per answer, 2 of 3 right
    const ses = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", startedAt: new Date("2026-10-04T14:37:00Z") });
    const times = ["2026-10-04T14:38:00Z", "2026-10-04T14:50:00Z", "2026-10-04T15:02:00Z"];
    const scores: [number | null, number][] = [[20, 35], [35, 50], [50, 62]];
    for (let i = 0; i < 3; i++) {
      const q = mine[i % mine.length];
      await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q.id, skillId: skill, response: {}, isCorrect: i !== 1, responseMs: 60_000, difficultyB: 0, createdAt: new Date(times[i]) });
      await repo.create("AdaptiveDecisionLog", { studentId: sid, sessionId: ses.id, questionId: q.id, skillId: skill, previousTheta: 0, newTheta: 0, thetaSE: 1, masteryBefore: scores[i][0], masteryAfter: scores[i][1], reason: "test", reasonCode: "TARGET_SUCCESS_RATE", engineVersion: "test", createdAt: new Date(times[i]) });
    }
    // an answer before the range: its log must not be the start of the range
    await repo.create("AdaptiveDecisionLog", { studentId: sid, sessionId: ses.id, skillId: skill, previousTheta: 0, newTheta: 0, thetaSE: 1, masteryBefore: 5, masteryAfter: 9, reason: "old", reasonCode: "TARGET_SUCCESS_RATE", engineVersion: "test", createdAt: new Date("2026-09-01T08:00:00Z") });
  });

  test("the score at the start → end of the range, and 'improved' counts", async () => {
    const a = await practiceAnalytics(repo, teacher, { classId, from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T23:59:59Z") });
    const s0 = a.students.find((x) => x.id === sid)!;
    const d = s0.detail.find((x) => x.skillId === skill)!;
    assert.deepEqual([d.scoreFrom, d.scoreTo, d.improved], [20, 62, true]);
    assert.equal(s0.improved, 1);
    assert.equal(a.totals.improved, 1);
  });

  test("one student's sessions: weekday, clock time, minutes, accuracy, school or home", async () => {
    const a = await practiceAnalytics(repo, teacher, { classId, from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T23:59:59Z"), studentId: sid });
    assert.equal(a.sessions.length, 1);
    const x = a.sessions[0];
    assert.equal(x.day, "2026-10-04");
    assert.equal(x.weekday, 0, "Sunday");
    assert.equal(x.startMin, 17 * 60 + 37, "the first question was shown a minute before its answer");
    assert.equal(x.endMin, 18 * 60 + 2);
    assert.equal(x.minutes, 3);
    assert.equal(x.accuracy, 67);
    assert.equal(x.atSchool, false, "Sunday 17:37 is after school");
    assert.equal(x.answers, 3);
  });

  test("answers by area add up to all the answers", async () => {
    const a = await practiceAnalytics(repo, teacher, { classId, from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T23:59:59Z") });
    assert.ok(a.areas.length >= 1);
    assert.equal(a.areas.reduce((x, r) => x + r.questions, 0), a.totals.questions);
    for (const r of a.areas) assert.ok(r.label && r.label !== r.domain, `${r.domain} has words`);
    assert.equal(a.skills[0].domain, a.areas[0].domain);
  });
});
