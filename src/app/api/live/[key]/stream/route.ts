import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { hostRoom, playerRoom } from "@/server/game/live-challenge";
import { subscribe, type Room } from "@/server/game/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

/**
 * 🏁 Live Challenge stream (Server-Sent Events): small JSON views pushed when something changes. The browser's
 * EventSource reconnects by itself after a dropped connection and gets the current state at once (the rejoin).
 * `Cache-Control: no-transform` keeps compression proxies from holding the events back.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const actor = await apiActor();
  if (!actor) return new Response("Sign in.", { status: 401 });
  const { key } = await params;
  const asHost = new URL(req.url).searchParams.get("as") === "host";
  let room: Room;
  try { room = asHost ? hostRoom(actor, key) : playerRoom(actor, key); }
  catch (e) { if (e instanceof ForbiddenError) return new Response(e.message, { status: 403 }); throw e; }
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (s: string) => { if (open) controller.enqueue(enc.encode(s)); };
      write("retry: 2000\n\n");
      const unsubscribe = subscribe(room, { kind: asHost ? "host" : "player", studentId: asHost ? undefined : actor.studentId!, send: (json) => write(`data: ${json}\n\n`) });
      const beat = setInterval(() => { try { write(": ping\n\n"); } catch { stop(); } }, HEARTBEAT_MS);
      stop = () => { if (!open) return; open = false; clearInterval(beat); unsubscribe(); try { controller.close(); } catch { /* already closed */ } };
      req.signal.addEventListener("abort", () => stop());
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
