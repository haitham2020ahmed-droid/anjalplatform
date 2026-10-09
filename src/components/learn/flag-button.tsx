"use client";
import { useState } from "react";
import { flagQuestionAction } from "@/app/learn-actions";

const REASONS: [string, string][] = [["UNCLEAR", "The question is not clear"], ["WRONG_ANSWER", "I think the answer is wrong"], ["TYPO", "Spelling / typing mistake"], ["PICTURE", "The picture or passage is missing"], ["OTHER", "Something else"]];

/** 🚩 Students tell the school a question is unclear; the admin checks it. */
export function FlagButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("UNCLEAR");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="mt-2 text-xs text-emerald-700">{done}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-slate-500 underline hover:text-brand-navy">🚩 This question is not clear</button>;
  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
      <label className="block font-semibold text-slate-700">What is wrong?
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5">{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Tell us more (optional)" className="mt-2 block w-full rounded-lg border border-slate-300 px-2 py-1.5" />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={async () => { const r = await flagQuestionAction(questionId, reason, note); setDone(r.ok ? "✓ Thank you! Your school will check this question." : r.error); }} className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Send</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">Cancel</button>
      </div>
    </div>
  );
}
