"use client";
/**
 * 📷 "Join Live": scan the teacher's QR code with the camera (BarcodeDetector, where the browser has it) or type
 * the 6-digit code. Signed-in students never type a name. The QR code holds a join link, so the device's own camera
 * app opens the game too.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const codeFrom = (text: string): string | null => {
  const m = /\/play\/(\d{6})(?:\D|$)/.exec(text) ?? /^\s*(\d{6})\s*$/.exec(text);
  return m ? m[1] : null;
};

export function JoinLive({ className = "", autoOpen = false }: { className?: string; autoOpen?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => { setCanScan(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia); }, []);
  const stop = () => { stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null; setScanning(false); };
  useEffect(() => () => stop(), []);
  useEffect(() => { if (!open) stop(); }, [open]);

  const go = (c: string) => { stop(); router.push(`/play/${c}`); };

  const scan = async () => {
    setMsg(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = s; setScanning(true);
      const v = video.current!; v.srcObject = s; await v.play();
      const det = new (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector({ formats: ["qr_code"] });
      const loop = async () => {
        if (!stream.current) return;
        try {
          const found = await det.detect(v);
          for (const f of found) { const c = codeFrom(f.rawValue); if (c) return go(c); }
        } catch { /* keep trying */ }
        setTimeout(loop, 300);
      };
      void loop();
    } catch { stop(); setMsg(t("The camera did not open. Type the code instead.")); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) { setMsg(t("Type the 6-digit code.")); return; }
    go(c);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="join-live" className={`${BTN_SECONDARY} min-h-12 ${className}`}>
        <span aria-hidden="true">📷</span>{t("Join Live")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="join-live-h" className="animate-fade-up w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 id="join-live-h" className="text-xl font-semibold text-brand-navy">{t("Join Live")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")} className="grid h-11 w-11 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <video ref={video} playsInline muted className={`${scanning ? "block" : "hidden"} aspect-square w-full rounded-xl bg-black object-cover`} />
              {canScan ? (
                !scanning && <button type="button" onClick={scan} className={`${BTN_PRIMARY} min-h-14 w-full text-lg`}><span aria-hidden="true">📷</span>{t("Scan the QR code")}</button>
              ) : (
                <p className="text-slate-700"><span aria-hidden="true">📷 </span>{t("Point your device's camera at the QR code on the board. It opens the game.")}</p>
              )}
              {scanning && <p className="mt-2 text-center text-sm text-slate-600" role="status">{t("Hold the QR code inside the square…")}</p>}
            </div>
            <form onSubmit={submit} className="mt-4">
              <label htmlFor="live-code" className="block font-semibold text-brand-navy">{t("Or type the 6-digit code")}</label>
              <div className="mt-2 flex gap-2">
                <input id="live-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" pattern="\d{6}" maxLength={6} dir="ltr" placeholder="123456"
                  className="min-h-14 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-center font-mono text-2xl tracking-[0.3em] text-brand-navy" />
                <button className={`${BTN_PRIMARY} min-h-14 px-6 text-lg`}>{t("Join")}</button>
              </div>
            </form>
            {msg && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
