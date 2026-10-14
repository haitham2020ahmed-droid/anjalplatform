"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { checkChunkAction, finishLoadAction, loadChunkAction, startLoadAction, stopLoadAction } from "./actions";
import { LineIcon } from "@/components/ui/line-icon";

export interface RunnerPack {
  key: string; title: string; hint: string; file: string; present: boolean;
  done: number; total: number; finished: boolean; added: number; errors: string[];
}
export interface RunnerSummary { at: string; byName: string; added: number; created: number; checked: number; hidden: number; stillUnder25: number; errors: number }

interface PackCount { questions: number; inBank: number; left: number; units: number; applies: boolean }
type Count = { state: "counting" } | { state: "ok"; count: PackCount | null } | { state: "error"; error: string; what: string };
type Live = Record<string, { done: number; total: number; added: number }>;
type Fail = { ok: false; error: string; what?: string; retry?: boolean };

/** pauses before trying a failed chunk again (a passing database / network problem); then the pack is skipped */
const BACKOFF_MS = [2_000, 5_000, 12_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 📥 Load / Load everything: one short request per chunk, in a loop, with a progress bar; Stop keeps the progress
 * (Load goes on from there). A failed chunk is tried again after a pause (2 s, 5 s, 12 s); a pack that still fails is
 * skipped and "Load everything" goes on with the next one (reported at the end). Then the Question Check (in parts).
 * Each pack's "already in / left" is asked for after the page opened, every pack at the same time.
 */
export function LoadRunner({ packs, running, last }: { packs: RunnerPack[]; running: string | null; last: RunnerSummary | null }) {
  const t = useT();
  const router = useRouter();
  const stop = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<Live>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [check, setCheck] = useState<{ checked: number; hidden: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<{ key: string; n: number } | null>(null);
  const [failed, setFailed] = useState<{ title: string; error: string }[]>([]);
  const [summary, setSummary] = useState<RunnerSummary | null>(last);
  const [counts, setCounts] = useState<Record<string, Count>>(() => Object.fromEntries(packs.filter((p) => p.present).map((p) => [p.key, { state: "counting" } as Count])));

  const say = useCallback((r: { error: string; what?: string }) => {
    const text = t(r.error, { what: r.what ?? "" });
    return r.what && !r.error.includes("{what}") ? `${text} (${r.what})` : text;
  }, [t]);

  /** every pack's count at the same time (one small request each); a failing pack only marks its own row */
  const recount = useCallback((keys: string[]) => {
    setCounts((c) => ({ ...c, ...Object.fromEntries(keys.map((k) => [k, { state: "counting" } as Count])) }));
    for (const key of keys) {
      void (async () => {
        let next: Count;
        try {
          const r = await fetch(`/api/admin/question-packs/count?pack=${encodeURIComponent(key)}`, { cache: "no-store" });
          const j = (await r.json()) as { ok: boolean; count?: PackCount | null; error?: string; what?: string };
          next = j.ok ? { state: "ok", count: j.count ?? null } : { state: "error", error: j.error ?? "This pack could not be counted.", what: j.what ?? "" };
        } catch { next = { state: "error", error: "This pack could not be counted.", what: "" }; }
        setCounts((c) => ({ ...c, [key]: next }));
      })();
    }
  }, []);
  const presentKeys = packs.filter((p) => p.present).map((p) => p.key).join(",");
  useEffect(() => { if (presentKeys) recount(presentKeys.split(",")); }, [presentKeys, recount]);

  const countOf = (key: string): PackCount | null => { const c = counts[key]; return c?.state === "ok" ? c.count : null; };
  const counting = Object.values(counts).some((c) => c.state === "counting");
  const usable = packs.filter((p) => p.present && countOf(p.key)?.applies);
  const todo = usable.filter((p) => !p.finished || (countOf(p.key)?.left ?? 0) > 0);

  /** one request, tried again after a pause while the problem may pass; a network failure counts as such */
  async function attempt<T>(key: string, fn: () => Promise<{ ok: true; data: T } | Fail>): Promise<{ ok: true; data: T } | Fail> {
    for (let i = 0; ; i++) {
      let r: { ok: true; data: T } | Fail;
      try { r = await fn(); } catch { r = { ok: false, error: "The connection to the server was lost.", retry: true }; }
      if (r.ok || !r.retry || i >= BACKOFF_MS.length || stop.current) { setRetrying(null); return r; }
      setRetrying({ key, n: i + 1 });
      await sleep(BACKOFF_MS[i]);
    }
  }

  async function go(keys: string[]) {
    if (!keys.length || busy) return;
    stop.current = false;
    setErrors([]); setMessage(null); setCheck(null); setFailed([]);
    setBusy(keys[0]);
    const st = await startLoadAction().catch(() => ({ ok: false as const, error: "The connection to the server was lost." }));
    if (!st.ok) { setMessage(say(st)); setBusy(null); return; }
    const token = st.data.token;
    const ran: string[] = [];
    const bad: { title: string; error: string }[] = [];
    const halt = async (msg: string | null) => { await stopLoadAction(token).catch(() => null); setMessage(msg); setFailed(bad); setBusy(null); setRetrying(null); router.refresh(); recount(keys); };
    for (const key of keys) {
      setBusy(key);
      let first = true;
      for (;;) {
        if (stop.current) return halt(t("Stopped. Press Load to go on from here."));
        const restart = first;
        const r = await attempt(key, () => loadChunkAction(token, key, restart));
        if (!r.ok) {
          // the load was stopped / taken over, or no rights: nothing else can go on
          if (!r.retry && !r.what) return halt(say(r));
          // this pack keeps failing (or the database lacks a table): skip it, go on with the next pack
          bad.push({ title: packs.find((p) => p.key === key)?.title ?? key, error: say(r) });
          break;
        }
        first = false;
        setLive((x) => ({ ...x, [key]: { done: r.data.done, total: r.data.total, added: r.data.added } }));
        if (r.data.errors.length) setErrors((x) => [...x, ...r.data.errors].slice(-20));
        if (r.data.finished) { ran.push(key); break; }
      }
    }
    if (!ran.length) return halt(null);
    setBusy("check");
    for (;;) {
      if (stop.current) return halt(t("Stopped. Press Load to go on from here."));
      const c = await attempt("check", () => checkChunkAction(token));
      if (!c.ok) return halt(say(c));
      setCheck({ checked: c.data.checked, hidden: c.data.hidden });
      if (c.data.finished) break;
    }
    const f = await attempt("finish", () => finishLoadAction(token, ran));
    if (!f.ok) return halt(say(f));
    setSummary(f.data);
    setFailed(bad);
    setBusy(null);
    router.refresh();
    recount(keys);
  }

  const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const blocked = Boolean(busy) || Boolean(running);
  return (
    <div className="space-y-4">
      {running && !busy && <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("A load is already running ({name}). Wait until it ends, or try again in a minute.", { name: running })}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={blocked || counting || !todo.length} onClick={() => go(todo.map((p) => p.key))} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}><LineIcon name="download" className="me-1 inline-block h-4 w-4 align-[-3px]" />{t("Load everything")}</button>
        {busy && <button type="button" onClick={() => { stop.current = true; }} className={`${btn} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50`}>⏹ {t("Stop")}</button>}
        {!todo.length && !busy && !counting && usable.length > 0 && <span className="text-sm text-emerald-700"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />{t("Everything is loaded.")}</span>}
        {counting && !busy && <span role="status" className="text-sm text-slate-500">{t("Counting…")}</span>}
        {busy && <span role="status" className="text-sm text-slate-600">{busy === "check" ? t("Question Check: {n} questions checked…", { n: check?.checked ?? 0 }) : t("Loading… you can keep using the platform in another tab.")}</span>}
        {retrying && <span role="status" className="text-sm text-amber-800">{t("A part did not answer; trying again ({n} of {max})…", { n: retrying.n, max: BACKOFF_MS.length })}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">{t("Question pack")}</th><th className="p-3">{t("Already in")}</th><th className="p-3">{t("Left")}</th><th className="p-3">{t("Progress")}</th><th className="p-3"><span className="sr-only">{t("Load")}</span></th></tr></thead>
          <tbody>
            {packs.map((p) => {
              const l = live[p.key];
              const c = counts[p.key];
              const n = c?.state === "ok" ? c.count : null;
              const done = l?.done ?? p.done, total = l?.total ?? (p.total || n?.units || 0);
              const pct = total ? Math.round((100 * done) / total) : 0;
              const on = busy === p.key;
              return (
                <tr key={p.key} className={`border-b align-top last:border-0 ${on ? "bg-teal-50/60" : ""}`}>
                  <td className="p-3"><b className="text-brand-navy">{t(p.title)}</b><span className="block text-xs text-slate-500">{t(p.hint)}</span></td>
                  {!p.present ? <td colSpan={3} className="p-3 text-slate-500">{t("Not on the server yet (it will be added later).")}</td>
                    : !c || c.state === "counting" ? <td colSpan={3} className="p-3"><span className="inline-block h-2.5 w-32 animate-pulse rounded-full bg-slate-200 align-middle" aria-hidden="true" /> <span className="text-xs text-slate-500">{t("Counting…")}</span></td>
                    : c.state === "error" ? (
                      <td colSpan={3} className="p-3">
                        <p role="alert" className="text-sm text-red-800">{say(c)}</p>
                        <button type="button" disabled={Boolean(busy)} onClick={() => recount([p.key])} className="mt-1 text-xs font-semibold text-brand-navy underline disabled:opacity-50">{t("Count again")}</button>
                      </td>
                    ) : !n?.applies ? <td colSpan={3} className="p-3 text-slate-500">{t("Not for this school (no matching skills or grades).")}</td> : (
                    <>
                      <td className="p-3 tabular-nums" dir="ltr">{n.inBank} / {n.questions}</td>
                      <td className="p-3 tabular-nums" dir="ltr">{n.left}</td>
                      <td className="min-w-[10rem] p-3">
                        {total > 0 ? (
                          <>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={t(p.title)} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><div className="h-full bg-brand-teal transition-all" style={{ width: `${pct}%` }} /></div>
                            <span className="mt-1 block text-xs text-slate-600">{t("{done} of {total} parts · {n} questions added", { done, total, n: l?.added ?? p.added })}</span>
                          </>
                        ) : <span className="text-xs text-slate-500">{t("Not started")}</span>}
                      </td>
                    </>
                  )}
                  <td className="p-3 text-right">
                    {p.present && n?.applies && <button type="button" disabled={blocked} onClick={() => go([p.key])} className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`}>{done > 0 && done < total && !p.finished ? t("Resume") : t("Load")}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message && <p role="alert" className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">{message}</p>}
      {failed.length > 0 && !busy && (
        <section role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          <h2 className="font-semibold">{t("{n} packs could not be loaded (the others went on):", { n: failed.length })}</h2>
          <ul className="mt-2 list-disc space-y-1 ps-5">{failed.map((f, i) => <li key={i}><b>{t(f.title)}</b>: {f.error}</li>)}</ul>
        </section>
      )}
      {errors.length > 0 && (
        <details className="rounded-2xl bg-white p-4 text-sm ring-1 ring-amber-300" open>
          <summary className="cursor-pointer font-semibold text-amber-900">{t("{n} questions could not be added", { n: errors.length })}</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-slate-700" dir="ltr">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
      {summary && !busy && (
        <section aria-label={t("Last load")} className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200">
          <h2 className="font-semibold"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />{t("Last load")} · <span dir="ltr">{summary.at.slice(0, 16).replace("T", " ")}</span>{summary.byName ? <> · <bdi>{summary.byName}</bdi></> : null}</h2>
          <p className="mt-1">{t("{n} questions added · {k} skills created", { n: summary.added, k: summary.created })}</p>
          <p>{t("Question Check: {n} questions checked, {h} hidden from students (waiting for review)", { n: summary.checked, h: summary.hidden })}</p>
          <p>{t("Skills still under 25 questions: {n}", { n: summary.stillUnder25 })}</p>
        </section>
      )}
    </div>
  );
}
