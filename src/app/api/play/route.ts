import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { canPlayGameSkill, gameAvailability, soloRound } from "@/server/game/questions";
import { rateGame, recordSoloPlay } from "@/server/game/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
  throw e;
};

/**
 * 🎲 Solo play. GET ?skill=…&games=1 → which games can be played for the skill ("Soon" otherwise);
 * GET ?skill=…&game=… → a new round (questions from the bank at the student's level, never stored).
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const u = new URL(req.url);
  const skill = String(u.searchParams.get("skill") ?? "");
  try {
    if (u.searchParams.get("games")) {
      if (!(await canPlayGameSkill(repo, actor, skill))) throw new ForbiddenError("This skill is not in your work.");
      return NextResponse.json({ games: await gameAvailability(repo, actor.schoolId!, skill) }, { headers: { "Cache-Control": "private, max-age=30" } });
    }
    return NextResponse.json(await soloRound(repo, actor, String(u.searchParams.get("game") ?? ""), skill), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(e); }
}

/** POST { action: "result", roundId, correct, incorrect, points } | { action: "rate", gameId, stars } */
export async function POST(req: Request) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  try {
    if (body.action === "result") return NextResponse.json(await recordSoloPlay(repo, actor, { roundId: String(body.roundId ?? ""), correct: Number(body.correct), incorrect: Number(body.incorrect), points: Number(body.points) }));
    if (body.action === "rate") { await rateGame(repo, actor, String(body.gameId ?? ""), Number(body.stars)); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  } catch (e) { return fail(e); }
}
