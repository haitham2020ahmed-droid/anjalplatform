"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NavItem } from "./main-nav";

interface Hit { kind: "page" | "student" | "class" | "skill"; label: string; sub: string; href: string; icon: string }
const KIND_ICON = { student: "🧒", class: "👥", skill: "🧩" } as const;

/**
 * 🔎 Jump to anything: every page of the role, and (staff) students, classes and skills by name.
 * Ctrl / ⌘ + K opens it; ↑ ↓ choose, Enter opens.
 */
export function JumpTo({ items, people }: { items: NavItem[]; people: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[]>([]);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (open) { setQ(""); setRemote([]); setAt(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    if (!people || q.trim().length < 2) { setRemote([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: { kind: "student" | "class" | "skill"; label: string; sub: string; href: string }[] }) => setRemote(d.results.map((x) => ({ ...x, icon: KIND_ICON[x.kind] }))))
        .catch(() => { /* aborted or offline */ });
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, people]);

  const pages = useMemo<Hit[]>(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => `${i.label} ${i.group ?? ""}`.toLowerCase().includes(w))).slice(0, words.length ? 8 : 12)
      .map((i) => ({ kind: "page", label: i.label, sub: i.group ? `Page · ${i.group}` : "Page", href: i.href, icon: i.icon }));
  }, [q, items]);
  const hits = [...remote, ...pages];
  useEffect(() => { setAt(0); }, [q, remote.length]);
  const go = (h: Hit | undefined) => { if (!h) return; setOpen(false); router.push(h.href); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full max-w-md items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-start text-sm text-slate-500 ring-1 ring-transparent transition hover:bg-white hover:ring-slate-300" aria-label="Search">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
        <span className="flex-1 truncate"><span className="sm:hidden">Search</span><span className="hidden sm:inline">{people ? "Find a student, class, skill or page" : "Find a page"}</span></span>
        <kbd className="hidden rounded-md bg-white px-1.5 text-[11px] text-slate-500 ring-1 ring-slate-200 sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="animate-pop w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={people ? "Type a name, a class, a skill or a page…" : "Type a page…"} aria-label="Search" aria-controls="jump-results"
                onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); } if (e.key === "Enter") { e.preventDefault(); go(hits[at]); } }}
                className="!border-0 !bg-transparent w-full py-4 text-base !outline-none" />
              <kbd className="rounded-md bg-slate-100 px-1.5 text-[11px] text-slate-500">Esc</kbd>
            </div>
            <ul id="jump-results" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
              {hits.map((h, i) => (
                <li key={`${h.kind}${h.href}`} role="option" aria-selected={i === at}>
                  <button type="button" onMouseEnter={() => setAt(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start ${i === at ? "bg-brand-navy text-white" : "text-slate-800"}`}>
                    <span aria-hidden="true" className="w-6 text-center text-lg">{h.icon}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.label}</span><span className={`block truncate text-xs ${i === at ? "text-white/70" : "text-slate-500"}`}>{h.sub}</span></span>
                  </button>
                </li>
              ))}
              {!hits.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Nothing matches “{q}”.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
