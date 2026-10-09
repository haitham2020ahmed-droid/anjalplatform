"use client";
import { useEffect, useRef, useState } from "react";

/** 🎙 Record yourself reading the text (up to 3 minutes), listen, then send it to your teacher. */
export function Recorder({ taskId, sent }: { taskId: string; sent: boolean }) {
  const [state, setState] = useState<"idle" | "rec" | "ready" | "sending" | "sent">(sent ? "sent" : "idle");
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), blob = useRef<Blob | null>(null), timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48_000 });
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); blob.current = new Blob(chunks.current, { type: r.mimeType || "audio/webm" }); setUrl(URL.createObjectURL(blob.current)); setState("ready"); if (timer.current) window.clearInterval(timer.current); };
      r.start(); rec.current = r; setSecs(0); setState("rec");
      timer.current = window.setInterval(() => setSecs((s) => { if (s + 1 >= 180) rec.current?.stop(); return s + 1; }), 1000);
    } catch { setError("The microphone is not available. Allow the microphone in the browser and try again."); }
  };
  const send = async () => {
    if (!blob.current) return;
    setState("sending"); setError(null);
    const f = new FormData(); f.set("task", taskId); f.set("audio", blob.current, "reading.webm");
    try {
      const r = await fetch("/api/recordings", { method: "POST", body: f });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setError(j.error ?? "Could not send. Try again."); setState("ready"); return; }
      setState("sent");
    } catch { setError("No connection. Try again."); setState("ready"); }
  };
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      {state === "sent" && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">✅ Your reading was sent to your teacher. You can record again until it is scored.</p>}
      <div className="flex flex-wrap items-center gap-3">
        {state !== "rec" ? <button type="button" onClick={() => void start()} className="rounded-xl bg-red-600 px-5 py-3 text-lg font-bold text-white hover:bg-red-700">🎙 {state === "idle" ? "Start recording" : "Record again"}</button>
          : <button type="button" onClick={() => rec.current?.stop()} className="animate-pulse rounded-xl bg-slate-800 px-5 py-3 text-lg font-bold text-white">⏹ Stop ({Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")})</button>}
        {url && state !== "rec" && <audio controls src={url} className="max-w-full" />}
        {state === "ready" && <button type="button" onClick={() => void send()} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">📤 Send to my teacher</button>}
        {state === "sending" && <span className="font-semibold text-slate-600">Sending…</span>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}
      <p className="mt-3 text-sm text-slate-500">Read the whole text clearly. Up to 3 minutes.</p>
    </div>
  );
}
