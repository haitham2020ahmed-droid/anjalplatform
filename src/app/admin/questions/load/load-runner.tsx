"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { checkChunkAction, finishLoadAction, loadChunkAction, startLoadAction, stopLoadAction } from "./actions";

export interface RunnerPack {
  key: string; title: string; hint: string; file: string; present: boolean; applies: boolean;
  questions: number; inBank: number; left: number; done: number; total: number; finished: boolean; added: number; errors: string[];
}
export interface RunnerSummary { at: string; byName: string; added: number; created: number; checked: number; hidden: number; stillUnder25: number; errors: number }

type Live = Record<string, { done: number; total: number; added: number }>;

/**
 * 📥 Load / Load everything: one short request per chunk, in a loop, with a progress bar; Stop keeps the progress
 * (Load goes on from there). At the end the Question Check runs (in parts too) and a summary is shown.
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
  const [summary, setSummary] = useState<RunnerSummary | null>(last);

  const usable = packs.filter((p) => p.present && p.applies);
  const todo = usable.filter((p) => !p.finished || p.left > 0);

  async function go(keys: string[]) {
    if (!keys.length || busy) return;
    stop.current = false;
    setErrors([]); setMessage(null); setCheck(null);
    setBusy(keys[0]);
    const st = await startLoadAction();
    if (!st.ok) { setMessage(t(st.error)); setBusy(null); return; }
    const token = st.data.token;
    const ran: string[] = [];
    const halt = async (msg: string | null) => { await stopLoadAction(token); setMessage(msg); setBusy(null); router.refresh(); };
    for (const key of keys) {
      setBusy(key);
      let first = true;
      for (;;) {
        if (stop.current) return halt(t("Stopped. Press Load to go on from here."));
        const r = await loadChunkAction(token, key, first);
        first = false;
        if (!r.ok) return halt(t(r.error));
        setLive((x) => ({ ...x, [key]: { done: r.data.done, total: r.data.total, added: r.data.added } }));
        if (r.data.errors.length) setErrors((x) => [...x, ...r.data.errors].slice(-20));
        if (r.data.finished) break;
      }
      ran.push(key);
    }
    setBusy("check");
    for (;;) {
      if (stop.current) return halt(t("Stopped. Press Load to go on from here."));
      const c = await checkChunkAction(token);
      if (!c.ok) return halt(t(c.error));
      setCheck({ checked: c.data.checked, hidden: c.data.hidden });
      if (c.data.finished) break;
    }
    const f = await finishLoadAction(token, ran);
    if (!f.ok) return halt(t(f.error));
    setSummary(f.data);
    setBusy(null);
    router.refresh();
  }

  const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const blocked = Boolean(busy) || Boolean(running);
  return (
    <div className="space-y-4">
      {running && !busy && <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("A load is already running ({name}). Wait until it ends, or try again in a minute.", { name: running })}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={blocked || !todo.length} onClick={() => go(todo.map((p) => p.key))} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}>⬇️ {t("Load everything")}</button>
        {busy && <button type="button" onClick={() => { stop.current = true; }} className={`${btn} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50`}>⏹ {t("Stop")}</button>}
        {!todo.length && !busy && <span className="text-sm text-emerald-700">✅ {t("Everything is loaded.")}</span>}
        {busy && <span role="status" className="text-sm text-slate-600">{busy === "check" ? t("Question Check: {n} questions checked…", { n: check?.checked ?? 0 }) : t("Loading… you can keep using the platform in another tab.")}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">{t("Question pack")}</th><th className="p-3">{t("Already in")}</th><th className="p-3">{t("Left")}</th><th className="p-3">{t("Progress")}</th><th className="p-3"><span className="sr-only">{t("Load")}</span></th></tr></thead>
          <tbody>
            {packs.map((p) => {
              const l = live[p.key];
              const done = l?.done ?? p.done, total = l?.total ?? p.total;
              const pct = total ? Math.round((100 * done) / total) : 0;
              const on = busy === p.key;
              return (
                <tr key={p.key} className={`border-b align-top last:border-0 ${on ? "bg-teal-50/60" : ""}`}>
                  <td className="p-3"><b className="text-brand-navy">{t(p.title)}</b><span className="block text-xs text-slate-500">{t(p.hint)}</span></td>
                  {!p.present ? <td colSpan={3} className="p-3 text-slate-500">{t("Not on the server yet (it will be added later).")}</td>
                    : !p.applies ? <td colSpan={3} className="p-3 text-slate-500">{t("Not for this school (no matching skills or grades).")}</td> : (
                    <>
                      <td className="p-3 tabular-nums" dir="ltr">{p.inBank} / {p.questions}</td>
                      <td className="p-3 tabular-nums" dir="ltr">{p.left}</td>
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
                    {p.present && p.applies && <button type="button" disabled={blocked} onClick={() => go([p.key])} className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`}>{done > 0 && done < total && !p.finished ? t("Resume") : t("Load")}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message && <p role="alert" className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">{message}</p>}
      {errors.length > 0 && (
        <details className="rounded-2xl bg-white p-4 text-sm ring-1 ring-amber-300" open>
          <summary className="cursor-pointer font-semibold text-amber-900">{t("{n} questions could not be added", { n: errors.length })}</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-slate-700" dir="ltr">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
      {summary && !busy && (
        <section aria-label={t("Last load")} className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200">
          <h2 className="font-semibold">✅ {t("Last load")} · <span dir="ltr">{summary.at.slice(0, 16).replace("T", " ")}</span>{summary.byName ? <> · <bdi>{summary.byName}</bdi></> : null}</h2>
          <p className="mt-1">{t("{n} questions added · {k} skills created", { n: summary.added, k: summary.created })}</p>
          <p>{t("Question Check: {n} questions checked, {h} hidden from students (waiting for review)", { n: summary.checked, h: summary.hidden })}</p>
          <p>{t("Skills still under 25 questions: {n}", { n: summary.stillUnder25 })}</p>
        </section>
      )}
    </div>
  );
}
