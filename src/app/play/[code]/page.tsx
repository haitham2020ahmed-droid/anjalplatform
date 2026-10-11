import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GamePlayer } from "@/components/game/player";
import { LivePlayer } from "@/components/game/live-player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { joinGame, playerView } from "@/server/game/live";
import { joinChallenge } from "@/server/game/live-challenge";
import { playerView as livePlayerView } from "@/server/game/rooms";
import { answerGameAction } from "@/app/games/actions";

export const metadata = { title: "Live game" };

/**
 * Opened from the code or the QR code (the device camera opens this link too). Signed-in students only — no
 * name to type. A Live Challenge (in memory) first; otherwise an older live game. Opening it again rejoins.
 */
export default async function PlayGame({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const code = (await params).code;
  let target: string | null = null;
  try {
    const room = await joinChallenge(repo, actor, code);
    if (room) return <AppShell name={String(me.displayName)}><LivePlayer initial={livePlayerView(room, actor.studentId!)} /></AppShell>;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) target = `/play?msg=${encodeURIComponent(e.message)}`; else throw e; }
  if (target) redirect(target);
  let gameId: string;
  try { gameId = await joinGame(repo, actor, code); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) redirect(`/play?msg=${encodeURIComponent(e.message)}`); throw e; }
  const v = await playerView(repo, actor, gameId);
  return <AppShell name={String(me.displayName)}><GamePlayer initial={v} answer={answerGameAction} /></AppShell>;
}
