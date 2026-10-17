"use client";
import { useEffect, useState } from "react";
import { dictationHomeAction, submitDictationAction } from "@/app/student/fluency-coach/dictation-actions";
import { say } from "@/components/fluency/recorder";
import type { DiffOp } from "@/server/dictation/diff";
import type { DictationAttemptView, DictationHome } from "@/server/dictation/service";
import { useT } from "@/i18n/client";

/** One diff op, shown the way it should read for the kind of mistake it is. */
function DiffWord({ op }: { op: DiffOp }) {
  if (op.kind === "ok") return <span className="text-slate-800">{op.text} </span>;
  if (op.kind === "missing") return <span className="rounded bg-rose-100 px-1 text-rose-900 line-through">{op.text} </span>;
  if (op.kind === "extra") return <span className="rounded bg-amber-100 px-1 text-amber-900 underline decoration-amber-500">{op.typedText} </span>;
  return <span className="rounded bg-violet-100 px-1 text-violet-900">{op.typedText}<span className="ms-1 text-xs text-violet-600">({op.text})</span> </span>;
}

function DictationResult({ result }: { result: DictationAttemptView }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <p className="text-lg leading-loose" lang="en" dir="ltr">{result.ops.map((op, i) => <DiffWord key={i} op={op} />)}</p>
      {result.clean ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900">🎉 {t("Perfect! No errors.")}</p>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("{n} to fix", { n: result.errorCount })} — <span className="rounded bg-rose-100 px-1">{t("missing a word or punctuation mark")}</span>, <span className="rounded bg-amber-100 px-1">{t("an extra word")}</span>, <span className="rounded bg-violet-100 px-1">{t("a spelling slip")}</span>.
        </p>
      )}
      <p className="text-xs text-slate-500">{result.tierAfter > result.tierBefore ? `⬆ ${t("Tomorrow is a little harder.")}` : result.tierAfter < result.tierBefore ? `⬇ ${t("Tomorrow steps back a bit.")}` : t("Tomorrow stays at the same level.")}</p>
    </div>
  );
}

/**
 * 📝 Daily Dictation (its own tab in the Fluency Coach): the browser's voice reads one short item up to
 * MAX_REPLAYS times, the student types what they heard, and gets a word-level diff of what's wrong. Exactly one
 * attempt counts per calendar day — a second visit the same day shows the attempt already made.
 */
export function DictationTab() {
  const t = useT();
  const [home, setHome] = useState<DictationHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [replaysUsed, setReplaysUsed] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DictationAttemptView | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await dictationHomeAction();
      if (!live) return;
      if (r.ok) { setHome(r.home); setResult(r.home.today); } else setError(r.error);
    })();
    return () => { live = false; };
  }, []);

  const listen = () => {
    if (!home || replaysUsed >= home.maxReplays || speaking) return;
    setSpeaking(true); setReplaysUsed((n) => n + 1);
    say(home.item.text, 0.85, () => setSpeaking(false));
  };

  const submit = async () => {
    if (!typed.trim() || submitting) return;
    setSubmitting(true); setError(null);
    const r = await submitDictationAction(typed);
    setSubmitting(false);
    if (r.ok) setResult(r.result);
    else setError(r.error);
  };

  if (error && !home) return <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-900 ring-1 ring-rose-200">{error}</p>;
  if (!home) return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("Loading…")}</p>;

  const replaysLeft = Math.max(0, home.maxReplays - replaysUsed);
  const alreadyDone = result !== null;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-brand-navy">📝 {t("Daily Dictation")}</h2>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-900">{t("Level {n}", { n: home.tier })}</span>
        </div>
        {alreadyDone ? (
          <>
            <p className="mb-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">{t("You already did today's dictation. Come back tomorrow for the next one.")}</p>
            <DictationResult result={result} />
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">{t("Press Listen, then type exactly what you hear — words and punctuation.")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={listen} disabled={speaking || replaysLeft === 0} className="rounded-2xl bg-brand-navy px-6 py-3 text-lg font-extrabold text-white disabled:opacity-50">
                🔊 {speaking ? t("Listening…") : t("Listen")}
              </button>
              <span className="text-sm text-slate-500">{replaysLeft > 0 ? t("{n} replays left", { n: replaysLeft }) : t("No replays left")}</span>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">{t("Type what you heard")}</span>
              <textarea value={typed} onChange={(e) => setTyped(e.target.value)} disabled={replaysUsed === 0 || submitting} rows={3}
                lang="en" dir="ltr" placeholder={t("Type what you heard…")}
                className="w-full rounded-2xl border-2 border-slate-200 p-3 text-lg focus:border-brand-teal focus:outline-none disabled:bg-slate-50" />
            </label>
            {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
            <button type="button" onClick={submit} disabled={!typed.trim() || submitting} className="mt-3 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 px-6 py-3 text-lg font-extrabold text-brand-navy shadow disabled:opacity-50">
              {submitting ? t("Checking…") : t("Check my dictation")}
            </button>
          </>
        )}
      </section>

      {home.history.length > 0 && (
        <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h3 className="mb-2 font-bold text-brand-navy">{t("Recent days")}</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {home.history.map((h) => (
              <li key={h.day} className="flex items-center justify-between gap-2 py-1.5">
                <span className="tabular-nums text-slate-600">{h.day}</span>
                <span className="font-semibold text-slate-700">{t("Level {n}", { n: h.tierBefore })}</span>
                <span className={h.clean ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900" : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900"}>
                  {h.clean ? t("Clean") : t("{n} errors", { n: h.errorCount })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
