"use client";
import { useState } from "react";

/** Arabic meaning, hidden until the student taps (English first; Arabic only as a help). */
export function GlossButton({ gloss }: { gloss: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <p className="mt-1 flex items-center gap-2 text-sm">
      <span dir="rtl" lang="ar" className="rounded-lg bg-amber-50 px-2 py-0.5 text-base text-amber-950 ring-1 ring-amber-200">{gloss}</span>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">Hide</button>
    </p>
  ) : (
    <button type="button" onClick={() => setOpen(true)} aria-label="Show Arabic meaning" className="mt-1 rounded-lg px-2 py-0.5 text-xs font-semibold text-brand-teal ring-1 ring-slate-200 hover:bg-slate-50">Show Arabic meaning</button>
  );
}
