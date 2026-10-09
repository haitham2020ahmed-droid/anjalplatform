import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { MAX_AUDIO, recording, saveRecording } from "@/server/teacher/writing";

export const runtime = "nodejs";

/** 🎙 Listen to a reading-aloud recording (the student, or the class's teachers / admin). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  try {
    const r = await recording(repo, actor, String(sp.get("task") ?? ""), String(sp.get("student") ?? ""));
    if (!r) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(Buffer.from(r.bytes), { headers: { "Content-Type": r.type, "Cache-Control": "private, no-store", "Content-Length": String(r.bytes.length) } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse("Forbidden", { status: 403 }); throw e; }
}

/** 🎙 The student uploads the recording (multipart: task, audio). */
export async function POST(req: Request) {
  const actor = await apiActor();
  if (!actor || actor.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO + 100_000) return NextResponse.json({ error: "The recording is too long." }, { status: 413 });
  try {
    const f = await req.formData();
    const file = f.get("audio");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No recording." }, { status: 400 });
    await saveRecording(repo, actor, String(f.get("task") ?? ""), new Uint8Array(await file.arrayBuffer()), file.type || "audio/webm");
    return NextResponse.json({ ok: true });
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e; }
}
