"use client";
/**
 * 🔤 The word check player: the browser says a word (offline speech), the student picks its spelling from 4 choices.
 * Replay and a slower replay are always there. No right/wrong is shown during the check (it is a check, not practice).
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { canSpeak, speakTexts, stopSpeaking } from "@/components/practice/speak";
import { decodeSpeech } from "@/server/word-study/speech-code";
import type { ScreenQuestion } from "@/server/word-study/screener";
import { answerScreenAction, startScreenAction } from "./actions";

export function ScreenPlayer({ initial, startLabel }: { initial: ScreenQuestion | null; startLabel: string }) {
  const router = useRouter();
  const [q, setQ] = useState<ScreenQuestion | null>(initial);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speech, setSpeech] = useState(true);
  const [count, setCount] = useState(0);
  const [pending, start] = useTransition();
  const firstPlay = useRef<string>("");

  useEffect(() => { setSpeech(canSpeak()); return () => stopSpeaking(); }, []);
  const word = (x: ScreenQuestion) => decodeSpeech<string>(x.say, `${x.screenId}:${x.strand.n}:${x.index}`) ?? "";
  const say = (slow = false) => { if (q) speakTexts([word(q)], { slow }); };
  // say each new word once by itself
  useEffect(() => {
    if (!q) return;
    const key = `${q.screenId}:${q.strand.n}:${q.index}`;
    if (firstPlay.current === key) return;
    firstPlay.current = key;
    const t = setTimeout(() => speakTexts([word(q)]), 350);
    return () => clearTimeout(t);
  }, [q]);

  const begin = () => start(async () => {
    setError(null);
    const r = await startScreenAction();
    if (!r.ok) return setError(r.error);
    setQ(r.value);
  });
  const submit = () => {
    if (!q || !picked) return;
    start(async () => {
      setError(null);
      const r = await answerScreenAction({ screenId: q.screenId, strand: q.strand.n, index: q.index, picked });
      if (!r.ok) { setError(r.error); router.refresh(); return; }
      setPicked(null);
      setCount((c) => c + 1);
      if (r.value.next) setQ(r.value.next);
      else { stopSpeaking(); setQ(null); router.refresh(); }
    });
  };

  if (!q) {
    return (
      <div className="space-y-3">
        {!speech && <SpeechWarning />}
        <button type="button" onClick={begin} disabled={pending || !speech} className="min-h-12 rounded-2xl bg-brand-navy px-6 py-3 text-lg font-bold text-white disabled:opacity-50">{pending ? "Getting ready…" : startLabel}</button>
        {error && <p role="alert" className="text-red-700">{error}</p>}
      </div>
    );
  }
  return (
    <section aria-labelledby="word-q" className="space-y-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span className="rounded-full bg-violet-100 px-3 py-1 font-semibold text-violet-900">Part {q.strand.number} · {q.strand.name}</span>
        <span aria-live="polite">Word {q.index + 1} of {q.total}{count ? ` · ${count} answered` : ""}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${Math.round((q.index / q.total) * 100)}%` }} /></div>
      <h2 id="word-q" className="text-xl font-bold text-brand-navy">Listen. Which spelling is the word you hear?</h2>
      {q.madeUp && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">🦄 This is a <b>made-up word</b>. Listen to every sound!</p>}
      {!speech && <SpeechWarning />}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => say(false)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-teal px-5 py-2 text-lg font-bold text-white"><span aria-hidden="true">🔊</span>Hear it again</button>
        <button type="button" onClick={() => say(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2 text-lg font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"><span aria-hidden="true">🐢</span>Slower</button>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={pending}>
        <legend className="sr-only">Choose the spelling</legend>
        {q.choices.map((c) => (
          <label key={c} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-2xl font-semibold tracking-wide ${picked === c ? "border-brand-teal bg-brand-teal/10 text-brand-navy" : "border-slate-200 bg-white hover:border-slate-300"}`} lang="en" dir="ltr">
            <input type="radio" name="spelling" className="h-5 w-5 accent-brand-teal" checked={picked === c} onChange={() => setPicked(c)} />{c}
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button type="button" onClick={submit} disabled={!picked || pending} className="min-h-12 rounded-2xl bg-brand-navy px-6 py-3 text-lg font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Next word →"}</button>
    </section>
  );
}

function SpeechWarning() {
  return <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">This browser cannot say words aloud. Please use another browser (Chrome, Edge or Safari) or ask your teacher for help.</p>;
}
