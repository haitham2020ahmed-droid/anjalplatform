"use client";
/**
 * 🫧 Word Pop (sorting): the answer choices float up in bubbles — pop ONLY the right ones ("Pop all the verbs").
 * Sorting items (several right words), True/False and short-word multiple choice from the skill's bank questions at
 * the student's level. Bubbles move with requestAnimationFrame (positions written straight to the elements, the loop
 * stops while the tab is hidden), so React only re-renders when a bubble is popped. Tap, click, or Tab + Enter / the
 * number keys. Correct / incorrect is all the result row keeps; points are game points only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, LivePadProps, PlayQuestion, PowerEffect, PowerUpId } from "../types";
import { PowerBar } from "../kit/power-bar";
import { bubbleAt, isSorting, layout, popOutcome, popTargets, RISE_SPEED, type Arena } from "./rules";
import { shuffled, useFrame } from "./frame";

/** a quick answer scores a little more (speed bonus fades over this many seconds) */
const SPEED_SECONDS = 20;
/** bubble colours (soft, original): fill, rim, text */
const HUES = [
  ["#e0f2fe", "#38bdf8", "#0c4a6e"], ["#fce7f3", "#f472b6", "#831843"], ["#ede9fe", "#a78bfa", "#3b0764"],
  ["#dcfce7", "#4ade80", "#14532d"], ["#fef3c7", "#fbbf24", "#78350f"], ["#ffe4e6", "#fb7185", "#881337"],
] as const;

interface Bubble { label: string; text: string; correct: boolean; hue: number }

const bubblesOf = (q: PlayQuestion): Bubble[] => shuffled(q.options ?? []).map((o, i) => ({ label: o.label, text: o.text, correct: o.correct, hue: i % HUES.length }));

export function BubbleFace({ text, hue, size, state }: { text: string; hue: number; size: number; state: "float" | "popped" | "wrong" | "right" | "gone" | "picked" }) {
  const [fill, rim, ink] = HUES[hue % HUES.length];
  const long = text.length > 12;
  return (
    <span aria-hidden="true" className="relative grid h-full w-full place-items-center rounded-full text-center font-semibold leading-tight transition-[transform,opacity] duration-200"
      style={{
        background: `radial-gradient(circle at 32% 28%, #ffffff 0 14%, ${fill} 15% 62%, ${rim}55 100%)`,
        boxShadow: `inset 0 0 0 3px ${rim}, 0 6px 14px ${rim}40`,
        color: ink, fontSize: Math.max(13, Math.round(size / (long ? 7.4 : 5.6))), padding: size * 0.12,
        transform: state === "popped" ? "scale(1.35)" : state === "gone" ? "scale(.6)" : state === "picked" ? "scale(.9)" : undefined,
        opacity: state === "popped" ? 0 : state === "gone" ? 0.25 : 1,
        outline: state === "right" ? "4px solid #10b981" : state === "wrong" ? "4px solid #f97316" : state === "picked" ? "4px dashed #db2777" : undefined, outlineOffset: 3,
      }}>
      <span dir="ltr" lang="en" className="break-words">{text}</span>
      {state === "wrong" && <span className="absolute -top-1 -end-1 grid h-7 w-7 place-items-center rounded-full bg-orange-500 text-sm text-white">✗</span>}
      {state === "right" && <span className="absolute -top-1 -end-1 grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-sm text-white">✓</span>}
    </span>
  );
}

export default function WordPop({ questions, round, level }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const q = questions[ix] ?? null;
  const bubbles = useMemo(() => (q ? bubblesOf(q) : []), [q]);
  const [popped, setPopped] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; points: number; shielded: boolean; doubled: boolean; wrong: string | null } | null>(null);
  const [arena, setArena] = useState<Arena>({ width: 360, height: 360 });
  const boxRef = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  const clock = useRef(0);
  const startedAt = useRef(Date.now());
  /** one answer per question, even if a second tap comes before React re-renders */
  const lock = useRef(false);
  const poppedRef = useRef<string[]>([]);
  const speed = RISE_SPEED[level] ?? RISE_SPEED.ON;

  // the arena's size (bubbles re-flow on rotate / resize)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0) setArena({ width: Math.round(r.width), height: Math.round(r.height) }); };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const place = useCallback((time: number) => {
    bubbles.forEach((_, i) => {
      const el = els.current[i];
      if (!el) return;
      const p = bubbleAt(i, bubbles.length, arena, time, speed);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    });
  }, [bubbles, arena, speed]);

  // first frame placed before paint (no jump), then the loop moves them
  useEffect(() => { if (!done) place(clock.current); }, [place, done]);
  // after an answer the bubbles settle into neat rows, so every right one can be read
  useEffect(() => {
    const list = els.current.slice(0, bubbles.length);
    if (!done) { for (const el of list) if (el) el.style.transition = ""; return; }
    const { cols, size: d } = layout(bubbles.length, arena);
    const rows = Math.ceil(bubbles.length / cols), gap = 12;
    const top = Math.max(8, (arena.height - rows * d - (rows - 1) * gap) / 2);
    list.forEach((el, i) => {
      if (!el) return;
      const r = Math.floor(i / cols), inRow = Math.min(cols, bubbles.length - r * cols), c = i % cols;
      const x0 = (arena.width - inRow * d - (inRow - 1) * gap) / 2;
      el.style.transition = "transform .45s cubic-bezier(.2,.8,.3,1)";
      el.style.transform = `translate3d(${Math.round(x0 + c * (d + gap))}px, ${Math.round(top + r * (d + gap))}px, 0)`;
    });
  }, [done, bubbles, arena]);
  useFrame((dt) => { clock.current += dt; place(clock.current); }, !done && !round.over && !!q);

  const next = useCallback(() => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    setIx(ix + 1); setPopped([]); setHidden([]); setHint(null); setDone(null);
    poppedRef.current = []; lock.current = false;
    clock.current = 0; startedAt.current = Date.now();
  }, [ix, questions.length, round]);

  useEffect(() => {
    if (!done?.ok) return;
    const id = setTimeout(next, 1100);
    return () => clearTimeout(id);
  }, [done, next]);

  const pop = (label: string) => {
    if (!q || done || round.over || lock.current || hidden.includes(label)) return;
    const what = popOutcome(q, poppedRef.current, label);
    if (what === "none") return;
    poppedRef.current = [...poppedRef.current, label];
    setPopped(poppedRef.current);
    if (what === "more") { round.sound("correct"); return; }
    lock.current = true;
    const ok = what === "right";
    const sp = Math.max(0, 1 - (Date.now() - startedAt.current) / 1000 / SPEED_SECONDS);
    const out = round.answer(q, ok, { speed: sp });
    setDone({ ok, points: out.points, shielded: out.shielded, doubled: out.doubled, wrong: ok ? null : label });
    if (ok) round.celebrate();
  };

  // number keys pop bubble 1–6 (Tab + Enter works too: every bubble is a button)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= bubbles.length) { e.preventDefault(); pop(bubbles[n - 1].label); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onEffect = (_id: PowerUpId, e: PowerEffect) => {
    if (e.hide) setHidden(e.hide);
    if (e.hint) setHint(e.hint);
  };

  if (!q) return null;
  const sorting = isSorting(q);
  const targets = popTargets(q);
  const left = targets.filter((l) => !popped.includes(l)).length;
  const { size } = layout(bubbles.length, arena);
  const instruction = sorting ? t("Pop all the right words") : q.type === "TRUE_FALSE" ? t("True or false? Pop one bubble.") : t("Pop the right answer");

  return (
    <div className="space-y-4" data-testid="word-pop">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Question {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        {sorting && !done && <span className="rounded-full bg-pink-100 px-3 py-1 text-sm font-semibold text-pink-800" role="status">{t("{n} left to pop", { n: left })}</span>}
      </div>
      <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {q.passage && (
          <details className="mb-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en">{q.passage.title}</span></summary>
            <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800">{q.passage.text}</p>
          </details>
        )}
        <p className="text-sm font-semibold uppercase tracking-wide text-pink-700">🫧 {instruction}</p>
        <p dir="ltr" lang="en" className="mt-1 text-xl font-semibold leading-relaxed text-slate-900">{q.stem}</p>
        {hint && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
      </article>

      {/* the bubble arena: content is English, left to right */}
      <div ref={boxRef} dir="ltr" className="relative h-[22rem] overflow-hidden rounded-3xl bg-linear-to-b from-sky-100 via-cyan-50 to-indigo-100 ring-1 ring-sky-200 sm:h-[26rem]" role="group" aria-label={instruction}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full" viewBox="0 0 400 60" preserveAspectRatio="none">
          <path d="M0 40 Q 50 20 100 38 T 200 36 T 300 40 T 400 34 V60 H0 Z" fill="#bae6fd" />
          <path d="M0 50 Q 60 36 120 50 T 240 48 T 400 46 V60 H0 Z" fill="#7dd3fc" opacity=".7" />
        </svg>
        {bubbles.map((b, i) => {
          const isPopped = popped.includes(b.label);
          const gone = hidden.includes(b.label);
          const state = done
            ? (done.wrong === b.label ? "wrong" : b.correct ? "right" : "gone")
            : gone ? "gone" : isPopped ? "popped" : "float";
          const lbl = `${i + 1}. ${b.text}`;
          return (
            <button key={b.label} ref={(el) => { els.current[i] = el; }} type="button" data-label={b.label}
              disabled={!!done || round.over || gone || isPopped} onClick={() => pop(b.label)} aria-label={lbl}
              className="absolute start-0 top-0 touch-manipulation rounded-full will-change-transform focus-visible:outline-4 focus-visible:outline-brand-teal disabled:cursor-default"
              style={{ width: size, height: size, transform: "translate3d(-200px,-200px,0)" }}>
              <BubbleFace text={b.text} hue={b.hue} size={size} state={state} />
            </button>
          );
        })}
      </div>

      {done && (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-xl font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : t("Not quite")}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {!done.ok && <p className="mt-1 text-slate-700">{t("The right bubbles have a ✓.")}</p>}
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          {!done.ok && <button type="button" onClick={next} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>}
        </div>
      )}
      <PowerBar round={round} q={done ? null : q} onEffect={onEffect} />
    </div>
  );
}

/**
 * The student's device in a Live Challenge: the choices as gently bobbing bubbles (CSS only). One-answer items pop
 * one bubble and send it; sorting items pop every right word, then "Done" sends the popped words.
 */
export function LivePad({ question, hidden, disabled, submit }: LivePadProps) {
  const t = useT();
  const [popped, setPopped] = useState<string[]>([]);
  const sorting = question.type === "MULTI_SELECT";
  const opts = question.options ?? [];
  useEffect(() => { setPopped([]); }, [question.index]);
  const tap = (label: string) => {
    if (disabled) return;
    if (!sorting) { setPopped([label]); submit(label); return; }
    setPopped((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  };
  return (
    <div className="space-y-3" data-testid="word-pop-pad">
      <style>{"@keyframes wp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@media (prefers-reduced-motion: reduce){.wp-bob{animation:none!important}}"}</style>
      <p className="text-center text-sm font-semibold text-pink-700">🫧 {sorting ? t("Pop all the right words, then send them.") : question.type === "TRUE_FALSE" ? t("True or false? Pop one bubble.") : t("Pop the right answer")}</p>
      <div dir="ltr" className="grid grid-cols-2 place-items-center gap-3 rounded-3xl bg-linear-to-b from-sky-100 to-indigo-100 p-4 ring-1 ring-sky-200 sm:grid-cols-3">
        {opts.map((o, i) => {
          // 50/50 on a sorting item could name a right word: a sorting pad keeps every bubble
          const gone = !sorting && hidden.includes(o.label);
          const on = popped.includes(o.label);
          return (
            <button key={o.label} type="button" disabled={disabled || gone} onClick={() => tap(o.label)} aria-pressed={sorting ? on : undefined} aria-label={o.text}
              className={`wp-bob h-28 w-28 touch-manipulation rounded-full sm:h-32 sm:w-32 ${gone ? "invisible" : ""}`} style={{ animation: `wp-bob ${2.4 + (i % 3) * 0.4}s ease-in-out ${i * 0.3}s infinite` }}>
              <BubbleFace text={o.text} hue={i} size={112} state={on ? "picked" : "float"} />
            </button>
          );
        })}
      </div>
      {sorting && (
        <button type="button" disabled={disabled || !popped.length} onClick={() => submit(popped)}
          className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-pink-600 px-4 text-xl font-semibold text-white shadow disabled:opacity-50">{t("Send my words")} ({popped.length})</button>
      )}
    </div>
  );
}
