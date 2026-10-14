"use client";
/**
 * 🏁 A student's device in a Live Challenge: big answer buttons, instant right / wrong feedback, own points and rank
 * after each question, power-ups, and the final place. Reconnects (and rejoins) by itself.
 * Games integration: own avatar + favorite badge, team and team points, Mystery Chest picker, coins at the end.
 */
import { useEffect, useState, type FC } from "react";
import Link from "next/link";
import { useLang, useT } from "@/i18n/client";
import type { PlayerView } from "@/server/game/rooms";
import type { ChestResult, GameId, LiveChestProps, PowerUpId } from "@/games/types";
import { ChestPicker } from "@/games/kit/chests";
import { TeamScores } from "@/games/kit/projector";
import { TEAMS, teamLetter } from "@/games/live-features";
import { Avatar, BadgeEmblem, CoinIcon } from "@/components/motivation/avatar";
import { GAME_LOADERS, type GameModule } from "@/games/loaders";
import { AnswerTiles } from "@/games/kit/answer-tiles";
import { POWER_INFO } from "@/games/kit/powerups";
import { playSound, useMute } from "@/games/kit/sound";
import { confetti } from "@/games/kit/confetti";
import { livePost, ordinal, useLiveFeed } from "./live-feed";
import { RichInline } from "@/components/rich-inline";

const LIVE_POWERS: PowerUpId[] = ["double", "time", "fifty", "shield", "hint"];

export function LivePlayer({ initial }: { initial: PlayerView }) {
  const t = useT();
  const lang = useLang();
  const { view: v, setView, online, closed, refresh } = useLiveFeed<PlayerView>(initial.code, "player", initial);
  const [now, setNow] = useState(() => Date.now());
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [instant, setInstant] = useState<{ correct: boolean; points: number } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [pad, setPad] = useState<GameModule["LivePad"] | null>(null);
  const [chestUi, setChestUi] = useState<FC<LiveChestProps> | null>(null);
  const [chest, setChest] = useState<ChestResult | null>(null);
  const { muted, toggle } = useMute();

  // a game may bring its own device screen (Part 2); Quiz Race uses the shared answer tiles
  useEffect(() => { let on = true; GAME_LOADERS[v.mode as GameId]?.().then((m) => { if (on && m.LivePad) setPad(() => m.LivePad!); if (on && m.LiveChest) setChestUi(() => m.LiveChest!); }).catch(() => {}); return () => { on = false; }; }, [v.mode]);
  useEffect(() => { setSeenAt(Date.now()); }, [v]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  useEffect(() => { setInstant(null); setMsg(null); setHidden(v.hidden ?? []); setHint(v.hint ?? null); }, [v.index, v.status]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setChest(null); }, [v.index]);
  useEffect(() => { if (v.status === "FINISHED" && v.rank <= 3) confetti({ pieces: 60 }); }, [v.status, v.rank]);

  const left = v.leftMs === null ? null : Math.max(0, Math.ceil((v.leftMs - (v.paused ? 0 : now - seenAt)) / 1000));
  const answered = !!v.mine || !!instant;

  const submit = async (response: unknown) => {
    if (busy || answered || v.status !== "QUESTION" || v.paused) return;
    setBusy(true);
    const r = await livePost<{ correct: boolean; points: number; chest?: ChestResult | null }>(v.code, { action: "answer", index: v.index, response });
    setBusy(false);
    if (r.ok) { setInstant({ correct: r.data.correct, points: r.data.points }); if (r.data.chest) setChest(r.data.chest); playSound(r.data.correct ? "correct" : "wrong"); if (r.data.correct) confetti({ pieces: 20 }); void refresh(); }
    else setMsg(r.data.error === "offline" ? t("No connection. Trying again…") : r.data.error ?? t("Something went wrong. Try again."));
  };

  const power = async (id: PowerUpId) => {
    const r = await livePost<{ hide?: string[]; hint?: string; armed?: PowerUpId[] }>(v.code, { action: "power", id });
    if (!r.ok) { setMsg(r.data.error ?? t("Something went wrong. Try again.")); return; }
    playSound("power");
    if (r.data.hide) setHidden(r.data.hide);
    if (r.data.hint) setHint(r.data.hint);
    setView({ ...v, power: { ...v.power, [id]: (v.power[id] ?? 1) - 1 }, armed: r.data.armed ?? v.armed });
  };

  const openChest = async (pick: number) => {
    if (busy) return;
    setBusy(true);
    const r = await livePost<ChestResult>(v.code, { action: "chest", index: v.index, pick });
    setBusy(false);
    if (r.ok) { setChest(r.data); playSound("power"); confetti({ pieces: 30 }); void refresh(); }
    else setMsg(r.data.error ?? t("Something went wrong. Try again."));
  };
  const opened = chest ?? v.chest?.opened ?? null;
  const showChest = !!v.chest && (opened || v.chest.available || (instant?.correct && v.status === "QUESTION"));
  const Chest = chestUi ?? ChestPicker;
  const chestBox = showChest ? <Chest opened={opened} busy={busy} open={openChest} t={t} /> : null;
  const myTeam = v.team !== null && v.team !== undefined ? TEAMS[v.team] : null;
  const Pad = pad;
  const correct = v.mine ? v.mine.correct : instant?.correct;
  const pts = v.mine ? v.mine.points : instant?.points ?? 0;
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="live-player">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-brand-navy">
          {v.me && <Avatar avatar={v.me.avatar} size={36} />}
          <span className="min-w-0"><span className="block truncate">{v.title}</span>{v.me && <span className="flex items-center gap-1 text-xs text-slate-500"><bdi>{v.me.name}</bdi><BadgeEmblem code={v.me.badge} size={14} /></span>}</span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {!online && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900" role="status">{t("Reconnecting…")}</span>}
          <span className="rounded-full bg-brand-gold px-3 py-1 text-brand-navy tabular-nums" dir="ltr">⭐ {v.points}</span>
          {v.status !== "LOBBY" && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700" dir="ltr">#{v.rank}</span>}
          <button type="button" onClick={toggle} aria-pressed={muted} aria-label={muted ? t("Sound off") : t("Sound on")} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-lg">{muted ? "🔇" : "🔊"}</button>
        </span>
      </div>

      {closed && <p role="alert" className="rounded-2xl bg-slate-100 p-4 text-center text-slate-700">{t("This game has ended.")} <Link href="/student" className="font-semibold text-brand-navy underline">{t("Back to my page")}</Link></p>}

      {myTeam && (
        <div className="space-y-2" data-testid="my-team">
          <p className="rounded-2xl px-4 py-2 text-center font-semibold text-white" style={{ background: myTeam.color }}>{t("Your team: {team}", { team: t(myTeam.name) })}</p>
          {v.teams && v.status !== "LOBBY" && <TeamScores teams={v.teams} t={t} mine={v.team} />}
        </div>
      )}
      {v.hits?.length > 0 && v.status !== "FINISHED" && <p role="status" className="rounded-2xl bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900 ring-1 ring-amber-200">🧲 {t("{name} took {n} points from you", { name: v.hits[0].name, n: v.hits[0].points })}</p>}

      {v.status === "LOBBY" && (
        <div className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-10 text-center text-white shadow-xl">
          <p className="animate-float text-6xl" aria-hidden="true">🏁</p>
          <h1 className="mt-3 text-3xl font-semibold">{t("You're in!")}</h1>
          <p className="mt-2 text-white/85">{t("Wait for your teacher to start. {n} joined.", { n: v.players })}</p>
        </div>
      )}

      {v.status === "QUESTION" && v.question && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-600">{t("Question {n} of {total}", { n: v.index + 1, total: v.total })}</span>
            {left !== null && <span role="timer" className={`grid h-14 w-14 place-items-center rounded-full text-2xl font-bold text-white ${left <= 5 ? "animate-pop bg-red-500" : "bg-brand-purple"}`} dir="ltr">{left}</span>}
          </div>
          {v.paused && <p role="status" className="rounded-2xl bg-amber-50 p-4 text-center text-lg font-semibold text-amber-900 ring-1 ring-amber-200">⏸ {t("Paused")}</p>}
          {answered ? (
            <div className={`animate-pop rounded-3xl p-8 text-center text-white shadow-xl ${correct ? "bg-emerald-500" : "bg-red-500"}`} role="status">
              <p className="text-6xl" aria-hidden="true">{correct ? "✓" : "✗"}</p>
              <p className="mt-2 text-3xl font-semibold">{correct ? t("Correct!") : t("Not this time")}</p>
              {correct && <p className="mt-1 text-xl font-semibold" dir="ltr">+{pts}</p>}
              {chestBox}
              <p className="mt-3 text-white/90">{t("Waiting for the others…")}</p>
            </div>
          ) : (
            <>
              <h2 dir="ltr" lang="en" className="rounded-3xl bg-white p-5 text-center text-xl font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200"><RichInline text={v.question.stem} /></h2>
              {hint && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">💡 </span><span dir="ltr" lang="en">{hint}</span></p>}
              {Pad ? <Pad question={v.question} hidden={hidden} disabled={busy || v.paused} submit={submit} {...(teamLetter(v.team) ? { team: teamLetter(v.team) } : {})} />
                : <AnswerTiles big options={v.question.options ?? []} hidden={hidden} disabled={busy || v.paused} onPick={(label) => submit(label)} />}
              <div role="group" aria-label={t("Power-ups")} className="flex flex-wrap justify-center gap-2">
                {LIVE_POWERS.map((id) => {
                  const on = v.armed.includes(id), n = v.power[id] ?? 0;
                  const na = id === "fifty" && (v.question?.options?.length ?? 0) < 3;
                  return (
                    <button key={id} type="button" disabled={n < 1 || on || na || v.paused} onClick={() => power(id)} title={t(POWER_INFO[id].line)}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 disabled:opacity-40 ${on ? "bg-amber-100 text-amber-900 ring-amber-400" : "bg-white text-brand-navy ring-slate-300"}`}>
                      <span aria-hidden="true" className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-navy/10 px-1 text-xs font-bold">{POWER_INFO[id].icon}</span>{t(POWER_INFO[id].name)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {msg && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-center text-red-800">{msg}</p>}
        </div>
      )}

      {v.status === "REVEAL" && (
        <div className={`animate-pop rounded-3xl p-10 text-center text-white shadow-xl ${v.mine?.correct ? "bg-emerald-500" : "bg-red-500"}`} role="status">
          <p className="text-6xl" aria-hidden="true">{v.mine ? (v.mine.correct ? "✓" : "✗") : "⌛"}</p>
          <p className="mt-2 text-3xl font-semibold">{v.mine ? (v.mine.correct ? t("Correct!") : t("Not this time")) : t("Time's up")}</p>
          {v.mine?.correct && <p className="mt-1 text-xl font-semibold" dir="ltr">+{v.mine.points}</p>}
          {chestBox}
          <p className="mt-4 inline-block rounded-full bg-white/20 px-4 py-1.5 font-semibold">{t("You are {rank} of {n}", { rank: ordinal(v.rank, lang), n: v.players })} · {t("{n} points", { n: v.points })}</p>
        </div>
      )}

      {v.status === "FINISHED" && (
        <div className="animate-pop rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-8 text-center text-white shadow-xl">
          <p className="text-6xl" aria-hidden="true">{v.rank === 1 ? "🥇" : v.rank === 2 ? "🥈" : v.rank === 3 ? "🥉" : "🎉"}</p>
          <h1 className="mt-2 text-3xl font-semibold">{t("You finished {rank} of {n}", { rank: ordinal(v.rank, lang), n: v.players })}</h1>
          <p className="mt-1 text-xl" dir="ltr">⭐ {v.points}</p>
          {v.coins !== null && v.coins !== undefined && v.coins > 0 && <p role="status" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 font-semibold" data-testid="live-coins"><CoinIcon size={18} /> {t("+{n} coins for playing", { n: v.coins })}</p>}
          <ol className="mx-auto mt-6 max-w-xs space-y-1 text-start">{v.podium.map((p, i) => <li key={p.name + i} className="flex items-center justify-between gap-2 rounded-xl bg-white/15 px-3 py-1.5"><span className="flex min-w-0 items-center gap-1.5">{["🥇", "🥈", "🥉"][i]} <Avatar avatar={p.avatar} size={24} /><bdi className="truncate">{p.name}</bdi><BadgeEmblem code={p.badge} size={14} /></span><span className="font-mono" dir="ltr">{p.points}</span></li>)}</ol>
          {v.mySkills.length > 0 && (
            <ul className="mx-auto mt-5 max-w-sm space-y-1 text-start text-sm">
              {v.mySkills.map((k) => <li key={k.skillName} className="flex justify-between gap-3 rounded-xl bg-white/10 px-3 py-1.5"><bdi dir="ltr">{k.skillName}</bdi><span dir="ltr">{k.correct}/{k.total}</span></li>)}
            </ul>
          )}
          <Link href="/student" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-gold px-6 font-semibold text-brand-navy">{t("Back to my page")}</Link>
        </div>
      )}
    </div>
  );
}
