import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";

export const dynamic = "force-dynamic";

/** The Bubble sheets forms: opens the chosen test's sheets, grading or typing page (each page checks NAFS access). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const actor = await apiActor();
  if (!actor) return NextResponse.redirect(new URL("/login", url));
  const q = url.searchParams;
  const id = (k: string) => { const v = q.get(k) ?? ""; return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : ""; };
  const test = id("test"), klass = id("class");
  if (!test) return NextResponse.redirect(new URL("/teacher/nafs?tab=marking#sheets", url));
  const go = q.get("go");
  const path = go === "grade" || go === "type" ? `/teacher/nafs/tests/${test}/grade?class=${klass}${go === "type" ? "&mode=type" : ""}` : `/teacher/nafs/tests/${test}/sheets?class=${klass}${q.get("blank") ? "&blank=1" : ""}`;
  return NextResponse.redirect(new URL(path, url));
}
