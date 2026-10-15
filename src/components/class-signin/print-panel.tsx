/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { qrPath } from "@/lib/qr";
import { newPrintCodeAction, newPrintLinkAction, turnOffPrintQrAction, turnOnPrintQrAction, type PrintQrResult } from "@/app/teacher/class-signin/print-actions";

type PrintQrView = Extract<PrintQrResult, { ok: true }>["view"];

export interface PrintSignedIn { today: { studentId: string; name: string; at: string; count: number }[]; week: { studentId: string; name: string; at: string; count: number }[] }

/**
 * 🖨 r85 "Printable QR for the weekly plan" (one class): the permanent QR + the 4-digit class code in big digits,
 * Print QR card · New code · New link · Turn off / Turn on, and who signed in from the printed QR (today / this week).
 * The code is on this teacher-only page; it is never on a student page.
 */
export function PrintQrPanel({ initial, base, signedIn }: { initial: PrintQrView; base: string; signedIn: PrintSignedIn }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "week">("today");
  const run = async (fn: (classId: string) => Promise<PrintQrResult>, ask?: string) => {
    if (ask && !window.confirm(t(ask))) return;
    setBusy(true); setError(null);
    try { const r = await fn(v.classId); if (r.ok) setV(r.view); else setError(r.error); }
    catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };
  const url = v.active && v.path ? `${base}${v.path}` : "";
  let qr: { total: number; d: string } | null = null;
  try { qr = url ? qrPath(url) : null; } catch { qr = null; }
  const list = tab === "today" ? signedIn.today : signedIn.week;
  const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60";
  const time = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: tab === "week" ? "short" : undefined, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
  return (
    <section aria-label={t("Printable QR for the weekly plan")} data-testid="print-qr-panel" className="rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-5">
      <h2 className="text-lg font-semibold text-ink">🖨 {t("Printable QR for the weekly plan")} · <bdi>{v.className}</bdi></h2>
      <p className="mt-1 text-sm text-muted">{t("Students scan it at school or at home, tap their name and type the class code. It keeps working week after week.")}</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{t(error)}</p>}
      {v.active && qr ? (
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className="h-40 w-40 shrink-0 rounded-lg bg-white p-1" shapeRendering="crispEdges" role="img" aria-label={t("QR code to sign in to {name}", { name: v.className })}>
            <rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-muted">{t("Class code")}</p>
            <p className="font-mono text-5xl font-bold tracking-[0.3em] text-brand-navy" dir="ltr" data-testid="print-qr-code">{v.code}</p>
            <p className="mt-1 text-xs text-muted">{t("Weekly plan prints add this QR and code for you.")}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{v.exists ? t("The printed QR is off. Students cannot sign in with it.") : t("Turn it on to print a QR for this class.")}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {v.active ? (
          <>
            <a href={`/teacher/class-signin/print?classId=${encodeURIComponent(v.classId)}&print=1`} target="_blank" rel="noopener" className={`${btn} bg-brand-navy text-white`}>🖨 {t("Print QR card")}</a>
            <button type="button" disabled={busy} onClick={() => void run(newPrintCodeAction, "Make a new class code? The printed QR keeps working with the new code.")} className={`${btn} bg-white ring-1 ring-slate-300 hover:ring-brand-teal`}>🔢 {t("New code")}</button>
            <button type="button" disabled={busy} onClick={() => void run(newPrintLinkAction, "Make a new QR? QR codes printed before stop working.")} className={`${btn} bg-white ring-1 ring-slate-300 hover:ring-brand-teal`}>🔗 {t("New link")}</button>
            <button type="button" disabled={busy} onClick={() => void run(turnOffPrintQrAction, "Turn off the printed QR? Students cannot sign in with it until you turn it on again.")} className={`${btn} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}>⏸ {t("Turn off")}</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => void run(turnOnPrintQrAction)} className={`${btn} bg-brand-navy text-white`}>▶ {t("Turn on")}</button>
            {v.exists && <button type="button" disabled={busy} onClick={() => void run(newPrintLinkAction, "Make a new QR? QR codes printed before stop working.")} className={`${btn} bg-white ring-1 ring-slate-300 hover:ring-brand-teal`}>🔗 {t("New link")}</button>}
          </>
        )}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="font-semibold text-ink">{t("Signed in from the printed QR")}</h3>
        <div className="mt-2 flex gap-2" role="tablist">
          {(["today", "week"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${tab === k ? "bg-brand-navy text-white" : "bg-white ring-1 ring-line"}`}>
              {t(k === "today" ? "Today" : "This week")} ({(k === "today" ? signedIn.today : signedIn.week).length})
            </button>
          ))}
        </div>
        {list.length === 0 ? <p className="mt-2 text-sm text-muted">{t("Nobody yet.")}</p> : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((x) => (
              <li key={x.studentId} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                <span aria-hidden="true">✅</span>
                <span className="min-w-0 flex-1 truncate font-medium"><bdi>{x.name}</bdi></span>
                <span className="text-muted" dir="ltr">{time(x.at)}</span>
                {x.count > 1 && <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-700">{t("{n} times", { n: x.count })}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
