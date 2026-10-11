"use client";
import { useEffect, useRef, useState } from "react";
import { lookupWordAction } from "@/app/learn-actions";
import type { WordView } from "@/server/student/words";
import { bestBrowserVoice } from "@/lib/tts/voices";

const NO_MEANING = "Look at the sentence for clues. Ask your teacher.";
const BLOCK = "p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, blockquote, dd, dt, article";
const SKIP = "button, a, input, textarea, select, label, summary, [role=button], [data-nolookup]";

/** The sentence around the tapped word (from its paragraph), so names and meanings fit the passage. */
function sentenceOf(node: Node | null, word: string): string {
  const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
  const text = (el?.closest(BLOCK)?.textContent ?? el?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const parts = text.split(/(?<=[.!?])\s+/);
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (parts.find((p) => new RegExp(`(^|[^A-Za-z])${esc}([^A-Za-z]|$)`).test(p)) ?? parts.find((p) => p.toLowerCase().includes(word.toLowerCase())) ?? "").slice(0, 400);
}

/** The word under a tap (inside a passage marked data-wordtap). */
function wordAtPoint(x: number, y: number): { word: string; node: Node } | null {
  const d = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null, off = 0;
  if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  else if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  if (!node || node.nodeType !== 3) return null;
  const t = node.textContent ?? "";
  const isW = (c: string | undefined) => Boolean(c) && /[A-Za-z'’-]/.test(c!);
  let a = off, b = off;
  while (a > 0 && isW(t[a - 1])) a--;
  while (b < t.length && isW(t[b])) b++;
  const word = t.slice(a, b).replace(/^['’-]+|['’-]+$/g, "");
  return /[A-Za-z]/.test(word) && word.length <= 40 ? { word, node } : null;
}

/**
 * 📖 Double-click (or select) any word inside — or tap a word in a passage — to see its meaning in English: part of
 * speech, pronunciation, synonyms, antonyms and an example. The word goes into the student's notebook.
 */
export function WordLookup({ children, hint = true }: { children: React.ReactNode; hint?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef<{ w: string; at: number }>({ w: "", at: 0 });
  const [w, setW] = useState<WordView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  async function show(text: string, node: Node | null, rect: { left: number; bottom: number }) {
    if (text.toLowerCase() === last.current.w && Date.now() - last.current.at < 1200) return;
    last.current = { w: text.toLowerCase(), at: Date.now() };
    setPos({ x: Math.max(8, Math.min(rect.left, window.innerWidth - 336)), y: rect.bottom + 8 });
    setBusy(text); setError(null); setW(null);
    const res = await lookupWordAction(text, sentenceOf(node, text)).catch(() => null);
    setBusy(null);
    if (res && res.ok) setW(res.value); else setError(res ? res.error : NO_MEANING);
  }
  async function pick() {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    const text = sel?.toString().trim() ?? "";
    if (!text || text.length > 40 || /\s/.test(text) || !/[a-z]/i.test(text)) return;
    if (!sel || !sel.rangeCount || !box.current?.contains(sel.anchorNode)) return;
    await show(text, sel.anchorNode, sel.getRangeAt(0).getBoundingClientRect());
  }
  function tap(e: React.MouseEvent) {
    const target = e.target as Element | null;
    if (!target?.closest("[data-wordtap]") || target.closest(SKIP)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const hit = wordAtPoint(e.clientX, e.clientY);
    if (!hit || !box.current?.contains(hit.node)) return;
    void show(hit.word, hit.node, { left: e.clientX - 20, bottom: e.clientY + 12 });
  }
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setW(null); setError(null); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const say = () => {
    if (!w) return;
    if (w.audioUrl) { void new Audio(w.audioUrl).play().catch(() => undefined); return; }
    try { const u = new SpeechSynthesisUtterance(w.word); u.lang = "en-US"; const v = bestBrowserVoice(); if (v) u.voice = v; window.speechSynthesis.speak(u); } catch { /* no speech */ }
  };
  const open = Boolean(w || busy || error);
  return (
    <div ref={box} onClick={tap} onDoubleClick={() => void pick()} onMouseUp={() => void pick()} onTouchEnd={() => setTimeout(() => void pick(), 50)}>
      {hint && <p className="mb-2 text-xs text-slate-500 print:hidden">📖 Tap or double-click any word to see its meaning.</p>}
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
          {error && <p className="mt-2 text-slate-700">{error}</p>}
          {w?.formOf && <p className="mt-1 text-sm text-slate-600">“{w.formOf}” is a form of “{w.word}”.</p>}
          {w && !w.meanings.length && <p className="mt-2 text-slate-700">💡 {w.help || NO_MEANING}</p>}
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
          {w && w.meanings.length > 0 && <p className="mt-2 text-xs text-slate-400">{w.source === "SCHOOL" ? "Definition from your school." : w.source === "NAME" ? "Names start with a capital letter." : w.source === "AI" ? "Simple definition written for you. Saved in your word notebook." : "Saved in your word notebook."}</p>}
        </div>
      )}
    </div>
  );
}
