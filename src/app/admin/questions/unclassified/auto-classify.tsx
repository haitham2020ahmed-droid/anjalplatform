"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { LineIcon } from "@/components/ui/line-icon";
import type { StuckItem } from "@/server/admin/stuck-questions";
import { autoClassifyBatchAction, type AutoBatch } from "./actions";
import { RichInline } from "@/components/rich-inline";

/**
 * 🪄 Auto-classify in batches with a progress bar: by standard → a same-grade skill, by Curriculum Map place → that
 * lesson's skill, by the import file / MAP goal. Ends with how many were classified and how many remain (with reasons).
 */
export function AutoClassify({ total }: { total: number }) {
  const t = useT();
  const router = useRouter();
  const [run, setRun] = useState<{ processed: number; classified: number } | null>(null);
  const [done, setDone] = useState<{ classified: number; remaining: number; left: StuckItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null); setDone(null);
    let after: string | null = null, processed = 0, classified = 0;
    const left: StuckItem[] = [];
    setRun({ processed, classified });
    for (let guard = 0; guard < 2000; guard++) {
      const r: AutoBatch = await autoClassifyBatchAction(after).catch((): AutoBatch => ({ error: t("The server did not answer. Try again.") }));
      if (r.error) { setRun(null); setError(r.error); router.refresh(); return; }
      processed += r.processed ?? 0; classified += r.classified ?? 0;
      if (left.length < 50) left.push(...(r.left ?? []).slice(0, 50 - left.length));
      setRun({ processed, classified });
      if (!r.next) { setRun(null); setDone({ classified, remaining: r.remaining ?? 0, left }); router.refresh(); return; }
      after = r.next;
    }
  }

  const pct = run ? Math.min(100, Math.round((100 * run.processed) / Math.max(1, total))) : 0;
  return (
    <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-amber-950">{t("Auto-classify links each question to a skill of its grade: by its standard, by its Curriculum Map place (that lesson's skill), or by the skill or MAP goal its import named. A guess from the wording is never saved.")}</p>
        <button type="button" disabled={!!run || total === 0} onClick={() => void start()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">
          <LineIcon name="sparkle" className="h-5 w-5" />{run ? t("Classifying…") : t("Auto-classify all")}
        </button>
      </div>
      {run && (
        <div role="status" className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-amber-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="h-full bg-brand-teal transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-sm text-amber-950">{t("Checked {n} of {m} · classified {c}", { n: run.processed, m: total, c: run.classified })}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {done && (
        <div role="status" className="mt-3 rounded-xl bg-white p-3 ring-1 ring-amber-200">
          <p className="font-semibold text-brand-navy">{t("{c} classified · {r} still without a skill", { c: done.classified, r: done.remaining })}</p>
          {done.left.length > 0 && (
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-slate-700">{t("Why some are left")}</summary>
              <ul className="mt-2 space-y-1">{done.left.map((x) => <li key={x.id}><Link href={`/admin/questions/${x.id}`} className="font-medium text-brand-navy underline">{x.stem ? <RichInline text={x.stem} /> : x.id}</Link> <span className="text-slate-600">· {x.reason}</span></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
