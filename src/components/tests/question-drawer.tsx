"use client";
/**
 * 👁 The question drawer (Assessments → New test): one question in full for the teacher — the full passage (title +
 * formatted text) beside the question on wide screens and above it on small ones, every option with the right answer
 * marked, the type's own parts, level, skill and explanation. Light: each question is read only when it is opened
 * (one server call, then kept for the page); ◀ ▶ move through the list it was opened from; "Select" adds it to the
 * test (or takes it out).
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { PassageText } from "@/components/passage-text";
import { questionDetailAction } from "@/server/tests/question-detail-actions";
import type { DetailOption, QuestionDetail } from "@/server/tests/question-detail";
import { RichInline } from "@/components/rich-inline";

const LEVEL_LABEL: Record<string, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
const LEVEL_CHIP: Record<string, string> = { BELOW: "bg-amber-50 text-amber-900 ring-amber-200", ON: "bg-sky-50 text-sky-900 ring-sky-200", ABOVE: "bg-violet-50 text-violet-900 ring-violet-200" };
const MAX_CACHE = 40;
const cache = new Map<string, Promise<{ detail?: QuestionDetail; error?: string }>>();

function load(id: string) {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = questionDetailAction(id).then((r) => { if (r.error) cache.delete(id); return r; }, (e) => { cache.delete(id); throw e; });
  cache.set(id, p);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return p;
}

export interface QuestionDrawerProps {
  /** the list the drawer was opened from (◀ ▶ move through it) */
  ids: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** "Select" (omit both to hide it) */
  isSelected?: (id: string) => boolean;
  onToggle?: (detail: QuestionDetail, on: boolean) => void;
}

export function QuestionDrawer({ ids, index, onIndex, onClose, isSelected, onToggle }: QuestionDrawerProps) {
  const t = useT();
  const id = ids[index];
  const [state, setState] = useState<{ id: string; detail?: QuestionDetail; error?: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    load(id).then((r) => { if (live) setState({ id, ...r }); }, () => { if (live) setState({ id, error: "The question could not be loaded. Please try again." }); });
    return () => { live = false; };
  }, [id]);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && index < ids.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, ids.length, onClose, onIndex]);
  // the next question is read ahead (quietly), so ▶ feels instant
  useEffect(() => { if (state?.id === id && ids[index + 1]) void load(ids[index + 1]).catch(() => undefined); }, [state, id, ids, index]);

  const d = state?.id === id ? state.detail : undefined;
  const error = state?.id === id ? state.error : undefined;
  const selected = d && isSelected ? isSelected(d.id) : false;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("Question")}>
      <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label={t("Close")} onClick={onClose} />
      <div className="relative flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <button type="button" disabled={index <= 0} onClick={() => onIndex(index - 1)} aria-label={t("Previous question")} className="min-h-10 min-w-10 rounded-xl font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-30"><span className="rtl:inline-block rtl:-scale-x-100">◀</span></button>
          <span className="text-sm font-semibold text-slate-600">{t("Question {n} of {m}", { n: index + 1, m: ids.length })}</span>
          <button type="button" disabled={index >= ids.length - 1} onClick={() => onIndex(index + 1)} aria-label={t("Next question")} className="min-h-10 min-w-10 rounded-xl font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-30"><span className="rtl:inline-block rtl:-scale-x-100">▶</span></button>
          <span className="flex-1" />
          {d && onToggle && (
            <button type="button" onClick={() => onToggle(d, !selected)} aria-pressed={selected} className={`min-h-10 rounded-xl px-4 font-semibold ring-1 ${selected ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-brand-navy ring-slate-300"}`}>{selected ? `✓ ${t("Selected")}` : `+ ${t("Select")}`}</button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("Close")} className="min-h-10 min-w-10 rounded-xl font-semibold text-slate-600 ring-1 ring-slate-300">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5" aria-busy={!d && !error}>
          {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-700">{t(error)}</p>
            : !d ? <p className="text-slate-500">{t("Loading the question…")}</p>
            : <Detail d={d} />}
        </div>
      </div>
    </div>
  );
}

function Detail({ d }: { d: QuestionDetail }) {
  const t = useT();
  const question = (
    <div className="grid content-start gap-4">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">{d.typeLabel}</span>
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ring-1 ${LEVEL_CHIP[d.level]}`}>{t(LEVEL_LABEL[d.level])}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700"><span lang="en" data-content>{d.skill}</span> · {t("Grade {n}", { n: d.grade })}</span>
      </div>
      {d.section && <p className="text-xs font-semibold text-slate-500" lang="en" data-content>{d.section}</p>}
      <div lang="en" dir="ltr" className="grid gap-3">
        <p className="text-lg font-semibold text-slate-900" data-content><RichInline text={d.stem} /></p>
        {d.image && <img src={d.image.url} alt={d.image.alt} className="max-h-64 w-auto rounded-xl ring-1 ring-slate-200" loading="lazy" />}
        <Answers d={d} />
      </div>
      <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <p><span className="font-semibold">{t("Correct answer")}:</span> <span lang="en" dir="ltr" data-content>{d.answerText || "—"}</span></p>
        {d.explanation.why && <p className="mt-1.5"><span className="font-semibold">{t("Why")}:</span> <span lang="en" data-content><RichInline text={d.explanation.why} /></span></p>}
        {d.explanation.tip && <p className="mt-1.5"><span className="font-semibold">{t("Tip")}:</span> <span lang="en" data-content><RichInline text={d.explanation.tip} /></span></p>}
        {d.hint && <p className="mt-1.5"><span className="font-semibold">{t("Hint")}:</span> <span lang="en" data-content><RichInline text={d.hint} /></span></p>}
      </div>
    </div>
  );
  if (!d.passage) return question;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-label={t("Passage")} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto" lang="en" dir="ltr">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">📖 {t("Passage")}</p>
        {d.passage.title && <h3 className="mt-1 text-lg font-bold text-brand-navy" data-content><RichInline text={d.passage.title} /></h3>}
        <div data-content><PassageText text={d.passage.text} paraClassName="mt-3 whitespace-pre-line text-base leading-relaxed text-slate-800" headingClassName="mt-4 text-base font-bold text-brand-navy" /></div>
      </section>
      {question}
    </div>
  );
}

function OptionList({ options }: { options: DetailOption[] }) {
  const t = useT();
  return (
    <ul className="grid gap-1.5">
      {options.map((o, i) => (
        <li key={i} className={`rounded-xl px-3 py-2 ring-1 ${o.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-300" : "bg-white text-slate-800 ring-slate-200"}`}>
          <span data-content>{o.label}. <RichInline text={o.text} /></span>{o.correct && <span className="ms-1" aria-label={t("Correct answer")}> ✓</span>}
          {o.why && <span className="mt-0.5 block text-xs font-normal text-slate-600" data-content><RichInline text={o.why} /></span>}
        </li>
      ))}
    </ul>
  );
}

function Answers({ d }: { d: QuestionDetail }) {
  const t = useT();
  if (d.twoPart) return (
    <div className="grid gap-3">
      <div><p className="text-sm font-semibold text-slate-600">{t("Part A")}</p>{d.twoPart.a.stem && <p className="mb-1" data-content><RichInline text={d.twoPart.a.stem} /></p>}<OptionList options={d.twoPart.a.options} /></div>
      <div><p className="text-sm font-semibold text-slate-600">{t("Part B")}</p><p className="mb-1" data-content><RichInline text={d.twoPart.b.stem} /></p><OptionList options={d.twoPart.b.options} /></div>
    </div>
  );
  if (d.options) return <OptionList options={d.options} />;
  if (d.trueFalse !== null) return <OptionList options={[{ label: "A", text: "True", correct: d.trueFalse, why: null }, { label: "B", text: "False", correct: !d.trueFalse, why: null }]} />;
  if (d.grid) return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr><th className="p-2 text-start" />{d.grid.columns.map((c) => <th key={c} className="p-2 text-center font-semibold text-slate-700" data-content>{c}</th>)}</tr></thead>
      <tbody>{d.grid.rows.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="p-2" data-content><RichInline text={r.text} /></td>{d.grid!.columns.map((c) => <td key={c} className="p-2 text-center">{c === r.answer ? <span className="font-bold text-emerald-700" aria-label={t("Correct answer")}>✓</span> : <span className="text-slate-300">○</span>}</td>)}</tr>)}</tbody>
    </table></div>
  );
  if (d.hot) return <p className="leading-relaxed">{d.hot.segments.map((x, i) => <span key={i} className={x.correct ? "rounded bg-emerald-100 px-0.5 font-semibold text-emerald-900" : ""} data-content><RichInline text={x.text} /> </span>)}</p>;
  if (d.pairs) return <ul className="grid gap-1">{d.pairs.map((p, i) => <li key={i} className="flex flex-wrap gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"><span data-content>{p.left}</span><span aria-hidden="true" className="text-slate-400">→</span><span className="font-semibold text-emerald-800" data-content>{p.right}</span></li>)}</ul>;
  if (d.order) return <ol className="grid gap-1">{d.order.map((x, i) => <li key={i} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"><span className="font-semibold text-emerald-800">{i + 1}.</span> <span data-content>{x}</span></li>)}</ol>;
  if (d.errors) return (
    <div>
      <p className="leading-relaxed">{d.errors.segments.map((x, i) => <span key={i} className={x.wrong ? "rounded bg-rose-100 px-0.5 font-semibold text-rose-900 line-through" : ""} data-content><RichInline text={x.text} /> </span>)}</p>
      {d.errors.noError ? <p className="mt-1 text-sm text-emerald-800">{t("No error: the sentence is correct.")}</p>
        : <ul className="mt-1 text-sm text-emerald-800">{d.errors.segments.filter((x) => x.wrong).map((x, i) => <li key={i}><span data-content>“<RichInline text={x.text} />” → “{x.fix ?? "—"}”</span></li>)}</ul>}
    </div>
  );
  if (d.answers) return <p className="text-sm"><span className="font-semibold">{t("Accepted answers")}:</span> <span data-content>{d.answers.join(" · ")}</span></p>;
  if (d.combine) return <ul className="grid gap-1 text-sm">{d.combine.sentences.map((x, i) => <li key={i} data-content>{x}</li>)}{d.combine.connector && <li className="text-slate-600">{t("Joining word")}: <b data-content>{d.combine.connector}</b></li>}</ul>;
  if (d.dictation) return <p className="text-sm"><span className="font-semibold">{t("Word")}:</span> <span data-content>{d.dictation.word}</span>{d.dictation.sentence && <span className="block text-slate-600" data-content>{d.dictation.sentence}</span>}</p>;
  return null;
}
