import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { FLUENCY_BUSY_REASON, FLUENCY_BUSY_SECONDS, MAX_AUDIO_BYTES, NotHeardError, PRACTICE_KINDS, reserveFluencyBytes, scoreReading, type PracticeKind } from "@/server/fluency/coach";
import { aiEnv } from "@/server/ai/env";
import { withCappedBody, BodyTooLargeError } from "@/server/lib/capped-body";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini may take up to 80 s on a long reading (hosts that honour it: the function is not cut earlier) */
export const maxDuration = 100;

/**
 * POST /api/fluency/score (multipart: key, mode, seconds, audio; optional kind = MINUTE|PASSAGE|ECHO|PHRASED|REPEATED|
 * DRILL, sentence (ECHO), grid (DRILL, JSON), attempt (1+: the same recording sent again after "heard but unclear"),
 * rereadOf (a practice re-read of that reading: compared, never stored or counted), requestId (r4: one id per
 * recording, the same on every retry: a retry of a reading already scored gets the same result back)) — the student's
 * recording is scored in memory and dropped (never stored). 200 → the result; 202 → wait N seconds and send again
 * (the school's AI limits); 503 → the server holds too much audio right now: send again in a few seconds.
 */
export async function POST(req: Request) {
  const { t } = await getT();
  const actor = await apiActor();
  if (!actor || actor.role !== "STUDENT") return NextResponse.json({ error: t("Please sign in as a student.") }, { status: 401 });
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: t("Open the platform at its own address and try again.") }, { status: 403 }); }
  const maxBytes = MAX_AUDIO_BYTES + 100_000;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return NextResponse.json({ error: t("The recording is too long.") }, { status: 413 });
  // r4 (memory): room for this recording is reserved BEFORE the body is read — a busy server answers at once and
  // buffers nothing (no Content-Length: the largest allowed upload is reserved)
  const lease = reserveFluencyBytes(declared > 0 ? declared : maxBytes);
  if (!lease) return NextResponse.json({ status: "WAIT", busy: true, seconds: FLUENCY_BUSY_SECONDS, reason: t(FLUENCY_BUSY_REASON), error: t("The coach is busy. Your recording is sent again in a few seconds.") }, { status: 503, headers: { "Retry-After": String(FLUENCY_BUSY_SECONDS) } });
  try {
    let fields: Record<string, string> = {};
    let audio: Uint8Array;
    let mime: string;
    {
      let form: FormData | null;
      // r89: the Content-Length check above trusts the client; this enforces the same limit on the real bytes read
      try { form = await withCappedBody(req, maxBytes).formData(); }
      catch (e) {
        if (e instanceof BodyTooLargeError) return NextResponse.json({ error: t("The recording is too long.") }, { status: 413 });
        return NextResponse.json({ error: t("The recording did not arrive. Try again.") }, { status: 400 });
      }
      const blob = form.get("audio");
      if (!(blob instanceof Blob)) return NextResponse.json({ error: t("The recording did not arrive. Try again.") }, { status: 400 });
      for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
      mime = blob.type || "audio/wav";
      // r4: ONE copy of the audio is kept (a view on the blob's bytes; the base64 for the AI is made from it once);
      // the form is dropped right away so its buffer can be freed
      audio = new Uint8Array(await blob.arrayBuffer());
      form = null;
    }
    const rawKind = String(fields.kind ?? "");
    const kind: PracticeKind | undefined = PRACTICE_KINDS.includes(rawKind as PracticeKind) ? (rawKind as PracticeKind) : undefined;
    let grid: unknown = undefined;
    if (kind === "DRILL") { try { grid = JSON.parse(String(fields.grid ?? "null")); } catch { grid = null; } }
    const mode = kind ? (kind === "MINUTE" ? "MINUTE" : "PASSAGE") : String(fields.mode) === "PASSAGE" ? "PASSAGE" : "MINUTE";
    const r = await scoreReading(repo, actor, {
      key: String(fields.key ?? ""), mode, kind, sentence: fields.sentence === undefined ? undefined : Number(fields.sentence), grid,
      rereadOf: fields.rereadOf ? String(fields.rereadOf).slice(0, 64) : undefined, requestId: fields.requestId ? String(fields.requestId).slice(0, 64) : undefined,
      seconds: Number(fields.seconds) || 0, voiced: Math.max(0, Math.min(600, Number(fields.voiced) || 0)), attempt: Math.max(0, Math.min(3, Math.round(Number(fields.attempt) || 0))),
      audio, mime, reserved: true,
    }, aiEnv());
    fields = {};
    if (r.status === "WAIT") return NextResponse.json({ ...r, reason: t(r.reason) }, { status: 202, headers: { "Retry-After": String(r.seconds) } });
    return NextResponse.json(r.result.notice ? { ...r, result: { ...r.result, notice: t(r.result.notice) } } : r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // NOT_HEARD: no reading at all → record again; HEARD_UNCLEAR: a voice was measured → the page sends the same recording again
    if (e instanceof ValidationError) return NextResponse.json({ error: t(e.message), ...(e instanceof NotHeardError ? { code: e.code } : {}) }, { status: 422 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: t("Not found.") }, { status: 404 });
    throw e;
  } finally {
    lease.release();
  }
}
