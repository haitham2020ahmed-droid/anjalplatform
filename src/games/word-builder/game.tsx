"use client";
/**
 * 🧱 Word Builder (ordering): build the sentence (or the sequence) from the skill's WORD_ORDER / SENTENCE_ORDER bank
 * questions. Tap a tile to add it to the line (tap it again to take it back), or drag tiles into place. "Check" is
 * right only for the exact order, as the bank scores it.
 *
 * Power-ups: Double Points, Extra Time and Shield from the kit; 50/50 places the next two pieces for you; Hint places
 * the next piece (and shows the bank's hint when the question has one). Game content stays English, left to right.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, LivePadProps, PlayQuestion, PowerEffect, PowerUpId } from "../types";
import { PowerBar } from "../kit/power-bar";
import { buildSpeed, checkOrder, isSentencePieces, lockNext, moveInLine, orderResponse, scramble, type Tile } from "./logic";

const TILE_BG = ["bg-orange-400", "bg-amber-400", "bg-rose-400", "bg-orange-500", "bg-amber-500", "bg-rose-500", "bg-orange-300", "bg-amber-300"];

/** a small original picture: a wall of word bricks */
function Art() {
  return (
    <svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true" className="shrink-0">
      <rect x="2" y="24" width="28" height="13" rx="3" fill="#fb923c" />
      <rect x="34" y="24" width="28" height="13" rx="3" fill="#f59e0b" />
      <rect x="16" y="8" width="28" height="13" rx="3" fill="#f43f5e" transform="rotate(-6 30 14)" />
      <path d="M8 30.5h16M40 30.5h12M22 14h16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** the parts of a pointer event the drag uses */
type PEvent = { clientX: number; clientY: number; pointerId: number; button: number; currentTarget: EventTarget };

interface Drag { id: number; from: "line" | "bank"; x: number; y: number; sx: number; sy: number; moved: boolean }

/** The builder (solo and Live Challenge): the line being built, and the tiles still to use. */
export function Builder({ tiles, line, setLine, locked = 0, marks = null, disabled, sentences }: {
  tiles: Tile[]; line: number[]; setLine: (l: number[]) => void;
  /** the first `locked` tiles of the line were placed by a power-up */
  locked?: number;
  /** after Check: positions in the line that are wrong */
  marks?: { wrongAt: number[] } | null;
  disabled?: boolean;
  sentences?: boolean;
}) {
  const t = useT();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragged = useRef(false);
  const off = disabled || !!marks;
  const bank = tiles.filter((x) => !line.includes(x.id));
  const text = (id: number) => tiles.find((x) => x.id === id)?.text ?? "";
  const color = (id: number) => TILE_BG[id % TILE_BG.length];

  const tapBank = (id: number) => { if (off) return; if (dragged.current) { dragged.current = false; return; } setLine([...line, id]); };
  const tapLine = (id: number, at: number) => { if (off || at < locked) return; if (dragged.current) { dragged.current = false; return; } setLine(line.filter((x) => x !== id)); };

  const down = (e: PEvent, id: number, from: "line" | "bank", at: number) => {
    if (off || e.button > 0 || (from === "line" && at < locked)) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id, from, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  };
  const move = (e: PEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved: drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10 });
  };
  const up = (e: PEvent) => {
    if (!drag) return;
    const d = drag; setDrag(null);
    if (!d.moved) return;
    dragged.current = true;
    setTimeout(() => { dragged.current = false; }, 50);
    const el = (document.elementFromPoint?.(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-wb-zone]");
    if (!el) return;
    if (el.dataset.wbZone === "bank") { if (d.from === "line") setLine(line.filter((x) => x !== d.id)); return; }
    // dropped on a tile of the line: insert before it (after it when dropped on its right half); on the line: the end
    let to = line.length;
    if (el.dataset.wbAt !== undefined) {
      const at = Number(el.dataset.wbAt), r = el.getBoundingClientRect();
      to = (sentences ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2) ? at + 1 : at;
    }
    setLine(moveInLine(line, d.id, Math.max(locked, to)));
  };

  const tile = (id: number, from: "line" | "bank", at: number) => {
    const wrong = !!marks && from === "line" && marks.wrongAt.includes(at);
    const right = !!marks && from === "line" && !wrong;
    const isLocked = from === "line" && at < locked;
    return (
      <button key={id} type="button" disabled={off} data-wb-zone={from} {...(from === "line" ? { "data-wb-at": at } : {})}
        onClick={() => (from === "bank" ? tapBank(id) : tapLine(id, at))}
        onPointerDown={(e) => down(e, id, from, at)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
        aria-label={from === "bank" ? `${text(id)} — ${t("add")}` : `${at + 1}. ${text(id)}${isLocked ? "" : ` — ${t("take back")}`}`}
        style={{ touchAction: "none" }}
        className={`${sentences ? "w-full text-start" : ""} inline-flex min-h-12 max-w-full select-none items-center gap-2 rounded-xl px-3 py-2 text-lg font-semibold shadow-sm ring-2 transition active:scale-95
          ${wrong ? "animate-shake bg-red-100 text-red-900 ring-red-500" : right ? "bg-emerald-100 text-emerald-900 ring-emerald-400" : `${color(id)} text-slate-900 ring-black/5`}
          ${drag?.id === id && drag.moved ? "opacity-40" : ""} disabled:cursor-default`}>
        {from === "line" && <span aria-hidden="true" className="grid h-6 min-w-6 place-items-center rounded-full bg-white/70 px-1 text-xs font-bold text-slate-700">{isLocked ? "🔒" : at + 1}</span>}
        <span lang="en" className="break-words">{text(id)}</span>
      </button>
    );
  };

  return (
    <div dir="ltr" className="space-y-3">
      <div data-wb-zone="line" aria-label={t("Your sentence")} role="group"
        className={`min-h-20 rounded-2xl border-2 border-dashed p-3 ${line.length ? "border-orange-300 bg-orange-50/60" : "border-slate-300 bg-white"} ${sentences ? "space-y-2" : "flex flex-wrap items-center gap-2"}`}>
        {line.length === 0 && <p className="w-full text-center text-slate-500" dir="auto">{t("Tap the pieces in the right order.")}</p>}
        {line.map((id, at) => tile(id, "line", at))}
      </div>
      <div data-wb-zone="bank" aria-label={t("Pieces")} role="group" className={`min-h-14 rounded-2xl bg-slate-100 p-3 ${sentences ? "space-y-2" : "flex flex-wrap justify-center gap-2"}`}>
        {bank.map((x) => tile(x.id, "bank", -1))}
        {bank.length === 0 && !marks && <p className="w-full text-center text-sm text-slate-500" dir="auto">{t("All pieces are in the line.")}</p>}
      </div>
      {drag?.moved && (
        <div aria-hidden="true" className="pointer-events-none fixed z-50 max-w-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-brand-navy px-3 py-2 text-lg font-semibold text-white shadow-xl" style={{ left: drag.x, top: drag.y }}>{text(drag.id)}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ solo

export default function WordBuilder({ questions, round }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const q = questions[ix] ?? null;
  const seq = useMemo(() => q?.sequence ?? [], [q]);
  const tiles = useMemo(() => scramble(seq), [seq]);
  const [line, setLine] = useState<number[]>([]);
  const [locked, setLocked] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; points: number; shielded: boolean; doubled: boolean; wrongAt: number[] } | null>(null);
  const startedAt = useRef(Date.now());

  const next = () => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    setIx(ix + 1); setLine([]); setLocked(0); setHint(null); setDone(null); startedAt.current = Date.now();
  };
  useEffect(() => {
    if (!done?.ok) return;
    const id = setTimeout(next, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const built = line.map((id) => tiles.find((x) => x.id === id)?.text ?? "");
  const check = () => {
    if (!q || done || round.over) return;
    const ok = checkOrder(seq, built);
    const out = round.answer(q, ok, { speed: buildSpeed(Date.now() - startedAt.current) });
    setDone({ ok, points: out.points, shielded: out.shielded, doubled: out.doubled, wrongAt: built.map((x, i) => (x === seq[i] ? -1 : i)).filter((i) => i >= 0) });
    if (ok) round.celebrate();
  };

  /** Hint / 50/50 place pieces: the power bar sees one "option" per piece still to place (50/50 needs 3+) */
  const open = seq.length - locked;
  const powerQ: PlayQuestion | null = useMemo(() => (!q || done ? null : { ...q, options: open >= 3 ? seq.slice(locked).map((x, i) => ({ label: `p${i}`, text: x, correct: i === 0 })) : undefined }), [q, done, open, seq, locked]);
  const onEffect = (id: PowerUpId, e: PowerEffect) => {
    if (id === "fifty" || id === "hint") {
      const r = lockNext(seq, tiles, line, locked, id === "fifty" ? 2 : 1);
      setLine(r.line); setLocked(r.locked);
      if (id === "hint" && q?.hint) setHint(q.hint);
    }
    void e;
  };

  if (!q) return null;
  const sentences = isSentencePieces(seq);
  const canHelp = locked < seq.length - 1;
  return (
    <div className="space-y-4" data-testid="word-builder">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Question {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        <span className="text-sm font-semibold text-slate-600">{t("{n} of {total} placed", { n: line.length, total: seq.length })}</span>
      </div>
      <article className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <Art />
        <p dir="ltr" lang="en" className="min-w-0 text-lg font-semibold leading-snug text-slate-900 sm:text-xl">{q.stem}</p>
      </article>
      {q.passage && (
        <details className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en">{q.passage.title}</span></summary>
          <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800">{q.passage.text}</p>
        </details>
      )}
      {hint && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
      <Builder tiles={tiles} line={line} setLine={setLine} locked={locked} disabled={round.over} sentences={sentences} marks={done && !done.ok ? { wrongAt: done.wrongAt } : done ? { wrongAt: [] } : null} />
      {!done && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setLine(line.slice(0, locked))} disabled={line.length <= locked || round.over}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-40">↺ {t("Start over")}</button>
          <button type="button" onClick={check} disabled={line.length !== seq.length || round.over} data-testid="builder-check"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 text-lg font-semibold text-white transition hover:bg-brand-purple disabled:opacity-40">✓ {t("Check")}</button>
        </div>
      )}
      {done && (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-xl font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : t("Not quite")}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {!done.ok && (
            <div className="mt-2">
              <p className="text-sm font-semibold text-slate-600">{t("The right order")}</p>
              <ol dir="ltr" lang="en" className={`mt-1 ${sentences ? "list-decimal space-y-1 ps-6" : "flex flex-wrap gap-1.5"} text-slate-900`}>
                {seq.map((x, i) => <li key={i} className={sentences ? "" : "rounded-lg bg-white px-2 py-1 font-semibold ring-1 ring-emerald-300"}>{x}</li>)}
              </ol>
            </div>
          )}
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-2 text-slate-700">{q.explain}</p>}
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
  const elements = useMemo(() => question.elements ?? [], [question.elements]);
  const tiles = useMemo(() => elements.map((text, id) => ({ id, text })), [elements]);
  const [line, setLine] = useState<number[]>([]);
  useEffect(() => { setLine([]); }, [question.index]);
  const resp = orderResponse(elements, tiles, line);
  return (
    <div className="space-y-3" data-testid="word-builder-pad">
      <Builder tiles={tiles} line={line} setLine={setLine} disabled={disabled} sentences={isSentencePieces(elements)} />
      <button type="button" disabled={disabled || !resp} onClick={() => resp && submit(resp)}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-brand-navy px-4 text-xl font-semibold text-white disabled:opacity-40">
        {t("Send my answer")}
      </button>
    </div>
  );
}
