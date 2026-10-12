"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

/** Safe Exam Browser (kiosk) is already locked and fullscreen. */
export const isSeb = () => typeof navigator !== "undefined" && /\bSEB\b/i.test(navigator.userAgent);
/** The Fullscreen API can be used here (not on iPhone Safari, not inside SEB). */
export const canFullscreen = () => typeof document !== "undefined" && !isSeb() && Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);

/**
 * ▶ “Start Writing”: asks for fullscreen on the click itself (browsers need the click), tells the server (the time
 * limit starts now), then opens the locked page in the same tab (the page stays fullscreen).
 */
export function StartWritingButton({ taskId, label }: { taskId: string; label: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true); setError(null);
    try { if (canFullscreen() && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined); } catch { /* the locked page asks again */ }
    try {
      const r = await fetch("/api/writing/locked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "start", taskId }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || "Could not start. Try again.");
      router.push(`/student/writing/${encodeURIComponent(taskId)}/write`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    }
  }
  return (
    <div>
      <button type="button" onClick={start} disabled={busy} className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-600 px-8 text-lg font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
        {busy ? t("Opening…") : `✍️ ${t(label)}`}
      </button>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{t(error)}</p>}
    </div>
  );
}
