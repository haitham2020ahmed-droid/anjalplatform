import { notFound } from "next/navigation";
import { SafeHtml } from "@/components/writing/safe-html";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { GradeForm } from "@/components/writing/grade-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { getT } from "@/i18n/server";
import { gradingView, STATUS_LABEL, type GradingView } from "@/server/writing/locked";
import { aiGradeAction, reopenAction, saveGradeAction } from "../../../locked-actions";

export const metadata = { title: "Grade an essay" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Riyadh" }) : "—");
const dur = (sec: number | null) => (sec === null ? "—" : sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.floor(sec / 60)}m ${sec % 60}s`);
const EVENT: Record<string, string> = {
  START: "▶ Started", HIDDEN: "🚪 Left the page (tab or app hidden)", BLUR: "🚪 Left the page (window lost focus)", FULLSCREEN: "🚪 Left full screen", RELOAD: "🔄 Reloaded the page",
  PASTE: "📋 Paste attempt", COPY: "Copy attempt", DROP: "📋 Drop attempt", MENU: "Right-click", EXTENSION: "🧩 Writing extension detected",
  SUBMIT: "📤 Submitted", AUTO_SUBMIT: "⛔ Auto-submitted (left twice)", TIME_UP: "⏱ Auto-submitted (time is up)", REOPEN: "↩ Reopened by the teacher", RETURNED: "✅ Grade returned",
};

/** 🧮 One essay: the essay and its integrity log beside the rubric; Grade with AI; Approve & Return; Reopen. */
export default async function GradePage({ params, searchParams }: { params: Promise<{ taskId: string; studentId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { taskId, studentId } = await params;
  const sp = await searchParams;
  let g: GradingView;
  try { g = await gradingView(repo, actor, taskId, studentId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const handedIn = g.status === "SUBMITTED" || g.status === "AUTO_SUBMITTED" || g.status === "GRADED";
  const i = g.integrity;
  // the AI's suggestion is never filled in by itself: the teacher clicks “Use AI suggestion”, “Use all” or “Use feedback”
  const prefill = g.grading?.levels ?? {};
  const comment = g.grading?.comment ?? "";
  const hidden = <><input type="hidden" name="taskId" value={g.task.id} /><input type="hidden" name="studentId" value={g.studentId} /></>;
  const log = (
    <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200">
      <h2 className="font-semibold text-brand-navy">🛡️ {t("Integrity log")}</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-slate-500">{t("Started")}</dt><dd>{when(i.startedAt)}</dd>
        <dt className="text-slate-500">{t("Submitted")}</dt><dd>{when(i.submittedAt)}{i.submitMode && i.submitMode !== "MANUAL" ? ` · ${t(i.submitMode === "TIME" ? "time is up" : "auto-submitted")}` : ""}</dd>
        <dt className="text-slate-500">{t("Time spent")}</dt><dd>{dur(i.timeSpentSec)}</dd>
        <dt className="text-slate-500">{t("Left the page / full screen")}</dt><dd className={i.leaves ? "font-semibold text-red-700" : ""}>{i.leaves} <span className="font-normal text-slate-500">({t("{n} signals", { n: i.leaveEvents })})</span></dd>
        <dt className="text-slate-500">{t("Reloads")}</dt><dd>{i.reloads}</dd>
        <dt className="text-slate-500">{t("Paste attempts")}</dt><dd className={i.pastes ? "font-semibold text-red-700" : ""}>{i.pastes}</dd>
        <dt className="text-slate-500">{t("Extension detected")}</dt><dd className={i.extension ? "font-semibold text-red-700" : ""}>{i.extension ? `${t("Yes")} (${i.extensions.join(", ") || i.extension})` : t("No")}</dd>
      </dl>
      {i.events.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-brand-navy">{t("Every event ({n})", { n: i.events.length })}</summary>
          <ol className="mt-1 max-h-72 space-y-0.5 overflow-y-auto text-xs">{i.events.map((e, k) => <li key={k} className="flex gap-2"><span dir="ltr" className="shrink-0 tabular-nums text-slate-500">{when(e.at)}</span><span>{t(EVENT[e.kind] ?? e.kind)}{e.detail ? <span className="text-slate-500"> · {e.detail}</span> : null}</span></li>)}</ol>
        </details>
      )}
    </div>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/writing/task/${g.task.id}`, label: "Submissions" }} icon="🧮" title={g.name} subtitle={[g.task.title, t(STATUS_LABEL[g.status]), t("{n} words", { n: g.words }), g.task.minWords ? t("At least {n} words", { n: g.task.minWords }) : ""].filter(Boolean).join(" · ")} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <details className="mb-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <summary className="cursor-pointer font-semibold text-amber-950">{t("Writing prompt")}</summary>
        <SafeHtml className="prose-sm mt-2 [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6" html={g.task.promptHtml} />
      </details>
      {g.canGrade && handedIn && (
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <form action={aiGradeAction} className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200">
            {hidden}
            <label className="block text-sm font-semibold text-violet-950">{t("Notes for AI grading (optional)")}
              <textarea name="aiNotes" rows={2} maxLength={1000} defaultValue={g.task.aiNotes} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-normal" placeholder={t("e.g. Focus on the thesis; this class just learned paragraphs.")} />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="inline-flex min-h-11 items-center rounded-xl bg-violet-700 px-4 font-semibold text-white">🤖 {g.ai ? t("Grade with AI again") : t("Grade with AI")}</button>
              <span className="text-xs text-violet-900">{t("Saved with the task for every essay. The AI reads the essay twice and compares; this counts as one AI grading.")}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t("Sent to the AI: the task, its grade, word counts and time limit, the rubric (and your own rubric wording), your notes and the essay — never the student's name.")}</p>
          </form>
          {(g.status === "SUBMITTED" || g.status === "AUTO_SUBMITTED") && <form action={reopenAction}>{hidden}<button className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300">↩ {t("Reopen for the student")}</button></form>}
        </div>
      )}
      {!handedIn && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{t("The student is still writing. You can grade once the essay is submitted.")}</p>}
      <GradeForm action={saveGradeAction} taskId={g.task.id} studentId={g.studentId} criteria={g.rubric.criteria} sentences={g.sentences} levels={prefill} comment={comment}
        notes={(g.grading?.sentences ?? []).map((x) => ({ index: x.index, comment: x.comment }))} ai={g.ai}
        canGrade={g.canGrade && handedIn} returned={g.status === "GRADED"} essayFooter={log} />
    </AppShell>
  );
}
