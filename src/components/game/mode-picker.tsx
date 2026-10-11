"use client";
/**
 * 🏁 Live Challenge: the game-mode choice. Only modes with enough fitting questions for the chosen skills are listed
 * (with no skill chosen yet: the modes the whole bank can fill). When the chosen mode stops fitting, the first mode
 * that fits is chosen instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { GAMES } from "@/games/registry";
import { modesToShow } from "./game-list";
import { liveModesForSkillsAction } from "@/app/games/mode-actions";

export function GameModePicker({ skillIds, mode, onMode }: { skillIds: string[]; mode: string; onMode: (id: string) => void }) {
  const t = useT();
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const key = [...skillIds].sort().join(",");

  useEffect(() => {
    let on = true;
    const id = setTimeout(() => {
      liveModesForSkillsAction(key ? key.split(",") : []).then((r) => { if (on) setAllowed(r.modes); }).catch(() => { if (on) setAllowed(GAMES.filter((g) => g.ready && g.live).map((g) => g.id)); });
    }, 200);
    return () => { on = false; clearTimeout(id); };
  }, [key]);

  const list = useMemo(() => modesToShow(allowed), [allowed]);
  useEffect(() => {
    if (list.length && !list.some((g) => g.id === mode)) onMode(list[0].id);
  }, [list, mode, onMode]);

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-700">{t("Game mode")}</legend>
      {allowed && list.length === 0 && <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-slate-700 ring-1 ring-slate-200">{t("These skills do not have enough questions for a game. Add another skill.")}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2" aria-busy={!allowed}>
        {list.map((g) => (
          <label key={g.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ring-1 ${mode === g.id ? "bg-sky-50 ring-2 ring-brand-teal" : "bg-white ring-slate-200"}`}>
            <input type="radio" name="mode" value={g.id} checked={mode === g.id} onChange={() => onMode(g.id)} className="sr-only" />
            <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl ${g.color}`}>{g.icon}</span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-brand-navy">{t(g.name)}</span><span className="block text-xs text-slate-600">{t(g.line)}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
