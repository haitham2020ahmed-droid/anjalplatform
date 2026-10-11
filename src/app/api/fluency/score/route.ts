import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { MAX_AUDIO_BYTES, PRACTICE_KINDS, scoreReading, type PracticeKind } from "@/server/fluency/coach";
import { aiEnv } from "@/server/ai/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fluency/score (multipart: key, mode, seconds, audio; optional kind = MINUTE|PASSAGE|ECHO|PHRASED|REPEATED|
 * DRILL, sentence (ECHO), grid (DRILL, JSON)) — the student's recording is scored in memory and dropped (never
 * stored). 200 → the result; 202 → wait N seconds and send again (the school's AI limits).
 */
export async function POST(req: Request) {
  const actor = await apiActor();
  if (!actor || actor.role !== "STUDENT") return NextResponse.json({ error: "Please sign in as a student." }, { status: 401 });
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES + 100_000) return NextResponse.json({ error: "The recording is too long." }, { status: 413 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "The recording did not arrive. Try again." }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return NextResponse.json({ error: "The recording did not arrive. Try again." }, { status: 400 });
  try {
    const rawKind = String(form.get("kind") ?? "");
    const kind: PracticeKind | undefined = PRACTICE_KINDS.includes(rawKind as PracticeKind) ? (rawKind as PracticeKind) : undefined;
    let grid: unknown = undefined;
    if (kind === "DRILL") { try { grid = JSON.parse(String(form.get("grid") ?? "null")); } catch { grid = null; } }
    const mode = kind ? (kind === "MINUTE" ? "MINUTE" : "PASSAGE") : String(form.get("mode")) === "PASSAGE" ? "PASSAGE" : "MINUTE";
    const r = await scoreReading(repo, actor, { key: String(form.get("key") ?? ""), mode, kind, sentence: form.get("sentence") === null ? undefined : Number(form.get("sentence")), grid, seconds: Number(form.get("seconds")) || 0, audio: new Uint8Array(await audio.arrayBuffer()), mime: audio.type || "audio/wav" }, aiEnv());
    if (r.status === "WAIT") return NextResponse.json(r, { status: 202, headers: { "Retry-After": String(r.seconds) } });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Not found." }, { status: 404 });
    throw e;
  }
}
