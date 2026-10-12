"use client";
import { useT } from "@/i18n/client";
import type { CoachRecorder } from "./recorder";

/**
 * 🎙 What the coach is doing after Stop (Checking… Sending… Scoring…, the queue) and, when something failed, the way
 * back: "Send again" (the same recording, kept in memory) first, then "Record again".
 */
export function CoachStatus({ r, dark = true }: { r: CoachRecorder; dark?: boolean }) {
  const t = useT();
  const text = dark ? "text-white" : "text-slate-800";
  const btn = "min-h-[44px] rounded-2xl px-6 py-2.5 font-bold";
  if (r.stage === "starting") return <p className={`text-lg font-semibold ${text}`}>🎙 {t("Getting the microphone ready…")}</p>;
  if (r.stage === "checking") return <p className={`text-lg font-semibold ${text}`}>🎧 {t("Checking your recording…")}</p>;
  if (r.stage === "sending") return <p className={`text-lg font-semibold ${text}`}>📤 {t("Sending your reading…")}</p>;
  if (r.stage === "scoring") return <p className={`text-lg font-semibold ${text}`}>🎧 {t("The coach is listening and scoring…")}</p>;
  if (r.stage === "waiting") return <p className={`text-lg font-semibold ${text}`}>⏳ {t("Your result comes in about {n}s. Keep this page open.", { n: r.wait })}{r.msg ? <span className={`block text-sm font-normal ${dark ? "text-white/80" : "text-slate-600"}`}>{r.msg}</span> : null}</p>;
  if (r.stage !== "error") return null;
  return (
    <>
      <p className={`text-base font-semibold ${dark ? "text-white" : "text-rose-800"}`} role="alert">⚠️ {t(r.msg)}</p>
      <div className="flex flex-wrap gap-2">
        {r.canResend && <button type="button" onClick={r.resend} className={`${btn} ${dark ? "bg-teal-300 text-brand-navy" : "bg-brand-navy text-white"}`}>📤 {t("Send again")}</button>}
        <button type="button" onClick={r.reset} className={`${btn} ${dark ? "bg-white text-brand-navy" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>🎙 {t("Record again")}</button>
      </div>
    </>
  );
}
