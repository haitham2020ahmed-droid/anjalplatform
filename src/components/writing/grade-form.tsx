"use client";
import React, { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { findQuote } from "@/server/writing/rich-text";
import type { AiConfidence, AiSuggestion } from "@/server/writing/locked";

interface Level { label: string; points: number; description: string }
interface Criterion { key: string; title: string; description: string; levels: Level[] }

const CONF: Record<AiConfidence, { label: string; cls: string }> = {
  high: { label: "High confidence", cls: "bg-emerald-100 text-emerald-900" },
  medium: { label: "Medium confidence", cls: "bg-sky-100 text-sky-900" },
  low: { label: "Low confidence", cls: "bg-amber-100 text-amber-900" },
};
const topOf = (c: Criterion) => c.levels.reduce((best, l, i) => (l.points > c.levels[best].points ? i : best), 0);

/**
 * 🧮 The grading form: the essay (tap a sentence to comment on it) beside the rubric (a level per criterion; the total
 * is added up as you choose). The AI's suggestion, if asked for, is shown to the teacher only, next to each criterion
 * (suggested level, justification, evidence quotes that light up in the essay, what the next level needs, confidence);
 * nothing is filled in until the teacher clicks “Use AI suggestion”, “Use all” or “Use feedback”.
 * “Save” keeps it private; “Approve & Return” shows it to the student.
 */
export function GradeForm({ action, taskId, studentId, criteria, sentences, levels, comment, notes, ai, canGrade, returned, essayFooter }: {
  action: (f: FormData) => Promise<void>; taskId: string; studentId: string; criteria: Criterion[]; sentences: string[];
  levels: Record<string, number>; comment: string; notes: { index: number; comment: string }[]; ai: AiSuggestion | null; canGrade: boolean; returned: boolean; essayFooter?: ReactNode;
}) {
  const t = useT();
  const [chosen, setChosen] = useState<Record<string, number>>(levels);
  const [text, setText] = useState(comment);
  const [comments, setComments] = useState<Map<number, string>>(() => new Map(notes.map((n) => [n.index, n.comment])));
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [hl, setHl] = useState<string | null>(null);
  const max = criteria.reduce((a, c) => a + Math.max(0, ...c.levels.map((l) => l.points)), 0);
  const total = criteria.reduce((a, c) => a + (chosen[c.key] !== undefined ? c.levels[chosen[c.key]]?.points ?? 0 : 0), 0);
  const missing = criteria.filter((c) => chosen[c.key] === undefined).length;
  const json = useMemo(() => JSON.stringify([...comments].map(([index, c]) => ({ index, comment: c }))), [comments]);
  // the sentences joined (as shown) with their offsets, to light up an evidence quote
  const offsets = useMemo(() => { let at = 0; return sentences.map((x) => { const o = at; at += x.length + 1; return o; }); }, [sentences]);
  const span = useMemo(() => (hl ? findQuote(sentences.join(" "), hl) : null), [hl, sentences]);
  const pick = (i: number) => { setSel(i); setDraft(comments.get(i) ?? ""); };
  const keep = () => { if (sel === null) return; setComments((m) => { const n = new Map(m); if (draft.trim()) n.set(sel, draft.trim()); else n.delete(sel); return n; }); setSel(null); };
  const aiFor = (k: string) => ai?.criteria[k];
  const useAi = (k: string) => { const s = aiFor(k); if (s) setChosen((x) => ({ ...x, [k]: s.level })); };
  const useAll = () => setChosen((x) => ({ ...x, ...Object.fromEntries(criteria.filter((c) => aiFor(c.key)).map((c) => [c.key, aiFor(c.key)!.level])) }));
  const allUsed = criteria.every((c) => !aiFor(c.key) || chosen[c.key] === aiFor(c.key)!.level);
  const useFeedback = () => { if (!ai?.feedback) return; if (text.trim() && text.trim() !== ai.feedback && !window.confirm(t("Replace your comment with the AI's suggested feedback?"))) return; setText(ai.feedback); };
  const btn = "inline-flex min-h-11 items-center justify-center rounded-xl px-5 font-semibold";
  const aiBtn = "inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold";

  const sentence = (s: string, i: number) => {
    const a = offsets[i], b = a + s.length;
    if (!span || span[1] <= a || span[0] >= b) return s;
    const from = Math.max(0, span[0] - a), to = Math.min(s.length, span[1] - a);
    return <>{s.slice(0, from)}<mark data-quote-hl="" className="rounded bg-yellow-200 px-0.5 text-slate-900">{s.slice(from, to)}</mark>{s.slice(to)}</>;
  };
  const showQuote = (q: string) => {
    const on = hl !== q;
    setHl(on ? q : null);
    if (on) requestAnimationFrame(() => document.querySelector("[data-quote-hl]")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="sentences" value={json} />

      <section className="space-y-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-navy">{t("Essay")}</h2>
            {hl && <button type="button" onClick={() => setHl(null)} className="text-xs font-semibold text-slate-600 underline">{span ? t("Clear highlight") : t("Quote not found in the essay")}</button>}
          </div>
          <p className="text-xs text-slate-500">{canGrade ? t("Tap a sentence to comment on it.") : null}</p>
          <p className="mt-2 max-h-[70vh] overflow-y-auto text-lg leading-relaxed text-slate-900" lang="en">
            {sentences.length ? sentences.map((s, i) => (
              <button type="button" key={i} disabled={!canGrade} onClick={() => pick(i)}
                className={`inline rounded px-0.5 text-start ${sel === i ? "bg-sky-200" : comments.has(i) ? "bg-amber-100 underline decoration-amber-500 decoration-2" : "hover:bg-slate-100"}`}>{sentence(s, i)} </button>
            )) : <span className="text-slate-500">—</span>}
          </p>
          {sel !== null && (
            <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
              <p className="text-sm"><i>“{sentences[sel]}”</i></p>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder={t("Your comment on this sentence")} autoFocus />
              <div className="mt-1 flex gap-2"><button type="button" onClick={keep} className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white">{t("Keep comment")}</button><button type="button" onClick={() => setSel(null)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-sky-900 ring-1 ring-sky-300">{t("Cancel")}</button></div>
            </div>
          )}
          {comments.size > 0 && (
            <ol className="mt-3 space-y-1 text-sm">{[...comments].sort((a, b) => a[0] - b[0]).map(([i, c]) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1">
                <span><i>“{sentences[i]}”</i> — {c}</span>
                {canGrade && <button type="button" onClick={() => setComments((m) => { const n = new Map(m); n.delete(i); return n; })} className="shrink-0 text-xs font-semibold text-red-700">{t("Remove")}</button>}
              </li>
            ))}</ol>
          )}
        </div>
        {essayFooter}
      </section>

      <section className="space-y-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-navy">{t("Rubric")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {ai && canGrade && <button type="button" onClick={useAll} disabled={allUsed} className={`${aiBtn} bg-violet-700 text-white disabled:bg-violet-200 disabled:text-violet-900`}>🤖 {allUsed ? `✓ ${t("All AI suggestions used")}` : t("Use all AI suggestions")}</button>}
              <p dir="ltr" className="rounded-full bg-brand-navy px-3 py-1 text-sm font-semibold tabular-nums text-white">{total} / {max}{max ? ` · ${Math.round((100 * total) / max)}%` : ""}</p>
            </div>
          </div>
          {criteria.map((c) => {
            const s = aiFor(c.key);
            const evidence = s ? (s.evidence ?? (s.quote ? [s.quote] : [])) : [];
            const label = (i: number) => c.levels[i]?.label ?? "";
            const conf = s?.confidence ? CONF[s.confidence] : null;
            return (
              <fieldset key={c.key} className="mt-3 border-t border-slate-100 pt-3" disabled={!canGrade}>
                <legend className="font-semibold">{c.title}{c.description && <span className="block text-xs font-normal text-slate-500">{c.description}</span>}</legend>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">{c.levels.map((l, i) => {
                  const isAi = s?.level === i;
                  return (
                    <label key={i} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-xl p-2 text-sm ${chosen[c.key] === i ? "bg-teal-50 ring-2 ring-brand-teal" : isAi ? "bg-violet-50 ring-2 ring-violet-400" : "bg-white ring-1 ring-slate-200"}`}>
                      <input type="radio" name={`level.${c.key}`} value={i} checked={chosen[c.key] === i} onChange={() => setChosen((x) => ({ ...x, [c.key]: i }))} className="mt-1" />
                      <span><b>{l.label}</b> <span className="text-slate-500">· {t("{n} pts", { n: l.points })}</span>{isAi && <span className="ms-1 rounded bg-violet-600 px-1.5 text-xs font-semibold text-white">🤖 {t("AI suggestion")}</span>}{l.description && <span className="block text-xs text-slate-600">{l.description}</span>}</span>
                    </label>
                  );
                })}</div>
                {s && (
                  <div className="mt-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-950 ring-1 ring-violet-200">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">🤖 {label(s.level)} · {t("{n} pts", { n: s.points })}</span>
                      {s.unsure ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("AI unsure between {a} and {b}", { a: label(s.unsure[0]), b: label(s.unsure[1]) })}</span>
                        : conf && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conf.cls}`}>{t(conf.label)}</span>}
                      {s.unsure && conf && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conf.cls}`}>{t(conf.label)}</span>}
                      {s.capped && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("Limited: the essay is far too short")}</span>}
                      {canGrade && (chosen[c.key] === s.level
                        ? <span className="ms-auto text-xs font-semibold text-emerald-800">✓ {t("Using the AI suggestion")}</span>
                        : <button type="button" onClick={() => useAi(c.key)} className={`${aiBtn} ms-auto bg-white text-violet-900 ring-1 ring-violet-300 hover:bg-violet-100`}>{t("Use AI suggestion")}</button>)}
                    </div>
                    <p className="mt-1">{s.justification}</p>
                    {evidence.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold">{t("Evidence (tap to see it in the essay)")}</p>
                        <div className="mt-1 flex flex-wrap gap-1">{evidence.map((q, k) => (
                          <button type="button" key={k} onClick={() => showQuote(q)} aria-pressed={hl === q}
                            className={`rounded-lg px-2 py-1 text-start text-xs italic ring-1 ${hl === q ? "bg-yellow-200 ring-yellow-400" : "bg-white ring-violet-200 hover:bg-yellow-50"}`}>“{q}”</button>
                        ))}</div>
                      </div>
                    )}
                    {s.toNext ? <p className="mt-2 text-xs"><b>{t("To reach the next level:")}</b> {s.toNext}</p>
                      : s.level === topOf(c) ? <p className="mt-2 text-xs text-violet-800">{t("Top level of this criterion.")}</p> : null}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        {ai && (
          <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-950 ring-1 ring-violet-200">
            <h2 className="font-semibold">🤖 {t("AI suggestion (for you only)")}</h2>
            {ai.runs === 2 && <p className="mt-1 text-xs">{ai.unsure?.length ? t("Read twice for consistency: the two readings disagreed on {n} criteria (the lower level is suggested).", { n: ai.unsure.length }) : t("Read twice for consistency: both readings agreed.")}</p>}
            {ai.runs === 1 && <p className="mt-1 text-xs">{t("Read once (the second reading did not work).")}</p>}
            {!!ai.strengths?.length && <><p className="mt-2 font-semibold">{t("Strengths")}</p><ul className="ms-5 list-disc">{ai.strengths.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
            {!!ai.nextSteps?.length && <><p className="mt-2 font-semibold">{t("Next steps")}</p><ol className="ms-5 list-decimal">{ai.nextSteps.map((x, k) => <li key={k}>{x}</li>)}</ol></>}
            {ai.teacherNote && <p className="mt-2 rounded-lg bg-white px-2 py-1 ring-1 ring-violet-200"><b>{t("Note for you:")}</b> {ai.teacherNote}</p>}
            {ai.feedback && (
              <div className="mt-2">
                <p className="font-semibold">{t("Suggested feedback for the student")}</p>
                <blockquote className="mt-1 rounded-lg bg-white px-3 py-2 ring-1 ring-violet-200" lang="en">{ai.feedback}</blockquote>
                {canGrade && (text.trim() === ai.feedback
                  ? <p className="mt-1 text-xs font-semibold text-emerald-800">✓ {t("In your comment box")}</p>
                  : <button type="button" onClick={useFeedback} className={`${aiBtn} mt-2 bg-violet-700 text-white`}>{t("Use feedback")}</button>)}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <label className="block font-semibold text-brand-navy">{t("Overall comment")}
            <textarea name="comment" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={3000} disabled={!canGrade} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          {canGrade && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button name="approve" value="0" className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300`}>{t("Save")}</button>
              <button name="approve" value="1" disabled={missing > 0} className={`${btn} bg-emerald-600 text-white disabled:opacity-50`}>✓ {returned ? t("Approve & Return again") : t("Approve & Return")}</button>
              {missing > 0 && <span className="text-xs text-slate-500">{t("Choose a level for every criterion to return it.")}</span>}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">{t("The student sees nothing until you approve and return it. AI suggestions are never shown to the student.")}</p>
        </div>
      </section>
    </form>
  );
}
