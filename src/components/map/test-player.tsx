"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import { PassageText } from "@/components/passage-text";
import { useT } from "@/i18n/client";
import type { TestScreen } from "@/server/map/sim";
import { answerTestAction, mapTestTimeAction } from "@/app/student/map-test/actions";
import { RichInline } from "@/components/rich-inline";

/** How often the timer asks whether the teacher changed the time (ms). */
const POLL_MS = 20_000;
/** A countdown shows when the test is timed, or when its end is this close. */
const SHOW_WITHIN_MS = 3 * 3_600_000;

/**
 * The MAP Test screen (automatic and manual tests): one question at a time, no going back, no right / wrong, no
 * dictionary or read-aloud (like the real MAP Growth). “Pause” keeps the place; the same question comes back. At the
 * end: my RIT (an estimate, with its range) and the goal areas to practise — never a level word.
 */
export function TestPlayer({ initial }: { initial: TestScreen }) {
  const t = useT();
  const [sc, setSc] = useState(initial);
  const [value, setValue] = useState<AnswerValue>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = sc.question;
  // ⏱ r69 live time: the timer follows the teacher's changes (a light poll — "same" costs the server nothing); at 0
  // the test is finished with the answers given
  const [left, setLeft] = useState<number | null>(null);
  const [changed, setChanged] = useState(false);
  const scRef = useRef(sc);
  useEffect(() => { scRef.current = sc; }, [sc]);
  const endsAt = sc.endsAt ?? null;
  useEffect(() => {
    if (!endsAt || sc.done) { setLeft(null); return; }
    let fired = false;
    const tick = () => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0 && !fired) {
        fired = true;
        void mapTestTimeAction({ sessionId: sc.sessionId, windowId: sc.windowId, stamp: sc.stamp, up: true }).then((r) => { if (r && "screen" in r) setSc(r.screen); }).catch(() => { fired = false; });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, sc.done, sc.sessionId, sc.windowId, sc.stamp]);
  useEffect(() => {
    if (!sc.windowId || sc.done) return;
    const id = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const cur = scRef.current;
      try {
        const r = await mapTestTimeAction({ sessionId: cur.sessionId, windowId: cur.windowId, stamp: cur.stamp });
        if (!r || !("screen" in r)) return;
        if (r.screen.endsAt !== cur.endsAt) setChanged(true);
        // keep the question on screen (and the student's answer): only the time and the end move
        setSc((was) => (r.screen.done ? r.screen : { ...was, endsAt: r.screen.endsAt, stamp: r.screen.stamp, timed: r.screen.timed }));
      } catch { /* a weak connection: the next poll tries again */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [sc.windowId, sc.done]);
  const showTimer = left !== null && (sc.timed || left <= SHOW_WITHIN_MS);
  const clock = left === null ? "" : `${Math.floor(left / 3_600_000) ? `${Math.floor(left / 3_600_000)}:` : ""}${String(Math.floor((left % 3_600_000) / 60_000)).padStart(Math.floor(left / 3_600_000) ? 2 : 1, "0")}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`;
  const send = async () => {
    if (!q) return;
    setBusy(true); setError(null);
    const response = (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(value) ? q.elements : value;
    // a weak connection: try again twice before showing an error (the answer is accepted only once)
    let r: Awaited<ReturnType<typeof answerTestAction>> | null = null;
    for (let i = 0; i < 3 && !r; i++) { try { r = await answerTestAction(sc.sessionId, q.questionId, response); } catch { await new Promise((ok) => setTimeout(ok, 1200)); } }
    setBusy(false);
    if (!r) return setError(t("No connection. Your answer was not sent: check the internet and press Next again."));
    if (!r.ok) return setError(t(r.error));
    setSc(r.screen); setValue(null); window.scrollTo({ top: 0 });
  };
  const subject = t(sc.subject === "LANGUAGE" ? "Language Usage" : "Reading");
  if (sc.done) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-6xl" aria-hidden="true">🎉</p>
        <h1 className="mt-2 text-3xl font-extrabold text-brand-navy">{sc.kind === "WARMUP" ? t("Warm-up finished!") : t("{subject}: finished!", { subject })}</h1>
        {sc.result ? (
          <>
            <p className="mt-4 text-slate-600">{t("My RIT (about)")}</p>
            <p data-testid="map-test-rit" className="text-6xl font-extrabold text-brand-navy">{sc.result.rit}</p>
            <p className="mt-1 text-slate-600">{t("most likely between {low} and {high}", { low: sc.result.low, high: sc.result.high })}</p>
            {sc.result.practise.length > 0 && (
              <div className="mt-4 rounded-2xl bg-sky-50 p-4 text-start ring-1 ring-sky-100">
                <p className="font-semibold text-brand-navy">🎯 {t("Goal areas to practise")}</p>
                <ul className="mt-1 list-disc ps-6 text-slate-700">{sc.result.practise.map((a) => <li key={a}>{t(a)}</li>)}</ul>
              </div>
            )}
            <p className="mt-3 text-sm text-slate-500">{t("This is an estimate. Your teacher will use it to help you before the real MAP test.")}</p>
          </>
        ) : <p className="mt-3 text-slate-700">{t("Now you know how the test works. When your teacher opens the practice test, you are ready!")}</p>}
        <Link href="/student/map-test" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">{t("Back")}</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">{sc.kind === "WARMUP" ? t("Warm-up") : t("MAP Test")} · {subject}</p>
          <h1 className="text-2xl font-bold text-brand-navy">{t("Question {n} of {total}", { n: sc.n, total: sc.total })}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={sc.total} aria-valuenow={sc.n - 1} aria-label={t("Progress")}><div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * (sc.n - 1)) / sc.total)}%` }} /></div>
          {showTimer && <span className={`rounded-full px-3 py-1 font-bold tabular-nums ${left! < 5 * 60_000 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"}`} aria-live="polite" dir="ltr">⏱ {clock}</span>}
          <Link href="/student/map-test" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300">⏸ {t("Pause")}</Link>
        </div>
      </header>
      {changed && <p role="status" className="mt-4 rounded-2xl bg-sky-50 px-5 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200">⏱ {t("Your teacher changed the time.")}</p>}
      {sc.warning && <p role="alert" className="mt-4 rounded-2xl bg-amber-100 px-5 py-3 text-lg font-semibold text-amber-900 ring-1 ring-amber-300">{t(sc.warning)}</p>}
      {q && (
        <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
          {q.passage && (
            <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label={t("Reading passage")}>
              <h2 className="text-xl font-bold text-brand-navy"><RichInline text={q.passage.title} /></h2>
              <PassageText text={q.passage.text} />
            </article>
          )}
          <div>
            {q.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
            )}
            {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900"><RichInline text={q.stem} /></p>}
            <div className="mt-5"><AnswerInput key={q.questionId} q={q} value={value} onChange={setValue} disabled={busy} /></div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            <button type="button" onClick={() => void send()} disabled={busy || !isAnswerReady(q, value)} className="mt-6 rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : sc.n === sc.total ? `${t("Finish")} ✓` : `${t("Next")} ▶`}</button>
            <p className="mt-3 text-sm text-slate-500">{t(sc.timed ? "You cannot go back to a question. Watch the timer: when it reaches 0, the test ends with your answers so far." : "You cannot go back to a question. Take your time: there is no time limit.")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
