"use client";
/**
 * 🎁 Mystery Chest on a student's device (Live Challenge, modes with `chest`): after a right answer, pick 1 of 3
 * chests. The server decides what is inside (bonus, double points, or points taken from a classmate). A game can
 * export its own `LiveChest` (props: LiveChestProps); this is the default.
 */
import type { LiveChestProps } from "../types";

const PRIZE_ICON = { bonus: "💰", double: "✖️2", steal: "🧲" } as const;

export function ChestPicker({ opened, busy, open, t }: LiveChestProps) {
  if (opened) {
    const text = opened.prize === "steal" && opened.from ? t("You took {n} points from {name}!", { n: opened.points, name: opened.from })
      : opened.prize === "double" ? t("Double points! +{n}", { n: opened.points }) : t("Bonus! +{n}", { n: opened.points });
    return <p role="status" className="animate-pop mt-3 rounded-2xl bg-white/20 px-4 py-2 text-lg font-semibold" data-testid="chest-result"><span aria-hidden="true">{PRIZE_ICON[opened.prize]} </span>{text}</p>;
  }
  return (
    <div className="mt-4" data-testid="chest-picker">
      <p className="font-semibold">{t("Pick a chest")}</p>
      <div className="mt-2 flex justify-center gap-3">
        {[0, 1, 2].map((i) => (
          <button key={i} type="button" disabled={busy} onClick={() => open(i)} aria-label={t("Chest {n}", { n: i + 1 })}
            className="grid h-20 w-20 place-items-center rounded-2xl bg-amber-400 text-4xl shadow-lg ring-4 ring-amber-200 transition hover:scale-105 disabled:opacity-50">🎁</button>
        ))}
      </div>
    </div>
  );
}
