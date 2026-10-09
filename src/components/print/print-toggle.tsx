"use client";
import { useEffect, useState } from "react";
import { BOX_EVENT, BOX_MAX, readBox, toggleBox } from "./print-box-store";

/** 🖨 Put a question in the print box (or take it out). */
export function PrintToggle({ id, stem, className = "" }: { id: string; stem: string; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readBox().some((x) => x.id === id));
    sync();
    window.addEventListener(BOX_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(BOX_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [id]);
  return (
    <button type="button" onClick={() => { const n = toggleBox({ id, stem }); if (!on && n.length >= BOX_MAX && !n.some((x) => x.id === id)) alert(`The print box holds ${BOX_MAX} questions.`); }}
      aria-pressed={on} aria-label={on ? "Remove from the print box" : "Add to the print box"} title={on ? "In the print box" : "Add to the print box"}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ring-1 transition active:scale-95 print:hidden ${on ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-slate-300 hover:ring-brand-teal"} ${className}`}>
      🖨 {on ? "✓" : "+"}
    </button>
  );
}
