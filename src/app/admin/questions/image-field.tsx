"use client";
import { useRef, useState } from "react";

const MAX_SIDE = 1600, MAX_BYTES = 1_000_000;

/** Shrinks large photos in the browser before upload (keeps small PNG/GIF/WebP files as they are). */
async function prepare(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image (SVG is not accepted).");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= MAX_BYTES) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no transparency
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("The image is still larger than 1 MB after resizing. Use a smaller image.");
}

/** Question image: upload, replace, remove; optional description for screen readers. */
export function ImageField({ imageId, imageAlt, readOnly, onChange }: { imageId: string | null; imageAlt: string; readOnly?: boolean; onChange: (v: { imageId: string | null; imageAlt: string }) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setError(null); setBusy(true);
    try {
      const blob = await prepare(file);
      const form = new FormData();
      form.set("file", blob, file.name.replace(/\.[a-z]+$/i, blob.type === "image/jpeg" && file.type !== "image/jpeg" ? ".jpg" : "$&"));
      form.set("alt", imageAlt);
      const r = await fetch("/api/question-images", { method: "POST", body: form });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error ?? "The image could not be uploaded.");
      onChange({ imageId: j.id, imageAlt });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <fieldset className="rounded-xl p-3 ring-1 ring-slate-200">
      <legend className="px-1 text-sm font-semibold text-slate-700">Question image (optional)</legend>
      <p className="text-xs text-slate-500">A diagram, chart, map or picture shown with the question. Large photos are resized automatically (max 1 MB).</p>
      {imageId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/question-images/${imageId}`} alt={imageAlt || "Question image"} className="mt-2 max-h-64 rounded-lg ring-1 ring-slate-200" />
      ) : <p className="mt-2 text-sm text-slate-600">No image.</p>}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{busy ? "Uploading…" : imageId ? "Replace image" : "Upload image"}</button>
          {imageId && <button type="button" disabled={busy} onClick={() => onChange({ imageId: null, imageAlt: "" })} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">Remove image</button>}
        </div>
      )}
      {imageId && <label className="mt-2 block text-sm">Description for screen readers<input value={imageAlt} disabled={readOnly} maxLength={300} onChange={(e) => onChange({ imageId, imageAlt: e.target.value })} placeholder="e.g. A map of the Arabian Peninsula" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">Changes are kept when you save the question.</p>
    </fieldset>
  );
}
