"use client";
import { useEffect, useState } from "react";
import type { PlaceAssignInput } from "@/app/admin/curriculum-map/actions";

export interface RosterClass { id: string; name: string; students: { id: string; name: string; level: "ABOVE" | "ON" | "BELOW" | null }[] }
const LV = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;

const EVENT = "map-assign:open";

/** A tiny ⭐ button: it only asks the page's single assign window to open for this place. */
export function MapAssignButton({ code, label, levels }: { code: string; label: string; levels: boolean }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: { code, levels } }))}
      className="ms-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-200 active:scale-95">⭐ {label}</button>
  );
}

/** The page's ONE assign window (the roster is sent once): whole class or starred students; adaptive or by level. */
export function MapAssignHost({ classes, assign }: { classes: RosterClass[]; assign: (input: PlaceAssignInput) => Promise<{ ok: boolean; message: string }> }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [levels, setLevels] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ code: string; levels: boolean }>).detail; setCode(d.code); setLevels(d.levels); setResult(null); setOpen(true); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [who, setWho] = useState<"all" | "some">("all");
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"AUTO" | "MANUAL">("AUTO");
  /** ✋ the starting level the teacher picks for each student (prefilled with their current level, else On) */
  const [picked, setPicked] = useState<Record<string, "ABOVE" | "ON" | "BELOW">>({});
  const [max, setMax] = useState(20);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const klass = classes.find((c) => c.id === classId);
  const levelOf = (id: string): "ABOVE" | "ON" | "BELOW" => picked[id] ?? klass?.students.find((s) => s.id === id)?.level ?? "ON";
  const chosen = (klass?.students ?? []).filter((s) => who === "all" || starred.has(s.id));
  const noLevel = chosen.filter((s) => !s.level).length;
  /** ✋ students ticked in the level list: one click sets all of them to Below / On / Above */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const setLevel = (ids: string[], lv: "ABOVE" | "ON" | "BELOW") => { setPicked((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, lv])) })); setSel(new Set()); };
  const tick = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const counts = { BELOW: 0, ON: 0, ABOVE: 0 } as Record<"ABOVE" | "ON" | "BELOW", number>;
  for (const s of chosen) counts[levelOf(s.id)]++;
  const toggle = (id: string) => setStarred((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const send = async () => {
    setBusy(true); setResult(null);
    const ids = who === "some" ? [...starred] : (klass?.students ?? []).map((s) => s.id);
    const startLevels = levels && mode === "MANUAL" ? ids.map((id) => ({ studentId: id, level: levelOf(id) })) : undefined;
    const r = await assign({ classId, code, studentIds: who === "some" ? [...starred] : undefined, mode: "ADAPTIVE", startLevels, max, dueAt: due || null });
    setBusy(false); setResult(r);
  };
  if (!classes.length) return null;
  return (
    <>
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
              {who === "some" && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">{starred.size} starred
                  <button type="button" onClick={() => setStarred(new Set((klass?.students ?? []).map((s) => s.id)))} className="font-semibold text-brand-navy hover:underline">Star all</button>
                  <button type="button" onClick={() => setStarred(new Set((klass?.students ?? []).filter((s) => !s.level).map((s) => s.id)))} className="font-semibold text-amber-800 hover:underline">Star “no level”</button>
                  <button type="button" onClick={() => setStarred(new Set())} className="font-semibold text-slate-600 hover:underline">Clear</button>
                </p>
              )}
            </fieldset>
            {levels && (
              <fieldset className="mt-3">
                <legend className="font-semibold text-slate-700">Starting level</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setMode("AUTO")} aria-pressed={mode === "AUTO"} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "AUTO" ? "bg-emerald-600 text-white" : "ring-1 ring-slate-300"}`}>🤖 Automatic (the platform decides)</button>
                  <button type="button" onClick={() => setMode("MANUAL")} aria-pressed={mode === "MANUAL"} className={`rounded-full px-3 py-1.5 font-semibold ${mode === "MANUAL" ? "bg-sky-600 text-white" : "ring-1 ring-slate-300"}`}>✋ I choose each student’s level</button>
                </div>
                {noLevel > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">⚠️ <b>{noLevel}</b> of {chosen.length} student(s) have no level yet.{mode === "AUTO" ? " They start from their platform results, or On Level." : " Choose their level below."}</p>}
                {mode === "MANUAL" && (
                  <div className="mt-2 rounded-xl ring-1 ring-slate-200">
                    <div className="sticky top-0 z-10 space-y-2 rounded-t-xl bg-slate-50 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-600">Tick:</span>
                        <button type="button" onClick={() => setSel(new Set(chosen.map((s) => s.id)))} className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-300 hover:bg-slate-100">All</button>
                        <button type="button" onClick={() => setSel(new Set(chosen.filter((s) => !s.level).map((s) => s.id)))} className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-amber-300 hover:bg-amber-50">No level ({noLevel})</button>
                        <button type="button" onClick={() => setSel(new Set())} className="rounded-full bg-white px-2.5 py-1 font-semibold ring-1 ring-slate-300 hover:bg-slate-100">None</button>
                        <span className="ms-auto tabular-nums text-slate-500">Below {counts.BELOW} · On {counts.ON} · Above {counts.ABOVE}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-600">{sel.size} ticked → set to:</span>
                        {(["BELOW", "ON", "ABOVE"] as const).map((lv) => <button key={lv} type="button" disabled={!sel.size} onClick={() => setLevel([...sel], lv)} className={`rounded-lg px-3 py-1.5 font-bold text-white disabled:opacity-40 ${lv === "BELOW" ? "bg-rose-500 hover:bg-rose-600" : lv === "ON" ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{LV[lv]}</button>)}
                      </div>
                    </div>
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto p-2" aria-label="Starting level of each student">
                      {chosen.map((s) => {
                        const lv = levelOf(s.id);
                        const chip = lv === "BELOW" ? "bg-rose-100 text-rose-800" : lv === "ON" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800";
                        return (
                          <li key={s.id}>
                            <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${sel.has(s.id) ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                              <input type="checkbox" checked={sel.has(s.id)} onChange={() => tick(s.id)} className="h-4 w-4 accent-brand-navy" />
                              <span className="min-w-0 flex-1 truncate">{s.name}{!s.level && !picked[s.id] && <span className="ms-2 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">no level</span>}</span>
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${chip}`}>{LV[lv]}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-500">{mode === "MANUAL" ? "Tick students, then press Below, On or Above. " : "The platform uses each student’s Diagnostic, MAP and platform results. "}Each student starts at {mode === "MANUAL" ? "the level you choose" : "their level"}, then moves up when they answer well and down when it is too hard (Below ↔ On ↔ Above).</p>
              </fieldset>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex flex-col font-semibold text-slate-700">{levels ? "Correct answers to finish" : "Questions per student"}<input type="number" min={levels ? 5 : 1} max={levels ? 50 : 60} value={max} onChange={(e) => setMax(Number(e.target.value) || 20)} className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
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
