"use client";
/**
 * 🎙 Recording helpers shared by the Fluency Coach readers (1-minute check, whole passage, phrased, repeated, echo,
 * drill). The recording stays in memory: it is sent once to be scored and then dropped — never stored.
 * Clear sound: echo and noise reduced, steady volume, one channel, the best format of the device (Opus/WebM, or
 * MP4 on iPad/iPhone), about 64 kbit/s (audio-capture.ts). A level meter checks the microphone before reading.
 */
import { useEffect, useRef, useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import { browserRecorderMime, HEARD_RMS, meterLevel, micVerdict, openMicrophone, recorderOptions, rms } from "./audio-capture";

export { pickRecorderMime } from "./audio-capture";

/** The microphone check shown before (and during) reading. */
export interface MicState { open: boolean; level: number; verdict: "listening" | "heard" | "quiet" }

/** 🔊 The browser's own voice (on the device: nothing is sent anywhere). */
export function say(text: string, rate = 0.8, onEnd?: () => void) {
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = rate;
    if (onEnd) u.onend = () => onEnd();
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch { onEnd?.(); /* no voice on this device */ }
}

/** The recording as a small 16 kHz mono WAV (every AI audio model reads it); the original when converting fails. */
export async function toWav(blob: Blob): Promise<Blob> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
    const data = (await off.startRendering()).getChannelData(0);
    const buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
    const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
    return new Blob([buf], { type: "audio/wav" });
  } catch { return blob; }
}

export type Stage = "ready" | "recording" | "sending" | "waiting" | "done" | "error";

/**
 * Record → convert → send to /api/fluency/score with the given fields. Handles the school's AI queue (202: wait and
 * send the same recording again) and drops the recording as soon as it is scored.
 */
export function useCoachRecorder(opts: { limit: number; fields: () => Record<string, string>; onResult: (r: CoachResult) => void }) {
  const [stage, setStage] = useState<Stage>("ready");
  const [secs, setSecs] = useState(0);
  const [wait, setWait] = useState(0);
  const [msg, setMsg] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const audio = useRef<{ blob: Blob; seconds: number; fields: Record<string, string> } | null>(null);
  const slow = useRef(0);   // how many times the coach ran out of time on this recording
  const optsRef = useRef(opts); optsRef.current = opts;
  const [mic, setMic] = useState<MicState>({ open: false, level: 0, verdict: "listening" });
  const stream = useRef<MediaStream | null>(null);
  const meter = useRef<{ ctx: AudioContext; timer: number } | null>(null);

  function closeMic() {
    if (meter.current) { window.clearInterval(meter.current.timer); void meter.current.ctx.close().catch(() => undefined); meter.current = null; }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setMic({ open: false, level: 0, verdict: "listening" });
  }
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); closeMic(); }, []);

  /** Opens the microphone (once) and starts the level meter. */
  async function openMic(): Promise<MediaStream> {
    if (stream.current && stream.current.getTracks().some((t) => t.readyState === "live")) return stream.current;
    const s = await openMicrophone((c) => navigator.mediaDevices.getUserMedia(c));
    stream.current = s;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      const t0 = performance.now(); let heardMs = 0, last = t0;
      const tick = window.setInterval(() => {
        an.getFloatTimeDomainData(buf);
        const r = rms(buf), now = performance.now();
        if (r >= HEARD_RMS) heardMs += now - last;
        last = now;
        setMic({ open: true, level: meterLevel(r), verdict: micVerdict({ heardMs, elapsedMs: now - t0 }) });
      }, 100);
      meter.current = { ctx, timer: tick };
      setMic({ open: true, level: 0, verdict: "listening" });
    } catch { setMic({ open: true, level: 0, verdict: "heard" }); /* no meter on this device: recording still works */ }
    return s;
  }

  /** "Check the microphone": the meter before reading (no recording). */
  async function check() {
    setMsg("");
    try { await openMic(); } catch { setStage("error"); setMsg("The microphone is not available. Allow the microphone for this site, then try again."); }
  }

  async function start() {
    setMsg("");
    try {
      const stream = await openMic();
      let r: MediaRecorder;
      try { r = new MediaRecorder(stream, recorderOptions(browserRecorderMime())); } catch { r = new MediaRecorder(stream); }
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { closeMic(); void send(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }), (performance.now() - started.current) / 1000); };
      rec.current = r; r.start(); started.current = performance.now(); setSecs(0); setStage("recording");
      timer.current = window.setInterval(() => {
        const t = (performance.now() - started.current) / 1000;
        setSecs(Math.floor(t));
        if (t >= optsRef.current.limit) stop();   // timed readings stop by themselves
      }, 200);
    } catch { setStage("error"); setMsg("The microphone is not available. Allow the microphone for this site, then try again."); }
  }
  function stop() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }
  async function send(raw: Blob, seconds: number) {
    setStage("sending");
    const blob = await toWav(raw);
    audio.current = { blob, seconds: Math.min(seconds, optsRef.current.limit), fields: optsRef.current.fields() };
    slow.current = 0;
    await upload();
  }
  async function upload() {
    if (!audio.current) return;
    const f = new FormData();
    for (const [k, v] of Object.entries(audio.current.fields)) f.set(k, v);
    f.set("seconds", String(Math.max(1, Math.round(audio.current.seconds))));
    f.set("audio", audio.current.blob, audio.current.blob.type === "audio/wav" ? "reading.wav" : "reading.webm");
    setStage("sending");
    try {
      const res = await fetch("/api/fluency/score", { method: "POST", body: f });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        // the coach ran out of time twice on the same recording: stop trying by itself
        if (data.timeout && ++slow.current > 2) { setStage("error"); setMsg("The coach is very busy and could not finish listening. Please try again in a few minutes."); return; }
        // the school's AI limit: wait in the queue, then send the same recording again
        let left = Number(data.seconds) || 30; setWait(left); setMsg(String(data.reason ?? "")); setStage("waiting");
        const t = window.setInterval(() => { left--; setWait(left); if (left <= 0) { window.clearInterval(t); void upload(); } }, 1000);
        return;
      }
      if (!res.ok) { setStage("error"); setMsg(String(data.error ?? "Something went wrong. Try again.")); return; }
      audio.current = null;   // the recording is dropped as soon as it is scored
      setStage("done"); optsRef.current.onResult(data.result as CoachResult);
    } catch { setStage("error"); setMsg("No connection. Check the internet and try again."); }
  }
  const reset = () => { setStage("ready"); setMsg(""); setSecs(0); };
  return { stage, secs, wait, msg, start, stop, reset, check, mic };
}
