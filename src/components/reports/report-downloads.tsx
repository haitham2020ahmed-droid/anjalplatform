/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { reportHref, type ReportRequest } from "../../reports/links";
import type { ReportFormat } from "../../reports/model";

type Base = Omit<ReportRequest, "format" | "locale">;

const FORMAT_LABEL: Record<ReportFormat, string> = { pdf: "PDF", xlsx: "Excel", csv: "CSV" };

/**
 * Download links for one report in English and Arabic. Plain links (no client JS);
 * the route checks permissions, so showing a link never grants access by itself.
 */
export function ReportDownloads({ title, report, formats = ["pdf", "xlsx", "csv"] }: { title: string; report: Base; formats?: ReportFormat[] }) {
  const row = (locale: "en" | "ar", label: string) => (
    <div className="flex flex-wrap items-center gap-2" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <span className="w-16 text-sm text-slate-500">{label}</span>
      {formats.map((format) => (
        <a
          key={format}
          href={reportHref({ ...report, format, locale })}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"
          download
        >
          {FORMAT_LABEL[format]}
        </a>
      ))}
    </div>
  );
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-label={title}>
      <h2 className="text-lg font-bold text-brand-navy">{title}</h2>
      <div className="mt-3 grid gap-2">
        {row("en", "English")}
      </div>
    </section>
  );
}
