"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

/**
 * 🎯 ReadRise: the first visit without a finished placement shows a friendly window — "Let's find your reading level
 * first — take the short placement test" — with Start / Later (owner r68). "Later" is remembered for this student on this
 * device (the big placement card stays on the page). A dialog element: keyboard and screen-reader friendly.
 */
export function PlacementPopup({ studentKey, href, cont }: { studentKey: string; href: string; cont: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const key = `rr-placement-later:${studentKey}`;
  useEffect(() => {
    let later = false;
    try { later = window.localStorage.getItem(key) === "1"; } catch { /* private mode: ask again */ }
    if (!later) setOpen(true);
  }, [key]);
  useEffect(() => { const d = ref.current; if (open && d && !d.open) { try { d.showModal(); } catch { d.setAttribute("open", ""); } } }, [open]);
  const later = () => { try { window.localStorage.setItem(key, "1"); } catch { /* ignore */ } ref.current?.close(); setOpen(false); };
  if (!open) return null;
  return (
    <dialog ref={ref} data-testid="rr-placement-popup" aria-labelledby="rr-pop-h" onCancel={later}
      className="m-auto w-[min(92vw,28rem)] rounded-3xl p-0 text-start shadow-2xl backdrop:bg-slate-900/50">
      <div className="bg-gradient-to-r from-brand-navy to-indigo-700 px-6 py-5 text-white">
        <p className="text-4xl" aria-hidden="true">🎯</p>
        <h2 id="rr-pop-h" className="mt-1 text-xl font-bold">{t("Let's find your reading level first")}</h2>
      </div>
      <div className="space-y-4 px-6 py-5">
        <p className="text-slate-700">{t("Take the short placement test: a few passages with 3 questions each. Then ReadRise gives you articles that are just right for you.")}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={later} className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Later")}</button>
          <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white hover:bg-brand-purple" data-testid="rr-popup-start">{cont ? t("Continue ▶") : t("Start ▶")}</Link>
        </div>
      </div>
    </dialog>
  );
}
