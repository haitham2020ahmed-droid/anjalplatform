"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { bookletTimeAction, saveBookletAction } from "@/app/student/nafs/sim/actions";
import { RichInline } from "@/components/rich-inline";

type A = number | null;
/** How often the timer asks whether the teacher changed the time (ms; the server's POLL_MS). */
const POLL_MS = 20_000;
interface Group { passage: { title: string; paragraphs: string[] } | null; questions: { n: number; stem: string; options: string[]; kind?: "MCQ" | "WRITTEN" }[] }

/**
 * 🇸🇦 The NAFS simulation booklet (student): each passage (numbered paragraphs) next to its questions, A–D choices,
 * the timer, answers kept on the server as the student goes, a warning about unanswered questions before handing in,
 * and handing in by itself when the time is up. No hints, no explanations. Short written answers are typed in a box and
 * scored later by the teacher.
 */
export function NafsBooklet({ id, endsAt: endsAt0, stamp: stamp0 = 0, groups, initial, initialTexts, total }: { id: string; endsAt: string | null; stamp?: number; groups: Group[]; initial: A[]; initialTexts?: Record<string, string>; total: number }) {
  const t = useT();
  // r69 live time: the teacher can extend or shorten the time while the test runs — the timer follows (a light poll:
  // "same" costs the server nothing)
  const [endsAt, setEndsAt] = useState<string | null>(endsAt0);
  const [changed, setChanged] = useState<"more" | "less" | null>(null);
  const stamp = useRef(stamp0);
  const endsRef = useRef<string | null>(endsAt0);
  const [answers, setAnswers] = useState<A[]>(initial.length === total ? initial : Array.from({ length: total }, () => null));
  const [left, setLeft] = useState<number | null>(endsAt ? Math.max(0, new Date(endsAt).getTime() - Date.now()) : null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>(initialTexts ?? {});
  const written = new Set(groups.flatMap((g) => g.questions.filter((q) => q.kind === "WRITTEN").map((q) => q.n - 1)));
  const blanks = answers.map((a, i) => ((written.has(i) ? !(texts[String(i)] ?? "").trim() : a === null) ? i + 1 : 0)).filter(Boolean);
  const textsRef = useRef(texts);
  useEffect(() => { textsRef.current = texts; }, [texts]);

  const send = useCallback((list: A[], submit: boolean) => start(async () => {
    const r = await saveBookletAction({ id, answers: list, texts: textsRef.current, submit });
    if (r.error) { setError(r.error); return; }
    if (r.ok?.done) setDone(true);
  }), [id]);

  // keep the answers (a closed browser loses nothing)
  const choose = (i: number, k: number) => {
    const next = answers.map((a, j) => (j === i ? k : a));
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send(next, false), 1500);
  };
  const write = (i: number, v: string) => {
    setTexts({ ...texts, [String(i)]: v.slice(0, 2000) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send(answers, false), 2000);
  };
  useEffect(() => {
    if (done) return;
    let stop = false;
    const poll = setInterval(async () => {
      if (stop || document.visibilityState === "hidden") return;
      try {
        const r = await bookletTimeAction({ id, stamp: stamp.current });
        if (stop || !r || "error" in r || r.same) return;
        stamp.current = r.stamp;
        if (r.done) { setDone(true); return; }
        const was = endsRef.current;
        if (was === r.endsAt) return;
        endsRef.current = r.endsAt;
        setChanged(!r.endsAt || (was && new Date(r.endsAt).getTime() > new Date(was).getTime()) ? "more" : "less");
        setEndsAt(r.endsAt);
      } catch { /* a weak connection: the next poll tries again */ }
    }, POLL_MS);
    return () => { stop = true; clearInterval(poll); };
  }, [id, done]);
  useEffect(() => {
    if (!endsAt || done) return;
    setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    const tick = setInterval(() => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) { clearInterval(tick); send(answers, true); }
    }, 1000);
    return () => clearInterval(tick);
  }, [endsAt, done, answers, send]);

  if (done) return (
    <div className="rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
      <p className="text-xl font-semibold text-emerald-900">✓ {t("You handed in this test.")}</p>
      <p className="mt-1 text-emerald-800">{t("Your teacher will share your score.")}</p>
      <Link href="/student/nafs?part=tests" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("NAFS")}</Link>
    </div>
  );
  const mm = left === null ? null : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  return (
    <div className="grid gap-5">
      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card ring-1 ring-line">
        <span className="text-ink-2">{t("{n} of {total} answered", { n: total - blanks.length, total })}</span>
        {mm && <span className={`rounded-full px-3 py-1 font-bold tabular-nums ${left! < 5 * 60000 ? "bg-rose-100 text-rose-800" : "bg-surface-2 text-ink"}`} aria-live="polite">⏱ {mm}</span>}
        <button type="button" disabled={busy} onClick={() => (blanks.length ? setConfirm(true) : send(answers, true))} className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-50">{t("Hand in")}</button>
      </div>
      {changed && <p role="status" className="rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200">⏱ {t(changed === "more" ? "Your teacher gave you more time." : "Your teacher changed the time.")}</p>}
      {confirm && (
        <div role="alertdialog" aria-label={t("Unanswered questions")} className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-300">
          <p className="font-semibold text-amber-900">{t("You have not answered {n} question(s): {list}. In NAFS, answer every question.", { n: blanks.length, list: blanks.join(", ") })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setConfirm(false); document.getElementById(`q${blanks[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Go back and answer")}</button>
            <button type="button" disabled={busy} onClick={() => send(answers, true)} className="min-h-11 rounded-xl px-4 font-semibold text-amber-900 ring-1 ring-amber-300">{t("Hand in anyway")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}
      {groups.map((g, gi) => (
        <section key={gi} className={`grid gap-4 ${g.passage ? "lg:grid-cols-2" : ""}`} lang="en" dir="ltr">
          {g.passage && (
            <article className="reading rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line lg:sticky lg:top-20 lg:max-h-[80vh] lg:overflow-y-auto">
              {g.passage.title && <h2 className="mb-2 text-xl font-semibold text-ink"><RichInline text={g.passage.title} /></h2>}
              {g.passage.paragraphs.map((p, i) => <p key={i} className="mb-3 grid grid-cols-[1.75rem_1fr] text-ink"><span className="text-sm font-bold text-muted">{i + 1}</span><span><RichInline text={p} /></span></p>)}
            </article>
          )}
          <div className="grid content-start gap-3">
            {g.questions.map((q) => (
              <fieldset key={q.n} id={`q${q.n}`} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
                <legend className="sr-only">{q.n}</legend>
                <p className="font-semibold text-ink"><span className="me-1">{q.n}.</span><RichInline text={q.stem} /></p>
                {q.kind === "WRITTEN" ? (
                  <label className="mt-2 grid gap-1 text-sm text-ink-2">{t("Write your answer")}
                    <textarea value={texts[String(q.n - 1)] ?? ""} onChange={(e) => write(q.n - 1, e.target.value)} rows={3} maxLength={2000} className="rounded-xl bg-surface-2 px-3 py-2 text-base text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                  </label>
                ) : <div className="mt-2 grid gap-2">
                  {q.options.map((o, k) => {
                    const on = answers[q.n - 1] === k;
                    return (
                      <label key={k} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ${on ? "bg-sky-50 ring-2 ring-brand-navy" : "bg-surface-2 ring-line"}`}>
                        <input type="radio" name={`q${q.n}`} checked={on} onChange={() => choose(q.n - 1, k)} className="h-5 w-5" />
                        <b className="text-ink">{"ABCD"[k]}.</b><span className="text-ink"><RichInline text={o} /></span>
                      </label>
                    );
                  })}
                </div>}
              </fieldset>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
