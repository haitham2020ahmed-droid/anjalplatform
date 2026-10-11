"use client";
/**
 * 🔊 Answer sounds, synthesized with WebAudio through the games' sound kit (no files to download; the same mute switch).
 * chime = a short pleasant ding (right) · soft = a gentle low tone, never harsh (wrong) · tick = a neutral "answer
 * saved" (tests) · celebrate = a little rising tune (end of a practice).
 */
import { playTones } from "@/games/kit/sound";
import type { FxSound } from "./phrases";

const FX: Record<FxSound, { wave: OscillatorType; notes: [number, number, number][]; gain: number }> = {
  chime: { wave: "sine", notes: [[784, 0, 0.14], [1175, 0.09, 0.26]], gain: 0.16 },
  soft: { wave: "sine", notes: [[330, 0, 0.2], [262, 0.15, 0.32]], gain: 0.07 },
  tick: { wave: "sine", notes: [[880, 0, 0.05]], gain: 0.05 },
  celebrate: { wave: "triangle", notes: [[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.12], [1047, 0.33, 0.32]], gain: 0.15 },
};

export function playFx(name: FxSound): void {
  try { const f = FX[name]; playTones(f.wave, f.notes, f.gain); } catch { /* no sound: fine */ }
}

/** Tests: a neutral tick when an answer is saved (no right / wrong). */
export function answerSavedFx(): void { playFx("tick"); }
