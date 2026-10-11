import type { FamilyContent, FamilyReportRow, ReportStatus } from "@/server/reports/family-reports";
import { KIND_LABEL } from "@/server/reports/family-reports";

export const STATUS_UI: Record<ReportStatus, { label: string; chip: string }> = {
  DRAFT: { label: "Draft", chip: "bg-slate-100 text-slate-700" },
  PENDING: { label: "Waiting for approval", chip: "bg-amber-100 text-amber-900" },
  RETURNED: { label: "Returned", chip: "bg-red-100 text-red-800" },
  APPROVED: { label: "Approved · with the family", chip: "bg-emerald-100 text-emerald-800" },
  WITHDRAWN: { label: "Withdrawn", chip: "bg-slate-100 text-slate-500" },
};
export function StatusChip({ status }: { status: ReportStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_UI[status].chip}`}>{STATUS_UI[status].label}</span>;
}

/** 👪 The report as the family sees it (also the preview for the teacher and the admin). Prints on A4. */
export function FamilyReportView({ r, content, school }: { r: Pick<FamilyReportRow, "title" | "studentName" | "grade" | "className" | "kind" | "reviewedAt" | "createdAt" | "author">; content?: FamilyContent; school?: string }) {
  const c = content ?? (r as FamilyReportRow).content;
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
      <header className="bg-gradient-to-br from-brand-navy to-indigo-800 px-6 py-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">👪 Family Report{school ? ` · ${school}` : ""}</p>
        <h2 className="mt-1 text-2xl font-extrabold"><bdi>{r.studentName}</bdi></h2>
        <p className="text-sm text-white/80">Grade {r.grade}{r.className ? ` · ${r.className}` : ""} · {r.reviewedAt ?? r.createdAt}{r.author ? ` · ${r.author}` : ""}</p>
        <p className="mt-1 text-xs text-white/60">{r.title} · {KIND_LABEL[r.kind]}</p>
      </header>
      <div className="space-y-5 p-6">
        {c.summary && <p className="rounded-2xl bg-teal-50 px-4 py-3 text-lg leading-relaxed text-teal-950 ring-1 ring-teal-200">{c.summary}</p>}
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
          {c.sections.map((x, i) => (
            <section key={i} className="break-inside-avoid rounded-2xl p-4 ring-1 ring-slate-200">
              <h3 className="font-bold text-brand-navy"><span aria-hidden="true">{x.icon}</span> {x.heading}</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">{x.lines.map((l, k) => <li key={k} className="flex gap-2"><span aria-hidden="true" className="text-brand-teal">•</span><span>{l}</span></li>)}</ul>
            </section>
          ))}
        </div>
        {c.message && <section className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200"><h3 className="font-bold text-amber-900">✉️ A message from the teacher</h3><p className="mt-1 whitespace-pre-line text-slate-800">{c.message}</p></section>}
      </div>
    </article>
  );
}

/** The form fields to edit a report (one line per bullet; an extra empty section to add one). */
export function FamilyReportFields({ title, c }: { title: string; c: FamilyContent }) {
  const sections = [...c.sections, { heading: "", icon: "📌", lines: [] as string[] }];
  const box = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2";
  return (
    <div className="space-y-4">
      <input type="hidden" name="sections" value={sections.length} />
      <label className="block text-sm font-semibold text-slate-700">Title<input name="title" defaultValue={title} maxLength={191} className={box} /></label>
      <label className="block text-sm font-semibold text-slate-700">Summary (the first thing the family reads)<textarea name="summary" defaultValue={c.summary} rows={3} maxLength={2000} className={box} /></label>
      <div className="grid gap-3">
        {sections.map((x, i) => (
          <fieldset key={i} className="min-w-0 rounded-2xl p-3 ring-1 ring-slate-200">
            <div className="flex gap-2"><input name={`icon${i}`} defaultValue={x.icon} aria-label="Icon" maxLength={8} className="w-14 rounded-xl border border-slate-300 px-2 py-2 text-center" /><input name={`heading${i}`} defaultValue={x.heading} placeholder={i === c.sections.length ? "New section (optional)" : "Heading"} aria-label="Section heading" maxLength={120} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 font-semibold" /></div>
            <textarea name={`lines${i}`} defaultValue={x.lines.join("\n")} rows={Math.max(3, x.lines.length + 1)} aria-label="One point per line" placeholder="One point per line" className={`${box} text-sm`} />
          </fieldset>
        ))}
      </div>
      <label className="block text-sm font-semibold text-slate-700">Message to the family (optional)<textarea name="message" defaultValue={c.message} rows={3} maxLength={2000} className={box} /></label>
      <p className="text-xs text-slate-500">To remove a section, empty its heading and its lines.</p>
    </div>
  );
}

/** FormData from FamilyReportFields → the content to save. */
export function contentFromForm(f: FormData): { title: string; content: FamilyContent } {
  const n = Math.min(14, Number(f.get("sections")) || 0);
  const sections = Array.from({ length: n }, (_, i) => ({ icon: String(f.get(`icon${i}`) ?? ""), heading: String(f.get(`heading${i}`) ?? ""), lines: String(f.get(`lines${i}`) ?? "").split(/\r?\n/) }));
  return { title: String(f.get("title") ?? ""), content: { summary: String(f.get("summary") ?? ""), message: String(f.get("message") ?? ""), sections } };
}
