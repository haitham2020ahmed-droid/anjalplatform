import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { aiSettings } from "@/server/ai/engine";
import { isTtsSpeed } from "@/lib/tts/text";
import { ttsEnv } from "@/server/tts/env";
import { MAX_ON_DEMAND_CHARS, onDemandTts } from "@/server/tts/on-demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🔊 POST /api/tts { text, speed: "slow" | "normal" } — makes the natural voice of a text the first time it is listened
 * to (see src/server/tts/on-demand.ts) and answers like GET /api/tts/<key>?meta=1. Signed-in users only. Only the
 * text is sent to the provider; who asked is never stored or sent. 202 = busy or off: keep the device's voice.
 */
export async function POST(req: Request) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address." }, { status: 403 }); }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ON_DEMAND_CHARS * 4 + 200) return NextResponse.json({ found: false, status: "TOO_LONG" }, { status: 202 });
  const body = (await req.json().catch(() => null)) as { text?: unknown; speed?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const speed = isTtsSpeed(body?.speed) ? body.speed : "normal";
  if ((await aiSettings(repo, actor.schoolId ?? null)).provider === "off") return NextResponse.json({ found: false, status: "OFF" }, { status: 202 });
  const r = await onDemandTts(repo, ttsEnv(), text, speed);
  if (r.status !== "OK") return NextResponse.json({ found: false, status: r.status }, { status: 202, headers: { "Cache-Control": "no-store" } });
  const m = r.meta;
  return NextResponse.json({ found: true, speed, audioUrl: `/api/tts/${r.key}?v=${encodeURIComponent(m.id)}`, mime: m.mime, durationMs: m.durationMs, timings: m.timings }, { headers: { "Cache-Control": "no-store" } });
}
