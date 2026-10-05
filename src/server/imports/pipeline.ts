/**
 * Import pipeline for external results (MAP Growth, IXL and similar).
 *
 *   stageImport   → read CSV/XLSX, validate every row, match students (own school only),
 *                   find duplicates (inside the file and against stored data), save a preview.
 *                   Status AWAITING_CONFIRMATION (or FAILED if the file cannot be used).
 *   confirmImport → write the valid rows in ONE transaction (duplicates skipped or replaced).
 *   cancelImport  → discard.
 *   errorReport   → CSV of every problem (row, column, value, what to fix), formula-safe.
 *
 * Nothing is written to results until an admin confirms. Official values are stored
 * exactly as imported. Every step is audited. Requires the `imports:run` permission.
 */
import { createHash } from "node:crypto";
import { parseCsv, toCsv } from "../../imports/csv";
import { readXlsx } from "../../imports/xlsx";
import { EXTERNAL_COLUMNS, goalColumns, MAP_COLUMNS, mapHeaders, matchGoalArea, normalizeSubject, parseDate, parseNumber, type DateOrder } from "../../imports/specs";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";

export type ImportKind = "MAP_RESULTS" | "EXTERNAL_RESULTS";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export interface RowIssue { row: number; column: string; value: string; message: string; severity: "error" | "warning" }

interface MapRecord { row: number; studentId: string; studentNumber: string; subject: string; testDate: string; termName: string | null; goalName: string | null; goalCode: string | null; rit: number; ritSE: number | null; percentile: number | null; growthPercentile: number | null; projectedGrowth: number | null; key: string }
interface ExtRecord { row: number; studentId: string; studentNumber: string; skill: string; skillCode: string | null; score: number | null; questions: number | null; timeSpentSec: number | null; takenOn: string; key: string }

export interface StageResult {
  jobId: string;
  status: string;
  totalRows: number;
  validRecords: number;
  errorRows: number;
  duplicates: number;
  issues: RowIssue[];
  preview: Record<string, unknown>[];
  alreadyImportedOn: string | null;
}

function readTable(fileName: string, bytes: Buffer): string[][] {
  const isZip = bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (/\.xlsx$/i.test(fileName) || isZip) return readXlsx(bytes);
  if (/\.(csv|txt)$/i.test(fileName)) {
    const text = bytes.toString("utf8");
    if (text.includes("\u0000")) throw new ValidationError("This file is not a text CSV file.");
    return parseCsv(text);
  }
  throw new ValidationError("Upload a .csv or .xlsx file.");
}

async function studentsByNumber(repo: Repo, schoolId: string, numbers: string[]) {
  const uniq = [...new Set(numbers.filter(Boolean))];
  const rows = uniq.length ? await repo.findMany("Student", { schoolId, studentNumber: { in: uniq }, deletedAt: null }) : [];
  return new Map(rows.map((r) => [String(r.studentNumber), String(r.id)]));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function stageImport(
  repo: Repo,
  actor: Actor,
  input: { kind: ImportKind; fileName: string; bytes: Buffer; dateOrder?: DateOrder; source?: string },
  now = new Date(),
): Promise<StageResult> {
  assertCan(actor, "imports:run");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school before importing.");
  if (input.bytes.length === 0) throw new ValidationError("The file is empty.");
  if (input.bytes.length > MAX_IMPORT_BYTES) throw new ValidationError("The file is larger than 10 MB. Split it into smaller files.");
  const fileName = input.fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120);
  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const dateOrder: DateOrder = input.dateOrder ?? "MDY";
  const source = (input.source ?? (input.kind === "MAP_RESULTS" ? "NWEA_MAP" : "IXL")).toUpperCase();

  const job = await repo.create("ImportJob", {
    kind: input.kind, status: "VALIDATING", fileName, uploadedById: actor.userId, fileSha256: sha,
    options: { dateOrder, source, schoolId: actor.schoolId }, createdAt: now,
  });
  const fail = async (message: string): Promise<StageResult> => {
    const issues: RowIssue[] = [{ row: 0, column: "", value: "", message, severity: "error" }];
    await repo.updateMany("ImportJob", { id: job.id }, { status: "FAILED", errors: issues, completedAt: now });
    await audit(repo, { actorId: actor.userId, action: "import.failed", entityType: "ImportJob", entityId: String(job.id), after: { kind: input.kind, fileName, message } });
    return { jobId: String(job.id), status: "FAILED", totalRows: 0, validRecords: 0, errorRows: 0, duplicates: 0, issues, preview: [], alreadyImportedOn: null };
  };

  let table: string[][];
  try {
    table = readTable(fileName, input.bytes);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (table.length < 2) return fail("The file has no data rows under the header row.");
  const [header, ...rows] = table;
  const cols = input.kind === "MAP_RESULTS" ? MAP_COLUMNS : EXTERNAL_COLUMNS;
  const { index, missing, unknown } = mapHeaders(header, cols);
  if (missing.length) return fail(`Missing required column(s): ${missing.join(", ")}. Download the template to see the expected columns.`);

  const issues: RowIssue[] = [];
  if (unknown.length) issues.push({ row: 1, column: unknown.join(", "), value: "", message: "These columns are not used and will be ignored.", severity: "warning" });
  const cell = (r: string[], key: string) => (index[key] === undefined ? "" : String(r[index[key]] ?? "").trim());
  const students = await studentsByNumber(repo, actor.schoolId, rows.map((r) => cell(r, "studentNumber")));
  const goals = input.kind === "MAP_RESULTS" ? goalColumns(header) : [];
  const records: (MapRecord | ExtRecord)[] = [];
  const errorRows = new Set<number>();
  const err = (row: number, column: string, value: string, message: string) => { issues.push({ row, column, value, message, severity: "error" }); errorRows.add(row); };
  const warn = (row: number, column: string, value: string, message: string) => issues.push({ row, column, value, message, severity: "warning" });

  rows.forEach((r, i) => {
    const rowNo = i + 2; // spreadsheet row number (header = 1)
    const num = cell(r, "studentNumber");
    const studentId = students.get(num);
    if (!num) return err(rowNo, "student", "", "Student number is empty.");
    if (!studentId) return err(rowNo, "student", num, "No student with this number in your school.");
    if (input.kind === "MAP_RESULTS") {
      const subj = normalizeSubject(cell(r, "subject"));
      if (subj.skip) return warn(rowNo, "subject", cell(r, "subject"), subj.skip);
      if (!subj.subject) return err(rowNo, "subject", "", "Subject is empty.");
      const dt = parseDate(cell(r, "testDate"), dateOrder);
      if (dt.error) return err(rowNo, "test date", cell(r, "testDate"), `Test date ${dt.error}.`);
      const rit = parseNumber(cell(r, "rit"), { min: 100, max: 350, integer: true, label: "RIT" });
      const se = parseNumber(cell(r, "ritSE"), { min: 0, max: 20, label: "Standard error" });
      const pct = parseNumber(cell(r, "percentile"), { min: 1, max: 99, integer: true, label: "Percentile" });
      const gp = parseNumber(cell(r, "growthPercentile"), { min: 1, max: 99, integer: true, label: "Growth percentile" });
      const pg = parseNumber(cell(r, "projectedGrowth"), { min: -50, max: 100, label: "Projected growth" });
      for (const [p, col] of [[rit, "RIT"], [se, "standard error"], [pct, "percentile"], [gp, "growth percentile"], [pg, "projected growth"]] as const)
        if (p.error) err(rowNo, col, "", p.error);
      if (rit.value === null || rit.value === undefined) err(rowNo, "RIT", "", "RIT is empty.");
      if (errorRows.has(rowNo)) return;
      const base = { row: rowNo, studentId, studentNumber: num, subject: subj.subject, testDate: iso(dt.date!), termName: cell(r, "termName") || null };
      records.push({ ...base, goalName: null, goalCode: null, rit: rit.value!, ritSE: se.value ?? null, percentile: pct.value ?? null, growthPercentile: gp.value ?? null, projectedGrowth: pg.value ?? null, key: `${studentId}|${base.testDate}|${subj.subject}|` });
      for (const g of goals) {
        const gName = String(r[g.name] ?? "").trim();
        const gRaw = String(r[g.rit] ?? "").trim();
        if (!gName && !gRaw) continue;
        const gRit = parseNumber(gRaw, { min: 100, max: 350, integer: true, label: `Goal ${g.n} RIT` });
        if (!gName || gRit.error || gRit.value === null) { warn(rowNo, `goal ${g.n}`, gRaw, gRit.error ?? "Goal name or RIT missing; goal skipped."); continue; }
        const gSE = g.se === null ? { value: null } : parseNumber(String(r[g.se] ?? ""), { min: 0, max: 30, label: `Goal ${g.n} standard error` });
        const code = matchGoalArea(gName);
        if (!code) warn(rowNo, `goal ${g.n}`, gName, "Goal name not recognised; stored without a platform goal area.");
        records.push({ ...base, goalName: gName, goalCode: code, rit: gRit.value!, ritSE: gSE.value ?? null, percentile: null, growthPercentile: null, projectedGrowth: null, key: `${studentId}|${base.testDate}|${subj.subject}|${gName.toLowerCase()}` });
      }
    } else {
      const skill = cell(r, "skill");
      if (!skill) return err(rowNo, "skill", "", "Skill is empty.");
      const dt = parseDate(cell(r, "date"), dateOrder);
      if (dt.error) return err(rowNo, "date", cell(r, "date"), `Date ${dt.error}.`);
      const sc = parseNumber(cell(r, "score"), { min: 0, max: 100, label: "Score" });
      const q = parseNumber(cell(r, "questions"), { min: 0, max: 100_000, integer: true, label: "Questions" });
      const tm = parseNumber(cell(r, "timeMinutes"), { min: 0, max: 100_000, label: "Time spent" });
      for (const [p, col] of [[sc, "score"], [q, "questions"], [tm, "time spent"]] as const) if (p.error) err(rowNo, col, "", p.error);
      if (errorRows.has(rowNo)) return;
      const takenOn = iso(dt.date!);
      records.push({ row: rowNo, studentId, studentNumber: num, skill, skillCode: cell(r, "skillCode") || null, score: sc.value ?? null, questions: q.value ?? null, timeSpentSec: tm.value === null || tm.value === undefined ? null : Math.round(tm.value * 60), takenOn, key: `${studentId}|${source}|${(cell(r, "skillCode") || skill).toLowerCase()}|${takenOn}` });
    }
  });

  // duplicates: inside the file, then against stored results
  const seen = new Set<string>();
  let duplicates = 0;
  for (const rec of records) {
    if (seen.has(rec.key)) { (rec as { dupInFile?: boolean }).dupInFile = true; duplicates++; warn(rec.row, "", "", "Same result appears earlier in this file; this copy will be skipped."); }
    seen.add(rec.key);
  }
  const ids = [...new Set(records.map((r) => r.studentId))];
  const existing = new Set<string>();
  if (input.kind === "MAP_RESULTS" && ids.length) {
    for (const m of await repo.findMany("MapResult", { studentId: { in: ids } }))
      existing.add(`${m.studentId}|${iso(new Date(String(m.testDate instanceof Date ? m.testDate.toISOString() : m.testDate)))}|${m.subject}|${m.goalName ? String(m.goalName).toLowerCase() : ""}`);
  } else if (ids.length) {
    const src = await repo.findUnique("ExternalAssessmentSource", { code: source });
    if (src) for (const x of await repo.findMany("ExternalAssessmentResult", { studentId: { in: ids }, sourceId: src.id }))
      existing.add(`${x.studentId}|${source}|${String((x.raw as { skillCode?: string; skill?: string })?.skillCode || x.externalSkill).toLowerCase()}|${x.takenOn ? iso(new Date(String(x.takenOn instanceof Date ? x.takenOn.toISOString() : x.takenOn))) : ""}`);
  }
  for (const rec of records) if (!(rec as { dupInFile?: boolean }).dupInFile && existing.has(rec.key)) { (rec as { dupInDb?: boolean }).dupInDb = true; duplicates++; }

  const prior = (await repo.findMany("ImportJob", { fileSha256: sha, kind: input.kind, status: "COMPLETED" }))[0];
  const usable = records.filter((r) => !(r as { dupInFile?: boolean }).dupInFile);
  const preview = usable.slice(0, 20).map(({ key: _k, studentId: _s, ...rest }) => rest);
  const status = usable.length ? "AWAITING_CONFIRMATION" : "FAILED";
  await repo.updateMany("ImportJob", { id: job.id }, {
    status, totalRows: rows.length, validRows: usable.length, errorRows: errorRows.size, duplicateRows: duplicates,
    preview, errors: issues, payload: usable, ...(status === "FAILED" ? { completedAt: now } : {}),
  });
  await audit(repo, { actorId: actor.userId, action: "import.staged", entityType: "ImportJob", entityId: String(job.id), after: { kind: input.kind, fileName, rows: rows.length, valid: usable.length, errors: errorRows.size, duplicates } });
  return {
    jobId: String(job.id), status, totalRows: rows.length, validRecords: usable.length, errorRows: errorRows.size, duplicates, issues, preview,
    alreadyImportedOn: prior ? iso(new Date(String(prior.completedAt instanceof Date ? prior.completedAt.toISOString() : prior.completedAt ?? prior.createdAt))) : null,
  };
}

async function ownJob(repo: Repo, actor: Actor, jobId: string): Promise<Row> {
  assertCan(actor, "imports:run");
  const job = await repo.findUnique("ImportJob", { id: jobId });
  const opts = (job?.options ?? {}) as { schoolId?: string };
  if (!job || (actor.role !== "SUPER_ADMIN" && opts.schoolId !== actor.schoolId)) throw new ForbiddenError("Import not found.");
  return job;
}

export async function confirmImport(repo: Repo, actor: Actor, jobId: string, opts: { duplicates: "skip" | "replace" } = { duplicates: "skip" }, now = new Date()) {
  const job = await ownJob(repo, actor, jobId);
  if (job.status !== "AWAITING_CONFIRMATION") throw new ValidationError("This import is not waiting for confirmation.");
  const records = (job.payload ?? []) as (MapRecord | ExtRecord)[];
  const options = job.options as { source: string };
  const summary = { written: 0, skippedDuplicates: 0, replaced: 0 };
  await repo.transaction(async (tx) => {
    await tx.updateMany("ImportJob", { id: jobId }, { status: "IMPORTING" });
    if (job.kind === "MAP_RESULTS") {
      const areas = new Map((await tx.findMany("MapGoalArea")).map((a) => [String(a.code), String(a.id)]));
      for (const r of records as (MapRecord & { dupInDb?: boolean })[]) {
        if (r.dupInDb) {
          if (opts.duplicates === "skip") { summary.skippedDuplicates++; continue; }
          const same = (await tx.findMany("MapResult", { studentId: r.studentId, subject: r.subject, goalName: r.goalName }))
            .filter((m) => iso(new Date(String(m.testDate instanceof Date ? m.testDate.toISOString() : m.testDate))) === r.testDate);
          if (same.length) await tx.deleteMany("MapResult", { id: { in: same.map((m) => m.id) } });
          summary.replaced++;
        }
        await tx.create("MapResult", {
          studentId: r.studentId, importJobId: jobId, testDate: new Date(`${r.testDate}T00:00:00Z`), subject: r.subject, termName: r.termName,
          goalName: r.goalName, goalAreaId: r.goalCode ? areas.get(r.goalCode) ?? null : null, rit: r.rit, ritSE: r.ritSE,
          achievementPercentile: r.percentile, growthPercentile: r.growthPercentile, projectedGrowth: r.projectedGrowth, importedAt: now,
        });
        summary.written++;
      }
    } else {
      const src = await tx.upsert("ExternalAssessmentSource", { code: options.source }, { name: `${options.source} (imported reports)` });
      for (const r of records as (ExtRecord & { dupInDb?: boolean })[]) {
        if (r.dupInDb && opts.duplicates === "skip") { summary.skippedDuplicates++; continue; }
        await tx.create("ExternalAssessmentResult", {
          sourceId: src.id, studentId: r.studentId, importJobId: jobId, externalSkill: r.skill, score: r.score, questions: r.questions,
          timeSpentSec: r.timeSpentSec, takenOn: new Date(`${r.takenOn}T00:00:00Z`), raw: { skill: r.skill, skillCode: r.skillCode, row: r.row }, importedAt: now,
        });
        summary.written++;
      }
    }
    await tx.updateMany("ImportJob", { id: jobId }, { status: "COMPLETED", completedAt: now, summary, payload: null });
  });
  await audit(repo, { actorId: actor.userId, action: "import.confirmed", entityType: "ImportJob", entityId: jobId, after: { ...summary, duplicates: opts.duplicates } });
  return summary;
}

export async function cancelImport(repo: Repo, actor: Actor, jobId: string, now = new Date()): Promise<void> {
  const job = await ownJob(repo, actor, jobId);
  if (job.status === "COMPLETED") throw new ValidationError("A completed import cannot be cancelled.");
  await repo.updateMany("ImportJob", { id: jobId }, { status: "CANCELLED", payload: null, completedAt: now });
  await audit(repo, { actorId: actor.userId, action: "import.cancelled", entityType: "ImportJob", entityId: jobId });
}

export async function errorReportCsv(repo: Repo, actor: Actor, jobId: string): Promise<string> {
  const job = await ownJob(repo, actor, jobId);
  const issues = (job.errors ?? []) as RowIssue[];
  return toCsv([["row", "column", "value", "problem", "type"], ...issues.map((i) => [i.row || "", i.column, i.value, i.message, i.severity])]);
}

export async function listImports(repo: Repo, actor: Actor): Promise<Row[]> {
  assertCan(actor, "imports:run");
  const jobs = await repo.findMany("ImportJob", { kind: { in: ["MAP_RESULTS", "EXTERNAL_RESULTS"] } });
  return jobs.filter((j) => actor.role === "SUPER_ADMIN" || (j.options as { schoolId?: string })?.schoolId === actor.schoolId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
}
