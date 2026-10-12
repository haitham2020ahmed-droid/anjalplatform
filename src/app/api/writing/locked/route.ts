import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { autosaveLocked, flagLocked, leaveLocked, openLocked, startLocked, submitLocked } from "@/server/writing/locked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🔒 The locked writing page talks to the server here (JSON; also sent with keepalive when the page is hidden):
 *   start · open · save · leave · flag · submit · timeup. Every rule (leaves, the time limit) is decided on the server.
 */
export async function POST(req: Request) {
  const actor = await apiActor();
  if (!actor || actor.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  if (Number(req.headers.get("content-length") ?? 0) > 200_000) return NextResponse.json({ error: "Too long." }, { status: 413 });
  let body: { op?: unknown; taskId?: unknown; text?: unknown; kind?: unknown; detail?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const taskId = String(body.taskId ?? ""), text = typeof body.text === "string" ? body.text : undefined;
  const now = new Date();
  try {
    switch (String(body.op ?? "")) {
      case "start": return NextResponse.json(await startLocked(repo, actor, taskId, now));
      case "open": return NextResponse.json(await openLocked(repo, actor, taskId, now));
      case "save": return NextResponse.json(await autosaveLocked(repo, actor, taskId, text ?? "", now));
      case "leave": return NextResponse.json(await leaveLocked(repo, actor, taskId, String(body.kind ?? ""), text, now));
      case "flag": return NextResponse.json(await flagLocked(repo, actor, taskId, String(body.kind ?? ""), body.detail ? String(body.detail) : null, now));
      case "submit": return NextResponse.json(await submitLocked(repo, actor, taskId, text ?? "", now, false));
      case "timeup": return NextResponse.json(await submitLocked(repo, actor, taskId, text ?? "", now, true));
      default: return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
