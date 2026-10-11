"use client";
/**
 * 📽️ Ready-made projector views for the teacher's screen (Games integration). A game can export its own
 * `ProjectorView` (props: ProjectorViewProps); without one, Live Challenge uses these by the mode's live features:
 *   field → RocketsView (every player's rocket climbs by points), teams → TugView (rope + team points).
 * Code-drawn (CSS/SVG), no images. The student's avatar rides in each rocket; the favorite badge sits by the name.
 */
import type { FC } from "react";
import type { LiveFeatures, LiveTeam, ProjectorViewProps } from "../types";
import { Avatar, BadgeEmblem } from "@/components/motivation/avatar";

/** Rockets race to the Moon: one lane per player, height = points / best points. */
export function RocketsView({ state, t }: ProjectorViewProps) {
  const field = state.field ?? state.board;
  const top = Math.max(1, state.top);
  return (
    <div className="rounded-3xl bg-gradient-to-b bg-linear-to-b from-[#0b1440] to-[#2b3f8f] p-4 text-white shadow" data-testid="projector-rockets">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">🚀 {t("Race to the Moon")}</h3>
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl shadow-[0_0_20px_#fef9c3]">🌕</span>
      </div>
      <ol className="mt-3 flex h-72 items-end gap-1.5 overflow-x-auto pb-1" aria-label={t("Live Board")}>
        {field.map((r) => {
          const h = Math.round(8 + 82 * Math.min(1, r.points / top));
          return (
            <li key={r.name} className="relative flex h-full min-w-10 flex-1 flex-col items-center justify-end" aria-label={`${r.name}: ${r.points}`}>
              <div className="flex flex-col items-center transition-all duration-500" style={{ marginBottom: `${h}%` }}>
                <span aria-hidden="true" className="text-xl leading-none">🚀</span>
                <Avatar avatar={r.avatar} size={26} />
              </div>
              <span className="absolute bottom-0 flex max-w-full items-center gap-0.5 truncate text-[11px] font-semibold"><bdi className="truncate">{r.name}</bdi><BadgeEmblem code={r.badge} size={11} /></span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Team Tug: the rope moves toward the team ahead; team points = the average of its members. */
export function TugView({ state, t }: ProjectorViewProps) {
  const teams = state.teams ?? [];
  const rope = state.rope ?? 0;
  return (
    <div dir="ltr" className="space-y-3 rounded-3xl bg-white p-4 shadow ring-1 ring-slate-200" data-testid="projector-tug">
      <TeamScores teams={teams} t={t} />
      <div className="relative h-16 overflow-hidden rounded-2xl bg-slate-100" aria-hidden="true">
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-400" />
        <div className="absolute inset-x-4 top-1/2 h-2 -translate-y-1/2 rounded bg-amber-700/70 transition-transform duration-500" style={{ transform: `translate(${rope * 30}%, -50%)` }}>
          <span className="absolute left-1/2 top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded bg-red-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {teams.map((tm) => (
          <ul key={tm.id} className="space-y-1">
            {(state.field ?? state.board).filter((r) => r.team === tm.id).slice(0, 6).map((r) => (
              <li key={r.name} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-sm"><Avatar avatar={r.avatar} size={22} /><bdi className="min-w-0 flex-1 truncate font-semibold">{r.name}</bdi><BadgeEmblem code={r.badge} size={12} /><span className="font-mono" dir="ltr">{r.points}</span></li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

/** The two teams' points side by side (projector, board and devices). */
export function TeamScores({ teams, t, mine }: { teams: LiveTeam[]; t: ProjectorViewProps["t"]; mine?: number | null }) {
  if (!teams.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="team-scores">
      {teams.map((tm) => (
        <div key={tm.id} className={`rounded-2xl px-3 py-2 text-center text-white ${mine === tm.id ? "ring-4 ring-amber-300" : ""}`} style={{ background: tm.color }}>
          <p className="text-sm font-semibold">{t(tm.name)} · {t("{n} players", { n: tm.members })}</p>
          <p className="font-mono text-2xl font-bold" dir="ltr">{tm.points}</p>
        </div>
      ))}
    </div>
  );
}

/** The kit view for a mode's features (null = the default Live Board). */
export function kitProjectorFor(f: LiveFeatures): FC<ProjectorViewProps> | null {
  if (f.teams) return TugView;
  if (f.field) return RocketsView;
  return null;
}
