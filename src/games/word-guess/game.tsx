"use client";
/**
 * 🔤 Word Guess (deduction): read the clue (a vocabulary question from the skill's bank) and find the word in up to
 * six guesses. After each guess the letters are coloured: green ✓ = right letter, right place; amber • = in the
 * word, another place; grey = not in the word. Solved within six guesses = correct.
 *
 * Power-ups: Double Points, Extra Time and Shield from the kit; 50/50 greys out half of the letters that are not in
 * the word; Hint shows the first letter (two for long words) and the bank's hint when there is one.
 * Game content stays English, left to right. Typing works with the on-screen keys or a keyboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, LivePadProps, PlayQuestion, PowerEffect, PowerUpId } from "../types";
import { PowerBar } from "../kit/power-bar";
import { guessSpeed, keyStates, liveGuessResponse, MAX_GUESSES, removeLetters, revealCount, scoreGuess, targetOf, validGuess, type LetterState } from "./logic";
import { RichInline } from "../../components/rich-inline";
import { stripMarks } from "../../lib/inline-marks";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const CELL: Record<LetterState | "empty" | "typed" | "given", string> = {
  hit: "bg-emerald-600 text-white ring-emerald-700",
  near: "bg-amber-400 text-slate-900 ring-amber-500",
  miss: "bg-slate-400 text-white ring-slate-500",
  empty: "bg-white text-slate-900 ring-slate-300",
  typed: "bg-white text-slate-900 ring-brand-navy",
  given: "bg-violet-100 text-brand-purple ring-violet-300",
};
const MARK: Partial<Record<LetterState, string>> = { hit: "✓", near: "•" };

/** a small original picture: a magnifying glass over letter tiles */
function Art() {
  return (
    <svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true" className="shrink-0">
      <rect x="2" y="14" width="14" height="14" rx="3" fill="#059669" />
      <rect x="18" y="14" width="14" height="14" rx="3" fill="#fbbf24" />
      <rect x="34" y="14" width="14" height="14" rx="3" fill="#94a3b8" />
      <circle cx="44" cy="16" r="10" fill="#ffffff88" stroke="#1f3a68" strokeWidth="3" />
      <path d="M51 23l9 9" stroke="#1f3a68" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function Cell({ ch, state, size, delay = 0, label }: { ch: string; state: keyof typeof CELL; size: number; delay?: number; label?: string }) {
  const mark = MARK[state as LetterState];
  return (
    <span role="img" aria-label={label ?? ch} className={`relative grid place-items-center rounded-lg font-bold uppercase ring-2 transition-colors duration-300 ${CELL[state]}`}
      style={{ width: size, height: size, fontSize: size * 0.5, transitionDelay: `${delay}ms` }}>
      {ch}
      {mark && <span aria-hidden="true" className="absolute right-0.5 top-0 text-[10px] leading-none opacity-90">{mark}</span>}
    </span>
  );
}

/** On-screen keys (letters coloured by what the guesses showed; greyed-out letters cannot be typed). */
export function Keys({ states = {}, removed = [], onKey, disabled, enterLabel }: { states?: Record<string, LetterState>; removed?: string[]; onKey: (k: string) => void; disabled?: boolean; enterLabel: string }) {
  const t = useT();
  return (
    <div dir="ltr" className="mx-auto w-full max-w-xl select-none space-y-1.5" role="group" aria-label={t("Letters")}>
      {ROWS.map((row, r) => (
        <div key={row} className="flex justify-center gap-1">
          {r === 2 && <button type="button" disabled={disabled} onClick={() => onKey("ENTER")} className="min-h-12 rounded-lg bg-brand-navy px-2 text-sm font-bold text-white disabled:opacity-40 sm:px-3">{enterLabel}</button>}
          {row.split("").map((k) => {
            const st = states[k], gone = removed.includes(k);
            return (
              <button key={k} type="button" disabled={disabled || gone} onClick={() => onKey(k)} aria-label={k}
                className={`min-h-12 min-w-0 flex-1 basis-0 rounded-lg text-lg font-bold transition active:scale-95 sm:max-w-12 ${gone ? "bg-slate-100 text-slate-300 line-through" : st === "hit" ? "bg-emerald-600 text-white" : st === "near" ? "bg-amber-400 text-slate-900" : st === "miss" ? "bg-slate-400 text-white" : "bg-slate-200 text-slate-900 hover:bg-slate-300"} disabled:cursor-default`}>{k}</button>
            );
          })}
          {r === 2 && <button type="button" disabled={disabled} onClick={() => onKey("BACK")} aria-label={t("Delete a letter")} className="min-h-12 rounded-lg bg-slate-300 px-2 text-lg font-bold text-slate-900 disabled:opacity-40 sm:px-3">⌫</button>}
        </div>
      ))}
    </div>
  );
}

/** physical keyboard → the same keys */
function useTyping(onKey: (k: string) => void, on: boolean) {
  const cb = useRef(onKey); cb.current = onKey;
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Enter") { e.preventDefault(); cb.current("ENTER"); }
      else if (e.key === "Backspace") { e.preventDefault(); cb.current("BACK"); }
      else if (/^[a-zA-Z]$/.test(e.key)) cb.current(e.key.toUpperCase());
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [on]);
}

const cellSize = (n: number) => Math.max(36, Math.min(56, Math.floor(330 / n) - 6));

// ------------------------------------------------------------------ solo

export default function WordGuess({ questions, round }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const q = questions[ix] ?? null;
  const target = useMemo(() => (q ? targetOf(q) ?? "" : ""), [q]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [given, setGiven] = useState(0);
  const [removed, setRemoved] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState<{ ok: boolean; points: number; shielded: boolean; doubled: boolean } | null>(null);
  const states = useMemo(() => keyStates(guesses, target), [guesses, target]);

  const next = () => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    setIx(ix + 1); setGuesses([]); setTyped(""); setGiven(0); setRemoved([]); setHint(null); setMsg(null); setDone(null);
  };
  useEffect(() => {
    if (!done?.ok) return;
    const id = setTimeout(next, 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const live = !!q && !!target && !done && !round.over;
  const onKey = useCallback((k: string) => {
    if (!q || !target || done || round.over) return;
    setMsg(null);
    if (k === "BACK") { setTyped((s) => (s.length > given ? s.slice(0, -1) : s)); return; }
    if (k === "ENTER") {
      if (!validGuess(typed, target)) { setMsg(t("Use {n} letters.", { n: target.length })); setShake((x) => x + 1); round.sound("tick"); return; }
      const all = [...guesses, typed.toUpperCase()];
      setGuesses(all);
      const solved = typed.toUpperCase() === target;
      if (solved || all.length >= MAX_GUESSES) {
        const out = round.answer(q, solved, { speed: solved ? guessSpeed(all.length) : 0 });
        setDone({ ok: solved, points: out.points, shielded: out.shielded, doubled: out.doubled });
        if (solved) round.celebrate();
        setTyped("");
      } else setTyped(target.slice(0, given));
      return;
    }
    if (removed.includes(k)) return;
    setTyped((s) => (s.length < target.length ? s + k : s));
  }, [q, target, done, round, given, typed, guesses, removed, t]);
  useTyping(onKey, live);

  /** 50/50 needs "options" for the kit: one per letter group that can be greyed out */
  const powerQ: PlayQuestion | null = useMemo(() => (!q || done ? null : { ...q, options: [{ label: "word", text: target, correct: true }, { label: "a", text: "", correct: false }, { label: "b", text: "", correct: false }] }), [q, done, target]);
  const onEffect = (id: PowerUpId, e: PowerEffect) => {
    if (id === "fifty") setRemoved(removeLetters(target, states));
    if (id === "hint") {
      const n = revealCount(target);
      setGiven(n);
      setTyped((s) => target.slice(0, n) + s.slice(n));
      if (q?.hint) setHint(q.hint);
    }
    void e;
  };

  if (!q || !target) return null;
  const size = cellSize(target.length);
  const rows = Array.from({ length: MAX_GUESSES }, (_, r) => r);
  const stateName: Record<LetterState, string> = { hit: t("right place"), near: t("in the word, another place"), miss: t("not in the word") };
  return (
    <div className="space-y-4" data-testid="word-guess">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Word {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        <span className="text-sm font-semibold text-slate-600">{t("{n} guesses left", { n: MAX_GUESSES - guesses.length })}</span>
      </div>
      <article className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <Art />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-700">{t("Find the word ({n} letters)", { n: target.length })}</p>
          <p dir="ltr" lang="en" className="text-lg font-semibold leading-snug text-slate-900 sm:text-xl"><RichInline text={q.stem} /></p>
        </div>
      </article>
      {q.passage && (
        <details className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en"><RichInline text={q.passage.title} /></span></summary>
          <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800"><RichInline text={q.passage.text} /></p>
        </details>
      )}
      {hint && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}

      <div dir="ltr" className="flex flex-col items-center gap-1.5" role="grid" aria-label={t("Your guesses")}>
        {rows.map((r) => {
          const g = guesses[r];
          const current = r === guesses.length && !done;
          const sc = g ? scoreGuess(g, target) : null;
          return (
            <div key={`${ix}-${r}-${current ? shake : 0}`} role="row" className={`flex gap-1.5 ${current && shake ? "animate-shake" : ""}`}>
              {Array.from({ length: target.length }, (_, c) => {
                if (g && sc) return <Cell key={c} ch={g[c]} state={sc[c]} size={size} delay={c * 90} label={`${g[c]}: ${stateName[sc[c]]}`} />;
                if (current) { const ch = typed[c] ?? ""; return <Cell key={c} ch={ch} state={c < given && ch ? "given" : ch ? "typed" : "empty"} size={size} />; }
                return <Cell key={c} ch="" state="empty" size={size} />;
              })}
            </div>
          );
        })}
      </div>
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600" aria-hidden="true">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-600" /> ✓ {stateName.hit}</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-400" /> • {stateName.near}</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-400" /> {stateName.miss}</span>
      </p>
      {msg && <p role="alert" className="text-center font-semibold text-orange-700">{msg}</p>}

      {done ? (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-xl font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : t("Not quite")}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {!done.ok && <p className="mt-1 text-slate-700">{t("The word was")} <b dir="ltr" lang="en" className="tracking-widest">{target}</b></p>}
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          {!done.ok && <button type="button" onClick={next} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>}
        </div>
      ) : (
        <Keys states={states} removed={removed} onKey={onKey} disabled={round.over} enterLabel={t("Guess")} />
      )}
      <PowerBar round={round} q={powerQ} onEffect={onEffect} />
    </div>
  );
}

// ------------------------------------------------------------------ Live Challenge device (one guess)

export function LivePad({ question, hidden, disabled, submit }: LivePadProps) {
  const t = useT();
  const options = question.options;
  const [typed, setTyped] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { setTyped(""); setPick(null); }, [question.index]);
  const onKey = useCallback((k: string) => {
    if (disabled) return;
    if (k === "BACK") setTyped((s) => s.slice(0, -1));
    else if (k === "ENTER") { const r = liveGuessResponse(undefined, typed); if (r) submit(r); }
    else setTyped((s) => (s.length < 14 ? s + k : s));
  }, [disabled, typed, submit]);
  useTyping(onKey, !options?.length && !disabled);

  if (options?.length) {
    // multiple choice: the word cards — pick the word, then send it
    const shown = options.filter((o) => !hidden.includes(o.label));
    return (
      <div className="space-y-3" data-testid="word-guess-pad">
        <p className="text-center text-sm text-slate-600">{t("One guess: pick the word, then send it.")}</p>
        <div dir="ltr" className="grid gap-2 sm:grid-cols-2">
          {shown.map((o) => {
            const w = stripMarks(o.text).trim().toUpperCase(), on = pick === o.label;
            const sz = cellSize(Math.max(6, w.length)) * 0.75;
            return (
              <button key={o.label} type="button" disabled={disabled} onClick={() => setPick(o.label)} aria-pressed={on} aria-label={stripMarks(o.text)}
                className={`flex min-h-16 flex-wrap items-center justify-center gap-1 rounded-2xl p-3 ring-2 transition active:scale-[.98] ${on ? "bg-violet-50 ring-brand-purple" : "bg-white ring-slate-200 hover:ring-slate-300"}`}>
                {/^[A-Z]+$/.test(w) ? w.split("").map((c, i) => <Cell key={i} ch={c} state={on ? "given" : "empty"} size={sz} />) : <span lang="en" className="text-lg font-semibold"><RichInline text={o.text} /></span>}
              </button>
            );
          })}
        </div>
        <button type="button" disabled={disabled || !pick} onClick={() => pick && submit(pick)}
          className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-navy px-4 text-xl font-semibold text-white disabled:opacity-40">{t("Send my answer")}</button>
      </div>
    );
  }
  // fill in the blank: type the word
  const n = Math.max(5, typed.length);
  return (
    <div className="space-y-3" data-testid="word-guess-pad">
      <p className="text-center text-sm text-slate-600">{t("One guess: type the word, then send it.")}</p>
      <div dir="ltr" className="flex justify-center gap-1.5" aria-live="polite" aria-label={typed || t("Type the word")}>
        {Array.from({ length: n }, (_, c) => <Cell key={c} ch={typed[c] ?? ""} state={typed[c] ? "typed" : "empty"} size={cellSize(n)} />)}
      </div>
      <Keys onKey={onKey} disabled={disabled} enterLabel={t("Send")} />
    </div>
  );
}
