"use client";
import { useT } from "@/i18n/client";
import type { MicState } from "./recorder";
import { FEEDBACK_TEXT } from "./voice-level";

/**
 * 🎙 The microphone level: "Test your microphone" before reading (say a short sentence: "We can hear you ✓", or
 * plain advice), and while reading the same advice when it helps ("Speak a little louder", "Move closer", "The room
 * is noisy"). The level adapts to the room, so a soft voice still counts.
 */
export function MicMeter({ mic, onCheck, dark = true, compact = false }: { mic: MicState; onCheck?: () => void; dark?: boolean; compact?: boolean }) {
  const t = useT();
  if (!mic.open) {
    return onCheck ? (
      <button type="button" onClick={onCheck} className={`min-h-[44px] rounded-2xl px-4 text-sm font-bold ring-1 ${dark ? "text-white ring-white/40 hover:bg-white/10" : "text-brand-navy ring-slate-300 hover:ring-brand-teal"}`}>
        🎙 {t("Test your microphone")}
      </button>
    ) : null;
  }
  const fb = mic.feedback ?? (mic.verdict === "heard" ? "ok" : mic.verdict === "quiet" ? "closer" : "listening");
  const good = fb === "ok";
  const tone = good ? "bg-emerald-400" : fb === "listening" ? "bg-sky-400" : "bg-amber-400";
  // while reading, stay quiet unless there is something useful to say
  if (compact && (fb === "ok" || fb === "listening")) return null;
  return (
    <div className="min-w-[12rem] flex-1" aria-live="polite">
      <div className={`h-3 w-full overflow-hidden rounded-full ${dark ? "bg-white/20" : "bg-slate-200"}`} aria-hidden="true">
        <div className={`h-full rounded-full transition-[width] duration-100 ${tone}`} style={{ width: `${Math.round(mic.level * 100)}%` }} />
      </div>
      <p className={`mt-1 text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>
        {fb === "listening" && !compact ? t("Say: “I am ready to read!”") : t(FEEDBACK_TEXT[fb])}
        {!compact && mic.noisy !== undefined && <span className={`ms-2 text-xs font-normal ${dark ? "text-white/70" : "text-slate-500"}`}>{mic.noisy ? t("Noisy room") : t("Quiet room ✓")}</span>}
      </p>
    </div>
  );
}
