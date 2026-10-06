/**
 * Report export: request → validated, permission-checked, rate-limited, audited file.
 *
 * Who can export what
 *   student report    reports:read + access to that student (teacher of the student's class,
 *                     school admin of the school, the student's own parent). Parents have
 *                     reports:read, so they can download their own children's reports and
 *                     nobody else's.
 *   class, standards  reports:export + class access (the class's teacher, school admins);
 *                     school-wide standards also need analytics:school
 *   school summary    reports:export + analytics:school (school admins)
 * Group reports list other students, which is why they need reports:export.
 *
 * Every export is written to the audit log (who, which report, which student/class,
 * format, language, period), never the report's content. Exports are rate limited per
 * user. A refused export reveals nothing: unknown and forbidden targets look the same.
 */
import { resolvePeriod, type PeriodName } from "../../analytics/periods";
import { renderCsv } from "../../reports/csv";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import { LOCALES, type Locale } from "../../reports/i18n";
import { loadLogo } from "../../reports/logo";
import { REPORT_FORMATS, REPORT_KINDS, type Branding, type ReportDoc, type ReportFormat, type ReportKind } from "../../reports/model";
import type { PdfRenderer } from "../../reports/pdf";
import { renderXlsx } from "../../reports/xlsx";
import { loadCalendar } from "../analytics/calendar";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { consumeRateLimit } from "../auth/rate-limit";
import { ValidationError } from "../curriculum-admin";
import type { Repo } from "../seeding/repo";
import type { ReportRequest } from "../../reports/links";

export { reportHref, type ReportRequest } from "../../reports/links";
import { buildClassReport, buildSchoolReport, buildStandardsReport, buildStudentReport, type BuildContext } from "./builders";

export const PERIOD_NAMES: readonly PeriodName[] = ["LAST_7_DAYS", "LAST_30_DAYS", "TERM", "SEMESTER", "SCHOOL_YEAR", "CUSTOM"];
export const REPORT_RATE = { max: 30, windowMs: 10 * 60_000 };

export class RateLimitedError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number) {
    super("Too many report downloads. Please wait a few minutes and try again.");
  }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(v: string | null | undefined, allowed: readonly T[], field: string, fallback?: T): T {
  if ((v === null || v === undefined || v === "") && fallback !== undefined) return fallback;
  if (v && (allowed as readonly string[]).includes(v)) return v as T;
  throw new ValidationError(`Invalid ${field}.`);
}

/** Parses query parameters (from a URL) into a ReportRequest. Unknown values are rejected, never guessed. */
export function parseReportRequest(q: URLSearchParams): ReportRequest {
  const kind = oneOf(q.get("kind"), REPORT_KINDS, "report type");
  const req: ReportRequest = {
    kind,
    format: oneOf(q.get("format"), REPORT_FORMATS, "format", "pdf"),
    locale: oneOf(q.get("lang"), LOCALES, "language", "en"),
    period: oneOf(q.get("period"), PERIOD_NAMES, "period", "TERM"),
  };
  if (req.period === "CUSTOM") {
    const from = q.get("from") ?? "", to = q.get("to") ?? "";
    if (!DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new ValidationError("Choose a start and end date (YYYY-MM-DD).");
    req.from = from;
    req.to = to;
  }
  const id = (name: "studentId" | "classId") => {
    const v = q.get(name);
    if (!v || !ID.test(v)) throw new ValidationError(`Missing or invalid ${name}.`);
    return v;
  };
  if (kind === "student") req.studentId = id("studentId");
  if (kind === "class") req.classId = id("classId");
  if (kind === "standards") {
    req.scope = oneOf(q.get("scope"), ["class", "school"] as const, "scope", "class");
    if (req.scope === "class") req.classId = id("classId");
  }
  return req;
}

// ------------------------------------------------------------------- branding

export const BRANDING_KEY = "reports.branding";

export async function loadBranding(repo: Repo, schoolId: string, brandingDir: string): Promise<Branding & { warning: string | null }> {
  const school = await repo.findUnique("School", { id: schoolId });
  if (!school) throw new ForbiddenError("Not found.");
  const setting = (await repo.findMany("SchoolSetting", { schoolId, key: BRANDING_KEY }))[0];
  let raw: unknown = setting?.value ?? null;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  const nameAr = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).nameAr === "string" ? String((raw as Record<string, unknown>).nameAr).trim().slice(0, 120) : "";
  const { logo, warning } = loadLogo(school.logoUrl ? String(school.logoUrl) : null, brandingDir);
  return { name: String(school.name), nameAr: nameAr || null, logo, warning };
}

// --------------------------------------------------------------------- export

export interface ReportDeps {
  repo: Repo;
  /** Needed for PDF only. */
  pdf?: PdfRenderer;
  fontDir: string;
  brandingDir: string;
  now?: () => Date;
}

export interface ReportFile {
  bytes: Uint8Array;
  contentType: string;
  /** ASCII file name, safe for any browser. */
  filename: string;
  doc: ReportDoc;
}

export const CONTENT_TYPES: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

async function targetSchool(repo: Repo, actor: Actor, req: ReportRequest): Promise<string> {
  const notFound = () => new ForbiddenError("Not found.");
  if (req.kind === "student") {
    const st = await repo.findUnique("Student", { id: req.studentId! });
    if (!st || st.deletedAt) throw notFound();
    return String(st.schoolId);
  }
  if (req.classId) {
    const c = await repo.findUnique("Class", { id: req.classId });
    if (!c || c.deletedAt) throw notFound();
    return String(c.schoolId);
  }
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

export async function exportReport(deps: ReportDeps, actor: Actor, req: ReportRequest): Promise<ReportFile> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();

  // 1. permission for the kind of report (row-level access is enforced by the builders)
  if (req.kind === "student") assertCan(actor, "reports:read");
  else assertCan(actor, "reports:export");
  if (req.kind === "school" || (req.kind === "standards" && req.scope === "school")) assertCan(actor, "analytics:school");
  if (req.format === "pdf" && !deps.pdf) throw new Error("PDF rendering is not configured.");

  // 2. rate limit per user (after the cheap permission check, before any heavy work)
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));

  // 3. the school whose calendar and branding the report uses
  const schoolId = await targetSchool(repo, actor, req);
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "PARENT" && actor.schoolId !== schoolId) throw new ForbiddenError("Not found.");
  let period;
  try {
    period = resolvePeriod(req.period, await loadCalendar(repo, schoolId), now, req.from && req.to ? { from: new Date(`${req.from}T00:00:00Z`), to: new Date(`${req.to}T00:00:00Z`) } : undefined);
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }
  const { warning: _w, ...branding } = await loadBranding(repo, schoolId, deps.brandingDir);
  const me = await repo.findUnique("User", { id: actor.userId });
  const ctx: BuildContext = { repo, actor, locale: req.locale, period, now, generatedBy: String(me?.displayName ?? ""), branding };

  // 4. build (access checked inside) and render
  const doc =
    req.kind === "student" ? await buildStudentReport(ctx, req.studentId!)
    : req.kind === "class" ? await buildClassReport(ctx, req.classId!)
    : req.kind === "standards" ? await buildStandardsReport(ctx, req.scope === "school" ? { school: true } : { classId: req.classId! })
    : await buildSchoolReport(ctx);

  let bytes: Uint8Array;
  if (req.format === "pdf") {
    const fonts = loadFonts(deps.fontDir);
    bytes = await deps.pdf!.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  } else if (req.format === "xlsx") {
    bytes = renderXlsx(doc);
  } else {
    bytes = new Uint8Array(Buffer.from(renderCsv(doc), "utf8"));
  }

  // 5. audit (metadata only)
  await audit(repo, {
    actorId: actor.userId, action: "report.export", entityType: req.kind === "student" ? "Student" : req.classId ? "Class" : "School",
    entityId: req.studentId ?? req.classId ?? schoolId,
    after: { kind: req.kind, format: req.format, locale: req.locale, period: req.period, from: req.from ?? null, to: req.to ?? null, scope: req.scope ?? null, bytes: bytes.length },
    at: now,
  });
  return { bytes, contentType: CONTENT_TYPES[req.format], filename: `${doc.fileStem}.${req.format}`, doc };
}

/** Content-Disposition with an ASCII name (all report names are ASCII slugs). */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `attachment; filename="${ascii}"`;
}
