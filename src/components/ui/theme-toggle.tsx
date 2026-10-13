/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { THEMES, themeCookie, type Theme } from "@/lib/theme";

const ICON: Record<Theme, React.ReactNode> = {
  day: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  night: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  system: <><rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" /><path d="M9 20h6M12 16v4" /></>,
};
const LABEL: Record<Theme, string> = { day: "Day", night: "Night", system: "System" };

/**
 * The sun / moon in the top bar (every role): Day (default) · Night · System (follows the device). The choice is
 * saved in the lr-theme cookie and applied at once on <html data-theme>; the server reads the same cookie, so the
 * next page opens in the right look with no flash. The only client code of the new look.
 */
export function ThemeToggle({ initial = "day" }: { initial?: Theme }) {
  const t = useT();
  const [theme, setTheme] = useState<Theme>(initial);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);
  const pick = (v: Theme) => {
    setTheme(v);
    document.documentElement.dataset.theme = v;
    try { document.cookie = themeCookie(v, window.location.protocol === "https:"); } catch { /* cookies blocked: this page only */ }
    if (ref.current) ref.current.open = false;
  };
  const icon = (v: Theme, cls: string) => <svg aria-hidden="true" viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{ICON[v]}</svg>;
  return (
    <details ref={ref} className="relative" data-testid="theme-toggle">
      <summary aria-label={`${t("Day or night")}: ${t(LABEL[theme])}`} title={t("Day or night")}
        className="grid min-h-10 min-w-10 cursor-pointer list-none place-items-center rounded-full text-ink-2 ring-1 ring-line transition hover:text-ink [&::-webkit-details-marker]:hidden">
        {icon(theme, "h-[18px] w-[18px]")}
      </summary>
      <div role="group" aria-label={t("Day or night")} className="absolute end-0 top-full z-40 mt-2 w-40 rounded-xl bg-surface p-1 shadow-pop ring-1 ring-line">
        {THEMES.map((v) => (
          <button key={v} type="button" aria-pressed={theme === v} onClick={() => pick(v)}
            className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition ${theme === v ? "bg-brand-navy font-semibold text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
            {icon(v, "h-4 w-4")}{t(LABEL[v])}
          </button>
        ))}
      </div>
    </details>
  );
}
