"use client";
import { useState } from "react";

/** A text box that counts words as the student writes. */
export function WordCounter({ name, defaultValue, min, disabled }: { name: string; defaultValue: string; min: number | null; disabled?: boolean }) {
  const [v, setV] = useState(defaultValue);
  const n = v.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <textarea name={name} value={v} onChange={(e) => setV(e.target.value)} disabled={disabled} rows={12} maxLength={20000} spellCheck className="w-full rounded-2xl border border-slate-300 bg-white p-4 text-lg leading-relaxed" placeholder="Write here…" />
      <p className={`mt-1 text-sm font-semibold ${min && n < min ? "text-amber-700" : "text-emerald-700"}`}>{n} word{n === 1 ? "" : "s"}{min ? ` · at least ${min}` : ""}</p>
    </div>
  );
}
