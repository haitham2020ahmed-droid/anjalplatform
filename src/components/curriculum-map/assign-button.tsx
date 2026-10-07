"use client";
import { useState } from "react";
import type { PlaceAssignInput } from "@/app/admin/curriculum-map/actions";

export interface RosterClass { id: string; name: string; students: { id: string; name: string; level: "ABOVE" | "ON" | "BELOW" | null }[] }
const LV = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;

/** ⭐ Assign: a dialog on the same page — whole class or starred students; adaptive or by level for a category. */
export function MapAssignButton({ code, label, levels, classes, assign }: {
  code: string; label: string; levels: boolean; classes: RosterClass[];
  assign: (input: PlaceAssignInput) => Promise<{ ok: boolean; message: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [who, setWho] = useState<"all" | "some">("all");
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"ADAPTIVE" | "BY_LEVEL">("ADAPTIVE");
  const [max, setMax] = useState(20);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const klass = classes.find((c) => c.id === classId);
  const toggle = (id: string) => setStarred((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const send = async () => {
    setBusy(true); setResult(null);
    const r = await assign({ classId, code, studentIds: who === "some" ? [...starred] : undefined, mode: levels ? mode : undefined, max, dueAt: due || null });
    setBusy(false); setResult(r);
  };
  if (!classes.length) return null;
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setResult(null); }} className="ms-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200">⭐ {label}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`Assign ${code}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-sm shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-lg font-bold text-brand-navy">⭐ Assign</p><p className="font-mono text-xs text-emerald-800">{code}</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-2xl leading-none text-slate-500">×</button>
            </div>
            {classes.length > 1 && (
              <label className="mt-3 flex flex-col font-semibold text-slate-700">Class
                <select value={classId} onChange={(e) => { setClassId(e.target.value); setStarred(new Set()); }} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.students.length})</option>)}</select>
              </label>
            )}
            <fieldset className="mt-3">
              <legend className="font-semibold text-slate-700">Students</legend>
              <div className="mt-1 flex gap-2">
                {(["all", "some"] as const).map((w) => <button key={w} type="button" onClick={() => setWho(w)} aria-pressed={who === w} className={`rounded-full px-4 py-1.5 font-semibold ${who === w ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>{w === "all" ? `All students (${klass?.students.length ?? 0})` : "Some students"}</button>)}
              </div>
              {who === "some" && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl p-2 ring-1 ring-slate-200">
                  {klass?.students.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => toggle(s.id)} aria-pressed={starred.has(s.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start ${starred.has(s.id) ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                        <span aria-hidden="true" className="text-lg">{starred.has(s.id) ? "⭐" : "☆"}</span>
                        <span className="flex-1">{s.name}</span>
                        <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{s.level ? LV[s.level] : "no level"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {who === "some" && <p className="mt-1 text-xs text-slate-500">{starred.size} starred</p>}
            </fieldset>
            {levels && (
              <fieldset className="mt-3">
                <legend className="font-semibold text-slate-700">How</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setMode("ADAPTIVE")} aria-pressed={mode === "ADAPTIVE"} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "ADAPTIVE" ? "bg-emerald-600 text-white" : "ring-1 ring-slate-300"}`}>🔁 Adaptive (Below → On → Above)</button>
                  <button type="button" onClick={() => setMode("BY_LEVEL")} aria-pressed={mode === "BY_LEVEL"} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "BY_LEVEL" ? "bg-sky-600 text-white" : "ring-1 ring-slate-300"}`}>Each at their level</button>
                </div>
              </fieldset>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex flex-col font-semibold text-slate-700">Questions per student<input type="number" min={1} max={60} value={max} onChange={(e) => setMax(Number(e.target.value) || 20)} className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
              <label className="flex flex-col font-semibold text-slate-700">Due date (optional)<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
            </div>
            {result && <p role="status" className={`mt-3 rounded-lg px-3 py-2 ${result.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{result.message}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 font-semibold ring-1 ring-slate-300">{result?.ok ? "Done" : "Cancel"}</button>
              {!result?.ok && <button type="button" onClick={send} disabled={busy || (who === "some" && !starred.size)} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Assigning…" : who === "some" ? `Assign to ${starred.size} student(s)` : "Assign to the class"}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
