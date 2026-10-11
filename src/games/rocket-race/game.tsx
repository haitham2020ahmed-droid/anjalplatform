"use client";
/**
 * 🚀 Rocket Race (race): every right answer boosts your rocket toward the Moon. Solo: two computer rockets race
 * you at a pace that follows your level for the skill (pace.ts). Live Challenge: every player's rocket on the
 * projector, placed by points (ProjectorView). Multiple choice and True/False from the skill's bank questions;
 * correct / incorrect is all the result row keeps.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps } from "../types";
import { Ask, FinishBanner } from "./ask";
import { Moon, Rocket, ROCKET_COLORS, Stars } from "./art";
import { opponentSteps, rng, rocketGoal, ROCKET_FACTORS, smoothAt, stepsAt } from "./pace";
import { rocketLanes, type ProjectorFeed } from "./live";

const W = 360, H = 150, X0 = 34, X1 = 296;
const LANES = [{ key: "you", color: ROCKET_COLORS[0] }, { key: "comet", color: ROCKET_COLORS[1] }, { key: "nova", color: ROCKET_COLORS[2] }] as const;
const laneY = (i: number) => 28 + i * 46;
const xFor = (frac: number) => X0 + Math.max(0, Math.min(1, frac)) * (X1 - X0);

type Phase = "ask" | "feedback" | "over";

export default function RocketRace({ questions, level, round }: GameProps) {
  const t = useT();
  const goal = rocketGoal(questions.length);
  const rivals = useMemo(() => { const r = rng(Date.now() & 0xffffffff); return ROCKET_FACTORS.map((f) => opponentSteps(level, r, goal, f)); }, [level, goal]);
  const [ix, setIx] = useState(0);
  const [me, setMe] = useState(0);
  const [rivalSteps, setRivalSteps] = useState<number[]>(() => rivals.map(() => 0));
  const [outcome, setOutcome] = useState<"win" | "lose" | "draw" | null>(null);
  const phase = useRef<Phase>("ask");
  const raceMs = useRef(0);
  const meShown = useRef(0);
  const meRef = useRef(0);
  const groups = useRef<(SVGGElement | null)[]>([]);
  const overRef = useRef(round.over); overRef.current = round.over;

  const end = (o: "win" | "lose" | "draw") => {
    if (phase.current === "over") return;
    phase.current = "over"; setOutcome(o);
    if (o === "win") round.celebrate();
  };
  const endRef = useRef(end); endRef.current = end;

  // the race picture: requestAnimationFrame moves the rockets (no React render per frame)
  useEffect(() => {
    let raf = 0, last = performance.now();
    const shown = rivals.map(() => -1);
    const tick = (now: number) => {
      const dt = Math.min(100, now - last); last = now;
      if (phase.current === "ask" && !overRef.current) raceMs.current += dt;
      const ms = raceMs.current;
      // my rocket glides to its step
      meShown.current += (meRef.current - meShown.current) * Math.min(1, dt / 160);
      const g0 = groups.current[0];
      if (g0) g0.setAttribute("transform", `translate(${xFor(meShown.current / goal)} ${laneY(0)})`);
      rivals.forEach((times, i) => {
        const g = groups.current[i + 1];
        if (g) g.setAttribute("transform", `translate(${xFor(Math.min(goal, smoothAt(times, ms)) / goal)} ${laneY(i + 1)})`);
        const n = stepsAt(times, ms);
        if (n !== shown[i]) { shown[i] = n; setRivalSteps((s) => { const c = [...s]; c[i] = n; return c; }); }
        if (n >= goal && phase.current === "ask") endRef.current("lose");
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rivals, goal]);

  const q = questions[ix] ?? null;
  const onAnswered = (ok: boolean) => {
    phase.current = "feedback";
    if (!ok) return;
    const n = meRef.current + 1;
    meRef.current = n; setMe(n);
    if (n >= goal) setTimeout(() => endRef.current("win"), 700);
  };
  const onNext = () => {
    if (phase.current === "over") return;
    if (ix + 1 >= questions.length) {
      const best = Math.max(...rivals.map((r) => stepsAt(r, raceMs.current)));
      end(meRef.current > best ? "win" : meRef.current === best ? "draw" : "lose");
      return;
    }
    setIx(ix + 1); phase.current = "ask";
  };

  const place = 1 + rivalSteps.filter((s) => s > me).length;
  const names = [t("You"), t("Comet"), t("Nova")];
  if (!q) return null;
  return (
    <div className="space-y-4" data-testid="rocket-race">
      <figure className="overflow-hidden rounded-3xl bg-gradient-to-b bg-linear-to-b from-[#0b1440] to-[#26206b] shadow ring-1 ring-slate-200">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto max-h-64 w-full" role="img" aria-label={t("Race to the Moon: you {me} of {goal}", { me, goal })} style={{ direction: "ltr", overflow: "visible" }}>
          <Stars w={W} h={H} />
          <Moon x={X1 + 18} h={H} />
          {LANES.map((l, i) => (
            <g key={l.key}>
              <line x1={X0} x2={X1 + 18} y1={laneY(i)} y2={laneY(i)} stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="2 6" />
              <text x={4} y={laneY(i) - 12} fontSize="10" fontWeight="600" fill="#e2e8f0">{names[i]}</text>
              <g ref={(el) => { groups.current[i] = el; }} transform={`translate(${xFor(0)} ${laneY(i)})`}>
                <Rocket color={l.color} flame={!outcome} label={names[i]} />
              </g>
            </g>
          ))}
        </svg>
        <figcaption className="flex flex-wrap items-center justify-between gap-2 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
          <span>🚀 {t("{n} of {goal} boosts to the Moon", { n: me, goal })}</span>
          <span aria-live="polite">{place > 1 ? t("You are {n} of 3", { n: place }) : rivalSteps.some((r) => r === me) ? t("Even!") : t("You are in the lead!")}</span>
        </figcaption>
      </figure>

      {outcome ? (
        <FinishBanner tone={outcome}
          title={outcome === "win" ? t("You reached the Moon first!") : outcome === "draw" ? t("A tie at the finish!") : t("A computer rocket got there first")}
          line={outcome === "lose" ? t("Every right answer is a boost. Try again!") : undefined}
          onDone={() => round.finish()} />
      ) : (
        <Ask key={q.id} q={q} n={ix + 1} total={questions.length} round={round} onAnswered={onAnswered} onNext={onNext}
          extra={null} nextLabel={ix + 1 >= questions.length ? t("See my score") : undefined} />
      )}
    </div>
  );
}

/**
 * The projector in a Live Challenge: every player's rocket racing to the Moon by points (first names only).
 * Uses `feed.racers` (every player) when the room sends it, else the top 8 of the board.
 */
export function ProjectorView({ feed }: { feed: ProjectorFeed }) {
  const t = useT();
  const lanes = rocketLanes(feed);
  const rowH = lanes.length > 16 ? 20 : lanes.length > 8 ? 26 : 34;
  const h = Math.max(120, lanes.length * rowH + 20);
  const w = 640, x0 = 110, x1 = 560;
  return (
    <figure className="overflow-hidden rounded-3xl bg-gradient-to-b bg-linear-to-b from-[#0b1440] to-[#26206b] shadow ring-1 ring-slate-200" data-testid="rocket-projector">
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" role="img" aria-label={t("Rockets racing to the Moon")} style={{ direction: "ltr", overflow: "visible" }}>
        <Stars w={w} h={h} />
        <Moon x={x1 + 22} h={h} />
        {lanes.map((l, i) => {
          const y = 10 + rowH / 2 + i * rowH;
          const s = rowH / 34;
          return (
            <g key={`${l.name}-${i}`}>
              <text x={8} y={y + 4} fontSize={Math.max(10, rowH * 0.42)} fontWeight="600" fill={i < 3 ? "#fde68a" : "#e2e8f0"}>{i < 3 ? ["🥇", "🥈", "🥉"][i] + " " : `${l.rank}. `}{l.name.slice(0, 12)}</text>
              <line x1={x0} x2={x1 + 22} y1={y} y2={y} stroke="#fff" strokeOpacity="0.1" strokeDasharray="2 6" />
              <g style={{ transform: `translate(${x0 + l.frac * (x1 - x0)}px, ${y}px) scale(${s})`, transition: "transform .8s ease-out" }}>
                <Rocket color={ROCKET_COLORS[i % ROCKET_COLORS.length]} flame={!l.atMoon} label={l.name} />
              </g>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
