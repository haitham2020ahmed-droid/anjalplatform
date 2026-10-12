"use client";
/**
 * ⏱ One solo round (shared by every game): the 2–3 minute clock, game points, streak, correct / incorrect, power-ups,
 * sounds and confetti. A game gets the RoundApi and calls round.answer(q, correct) — nothing else to wire up.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerOutcome, PlayQuestion, PowerEffect, PowerUpId, RoundApi, SoundName } from "../types";
import { EXTRA_SECONDS, fiftyFifty, freshPowers, hintFor, powerApplies, scoreSolo } from "./powerups";
import { playSound } from "./sound";
import { confetti } from "./confetti";

/** missed: the questions answered wrong (they wait in Second Chance) */
export interface RoundResult { correct: number; incorrect: number; points: number; bestStreak: number; answered: string[]; missed: string[] }

export function useRound(roundSeconds: number, onOver: (r: RoundResult) => void): RoundApi & { result: RoundResult; reset: () => void } {
  const [deadline, setDeadline] = useState(() => Date.now() + roundSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [powerLeft, setPowerLeft] = useState(freshPowers);
  const [armed, setArmed] = useState<PowerUpId[]>([]);
  const [over, setOver] = useState(false);
  const answered = useRef<string[]>([]);
  const missed = useRef<string[]>([]);
  // the latest values for the synchronous answer() (state updates land later)
  const live = useRef({ points: 0, streak: 0, best: 0, correct: 0, incorrect: 0, armed: [] as PowerUpId[], powerLeft: freshPowers(), over: false });
  const overCb = useRef(onOver); overCb.current = onOver;

  const end = useCallback(() => {
    if (live.current.over) return;
    live.current.over = true;
    setOver(true);
    const r = live.current;
    overCb.current({ correct: r.correct, incorrect: r.incorrect, points: Math.max(0, r.points), bestStreak: r.best, answered: [...answered.current], missed: [...missed.current] });
  }, []);

  useEffect(() => {
    if (over) return;
    const t = setInterval(() => { const n = Date.now(); setNow(n); if (n >= deadline) end(); }, 250);
    return () => clearInterval(t);
  }, [deadline, over, end]);

  const sound = useCallback((n: SoundName) => playSound(n), []);
  const celebrate = useCallback(() => confetti(), []);

  const answer = useCallback((q: PlayQuestion, ok: boolean, opts: { speed?: number } = {}): AnswerOutcome => {
    const r = live.current;
    if (r.over) return { correct: ok, points: 0, shielded: false, doubled: false };
    const sc = scoreSolo(ok, opts.speed ?? 0, r.streak, r.armed);
    r.points = Math.max(0, r.points + sc.points);
    r.streak = ok ? r.streak + 1 : 0;
    r.best = Math.max(r.best, r.streak);
    if (ok) r.correct++; else r.incorrect++;
    r.armed = r.armed.filter((p) => !sc.spent.includes(p));
    answered.current.push(q.id);
    if (!ok) missed.current.push(q.id);
    setPoints(r.points); setStreak(r.streak); setBest(r.best); setCorrect(r.correct); setIncorrect(r.incorrect); setArmed(r.armed);
    playSound(ok ? "correct" : "wrong");
    if (ok && (r.streak === 3 || r.streak === 5 || r.streak % 10 === 0)) confetti({ pieces: 18 });
    return { correct: ok, points: sc.points, shielded: sc.shielded, doubled: sc.doubled };
  }, []);

  /** game points outside an answer (chest prizes): points only, never below 0 */
  const bonus = useCallback((n: number) => {
    const r = live.current;
    if (r.over || !Number.isFinite(n)) return;
    r.points = Math.max(0, r.points + Math.round(n));
    setPoints(r.points);
  }, []);

  const activate = useCallback((id: PowerUpId, q: PlayQuestion): PowerEffect | null => {
    const r = live.current;
    if (r.over || (r.powerLeft[id] ?? 0) < 1 || !powerApplies(id, q)) return null;
    let effect: PowerEffect = {};
    if (id === "fifty") effect = { hide: fiftyFifty(q.options) ?? [] };
    else if (id === "hint") effect = { hint: hintFor(q) ?? "" };
    else if (id === "time") { effect = { extraSeconds: EXTRA_SECONDS }; setDeadline((d) => d + EXTRA_SECONDS * 1000); }
    else { if (r.armed.includes(id)) return null; r.armed = [...r.armed, id]; setArmed(r.armed); }
    r.powerLeft = { ...r.powerLeft, [id]: r.powerLeft[id] - 1 };
    setPowerLeft(r.powerLeft);
    playSound("power");
    return effect;
  }, []);

  const reset = useCallback(() => {
    live.current = { points: 0, streak: 0, best: 0, correct: 0, incorrect: 0, armed: [], powerLeft: freshPowers(), over: false };
    answered.current = [];
    missed.current = [];
    setPoints(0); setStreak(0); setBest(0); setCorrect(0); setIncorrect(0); setArmed([]); setPowerLeft(freshPowers()); setOver(false);
    setDeadline(Date.now() + roundSeconds * 1000); setNow(Date.now());
  }, [roundSeconds]);

  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  return useMemo(() => ({
    secondsLeft, points, streak, correct, incorrect, powerLeft, armed, over,
    activate, answer, bonus, finish: end, sound, celebrate, reset,
    result: { correct, incorrect, points, bestStreak: best, answered: answered.current, missed: missed.current },
  }), [secondsLeft, points, streak, correct, incorrect, powerLeft, armed, over, activate, answer, bonus, end, sound, celebrate, reset, best]);
}
