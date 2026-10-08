"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Instant feedback on every click: a thin bar appears the moment a link is followed or a form is sent, and
 * the pressed button is locked against double clicks. It disappears when the next page shows.
 */
export function NavProgress() {
  const pathname = usePathname(), search = useSearchParams();
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(false); }, [pathname, search]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => { setBusy(true); clearTimeout(timer); timer = setTimeout(() => setBusy(false), 10_000); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || (url.pathname === location.pathname && url.search === location.search)) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const btn = e.submitter as HTMLElement | null;
      if (btn) setTimeout(() => { btn.style.pointerEvents = "none"; btn.style.opacity = "0.6"; setTimeout(() => { btn.style.pointerEvents = ""; btn.style.opacity = ""; }, 8000); }, 0);
      if ((e.target as HTMLFormElement).method?.toLowerCase() !== "dialog") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); clearTimeout(timer); };
  }, []);
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden transition-opacity duration-200 print:hidden ${busy ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full w-1/3 animate-[loadbar_0.9s_ease-in-out_infinite] rounded-full bg-brand-gold" />
    </div>
  );
}
