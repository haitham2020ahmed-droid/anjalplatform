"use client";
/**
 * 🏃 Lane Runner (action): the runner moves forward; a row of gates — one answer choice per lane — comes towards
 * them. Switch to the lane with the right answer before the gates arrive, or Dash through early for more points.
 * Multiple choice (2–4 short choices) and True/False from the skill's bank questions at the student's level.
 * Arrow keys / A D, swipe, tap a lane, or the big buttons. The track moves with requestAnimationFrame (styles written
 * straight to the elements; the loop stops while the tab is hidden). Correct / incorrect is all the result row keeps.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { TILES } from "@/components/game/tiles";
import type { GameProps, LivePadProps, PlayQuestion, PowerEffect, PowerUpId } from "../types";
import { PowerBar } from "../kit/power-bar";
import { APPROACH_SECONDS, dashSpeed, gateProgress, moveLane, nearestOpen, startLane } from "./rules";
import { shuffled, useFrame } from "./frame";
import { RichInline } from "../../components/rich-inline";
import { stripMarks } from "../../lib/inline-marks";

interface Lane { label: string; text: string; correct: boolean }
const lanesOf = (q: PlayQuestion): Lane[] => (q.type === "TRUE_FALSE" ? (q.options ?? []) : shuffled(q.options ?? [])).map((o) => ({ label: o.label, text: o.text, correct: o.correct }));

/** the runner (original, code-drawn): a round sprout-headed kid with a headband */
export function Runner({ pose }: { pose: "run" | "jump" | "trip" | "idle" }) {
  return (
    <svg viewBox="0 0 64 80" className={`h-full w-full ${pose === "trip" ? "animate-shake" : ""}`} aria-hidden="true">
      <style>{"@keyframes lr-leg{0%,100%{transform:rotate(28deg)}50%{transform:rotate(-28deg)}}@keyframes lr-arm{0%,100%{transform:rotate(-30deg)}50%{transform:rotate(30deg)}}.lr-run .lr-l1{animation:lr-leg .42s linear infinite}.lr-run .lr-l2{animation:lr-leg .42s linear infinite reverse}.lr-run .lr-a1{animation:lr-arm .42s linear infinite}.lr-run .lr-a2{animation:lr-arm .42s linear infinite reverse}@media (prefers-reduced-motion: reduce){.lr-run *{animation:none!important}}"}</style>
      <g className={pose === "run" ? "lr-run" : ""} style={{ transform: pose === "jump" ? "translateY(-10px)" : undefined, transition: "transform .2s" }}>
        <ellipse cx="32" cy="76" rx="14" ry="3" fill="#0f172a" opacity=".18" />
        <g className="lr-l1" style={{ transformOrigin: "28px 52px" }}><path d="M28 52 L25 70" stroke="#1f3a68" strokeWidth="6" strokeLinecap="round" /><path d="M25 70 h-6" stroke="#f97316" strokeWidth="5" strokeLinecap="round" /></g>
        <g className="lr-l2" style={{ transformOrigin: "36px 52px" }}><path d="M36 52 L39 70" stroke="#1f3a68" strokeWidth="6" strokeLinecap="round" /><path d="M39 70 h6" stroke="#f97316" strokeWidth="5" strokeLinecap="round" /></g>
        <g className="lr-a1" style={{ transformOrigin: "24px 36px" }}><path d="M24 36 L16 46" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" /></g>
        <g className="lr-a2" style={{ transformOrigin: "40px 36px" }}><path d="M40 36 L48 46" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" /></g>
        <rect x="22" y="32" width="20" height="22" rx="8" fill="#1fa3a3" />
        <circle cx="32" cy="22" r="12" fill="#fcd9b6" />
        <path d="M20 19 Q32 11 44 19" stroke="#ec4899" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M32 10 q-2 -7 -8 -7 q4 3 8 7 q2 -7 8 -7 q-4 3 -8 7" fill="#22c55e" />
        <circle cx="28" cy="23" r="1.6" fill="#1e293b" /><circle cx="36" cy="23" r="1.6" fill="#1e293b" />
        <path d={pose === "trip" ? "M28 29 q4 -3 8 0" : "M28 28 q4 3 8 0"} stroke="#1e293b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** a gate sign over one lane */
function Gate({ lane, i, blocked, state }: { lane: Lane; i: number; blocked: boolean; state: "open" | "right" | "wrong" | "dim" | "picked" }) {
  const tile = TILES[i % TILES.length];
  return (
    <div className={`mx-1 flex min-h-16 flex-col items-center justify-center rounded-xl px-1.5 py-1 text-center text-sm font-semibold shadow-md sm:text-base ${blocked ? "bg-slate-300 text-slate-500" : `${tile.bg} text-white`} ${state === "right" ? "ring-4 ring-emerald-300" : state === "wrong" ? "ring-4 ring-white" : state === "picked" ? "-translate-y-1 ring-4 ring-brand-navy" : ""} ${state === "dim" ? "opacity-40" : ""}`}>
      <span aria-hidden="true" className="text-xs opacity-90">{blocked ? "✕" : tile.shape}</span>
      <span dir="ltr" lang="en" className={`leading-tight break-words ${blocked ? "line-through" : ""}`}><RichInline text={lane.text} /></span>
      {state === "right" && <span aria-hidden="true">✓</span>}
    </div>
  );
}

export default function LaneRunner({ questions, round, level }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const q = questions[ix] ?? null;
  const lanes = useMemo(() => (q ? lanesOf(q) : []), [q]);
  const n = lanes.length;
  const [lane, setLane] = useState(() => startLane(n));
  const [blocked, setBlocked] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [approach, setApproach] = useState(APPROACH_SECONDS[level] ?? APPROACH_SECONDS.ON);
  const [done, setDone] = useState<{ ok: boolean; points: number; shielded: boolean; doubled: boolean; at: number } | null>(null);
  const [height, setHeight] = useState(352);
  const boxRef = useRef<HTMLDivElement>(null);
  const gatesRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const scroll = useRef(0);
  const laneRef = useRef(lane); laneRef.current = lane;
  const swipe = useRef<{ x: number; y: number } | null>(null);
  /** one answer per question, even if a frame or a second tap comes before React re-renders */
  const lock = useRef(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => { const h = el.getBoundingClientRect().height; if (h > 0) setHeight(Math.round(h)); };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const GATE_H = 76, RUNNER_H = 96;
  /** the ground pattern repeats every 180 px (30 px planks, 36 px lane dashes) */
  const STRIPE = 180;
  const travel = Math.max(40, height - RUNNER_H - GATE_H - 8);

  const draw = useCallback((p: number) => {
    if (gatesRef.current) gatesRef.current.style.transform = `translate3d(0, ${Math.round(p * travel)}px, 0)`;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(0, ${Math.round(scroll.current % STRIPE)}px, 0)`;
    if (meterRef.current) meterRef.current.style.transform = `scaleX(${1 - p})`;
  }, [travel]);

  const resolve = useCallback((progress: number) => {
    if (!q || done || round.over || lock.current) return;
    lock.current = true;
    const l = lanes[laneRef.current];
    const ok = !!l?.correct;
    const out = round.answer(q, ok, { speed: dashSpeed(progress) });
    setDone({ ok, points: out.points, shielded: out.shielded, doubled: out.doubled, at: laneRef.current });
    if (ok) round.celebrate();
  }, [q, done, round, lanes]);

  const running = !done && !round.over && !!q;
  useEffect(() => { draw(gateProgress(elapsed.current, approach)); }, [draw, approach, ix]);
  useFrame((dt) => {
    elapsed.current += dt;
    scroll.current += dt * 160;
    const p = gateProgress(elapsed.current, approach);
    draw(p);
    if (p >= 1) resolve(1);
  }, running);

  const next = useCallback(() => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    const nq = questions[ix + 1];
    setIx(ix + 1); setBlocked([]); setHint(null); setDone(null); setLane(startLane(nq?.options?.length ?? 2));
    setApproach(APPROACH_SECONDS[level] ?? APPROACH_SECONDS.ON);
    elapsed.current = 0; lock.current = false;
  }, [ix, questions, round, level]);

  useEffect(() => {
    if (!done?.ok) return;
    const id = setTimeout(next, 1100);
    return () => clearTimeout(id);
  }, [done, next]);

  const move = useCallback((dir: -1 | 1) => { if (!running) return; setLane((l) => moveLane(l, dir, n, blocked)); }, [running, n, blocked]);
  const goTo = (l: number) => { if (running && l >= 0 && l < n && !blocked.includes(l)) setLane(l); };
  const dash = () => { if (running) resolve(gateProgress(elapsed.current, approach)); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || !running) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); move(-1); }
      else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); move(1); }
      else if (k === "ArrowUp" || k === "w" || k === "W" || ((k === "Enter" || k === " ") && tag !== "BUTTON")) { e.preventDefault(); dash(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onEffect = (_id: PowerUpId, e: PowerEffect) => {
    if (e.hide) { const b = lanes.map((l, i) => (e.hide!.includes(l.label) ? i : -1)).filter((i) => i >= 0); setBlocked(b); setLane((l) => nearestOpen(l, n, b)); }
    if (e.hint) setHint(e.hint);
    if (e.extraSeconds) setApproach((a) => a + e.extraSeconds!);
  };

  if (!q) return null;
  const right = lanes.findIndex((l) => l.correct);
  const pose = done ? (done.ok ? "jump" : "trip") : round.over ? "idle" : "run";
  const laneW = 100 / Math.max(1, n);

  return (
    <div className="space-y-4" data-testid="lane-runner">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Question {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        <span className="flex items-center gap-1 text-sm font-semibold text-lime-800" aria-label={t("Finish line")}>
          <span aria-hidden="true">🏁</span>
          <span className="h-2 w-24 overflow-hidden rounded-full bg-lime-100 sm:w-40" aria-hidden="true"><span className="block h-full bg-lime-500 transition-[width]" style={{ width: `${(ix / questions.length) * 100}%` }} /></span>
        </span>
      </div>
      <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        {q.passage && (
          <details className="mb-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en"><RichInline text={q.passage.title} /></span></summary>
            <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800"><RichInline text={q.passage.text} /></p>
          </details>
        )}
        <p dir="ltr" lang="en" className="text-xl font-semibold leading-relaxed text-slate-900"><RichInline text={q.stem} /></p>
        {hint && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
      </article>

      {/* the track (English content, left to right): gates come down, the runner is at the bottom */}
      <div ref={boxRef} dir="ltr" role="group" aria-label={t("Switch to the lane with the right answer")}
        className="relative h-[22rem] touch-pan-y select-none overflow-hidden rounded-3xl bg-lime-200 ring-1 ring-lime-300 sm:h-[24rem]"
        onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const s = swipe.current; swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(e.clientY - s.y)) { move(dx > 0 ? 1 : -1); return; }
          const r = boxRef.current?.getBoundingClientRect();
          if (r) goTo(Math.floor(((e.clientX - r.left) / r.width) * n));
        }}>
        <div aria-hidden="true" className="absolute inset-y-0 inset-x-3 overflow-hidden rounded-2xl bg-amber-100 sm:inset-x-6">
          {/* the moving ground: one tall layer slid with a transform (composited — no repaint per frame) */}
          <div ref={trackRef} className="absolute inset-x-0 bottom-0 will-change-transform" style={{ top: -STRIPE, backgroundImage: "repeating-linear-gradient(180deg, transparent 0 26px, #fde68a 26px 30px)" }}>
            {lanes.slice(1).map((_, i) => <span key={i} className="absolute inset-y-0 w-1" style={{ left: `calc(${laneW * (i + 1)}% - 2px)`, backgroundImage: "repeating-linear-gradient(180deg, #ffffff 0 18px, transparent 18px 36px)" }} />)}
          </div>
        </div>
        <div ref={gatesRef} className="absolute inset-x-3 top-0 flex will-change-transform sm:inset-x-6" style={{ height: GATE_H }}>
          {lanes.map((l, i) => (
            <div key={l.label} className="flex-1" style={{ width: `${laneW}%` }}>
              <Gate lane={l} i={i} blocked={blocked.includes(i)} state={done ? (i === right ? "right" : i === done.at ? "wrong" : "dim") : "open"} />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-x-3 bottom-2 sm:inset-x-6" style={{ height: RUNNER_H }}>
          <div className="absolute bottom-0 h-full transition-[left] duration-150 ease-out" style={{ left: `${laneW * lane}%`, width: `${laneW}%` }}>
            <div className="mx-auto h-full w-16"><Runner pose={pose} /></div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-lime-300/60" aria-hidden="true"><div ref={meterRef} className="h-full origin-left bg-lime-600" /></div>
        <p className="sr-only" aria-live="polite">{lanes[lane] ? t("Lane {n}", { n: lane + 1 }) : ""} <span lang="en">{stripMarks(lanes[lane]?.text ?? "")}</span></p>
      </div>

      {!done && (
        <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3" dir="ltr">
          <button type="button" onClick={() => move(-1)} disabled={!running} aria-label={t("Move left")} className="min-h-14 rounded-2xl bg-white text-2xl font-bold text-brand-navy shadow-sm ring-1 ring-slate-300 active:scale-95 disabled:opacity-40">◀</button>
          <button type="button" onClick={dash} disabled={!running} className="min-h-14 rounded-2xl bg-lime-600 text-lg font-semibold text-white shadow active:scale-95 disabled:opacity-40">⚡ {t("Dash")}</button>
          <button type="button" onClick={() => move(1)} disabled={!running} aria-label={t("Move right")} className="min-h-14 rounded-2xl bg-white text-2xl font-bold text-brand-navy shadow-sm ring-1 ring-slate-300 active:scale-95 disabled:opacity-40">▶</button>
        </div>
      )}
      {!done && <p className="text-center text-sm text-slate-600">{t("Use the arrow keys, swipe, or tap a lane. Dash to answer now.")}</p>}

      {done && (
        <div role="status" className={`rounded-2xl p-4 ${done.ok ? "animate-pop bg-emerald-50 ring-2 ring-emerald-300" : "animate-shake bg-orange-50 ring-2 ring-orange-300"}`}>
          <p className={`text-xl font-semibold ${done.ok ? "text-emerald-800" : "text-orange-800"}`}>
            {done.ok ? t("Correct! +{n}", { n: done.points }) : t("Not quite")}
            {done.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}
            {done.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}
          </p>
          {!done.ok && q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          {!done.ok && <button type="button" onClick={next} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>}
        </div>
      )}
      <PowerBar round={round} q={done ? null : q} onEffect={onEffect} />
    </div>
  );
}

/**
 * The student's device in a Live Challenge: the lanes with their gates and the runner. Tap a lane (or ← →) to move,
 * then Run! (or Enter) to send that lane's answer. The room's own timer runs the question.
 */
export function LivePad({ question, hidden, disabled, submit }: LivePadProps) {
  const t = useT();
  const opts = question.options ?? [];
  const n = opts.length;
  const blocked = opts.map((o, i) => (hidden.includes(o.label) ? i : -1)).filter((i) => i >= 0);
  const [lane, setLane] = useState(() => startLane(n));
  useEffect(() => { setLane(startLane(n)); }, [question.index, n]);
  useEffect(() => { setLane((l) => nearestOpen(l, n, blocked)); }, [hidden.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = () => { if (!disabled && opts[lane] && !blocked.includes(lane)) submit(opts[lane].label); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setLane((l) => moveLane(l, -1, n, blocked)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setLane((l) => moveLane(l, 1, n, blocked)); }
      else if (e.key === "Enter" && (e.target as HTMLElement | null)?.tagName !== "BUTTON") { e.preventDefault(); run(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const laneW = 100 / Math.max(1, n);
  return (
    <div className="space-y-3" data-testid="lane-runner-pad">
      <div dir="ltr" className="relative h-72 overflow-hidden rounded-3xl bg-lime-200 p-3 ring-1 ring-lime-300">
        <div aria-hidden="true" className="absolute inset-y-0 inset-x-3 rounded-2xl bg-amber-100" style={{ backgroundImage: "repeating-linear-gradient(180deg, transparent 0 26px, #fde68a 26px 30px)" }} />
        <div className="relative flex gap-0" role="radiogroup" aria-label={t("Switch to the lane with the right answer")}>
          {opts.map((o, i) => (
            <button key={o.label} type="button" role="radio" aria-checked={lane === i} disabled={disabled || blocked.includes(i)} onClick={() => setLane(i)} className="min-h-44 flex-1 touch-manipulation text-start" style={{ width: `${laneW}%` }}>
              <Gate lane={{ label: o.label, text: o.text, correct: false }} i={i} blocked={blocked.includes(i)} state={lane === i ? "picked" : "open"} />
            </button>
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-x-3 bottom-2 h-20">
          <div className="absolute bottom-0 h-full transition-[left] duration-150" style={{ left: `${laneW * lane}%`, width: `${laneW}%` }}><div className="mx-auto h-full w-14"><Runner pose="run" /></div></div>
        </div>
      </div>
      <button type="button" onClick={run} disabled={disabled || blocked.includes(lane)} className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-lime-600 px-4 text-xl font-semibold text-white shadow disabled:opacity-50">🏃 {t("Run!")}</button>
    </div>
  );
}
