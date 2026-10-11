"use client";
/**
 * 🎲 "Play ▾" in each My Work row: the games for that skill, each with a small coloured icon and one line.
 * A game opens only when the skill has enough fitting questions; otherwise it says "Soon". A popover on iPad /
 * desktop, a bottom sheet with big buttons on phones. The list is asked for only when the menu opens (the home page
 * stays fast).
 */
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { GAMES } from "@/games/registry";
import { BTN_SECONDARY } from "@/components/ui-kit/tokens";

type Status = "PLAY" | "SOON";

export function PlayMenu({ skillId, skill, full = false, defaultOpen = false, preset = null }: { skillId: string; skill: string; full?: boolean; defaultOpen?: boolean; preset?: Record<string, Status> | null }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<Record<string, Status> | null>(preset);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || status) return;
    let on = true;
    fetch(`/api/play?games=1&skill=${encodeURIComponent(skillId)}`).then((r) => (r.ok ? r.json() : Promise.reject(r))).then((j: { games: { id: string; status: Status }[] }) => {
      if (on) setStatus(Object.fromEntries(j.games.map((g) => [g.id, g.status])));
    }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [open, status, skillId]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <span className={`relative inline-block ${full ? "w-full" : ""}`}>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-testid="play-menu"
        className={`${BTN_SECONDARY} ${full ? "w-full" : ""}`}>
        <span aria-hidden="true">🎲</span>{t("Play")}<span aria-hidden="true" className="text-xs">▾</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label={t("Close")} tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-slate-900/30 sm:bg-transparent" />
          <div id={id} role="menu" aria-label={t("Games for {skill}", { skill })}
            className="animate-fade-up fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-6 text-start shadow-2xl ring-1 ring-slate-200 sm:absolute sm:inset-x-auto sm:bottom-auto sm:end-0 sm:top-full sm:mt-2 sm:w-80 sm:rounded-2xl sm:p-2 sm:pb-2">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" aria-hidden="true" />
            <p className="px-2 pb-2 text-sm font-semibold text-slate-500">{t("Play")}: <bdi dir="ltr" className="text-brand-navy">{skill}</bdi></p>
            {failed && <p role="alert" className="px-2 py-1 text-sm text-red-700">{t("Something went wrong. Try again.")}</p>}
            <ul className="grid gap-1">
              {GAMES.map((g) => {
                const st = status?.[g.id];
                const playable = st === "PLAY";
                const body = (
                  <>
                    <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl ${g.color}`}>{g.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-brand-navy">{t(g.name)}</span>
                      <span className="block text-sm text-slate-600">{t(g.line)}</span>
                    </span>
                    {!playable && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{st ? t("Soon") : "…"}</span>}
                  </>
                );
                return (
                  <li key={g.id} role="none">
                    {playable ? (
                      <Link role="menuitem" prefetch={false} href={`/student/play/${g.id}/${skillId}`} data-game={g.id} className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-teal sm:min-h-14">{body}</Link>
                    ) : (
                      <span role="menuitem" aria-disabled="true" data-game={g.id} className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2 opacity-60 sm:min-h-14">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </span>
  );
}
