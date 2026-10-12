"use client";
/**
 * 🎙 Recording helpers shared by the Fluency Coach readers (1-minute check, whole passage, phrased, repeated, echo,
 * drill). The recording stays in memory: it is sent once to be scored and then dropped — never stored.
 *
 * Capture (built so a real reading is never lost):
 *  - the microphone opens first (a permission prompt never eats the start), with automatic gain on and echo
 *    cancellation off (audio-capture.ts READING_MIC_CONSTRAINTS), and the level meter only listens to the same stream;
 *  - the meter measures the room first (voice-level.ts): the voice threshold sits just above the room's own noise, so
 *    a soft or accented voice counts, and the student gets plain advice while reading ("Speak a little louder",
 *    "Move closer", "The room is noisy"); "Test your microphone" also switches noise suppression off in a quiet room
 *    (it can thin a soft voice) and keeps it on in a noisy one;
 *  - the recorder runs for a short warm-up BEFORE "Read now" (a pre-roll: the first word is never cut), and for a
 *    moment after Stop (the last word is never cut);
 *  - it never stops on silence — reading has pauses; only Stop or the time limit end it;
 *  - all chunks are kept (every second, or one piece on Safari/iPad MP4) and joined after the recorder's own stop event.
 * After Stop, on the device (audio-wav.ts): decoded, one channel at 16 kHz, a voice check (silence is never sent to
 * the AI — the student is told at once), a quiet voice made louder, a small WAV that every Gemini model accepts.
 * Sending: "Sending…" then "Scoring…"; the recording stays in memory until it is scored, so a busy coach, a timeout
 * or a lost connection is retried with the SAME recording ("Send again") before asking to record again.
 */
import { useEffect, useRef, useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import { browserRecorderMime, HEARD_MS, meterLevel, openMicrophone, READING_MIC_CONSTRAINTS, recorderOptions, recorderTimeslice, rms } from "./audio-capture";
import { prepareReading } from "./audio-wav";
import { CALIBRATE_MS, levelVerdict, micFeedback, newLevelState, pushLevel, wantsNoiseSuppression, type LevelState, type MicFeedback } from "./voice-level";

export { pickRecorderMime } from "./audio-capture";

/** The microphone check shown before (and during) reading. */
export interface MicState {
  open: boolean; level: number; verdict: "listening" | "heard" | "quiet";
  /** plain advice now: louder / closer / noisy room / too loud / keep going */
  feedback?: MicFeedback;
  /** the room was measured as noisy (its noise floor) */
  noisy?: boolean;
  /** "Test your microphone" passed: a voice was heard */
  tested?: boolean;
}

/** 🔊 The browser's own voice (on the device: nothing is sent anywhere). */
export function say(text: string, rate = 0.9, onEnd?: () => void) {
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = rate;
    if (onEnd) u.onend = () => onEnd();
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch { onEnd?.(); /* no voice on this device */ }
}

/** the recorder runs this long before "Read now" (pre-roll) and after Stop (the last word) */
export const WARMUP_MS = 600;
/** long enough for a soft final consonant and the recorder's last chunk (Safari / Android) */
export const TAIL_MS = 700;
/** the browser waits this long for the server (the server's own limit is 80 s, the hosting proxy's 100 s) */
export const UPLOAD_TIMEOUT_MS = 110_000;
/** a busy server / lost connection is retried by itself this many times with the same recording */
const AUTO_RETRIES = 1;
/** the coach heard a voice but could not follow the words: the same recording is listened to again this many times */
const UNCLEAR_RETRIES = 1;

export const MSG = {
  silent: "We couldn't hear you — check the microphone and read a little louder.",
  unclear: "The coach heard your voice but could not follow every word. Send it again, or read again a little closer to the microphone.",
  short: "The recording is too short. Press Start, read the passage, then press Stop.",
  mic: "The microphone is not available. Allow the microphone for this site, then try again.",
  network: "The recording could not be sent. Check the internet, then send it again.",
  busy: "The coach is very busy and could not finish listening. Send the same recording again in a moment.",
  server: "Something went wrong. Send the same recording again.",
} as const;

export type Stage = "ready" | "starting" | "recording" | "checking" | "sending" | "scoring" | "waiting" | "done" | "error";
type Ctx = typeof AudioContext;
const AudioCtx = (): Ctx | null => (typeof window === "undefined" ? null : window.AudioContext || (window as unknown as { webkitAudioContext?: Ctx }).webkitAudioContext || null);

/** decodeAudioData in both forms (old Safari: callbacks only), with a time limit. */
function decode(ctx: AudioContext, buf: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("decode timeout")), 20_000);
    const ok = (b: AudioBuffer) => { window.clearTimeout(t); resolve(b); }, no = (e: unknown) => { window.clearTimeout(t); reject(e); };
    try { const p = ctx.decodeAudioData(buf, ok, no) as unknown as Promise<AudioBuffer> | undefined; if (p && typeof p.then === "function") p.then(ok, no); }
    catch (e) { no(e); }
  });
}

/**
 * Record → check → convert → send to /api/fluency/score with the given fields. Handles the school's AI queue (202:
 * wait and send the same recording again) and drops the recording as soon as it is scored.
 */
export function useCoachRecorder(opts: { limit: number; fields: () => Record<string, string>; onResult: (r: CoachResult) => void }) {
  const [stage, setStage] = useState<Stage>("ready");
  const [secs, setSecs] = useState(0);
  const [wait, setWait] = useState(0);
  const [msg, setMsg] = useState("");
  /** true when the same recording can be sent again ("Send again") */
  const [canResend, setCanResend] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const stoppedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const waitTimer = useRef<number | null>(null);
  const audio = useRef<{ blob: Blob; seconds: number; voiced: number; fields: Record<string, string> } | null>(null);
  const slow = useRef(0);   // how many times the coach ran out of time on this recording
  const tries = useRef(0);  // automatic resends after a lost connection / busy server
  const optsRef = useRef(opts); optsRef.current = opts;
  const [mic, setMic] = useState<MicState>({ open: false, level: 0, verdict: "listening" });
  const stream = useRef<MediaStream | null>(null);
  const meter = useRef<{ ctx: AudioContext; timer: number; heardMs: number; running: boolean; level: LevelState } | null>(null);
  const unclear = useRef(0);   // automatic re-listens of a recording the coach heard but could not follow
  const tested = useRef(false);
  const decoder = useRef<AudioContext | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);

  function closeMic() {
    if (meter.current) { window.clearInterval(meter.current.timer); void meter.current.ctx.close().catch(() => undefined); meter.current = null; }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setMic({ open: false, level: 0, verdict: "listening" });
  }
  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    if (waitTimer.current) window.clearInterval(waitTimer.current);
    xhr.current?.abort();
    if (rec.current) { rec.current.onstop = null; try { if (rec.current.state !== "inactive") rec.current.stop(); } catch { /* already stopped */ } }
    closeMic();
    void decoder.current?.close().catch(() => undefined);
    audio.current = null;
  }, []);

  /** Opens the microphone (once) and starts the level meter (it only listens: the recorder gets the same stream). */
  async function openMic(): Promise<MediaStream> {
    if (stream.current && stream.current.getTracks().some((t) => t.readyState === "live")) return stream.current;
    const s = await openMicrophone((c) => navigator.mediaDevices.getUserMedia(c), READING_MIC_CONSTRAINTS);
    stream.current = s;
    try {
      const C = AudioCtx(); if (!C) throw new Error("no AudioContext");
      const ctx = new C();
      // iPad / iPhone: a new AudioContext is suspended until a tap; this runs inside the student's tap
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      let last = performance.now();
      const m = { ctx, timer: 0, heardMs: 0, running: ctx.state === "running", level: newLevelState() };
      m.timer = window.setInterval(() => {
        const now = performance.now();
        m.running = ctx.state === "running";
        if (!m.running) { void ctx.resume().catch(() => undefined); last = now; return; }   // no meter yet: never "too quiet"
        an.getFloatTimeDomainData(buf);
        let peak = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
        const r = rms(buf);
        // the room is measured in the first 300 ms; a voice is anything clearly above it (soft voices count)
        m.level = pushLevel(m.level, r, peak, Math.min(250, now - last));
        m.heardMs = m.level.heardMs;
        last = now;
        const verdict = levelVerdict(m.level);
        if (verdict === "heard") tested.current = true;
        setMic({ open: true, level: meterLevel(r), verdict, feedback: micFeedback(m.level), noisy: m.level.calibrated ? wantsNoiseSuppression(m.level.floor) : undefined, tested: tested.current });
      }, 50);
      meter.current = m;
      setMic({ open: true, level: 0, verdict: "listening" });
    } catch { setMic({ open: true, level: 0, verdict: "heard" }); /* no meter on this device: recording still works */ }
    return s;
  }

  function fail(text: string, resend: boolean) {
    setStage("error"); setMsg(text); setCanResend(resend && audio.current !== null);
    if (!resend) audio.current = null;
  }

  /**
   * "Test your microphone": the meter before reading (nothing is recorded). Once the room is measured, noise
   * suppression is switched off in a quiet room (it can thin out a soft voice) and kept on in a noisy one.
   */
  async function check() {
    setMsg("");
    let s: MediaStream;
    try { s = await openMic(); } catch { fail(MSG.mic, false); return; }
    window.setTimeout(() => {
      const lv = meter.current?.level;
      if (!lv?.calibrated) return;
      const want = wantsNoiseSuppression(lv.floor);
      for (const tr of s.getAudioTracks()) {
        try {
          const caps = (tr.getCapabilities?.() ?? {}) as { noiseSuppression?: boolean[] };
          if (Array.isArray(caps.noiseSuppression) && !caps.noiseSuppression.includes(want)) continue;
          void tr.applyConstraints({ ...tr.getConstraints(), noiseSuppression: want, autoGainControl: true, echoCancellation: false }).catch(() => undefined);
        } catch { /* the device keeps its settings */ }
      }
    }, CALIBRATE_MS + 150);
  }

  async function start() {
    if (stage === "starting" || stage === "recording") return;
    setMsg(""); setCanResend(false); audio.current = null; slow.current = 0; tries.current = 0; unclear.current = 0;
    setStage("starting");
    try {
      // inside the tap: a decoder for after Stop (old Safari only runs an AudioContext made in a tap)
      if (!decoder.current) { const C = AudioCtx(); try { decoder.current = C ? new C() : null; } catch { decoder.current = null; } }
      const s = await openMic();
      const mime = browserRecorderMime();
      let r: MediaRecorder;
      try { r = new MediaRecorder(s, recorderOptions(mime)); } catch { r = new MediaRecorder(s); }
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
      // the recorder's own stop event comes after its last piece of data: only then are all chunks joined
      r.onstop = () => {
        const heard = meter.current?.running ? meter.current.heardMs : null;
        closeMic();
        const type = r.mimeType || chunks.current[0]?.type || mime || "audio/webm";
        const seconds = Math.max(0, ((stoppedAt.current || performance.now()) - started.current) / 1000);
        void finish(new Blob(chunks.current, { type }), seconds, heard);
      };
      r.onerror = () => { try { if (r.state !== "inactive") r.stop(); } catch { /* stopped */ } };
      // the microphone unplugged or taken by another app: keep what was read
      s.getAudioTracks().forEach((t) => { t.onended = () => stop(true); });
      rec.current = r;
      const slice = recorderTimeslice(r.mimeType || mime);
      if (slice) r.start(slice); else r.start();
      // pre-roll: the recorder is already running when the student sees "Read now"
      await new Promise((ok) => window.setTimeout(ok, WARMUP_MS));
      if (rec.current !== r || r.state === "inactive") return;
      started.current = performance.now(); stoppedAt.current = 0; setSecs(0); setStage("recording");
      timer.current = window.setInterval(() => {
        const t = (performance.now() - started.current) / 1000;
        setSecs(Math.floor(t));
        if (t >= optsRef.current.limit) stop();   // timed readings stop by themselves (never on silence)
      }, 200);
    } catch { closeMic(); fail(MSG.mic, false); }
  }

  /** Stop: a short tail so the last word is kept, then the recorder's own stop. */
  function stop(now = false) {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    const r = rec.current;
    if (!r || r.state === "inactive" || stoppedAt.current) return;
    stoppedAt.current = performance.now();
    setStage("checking");
    window.setTimeout(() => { try { if (r.state !== "inactive") r.stop(); } catch { closeMic(); } }, now ? 0 : TAIL_MS);
  }

  /** After Stop: check for a voice on the device, make the WAV, send. Silence never reaches the AI. */
  async function finish(raw: Blob, seconds: number, heardByMeter: number | null) {
    setStage("checking");
    rec.current = null;
    if (!raw.size) { fail(MSG.silent, false); return; }
    let blob: Blob = raw;
    let voiced = heardByMeter !== null ? heardByMeter / 1000 : 0;
    try {
      const ctx = decoder.current; if (!ctx) throw new Error("no decoder");
      const buf = await decode(ctx, await raw.arrayBuffer());
      const channels: Float32Array[] = []; for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
      await new Promise((ok) => window.setTimeout(ok, 0));   // let "Checking…" paint first
      // the live meter heard a voice: trust it over a soft file (made louder and sent — never "we couldn't hear you")
      const p = prepareReading(channels, buf.sampleRate, { trustVoice: heardByMeter !== null && heardByMeter >= HEARD_MS });
      if (p.check.verdict === "short") { fail(MSG.short, false); return; }
      if (!p.wav) { fail(MSG.silent, false); return; }
      blob = new Blob([p.wav as BlobPart], { type: "audio/wav" });
      voiced = Math.max(p.check.voicedSeconds, heardByMeter !== null ? heardByMeter / 1000 : 0);
    } catch {
      // the device cannot decode its own recording: the live meter decides, and the original file is sent
      if (heardByMeter !== null && heardByMeter < HEARD_MS && seconds >= 3) { fail(MSG.silent, false); return; }
    }
    audio.current = { blob, seconds: Math.min(seconds, optsRef.current.limit), voiced, fields: optsRef.current.fields() };
    slow.current = 0; tries.current = 0; unclear.current = 0;
    upload();
  }

  function upload() {
    if (!audio.current) return;
    const a = audio.current;
    const f = new FormData();
    for (const [k, v] of Object.entries(a.fields)) f.set(k, v);
    f.set("seconds", String(Math.max(1, Math.round(a.seconds))));
    f.set("voiced", String(Math.round(a.voiced * 10) / 10));
    if (unclear.current) f.set("attempt", String(unclear.current));
    const ext = a.blob.type === "audio/wav" ? "wav" : /mp4|m4a|aac/.test(a.blob.type) ? "m4a" : /ogg/.test(a.blob.type) ? "ogg" : "webm";
    f.set("audio", a.blob, `reading.${ext}`);
    setStage("sending"); setMsg(""); setCanResend(false);
    const x = new XMLHttpRequest(); xhr.current = x;
    x.open("POST", "/api/fluency/score");
    x.timeout = UPLOAD_TIMEOUT_MS;
    x.upload.onload = () => setStage("scoring");
    const retryOr = (text: string) => {
      if (tries.current++ < AUTO_RETRIES) { setStage("sending"); window.setTimeout(upload, 3000); return; }
      fail(text, true);
    };
    x.onerror = () => retryOr(MSG.network);
    x.ontimeout = () => retryOr(MSG.busy);
    x.onload = () => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(x.responseText || "{}"); } catch { /* not JSON (a proxy page) */ }
      if (x.status === 202) {
        // the coach ran out of time twice on the same recording: stop trying by itself (the recording is kept)
        if (data.timeout && ++slow.current > 2) { fail(MSG.busy, true); return; }
        // the school's AI limit: wait in the queue, then send the same recording again
        let left = Number(data.seconds) || 30; setWait(left); setMsg(String(data.reason ?? "")); setStage("waiting");
        if (waitTimer.current) window.clearInterval(waitTimer.current);
        waitTimer.current = window.setInterval(() => { left--; setWait(left); if (left <= 0) { window.clearInterval(waitTimer.current!); waitTimer.current = null; upload(); } }, 1000);
        return;
      }
      if (x.status >= 500 || x.status === 0) { retryOr(MSG.server); return; }
      if (x.status < 200 || x.status >= 300) {
        // the coach heard a voice but could not follow the words: it listens to the SAME recording again by itself
        // (another model first) before anything is said; after that "Send again" stays possible
        if (data.code === "HEARD_UNCLEAR") {
          if (unclear.current++ < UNCLEAR_RETRIES) { setStage("scoring"); window.setTimeout(upload, 1500); return; }
          fail(String(data.error ?? MSG.unclear), true);
          return;
        }
        // "could not hear" from the coach: record again; any other answer: the same recording can be sent again
        const heard = data.code !== "NOT_HEARD";
        fail(String(data.error ?? MSG.server), heard && x.status !== 401 && x.status !== 403 && x.status !== 413);
        return;
      }
      audio.current = null;   // the recording is dropped as soon as it is scored
      setStage("done"); optsRef.current.onResult(data.result as CoachResult);
    };
    x.send(f);
  }

  /** "Send again": the same recording, no new reading needed. */
  function resend() { if (!audio.current) return; slow.current = 0; tries.current = 0; upload(); }
  /** "Record again": the old recording is dropped. */
  const reset = () => { audio.current = null; setCanResend(false); setStage("ready"); setMsg(""); setSecs(0); };
  return { stage, secs, wait, msg, canResend, start, stop: () => stop(), reset, resend, check, mic };
}

export type CoachRecorder = ReturnType<typeof useCoachRecorder>;
