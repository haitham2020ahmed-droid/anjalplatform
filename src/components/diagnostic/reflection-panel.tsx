"use client";
import { useState, useTransition } from "react";
import { draftReflectionAction } from "@/app/diagnostic/actions";

/** 🪞 Findings & Discussion: the five reflection questions, drafted from the analysis; the teacher edits and copies. */
export function ReflectionPanel({ testId, classId }: { testId: string; classId: string | null }) {
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState<{ question: string; answer: string }[] | null>(null);
  const [source, setSource] = useState<"AI" | "PLATFORM" | null>(null);
  const [msg, setMsg] = useState("");
  const draft = () => start(async () => {
    setMsg("");
    const r = await draftReflectionAction(testId, classId);
    if ("error" in r) { setMsg(r.error); return; }
    setAnswers(r.answers); setSource(r.source);
  });
  const copy = async () => {
    const text = (answers ?? []).map((a) => `${a.question}\n${a.answer}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); setMsg("Copied."); } catch { setMsg("Select the text and copy it."); }
  };
  return (
    <section className="mt-6 break-inside-avoid rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-bold text-brand-navy"><span aria-hidden="true">🪞</span>Findings &amp; Discussion</h2>
        <div className="flex gap-2 print:hidden">
          <button onClick={draft} disabled={pending} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Writing…" : answers ? "↻ Draft again" : "✨ Draft my reflection"}</button>
          {answers && <button onClick={copy} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📋 Copy all</button>}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">The five reflection questions of the analysis workbook, drafted from this analysis{source === "AI" ? " (worded by the AI from class numbers only — no names)" : source === "PLATFORM" ? " (by the platform from the numbers)" : ""}. Edit them in your own words.</p>
      {msg && <p role="status" className="mt-2 text-sm text-slate-700">{msg}</p>}
      {answers && (
        <ol className="mt-3 space-y-3">
          {answers.map((a, i) => (
            <li key={i}>
              <label className="block font-semibold text-slate-800" htmlFor={`refl-${i}`}>{i + 1}. {a.question}</label>
              <textarea id={`refl-${i}`} value={a.answer} onChange={(e) => setAnswers((xs) => xs!.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
