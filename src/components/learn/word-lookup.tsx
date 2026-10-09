"use client";
import { useEffect, useRef, useState } from "react";
import { lookupWordAction } from "@/app/learn-actions";
import type { WordView } from "@/server/student/words";

/**
 * 📖 Double-click (or select) any word inside to see its meaning in English: part of speech, pronunciation,
 * synonyms, antonyms and an example. The word goes into the student's notebook.
 */
export function WordLookup({ children, hint = true }: { children: React.ReactNode; hint?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<WordView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  async function pick() {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    const text = sel?.toString().trim() ?? "";
    if (!text || text.length > 40 || /\s/.test(text) || !/[a-z]/i.test(text)) return;
    if (!sel || !sel.rangeCount || !box.current?.contains(sel.anchorNode)) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 336)), y: r.bottom + 8 });
    setBusy(text); setError(null); setW(null);
    const res = await lookupWordAction(text);
    setBusy(null);
    if (res.ok) setW(res.value); else setError(res.error);
  }
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setW(null); setError(null); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const say = () => {
    if (!w) return;
    if (w.audioUrl) { void new Audio(w.audioUrl).play().catch(() => undefined); return; }
    try { const u = new SpeechSynthesisUtterance(w.word); u.lang = "en-US"; window.speechSynthesis.speak(u); } catch { /* no speech */ }
  };
  const open = Boolean(w || busy || error);
  return (
    <div ref={box} onDoubleClick={() => void pick()} onMouseUp={() => void pick()} onTouchEnd={() => setTimeout(() => void pick(), 50)}>
      {hint && <p className="mb-2 text-xs text-slate-500 print:hidden">📖 Double-click any word to see its meaning.</p>}
      {children}
      {open && (
        <div role="dialog" aria-label="Word meaning" style={{ left: pos.x, top: pos.y }} className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-2xl bg-white p-4 text-left shadow-xl ring-1 ring-slate-300">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xl font-bold text-brand-navy">{w?.word ?? busy ?? ""} {w?.phonetic && <span className="text-sm font-normal text-slate-500">{w.phonetic}</span>}</p>
            <div className="flex gap-1">
              {w && <button type="button" onClick={say} aria-label="Say the word" className="rounded-lg px-2 py-1 ring-1 ring-slate-200 hover:bg-slate-50">🔊</button>}
              <button type="button" onClick={() => { setW(null); setError(null); setBusy(null); }} aria-label="Close" className="rounded-lg px-2 py-1 ring-1 ring-slate-200 hover:bg-slate-50">✕</button>
            </div>
          </div>
          {busy && <p className="mt-2 text-slate-500">Looking it up…</p>}
          {error && <p className="mt-2 text-red-700">{error}</p>}
          {w && !w.meanings.length && <p className="mt-2 text-slate-600">No meaning found for this word. Ask your teacher.</p>}
          {w?.isVocab && <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">⭐ Unit vocabulary word</p>}
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {w?.meanings.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold italic text-slate-700">{m.partOfSpeech}</span>
                <p className="mt-1 text-slate-900">{m.definition}</p>
                {m.example && <p className="text-slate-600">“{m.example}”</p>}
                {m.synonyms.length > 0 && <p className="text-emerald-800"><b>Synonyms:</b> {m.synonyms.join(", ")}</p>}
                {m.antonyms.length > 0 && <p className="text-red-800"><b>Antonyms:</b> {m.antonyms.join(", ")}</p>}
              </li>
            ))}
          </ul>
          {w && <p className="mt-2 text-xs text-slate-400">{w.source === "SCHOOL" ? "Definition from your school." : "Saved in your word notebook."}</p>}
        </div>
      )}
    </div>
  );
}
