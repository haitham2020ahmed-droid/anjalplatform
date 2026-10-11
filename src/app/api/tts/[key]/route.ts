import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { findAudioMeta, parseRange, readAudio } from "@/server/tts/store";
import { isSpeechKey } from "@/lib/tts/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🔊 Pre-generated read-aloud audio, for signed-in users. `key` = SHA-256 of the spoken text (see src/lib/tts/text.ts).
 *   ?meta=1  → { audioUrl, durationMs, timings } (404 when no audio was made: the player uses the device's voice)
 *   (no meta) → the audio bytes, with Range support (iPhone/iPad Safari needs it); the URL carries the row id (?v=),
 *              so it never changes and can be cached for a long time.
 * Texts are school content (passages, questions); nothing about a student is stored or returned.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const key = (await params).key;
  if (!isSpeechKey(key)) return new NextResponse("Not found.", { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("meta")) {
    const m = await findAudioMeta(repo, key);
    if (!m) return NextResponse.json({ found: false }, { status: 404, headers: { "Cache-Control": "private, max-age=300" } });
    return NextResponse.json({ found: true, audioUrl: `/api/tts/${key}?v=${encodeURIComponent(m.id)}`, mime: m.mime, durationMs: m.durationMs, timings: m.timings }, { headers: { "Cache-Control": "private, max-age=3600" } });
  }
  const a = await readAudio(repo, key);
  if (!a) return new NextResponse("Not found.", { status: 404 });
  const size = a.bytes.length;
  const base = { "Content-Type": a.mime, "Accept-Ranges": "bytes", "Cache-Control": url.searchParams.get("v") === a.id ? "private, max-age=31536000, immutable" : "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  const range = parseRange(req.headers.get("range"), size);
  if (range === "bad") return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  if (range) {
    const body = Buffer.from(a.bytes.subarray(range.start, range.end + 1));
    return new NextResponse(body, { status: 206, headers: { ...base, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(body.length) } });
  }
  return new NextResponse(Buffer.from(a.bytes), { headers: { ...base, "Content-Length": String(size) } });
}
