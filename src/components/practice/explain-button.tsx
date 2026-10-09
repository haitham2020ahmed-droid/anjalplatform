"use client";
import { useState } from "react";
import { explainAction } from "@/app/explain/actions";
import type { Explanation } from "@/server/ai/explain";

/** 🤖 After a wrong answer: a step-by-step explanation in simple English (AI when the school has it on). */
export function ExplainButton({ questionId }: { questionId: string }) {
  const [busy, setBusy] = useState(false);
  const [ex, setEx] = useState<Explanation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (ex) return (
    <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-3 text-slate-800 ring-1 ring-indigo-200" role="status" aria-live="polite">
      <p className="text-sm font-bold text-indigo-900">🤖 Let me explain</p>
      <p className="mt-1">{ex.text}</p>
      {ex.steps.length > 0 && <ol className="mt-2 list-decimal space-y-0.5 ps-5 text-sm">{ex.steps.map((x) => <li key={x}>{x}</li>)}</ol>}
      {ex.tip && <p className="mt-2 text-sm"><b className="text-brand-purple">Next time: </b>{ex.tip}</p>}
    </div>
  );
  return (
    <div className="mt-4">
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await explainAction(questionId); setBusy(false); if (r.ok) setEx(r.value); else setErr(r.error); }} className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "Thinking…" : "🤖 Explain it to me"}</button>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}
