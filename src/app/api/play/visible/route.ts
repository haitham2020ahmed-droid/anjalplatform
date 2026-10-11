import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { MAX_SKILLS, playButtons } from "@/server/game/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🎲 GET ?skills=a,b,c → { play: { [skillId]: boolean } }: whether My Work shows the Play button for each skill
 * (at least one game has enough fitting questions). Students only; only their own skills can be true.
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  if (actor.role !== "STUDENT") return NextResponse.json({ error: "Students play games." }, { status: 403 });
  const ids = String(new URL(req.url).searchParams.get("skills") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, MAX_SKILLS);
  return NextResponse.json({ play: await playButtons(repo, actor, ids) }, { headers: { "Cache-Control": "private, max-age=30" } });
}
