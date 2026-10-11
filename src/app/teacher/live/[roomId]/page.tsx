import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LiveHost } from "@/components/game/live-host";
import { EmptyState, BTN_PRIMARY } from "@/components/ui-kit";
import { getActor, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { hostRoom } from "@/server/game/live-challenge";
import { hostView } from "@/server/game/rooms";
import { qrPath } from "@/lib/qr";
import { getT } from "@/i18n/server";

export const metadata = { title: "Live Challenge" };

/** 🏁 The projector screen of a running Live Challenge (only the teacher who started it). */
export default async function LiveHostPage({ params }: { params: Promise<{ roomId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { roomId } = await params;
  let room;
  try { room = hostRoom(actor, roomId); }
  catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
    return (
      <AppShell name={String(me.displayName)}>
        <EmptyState icon="🏁" title="This Live Challenge is not open." text="It has ended or it belongs to another teacher." />
        <p className="mt-4 text-center"><Link prefetch={false} href="/teacher/games" className={BTN_PRIMARY}>{t("Live Challenge")}</Link></p>
      </AppShell>
    );
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const joinUrl = `${proto}://${host}/play/${room.code}`;
  return (
    <AppShell name={String(me.displayName)}>
      <LiveHost initial={hostView(room)} qr={qrPath(joinUrl)} joinUrl={joinUrl} />
    </AppShell>
  );
}
