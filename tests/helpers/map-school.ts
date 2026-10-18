/**
 * 🗺️ r79 MAP speed fixture (fictional demo school, in-memory SQLite only — never a real database or real students):
 * the speed-test school (3 classes per grade × 25 students, the full question bank, 3 ms per database call) plus a
 * realistic MAP center: one teacher with a Grade 4, a Grade 5 and a Grade 6 class; every student of the school with
 * MAP scores in 3 terms (Fall · Winter · Spring, Reading and Language Usage, the overall RIT and 3 goal-area scores
 * each); the Learning Continuum (~1 300 statements); the bank classified on MAP; the individual plan drafts (some
 * sent); the Year plan of each class with a week assigned; an automatic and a manual MAP test.
 * Used by tests/r79-map-speed.test.ts.
 */
import { bench, type Bench } from "./route-bench";
import { createSession } from "../../src/server/auth/sessions";
import { DEFAULT_AUTH } from "../../src/server/auth/config";
import { resolveActor } from "../../src/server/auth/actor";
import type { Actor } from "../../src/server/auth/rbac";
import { applyClassification } from "../../src/server/map/question-areas";
import { importContinuum } from "../../src/server/map/continuum";
import { draftPlansFor } from "../../src/server/map/map-auto";
import { assignYearWeek, yearPlanView } from "../../src/server/map/year-plan";
import { sendPlans } from "../../src/server/map/map-plan";
import { createMapTest } from "../../src/server/map/map-test";

export interface MapSchool { b: Bench; teacher: Actor; admin: Actor; cookie: Record<string, string>; adminCookie: Record<string, string>; classIds: string[]; studentIds: string[]; autoTest: string; manualTest: string }

const s = (v: unknown) => String(v ?? "");
const TERMS = [
  { term: "Fall 2025-2026", at: new Date("2025-09-20T08:00:00Z") },
  { term: "Winter 2025-2026", at: new Date("2026-01-20T08:00:00Z") },
  { term: "Spring 2025-2026", at: new Date("2026-05-12T08:00:00Z") },
];
/** NWEA reports 3 goals per subject: one goal-area code each (the platform groups its finer areas onto them). */
const GOALS: Record<string, { name: string; code: string }[]> = {
  Reading: [{ name: "Literary Text", code: "LIT_THEME" }, { name: "Informational Text", code: "INFO_CENTRAL_IDEA" }, { name: "Vocabulary", code: "VOCAB" }],
  "Language Usage": [{ name: "Grammar & Usage", code: "LANG_GRAMMAR" }, { name: "Mechanics", code: "LANG_MECHANICS" }, { name: "Writing", code: "WRITING_ORG" }],
};

/** A Learning Continuum file like NWEA's: both subjects, RIT bands 141–300, 6 statements per goal area and band. */
function continuumTable(): string[][] {
  const rows: string[][] = [["Subject", "RIT Low", "RIT High", "Goal Area", "Sub-topic", "Statement", "Standards"]];
  const areas: [string, string, string[]][] = [
    ["Reading", "Literary Text: Key Ideas and Details", ["RL.4.1", "RL.4.2", "RL.5.3", "RL.6.2"]],
    ["Reading", "Informational Text: Key Ideas and Details", ["RI.4.2", "RI.5.1", "RI.6.3"]],
    ["Reading", "Vocabulary: Acquisition and Use", ["L.4.4", "L.5.5", "RL.4.4"]],
    ["Language Usage", "Grammar and Usage", ["L.4.1", "L.5.1", "L.6.1"]],
    ["Language Usage", "Mechanics", ["L.4.2", "L.5.2", "L.6.2"]],
    ["Language Usage", "Writing: Plan, Organize, Develop", ["W.4.2", "W.5.1", "W.6.4"]],
  ];
  const words = ["identifies", "explains", "compares", "infers", "summarizes", "determines"];
  for (let low = 141; low < 300; low += 10) for (const [subject, goal, codes] of areas) for (let k = 0; k < 6; k++) {
    rows.push([subject, String(low), String(low + 9), goal, `${goal.split(":")[0]} topic ${k + 1}`, `${words[k]} ${goal.toLowerCase()} in grade texts (band ${low}, statement ${k + 1})`, codes.slice(0, 1 + (k % codes.length)).join(" ")]);
  }
  return rows;
}

export async function mapSchool(): Promise<MapSchool> {
  const b = await bench();
  const repo = b.S.repo;
  const admin = b.S.admin;
  // the teacher of 4A also teaches 5A and 6A (one teacher, three MAP classes of Grades 4–6)
  const t4 = (await repo.findUnique("User", { username: "demo.teacher.4a" }))!;
  const tRow = (await repo.findUnique("Teacher", { userId: t4.id }))!;
  const classIds: string[] = [];
  for (const u of ["demo.teacher.4a", "demo.teacher.5a", "demo.teacher.6a"]) {
    const uu = (await repo.findUnique("User", { username: u }))!;
    const tt = (await repo.findUnique("Teacher", { userId: uu.id }))!;
    const c = (await repo.findMany("ClassTeacher", { teacherId: tt.id }))[0];
    classIds.push(s(c.classId));
    if (u !== "demo.teacher.4a") await repo.upsert("ClassTeacher", { classId: c.classId, teacherId: tRow.id }, {}, {});
  }
  const teacher = await resolveActor(repo, t4);
  const { token } = await createSession(repo, t4, { ...DEFAULT_AUTH, sessionTtlMinutes: 24 * 60, idleMinutes: 24 * 60 });
  const cookie = { ela_session: token };
  // every student of the school: 3 terms × 2 subjects × (overall + 3 goals) — made-up scores
  const areas = new Map((await repo.findMany("MapGoalArea", {})).map((a) => [s(a.code), s(a.id)]));
  const members = await repo.findMany("ClassMembership", { leftAt: null }, { select: ["studentId", "classId"] });
  const all = [...new Set(members.map((m) => s(m.studentId)))].sort();
  const rows: Record<string, unknown>[] = [];
  for (const [i, id] of all.entries()) {
    for (const [ti, t] of TERMS.entries()) for (const subject of ["Reading", "Language Usage"]) {
      const rit = 185 + (i % 30) + ti * 4 + (subject === "Reading" ? 0 : 2);
      rows.push({ studentId: id, subject, termName: t.term, testDate: t.at, rit, ritSE: 3.2, achievementPercentile: 20 + ((i * 7) % 70), projectedGrowth: ti === 0 ? 9 : null, importedAt: t.at, goalName: null, goalAreaId: null });
      for (const [gi, g] of GOALS[subject].entries()) rows.push({ studentId: id, subject, termName: t.term, testDate: t.at, rit: rit + ((i + gi * 5) % 13) - 6, ritSE: 5.1, importedAt: t.at, goalName: g.name, goalAreaId: areas.get(g.code) ?? null });
    }
  }
  for (let i = 0; i < rows.length; i += 500) await repo.createMany("MapResult", rows.slice(i, i + 500));
  // the Learning Continuum and the bank on MAP (the admin's two imports)
  await importContinuum(repo, admin, continuumTable());
  await applyClassification(repo, admin);
  // the individual plan drafts (as after an import), a few sent; the Year plan of each class, one week assigned
  const mine = members.filter((m) => classIds.includes(s(m.classId))).map((m) => s(m.studentId));
  await draftPlansFor(repo, teacher, mine);
  const drafts = await repo.findMany("MapPlan", { classId: classIds[0], status: "DRAFT", subject: "READING" }, { select: ["id"], take: 5 });
  await sendPlans(repo, teacher, drafts.map((d) => s(d.id)), new Date(), "MAP");
  for (const c of classIds) {
    const v = await yearPlanView(repo, teacher, c);
    const w = v.weeks.find((x) => x.skills.length);
    if (w) await assignYearWeek(repo, teacher, c, w.week, new Date(), { source: "MAP" });
  }
  // an automatic and a manual MAP test of the Grade 4 class
  const now = Date.now();
  const autoTest = await createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", title: "Fixture MAP test", classIds: [classIds[0]], opensAt: new Date(now - 86_400_000), closesAt: new Date(now + 14 * 86_400_000) });
  const manualTest = await createMapTest(repo, teacher, { kind: "MANUAL", subject: "READING", title: "Fixture manual MAP test", classIds: [classIds[0]], opensAt: new Date(now - 86_400_000), closesAt: new Date(now + 14 * 86_400_000), manual: { areas: ["LIT", "INFO", "VOCAB"], count: 20, ritLow: 185, ritHigh: 225 } });
  const au = (await repo.findUnique("User", { id: admin.userId }))!;
  const adminCookie = { ela_session: (await createSession(repo, au, { ...DEFAULT_AUTH, sessionTtlMinutes: 24 * 60, idleMinutes: 24 * 60 })).token };
  return { b, teacher, admin, cookie, adminCookie, classIds, studentIds: mine, autoTest, manualTest };
}
