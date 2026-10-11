/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/** 🗂️ An interactive graphic organizer (cause–effect, compare, sequence, plot map …): type in the boxes, save, see what is missing. */
import { useState, useTransition } from "react";
import type { OrganizerSpec } from "../../server/lessons/content";

export interface OrganizerData { head: string; rows: string[][]; foot: string; complete?: boolean; missing?: string[] }
type Save = (value: { head: string; rows: string[][]; foot: string }) => Promise<{ complete?: boolean; missing?: string[]; error?: string }>;

const box = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base focus:border-brand-teal";

export function Organizer({ spec, initial, save, readOnly = false }: { spec: OrganizerSpec; initial: OrganizerData | null; save?: Save; readOnly?: boolean }) {
  const [head, setHead] = useState(initial?.head ?? "");
  const [foot, setFoot] = useState(initial?.foot ?? "");
  const [rows, setRows] = useState<string[][]>(() => Array.from({ length: spec.rows }, (_, i) => spec.columns.map((_, c) => initial?.rows?.[i]?.[c] ?? "")));
  const [status, setStatus] = useState<{ complete: boolean; missing: string[] } | null>(initial?.complete === undefined ? null : { complete: Boolean(initial.complete), missing: initial.missing ?? [] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, c: number, v: string) => setRows((r) => r.map((row, k) => (k === i ? row.map((x, j) => (j === c ? v : x)) : row)));
  const onSave = () => start(async () => {
    if (!save) return;
    const r = await save({ head, rows, foot });
    if (r.error) return setError(r.error);
    setError(null);
    setStatus({ complete: Boolean(r.complete), missing: r.missing ?? [] });
  });
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-indigo-200" aria-label={spec.title}>
      <h3 className="font-bold text-indigo-900">🗂️ {spec.title}</h3>
      {spec.head && (
        <label className="mt-3 block text-sm font-semibold text-slate-700">{spec.head}
          <input value={head} onChange={(e) => setHead(e.target.value)} readOnly={readOnly} maxLength={300} className={`mt-1 ${box}`} />
        </label>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1 text-sm">
          <thead><tr>{spec.rowLabels && <th scope="col" className="sr-only">Step</th>}{spec.columns.map((c) => <th key={c} scope="col" className="text-left text-xs font-semibold uppercase text-slate-500">{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {spec.rowLabels && <th scope="row" className="pe-2 text-left text-sm font-semibold text-brand-navy">{spec.rowLabels[i]}</th>}
                {row.map((v, c) => <td key={c}><input aria-label={`${spec.rowLabels?.[i] ?? `Row ${i + 1}`}: ${spec.columns[c]}`} value={v} onChange={(e) => set(i, c, e.target.value)} readOnly={readOnly} maxLength={300} className={box} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {spec.foot && (
        <label className="mt-3 block text-sm font-semibold text-slate-700">{spec.foot}
          <input value={foot} onChange={(e) => setFoot(e.target.value)} readOnly={readOnly} maxLength={300} className={`mt-1 ${box}`} />
        </label>
      )}
      {!readOnly && save && (
        <button type="button" onClick={onSave} disabled={pending} className="mt-3 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{pending ? "Saving…" : "Save my organizer"}</button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {status && (
        <p role="status" className={`mt-2 text-sm ${status.complete ? "text-teal-800" : "text-amber-800"}`}>
          {status.complete ? "✓ Complete. Great organizing!" : `Still missing: ${status.missing.join("; ")}.`}
        </p>
      )}
    </section>
  );
}
