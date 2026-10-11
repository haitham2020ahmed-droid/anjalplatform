"use client";
import { useT } from "@/i18n/client";
import type { MicState } from "./recorder";

/** 🎙 The microphone level before reading: "We can hear you ✓", or a tip when it is too quiet. */
export function MicMeter({ mic, onCheck, dark = true }: { mic: MicState; onCheck?: () => void; dark?: boolean }) {
  const t = useT();
  if (!mic.open) {
    return onCheck ? (
      <button type="button" onClick={onCheck} className={`min-h-[44px] rounded-2xl px-4 text-sm font-bold ring-1 ${dark ? "text-white ring-white/40 hover:bg-white/10" : "text-brand-navy ring-slate-300 hover:ring-brand-teal"}`}>
        🎙 {t("Check the microphone")}
      </button>
    ) : null;
  }
  const tone = mic.verdict === "heard" ? "bg-emerald-400" : mic.verdict === "quiet" ? "bg-amber-400" : "bg-sky-400";
  return (
    <div className="min-w-[12rem] flex-1" aria-live="polite">
      <div className={`h-3 w-full overflow-hidden rounded-full ${dark ? "bg-white/20" : "bg-slate-200"}`} aria-hidden="true">
        <div className={`h-full rounded-full transition-[width] duration-100 ${tone}`} style={{ width: `${Math.round(mic.level * 100)}%` }} />
      </div>
      <p className={`mt-1 text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>
        {mic.verdict === "heard" ? t("We can hear you ✓") : mic.verdict === "quiet" ? t("It is too quiet. Move closer to the microphone and speak a little louder.") : t("Say a few words to test the microphone…")}
      </p>
    </div>
  );
}
