"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { applyChunkAction, finishApplyAction, previewChunkAction } from "./actions";
import type { RewriteChunk, RewriteCursor, RewriteExample, RewriteSource, SourceCounts } from "@/server/admin/option-rewrites";

const LABEL: Record<RewriteSource, string> = { BANK: "Question Bank", MAP: "Curriculum Map", NAFS: "NAFS", READMASTER: "ReadMaster", READRISE: "ReadRise" };
const BACKOFF_MS = [2_000, 5_000, 12_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Fail = { ok: false; error: string; retry?: boolean };

interface Totals { counts: Partial<Record<RewriteSource, SourceCounts>>; examples: RewriteExample[]; entries: Set<number>; scanned: number; changed: number }
const empty = (): Totals => ({ counts: {}, examples: [], entries: new Set(), scanned: 0, changed: 0 });
function merge(t: Totals, c: RewriteChunk): Totals {
  const counts = { ...t.counts };
  for (const [k, v] of Object.entries(c.counts) as [RewriteSource, SourceCounts][]) {
    const o = counts[k] ?? { matched: 0, toChange: 0, upToDate: 0, notFound: 0, options: 0 };
    counts[k] = { matched: o.matched + v.matched, toChange: o.toChange + v.toChange, upToDate: o.upToDate + v.upToDate, notFound: o.notFound + v.notFound, options: o.options + v.options };
  }
  const entries = new Set(t.entries); for (const n of c.entries) entries.add(n);
  return { counts, examples: [...t.examples, ...c.examples].slice(0, 10), entries, scanned: t.scanned + c.scanned, changed: t.changed + c.changed };
}

/**
 * ✏️ "Update answer choices from files": PREVIEW (counts per source + 10 examples, nothing written), then APPLY — one
 * short request per chunk with a progress bar; Stop keeps the place (Apply goes on from there); a failed chunk is tried
 * again after a pause. Running it twice changes nothing the second time.
 */
export function RewriteRunner({ files, entries, problems, total, resume }: { files: string[]; entries: number; problems: string[]; total: number; resume: { scanned: number; changed: number } | null }) {
  const t = useT();
  const router = useRouter();
  const stop = useRef(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [preview, setPreview] = useState<Totals | null>(null);
  const [applied, setApplied] = useState<Totals | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function attempt<T>(fn: () => Promise<{ ok: true; data: T } | Fail>): Promise<{ ok: true; data: T } | Fail> {
    for (let i = 0; ; i++) {
      let r: { ok: true; data: T } | Fail;
      try { r = await fn(); } catch { r = { ok: false, error: "The connection to the server was lost.", retry: true }; }
      if (r.ok || !r.retry || i >= BACKOFF_MS.length || stop.current) return r;
      await sleep(BACKOFF_MS[i]);
    }
  }

  async function runPreview() {
    stop.current = false; setBusy("preview"); setError(null); setDone(0);
    let tot = empty(), cur: RewriteCursor | null = null;
    for (;;) {
      const c: RewriteCursor | null = cur;
      const r: { ok: true; data: RewriteChunk } | Fail = await attempt<RewriteChunk>(() => previewChunkAction(c));
      if (!r.ok) { setError(r.error); break; }
      tot = merge(tot, r.data); setPreview(tot); setDone(tot.scanned);
      if (!r.data.next || stop.current) break;
      cur = r.data.next;
    }
    setBusy(null);
  }

  async function runApply(restart: boolean) {
    stop.current = false; setBusy("apply"); setError(null);
    let tot = empty(), first = true, finished = false;
    setDone(restart ? 0 : resume?.scanned ?? 0);
    for (;;) {
      const again = restart && first;
      const r = await attempt(() => applyChunkAction(again));
      first = false;
      if (!r.ok) { setError(r.error); break; }
      tot = merge(tot, r.data); setApplied(tot);
      setDone(r.data.progress?.scanned ?? total);
      if (!r.data.next) { finished = true; break; }
      if (stop.current) break;
    }
    if (finished) {
      const matched = Object.values(tot.counts).reduce((a, c) => a + (c?.matched ?? 0), 0);
      await finishApplyAction({ changed: tot.changed, matched, scanned: tot.scanned, counts: tot.counts }).catch(() => null);
    }
    setBusy(null);
    router.refresh();
  }

  if (!files.length) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="no-manifests">{t("No rewrite files yet: the folder data/questions/option-rewrites is missing or has no .json files.")}</p>;
  const pct = total ? Math.min(100, Math.round((100 * done) / total)) : 0;
  const shown = applied ?? preview;
  return (
    <div className="space-y-3" data-testid="rewrite-runner">
      <p className="text-sm text-slate-700">{t("{n} files · {m} questions to rewrite", { n: files.length, m: entries })}</p>
      {problems.length > 0 && <ul className="list-disc ps-5 text-xs text-amber-800">{problems.map((p) => <li key={p} dir="ltr">{p}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void runPreview()} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{t("Preview")}</button>
        <button type="button" disabled={busy !== null || !preview} onClick={() => void runApply(true)} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white disabled:opacity-50" title={preview ? undefined : t("Preview first")}>{t("Apply")}</button>
        {resume && busy === null && <button type="button" onClick={() => void runApply(false)} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Continue the stopped update")}</button>}
        {busy && <button type="button" onClick={() => { stop.current = true; }} className="rounded-xl bg-white px-4 py-2 font-semibold text-red-700 ring-1 ring-red-200">{t("Stop")}</button>}
      </div>
      {busy && <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>}
      {busy && <p className="text-xs text-slate-600" role="status">{busy === "preview" ? t("Checking…") : t("Updating…")} {pct}%</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{t(error)}</p>}
      {shown && (
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200" data-testid={applied ? "apply-result" : "preview-result"}>
          <p className="mb-2 text-sm font-semibold text-brand-navy">{applied ? t("Changed: {n} answer choices", { n: applied.changed }) : t("Preview — nothing has been changed yet")}</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-600"><tr><th className="py-1 text-start">{t("Source")}</th><th className="text-end">{t("Matched")}</th><th className="text-end">{t("To change")}</th><th className="text-end">{t("Already up to date")}</th><th className="text-end">{t("Not found")}</th></tr></thead>
            <tbody>
              {(Object.entries(shown.counts) as [RewriteSource, SourceCounts][]).map(([k, c]) => (
                <tr key={k} className="border-t border-slate-100 tabular-nums"><td className="py-1">{t(LABEL[k])}</td><td className="text-end">{c.matched}</td><td className="text-end">{c.toChange}</td><td className="text-end">{c.upToDate}</td><td className="text-end">{c.notFound}</td></tr>
              ))}
            </tbody>
          </table>
          {!busy && !applied && <p className="mt-2 text-xs text-slate-600">{t("Questions in the files not found in the database: {n}", { n: Math.max(0, entries - shown.entries.size) })}</p>}
          {shown.examples.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm" data-testid="rewrite-examples">
              {shown.examples.map((x, i) => (
                <li key={`${x.id}-${i}`} className="rounded-lg bg-slate-50 p-2" dir="ltr">
                  <p className="text-xs text-slate-500">{t(LABEL[x.source])} · {x.stem.slice(0, 140)}</p>
                  <p><span className="text-red-700 line-through">{x.old}</span> → <span className="text-emerald-800">{x.new}</span></p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
