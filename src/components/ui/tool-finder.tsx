"use client";
import { useEffect, useRef, useState } from "react";

/** 🔎 Type to find a tool: hides the cards (data-tool="…words…") that do not match. “/” focuses the box. */
export function ToolFinder({ placeholder = "Find a tool… (press /)" }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    document.querySelectorAll<HTMLElement>("[data-tool]").forEach((el) => {
      const ok = words.every((w) => (el.dataset.tool ?? "").toLowerCase().includes(w));
      el.hidden = !ok; if (ok) shown++;
    });
    document.querySelectorAll<HTMLElement>("[data-tool-group]").forEach((g) => { g.hidden = !g.querySelector("[data-tool]:not([hidden])"); });
    const none = document.getElementById("tool-none"); if (none) none.hidden = shown > 0;
  }, [q]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-4 grid place-items-center text-lg text-slate-400">🔎</span>
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Find a tool" className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 ps-12 pe-4 text-base shadow-sm focus:border-brand-teal focus:outline-none focus:ring-4 focus:ring-brand-teal/20" />
      <p id="tool-none" hidden className="mt-3 text-center text-slate-500">No tool matches “{q}”.</p>
    </div>
  );
}
