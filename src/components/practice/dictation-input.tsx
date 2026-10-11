/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/**
 * ✍️ DICTATION: the browser says the word (and a sentence that uses it), the student types the spelling.
 * Replay and a slower replay are always available. Speech is the browser's own (works offline).
 */
import { useEffect, useState } from "react";
import { decodeSpeech } from "../../server/word-study/speech-code";
import { canSpeak, speakTexts, stopSpeaking } from "./speak";

export function DictationInput({ questionId, say, hasSentence, value, onChange, disabled }: { questionId: string; say: string; hasSentence: boolean; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [ok, setOk] = useState(true);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setOk(canSpeak()); return () => stopSpeaking(); }, []);
  // a new word: stop the old one
  useEffect(() => { stopSpeaking(); setPlaying(false); }, [questionId]);
  const play = (mode: "word" | "sentence" | "slow") => {
    const d = decodeSpeech<{ w: string; s: string | null }>(say, questionId);
    if (!d?.w) return;
    const texts = mode === "sentence" && d.s ? [d.w, d.s, d.w] : [d.w];
    if (speakTexts(texts, { slow: mode === "slow", onEnd: () => setPlaying(false) })) setPlaying(true);
  };
  const btn = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-base font-semibold ring-1 transition disabled:opacity-60";
  return (
    <div className="space-y-4">
      {ok ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Listen to the word">
          <button type="button" onClick={() => play(hasSentence ? "sentence" : "word")} disabled={disabled} className={`${btn} ${playing ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal"}`}>
            <span aria-hidden="true">🔊</span>{hasSentence ? "Hear the word in a sentence" : "Hear the word"}
          </button>
          <button type="button" onClick={() => play("word")} disabled={disabled} className={`${btn} bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal`}><span aria-hidden="true">🔁</span>Replay the word</button>
          <button type="button" onClick={() => play("slow")} disabled={disabled} className={`${btn} bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal`}><span aria-hidden="true">🐢</span>Slower</button>
        </div>
      ) : (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">This browser cannot speak words aloud. Please ask your teacher to read the word to you, or try another browser.</p>
      )}
      <label className="block text-lg">
        <span className="text-slate-700">Type the word you hear:</span>
        <input disabled={disabled} value={value} maxLength={60} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} dir="ltr" lang="en"
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-lg border-2 border-brand-teal px-3 py-2 text-2xl font-semibold tracking-wide text-brand-navy" />
      </label>
    </div>
  );
}
