"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { WordCard } from "@/lib/learn/format";
import { submitWordsAction } from "@/app/student/learn/actions";
import { speak } from "./speak";
import { RichInline } from "@/components/rich-inline";

export interface WordItem { key: string; word: string; card: WordCard | null; partial: { meaning: string; arabic: string; example: string; pos: string } | null; source: string }
const chip = "rounded-full bg-surface-2 px-2.5 py-0.5 text-sm ring-1 ring-line";

/** One word: 🔊, part of speech, kid-friendly meaning, example, Arabic (tap to show), synonyms / antonyms, family, a quick check. */
export function WordCardView({ w, children }: { w: WordItem; children?: React.ReactNode }) {
  const t = useT();
  const [ar, setAr] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const c = w.card, p = w.partial;
  const meaning = c?.meaning ?? p?.meaning ?? "", example = c?.example ?? p?.example ?? "", arabic = c?.arabic ?? p?.arabic ?? "", pos = c?.pos ?? p?.pos ?? "";
  return (
    <article className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line" aria-label={w.word}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-2xl text-ink" lang="en">{w.word}</h3>
        <button type="button" onClick={() => speak(w.word)} className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 ring-1 ring-line hover:ring-brand-teal" aria-label={t("Listen")}>🔊</button>
        {pos && <span className="text-sm italic text-muted" lang="en">{pos}</span>}
      </header>
      {!c && !p ? <p className="rounded-xl bg-surface-2 px-3 py-2 text-muted">{t("No explanation yet")}</p> : (
        <div lang="en" className="space-y-2">
          {meaning && <p className="text-ink"><b>{meaning}</b></p>}
          {example && <p className="rounded-xl bg-surface-2 px-3 py-2 text-ink-2" data-reading>“{example}” <button type="button" onClick={() => speak(example)} className="ms-1 align-middle text-sm" aria-label={t("Listen")}>🔊</button></p>}
        </div>
      )}
      {arabic && (ar ? <p dir="rtl" lang="ar" className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950 ring-1 ring-amber-200">{arabic}</p>
        : <button type="button" onClick={() => setAr(true)} className="self-start rounded-xl px-3 py-1.5 text-sm font-semibold text-teal-ink ring-1 ring-line hover:ring-brand-teal">{t("Show the Arabic meaning")}</button>)}
      {c && (c.synonyms.length > 0 || c.antonyms.length > 0 || c.family.length > 0) && (
        <dl className="grid gap-1 text-sm" lang="en">
          {c.synonyms.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><dt className="font-semibold text-muted">{t("Same meaning")}:</dt>{c.synonyms.map((x) => <dd key={x} className={chip}>{x}</dd>)}</div>}
          {c.antonyms.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><dt className="font-semibold text-muted">{t("Opposite")}:</dt>{c.antonyms.map((x) => <dd key={x} className={chip}>{x}</dd>)}</div>}
          {c.family.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><dt className="font-semibold text-muted">{t("Word family")}:</dt>{c.family.map((x) => <dd key={x} className={chip}>{x}</dd>)}</div>}
        </dl>
      )}
      {c && (
        <details className="rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line">
          <summary className="cursor-pointer font-semibold text-ink">{t("Quick check")}</summary>
          <p className="mt-2 font-semibold" lang="en"><RichInline text={c.check.stem} /></p>
          <div className="mt-2 grid gap-1.5" lang="en">
            {c.check.options.map((o, k) => (
              <button key={k} type="button" disabled={pick !== null} onClick={() => setPick(k)}
                className={`min-h-11 rounded-xl px-3 py-2 text-start ring-2 ${pick !== null && k === c.check.answer ? "bg-emerald-50 text-emerald-900 ring-emerald-300" : pick === k ? "bg-rose-50 text-rose-900 ring-rose-300" : "bg-surface ring-line"}`}><RichInline text={o} /></button>
            ))}
          </div>
          {pick !== null && <p role="status" className="mt-2 text-sm font-semibold">{pick === c.check.answer ? t("Correct!") : t("Not this time. The green answer is right.")}</p>}
        </details>
      )}
      {children}
    </article>
  );
}

/** "Practise these words": up to 5 questions, marked on the server (preview: marked here, nothing saved). */
export function WordPractice({ sel, questions, preview = false, answers }: { sel: string; questions: { word: string; stem: string; options: string[] }[]; preview?: boolean; answers?: Record<string, number> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [res, setRes] = useState<{ score: number; total: number; answers: { word: string; answer: number; correct: boolean }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!questions.length) return null;
  const all = questions.every((q) => picks[q.word] !== undefined);
  const submit = async () => {
    setBusy(true); setErr(null);
    if (preview && answers) {
      const list = questions.map((q) => ({ word: q.word, answer: answers[q.word], correct: picks[q.word] === answers[q.word] }));
      setRes({ score: list.filter((x) => x.correct).length, total: list.length, answers: list });
    } else {
      const r = await submitWordsAction(sel, questions.map((q) => ({ word: q.word, choice: picks[q.word] }))).catch(() => null);
      if (r?.ok) setRes(r.data); else setErr(r && !r.ok ? r.error : t("Something went wrong. Try again."));
    }
    setBusy(false);
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-navy px-4 font-semibold text-white">✏️ {t("Practise these words")}</button>;
  return (
    <section className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line" aria-label={t("Practise these words")}>
      <h2 className="mb-3 text-xl text-ink">{t("Practise these words")}</h2>
      <ol className="space-y-4">
        {questions.map((q, i) => {
          const r = res?.answers.find((a) => a.word === q.word);
          return (
            <li key={q.word}>
              <p className="font-semibold" lang="en"><span dir="ltr">{i + 1}.</span> <RichInline text={q.stem} /></p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2" lang="en">
                {q.options.map((o, k) => (
                  <button key={k} type="button" disabled={Boolean(res)} onClick={() => setPicks((p) => ({ ...p, [q.word]: k }))}
                    className={`min-h-11 rounded-xl px-3 py-2 text-start ring-2 ${r && k === r.answer ? "bg-emerald-50 text-emerald-900 ring-emerald-300" : r && picks[q.word] === k ? "bg-rose-50 text-rose-900 ring-rose-300" : picks[q.word] === k ? "bg-surface-2 ring-brand-teal" : "bg-surface ring-line"}`}><RichInline text={o} /></button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {res ? <p role="status" className="mt-4 font-display text-3xl text-ink" dir="ltr">{res.score} / {res.total}</p>
        : <button type="button" disabled={!all || busy} onClick={submit} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 font-semibold text-white disabled:opacity-45">{t("Check my answers")}</button>}
      {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
    </section>
  );
}
