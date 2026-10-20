"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ArticlePage, Review, RunView } from "@/server/readrise/student";
import {
  finishReadingAction, postPollAction, practiceAction, prePollAction, saveReadingAction, saveWritingAction, startRunAction,
  submitActivityAction, submitWritingAction, type Result,
} from "@/app/student/readrise/actions";
import { COLORS, POLL_LABELS, keyWordFor, tokenize, type Annotation, type HighlightColor, type KeyWord, type Token } from "./text";
import { WordLookup } from "../learn/word-lookup";
import { GoalRing, LevelBadge } from "./widgets";
import { bestBrowserVoice } from "@/lib/tts/voices";
import { passageSpeech } from "@/lib/tts/text";
import { ListenButton } from "../listen-button";
import { AnswerFx } from "../feedback-fx/answer-fx";
import { RichInline } from "@/components/rich-inline";

/**
 * 🚀 The ReadRise reader: the 5-step routine (before-poll → read → activity → thought question → after-poll),
 * strictly in order and resumable (the server keeps the step). Scores are computed on the server only.
 */
const STEP_NAMES: { key: RunView["step"]; label: string }[] = [
  { key: "PREPOLL", label: "Poll" }, { key: "READ", label: "Read" }, { key: "QUIZ", label: "Activity" }, { key: "WRITE", label: "Thought question" }, { key: "POSTPOLL", label: "Poll again" },
];
const HL: Record<HighlightColor, string> = { yellow: "bg-yellow-200", green: "bg-green-200", blue: "bg-sky-200" };
const HL_NAME: Record<HighlightColor, string> = { yellow: "Yellow", green: "Green", blue: "Blue" };
const MIN_WORDS = 30;
const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function ReadRiseReader({ page }: { page: ArticlePage }) {
  const [view, setView] = useState<RunView | null>(page.run && page.run.step !== "DONE" ? page.run : page.run);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justScored, setJustScored] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  const call = useCallback(async <T,>(fn: () => Promise<Result<T>>): Promise<T | null> => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.error); return null; }
      return r.data;
    } catch { setError("Something went wrong. Check your connection and try again."); return null; }
    finally { setBusy(false); }
  }, []);
  const go = useCallback(async (fn: () => Promise<Result<RunView>>) => { const v = await call(fn); if (v) { setView(v); } return v; }, [call]);
  useEffect(() => { headRef.current?.focus(); }, [view?.step, view?.runId]);

  const start = async (stretch: boolean) => { setJustScored(false); await go(() => startRunAction(page.articleId, stretch)); };

  return (
    <div>
      <div aria-live="assertive" className="min-h-0">{error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-800 ring-1 ring-rose-200">{error}</p>}</div>
      {!view ? (
        <StartCard page={page} busy={busy} onStart={() => start(false)} />
      ) : view.step === "DONE" ? (
        <DoneCard view={view} busy={busy} onStretch={() => start(true)} onReread={() => start(false)} headRef={headRef} />
      ) : (
        <>
          <Stepper step={view.step} stretch={view.stretch} level={view.versionLevel} />
          <h2 ref={headRef} tabIndex={-1} className="mt-4 text-xl font-bold text-brand-navy outline-none">
            {view.step === "PREPOLL" ? "Step 1 · What do you think?" : view.step === "READ" ? "Step 2 · Read" : view.step === "QUIZ" ? "Step 3 · Activity" : view.step === "WRITE" ? "Step 4 · Thought question" : "Step 5 · What do you think now?"}
          </h2>
          {view.step === "PREPOLL" && <Poll statement={view.poll} busy={busy} onSubmit={(v) => go(() => prePollAction(view.runId, v))} />}
          {view.step === "READ" && <ReadStep view={view} busy={busy} onDone={(p) => go(() => finishReadingAction(view.runId, p))} />}
          {view.step === "QUIZ" && <Activity view={view} busy={busy} onSubmit={async (a, at) => { const v = await go(() => submitActivityAction(view.runId, a, at)); if (v) setJustScored(true); }} />}
          {view.step === "WRITE" && (
            <>
              {view.review && <ReviewPanel view={view} open={justScored} call={call} />}
              <WriteStep view={view} busy={busy} onSubmit={(t) => go(() => submitWritingAction(view.runId, t))} />
            </>
          )}
          {view.step === "POSTPOLL" && (
            <>
              {view.prePoll !== null && <p className="mt-2 text-sm text-slate-600">Before reading you chose: <strong>{POLL_LABELS[view.prePoll]}</strong></p>}
              <Poll statement={view.poll} busy={busy} onSubmit={(v) => go(() => postPollAction(view.runId, v))} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ start / stepper / done

function StartCard({ page, busy, onStart }: { page: ArticlePage; busy: boolean; onStart: () => void }) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <p className="text-slate-700">{page.summary}</p>
      <p className="mt-2 text-sm text-slate-600">About {page.minutes} min · version {page.versionLevel} · 5 steps: poll, read, activity, thought question, poll again.</p>
      <button type="button" disabled={busy} onClick={onStart} className="mt-4 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">Start ▶</button>
    </section>
  );
}

function Stepper({ step, stretch, level }: { step: RunView["step"]; stretch: boolean; level: number }) {
  const cur = STEP_NAMES.findIndex((s) => s.key === step);
  return (
    <nav aria-label="Steps" className="mt-4">
      <ol className="flex flex-wrap gap-1.5">
        {STEP_NAMES.map((s, i) => (
          <li key={s.key} aria-current={i === cur ? "step" : undefined} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${i < cur ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : i === cur ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-500 ring-slate-200"}`}>
            <span aria-hidden="true">{i < cur ? "✓" : i + 1}</span>{s.label}<span className="sr-only">{i < cur ? " (done)" : i === cur ? " (now)" : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">Version {level}{stretch ? " · ⬆ Stretch reading (one level up)" : ""}</p>
    </nav>
  );
}

function DoneCard({ view, busy, onStretch, onReread, headRef }: { view: RunView; busy: boolean; onStretch: () => void; onReread: () => void; headRef: RefObject<HTMLHeadingElement | null> }) {
  const d = view.done!;
  const moved = d.levelAfter - d.levelBefore;
  return (
    <section className="mt-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-200">
      <h2 ref={headRef} tabIndex={-1} className="text-2xl font-bold text-brand-navy outline-none">🎉 All 5 steps done!</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">{d.stretch ? "Stretch score" : d.firstTry ? "First-try score" : "Re-read score (practice)"}</p>
          <p className="text-3xl font-bold text-brand-navy">{d.score ?? "—"}%</p>
          {!d.firstTry && <p className="text-xs text-slate-500">Only your first reading of an article counts.</p>}
          {d.tooFast && <p data-testid="rr-too-fast" className="mt-1 text-xs font-semibold text-amber-800">⏳ Some answers came very fast, so this reading did not change your level. Take your time with each question next time.</p>}
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">My ReadRise Level</p>
          <div className="mt-1 flex items-center gap-2"><LevelBadge level={d.levelAfter} /></div>
          <p className={`mt-1 text-sm font-semibold ${moved > 0 ? "text-emerald-700" : moved < 0 ? "text-rose-700" : "text-slate-600"}`}>
            {moved > 0 ? `▲ Up ${moved} from ${d.levelBefore}! Great reading.` : moved < 0 ? `▼ ${d.levelBefore} → ${d.levelAfter}: these articles will be a better fit.` : "No change this time."}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <GoalRing done={d.goal.thisWeek} goal={d.goal.goal} size={84} />
          {d.goal.streak > 0 && <p className="mt-2 text-sm font-semibold text-amber-800">🔥 {d.goal.streak}-week streak</p>}
        </div>
      </div>
      {d.prePoll !== null && d.postPoll !== null && (
        <p className="mt-4 text-slate-700">Your opinion: <strong>{POLL_LABELS[d.prePoll]}</strong> → <strong>{POLL_LABELS[d.postPoll]}</strong>{d.prePoll !== d.postPoll ? " — reading changed your mind!" : ""}</p>
      )}
      <p className="mt-2 text-sm text-slate-600">
        Thought question: {view.writingScore === null ? "waiting for your teacher's score." : `your teacher gave ${view.writingScore}/4.`}{view.writingComment ? ` “${view.writingComment}”` : ""}
      </p>
      {view.modelAnswer && (
        <details className="mt-3 rounded-xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
          <summary className="cursor-pointer font-semibold text-indigo-900">💡 See a strong answer to compare with yours</summary>
          <p className="mt-2 whitespace-pre-line text-slate-800"><RichInline text={view.modelAnswer} /></p>
        </details>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {d.canStretch && (
          <button type="button" disabled={busy} onClick={onStretch} className="rounded-xl bg-brand-purple px-4 py-2 font-semibold text-white hover:bg-brand-navy disabled:opacity-60" aria-describedby="stretch-help">⬆ Stretch it</button>
        )}
        <Link href="/student/readrise" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Back to ReadRise</Link>
        <button type="button" disabled={busy} onClick={onReread} className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-60">🔁 Read it again (practice)</button>
      </div>
      {d.canStretch && <p id="stretch-help" className="mt-2 text-xs text-slate-600">Read the same article one level higher. 75%+ counts toward your goal and can help you move up. It never lowers your level.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ polls

function Poll({ statement, busy, onSubmit }: { statement: string; busy: boolean; onSubmit: (v: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <form className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200" onSubmit={(e) => { e.preventDefault(); if (v !== null) onSubmit(v); }}>
      <fieldset>
        <legend className="text-lg font-semibold text-slate-900">“{statement}”</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {POLL_LABELS.map((l, i) => (
            <label key={l} className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 ring-1 ${v === i ? "bg-teal-50 ring-brand-teal" : "bg-white ring-slate-300"}`}>
              <input type="radio" name="poll" value={i} checked={v === i} onChange={() => setV(i)} className="h-4 w-4 accent-teal-600" />{l}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={busy || v === null} className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Next ▶</button>
    </form>
  );
}

// ------------------------------------------------------------------ step 2: key words + reading

function KeyWordCards({ words }: { words: KeyWord[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {words.map((k) => (
        <li key={k.word} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-lg font-bold text-brand-navy">{k.word} <span className="text-sm font-normal italic text-slate-500">{k.partOfSpeech}</span></p>
          <p className="mt-1 text-slate-800">{k.definition}</p>
          {k.example && <p className="mt-1 text-sm text-slate-600">Example: <em>{k.example}</em></p>}
        </li>
      ))}
    </ul>
  );
}

/** Sentences as word-index ranges (for the read-aloud fallback and pacing). */
function sentencesOf(tokens: Token[]): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let s = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (/[.!?]["”’)]?$/.test(tokens[i].text) || i === tokens.length - 1) { out.push({ start: tokens[s].i, end: tokens[i].i + 1, text: tokens.slice(s, i + 1).map((t) => t.text).join(" ") }); s = i + 1; }
  }
  return out;
}

const RATES = [{ r: 0.7, label: "Slow" }, { r: 0.9, label: "Normal" }, { r: 1.1, label: "Fast" }];

function ReadStep({ view, busy, onDone }: { view: RunView; busy: boolean; onDone: (p: { readSeconds: number; listened: boolean; annotations: Annotation[] }) => void }) {
  const paras = useMemo(() => tokenize(view.body), [view.body]);
  const flat = useMemo(() => paras.flat(), [paras]);
  const sentences = useMemo(() => sentencesOf(flat), [flat]);
  const [showWords, setShowWords] = useState(view.keyWords.length > 0 && view.readSeconds === 0 && view.annotations.length === 0);
  const [notes, setNotes] = useState<Annotation[]>(view.annotations);
  const [pen, setPen] = useState<HighlightColor | "erase" | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [openKw, setOpenKw] = useState<{ kw: KeyWord; i: number } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const seconds = useRef(view.readSeconds);
  const listened = useRef(view.listened);

  // reading time: counts while the page is visible
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") seconds.current += 1; }, 1000);
    const save = setInterval(() => { void saveReadingAction(view.runId, { readSeconds: seconds.current, listened: listened.current }); }, 30_000);
    return () => { clearInterval(t); clearInterval(save); };
  }, [view.runId]);

  // highlights/notes autosave (debounced)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(async () => { const r = await saveReadingAction(view.runId, { annotations: notes, readSeconds: seconds.current }).catch(() => null); setSaved(r && r.ok ? "saved" : "idle"); }, 800);
    return () => clearTimeout(t);
  }, [notes, view.runId]);

  // ---------------- read-aloud: sentence by sentence; word highlight from onboundary when the voice supports it
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState(0.9);
  const [spoken, setSpoken] = useState<{ start: number; end: number; word: number | null } | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  // the shared read-aloud player takes over when the natural pre-generated voice exists for this text
  // (scripts/tts/pregenerate.ts --readrise); otherwise the in-text device voice below is used
  const [natural, setNatural] = useState(false);
  const articleSpeech = useMemo(() => passageSpeech(view.title, view.body), [view.title, view.body]);
  const sIdx = useRef(0);
  const stopFlag = useRef(false);
  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
    try { const r = Number(window.localStorage.getItem("readrise.rate")); if (RATES.some((x) => x.r === r)) setRate(r); } catch { /* storage blocked */ }
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  const speakFrom = useCallback((k: number, r: number) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (k >= sentences.length) { setSpeaking(false); setSpoken(null); sIdx.current = 0; return; }
    sIdx.current = k;
    const sen = sentences[k];
    const words = flat.filter((t) => t.i >= sen.start && t.i < sen.end);
    const starts: number[] = []; let pos = 0;
    for (const w of words) { starts.push(pos); pos += w.text.length + 1; }
    const u = new SpeechSynthesisUtterance(sen.text);
    u.lang = "en-US"; u.rate = r;
    const voice = bestBrowserVoice();
    if (voice) u.voice = voice;
    setSpoken({ start: sen.start, end: sen.end, word: null });
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      let j = 0; while (j + 1 < starts.length && starts[j + 1] <= e.charIndex) j++;
      setSpoken({ start: sen.start, end: sen.end, word: words[j]?.i ?? null });
    };
    u.onend = () => { if (!stopFlag.current) speakFrom(k + 1, r); };
    u.onerror = () => { setSpeaking(false); };
    synth.speak(u);
  }, [flat, sentences]);
  const toggleSpeak = () => {
    if (speaking) { stopFlag.current = true; window.speechSynthesis.cancel(); setSpeaking(false); setSpoken(null); return; }
    stopFlag.current = false; listened.current = true; setSpeaking(true); speakFrom(sIdx.current, rate);
  };
  const changeRate = (r: number) => {
    setRate(r); try { window.localStorage.setItem("readrise.rate", String(r)); } catch { /* storage blocked */ }
    if (speaking) { stopFlag.current = true; window.speechSynthesis.cancel(); setTimeout(() => { stopFlag.current = false; speakFrom(sIdx.current, r); }, 50); }
  };

  // ---------------- highlighter
  const colorAt = (i: number) => notes.find((a) => i >= a.start && i < a.end);
  const addRange = (a: number, b: number) => {
    const start = Math.min(a, b), end = Math.max(a, b) + 1;
    if (pen === "erase") { setNotes((ns) => ns.filter((n) => n.end <= start || n.start >= end)); return; }
    if (!pen) return;
    setNotes((ns) => [...ns.filter((n) => n.end <= start || n.start >= end), { start, end, color: pen }].sort((x, y) => x.start - y.start));
  };
  const wordIndexOf = (node: Node | null): number | null => {
    const el = (node && (node.nodeType === 1 ? (node as Element) : node.parentElement))?.closest("[data-i]");
    return el ? Number(el.getAttribute("data-i")) : null;
  };
  const onPointerUp = () => {
    if (!pen) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const a = wordIndexOf(sel.anchorNode), b = wordIndexOf(sel.focusNode);
    if (a === null || b === null) return;
    addRange(a, b); sel.removeAllRanges(); setPending(null);
  };
  const onWord = (i: number, kw: KeyWord | null) => {
    if (pen) {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) return;
      if (pending === null) { if (pen === "erase") { addRange(i, i); return; } setPending(i); } else { addRange(pending, i); setPending(null); }
      return;
    }
    const hit = notes.findIndex((a) => i >= a.start && i < a.end);
    if (kw) { setOpenKw(openKw?.i === i ? null : { kw, i }); return; }
    if (hit >= 0) setEditing(hit);
  };

  return (
    <div className="mt-3">
      {showWords ? (
        <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-white p-5 ring-1 ring-amber-200" aria-labelledby="kw-h">
          <h3 id="kw-h" className="text-lg font-bold text-brand-navy">🔑 Key words — learn these first</h3>
          <p className="mt-1 text-sm text-slate-600">These words are in the article. They are underlined there: tap one to see its meaning again.</p>
          <div className="mt-3"><KeyWordCards words={view.keyWords} /></div>
          <button type="button" onClick={() => setShowWords(false)} className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">I know these words — read the article ▶</button>
        </section>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 p-2 ring-1 ring-slate-200 backdrop-blur print:hidden" role="toolbar" aria-label="Reading tools">
            <ListenButton text={articleSpeech} label="Read aloud" preOnly onAvailability={setNatural} />
            {canSpeak && !natural && (
              <>
                <button type="button" onClick={toggleSpeak} aria-pressed={speaking} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${speaking ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300"}`}>{speaking ? "⏹ Stop" : "🔊 Read aloud"}</button>
                <label className="flex items-center gap-1 text-sm text-slate-700">Speed
                  <select value={rate} onChange={(e) => changeRate(Number(e.target.value))} className="rounded-lg border-slate-300 py-1 text-sm">
                    {RATES.map((x) => <option key={x.r} value={x.r}>{x.label}</option>)}
                  </select>
                </label>
              </>
            )}
            <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-sm text-slate-700">Highlighter:</span>
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { setPen(pen === c ? null : c); setPending(null); }} aria-pressed={pen === c} aria-label={`${HL_NAME[c]} highlighter`} className={`h-8 w-8 rounded-full ring-2 ${HL[c]} ${pen === c ? "ring-brand-navy" : "ring-transparent"}`} />
            ))}
            <button type="button" onClick={() => { setPen(pen === "erase" ? null : "erase"); setPending(null); }} aria-pressed={pen === "erase"} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${pen === "erase" ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-700 ring-slate-300"}`}>Eraser</button>
            <button type="button" onClick={() => setShowWords(true)} className="rounded-full bg-white px-3 py-1.5 text-sm text-brand-navy ring-1 ring-slate-300">🔑 Key words</button>
            <span className="ml-auto text-xs text-slate-500" aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved ✓" : ""}</span>
          </div>
          {!pen && <p className="mt-2 text-xs text-slate-500 print:hidden">📖 Tap any word to see its meaning.</p>}
          {pen && <p className="mt-2 text-sm text-slate-600">{pending !== null ? "Now tap the last word to highlight." : pen === "erase" ? "Tap a highlight to remove it." : "Select words, or tap the first word and then the last word."}</p>}

          <WordLookup hint={false}>
          <article lang="en" data-wordtap onPointerUp={onPointerUp} className="reading mt-3 rounded-3xl bg-white p-5 text-lg leading-relaxed text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-10">
            <h3 className="text-2xl font-bold text-brand-navy">{view.title}</h3>
            {paras.map((p, pi) => (
              <p key={pi} className="mt-4">
                {p.map((t) => {
                  const kw = keyWordFor(t.text, view.keyWords);
                  const a = colorAt(t.i);
                  const isSpoken = spoken?.word === t.i;
                  const inSentence = spoken && spoken.word === null && t.i >= spoken.start && t.i < spoken.end;
                  const cls = [a ? HL[a.color] : "", isSpoken ? "rounded bg-brand-teal text-white" : inSentence ? "bg-teal-50" : "", pending === t.i ? "outline outline-2 outline-brand-navy" : "", kw ? "underline decoration-amber-500 decoration-2 underline-offset-4 font-semibold" : "", a?.note ? "border-b-2 border-dotted border-slate-500" : ""].join(" ");
                  return (
                    <span key={t.i}>
                      <span data-i={t.i} data-nolookup={a ? "" : undefined} role={kw || pen ? "button" : undefined} tabIndex={kw ? 0 : undefined} aria-label={kw ? `${t.text} (key word: show meaning)` : undefined}
                        onClick={() => onWord(t.i, kw)} onKeyDown={(e) => { if (kw && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onWord(t.i, kw); } }}
                        className={`${cls} ${pen || kw ? "cursor-pointer" : ""}`}>{t.text}</span>
                      {openKw?.i === t.i && (
                        <span role="dialog" aria-label={`Meaning of ${openKw.kw.word}`} className="mx-1 inline-block max-w-xs rounded-xl bg-amber-50 px-3 py-2 align-top text-base font-normal text-slate-800 ring-1 ring-amber-300">
                          <strong>{openKw.kw.word}</strong> <em className="text-slate-500">{openKw.kw.partOfSpeech}</em>: {openKw.kw.definition}
                          <button type="button" onClick={() => setOpenKw(null)} className="ml-2 text-sm text-brand-teal underline">Close</button>
                        </span>
                      )}
                      {" "}
                    </span>
                  );
                })}
              </p>
            ))}
          </article>
          </WordLookup>

          {editing !== null && notes[editing] && (
            <NoteEditor text={flat.slice(notes[editing].start, notes[editing].end).map((t) => t.text).join(" ")} note={notes[editing].note ?? ""}
              onSave={(n) => { setNotes((ns) => ns.map((a, i) => (i === editing ? (n.trim() ? { ...a, note: n.trim().slice(0, 500) } : { start: a.start, end: a.end, color: a.color }) : a))); setEditing(null); }}
              onRemove={() => { setNotes((ns) => ns.filter((_, i) => i !== editing)); setEditing(null); }} onClose={() => setEditing(null)} />
          )}

          {notes.length > 0 && (
            <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="notes-h">
              <h3 id="notes-h" className="font-semibold text-brand-navy">My highlights and notes</h3>
              <ul className="mt-2 space-y-2">
                {notes.map((a, i) => (
                  <li key={`${a.start}-${a.end}`} className="flex flex-wrap items-start gap-2 text-sm">
                    <span className={`rounded px-1 ${HL[a.color]}`}>{flat.slice(a.start, a.end).map((t) => t.text).join(" ").slice(0, 140)}</span>
                    {a.note && <span className="text-slate-700">— {a.note}</span>}
                    <button type="button" onClick={() => setEditing(i)} className="text-brand-teal underline">{a.note ? "Edit note" : "Add note"}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button type="button" disabled={busy} onClick={() => { if (speaking) { stopFlag.current = true; window.speechSynthesis.cancel(); } onDone({ readSeconds: seconds.current, listened: listened.current, annotations: notes }); }}
            className="mt-5 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">I finished reading — go to the activity ▶</button>
        </>
      )}
    </div>
  );
}

function NoteEditor({ text, note, onSave, onRemove, onClose }: { text: string; note: string; onSave: (n: string) => void; onRemove: () => void; onClose: () => void }) {
  const [v, setV] = useState(note);
  return (
    <div role="dialog" aria-label="Note" className="mt-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-300">
      <p className="text-sm text-slate-600">“{text.slice(0, 160)}”</p>
      <label className="mt-2 block text-sm font-semibold text-slate-800">My note
        <textarea value={v} onChange={(e) => setV(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border-slate-300 text-base" autoFocus />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onSave(v)} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">Save note</button>
        <button type="button" onClick={onRemove} className="rounded-lg bg-white px-3 py-1.5 text-sm text-rose-700 ring-1 ring-rose-200">Remove highlight</button>
        <button type="button" onClick={onClose} className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-300">Close</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 3: the activity

function Questions({ view, value, onChange, review, name }: { view: RunView; value: Record<string, string>; onChange: (n: number, l: string) => void; review: Review[] | null; name: string }) {
  return (
    <ol className="space-y-4">
      {view.questions.map((q) => {
        const r = review?.find((x) => x.number === q.number) ?? null;
        return (
          <li key={q.number} className={`rounded-2xl bg-white p-4 ring-1 ${r ? (r.correct ? "ring-emerald-300" : "ring-rose-300") : "ring-slate-200"}`}>
            <fieldset>
              <legend className="font-semibold text-slate-900">{q.number}. <RichInline text={q.stem} /></legend>
              <div className="mt-2 grid gap-2">
                {q.options.map((o, i) => {
                  const l = "ABCD"[i];
                  const mark = r ? (l === r.answer ? "✓" : l === r.chosen ? "✗" : "") : "";
                  return (
                    <label key={l} className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 ring-1 ${value[q.number] === l ? "bg-teal-50 ring-brand-teal" : "ring-slate-200"} ${r && l === r.answer ? "bg-emerald-50" : ""}`}>
                      <input type="radio" name={`${name}-${q.number}`} checked={value[q.number] === l} onChange={() => onChange(q.number, l)} disabled={Boolean(review) && name === "final"} className="mt-1 h-4 w-4 accent-teal-600" />
                      <span><strong>{l}.</strong> <RichInline text={o} /> {mark && <span aria-label={mark === "✓" ? "correct answer" : "your answer, wrong"}>{mark}</span>}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {r && (
              <div className="mt-2 text-sm">
                <p className={r.correct ? "text-emerald-800" : "text-rose-800"}>{r.correct ? "Correct!" : `Not quite. The answer is ${r.answer}.`}</p>
                {r.wrongWhy && <p className="text-slate-700">Why {r.chosen} is wrong: <RichInline text={r.wrongWhy} /></p>}
                {r.why && <p className="text-slate-700">Why {r.answer} is right: <RichInline text={r.why} /></p>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function LookBack({ body, title }: { body: string; title: string }) {
  const paras = useMemo(() => tokenize(body), [body]);
  return (
    <details className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <summary className="cursor-pointer font-semibold text-brand-navy">📖 Look back at the article</summary>
      <div className="mt-2 max-h-96 overflow-y-auto text-base leading-relaxed text-slate-800">
        <p className="font-bold">{title}</p>
        {paras.map((p, i) => <p key={i} className="mt-3">{p.map((t) => t.text).join(" ")}</p>)}
      </div>
    </details>
  );
}

function Activity({ view, busy, onSubmit }: { view: RunView; busy: boolean; onSubmit: (a: Record<string, string>, at: Record<string, number>) => void }) {
  const [a, setA] = useState<Record<string, string>>({});
  // 🎯 when each question was FIRST answered (ms after the questions opened): answers too fast to be read do not count (owner r69)
  const opened = useRef<number | null>(null);
  const firstAt = useRef<Record<string, number>>({});
  useEffect(() => { opened.current = Date.now(); }, []);
  const pick = (n: number, l: string) => {
    if (opened.current !== null && firstAt.current[String(n)] === undefined) firstAt.current[String(n)] = Math.max(0, Date.now() - opened.current);
    setA((x) => ({ ...x, [n]: l }));
  };
  const all = view.questions.every((q) => a[q.number]);
  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (all) onSubmit(a, { ...firstAt.current }); }}>
      <p className="text-slate-700">Answer all {view.questions.length} questions. <strong>Your first try is your score</strong> — take your time.</p>
      <LookBack body={view.body} title={view.title} />
      <div className="mt-4"><Questions view={view} value={a} onChange={pick} review={null} name="final" /></div>
      <button type="submit" disabled={busy || !all} className="mt-4 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Submit my answers</button>
      {!all && <p className="mt-2 text-sm text-slate-600">{view.questions.filter((q) => !a[q.number]).length} question(s) left.</p>}
    </form>
  );
}

function ReviewPanel({ view, open, call }: { view: RunView; open: boolean; call: <T>(fn: () => Promise<Result<T>>) => Promise<T | null> }) {
  const [practice, setPractice] = useState(false);
  const [pa, setPa] = useState<Record<string, string>>({});
  const [pr, setPr] = useState<{ correct: number; total: number; review: Review[] } | null>(null);
  const wrong = view.review!.filter((r) => !r.correct).length;
  return (
    <>
    {open && <AnswerFx scope="readrise" correct={wrong * 2 <= view.review!.length} answerKey={`${view.runId}|score`} className="mt-3" />}
    <details open={open} className="mt-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <summary className="cursor-pointer text-lg font-semibold text-brand-navy">Activity score: {view.score}% {view.firstTry && !view.stretch ? "(first try)" : ""} — see the answers</summary>
      {!practice ? (
        <div className="mt-3">
          <Questions view={view} value={view.answers ?? {}} onChange={() => undefined} review={view.review} name="final" />
          {wrong > 0 && <button type="button" onClick={() => { setPractice(true); setPr(null); setPa({}); }} className="mt-3 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">🔁 Practice again (does not change your score)</button>}
        </div>
      ) : (
        <form className="mt-3" onSubmit={async (e) => { e.preventDefault(); const r = await call(() => practiceAction(view.runId, pa)); if (r) setPr(r); }}>
          <p className="text-sm text-slate-700">Practice only. Your score stays {view.score}%.</p>
          <div className="mt-3"><Questions view={view} value={pa} onChange={(n, l) => setPa((x) => ({ ...x, [n]: l }))} review={pr?.review ?? null} name="practice" /></div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={!view.questions.every((q) => pa[q.number])} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white disabled:opacity-50">Check practice</button>
            <button type="button" onClick={() => setPractice(false)} className="rounded-xl bg-white px-4 py-2 text-brand-navy ring-1 ring-slate-300">Back to my answers</button>
            {pr && <span aria-live="polite" className="font-semibold text-slate-800">Practice: {pr.correct}/{pr.total}</span>}
            {pr && <AnswerFx scope="readrise" correct={pr.correct * 2 >= pr.total} answerKey={`${view.runId}|practice|${pr.correct}|${JSON.stringify(pa)}`} />}
          </div>
        </form>
      )}
    </details>
    </>
  );
}

// ------------------------------------------------------------------ step 4: the thought question

function WriteStep({ view, busy, onSubmit }: { view: RunView; busy: boolean; onSubmit: (t: string) => void }) {
  const [text, setText] = useState(view.writing);
  const [checks, setChecks] = useState<boolean[]>(view.checklist.map(() => false));
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(async () => { const r = await saveWritingAction(view.runId, text).catch(() => null); setSaved(r && r.ok ? "saved" : "error"); }, 1500);
    return () => clearTimeout(t);
  }, [text, view.runId]);
  const n = countWords(text);
  return (
    <form className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200" onSubmit={(e) => { e.preventDefault(); if (n >= MIN_WORDS) onSubmit(text); }}>
      <p className="text-lg font-semibold text-slate-900"><RichInline text={view.prompt} /></p>
      {view.checklist.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold text-slate-700">A strong answer:</legend>
          <ul className="mt-1 space-y-1">
            {view.checklist.map((c, i) => (
              <li key={i}><label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" checked={checks[i]} onChange={() => setChecks((x) => x.map((v, j) => (j === i ? !v : v)))} className="mt-0.5 h-4 w-4 accent-teal-600" />{c}</label></li>
            ))}
          </ul>
        </fieldset>
      )}
      <LookBack body={view.body} title={view.title} />
      <label className="mt-3 block font-semibold text-slate-800" htmlFor="rr-writing">My answer</label>
      <textarea id="rr-writing" value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={6000} aria-describedby="rr-count" className="mt-1 w-full rounded-xl border-slate-300 text-base leading-relaxed" />
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm">
        <span id="rr-count" className={n >= MIN_WORDS ? "text-emerald-700" : "text-slate-600"}>{n} word{n === 1 ? "" : "s"}{n < MIN_WORDS ? ` — at least ${MIN_WORDS}` : " ✓"}</span>
        <span className="text-slate-500" aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "Draft saved ✓" : saved === "error" ? "Not saved — check your connection" : ""}</span>
      </div>
      <button type="submit" disabled={busy || n < MIN_WORDS} className="mt-4 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Submit to my teacher ▶</button>
    </form>
  );
}
