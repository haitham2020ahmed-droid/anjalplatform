import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { hostRoom, playerRoom } from "@/server/game/live-challenge";
import { answer, hostAct, hostView, livePower, openChest, playerView, RoomError, type HostAction } from "@/server/game/rooms";
import { isPowerUp } from "@/games/kit/powerups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST_ACTIONS: HostAction[] = ["start", "reveal", "next", "pause", "resume", "toggle-board", "end"];
const fail = (e: unknown) => {
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof RoomError) return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
  throw e;
};

/**
 * 🏁 A Live Challenge screen's state (the polling fallback when the live stream cannot connect).
 * key = the room id (?as=host, the teacher who started it) or the 6-digit code (a joined student of the class).
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const { key } = await params;
  const asHost = new URL(req.url).searchParams.get("as") === "host";
  try {
    return NextResponse.json(asHost ? hostView(hostRoom(actor, key)) : playerView(playerRoom(actor, key), actor.studentId!), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(e); }
}

/** POST { as: "host", action } | { action: "answer", index, response } | { action: "power", id } | { action: "chest", index, pick } */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const { key } = await params;
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  try {
    if (body.as === "host") {
      const action = String(body.action) as HostAction;
      if (!HOST_ACTIONS.includes(action)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
      const room = hostRoom(actor, key);
      hostAct(room, action);
      return NextResponse.json(hostView(room));
    }
    const room = playerRoom(actor, key);
    if (body.action === "answer") return NextResponse.json(answer(room, actor.studentId!, Number(body.index), body.response));
    if (body.action === "power" && isPowerUp(body.id)) return NextResponse.json(livePower(room, actor.studentId!, body.id));
    if (body.action === "chest") return NextResponse.json(openChest(room, actor.studentId!, Number(body.index), Number(body.pick)));
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  } catch (e) { return fail(e); }
}
