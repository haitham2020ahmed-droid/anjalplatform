import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { MAX_IMAGE_BYTES, saveQuestionImage } from "@/server/admin/question-images";
import { withCappedBody, BodyTooLargeError } from "@/server/lib/capped-body";

export const runtime = "nodejs";

/** Upload a question image (already resized by the browser). Returns its id for the editor. */
export async function POST(req: Request) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!can(actor, "questions:edit")) return NextResponse.json({ error: "You cannot edit questions." }, { status: 403 });
  const maxBytes = MAX_IMAGE_BYTES + 64_000;
  if (Number(h.get("content-length") ?? 0) > maxBytes) return NextResponse.json({ error: "The image is larger than 1 MB." }, { status: 413 });
  try {
    // r89: the Content-Length check above trusts the client; this enforces the same limit on the real bytes read
    const form = await withCappedBody(req, maxBytes).formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
    const r = await saveQuestionImage(repo, actor, new Uint8Array(await file.arrayBuffer()), String(form.get("alt") ?? ""));
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ error: "The image is larger than 1 MB." }, { status: 413 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
