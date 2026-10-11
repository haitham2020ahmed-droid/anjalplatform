"use client";
/**
 * 🎁 Mystery Chest (luck): answer the question; a right answer opens 1 of 3 surprise chests — a bonus, double
 * points, or points taken from the computer rival (Bolt). Multiple choice and True/False from the skill's bank
 * questions at the student's level. The chests are CSS/SVG (no animation loop). Luck changes game points only:
 * the answer is marked right or not right BEFORE any chest opens, and that is all the result row keeps.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { GameProps, LivePadProps, PowerEffect, PowerUpId, RoundApi } from "../types";
import { AnswerTiles } from "../kit/answer-tiles";
import { PowerBar } from "../kit/power-bar";
import { chestResponse, dealChests, LIVE_CHESTS_ENABLED, openChest, rivalTurn, SOLO_CHEST, type ChestPrize, type ChestResult } from "./chest";

export const RIVAL_NAME = "Bolt";
/** visual / luck randomness (crypto source keeps the platform free of Math.random) */
const rand = (): number => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
/** a round runner may offer a way to add game points outside an answer (chest prizes); without it the game keeps them */
type BonusRound = RoundApi & { bonus?: (points: number) => void };

const CHEST_LOOKS = [
  { wood: "#b45309", band: "#fbbf24", gem: "#ec4899" },
  { wood: "#7c3aed", band: "#facc15", gem: "#22d3ee" },
  { wood: "#0f766e", band: "#fcd34d", gem: "#f97316" },
] as const;
const PRIZE_ICON: Record<ChestPrize, string> = { bonus: "💎", double: "×2", steal: "🧲" };

/** An original code-drawn chest; the lid swings open. */
export function ChestArt({ look, open, glow }: { look: number; open: boolean; glow?: boolean }) {
  const c = CHEST_LOOKS[look % CHEST_LOOKS.length];
  return (
    <svg viewBox="0 0 120 100" className="h-full w-full overflow-visible" aria-hidden="true">
      {glow && <circle cx="60" cy="52" r="46" fill="#facc15" opacity=".28" />}
      <ellipse cx="60" cy="94" rx="44" ry="5" fill="#0f172a" opacity=".15" />
      <rect x="18" y="46" width="84" height="44" rx="6" fill={c.wood} />
      <rect x="18" y="46" width="84" height="8" fill="#000" opacity=".12" />
      <rect x="30" y="46" width="8" height="44" fill={c.band} /><rect x="82" y="46" width="8" height="44" fill={c.band} />
      {open && <path d="M24 50 L96 50 L88 40 L32 40 Z" fill="#fef3c7" />}
      {open && [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={38 + i * 11} cy={44 - (i % 2) * 4} r="5" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" />)}
      <g style={{ transformOrigin: "60px 46px", transformBox: "view-box", transform: open ? "translate(-8px, -22px) rotate(-16deg)" : "none", transition: "transform .45s cubic-bezier(.2,.9,.3,1.3)" }}>
        <path d="M18 46 Q18 18 60 18 Q102 18 102 46 Z" fill={c.wood} />
        <path d="M30 46 Q30 22 34 21 L38 21 Q36 26 38 46 Z" fill={c.band} /><path d="M82 46 Q84 26 82 21 L86 21 Q90 22 90 46 Z" fill={c.band} />
        <path d="M18 46 Q18 18 60 18 Q102 18 102 46" fill="none" stroke="#000" strokeOpacity=".15" strokeWidth="3" />
      </g>
      {!open && <><rect x="52" y="42" width="16" height="16" rx="3" fill={c.band} /><circle cx="60" cy="50" r="4" fill={c.gem} /></>}
    </svg>
  );
}

/** Bolt, the computer rival (original robot) */
function RivalFace() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <line x1="20" y1="2" x2="20" y2="8" stroke="#64748b" strokeWidth="2" /><circle cx="20" cy="3" r="2.5" fill="#f43f5e" />
      <rect x="6" y="8" width="28" height="24" rx="7" fill="#94a3b8" /><rect x="10" y="13" width="20" height="10" rx="4" fill="#0f172a" />
      <circle cx="15" cy="18" r="2.5" fill="#22d3ee" /><circle cx="25" cy="18" r="2.5" fill="#22d3ee" /><rect x="15" y="26" width="10" height="2.5" rx="1" fill="#475569" />
    </svg>
  );
}

type Phase = "ask" | "pick" | "open" | "wrong";

export default function MysteryChest({ questions, round, level }: GameProps) {
  const t = useT();
  const r = round as BonusRound;
  const [ix, setIx] = useState(0);
  const q = questions[ix] ?? null;
  const [phase, setPhase] = useState<Phase>("ask");
  const [picked, setPicked] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [last, setLast] = useState<{ points: number; shielded: boolean; doubled: boolean }>({ points: 0, shielded: false, doubled: false });
  const [chests, setChests] = useState<ChestPrize[]>(() => dealChests(rand));
  const [opened, setOpened] = useState<number | null>(null);
  const [prize, setPrize] = useState<ChestResult | null>(null);
  /** chest points kept by the game when the runner has no bonus hook (shown in the game's own score) */
  const [extra, setExtra] = useState(0);
  const [rival, setRival] = useState(0);
  const [rivalGain, setRivalGain] = useState(0);
  const startedAt = useRef(Date.now());
  const lock = useRef(false);
  const rivalRef = useRef(0); rivalRef.current = rival;

  const rivalPlays = () => { const g = rivalTurn(level, rand); setRivalGain(g); if (g) setRival((x) => x + g); };

  const pick = (label: string) => {
    if (!q || phase !== "ask" || round.over || lock.current) return;
    lock.current = true;
    const ok = !!q.options?.find((o) => o.label === label)?.correct;
    const speed = Math.max(0, 1 - (Date.now() - startedAt.current) / 20_000);
    const out = round.answer(q, ok, { speed });
    setPicked(label); setLast({ points: out.points, shielded: out.shielded, doubled: out.doubled });
    rivalPlays();
    if (ok) { round.celebrate(); setPhase("pick"); } else setPhase("wrong");
  };

  const open = (i: number) => {
    if (phase !== "pick" || opened !== null) return;
    const res = openChest(chests[i], last.points, [{ id: "rival", points: rivalRef.current }], SOLO_CHEST);
    setOpened(i); setPrize(res); setPhase("open");
    if (res.taken) setRival((x) => Math.max(0, x - res.taken));
    if (res.gain > 0) { if (typeof r.bonus === "function") r.bonus(res.gain); else setExtra((x) => x + res.gain); }
    round.sound(res.prize === "steal" ? "power" : "win");
    round.celebrate();
  };

  const next = useCallback(() => {
    if (ix + 1 >= questions.length) { round.finish(); return; }
    setIx(ix + 1); setPhase("ask"); setPicked(null); setHidden([]); setHint(null); setOpened(null); setPrize(null); setRivalGain(0);
    setChests(dealChests(rand)); startedAt.current = Date.now(); lock.current = false;
  }, [ix, questions.length, round]);

  useEffect(() => {
    if (phase !== "open") return;
    const id = setTimeout(next, 2600);
    return () => clearTimeout(id);
  }, [phase, next]);

  // keys 1–3 open a chest
  useEffect(() => {
    if (phase !== "pick") return;
    const onKey = (e: KeyboardEvent) => { const n = Number(e.key); if (n >= 1 && n <= 3 && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); open(n - 1); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onEffect = (_id: PowerUpId, e: PowerEffect) => { if (e.hide) setHidden(e.hide); if (e.hint) setHint(e.hint); };

  if (!q) return null;
  const right = q.options?.find((o) => o.correct)?.label ?? null;
  const mine = round.points + extra;
  const prizeLine = (p: ChestResult) =>
    p.fellBack ? t("{name} had no points to take, so you got a bonus: +{n}", { name: RIVAL_NAME, n: p.gain })
      : p.prize === "steal" ? t("You took {n} points from {name}!", { n: p.taken, name: RIVAL_NAME })
        : p.prize === "double" ? t("Double points! +{n}", { n: p.gain })
          : t("Bonus! +{n}", { n: p.gain });
  const prizeName = (p: ChestPrize) => (p === "bonus" ? t("Bonus points") : p === "double" ? t("Double Points") : t("Take points"));

  return (
    <div className="space-y-4" data-testid="mystery-chest">
      {/* the treasure race against the computer rival */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-navy ring-1 ring-slate-200">{t("Question {n} of {total}", { n: ix + 1, total: questions.length })}</span>
        <span className="flex items-center gap-3 text-sm font-semibold">
          <span className="flex items-center gap-1 text-amber-900" aria-label={t("Your treasure: {n}", { n: mine })}><span aria-hidden="true">🪙</span><span dir="ltr" className="tabular-nums">{mine}</span></span>
          <span className="text-slate-400" aria-hidden="true">vs</span>
          <span className="flex items-center gap-1 text-slate-700" aria-label={t("Computer rival {name}: {n}", { name: RIVAL_NAME, n: rival })}><RivalFace /><bdi dir="ltr">{RIVAL_NAME}</bdi><span dir="ltr" className="tabular-nums">{rival}</span>{rivalGain > 0 && phase !== "ask" && <span className="animate-pop text-xs text-slate-500" dir="ltr">+{rivalGain}</span>}</span>
        </span>
      </div>

      {(phase === "ask" || phase === "wrong") && (
        <>
          <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            {q.passage && (
              <details className="mb-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <summary className="cursor-pointer font-semibold text-brand-navy">📖 <span dir="ltr" lang="en">{q.passage.title}</span></summary>
                <p dir="ltr" lang="en" className="mt-2 whitespace-pre-line leading-relaxed text-slate-800">{q.passage.text}</p>
              </details>
            )}
            <p className="text-sm font-semibold text-amber-700">🎁 {t("A right answer opens a surprise chest")}</p>
            <p dir="ltr" lang="en" className="mt-1 text-xl font-semibold leading-relaxed text-slate-900">{q.stem}</p>
            {hint && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
          </article>
          <AnswerTiles options={q.options ?? []} hidden={hidden} disabled={phase !== "ask" || round.over} onPick={pick} reveal={phase === "wrong" ? { right, picked } : null} />
        </>
      )}

      {phase === "wrong" && (
        <div role="status" className="animate-shake rounded-2xl bg-orange-50 p-4 ring-2 ring-orange-300">
          <p className="text-xl font-semibold text-orange-800">{t("Not quite")}{last.shielded && <span className="ms-2 text-base">🛡 {t("Shield saved your points")}</span>}</p>
          <p className="mt-1 text-slate-700">{t("The chests stay closed this time.")}</p>
          {q.explain && <p dir="ltr" lang="en" className="mt-1 text-slate-700">{q.explain}</p>}
          <button type="button" onClick={next} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>
        </div>
      )}

      {(phase === "pick" || phase === "open") && (
        <section aria-labelledby="mc-pick" className="rounded-3xl bg-linear-to-b from-indigo-900 to-brand-navy p-5 text-center text-white shadow-xl">
          <p className="text-lg font-semibold text-emerald-300">{t("Correct! +{n}", { n: last.points })}{last.doubled && <span className="ms-2 text-base">({t("Double Points")})</span>}</p>
          <h2 id="mc-pick" className="mt-1 text-2xl font-semibold">{phase === "pick" ? t("Pick a chest!") : prize ? prizeLine(prize) : ""}</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-6" dir="ltr">
            {chests.map((c, i) => {
              const isOpen = opened === i, shown = opened !== null;
              return (
                <button key={i} type="button" disabled={phase !== "pick"} onClick={() => open(i)} aria-label={t("Chest {n}", { n: i + 1 })}
                  className={`group flex min-h-32 flex-col items-center justify-end rounded-2xl p-1 transition ${phase === "pick" ? "hover:-translate-y-1 hover:bg-white/10 focus-visible:bg-white/10" : ""} ${shown && !isOpen ? "opacity-60" : ""}`}>
                  <span className={`block h-24 w-28 max-w-full sm:h-28 sm:w-36 ${phase === "pick" ? "animate-float" : isOpen ? "animate-pop" : ""}`} style={{ animationDelay: `${i * 0.25}s` }}><ChestArt look={i} open={isOpen} glow={isOpen} /></span>
                  {shown ? (
                    <span className={`mt-1 rounded-full px-2 py-0.5 text-sm font-semibold ${isOpen ? "bg-brand-gold text-brand-navy" : "bg-white/15 text-white"}`}><span aria-hidden="true">{PRIZE_ICON[c]} </span>{prizeName(c)}</span>
                  ) : (
                    <span className="mt-1 grid h-8 w-8 place-items-center rounded-full bg-white/15 text-sm font-bold">{i + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
          {phase === "open" && <button type="button" onClick={next} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-6 font-semibold text-brand-navy">{ix + 1 >= questions.length ? t("See my score") : t("Next")}</button>}
        </section>
      )}

      {phase === "ask" && <PowerBar round={round} q={q} onEffect={onEffect} />}
    </div>
  );
}

/**
 * The student's device in a Live Challenge. With the room's chest hook on (LIVE_CHESTS_ENABLED), the student picks a
 * chest, then answers: the answer goes as `{ choice, chest }` and the room opens the chest after a right answer.
 * Without the hook the device shows the plain answer tiles (no chest is promised that the room cannot open).
 */
export function LivePad({ question, hidden, disabled, submit }: LivePadProps) {
  const t = useT();
  const [chest, setChest] = useState(0);
  useEffect(() => { setChest(0); }, [question.index]);
  if (!LIVE_CHESTS_ENABLED) return <AnswerTiles big options={question.options ?? []} hidden={hidden} disabled={disabled} onPick={(label) => submit(label)} />;
  return (
    <div className="space-y-3" data-testid="mystery-chest-pad">
      <p className="text-center font-semibold text-amber-800">🎁 {t("Pick a chest, then answer. A right answer opens it.")}</p>
      <div className="grid grid-cols-3 gap-2" dir="ltr" role="radiogroup" aria-label={t("Pick a chest!")}>
        {[0, 1, 2].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={chest === i} aria-label={t("Chest {n}", { n: i + 1 })} disabled={disabled} onClick={() => setChest(i)}
            className={`flex min-h-24 items-center justify-center rounded-2xl p-1 ${chest === i ? "bg-amber-100 ring-4 ring-brand-gold" : "bg-white ring-1 ring-slate-200"}`}>
            <span className="block h-20 w-24"><ChestArt look={i} open={false} glow={chest === i} /></span>
          </button>
        ))}
      </div>
      <AnswerTiles big options={question.options ?? []} hidden={hidden} disabled={disabled} onPick={(label) => submit(chestResponse(label, chest))} />
    </div>
  );
}
