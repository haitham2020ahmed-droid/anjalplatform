"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SheetLayout } from "@/lib/omr/layout";
import { readSheet, type OmrResult } from "@/lib/omr/read";

/**
 * Bubble-sheet scanner: rear camera (getUserMedia) with a guide frame, or several photos / scan images at once.
 * Every image is decoded and read here in the browser (a Web Worker when available, else the main thread);
 * nothing is uploaded. onSheet gets the result and an object URL of the straightened sheet for the review screen
 * (the caller may URL.revokeObjectURL it when done).
 *
 * labels: translated words keyed by the English text (see OMR_SCANNER_LABELS in @/lib/omr/labels).
 */
const MAX_DECODE_SIDE = 2400; // the reader works at ≤ 1600 px; decoding a little larger keeps detail and saves memory

type Job = { resolve: (r: OmrResult) => void; reject: (e: Error) => void };

export function SheetScanner(props: {
  layout: SheetLayout;
  onSheet: (r: OmrResult, preview: string) => void;
  labels: Record<string, string>;
}) {
  const { layout, onSheet, labels } = props;
  const L = (k: string) => labels[k] ?? k;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobsRef = useRef(new Map<number, Job>());
  const nextId = useRef(1);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "error">("off");
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ---- worker (falls back to the main thread if it cannot start or fails)
  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("../../lib/omr/omr.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent) => {
        const { id, result, error: err } = e.data as { id: number; result?: OmrResult; error?: string };
        const job = jobsRef.current.get(id);
        if (!job) return;
        jobsRef.current.delete(id);
        if (result) job.resolve(result); else job.reject(new Error(err ?? "worker error"));
      };
      w.onerror = () => { workerRef.current = null; for (const j of jobsRef.current.values()) j.reject(new Error("worker failed")); jobsRef.current.clear(); };
      workerRef.current = w;
    } catch { workerRef.current = null; }
    return () => { w?.terminate(); workerRef.current = null; };
  }, []);

  const read = useCallback((img: ImageData): Promise<OmrResult> => {
    const w = workerRef.current;
    const local = () => new Promise<OmrResult>((resolve) => setTimeout(() => resolve(readSheet(img, layout)), 0));
    if (!w) return local();
    const id = nextId.current++;
    const copy = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height); // keep `img` for a fallback
    return new Promise<OmrResult>((resolve, reject) => {
      jobsRef.current.set(id, { resolve, reject });
      w.postMessage({ id, img: copy, layout }, [copy.data.buffer]);
    }).catch(() => local());
  }, [layout]);

  const handleImage = useCallback(async (img: ImageData, fallbackPreview: () => Promise<string>) => {
    const result = await read(img);
    const preview = result.warped ? await imageDataUrl(result.warped) : await fallbackPreview();
    onSheet(result, preview);
  }, [read, onSheet]);

  // ---- files
  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|bmp|gif)$/i.test(f.name));
    setBusy((b) => b + list.length);
    for (const file of list) {
      try {
        const canvas = await fileToCanvas(file);
        const img = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        await handleImage(img, () => canvasUrl(canvas));
      } catch {
        setError(`${labels["Could not open this image"] ?? "Could not open this image"}: ${file.name}`);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }, [handleImage, labels]);

  // ---- camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("off");
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCamera("error"); return; }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3264 }, height: { ideal: 2448 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => undefined); }
      setCamera("on");
    } catch {
      setCamera("error");
    }
  }, []);

  const capture = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const { canvas, ctx } = makeCanvas(v.videoWidth, v.videoHeight);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setBusy((b) => b + 1);
    try { await handleImage(img, () => canvasUrl(canvas)); } finally { setBusy((b) => b - 1); }
  }, [handleImage]);

  const btn = "min-h-11 rounded-xl px-4 py-2 font-semibold disabled:opacity-60";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {camera === "on" ? (
          <>
            <button type="button" onClick={capture} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}>📷 {L("Take photo")}</button>
            <button type="button" onClick={stopCamera} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>{L("Stop camera")}</button>
          </>
        ) : (
          <button type="button" onClick={startCamera} disabled={camera === "starting"} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}>📷 {L("Use camera")}</button>
        )}
        <label className={`${btn} inline-flex cursor-pointer items-center bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
          🖼 {L("Choose images")}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.currentTarget.files); e.currentTarget.value = ""; }} />
        </label>
        {busy > 0 ? <span className="text-sm text-slate-600" role="status">{L("Reading sheets…")} ({busy})</span> : null}
      </div>

      <div className={camera === "on" || camera === "starting" ? "relative mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-black" : "hidden"}>
        <video ref={videoRef} playsInline muted className="block h-auto w-full" />
        {/* guide frame in A4 proportions with the four corner squares */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[88%] rounded-md border-2 border-dashed border-white/80" style={{ aspectRatio: "210 / 297" }}>
            {["left-1 top-1", "right-1 top-1", "left-1 bottom-1", "right-1 bottom-1"].map((p) => <span key={p} className={`absolute ${p} h-4 w-4 border-2 border-white`} />)}
          </div>
        </div>
        <p className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-center text-sm text-white">{L("Line up the four black corner squares inside the frame")}</p>
      </div>

      {camera === "error" ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{L("Camera not available. Choose images instead.")}</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-600">{L("Scanned PDF? Save its pages as images (JPG or PNG) and choose them here.")} {L("Photos are read on this device and are never uploaded.")}</p>
    </div>
  );
}

function makeCanvas(w: number, h: number) {
  const k = Math.min(1, MAX_DECODE_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return { canvas, ctx };
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource & { width: number; height: number };
  let close = () => {};
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bmp; close = () => bmp.close();
  } catch {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.src = url;
    try { await im.decode(); } finally { URL.revokeObjectURL(url); }
    source = im;
  }
  const w = "naturalWidth" in source ? (source as HTMLImageElement).naturalWidth : source.width;
  const h = "naturalHeight" in source ? (source as HTMLImageElement).naturalHeight : source.height;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  close();
  return canvas;
}

function canvasUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ""), "image/jpeg", 0.85));
}

function imageDataUrl(img: ImageData): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvasUrl(canvas);
}
