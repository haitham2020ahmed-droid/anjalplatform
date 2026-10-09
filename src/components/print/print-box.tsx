"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BOX_EVENT, readBox, writeBox, type BoxItem } from "./print-box-store";

/** 🖨 The print box in the header (next to the bell): its questions, print as they are or in 3 levels. */
export function PrintBox() {
  const [items, setItems] = useState<BoxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const sync = () => setItems(readBox());
    sync();
    window.addEventListener(BOX_EVENT, sync); window.addEventListener("storage", sync);
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out);
    return () => { window.removeEventListener(BOX_EVENT, sync); window.removeEventListener("storage", sync); document.removeEventListener("mousedown", out); };
  }, []);
  const go = (levels: boolean) => {
    const q = new URLSearchParams({ ids: items.map((x) => x.id).join(","), title: title || "Worksheet", ...(levels ? { levels: "3" } : {}) });
    setOpen(false);
    router.push(`/teacher/worksheet?${q}`);
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Print box: ${items.length} question(s)`} className="relative inline-flex items-center rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-brand-navy">
        <span aria-hidden="true" className="text-lg leading-none">🖨</span>
        {items.length > 0 && <span className="absolute -end-1 -top-1 min-w-[1.25rem] rounded-full bg-brand-teal px-1 text-center text-xs font-bold text-white">{items.length}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Print box" className="animate-fade-up absolute end-0 top-10 z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-2xl bg-white p-4 text-sm shadow-2xl ring-1 ring-slate-200">
          <div className="flex items-center justify-between"><p className="text-base font-bold text-brand-navy">🖨 Print box · {items.length}</p>{items.length > 0 && <button type="button" onClick={() => writeBox([])} className="text-xs font-semibold text-slate-500 underline">Empty</button>}</div>
          {!items.length ? <p className="mt-2 text-slate-600">Press <b>🖨 +</b> next to any question (Question Bank, Preview, Worksheets) to collect questions here, then print them — as they are or in 3 levels.</p> : (
            <>
              <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto">{items.map((x, i) => <li key={x.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1"><span className="text-slate-400">{i + 1}.</span><span className="line-clamp-2 flex-1">{x.stem}</span><button type="button" onClick={() => writeBox(items.filter((y) => y.id !== x.id))} aria-label="Remove" className="text-red-600">✕</button></li>)}</ol>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Worksheet title (optional)" maxLength={120} className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
              <div className="mt-3 grid gap-2">
                <button type="button" onClick={() => go(false)} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">🖨 Print these questions</button>
                <button type="button" onClick={() => go(true)} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">🎚 Print in 3 levels (easy · medium · hard)</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">3 levels: the same skills, one sheet per level, each with its answer key. Students see only ● ●● ●●●.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
