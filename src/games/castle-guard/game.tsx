"use client";
/**
 * 🏰 Castle Guard (strategy): right answers earn castle coins; spend them on walls, archer towers and cannons.
 * After every 3 answers a wave of gloom-blobs walks up to the castle — defences stop them, the rest cost a heart.
 * Keep the castle standing until the last question. Castle coins are this round's game coins only (not the
 * student's coin wallet). Multiple choice and True/False from the skill's bank questions; correct / incorrect is
 * all the result row keeps. Live Challenge uses the shared answer tiles and the Live Board.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps } from "../types";
import { Ask, FinishBanner } from "../rocket-race/ask";
import { afterWave, BUILDINGS, build, canBuild, coinsFor, newCastle, resolveWave, START_HEARTS, waveAfter, waveCount, waveSize, WAVE_EVERY, type BuildId, type Castle, type WaveResult } from "./rules";

const W = 360, H = 170, GROUND = 140, CASTLE_X = 268;
const BUILD_ICON: Record<BuildId, string> = { wall: "🧱", archer: "🏹", cannon: "💣", repair: "❤️" };

/** A gloom-blob (original): a round purple creature with one big eye. */
function Blob() {
  return (
    <g>
      <ellipse cx="0" cy="-9" rx="11" ry="10" fill="#7e22ce" />
      <ellipse cx="0" cy="-1" rx="12" ry="3" fill="#581c87" opacity="0.6" />
      <circle cx="2" cy="-11" r="4.2" fill="#fff" /><circle cx="3" cy="-11" r="2" fill="#111827" />
      <path d="M-6 -19 L-3 -24 L0 -19 M3 -19 L6 -24 L8 -18" stroke="#7e22ce" strokeWidth="2" fill="none" />
    </g>
  );
}

function CastleArt({ c }: { c: Castle }) {
  const hurt = c.hearts <= 2;
  return (
    <g>
      {/* walls in front of the castle */}
      {Array.from({ length: c.def.wall }, (_, i) => (
        <g key={`w${i}`} transform={`translate(${CASTLE_X - 28 - i * 16} ${GROUND})`}>
          <rect x="-6" y="-22" width="12" height="22" fill="#a8a29e" stroke="#57534e" />
          <path d="M-6 -11 H6 M0 -22 V-11 M-3 -11 V0 M3 -11 V0" stroke="#78716c" strokeWidth="1" />
        </g>
      ))}
      {/* the keep */}
      <g transform={`translate(${CASTLE_X} ${GROUND})`}>
        <rect x="0" y="-70" width="70" height="70" fill={hurt ? "#d6d3d1" : "#e7e5e4"} stroke="#57534e" strokeWidth="2" />
        <path d="M0 -70 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10 h10 v-10 h10 v10" fill="#e7e5e4" stroke="#57534e" strokeWidth="2" />
        <path d="M25 0 v-22 a10 10 0 0 1 20 0 v22Z" fill="#78350f" />
        <rect x="10" y="-55" width="9" height="13" rx="4" fill="#1e293b" /><rect x="51" y="-55" width="9" height="13" rx="4" fill="#1e293b" />
        <line x1="35" y1="-80" x2="35" y2="-104" stroke="#57534e" strokeWidth="2" />
        <path d="M35 -104 l18 6 l-18 6Z" fill="#7c3aed" />
        {hurt && <path d="M8 -30 l10 6 l-4 8 M58 -20 l-8 4" stroke="#57534e" strokeWidth="1.5" fill="none" />}
      </g>
      {/* archer towers and cannons on the hill in front */}
      {Array.from({ length: c.def.archer }, (_, i) => (
        <g key={`a${i}`} transform={`translate(${200 - i * 26} ${GROUND})`}>
          <rect x="-7" y="-34" width="14" height="34" fill="#d6d3d1" stroke="#57534e" />
          <path d="M-9 -34 L0 -46 L9 -34Z" fill="#0d9488" />
          <rect x="-2" y="-27" width="4" height="7" fill="#1e293b" />
        </g>
      ))}
      {Array.from({ length: c.def.cannon }, (_, i) => (
        <g key={`c${i}`} transform={`translate(${130 - i * 30} ${GROUND})`}>
          <rect x="-12" y="-14" width="20" height="9" rx="4" fill="#334155" transform="rotate(-18 0 -10)" />
          <circle cx="-4" cy="-4" r="5" fill="#78350f" /><circle cx="6" cy="-4" r="5" fill="#78350f" />
        </g>
      ))}
    </g>
  );
}

type Phase = "ask" | "wave" | "waveDone" | "over";

export default function CastleGuard({ questions, round }: GameProps) {
  const t = useT();
  const [ix, setIx] = useState(0);
  const [castle, setCastle] = useState<Castle>(newCastle);
  const [phase, setPhase] = useState<Phase>("ask");
  const [wave, setWave] = useState<{ n: number; res: WaveResult } | null>(null);
  const [earned, setEarned] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const castleRef = useRef(castle); castleRef.current = castle;
  const streakRef = useRef(0);
  const wavesDone = useRef(0);
  const blobsRef = useRef<SVGGElement>(null);
  const total = questions.length;
  const waves = waveCount(total);

  // the wave walks up (requestAnimationFrame moves the blobs; stopped ones fade at the defences)
  useEffect(() => {
    if (phase !== "wave" || !wave) return;
    let raf = 0; const start = performance.now(); const DUR = 2600;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / DUR);
      const g = blobsRef.current;
      if (g) {
        [...g.children].forEach((el, i) => {
          const stopAt = i < wave.res.stopped ? 0.55 + (i % 3) * 0.08 : i < wave.res.stopped + wave.res.blocked ? 0.8 : 1;
          const kk = Math.min(k * 1.15 - i * 0.05, stopAt);
          const x = 10 + Math.max(0, kk) * (CASTLE_X - 22);
          const hop = Math.abs(Math.sin((now / 160) + i)) * 4;
          const gone = kk >= stopAt && stopAt < 1;
          el.setAttribute("transform", `translate(${x} ${GROUND - hop})`);
          el.setAttribute("opacity", gone ? String(Math.max(0, 1 - (k * 1.15 - i * 0.05 - stopAt) * 4)) : "1");
        });
      }
      if (k < 1) raf = requestAnimationFrame(tick);
      else setPhase("waveDone");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, wave]);

  const q = questions[ix] ?? null;
  const onAnswered = (ok: boolean) => {
    const coins = coinsFor(ok, streakRef.current);
    streakRef.current = ok ? streakRef.current + 1 : 0;
    if (coins) setCastle((c) => ({ ...c, coins: c.coins + coins }));
    setEarned(coins ? t("+{n} castle coins", { n: coins }) : null);
    setAnswered(true);
  };
  const startWave = () => {
    const n = wavesDone.current + 1;
    wavesDone.current = n;
    const res = resolveWave(castleRef.current.def, waveSize(n));
    setWave({ n, res }); setPhase("wave");
    round.sound(res.through ? "wrong" : "power");
  };
  const onNext = () => {
    if (phase !== "ask") return;
    if (waveAfter(ix + 1, total)) { startWave(); return; }
    advance();
  };
  const advance = () => {
    if (ix + 1 >= total || castleRef.current.hearts <= 0) { setPhase("over"); return; }
    setIx(ix + 1); setAnswered(false); setEarned(null); setPhase("ask");
  };
  const afterWaveDone = () => {
    if (!wave) return;
    const next = afterWave(castleRef.current, wave.res);
    setCastle(next);
    if (next.hearts <= 0 || ix + 1 >= total) { setPhase("over"); if (next.hearts > 0) round.celebrate(); return; }
    setWave(null); advance();
  };
  const doBuild = (id: BuildId) => {
    const c = build(castleRef.current, id);
    if (!c) return;
    setCastle(c); round.sound("power");
  };

  if (!q) return null;
  const nextWaveIn = WAVE_EVERY - ((ix + (answered ? 1 : 0)) % WAVE_EVERY);
  const showWave = phase === "wave" || phase === "waveDone";
  const fell = castle.hearts <= 0;
  return (
    <div className="space-y-4" data-testid="castle-guard">
      <figure className="overflow-hidden rounded-3xl bg-gradient-to-b bg-linear-to-b from-sky-200 to-sky-50 shadow ring-1 ring-slate-200">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto max-h-64 w-full" role="img" aria-label={t("Your castle: {h} hearts, {c} castle coins", { h: castle.hearts, c: castle.coins })} style={{ direction: "ltr", overflow: "visible" }}>
          <circle cx="40" cy="30" r="16" fill="#fde047" />
          <rect x={-2000} y={GROUND - 1} width={2000} height="2" fill="#86efac" />
          <path d={`M0 ${GROUND} Q90 ${GROUND - 14} 180 ${GROUND} T${W} ${GROUND} V${H} H0Z`} fill="#86efac" />
          <rect x={-2000} y={GROUND} width={W + 4000} height={H - GROUND} fill="#4ade80" />
          <CastleArt c={castle} />
          {showWave && wave && (
            <g ref={blobsRef}>
              {Array.from({ length: wave.res.blobs }, (_, i) => <g key={i} transform={`translate(10 ${GROUND})`}><Blob /></g>)}
            </g>
          )}
        </svg>
        <figcaption className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2 text-sm font-semibold text-brand-navy">
          <span className="flex items-center gap-3">
            <span aria-label={t("{n} hearts", { n: castle.hearts })} dir="ltr">{"❤️".repeat(castle.hearts)}<span className="opacity-30">{"🤍".repeat(Math.max(0, START_HEARTS - castle.hearts))}</span></span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900" data-testid="castle-coins">🪙 {t("{n} castle coins", { n: castle.coins })}</span>
          </span>
          <span>{phase === "ask" ? t("Wave {n} of {total} comes in {q} questions", { n: Math.min(waves, wavesDone.current + 1), total: waves, q: nextWaveIn }) : wave ? t("Wave {n} of {total}", { n: wave.n, total: waves }) : ""}</span>
        </figcaption>
      </figure>

      {/* the build menu */}
      {phase !== "over" && (
        <div role="group" aria-label={t("Build")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BUILDINGS.map((b) => {
            const can = !showWave && canBuild(castle, b.id);
            const have = b.id === "repair" ? null : castle.def[b.id];
            return (
              <button key={b.id} type="button" disabled={!can} onClick={() => doBuild(b.id)} title={t(b.line)} data-build={b.id}
                className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-3 py-2 text-start ring-1 ring-slate-300 transition hover:bg-slate-50 active:scale-[.98] disabled:opacity-45">
                <span aria-hidden="true" className="text-2xl">{BUILD_ICON[b.id]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-navy">{t(b.name)}{have !== null ? ` ${have}/${b.max}` : ""}</span>
                  <span className="block text-xs text-slate-500">🪙 {b.cost} · {t(b.line)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {phase === "over" ? (
        <FinishBanner tone={fell ? "lose" : "win"}
          title={fell ? t("The blobs got into the castle!") : t("You defended the castle!")}
          line={fell ? t("Build defences early with your coins. Try again!") : t("{n} hearts left", { n: castle.hearts })}
          onDone={() => round.finish()} />
      ) : showWave && wave ? (
        <div role="status" className="rounded-2xl bg-white p-4 text-center ring-1 ring-slate-200" data-testid="wave-result">
          <p className="text-lg font-semibold text-brand-navy">{t("Wave {n}: {b} blobs!", { n: wave.n, b: wave.res.blobs })}</p>
          {phase === "waveDone" && (
            <>
              <p className="mt-1 text-slate-700">{t("Stopped {s} · blocked {k} · got through {g}", { s: wave.res.stopped, k: wave.res.blocked, g: wave.res.through })}</p>
              <button type="button" onClick={afterWaveDone} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Continue")}</button>
            </>
          )}
        </div>
      ) : (
        <Ask key={q.id} q={q} n={ix + 1} total={total} round={round} onAnswered={onAnswered} onNext={onNext} extra={earned} hold={waveAfter(ix + 1, total)}
          nextLabel={waveAfter(ix + 1, total) ? t("Here comes the wave!") : undefined} />
      )}
    </div>
  );
}
