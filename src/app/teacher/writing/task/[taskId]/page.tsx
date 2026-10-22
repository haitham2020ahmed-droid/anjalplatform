import Link from "next/link";
import { SafeHtml } from "@/components/writing/safe-html";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RubricTable } from "@/components/writing/rubric-builder";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { getT } from "@/i18n/server";
import { lockedTaskForTeacher, STATUS_LABEL, type LockedStatus, type LockedTaskTeacherView } from "@/server/writing/locked";
import { reopenAction } from "../../locked-actions";
import { ITEM_PREVIEW } from "@/server/student/preview-as";

export const metadata = { title: "Writing submissions" };

const PILL: Record<LockedStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600", IN_PROGRESS: "bg-sky-100 text-sky-900", SUBMITTED: "bg-amber-100 text-amber-900",
  AUTO_SUBMITTED: "bg-orange-100 text-orange-900", GRADED: "bg-emerald-100 text-emerald-900",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : "—");

/** 📥 Every assigned student of a locked writing task: status, integrity counts, score; open an essay to grade it. */
export default async function SubmissionsPage({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<{ page?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { taskId } = await params;
  const sp = await searchParams;
  let v: LockedTaskTeacherView;
  try { v = await lockedTaskForTeacher(repo, actor, taskId, Number(sp.page) || 1); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const card = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const statuses = Object.keys(STATUS_LABEL) as LockedStatus[];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/writing?classId=${v.classId}`, label: "Writing & Reading Aloud" }} icon="🔒" title={v.title}
        subtitle={[v.className, v.dueAt ? `${t("Due")} ${when(v.dueAt)}` : "", v.timeLimitMin ? t("{n} min", { n: v.timeLimitMin }) : "", v.minWords ? t("At least {n} words", { n: v.minWords }) : ""].filter(Boolean).join(" · ")}>
        {v.rows[0] && <Link href={ITEM_PREVIEW.writing(v.id, v.rows[0].studentId)} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300 print:hidden">👀 {t("Preview as student")}</Link>}
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}

      <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {statuses.map((k) => <div key={k} className={card}><p dir="ltr" className="text-2xl font-semibold tabular-nums text-brand-navy">{v.counts[k]}</p><p className="text-xs font-semibold text-slate-600">{t(STATUS_LABEL[k])}</p></div>)}
        <div className={card}><p dir="ltr" className="text-2xl font-semibold tabular-nums text-brand-navy">{v.average === null ? "—" : `${v.average}%`}</p><p className="text-xs font-semibold text-slate-600">{t("Class average")}</p></div>
      </section>

      <details className={`mt-4 ${card}`}>
        <summary className="cursor-pointer font-semibold text-brand-navy">{t("Writing prompt")} · {t("Rubric")} ({t("{n} points", { n: v.max })})</summary>
        <SafeHtml className="prose-sm mt-2 [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6" html={v.promptHtml} />
        <RubricTable criteria={v.rubric.criteria} />
      </details>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-slate-50 text-start text-xs text-slate-600">
            <tr><th className="p-3 text-start">{t("Student")}</th><th className="p-3 text-start">{t("Status")}</th><th className="p-3 text-start">{t("Words")}</th><th className="p-3 text-start">{t("Submitted")}</th><th className="p-3 text-start">{t("Integrity")}</th><th className="p-3 text-start">{t("Score")}</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{v.rows.map((r) => (
            <tr key={r.studentId}>
              <td className="p-3 font-semibold text-brand-navy"><bdi>{r.name}</bdi></td>
              <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[r.status]}`}>{t(STATUS_LABEL[r.status])}</span></td>
              <td className="p-3 tabular-nums">
                {r.status === "NOT_STARTED" ? "—" : r.words}
                {/* 🔧 improvement (Oct 2026): flag a submission far below the task's minimum (or the 15-word floor
                    locked.ts::finishSubmission falls back to when no minWords is set) so a teacher scanning the
                    queue doesn't grade an essentially-empty essay without noticing. */}
                {r.status !== "NOT_STARTED" && r.words < (v.minWords ?? 15) && <span className="ms-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">🔴 {t("Short submission")}</span>}
              </td>
              <td className="p-3 text-xs">{when(r.submittedAt)}{r.late && <span className="ms-1 rounded bg-red-50 px-1 font-semibold text-red-700">{t("late")}</span>}</td>
              <td className="p-3 text-xs">
                {r.leaves > 0 && <span className="me-2" title={t("Times the student left the page")}>🚪 {r.leaves}</span>}
                {r.pastes > 0 && <span className="me-2" title={t("Paste attempts")}>📋 {r.pastes}</span>}
                {r.extension && <span className="font-semibold text-red-700" title={r.extension}>🧩 {t("Extension detected")}</span>}
                {!r.leaves && !r.pastes && !r.extension && r.status !== "NOT_STARTED" ? <span className="text-slate-400">✓</span> : null}
              </td>
              <td className="p-3 tabular-nums">{r.pct !== null ? `${r.total}/${v.max} · ${r.pct}%` : r.total !== null ? <span className="text-slate-500">{r.total}/{v.max} ({t("not returned")})</span> : r.aiReady ? <span className="text-violet-700">🤖 {t("AI suggestion")}</span> : "—"}</td>
              <td className="p-3 text-end">
                <div className="flex flex-wrap justify-end gap-2">
                  {r.status !== "NOT_STARTED" && <Link prefetch={false} href={`/teacher/writing/task/${v.id}/${r.studentId}`} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 font-semibold text-white">{r.status === "SUBMITTED" || r.status === "AUTO_SUBMITTED" ? t("Grade") : t("Open")}</Link>}
                  {v.canGrade && (r.status === "SUBMITTED" || r.status === "AUTO_SUBMITTED") && (
                    <form action={reopenAction}><input type="hidden" name="taskId" value={v.id} /><input type="hidden" name="studentId" value={r.studentId} /><input type="hidden" name="back" value="list" /><button className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Reopen")}</button></form>
                  )}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {v.pages > 1 && (
        <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("Page")}>{Array.from({ length: v.pages }, (_, i) => i + 1).map((p) => <Link key={p} prefetch={false} href={`/teacher/writing/task/${v.id}?page=${p}`} className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold ${p === v.page ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{p}</Link>)}</nav>
      )}
    </AppShell>
  );
}
