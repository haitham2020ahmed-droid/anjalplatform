"use client";
/**
 * 🔊 Game sounds, synthesized with WebAudio (no sound files to download). Mute is remembered on this device.
 */
import { useCallback, useEffect, useState } from "react";
import type { SoundName } from "../types";

const KEY = "game-muted";
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    if (!ctx) ctx = new C();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** [frequency Hz, start s, length s] notes of each sound (short and soft). */
const NOTES: Record<SoundName, { wave: OscillatorType; notes: [number, number, number][]; gain: number }> = {
  correct: { wave: "triangle", notes: [[660, 0, 0.09], [880, 0.08, 0.14]], gain: 0.18 },
  wrong: { wave: "sawtooth", notes: [[220, 0, 0.12], [180, 0.1, 0.16]], gain: 0.08 },
  tick: { wave: "square", notes: [[1200, 0, 0.03]], gain: 0.04 },
  power: { wave: "sine", notes: [[520, 0, 0.07], [780, 0.06, 0.07], [1040, 0.12, 0.1]], gain: 0.15 },
  win: { wave: "triangle", notes: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3]], gain: 0.18 },
  start: { wave: "sine", notes: [[440, 0, 0.08], [660, 0.1, 0.12]], gain: 0.14 },
};

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function playSound(name: SoundName): void {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const spec = NOTES[name];
  const t0 = a.currentTime;
  for (const [f, start, len] of spec.notes) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = spec.wave; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(spec.gain, t0 + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
    o.connect(g).connect(a.destination);
    o.start(t0 + start); o.stop(t0 + start + len + 0.02);
  }
}

/** `const { muted, toggle } = useMute()` — the mute switch (remembered on this device). */
export function useMute(): { muted: boolean; toggle: () => void } {
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(isMuted()), []);
  const toggle = useCallback(() => {
    setMuted((m) => { const v = !m; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } return v; });
  }, []);
  return { muted, toggle };
}
