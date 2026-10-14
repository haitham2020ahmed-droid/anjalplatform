/**
 * Update 42A: memory-safe question import (1,000-row cap, chunked preview, prefiltered duplicate check), no crash loop,
 * bounded caches, lazy heavy libraries, safe heap limit.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import type { Row } from "../src/server/seeding/repo";
import { MAX_IMPORT_ROWS, TEMPLATE_HEADERS } from "../src/imports/questions/template";
import {
  ANALYZE_CHUNK, ImportFileError, analyzeImport, bankHashHits, commitImportChunk, getImportJob, importHash, listImportJobs, loadCurriculumIndex, passageKey,
} from "../src/server/admin/question-import";
import { BOOT_ID, MAX_CRASHES, beginStep, endStep, leftByDeadProcess } from "../src/server/jobs/crash-guard";
import { remember } from "../src/server/cache/lru";
import { tick } from "../src/server/ai/jobs";
import { maybeRunDaily, riyadhDay } from "../src/server/insights/daily";
import { rosterBackup, rosterBackupChunks } from "../src/server/admin/roster-clean";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const enc = (x: string) => new TextEncoder().encode(x);
type Spec = Partial<Record<string, string>>;
const table = (rows: Spec[]) => [[...TEMPLATE_HEADERS], ...rows.map((r) => TEMPLATE_HEADERS.map((h) => r[h] ?? ""))];
const MC = (stem: string, opts: string[], skill: string, correct = "A"): Spec => ({
  "Question Text": stem, "Question Type": "Multiple Choice", "Option A": opts[0], "Option B": opts[1], "Option C": opts[2] ?? "", "Option D": opts[3] ?? "",
  "Correct Answer": correct, Explanation: "Because it is right.", Grade: "4", Skill: skill, "Difficulty Level": "4",
});

describe("update 42A: crash guard (pure)", () => {
  test("a mark left by another process counts as a crash; two in a row stop the job; a finished step resets", () => {
    const now = new Date("2026-10-11T10:00:00Z");
    const first = beginStep(undefined, now);
    assert.deepEqual([first.crashes, first.stop, first.next.inFlight?.boot], [0, false, BOOT_ID]);
    // same process (another request still running): not a crash
    assert.equal(beginStep(first.next, now).crashes, 0);
    const dead = { inFlight: { boot: "dead-process", at: now.toISOString() }, crashes: 0 };
    assert.equal(leftByDeadProcess(dead), true);
    const second = beginStep(dead, now);
    assert.deepEqual([second.crashes, second.stop], [1, false]);
    const third = beginStep({ ...second.next, inFlight: { boot: "another-dead-process", at: now.toISOString() } }, now);
    assert.deepEqual([third.crashes, third.stop, MAX_CRASHES], [2, true, 2]);
    assert.deepEqual(endStep(), { inFlight: null, crashes: 0 });
  });
  test("bounded caches keep the newest entries", () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 20; i++) remember(m, `k${i}`, i, 5);
    assert.deepEqual([...m.keys()], ["k15", "k16", "k17", "k18", "k19"]);
    remember(m, "k15", 99, 5); // re-set = newest
    assert.deepEqual([...m.keys()], ["k16", "k17", "k18", "k19", "k15"]);
  });
});

describe("update 42A: safe heap limit (scripts/start.mjs)", () => {
  test("70% of WEB_MEMORY_MB, else the container limit, else 512 MB, leaving 210 MB outside the heap; never under 256 MB", async () => {
    const m = (await import(pathToFileURL(join(ROOT, "scripts/start.mjs")).href)) as { heapLimitMb: (o: { webMemoryMb?: string; cgroupMb?: number | null }) => number; cgroupLimitMb: (read: (p: string) => string) => number | null };
    assert.equal(m.heapLimitMb({}), 302, "r68: 512 MB plan → about 300 MB of heap");
    assert.equal(m.heapLimitMb({ webMemoryMb: "1024" }), 717);
    assert.equal(m.heapLimitMb({ webMemoryMb: "", cgroupMb: 2048 }), 1434);
    assert.equal(m.heapLimitMb({ webMemoryMb: "100" }), 256);
    assert.equal(m.cgroupLimitMb(() => "536870912\n"), 512);
    assert.equal(m.cgroupLimitMb(() => "max\n"), null);
    assert.equal(m.cgroupLimitMb(() => "9223372036854771712"), null); // cgroup v1 "unlimited"
    assert.equal(m.cgroupLimitMb(() => { throw new Error("no cgroup"); }), null);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.scripts.start, "node scripts/start.mjs");
  });
});

describe("update 42A: heavy libraries load only when used", () => {
  test("pdf.js and the PDF engine are never imported at module load", () => {
    for (const f of ["src/server/map/asg.ts", "src/server/map/continuum-pdf.ts", "src/server/map/map-files.ts", "src/reports/pdf.ts", "src/app/admin/map-continuum/actions.ts", "src/app/teacher/map-rit-actions.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      assert.doesNotMatch(src, /^import\s+(?!type\b)[^;]*from\s+"(pdfjs-dist[^"]*|playwright-core)"/m, `${f} imports a heavy library at the top`);
    }
    for (const f of ["src/server/map/asg.ts", "src/server/map/continuum-pdf.ts"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /await import\(\/\* webpackIgnore: true \*\/ "pdfjs-dist\/legacy\/build\/pdf\.mjs"\)/);
  });
  test("loading the MAP file readers does not load pdf.js", async () => {
    await import("../src/server/map/map-files");
    await import("../src/server/map/continuum-pdf");
    assert.ok(!Object.keys(require.cache).some((k) => k.includes(`${"pdfjs-dist"}`)), "pdfjs-dist was loaded");
  });
});

describe("update 42A: memory-safe question import (database)", () => {
  let repo: SqliteRepo; let admin: Actor;
  let bank: { id: string; stem: string; options: string[]; skill: string; skillId: string; passage: string; passageText: string | null; correct: string; single: boolean }[] = [];
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const idx = await loadCurriculumIndex(repo, admin);
    const g4 = idx.grades.get(4) ?? [];
    const codeOf = new Map(g4.map((k) => [k.id, k.code]));
    const qs = await repo.findMany("Question", { skillId: { in: g4.map((k) => k.id) } }, { orderBy: [{ field: "id", dir: "asc" }] });
    const opts = await repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => q.id) } });
    const ps = await repo.findMany("ReadingPassage", {}, { select: ["id", "body"] });
    const body = new Map(ps.map((p) => [s(p.id), s(p.body)]));
    const mcType = new Set((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" })).map((x) => s(x.id)));
    bank = qs.filter((q) => !q.deletedAt && q.status !== "ARCHIVED").map((q) => ({
      id: s(q.id), stem: s(q.stem), skill: codeOf.get(s(q.skillId)) ?? "", skillId: s(q.skillId), passage: q.passageId ? passageKey(body.get(s(q.passageId))) : "", passageText: q.passageId ? body.get(s(q.passageId)) ?? null : null,
      options: opts.filter((o) => o.questionId === q.id).sort((a, b) => Number(a.order) - Number(b.order)).map((o) => s(o.text)),
      single: mcType.has(s(q.typeId)) && opts.filter((o) => o.questionId === q.id && o.isCorrect).length === 1,
      correct: "ABCDEFGH"[opts.filter((o) => o.questionId === q.id).sort((a, b) => Number(a.order) - Number(b.order)).findIndex((o) => o.isCorrect)] ?? "A",
    }));
    assert.ok(bank.length > 50, `grade 4 bank: ${bank.length}`);
  });

  test(`a file over ${MAX_IMPORT_ROWS.toLocaleString("en")} questions is refused with “split the file” (nothing else is read)`, async () => {
    assert.equal(MAX_IMPORT_ROWS, 1000);
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => MC(`Which word is a noun, number ${i}?`, ["dog", "run", "fast", "blue"], "x"));
    await assert.rejects(analyzeImport(repo, admin, { fileName: "big.xlsx", bytes: enc("x"), table: table(rows) }), (e: unknown) => {
      assert.ok(e instanceof ImportFileError);
      assert.match(e.message, /The file has 1,001 questions; the limit is 1,000 per file\. Split the file into smaller files/);
      return true;
    });
  });

  test("👯 the fingerprint lookup (indexed column) finds every exact copy of a bank question, and nothing else", async () => {
    const mcs = bank.filter((q) => q.single).slice(0, 120);
    const input = (q: (typeof bank)[number], stem: string, options: string[], correct: string) => ({ skillId: q.skillId, type: "MULTIPLE_CHOICE" as const, stem, level: 4, whyCorrect: "Because.", options: options.map((text, i) => ({ label: "ABCDEFGH"[i], text, correct: "ABCDEFGH"[i] === correct, rationale: "ABCDEFGH"[i] === correct ? null : "Not this one." })) });
    const exact = mcs.map((q) => importHash(input(q, `  ${q.stem.toUpperCase()}  `, q.options, q.correct), q.passageText, null));
    const shuffled = mcs.map((q) => importHash(input(q, q.stem, [...q.options].reverse(), "ABCDEFGH"[q.options.length - 1 - "ABCDEFGH".indexOf(q.correct)]), q.passageText, null));
    const changed = mcs.map((q) => importHash(input(q, q.stem.replace(/\b(\w{4,})\b/, "zebra"), q.options, q.correct), q.passageText, null));
    const otherKey = mcs.map((q) => importHash(input(q, q.stem, q.options, q.correct === "A" ? "B" : "A"), q.passageText, null));
    const noPassage = mcs.filter((q) => q.passageText).map((q) => importHash(input(q, q.stem, q.options, q.correct), null, null));
    const hits = await bankHashHits(repo, [...exact, ...shuffled, ...changed, ...otherKey, ...noPassage]);
    for (const [i, q] of mcs.entries()) {
      assert.ok(hits.get(exact[i]!)?.some((h) => h.id === q.id), `exact copy (case, spacing): ${q.stem}`);
      assert.ok(hits.get(shuffled[i]!)?.some((h) => h.id === q.id), `choices in another order: ${q.stem}`);
      assert.ok(!hits.get(changed[i]!)?.some((h) => h.id === q.id), `another word: ${q.stem}`);
      assert.ok(!hits.get(otherKey[i]!)?.some((h) => h.id === q.id), `another correct answer: ${q.stem}`);
    }
    for (const h of noPassage) assert.ok(!hits.get(h!)?.length || hits.get(h!)!.every((x) => !bank.find((b) => b.id === x.id)?.passageText), "without its passage it is another question");
  });

  test(`the preview is saved ${ANALYZE_CHUNK} rows at a time with the same results as one pass`, async () => {
    const mcs = bank.filter((q) => q.options.length === 4 && !q.passage && q.single);
    assert.ok(mcs.length >= 40, `MC questions without passage: ${mcs.length}`);
    // 260 rows (two chunks): bank copies (duplicates), new questions, and the same new question twice (in-file duplicate)
    const rows: Spec[] = [];
    for (let i = 0; i < 260; i++) {
      const q = mcs[i % mcs.length];
      if (i % 4 === 0) rows.push(MC(q.stem, q.options, q.skill, q.correct));
      else if (i === 250) rows.push(MC("Which sentence uses a comma correctly in a list of items?", ["Red, blue, and green.", "Red blue, and green.", "Red, blue and, green.", "Red blue and green,"], q.skill));
      else rows.push(MC(`Fresh question ${i}: which word names a ${["place", "person", "thing", "animal"][i % 4]} in the sentence about item ${i}?`, [`word${i}a`, `word${i}b`, `word${i}c`, `word${i}d`], q.skill));
    }
    rows.push(MC("Which sentence uses a comma correctly in a list of items?", ["Red, blue, and green.", "Red blue, and green.", "Red, blue and, green.", "Red blue and green,"], mcs[0].skill));
    const jobId = await analyzeImport(repo, admin, { fileName: "two-chunks.xlsx", bytes: enc("two chunks"), table: table(rows) });
    const job = await getImportJob(repo, admin, jobId);
    assert.equal(job.status, "AWAITING_CONFIRMATION");
    assert.equal(job.rows.length, rows.length);
    assert.deepEqual(job.rows.map((r) => r.rowIndex), rows.map((_, i) => i));
    assert.equal(job.totals.total, rows.length);
    assert.equal(job.totals.valid + job.totals.invalid + job.totals.duplicates, rows.length);
    // every bank copy points at a bank question with the same text and choices (fingerprint lookup); new rows are not duplicates
    for (const [i, r] of job.rows.entries()) {
      if (i >= 260) continue;
      if (i % 4 === 0) {
        assert.equal(r.status, "DUPLICATE", `row ${i}: ${r.errors.join(" ")}`);
        const twin = bank.find((b) => b.id === r.duplicate?.id);
        assert.ok(twin && twin.stem === rows[i]["Question Text"] && twin.options.join("|") === [rows[i]["Option A"], rows[i]["Option B"], rows[i]["Option C"], rows[i]["Option D"]].join("|"), `row ${i}`);
      } else if (i !== 250) assert.equal(r.duplicate, null, `row ${i}`);
    }
    const last = job.rows[rows.length - 1];
    assert.equal(last.status, "DUPLICATE");
    assert.equal(last.inFileDuplicate, true);
    assert.match(last.warnings.join(" "), /row 252 in this file/);
    // every preview row is tied to the job (the batch is set when the row is written)
    assert.ok(job.rows.every((r) => !r.detected.input || r.detected.input.batch === jobId));
  });

  test("a file being checked by a server process that stopped is shown as failed (never checked again)", async () => {
    const job = await repo.create("ImportJob", { kind: "QUESTIONS", status: "VALIDATING", fileName: "stopped.xlsx", uploadedById: admin.userId, totalRows: 500, options: { kind: "xlsx", target: "BANK", guard: { inFlight: { boot: "dead-process", at: new Date().toISOString() } } }, createdAt: new Date() });
    const live = await repo.create("ImportJob", { kind: "QUESTIONS", status: "VALIDATING", fileName: "running.xlsx", uploadedById: admin.userId, totalRows: 5, options: { kind: "xlsx", target: "BANK", guard: { inFlight: { boot: BOOT_ID, at: new Date().toISOString() } } }, createdAt: new Date() });
    const list = await listImportJobs(repo, admin);
    const a = list.find((j) => j.id === s(job.id))!, b = list.find((j) => j.id === s(live.id))!;
    assert.equal(a.status, "FAILED");
    assert.match(a.errors[0], /The server stopped while checking this file, so nothing was added\. Upload it again/);
    assert.equal(b.status, "VALIDATING");
    assert.equal((await repo.findUnique("ImportJob", { id: job.id }))!.status, "FAILED");
  });

  test("an import chunk that stopped the server twice is not run a third time (FAILED, clear message); one crash is retried", async () => {
    const mcs = bank.filter((q) => q.options.length === 4 && !q.passage && q.single);
    const rows = Array.from({ length: 3 }, (_, i) => MC(`Crash guard question ${i}: which word is a verb in “The cat ${["runs", "sleeps", "jumps"][i]} home”?`, [["runs", "sleeps", "jumps"][i], "cat", "home", "the"], mcs[0].skill));
    const jobId = await analyzeImport(repo, admin, { fileName: "guard.xlsx", bytes: enc("guard"), table: table(rows) });
    const opts = async () => JSON.parse(JSON.stringify((await repo.findUnique("ImportJob", { id: jobId }))!.options)) as Record<string, unknown>;
    // one earlier attempt died with the server: retried, and the finished chunk clears the mark
    await repo.updateMany("ImportJob", { id: jobId }, { status: "IMPORTING", options: { ...(await opts()), guard: { inFlight: { boot: "dead-1", at: new Date().toISOString() }, crashes: 0 } } });
    const p = await commitImportChunk(repo, admin, jobId);
    assert.equal(p.done, true);
    assert.deepEqual((await opts()).guard, { inFlight: null, crashes: 0 });

    const job2 = await analyzeImport(repo, admin, { fileName: "guard2.xlsx", bytes: enc("guard2"), table: table(rows.map((r) => ({ ...r, "Question Text": `${r["Question Text"]} (second file)` }))) });
    const o2 = JSON.parse(JSON.stringify((await repo.findUnique("ImportJob", { id: job2 }))!.options));
    await repo.updateMany("ImportJob", { id: job2 }, { status: "IMPORTING", options: { ...o2, guard: { inFlight: { boot: "dead-2", at: new Date().toISOString() }, crashes: 1 } } });
    await assert.rejects(commitImportChunk(repo, admin, job2), (e: unknown) => e instanceof ValidationError && /stopped twice/.test(e.message) && /Split the rest of the file/.test(e.message));
    const after = (await repo.findUnique("ImportJob", { id: job2 }))!;
    assert.equal(after.status, "FAILED");
    assert.equal(await repo.count("ImportedQuestionLog", { jobId: job2, status: "IMPORTED" }), 0, "nothing more was imported");
    // the page asking again gets the same clear message, not "could not be read"
    await assert.rejects(commitImportChunk(repo, admin, job2), /stopped twice/);
  });

  test("an AI batch that stopped the server twice stops its job (FAILED) instead of running again", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED" }, { take: 1 }))[0];
    const job = await repo.create("AiJob", { schoolId: admin.schoolId, tool: "QUALITY", scope: { grade: 4, guard: { inFlight: { boot: "dead-ai", at: new Date().toISOString() }, crashes: 1 } }, status: "RUNNING", total: 1, done: 0, failed: 0, createdById: admin.userId, createdAt: new Date(), updatedAt: new Date() });
    await repo.create("AiJobItem", { id: `${s(job.id).slice(0, 12)}x42a`, jobId: job.id, targetId: q.id, status: "PENDING", attempts: 0, error: null, updatedAt: new Date() });
    let called = 0;
    const provider = { complete: async () => { called++; return "[]"; } };
    const r = await tick(repo, admin, {}, { jobId: s(job.id), picked: { ok: true, provider, name: "gemini", model: "test" } as never });
    assert.equal(called, 0, "the AI was not called");
    assert.equal(r.job?.status, "FAILED");
    assert.match(r.message ?? "", /stopped twice/);
    assert.equal((await repo.findUnique("AiJob", { id: job.id }))!.status, "FAILED");
  });

  test("the daily job is not retried a third time after it stopped the server twice the same day", async () => {
    const now = new Date();
    const key = `daily.run.${riyadhDay(now)}`;
    const startedAt = new Date(now.getTime() - 3 * 3_600_000).toISOString();
    await repo.deleteMany("SchoolSetting", { schoolId: admin.schoolId, key });
    await repo.create("SchoolSetting", { schoolId: admin.schoolId, key, value: { startedAt, retries: 2 }, updatedBy: null });
    assert.equal(await maybeRunDaily(repo, admin.schoolId!, now), false);
  });

  test("the streamed roster backup has the same content as the one-piece backup", async () => {
    const scope = { kind: "SCHOOL" } as const;
    const one = await rosterBackup(repo, admin, scope) as { students: Row[]; users: Row[]; tables: Record<string, Row[]>; leftOut: unknown; scope: unknown; kind: string };
    let text = "";
    for await (const c of rosterBackupChunks(repo, admin, scope)) text += c;
    const streamed = JSON.parse(text) as typeof one;
    const norm = (rows: Row[]) => rows.map((r) => JSON.stringify(r)).sort();
    assert.equal(streamed.kind, "roster-backup");
    assert.deepEqual(streamed.scope, one.scope);
    assert.deepEqual(streamed.leftOut, one.leftOut);
    assert.deepEqual(norm(streamed.students), norm(JSON.parse(JSON.stringify(one.students))));
    assert.deepEqual(norm(streamed.users), norm(JSON.parse(JSON.stringify(one.users))));
    assert.deepEqual(Object.keys(streamed.tables), Object.keys(one.tables));
    for (const t of Object.keys(one.tables)) assert.deepEqual(norm(streamed.tables[t]), norm(JSON.parse(JSON.stringify(one.tables[t]))), t);
    assert.ok(Object.values(streamed.tables).some((rows) => rows.length > 0));
  });
});
