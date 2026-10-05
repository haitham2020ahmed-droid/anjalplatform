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
  /** standards report only: one class (classId) or the whole school */
  scope?: "class" | "school";
}

/** Download URL for a report (used by the UI). */
export function reportHref(r: Partial<ReportRequest> & Pick<ReportRequest, "kind" | "format" | "locale">): string {
  const q = new URLSearchParams({ kind: r.kind, format: r.format, lang: r.locale, period: r.period ?? "TERM" });
  if (r.from) q.set("from", r.from);
  if (r.to) q.set("to", r.to);
  if (r.studentId) q.set("studentId", r.studentId);
  if (r.classId) q.set("classId", r.classId);
  if (r.scope) q.set("scope", r.scope);
  return `/api/reports?${q.toString()}`;
}
