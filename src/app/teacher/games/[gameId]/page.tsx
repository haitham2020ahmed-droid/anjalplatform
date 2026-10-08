import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { GameHost } from "@/components/game/host";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { hostView } from "@/server/game/live";
import { qrPath } from "@/lib/qr";
import { hostGameAction } from "@/app/games/actions";

export const metadata = { title: "Live game" };

/** The host screen (show it on the board). */
export default async function HostPage({ params }: { params: Promise<{ gameId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const v = await hostView(repo, actor, (await params).gameId);
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
