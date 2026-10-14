/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { qrPath } from "@/lib/qr";
import { closeQrAction, letInStudentAction, openQrAction, signOutStudentAction, type OpenQr } from "@/app/teacher/class-signin/actions";

interface Roster { open: boolean; expiresAt: string; className: string; students: { id: string; name: string; in: boolean; at: string | null }[] }

/** How often the teacher's list asks for news (light: one tiny JSON). */
export const POLL_MS = 5000;

/**
 * 📱 The teacher's Class sign-in screen (projector-friendly): a big QR (a link with a random token for THIS class),
 * the class name, a short code + address to type instead, a countdown, Close / Open QR again / Full screen, and the
 * live list next to it (✅ signed in / ⏳ not yet) with Sign out and Let in for each student.
 */
export function ClassSignInHost({ classId, className, base }: { classId: string; className: string; base: string }) {
  const t = useT();
  const [qr, setQr] = useState<OpenQr | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  const open = useCallback(async () => {
    setBusy(true); setError(null);
    try { const r = await openQrAction(classId); if (r.ok) { setQr(r.qr); setRoster((x) => (x ? { ...x, open: true } : x)); setNow(Date.now()); } else setError(r.error); }
    catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }, [classId]);

  const refresh = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/class-signin/status?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (r.ok) setRoster(await r.json() as Roster);
    } catch { /* offline for a moment: the next poll tries again */ }
  }, []);

  // opens at once (one class → straight to the QR); a second render in development does not open a second QR
  useEffect(() => { if (!started.current) { started.current = true; void open(); } }, [open]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => {
    if (!qr) return;
    void refresh(qr.id);
    const i = setInterval(() => { if (!document.hidden) void refresh(qr.id); }, POLL_MS);
    return () => clearInterval(i);
  }, [qr, refresh]);

  const ends = qr ? Date.parse(qr.expiresAt) : 0;
  const live = Boolean(qr) && now < ends && roster?.open !== false;
  const left = Math.max(0, Math.ceil((ends - now) / 1000));
  const site = `${base.replace(/^https?:\/\//, "")}/qr`;
  const url = qr ? `${base}/qr/${qr.token}` : "";
  const code = qr && live ? qrPath(url) : null;

  const close = async () => {
    if (!qr) return;
    setBusy(true);
    try { await closeQrAction(qr.id); setRoster((r) => (r ? { ...r, open: false } : r)); void refresh(qr.id); } finally { setBusy(false); }
  };
  const signOut = async (id: string, name: string) => {
    if (!window.confirm(t("Sign {name} out?", { name }))) return;
    const r = await signOutStudentAction(classId, id);
    if (!r.ok) setError(r.error ?? null);
    if (qr) void refresh(qr.id);
  };
  const letIn = async (id: string) => {
    const r = await letInStudentAction(classId, id);
    if (!r.ok) { setError(r.error); return; }
    if (r.qr) { setQr(r.qr); setRoster((x) => (x ? { ...x, open: true } : x)); setNow(Date.now()); } else if (qr) void refresh(qr.id);
  };
  const fullScreen = () => { void panel.current?.requestFullscreen?.().catch(() => undefined); };

  const students = roster?.students ?? [];
  const done = students.filter((s) => s.in).length;
  const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div ref={panel} className="flex flex-col items-center gap-4 rounded-3xl bg-white p-4 text-center text-slate-900 ring-1 ring-line sm:p-6 [&:fullscreen]:justify-center [&:fullscreen]:rounded-none">
        <h2 className="text-3xl font-bold text-brand-navy sm:text-4xl"><bdi>{roster?.className || className}</bdi></h2>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{t(error)}</p>}
        {code ? (
          <>
            <svg viewBox={`0 0 ${code.total} ${code.total}`} className="aspect-square w-full max-w-[min(70vh,34rem)]" shapeRendering="crispEdges" role="img" aria-label={t("QR code to sign in to {name}", { name: className })}>
              <rect width="100%" height="100%" fill="#fff" /><path d={code.d} fill="#000" />
            </svg>
            <p className="text-lg">{t("Scan the code, or go to {site} and type the code:", { site })}</p>
            <p className="font-mono text-5xl font-bold tracking-[0.3em] text-brand-navy sm:text-6xl" dir="ltr">{qr!.code}</p>
            <p className="text-sm text-slate-500" aria-live="polite">{t("Closes in {time}", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</p>
          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3">
            <p className="text-xl font-semibold">{busy && !qr ? t("Opening…") : t("The QR code is closed.")}</p>
            <p className="text-sm text-slate-500">{t("Students who signed in stay signed in.")}</p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {live && <button type="button" onClick={() => void close()} disabled={busy} className={`${btn} bg-white ring-1 ring-slate-300 hover:ring-brand-teal`}>✖ {t("Close")}</button>}
          <button type="button" onClick={() => void open()} disabled={busy} className={`${btn} bg-brand-navy text-white`}>↻ {t("Open QR again")}</button>
          {live && <button type="button" onClick={fullScreen} className={`${btn} bg-white ring-1 ring-slate-300 hover:ring-brand-teal`}>⛶ {t("Full screen")}</button>}
        </div>
      </div>

      <section aria-label={t("Who has signed in")} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
        <h2 className="mb-3 text-lg font-semibold text-ink">{t("Signed in: {n} of {total}", { n: done, total: students.length })}</h2>
        {roster && students.length === 0 && <p className="text-sm text-muted">{t("No students in this class yet")}</p>}
        <ul className="divide-y divide-line">
          {students.map((s) => (
            <li key={s.id} className="flex min-h-12 items-center gap-2 py-1.5">
              <span aria-hidden="true">{s.in ? "✅" : "⏳"}</span>
              <span className="min-w-0 flex-1 truncate font-medium"><bdi>{s.name}</bdi></span>
              <span className="sr-only">{s.in ? t("Signed in") : t("Not yet")}</span>
              {s.in
                ? <button type="button" onClick={() => void signOut(s.id, s.name)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">{t("Sign out")}</button>
                : <button type="button" onClick={() => void letIn(s.id)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-brand-teal ring-1 ring-line hover:ring-brand-teal">{t("Let in")}</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
