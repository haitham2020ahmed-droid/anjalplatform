"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chunkWords, estimateWordTimes, normalizeSpeech, speechKey, speechWords, wordAt, wordAtChar } from "@/lib/tts/text";
import { AUDIO_RATE, pickBestVoice, rankVoices, SPEECH_RATE, type ListenSpeed } from "@/lib/tts/voices";
import { useT } from "@/i18n/client";

interface PreAudio { audioUrl: string; durationMs: number; timings: { exact: boolean; words: number[] } }

/**
 * 🔊 Read-aloud player (UI reorg Phase 6), used everywhere a text can be listened to.
 *
 *  - Plays the PRE-GENERATED natural voice when the school made it (scripts/tts/pregenerate.ts), looked up by a hash
 *    of the text only; otherwise the most natural American English voice of the device (Edge "Natural", Chrome
 *    "Google US English", Apple enhanced voices), which the student can change.
 *  - Slow / Normal speed (remembered on this device; Slow first for students reading below level: `slowFirst`).
 *  - "Follow along": each word is highlighted as it is read (stored word timings, or the voice's word events, or
 *    an estimate when the voice gives none).
 *  - Big buttons (44 px), works with touch; starts only when the student taps (iPhone/iPad rules).
 *  - `preOnly`: shows only when the natural pre-generated audio exists (ReadRise keeps its own in-text device voice
 *    otherwise); `onAvailability` tells the page whether it does. Buttons are interface words (t()); the text read
 *    and the follow-along words are English content (never translated).
 */
export function ListenButton({ text, label = "Listen", className = "", slowFirst = false, followAlong = true, preOnly = false, onAvailability }: { text: string; label?: string; className?: string; slowFirst?: boolean; followAlong?: boolean; preOnly?: boolean; onAvailability?: (natural: boolean) => void }) {
  const t = useT();
  const spoken = useMemo(() => normalizeSpeech(text), [text]);
  const words = useMemo(() => speechWords(spoken), [spoken]);
  const chunks = useMemo(() => chunkWords(words, 220), [words]);

  const [canSpeak, setCanSpeak] = useState(false);
  const [pre, setPre] = useState<PreAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const [speed, setSpeed] = useState<ListenSpeed>("normal");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [mode, setMode] = useState<"audio" | "speech" | null>(null);

  const audio = useRef<HTMLAudioElement | null>(null);
  const speedRef = useRef(speed); speedRef.current = speed;
  const voiceRef = useRef(voiceName); voiceRef.current = voiceName;
  const stopped = useRef(true);
  const gen = useRef(0); // each start/stop of the device voice: late events of an older reading are ignored
  const chunkAt = useRef(0);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const panel = useRef<HTMLSpanElement | null>(null);
  const curEl = useRef<HTMLSpanElement | null>(null);

  // device support, saved speed and voice, the list of voices (it loads late in some browsers)
  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
    setCanSpeak(ok);
    try {
      const s = window.localStorage.getItem("listen.speed");
      setSpeed(s === "slow" || s === "normal" ? s : slowFirst ? "slow" : "normal");
      setVoiceName(window.localStorage.getItem("listen.voice"));
    } catch { if (slowFirst) setSpeed("slow"); }
    if (!ok) return;
    const load = () => setVoices(rankVoices(window.speechSynthesis.getVoices()));
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, [slowFirst]);

  const clearTimers = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    if (timer.current) clearInterval(timer.current);
    raf.current = null; timer.current = null;
  };

  const stop = useCallback(() => {
    stopped.current = true; gen.current++;
    clearTimers();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const a = audio.current;
    if (a) { a.pause(); try { a.currentTime = 0; } catch { /* not loaded */ } }
    setPlaying(false); setCur(-1); setMode(null);
  }, []);

  const onAvailRef = useRef(onAvailability); onAvailRef.current = onAvailability;
  // pre-generated audio for this text? (asked once per text; nothing but the text's hash is sent)
  useEffect(() => {
    stop();
    setPre(null); audio.current = null;
    onAvailRef.current?.(false);
    if (!spoken) return;
    let alive = true;
    (async () => {
      try {
        const key = await speechKey(spoken);
        if (!key || !alive) return;
        const r = await fetch(`/api/tts/${key}?meta=1`, { credentials: "same-origin" });
        if (!r.ok || !alive) return;
        const j = (await r.json()) as PreAudio & { found?: boolean };
        if (!j.found || !alive) return;
        const a = new Audio();
        a.preload = "none";
        a.src = j.audioUrl;
        audio.current = a;
        setPre(j);
        onAvailRef.current?.(true);
      } catch { /* no pre-generated audio: the device's voice is used */ }
    })();
    return () => { alive = false; stop(); };
  }, [spoken, stop]);

  // keep the highlighted word visible inside the follow-along box
  useEffect(() => {
    const c = panel.current, el = curEl.current;
    if (!c || !el) return;
    if (el.offsetTop < c.scrollTop || el.offsetTop + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = Math.max(0, el.offsetTop - c.clientHeight / 3);
  }, [cur]);

  const speakFrom = useCallback((k: number, g: number) => {
    const synth = window.speechSynthesis;
    clearTimers();
    if (stopped.current || g !== gen.current) return;
    if (k >= chunks.length) { stopped.current = true; setPlaying(false); setCur(-1); setMode(null); return; }
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
    u.onerror = (e) => { if (g === gen.current && e.error !== "interrupted" && e.error !== "canceled") { stopped.current = true; clearTimers(); setPlaying(false); setCur(-1); setMode(null); } };
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

  const play = () => {
    if (playing) { stop(); return; }
    const a = audio.current;
    if (pre && a) {
      stopped.current = false;
      setMode("audio"); setPlaying(true);
      const starts = pre.timings.words;
      const rate = () => { a.playbackRate = AUDIO_RATE[speedRef.current]; };
      a.onloadedmetadata = rate; a.onplay = rate;
      a.onended = () => stop();
      const tick = () => {
        if (stopped.current) return;
        setCur(Math.max(0, wordAt(starts, a.currentTime * 1000)));
        raf.current = requestAnimationFrame(tick);
      };
      try { a.currentTime = 0; } catch { /* not loaded yet */ }
      rate();
      // play() must be called right here, inside the tap (iPhone/iPad Safari)
      a.play().then(() => { raf.current = requestAnimationFrame(tick); }).catch(() => { if (!stopped.current) { setPre(null); audio.current = null; startSpeech(0); } });
      return;
    }
    startSpeech(0);
  };

  const changeSpeed = (s: ListenSpeed) => {
    setSpeed(s); speedRef.current = s;
    try { window.localStorage.setItem("listen.speed", s); } catch { /* storage blocked */ }
    if (!playing) return;
    if (mode === "audio" && audio.current) audio.current.playbackRate = AUDIO_RATE[s];
    if (mode === "speech") { const k = chunkAt.current; gen.current++; window.speechSynthesis.cancel(); setTimeout(() => startSpeech(k), 60); }
  };

  const changeVoice = (name: string) => {
    setVoiceName(name); voiceRef.current = name;
    try { window.localStorage.setItem("listen.voice", name); } catch { /* storage blocked */ }
    if (playing && mode === "speech") { const k = chunkAt.current; gen.current++; window.speechSynthesis.cancel(); setTimeout(() => startSpeech(k), 60); }
  };

  if (!spoken || (!canSpeak && !pre) || (preOnly && !pre)) return null;
  const chosen = pickBestVoice(voices, voiceName);
  const btn = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-base font-semibold ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal";
  return (
    <span className={`inline-flex max-w-full flex-col gap-2 print:hidden ${className}`}>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={play} aria-pressed={playing} className={`${btn} ${playing ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal"}`}>
          <span aria-hidden="true">{playing ? "⏹" : "🔊"}</span>{playing ? t("Stop") : t(label)}
        </button>
        <span role="group" aria-label={t("Reading speed")} className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
          {(["slow", "normal"] as const).map((s) => (
            <button key={s} type="button" onClick={() => changeSpeed(s)} aria-pressed={speed === s} className={`min-h-[44px] min-w-[44px] rounded-full px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${speed === s ? "bg-white text-brand-navy shadow-sm ring-1 ring-slate-300" : "text-slate-600 hover:text-brand-navy"}`}>
              <span aria-hidden="true">{s === "slow" ? "🐢 " : "🐇 "}</span>{s === "slow" ? t("Slow") : t("Normal")}
            </button>
          ))}
        </span>
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
