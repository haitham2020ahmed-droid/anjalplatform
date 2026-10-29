/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { qrPath } from "@/lib/qr";
import { getAssignedQrLinkAction } from "@/app/teacher/assigned/actions";

/**
 * 🔗 "Add a link / QR for this assignment" (owner request, Oct 2026): one class at a time — ask which class first
 * when the item reaches more than one, so a teacher who teaches several grades never gets a mixed-grade list by
 * accident; the chosen class is baked into the link itself (assigned-qr.ts), so the student who opens it never
 * sees a class picker, only their own classmates' names.
 */
export function AssignedQrButton({ kind, id, classIds, classNames }: { kind: string; id: string; classIds: string[]; classNames: string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState<string | null>(classIds.length === 1 ? classIds[0] : null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string } | { error: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [imgStatus, setImgStatus] = useState<"copied" | "downloaded" | "failed" | null>(null);

  const fetchLink = async (cid: string) => {
    setBusy(true); setResult(null);
    try { const r = await getAssignedQrLinkAction(kind, id, cid); setResult(r.ok ? { url: r.url } : { error: r.error }); }
    catch { setResult({ error: "Something went wrong. Please try again." }); }
    finally { setBusy(false); }
  };

  const openPanel = () => {
    setOpen(true); setCopied(false); setImgStatus(null);
    if (classId) void fetchLink(classId);
  };
  const pick = (cid: string) => { setClassId(cid); setImgStatus(null); void fetchLink(cid); };

  let qr: { total: number; d: string } | null = null;
  if (result && "url" in result) { try { qr = qrPath(result.url); } catch { qr = null; } }

  // 🖼️ "Copy the QR code too, not just the link" (owner request, Oct 2026): rasterize the SVG to a PNG at a fixed
  // scale and write it to the clipboard as an image, so it can be pasted into Word/WhatsApp/email like any picture.
  // Older browsers without Clipboard-image support fall back to downloading the PNG instead of failing silently.
  const copyQrImage = async () => {
    if (!qr) return;
    const scale = 10; // module → px, so the pasted picture isn't blurry
    const size = qr.total * scale;
    let pngBlob: Blob;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.total} ${qr.total}"><rect width="100%" height="100%" fill="#fff"/><path d="${qr.d}" fill="#000"/></svg>`;
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("QR image failed to load")); img.src = svgUrl; });
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");
      ctx.drawImage(img, 0, 0, size, size);
      pngBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
    } catch {
      setImgStatus("failed");
      return;
    } finally {
      URL.revokeObjectURL(svgUrl); // always released, success or failure (was only revoked on the success path)
    }
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("Clipboard image copy not supported");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      setImgStatus("copied");
    } catch {
      const url = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = url; a.download = "qr-code.png";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setImgStatus("downloaded");
    }
  };

  return (
    <span className="relative inline-flex">
      <button type="button" aria-label={t("Link / QR code to open this directly")} onClick={openPanel}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 ring-1 ring-line hover:ring-brand-teal">🔗</button>
      {open && (
        <>
          <button type="button" aria-label={t("Close")} onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute end-0 top-8 z-20 w-64 space-y-2 rounded-xl bg-surface p-3 text-start shadow-card ring-1 ring-line">
            <p className="text-xs font-semibold text-ink">{t("Link / QR: opens straight on this, no menus")}</p>
            {!classId && classIds.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-muted">{t("Which class?")}</p>
                {classIds.map((cid, i) => (
                  <button key={cid} type="button" onClick={() => pick(cid)} className="block w-full rounded-lg bg-surface-2 px-2 py-1.5 text-start text-sm font-semibold text-ink hover:ring-1 hover:ring-brand-teal">
                    <bdi>{classNames[i] ?? cid}</bdi>
                  </button>
                ))}
              </div>
            )}
            {classId && busy && <p className="text-sm text-muted">{t("Loading…")}</p>}
            {classId && result && "error" in result && <p role="alert" className="text-sm text-rose-800">{t(result.error)}</p>}
            {classId && result && "url" in result && (
              <div className="space-y-2">
                {qr && (
                  <div className="space-y-1">
                    <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className="h-36 w-36 rounded-lg bg-white p-1" shapeRendering="crispEdges" role="img" aria-label={t("QR code")}>
                      <rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" />
                    </svg>
                    <button type="button" onClick={() => void copyQrImage()}
                      className="w-36 rounded-lg bg-brand-navy px-2 py-1.5 text-xs font-semibold text-white">
                      {imgStatus === "copied" ? t("Copied") : imgStatus === "downloaded" ? t("Downloaded") : imgStatus === "failed" ? t("Could not copy") : t("Copy image")}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input readOnly value={result.url} dir="ltr" onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-xs ring-1 ring-line" />
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(result.url).then(() => setCopied(true)).catch(() => undefined); }}
                    className="shrink-0 rounded-lg bg-brand-navy px-2 py-1.5 text-xs font-semibold text-white">{copied ? t("Copied") : t("Copy")}</button>
                </div>
              </div>
            )}
            {classIds.length > 1 && classId && (
              <button type="button" onClick={() => { setClassId(null); setResult(null); }} className="text-xs font-semibold text-brand-teal hover:underline">{t("Change class")}</button>
            )}
          </div>
        </>
      )}
    </span>
  );
}
