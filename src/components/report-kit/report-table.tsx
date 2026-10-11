"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";

export interface Col { key: string; label: string; num?: boolean; sort?: boolean; hint?: string; className?: string }
export type SortVal = string | number | null | undefined;
export interface RRow { id: string; cells: Record<string, ReactNode>; sort?: Record<string, SortVal>; flag?: "bad" | "warn" | "good" }

const FLAG = { bad: "rk-flag-bad", warn: "rk-flag-warn", good: "rk-flag-good" } as const;

function plain(v: ReactNode): SortVal {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v.replace(/[%,\s]/g, "")); return v.trim() !== "" && Number.isFinite(n) ? n : v; }
  return null;
}

/**
 * The report table: sticky header row, zebra rows, numbers right-aligned with even digits, a click-to-sort
 * header, and on phones (under 640 px) each row becomes a card with "label: value" lines (the first column is
 * the card's title). Cells are ready-made nodes; `sort` gives the raw value to sort by when a cell is not a
 * plain number or text. The order of `rows` is the default order (nothing is re-computed here).
 */
export function ReportTable({ label, cols, rows, empty = "Nothing to show yet.", cards = true, foot, className = "" }: {
  label: string; cols: Col[]; rows: RRow[]; empty?: string; cards?: boolean; foot?: ReactNode; className?: string;
}) {
  const t = useT();
  const [by, setBy] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const shown = useMemo(() => {
    if (!by) return rows;
    const val = (r: RRow) => (r.sort && by.key in r.sort ? r.sort[by.key] : plain(r.cells[by.key]));
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const xn = x === null || x === undefined || x === "", yn = y === null || y === undefined || y === "";
      if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1; // empty values always last
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c * by.dir;
    });
  }, [rows, by]);
  if (!rows.length) return <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200" role="status">{t(empty)}</p>;
  return (
    <div className={`rk-box ${cards ? "rk-cards" : ""} ${rows.length > 14 ? "rk-tall" : ""} ${className}`} role="region" aria-label={t(label)} tabIndex={0} data-rk="table">
      <table className="rk-table">
        <thead>
          <tr>{cols.map((c) => {
            const on = by?.key === c.key;
            const sortable = c.sort !== false;
            return (
              <th key={c.key} scope="col" className={`${c.num ? "rk-num" : ""} ${c.className ?? ""}`} aria-sort={on ? (by!.dir === 1 ? "ascending" : "descending") : undefined} title={c.hint ? t(c.hint) : undefined}>
                {sortable ? (
                  <button type="button" className="rk-sort" onClick={() => setBy(on ? (by!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}>
                    {t(c.label)}<span aria-hidden="true" className="rk-sort-mark">{on ? (by!.dir === 1 ? "▲" : "▼") : "↕"}</span>
                  </button>
                ) : t(c.label)}
              </th>
            );
          })}</tr>
        </thead>
        <tbody>{shown.map((r) => (
          <tr key={r.id} className={r.flag ? FLAG[r.flag] : undefined}>
            {cols.map((c, i) => (
              <td key={c.key} data-label={t(c.label)} className={`${c.num ? "rk-num" : ""} ${i === 0 ? "rk-first" : ""} ${c.className ?? ""}`}>{r.cells[c.key] ?? <span className="text-slate-400">—</span>}</td>
            ))}
          </tr>
        ))}</tbody>
        {foot && <tfoot><tr><td colSpan={cols.length}>{foot}</td></tr></tfoot>}
      </table>
    </div>
  );
}
