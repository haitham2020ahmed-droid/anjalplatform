"use client";
import { useEffect, useState } from "react";

/**
 * 🔊 Listen: reads a text aloud with the browser's own voice (free, no download) — reading support for
 * struggling readers. Slightly slow for Grades 4–6; press again to stop. Hidden where speech is unsupported.
 */
export function ListenButton({ text, label = "Listen", className = "" }: { text: string; label?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOk(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  // a new question / text: stop reading the previous one
  useEffect(() => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); setOn(false); }, [text]);
  if (!ok) return null;
  const toggle = () => {
    const synth = window.speechSynthesis;
    if (on) { synth.cancel(); setOn(false); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/_{3,}/g, " blank "));
    u.lang = "en-US"; u.rate = 0.9;
    const voice = synth.getVoices().find((v) => /en[-_]US/i.test(v.lang) && /natural|samantha|google|aria|jenny/i.test(v.name)) ?? synth.getVoices().find((v) => /^en/i.test(v.lang));
    if (voice) u.voice = voice;
    u.onend = () => setOn(false); u.onerror = () => setOn(false);
    synth.speak(u); setOn(true);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 transition ${on ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal"} ${className}`}>
      <span aria-hidden="true">{on ? "⏹" : "🔊"}</span>{on ? "Stop" : label}
    </button>
  );
}
