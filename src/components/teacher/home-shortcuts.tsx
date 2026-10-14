"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The Teacher Home's row of small shortcuts (icon + label, drawn by the page): one line that scrolls sideways when it
 * does not fit, with ‹ › buttons that appear only then. Mouse wheel, touch and keyboard (Tab) scroll it too.
 */
export function ShortcutRow({ label, prev, next, children }: { label: string; prev: string; next: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => {
      const max = el.scrollWidth - el.clientWidth;
      const at = Math.abs(el.scrollLeft); // RTL scrolls with negative values
      setEdge({ start: at <= 2, end: at >= max - 2 });
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, []);
  const go = (dir: 1 | -1) => {
    const el = box.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
  };
  const btn = "absolute top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-surface text-lg font-semibold text-ink shadow-card ring-1 ring-line hover:ring-brand-teal";
  return (
    <nav aria-label={label} className="relative">
      {!edge.start && <button type="button" onClick={() => go(-1)} aria-label={prev} className={`${btn} start-0`}><span aria-hidden="true" className="inline-block rtl:rotate-180">‹</span></button>}
      <div ref={box} className="flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
      {!edge.end && <button type="button" onClick={() => go(1)} aria-label={next} className={`${btn} end-0`}><span aria-hidden="true" className="inline-block rtl:rotate-180">›</span></button>}
    </nav>
  );
}
