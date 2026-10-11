"use client";
import { usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { sendFeedbackAction } from "./actions";

/**
 * 💬 A small “Feedback” button for the app shell: a dialog with a text box and the page it is about (filled in with the
 * current path, editable). Any signed-in user can send; the school's admins read it on /admin/feedback.
 */
export function FeedbackButton({ className = "" }: { className?: string }) {
  const t = useT();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openDialog = () => { setPage(pathname ?? ""); setSent(false); setError(null); ref.current?.showModal(); };
  const send = () => start(async () => {
    const r = await sendFeedbackAction(message, page || null);
    if (r.error) return setError(r.error);
    setSent(true); setMessage("");
  });

  return (
    <>
      <button type="button" onClick={openDialog} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50 ${className}`}>
        <span aria-hidden="true">💬</span>{t("Feedback")}
      </button>
      <dialog ref={ref} aria-label={t("Feedback")} className="w-[min(94vw,28rem)] rounded-2xl p-0 backdrop:bg-slate-900/40">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold text-brand-navy">{t("Feedback")}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("Close")} className="min-h-11 min-w-11 rounded-lg text-2xl text-slate-500 hover:bg-slate-100">×</button>
        </div>
        <div className="space-y-3 p-5">
          {sent ? (
            <>
              <p role="status" className="rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">✓ {t("Thank you! Your feedback was sent.")}</p>
              <button type="button" onClick={() => ref.current?.close()} className={BTN_SECONDARY}>{t("Close")}</button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">{t("What would you like to tell us?")}
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={2000} rows={5} dir="auto" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium text-slate-700">{t("Which page? (optional)")}
                <input value={page} onChange={(e) => setPage(e.target.value)} maxLength={300} dir="ltr" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm" />
              </label>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t(error)}</p>}
              <button disabled={pending || !message.trim()} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Sending…") : t("Send")}</button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
