import Link from "next/link";
import { getT } from "@/i18n/server";
import { repo } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { isReportShared } from "@/server/insights/parent-report";
import { staffFamilyReports } from "@/server/reports/family-reports";
import { shareManyAction } from "@/app/teacher/reports/actions";
import { LineIcon } from "../ui/line-icon";
import { NavSelect, PrintThisPage } from "./report-bar-client";
import { carryQuery, DEFAULT_PERIOD, openReportUrl, REPORT_PERIODS, type ReportDef, type ReportMatch } from "./report-catalog";
import { isPrintHref } from "@/lib/print-href";

/**
 * The bar on top of every report (drawn by the page frame when the address is a report of the catalogue): back to
 * Reports · the report's name · class switcher · student picker (student reports) · date range (this week / month /
 * term, default term) · ⬇ Download (PDF / print, plus Excel / CSV where the report has them) · Send to family (the
 * family progress report). Only the person's readable classes and their students are offered; the report page
 * itself still checks access, so a typed address grants nothing.
 */
export async function ReportBar({ actor, report: r, at, search }: { actor: Actor; report: ReportDef; at: ReportMatch; search: string }) {
  const { t } = await getT();
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const classes = (await readableClasses(repo, actor).catch(() => [])).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  let classId = classes.find((c) => c.id === at.classId)?.id ?? "";
  // a student report's address names the student only: open on the student's class (one of the person's classes)
  if (!classId && at.studentId && classes.length) {
    const m = await repo.findMany("ClassMembership", { studentId: at.studentId, leftAt: null, classId: { in: classes.map((c) => c.id) } }, { select: ["classId"] });
    classId = String(m[0]?.classId ?? "");
  }
  classId ||= classes[0]?.id ?? "";
  // 🚫 r91: no live counts here (Needs attention / Early warning / Enrichment) — this bar renders on every report
  // page, and fetching them per-page blew the DB-call perf budget (/teacher/students/[id], /teacher/progress, …).
  // The live numbers stay on the Reports hub's "Daily check" section (one fetch, one page); here just quick links.
  const daily = [
    { label: "Needs attention", href: `/teacher/reports/needs-attention${classId ? `?${new URLSearchParams([["classId", classId]])}` : ""}` },
    { label: "Early warning", href: "/teacher/reports/early-warning" },
    { label: "Enrichment opportunities", href: `/teacher/plans?${new URLSearchParams([["kind", "ENRICHMENT"], ...(classId ? [["classId", classId]] : [])])}` },
  ];
  const ids = r.studentUrl && classId ? await classMembers(repo, classId) : [];
  const names = ids.length ? await studentNames(repo, ids) : new Map<string, { name: string }>();
  const students = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  const studentId = at.scope === "student" && at.studentId && students.some((s) => s.id === at.studentId) ? at.studentId : "";
  const period = at.period ?? DEFAULT_PERIOD;
  const go = (o: { classId?: string; studentId?: string; period?: typeof period; scope?: "class" | "student" }) => {
    const cid = o.classId ?? classId;
    const sid = o.scope === "class" ? undefined : o.studentId ?? (studentId || undefined);
    return carryQuery(openReportUrl(r, { classId: cid, studentId: sid, period: o.period ?? period, firstStudent: students[0]?.id }) ?? "/teacher/reports", search);
  };
  const current = go({});
  // a student-only report: another class opens on that class's first student (through the Reports page)
  const classHref = (cid: string) => (r.classUrl ? go({ classId: cid, scope: "class" }) : cid === classId ? current : `/teacher/reports?${new URLSearchParams({ report: r.key, classId: cid })}`);
  const files = r.files && classId ? r.files({ classId, studentId: studentId || undefined, period, scope: studentId ? "student" : "class" }) : [];
  // family progress report: has it been shared already / is it waiting for the admin?
  let status: "shared" | "waiting" | "" = "";
  if (r.send && studentId && actor.schoolId) {
    const fam = await staffFamilyReports(repo, actor).catch(() => []);
    status = (await isReportShared(repo, String(actor.schoolId), studentId).catch(() => false)) ? "shared"
      : fam.some((x) => x.kind === "PROGRESS" && x.status === "PENDING" && x.studentId === studentId) ? "waiting" : "";
  }
  const msg = q.get("msg");
  const btn = "inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold";
  const seg = (on: boolean) => `inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition ${on ? "bg-white text-brand-navy shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-brand-navy"}`;
  return (
    <section aria-label={t("Report options")} data-report-bar={r.key} className="report-bar sticky top-2 z-10 mb-5 rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80 print:hidden">
      <div aria-label={t("Daily check")} data-daily-strip className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-t-2xl border-b border-slate-100 bg-slate-50/70 px-4 py-1.5 text-xs">
        {daily.map((d) => (
          <Link key={d.label} prefetch={false} href={d.href} className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-brand-teal">
            <span aria-hidden="true">•</span>{t(d.label)}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
        <Link prefetch={false} href="/teacher/reports" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-teal">
          <span aria-hidden="true" className="inline-block rtl:rotate-180">‹</span>{t("All reports")}
        </Link>
        <span aria-hidden="true" className="h-5 w-px bg-slate-200" />
        <p className="flex min-w-0 items-center gap-2 font-semibold text-brand-navy">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-brand-navy ring-1 ring-slate-200"><LineIcon name={r.line} className="h-4 w-4" /></span>
          <span className="truncate">{t(r.title)}</span>
          <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline">{t(r.category)}</span>
        </p>
        <span className="flex-1" />
        <details className="group relative">
          <summary className={`${btn} cursor-pointer list-none bg-brand-navy text-white hover:bg-[#25467c] [&::-webkit-details-marker]:hidden`}>
            <LineIcon name="download" className="h-4 w-4" />{t("Download")}<span aria-hidden="true" className="text-[10px] transition group-open:rotate-180">▼</span>
          </summary>
          <div className="absolute end-0 top-12 z-30 min-w-[14rem] rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200">
            <PrintThisPage className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-start text-sm font-medium text-slate-700 hover:bg-slate-50" />
            {files.map((f) => (
              <a key={f.href} href={f.href} {...(isPrintHref(f.href) ? { target: "_blank", rel: "noopener" } : { download: true })} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <LineIcon name="file" className="h-4 w-4" />{t(f.label)}
              </a>
            ))}
          </div>
        </details>
        {r.send && classId && (
          <form action={shareManyAction} className="flex items-center gap-2">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="back" value={current} />
            {studentId ? <><input type="hidden" name="op" value="share" /><input type="hidden" name="student" value={studentId} /></> : <input type="hidden" name="op" value="all" />}
            <button className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`}><LineIcon name="send" className="h-4 w-4" />{studentId ? t("Send to family") : t("Send to every family")}</button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        {classes.length > 0 && <NavSelect label="Class" value={classHref(classId)} options={classes.map((c) => ({ href: classHref(c.id), label: c.name }))} />}
        {r.studentUrl && students.length > 0 && (
          <NavSelect label="Student" value={studentId ? current : r.classUrl ? go({ scope: "class" }) : current}
            options={[...(r.classUrl ? [{ href: go({ scope: "class" }), label: t("Whole class") }] : []), ...students.map((s) => ({ href: go({ studentId: s.id, scope: "student" }), label: s.name }))]} />
        )}
        {r.period && (
          <nav aria-label={t("Date range")} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-500">{t("Date range")}</span>
            <span className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {REPORT_PERIODS.map((p) => <Link key={p.key} prefetch={false} href={go({ period: p.key })} aria-current={p.key === period ? "true" : undefined} className={seg(p.key === period)}>{t(p.label)}</Link>)}
            </span>
          </nav>
        )}
        {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status === "shared" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}>{status === "shared" ? t("Shared") : t("Waiting for approval")}</span>}
      </div>
      {msg && <p role="status" className="border-t border-slate-100 bg-teal-50/60 px-4 py-2 text-sm text-teal-900">{msg}</p>}
    </section>
  );
}
