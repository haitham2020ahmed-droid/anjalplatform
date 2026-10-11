import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { PrintReportButton } from "@/components/teacher/print-report-button";
import { REPORT_CATEGORIES, REPORT_PERIODS, REPORTS, reportByKey, reportUrls, scopesOf, type ReportPeriod, type ReportScope } from "@/components/teacher/report-catalog";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { isReportShared } from "@/server/insights/parent-report";
import { staffFamilyReports } from "@/server/reports/family-reports";
import { shareManyAction } from "./actions";

export const metadata = { title: "Reports" };

type SP = { report?: string; classId?: string; scope?: string; studentId?: string; groupId?: string; period?: string; preview?: string; msg?: string };
const ids = (v: unknown): string[] => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };

/**
 * 📊 Reports hub as a three-step wizard (state in the address, so every step can be bookmarked):
 *   1 Pick a report (seven categories) → 2 Pick the class, a student or a group, and the period → 3 Preview →
 *   Download PDF (the report's own print view) or, for family reports, Send to parents (the admin approves first).
 * The reports themselves are the existing pages (src/components/teacher/report-catalog.ts); their old addresses work.
 * Access: the teacher's readable classes only; a student or group outside the chosen class is ignored.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const teacher = actor.role === "TEACHER";
  const r = reportByKey(sp.report);
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const cid = klass ? String(klass.id) : "";
  const step = !r ? 1 : sp.preview ? 3 : 2;

  // the class's students and groups (only from step 2)
  const members = r && cid ? await classMembers(repo, cid) : [];
  const names = members.length ? await studentNames(repo, members) : new Map<string, { name: string }>();
  const students = members.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  const groups = r && cid ? (await repo.findMany("Intervention", { classId: cid, status: "ACTIVE" }, { select: ["id", "title", "studentIds"] }))
    .map((g) => ({ id: String(g.id), title: String(g.title), studentIds: ids(g.studentIds).filter((x) => members.includes(x)) })).filter((g) => g.studentIds.length) : [];
  const scopes = r ? scopesOf(r).filter((s) => s !== "group" || groups.length) : [];
  const scope: ReportScope = scopes.includes(sp.scope as ReportScope) ? (sp.scope as ReportScope) : scopes[0] ?? "class";
  const period: ReportPeriod = REPORT_PERIODS.some((p) => p.key === sp.period) ? (sp.period as ReportPeriod) : "month";
  const studentId = students.some((s) => s.id === sp.studentId) ? String(sp.studentId) : "";
  const group = groups.find((g) => g.id === sp.groupId) ?? null;
  const who = scope === "group" ? group?.studentIds ?? [] : members;
  const pages = r && cid ? reportUrls(r, scope, { classId: cid, studentId, period }, who) : [];
  const ready = step === 3 && pages.length > 0;
  // family reports: each student's status (shared / waiting for the admin) in the preview, before anything is sent
  const status = new Map<string, "shared" | "waiting" | "">();
  if (ready && r?.send) {
    const fam = await staffFamilyReports(repo, actor).catch(() => []);
    const waiting = new Set(fam.filter((x) => x.kind === "PROGRESS" && x.status === "PENDING").map((x) => x.studentId));
    await Promise.all(pages.map(async (p) => { if (p.studentId) status.set(p.studentId, (await isReportShared(repo, String(actor.schoolId), p.studentId)) ? "shared" : waiting.has(p.studentId) ? "waiting" : ""); }));
  }
  const nameOf = (id?: string) => (id ? names.get(id)?.name ?? "Student" : String(klass?.name ?? ""));
  const base = { report: r?.key ?? "", classId: cid, scope, studentId, groupId: group?.id ?? "", period };
  const href = (o: Partial<typeof base> & { preview?: string }) => `/teacher/reports?${new URLSearchParams(Object.entries({ ...base, ...o }).filter(([, v]) => v) as [string, string][])}`;

  const card = "rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6";
  const primary = "inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand-navy px-6 font-semibold text-white hover:bg-brand-purple";
  const secondary = "inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const STEPS = ["Pick a report", "Who and when", "Preview"];

  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: teacher ? "/teacher" : "/admin", label: "Home" }} icon="📊" title="Reports" print={false} subtitle={t("Pick a report, choose who it is about, preview it, then download or send it.")} who={klass ? <bdi>{String(klass.name)}</bdi> : undefined} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <ol className="mb-5 flex flex-wrap gap-2" aria-label={t("Steps")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? "step" : undefined} className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${step === i + 1 ? "bg-brand-teal text-white" : step > i + 1 ? "bg-teal-50 text-teal-800" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
            <span dir="ltr">{i + 1}</span> {t(s)}
          </li>
        ))}
      </ol>

      {!classes.length && <p className={`${card} text-slate-600`}>{t("You do not teach any class yet.")}</p>}

      {classes.length > 0 && step === 1 && (
        <div className="space-y-6">
          {REPORT_CATEGORIES.map((c) => (
            <section key={c.key} aria-labelledby={`cat-${c.key}`}>
              <h2 id={`cat-${c.key}`} className="mb-2 flex items-center gap-2 text-lg font-semibold text-brand-navy"><span aria-hidden="true">{c.icon}</span> {t(c.key)}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {REPORTS.filter((x) => x.category === c.key).map((x) => (
                  <li key={x.key}>
                    <Link prefetch={false} href={`/teacher/reports?${new URLSearchParams({ report: x.key, ...(cid ? { classId: cid } : {}) })}`} className="lift flex h-full min-h-20 flex-col justify-center rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-teal">
                      <span className="font-semibold text-brand-navy">{t(x.title)}</span>
                      <span className="text-sm text-slate-600">{t(x.hint)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {cid && (
            <details className={card}>
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand-navy">{t("Exports")}</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/api/progress-export?classId=${cid}&subject=READING`} className={secondary}>{t("Students (Reading) · Excel")}</a>
                <a href={`/api/progress-export?classId=${cid}&subject=LANGUAGE`} className={secondary}>{t("Students (Language) · Excel")}</a>
                {!teacher && <Link prefetch={false} href="/admin/report-approvals" className={secondary}>{t("Reports to Approve")}</Link>}
              </div>
            </details>
          )}
        </div>
      )}

      {classes.length > 0 && r && step === 2 && (
        <section className={card} aria-labelledby="who-h">
          <p className="text-sm text-slate-500">{t(r.category)} · <Link prefetch={false} href="/teacher/reports" className="font-semibold text-brand-teal underline">{t("Change report")}</Link></p>
          <h2 id="who-h" className="text-xl font-semibold text-brand-navy">{t(r.title)}</h2>
          <p className="text-slate-600">{t(r.hint)}</p>
          {classes.length > 1 && (
            <nav aria-label={t("Classes")} className="mt-4 flex flex-wrap gap-2">
              {classes.map((c) => <Link key={String(c.id)} prefetch={false} href={href({ classId: String(c.id), studentId: "", groupId: "" })} className={chip(c.id === klass?.id)}><bdi>{String(c.name)}</bdi></Link>)}
            </nav>
          )}
          <form action="/teacher/reports" className="mt-5 space-y-5">
            <input type="hidden" name="report" value={r.key} />
            <input type="hidden" name="classId" value={cid} />
            <input type="hidden" name="preview" value="1" />
            <fieldset>
              <legend className="mb-2 font-semibold text-slate-800">{t("Who is it about?")}</legend>
              <div className="flex flex-wrap gap-2">
                {scopes.map((s) => (
                  <label key={s} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-slate-50 px-4 ring-1 ring-slate-200 has-[:checked]:bg-teal-50 has-[:checked]:ring-brand-teal">
                    <input type="radio" name="scope" value={s} defaultChecked={s === scope} />
                    {s === "class" ? <>{t(r.classUrl ? "The whole class" : "Every student of the class")} (<bdi>{String(klass?.name ?? "")}</bdi>)</> : s === "student" ? t("One student") : t("A group")}
                  </label>
                ))}
              </div>
            </fieldset>
            {scopes.includes("student") && (
              <label className="block">
                <span className="mb-1 block font-semibold text-slate-800">{t("Student")}</span>
                <select name="studentId" defaultValue={studentId} className="min-h-11 w-full max-w-md rounded-xl border border-slate-300 bg-white px-3">
                  <option value="">{t("Choose a student…")}</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            {scopes.includes("group") && (
              <label className="block">
                <span className="mb-1 block font-semibold text-slate-800">{t("Group")}</span>
                <select name="groupId" defaultValue={group?.id ?? ""} className="min-h-11 w-full max-w-md rounded-xl border border-slate-300 bg-white px-3">
                  <option value="">{t("Choose a group…")}</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.studentIds.length})</option>)}
                </select>
              </label>
            )}
            {r.period && (
              <label className="block">
                <span className="mb-1 block font-semibold text-slate-800">{t("Period")}</span>
                <select name="period" defaultValue={period} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
                  {REPORT_PERIODS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}
                </select>
              </label>
            )}
            <button className={primary}>{t("Preview")}</button>
          </form>
        </section>
      )}

      {classes.length > 0 && r && step === 3 && (
        <section className={card} aria-labelledby="preview-h">
          <p className="text-sm text-slate-500">{t(r.category)} · <Link prefetch={false} href={href({ preview: "" })} className="font-semibold text-brand-teal underline">{t("Change who and when")}</Link></p>
          <h2 id="preview-h" className="text-xl font-semibold text-brand-navy">{t(r.title)} · <bdi>{scope === "student" ? nameOf(studentId) : scope === "group" ? group?.title ?? "" : String(klass?.name ?? "")}</bdi>{r.period ? <span className="text-base font-normal text-slate-500"> · {t(REPORT_PERIODS.find((p) => p.key === period)!.label)}</span> : null}</h2>
          {!ready ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{scope === "student" ? t("Choose a student first.") : scope === "group" ? t("Choose a group first.") : t("There is nothing to show for this class yet.")} <Link prefetch={false} href={href({ preview: "" })} className="font-semibold underline">{t("Back")}</Link></p>
          ) : (
            <>
              <p className="mt-2 text-slate-600">{t("Open each page to check it before you download or send it.")}</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {pages.map((p) => (
                  <li key={p.url} className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200">
                    <span className="min-w-0 truncate">
                      <bdi className="font-medium">{p.studentId ? nameOf(p.studentId) : t(r.title)}</bdi>
                      {status.get(p.studentId ?? "") === "shared" ? <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{t("Shared")}</span> : status.get(p.studentId ?? "") === "waiting" ? <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("Waiting for approval")}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Link prefetch={false} href={p.url} target="_blank" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-teal underline">{t("Preview")}</Link>
                      {pages.length > 1 && <PrintReportButton url={p.url} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand-navy underline" />}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {r.send ? (
                  <form action={shareManyAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="classId" value={cid} />
                    <input type="hidden" name="op" value={scope === "class" ? "all" : "share"} />
                    {pages.map((p) => p.studentId ? <input key={p.studentId} type="hidden" name="student" value={p.studentId} /> : null)}
                    <button className={primary}>{t("Send to parents")}</button>
                    <span className="text-sm text-slate-500">{teacher ? t("The school admin approves it first; parents see it after that.") : t("As an admin, sharing is immediate.")}</span>
                  </form>
                ) : null}
                {pages.length === 1 && <PrintReportButton url={pages[0].url} className={r.send ? secondary : primary} />}
              </div>
            </>
          )}
        </section>
      )}
    </AppShell>
  );
}
