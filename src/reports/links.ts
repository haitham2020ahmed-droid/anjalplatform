/**
 * Report request shape and download URLs. Kept free of server code so page
 * components can build links without importing the export service.
 */
import type { PeriodName } from "../analytics/periods";
import type { Locale } from "./i18n";
import type { ReportFormat, ReportKind } from "./model";

export interface ReportRequest {
  kind: ReportKind;
  format: ReportFormat;
  locale: Locale;
  period: PeriodName;
  from?: string;
  to?: string;
  studentId?: string;
  classId?: string;
  /** standards, grammar and ReadRise reports: one class (classId) or the whole school */
  scope?: "class" | "school";
  /** Update 39C reports (grammar, games, ReadMaster): the window in days (7, 30, 90 or 365) */
  days?: number;
  /** the early-warning export (school scope): only one grade / one teacher's classes */
  gradeId?: string;
  teacherId?: string;
}

/** Download URL for a report (used by the UI). */
export function reportHref(r: Partial<ReportRequest> & Pick<ReportRequest, "kind" | "format" | "locale">): string {
  const q = new URLSearchParams({ kind: r.kind, format: r.format, lang: r.locale, period: r.period ?? "TERM" });
  if (r.from) q.set("from", r.from);
  if (r.to) q.set("to", r.to);
  if (r.studentId) q.set("studentId", r.studentId);
  if (r.classId) q.set("classId", r.classId);
  if (r.scope) q.set("scope", r.scope);
  if (r.days) q.set("days", String(r.days));
  if (r.gradeId) q.set("gradeId", r.gradeId);
  if (r.teacherId) q.set("teacherId", r.teacherId);
  if (r.format === "pdf") q.set("print", "1"); // r84: a print page the browser saves as a PDF (the print window opens once)
  return `/api/reports?${q.toString()}`;
}
