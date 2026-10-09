"use client";
import { useMemo, useState } from "react";

type Level = "BELOW" | "ON" | "ABOVE";
export interface BoardStudent { id: string; name: string; start: Level; original: Level | null; note?: string | null; tag?: string | null }

const COLS: { level: Level; title: string; tone: string; head: string }[] = [
  { level: "BELOW", title: "Below Level", tone: "bg-orange-50 ring-orange-200", head: "text-orange-900" },
  { level: "ON", title: "On Level", tone: "bg-sky-50 ring-sky-200", head: "text-sky-900" },
  { level: "ABOVE", title: "Above Level", tone: "bg-emerald-50 ring-emerald-200", head: "text-emerald-900" },
];
const ORDER: Level[] = ["BELOW", "ON", "ABOVE"];

/**
 * 🎯 Three columns (Below / On / Above). Drag a student to another column, or use the ◀ ▶ buttons (tablets).
 * The form gets one hidden field per student whose level is new: `${prefix}<studentId>` = level
 * (or every student when `sendAll`, e.g. when sending work).
 */
export function LevelBoard({ students, prefix = "level:", sendAll = false }: { students: BoardStudent[]; prefix?: string; sendAll?: boolean }) {
  const [at, setAt] = useState<Record<string, Level>>(() => Object.fromEntries(students.map((x) => [x.id, x.start])));
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Level | null>(null);
  const changed = useMemo(() => students.filter((x) => sendAll || at[x.id] !== x.original), [students, at, sendAll]);
  const move = (id: string, by: number) => setAt((m) => ({ ...m, [id]: ORDER[Math.max(0, Math.min(2, ORDER.indexOf(m[id]) + by))] }));
  return (
    <div>
      {changed.map((x) => <input key={x.id} type="hidden" name={`${prefix}${x.id}`} value={at[x.id]} />)}
      <div className="grid gap-3 md:grid-cols-3">
        {COLS.map((c) => {
          const list = students.filter((x) => at[x.id] === c.level);
          return (
            <section key={c.level} aria-label={c.title}
              onDragOver={(e) => { e.preventDefault(); setOver(c.level); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); const id = drag ?? e.dataTransfer.getData("text/plain"); if (id) setAt((m) => ({ ...m, [id]: c.level })); setDrag(null); setOver(null); }}
              className={`min-h-40 rounded-2xl p-3 ring-2 transition ${c.tone} ${over === c.level ? "scale-[1.01] ring-brand-teal" : ""}`}>
              <h3 className={`flex items-center justify-between font-bold ${c.head}`}>{c.title}<span className="rounded-full bg-white px-2 text-sm tabular-nums ring-1 ring-slate-200">{list.length}</span></h3>
              <ul className="mt-2 space-y-1.5">
                {list.map((x) => (
                  <li key={x.id} draggable onDragStart={(e) => { setDrag(x.id); e.dataTransfer.setData("text/plain", x.id); }} onDragEnd={() => setDrag(null)}
                    className={`group flex cursor-grab items-center gap-1 rounded-xl bg-white px-2 py-1.5 text-sm shadow-sm ring-1 ring-slate-200 active:cursor-grabbing ${at[x.id] !== x.original ? "ring-2 ring-amber-400" : ""}`}>
                    <button type="button" onClick={() => move(x.id, -1)} disabled={c.level === "BELOW"} aria-label={`Move ${x.name} down a level`} className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-20">◀</button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">{x.name}</span>
                      {(x.tag || x.note) && <span className="block truncate text-xs text-slate-500" title={x.note ?? ""}>{x.tag ? <b className="text-amber-800">{x.tag} </b> : null}{x.note}</span>}
                    </span>
                    <button type="button" onClick={() => move(x.id, 1)} disabled={c.level === "ABOVE"} aria-label={`Move ${x.name} up a level`} className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-20">▶</button>
                  </li>
                ))}
                {!list.length && <li className="rounded-xl border-2 border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">Drag students here</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {!sendAll && <p className="mt-2 text-sm text-slate-600">{changed.length ? <>✏️ {changed.length} change(s) not saved yet (yellow).</> : "No changes."}</p>}
    </div>
  );
}
