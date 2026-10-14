/**
 * ⭐ Skill stars on screen (owner r67 §2, §5–§7, §9): the five icons are ONE component (colour AND shape, same size),
 * every icon has a tooltip, the slim legend on every page with stars, the full guide (EN + AR), the one-time card,
 * the "exclude them?" prompt everywhere a skill is assigned, the Needs-attention additions, the MAP plan grouped by
 * skill, the Learn suggestion when stuck, the weekly goal, the self-check, and student words without level words.
 * Static renders (no Next.js) + the in-memory demo school — never a real database or real students.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

// next/link → a plain <a>; the server-action files → no-op stand-ins (static renders only)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) {
  const q = String(r);
  if (q === "next/link") return "stub:next/link";
  if (/star-actions$|stars-notice-actions$/.test(q)) return "stub:actions";
  return orig.call(this, r, ...x);
};
const noop = async () => ({ ok: true, count: 0, total: 0 });
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
Module._cache["stub:actions"] = { id: "actions", filename: "actions", loaded: true, children: [], paths: [], exports: new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop) }) };
(globalThis as Record<string, unknown>).React ??= React;

import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { STAR_ORDER, STUDENT_WORD, TEACHER_WORD, starTooltip, STUDENT_MEANING } from "../src/lib/skill-stars";
import { groupStagesBySkill, planStarCount } from "../src/lib/plan-groups";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { makeT } from "../src/i18n";
import { skillKeyIndex } from "../src/server/skills/status";
import { learnSuggestion, skipLearnSuggestion, setSkillGoal, saveSelfCheck, selfCheckMismatch, starAttention, masteredAmong } from "../src/server/skills/status-extras";
import { studentStarsSummary, markMasteredWork } from "../src/server/skills/student-stars";
import { dismissNotice, noticeSeen, STARS_NOTICE } from "../src/server/skills/notices";
import { teacherHomeSummary } from "../src/server/teacher/needs-attention";
import { starAssign } from "../src/server/assign/star";
import { sendProgramPlan } from "../src/server/plans/send";
import { readPlanForm } from "../src/server/plans/plan-form";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const LEVEL_WORDS = /\b(level|Level|Below|Above|On Level|Approaching|Meeting|Exceeding|Tier|RTI|failed?)\b/;
const DAY = 86_400_000;
const comp = () => import("../src/components/skills/skill-star");

describe("⭐ skill stars — on screen", () => {
  test("five statuses, ONE component: each its own shape and colour, the same size", async () => {
    const { StarGlyph, SkillStar } = await comp();
    const html = STAR_ORDER.map((k) => renderToStaticMarkup(React.createElement(StarGlyph, { status: k })));
    assert.equal(new Set(html).size, 5, "five different drawings");
    for (const [i, k] of STAR_ORDER.entries()) { assert.match(html[i], new RegExp(`data-star="${k}"`)); assert.match(html[i], /width:16px;height:16px/, "same size"); }
    assert.match(html[0], /#94a3b8/, "☆ gray outline"); assert.match(html[1], /#3b82f6/, "◐ half blue"); assert.match(html[2], /#f59e0b/, "⭐ gold");
    assert.match(html[2], /drop-shadow/, "⭐ glows"); assert.match(html[3], /#d97706/, "☆⬆ gold outline"); assert.match(html[4], /#ea580c/, "🔄 orange");
    assert.match(renderToStaticMarkup(React.createElement(StarGlyph, { status: "MASTERED", level: 2 })), />2</, "⭐² level badge");
    // students never see the level number
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(SkillStar, { info: { status: "MASTERED", level: 2 }, who: "student" })), />2<\/span>/);
    // nothing else draws its own status icons: the pages use the shared component
    for (const f of ["src/components/map/study-plan-view.tsx", "src/components/student/my-work-groups.tsx", "src/app/teacher/reports/skills-grid/page.tsx", "src/components/student/study-plan.tsx", "src/app/teacher/assigned/page.tsx", "src/app/student/learn/[code]/page.tsx", "src/components/map/year-plan-board.tsx"]) assert.match(read(f), /components\/skills\/skill-star/, f);
  });

  test("every icon has a tooltip: meaning + when + next step (teacher), simple words (student)", async () => {
    const { SkillStar } = await comp();
    const now = Date.parse("2026-10-13T09:00:00Z");
    const tip = starTooltip({ status: "MASTERED", answered: 34, masteredAt: new Date(now - 5 * DAY).toISOString(), reviewDueAt: new Date(now + 16 * DAY).toISOString() }, "teacher", undefined, now);
    assert.equal(tip, "Mastered 5 days ago after 34 questions · review in 16 days");
    assert.match(starTooltip({ status: "IN_PROGRESS", answered: 12, score: 64 }, "teacher"), /12 questions answered, mastery 64%/);
    assert.match(starTooltip({ status: "IN_PROGRESS", answered: 50, needsSupport: true }, "teacher"), /Needs support · 50 questions without mastery · Next: the RTI plan/);
    assert.match(starTooltip({ status: "NEEDS_REVIEW" }, "teacher"), /Next: practise it again/);
    const html = renderToStaticMarkup(React.createElement(SkillStar, { info: { status: "IN_PROGRESS", answered: 3, score: 40 }, label: "Theme" }));
    assert.match(html, /role="tooltip"/); assert.match(html, /tabindex="0"/, "keyboard / tap focus shows it"); assert.match(html, /title="In progress/);
    for (const k of STAR_ORDER) assert.doesNotMatch(starTooltip({ status: k, level: 3, answered: 40 }, "student"), LEVEL_WORDS, `student tooltip ${k}`);
  });

  test("the slim legend (collapsible, links to the guide) on every page with stars; one line for PDFs / reports", async () => {
    const { StarLegend, StarLegendLine } = await comp();
    const html = renderToStaticMarkup(React.createElement(StarLegend, {}));
    assert.match(html, /<details/); for (const k of STAR_ORDER) assert.ok(html.includes(TEACHER_WORD[k]), k);
    assert.match(html, /href="\/guide\/skill-stars"/);
    const st = renderToStaticMarkup(React.createElement(StarLegend, { who: "student" }));
    for (const k of STAR_ORDER) assert.ok(st.includes(STUDENT_WORD[k].replace("🎉", "").trim()), k);
    assert.doesNotMatch(st, /guide\/skill-stars/, "students: the simple legend");
    assert.equal(renderToStaticMarkup(React.createElement(StarLegendLine, {})).replace(/<[^>]+>/g, ""), "☆ Not started · ◐ In progress · ⭐ Mastered · ☆⬆ Next level · 🔄 Needs review");
    for (const f of ["src/app/teacher/reports/skills-grid/page.tsx", "src/components/map/study-plan-view.tsx", "src/components/map/year-plan-board.tsx", "src/app/teacher/assigned/page.tsx"]) assert.match(read(f), /StarLegend/, f);
    assert.match(read("src/components/map/study-plan-view.tsx"), /StarLegendLine/, "the printed plan's footer");
  });

  test("the Skill stars guide page (EN + AR): each icon, the rules, how to use them", () => {
    const f = "src/app/guide/skill-stars/page.tsx";
    assert.ok(existsSync(join(ROOT, f)));
    const src = read(f);
    for (const x of ["30 answered questions", "Tests never change a star", "3 weeks after a star", "Once a month", "A new, higher MAP level", "exclude them?", "Follow 🔄"]) assert.ok(src.includes(x), x);
    const strings = [...src.matchAll(/"([^"\n]{12,})",?\n/g)].map((m) => m[1]).filter((x) => /[a-z] /.test(x));
    assert.ok(strings.length >= 12);
    const known = new Set<string>(UI_STRINGS as readonly string[]);
    for (const x of [...strings, "Skill stars guide", "The five stars", "The rules", "How to use them"]) { assert.ok(known.has(x), `in UI_STRINGS: ${x.slice(0, 50)}`); assert.ok((ar as Record<string, string>)[x], `Arabic: ${x.slice(0, 50)}`); }
    assert.notEqual(makeT("ar")("Skill stars guide"), "Skill stars guide");
    assert.doesNotMatch(src, /^export (?!default|const metadata)/m, "page files export only Next page fields");
  });

  test("teacher and student words; students never see level words or “failed”", () => {
    assert.deepEqual(Object.values(TEACHER_WORD), ["Not started", "In progress", "Mastered", "Next level", "Needs review"]);
    assert.deepEqual(Object.values(STUDENT_WORD), ["Not started yet", "Learning", "Mastered 🎉", "New challenge", "Review time"]);
    for (const w of [...Object.values(STUDENT_WORD), ...Object.values(STUDENT_MEANING)]) assert.doesNotMatch(w, LEVEL_WORDS, w);
    const panel = read("src/components/skills/student-stars-panel.tsx") + read("src/app/student/work/page.tsx");
    assert.doesNotMatch(panel.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""), /"[^"]*\b(Below|Above|Tier|failed)\b[^"]*"/);
  });

  test("MAP plan grouped by skill: each skill once (one Practise button), its MAP statements folded, standards small", async () => {
    const stages = [
      { key: "DEVELOP", title: "Develop", range: "RIT 201–210", total: 3, shown: 3, topics: [{ name: "Character", statements: [
        { text: "Describes a character's traits", standards: ["RL.4.3"], skills: [{ id: "g4c", name: "Character Traits & Development", key: "fam:character", status: "PRACTISING", score: 40, star: { status: "IN_PROGRESS" as const } }] },
        { text: "Infers a character's feelings", standards: ["RL.5.3"], skills: [{ id: "g5c", name: "Character Traits & Development", key: "fam:character", status: "PRACTISING", score: 40, star: { status: "IN_PROGRESS" as const } }, { id: "g4i", name: "Make Inferences", key: "fam:inference", status: "MASTERED", score: 100, star: { status: "MASTERED" as const } }] },
        { text: "Uses a glossary", standards: ["L.4.4.c"], skills: [] },
      ] }] },
      { key: "REINFORCE", title: "Reinforce", range: "RIT 191–200", total: 1, shown: 1, topics: [{ name: "Character", statements: [{ text: "Identifies the main character", standards: ["RL.3.3"], skills: [{ id: "g4c", name: "Character Traits & Development", key: "fam:character", status: "PRACTISING", score: 40, star: { status: "IN_PROGRESS" as const } }] }] }] },
    ];
    const g = groupStagesBySkill(stages);
    assert.deepEqual(g[0].skills.map((k) => k.key), ["fam:character", "fam:inference"], "each skill once (Grade 4 and 5 copies too)");
    assert.equal(g[0].skills[0].statements.length, 3, "all the statements it covers (any stage)"); assert.deepEqual(g[0].skills[0].standards, ["RL.4.3", "RL.5.3", "RL.3.3"]);
    assert.equal(g[1].skills.length, 0, "already listed in Develop"); assert.equal(g[0].unlinked.length, 1);
    assert.deepEqual(planStarCount([{ stages }]), { mastered: 1, total: 2 });
    const { StudyPlanView } = await import("../src/components/map/study-plan-view");
    const d = { student: { id: "s1", name: "Ali Hassan", first: "Ali", number: "7", grade: 4, className: "4A", classId: "c1", school: "Demo", logoUrl: null }, subject: "READING", term: "Fall 2026", overall: { rit: 205, percentile: 50, descriptor: "Average", projection: 212 }, source: "CONTINUUM", full: false,
      areas: [{ group: "LIT", name: "Literary Text", icon: "📖", rit: 205, fromGoal: true, percentile: 50, descriptor: "Average", focus: false, stages, skillsMastered: 1, skillsLinked: 2 }] };
    const html = renderToStaticMarkup(React.createElement(StudyPlanView, { d: d as never, link: true }));
    assert.equal((html.match(/data-testid="plan-skill"/g) ?? []).length, 2, "two skills, each once");
    assert.equal((html.match(/▶ Practise/g) ?? []).length, 2, "one Practise button per skill");
    assert.match(html, /MAP statements it covers \(3\)/); assert.match(html, /<details/);
    assert.match(html, /1 of 2 skills mastered/, "“8 of 20 skills mastered” on the plan");
    assert.equal((html.match(/data-testid="skill-star"/g) ?? []).length, 2);
    assert.match(read("src/components/map/study-plan-view.tsx"), /hub && star && <StarAssign/, "the teacher's view keeps the ☆ quick-assign");
    assert.doesNotMatch(read("src/components/map/study-plan-view.tsx"), /SkillChip|STATUS_UI/, "the old dots are gone (one status, one icon)");
  });

  test("the prompt “N students already mastered this skill — exclude them?” everywhere a skill is assigned", async () => {
    const { excludeQuestion } = await import("../src/components/assign/exclude-mastered");
    const t = (x: string, v?: Record<string, string | number>) => (v ? x.replace(/\{(\w+)\}/g, (_, k) => String(v[k])) : x);
    assert.equal(excludeQuestion(5, t), "5 students already mastered this skill — exclude them?");
    assert.equal(excludeQuestion(1, t), "1 student already mastered this skill — exclude them?");
    assert.match(read("src/components/assign/star-assign.tsx"), /ExcludeMasteredPrompt/, "☆ quick-assign");
    assert.match(read("src/app/teacher/assign-dialog.tsx"), /ExcludeMasteredPrompt/, "the Assign window");
    assert.match(read("src/components/plans/plan-builder.tsx"), /PlanMasteredPrompt/, "plans");
    assert.match(read("src/components/map/year-plan-board.tsx"), /ExcludeMasteredPrompt/, "the Year plan");
    assert.equal(readPlanForm(() => null, () => []).excludeMastered, true, "plans: Yes by default");
    assert.equal(readPlanForm((k) => (k === "xm" ? "0" : null), () => []).excludeMastered, false);
  });

  describe("with the demo school", () => {
    let repo: SqliteRepo; let teacher: Actor; let student: Actor; let classId = ""; let schoolId = ""; let ids: string[] = []; let theme = ""; let inf = "";
    const now = new Date("2026-10-13T09:00:00Z");
    const put = async (sid: string, key: string, status: string, extra: Record<string, unknown> = {}) => repo.create("SkillStatus", { studentId: sid, skillKey: key, level: 1, status, answered: 10, correct: 5, score: 50, createdAt: now, updatedAt: now, ...extra });
    before(async () => {
      ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
      await publishGrade4Bank(repo);
      teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
      schoolId = teacher.schoolId!;
      const tr = await repo.findUnique("Teacher", { userId: teacher.userId });
      classId = s((await repo.findMany("ClassTeacher", { teacherId: tr!.id }))[0].classId);
      ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
      student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: ids[0] }))!.userId }))!);
      const ix = await skillKeyIndex(repo, schoolId);
      theme = [...ix.keyOf].find(([, k]) => k === "fam:theme")![0];
      inf = [...ix.keyOf].find(([, k]) => k === "fam:inference")![0];
    });

    test("exclude them? → Yes: the ☆ quick-assign and plans leave out the students with ⭐", async () => {
      await put(ids[0], "fam:theme", "MASTERED", { masteredAt: now, skillId: theme });
      await put(ids[1], "fam:theme", "MASTERED", { masteredAt: now, skillId: theme });
      assert.deepEqual((await masteredAmong(repo, schoolId, ids, theme)).sort(), [ids[0], ids[1]].sort());
      const r = await starAssign(repo, teacher, { kind: "SKILL", ref: theme, classId, excludeMastered: true }, now);
      const got = (await repo.findMany("AssignmentStudent", { assignmentId: r.id })).map((x) => s(x.studentId)).sort();
      assert.deepEqual(got, ids.slice(2).sort(), "only the students who have not mastered it");
      const p = await sendProgramPlan(repo, teacher, { classId, program: "MAP", picks: ids.map((studentId) => ({ studentId, skillId: theme })), excludeMastered: true }, now);
      assert.equal(p.students, ids.length - 2);
      const all = await sendProgramPlan(repo, teacher, { classId, program: "MAP", picks: ids.map((studentId) => ({ studentId, skillId: theme })), excludeMastered: false }, now);
      assert.equal(all.students, ids.length, "No: everyone gets it");
    });

    test("My Work never asks again for a plan skill already mastered (a teacher's own assign stays)", async () => {
      const summary = await studentStarsSummary(repo, ids[0], now, { celebrate: false });
      const rows = [{ assignmentId: "a1", skillId: theme, sourceKey: "MAP", status: "Not started" }, { assignmentId: "a2", skillId: theme, sourceKey: "CURRICULUM", status: "Not started" }, { assignmentId: "a3", skillId: inf, sourceKey: "MAP", status: "Not started" }];
      const out = await markMasteredWork(repo, ids[0], rows, summary.byKey);
      assert.deepEqual(out.map((r) => r.status), ["Done", "Not started", "Not started"]);
    });

    test("Needs attention: stuck at ◐ 7+ days, 50 questions without mastery, a new 🔄", async () => {
      await put(ids[2], "fam:inference", "IN_PROGRESS", { skillId: inf, progressAt: new Date(now.getTime() - 9 * DAY) });
      await put(ids[3], "fam:inference", "IN_PROGRESS", { skillId: inf, needsSupportAt: now, answered: 50 });
      await put(ids[1], "fam:capitalization", "NEEDS_REVIEW", { history: [{ at: now.toISOString(), status: "NEEDS_REVIEW" }] });
      const a = await starAttention(repo, schoolId, ids, now);
      assert.deepEqual(a.map((x) => x.kind).sort(), ["NO_MASTERY", "REVIEW", "STUCK"]);
      assert.equal(a.find((x) => x.kind === "STUCK")!.days, 9);
      const home = await teacherHomeSummary(repo, teacher, now);
      for (const id of [ids[1], ids[2], ids[3]]) assert.ok(home.list.find((r) => r.studentId === id)?.stars?.length, "listed with its star reason");
      const src = read("src/app/teacher/page.tsx");
      for (const x of ["Needs review: {skill}", "50 questions without mastery: {skill}", "No progress for {n} days: {skill}", "RTI plan"]) assert.ok(src.includes(x), x);
    });

    test("one-time “New: skill stars” card on the teacher home, dismissed per user; links to the guide", async () => {
      assert.equal(await noticeSeen(repo, teacher.userId, STARS_NOTICE), false);
      await dismissNotice(repo, teacher.userId, STARS_NOTICE); await dismissNotice(repo, teacher.userId, STARS_NOTICE);
      assert.equal(await noticeSeen(repo, teacher.userId, STARS_NOTICE), true);
      assert.equal(await repo.count("UserNotice", { userId: teacher.userId }), 1);
      const src = read("src/app/teacher/page.tsx");
      assert.match(src, /stars-notice/); assert.match(src, /\/guide\/skill-stars/); assert.match(src, /dismissStarsNoticeAction/);
    });

    test("📘 Learn suggestion when stuck (7+ days or 25+ answers without progress), skippable", async () => {
      const tip = await learnSuggestion(repo, ids[2], inf, now);
      assert.ok(tip, "stuck 9 days on Make Inferences: its Learn lesson is suggested");
      assert.match(tip!.href, /^\/student\/learn\//);
      // 25+ answers without progress also counts (pure rule)
      const { isStuck } = await import("../src/server/skills/status-extras");
      assert.equal(isStuck({ status: "IN_PROGRESS", progressAt: now, answered: 40, progressAnswered: 14 }, now), true);
      assert.equal(isStuck({ status: "IN_PROGRESS", progressAt: now, answered: 20, progressAnswered: 14 }, now), false);
      await skipLearnSuggestion(repo, ids[2], inf, now);
      assert.equal(await learnSuggestion(repo, ids[2], inf, now), null, "skipped: not again this week");
      assert.equal(await learnSuggestion(repo, ids[0], theme, now), null, "a mastered skill: no suggestion");
      assert.match(read("src/app/practice/[skillId]/page.tsx"), /learn-suggestion[\s\S]*Keep practising/);
    });

    test("🎯 weekly goal (student or teacher) with its progress; 😊😐😟 self-check after a skill; a light celebration once", async () => {
      await setSkillGoal(repo, student, { target: 2 }, now);
      await assert.rejects(() => setSkillGoal(repo, student, { target: 9 }, now), /1 to 5/);
      let sum = await studentStarsSummary(repo, ids[0], now);
      assert.deepEqual([sum.goal?.target, sum.goal?.mastered, sum.goal?.setBy], [2, 1, "STUDENT"]);
      assert.deepEqual(sum.celebrate, ["Theme"], "the new star, once");
      assert.deepEqual((await studentStarsSummary(repo, ids[0], now)).celebrate, [], "not twice");
      assert.equal(sum.selfCheck?.key, "fam:theme");
      await saveSelfCheck(repo, student, "fam:theme", "UNSURE");
      sum = await studentStarsSummary(repo, ids[0], now);
      assert.equal(sum.selfCheck, null);
      assert.equal(sum.byKey.get("fam:theme")!.selfCheck, "UNSURE");
      assert.equal(selfCheckMismatch(sum.byKey.get("fam:theme")!), "UNSURE_STRONG");
      const { StudentStarsPanel } = await import("../src/components/skills/student-stars-panel");
      const html = renderToStaticMarkup(React.createElement(StudentStarsPanel, { s: { ...sum, celebrate: ["Theme"], selfCheck: { key: "fam:inference", skill: "Make Inferences" } }, t: makeT("en"), back: "/student/work", count: { mastered: 8, total: 20 } }));
      assert.match(html, /8 of 20 skills mastered/); assert.match(html, /This week&#x27;s goal: master 2 skills/); assert.match(html, /Do you feel you understood it\?/);
      assert.match(html, /😊/); assert.match(html, /😐/); assert.match(html, /😟/); assert.match(html, /New star!/);
      assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\b(Below|Above|On Level|Tier|failed)\b/, "no level words for students");
      const arHtml = renderToStaticMarkup(React.createElement(StudentStarsPanel, { s: sum, t: makeT("ar"), back: "/student/work" }));
      assert.match(arHtml, /نجوم|مهارات/, "Arabic");
    });
  });
});
