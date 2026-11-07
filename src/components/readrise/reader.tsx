"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ArticlePage, FeedItem, QuestionFeedback, QuizProgress, Review, RunView } from "@/server/readrise/student";
import type { RecommendReason } from "@/server/readrise/recommend";
import type { WarmupQ } from "@/server/readrise/words-carry";
import {
  answerQuestionAction, finishReadingAction, postPollAction, prePollAction, rateArticleAction, saveReadingAction, saveWritingAction, startRunAction,
  submitActivityAction, submitWritingAction, type Result,
} from "@/app/student/readrise/actions";
import { AGREE, COLORS, DISAGREE, keyWordFor, pollSide, tokenize, type Annotation, type HighlightColor, type KeyWord, type Token } from "./text";
import { WordLookup } from "../learn/word-lookup";
import { GoalRing, LevelBadge, formatLevel } from "./widgets";
import { toAchieve } from "@/server/readrise/achieve-scale"; // round 9 review: a version label shown on the Achieve3000 scale
import { bestBrowserVoice } from "@/lib/tts/voices";
import { passageSpeech } from "@/lib/tts/text";
import { ListenButton } from "../listen-button";
import { AnswerFx } from "../feedback-fx/answer-fx";
import { RichInline } from "@/components/rich-inline";
import { useT } from "@/i18n/client";

/**
 * 🚀 The ReadRise reader. Round 6 (owner: "exactly like Achieve3000"): the 5 steps Ready → Read → Respond → Reflect →
 * Write (+ Stretch Read → Stretch Respond), strictly in order and resumable (the server keeps the step):
 *   Ready     Agree / Disagree + "Explain why you voted the way you did" (Sentence Frames menu)
 *   Read      read aloud, tap-a-word, highlighter + notes, key words; then the Article Rating popup (skippable)
 *   Respond   ONE question per screen with a second try (2 points / 1 point); the score is the FIRST tries only;
 *             then the Results Table (first / second try, skill, points + bonus)
 *   Reflect   the same vote again + explanation → Before / After, the platform-wide %, the class comment feed
 *   Write     Writing Tips, Paragraph Frames, Drafts, Save for later, Submit (then the strong answer to compare)
 * Side tabs on every step: To-do, Notes (with a guiding prompt; used again beside the Write box) and Vocabulary.
 * A microphone (the browser's SpeechRecognition, en-US, only when supported) dictates into Notes and Write.
 * Every label goes through t(); the article text, the questions, the frames and the answer options stay English.
 */
type StepKey = RunView["step"];
const MAIN_STEPS: { key: StepKey; label: string }[] = [
  { key: "PREPOLL", label: "Ready" }, { key: "READ", label: "Read" }, { key: "QUIZ", label: "Respond" }, { key: "POSTPOLL", label: "Reflect" }, { key: "WRITE", label: "Write" },
];
const STRETCH_STEPS: { key: StepKey; label: string }[] = [{ key: "READ", label: "Stretch Read" }, { key: "QUIZ", label: "Stretch Respond" }];
const HL: Record<HighlightColor, string> = { yellow: "bg-yellow-200", green: "bg-green-200", blue: "bg-sky-200" };
const HL_NAME: Record<HighlightColor, string> = { yellow: "Yellow", green: "Green", blue: "Blue" };
const MIN_WORDS = 30;
const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Sentence Frames for the Ready / Reflect explanation (English: they go into the English answer box). */
export const SENTENCE_FRAMES: { group: string; frames: string[] }[] = [
  { group: "Agreement", frames: ["I agree with _ because of _.", "I agree that _ because _.", "The reason I believe _ is because _.", "I support the idea that _ because _.", "In my opinion, _ is true because _.", "I think _ is right because _."] },
  { group: "Disagreement", frames: ["I disagree with _ because of _.", "I do not agree that _ because _.", "The reason I do not believe _ is because _.", "I am against the idea that _ because _.", "In my opinion, _ is not true because _.", "I think _ is wrong because _."] },
  { group: "Mixed Feelings", frames: ["I partly agree with _ because _, but _.", "On one hand _, but on the other hand _.", "I agree that _, but I also think _.", "Some people think _, but I think _.", "It depends on _ because _.", "I am not sure about _ because _."] },
];
/** Paragraph Frames for Write: a short fill-in paragraph inserted into the box. */
export const PARAGRAPH_FRAMES: { name: string; text: string }[] = [
  { name: "Determine Central Idea", text: "The central idea of this article is ___. One detail that supports this idea is ___. Another detail is ___. These details show that ___. In conclusion, ___." },
  { name: "Describe a Sequence of Events", text: "First, ___. Next, ___. Then, ___. After that, ___. Finally, ___. In the end, ___." },
  { name: "Explain a Problem and Its Solution", text: "The problem in this article is ___. This is a problem because ___. One solution is ___. This solution works because ___. In conclusion, ___." },
  { name: "Explain a Cause and Effect", text: "One cause in this article is ___. Because of this, ___. Another effect is ___. This happens because ___. In conclusion, ___." },
  { name: "Compare and Contrast", text: "___ and ___ are alike because ___. They are also alike in that ___. However, they are different because ___. ___, while ___. In conclusion, ___." },
];
export const WRITING_TIPS = [
  "Restate the question in your own words.", "Include a few key details that support your response.", "Try to use one or more vocabulary words.", "Write a conclusion.", "Edit and proofread.",
];
const MAX_DRAFTS = 5;

/** Adds text to a box: on a new line when the box already has text. */
const addText = (cur: string, add: string) => (cur.trim() ? `${cur.replace(/\s+$/, "")}${/[.!?]$/.test(cur.trim()) ? " " : "\n"}${add}` : add);

// ------------------------------------------------------------------ microphone (dictation)

interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number }; resultIndex: number }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
type SpeechRecCtor = new () => SpeechRec;

/** 🎤 Dictation with the browser's SpeechRecognition (en-US) — only when the browser has it. */
function useDictation(onText: (t: string) => void) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => { try { rec.current?.stop(); } catch { /* already stopped */ } };
  }, []);
  const toggle = () => {
    if (on) { try { rec.current?.stop(); } catch { /* already stopped */ } setOn(false); return; }
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0]?.transcript ?? "";
      if (txt.trim()) cb.current(txt.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); }
  };
  return { supported, on, toggle };
}

function MicButton({ onText }: { onText: (t: string) => void }) {
  const tr = useT();
  const d = useDictation(onText);
  if (!d.supported) return null;
  return (
    <button type="button" onClick={d.toggle} aria-pressed={d.on} data-testid="rr-mic"
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${d.on ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-brand-navy ring-slate-300"}`}>
      {d.on ? `⏹ ${tr("Stop")}` : `🎤 ${tr("Speak to type")}`}
    </button>
  );
}

/** 🔊 Says one word or a short text with the device voice. */
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 0.9;
  const v = bestBrowserVoice(); if (v) u.voice = v;
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
}

// ------------------------------------------------------------------ the reader

export function ReadRiseReader({ page }: { page: ArticlePage }) {
  const tr = useT();
  const [view, setView] = useState<RunView | null>(page.run);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** a screen shown between two steps: the Respond results, the Reflect results, the Article Rating popup */
  const [between, setBetween] = useState<"RESULTS" | "REFLECT" | "RATING" | null>(null);
  const [notesText, setNotesText] = useState(page.run?.notesText ?? "");
  const headRef = useRef<HTMLHeadingElement>(null);

  const call = useCallback(async <T,>(fn: () => Promise<Result<T>>): Promise<T | null> => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(tr(r.error)); return null; }
      return r.data;
    } catch { setError(tr("Something went wrong. Check your connection and try again.")); return null; }
    finally { setBusy(false); }
  }, [tr]);
  const go = useCallback(async (fn: () => Promise<Result<RunView>>) => { const v = await call(fn); if (v) { setView(v); } return v; }, [call]);
  useEffect(() => { headRef.current?.focus(); }, [view?.step, view?.runId, between]);

  // 📝 the Notes tab text autosaves (any step after Ready, before the end)
  const notesFirst = useRef(true);
  const runId = view?.runId, step = view?.step;
  useEffect(() => {
    if (notesFirst.current) { notesFirst.current = false; return; }
    if (!runId || step === "PREPOLL" || step === "DONE") return;
    const t = setTimeout(() => { void saveReadingAction(runId, { notesText }).catch(() => null); }, 1000);
    return () => clearTimeout(t);
  }, [notesText, runId, step]);

  const start = async (stretch: boolean) => { setBetween(null); const v = await go(() => startRunAction(page.articleId, stretch)); if (v) setNotesText(v.notesText ?? ""); };

  return (
    <div>
      <div aria-live="assertive" className="min-h-0">{error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-800 ring-1 ring-rose-200">{error}</p>}</div>
      {!view ? (
        <StartCard page={page} busy={busy} onStart={() => start(false)} />
      ) : between === "RESULTS" ? (
        <ResultsScreen view={view} headRef={headRef} onNext={() => setBetween(null)} />
      ) : between === "REFLECT" ? (
        <ReflectResults view={view} headRef={headRef} onNext={() => setBetween(null)} />
      ) : view.step === "DONE" ? (
        <DoneCard view={view} busy={busy} onStretch={() => start(true)} onReread={() => start(false)} headRef={headRef} />
      ) : (
        <>
          <Stepper step={view.step} stretch={view.stretch} level={view.versionLevel} />
          <h2 ref={headRef} tabIndex={-1} className="mt-4 text-xl font-bold text-brand-navy outline-none">
            {view.stretch
              ? tr(view.step === "READ" ? "Stretch Read" : "Stretch Respond")
              : tr(view.step === "PREPOLL" ? "Step 1 · Ready" : view.step === "READ" ? "Step 2 · Read" : view.step === "QUIZ" ? "Step 3 · Respond" : view.step === "POSTPOLL" ? "Step 4 · Reflect" : "Step 5 · Write")}
          </h2>
          {between === "RATING" && <RatingPopup busy={busy} onDone={async (stars, access, skipped) => { await call(() => rateArticleAction(view.runId, stars, access, skipped)); setBetween(null); }} />}
          <SideTabs view={view} notesText={notesText} setNotesText={setNotesText} />
          {view.step === "PREPOLL" && <Poll statement={view.poll} busy={busy} onSubmit={(v, why) => go(() => prePollAction(view.runId, v, why))} />}
          {view.step === "READ" && <ReadStep view={view} busy={busy} onDone={async (p) => { const v = await go(() => finishReadingAction(view.runId, p)); if (v && !v.stretch && !v.rating) setBetween("RATING"); }} />}
          {view.step === "QUIZ" && <Respond view={view} busy={busy} call={call} onScored={async () => { const v = await go(() => submitActivityAction(view.runId, {}, {})); if (v) setBetween("RESULTS"); }} />}
          {view.step === "POSTPOLL" && (
            <Poll statement={view.poll} busy={busy} before={view.prePoll} beforeWhy={view.ready?.why ?? null}
              onSubmit={async (v, why) => { const nv = await go(() => postPollAction(view.runId, v, why)); if (nv && nv.step === "WRITE") setBetween("REFLECT"); }} />
          )}
          {view.step === "WRITE" && <WriteStep view={view} busy={busy} notesText={notesText} onSubmit={(t) => go(() => submitWritingAction(view.runId, t))} />}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ start / stepper / side tabs / done

function StartCard({ page, busy, onStart }: { page: ArticlePage; busy: boolean; onStart: () => void }) {
  const tr = useT();
  return (
    <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <p className="text-slate-700">{page.summary}</p>
      <p className="mt-2 text-sm text-slate-600">{tr("About {n} min · 5 steps: Ready, Read, Respond, Reflect, Write.", { n: page.minutes })}</p>
      {page.textLevel ? <p className="mt-1 text-xs text-slate-500">{tr("text ≈{n}", { n: formatLevel(page.textLevel) })}</p> : null}
      <button type="button" disabled={busy} onClick={onStart} className="mt-4 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{tr("Start ▶")}</button>
    </section>
  );
}

function Stepper({ step, stretch, level }: { step: StepKey; stretch: boolean; level: number }) {
  const tr = useT();
  const list = stretch ? [...MAIN_STEPS.map((s) => ({ ...s, key: `M-${s.key}` as string })), ...STRETCH_STEPS.map((s) => ({ ...s, key: s.key as string }))] : MAIN_STEPS.map((s) => ({ ...s, key: s.key as string }));
  const cur = list.findIndex((s) => s.key === step);
  return (
    <nav aria-label={tr("Steps")} className="mt-4">
      <ol className="flex flex-wrap gap-1.5">
        {list.map((s, i) => (
          <li key={s.key} aria-current={i === cur ? "step" : undefined} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${i < cur ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : i === cur ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-500 ring-slate-200"}`}>
            <span aria-hidden="true">{i < cur ? "✓" : i + 1}</span>{tr(s.label)}<span className="sr-only">{i < cur ? ` ${tr("(done)")}` : i === cur ? ` ${tr("(now)")}` : ` ${tr("(locked)")}`}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">{tr("Text level {level}", { level: formatLevel(toAchieve(level)) })}{stretch ? ` · ${tr("⬆ Stretch: your grade-level text (practice)")}` : ""}</p>
    </nav>
  );
}

/** 📋 To-do / Notes / Vocabulary — beside every step (Achieve's side tabs). */
function SideTabs({ view, notesText, setNotesText }: { view: RunView; notesText: string; setNotesText: (t: string) => void }) {
  const tr = useT();
  const [tab, setTab] = useState<"TODO" | "NOTES" | "VOCAB" | null>(null);
  const steps = view.stretch ? STRETCH_STEPS : MAIN_STEPS;
  const cur = steps.findIndex((s) => s.key === view.step);
  const notesOpen = view.step !== "PREPOLL";
  const tabs: { k: "TODO" | "NOTES" | "VOCAB"; label: string }[] = [{ k: "TODO", label: "To-do" }, { k: "NOTES", label: "Notes" }, { k: "VOCAB", label: "Vocabulary" }];
  return (
    <section className="mt-3 rounded-2xl bg-white p-2 ring-1 ring-slate-200 print:hidden" aria-label={tr("Tools")}>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => setTab(tab === x.k ? null : x.k)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${tab === x.k ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{tr(x.label)}</button>
        ))}
      </div>
      {tab === "TODO" && (
        <ol data-testid="rr-todo" className="mt-3 space-y-1 px-2 pb-2 text-sm">
          {steps.map((s, i) => <li key={s.key} className={i < cur ? "text-emerald-700" : i === cur ? "font-bold text-brand-navy" : "text-slate-500"}>{i < cur ? "✓" : i === cur ? "▶" : "🔒"} {tr(s.label)}</li>)}
        </ol>
      )}
      {tab === "NOTES" && (
        <div data-testid="rr-notes" className="mt-3 px-2 pb-2">
          {notesOpen ? (
            <>
              {view.prompt && <p className="text-sm text-slate-700">{tr("As you read, think about this question:")} <em lang="en"><RichInline text={view.prompt} /></em></p>}
              <p className="mt-1 text-sm text-slate-600">{tr("Take note of questions and answers here. You can use your notes in the Write step.")}</p>
              <textarea value={notesText} onChange={(e) => setNotesText(e.target.value.slice(0, 4000))} rows={5} lang="en" aria-label={tr("My notes")} className="mt-2 w-full rounded-xl border-slate-300 text-base" />
              <div className="mt-1"><MicButton onText={(t) => setNotesText(addText(notesText, t).slice(0, 4000))} /></div>
            </>
          ) : <p className="text-sm text-slate-600">{tr("Your notes open after the Ready step.")}</p>}
        </div>
      )}
      {tab === "VOCAB" && <VocabList words={view.keyWords} />}
    </section>
  );
}

/** 🔤 The band's key words: part of speech, a speak button and the simple meaning (the same source as tap-a-word). */
function VocabList({ words }: { words: KeyWord[] }) {
  const tr = useT();
  if (!words.length) return <p className="mt-3 px-2 pb-2 text-sm text-slate-600">{tr("No vocabulary words for this article.")}</p>;
  return (
    <ul data-testid="rr-vocab" className="mt-3 space-y-2 px-2 pb-2">
      {words.map((k) => (
        <li key={k.word} className="rounded-xl bg-slate-50 p-3">
          <p className="flex flex-wrap items-center gap-2"><strong lang="en" className="text-lg text-brand-navy">{k.word}</strong>{k.partOfSpeech && <em lang="en" className="text-sm text-slate-500">{k.partOfSpeech}</em>}
            <button type="button" onClick={() => speak(k.word)} aria-label={tr("Say {word}", { word: k.word })} className="rounded-full bg-white px-2 py-0.5 text-sm ring-1 ring-slate-300">🔊</button></p>
          {k.definition && <p lang="en" className="mt-1 text-slate-800">{k.definition}</p>}
        </li>
      ))}
    </ul>
  );
}

/** recommend.ts reasonLabel for the browser (that module is server-only): every template is in the UI strings. */
function reasonText(r: RecommendReason | null | undefined, tr: ReturnType<typeof useT>): string {
  if (!r) return "";
  switch (r.kind) {
    case "TEACHER": return tr("📌 From your teacher");
    case "SKILL": { const name = r.label.replace(/^🎯\s*Practise:\s*/, ""); return tr("🎯 Practise: {skill}", { skill: tr(name) }); }
    case "INTEREST": return tr("❤️ You like: {topic}", { topic: tr(r.topic ?? "") });
    case "NEW_TOPIC": return r.label.startsWith("🌍") ? tr("🌍 New topic for you") : tr("📚 A good read for you");
    // round 7: "one level up" is the Stretch button's job; readNext never offers the same article
    default: return tr("📚 More on this topic");
  }
}

function DoneCard({ view, busy, onStretch, onReread, headRef }: { view: RunView; busy: boolean; onStretch: () => void; onReread: () => void; headRef: RefObject<HTMLHeadingElement | null> }) {
  const tr = useT();
  const d = view.done!;
  const moved = d.levelAfter - d.levelBefore;
  const kind = d.kind ?? (d.stretch ? "STRETCH" : d.firstTry ? "FIRST" : "REREAD");
  const heading = kind === "STRETCH" ? `⬆ ${tr("Stretch done")}` : kind === "REREAD" ? `🔁 ${tr("Practice re-read done")}` : `🎉 ${tr("You are done!")}`;
  const counted = !d.tooFast && !d.readTooFast;
  const almost = kind === "FIRST" && counted && d.score !== null && d.score >= 50 && d.score < 75;
  const next = d.readNext ?? null;
  const nextIsStretch = !!next && next.stretch && next.articleId === view.articleId && d.canStretch;
  return (
    <section data-testid="rr-done" data-kind={kind} className="mt-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-200">
      <h2 ref={headRef} tabIndex={-1} className="text-2xl font-bold text-brand-navy outline-none">{heading}</h2>
      {d.readTooFast && <p data-testid="rr-read-too-fast" role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">⏳ {tr("You read this very fast, so it did not count. Read carefully next time.")}</p>}
      {/* ⬆ round 6: like Achieve — after Write, the Stretch or Read next */}
      {d.canStretch && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-purple-200">
          <p className="font-semibold text-brand-navy">{tr("Go to stretch activity")}</p>
          <button type="button" disabled={busy} onClick={onStretch} data-testid="rr-stretch" aria-describedby="stretch-help" className="rounded-xl bg-brand-purple px-4 py-2 font-semibold text-white hover:bg-brand-navy disabled:opacity-60">⬆ {tr("Stretch it")}</button>
          <p id="stretch-help" className="w-full text-xs text-slate-600">{tr("Read the same article at your grade level, with new questions. It is practice: it gives you points, but it never changes your level or your weekly goal.")}</p>
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">{tr(d.stretch ? "Stretch score" : d.firstTry ? "First-try score" : "Re-read score (practice)")}</p>
          <p className="text-3xl font-bold text-brand-navy">{d.score ?? "—"}%</p>
          {view.points && <p className="text-sm font-semibold text-amber-800">⭐ {tr("{n} points", { n: view.points.earned + view.points.bonus })}</p>}
          {!d.firstTry && <p className="text-xs text-slate-500">{tr("Only your first reading of an article counts. A re-read is practice: it never changes your level, your weekly goal or your stars.")}</p>}
          {d.stretch && <p data-testid="rr-stretch-practice" className="text-xs text-slate-500">{tr("The Stretch is practice: it never changes your level or your weekly goal.")}</p>}
          {d.tooFast && <p data-testid="rr-too-fast" className="mt-1 text-xs font-semibold text-amber-800">⏳ {tr("Some answers came very fast, so this reading did not change your level. Take your time with each question next time.")}</p>}
          {almost && <p data-testid="rr-almost" className="mt-1 text-xs font-semibold text-indigo-800">💪 {tr("Score 75% on the next one so it counts toward moving up.")}</p>}
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">{tr("My ReadRise Level")}</p>
          <div className="mt-1 flex items-center gap-2"><LevelBadge level={d.levelAfter} /></div>
          <p className={`mt-1 text-sm font-semibold ${moved > 0 ? "text-emerald-700" : moved < 0 ? "text-rose-700" : "text-slate-600"}`}>
            {moved > 0 ? tr("▲ Up {n} from {from}! Great reading.", { n: moved, from: formatLevel(d.levelBefore) }) : moved < 0 ? tr("▼ {from} → {to}: these articles will be a better fit.", { from: formatLevel(d.levelBefore), to: formatLevel(d.levelAfter) }) : tr("No change this time.")}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <GoalRing done={d.goal.thisWeek} goal={d.goal.goal} size={84} />
          {d.goal.met && <p data-testid="rr-goal-met" className="mt-2 text-sm font-bold text-emerald-800">🏆 {tr("Goal met! One more?")}</p>}
          {d.goal.streak > 0 && <p className="mt-2 text-sm font-semibold text-amber-800">🔥 {tr("{n}-week streak", { n: d.goal.streak })}</p>}
        </div>
      </div>
      {(d.wordsSaved ?? 0) > 0 && <p data-testid="rr-words-saved" className="mt-4 text-slate-700">🗂 {tr("{n} new words saved to My Words", { n: d.wordsSaved! })}</p>}
      {d.prePoll !== null && d.postPoll !== null && (
        <p className="mt-4 text-slate-700">{tr("Your opinion:")} <strong>{tr(sideLabel(d.prePoll))}</strong> → <strong>{tr(sideLabel(d.postPoll))}</strong>{pollSide(d.prePoll) !== pollSide(d.postPoll) ? ` — ${tr("reading changed your mind!")}` : ""}</p>
      )}
      {view.review && (
        <details className="mt-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-brand-navy">{tr("Results Table")}</summary>
          <ResultsTable review={view.review} />
        </details>
      )}
      {!d.stretch && (
        <p className="mt-2 text-sm text-slate-600">
          {tr("Thought question:")} {view.writingScore === null ? tr("waiting for your teacher's score.") : tr("your teacher gave {n}/4.", { n: view.writingScore })}{view.writingComment ? ` “${view.writingComment}”` : ""}
          {view.writingScore !== null && view.writingPoints ? ` · ⭐ ${tr("{n} points", { n: view.writingPoints })}` : ""}
        </p>
      )}
      {/* 🏅 round 6: badges the teacher gave this writing (the Grading Center) */}
      {!d.stretch && (view.teacherBadges?.length ?? 0) > 0 && view.celebrate !== false && (
        <ul data-testid="rr-teacher-badges" className="mt-2 flex flex-wrap gap-2">
          {view.teacherBadges!.map((b) => <li key={b.name} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">🏅 {tr(b.name)} · {tr("{n} points", { n: b.points })}</li>)}
        </ul>
      )}
      {view.modelAnswer && (
        <details className="mt-3 rounded-xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
          <summary className="cursor-pointer font-semibold text-indigo-900">💡 {tr("See a strong answer to compare with yours")}</summary>
          <p className="mt-2 whitespace-pre-line text-slate-800"><RichInline text={view.modelAnswer} /></p>
        </details>
      )}
      {/* 📖 round 5: what to read next (recommend.ts readNext), with its reason */}
      {next && (
        <div data-testid="rr-read-next" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-indigo-200">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">📖 {tr("Read next")}</p>
            <p lang="en" className="font-bold text-brand-navy">{next.title}</p>
            <p className="text-sm text-slate-600">{reasonText(next.reason, tr)}</p>
          </div>
          {nextIsStretch
            ? <button type="button" disabled={busy} onClick={onStretch} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{tr("Start ▶")}</button>
            : <Link href={`/student/readrise/${encodeURIComponent(next.articleId)}`} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">{tr("Start ▶")}</Link>}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/student/readrise" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{tr("Back to ReadRise")}</Link>
        <button type="button" disabled={busy} onClick={onReread} className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-60">🔁 {tr("Read it again (practice)")}</button>
      </div>
      {!d.canStretch && d.stretchWhy && !d.stretch && <p className="mt-2 text-xs text-slate-600">{tr(d.stretchWhy)}</p>}
    </section>
  );
}

// ------------------------------------------------------------------ Ready / Reflect: the vote + explanation

const sideLabel = (v: number | null | undefined) => (pollSide(v) === "AGREE" ? "Agree" : pollSide(v) === "DISAGREE" ? "Disagree" : "—");

function FramesMenu({ onPick }: { onPick: (f: string) => void }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="rr-sentence-frames" className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">🧩 {tr("Sentence Frames")}</button>
      {open && (
        <div role="menu" className="absolute z-20 mt-1 max-h-80 w-80 max-w-[90vw] overflow-y-auto rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-300">
          {SENTENCE_FRAMES.map((g) => (
            <div key={g.group} className="mb-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{tr(g.group)}</p>
              <ul>{g.frames.map((f) => <li key={f}><button type="button" role="menuitem" lang="en" onClick={() => { onPick(f); setOpen(false); }} className="w-full rounded-lg px-2 py-1 text-start text-sm hover:bg-teal-50">{f}</button></li>)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Poll({ statement, busy, onSubmit, before = null, beforeWhy = null }: { statement: string; busy: boolean; onSubmit: (v: number, why: string) => void; before?: number | null; beforeWhy?: string | null }) {
  const tr = useT();
  const [v, setV] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  const ok = v !== null && why.trim().length > 0;
  return (
    <form className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(v!, why.trim()); }}>
      {before !== null && <p className="mb-2 text-sm text-slate-600">{tr("Before reading you voted:")} <strong>{tr(sideLabel(before))}</strong>{beforeWhy ? <> — <em lang="en">{beforeWhy}</em></> : null}</p>}
      <fieldset>
        <legend lang="en" className="text-lg font-semibold text-slate-900">“{statement}”</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
          {[{ val: AGREE, label: "Agree" }, { val: DISAGREE, label: "Disagree" }].map((o) => (
            <label key={o.val} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-semibold ring-1 ${v === o.val ? "bg-teal-50 ring-brand-teal" : "bg-white ring-slate-300"}`}>
              <input type="radio" name="poll" value={o.val} checked={v === o.val} onChange={() => setV(o.val)} className="h-4 w-4 accent-teal-600" />{tr(o.label)}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="rr-why" className="mt-4 block font-semibold text-slate-800">{tr("Explain why you voted the way you did")}</label>
      <textarea id="rr-why" lang="en" value={why} onChange={(e) => setWhy(e.target.value.slice(0, 1500))} rows={3} className="mt-1 w-full rounded-xl border-slate-300 text-base" />
      <div className="mt-1 flex flex-wrap gap-2"><FramesMenu onPick={(f) => setWhy(addText(why, f))} /><MicButton onText={(t) => setWhy(addText(why, t).slice(0, 1500))} /></div>
      <button type="submit" disabled={busy || !ok} className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">{tr("Submit")}</button>
    </form>
  );
}

const ago = (iso: string, tr: ReturnType<typeof useT>): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return tr("a few seconds ago");
  const m = Math.round(ms / 60_000);
  if (m < 60) return tr(m === 1 ? "1 minute ago" : "{n} minutes ago", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return tr(h === 1 ? "1 hour ago" : "{n} hours ago", { n: h });
  const d = Math.round(h / 24);
  return tr(d === 1 ? "1 day ago" : "{n} days ago", { n: d });
};

function Bar({ label, agree, disagree, n }: { label: string; agree: number; disagree: number; n: number }) {
  const tr = useT();
  return (
    <div>
      <p className="text-sm font-semibold text-slate-700">{label} <span className="font-normal text-slate-500">({tr("{n} students", { n })})</span></p>
      <div className="mt-1 flex h-7 overflow-hidden rounded-lg text-sm font-bold text-white" role="img" aria-label={`${tr("Agree")} ${agree}% · ${tr("Disagree")} ${disagree}%`}>
        {agree > 0 && <span className="flex items-center justify-center bg-teal-600" style={{ width: `${agree}%` }}>{agree}%</span>}
        {disagree > 0 && <span className="flex items-center justify-center bg-amber-500" style={{ width: `${disagree}%` }}>{disagree}%</span>}
        {n === 0 && <span className="flex w-full items-center justify-center bg-slate-300">—</span>}
      </div>
    </div>
  );
}

/** 🗳 Reflect results: Before vs After, the platform-wide %, the class comment feed. */
function ReflectResults({ view, headRef, onNext }: { view: RunView; headRef: RefObject<HTMLHeadingElement | null>; onNext: () => void }) {
  const tr = useT();
  const changed = pollSide(view.prePoll) !== pollSide(view.postPoll);
  const st = view.pollStats;
  return (
    <section data-testid="rr-reflect-results" className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 ref={headRef} tabIndex={-1} className="text-xl font-bold text-brand-navy outline-none">{tr("Step 4 · Reflect")}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">{tr("Before")}</p><p className="text-lg font-bold">{tr(sideLabel(view.prePoll))}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">{tr("After")}</p><p className="text-lg font-bold">{tr(sideLabel(view.postPoll))}</p></div>
      </div>
      <p className={`mt-3 font-semibold ${changed ? "text-indigo-800" : "text-slate-700"}`}>{changed ? tr("You changed your opinion") : tr("You did not change your opinion")}</p>
      {st && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">{tr("What all students on the platform think about this article:")}</p>
          <Bar label={tr("Before reading")} {...st.before} />
          <Bar label={tr("After reading")} {...st.after} />
          <p className="text-xs text-slate-500"><span className="me-1 inline-block h-3 w-3 rounded bg-teal-600 align-middle" />{tr("Agree")} <span className="ms-3 me-1 inline-block h-3 w-3 rounded bg-amber-500 align-middle" />{tr("Disagree")}</p>
        </div>
      )}
      {view.feed && <Feed items={view.feed} />}
      <button type="button" onClick={onNext} className="mt-5 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{tr("Next: Write ▶")}</button>
    </section>
  );
}

function Feed({ items }: { items: FeedItem[] }) {
  const tr = useT();
  return (
    <div data-testid="rr-feed" className="mt-5">
      <h3 className="font-bold text-brand-navy">💬 {tr("What your classmates think")}</h3>
      {!items.length ? <p className="mt-1 text-sm text-slate-600">{tr("No comments from your class yet.")}</p> : (
        <ul className="mt-2 space-y-2">
          {items.map((c, i) => (
            <li key={`${c.initials}-${c.at}-${i}`} className={`rounded-xl p-3 ring-1 ${c.mine ? "bg-teal-50 ring-teal-200" : "bg-slate-50 ring-slate-200"}`}>
              <p className="text-sm"><strong>{c.mine ? tr("You") : c.initials}</strong> <span className="text-slate-500">· {ago(c.at, tr)}{c.side ? ` · ${tr(c.side === "AGREE" ? "Agree" : "Disagree")}` : ""}</span></p>
              <p lang="en" className="mt-1 text-slate-800">{c.why}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ⭐ The Article Rating popup after Read (skippable). */
function RatingPopup({ busy, onDone }: { busy: boolean; onDone: (stars: number | null, access: string | null, skipped: boolean) => void }) {
  const tr = useT();
  const [stars, setStars] = useState<number | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rr-rate-h" data-testid="rr-rating" className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 id="rr-rate-h" className="text-lg font-bold text-brand-navy">{tr("Article Rating")}</h3>
        <p className="mt-1 text-sm text-slate-700">{tr("How much did you like this article?")}</p>
        <div className="mt-2 flex gap-1" role="radiogroup" aria-label={tr("Stars")}>
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={tr("{n} stars", { n })} onClick={() => setStars(n)}
              className={`text-3xl ${stars !== null && n <= stars ? "text-amber-500" : "text-slate-300"}`}>★</button>
          ))}
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold text-slate-800">{tr("How did you access this article?")}</legend>
          {[{ v: "SELF", l: "I selected it myself" }, { v: "TEACHER", l: "My teacher assigned it to me" }].map((o) => (
            <label key={o.v} className="mt-1 flex items-center gap-2 text-sm"><input type="radio" name="rr-access" checked={access === o.v} onChange={() => setAccess(o.v)} className="h-4 w-4 accent-teal-600" />{tr(o.l)}</label>
          ))}
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy || (stars === null && access === null)} onClick={() => onDone(stars, access, false)} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white disabled:opacity-50">{tr("Submit")}</button>
          <button type="button" disabled={busy} onClick={() => onDone(null, null, true)} className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">{tr("Skip")}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 2: key words + reading

/**
 * 🔤 Round 5: an optional word warm-up before reading (words-carry.ts wordWarmup: words from the last article) —
 * 2 quick questions, never scored, never sent anywhere; Skip hides it.
 */
function WordWarmup({ items }: { items: WarmupQ[] }) {
  const tr = useT();
  const [skip, setSkip] = useState(false);
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (skip || !items.length) return null;
  return (
    <div data-testid="rr-warmup" className="mt-3 rounded-xl bg-white p-4 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-brand-navy">🔤 {tr("Word warm-up (optional)")}</p>
        <button type="button" onClick={() => setSkip(true)} className="text-sm text-brand-teal underline">{tr("Skip")}</button>
      </div>
      <ol className="mt-2 space-y-3">
        {items.slice(0, 2).map((q, i) => {
          const chosen = picked[i];
          return (
            <li key={`${q.word}-${i}`}>
              <p className="text-sm text-slate-800">{tr("Which word means:")} <em lang="en">{q.definition}</em></p>
              <div role="group" className="mt-1 flex flex-wrap gap-2">
                {q.options.map((o, k) => {
                  const shown = chosen !== undefined;
                  const right = k === q.answer;
                  return (
                    <button key={`${o}-${k}`} type="button" lang="en" disabled={shown} onClick={() => setPicked((p) => ({ ...p, [i]: k }))}
                      className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${shown && right ? "bg-emerald-100 text-emerald-900 ring-emerald-300" : shown && chosen === k ? "bg-rose-100 text-rose-900 ring-rose-300" : "bg-white text-brand-navy ring-slate-300"}`}>{o}</button>
                  );
                })}
              </div>
              {chosen !== undefined && <p role="status" className="mt-1 text-xs text-slate-600">{chosen === q.answer ? tr("Yes! 🎉") : tr("The answer is “{w}”.", { w: q.options[q.answer] ?? q.word })}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function KeyWordCards({ words }: { words: KeyWord[] }) {
  const tr = useT();
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {words.map((k) => (
        <li key={k.word} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-lg font-bold text-brand-navy">{k.word} <span className="text-sm font-normal italic text-slate-500">{k.partOfSpeech}</span></p>
          <p className="mt-1 text-slate-800">{k.definition}</p>
          {k.example && <p className="mt-1 text-sm text-slate-600">{tr("Example:")} <em lang="en">{k.example}</em></p>}
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
  const tr = useT();
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
          <h3 id="kw-h" className="text-lg font-bold text-brand-navy">🔑 {tr("Key words — learn these first")}</h3>
          <p className="mt-1 text-sm text-slate-600">{tr("These words are in the article. They are underlined there: tap one to see its meaning again.")}</p>
          {(view.warmup?.length ?? 0) > 0 && <WordWarmup items={view.warmup!} />}
          <div className="mt-3"><KeyWordCards words={view.keyWords} /></div>
          <button type="button" onClick={() => setShowWords(false)} className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">{tr("I know these words — read the article ▶")}</button>
        </section>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 p-2 ring-1 ring-slate-200 backdrop-blur print:hidden" role="toolbar" aria-label={tr("Reading tools")}>
            <ListenButton text={articleSpeech} label={tr("Read aloud")} preOnly onAvailability={setNatural} />
            {canSpeak && !natural && (
              <>
                <button type="button" onClick={toggleSpeak} aria-pressed={speaking} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${speaking ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-brand-navy ring-slate-300"}`}>{speaking ? `⏹ ${tr("Stop")}` : `🔊 ${tr("Read aloud")}`}</button>
                <label className="flex items-center gap-1 text-sm text-slate-700">{tr("Speed")}
                  <select value={rate} onChange={(e) => changeRate(Number(e.target.value))} className="rounded-lg border-slate-300 py-1 text-sm">
                    {RATES.map((x) => <option key={x.r} value={x.r}>{tr(x.label)}</option>)}
                  </select>
                </label>
              </>
            )}
            <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-sm text-slate-700">{tr("Highlighter:")}</span>
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { setPen(pen === c ? null : c); setPending(null); }} aria-pressed={pen === c} aria-label={tr(`${HL_NAME[c]} highlighter`)} className={`h-8 w-8 rounded-full ring-2 ${HL[c]} ${pen === c ? "ring-brand-navy" : "ring-transparent"}`} />
            ))}
            <button type="button" onClick={() => { setPen(pen === "erase" ? null : "erase"); setPending(null); }} aria-pressed={pen === "erase"} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${pen === "erase" ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-700 ring-slate-300"}`}>{tr("Eraser")}</button>
            <button type="button" onClick={() => setShowWords(true)} className="rounded-full bg-white px-3 py-1.5 text-sm text-brand-navy ring-1 ring-slate-300">🔑 {tr("Key words")}</button>
            <span className="ml-auto text-xs text-slate-500" aria-live="polite">{saved === "saving" ? tr("Saving…") : saved === "saved" ? tr("Saved ✓") : ""}</span>
          </div>
          {!pen && <p className="mt-2 text-xs text-slate-500 print:hidden">📖 {tr("Tap any word to see its meaning.")}</p>}
          {pen && <p className="mt-2 text-sm text-slate-600">{tr(pending !== null ? "Now tap the last word to highlight." : pen === "erase" ? "Tap a highlight to remove it." : "Select words, or tap the first word and then the last word.")}</p>}

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
                  const cls = [a ? HL[a.color as keyof typeof HL] : "", isSpoken ? "rounded bg-brand-teal text-white" : inSentence ? "bg-teal-50" : "", pending === t.i ? "outline outline-2 outline-brand-navy" : "", kw ? "underline decoration-amber-500 decoration-2 underline-offset-4 font-semibold" : "", a?.note ? "border-b-2 border-dotted border-slate-500" : ""].join(" ");
                  return (
                    <span key={t.i}>
                      <span data-i={t.i} data-nolookup={a ? "" : undefined} role={kw || pen ? "button" : undefined} tabIndex={kw ? 0 : undefined} aria-label={kw ? `${t.text} (${tr("key word: show meaning")})` : undefined}
                        onClick={() => onWord(t.i, kw)} onKeyDown={(e) => { if (kw && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onWord(t.i, kw); } }}
                        className={`${cls} ${pen || kw ? "cursor-pointer" : ""}`}>{t.text}</span>
                      {openKw?.i === t.i && (
                        <span role="dialog" aria-label={tr("Meaning of {word}", { word: openKw.kw.word })} className="mx-1 inline-block max-w-xs rounded-xl bg-amber-50 px-3 py-2 align-top text-base font-normal text-slate-800 ring-1 ring-amber-300">
                          <strong>{openKw.kw.word}</strong> <em className="text-slate-500">{openKw.kw.partOfSpeech}</em>: {openKw.kw.definition}
                          <button type="button" onClick={() => setOpenKw(null)} className="ml-2 text-sm text-brand-teal underline">{tr("Close")}</button>
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
              <h3 id="notes-h" className="font-semibold text-brand-navy">{tr("My highlights and notes")}</h3>
              <ul className="mt-2 space-y-2">
                {notes.map((a, i) => (
                  <li key={`${a.start}-${a.end}`} className="flex flex-wrap items-start gap-2 text-sm">
                    <span lang="en" className={`rounded px-1 ${HL[a.color as keyof typeof HL]}`}>{flat.slice(a.start, a.end).map((t) => t.text).join(" ").slice(0, 140)}</span>
                    {a.note && <span className="text-slate-700">— {a.note}</span>}
                    <button type="button" onClick={() => setEditing(i)} className="text-brand-teal underline">{tr(a.note ? "Edit note" : "Add note")}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button type="button" disabled={busy} onClick={() => { if (speaking) { stopFlag.current = true; window.speechSynthesis.cancel(); } onDone({ readSeconds: seconds.current, listened: listened.current, annotations: notes }); }}
            className="mt-5 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{tr("I finished reading — go to the activity ▶")}</button>
        </>
      )}
    </div>
  );
}

function NoteEditor({ text, note, onSave, onRemove, onClose }: { text: string; note: string; onSave: (n: string) => void; onRemove: () => void; onClose: () => void }) {
  const tr = useT();
  const [v, setV] = useState(note);
  return (
    <div role="dialog" aria-label={tr("Note")} className="mt-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-300">
      <p lang="en" className="text-sm text-slate-600">“{text.slice(0, 160)}”</p>
      <label className="mt-2 block text-sm font-semibold text-slate-800">{tr("My note")}
        <textarea value={v} onChange={(e) => setV(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-xl border-slate-300 text-base" autoFocus />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onSave(v)} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white">{tr("Save note")}</button>
        <button type="button" onClick={onRemove} className="rounded-lg bg-white px-3 py-1.5 text-sm text-rose-700 ring-1 ring-rose-200">{tr("Remove highlight")}</button>
        <button type="button" onClick={onClose} className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-300">{tr("Close")}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 3: the activity

function Questions({ view, value, onChange, review, name }: { view: RunView; value: Record<string, string>; onChange: (n: number, l: string) => void; review: Review[] | null; name: string }) {
  const tr = useT();
  return (
    <ol className="space-y-4">
      {view.questions.map((q) => {
        const r = review?.find((x) => x.number === q.number) ?? null;
        return (
          <li key={q.number} className={`rounded-2xl bg-white p-4 ring-1 ${r ? (r.correct ? "ring-emerald-300" : "ring-rose-300") : "ring-slate-200"}`}>
            <fieldset>
              <legend lang="en" className="font-semibold text-slate-900">{q.number}. <RichInline text={q.stem} /></legend>
              <div className="mt-2 grid gap-2">
                {q.options.map((o, i) => {
                  const l = "ABCD"[i];
                  const mark = r ? (l === r.answer ? "✓" : l === r.chosen ? "✗" : "") : "";
                  return (
                    <label key={l} className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 ring-1 ${value[q.number] === l ? "bg-teal-50 ring-brand-teal" : "ring-slate-200"} ${r && l === r.answer ? "bg-emerald-50" : ""}`}>
                      <input type="radio" name={`${name}-${q.number}`} checked={value[q.number] === l} onChange={() => onChange(q.number, l)} disabled={Boolean(review) && name === "final"} className="mt-1 h-4 w-4 accent-teal-600" />
                      <span><strong>{l}.</strong> <span lang="en"><RichInline text={o} /></span> {mark && <span aria-label={tr(mark === "✓" ? "correct answer" : "your answer, wrong")}>{mark}</span>}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {r && (
              <div className="mt-2 text-sm">
                <p className={r.correct ? "text-emerald-800" : "text-rose-800"}>{r.correct ? tr("Correct!") : tr("Not quite. The answer is {answer}.", { answer: r.answer })}</p>
                {r.wrongWhy && <p className="text-slate-700">{tr("Why {letter} is wrong:", { letter: r.chosen ?? "" })} <span lang="en"><RichInline text={r.wrongWhy} /></span></p>}
                {r.why && <p className="text-slate-700">{tr("Why {letter} is right:", { letter: r.answer })} <span lang="en"><RichInline text={r.why} /></span></p>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function LookBack({ body, title }: { body: string; title: string }) {
  const tr = useT();
  const paras = useMemo(() => tokenize(body), [body]);
  return (
    <details className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <summary className="cursor-pointer font-semibold text-brand-navy">📖 {tr("Look back at the article")}</summary>
      <div lang="en" className="mt-2 max-h-96 overflow-y-auto text-base leading-relaxed text-slate-800">
        <p className="font-bold">{title}</p>
        {paras.map((p, i) => <p key={i} className="mt-3">{p.map((t) => t.text).join(" ")}</p>)}
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ step 3 · Respond: one question per screen

const emptyProgress = (view: RunView): QuizProgress[] => view.questions.map((q) => ({ number: q.number, first: null, firstCorrect: null, second: null, secondCorrect: null, done: false, answer: null }));

function Respond({ view, busy, call, onScored }: { view: RunView; busy: boolean; call: <T>(fn: () => Promise<Result<T>>) => Promise<T | null>; onScored: () => void }) {
  const tr = useT();
  const [prog, setProg] = useState<QuizProgress[]>(() => (view.quiz && view.quiz.length ? view.quiz : emptyProgress(view)));
  const firstOpen = prog.findIndex((p) => !p.done);
  const [idx, setIdx] = useState(firstOpen < 0 ? Math.max(0, prog.length - 1) : firstOpen);
  const [pick, setPick] = useState<string | null>(null);
  const [fb, setFb] = useState<QuestionFeedback | null>(null);
  // 🎯 the time of each FIRST answer (ms since this screen opened or the previous first answer was saved): the server
  // keeps its own clock (answerQuestion) and uses this only to make a time smaller — a reload never breaks it
  const opened = useRef<number>(Date.now());
  const q = view.questions[idx];
  const p = prog[idx];
  const allDone = prog.length > 0 && prog.every((x) => x.done);
  if (!q || !p) return null;
  const retry = p.first !== null && p.firstCorrect === false && !p.done;
  const submit = async () => {
    if (!pick) return;
    const ms = p.first === null ? Math.max(0, Date.now() - opened.current) : null;
    const r = await call(() => answerQuestionAction(view.runId, q.number, pick, ms));
    if (!r) return;
    if (r.try === 1) opened.current = Date.now();
    setFb(r);
    setProg((xs) => xs.map((x) => (x.number !== q.number ? x : r.try === 1
      ? { ...x, first: pick, firstCorrect: r.correct, done: r.done, answer: r.answer }
      : { ...x, second: pick, secondCorrect: r.correct, done: true, answer: r.answer })));
    setPick(null);
  };
  const next = () => { setFb(null); setPick(null); const n = prog.findIndex((x, i) => i > idx && !x.done); setIdx(n >= 0 ? n : Math.min(prog.length - 1, idx + 1)); };
  const message = fb ? (fb.try === 1 ? (fb.correct ? tr("Excellent! You earned 2 points!") : tr("Oops! You answered incorrectly. Try again."))
    : fb.correct ? tr("Nice! You earned 1 point!") : tr("Sorry, that is not right. The correct answer is {answer}.", { answer: fb.answer ?? "" }))
    : retry ? tr("Oops! You answered incorrectly. Try again.") : null;
  const good = fb ? fb.correct : false;
  return (
    <div className="mt-3" data-testid="rr-respond">
      <LookBack body={view.body} title={view.title} />
      <section className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500" data-testid="rr-question-of">{tr("QUESTION {n} OF {total}", { n: idx + 1, total: view.questions.length })}</p>
        <fieldset className="mt-2">
          <legend lang="en" className="text-lg font-semibold text-slate-900"><RichInline text={q.stem} /></legend>
          <div className="mt-3 grid gap-2">
            {q.options.map((o, i) => {
              const l = "ABCD"[i];
              const wrongFirst = p.first === l && p.firstCorrect === false;
              const right = p.done && p.answer === l;
              const locked = p.done || wrongFirst;
              return (
                <label key={l} className={`flex items-start gap-2 rounded-xl px-3 py-2 ring-1 ${right ? "bg-emerald-50 ring-emerald-300" : wrongFirst || (p.second === l && p.secondCorrect === false) ? "bg-rose-50 ring-rose-200" : pick === l ? "bg-teal-50 ring-brand-teal" : "ring-slate-200"} ${locked ? "" : "cursor-pointer"}`}>
                  <input type="radio" name={`rr-q-${q.number}`} checked={pick === l} disabled={locked || busy} onChange={() => setPick(l)} className="mt-1 h-4 w-4 accent-teal-600" />
                  <span><strong>{l}.</strong> <span lang="en"><RichInline text={o} /></span>{right && <span aria-label={tr("correct answer")}> ✓</span>}{wrongFirst && <span aria-label={tr("your answer, wrong")}> ✗</span>}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {message && <p role="status" data-testid="rr-feedback" className={`mt-3 rounded-xl px-3 py-2 font-semibold ${good ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{message}</p>}
        {fb && <AnswerFx scope="readrise" correct={fb.correct} answerKey={`${view.runId}|q${fb.number}|${fb.try}`} className="mt-2" />}
        {fb?.why && fb.done && <p className="mt-2 text-sm text-slate-700">{tr("Why {letter} is right:", { letter: fb.answer ?? "" })} <span lang="en"><RichInline text={fb.why} /></span></p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {!p.done && <button type="button" disabled={busy || !pick} onClick={submit} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">{tr("Submit")}</button>}
          {p.done && !allDone && <button type="button" onClick={next} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{tr("Next question ▶")}</button>}
          {allDone && <button type="button" disabled={busy} onClick={onScored} data-testid="rr-submit-all" className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">{tr("Submit my answers")}</button>}
        </div>
        <p className="mt-3 text-xs text-slate-500">{tr("Your first try is your score")} — {tr("take your time.")}</p>
      </section>
    </div>
  );
}

/** The Results Table: # / question / skill / first try / second try. */
function ResultsTable({ review }: { review: Review[] }) {
  const tr = useT();
  const mark = (ok: boolean | null | undefined) => (ok === null || ok === undefined ? "—" : ok ? "✓" : "✗");
  return (
    <div className="mt-3 overflow-x-auto">
      <table data-testid="rr-results-table" className="w-full min-w-[28rem] text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-slate-600"><th className="py-1 pe-2">#</th><th className="py-1 pe-2">{tr("Skill")}</th><th className="py-1 pe-2">{tr("First Try")}</th><th className="py-1 pe-2">{tr("Second Try")}</th><th className="py-1">{tr("Answer")}</th></tr></thead>
        <tbody>
          {review.map((r, i) => (
            <tr key={r.number} className="border-b border-slate-100 align-top">
              <td className="py-1.5 pe-2 font-semibold">{i + 1}</td>
              <td className="py-1.5 pe-2">{tr(r.skillName ?? "Details")}</td>
              <td className={`py-1.5 pe-2 font-bold ${r.correct ? "text-emerald-700" : "text-rose-700"}`}>{mark(r.correct)}</td>
              <td className={`py-1.5 pe-2 font-bold ${r.secondCorrect ? "text-emerald-700" : r.secondCorrect === false ? "text-rose-700" : "text-slate-400"}`}>{r.correct ? "—" : mark(r.secondCorrect)}</td>
              <td className="py-1.5">
                <strong>{r.answer}</strong>
                {r.why && <details className="text-slate-700"><summary className="cursor-pointer text-brand-teal">{tr("Why?")}</summary><span lang="en"><RichInline text={r.why} /></span></details>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 🏁 After Respond: the Activity Score (first try), the second-try %, points + bonus, and the 75%+ popup. */
function ResultsScreen({ view, headRef, onNext }: { view: RunView; headRef: RefObject<HTMLHeadingElement | null>; onNext: () => void }) {
  const tr = useT();
  const score = view.score ?? 0;
  const pts = view.points ?? { earned: 0, bonus: 0, secondPct: score };
  // points.ts celebrationsOn / the class's badgesOff: no celebration popup when the teacher turned them off
  const [popup, setPopup] = useState(score >= 75 && view.celebrate !== false);
  return (
    <section data-testid="rr-results" className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 ref={headRef} tabIndex={-1} className="text-xl font-bold text-brand-navy outline-none">{tr("Results Table")}</h2>
      {view.celebrate !== false && <AnswerFx scope="readrise" correct={score >= 50} answerKey={`${view.runId}|score`} className="mt-2" />}
      {popup && (
        <div role="dialog" aria-label={tr("Great work!")} data-testid="rr-great-work" className="mt-3 rounded-2xl bg-gradient-to-br from-amber-50 to-white p-4 ring-1 ring-amber-300">
          <p className="text-lg font-bold text-amber-900">🏆 {tr("Great work! You scored 75% or higher")}</p>
          <button type="button" onClick={() => setPopup(false)} className="mt-2 text-sm text-brand-teal underline">{tr("Close")}</button>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">{tr("Activity Score (first try)")}</p><p className="text-3xl font-bold text-brand-navy">{score}%</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">{tr("With second tries")}</p><p className="text-3xl font-bold text-slate-700">{pts.secondPct}%</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">{tr("Points")}</p><p className="text-3xl font-bold text-amber-700">⭐ {pts.earned + pts.bonus}</p></div>
      </div>
      <p className="mt-3 text-slate-800">{tr("You earned {n} points for your answers.", { n: pts.earned })}{pts.bonus ? ` ${tr("You earned {n} bonus points for scoring 75% or higher.", { n: pts.bonus })}` : ""}</p>
      {view.review && <ResultsTable review={view.review} />}
      <button type="button" onClick={onNext} className="mt-5 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{tr(view.step === "DONE" ? "Finish ▶" : "Next: Reflect ▶")}</button>
    </section>
  );
}

// ------------------------------------------------------------------ step 5 · Write

function WriteStep({ view, busy, notesText, onSubmit }: { view: RunView; busy: boolean; notesText: string; onSubmit: (t: string) => void }) {
  const tr = useT();
  const [drafts, setDrafts] = useState<string[]>(() => (view.drafts && view.drafts.length ? view.drafts : [view.writing ?? ""]));
  const [cur, setCur] = useState(() => Math.min(view.draft ?? 0, Math.max(0, (view.drafts?.length ?? 1) - 1)));
  const [tips, setTips] = useState(false);
  const [frames, setFrames] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const text = drafts[cur] ?? "";
  const setText = (t: string) => setDrafts((ds) => ds.map((d, i) => (i === cur ? t.slice(0, 6000) : d)));
  const save = useCallback(async (ds: string[], i: number) => {
    setSaved("saving");
    const r = await saveWritingAction(view.runId, ds[i] ?? "", ds, i).catch(() => null);
    setSaved(r && r.ok ? "saved" : "error");
  }, [view.runId]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { void save(drafts, cur); }, 1500);
    return () => clearTimeout(t);
  }, [drafts, cur, save]);
  const n = countWords(text);
  const notes = view.annotations.filter((a) => a.note);
  return (
    <form className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200" onSubmit={(e) => { e.preventDefault(); if (n >= MIN_WORDS) onSubmit(text); }}>
      <p lang="en" className="text-lg font-semibold text-slate-900"><RichInline text={view.prompt} /></p>
      {view.checklist.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-700">{tr("A strong answer:")}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-800">{view.checklist.map((c, i) => <li key={i} lang="en">{c}</li>)}</ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setTips(!tips)} aria-expanded={tips} data-testid="rr-writing-tips" className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">💡 {tr("Writing Tips")}</button>
        <button type="button" onClick={() => setFrames(!frames)} aria-expanded={frames} data-testid="rr-paragraph-frames" className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">🧩 {tr("Paragraph Frames")}</button>
        <MicButton onText={(t) => setText(addText(text, t))} />
      </div>
      {tips && (
        <div role="dialog" aria-label={tr("Writing Tips")} className="mt-2 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <ol className="list-decimal space-y-1 ps-5 text-sm text-slate-800">{WRITING_TIPS.map((x) => <li key={x}>{tr(x)}</li>)}</ol>
          <button type="button" onClick={() => setTips(false)} className="mt-2 text-sm text-brand-teal underline">{tr("Close")}</button>
        </div>
      )}
      {frames && (
        <ul role="menu" className="mt-2 rounded-xl bg-white p-2 ring-1 ring-slate-300">
          {PARAGRAPH_FRAMES.map((f) => <li key={f.name}><button type="button" role="menuitem" onClick={() => { setText(addText(text, f.text)); setFrames(false); }} className="w-full rounded-lg px-2 py-1.5 text-start text-sm hover:bg-teal-50">{tr(f.name)}</button></li>)}
        </ul>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div role="tablist" aria-label={tr("Drafts")} className="flex flex-wrap items-center gap-1.5">
            {drafts.map((_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === cur} onClick={() => setCur(i)} className={`rounded-t-lg px-3 py-1 text-sm font-semibold ring-1 ${i === cur ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-700 ring-slate-300"}`}>{tr("Draft {n}", { n: i + 1 })}</button>
            ))}
            {drafts.length < MAX_DRAFTS && <button type="button" onClick={() => { setDrafts((ds) => [...ds, ds[cur] ?? ""]); setCur(drafts.length); }} className="rounded-lg px-2 py-1 text-sm text-brand-teal underline">+ {tr("New draft")}</button>}
          </div>
          <label className="sr-only" htmlFor="rr-writing">{tr("My answer")}</label>
          <textarea id="rr-writing" lang="en" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={6000} aria-describedby="rr-count" className="mt-1 w-full rounded-xl border-slate-300 text-base leading-relaxed" />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm">
            <span id="rr-count" className={n >= MIN_WORDS ? "text-emerald-700" : "text-slate-600"}>{tr(n === 1 ? "{n} word" : "{n} words", { n })}{n < MIN_WORDS ? ` — ${tr("at least {n}", { n: MIN_WORDS })}` : " ✓"}</span>
            <span className="text-slate-500" aria-live="polite">{saved === "saving" ? tr("Saving…") : saved === "saved" ? tr("Draft saved ✓") : saved === "error" ? tr("Not saved — check your connection") : ""}</span>
          </div>
        </div>
        <aside className="rounded-xl bg-slate-50 p-3 text-sm" aria-label={tr("My notes")} data-testid="rr-write-notes">
          <p className="font-semibold text-brand-navy">📝 {tr("My notes")}</p>
          {notesText.trim() ? <p lang="en" className="mt-1 whitespace-pre-line text-slate-800">{notesText}</p> : null}
          {notes.length > 0 && <ul className="mt-2 space-y-1">{notes.map((a) => <li key={`${a.start}-${a.end}`} lang="en" className={`rounded px-1 ${HL[a.color as keyof typeof HL]}`}>{a.note}</li>)}</ul>}
          {!notesText.trim() && !notes.length && <p className="mt-1 text-slate-500">{tr("No notes yet.")}</p>}
        </aside>
      </div>
      <LookBack body={view.body} title={view.title} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void save(drafts, cur)} className="rounded-xl bg-white px-5 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{tr("Save for later")}</button>
        <button type="submit" disabled={busy || n < MIN_WORDS} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">{tr("Submit to my teacher ▶")}</button>
      </div>
    </form>
  );
}
