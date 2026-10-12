/**
 * 🎙 Fluency Coach capture and scoring robustness (pure functions; no real audio, no real AI, no real database):
 *   - a soft voice with natural pauses passes the voice check and is made louder; silence and hum do not (never sent)
 *   - 48 kHz stereo → 16 kHz mono WAV with a valid header
 *   - the AI reply: self-corrections / repetitions / pauses are never errors, error-kind aliases are accepted,
 *     lastWordIndex one past the end is clamped, and "-1 although words were heard" is caught for a second try
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkVoice, encodeWav, gainFor, mixToMono, prepareReading, resample, WAV_RATE } from "../src/components/fluency/audio-wav";
import { heardButNoWords, validateMarks } from "../src/server/fluency/coach";

const tone = (sec: number, rate: number, amp: number, pausesEvery = 0) => {
  const out = new Float32Array(Math.round(sec * rate));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const paused = pausesEvery > 0 && Math.floor(t / pausesEvery) % 2 === 1;   // reading, pause, reading, …
    out[i] = paused ? 0.0004 * Math.sin(i) : amp * Math.sin(2 * Math.PI * 220 * t);
  }
  return out;
};

describe("Fluency Coach audio on the device", () => {
  test("a soft voice with long pauses is a voice; it is made louder", () => {
    const soft = tone(8, 16000, 0.02, 1.5);
    const c = checkVoice(soft, 16000);
    assert.equal(c.verdict, "voice");
    assert.ok(gainFor(soft) > 10, "a quiet reader is brought up");
  });
  test("silence and a steady low hum are 'silent'; under a second is 'short'", () => {
    assert.equal(checkVoice(new Float32Array(16000 * 5), 16000).verdict, "silent");
    assert.equal(checkVoice(tone(5, 16000, 0.001), 16000).verdict, "silent");
    assert.equal(checkVoice(tone(0.5, 16000, 0.3), 16000).verdict, "short");
    assert.equal(prepareReading([new Float32Array(48000 * 4)], 48000).wav, null, "silence is never sent");
  });
  test("48 kHz stereo → 16 kHz mono 16-bit WAV", () => {
    const l = tone(2, 48000, 0.3), r = tone(2, 48000, 0.3);
    const mono = mixToMono([l, r]);
    assert.equal(mono.length, l.length);
    const down = resample(mono, 48000);
    assert.equal(down.length, 32000);
    const p = prepareReading([l, r], 48000);
    assert.ok(p.wav);
    const v = new DataView(p.wav!.buffer);
    assert.equal(String.fromCharCode(...p.wav!.slice(0, 4)), "RIFF");
    assert.equal(v.getUint32(24, true), WAV_RATE);
    assert.equal(v.getUint16(22, true), 1, "one channel");
    assert.equal(p.wav!.length, 44 + 32000 * 2);
    assert.equal(encodeWav(new Float32Array(10)).length, 64);
  });
});

describe("Fluency Coach: reading the AI's reply", () => {
  test("self-corrections, repetitions and pauses are not errors; aliases are accepted", () => {
    const v = validateMarks({ lastWordIndex: 9, errors: [{ i: 2, kind: "self-correction", heard: "x" }, { i: 3, kind: "REPETITION" }, { i: 4, kind: "omission" }, { i: 5, kind: "Substitution", heard: "cat" }] }, 10);
    assert.ok(v.ok);
    if (v.ok) assert.deepEqual(v.value.errors.map((e) => [e.i, e.kind]), [[4, "SKIPPED"], [5, "SUBSTITUTED"]]);
  });
  test("lastWordIndex one past the end is the last word; heardWords is kept", () => {
    const v = validateMarks({ lastWordIndex: 10, heardWords: 11, errors: [] }, 10);
    assert.ok(v.ok);
    if (v.ok) { assert.equal(v.value.lastWordIndex, 9); assert.equal(v.value.heardWords, 11); }
  });
  test("-1 although words were heard → caught (asked again), plain silence → not", () => {
    assert.equal(heardButNoWords({ lastWordIndex: -1, heardWords: 12, errors: [] }), true);
    assert.equal(heardButNoWords({ lastWordIndex: -1, heardWords: 0, errors: [], expression: null, prosody: null }), false);
  });
});
