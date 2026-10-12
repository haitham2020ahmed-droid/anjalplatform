"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chunkWords, estimateWordTimes, normalizeSpeech, speechKey, speechWords, wordAt, wordAtChar } from "@/lib/tts/text";
import { AUDIO_RATE, pickBestVoice, rankVoices, SPEECH_RATE, type ListenSpeed } from "@/lib/tts/voices";
import { useT } from "@/i18n/client";

interface PreAudio { audioUrl: string; durationMs: number; timings: { exact: boolean; words: number[] } }
type PreSet = { normal: PreAudio | null; slow: PreAudio | null };

/** Which recording plays for a speed, and how fast: its own recording, else the other one sped up or slowed down. */
export function audioForSpeed(pre: PreSet | null, speed: ListenSpeed): { audio: PreAudio; rate: number; own: boolean } | null {
  if (!pre) return null;
  if (pre[speed]) return { audio: pre[speed]!, rate: speed === "normal" ? AUDIO_RATE.normal : 1, own: true };
  if (speed === "slow" && pre.normal) return { audio: pre.normal, rate: AUDIO_RATE.slow, own: false };
  if (speed === "normal" && pre.slow) return { audio: pre.slow, rate: Math.round((AUDIO_RATE.normal / AUDIO_RATE.slow) * 100) / 100, own: false };
  return null;
}

/**
 * 🔊 Read-aloud player (UI reorg Phase 6), used everywhere a text can be listened to.
 *
 *  - Plays the natural voice (Gemini or Google) made ahead of time (scripts/tts/pregenerate.ts) or the first time
 *    anyone listens (POST /api/tts, cached per text + voice + speed), looked up by a hash of the text only. Until it
 *    exists, or on any error, the most natural American English voice of the device reads (the student can change it).
 *  - Slow / Normal speed (remembered on this device; Slow first for students reading below level: `slowFirst`). Slow
 *    plays its own naturally slow recording when it was made, otherwise the normal one slowed down.
 *  - "Follow along": each word is highlighted as it is read (stored word timings, or the voice's word events, or
 *    an estimate proportional to the word length when the voice gives none).
 *  - `sequence` (e.g. ["slow", "normal"]): one tap plays the text once at each speed, in order; `onFinish` after.
 *  - `compact`: just the round button (single words: the dictionary).
 *  - Big buttons (44 px), works with touch; starts only when the student taps (iPhone/iPad rules).
 *  - `preOnly`: shows only when the natural pre-generated audio exists (ReadRise keeps its own in-text device voice
 *    otherwise); `onAvailability` tells the page whether it does. Buttons are interface words (t()); the text read
 *    and the follow-along words are English content (never translated).
 */
export function ListenButton({ text, label = "Listen", className = "", slowFirst = false, followAlong = true, preOnly = false, onAvailability, sequence, onFinish, compact = false }: { text: string; label?: string; className?: string; slowFirst?: boolean; followAlong?: boolean; preOnly?: boolean; onAvailability?: (natural: boolean) => void; sequence?: ListenSpeed[]; onFinish?: () => void; compact?: boolean }) {
  const t = useT();
  const spoken = useMemo(() => normalizeSpeech(text), [text]);
  const words = useMemo(() => speechWords(spoken), [spoken]);
  const chunks = useMemo(() => chunkWords(words, 220), [words]);

  const [canSpeak, setCanSpeak] = useState(false);
  const [pre, setPre] = useState<PreSet | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const [speed, setSpeed] = useState<ListenSpeed>("normal");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [mode, setMode] = useState<"audio" | "speech" | null>(null);
  const [round, setRound] = useState<{ n: number; of: number } | null>(null);

  const audio = useRef<HTMLAudioElement | null>(null);
  const preRef = useRef(pre); preRef.current = pre;
  const speedRef = useRef(speed); speedRef.current = speed;
  const voiceRef = useRef(voiceName); voiceRef.current = voiceName;
  const stopped = useRef(true);
  const gen = useRef(0); // each start/stop of the device voice: late events of an older reading are ignored
  const chunkAt = useRef(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const panel = useRef<HTMLSpanElement | null>(null);
  const curEl = useRef<HTMLSpanElement | null>(null);
  const queue = useRef<ListenSpeed[]>([]);   // speeds still to play in this tap (sequence)
  const asked = useRef(new Set<ListenSpeed>()); // natural audio already requested for this text
  const alive = useRef(true);
  const onFinishRef = useRef(onFinish); onFinishRef.current = onFinish;
  const onAvailRef = useRef(onAvailability); onAvailRef.current = onAvailability;

  // device support, saved speed and voice, the list of voices (it loads late in some browsers)
  useEffect(() => {
    alive.current = true;
    const ok = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
    setCanSpeak(ok);
    try {
      const s = window.localStorage.getItem("listen.speed");
      setSpeed(s === "slow" || s === "normal" ? s : slowFirst ? "slow" : "normal");
      setVoiceName(window.localStorage.getItem("listen.voice"));
    } catch { if (slowFirst) setSpeed("slow"); }
    if (!ok) return () => { alive.current = false; };
    const load = () => setVoices(rankVoices(window.speechSynthesis.getVoices()));
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => { alive.current = false; window.speechSynthesis.removeEventListener?.("voiceschanged", load); };
  }, [slowFirst]);

  const clearTimers = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    if (timer.current) clearInterval(timer.current);
    raf.current = null; timer.current = null;
  };

  const stop = useCallback(() => {
    stopped.current = true; gen.current++; queue.current = [];
    clearTimers();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const a = audio.current;
    if (a) { a.onended = null; a.pause(); try { a.currentTime = 0; } catch { /* not loaded */ } }
    setPlaying(false); setCur(-1); setMode(null); setRound(null);
  }, []);

  // natural audio for this text? (asked once per text; nothing but the text's hash is sent)
  useEffect(() => {
    stop();
    setPre(null); asked.current = new Set();
    onAvailRef.current?.(false);
    if (!spoken) return;
    let live = true;
    (async () => {
      try {
        const key = await speechKey(spoken);
        if (!key || !live) return;
        const r = await fetch(`/api/tts/${key}?meta=1`, { credentials: "same-origin" });
        if (!r.ok || !live) return;
        const j = (await r.json()) as PreAudio & { found?: boolean; speed?: ListenSpeed; slow?: PreAudio | null };
        if (!j.found || !live) return;
        const main: PreAudio = { audioUrl: j.audioUrl, durationMs: j.durationMs, timings: j.timings };
        setPre(j.speed === "slow" ? { normal: null, slow: main } : { normal: main, slow: j.slow ?? null });
        onAvailRef.current?.(true);
        // ⚡ ready before the tap: only the file's header is fetched now (light), so playing starts at once
        try { if (!audio.current) { const a = new Audio(); a.preload = "metadata"; a.src = main.audioUrl; audio.current = a; } } catch { /* no audio element */ }
      } catch { /* no natural audio yet: the device's voice is used */ }
    })();
    return () => { live = false; stop(); };
  }, [spoken, stop]);

  /** Asks the server to make the natural voice for next time (in the background; the device voice reads now). */
  const requestNatural = useCallback((sp: ListenSpeed) => {
    if (preOnly || !spoken || asked.current.has(sp)) return;
    asked.current.add(sp);
    void (async () => {
      try {
        const r = await fetch("/api/tts", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: spoken, speed: sp }) });
        if (r.status !== 200 || !alive.current) return;
        const j = (await r.json()) as PreAudio & { found?: boolean };
        if (!j.found) return;
        setPre((p) => ({ ...(p ?? { normal: null, slow: null }), [sp]: { audioUrl: j.audioUrl, durationMs: j.durationMs, timings: j.timings } }));
        onAvailRef.current?.(true);
      } catch { /* busy or offline: the device voice keeps reading */ }
    })();
  }, [preOnly, spoken]);

  // keep the highlighted word visible inside the follow-along box
  useEffect(() => {
    const c = panel.current, el = curEl.current;
    if (!c || !el) return;
    if (el.offsetTop < c.scrollTop || el.offsetTop + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = Math.max(0, el.offsetTop - c.clientHeight / 3);
  }, [cur]);

  // one reading finished: the next speed of the sequence, or the end
  const finishedRef = useRef<() => void>(() => {});
  finishedRef.current = () => {
    if (queue.current.length) { playNext(); return; }
    stop();
    onFinishRef.current?.();
  };

  const speakFrom = useCallback((k: number, g: number) => {
    const synth = window.speechSynthesis;
    clearTimers();
    if (stopped.current || g !== gen.current) return;
    if (k >= chunks.length) { finishedRef.current(); return; }
    chunkAt.current = k;
    const [a, b] = chunks[k];
    const part = words.slice(a, b);
    let pos = 0;
    const local = part.map((w) => { const x = { text: w.text, start: pos, end: pos + w.text.length }; pos += w.text.length + 1; return x; });
    const u = new SpeechSynthesisUtterance(local.map((w) => w.text).join(" "));
    u.lang = "en-US";
    u.rate = SPEECH_RATE[speedRef.current];
    const v = pickBestVoice(synth.getVoices(), voiceRef.current);
    if (v) u.voice = v;
    let boundary = false;
    u.onboundary = (e) => {
      if (g !== gen.current || (e.name && e.name !== "word")) return;
      boundary = true;
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      setCur(a + wordAtChar(local, e.charIndex));
    };
    u.onstart = () => {
      if (g !== gen.current) return;
      setCur(a);
      // some voices (e.g. Chrome's online voices) send no word events: follow an estimate instead
      const t0 = Date.now();
      const est = estimateWordTimes(part, (pos / (14 * u.rate)) * 1000);
      setTimeout(() => {
        if (boundary || stopped.current || g !== gen.current || chunkAt.current !== k) return;
        timer.current = setInterval(() => setCur(a + Math.max(0, wordAt(est, Date.now() - t0))), 120);
      }, 700);
    };
    u.onend = () => { if (g === gen.current && chunkAt.current === k) speakFrom(k + 1, g); };
    u.onerror = (e) => { if (g === gen.current && e.error !== "interrupted" && e.error !== "canceled") { stopped.current = true; clearTimers(); setPlaying(false); setCur(-1); setMode(null); setRound(null); } };
    synth.speak(u);
  }, [chunks, words]);

  const startSpeech = useCallback((fromChunk = 0) => {
    if (!canSpeak) { stop(); return; }
    window.speechSynthesis.cancel();
    stopped.current = false;
    const g = ++gen.current;
    setMode("speech"); setPlaying(true);
    speakFrom(fromChunk, g);
  }, [canSpeak, speakFrom, stop]);

  /** Plays one recording from the start (or from a share of its length when the speed changes mid-way). */
  const playAudio = (pick: { audio: PreAudio; rate: number }, from = 0) => {
    const a = audio.current ?? (audio.current = new Audio());
    a.preload = "auto";
    const url = new URL(pick.audio.audioUrl, window.location.href).href;
    if (a.src !== url) a.src = pick.audio.audioUrl;
    stopped.current = false;
    setMode("audio"); setPlaying(true);
    const starts = pick.audio.timings.words;
    const rate = () => { a.playbackRate = pick.rate; };
    a.onloadedmetadata = () => { rate(); if (from > 0 && Number.isFinite(a.duration)) { try { a.currentTime = from * a.duration; } catch { /* not seekable yet */ } } };
    a.onplay = rate;
    a.onended = () => { if (!stopped.current) finishedRef.current(); };
    const tick = () => {
      if (stopped.current) return;
      setCur(Math.max(0, wordAt(starts, a.currentTime * 1000)));
      raf.current = requestAnimationFrame(tick);
    };
    clearTimers();
    try { a.currentTime = from > 0 && Number.isFinite(a.duration) ? from * a.duration : 0; } catch { /* not loaded yet */ }
    rate();
    // play() must be called right here, inside the tap (iPhone/iPad Safari)
    a.play().then(() => { raf.current = requestAnimationFrame(tick); }).catch(() => { if (!stopped.current) { setPre(null); startSpeech(0); } });
  };

  /** The next reading of this tap: natural audio when it exists, else the device voice (and the natural one is requested). */
  function playNext() {
    const sp = queue.current.shift() ?? speedRef.current;
    if (sequence?.length) { setSpeed(sp); speedRef.current = sp; setRound({ n: sequence.length - queue.current.length, of: sequence.length }); }
    const pick = audioForSpeed(preRef.current, sp);
    if (!pick || !pick.own) requestNatural(sp);
    if (pick) { playAudio(pick); return; }
    if (!canSpeak) { stop(); return; }
    startSpeech(0);
  }

  const play = () => {
    if (playing) { stop(); return; }
    queue.current = sequence?.length ? [...sequence] : [speedRef.current];
    playNext();
  };

  const changeSpeed = (s: ListenSpeed) => {
    setSpeed(s); speedRef.current = s;
    try { window.localStorage.setItem("listen.speed", s); } catch { /* storage blocked */ }
    if (!playing) return;
    const a = audio.current;
    if (mode === "audio" && a) {
      const pick = audioForSpeed(preRef.current, s);
      if (!pick) return;
      if (new URL(pick.audio.audioUrl, window.location.href).href === a.src) { a.playbackRate = pick.rate; return; }
      const share = Number.isFinite(a.duration) && a.duration > 0 ? a.currentTime / a.duration : 0;
      a.pause(); playAudio(pick, share);
    }
    if (mode === "speech") { const k = chunkAt.current; gen.current++; window.speechSynthesis.cancel(); setTimeout(() => startSpeech(k), 60); }
  };

  const changeVoice = (name: string) => {
    setVoiceName(name); voiceRef.current = name;
    try { window.localStorage.setItem("listen.voice", name); } catch { /* storage blocked */ }
    if (playing && mode === "speech") { const k = chunkAt.current; gen.current++; window.speechSynthesis.cancel(); setTimeout(() => startSpeech(k), 60); }
  };

  const hasPre = Boolean(pre?.normal || pre?.slow);
  if (!spoken || (!canSpeak && !hasPre) || (preOnly && !hasPre)) return null;
  const chosen = pickBestVoice(voices, voiceName);
  const btn = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-base font-semibold ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal";
  if (compact) {
    return (
      <button type="button" onClick={play} aria-pressed={playing} aria-label={playing ? t("Stop") : t(label)} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal print:hidden ${playing ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal"} ${className}`}>
        <span aria-hidden="true">{playing ? "⏹" : "🔊"}</span>
      </button>
    );
  }
  return (
    <span className={`inline-flex max-w-full flex-col gap-2 print:hidden ${className}`}>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={play} aria-pressed={playing} className={`${btn} ${playing ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal"}`}>
          <span aria-hidden="true">{playing ? "⏹" : "🔊"}</span>{playing ? t("Stop") : t(label)}
        </button>
        {!sequence?.length && (
          <span role="group" aria-label={t("Reading speed")} className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
            {(["slow", "normal"] as const).map((s) => (
              <button key={s} type="button" onClick={() => changeSpeed(s)} aria-pressed={speed === s} className={`min-h-[44px] min-w-[44px] rounded-full px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${speed === s ? "bg-white text-brand-navy shadow-sm ring-1 ring-slate-300" : "text-slate-600 hover:text-brand-navy"}`}>
                <span aria-hidden="true">{s === "slow" ? "🐢 " : "🐇 "}</span>{s === "slow" ? t("Slow") : t("Normal")}
              </button>
            ))}
          </span>
        )}
        {round && <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-900">{t("Reading {n} of {m}", { n: round.n, m: round.of })} · {speed === "slow" ? t("Slow") : t("Normal")}</span>}
      </span>
      {playing && followAlong && (
        <span className="block w-full max-w-prose rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">{t("Follow along")}</span>
          <span ref={panel} data-content lang="en" dir="ltr" className="relative mt-1 block max-h-56 overflow-y-auto text-lg leading-relaxed text-slate-800" aria-hidden="true">
            {words.map((w, i) => (
              <span key={i}>
                <span ref={i === cur ? curEl : undefined} className={i === cur ? "rounded bg-amber-200 px-0.5 text-slate-950" : undefined}>{w.text}</span>{" "}
              </span>
            ))}
          </span>
          {mode === "speech" && voices.length > 1 && (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {t("Voice")}
              <select value={chosen?.name ?? ""} onChange={(e) => changeVoice(e.target.value)} className="min-h-[44px] max-w-full rounded-xl bg-white px-2 text-sm ring-1 ring-slate-300">
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </label>
          )}
        </span>
      )}
    </span>
  );
}
