"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { libraryChunkAction as stretchChunkAction } from "../actions";

const BACKOFF_MS = [2_000, 5_000, 12_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY = "readrise.librarySync.next";

/**
 * 🔄 round 7: "Update articles from files" — re-imports the article files into the platform library (new articles,
 * corrected questions / explanations / stretch sets), one short chunk per request with a progress bar. Stop keeps
 * the place (in this browser); Continue goes on from there. Running it again changes nothing that is already up to date.
 */
export function LibrarySync() {
  const t = useT();
  const router = useRouter();
  const stop = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [added, setAdded] = useState<{ questions: number; articles: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const saved = (): number => { try { return Math.max(0, Number(window.localStorage.getItem(KEY)) || 0); } catch { return 0; } };
  const save = (n: number | null) => { try { if (n === null) window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, String(n)); } catch { /* storage blocked */ } };

  async function run(from: number) {
    stop.current = false; setBusy(true); setError(null); setProblems([]);
    let at = from, q = 0, a = 0;
    for (;;) {
      let r: Awaited<ReturnType<typeof stretchChunkAction>> | null = null;
      for (let i = 0; ; i++) {
        try { r = await stretchChunkAction(at); } catch { r = { ok: false, error: "The connection to the server was lost." }; }
        if (r.ok || i >= BACKOFF_MS.length || stop.current) break;
        await sleep(BACKOFF_MS[i]);
      }
      if (!r || !r.ok) { setError(r ? r.error : "The connection to the server was lost."); save(at); break; }
      q += r.data.added; a += r.data.articles;
      setAdded({ questions: q, articles: a }); setTotal(r.data.total); setDone(r.data.next ?? r.data.total);
      if (r.data.problems.length) setProblems((p) => [...p, ...r!.data.problems.map((x) => `${x.file}: ${x.problems.slice(0, 2).join("; ")}`)].slice(0, 10));
      if (r.data.next === null) { save(null); break; }
      at = r.data.next; save(at);
      if (stop.current) break;
    }
    setBusy(false);
    router.refresh();
  }

  const pct = total ? Math.min(100, Math.round((100 * done) / total)) : 0;
  return (
    <section data-testid="rr-library-sync" className="mb-5 rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200">
      <h2 className="font-semibold text-brand-navy">🔄 {t("Update articles from files")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("Copies corrected questions, explanations and new articles from the article files into the library. Run it once after an update. Running it again changes nothing that is already up to date.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void run(0)} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("Update articles")}</button>
        {!busy && <button type="button" onClick={() => void run(saved())} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">{t("Continue from where it stopped")}</button>}
        {busy && <button type="button" onClick={() => { stop.current = true; }} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">{t("Stop")}</button>}
      </div>
      {busy && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>}
      {busy && <p className="mt-1 text-xs text-slate-600" role="status">{t("Loading…")} {pct}%</p>}
      {added && !busy && <p className="mt-2 text-sm text-emerald-800" role="status">{t("Done: {a} articles checked and updated ({q} new).", { q: added.questions, a: added.articles })}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{t(error)}</p>}
      {problems.length > 0 && <ul className="mt-2 list-disc ps-5 text-xs text-amber-800">{problems.map((p) => <li key={p} dir="ltr">{p}</li>)}</ul>}
    </section>
  );
}
