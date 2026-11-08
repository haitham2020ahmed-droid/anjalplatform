"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

/**
 * 🔄 Refreshes the page's numbers every `seconds` (The class right now, Nov 2026) — only while the page is open AND
 * visible (a hidden tab or a closed laptop asks the server nothing). A Pause button stops it.
 */
export function AutoRefresh({ seconds, at }: { seconds: number; at: string }) {
  const router = useRouter();
  const t = useT();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, Math.max(10, seconds) * 1000);
    const back = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", back); };
  }, [on, seconds, router]);
  const time = new Date(at).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600 print:hidden" data-auto-refresh={on ? seconds : 0}>
      <span className={`inline-block h-2 w-2 rounded-full ${on ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
      <span>{on ? t("Updates every {n} seconds", { n: seconds }) : t("Paused")} · {t("Last update")} <span dir="ltr" className="tabular-nums">{time}</span></span>
      <button type="button" onClick={() => setOn(!on)} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{on ? t("Pause") : t("Resume")}</button>
      <button type="button" onClick={() => router.refresh()} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Update now")}</button>
    </p>
  );
}
