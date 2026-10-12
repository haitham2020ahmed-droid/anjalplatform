import { PageHeader } from "@/components/page-header";
import { SafeHtml } from "@/components/writing/safe-html";
import { RubricTable } from "@/components/writing/rubric-builder";
import { StartWritingButton } from "@/components/writing/start-writing-button";
import { getT } from "@/i18n/server";
import { splitSentences } from "@/server/writing/rich-text";
import { STATUS_LABEL, type LockedStudentView } from "@/server/writing/locked";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : "");

/**
 * 🔒 A locked writing task for the student: the preview before starting (prompt, full rubric, word count, time
 * limit, the rules), the read-only essay after submitting, and the teacher's returned grade (never the AI's).
 */
export async function LockedTaskView({ v, msg }: { v: LockedStudentView; msg?: string }) {
  const { t } = await getT();
  const card = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const open = v.status === "NOT_STARTED" || v.status === "IN_PROGRESS";
  const r = v.result;
  const commented = new Map((r?.sentences ?? []).map((x) => [x.index, x.comment]));
  const sentences = r && v.text ? splitSentences(v.text) : [];
  return (
    <>
      <PageHeader back={{ href: "/student/writing", label: "Writing" }} icon="🔒" title={v.title} subtitle={[v.dueAt ? `${t("Due")} ${day(v.dueAt)}` : "", t(STATUS_LABEL[v.status])].filter(Boolean).join(" · ")} />
      {msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{msg}</p>}

      {r && (
        <section className="mb-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="text-xl font-semibold text-emerald-900">✅ {t("Your score")}: <span dir="ltr" className="tabular-nums">{r.total} / {r.max}</span> <span className="text-base font-normal">({r.pct}%)</span></p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{r.criteria.map((c) => (
            <li key={c.key} className="rounded-xl bg-white p-3 text-sm ring-1 ring-emerald-100">
              <p><b>{c.title}</b>: <span dir="ltr" className="tabular-nums">{c.points}/{c.max}</span> · {c.label}</p>
              {c.description && <p className="text-slate-600">“{c.description}”</p>}
            </li>
          ))}</ul>
          {r.comment && <p className="mt-3 whitespace-pre-line rounded-lg bg-white px-3 py-2">💬 {r.comment}</p>}
          {sentences.length > 0 && (
            <div className="mt-3 rounded-lg bg-white p-3">
              <p className="text-sm font-semibold text-brand-navy">{t("Your essay with your teacher's comments")}</p>
              <p className="mt-1 leading-relaxed">{sentences.map((x, i) => commented.has(i)
                ? <mark key={i} className="rounded bg-amber-100 px-0.5" title={commented.get(i)}>{x} </mark>
                : <span key={i}>{x} </span>)}</p>
              <ol className="mt-2 space-y-1 text-sm">{r.sentences.map((x) => <li key={x.index} className="rounded-lg bg-amber-50 px-2 py-1"><i>“{x.text}”</i> — {x.comment}</li>)}</ol>
            </div>
          )}
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold text-brand-navy">{t("Writing prompt")}</h2>
        <SafeHtml className="prose-sm mt-2 text-slate-800 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6" html={v.promptHtml} />
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {v.minWords && <li className="rounded-full bg-slate-100 px-3 py-1">📝 {t("At least {n} words", { n: v.minWords })}</li>}
          <li className="rounded-full bg-slate-100 px-3 py-1">⏱ {v.timeLimitMin ? t("Time limit: {n} minutes", { n: v.timeLimitMin }) : t("No time limit")}</li>
          <li className="rounded-full bg-slate-100 px-3 py-1">🎯 {t("{n} points", { n: v.max })}</li>
        </ul>
      </section>

      {open && (
        <section className="mt-4 rounded-2xl bg-red-50 p-4 text-red-950 ring-1 ring-red-200">
          <h2 className="font-semibold">🔒 {t("The rules")}</h2>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
            <li><b>{t("Once you start, you cannot leave until you submit.")}</b></li>
            <li>{t("The page opens in full screen. Leaving it (another tab or app, leaving full screen, reloading) is recorded.")}</li>
            <li>{t("The first time you leave you get a warning. The second time your essay is submitted automatically.")}</li>
            <li>{t("Copy, paste and right-click are turned off. Spelling and grammar helpers are not allowed.")}</li>
            {v.timeLimitMin ? <li>{t("When the time is up, your essay is submitted automatically.")}</li> : null}
            <li>{t("Your work is saved every few seconds.")}</li>
          </ul>
          <div className="mt-4"><StartWritingButton taskId={v.id} label={v.status === "IN_PROGRESS" ? "Continue Writing" : "Start Writing"} /></div>
        </section>
      )}

      {!open && !r && v.text !== null && (
        <section className={`mt-4 ${card}`}>
          <p className="font-semibold text-brand-navy">{v.status === "AUTO_SUBMITTED" ? t("Your essay was submitted automatically.") : t("Your essay was submitted.")} {t("Your teacher will grade it.")}</p>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 leading-relaxed">{v.text || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">{t("{n} words", { n: v.words })}{v.submittedAt ? ` · ${day(v.submittedAt)}` : ""}</p>
        </section>
      )}

      <details className={`mt-4 ${card}`} open={open}>
        <summary className="cursor-pointer font-semibold text-brand-navy">📏 {t("Rubric")}: {v.rubric.title}</summary>
        <RubricTable criteria={v.rubric.criteria} />
      </details>
    </>
  );
}
