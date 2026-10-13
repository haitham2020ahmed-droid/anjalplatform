/**
 * ⚡ Admin → Questions → Import questions, end to end (offline, SQLite demo school, never a real database):
 *   FILES=/path/a.xlsx,/path/b.xlsx npx tsx scripts/perf/measure-import.ts      (LATENCY_MS=5 per database call)
 *   (default: every .xlsx in IMPORT_DIR, default /tmp/qs/mapx)
 *
 * For each file: parse (extract) → analyze (preview rows saved) → preview (the job page's data + the bytes sent to
 * the browser) → commit (chunk by chunk, as the page drives it). Reports time and database calls per stage, and per
 * 1,000 rows. SNAPSHOT=out.json writes what the import produced (rows, questions, choices, answers, audit counts)
 * with every random id replaced by a stable key, to compare two versions of the code on the same files.
 */
import { performance } from "node:perf_hooks";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoDatabase, ROOT } from "../../tests/helpers/db";
import { resolveActor } from "../../src/server/auth/actor";
import { seedQuestions } from "../../src/server/seeding/questions";
import { loadBank } from "../../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { addSkillSets, loadSkillSetsFile } from "../../src/server/questions/skill-sets";
import { parseCurriculumMap } from "../../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../../src/server/curriculum-map/seed";
import { zip } from "../../src/reports/zip";
import { extract } from "../../src/imports/questions/extract";
import * as qi from "../../src/server/admin/question-import";
import { editorOptions } from "../../src/app/admin/questions/editor-data";
import { MeasuringRepo, freshStats } from "./measuring-repo";
import type { Row } from "../../src/server/seeding/repo";

const LATENCY = Number(process.env.LATENCY_MS ?? 5);
const DIR = process.env.IMPORT_DIR ?? "/tmp/qs/mapx";
const FILES = process.env.FILES ? process.env.FILES.split(",") : readdirSync(DIR).filter((f) => f.endsWith(".xlsx")).sort((a, b) => a.replace(/^.*Part/, "").localeCompare(b.replace(/^.*Part/, ""))).map((f) => join(DIR, f));
const NOW = new Date("2026-10-13T08:00:00Z");
const s = (v: unknown) => String(v ?? "");
const j = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v);

type Stage = { ms: number; calls: number; rows: number; extra?: string };
const totals: Record<string, Stage & { n: number }> = {};
const add = (k: string, st: Stage) => { const t = (totals[k] ??= { ms: 0, calls: 0, rows: 0, n: 0 }); t.ms += st.ms; t.calls += st.calls; t.rows += st.rows; t.n++; };

async function main() {
  const t0 = performance.now();
  const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  // the platform's skills (the gap sets, as tests/skill-pickers does) and the Curriculum Map
  const gap = (await loadSkillSetsFile("gap-skill-sets.json")).map((x) => ({ ...x, questions: x.questions.slice(0, 2) }));
  await addSkillSets(repo, admin.schoolId!, gap);
  await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
  const m = new MeasuringRepo(repo);
  console.log(`setup ${Math.round(performance.now() - t0)} ms, bank questions: ${await repo.count("Question", {})}, latency ${LATENCY} ms/call`);
  const stage = async <T>(name: string, fn: () => Promise<T> | T): Promise<[T, Stage]> => {
    m.stats = freshStats(); m.latency = LATENCY;
    const t = performance.now();
    const r = await fn();
    const st = { ms: Math.round(performance.now() - t), calls: m.stats.calls, rows: m.stats.rows };
    if (process.env.PROFILE) console.log(`    [${name}] ${[...m.stats.byModel.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, Number(process.env.PROFILE) || 12).map(([k, v]) => `${k} ${v.calls}/${v.rows}`).join(", ")}`);
    m.latency = 0;
    add(name, st);
    return [r, st];
  };
  const jobs: string[] = [];
  let rowsAll = 0;
  // FILL_GRADE=1: the sample files leave Grade empty and their skill names exist in several grades (every row then
  // fails with “Choose a skill”); this fills Grade with the lowest grade that has the row's skill, so the rows import
  const idx0 = await qi.loadCurriculumIndex(repo, admin);
  const gradeOfSkill = (name: string) => [...idx0.grades.entries()].sort((a, b) => a[0] - b[0]).find(([, l]) => l.some((k) => k.name.toLowerCase() === name.trim().toLowerCase()))?.[0];
  for (const file of FILES) {
    let bytes = new Uint8Array(readFileSync(file));
    if (process.env.FILL_GRADE) {
      const t = extract("x.xlsx", bytes).table;
      const g = t[0].indexOf("Grade"), k = t[0].indexOf("Skill");
      for (const r of t.slice(1)) { while (r.length < t[0].length) r.push(""); if (!r[g]) r[g] = String(gradeOfSkill(r[k] ?? "") ?? 4); }
      bytes = xlsxOf(t);
    }
    const name = file.split("/").pop()!.replace(/^[0-9a-f]+-\d+_/, "");
    const [ex, parse] = await stage("1 parse", () => extract(name, bytes));
    const [jobId, analyze] = await stage("2 analyze", () => qi.analyzeImport(m, admin, { fileName: name, bytes }, NOW));
    jobs.push(jobId);
    let sent = 0;
    const [, preview] = await stage("3 preview", async () => {
      // the page's data: one page of the default tab (getImportPage), or, before it existed, every row (getImportJob)
      const paged = (qi as unknown as { getImportPage?: (r: typeof m, a: typeof admin, id: string) => Promise<qi.ImportJobView> }).getImportPage;
      const view = paged ? await paged(m, admin, jobId) : await qi.getImportJob(m, admin, jobId).then((v) => ({ ...v, rows: qi.clientRows(v.rows) }));
      const opts = await editorOptions(m, admin.schoolId!);
      sent = JSON.stringify({ view, opts }).length;
    });
    preview.extra = `${Math.round(sent / 1024)} KB to the browser`;
    let chunks = 0, maxMs = 0, maxCalls = 0;
    const [, commit] = await stage("4 commit", async () => {
      for (;;) {
        const c0 = m.stats.calls, t = performance.now();
        const p = await qi.commitImportChunk(m, admin, jobId, { publish: false }, NOW);
        chunks++; maxMs = Math.max(maxMs, performance.now() - t); maxCalls = Math.max(maxCalls, m.stats.calls - c0);
        if (p.done) break;
      }
    });
    commit.extra = `${chunks} chunks, slowest ${Math.round(maxMs)} ms / ${maxCalls} calls`;
    const n = ex.table.length - 1;
    rowsAll += n;
    console.log(`\n${name}: ${n} rows`);
    for (const [k, st] of [["parse", parse], ["analyze", analyze], ["preview", preview], ["commit", commit]] as const) console.log(`  ${k.padEnd(8)} ${String(st.ms).padStart(6)} ms ${String(st.calls).padStart(6)} calls ${String(st.rows).padStart(7)} rows read  ${st.extra ?? ""}`);
  }
  console.log(`\nper 1,000 rows (${rowsAll} rows, ${FILES.length} files) @${LATENCY}ms/call`);
  for (const [k, t] of Object.entries(totals)) console.log(`  ${k.padEnd(10)} ${String(Math.round((t.ms * 1000) / rowsAll)).padStart(6)} ms ${String(Math.round((t.calls * 1000) / rowsAll)).padStart(6)} calls`);

  if (process.env.SNAPSHOT) writeFileSync(process.env.SNAPSHOT, JSON.stringify(await snapshot(repo, jobs), null, 1));
}

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** A one-sheet .xlsx named Questions (inline strings). */
function xlsxOf(rows: string[][]): Uint8Array {
  const cell = (v: string, c: number, i: number) => (v === "" ? "" : `<c r="${colName(c)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
  const sheet = `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(v, c, i)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: "xl/workbook.xml", data: '<workbook xmlns:r="r"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

/** What the imports produced, with random ids replaced by stable keys (file / row / stem). */
async function snapshot(repo: MeasuringRepo | Awaited<ReturnType<typeof demoDatabase>>["repo"], jobs: string[]) {
  const out: unknown[] = [];
  const skills = new Map((await repo.findMany("Skill", {}, { select: ["id", "code"] })).map((k) => [s(k.id), s(k.code)]));
  const stds = new Map((await repo.findMany("Standard", {}, { select: ["id", "code"] })).map((k) => [s(k.id), s(k.code)]));
  const types = new Map((await repo.findMany("QuestionType", {}, { select: ["id", "code"] })).map((k) => [s(k.id), s(k.code)]));
  const stemOf = async (id: unknown) => (id ? s((await repo.findUnique("Question", { id }))?.stem).slice(0, 80) : null);
  for (const jobId of jobs) {
    const job = (await repo.findUnique("ImportJob", { id: jobId }))!;
    const o = j(job.options) as Record<string, unknown>;
    out.push({ job: { fileName: job.fileName, status: job.status, totals: [job.totalRows, job.validRows, job.errorRows, job.duplicateRows], summary: j(job.summary), errors: j(job.errors), notes: o.notes, dupSkipped: o.dupSkipped, postErrors: o.postErrors } });
    const logs = await repo.findMany("ImportedQuestionLog", { jobId }, { orderBy: [{ field: "rowIndex", dir: "asc" }] });
    for (const l of logs) {
      const det = j(l.detected) as qi.DetectedRow;
      const input = det.input ? { ...det.input, batch: undefined, skillId: skills.get(s(det.input.skillId)) ?? det.input.skillId } : null;
      const q: Row | null = l.questionId ? await repo.findUnique("Question", { id: l.questionId }) : null;
      let question: unknown = null;
      if (q) {
        const tags = j(q.tags) as Record<string, unknown>;
        const passage = q.passageId ? await repo.findUnique("ReadingPassage", { id: q.passageId }) : null;
        question = {
          stem: q.stem, skill: skills.get(s(q.skillId)), standard: stds.get(s(q.standardId)) ?? null, type: types.get(s(q.typeId)), status: q.status, level: q.difficultyLevel, irtB: q.irtB, secs: q.estimatedSeconds,
          content: j(q.content), hash: q.contentHash, lexile: q.lexile, map: [q.mapTest, q.mapInstructionalArea, q.mapAreaSource], tags: { ...tags, importJob: undefined }, origin: q.origin,
          passage: passage ? { title: passage.title, words: passage.wordCount, grade: passage.gradeLevel, status: passage.status, prl: passage.platformReadingLevel } : null,
          options: (await repo.findMany("QuestionOption", { questionId: q.id })).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => [x.label, x.text, x.isCorrect, x.rationale, x.order]),
          answers: (await repo.findMany("QuestionAnswer", { questionId: q.id })).map((x) => [j(x.value), x.isPrimary]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
          expl: (await repo.findMany("QuestionExplanation", { questionId: q.id })).map((x) => [x.kind, j(x.body)]),
          uses: (await repo.findMany("QuestionUse", { questionId: q.id })).map((x) => x.use).sort(),
          links: (await repo.findMany("QuestionMapLink", { questionId: q.id })).length,
          audits: (await repo.findMany("AuditLog", { entityId: q.id })).map((x) => x.action).sort(),
          intel: [q.dok, q.dokSource, q.estimatedLevel, q.estimatedB, j(q.difficultyFactors), q.textLevel, q.difficultySource, s(q.intelligenceAt).slice(0, 10)],
          suggestions: (await repo.findMany("AiSuggestion", { questionId: q.id })).map((x) => [x.tool, x.kind, x.detail, j(x.data), x.status]),
          fixes: (await repo.findMany("QuestionStandardFix", { questionId: q.id })).map((x) => [x.fromCode, x.toCode, x.status]),
          misconceptions: (await repo.findMany("QuestionOption", { questionId: q.id })).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => [x.misconception ?? null, x.misconceptionSource ?? null]),
        };
      }
      out.push({ row: l.rowIndex, status: l.status, decision: l.decision, selected: Boolean(l.selected), errors: j(l.errors), warnings: j(l.warnings), dupOf: await stemOf(l.duplicateOfId), sim: l.similarity, source: l.source, input, meta: det.meta, question });
    }
    out.push({ audits: (await repo.findMany("AuditLog", { entityId: jobId })).map((x) => [x.action, j(x.after)]).sort((a, b) => s(a[0]).localeCompare(s(b[0]))) });
  }
  const ai = await repo.findMany("AiJob", { tool: "COMPLETE" });
  out.push({ aiJobs: ai.length, aiItems: await repo.count("AiJobItem", {}), aiTotals: ai.map((x) => x.total).sort() });
  out.push({ questions: await repo.count("Question", {}), passages: await repo.count("ReadingPassage", {}), auditTotal: await repo.count("AuditLog", {}) });
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
