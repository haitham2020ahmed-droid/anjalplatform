"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY } from "@/components/ui-kit/tokens";
import { publishDraftBatchAction } from "./actions";

/** 📢 Publish every draft question that has a skill and a correct answer, in small batches with progress. */
export function PublishDrafts({ total }: { total: number }) {
  const t = useT();
  const [state, setState] = useState<{ running: boolean; published: number; skipped: number; done: boolean; error?: string }>({ running: false, published: 0, skipped: 0, done: false });
  const run = async () => {
    if (!window.confirm(t("Publish {n} draft questions? Students will be able to get them in practice.", { n: total }))) return;
    let after: string | null = null, published = 0, skipped = 0;
    setState({ running: true, published, skipped, done: false });
    for (let guard = 0; guard < 1000; guard++) {
      const r = await publishDraftBatchAction(after);
      if ("error" in r) { setState({ running: false, published, skipped, done: false, error: r.error }); return; }
      published += r.published; skipped += r.skipped;
      setState({ running: true, published, skipped, done: false });
      if (r.done || !r.next) break;
      after = r.next;
    }
    setState({ running: false, published, skipped, done: true });
  };
  const pct = total ? Math.min(100, Math.round(((state.published + state.skipped) / total) * 100)) : 100;
  return (
    <div className="mt-3">
      {!state.done && <button type="button" onClick={run} disabled={state.running} className={BTN_PRIMARY}>{t(state.running ? "Publishing…" : "Publish all drafts")}</button>}
      {(state.running || state.done) && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>}
      {state.done && <p className="mt-2 text-sm text-emerald-800" role="status">{t("Published {n} questions. {m} stay drafts (no skill or no correct answer).", { n: state.published, m: state.skipped })}</p>}
      {state.error && <p className="mt-2 text-sm text-red-700" role="alert">{state.error}</p>}
    </div>
  );
}
