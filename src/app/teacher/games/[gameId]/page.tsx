import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { GameHost } from "@/components/game/host";
import { ChallengeResults } from "@/components/game/challenge-results";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { hostView } from "@/server/game/live";
import { challengeResults } from "@/server/game/live-challenge";
import { qrPath } from "@/lib/qr";
import { hostGameAction } from "@/app/games/actions";

export const metadata = { title: "Live game" };

/** The host screen of an older live game (show it on the board), or the saved results of a Live Challenge. */
export default async function HostPage({ params }: { params: Promise<{ gameId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { gameId } = await params;
  const row = await repo.findUnique("LiveGame", { id: gameId });
  if (row?.mode) {
    // Games Part 1: a finished Live Challenge — results by skill and Reteach (own classes; checked on the server)
    const data = await challengeResults(repo, actor, gameId);
    return (
      <AppShell name={String(me.displayName)}>
        <ReportHeader back={{ href: "/teacher/games", label: "Live Challenge" }} icon="🏁" title={data.title} subtitle={`${data.summary.questions} questions`} who={data.summary.className} when={data.date} />
        <ChallengeResults data={data} canReteach={actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN"} />
      </AppShell>
    );
  }
  const v = await hostView(repo, actor, gameId);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const joinUrl = `${proto}://${host}/play/${v.code}`;
  return (
    <AppShell name={String(me.displayName)}>
      <GameHost initial={v} qr={qrPath(joinUrl)} joinUrl={joinUrl} act={hostGameAction} />
    </AppShell>
  );
}
