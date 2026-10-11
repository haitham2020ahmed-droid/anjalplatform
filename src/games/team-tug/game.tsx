"use client";
/**
 * 🪢 Team Tug (teams): every right answer pulls the rope toward your team. Solo: the computer team pulls at a pace
 * that follows your level for the skill (../rocket-race/pace.ts); pull the marker over your line to win.
 * Live Challenge: the class is split into two teams balanced by level (teams.ts) and the rope on the projector
 * follows each team's average points (ProjectorView); each device shows its team (LivePad).
 * Multiple choice and True/False from the skill's bank questions; correct / incorrect is all the result row keeps.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, LivePadProps } from "../types";
import { AnswerTiles } from "../kit/answer-tiles";
import { Ask, FinishBanner } from "../rocket-race/ask";
import { opponentSteps, rng, stepsAt, TUG_WIN } from "../rocket-race/pace";
import type { ProjectorFeed } from "../rocket-race/live";
import { splitTeams, TEAM_INFO, tugState, type TeamId } from "./teams";

const W = 360, H = 140, MID = 180, STEP = 30;

/** A puller, drawn around (0, 0) at the rope's height; `lean` −1 (pulling left) … +1 (pulling right). */
function Puller({ x, color, lean, label }: { x: number; color: string; lean: number; label?: string }) {
  const tilt = lean * 14;
  return (
    <g transform={`translate(${x} 0) rotate(${tilt} 0 34)`}>
      {label && <title>{label}</title>}
      <line x1="0" y1="34" x2={-6} y2="52" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
      <line x1="0" y1="34" x2={6} y2="52" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
      <rect x="-8" y="6" width="16" height="30" rx="7" fill={color} />
      <circle cx="0" cy="-4" r="9" fill="#fcd9b6" />
      <circle cx="-3" cy="-5" r="1.3" fill="#1e293b" /><circle cx="3" cy="-5" r="1.3" fill="#1e293b" />
      <path d="M-3 -1 Q0 1.5 3 -1" stroke="#1e293b" strokeWidth="1.2" fill="none" />
    </g>
  );
}

/** The tug scene: Red team pulls left, Blue team pulls right; `pos` in steps (negative = toward Red). */
function Scene({ markerRef, labels, size = 3, win = TUG_WIN, initialPos = 0 }: { markerRef?: { current: SVGGElement | null }; labels: [string, string]; size?: number; win?: number; initialPos?: number }) {
  const ys = 58;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto max-h-64 w-full" role="img" aria-label={`${labels[0]} · ${labels[1]}`} style={{ direction: "ltr", overflow: "visible" }}>
      <rect x={-2000} y={ys + 52} width={W + 4000} height={H - ys - 52} fill="#bbf7d0" />
      <rect x={-2000} y={ys + 50} width={W + 4000} height="4" fill="#86efac" />
      {/* the win lines */}
      <line x1={MID - win * STEP} x2={MID - win * STEP} y1="14" y2={H - 6} stroke={TEAM_INFO.A.fill} strokeWidth="2" strokeDasharray="5 4" />
      <line x1={MID + win * STEP} x2={MID + win * STEP} y1="14" y2={H - 6} stroke={TEAM_INFO.B.fill} strokeWidth="2" strokeDasharray="5 4" />
      <line x1={MID} x2={MID} y1="20" y2={H - 6} stroke="#64748b" strokeWidth="1" />
      <text x={8} y={16} fontSize="11" fontWeight="700" fill={TEAM_INFO.A.fill}>{labels[0]}</text>
      <text x={W - 8} y={16} fontSize="11" fontWeight="700" fill={TEAM_INFO.B.fill} textAnchor="end">{labels[1]}</text>
      <g ref={markerRef} {...(markerRef ? { transform: `translate(${MID + initialPos * STEP} ${ys})` } : { style: { transform: `translate(${MID + initialPos * STEP}px, ${ys}px)`, transition: "transform .8s ease-out" } })}>
        <line x1={-170} x2={170} y1="18" y2="18" stroke="#a16207" strokeWidth="4" strokeLinecap="round" />
        <rect x="-4" y="8" width="8" height="20" rx="2" fill="#facc15" stroke="#a16207" />
        {Array.from({ length: size }, (_, i) => <Puller key={`a${i}`} x={-40 - i * 34} color={TEAM_INFO.A.fill} lean={-1} />)}
        {Array.from({ length: size }, (_, i) => <Puller key={`b${i}`} x={40 + i * 34} color={TEAM_INFO.B.fill} lean={1} />)}
      </g>
    </svg>
  );
}

type Phase = "ask" | "feedback" | "over";

export default function TeamTug({ questions, level, round }: GameProps) {
  const t = useT();
  const them = useMemo(() => opponentSteps(level, rng(Date.now() & 0xffffffff), questions.length * 3 + 10), [level, questions.length]);
  const [ix, setIx] = useState(0);
  const [pos, setPos] = useState(0);   // in steps: + = toward my team (Red, left)
  const [outcome, setOutcome] = useState<"win" | "lose" | "draw" | null>(null);
  const phase = useRef<Phase>("ask");
  const raceMs = useRef(0);
  const mine = useRef(0);
  const shown = useRef(0);
  const marker = useRef<SVGGElement>(null);
  const overRef = useRef(round.over); overRef.current = round.over;

  const end = (o: "win" | "lose" | "draw") => {
    if (phase.current === "over") return;
    phase.current = "over"; setOutcome(o);
    if (o === "win") round.celebrate();
  };
  const endRef = useRef(end); endRef.current = end;

  useEffect(() => {
    let raf = 0, last = performance.now(), lastPos = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - last); last = now;
      if (phase.current === "ask" && !overRef.current) raceMs.current += dt;
      const p = mine.current - stepsAt(them, raceMs.current);
      if (p !== lastPos) { lastPos = p; setPos(p); }
      if (p <= -TUG_WIN && phase.current === "ask") endRef.current("lose");
      // the rope glides (toward Red = left = negative x)
      const target = Math.max(-TUG_WIN, Math.min(TUG_WIN, p));
      shown.current += (target - shown.current) * Math.min(1, dt / 180);
      marker.current?.setAttribute("transform", `translate(${MID - shown.current * STEP} 58)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [them]);

  const q = questions[ix] ?? null;
  const onAnswered = (ok: boolean) => {
    phase.current = "feedback";
    if (!ok) return;
    mine.current += 1;
    const p = mine.current - stepsAt(them, raceMs.current);
    if (p >= TUG_WIN) setTimeout(() => endRef.current("win"), 700);
  };
  const onNext = () => {
    if (phase.current === "over") return;
    if (ix + 1 >= questions.length) {
      const p = mine.current - stepsAt(them, raceMs.current);
      end(p > 0 ? "win" : p < 0 ? "lose" : "draw");
      return;
    }
    setIx(ix + 1); phase.current = "ask";
  };

  if (!q) return null;
  const labels: [string, string] = [`${t(TEAM_INFO.A.name)} (${t("You")})`, `${t(TEAM_INFO.B.name)} (${t("Computer")})`];
  return (
    <div className="space-y-4" data-testid="team-tug">
      <figure className="overflow-hidden rounded-3xl bg-sky-100 shadow ring-1 ring-slate-200">
        <Scene markerRef={marker} labels={labels} />
        <figcaption className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2 text-sm font-semibold text-brand-navy" aria-live="polite">
          <span>🪢 {t("Pull the marker over your line to win")}</span>
          <span className={pos > 0 ? "text-emerald-700" : pos < 0 ? "text-orange-700" : "text-slate-600"}>
            {pos > 0 ? t("Your team is ahead by {n}", { n: pos }) : pos < 0 ? t("The computer team is ahead by {n}", { n: -pos }) : t("Even!")}
          </span>
        </figcaption>
      </figure>

      {outcome ? (
        <FinishBanner tone={outcome}
          title={outcome === "win" ? t("Your team won the tug!") : outcome === "draw" ? t("A tie! The rope is in the middle.") : t("The computer team won this time")}
          line={outcome === "lose" ? t("Every right answer is a pull. Try again!") : undefined}
          onDone={() => round.finish()} />
      ) : (
        <Ask key={q.id} q={q} n={ix + 1} total={questions.length} round={round} onAnswered={onAnswered} onNext={onNext}
          nextLabel={ix + 1 >= questions.length ? t("See my score") : undefined} />
      )}
    </div>
  );
}

/**
 * The student's device in a Live Challenge: the team banner (when the room sends `team`) and big answer tiles.
 * Multiple choice and True/False are scored by the room as usual.
 */
export function LivePad({ question, hidden, disabled, submit, team }: LivePadProps & { team?: TeamId | null }) {
  const t = useT();
  const info = team ? TEAM_INFO[team] : null;
  return (
    <div className="space-y-3">
      {info && <p className={`rounded-2xl px-4 py-2 text-center font-semibold ring-1 ${info.soft} ${info.text}`} data-testid="tug-team">🪢 {t("You pull for the {team}", { team: t(info.name) })}</p>}
      <AnswerTiles big options={question.options ?? []} hidden={hidden} disabled={disabled} onPick={(label) => submit(label)} />
    </div>
  );
}

/**
 * The projector in a Live Challenge: the rope between the two teams, by each team's average points.
 * Uses `feed.racers` with teams when the room sends them (see NEEDS.md); otherwise the board is split here.
 */
export function ProjectorView({ feed }: { feed: ProjectorFeed }) {
  const t = useT();
  const rows = (feed.racers?.length ? feed.racers : feed.board).map((r) => ({ name: r.name, points: r.points, team: (r as { team?: TeamId }).team }));
  const fallback = rows.some((r) => !r.team) ? splitTeams(rows.map((r) => ({ id: r.name, level: "ON" as const }))) : null;
  const withTeam = rows.map((r) => ({ ...r, team: (r.team ?? fallback?.get(r.name) ?? "A") as TeamId }));
  const st = tugState(withTeam);
  // pos −1 … +1 (Blue ahead = positive) → steps on the scene (Blue = right = positive x)
  const steps = Math.round(st.pos * TUG_WIN * 10) / 10;
  const names = (id: TeamId) => withTeam.filter((r) => r.team === id).sort((a, b) => b.points - a.points);
  return (
    <figure className="overflow-hidden rounded-3xl bg-sky-100 shadow ring-1 ring-slate-200" data-testid="tug-projector">
      <Scene labels={[t(TEAM_INFO.A.name), t(TEAM_INFO.B.name)]} size={4} initialPos={steps} />
      <figcaption className="grid grid-cols-2 gap-3 bg-white p-3">
        {(["A", "B"] as const).map((id) => (
          <div key={id} className={`rounded-2xl p-3 ring-1 ${TEAM_INFO[id].soft}`}>
            <p className={`flex items-center justify-between gap-2 font-semibold ${TEAM_INFO[id].text}`}>
              <span>{t(TEAM_INFO[id].name)}{st.leader === id ? " 🏆" : ""}</span>
              <span className="font-mono tabular-nums" dir="ltr">{st.teams[id].avg}</span>
            </p>
            <p className="text-xs text-slate-500">{t("average points · {n} players", { n: st.teams[id].players })}</p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-700">{names(id).map((r) => r.name).join(" · ")}</p>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
