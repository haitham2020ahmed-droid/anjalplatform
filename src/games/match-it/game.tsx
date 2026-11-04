"use client";
/**
 * 🔗 Match It (pairing): every board is one MATCHING question from the skill's bank — match each word or sentence
 * (left) with its meaning or answer (right). Tap a card then its partner, or drag one card onto the other. "Check"
 * scores the whole board like the bank does: right only when every pair is right.
 *
 * Power-ups: Double Points, Extra Time and Shield from the kit; 50/50 matches two pairs for you; Hint matches one
 * pair (and shows the bank's hint when the question has one). Game content stays English, left to right.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, LivePadProps, PlayQuestion, PowerEffect, PowerUpId } from "../types";
import { PowerBar } from "../kit/power-bar";
import { boardSpeed, checkBoard, helpPairs, link, lockIn, matchResponse, scrambleRights, unlink } from "./logic";
import { RichInline } from "../../components/rich-inline";

/** pair colours + a number on every card, so colour is never the only clue */
const PAIR = [
  "bg-sky-500 text-white", "bg-fuchsia-500 text-white", "bg-amber-500 text-slate-900", "bg-emerald-600 text-white",
  "bg-indigo-500 text-white", "bg-rose-500 text-white",
];
const PAIR_RING = ["ring-sky-400", "ring-fuchsia-400", "ring-amber-400", "ring-emerald-500", "ring-indigo-400", "ring-rose-400"];

/** a small original picture: two linked puzzle cards */
function Art() {
  return (
    <svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true" className="shrink-0">
      <rect x="2" y="6" width="24" height="28" rx="6" fill="#0ea5e9" />
      <rect x="38" y="6" width="24" height="28" rx="6" fill="#d946ef" />
      <path d="M26 20h12" stroke="#1f3a68" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 4" />
      <circle cx="26" cy="20" r="4" fill="#fff" stroke="#1f3a68" strokeWidth="2" />
      <circle cx="38" cy="20" r="4" fill="#fff" stroke="#1f3a68" strokeWidth="2" />
      <path d="M9 16h10M9 22h7M45 16h10M45 22h7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** the parts of a pointer event the drag uses */
type PEvent = { clientX: number; clientY: number; pointerId: number; button: number; currentTarget: EventTarget };

type Side = "L" | "R";
interface Drag { side: Side; value: string; x: number; y: number; sx: number; sy: number; moved: boolean }

/** The board (solo and Live Challenge): two columns of cards, tap-to-pair and drag-to-pair. */
export function MatchBoard({ lefts, rights, chosen, onLink, onUnlink, locked = [], marks = null, disabled }: {
  lefts: string[]; rights: string[]; chosen: Record<string, string>;
  onLink: (left: string, right: string) => void; onUnlink: (left: string) => void;
  locked?: string[];
  /** after Check: lefts paired wrong, and the right answer for each left */
  marks?: { wrong: string[]; answer?: Record<string, string> } | null;
  disabled?: boolean;
}) {
  const t = useT();
  const [sel, setSel] = useState<{ side: Side; value: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragged = useRef(false);
  const leftOf = useMemo(() => new Map(Object.entries(chosen).map(([l, r]) => [r, l])), [chosen]);
  const idx = (l: string) => lefts.indexOf(l);
  const off = disabled || !!marks;

  useEffect(() => { if (off) setSel(null); }, [off]);

  const pair = (a: { side: Side; value: string }, b: { side: Side; value: string }) => {
    const l = a.side === "L" ? a.value : b.value, r = a.side === "L" ? b.value : a.value;
    if (locked.includes(l) || (leftOf.get(r) && locked.includes(leftOf.get(r)!))) return;
    onLink(l, r);
  };

  const tap = (side: Side, value: string) => {
    if (off) return;
    if (dragged.current) { dragged.current = false; return; }
    if (side === "L" && locked.includes(value)) return;
    if (side === "R" && leftOf.has(value) && locked.includes(leftOf.get(value)!)) return;
    if (!sel) {
      // tapping a paired left card again (nothing selected) undoes its pair
      setSel({ side, value });
      return;
    }
    if (sel.side === side) {
      if (sel.value === value) { if (side === "L" && chosen[value]) onUnlink(value); else if (side === "R" && leftOf.has(value)) onUnlink(leftOf.get(value)!); setSel(null); return; }
      setSel({ side, value }); return;
    }
    pair(sel, { side, value });
    setSel(null);
  };

  const down = (e: PEvent, side: Side, value: string) => {
    if (off || e.button > 0) return;
    if (side === "L" && locked.includes(value)) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ side, value, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  };
  const move = (e: PEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
  };
  const up = (e: PEvent) => {
    if (!drag) return;
    const d = drag; setDrag(null);
    if (!d.moved) return;   // a tap: the click handler pairs it
    dragged.current = true;
    setTimeout(() => { dragged.current = false; }, 50);
    const el = (document.elementFromPoint?.(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-mi-side]");
    if (!el) return;
    const side = el.dataset.miSide as Side, value = el.dataset.miValue ?? "";
    if (side !== d.side) { pair(d, { side, value }); setSel(null); }
  };

  const card = (side: Side, value: string) => {
    const l = side === "L" ? value : leftOf.get(value) ?? null;
    const n = l !== null && (side === "R" || chosen[value] !== undefined) ? idx(l) : -1;
    const isSel = sel?.side === side && sel.value === value;
    const isLocked = l !== null && locked.includes(l) && n >= 0;
    const wrong = !!marks && side === "L" && marks.wrong.includes(value);
    const wrongR = !!marks && side === "R" && l !== null && marks.wrong.includes(l);
    const right = !!marks && n >= 0 && !wrong && !wrongR;
    return (
      <button key={side + value} type="button" data-mi-side={side} data-mi-value={value} disabled={off}
        onClick={() => tap(side, value)} onPointerDown={(e) => down(e, side, value)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
        aria-pressed={isSel}
        aria-label={n >= 0 ? `${value} — ${t("pair {n}", { n: n + 1 })}` : value}
        style={{ touchAction: "none" }}
        className={`relative flex min-h-14 w-full select-none items-center gap-2 rounded-2xl bg-white px-3 py-2 text-start text-base font-semibold text-slate-900 shadow-sm ring-2 transition active:scale-[.98] sm:text-lg
          ${wrong || wrongR ? "animate-shake bg-red-50 ring-red-500" : isSel ? "-translate-y-0.5 bg-violet-50 shadow-md ring-brand-purple" : n >= 0 ? `${PAIR_RING[n % PAIR_RING.length]} ${right ? "bg-emerald-50" : ""}` : "ring-slate-200 hover:ring-slate-300"}
          ${drag?.value === value && drag.side === side && drag.moved ? "opacity-40" : ""} disabled:cursor-default`}>
        {side === "R" && <Badge n={n} locked={isLocked} />}
        <span lang="en" className="flex-1 break-words">{value}</span>
        {side === "L" && <Badge n={n} locked={isLocked} />}
      </button>
    );
  };

  return (
    <div dir="ltr" className="relative">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-6">
        <div className="space-y-2" role="group" aria-label={t("Words")}>{lefts.map((l) => card("L", l))}</div>
        <div className="space-y-2" role="group" aria-label={t("Meanings")}>{rights.map((r) => card("R", r))}</div>
      </div>
      {marks?.answer && marks.wrong.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-2xl bg-emerald-50 p-3 text-slate-800 ring-1 ring-emerald-200" aria-label={t("The right pairs")}>
          {lefts.filter((l) => marks.wrong.includes(l)).map((l) => <li key={l} lang="en"><b>{l}</b> → {marks.answer![l]}</li>)}
        </ul>
      )}
      {drag?.moved && (
        <div aria-hidden="true" className="pointer-events-none fixed z-50 max-w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-brand-navy px-3 py-2 text-base font-semibold text-white shadow-xl" style={{ left: drag.x, top: drag.y }}>{drag.value}</div>
      )}
    </div>
  );
}

function Badge({ n, locked }: { n: number; locked: boolean }) {
  if (n < 0) return <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-dashed border-slate-300" />;
  return <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${PAIR[n % PAIR.length]}`}>{locked ? "🔒" : n + 1}</span>;
}

// ------------------------------------------------------------------ solo

export default function MatchIt({ questions, round }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const q = questions[ix] ?? null;
  const pairs = useMemo(() => q?.pairs ?? [], [q]);
  const lefts = useMemo(() => pairs.map((p) => p.left), [pairs]);
  const rights = useMemo(() => scrambleRights(pairs), [pairs]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; points: number; shielded: boolean; doubled: boolean; wrong: string[] } | null>(null);
  const startedAt = useRef(Date.now());

  const next = () => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    setIx(ix + 1); setChosen({}); setLocked([]); setHint(null); setDone(null); startedAt.current = Date.now();
  };
  useEffect(() => {
    if (!done?.ok) return;
    const id = setTimeout(next, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const check = () => {
    if (!q || done || round.over) return;
    const res = checkBoard(pairs, chosen);
    const out = round.answer(q, res.correct, { speed: boardSpeed(Date.now() - startedAt.current) });
    setDone({ ok: res.correct, points: out.points, shielded: out.shielded, doubled: out.doubled, wrong: res.wrong });
    if (res.correct) round.celebrate();
  };

  /** the power bar sees a question with "options" (one per pair) so 50/50 can be used on a board of 3+ pairs */
  const powerQ: PlayQuestion | null = useMemo(() => {
    if (!q || done) return null;
    const open = pairs.filter((p) => !locked.includes(p.left));
    return open.length >= 3 ? { ...q, options: open.map((p, i) => ({ label: p.left, text: p.right, correct: i === 0 })) } : { ...q, options: undefined };
  }, [q, pairs, locked, done]);

  const onEffect = (id: PowerUpId, e: PowerEffect) => {
    if (id === "fifty" || id === "hint") {
      const help = helpPairs(pairs, chosen, locked, id === "fifty" ? 2 : 1);
      setChosen((c) => lockIn(pairs, c, help));
      setLocked((l) => [...l, ...help]);
      if (id === "hint" && q?.hint) setHint(q.hint);
    }
    void e;
  };

  if (!q) return null;
  /** Hint / 50/50 only while a pair is still to be found */
  const canHelp = pairs.some((p) => !locked.includes(p.left) && chosen[p.left] !== p.right);
  const all = lefts.every((l) => chosen[l]);
  const answerMap = Object.fromEntries(pairs.map((p) => [p.left, p.right]));
  return (
    <div className="space-y-4" data-testid="match-it">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Board {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        <span className="text-sm font-semibold text-slate-600">{t("{n} of {total} matched", { n: Object.keys(chosen).length, total: lefts.length })}</span>
      </div>
      <article className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <Art />
        <div className="min-w-0">
          <p dir="ltr" lang="en" className="text-lg font-semibold leading-snug text-slate-900 sm:text-xl"><RichInline text={q.stem} /></p>
          <p className="mt-0.5 text-sm text-slate-600">{t("Tap a card, then its partner. Or drag one card onto the other.")}</p>
        </div>
      </article>
      {q.passage && (
        <details className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en"><RichInline text={q.passage.title} /></span></summary>
          <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800"><RichInline text={q.passage.text} /></p>
        </details>
      )}
      {hint && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
      <MatchBoard lefts={lefts} rights={rights} chosen={chosen} locked={locked} disabled={round.over}
        onLink={(l, r) => setChosen((c) => link(c, l, r))} onUnlink={(l) => setChosen((c) => unlink(c, l))}
        marks={done ? { wrong: done.wrong, answer: answerMap } : null} />
      {!done && (
        <button type="button" onClick={check} disabled={!all || round.over} data-testid="match-check"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 text-lg font-semibold text-white transition hover:bg-brand-purple disabled:opacity-40">
          ✓ {t("Check")}
        </button>
      )}
      {done && (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-xl font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : t("{n} pairs to fix", { n: done.wrong.length })}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          {!done.ok && <button type="button" onClick={next} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>}
        </div>
      )}
      <PowerBar round={round} q={powerQ} onEffect={onEffect} only={canHelp ? undefined : ["double", "time", "shield"]} />
    </div>
  );
}

// ------------------------------------------------------------------ Live Challenge device

export function LivePad({ question, disabled, submit }: LivePadProps) {
  const t = useT();
  const lefts = question.left ?? [], rights = question.right ?? [];
  const [chosen, setChosen] = useState<Record<string, string>>({});
  useEffect(() => { setChosen({}); }, [question.index]);
  const resp = matchResponse(lefts, rights, chosen);
  return (
    <div className="space-y-3" data-testid="match-it-pad">
      <p className="text-center text-sm text-slate-600">{t("Tap a card, then its partner. Or drag one card onto the other.")}</p>
      <MatchBoard lefts={lefts} rights={rights} chosen={chosen} disabled={disabled}
        onLink={(l, r) => setChosen((c) => link(c, l, r))} onUnlink={(l) => setChosen((c) => unlink(c, l))} />
      <button type="button" disabled={disabled || !resp} onClick={() => resp && submit(resp)}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-navy px-4 text-xl font-semibold text-white disabled:opacity-40">
        {t("Send my answer")}
      </button>
    </div>
  );
}
