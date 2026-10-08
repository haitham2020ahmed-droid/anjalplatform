import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GamePlayer } from "@/components/game/player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { joinGame, playerView } from "@/server/game/live";
import { answerGameAction } from "@/app/games/actions";

export const metadata = { title: "Live game" };

/** Opened from the PIN or the QR code: joins the game, then shows it. */
export default async function PlayGame({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  let gameId: string;
  try { gameId = await joinGame(repo, actor, (await params).code); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) redirect(`/play?msg=${encodeURIComponent(e.message)}`); throw e; }
  const v = await playerView(repo, actor, gameId);
  return <AppShell name={String(me.displayName)}><GamePlayer initial={v} answer={answerGameAction} /></AppShell>;
}
