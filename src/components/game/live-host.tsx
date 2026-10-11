"use client";
/**
 * 🏁 The teacher's projector screen for a Live Challenge:
 *   lobby    big QR code + 6-digit code, "17 of 20 joined", Start game
 *   game     question, timer and answer count on the left; the LIVE BOARD on the right (top 8 first names, points,
 *            up / down arrows, gold / silver / bronze, short cheers); Pause · Hide board · Show answer / Next
 *   results  top players, class score by skill (under 70% in orange), each student's score by skill, Reteach
 * Games integration: avatars + favorite badge emblems (lobby, board, podium), team points, chest events, and the
 * game's own `ProjectorView` (or the kit's rockets / rope view) in place of the default board.
 */
import { useEffect, useMemo, useState, type FC } from "react";
import Link from "next/link";
import { useLang, useT } from "@/i18n/client";
import type { HostView } from "@/server/game/rooms";
import { gameMeta } from "@/games/registry";
import { GAME_LOADERS } from "@/games/loaders";
import type { GameId, LiveEvent, ProjectorFeedCompat, ProjectorState, ProjectorViewProps } from "@/games/types";
import { teamLetter } from "@/games/live-features";
import { kitProjectorFor, TeamScores } from "@/games/kit/projector";
import { Avatar, BadgeEmblem } from "@/components/motivation/avatar";
import { AnswerTiles } from "@/games/kit/answer-tiles";
import { playSound, useMute } from "@/games/kit/sound";
import { confetti } from "@/games/kit/confetti";
import { BTN, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { livePost, ordinal, useLiveFeed } from "./live-feed";
import { reteachChallengeAction } from "@/app/games/live-actions";

const MEDAL: Record<string, { icon: string; cls: string }> = {
  gold: { icon: "🥇", cls: "bg-amber-100 ring-amber-300" },
  silver: { icon: "🥈", cls: "bg-slate-100 ring-slate-300" },
  bronze: { icon: "🥉", cls: "bg-orange-100 ring-orange-300" },
};

export function LiveHost({ initial, qr, joinUrl }: { initial: HostView; qr: { total: number; d: string }; joinUrl: string }) {
  const t = useT();
  const lang = useLang();
  const { view: v, setView, online } = useLiveFeed<HostView>(initial.id, "host", initial);
  const [now, setNow] = useState(() => Date.now());
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [reteach, setReteach] = useState<string | null>(null);
  const { muted, toggle } = useMute();
  const meta = gameMeta(v.mode);
  const [custom, setCustom] = useState<FC<ProjectorViewProps> | null>(null);
  // the game's own projector screen, if it has one (its code loads only now)
  useEffect(() => { let on = true; GAME_LOADERS[v.mode as GameId]?.().then((m) => { if (on && m.ProjectorView) setCustom(() => m.ProjectorView!); }).catch(() => {}); return () => { on = false; }; }, [v.mode]);
  const Projector = custom ?? kitProjectorFor(v.features ?? {});
  const pstate: ProjectorState = useMemo(() => ({
    mode: v.mode, status: v.status, paused: v.paused, index: v.index, total: v.total, board: v.board, field: v.field ?? null, teams: v.teams ?? null,
    rope: v.rope ?? null, events: v.events ?? [], top: Math.max(0, ...(v.field ?? v.board).map((r) => r.points)),
  }), [v]);
  const feed: ProjectorFeedCompat = useMemo(() => ({
    status: v.status, index: v.index, total: v.total, board: v.board,
    racers: (v.field ?? v.board).map((r) => { const l = teamLetter(r.team); return { name: r.name, points: r.points, rank: r.rank, ...(l ? { team: l } : {}) }; }),
  }), [v]);

  useEffect(() => { setSeenAt(Date.now()); }, [v]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  useEffect(() => { if (v.status === "FINISHED") { playSound("win"); confetti({ pieces: 80 }); } }, [v.status]);
  useEffect(() => { if (v.status === "REVEAL") playSound("power"); }, [v.status, v.index]);

  const act = async (action: string) => {
    setErr(null); setBusy(true);
    const r = await livePost<HostView>(v.id, { as: "host", action });
    setBusy(false);
    if (r.ok) setView(r.data); else setErr(r.data.error === "offline" ? t("No connection. Trying again…") : r.data.error ?? t("Something went wrong. Try again."));
  };
  const doReteach = async () => {
    if (!v.savedId) return;
    setBusy(true);
    const r = await reteachChallengeAction(v.savedId);
    setBusy(false);
    setReteach(r.error ?? t("Reteach added {n} skills to the My Work of {s} students.", { n: r.assigned ?? 0, s: r.students ?? 0 }));
  };

  const left = v.leftMs === null ? null : Math.max(0, Math.ceil((v.leftMs - (v.paused ? 0 : now - seenAt)) / 1000));
  const big = "min-h-14 px-6 text-lg";
  return (
    <div className="space-y-5" data-testid="live-host">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold text-brand-navy">
          {meta && <span aria-hidden="true" className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${meta.color}`}>{meta.icon}</span>}
          <span className="truncate">{v.title}</span>
        </h1>
        <span className="flex items-center gap-2">
          {!online && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900" role="status">{t("Reconnecting…")}</span>}
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">{t("Code")}: <span className="font-mono" dir="ltr">{v.code}</span></span>
          <button type="button" onClick={toggle} aria-pressed={muted} aria-label={muted ? t("Sound off") : t("Sound on")} className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg ring-1 ring-slate-200">{muted ? "🔇" : "🔊"}</button>
        </span>
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{err}</p>}

      {v.status === "LOBBY" && (
        <section className="grid items-center gap-8 rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-6 text-white shadow-xl sm:p-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-lg text-white/85">{t("Scan the QR code, or open Join Live and type the code")}</p>
            <p className="mt-1 break-all text-sm text-white/70" dir="ltr">{joinUrl}</p>
            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-white/70">{t("Code")}</p>
            <p className="font-mono text-6xl font-bold tracking-[0.2em] sm:text-8xl" dir="ltr" data-testid="live-code">{v.code}</p>
            <p className="mt-4 text-2xl font-semibold" data-testid="joined">{t("{n} of {total} joined", { n: v.joined, total: v.expected })}</p>
            <button type="button" onClick={() => act("start")} disabled={!v.joined || busy} className={`${BTN} ${big} mt-5 bg-brand-gold text-brand-navy hover:brightness-105 disabled:opacity-50`}>▶ {t("Start game")}</button>
          </div>
          <div className="mx-auto rounded-3xl bg-white p-4 shadow-lg">
            <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className="h-64 w-64 sm:h-80 sm:w-80" shapeRendering="crispEdges" role="img" aria-label={t("QR code to join the game")}><rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" /></svg>
          </div>
          <ul className="flex flex-wrap gap-2 lg:col-span-2" aria-live="polite">{(v.lobby?.length ? v.lobby : v.names.map((name) => ({ name, avatar: null, badge: null }))).map((r) => <li key={r.name} className="animate-pop inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pe-4 ps-1 font-semibold ring-1 ring-white/30"><Avatar avatar={r.avatar} size={32} /><bdi>{r.name}</bdi><BadgeEmblem code={r.badge} size={16} /></li>)}</ul>
        </section>
      )}

      {(v.status === "QUESTION" || v.status === "REVEAL") && v.question && (
        <section className={`grid gap-5 ${v.boardHidden || Projector ? "" : "lg:grid-cols-[minmax(0,1fr)_22rem]"}`}>
          {/* a game picture (rockets, rope…) goes full width above the question; Hide board hides it too */}
          {!v.boardHidden && Projector && (
            <div aria-label={t("Live Board")} role="region" className="order-first space-y-3" data-testid="projector-view">
              <Projector state={pstate} feed={feed} t={t} />
              <Events events={v.events ?? []} />
            </div>
          )}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full bg-white px-4 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-200">{t("Question {n} of {total}", { n: v.index + 1, total: v.total })} · <bdi dir="ltr">{v.question.skillName}</bdi></span>
              {v.status === "QUESTION" ? (
                <span role="timer" className={`grid h-20 w-20 place-items-center rounded-full text-4xl font-bold text-white shadow-lg ${v.paused ? "bg-slate-400" : left !== null && left <= 5 ? "animate-pop bg-red-500" : "bg-brand-purple"}`} dir="ltr">{v.paused ? "⏸" : left}</span>
              ) : <span className="rounded-full bg-emerald-100 px-4 py-1.5 font-semibold text-emerald-900">{t("Answer")}</span>}
              <span className="rounded-full bg-white px-4 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-200" data-testid="answered">{t("{n} of {total} answered", { n: v.answered, total: v.joined })}</span>
            </div>
            {v.paused && <p role="status" className="rounded-2xl bg-amber-50 p-3 text-center text-lg font-semibold text-amber-900 ring-1 ring-amber-200">⏸ {t("Paused")}</p>}
            <h2 dir="ltr" lang="en" className="rounded-3xl bg-white p-6 text-center text-2xl font-semibold leading-snug text-slate-900 shadow ring-1 ring-slate-200 sm:text-3xl">{v.question.stem}</h2>
            {v.levelMode === "LEVEL" && <p className="text-center text-sm text-slate-500">{t("Each student sees a question at their own level.")}</p>}
            <AnswerTiles big options={v.question.options ?? []} disabled onPick={() => {}} reveal={v.status === "REVEAL" ? { right: v.question.rightLabel, picked: null } : null} />
            {v.status === "REVEAL" && v.question.picks && (
              <p className="text-center text-sm text-slate-600" dir="ltr">{(v.question.options ?? []).map((o) => `${o.text}: ${v.question!.picks![o.label] ?? 0}`).join(" · ")}</p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              {v.status === "QUESTION" && <button type="button" onClick={() => act(v.paused ? "resume" : "pause")} disabled={busy} className={`${BTN_SECONDARY} ${big}`}>{v.paused ? `▶ ${t("Resume")}` : `⏸ ${t("Pause")}`}</button>}
              <button type="button" onClick={() => act("toggle-board")} disabled={busy} className={`${BTN_SECONDARY} ${big}`} aria-pressed={v.boardHidden}>{v.boardHidden ? t("Show board") : t("Hide board")}</button>
              {v.status === "QUESTION"
                ? <button type="button" onClick={() => act("reveal")} disabled={busy} className={`${BTN_PRIMARY} ${big}`}>{t("Show answer")}</button>
                : <button type="button" onClick={() => act("next")} disabled={busy} className={`${BTN_PRIMARY} ${big}`}>{v.index + 1 >= v.total ? `🏆 ${t("See results")}` : `${t("Next")} ▶`}</button>}
            </div>
          </div>
          {!v.boardHidden && !Projector && (
            <aside aria-labelledby="board-h" className="rounded-3xl bg-white p-4 shadow ring-1 ring-slate-200">
              <h3 id="board-h" className="flex items-center gap-2 text-lg font-semibold text-brand-navy"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />{t("Live Board")}</h3>
              {v.teams && <div className="mt-3"><TeamScores teams={v.teams} t={t} /></div>}
              <ol className="mt-3 space-y-1.5" aria-live="polite">
                {v.board.map((b) => (
                  <li key={b.name} className={`flex items-center gap-2 rounded-xl px-3 py-2 ring-1 transition-all ${b.medal ? MEDAL[b.medal].cls : "bg-slate-50 ring-slate-100"}`}>
                    <span className="w-7 text-center font-semibold text-slate-600" dir="ltr">{b.medal ? <span aria-label={ordinal(b.rank, lang)}>{MEDAL[b.medal].icon}</span> : b.rank}</span>
                    <Avatar avatar={b.avatar} size={28} />
                    <span className="flex min-w-0 flex-1 items-center gap-1"><bdi className="truncate font-semibold text-brand-navy">{b.name}</bdi><BadgeEmblem code={b.badge} size={16} /></span>
                    {b.move > 0 && <span className="text-sm font-semibold text-emerald-600" aria-label={t("up {n}", { n: b.move })} dir="ltr">▲{b.move}</span>}
                    {b.move < 0 && <span className="text-sm font-semibold text-red-500" aria-label={t("down {n}", { n: -b.move })} dir="ltr">▼{-b.move}</span>}
                    <span className="font-mono font-semibold tabular-nums" dir="ltr">{b.points}</span>
                  </li>
                ))}
              </ol>
              {v.cheers.length > 0 && (
                <ul className="mt-3 space-y-1" aria-live="polite">
                  {v.cheers.map((c, i) => <li key={`${c.name}${c.to}${i}`} className="animate-pop rounded-xl bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900">🎉 {t("{name} jumped from {from} to {to}!", { name: c.name, from: ordinal(c.from, lang), to: ordinal(c.to, lang) })}</li>)}
                </ul>
              )}
              <Events events={v.events ?? []} />
            </aside>
          )}
        </section>
      )}

      {v.status === "FINISHED" && v.results && (
        <section className="space-y-5">
          <div className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-6 text-center text-white shadow-xl sm:p-8">
            {v.results.teams && <p className="mb-4 text-2xl font-semibold" data-testid="team-winner">{v.results.teams.winner === null ? t("It's a tie!") : t("{team} wins!", { team: t(v.results.teams.teams[v.results.teams.winner].name) })}</p>}
            {v.results.teams && <div className="mx-auto mb-5 max-w-md"><TeamScores teams={v.results.teams.teams} t={t} /></div>}
            <h2 className="text-3xl font-semibold">🏆 {t("Top players")}</h2>
            <div className="mt-6 flex items-end justify-center gap-3 sm:gap-6">
              {[1, 0, 2].map((ix) => v.results!.top[ix] && (
                <div key={ix} className="animate-pop w-28 sm:w-36" style={{ animationDelay: `${ix * 200}ms` }}>
                  <p className="text-5xl" aria-hidden="true">{["🥇", "🥈", "🥉"][ix]}</p>
                  <span className="mt-1 inline-block"><Avatar avatar={v.results!.top[ix].avatar} size={ix === 0 ? 64 : 48} /></span>
                  <p className="mt-1 flex items-center justify-center gap-1 text-xl font-semibold"><bdi className="truncate">{v.results!.top[ix].name}</bdi><BadgeEmblem code={v.results!.top[ix].badge} size={18} /></p>
                  <div className={`mt-2 grid place-items-center rounded-t-2xl bg-white/20 font-mono text-lg font-semibold ${ix === 0 ? "h-36" : ix === 1 ? "h-24" : "h-16"}`} dir="ltr">{v.results!.top[ix].points}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-brand-navy">{t("Class score by skill")}</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {v.results.skills.map((k) => (
                <li key={k.skillId} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ring-1 ${k.low ? "bg-orange-50 ring-orange-200" : "bg-emerald-50 ring-emerald-200"}`}>
                  <bdi dir="ltr" className="min-w-0 truncate font-semibold text-brand-navy">{k.skillName}</bdi>
                  <span className={`font-semibold ${k.low ? "text-orange-700" : "text-emerald-700"}`} dir="ltr">{k.pct === null ? "—" : `${k.pct}%`}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setShowStudents((x) => !x)} aria-expanded={showStudents} className={BTN_SECONDARY}>{showStudents ? t("Hide each student") : t("Show each student")}</button>
              <button type="button" onClick={doReteach} disabled={!v.savedId || busy || !!reteach} className={BTN_PRIMARY}>🔁 {t("Reteach")}</button>
              {v.savedId && <Link prefetch={false} href={`/teacher/games/${v.savedId}`} className={BTN_SECONDARY}>{t("Open results")}</Link>}
            </div>
            <p className="mt-2 text-sm text-slate-600">{t("Reteach adds every skill under 70% to that student's My Work.")}</p>
            {reteach && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-emerald-200">{reteach}</p>}
            {showStudents && <StudentTable results={v.results} />}
          </div>
        </section>
      )}

      {v.status !== "FINISHED" && <p className="text-end"><button type="button" onClick={() => { if (confirm(t("End the game now?"))) void act("end"); }} className="min-h-11 text-sm font-semibold text-slate-500 underline">{t("End the game")}</button></p>}
    </div>
  );
}

export function StudentTable({ results }: { results: NonNullable<HostView["results"]> }) {
  const t = useT();
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-start text-sm">
        <thead><tr className="text-slate-500">
          <th scope="col" className="py-2 pe-3 text-start font-semibold">{t("Student")}</th>
          <th scope="col" className="py-2 pe-3 text-start font-semibold">{t("Points")}</th>
          {results.skills.map((k) => <th key={k.skillId} scope="col" className="py-2 pe-3 text-start font-semibold"><bdi dir="ltr">{k.skillName}</bdi></th>)}
        </tr></thead>
        <tbody>
          {results.students.map((st) => (
            <tr key={st.studentId} className="border-t border-slate-100">
              <td className="py-2 pe-3 font-semibold text-brand-navy"><bdi>{st.fullName || st.name}</bdi></td>
              <td className="py-2 pe-3 font-mono" dir="ltr">{st.points}</td>
              {results.skills.map((k) => {
                const c = st.bySkill[k.skillId];
                return <td key={k.skillId} className={`py-2 pe-3 font-semibold ${c && c.pct < 70 ? "text-orange-700" : "text-emerald-700"}`} dir="ltr">{c ? `${c.correct}/${c.total} (${c.pct}%)` : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chest events on the board: "Omar took 300 points from Sara!" (newest first). */
function Events({ events }: { events: LiveEvent[] }) {
  const t = useT();
  if (!events.length) return null;
  return (
    <ul className="mt-3 space-y-1" aria-live="polite" data-testid="board-events">
      {events.slice(0, 3).map((e) => (
        <li key={`${e.at}${e.name}${e.kind}`} className="animate-pop rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900">
          {e.kind === "steal" && e.other ? `🧲 ${t("{name} took {n} points from {other}!", { name: e.name, n: e.points, other: e.other })}`
            : e.kind === "double" ? `✖️2 ${t("{name} doubled their points! +{n}", { name: e.name, n: e.points })}`
            : `💰 ${t("{name} found {n} bonus points!", { name: e.name, n: e.points })}`}
        </li>
      ))}
    </ul>
  );
}
