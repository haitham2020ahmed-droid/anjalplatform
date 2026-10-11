"use client";
import { useT } from "@/i18n/client";
import type { PlayQuestion, PowerEffect, PowerUpId, RoundApi } from "../types";
import { POWER_UPS } from "../types";
import { POWER_INFO, powerApplies } from "./powerups";

/** The five power-ups as buttons (one of each per round). Armed ones (Double Points, Shield) glow until used. */
export function PowerBar({ round, q, onEffect, only }: { round: RoundApi; q: PlayQuestion | null; onEffect?: (id: PowerUpId, e: PowerEffect) => void; only?: PowerUpId[] }) {
  const t = useT();
  const list = only ?? [...POWER_UPS];
  return (
    <div role="group" aria-label={t("Power-ups")} className="flex flex-wrap justify-center gap-2">
      {list.map((id) => {
        const info = POWER_INFO[id];
        const left = round.powerLeft[id] ?? 0;
        const armed = round.armed.includes(id);
        const can = !!q && left > 0 && !armed && !round.over && powerApplies(id, q);
        return (
          <button key={id} type="button" disabled={!can} title={t(info.line)} data-power={id}
            onClick={() => { if (!q) return; const e = round.activate(id, q); if (e && onEffect) onEffect(id, e); }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition active:scale-95 disabled:opacity-40 ${armed ? "bg-amber-100 text-amber-900 ring-amber-400" : "bg-white text-brand-navy ring-slate-300 hover:bg-slate-50"}`}>
            <span aria-hidden="true" className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-navy/10 px-1 text-xs font-bold">{info.icon}</span>
            <span>{t(info.name)}</span>
            {armed && <span className="sr-only">{t("On")}</span>}
          </button>
        );
      })}
    </div>
  );
}
