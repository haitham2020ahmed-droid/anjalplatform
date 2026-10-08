"use client";
import { useMemo, useState } from "react";

/**
 * 🧭 Curriculum Map place picker, step by step from the map itself:
 *   Grade → Unit → Text Set / Selection → Category → Level
 * Each list shows only what is under the previous choice.
 *   mode "filter": stop at any step (a grade, a unit, …: everything under it); the code goes in a hidden input.
 *   mode "place":  go down to a place that takes questions (onChange gets its code, or null).
 */
export interface MapPlace { code: string; grade: number; unit: number; path: string }
type Opt = { code: string; label: string };

export function MapPlacePicker({ places, value, mode, name, onChange, className = "" }: { places: MapPlace[]; value: string | null; mode: "filter" | "place"; name?: string; onChange?: (code: string | null) => void; className?: string }) {
  // the tree, from the places' codes (G5.U1.TS2.ACS.ON) and paths (Grade 5 › Unit 1 › Text Set 2… › 2- Analyze… › On Level)
  const { children, leaves } = useMemo(() => {
    const kids = new Map<string, Opt[]>(), leafSet = new Set<string>();
    const add = (parent: string, code: string, label: string) => { const l = kids.get(parent) ?? []; if (!l.some((o) => o.code === code)) l.push({ code, label }); kids.set(parent, l); };
    for (const p of places) {
      const parts = p.code.split("."), labels = p.path.split(" › ");
      for (let d = 1; d <= parts.length; d++) add(d === 1 ? "" : parts.slice(0, d - 1).join("."), parts.slice(0, d).join("."), labels[d - 1] ?? parts[d - 1]);
      leafSet.add(p.code);
    }
    for (const l of kids.values()) l.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return { children: kids, leaves: leafSet };
  }, [places]);
  const initial = useMemo(() => { const parts = (value ?? "").toUpperCase().split(".").filter(Boolean); return parts.map((_, i) => parts.slice(0, i + 1).join(".")); }, [value]);
  const [chain, setChain] = useState<string[]>(initial);
  const steps = ["Grade", "Unit", "Text Set / Selection", "Category", "Level"];
  const choose = (depth: number, code: string) => {
    const next = code ? [...chain.slice(0, depth), code] : chain.slice(0, depth);
    setChain(next);
    const last = next[next.length - 1] ?? null;
    onChange?.(mode === "place" ? (last && leaves.has(last) ? last : null) : last);
  };
  const lists: { depth: number; options: Opt[] }[] = [];
  for (let d = 0; d < 5; d++) {
    const parent = d === 0 ? "" : chain[d - 1];
    if (d > 0 && !parent) break;
    const options = children.get(parent) ?? [];
    if (!options.length) break;
    lists.push({ depth: d, options });
  }
  const current = chain[chain.length - 1] ?? "";
  const done = mode === "place" && current !== "" && leaves.has(current);
  const sel = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {name && <input type="hidden" name={name} value={current} />}
      {lists.map(({ depth, options }) => (
        <select key={depth} aria-label={steps[depth]} value={chain[depth] ?? ""} onChange={(e) => choose(depth, e.target.value)} className={`${sel} ${chain[depth] ? "ring-1 ring-emerald-300" : ""}`}>
          <option value="">{mode === "filter" ? (depth === 0 ? "🧭 Curriculum Map: any place" : `All (${steps[depth].toLowerCase()})`) : `Choose ${steps[depth].toLowerCase()}…`}</option>
          {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>
      ))}
      {current && <code className={`rounded-full px-2.5 py-1 text-xs font-bold ${done || mode === "filter" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300" : "bg-amber-50 text-amber-900 ring-1 ring-amber-300"}`}>{current}{mode === "place" && !done ? " · keep choosing" : ""}</code>}
    </div>
  );
}
