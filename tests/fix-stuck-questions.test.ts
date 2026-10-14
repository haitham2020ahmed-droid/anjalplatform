/**
 * 🛠 “Fix stuck questions” (owner r67, item 7): classify, repair, publish what passes the platform's own publish checks,
 * report the rest with a plain reason — in batches, never deleting, idempotent, once in the background after an update.
 * Also: the bundled question data files have none of these problems at the source. In-memory SQLite only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { createDraft } from "../src/server/admin/questions";
import { unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { AUTO_RUN_KEY, fixStuckOnce, fixStuckQuestions, fixStuckStep, lastFixReport, stuckCounts, type FixReport } from "../src/server/admin/stuck-questions";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🛠 Fix stuck questions", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  const ids: Record<string, string> = {};
  let first: FixReport;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo); // Grade 4 published; Grades 5–6 stay “waiting for review” (stuck)
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const g4 = (await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["id", "skillId", "standardId"], orderBy: [{ field: "id", dir: "asc" }] }));
    const skillId = s(g4[0].skillId);
    const hidden = await unclassifiedSkillId(repo, admin.schoolId!, 4);
    const mc = (stem: string, extra: Record<string, unknown> = {}) => createDraft(repo, admin, { skillId, type: "MULTIPLE_CHOICE", stem, level: 4, whyCorrect: "Because it is.", options: [{ label: "A", text: `cat ${stem}`, correct: true, rationale: null }, { label: "B", text: `dog ${stem}`, correct: false, rationale: "No." }, { label: "C", text: `bird ${stem}`, correct: false, rationale: "No." }], ...extra });

    // A · not under a skill, but its standard names exactly one Grade 4 skill
    const withStd = [];
    for (const q of g4) { if (!q.standardId) continue; const l = await repo.findMany("SkillStandard", { standardId: q.standardId }); if (l.length === 1) { withStd.push(q); if (withStd.length === 1) break; } }
    ids.A = s(withStd[0].id);
    await repo.updateMany("Question", { id: ids.A }, { skillId: hidden });
    // B · a draft with a blank and a duplicate choice and no key flag, but its answer row still says “B”
    ids.B = await mc("Which animal barks");
    await repo.deleteMany("QuestionOption", { questionId: ids.B });
    await repo.createMany("QuestionOption", [
      { questionId: ids.B, label: "A", text: "cat", isCorrect: false, order: 0 }, { questionId: ids.B, label: "B", text: "dog", isCorrect: false, order: 1 },
      { questionId: ids.B, label: "C", text: "  dog ", isCorrect: false, order: 2 }, { questionId: ids.B, label: "D", text: " ", isCorrect: false, order: 3 }, { questionId: ids.B, label: "E", text: "bird", isCorrect: false, order: 4 },
    ]);
    await repo.createMany("QuestionAnswer", [{ questionId: ids.B, value: "B", isPrimary: true }]);
    // C · a draft with no valid difficulty, but its RIT kept in the tags
    ids.C = await mc("Which word is a noun", {});
    await repo.updateMany("Question", { id: ids.C }, { difficultyLevel: 0, tags: { rit: 230 } });
    // D · a draft without an explanation (the key is known)
    ids.D = await mc("Which one can fly");
    await repo.deleteMany("QuestionExplanation", { questionId: ids.D });
    // E · a draft with no answer key anywhere: a person must choose it
    ids.E = await mc("Which is the best title");
    await repo.updateMany("QuestionOption", { questionId: ids.E }, { isCorrect: false });
    // F · not under a skill, no standard, not on the map, no MAP goal: left with the reason
    ids.F = await mc("Pick the odd one out");
    await repo.updateMany("Question", { id: ids.F }, { skillId: hidden, standardId: null });
  });

  test("the run: classified, repaired, published by the same checks as Publish; the rest listed with a plain reason", async () => {
    const before = await stuckCounts(repo, admin.schoolId!);
    const total = await repo.count("Question", {});
    await assert.rejects(fixStuckQuestions(repo, teacher), ForbiddenError, "admins only");
    first = await fixStuckQuestions(repo, admin);
    console.log("Fix stuck questions on the test data:", JSON.stringify({ before: first.before, after: first.after, classified: first.classified, byVia: first.byVia, repaired: first.repaired, repairedQuestions: first.repairedQuestions, published: first.published, notPublished: first.notPublishedCount, reasons: first.notPublished.map((x) => x.reason), left: first.leftCount }));
    assert.deepEqual(first.before, before);
    assert.equal(await repo.count("Question", {}), total, "never deletes");

    assert.notEqual(s((await repo.findUnique("Question", { id: ids.A }))!.skillId), await unclassifiedSkillId(repo, admin.schoolId!, 4), "A: put under its skill by its standard");
    assert.ok((first.byVia.STANDARD ?? 0) >= 1, JSON.stringify(first.byVia));

    const b = (await repo.findUnique("Question", { id: ids.B }))!;
    assert.equal(b.status, "PUBLISHED", "B: repaired and published");
    const bo = (await repo.findMany("QuestionOption", { questionId: ids.B })).sort((x, y) => Number(x.order) - Number(y.order));
    assert.deepEqual(bo.map((o) => [o.label, o.text, Boolean(o.isCorrect)]), [["A", "cat", false], ["B", "dog", true], ["C", "bird", false]], "blank and duplicate choices gone, key restored from the answer row");

    const c = (await repo.findUnique("Question", { id: ids.C }))!;
    assert.equal(c.status, "PUBLISHED");
    assert.ok(Number(c.difficultyLevel) >= 5 && Number(c.difficultyLevel) <= 7, `C: difficulty from its RIT (${c.difficultyLevel})`);

    assert.equal((await repo.findUnique("Question", { id: ids.D }))!.status, "PUBLISHED", "D: explanation written from the key");
    assert.match(JSON.stringify((await repo.findMany("QuestionExplanation", { questionId: ids.D }))[0].body), /The correct answer is A/);

    assert.equal((await repo.findUnique("Question", { id: ids.E }))!.status, "DRAFT", "E: no key anywhere: never guessed");
    const e = first.notPublished.find((x) => x.id === ids.E);
    assert.ok(e && /correct/i.test(e.reason), JSON.stringify(first.notPublished.slice(0, 5)));
    const f = first.notPublished.find((x) => x.id === ids.F);
    assert.ok(f && /Not under a skill/.test(f.reason), "F: not published while it has no skill and no map place");
    assert.ok(first.left.some((x) => x.id === ids.F && x.reason.length > 10), "F: listed as still without a skill, with the reason");

    assert.ok(first.published >= 4, `the Grade 5–6 questions waiting for review were published too (${first.published})`);
    assert.ok(first.after && first.after.waiting === 0, JSON.stringify(first.after));
    assert.deepEqual(await lastFixReport(repo, admin.schoolId!), first, "the report is kept (Question Bank and System check show it)");
    assert.ok(await repo.count("AuditLog", { action: "question.repair" }) >= 3, "every repair is in the audit log");
  });

  test("idempotent: a second run finds nothing new to do", async () => {
    const again = await fixStuckQuestions(repo, admin);
    assert.equal(again.classified, 0);
    assert.equal(again.published, 0);
    assert.equal(again.repairedQuestions, 0);
    assert.deepEqual(again.notPublished.map((x) => x.id).sort(), first.notPublished.map((x) => x.id).sort());
  });

  test("in batches: the page's step-by-step run gives the same result", async () => {
    let cursor = null as Parameters<typeof fixStuckStep>[2];
    let steps = 0;
    for (;;) { const r = await fixStuckStep(repo, admin, cursor); steps++; if (r.cursor.phase === "done") { assert.equal(r.report.published, 0); break; } cursor = r.cursor; }
    assert.ok(steps >= 2, "at least one batch per phase");
  });

  test("once in the background after an update (claimed per school), report on System check", async () => {
    const n1 = await fixStuckOnce(repo);
    assert.ok(n1 >= 1);
    assert.equal(await fixStuckOnce(repo), 0, "runs once per update");
    assert.equal(await repo.count("SchoolSetting", { key: AUTO_RUN_KEY }), n1);
    assert.equal((await lastFixReport(repo, admin.schoolId!))!.by, "auto");
    assert.match(read("src/instrumentation.ts"), /fixStuckQuestionsInBackground/);
    assert.match(read("src/app/admin/system/page.tsx"), /<FixReportView/);
    const bank = read("src/app/admin/questions/page.tsx");
    assert.match(bank, /<FixStuck /, "the Question Bank page has the button");
    assert.match(read("src/components/admin/fix-report.tsx"), /Open in editor/, "each one left has a one-click open-in-editor");
  });

  test("the bundled question data files have none of these problems at the source", () => {
    const files = ["data/questions/bank.json", "data/questions/new-types-samples.json", "data/questions/sentence-combine-items.json", "data/questions/word-study-items.json", ...readdirSync(join(ROOT, "data/questions/sets")).filter((f) => f.endsWith(".json")).map((f) => `data/questions/sets/${f}`)];
    const norm = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();
    const bad: string[] = [];
    let n = 0;
    for (const f of files) {
      const d = JSON.parse(read(f)) as { items?: Record<string, unknown>[]; sets?: { questions: Record<string, unknown>[] }[]; nodes?: { questions: Record<string, unknown>[] }[] };
      const qs = [...(d.items ?? []), ...(d.sets ?? []).flatMap((x) => x.questions ?? []), ...(d.nodes ?? []).flatMap((x) => x.questions ?? [])];
      for (const q of qs) {
        n++;
        const ref = `${f}:${s(q.ref)}`;
        const opts = q.options as unknown[] | undefined;
        if (!norm(q.stem)) bad.push(`${ref} blank stem`);
        if (q.level === undefined || q.level === null || q.level === "") bad.push(`${ref} no level`);
        if (Array.isArray(opts)) {
          const texts = opts.map((o) => norm(typeof o === "string" ? o : (o as { text?: string }).text));
          if (texts.some((x) => !x)) bad.push(`${ref} blank choice`);
          if (new Set(texts).size !== texts.length) bad.push(`${ref} duplicate choice`);
          const key = typeof opts[0] === "string" ? s(q.correct).toUpperCase().replace(/[^A-H]/g, "").split("").filter(Boolean) : (opts as { correct?: boolean }[]).filter((o) => o.correct).map(() => "x");
          if (!key.length) bad.push(`${ref} no answer key`);
          if (typeof opts[0] === "string" && key.some((L) => L.charCodeAt(0) - 65 >= opts.length)) bad.push(`${ref} key is not a choice`);
        }
        if (q.type === "TRUE_FALSE" && typeof q.answer !== "boolean") bad.push(`${ref} no true/false key`);
      }
    }
    assert.ok(n > 5000, `${n} bundled questions checked`);
    assert.deepEqual(bad, []);
  });
});
