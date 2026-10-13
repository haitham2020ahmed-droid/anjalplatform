/**
 * ⚡ Import questions, faster (Admin → Questions → Import questions, Excel): the preview sends one page of one tab to
 * the browser with the counts of every tab; the import writes each chunk's rows with a few statements (never one per
 * row); rows that fail for the same reason are marked together; per-question writes run a few at a time.
 * The results stay the same (scripts/perf/measure-import.ts compares whole imports before / after on sample files).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { zip } from "../src/reports/zip";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import type { Repo, Row } from "../src/server/seeding/repo";
import { TEMPLATE_HEADERS, shortStandard, type CurriculumIndex } from "../src/imports/questions/template";
import {
  COMMIT_CHUNK, analyzeImport, clientRows, commitImportChunk, getImportJob, getImportPage, listImportJobs, loadCurriculumIndex, updateImportRow, type PreviewRow,
} from "../src/server/admin/question-import";
import { PREVIEW_PAGE, countRow, emptyCounts, inFilter, willImport, type PreviewFilter } from "../src/lib/import-preview";
import { eachLimit } from "../src/server/db/parallel";
import { backfillContentHashes } from "../src/server/questions/dedupe-hash";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
function xlsx(rows: string[][]): Uint8Array {
  const sheet = `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => (v === "" ? "" : `<c r="${colName(c)}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: "xl/workbook.xml", data: '<workbook xmlns:r="r"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

/** Counts the repo's calls per `op:Model` (transactions included). */
function counting(repo: Repo) {
  const n = { all: 0, by: new Map<string, number>() };
  const wrap = (r: Repo): Repo => new Proxy(r, {
    get(t, k) {
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      if (typeof v !== "function") return v;
      if (k === "transaction") return (fn: (x: Repo) => Promise<unknown>) => (v as Repo["transaction"]).call(t, (x: Repo) => fn(wrap(x)));
      return (...a: unknown[]) => { n.all++; const key = `${String(k)}:${String(a[0])}`; n.by.set(key, (n.by.get(key) ?? 0) + 1); return (v as (...b: unknown[]) => unknown).apply(t, a); };
    },
  });
  return { repo: wrap(repo), n, reset: () => { n.all = 0; n.by.clear(); } };
}

describe("⚡ eachLimit", () => {
  test("runs every item, never more than `limit` at once, and throws the first error", async () => {
    let now = 0, peak = 0;
    const seen: number[] = [];
    await eachLimit([...Array(23).keys()], async (x) => { now++; peak = Math.max(peak, now); await new Promise((r) => setTimeout(r, 2)); seen.push(x); now--; }, 4);
    assert.equal(peak, 4);
    assert.deepEqual([...seen].sort((a, b) => a - b), [...Array(23).keys()]);
    await assert.rejects(eachLimit([1, 2, 3, 4, 5, 6], async (x) => { if (x === 2) throw new Error("boom"); }, 2), /boom/);
    await eachLimit([], async () => { throw new Error("never"); });
  });
});

describe("⚡ preview tabs (shared by the server and the page)", () => {
  test("filters, counts and willImport", () => {
    const r = (status: string, extra: Partial<{ decision: string; selected: boolean; duplicate: unknown }> = {}) => ({ status, decision: "IMPORT", selected: true, duplicate: null, ...extra });
    const rows = [r("VALID"), r("INVALID", { selected: false }), r("DUPLICATE", { decision: "SKIP" }), r("DUPLICATE", { decision: "FORCE" }), r("IMPORTED", { duplicate: { id: "q" } }), r("FAILED")];
    const c = emptyCounts();
    for (const x of rows) countRow(c, x);
    assert.deepEqual(c, { all: 6, ready: 1, errors: 2, duplicates: 3, done: 1, toImport: 4 });
    assert.equal(willImport(rows[2]), false);
    assert.equal(inFilter("duplicates", rows[4]), true);
    countRow(c, rows[0], -1);
    assert.equal(c.ready, 0);
  });
});

describe("⚡ import questions: preview page by page, import with few statements", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  let idx: CurriculumIndex;
  let jobId = "";
  const N = 320; // two commit chunks
  const BAD = new Set([5, 77, 150, 151, 300]); // rows with an unknown skill (same error)

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    idx = await loadCurriculumIndex(repo, admin);
    const all = [...idx.grades.entries()].flatMap(([g, skills]) => skills.filter((s) => s.standards.length).map((s) => ({ g, s })));
    const rows: string[][] = [[...TEMPLATE_HEADERS]];
    const words = ["river", "garden", "castle", "planet", "forest", "harbor", "desert", "valley", "island", "market", "tower", "meadow"];
    for (let i = 0; i < N; i++) {
      const { g, s } = all[i % all.length];
      const w = (k: number) => `${words[(i + k) % words.length]}${i}x${k}`;
      const cell: Record<string, string> = {
        "Question Text": `Item ${i}: what does the ${w(1)} near the ${w(2)} show about the ${w(3)}?`, "Question Type": BAD.has(i) ? "Banana" : "Multiple Choice",
        "Option A": w(4), "Option B": w(5), "Option C": w(6), "Option D": w(7), "Correct Answer": "ABCD"[i % 4],
        Explanation: `Because of clue ${i}.`, Grade: String(g), Skill: s.name, Standard: shortStandard(s.standards[0].code),
        "Difficulty Level": String((i % 7) + 1), "Cognitive Level": "Understand",
      };
      rows.push(TEMPLATE_HEADERS.map((h) => cell[h] ?? ""));
    }
    rows[201] = [...rows[200]]; // row 200 (sheet row 202) repeats row 199

    await backfillContentHashes(repo); // once per bank (the questions loaded before fingerprints existed)
    const c = counting(repo);
    jobId = await analyzeImport(c.repo, admin, { fileName: "speed.xlsx", bytes: xlsx(rows) });
    // the preview rows are saved in chunks, never one statement per row
    assert.ok((c.n.by.get("createMany:ImportedQuestionLog") ?? 0) <= Math.ceil(N / 200), "preview rows in a few inserts");
    assert.equal(c.n.by.get("create:ImportedQuestionLog") ?? 0, 0);
    assert.ok(c.n.all < 60, `analyze used ${c.n.all} database calls for ${N} rows`);
  });

  test("the page gets one page of one tab, and counts that match every row", async () => {
    const full = await getImportJob(repo, admin, jobId);
    const fullClient = clientRows(full.rows);
    const want = emptyCounts();
    for (const r of full.rows) countRow(want, r);
    const first = await getImportPage(repo, admin, jobId);
    assert.equal(first.filter, "errors", "a file with errors opens on its errors");
    assert.deepEqual(first.counts, want);
    assert.equal(first.counts.errors, BAD.size);
    assert.equal(first.hasProblems, true);
    assert.deepEqual(first.rows.map((r) => r.rowNumber), [...BAD].map((i) => i + 2));
    for (const filter of ["all", "ready", "errors", "duplicates"] as PreviewFilter[]) {
      const inTab = fullClient.filter((r) => inFilter(filter, r));
      for (let page = 0; page * PREVIEW_PAGE < Math.max(1, inTab.length); page++) {
        const v = await getImportPage(repo, admin, jobId, { filter, page });
        assert.equal(v.shown, inTab.length);
        assert.equal(v.pages, Math.max(1, Math.ceil(inTab.length / PREVIEW_PAGE)));
        assert.deepEqual(v.rows, inTab.slice(page * PREVIEW_PAGE, (page + 1) * PREVIEW_PAGE), `${filter} page ${page + 1}: the same rows as before`);
      }
    }
    const dup = (await getImportPage(repo, admin, jobId, { filter: "duplicates" })).rows;
    assert.ok(dup.some((r) => r.rowNumber === 202 && r.status === "DUPLICATE"), "the repeated row is in Duplicates");
    // a page past the end shows the last page; an unknown tab, the default one
    assert.equal((await getImportPage(repo, admin, jobId, { filter: "all", page: 99 })).page, Math.ceil(N / PREVIEW_PAGE) - 1);
    assert.equal((await getImportPage(repo, admin, jobId, { filter: "nope" })).filter, "errors");
    const sizeAll = JSON.stringify(fullClient).length, sizePage = JSON.stringify((await getImportPage(repo, admin, jobId, { filter: "all" })).rows).length;
    assert.ok(sizePage * 5 < sizeAll, `a page (${sizePage} bytes) is a fraction of the whole file (${sizeAll} bytes)`);
  });

  test("an edit changes one row; the page's counts follow it", async () => {
    const v = await getImportPage(repo, admin, jobId, { filter: "ready" });
    const r0 = v.rows[0];
    const after = clientRows([await updateImportRow(repo, admin, jobId, r0.id, { selected: false })])[0];
    const local = countRow(countRow({ ...v.counts }, r0, -1), after as PreviewRow, 1);
    assert.deepEqual(local, (await getImportPage(repo, admin, jobId)).counts);
    await updateImportRow(repo, admin, jobId, r0.id, { selected: true });
  });

  test("the import writes each chunk with a few statements, and every row ends as before", async () => {
    const beforeRows = new Map((await repo.findMany("ImportedQuestionLog", { jobId })).map((l) => [String(l.id), l]));
    const c = counting(repo);
    const chunks: Map<string, number>[] = [];
    let p;
    do { c.reset(); p = await commitImportChunk(c.repo, admin, jobId); chunks.push(new Map(c.n.by)); } while (!p.done);
    assert.equal(chunks.length, Math.ceil(N / COMMIT_CHUNK));
    for (const by of chunks) {
      const logWrites = [...by.entries()].filter(([k]) => /^(updateMany|create|createMany|deleteMany|upsert):ImportedQuestionLog$/.test(k)).reduce((a, [, v]) => a + v, 0);
      assert.ok(logWrites <= 6, `import rows written with ${logWrites} statements in a chunk (not one per row)`);
      assert.ok((by.get("count:ImportedQuestionLog") ?? 0) === 0, "the progress counts come from one GROUP BY");
    }
    const after = await repo.findMany("ImportedQuestionLog", { jobId }, { orderBy: [{ field: "rowIndex", dir: "asc" }] });
    assert.equal(after.length, N, "every row is kept");
    const qIds = after.filter((l) => l.status === "IMPORTED").map((l) => String(l.questionId));
    assert.equal(qIds.length, N - BAD.size - 1);
    const qs = await repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "tags", "stem"] });
    assert.equal(qs.length, qIds.length, "every imported row names its question");
    for (const q of qs) assert.equal((q.tags as { importJob?: string }).importJob, jobId);
    for (const l of after) {
      const b = beforeRows.get(String(l.id))!;
      assert.ok(b, "the same row ids");
      for (const k of ["jobId", "rowIndex", "decision", "selected", "source", "detected", "createdAt"]) assert.deepEqual(l[k], b[k], `${k} of row ${l.rowIndex} is kept`);
      if (l.status === "IMPORTED") assert.deepEqual([l.errors, l.warnings, l.duplicateOfId], [b.errors, b.warnings, b.duplicateOfId]);
    }
    const failed = after.filter((l) => l.status === "FAILED");
    assert.deepEqual(failed.map((l) => Number(l.rowIndex)), [...BAD]);
    for (const l of failed) assert.deepEqual(l.errors, (beforeRows.get(String(l.id))!.errors as string[]));
    const skipped = after.filter((l) => l.status === "SKIPPED");
    assert.deepEqual(skipped.map((l) => Number(l.rowIndex)), [200], "the repeated row is skipped");
    const job = (await listImportJobs(repo, admin)).find((j) => j.id === jobId)!;
    assert.deepEqual(job.summary, { imported: N - BAD.size - 1, replaced: 0, skipped: 1, failed: BAD.size, duplicatesSkipped: 1 });
    const done = await getImportPage(repo, admin, jobId);
    assert.equal(done.filter, "all");
    assert.equal(done.counts.done, N - BAD.size - 1);
  });

  test("a file whose rows all fail for the same reason is marked with one statement per reason", async () => {
    const rows: string[][] = [[...TEMPLATE_HEADERS]];
    for (let i = 0; i < 260; i++) {
      const cell: Record<string, string> = { "Question Text": `Lost item ${i}?`, "Question Type": "Banana", "Option A": `a${i}`, "Option B": `b${i}`, "Correct Answer": "A", Explanation: "x", Grade: "4", Skill: "No Such Skill At All", Standard: "RL.4.1", "Difficulty Level": "2" };
      rows.push(TEMPLATE_HEADERS.map((h) => cell[h] ?? ""));
    }
    const id = await analyzeImport(repo, admin, { fileName: "lost.xlsx", bytes: xlsx(rows) });
    const c = counting(repo);
    let p;
    do { p = await commitImportChunk(c.repo, admin, id); } while (!p.done);
    assert.equal(p.counts.failed, 260);
    assert.ok((c.n.by.get("updateMany:ImportedQuestionLog") ?? 0) <= 4, `failed rows marked with ${c.n.by.get("updateMany:ImportedQuestionLog")} statements`);
    const errs = (await repo.findMany("ImportedQuestionLog", { jobId: id }, { select: ["errors", "status"] })) as Row[];
    assert.ok(errs.every((l) => l.status === "FAILED" && (l.errors as string[]).length > 0));
  });
});
