import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { globalSearch } from "@/server/search";

export const runtime = "nodejs";

/** 🔎 Jump-to search for staff: students, classes and skills they may open (names only). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(String(actor.role))) return NextResponse.json({ results: [] }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  return NextResponse.json({ results: await globalSearch(repo, actor, q) }, { headers: { "Cache-Control": "no-store" } });
}
